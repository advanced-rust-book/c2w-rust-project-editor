interface RustContainerWrapperOptions {
    sendInput?: (data: string) => boolean;
    readTerminal?: () => string;
    clearTerminal?: () => void;
    resetTerminalCapture?: () => void;
    onStatus?: (message: string) => void;
    onOutput?: (result: RustCommandResult) => void;
    pollIntervalMs?: number;
    defaultTimeoutMs?: number;
    terminalInputChunkSize?: number;
    terminalInputChunkDelayMs?: number;
    directFs?: WasiDirectFsClient | null;
    fileTransferChunkSize?: number;
}

interface RustProgressStep {
    current: number;
    total: number;
    label: string;
}

type RustLogLevel = "debug" | "info" | "warn" | "error";
type RustLogFactValue = string | number | boolean | null;

interface RustLogEvent {
    type: string;
    at: number;
    level: RustLogLevel;
    message: string;
    facts: Record<string, RustLogFactValue>;
}

interface RustCommandOptions {
    timeoutMs?: number;
    status?: string;
    terminalTitle?: string;
    displayCommand?: string;
    step?: RustProgressStep;
    streamOutput?: boolean;
}

interface RustCommandResult {
    command: string;
    exitCode: number;
    stdout: string;
    stderr: string;
    rawOutput: string;
    startedAt: number;
    finishedAt: number;
    displayCommand: string;
    step?: RustProgressStep;
    events: RustLogEvent[];
}

interface RustCompilerDiagnostic {
    level: string;
    message: string;
    rendered?: string;
    code?: string;
    spans?: unknown[];
}

interface RustCompileResult extends RustCommandResult {
    success: boolean;
    diagnostics: RustCompilerDiagnostic[];
}

interface RustCompileOptions extends RustCommandOptions {
    release?: boolean;
    messageFormat?: "human" | "json";
}

interface RustRunOptions extends RustCommandOptions {
    release?: boolean;
    args?: string[];
}

interface RustFetchLibrariesOptions extends RustCommandOptions {
    locked?: boolean;
}

interface RustLibraryCacheOptions extends RustCommandOptions {
    url?: string;
    cacheKey?: string;
    startupTimeoutMs?: number;
    force?: boolean;
}

interface RustSolanaProjectFiles {
    cargoToml?: string;
    libRs?: string;
    mainRs?: string;
}

interface RustContainerFile {
    path: string;
    data: string | ArrayBuffer | ArrayBufferView | Blob;
}

interface RustRawImportEntry {
    rawPath: string;
    data: string | ArrayBuffer | ArrayBufferView | Blob;
    autoStripTopLevel: boolean;
}

interface RustPlannedImportEntry {
    relativePath: string;
    data: string | ArrayBuffer | ArrayBufferView | Blob;
}

interface RustImportFolderOptions extends RustCommandOptions {
    stripPrefix?: string;
    stripTopLevelDirectory?: boolean;
}

interface RustImportFileOptions extends RustCommandOptions {
    destinationIsDirectory?: boolean;
    extractZip?: boolean;
}

type RustImportZipOptions = RustCommandOptions;

interface RustExportOptions extends RustCommandOptions {
    chunkSizeBytes?: number;
}

interface RustExportResult {
    blob: Blob;
    fileName: string;
    command: RustCommandResult;
}

type RustExportTransport = "direct-wasi-preopen" | "terminal-base64-chunks";

type RustDemoStepResult = RustCommandResult | RustCompileResult;

interface RustSolanaDemoResult {
    projectDir: string;
    create: RustCommandResult[];
    fetch: RustCommandResult;
    compile: RustCompileResult;
    run?: RustCommandResult;
}

interface RustCreateProjectOptions {
    totalSteps?: number;
    stepOffset?: number;
    onStep?: (result: RustCommandResult) => void;
}

interface RustSolanaDemoOptions {
    totalSteps?: number;
    onStep?: (result: RustDemoStepResult) => void;
}

class RustContainerWrapper {
    static readonly defaultProjectDir = "/root/solana-binary-codec-demo";
    private static readonly directIoMountPoint = "/tmp/rust-wrapper-direct-io";
    private static readonly directImportRoot = "/tmp/rust-wrapper-direct-io/imports";
    private static readonly directExportRoot = "/tmp/rust-wrapper-direct-io/exports";
    private static readonly directReadRoot = "/tmp/rust-wrapper-direct-io/reads";

    private readonly sendInputFn: (data: string) => boolean;
    private readonly readTerminalFn: () => string;
    private readonly clearTerminalFn?: () => void;
    private readonly resetTerminalCaptureFn?: () => void;
    private readonly directFsFn?: () => WasiDirectFsClient | undefined;
    private readonly onStatusFn?: (message: string) => void;
    private readonly onOutputFn?: (result: RustCommandResult) => void;
    private readonly pollIntervalMs: number;
    private readonly defaultTimeoutMs: number;
    private readonly terminalInputChunkSize: number;
    private readonly terminalInputChunkDelayMs: number;
    private readonly fileTransferChunkSize: number;
    private commandSequence = 0;
    private fileSequence = 0;
    private commandQueue: Promise<void> = Promise.resolve();
    private libraryCachePromise?: Promise<RustCommandResult>;

    constructor(options: RustContainerWrapperOptions = {}) {
        this.sendInputFn = options.sendInput || ((data: string) => {
            return typeof window.sendWasiInput === "function" ? window.sendWasiInput(data) : false;
        });
        this.readTerminalFn = options.readTerminal || (() => {
            return typeof window.readWasiTerminalText === "function" ? window.readWasiTerminalText() : "";
        });
        this.clearTerminalFn = options.clearTerminal || (() => {
            if (typeof window !== "undefined" && typeof window.clearWasiTerminal === "function") {
                window.clearWasiTerminal();
            }
        });
        this.resetTerminalCaptureFn = options.resetTerminalCapture || (() => {
            if (typeof window !== "undefined" && typeof window.resetWasiTerminalCapture === "function") {
                window.resetWasiTerminalCapture();
            }
        });
        this.directFsFn = options.directFs === null
            ? undefined
            : () => options.directFs || (typeof window !== "undefined" ? window.wasiDirectFs : undefined);
        this.onStatusFn = options.onStatus;
        this.onOutputFn = options.onOutput;
        this.pollIntervalMs = options.pollIntervalMs ?? 250;
        this.defaultTimeoutMs = options.defaultTimeoutMs ?? 900000;
        this.terminalInputChunkSize = Math.max(64, options.terminalInputChunkSize ?? 512);
        this.terminalInputChunkDelayMs = Math.max(0, options.terminalInputChunkDelayMs ?? 15);
        this.fileTransferChunkSize = Math.max(64, options.fileTransferChunkSize ?? 256);
    }

    ensureLibraryCache(options: RustLibraryCacheOptions = {}): Promise<RustCommandResult> {
        if (!this.libraryCachePromise || options.force) {
            this.libraryCachePromise = this.hydrateLibraryCache(options)
                .then((result) => {
                    if (result.exitCode !== 0) {
                        this.libraryCachePromise = undefined;
                    }
                    return result;
                })
                .catch((error: unknown) => {
                    this.libraryCachePromise = undefined;
                    throw error;
                });
        }
        return this.libraryCachePromise;
    }

    exec(command: string, options: RustCommandOptions = {}): Promise<RustCommandResult> {
        return this.enqueueCommand(() => this.execNow(command, options));
    }

    async writeTextFile(path: string, content: string, options: RustCommandOptions = {}): Promise<RustCommandResult> {
        return this.writeFile(path, content, options);
    }

    async writeFile(
        path: string,
        content: string | ArrayBuffer | ArrayBufferView | Blob,
        options: RustCommandOptions = {}
    ): Promise<RustCommandResult> {
        const remotePath = RustContainerWrapper.normalizeRemotePath(path);
        const dir = RustContainerWrapper.dirname(remotePath);

        return this.enqueueCommand(async () => {
            const bytes = await RustContainerWrapper.dataToBytes(content);
            const directFs = this.directFs();
            if (directFs) {
                return this.writeFileBytesDirectNow(remotePath, dir, bytes, options);
            }
            return this.writeFileBytesNow(remotePath, dir, bytes, options);
        });
    }

    async readFile(path: string, options: RustCommandOptions = {}): Promise<Uint8Array> {
        const remotePath = RustContainerWrapper.normalizeRemotePath(path);
        if (this.directFs()) {
            return this.readFileDirect(remotePath, options);
        }
        const result = await this.exec("base64 -w0 " + RustContainerWrapper.shellQuote(remotePath), {
            status: options.status || "Reading " + remotePath,
            timeoutMs: options.timeoutMs,
            displayCommand: options.displayCommand || "read " + remotePath,
            streamOutput: false,
        });
        if (result.exitCode !== 0) {
            throw new Error("failed to read " + remotePath + ":\n" + result.stderr);
        }
        return RustContainerWrapper.base64ToBytes(result.stdout);
    }

    async readTextFile(path: string, options: RustCommandOptions = {}): Promise<string> {
        return new TextDecoder().decode(await this.readFile(path, options));
    }

    async readCargoFile(projectDir: string, options: RustCommandOptions = {}): Promise<string> {
        const dir = RustContainerWrapper.normalizeRemotePath(projectDir);
        return this.readTextFile(
            RustContainerWrapper.joinRemotePath(dir, "Cargo.toml"),
            {
                ...options,
                status: options.status || "Reading Cargo.toml",
                displayCommand: options.displayCommand || "read Cargo.toml",
            }
        );
    }

    async readRustFile(projectDir: string, relativePath: string, options: RustCommandOptions = {}): Promise<string> {
        const dir = RustContainerWrapper.normalizeRemotePath(projectDir);
        const cleanRelativePath = RustContainerWrapper.sanitizeRelativePath(relativePath);
        return this.readTextFile(
            RustContainerWrapper.joinRemotePath(dir, cleanRelativePath),
            {
                ...options,
                status: options.status || "Reading " + cleanRelativePath,
                displayCommand: options.displayCommand || "read " + cleanRelativePath,
            }
        );
    }

    editCargoFile(projectDir: string, content: string, options: RustCommandOptions = {}): Promise<RustCommandResult> {
        return this.writeTextFile(
            RustContainerWrapper.joinRemotePath(projectDir, "Cargo.toml"),
            content,
            { ...options, status: options.status || "Writing Cargo.toml", displayCommand: options.displayCommand || "write Cargo.toml" }
        );
    }

    editRustFile(projectDir: string, relativePath: string, content: string, options: RustCommandOptions = {}): Promise<RustCommandResult> {
        return this.writeTextFile(
            RustContainerWrapper.joinRemotePath(projectDir, relativePath),
            content,
            { ...options, status: options.status || "Writing " + relativePath, displayCommand: options.displayCommand || "write " + relativePath }
        );
    }

    async importFile(
        file: File | RustContainerFile,
        destination: string,
        options: RustImportFileOptions = {}
    ): Promise<RustCommandResult[]> {
        const dest = RustContainerWrapper.normalizeRemotePath(destination);
        const sourceName = RustContainerWrapper.sourceFileName(file);
        if (options.extractZip) {
            return this.importZipFile(file, dest, options);
        }

        const relativeName = RustContainerWrapper.sanitizeRelativePath(sourceName);
        const targetPath = options.destinationIsDirectory === false
            ? dest
            : RustContainerWrapper.joinRemotePath(dest, relativeName);
        const data = RustContainerWrapper.isRustContainerFile(file) ? file.data : file;
        const bytes = await RustContainerWrapper.dataToBytes(data);
        const results: RustCommandResult[] = [];
        const usedDirectFs = Boolean(this.directFs());

        const write = await this.writeFile(targetPath, bytes, {
            status: options.status || "Uploading " + sourceName,
            terminalTitle: options.terminalTitle,
            timeoutMs: options.timeoutMs,
            displayCommand: options.displayCommand || "upload " + sourceName + " to " + targetPath,
            step: options.step,
        });
        RustContainerWrapper.assertCommandSucceeded(write, "upload " + sourceName + " to " + targetPath);
        results.push(write);

        const summaryOutput = [
            "Uploaded " + sourceName + " to " + targetPath + ".",
            "File size: " + RustContainerWrapper.formatByteCount(bytes.length) + ".",
            usedDirectFs
                ? "Transfer: direct WASI preopen staging; no terminal base64 payload."
                : "Transfer: terminal base64 fallback.",
        ].join("\n");

        results.push({
            ...write,
            command: "upload file " + sourceName + " to " + targetPath,
            displayCommand: "upload " + sourceName,
            stdout: summaryOutput,
            stderr: "",
            rawOutput: summaryOutput,
            startedAt: write.startedAt,
            events: [
                ...write.events,
                RustContainerWrapper.makeEvent("file.import.completed", "info", "Uploaded file into container", {
                    "source.name": sourceName,
                    "target.path": targetPath,
                    "file.bytes": bytes.length,
                    "transport": usedDirectFs ? "direct-wasi-preopen" : "terminal-base64",
                }),
            ],
        });
        return results;
    }

