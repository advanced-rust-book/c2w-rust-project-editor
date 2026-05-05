let streamCtrl: Int32Array;
let streamStatus: Int32Array;
let streamLen: Int32Array;
let streamData: Uint8Array;

let imagename = "";
let numchunks: WasmImageChunks | undefined;

const DEFAULT_BROWSER_WASM_MODULE_BYTE_LIMIT = 1024 * 1024 * 1024;

const errStatus = {
    val: 0,
};

function registerSocketBuffer(shared: SharedArrayBuffer): void {
    streamCtrl = new Int32Array(shared, 0, 1);
    streamStatus = new Int32Array(shared, 4, 1);
    streamLen = new Int32Array(shared, 8, 1);
    streamData = new Uint8Array(shared, 12);
}

function isInitWorkerMessage(value: unknown): value is InitWorkerMessage {
    return typeof value === "object" && value !== null && (value as { type?: unknown }).type === "init";
}

function serveIfInitMsg(msg: MessageEvent<unknown>): boolean {
    const req = msg.data;
    if (!isInitWorkerMessage(req)) {
        return false;
    }

    if (req.buf) {
        registerSocketBuffer(req.buf);
    }
    if (req.imagename) {
        imagename = req.imagename;
    }
    numchunks = req.chunks;
    return true;
}

function getImagename(): string {
    return imagename;
}

interface ResolvedChunkFiles {
    files: string[];
    cacheKey: string;
}

interface FetchedChunk {
    buffer: ArrayBuffer;
    fromCache: boolean;
}

function isWasmImageChunkList(value: unknown): value is WasmImageChunkList {
    return typeof value === "object"
        && value !== null
        && Array.isArray((value as { files?: unknown }).files);
}

function resolveChunkFiles(prefix: string, chunks: WasmImageChunks | undefined): ResolvedChunkFiles {
    if (isWasmImageChunkList(chunks)) {
        const files = resolveChunkFileNames(prefix, chunks.files);
        return {
            files,
            cacheKey: chunks.cacheKey || stableChunkCacheKey(prefix, files),
        };
    }

    if (Array.isArray(chunks)) {
        const files = resolveChunkFileNames(prefix, chunks);
        return {
            files,
            cacheKey: stableChunkCacheKey(prefix, files),
        };
    }

    const count = Number(chunks);
    if (!Number.isInteger(count) || count <= 0) {
        throw new Error("invalid wasm chunk count: " + String(chunks));
    }

    const files: string[] = [];
    for (let i = 0; i < count; i++) {
        let suffix = i.toString();
        while (suffix.length < 2) {
            suffix = "0" + suffix;
        }
        files.push(prefix + suffix + ".wasm");
    }
    return {
        files,
        cacheKey: stableChunkCacheKey(prefix, files),
    };
}

function resolveChunkFileNames(prefix: string, files: string[]): string[] {
    const base = prefix.substring(0, prefix.lastIndexOf("/") + 1);
    return files.map((file) => {
        if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(file) || file.startsWith("/")) {
            return file;
        }
        return base + file;
    });
}

function stableChunkCacheKey(prefix: string, files: string[]): string {
    return prefix + "|" + files.length + "|" + files.slice(0, 3).join("|") + "|" + files.slice(-3).join("|");
}

function fetchChunks(): Promise<ArrayBuffer> {
    return fetchChunksAsync().catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        postWasmProgress({
            phase: "error",
            chunkCount: 0,
            loadedBytes: 0,
            cachedChunks: 0,
            downloadedChunks: 0,
            cacheEnabled: false,
            message,
        });
        console.error("failed to fetch wasm chunks:", error);
        throw error;
    });
}

