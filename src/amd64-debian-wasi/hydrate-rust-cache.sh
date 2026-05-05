#!/usr/bin/env bash

set -euo pipefail

archive_url="${1:-}"
cache_key="${2:-}"
stamp_dir="/usr/local/cargo/.c2w-cache"
stamp_file="${stamp_dir}/rust-dev-cache.stamp"

if [ -z "${archive_url}" ]; then
    echo "hydrate-rust-cache: missing cache archive URL" >&2
    exit 2
fi

mkdir -p "${stamp_dir}"

if [ -f "${stamp_file}" ]; then
    if [ -z "${cache_key}" ] || grep -qxF "${cache_key}" "${stamp_file}"; then
        echo "hydrate-rust-cache: Rust development cache already hydrated"
        exit 0
    fi
fi

tmp_dir="$(mktemp -d /tmp/c2w-rust-cache.XXXXXX)"
archive_path="${tmp_dir}/rust-dev-cache.tar.gz"

cleanup() {
    rm -rf "${tmp_dir}"
}
trap cleanup EXIT

echo "hydrate-rust-cache: downloading ${archive_url}"
curl -fL --retry 3 --retry-delay 2 --connect-timeout 30 --progress-bar "${archive_url}" -o "${archive_path}"

echo "hydrate-rust-cache: unpacking Rust development cache"
tar -xzf "${archive_path}" -C /

chmod -R a+rX /usr/local/cargo/registry /usr/local/cargo/git 2>/dev/null || true
chmod +x /usr/local/cargo/bin/wasm-bindgen* 2>/dev/null || true

if [ -z "${cache_key}" ]; then
    cache_key="${archive_url}"
fi
printf '%s\n' "${cache_key}" > "${stamp_file}"

echo "hydrate-rust-cache: complete"
