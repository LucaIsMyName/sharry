# Redirects

`tryShortLink` in `apps/api/src/redirect.ts` handles `GET`, `HEAD`, and `POST` paths with two segments, such as `/s/summer-sale`. The first segment must be the active prefix or an enabled legacy prefix. Anything else falls through to the dashboard.

Reserved names in `packages/shared/src/prefix.ts` include `api`, `docs`, and the dashboard paths, so a short-link prefix cannot take those URLs.

A password-protected link renders a small HTML form and sets an unlock cookie. Clicks are recorded after the response. UTM values from the link, and from a `v` variant when it belongs to that link, are merged onto the destination.
