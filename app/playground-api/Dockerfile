FROM buildpack-deps:bookworm@sha256:4c37ab5f6f0d007c4d897ee58ae3abd40dbdf6ad8d18d9b347cf32e072b57607 AS isolate
RUN apt-get update && \
    apt-get install -y --no-install-recommends git libcap-dev && \
    rm -rf /var/lib/apt/lists/* && \
    git clone https://github.com/envicutor/isolate.git /tmp/isolate/ && \
    cd /tmp/isolate && \
    git checkout af6db68042c3aa0ded80787fbb78bc0846ea2114 && \
    make -j$(nproc) install && \
    rm -rf /tmp/*

FROM node:22.16.0-bookworm-slim@sha256:1471ea646673136b8308550ac14b36d847ffb21c24bc31828279e443c924e488

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

RUN ./install_package.sh "go" "1.26.8" "https://storage.googleapis.com/playground_pkgs_dev/sdk-719/go-1.26.8.pkg.tar.gz" "f72dcb32a2ad51f96f23441f7a5fd09f484a2c9ba9e9c6341c8a1bb91c74392b"
RUN ./install_package.sh "java" "21.0.2" "https://storage.googleapis.com/playground_pkgs_dev/sdk-719/java-21.0.2.pkg.tar.gz" "936bd6371a3a6f771fe94ddac14c3021b703fb82a29cf4bcff46a56d5bfb7e62"
RUN ./install_package.sh "node" "22.16.0" "https://storage.googleapis.com/playground_pkgs_dev/sdk-719/node-22.16.0.pkg.tar.gz" "5b2ec8750576603ae8b6fe261c249ea6ef93672304c34f13a1592720337ef196"
RUN ./install_package.sh "rust" "1.96.0" "https://storage.googleapis.com/playground_pkgs_dev/rust-1.96.0.pkg.tar.gz" "bde2ddae6ce47a0cc0796743d664f3a68725ac081c4478db4225c9492bea8164"

RUN chown -R playground:playground /pkgs_manager

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
