let worker: Worker | undefined;
let stackWorker: Worker | undefined;
let activeWasiTerminal: ActiveWasiTerminal | undefined;
let activeWasiInputReady = false;
let activeWasiOutputText = "";

const PTY_OUTPUT_CAPTURE_LIMIT = 16 * 1024 * 1024;
const DIRECT_FS_RESPONSE_TIMEOUT_MS = 300000;
const DIRECT_FS_CONTROL_BEGIN = "\x1b]777;container2wasm-direct-fs;";
const DIRECT_FS_CONTROL_END = "\x07";
const DIRECT_FS_CONTROL_INPUT_CHUNK_SIZE = 64 * 1024;
const DIRECT_FS_CONTROL_SEND_TIMEOUT_MS = 30000;
const DIRECT_FS_CONTROL_CHUNKED_WRITE_THRESHOLD_BYTES = 512 * 1024;
const DIRECT_FS_CONTROL_WRITE_CHUNK_BYTES = 4 * 1024 * 1024;
const DIRECT_FS_SHARED_WRITE_HEADER_BYTES = 16;
const DIRECT_FS_SHARED_WRITE_BUFFER_BYTES = 8 * 1024 * 1024;
const DIRECT_FS_SHARED_WRITE_MIN_BUFFER_BYTES = 1024;
const DIRECT_FS_PAGE_INFO_LOGGING = /^(1|true|yes|on)$/i.test(new URLSearchParams(location.search).get("directFsDebug") || "");
const DIRECT_FS_DEFAULT_MOUNTS = [
    {
        mountPoint: "/tmp/rust-wrapper-direct-io",
        label: "Rust wrapper direct I/O staging",
    },
];

interface BrowserFileSystemDirectoryHandle {
    readonly kind?: string;
    readonly name?: string;
}

interface BrowserFileSystemAccessWindow {
    showDirectoryPicker?: (options?: { mode?: "read" | "readwrite" }) => Promise<BrowserFileSystemDirectoryHandle>;
}

interface ContainerManifest {
    files?: unknown;
    chunks?: unknown;
    name?: unknown;
    sourceHash?: unknown;
    generatedAt?: unknown;
}

interface WasiStartConfig {
    elemId: string;
    workerFileName: string;
    workerImageNamePrefix: string;
    workerImageChunks: WasmImageChunks;
}

interface WasiRuntimeMount {
    kind: "directory" | "file";
    mountPoint: string;
    label: string;
    dirHandle?: BrowserFileSystemDirectoryHandle;
    file?: File;
    fileName?: string;
}

interface ManagedWasiDirectFsFile {
    data: Uint8Array;
    lastModified: number;
}

interface ManagedWasiDirectFsMount {
    mountPoint: string;
    label: string;
    files: Map<string, ManagedWasiDirectFsFile>;
}

interface DirectFsWorkerResponse {
    type: "direct-fs-response";
    requestId: string;
    ok: boolean;
    error?: string;
    data?: ArrayBuffer;
    paths?: string[];
    size?: number;
}

interface PendingDirectFsRequest {
    resolve: (response: DirectFsWorkerResponse) => void;
    reject: (error: Error) => void;
    timeoutHandle: number;
}

interface DirectFsSharedWriteChannel {
    buffer: SharedArrayBuffer;
    header: Int32Array;
    data: Uint8Array;
    sequence: number;
}

interface DirectFsSharedWriteCapacityEstimate {
    bytes: number;
    attempts: number;
    lowerBound: number;
    upperBound: number;
    algorithm: string;
    channel?: DirectFsSharedWriteChannel;
}

let currentWasiStartConfig: WasiStartConfig | undefined;
let pendingWasiRuntimeMounts: WasiRuntimeMount[] = [];
let directFsRequestSequence = 0;
let directFsWriteSequence = 0;

const pendingDirectFsRequests = new Map<string, PendingDirectFsRequest>();
const managedWasiDirectFsMounts = new Map<string, ManagedWasiDirectFsMount>();
let directFsControlQueue: Promise<void> = Promise.resolve();
let directFsSharedWriteChannel = createDirectFsSharedWriteChannel();
function startWasiFromManifest(
    elemId: string,
    workerFileName: string,
    workerImageNamePrefix: string,
    manifestFileName: string
): void {
    const statusElem = document.getElementById(elemId + "-status");
    if (statusElem) {
        statusElem.textContent = "Loading container manifest...";
    }

    fetchContainerManifest(manifestFileName, statusElem)
        .then((manifest) => {
            let chunkSpec: WasmImageChunks;
            let chunkCount: number;
            const manifestCacheKey = manifestCacheIdentity(manifest, manifestFileName);

            if (Array.isArray(manifest.files) && manifest.files.length > 0) {
                if (!manifest.files.every((file) => typeof file === "string" && file.length > 0)) {
                    throw new Error("invalid file list in " + manifestFileName);
                }
                chunkSpec = {
                    files: manifest.files as string[],
                    cacheKey: manifestCacheKey,
                };
                chunkCount = manifest.files.length;
            } else {
                chunkCount = Number(manifest.chunks);
                if (!Number.isInteger(chunkCount) || chunkCount <= 0) {
                    throw new Error("invalid chunk count in " + manifestFileName);
                }
                chunkSpec = chunkCount;
            }

            if (statusElem) {
                statusElem.textContent = "Starting container from " + chunkCount + " chunk(s)...";
            }
            startWasi(elemId, workerFileName, workerImageNamePrefix, chunkSpec);
        })
        .catch((err: unknown) => {
            console.error(err);
            if (statusElem) {
                statusElem.textContent = "Unable to load the release container image. Check the release asset proxy and reload this page.";
                setStatusClass(statusElem, true);
            }
        });
}

async function fetchContainerManifest(manifestFileName: string, statusElem: HTMLElement | null): Promise<ContainerManifest> {
    const request = new Request(manifestFileName, { credentials: "same-origin" });
    const cache = await openOptionalCache("c2w-container-manifests-v2");

    try {
        const resp = await fetch(request, { cache: "no-store" });
        if (!resp.ok) {
            throw new Error("failed to load " + manifestFileName + ": HTTP " + resp.status);
        }
        await cache?.put(request, resp.clone());
        return resp.json() as Promise<ContainerManifest>;
    } catch (error) {
        const cached = await cache?.match(request);
        if (cached) {
            if (statusElem) {
                statusElem.textContent = "Using cached container manifest because the latest manifest could not be fetched.";
            }
            return cached.json() as Promise<ContainerManifest>;
        }
        throw error;
    }
}

async function openOptionalCache(name: string): Promise<Cache | null> {
    if (typeof caches === "undefined") {
        return null;
    }
    try {
        return await caches.open(name);
    } catch (error) {
        console.warn("container manifest cache is unavailable:", error);
        return null;
    }
}

