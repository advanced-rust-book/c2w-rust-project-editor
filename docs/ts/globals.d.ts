type WasmImageChunks = number | string[];

type RuntimeNetMode = string;

interface RuntimeNetParam {
    mode: RuntimeNetMode;
    param: string;
}

type WasiBrowserMountKind = "directory" | "file" | "none";

interface WasiBrowserMountInfo {
    kind: WasiBrowserMountKind;
    mountPoint: string;
    label: string;
    mountCount: number;
    runtimeRestarted: boolean;
}

interface WasiBrowserDirectoryMountOptions {
    mode?: "read" | "readwrite";
}

type WasiDirectFsData = string | ArrayBuffer | ArrayBufferView | Blob;

interface WasiDirectFsMountOptions {
    label?: string;
}

interface WasiDirectFsMountResult {
    mountPoint: string;
    runtimeRestarted: boolean;
}

interface WasiDirectFsWriteOptions {
    label?: string;
}

interface WasiDirectFsWriteResult {
    path: string;
    mountPoint: string;
    relativePath: string;
    bytes: number;
}

interface WasiDirectFsListOptions {
    maxEntries?: number;
}

interface WasiDirectFsClient {
    ensureDirectoryMount(mountPoint: string, options?: WasiDirectFsMountOptions): Promise<WasiDirectFsMountResult>;
    writeFile(path: string, data: WasiDirectFsData, options?: WasiDirectFsWriteOptions): Promise<WasiDirectFsWriteResult>;
    readFile(path: string): Promise<Uint8Array>;
    deleteFile(path: string): Promise<void>;
    clearDirectory(path: string): Promise<void>;
    listDirectory(path: string, options?: WasiDirectFsListOptions): Promise<string[]>;
}

interface InitWorkerMessage {
    type: "init";
    buf?: SharedArrayBuffer;
    imagename?: string;
    chunks?: WasmImageChunks;
}

interface WasiIoVec {
    buf: number;
    buf_len: number;
}

interface WasiImportMap {
    [name: string]: (...args: any[]) => any;
}

interface WasiExports extends WebAssembly.Exports {
    memory: WebAssembly.Memory;
    _start?: () => void;
    _initialize?: () => void;
}

interface WasiRuntimeInstance extends WebAssembly.Instance {
    exports: WasiExports;
}

declare class WASI {
    args: string[];
    env: string[];
    fds: Array<unknown | undefined>;
    inst: WasiRuntimeInstance;
    wasiImport: WasiImportMap;

    constructor(args: string[], env: string[], fds: Array<unknown | undefined>);
    start(instance: WebAssembly.Instance): void;
    initialize(instance: WebAssembly.Instance): void;
}

declare const Ciovec: {
    read_bytes_array(view: DataView, ptr: number, len: number): WasiIoVec[];
};

declare const Iovec: {
    read_bytes_array(view: DataView, ptr: number, len: number): WasiIoVec[];
};

declare const WHENCE_SET: number;
declare const FDFLAGS_NONBLOCK: number;

declare const EVENTTYPE_CLOCK: number;
declare const EVENTTYPE_FD_READ: number;
declare const EVENTTYPE_FD_WRITE: number;

interface WasiPathOpenResult {
    ret: number;
    fd_obj: WasiOpenFile | null;
}

interface WasiSeekResult {
    ret: number;
    offset: bigint | number;
}

interface WasiReadResult {
    ret: number;
    nread: number;
}

interface WasiOpenFile {
    file_pos: bigint;
    fd_seek(offset: bigint | number, whence: number): WasiSeekResult;
    fd_read(view8: Uint8Array, iovs: WasiIoVec[]): WasiReadResult;
    fd_pread?: (view8: Uint8Array, iovs: WasiIoVec[], offset: bigint | number) => WasiReadResult;
}

interface WasiDirectoryLike {
    contents: Record<string, unknown>;
}

interface WasiPreopenDirectory {
    dir: WasiDirectoryLike;
    path_open(
        dirflags: number,
        path: string,
        oflags: number,
        fsRightsBase: bigint | number,
        fsRightsInherited: bigint | number,
        fdflags: number
    ): WasiPathOpenResult;
}

declare const PreopenDirectory: {
    new (name: string, contents: Record<string, unknown>): WasiPreopenDirectory;
};

type WasiFileConstructor = new (data: ArrayBuffer | ArrayBufferView, options?: Record<string, unknown>) => unknown;

