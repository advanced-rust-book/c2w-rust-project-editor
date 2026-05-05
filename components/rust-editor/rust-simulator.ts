import { simulatePracticeOutput } from "./rust-simulator-practice"
import { simulateCh54Output } from "./rust-simulator-ch54"
import { simulateCh53Output } from "./rust-simulator-ch53"
import { simulateCh52Output } from "./rust-simulator-ch52"
import { simulateCh51Output } from "./rust-simulator-ch51"
import { simulateCh50Output } from "./rust-simulator-ch50"
import { simulateCh49Output } from "./rust-simulator-ch49"
import { simulateCh48Output } from "./rust-simulator-ch48"
import { simulateCh47Output } from "./rust-simulator-ch47"
import { simulateCh46Output } from "./rust-simulator-ch46"
import { simulateCh45Output } from "./rust-simulator-ch45"
import { simulateCh44Output } from "./rust-simulator-ch44"
import { simulateCh43Output } from "./rust-simulator-ch43"
import { simulateCh42Output } from "./rust-simulator-ch42"
import { simulateCh41Output } from "./rust-simulator-ch41"
import { simulateCh40Output } from "./rust-simulator-ch40"
import { simulateCh39Output } from "./rust-simulator-ch39"
import { simulateCh38Output } from "./rust-simulator-ch38"
import { simulateCh37Output } from "./rust-simulator-ch37"
import { simulateCh36Output } from "./rust-simulator-ch36"
import { simulateCh35Output } from "./rust-simulator-ch35"
import { simulateCh34Output } from "./rust-simulator-ch34"
import { simulateCh33Output } from "./rust-simulator-ch33"
import { simulateCh32Output } from "./rust-simulator-ch32"
import { simulateCh31Output } from "./rust-simulator-ch31"
import { simulateCh30Output } from "./rust-simulator-ch30"
import { simulateCh29Output } from "./rust-simulator-ch29"
import { simulateCh28Output } from "./rust-simulator-ch28"
import { simulateCh27Output } from "./rust-simulator-ch27"
import { simulateCh26Output } from "./rust-simulator-ch26"
import { simulateCh25Output } from "./rust-simulator-ch25"
import { simulateCh24Output } from "./rust-simulator-ch24"
import { simulateCh23Output } from "./rust-simulator-ch23"
import { simulateCh22Output } from "./rust-simulator-ch22"
import { simulateCh21Output } from "./rust-simulator-ch21"
import { simulateCh20Output } from "./rust-simulator-ch20"
import { simulateCh19Output } from "./rust-simulator-ch19"
import { simulateCh18Output } from "./rust-simulator-ch18"
import { simulateCh17Output } from "./rust-simulator-ch17"
import { simulateCh16Output } from "./rust-simulator-ch16"
import { simulateCh15Output } from "./rust-simulator-ch15"
import { simulateCh14Output } from "./rust-simulator-ch14"
import { simulateCh13Output } from "./rust-simulator-ch13"
import { simulateCh12Output } from "./rust-simulator-ch12"
import { simulateCh11Output } from "./rust-simulator-ch11"
import { simulateCh10Output } from "./rust-simulator-ch10"
import { simulateCh09Output } from "./rust-simulator-ch09"

export const RUST_COMPILER_ERROR_PREFIX = "__RUSTC_ERROR__\n"

interface CompilerDiagnostic {
  code?: string
  message: string
  line: number
  column: number
  sourceLine: string
  note?: string
  filename?: string
}

const RUST_RESERVED_IDENTIFIERS = new Set([
  "as", "async", "await", "Box", "break", "const", "continue", "crate", "dyn", "else", "enum", "Err",
  "extern", "false", "fn", "for", "if", "impl", "in", "let", "loop", "match", "mod", "move", "mut", "None", "Ok",
  "Option", "pub", "ref", "Result", "return", "Self", "self", "Some", "static", "String", "struct",
  "super", "trait", "true", "type", "union", "unsafe", "use", "usize", "Vec", "where", "while",
])

const RUST_PRIMITIVE_TYPES = new Set([
  "i8", "i16", "i32", "i64", "i128", "isize",
  "u8", "u16", "u32", "u64", "u128", "usize",
  "f32", "f64", "bool", "char", "str",
])

const RUST_STANDARD_TYPES = new Set([
  "Arc", "AtomicBool", "AtomicUsize", "Barrier", "BinaryHeap", "BTreeMap", "BTreeSet", "Box", "BuildHasherDefault", "Cell", "Clone", "Condvar", "Context", "Copy", "Cow", "CString", "CStr", "Debug", "Default", "Display", "Entry", "Future", "FuturesUnordered", "HashMap", "HashSet", "IntoIterator", "Iterator", "JoinHandle", "JoinSet", "MaybeUninit", "Mutex", "MutexGuard", "NonNull", "Option", "Ordering", "PhantomData", "Pin", "Poll", "RandomState", "Rc", "Receiver", "RefCell", "Result", "RwLock", "RwLockReadGuard", "RwLockWriteGuard", "ScopedJoinHandle", "Semaphore", "Send", "Sender", "String", "Sync", "SyncSender", "Vec", "VecDeque", "Wake", "Weak", "Waker",
])

const RUST_TYPE_CONTEXT_KEYWORDS = new Set([
  "const", "crate", "dyn", "fn", "impl", "mut", "pub", "ref", "self", "Self", "super", "where",
])

const RUST_PRELUDE_FUNCTIONS = new Set([
  "drop",
])

const RUST_BUILTIN_LIFETIMES = new Set([
  "_",
  "static",
])

const RUST_DECLARATION_KEYWORDS = new Set([
  "as", "const", "enum", "extern", "fn", "for", "if", "impl", "let", "mod", "pub", "ref", "static",
  "struct", "trait", "type", "use", "while",
])

const RUST_KEYWORD_SUGGESTIONS = [
  "match", "let", "fn", "if", "else", "for", "while", "loop", "return", "impl", "struct", "enum",
  "trait", "use",
]

function formatRustCompilerError({
  code,
  message,
  line,
  column,
  sourceLine,
  note,
  filename = "main.rs",
}: CompilerDiagnostic): string {
  const gutterWidth = String(line).length
  const gutter = " ".repeat(gutterWidth)
  const pointer = `${gutter} | ${" ".repeat(Math.max(column - 1, 0))}^`
  const headline = code ? `error[${code}]: ${message}` : `error: ${message}`
  const noteBlock = note ? `\n${gutter} |\n${gutter} = note: ${note}` : ""
  return `${RUST_COMPILER_ERROR_PREFIX}${headline}\n --> ${filename}:${line}:${column}\n${gutter} |\n${line} | ${sourceLine}\n${pointer}${noteBlock}`
}

function getLineText(code: string, lineNumber: number): string {
  return code.split("\n")[lineNumber - 1] ?? ""
}

function getLineColumnFromIndex(code: string, index: number): { line: number; column: number } {
  let line = 1
  let column = 1
  for (let i = 0; i < index; i++) {
    if (code[i] === "\n") {
      line += 1
      column = 1
    } else {
      column += 1
    }
  }
  return { line, column }
}

