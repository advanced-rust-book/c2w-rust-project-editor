---
name: web-design-excellence
description: Enforce award-winning, thin, and consistent web design standards when editing any web page, component, or styling. Use when touching HTML, CSS, Tailwind, React components, layouts, or any UI code. Triggers on page styling, component creation, design fixes, layout work, visual updates, CSS changes, Tailwind edits, responsive design, typography, spacing, color systems, or Kibo UI components. Prevents design degradation and maintains visual excellence.
---

# Web Design Excellence Standards

When editing ANY web page, component, or styling code, follow these principles to maintain award-winning, thin, consistent design.

## Core Philosophy

**Restraint is elegance.** The best designs feel effortless because they use less, not more.

- Fewer colors (3-5 max)
- Fewer fonts (2 max)
- More whitespace
- Consistent spacing scale
- Subtle, purposeful animations

## Before Making ANY Visual Change

1. **Read the existing design system first** — Check globals.css, tailwind.config, and existing components
2. **Identify the spacing scale** — Use only values from the existing scale
3. **Map the color palette** — Never introduce new colors without explicit approval
4. **Note typography patterns** — Match existing font sizes, weights, line-heights

## Spacing Rules (Critical)

**Use the Tailwind spacing scale. Never arbitrary values.**

```tsx
// ✅ CORRECT — Uses spacing scale
<div className="p-4 mb-6 gap-4">
<section className="py-16 px-6">
<h1 className="mb-4">

// ❌ WRONG — Arbitrary values break consistency
<div className="p-[18px] mb-[23px]">
<section className="py-[72px]">
```

**Spacing hierarchy for sections:**
- Hero sections: `py-20` to `py-32`
- Content sections: `py-12` to `py-20`
- Component internal: `p-4` to `p-8`
- Element gaps: `gap-2` to `gap-6`

**Never mix margin/padding with gap on the same container.**

## Typography Rules

**Font sizes must follow a scale. Common thin/elegant scales:**

```tsx
// Display/Hero: text-4xl to text-6xl (font-light or font-normal)
// Headings: text-2xl to text-3xl (font-medium max)
// Subheadings: text-lg to text-xl (font-normal)
// Body: text-base (font-normal, leading-relaxed)
// Small/Caption: text-sm (text-muted-foreground)
```

**Weight restraint — thin designs use lighter weights:**
```tsx
// ✅ Elegant — light to medium weights
<h1 className="text-5xl font-light tracking-tight">
<h2 className="text-2xl font-medium">
<p className="text-base font-normal leading-relaxed">

// ❌ Heavy — destroys thin aesthetic
<h1 className="text-5xl font-black">
<h2 className="text-2xl font-extrabold">
```

**Line height for readability:**
- Headings: `leading-tight` or `leading-snug`
- Body text: `leading-relaxed` or `leading-6`
- Never default `leading-normal` for body copy

## Color System (Strict)

**Maximum 5 colors total. Structure:**
1. Primary brand color (1)
2. Neutrals: white, gray scale, black (2-3)
3. Accent for CTAs/highlights (1)

**Use semantic tokens exclusively:**
```tsx
// ✅ CORRECT — semantic tokens
className="bg-background text-foreground"
className="bg-primary text-primary-foreground"
className="text-muted-foreground"
className="border-border"

// ❌ WRONG — hardcoded colors
className="bg-white text-black"
className="bg-slate-900 text-gray-200"
className="bg-[#1a1a1a]"
```

**Never introduce purple/violet unless explicitly requested.**

## Component Architecture

**Split into focused components. Never monolithic files.**

```tsx
// ✅ CORRECT structure
app/page.tsx           → imports sections
components/hero.tsx    → hero section only
components/features.tsx → features grid only
components/cta.tsx     → call-to-action only

// ❌ WRONG — everything in one file
app/page.tsx (500+ lines with all sections)
```

## Kibo UI Component Usage

Kibo UI extends shadcn/ui with composable, functional components. Install via CLI:

```bash
npx shadcn@latest add "https://www.kibo-ui.com/r/[component-name]"
```

**Available Kibo components:** AI Chat, Kanban, Gantt, File Upload, Data Table, Code Block, Timeline, Marquee, Sortable, and more.