function manifestCacheIdentity(manifest: ContainerManifest, manifestFileName: string): string {
    const parts = [
        typeof manifest.name === "string" ? manifest.name : "",
        typeof manifest.sourceHash === "string" ? manifest.sourceHash : "",
        typeof manifest.generatedAt === "string" ? manifest.generatedAt : "",
    ].filter((part) => part.length > 0);
    return parts.length > 0 ? parts.join(":") : manifestFileName;
}

function startWasi(
    elemId: string,
    workerFileName: string,
    workerImageNamePrefix: string,
    workerImageChunks: WasmImageChunks
): void {
    currentWasiStartConfig = {
        elemId,
        workerFileName,
        workerImageNamePrefix,
        workerImageChunks,
    };
    stopActiveWasiTerminal(elemId);

    const container = document.getElementById(elemId);
    if (!container) {
        throw new Error("terminal element not found: " + elemId);
    }

    const xterm = new Terminal({
        convertEol: true,
        cursorBlink: true,
        scrollback: 20000,
    });
    xterm.open(container);
    container.addEventListener("pointerdown", focusActiveWasiTerminal);

    const { master, slave } = openpty();
    activeWasiInputReady = false;
    activeWasiOutputText = "";
    registerPtyOutputCapture(master);
    activeWasiTerminal = { xterm, master, slave };
    window.activeWasiTerminal = activeWasiTerminal;

    xterm.loadAddon(master);
    if (typeof xterm.focus === "function") {
        xterm.focus();
    }

    worker = new Worker(workerFileName);
    worker.addEventListener("message", handleWasiWorkerMessage);
    postDirectFsSharedWriteBuffer(worker);

    let networkStack: ((event: MessageEvent<unknown>) => void) | undefined;
    const netParam = getPageNetParam();
    if (!netParam || netParam.mode !== "none") {
        stackWorker = new Worker(new URL("./stack-worker.js" + location.search, new URL("./dist/", document.baseURI)).href);
        networkStack = newStack(
            worker,
            workerImageNamePrefix,
            workerImageChunks,
            stackWorker,
            new URL("./src/c2w-net-proxy.wasm", document.baseURI).href
        );
    }

    if (!networkStack) {
        worker.postMessage({ type: "init", imagename: workerImageNamePrefix, chunks: workerImageChunks });
    }

    postManagedDirectFsMounts(worker);
    postPendingWasiMounts(worker);

    new TtyServer(slave).start(worker, networkStack || null);
    activeWasiInputReady = true;

    const statusElem = document.getElementById(elemId + "-status");
    if (statusElem) {
        statusElem.textContent = "Container is starting." + configuredMountsSummary() + " The bash prompt will appear in the terminal.";
    }
}

function focusActiveWasiTerminal(): void {
    window.activeWasiTerminal?.xterm.focus?.();
}

function sendWasiInput(data: string): boolean {
    if (!activeWasiInputReady || !activeWasiTerminal?.xterm) {
        return false;
    }

    if (writeDirectlyToPty(activeWasiTerminal, data)) {
        return true;
    }

    /*
     * Fallback for xterm-pty builds that do not expose the line discipline.
     */
    const xterm = activeWasiTerminal.xterm;
    if (typeof xterm.focus === "function") {
        xterm.focus();
    }
    if (typeof xterm.input === "function") {
        xterm.input(data, false);
        return true;
    }
    if (typeof xterm.paste === "function") {
        xterm.paste(data);
        return true;
    }
    return false;
}

function writeDirectlyToPty(terminal: ActiveWasiTerminal, data: string): boolean {
    const writer = terminal.master.ldisc?.writeFromLower;
    if (typeof writer !== "function") {
        return false;
    }

    const originalTermios = terminal.slave.ioctl("TCGETS");
    try {
        const rawTermios = new Termios(
            originalTermios.iflag & ~(ISTRIP | INLCR | IGNCR | ICRNL | IXON),
            originalTermios.oflag & ~OPOST,
            originalTermios.cflag,
            originalTermios.lflag & ~(ECHO | ECHONL | ICANON | ISIG | IEXTEN),
            originalTermios.cc
        );
        terminal.slave.ioctl("TCSETS", rawTermios);
        writer.call(terminal.master.ldisc, data);
        return true;
    } catch (error) {
        console.warn("failed to write to WASI pty directly:", error);
        return false;
    } finally {
        try {
            terminal.slave.ioctl("TCSETS", originalTermios);
        } catch (error) {
            console.warn("failed to restore interactive WASI pty mode:", error);
        }
    }
}

function registerPtyOutputCapture(master: PtyMaster): void {
    if (typeof master.onWrite !== "function") {
        return;
    }

    master.onWrite((event) => {
        appendCapturedWasiOutput(new TextDecoder().decode(event[0]));
    });
}

function appendCapturedWasiOutput(text: string): void {
    if (!text) {
        return;
    }

    activeWasiOutputText += text;
    if (activeWasiOutputText.length > PTY_OUTPUT_CAPTURE_LIMIT) {
        activeWasiOutputText = activeWasiOutputText.slice(activeWasiOutputText.length - PTY_OUTPUT_CAPTURE_LIMIT);
    }
}

function readWasiTerminalText(): string {
    if (activeWasiOutputText) {
        return activeWasiOutputText;
    }
    return readWasiTerminalScreenText();
}

function readWasiTerminalScreenText(maxLines = 200): string {
    const buffer = activeWasiTerminal?.xterm.buffer?.active;
    if (!buffer) {
        return "";
    }

    const lines: string[] = [];
    const start = Math.max(0, buffer.length - maxLines);
    for (let i = start; i < buffer.length; i++) {
        const line = buffer.getLine(i);
        if (line) {
            lines.push(line.translateToString(true));
        } else {
            lines.push("");
        }
    }

    return lines.join("\n");
}

function resetWasiTerminalCapture(): void {
    activeWasiOutputText = "";
}

function clearWasiTerminal(): void {
    activeWasiOutputText = "";
    const xterm = activeWasiTerminal?.xterm;
    if (xterm && typeof xterm.clear === "function") {
        xterm.clear();
    }
}

function setWasiTerminalHidden(hidden: boolean): void {
    const container = document.getElementById("terminal-amd64-debian");
    if (!container) {
        return;
    }
    container.classList.toggle("terminal-hidden", hidden);
}

function stopActiveWasiTerminal(elemId?: string): void {
    activeWasiInputReady = false;
    rejectPendingDirectFsRequests("WASI runtime stopped before the direct filesystem request completed.");

    if (worker) {
        worker.terminate();
        worker = undefined;
    }
    if (stackWorker) {
        stackWorker.terminate();
        stackWorker = undefined;
    }

    const xterm = activeWasiTerminal?.xterm;
    if (xterm && typeof xterm.dispose === "function") {
        try {
            xterm.dispose();
        } catch (error) {
            console.warn("failed to dispose existing WASI terminal:", error);
        }
    }

    activeWasiTerminal = undefined;
    window.activeWasiTerminal = undefined;
    activeWasiOutputText = "";

    const terminalId = elemId || currentWasiStartConfig?.elemId;
    if (terminalId) {
        const container = document.getElementById(terminalId);
        if (container) {
            container.textContent = "";
        }
    }
}

