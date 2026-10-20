# API client

`apps/web/src/api.ts` wraps `fetch`. It sends the session cookie, sets `content-type` for JSON bodies, and throws `ApiError` with the server message.

Pages call `api('/api/links')` and similar paths. They do not send API keys. External programs use the bearer token documented under User, API keys, and the API reference.
