#!/bin/bash

set -euo pipefail

SOURCE=${SOURCE:-./src}
DEST=${DEST:-./docs/containers}
DOCS_SRC_DIR=${DOCS_SRC_DIR:-./docs/src}
WASI_MAX_CHUNK=${WASI_MAX_CHUNK:-47MB}
C2W=${C2W:-c2w}
DOCKER=${DOCKER:-docker}
C2W_EXTRA_FLAGS=${C2W_EXTRA_FLAGS:-}
IMAGES=${IMAGES:-amd64-debian-wasi}
FORCE_REBUILD=${FORCE_REBUILD:-0}
CLEAN_REMOVED_IMAGES=${CLEAN_REMOVED_IMAGES:-1}
DOCKER_SAVE_PLATFORM_COMPAT=${DOCKER_SAVE_PLATFORM_COMPAT:-auto}
C2W_BUILDX_MEMORY=${C2W_BUILDX_MEMORY:-}
C2W_BUILDX_MEMORY_SWAP=${C2W_BUILDX_MEMORY_SWAP:-}
C2W_BUILDX_BUILDER_NAME=${C2W_BUILDX_BUILDER_NAME:-c2w-large}
C2W_BUILDX_RECREATE=${C2W_BUILDX_RECREATE:-0}

# shellcheck disable=SC2206
C2W_EXTRA_FLAGS_A=(${C2W_EXTRA_FLAGS})

mkdir -p "${DEST}"

copy_net_proxy() {
    local bundled
    local target
    local bundled="/usr/local/share/c2w-net-proxy.wasm"
    local target="${DOCS_SRC_DIR}/c2w-net-proxy.wasm"

    if [ -f "${bundled}" ]; then
        mkdir -p "${DOCS_SRC_DIR}"
        if [ ! -f "${target}" ] || ! cmp -s "${bundled}" "${target}"; then
            cp "${bundled}" "${target}"
            echo "Updated ${target}"
        fi
    fi
}

read_trimmed_file() {
    local path="$1"
    local default_value="$2"
    local value=""

    if [ -f "${path}" ]; then
        value="$(tr -d '\r\n[:space:]' < "${path}" || true)"
    fi

    if [ -z "${value}" ]; then
        printf '%s\n' "${default_value}"
    else
        printf '%s\n' "${value}"
    fi
}

docker_save_supports_platform() {
    "${DOCKER}" save --help 2>&1 | grep -q -- '--platform'
}

C2W_DOCKER_WRAPPER_DIR=""

cleanup_docker_save_compat() {
    if [ -n "${C2W_DOCKER_WRAPPER_DIR}" ] && [ -d "${C2W_DOCKER_WRAPPER_DIR}" ]; then
        rm -rf "${C2W_DOCKER_WRAPPER_DIR}"
    fi
}

setup_docker_save_compat() {
    local mode
    local real_docker

    mode="$(printf '%s' "${DOCKER_SAVE_PLATFORM_COMPAT}" | tr '[:upper:]' '[:lower:]')"
    case "${mode}" in
        0|false|no|off|disabled)
            return 0
            ;;
        auto|1|true|yes|on|force|always)
            ;;
        *)
            echo "invalid DOCKER_SAVE_PLATFORM_COMPAT='${DOCKER_SAVE_PLATFORM_COMPAT}'; expected auto, true/force, or false/off"
            exit 1
            ;;
    esac

    real_docker="$(command -v "${DOCKER}" 2>/dev/null || true)"
    if [ -z "${real_docker}" ]; then
        if [ "${mode}" = "auto" ]; then
            return 0
        fi
        echo "docker command '${DOCKER}' not found; cannot enable docker save compatibility wrapper"
        exit 1
    fi

    if [ "${mode}" = "auto" ] && docker_save_supports_platform; then
        return 0
    fi

    C2W_DOCKER_WRAPPER_DIR="$(mktemp -d)"
    cat > "${C2W_DOCKER_WRAPPER_DIR}/docker" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

real="${C2W_REAL_DOCKER:?C2W_REAL_DOCKER is not set}"

strip_platform_args() {
    stripped_args=()
    while [ "$#" -gt 0 ]; do
        case "$1" in
            --platform)
                shift
                if [ "$#" -gt 0 ]; then
                    shift
                fi
                ;;
            --platform=*)
                shift
                ;;
            *)
                stripped_args+=("$1")
                shift
                ;;
        esac
    done
}

