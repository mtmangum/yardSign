# Yard Sign: current state

Last updated: 2026-08-30. Scaffold stage. Nothing is deployed yet.

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

That is tolerable once. It is not tolerable as a recurring cost, and it is the
first thing to fix:

- The Census geocoder has a **batch endpoint** accepting up to 10,000 addresses
  per upload. Switching the backfill to batch would cut this to minutes.
- The daily incremental load is small (a few hundred permits), so the
  one-at-a-time path is fine for steady state. Only the initial backfill hurts.

`geocode_status` exists so that `no_match` rows (common for new subdivisions the
Census file has not caught up with) leave the queue permanently instead of being
retried every pass. `failed` marks transient errors and can be reset to
`pending` to retry.

## Schema

`supabase/migrations/202608300001_initial_schema.sql`.

- `permits` — one row per `(city_code, permit_number)`, with the raw Socrata row
  kept in `source_payload` so re-deriving a column never requires a re-import.
- `data_sources` — import audit log, same pattern as ScoreScout.
- `permits_needing_geocode` — cursor-paginated geocode queue, ordered by
  `route_number` so the background function can resume with `?after=`.
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
- No deploy. No Netlify site, no Supabase project provisioned.
- Domain not registered.
- `permit_class` (e.g. `R- 645 Demolition One Family Homes`) is stored on the
  table but not returned by `permits_near()`, so `permitKind()` only sees
  `work_class`. Adding `permit_class` to the SQL function's return would let the
  demolition bucket key on the structural demo classes instead of a single
  free-text value. Cheap to do now, before the migration is first applied.

## Tests

`npm test` runs `vitest`. Current coverage:

- `permitKind()` against every distinct `work_class` value in the trailing-18-
  month feed (checked 2026-08-30).
- The importer's `toNumber` / `toInteger` / `toDate` coercers, `chunks`,
  `dedupeByPermitNumber`, and the `toPermitRecord` field mapping (extracted as a
  pure, exported function so it can be tested without Supabase).

## Next steps, in order

1. Provision Supabase, run the migration, register a Netlify site.
2. Run the importer once, then the geocode backfill (consider batch first).
3. Ship the radius search, then add subscriptions.
