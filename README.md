# C2W Rust Project Editor

This repository builds a static browser demo and library surface for editing and running complete Rust Cargo projects inside a container2wasm-powered browser runtime.

The important delivery path is:

```powershell
docker compose up --build
```

That command builds the TypeScript browser assets, serves the static experience on `http://localhost:8080`, and loads the prebuilt c2w runtime chunks from the configured GitHub Release.

## What Compose Delivers

`docker compose up --build` runs two services by default:

- `assets`: uses `node:22-alpine`, installs the local TypeScript toolchain, and emits browser JavaScript into `docs/dist`.
- `runner`: uses `httpd:2.4-alpine`, serves `docs/`, injects the cross-origin isolation headers required by the browser WASI runtime, and proxies `/release-assets/<tag>/` to the public GitHub Release assets.

The optional `builder` service is behind the `local-image` profile. It exists for regenerating c2w chunks locally, but normal demo startup no longer depends on local `docs/containers` output.

The running page is `docs/index.html`. It mounts two independent Cargo project editors that share one Rust container runtime and one terminal bridge. Each editor can write `Cargo.toml`, `src/lib.rs`, and `src/main.rs` into its own container folder, fetch cached dependencies, compile with Cargo, run the binary, show compiler diagnostics, and export the complete project as a zip.

## Generated Artifacts

After a successful release build, the useful delivery payload is:

- `docs/dist/`: compiled browser runtime, project editor, worker, WASI, and wrapper scripts.
- GitHub Release assets:
  - `amd64-debian-wasi-container.manifest.json` plus the split `amd64-debian-wasi-container*.wasm` runtime chunks.
  - `amd64-debian-wasi-cargo-cache.manifest.json` and `amd64-debian-wasi-cargo-cache.tar.gz`, the hydrated Rust toolchain, native development packages, Cargo registry/git cache, and Rust helper tools.
- `docs/src/c2w-net-proxy.wasm`: network proxy asset used by container2wasm.
- `docs/extras/` and `docs/src/browser_wasi_shim/`: supporting WASI assets.
- `docs/index.html`: static demo page that wires the runtime and editor together.

At runtime, the worker downloads release chunks progressively, reports chunk-level progress in the status strip, stores chunks in Cache Storage, and reuses cached chunks on reload. After the runtime instantiates, the Rust wrapper runs `hydrate-rust-cache` inside the container. That script downloads `amd64-debian-wasi-cargo-cache.tar.gz` from the same GitHub Release through the browser-backed c2w network proxy, unpacks it into the container filesystem, and leaves Cargo in offline mode.

The default browser URL for the image payload is same-origin `/release-assets/1.0.1/`, which the local Apache container proxies to GitHub's stable release download URLs. You can point at a newer release with `?releaseTag=<tag>`, or override the browser image host with `?containerBase=...` only if that alternate host is CORS-readable from the browser. The in-container Rust cache download can be overridden with `?rustCacheUrl=...`.

The old all-in-one `1.0.1` image is about 1.97 GiB when its chunks are assembled into a single WebAssembly module. Chromium rejects that module with a 1 GiB `WebAssembly.instantiate()` buffer limit, so this split keeps the bulky Rust development payload out of the boot image. Publish a new release from this tree and use `?releaseTag=<tag>` until the default tag is bumped.

## Rust Environment

The converted c2w boot image is intentionally small. It is built from `debian:bookworm-slim` and contains only the shell plus the tools needed to start the runtime and hydrate the larger Rust development payload.

Boot image tools include:

- `bash`, `coreutils`, `curl`, `gzip`, `tar`, `zip`, `unzip`
- `findutils`, `mawk`, `sed`, `ca-certificates`

The release cache asset is built from `rust:1.88.0-slim-bookworm` and is unpacked into the running container after WebAssembly instantiation. Once hydrated, the runtime has:

- Rust `1.88.0`, Cargo, rustup, and target `wasm32-unknown-unknown`
- `build-essential`, `clang`, `libclang-dev`, `libffi-dev`
- `openmpi-bin`, `libopenmpi-dev`
- `git`, `pkg-config`, `protobuf-compiler`
- `wasm-bindgen-cli` `0.2.120`

Precached Cargo crates include the external libraries covered by the study material:

- `anyhow`
- `crossbeam`
- `futures`
- `mpi`
- `ouroboros`
- `prost`
- `rayon`
- `serde` with `derive`
- `serde_json`
- `self_cell`
- `thiserror`
- `tokio` with `full`
- `tonic`
- `tracing`
- `tracing-subscriber`
- `wasm-bindgen`

Rust standard-library items from the notes, such as `Arc`, `Mutex`, `Cell`, `RefCell`, `Iterator`, `catch_unwind`, `std::fs`, and `std::thread`, do not need installation. They are available with the Rust toolchain itself.

If you want a new third-party crate to work inside the browser container without network access, add it to `src/amd64-debian-wasi/c2w-rust-prebundle/Cargo.toml`, regenerate `Cargo.lock`, and rebuild the release artifacts. The cache asset should change; the base c2w image only changes when the system image inputs change.

## Run Locally

Prerequisites:

- Docker and Docker Compose.
- Network access for the first run, because the browser downloads the release container chunks and caches them.

Start the full demo:

```powershell
docker compose up --build
```

Open:

```text
http://localhost:8080
```

Use another port:

```powershell
$env:HTTP_PORT = "8090"
docker compose up --build
```

Regenerate WASM container chunks locally:

```powershell
$env:COMPOSE_PROFILES = "local-image"
$env:FORCE_REBUILD = "1"
docker compose up --build builder
```

Increase Buildx memory for a larger Docker Desktop or CI machine:

```powershell
$env:COMPOSE_PROFILES = "local-image"
$env:C2W_BUILDX_MEMORY = "32g"
$env:C2W_BUILDX_MEMORY_SWAP = "48g"
$env:C2W_BUILDX_RECREATE = "1"
docker compose up --build builder
```

Stop the local server:

```powershell
docker compose down --remove-orphans
```

## GitHub Actions Infrastructure

The release workflow runs on GitHub-hosted Linux infrastructure:

```yaml
runs-on: ubuntu-latest
```

That is GitHub-provided infrastructure, not a self-hosted runner. The Docker base images are still defined by `docker-compose.yml`, `Dockerfile.c2w-builder`, and `src/amd64-debian-wasi/Dockerfile`.

The container2wasm conversion can be memory-sensitive. If the hosted runner is too small for a future image, move the workflow back to a larger runner or reduce the generated image size.

## Release Workflow

`.github/workflows/publish-container-files.yml` builds the same local-image compose path in CI:

```bash
docker compose --profile local-image up --build --exit-code-from builder builder
```

It then stages the generated `docs/containers` files, adds `SHA256SUMS.txt`, uploads a workflow artifact copy, and creates a GitHub Release containing both the WASM runtime chunks and the Rust development cache tarball.
