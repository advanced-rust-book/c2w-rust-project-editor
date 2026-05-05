import { RUST_COMPILER_ERROR_PREFIX } from "./rust-simulator"

export const CONDITIONS = [
  "predator_adjacent",
  "predator_near",
  "fish_here",
  "fish_up",
  "fish_right",
  "fish_down",
  "fish_left",
  "open_up",
  "open_right",
  "open_down",
  "open_left",
  "safe_up",
  "safe_right",
  "safe_down",
  "safe_left",
  "on_sand",
  "on_water",
] as const

export const ACTIONS = [
  "up",
  "right",
  "down",
  "left",
  "stay",
  "escape",
  "chase_fish",
  "wander_clockwise",
  "wander_counterclockwise",
  "random_safe",
] as const

export const DIRECT_ACTIONS = ["up", "right", "down", "left", "stay"] as const

export type StrategyCondition = (typeof CONDITIONS)[number]
export type StrategyAction = (typeof ACTIONS)[number]
export type DirectAction = (typeof DIRECT_ACTIONS)[number]

export type StrategyRule = {
  conditions: StrategyCondition[]
  action: StrategyAction
  label: string
}

export type CompiledStrategy = {
  rules: StrategyRule[]
  fallback: StrategyAction
  sourceKind: "trait" | "builder"
}

const VIEW_METHOD_TO_CONDITION: Record<string, StrategyCondition> = {
  predator_adjacent: "predator_adjacent",
  predator_near: "predator_near",
  fish_here: "fish_here",
  fish_up: "fish_up",
  fish_right: "fish_right",
  fish_down: "fish_down",
  fish_left: "fish_left",
  open_up: "open_up",
  open_right: "open_right",
  open_down: "open_down",
  open_left: "open_left",
  safe_up: "safe_up",
  safe_right: "safe_right",
  safe_down: "safe_down",
  safe_left: "safe_left",
  on_sand: "on_sand",
  on_water: "on_water",
}

const ACTION_VARIANT_TO_ACTION: Record<string, StrategyAction> = {
  Up: "up",
  Right: "right",
  Down: "down",
  Left: "left",
  Stay: "stay",
  Escape: "escape",
  ChaseFish: "chase_fish",
  WanderClockwise: "wander_clockwise",
  WanderCounterclockwise: "wander_counterclockwise",
  RandomSafe: "random_safe",
}

function createCompilerStyleError(message: string) {
  return `${RUST_COMPILER_ERROR_PREFIX}error: ${message}`
}

function findMatchingBrace(source: string, openBraceIndex: number) {
  let depth = 0
  let inString = false
  let escaped = false
  let inLineComment = false

  for (let index = openBraceIndex; index < source.length; index += 1) {
    const char = source[index]
    const next = source[index + 1]

    if (inLineComment) {
      if (char === "\n") {
        inLineComment = false
      }
      continue
    }

    if (inString) {
      if (escaped) {
        escaped = false
        continue
      }

      if (char === "\\") {
        escaped = true
        continue
      }

      if (char === '"') {
        inString = false
      }

      continue
    }

    if (char === "/" && next === "/") {
      inLineComment = true
      index += 1
      continue
    }

    if (char === '"') {
      inString = true
      continue
    }

    if (char === "{") {
      depth += 1
      continue
    }

    if (char === "}") {
      depth -= 1
      if (depth === 0) {
        return index
      }
    }
  }

  return -1
}

function extractFunctionBody(source: string, functionName: string) {
  const signature = new RegExp(`\\bfn\\s+${functionName}\\s*\\(`)
  const match = signature.exec(source)
  if (!match) return null

  const openBraceIndex = source.indexOf("{", match.index)
  if (openBraceIndex === -1) return null

  const closeBraceIndex = findMatchingBrace(source, openBraceIndex)
  if (closeBraceIndex === -1) return null

  return source.slice(openBraceIndex + 1, closeBraceIndex)
}