    async importZipFile(
        file: File | RustContainerFile,
        destination: string,
        options: RustImportZipOptions = {}
    ): Promise<RustCommandResult[]> {
        const dest = RustContainerWrapper.normalizeRemotePath(destination);
        const sourceName = RustContainerWrapper.sourceFileName(file);
        const data = RustContainerWrapper.isRustContainerFile(file) ? file.data : file;
        const bytes = await RustContainerWrapper.dataToBytes(data);
        const directFs = this.requireDirectFs("import zip archives");
        const importId = this.nextFileId();
        const stageDir = RustContainerWrapper.joinRemotePath(RustContainerWrapper.directImportRoot, "zip-" + importId);
        const tmpZipPath = RustContainerWrapper.joinRemotePath(stageDir, RustContainerWrapper.sanitizeRelativePath(sourceName));
        const results: RustCommandResult[] = [];

        try {
            await directFs.ensureDirectoryMount(RustContainerWrapper.directIoMountPoint, {
                label: "Rust wrapper direct I/O staging",
            });
            await directFs.clearDirectory(stageDir);
            const uploadStartedAt = Date.now();
            await directFs.writeFile(tmpZipPath, bytes);
            const upload = RustContainerWrapper.syntheticResult({
                command: "stage zip archive " + sourceName + " at " + tmpZipPath,
                displayCommand: options.displayCommand || "stage zip archive " + sourceName,
                stdout: "Staged " + sourceName + " at " + tmpZipPath + " via direct WASI filesystem mount.",
                startedAt: uploadStartedAt,
                step: options.step,
                events: [
                    RustContainerWrapper.makeEvent("file.stage.completed", "info", "Staged zip archive through direct WASI filesystem", {
                        "source.name": sourceName,
                        "stage.path": tmpZipPath,
                        "file.bytes": bytes.length,
                    }),
                ],
            });
            RustContainerWrapper.assertCommandSucceeded(upload, "upload zip archive " + sourceName);
            results.push(upload);

            const extract = await this.exec(RustContainerWrapper.importZipCommand(tmpZipPath, dest), {
                status: "Extracting zip archive into " + dest,
                timeoutMs: options.timeoutMs,
                displayCommand: "extract " + sourceName + " into " + dest,
            });
            RustContainerWrapper.assertCommandSucceeded(extract, "extract zip archive into " + dest);
            results.push(extract);

            const verify = await this.exec(RustContainerWrapper.importVerificationCommand(dest), {
                status: "Verifying extracted files in " + dest,
                timeoutMs: options.timeoutMs,
                displayCommand: "verify zip import in " + dest,
            });
            RustContainerWrapper.assertCommandSucceeded(verify, "verify zip import in " + dest);
            const visiblePaths = verify.stdout.trim();
            if (!visiblePaths) {
                throw new Error("zip import finished, but no files are visible in " + dest);
            }
            results.push(verify);

            const summaryOutput = [
                "Extracted " + sourceName + " into " + dest + ".",
                "Archive size: " + RustContainerWrapper.formatByteCount(bytes.length) + ".",
                "Visible paths (first 200):",
                visiblePaths,
            ].join("\n");
            results.push({
                ...verify,
                command: "extract zip archive " + sourceName + " into " + dest,
                displayCommand: "extract " + sourceName,
                stdout: summaryOutput,
                stderr: "",
                rawOutput: summaryOutput,
                startedAt: results[0]?.startedAt ?? verify.startedAt,
                events: [
                    ...verify.events,
                    RustContainerWrapper.makeEvent("zip.import.completed", "info", "Extracted zip archive into container", {
                        "source.name": sourceName,
                        "destination.path": dest,
                        "archive.bytes": bytes.length,
                        "transport": "direct-wasi-preopen",
                        "visible.path.count": visiblePaths.split(/\r?\n/).filter((line) => line.trim().length > 0).length,
                    }),
                ],
            });
            return results;
        } catch (error) {
            throw error;
        } finally {
            await directFs.clearDirectory(stageDir).catch(() => undefined);
        }
    }

    async importFolder(
        files: FileList | Array<File | RustContainerFile>,
        destination: string,
        options: RustImportFolderOptions = {}
    ): Promise<RustCommandResult[]> {
        const dest = RustContainerWrapper.normalizeRemotePath(destination);
        const directFs = this.requireDirectFs("import folders");
        const importId = this.nextFileId();
        const stageDir = RustContainerWrapper.joinRemotePath(RustContainerWrapper.directImportRoot, "folder-" + importId);
        const entries = Array.from(files as ArrayLike<File | RustContainerFile>);
        if (entries.length === 0) {
            throw new Error("choose at least one file to import");
        }

        const plannedEntries = RustContainerWrapper.planImportEntries(entries, options);
        const results: RustCommandResult[] = [];
        console.info("[rust-wrapper]", {
            type: "folder.import.plan",
            destination: dest,
            stageDir,
            fileCount: plannedEntries.length,
            sample: plannedEntries.slice(0, 20).map((entry) => entry.relativePath),
        });
        let stagedBytes = 0;

        try {
            await directFs.ensureDirectoryMount(RustContainerWrapper.directIoMountPoint, {
                label: "Rust wrapper direct I/O staging",
            });
            await directFs.clearDirectory(stageDir);
            for (const entry of plannedEntries) {
                const bytes = await RustContainerWrapper.dataToBytes(entry.data);
                stagedBytes += bytes.byteLength;
                await directFs.writeFile(RustContainerWrapper.joinRemotePath(stageDir, entry.relativePath), bytes);
            }
            console.info("[rust-wrapper]", {
                type: "folder.import.staged",
                destination: dest,
                stageDir,
                fileCount: plannedEntries.length,
                stagedBytes,
            });

            const copy = await this.exec(RustContainerWrapper.importStagedFolderCommand(stageDir, dest), {
                status: options.status || "Importing staged folder files into " + dest,
                timeoutMs: options.timeoutMs,
                displayCommand: options.displayCommand || "copy staged folder into " + dest,
                step: options.step,
            });
            RustContainerWrapper.assertCommandSucceeded(copy, "copy staged folder into " + dest);
            results.push(copy);

            const visiblePaths = copy.stdout.trim();
            if (!visiblePaths) {
                throw new Error("import finished, but no files are visible in " + dest);
            }
            console.info("[rust-wrapper]", {
                type: "folder.import.copy_completed",
                destination: dest,
                stageDir,
                fileCount: plannedEntries.length,
                visiblePreview: visiblePaths.split(/\r?\n/).slice(0, 40),
            });

            const summaryOutput = [
                "Imported " + plannedEntries.length + " file(s) into " + dest + ".",
                "Staged bytes: " + RustContainerWrapper.formatByteCount(stagedBytes) + ".",
                "Transfer: direct WASI preopen staging; no tar/base64 terminal payload.",
                "Visible paths (first 200):",
                visiblePaths,
            ].join("\n");
            results.push({
                ...copy,
                command: "import " + plannedEntries.length + " file(s) into " + dest,
                displayCommand: "import folder into " + dest,
                stdout: summaryOutput,
                stderr: "",
                rawOutput: summaryOutput,
                startedAt: copy.startedAt,
                events: [
                    ...copy.events,
                    RustContainerWrapper.makeEvent("folder.import.completed", "info", "Imported folder into container", {
                        "destination.path": dest,
                        "file.count": plannedEntries.length,
                        "staged.bytes": stagedBytes,
                        "transport": "direct-wasi-preopen",
                        "visible.path.count": visiblePaths.split(/\r?\n/).filter((line) => line.trim().length > 0).length,
                    }),
                ],
            });
            return results;
        } catch (error) {
            throw error;
        } finally {
            await directFs.clearDirectory(stageDir).catch(() => undefined);
        }
    }

    async exportFolder(path: string, options: RustExportOptions = {}): Promise<RustExportResult> {
        const remotePath = RustContainerWrapper.normalizeRemotePath(path);
        const parent = RustContainerWrapper.dirname(remotePath);
        const base = RustContainerWrapper.basename(remotePath);
        if (!base) {
            throw new Error("cannot export root path");
        }

        const exportId = this.nextFileId();
        const tmpWorkDir = "/tmp/rust-wrapper-export-" + exportId;
        const tmpZipPath = RustContainerWrapper.joinRemotePath(tmpWorkDir, RustContainerWrapper.sanitizeRelativePath(base + ".zip"));
        const directFs = this.directFs();
        const directStageDir = directFs
            ? RustContainerWrapper.joinRemotePath(RustContainerWrapper.directExportRoot, "export-" + exportId)
            : undefined;
        const directStagePath = directStageDir
            ? RustContainerWrapper.joinRemotePath(directStageDir, RustContainerWrapper.sanitizeRelativePath(base + ".zip"))
            : undefined;
        const outputZipPath = directStagePath || tmpZipPath;
        const qTmpWorkDir = RustContainerWrapper.shellQuote(tmpWorkDir);
        const qOutputZipPath = RustContainerWrapper.shellQuote(outputZipPath);
        const qRemotePath = RustContainerWrapper.shellQuote(remotePath);
        const qParent = RustContainerWrapper.shellQuote(parent);
        const qBase = RustContainerWrapper.shellQuote(base);
        const qDirectStageDir = directStageDir ? RustContainerWrapper.shellQuote(directStageDir) : "";
        const outputDescription = directStagePath ? "direct WASI output archive" : "temporary archive";
        const prepareOutputLines = directStageDir ? [
            "if [ \"$__rust_wrapper_zip_status\" -eq 0 ]; then",
            "    rm -f " + qOutputZipPath + " && mkdir -p " + qDirectStageDir,
            "    __rust_wrapper_zip_status=$?",
            "fi",
        ] : [
            "if [ \"$__rust_wrapper_zip_status\" -eq 0 ]; then",
            "    rm -rf " + qTmpWorkDir,
            "    mkdir -p " + qTmpWorkDir,
            "    __rust_wrapper_zip_status=$?",
            "fi",
        ];
        const failureCleanupLines = directStagePath
            ? ["    rm -f " + qOutputZipPath]
            : ["    rm -rf " + qTmpWorkDir];
        const displayCommand = options.displayCommand || "export " + remotePath + " as zip";

        const createZipCommand = [
            "__rust_wrapper_zip_status=0",
            "if ! command -v zip >/dev/null 2>&1; then",
            "    printf 'zip is not installed in the container; rebuild the image after this update.\\n'",
            "    __rust_wrapper_zip_status=127",
            "elif ! command -v wc >/dev/null 2>&1; then",
            "    printf 'wc is not installed in the container; rebuild the image after this update.\\n'",
            "    __rust_wrapper_zip_status=127",
            "elif [ ! -e " + qRemotePath + " ]; then",
            "    printf 'path not found: %s\\n' " + qRemotePath,
            "    __rust_wrapper_zip_status=1",
            "fi",
            ...prepareOutputLines,
            "if [ \"$__rust_wrapper_zip_status\" -eq 0 ]; then",
            "    printf 'export: zipping %s into " + outputDescription + " %s\\n' " + RustContainerWrapper.shellQuote(remotePath) + " " + qOutputZipPath,
            "    ( cd " + qParent + " && zip -r " + qOutputZipPath + " -- " + qBase + " )",
            "    __rust_wrapper_zip_status=$?",
            "fi",
            "if [ \"$__rust_wrapper_zip_status\" -eq 0 ]; then",
            "    sync 2>/dev/null || true",
            "    __rust_wrapper_zip_size=$(wc -c < " + qOutputZipPath + " | tr -d '[:space:]')",
            "    printf 'export: archive size: %s bytes\\n' \"$__rust_wrapper_zip_size\"",
            "    printf 'created zip archive for %s (%s bytes) at %s\\n' " + RustContainerWrapper.shellQuote(remotePath) + " \"$__rust_wrapper_zip_size\" " + qOutputZipPath,
            "fi",
            "if [ \"$__rust_wrapper_zip_status\" -ne 0 ]; then",
            "    printf 'export failed with status %s\\n' \"$__rust_wrapper_zip_status\"",
            ...failureCleanupLines,
            "fi",
            "exit \"$__rust_wrapper_zip_status\"",
        ].join("\n");

        try {
            if (directFs && directStageDir) {
                await directFs.ensureDirectoryMount(RustContainerWrapper.directIoMountPoint, {
                    label: "Rust wrapper direct I/O staging",
                });
                await directFs.clearDirectory(directStageDir);
            }
            const createResult = await this.exec(createZipCommand, {
                status: options.status || "Creating zip archive for " + remotePath,
                timeoutMs: options.timeoutMs,
                displayCommand,
            });
            RustContainerWrapper.assertCommandSucceeded(createResult, "create zip archive for " + remotePath);

            const expectedArchiveSize = RustContainerWrapper.parseExportArchiveSize(createResult.stdout);
            let archiveBytes: Uint8Array;
            let transport: RustExportTransport = directFs && directStagePath ? "direct-wasi-preopen" : "terminal-base64-chunks";
            if (directFs && directStagePath) {
                try {
                    this.emitStatus("Reading zip archive from the direct WASI output mount into JavaScript...");
                    archiveBytes = await directFs.readFile(directStagePath);
                    if (archiveBytes.byteLength === 0) {
                        throw new Error("direct WASI staging returned an empty archive");
                    }
                    if (expectedArchiveSize !== undefined && archiveBytes.byteLength !== expectedArchiveSize) {
                        throw new Error(
                            "direct WASI staging read size mismatch: expected "
                                + expectedArchiveSize
                                + " bytes, got "
                                + archiveBytes.byteLength
                                + " bytes"
                        );
                    }
                } catch (error) {
                    console.warn("[rust-wrapper]", {
                        type: "folder.export.direct_read_failed",
                        path: directStagePath,
                        message: error instanceof Error ? error.message : String(error),
                        error,
                    });
                    this.emitStatus("Direct WASI output read failed; falling back to bounded terminal base64 chunks from the mounted output path...");
                    const archive = await this.readFileBytesChunked(outputZipPath, {
                        status: "Reading zip archive for " + remotePath,
                        timeoutMs: options.timeoutMs,
                        displayCommand: "read export archive in chunks",
                        streamOutput: false,
                        chunkSizeBytes: options.chunkSizeBytes,
                    });
                    archiveBytes = archive.bytes;
                    transport = "terminal-base64-chunks";
                }
            } else {
                this.emitStatus("Reading zip archive from /tmp into JavaScript in bounded chunks...");
                const archive = await this.readFileBytesChunked(outputZipPath, {
                    status: "Reading zip archive for " + remotePath,
                    timeoutMs: options.timeoutMs,
                    displayCommand: "read export archive in chunks",
                    streamOutput: false,
                    chunkSizeBytes: options.chunkSizeBytes,
                });
                archiveBytes = archive.bytes;
            }
            const command = RustContainerWrapper.exportSummaryResult(
                remotePath,
                displayCommand,
                createResult,
                archiveBytes.byteLength,
                transport
            );

            const archiveBlobPart: BlobPart = archiveBytes.buffer instanceof ArrayBuffer
                ? archiveBytes as BlobPart
                : new Uint8Array(archiveBytes);
            return {
                blob: new Blob([archiveBlobPart], { type: "application/zip" }),
                fileName: base + ".zip",
                command,
            };
        } finally {
            await this.exec("rm -rf " + qTmpWorkDir, {
                status: "Cleaning up export archive",
                timeoutMs: 60000,
                displayCommand: "cleanup export archive",
                streamOutput: false,
            }).catch(() => undefined);
            if (directFs && directStageDir) {
                await directFs.clearDirectory(directStageDir).catch(() => undefined);
            }
        }
    }

