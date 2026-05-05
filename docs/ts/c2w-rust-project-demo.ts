function demoOutputElement(): HTMLElement | null {
    return document.getElementById("rust-wrapper-output");
}

function demoAppendOutput(text: string): void {
    const elem = demoOutputElement();
    if (!elem) {
        return;
    }
    elem.textContent += text;
    elem.scrollTop = elem.scrollHeight;
}

function demoSetStatus(id: string, message: string, isError = false): void {
    const elem = document.getElementById(id);
    if (!elem) {
        return;
    }
    elem.textContent = message;
    elem.className = "status-line " + (isError ? "text-danger" : "text-muted");
}

function demoSetWrapperStatus(message: string, isError = false): void {
    demoSetStatus("rust-wrapper-status", message, isError);
}

function demoFormatDurationMs(durationMs: number): string {
    if (!Number.isFinite(durationMs) || durationMs < 0) {
        return "0 ms";
    }
    if (durationMs < 1000) {
        return Math.round(durationMs) + " ms";
    }
    return (durationMs / 1000).toFixed(durationMs < 10000 ? 2 : 1).replace(/\.0+$/, "") + " s";
}

function demoResultOutput(result: RustCommandResult): string {
    for (const output of [result.stdout, result.stderr, result.rawOutput]) {
        const clean = (output || "").replace(/\r/g, "").trimEnd();
        if (clean) {
            return clean;
        }
    }
    return "";
}

function demoIndent(output: string): string {
    return output.split(/\r?\n/).map((line) => "    " + line).join("\n");
}

function demoRenderResult(title: string, result: RustCommandResult): void {
    const output = demoResultOutput(result);
    const heading = result.step
        ? "Step " + result.step.current + "/" + result.step.total + " - " + result.step.label
        : title || result.displayCommand || "command";
    const lines = [
        (result.exitCode === 0 ? "OK " : "FAIL ") + heading + " (" + demoFormatDurationMs(result.finishedAt - result.startedAt) + ")",
        "  command: " + (result.displayCommand || result.command),
        "  exit.code: " + result.exitCode,
    ];
    if (output) {
        lines.push("  output:", demoIndent(output));
    } else {
        lines.push("  output: (none)");
    }
    demoAppendOutput(lines.join("\n") + "\n\n");
}

const DEMO_TELEMETRY_CARGO_TOML = `[package]
name = "telemetry-event-demo"
version = "0.1.0"
edition = "2021"

[lib]
name = "telemetry_event_demo"
path = "src/lib.rs"

[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
`;

const DEMO_TELEMETRY_LIB_RS = `use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Event {
    pub service: String,
    pub latency_ms: u64,
    pub ok: bool,
}

impl Event {
    pub fn new(service: impl Into<String>, latency_ms: u64, ok: bool) -> Self {
        Self {
            service: service.into(),
            latency_ms,
            ok,
        }
    }
}

pub fn demo_events() -> Vec<Event> {
    vec![
        Event::new("checkout", 42, true),
        Event::new("payments", 87, true),
        Event::new("search", 19, true),
    ]
}

pub fn total_latency(events: &[Event]) -> u64 {
    events.iter().map(|event| event.latency_ms).sum()
}

pub fn encode_events(events: &[Event]) -> String {
    serde_json::to_string_pretty(events).expect("demo events serialize")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn totals_latency() {
        let events = demo_events();
        assert_eq!(total_latency(&events), 148);
    }
}
`;

const DEMO_TELEMETRY_MAIN_RS = `use telemetry_event_demo::{demo_events, encode_events, total_latency};

fn main() {
    let events = demo_events();
    let encoded = encode_events(&events);

    println!("project = telemetry-event-demo");
    println!("event_count = {}", events.len());
    println!("total_latency_ms = {}", total_latency(&events));
    println!("{}", encoded);
}
`;

let lastActiveProjectEditorId = "";
let demoLibraryCacheHydrationStarted = false;

function setupEditorThemeToggle(): void {
    const shell = document.getElementById("editor-demo-shell");
    if (!shell) {
        return;
    }
    const buttons = Array.from(document.querySelectorAll("[data-editor-theme]"))
        .filter((button): button is HTMLButtonElement => button instanceof HTMLButtonElement);
    const storageKey = "c2w-rust-editor-demo-theme";
    const setTheme = (theme: string): void => {
        const cleanTheme = theme === "day" ? "day" : "night";
        shell.classList.toggle("editor-theme-day", cleanTheme === "day");
        shell.classList.toggle("editor-theme-night", cleanTheme === "night");
        for (const button of buttons) {
            button.setAttribute("aria-pressed", button.dataset.editorTheme === cleanTheme ? "true" : "false");
        }
        try {
            localStorage.setItem(storageKey, cleanTheme);
        } catch {
            // Theme persistence is optional.
        }
    };

    for (const button of buttons) {
        button.addEventListener("click", () => setTheme(button.dataset.editorTheme || "night"));
    }

    try {
        setTheme(localStorage.getItem(storageKey) || "night");
    } catch {
        setTheme("night");
    }
}

