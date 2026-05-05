const DEFAULT_RUNTIME_SEARCH = "?args=%2Fbin%2Fbash";

function getRustContainerWrapperClass(): typeof RustContainerWrapper {
    const wrapperClass = window.RustContainerWrapper;
    if (wrapperClass) {
        return wrapperClass;
    }
    if (typeof RustContainerWrapper === "function") {
        return RustContainerWrapper;
    }
    throw new Error("RustContainerWrapper failed to load. Make sure ./dist/rust-wrapper.js is loaded before ./dist/amd64-debian-wasi.js.");
}

const RustWrapperClass = getRustContainerWrapperClass();
const DEFAULT_PROJECT_DIR = RustWrapperClass.defaultProjectDir;

function effectiveRuntimeSearch(): string {
    const params = new URLSearchParams(location.search);
    if (!params.has("args")) {
        params.set("args", "/bin/bash");
    }

    const nextSearch = "?" + params.toString();
    if (nextSearch !== location.search) {
        history.replaceState(null, "", nextSearch);
    }
    return nextSearch || DEFAULT_RUNTIME_SEARCH;
}

function textAreaValue(id: string): string {
    const elem = document.getElementById(id);
    if (!(elem instanceof HTMLTextAreaElement)) {
        throw new Error("textarea not found: " + id);
    }
    return elem.value;
}

function setTextAreaValue(id: string, value: string): void {
    const elem = document.getElementById(id);
    if (elem instanceof HTMLTextAreaElement) {
        elem.value = value;
    }
}

function setInputValue(id: string, value: string): void {
    const elem = document.getElementById(id);
    if (elem instanceof HTMLInputElement) {
        elem.value = value;
    }
}

function inputValue(id: string): string {
    const elem = document.getElementById(id);
    if (!(elem instanceof HTMLInputElement)) {
        throw new Error("input not found: " + id);
    }
    return elem.value;
}

function setWrapperStatus(message: string): void {
    const elem = document.getElementById("rust-wrapper-status");
    if (elem) {
        elem.textContent = message;
        elem.className = "status-line text-muted";
    }
}

function setWrapperError(message: string): void {
    const elem = document.getElementById("rust-wrapper-status");
    if (elem) {
        elem.textContent = message;
        elem.className = "status-line text-danger";
    }
}

function outputElement(): HTMLElement | null {
    return document.getElementById("rust-wrapper-output");
}

function clearWrapperOutput(): void {
    const elem = outputElement();
    if (elem) {
        elem.textContent = "";
    }
}

function appendWrapperOutput(text: string): void {
    const elem = outputElement();
    if (!elem) {
        return;
    }
    elem.textContent += text;
    elem.scrollTop = elem.scrollHeight;
}

function formatDurationMs(durationMs: number): string {
    if (!Number.isFinite(durationMs) || durationMs < 0) {
        return "0 ms";
    }
    if (durationMs < 1000) {
        return Math.round(durationMs) + " ms";
    }
    if (durationMs < 60000) {
        const seconds = durationMs / 1000;
        return seconds.toFixed(durationMs < 10000 ? 2 : 1).replace(/\.0+$/, "") + " s";
    }
    const minutes = Math.floor(durationMs / 60000);
    const seconds = (durationMs % 60000) / 1000;
    return minutes + "m " + seconds.toFixed(1).replace(/\.0$/, "") + "s";
}

function resultDuration(result: RustCommandResult): string {
    return formatDurationMs(Math.max(0, result.finishedAt - result.startedAt));
}

function outputForDisplay(output: string): string {
    return output.replace(/\r/g, "").trimEnd();
}

function resultOutputForDisplay(result: RustCommandResult): string {
    for (const candidate of [result.stdout, result.stderr, result.rawOutput]) {
        const output = outputForDisplay(candidate || "");
        if (output) {
            return output;
        }
    }
    return "";
}

function indentOutput(output: string, prefix = "    "): string {
    return output
        .split(/\r?\n/)
        .map((line) => prefix + line)
        .join("\n");
}

function formatFactValue(value: RustLogFactValue): string {
    if (typeof value === "number" && Number.isFinite(value)) {
        return Number.isInteger(value) ? String(value) : value.toFixed(2);
    }
    return String(value);
}

function renderEventLines(result: RustCommandResult): string[] {
    const events = Array.isArray(result.events) ? result.events : [];
    if (events.length === 0) {
        return [
            "  event: command.completed",
            "    command.display: " + (result.displayCommand || result.command),
            "    exit.code: " + result.exitCode,
        ];
    }

    const lines: string[] = [];
    for (const event of events) {
        lines.push("  event: " + event.type + " - " + event.message);
        const facts = Object.entries(event.facts || {});
        if (facts.length === 0) {
            continue;
        }
        for (const [key, value] of facts) {
            lines.push("    " + key + ": " + formatFactValue(value));
        }
    }
    return lines;
}

function resultHeading(title: string, result: RustCommandResult): string {
    if (result.step) {
        return "Step " + result.step.current + "/" + result.step.total + " - " + result.step.label;
    }
    return title || result.displayCommand || "command";
}

function renderResult(title: string, result: RustCommandResult): void {
    const ok = result.exitCode === 0;
    const output = resultOutputForDisplay(result);
    const lines = [
        (ok ? "OK " : "FAIL ") + resultHeading(title, result) + " (" + resultDuration(result) + ")",
        ...renderEventLines(result),
    ];
    if (output) {
        lines.push("  output:", indentOutput(output));
    } else {
        lines.push("  output: (none)");
    }
    appendWrapperOutput(lines.join("\n") + "\n\n");
}