if [ "${C2W_DOCKER_SAVE_PLATFORM_COMPAT_STRIP:-0}" = "1" ] && [ "$#" -gt 0 ]; then
    if [ "$1" = "save" ]; then
        shift
        stripped_args=()
        strip_platform_args "$@"
        exec "${real}" save "${stripped_args[@]}"
    fi

    if [ "$#" -gt 1 ] && [ "$1" = "image" ] && [ "$2" = "save" ]; then
        shift 2
        stripped_args=()
        strip_platform_args "$@"
        exec "${real}" image save "${stripped_args[@]}"
    fi
fi

exec "${real}" "$@"
EOF
    chmod +x "${C2W_DOCKER_WRAPPER_DIR}/docker"

    export C2W_REAL_DOCKER="${real_docker}"
    export C2W_DOCKER_SAVE_PLATFORM_COMPAT_STRIP=1
    export PATH="${C2W_DOCKER_WRAPPER_DIR}:${PATH}"

    if [ "${mode}" = "auto" ]; then
        echo "Docker CLI '${real_docker}' does not support 'docker save --platform'; enabling c2w docker-save compatibility wrapper"
    else
        echo "Enabling c2w docker-save compatibility wrapper via DOCKER_SAVE_PLATFORM_COMPAT=${DOCKER_SAVE_PLATFORM_COMPAT}"
    fi
}

setup_buildx_builder() {
    if [ -z "${C2W_BUILDX_MEMORY}" ]; then
        return 0
    fi

    local builder_name="${C2W_BUILDX_BUILDER_NAME}"
    local driver_opts="memory=${C2W_BUILDX_MEMORY},default-load=true"

    if [ -n "${C2W_BUILDX_MEMORY_SWAP}" ]; then
        driver_opts="${driver_opts},memory-swap=${C2W_BUILDX_MEMORY_SWAP}"
    fi

    if [ "${C2W_BUILDX_RECREATE}" = "1" ] && "${DOCKER}" buildx inspect "${builder_name}" >/dev/null 2>&1; then
        echo "Recreating buildx builder ${builder_name}"
        "${DOCKER}" buildx rm "${builder_name}" >/dev/null
    fi

    if ! "${DOCKER}" buildx inspect "${builder_name}" >/dev/null 2>&1; then
        echo "Creating buildx builder ${builder_name} with driver options: ${driver_opts}"
        "${DOCKER}" buildx create \
            --name "${builder_name}" \
            --driver docker-container \
            --driver-opt "${driver_opts}" \
            --use \
            --bootstrap >/dev/null
    else
        echo "Using existing buildx builder ${builder_name}"
        "${DOCKER}" buildx use "${builder_name}"
        "${DOCKER}" buildx inspect --bootstrap "${builder_name}" >/dev/null
    fi

    export BUILDX_BUILDER="${builder_name}"
}