function demoRuntime(): RustContainerWrapper {
    const wrapperClass = window.RustContainerWrapper || RustContainerWrapper;
    const existing = window.rustContainer;
    if (existing) {
        return existing;
    }

    const runtime = new wrapperClass({
        onStatus: (message) => demoSetWrapperStatus(message),
    });
    window.rustContainer = runtime;
    return runtime;
}

function startDemoLibraryCacheHydration(runtime: RustContainerWrapper): void {
    if (demoLibraryCacheHydrationStarted) {
        return;
    }
    demoLibraryCacheHydrationStarted = true;

    void runtime.ensureLibraryCache({
        status: "Hydrating cached Rust libraries",
        displayCommand: "hydrate Rust library cache",
        terminalTitle: "Hydrate Rust library cache",
    }).then((result) => {
        if (result.exitCode === 0) {
            demoSetWrapperStatus("Rust library cache is ready.");
        } else {
            demoSetWrapperStatus("Rust library cache hydration failed.", true);
            demoRenderResult("hydrate Rust library cache", result);
        }
    }).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        demoSetWrapperStatus("Rust library cache hydration failed: " + message, true);
        demoAppendOutput("ERROR hydrating Rust library cache: " + message + "\n");
    });
}

function createRustProjectEditorDemo(): void {
    setupEditorThemeToggle();

    const codecRoot = document.getElementById("codec-editor");
    const telemetryRoot = document.getElementById("telemetry-editor");
    if (!codecRoot || !telemetryRoot) {
        return;
    }

    const runtime = demoRuntime();
    window.addEventListener("c2w-wasi-image-ready", () => startDemoLibraryCacheHydration(runtime), { once: true });
    const terminal = new C2WRustEditor.SharedTerminalBridge({
        statusElement: "#terminal-target-status",
        onStatus: (message, isError) => {
            if (isError) {
                demoAppendOutput("TERMINAL: " + message + "\n");
            }
        },
    });

    const makeEditor = (project: C2WRustEditor.ProjectConfig): C2WRustEditor.ProjectEditor => C2WRustEditor.createProjectEditor({
        root: "#" + project.id,
        runtime,
        terminal,
        project,
        storageKey: "c2w-rust-editor-demo-v2:" + project.id,
        onStatus: (message, isError, editor) => {
            demoSetWrapperStatus(editor.id + ": " + message, isError);
        },
        onResult: (title, result, editor) => {
            demoRenderResult(editor.id + " / " + title, result);
        },
        onActivate: (editor) => {
            if (lastActiveProjectEditorId !== editor.id) {
                lastActiveProjectEditorId = editor.id;
                demoAppendOutput("Active editor: " + editor.id + " -> " + editor.projectDir + "\n");
            }
        },
    });

    makeEditor({
        id: "codec-editor",
        title: "Example 1: binary codec library",
        description: "Cargo project with library and binary tabs targeting its own container folder.",
        projectDir: "/root/c2w-editor-examples/binary-codec",
        activeTabId: "lib",
        tabs: [
            {
                id: "cargo",
                label: "Cargo.toml",
                path: "Cargo.toml",
                defaultContent: window.RustContainerWrapper!.defaultSolanaCargoToml().replace("solana-binary-codec-demo", "c2w-editor-binary-codec"),
            },
            {
                id: "lib",
                label: "src/lib.rs",
                path: "src/lib.rs",
                defaultContent: window.RustContainerWrapper!.defaultSolanaLibRs(),
            },
            {
                id: "main",
                label: "src/main.rs",
                path: "src/main.rs",
                defaultContent: window.RustContainerWrapper!.defaultSolanaMainRs(),
            },
        ],
    });

    makeEditor({
        id: "telemetry-editor",
        title: "Example 2: serde telemetry project",
        description: "Cargo.toml includes dependencies so Cargo changes trigger c2w cargo fetch before build.",
        projectDir: "/root/c2w-editor-examples/telemetry",
        activeTabId: "main",
        tabs: [
            {
                id: "cargo",
                label: "Cargo.toml",
                path: "Cargo.toml",
                defaultContent: DEMO_TELEMETRY_CARGO_TOML,
            },
            {
                id: "lib",
                label: "src/lib.rs",
                path: "src/lib.rs",
                defaultContent: DEMO_TELEMETRY_LIB_RS,
            },
            {
                id: "main",
                label: "src/main.rs",
                path: "src/main.rs",
                defaultContent: DEMO_TELEMETRY_MAIN_RS,
            },
        ],
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
        const sent = terminal.sendLine(command);
        if (!sent) {
            demoSetWrapperStatus("The singleton c2w terminal is not ready for input yet.", true);
            return;
        }
        input.value = "";
        demoSetWrapperStatus("Sent command to the singleton c2w terminal.");
    });

    document.getElementById("clear-terminal-button")?.addEventListener("click", () => {
        terminal.clear();
    });

    demoSetWrapperStatus("Editor examples mounted. Choose a tab, edit code, then run.");
}

try {
    createRustProjectEditorDemo();
} catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    demoSetWrapperStatus("Failed to mount editor examples: " + message, true);
    demoAppendOutput("ERROR mounting editor examples: " + message + "\n");
}
