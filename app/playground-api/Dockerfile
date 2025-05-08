FROM --platform=linux/amd64 buildpack-deps:buster AS isolate
RUN apt-get update && \
    apt-get install -y --no-install-recommends git libcap-dev && \
    rm -rf /var/lib/apt/lists/* && \
    git clone https://github.com/envicutor/isolate.git /tmp/isolate/ && \
    cd /tmp/isolate && \
    git checkout af6db68042c3aa0ded80787fbb78bc0846ea2114 && \
    make -j$(nproc) install && \
    rm -rf /tmp/*

FROM --platform=linux/amd64 node:20.15.0-buster-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN dpkg-reconfigure -p critical dash
RUN apt-get update && \
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

RUN ./install_package.sh "java" "21.0.2" "https://storage.googleapis.com/playground_pkgs/java-21.0.2.pkg.tar.gz" "7d72e4b76d23627a19c0b875f1556771d1347ee690cce72cd65b0d45d42b3811"
RUN ./install_package.sh "node" "20.11.1" "https://storage.googleapis.com/playground_pkgs/node-20.11.1.pkg.tar.gz" "fdfe3503527ca91183cfa7df7d965c24a7840977a4054f492670a03f702bc6d6"
RUN ./install_package.sh "rust" "1.85.1" "https://storage.googleapis.com/playground_pkgs/rust-1.85.1.pkg.tar.gz" "fcf4645df1309952a4cf4a7fca206648d690da4cb6c32b2757070aaa2899e107"

RUN apt-get remove --purge -y libkrb5-3 && \
    apt-get autoremove -y && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /playground-api
COPY ["package.json", "package-lock.json", "./"]
RUN npm install
COPY ./src ./src

CMD ["/playground-api/src/docker-entrypoint.sh"]
#CMD ["/bin/sh","-c","sleep infinity"]
EXPOSE 2000/tcp
