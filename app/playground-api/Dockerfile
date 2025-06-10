FROM buildpack-deps:bookworm AS isolate
RUN apt-get update && \
    apt-get install -y --no-install-recommends git libcap-dev && \
    rm -rf /var/lib/apt/lists/* && \
    git clone https://github.com/envicutor/isolate.git /tmp/isolate/ && \
    cd /tmp/isolate && \
    git checkout af6db68042c3aa0ded80787fbb78bc0846ea2114 && \
    make -j$(nproc) install && \
    rm -rf /tmp/*

FROM node:22.16.0-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN dpkg-reconfigure -p critical dash
RUN apt-get update && \
    apt-get upgrade -y && \
    apt-get install -y --no-install-recommends tar coreutils  \
    util-linux binutils build-essential locales \
    libc6-dev libseccomp-dev rename procps python3 \
    libcap-dev libssl-dev curl ca-certificates && \
    update-ca-certificates && \
    rm -rf /var/lib/apt/lists/*

RUN useradd -M playground
COPY --from=isolate /usr/local/bin/isolate /usr/local/bin
COPY --from=isolate /usr/local/etc/isolate /usr/local/etc/isolate

RUN sed -i '/en_US.UTF-8/s/^# //g' /etc/locale.gen && locale-gen

WORKDIR /pkgs_manager
COPY install_package.sh ./

RUN ./install_package.sh "java" "21.0.2" "https://storage.googleapis.com/playground_pkgs/java-21.0.2.pkg.tar.gz" "85f8bc466da991fb7d04c0560b559be64ea7ffd50f3723ec58053ac3f2916848"
RUN ./install_package.sh "node" "22.16.0" "https://storage.googleapis.com/playground_pkgs/node-22.16.0.pkg.tar.gz" "98f7aed5ffd1ce851a59a458be3be1a04008a7d9c380523b4ee2b3e80d65d8e1"
RUN ./install_package.sh "rust" "1.85.1" "https://storage.googleapis.com/playground_pkgs/rust-1.85.1.pkg.tar.gz" "906bc6a1b93d90efbe640c67f164ecf89401f0b69ab22414dd3502b018594195"

RUN apt-get update && \
    apt-get upgrade -y && \
    apt-get remove --purge -y libkrb5-3 libk5crypto3 libkrb5support0 libgssapi-krb5-2 libexpat1 && \
    apt-get install -y --no-install-recommends g++ g++-12 libc6-dev libstdc++-12-dev && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /playground-api
COPY ["package.json", "package-lock.json", "./"]
RUN npm install
COPY ./src ./src

CMD ["/playground-api/src/docker-entrypoint.sh"]
#CMD ["/bin/sh","-c","sleep infinity"]
EXPOSE 2000/tcp
