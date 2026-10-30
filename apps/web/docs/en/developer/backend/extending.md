# Extending the API

Add a route in the module that already owns the resource. `apps/api/src/server.ts` calls that module's `register` function from `buildApp`. A new module needs the same call. The dashboard then calls the path through `api()`, described in [API client](/docs/developer/frontend/api-client).

## Handler

The JSDoc block sits directly above `app.get`. `apps/web/api-docs-plugin.ts` reads `@route` and shows the route on `/docs/api`, including a curl command and a TypeScript sample. `requireUser` rejects a missing session. `AppError` is an expected failure, such as a missing row, and becomes the JSON `error` the client shows.

```ts
/**
 * Read one report the signed-in user can see.
 * @route GET /api/reports/:id
 * @tag Links
 * @auth api-key or session
 * @param id string Report id
 * @response 200 { report: Report }
 */
app.get("/api/reports/:id", async (request) => {
  await requireUser(app, request, ["full"]);
  const { id } = request.params as { id: string };
  const report = await findReport(app, id);
  if (!report) throw new AppError(404, "Report not found");
  return { report };
});
```

`requireUser` and `requireAdmin` live in `apps/api/src/auth.ts`. `AppError` lives in `apps/api/src/support.ts`. Use a tag that already exists, or add a new one to `TAG_ORDER` in `scripts/generate-api-docs.ts`. Cover the success path and the 404 in `apps/api/test/`.

## Presets and defaults

Source and medium suggestions come from `UTM_SOURCES` and `UTM_MEDIUMS` in `packages/shared/src/routing.ts`. Referrer choices come from the exported `REFERRER_PRESETS` in the same file. Adding a value is a new entry in that list.

```ts
const UTM_SOURCES = ["google", "facebook", "newsletter", "partner"];

const UTM_MEDIUMS = ["email", "social", "cpc", "partner"];

export const REFERRER_PRESETS = [
  { id: "none", label: "No referrer", hosts: [] },
  { id: "partner", label: "Partner", hosts: ["partner.example"] },
];
```

A new default for an administrator setting belongs in `defaultSettings` in `apps/api/src/settings-store.ts`, next to the matching key on `AppSettings`.
