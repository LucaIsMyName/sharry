# Analytics

The dashboard shows clicks, unique visitors, bot clicks, a daily series, and breakdowns for referrer, country, browser, operating system, device, and each `utm_*` value. Analytics also draws a bots bar for people and bot clicks beside the bot total. A blank UTM value is counted as “Not set”. Country and region are filled only when a local GeoIP database is configured.

Overview is the summary of the links you can see, with the recent links. Analytics is the same totals with a link picker and the breakdowns. Standard users see analytics for their own links, and for any other links Settings lets them open. Administrators can look across every link.

## What is counted

Each redirect writes one click after the response is sent. A successful password unlock is a click. A paused, unknown, or expired link is not.

Unique visitors are distinct anonymous ids inside the selected range. The id is a daily HMAC of a truncated address and the user agent. IPv4 keeps the first three octets. IPv6 keeps a short prefix. The raw address is not stored. The id changes the next UTC day, so a person who returns tomorrow is a new visitor. Referrers are stored as hostnames only.

A request is a bot when the user agent is empty or matches a crawler, preview fetcher, or script client such as `curl`. Bot clicks are counted separately and the device is recorded as bot. Browser names are Chrome, Edge, Firefox, Safari, Opera, or Other. Devices are desktop, mobile, tablet, or bot.

Country and region stay empty unless `GEOIP_DB_PATH` points at a local MaxMind database on the server. Sharry does not call a GeoIP service.

## Filters

The bar under the heading filters the cards, the chart, the breakdowns, the summary, and the counts in the link table. It is there whether or not AI is on.

Links is a multiselect of the links you can see. Leave it empty for every visible link. Several links match any of them. One link keeps that link’s name in the heading. A row in the table selects that one link. All links clears only the link choice.

From and To are calendar days. The chart slider writes the same two fields. Leave both empty for about the last 30 days. A range longer than 400 days shows an error and is not sent.

Country, browser, operating system, and each UTM field are multiselects. Leave a field empty to ignore it. Several values in one field match any of them. Different fields all have to match. A blank stored value is “Not set” and can be selected. The choices come from clicks in the chosen dates and selected links, ignoring the other dimension filters. Clear removes every filter.

## A written summary

When AI is turned on, Analytics shows Summarize in its own card above the chart. Overview and a link’s chart still put the date range and Summarize together. The range starts on the last 30 days. The slider runs from the oldest link you can see, or from 400 days ago when that day is unknown, through today. On a link, the slider starts on the day that link was created. A range longer than 400 days asks you to narrow it. Summarize writes two or three sentences for that range: the totals, whether the later half rose or fell, and the top referrer, country, or UTM value. Choosing one link on Analytics summarizes that link, for the same days as the chart. The sentences are not stored.

## Date range

`from` and `to` are UTC calendar days and both ends are included. `from=2026-10-20&to=2026-10-20` is that single day. Omit `to` to end at the current time. A range longer than 400 days is rejected so the daily series cannot drop days while the totals still count them. The start must be before the end. The slider moves as you drag and reloads the chart when you release it, or after a short pause.

## Retention and export

`analytics_retention_days` in Settings deletes older click events on startup and then every hour. The default is 365. Use `0` to keep them. The maximum is 3650 days. Expired password-reset tokens and expired sessions are deleted on the same schedule.

Administrators can export links and clicks as CSV from Settings. The click export includes every UTM column, plus time, slug, referrer, country, browser, operating system, device, and whether the click was a bot.