source_hash() {
    local image_dir="$1"
    local image_name="$2"
    local target_arch="$3"
    local target="$4"
    local artifact_kind="${5:-image}"

    {
        printf 'image=%s\n' "${image_name}"
        printf 'target=%s\n' "${target}"
        printf 'arch=%s\n' "${target_arch}"
        printf 'artifact=%s\n' "${artifact_kind}"
        printf 'chunk=%s\n' "${WASI_MAX_CHUNK}"
        printf 'c2w_flags=%s\n' "${C2W_EXTRA_FLAGS}"
        printf 'script_version=2026-05-05-rust-base-plus-cargo-cache\n'
        if command -v "${C2W}" >/dev/null 2>&1; then
            "${C2W}" --version 2>/dev/null || true
        fi
        while IFS= read -r -d '' file; do
            local rel="${file#"${image_dir}/"}"
            if [ "${artifact_kind}" = "image" ]; then
                case "${rel}" in
                    Dockerfile.cache|c2w-rust-prebundle/*)
                        continue
                        ;;
                esac
            elif [ "${artifact_kind}" = "cargo-cache" ]; then
                case "${rel}" in
                    Dockerfile|hydrate-rust-cache.sh)
                        continue
                        ;;
                esac
            fi
            printf 'file=%s\n' "${rel}"
            sha256sum "${file}"
        done < <(find "${image_dir}" -type f -print0 | sort -z)
    } | sha256sum | awk '{print $1}'
}

has_existing_chunks() {
    local output_name="$1"
    local chunks=()
    shopt -s nullglob
    chunks=("${DEST}/${output_name}"*.wasm)
    shopt -u nullglob
    [ "${#chunks[@]}" -gt 0 ]
}

cleanup_removed_images() {
    if [ "${CLEAN_REMOVED_IMAGES}" != "1" ]; then
        return 0
    fi

    local keep_prefixes=()
    local image
    for image in ${IMAGES}; do
        keep_prefixes+=("${image}-container")
        keep_prefixes+=("${image}-cargo-cache")
    done

    local candidates=()
    shopt -s nullglob
    candidates=(
        "${DEST}"/*-container*.wasm
        "${DEST}"/*-container.manifest.json
        "${DEST}"/.*-container.sha256
        "${DEST}"/*-cargo-cache.tar.gz
        "${DEST}"/*-cargo-cache.manifest.json
        "${DEST}"/.*-cargo-cache.sha256
    )
    shopt -u nullglob

    local path
    for path in "${candidates[@]}"; do
        local base
        base="$(basename "${path}")"
        local keep=0
        local prefix
        for prefix in "${keep_prefixes[@]}"; do
            if [[ "${base}" == "${prefix}"* || "${base}" == ".${prefix}"* ]]; then
                keep=1
                break
            fi
        done
        if [ "${keep}" -eq 0 ]; then
            echo "Removing stale container artifact ${path}"
            rm -f "${path}"
        fi
    done
}

build_wasi_image() {
    local image_name="$1"
    local image_dir="$2"
    local output_name="$3"
    local target_arch="$4"
    local target="$5"
    local hash="$6"
    local hash_file="${DEST}/.${output_name}.sha256"
    local manifest_file="${DEST}/${output_name}.manifest.json"
    local tmp_wasm="${DEST}/.${output_name}.$$.wasm"

    if [ "${target}" != "wasi" ]; then
        echo "unsupported target '${target}' for ${image_name}; only wasi is enabled in this demo"
        exit 1
    fi

    if [ "${FORCE_REBUILD}" != "1" ] \
        && [ -f "${hash_file}" ] \
        && [ "$(cat "${hash_file}")" = "${hash}" ] \
        && [ -f "${manifest_file}" ] \
        && has_existing_chunks "${output_name}"; then
        echo "Skipping ${image_name}; source files unchanged and chunks already exist in ${DEST}"
        return 0
    fi

    echo "Building ${image_name}..."
    rm -f "${DEST}/${output_name}"*.wasm "${manifest_file}" "${hash_file}" "${tmp_wasm}"

    if [ -s "${image_dir}/image" ]; then
        local source_image
        source_image="$(tr -d '\r\n[:space:]' < "${image_dir}/image")"
        if [ -z "${source_image}" ]; then
            echo "empty image source found for ${image_name}"
            exit 1
        fi
        "${C2W}" --target-arch="${target_arch}" "${C2W_EXTRA_FLAGS_A[@]}" "${source_image}" "${tmp_wasm}"
    elif [ -s "${image_dir}/Dockerfile" ]; then
        "${DOCKER}" buildx build --progress=plain -t "${image_name}" --platform="linux/${target_arch}" --load "${image_dir}"
        "${C2W}" --target-arch="${target_arch}" "${C2W_EXTRA_FLAGS_A[@]}" "${image_name}" "${tmp_wasm}"
    else
        echo "no image source found for ${image_name}"
        exit 1
    fi

    split -d -b "${WASI_MAX_CHUNK}" --additional-suffix=.wasm "${tmp_wasm}" "${DEST}/${output_name}"
    rm -f "${tmp_wasm}"

    local chunk_paths=()
    shopt -s nullglob
    chunk_paths=("${DEST}/${output_name}"*.wasm)
    shopt -u nullglob
    if [ "${#chunk_paths[@]}" -eq 0 ]; then
        echo "split did not create any chunks for ${output_name}"
        exit 1
    fi
    mapfile -t chunk_paths < <(printf '%s\n' "${chunk_paths[@]}" | sort)

    local generated_at
    generated_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    {
        printf '{\n'
        printf '  "name": "%s",\n' "${output_name}"
        printf '  "source": "%s",\n' "${image_name}"
        printf '  "target": "%s",\n' "${target}"
        printf '  "arch": "%s",\n' "${target_arch}"
        printf '  "chunkSize": "%s",\n' "${WASI_MAX_CHUNK}"
        printf '  "chunks": %s,\n' "${#chunk_paths[@]}"
        printf '  "sourceHash": "%s",\n' "${hash}"
        printf '  "generatedAt": "%s",\n' "${generated_at}"
        printf '  "files": [\n'
        local idx
        for idx in "${!chunk_paths[@]}"; do
            local file_name
            local comma=","
            file_name="$(basename "${chunk_paths[${idx}]}")"
            if [ "${idx}" -eq "$((${#chunk_paths[@]} - 1))" ]; then
                comma=""
            fi
            printf '    "%s"%s\n' "${file_name}" "${comma}"
        done
        printf '  ]\n'
        printf '}\n'
    } > "${manifest_file}"
    printf '%s\n' "${hash}" > "${hash_file}"
    echo "Built ${#chunk_paths[@]} chunk(s) for ${output_name} into ${DEST}"
}

build_cargo_cache_asset() {
    local image_name="$1"
    local image_dir="$2"
    local output_name="$3"
    local target_arch="$4"
    local hash="$5"
    local dockerfile="${image_dir}/Dockerfile.cache"
    local hash_file="${DEST}/.${output_name}.sha256"
    local manifest_file="${DEST}/${output_name}.manifest.json"
    local archive_file="${DEST}/${output_name}.tar.gz"
    local tmp_root="${DEST}/.${output_name}.$$"
    local tmp_output="${tmp_root}/rootfs"
    local tmp_archive="${DEST}/.${output_name}.$$.tar.gz"

    if [ ! -f "${dockerfile}" ]; then
        echo "No Rust development cache Dockerfile for ${image_name}; skipping cache asset"
        return 0
    fi

    if [ "${FORCE_REBUILD}" != "1" ] \
        && [ -f "${hash_file}" ] \
        && [ "$(cat "${hash_file}")" = "${hash}" ] \
        && [ -f "${manifest_file}" ] \
        && [ -f "${archive_file}" ]; then
        echo "Skipping ${output_name}; cache inputs unchanged and archive already exists in ${DEST}"
        return 0
    fi

    echo "Building Rust development cache asset ${output_name}..."
    rm -rf "${tmp_root}" "${tmp_archive}" "${archive_file}" "${manifest_file}" "${hash_file}"
    mkdir -p "${tmp_output}"

    "${DOCKER}" buildx build \
        --progress=plain \
        --platform="linux/${target_arch}" \
        -f "${dockerfile}" \
        --target export \
        --output "type=local,dest=${tmp_output}" \
        "${image_dir}"

    tar -C "${tmp_output}" -czf "${tmp_archive}" .
    rm -rf "${tmp_root}"
    mv "${tmp_archive}" "${archive_file}"

    local archive_sha
    local archive_bytes
    local generated_at
    archive_sha="$(sha256sum "${archive_file}" | awk '{print $1}')"
    archive_bytes="$(wc -c < "${archive_file}" | tr -d '[:space:]')"
    generated_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

    {
        printf '{\n'
        printf '  "name": "%s",\n' "${output_name}"
        printf '  "source": "%s",\n' "${image_name}"
        printf '  "target": "cargo-cache",\n'
        printf '  "arch": "%s",\n' "${target_arch}"
        printf '  "format": "tar.gz",\n'
        printf '  "sourceHash": "%s",\n' "${hash}"
        printf '  "archiveHash": "%s",\n' "${archive_sha}"
        printf '  "bytes": %s,\n' "${archive_bytes}"
        printf '  "generatedAt": "%s",\n' "${generated_at}"
        printf '  "files": [\n'
        printf '    "%s.tar.gz"\n' "${output_name}"
        printf '  ]\n'
        printf '}\n'
    } > "${manifest_file}"
    printf '%s\n' "${hash}" > "${hash_file}"
    echo "Built Rust development cache asset ${archive_file} (${archive_bytes} bytes)"
}

trap cleanup_docker_save_compat EXIT
setup_docker_save_compat
setup_buildx_builder
copy_net_proxy
cleanup_removed_images

for image_name in ${IMAGES}; do
    image_dir="${SOURCE}/${image_name}"
    if [ ! -d "${image_dir}" ]; then
        echo "image source directory not found: ${image_dir}"
        exit 1
    fi

    target="$(read_trimmed_file "${image_dir}/target" "wasi")"
    target_arch="$(read_trimmed_file "${image_dir}/arch" "amd64")"
    output_name="${image_name}-container"
    cache_output_name="${image_name}-cargo-cache"
    image_hash="$(source_hash "${image_dir}" "${image_name}" "${target_arch}" "${target}" "image")"
    cache_hash="$(source_hash "${image_dir}" "${image_name}" "${target_arch}" "${target}" "cargo-cache")"

    build_cargo_cache_asset "${image_name}" "${image_dir}" "${cache_output_name}" "${target_arch}" "${cache_hash}"
    build_wasi_image "${image_name}" "${image_dir}" "${output_name}" "${target_arch}" "${target}" "${image_hash}"
done
