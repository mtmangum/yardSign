# Yard Sign: alerts / subscriptions design

Written 2026-09-01. Design pass for the retention mechanic — an email when a new
permit is issued inside an area someone cares about. Not built yet. Read
`docs/current-state.md` first for the architecture this slots into.

## Why this exists

Everything shipped so far is a lookup: type an address, see what is nearby,
leave. There is no reason to come back until you happen to wonder again. Alerts
are the reason. You watch your block once, and Yard Sign tells you when the lot
behind you gets a demolition permit — which is exactly the moment the paper sign
would have gone up in the grass, and exactly the thing this product is named
after.

It is also the first feature with a cost and an abuse surface (email), so the
opt-in and hygiene rules below are not optional polish.

## The shape of it

1. User runs a search — address (or dropped pin), radius, optional kind filter.
2. Clicks **Watch this area** in the results panel.
3. Enters an email, picks a cadence, submits.
4. A row lands in `subscriptions`, **unconfirmed**. A confirmation email goes out
   with a tokenised link.
5. User clicks the link → `confirmed_at` is set, watermark starts now. A short
   page confirms it and links back to the search.
6. A scheduled function runs after each import: for every confirmed
   subscription, find permits that appeared on the map since its watermark,
   inside its radius and filters; if there are any, send a digest and advance
   the watermark.
7. Every email carries a one-click unsubscribe link that needs no login.

No accounts, no dashboard in v1. Managing a subscription means using the
unsubscribe link, or subscribing again with different settings. A "manage all my
alerts" page needs auth (magic link) and is v2.

## Schema

New migration, `subscriptions` table:

```sql
create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  email text not null,

  -- What they are watching. Coordinates, not an address slug: the match is a
  -- radius query. label is kept only for the email copy.
  label text,
  latitude double precision not null,
  longitude double precision not null,
  radius_m double precision not null default 1609.34,
  kinds text[],                    -- null = every kind (mirrors permits_near p_kinds)

  -- Lifecycle. Two tokens: confirm is single-use (guarded by confirmed_at is
  -- null), unsubscribe is long-lived and in every email footer.
  confirm_token uuid not null default gen_random_uuid(),
  unsubscribe_token uuid not null default gen_random_uuid(),
  confirmed_at timestamptz,
  unsubscribed_at timestamptz,
  suppressed_at timestamptz,       -- set by the bounce/complaint webhook

  -- Delivery
  cadence text not null default 'daily' check (cadence in ('daily', 'weekly')),
  last_notified_at timestamptz,    -- watermark: only permits mapped after this
  digest_count integer not null default 0,

  created_at timestamptz not null default now(),
  confirm_sent_at timestamptz
);

create index subscriptions_active_idx on subscriptions (last_notified_at)
  where confirmed_at is not null
    and unsubscribed_at is null
    and suppressed_at is null;
create index subscriptions_confirm_token_idx on subscriptions (confirm_token);
create index subscriptions_unsubscribe_token_idx on subscriptions (unsubscribe_token);
create index subscriptions_email_idx on subscriptions (lower(email));

alter table subscriptions enable row level security;
-- No policies. Same posture as permits / data_sources: anon denied, the
-- service key used by the functions bypasses RLS. The browser never touches
-- this table.
```

### Decisions baked into that

- **Store lat/lng, not a path slug.** The digest is a spatial query. `label`
  ("1204 NORTHRIDGE DR, AUSTIN, TX, 78723") is display-only, for the subject
  line and the "you are watching…" copy.
- **Do not snap the coordinates.** Search coordinates are snapped to a ~110 m
  grid for CDN cache-key collapsing; a subscription is low-volume and long-lived,
  so keep the exact point the user picked.
- **`kinds text[]` mirrors `permits_near`'s `p_kinds`.** `null` means all kinds.
- **The watermark starts at confirm, not at creation.** If someone confirms two
  days late, initialising `last_notified_at = confirmed_at` gives them a clean
  start with no retroactive backlog and no gap. Set it in the confirm handler.
- **UUID tokens.** `gen_random_uuid()` twice is unguessable enough and needs no
  code. `confirm_token` is spent once (`where confirmed_at is null`);
  `unsubscribe_token` lives forever.