    private async readFileBytesChunked(
        remotePath: string,
        options: RustCommandOptions & { chunkSizeBytes?: number } = {}
    ): Promise<{ bytes: Uint8Array; size: number; chunkCount: number; results: RustCommandResult[] }> {
        const chunkSize = Math.max(64 * 1024, Math.floor(options.chunkSizeBytes ?? 256 * 1024));
        const qRemotePath = RustContainerWrapper.shellQuote(remotePath);
        const chunks: Uint8Array[] = [];
        const results: RustCommandResult[] = [];
        let chunkIndex = 0;

        while (true) {
            const chunkNumber = chunkIndex + 1;
            const tmpChunkPath = "/tmp/.rust-wrapper-read-" + this.nextFileId() + ".part";
            const qTmpChunkPath = RustContainerWrapper.shellQuote(tmpChunkPath);
            const chunkResult = await this.exec([
                "rm -f " + qTmpChunkPath,
                "if ! command -v dd >/dev/null 2>&1; then",
                "    printf 'dd is not installed in the container; rebuild the image after this update.\\n'",
                "    exit 127",
                "fi",
                "if ! command -v base64 >/dev/null 2>&1; then",
                "    printf 'base64 is not installed in the container; rebuild the image after this update.\\n'",
                "    exit 127",
                "fi",
                "if [ ! -f " + qRemotePath + " ]; then",
                "    printf 'file not found: %s\\n' " + qRemotePath,
                "    exit 1",
                "fi",
                "dd if=" + qRemotePath + " of=" + qTmpChunkPath + " bs=" + String(chunkSize) + " skip=" + String(chunkIndex) + " count=1 2>/dev/null",
                "__rust_wrapper_dd_status=$?",
                "if [ \"$__rust_wrapper_dd_status\" -eq 0 ]; then",
                "    base64 -w0 " + qTmpChunkPath,
                "    __rust_wrapper_dd_status=$?",
                "fi",
                "rm -f " + qTmpChunkPath,
                "exit \"$__rust_wrapper_dd_status\"",
            ].join("\n"), {
                status: (options.status || "Reading file") + " (chunk " + chunkNumber + ")",
                timeoutMs: options.timeoutMs,
                displayCommand: "read archive chunk " + chunkNumber,
                streamOutput: options.streamOutput ?? false,
            });
            RustContainerWrapper.assertCommandSucceeded(chunkResult, "read chunk " + chunkNumber + " of " + remotePath);
            results.push(chunkResult);

            const decoded = RustContainerWrapper.base64ToBytes(chunkResult.stdout);
            if (decoded.length === 0) {
                break;
            }
            chunks.push(decoded);
            if (decoded.length < chunkSize) {
                break;
            }
            chunkIndex += 1;
        }

        const bytes = RustContainerWrapper.concatBytes(chunks);
        return {
            bytes,
            size: bytes.length,
            chunkCount: chunks.length,
            results,
        };
    }

    async fetchLibraries(projectDir: string, options: RustFetchLibrariesOptions = {}): Promise<RustCommandResult> {
        await this.ensureLibraryCacheSucceeded();
        const dir = RustContainerWrapper.normalizeRemotePath(projectDir);
        const locked = options.locked ? " --locked" : "";
        const cargoEnv = RustContainerWrapper.cargoNetworkEnvPrefix();
        const command = [
            "cd " + RustContainerWrapper.shellQuote(dir),
            "printf 'cargo fetch: project %s\\n' " + RustContainerWrapper.shellQuote(dir),
            "printf 'cargo fetch: inspecting Cargo.toml dependencies\\n'",
            "if [ -f Cargo.toml ]; then",
            "    awk 'BEGIN{in_deps=0; seen=0} /^\\[dependencies\\]/{in_deps=1; next} /^\\[/{in_deps=0} in_deps && $0 !~ /^[[:space:]]*($|#)/ { seen=1; print \"  dependency: \" $0 } END{ if (!seen) print \"  (no direct dependencies declared)\" }' Cargo.toml",
            "else",
            "    printf '  Cargo.toml not found\\n'",
            "fi",
            "printf 'cargo fetch: resolving and downloading crates with cargo fetch -vv" + locked + "\\n'",
            cargoEnv + " CARGO_TERM_COLOR=never CARGO_TERM_PROGRESS_WHEN=always cargo fetch -vv" + locked,
            "__rust_wrapper_fetch_status=$?",
            "if [ \"$__rust_wrapper_fetch_status\" -eq 0 ]; then",
            "    printf 'cargo fetch: complete\\n'",
            "else",
            "    printf 'cargo fetch: failed with exit code %s\\n' \"$__rust_wrapper_fetch_status\"",
            "fi",
            "exit \"$__rust_wrapper_fetch_status\"",
        ].join("\n");
        return this.exec(
            command,
            {
                status: "Fetching Cargo libraries for " + dir,
                timeoutMs: options.timeoutMs ?? 900000,
                displayCommand: options.displayCommand || "cargo fetch" + locked,
            }
        );
    }

    async compile(projectDir: string, options: RustCompileOptions = {}): Promise<RustCompileResult> {
        await this.ensureLibraryCacheSucceeded();
        const dir = RustContainerWrapper.normalizeRemotePath(projectDir);
        const release = options.release ? " --release" : "";
        const messageFormat = options.messageFormat === "json" ? " --message-format=json" : "";
        const cargoEnv = RustContainerWrapper.cargoNetworkEnvPrefix();
        const result = await this.exec(
            "cd " + RustContainerWrapper.shellQuote(dir) + " && " + cargoEnv + " CARGO_TERM_COLOR=never cargo build" + release + messageFormat,
            {
                status: "Compiling Rust project in " + dir,
                timeoutMs: options.timeoutMs ?? 900000,
                displayCommand: options.displayCommand || "cargo build" + release + messageFormat,
            }
        );

        const diagnostics = RustContainerWrapper.parseCargoDiagnostics(result.stdout);
        if (result.exitCode !== 0 && diagnostics.length === 0) {
            diagnostics.push({
                level: "error",
                message: result.stderr || result.stdout || "cargo build failed",
            });
        }

        const diagnosticEvents = diagnostics.slice(0, 20).map((diagnostic, index) => {
            const level: RustLogLevel = diagnostic.level === "error"
                ? "error"
                : diagnostic.level === "warning"
                    ? "warn"
                    : "info";
            return RustContainerWrapper.makeEvent("compiler.diagnostic", level, diagnostic.message, {
                "diagnostic.index": index + 1,
                "diagnostic.level": diagnostic.level,
                "diagnostic.code": diagnostic.code,
            });
        });

        return {
            ...result,
            success: result.exitCode === 0,
            diagnostics,
            events: result.events.concat(diagnosticEvents),
        };
    }

    async run(projectDir: string, options: RustRunOptions = {}): Promise<RustCommandResult> {
        await this.ensureLibraryCacheSucceeded();
        const dir = RustContainerWrapper.normalizeRemotePath(projectDir);
        const release = options.release ? " --release" : "";
        const args = options.args && options.args.length > 0
            ? " -- " + options.args.map((arg) => RustContainerWrapper.shellQuote(arg)).join(" ")
            : "";
        const cargoEnv = RustContainerWrapper.cargoNetworkEnvPrefix();

        return this.exec(
            "cd " + RustContainerWrapper.shellQuote(dir) + " && " + cargoEnv + " CARGO_TERM_COLOR=never cargo run --quiet" + release + args,
            {
                status: "Running Rust project in " + dir,
                timeoutMs: options.timeoutMs ?? 900000,
                displayCommand: options.displayCommand || "cargo run --quiet" + release + args,
            }
        );
    }

    private async ensureLibraryCacheSucceeded(): Promise<void> {
        const result = await this.ensureLibraryCache();
        if (result.exitCode !== 0) {
            throw new Error("failed to hydrate Rust library cache:\n" + (result.stderr || result.stdout || result.rawOutput));
        }
    }

    private hydrateLibraryCache(options: RustLibraryCacheOptions): Promise<RustCommandResult> {
        const url = options.url || RustContainerWrapper.defaultLibraryCacheUrl();
        const cacheKey = options.cacheKey || RustContainerWrapper.defaultLibraryCacheKey(url);
        const command = RustContainerWrapper.libraryCacheHydrateCommand(url, cacheKey);
        return this.execWithStartupRetry(command, {
            ...options,
            status: options.status || "Hydrating Rust library cache",
            terminalTitle: options.terminalTitle || "Hydrate Rust library cache",
            displayCommand: options.displayCommand || "hydrate Rust library cache",
            timeoutMs: options.timeoutMs ?? 900000,
            streamOutput: options.streamOutput ?? true,
        }, options.startupTimeoutMs ?? 900000);
    }

    async createSolanaBinaryCodecProject(
        projectDir = RustContainerWrapper.defaultProjectDir,
        files: RustSolanaProjectFiles = {},
        options: RustCreateProjectOptions = {}
    ): Promise<RustCommandResult[]> {
        const dir = RustContainerWrapper.normalizeRemotePath(projectDir);
        RustContainerWrapper.assertSafeProjectPathForReset(dir);

        const totalSteps = options.totalSteps ?? 4;
        const stepOffset = options.stepOffset ?? 0;
        const step = (relativeStep: number, label: string): RustProgressStep => ({
            current: stepOffset + relativeStep,
            total: totalSteps,
            label,
        });
        const record = (result: RustCommandResult): void => {
            results.push(result);
            if (options.onStep) {
                options.onStep(result);
            }
        };

        const results: RustCommandResult[] = [];
        record(await this.exec(
            "rm -rf " + RustContainerWrapper.shellQuote(dir) + " && mkdir -p " + RustContainerWrapper.shellQuote(RustContainerWrapper.joinRemotePath(dir, "src")),
            {
                status: "Creating library project " + dir,
                displayCommand: "reset " + dir + " and create src/",
                step: step(1, "Reset project directory"),
            }
        ));
        record(await this.editCargoFile(dir, files.cargoToml ?? RustContainerWrapper.defaultSolanaCargoToml(), {
            step: step(2, "Write Cargo.toml"),
        }));
        record(await this.editRustFile(dir, "src/lib.rs", files.libRs ?? RustContainerWrapper.defaultSolanaLibRs(), {
            step: step(3, "Write src/lib.rs library code"),
        }));
        record(await this.editRustFile(dir, "src/main.rs", files.mainRs ?? RustContainerWrapper.defaultSolanaMainRs(), {
            step: step(4, "Write src/main.rs demo runner"),
        }));
        return results;
    }

