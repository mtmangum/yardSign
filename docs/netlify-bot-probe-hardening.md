# Netlify: stop scanner bots from inflating analytics

A reusable recipe for any Netlify site that is a single-page app (SPA) with a `/* → /index.html` catch-all. Worked out on ScoreScout (2026-08-28 and 2026-09-30); the rules live in [`netlify.toml`](../netlify.toml).

## The problem

Internet-wide scanners probe every domain for WordPress installs and leaked config files (`/wp-admin/install.php`, `/xmlrpc.php`, `/.env`, `/backend/.env.backup`, ...). On an SPA the catch-all rewrite answers **every** unknown path with `index.html` and a `200`. Netlify Web Analytics counts a 200 as a pageview, so the probes:

- show up as top "pages" and drown out real traffic,
- count against bandwidth,
- look like a leaked site to anyone reading the logs (they aren't: the response is the app shell, never a real file).

Netlify Web Analytics has no bot filter. The lever is to stop answering probe paths with a 200. A `404` lands in the "Top resources not found" report instead of "Top pages".

## The fix

Add 404 redirects to `netlify.toml` **above** the catch-all. Netlify applies the first matching rule, so order matters.

```toml
# --- WordPress probes (adjust: drop any prefix your site really uses) ---
[[redirects]]
  from = "/wp-admin/*"
  to = "/index.html"
  status = 404

[[redirects]]
  from = "/wp-login.php"
  to = "/index.html"
  status = 404

[[redirects]]
  from = "/wp-includes/*"
  to = "/index.html"
  status = 404

[[redirects]]
  from = "/wp-content/*"
  to = "/index.html"
  status = 404

[[redirects]]
  from = "/xmlrpc.php"
  to = "/index.html"
  status = 404

[[redirects]]
  from = "/wordpress/*"
  to = "/index.html"
  status = 404

[[redirects]]
  from = "/wp/*"
  to = "/index.html"
  status = 404

[[redirects]]
  from = "/vendor/*"
  to = "/index.html"
  status = 404

# --- Env files, VCS, cloud credentials ---
# An exact "/.env" rule is not enough: scanners also try /.env.staging,
# /.env.backup, and nested copies like /backend/.env or /src/.env.local.
[[redirects]]
  from = "/.env"
  to = "/index.html"
  status = 404

[[redirects]]
  from = "/.env.*"
  to = "/index.html"
  status = 404

[[redirects]]
  from = "/:a/.env"
  to = "/index.html"
  status = 404

[[redirects]]
  from = "/:a/:b/.env"
  to = "/index.html"
  status = 404

[[redirects]]
  from = "/:a/.env.*"
  to = "/index.html"
  status = 404

[[redirects]]
  from = "/:a/:b/.env.*"
  to = "/index.html"
  status = 404

[[redirects]]
  from = "/.git/*"
  to = "/index.html"
  status = 404

[[redirects]]
  from = "/.aws/*"
  to = "/index.html"
  status = 404

# --- existing catch-all stays LAST ---
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

Notes:

- `to = "/index.html"` with `status = 404` serves the app shell as the 404 body. Point it at a real `404.html` if you'd rather show something specific.
- Use `:placeholder` segments for mid-path wildcards (`/:a/.env`). A bare `*` is only reliable as a trailing splat, so `/*/.env` is not used. Each placeholder matches exactly one path segment, hence the one- and two-level variants. Add `/:a/:b/:c/...` if you see deeper paths in the logs.
- Only block paths your site doesn't serve. Skip `/vendor/*` if you have a real `vendor` route, and so on.
- Add more probe paths from your own **Analytics → Top resources not found** report rather than guessing; it shows what scanners actually try on your domain.

## Optional: robots.txt

SPAs without a `public/robots.txt` return the app shell as HTML with a 200 for `/robots.txt` (and `/sitemap.xml`). Crawlers treat that as garbage. Add a real file; keep API/function routes out of crawl scope if you pay per request or per row of backend egress:

```
User-agent: *
Disallow: /api/
```

Only add a sitemap if you can generate one that's accurate. Without one, `/sitemap.xml` returns a 404 after this change, which is fine.

## Optional: geo-block

If the site has no legitimate audience in certain countries and they dominate the noise, a country-conditional redirect is resolved at Netlify's edge (no function cost):

```toml
[[redirects]]
  from = "/*"
  to = "/geo-blocked.html"
  status = 451
  force = true
  conditions = {Country = ["cn", "in", "ru"]}
```

Put it above the catch-all and add a static `public/geo-blocked.html`. This trims volume only. It's VPN-evadable and is **not** a security control. Skip it for sites with an international audience.

## Verify after deploy

Local testing is not reliable: `netlify dev` serves `status = 404` redirects as 200, even for rules that work in production. Check against the deployed site instead.

```bash
SITE=https://your-site.example
for p in .env .env.staging .env.backup backend/.env src/.env.local .git/config .aws/credentials wp-login.php xmlrpc.php; do
  printf "%-24s " "/$p"; curl -s -o /dev/null -w "%{http_code}\n" "$SITE/$p"
done
curl -s -o /dev/null -w "real route: %{http_code}\n" "$SITE/"   # must stay 200
curl -s "$SITE/robots.txt"
```

Every probe should be `404`, the real route `200`, and `robots.txt` should show your file. If a nested path still returns 200, the placeholder rule isn't matching; check the rule order and segment depth.

Confirm the deploy landed first with the CLI:

```bash
netlify api listSiteDeploys --data '{"site_id":"<SITE_ID>","per_page":1}'   # state should be "ready"
```

## What to expect

- The probe paths move from **Top pages** to **Top resources not found**. Old hits stay in the 7-day window until they age out.
- Real-visitor numbers get cleaner, but not perfectly: some bots still hit `/` and look like normal pageviews. Analytics can't separate those; blocking them needs bot rules at a CDN/WAF layer.
- Nothing was ever exposed. This only affects how requests are counted and answered.

## Per-site checklist

1. Open **Analytics → Top pages** and **Top resources not found**; note which probe paths appear.
2. Paste the rules above into `netlify.toml` above the `/* → /index.html` catch-all; remove any that collide with real routes.
3. Add `public/robots.txt` (and `geo-blocked.html` + the geo rule only if warranted).
4. Add a CHANGELOG entry if the project keeps one.
5. Deploy, then run the verification block above.
