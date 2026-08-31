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

### Operations

- Applied Supabase migration `202608300004_permits_near_map.sql` to production.
