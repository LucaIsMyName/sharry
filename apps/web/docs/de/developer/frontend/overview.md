# Frontend-Überblick

Das Dashboard ist eine React-App in `apps/web`, gebaut mit Vite, TypeScript und Tailwind. In Produktion liefert derselbe Node-Prozess die kompilierten Dateien wie die API. In der Entwicklung läuft Vite auf Port 5173 und leitet `/api` und `/health` an Port 3000 weiter. Es leitet auch `^/s/`, `^/l/` und `^/files/` weiter, damit das Standardpräfix für Kurzlinks, das Standardpräfix für Seiten und Mediendateien vom Dashboard-Ursprung geöffnet werden können. Andere Präfixe liefert nur die API.

`npm run build -w @sharry/web` schreibt `apps/web/dist`. Die API liefert `dist/assets` unter `/assets/` und gibt `dist/index.html` für Dashboard-Routen zurück. Diese statische Registrierung läuft nur, wenn `NODE_ENV` `production` ist und das Asset-Verzeichnis existiert.

Gemeinsame Typen und Zod-Schemas kommen aus `@sharry/shared`. Die UI-Komponenten liegen in `apps/web/src/components/ui`. Gemeinsame Tabellenzellen begrenzen langen Text und zeigen eine Auslassung, während ein Knopf, eine Knopfgruppe oder eine Auswahl in einer Zelle die volle Breite behält. Seiten liegen in `apps/web/src/pages`. Shell, Navigation und Abmelden sind `apps/web/src/components/shell.tsx`. Auf einem kleinen Bildschirm enthält die obere Leiste das Menü, den aktuellen Seitentitel aus `handle.title` der Route und einen Suchknopf, der die Befehlspalette öffnet. Die Seitenüberschrift bleibt auf der Seite. Eine Seite mit eigenem Menü für kleine Bildschirme rendert es mit `SubNav` aus `apps/web/src/components/sub-nav.tsx`. Die Shell gibt ihm eine Zeile über die volle Breite, die unter der oberen Leiste haftet. Auf breiten Bildschirmen ist sie nicht zu sehen. Die Dokumentation legt dort ihre Seitenliste ab, der Chat legt Neuer Chat und Chats dort ab. Eine Seite ohne `SubNav` lässt diese Zeile leer. Knöpfe, die `PageHeader` als Aktion bekommt, stehen auf einem breiten Bildschirm in einer Zeile mit der Überschrift und wandern auf einem kleinen Bildschirm in diese Leiste. Die Leiste bleibt eine Zeile hoch und scrollt seitlich, wenn ihre Knöpfe breiter als der Bildschirm sind. Auf einem kleinen Bildschirm behält jede Tabellenspalte eine lesbare Mindestbreite und die Tabelle scrollt seitlich. Ein breiter Bildschirm passt die Spalten weiter an die Seite an. Ein Codeblock in der Dokumentation hat oben rechts einen Knopf zum Kopieren. Listen in einem Seitenpanel scrollen für sich, wenn sie höher als der Bildschirm sind. Der aktuelle Eintrag in der Seitenleiste hat eine primäre Kante, und die Darstellung ist ein Knopf, der hell, dunkel und System durchschaltet. Eine Seite, die noch lädt, zeigt einen Platzhalter statt einer leeren Liste. Der Chat füllt den Hauptbereich: das Gespräch scrollt für sich, und das Nachrichtenfeld bleibt unten in dieser Spalte. Titel, Nachrichten und Nachrichtenfeld teilen sich eine zentrierte Spalte mit einer Höchstbreite. Auf einem kleinen Bildschirm legt ein Link Speichern, Kopieren und Löschen in die Leiste unter der oberen Leiste, und eine Kampagne legt Speichern und Löschen dorthin. Ein Ergebnis, das zu einem Feld gehört, ist ein Tooltip an einem Symbol neben der Beschriftung dieses Feldes. Das Schließen dieses Tooltips hält ihn geschlossen, wenn du auf die Seite zurückkehrst. Ein Speichern, Kopieren oder fehlgeschlagenes Laden ist ein Toast unten rechts, der nach ein paar Sekunden verschwindet. Übersicht, Links, Kampagnen und Analysen sind das Hauptmenü. Docs und die Administratorseiten sitzen unter einer Trennlinie, in kleinerer Schrift. Jede Route setzt den Browsertitel auf `Seite · APP_NAME`. `APP_NAME` ist in der Vorgabe `Sharry`. Das Dashboard sendet `noindex, nofollow`, damit Suchmaschinen es nicht indexieren.

