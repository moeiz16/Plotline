# Plotline: design system

> Earthy, calm and plain-spoken. Plotline is used by compliance managers, sourcing teams, reviewers, executives and farmer cooperatives on a phone in the field, so the interface stays quiet, puts the map and the evidence first, and never uses engineering language. Colour carries meaning, not decoration.

## 1. Principles

1. **Map first.** The plot is the unit of proof. Plots appear on a map wherever it helps (overview, map view, supplier, plot page, supplier upload link), always coloured by verdict.
2. **One typeface.** Instrument Sans (variable, bundled offline through `@fontsource-variable/instrument-sans`) at 400, 500 and 600. A system monospace face only for plot, shipment and statement references.
3. **Flat and warm.** Warm off-white canvas, hairline borders, an 8 px radius, one accent colour (deep pine). No gradients, glows, glass or decorative imagery. The only illustration is a static SVG of surveyed parcels.
4. **Calm motion.** 150 to 200 ms fades and pops, skeleton loading, nothing loops. Everything honours `prefers-reduced-motion`.
5. **Plain language.** People read "Land-change signal", "Forest lost since 2021", "Cleared to ship", "EU submission file". Never engineering terms. The satellite change signal is always a second opinion; the legal verdict rests on the official forest maps (EU JRC Global Forest Cover 2020, Hansen Global Forest Change), and disagreements go to a reviewer. The plot page says so.
6. **Honest compliance wording.** "Aligned with EUDR (Regulation (EU) 2023/1115)" and "designed to support your due diligence". Never "certified" or "compliant software". Submission to the EU information system (TRACES) is simulated and always labelled "(demo submission)".
7. **Status is never colour alone.** Every verdict, risk tier, stage and check pairs an icon with a label.

## 2. Brand

The mark is a **surveyed parcel holding a leaf**: an irregular plot outline with five vertex points (how plots are mapped) around a leaf (what the plot proves). Source: `src/components/brand/logo.tsx`; favicon `src/app/icon.svg` (cream mark on a pine tile). The wordmark is lowercase **plotline** in Instrument Sans SemiBold. Tagline: *Deforestation-free, proven plot by plot.* Do not recolour the mark with verdict colours.

## 3. Colour tokens

CSS variables in `src/app/globals.css`, mapped to Tailwind 4 utilities with `@theme inline` (`bg-surface`, `text-muted`, `bg-compliant-soft`, `text-review-fg` …). Dark mode is the `.dark` class set by `next-themes` (light, dark or match the device).

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#F7F5F0` | `#141412` | Canvas (warm off-white / warm near-black) |
| `--surface` | `#FDFCF9` | `#1B1A17` | Cards, popovers |
| `--surface-2` / `-3` | `#F1EEE7` / `#E8E4DA` | `#22211D` / `#2C2A25` | Subtle fills, tracks |
| `--border` / `-strong` | `#E2DDD2` / `#CDC6B7` | `#2F2D28` / `#45423A` | Hairlines, inputs |
| `--fg` / `--fg-muted` / `--fg-subtle` | `#1F1D1A` / `#55504A` / `#6B665D` | `#ECE8DF` / `#B5AEA0` / `#9A9385` | Text (all meet AA on canvas and surface) |
| `--brand` | `#1F5C4D` (pine) | `#6FC0AF` | Primary actions, focus, links, active nav |
| `--compliant` | `#2F7A4E` | `#5DB386` | Compliant, passed, approved |
| `--review` | `#C28A17` | `#E0A63E` | Needs review, warnings, paused |
| `--noncompliant` | `#B23B2E` | `#E26A57` | Non-compliant, failed, overdue, destructive |
| `--pending` | `#5B6B86` | `#8E9DBA` | Pending, not yet checked |

Each status colour has `-soft` (background) and `-fg` (text on soft) variants. The status set was run through the palette validator: green and amber stay separable for protan and deutan vision (ΔE 12 light, 8.4 dark), and every use also carries an icon and a label.

Map layers cannot read CSS variables, so `VERDICT_MAP_COLOR` in `components/domain/status.tsx` holds mid-tone equivalents that read on the street map, the dark theme and satellite imagery.

## 4. Elevation, radius, motion

- Cards: 1 px `--border`, no shadow. `shadow-pop` is the only shadow, for menus, dialogs, toasts and map overlays.
- Radius: 6 px small controls, 8 px default, 10 to 14 px for large marketing panels.
- Motion tokens: `--dur-fast` 150 ms, `--dur` 200 ms, `--ease-out`.

## 5. Layout

- **App shell** (`components/shell/app-shell.tsx`): 240 px sidebar on desktop (organisation card, grouped navigation: Monitor, Supply chain, Organisation), a 56 px top bar (deadline chip, notifications, theme toggle, account menu). Below 1024 px the sidebar becomes a left drawer. Navigation items are hidden when the member's role lacks the permission.
- **Content width** 1240 px (1440 px for map-heavy pages), 16 px gutters on phones. Every page is checked at 390 px with no horizontal page scroll; wide tables scroll inside their card and become stacked rows on phones.
- **Map view** is full height: filter panel and plot list on the left, map on the right; on phones the map sits above the list.
- **Supplier upload link** (`/supplier/[token]`) is a single 672 px column designed for a phone first.

## 6. Components

- `ui/button.tsx`: primary, secondary, ghost, subtle, danger, danger-outline, link; sizes xs to lg and icon.
- `ui/input.tsx`: Input, Textarea, native Select, Field (label, hint, error), PasswordInput, Checkbox.
- `ui/overlays.tsx`: Dialog, Sheet, Popover, Tooltip, Dropdown, ConfirmDialog (Radix primitives).
- `ui/display.tsx`: Card, PageHeader, Badge, Stat, Meter, Chip, Segmented, Tabs, Table, Callout, CopyField, DefinitionList, EmptyState, ErrorState (with retry), skeletons.
- `domain/status.tsx`: VerdictBadge, RiskBadge, ChangeBadge (land-change level), ShipmentBadge, DdsBadge, StageBadge, CheckIcon, CountryLabel.
- `domain/readiness.tsx`: flat stacked verdict bar with a 2 px gap between segments, hover tooltips and a legend.
- `domain/image-compare.tsx`: 2020 versus latest imagery with a draggable divider (keyboard slider underneath) or side by side, plus forest 2020 and loss-since-2021 overlays.
- `map/base.ts`: the street basemap (OpenFreeMap) is re-tinted to Plotline's earthy palette per theme (warm land, muted sage water, quiet labels in Latin script); satellite imagery stays untouched.
- `map/plot-map.tsx`: MapLibre map of plots coloured by verdict, street or satellite background, hover card, selection, fit to plots. Plots are dots when zoomed out and outlines when zoomed in. If the background map cannot load (offline), plots still draw on a plain background with a calm notice.
- `map/draw-map.tsx`: tap-to-place point or tap-each-corner boundary drawing, with undo and "My location".
- `domain/plot-draw-form.tsx`: the draw-and-check flow (live EUDR geolocation feedback while drawing), shared by the supplier upload link and the in-app "Map a plot" dialog.
- `charts/loss-chart.tsx`: forest lost per year, single flat series, hairline grid, tooltip, lazy loaded.

## 7. Accessibility

AA contrast for text and controls, a visible 2 px focus ring, skip link, keyboard-operable everything (map plots are also reachable from the list beside the map), labelled icon buttons, `aria-live` for validation and counts, tabular numerals for metrics, and reduced-motion support.
