# C2W Rust Project Editor

This repository builds a static browser demo and library surface for editing and running complete Rust Cargo projects inside a container2wasm-powered browser runtime.

The important delivery path is:

```powershell
docker compose up --build
```

That command builds the TypeScript browser assets, creates the prebundled Rust container image, converts it to WASI/WebAssembly chunks with container2wasm, and serves the finished static experience on `http://localhost:8080`.

## What Compose Delivers

`docker compose up --build` runs three services:

- `assets`: uses `node:22-alpine`, installs the local TypeScript toolchain, and emits browser JavaScript into `docs/dist`.
- `builder`: uses `Dockerfile.c2w-builder`, downloads the configured container2wasm release, builds `src/amd64-debian-wasi/Dockerfile`, converts that Linux Rust image to WASI, splits the output into loadable chunks under `docs/containers`, and copies `c2w-net-proxy.wasm` into `docs/src`.
- `runner`: uses `httpd:2.4-alpine`, serves `docs/`, and injects the cross-origin isolation headers required by the browser WASI runtime.

The running page is `docs/index.html`. It mounts two independent Cargo project editors that share one Rust container runtime and one terminal bridge. Each editor can write `Cargo.toml`, `src/lib.rs`, and `src/main.rs` into its own container folder, fetch cached dependencies, compile with Cargo, run the binary, show compiler diagnostics, and export the complete project as a zip.

## Generated Artifacts

After a successful build, the useful delivery payload is:

- `docs/dist/`: compiled browser runtime, project editor, worker, WASI, and wrapper scripts.
- `docs/containers/`: `amd64-debian-wasi-container.manifest.json` plus `amd64-debian-wasi-container*.wasm` chunks.
- `docs/src/c2w-net-proxy.wasm`: network proxy asset used by container2wasm.
- `docs/extras/` and `docs/src/browser_wasi_shim/`: supporting WASI assets.
- `docs/index.html`: static demo page that wires the runtime and editor together.

## Rust Environment

The browser container is built from `rust:1.88.0-slim-bookworm` and is configured for offline Cargo use after image creation.

Preinstalled system tools and libraries include:

- `bash`, `build-essential`, `coreutils`, `tar`, `zip`, `unzip`
- `clang`, `libclang-dev`, `libffi-dev`
- `openmpi-bin`, `libopenmpi-dev`
- `pkg-config`, `protobuf-compiler`
- Rust target `wasm32-unknown-unknown`
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

If you want a new third-party crate to work inside the browser container without network access, add it to `src/amd64-debian-wasi/c2w-rust-prebundle/Cargo.toml`, regenerate `Cargo.lock`, and rebuild the image.

## Run Locally

Prerequisites:

- Docker and Docker Compose.
- Enough Docker/BuildKit memory for container2wasm packing. The compose defaults request a `24g` Buildx memory limit and `32g` memory+swap limit for the conversion builder.
- Network access for the first build, because the build downloads Node packages, container2wasm, Rust crates for the prebundle, and base images.

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

Force regeneration of the WASM container chunks:

```powershell
$env:FORCE_REBUILD = "1"
docker compose up --build
```

Increase Buildx memory for a larger Docker Desktop or CI machine:

```powershell
$env:C2W_BUILDX_MEMORY = "32g"
$env:C2W_BUILDX_MEMORY_SWAP = "48g"
$env:C2W_BUILDX_RECREATE = "1"
docker compose up --build
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

`.github/workflows/publish-container-files.yml` builds the same compose path in CI:

```bash
docker compose up --build --exit-code-from builder builder
```

It then stages the generated `docs/containers` files, adds `SHA256SUMS.txt`, uploads a workflow artifact copy, and creates a GitHub Release containing the WASM container payload.
