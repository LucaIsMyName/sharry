# Analytics

The dashboard shows clicks, unique visitors, bot clicks, a daily series, and breakdowns for referrer, country, browser, device, and each `utm_*` value. A blank UTM value is counted as “Not set”. Country and region are filled only when a local GeoIP database is configured.

`from` and `to` are UTC calendar days and both ends are included. `from=2026-10-20&to=2026-10-20` is that single day. Omit `to` to end at the current time. A range longer than 400 days is rejected so the daily series cannot drop days while the totals still count them.

Sharry does not store raw IP addresses. The anonymous visitor id is a daily HMAC of a truncated address and the user agent. Referrers are stored as hostnames.

`analytics_retention_days` in Settings deletes older click events on startup. Use `0` to keep them.

Administrators can export links and clicks as CSV. The click export includes every UTM column. Standard users see analytics for their own links.
