# Changelog

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
- Clear stale markers and show an updating state while a new spatial sample loads.
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
