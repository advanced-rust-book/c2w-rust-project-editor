# C2W Rust Project Editor

This repository builds a static browser demo and library surface for editing and running complete Rust Cargo projects inside a container2wasm-powered browser runtime.

The important delivery path is:

```powershell
docker compose up --build
```

That command builds the TypeScript browser assets, serves the static experience on `http://localhost:8080`, and loads the prebuilt c2w runtime chunks from `docs/containers`.

`docker compose up --build` runs in the foreground by design. After the `assets` service exits successfully, the `runner` service keeps Apache attached to the terminal so the browser page stays available. Stop it with one `Ctrl+C`, or from another terminal with `docker compose down --remove-orphans`.

## What Compose Delivers

`docker compose up --build` runs two services by default:

- `assets`: uses `node:22-alpine`, installs the local TypeScript toolchain, and emits browser JavaScript into `docs/dist`.
- `runner`: uses `httpd:2.4-alpine`, serves `docs/`, and injects the cross-origin isolation headers required by the browser WASI runtime.

The optional `builder` service is behind the `local-image` profile. It regenerates the c2w browser runtime artifacts in `docs/containers`.

The running page is `docs/index.html`. It mounts two independent Cargo project editors plus a bottom debug terminal panel that share one Rust container runtime and one terminal bridge. Each editor can write `Cargo.toml`, `src/lib.rs`, and `src/main.rs` into its own container folder, fetch cached dependencies, compile with Cargo, run the binary, show compiler diagnostics, and export the complete project as a zip.

## Generated Artifacts

After a successful release build, the useful delivery payload is:

- `docs/dist/`: compiled browser runtime, project editor, worker, WASI, and wrapper scripts.
- `docs/containers/amd64-debian-wasi-container.manifest.json` plus the generated c2w runtime artifacts. The default local build now uses `c2w --to-js --build-arg LOAD_MODE=separated --build-arg VM_MEMORY_SIZE_MB=2047 --build-arg QEMU_MIGRATION=false`, so the browser payload is emitted under `docs/containers/amd64-debian-wasi-container/`.
- `docs/src/c2w-net-proxy.wasm`: network proxy asset used by container2wasm.
- `docs/extras/` and `docs/src/browser_wasi_shim/`: supporting WASI assets.
- `docs/index.html`: static demo page that wires the runtime and editor together.

At runtime, the default manifest points the app at `docs/emscripten.html`, which loads the generated separated c2w JavaScript, wasm, and data files. There is no runtime Rust cache archive: the wrapper only checks that `rustc`, `cargo`, and `wasm-bindgen` are already present in the c2w image.

The default browser URL for the image payload is same-origin `./containers/`, so the `docs/` folder can be served by any static web server. You can override the asset directory with `?assetBase=<url-or-relative-path>`.

The old all-in-one `1.0.1` image was about 1.97 GiB when its chunks were assembled into a single WebAssembly module. The current image is still split into browser-sized `.wasm` chunks, but it is one ready-to-use c2w image with the Rust environment expanded in place and trimmed to avoid niche native stacks.

## Rust Environment

The Docker build uses `rust:1.88.0-slim-bookworm` and leaves the Rust environment expanded in the final image. When the WebAssembly runtime starts, the container already has:

- Rust `1.88.0`, Cargo, and target `wasm32-unknown-unknown`
- GNU linker support for Cargo's default native target, plus `make`, `pkg-config`, and the usual Debian shell/core utilities
- `curl`, `tar`, `zip`, and `unzip`
- `wasm-bindgen` `0.2.120`

The image intentionally does not install `clang`, `libclang-dev`, `libffi-dev`, `openmpi-bin`, `libopenmpi-dev`, or `protobuf-compiler`. It also trims the Rustup proxy, `rustdoc`, GCC's C compiler/LTO internals, and sanitizer-only files after the preloaded Rust environment is built. Pure Rust crates and the preloaded examples build offline; crates that compile C/C++ code need those native tools added back.

Precached Cargo crates include the external libraries covered by the study material:

- `anyhow`
- `crossbeam`
- `futures`
- `ouroboros`
- `rayon`
- `serde` with `derive`
- `serde_json`
- `self_cell`
- `thiserror`
- `tokio` with runtime, macros, sync, and time features
- `tracing`
- `tracing-subscriber`
- `wasm-bindgen`

Rust standard-library items from the notes, such as `Arc`, `Mutex`, `Cell`, `RefCell`, `Iterator`, `catch_unwind`, `std::fs`, and `std::thread`, do not need installation. They are available with the Rust toolchain itself.

If you want a new third-party crate to work inside the browser container without network access, add it to `src/amd64-debian-wasi/c2w-rust-prebundle/Cargo.toml`, regenerate `Cargo.lock`, and rebuild the release artifacts. Avoid crates that require large native toolchains unless you are also prepared to add their system packages back to the Docker image.

## Run Locally

Prerequisites:

- Docker and Docker Compose.
- Network access for the first run if `docs/containers` is not already populated, because the builder downloads Docker and Cargo inputs before producing the static chunks.

Start the full demo:

```powershell
docker compose up --build
```

The command is ready when the `runner` service prints `Ready: http://localhost:8080`; it will then stay attached until you stop the local server.

Open:

```text
http://localhost:8080
```

Use another port:

```powershell
$env:HTTP_PORT = "8090"
docker compose up --build
```

Regenerate c2w browser runtime artifacts locally:

```powershell
$env:COMPOSE_PROFILES = "local-image"
$env:FORCE_REBUILD = "1"
docker compose up --build builder
```

The default builder flags are:

```text
--to-js --build-arg LOAD_MODE=separated --build-arg VM_MEMORY_SIZE_MB=2047 --build-arg QEMU_MIGRATION=false
```

Set `C2W_EXTRA_FLAGS` to a non-empty value to override them for a one-off build.
The generated c2w Dockerfile is patched so QEMU's Emscripten build uses
`-sINITIAL_MEMORY=512MB -sALLOW_MEMORY_GROWTH=1 -sMAXIMUM_MEMORY=4GB` instead of
the fixed `-sTOTAL_MEMORY` heap. The browser QEMU build still rejects exactly
`2048M`, so the default guest RAM is `2047M`. Migration is disabled because
c2w's separated output does not emit the `vm.state` file referenced by the
generated migration args.
For local reliability, the JS conversion also patches c2w's helper build stages
from Ubuntu to Debian by default because some networks fail DNS lookups for the
Ubuntu archive hosts; set `C2W_PATCH_UBUNTU_BASES=0` to use c2w's embedded
Dockerfile unchanged.

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

It then stages the generated `docs/containers` files, verifies that the runtime manifest and separated JS/wasm/data payload exist, adds `SHA256SUMS.txt`, uploads a workflow artifact copy, and creates a GitHub Release containing the browser runtime payload.
