# Yard Sign

What is being built near you in Austin, from the city's own permit data.

The name is the point: today the only way to learn that the lot behind you is
being scraped is a paper notice stapled to a post in the grass. Yard Sign is
that notice, for every property within a radius you choose.

## Stack

React 19 + Vite + TypeScript, Leaflet for the map (Stadia Maps basemap tiles),
Supabase for storage, and Netlify Functions for the scheduled import, geocoding,
and read API. Same shape as ScoreScout, so the operational habits carry over.

## Data

City of Austin **Issued Construction Permits**
([`3syk-w9eu`](https://data.austintexas.gov/Building-and-Development/Issued-Construction-Permits/3syk-w9eu)),
refreshed daily.

The important constraint: **the feed contains no coordinates.** 45 columns, and
not one of them is a latitude, longitude, or point. Every row is geocoded from
`original_address1` through the Census one-line geocoder before it can appear in
a radius search. That is why there are two pipelines rather than one.

## Local setup

```bash
npm install
cp .env.example .env       # fill in Supabase URL, secret key, IMPORT_SECRET
netlify dev
```

`.env` currently holds the Supabase **legacy `service_role` JWT** — the
new-format `sb_secret_` keys 401 on this project until enabled in the dashboard.
`VITE_STADIA_API_KEY` is optional locally (Stadia serves keyless from
`localhost`) and required in production.

Apply the schema with the Supabase CLI (already applied to `yardsign-production`):

```bash
supabase db push
```

## Pipelines

| Function | Trigger | Job |
| --- | --- | --- |
| `import-austin-permits` | daily, 07:00 UTC | Pull the last `IMPORT_WINDOW_MONTHS` of issued permits and upsert on `(city_code, permit_number)` |
| `geocode-census-batch-background` | manual, `GET /api/geocode-census-batch` | Bulk-geocode via the Census address-batch endpoint (CSV upload). Used for the initial backfill — ~85k rows in minutes |
| `geocode-census-background` | manual, `GET /api/geocode-census` | One-at-a-time geocode for the small daily incremental |
| `permits` | `GET /api/permits` | Radius search via the `permits_near()` SQL function |
| `geocode-address` | `GET /api/geocode-address` | Address autocomplete for the search box |

The initial backfill is done (66,734 of 84,521 matched, 2026-08-30). To
re-run it — the Netlify Lambda emulator caps invokes at 30s, so drive the
exported `runBatch()` from Node instead:

```bash
node --env-file=.env -e "
  import('./netlify/functions/geocode-census-batch-background.mts').then(async m => {
    let r; do { r = await m.runBatch(1000); console.log(r) } while (!r.done)
  })"
```

## Status

Backend provisioned (`yardsign-production` on Supabase, `yardsign-523` on
Netlify), 84,521 permits imported and geocoded, API verified through
`netlify dev`. Not deployed; map not yet eyeballed in a browser.

## Not built yet

Production deploy, alerts and subscriptions, site plan cases, zoning cases, and
the TCAD parcel join. See `docs/current-state.md`.
