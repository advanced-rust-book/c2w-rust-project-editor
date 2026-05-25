# Kibo UI Component Patterns

Detailed patterns for using Kibo UI components while maintaining design excellence.

## Installation

```bash
# Using Kibo CLI
npx kibo-ui@latest add [component]

# Or via shadcn CLI
npx shadcn@latest add "https://www.kibo-ui.com/r/[component]"
```

## Available Components

Kibo UI provides pre-built functional components:

- **AI Chat** — Chat interfaces with message history, streaming
- **Kanban Board** — Drag-and-drop task boards
- **Gantt Chart** — Timeline/project planning
- **File Upload** — Dropzones with progress
- **Data Table** — Advanced tables with sorting, filtering
- **Code Block** — Syntax highlighted code display
- **Timeline** — Event/activity timelines
- **Marquee** — Scrolling content displays
- **Sortable** — Drag-and-drop reordering

## Theming Integration

Kibo UI uses the same CSS variables as shadcn/ui. Your existing theme applies automatically:

```css
/* globals.css — these apply to Kibo components */
:root {
  --background: 0 0% 100%;
  --foreground: 0 0% 3.9%;
  --primary: 0 0% 9%;
  --primary-foreground: 0 0% 98%;
  /* etc. */
}
```

## Customization Pattern

Components are installed into your codebase, not a node_modules dependency:

```
components/
├── ui/           ← shadcn base components
├── kibo/         ← Kibo UI components (editable)
│   ├── kanban.tsx
│   ├── gantt.tsx
│   └── file-upload.tsx
```

**To customize:**
1. Open the component file directly
2. Modify styles, logic, or structure
3. Maintain the theming variables for consistency

## Composition Examples

### Composing with shadcn

```tsx
import { Card, CardHeader, CardContent } from "@/components/ui/card"
import { Kanban } from "@/components/kibo/kanban"

export function TaskBoard() {
  return (
    <Card className="border-border">
      <CardHeader className="pb-4">
        <h2 className="text-lg font-medium">Tasks</h2>
      </CardHeader>
      <CardContent className="p-0">
        <Kanban columns={columns} />
      </CardContent>
    </Card>
  )
}
```

### Maintaining Thin Aesthetics

```tsx
// ✅ Subtle, elegant Kibo component styling
<FileUpload
  className="border border-dashed border-border rounded-lg p-8
             hover:border-primary/50 transition-colors"
/>

// ❌ Heavy styling breaks consistency
<FileUpload
  className="border-4 border-primary shadow-2xl rounded-3xl p-12"
/>
```

## Design Rules for Kibo Components

1. **Don't over-style** — Components come with good defaults
2. **Use border-border** — Not arbitrary border colors
3. **Subtle hover states** — `hover:bg-muted` not dramatic changes
4. **Consistent spacing** — Match your section/component spacing scale
5. **Typography alignment** — Match your existing type scale

## Common Kibo + Design Patterns

### File Upload (Thin Design)

```tsx
<FileUpload
  className="rounded-lg border border-dashed border-border
             bg-muted/30 p-8 text-center
             hover:bg-muted/50 transition-colors"
>
  <p className="text-sm text-muted-foreground">
    Drag files here or click to browse
  </p>
</FileUpload>
```

### Data Table (Clean Lines)

```tsx
<DataTable
  className="[&_th]:font-medium [&_th]:text-muted-foreground
             [&_td]:py-3 [&_tr]:border-b [&_tr]:border-border"
  data={data}
  columns={columns}
/>
```

### AI Chat (Minimal Interface)

```tsx
<Chat className="max-w-2xl mx-auto">
  <ChatMessages className="space-y-4 p-4">
    {messages.map(m => (
      <ChatMessage
        key={m.id}
        className="text-sm leading-relaxed"
      />
    ))}
  </ChatMessages>
  <ChatInput
    className="border-t border-border p-4 bg-background"
  />
</Chat>
```
