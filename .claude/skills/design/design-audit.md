# Design Audit Checklist

Use this checklist when reviewing or recovering degraded designs.

## Quick Audit (30 seconds)

- [ ] **Colors**: Count unique colors — more than 5? Problem.
- [ ] **Spacing**: Spot arbitrary values like `p-[17px]`? Problem.
- [ ] **Weights**: See `font-bold` or `font-black` on headings? Usually too heavy.
- [ ] **Width**: Body text without max-width constraint? Problem.

## Full Audit

### 1. Color System

```bash
# Search for hardcoded colors
grep -r "bg-\(white\|black\|gray\|slate\|zinc\)" components/
grep -r "text-\(white\|black\|gray\|slate\)" components/
grep -r "bg-\[#" components/
```

**Fix:** Replace with semantic tokens:
- `bg-white` → `bg-background`
- `text-black` → `text-foreground`
- `bg-gray-100` → `bg-muted`
- `text-gray-500` → `text-muted-foreground`

### 2. Spacing Consistency

```bash
# Find arbitrary spacing
grep -r "\-\[.*px\]" components/
grep -r "\-\[.*rem\]" components/
```

**Fix:** Map to Tailwind scale:
- `p-[16px]` → `p-4`
- `mb-[24px]` → `mb-6`
- `gap-[32px]` → `gap-8`

### 3. Typography Weight

```bash
# Find heavy weights
grep -r "font-\(bold\|extrabold\|black\)" components/
```

**Fix:** Reduce to elegant weights:
- `font-bold` → `font-medium` (usually)
- `font-extrabold` → `font-semibold` (max)
- `font-black` → `font-medium` or `font-semibold`

### 4. Line Height

```bash
# Body text without line-height
grep -r "text-base\"" components/
grep -r "text-sm\"" components/
```

**Fix:** Add `leading-relaxed` to body text.

### 5. Content Width

Check that prose/text content has max-width:

```tsx
// ✅ Constrained
<article className="max-w-2xl mx-auto">
<div className="max-w-3xl">

// ❌ Unconstrained (unreadable)
<article className="w-full">
```

### 6. Responsive Gaps

```bash
# Non-responsive spacing
grep -r "gap-\d\+\"" components/
```

**Fix:** Add responsive variants:
- `gap-4` → `gap-4 md:gap-6 lg:gap-8`

### 7. Shadow & Border Weight

```bash
# Heavy shadows
grep -r "shadow-\(lg\|xl\|2xl\)" components/
# Heavy borders
grep -r "border-\(2\|4\|8\)" components/
```

**Fix:**
- `shadow-xl` → `shadow-sm` or `shadow`
- `border-2` → `border` (1px default)

## Design Recovery Order

When fixing a degraded design, work in this order:

1. **globals.css** — Fix color tokens first
2. **Layout containers** — Add max-width constraints
3. **Section spacing** — Standardize py-* values
4. **Typography** — Fix weights and line-heights
5. **Components** — Clean up individual elements
6. **Responsive** — Add missing breakpoint styles

## Prevention Rules

To prevent future degradation:

1. Never copy styles from external sources without audit
2. Always check existing patterns before adding new styles
3. Question any arbitrary value — there's usually a scale value
4. Review diffs that touch className for regressions
5. Keep component files focused (<200 lines)
