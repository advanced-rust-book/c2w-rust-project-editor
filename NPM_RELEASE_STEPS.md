# Steps to Release as an npm Package

This project can be published as an installable browser library, but the c2w runtime is asset-heavy. The current `docs/containers` image payload is about 812 MB before npm tarball compression, so do a local `npm pack --dry-run` and confirm the registry accepts the final package before announcing it.

## Recommended Release Shape

Publish a browser asset package with this public layout:

```text
package-root/
  package.json
  README.md
  LICENSE
  dist/
    c2w-rust-project-editor.js
    rust-wrapper.js
    page.js
    stack.js
    stack-worker.js
    worker.js
    worker-util.js
    wasi-util.js
    amd64-debian-wasi.js
    coi-config.js
  containers/
    amd64-debian-wasi-container.manifest.json
    amd64-debian-wasi-container00.wasm
    ...
    amd64-debian-wasi-container17.wasm
    .amd64-debian-wasi-container.sha256
  src/
    c2w-net-proxy.wasm
    browser_wasi_shim/
      index.js
      wasi_defs.js
  extras/
    base.wasm.gzip
    imagemounter.wasm.gzip
  coi-serviceworker.js
```

Keep `dist/`, `containers/`, `src/`, and `extras/` as siblings. `dist/amd64-debian-wasi.js` currently resolves `./dist/worker.js`, `./containers/amd64-debian-wasi-container*`, and `./src/c2w-net-proxy.wasm` relative to the served page.

## 1. Prepare package metadata

The root `package.json` is currently a private demo package, so do not publish it as-is. Either convert it or create a clean staging directory.

Use a scoped name if possible:

```json
{
  "name": "@your-scope/c2w-rust-project-editor",
  "version": "0.1.0",
  "description": "Browser Rust/Cargo project editor backed by container2wasm.",
  "license": "Apache-2.0",
  "private": false,
  "type": "commonjs",
  "main": "dist/c2w-rust-project-editor.js",
  "files": [
    "dist/",
    "containers/",
    "src/c2w-net-proxy.wasm",
    "src/browser_wasi_shim/",
    "extras/",
    "coi-serviceworker.js",
    "README.md",
    "LICENSE"
  ],
  "exports": {
    "./dist/*": "./dist/*",
    "./containers/*": "./containers/*",
    "./src/*": "./src/*",
    "./extras/*": "./extras/*",
    "./coi-serviceworker.js": "./coi-serviceworker.js",
    "./package.json": "./package.json"
  }
}
```

If you publish from a staging directory instead of repo root, copy the already-built assets into that directory and use the same `files` list there.

Pre-release cleanup tasks:

- Move the editor CSS that currently lives in `docs/index.html` into a distributable file such as `dist/c2w-rust-project-editor.css`, then include it in `files`.
- Optionally emit `.d.ts` declarations for `C2WRustEditor`, `RustContainerWrapper`, and the project config types.
- Keep `private: false` only in the release package. The demo repo root can stay private while you publish from `npm-release/`.

## 2. Build and verify c2w artifacts

Run the normal project build:

```powershell
npm run typecheck
npm run build
```

For the larger prebundled Rust image, use the high-memory Buildx defaults from
`docker-compose.yml` or override them explicitly:

```powershell
$env:C2W_BUILDX_MEMORY = "32g"
$env:C2W_BUILDX_MEMORY_SWAP = "48g"
$env:C2W_BUILDX_RECREATE = "1"
docker compose up --build
```

The failure mode to watch for is `bochs-dev-packed` dying during
`wasi-vfs pack ... --mapdir /pack::/minpack`. That is c2w embedding the generated
container disk into the wasm artifact; it needs Docker/BuildKit memory, not just
a larger final chunk size. If Docker Desktop or WSL has a lower VM memory limit,
increase that outside the repo before rebuilding.

Verify the required runtime files exist:

```powershell
Test-Path docs\dist\c2w-rust-project-editor.js
Test-Path docs\dist\rust-wrapper.js
Test-Path docs\dist\page.js
Test-Path docs\dist\worker.js
Test-Path docs\dist\stack-worker.js
Test-Path docs\src\c2w-net-proxy.wasm
Test-Path docs\containers\amd64-debian-wasi-container.manifest.json
Get-ChildItem docs\containers\amd64-debian-wasi-container*.wasm | Measure-Object
```

Expected image chunks for the current build: `amd64-debian-wasi-container00.wasm` through `amd64-debian-wasi-container17.wasm`.

