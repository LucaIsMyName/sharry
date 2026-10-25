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

Diese sitzen unter der Shell. Der übergeordnete Loader verlangt eine `full`-Sitzung. Eine Sitzung, die noch einen Passwortwechsel, eine Einrichtung oder einen Authenticator-Code braucht, wird zu diesem Schritt umgeleitet.

| Pfad | Seite |
| --- | --- |
| `/` | Übersicht |
| `/links`, `/links/new`, `/links/:id` | Linkliste, Anlegen und Editor |
| `/campaigns`, `/campaigns/:id` | Kampagnenliste und Detail |
| `/analytics` | Analysen |
| `/docs` | Leitet nach `/docs/user/signing-in` um |
| `/docs/*` | Benutzeranleitungen, Entwicklernotizen und `/docs/api` |
| `/account` | Sprache, Passwort, Foto und Zwei-Faktor-Authentifizierung |

Admin-Seiten fügen einen Loader hinzu, der nur die Admin-Rolle erlaubt. Alle anderen werden nach `/` geschickt.

| Pfad | Seite |
| --- | --- |
| `/admin/users` | Konten anlegen und verwalten |
| `/admin/api-keys` | API-Schlüssel |
| `/admin/settings` | Präfix, Sitzungen, Mail und CSV-Export |
| `/admin/domains` | Weiterleitungsdomains, DNS-Prüfung und der Einrichtungsdialog |
| `/admin/server` | Arbeitsspeicher, Festplatte, Betriebssystem und installierte Laufzeit des Hosts |
| `/admin/audit` | Audit-Protokoll |

Docs stehen jeder angemeldeten Person unter `/docs` zur Verfügung. Die Seitenliste kommt aus Markdown-Dateien unter `apps/web/docs/<locale>`, mit Englisch in `en` und einem passenden Baum für jede andere Sprache. Die Reihenfolge ist das Array `pageOrder` in `apps/web/src/pages/docs.tsx`. Eine Datei, die nicht in diesem Array steht, erscheint trotzdem, am Ende. Die API-Referenz wird beim Vite-Build aus JSDoc erzeugt.
