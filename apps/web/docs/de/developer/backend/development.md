# Lokale Entwicklung

Sharry läuft auf Node.js 22.23.4 oder neuer. Es nutzt kein Docker. Ein Befehl startet die API, das Dashboard und ein lokales PostgreSQL, wenn noch keines lauscht.

## Erstes Einrichten

Vom Repository-Wurzelverzeichnis:

```bash
cp .env.development.example .env.development
npm install
npm run db:migrate
npm run dev
```

Fülle `DATABASE_URL`, `SESSION_SECRET`, `ENCRYPTION_KEY` und das Passwort der ersten Administratorin oder des ersten Administrators in `.env.development`, bevor du das erste Mal startest. `SESSION_SECRET` und `ENCRYPTION_KEY` müssen jeweils mindestens 32 Zeichen haben. Das erste Passwort muss mindestens 12 Zeichen haben.

`npm run dev`, `npm run db:migrate`, `npm run setup`, `npm run create-admin` und `npm run backup` lesen auf diesem Rechner `.env.development`. Wenn diese Datei fehlt und ein altes `.env` vorhanden ist, nutzen diese Skripte stattdessen `.env`. `SHARRY_ENV_FILE` zeigt einen Befehl auf eine andere Datei. Halte beide Umgebungsdateien aus Git heraus. Die Beispieldateien enthalten nur Platzhalter.

## Was `npm run dev` startet

Das Skript startet ein eingebettetes PostgreSQL und lässt dann die API und das Dashboard zusammen laufen.

Der eingebettete Server wird nur angelegt, wenn `DATABASE_URL` auf `127.0.0.1`, `localhost` oder `::1` zeigt und auf diesem Port noch nichts Verbindungen annimmt. Seine Daten bleiben in `data/pg-dev`. Das Schließen des Terminals stoppt ihn. Das nächste `npm run dev` startet ihn wieder und behält dieselben Daten. Wenn der Port schon offen ist, nutzt Sharry diese Datenbank und startet keine weitere. Eine `DATABASE_URL` auf einem anderen Host bleibt unangetastet.

Die API ist `tsx watch apps/api/src/index.ts`. Sie lauscht auf `APP_PORT`, Vorgabe 3000, und lädt neu, wenn sich API-Dateien ändern. Das Dashboard ist Vite auf `http://127.0.0.1:5173`. Vite leitet `/api` und `/health` an Port 3000 weiter und auch Pfade, die mit `/s/` beginnen, damit das Standardpräfix für Kurzlinks in der Entwicklung vom Dashboard-Ursprung geöffnet werden kann.

Beim Start lädt die API die Umgebung, führt Migrationen aus, legt die erste Administratorin oder den ersten Administrator an, wenn keine existiert, löscht abgelaufene Klickereignisse und Passwort-Reset-Token und lauscht dann. Dieselbe Bereinigung läuft jede Stunde wieder.

## Öffentliche Adressen in der Entwicklung

`APP_URL` ist der Ursprung der Links zum Zurücksetzen des Passworts: `{APP_URL}/login/reset?token=...`.

`SHORT_URL_BASE` ist der Ursprung der Kurzlinks, die im Dashboard, im Link-CSV-Export und in neu kodierten QR-Codes gezeigt werden. In der Entwicklung sollte es der API-Ursprung sein, `http://127.0.0.1:3000`, damit jedes Präfix aufgelöst wird. Vite leitet nur das Präfix `/s/` weiter. Ein Präfix, das du in den Einstellungen änderst, liefert die API, nicht eine neue Vite-Regel.

`SHORT_URL_PREFIX` ist das öffentliche Standard-Pfadsegment, zum Beispiel `/s`. Die Einstellungen können das aktive Präfix nach der Installation ändern. Der Umgebungswert ist der Fallback, wenn noch kein Präfix gespeichert wurde.

## Die erste Administratorin oder der erste Administrator

Beim ersten Start legt Sharry die erste Administratorin oder den ersten Administrator aus `INITIAL_ADMIN_USERNAME`, `INITIAL_ADMIN_EMAIL` und `INITIAL_ADMIN_PASSWORD` an, wenn noch keine existiert. Das Passwort wird mit Argon2id gehasht und nie ausgegeben. Dieses Konto muss das Passwort ändern, bevor das Dashboard aufgeht. Spätere Starts setzen das Passwort nicht zurück, und eine gelöschte Administratorin oder ein gelöschter Administrator wird nicht neu angelegt.

`npm run create-admin` legt eine weitere Administratorin oder einen weiteren Administrator aus denselben drei Variablen an. Es führt zuerst Migrationen aus. Wenn Benutzername oder E-Mail schon existieren, stoppt es und ändert das Passwort nicht. Das neue Konto muss dieses Passwort bei der ersten Anmeldung ändern.

`npm run setup` ist derselbe Schritt für die erste Administratorin oder den ersten Administrator, ohne das Dashboard zu starten.

## Alltägliche Befehle

| Befehl | Was er tut |
| --- | --- |
| `npm run dev` | Eingebettetes Postgres wenn nötig, API auf Port 3000, Dashboard auf Port 5173 |
| `npm run db:migrate` | Drizzle-Migrationen anwenden |
| `npm run db:generate` | Eine neue Migration aus dem Schema schreiben |
| `npm test` | Vitest. Datenbanktests starten ein lokales PostgreSQL und nutzen kein PGlite. Schreibt außerdem das CSV des letzten Laufs |
| `npm run typecheck` | Typprüfung für shared, database, API, web und die Repo-Skripte |
| `npm run build` | Zuerst das Dashboard bauen, dann die API |
| `npm run backup` | `pg_dump` im Custom-Format mit `DATABASE_URL`, ohne die URL auf die Kommandozeile zu setzen |
| `npm start` | Die gebaute API ausführen: `node apps/api/dist/index.js` |

`npm test` schreibt `apps/web/public/test-results.csv`, wenn der Lauf endet, auch wenn Tests fehlschlagen. Die Datei hat eine Zeile pro Testdatei: bestanden, fehlgeschlagen, übersprungen und Dauer. Sie wird nicht committet. Das Dashboard zeigt diese Datei unter Docs, in Entwickler, als Tests → Letzter Lauf (`/docs/developer/tests`). Vite liefert sie während `npm run dev` aus `public`, und ein Dashboard-Build kopiert die Datei, die zum Bauzeitpunkt dort liegt. `npm run deploy` führt die komplette Suite aus, bevor es hochlädt, deshalb enthält der Produktionsbuild dieses CSV und der Server liefert es unter `/test-results.csv` an eine angemeldete Sitzung.

QR-Mittelbilder werden unter `QR_DATA_DIR` geschrieben (Vorgabe `data/qr-logos`). Kontofotos werden unter `AVATAR_DATA_DIR` geschrieben (Vorgabe `data/avatars`). Beides liegt in `data/`, das `npm run dev` nicht löscht.

`REDIS_URL` ist reserviert und ungenutzt. Land und Region bei Klickereignissen bleiben leer, bis `GEOIP_DB_PATH` auf eine lokale MaxMind-Datenbank zeigt.