- **`suppressed_at` is separate from `unsubscribed_at`.** One is the user's
  choice, the other is Resend telling us the address is dead or hostile. Both
  stop mail; keeping them distinct keeps the logs honest.

### One new column on `permits`

The digest needs to know *when a permit became visible on the map*, which is not
`issue_date` (a date, and often days behind) and not always `created_at` (a
permit imported yesterday but geocoded today was not mappable yesterday).

Add `mapped_at timestamptz` to `permits`, set the first time latitude/longitude
goes non-null:

- Migration backfills `mapped_at = coalesce(geocode_attempted_at, created_at)`
  for every row that already has coordinates.
- Both geocoders (`geocode-census-background`, `geocode-census-batch-background`)
  set `mapped_at = now()` in the same update that writes `geocode_status =
  'matched'` and the coordinates — only when it was null.
- Index: `create index permits_mapped_at_idx on permits (mapped_at) where
  mapped_at is not null;`

`mapped_at > last_notified_at` is then the correct "new to this subscriber"
filter, and it does the right thing when the TCAD parcel join later backfills
coordinates for a permit issued weeks ago: it goes out in the next digest, dated
honestly by its real `issue_date`.

### One new SQL function

`permits_since()` — `permits_near()` with the time filter swapped from
`issue_date >= date` to `mapped_at > timestamptz`, ordered newest-first, small
cap:

```sql
create function permits_since(
  p_lat double precision,
  p_lng double precision,
  p_radius_m double precision,
  p_since timestamptz,
  p_kinds text[] default null,
  p_limit integer default 50
) returns table (/* same columns as permits_near + mapped_at */) ...
order by mapped_at desc
limit least(greatest(p_limit, 1), 200);
```

Same bounding-box-prefilter-then-haversine approach as `permits_near`, no
PostGIS.

## Endpoints

All Netlify functions, `.mts`, service key via `_shared/supabase.mts`.

| Function | Trigger | Job |
| --- | --- | --- |
| `watch` | `POST /api/watch` | Validate, insert unconfirmed row, send confirm email |
| `watch-confirm` | `GET /api/watch/confirm?token=` | Set `confirmed_at` + watermark, redirect to the app |
| `watch-unsubscribe` | `GET` and `POST /api/watch/unsubscribe?token=` | Set `unsubscribed_at`, render a plain page |
| `send-permit-digests` | scheduled | The diff: per subscription, query `permits_since`, send, advance watermark |
| `resend-webhook` | `POST /api/resend-webhook` | On bounce / complaint, set `suppressed_at` |

### `POST /api/watch`

- Body: `{ email, lat, lng, radius, kinds, label, cadence }`.
- Validate: email shape; lat/lng inside the Austin bounds check already in
  `permits.mts` (29.5–31, -98.5–-97); radius clamped to the same range as the
  search; `cadence in ('daily','weekly')`; `kinds` a subset of the four.
- **Require a real location.** Reject a subscription whose coordinates are the
  default downtown centre — watching "the app's landing view" is not a thing
  anyone means to do. The front end hides the control in the default state; the
  endpoint enforces it.
- Abuse guard: reject if this email has more than ~5 rows created in the last
  hour, or more than ~20 active total. A tiny count query, no new table.
- If an identical active subscription already exists (same email, same snapped
  point, same radius, same kinds), do not create a duplicate — just re-send the
  confirm email if still unconfirmed, and return the same 200 either way.
- Insert the row, call Resend, return `{ ok: true }`. The response is the same
  whether or not the address was already subscribed — "check your inbox" — so it
  cannot be used to probe who is subscribed.

### `GET /api/watch/confirm?token=`

- Look up by `confirm_token` where `confirmed_at is null`.
- Set `confirmed_at = now()`, `last_notified_at = now()`.
- 302 to the app with a flag: `/{slug}?p=…&watch=confirmed` (reuse the search
  slug from `label`), or `/?watch=confirmed` if there is no clean slug.
- Already-confirmed or unknown token → redirect with `watch=confirmed` anyway
  (idempotent, no information leak). Genuinely malformed → `watch=error`.

