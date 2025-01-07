#!/usr/bin/env bash

# Put instructions to build your package in here

curl "https://download.java.net/java/GA/jdk21.0.2/f2283984656d49d69e91c558476027ac/13/GPL/openjdk-21.0.2_linux-x64_bin.tar.gz" -o java.tar.gz

tar xzf java.tar.gz --strip-components=1
rm java.tar.gz

mkdir -p dependencies
mvn dependency:copy-dependencies -DoutputDirectory=dependencies