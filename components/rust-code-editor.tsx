"use client"

import { useState, useRef, useCallback, useEffect, KeyboardEvent } from "react"
import { Play, Copy, Check, RotateCcw } from "lucide-react"
import { RUST_COMPILER_ERROR_PREFIX } from "@/components/rust-editor/rust-simulator"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// Rust syntax highlighting tokens
const RUST_KEYWORDS = [
  "fn", "let", "mut", "const", "static", "if", "else", "match", "loop", "while", "for", "in",
  "return", "break", "continue", "struct", "enum", "impl", "trait", "pub", "mod", "use",
  "self", "Self", "super", "crate", "as", "where", "type", "async", "await", "move", "ref", "dyn", "unsafe", "extern", "union", "macro_rules"
]

const RUST_TYPES = [
  "i8", "i16", "i32", "i64", "i128", "isize", 
  "u8", "u16", "u32", "u64", "u128", "usize", "BinaryHeap", "JoinHandle", "ScopedJoinHandle", "JoinSet", "Sender", "Receiver", "SyncSender",
  "f32", "f64", "bool", "char", "str", "String", "Vec", "VecDeque", "Option", "Result", "Box", "MaybeUninit", "NonNull", "CString", "CStr",
  "Any", "TypeId", "HashMap", "HashSet", "BTreeMap", "BTreeSet", "Rc", "Arc", "Weak", "RefCell", "Cell", "Mutex", "RwLock", "Condvar", "Barrier", "AtomicBool", "AtomicUsize", "Ordering", "Pin", "Context", "Poll", "Waker", "Future", "FuturesUnordered", "Semaphore", "RandomState", "BuildHasherDefault", "TokenStream"
]

const RUST_BUILTINS = ["println!", "print!", "format!", "panic!", "vec!", "assert!", "assert_eq!", "dbg!"]

const RUST_VALUES = ["true", "false", "None", "Some", "Ok", "Err"]

// Autocompletion suggestions
const AUTOCOMPLETE_ITEMS = [
  { label: "fn main() {}", insertText: "fn main() {\n    \n}", description: "Main function" },
  { label: "println!", insertText: 'println!("$1");', description: "Print with newline" },
  { label: "let", insertText: "let $1 = $2;", description: "Variable binding" },
  { label: "let mut", insertText: "let mut $1 = $2;", description: "Mutable variable" },
  { label: "if", insertText: "if $1 {\n    $2\n}", description: "If statement" },
  { label: "for", insertText: "for $1 in $2 {\n    $3\n}", description: "For loop" },
  { label: "while", insertText: "while $1 {\n    $2\n}", description: "While loop" },
  { label: "match", insertText: "match $1 {\n    $2 => $3,\n}", description: "Match expression" },
  { label: "String::from", insertText: 'String::from("$1")', description: "Create String" },
  { label: "Vec::new", insertText: "Vec::new()", description: "Create empty Vec" },
  { label: "fn", insertText: "fn $1($2) {\n    $3\n}", description: "Function definition" },
  { label: "struct", insertText: "struct $1 {\n    $2\n}", description: "Struct definition" },
  { label: "impl", insertText: "impl $1 {\n    $2\n}", description: "Implementation block" },
  { label: "macro_rules!", insertText: "macro_rules! $1 {\n    ($2) => {{\n        $3\n    }};\n}", description: "Declarative macro" },
]

