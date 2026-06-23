#!/usr/bin/env bash
set -euo pipefail

rm -rf rust-1.96.0-x86_64-unknown-linux-gnu rust-1.96.0-x86_64-unknown-linux-gnu.tar.gz

curl -OL https://static.rust-lang.org/dist/rust-1.96.0-x86_64-unknown-linux-gnu.tar.gz
tar xzvf rust-1.96.0-x86_64-unknown-linux-gnu.tar.gz
rm rust-1.96.0-x86_64-unknown-linux-gnu.tar.gz

CARGO_BIN=$PWD/rust-1.96.0-x86_64-unknown-linux-gnu/cargo/bin/cargo
RUSTC_BIN=$PWD/rust-1.96.0-x86_64-unknown-linux-gnu/rustc/bin/rustc
HIERO_SDK=$PWD/rust-1.96.0-x86_64-unknown-linux-gnu/hiero-sdk
RUST_INSTALL_LOC=$PWD/rust-1.96.0-x86_64-unknown-linux-gnu

cd rust-1.96.0-x86_64-unknown-linux-gnu
mkdir -p $HIERO_SDK


git clone --branch v0.45.0 --recursive https://github.com/hiero-ledger/hiero-sdk-rust.git

cd hiero-sdk-rust

RUSTC="$RUSTC_BIN" RUSTFLAGS="-L ${RUST_INSTALL_LOC}/rustc/lib -L ${RUST_INSTALL_LOC}/rust-std-x86_64-unknown-linux-gnu/lib/rustlib/x86_64-unknown-linux-gnu/lib" $CARGO_BIN build --release

if [ ! -d target/release ]; then
  echo "ERROR: cargo build did not produce target/release; aborting before packaging"
  exit 1
fi

echo "copying target/release/ to hiero-sdk"
cp -R target/release/ ../hiero-sdk/

cd ..

echo "removing hiero-sdk-rust"
rm -rf hiero-sdk-rust

cd ..

echo "End build rust 1.96.0"
