FROM rust:1.88.0-slim-bookworm

ENV DEBIAN_FRONTEND=noninteractive \
    RUSTUP_HOME=/usr/local/rustup \
    CARGO_HOME=/usr/local/cargo \
    RUST_TOOLCHAIN=/usr/local/rustup/toolchains/1.88.0-x86_64-unknown-linux-gnu \
    CARGO_REGISTRIES_CRATES_IO_PROTOCOL=sparse \
    CARGO_NET_OFFLINE=true \
    PATH=/usr/local/rustup/toolchains/1.88.0-x86_64-unknown-linux-gnu/bin:/usr/local/cargo/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        bash \
        ca-certificates \
        coreutils \
        curl \
        findutils \
        gzip \
        make \
        mawk \
        pkg-config \
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

COPY c2w-rust-prebundle /opt/c2w-rust-prebundle

RUN rustup target add wasm32-unknown-unknown \
    && cd /opt/c2w-rust-prebundle \
    && CARGO_NET_OFFLINE=false cargo fetch --locked \
    && CARGO_NET_OFFLINE=false cargo fetch --locked --target wasm32-unknown-unknown \
    && CARGO_NET_OFFLINE=false cargo check --locked \
    && rm -rf /opt/c2w-rust-prebundle/target \
    && CARGO_NET_OFFLINE=false CARGO_HOME=/tmp/c2w-cargo-install cargo install wasm-bindgen-cli --version 0.2.120 --locked \
    && cp /tmp/c2w-cargo-install/bin/wasm-bindgen /usr/local/cargo/bin/ \
    && strip --strip-unneeded /usr/local/cargo/bin/wasm-bindgen \
    && rm -f \
        /usr/local/cargo/bin/cargo \
        /usr/local/cargo/bin/cargo-clippy \
        /usr/local/cargo/bin/cargo-fmt \
        /usr/local/cargo/bin/cargo-miri \
        /usr/local/cargo/bin/clippy-driver \
        /usr/local/cargo/bin/rls \
        /usr/local/cargo/bin/rust-analyzer \
        /usr/local/cargo/bin/rust-gdb \
        /usr/local/cargo/bin/rust-gdbgui \
        /usr/local/cargo/bin/rust-lldb \
        /usr/local/cargo/bin/rustc \
        /usr/local/cargo/bin/rustdoc \
        /usr/local/cargo/bin/rustfmt \
        /usr/local/cargo/bin/rustup \
        "${RUST_TOOLCHAIN}/bin/rustdoc" \
        "${RUST_TOOLCHAIN}"/lib/rustlib/x86_64-unknown-linux-gnu/lib/librustc-stable_rt.*san.a \
        /usr/lib/gcc/x86_64-linux-gnu/12/cc1 \
        /usr/lib/gcc/x86_64-linux-gnu/12/lto1 \
        /usr/lib/gcc/x86_64-linux-gnu/12/libasan.a \
        /usr/lib/gcc/x86_64-linux-gnu/12/liblsan.a \
        /usr/lib/gcc/x86_64-linux-gnu/12/libtsan.a \
        /usr/lib/gcc/x86_64-linux-gnu/12/libubsan.a \
        /usr/lib/gcc/x86_64-linux-gnu/12/*san_preinit.o \
    && rm -rf \
        /tmp/c2w-cargo-install \
        /usr/lib/gcc/x86_64-linux-gnu/12/include/sanitizer \
        /usr/local/rustup/downloads/* \
        /usr/local/rustup/tmp/* \
        /usr/local/rustup/toolchains/*/share/doc/* \
        /usr/local/rustup/toolchains/*/share/man/* \
    && mkdir -p "${CARGO_HOME}/git" "${CARGO_HOME}/.c2w-cache" \
    && printf 'export PATH=%s/bin:/usr/local/cargo/bin:${PATH}\n' "${RUST_TOOLCHAIN}" > /etc/profile.d/cargo-path.sh \
    && printf 'preloaded-rust-dev-image\n' > "${CARGO_HOME}/.c2w-cache/rust-dev-cache.stamp" \
    && printf '[net]\noffline = true\n\n[registries.crates-io]\nprotocol = "sparse"\n' > "${CARGO_HOME}/config.toml"

WORKDIR /root
CMD ["/bin/bash"]
