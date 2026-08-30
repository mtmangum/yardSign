# Yard Sign: handoff

Written 2026-08-30, at the end of the scaffolding session, for picking the
project up in Claude in VS Code.

> **Update, later on 2026-08-30:** most of this file's "not yet true" list is
> now done - Supabase project provisioned, migration applied, 84,521 permits
> imported, Netlify site created, geocode backfill run via a new batch geocoder.
> `docs/current-state.md` is the current source of truth; the sections below are
> kept for the decisions and landmines, which still hold. Still outstanding: no
> production deploy, front end unproven against live data, domain unregistered.

Read `docs/current-state.md` first for the architecture and the data
constraints. This file covers only what a new session needs to know to start
working, and what is not yet true.

## Status in one line

The scaffold is written and the front end compiles, but **nothing has been run
against a real database and nothing is deployed**. No Supabase project, no
Netlify site, no data, no domain. *(Superseded - see the update note above.)*

## Where things stand, honestly

| Thing | State |
| --- | --- |
| Front end (`src/`) | Written. Builds clean with `tsc -b && vite build`. Never rendered against real data. |
| Netlify functions | Written. **Never executed.** No runtime verification at all. |
| SQL migration | Written. **Never applied.** Not run against any Postgres. |
| `npm install` | Not run in this folder. There is no `node_modules` yet. |
| Data pipeline | Verified only at the level of "the Socrata API returns the fields the importer expects." |
| Deploy | Nothing. |
| Domain | Not registered. |

Read that table as the todo list. Everything below is detail.

## What was actually verified

Worth being precise, because the rest is untested code:

1. **The source dataset's shape.** Queried the live Socrata API for
   `3syk-w9eu`. Confirmed all 45 column names and types, which is where the
   importer's field mapping comes from.
2. **The missing-coordinates problem.** Confirmed there is no latitude,
   longitude, or point column. This is the single most important fact about the
   project and the reason the geocoding pipeline exists.
3. **Volume.** `select count(1) where issue_date > '2025-03-01'` returned
   **84,565** permits in the trailing 18 months. That is the geocoding backfill
   size.
4. **The front end compiles.** `tsc -b && vite build` passed in a sandbox
   against an identical `src/` tree, producing a ~352 kB bundle (108 kB gzipped).

What was *not* verified: every runtime path. The functions have never run, the
SQL has never executed, and no permit has ever been geocoded or rendered.

Note the build was verified in a cloud sandbox, not in this folder. Run
`npm install && npm run build` here as the first sanity check.

## First session in VS Code, suggested order

```bash
cd ~/Projects/yardSign
npm install
npm run build          # confirm the scaffold compiles on this machine
git init && git add -A && git commit -m "Scaffold Yard Sign"
```

Then stand up the backend:

1. Create a Supabase project. Put `SUPABASE_URL` and `SUPABASE_SECRET_KEY` in
   `.env` (copy `.env.example`). Generate any long random string for
   `IMPORT_SECRET`.
2. `supabase link` and `supabase db push` to apply the migration.
3. `netlify dev`, then trigger the importer once and watch it write rows.
4. Page through the geocode backfill with the cursor the endpoint returns.
5. Open the app, type an address, confirm markers appear.

Expect step 4 to be the slow one. See the batch-geocoder note in
`current-state.md` before committing to 84,565 sequential requests.

## Landmines specific to this code

- **`permitKind()` in `src/components/PermitList.tsx`** was rewritten 2026-08-30
  against a real `$group=work_class` query: an exact-match table for every value
  in the trailing-18-month feed, with substring heuristics only as a fallback for
  unseen values. Covered by `src/components/PermitList.test.ts`. The remaining
  weakness is that only `work_class` reaches the browser; see the `permit_class`
  note in `current-state.md`.
- **The importer's 18-month window is arbitrary.** `IMPORT_WINDOW_MONTHS`
  controls it. Widening it multiplies the geocoding cost linearly.
- **The upsert deduplicates in memory before sending.** Postgres rejects an
  upsert that touches the same conflict target twice in one statement, and the
  Austin feed can repeat a permit number. Do not remove that `Map`.
- **`permits_near()` uses haversine, not PostGIS.** Fine at this scale because
  the bounding-box prefilter runs first, but it will not stay fine if the row
  count grows by an order of magnitude. PostGIS is the upgrade path.
- **The Census geocoder silently misses new construction.** Brand new
  subdivision addresses often are not in its file, which is exactly the
  population this app cares most about. That is the strongest argument for the
  TCAD parcel join, using the `tcad_id` already stored on every row.
- **RLS is on with zero policies.** That is intentional. Reads go through the
  functions with the service key. If a query returns nothing from the browser,
  this is why.

## Decisions made this session, so they are not relitigated

- The product is an address-radius view of Austin development activity, with
  email alerts as the eventual retention hook.
- v1 is permits only. Site plans (`mavg-96ck`) and zoning cases come later.
- Census geocoding first, TCAD parcel join as the accuracy upgrade.
- The name is Yard Sign. `PermitScout` was the original pick and was abandoned:
  `permitscout.us` is a live competitor doing permit leads for contractors, and
  the whole `permit*`/`*scout` namespace is occupied.
- Intended domain is `yardsign.city`. `.com` and `.org` are parked and for sale
  as premium listings. **Not yet checked at a registrar** and not registered.
- The stack mirrors ScoreScout deliberately: React 19, Vite, TypeScript,
  Leaflet, Supabase, Netlify Functions.

## Things worth doing early that are not obvious

- Add tests for the importer field mapping and `permitKind()`. `vitest` is
  already a dependency and nothing uses it yet.
- Decide the alert model before the schema calcifies. Subscriptions need a
  `subscriptions` table (email, lat/lng, radius, filters, verification token,
  last-sent watermark) and the watermark design is easier to get right now than
  after there is data.
- The demolition-only view is the shareable wedge. It is a filter over what
  already exists, so it is cheap, and it is the thing local Reddit would pass
  around.

## Old folder

`~/Projects/permitScout` was created before the name changed and is empty.
Delete it.