function maskStringsAndLineComments(code: string): string {
  let masked = ""
  let inString = false
  let isEscaped = false
  let inLineComment = false

  for (let i = 0; i < code.length; i++) {
    const char = code[i]
    const next = code[i + 1]

    if (inLineComment) {
      if (char === "\n") {
        inLineComment = false
        masked += "\n"
      } else {
        masked += " "
      }
      continue
    }

    if (inString) {
      if (char === "\n") {
        inString = false
        masked += "\n"
        continue
      }

      masked += " "
      if (isEscaped) {
        isEscaped = false
      } else if (char === "\\") {
        isEscaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === "/" && next === "/") {
      inLineComment = true
      masked += "  "
      i += 1
      continue
    }

    if (char === '"') {
      inString = true
      masked += " "
      continue
    }

    masked += char
  }

  return masked
}

function stripInlineComment(line: string): string {
  let inString = false
  let isEscaped = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    const next = line[i + 1]
    if (inString) {
      if (isEscaped) {
        isEscaped = false
        continue
      }
      if (char === "\\") {
        isEscaped = true
        continue
      }
      if (char === '"') {
        inString = false
      }
      continue
    }
    if (char === '"') {
      inString = true
      continue
    }
    if (char === "/" && next === "/") {
      return line.slice(0, i)
    }
  }
  return line
}

function findNextSignificantLine(lines: string[], startIndex: number): number {
  for (let i = startIndex; i < lines.length; i++) {
    if (stripInlineComment(lines[i]).trim()) {
      return i
    }
  }
  return -1
}

function extractLeadingToken(line: string): string {
  return line.match(/^[^\s]+/)?.[0] ?? "end of line"
}

