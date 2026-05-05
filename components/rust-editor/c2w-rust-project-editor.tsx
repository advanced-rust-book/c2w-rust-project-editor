"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Download, Play, RotateCcw, Terminal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { RustCodeEditor } from "@/components/rust-code-editor"
import { cn } from "@/lib/utils"
import { RUST_COMPILER_ERROR_PREFIX } from "./rust-simulator"

type ProjectTabId = "cargo" | "lib" | "main"

interface ProjectTab {
  id: ProjectTabId
  label: string
  filename: string
  path: string
  defaultCode: string
}

interface C2WCommandResult {
  exitCode: number
  stdout: string
  stderr: string
  rawOutput?: string
  displayCommand?: string
}

interface C2WCompileResult extends C2WCommandResult {
  success: boolean
  diagnostics?: Array<{
    level?: string
    message?: string
    rendered?: string
    code?: string
  }>
}

interface C2WRustRuntime {
  editCargoFile(projectDir: string, content: string, options?: unknown): Promise<C2WCommandResult>
  editRustFile(projectDir: string, relativePath: string, content: string, options?: unknown): Promise<C2WCommandResult>
  fetchLibraries(projectDir: string, options?: unknown): Promise<C2WCommandResult>
  compile(projectDir: string, options?: unknown): Promise<C2WCompileResult>
  run(projectDir: string, options?: unknown): Promise<C2WCommandResult>
  exportFolder(projectDir: string, options?: unknown): Promise<{
    blob: Blob
    fileName: string
    command: C2WCommandResult
  }>
}

declare global {
  interface Window {
    rustContainer?: C2WRustRuntime
    RustContainerWrapper?: {
      defaultProjectDir?: string
    }
    sendWasiInput?: (data: string) => boolean
    readWasiTerminalText?: () => string
    clearWasiTerminal?: () => void
  }
}

const DEFAULT_PROJECT_DIR = "/root/solana-binary-codec-demo"

const DEFAULT_CARGO_TOML = `[package]
name = "c2w-rust-editor-demo"
version = "0.1.0"
edition = "2021"

[lib]
name = "c2w_rust_editor_demo"
path = "src/lib.rs"

[dependencies]
`

const DEFAULT_LIB_RS = `#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Packet {
    pub service: String,
    pub sequence: u64,
    pub payload: Vec<u8>,
}

impl Packet {
    pub fn new(service: impl Into<String>, sequence: u64, payload: impl Into<Vec<u8>>) -> Self {
        Self {
            service: service.into(),
            sequence,
            payload: payload.into(),
        }
    }

    pub fn checksum(&self) -> u64 {
        self.payload
            .iter()
            .fold(self.sequence, |acc, byte| acc.wrapping_mul(31).wrapping_add(*byte as u64))
    }

    pub fn summary(&self) -> String {
        format!(
            "{}#{} bytes={} checksum={}",
            self.service,
            self.sequence,
            self.payload.len(),
            self.checksum()
        )
    }
}

pub fn demo_packet() -> Packet {
    Packet::new("payments", 42, b"container2wasm")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn summary_contains_service_and_size() {
        let packet = demo_packet();
        assert!(packet.summary().contains("payments#42"));
        assert!(packet.summary().contains("bytes=14"));
    }
}
`

const DEFAULT_MAIN_RS = `use c2w_rust_editor_demo::demo_packet;

fn main() {
    let packet = demo_packet();

    println!("project = c2w-rust-editor-demo");
    println!("packet = {}", packet.summary());
    println!("roundtrip_ready = true");
}
`

const PROJECT_TABS: ProjectTab[] = [
  {
    id: "cargo",
    label: "Cargo.toml",
    filename: "Cargo.toml",
    path: "Cargo.toml",
    defaultCode: DEFAULT_CARGO_TOML,
  },
  {
    id: "lib",
    label: "src/lib.rs",
    filename: "src/lib.rs",
    path: "src/lib.rs",
    defaultCode: DEFAULT_LIB_RS,
  },
  {
    id: "main",
    label: "src/main.rs",
    filename: "src/main.rs",
    path: "src/main.rs",
    defaultCode: DEFAULT_MAIN_RS,
  },
]

