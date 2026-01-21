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
    libcap-dev libssl-dev curl ca-certificates iptables iproute2 && \
    update-ca-certificates && \
    rm -rf /var/lib/apt/lists/*

RUN useradd -M playground
COPY --from=isolate /usr/local/bin/isolate /usr/local/bin
COPY --from=isolate /usr/local/etc/isolate /usr/local/etc/isolate

RUN sed -i '/en_US.UTF-8/s/^# //g' /etc/locale.gen && locale-gen

WORKDIR /pkgs_manager
COPY install_package.sh ./

#RUN ./install_package.sh "java" "21.0.2" "https://storage.googleapis.com/playground_pkgs_dev/java-21.0.2.pkg.tar.gz" "08ef880b93bc1759852c3feb7cf1609b9101fb2ed780598a21e3546462939173"
RUN ./install_package.sh "node" "22.16.0" "https://storage.googleapis.com/playground_pkgs_dev/node-22.16.0.pkg.tar.gz" "ca5c111c6b49446bbf4e56ee5fe0d8e3a8ce6de081defbdbddfd6be6ee94f0e9"
#RUN ./install_package.sh "rust" "1.85.1" "https://storage.googleapis.com/playground_pkgs_dev/rust-1.85.1.pkg.tar.gz" "9c068349dc1576a1af2a2e98963973497d0c13175655464c785f764844406d83"

RUN apt-get update && \
    apt-get upgrade -y && \
    apt-get remove --purge -y libkrb5-3 libk5crypto3 libkrb5support0 libgssapi-krb5-2 libexpat1 && \
    apt-get install -y --no-install-recommends g++ g++-12 libc6-dev libstdc++-12-dev iptables iproute2 iputils-ping && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /playground-api
COPY ["package.json", "package-lock.json", "./"]
RUN npm install
COPY ./src ./src

CMD ["/playground-api/src/docker-entrypoint.sh"]
#CMD ["/bin/sh","-c","sleep infinity"]
EXPOSE 2000/tcp
