FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    RUSTUP_HOME=/usr/local/rustup \
    CARGO_HOME=/usr/local/cargo \
    CARGO_REGISTRIES_CRATES_IO_PROTOCOL=sparse \
    CARGO_NET_GIT_FETCH_WITH_CLI=true \
    PATH=/usr/local/cargo/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        bash \
        ca-certificates \
        coreutils \
        curl \
        findutils \
        gzip \
        mawk \
        sed \
        tar \
        unzip \
        zip \
    && rm -rf \
        /var/lib/apt/lists/* \
        /usr/share/doc/* \
        /usr/share/info/* \
        /usr/share/lintian/* \
        /usr/share/locale/* \
        /usr/share/man/* \
    && mkdir -p /tmp/rust-wrapper-direct-io

COPY hydrate-rust-cache.sh /usr/local/bin/hydrate-rust-cache

RUN chmod +x /usr/local/bin/hydrate-rust-cache \
    && mkdir -p "${CARGO_HOME}" "${RUSTUP_HOME}" \
    && printf 'export PATH=/usr/local/cargo/bin:${PATH}\n' > /etc/profile.d/cargo-path.sh \
    && rm -rf \
        /usr/local/rustup/downloads/* \
        /usr/local/rustup/tmp/* \
        /usr/local/rustup/toolchains/*/share/doc/* \
        /usr/local/rustup/toolchains/*/share/man/* \
    && printf '[net]\noffline = true\ngit-fetch-with-cli = true\n\n[registries.crates-io]\nprotocol = "sparse"\n' > "${CARGO_HOME}/config.toml"

ENV CARGO_NET_OFFLINE=true

WORKDIR /root
CMD ["/bin/bash"]
