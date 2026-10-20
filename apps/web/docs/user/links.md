# Links

A short link keeps its slug when you change the destination, so printed QR codes and saved addresses keep working. Slugs are unique without regard to case. A taken slug returns: "This short URL is already in use. Please choose a different slug."

The public path uses the prefix stored in Settings, for example `https://share.example.com/s/summer-sale`. Changing the prefix updates every displayed link. Enable legacy prefixes to keep resolving the previous path. That change asks for confirmation.

The links page loads 50 at a time. Load more shows the rest. Expiry is entered in your local time and stored in UTC.

A link can expire, can be disabled, and can require a password before it redirects. Redirects default to 302 and can be 301, 307, or 308. Sharry sends `Cache-Control: no-store` on every redirect, so a later destination change is used the next time someone opens the short URL. A correct password continues with 303, which makes the browser request the destination with GET.

Each link can store `utm_source`, `utm_medium`, `utm_campaign`, `utm_id`, `utm_term`, and `utm_content`. Those values are added to the destination at redirect time. Existing unrelated query parameters and the URL fragment are kept.
