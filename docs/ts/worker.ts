importScripts("https://cdn.jsdelivr.net/npm/xterm-pty@0.9.4/workerTools.js");
importScripts(new URL("../src/browser_wasi_shim/index.js", location.href).href);
importScripts(new URL("../src/browser_wasi_shim/wasi_defs.js", location.href).href);
importScripts(new URL("./worker-util.js", location.href).href);
importScripts(new URL("./wasi-util.js", location.href).href);

type WorkerLogLevel = "info" | "warn" | "error";
type WorkerLogFacts = Record<string, string | number | boolean | undefined>;

function logWorkerEvent(level: WorkerLogLevel, type: string, facts: WorkerLogFacts = {}): void {
    const cleanFacts: Record<string, string | number | boolean> = {};
    for (const [key, value] of Object.entries(facts)) {
        if (value !== undefined) {
            cleanFacts[key] = value;
        }
    }

    let suffix = "";
    if (Object.keys(cleanFacts).length > 0) {
        try {
            suffix = " " + JSON.stringify(cleanFacts);
        } catch {
            suffix = " " + String(cleanFacts);
        }
    }

    const line = "[container2wasm-worker] " + type + suffix;
    if (level === "error") {
        console.error(line);
    } else if (level === "warn") {
        console.warn(line);
    } else {
        console.info(line);
    }
}

function workerErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function normalizeShimPathParts(path: string): string[] | null {
    const parts: string[] = [];
    for (const part of path.replace(/\\/g, "/").split("/")) {
        if (!part || part === ".") {
            continue;
        }
        if (part === "..") {
            return null;
        }
        parts.push(part);
    }
    return parts;
}

function patchBrowserWasiShimDirectoryTraversal(): void {
    const DirectoryValue = (globalThis as typeof globalThis & { Directory?: unknown }).Directory;
    if (typeof DirectoryValue !== "function") {
        logWorkerEvent("warn", "worker.wasi_shim.directory_patch_skipped", {
            reason: "Directory constructor is not available",
        });
        return;
    }

    const DirectoryCtor = DirectoryValue as {
        new (contents: Record<string, unknown>): { contents: Record<string, unknown> };
        prototype: {
            __container2WasmTraversalPatched?: boolean;
            get_entry_for_path?: (this: { contents: Record<string, unknown> }, path: string) => unknown;
            create_entry_for_path?: (this: { contents: Record<string, unknown> }, path: string) => unknown;
        };
    };

    const prototype = DirectoryCtor.prototype;
    if (prototype.__container2WasmTraversalPatched) {
        return;
    }

    prototype.get_entry_for_path = function getEntryForPath(path: string): unknown {
        const parts = normalizeShimPathParts(path);
        if (parts === null) {
            return null;
        }

        let current: unknown = this;
        for (const part of parts) {
            if (!isWasiShimDirectory(current)) {
                return null;
            }
            const next = current.contents[part];
            if (next === undefined || next === null) {
                return null;
            }
            current = next;
        }
        return current;
    };

    prototype.create_entry_for_path = function createEntryForPath(path: string): unknown {
        const parts = normalizeShimPathParts(path);
        if (parts === null) {
            throw new Error("WASI directory path must not contain .. segments");
        }
        if (parts.length === 0) {
            return this;
        }

        const FileValue = (globalThis as typeof globalThis & { File?: unknown }).File;
        if (typeof FileValue !== "function") {
            throw new Error("browser_wasi_shim File constructor is not available");
        }
        const FileCtor = FileValue as unknown as WasiFileConstructor;

        let current: { contents: Record<string, unknown> } = this;
        let entry: unknown = current;
        for (let index = 0; index < parts.length; index++) {
            const part = parts[index];
            const isLast = index === parts.length - 1;
            let next = current.contents[part];
            if (next === undefined || next === null) {
                next = isLast ? new FileCtor(new ArrayBuffer(0)) : new DirectoryCtor({});
                current.contents[part] = next;
            }
            entry = next;
            if (!isLast) {
                if (!isWasiShimDirectory(next)) {
                    throw new Error("WASI directory parent is not a directory: " + parts.slice(0, index + 1).join("/"));
                }
                current = next;
            }
        }
        return entry;
    };

    prototype.__container2WasmTraversalPatched = true;
    logWorkerEvent("info", "worker.wasi_shim.directory_traversal_patched");
}

patchBrowserWasiShimDirectoryTraversal();

const WORKER_DIRECT_FS_CONTROL_BEGIN = "\x1b]777;container2wasm-direct-fs;";
const WORKER_DIRECT_FS_CONTROL_END = "\x07";
const WORKER_DIRECT_FS_CONTROL_BEGIN_BYTES = new TextEncoder().encode(WORKER_DIRECT_FS_CONTROL_BEGIN);
const WORKER_DIRECT_FS_CONTROL_END_BYTES = new TextEncoder().encode(WORKER_DIRECT_FS_CONTROL_END);
const DIRECT_FS_CONTROL_MAX_BUFFER_BYTES = 64 * 1024 * 1024;
const WORKER_DIRECT_FS_SHARED_WRITE_HEADER_BYTES = 16;
const DIRECT_FS_EFFICIENT_WRITE_MIN_CAPACITY = 64 * 1024;
const directFsControlTextDecoder = new TextDecoder();

let directFsSharedWriteHeader: Int32Array | undefined;
let directFsSharedWriteBytes: Uint8Array | undefined;
let directFsControlBuffer: Uint8Array = new Uint8Array(0);
let pendingGuestTerminalInput: Uint8Array = new Uint8Array(0);

interface WorkerMountMessage {
    type: "mount-dir" | "mount-file" | "mount-memory-dir";
    mountPoint?: unknown;
    dirHandle?: unknown;
    file?: unknown;
    fileHandle?: unknown;
    fileName?: unknown;
    label?: unknown;
    files?: unknown;
}

interface WorkerDirectFsSharedBufferMessage {
    type: "direct-fs-shared-buffer";
    buffer?: unknown;
    bytes?: unknown;
}

interface WorkerDirectFsRequestMessage {
    type: "direct-fs-write-file" | "direct-fs-write-file-begin" | "direct-fs-write-file-chunk" | "direct-fs-write-file-shared-chunk" | "direct-fs-write-file-end" | "direct-fs-write-file-abort" | "direct-fs-read-file" | "direct-fs-delete-file" | "direct-fs-clear-directory" | "direct-fs-list-directory";
    requestId?: unknown;
    mountPoint?: unknown;
    path?: unknown;
    writeId?: unknown;
    data?: unknown;
    sharedOffset?: unknown;
    sharedLength?: unknown;
    sharedSequence?: unknown;
    maxEntries?: unknown;
    expectedSize?: unknown;
    chunkCount?: unknown;
    chunkIndex?: unknown;
}

interface WorkerMemoryMountFile {
    path?: unknown;
    data?: unknown;
    lastModified?: unknown;
}

interface BrowserFileHandleLike {
    readonly kind?: string;
    readonly name?: string;
    getFile(): Promise<BrowserFileLike>;
}

interface BrowserDirectoryHandleLike {
    readonly kind?: string;
    readonly name?: string;
    entries(): AsyncIterable<[string, BrowserHandleLike]>;
}

type BrowserHandleLike = BrowserFileHandleLike | BrowserDirectoryHandleLike;

interface BrowserFileLike {
    readonly name?: string;
    arrayBuffer(): Promise<ArrayBuffer>;
}

interface WasiDirectoryConstructor {
    new (contents: Record<string, unknown>): unknown;
}

interface PendingWorkerDirectoryMount {
    kind: "directory";
    mountPoint: string;
    label: string;
    dirHandle: BrowserDirectoryHandleLike;
}

