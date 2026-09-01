# Changelog

## 2026-08-31

### Internal

- Refactor: `PermitMap.tsx` (429 lines) split into `src/components/map/`
  (`PermitMap`, `MoveSearchArea`, `RadiusHandle`, `PermitMarker`, `mapControls`).
  Pure logic moved to `src/lib/` — `permitKind` (was inside `PermitList`, which
  `PermitMap` imported component-to-component), `format` (one each of distance /
  valuation / date, replacing six near-duplicates), `geo` (one `RADIUS_STEPS`,
  `snapLocation`, `inAustin`, `nearestRadiusStep`). New `useIsNarrow` hook
  replaces render-time `window.innerWidth` reads. No behaviour change.

### Fixed

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
