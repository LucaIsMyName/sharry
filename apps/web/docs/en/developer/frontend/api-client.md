# API client

`apps/web/src/api.ts` wraps `fetch`. It sends the session cookie (`credentials: 'include'`), sets `content-type` for JSON bodies, and throws `ApiError` with the server message and HTTP status.

Pages call `api('/api/links')` and similar paths. They do not send API keys. External programs use the bearer token documented under User, API keys, and the API reference.

A non-OK response reads the JSON `error` field when the body is JSON, and throws `ApiError`. Callers catch that error and show the message in a toast. A message that belongs to one field is a tooltip beside that field. Network failures throw the underlying `fetch` error. An empty 204 response returns `undefined`.

The client does not attach `Authorization`. A dashboard request that needs a user is authenticated only by the session cookie (`sharry_session` when `APP_NAME` is `Sharry`). That is why account routes can ignore bearer tokens without the UI having a second credential.

Shared response types, such as `LinkSummary`, live next to `api()` so pages do not redeclare the payload. Request bodies are plain objects passed through `JSON.stringify`. File uploads, such as a QR center image or an account photo, use `FormData` and omit the JSON content type so the browser can set the multipart boundary.