async function fetchChunksAsync(): Promise<ArrayBuffer> {
    const resolved = resolveChunkFiles(imagename, numchunks);
    const files = resolved.files;
    const cacheName = wasmChunkCacheName(resolved.cacheKey);
    const cache = await openWasmChunkCache(cacheName);
    const buffers: ArrayBuffer[] = [];
    const totals = {
        loadedBytes: 0,
        totalBytes: 0,
        cachedChunks: 0,
        downloadedChunks: 0,
    };

    postWasmProgress({
        phase: "begin",
        chunkCount: files.length,
        loadedBytes: 0,
        totalBytes: 0,
        cachedChunks: 0,
        downloadedChunks: 0,
        cacheEnabled: Boolean(cache),
        cacheName,
    });

    const moduleByteLimit = configuredWasmModuleByteLimit();
    const estimatedTotalBytes = await estimateWasmImageBytes(files, cache);
    if (estimatedTotalBytes !== undefined) {
        postWasmProgress({
            phase: "size-check",
            chunkCount: files.length,
            loadedBytes: 0,
            totalBytes: estimatedTotalBytes,
            cachedChunks: 0,
            downloadedChunks: 0,
            cacheEnabled: Boolean(cache),
            cacheName,
        });

        if (moduleByteLimit > 0 && estimatedTotalBytes > moduleByteLimit) {
            throw new Error(
                "The release container image is " + formatWorkerByteCount(estimatedTotalBytes)
                + ", but this browser rejects WebAssembly modules above "
                + formatWorkerByteCount(moduleByteLimit)
                + ". Rebuild and publish a slimmer c2w image below the browser limit."
            );
        }
    }

    for (let index = 0; index < files.length; index += 1) {
        const chunk = await fetchChunk(files[index], index, files.length, cache, cacheName, totals);
        buffers.push(chunk.buffer);
        totals.loadedBytes += chunk.buffer.byteLength;
        totals.totalBytes += chunk.buffer.byteLength;
        if (moduleByteLimit > 0 && totals.loadedBytes > moduleByteLimit) {
            throw new Error(
                "Downloaded wasm image bytes exceeded "
                + formatWorkerByteCount(moduleByteLimit)
                + ". Rebuild and publish a slimmer c2w image below the browser limit."
            );
        }
        if (chunk.fromCache) {
            totals.cachedChunks += 1;
        } else {
            totals.downloadedChunks += 1;
        }
    }

    postWasmProgress({
        phase: "assemble",
        chunkCount: files.length,
        loadedBytes: totals.loadedBytes,
        totalBytes: totals.totalBytes,
        cachedChunks: totals.cachedChunks,
        downloadedChunks: totals.downloadedChunks,
        cacheEnabled: Boolean(cache),
        cacheName,
    });

    const wasm = await new Blob(buffers).arrayBuffer();
    postWasmProgress({
        phase: "ready",
        chunkCount: files.length,
        loadedBytes: wasm.byteLength,
        totalBytes: wasm.byteLength,
        cachedChunks: totals.cachedChunks,
        downloadedChunks: totals.downloadedChunks,
        cacheEnabled: Boolean(cache),
        cacheName,
    });
    return wasm;
}

function wasmChunkCacheName(cacheKey: string): string {
    return "c2w-wasm-chunks-v1-" + sanitizeCacheName(cacheKey);
}

function configuredWasmModuleByteLimit(): number {
    const params = new URLSearchParams(location.search);
    const raw = params.get("wasmModuleLimitBytes");
    if (!raw) {
        return DEFAULT_BROWSER_WASM_MODULE_BYTE_LIMIT;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
        return DEFAULT_BROWSER_WASM_MODULE_BYTE_LIMIT;
    }
    return Math.floor(parsed);
}

async function estimateWasmImageBytes(files: string[], cache: Cache | null): Promise<number | undefined> {
    let total = 0;
    for (const file of files) {
        const request = new Request(file, { credentials: "same-origin" });
        const cached = await cache?.match(request);
        const cachedBytes = parsePositiveInteger(cached?.headers.get("X-C2W-Bytes") || null);
        if (cachedBytes !== undefined) {
            total += cachedBytes;
            continue;
        }

        let resp: Response;
        try {
            resp = await fetch(request, { method: "HEAD", cache: "no-store" });
        } catch (error) {
            console.warn("failed to check wasm chunk size:", file, error);
            return undefined;
        }
        if (!resp.ok) {
            return undefined;
        }
        const contentLength = parsePositiveInteger(resp.headers.get("Content-Length"));
        if (contentLength === undefined) {
            return undefined;
        }
        total += contentLength;
    }
    return total;
}

async function openWasmChunkCache(cacheName: string): Promise<Cache | null> {
    if (typeof caches === "undefined") {
        return null;
    }
    try {
        return await caches.open(cacheName);
    } catch (error) {
        console.warn("wasm chunk cache is unavailable:", error);
        return null;
    }
}

function sanitizeCacheName(value: string): string {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
}