function isCompileResult(result: RustCommandResult | RustCompileResult): result is RustCompileResult {
    return "diagnostics" in result && Array.isArray((result as RustCompileResult).diagnostics);
}

function renderCompileResult(result: RustCompileResult): void {
    renderResult("cargo build", result);
    if (!result.success && result.diagnostics.length > 0) {
        appendWrapperOutput("  compiler diagnostics:\n");
        for (const diagnostic of result.diagnostics) {
            appendWrapperOutput("    [" + diagnostic.level + "] " + diagnostic.message + "\n");
            if (diagnostic.rendered) {
                appendWrapperOutput(indentOutput(diagnostic.rendered.trimEnd(), "      ") + "\n");
            }
        }
        appendWrapperOutput("\n");
    }
}

function renderDemoStep(result: RustCommandResult | RustCompileResult): void {
    if (isCompileResult(result)) {
        renderCompileResult(result);
    } else {
        renderResult("", result);
    }
}

function shellQuoteForUi(value: string): string {
    return "'" + value.replace(/'/g, "'\\''") + "'";
}

function currentProjectDir(): string {
    const projectDir = inputValue("project-dir").trim();
    if (!projectDir) {
        throw new Error("project directory must not be empty");
    }
    return projectDir;
}

function rustFileRelativePathOrDefault(): string {
    const elem = document.getElementById("rust-file-path");
    if (elem instanceof HTMLInputElement) {
        const value = elem.value.trim();
        return value || "src/lib.rs";
    }
    return "src/lib.rs";
}

function currentRustFileRelativePath(): string {
    const raw = rustFileRelativePathOrDefault().replace(/\\/g, "/");
    const parts = raw.split("/");
    if (raw.startsWith("/") || parts.some((part) => part.length === 0 || part === "." || part === "..")) {
        throw new Error("Rust source path must be relative and must not contain empty, . or .. segments");
    }
    return parts.join("/");
}

function joinContainerPath(base: string, relativePath: string): string {
    const cleanBase = base.trim().replace(/\/+$/, "");
    const cleanRelative = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
    if (!cleanRelative) {
        return cleanBase || "/";
    }
    if (cleanBase === "" || cleanBase === "/") {
        return "/" + cleanRelative;
    }
    return cleanBase + "/" + cleanRelative;
}

function setActiveProjectDir(projectDir: string, updateExportPath = true): void {
    setInputValue("project-dir", projectDir);
    if (updateExportPath) {
        setInputValue("export-folder-path", projectDir);
    }
}

function projectFilesFromEditors(): RustSolanaProjectFiles {
    return {
        cargoToml: textAreaValue("cargo-editor"),
        libRs: textAreaValue("lib-editor"),
        mainRs: RustWrapperClass.defaultSolanaMainRs(),
    };
}

async function ensureCargoProjectForAction(projectDir: string): Promise<void> {
    const cargoToml = shellQuoteForUi(joinContainerPath(projectDir, "Cargo.toml"));
    const check = await rust.exec(
        "[ -f " + cargoToml + " ]",
        {
            status: "Checking Cargo.toml in " + projectDir,
            displayCommand: "check Cargo.toml in " + projectDir,
            timeoutMs: 60000,
            streamOutput: false,
        }
    );

    if (check.exitCode === 0) {
        return;
    }

    if (projectDir === DEFAULT_PROJECT_DIR) {
        appendWrapperOutput("Default project was missing; creating it from the editors first.\n\n");
        await rust.createSolanaBinaryCodecProject(projectDir, projectFilesFromEditors(), {
            onStep: (result) => renderResult("", result),
        });
        return;
    }

    throw new Error("Cargo.toml was not found in " + projectDir + ". Import a Rust/Cargo folder there, select another active project directory, or create the demo project first.");
}

async function runUiAction(button: HTMLButtonElement | null, action: () => Promise<void>): Promise<void> {
    const buttons = document.querySelectorAll<HTMLButtonElement>("[data-rust-action]");
    buttons.forEach((candidate) => {
        candidate.disabled = true;
    });

    if (button) {
        button.disabled = true;
    }

    try {
        await action();
    } catch (error) {
        console.error("[rust-wrapper]", {
            type: "ui.action.failed",
            message: error instanceof Error ? error.message : String(error),
            error,
        });
        const message = error instanceof Error ? error.message : String(error);
        setWrapperError(message);
        appendWrapperOutput("\nERROR: " + message + "\n");
    } finally {
        buttons.forEach((candidate) => {
            candidate.disabled = false;
        });
    }
}

function downloadBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function setExportTerminalHidden(hidden: boolean): void {
    if (typeof window.setWasiTerminalHidden === "function") {
        window.setWasiTerminalHidden(hidden);
        return;
    }
    const terminal = document.getElementById("terminal-amd64-debian");
    terminal?.classList.toggle("terminal-hidden", hidden);
}

function clearExportTerminal(): void {
    if (typeof window.clearWasiTerminal === "function") {
        window.clearWasiTerminal();
    }
}

function setRuntimeMountStatus(message: string, isError = false): void {
    const elem = document.getElementById("runtime-mount-status");
    if (elem) {
        elem.textContent = message;
        elem.className = "status-line " + (isError ? "text-danger" : "text-muted");
    }
}

function runtimeMountPoint(): string {
    return inputValue("runtime-mount-point");
}

async function runRuntimeMountAction(button: HTMLButtonElement | null, action: () => Promise<void>): Promise<void> {
    const buttons = document.querySelectorAll<HTMLButtonElement>("[data-runtime-action]");
    buttons.forEach((candidate) => {
        candidate.disabled = true;
    });
    if (button) {
        button.disabled = true;
    }

    try {
        await action();
    } catch (error) {
        console.error("[runtime-mount]", {
            type: "runtime.mount.failed",
            message: error instanceof Error ? error.message : String(error),
            error,
        });
        const message = error instanceof Error ? error.message : String(error);
        setRuntimeMountStatus(message, true);
        setWrapperError(message);
        appendWrapperOutput("\nERROR: " + message + "\n");
    } finally {
        buttons.forEach((candidate) => {
            candidate.disabled = false;
        });
    }
}

function mountInfoLine(info: WasiBrowserMountInfo): string {
    if (info.kind === "none") {
        return "No browser mounts configured.";
    }
    const restart = info.runtimeRestarted
        ? " Container restarted to apply the preopen."
        : " Mount will be applied on the next container start.";
    return info.label + " mounted at " + info.mountPoint + "." + restart;
}

function renderRuntimeMountInfo(title: string, info: WasiBrowserMountInfo): void {
    const line = mountInfoLine(info);
    appendWrapperOutput(title + "\n" + line + "\nConfigured browser mount count: " + info.mountCount + "\n\n");
    setRuntimeMountStatus(line);
    setWrapperStatus(line);
}

function refreshRuntimeMountStatus(): void {
    const mounts = typeof window.getWasiBrowserMounts === "function" ? window.getWasiBrowserMounts() : [];
    if (mounts.length === 0) {
        setRuntimeMountStatus("No browser mounts configured.");
        return;
    }
        setRuntimeMountStatus(mounts.map((mount) => mount.label + " -> " + mount.mountPoint).join("; "));
}

function importFileListSample(files: FileList, limit = 20): string[] {
    return Array.from(files)
        .slice(0, limit)
        .map((file) => {
            const withWebkitPath = file as File & { webkitRelativePath?: string };
            return withWebkitPath.webkitRelativePath || file.name || "(unnamed file)";
        });
}

function logImportFolderSelection(input: HTMLInputElement): void {
    const files = input.files;
    if (!files || files.length === 0) {
        console.info("[rust-wrapper]", {
            type: "folder.import.selection",
            fileCount: 0,
        });
        setWrapperStatus("No import folder selected yet.");
        return;
    }

    const sample = importFileListSample(files);
    console.info("[rust-wrapper]", {
        type: "folder.import.selection",
        fileCount: files.length,
        sample,
    });
    setWrapperStatus("Selected " + files.length + " file(s) for import. First path: " + sample[0]);
}

function importFolderSelfCheckCommand(destination: string): string {
    const qDest = shellQuoteForUi(destination);
    return [
        "if [ ! -d " + qDest + " ]; then",
        "    printf 'SELF CHECK FAILED: directory not found: %s\\n' " + qDest,
        "    exit 1",
        "fi",
        "__rust_wrapper_count=$(cd " + qDest + " && find . -mindepth 1 -maxdepth 4 -print | wc -l | tr -d '[:space:]')",
        "printf 'SELF CHECK OK: directory exists: %s\\n' " + qDest,
        "printf 'SELF CHECK ENTRY COUNT (max depth 4): %s\\n' \"$__rust_wrapper_count\"",
        "printf 'SELF CHECK CONTENTS (first 200 entries):\\n'",
        "cd " + qDest + " && find . -mindepth 1 -maxdepth 4 -print | sed 's#^\\./##' | sort | sed -n '1,200p'",
        "if [ \"$__rust_wrapper_count\" = \"0\" ]; then",
        "    printf 'SELF CHECK FAILED: no visible entries under %s\\n' " + qDest,
        "    exit 1",
        "fi",
    ].join("\n");
}

async function loadCargoEditor(projectDir: string, announce = true): Promise<void> {
    const content = await rust.readCargoFile(projectDir, {
        status: "Loading Cargo.toml from " + projectDir,
        displayCommand: "load Cargo.toml from " + projectDir,
        timeoutMs: 60000,
    });
    setTextAreaValue("cargo-editor", content);
    if (announce) {
        appendWrapperOutput("Loaded Cargo.toml from " + projectDir + ".\n\n");
    }
}

async function loadRustEditor(projectDir: string, relativePath: string, announce = true): Promise<void> {
    const content = await rust.readRustFile(projectDir, relativePath, {
        status: "Loading " + relativePath + " from " + projectDir,
        displayCommand: "load " + relativePath + " from " + projectDir,
        timeoutMs: 60000,
    });
    setInputValue("rust-file-path", relativePath);
    setTextAreaValue("lib-editor", content);
    if (announce) {
        appendWrapperOutput("Loaded " + relativePath + " from " + projectDir + ".\n\n");
    }
}

async function tryLoadImportedRustProject(projectDir: string): Promise<string[]> {
    const loaded: string[] = [];
    try {
        await loadCargoEditor(projectDir, false);
        loaded.push("Cargo.toml");
    } catch (error) {
        console.info("[rust-wrapper]", {
            type: "cargo.load.skipped",
            projectDir,
            message: error instanceof Error ? error.message : String(error),
        });
    }

    const candidates = Array.from(new Set([rustFileRelativePathOrDefault(), "src/lib.rs", "src/main.rs"]));
    for (const candidate of candidates) {
        try {
            await loadRustEditor(projectDir, candidate, false);
            loaded.push(candidate);
            break;
        } catch (error) {
            console.info("[rust-wrapper]", {
                type: "rust_source.load.skipped",
                projectDir,
                relativePath: candidate,
                message: error instanceof Error ? error.message : String(error),
            });
        }
    }
    return loaded;
}

document.getElementById("import-folder-input")?.addEventListener("change", (event) => {
    const input = event.currentTarget;
    if (input instanceof HTMLInputElement) {
        logImportFolderSelection(input);
    }
});

document.getElementById("use-import-dest-as-project-button")?.addEventListener("click", () => {
    const dest = inputValue("import-folder-dest");
    setActiveProjectDir(dest);
    setWrapperStatus("Active Cargo project directory set to " + dest + ".");
});

const rust = new RustWrapperClass({
    onStatus: setWrapperStatus,
});
window.rustContainer = rust;

setTextAreaValue("cargo-editor", RustWrapperClass.defaultSolanaCargoToml());
setTextAreaValue("lib-editor", RustWrapperClass.defaultSolanaLibRs());
setTextAreaValue("main-editor", RustWrapperClass.defaultSolanaMainRs());

type C2WProjectTabId = "cargo" | "lib" | "main";

interface C2WProjectEditorTab {
    id: C2WProjectTabId;
    label: string;
    path: string;
    defaultContent: string;
}

const C2W_PROJECT_EDITOR_STORAGE_KEY = "c2w-rust-project-editor-tabs-v1";
const C2W_PROJECT_EDITOR_ACTIVE_TAB_KEY = "c2w-rust-project-editor-active-tab-v1";
const C2W_PROJECT_EDITOR_FETCH_HASH_PREFIX = "c2w-rust-project-editor-fetched-cargo-hash:";

const C2W_PROJECT_EDITOR_TABS: C2WProjectEditorTab[] = [
    {
        id: "cargo",
        label: "Cargo.toml",
        path: "Cargo.toml",
        defaultContent: RustWrapperClass.defaultSolanaCargoToml(),
    },
    {
        id: "lib",
        label: "src/lib.rs",
        path: "src/lib.rs",
        defaultContent: RustWrapperClass.defaultSolanaLibRs(),
    },
    {
        id: "main",
        label: "src/main.rs",
        path: "src/main.rs",
        defaultContent: RustWrapperClass.defaultSolanaMainRs(),
    },
];

function c2wProjectDefaultState(): Record<C2WProjectTabId, string> {
    return {
        cargo: RustWrapperClass.defaultSolanaCargoToml(),
        lib: RustWrapperClass.defaultSolanaLibRs(),
        main: RustWrapperClass.defaultSolanaMainRs(),
    };
}

function c2wProjectReadStoredState(): Record<C2WProjectTabId, string> {
    const defaults = c2wProjectDefaultState();
    try {
        const raw = localStorage.getItem(C2W_PROJECT_EDITOR_STORAGE_KEY);
        if (!raw) {
            return defaults;
        }
        const parsed = JSON.parse(raw) as Partial<Record<C2WProjectTabId, unknown>>;
        return {
            cargo: typeof parsed.cargo === "string" ? parsed.cargo : defaults.cargo,
            lib: typeof parsed.lib === "string" ? parsed.lib : defaults.lib,
            main: typeof parsed.main === "string" ? parsed.main : defaults.main,
        };
    } catch {
        return defaults;
    }
}

function c2wProjectReadStoredActiveTab(): C2WProjectTabId {
    try {
        const candidate = localStorage.getItem(C2W_PROJECT_EDITOR_ACTIVE_TAB_KEY);
        if (candidate && C2W_PROJECT_EDITOR_TABS.some((tab) => tab.id === candidate)) {
            return candidate as C2WProjectTabId;
        }
    } catch {
        return "lib";
    }
    return "lib";
}

function c2wProjectWriteStoredState(state: Record<C2WProjectTabId, string>): void {
    try {
        localStorage.setItem(C2W_PROJECT_EDITOR_STORAGE_KEY, JSON.stringify(state));
    } catch {
        // Ignore persistence failures; the in-memory editor remains usable.
    }
}

function c2wProjectWriteStoredActiveTab(tabId: C2WProjectTabId): void {
    try {
        localStorage.setItem(C2W_PROJECT_EDITOR_ACTIVE_TAB_KEY, tabId);
    } catch {
        // Ignore persistence failures.
    }
}

function c2wProjectHashText(value: string): string {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
}

function c2wProjectResultText(result: RustCommandResult): string {
    return outputForDisplay(result.stdout || result.stderr || result.rawOutput || "");
}

function c2wProjectAssertSucceeded(result: RustCommandResult, action: string): void {
    if (result.exitCode === 0) {
        return;
    }
    throw new Error("failed to " + action + ":\n" + (result.stderr || result.stdout || "exit code " + result.exitCode));
}

function c2wProjectSetElementText(id: string, message: string, className?: string): void {
    const elem = document.getElementById(id);
    if (!elem) {
        return;
    }
    elem.textContent = message;
    if (className) {
        elem.className = className;
    }
}

function c2wProjectSetStatus(message: string, isError = false): void {
    c2wProjectSetElementText("project-editor-status", message, isError ? "text-danger" : "text-muted");
    if (isError) {
        setWrapperError(message);
    } else {
        setWrapperStatus(message);
    }
}

function c2wProjectSetBusy(isBusy: boolean): void {
    document.querySelectorAll<HTMLButtonElement>("[data-project-editor-action]").forEach((button) => {
        button.disabled = isBusy;
    });
}

function c2wProjectFetchHashKey(projectDir: string): string {
    return C2W_PROJECT_EDITOR_FETCH_HASH_PREFIX + projectDir;
}

function c2wProjectLastFetchedHash(projectDir: string): string | null {
    try {
        return localStorage.getItem(c2wProjectFetchHashKey(projectDir));
    } catch {
        return null;
    }
}

function c2wProjectStoreFetchedHash(projectDir: string, hash: string): void {
    try {
        localStorage.setItem(c2wProjectFetchHashKey(projectDir), hash);
    } catch {
        // Ignore persistence failures.
    }
}

function c2wProjectCompileFailureText(result: RustCompileResult): string {
    const diagnosticText = result.diagnostics
        .map((diagnostic) => diagnostic.rendered || "[" + diagnostic.level + "] " + diagnostic.message)
        .join("\n\n")
        .trim();

    return diagnosticText || result.stderr || result.stdout || "cargo build failed";
}

function initializeC2WProjectEditor(): void {
    const editor = document.getElementById("project-editor");
    if (!(editor instanceof HTMLTextAreaElement)) {
        return;
    }

    let state = c2wProjectReadStoredState();
    let activeTabId = c2wProjectReadStoredActiveTab();

    const activeTab = (): C2WProjectEditorTab => (
        C2W_PROJECT_EDITOR_TABS.find((tab) => tab.id === activeTabId) ?? C2W_PROJECT_EDITOR_TABS[0]
    );

    const projectFiles = (): RustSolanaProjectFiles => ({
        cargoToml: state.cargo,
        libRs: state.lib,
        mainRs: state.main,
    });

    const syncLegacyEditors = (): void => {
        setTextAreaValue("cargo-editor", state.cargo);
        setTextAreaValue("lib-editor", state.lib);
        setTextAreaValue("main-editor", state.main);
    };

    const persist = (): void => {
        c2wProjectWriteStoredState(state);
        syncLegacyEditors();
    };

    const renderTabs = (): void => {
        const tabsElem = document.getElementById("project-editor-tabs");
        if (!tabsElem) {
            return;
        }

        const nodes = C2W_PROJECT_EDITOR_TABS.map((tab) => {
            const button = document.createElement("button");
            button.type = "button";
            button.dataset.projectEditorAction = "true";
            button.className = "editor-tab" + (tab.id === activeTabId ? " active" : "");
            button.textContent = tab.label + (state[tab.id] !== tab.defaultContent ? " *" : "");
            button.addEventListener("click", () => {
                activeTabId = tab.id;
                c2wProjectWriteStoredActiveTab(tab.id);
                render();
            });
            return button;
        });

        tabsElem.replaceChildren(...nodes);
    };

    const renderActiveTab = (): void => {
        const tab = activeTab();
        editor.value = state[tab.id];
        editor.dataset.activeTab = tab.id;
        editor.setAttribute("aria-label", "Project editor for " + tab.path);

        c2wProjectSetElementText("project-editor-active-path", tab.path);
        c2wProjectSetElementText(
            "project-editor-active-state",
            state[tab.id] === tab.defaultContent ? "default" : "edited",
            state[tab.id] === tab.defaultContent ? "badge badge-muted" : "badge badge-warn"
        );

        const resetButton = document.getElementById("reset-current-tab-button");
        if (resetButton instanceof HTMLButtonElement) {
            resetButton.disabled = state[tab.id] === tab.defaultContent;
        }
    };

    const render = (): void => {
        renderTabs();
        renderActiveTab();
    };

    async function writeProjectTabsToContainer(projectDir: string, totalSteps: number, stepIndex: number): Promise<number> {
        const files = projectFiles();
        const steps: Array<{ label: string; run: () => Promise<RustCommandResult>; action: string }> = [
            {
                label: "Write Cargo.toml",
                action: "write Cargo.toml",
                run: () => rust.editCargoFile(projectDir, files.cargoToml ?? "", {
                    step: { current: stepIndex, total: totalSteps, label: "Write Cargo.toml" },
                    displayCommand: "write Cargo.toml",
                }),
            },
            {
                label: "Write src/lib.rs",
                action: "write src/lib.rs",
                run: () => rust.editRustFile(projectDir, "src/lib.rs", files.libRs ?? "", {
                    step: { current: stepIndex + 1, total: totalSteps, label: "Write src/lib.rs" },
                    displayCommand: "write src/lib.rs",
                }),
            },
            {
                label: "Write src/main.rs",
                action: "write src/main.rs",
                run: () => rust.editRustFile(projectDir, "src/main.rs", files.mainRs ?? "", {
                    step: { current: stepIndex + 2, total: totalSteps, label: "Write src/main.rs" },
                    displayCommand: "write src/main.rs",
                }),
            },
        ];

        for (const step of steps) {
            c2wProjectSetStatus(step.label + "...");
            const result = await step.run();
            renderResult(step.label, result);
            c2wProjectAssertSucceeded(result, step.action);
        }

        return stepIndex + steps.length;
    }

    async function runProjectFromEditor(): Promise<void> {
        clearWrapperOutput();
        c2wProjectSetBusy(true);

        try {
            persist();
            const projectDir = currentProjectDir();
            setActiveProjectDir(projectDir);

            const cargoHash = c2wProjectHashText(state.cargo);
            const shouldFetch = c2wProjectLastFetchedHash(projectDir) !== cargoHash;
            const totalSteps = shouldFetch ? 6 : 5;
            let stepIndex = 1;

            appendWrapperOutput("Running c2w project from editor tabs in " + projectDir + "...\n\n");
            stepIndex = await writeProjectTabsToContainer(projectDir, totalSteps, stepIndex);

            if (shouldFetch) {
                c2wProjectSetStatus("Cargo.toml changed; fetching Cargo libraries...");
                const fetch = await rust.fetchLibraries(projectDir, {
                    step: { current: stepIndex, total: totalSteps, label: "Fetch Cargo libraries" },
                    displayCommand: "cargo fetch",
                });
                renderResult("cargo fetch", fetch);
                c2wProjectAssertSucceeded(fetch, "fetch Cargo libraries");
                c2wProjectStoreFetchedHash(projectDir, cargoHash);
                stepIndex += 1;
            } else {
                appendWrapperOutput("Cargo.toml unchanged since last successful fetch; skipping cargo fetch.\n\n");
            }

            c2wProjectSetStatus("Compiling Rust project...");
            const compile = await rust.compile(projectDir, {
                step: { current: stepIndex, total: totalSteps, label: "Compile Rust project" },
                displayCommand: "cargo build --message-format=json",
                messageFormat: "json",
            });
            renderCompileResult(compile);
            stepIndex += 1;

            if (!compile.success) {
                setWrapperError("Compilation failed. Compiler diagnostics are shown below.");
                c2wProjectSetElementText("project-editor-status", "Compilation failed. Fix the tabs and run again.", "text-danger");
                appendWrapperOutput("Compiler diagnostics:\n" + indentOutput(c2wProjectCompileFailureText(compile)) + "\n\n");
                return;
            }

            c2wProjectSetStatus("Running compiled project...");
            const run = await rust.run(projectDir, {
                step: { current: stepIndex, total: totalSteps, label: "Run compiled project" },
                displayCommand: "cargo run --quiet",
            });
            renderResult("cargo run", run);
            c2wProjectAssertSucceeded(run, "run compiled project");

            c2wProjectSetStatus("Project compiled and ran successfully.");
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            setWrapperError(message);
            c2wProjectSetElementText("project-editor-status", message, "text-danger");
            appendWrapperOutput("\nERROR: " + message + "\n");
        } finally {
            c2wProjectSetBusy(false);
        }
    }

    async function downloadProjectZipFromEditor(): Promise<void> {
        clearWrapperOutput();
        clearExportTerminal();
        setExportTerminalHidden(false);
        c2wProjectSetBusy(true);

        try {
            persist();
            const projectDir = currentProjectDir();
            setActiveProjectDir(projectDir);
            appendWrapperOutput("Writing editor tabs before export...\n\n");
            await writeProjectTabsToContainer(projectDir, 4, 1);

            c2wProjectSetStatus("Creating downloadable zip from " + projectDir + "...");
            const exported = await rust.exportFolder(projectDir, {
                step: { current: 4, total: 4, label: "Create project zip" },
                displayCommand: "export project as zip",
            });
            renderResult("export project zip", exported.command);
            downloadBlob(exported.blob, exported.fileName);
            c2wProjectSetStatus("Downloaded " + exported.fileName + ".");
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            setWrapperError(message);
            c2wProjectSetElementText("project-editor-status", message, "text-danger");
            appendWrapperOutput("\nERROR: " + message + "\n");
        } finally {
            c2wProjectSetBusy(false);
        }
    }

    editor.addEventListener("input", () => {
        state = { ...state, [activeTabId]: editor.value };
        persist();
        renderTabs();
        renderActiveTab();
    });

    document.getElementById("reset-current-tab-button")?.addEventListener("click", () => {
        const tab = activeTab();
        state = { ...state, [tab.id]: tab.defaultContent };
        persist();
        render();
        c2wProjectSetStatus("Reset " + tab.path + " to the default template.");
    });

    document.getElementById("reset-all-tabs-button")?.addEventListener("click", () => {
        state = c2wProjectDefaultState();
        persist();
        render();
        c2wProjectSetStatus("Reset all project tabs to defaults.");
    });

    document.getElementById("copy-current-tab-button")?.addEventListener("click", async () => {
        const tab = activeTab();
        try {
            await navigator.clipboard.writeText(state[tab.id]);
            c2wProjectSetStatus("Copied current tab only: " + tab.path + ".");
        } catch {
            c2wProjectSetStatus("Clipboard copy failed; select the current tab text manually.", true);
        }
    });

    document.getElementById("run-project-from-tabs-button")?.addEventListener("click", () => {
        void runProjectFromEditor();
    });

    document.getElementById("download-project-zip-button")?.addEventListener("click", () => {
        void downloadProjectZipFromEditor();
    });

    document.getElementById("project-dir")?.addEventListener("input", () => {
        setInputValue("export-folder-path", currentProjectDir());
    });

    document.getElementById("terminal-send-form")?.addEventListener("submit", (event) => {
        event.preventDefault();
        const input = document.getElementById("terminal-command-input");
        if (!(input instanceof HTMLInputElement)) {
            return;
        }
        const command = input.value.trimEnd();
        if (!command) {
            return;
        }
        const sent = typeof window.sendWasiInput === "function" && window.sendWasiInput(command + "\r");
        if (!sent) {
            c2wProjectSetStatus("The singleton c2w terminal is not ready for input yet.", true);
            return;
        }
        input.value = "";
        c2wProjectSetStatus("Sent command to the singleton c2w terminal.");
    });

    document.getElementById("clear-terminal-button")?.addEventListener("click", () => {
        clearExportTerminal();
        c2wProjectSetStatus("Cleared terminal display and capture.");
    });

    syncLegacyEditors();
    render();
    c2wProjectSetStatus("Ready. Edit Cargo.toml, src/lib.rs, or src/main.rs, then Run project.");
}

initializeC2WProjectEditor();

document.getElementById("run-solana-library-demo")?.addEventListener("click", (event) => {
    const button = event.currentTarget instanceof HTMLButtonElement ? event.currentTarget : null;
    void runUiAction(button, async () => {
        clearWrapperOutput();
        const projectDir = currentProjectDir();
        appendWrapperOutput("Creating Solana-style binary codec library demo in " + projectDir + "...\n\n");
        const demo = await rust.runSolanaBinaryCodecDemo(projectDir, projectFilesFromEditors(), {
            onStep: renderDemoStep,
        });

        if (demo.run) {
            setWrapperStatus("Solana-style binary library demo completed.");
        } else {
            setWrapperError("Compilation failed. Compiler output is available in JavaScript above.");
        }
    });
});

document.getElementById("fetch-libraries-button")?.addEventListener("click", (event) => {
    const button = event.currentTarget instanceof HTMLButtonElement ? event.currentTarget : null;
    void runUiAction(button, async () => {
        clearWrapperOutput();
        const projectDir = currentProjectDir();
        await ensureCargoProjectForAction(projectDir);
        renderResult("", await rust.fetchLibraries(projectDir, {
            step: { current: 1, total: 1, label: "Fetch Cargo libraries" },
        }));
    });
});

document.getElementById("compile-project-button")?.addEventListener("click", (event) => {
    const button = event.currentTarget instanceof HTMLButtonElement ? event.currentTarget : null;
    void runUiAction(button, async () => {
        clearWrapperOutput();
        const projectDir = currentProjectDir();
        await ensureCargoProjectForAction(projectDir);
        const result = await rust.compile(projectDir, {
            step: { current: 1, total: 1, label: "Compile Rust project" },
        });
        renderCompileResult(result);
        if (!result.success) {
            setWrapperError("Compilation failed. Compiler output is available in JavaScript above.");
        }
    });
});

document.getElementById("run-project-button")?.addEventListener("click", (event) => {
    const button = event.currentTarget instanceof HTMLButtonElement ? event.currentTarget : null;
    void runUiAction(button, async () => {
        clearWrapperOutput();
        const projectDir = currentProjectDir();
        await ensureCargoProjectForAction(projectDir);
        renderResult("", await rust.run(projectDir, {
            step: { current: 1, total: 1, label: "Run compiled demo" },
        }));
    });
});

document.getElementById("load-cargo-button")?.addEventListener("click", (event) => {
    const button = event.currentTarget instanceof HTMLButtonElement ? event.currentTarget : null;
    void runUiAction(button, async () => {
        clearWrapperOutput();
        await loadCargoEditor(currentProjectDir());
        setWrapperStatus("Loaded Cargo.toml into the editor.");
    });
});

document.getElementById("edit-cargo-button")?.addEventListener("click", (event) => {
    const button = event.currentTarget instanceof HTMLButtonElement ? event.currentTarget : null;
    void runUiAction(button, async () => {
        clearWrapperOutput();
        const projectDir = currentProjectDir();
        renderResult("", await rust.editCargoFile(projectDir, textAreaValue("cargo-editor"), {
            step: { current: 1, total: 1, label: "Write Cargo.toml" },
        }));
    });
});

document.getElementById("load-rust-file-button")?.addEventListener("click", (event) => {
    const button = event.currentTarget instanceof HTMLButtonElement ? event.currentTarget : null;
    void runUiAction(button, async () => {
        clearWrapperOutput();
        const relativePath = currentRustFileRelativePath();
        await loadRustEditor(currentProjectDir(), relativePath);
        setWrapperStatus("Loaded " + relativePath + " into the editor.");
    });
});

document.getElementById("edit-lib-button")?.addEventListener("click", (event) => {
    const button = event.currentTarget instanceof HTMLButtonElement ? event.currentTarget : null;
    void runUiAction(button, async () => {
        clearWrapperOutput();
        const projectDir = currentProjectDir();
        const relativePath = currentRustFileRelativePath();
        renderResult("", await rust.editRustFile(projectDir, relativePath, textAreaValue("lib-editor"), {
            step: { current: 1, total: 1, label: "Write " + relativePath },
        }));
    });
});

document.getElementById("import-folder-button")?.addEventListener("click", (event) => {
    const button = event.currentTarget instanceof HTMLButtonElement ? event.currentTarget : null;
    void runUiAction(button, async () => {
        const input = document.getElementById("import-folder-input");
        if (!(input instanceof HTMLInputElement) || !input.files || input.files.length === 0) {
            throw new Error("choose a folder to import first");
        }

        clearWrapperOutput();
        const dest = inputValue("import-folder-dest");
        const sample = importFileListSample(input.files);
        console.info("[rust-wrapper]", {
            type: "folder.import.click",
            destination: dest,
            expectedLocation: dest,
            fileCount: input.files.length,
            sample,
        });
        appendWrapperOutput([
            "Import selected browser folder",
            "Destination inside container: " + dest,
            "Selected file count: " + input.files.length,
            "Selected paths (first " + sample.length + "):",
            ...sample.map((path) => "  " + path),
            "",
        ].join("\n"));
        const results = await rust.importFolder(input.files, dest);
        const summary = results[results.length - 1];
        renderResult("import folder", summary);

        const selfCheck = await rust.exec(importFolderSelfCheckCommand(dest), {
            status: "Self-checking imported folder at " + dest,
            displayCommand: "self-check imported folder " + dest,
            timeoutMs: 60000,
        });
        renderResult("import self-check", selfCheck);
        if (selfCheck.exitCode !== 0) {
            throw new Error("import self-check failed:\n" + (selfCheck.stderr || selfCheck.stdout || "exit code " + selfCheck.exitCode));
        }

        console.info("[rust-wrapper]", {
            type: "folder.import.self_check_completed",
            destination: dest,
            output: selfCheck.stdout,
        });
        setActiveProjectDir(dest);
        const loadedEditors = await tryLoadImportedRustProject(dest);
        const loadedSuffix = loadedEditors.length > 0 ? " Loaded " + loadedEditors.join(" and ") + " into the editors." : "";
        setWrapperStatus("Imported " + input.files.length + " file(s) into " + dest + ", verified its contents in " + resultDuration(summary) + ", and set it as the active Cargo project directory." + loadedSuffix);
    });
});

document.getElementById("export-folder-button")?.addEventListener("click", (event) => {
    const button = event.currentTarget instanceof HTMLButtonElement ? event.currentTarget : null;
    void runUiAction(button, async () => {
        clearWrapperOutput();
        clearExportTerminal();
        setExportTerminalHidden(false);
        setWrapperStatus("Exporting .zip archive from the container filesystem; zip progress is visible in the terminal and archive readback uses direct WASI staging when available...");
        try {
            const exported = await rust.exportFolder(inputValue("export-folder-path"));
            renderResult("export folder", exported.command);
            downloadBlob(exported.blob, exported.fileName);
            setWrapperStatus("Exported " + exported.fileName + " in " + resultDuration(exported.command) + ".");
        } finally {
            setExportTerminalHidden(false);
        }
    });
});

document.getElementById("mount-local-folder-button")?.addEventListener("click", (event) => {
    const button = event.currentTarget instanceof HTMLButtonElement ? event.currentTarget : null;
    void runRuntimeMountAction(button, async () => {
        clearWrapperOutput();
        const mountFn = window.mountLocalDirectoryForWasi;
        if (typeof mountFn !== "function") {
            throw new Error("browser WASI mount support failed to load");
        }

        setRuntimeMountStatus("Waiting for browser folder picker...");
        const info = await mountFn(runtimeMountPoint(), { mode: "read" });
        renderRuntimeMountInfo("Configured browser folder mount", info);
    });
});

document.getElementById("clear-local-mounts-button")?.addEventListener("click", (event) => {
    const button = event.currentTarget instanceof HTMLButtonElement ? event.currentTarget : null;
    void runRuntimeMountAction(button, async () => {
        clearWrapperOutput();
        const clearFn = window.clearWasiBrowserMounts;
        if (typeof clearFn !== "function") {
            throw new Error("browser WASI mount support failed to load");
        }

        const info = await clearFn();
        renderRuntimeMountInfo("Cleared browser mounts", info);
    });
});

refreshRuntimeMountStatus();

const runtimeSearch = effectiveRuntimeSearch();
const workerUrl = new URL("./dist/worker.js" + runtimeSearch, document.baseURI).href;
const RELEASE_ASSET_TAG = releaseAssetTag();
const RELEASE_REPOSITORY = "advanced-rust-book/c2w-rust-project-editor";
const CARGO_CACHE_ASSET_FILE = "amd64-debian-wasi-cargo-cache.tar.gz";
const RELEASE_ASSET_BASE = releaseAssetBaseUrl();
const imagePrefix = new URL("amd64-debian-wasi-container", RELEASE_ASSET_BASE).href;
const manifestUrl = new URL("amd64-debian-wasi-container.manifest.json", RELEASE_ASSET_BASE).href;

function releaseAssetBaseUrl(): string {
    const override = new URLSearchParams(location.search).get("containerBase");
    const base = override && override.trim()
        ? override.trim()
        : new URL("./release-assets/" + RELEASE_ASSET_TAG + "/", document.baseURI).href;
    return base.endsWith("/") ? base : base + "/";
}

function releaseAssetTag(): string {
    const override = new URLSearchParams(location.search).get("releaseTag");
    return override && override.trim() ? override.trim() : "1.0.1";
}

function githubReleaseAssetUrl(fileName: string): string {
    return "https://github.com/" + RELEASE_REPOSITORY + "/releases/download/" + encodeURIComponent(RELEASE_ASSET_TAG) + "/" + fileName;
}

window.c2wRustReleaseTag = RELEASE_ASSET_TAG;
window.c2wRustLibraryCacheUrl = githubReleaseAssetUrl(CARGO_CACHE_ASSET_FILE);
window.c2wRustLibraryCacheKey = RELEASE_ASSET_TAG + ":" + CARGO_CACHE_ASSET_FILE;

if (typeof window.startWasiFromManifest === "function") {
    window.startWasiFromManifest("terminal-amd64-debian", workerUrl, imagePrefix, manifestUrl);
} else {
    const statusElem = document.getElementById("terminal-amd64-debian-status");
    if (statusElem) {
        statusElem.textContent = "Browser runtime failed to load.";
        statusElem.className = "text-danger";
    }
}