function splitBooleanExpression(expression: string, operator: "&&" | "||") {
  const parts: string[] = []
  let current = ""
  let parenDepth = 0
  let bracketDepth = 0
  let braceDepth = 0
  let inString = false
  let escaped = false

  for (let index = 0; index < expression.length; index += 1) {
    const char = expression[index]
    const next = expression[index + 1]

    if (inString) {
      current += char
      if (escaped) {
        escaped = false
        continue
      }

      if (char === "\\") {
        escaped = true
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

    if (
      char === operator[0] &&
      next === operator[1] &&
      parenDepth === 0 &&
      bracketDepth === 0 &&
      braceDepth === 0
    ) {
      if (current.trim()) {
        parts.push(current.trim())
      }
      current = ""
      index += 1
      continue
    }

    current += char
  }

  if (current.trim()) {
    parts.push(current.trim())
  }

  return parts
}

function parseActionVariant(variant: string): StrategyAction | null {
  return ACTION_VARIANT_TO_ACTION[variant] ?? null
}

function extractConditions(expression: string): StrategyCondition[] {
  const conditions = Array.from(
    expression.matchAll(/view\.([a-z_][a-z0-9_]*)\(\)/g),
    (match) => VIEW_METHOD_TO_CONDITION[match[1]]
  ).filter((value): value is StrategyCondition => Boolean(value))

  return Array.from(new Set(conditions))
}

function parseRuleExpression(expression: string, action: StrategyAction): StrategyRule[] {
  const disjuncts = splitBooleanExpression(expression, "||")
  const rules: StrategyRule[] = []

  for (const disjunct of disjuncts) {
    const conditions = extractConditions(disjunct)
    if (conditions.length === 0) {
      continue
    }

    rules.push({
      conditions,
      action,
      label: conditions.join(" && "),
    })
  }

  return rules
}

function parseTrailingFallback(chooseActionBody: string): StrategyAction | null {
  const matches = Array.from(chooseActionBody.matchAll(/Action::([A-Za-z_][A-Za-z0-9_]*)/g))
  const last = matches[matches.length - 1]?.[1]
  return last ? parseActionVariant(last) : null
}

function compileTraitStrategy(code: string): { strategy?: CompiledStrategy; output: string } {
  if (!/trait\s+BeachView\b/.test(code)) {
    return { output: createCompilerStyleError("expected a `trait BeachView` interface in the strategy source") }
  }

  if (!/trait\s+CrabStrategy\b/.test(code)) {
    return { output: createCompilerStyleError("expected a `trait CrabStrategy` interface in the strategy source") }
  }

  if (!/impl\s+CrabStrategy\s+for\s+[A-Za-z_][A-Za-z0-9_]*/.test(code)) {
    return { output: createCompilerStyleError("expected `impl CrabStrategy for ...` in the strategy source") }
  }

  if (!/fn\s+strategy\s*\(\s*\)/.test(code)) {
    return { output: createCompilerStyleError("expected `fn strategy()` as the entry point") }
  }

  const chooseActionBody = extractFunctionBody(code, "choose_action")
  if (!chooseActionBody) {
    return { output: createCompilerStyleError("expected `fn choose_action(&self, view: &dyn BeachView) -> Action`") }
  }

  const ifBlocks = Array.from(
    chooseActionBody.matchAll(
      /if\s+([\s\S]*?)\s*\{\s*return\s+Action::([A-Za-z_][A-Za-z0-9_]*)\s*;\s*\}/g
    )
  )

  const rules: StrategyRule[] = []
  for (const [, expression, actionVariant] of ifBlocks) {
    const action = parseActionVariant(actionVariant)
    if (!action) {
      return {
        output: createCompilerStyleError(
          `unknown action variant \`Action::${actionVariant}\`; try one of: ${Object.keys(ACTION_VARIANT_TO_ACTION).join(", ")}`
        ),
      }
    }

    const parsedRules = parseRuleExpression(expression, action)
    if (parsedRules.length === 0) {
      return {
        output: createCompilerStyleError(
          `could not understand \`if ${expression.trim()}\`; use BeachView methods such as view.fish_right() or view.safe_right()`
        ),
      }
    }

    rules.push(...parsedRules)
  }

  if (rules.length === 0) {
    return {
      output: createCompilerStyleError(
        "expected at least one `if view.some_condition() { return Action::...; }` rule inside `choose_action`"
      ),
    }
  }

  const fallback = parseTrailingFallback(chooseActionBody)
  if (!fallback) {
    return {
      output: createCompilerStyleError(
        "expected `choose_action` to end with a fallback action such as `Action::Stay`"
      ),
    }
  }

  const strategy: CompiledStrategy = {
    rules,
    fallback,
    sourceKind: "trait",
  }

  return {
    strategy,
    output: [
      `Compiled trait-based beach strategy with ${strategy.rules.length} rule(s).`,
      `Fallback = ${strategy.fallback}`,
      `Mode = interface + strategy`,
      `Move budget = 50 tide steps`,
    ].join("\n"),
  }
}

function compileLegacyBuilderStrategy(code: string): { strategy?: CompiledStrategy; output: string } {
  if (!/fn\s+strategy\s*\(\s*\)/.test(code)) {
    return { output: createCompilerStyleError("expected `fn strategy()` as the entry point") }
  }

  const rules = Array.from(
    code.matchAll(/\.rule\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\)/g),
    (match) => ({
      condition: match[1],
      action: match[2],
    })
  )

  if (rules.length === 0) {
    return {
      output: createCompilerStyleError(
        "expected at least one legacy `.rule(\"condition\", \"action\")` entry or a trait-based `choose_action` implementation"
      ),
    }
  }

  const compiledRules: StrategyRule[] = []
  for (const rule of rules) {
    if (!(CONDITIONS as readonly string[]).includes(rule.condition)) {
      return {
        output: createCompilerStyleError(
          `unknown condition \`${rule.condition}\`; try one of: ${CONDITIONS.join(", ")}`
        ),
      }
    }

    if (!(ACTIONS as readonly string[]).includes(rule.action)) {
      return {
        output: createCompilerStyleError(
          `unknown action \`${rule.action}\`; try one of: ${ACTIONS.join(", ")}`
        ),
      }
    }

    compiledRules.push({
      conditions: [rule.condition as StrategyCondition],
      action: rule.action as StrategyAction,
      label: rule.condition,
    })
  }

  const fallbackMatch = code.match(/\.fallback\(\s*"([^"]+)"\s*\)/)
  const fallback = (fallbackMatch?.[1] as StrategyAction | undefined) ?? "stay"

  if (!(ACTIONS as readonly string[]).includes(fallback)) {
    return {
      output: createCompilerStyleError(
        `unknown fallback action \`${fallback}\`; try one of: ${ACTIONS.join(", ")}`
      ),
    }
  }

  const strategy: CompiledStrategy = {
    rules: compiledRules,
    fallback,
    sourceKind: "builder",
  }

  return {
    strategy,
    output: [
      `Compiled legacy beach builder with ${strategy.rules.length} rule(s).`,
      `Fallback = ${strategy.fallback}`,
      `Mode = legacy builder`,
      `Move budget = 50 tide steps`,
    ].join("\n"),
  }
}

export function compileStrategy(code: string): { strategy?: CompiledStrategy; output: string } {
  if (/Strategy::new\(\)/.test(code) || /\.rule\(\s*"[^"]+"\s*,\s*"[^"]+"\s*\)/.test(code)) {
    return compileLegacyBuilderStrategy(code)
  }

  return compileTraitStrategy(code)
}
