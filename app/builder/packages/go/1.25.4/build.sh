#!/usr/bin/env bash

ls -la
curl -OL https://go.dev/dl/go1.25.4.linux-amd64.tar.gz
ls -la
tar -xzf go1.25.4.linux-amd64.tar.gz
rm go1.25.4.linux-amd64.tar.gz
ls -la

source environment

go mod init hedera-playground
go get github.com/hiero-ledger/hiero-sdk-go/v2/sdk@v2.73.0
go mod tidy
go list -m

# Pre-compile ALL packages from the SDK (similar to cargo build --release)
echo "Pre-compiling ALL Hiero SDK packages..."

# First, ensure go.sum has all dependencies by building the SDK
echo "Downloading and resolving all SDK dependencies..."
go build -v github.com/hiero-ledger/hiero-sdk-go/v2/sdk/... 2>&1 | tee /tmp/go-build.log | tail -20

echo "All SDK packages compiled"

# Save build cache for faster runtime
echo "Saving build cache for faster runtime..."
BUILD_CACHE=$(go env GOCACHE)
echo "BUILD_CACHE path: $BUILD_CACHE"
mkdir -p build-cache
cp -r $BUILD_CACHE/* build-cache/ 2>/dev/null || true

echo "Build cache saved to build-cache/"
echo "Cache size: $(du -sh build-cache/ | cut -f1)"