    async runSolanaBinaryCodecDemo(
        projectDir = RustContainerWrapper.defaultProjectDir,
        files: RustSolanaProjectFiles = {},
        options: RustSolanaDemoOptions = {}
    ): Promise<RustSolanaDemoResult> {
        const totalSteps = options.totalSteps ?? 7;
        const create = await this.createSolanaBinaryCodecProject(projectDir, files, {
            totalSteps,
            stepOffset: 0,
            onStep: options.onStep,
        });
        const fetch = await this.fetchLibraries(projectDir, {
            step: { current: 5, total: totalSteps, label: "Fetch Cargo libraries" },
        });
        if (options.onStep) {
            options.onStep(fetch);
        }

        const compile = await this.compile(projectDir, {
            step: { current: 6, total: totalSteps, label: "Compile Rust project" },
        });
        if (options.onStep) {
            options.onStep(compile);
        }

        const result: RustSolanaDemoResult = {
            projectDir,
            create,
            fetch,
            compile,
        };

        if (compile.success) {
            const run = await this.run(projectDir, {
                step: { current: 7, total: totalSteps, label: "Run compiled demo" },
            });
            result.run = run;
            if (options.onStep) {
                options.onStep(run);
            }
        }

        return result;
    }

    static defaultSolanaCargoToml(): string {
        return [
            "[package]",
            "name = \"solana-binary-codec-demo\"",
            "version = \"0.1.0\"",
            "edition = \"2021\"",
            "",
            "[lib]",
            "name = \"solana_binary_codec_demo\"",
            "path = \"src/lib.rs\"",
            "",
            "[dependencies]",
            "",
        ].join("\n");
    }

    static defaultSolanaLibRs(): string {
        return String.raw`use std::fmt;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AccountMeta {
    pub key: [u8; 32],
    pub is_signer: bool,
    pub is_writable: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TransferInstruction {
    pub program_id: [u8; 32],
    pub accounts: Vec<AccountMeta>,
    pub lamports: u64,
    pub memo: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CodecError {
    BadMagic,
    UnexpectedEof,
    TooManyAccounts(usize),
    MemoTooLarge(usize),
    InvalidUtf8,
    TrailingBytes(usize),
}

impl fmt::Display for CodecError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            CodecError::BadMagic => write!(f, "bad instruction magic"),
            CodecError::UnexpectedEof => write!(f, "unexpected end of binary payload"),
            CodecError::TooManyAccounts(count) => write!(f, "too many accounts: {}", count),
            CodecError::MemoTooLarge(size) => write!(f, "memo is too large: {}", size),
            CodecError::InvalidUtf8 => write!(f, "memo was not valid utf-8"),
            CodecError::TrailingBytes(size) => write!(f, "payload had {} trailing byte(s)", size),
        }
    }
}

impl std::error::Error for CodecError {}

pub fn encode(instruction: &TransferInstruction) -> Result<Vec<u8>, CodecError> {
    if instruction.accounts.len() > u8::MAX as usize {
        return Err(CodecError::TooManyAccounts(instruction.accounts.len()));
    }

    let memo_bytes = instruction.memo.as_bytes();
    if memo_bytes.len() > u16::MAX as usize {
        return Err(CodecError::MemoTooLarge(memo_bytes.len()));
    }

    let mut out = Vec::with_capacity(4 + 1 + 32 + 1 + instruction.accounts.len() * 34 + 8 + 2 + memo_bytes.len());
    out.extend_from_slice(b"SOLD");
    out.push(1);
    out.extend_from_slice(&instruction.program_id);
    out.push(instruction.accounts.len() as u8);

    for account in &instruction.accounts {
        out.extend_from_slice(&account.key);
        out.push(if account.is_signer { 1 } else { 0 });
        out.push(if account.is_writable { 1 } else { 0 });
    }

    out.extend_from_slice(&instruction.lamports.to_le_bytes());
    out.extend_from_slice(&(memo_bytes.len() as u16).to_le_bytes());
    out.extend_from_slice(memo_bytes);
    Ok(out)
}

pub fn decode(input: &[u8]) -> Result<TransferInstruction, CodecError> {
    let mut cursor = 0usize;

    if take(input, &mut cursor, 4)? != &b"SOLD"[..] {
        return Err(CodecError::BadMagic);
    }

    let _version = read_u8(input, &mut cursor)?;
    let program_id = read_array_32(input, &mut cursor)?;
    let account_count = read_u8(input, &mut cursor)? as usize;
    let mut accounts = Vec::with_capacity(account_count);

    for _ in 0..account_count {
        accounts.push(AccountMeta {
            key: read_array_32(input, &mut cursor)?,
            is_signer: read_u8(input, &mut cursor)? != 0,
            is_writable: read_u8(input, &mut cursor)? != 0,
        });
    }

    let lamports = read_u64_le(input, &mut cursor)?;
    let memo_len = read_u16_le(input, &mut cursor)? as usize;
    let memo_bytes = take(input, &mut cursor, memo_len)?;
    let memo = String::from_utf8(memo_bytes.to_vec()).map_err(|_| CodecError::InvalidUtf8)?;

    if cursor != input.len() {
        return Err(CodecError::TrailingBytes(input.len() - cursor));
    }

    Ok(TransferInstruction {
        program_id,
        accounts,
        lamports,
        memo,
    })
}

pub fn demo_instruction() -> TransferInstruction {
    TransferInstruction {
        program_id: [0x53; 32],
        accounts: vec![
            AccountMeta {
                key: [0xA1; 32],
                is_signer: true,
                is_writable: true,
            },
            AccountMeta {
                key: [0xB2; 32],
                is_signer: false,
                is_writable: true,
            },
        ],
        lamports: 42_000,
        memo: "container2wasm rust wrapper demo".to_string(),
    }
}

pub fn to_hex(bytes: &[u8]) -> String {
    use std::fmt::Write as _;

    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        write!(&mut out, "{:02x}", byte).expect("writing to String cannot fail");
    }
    out
}

fn take<'a>(input: &'a [u8], cursor: &mut usize, len: usize) -> Result<&'a [u8], CodecError> {
    let end = cursor.checked_add(len).ok_or(CodecError::UnexpectedEof)?;
    if end > input.len() {
        return Err(CodecError::UnexpectedEof);
    }

    let slice = &input[*cursor..end];
    *cursor = end;
    Ok(slice)
}

fn read_u8(input: &[u8], cursor: &mut usize) -> Result<u8, CodecError> {
    Ok(take(input, cursor, 1)?[0])
}

fn read_u16_le(input: &[u8], cursor: &mut usize) -> Result<u16, CodecError> {
    let mut bytes = [0u8; 2];
    bytes.copy_from_slice(take(input, cursor, 2)?);
    Ok(u16::from_le_bytes(bytes))
}

fn read_u64_le(input: &[u8], cursor: &mut usize) -> Result<u64, CodecError> {
    let mut bytes = [0u8; 8];
    bytes.copy_from_slice(take(input, cursor, 8)?);
    Ok(u64::from_le_bytes(bytes))
}

fn read_array_32(input: &[u8], cursor: &mut usize) -> Result<[u8; 32], CodecError> {
    let mut bytes = [0u8; 32];
    bytes.copy_from_slice(take(input, cursor, 32)?);
    Ok(bytes)
}
`;
    }

    static defaultSolanaMainRs(): string {
        return String.raw`use solana_binary_codec_demo::{decode, demo_instruction, encode, to_hex};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let instruction = demo_instruction();
    let encoded = encode(&instruction)?;
    let decoded = decode(&encoded)?;

    println!("library project: solana-binary-codec-demo");
    println!("encoded into binary ({} bytes): {}", encoded.len(), to_hex(&encoded));
    println!("decoded from binary: {:?}", decoded);
    println!("roundtrip_ok={}", instruction == decoded);

    Ok(())
}
`;
    }

    private enqueueCommand<T>(operation: () => Promise<T>): Promise<T> {
        const task = this.commandQueue.then(operation);
        this.commandQueue = task.then(() => undefined, () => undefined);
        return task;
    }

    private async writeFileBytesDirectNow(
        remotePath: string,
        dir: string,
        bytes: Uint8Array,
        options: RustCommandOptions
    ): Promise<RustCommandResult> {
        const transferId = this.nextFileId();
        const baseName = RustContainerWrapper.basename(remotePath);
        const tmpDataPath = RustContainerWrapper.joinRemotePath(dir, "." + baseName + ".rust-wrapper-" + transferId + ".tmp");
        const stage = await this.stageDirectFile(bytes, "write-" + transferId, "payload");
        const qDir = RustContainerWrapper.shellQuote(dir);
        const qRemotePath = RustContainerWrapper.shellQuote(remotePath);
        const qTmpDataPath = RustContainerWrapper.shellQuote(tmpDataPath);
        const qStagePath = RustContainerWrapper.shellQuote(stage.path);
        const qExpectedSize = RustContainerWrapper.shellQuote(String(bytes.length));
        const displayCommand = options.displayCommand || "write " + remotePath + " (" + RustContainerWrapper.formatByteCount(bytes.length) + ")";
        const status = options.status || "Writing " + remotePath;
        const logicalCommand = "write " + remotePath + " from direct WASI filesystem staging";
        const stepPrefix = options.step ? "[" + options.step.current + "/" + options.step.total + "] " : "";
        const scriptLines = [
            "mkdir -p " + qDir,
            "__rust_wrapper_file_status=$?",
            "if [ \"$__rust_wrapper_file_status\" -eq 0 ]; then",
            "    cp -f " + qStagePath + " " + qTmpDataPath,
            "    __rust_wrapper_file_status=$?",
            "fi",
            "if [ \"$__rust_wrapper_file_status\" -eq 0 ]; then",
            "    __rust_wrapper_actual_size=$(wc -c < " + qTmpDataPath + " | tr -d '[:space:]')",
            "    if [ \"$__rust_wrapper_actual_size\" != " + qExpectedSize + " ]; then",
            "        printf 'copy size mismatch: expected %s bytes, got %s bytes\\n' " + qExpectedSize + " \"$__rust_wrapper_actual_size\"",
            "        __rust_wrapper_file_status=1",
            "    fi",
            "fi",
            "if [ \"$__rust_wrapper_file_status\" -eq 0 ]; then",
            "    mv " + qTmpDataPath + " " + qRemotePath,
            "    __rust_wrapper_file_status=$?",
            "fi",
            "if [ \"$__rust_wrapper_file_status\" -ne 0 ]; then",
            "    rm -f " + qTmpDataPath,
            "else",
            "    printf 'wrote %s to %s via direct WASI filesystem staging\\n' " + RustContainerWrapper.shellQuote(RustContainerWrapper.formatByteCount(bytes.length)) + " " + RustContainerWrapper.shellQuote(remotePath),
            "fi",
            "exit \"$__rust_wrapper_file_status\"",
        ];

        let result: RustCommandResult;
        try {
            result = await this.execNow(scriptLines.join("\n"), {
                status,
                terminalTitle: options.terminalTitle || (stepPrefix + status),
                displayCommand,
                timeoutMs: options.timeoutMs,
                streamOutput: true,
            }, false);
        } finally {
            await stage.directFs.clearDirectory(stage.dir).catch(() => undefined);
        }

        const publicResult: RustCommandResult = {
            ...result,
            command: logicalCommand,
            displayCommand,
            step: options.step,
            events: [
                ...result.events,
                RustContainerWrapper.makeEvent("file.write.completed", publicResultLevel(result.exitCode), "Wrote file into container", {
                    "path": remotePath,
                    "bytes": bytes.length,
                    "stage.path": stage.path,
                    "transport": "direct-wasi-preopen",
                    "exit.code": result.exitCode,
                }),
            ],
        };
        const finalTitle = options.step
            ? "[" + options.step.current + "/" + options.step.total + "] " + options.step.label
            : status;
        this.emitStatus(RustContainerWrapper.oneLine(finalTitle + " finished with exit code " + publicResult.exitCode));
        if (this.onOutputFn) {
            this.onOutputFn(publicResult);
        }

        return publicResult;
    }