function postPendingWasiMounts(targetWorker: Worker): void {
    for (const mount of pendingWasiRuntimeMounts) {
        if (mount.kind === "directory") {
            targetWorker.postMessage({
                type: "mount-dir",
                mountPoint: mount.mountPoint,
                dirHandle: mount.dirHandle,
                label: mount.label,
            });
        } else {
            targetWorker.postMessage({
                type: "mount-file",
                mountPoint: mount.mountPoint,
                file: mount.file,
                fileName: mount.fileName,
                label: mount.label,
            });
        }
    }
}

for (const mount of DIRECT_FS_DEFAULT_MOUNTS) {
    managedWasiDirectFsMounts.set(mount.mountPoint, {
        mountPoint: mount.mountPoint,
        label: mount.label,
        files: new Map(),
    });
}

function postManagedDirectFsMounts(targetWorker: Worker): void {
    for (const mount of managedWasiDirectFsMounts.values()) {
        const files: Array<{ path: string; data: ArrayBuffer; lastModified: number }> = [];
        const transfer: Transferable[] = [];
        for (const [path, file] of mount.files.entries()) {
            const copy = file.data.slice();
            files.push({
                path,
                data: copy.buffer,
                lastModified: file.lastModified,
            });
            transfer.push(copy.buffer);
        }
        targetWorker.postMessage({
            type: "mount-memory-dir",
            mountPoint: mount.mountPoint,
            label: mount.label,
            files,
        }, transfer);
    }
}

function postDirectFsSharedWriteBuffer(targetWorker: Worker): void {
    if (!directFsSharedWriteChannel) {
        return;
    }
    targetWorker.postMessage({
        type: "direct-fs-shared-buffer",
        buffer: directFsSharedWriteChannel.buffer,
        bytes: directFsSharedWriteChannel.data.byteLength,
    });
    logDirectFsPageEvent("info", "direct_fs.shared_buffer.posted", {
        bytes: directFsSharedWriteChannel.data.byteLength,
    });
}

function handleDirectFsWorkerMessage(event: MessageEvent<unknown>): void {
    const response = event.data;
    if (!isDirectFsWorkerResponse(response)) {
        return;
    }
    /*
     * Direct-FS responses are private control messages.  Do not let the
     * container2wasm network stack consume them as socket frames.
     */
    event.stopImmediatePropagation();

    const pending = pendingDirectFsRequests.get(response.requestId);
    if (!pending) {
        return;
    }

    window.clearTimeout(pending.timeoutHandle);
    pendingDirectFsRequests.delete(response.requestId);
    logDirectFsPageEvent(response.ok ? "info" : "warn", "direct_fs.response", {
        requestId: response.requestId,
        ok: response.ok,
        size: response.size,
        paths: response.paths ? response.paths.length : undefined,
        error: response.error,
    });
    if (response.ok) {
        pending.resolve(response);
    } else {
        pending.reject(new Error(response.error || "direct filesystem request failed"));
    }
}

function handleWasiWorkerMessage(event: MessageEvent<unknown>): void {
    const message = event.data;
    if (isWasmImageProgressMessage(message)) {
        event.stopImmediatePropagation();
        renderWasmImageProgress(message);
        return;
    }
    handleDirectFsWorkerMessage(event);
}

function isWasmImageProgressMessage(value: unknown): value is WasmImageProgressMessage {
    return typeof value === "object"
        && value !== null
        && (value as { type?: unknown }).type === "wasm-image-progress"
        && typeof (value as { phase?: unknown }).phase === "string"
        && typeof (value as { chunkCount?: unknown }).chunkCount === "number";
}

function renderWasmImageProgress(progress: WasmImageProgressMessage): void {
    const terminalId = currentWasiStartConfig?.elemId || "terminal-amd64-debian";
    const statusElem = document.getElementById(terminalId + "-status");
    if (!statusElem) {
        return;
    }

    const chunkLabel = progress.chunkIndex !== undefined
        ? "chunk " + (progress.chunkIndex + 1) + "/" + progress.chunkCount
        : progress.chunkCount + " chunks";
    const cacheLabel = progress.cacheEnabled ? "browser cache" : "network only";
    const readyLabel = progress.totalBytes && progress.totalBytes > 0
        ? formatByteCount(progress.loadedBytes) + " ready"
        : formatByteCount(progress.loadedBytes) + " ready";

    setStatusClass(statusElem, progress.phase === "error");

    switch (progress.phase) {
        case "begin":
            statusElem.textContent = "Preparing release container image from " + progress.chunkCount + " chunk(s); cache: " + cacheLabel + ".";
            break;
        case "size-check":
            statusElem.textContent = "Checked release container image size: " + formatByteCount(progress.totalBytes || progress.loadedBytes) + ".";
            break;
        case "cache-hit":
            statusElem.textContent = "Using cached release container " + chunkLabel + ". " + progress.cachedChunks + " cached; " + readyLabel + ".";
            break;
        case "download-start":
            statusElem.textContent = "Downloading release container " + chunkLabel + ". Cached chunks will be reused on reload.";
            break;
        case "download-progress": {
            const current = progress.chunkLoadedBytes !== undefined
                ? formatByteCount(progress.chunkLoadedBytes)
                : formatByteCount(0);
            const total = progress.chunkTotalBytes && progress.chunkTotalBytes > 0
                ? " / " + formatByteCount(progress.chunkTotalBytes)
                : "";
            statusElem.textContent = "Downloading release container " + chunkLabel + ": " + current + total + ".";
            break;
        }
        case "download-complete":
            statusElem.textContent = "Cached release container " + chunkLabel + ". " + progress.downloadedChunks + " downloaded; " + readyLabel + ".";
            break;
        case "assemble":
            statusElem.textContent = "Assembling release container image from cached/downloaded chunks (" + formatByteCount(progress.loadedBytes) + ").";
            break;
        case "ready":
            statusElem.textContent = "Release container image ready (" + formatByteCount(progress.loadedBytes) + "). Starting WASI runtime.";
            window.dispatchEvent(new CustomEvent("c2w-wasi-image-ready"));
            break;
        case "error":
            statusElem.textContent = progress.message || "Failed to load the release container image.";
            break;
    }
}

function setStatusClass(statusElem: HTMLElement, isError: boolean): void {
    const base = statusElem.classList.contains("status-line") ? "status-line " : "";
    statusElem.className = base + (isError ? "text-danger" : "text-muted");
}

function formatByteCount(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes < 0) {
        return String(bytes) + " bytes";
    }
    if (bytes === 1) {
        return "1 byte";
    }
    if (bytes < 1024) {
        return Math.round(bytes) + " bytes";
    }

    const units = ["KiB", "MiB", "GiB", "TiB"];
    let value = bytes / 1024;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex += 1;
    }
    const precision = value >= 100 ? 0 : value >= 10 ? 1 : 2;
    return value.toFixed(precision) + " " + units[unitIndex];
}

