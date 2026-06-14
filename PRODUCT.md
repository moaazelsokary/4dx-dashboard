# Product

## Register

product

## Users

Program managers, strategic topic leads, case workers, and executives at an NGO running refugee and humanitarian programs. They work in offices during planning meetings and day-to-day operations, often switching between Arabic and English content. Case workers need a narrow path to find individual beneficiary case stories; managers need portfolio-level KPIs and drill-down analytics.

## Product Purpose

The One (4DX-aligned) is an internal operations and planning platform: WIG dashboards, strategic topics (Refugees, Returnees, Relief, Volunteers, Awareness), beneficiary warehouse analytics synced from Odoo, Power BI embeds for enterprise reporting, and role-based access. Success means staff can trust synced numbers, filter cohorts quickly, and open a case story without leaving the app.

## Brand Personality

Clear, dependable, professional. Calm confidence over flashy dashboards. Bilingual-friendly (Arabic and English labels). Feels like a serious program tool, not a generic SaaS template.

## Anti-references

- Generic dark-blue "ops" dashboards with neon accents
- Hero-metric cards with gradient numbers and stock icons
- Pie charts for high-cardinality dimensions (nationality, categories)
- Power BI chrome pasted into every screen when custom warehouse data is enough
- Decorative glassmorphism, side-stripe alert cards, AI-slop card grids

## Design Principles

1. **Data shape drives the chart**: pick vertical bars, horizontal bars, or donut based on cardinality and reading order, not habit.
2. **Cross-filter is the workflow**: clicking a segment filters the whole beneficiaries view; labels and legend must be clickable and readable.
3. **Warehouse truth**: show sync freshness; prefer precomputed analytics for speed; filter live when slices are active.
4. **Role-appropriate surfaces**: case workers get case story only; admins get sync and configuration.
5. **Bilingual by default**: long Arabic labels truncate on axis but show in full in tooltips and legend buttons.

## Accessibility & Inclusion

Target WCAG 2.1 AA where practical: contrast on chart labels, keyboard-focusable legend filters and toggles, `aria-pressed` on filter chips. Support RTL text via bidirectional components. Respect `prefers-reduced-motion` for any future transitions.