### `GET` / `POST /api/watch/unsubscribe?token=`

- Look up by `unsubscribe_token`, set `unsubscribed_at = now()` if not already.
- Must work as a bare `GET` with no JavaScript — email clients follow the link
  directly. Render a minimal HTML page: "You're unsubscribed from alerts for
  {label}." plus a link back to the site.
- Also accept `POST` for RFC 8058 one-click (`List-Unsubscribe-Post:
  List-Unsubscribe=One-Click`), returning 200 with no body.

### `send-permit-digests` (scheduled)

- Cron **`0 9 * * *`** — two hours after the `0 7` import, to leave room for the
  incremental geocode. **Prerequisite, bundled into this work (decided
  2026-09-01):** the incremental geocode (`geocode-census-background`) is
  currently *manual only* — nothing schedules it, so the digest would only be as
  fresh as the last hand-run. Give it a `schedule:` of `0 8 * * *` (between the
  import and the digest) as part of building alerts.
- Select active subscriptions (`confirmed_at not null and unsubscribed_at is
  null and suppressed_at is null`). Daily cadence every run; weekly only when
  `date_part('dow', now()) = 1` (Monday).
- Record the run start time once. For each subscription:
  - `permits_since(lat, lng, radius_m, last_notified_at, kinds, 50)`.
  - Zero rows → **send nothing, do not advance the watermark.** No "nothing
    happened" email; those train people to filter you out. Leaving the watermark
    put also means a permit geocoded late still can't slip through a gap.
  - One or more rows → render and send the digest. On a successful send, set
    `last_notified_at = <run start>` and `digest_count = digest_count + 1`. On a
    send failure, leave the watermark — it retries next run.
- Resend supports batch send (100 messages/call); chunk the sends.
- Time budget: Netlify scheduled functions cap around 30 s (the importer learned
  this). Fine for launch volume. If subscriptions outgrow one run, page across
  runs by processing oldest-watermark-first (the active index is ordered for
  this) and stopping at a time budget; the rest catch up next run. Move to a
  background function only if that stops being enough.
- Log each run to `data_sources` (or a dedicated `notification_runs` table)
  with counts: subscriptions processed, digests sent, permits included, errors.

## Email

### Provider: Resend

- Free tier is 3,000/month, 100/day — enough to launch. $20/month for 50k after.
- DNS on `yardsign.city` (Netlify DNS): SPF, DKIM (`resend._domainkey`), and a
  custom `MAIL FROM` subdomain. One-time dashboard setup.
- `RESEND_API_KEY` in Netlify env.
- From: `alerts@yardsign.city`, display name "Yard Sign". Reply-to
  `yardsign.city@gmail.com` (decided 2026-09-01).
- Webhook (`/api/resend-webhook`) for `email.bounced` and `email.complained`,
  signature-verified, → `suppressed_at`.

### Templates

Two: **confirm** and **digest**. Plain functions returning `{ subject, html,
text }` — string templates, no templating dependency, matching the rest of the
codebase. Always send both `html` and `text`.

- **Confirm:** one sentence on what they will get, the confirm button/link, and
  "if you didn't request this, ignore it." Expires in 7 days (enforced by the
  unconfirmed-row sweep, mentioned in copy).
- **Digest:** subject `N new permits near {short label}`. Body lists each
  permit — address, kind + work class, truncated description, valuation, issue
  date — each linking to `/{permit-slug}?p={number}` (the per-marker URL). Cap
  the list at ~25 with "…and N more — see all" linking to the search. Footer:
  the unsubscribe link, `List-Unsubscribe` headers, a "City of Austin permit
  data; not affiliated with the City" line, and a physical postal address.
  **The postal address is a launch blocker (PO box TBD, 2026-09-01)** — the
  footer template leaves a placeholder and digests must not be sent to the
  public until it is filled.

## Front end

- **"Watch this area"** button in the results panel, between the summary and the
  list. Click expands an inline form (email + daily/weekly toggle + submit) —
  inline, not a modal, matching the locate-button treatment.
- Prefills entirely from current state: `location.lat/lng`, `location.label`,
  `radius`, `activeKinds`.