function isDirectFsWorkerResponse(value: unknown): value is DirectFsWorkerResponse {
    return typeof value === "object"
        && value !== null
        && (value as { type?: unknown }).type === "direct-fs-response"
        && typeof (value as { requestId?: unknown }).requestId === "string"
        && typeof (value as { ok?: unknown }).ok === "boolean";
}

function sendDirectFsRequest(message: Record<string, unknown>, transfer: Transferable[] = []): Promise<DirectFsWorkerResponse> {
    if (shouldSendDirectFsOverTerminalControl()) {
        if (shouldSendDirectFsWriteFileChunked(message)) {
            return enqueueDirectFsControlOperation(() => sendDirectFsWriteFileChunked(message));
        }
        return enqueueDirectFsControlOperation(() => sendDirectFsRequestFrame(message, transfer));
    }

    return sendDirectFsRequestFrame(message, transfer);
}

function enqueueDirectFsControlOperation<T>(operation: () => Promise<T>): Promise<T> {
    const task = directFsControlQueue.then(operation);
    directFsControlQueue = task.then(() => undefined, () => undefined);
    return task;
}

function sendDirectFsRequestFrame(message: Record<string, unknown>, transfer: Transferable[] = []): Promise<DirectFsWorkerResponse> {
    if (!worker) {
        throw new Error("WASI runtime worker is not running yet");
    }

    const requestId = "direct-fs-" + String(++directFsRequestSequence);
    return new Promise((resolve, reject) => {
        const timeoutHandle = window.setTimeout(() => {
            pendingDirectFsRequests.delete(requestId);
            reject(new Error("timed out waiting for direct filesystem response"));
        }, DIRECT_FS_RESPONSE_TIMEOUT_MS);
        const pending: PendingDirectFsRequest = {
            resolve,
            reject,
            timeoutHandle,
        };

        pendingDirectFsRequests.set(requestId, pending);

        try {
            const outbound = { ...message, requestId };
            if (shouldSendDirectFsOverTerminalControl()) {
                logDirectFsPageEvent("info", "direct_fs.request.send", directFsRequestLogFacts(outbound, "terminal-control"));
                void postDirectFsControlRequest(outbound).catch((error: unknown) => {
                    window.clearTimeout(timeoutHandle);
                    pendingDirectFsRequests.delete(requestId);
                    pending.reject(error instanceof Error ? error : new Error(String(error)));
                });
            } else {
                logDirectFsPageEvent("info", "direct_fs.request.send", directFsRequestLogFacts(outbound, "postMessage"));
                worker?.postMessage(outbound, transfer);
            }
        } catch (error) {
            window.clearTimeout(timeoutHandle);
            pendingDirectFsRequests.delete(requestId);
            reject(error instanceof Error ? error : new Error(String(error)));
        }
    });
}

function shouldSendDirectFsWriteFileChunked(message: Record<string, unknown>): boolean {
    if (!shouldSendDirectFsOverTerminalControl()) {
        return false;
    }
    if (message.type !== "direct-fs-write-file") {
        return false;
    }
    return directFsRequestDataByteLength(message.data) > DIRECT_FS_CONTROL_CHUNKED_WRITE_THRESHOLD_BYTES;
}

async function sendDirectFsWriteFileChunked(
    message: Record<string, unknown>,
    allowShared = true
): Promise<DirectFsWorkerResponse> {
    if (typeof message.mountPoint !== "string" || typeof message.path !== "string") {
        throw new Error("chunked direct filesystem writes require mountPoint and path");
    }

    const bytes = directFsRequestDataToBytes(message.data);
    const sharedChannel = allowShared ? directFsSharedWriteChannel : undefined;
    const chunkBytes = sharedChannel ? sharedChannel.data.byteLength : DIRECT_FS_CONTROL_WRITE_CHUNK_BYTES;
    const writeId = "direct-fs-write-" + String(++directFsWriteSequence);
    const chunkCount = Math.ceil(bytes.byteLength / chunkBytes);

    logDirectFsPageEvent("info", "direct_fs.write.chunked_begin", {
        writeId,
        mountPoint: message.mountPoint,
        path: message.path,
        bytes: bytes.byteLength,
        chunks: chunkCount,
        chunkBytes,
        transport: sharedChannel ? "terminal-control-shared-buffer" : "terminal-control-base64",
    });

    try {
        await sendDirectFsRequestFrame({
            type: "direct-fs-write-file-begin",
            mountPoint: message.mountPoint,
            path: message.path,
            writeId,
            expectedSize: bytes.byteLength,
            chunkCount,
        });

        let chunkIndex = 0;
        for (let offset = 0; offset < bytes.byteLength; offset += chunkBytes) {
            const chunk = bytes.subarray(offset, Math.min(bytes.byteLength, offset + chunkBytes));
            if (sharedChannel) {
                const sharedChunk = writeDirectFsSharedChunk(sharedChannel, chunk, chunkIndex);
                await sendDirectFsRequestFrame({
                    type: "direct-fs-write-file-shared-chunk",
                    mountPoint: message.mountPoint,
                    path: message.path,
                    writeId,
                    chunkIndex,
                    ...sharedChunk,
                });
            } else {
                const chunkCopy = chunk.slice();
                await sendDirectFsRequestFrame({
                    type: "direct-fs-write-file-chunk",
                    mountPoint: message.mountPoint,
                    path: message.path,
                    writeId,
                    chunkIndex,
                    data: chunkCopy,
                });
            }

            chunkIndex += 1;
            if (chunkIndex === 1 || chunkIndex === chunkCount || chunkIndex % 16 === 0) {
                logDirectFsPageEvent("info", "direct_fs.write.chunked_progress", {
                    writeId,
                    path: message.path,
                    chunksSent: chunkIndex,
                    chunks: chunkCount,
                    bytesSent: Math.min(bytes.byteLength, offset + chunk.byteLength),
                    bytes: bytes.byteLength,
                });
            }
            await sleep(0);
        }

        const response = await sendDirectFsRequestFrame({
            type: "direct-fs-write-file-end",
            mountPoint: message.mountPoint,
            path: message.path,
            writeId,
        });

        logDirectFsPageEvent("info", "direct_fs.write.chunked_complete", {
            writeId,
            mountPoint: message.mountPoint,
            path: message.path,
            bytes: response.size ?? bytes.byteLength,
            chunks: chunkCount,
        });
        return response;
    } catch (error) {
        await sendDirectFsRequestFrame({
            type: "direct-fs-write-file-abort",
            mountPoint: message.mountPoint,
            path: message.path,
            writeId,
        }).catch(() => undefined);
        if (sharedChannel && isDirectFsSharedWriteRecoverableError(error)) {
            logDirectFsPageEvent("warn", "direct_fs.write.shared_chunk_failed_fallback", {
                writeId,
                mountPoint: message.mountPoint,
                path: message.path,
                error: directFsErrorMessage(error),
                fallbackTransport: "terminal-control-base64",
            });
            disableDirectFsSharedWriteChannel(error);
            return sendDirectFsWriteFileChunked(message, false);
        }
        throw error instanceof Error ? error : new Error(String(error));
    }
}