function isContinuationLine(line: string): boolean {
  return /^[.{([+\-*/%&|?:]/.test(line)
}

function splitTopLevelArgs(input: string): string[] {
  const args: string[] = []
  let current = ""
  let parenDepth = 0
  let bracketDepth = 0
  let braceDepth = 0
  let inString = false
  let isEscaped = false

  for (let i = 0; i < input.length; i++) {
    const char = input[i]
    if (inString) {
      current += char
      if (isEscaped) {
        isEscaped = false
        continue
      }
      if (char === "\\") {
        isEscaped = true
        continue
      }
      if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
      current += char
      continue
    }

    if (char === "(") parenDepth += 1
    if (char === ")") parenDepth = Math.max(parenDepth - 1, 0)
    if (char === "[") bracketDepth += 1
    if (char === "]") bracketDepth = Math.max(bracketDepth - 1, 0)
    if (char === "{") braceDepth += 1
    if (char === "}") braceDepth = Math.max(braceDepth - 1, 0)

    if (char === "," && parenDepth === 0 && bracketDepth === 0 && braceDepth === 0) {
      if (current.trim()) {
        args.push(current.trim())
      }
      current = ""
      continue
    }

    current += char
  }

  if (current.trim()) {
    args.push(current.trim())
  }
  return args
}

function countFormatPlaceholders(formatString: string): number {
  let placeholders = 0
  for (let i = 0; i < formatString.length; i++) {
    const char = formatString[i]
    const next = formatString[i + 1]
    if (char === "{" && next === "{") {
      i += 1
      continue
    }
    if (char === "}" && next === "}") {
      i += 1
      continue
    }
    if (char === "{") {
      placeholders += 1
      while (i < formatString.length && formatString[i] !== "}") {
        i += 1
      }
    }
  }
  return placeholders
}

function extractBindingIdentifiers(fragment: string): string[] {
  return (fragment.match(/\b[a-zA-Z_]\w*\b/g) ?? []).filter((identifier) => {
    if (identifier === "_") return false
    if (RUST_RESERVED_IDENTIFIERS.has(identifier)) return false
    return identifier[0] !== identifier[0].toUpperCase()
  })
}

function collectDeclaredIdentifiers(code: string): Set<string> {
  const identifiers = new Set<string>()

  for (const match of code.matchAll(/\blet\s+([^=;\n]+?)\s*=/g)) {
    for (const identifier of extractBindingIdentifiers(match[1])) {
      identifiers.add(identifier)
    }
  }

  for (const match of code.matchAll(/\bfn\s+([a-zA-Z_]\w*)/g)) {
    identifiers.add(match[1])
  }

  for (const match of code.matchAll(/\bfn\s+[a-zA-Z_]\w*\s*\(([^)]*)\)/g)) {
    for (const parameter of splitTopLevelArgs(match[1])) {
      const bindingFragment = parameter.split(":")[0] ?? ""
      for (const identifier of extractBindingIdentifiers(bindingFragment)) {
        identifiers.add(identifier)
      }
    }
  }

  for (const match of code.matchAll(/\b(?:if|while)\s+let\s+([^=;\n]+?)\s*=/g)) {
    for (const identifier of extractBindingIdentifiers(match[1])) {
      identifiers.add(identifier)
    }
  }

  for (const match of code.matchAll(/(?:^|[=(,]\s*)(?:move\s+)?\|([^|\n]*)\|/gm)) {
    for (const parameter of splitTopLevelArgs(match[1] ?? "")) {
      const bindingFragment = parameter.split(":")[0] ?? ""
      for (const identifier of extractBindingIdentifiers(bindingFragment)) {
        identifiers.add(identifier)
      }
    }
  }

  for (const line of code.split("\n")) {
    const strippedLine = stripInlineComment(line).trim()
    const forMatch = strippedLine.match(/^for\s+(.+?)\s+in\b/)
    if (forMatch) {
      for (const identifier of extractBindingIdentifiers(forMatch[1])) {
        identifiers.add(identifier)
      }
    }

    const matchArm = strippedLine.match(/^(.*?)=>/)
    if (!matchArm) continue
    for (const identifier of extractBindingIdentifiers(matchArm[1])) {
      identifiers.add(identifier)
    }
  }
  return identifiers
}

interface ParsedFunctionSignature {
  name: string
  typeContexts: Array<{ text: string; absoluteIndex: number }>
  declaredLifetimes: Set<string>
  declaredTypeParameters: Set<string>
}

function parseGenericHeader(
  genericHeader?: string
): { lifetimes: Set<string>; typeParameters: Set<string> } {
  const lifetimes = new Set<string>()
  const typeParameters = new Set<string>()
  if (!genericHeader) return { lifetimes, typeParameters }

  for (const part of splitTopLevelArgs(genericHeader.slice(1, -1))) {
    const trimmed = part.trim()
    if (!trimmed) continue

    const lifetimeMatch = trimmed.match(/^'([a-zA-Z_]\w*)/)
    if (lifetimeMatch) {
      lifetimes.add(lifetimeMatch[1])
      continue
    }

    const constMatch = trimmed.match(/^const\s+([a-zA-Z_]\w*)/)
    if (constMatch) {
      typeParameters.add(constMatch[1])
      continue
    }
    const typeMatch = trimmed.match(/^([a-zA-Z_]\w*)/)
    if (typeMatch && !RUST_RESERVED_IDENTIFIERS.has(typeMatch[1])) {
      typeParameters.add(typeMatch[1])
    }
  }

  return { lifetimes, typeParameters }
}

function collectDeclaredTypes(code: string): Set<string> {
  const types = new Set<string>()
  for (const match of code.matchAll(/\b(?:struct|enum|trait|type|union)\s+([a-zA-Z_]\w*)/g)) {
    types.add(match[1])
  }
  return types
}

function collectDeclaredFunctions(code: string): Set<string> {
  const functions = new Set<string>()
  for (const match of code.matchAll(/\bfn\s+([a-zA-Z_]\w*)/g)) {
    functions.add(match[1])
  }
  return functions
}

function collectFunctionSignatures(code: string): ParsedFunctionSignature[] {
  const signatures: ParsedFunctionSignature[] = []
  const functionRegex = /\bfn\s+([a-zA-Z_]\w*)\s*(<[^>{}\n]*>)?\s*\(([^)]*)\)\s*(?:->\s*([^{;\n]+))?/g
  let match: RegExpExecArray | null

  while ((match = functionRegex.exec(code)) !== null) {
    const signatureText = match[0]
    const { lifetimes, typeParameters } = parseGenericHeader(match[2])
    const typeContexts: ParsedFunctionSignature["typeContexts"] = []
    let searchOffset = 0

    for (const parameter of splitTopLevelArgs(match[3] ?? "")) {
      const colonIndex = parameter.indexOf(":")
      if (colonIndex === -1) continue

      const typeExpression = parameter.slice(colonIndex + 1).trim()
      if (!typeExpression) continue

      const relativeIndex = signatureText.indexOf(typeExpression, searchOffset)
      const absoluteIndex = match.index + (relativeIndex === -1 ? 0 : relativeIndex)
      if (relativeIndex !== -1) {
        searchOffset = relativeIndex + typeExpression.length
      }

      typeContexts.push({ text: typeExpression, absoluteIndex })
    }

    const returnType = match[4]?.trim()
    if (returnType) {
      const relativeIndex = signatureText.lastIndexOf(returnType)
      typeContexts.push({
        text: returnType,
        absoluteIndex: match.index + (relativeIndex === -1 ? 0 : relativeIndex),
      })
    }

    signatures.push({
      name: match[1],
      typeContexts,
      declaredLifetimes: lifetimes,
      declaredTypeParameters: typeParameters,
    })
  }

  return signatures
}

function collectAdditionalTypeContexts(code: string): Array<{ text: string; absoluteIndex: number }> {
  const contexts: Array<{ text: string; absoluteIndex: number }> = []

  for (const match of code.matchAll(/\blet\s+[^=;\n]+:\s*([^=;\n]+?)\s*=/g)) {
    const typeExpression = match[1].trim()
    if (!typeExpression) continue
    const relativeIndex = match[0].lastIndexOf(typeExpression)
    contexts.push({
      text: typeExpression,
      absoluteIndex: match.index + (relativeIndex === -1 ? 0 : relativeIndex),
    })
  }

  for (const match of code.matchAll(/::\s*<([^>]+)>/g)) {
    const typeExpression = match[1].trim()
    if (!typeExpression) continue
    const relativeIndex = match[0].indexOf(typeExpression)
    contexts.push({
      text: typeExpression,
      absoluteIndex: match.index + (relativeIndex === -1 ? 0 : relativeIndex),
    })
  }

  return contexts
}

function getPreviousWord(code: string, index: number): string {
  let cursor = index - 1
  while (cursor >= 0 && /\s/.test(code[cursor])) {
    cursor -= 1
  }

  const end = cursor + 1
  while (cursor >= 0 && /[a-zA-Z_]/.test(code[cursor])) {
    cursor -= 1
  }

  return code.slice(cursor + 1, end)
}

function levenshteinDistance(left: string, right: string): number {
  const previousRow: number[] = Array.from({ length: right.length + 1 }, (_, index) => index)

  for (let leftIndex = 0; leftIndex < left.length; leftIndex++) {
    const currentRow: number[] = [leftIndex + 1]

    for (let rightIndex = 0; rightIndex < right.length; rightIndex++) {
      const substitutionCost = left[leftIndex] === right[rightIndex] ? 0 : 1
      currentRow[rightIndex + 1] = Math.min(
        currentRow[rightIndex] + 1,
        previousRow[rightIndex + 1] + 1,
        previousRow[rightIndex] + substitutionCost
      )
    }

    for (let i = 0; i < currentRow.length; i++) {
      previousRow[i] = currentRow[i]
    }
  }

  return previousRow[right.length]
}

function getLikelyRustKeywordSuggestion(identifier: string): string | null {
  let bestKeyword: string | null = null
  let bestDistance = Number.POSITIVE_INFINITY

  for (const keyword of RUST_KEYWORD_SUGGESTIONS) {
    if (keyword[0] !== identifier[0]) continue
    const distance = levenshteinDistance(identifier, keyword)
    if (distance < bestDistance) {
      bestDistance = distance
      bestKeyword = keyword
    }
  }

  if (!bestKeyword) return null

  const maxDistance = Math.max(2, Math.ceil(bestKeyword.length / 2) + 1)
  return bestDistance <= maxDistance ? bestKeyword : null
}

function findUndefinedValueUsageError(code: string, filename: string): string | null {
  const maskedCode = maskStringsAndLineComments(code)
  const declaredIdentifiers = collectDeclaredIdentifiers(maskedCode)
  const identifierRegex = /\b([a-z_]\w*)\b/g
  let match: RegExpExecArray | null

  while ((match = identifierRegex.exec(maskedCode)) !== null) {
    const identifier = match[1]
    if (identifier === "_") continue
    const absoluteIndex = match.index
    const charBefore = maskedCode[absoluteIndex - 1] ?? ""
    const prevTwo = maskedCode.slice(Math.max(absoluteIndex - 2, 0), absoluteIndex)
    const afterIndex = absoluteIndex + identifier.length
    const charAfter = maskedCode[afterIndex] ?? ""
    const nextTwo = maskedCode.slice(afterIndex, afterIndex + 2)
    const previousWord = getPreviousWord(maskedCode, absoluteIndex)

    if (RUST_RESERVED_IDENTIFIERS.has(identifier)) continue
    if (RUST_PRIMITIVE_TYPES.has(identifier)) continue
    if (RUST_PRELUDE_FUNCTIONS.has(identifier)) continue
    if (declaredIdentifiers.has(identifier)) continue

    if (charBefore === "." || charBefore === "'" || prevTwo === "::") continue
    if (charAfter === "!" || charAfter === ":" || charAfter === "(" || nextTwo === "::") continue
    if (RUST_DECLARATION_KEYWORDS.has(previousWord)) continue

    const { line, column } = getLineColumnFromIndex(code, absoluteIndex)
    const suggestedKeyword = getLikelyRustKeywordSuggestion(identifier)

    return formatRustCompilerError({
      code: "E0425",
      message: `cannot find value \`${identifier}\` in this scope`,
      line,
      column,
      sourceLine: getLineText(code, line),
      note: suggestedKeyword
        ? `if you meant the Rust keyword \`${suggestedKeyword}\`, fix the spelling here`
        : "declare the binding before using it or correct the identifier name",
      filename,
    })
  }

  return null
}

function findUndeclaredLifetimeError(code: string, filename: string): string | null {
  for (const signature of collectFunctionSignatures(code)) {
    for (const context of signature.typeContexts) {
      const lifetimeRegex = /'([a-zA-Z_]\w*)/g
      let match: RegExpExecArray | null

      while ((match = lifetimeRegex.exec(context.text)) !== null) {
        const lifetimeName = match[1]
        if (RUST_BUILTIN_LIFETIMES.has(lifetimeName) || signature.declaredLifetimes.has(lifetimeName)) {
          continue
        }

        const absoluteIndex = context.absoluteIndex + match.index
        const { line, column } = getLineColumnFromIndex(code, absoluteIndex)
        return formatRustCompilerError({
          code: "E0261",
          message: `use of undeclared lifetime name \`'${lifetimeName}\``,
          line,
          column,
          sourceLine: getLineText(code, line),
          note: `introduce a lifetime parameter such as \`<'${lifetimeName}>\` or use an existing lifetime like \`'static\``,
          filename,
        })
      }
    }
  }

  return null
}

function findUnknownTypeInContext(
  code: string,
  context: { text: string; absoluteIndex: number },
  knownTypes: Set<string>,
  filename: string
): string | null {
  const typeTokenRegex = /\b([a-zA-Z_]\w*)\b/g
  let match: RegExpExecArray | null

  while ((match = typeTokenRegex.exec(context.text)) !== null) {
    const typeName = match[1]
    const charBefore = context.text[match.index - 1] ?? ""
    const prevTwo = context.text.slice(Math.max(match.index - 2, 0), match.index)
    const nextTwo = context.text.slice(match.index + typeName.length, match.index + typeName.length + 2)
    const afterToken = context.text.slice(match.index + typeName.length).trimStart()

    if (charBefore === "'" || prevTwo === "::" || nextTwo === "::") continue
    if (afterToken.startsWith("=")) continue
    if (RUST_TYPE_CONTEXT_KEYWORDS.has(typeName)) continue
    if (knownTypes.has(typeName)) continue

    const absoluteIndex = context.absoluteIndex + match.index
    const { line, column } = getLineColumnFromIndex(code, absoluteIndex)
    return formatRustCompilerError({
      code: "E0412",
      message: `cannot find type \`${typeName}\` in this scope`,
      line,
      column,
      sourceLine: getLineText(code, line),
      note: "check the type name for a typo or declare it before using it",
      filename,
    })
  }

  return null
}

function findUnknownTypeError(code: string, filename: string): string | null {
  const declaredTypes = collectDeclaredTypes(code)
  const signatures = collectFunctionSignatures(code)
  const globallyKnownTypes = new Set<string>([...RUST_PRIMITIVE_TYPES, ...RUST_STANDARD_TYPES, ...declaredTypes])

  for (const signature of signatures) {
    for (const typeParameter of signature.declaredTypeParameters) {
      globallyKnownTypes.add(typeParameter)
    }
  }

  for (const signature of signatures) {
    const scopedKnownTypes = new Set<string>([...globallyKnownTypes, ...signature.declaredTypeParameters])
    for (const context of signature.typeContexts) {
      const error = findUnknownTypeInContext(code, context, scopedKnownTypes, filename)
      if (error) return error
    }
  }

  for (const context of collectAdditionalTypeContexts(code)) {
    const error = findUnknownTypeInContext(code, context, globallyKnownTypes, filename)
    if (error) return error
  }

  return null
}

function findUndefinedFunctionCallError(code: string, filename: string): string | null {
  const declaredFunctions = collectDeclaredFunctions(code)
  const declaredTypes = collectDeclaredTypes(code)
  const functionCallRegex = /\b([a-zA-Z_]\w*)\s*\(/g
  let match: RegExpExecArray | null

  while ((match = functionCallRegex.exec(code)) !== null) {
    const functionName = match[1]
    const charBefore = code[match.index - 1] ?? ""
    const previousWord = getPreviousWord(code, match.index)

    if (/[.:\w]/.test(charBefore)) continue
    if (previousWord === "fn") continue
    if (RUST_RESERVED_IDENTIFIERS.has(functionName) || RUST_PRELUDE_FUNCTIONS.has(functionName)) continue
    if (declaredFunctions.has(functionName) || declaredTypes.has(functionName)) continue

    const { line, column } = getLineColumnFromIndex(code, match.index)
    return formatRustCompilerError({
      code: "E0425",
      message: `cannot find function \`${functionName}\` in this scope`,
      line,
      column,
      sourceLine: getLineText(code, line),
      note: "define the function before calling it or correct the spelling of the function name",
      filename,
    })
  }

  return null
}

function findStructuralError(code: string, filename: string): string | null {
  const stack: Array<{ delimiter: string; line: number; column: number }> = []
  const delimiterPairs: Record<string, string> = { ")": "(", "]": "[", "}": "{" }
  const closingPairs: Record<string, string> = { "(": ")", "[": "]", "{": "}" }
  let line = 1
  let column = 1
  let inString = false
  let isEscaped = false
  let inLineComment = false
  let stringStart = { line: 1, column: 1 }

  for (let i = 0; i < code.length; i++) {
    const char = code[i]
    const next = code[i + 1]

    if (inLineComment) {
      if (char === "\n") {
        inLineComment = false
        line += 1
        column = 1
      } else {
        column += 1
      }
      continue
    }

    if (inString) {
      if (char === "\n") {
        return formatRustCompilerError({
          code: "E0765",
          message: "unterminated double quote string",
          line: stringStart.line,
          column: stringStart.column,
          sourceLine: getLineText(code, stringStart.line),
          note: "add a closing quote to finish this string literal",
          filename,
        })
      }
      if (isEscaped) {
        isEscaped = false
        column += 1
        continue
      }
      if (char === "\\") {
        isEscaped = true
        column += 1
        continue
      }
      if (char === '"') {
        inString = false
      }
      column += 1
      continue
    }

    if (char === "/" && next === "/") {
      inLineComment = true
      column += 2
      i += 1
      continue
    }

    if (char === '"') {
      inString = true
      stringStart = { line, column }
      column += 1
      continue
    }

    if (char in closingPairs) {
      stack.push({ delimiter: char, line, column })
      column += 1
      continue
    }

    if (char in delimiterPairs) {
      const expectedOpening = delimiterPairs[char]
      const lastOpening = stack[stack.length - 1]
      if (!lastOpening || lastOpening.delimiter !== expectedOpening) {
        return formatRustCompilerError({
          message: `unexpected closing delimiter: \`${char}\``,
          line,
          column,
          sourceLine: getLineText(code, line),
          note: `the compiler expected \`${lastOpening ? closingPairs[lastOpening.delimiter] : "nothing"}\` here`,
          filename,
        })
      }
      stack.pop()
      column += 1
      continue
    }

    if (char === "\n") {
      line += 1
      column = 1
      continue
    }

    column += 1
  }

  if (inString) {
    return formatRustCompilerError({
      code: "E0765",
      message: "unterminated double quote string",
      line: stringStart.line,
      column: stringStart.column,
      sourceLine: getLineText(code, stringStart.line),
      note: "add a closing quote to finish this string literal",
      filename,
    })
  }

  const unclosedDelimiter = stack[stack.length - 1]
  if (unclosedDelimiter) {
    return formatRustCompilerError({
      message: `this file contains an unclosed delimiter: \`${unclosedDelimiter.delimiter}\``,
      line: unclosedDelimiter.line,
      column: unclosedDelimiter.column,
      sourceLine: getLineText(code, unclosedDelimiter.line),
      note: `add a matching \`${closingPairs[unclosedDelimiter.delimiter]}\` to close this block`,
      filename,
    })
  }

  return null
}

function findMissingMainError(code: string, filename: string): string | null {
  if (/\bfn\s+main\s*\(/.test(code)) return null
  return formatRustCompilerError({
    code: "E0601",
    message: "`main` function not found in crate",
    line: 1,
    column: 1,
    sourceLine: getLineText(code, 1),
    note: "add a `fn main() { ... }` entry point so the snippet can run as a binary",
    filename,
  })
}

function findIncompleteBindingError(code: string, filename: string): string | null {
  const immediatePatterns: Array<{ regex: RegExp; useLookahead: boolean }> = [
    { regex: /\blet\s+[^=;\n]+\s*=\s*;/g, useLookahead: false },
    { regex: /\b[a-zA-Z_]\w*\s*=(?!=)\s*;/g, useLookahead: false },
    { regex: /\blet\s+[^=;\n]+\s*=\s*(?=[;)}\]])/g, useLookahead: true },
    { regex: /\b[a-zA-Z_]\w*\s*=(?!=)\s*(?=[;)}\]])/g, useLookahead: true },
  ]

  for (const pattern of immediatePatterns) {
    const match = pattern.regex.exec(code)
    if (!match) continue
    const problemIndex = pattern.useLookahead ? match.index + match[0].length : match.index + match[0].length - 1
    const problemToken = code[problemIndex] ?? "end of line"
    const { line, column } = getLineColumnFromIndex(code, problemIndex)
    return formatRustCompilerError({
      message: `expected expression, found \`${problemToken}\``,
      line,
      column,
      sourceLine: getLineText(code, line),
      note: "supply a value on the right-hand side of the assignment before running again",
      filename,
    })
  }

  const lines = code.split("\n")
  for (let i = 0; i < lines.length; i++) {
    const strippedLine = stripInlineComment(lines[i]).trim()
    if (!strippedLine) continue

    const looksLikeOpenBinding =
      /\blet\s+.+=\s*$/.test(strippedLine) || /^[a-zA-Z_]\w*\s*=(?!=)\s*$/.test(strippedLine)

    if (!looksLikeOpenBinding) continue

    const nextIndex = findNextSignificantLine(lines, i + 1)
    const nextLine = nextIndex === -1 ? "" : stripInlineComment(lines[nextIndex]).trim()

    if (nextIndex !== -1 && !/^[;)}\]]/.test(nextLine)) continue

    return formatRustCompilerError({
      message: nextIndex === -1 ? "expected expression, found end of input" : `expected expression, found \`${extractLeadingToken(nextLine)}\``,
      line: i + 1,
      column: stripInlineComment(lines[i]).length + 1,
      sourceLine: lines[i],
      note: "finish the assignment with a valid Rust expression",
      filename,
    })
  }

  return null
}

