#!/usr/bin/env bash

PKGDIR="$PWD"

curl -OL https://go.dev/dl/go1.25.4.linux-amd64.tar.gz
tar -xzf go1.25.4.linux-amd64.tar.gz
rm go1.25.4.linux-amd64.tar.gz

source environment

go mod init hedera-playground
go get github.com/hiero-ledger/hiero-sdk-go/v2/sdk@v2.73.0
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
PKG_STORE="$PKGDIR/pkg-store"
mkdir -p "$PKG_STORE"

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

COMPILE_IMPORTCFG="$WORK_DIR/b001/importcfg"
LINK_IMPORTCFG="$WORK_DIR/b001/importcfg.link"

if [ -f "$COMPILE_IMPORTCFG" ]; then
    while IFS= read -r line; do
        if [[ "$line" == packagefile* ]]; then
            pkg_path=$(echo "$line" | sed 's/packagefile [^=]*=//')
            pkg_name=$(echo "$line" | sed 's/packagefile \([^=]*\)=.*/\1/')
            if [ -f "$pkg_path" ]; then
                safe_name=$(echo "$pkg_name" | tr '/' '_')
                cp "$pkg_path" "$PKG_STORE/${safe_name}.a"
                echo "packagefile ${pkg_name}=PKG_STORE_PATH/${safe_name}.a"
            fi
        else
            echo "$line"
        fi
    done < "$COMPILE_IMPORTCFG" > "$PKGDIR/compile.importcfg.template"
    echo "Compile importcfg: $(wc -l < "$PKGDIR/compile.importcfg.template") entries"
fi

if [ -f "$LINK_IMPORTCFG" ]; then
    while IFS= read -r line; do
        if [[ "$line" == packagefile* ]]; then
            pkg_path=$(echo "$line" | sed 's/packagefile [^=]*=//')
            pkg_name=$(echo "$line" | sed 's/packagefile \([^=]*\)=.*/\1/')
            if [ -f "$pkg_path" ]; then
                safe_name=$(echo "$pkg_name" | tr '/' '_')
                if [ ! -f "$PKG_STORE/${safe_name}.a" ]; then
                    cp "$pkg_path" "$PKG_STORE/${safe_name}.a"
                fi
                echo "packagefile ${pkg_name}=PKG_STORE_PATH/${safe_name}.a"
            fi
        else
            echo "$line"
        fi
    done < "$LINK_IMPORTCFG" > "$PKGDIR/link.importcfg.template"
    echo "Link importcfg: $(wc -l < "$PKGDIR/link.importcfg.template") entries"
fi

rm -rf "$WORK_DIR" "$TMPBUILD"

echo "pkg-store: $(du -sh "$PKG_STORE" | cut -f1) ($(ls "$PKG_STORE" | wc -l) files)"

# Keep build-cache as fallback for the compile script
mkdir -p build-cache
cp -r $BUILD_CACHE/* build-cache/ 2>/dev/null || true
echo "Build cache (fallback): $(du -sh build-cache/ | cut -f1)"