function writeDirectFsSharedChunk(
    channel: DirectFsSharedWriteChannel,
    chunk: Uint8Array,
    chunkIndex: number
): { sharedOffset: number; sharedLength: number; sharedSequence: number } {
    if (chunk.byteLength > channel.data.byteLength) {
        throw new Error("direct filesystem shared chunk exceeds shared buffer capacity");
    }
    channel.data.set(chunk, 0);
    channel.sequence = channel.sequence >= 0x7fffffff ? 1 : channel.sequence + 1;
    Atomics.store(channel.header, 1, chunk.byteLength);
    Atomics.store(channel.header, 2, chunkIndex);
    Atomics.store(channel.header, 3, 0);
    Atomics.store(channel.header, 0, channel.sequence);
    return {
        sharedOffset: 0,
        sharedLength: chunk.byteLength,
        sharedSequence: channel.sequence,
    };
}

function isDirectFsSharedWriteRecoverableError(error: unknown): boolean {
    return /direct filesystem shared|shared write buffer|shared chunk/i.test(directFsErrorMessage(error));
}

function disableDirectFsSharedWriteChannel(reason: unknown): void {
    const channel = directFsSharedWriteChannel;
    directFsSharedWriteChannel = undefined;
    if (!channel) {
        return;
    }
    logDirectFsPageEvent("warn", "direct_fs.shared_buffer.disabled", {
        bytes: channel.data.byteLength,
        reason: directFsErrorMessage(reason),
        fallbackTransport: "terminal-control-base64",
    });
}

function directFsErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function createDirectFsSharedWriteChannel(): DirectFsSharedWriteChannel | undefined {
    if (typeof SharedArrayBuffer !== "function" || typeof Atomics === "undefined") {
        logDirectFsPageEvent("warn", "direct_fs.shared_buffer.unavailable", {
            reason: "SharedArrayBuffer or Atomics is not available",
        });
        return undefined;
    }
    try {
        const channel = allocateDirectFsSharedWriteChannel(DIRECT_FS_SHARED_WRITE_BUFFER_BYTES);
        logDirectFsPageEvent("info", "direct_fs.shared_buffer.created", {
            bytes: channel.data.byteLength,
            totalBytes: channel.buffer.byteLength,
        });
        return channel;
    } catch (error) {
        const estimate = estimateDirectFsSharedWriteBufferCapacity(DIRECT_FS_SHARED_WRITE_BUFFER_BYTES);
        logDirectFsPageEvent(estimate.channel ? "warn" : "error", "direct_fs.shared_buffer.capacity_estimated", {
            requestedBytes: DIRECT_FS_SHARED_WRITE_BUFFER_BYTES,
            minBytes: DIRECT_FS_SHARED_WRITE_MIN_BUFFER_BYTES,
            estimatedMaxBytes: estimate.bytes,
            lowerBound: estimate.lowerBound,
            upperBound: estimate.upperBound,
            attempts: estimate.attempts,
            algorithm: estimate.algorithm,
            initialError: directFsErrorMessage(error),
        });
        if (estimate.channel) {
            logDirectFsPageEvent("warn", "direct_fs.shared_buffer.fallback_created", {
                bytes: estimate.channel.data.byteLength,
                totalBytes: estimate.channel.buffer.byteLength,
            });
            return estimate.channel;
        }
        console.warn("[wasi-direct-fs] direct_fs.shared_buffer.unavailable", error);
        return undefined;
    }
}

function allocateDirectFsSharedWriteChannel(dataBytes: number): DirectFsSharedWriteChannel {
    const roundedDataBytes = Math.max(0, Math.floor(dataBytes));
    const buffer = new SharedArrayBuffer(DIRECT_FS_SHARED_WRITE_HEADER_BYTES + roundedDataBytes);
    return {
        buffer,
        header: new Int32Array(buffer, 0, DIRECT_FS_SHARED_WRITE_HEADER_BYTES / Int32Array.BYTES_PER_ELEMENT),
        data: new Uint8Array(buffer, DIRECT_FS_SHARED_WRITE_HEADER_BYTES),
        sequence: 0,
    };
}

function estimateDirectFsSharedWriteBufferCapacity(failedDataBytes: number): DirectFsSharedWriteCapacityEstimate {
    const algorithm = "min1024_plus1_x2_x10_newton_bisection_refine";
    const minBytes = DIRECT_FS_SHARED_WRITE_MIN_BUFFER_BYTES;
    const failedAt = Math.max(minBytes, Math.floor(failedDataBytes));
    const maxProbeBytes = Math.max(0, failedAt - 1);
    let attempts = 0;
    let bestBytes = 0;
    let bestChannel: DirectFsSharedWriteChannel | undefined;
    let low = 0;
    let high = failedAt;

    const probe = (bytes: number): boolean => {
        attempts += 1;
        try {
            const channel = allocateDirectFsSharedWriteChannel(bytes);
            bestBytes = channel.data.byteLength;
            bestChannel = channel;
            return true;
        } catch {
            return false;
        }
    };

    if (maxProbeBytes < minBytes || !probe(minBytes)) {
        return {
            bytes: 0,
            attempts,
            lowerBound: 0,
            upperBound: minBytes,
            algorithm,
        };
    }

    low = minBytes;
    const plusOne = Math.min(maxProbeBytes, minBytes + 1);
    if (plusOne > low) {
        if (probe(plusOne)) {
            low = plusOne;
        } else {
            high = plusOne;
        }
    }

    const multipliers = [2, 10];
    let multiplierIndex = 0;
    while (high === failedAt && low < maxProbeBytes) {
        const factor = multipliers[multiplierIndex % multipliers.length];
        const next = Math.min(maxProbeBytes, Math.max(low + 1, Math.floor(low * factor)));
        if (next <= low) {
            break;
        }
        if (probe(next)) {
            low = next;
            multiplierIndex += 1;
        } else {
            high = next;
            break;
        }
    }

    while (high - low > 1 && attempts < 64) {
        const mid = low + Math.floor((high - low) / 2);
        if (probe(mid)) {
            low = mid;
        } else {
            high = mid;
        }
    }

    return {
        bytes: bestBytes,
        attempts,
        lowerBound: low,
        upperBound: high,
        algorithm,
        channel: bestChannel,
    };
}

function shouldSendDirectFsOverTerminalControl(): boolean {
    return Boolean(worker && activeWasiInputReady && activeWasiTerminal);
}