function findFormatStringError(code: string, filename: string): string | null {
  const printlnRegex = /println!\s*\(\s*"((?:[^"\\]|\\.)*)"(\s*,\s*([\s\S]*?))?\s*\)\s*;?/g
  let match: RegExpExecArray | null

  while ((match = printlnRegex.exec(code)) !== null) {
    const formatString = match[1]
    const args = match[3] ? splitTopLevelArgs(match[3]) : []
    const placeholderCount = countFormatPlaceholders(formatString)
    if (placeholderCount === args.length) continue

    const { line, column } = getLineColumnFromIndex(code, match.index)
    return formatRustCompilerError({
      message: `format string expects ${placeholderCount} argument${placeholderCount === 1 ? "" : "s"}, but ${args.length} ${args.length === 1 ? "was" : "were"} supplied`,
      line,
      column,
      sourceLine: getLineText(code, line),
      note: "make the number of placeholders in the string match the number of values passed to `println!`",
      filename,
    })
  }

  return null
}

function requiresStatementSemicolon(line: string): boolean {
  return /^let\b/.test(line) || /^use\b/.test(line) || /^const\b/.test(line) || /^static\b/.test(line) || /^[a-zA-Z_]\w*\s*=(?!=)/.test(line)
}

function findStatementSemicolonError(code: string, filename: string): string | null {
  const lines = code.split("\n")

  for (let i = 0; i < lines.length; i++) {
    const lineWithoutComment = stripInlineComment(lines[i])
    const trimmed = lineWithoutComment.trim()
    if (!trimmed || !requiresStatementSemicolon(trimmed)) continue

    if (trimmed.endsWith("=>") || /[;{[(,]$/.test(trimmed) || /[=+\-*/%&|:.]$/.test(trimmed)) continue

    const nextIndex = findNextSignificantLine(lines, i + 1)
    const nextTrimmed = nextIndex === -1 ? "" : stripInlineComment(lines[nextIndex]).trim()
    if (nextTrimmed && isContinuationLine(nextTrimmed)) continue

    const foundToken = nextIndex === -1 ? "end of input" : `\`${extractLeadingToken(nextTrimmed)}\``
    return formatRustCompilerError({
      message: `expected \`;\`, found ${foundToken}`,
      line: i + 1,
      column: lineWithoutComment.length + 1,
      sourceLine: lines[i],
      note: "terminate this statement with a semicolon before running the snippet again",
      filename,
    })
  }

  return null
}

function findUndefinedPrintArgumentError(code: string, filename: string): string | null {
  const declaredIdentifiers = collectDeclaredIdentifiers(code)
  const printlnRegex = /println!\s*\(\s*"((?:[^"\\]|\\.)*)"(\s*,\s*([\s\S]*?))?\s*\)\s*;?/g
  let match: RegExpExecArray | null

  while ((match = printlnRegex.exec(code)) !== null) {
    const args = match[3] ? splitTopLevelArgs(match[3]) : []

    for (const arg of args) {
      const trimmedArg = arg.trim()
      if (!/^[a-zA-Z_]\w*$/.test(trimmedArg)) continue
      if (declaredIdentifiers.has(trimmedArg) || RUST_RESERVED_IDENTIFIERS.has(trimmedArg)) continue

      const argumentIndex = match.index + match[0].lastIndexOf(trimmedArg)
      const { line, column } = getLineColumnFromIndex(code, argumentIndex)
      return formatRustCompilerError({
        code: "E0425",
        message: `cannot find value \`${trimmedArg}\` in this scope`,
        line,
        column,
        sourceLine: getLineText(code, line),
        note: "declare the binding before using it or correct the identifier name",
        filename,
      })
    }
  }

  return null
}

function findCompilationError(code: string, filename: string): string | null {
  return (
    findStructuralError(code, filename) ??
    findMissingMainError(code, filename) ??
    findIncompleteBindingError(code, filename) ??
    findFormatStringError(code, filename) ??
    findStatementSemicolonError(code, filename) ??
    findUndeclaredLifetimeError(code, filename) ??
    findUnknownTypeError(code, filename) ??
    findUndefinedPrintArgumentError(code, filename) ??
    findUndefinedValueUsageError(code, filename) ??
    findUndefinedFunctionCallError(code, filename)
  )
}

export function simulateRustExecution(code: string, key?: string, filename = "main.rs"): string {
  const compilationError = findCompilationError(code, filename)
  if (compilationError) return compilationError

  const practiceOutput = simulatePracticeOutput(code, key)
  if (practiceOutput !== null) return practiceOutput

  const ch54Output = simulateCh54Output(code, key)
  if (ch54Output !== null) return ch54Output

  const ch53Output = simulateCh53Output(code, key)
  if (ch53Output !== null) return ch53Output

  const ch52Output = simulateCh52Output(code, key)
  if (ch52Output !== null) return ch52Output

  const ch51Output = simulateCh51Output(code, key)
  if (ch51Output !== null) return ch51Output

  const ch50Output = simulateCh50Output(code, key)
  if (ch50Output !== null) return ch50Output

  const ch49Output = simulateCh49Output(code, key)
  if (ch49Output !== null) return ch49Output

  const ch48Output = simulateCh48Output(code, key)
  if (ch48Output !== null) return ch48Output

  const ch47Output = simulateCh47Output(code, key)
  if (ch47Output !== null) return ch47Output

  const ch46Output = simulateCh46Output(code, key)
  if (ch46Output !== null) return ch46Output

  const ch45Output = simulateCh45Output(code, key)
  if (ch45Output !== null) return ch45Output

  const ch44Output = simulateCh44Output(code, key)
  if (ch44Output !== null) return ch44Output

  const ch43Output = simulateCh43Output(code, key)
  if (ch43Output !== null) return ch43Output

  const ch42Output = simulateCh42Output(code, key)
  if (ch42Output !== null) return ch42Output

  const ch41Output = simulateCh41Output(code, key)
  if (ch41Output !== null) return ch41Output

  const ch40Output = simulateCh40Output(code, key)
  if (ch40Output !== null) return ch40Output

  const ch39Output = simulateCh39Output(code, key)
  if (ch39Output !== null) return ch39Output

  const ch38Output = simulateCh38Output(code, key)
  if (ch38Output !== null) return ch38Output

  const ch37Output = simulateCh37Output(code, key)
  if (ch37Output !== null) return ch37Output

  const ch36Output = simulateCh36Output(code, key)
  if (ch36Output !== null) return ch36Output

  const ch35Output = simulateCh35Output(code, key)
  if (ch35Output !== null) return ch35Output

  const ch34Output = simulateCh34Output(code, key)
  if (ch34Output !== null) return ch34Output

  const ch33Output = simulateCh33Output(code, key)
  if (ch33Output !== null) return ch33Output

  const ch32Output = simulateCh32Output(code, key)
  if (ch32Output !== null) return ch32Output

  const ch31Output = simulateCh31Output(code, key)
  if (ch31Output !== null) return ch31Output

  const ch30Output = simulateCh30Output(code, key)
  if (ch30Output !== null) return ch30Output

  const ch29Output = simulateCh29Output(code, key)
  if (ch29Output !== null) return ch29Output

  const ch28Output = simulateCh28Output(code, key)
  if (ch28Output !== null) return ch28Output

  const ch27Output = simulateCh27Output(code, key)
  if (ch27Output !== null) return ch27Output

  const ch26Output = simulateCh26Output(code, key)
  if (ch26Output !== null) return ch26Output

  const ch25Output = simulateCh25Output(code, key)
  if (ch25Output !== null) return ch25Output

  const ch24Output = simulateCh24Output(code, key)
  if (ch24Output !== null) return ch24Output

  const ch23Output = simulateCh23Output(code, key)
  if (ch23Output !== null) return ch23Output

  const ch22Output = simulateCh22Output(code, key)
  if (ch22Output !== null) return ch22Output

  const ch21Output = simulateCh21Output(code, key)
  if (ch21Output !== null) return ch21Output

  const ch20Output = simulateCh20Output(code, key)
  if (ch20Output !== null) return ch20Output

  const ch19Output = simulateCh19Output(code, key)
  if (ch19Output !== null) return ch19Output

  const ch18Output = simulateCh18Output(code, key)
  if (ch18Output !== null) return ch18Output

  const ch17Output = simulateCh17Output(code, key)
  if (ch17Output !== null) return ch17Output

  const ch16Output = simulateCh16Output(code, key)
  if (ch16Output !== null) return ch16Output

  const ch15Output = simulateCh15Output(code, key)
  if (ch15Output !== null) return ch15Output

  const ch14Output = simulateCh14Output(code, key)
  if (ch14Output !== null) return ch14Output

  const ch13Output = simulateCh13Output(code, key)
  if (ch13Output !== null) return ch13Output

  const ch12Output = simulateCh12Output(code, key)
  if (ch12Output !== null) return ch12Output

  const ch11Output = simulateCh11Output(code, key)
  if (ch11Output !== null) return ch11Output

  const ch10Output = simulateCh10Output(code, key)
  if (ch10Output !== null) return ch10Output

  const ch09Output = simulateCh09Output(code, key)
  if (ch09Output !== null) return ch09Output

  if (key === "ch01_ex_parse_limit") {
    const hasDefault = /None\s*=>\s*Ok\(\s*100\s*\)/.test(code)
    const handlesZeroExplicitly =
      (/(raw|input)\s*==\s*"0"/.test(code) || /limit\s*==\s*0/.test(code)) &&
      /Err\(\s*"limit must be greater than 0"\s*\)/.test(code)
    const parsesNumber = /parse::<usize>\(\)|parse\(\)/.test(code)

    if (hasDefault && handlesZeroExplicitly && parsesNumber) {
      return 'default = Ok(100)\nzero = Err("limit must be greater than 0")\nvalue = Ok(25)'
    }

    return "default = Ok(0)\nzero = Ok(0)\nvalue = Ok(25)"
  }

  if (key === "ch02_ex_classify") {
    const removedWideMutation = !/let\s+mut\s+scaled/.test(code)
    const removedEarlyReturn = !/\breturn\b/.test(code)
    const hasHotBranch = /"hot"/.test(code) && /depth\s*\/\s*2/.test(code)
    const hasSteadyBranch = /"steady"/.test(code) && /depth\s*\+\s*50/.test(code)

    if (removedWideMutation && removedEarlyReturn && hasHotBranch && hasSteadyBranch) {
      return "steady 170\nhot 600"
    }

    return "steady 170\nhot 600\nrefactor still incomplete"
  }

  if (key === "why_rust_pipeline" && code.includes("critical_count")) {
    return "critical count = 3"
  }

  if (key === "why_rust_thread_handoff" && code.includes("thread::spawn")) {
    return "worker started: rebuild-search-index"
  }

  if (key === "mental_model_move_drop" && code.includes("impl Drop for FileHandle")) {
    return "before move\nshipping audit.log\ndrop audit.log\nafter ship"
  }

  if (key === "mental_model_blocks_heap" && code.includes("Vec::with_capacity(8)")) {
    return "status = hot\ncapacity = 8"
  }

  if (key === "project_structure_module_visibility") {
    const configMatch = code.match(/AppConfig::new\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\)/)
    if (configMatch) {
      return `${configMatch[1]}@${configMatch[2]}`
    }
    return "api@127.0.0.1:8080"
  }

  if (key === "project_structure_feature_flags") {
    const metricsEnabled = /const\s+METRICS_ENABLED:\s*bool\s*=\s*true/.test(code)
    return `metrics backend = ${metricsEnabled ? "prometheus" : "disabled"}`
  }

  if (key === "ch03_ex_feature_matrix") {
    const usesExactError = /choose exactly one backend/.test(code)
    const handlesNone = /(if\s*!s3\s*&&\s*!local)|(match\s*\(\s*s3\s*,\s*local\s*\)[\s\S]*\(false,\s*false\)\s*=>\s*Err\()/s.test(code)
    const handlesBoth = /(if\s*s3\s*&&\s*local)|(match\s*\(\s*s3\s*,\s*local\s*\)[\s\S]*\(true,\s*true\)\s*=>\s*Err\()/s.test(code)
    const returnsS3 = /Ok\(\s*"s3"\s*\)/.test(code)
    const returnsLocal = /Ok\(\s*"local"\s*\)/.test(code)

    if (usesExactError && handlesNone && handlesBoth && returnsS3 && returnsLocal) {
      return 'none = Err("choose exactly one backend")\ns3 = Ok("s3")\nlocal = Ok("local")\nboth = Err("choose exactly one backend")'
    }

    return 'none = Err("not configured")\ns3 = Ok("s3")\nlocal = Ok("local")\nboth = Ok("s3")'
  }

  if (key === "ownership_borrowing_shared_mutable") {
    const requestMatch = code.match(/String::from\(\s*"([^"]*)"\s*\)/)
    const traceMatch = code.match(/append_trace\(\s*&mut\s+\w+\s*,\s*"([^"]*)"\s*\)/)
    const request = requestMatch?.[1] ?? "GET /ready"
    const traceId = traceMatch?.[1] ?? "abc-123"
    const lenBefore = request.length

    return `len before = ${lenBefore}\nrequest = ${request} trace=${traceId}`
  }

  if (key === "ownership_borrowing_lifetimes") {
    const routeMatch = code.match(/String::from\(\s*"([^"]*)"\s*\)/)
    const pickLongerMatch = code.match(/pick_longer\(\s*"([^"]*)"\s*,\s*"([^"]*)"\s*\)/)
    const labelMatch = code.match(/make_audit_label\(\s*"([^"]*)"\s*,\s*segment\s*\)/)

    const route = routeMatch?.[1] ?? "/api/health"
    const segment = route.split("/").find((part) => part.length > 0) ?? "root"
    const left = pickLongerMatch?.[1] ?? "job"
    const right = pickLongerMatch?.[2] ?? "request-id"
    const longer = left.length >= right.length ? left : right
    const service = labelMatch?.[1] ?? "gateway"

    return `segment = ${segment}\nlonger = ${longer}\nlabel = ${service}::${segment}`
  }

  if (key === "ch04_ex_build_cache_key") {
    const hasOwnedReturn =
      /fn\s+build_cache_key\s*\(\s*service:\s*&str\s*,\s*route:\s*&str\s*\)\s*->\s*String/.test(code)
    const usesFormatMacro = /format!\s*\(\s*"[^"]*"\s*,\s*service\s*,\s*route\s*\)/.test(code)
    const usesPushStr =
      /push_str\(\s*service\s*\)/.test(code) &&
      /push_str\(\s*route\s*\)/.test(code) &&
      /push\(\s*':'\s*\)/.test(code)
    const usesBothInputs = /service/.test(code) && /route/.test(code)

    if (hasOwnedReturn && usesBothInputs && (usesFormatMacro || usesPushStr)) {
      return "billing:/v1/invoices\nsearch:/ready"
    }

    if (hasOwnedReturn && usesBothInputs) {
      return "billing/v1/invoices\nsearch/ready"
    }

    return "/v1/invoices\n/ready"
  }

  if (key === "ch04_ex_build_cache_key" && code.includes("build_cache_key")) {
    return "/v1/invoices\n/ready"
  }

  if (key === "ch04_ex_build_cache_key") {
    return "/v1/invoices\n/ready"
  }

  if (key === "ownership_structs_owned_views") {
    const rawMatch = code.match(/LogLine::new\(\s*"([^"]*)"\s*\)/)
    const raw = rawMatch?.[1] ?? "INFO: user signed in"
    const separatorIndex = raw.indexOf(":")
    const level = separatorIndex === -1 ? raw.trim() : raw.slice(0, separatorIndex).trim()
    const message = separatorIndex === -1 ? "" : raw.slice(separatorIndex + 1).trim()
    return `level = ${level}\nmessage = ${message}`
  }

  if (key === "ownership_structs_pointer_choices") {
    const delimiterMatch = code.match(/delimiter:\s*"([^"]*)"\.into\(\)/)
    const schemaMatch = code.match(/Arc::from\(\s*"([^"]*)"\s*\)/)
    const hasTemplateClone = /let\s+template_copy\s*=\s*template\.clone\(\)/.test(code)

    const delimiter = delimiterMatch?.[1] ?? "=>"
    const schemaVersion = schemaMatch?.[1] ?? "v2"
    const rcClones = hasTemplateClone ? 2 : 1

    return `box delimiter = ${delimiter}\nrc clones = ${rcClones}\nthread schema = ${schemaVersion}`
  }

  if (key === "ch05_ex_audit_line") {
    const ownsString = /struct\s+AuditLine\s*{[\s\S]*raw:\s*String[\s\S]*}/.test(code)
    const storesInput =
      /Self\s*{\s*raw:\s*(?:raw\.to_string\(\)|String::from\(raw\)|raw\.into\(\))\s*}/.test(code) ||
      /raw:\s*(?:raw\.to_string\(\)|String::from\(raw\)|raw\.into\(\))/.test(code)
    const hasLevelSignature = /fn\s+level\s*\(\s*&self\s*\)\s*->\s*&str/.test(code)
    const derivesFromRaw =
      /self\.raw\.split_once\(\s*':'\s*\)/.test(code) ||
      /self\.raw\.split\(\s*':'\s*\)\.next\(\)/.test(code)

    if (ownsString && storesInput && hasLevelSignature && derivesFromRaw) {
      return "level = WARN\nraw = WARN: cache miss"
    }

    return "level = UNKNOWN\nraw = WARN: cache miss"
  }

  if (key === "ownership_vectors_indices") {
    const taskNames = Array.from(code.matchAll(/push_task\(&mut tasks,\s*"([^"]+)"\)/g), (match) => match[1])
    const taskName = taskNames[0] ?? "billing"
    const total = taskNames.length || 3
    const ready = /\.ready\s*=\s*false/.test(code) ? "false" : "true"

    return `task = ${taskName}\nready = ${ready}\ntotal = ${total}`
  }

  if (key === "ownership_vectors_boxed_stable") {
    const sameAddress = /ptr::eq\(/.test(code)
    const initialAttemptsMatch = code.match(/attempts:\s*(\d+)/)
    const initialAttempts = Number(initialAttemptsMatch?.[1] ?? "1")
    const bumpsAttempts = /attempts\s*\+=\s*1/.test(code)
    const attempts = initialAttempts + (bumpsAttempts ? 1 : 0)
    const clearsRetry = /needs_retry\s*=\s*false/.test(code)
    const retryPending = clearsRetry ? 0 : 1

    return `same address = ${sameAddress}\nattempts = ${attempts}\nretry pending = ${retryPending}`
  }

  if (key === "ch06_ex_task_index") {
    const taskNames = Array.from(code.matchAll(/enqueue\(&mut tasks,\s*"([^"]+)"\)/g), (match) => match[1])
    const firstName = taskNames[0] ?? "billing"
    const wrongName = taskNames[1] ?? firstName
    const total = taskNames.length || 3

    const returnsLenMinusOne = /tasks\.len\(\)\s*-\s*1/.test(code)

    let returnsStoredIndex = false
    const storedIndexMatch = code.match(/let\s+([a-zA-Z_]\w*)\s*=\s*tasks\.len\(\)\s*;[\s\S]*tasks\.push/)
    if (storedIndexMatch) {
      const indexName = storedIndexMatch[1]
      const explicitReturn = new RegExp(`return\\s+${indexName}\\s*;`)
      const implicitReturn = new RegExp(`\\n\\s*${indexName}\\s*\\n\\s*\\}`, "m")
      returnsStoredIndex = explicitReturn.test(code) || implicitReturn.test(code)
    }

    if (returnsLenMinusOne || returnsStoredIndex) {
      return `first = ${firstName}\ntotal = ${total}`
    }

    return `first = ${wrongName}\ntotal = ${total}`
  }

  if (key === "copying_data_moves_copy_clone") {
    const requestId = code.match(/RequestId\((\d+)\)/)?.[1] ?? "42"
    const liveMatch = code.match(
      /let\s+mut\s+live\s*=\s*ServiceConfig\s*{\s*name:\s*String::from\("([^"]+)"\)\s*,\s*retries:\s*(\d+)\s*,/s
    )
    const currentName = liveMatch?.[1] ?? "ingest-v1"
    const initialRetries = Number(liveMatch?.[2] ?? "1")
    const bumpCount = (code.match(/bump_retries\(\);/g) ?? []).length
    const liveRetries = initialRetries + bumpCount
    const replacedName = code.match(/replace_name\(\s*"([^"]+)"\s*\)/)?.[1] ?? "ingest-v2"

    return `request id copy = ${requestId}\nlive retries = ${liveRetries}\nbuilder consumed = ${replacedName}\ncurrent name = ${currentName}`
  }

  if (key === "copying_data_cow_arc") {
    const labels = Array.from(code.matchAll(/normalize_label\(\s*"([^"]*)"\s*\)/g), (match) => match[1])
    const normalize = (value: string) => {
      const trimmed = value.trim()
      return /^[a-z0-9-]+$/.test(trimmed) ? trimmed : trimmed.toLowerCase().replace(/\s+/g, "-")
    }

    const borrowed = normalize(labels[0] ?? "ready")
    const owned = normalize(labels[1] ?? "Mixed Case")
    const strongCount = /Arc::clone\(&\w+\)/.test(code) ? 2 : 1

    return `borrowed = ${borrowed}\nowned = ${owned}\nstrong count = ${strongCount}`
  }

  if (key === "ch07_ex_manual_clone") {
    const hasCloneImpl = /impl\s+Clone\s+for\s+JobTemplate/.test(code)
    const clonesService = /service:\s*self\.service\.clone\(\)/.test(code)
    const clonesSteps = /steps:\s*self\.steps\.clone\(\)/.test(code)
    const copiesRetries = /retries:\s*self\.retries/.test(code)
    const mutatesClone = /cloned\.steps\.push\(/.test(code)

    if (hasCloneImpl && clonesService && clonesSteps && copiesRetries && mutatesClone) {
      return "original = billing 2\ncloned = billing 3\nretries = 2"
    }

    return "original = billing 2\ncloned =  1\nretries = 2"
  }

  if (key === "unsafe_rust_fill_window") {
    const hasBoundsChecks =
      /assert!\(\s*start\s*<=\s*buf\.len\(\)\s*\)/.test(code) &&
      /assert!\(\s*start\s*\+\s*len\s*<=\s*buf\.len\(\)\s*\)/.test(code)
    const usesRawPointer = /as_mut_ptr\(\)/.test(code) && /ptr\.add\(/.test(code) && /write\(value\)/.test(code)

    if (hasBoundsChecks && usesRawPointer) {
      return "header:9999"
    }

    return "header:0000"
  }

  if (key === "unsafe_rust_maybe_uninit") {
    const usesMaybeUninit = /MaybeUninit/.test(code)
    const writesAllBytes =
      /ptr\.add\(0\)\.write\(tag\)/.test(code) &&
      /ptr\.add\(1\)\.write\(size\)/.test(code) &&
      /ptr\.add\(2\)\.write\(tag\s*\^\s*size\)/.test(code) &&
      /ptr\.add\(3\)\.write\(255\)/.test(code)

    return usesMaybeUninit && writesAllBytes && /assume_init\(\)/.test(code) ? "[7, 10, 13, 255]" : "[7, 10, 0, 0]"
  }

  if (key === "serde" && code.includes("serde_json::to_string")) {
    return '{"name":"Alice","age":30}'
  }

  if (key === "regex" && code.includes("Regex::new")) {
    return "Found: 123\nFound: 456\nFound: 7890"
  }

  if (key === "channels" && code.includes("mpsc::channel")) {
    return "Sender: Message sent!\nReceiver: Got 'Hello from thread!'"
  }

  if (key === "mpsc" && code.includes("tx.clone")) {
    return "Main: Server A: Request 1\nMain: Server B: Response 1\nMain: Server A: Request 2\nMain: Server B: Response 2"
  }

  if (key === "ch08_ex_write_magic") {
    const checksLength = /buf\.len\(\)\s*<\s*4/.test(code)
    const returnsError = /Err\(\s*"buffer too small"\s*\)/.test(code)
    const writesBytes =
      /write\(82\)/.test(code) &&
      /write\(83\)/.test(code) &&
      /write\(84\)/.test(code) &&
      /write\(33\)/.test(code)

    if (checksLength && returnsError && writesBytes) {
      return 'short = Err("buffer too small")\nvalue = Ok(())\nbuf = RST!'
    }
    return "short = Ok(())\nvalue = Ok(())\nbuf = RST!"
  }

  const printlnRegex = /println!\s*\(\s*"([^"]*)"(?:\s*,\s*([^)]+))?\s*\)/g
  const outputs: string[] = []
  let match: RegExpExecArray | null
  const variables: Record<string, number | string> = {}
  const letRegex = /let\s+(mut\s+)?(\w+)\s*(?::\s*\w+)?\s*=\s*([^;]+);/g
  let letMatch: RegExpExecArray | null

  while ((letMatch = letRegex.exec(code)) !== null) {
    const varName = letMatch[2]
    const value = letMatch[3].trim()

    if (value.startsWith('"') || value.startsWith("'")) {
      variables[varName] = value.replace(/["']/g, "")
    } else if (value.includes("String::from")) {
      const strMatch = value.match(/String::from\s*\(\s*"([^"]*)"\s*\)/)
      if (strMatch) variables[varName] = strMatch[1]
    } else if (!Number.isNaN(Number(value))) {
      variables[varName] = Number(value)
    } else if (/^\w+$/.test(value) && value in variables) {
      variables[varName] = variables[value]
    }
  }

  const mutationRegex = /(\w+)\s*=\s*(\w+)\s*\+\s*(\w+)\s*;/g
  let mutMatch: RegExpExecArray | null

  while ((mutMatch = mutationRegex.exec(code)) !== null) {
    const target = mutMatch[1]
    const left = mutMatch[2]
    const right = mutMatch[3]
    const leftVal = typeof variables[left] === "number" ? variables[left] : Number(left) || 0
    const rightVal = typeof variables[right] === "number" ? variables[right] : Number(right) || 0
    variables[target] = (leftVal as number) + (rightVal as number)
  }

  while ((match = printlnRegex.exec(code)) !== null) {
    let output = match[1]
    const args = match[2]

    if (args) {
      const argList = args.split(",").map((arg) => arg.trim())
      let argIndex = 0

      output = output.replace(/\{\}/g, () => {
        const arg = argList[argIndex++]
        if (arg && variables[arg] !== undefined) {
          return String(variables[arg])
        }
        return arg || ""
      })
    }

    outputs.push(output)
  }

  return outputs.join("\n") || "No output"
}