To publish the generated container chunks as GitHub Release assets instead of
copying them by hand, run the manual `Publish container files` workflow from the
branch picker and provide the release tag name. It creates the tag at the
selected branch's current commit and fills the release README/body with a link
and checksum for every uploaded container file.

## 3. Create a release staging directory

Use a clean folder so `LICENSE.zip`, `safe*.zip`, Chrome profiles, source notes, and local experiments cannot leak into npm.

```powershell
$pkg = "npm-release"
Remove-Item -Recurse -Force $pkg -ErrorAction SilentlyContinue
New-Item -ItemType Directory $pkg | Out-Null

Copy-Item docs\dist $pkg\dist -Recurse
Copy-Item docs\containers $pkg\containers -Recurse
New-Item -ItemType Directory $pkg\src -Force | Out-Null
Copy-Item docs\src\c2w-net-proxy.wasm $pkg\src\c2w-net-proxy.wasm -Force
New-Item -ItemType Directory $pkg\src\browser_wasi_shim -Force | Out-Null
Copy-Item docs\src\browser_wasi_shim\* $pkg\src\browser_wasi_shim -Recurse
Copy-Item docs\extras $pkg\extras -Recurse
Copy-Item docs\coi-serviceworker.js $pkg\coi-serviceworker.js
Copy-Item README.md $pkg\README.md
Copy-Item LICENSE $pkg\LICENSE
```

Then add the release `package.json` shown above to `npm-release/package.json`.

## 4. Confirm package contents before publishing

From the staging directory:

```powershell
cd npm-release
npm pack --dry-run
npm pack
cd ..
New-Item -ItemType Directory npm-release-smoke -Force | Out-Null
cd npm-release-smoke
npm init -y
npm install ..\npm-release\your-scope-c2w-rust-project-editor-0.1.0.tgz
```

Inspect the `npm pack --dry-run` file list. It must include:

- `dist/c2w-rust-project-editor.js`
- `dist/rust-wrapper.js`
- `dist/page.js`
- `dist/worker.js`
- `dist/stack-worker.js`
- `containers/amd64-debian-wasi-container.manifest.json`
- every `containers/amd64-debian-wasi-container*.wasm` chunk
- `src/c2w-net-proxy.wasm`
- `src/browser_wasi_shim/index.js`
- `src/browser_wasi_shim/wasi_defs.js`
- `coi-serviceworker.js`

If any artifact is missing, fix `files` before publishing.

## 5. Consumer install and copy step

Consumers install the package:

```bash
npm install @your-scope/c2w-rust-project-editor
```

Browser apps must serve the package assets from a public URL; bundlers do not automatically expose these large WASM image chunks from `node_modules`.

Example app copy script:

```json
{
  "scripts": {
    "copy:c2w": "node scripts/copy-c2w-assets.js"
  }
}
```

```js
// scripts/copy-c2w-assets.js
const fs = require("fs");
const path = require("path");

const from = path.dirname(require.resolve("@your-scope/c2w-rust-project-editor/package.json"));
const to = path.join(process.cwd(), "public", "c2w");

fs.rmSync(to, { recursive: true, force: true });
fs.mkdirSync(to, { recursive: true });

for (const name of ["dist", "containers", "src", "extras"]) {
  fs.cpSync(path.join(from, name), path.join(to, name), { recursive: true });
}
fs.copyFileSync(path.join(from, "coi-serviceworker.js"), path.join(to, "coi-serviceworker.js"));
```

Then serve `/c2w/` with cross-origin isolation headers:

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

The page must load `xterm`, `xterm-pty`, `dist/page.js`, `dist/rust-wrapper.js`, `dist/c2w-rust-project-editor.js`, and `dist/amd64-debian-wasi.js` from the same `/c2w/` asset root. Do not use `?net=none`; Cargo dependencies need the c2w network proxy.

## 6. Publish

Before the first publish:

```bash
npm login
npm whoami
```

For a public scoped package:

```bash
npm publish --access public
```

For later releases:

```bash
npm version patch
npm publish --access public
```

Use `minor` or `major` instead of `patch` when the public editor API changes.

## 7. Optional split-package strategy

If the full package is too large for npm or unpleasant for consumers, split it:

- `@your-scope/c2w-rust-project-editor`: small JS/CSS/library package.
- `@your-scope/c2w-rust-project-editor-amd64-debian-image`: huge `containers/`, `src/`, and `extras/` asset package.

The app copy script can then copy JS from the first package and c2w image/runtime artifacts from the second. This is usually friendlier because users who already host their own container image do not need to download the 800 MB default image.
