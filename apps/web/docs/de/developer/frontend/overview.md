# Frontend-Überblick

Das Dashboard ist eine React-App in `apps/web`, gebaut mit Vite, TypeScript und Tailwind. In Produktion liefert derselbe Node-Prozess die kompilierten Dateien wie die API. In der Entwicklung läuft Vite auf Port 5173 und leitet `/api` und `/health` an Port 3000 weiter. Es leitet auch `^/s/` weiter, damit das Standardpräfix für Kurzlinks vom Dashboard-Ursprung geöffnet werden kann. Andere Präfixe liefert nur die API.

`npm run build -w @sharry/web` schreibt `apps/web/dist`. Die API liefert `dist/assets` unter `/assets/` und gibt `dist/index.html` für Dashboard-Routen zurück. Diese statische Registrierung läuft nur, wenn `NODE_ENV` `production` ist und das Asset-Verzeichnis existiert.

Gemeinsame Typen und Zod-Schemas kommen aus `@sharry/shared`. Die UI-Komponenten liegen in `apps/web/src/components/ui`. Gemeinsame Tabellenzellen begrenzen langen Text und zeigen eine Auslassung, während ein Knopf, eine Knopfgruppe oder eine Auswahl in einer Zelle die volle Breite behält. Seiten liegen in `apps/web/src/pages`. Shell, Navigation und Abmelden sind `apps/web/src/components/shell.tsx`. Auf einem kleinen Bildschirm ist die obere Leiste das Menü. Die Seitenüberschrift bleibt auf der Seite. Der aktuelle Eintrag in der Seitenleiste hat eine primäre Kante, und die Darstellung ist ein Knopf, der hell, dunkel und System durchschaltet. Eine Seite, die noch lädt, zeigt einen Platzhalter statt einer leeren Liste. Der Chat füllt den Hauptbereich: das Gespräch scrollt für sich, und das Nachrichtenfeld bleibt unten in dieser Spalte. Ein Ergebnis, das zu einem Feld gehört, ist ein Tooltip an einem Symbol neben der Beschriftung dieses Feldes. Das Schließen dieses Tooltips hält ihn geschlossen, wenn du auf die Seite zurückkehrst. Ein Speichern, Kopieren oder fehlgeschlagenes Laden ist ein Toast unten rechts, der nach ein paar Sekunden verschwindet. Übersicht, Links, Kampagnen und Analysen sind das Hauptmenü. Docs und die Administratorseiten sitzen unter einer Trennlinie, in kleinerer Schrift. Jede Route setzt den Browsertitel auf `Seite · APP_NAME`. `APP_NAME` ist in der Vorgabe `Sharry`. Das Dashboard sendet `noindex, nofollow`, damit Suchmaschinen es nicht indexieren.

Benutzer- und Entwicklerdocs sind Markdown-Dateien in `apps/web/docs/<locale>`. Englisch liegt in `apps/web/docs/en` und Deutsch in `apps/web/docs/de`. Vite lädt sie mit `import.meta.glob` als Rohtext und zeigt den Ordner, der zur aktiven Sprache passt, und fällt auf Englisch zurück, wenn eine Seite fehlt. Die API-Referenz wird aus dem JSDoc-Block über jeder Route in `apps/api/src` von `apps/web/api-docs-plugin.ts` erzeugt, während Vite baut oder die App ausliefert. Diese englischen Zeichenketten übersetzt der Browser mit `t()`.

## Sprachen

Das Dashboard ruft `t("English sentence")` aus `apps/web/src/i18n` auf. Der englische Satz ist der Schlüssel. Eine fehlende Übersetzung bleibt Englisch. Deutsche Zeichenketten liegen in `apps/web/src/i18n/de.ts`. Das angemeldete Konto speichert `users.locale`. Konto speichert sie mit `PATCH /api/auth/locale`. Die erlaubten Codes sind `locales` in `@sharry/shared`.

So fügst du eine Sprache hinzu:

1. Nimm ihren Code in `locales` in `packages/shared/src/schemas.ts` auf.
2. Lege `apps/web/src/i18n/<code>.ts` an und registriere sie neben Deutsch.
3. Kopiere `apps/web/docs/en` nach `apps/web/docs/<code>` und übersetze die Seiten.

Eine Datenbankmigration ist nicht nötig. Die Spalte ist einfacher Text, und die API lehnt einen Code ab, der nicht in der Liste steht.