interface PendingWorkerFileMount {
    kind: "file";
    mountPoint: string;
    label: string;
    fileName: string;
    file?: BrowserFileLike;
    fileHandle?: BrowserFileHandleLike;
}

interface PendingWorkerMemoryDirectoryMount {
    kind: "memory-directory";
    mountPoint: string;
    label: string;
    manager: DirectFsDirectoryManager;
}

type PendingWorkerMount = PendingWorkerDirectoryMount | PendingWorkerFileMount | PendingWorkerMemoryDirectoryMount;

interface DirectFsPendingWrite {
    path: string;
    expectedSize: number;
    chunkCount: number;
    buffer: Uint8Array;
    receivedBytes: number;
    nextChunkIndex: number;
}

interface WasiWriteResult {
    ret: number;
    nwritten: number;
}

interface WasiShimWritableFile {
    data: Uint8Array;
    __container2WasmWriteBuffer?: Uint8Array;
    __container2WasmLogicalSize?: number;
}

interface WasiOpenFileWithWriteCache extends WasiOpenFile {
    fd_write?: (view8: Uint8Array, iovs: WasiIoVec[]) => WasiWriteResult;
    fd_pwrite?: (view8: Uint8Array, iovs: WasiIoVec[], offset: bigint | number) => WasiWriteResult;
    fd_filestat_set_size?: (size: bigint | number) => number;
    fd_sync?: () => number;
    fd_datasync?: () => number;
    file?: WasiShimWritableFile;
    __container2WasmEfficientWritePatched?: boolean;
}

let runtimeStarted = false;
let pendingMounts: PendingWorkerMount[] = [];
const directFsManagersByMountPoint = new Map<string, DirectFsDirectoryManager>();

onmessage = (msg: MessageEvent<unknown>): void => {
    if (serveIfInitMsg(msg)) {
        return;
    }

    if (isWorkerMountMessage(msg.data)) {
        try {
            queuePendingMount(msg.data);
        } catch (error) {
            logWorkerEvent("error", "worker.mount.register_failed", {
                message: workerErrorMessage(error),
            });
            console.error("failed to register browser mount:", error);
        }
        return;
    }

    if (isWorkerDirectFsSharedBufferMessage(msg.data)) {
        try {
            registerDirectFsSharedBuffer(msg.data);
        } catch (error) {
            logWorkerEvent("error", "worker.direct_fs.shared_buffer_failed", {
                message: workerErrorMessage(error),
            });
            console.error("failed to register direct filesystem shared buffer:", error);
        }
        return;
    }

    if (isWorkerDirectFsRequestMessage(msg.data)) {
        handleWorkerDirectFsRequest(msg.data);
        return;
    }

    if (runtimeStarted) {
        console.warn("ignoring non-control message after WASI runtime startup");
        return;
    }
    runtimeStarted = true;

    const ttyClient = new TtyClient(msg.data);
    const netParam = getWorkerNetParam();

    void fetchChunks()
        .then((wasm) => startFetchedTerminalWasi(wasm, ttyClient, netParam))
        .catch((error: unknown) => {
            console.error("failed to start WASI runtime:", error);
            writeTerminalStartupError(ttyClient, error);
        });
};

async function startFetchedTerminalWasi(
    wasm: ArrayBuffer,
    ttyClient: TtyClient,
    netParam: RuntimeNetParam | null
): Promise<void> {
    const mountFds = await buildPendingMountFds();
    let args: string[] = [];
    let env: string[] = [];
    let fds: Array<unknown | undefined> = [];
    let listenfd = 3;
    let connfd = 5;

    if (!netParam || netParam.mode !== "none") {
        const cert = await recvCert();
        const certDir = getCertDir(cert);
        fds = [
            undefined,
            undefined,
            undefined,
            certDir,
            ...mountFds,
        ];
        listenfd = fds.length;
        connfd = listenfd + 1;
        args = ["arg0", "--net=socket=listenfd=" + listenfd, "--mac", genmac()];
        env = [
            "SSL_CERT_FILE=/.wasmenv/proxy.crt",
            "GIT_SSL_CAINFO=/.wasmenv/proxy.crt",
            "CARGO_HTTP_CAINFO=/.wasmenv/proxy.crt",
            "CARGO_NET_GIT_FETCH_WITH_CLI=true",
            "CARGO_REGISTRIES_CRATES_IO_PROTOCOL=sparse",
            "https_proxy=http://192.168.127.253:80",
            "http_proxy=http://192.168.127.253:80",
            "HTTPS_PROXY=http://192.168.127.253:80",
            "HTTP_PROXY=http://192.168.127.253:80",
        ];
    } else if (mountFds.length > 0) {
        fds = [
            undefined,
            undefined,
            undefined,
            ...mountFds,
        ];
        listenfd = fds.length;
        connfd = listenfd + 1;
    }

    logWorkerEvent("info", "worker.runtime.starting", {
        network: netParam ? (netParam.mode || "custom") : "proxy",
        mountCount: pendingMounts.length,
        mountFdCount: mountFds.length,
        mounts: describePendingMounts() || "none",
    });
    startTerminalWasi(wasm, ttyClient, args, env, fds, listenfd, connfd);
}

function isWorkerMountMessage(value: unknown): value is WorkerMountMessage {
    return typeof value === "object"
        && value !== null
        && ((value as { type?: unknown }).type === "mount-dir" || (value as { type?: unknown }).type === "mount-file" || (value as { type?: unknown }).type === "mount-memory-dir");
}

function isWorkerDirectFsSharedBufferMessage(value: unknown): value is WorkerDirectFsSharedBufferMessage {
    return typeof value === "object"
        && value !== null
        && (value as { type?: unknown }).type === "direct-fs-shared-buffer";
}

function registerDirectFsSharedBuffer(message: WorkerDirectFsSharedBufferMessage): void {
    if (typeof SharedArrayBuffer === "undefined" || !(message.buffer instanceof SharedArrayBuffer)) {
        throw new Error("direct filesystem shared buffer message did not include a SharedArrayBuffer");
    }
    if (message.buffer.byteLength <= WORKER_DIRECT_FS_SHARED_WRITE_HEADER_BYTES) {
        throw new Error("direct filesystem shared buffer is too small");
    }
    directFsSharedWriteHeader = new Int32Array(
        message.buffer,
        0,
        WORKER_DIRECT_FS_SHARED_WRITE_HEADER_BYTES / Int32Array.BYTES_PER_ELEMENT
    );
    directFsSharedWriteBytes = new Uint8Array(message.buffer, WORKER_DIRECT_FS_SHARED_WRITE_HEADER_BYTES);
    Atomics.store(directFsSharedWriteHeader, 0, 0);
    Atomics.store(directFsSharedWriteHeader, 1, 0);
    Atomics.store(directFsSharedWriteHeader, 2, 0);
    Atomics.store(directFsSharedWriteHeader, 3, 0);
    logWorkerEvent("info", "worker.direct_fs.shared_buffer_ready", {
        bytes: directFsSharedWriteBytes.byteLength,
    });
}

function queuePendingMount(message: WorkerMountMessage): void {
    const mountPoint = normalizeWorkerMountPoint(message.mountPoint);
    const label = typeof message.label === "string" && message.label.trim()
        ? message.label.trim()
        : mountPoint;

    if (message.type === "mount-memory-dir") {
        const manager = new DirectFsDirectoryManager(mountPoint);
        manager.replaceFromMountFiles(message.files);
        directFsManagersByMountPoint.set(mountPoint, manager);
        upsertPendingMount({
            kind: "memory-directory",
            mountPoint,
            label,
            manager,
        });
        return;
    }

    if (message.type === "mount-dir") {
        const dirHandle = asDirectoryHandle(message.dirHandle);
        upsertPendingMount({
            kind: "directory",
            mountPoint,
            label,
            dirHandle,
        });
        return;
    }

    const directFile = isBrowserFileLike(message.file) ? message.file : undefined;
    const fileHandle = isFileHandleLike(message.fileHandle) ? message.fileHandle : undefined;
    if (!directFile && !fileHandle) {
        throw new Error("mount-file message did not include a browser File or file handle");
    }

    const rawFileName = typeof message.fileName === "string"
        ? message.fileName
        : directFile?.name || fileHandle?.name || "mounted-file";
    const fileName = sanitizeWorkerEntryName(rawFileName);
    upsertPendingMount({
        kind: "file",
        mountPoint,
        label: label === mountPoint ? "file " + fileName : label,
        fileName,
        file: directFile,
        fileHandle,
    });
}

