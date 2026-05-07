namespace C2WRustEditor {
    export type ProjectTabKind = "cargo" | "rust" | "text";
    export type LogLevel = "info" | "warn" | "error";

    export interface ProjectTab {
        id: string;
        label: string;
        path: string;
        defaultContent: string;
        kind?: ProjectTabKind;
    }

    export interface ProjectConfig {
        id: string;
        title: string;
        description?: string;
        projectDir: string;
        tabs: ProjectTab[];
        activeTabId?: string;
    }

    export interface SharedTerminalOptions {
        statusElement?: string | HTMLElement;
        terminalElement?: string | HTMLElement;
        onStatus?: (message: string, isError: boolean) => void;
    }

    export interface ProjectEditorOptions {
        root: string | HTMLElement;
        runtime: RustContainerWrapper;
        terminal: SharedTerminalBridge;
        project: ProjectConfig;
        storageKey?: string;
        onStatus?: (message: string, isError: boolean, editor: ProjectEditor) => void;
        onResult?: (title: string, result: RustCommandResult, editor: ProjectEditor) => void;
        onActivate?: (editor: ProjectEditor) => void;
    }

    interface LogEntry {
        at: number;
        level: LogLevel;
        message: string;
    }

    type ActionIcon = "load" | "copy" | "reset" | "reset-all" | "download" | "run";

    const TERMINAL_TAB_ID = "__c2w_terminal";
    const AUTOSAVE_DELAY_MS = 700;
    const RUNTIME_READY_POLL_MS = 500;

    let globalEditorTaskQueue: Promise<void> = Promise.resolve();
    let globalRunOwner: ProjectEditor | undefined;
    let globalRunLabel = "";
    const mountedEditors = new Set<ProjectEditor>();

    function isInitialSyncBlocking(): boolean {
        for (const editor of mountedEditors) {
            if (!editor.isInitialSyncComplete()) {
                return true;
            }
        }
        return false;
    }

    function refreshAllEditorRunState(): void {
        for (const editor of mountedEditors) {
            editor.refreshGlobalRunState();
        }
    }

    const RUST_KEYWORDS = new Set([
        "as", "async", "await", "break", "const", "continue", "crate", "dyn", "else", "enum",
        "extern", "false", "fn", "for", "if", "impl", "in", "let", "loop", "match", "mod",
        "move", "mut", "pub", "ref", "return", "self", "Self", "static", "struct", "super",
        "trait", "true", "type", "unsafe", "use", "where", "while",
    ]);

    const RUST_TYPES = new Set([
        "Arc", "Box", "BTreeMap", "BTreeSet", "Cell", "HashMap", "HashSet", "Option", "Rc",
        "RefCell", "Result", "String", "Vec", "VecDeque", "bool", "char", "f32", "f64",
        "i8", "i16", "i32", "i64", "i128", "isize", "str", "u8", "u16", "u32", "u64",
        "u128", "usize",
    ]);

    export class SharedTerminalBridge {
        private activeProjectDir = "";
        private activeProjectApplied = false;
        private readonly statusElement?: HTMLElement;
        private readonly terminalElement?: HTMLElement;
        private readonly originalTerminalParent?: Node;
        private readonly originalTerminalNextSibling?: Node | null;
        private currentDockTarget?: HTMLElement;
        private currentUndockFn?: () => void;
        private readonly onStatusFn?: (message: string, isError: boolean) => void;

        constructor(options: SharedTerminalOptions = {}) {
            this.statusElement = resolveOptionalElement(options.statusElement);
            this.terminalElement = resolveOptionalElement(options.terminalElement) || resolveOptionalElement("#terminal-amd64-debian");
            this.originalTerminalParent = this.terminalElement?.parentNode || undefined;
            this.originalTerminalNextSibling = this.terminalElement?.nextSibling || null;
            this.onStatusFn = options.onStatus;
        }

        get activeProject(): string {
            return this.activeProjectDir;
        }

        selectProject(projectDir: string, label?: string): boolean {
            const cleanDir = projectDir.trim();
            if (!cleanDir) {
                this.setStatus("Choose a project directory before activating the terminal.", true);
                return false;
            }

            this.activeProjectDir = cleanDir;
            this.activeProjectApplied = false;
            const target = label ? label + " at " + cleanDir : cleanDir;
            this.setStatus("Terminal target: " + target + ".");
            return true;
        }

        activateProject(projectDir: string, label?: string, force = false): boolean {
            const cleanDir = projectDir.trim();
            if (!cleanDir) {
                this.setStatus("Choose a project directory before activating the terminal.", true);
                return false;
            }
            if (!force && this.activeProjectDir === cleanDir && this.activeProjectApplied) {
                return true;
            }

            this.activeProjectDir = cleanDir;
            const sent = this.sendLine("mkdir -p " + shellQuote(cleanDir) + " && cd " + shellQuote(cleanDir) + " && pwd");
            this.activeProjectApplied = sent;
            const target = label ? label + " at " + cleanDir : cleanDir;
            if (sent) {
                this.setStatus("Terminal target: " + target + ".");
            } else {
                this.setStatus("Terminal target set to " + target + "; the c2w terminal is still starting.", true);
            }
            return sent;
        }

        sendLine(command: string): boolean {
            const cleanCommand = command.trimEnd();
            if (!cleanCommand) {
                return true;
            }
            return typeof window.sendWasiInput === "function" && window.sendWasiInput(cleanCommand + "\r");
        }

        clear(): void {
            if (typeof window.clearWasiTerminal === "function") {
                window.clearWasiTerminal();
                this.setStatus("Cleared the singleton c2w terminal.");
            }
        }

        read(): string {
            return typeof window.readWasiTerminalText === "function" ? window.readWasiTerminalText() : "";
        }

        isReady(): boolean {
            return typeof window.sendWasiInput === "function" && Boolean(window.activeWasiTerminal?.xterm);
        }

        isDocked(): boolean {
            return Boolean(this.currentDockTarget);
        }

        dockTerminal(target: HTMLElement, onUndock?: () => void): boolean {
            if (!this.terminalElement) {
                this.setStatus("The singleton c2w terminal element is not available.", true);
                return false;
            }
            if (this.currentDockTarget && this.currentDockTarget !== target) {
                const undock = this.currentUndockFn;
                this.currentDockTarget = undefined;
                this.currentUndockFn = undefined;
                undock?.();
            }
            if (this.terminalElement.parentElement !== target) {
                target.replaceChildren(this.terminalElement);
            }
            if (this.originalTerminalParent instanceof HTMLElement && this.originalTerminalParent !== target) {
                this.originalTerminalParent.classList.add("c2w-terminal-undocked");
            }
            this.currentDockTarget = target;
            this.currentUndockFn = onUndock;
            this.fitTerminal(target);
            this.focus();
            return true;
        }

        releaseTerminal(target?: HTMLElement): void {
            if (target && this.currentDockTarget !== target) {
                return;
            }
            this.currentDockTarget = undefined;
            this.currentUndockFn = undefined;
            if (this.originalTerminalParent instanceof HTMLElement) {
                this.originalTerminalParent.classList.remove("c2w-terminal-undocked");
            }
            if (!this.terminalElement || !this.originalTerminalParent) {
                return;
            }
            if (this.terminalElement.parentNode === this.originalTerminalParent) {
                return;
            }
            if (this.originalTerminalNextSibling && this.originalTerminalNextSibling.parentNode === this.originalTerminalParent) {
                this.originalTerminalParent.insertBefore(this.terminalElement, this.originalTerminalNextSibling);
            } else {
                this.originalTerminalParent.appendChild(this.terminalElement);
            }
            if (this.originalTerminalParent instanceof HTMLElement) {
                this.fitTerminal(this.originalTerminalParent);
            }
        }

        focus(): void {
            if (this.currentDockTarget) {
                this.fitTerminal(this.currentDockTarget);
            }
            window.activeWasiTerminal?.xterm.focus?.();
        }

        private fitTerminal(target: HTMLElement): void {
            const fitOnce = (): void => {
                const xterm = window.activeWasiTerminal?.xterm;
                if (!xterm || typeof xterm.resize !== "function") {
                    return;
                }
                const container = this.terminalElement || target;
                const style = window.getComputedStyle(container);
                const width = container.clientWidth - toPixels(style.paddingLeft) - toPixels(style.paddingRight);
                const height = container.clientHeight - toPixels(style.paddingTop) - toPixels(style.paddingBottom);
                const cell = measureTerminalCell(container);
                const cellWidth = cell.width;
                const cellHeight = cell.height;
                const cols = Math.max(20, Math.floor(width / cellWidth));
                const rows = Math.max(8, Math.floor(height / cellHeight));
                try {
                    xterm.resize(cols, rows);
                } catch {
                    // Some xterm builds reject resize during their initial open pass; the delayed fits retry.
                }
            };

            window.requestAnimationFrame(fitOnce);
            for (const delay of [80, 250, 600, 1200]) {
                window.setTimeout(fitOnce, delay);
            }
        }

        private setStatus(message: string, isError = false): void {
            if (this.statusElement) {
                this.statusElement.textContent = message;
                const base = this.statusElement.classList.contains("status-line") ? "status-line " : "";
                this.statusElement.className = base + (isError ? "text-danger" : "text-muted");
            }
            if (this.onStatusFn) {
                this.onStatusFn(message, isError);
            }
        }
    }

    export class ProjectEditor {
        private readonly root: HTMLElement;
        private readonly runtime: RustContainerWrapper;
        private readonly terminal: SharedTerminalBridge;
        private readonly options: ProjectEditorOptions;
        private readonly tabs: ProjectTab[];
        private readonly storagePrefix: string;
        private state: Record<string, string>;
        private activeTabId: string;
        private busy = false;
        private logs: LogEntry[] = [];
        private shell?: HTMLElement;
        private tabsElement?: HTMLElement;
        private titleElement?: HTMLElement;
        private activePathElement?: HTMLElement;
        private activeStateElement?: HTMLElement;
        private projectDirInput?: HTMLInputElement;
        private codeBody?: HTMLElement;
        private terminalPane?: HTMLElement;
        private terminalDock?: HTMLElement;
        private lowerPane?: HTMLElement;
        private textarea?: HTMLTextAreaElement;
        private highlightCode?: HTMLElement;
        private lineNumbersInner?: HTMLElement;
        private outputElement?: HTMLElement;
        private eventElement?: HTMLElement;
        private resetTabButton?: HTMLButtonElement;
        private actionButtons: HTMLButtonElement[] = [];
        private autosaveTimer: number | undefined;
        private readonly pendingAutosaveTabIds = new Set<string>();
        private initialUploadQueued = false;
        private initialUploadComplete = false;
        private readyPollTimer: number | undefined;
        private lastFileTabId: string;
        private readonly uploadedTabHashes: Record<string, string> = {};

        constructor(options: ProjectEditorOptions) {
            this.root = resolveElement(options.root, "project editor root");
            this.runtime = options.runtime;
            this.terminal = options.terminal;
            this.options = options;
            this.tabs = normalizeTabs(options.project.tabs);
            this.storagePrefix = options.storageKey || "c2w-rust-editor:" + options.project.id + ":v1";
            this.state = this.readStoredState();
            this.activeTabId = this.readStoredActiveTab();
            this.lastFileTabId = this.activeTabId === TERMINAL_TAB_ID ? this.tabs[0].id : this.activeTabId;
        }

        get id(): string {
            return this.options.project.id;
        }

        get projectDir(): string {
            return this.projectDirInput?.value.trim() || this.options.project.projectDir;
        }

        get activeTab(): ProjectTab {
            return this.tabs.find((tab) => tab.id === this.activeTabId) || this.tabs[0];
        }

        mount(): void {
            mountedEditors.add(this);
            this.root.textContent = "";
            this.root.classList.add("c2w-editor-host");

            const shell = element("article", "c2w-editor-card");
            shell.tabIndex = 0;
            shell.addEventListener("focusin", () => this.activate());
            shell.addEventListener("pointerdown", () => this.activate());
            this.shell = shell;

            const intro = element("div", "c2w-editor-intro");
            const copy = element("div", "c2w-editor-copy");
            this.titleElement = element("h2", "", this.options.project.title);
            const description = element("p", "", this.options.project.description || "");
            copy.append(this.titleElement, description);

            const dirLabel = element("label", "c2w-editor-dir");
            dirLabel.append(element("span", "", "Project folder"));
            const dirInput = document.createElement("input");
            dirInput.value = this.readStoredProjectDir();
            dirInput.spellcheck = false;
            dirInput.addEventListener("input", () => {
                this.writeStoredProjectDir(dirInput.value);
                this.activate();
            });
            this.projectDirInput = dirInput;
            dirLabel.append(dirInput);
            intro.append(copy, dirLabel);

            const frame = element("div", "c2w-code-frame");
            const header = element("div", "c2w-code-header");
            const headerLeft = element("div", "c2w-code-header-left");
            const dots = element("span", "c2w-window-dots");
            dots.append(element("i", "dot-red"), element("i", "dot-yellow"), element("i", "dot-green"));
            this.activePathElement = element("span", "c2w-code-path");
            this.activeStateElement = element("span", "c2w-code-badge", "editable");
            headerLeft.append(dots, this.activePathElement, this.activeStateElement);

            const headerActions = element("div", "c2w-code-actions");
            const loadButton = this.actionButton("Load", "load", "Load tabs from container files", () => void this.loadFromContainer());
            const copyButton = this.actionButton("Copy", "copy", "Copy current tab only", () => void this.copyActiveTab());
            this.resetTabButton = this.actionButton("Reset", "reset", "Reset current tab to default", () => this.resetActiveTab());
            const resetAllButton = this.actionButton("Reset all", "reset-all", "Reset every tab to defaults", () => this.resetAllTabs());
            const downloadButton = this.actionButton("Zip", "download", "Download complete project as zip", () => void this.downloadZip());
            const runButton = this.actionButton("Run", "run", "Write, fetch, compile, and run in c2w", () => void this.runProject(), "primary");
            headerActions.append(loadButton, copyButton, this.resetTabButton, resetAllButton, downloadButton, runButton);
            header.append(headerLeft, headerActions);

            this.tabsElement = element("div", "c2w-tabs");

            const codeBody = element("div", "c2w-code-body");
            this.codeBody = codeBody;
            const lineNumbers = element("div", "c2w-line-numbers");
            this.lineNumbersInner = element("div", "c2w-line-numbers-inner");
            lineNumbers.append(this.lineNumbersInner);

            const stack = element("div", "c2w-code-stack");
            const highlight = element("pre", "c2w-highlight");
            this.highlightCode = element("code", "c2w-highlight-code");
            highlight.append(this.highlightCode);
            const textarea = document.createElement("textarea");
            textarea.className = "c2w-source";
            textarea.spellcheck = false;
            textarea.autocomplete = "off";
            textarea.setAttribute("autocapitalize", "off");
            textarea.setAttribute("autocorrect", "off");
            textarea.wrap = "off";
            textarea.addEventListener("input", () => this.updateActiveContent(textarea.value));
            textarea.addEventListener("scroll", () => this.syncScroll());
            textarea.addEventListener("keydown", (event) => this.handleKeyDown(event));
            textarea.addEventListener("focus", () => this.activate());
            this.textarea = textarea;
            stack.append(highlight, textarea);
            codeBody.append(lineNumbers, stack);

            const terminalPane = this.createTerminalPane();
            this.terminalPane = terminalPane;
            frame.append(header, this.tabsElement, codeBody, terminalPane);

            const lower = element("div", "c2w-editor-lower");
            this.lowerPane = lower;
            const outputPanel = element("section", "c2w-run-panel");
            outputPanel.append(element("h3", "", "Run output"));
            this.outputElement = element("pre", "c2w-run-output", "No run yet.");
            outputPanel.append(this.outputElement);
            const eventPanel = element("section", "c2w-run-panel");
            eventPanel.append(element("h3", "", "Events and logs"));
            this.eventElement = element("pre", "c2w-event-log", "Ready.");
            eventPanel.append(this.eventElement);
            lower.append(outputPanel, eventPanel);

            shell.append(intro, frame, lower);
            this.root.append(shell);
            this.refresh();
            this.startInitialUploadWhenReady();
        }

        activate(): void {
            this.options.onActivate?.(this);
            if (this.isTerminalTabActive()) {
                this.terminal.activateProject(this.projectDir, this.options.project.title);
                this.dockTerminal();
            } else {
                this.terminal.selectProject(this.projectDir, this.options.project.title);
                this.terminal.releaseTerminal(this.terminalDock);
            }
        }

        async runProject(): Promise<void> {
            if (this.busy) {
                return;
            }
            if (isInitialSyncBlocking()) {
                this.setStatus("Wait for the initial c2w project sync to finish before running code.", true);
                return;
            }
            if (!this.beginGlobalRun("Running " + this.options.project.title)) {
                return;
            }
            this.activate();
            this.closeTerminalForCommand();
            this.persist();
            this.setBusy(true);
            this.setOutput("Writing project tabs into " + this.projectDir + "...");
            this.setStatus("Writing files, resolving Cargo changes, compiling, and running...");

            try {
                await this.enqueueEditorTask(async () => {
                    await this.ensureRustEnvironmentReady("running " + this.options.project.title);
                    const cargoTab = this.requireCargoTab();
                    const cargoHash = hashText(this.state[cargoTab.id]);
                    const shouldFetch = this.lastFetchedCargoHash() !== cargoHash;
                    const totalSteps = this.tabs.length + (shouldFetch ? 1 : 0) + 2;
                    let stepIndex = 1;

                    stepIndex = await this.writeTabsToContainer(totalSteps, stepIndex);

                    if (shouldFetch) {
                        this.setStatus("Cargo.toml changed; fetching Cargo libraries...");
                        const fetch = await this.runtime.fetchLibraries(this.projectDir, {
                            step: { current: stepIndex, total: totalSteps, label: "Fetch Cargo libraries" },
                            displayCommand: "cargo fetch",
                        });
                        this.recordResult("cargo fetch", fetch);
                        assertSucceeded(fetch, "fetch Cargo libraries");
                        this.storeFetchedCargoHash(cargoHash);
                        stepIndex += 1;
                    } else {
                        this.addLog("info", "Cargo.toml unchanged since last successful fetch; skipped cargo fetch.");
                    }

                    this.setStatus("Compiling project...");
                    const compile = await this.runtime.compile(this.projectDir, {
                        step: { current: stepIndex, total: totalSteps, label: "Compile Rust project" },
                        displayCommand: "cargo build --message-format=json",
                        messageFormat: "json",
                    });
                    this.recordResult("cargo build", compile);
                    stepIndex += 1;

                    if (!compile.success) {
                        this.setOutput(compileFailureText(compile));
                        this.setStatus("Compilation failed. Fix the current project tabs and run again.", true);
                        return;
                    }

                    this.setStatus("Running project...");
                    const run = await this.runtime.run(this.projectDir, {
                        step: { current: stepIndex, total: totalSteps, label: "Run compiled project" },
                        displayCommand: "cargo run --quiet",
                    });
                    this.recordResult("cargo run", run);
                    assertSucceeded(run, "run compiled project");

                    this.setOutput(resultText(run) || "Program finished successfully with no stdout.");
                    this.setStatus("Project compiled and ran successfully.");
                });
            } catch (error) {
                const message = errorMessage(error);
                this.setOutput(message);
                this.setStatus(message, true);
            } finally {
                this.setBusy(false);
                this.endGlobalRun();
            }
        }

        async downloadZip(): Promise<void> {
            if (this.busy) {
                return;
            }
            this.activate();
            this.persist();
            this.setBusy(true);
            this.setOutput("Writing tabs before creating the zip archive...");
            this.setStatus("Preparing downloadable project zip...");

            try {
                await this.enqueueEditorTask(async () => {
                    await this.ensureRustEnvironmentReady("creating the project zip");
                    await this.writeTabsToContainer(this.tabs.length + 1, 1);
                    const exported = await this.runtime.exportFolder(this.projectDir, {
                        step: { current: this.tabs.length + 1, total: this.tabs.length + 1, label: "Create project zip" },
                        displayCommand: "export project as zip",
                    });
                    this.recordResult("export project zip", exported.command);
                    downloadBlob(exported.blob, exported.fileName);
                    this.setOutput(resultText(exported.command) || "Downloaded " + exported.fileName + ".");
                    this.setStatus("Downloaded " + exported.fileName + ".");
                });
            } catch (error) {
                const message = errorMessage(error);
                this.setOutput(message);
                this.setStatus(message, true);
            } finally {
                this.setBusy(false);
            }
        }

        async loadFromContainer(): Promise<void> {
            if (this.busy) {
                return;
            }
            this.activate();
            this.setBusy(true);
            this.setStatus("Loading visible project tabs from " + this.projectDir + "...");

            try {
                await this.enqueueEditorTask(async () => {
                    const nextState: Record<string, string> = { ...this.state };
                    for (const tab of this.tabs) {
                        if (tabKind(tab) === "cargo") {
                            nextState[tab.id] = await this.runtime.readCargoFile(this.projectDir, {
                                displayCommand: "read Cargo.toml",
                                timeoutMs: 60000,
                            });
                        } else if (tabKind(tab) === "rust") {
                            nextState[tab.id] = await this.runtime.readRustFile(this.projectDir, tab.path, {
                                displayCommand: "read " + tab.path,
                                timeoutMs: 60000,
                            });
                        } else {
                            nextState[tab.id] = await this.runtime.readTextFile(joinPath(this.projectDir, tab.path), {
                                displayCommand: "read " + tab.path,
                                timeoutMs: 60000,
                            });
                        }
                        this.addLog("info", "Loaded " + tab.path + " from the c2w filesystem.");
                    }
                    this.state = nextState;
                    for (const tab of this.tabs) {
                        this.uploadedTabHashes[tab.id] = hashText(nextState[tab.id] ?? "");
                        this.pendingAutosaveTabIds.delete(tab.id);
                    }
                    this.persist();
                    this.refresh();
                    this.setStatus("Loaded project tabs from " + this.projectDir + ".");
                });
            } catch (error) {
                const message = errorMessage(error);
                this.setStatus(message, true);
            } finally {
                this.setBusy(false);
            }
        }

        resetActiveTab(): void {
            if (this.isTerminalTabActive()) {
                this.setStatus("Choose a file tab before resetting the current tab.", true);
                return;
            }
            const tab = this.activeTab;
            this.state = { ...this.state, [tab.id]: tab.defaultContent };
            this.persist();
            this.refresh();
            this.setStatus("Reset " + tab.path + " to its default.");
            this.scheduleAutosave(tab.id);
        }

        resetAllTabs(): void {
            this.state = defaultState(this.tabs);
            this.persist();
            this.refresh();
            this.setOutput("No run yet.");
            this.addLog("info", "Reset every tab to its default content.");
            this.setStatus("Reset all tabs to defaults.");
            this.scheduleAutosave();
        }

        private async copyActiveTab(): Promise<void> {
            if (this.isTerminalTabActive()) {
                this.setStatus("Terminal tab is active; copy is for file tabs only.", true);
                return;
            }
            const tab = this.activeTab;
            const content = this.state[tab.id];
            try {
                await navigator.clipboard.writeText(content);
                this.setStatus("Copied current tab only: " + tab.path + ".");
            } catch {
                this.textarea?.focus();
                this.textarea?.select();
                if (document.execCommand("copy")) {
                    this.setStatus("Copied current tab only: " + tab.path + ".");
                } else {
                    this.setStatus("Clipboard copy failed; select the current tab text manually.", true);
                }
            }
        }

        private async writeTabsToContainer(totalSteps: number, startStep: number): Promise<number> {
            let stepIndex = startStep;
            for (const tab of this.tabs) {
                this.setStatus("Writing " + tab.path + "...");
                const step = { current: stepIndex, total: totalSteps, label: "Write " + tab.path };
                const result = await this.writeTabToContainer(tab, step);
                this.recordResult("write " + tab.path, result);
                assertSucceeded(result, "write " + tab.path);
                stepIndex += 1;
            }
            return stepIndex;
        }

        private writeTabToContainer(tab: ProjectTab, step?: RustProgressStep): Promise<RustCommandResult> {
            const content = this.state[tab.id] ?? "";
            const uploadedHash = hashText(content);
            const markUploaded = (result: RustCommandResult): RustCommandResult => {
                if (result.exitCode === 0 && hashText(this.state[tab.id] ?? "") === uploadedHash) {
                    this.uploadedTabHashes[tab.id] = uploadedHash;
                    this.pendingAutosaveTabIds.delete(tab.id);
                    this.refreshTabs();
                    this.refreshActiveMeta();
                }
                return result;
            };
            if (tabKind(tab) === "cargo") {
                return this.runtime.editCargoFile(this.projectDir, content, {
                    step,
                    displayCommand: "write Cargo.toml",
                    timeoutMs: 900000,
                }).then(markUploaded);
            }
            if (tabKind(tab) === "rust") {
                return this.runtime.editRustFile(this.projectDir, tab.path, content, {
                    step,
                    displayCommand: "write " + tab.path,
                    timeoutMs: 900000,
                }).then(markUploaded);
            }
            return this.runtime.writeTextFile(joinPath(this.projectDir, tab.path), content, {
                step,
                displayCommand: "write " + tab.path,
                timeoutMs: 900000,
            }).then(markUploaded);
        }

        private scheduleAutosave(tabId?: string): void {
            if (tabId) {
                this.pendingAutosaveTabIds.add(tabId);
            } else {
                for (const tab of this.tabs) {
                    this.pendingAutosaveTabIds.add(tab.id);
                }
            }
            if (this.autosaveTimer !== undefined) {
                window.clearTimeout(this.autosaveTimer);
            }
            this.autosaveTimer = window.setTimeout(() => {
                this.autosaveTimer = undefined;
                void this.flushAutosave();
            }, AUTOSAVE_DELAY_MS);
        }

        private async flushAutosave(): Promise<void> {
            if (this.pendingAutosaveTabIds.size === 0) {
                return;
            }
            if (globalRunOwner) {
                this.scheduleAutosaveRetry();
                return;
            }
            if (!this.terminal.isReady()) {
                this.startInitialUploadWhenReady();
                return;
            }
            if (this.terminal.isDocked()) {
                this.scheduleAutosaveRetry();
                return;
            }

            const tabIds = Array.from(this.pendingAutosaveTabIds);
            this.pendingAutosaveTabIds.clear();
            await this.enqueueEditorTask(async () => {
                await this.ensureRustEnvironmentReady("syncing editor files");
                for (const tabId of tabIds) {
                    const tab = this.tabs.find((candidate) => candidate.id === tabId);
                    if (!tab) {
                        continue;
                    }
                    const result = await this.writeTabToContainer(tab);
                    assertSucceeded(result, "autosave " + tab.path);
                    this.addLog("info", "Autosaved " + tab.path + " to " + this.projectDir + ".");
                }
                this.markInitialUploadCompleteIfSynced();
            }).catch((error: unknown) => {
                for (const tabId of tabIds) {
                    this.pendingAutosaveTabIds.add(tabId);
                }
                this.refreshTabs();
                this.refreshActiveMeta();
                const message = errorMessage(error);
                this.setStatus("Autosave failed: " + message, true);
            });
        }

        private startInitialUploadWhenReady(): void {
            if (this.initialUploadQueued && this.pendingAutosaveTabIds.size === 0) {
                return;
            }
            if (this.readyPollTimer !== undefined) {
                return;
            }

            const poll = (): void => {
                this.readyPollTimer = undefined;
                if (!this.terminal.isReady()) {
                    this.readyPollTimer = window.setTimeout(poll, RUNTIME_READY_POLL_MS);
                    return;
                }
                if (!this.initialUploadQueued) {
                    this.initialUploadQueued = true;
                    this.initialUploadComplete = false;
                    for (const tab of this.tabs) {
                        this.pendingAutosaveTabIds.add(tab.id);
                    }
                    this.addLog("info", "c2w terminal is ready; queued initial project upload.");
                    refreshAllEditorRunState();
                }
                void this.flushAutosave();
            };

            this.readyPollTimer = window.setTimeout(poll, RUNTIME_READY_POLL_MS);
        }

        private enqueueEditorTask<T>(operation: () => Promise<T>): Promise<T> {
            const task = globalEditorTaskQueue.then(operation, operation);
            globalEditorTaskQueue = task.then(() => undefined, () => undefined);
            return task;
        }

        private updateActiveContent(value: string): void {
            if (this.isTerminalTabActive()) {
                return;
            }
            const tab = this.activeTab;
            this.state = { ...this.state, [tab.id]: value };
            this.persist();
            this.refreshTabs();
            this.refreshActiveMeta();
            this.refreshCodeDecorations();
            this.scheduleAutosave(tab.id);
        }

        private switchTab(tabId: string): void {
            if (this.activeTabId === tabId) {
                return;
            }
            if (tabId === TERMINAL_TAB_ID && this.isGlobalRunActive()) {
                this.setStatus("Terminal input is paused while " + globalRunLabel + ".", true);
                return;
            }
            const wasTerminalTabActive = this.isTerminalTabActive();
            if (tabId === TERMINAL_TAB_ID && !this.isTerminalTabActive()) {
                this.lastFileTabId = this.activeTabId;
            } else if (this.tabs.some((tab) => tab.id === tabId)) {
                this.lastFileTabId = tabId;
            }
            this.activeTabId = tabId;
            this.writeStoredActiveTab(tabId);
            if (this.isTerminalTabActive()) {
                this.terminal.activateProject(this.projectDir, this.options.project.title, true);
                this.dockTerminal();
                this.setStatus("Terminal tab opened for " + this.projectDir + ".");
            } else {
                this.terminal.releaseTerminal(this.terminalDock);
            }
            this.refresh();
            if (wasTerminalTabActive && !this.isTerminalTabActive()) {
                this.queueProjectSync("Restored the file editor; queued current tabs to sync back into c2w.");
            }
        }

        private refresh(): void {
            const terminalActive = this.isTerminalTabActive();
            this.shell?.classList.toggle("terminal-active", terminalActive);
            const tab = this.activeTab;
            if (this.codeBody) {
                this.codeBody.hidden = terminalActive;
            }
            if (this.terminalPane) {
                this.terminalPane.hidden = !terminalActive;
            }
            if (this.lowerPane) {
                this.lowerPane.hidden = terminalActive;
            }
            if (this.textarea && !terminalActive) {
                this.textarea.value = this.state[tab.id] || "";
                this.textarea.setAttribute("aria-label", "Editor for " + tab.path);
            }
            this.refreshActionButtons();
            this.refreshTabs();
            this.refreshActiveMeta();
            if (terminalActive) {
                this.dockTerminal();
            } else {
                this.refreshCodeDecorations();
            }
            this.refreshEvents();
        }

        private refreshTabs(): void {
            if (!this.tabsElement) {
                return;
            }

            const buttons = this.tabs.map((tab) => {
                const restorable = this.isTabRestorable(tab);
                const unsynced = this.isTabUnsynced(tab);
                const button = document.createElement("button");
                button.type = "button";
                button.className = [
                    "c2w-tab",
                    tab.id === this.activeTabId ? "active" : "",
                    restorable ? "restorable" : "",
                    unsynced ? "unsynced" : "",
                ].filter(Boolean).join(" ");
                button.disabled = this.busy;
                button.title = tab.path + (unsynced ? " - syncing to c2w" : restorable ? " - reset available" : " - synced");
                button.textContent = tab.label + (unsynced ? " •" : "");
                button.addEventListener("click", () => this.switchTab(tab.id));
                return button;
            });
            const terminalButton = document.createElement("button");
            terminalButton.type = "button";
            terminalButton.className = "c2w-tab terminal" + (this.isTerminalTabActive() ? " active" : "");
            terminalButton.disabled = this.busy || this.isGlobalRunActive() || isInitialSyncBlocking();
            terminalButton.title = "Terminal input scoped to " + this.projectDir;
            terminalButton.textContent = "Terminal";
            terminalButton.addEventListener("click", () => this.switchTab(TERMINAL_TAB_ID));
            buttons.push(terminalButton);
            this.tabsElement.replaceChildren(...buttons);
        }

        private refreshActiveMeta(): void {
            if (this.isTerminalTabActive()) {
                if (this.activePathElement) {
                    this.activePathElement.textContent = "terminal: " + this.projectDir;
                }
                if (this.activeStateElement) {
                    this.activeStateElement.textContent = "shared";
                    this.activeStateElement.className = "c2w-code-badge";
                }
                if (this.resetTabButton) {
                    this.resetTabButton.disabled = true;
                }
                return;
            }
            const tab = this.activeTab;
            const restorable = this.isTabRestorable(tab);
            const unsynced = this.isTabUnsynced(tab);
            if (this.activePathElement) {
                this.activePathElement.textContent = tab.path;
            }
            if (this.activeStateElement) {
                this.activeStateElement.textContent = unsynced ? "syncing" : restorable ? "restorable" : "synced";
                this.activeStateElement.className = [
                    "c2w-code-badge",
                    unsynced ? "unsynced" : "",
                    !unsynced && restorable ? "restorable" : "",
                ].filter(Boolean).join(" ");
            }
            if (this.resetTabButton) {
                this.resetTabButton.disabled = this.busy || !restorable;
            }
        }

        private isTabRestorable(tab: ProjectTab): boolean {
            return (this.state[tab.id] ?? "") !== tab.defaultContent;
        }

        private isTabUnsynced(tab: ProjectTab): boolean {
            const currentHash = hashText(this.state[tab.id] ?? "");
            return this.pendingAutosaveTabIds.has(tab.id) || this.uploadedTabHashes[tab.id] !== currentHash;
        }

        isInitialSyncComplete(): boolean {
            return this.initialUploadComplete;
        }

        private markInitialUploadCompleteIfSynced(): void {
            if (!this.initialUploadQueued || this.initialUploadComplete) {
                return;
            }
            const allSynced = this.tabs.every((tab) => !this.isTabUnsynced(tab));
            if (!allSynced) {
                return;
            }
            this.initialUploadComplete = true;
            this.addLog("info", "Initial c2w project sync complete.");
            refreshAllEditorRunState();
        }

        private queueProjectSync(message?: string): void {
            for (const tab of this.tabs) {
                this.pendingAutosaveTabIds.add(tab.id);
            }
            if (message) {
                this.addLog("info", message);
            }
            this.refreshTabs();
            this.refreshActiveMeta();
            void this.flushAutosave();
        }

        private scheduleAutosaveRetry(): void {
            if (this.autosaveTimer !== undefined) {
                return;
            }
            this.autosaveTimer = window.setTimeout(() => {
                this.autosaveTimer = undefined;
                void this.flushAutosave();
            }, RUNTIME_READY_POLL_MS);
        }

        private beginGlobalRun(label: string): boolean {
            if (globalRunOwner && globalRunOwner !== this) {
                this.setStatus("Wait for " + globalRunLabel + " before running this editor.", true);
                return false;
            }
            globalRunOwner = this;
            globalRunLabel = label;
            for (const editor of mountedEditors) {
                editor.closeTerminalForCommand();
                editor.refreshGlobalRunState();
            }
            return true;
        }

        private endGlobalRun(): void {
            if (globalRunOwner !== this) {
                return;
            }
            globalRunOwner = undefined;
            globalRunLabel = "";
            for (const editor of mountedEditors) {
                editor.refreshGlobalRunState();
                void editor.flushAutosave();
            }
        }

        private isGlobalRunActive(): boolean {
            return Boolean(globalRunOwner);
        }

        private closeTerminalForCommand(): void {
            if (!this.isTerminalTabActive()) {
                return;
            }
            this.activeTabId = this.tabs.some((tab) => tab.id === this.lastFileTabId) ? this.lastFileTabId : this.tabs[0].id;
            this.writeStoredActiveTab(this.activeTabId);
            this.terminal.releaseTerminal(this.terminalDock);
            this.refresh();
        }

        refreshGlobalRunState(): void {
            this.refreshActionButtons();
            this.refreshTabs();
        }

        private refreshCodeDecorations(): void {
            const code = this.textarea?.value || "";
            const lineCount = Math.max(1, code.split(/\r?\n/).length);
            if (this.lineNumbersInner) {
                const fragment = document.createDocumentFragment();
                for (let index = 1; index <= lineCount; index += 1) {
                    fragment.append(element("span", "", String(index)));
                }
                this.lineNumbersInner.replaceChildren(fragment);
            }
            if (this.highlightCode) {
                this.highlightCode.innerHTML = highlightCode(code, this.activeTab);
            }
            this.syncScroll();
        }

        private syncScroll(): void {
            if (!this.textarea) {
                return;
            }
            const transform = "translate(" + (-this.textarea.scrollLeft) + "px, " + (-this.textarea.scrollTop) + "px)";
            if (this.highlightCode) {
                this.highlightCode.style.transform = transform;
            }
            if (this.lineNumbersInner) {
                this.lineNumbersInner.style.transform = "translateY(" + (-this.textarea.scrollTop) + "px)";
            }
        }

        private handleKeyDown(event: KeyboardEvent): void {
            if (event.key !== "Tab" || !this.textarea) {
                return;
            }
            event.preventDefault();
            const start = this.textarea.selectionStart;
            const end = this.textarea.selectionEnd;
            const value = this.textarea.value;
            const next = value.slice(0, start) + "    " + value.slice(end);
            this.textarea.value = next;
            this.updateActiveContent(next);
            this.textarea.selectionStart = this.textarea.selectionEnd = start + 4;
        }

        private createTerminalPane(): HTMLElement {
            const pane = element("section", "c2w-terminal-pane");
            pane.hidden = true;
            this.terminalDock = element("div", "c2w-terminal-dock");
            pane.append(this.terminalDock);
            return pane;
        }

        private dockTerminal(): void {
            if (!this.terminalDock) {
                return;
            }
            this.terminal.dockTerminal(this.terminalDock, () => this.closeTerminalTabFromExternalDock());
            this.terminal.focus();
        }

        private closeTerminalTabFromExternalDock(): void {
            if (!this.isTerminalTabActive()) {
                return;
            }
            this.activeTabId = this.tabs.some((tab) => tab.id === this.lastFileTabId) ? this.lastFileTabId : this.tabs[0].id;
            this.writeStoredActiveTab(this.activeTabId);
            this.addLog("info", "Terminal moved to another view; restored " + this.activeTab.path + ".");
            this.refresh();
            this.queueProjectSync("Terminal moved away; queued restored editor files to sync back into c2w.");
        }

        private isTerminalTabActive(): boolean {
            return this.activeTabId === TERMINAL_TAB_ID;
        }

        private actionButton(label: string, icon: ActionIcon, title: string, action: () => void, variant = ""): HTMLButtonElement {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "c2w-icon-button" + (variant ? " " + variant : "");
            button.title = title;
            button.setAttribute("aria-label", title);
            button.dataset.c2wAction = "true";
            button.dataset.c2wButtonKind = icon;
            button.append(iconElement(icon), element("span", "c2w-button-label", label));
            button.addEventListener("click", (event) => {
                event.preventDefault();
                action();
            });
            this.actionButtons.push(button);
            return button;
        }

        private setBusy(isBusy: boolean): void {
            this.busy = isBusy;
            this.refreshActionButtons();
            this.refreshActiveMeta();
            this.refreshTabs();
        }

        private refreshActionButtons(): void {
            const blockedByGlobalRun = Boolean(globalRunOwner && globalRunOwner !== this);
            const blockedByInitialSync = isInitialSyncBlocking();
            for (const button of this.actionButtons) {
                const kind = button.dataset.c2wButtonKind || "";
                const blocksDuringOtherRun = kind === "load" || kind === "download" || kind === "run";
                const blocksDuringInitialSync = kind === "load" || kind === "download" || kind === "run";
                button.disabled = this.busy
                    || (blockedByGlobalRun && blocksDuringOtherRun)
                    || (blockedByInitialSync && blocksDuringInitialSync);
            }
        }

        private setStatus(message: string, isError = false): void {
            this.addLog(isError ? "error" : "info", message);
            this.options.onStatus?.(message, isError, this);
        }

        private setOutput(message: string): void {
            if (this.outputElement) {
                this.outputElement.textContent = message;
            }
        }

        private addLog(level: LogLevel, message: string): void {
            this.logs.push({ at: Date.now(), level, message });
            if (this.logs.length > 80) {
                this.logs = this.logs.slice(this.logs.length - 80);
            }
            this.refreshEvents();
        }

        private recordResult(title: string, result: RustCommandResult): void {
            const level = result.exitCode === 0 ? "info" : "error";
            this.addLog(level, title + " finished with exit code " + result.exitCode + " in " + formatDuration(result.finishedAt - result.startedAt) + ".");
            for (const event of (result.events || []).slice(0, 8)) {
                this.addLog(event.level === "error" ? "error" : event.level === "warn" ? "warn" : "info", event.type + ": " + event.message);
            }
            this.options.onResult?.(title, result, this);
        }

        private refreshEvents(): void {
            if (!this.eventElement) {
                return;
            }
            if (this.logs.length === 0) {
                this.eventElement.textContent = "Ready.";
                return;
            }
            this.eventElement.textContent = this.logs
                .slice(-30)
                .map((entry) => "[" + timeLabel(entry.at) + "] " + entry.level.toUpperCase() + " " + entry.message)
                .join("\n");
            this.eventElement.scrollTop = this.eventElement.scrollHeight;
        }

        private requireCargoTab(): ProjectTab {
            const tab = this.tabs.find((candidate) => tabKind(candidate) === "cargo");
            if (!tab) {
                throw new Error("project editor requires a Cargo.toml tab to run with Cargo");
            }
            return tab;
        }

        private async ensureRustEnvironmentReady(reason: string): Promise<void> {
            this.setStatus("Checking preloaded Rust toolchain before " + reason + "...");
            const result = await this.runtime.ensureLibraryCache({
                status: "Checking preloaded Rust toolchain before " + reason,
                displayCommand: "check preloaded Rust toolchain",
                terminalTitle: "Check Rust toolchain",
            });
            if (result.exitCode !== 0) {
                throw new Error("preloaded Rust toolchain is not ready:\n" + (resultText(result) || "exit code " + result.exitCode));
            }
            this.addLog("info", "Rust toolchain ready for " + reason + ".");
        }

        private fetchedHashKey(): string {
            return this.storagePrefix + ":fetched:" + this.projectDir;
        }

        private lastFetchedCargoHash(): string | null {
            try {
                return localStorage.getItem(this.fetchedHashKey());
            } catch {
                return null;
            }
        }

        private storeFetchedCargoHash(hash: string): void {
            try {
                localStorage.setItem(this.fetchedHashKey(), hash);
            } catch {
                // Local persistence is an optimization only.
            }
        }

        private readStoredState(): Record<string, string> {
            const defaults = defaultState(this.tabs);
            try {
                const raw = localStorage.getItem(this.storagePrefix + ":files");
                if (!raw) {
                    return defaults;
                }
                const parsed = JSON.parse(raw) as Record<string, unknown>;
                const next = { ...defaults };
                for (const tab of this.tabs) {
                    if (typeof parsed[tab.id] === "string") {
                        next[tab.id] = parsed[tab.id] as string;
                    }
                }
                return next;
            } catch {
                return defaults;
            }
        }

        private persist(): void {
            try {
                localStorage.setItem(this.storagePrefix + ":files", JSON.stringify(this.state));
            } catch {
                // The editor remains usable without localStorage.
            }
        }

        private readStoredActiveTab(): string {
            try {
                const candidate = localStorage.getItem(this.storagePrefix + ":active-tab");
                if (candidate && this.tabs.some((tab) => tab.id === candidate)) {
                    return candidate;
                }
            } catch {
                // Use the configured fallback.
            }
            return this.options.project.activeTabId || this.tabs[0].id;
        }

        private writeStoredActiveTab(tabId: string): void {
            try {
                localStorage.setItem(this.storagePrefix + ":active-tab", tabId);
            } catch {
                // Ignore persistence failures.
            }
        }

        private readStoredProjectDir(): string {
            try {
                return localStorage.getItem(this.storagePrefix + ":project-dir") || this.options.project.projectDir;
            } catch {
                return this.options.project.projectDir;
            }
        }

        private writeStoredProjectDir(projectDir: string): void {
            try {
                localStorage.setItem(this.storagePrefix + ":project-dir", projectDir);
            } catch {
                // Ignore persistence failures.
            }
        }
    }

    export function createProjectEditor(options: ProjectEditorOptions): ProjectEditor {
        const editor = new ProjectEditor(options);
        editor.mount();
        return editor;
    }

    function normalizeTabs(tabs: ProjectTab[]): ProjectTab[] {
        if (!Array.isArray(tabs) || tabs.length === 0) {
            throw new Error("createProjectEditor requires at least one project tab");
        }
        const ids = new Set<string>();
        return tabs.map((tab) => {
            const id = tab.id.trim();
            if (!id) {
                throw new Error("project tab id must not be empty");
            }
            if (ids.has(id)) {
                throw new Error("duplicate project tab id: " + id);
            }
            ids.add(id);
            return {
                ...tab,
                id,
                label: tab.label || tab.path,
                kind: tab.kind || inferTabKind(tab.path),
            };
        });
    }

    function defaultState(tabs: ProjectTab[]): Record<string, string> {
        const state: Record<string, string> = {};
        for (const tab of tabs) {
            state[tab.id] = tab.defaultContent;
        }
        return state;
    }

    function tabKind(tab: ProjectTab): ProjectTabKind {
        return tab.kind || inferTabKind(tab.path);
    }

    function inferTabKind(path: string): ProjectTabKind {
        if (path === "Cargo.toml" || /(^|\/)Cargo\.toml$/i.test(path)) {
            return "cargo";
        }
        if (/\.rs$/i.test(path)) {
            return "rust";
        }
        return "text";
    }

    function resolveElement(target: string | HTMLElement, label: string): HTMLElement {
        if (typeof target !== "string") {
            return target;
        }
        const element = document.querySelector(target);
        if (!(element instanceof HTMLElement)) {
            throw new Error(label + " not found: " + target);
        }
        return element;
    }

    function resolveOptionalElement(target?: string | HTMLElement): HTMLElement | undefined {
        if (!target) {
            return undefined;
        }
        if (typeof target !== "string") {
            return target;
        }
        const element = document.querySelector(target);
        return element instanceof HTMLElement ? element : undefined;
    }

    function element<K extends keyof HTMLElementTagNameMap>(
        tag: K,
        className = "",
        text?: string
    ): HTMLElementTagNameMap[K] {
        const node = document.createElement(tag);
        if (className) {
            node.className = className;
        }
        if (text !== undefined) {
            node.textContent = text;
        }
        return node;
    }

    function iconElement(icon: ActionIcon): SVGSVGElement {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("aria-hidden", "true");
        svg.setAttribute("focusable", "false");
        svg.classList.add("c2w-button-icon");

        const paths: Record<ActionIcon, string[]> = {
            load: ["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "M7 10l5 5 5-5", "M12 15V3"],
            copy: ["M8 8h11v11H8z", "M5 16H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"],
            reset: ["M3 12a9 9 0 1 0 3-6.7", "M3 4v6h6"],
            "reset-all": ["M3 12a9 9 0 1 0 3-6.7", "M3 4v6h6", "M9 12h6", "M12 9v6"],
            download: ["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "M7 10l5 5 5-5", "M12 15V3"],
            run: ["M6 4l14 8-14 8z"],
        };

        for (const d of paths[icon]) {
            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.setAttribute("d", d);
            svg.append(path);
        }
        return svg;
    }

    function highlightCode(code: string, tab: ProjectTab): string {
        if (tabKind(tab) === "cargo") {
            return highlightToml(code);
        }
        if (tabKind(tab) !== "rust") {
            return escapeHtml(code);
        }
        const tokens: string[] = [];
        let remaining = code;
        while (remaining.length > 0) {
            const comment = remaining.match(/^\/\/.*/);
            if (comment) {
                tokens.push(span("comment", comment[0]));
                remaining = remaining.slice(comment[0].length);
                continue;
            }
            const attr = remaining.match(/^#\[[^\]]*\]/);
            if (attr) {
                tokens.push(span("attribute", attr[0]));
                remaining = remaining.slice(attr[0].length);
                continue;
            }
            const string = remaining.match(/^"(?:[^"\\]|\\.)*"/);
            if (string) {
                tokens.push(span("string", string[0]));
                remaining = remaining.slice(string[0].length);
                continue;
            }
            const macro = remaining.match(/^[A-Za-z_][A-Za-z0-9_]*!/);
            if (macro) {
                tokens.push(span("macro", macro[0]));
                remaining = remaining.slice(macro[0].length);
                continue;
            }
            const word = remaining.match(/^[A-Za-z_][A-Za-z0-9_]*/);
            if (word) {
                const value = word[0];
                if (RUST_KEYWORDS.has(value)) {
                    tokens.push(span("keyword", value));
                } else if (RUST_TYPES.has(value)) {
                    tokens.push(span("type", value));
                } else {
                    tokens.push(escapeHtml(value));
                }
                remaining = remaining.slice(value.length);
                continue;
            }
            const number = remaining.match(/^\d+(?:_\d+)*(?:\.\d+)?/);
            if (number) {
                tokens.push(span("number", number[0]));
                remaining = remaining.slice(number[0].length);
                continue;
            }
            tokens.push(escapeHtml(remaining[0]));
            remaining = remaining.slice(1);
        }
        return tokens.join("");
    }

    function highlightToml(code: string): string {
        return code
            .split(/\n/)
            .map((line) => {
                if (/^\s*#/.test(line)) {
                    return span("comment", line);
                }
                const section = line.match(/^(\s*\[[^\]]+\])/);
                if (section) {
                    return span("attribute", section[1]) + escapeHtml(line.slice(section[1].length));
                }
                const key = line.match(/^(\s*[A-Za-z0-9_.-]+)(\s*=)/);
                if (key) {
                    return span("keyword", key[1]) + escapeHtml(key[2] + line.slice(key[0].length));
                }
                return escapeHtml(line);
            })
            .join("\n");
    }

    function span(kind: string, value: string): string {
        return "<span class=\"tok-" + kind + "\">" + escapeHtml(value) + "</span>";
    }

    function escapeHtml(value: string): string {
        return value
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    }

    function hashText(value: string): string {
        let hash = 2166136261;
        for (let index = 0; index < value.length; index += 1) {
            hash ^= value.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(16);
    }

    function toPixels(value: string): number {
        const parsed = Number.parseFloat(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function measureTerminalCell(container: HTMLElement): { width: number; height: number } {
        const renderedCell = Array.from(container.querySelectorAll(".xterm-rows span"))
            .find((candidate): candidate is HTMLElement => candidate instanceof HTMLElement && candidate.textContent !== "");
        const renderedBox = renderedCell?.getBoundingClientRect();
        const renderedLength = renderedCell?.textContent?.length || 0;
        if (renderedBox && renderedBox.width > 0 && renderedBox.height > 0 && renderedLength > 0) {
            return {
                width: renderedBox.width / renderedLength,
                height: renderedBox.height,
            };
        }

        const xtermElement = container.querySelector(".xterm");
        const style = xtermElement instanceof HTMLElement
            ? window.getComputedStyle(xtermElement)
            : window.getComputedStyle(container);
        const sample = document.createElement("span");
        sample.textContent = "mmmmmmmmmmmmmmmm";
        sample.style.position = "absolute";
        sample.style.visibility = "hidden";
        sample.style.whiteSpace = "pre";
        sample.style.fontFamily = style.fontFamily || "Consolas, monospace";
        sample.style.fontSize = style.fontSize || "16px";
        sample.style.fontWeight = style.fontWeight || "400";
        sample.style.lineHeight = style.lineHeight === "normal" ? "normal" : style.lineHeight;
        container.appendChild(sample);
        const sampleBox = sample.getBoundingClientRect();
        sample.remove();

        return {
            width: sampleBox.width > 0 ? sampleBox.width / 16 : 9,
            height: sampleBox.height > 0 ? sampleBox.height : 18,
        };
    }

    function resultText(result: RustCommandResult): string {
        return (result.stdout || result.stderr || result.rawOutput || "").replace(/\r/g, "").trimEnd();
    }

    function compileFailureText(result: RustCompileResult): string {
        const diagnosticText = result.diagnostics
            .map((diagnostic) => diagnostic.rendered || "[" + diagnostic.level + "] " + diagnostic.message)
            .join("\n\n")
            .trim();
        return diagnosticText || result.stderr || result.stdout || "cargo build failed";
    }

    function assertSucceeded(result: RustCommandResult, action: string): void {
        if (result.exitCode === 0) {
            return;
        }
        throw new Error("failed to " + action + ":\n" + (result.stderr || result.stdout || "exit code " + result.exitCode));
    }

    function downloadBlob(blob: Blob, fileName: string): void {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = fileName;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function joinPath(base: string, relativePath: string): string {
        const cleanBase = base.trim().replace(/\/+$/, "");
        const cleanRelative = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
        return (cleanBase || "/") === "/" ? "/" + cleanRelative : cleanBase + "/" + cleanRelative;
    }

    function shellQuote(value: string): string {
        return "'" + value.replace(/'/g, "'\\''") + "'";
    }

    function errorMessage(error: unknown): string {
        return error instanceof Error ? error.message : String(error);
    }

    function formatDuration(durationMs: number): string {
        if (!Number.isFinite(durationMs) || durationMs < 0) {
            return "0 ms";
        }
        if (durationMs < 1000) {
            return Math.round(durationMs) + " ms";
        }
        return (durationMs / 1000).toFixed(durationMs < 10000 ? 2 : 1).replace(/\.0+$/, "") + " s";
    }

    function timeLabel(time: number): string {
        const date = new Date(time);
        return [
            String(date.getHours()).padStart(2, "0"),
            String(date.getMinutes()).padStart(2, "0"),
            String(date.getSeconds()).padStart(2, "0"),
        ].join(":");
    }
}
