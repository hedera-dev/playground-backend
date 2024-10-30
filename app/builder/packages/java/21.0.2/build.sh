#!/usr/bin/env bash

# Put instructions to build your package in here

curl "https://download.java.net/java/GA/jdk21.0.2/f2283984656d49d69e91c558476027ac/13/GPL/openjdk-21.0.2_linux-x64_bin.tar.gz" -o java.tar.gz

tar xzf java.tar.gz --strip-components=1
rm java.tar.gz

mkdir -p dependencies
cd dependencies

curl -LO "https://repo1.maven.org/maven2/com/hedera/hashgraph/sdk-full/2.41.0/sdk-full-2.41.0.jar"
curl -LO "https://repo1.maven.org/maven2/com/google/protobuf/protobuf-java/3.21.7/protobuf-java-3.21.7.jar"
curl -LO "https://repo1.maven.org/maven2/com/google/guava/guava/31.1-jre/guava-31.1-jre.jar"
curl -LO "https://repo1.maven.org/maven2/com/google/code/gson/gson/2.8.9/gson-2.8.9.jar"
curl -LO "https://repo1.maven.org/maven2/com/esaulpaugh/headlong/6.0.0/headlong-6.0.0.jar"
curl -LO "https://repo1.maven.org/maven2/io/grpc/grpc-api/1.48.0/grpc-api-1.48.0.jar"
curl -LO "https://repo1.maven.org/maven2/io/grpc/grpc-stub/1.48.0/grpc-stub-1.48.0.jar"
curl -LO "https://repo1.maven.org/maven2/io/grpc/grpc-protobuf/1.48.0/grpc-protobuf-1.48.0.jar"
curl -LO "https://repo1.maven.org/maven2/io/grpc/grpc-netty-shaded/1.48.0/grpc-netty-shaded-1.48.0.jar"
curl -LO "https://repo1.maven.org/maven2/org/bouncycastle/bcprov-jdk15on/1.70/bcprov-jdk15on-1.70.jar"
curl -LO "https://repo1.maven.org/maven2/org/bouncycastle/bcpkix-jdk15on/1.70/bcpkix-jdk15on-1.70.jar"
curl -LO "https://repo1.maven.org/maven2/org/slf4j/slf4j-api/1.7.36/slf4j-api-1.7.36.jar"
curl -LO "https://repo1.maven.org/maven2/com/github/spotbugs/spotbugs-annotations/4.2.3/spotbugs-annotations-4.2.3.jar"
curl -LO "https://repo1.maven.org/maven2/com/google/errorprone/error_prone_annotations/2.10.0/error_prone_annotations-2.10.0.jar"
