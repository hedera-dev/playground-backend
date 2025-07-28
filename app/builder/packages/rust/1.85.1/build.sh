#!/usr/bin/env bash

curl -OL https://static.rust-lang.org/dist/rust-1.85.1-x86_64-unknown-linux-gnu.tar.gz
tar xzvf rust-1.85.1-x86_64-unknown-linux-gnu.tar.gz
rm rust-1.85.1-x86_64-unknown-linux-gnu.tar.gz

CARGO_BIN=$PWD/rust-1.85.1-x86_64-unknown-linux-gnu/cargo/bin/cargo
RUSTC_BIN=$PWD/rust-1.85.1-x86_64-unknown-linux-gnu/rustc/bin/rustc
HEDERA_SDK=$PWD/rust-1.85.1-x86_64-unknown-linux-gnu/hedera-sdk
RUST_INSTALL_LOC=$PWD/rust-1.85.1-x86_64-unknown-linux-gnu

cd rust-1.85.1-x86_64-unknown-linux-gnu
mkdir -p $HEDERA_SDK


git clone --branch 0.33.0 --recursive https://github.com/hashgraph/hedera-sdk-rust.git

cd hedera-sdk-rust

RUSTC="$RUSTC_BIN" RUSTFLAGS="-L ${RUST_INSTALL_LOC}/rustc/lib -L ${RUST_INSTALL_LOC}/rust-std-x86_64-unknown-linux-gnu/lib/rustlib/x86_64-unknown-linux-gnu/lib" $CARGO_BIN build --release

echo "copying target/release/ to hedera-sdk"
cp -R target/release/ ../hedera-sdk/

cd ..

echo "removing hedera-sdk-rust"
rm -rf hedera-sdk-rust

cd ..

echo "End build rust 1.85.1, continue manually if packaging fails (shell corruption?)"
echo "tar czf rust-1.85.1.pkg.tar.gz -C rust/1.85.1 ."