---
name: The One (4DX Operations)
description: Bilingual NGO program dashboard — navy discipline, orange signal, warehouse-truth analytics
colors:
  navy-primary: "#0A3568"
  orange-signal: "#F97316"
  surface-white: "#FFFFFF"
  surface-muted: "#F1F5F9"
  text-primary: "#0F172A"
  text-muted: "#64748B"
  border-subtle: "#E2E8F0"
  success-lead: "#22C55E"
  warning-health: "#EAB308"
  critical-health: "#EF4444"
  activity-violet: "#8B5CF6"
typography:
  body:
    fontFamily: "'Noto Sans Arabic', 'Cairo', 'Inter', system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  title:
    fontFamily: "'Noto Sans Arabic', 'Cairo', 'Inter', system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.35
  label:
    fontFamily: "'Noto Sans Arabic', 'Cairo', 'Inter', system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "0.02em"
rounded:
  sm: "calc(0.5rem - 4px)"
  md: "calc(0.5rem - 2px)"
  lg: "0.5rem"
spacing:
  sm: "0.5rem"
  md: "1rem"
  lg: "1.5rem"
components:
  button-primary:
    backgroundColor: "{colors.navy-primary}"
    textColor: "{colors.surface-white}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.navy-primary}"
    textColor: "{colors.surface-white}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-secondary:
    backgroundColor: "{colors.orange-signal}"
    textColor: "{colors.surface-white}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  card-surface:
    backgroundColor: "{colors.surface-white}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.lg}"
    padding: "24px"
---

# Design System: The One (4DX Operations)

## Overview

**Creative North Star: "The Program Briefing Room"**

Staff review refugee and humanitarian program data in a bright office during working hours. The interface should feel like a trusted internal briefing pack: calm surfaces, one strong navy anchor, orange only where attention is earned. Density is allowed for KPIs and tables, but charts must stay legible in Arabic and English.

This system rejects generic SaaS hero metrics, dark neon ops dashboards, and decorative glass. Cross-filter analytics are a first-class workflow: entire chart columns and legend rows are clickable, not just thin bar fills.

**Key Characteristics:**
- Restrained palette: navy structure, orange accent, green for completion states
- shadcn/Radix components on HSL CSS variables (light default, dark supported)
- Bilingual type stack (Noto Sans Arabic, Cairo, Inter)
- Flat cards with light borders; depth from tone, not heavy shadow
- Data viz uses theme series colors, not fixed indigo defaults

## Colors

Program identity reads navy + warm orange from the 4DX logo, on clean office-white surfaces.

### Primary
- **Deep Program Navy** (#0A3568 / hsl(213 88% 20%)): Sidebar, primary buttons, main chart series, focus rings in light mode.

### Secondary
- **Signal Orange** (#F97316 / hsl(24 95% 53%)): Secondary actions, accent charts, dark-mode primary flip, sidebar highlights.

### Neutral
- **Office White** (#FFFFFF): Page and card backgrounds in light mode.
- **Briefing Gray** (#F1F5F9 / hsl(210 40% 96%)): Muted fills, chart column hit areas, subtle bands.
- **Slate Text** (#0F172A): Body and headings on light surfaces.
- **Muted Label** (#64748B): Hints, axis ticks, filter chip secondary text.
- **Hairline Border** (#E2E8F0): Card and input outlines.

### Semantic (data viz)
- **Completion Green** (#22C55E): Services completed series, positive health.
- **Activity Violet** (#8B5CF6): Alternate chart series.
- **Warning Amber** (#EAB308) / **Critical Red** (#EF4444): Health and destructive states.

**The One Accent Rule.** Orange and navy each have a job: navy carries structure; orange carries attention. Do not add a third competing accent on the same screen.

## Typography

**Body Font:** Noto Sans Arabic, Cairo, Inter, system-ui (with fallbacks)
**Label Font:** Same stack at smaller sizes

**Character:** Professional, readable for mixed Arabic/English labels. No display serif; this is product UI, not editorial marketing.

### Hierarchy
- **Title** (600, 1rem / 16px, 1.35 line-height): Card titles, chart section headers.
- **Body** (400, 0.875rem / 14px, 1.5 line-height): Default UI copy; cap prose near 65–75ch where applicable.
- **Label** (500, 0.75rem / 12px, slight tracking): KPI captions, filter chips, axis hints.

**The Truncate-and-Tooltip Rule.** Long Arabic category names truncate on chart axes; full strings always appear in tooltips and clickable legend rows.

## Elevation

Flat-by-default. Cards use `shadow-sm` and a 1px border, not floating panels. Depth is conveyed with background steps (`background` → `card` → `muted`), especially in dark mode where surfaces step through navy tones.

### Shadow Vocabulary
- **Card rest** (`shadow-sm`): Standard chart and KPI containers only.

**The No-Glass Rule.** Do not use backdrop blur or glassmorphism for dashboards. If emphasis is needed, use a muted background band or a full border.

## Components

Tactile but restrained. Radix primitives with Tailwind utility composition.

### Buttons
- **Shape:** Gently rounded (8px / `rounded-md`)
- **Primary:** Navy fill, white label, hover at 90% opacity
- **Secondary:** Orange fill for high-visibility actions
- **Outline / Ghost:** Border or hover-muted for filters and low-priority actions
- **Focus:** 2px ring using `--ring`, offset 2px

### Cards / Containers
- **Corner Style:** 8px (`--radius` 0.5rem)
- **Background:** `bg-card` on `bg-background`
- **Border:** `border-border/80` for analytics panels
- **Internal Padding:** 24px header (`p-6`), tighter chart body

### Charts (beneficiaries analytics)
- **Vertical bars:** Categories on X; full-column hit target via background band + chart click
- **Gender:** Donut with clickable custom legend (color swatch + label)
- **Filter chips:** Secondary badge with clear control; `aria-pressed` on toggles

### Navigation
- **Sidebar:** Navy background, light text, orange active/hover accents
- **App shell:** Standard top + side pattern; scrollbars hidden until hover on nav lists

## Do's and Don'ts

### Do:
- **Do** pick chart types by data shape (vertical bars for many categories, donut only for low cardinality).
- **Do** make entire chart columns and legend rows filter targets, with tooltips showing full bilingual labels.
- **Do** use CSS variable series colors (`--primary`, `--secondary`, `--lead-color`) for Recharts fills.
- **Do** show sync freshness near analytics when data is warehouse-backed.

### Don't:
- **Don't** use hero-metric cards with gradient numbers and decorative icon grids (per PRODUCT.md).
- **Don't** use pie charts for nationality or product categories.
- **Don't** use generic dark-blue neon ops styling or glassmorphism cards.
- **Don't** use side-stripe colored borders on alerts or KPI callouts.
- **Don't** paste Power BI chrome into surfaces that already have a custom warehouse dashboard.
