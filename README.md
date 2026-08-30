# Yard Sign

What is being built near you in Austin, from the city's own permit data.

The name is the point: today the only way to learn that the lot behind you is
being scraped is a paper notice stapled to a post in the grass. Yard Sign is
that notice, for every property within a radius you choose.

## Stack

React 19 + Vite + TypeScript, Leaflet for the map, Supabase for storage, and
Netlify Functions for the scheduled import, geocoding, and read API. Same shape
as ScoreScout, so the operational habits carry over.

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

Apply the schema with the Supabase CLI:

```bash
supabase db push
```

## Pipelines

| Function | Trigger | Job |
| --- | --- | --- |
| `import-austin-permits` | daily, 07:00 UTC | Pull the last `IMPORT_WINDOW_MONTHS` of issued permits and upsert on `(city_code, permit_number)` |
| `geocode-census-background` | manual, `GET /api/geocode-census` | Walk the `permits_needing_geocode` queue, fill lat/long, mark `matched` / `no_match` / `failed` |
| `permits` | `GET /api/permits` | Radius search via the `permits_near()` SQL function |
| `geocode-address` | `GET /api/geocode-address` | Address autocomplete for the search box |

Backfill geocoding in pages, using the returned cursor:

```bash
curl -H "Authorization: Bearer $IMPORT_SECRET" \
  "http://localhost:8888/api/geocode-census?limit=200&after=0"
```

## Not built yet

Alerts and subscriptions, site plan cases, zoning cases, and the TCAD parcel
join. See `docs/current-state.md`.
