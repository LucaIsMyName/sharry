# Deploy

`npm run deploy` installiert Sharry über SSH auf einem Ubuntu- oder Debian-Server. Es nutzt kein Docker. Du führst es von deinem eigenen Rechner aus. Der Server baut dann die Veröffentlichung, führt Migrationen aus und startet einen systemd-Dienst hinter Caddy neu.

Zwei Dinge bleiben außerhalb des Skripts:

- Der VPS läuft schon mit Ubuntu oder Debian und akzeptiert SSH mit dem Schlüssel in `.env.production`. `DEPLOY_USER` ist `root` oder ein Benutzer, der `sudo -n` ausführen kann.
- Der A-Eintrag der Domain zeigt auf die IPv4-Adresse des VPS. Die Firewall des Anbieters erlaubt die Ports 22, 80 und 443. Eine Cloud-Firewall ist nicht die eigene Firewall der Maschine, deshalb kann das Skript sie nicht öffnen.

Caddy fordert das Zertifikat für `DOMAIN` an und erneuert es, weil der Sitename ein Hostname ist und die Ports 80 und 443 den Server erreichen. Sharry ruft keine Zertifikat-API auf. Die Caddyfile erlaubt auch Zertifikate auf Abruf für Weiterleitungsdomains, die eine Administratorin oder ein Administrator verifiziert hat. Caddy fragt vorher `http://127.0.0.1:3000/internal/caddy/ask`, und Sharry erlaubt das nur für eine verifizierte Weiterleitungsdomain. Provision fügt diese Blöcke hinzu, wenn sie fehlen, entfernt die ausgemusterten Optionen `interval` und `burst`, die Caddy 2.11 ablehnt, und lädt Caddy neu. Es lässt den vorhandenen Site-Block für `DOMAIN` stehen. Eine Datei, die schon eine `https://`-Site hat, bekommt keine zweite.

## `.env.production` ausfüllen

Auf dem Rechner, von dem du deployst:

```bash
cp .env.production.example .env.production
```

Setze `DOMAIN` (zum Beispiel `share.example.com`), `DEPLOY_ENABLED=true`, `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY_PATH` als absoluten Pfad zum privaten Schlüssel und `INITIAL_ADMIN_USERNAME`, `INITIAL_ADMIN_EMAIL` und `INITIAL_ADMIN_PASSWORD`.

Lass `APP_URL`, `SHORT_URL_BASE`, `DEPLOY_HEALTHCHECK_URL`, `SESSION_SECRET`, `ENCRYPTION_KEY` und `DATABASE_URL` leer, außer du hast schon Werte, die bleiben sollen. `DEPLOY_REMOTE_DIR` ist standardmäßig `/var/www/sharry`. Das erste Passwort wird nur genutzt, wenn die Datenbank noch keine Administratorin oder keinen Administrator hat, muss mindestens 12 Zeichen haben, und die erste Anmeldung verlangt ein neues.

Wenn der Host noch nicht in `known_hosts` steht (oder in `DEPLOY_KNOWN_HOSTS_PATH`), zeichnet das erste Deploy den Schlüssel von `ssh-keyscan` auf und gibt seinen Fingerabdruck aus.

`npm run deploy` liest nur `.env.production`. Schlüssel mit dem Präfix `DEPLOY_` werden nie hochgeladen. `DOMAIN` bleibt ebenfalls in `.env.production`. Deploy kopiert die Laufzeitwerte nach `$DEPLOY_REMOTE_DIR/shared/.env`. Diese Kopie passiert bei der ersten Installation und wieder, wenn du `--sync-env` übergibst. Eine vorhandene Serverumgebung bleibt unangetastet, außer dieses Flag ist gesetzt.

