#!/bin/bash
curl "https://nodejs.org/dist/v22.16.0/node-v22.16.0-linux-x64.tar.xz" -o node.tar.xz

tar xf node.tar.xz --strip-components=1
rm node.tar.xz

if [ ! -f "./bin/npm" ]; then
  echo "Error: npm not found in ./bin"
  exit 1
fi

source environment

bin/npm install -g @hiero-ledger/sdk@2.75.0

if [ $? -ne 0 ]; then
  echo "Error: Cannot install @hiero-ledger/sdk"
  exit 1
fi