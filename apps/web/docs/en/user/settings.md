# Settings

Settings is available to administrators. Mail and two-factor rules are saved here. The public site address, short-link origin, session secret, and encryption key stay in the server environment. Changing `APP_URL` or `SHORT_URL_BASE` means editing that environment and restarting the process. Settings cannot change them.

Save settings writes the cards in one request. Export links and Export clicks sit outside that form. They download CSV files of every link and every click. The click file includes each `utm_*` column.

## Links

Public prefix is the first segment of every short URL, such as `/s`. It must start with `/`, be a single segment, and use only lowercase letters, digits, and hyphens. It cannot be a dashboard path such as `api`, `docs`, or `login`.

Changing the prefix asks for confirmation. Printed QR codes and saved short URLs keep the old path. Turn on “Redirect the previous prefix” in that dialog, or download new codes. “Keep previous prefixes working” stays on so those old paths keep resolving. The page lists the legacy prefixes that are still accepted.

Default redirect is the type used when someone creates a link and does not pick another. The choices are 301, 302, 307, and 308. A new install uses 302.

Random slug length is used when a new link leaves the slug blank. It is a whole number from 4 to 16. The default is 5.

Four controls decide whether a user can see or change a link owned by someone else. They apply to the user role. An administrator always sees and edits every link. An API key follows the user it belongs to. The default keeps each person’s links private.

“Users see each other's links” is off by default. While it is off, the other three controls have no effect.

“Users can edit each other's links” is off by default, so a shared link can be opened, including its clicks and a QR download, but not changed. Turn it on to allow changes, including delete, password, UTM, and QR updates. The switch stays disabled until “Users see each other's links” is on. A hidden link is not found. A visible link the user cannot change refuses the change.

“Users see admin links” is off by default. Users see those links only when this switch and “Users see each other's links” are both on.

“Users can change admin links” is off by default. Turning it on also turns on “Users see admin links”. Turning off “Users see admin links” turns this off.

Campaigns stay private. A user can attach a link they are allowed to view to their own campaign.

## Sessions

Analytics retention, days, deletes click events older than that many days. The purge runs when the process starts and then every hour. Use `0` to keep events. The maximum is 3650. The default is 365.

Session length, hours, is how long a finished sign-in stays valid. The default is 168 hours (7 days). The minimum is 1 hour and the maximum is 2160 hours (90 days). A session that still needs a password change, enrollment, or an authenticator code uses a shorter lifetime, documented under Auth.

Registration is closed. Administrators create every account. There is no switch to open it.

Require a two-factor code for every account sends people who have not enrolled to the enrollment page after their password. The switch stays disabled until a mail server is saved in the Email card. When the requirement is off, each person can turn a code on from Account. When it is on, they cannot turn it off.

## Email

Password reset uses this mail server once a host and a from address are saved. The password is encrypted in the database and is not shown again. Leave the password field blank to keep the saved one.

Until a host and from address are saved here, Sharry falls back to `SMTP_HOST` and `EMAIL_FROM` in the server environment when those are set. If neither place has a host and from address, reset email stays off, and two-factor authentication cannot be turned on.

The status line under the fields says which of those three states is active: saved here, still using the server environment, or off.

## AI

The AI card configures the assistant for every signed-in person. Choose a provider: OpenAI, Anthropic, Google Gemini, or an OpenAI-compatible endpoint. The model list follows the provider. Pick Custom model to type an id the list does not show. An OpenAI-compatible provider also needs a base URL, such as `https://example.com/v1`. The server sends the API key to that URL.

The API key is encrypted with the same key as the SMTP password. It is not an environment variable, and Settings never shows it again. Leave the field blank to keep the saved key. Clear saved key removes it on the next save. AI is available only when a provider, a model, and a key are saved, plus a base URL for the compatible provider.

Test connection checks the provider, model, and key in the form, including a key you have not saved yet. It asks the provider for a short reply and does not store a chat or the key. Save settings for Chat at `/chat` to use them. Old chats stay readable when the provider is cleared. New replies stop until a provider, model, and key are saved again.
