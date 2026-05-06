#!/usr/bin/env bash

set -euo pipefail

asset_url="${1:-}"
cache_key="${2:-}"
stamp_dir="/usr/local/cargo/.c2w-cache"
stamp_file="${stamp_dir}/rust-dev-cache.stamp"

if [ -z "${asset_url}" ]; then
    echo "hydrate-rust-cache: missing cache archive or manifest URL" >&2
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
manifest_path="${tmp_dir}/rust-dev-cache.manifest.json"

cleanup() {
    rm -rf "${tmp_dir}"
}
trap cleanup EXIT

curl_download() {
    local url="$1"
    local output="$2"
    curl -fL --retry 6 --retry-all-errors --retry-delay 2 --retry-max-time 300 --connect-timeout 30 --no-progress-meter "${url}" -o "${output}"
}

manifest_value() {
    local key="$1"
    sed -n "s/.*\"${key}\"[[:space:]]*:[[:space:]]*\"\\([^\"]*\\)\".*/\\1/p" "${manifest_path}" | sed -n '1p'
}

manifest_number() {
    local key="$1"
    sed -n "s/.*\"${key}\"[[:space:]]*:[[:space:]]*\\([0-9][0-9]*\\).*/\\1/p" "${manifest_path}" | sed -n '1p'
}

manifest_files() {
    sed -n '/"files"[[:space:]]*:/,/\]/{ s/.*"\([^"]*\)".*/\1/p }' "${manifest_path}"
}

download_chunked_archive() {
    local manifest_url="$1"
    local base_url="${manifest_url%/*}/"
    local expected_hash
    local expected_bytes
    local actual_hash
    local actual_bytes
    local files
    local file
    local part_path
    local part_index=0

    echo "hydrate-rust-cache: downloading manifest ${manifest_url}"
    curl_download "${manifest_url}" "${manifest_path}"

    expected_hash="$(manifest_value archiveHash)"
    expected_bytes="$(manifest_number bytes)"
    files="$(manifest_files)"
    if [ -z "${files}" ]; then
        echo "hydrate-rust-cache: manifest does not list cache chunks" >&2
        exit 1
    fi

    : > "${archive_path}"
    while IFS= read -r file; do
        if [ -z "${file}" ]; then
            continue
        fi
        case "${file}" in
            /*|*://*|*..*)
                echo "hydrate-rust-cache: refusing unsafe manifest file entry: ${file}" >&2
                exit 1
                ;;
        esac

        part_index=$((part_index + 1))
        part_path="${tmp_dir}/cache-part-${part_index}"
        echo "hydrate-rust-cache: downloading cache chunk ${part_index}: ${file}"
        curl_download "${base_url}${file}" "${part_path}"
        cat "${part_path}" >> "${archive_path}"
        rm -f "${part_path}"
    done <<EOF
${files}
EOF

    actual_bytes="$(wc -c < "${archive_path}" | tr -d '[:space:]')"
    if [ -n "${expected_bytes}" ] && [ "${actual_bytes}" != "${expected_bytes}" ]; then
        echo "hydrate-rust-cache: assembled archive size mismatch: expected ${expected_bytes}, got ${actual_bytes}" >&2
        exit 1
    fi

    if [ -n "${expected_hash}" ]; then
        actual_hash="$(sha256sum "${archive_path}" | awk '{print $1}')"
        if [ "${actual_hash}" != "${expected_hash}" ]; then
            echo "hydrate-rust-cache: assembled archive sha256 mismatch: expected ${expected_hash}, got ${actual_hash}" >&2
            exit 1
        fi
    fi
}

case "${asset_url}" in
    *.manifest.json)
        download_chunked_archive "${asset_url}"
        ;;
    *)
        echo "hydrate-rust-cache: downloading ${asset_url}"
        curl_download "${asset_url}" "${archive_path}"
        ;;
esac

echo "hydrate-rust-cache: unpacking Rust development cache"
tar -xzf "${archive_path}" -C /

chmod -R a+rX /usr/local/cargo/registry /usr/local/cargo/git 2>/dev/null || true
chmod +x /usr/local/cargo/bin/wasm-bindgen* 2>/dev/null || true

if [ -z "${cache_key}" ]; then
    cache_key="${asset_url}"
fi
printf '%s\n' "${cache_key}" > "${stamp_file}"

echo "hydrate-rust-cache: complete"