    private async readFileDirect(remotePath: string, options: RustCommandOptions = {}): Promise<Uint8Array> {
        const readId = this.nextFileId();
        const directFs = this.requireDirectFs("read files from the container");
        await directFs.ensureDirectoryMount(RustContainerWrapper.directIoMountPoint, {
            label: "Rust wrapper direct I/O staging",
        });
        const stageDir = RustContainerWrapper.joinRemotePath(RustContainerWrapper.directReadRoot, "read-" + readId);
        const stagePath = RustContainerWrapper.joinRemotePath(stageDir, RustContainerWrapper.basename(remotePath) || "payload");
        const qRemotePath = RustContainerWrapper.shellQuote(remotePath);
        const qStageDir = RustContainerWrapper.shellQuote(stageDir);
        const qStagePath = RustContainerWrapper.shellQuote(stagePath);
        try {
            await directFs.clearDirectory(stageDir);
            const copy = await this.exec([
                "if [ ! -f " + qRemotePath + " ]; then",
                "    printf 'file not found: %s\\n' " + qRemotePath,
                "    exit 1",
                "fi",
                "mkdir -p " + qStageDir,
                "cp -f " + qRemotePath + " " + qStagePath,
                "printf 'copied %s to direct WASI filesystem staging\\n' " + qRemotePath,
            ].join("\n"), {
                status: options.status || "Reading " + remotePath,
                timeoutMs: options.timeoutMs,
                displayCommand: options.displayCommand || "read " + remotePath,
                streamOutput: true,
            });
            RustContainerWrapper.assertCommandSucceeded(copy, "read " + remotePath);
            return await directFs.readFile(stagePath);
        } finally {
            await directFs.clearDirectory(stageDir).catch(() => undefined);
        }
    }

    private async stageDirectFile(bytes: Uint8Array, stageName: string, fileName: string): Promise<{ directFs: WasiDirectFsClient; dir: string; path: string }> {
        const directFs = this.requireDirectFs("stage file bytes");
        await directFs.ensureDirectoryMount(RustContainerWrapper.directIoMountPoint, {
            label: "Rust wrapper direct I/O staging",
        });
        const dir = RustContainerWrapper.joinRemotePath(RustContainerWrapper.directImportRoot, stageName);
        const path = RustContainerWrapper.joinRemotePath(dir, RustContainerWrapper.sanitizeRelativePath(fileName));
        await directFs.clearDirectory(dir);
        await directFs.writeFile(path, bytes);
        return { directFs, dir, path };
    }

    private directFs(): WasiDirectFsClient | undefined {
        return this.directFsFn ? this.directFsFn() : undefined;
    }

    private requireDirectFs(action: string): WasiDirectFsClient {
        const directFs = this.directFs();
        if (!directFs) {
            throw new Error("Direct WASI filesystem access is not available; cannot " + action + " without terminal base64 transport.");
        }
        return directFs;
    }

    private async writeFileBytesNow(
        remotePath: string,
        dir: string,
        bytes: Uint8Array,
        options: RustCommandOptions
    ): Promise<RustCommandResult> {
        const base64 = RustContainerWrapper.bytesToBase64(bytes);
        const base64LineLength = Math.max(
            64,
            Math.min(this.fileTransferChunkSize, Math.max(64, this.terminalInputChunkSize - 128))
        );
        const chunks = RustContainerWrapper.chunkString(base64, base64LineLength);
        const base64Payload = chunks.join("\n");
        const transferId = this.nextFileId();
        const baseName = RustContainerWrapper.basename(remotePath);
        const tmpStem = RustContainerWrapper.joinRemotePath(dir, "." + baseName + ".rust-wrapper-" + transferId);
        const tmpDataPath = tmpStem + ".tmp";
        const heredocMarker = "__RUST_WRAPPER_FILE_" + transferId.toUpperCase() + "_B64__";
        const qDir = RustContainerWrapper.shellQuote(dir);
        const qRemotePath = RustContainerWrapper.shellQuote(remotePath);
        const qTmpDataPath = RustContainerWrapper.shellQuote(tmpDataPath);
        const qExpectedSize = RustContainerWrapper.shellQuote(String(bytes.length));
        const displayCommand = options.displayCommand || "write " + remotePath + " (" + RustContainerWrapper.formatByteCount(bytes.length) + ")";
        const status = options.status || "Writing " + remotePath;
        const logicalCommand = "write " + remotePath + " from " + chunks.length + " base64 heredoc line(s)";
        const stepPrefix = options.step ? "[" + options.step.current + "/" + options.step.total + "] " : "";

        const scriptLines: string[] = [
            "mkdir -p " + qDir,
            "__rust_wrapper_file_status=$?",
            "if [ \"$__rust_wrapper_file_status\" -eq 0 ]; then",
            "    rm -f " + qTmpDataPath,
            "    __rust_wrapper_file_status=$?",
            "fi",
            "if [ \"$__rust_wrapper_file_status\" -eq 0 ]; then",
            "    base64 -d > " + qTmpDataPath + " <<'" + heredocMarker + "'",
            base64Payload,
            heredocMarker,
            "    __rust_wrapper_file_status=$?",
            "fi",
        ];

        scriptLines.push(
            "if [ \"$__rust_wrapper_file_status\" -eq 0 ]; then",
            "    __rust_wrapper_actual_size=$(wc -c < " + qTmpDataPath + " | tr -d '[:space:]')",
            "    if [ \"$__rust_wrapper_actual_size\" != " + qExpectedSize + " ]; then",
            "        printf 'decoded size mismatch: expected %s bytes, got %s bytes\\n' " + qExpectedSize + " \"$__rust_wrapper_actual_size\"",
            "        __rust_wrapper_file_status=1",
            "    fi",
            "fi",
            "if [ \"$__rust_wrapper_file_status\" -eq 0 ]; then",
            "    mv " + qTmpDataPath + " " + qRemotePath,
            "    __rust_wrapper_file_status=$?",
            "fi",
            "if [ \"$__rust_wrapper_file_status\" -ne 0 ]; then",
            "    rm -f " + qTmpDataPath,
            "else",
            "    printf 'wrote %s to %s\\n' " + RustContainerWrapper.shellQuote(RustContainerWrapper.formatByteCount(bytes.length)) + " " + RustContainerWrapper.shellQuote(remotePath),
            "fi",
            "if [ \"$__rust_wrapper_file_status\" -eq 0 ]; then",
            "    true",
            "else",
            "    false",
            "fi"
        );

        const result = await this.execNow(scriptLines.join("\n"), {
            status,
            terminalTitle: options.terminalTitle || (stepPrefix + status),
            displayCommand,
            timeoutMs: options.timeoutMs,
        }, false);

        const publicResult: RustCommandResult = {
            ...result,
            command: logicalCommand,
            displayCommand,
            step: options.step,
            events: [
                ...result.events,
                RustContainerWrapper.makeEvent("file.write.completed", publicResultLevel(result.exitCode), "Wrote file into container", {
                    "path": remotePath,
                    "bytes": bytes.length,
                    "base64.lines": chunks.length,
                    "exit.code": result.exitCode,
                }),
            ],
        };
        const finalTitle = options.step
            ? "[" + options.step.current + "/" + options.step.total + "] " + options.step.label
            : status;
        this.emitStatus(RustContainerWrapper.oneLine(finalTitle + " finished with exit code " + publicResult.exitCode));
        if (this.onOutputFn) {
            this.onOutputFn(publicResult);
        }

        return publicResult;
    }

    private async execNow(command: string, options: RustCommandOptions, emitOutput = true): Promise<RustCommandResult> {
        const commandValue: unknown = command;
        const commandText = Array.isArray(commandValue)
            ? commandValue.map((line) => String(line)).join("\n")
            : String(commandValue);
        const id = this.nextCommandId();
        const beginMarker = "--- rust-wrapper command " + id + " output begin";
        const endMarker = "--- rust-wrapper command " + id + " output end";
        const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
        const startedAt = Date.now();
        const terminalTitle = this.formatTerminalTitle(options);

        this.emitStatus(terminalTitle);
        this.resetTerminalCapture();
        await this.prepareTerminalForWrappedCommand(id, timeoutMs);
        this.resetTerminalCapture();
        const streamOutput = options.streamOutput !== false;
        await this.sendCommandToTerminal(this.wrapShellCommand(commandText, beginMarker, endMarker, terminalTitle, id, streamOutput), timeoutMs);

        const parsed = await this.waitForCommandResult(beginMarker, endMarker, timeoutMs);
        const finishedAt = Date.now();
        const result: RustCommandResult = {
            command: commandText,
            exitCode: parsed.exitCode,
            stdout: parsed.output,
            stderr: parsed.exitCode === 0 ? "" : parsed.output,
            rawOutput: parsed.output,
            startedAt,
            finishedAt,
            displayCommand: options.displayCommand || RustContainerWrapper.compactCommand(commandText),
            step: options.step,
            events: [],
        };
        result.events = RustContainerWrapper.commandResultEvents(result, terminalTitle);

        this.emitStatus(terminalTitle + " finished with exit code " + result.exitCode);
        if (emitOutput && this.onOutputFn) {
            this.onOutputFn(result);
        }
        return result;
    }

    private async sendCommandToTerminal(commandInput: string, timeoutMs: number): Promise<void> {
        const terminalInput = RustContainerWrapper.toTerminalInput(commandInput);
        const chunks = RustContainerWrapper.chunkTerminalInput(terminalInput, this.terminalInputChunkSize);
        const waitBudgetMs = Math.max(this.pollIntervalMs, Math.min(timeoutMs, 30000));

        for (let index = 0; index < chunks.length; index++) {
            const chunk = chunks[index];
            const deadline = Date.now() + waitBudgetMs;
            let sent = false;

            do {
                if (this.sendInputFn(chunk)) {
                    sent = true;
                    break;
                }
                await RustContainerWrapper.sleep(this.pollIntervalMs);
            } while (Date.now() < deadline);

            if (!sent) {
                throw new Error("The Rust terminal is not ready yet. Wait for the bash prompt, then try again.");
            }

            if (index < chunks.length - 1 && this.terminalInputChunkDelayMs > 0) {
                await RustContainerWrapper.sleep(this.terminalInputChunkDelayMs);
            }
        }
    }

    private async execWithStartupRetry(
        command: string,
        options: RustCommandOptions,
        startupTimeoutMs: number
    ): Promise<RustCommandResult> {
        const deadline = Date.now() + Math.max(0, startupTimeoutMs);
        let attempts = 0;
        let lastError: unknown;

        do {
            attempts += 1;
            try {
                return await this.exec(command, options);
            } catch (error) {
                lastError = error;
                if (!RustContainerWrapper.isTerminalStartupError(error) || Date.now() >= deadline) {
                    throw error;
                }
                this.emitStatus("Waiting for the Rust terminal before hydrating the library cache...");
                await RustContainerWrapper.sleep(Math.min(2500, Math.max(500, this.pollIntervalMs * attempts)));
            }
        } while (Date.now() < deadline);

        throw lastError instanceof Error ? lastError : new Error(String(lastError));
    }

    private async prepareTerminalForWrappedCommand(commandId: string, timeoutMs: number): Promise<void> {
        const readyMarker = "--- rust-wrapper command " + commandId + " input ready";
        const splitAt = Math.max(1, Math.floor(readyMarker.length / 2));
        const readyMarkerPrefix = readyMarker.slice(0, splitAt);
        const readyMarkerSuffix = readyMarker.slice(splitAt);
        const prepareCommand = [
            "stty -echo 2>/dev/null || true",
            "export PS2=''",
            "printf '%s%s\\r\\033[K\\n' "
                + RustContainerWrapper.shellQuote(readyMarkerPrefix)
                + " "
                + RustContainerWrapper.shellQuote(readyMarkerSuffix),
        ].join("\n") + "\n";

        const prepareTimeoutMs = Math.max(5000, Math.min(timeoutMs, 60000));
        const retryWaitMs = Math.max(1000, Math.min(2500, Math.floor(prepareTimeoutMs / 10)));
        const deadline = Date.now() + prepareTimeoutMs;
        let attempts = 0;
        let lastSendError: unknown;

        while (Date.now() < deadline) {
            if (this.readTerminalFn().includes(readyMarker)) {
                return;
            }

            attempts += 1;
            try {
                await this.sendCommandToTerminal(prepareCommand, timeoutMs);
                lastSendError = undefined;
            } catch (error) {
                lastSendError = error;
            }

            const waitUntil = Math.min(deadline, Date.now() + retryWaitMs);
            while (Date.now() < waitUntil) {
                if (this.readTerminalFn().includes(readyMarker)) {
                    return;
                }
                await RustContainerWrapper.sleep(this.pollIntervalMs);
            }
        }

        const tail = RustContainerWrapper.terminalTail(this.readTerminalFn(), 4000);
        const attemptText = attempts === 1 ? "1 time" : attempts + " times";
        const sendFailure = lastSendError instanceof Error
            ? "\nLast input send error: " + lastSendError.message
            : lastSendError
                ? "\nLast input send error: " + String(lastSendError)
                : "";
        throw new Error("Timed out preparing Rust terminal command input after " + prepareTimeoutMs + "ms (sent prepare command " + attemptText + ")." + sendFailure + "\nLast terminal output:\n" + (tail || "(no terminal output captured)"));
    }

    private formatTerminalTitle(options: RustCommandOptions): string {
        if (options.step) {
            return RustContainerWrapper.oneLine("[" + options.step.current + "/" + options.step.total + "] " + options.step.label);
        }
        return RustContainerWrapper.oneLine(options.terminalTitle || options.status || "Running command in Rust container");
    }