function upsertPendingMount(mount: PendingWorkerMount): void {
    pendingMounts = pendingMounts.filter((candidate) => candidate.mountPoint !== mount.mountPoint);
    pendingMounts.push(mount);
}

async function buildPendingMountFds(): Promise<Array<unknown | undefined>> {
    const mountFds: Array<unknown | undefined> = [];
    for (const mount of pendingMounts) {
        mountFds.push(await preopenFromPendingMount(mount));
    }
    return mountFds;
}

async function preopenFromPendingMount(mount: PendingWorkerMount): Promise<WasiPreopenDirectory> {
    if (mount.kind === "directory") {
        const entries = await entriesFromDirectoryHandle(mount.dirHandle);
        const stats = countWasiDirectoryEntries(entries);
        logWorkerEvent("info", "worker.mount.preopen_ready", {
            kind: mount.kind,
            mountPoint: mount.mountPoint,
            label: mount.label,
            entries: stats.entries,
            files: stats.files,
            directories: stats.directories,
        });
        return makePreopenDirectory(mount.mountPoint, entries);
    }
    if (mount.kind === "memory-directory") {
        logWorkerEvent("info", "worker.mount.preopen_ready", {
            kind: mount.kind,
            mountPoint: mount.mountPoint,
            label: mount.label,
        });
        return preopenFromDirectFsManager(mount);
    }

    const browserFile = mount.file || await mount.fileHandle?.getFile();
    if (!browserFile) {
        throw new Error("browser file is no longer available for mount " + mount.mountPoint);
    }
    const fileEntry = await wasiFileFromBrowserFile(browserFile);
    logWorkerEvent("info", "worker.mount.preopen_ready", {
        kind: mount.kind,
        mountPoint: mount.mountPoint,
        label: mount.label,
        fileName: mount.fileName,
        bytes: browserFileSize(browserFile),
    });
    return makePreopenDirectory(mount.mountPoint, {
        [mount.fileName]: fileEntry,
    });
}

function makePreopenDirectory(mountPoint: string, contents: Record<string, unknown>): WasiPreopenDirectory {
    const preopen = new PreopenDirectory(mountPoint, contents);
    const originalPathOpen = preopen.path_open;
    preopen.path_open = (dirflags, path, oflags, fsRightsBase, fsRightsInherited, fdflags) => {
        const ret = originalPathOpen.apply(preopen, [dirflags, path, oflags, fsRightsBase, fsRightsInherited, fdflags]);
        if (ret.fd_obj !== null) {
            patchOpenedWasiFileForPread(ret.fd_obj);
        }
        return ret;
    };
    return preopen;
}

function patchOpenedWasiFileForPread(opened: unknown): void {
    if (typeof opened !== "object" || opened === null) {
        return;
    }
    const candidate = opened as WasiOpenFile;
    if (typeof candidate.fd_seek !== "function" || typeof candidate.fd_read !== "function" || !("file_pos" in candidate)) {
        return;
    }

    candidate.fd_pread = (view8: Uint8Array, iovs: WasiIoVec[], offset: bigint | number): WasiReadResult => {
        const oldOffset = candidate.file_pos;
        let seek = candidate.fd_seek(offset, WHENCE_SET);
        if (seek.ret !== 0) {
            return { ret: -1, nread: 0 };
        }
        const readRet = candidate.fd_read(view8, iovs);
        seek = candidate.fd_seek(oldOffset, WHENCE_SET);
        if (seek.ret !== 0) {
            return { ret: -1, nread: 0 };
        }
        return readRet;
    };
    patchOpenedWasiFileForEfficientWrite(candidate as WasiOpenFileWithWriteCache);
}

function patchOpenedWasiFileForEfficientWrite(opened: WasiOpenFileWithWriteCache): void {
    if (opened.__container2WasmEfficientWritePatched || typeof opened.fd_write !== "function") {
        return;
    }
    if (!opened.file || !(opened.file.data instanceof Uint8Array)) {
        return;
    }

    opened.__container2WasmEfficientWritePatched = true;
    opened.fd_write = (view8: Uint8Array, iovs: WasiIoVec[]): WasiWriteResult => {
        const file = opened.file;
        if (!file || !(file.data instanceof Uint8Array)) {
            return { ret: 28, nwritten: 0 };
        }
        let filePos: number;
        try {
            filePos = numberFromWasiFileOffset(opened.file_pos);
        } catch {
            return { ret: 28, nwritten: 0 };
        }

        const result = writeWasiFileAtPosition(file, view8, iovs, filePos);
        opened.file_pos = BigInt(result.nextFilePos);
        return { ret: result.ret, nwritten: result.nwritten };
    };
    opened.fd_pwrite = (view8: Uint8Array, iovs: WasiIoVec[], offset: bigint | number): WasiWriteResult => {
        const file = opened.file;
        if (!file || !(file.data instanceof Uint8Array)) {
            return { ret: 28, nwritten: 0 };
        }
        try {
            return writeWasiFileAtPosition(file, view8, iovs, numberFromWasiFileOffset(offset));
        } catch {
            return { ret: 28, nwritten: 0 };
        }
    };
    opened.fd_filestat_set_size = (size: bigint | number): number => {
        const file = opened.file;
        if (!file || !(file.data instanceof Uint8Array)) {
            return 28;
        }
        try {
            resizeWasiFile(file, numberFromWasiFileOffset(size));
            return 0;
        } catch {
            return 28;
        }
    };
    opened.fd_sync = () => 0;
    opened.fd_datasync = () => 0;
}

function writeWasiFileAtPosition(
    file: WasiShimWritableFile,
    view8: Uint8Array,
    iovs: WasiIoVec[],
    initialFilePos: number
): WasiWriteResult & { nextFilePos: number } {
    let { backing, logicalSize } = wasiWritableFileState(file);
    let filePos = initialFilePos;
    let written = 0;

    for (const iovec of iovs) {
        const buf = Math.floor(iovec.buf);
        const length = Math.floor(iovec.buf_len);
        if (!Number.isSafeInteger(buf) || !Number.isSafeInteger(length) || buf < 0 || length < 0 || buf + length > view8.byteLength) {
            commitWasiWritableFileState(file, backing, logicalSize);
            return { ret: 28, nwritten: written, nextFilePos: filePos };
        }
        if (length === 0) {
            continue;
        }

        const end = filePos + length;
        if (!Number.isSafeInteger(end) || end < filePos) {
            commitWasiWritableFileState(file, backing, logicalSize);
            return { ret: 28, nwritten: written, nextFilePos: filePos };
        }

        if (end > backing.byteLength) {
            const expanded = new Uint8Array(nextWasiWriteCapacity(backing.byteLength, end));
            expanded.set(backing.subarray(0, logicalSize), 0);
            backing = expanded;
        }
        if (filePos > logicalSize) {
            backing.fill(0, logicalSize, filePos);
        }

        backing.set(view8.subarray(buf, buf + length), filePos);
        filePos = end;
        logicalSize = Math.max(logicalSize, end);
        written += length;
    }

    commitWasiWritableFileState(file, backing, logicalSize);
    return { ret: 0, nwritten: written, nextFilePos: filePos };
}

