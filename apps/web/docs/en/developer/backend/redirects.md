# Redirects

`tryShortLink` in `apps/api/src/redirect.ts` handles `GET`, `HEAD`, and `POST` paths with two segments, such as `/s/summer-sale`. The first segment must be the active prefix or an enabled legacy prefix. Anything else falls through to the dashboard.

The catch-all route is registered for `GET`, `HEAD`, and `POST`. It tries a short link first. A handled short link ends the response. A `POST` that is not a short link, and any path under `/api` that reached the catch-all, returns 404. Other `GET` and `HEAD` requests receive the dashboard HTML in production, or a development hint when Vite is serving the UI.

## Prefix and slug

Reserved names in `packages/shared/src/prefix.ts` include `api`, `health`, `assets`, `login`, `account`, `links`, `campaigns`, `analytics`, `admin`, and `docs`. A short-link prefix cannot take those URLs. Slugs reserve the same names plus `favicon.ico` and `robots.txt`.

The prefix is not stored on the link. Displayed short URLs are built from the link's redirect domain when that domain is still verified, otherwise from `SHORT_URL_BASE`, then the current prefix and the slug. Changing the prefix in Settings rewrites every displayed link on the next read. Printed QR codes still contain the old path. Enabling legacy prefixes keeps resolving previous prefixes. That change asks for confirmation because saved addresses would otherwise 404.

## Redirect domains

Administrators add hostnames from Domains. Sharry stores a pending row and a TXT token. Verification looks up `_<slug>-challenge.<hostname>`, where the slug comes from `APP_NAME` and defaults to `sharry`, and accepts the domain only when that TXT value matches. The deployment hostname from `SHORT_URL_BASE` or `APP_URL` cannot be added. `GET /api/redirect-domains` returns verified hostnames to every signed-in user. Creating or editing a link can store `redirectDomainId`. A missing, pending, or deleted domain falls back to `SHORT_URL_BASE` for the displayed URL, CSV export, and new QR codes.

The same slug still resolves on every host that reaches this process. The selected domain is the canonical address. It does not make the slug exclusive to that host.

Sharry checks verified domains again every hour. A lookup timeout or another temporary DNS failure leaves the domain verified. Two checks in a row that find no matching TXT record move it back to pending. Pending stops new certificates and takes the hostname off the redirect menu until an administrator verifies it again.

Caddy asks `GET /internal/caddy/ask?domain=` before issuing a certificate. The route returns 200 only for a verified hostname, and only when the connection comes from loopback. Other names return 404. Paths that are not a short link return 404 on a verified custom host, so the dashboard stays on the deployment host.

Slug uniqueness is case-insensitive. The taken-slug response is 409 with "This short URL is already in use. Please choose a different slug."

## Password, cache, and clicks

A password-protected link renders a small HTML form and sets an unlock cookie. Wrong passwords are limited to 10 attempts per minute for that link and visitor. The visitor id is the same daily HMAC used for clicks, so the raw IP is not stored. The counter is in the database and old rows leave with the hourly purge. A successful password submission answers with 303 so the browser follows the destination with GET, and that unlock is counted as a click. Later visits use the link's redirect type. Every redirect sends `Cache-Control: no-store`, including 301 and 308, so a destination edit is not stuck in the browser.

Clicks are recorded after the response, from an `onResponse` hook. A paused, missing, or expired link does not record a click. The anonymous visitor id is a daily HMAC of a truncated IP and the user agent. The raw IP is not stored. Referrers are stored as hostnames.

## UTM merge

UTM values from the link, and from a `v` variant or a `qr` code when it belongs to that link, are resolved once and merged onto the destination. A variant or QR id from another link is ignored. Blank variant fields keep the link’s values. Query parameters on the destination that are not being replaced, and the URL fragment, are kept.

## Routing

Before that merge, `matchRoute` in `packages/shared` reads `links.routing_rules`. The visit is the parsed user agent, the referrer hostname, the geo country when `GEOIP_DB_PATH` is set, and `utm_*` parameters on the short link. Rules run in array order. A rule matches only when every condition matches. The first match replaces the destination. Link and variant UTM values are then applied to that URL.

Closed values come from shared catalogs: browser, device, operating system, country, referrer presets, and UTM source and medium. Campaign, id, term, and content are free strings. Comparison is case-insensitive. A referrer preset matches the hostname or a subdomain, so Google matches `news.google.com`.

`is` matches when the visit is any selected value. `is not` matches when it is none of them. An empty list uses the link destination. A rule is skipped when its URL is not `http` or `https`, a field or operator is unknown, none of the selected values are still recognized, or a country condition has no geo result. A route saved with the older “is any of” operator is read as `is`. Matching is limited to 50 rules and 30 conditions. Any throw uses the link destination, and the redirect still completes.