async function fetchChunk(
    file: string,
    chunkIndex: number,
    chunkCount: number,
    cache: Cache | null,
    cacheName: string,
    totals: { loadedBytes: number; totalBytes: number; cachedChunks: number; downloadedChunks: number }
): Promise<FetchedChunk> {
    const request = new Request(file, { credentials: "same-origin" });
    const cached = await cache?.match(request);
    if (cached) {
        const buffer = await cached.arrayBuffer();
        postWasmProgress({
            phase: "cache-hit",
            chunkIndex,
            chunkCount,
            loadedBytes: totals.loadedBytes + buffer.byteLength,
            totalBytes: totals.totalBytes + buffer.byteLength,
            cachedChunks: totals.cachedChunks + 1,
            downloadedChunks: totals.downloadedChunks,
            cacheEnabled: true,
            cacheName,
            url: file,
        });
        return { buffer, fromCache: true };
    }

    postWasmProgress({
        phase: "download-start",
        chunkIndex,
        chunkCount,
        loadedBytes: totals.loadedBytes,
        totalBytes: totals.totalBytes,
        cachedChunks: totals.cachedChunks,
        downloadedChunks: totals.downloadedChunks,
        cacheEnabled: Boolean(cache),
        cacheName,
        url: file,
    });

    const resp = await fetch(request, { cache: "no-store" });
    if (!resp.ok) {
        throw new Error("failed to fetch " + file + ": HTTP " + resp.status);
    }

    const bytes = await readResponseBytes(resp, (chunkLoadedBytes, chunkTotalBytes) => {
        postWasmProgress({
            phase: "download-progress",
            chunkIndex,
            chunkCount,
            chunkLoadedBytes,
            chunkTotalBytes,
            loadedBytes: totals.loadedBytes + chunkLoadedBytes,
            totalBytes: totals.totalBytes + (chunkTotalBytes || 0),
            cachedChunks: totals.cachedChunks,
            downloadedChunks: totals.downloadedChunks,
            cacheEnabled: Boolean(cache),
            cacheName,
            url: file,
        });
    });

    if (cache) {
        await cache.put(request, new Response(exactArrayBuffer(bytes), {
            headers: {
                "Content-Type": "application/wasm",
                "X-C2W-Bytes": String(bytes.byteLength),
            },
        }));
    }

    postWasmProgress({
        phase: "download-complete",
        chunkIndex,
        chunkCount,
        loadedBytes: totals.loadedBytes + bytes.byteLength,
        totalBytes: totals.totalBytes + bytes.byteLength,
        cachedChunks: totals.cachedChunks,
        downloadedChunks: totals.downloadedChunks + 1,
        cacheEnabled: Boolean(cache),
        cacheName,
        url: file,
    });

    return { buffer: exactArrayBuffer(bytes), fromCache: false };
}

async function readResponseBytes(resp: Response, onProgress: (loadedBytes: number, totalBytes?: number) => void): Promise<Uint8Array> {
    const totalBytes = parsePositiveInteger(resp.headers.get("Content-Length")) || undefined;
    if (!resp.body) {
        const buffer = await resp.arrayBuffer();
        onProgress(buffer.byteLength, totalBytes || buffer.byteLength);
        return new Uint8Array(buffer);
    }

    const reader = resp.body.getReader();
    const chunks: Uint8Array[] = [];
    let loadedBytes = 0;

    while (true) {
        const next = await reader.read();
        if (next.done) {
            break;
        }
        chunks.push(next.value);
        loadedBytes += next.value.byteLength;
        onProgress(loadedBytes, totalBytes);
    }

    return concatWorkerChunks(chunks, loadedBytes);
}