    private wrapShellCommand(
        command: string,
        beginMarker: string,
        endMarker: string,
        terminalTitle: string,
        commandId: string,
        streamOutput: boolean
    ): string {
        const capturePath = "/tmp/.rust-wrapper-command-" + commandId + ".out";
        const statusPath = "/tmp/.rust-wrapper-command-" + commandId + ".status";
        const captureLines = streamOutput
            ? [
                "(",
                "    (",
                command,
                "    )",
                "    __rust_wrapper_status=$?",
                "    printf '%s\\n' \"$__rust_wrapper_status\" >\"$__rust_wrapper_status_file\"",
                "    exit \"$__rust_wrapper_status\"",
                ") 2>&1 | tee \"$__rust_wrapper_output\"",
                "__rust_wrapper_tee_status=$?",
                "if [ -f \"$__rust_wrapper_status_file\" ]; then",
                "    __rust_wrapper_status=$(sed -n '1p' \"$__rust_wrapper_status_file\")",
                "else",
                "    __rust_wrapper_status=$__rust_wrapper_tee_status",
                "fi",
                "case \"$__rust_wrapper_status\" in",
                "    ''|*[!0-9]*) __rust_wrapper_status=1 ;;",
                "esac",
            ]
            : [
                "(",
                command,
                ") >\"$__rust_wrapper_output\" 2>&1",
                "__rust_wrapper_status=$?",
            ];
        const encodedOutputLines = streamOutput
            ? []
            : [
                "printf '%s:stdout-b64-begin\\n' \"$__rust_wrapper_end\"",
                "if [ -f \"$__rust_wrapper_output\" ]; then",
                "    base64 -w0 \"$__rust_wrapper_output\"",
                "fi",
                "printf '\\n%s:stdout-b64-end\\n' \"$__rust_wrapper_end\"",
            ];
        return [
            "set +e",
            "__rust_wrapper_begin=" + RustContainerWrapper.shellQuote(beginMarker),
            "__rust_wrapper_end=" + RustContainerWrapper.shellQuote(endMarker),
            "__rust_wrapper_title=" + RustContainerWrapper.shellQuote(terminalTitle),
            "__rust_wrapper_output=" + RustContainerWrapper.shellQuote(capturePath),
            "__rust_wrapper_status_file=" + RustContainerWrapper.shellQuote(statusPath),
            "rm -f \"$__rust_wrapper_output\" \"$__rust_wrapper_status_file\"",
            "printf '\\r\\033[K### rust-wrapper %s\\n' \"$__rust_wrapper_title\"",
            "printf '%s\\r\\033[K\\n' \"$__rust_wrapper_begin\"",
            ...captureLines,
            "printf '\\n%s:status:%s\\r\\033[K\\n' \"$__rust_wrapper_end\" \"$__rust_wrapper_status\"",
            ...encodedOutputLines,
            "rm -f \"$__rust_wrapper_output\" \"$__rust_wrapper_status_file\"",
            "stty echo 2>/dev/null || true",
            "printf '%s:done\\r\\033[K\\n' \"$__rust_wrapper_end\"",
        ].join("\n") + "\n";
    }

    private async waitForCommandResult(
        beginMarker: string,
        endMarker: string,
        timeoutMs: number
    ): Promise<{ exitCode: number; output: string }> {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const parsed = RustContainerWrapper.parseTerminalForResult(
                this.readTerminalFn(),
                beginMarker,
                endMarker
            );
            if (parsed) {
                return parsed;
            }
            await RustContainerWrapper.sleep(this.pollIntervalMs);
        }

