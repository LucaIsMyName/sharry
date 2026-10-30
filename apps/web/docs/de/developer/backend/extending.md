# Die API erweitern

Eine Route kommt in das Modul, dem die Ressource schon gehört. `apps/api/src/server.ts` ruft die `register`-Funktion dieses Moduls aus `buildApp` auf. Ein neues Modul braucht denselben Aufruf. Das Dashboard ruft den Pfad danach über `api()` auf, beschrieben im [API-Client](/docs/developer/frontend/api-client).

## Handler

Der JSDoc-Block steht direkt über `app.get`. `apps/web/api-docs-plugin.ts` liest `@route` und zeigt die Route unter `/docs/api`, einschließlich eines curl-Befehls und eines TypeScript-Beispiels. `requireUser` lehnt eine fehlende Sitzung ab. `AppError` ist ein erwarteter Fehler, etwa eine fehlende Zeile, und wird zum JSON-Feld `error`, das der Client zeigt.

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

`requireUser` und `requireAdmin` liegen in `apps/api/src/auth.ts`. `AppError` liegt in `apps/api/src/support.ts`. Nutze ein Tag, das schon existiert, oder füge ein neues zu `TAG_ORDER` in `scripts/generate-api-docs.ts` hinzu. Decke den Erfolgspfad und den 404 in `apps/api/test/` ab.

## Vorgaben und Standardwerte

Vorschläge für Quelle und Medium kommen aus `UTM_SOURCES` und `UTM_MEDIUMS` in `packages/shared/src/routing.ts`. Referrer-Auswahl kommt aus dem exportierten `REFERRER_PRESETS` in derselben Datei. Ein neuer Wert ist ein neuer Eintrag in dieser Liste.

```ts
const UTM_SOURCES = ["google", "facebook", "newsletter", "partner"];

const UTM_MEDIUMS = ["email", "social", "cpc", "partner"];

export const REFERRER_PRESETS = [
  { id: "none", label: "No referrer", hosts: [] },
  { id: "partner", label: "Partner", hosts: ["partner.example"] },
];
```

Ein neuer Standardwert für eine Administratoreinstellung gehört in `defaultSettings` in `apps/api/src/settings-store.ts`, neben dem passenden Schlüssel auf `AppSettings`.
