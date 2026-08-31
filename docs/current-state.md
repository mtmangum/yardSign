# Yard Sign: current state

Last updated: 2026-08-30. **Deployed, live, and fully working** at
https://yardsign-523.netlify.app. Backend provisioned, loaded, fully geocoded;
the whole flow — opens on downtown Austin with data, search or locate button,
list, map with the Stadia basemap, color-coded markers, "N of M closest first"
count — is browser-verified against the live site, light and dark.

**Deploys are manual now** (a push to `main` still triggers a Netlify build via
the connected repo — so do not push casually). Deploy by pushing `main` when a
change is ready, or `netlify deploy --build --prod`.

## Infrastructure (provisioned 2026-08-30)

All under Matt Mangum's personal accounts.

| Resource | Value |
| --- | --- |
| Supabase project | `yardsign-production`, ref `ohdzlznzyrvctxogbhch`, region `ca-central-1` |
| Supabase dashboard | https://supabase.com/dashboard/project/ohdzlznzyrvctxogbhch |
| Netlify site | `yardsign-523` (`yardsign` / `yardsign-city` subdomains were taken), id `55c34cfb-0863-4a24-bb00-5bebd65bf338` |
| Live URL | https://yardsign.city (primary, DNS and HTTPS verified) · https://yardsign-523.netlify.app remains available — GitHub repo connected; a push to `main` builds and publishes |
| Netlify env | `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `IMPORT_SECRET`, `IMPORT_WINDOW_MONTHS`, `VITE_STADIA_API_KEY` all set. Stadia key is domain-restricted in the Stadia dashboard (localhost + `yardsign-523.netlify.app` + `yardsign.city`) |
| GitHub | `github.com/mtmangum/yardSign` (public), `main` — local may be ahead of `origin`; unpushed commits are not yet deployed |
| Migrations applied | `202608300001` (initial), `202608300002` (permit_class in `permits_near()`), `202608300003` (`permits_near_count()`), `202608300004` (grid-distributed map sample) |
| `permits` rows | 84,521, kept fresh by the daily incremental import (07:00 UTC cron) |
| Geocoded | 66,734 `matched` (79%), 17,787 `no_match` (21%), 0 `pending`, 0 `failed` |
| Basemap | Stadia Maps "Alidade Smooth" (was CARTO Voyager — CARTO now watermarks keyless tiles) |
| Domain | `yardsign.city` registered through Netlify on 2026-08-30; primary domain, public DNS and TLS verified, `www` redirects to apex |

**`.env` uses the legacy `service_role` JWT, not an `sb_secret_` key.** The
new-format API keys return 401 on this project until they are enabled in the
dashboard (Settings > API Keys). `_shared/supabase.mts` handles both formats
(Bearer header for JWTs, bare `apikey` for `sb_secret_`).

## What this is

An address-centered view of Austin development activity. It opens on downtown
Austin with permits already on the map (no blank slate); from there you search
your own address or hit the locate button, pick a radius and a time window, and
see the construction permits issued nearby on a map and in a list. The eventual
hook is subscriptions: an email when something new is filed inside your radius.
That is not built yet.

## Product decisions already made

- **v1 is permits only.** Site plan cases (`mavg-96ck`) and zoning cases come
  after the core radius search works end to end. The schema keeps
  permit-specific columns on the `permits` table rather than inventing a shared
  "case" abstraction before there are two real consumers of it.
- **Census geocoding, not TCAD parcels.** Cheaper to stand up and already proven
  in ScoreScout. The parcel join is the accuracy upgrade, not the starting point.
- **Name.** "Yard Sign", after the paper zoning notices staked on Austin lots.
  `yardsign.city` is registered through Netlify and is the primary domain.

## Architecture

React 19 + Vite + TypeScript on the front end, Leaflet for the map (Stadia Maps
basemap tiles), Supabase (Postgres) for storage, Netlify Functions for
everything server side. The browser never holds a Supabase key; all reads go
through `/api/permits`.

```
Socrata 3syk-w9eu ──► import-austin-permits (daily 07:00 UTC, incremental)
                          │ upsert on (city_code, permit_number)
                          ▼
                      permits table
                          │   │
                          │   └─ backfill: geocode-census-batch-background
                          │      steady state: geocode-census-background
                          │            │ fills latitude/longitude
                          ▼            ▼
            permits_near() + permits_near_count() ──► /api/permits ──► browser
                                                      (rows capped at 500;
                                                       total is uncapped)

           /api/geocode-address ──► Census one-line geocoder (search box)