        const tail = RustContainerWrapper.terminalTail(this.readTerminalFn(), 4000);
        throw new Error("Timed out waiting for container command after " + timeoutMs + "ms. Last terminal output:\n" + (tail || "(no terminal output captured)"));
    }

    private async waitForTerminalText(marker: string, timeoutMs: number): Promise<void> {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            if (this.readTerminalFn().includes(marker)) {
                return;
            }
            await RustContainerWrapper.sleep(this.pollIntervalMs);
        }

        const tail = RustContainerWrapper.terminalTail(this.readTerminalFn(), 4000);
        throw new Error("Timed out preparing Rust terminal command input after " + timeoutMs + "ms. Last terminal output:\n" + (tail || "(no terminal output captured)"));
    }

    private nextCommandId(): string {
        this.commandSequence += 1;
        return this.commandSequence.toString();
    }

    private nextFileId(): string {
        this.fileSequence += 1;
        return this.fileSequence.toString(36);
    }

    private emitStatus(message: string): void {
        if (this.onStatusFn) {
            this.onStatusFn(message);
        }
    }

    private clearTerminalScreen(): void {
        if (!this.clearTerminalFn) {
            return;
        }
        try {
            this.clearTerminalFn();
        } catch (error) {
            console.warn("[rust-wrapper]", {
                type: "terminal.clear_failed",
                message: error instanceof Error ? error.message : String(error),
            });
        }
    }

    private resetTerminalCapture(): void {
        if (!this.resetTerminalCaptureFn) {
            return;
        }
        try {
            this.resetTerminalCaptureFn();
        } catch (error) {
            console.warn("[rust-wrapper]", {
                type: "terminal.capture_reset_failed",
                message: error instanceof Error ? error.message : String(error),
            });
        }
    }

    private static parseTerminalForResult(
        text: string,
        beginMarker: string,
        endMarker: string
    ): { exitCode: number; output: string } | null {
        const structured = RustContainerWrapper.parseStructuredTerminalResult(text, beginMarker, endMarker);
        if (structured) {
            return structured;
        }
        if (RustContainerWrapper.hasStructuredCommandMarkers(text, beginMarker, endMarker)) {
            return null;
        }
        return RustContainerWrapper.parseLegacyTerminalResult(text, beginMarker, endMarker);
    }

    private static hasStructuredCommandMarkers(text: string, beginMarker: string, endMarker: string): boolean {
        const cleanText = RustContainerWrapper.cleanTerminalText(text).replace(/\r/g, "");
        return cleanText.includes(beginMarker) || cleanText.includes(endMarker + ":status:") || cleanText.includes(endMarker + ":stdout-b64-begin") || cleanText.includes(endMarker + ":done");
    }

    private static parseStructuredTerminalResult(
        text: string,
        beginMarker: string,
        endMarker: string
    ): { exitCode: number; output: string } | null {
        const cleanText = RustContainerWrapper.cleanTerminalText(text).replace(/\r/g, "");
        const doneMarker = endMarker + ":done";
        const doneIndex = cleanText.lastIndexOf(doneMarker);
        if (doneIndex < 0) {
            return null;
        }

        const beginIndex = cleanText.lastIndexOf(beginMarker, doneIndex);
        const statusMarker = endMarker + ":status:";
        const statusIndex = beginIndex >= 0
            ? cleanText.indexOf(statusMarker, beginIndex)
            : cleanText.lastIndexOf(statusMarker, doneIndex);
        if (statusIndex < 0 || statusIndex > doneIndex) {
            return null;
        }

        const statusMatch = cleanText.slice(statusIndex + statusMarker.length).match(/^\s*(\d+)/);
        if (!statusMatch) {
            return null;
        }
        const exitCode = Number(statusMatch[1]);
        const visibleOutput = beginIndex >= 0 && beginIndex < statusIndex
            ? RustContainerWrapper.normalizeStreamedCommandOutput(cleanText.slice(beginIndex + beginMarker.length, statusIndex))
            : "";

        const b64BeginMarker = endMarker + ":stdout-b64-begin";
        const b64EndMarker = endMarker + ":stdout-b64-end";
        const b64BeginIndex = cleanText.indexOf(b64BeginMarker, statusIndex);
        if (b64BeginIndex < 0 || b64BeginIndex > doneIndex) {
            return {
                exitCode,
                output: visibleOutput,
            };
        }
        const b64Start = b64BeginIndex + b64BeginMarker.length;
        const b64EndIndex = cleanText.indexOf(b64EndMarker, b64Start);
        if (b64EndIndex < 0 || b64EndIndex > doneIndex) {
            return null;
        }

        try {
            const encodedOutput = RustContainerWrapper.extractBase64Payload(cleanText.slice(b64Start, b64EndIndex));
            const output = RustContainerWrapper.normalizeCommandOutput(new TextDecoder().decode(RustContainerWrapper.base64ToBytes(encodedOutput)));
            return {
                exitCode,
                output: output || visibleOutput,
            };
        } catch {
            if (visibleOutput) {
                return {
                    exitCode,
                    output: visibleOutput,
                };
            }
            return null;
        }
    }

    private static parseLegacyTerminalResult(
        text: string,
        beginMarker: string,
        endMarker: string
    ): { exitCode: number; output: string } | null {
        const endPrefix = endMarker + ":";
        let searchFrom = text.length;

        while (searchFrom >= 0) {
            const endIndex = text.lastIndexOf(endPrefix, searchFrom);
            if (endIndex < 0) {
                return null;
            }

            const afterEnd = text.slice(endIndex + endPrefix.length);
            const statusMatch = afterEnd.match(/^(\d+)/);
            const beginIndex = text.lastIndexOf(beginMarker, endIndex);
            if (statusMatch && beginIndex >= 0) {
                const output = RustContainerWrapper.normalizeCommandOutput(text.slice(beginIndex + beginMarker.length, endIndex));

                return {
                    exitCode: Number(statusMatch[1]),
                    output,
                };
            }

            searchFrom = endIndex - 1;
        }

        return null;
    }

    private static combineCommandResults(
        command: string,
        displayCommand: string,
        step: RustProgressStep | undefined,
        results: RustCommandResult[]
    ): RustCommandResult {
        const first = results[0];
        const last = results[results.length - 1];
        const failed = results.find((result) => result.exitCode !== 0);
        const stdout = results.map((result) => result.stdout).filter((output) => output.length > 0).join("\n");
        const stderr = failed
            ? results.map((result) => result.stderr || (result.exitCode !== 0 ? result.stdout : "")).filter((output) => output.length > 0).join("\n")
            : "";
        const now = Date.now();

        return {
            command,
            exitCode: failed ? failed.exitCode : (last?.exitCode ?? 0),
            stdout,
            stderr,
            rawOutput: stdout,
            startedAt: first?.startedAt ?? now,
            finishedAt: last?.finishedAt ?? now,
            displayCommand,
            step,
            events: results.flatMap((result) => result.events),
        };
    }

    private static sourceFileName(file: File | RustContainerFile): string {
        let name = "uploaded-file";
        if (RustContainerWrapper.isRustContainerFile(file)) {
            try {
                name = RustContainerWrapper.basename(file.path) || name;
            } catch {
                name = "uploaded-file";
            }
        } else if (file.name) {
            name = file.name;
        }

        const cleanName = name
            .replace(/\\/g, "/")
            .split("/")
            .filter((part) => part.length > 0)
            .pop();
        if (!cleanName || cleanName === "." || cleanName === "..") {
            return "uploaded-file";
        }
        return cleanName;
        return name;
    }

    private static importStagedFolderCommand(stageDir: string, dest: string): string {
        const qStageDir = RustContainerWrapper.shellQuote(stageDir);
        const qDest = RustContainerWrapper.shellQuote(dest);
        return [
            "__rust_wrapper_import_status=0",
            "if [ ! -d " + qStageDir + " ]; then",
            "    printf 'staging directory not found: %s\\n' " + qStageDir,
            "    __rust_wrapper_import_status=1",
            "fi",
            "if [ \"$__rust_wrapper_import_status\" -eq 0 ]; then",
            "    mkdir -p " + qDest,
            "    __rust_wrapper_import_status=$?",
            "fi",
            "if [ \"$__rust_wrapper_import_status\" -eq 0 ]; then",
            "    cp -R " + qStageDir + "/. " + qDest + "/",
            "    __rust_wrapper_import_status=$?",
            "fi",
            "if [ \"$__rust_wrapper_import_status\" -eq 0 ] && [ ! -d " + qDest + " ]; then",
            "    printf 'self-check failed: destination was not created: %s\\n' " + qDest,
            "    __rust_wrapper_import_status=1",
            "fi",
            "if [ \"$__rust_wrapper_import_status\" -eq 0 ]; then",
            "    printf 'self-check: destination exists: %s\\n' " + qDest,
            "    printf 'self-check: contents under %s (first 200 entries):\\n' " + qDest,
            "    cd " + qDest + " && find . -mindepth 1 -maxdepth 4 -print | sed 's#^\\./##' | sort | sed -n '1,200p'",
            "fi",
            "exit \"$__rust_wrapper_import_status\"",
        ].join("\n");
    }

    private static importTarCommand(tarPath: string, dest: string): string {
        const qTarPath = RustContainerWrapper.shellQuote(tarPath);
        const qDest = RustContainerWrapper.shellQuote(dest);
        return [
            "__rust_wrapper_import_status=0",
            "if ! command -v tar >/dev/null 2>&1; then",
            "    printf 'tar is not installed in the container; rebuild the image after this update.\\n'",
            "    __rust_wrapper_import_status=127",
            "elif [ ! -f " + qTarPath + " ]; then",
            "    printf 'import archive not found: %s\\n' " + qTarPath,
            "    __rust_wrapper_import_status=1",
            "else",
            "    mkdir -p " + qDest,
            "    __rust_wrapper_import_status=$?",
            "fi",
            "if [ \"$__rust_wrapper_import_status\" -eq 0 ]; then",
            "    tar -xf " + qTarPath + " -C " + qDest,
            "    __rust_wrapper_import_status=$?",
            "fi",
            "rm -f " + qTarPath,
            "if [ \"$__rust_wrapper_import_status\" -eq 0 ]; then",
            "    printf 'extracted import archive into %s\\n' " + qDest,
            "fi",
            "exit \"$__rust_wrapper_import_status\"",
        ].join("\n");
    }

    private static importZipCommand(zipPath: string, dest: string): string {
        const qZipPath = RustContainerWrapper.shellQuote(zipPath);
        const qDest = RustContainerWrapper.shellQuote(dest);
        const qListPath = RustContainerWrapper.shellQuote(zipPath + ".list");
        return [
            "__rust_wrapper_import_status=0",
            "if ! command -v unzip >/dev/null 2>&1; then",
            "    printf 'unzip is not installed in the container; rebuild the image after this update.\\n'",
            "    __rust_wrapper_import_status=127",
            "elif [ ! -f " + qZipPath + " ]; then",
            "    printf 'zip archive not found: %s\\n' " + qZipPath,
            "    __rust_wrapper_import_status=1",
            "else",
            "    mkdir -p " + qDest,
            "    __rust_wrapper_import_status=$?",
            "fi",
            "if [ \"$__rust_wrapper_import_status\" -eq 0 ]; then",
            "    unzip -Z1 " + qZipPath + " > " + qListPath,
            "    __rust_wrapper_import_status=$?",
            "fi",
            "if [ \"$__rust_wrapper_import_status\" -eq 0 ]; then",
            "    if awk 'BEGIN { bad=0 } /^\\// || /(^|\\/)\\.\\.($|\\/)/ { print \"unsafe zip path: \" $0; bad=1 } END { exit bad }' " + qListPath + "; then",
            "        true",
            "    else",
            "        __rust_wrapper_import_status=1",
            "    fi",
            "fi",
            "if [ \"$__rust_wrapper_import_status\" -eq 0 ]; then",
            "    unzip -oq " + qZipPath + " -d " + qDest,
            "    __rust_wrapper_import_status=$?",
            "fi",
            "rm -f " + qZipPath + " " + qListPath,
            "if [ \"$__rust_wrapper_import_status\" -eq 0 ]; then",
            "    printf 'extracted zip archive into %s\\n' " + qDest,
            "fi",
            "exit \"$__rust_wrapper_import_status\"",
        ].join("\n");
    }

    private static fileVerificationCommand(path: string): string {
        const qPath = RustContainerWrapper.shellQuote(path);
        return [
            "if [ ! -f " + qPath + " ]; then",
            "    printf 'file does not exist: %s\\n' " + qPath,
            "    exit 1",
            "fi",
            "__rust_wrapper_file_size=$(wc -c < " + qPath + " | tr -d '[:space:]')",
            "printf '%s (%s bytes)\\n' " + qPath + " \"$__rust_wrapper_file_size\"",
        ].join("\n");
    }

    private static planImportEntries(
        entries: Array<File | RustContainerFile>,
        options: RustImportFolderOptions
    ): RustPlannedImportEntry[] {
        const rawEntries: RustRawImportEntry[] = entries.map((entry) => {
            if (RustContainerWrapper.isRustContainerFile(entry)) {
                return {
                    rawPath: entry.path,
                    data: entry.data,
                    autoStripTopLevel: false,
                };
            }

            const browserFile = entry as File & { webkitRelativePath?: string };
            const webkitPath = browserFile.webkitRelativePath || "";
            return {
                rawPath: webkitPath || browserFile.name,
                data: browserFile,
                autoStripTopLevel: webkitPath.includes("/"),
            };
        });
        const autoStripPrefix = options.stripPrefix === undefined && options.stripTopLevelDirectory !== false
            ? RustContainerWrapper.commonTopLevelDirectory(
                rawEntries
                    .filter((entry) => entry.autoStripTopLevel)
                    .map((entry) => entry.rawPath)
            )
            : undefined;

        return rawEntries.map((entry) => ({
            relativePath: RustContainerWrapper.sanitizeRelativePath(
                entry.rawPath,
                options.stripPrefix ?? (entry.autoStripTopLevel ? autoStripPrefix : undefined)
            ),
            data: entry.data,
        }));
    }

    private static async buildTarArchive(entries: RustPlannedImportEntry[]): Promise<Uint8Array> {
        const normalizedEntries = entries.map((entry) => ({
            relativePath: RustContainerWrapper.sanitizeRelativePath(entry.relativePath),
            data: entry.data,
        }));
        const chunks: Uint8Array[] = [];
        const directories = new Set<string>();

        for (const entry of normalizedEntries) {
            const parts = entry.relativePath.split("/");
            let dir = "";
            for (let index = 0; index < parts.length - 1; index++) {
                dir = dir ? dir + "/" + parts[index] : parts[index];
                directories.add(dir);
            }
        }

        for (const directory of Array.from(directories).sort()) {
            chunks.push(RustContainerWrapper.createTarHeader(directory, 0, "5", 0o755));
        }

        for (const entry of normalizedEntries) {
            const bytes = await RustContainerWrapper.dataToBytes(entry.data);
            const mtime = entry.data instanceof File && Number.isFinite(entry.data.lastModified)
                ? Math.max(0, Math.floor(entry.data.lastModified / 1000))
                : Math.floor(Date.now() / 1000);
            chunks.push(RustContainerWrapper.createTarHeader(entry.relativePath, bytes.length, "0", 0o644, mtime));
            chunks.push(bytes);
            const padding = RustContainerWrapper.tarPadding(bytes.length);
            if (padding > 0) {
                chunks.push(new Uint8Array(padding));
            }
        }

        chunks.push(new Uint8Array(1024));
        return RustContainerWrapper.concatBytes(chunks);
    }

    private static createTarHeader(
        path: string,
        size: number,
        typeflag: "0" | "5",
        mode: number,
        mtime = Math.floor(Date.now() / 1000)
    ): Uint8Array {
        const header = new Uint8Array(512);
        const parts = RustContainerWrapper.tarPathParts(path);
        RustContainerWrapper.writeTarBytes(header, 0, 100, parts.name);
        RustContainerWrapper.writeTarOctal(header, 100, 8, mode);
        RustContainerWrapper.writeTarOctal(header, 108, 8, 0);
        RustContainerWrapper.writeTarOctal(header, 116, 8, 0);
        RustContainerWrapper.writeTarOctal(header, 124, 12, size);
        RustContainerWrapper.writeTarOctal(header, 136, 12, mtime);
        for (let index = 148; index < 156; index++) {
            header[index] = 0x20;
        }
        header[156] = typeflag.charCodeAt(0);
        RustContainerWrapper.writeTarAscii(header, 257, 6, "ustar\0");
        RustContainerWrapper.writeTarAscii(header, 263, 2, "00");
        RustContainerWrapper.writeTarAscii(header, 265, 32, "root");
        RustContainerWrapper.writeTarAscii(header, 297, 32, "root");
        if (parts.prefix.length > 0) {
            RustContainerWrapper.writeTarBytes(header, 345, 155, parts.prefix);
        }

        let checksum = 0;
        for (const byte of header) {
            checksum += byte;
        }
        RustContainerWrapper.writeTarAscii(header, 148, 8, checksum.toString(8).padStart(6, "0") + "\0 ");
        return header;
    }

    private static tarPathParts(path: string): { name: Uint8Array; prefix: Uint8Array } {
        const normalized = RustContainerWrapper.sanitizeRelativePath(path);
        const encoder = new TextEncoder();
        const encoded = encoder.encode(normalized);
        if (encoded.byteLength <= 100) {
            return { name: encoded, prefix: new Uint8Array(0) };
        }

        for (let index = normalized.lastIndexOf("/"); index > 0; index = normalized.lastIndexOf("/", index - 1)) {
            const prefix = normalized.slice(0, index);
            const name = normalized.slice(index + 1);
            const prefixBytes = encoder.encode(prefix);
            const nameBytes = encoder.encode(name);
            if (prefixBytes.byteLength <= 155 && nameBytes.byteLength <= 100) {
                return { name: nameBytes, prefix: prefixBytes };
            }
        }

        throw new Error("path is too long for portable tar import: " + normalized);
    }

    private static writeTarBytes(header: Uint8Array, offset: number, length: number, bytes: Uint8Array): void {
        if (bytes.byteLength > length) {
            throw new Error("tar header field is too long");
        }
        header.set(bytes, offset);
    }

    private static writeTarAscii(header: Uint8Array, offset: number, length: number, value: string): void {
        for (let index = 0; index < Math.min(length, value.length); index++) {
            header[offset + index] = value.charCodeAt(index) & 0xff;
        }
    }

    private static writeTarOctal(header: Uint8Array, offset: number, length: number, value: number): void {
        if (!Number.isFinite(value) || value < 0) {
            throw new Error("invalid tar numeric field: " + String(value));
        }
        const rounded = Math.floor(value);
        const max = Math.pow(8, length - 1) - 1;
        if (rounded > max) {
            throw new Error("tar numeric field is too large: " + String(value));
        }
        RustContainerWrapper.writeTarAscii(header, offset, length, rounded.toString(8).padStart(length - 1, "0") + "\0");
    }

    private static tarPadding(size: number): number {
        const remainder = size % 512;
        return remainder === 0 ? 0 : 512 - remainder;
    }

    private static commonTopLevelDirectory(paths: string[]): string | undefined {
        if (paths.length === 0) {
            return undefined;
        }
        const firstParts = paths[0].replace(/\\/g, "/").split("/").filter((part) => part.length > 0);
        if (firstParts.length < 2) {
            return undefined;
        }
        const candidate = firstParts[0];
        for (const path of paths) {
            const parts = path.replace(/\\/g, "/").split("/").filter((part) => part.length > 0);
            if (parts.length < 2 || parts[0] !== candidate) {
                return undefined;
            }
        }
        return candidate;
    }

    private static importVerificationCommand(dest: string): string {
        const qDest = RustContainerWrapper.shellQuote(dest);
        return [
            "if [ ! -d " + qDest + " ]; then",
            "    printf 'destination does not exist: %s\\n' " + qDest,
            "    exit 1",
            "fi",
            "cd " + qDest + " && find . -mindepth 1 -maxdepth 4 -print | sed 's#^\\./##' | sort | sed -n '1,200p'",
        ].join("\n");
    }

    private static assertCommandSucceeded(result: RustCommandResult, action: string): void {
        if (result.exitCode === 0) {
            return;
        }
        const details = result.stderr || result.stdout || ("exit code " + result.exitCode);
        throw new Error("failed to " + action + ":\n" + details);
    }

    private static exportSummaryResult(
        remotePath: string,
        displayCommand: string,
        createResult: RustCommandResult,
        archiveSize: number,
        transport: RustExportTransport = "terminal-base64-chunks"
    ): RustCommandResult {
        const failed = createResult.exitCode !== 0 ? createResult : undefined;
        const transferLine = transport === "direct-wasi-preopen"
            ? "Transfer: .zip written directly into the direct WASI output mount and read by JavaScript as a worker ArrayBuffer; the binary archive is not printed through the terminal."
            : "Transfer: .zip read by JavaScript in bounded base64 chunks as a compatibility fallback; the binary archive may pass through terminal text transport.";
        const summaryOutput = [
            "Exported " + remotePath + " from the container filesystem as a zip archive.",
            "Archive size: " + RustContainerWrapper.formatByteCount(archiveSize) + ".",
            transferLine,
        ].join("\n");
        return {
            command: "export zip " + remotePath,
            exitCode: failed ? failed.exitCode : 0,
            stdout: summaryOutput,
            stderr: failed ? (failed.stderr || failed.stdout) : "",
            rawOutput: summaryOutput,
            startedAt: createResult.startedAt,
            finishedAt: Date.now(),
            displayCommand,
            events: [
                RustContainerWrapper.makeEvent("folder.export.completed", failed ? "error" : "info", "Exported container filesystem path as zip archive", {
                    "source.path": remotePath,
                    "archive.bytes": archiveSize,
                    "transport": transport,
                    "exit.code": failed ? failed.exitCode : 0,
                    "source.kind": "container-filesystem",
                }),
            ],
        };
    }

    private static syntheticResult(options: {
        command: string;
        displayCommand: string;
        stdout: string;
        startedAt?: number;
        step?: RustProgressStep;
        events?: RustLogEvent[];
    }): RustCommandResult {
        const startedAt = options.startedAt ?? Date.now();
        return {
            command: options.command,
            exitCode: 0,
            stdout: options.stdout,
            stderr: "",
            rawOutput: options.stdout,
            startedAt,
            finishedAt: Date.now(),
            displayCommand: options.displayCommand,
            step: options.step,
            events: options.events || [],
        };
    }

    private static parseExportArchiveSize(output: string): number | undefined {
        const match = output.match(/export:\s+(?:temporary\s+)?archive size:\s*(\d+)\s+bytes/);
        if (!match) {
            return undefined;
        }
        const parsed = Number(match[1]);
        return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
    }

    private static cleanTerminalText(text: string): string {
        return text
            .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
            .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
    }

    private static normalizeCommandOutput(text: string): string {
        return RustContainerWrapper.cleanTerminalText(text)
            .replace(/\r\n/g, "\n")
            .replace(/\r/g, "\n")
            .replace(/\u0000/g, "")
            .replace(/\n{3,}/g, "\n\n")
            .trimEnd();
    }

    private static normalizeStreamedCommandOutput(text: string): string {
        return RustContainerWrapper.normalizeCommandOutput(text.replace(/^\n/, ""));
    }

    private static terminalTail(text: string, maxChars: number): string {
        const clean = RustContainerWrapper.cleanTerminalText(text).replace(/\r/g, "");
        if (clean.length <= maxChars) {
            return clean.trimEnd();
        }
        return ("…" + clean.slice(clean.length - maxChars)).trimEnd();
    }

    private static extractBase64Payload(region: string): string {
        return region
            .split(/\n/)
            .map((line) => line.trim())
            .filter((line) => /^[A-Za-z0-9+/]+={0,2}$/.test(line))
            .join("");
    }

    private static parseNonNegativeInteger(output: string): number | undefined {
        const exactLine = output
            .split(/\r?\n/)
            .map((line) => line.trim())
            .find((line) => /^\d+$/.test(line));
        if (exactLine) {
            const parsed = Number(exactLine);
            return Number.isSafeInteger(parsed) ? parsed : undefined;
        }

        const candidates = (output.match(/\d+/g) || [])
            .map((value) => Number(value))
            .filter((value) => Number.isSafeInteger(value) && value >= 0);
        if (candidates.length === 0) {
            return undefined;
        }
        return Math.max(...candidates);
    }

    private static makeEvent(
        type: string,
        level: RustLogLevel,
        message: string,
        facts: Record<string, RustLogFactValue | undefined> = {}
    ): RustLogEvent {
        const cleanFacts: Record<string, RustLogFactValue> = {};
        for (const [key, value] of Object.entries(facts)) {
            if (value !== undefined) {
                cleanFacts[key] = value;
            }
        }
        return {
            type,
            at: Date.now(),
            level,
            message,
            facts: cleanFacts,
        };
    }

    private static commandResultEvents(result: RustCommandResult, title: string): RustLogEvent[] {
        const durationMs = Math.max(0, result.finishedAt - result.startedAt);
        const outputBytes = RustContainerWrapper.utf8ByteLength(result.stdout);
        return [
            RustContainerWrapper.makeEvent("command.completed", publicResultLevel(result.exitCode), title + " completed", {
                "command.display": result.displayCommand,
                "exit.code": result.exitCode,
                "duration.ms": durationMs,
                "output.bytes": outputBytes,
                "output.lines": RustContainerWrapper.countOutputLines(result.stdout),
            }),
        ];
    }

    private static countOutputLines(output: string): number {
        return output.trim().length === 0 ? 0 : output.split(/\r?\n/).length;
    }

    private static utf8ByteLength(output: string): number {
        return new TextEncoder().encode(output).byteLength;
    }

    private static parseCargoDiagnostics(output: string): RustCompilerDiagnostic[] {
        const diagnostics: RustCompilerDiagnostic[] = [];

        for (const line of output.split(/\r?\n/)) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
                continue;
            }

            try {
                const parsed = JSON.parse(trimmed) as {
                    reason?: string;
                    message?: {
                        level?: string;
                        message?: string;
                        rendered?: string;
                        code?: { code?: string };
                        spans?: unknown[];
                    };
                };

                if (parsed.reason === "compiler-message" && parsed.message) {
                    diagnostics.push({
                        level: parsed.message.level || "unknown",
                        message: parsed.message.message || parsed.message.rendered || "compiler message",
                        rendered: parsed.message.rendered,
                        code: parsed.message.code?.code,
                        spans: parsed.message.spans,
                    });
                }
            } catch {
                continue;
            }
        }

        return diagnostics;
    }

    private static async dataToBytes(data: string | ArrayBuffer | ArrayBufferView | Blob): Promise<Uint8Array> {
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
        throw new Error("unsupported file data type");
    }

    private static bytesToBase64(bytes: Uint8Array): string {
        let binary = "";
        for (let i = 0; i < bytes.length; i += 0x8000) {
            binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + 0x8000)));
        }
        return btoa(binary);
    }

    private static base64ToBytes(base64: string): Uint8Array {
        const clean = base64.replace(/\s+/g, "");
        const binary = atob(clean);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }

    private static concatBytes(chunks: Uint8Array[], expectedSize?: number): Uint8Array {
        const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
        if (expectedSize !== undefined && total !== expectedSize) {
            throw new Error("decoded size mismatch: expected " + expectedSize + " bytes, got " + total + " bytes");
        }
        const output = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) {
            output.set(chunk, offset);
            offset += chunk.length;
        }
        return output;
    }

    private static splitBase64(base64: string): string {
        return base64.match(/.{1,76}/g)?.join("\n") || "";
    }

    private static compactCommand(command: string): string {
        const lines = command.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
        if (lines.length <= 1) {
            return command.trim();
        }
        return lines[0] + " … (" + lines.length + " shell lines)";
    }

    private static toTerminalInput(text: string): string {
        const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
        const withFinalNewline = normalized.endsWith("\n") ? normalized : normalized + "\n";
        return withFinalNewline.replace(/\n/g, "\r");
    }

    private static chunkTerminalInput(value: string, chunkSize: number): string[] {
        const maxChunkSize = Math.max(1, chunkSize);
        const chunks: string[] = [];
        let index = 0;

        while (index < value.length) {
            const lineEnd = value.indexOf("\r", index);
            const lineLimit = lineEnd >= 0 ? lineEnd + 1 : value.length;

            while (index < lineLimit) {
                const end = Math.min(index + maxChunkSize, lineLimit);
                chunks.push(value.slice(index, end));
                index = end;
            }
        }

        if (chunks.length === 0) {
            chunks.push("");
        }
        return chunks;
    }

    private static chunkString(value: string, chunkSize: number): string[] {
        const chunks: string[] = [];
        for (let index = 0; index < value.length; index += chunkSize) {
            chunks.push(value.slice(index, index + chunkSize));
        }

        if (chunks.length === 0) {
            chunks.push("");
        }

        return chunks;
    }

    private static formatByteCount(bytes: number): string {
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

    private static oneLine(value: string): string {
        const cleaned = value.replace(/\s+/g, " ").trim();
        return cleaned || "Running command in Rust container";
    }

    private static shellQuote(value: string): string {
        return "'" + value.replace(/'/g, "'\\''") + "'";
    }

    private static cargoNetworkEnvPrefix(): string {
        const proxyCert = "/.wasmenv/proxy.crt";
        return [
            "SSL_CERT_FILE=" + RustContainerWrapper.shellQuote(proxyCert),
            "GIT_SSL_CAINFO=" + RustContainerWrapper.shellQuote(proxyCert),
            "CARGO_HTTP_CAINFO=" + RustContainerWrapper.shellQuote(proxyCert),
            "CARGO_NET_GIT_FETCH_WITH_CLI=true",
            "CARGO_REGISTRIES_CRATES_IO_PROTOCOL=sparse",
        ].join(" ");
    }

    private static defaultLibraryCacheUrl(): string {
        const params = new URLSearchParams(typeof location !== "undefined" ? location.search : "");
        const override = params.get("rustCacheUrl");
        if (override && override.trim()) {
            return override.trim();
        }
        if (typeof window !== "undefined" && window.c2wRustLibraryCacheUrl) {
            return window.c2wRustLibraryCacheUrl;
        }

        const releaseOverride = params.get("releaseTag");
        const releaseTag = releaseOverride && releaseOverride.trim()
            ? releaseOverride.trim()
            : typeof window !== "undefined" && window.c2wRustReleaseTag
            ? window.c2wRustReleaseTag
            : "1.0.1";
        return "https://github.com/advanced-rust-book/c2w-rust-project-editor/releases/download/"
            + encodeURIComponent(releaseTag)
            + "/amd64-debian-wasi-cargo-cache.tar.gz";
    }

    private static defaultLibraryCacheKey(url: string): string {
        const params = new URLSearchParams(typeof location !== "undefined" ? location.search : "");
        const override = params.get("rustCacheUrl");
        if (override && override.trim()) {
            return url;
        }
        if (typeof window !== "undefined" && window.c2wRustLibraryCacheKey) {
            return window.c2wRustLibraryCacheKey;
        }
        return url;
    }

    private static libraryCacheHydrateCommand(url: string, cacheKey: string): string {
        const qUrl = RustContainerWrapper.shellQuote(url);
        const qCacheKey = RustContainerWrapper.shellQuote(cacheKey);
        return [
            "set -e",
            "if command -v hydrate-rust-cache >/dev/null 2>&1; then",
            "    hydrate-rust-cache " + qUrl + " " + qCacheKey,
            "else",
            "    tmp_dir=$(mktemp -d /tmp/c2w-rust-cache.XXXXXX)",
            "    trap 'rm -rf \"$tmp_dir\"' EXIT",
            "    archive=\"$tmp_dir/rust-dev-cache.tar.gz\"",
            "    printf 'hydrate-rust-cache fallback: downloading %s\\n' " + qUrl,
            "    curl -fL --retry 3 --retry-delay 2 --connect-timeout 30 --progress-bar " + qUrl + " -o \"$archive\"",
            "    printf 'hydrate-rust-cache fallback: unpacking Rust development cache\\n'",
            "    tar -xzf \"$archive\" -C /",
            "    mkdir -p /usr/local/cargo/.c2w-cache",
            "    printf '%s\\n' " + qCacheKey + " > /usr/local/cargo/.c2w-cache/rust-dev-cache.stamp",
            "fi",
        ].join("\n");
    }

    private static isTerminalStartupError(error: unknown): boolean {
        const message = error instanceof Error ? error.message : String(error);
        return /terminal is not ready|input ready marker|bash prompt|WASI runtime/i.test(message);
    }

    private static normalizeRemotePath(path: string): string {
        const trimmed = path.trim();
        if (!trimmed) {
            throw new Error("remote path must not be empty");
        }
        if (trimmed.includes("\0")) {
            throw new Error("remote path must not contain NUL bytes");
        }

        const normalized = trimmed.replace(/\\/g, "/").replace(/\/+/g, "/");
        return normalized.length > 1 ? normalized.replace(/\/+$/, "") : normalized;
    }

    private static dirname(path: string): string {
        const normalized = RustContainerWrapper.normalizeRemotePath(path);
        const index = normalized.lastIndexOf("/");
        if (index < 0) {
            return ".";
        }
        if (index === 0) {
            return "/";
        }
        return normalized.slice(0, index);
    }

    private static basename(path: string): string {
        const normalized = RustContainerWrapper.normalizeRemotePath(path);
        const index = normalized.lastIndexOf("/");
        return index < 0 ? normalized : normalized.slice(index + 1);
    }

    private static joinRemotePath(base: string, relative: string): string {
        const normalizedBase = RustContainerWrapper.normalizeRemotePath(base);
        const cleanRelative = RustContainerWrapper.sanitizeRelativePath(relative);
        return normalizedBase === "/" ? "/" + cleanRelative : normalizedBase + "/" + cleanRelative;
    }

    private static sanitizeRelativePath(path: string, stripPrefix?: string): string {
        let normalized = path.replace(/\\/g, "/");
        if (stripPrefix) {
            const cleanPrefix = stripPrefix.replace(/\\/g, "/").replace(/\/+$/, "");
            if (normalized === cleanPrefix) {
                normalized = "";
            } else if (normalized.startsWith(cleanPrefix + "/")) {
                normalized = normalized.slice(cleanPrefix.length + 1);
            }
        }

        if (normalized.includes("\0")) {
            throw new Error("relative path must not contain NUL bytes");
        }

        const parts = normalized.split("/").filter((part) => part.length > 0 && part !== "." && part !== "..");
        if (parts.length === 0) {
            throw new Error("relative path is empty");
        }

        return parts.join("/");
    }

    private static isRustContainerFile(value: unknown): value is RustContainerFile {
        return typeof value === "object"
            && value !== null
            && typeof (value as RustContainerFile).path === "string"
            && "data" in value;
    }

    private static assertSafeProjectPathForReset(path: string): void {
        const normalized = RustContainerWrapper.normalizeRemotePath(path);
        if (normalized === "/" || normalized === "/root" || normalized === "/tmp" || normalized === ".") {
            throw new Error("refusing to reset unsafe project path: " + normalized);
        }
    }

    private static sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}

function publicResultLevel(exitCode: number): RustLogLevel {
    return exitCode === 0 ? "info" : "error";
}

window.RustContainerWrapper = RustContainerWrapper;
window.rustContainer = window.rustContainer || new RustContainerWrapper();
