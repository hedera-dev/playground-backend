#!/usr/bin/env bash

PKGDIR="$PWD"

curl -OL https://go.dev/dl/go1.25.4.linux-amd64.tar.gz
tar -xzf go1.25.4.linux-amd64.tar.gz
rm go1.25.4.linux-amd64.tar.gz

source environment

go mod init hedera-playground
go get github.com/hiero-ledger/hiero-sdk-go/v2/sdk@v2.80.0
go mod tidy

echo "Pre-compiling Hiero SDK packages..."
go build -v github.com/hiero-ledger/hiero-sdk-go/v2/sdk/... 2>&1 | tail -5

# ---------------------------------------------------------------------------
# Generate importcfg and collect pre-compiled .a files for direct compilation.
# This allows the compile script to use go tool compile + go tool link directly,
# bypassing go build's module resolution and staleness checks at runtime.
# ---------------------------------------------------------------------------
TOOLDIR=$(go env GOTOOLDIR)
BUILD_CACHE=$(go env GOCACHE)
GOROOT_DIR=$(go env GOROOT)
PKG_STORE="$PKGDIR/pkg-store"
COMPILE_IMPORTCFG="$PKGDIR/compile.importcfg.template"
LINK_IMPORTCFG="$PKGDIR/link.importcfg.template"
mkdir -p "$PKG_STORE"

# --- Step 1: Build a simple program that uses the SDK to get the link importcfg ---
TMPBUILD=$(mktemp -d)
cp go.mod "$TMPBUILD/"
cp go.sum "$TMPBUILD/"

cat > "$TMPBUILD/main.go" << 'GOEOF'
package main

import (
	"fmt"
	"os"
	_ "github.com/hiero-ledger/hiero-sdk-go/v2/sdk"
)

func main() {
	fmt.Fprintln(os.Stdout, "importcfg generator")
}
GOEOF

cd "$TMPBUILD"
GOROOT="$PKGDIR/go" \
GOMODCACHE="$PKGDIR/gopath/pkg/mod" \
GOPATH="$PKGDIR/gopath" \
GOCACHE="$BUILD_CACHE" \
CGO_ENABLED=0 \
GOPROXY=off \
GOSUMDB=off \
go build -x -work -o "$TMPBUILD/gen_binary" ./main.go 2>"$TMPBUILD/go-build-x.log"
cd "$PKGDIR"

WORK_DIR=$(grep '^WORK=' "$TMPBUILD/go-build-x.log" | head -1 | cut -d= -f2)

if [ -z "$WORK_DIR" ] || [ ! -d "$WORK_DIR" ]; then
    echo "WARNING: Could not extract WORK directory, falling back to build-cache only"
    rm -rf "$TMPBUILD"
    mkdir -p build-cache
    cp -r $BUILD_CACHE/* build-cache/ 2>/dev/null || true
    echo "Build cache size: $(du -sh build-cache/ | cut -f1)"
    exit 0
fi

# --- Step 2: Extract the SDK link importcfg as base ---
SDK_LINK_IMPORTCFG="$WORK_DIR/b001/importcfg.link"
SDK_COMPILE_IMPORTCFG="$WORK_DIR/b001/importcfg"

# --- Step 3: Build the compile importcfg (direct imports for go tool compile) ---
# Start with the SDK compile importcfg entries
> "$COMPILE_IMPORTCFG"
echo "# compile importcfg" >> "$COMPILE_IMPORTCFG"

# Add ALL stdlib packages from GOROOT (the .a files in pkg/)
# go tool compile needs to know where every directly-imported package lives
STDLIB_PKG_DIR="$GOROOT_DIR/pkg/linux_amd64"
if [ -d "$STDLIB_PKG_DIR" ]; then
    # Old-style GOROOT with pre-compiled .a in pkg/
    find "$STDLIB_PKG_DIR" -name '*.a' | while read afile; do
        pkg_name=$(echo "$afile" | sed "s|^$STDLIB_PKG_DIR/||; s|\.a$||")
        pkg_filename=$(echo "$pkg_name" | tr '/' '_')
        cp "$afile" "$PKG_STORE/${pkg_filename}.a"
        echo "packagefile ${pkg_name}=PKG_STORE_PATH/${pkg_filename}.a"
    done >> "$COMPILE_IMPORTCFG"
fi

# For Go 1.21+, stdlib .a files are in the build cache, not in pkg/.
# Extract them from the SDK compile importcfg + scan the cache for all stdlib entries.
if [ -f "$SDK_COMPILE_IMPORTCFG" ]; then
    while IFS= read -r line; do
        if [[ "$line" == packagefile* ]]; then
            pkg_path=$(echo "$line" | sed 's/packagefile [^=]*=//')
            pkg_name=$(echo "$line" | sed 's/packagefile \([^=]*\)=.*/\1/')
            if [ -f "$pkg_path" ]; then
                pkg_filename=$(echo "$pkg_name" | tr '/' '_')
                if [ ! -f "$PKG_STORE/${pkg_filename}.a" ]; then
                    cp "$pkg_path" "$PKG_STORE/${pkg_filename}.a"
                fi
                echo "packagefile ${pkg_name}=PKG_STORE_PATH/${pkg_filename}.a"
            fi
        fi
    done < "$SDK_COMPILE_IMPORTCFG" >> "$COMPILE_IMPORTCFG"