```

The browser opens on downtown Austin (`App.tsx` `DEFAULT_LOCATION`) so the map
is populated on first paint. A locate crosshair — inside the address input and
again on the map, both driven by `useGeolocate` — recentres on
`navigator.geolocation` (Austin-bounds-checked before the request).

## The data constraint that shapes everything

The Austin Issued Construction Permits feed has 45 columns and **no
coordinates**. No latitude, no longitude, no point geometry. Just
`original_address1`, `original_zip`, `council_district`, and `tcad_id`.

Every single row must be geocoded before it can appear in a radius search, which
means the geocode backfill is on the critical path to the product working at all,
not a nice-to-have enrichment pass.

**Volume:** ~84,540 permits issued in the trailing 18 months (measured
2026-08-30), 84,521 after in-batch dedup. The initial backfill is done (see
below); steady state is a few hundred new permits a day.

`geocode_status` exists so that `no_match` rows (common for new subdivisions the
Census file has not caught up with) leave the queue permanently instead of being
retried every pass. `failed` marks transient errors and can be reset to
`pending` to retry.

### The batch geocoder (built and run 2026-08-30)

`geocode-census-batch-background.mts` uses the Census **address batch endpoint**
(a CSV upload, coordinates for the whole file in one request) instead of the
one-at-a-time crawl. It:

- Queries `permits` directly on the partial `geocode_status = 'pending'` index,
  **not** the `permits_needing_geocode` view. The view's `row_number()` window
  function runs over every pending row on each call and hits the Postgres
  statement timeout at backfill scale. It also uses **no `ORDER BY`** - sorting
  the ~70k filtered rows by `issue_date` was itself intermittently tripping the
  statement timeout, and any pending row is as good as any other to geocode. No
  cursor is needed - a geocoded row flips out of `'pending'` and off the queue.
- Is effectively capped at 1,000 rows per pass by PostgREST's `max-rows`.
- Writes every fetched row a terminal status via one merge-duplicates upsert per
  500, all records the same shape (`latitude`/`longitude` always present, null
  for non-matches - PostgREST rejects a mixed-shape bulk upsert). Blank-address
  rows go straight to `no_match`.

**Backfill result:** 84,521 rows in ~130 passes over ~14 min of wall clock
(across two runs - the first died on the ORDER BY timeout, the runner is
resumable and idempotent). Final: **66,734 `matched` (79%), 17,787 `no_match`
(21%)**, 0 `failed`. The 21% miss is the new-construction gap and the main
argument for the TCAD parcel join later.

Run it again any time with `netlify/functions` on PATH via a small Node loop
(the Netlify Lambda emulator caps invokes at 30s; the real run was
`node --env-file=.env` calling the exported `runBatch()`).

The one-at-a-time `geocode-census-background` function stays as-is for the small
daily incremental.

## Schema

`supabase/migrations/`:

- `202608300001_initial_schema.sql` — tables, the geocode queue view, `permits_near()`.
- `202608300002_permits_near_permit_class.sql` — adds `permit_class` to the
  `permits_near()` output so `permitKind()` can key the demolition bucket on the
  structural classes.
- `202608300003_permits_near_count.sql` — `permits_near_count()`, the uncapped
  total for the same radius/time/filter window.
- `202608300004_permits_near_map.sql` — grid-distributed map sampling so dense
  center blocks do not consume the marker cap and create a false empty ring.

- `permits` — one row per `(city_code, permit_number)`, with the raw Socrata row
  kept in `source_payload` so re-deriving a column never requires a re-import.
- `data_sources` — import audit log, same pattern as ScoreScout.
- `permits_needing_geocode` — cursor-paginated geocode queue, ordered by
  `route_number`. **Does not scale to a full backfill**: the `row_number()`
  window runs over every pending row per call and times out at ~85k pending. The
  batch geocoder bypasses it; the sequential function would need the same fix
  before a large run. Fine for the daily incremental.
- `permits_near(lat, lng, radius_m, since, work_classes, min_valuation, limit)` —
  haversine radius search with a bounding-box prefilter. Deliberately no PostGIS:
  the prefilter hits `permits_lat_lng_idx` before any trigonometry runs, which is
  fast enough at Austin's row counts and keeps the database dependency-free.
  Returns at most `limit` rows (API default 500, hard cap 2000), nearest first.
- `permits_near_count(...)` — same filters, no `ORDER BY` / `LIMIT`, returns the
  integer total. `/api/permits` calls both in parallel and returns `total`; the
  count bar shows "500 of 1,044 · closest first" when `total` exceeds the rows.

RLS is enabled on both tables with **no policies**, so anon is denied and the
service key used by the functions bypasses it. Same posture as ScoreScout.

## What is reused from ScoreScout

Ported nearly as-is: `_shared/supabase.mts`, the paged Socrata fetch loop, the
chunked upsert with `Prefer: resolution=merge-duplicates`, the `data_sources`
audit write, and the cursor-based geocoding background function.

Deliberately not reused: the scoring engine, the canonical-duplicate machinery,
and the entire UI. Yard Sign has its own visual identity built around the
physical notice sign.

## Basemap

`PermitMap.tsx` loads Stadia Maps "Alidade Smooth" raster tiles. Keyless from
`localhost`; **production needs a free, domain-restricted Stadia API key** in
`VITE_STADIA_API_KEY` (the tile URL appends `?api_key=` when it is set - see
`src/vite-env.d.ts`). CARTO Voyager was the original pick and was dropped once
CARTO began stamping "API KEY REQUIRED" on keyless tiles. Alidade Smooth is the
near-identical desaturated equivalent.

## Known gaps

- No alerts, subscriptions, or email. That is the retention mechanic and the
  reason this beats a one-off lookup, so it should not wait long.
- **Local `main` may be ahead of `origin`** — deploys are manual, so unpushed
  commits are not live. Migration `202608300003` is applied to the DB, but the
  code that calls `permits_near_count()` (the `total` field) ships only when the
  matching commit is pushed. Harmless in the meantime: the deployed
  `permits.mts` does not reference the new function.
- 21% of permits are `no_match` from the Census geocoder and will not appear on
  the map until the TCAD parcel join exists.
- Test `.mts` files live in `netlify/functions/_tests/` (underscore prefix) so
  Netlify does not try to deploy them as functions.

## Tests

`npm test` runs `vitest`. Current coverage:

- `permitKind()` against every distinct `work_class` value in the trailing-18-
  month feed (checked 2026-08-30).
- The importer's `toNumber` / `toInteger` / `toDate` coercers, `chunks`,
  `dedupeByPermitNumber`, and the `toPermitRecord` field mapping (extracted as a
  pure, exported function so it can be tested without Supabase).
- The batch geocoder's `buildAddressCsv`, `parseCsvLine`, and
  `parseBatchResponse` (the CSV round trip; the network call is not covered).
- `permits.mts` `numberParam` - regression guard for the scaffold bug below.

## Fixed after first contact with data

- **`/api/permits` returned exactly one row per query.** `numberParam` in
  `permits.mts` did `Number(params.get(key))`; for an absent param that is
  `Number(null) === 0`, which is finite, so it returned `0` instead of the
  fallback. `?limit=` is never sent by the front end, so `p_limit` became `0`,
  clamped to `1`. Now falls back on a null/blank/non-numeric value.
- **The scheduled importer would time out every night.** It re-pulled the full
  18-month window (~84k rows, ~6 min) on every run; Netlify scheduled functions
  cap at ~30s. Now incremental: reads the last successful run from
  `data_sources`, pulls only `issue_date >` (that minus `IMPORT_OVERLAP_DAYS`,
  default 14), clamped to `IMPORT_WINDOW_MONTHS`. First run and `?full=1` still
  do the full backfill; `?since=` / `?months=` are manual knobs. Verified live:
  `mode=incremental`, 2,352 rows, 12.8s.

## Next steps, in order

1. **Alerts / subscriptions** — the retention mechanic. Needs a `subscriptions`
   table (email, lat/lng, radius, filters, verification token, last-sent
   watermark), an email provider, a double-opt-in flow, and a scheduled diff.
2. Smaller: interactive kind filters; the TCAD parcel join for the 21% Census
   `no_match` gap.

Done 2026-08-30, after deploy: **restyle applied** (`a966b19`); **`permitKind()`
keys demolition on `permit_class`** (migration `202608300002`, `acc4543`);
**Stadia key set, live map working**; **opens on downtown Austin with data**
(`c8e16b6`); **locate crosshair** inside the address input and on the map,
sharing `useGeolocate` (`681779c`); **count bar shows "N of M · closest first"**
when the 500-marker cap bites (migration `202608300003`, `f62d813`).

UI/map release 2026-08-30: radius and date selects are now
one-tap segmented controls; the sticky result summary shows the total plus the
visible demolition/new/remodel/other mix; permit rows show that they open an
external city record; and compact/mobile spacing has been tightened. Mobile now
uses normal document scrolling instead of trapping the permit list in a nested
viewport scroller. The heavy permit-type bars on the left edge of every result
row have been removed; type remains visible in the row tag, summary, and map.
The sidebar's horizontal divider rules have also been removed in favor of
spacing and a quiet controls background; only the useful sidebar/map boundary
remains on desktop. The masthead now uses a purpose-built yard-sign mark with a
matching SVG favicon. Radius searches now return two datasets: the 500 closest
records for the list and up to 1,000 records sampled across a 16x16 grid for the
canvas-rendered map. The result summary reports mapped and listed counts.
Migration `202608300004` is applied; the API still has a safe fallback to the
closest list during partial deployments or database errors. The search circle
has a draggable edge handle: dragging previews the area, and release snaps to
the existing 1/4, 1/2, 1, or 2 mile choice before issuing one new query.
Command-click on macOS or Control-click on Windows/Linux moves the search center
to that map coordinate without panning the basemap, so the circle visibly moves;
while the modifier is held, a red ghost perimeter follows the pointer to preview
the new area. Ordinary map clicks retain their normal behavior. Radius/location
refreshes clear stale dots immediately and show a compact updating state until
the new spatial sample arrives, rather than leaving an apparently unchanged map.
Clicking a map marker persistently highlights and scrolls its permit into view in
the sidebar; a sampled permit outside the closest 500 is temporarily inserted.
Mobile uses explicit Map/List views instead of stacking both surfaces. The fixed
view switcher preserves context. Selecting a marker stays on the map and opens
its popup; switching to List afterward scrolls to the selected permit. Popups
render above the fixed mobile controls, and returning to the map invalidates
Leaflet's hidden layout size. The selected row quickly aligns below the fixed
switcher at the top of the List view using a 220 ms scroll. Mobile view, zoom, locate, and popup-close controls
use touch-friendly targets. The search circle is fitted without horizontal map
padding on mobile so its perimeter reaches the viewport edges.

## Watch after the laptop closes

- The 07:00 UTC cron should log `mode=incremental` and finish in ~15s. Check
  `data_sources` (newest row's `message` shows `mode=` and `since=`) or the
  Netlify function logs. A `status='failed'` row means it errored - the `since`
  cursor is safe to retry.
