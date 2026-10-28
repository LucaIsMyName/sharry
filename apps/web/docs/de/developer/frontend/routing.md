# Routing

`apps/web/src/router.tsx` nutzt React Router. Angemeldete Seiten sitzen unter der Shell. Loader rufen `/api/auth/me` auf und schicken Personen zur Anmeldung, zu einem Passwortwechsel, zur Zwei-Faktor-Einrichtung oder zur Authenticator-Abfrage, wenn die Sitzung für diese Seite noch nicht bereit ist. Eine Sitzung zum Passwortwechsel, die die Einrichtungsseite öffnet, geht zur Passwortseite, nicht zurück zur Anmeldung.

Jede Route setzt einen Dokumenttitel, `Seite · APP_NAME`. `APP_NAME` ist in der Vorgabe `Sharry`. Ein Link, eine Kampagne oder eine Doc-Seite nutzt den eigenen Namen, sobald dieser Datensatz geladen ist. Das anfängliche HTML und der React-Baum enthalten beide `<meta name="robots" content="noindex, nofollow">`, deshalb wird das Dashboard nicht indexiert.

## Öffentliche Routen

| Pfad | Wer sie öffnen kann |
| --- | --- |
| `/login` | Jede Person. Eine fertige Sitzung ist nicht nötig |
| `/login/mfa` | Nur eine Sitzung mit dem Scope `mfa_challenge` |
| `/login/reset` | Jede Person mit einem Reset-Link |
| `/account/password` | Nur eine Sitzung mit dem Scope `password_change` |
| `/account/mfa` | Nur eine Sitzung mit dem Scope `mfa_enroll` |

Jeder andere Scope auf diesen letzten vier Routen wird auf die Seite geschickt, die zum aktuellen Scope passt, oder zum Dashboard, wenn der Scope `full` ist. Eine fehlende Sitzung wird nach `/login` geschickt.

## Angemeldete Routen

Diese sitzen unter der Shell. Der übergeordnete Loader verlangt eine `full`-Sitzung. Eine Sitzung, die noch einen Passwortwechsel, eine Einrichtung oder einen Authenticator-Code braucht, wird zu diesem Schritt umgeleitet. Die Suche ist ein Knopf unter Chat in dieser Seitenleiste. Befehlstaste+K oder Strg+K öffnet dieselbe Palette. Sie ist keine eigene Route.

| Pfad | Seite |
| --- | --- |
| `/` | Übersicht |
| `/links`, `/links/new`, `/links/:id` | Linkliste, Anlegen und Editor |
| `/campaigns`, `/campaigns/:id` | Kampagnenliste und Detail |
| `/pages`, `/pages/:id` | Liste der Landingpages und Seiteneditor |
| `/media` | Mediathek |
| `/analytics` | Analysen |
| `/chat`, `/chat/:id` | Assistenz-Chat |
| `/docs` | Leitet nach `/docs/user/signing-in` um |
| `/docs/*` | Benutzeranleitungen, Entwicklernotizen, `/docs/api` und `/docs/developer/tests` |
| `/account` | Sprache, Passwort, Foto und Zwei-Faktor-Authentifizierung |

Admin-Seiten fügen einen Loader hinzu, der nur die Admin-Rolle erlaubt. Alle anderen werden nach `/` geschickt.

| Pfad | Seite |
| --- | --- |
| `/admin/users` | Konten anlegen und verwalten |
| `/admin/api-keys` | API-Schlüssel |
| `/admin/settings` | Präfixe für Kurzlinks und Seiten, Sitzungen, Mail, KI und CSV-Export |
| `/admin/domains` | Weiterleitungsdomains, DNS-Prüfung und der Einrichtungsdialog |
| `/admin/server` | Arbeitsspeicher, Festplatte, Betriebssystem und installierte Laufzeit des Hosts |
| `/admin/audit` | Audit-Protokoll |

Docs stehen jeder angemeldeten Person unter `/docs` zur Verfügung. Die Seitenliste kommt aus Markdown-Dateien unter `apps/web/docs/<locale>`, mit Englisch in `en` und einem passenden Baum für jede andere Sprache. Die Reihenfolge ist das Array `pageOrder` in `apps/web/src/pages/docs-pages.ts`. Eine Datei, die nicht in diesem Array steht, erscheint trotzdem, am Ende. Die API-Referenz wird beim Vite-Build aus JSDoc erzeugt.

Die Docs-Seitenleiste bleibt sichtbar, während der Artikel scrollt. Benutzer und Entwickler sind einzeln geöffnet, und der Browser merkt sich, welcher offen ist. Ein Link zu einer Seite im anderen Abschnitt öffnet diesen Abschnitt. Backend, Frontend, API und Tests sind Kapitel. Die Seiten darunter nutzen eine kleinere Schrift. `/docs/api` ist die erzeugte API-Referenz. `/docs/developer/tests` liest `/test-results.csv` und zeigt den letzten Vitest-Lauf. In der Entwicklung liefert Vite diese Datei aus `apps/web/public`. In der Produktion liefert die API die Kopie aus dem Dashboard-Build an eine angemeldete Sitzung. Fehlt die Datei, oder ist die Anfrage abgemeldet, bleibt diese Seite leer.

Jedes Routen-Element sitzt in einer Error Boundary. Ein Render-Fehler ersetzt diese Seite durch eine kurze Meldung und einen Knopf zum erneuten Versuch. Die Shell, einschließlich Seitenleiste und Abmelden, bleibt stehen. Die Suche hat eine eigene Boundary, deshalb lässt ein Fehler dort die geöffnete Seite stehen. Loader leiten weiterhin um. Ein Fehler über diesen Boundaries, etwa in der Shell selbst, ersetzt den Bildschirm durch eine feste Meldung und einen Link zurück nach `/`.

Übersicht, Links, Kampagnen, Seiten, Medien, Analysen, Chat, Docs und die Admin-Seiten laden mit `React.lazy()`. Anmeldung und Shell bleiben im ersten Bundle. Das Konto bleibt bei der Anmeldung, weil beide ein Modul teilen. Der Markdown der Anleitungen bleibt ebenfalls im ersten Bundle, weil die Suche ihn aus `docs-pages.ts` liest. Eine Seite zeigt das Lade-Skelett, während ihr Chunk heruntergeladen wird. Der Wechsel zwischen `/links`, `/links/new` und `/links/:id` nutzt einen Download, und dasselbe gilt für Kampagnen sowie für Benutzer, Einstellungen und Audit. Seitenliste und Seiteneditor sind getrennte Chunks, der TipTap-Editor lädt also erst, wenn eine Seite geöffnet wird.

Der Seiteneditor nutzt `useBlocker` aus dem Data Router. Wer mit ungespeicherten Änderungen weggeht, bekommt den Dialog „Ohne Speichern verlassen?“, und beim Schließen des Tabs warnt der Browser selbst.