- Hidden when `locationSource === 'default'` — you must search a real address or
  drop a pin first. A one-line hint in that state: "Search an address to watch
  it."
- After submit: the form is replaced by "Check your email to confirm. We'll
  watch {label} within {radius}."
- On load, `?watch=confirmed` shows a dismissible banner ("You're watching
  {label}."); `?watch=error` shows a quiet failure line. Strip the param after
  reading it.
- No new route, no new page in the SPA. The confirm and unsubscribe pages are
  server-rendered by their functions.

## Abuse and hygiene

- **Confirmed opt-in only.** Nothing sends before the link is clicked. Non-
  negotiable — it is the spam-list defence.
- Rate-limit `/api/watch` per email (and optionally per IP): ~5 creates/hour,
  ~20 active/email.
- Resend bounce/complaint webhook → `suppressed_at`, so a dead or hostile
  address is dropped automatically.
- Sweep unconfirmed rows older than 7 days — a `delete` at the top of the
  digest run, or a small weekly job.
- CAN-SPAM: every email needs a working unsubscribe (have it) and a physical
  postal address (**PO box TBD — launch blocker**, see the Templates section).
  The digest is arguably informational, but include the address regardless.

## Known gap: the 21% that never get coordinates

Census `no_match` permits (about 21% of the feed, disproportionately new
subdivisions — the population this product cares most about) have no
coordinates, so `permits_since` cannot match them and a subscriber will never
hear about them. This is the same omission the search UI now owns with the
"N more permits in this ZIP aren't on the map" line.

**Decided 2026-09-01: ship with disclosure, not blocked on closing the gap.**

- v1: accept it, and say so in the confirm email and the watch form — "new
  streets the county hasn't mapped yet may be missed," consistent with the
  existing honesty line.
- Later: the TCAD parcel join backfills those coordinates. `mapped_at` makes
  that land correctly — a permit picks up coordinates, and the next digest
  includes it, dated by its real `issue_date`.

## Decided 2026-09-01

- **Automating the incremental geocode is bundled into this work**, not a
  separate track — see the digest section.
- **Alerts ship with the ungeocoded-gap disclosure**; not blocked on the TCAD
  join.
- **Reply-to `yardsign.city@gmail.com`** (from stays `alerts@yardsign.city`).
- **Postal address: PO box TBD — a hard launch blocker.** Build everything, use
  a placeholder in the footer template, but do not send digests to the public
  until it is real.
- Remaining defaults accepted unless changed: cadence **daily**, confirm link
  **deep-links** back to the watched search, digest caps at **25** with "…and N
  more", weekly digest **Monday 09:00 UTC**.

## Still open

- The actual PO box (above) — the one thing that blocks going live.

## Migrations

- `subscriptions` table + indexes + `enable row level security`.
- `permits.mapped_at` column + backfill + index.
- `permits_since()` function.

## Build order

1. Migrations (all three).
2. Geocoders set `mapped_at`. **Automate the incremental geocode pass** — its
   own schedule or a tail call from the importer — since the digest depends on
   it.
3. `POST /api/watch` + `GET /api/watch/confirm` + Resend wiring + confirm
   template. Verify end to end against a real inbox.
4. `watch-unsubscribe` (GET + POST) + page.
5. `send-permit-digests` + digest template. Verify with a subscription whose
   watermark is backdated a few days.
6. Front-end "Watch this area" control + `?watch=` banners.
7. `resend-webhook` for bounces/complaints.
8. Unconfirmed-row sweep.
9. `README.md` pipelines table + `docs/current-state.md` updates.

## Testing

- Pure, exported, unit-tested: the `/api/watch` request validator, token
  handling, `resolveDigestWindow` (cadence → run today or not), and
  `buildDigest(subscription, permits) -> { subject, html, text }` (snapshot the
  text body). Extract `buildDigest` so the scheduled function is testable
  without Resend or the database, the way `toPermitRecord` and `resolveWindow`
  were for the importer.
- `permits_since()` verified by hand against known rows, like the other RPCs.
- The network calls to Resend are not covered, matching the existing convention.