function resizeWasiFile(file: WasiShimWritableFile, newLogicalSize: number): void {
    let { backing, logicalSize } = wasiWritableFileState(file);
    if (newLogicalSize > backing.byteLength) {
        const expanded = new Uint8Array(nextWasiWriteCapacity(backing.byteLength, newLogicalSize));
        expanded.set(backing.subarray(0, logicalSize), 0);
        backing = expanded;
    }
    if (newLogicalSize > logicalSize) {
        backing.fill(0, logicalSize, newLogicalSize);
    }
    commitWasiWritableFileState(file, backing, newLogicalSize);
}

function commitWasiWritableFileState(file: WasiShimWritableFile, backing: Uint8Array, logicalSize: number): void {
    file.__container2WasmWriteBuffer = backing;
    file.__container2WasmLogicalSize = logicalSize;
    file.data = backing.subarray(0, logicalSize);
        }

function wasiWritableFileState(file: WasiShimWritableFile): { backing: Uint8Array; logicalSize: number } {
    const cachedBacking = file.__container2WasmWriteBuffer;
    const cachedLogicalSize = file.__container2WasmLogicalSize;
    if (cachedBacking instanceof Uint8Array
        && typeof cachedLogicalSize === "number"
        && Number.isSafeInteger(cachedLogicalSize)
        && cachedLogicalSize >= 0
        && cachedLogicalSize <= cachedBacking.byteLength
        && file.data.buffer === cachedBacking.buffer
        && file.data.byteOffset === 0
        && file.data.byteLength === cachedLogicalSize) {
        return { backing: cachedBacking, logicalSize: cachedLogicalSize };
    }

    const logicalSize = file.data.byteLength;
    const backing = new Uint8Array(nextWasiWriteCapacity(0, logicalSize));
    backing.set(file.data, 0);
    return { backing, logicalSize };
}

function nextWasiWriteCapacity(currentCapacity: number, requiredSize: number): number {
    if (requiredSize <= 0) {
        return 0;
    }
    let capacity = Math.max(currentCapacity, DIRECT_FS_EFFICIENT_WRITE_MIN_CAPACITY);
    while (capacity < requiredSize) {
        capacity = Math.max(requiredSize, Math.floor(capacity * 1.5), capacity + DIRECT_FS_EFFICIENT_WRITE_MIN_CAPACITY);
    }
    return capacity;
}

function numberFromWasiFileOffset(offset: bigint | number): number {
    const value = typeof offset === "bigint" ? Number(offset) : offset;
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error("WASI file offset is outside JavaScript's safe integer range");
    }
    return value;
}

function describePendingMounts(): string {
    return pendingMounts.map(describePendingMount).join("; ");
}

function describePendingMount(mount: PendingWorkerMount): string {
    const suffix = mount.kind === "file" ? "/" + mount.fileName : "";
    return mount.kind + ":" + mount.mountPoint + suffix + " (" + mount.label + ")";
}

function countWasiDirectoryEntries(contents: Record<string, unknown>): { entries: number; files: number; directories: number } {
    const stats = { entries: 0, files: 0, directories: 0 };
    const seen = new Set<unknown>();

    const visit = (entry: unknown): void => {
        if (isWasiShimDirectory(entry)) {
            if (seen.has(entry)) {
                return;
            }
            seen.add(entry);
            stats.entries += 1;
            stats.directories += 1;
            for (const child of Object.values(entry.contents)) {
                visit(child);
            }
        } else {
            stats.entries += 1;
            stats.files += 1;
        }
    };

    for (const entry of Object.values(contents)) {
        visit(entry);
    }
    return stats;
}

function browserFileSize(file: BrowserFileLike): number | undefined {
    const size = (file as { size?: unknown }).size;
    return typeof size === "number" && Number.isFinite(size) ? size : undefined;
}

async function entriesFromDirectoryHandle(dirHandle: BrowserDirectoryHandleLike): Promise<Record<string, unknown>> {
    const entries: Record<string, unknown> = {};

    for await (const [rawName, handle] of dirHandle.entries()) {
        const name = sanitizeWorkerEntryName(rawName);
        if (isDirectoryHandleLike(handle)) {
            entries[name] = newWasiDirectory(await entriesFromDirectoryHandle(handle));
        } else if (isFileHandleLike(handle)) {
            entries[name] = await wasiFileFromBrowserFile(await handle.getFile());
        } else {
            console.warn("skipping unsupported browser file-system handle in mount:", rawName);
        }
    }

    return entries;
}

async function wasiFileFromBrowserFile(browserFile: BrowserFileLike): Promise<unknown> {
    const bytes = new Uint8Array(await browserFile.arrayBuffer());
    const WasiFile = globalThis.File as unknown as WasiFileConstructor;
    return new WasiFile(bytes, { readonly: false });
}

function newWasiDirectory(entries: Record<string, unknown>): unknown {
    const WasiDirectory = (globalThis as typeof globalThis & { Directory?: WasiDirectoryConstructor }).Directory;
    if (typeof WasiDirectory !== "function") {
        throw new Error("browser_wasi_shim Directory constructor is not available");
    }
    return new WasiDirectory(entries);
}

function preopenFromDirectFsManager(mount: PendingWorkerMemoryDirectoryMount): WasiPreopenDirectory {
    const preopen = makePreopenDirectory(mount.mountPoint, mount.manager.rootContents) as WasiPreopenDirectory & {
        __directFsManager?: DirectFsDirectoryManager;
        path_create_directory?: (path: string) => number;
        path_unlink_file?: (path: string) => number;
        path_remove_directory?: (path: string) => number;
        path_filestat_set_times?: () => number;
    };
    preopen.__directFsManager = mount.manager;
    preopen.path_create_directory = (path: string) => mount.manager.createDirectory(path);
    preopen.path_unlink_file = (path: string) => mount.manager.unlinkFile(path);
    preopen.path_remove_directory = (path: string) => mount.manager.removeDirectory(path);
    preopen.path_filestat_set_times = () => 0;
    return preopen;
}

function asDirectoryHandle(value: unknown): BrowserDirectoryHandleLike {
    if (!isDirectoryHandleLike(value)) {
        throw new Error("mount-dir message did not include a FileSystemDirectoryHandle");
    }
    return value;
}

function isDirectoryHandleLike(value: unknown): value is BrowserDirectoryHandleLike {
    return typeof value === "object"
        && value !== null
        && typeof (value as { entries?: unknown }).entries === "function";
}

function isFileHandleLike(value: unknown): value is BrowserFileHandleLike {
    return typeof value === "object"
        && value !== null
        && typeof (value as { getFile?: unknown }).getFile === "function";
}

function isBrowserFileLike(value: unknown): value is BrowserFileLike {
    return typeof value === "object"
        && value !== null
        && typeof (value as { arrayBuffer?: unknown }).arrayBuffer === "function";
}