function highlightRustCode(code: string): string {
  // Tokenize approach to avoid regex conflicts
  const tokens: { type: string; value: string }[] = []
  let remaining = code
  
  while (remaining.length > 0) {
    // Comments
    const commentMatch = remaining.match(/^\/\/.*/)
    if (commentMatch) {
      tokens.push({ type: "comment", value: commentMatch[0] })
      remaining = remaining.slice(commentMatch[0].length)
      continue
    }
    
    // Strings
    const stringMatch = remaining.match(/^"(?:[^"\\]|\\.)*"/)
    if (stringMatch) {
      tokens.push({ type: "string", value: stringMatch[0] })
      remaining = remaining.slice(stringMatch[0].length)
      continue
    }
    
    // Macros
    const macroMatch = remaining.match(/^(println!|print!|format!|panic!|vec!|assert!|assert_eq!|dbg!)/)
    if (macroMatch) {
      tokens.push({ type: "macro", value: macroMatch[0] })
      remaining = remaining.slice(macroMatch[0].length)
      continue
    }
    
    // Words (identifiers, keywords, types)
    const wordMatch = remaining.match(/^[a-zA-Z_][a-zA-Z0-9_]*/)
    if (wordMatch) {
      const word = wordMatch[0]
      if (RUST_KEYWORDS.includes(word)) {
        tokens.push({ type: "keyword", value: word })
      } else if (RUST_TYPES.includes(word)) {
        tokens.push({ type: "type", value: word })
      } else if (RUST_VALUES.includes(word)) {
        tokens.push({ type: "value", value: word })
      } else {
        // Check if it's a function call (followed by parenthesis)
        const afterWord = remaining.slice(word.length)
        if (afterWord.match(/^\s*\(/)) {
          tokens.push({ type: "function", value: word })
        } else {
          tokens.push({ type: "identifier", value: word })
        }
      }
      remaining = remaining.slice(word.length)
      continue
    }
    
    // Numbers
    const numberMatch = remaining.match(/^\d+(?:\.\d+)?/)
    if (numberMatch) {
      tokens.push({ type: "number", value: numberMatch[0] })
      remaining = remaining.slice(numberMatch[0].length)
      continue
    }
    
    // Other characters (operators, punctuation, whitespace)
    tokens.push({ type: "plain", value: remaining[0] })
    remaining = remaining.slice(1)
  }
  
  // Convert tokens to HTML
  return tokens.map(token => {
    const escaped = token.value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
    
    switch (token.type) {
      case "comment":
        return `<span class="text-emerald-500">${escaped}</span>`
      case "string":
        return `<span class="text-amber-400">${escaped}</span>`
      case "macro":
        return `<span class="text-purple-400">${escaped}</span>`
      case "keyword":
        return `<span class="text-pink-400">${escaped}</span>`
      case "type":
        return `<span class="text-cyan-400">${escaped}</span>`
      case "value":
        return `<span class="text-orange-400">${escaped}</span>`
      case "number":
        return `<span class="text-orange-300">${escaped}</span>`
      case "function":
        return `<span class="text-yellow-300">${escaped}</span>`
      default:
        return escaped
    }
  }).join("")
}

interface RustCodeEditorProps {
  code: string
  onChange?: (code: string) => void
  onRun: () => void
  output: string | null
  isRunning: boolean
  readOnly?: boolean
  filename?: string
  expectedOutput?: string
  showResultComparison?: boolean
  originalCode?: string
  onRevert?: () => void
}

interface ParsedRunOutput {
  kind: "success" | "error"
  text: string
}

function parseRunOutput(output: string | null): ParsedRunOutput | null {
  if (output === null) {
    return null
  }

  if (output.startsWith(RUST_COMPILER_ERROR_PREFIX)) {
    return { kind: "error", text: output.slice(RUST_COMPILER_ERROR_PREFIX.length) }
  }

  return { kind: "success", text: output }
}

