# Links

A short link keeps its slug when you change the destination, so printed QR codes and saved addresses keep working. Slugs are unique without regard to case. A taken slug returns: "This short URL is already in use. Please choose a different slug."

## The public address

The public path uses the prefix stored in Settings, for example `https://share.example.com/s/summer-sale`. Changing the prefix updates every displayed link. Enable legacy prefixes to keep resolving the previous path. That change asks for confirmation.

The domain in that address comes from the deployment origin unless the link stores a verified redirect domain. New link and the link editor both offer that choice. The deployment domain stays the default. A domain that is later removed drops out of the short URL, the CSV export, and new QR codes. A QR image that was already downloaded keeps the address that was encoded at the time. The same slug still opens on the deployment host.

The prefix is a single path segment. It must start with `/` and may contain only lowercase letters, digits, and hyphens. It cannot be a dashboard path such as `api`, `docs`, `login`, or `links`. A slug is 2 to 64 characters of letters, digits, and hyphens, and it cannot be a reserved name such as `favicon.ico` or `robots.txt`.

Leave the slug blank to generate one. The length comes from Settings and is between 4 and 16 characters. The default length is 5. The alphabet leaves out characters that are easy to confuse.

## The links list

The links page loads 50 at a time. Load more shows the rest. Search matches the slug, title, or destination. Each row shows the click total. On a narrow screen the table scrolls sideways so the columns stay readable. Status is Active or Paused. The test icon opens the short URL in a new tab.

You see your own links. An administrator sees every link.

## Creating and editing

A new link needs an `http` or `https` destination, up to 4096 characters. Title and description are optional. Choose a redirect type or leave the account default from Settings. The default for a new install is 302. The other choices are 301, 307, and 308.

Expiry is entered in your local time and stored in UTC. A blank expiry never expires. An expired link stops redirecting.

Pause sets the status to disabled. A paused link does not redirect. Switch it back to Active to restore the same slug and click history.

A link can require a password before it redirects. Visitors must enter this password before the short link redirects. The password is stored as a hash. Leave the field blank on a later edit to keep the saved password. Clearing it removes the requirement.

Save link is in the page header and again at the end of the form. Both buttons store the destination, slug, title, description, redirect domain, redirect type, expiry, password, and UTM fields together. The QR code has its own save.

## Redirects

Sharry sends `Cache-Control: no-store` on every redirect, so a later destination change is used the next time someone opens the short URL. That includes 301 and 308.

A correct password continues with 303, which makes the browser request the destination with GET. That unlock is counted as a click. Later visits use the link's redirect type and an unlock cookie, so the password form is not shown again on that browser until the cookie is gone.

## UTM parameters

Each link can store `utm_source`, `utm_medium`, `utm_campaign`, `utm_id`, `utm_term`, and `utm_content`. Those values are added to the destination at redirect time. Existing unrelated query parameters and the URL fragment are kept.

A blank field adds nothing for that key. If the destination already has the same UTM key, saving warns that the stored value will replace it: "Saving will replace … already present on the destination." The tracked URL under the form is the destination with the current UTM values applied, so you can check the result before you save.

A campaign variant or a QR code can override these values for one visit. See Campaigns and QR codes.