Wenn `APP_URL`, `SHORT_URL_BASE` oder `DEPLOY_HEALTHCHECK_URL` leer sind, nutzt Deploy `https://DOMAIN` und `https://DOMAIN/health`. Wenn `SESSION_SECRET` oder `ENCRYPTION_KEY` leer sind, erzeugt das erste Deploy sie und schreibt sie nach `.env.production` zurück. Eine leere `DATABASE_URL` wird als `postgresql://sharry:<password>@127.0.0.1:5432/sharry` erzeugt und auf dieselbe Weise zurückgeschrieben. Spätere Deploys nutzen diese Zeilen wieder.

Wenn der Server schon `shared/.env` hat und `SESSION_SECRET` oder `ENCRYPTION_KEY` in `.env.production` leer ist, stoppt Deploy. Kopiere die vorhandenen Werte nach `.env.production`. Ein leerer Wert ist keine Bitte, sie zu ersetzen. Das Ersetzen von `ENCRYPTION_KEY` macht gespeicherte Zwei-Faktor-Geheimnisse und das SMTP-Passwort unlesbar.

`APP_URL` und `SHORT_URL_BASE` werden bei jedem Prozessstart aus der Serverumgebung gelesen. Die Einstellungen können sie nicht ändern. Eine Domainänderung heißt, die Server-`.env` zu bearbeiten (oder mit `--sync-env` zu deployen) und den Dienst neu zu starten. QR-Bilder, die schon heruntergeladen wurden, behalten die Adresse, die damals kodiert wurde. Weiterleitungen passen auf den Pfad, deshalb funktioniert ein Host weiter, der diesen Prozess noch erreicht. CORS nutzt ebenfalls diese beiden Umgebungswerte.

`REDIS_URL` ist reserviert und ungenutzt. Es wird nicht hochgeladen.

### Laufzeitvariablen

Diese werden auf den Server kopiert. Leere Zeichenketten gelten als nicht gesetzt, wo eine Vorgabe existiert.

| Variable | Vorgabe | Rolle |
| --- | --- | --- |
| `NODE_ENV` | `development` | Auf dem Server `production` setzen |
| `APP_NAME` | `Sharry` | Produktname in der Seitenleiste, im Browsertitel und auf der Anmeldeseite. Leer oder weggelassen bleibt `Sharry`. Der Slug ist das Präfix für API-Schlüssel, das Sitzungscookie, das Link-Freischalt-Cookie, CSV-Exporte, Backups und den Domain-TXT-Namen |
| `APP_URL` | `https://DOMAIN` wenn leer | Ursprung der Links zum Zurücksetzen des Passworts |
| `APP_HOST` | `0.0.0.0` | Adresse, an die der Prozess bindet |
| `APP_PORT` | `3000` | Port, an den der Prozess bindet. Caddy leitet an `127.0.0.1:3000` weiter |
| `SHORT_URL_BASE` | `https://DOMAIN` wenn leer | Ursprung, der in Kurzlinks und neue QR-Codes kodiert wird |
| `SHORT_URL_PREFIX` | nötig, zum Beispiel `/s` | Fallback-Präfix, bis die Einstellungen eines speichern |
| `DATABASE_URL` | beim ersten Deploy erzeugt | PostgreSQL-URL. Benutzer- und Datenbanknamen sind Buchstaben, Zahlen und Unterstriche, und die URL muss ein Passwort enthalten |
| `INITIAL_ADMIN_USERNAME` | optional | Erste Administratorin oder erster Administrator, 3–32 Zeichen |
| `INITIAL_ADMIN_EMAIL` | optional | E-Mail der ersten Administratorin oder des ersten Administrators |
| `INITIAL_ADMIN_PASSWORD` | optional | Passwort der ersten Administratorin oder des ersten Administrators, 12–200 Zeichen |
| `SESSION_SECRET` | erzeugt, mindestens 32 Zeichen | Hashing von Sitzung und API-Schlüssel. Nicht beiläufig rotieren |
| `ENCRYPTION_KEY` | erzeugt, mindestens 32 Zeichen | Zwei-Faktor-Geheimnisse und das gespeicherte SMTP-Passwort |
| `OTP_ISSUER` | `Sharry` | Name in Authenticator-Apps |
| `SMTP_HOST` | leer | Fallback-Mailhost, bis die Einstellungen einen speichern |
| `SMTP_PORT` | `587` | Fallback-Mailport |
| `SMTP_USER` | leer | Fallback-Mailbenutzername |
| `SMTP_PASSWORD` | leer | Fallback-Mailpasswort |
| `EMAIL_FROM` | leer | Fallback-Absenderadresse |
| `GEOIP_DB_PATH` | leer | Lokale MaxMind-Datenbank. Land und Region bleiben ohne sie leer |
| `QR_DATA_DIR` | `data/qr-logos` | Mittelbilder. Auf dem Server liegt das unter `shared/data` |
| `AVATAR_DATA_DIR` | `data/avatars` | Kontofotos, ebenfalls unter `shared/data` |