export function RustCodeEditor({
  code,
  onChange,
  onRun,
  output,
  isRunning,
  readOnly = false,
  filename = "main.rs",
  expectedOutput,
  showResultComparison = false,
  originalCode,
  onRevert,
}: RustCodeEditorProps) {
  const [localCode, setLocalCode] = useState(code)
  const [copied, setCopied] = useState(false)
  const [showAutocomplete, setShowAutocomplete] = useState(false)
  const [autocompleteItems, setAutocompleteItems] = useState<typeof AUTOCOMPLETE_ITEMS>([])
  const [selectedAutocomplete, setSelectedAutocomplete] = useState(0)
  const [cursorPosition, setCursorPosition] = useState({ top: 0, left: 0 })
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const editorRef = useRef<HTMLDivElement>(null)
  const initialCodeRef = useRef(code)
  const initialFilenameRef = useRef(filename)

  const [scrollPosition, setScrollPosition] = useState({ top: 0, left: 0 })
  const lines = localCode.split("\n")

  const handleCodeChange = (newCode: string) => {
    setLocalCode(newCode)
    onChange?.(newCode)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = textareaRef.current
    if (!textarea) return

    // Handle autocomplete navigation
    if (showAutocomplete) {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setSelectedAutocomplete((prev) => Math.min(prev + 1, autocompleteItems.length - 1))
        return
      }
      if (e.key === "ArrowUp") {
        e.preventDefault()
        setSelectedAutocomplete((prev) => Math.max(prev - 1, 0))
        return
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault()
        insertAutocomplete(autocompleteItems[selectedAutocomplete])
        return
      }
      if (e.key === "Escape") {
        setShowAutocomplete(false)
        return
      }
    }

    // Tab handling for indentation
    if (e.key === "Tab") {
      e.preventDefault()
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const newCode = localCode.substring(0, start) + "    " + localCode.substring(end)
      handleCodeChange(newCode)
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 4
      }, 0)
      return
    }

    // Auto-close brackets and quotes
    const pairs: Record<string, string> = {
      "(": ")",
      "[": "]",
      "{": "}",
      '"': '"',
      "'": "'",
    }
    if (pairs[e.key]) {
      e.preventDefault()
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const selectedText = localCode.substring(start, end)
      const newCode = localCode.substring(0, start) + e.key + selectedText + pairs[e.key] + localCode.substring(end)
      handleCodeChange(newCode)
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 1
      }, 0)
      return
    }

    // Enter key - auto-indent
    if (e.key === "Enter") {
      e.preventDefault()
      const start = textarea.selectionStart
      const currentLineStart = localCode.lastIndexOf("\n", start - 1) + 1
      const currentLine = localCode.substring(currentLineStart, start)
      const indent = currentLine.match(/^\s*/)?.[0] || ""
      const prevChar = localCode[start - 1]
      const extraIndent = prevChar === "{" ? "    " : ""
      const newCode = localCode.substring(0, start) + "\n" + indent + extraIndent + localCode.substring(start)
      handleCodeChange(newCode)
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 1 + indent.length + extraIndent.length
      }, 0)
    }
  }

  const handleInput = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea || readOnly) return

    const cursorPos = textarea.selectionStart
    const textBeforeCursor = localCode.substring(0, cursorPos)
    const currentWord = textBeforeCursor.split(/[\s\n({[\]};,]/).pop() || ""

    if (currentWord.length >= 2) {
      const filtered = AUTOCOMPLETE_ITEMS.filter((item) =>
        item.label.toLowerCase().startsWith(currentWord.toLowerCase())
      )
      if (filtered.length > 0) {
        setAutocompleteItems(filtered)
        setSelectedAutocomplete(0)
        setShowAutocomplete(true)

        // Calculate cursor position for autocomplete popup
        const lines = textBeforeCursor.split("\n")
        const lineNumber = lines.length
        const columnNumber = lines[lines.length - 1].length
        setCursorPosition({
          top: lineNumber * 24 + 8,
          left: Math.min(columnNumber * 8.4 + 48, 300),
        })
      } else {
        setShowAutocomplete(false)
      }
    } else {
      setShowAutocomplete(false)
    }
  }, [localCode, readOnly])

  const insertAutocomplete = (item: (typeof AUTOCOMPLETE_ITEMS)[0]) => {
    const textarea = textareaRef.current
    if (!textarea) return

    const cursorPos = textarea.selectionStart
    const textBeforeCursor = localCode.substring(0, cursorPos)
    const currentWordStart = Math.max(
      textBeforeCursor.lastIndexOf(" "),
      textBeforeCursor.lastIndexOf("\n"),
      textBeforeCursor.lastIndexOf("("),
      textBeforeCursor.lastIndexOf("{")
    ) + 1

    const insertText = item.insertText.replace(/\$\d/g, "")
    const newCode = localCode.substring(0, currentWordStart) + insertText + localCode.substring(cursorPos)
    handleCodeChange(newCode)
    setShowAutocomplete(false)

    setTimeout(() => {
      textarea.focus()
      const newPos = currentWordStart + insertText.length
      textarea.selectionStart = textarea.selectionEnd = newPos
    }, 0)
  }

  const copyCode = async () => {
    await navigator.clipboard.writeText(localCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleEditorScroll = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    setScrollPosition({ top: textarea.scrollTop, left: textarea.scrollLeft })
  }, [])

  useEffect(() => {
    if (originalCode !== undefined) return
    if (initialFilenameRef.current !== filename) {
      initialFilenameRef.current = filename
      initialCodeRef.current = code
    }
  }, [code, filename, originalCode])

  useEffect(() => {
    setLocalCode(code)
  }, [code])

  const parsedOutput = parseRunOutput(output)
  const outputText = parsedOutput?.text ?? ""
  const isCompilerError = parsedOutput?.kind === "error"
  const isCorrect =
    Boolean(showResultComparison && parsedOutput?.kind === "success" && expectedOutput && outputText === expectedOutput)

  const revertCode = originalCode ?? initialCodeRef.current
  const canRevert = !readOnly && localCode !== revertCode

  const handleRevert = () => {
    if (!canRevert) return
    setShowAutocomplete(false)
    setLocalCode(revertCode)
    if (onRevert) {
      onRevert()
    } else {
      onChange?.(revertCode)
    }
  }

  useEffect(() => {
    handleEditorScroll()
  }, [handleEditorScroll, localCode])

  return (
    <div className="rounded-lg overflow-hidden border border-zinc-700 bg-zinc-900 font-mono text-sm">
      {/* Editor Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-800 border-b border-zinc-700">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <div className="w-3 h-3 rounded-full bg-yellow-500" />
            <div className="w-3 h-3 rounded-full bg-green-500" />
          </div>
          <span className="text-zinc-400 text-sm">{filename}</span>
          {!readOnly && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-400">editable</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!readOnly && (
            <Button
              size="sm"
              variant="ghost"
              onClick={handleRevert}
              disabled={!canRevert}
              aria-label="Revert code to original"
              title="Revert code to original"
              className="h-7 w-7 p-0 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 disabled:text-zinc-600 disabled:hover:bg-transparent"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={copyCode}
            aria-label="Copy code"
            title="Copy code"
            className="h-7 w-7 p-0 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
          <Button
            size="sm"
            onClick={onRun}
            disabled={isRunning}
            className="gap-1.5 h-7 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Play className="h-3 w-3" />
            {isRunning ? "Running..." : "Run"}
          </Button>
        </div>
      </div>

      {/* Code Editor */}
      <div ref={editorRef} className="relative">
        <div className="flex">
          {/* Line Numbers */}
          <div className="flex-shrink-0 overflow-hidden py-3 px-2 bg-zinc-800/50 text-zinc-500 text-right select-none border-r border-zinc-700">
            <div style={{ transform: `translateY(-${scrollPosition.top}px)` }}>
              {lines.map((_, i) => (
                <div key={i} className="leading-6 h-6 px-2">
                  {i + 1}
                </div>
              ))}
            </div>
          </div>

          {/* Code Area */}
          <div className="flex-1 relative overflow-x-auto">
            {/* Highlighted code (display layer) */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
              <pre
                className="py-3 px-4 whitespace-pre"
                style={{
                  transform: `translate(${-scrollPosition.left}px, -${scrollPosition.top}px)`,
                }}
              >
                <code
                  className="block text-zinc-100 leading-6"
                  dangerouslySetInnerHTML={{ __html: highlightRustCode(localCode) }}
                />
              </pre>
            </div>

            {/* Textarea (input layer) */}
            <textarea
              ref={textareaRef}
              wrap="off"
              value={localCode}
              onChange={(e) => {
                handleCodeChange(e.target.value)
                handleInput()
              }}
              onKeyDown={handleKeyDown}
              onBlur={() => setTimeout(() => setShowAutocomplete(false), 200)}
              className={cn(
                "w-full py-3 px-4 bg-transparent text-transparent caret-white resize-none focus:outline-none leading-6 min-h-[144px]",
                "whitespace-pre overflow-auto",
                readOnly && "cursor-default"
              )}
              style={{
                minHeight: `${Math.max(lines.length * 24 + 24, 144)}px`,
              }}
              spellCheck={false}
              readOnly={readOnly}
              onScroll={handleEditorScroll}
            />

            {/* Autocomplete Popup */}
            {showAutocomplete && (
              <div
                className="absolute z-50 bg-zinc-800 border border-zinc-600 rounded-md shadow-xl overflow-hidden min-w-[220px]"
                style={{ top: cursorPosition.top, left: cursorPosition.left }}
              >
                {autocompleteItems.map((item, i) => (
                  <button
                    key={item.label}
                    className={cn(
                      "w-full px-3 py-1.5 text-left flex items-center justify-between gap-4 text-sm",
                      i === selectedAutocomplete
                        ? "bg-blue-600 text-white"
                        : "text-zinc-300 hover:bg-zinc-700"
                    )}
                    onClick={() => insertAutocomplete(item)}
                  >
                    <span className="font-mono">{item.label}</span>
                    <span className="text-xs text-zinc-400">{item.description}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Output Panel */}
      {parsedOutput && (
        <div className={cn(
          "border-t px-4 py-3",
          isCompilerError
            ? "bg-red-950/40 border-red-700"
            : isCorrect
              ? "bg-emerald-900/30 border-emerald-700"
              : "bg-zinc-800 border-zinc-700"
        )}>
          <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
            <span className={cn(
              "text-xs uppercase tracking-wider",
              isCompilerError ? "text-red-200" : "text-zinc-400"
            )}>
              {isCompilerError ? "Compiler errors" : "Output"}
            </span>
            {isCompilerError ? (
              <span className="text-xs font-medium px-2 py-0.5 rounded bg-red-600 text-white">
                Build failed
              </span>
            ) : showResultComparison ? (
              <span className={cn(
                "text-xs font-medium px-2 py-0.5 rounded",
                isCorrect ? "bg-emerald-600 text-white" : "bg-amber-600 text-white"
              )}>
                {isCorrect ? "Correct!" : "Check your output"}
              </span>
            ) : null}
          </div>
          <pre className={cn(
            "text-sm whitespace-pre-wrap break-words",
            isCompilerError
              ? "text-red-200"
              : isCorrect
                ? "text-emerald-400"
                : showResultComparison
                  ? "text-amber-400"
                  : "text-zinc-100"
          )}>
            {outputText}
          </pre>
          {isCompilerError ? (
            <p className="mt-2 text-xs text-red-200/80">
              Fix the reported Rust compiler error and run the snippet again.
            </p>
          ) : showResultComparison && expectedOutput && !isCorrect ? (
            <div className="mt-2 pt-2 border-t border-zinc-700">
              <span className="text-xs text-zinc-500">Expected: </span>
              <span className="text-xs text-zinc-400 whitespace-pre-wrap">{expectedOutput}</span>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
