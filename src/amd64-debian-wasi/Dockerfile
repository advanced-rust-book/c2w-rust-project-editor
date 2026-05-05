FROM rust:1.88.0-slim-bookworm

ENV DEBIAN_FRONTEND=noninteractive \
    CARGO_HOME=/usr/local/cargo \
    CARGO_REGISTRIES_CRATES_IO_PROTOCOL=sparse \
    CARGO_NET_GIT_FETCH_WITH_CLI=true \
    PATH=/usr/local/cargo/bin:${PATH}

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        bash \
        build-essential \
        ca-certificates \
        clang \
        coreutils \
        curl \
        git \
        gzip \
        libclang-dev \
        libffi-dev \
        libopenmpi-dev \
        openmpi-bin \
        pkg-config \
        protobuf-compiler \
        tar \
        unzip \
        zip \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /tmp/rust-wrapper-direct-io

RUN rustup target add wasm32-unknown-unknown

COPY hydrate-rust-cache.sh /usr/local/bin/hydrate-rust-cache

RUN chmod +x /usr/local/bin/hydrate-rust-cache \
    && printf '[net]\noffline = true\ngit-fetch-with-cli = true\n\n[registries.crates-io]\nprotocol = "sparse"\n' > "${CARGO_HOME}/config.toml"

ENV CARGO_NET_OFFLINE=true

WORKDIR /root
CMD ["/bin/bash"]
