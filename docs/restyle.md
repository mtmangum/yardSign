# Yard Sign: visual restyle

Last updated: 2026-08-30. Spec only — not yet applied to `src/styles/global.css`.

Mockups: `Yard Sign Restyle.dc.html` (first run, results, mobile).

## Scope

Restyle only. No changes to `App.tsx`, `PermitList.tsx`, `PermitMap.tsx` or
`AddressSearch.tsx` markup, no changes to the flows, no new components. Every
screen in the mockup is the existing class structure with a rewritten
`global.css`, plus one `KIND_COLOR` edit in `PermitMap.tsx`.

The complaint being fixed: "unattractive, unengaging." The diagnosis is not that
the old CSS was wrong — it was that the page had **four competing accent colors
and no structural hierarchy**, so nothing was emphasized and the panel read as a
uniform gray list.

## Direction

Flat, architectural, near-mono. Hard 2px rules do the organising; nothing floats.
Type is Archivo throughout, numbers are mono. Red is a signal, not decoration.

## The five decisions

### 1. Radius 4px → 0

`--radius: 0`. Panel, inputs, selects, suggestions dropdown, kind tags and the
map legend are all hard-edged. The only round thing left in the app is the map
`CircleMarker`.

### 2. Rules replace shadows

Delete `--shadow` from the panel and legend. Promote to 2px solid ink:

- `.masthead` bottom border
- `.controls` bottom border
- `.results__count` bottom border
- `.app__panel` right border
- `.map__legend` border

Row separators stay 1px (`--rule`). The `.permit` left bar goes 3px → 5px.

### 3. Inter → Archivo, numbers in mono

`--font-sans: Archivo`. Headings 700–800 at −0.02em tracking; body 400/600.
Micro-labels stay uppercase but tighten to 10px / 0.12em.

`--font-mono: "IBM Plex Mono"` and it now covers **every figure** — distance,
issue date, valuation, status, and the result count — so columns of numbers align
down the list. Previously only `.permit__distance` and `.permit__meta` were mono.

### 4. Red means demolition

This is the substantive change. Old palette:

```
--demolition: #b02a37   --new-build: #d9480f
--remodel:    #2b6cb0   --other:     #6b7280
```

Four saturated hues at equal weight, so the demolition signal — the whole point
of the product — carried no more emphasis than an HVAC change-out. New palette is
one accent over an ink-to-pale ramp:

```
--demolition: #ec3013   /* accent, the only saturated color in the app */
--new-build:  #201e1d   /* ink */
--remodel:    #8c877f   /* neutral */
--other:      #c9c5c0   /* pale */
```

Red appears in exactly three places: the demolition row bar and map marker, the
address pin, and the masthead stake. Nowhere else.

Apply the same four values to `KIND_COLOR` in `PermitMap.tsx`, and give
demolition markers `radius: 7` against `5` for the rest so they read first at map
scale. Marker stroke becomes `#fff` at 1.5px on all kinds.

### 5. `.results__count` earns its space

Same DOM node, more work: the total at 26px mono beside its uppercase label, then
a row of per-kind chips with counts. The panel now answers "how much, and how
much of it matters" before any scrolling.

`.permit__work` also changes register — it was accent-colored uppercase text,
which tinted every row red. It becomes a filled tag: white on accent for
demolition, ink on `#e8e5e1` otherwise.

## Token diff

```diff
- --paper: #faf9f5;          + --paper: #f3f2f2;
- --paper-raised: #ffffff;     --paper-raised: #ffffff;
- --ink: #17171a;            + --ink: #201e1d;
- --ink-soft: #55555f;       + --ink-soft: #7a7570;
- --rule: #dedbd2;           + --rule: #ddd9d4;  /* + --rule-strong: #201e1d */
- --notice: #d9480f;         + --notice: #ec3013;
- --notice-soft: #fdf0e8;    + --notice-soft: #fbeee9;
- --radius: 4px;             + --radius: 0;
- --shadow: 0 1px 2px ...      (dropped from panel + legend)
- --font-sans: "Inter", ...  + --font-sans: "Archivo", ...
- --font-mono: ui-monospace  + --font-mono: "IBM Plex Mono", ui-monospace
```

Focus states become a 2px accent `:focus-visible` outline at 2px offset rather
than the border-color + soft ring pair, so keyboard focus is visible on the
selects too.

## Dark mode

The existing `prefers-color-scheme` block still applies, with two amendments:
`--rule-strong` inverts to `#f2f1ec`, and the ink-to-pale kind ramp reverses
(`#f2f1ec` → `#9a958d` → `#4a4741`) so ordering by weight survives the flip.

## Not addressed here

Real UX work the restyle deliberately leaves alone, in rough priority order:

1. **No filtering.** The kind chips in the count strip are labels, not controls.
   Making them toggles is the highest-value interaction left — `permits_near()`
   already takes `work_classes`, and `PermitQuery.workClasses` is already wired
   through `fetchPermits`.
2. **Radius and window are selects.** A segmented control reads better and is one
   fewer click, but it changes the DOM, so it is out of scope.
3. **No alerts entry point.** Per `docs/current-state.md` this is the retention
   mechanic; the results panel is where an "email me new permits here" affordance
   belongs, and there is currently no space reserved for it.
4. **Row click opens the city portal in a new tab** with no indication it will.
   A detail state (in-panel or a map popup) is a flow change, not a restyle.
