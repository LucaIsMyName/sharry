# Redirects

`tryShortLink` in `apps/api/src/redirect.ts` handles `GET`, `HEAD`, and `POST` paths with two segments, such as `/s/summer-sale`. The first segment must be the active prefix or an enabled legacy prefix. Anything else falls through to the dashboard.

Reserved names in `packages/shared/src/prefix.ts` include `api`, `docs`, and the dashboard paths, so a short-link prefix cannot take those URLs.

A password-protected link renders a small HTML form and sets an unlock cookie. A successful password submission answers with 303 so the browser follows the destination with GET, and that unlock is counted as a click. Later visits use the link's redirect type. Every redirect sends `Cache-Control: no-store`, including 301 and 308, so a destination edit is not stuck in the browser. Clicks are recorded after the response. UTM values from the link, and from a `v` variant or a `qr` code when it belongs to that link, are resolved once and merged onto the destination.
