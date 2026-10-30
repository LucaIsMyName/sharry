# Das Dashboard erweitern

Eine angemeldete Seite ist eine Komponente unter `apps/web/src/pages`, eine verzögerte Route in `apps/web/src/router.tsx` und ein Eintrag in `apps/web/src/components/shell.tsx`. Ein neuer Block im Seiten-Builder ist eine gemeinsame Definition, beschrieben unter [Blöcke im Seiten-Builder](/docs/developer/frontend/page-blocks). Eine Route von der Seite aus aufrufen geht über `api()` aus dem [API-Client](/docs/developer/frontend/api-client).

## Seitenkomponente

`ReportsPage` ist eine kleine Ansicht. Die Shell liefert bereits die Sitzung, die Seitenleiste und den Browsertitel aus `handle.title`.

```ts
export function ReportsPage() {
  return <h1 className="font-heading text-2xl font-medium tracking-tight">Reports</h1>;
}
```

Die Datei liegt unter `apps/web/src/pages/reports.tsx`. Zeichenketten, die eine Person sieht, gehen durch `t("English sentence")`, mit der deutschen Zeile in `apps/web/src/i18n/de.ts`.

## Route

`lazyPage` lädt die Ansicht, wenn der Pfad geöffnet wird. `handle.title` ist der Name in der oberen Leiste und im Browsertitel. Die Route sitzt unter der Shell, damit der Sitzungs-Loader läuft. Eine Seite nur für Administratorinnen und Administratoren nutzt `adminLoader` statt des Loaders der Shell.

```ts
const ReportsPage = lazyPage(() =>
  import("./pages/reports.tsx").then((module) => module.ReportsPage),
);

{ path: "reports", handle: { title: "Reports" }, element: <Routed><ReportsPage /></Routed> }
```

Dieses Objekt gehört in die `children` der Shell in `apps/web/src/router.tsx`, neben `media` und `analytics`.

## Navigation

Füge einen Eintrag in `Navigation` in `apps/web/src/components/shell.tsx` hinzu. `Item` ist derselbe Link, den die anderen Einträge nutzen.

```ts
<Item to="/reports" icon={<ChartColumn size={18} />}>
  {t("Reports")}
</Item>
```

## Reservierte öffentliche Namen

Ein Pfad, der ein einzelnes öffentliches Segment ist, etwa `/reports`, kann mit einem Kurzlink-Präfix oder einem Slug kollidieren. Füge das Segment in beide Listen in `packages/shared/src/prefix.ts` ein und aktualisiere die Präfix-Tests.

```ts
export const RESERVED_PREFIXES = [
  "api",
  "reports",
] as const;

export const RESERVED_SLUGS = [
  "api",
  "reports",
];
```

Ein Pfad mit mehr als einem Segment, etwa `/links/new`, liegt bereits unter einem reservierten Präfix und braucht keinen neuen Eintrag.