type ProjectFiles = Record<ProjectTabId, string>

function defaultFiles(): ProjectFiles {
  return PROJECT_TABS.reduce<ProjectFiles>(
    (acc, tab) => {
      acc[tab.id] = tab.defaultCode
      return acc
    },
    { cargo: "", lib: "", main: "" }
  )
}

function hashText(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16)
}

function resultText(result: C2WCommandResult): string {
  return (result.stdout || result.stderr || result.rawOutput || "").trimEnd()
}

function commandFailed(result: C2WCommandResult) {
  return result.exitCode !== 0
}

function compileFailureOutput(result: C2WCompileResult): string {
  const diagnosticText = (result.diagnostics ?? [])
    .map((diagnostic) => diagnostic.rendered || `[${diagnostic.level ?? "error"}] ${diagnostic.message ?? "compiler diagnostic"}`)
    .join("\n\n")
    .trim()

  return `${RUST_COMPILER_ERROR_PREFIX}${diagnosticText || result.stderr || result.stdout || "cargo build failed"}`
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function c2wRuntime(): C2WRustRuntime | null {
  if (typeof window === "undefined") return null
  return window.rustContainer ?? null
}

export function C2WRustProjectEditor() {
  const [projectDir, setProjectDir] = useState(DEFAULT_PROJECT_DIR)
  const [files, setFiles] = useState<ProjectFiles>(() => defaultFiles())
  const [activeTabId, setActiveTabId] = useState<ProjectTabId>("lib")
  const [output, setOutput] = useState<string | null>(null)
  const [status, setStatus] = useState("Ready. Edit any tab, then run the complete Cargo project through c2w.")
  const [isRunning, setIsRunning] = useState(false)
  const [terminalInput, setTerminalInput] = useState("")
  const [terminalPreview, setTerminalPreview] = useState("")
  const lastFetchedCargoHash = useRef<string | null>(null)

  useEffect(() => {
    if (typeof window !== "undefined" && window.RustContainerWrapper?.defaultProjectDir) {
      setProjectDir(window.RustContainerWrapper.defaultProjectDir)
    }
  }, [])

  const activeTab = useMemo(
    () => PROJECT_TABS.find((tab) => tab.id === activeTabId) ?? PROJECT_TABS[1],
    [activeTabId]
  )

  const activeCode = files[activeTab.id]
  const activeDefault = activeTab.defaultCode
  const isDirty = activeCode !== activeDefault
  const dirtyTabs = useMemo(
    () => new Set(PROJECT_TABS.filter((tab) => files[tab.id] !== tab.defaultCode).map((tab) => tab.id)),
    [files]
  )

  const updateActiveCode = useCallback(
    (code: string) => {
      setFiles((prev) => ({ ...prev, [activeTab.id]: code }))
    },
    [activeTab.id]
  )

  const resetCurrentTab = useCallback(() => {
    setFiles((prev) => ({ ...prev, [activeTab.id]: activeTab.defaultCode }))
    setStatus(`Reset ${activeTab.path} to the default template.`)
  }, [activeTab])

  const resetAllTabs = useCallback(() => {
    setFiles(defaultFiles())
    setOutput(null)
    lastFetchedCargoHash.current = null
    setStatus("Reset all Cargo project tabs to their defaults.")
  }, [])

  const writeProjectFiles = useCallback(
    async (runtime: C2WRustRuntime) => {
      const cargo = await runtime.editCargoFile(projectDir, files.cargo, {
        displayCommand: "write Cargo.toml",
        status: "Writing Cargo.toml",
      })
      if (commandFailed(cargo)) {
        throw new Error(resultText(cargo) || "failed to write Cargo.toml")
      }

      const lib = await runtime.editRustFile(projectDir, "src/lib.rs", files.lib, {
        displayCommand: "write src/lib.rs",
        status: "Writing src/lib.rs",
      })
      if (commandFailed(lib)) {
        throw new Error(resultText(lib) || "failed to write src/lib.rs")
      }

      const main = await runtime.editRustFile(projectDir, "src/main.rs", files.main, {
        displayCommand: "write src/main.rs",
        status: "Writing src/main.rs",
      })
      if (commandFailed(main)) {
        throw new Error(resultText(main) || "failed to write src/main.rs")
      }

      return [cargo, lib, main]
    },
    [files, projectDir]
  )

  const runProject = useCallback(async () => {
    const runtime = c2wRuntime()
    if (!runtime) {
      setOutput(`${RUST_COMPILER_ERROR_PREFIX}c2w runtime is not available yet. Use the docker-compose static page or wait for the WASI terminal to finish loading.`)
      setStatus("c2w runtime is not available.")
      return
    }

    setIsRunning(true)
    setOutput("Writing editor tabs into the c2w Cargo project...")
    setStatus("Writing tabs, fetching changed Cargo libraries, compiling, and running in c2w...")

    try {
      await writeProjectFiles(runtime)

      const cargoHash = hashText(files.cargo)
      if (lastFetchedCargoHash.current !== cargoHash) {
        setOutput("Cargo.toml changed. Running cargo fetch before build...")
        const fetch = await runtime.fetchLibraries(projectDir, {
          displayCommand: "cargo fetch",
          status: "Fetching Cargo libraries",
        })
        if (commandFailed(fetch)) {
          throw new Error(resultText(fetch) || "cargo fetch failed")
        }
        lastFetchedCargoHash.current = cargoHash
      }

      setOutput("Compiling with cargo build...")
      const compile = await runtime.compile(projectDir, {
        messageFormat: "json",
        displayCommand: "cargo build --message-format=json",
        status: "Compiling Rust project",
      })

      if (!compile.success) {
        setOutput(compileFailureOutput(compile))
        setStatus("Compilation failed. Fix the active project tab and run again.")
        return
      }

      setOutput("Running with cargo run...")
      const run = await runtime.run(projectDir, {
        displayCommand: "cargo run --quiet",
        status: "Running Rust project",
      })

      if (commandFailed(run)) {
        setOutput(`${RUST_COMPILER_ERROR_PREFIX}${resultText(run) || "cargo run failed"}`)
        setStatus("cargo run failed. Check the terminal output.")
        return
      }

      setOutput(resultText(run) || "Program finished successfully with no stdout.")
      setTerminalPreview(typeof window.readWasiTerminalText === "function" ? window.readWasiTerminalText() : "")
      setStatus("Project compiled and ran successfully through c2w.")
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setOutput(`${RUST_COMPILER_ERROR_PREFIX}${message}`)
      setStatus(message)
    } finally {
      setIsRunning(false)
    }
  }, [files.cargo, projectDir, writeProjectFiles])

  const downloadProjectZip = useCallback(async () => {
    const runtime = c2wRuntime()
    if (!runtime) {
      setOutput(`${RUST_COMPILER_ERROR_PREFIX}c2w runtime is not available yet, so the project cannot be zipped from the container filesystem.`)
      return
    }

    setIsRunning(true)
    setStatus("Writing current tabs and creating a project zip from the c2w filesystem...")
    setOutput("Preparing zip archive...")

    try {
      await writeProjectFiles(runtime)
      const exported = await runtime.exportFolder(projectDir, {
        displayCommand: "export project as zip",
        status: "Creating project zip",
      })
      downloadBlob(exported.blob, exported.fileName)
      setOutput(resultText(exported.command) || `Downloaded ${exported.fileName}.`)
      setStatus(`Downloaded ${exported.fileName}.`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setOutput(`${RUST_COMPILER_ERROR_PREFIX}${message}`)
      setStatus(message)
    } finally {
      setIsRunning(false)
    }
  }, [projectDir, writeProjectFiles])

  const sendTerminalCommand = useCallback(() => {
    const command = terminalInput.trimEnd()
    if (!command) return

    const sent = typeof window !== "undefined" && typeof window.sendWasiInput === "function"
      ? window.sendWasiInput(`${command}\r`)
      : false

    if (!sent) {
      setStatus("The singleton c2w terminal is not ready for input yet.")
      return
    }

    setTerminalInput("")
    setStatus("Sent command to the singleton c2w terminal.")
    window.setTimeout(() => {
      setTerminalPreview(typeof window.readWasiTerminalText === "function" ? window.readWasiTerminalText() : "")
    }, 500)
  }, [terminalInput])

  const refreshTerminalPreview = useCallback(() => {
    setTerminalPreview(typeof window !== "undefined" && typeof window.readWasiTerminalText === "function"
      ? window.readWasiTerminalText()
      : "")
  }, [])

  return (
    <section className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
      <div className="border-b border-border bg-gradient-to-r from-zinc-950 via-slate-900 to-zinc-950 p-5 text-white">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="mb-2 inline-flex rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-100">
              c2w Cargo project editor
            </div>
            <h2 className="text-2xl font-bold">Run real Cargo projects in the browser container</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-300">
              One editor, multiple project tabs, one singleton c2w terminal. The Run button writes the active tab set,
              fetches libraries when Cargo.toml changed, compiles, and runs the project inside the WASI container.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={runProject} disabled={isRunning} className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700">
              <Play className="h-4 w-4" />
              {isRunning ? "Working..." : "Run project"}
            </Button>
            <Button onClick={downloadProjectZip} disabled={isRunning} variant="secondary" className="gap-2">
              <Download className="h-4 w-4" />
              Download zip
            </Button>
            <Button onClick={resetAllTabs} disabled={isRunning} variant="outline" className="gap-2 border-white/20 bg-white/10 text-white hover:bg-white/20">
              <RotateCcw className="h-4 w-4" />
              Reset all
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {PROJECT_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTabId(tab.id)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                    activeTabId === tab.id
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-foreground hover:bg-muted"
                  )}
                >
                  {tab.label}
                  {dirtyTabs.has(tab.id) ? <span className="ml-1 text-amber-400">●</span> : null}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="c2w-project-dir">
                Project dir
              </label>
              <input
                id="c2w-project-dir"
                value={projectDir}
                onChange={(event) => setProjectDir(event.target.value)}
                className="h-8 w-72 rounded-md border border-border bg-background px-2 font-mono text-xs text-foreground"
              />
            </div>
          </div>

          <RustCodeEditor
            code={activeCode}
            onChange={updateActiveCode}
            onRun={runProject}
            output={output}
            isRunning={isRunning}
            filename={activeTab.filename}
            originalCode={activeDefault}
            onRevert={resetCurrentTab}
          />

          <div className="rounded-2xl border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{activeTab.path}</span>
            {isDirty ? " has local edits." : " matches the default template."} Copy in the editor header copies only this tab.
          </div>
        </div>

        <aside className="border-t border-border bg-muted/20 p-4 xl:border-l xl:border-t-0">
          <div className="mb-3 flex items-center gap-2">
            <Terminal className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Singleton terminal bridge</h3>
          </div>
          <p className="mb-3 text-xs leading-5 text-muted-foreground">
            Commands below are sent to the one c2w terminal instance. Multiple editor views share this runtime instead
            of starting competing terminals.
          </p>

          <div className="flex gap-2">
            <input
              value={terminalInput}
              onChange={(event) => setTerminalInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  sendTerminalCommand()
                }
              }}
              placeholder="pwd"
              className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-3 font-mono text-xs"
            />
            <Button type="button" onClick={sendTerminalCommand} variant="outline" size="sm">
              Send
            </Button>
          </div>

          <div className="mt-3 flex gap-2">
            <Button type="button" onClick={refreshTerminalPreview} variant="outline" size="sm">
              Refresh terminal text
            </Button>
            <Button
              type="button"
              onClick={() => {
                window.clearWasiTerminal?.()
                setTerminalPreview("")
              }}
              variant="outline"
              size="sm"
            >
              Clear
            </Button>
          </div>

          <pre className="mt-3 max-h-72 overflow-auto rounded-xl border border-border bg-zinc-950 p-3 text-xs leading-5 text-zinc-100">
            {terminalPreview || "Terminal output preview will appear here after the c2w runtime starts."}
          </pre>

          <div className="mt-3 rounded-xl border border-border bg-background p-3 text-xs leading-5 text-muted-foreground">
            <div className="font-semibold text-foreground">Status</div>
            <div className="mt-1">{status}</div>
          </div>
        </aside>
      </div>
    </section>
  )
}