function parsePositiveInteger(value: string | null): number | undefined {
    if (!value) {
        return undefined;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
}

function formatWorkerByteCount(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes < 0) {
        return String(bytes) + " bytes";
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

function concatWorkerChunks(chunks: Uint8Array[], totalSize: number): Uint8Array {
    const output = new Uint8Array(totalSize);
    let offset = 0;
    for (const chunk of chunks) {
        output.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return output;
}

function exactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return copy.buffer;
}

function postWasmProgress(progress: Omit<WasmImageProgressMessage, "type">): void {
    postMessage({ type: "wasm-image-progress", ...progress });
}

function requireSocketBuffer(): void {
    if (!streamCtrl || !streamStatus || !streamLen || !streamData) {
        throw new Error("socket shared buffer is not registered");
    }
}

function sockAccept(): boolean {
    requireSocketBuffer();
    streamCtrl[0] = 0;
    postMessage({ type: "accept" });
    Atomics.wait(streamCtrl, 0, 0);
    return streamData[0] === 1;
}

function sockSend(data: ArrayBuffer | Uint8Array): typeof errStatus | undefined {
    requireSocketBuffer();
    streamCtrl[0] = 0;
    postMessage({ type: "send", buf: data });
    Atomics.wait(streamCtrl, 0, 0);
    if (streamStatus[0] < 0) {
        errStatus.val = streamStatus[0];
        return errStatus;
    }
    return undefined;
}

function sockRecv(len: number): Uint8Array | typeof errStatus {
    requireSocketBuffer();
    streamCtrl[0] = 0;
    postMessage({ type: "recv", len });
    Atomics.wait(streamCtrl, 0, 0);
    if (streamStatus[0] < 0) {
        errStatus.val = streamStatus[0];
        return errStatus;
    }
    const ddlen = streamLen[0];
    return streamData.slice(0, ddlen);
}

function sockWaitForReadable(timeout?: number): boolean | typeof errStatus {
    requireSocketBuffer();
    streamCtrl[0] = 0;
    postMessage({ type: "recv-is-readable", timeout });
    Atomics.wait(streamCtrl, 0, 0);
    if (streamStatus[0] < 0) {
        errStatus.val = streamStatus[0];
        return errStatus;
    }
    return streamData[0] === 1;
}

function sendCert(data: Uint8Array): typeof errStatus | undefined {
    requireSocketBuffer();
    streamCtrl[0] = 0;
    postMessage({ type: "send_cert", buf: data });
    Atomics.wait(streamCtrl, 0, 0);
    if (streamStatus[0] < 0) {
        errStatus.val = streamStatus[0];
        return errStatus;
    }
    return undefined;
}

function recvCert(): Promise<Uint8Array> {
    requireSocketBuffer();
    let buf: Uint8Array = new Uint8Array(0);

    return new Promise((resolve) => {
        const getCert = (): void => {
            streamCtrl[0] = 0;
            postMessage({ type: "recv_cert", len: streamData.byteLength });
            Atomics.wait(streamCtrl, 0, 0);

            if (streamStatus[0] < 0) {
                setTimeout(getCert, 100);
                return;
            }

            const ddlen = streamLen[0];
            buf = appendWorkerData(buf, streamData.slice(0, ddlen));

            if (streamStatus[0] === 1) {
                resolve(buf);
                return;
            }

            setTimeout(getCert, 0);
        };

        getCert();
    });
}

function appendWorkerData(data1: Uint8Array, data2: ArrayBuffer | Uint8Array): Uint8Array {
    const right = data2 instanceof Uint8Array ? data2 : new Uint8Array(data2);
    const buf = new Uint8Array(data1.byteLength + right.byteLength);
    buf.set(data1, 0);
    buf.set(right, data1.byteLength);
    return buf;
}

function getCertDir(cert: Uint8Array): WasiPreopenDirectory {
    const WasiFile = globalThis.File as unknown as WasiFileConstructor;
    const certDir = new PreopenDirectory("/.wasmenv", {
        "proxy.crt": new WasiFile(cert, {}),
    });

    const originalPathOpen = certDir.path_open;
    certDir.path_open = (dirflags, path, oflags, fsRightsBase, fsRightsInherited, fdflags) => {
        const ret = originalPathOpen.apply(certDir, [dirflags, path, oflags, fsRightsBase, fsRightsInherited, fdflags]);
        if (ret.fd_obj !== null) {
            const opened = ret.fd_obj;
            opened.fd_pread = (view8: Uint8Array, iovs: WasiIoVec[], offset: bigint | number): WasiReadResult => {
                const oldOffset = opened.file_pos;
                let seek = opened.fd_seek(offset, WHENCE_SET);
                if (seek.ret !== 0) {
                    return { ret: -1, nread: 0 };
                }

                const readRet = opened.fd_read(view8, iovs);
                seek = opened.fd_seek(oldOffset, WHENCE_SET);
                if (seek.ret !== 0) {
                    return { ret: -1, nread: 0 };
                }

                return readRet;
            };
        }
        return ret;
    };

    certDir.dir.contents["."] = certDir.dir;
    return certDir;
}

function wasiHackSocket(wasi: WASI, listenfd: number, connfd: number): void {
    const ERRNO_INVAL = 28;
    const ERRNO_AGAIN = 6;
    let connfdUsed = false;

    const originalFdClose = wasi.wasiImport.fd_close;
    wasi.wasiImport.fd_close = (fd: number) => {
        if (fd === connfd) {
            connfdUsed = false;
            return 0;
        }
        return originalFdClose.apply(wasi.wasiImport, [fd]);
    };

    const originalFdRead = wasi.wasiImport.fd_read;
    wasi.wasiImport.fd_read = (fd: number, iovsPtr: number, iovsLen: number, nreadPtr: number) => {
        if (fd === connfd) {
            return wasi.wasiImport.sock_recv(fd, iovsPtr, iovsLen, 0, nreadPtr, 0);
        }
        return originalFdRead.apply(wasi.wasiImport, [fd, iovsPtr, iovsLen, nreadPtr]);
    };

    const originalFdWrite = wasi.wasiImport.fd_write;
    wasi.wasiImport.fd_write = (fd: number, iovsPtr: number, iovsLen: number, nwrittenPtr: number) => {
        if (fd === connfd) {
            return wasi.wasiImport.sock_send(fd, iovsPtr, iovsLen, 0, nwrittenPtr);
        }
        return originalFdWrite.apply(wasi.wasiImport, [fd, iovsPtr, iovsLen, nwrittenPtr]);
    };

    const originalFdstatGet = wasi.wasiImport.fd_fdstat_get;
    wasi.wasiImport.fd_fdstat_get = (fd: number, fdstatPtr: number) => {
        if (fd === listenfd || (fd === connfd && connfdUsed)) {
            const buffer = new DataView(wasi.inst.exports.memory.buffer);
            buffer.setUint8(fdstatPtr, 6);
            buffer.setUint16(fdstatPtr + 2, FDFLAGS_NONBLOCK, true);
            buffer.setBigUint64(fdstatPtr + 8, 0n, true);
            buffer.setBigUint64(fdstatPtr + 16, 0n, true);
            return 0;
        }
        return originalFdstatGet.apply(wasi.wasiImport, [fd, fdstatPtr]);
    };

    wasi.wasiImport.sock_accept = (fd: number, _flags: number, fdPtr: number) => {
        if (fd !== listenfd) {
            console.log("sock_accept: unknown fd " + fd);
            return ERRNO_INVAL;
        }
        if (connfdUsed) {
            console.log("sock_accept: multi-connection is unsupported");
            return ERRNO_INVAL;
        }
        if (!sockAccept()) {
            return ERRNO_AGAIN;
        }
        connfdUsed = true;
        const buffer = new DataView(wasi.inst.exports.memory.buffer);
        buffer.setUint32(fdPtr, connfd, true);
        return 0;
    };

    wasi.wasiImport.sock_send = (fd: number, iovsPtr: number, iovsLen: number, _siFlags: number, nwrittenPtr: number) => {
        if (fd !== connfd) {
            console.log("sock_send: unknown fd " + fd);
            return ERRNO_INVAL;
        }

        const buffer = new DataView(wasi.inst.exports.memory.buffer);
        const buffer8 = new Uint8Array(wasi.inst.exports.memory.buffer);
        const iovecs = Ciovec.read_bytes_array(buffer, iovsPtr, iovsLen);
        let wtotal = 0;

        for (const iovec of iovecs) {
            const buf = buffer8.slice(iovec.buf, iovec.buf + iovec.buf_len);
            if (buf.length === 0) {
                continue;
            }
            const ret = sockSend(buf);
            if (ret === errStatus) {
                return ERRNO_INVAL;
            }
            wtotal += buf.length;
        }

        buffer.setUint32(nwrittenPtr, wtotal, true);
        return 0;
    };

    wasi.wasiImport.sock_recv = (
        fd: number,
        iovsPtr: number,
        iovsLen: number,
        riFlags: number,
        nreadPtr: number,
        roFlagsPtr: number
    ) => {
        if (riFlags !== 0) {
            console.log("ri_flags are unsupported");
        }
        if (fd !== connfd) {
            console.log("sock_recv: unknown fd " + fd);
            return ERRNO_INVAL;
        }

        const sockreadable = sockWaitForReadable();
        if (sockreadable === errStatus) {
            return ERRNO_INVAL;
        }
        if (sockreadable === false) {
            return ERRNO_AGAIN;
        }

        const buffer = new DataView(wasi.inst.exports.memory.buffer);
        const buffer8 = new Uint8Array(wasi.inst.exports.memory.buffer);
        const iovecs = Iovec.read_bytes_array(buffer, iovsPtr, iovsLen);
        let nread = 0;

        for (const iovec of iovecs) {
            if (iovec.buf_len === 0) {
                continue;
            }
            const data = sockRecv(iovec.buf_len);
            if (!(data instanceof Uint8Array)) {
                return ERRNO_INVAL;
            }
            buffer8.set(data, iovec.buf);
            nread += data.length;
            if (data.length < iovec.buf_len) {
                break;
            }
        }

        buffer.setUint32(nreadPtr, nread, true);
        if (roFlagsPtr !== 0) {
            buffer.setUint16(roFlagsPtr, 0, true);
        }
        return 0;
    };

    wasi.wasiImport.sock_shutdown = (fd: number, _sdflags: number) => {
        if (fd === connfd) {
            connfdUsed = false;
        }
        return 0;
    };
}