function normalizeWorkerMountPoint(value: unknown): string {
    if (typeof value !== "string") {
        throw new Error("mount point must be a string");
    }

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

function sanitizeWorkerEntryName(value: string): string {
    if (value.includes("\0")) {
        throw new Error("file-system entry name must not contain NUL bytes");
    }

    const parts = value
        .replace(/\\/g, "/")
        .split("/")
        .filter((part) => part.length > 0 && part !== "." && part !== "..");
    const name = parts.pop();
    if (!name) {
        throw new Error("file-system entry name is empty");
    }
    return name;
}

function writeTerminalStartupError(ttyClient: TtyClient, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    logWorkerEvent("error", "worker.runtime.start_failed", {
        message,
    });
    const text = "\r\ncontainer startup failed while preparing browser mounts: " + message + "\r\n";
    try {
        ttyClient.onWrite(Array.from(new TextEncoder().encode(text)));
    } catch {
        console.error(text);
    }
}

function startTerminalWasi(
    wasm: ArrayBuffer,
    ttyClient: TtyClient,
    args: string[],
    env: string[],
    fds: Array<unknown | undefined>,
    listenfd: number,
    connfd: number
): void {
    const cmd = getRuntimeArgs();
    if (cmd) {
        const flags = ["-entrypoint", "/bin/sh", "--", "-c", cmd];
        args = args.length > 0 ? args.concat(flags) : ["arg0"].concat(flags);
    }

    const wasi = new WASI(args, env, fds);
    wasiHackDirectFs(wasi);
    wasiHackTerminal(wasi, ttyClient, connfd);
    wasiHackSocket(wasi, listenfd, connfd);

    WebAssembly.instantiate(wasm, {
        wasi_snapshot_preview1: wasi.wasiImport,
    })
        .then((inst) => {
            wasi.start(inst.instance);
        })
        .catch((error: unknown) => {
            logWorkerEvent("error", "worker.runtime.instantiate_failed", {
                message: workerErrorMessage(error),
            });
            console.error("failed to start WASI runtime:", error);
        });
}

function getRuntimeArgs(): string | undefined {
    const params = new URLSearchParams(location.search);
    return params.get("args") || undefined;
}

function isWorkerDirectFsRequestMessage(value: unknown): value is WorkerDirectFsRequestMessage {
    if (typeof value !== "object"
        || value === null
        || typeof (value as { type?: unknown }).type !== "string") {
        return false;
    }

    const type = String((value as { type?: unknown }).type);
    return type.startsWith("direct-fs-") && type !== "direct-fs-shared-buffer";
}

function handleWorkerDirectFsRequest(message: WorkerDirectFsRequestMessage): void {
    const requestId = typeof message.requestId === "string" ? message.requestId : "";
    if (!requestId) {
        return;
    }

    try {
        const mountPoint = normalizeWorkerMountPoint(message.mountPoint);
        const manager = directFsManagersByMountPoint.get(mountPoint);
        if (!manager) {
            throw new Error("direct filesystem mount is not registered: " + mountPoint);
        }
        const path = typeof message.path === "string" ? message.path : "";

        switch (message.type) {
            case "direct-fs-write-file": {
                manager.writeFile(path, bytesFromDirectFsPayload(message.data));
                postDirectFsResponse(requestId, {
                    ok: true,
                    size: manager.readFile(path).byteLength,
                });
                return;
            }
            case "direct-fs-write-file-begin": {
                const writeId = normalizeWorkerWriteId(message.writeId);
                const expectedSize = normalizeWorkerNonNegativeInteger(message.expectedSize, "expectedSize");
                const chunkCount = normalizeWorkerNonNegativeInteger(message.chunkCount, "chunkCount");
                manager.beginWrite(writeId, path, expectedSize, chunkCount);
                postDirectFsResponse(requestId, {
                    ok: true,
                    size: 0,
                });
                return;
            }
            case "direct-fs-write-file-chunk": {
                const writeId = normalizeWorkerWriteId(message.writeId);
                const chunkIndex = normalizeWorkerNonNegativeInteger(message.chunkIndex, "chunkIndex");
                const size = manager.appendWriteChunk(writeId, chunkIndex, bytesFromDirectFsPayload(message.data));
                postDirectFsResponse(requestId, {
                    ok: true,
                    size,
                });
                return;
            }
            case "direct-fs-write-file-shared-chunk": {
                const writeId = normalizeWorkerWriteId(message.writeId);
                const chunkIndex = normalizeWorkerNonNegativeInteger(message.chunkIndex, "chunkIndex");
                const size = manager.appendWriteChunk(writeId, chunkIndex, bytesFromDirectFsSharedChunk(message, chunkIndex));
                postDirectFsResponse(requestId, {
                    ok: true,
                    size,
                });
                return;
            }
            case "direct-fs-write-file-end": {
                const writeId = normalizeWorkerWriteId(message.writeId);
                const size = manager.finishWrite(writeId);
                postDirectFsResponse(requestId, {
                    ok: true,
                    size,
                });
                return;
            }
            case "direct-fs-write-file-abort":
                manager.abortWrite(normalizeWorkerWriteId(message.writeId));
                postDirectFsResponse(requestId, { ok: true });
                return;
            case "direct-fs-read-file": {
                const bytes = manager.readFile(path).slice();
                postDirectFsResponse(requestId, {
                    ok: true,
                    data: bytes.buffer,
                    size: bytes.byteLength,
                }, [bytes.buffer]);
                return;
            }
            case "direct-fs-delete-file":
                manager.deleteFileIfExists(path);
                postDirectFsResponse(requestId, { ok: true });
                return;
            case "direct-fs-clear-directory":
                manager.clearDirectory(path);
                postDirectFsResponse(requestId, { ok: true });
                return;
            case "direct-fs-list-directory":
                postDirectFsResponse(requestId, {
                    ok: true,
                    paths: manager.listDirectory(path, Number(message.maxEntries)),
                });
                return;
            default:
                throw new Error("unsupported direct filesystem request: " + String(message.type));
        }
    } catch (error) {
        postDirectFsResponse(requestId, {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}

function postDirectFsResponse(
    requestId: string,
    payload: { ok: boolean; error?: string; data?: ArrayBuffer; paths?: string[]; size?: number },
    transfer: Transferable[] = []
): void {
    postMessage({
        type: "direct-fs-response",
        requestId,
        ...payload,
    }, transfer);
}

function bytesFromDirectFsPayload(value: unknown): Uint8Array {
    if (value instanceof ArrayBuffer) {
        return new Uint8Array(value);
    }
    if (ArrayBuffer.isView(value)) {
        return new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice();
    }
    throw new Error("direct filesystem payload did not contain bytes");
}

function bytesFromDirectFsSharedChunk(message: WorkerDirectFsRequestMessage, expectedChunkIndex: number): Uint8Array {
    if (!directFsSharedWriteHeader || !directFsSharedWriteBytes) {
        throw new Error("direct filesystem shared write buffer is not registered");
    }
    const sharedOffset = normalizeWorkerNonNegativeInteger(message.sharedOffset ?? 0, "sharedOffset");
    const sharedLength = normalizeWorkerNonNegativeInteger(message.sharedLength, "sharedLength");
    const sharedSequence = normalizeWorkerNonNegativeInteger(message.sharedSequence, "sharedSequence");
    if (sharedSequence <= 0) {
        throw new Error("direct filesystem sharedSequence must be positive");
    }
    if (sharedOffset + sharedLength > directFsSharedWriteBytes.byteLength) {
        throw new Error("direct filesystem shared chunk exceeds shared buffer bounds");
    }
    const observedSequence = Atomics.load(directFsSharedWriteHeader, 0);
    if (observedSequence !== sharedSequence) {
        throw new Error("direct filesystem shared chunk sequence mismatch: expected " + sharedSequence + ", got " + observedSequence);
    }
    const observedLength = Atomics.load(directFsSharedWriteHeader, 1);
    if (observedLength !== sharedLength) {
        throw new Error("direct filesystem shared chunk length mismatch: expected " + sharedLength + ", got " + observedLength);
    }
    const observedChunkIndex = Atomics.load(directFsSharedWriteHeader, 2);
    if (observedChunkIndex !== expectedChunkIndex) {
        throw new Error("direct filesystem shared chunk index mismatch: expected " + expectedChunkIndex + ", got " + observedChunkIndex);
    }
    return directFsSharedWriteBytes.slice(sharedOffset, sharedOffset + sharedLength);
}

function normalizeWorkerWriteId(value: unknown): string {
    if (typeof value !== "string" || value.length === 0 || value.length > 160 || value.includes("\0")) {
        throw new Error("direct filesystem chunked write id is invalid");
    }
    return value;
}

function normalizeWorkerNonNegativeInteger(value: unknown, name: string): number {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 0) {
        throw new Error("direct filesystem " + name + " must be a non-negative safe integer");
    }
    return parsed;
}

function wasiHackDirectFs(wasi: WASI): void {
    const originalPathRename = wasi.wasiImport.path_rename;
    wasi.wasiImport.path_rename = (
        oldFd: number,
        oldPathPtr: number,
        oldPathLen: number,
        newFd: number,
        newPathPtr: number,
        newPathLen: number
    ) => {
        const oldManager = directFsManagerForFd(wasi, oldFd);
        const newManager = directFsManagerForFd(wasi, newFd);
        if (oldManager && newManager && oldManager === newManager) {
            const oldPath = readWasiString(wasi, oldPathPtr, oldPathLen);
            const newPath = readWasiString(wasi, newPathPtr, newPathLen);
            return oldManager.rename(oldPath, newPath);
        }
        if (typeof originalPathRename === "function") {
            try {
                return originalPathRename.apply(wasi.wasiImport, [oldFd, oldPathPtr, oldPathLen, newFd, newPathPtr, newPathLen]);
            } catch {
                return 28;
            }
        }
        return 28;
    };
}

function directFsManagerForFd(wasi: WASI, fd: number): DirectFsDirectoryManager | undefined {
    const fdObj = wasi.fds[fd] as { __directFsManager?: DirectFsDirectoryManager } | undefined;
    return fdObj?.__directFsManager;
}

function readWasiString(wasi: WASI, ptr: number, len: number): string {
    const bytes = new Uint8Array(wasi.inst.exports.memory.buffer, ptr, len);
    return new TextDecoder().decode(bytes);
}

class DirectFsDirectoryManager {
    readonly rootContents: Record<string, unknown> = {};
    private readonly pendingWrites = new Map<string, DirectFsPendingWrite>();

    constructor(readonly mountPoint: string) {}

    replaceFromMountFiles(files: unknown): void {
        this.clearRoot();
        if (!Array.isArray(files)) {
            return;
        }
        for (const file of files as WorkerMemoryMountFile[]) {
            if (typeof file.path !== "string") {
                continue;
            }
            this.writeFile(file.path, bytesFromDirectFsPayload(file.data));
        }
    }

    writeFile(path: string, bytes: Uint8Array): void {
        const { directory, name } = this.parentDirectory(path, true);
        const WasiFile = globalThis.File as unknown as WasiFileConstructor;
        const file = new WasiFile(bytes, { readonly: false }) as WasiShimWritableFile;
        if (file.data instanceof Uint8Array) {
            file.__container2WasmWriteBuffer = file.data;
            file.__container2WasmLogicalSize = file.data.byteLength;
        }
        directory.contents[name] = file;
    }

    readFile(path: string): Uint8Array {
        const entry = this.entry(path);
        if (!isWasiShimFile(entry)) {
            throw new Error("direct filesystem path is not a file: " + path);
        }
        return entry.data;
    }

    beginWrite(writeId: string, path: string, expectedSize: number, chunkCount: number): void {
        if (this.pendingWrites.has(writeId)) {
            throw new Error("direct filesystem chunked write already exists: " + writeId);
        }

        this.pendingWrites.set(writeId, {
            path: sanitizeWorkerRelativePath(path),
            expectedSize,
            chunkCount,
            buffer: new Uint8Array(expectedSize),
            receivedBytes: 0,
            nextChunkIndex: 0,
        });
    }

    appendWriteChunk(writeId: string, chunkIndex: number, bytes: Uint8Array): number {
        const pending = this.pendingWrites.get(writeId);
        if (!pending) {
            throw new Error("direct filesystem chunked write is not active: " + writeId);
        }
        if (chunkIndex !== pending.nextChunkIndex) {
            throw new Error("direct filesystem chunk order mismatch for " + writeId + ": expected " + pending.nextChunkIndex + ", got " + chunkIndex);
        }
        if (pending.chunkCount === 0 || chunkIndex >= pending.chunkCount) {
            throw new Error("direct filesystem chunk index is out of range for " + writeId);
        }
        const nextReceivedBytes = pending.receivedBytes + bytes.byteLength;
        if (nextReceivedBytes > pending.expectedSize) {
            throw new Error("direct filesystem chunked write exceeded expected size for " + writeId);
        }
        pending.buffer.set(bytes, pending.receivedBytes);
        pending.receivedBytes = nextReceivedBytes;
        pending.nextChunkIndex += 1;
        return pending.receivedBytes;
    }

    finishWrite(writeId: string): number {
        const pending = this.pendingWrites.get(writeId);
        if (!pending) {
            throw new Error("direct filesystem chunked write is not active: " + writeId);
        }

        try {
            if (pending.nextChunkIndex !== pending.chunkCount) {
                throw new Error("direct filesystem chunked write received " + pending.nextChunkIndex + " of " + pending.chunkCount + " chunk(s) for " + writeId);
            }
            if (pending.receivedBytes !== pending.expectedSize) {
                throw new Error("direct filesystem chunked write size mismatch for " + writeId + ": expected " + pending.expectedSize + ", got " + pending.receivedBytes);
            }

            this.writeFile(pending.path, pending.buffer);
            return pending.buffer.byteLength;
        } finally {
            this.pendingWrites.delete(writeId);
        }
    }

    abortWrite(writeId: string): void {
        this.pendingWrites.delete(writeId);
    }

    deleteFileIfExists(path: string): void {
        try {
            const { directory, name } = this.parentDirectory(path, false);
            if (isWasiShimFile(directory.contents[name])) {
                delete directory.contents[name];
            }
        } catch {
            return;
        }
    }

    clearDirectory(path: string): void {
        const directory = this.directory(path, true);
        for (const name of Object.keys(directory.contents)) {
            delete directory.contents[name];
        }
    }

    createDirectory(path: string): number {
        try {
            this.directory(path, true);
            return 0;
        } catch {
            return 28;
        }
    }

    unlinkFile(path: string): number {
        try {
            const { directory, name } = this.parentDirectory(path, false);
            if (!isWasiShimFile(directory.contents[name])) {
                return 44;
            }
            delete directory.contents[name];
            return 0;
        } catch {
            return 44;
        }
    }

    removeDirectory(path: string): number {
        try {
            const { directory, name } = this.parentDirectory(path, false);
            if (!isWasiShimDirectory(directory.contents[name])) {
                return 44;
            }
            delete directory.contents[name];
            return 0;
        } catch {
            return 44;
        }
    }

    rename(oldPath: string, newPath: string): number {
        try {
            const oldParent = this.parentDirectory(oldPath, false);
            const entry = oldParent.directory.contents[oldParent.name];
            if (entry === undefined) {
                return 44;
            }
            const newParent = this.parentDirectory(newPath, true);
            newParent.directory.contents[newParent.name] = entry;
            delete oldParent.directory.contents[oldParent.name];
            return 0;
        } catch {
            return 28;
        }
    }

    listDirectory(path: string, maxEntries: number): string[] {
        const limit = Number.isFinite(maxEntries) && maxEntries > 0 ? Math.floor(maxEntries) : 200;
        const normalized = sanitizeWorkerRelativePath(path, true);
        const entry = normalized ? this.entry(normalized) : this.rootDirectory();
        if (isWasiShimFile(entry)) {
            return [normalized];
        }
        if (!isWasiShimDirectory(entry)) {
            return [];
        }
        const paths: string[] = [];
        this.collectPaths(entry, "", paths, limit);
        return paths.sort().slice(0, limit);
    }

    private clearRoot(): void {
        for (const name of Object.keys(this.rootContents)) {
            delete this.rootContents[name];
        }
    }

    private rootDirectory(): { contents: Record<string, unknown> } {
        return { contents: this.rootContents };
    }

    private entry(path: string): unknown {
        const parts = sanitizeWorkerRelativePath(path).split("/");
        let current: unknown = this.rootDirectory();
        for (const part of parts) {
            if (!isWasiShimDirectory(current)) {
                throw new Error("direct filesystem parent is not a directory: " + path);
            }
            current = current.contents[part];
            if (current === undefined) {
                throw new Error("direct filesystem path not found: " + path);
            }
        }
        return current;
    }

    private directory(path: string, create: boolean): { contents: Record<string, unknown> } {
        const normalized = sanitizeWorkerRelativePath(path, true);
        if (!normalized) {
            return this.rootDirectory();
        }
        let current = this.rootDirectory();
        for (const part of normalized.split("/")) {
            let next = current.contents[part];
            if (next === undefined && create) {
                next = newWasiDirectory({});
                current.contents[part] = next;
            }
            if (!isWasiShimDirectory(next)) {
                throw new Error("direct filesystem path is not a directory: " + path);
            }
            current = next;
        }
        return current;
    }

    private parentDirectory(path: string, create: boolean): { directory: { contents: Record<string, unknown> }; name: string } {
        const normalized = sanitizeWorkerRelativePath(path);
        const parts = normalized.split("/");
        const name = parts.pop();
        if (!name) {
            throw new Error("direct filesystem file name is empty");
        }
        return {
            directory: this.directory(parts.join("/"), create),
            name,
        };
    }

    private collectPaths(directory: { contents: Record<string, unknown> }, prefix: string, paths: string[], limit: number): void {
        if (paths.length >= limit) {
            return;
        }
        for (const name of Object.keys(directory.contents).sort()) {
            const childPath = prefix ? prefix + "/" + name : name;
            paths.push(childPath);
            const child = directory.contents[name];
            if (isWasiShimDirectory(child)) {
                this.collectPaths(child, childPath, paths, limit);
            }
            if (paths.length >= limit) {
                return;
            }
        }
    }
}

function sanitizeWorkerRelativePath(value: string, allowEmpty = false): string {
    if (value.includes("\0")) {
        throw new Error("direct filesystem relative path must not contain NUL bytes");
    }
    const parts = value.replace(/\\/g, "/").split("/").filter((part) => part.length > 0);
    if (parts.some((part) => part === "." || part === "..")) {
        throw new Error("direct filesystem relative path must not contain . or .. segments");
    }
    if (parts.length === 0) {
        if (allowEmpty) {
            return "";
        }
        throw new Error("direct filesystem relative path is empty");
    }
    return parts.join("/");
}

function isWasiShimDirectory(value: unknown): value is { contents: Record<string, unknown> } {
    return typeof value === "object"
        && value !== null
        && typeof (value as { contents?: unknown }).contents === "object"
        && (value as { contents?: unknown }).contents !== null;
}

function isWasiShimFile(value: unknown): value is { data: Uint8Array } {
    return typeof value === "object"
        && value !== null
        && (value as { data?: unknown }).data instanceof Uint8Array;
}

function readTerminalInputForGuest(ttyClient: TtyClient, maxLen: number): Uint8Array {
    const requested = Math.max(1, maxLen);
    while (true) {
        const pending = takePendingGuestTerminalInput(requested);
        if (pending.byteLength > 0) {
            return pending;
        }

        const raw = ttyClient.onRead(requested);
        if (raw.byteLength === 0) {
            return raw;
        }

        const guestBytes = filterDirectFsControlInput(raw);
        if (guestBytes.byteLength > 0) {
            appendPendingGuestTerminalInput(guestBytes);
        }
    }
}

function takePendingGuestTerminalInput(maxLen: number): Uint8Array {
    if (pendingGuestTerminalInput.byteLength === 0) {
        return new Uint8Array(0);
    }

    const taken = pendingGuestTerminalInput.slice(0, maxLen);
    pendingGuestTerminalInput = pendingGuestTerminalInput.slice(taken.byteLength);
    return taken;
}

function appendPendingGuestTerminalInput(bytes: Uint8Array): void {
    pendingGuestTerminalInput = appendWorkerData(pendingGuestTerminalInput, bytes);
}

function filterDirectFsControlInput(input: Uint8Array): Uint8Array {
    directFsControlBuffer = appendWorkerData(directFsControlBuffer, input);
    if (directFsControlBuffer.byteLength > DIRECT_FS_CONTROL_MAX_BUFFER_BYTES) {
        logWorkerEvent("warn", "worker.direct_fs.control_buffer_overflow", {
            bytes: directFsControlBuffer.byteLength,
        });
        const leaked = directFsControlBuffer;
        directFsControlBuffer = new Uint8Array(0);
        return leaked;
    }

    const guestChunks: Uint8Array[] = [];
    while (directFsControlBuffer.byteLength > 0) {
        const beginIndex = indexOfSubarray(directFsControlBuffer, WORKER_DIRECT_FS_CONTROL_BEGIN_BYTES);
        if (beginIndex < 0) {
            const keep = matchingSuffixPrefixLength(directFsControlBuffer, WORKER_DIRECT_FS_CONTROL_BEGIN_BYTES);
            const emitLength = directFsControlBuffer.byteLength - keep;
            if (emitLength > 0) {
                guestChunks.push(directFsControlBuffer.slice(0, emitLength));
                directFsControlBuffer = directFsControlBuffer.slice(emitLength);
            }
            break;
        }

        if (beginIndex > 0) {
            guestChunks.push(directFsControlBuffer.slice(0, beginIndex));
            directFsControlBuffer = directFsControlBuffer.slice(beginIndex);
            continue;
        }

        const payloadStart = WORKER_DIRECT_FS_CONTROL_BEGIN_BYTES.byteLength;
        const endIndex = indexOfSubarray(directFsControlBuffer, WORKER_DIRECT_FS_CONTROL_END_BYTES, payloadStart);
        if (endIndex < 0) {
            break;
        }

        const payload = directFsControlBuffer.slice(payloadStart, endIndex);
        handleDirectFsControlFrame(payload);
        directFsControlBuffer = directFsControlBuffer.slice(endIndex + WORKER_DIRECT_FS_CONTROL_END_BYTES.byteLength);
    }

    return concatByteChunks(guestChunks);
}

function handleDirectFsControlFrame(payload: Uint8Array): void {
    let requestId = "";
    try {
        const encodedJson = directFsControlTextDecoder.decode(payload).replace(/\s+/g, "");
        const jsonBytes = workerBase64ToBytes(encodedJson);
        const parsed = JSON.parse(directFsControlTextDecoder.decode(jsonBytes)) as Record<string, unknown>;
        requestId = typeof parsed.requestId === "string" ? parsed.requestId : "";
        const message = reviveDirectFsControlRequest(parsed);
        if (!isWorkerDirectFsRequestMessage(message)) {
            throw new Error("direct filesystem control frame had an unsupported request type");
        }
        logWorkerEvent("info", "worker.direct_fs.control_request", {
            requestId,
            op: String(message.type),
            mountPoint: typeof message.mountPoint === "string" ? message.mountPoint : undefined,
            path: typeof message.path === "string" ? message.path : undefined,
            writeId: typeof message.writeId === "string" ? message.writeId : undefined,
            chunkIndex: typeof message.chunkIndex === "number" ? message.chunkIndex : undefined,
            sharedLength: typeof message.sharedLength === "number" ? message.sharedLength : undefined,
        });
        handleWorkerDirectFsRequest(message);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logWorkerEvent("error", "worker.direct_fs.control_failed", {
            requestId: requestId || undefined,
            message,
        });
        if (requestId) {
            postDirectFsResponse(requestId, {
                ok: false,
                error: message,
            });
        }
    }
}

function reviveDirectFsControlRequest(parsed: Record<string, unknown>): WorkerDirectFsRequestMessage {
    const message: Record<string, unknown> = { ...parsed };
    if (typeof message.dataBase64 === "string") {
        const bytes = workerBase64ToBytes(message.dataBase64);
        message.data = bytes.buffer;
        delete message.dataBase64;
    }
    return message as unknown as WorkerDirectFsRequestMessage;
}

function workerBase64ToBytes(base64: string): Uint8Array {
    const binary = atob(base64.replace(/\s+/g, ""));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) {
        bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
}

function indexOfSubarray(haystack: Uint8Array, needle: Uint8Array, fromIndex = 0): number {
    if (needle.byteLength === 0) {
        return Math.max(0, fromIndex);
    }
    for (let index = Math.max(0, fromIndex); index <= haystack.byteLength - needle.byteLength; index++) {
        let matched = true;
        for (let offset = 0; offset < needle.byteLength; offset++) {
            if (haystack[index + offset] !== needle[offset]) {
                matched = false;
                break;
            }
        }
        if (matched) {
            return index;
        }
    }
    return -1;
}

function matchingSuffixPrefixLength(buffer: Uint8Array, prefix: Uint8Array): number {
    const max = Math.min(buffer.byteLength, Math.max(0, prefix.byteLength - 1));
    for (let length = max; length > 0; length--) {
        let matched = true;
        for (let index = 0; index < length; index++) {
            if (buffer[buffer.byteLength - length + index] !== prefix[index]) {
                matched = false;
                break;
            }
        }
        if (matched) {
            return length;
        }
    }
    return 0;
}

function concatByteChunks(chunks: Uint8Array[]): Uint8Array {
    return chunks.reduce((combined, chunk) => appendWorkerData(combined, chunk), new Uint8Array(0));
}

function concatWorkerBytes(chunks: Uint8Array[], totalSize: number): Uint8Array {
    const output = new Uint8Array(totalSize);
    let offset = 0;
    for (const chunk of chunks) {
        output.set(chunk, offset);
        offset += chunk.byteLength;
    }
    if (offset !== totalSize) {
        throw new Error("direct filesystem byte concatenation size mismatch: expected " + totalSize + ", got " + offset);
    }
    return output;
}

function wasiHackTerminal(wasi: WASI, ttyClient: TtyClient, connfd: number): void {
    const ERRNO_INVAL = 28;

    const originalFdRead = wasi.wasiImport.fd_read;
    wasi.wasiImport.fd_read = (fd: number, iovsPtr: number, iovsLen: number, nreadPtr: number) => {
        if (fd === 0) {
            const buffer = new DataView(wasi.inst.exports.memory.buffer);
            const buffer8 = new Uint8Array(wasi.inst.exports.memory.buffer);
            const iovecs = Iovec.read_bytes_array(buffer, iovsPtr, iovsLen);
            let nread = 0;

            for (const iovec of iovecs) {
                if (iovec.buf_len === 0) {
                    continue;
                }
                const data = readTerminalInputForGuest(ttyClient, iovec.buf_len);
                buffer8.set(data, iovec.buf);
                nread += data.length;
                if (data.length < iovec.buf_len) {
                    break;
                }
            }

            buffer.setUint32(nreadPtr, nread, true);
            return 0;
        }

        console.log("fd_read: unknown fd " + fd);
        return originalFdRead.apply(wasi.wasiImport, [fd, iovsPtr, iovsLen, nreadPtr]);
    };

    const originalFdWrite = wasi.wasiImport.fd_write;
    wasi.wasiImport.fd_write = (fd: number, iovsPtr: number, iovsLen: number, nwrittenPtr: number) => {
        if (fd === 1 || fd === 2) {
            const buffer = new DataView(wasi.inst.exports.memory.buffer);
            const buffer8 = new Uint8Array(wasi.inst.exports.memory.buffer);
            const iovecs = Ciovec.read_bytes_array(buffer, iovsPtr, iovsLen);
            let wtotal = 0;

            for (const iovec of iovecs) {
                const buf = buffer8.slice(iovec.buf, iovec.buf + iovec.buf_len);
                if (buf.length === 0) {
                    continue;
                }
                ttyClient.onWrite(Array.from(buf));
                wtotal += buf.length;
            }

            buffer.setUint32(nwrittenPtr, wtotal, true);
            return 0;
        }

        console.log("fd_write: unknown fd " + fd);
        return originalFdWrite.apply(wasi.wasiImport, [fd, iovsPtr, iovsLen, nwrittenPtr]);
    };

    wasi.wasiImport.poll_oneoff = (inPtr: number, outPtr: number, nsubscriptions: number, neventsPtr: number) => {
        if (nsubscriptions === 0) {
            return ERRNO_INVAL;
        }

        const buffer = new DataView(wasi.inst.exports.memory.buffer);
        const subscriptions = Subscription.read_bytes_array(buffer, inPtr, nsubscriptions);
        let isReadPollStdin = false;
        let isReadPollConn = false;
        let isClockPoll = false;
        let pollSubStdin: Subscription | undefined;
        let pollSubConn: Subscription | undefined;
        let clockSub: Subscription | undefined;
        let timeout = Number.MAX_VALUE;

        for (const sub of subscriptions) {
            if (sub.u.tag.variant === "fd_read") {
                const fd = (sub.u.data as SubscriptionFdReadWrite).fd;
                if (fd !== 0 && fd !== connfd) {
                    console.log("poll_oneoff: unknown fd " + fd);
                    return ERRNO_INVAL;
                }
                if (fd === 0) {
                    isReadPollStdin = true;
                    pollSubStdin = sub;
                } else {
                    isReadPollConn = true;
                    pollSubConn = sub;
                }
            } else if (sub.u.tag.variant === "clock") {
                const clock = sub.u.data as SubscriptionClock;
                if (clock.timeout < timeout) {
                    timeout = clock.timeout;
                    isClockPoll = true;
                    clockSub = sub;
                }
            } else {
                console.log("poll_oneoff: unknown variant " + sub.u.tag.variant);
                return ERRNO_INVAL;
            }
        }

        const events: WasiEvent[] = [];
        if (isReadPollStdin || isReadPollConn || isClockPoll) {
            let readable = false;
            if (isReadPollStdin || (isClockPoll && timeout > 0)) {
                readable = ttyClient.onWaitForReadable(timeout / 1000000000);
            }

            if (readable && isReadPollStdin && pollSubStdin) {
                events.push(makeTerminalWasiEvent(pollSubStdin.userdata, "fd_read"));
            }

            if (isReadPollConn) {
                const sockreadable = sockWaitForReadable();
                if (sockreadable === errStatus) {
                    return ERRNO_INVAL;
                }
                if (sockreadable === true && pollSubConn) {
                    events.push(makeTerminalWasiEvent(pollSubConn.userdata, "fd_read"));
                }
            }

            if (isClockPoll && clockSub) {
                events.push(makeTerminalWasiEvent(clockSub.userdata, "clock"));
            }
        }

        WasiEvent.write_bytes_array(buffer, outPtr, events);
        buffer.setUint32(neventsPtr, events.length, true);
        return 0;
    };
}

function makeTerminalWasiEvent(userdata: bigint, variant: WasiEventVariant): WasiEvent {
    const event = new WasiEvent();
    event.userdata = userdata;
    event.error = 0;
    event.type = new WasiEventType(variant);
    return event;
}

function getWorkerNetParam(): RuntimeNetParam | null {
    const params = new URLSearchParams(location.search);
    const raw = params.get("net");
    if (!raw) {
        return null;
    }
    const parts = raw.split("=");
    const mode = parts.shift() || "";
    if (mode === "none") {
        return null;
    }
    return {
        mode,
        param: parts.join("="),
    };
}

function genmac(): string {
    return "02:XX:XX:XX:XX:XX".replace(/X/g, () => {
        return "0123456789ABCDEF".charAt(Math.floor(Math.random() * 16));
    });
}