**Kibo UI principles:**
- Components are fully customizable (code lives in your project under `components/`)
- Use same Tailwind CSS variable theming as shadcn
- Composable — nest and extend freely
- Built-in functionality without external dependencies

**When using Kibo UI:**
1. Install the component first via CLI
2. Read the installed code to understand its structure
3. Customize by editing the component file directly
4. Maintain the existing theming system — never override with hardcoded colors
5. Keep default padding/spacing unless project scale requires change

## Layout Patterns

**Flexbox first, Grid for 2D layouts only:**
```tsx
// ✅ Flexbox for most layouts
<div className="flex items-center justify-between gap-4">
<nav className="flex items-center gap-6">

// ✅ Grid for explicit 2D needs
<div className="grid grid-cols-3 gap-6">
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
```

**Max-width containers for content:**
```tsx
// ✅ Constrained content width
<div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
<article className="mx-auto max-w-2xl">

// ❌ Full-width body text (unreadable)
<p className="w-full">Long paragraph...</p>
```

## Visual Hierarchy

**Create hierarchy through spacing and typography, not decoration:**
```tsx
// ✅ Hierarchy through space and size
<section className="py-24">
  <h2 className="text-3xl font-medium mb-4">Title</h2>
  <p className="text-lg text-muted-foreground mb-8">Subtitle</p>
  <div className="grid gap-6">

// ❌ Hierarchy through decoration
<section className="py-8 border-4 border-primary shadow-2xl">
  <h2 className="text-3xl font-black underline">TITLE</h2>
```

## Borders & Shadows (Minimal)

**Thin, subtle borders. Minimal shadows.**
```tsx
// ✅ Subtle, elegant
className="border border-border"
className="shadow-sm"
className="ring-1 ring-border"

// ❌ Heavy, dated
className="border-4 border-gray-400"
className="shadow-2xl"
className="drop-shadow-lg"
```

## Responsive Design

**Mobile-first. Use breakpoint prefixes:**
```tsx
// ✅ Mobile-first responsive
className="px-4 sm:px-6 lg:px-8"
className="grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
className="text-2xl sm:text-3xl lg:text-4xl"

// ❌ Desktop-only thinking
className="grid-cols-3" // Breaks on mobile
```

## Animations (Restrained)

**Subtle transitions only. No bouncing, no flash.**
```tsx
// ✅ Subtle, professional
className="transition-colors duration-200"
className="transition-opacity duration-300"
className="hover:bg-muted"

// ❌ Distracting
className="animate-bounce"
className="animate-pulse"
className="transition-all duration-1000"
```

## Pre-Edit Checklist

Before modifying any page or component:

- [ ] Read globals.css for color tokens
- [ ] Read tailwind.config for theme extensions
- [ ] Check existing components for patterns
- [ ] Identify the spacing scale in use
- [ ] Note typography hierarchy
- [ ] Verify max-width constraints
- [ ] Check responsive breakpoint patterns

## Common Mistakes to Avoid

| Mistake | Fix |
|---------|-----|
| Arbitrary spacing values | Use Tailwind scale only |
| Too many colors | Stick to 3-5 total |
| Heavy font weights | Prefer light/normal/medium |
| Missing responsive styles | Always mobile-first |
| Hardcoded colors | Use semantic tokens |
| No max-width on content | Add `max-w-*` containers |
| Giant shadow/border | Use subtle `shadow-sm`, thin borders |
| Mixing margin and gap | Choose one per container |
| Monolithic page files | Split into components |

## Emergency Design Recovery

If design has degraded, audit in this order:

1. **Colors** — Remove all hardcoded, restore semantic tokens
2. **Spacing** — Replace arbitrary values with scale values
3. **Typography** — Reduce weights, fix line-heights
4. **Structure** — Add proper max-width constraints
5. **Components** — Split monolithic files

## AI/LLM Integration Warning

When code is edited by AI tools (Cursor, Codex, Copilot), watch for these common degradations:

- **Color pollution** — AI often adds `bg-white`, `text-gray-*` instead of tokens
- **Arbitrary spacing** — AI guesses pixel values instead of using scale
- **Heavy typography** — AI defaults to `font-bold` everywhere
- **Missing responsive** — AI writes desktop-only styles
- **Over-styling** — AI adds shadows, borders, gradients unnecessarily

**Prevention:** Always include this skill in AI context. Review all className changes in diffs.