fi

# Now add ALL stdlib packages by compiling a list from go list and finding their .a in cache
GOROOT="$PKGDIR/go" CGO_ENABLED=0 go list std 2>/dev/null | \
    grep -v '^internal/' | grep -v '^vendor/' | grep -v '^cmd/' | \
    while read pkg; do
        pkg_filename=$(echo "$pkg" | tr '/' '_')
        if [ -f "$PKG_STORE/${pkg_filename}.a" ]; then
            continue
        fi
        # Find the .a in the build cache using go list
        afile=$(GOROOT="$PKGDIR/go" GOCACHE="$BUILD_CACHE" CGO_ENABLED=0 GOMODCACHE="$PKGDIR/gopath/pkg/mod" \
            go list -export -f '{{.Export}}' "$pkg" 2>/dev/null)
        if [ -n "$afile" ] && [ -f "$afile" ]; then
            cp "$afile" "$PKG_STORE/${pkg_filename}.a"
            echo "packagefile ${pkg}=PKG_STORE_PATH/${pkg_filename}.a"
        fi
    done >> "$COMPILE_IMPORTCFG"

# Deduplicate (keep last occurrence of each package)
awk -F= '!seen[$1]++' "$COMPILE_IMPORTCFG" > "${COMPILE_IMPORTCFG}.tmp"
mv "${COMPILE_IMPORTCFG}.tmp" "$COMPILE_IMPORTCFG"

echo "Compile importcfg: $(wc -l < "$COMPILE_IMPORTCFG") entries"

# --- Step 4: Build the link importcfg (all transitive deps for go tool link) ---
# Start with the SDK link importcfg (has all SDK transitive deps)
> "$LINK_IMPORTCFG"

if [ -f "$SDK_LINK_IMPORTCFG" ]; then
    while IFS= read -r line; do
        if [[ "$line" == packagefile* ]]; then
            pkg_path=$(echo "$line" | sed 's/packagefile [^=]*=//')
            pkg_name=$(echo "$line" | sed 's/packagefile \([^=]*\)=.*/\1/')
            if [ -f "$pkg_path" ]; then
                pkg_filename=$(echo "$pkg_name" | tr '/' '_')
                if [ ! -f "$PKG_STORE/${pkg_filename}.a" ]; then
                    cp "$pkg_path" "$PKG_STORE/${pkg_filename}.a"
                fi
                echo "packagefile ${pkg_name}=PKG_STORE_PATH/${pkg_filename}.a"
            fi
        else
            echo "$line"
        fi
    done < "$SDK_LINK_IMPORTCFG" >> "$LINK_IMPORTCFG"
fi

# Add any stdlib packages not already in the link importcfg
grep '^packagefile ' "$COMPILE_IMPORTCFG" | while IFS= read -r line; do
    pkg_name=$(echo "$line" | sed 's/packagefile \([^=]*\)=.*/\1/')
    if ! grep -q "packagefile ${pkg_name}=" "$LINK_IMPORTCFG"; then
        echo "$line"
    fi
done >> "$LINK_IMPORTCFG"

echo "Link importcfg: $(wc -l < "$LINK_IMPORTCFG") entries"

rm -rf "$WORK_DIR" "$TMPBUILD"

echo "pkg-store: $(du -sh "$PKG_STORE" | cut -f1) ($(ls "$PKG_STORE" | wc -l) files)"

# Keep build-cache as fallback for the compile script
mkdir -p build-cache
cp -r $BUILD_CACHE/* build-cache/ 2>/dev/null || true
echo "Build cache (fallback): $(du -sh build-cache/ | cut -f1)"
