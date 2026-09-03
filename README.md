# Yard Sign

What is being built near you in Austin, from the city's own permit data.

The name is the point: https://yardsign.city today the only way to learn that the lot behind you is
being scraped is a paper notice stapled to a post in the grass. Yard Sign is
that notice, for every property within a radius you choose.

## Stack

React 19 + Vite + TypeScript, Leaflet for the map (Stadia Maps basemap tiles),
Supabase for storage, and Netlify Functions for the scheduled import, geocoding,
and read API. Same shape as ScoreScout, so the operational habits carry over.

## Product behavior

Yard Sign opens on downtown Austin with recent permits already visible. Search
an Austin address or use the location button, then choose a radius and issued
window. The sidebar lists the 500 closest permits; the map plots up to 1,000
permits sampled across the full search area so dense blocks do not hide activity
near the perimeter.

Clicking a listing opens that permit's card on the map rather than navigating
away; each listing has a separate link to the City of Austin permit record.
Listings and cards show a scale line — units / new square footage / floors —
for new builds and additions, so a duplex reads differently from a 40-unit
building at a glance.

The search lives in the URL — an address search becomes a path slug like
`/1412-northridge-dr-austin-tx-78723` (canonicalised on load), the locate button
and dropped pins use `?ll=<lat,lng>`, and radius / issued window / kind filters /
open card ride along as `?r= ?d= ?k= ?p=`. Results are shareable and
back/forward walks between searches.

Drag the pin at the centre of the search circle to move the search; drag the
handle on the circle edge to resize it. On desktop you can also hold Command
(macOS) or Control (Windows/Linux) to preview a ghost circle and click to move
the centre without panning the basemap; on touch, press and hold the map.

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
netlify dev --port 8888
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
| `permits` | `GET /api/permits` | Closest-first list, grid-distributed map sample, and uncapped total via Supabase SQL functions |
| `permit` | `GET /api/permit?number=…` | One permit by its city number, for opening a shared `?p=` card |
| `status` | `GET /api/status` | When the feed was last imported, for the freshness colophon |
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
`netlify dev`, and the complete search/map flow deployed at
https://yardsign.city (with https://yardsign-523.netlify.app retained as the
Netlify subdomain). Production deploys from `main`; local full-stack development
runs at http://localhost:8888.

## Not built yet

Alerts and subscriptions, site plan cases, zoning cases, and the TCAD parcel
join. See `docs/current-state.md`.
