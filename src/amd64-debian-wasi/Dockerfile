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

COPY c2w-rust-prebundle /opt/c2w-rust-prebundle

RUN cd /opt/c2w-rust-prebundle \
    && cargo fetch --locked \
    && cargo fetch --locked --target wasm32-unknown-unknown \
    && cargo install wasm-bindgen-cli --version 0.2.120 --locked \
    && printf '[net]\noffline = true\ngit-fetch-with-cli = true\n\n[registries.crates-io]\nprotocol = "sparse"\n' > "${CARGO_HOME}/config.toml"

ENV CARGO_NET_OFFLINE=true

WORKDIR /root
CMD ["/bin/bash"]