async function postDirectFsControlRequest(message: Record<string, unknown>): Promise<void> {
    const payload = serializeDirectFsControlRequest(message);
    const json = JSON.stringify(payload);
    const frame = DIRECT_FS_CONTROL_BEGIN
        + bytesToBase64(new TextEncoder().encode(json))
        + DIRECT_FS_CONTROL_END;
    await sendDirectFsControlFrame(frame);
}

function directFsRequestDataByteLength(value: unknown): number {
    if (value instanceof ArrayBuffer) {
        return value.byteLength;
    }
    if (ArrayBuffer.isView(value)) {
        return value.byteLength;
    }
    return 0;
}

function directFsRequestDataToBytes(value: unknown): Uint8Array {
    if (value instanceof ArrayBuffer) {
        return new Uint8Array(value);
    }
    if (ArrayBuffer.isView(value)) {
        return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    }
    throw new Error("direct filesystem write request did not contain bytes");
}

function serializeDirectFsControlRequest(message: Record<string, unknown>): Record<string, unknown> {
    const payload: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(message)) {
        if (key === "data" && value !== undefined) {
            payload.dataBase64 = directFsControlDataToBase64(value);
            continue;
        }
        payload[key] = value;
    }
    return payload;
}


function directFsControlDataToBase64(value: unknown): string {
    if (value instanceof ArrayBuffer) {
        return bytesToBase64(new Uint8Array(value));
    }
    if (ArrayBuffer.isView(value)) {
        return bytesToBase64(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
    }
    throw new Error("direct filesystem control request contains unsupported data payload");
}

async function sendDirectFsControlFrame(frame: string): Promise<void> {
    const chunks = chunkString(frame, DIRECT_FS_CONTROL_INPUT_CHUNK_SIZE);
    const deadline = Date.now() + DIRECT_FS_CONTROL_SEND_TIMEOUT_MS;
    for (const chunk of chunks) {
        while (!sendWasiInput(chunk)) {
            if (Date.now() >= deadline) {
                throw new Error("timed out sending direct filesystem control frame to the WASI terminal");
            }
            await sleep(20);
        }
        await sleep(0);
    }
}

function directFsRequestLogFacts(message: Record<string, unknown>, transport: string): Record<string, unknown> {
    const data = message.data;
    let bytes: number | undefined;
    if (data instanceof ArrayBuffer) {
        bytes = data.byteLength;
    } else if (ArrayBuffer.isView(data)) {
        bytes = data.byteLength;
    }
    return {
        requestId: message.requestId,
        op: message.type,
        mountPoint: message.mountPoint,
        path: message.path,
        bytes,
        writeId: message.writeId,
        chunkIndex: message.chunkIndex,
        expectedSize: message.expectedSize,
        chunkCount: message.chunkCount,
        sharedLength: message.sharedLength,
        sharedSequence: message.sharedSequence,
        sharedOffset: message.sharedOffset,
        transport,
    };
}

function logDirectFsPageEvent(level: "info" | "warn" | "error", type: string, facts: Record<string, unknown> = {}): void {
    const cleanFacts: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(facts)) {
        if (value !== undefined) {
            cleanFacts[key] = value;
        }
    }
    const payload = { type, ...cleanFacts };
    if (level === "error") {
        console.error("[wasi-direct-fs]", payload);
    } else if (level === "warn") {
        console.warn("[wasi-direct-fs]", payload);
    } else if (DIRECT_FS_PAGE_INFO_LOGGING) {
        console.info("[wasi-direct-fs]", payload);
    }
}

function bytesToBase64(bytes: Uint8Array): string {
    let binary = "";
    for (let index = 0; index < bytes.length; index += 0x8000) {
        binary += String.fromCharCode(...Array.from(bytes.subarray(index, index + 0x8000)));
    }
    return btoa(binary);
}

