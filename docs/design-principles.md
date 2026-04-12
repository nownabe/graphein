# Design Principles

Principles for keeping Graphein's UI/UX consistent. Refer to this document when adding new features to ensure they harmonize with the existing experience.

## 1. Visual Tone

- **Dark-first**: The background uses `--color-page` (#0c0c10) as the base. No light mode is provided.
- **Amber accent**: The primary color is a warm amber (`--color-accent` #e5a00d). It serves as the focal point against the cool dark UI.
- **Restrained decoration**: Communicate through whitespace, typography, and contrast. Avoid excessive ornamentation.

## 2. Color Usage

### Text Hierarchy

| Level | Variable | Usage |
|-------|----------|-------|
| Primary | `text-ink` | Body text, titles, content the user should read first |
| Secondary | `text-secondary` | Supporting info, metadata, descriptions |
| Muted | `text-muted` | Labels, inactive tabs, least prominent elements |

### Background Hierarchy

| Level | Variable | Usage |
|-------|----------|-------|
| Base | `bg-page` | Full-page background |
| Surface | `bg-surface` | Elevated surfaces such as cards and panels |
| Surface hover | `bg-surface-hover` | Hover and interaction states |

### Semantic Colors

| Meaning | Variable | Usage |
|---------|----------|-------|
| Accent | `--color-accent` | CTA buttons, focus rings, brand elements |
| Success | `--color-success` | Completion states, progress bars |
| Danger | `--color-danger` | Destructive actions, overdue warnings |

**Glow variants** (`--color-glow-*`) are used as hover backgrounds to avoid overpowering the semantic color.

## 3. Typography

- Fonts: Plus Jakarta Sans (Latin) + Noto Sans JP (Japanese)
- Headings: `font-bold` or higher, `tracking-tight`
- Body: `text-sm` (14px) as the base size
- Section dividers: `text-xs font-semibold uppercase tracking-wider text-muted`
- Completed state: `line-through text-muted` to visually de-emphasize

## 4. Component Patterns

### Cards

- Border radius: `rounded-[var(--radius-lg)]` (16px)
- Padding: `p-4`
- Border: `border-edge`, changing to `border-muted` on hover
- State variants:
  - Default: `bg-surface border-edge`
  - Done: 50% opacity to de-emphasize
  - Overdue: danger color mixed at 6% into the background

### Buttons

| Type | Style | Usage |
|------|-------|-------|
| Primary | `bg-accent text-page font-semibold` | Main CTAs (save, login) |
| Secondary | `text-muted hover:text-ink hover:bg-surface-hover` | Card actions (edit, status) |
| Danger | `text-muted hover:text-danger hover:bg-glow-danger` | Destructive actions (archive) |

- Size: `text-xs px-2 py-1.5` (on cards) / `text-sm px-6 py-2.5` (on pages)
- Border radius: `rounded-[var(--radius-sm)]` (8px)

### Tabs

- Container: `inline-flex bg-surface rounded-[var(--radius-sm)] p-0.5 border border-edge`
- Active: `bg-accent text-page`
- Inactive: `text-muted hover:text-secondary`
- Both filter tabs and view tabs share the same visual style

### Form Inputs

- Background: `bg-page` (recessed within a surface)
- Border: `border-edge`
- Focus: `outline: 2px solid var(--color-accent)` + `outline-offset: 2px`
- Labels: `text-xs font-semibold text-secondary uppercase tracking-wider`

### Empty States

- Centered: `text-center py-20`
- Icon: muted SVG inside `bg-surface border border-edge`
- Message: `text-secondary text-sm`
- Always design an empty state. Clearly communicate the absence of data to the user.

## 5. Interaction

### Hover-Revealed Actions

Action buttons on cards use the `.actions-reveal` class and are hidden by default, appearing only on card hover. Show choices only when needed to reduce noise.

### Transitions

- Base: `transition-colors duration-150` (fast color changes)
- All properties: `transition-all duration-150` (when multiple properties change)
- Progress bars: `transition-[width] duration-300` (slightly slower to show change)

### Toast Notifications

- Position: fixed bottom-right
- Auto-dismiss: 3.5 seconds
- Variants: success (green border), error (red border)
- Animate in/out with slide + fade

### Target Highlight

Elements linked via URL fragment (`#task-xxx`) pulse with an accent-colored glow over 1.8 seconds to guide the user's attention.

## 6. Layout

### Page Structure

```
<Layout>              ← HTML shell (head, fonts, scripts)
  <Nav />             ← Fixed navigation (sticky top-0 z-10, backdrop-blur)
  <main>              ← max-w-3xl mx-auto px-6 py-10
    <page content>
  </main>
</Layout>
```

- Content width: `max-w-3xl` (48rem / 768px)
- Navigation bar is semi-transparent (`bg-page/70`) with blur (`backdrop-blur-xl`)

### Section Dividers

List group dividers follow the pattern: horizontal line + section label + count:

```
[icon] LABEL ────────── count
```

## 7. Accessibility

- Set focus states on all interactive elements (`outline: 2px solid accent`)
- Use `aria-hidden="true"` on decorative icons
- Use the `sr-only` class for screen-reader-only text
- Use `role="progressbar"` with `aria-value*` attributes on progress bars
- Assign `aria-label` with the task title on checkboxes

## 8. htmx Integration

- Page transitions via `hx-boost="true"`: swap content without full-page reload
- Partial rendering: detect `HX-Request` header and return a fragment without the Layout wrapper
- Loading state: `.htmx-request` sets 50% opacity + spinner
- Swap animations: settling (200ms fade-in) / swapping (80ms fade-out)

## 9. Icons

- Use inline SVGs (no icon fonts or images)
- Size: 10-11px for metadata, 18-24px for UI elements
- Stroke style: `stroke-width="1.2"` to `"1.5"`, `stroke-linecap="round"`, `stroke-linejoin="round"`
- Color: use `currentColor` to inherit from text color

## 10. i18n Considerations

- Retrieve all user-facing text via `t(locale, "key")`
- Never hardcode strings in the UI
- Keep labels concise enough to read naturally in both Japanese and English
- Account for variable text length so layouts do not break across locales

## Checklist for New Features

- [ ] Uses existing color variables and semantic colors (consider whether existing colors can express the intent before adding new ones)
- [ ] Applies the text hierarchy correctly (ink / secondary / muted)
- [ ] Designs an empty state
- [ ] Designs hover, focus, and loading states
- [ ] Adds i18n message keys for both ja and en
- [ ] Supports htmx partial rendering
- [ ] Addresses accessibility (focus states, ARIA attributes, semantic HTML)