### Nur-Deploy-Variablen

Diese bleiben auf dem Rechner, von dem du deployst.

| Variable | Vorgabe | Rolle |
| --- | --- | --- |
| `DOMAIN` | nötig | Öffentlicher Hostname, ohne Schema oder Pfad |
| `DEPLOY_ENABLED` | `false` | Muss `true` sein, sonst stoppt Deploy |
| `DEPLOY_HOST` | nötig | Server-Hostname oder Adresse |
| `DEPLOY_PORT` | `22` | SSH-Port |
| `DEPLOY_USER` | nötig | SSH-Benutzer: `root` oder ein Benutzer mit passwortlosem sudo |
| `DEPLOY_SSH_KEY_PATH` | nötig | Absoluter Pfad zum privaten Schlüssel |
| `DEPLOY_REMOTE_DIR` | `/var/www/sharry` | Wurzel der Veröffentlichung. Keine `..`-Segmente |
| `DEPLOY_BUILD_COMMAND` | `npm run build` | Nur dieser Wert wird akzeptiert |
| `DEPLOY_RESTART_SERVICE` | `sharry` | Name der systemd-Unit |
| `DEPLOY_HEALTHCHECK_URL` | `https://DOMAIN/health` | Nach dem Neustart abgefragt |
| `DEPLOY_KNOWN_HOSTS_PATH` | `~/.ssh/known_hosts` | Datei der Hostschlüssel |

## Deploy

```bash
npm install
npm run deploy
```

Übergib `--sync-env`, wenn die Laufzeitwerte wieder auf den Server kopiert werden sollen.

Auf einem Server, der schon in Benutzung ist, kann jeder Schritt wiederholt werden. Node.js 22.23.4 oder neuer bleibt installiert. Ein vorhandener PostgreSQL-Cluster bleibt, wie er ist. Eine vorhandene Datenbankrolle oder Datenbank wird nicht gelöscht, und ihr Passwort wird nicht geändert. Wenn die Rolle `sharry` schon existiert und `DATABASE_URL` leer ist, stoppt Deploy und bittet dich, die aktuelle Verbindungszeichenkette zu setzen. Eine Caddy-Site, die `DOMAIN` schon nennt, bleibt stehen.

Das Skript tut danach der Reihe nach Folgendes:

1. Prüft `/etc/os-release` und stoppt, außer die ID ist `ubuntu` oder `debian`.
2. Installiert das neueste Node.js 22, wenn `/usr/bin/node` fehlt oder älter als 22.23.4 ist. Unterstützte CPUs sind x86_64 und arm64.
3. Installiert PostgreSQL, wenn `psql` oder `pg_dump` fehlt, und startet es.
4. Legt den Systembenutzer `sharry`, die Datenbankrolle und die Datenbank an, wenn sie fehlen. Die Rolle bekommt kein neues Passwort, wenn sie schon existiert.
5. Installiert Caddy, wenn es fehlt. Wenn `DOMAIN` noch keine Site hat, fügt es eine Site hinzu, die an `127.0.0.1:3000` weiterleitet, und lädt Caddy neu.
6. Wenn `ufw` schon aktiv ist, erlaubt es die Ports 80 und 443. Es schaltet `ufw` nicht ein, wenn es aus ist.
7. Packt das Repo, ohne `.git`, `node_modules`, die lokalen Umgebungsdateien und `data`, und lädt es nach `$DEPLOY_REMOTE_DIR/releases/<timestamp>` hoch.
8. Verknüpft `$DEPLOY_REMOTE_DIR/shared/data` mit `data` in der Veröffentlichung, damit QR-Bilder und Avatare die nächste Veröffentlichung überstehen.
9. Wenn freier Speicher plus freier Swap unter 1,5 GB liegt, fügt es eine 2-GB-Swap-Datei unter `/swapfile` hinzu und führt dann `npm ci` und `npm run build` auf dem Server aus. Wenn der Build wegen Speichermangels beendet wird, gib Speicherplatz für Swap frei und führe Deploy noch einmal aus.
10. Schreibt `shared/.env` bei der ersten Installation und wieder, wenn `--sync-env` gesetzt ist. Der Dateimodus ist `0600`.
11. Führt `npm run backup` aus und schreibt einen Dump im Custom-Format nach `$DEPLOY_REMOTE_DIR/backups`.
12. Führt Migrationen gegen diese Serverumgebung aus.
13. Merkt das vorherige Ziel von `current` in `previous-release`.
14. Installiert `deploy/systemd/sharry.service` mit dem ausgefüllten Remote-Verzeichnis.
15. Zeigt `current` auf die neue Veröffentlichung, lädt systemd neu, aktiviert den Dienst und startet ihn neu.
16. Fragt `https://DOMAIN/health` bis zu 30 Mal ab, einmal pro Sekunde. Wenn das scheitert und eine vorherige Veröffentlichung existiert, zeigt Deploy `current` wieder darauf, startet neu und beendet sich mit einem Fehler. Alte Veröffentlichungen werden erst gelöscht, wenn der Health-Check besteht, und die fünf neuesten bleiben.

Geheimnisse werden nicht ausgegeben. Der Dienst lauscht auf `APP_PORT` (Vorgabe 3000) als Benutzer `sharry`. Die Unit-Datei ist `WorkingDirectory=$DEPLOY_REMOTE_DIR/current` und `ExecStart=/usr/bin/node apps/api/dist/index.js`. Sie startet bei einem Fehler neu, liest `shared/.env` und darf nur unter `shared/data` und dem `data`-Link der aktuellen Veröffentlichung schreiben.

Melde dich mit der ersten Administratorin oder dem ersten Administrator an und wähle ein neues Passwort. Mail und die Zwei-Faktor-Pflicht werden danach in den Einstellungen eingerichtet.

## Backup

`npm run backup` schreibt ein `pg_dump` im Custom-Format mit `DATABASE_URL`, ohne die URL auf die Kommandozeile zu setzen. Deploy führt das vor den Migrationen aus. Plane es auf dem Server zusätzlich mit cron. Auf dem Server zeige den Befehl auf die Laufzeitdatei:

```bash
cd /var/www/sharry/current
SHARRY_ENV_FILE=/var/www/sharry/shared/.env npm run backup -- /var/www/sharry/backups/manual.dump
```

## Zurückrollen

Ein fehlgeschlagener Health-Check stellt die vorherige Veröffentlichung wieder her und startet den Dienst neu, wenn `previous-release` gesetzt ist. Zum Zurückrollen von Hand:

1. Zeige `current` auf das vorherige Veröffentlichungsverzeichnis, das in `previous-release` steht.
2. Starte den systemd-Dienst neu.
3. Wenn die Migration zerstörend war, stelle den Dump aus `$DEPLOY_REMOTE_DIR/backups` mit `pg_restore` wieder her.

## Health

`GET /health` prüft den Prozess und die Datenbank mit `select 1`. Es verlangt keine Sitzung. Ein Datenbankausfall lässt die Prüfung scheitern.