declare function importScripts(...urls: string[]): void;
declare function postMessage(message: unknown, transfer?: Transferable[]): void;

interface PtyLineDiscipline {
    writeFromLower(data: string | number[]): void;
}

interface PtyWriteEvent extends Array<Uint8Array | (() => void)> {
    0: Uint8Array;
    1: () => void;
}

interface PtyMaster {
    ldisc?: PtyLineDiscipline;
    onWrite?: (listener: (event: PtyWriteEvent) => void) => { dispose?: () => void } | void;
}

interface PtySlave {
    ioctl(name: "TCGETS"): Termios;
    ioctl(name: "TCSETS", termios: Termios): void;
}

interface TerminalOptions {
    cols?: number;
    rows?: number;
    scrollback?: number;
    convertEol?: boolean;
    [name: string]: unknown;
}

interface TerminalBufferLine {
    translateToString(trimRight?: boolean): string;
}

interface TerminalBuffer {
    readonly length: number;
    getLine(index: number): TerminalBufferLine | undefined;
}

interface TerminalBufferNamespace {
    readonly active: TerminalBuffer;
}

declare class Terminal {
    readonly buffer?: TerminalBufferNamespace;

    constructor(options?: TerminalOptions);
    open(element: HTMLElement): void;
    loadAddon(addon: unknown): void;
    focus?(): void;
    resize?(cols: number, rows: number): void;
    input?(data: string, wasUserInput?: boolean): void;
    paste?(data: string): void;
    clear?(): void;
    dispose?(): void;
}

declare function openpty(): { master: PtyMaster; slave: PtySlave };

declare class Termios {
    iflag: number;
    oflag: number;
    cflag: number;
    lflag: number;
    cc: unknown;

    constructor(iflag: number, oflag: number, cflag: number, lflag: number, cc: unknown);
}

declare const ISTRIP: number;
declare const INLCR: number;
declare const IGNCR: number;
declare const ICRNL: number;
declare const IXON: number;
declare const OPOST: number;
declare const ECHO: number;
declare const ECHONL: number;
declare const ICANON: number;
declare const ISIG: number;
declare const IEXTEN: number;

declare class TtyServer {
    constructor(slave: PtySlave);
    start(worker: Worker, networkStack?: ((event: MessageEvent<unknown>) => void) | null): void;
}

declare class TtyClient {
    constructor(data: unknown);
    onRead(size: number): Uint8Array;
    onWrite(data: number[]): void;
    onWaitForReadable(timeoutSeconds?: number): boolean;
}

type WasiEventVariant = "clock" | "fd_read" | "fd_write";

interface ActiveWasiTerminal {
    xterm: Terminal;
    master: PtyMaster;
    slave: PtySlave;
}

interface CoiOptions {
    shouldRegister: () => boolean;
    shouldDeregister: () => boolean;
    coepCredentialless: () => boolean;
    doReload: () => void;
    quiet: boolean;
}

interface Window {
    activeWasiTerminal?: ActiveWasiTerminal;
    coi?: Partial<CoiOptions>;
    clearWasiTerminal?: () => void;
    readWasiTerminalText?: () => string;
    resetWasiTerminalCapture?: () => void;
    setWasiTerminalHidden?: (hidden: boolean) => void;
    clearWasiBrowserMounts?: () => Promise<WasiBrowserMountInfo>;
    getWasiBrowserMounts?: () => WasiBrowserMountInfo[];
    mountLocalDirectoryForWasi?: (mountPoint: string, options?: WasiBrowserDirectoryMountOptions) => Promise<WasiBrowserMountInfo>;
    mountLocalFileForWasi?: (file: File, mountPoint: string, fileName?: string) => Promise<WasiBrowserMountInfo>;
    restartWasiRuntime?: () => Promise<boolean>;
    wasiDirectFs?: WasiDirectFsClient;
    RustContainerWrapper?: typeof RustContainerWrapper;
    rustContainer?: RustContainerWrapper;
    newStack?: (
        worker: Worker,
        workerImageNamePrefix: string,
        workerImageChunks: WasmImageChunks,
        stackWorker: Worker,
        stackImageName: string
    ) => (event: MessageEvent<unknown>) => void;
    sendWasiInput?: (data: string) => boolean;
    startWasiFromManifest?: (
        elemId: string,
        workerFileName: string,
        workerImageNamePrefix: string,
        manifestFileName: string
    ) => void;
}