Benutzer- und Entwicklerdocs sind Markdown-Dateien in `apps/web/docs/<locale>`. Englisch liegt in `apps/web/docs/en` und Deutsch in `apps/web/docs/de`. Vite lädt sie mit `import.meta.glob` als Rohtext und zeigt den Ordner, der zur aktiven Sprache passt, und fällt auf Englisch zurück, wenn eine Seite fehlt. Die API-Referenz wird aus dem JSDoc-Block über jeder Route in `apps/api/src` von `apps/web/api-docs-plugin.ts` erzeugt, während Vite baut oder die App ausliefert. Jede Route enthält einen curl-Befehl und einen TypeScript-`fetch`-Aufruf. Ein Schalter unter der Überschrift wählt eine Sprache für jedes Beispiel, und der Browser merkt sich die Wahl. Diese englischen Zeichenketten übersetzt der Browser mit `t()`. Ein eingezäunter `mermaid`-Block wird als Diagramm dargestellt.

## Seiten-Builder

Der Editor für Landingpages ist `apps/web/src/pages/page-editor.tsx`, seine Teile liegen in `apps/web/src/components/page-builder`:

| Datei | Aufgabe |
| --- | --- |
| `block-tree.tsx` | Die Blockliste mit Verschachtelung, Auswahl, Ziehen und Ablegen, Verschieben, Duplizieren und Löschen |
| `add-block-dialog.tsx` | Der Dialog Block hinzufügen, gruppiert nach Layout, Inhalt und Medien aus der Registry |
| `field-editor.tsx` | Baut die Einstellungen aus den Feldern eines Blocks. Ein Steuerelement pro Feldart |
| `rich-text-editor.tsx` | TipTap-Editor für Rich-Text-Felder. Die Ausgabe wird mit `cleanRichText` bereinigt |
| `page-preview.tsx` | Rendert den Entwurf mit dem gemeinsamen `renderPage` in ein abgeschottetes `srcdoc`-iframe, verzögert um 150 ms, in Desktop- und Handybreite |
| `page-settings-sheet.tsx` | Seiteneinstellungen: Adresse, Ordner, Weiterleitungsdomain, Suchmaschinen, Teilen und Aussehen |
| `page-status.tsx` | Statusabzeichen und die Optionen des Statusfilters |
| `block-icons.tsx` | Ordnet die Symbolnamen aus den Blockdefinitionen lucide-Symbolen zu |

Der Editor enthält keinen Code pro Block. Wie man eine Komponente hinzufügt, steht unter [Blöcke im Seiten-Builder](/docs/developer/frontend/page-blocks).

## Dialoge und Touch-Ziele

Das Dashboard ruft nie `window.confirm`, `window.alert` oder `window.prompt` auf. Eine Ja-Nein-Frage nutzt `ConfirmDialog`, oder `useConfirm()` aus `components/ui/confirm-dialog.tsx`, wenn die Frage mitten in einem asynchronen Handler steht: `if (!(await confirm({ title, description, confirmLabel, destructive: true }))) return;`, wobei `{dialog}` einmal in der Seite gerendert wird. Eine Frage mit Eingabe, etwa die Linkadresse im Rich-Text-Editor, ist ein eigener `Dialog` mit einem `Field`, damit ein falscher Wert neben dem Feld steht statt in einem Hinweisfenster. `src/no-native-dialogs.test.ts` schlägt fehl, wenn ein Browserdialog zurückkommt.

Auf einem Touchscreen ist jedes Steuerelement mindestens 44 mal 44 Pixel groß. Die Größen nutzen Tailwinds Variante `pointer-coarse:`, also behält eine Maus die kompakten Größen, und nichts verschiebt sich, während eine Seite offen ist. `Button` macht das schon für jede Größe. Ein eigener Symbolknopf, Chip, Farbfleck oder Werkzeugleistenknopf ergänzt `pointer-coarse:size-11` (oder `pointer-coarse:h-11`) selbst. Das Zeilenmenü einer `DataTable` öffnet sich mit Rechtsklick und auf Touch mit einem langen Druck von einer halben Sekunde. Spaltenbreiten ändern sich über Pointer-Events, also lassen sie sich auch mit dem Finger ziehen.

## Sprachen

Das Dashboard ruft `t("English sentence")` aus `apps/web/src/i18n` auf. Der englische Satz ist der Schlüssel. Eine fehlende Übersetzung bleibt Englisch. Deutsche Zeichenketten liegen in `apps/web/src/i18n/de.ts`. Das angemeldete Konto speichert `users.locale`. Konto speichert sie mit `PATCH /api/auth/locale`. Die erlaubten Codes sind `locales` in `@sharry/shared`.

So fügst du eine Sprache hinzu:

1. Nimm ihren Code in `locales` in `packages/shared/src/schemas.ts` auf.
2. Lege `apps/web/src/i18n/<code>.ts` an und registriere sie neben Deutsch.
3. Kopiere `apps/web/docs/en` nach `apps/web/docs/<code>` und übersetze die Seiten.

Eine Datenbankmigration ist nicht nötig. Die Spalte ist einfacher Text, und die API lehnt einen Code ab, der nicht in der Liste steht.
