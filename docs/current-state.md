# Yard Sign: current state

Last updated: 2026-08-30. Backend is provisioned and loaded with real data;
nothing is deployed to production yet and the front end has not been exercised
against live data end to end.

## Infrastructure (provisioned 2026-08-30)

All under Matt Mangum's personal accounts.

| Resource | Value |
| --- | --- |
| Supabase project | `yardsign-production`, ref `ohdzlznzyrvctxogbhch`, region `ca-central-1` |
| Supabase dashboard | https://supabase.com/dashboard/project/ohdzlznzyrvctxogbhch |
| Netlify site | `yardsign-523` (`yardsign` / `yardsign-city` subdomains were taken), id `55c34cfb-0863-4a24-bb00-5bebd65bf338` |
| GitHub | `github.com/mtmangum/yardSign` (public), `main` |
| Migration state | `202608300001_initial_schema.sql` applied; `supabase migration list` clean |
| `permits` rows | 84,521 imported (18-month window, 2026-08-30) |
| Domain | `yardsign.city` still not registered |

**`.env` uses the legacy `service_role` JWT, not an `sb_secret_` key.** The
new-format API keys return 401 on this project until they are enabled in the
dashboard (Settings > API Keys). `_shared/supabase.mts` handles both formats
(Bearer header for JWTs, bare `apikey` for `sb_secret_`).

## What this is

An address-centered view of Austin development activity. Enter an address, pick
a radius and a time window, and see the construction permits issued nearby on a
map and in a list. The eventual hook is subscriptions: an email when something
new is filed inside your radius. That is not built yet.

## Product decisions already made

- **v1 is permits only.** Site plan cases (`mavg-96ck`) and zoning cases come
  after the core radius search works end to end. The schema keeps
  permit-specific columns on the `permits` table rather than inventing a shared
  "case" abstraction before there are two real consumers of it.
- **Census geocoding, not TCAD parcels.** Cheaper to stand up and already proven
  in ScoreScout. The parcel join is the accuracy upgrade, not the starting point.
- **Name.** "Yard Sign", after the paper zoning notices staked on Austin lots.
  `yardsign.com` and `yardsign.org` are both parked and for sale as premium
  domains; `yardsign.city` did not resolve as of 2026-08-30 and is the intended
  domain. Not yet registered. Confirm at a registrar before committing.

## Architecture

React 19 + Vite + TypeScript on the front end, Leaflet for the map, Supabase
(Postgres) for storage, Netlify Functions for everything server side. The
browser never holds a Supabase key; all reads go through `/api/permits`.

```
Socrata 3syk-w9eu ──► import-austin-permits (daily 07:00 UTC)
                          │ upsert on (city_code, permit_number)
                          ▼
                      permits table  ──► permits_needing_geocode (view)
                          │                    │
                          │              geocode-census-background
                          │                    │ fills latitude/longitude
                          ▼                    ▼
                      permits_near() ──► /api/permits ──► browser
```

## The data constraint that shapes everything

The Austin Issued Construction Permits feed has 45 columns and **no
coordinates**. No latitude, no longitude, no point geometry. Just
`original_address1`, `original_zip`, `council_district`, and `tcad_id`.

Every single row must be geocoded before it can appear in a radius search, which
means the geocode backfill is on the critical path to the product working at all,
not a nice-to-have enrichment pass.

**Volume:** 84,565 permits issued in the trailing 18 months (measured
2026-08-30 against the live API). At the current one-address-at-a-time pace of
roughly 120ms of throttle plus a geocode round trip and a PATCH, a full backfill
is on the order of 7 to 10 hours of wall clock, spread across paged calls.

`geocode_status` exists so that `no_match` rows (common for new subdivisions the
Census file has not caught up with) leave the queue permanently instead of being
retried every pass. `failed` marks transient errors and can be reset to
`pending` to retry.

### The batch geocoder (built 2026-08-30)

`geocode-census-batch-background.mts` uses the Census **address batch endpoint**
(a CSV upload, coordinates for the whole file in one request) instead of the
one-at-a-time crawl. It:

- Queries `permits` directly on the partial `geocode_status = 'pending'` index,
  **not** the `permits_needing_geocode` view. The view's `row_number()` window
  function runs over every pending row on each call and hits the Postgres
  statement timeout at backfill scale (~85k pending). No cursor is needed - a
  geocoded row flips out of `'pending'` and off the queue.
- Is effectively capped at 1,000 rows per pass by PostgREST's `max-rows`, so the
  full backfill is ~85 passes of ~10s each (~15 min), not 7-10 hours.
- Writes every fetched row a terminal status via one merge-duplicates upsert per
  500 (`matched` with lat/long, or `no_match` / `failed`). Blank-address rows go
  straight to `no_match`.

Observed match rate on the first pass: ~78% `matched`, ~22% `no_match`, rare
`tie` (treated as `no_match`). The 22% miss is the new-construction gap and the
main argument for the TCAD parcel join later.

The one-at-a-time `geocode-census-background` function stays as-is for the small
daily incremental.

## Schema

`supabase/migrations/202608300001_initial_schema.sql`.

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

RLS is enabled on both tables with **no policies**, so anon is denied and the
service key used by the functions bypasses it. Same posture as ScoreScout.

## What is reused from ScoreScout

Ported nearly as-is: `_shared/supabase.mts`, the paged Socrata fetch loop, the
chunked upsert with `Prefer: resolution=merge-duplicates`, the `data_sources`
audit write, and the cursor-based geocoding background function.

Deliberately not reused: the scoring engine, the canonical-duplicate machinery,
and the entire UI. Yard Sign has its own visual identity built around the
physical notice sign.

## Known gaps

- No alerts, subscriptions, or email. That is the retention mechanic and the
  reason this beats a one-off lookup, so it should not wait long.
- **Not deployed.** The Netlify site exists but nothing has been pushed to it;
  no env vars set on Netlify; the daily import is not scheduled anywhere real.
- The front end has never rendered against live data. `/api/permits` is verified
  by curl only.
- Domain not registered.
- ~22% of permits are `no_match` from the Census geocoder and will never appear
  on the map until the TCAD parcel join exists.
- `permit_class` (e.g. `R- 645 Demolition One Family Homes`) is stored on the
  table but not returned by `permits_near()`, so `permitKind()` only sees
  `work_class`. Adding `permit_class` to the SQL function's return would let the
  demolition bucket key on the structural demo classes instead of a single
  free-text value. Now needs a follow-up migration (initial schema is applied).
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

## Next steps, in order

1. Finish the geocode backfill, then open the app locally and confirm markers
   render for a real address.
2. Set the Supabase env vars on Netlify, wire the repo to the site, and do a
   first deploy. Confirm the scheduled import runs there.
3. Register `yardsign.city` and point it at the site.
4. Ship the radius search UI polish, then add subscriptions.
