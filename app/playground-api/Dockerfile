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

RUN ./install_package.sh "go" "1.25.4" "https://storage.googleapis.com/playground_pkgs_dev/go-1.25.4.pkg.tar.gz" "bf3d344de347ae28af05781b1a40b4ef8c7a12fe1e1c08d06e859c04c990089c"
RUN ./install_package.sh "java" "21.0.2" "https://storage.googleapis.com/playground_pkgs_dev/java-21.0.2.pkg.tar.gz" "7cc6642b35c02959ff65c1d0d5b5671bef09bc0d93e1b8cf63b86f707387d296"
RUN ./install_package.sh "node" "22.16.0" "https://storage.googleapis.com/playground_pkgs_dev/node-22.16.0.pkg.tar.gz" "04acd12d5ca4059a5a1221bab819b0e5b2b50866447cbadae7e46069f8b9aa3f"
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
