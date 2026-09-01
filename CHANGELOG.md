# Changelog

## 2026-08-31

### Added

- Permit scale at a glance. The sidebar card and map popup now show a facts line
  — "232 units · 129,307 sq ft · 6 floors" — so you can tell a duplex from a
  40-unit building without leaving the page. Shown only for new builds and
  remodels that add floor area; on a pure interior remodel the unit and floor
  counts describe the existing building, not the work, so they're withheld.
  Counts of 1 are dropped — the city stamps them as placeholders on plenty of
  non-residential permits. The popup also carries the applied date ("Applied …
  · Issued …") and the permit-class label with its code prefix stripped.
  `permits_near` and `permits_near_map` now return `total_new_add_sqft` and
  `number_of_floors` (migration `202608300008`); `/api/permit` selects them too.
- Searches are now in the URL and shareable. An address search becomes a path
  slug — `/1412-northridge-dr-austin-tx-78723` — of the geocoder's normalised
  address; a hand-typed or partial slug rewrites to the canonical one on load,
  and an unplaceable one drops to the default view with a note. The locate
  button and dropped pins use `?ll=<lat,lng>` (no address to name). Radius,
  issued window, kind filters and the open card ride along as `?r= ?d= ?k= ?p=`.
  A new place pushes a history entry so back/forward walks between searches; a
  filter tweak just replaces. The bare domain stays parameter-free. Legacy
  `?q=<address>` links are still read.
- Shareable open card: selecting a permit adds `?p=<permit number>`; opening
  such a link fetches that one permit (new `/api/permit` endpoint), centres on
  it and opens its card. Closing the popup (× or Esc) drops `?p=`.
- The map no longer lies by omission. ~21% of the Austin feed has no
  coordinates and can't be plotted; an address search now shows "N more permits
  in this ZIP aren't on the map" when that's true (counted by zip, since
  ungeocoded rows can't be radius-filtered). A colophon at the foot of the list
  shows when the feed was last imported (new `/api/status` endpoint).
- The Demolition / New / Remodel / Other chips in the result summary are now
  filter toggles (multi-select; a "Clear" appears while any are active). The
  filter runs in SQL — a new `permit_kind_of()` immutable function feeds a
  stored `kind` generated column on `permits`, and `permits_near`,
  `permits_near_map` and `permits_near_count` take a `p_kinds` array (migration
  `202608300007`). Filtering server-side means the map re-samples with the
  filter applied rather than showing whatever few of the kind landed in the
  grid sample. `permit_kind_of()` mirrors `src/lib/permitKind.ts`.

### Improved

- Clicking a listing in the sidebar now opens that permit's card on the map —
  highlighting it, adding a marker if it fell outside the grid sample, and
  switching to the map view on mobile — instead of navigating away to the city
  portal. Each listing carries an explicit "City permit record" link for that.

### Design

- Warmer, less generic identity: manila paper and warm ink instead of dashboard
  grey; one ochre accent for interaction (the active radius / issued segment, a
  rule under the masthead, hovers, focus); red kept strictly for demolition.
- Sidebar labels in sentence case, no tracked caps. The result count demoted
  from a headline stat to a plain line. No IBM Plex Mono in the sidebar —
  distances, dates, metadata and counts all set in the text face.

### Internal

- Refactor: `PermitMap.tsx` (429 lines) split into `src/components/map/`
  (`PermitMap`, `MoveSearchArea`, `RadiusHandle`, `PermitMarker`, `mapControls`).
  Pure logic moved to `src/lib/` — `permitKind` (was inside `PermitList`, which
  `PermitMap` imported component-to-component), `format` (one each of distance /
  valuation / date, replacing six near-duplicates), `geo` (one `RADIUS_STEPS`,
  `snapLocation`, `inAustin`, `nearestRadiusStep`). New `useIsNarrow` hook
  replaces render-time `window.innerWidth` reads. No behaviour change.

### Fixed

- An open card now owns the URL path — `/1204-northridge-dr?p=…` — so every
  marker has its own shareable link that reads as the permit's own address.
  Previously the path stuck on the search location (or, for a bare `?p=` link,
  on whichever permit was opened first, which had been promoted to the search
  location), and every subsequent marker only swapped the `?p=` behind the same
  path. Closing the card falls back to the real search location; reopening a
  per-marker link re-centres on that permit. A bare `?p=` link with no search
  area still resolves to the permit's geocoded address rather than a raw
  `?ll=<lat,lng>` pin, and the URL rewrite is held until the permit resolves so
  `?p=` isn't dropped and re-added in the gap.
- Recreate Leaflet permit popups when crossing the mobile breakpoint so their
  top safe-area padding remains correct after resize or device rotation.

### Security

- `permits_needing_geocode` view is now `security_invoker` (migration
  `202608300005`). As a SECURITY DEFINER view it bypassed the deny-all RLS on
  `permits`, so `anon` could read pending permits' address / zip / permit number
  through it. Clears the Supabase "Security Definer View" advisor.

### Egress

- Client snaps search coordinates to a ~110 m grid, so neighbours checking the
  same block collapse onto one CDN cache key (and one Supabase query) instead of
  every distinct address being a cache miss. Also keeps exact addresses out of
  the cache key.
- `/api/permits` edge cache raised to 1 h fresh + 1 day stale-while-revalidate
  (durable), browser cache kept at 5 min. That edge cache is what keeps repeat
  traffic off Supabase.
- `permits_near_map` truncates `description` to 300 chars (migration
  `202608300006`); the sidebar's `permits_near` keeps full text.

## 2026-08-30

### Improved

- Replaced radius and issued-window selects with one-tap segmented controls.
- Added a sticky result summary with total, mapped, listed, and permit-kind counts.
- Added a purpose-built Yard Sign SVG logo and matching favicon.
- Simplified the sidebar by removing decorative dividers, row-edge bars, and the
  visible nested scrollbar while retaining scrolling behavior.
- Changed mobile results to normal document scrolling.
- Added external-record indicators to permit rows that open the city portal.
- Replaced the stacked mobile layout with explicit Map and List views; marker
  selection stays on the map, switching to List focuses the selected row, and
  returning restores map sizing. Mobile popups render above fixed map controls.
- Enlarged mobile view, zoom, locate, and popup-close controls to touch-friendly
  targets; selected permits align at the top when switching to List using a
  faster, controlled scroll animation.
- Keep mobile permit cards below the full top control stack by auto-panning the
  map with a dedicated top safe area.

### Map

- Added `permits_near_map()` and a 16×16 grid-distributed sample of up to 1,000
  permits so the marker cap represents the full radius instead of only its dense center.
- Kept the sidebar independently ordered to the 500 closest permits.
- Switched Leaflet vectors to canvas rendering for responsive large marker sets.
- Added a draggable radius handle that previews changes and snaps to the four
  supported radius choices on release.
- Added Command-click on macOS and Control-click on Windows/Linux to reposition
  the search circle without moving the basemap.
- Added an animation-frame-throttled ghost perimeter while previewing a new center.
- Added touch repositioning: press and hold empty map space for 400 ms, drag the
  ghost perimeter into place, and release to refresh from the new center. Quick
  swipes continue to pan the map normally.
- Clear stale markers and show an updating state while a new spatial sample loads.
- Fit the search perimeter tightly to the mobile viewport, with its horizontal
  edges meeting the screen rather than leaving misleading map space around it.
- Clicking a map marker now highlights and scrolls its matching sidebar permit
  into view, including sampled permits outside the closest-500 list.
- Reformatted map popups with clearer address, permit type, metadata, description,
  distance, and city-record hierarchy; refined the radius-handle tooltip. Popup
  text wraps in full rather than truncating with ellipses, with a wider desktop
  layout and a viewport-safe mobile width.

### Operations

- Applied Supabase migration `202608300004_permits_near_map.sql` to production.
- Registered `yardsign.city` through Netlify, made it the primary production
  domain, configured `www.yardsign.city` to redirect to the apex, and verified
  public DNS and HTTPS.
