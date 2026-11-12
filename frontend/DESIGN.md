# Plotline: Field Atlas design system

> **The map is the application.** Plotline is a surveyor's atlas and field book for EU deforestation-regulation (EUDR) evidence. Plots are surveyed on the map, judged against the official forest maps of 31 December 2020, written into ruled ledgers, and bound into a due diligence statement. Every screen is a sheet of that atlas: map paper, slate ink, one marker-orange flag.

This document replaces the v1 design, which was rejected for copying Necessa's structure. Sections 1–3 are the concept and its research. Sections 4–8 are the system that is built (tokens, shell, components, motion). Section 9 is the page-by-page spec for the builders, with wireframes. Section 10 lists rules from QA that still apply.

---

## 0. References (researched 14 Nov 2026)

| # | Reference | URL | What we took |
|---|---|---|---|
| 1 | **Felt** (collaborative maps) | https://felt.com | A slim **live coordinate / zoom readout strip** above the header used as decorative map chrome → our masthead tier 1 and the Atlas status line (`6.6885° N · 1.6244° W · Z 11`). Layer panel with **live counts** next to each layer name → Ledger panel counts. Feature popups as attribute records → map field tags. |
| 2 | **Global Forest Watch / Global Nature Watch** map (Vizzuality) | https://www.globalforestwatch.org/map/ · https://vizzuality.com/project/global-forest-watch | The **annual tree-cover-loss time slider** and the legend panel where layers are reordered, faded and date-filtered → our time ruler 2018 – 2026 with the cut-off marked, and the legend inside the Ledger panel. Loss shown as its own layer, never mixed into the basemap. |
| 3 | **Planet Explorer** compare & timeline | https://developers.planet.com/docs/apps/explorer/how-to-analyze-imagery · https://www.planet.com/pulse/compare-and-timelapse-planet-explorer | The **swipe compare** (drag a divider between two dates, keyboard operable) and the interval-stepped time slider → inspector before/after slider (2020 ↔ latest) and the ruler's yearly ticks. |
| 4 | **kepler.gl** time playback | https://docs.kepler.gl/docs/user-guides/h-playback | A **bottom-docked playback widget with a histogram** behind the range handle, play button and speed → the time ruler carries a tiny histogram of hectares lost per year behind its ticks, and a ▶ "survey" play button that sweeps 2018 → 2026. |
| 5 | **Windy** | https://www.windy.com | **Full-bleed map with chrome floating at the edges**: timeline across the bottom, layer picker on the side, nothing boxing the map → Atlas is full viewport under the masthead, with floating panels only. |
| 6 | **Mapbox Studio** style editor | https://www.mapbox.com/mapbox-studio | Dense **layer list typography** (small mono labels, values right-aligned) and the panel ↔ canvas split → inspector drawer density, right-aligned mono figures. |
| 7 | **Satelligence** (EUDR monitoring) | https://www.satelligence.com | Domain proof: their story leads with "Start with EUDR" and frames monitoring as *first to know, first to act* → our field notes are written as actions ("Agree replacement sourcing…"). We avoided their corporate hero + logo-strip layout. |
| 8 | **Sylvera / Kontur / Carbon Direct (ex-Pachama)** | https://www.sylvera.com · https://www.kontur.io · https://carbon-direct.com | Counter-examples: all use the same SaaS hero + product tiles + logo carousel. We deliberately do none of it (no hero card, no logo strip, no 4-up stats). |
| 9 | **Into the Amazon**, National Geographic × Gladeye (Awwwards SOTD, Apr 2025) | https://www.awwwards.com/sites/into-the-amazon | **Scroll-led storytelling with map fly-throughs** and a two-colour palette → the landing page is a scroll story driven by one sticky map scene; two inks + one accent. |
| 10 | **San Rita studio site** (topographic navigation) | https://abduzeedo.com/node/89189 | **Navigation as terrain** and a staged reveal (lines sprout, water draws in), vintage-cartography paper grain → contour backgrounds on sign-in/landing, paper grain on the canvas, outlines that draw themselves. |
| 11 | **NYT Graphics** (Derek Watkins' satellite pieces, e.g. Greenland) | https://betternews.org/new-york-times-graphics-editor-designed-greenland-melting-away/ | **Sticky imagery + stepped captions**, serif narrative over imagery, restrained labels → landing steps 2–4 (survey → before/after → verdict) and the inspector's narrative "field note". |
| 12 | **Reuters Graphics "Vanishing rainforests"** | https://googlemapsmania.blogspot.com/2021/12/destroying-rainforests.html | **Scaled, side-by-side comparisons** of cleared area → "6.4 ha cleared" is always drawn at the plot's own scale (hatched) next to the number. |
| 13 | **The Pudding** | https://pudding.cool | Editorial voice and **numbered issues** (#229, #228…) → numbered field-procedure steps (01–05) on the landing, line numbers in ledgers. |
| 14 | **Bloomberg Green** | https://www.bloomberg.com/green | Serif headlines over very quiet data furniture, coloured data only where it carries meaning → serif titles, monochrome chrome, colour only for verdicts and the marker. |
| 15 | **Linear** (density only, not copied) | https://linear.app | Row density, keyboard-first list navigation (`j`/`k`, `enter`), 32–40 px rows → ledger row height and keyboard behaviour. Not its look: no sidebar, no sans, no rounded chrome. |

---

## 1. Concept

### Metaphor: the field atlas and the surveyor's ledger
A surveyor walks the land, drives stakes at the corners, reads the instruments, writes each measurement on a ruled line in a field book, and back at the desk binds the sheets into a signed report. Plotline is exactly that, for deforestation evidence:

| Surveyor | Plotline |
|---|---|
| The atlas sheet | **Atlas** home: the full-viewport map of every plot |
| Stakes and boundary | A supplier's plot outline (drawn, vertex by vertex) |
| Reading the instruments | Official forest maps (JRC 2020, Hansen loss) + the land-change signal as second opinion |
| The field book | **Ledgers**: plots, suppliers, reviews, countries, activity |
| The bill of lading | **Manifest**: a shipment and the plots it came from |
| The signed report | **Statement**: the due diligence statement as a paper document |
| The route plan | **Campaign**: a route of supplier stops, each with its stage |
| The deadline stake | `D–46 · 30 DEC 2026` in the masthead |

### The user's mental model
"Where is my risk on the map, which line in which ledger proves it, and what do I file?" The compliance manager starts on the map, not on a dashboard. Everything that has a location is shown on the map first; everything that is a list is a ruled ledger; everything that is filed is a document.

### Primary workflow
1. **Atlas** — open on the region where the plots are. Read the Ledger panel (readiness bar, counts, field notes). Scrub the time ruler past 31 Dec 2020 and watch the loss appear on the hatched plots.
2. **Inspect** — click a plot: the map flies to it, the outline draws itself, the inspector slides in with the before/after slider, the verdict glyph, the evidence and the reviewer action.
3. **Review** — the Reviews ledger lists plots waiting for a person; confirm or overturn with a note.
4. **Ship** — a shipment manifest shows each line traced to its plots and the checks; cleared or blocked.
5. **File** — the statement opens as a paper document on the desk; submit (demo submission) and it is stamped.
6. **Chase** — campaigns read as a route of supplier stops: requested → reminded → submitted → checked → approved.

### Navigation model
- **No sidebar.** A two-tier **masthead** like a map sheet's title block. Tier 1: organisation · role · regulation line, then *Dispatches* and the account. Tier 2: wordmark, then section tabs in mono caps `ATLAS · SUPPLIERS · SHIPMENTS · STATEMENTS · CAMPAIGNS · REVIEWS · COUNTRIES`, then the **deadline stake**.
- **Admin is in the account menu** (Activity log, Members, Settings, theme "Sheet: Paper / Night satellite / Match my device", Sign out).
- **Phones**: a bottom tab bar (`ATLAS · SUPPLIERS · SHIPMENTS · REVIEWS · MORE`) and a "More" bottom sheet with the remaining sections, admin pages, theme and sign-out.
- **Page transitions slide along the tabs**: going right on the masthead slides the new sheet in from the right; list → detail inside one tab rises 8 px.

### Signature interactions
1. **The time ruler** (Atlas): a ruler from 2018 to 2026 with the cut-off `31 DEC 2020` marked in marker orange. Scrubbing left of the cut-off shows the land as it was (forest 2020); crossing it reveals loss year by year on the hatched plots; a tiny histogram of hectares lost per year sits behind the ticks (kepler.gl). ▶ plays a survey sweep.
2. **Fly-to + self-drawing outline + inspector**: selecting a plot (map or ledger) flies the camera, draws the boundary vertex to vertex (stroke-dashoffset) with pegs dropping at the corners, then the inspector slides in.
3. **The statement as paper**: the DDS is a document on the desk, numbered sections, a mono reference block, and on submission a rubber **stamp** lands (`SUBMITTED (DEMO)`).

### Landing page story (scroll-driven, not hero-left/card-right)
`31 December 2020` → a plot is surveyed → before / after → the verdict → what your team does (numbered field procedure) → the deadline as a ruler. CTAs: **"Open the Northbank atlas"** (demo) and **"Start your atlas"** (sign up). Never "Explore the demo" / "Create an account".

---

## 2. Not Necessa (structural differences, checked side by side)

| | Necessa / Plotline v1 (banned) | Plotline Field Atlas |
|---|---|---|
| Shell | Left sidebar, org card, grouped nav, top bar with bell / theme / avatar | Two-tier masthead, mono caps tabs, deadline stake, "Dispatches" text button, name-button account menu; bottom tab bar on phones |
| Home | "Good morning, Amelie" + 4 KPI cards + boxed map | Full-viewport map, floating translucent Ledger panel, time ruler, inspector drawer. No greeting, no KPI cards |
| Lists | Rounded cards with pill badges | Ruled ledgers, line numbers, mono numerals, square glyph statuses |
| Landing | Headline left, product card right, stat strip, "Explore the demo / Create an account" | Full-bleed scroll story with a huge serif date, sticky survey scene, numbered field procedure, deadline ruler; "Open the Northbank atlas / Start your atlas" |
| Type | System sans / Instrument Sans | Newsreader (serif, variable, optical sizes) + IBM Plex Mono |
| Palette | Neutral grey + indigo / cream + pine | Map paper `#ECE7DB` + slate ink `#1E2A33` + marker orange; dark = night satellite `#0B1014` |
| Shapes | 8 px radius, filled pills, icon-in-circle | 1–4 px radius, hairline + double rules, hatching, dashed hollows, stamps |
| Motion | 150 ms fades | Survey in progress: draw-on outlines, fly-to, ink-in rows, ticking numbers, tab-direction page slides, time-ruler scrub |
| Logo | Leaf in a pentagon | Staked parcel with contour lines and an orange survey flag |

---

## 3. Principles

1. **Map first, ledger second, document last.** Anything with a location is shown on the map. Lists are ledgers. Filed things are paper.
2. **Status is shape + label, never colour alone.** Every verdict, risk tier, stage and check is a square glyph (filled / half / hatched / dashed / hollow / marker diamond) plus a mono caps label.
3. **One accent.** Marker orange marks the one primary action per view, the active tab, focus, the deadline stake, the cut-off on the ruler and the selected plot. Never decoration, never a verdict.
4. **Plain language.** "Land-change signal", "Forest lost since 2021", "Cleared to ship", "EU submission file". The satellite change signal is always a second opinion; the legal verdict rests on the official forest maps (EU JRC Global Forest Cover 2020, Hansen Global Forest Change) and disagreements go to a reviewer.
5. **Honest compliance wording.** "Aligned with EUDR (Regulation (EU) 2023/1115)", "designed to support your due diligence". Never "certified" or "compliant software". Submission to TRACES is simulated and always labelled "(demo submission)".
6. **Forbidden in rendered text:** RAG, retrieval, embeddings, vector, rerank, LLM, model/provider names, LiteLLM, prompt, tokens, SQL, architecture, pipeline, latency, fallback, cache, agent jargon. Never raw hashes (see §10).
7. **Motion means work is happening.** Something draws, flies, inks or ticks because the survey is progressing. Nothing loops except the skeleton sweep. Reduced motion is honoured everywhere.

---

## 4. Tokens (`src/app/globals.css`)

### Colour
New code uses the **atlas names**. Older names (`bg`, `surface`, `fg`, `border`, `brand`, `muted`, `subtle`) remain as aliases so existing pages render, and so do raw `var(--surface)`-style variables; do not use them in new code.

| Tailwind token | CSS var | Light "map paper" | Dark "night satellite" | Use |
|---|---|---|---|---|
| `paper` | `--paper` | `#ECE7DB` | `#0B1014` | Canvas |
| `sheet` | `--sheet` | `#F6F2E9` | `#11181E` | Ledgers, documents, dialogs, panels |
| `sheet-2` / `sheet-3` | | `#E3DDCF` / `#D8D1C0` | `#18212A` / `#212C36` | Tracks, header bands, hover, skeleton |
| `rule` / `rule-strong` | | `#CDC5B2` / `#A89F89` | `#26323D` / `#3D4B58` | Hairlines / inputs and emphasised rules |
| `ink` / `ink-muted` / `ink-subtle` | | `#1E2A33` / `#4A5560` / `#58626C` | `#E9E3D3` / `#AEB4B6` / `#8E979D` | Text (AA on paper and sheet) |
| `marker` | `--marker` | `#D4561C` | `#FF7A3D` | Strokes, flags, map highlight (non-text) |
| `marker-ink` | | `#A63A0C` | `#FF8C55` | Orange text (AA) |
| `marker-fill` / `marker-hover` / `marker-contrast` | | `#B8430E` / `#9C380B` / `#FFF` | `#FF7A3D` / `#FF9361` / `#140A04` | Primary button |
| `marker-soft` | | `#F3DCCB` | `#2D1A10` | Selected row wash |
| `compliant` (+`-soft`, `-fg`) | | `#2D6A3E` forest green | `#6CC08A` | Filled square |
| `review` | | `#9A6A06` ochre | `#E2B04C` | Half-filled square |
| `noncompliant` | | `#A8213A` crimson | `#F27382` | **Hatched** square |
| `pending` | | `#56626F` slate | `#94A2B1` | **Dashed hollow** square |
| `panel` / `panel-border` | | sheet @ 88 % | sheet @ 84 % | Floating map panels (blurred) |

Map layers cannot read CSS variables: use `VERDICT_MAP_COLOR` and `MARKER_HEX` from `domain/status.tsx` and `ensureHatchPattern(map)` from `map/hatch.ts`.

### Type
- **Newsreader Variable** (`font-serif`, the body face; optical sizing on) — headings, narrative, table cell text, form text. Weights 400–600, italic for notes, hints, empty states and descriptions.
- **IBM Plex Mono** 400/500/600 (`font-mono`) — nav, buttons, labels, column heads, references (`NB-2026-001`, `CI-NAW-0007`), numerals, coordinates, dates in chrome.
- Utilities: `label-caps` (mono 11 px caps, 0.09 em tracking), `numerals` (mono, tabular, slashed zero), `tabular`.
- Scale: page title 30/38 px serif 500, `-0.02em`; section title `label-caps` with a rule; card title 18 px serif 500; body 15–16 px; notes 13–14.5 px italic; data 12.5–13.5 px mono; labels 10.5–11.5 px mono caps.
- Both fonts are bundled offline via `@fontsource-variable/newsreader` and `@fontsource/ibm-plex-mono` (imported in `app/layout.tsx`). No sans face exists in Plotline.

### Shape, rules, textures
- Radius: `rounded-xs` 1 px, `-sm` 2 px (default for everything), `-md` 3, `-lg` 4, `-xl` 6. No pills (`rounded-full` only for map dots).
- Rules: hairline `border-rule`; **double rule** under page titles and table heads (`border-b-[3px] border-double border-ink/60`); `Rule variant="ticks"` for rulers.
- Elevation: `shadow-pop` (menus, dialogs, floating panels), `shadow-sheet` (paper documents). Cards have no shadow.
- Textures: `hatch` (current colour), `hatch-noncompliant`, `hatch-faint`; `graticule` (48 px survey grid); `contours` (topographic lines, theme-aware); `paper-grain` (fibre noise, on big grounds only); `panel-float` (translucent blurred panel); `ruled` (field-book lines background).

### Motion tokens
`--dur-tick` 120 ms · `--dur-fast` 180 · `--dur` 260 · `--dur-slow` 520 · `--dur-draw` 1100. Easings `--ease-out` (UI), `--ease-survey` `cubic-bezier(.5,0,.1,1)` (drawing, inking, scrubbing), `--ease-in-out`. JS mirrors in `components/motion/tokens.ts`.

---

## 5. Shell (`components/shell/*`, `app/app/layout.tsx`)

```
DESKTOP ≥ 1024 px  (masthead 81 px, sticky, paper @ 85 % + blur)
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ NORTHBANK COCOA & COFFEE IMPORTS GMBH · OWNER · ALIGNED WITH EUDR …   DISPATCHES [7] │ A. KRAUS ▾ │  tier 1, 32 px
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ ⚑▱ Plotline │ ATLAS  SUPPLIERS  SHIPMENTS  STATEMENTS  CAMPAIGNS  REVIEWS⁶  COUNTRIES   [⚑ D–46│30 DEC 2026] │  tier 2, 48 px
│              ▔▔▔▔▔ (3 px marker bar slides between tabs: motion layoutId)                      │
╞══════════════════════════════════════════════════════════════════════════════════════════╡  ink rule
│ <PageTransition> sheet content …                                                          │

PHONE < 1024 px
┌──────────────────────────────┐
│ ⚑▱ Plotline     [⚑D–46] ✉[7] │  52 px
├──────────────────────────────┤
│ content (pb = --tabbar-h)    │
├──────────────────────────────┤
│ ▔▔▔                           │
│ ⌖     ⌂      ⛴      👁⁶   ≡  │  60 px + safe area
│ATLAS SUPPL. SHIPM. REVIEWS MORE│
└──────────────────────────────┘
  MORE → bottom sheet: Sections (Statements, Campaigns, Countries, Plot ledger) · Organisation (Activity log, Members, Settings) · Sheet (Paper / Night satellite / Match my device) · Sign out
```

- `nav.ts`: `TABS` (order = transition direction; `also` maps `/app/map` and `/app/plots` under ATLAS), `ACCOUNT_LINKS`, `MOBILE_PRIMARY`, `isTabActive`, `tabIndexFor`, `allowed(items, perms)`.
- `masthead.tsx`: `Masthead`, `MastheadTabs`, `DeadlineStake({ me, compact })`, `Dispatches({ compact })`, `AccountMenu`, `THEMES`.
- `mobile-tabs.tsx`: `MobileTabBar` (+ internal `MoreSheet`).
- `app-shell.tsx`: `AppShell` sets `--masthead-h` (53 px / 81 px) and `--tabbar-h` (60 px + safe area / 0). `PageContainer({ wide, bleed })`: 1200 px ledger width, 1440 px `wide`, `bleed` for full-viewport canvases.
- Full-viewport pages: `className="h-[calc(100dvh-var(--masthead-h)-var(--tabbar-h))]"` inside `<PageContainer bleed>`.
- Settings must honour `?tab=members` (the account menu links there).

---

## 6. Component API (use these; do not restyle locally)

### `ui/button.tsx`
`<Button variant size asChild loading>` — mono caps, square. Variants: `primary` (marker, **one per view**), `ink` (strong neutral), `secondary` (ruled outline, hard 2 px ink shadow on hover), `ghost`, `subtle`, `danger`, `danger-outline` (hatches on hover), `link` (serif italic underline). Sizes `xs sm md lg icon icon-sm`. `buttonVariants()` for links styled as buttons.

### `ui/input.tsx`
`Input` (`leading`, `trailing`), `Textarea`, `Select` (native), `PasswordInput`, `Checkbox`, `Label` (mono caps), `Field({ label, hint, error, optional, action })` — hints italic, errors with a hatched square. `fieldClass` for custom inputs. Height 40 px.

### `ui/overlays.tsx`
`Dialog/DialogContent({ title, description, size })` — a field card: 4 px marker strip on top, double rule under the title. `DialogFooter`, `DialogClose`. `Sheet/SheetContent({ side: "right" | "left" | "bottom" })` + `SheetClose`. `Popover/PopoverContent`. `Tooltip({ content })` (ink, mono). `Dropdown*` (`DropdownLabel` is mono caps). `ConfirmDialog`.

### `ui/display.tsx`
| Component | Purpose |
|---|---|
| `Glyph({ tone, size, label })` | The status vocabulary: `compliant` filled ■, `review` half ◩, `noncompliant` hatched ▨, `pending` dashed ⬚, `neutral` hollow □, `brand` marker diamond ◆ |
| `Badge` = `StatusTag({ tone, icon?, children })` | Glyph + mono caps label. **No pills.** `icon` only for non-status tags |
| `Stamp({ tone, angle })` | Rubber stamp (statements, evidence pack, "SAMPLE DATA") |
| `Caps({ as })` | Mono caps label |
| `Coord({ lat, lon, digits })` | `6.6885° N, 1.6244° W` |
| `Rule({ variant: "hair" | "double" | "ticks" | "ink" })` | Rules |
| `Card` / `CardHeader({ title, description, action, icon })` / `CardBody` | A sheet: hairline, 2 px corners, no shadow |
| `Paper` | A document on the desk (`shadow-sheet`) — statements, evidence |
| `FloatingPanel` | Translucent blurred panel over the map |
| `PageHeader({ eyebrow, title, description, actions })` | Sheet title block: mono eyebrow, serif title, double rule |
| `SectionTitle({ action })` | Mono caps title + rule running to the action |
| `Ledger({ label })`, `LedgerHead`, `LedgerRow({ index, number, href, onClick, selected, stagger })` | The ruled field book. `index` → ink-in stagger (CSS, 35 ms apart); `number` → line number in the margin; lay out cells with `className="grid-cols-[…]"` |
| `Table` / `Th` / `Td` | Ledger table: mono caps head over a double rule, hairline rows; `align="right"` cells become mono numerals. No `whitespace-nowrap` on cells — ledgers must fit at 1440 px |
| `Figure({ label, value, unit, sub, tone, size })` | A measured number under a top ink rule. Use in a ruled row or the Ledger panel, **never as a 4-up KPI card grid** |
| `Stat` | Legacy → renders as `Figure`. Don't use in new code |
| `Meter({ value, tone })` | Ruler meter with tenth ticks |
| `DefinitionList({ items })` | Field-book entries with dot leaders |
| `Callout({ tone, title, action })` | **Field note**: tone rule on the left, glyph, serif text |
| `Chip` | Square filter tag (active = ink fill) |
| `Segmented` | Instrument switch (MAP / SATELLITE, 2020 / LATEST) |
| `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` | In-sheet tabs, mono caps, marker underline |
| `EmptyState`, `ErrorState`, `LoadingBlock`, `Skeleton`, `CopyField` | Empty = dashed square + italic note; error = hatched square; loading = unread ledger lines with a survey sweep |

### `domain/status.tsx`
`VerdictBadge`, `RiskBadge`, `ChangeBadge`, `ShipmentBadge`, `DdsBadge`, `StageBadge`, `CampaignStatusBadge`, `CheckIcon`, `CountryLabel`, `VerdictDot({ verdict, size })` (the glyph alone). Metas: `VERDICT_META`, `RISK_META`, `CHANGE_META`, `SHIPMENT_META`, `DDS_META`, `STAGE_META`, `CAMPAIGN_STATUS_META`, `CHECK_META` (each `{ label, tone, icon: <Glyph/> }`). `VERDICT_TONE`, `VERDICT_ORDER`, `dotClass` (bar fills: non-compliant hatched, pending dashed), `VERDICT_MAP_COLOR`, `MARKER_HEX`.

### `domain/readiness.tsx`
`VerdictBar({ split, height })` (square stacked ruler), `VerdictLegend`, `ReadinessRow`.

### `map/*`
`base.ts` basemap re-tinted to map paper / night satellite. `hatch.ts`: `ensureHatchPattern(map, id = "pl-hatch", color)` → use `"fill-pattern": "pl-hatch"` for non-compliant fills and post-cut-off loss. Selected plot: outline `MARKER_HEX`, 2.5 px.

### `brand/logo.tsx`
`Mark({ animated })` — staked parcel with contours and an orange survey flag; `animated` draws the outline (`draw-in`). `Logo({ compact, animated })` — mark + "Plotline" in Newsreader 600. Favicon `app/icon.svg`. Never recolour with verdict colours.

---

## 7. Motion language: "survey in progress" (`components/motion/*`)

`import { … } from "@/components/motion"`. `MotionConfig reducedMotion="user"` is set in `providers.tsx`; every helper also checks `useReducedMotion()` and falls back to a plain fade or the final state. Animate `transform`, `opacity`, `clip-path`, `stroke-dashoffset` only.

| Helper | API | Use |
|---|---|---|
| `PageTransition` | `<PageTransition>{children}</PageTransition>` | Already in the shell. Slides ±28 px along the tab direction; rises 8 px within a tab. **Pages never add their own route transition.** |
| `StaggerList` / `StaggerItem` | `as="ul|ol|div|tbody|dl"`, `delay`; item `as="li|div|tr|section"` | Rows ink in left to right (`clip-path`), 35 ms apart. Or CSS-only: `<LedgerRow index={i}>` / class `ink-in` with `animationDelay` |
| `DrawPath` | `<svg><DrawPath d stroke delay duration inView/></svg>` | Plot outlines, contour lines, the cut-off line, the landing parcel |
| `SurveyOutline` | `points=[[x,y]…] stroke fill pegs inView delay` | A parcel drawn vertex to vertex, then corner pegs drop in, then the fill fades in |
| `CountUp` | `<CountUp value format duration/>` | Numbers tick up once in view (mono, screen readers get the final value). Ledger panel counts, readiness %, hectares |
| `Reveal` | `<Reveal as delay>` | Scroll reveal for landing steps and statement sections |
| tokens | `DUR`, `EASE_SURVEY`, `EASE_OUT`, `STAGGER`, `SPRING_SNAP`, `SPRING_DRAWER` | Inspector drawer uses `SPRING_DRAWER`; tab markers `SPRING_SNAP` |
| CSS | `.ink-in`, `.draw-in` (with `pathLength="1"`), `.skeleton` sweep, `fade-in`, `pop-in`, `sheet-in-*` | Cheap equivalents without JS |

Map motion (MapLibre, not `motion`): `map.flyTo({ center, zoom, speed: 0.9, curve: 1.4, essential: true })`; with reduced motion use `jumpTo`. Layer reveals ramp `fill-opacity`/`line-opacity` via `setPaintProperty` with `*-transition: { duration: 520 }` (set to 0 under reduced motion). Time-ruler scrub: filter/opacity per loss year with a 260 ms paint transition; ▶ play advances one year per 700 ms and stops at 2026.

---

## 8. Do / don't

**Do**
- Start every data page with `PageHeader` and lay data out as `Ledger`/`Table` rows on a `Card` sheet or directly on the paper.
- Use mono for every reference, number, coordinate, date in chrome and every label; serif for everything people read as sentences.
- Pair every status with its glyph + label (`*Badge` components). Non-compliant is always hatched; pending always dashed.
- Use exactly one `primary` (marker) button per view. Secondary actions are `secondary` or `link`.
- Put numbers in context with `Figure` inside ruled rows, with an italic note under them.
- Write microcopy as a field note: plain, specific, action-led ("2 plots wait for a reviewer. Confirm them before NB-2026-008 can ship.").
- Make ledgers fit 1440 px without horizontal scroll; collapse to stacked rows below 640 px; check 390 px with no page overflow.
- Keyboard: ledgers support Tab/Enter; on the Atlas, ←/→ move the time ruler by a year, `Esc` closes the inspector, `[`/`]` step through plots.

**Don't**
- No left sidebar, no greeting ("Good morning…"), no 4-up KPI card grid, no stat strip under a hero, no hero-left/card-right.
- No pills, no rounded-xl cards, no icon-in-a-circle, no gradients, no glow, no Lucide icons as status.
- No "Explore the demo" / "Create an account". Demo CTA: **Open the Northbank atlas**; sign-up CTA: **Start your atlas**; sign-in: **Sign in to your atlas**.
- No raw hashes (`inputsHash`, `resultHash`, `payloadHash`) anywhere, not even in `title`. Show a grouped check code (`27AF-5206-AC10`).
- No new colours. No verdict colours for decoration or for the logo.
- No looping animation (except the skeleton), no parallax for its own sake, no motion that ignores reduced motion.

---

## 9. Page-by-page spec (builders)

Shared rules: every page renders inside the shell; routes and data hooks stay as they are; only the presentation changes. Text sizes and colours come from primitives. Each wireframe shows desktop 1440 px; phone notes follow.

### 9.1 Atlas home — `/app` (also replaces `/app/map`; `/app/map` → `redirect("/app")` or renders the same component)

```
┌ masthead ───────────────────────────────────────────────────────────────────────────────┐
│ MAP (full bleed, h = 100dvh − masthead)                                                  │
│ ┌ LEDGER (FloatingPanel 340 px, top-left 16 px) ┐                     ┌ MAP | SATELLITE ┐ │
│ │ NORTHBANK ATLAS · 26 PLOTS · 199.8 HA         │                     └─────────────────┘ │
│ │ Readiness 58 %  (CountUp)                     │    ▱ ▱      ▨ (hatched)                 │
│ │ ■■■■■■■■■■■■◩◩◩▨▨⬚⬚  (VerdictBar, 10 px)      │      ▱  ◩                               │
│ │ ───────────────────────────────────────────── │                         ┌ REGION ────┐ │
│ │ ■ Compliant ............................ 15   │                         │ W. AFRICA ● │ │
│ │ ◩ Needs review ........................... 5   │                         │ BRAZIL      │ │
│ │ ▨ Non-compliant .......................... 3   │                         │ PERU        │ │
│ │ ⬚ Pending ................................ 3   │                         │ INDONESIA   │ │
│ │ ── FIELD NOTES ─────────────────────────────  │                         └────────────┘ │
│ │ ▨ 3 plots with forest cleared after 2020 →    │                                         │
│ │ ◩ 6 plots wait for a reviewer →               │                                         │
│ │ ▨ 3 shipments blocked →                       │                                         │
│ └───────────────────────────────────────────────┘                                         │
│ 6.6885° N · 1.6244° W · Z 9.2                                       scale ▭▭▭ 10 km      │
│ ┌ TIME RULER (FloatingPanel, bottom, inset 16 px, 64 px tall) ─────────────────────────┐ │
│ │ ▶  2018 ╷ 2019 ╷ 2020 ┃31 DEC 2020┃ 2021 ╷ 2022 ╷ 2023 ╷ 2024 ╷ 2025 ╷ 2026          │ │
│ │    ▁▁ ▁ ▁▁▁ ▁      ┃ (marker)   ┃ ▃▅ █▃ ▂▁ (ha lost / year histogram)             │ │
│ │                                   ◆ handle ── showing loss up to 2023               │ │
│ └──────────────────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────────────┘
  click a plot → flyTo, outline draws (marker 2.5 px), INSPECTOR slides in from the right ↓
┌ INSPECTOR (420 px, right, full map height, FloatingPanel opaque, SPRING_DRAWER) ─────────┐
│ CI-NAW-0007                                  [×]   (mono)                                 │
│ Coopérative Agricole de Nawa · Cocoa · Côte d'Ivoire                                      │
│ ▨ NON-COMPLIANT   2.4 ha of forest cleared in 2022   (serif 20 px)                        │
│ ┌ 2020 ◀━━━━━━━━━┃━━━━━━━━━▶ LATEST ┐  (ImageCompare swipe, keyboard slider)              │
│ │  baseline       │  current + loss  │  [FOREST 2020] [LOSS SINCE 2021] toggles (Chip)    │
│ └─────────────────┴──────────────────┘                                                   │
│ ── EVIDENCE ───────────────────────────                                                   │
│ Forest at end of 2020 ............. 5.1 ha (84 %)                                        │
│ Lost after the cut-off ............ 2.4 ha                                              │
│ Land-change signal ................ ▨ HIGH (second opinion)                              │
│ Cloud-free imagery ................ 92 %                                                 │
│ Check code ........................ 27AF-5206-AC10                                       │
│ ── LOSS BY YEAR (mini bars synced to the ruler) ──                                        │
│ ── ACTIONS ── [CONFIRM VERDICT](primary) [OVERTURN] [OPEN FULL RECORD →]                  │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```
- **Data**: `useDashboard()` (kpis, insights, deadline), plots map GeoJSON (`/plots/map`), plot detail on select (`/plots/{id}`, imagery PNGs).
- **Framing (QA)**: never open at world zoom. Open on the region with most plots (`fitBounds` of that cluster, padding 80 px, leaving room for the Ledger panel), with REGION quick jumps (West Africa cocoa belt, Brazil, Peru, Indonesia) computed from plot centroids by country. Plots: centroid dots < z9, outlines ≥ z9 (filled glyph style: compliant solid 25 % fill, review half-opacity, non-compliant `pl-hatch`, pending dashed `line-dasharray`).
- **Time ruler**: state `year` (2018–2026, default 2026). `year ≤ 2020`: non-compliant plots render as the 2020 forest (green 20 % fill, no hatch) and the inspector imagery shows *baseline*; `year ≥ 2021`: hatch fades in on plots whose loss year ≤ `year` (use `lossByYear` from the plot detail for the selected plot; for the overview treat the verdict as loss-after-cut-off and use the headline year where present). The cut-off line is a `DrawPath` in marker orange. ←/→ keys step a year; `aria-valuetext="Showing forest loss up to 2023"`.
- **Selection** from the map, the Ledger notes, the ledger view (`/app/plots`) or `?plot=<id>` in the URL; `Esc` closes; `[`/`]` previous/next plot.
- **Toggle "MAP ⇄ LEDGER"** in the panel header switches to `/app/plots` (same tab).
- **Phone**: map fills the screen between bars; the Ledger panel becomes a bottom sheet with a 96 px peek (readiness bar + counts); the time ruler sits above it, compact (years every 2); the inspector opens as a full-height bottom sheet.
- No greeting, no KPI cards, no boxed map.

### 9.2 Plot ledger — `/app/plots` and plot record `/app/plots/[id]`
```
PageHeader  eyebrow "ATLAS / LEDGER"   title "Plots"                       [MAP ⇄ LEDGER] [MAP A PLOT](primary)
filters: [search] [■ COMPLIANT][◩ REVIEW][▨ NON-COMPLIANT][⬚ PENDING] [commodity ▾] [country ▾]   26 entries
╞═ #  PLOT          SUPPLIER                 COMMODITY  COUNTRY        AREA     VERDICT          SIGNAL   CHECKED ═╡
│ 01  CI-NAW-0007   Coop. Agricole de Nawa   Cocoa      🇨🇮 Côte d'Iv.  6.1 ha   ▨ NON-COMPLIANT   ▨ HIGH   14 OCT │
│     2.4 ha of forest cleared in 2022 (italic)                                                                    │
│ 02  …                                                                                                            │
```
- `Table` or `Ledger` with line numbers; must fit 1440 px (headline wraps under the reference instead of a column). Row click → `/app?plot=<id>` (atlas inspector) with ⌘/ctrl-click → full record.
- **Plot record** `/app/plots/[id]` (full page, for sharing/printing): left 7/12 = map with drawn outline (`SurveyOutline` feel via MapLibre line + draw), before/after slider, loss-by-year bars; right 5/12 = verdict block (glyph + serif headline), field-book `DefinitionList` of evidence (datasets, versions, check code — never raw hashes), review history as a ruled timeline, similar plots ledger, shipments using this plot. Phone: one column, map first.

### 9.3 Suppliers — `/app/suppliers`, `/app/suppliers/[id]`
```
PageHeader "Suppliers"                                                              [ADD SUPPLIER](primary)
[search] [country ▾] [commodity ▾]                                                       9 suppliers
╞═ #  SUPPLIER                       COUNTRY / RISK         COMMODITIES  PLOTS  READINESS (VerdictBar)  %   LAST UPLOAD ═╡
│ 01  Coop. Agricole de Nawa         🇨🇮 Côte d'Ivoire       Cocoa          4   ■■■■■■■■▨▨            75   13 OCT 2026 │
│     Cooperative · ◆ ACTIVE         □ STANDARD RISK                                                                    │
```
- Detail: header with supplier name (serif), kind, country, contact; a **mini atlas** (map of only their plots, 360 px tall) beside a ledger of their plots; "Create upload link" dialog → `CopyField`; campaigns this supplier is in as route stops.

### 9.4 Shipments → **manifest** — `/app/shipments`, `/app/shipments/[id]`
```
List: PageHeader "Shipments"   filter tags [ALL][■ CLEARED][▨ BLOCKED][□ DRAFT][◆ FILED]           [NEW SHIPMENT]
╞═ REF          PRODUCT                    QTY (kg)   PLOTS/SUPPL.  ORIGIN RISK   STATUS            STATEMENT       ═╡
│ NB-2026-008   Cocoa beans, whole, raw     11,300     2 / 2         □ STANDARD    ▨ BLOCKED · 2 issues  —          │

Detail — a bill of lading on Paper:
┌ Paper ───────────────────────────────────────────────────────────────────────────────┐
│ MANIFEST                       NB-2026-008                         ▨ BLOCKED (Stamp)  │
│ Cocoa beans, whole, raw · HS 1801 · Harvest 2026 · 11,300 kg                        │
╞═ LINE  ORIGIN PLOT    SUPPLIER            COUNTRY  VERDICT        ALLOCATED   CAPACITY ═╡
│ 1      CI-NAW-0007    Coop. de Nawa        CI       ▨ NON-COMPL.   6,200 kg    82 % ▭▭▭▭▭│
│ 2      CI-CAV-0002    Cavally Cocoa        CI       ■ COMPLIANT    5,100 kg    40 % ▭▭   │
│ ─────────────────────────────────────────────────── TOTAL 11,300 kg ═══════════════ │
│ CHECKS (ruled list, CheckIcon glyph + label + detail, failed first)                  │
│ ▨ No plots with deforestation after 2020 — CI-NAW-0007 lost 2.4 ha in 2022           │
│ TRACE  product ── shipment ── supplier ── plot  (horizontal route, glyph per node)   │
│ [DRAFT STATEMENT](primary, disabled while blocked, with reason)                      │
└──────────────────────────────────────────────────────────────────────────────────────┘
right rail (desktop): "Where it was grown" mini map with the plots drawn.
```
- Mass balance as `Meter` per line. Mixing verified/unverified kg as a two-segment ruler.

### 9.5 Statements → **document** — `/app/statements`, `/app/statements/[id]`
```
List: ledger of statements (internal ref, shipment, status glyph, EU reference no. mono, created, submitted).

Detail: the desk (paper canvas with graticule) and one Paper sheet, max 820 px, centred:
┌ Paper ────────────────────────────────────────────────────────────────┐
│ DUE DILIGENCE STATEMENT                          Ref. DDS-NB-2026-001 │
│ Regulation (EU) 2023/1115 · Article 4(2)       ◆ SUBMITTED (DEMO) ⟋  │  ← Stamp lands on submit
│ ═══════════════════════════════════════════════════════════════════ │
│ 1  Operator ........................ Northbank Cocoa & Coffee …       │
│ 2  Product ......................... Cocoa beans · HS 1801 · 8,900 kg │
│ 3  Country of production ........... Côte d'Ivoire (standard risk)   │
│ 4  Geolocation of plots ............ 2 plots (table + mini map)      │
│ 5  Deforestation-free conclusion ... serif paragraph                 │
│ 6  Risk assessment & mitigation .... …                               │
│ EU reference no. 26DE… · Verification no. … (mono)                   │
│ Check code 27AF-5206-AC10                                            │
└───────────────────────────────────────────────────────────────────────┘
actions above the paper: [SUBMIT TO EU SYSTEM (DEMO)](primary) [EU SUBMISSION FILE ↓] [EVIDENCE PACK ↗]
submission history as a ruled margin log on the right (desktop) / below (phone).
```
- Sections reveal with `Reveal`. Always "(demo submission)". Print stylesheet: Paper only.

### 9.6 Campaigns → **route** — `/app/campaigns`, `/app/campaigns/[id]`
```
List: ledger of campaigns (name, commodity, due date as D–n, progress Meter, approved / awaiting / overdue counts).

Detail:
PageHeader "Cocoa plot evidence · Q4"  eyebrow "CAMPAIGN · DUE 30 NOV 2026 (D–16)"   [SEND REMINDERS] [STOP]
ROUTE (vertical on all sizes; one stop per supplier)
 ●──── 01 Coop. Agricole de Nawa      🇨🇮   ■ APPROVED        4 plots · ■3 ◩1      last event 2 days ago
 │
 ◩──── 02 Cavally Cocoa Exporters    🇨🇮   ◩ AWAITING REVIEW  3 plots             [APPROVE] [REQUEST CHANGES]
 │
 ⬚┄┄┄┄ 03 Cacao Ucayali SAC          🇵🇪   ⬚ REMINDED ×2       no plots yet        [REMIND NOW] [COPY LINK]
 ▨──── 04 …                                ▨ OVERDUE
each stop has a 6-step stage ruler: REQUESTED · REMINDED · SUBMITTED · CHECKED · REVIEW · APPROVED
RIGHT: field log (timeline) — live; new entries ink in at the top.
```
- Solid route line between completed stops, dashed toward pending ones. The page holds a live update stream open (see §10).

### 9.7 Reviews — `/app/reviews`
A ledger of plots waiting for a person, ordered by risk. Each row expands in place (not a modal) into: before/after thumbnail, evidence lines, note `Textarea`, `[CONFIRM]`(primary) `[OVERTURN]`. Keyboard: `j`/`k` move, `enter` expands, `c` confirm. Empty state: "Nothing waits for a reviewer."

### 9.8 Countries — `/app/countries`
A **choropleth sheet**: world map (country fills by EU benchmark: low = sheet-2, standard = hollow outline, high = `pl-hatch`) above a ledger of countries you source from first, then all benchmarked countries; filter tags by tier with glyphs. "You source here" = marker diamond tag.

### 9.9 Activity log — `/app/audit` (account menu)
A **chain ledger**: numbered entries (mono line numbers), time (mono), actor, action in serif, target ref; a vertical link line in the margin shows the hash chain. `[VERIFY INTEGRITY]` runs and then stamps `CHAIN INTACT` (compliant glyph) or `BROKEN AT #212` (hatched). Never print hashes.

### 9.10 Settings & Members — `/app/settings` (`?tab=organisation|members|…`)
Tabs in mono caps. Organisation as a field-book form (`Field` + `DefinitionList` read-only values). Members as a ledger (name, email mono, role tag, joined) with an "Invite member" dialog; pending invitations ledger with copy link.

### 9.11 Landing — `/` (marketing)
```
[0] masthead strip: ⚑▱ Plotline        HOW IT WORKS · WHO IT'S FOR · DATA SOURCES      SIGN IN  [OPEN THE NORTHBANK ATLAS]
[1] full-bleed contour/satellite scene (contours + paper-grain, dark theme looks like night imagery)
          EU REGULATION 2023/1115 · CUT-OFF
          31 December                ← Newsreader 140–200 px, optical size display
          2020
          "Land cleared after this date cannot supply the EU." (serif italic)
          [OPEN THE NORTHBANK ATLAS](primary)  Start your atlas →(link)        ↓ scroll
[2] sticky scene (left 60 %) + stepped captions (right 40 %), NYT-style:
     step a "A supplier walks the boundary" → SurveyOutline draws vertex by vertex, pegs drop, coords tick
     step b "We read the 2020 forest map" → forest layer fades in inside the parcel
     step c "Before / after" → swipe divider moves by itself from 2020 to 2024 as you scroll
     step d "The verdict" → hatch fills the cleared part, Stamp "▨ NON-COMPLIANT · 2.4 HA CLEARED IN 2022"
[3] "What your team does" — field procedure, numbered 01–05 in mono, serif body, each with a tiny line drawing:
     01 Ask suppliers for plots (campaign link) · 02 Check every plot · 03 Review the doubtful ones ·
     04 Clear the shipment · 05 File the statement (demo submission)
[4] The deadline as a ruler: 2025 ─ 2026 ━━━━ D–46 ⚑ 30 DEC 2026 (large operators) ─ ⚑ 30 JUN 2027 (micro/small)
[5] Data sources as a footnote ledger (JRC GFC 2020, Hansen GFC, Sentinel-2 imagery, EU country benchmark), honest wording.
[6] colophon footer: "Aligned with EUDR (Regulation (EU) 2023/1115). Designed to support your due diligence."
```
- Phone: the sticky scene sits on top (55 vh), captions scroll under it; the date sets at 64–76 px.
- No hero-left/card-right, no stat strip, no logo carousel.

### 9.12 Sign in, sign up, invite — `/signin`, `/signup`, `/invite/[token]`
```
contours background (full viewport, graticule faint) ─────────────────────────────────────
                    ┌ FIELD CARD (Paper, 420 px, 4 px marker strip on top) ┐
   ⚑▱ Plotline      │ CARD № 01 · SIGN IN                     (mono caps)  │     coordinates of HQ
                    │ Sign in to your atlas            (serif 28 px)       │     53.5511° N 9.9937° E
                    │ WORK EMAIL  [______________________]                │
                    │ PASSWORD    [______________________] 👁               │
                    │ [SIGN IN →](primary, full width)                     │
                    │ ┄┄┄┄┄┄┄┄┄┄┄┄ or ┄┄┄┄┄┄┄┄┄┄┄┄                          │
                    │ [OPEN THE NORTHBANK ATLAS](secondary) demo account   │
                    │ New here? Start your atlas →                         │
                    └──────────────────────────────────────────────────────┘
   footer line: Aligned with EUDR (Regulation (EU) 2023/1115) · Sample data is synthetic
```
- Sign-up = "CARD № 02 · NEW ATLAS" (name, organisation, email, password); invite = "CARD № 03 · JOIN <ORG>" with the role tag. The parcel illustration (`marketing/parcel-art.tsx`) is retired from auth.

### 9.13 Supplier upload portal — `/supplier/[token]` and `/portal/[token]` (no account, phone first)
```
┌ phone 390 ───────────────────────┐
│ ⚑▱ Plotline · for Northbank Cocoa │  (mono strip)
│ Cacao Ucayali SAC                │  serif 26 px
│ Share your farm plots by 30 NOV  │  D–16 stake
│ ── 1 MAP A PLOT ── 2 UPLOAD A FILE ── (Tabs) │
│ [map: tap each corner]            │  draw-map; live checks as field notes
│ ■ Location is precise enough      │
│ ◩ Area 3.2 ha (add boundary > 4)  │
│ [ADD THIS PLOT](primary)          │
│ ── YOUR PLOTS (ledger) ─────────  │
│ 01 PE-UCA-0001  3.2 ha  ⬚ PENDING │
│ [SEND TO NORTHBANK](primary)      │
└───────────────────────────────────┘
```
- Keep the logic: "already sent" is decided by `portal.status === "submitted"` (not `submittedAt`). After submit: a `Stamp` "SENT · 14 NOV 2026" and a plain thank-you; a fresh link reopens submissions.
- Expired link (`410`): an EmptyState with a dashed square: "This link has expired. Ask Northbank for a new one."

---

## 10. Rules carried over from QA (must keep)
1. **Portal**: "already sent" = `portal.status === "submitted"`.
2. **No raw hashes**: never render `inputsHash`, `resultHash` or `payloadHash`, not even in `title` attributes. Show a short grouped check code (first 12 hex chars, upper case, grouped by 4: `27AF-5206-AC10`).
3. **Campaign pages hold a live update stream open**: in Playwright, never wait for `networkidle` there; use `domcontentloaded` + a fixed wait.
4. **Rate limit** 240 requests/min per IP: keep screenshot scripts modest (one context at a time, no parallel tabs).
5. **Map framing**: never whole-world zoom with overlapping dots; frame the plots (region presets or `fitBounds` on clusters) and fly to the selected plot.
6. **Ledgers fit 1440 px**: no cut-off last column; wrap secondary text under the primary cell.
7. **Fresh data**: run `make reset` before showing or screenshotting.

## 11. Accessibility
AA contrast for text and controls in both themes (checked: ink 11.9:1, muted 6.2:1, subtle 4.5:1 on paper; marker-ink 5.3:1; white on marker-fill 5.5:1; dark ink 14.9:1). Visible 2 px marker focus ring; skip link; every glyph has a text label next to it (or `label` for `aria`); map plots are reachable from the ledger; the time ruler is a real slider (`role="slider"`, arrow keys, `aria-valuetext`); `aria-live` for counts and validation; reduced motion honoured by `MotionConfig` and every helper; 390 px with no horizontal overflow.
