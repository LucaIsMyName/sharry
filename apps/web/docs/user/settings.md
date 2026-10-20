# Settings

Settings is available to administrators. Mail and two-factor rules are saved here. The public site address, short-link origin, session secret, and encryption key stay in the server environment. Changing `APP_URL` or `SHORT_URL_BASE` means editing that environment and restarting the process. Settings cannot change them.

Save settings writes the three cards in one request. Export links and Export clicks sit outside that form. They download CSV files of every link and every click. The click file includes each `utm_*` column.

## Links

Public prefix is the first segment of every short URL, such as `/s`. It must start with `/`, be a single segment, and use only lowercase letters, digits, and hyphens. It cannot be a dashboard path such as `api`, `docs`, or `login`.

Changing the prefix asks for confirmation. Printed QR codes and saved short URLs keep the old path. Turn on “Redirect the previous prefix” in that dialog, or download new codes. “Keep previous prefixes working” stays on so those old paths keep resolving. The page lists the legacy prefixes that are still accepted.

Default redirect is the type used when someone creates a link and does not pick another. The choices are 301, 302, 307, and 308. A new install uses 302.

Random slug length is used when a new link leaves the slug blank. It is a whole number from 4 to 16. The default is 5.

## Sessions

Analytics retention, days, deletes click events older than that many days. The purge runs when the process starts and then every hour. Use `0` to keep events. The maximum is 3650. The default is 365.

Session length, hours, is how long a finished sign-in stays valid. The default is 168 hours (7 days). The minimum is 1 hour and the maximum is 2160 hours (90 days). A session that still needs a password change, enrollment, or an authenticator code uses a shorter lifetime, documented under Auth.

Registration is closed. Administrators create every account. There is no switch to open it.

Require a two-factor code for every account sends people who have not enrolled to the enrollment page after their password. The switch stays disabled until a mail server is saved in the Email card. When the requirement is off, each person can turn a code on from Account. When it is on, they cannot turn it off.

## Email

Password reset uses this mail server once a host and a from address are saved. The password is encrypted in the database and is not shown again. Leave the password field blank to keep the saved one.

Until a host and from address are saved here, Sharry falls back to `SMTP_HOST` and `EMAIL_FROM` in the server environment when those are set. If neither place has a host and from address, reset email stays off, and two-factor authentication cannot be turned on.

The status line under the fields says which of those three states is active: saved here, still using the server environment, or off.