function chunkString(value: string, chunkSize: number): string[] {
    const chunks: string[] = [];
    for (let index = 0; index < value.length; index += chunkSize) {
        chunks.push(value.slice(index, index + chunkSize));
    }
    return chunks.length > 0 ? chunks : [""];
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function rejectPendingDirectFsRequests(message: string): void {
    for (const [requestId, pending] of pendingDirectFsRequests.entries()) {
        window.clearTimeout(pending.timeoutHandle);
        pending.reject(new Error(message));
        pendingDirectFsRequests.delete(requestId);
    }
}

async function ensureWasiDirectFsDirectoryMount(
    mountPoint: string,
    options: WasiDirectFsMountOptions = {}
): Promise<WasiDirectFsMountResult> {
    const normalizedMountPoint = normalizeWasiMountPoint(mountPoint);
    const existing = managedWasiDirectFsMounts.get(normalizedMountPoint);
    if (existing) {
        if (options.label && existing.label !== options.label) {
            existing.label = options.label;
        }
        return {
            mountPoint: normalizedMountPoint,
            runtimeRestarted: false,
        };
    }

    managedWasiDirectFsMounts.set(normalizedMountPoint, {
        mountPoint: normalizedMountPoint,
        label: options.label || "Direct filesystem mount " + normalizedMountPoint,
        files: new Map(),
    });

    const runtimeRestarted = await restartWasiRuntime();
    return {
        mountPoint: normalizedMountPoint,
        runtimeRestarted,
    };
}

async function writeWasiDirectFsFile(
    path: string,
    data: WasiDirectFsData,
    _options: WasiDirectFsWriteOptions = {}
): Promise<WasiDirectFsWriteResult> {
    const normalizedPath = normalizeWasiDirectFsPath(path);
    let mount = findManagedDirectFsMountForPath(normalizedPath);
    if (!mount) {
        await ensureWasiDirectFsDirectoryMount(dirnameForWasiPath(normalizedPath));
        mount = findManagedDirectFsMountForPath(normalizedPath);
    }
    if (!mount) {
        throw new Error("failed to configure a direct filesystem mount for " + normalizedPath);
    }

    const relativePath = relativePathInsideManagedMount(normalizedPath, mount);
    if (!relativePath) {
        throw new Error("direct filesystem writes must target a file below the mount point");
    }

    const bytes = await directFsDataToBytes(data);
    mount.files.set(relativePath, {
        data: bytes.slice(),
        lastModified: Date.now(),
    });
    logDirectFsPageEvent("info", "direct_fs.mirror.write", {
        path: normalizedPath,
        mountPoint: mount.mountPoint,
        relativePath,
        bytes: bytes.byteLength,
        runtimeWorker: Boolean(worker),
    });

    if (worker) {
        const outbound = bytes.slice();
        await sendDirectFsRequest({
            type: "direct-fs-write-file",
            mountPoint: mount.mountPoint,
            path: relativePath,
            data: outbound.buffer,
        }, [outbound.buffer]);
    }

    return {
        path: normalizedPath,
        mountPoint: mount.mountPoint,
        relativePath,
        bytes: bytes.byteLength,
    };
}

async function readWasiDirectFsFile(path: string): Promise<Uint8Array> {
    const normalizedPath = normalizeWasiDirectFsPath(path);
    const mount = findManagedDirectFsMountForPath(normalizedPath);
    if (!mount) {
        throw new Error("path is not inside a direct filesystem mount: " + normalizedPath);
    }

    const relativePath = relativePathInsideManagedMount(normalizedPath, mount);
    if (!relativePath) {
        throw new Error("direct filesystem reads must target a file below the mount point");
    }

    if (!worker) {
        const mirrored = mount.files.get(relativePath);
        if (!mirrored) {
            throw new Error("direct filesystem file not found: " + normalizedPath);
        }
        return mirrored.data.slice();
    }

    const response = await sendDirectFsRequest({
        type: "direct-fs-read-file",
        mountPoint: mount.mountPoint,
        path: relativePath,
    });
    if (!(response.data instanceof ArrayBuffer)) {
        throw new Error("direct filesystem read response did not contain file bytes");
    }

    const bytes = new Uint8Array(response.data);
    mount.files.set(relativePath, {
        data: bytes.slice(),
        lastModified: Date.now(),
    });
    return bytes;
}

async function deleteWasiDirectFsFile(path: string): Promise<void> {
    const normalizedPath = normalizeWasiDirectFsPath(path);
    const mount = findManagedDirectFsMountForPath(normalizedPath);
    if (!mount) {
        return;
    }

    const relativePath = relativePathInsideManagedMount(normalizedPath, mount);
    if (!relativePath) {
        return;
    }

    mount.files.delete(relativePath);
    if (worker) {
        await sendDirectFsRequest({
            type: "direct-fs-delete-file",
            mountPoint: mount.mountPoint,
            path: relativePath,
        });
    }
}

async function clearWasiDirectFsDirectory(path: string): Promise<void> {
    const normalizedPath = normalizeWasiDirectFsPath(path);
    const mount = findManagedDirectFsMountForPath(normalizedPath);
    if (!mount) {
        await ensureWasiDirectFsDirectoryMount(normalizedPath);
        return;
    }

    const relativePath = relativePathInsideManagedMount(normalizedPath, mount);
    removeMirrorFilesUnderPath(mount, relativePath);
    logDirectFsPageEvent("info", "direct_fs.mirror.clear_directory", {
        path: normalizedPath,
        mountPoint: mount.mountPoint,
        relativePath,
        runtimeWorker: Boolean(worker),
    });
    if (worker) {
        await sendDirectFsRequest({
            type: "direct-fs-clear-directory",
            mountPoint: mount.mountPoint,
            path: relativePath,
        });
    }
}

async function listWasiDirectFsDirectory(path: string, options: WasiDirectFsListOptions = {}): Promise<string[]> {
    const normalizedPath = normalizeWasiDirectFsPath(path);
    const mount = findManagedDirectFsMountForPath(normalizedPath);
    if (!mount) {
        return [];
    }

    const relativePath = relativePathInsideManagedMount(normalizedPath, mount);
    if (!worker) {
        return listMirrorFilesUnderPath(mount, relativePath, options.maxEntries);
    }

    const response = await sendDirectFsRequest({
        type: "direct-fs-list-directory",
        mountPoint: mount.mountPoint,
        path: relativePath,
        maxEntries: options.maxEntries,
    });
    return Array.isArray(response.paths)
        ? response.paths.filter((entry): entry is string => typeof entry === "string")
        : [];
}

async function mountLocalDirectoryForWasi(
    mountPoint: string,
    options: WasiBrowserDirectoryMountOptions = {}
): Promise<WasiBrowserMountInfo> {
    if (!window.isSecureContext) {
        throw new Error("Browser directory mounting requires a secure context. Use https:// or http://localhost.");
    }

    const accessWindow = window as unknown as BrowserFileSystemAccessWindow;
    const picker = accessWindow.showDirectoryPicker;
    if (typeof picker !== "function") {
        throw new Error("This browser does not expose showDirectoryPicker(); use a Chromium-based browser for runtime folder mounts.");
    }

    const normalizedMountPoint = normalizeWasiMountPoint(mountPoint);
    const dirHandle = await picker.call(window, { mode: options.mode || "read" });
    const mount: WasiRuntimeMount = {
        kind: "directory",
        mountPoint: normalizedMountPoint,
        label: "folder " + (dirHandle.name || "(selected folder)"),
        dirHandle,
    };

    upsertWasiRuntimeMount(mount);
    const runtimeRestarted = await restartWasiRuntime();
    return mountInfo(mount, runtimeRestarted);
}

async function mountLocalFileForWasi(file: File, mountPoint: string, fileName?: string): Promise<WasiBrowserMountInfo> {
    if (!file || typeof file.arrayBuffer !== "function") {
        throw new Error("choose a file to mount first");
    }

    const normalizedMountPoint = normalizeWasiMountPoint(mountPoint);
    const cleanFileName = sanitizeMountedFileName(fileName || file.name || "mounted-file");
    const mount: WasiRuntimeMount = {
        kind: "file",
        mountPoint: normalizedMountPoint,
        label: "file " + cleanFileName,
        file,
        fileName: cleanFileName,
    };

    upsertWasiRuntimeMount(mount);
    const runtimeRestarted = await restartWasiRuntime();
    return mountInfo(mount, runtimeRestarted);
}

async function clearWasiBrowserMounts(): Promise<WasiBrowserMountInfo> {
    pendingWasiRuntimeMounts = [];
    const runtimeRestarted = await restartWasiRuntime();
    return {
        kind: "none",
        mountPoint: "",
        label: "No browser mounts configured",
        mountCount: 0,
        runtimeRestarted,
    };
}

function getWasiBrowserMounts(): WasiBrowserMountInfo[] {
    return pendingWasiRuntimeMounts.map((mount) => mountInfo(mount, false));
}

async function restartWasiRuntime(): Promise<boolean> {
    if (!currentWasiStartConfig) {
        return false;
    }

    const config = currentWasiStartConfig;
    const statusElem = document.getElementById(config.elemId + "-status");
    if (statusElem) {
        statusElem.textContent = "Restarting container to apply browser mount configuration...";
        statusElem.className = "text-muted";
    }
    startWasi(config.elemId, config.workerFileName, config.workerImageNamePrefix, config.workerImageChunks);
    return true;
}

function upsertWasiRuntimeMount(mount: WasiRuntimeMount): void {
    pendingWasiRuntimeMounts = pendingWasiRuntimeMounts.filter((candidate) => candidate.mountPoint !== mount.mountPoint);
    pendingWasiRuntimeMounts.push(mount);
}

function mountInfo(mount: WasiRuntimeMount, runtimeRestarted: boolean): WasiBrowserMountInfo {
    return {
        kind: mount.kind,
        mountPoint: mount.mountPoint,
        label: mount.label,
        mountCount: pendingWasiRuntimeMounts.length,
        runtimeRestarted,
    };
}

function configuredMountsSummary(): string {
    if (pendingWasiRuntimeMounts.length === 0) {
        return "";
    }
    const mounts = pendingWasiRuntimeMounts
        .map((mount) => mount.mountPoint + " (" + mount.label + ")")
        .join(", ");
    return " Browser mount" + (pendingWasiRuntimeMounts.length === 1 ? "" : "s") + ": " + mounts + ".";
}

function normalizeWasiMountPoint(value: string): string {
    const raw = value.trim();
    if (!raw) {
        throw new Error("mount point must not be empty");
    }
    if (raw.includes("\0")) {
        throw new Error("mount point must not contain NUL bytes");
    }

    let normalized = raw.replace(/\\/g, "/").replace(/\/+/g, "/");
    if (!normalized.startsWith("/")) {
        normalized = "/" + normalized;
    }
    normalized = normalized.length > 1 ? normalized.replace(/\/+$/, "") : normalized;

    const parts = normalized.split("/").filter((part) => part.length > 0);
    if (normalized === "/" || parts.some((part) => part === "." || part === "..")) {
        throw new Error("mount point must be an absolute non-root path without . or .. segments");
    }
    return normalized;
}

function sanitizeMountedFileName(value: string): string {
    const parts = value
        .replace(/\\/g, "/")
        .split("/")
        .filter((part) => part.length > 0 && part !== "." && part !== "..");
    return parts.pop() || "mounted-file";
}

function findManagedDirectFsMountForPath(path: string): ManagedWasiDirectFsMount | undefined {
    const normalizedPath = normalizeWasiDirectFsPath(path);
    const matches = Array.from(managedWasiDirectFsMounts.values())
        .filter((mount) => normalizedPath === mount.mountPoint || normalizedPath.startsWith(mount.mountPoint + "/"))
        .sort((left, right) => right.mountPoint.length - left.mountPoint.length);
    return matches[0];
}

function relativePathInsideManagedMount(path: string, mount: ManagedWasiDirectFsMount): string {
    if (path === mount.mountPoint) {
        return "";
    }
    return sanitizeDirectFsRelativePath(path.slice(mount.mountPoint.length + 1), true);
}

function normalizeWasiDirectFsPath(value: string): string {
    const raw = value.trim();
    if (!raw) {
        throw new Error("direct filesystem path must not be empty");
    }
    if (raw.includes("\0")) {
        throw new Error("direct filesystem path must not contain NUL bytes");
    }

    let normalized = raw.replace(/\\/g, "/").replace(/\/+/g, "/");
    if (!normalized.startsWith("/")) {
        normalized = "/" + normalized;
    }
    normalized = normalized.length > 1 ? normalized.replace(/\/+$/, "") : normalized;

    const parts = normalized.split("/").filter((part) => part.length > 0);
    if (normalized === "/" || parts.some((part) => part === "." || part === "..")) {
        throw new Error("direct filesystem path must be an absolute non-root path without . or .. segments");
    }
    return normalized;
}

function sanitizeDirectFsRelativePath(value: string, allowEmpty = false): string {
    if (value.includes("\0")) {
        throw new Error("direct filesystem relative path must not contain NUL bytes");
    }
    const rawParts = value.replace(/\\/g, "/").split("/");
    const parts: string[] = [];
    for (const part of rawParts) {
        if (!part) {
            continue;
        }
        if (part === "." || part === "..") {
            throw new Error("direct filesystem relative path must not contain . or .. segments");
        }
        parts.push(part);
    }
    if (parts.length === 0) {
        if (allowEmpty) {
            return "";
        }
        throw new Error("direct filesystem relative path is empty");
    }
    return parts.join("/");
}

function dirnameForWasiPath(path: string): string {
    const normalized = normalizeWasiDirectFsPath(path);
    const index = normalized.lastIndexOf("/");
    if (index <= 0) {
        return "/";
    }
    return normalized.slice(0, index);
}

async function directFsDataToBytes(data: WasiDirectFsData): Promise<Uint8Array> {
    if (typeof data === "string") {
        return new TextEncoder().encode(data);
    }
    if (data instanceof Blob) {
        return new Uint8Array(await data.arrayBuffer());
    }
    if (data instanceof ArrayBuffer) {
        return new Uint8Array(data);
    }
    if (ArrayBuffer.isView(data)) {
        return new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice();
    }
    throw new Error("unsupported direct filesystem data type");
}

function removeMirrorFilesUnderPath(mount: ManagedWasiDirectFsMount, relativePath: string): void {
    const prefix = relativePath ? relativePath.replace(/\/+$/, "") + "/" : "";
    for (const path of Array.from(mount.files.keys())) {
        if (!relativePath || path === relativePath || path.startsWith(prefix)) {
            mount.files.delete(path);
        }
    }
}

function listMirrorFilesUnderPath(
    mount: ManagedWasiDirectFsMount,
    relativePath: string,
    maxEntries = 200
): string[] {
    const normalized = relativePath ? relativePath.replace(/\/+$/, "") : "";
    const prefix = normalized ? normalized + "/" : "";
    const entries = new Set<string>();
    for (const path of mount.files.keys()) {
        if (normalized && path !== normalized && !path.startsWith(prefix)) {
            continue;
        }
        const visible = normalized
            ? path === normalized
                ? path.split("/").pop() || path
                : path.slice(prefix.length)
            : path;
        const parts = visible.split("/").filter((part) => part.length > 0);
        let current = "";
        for (const part of parts) {
            current = current ? current + "/" + part : part;
            entries.add(current);
        }
    }
    return Array.from(entries).sort().slice(0, Math.max(1, maxEntries));
}

function getPageNetParam(): RuntimeNetParam | null {
    const params = new URLSearchParams(location.search);
    const raw = params.get("net");
    if (!raw) {
        return null;
    }

    const parts = raw.split("=");
    const mode = parts.shift() || "";
    if (mode === "none") {
        console.warn("Ignoring net=none: the Rust editor requires c2w networking for Cargo.");
        return null;
    }
    return {
        mode,
        param: parts.join("="),
    };
}

window.wasiDirectFs = {
    ensureDirectoryMount: ensureWasiDirectFsDirectoryMount,
    writeFile: writeWasiDirectFsFile,
    readFile: readWasiDirectFsFile,
    deleteFile: deleteWasiDirectFsFile,
    clearDirectory: clearWasiDirectFsDirectory,
    listDirectory: listWasiDirectFsDirectory,
};
window.startWasiFromManifest = startWasiFromManifest;
window.clearWasiTerminal = clearWasiTerminal;
window.resetWasiTerminalCapture = resetWasiTerminalCapture;
window.sendWasiInput = sendWasiInput;
window.setWasiTerminalHidden = setWasiTerminalHidden;
window.readWasiTerminalText = readWasiTerminalText;
window.mountLocalDirectoryForWasi = mountLocalDirectoryForWasi;
window.mountLocalFileForWasi = mountLocalFileForWasi;
window.clearWasiBrowserMounts = clearWasiBrowserMounts;
window.getWasiBrowserMounts = getWasiBrowserMounts;
window.restartWasiRuntime = restartWasiRuntime;
