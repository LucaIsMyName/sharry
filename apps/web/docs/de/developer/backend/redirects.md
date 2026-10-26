# Weiterleitungen

`tryShortLink` in `apps/api/src/redirect.ts` behandelt `GET`-, `HEAD`- und `POST`-Pfade mit zwei Segmenten, zum Beispiel `/s/summer-sale`. Das erste Segment muss das aktive Präfix oder ein eingeschaltetes altes Präfix sein. Alles andere fällt zum Dashboard durch.

Die Auffangroute ist für `GET`, `HEAD` und `POST` registriert. Sie versucht zuerst einen Kurzlink. Ein behandelter Kurzlink beendet die Antwort. Ein `POST`, das kein Kurzlink ist, und jeder Pfad unter `/api`, der die Auffangroute erreicht hat, geben 404 zurück. Andere `GET`- und `HEAD`-Anfragen erhalten in Produktion das Dashboard-HTML oder in der Entwicklung einen Hinweis, wenn Vite die Oberfläche liefert.

## Präfix und Slug

Reservierte Namen in `packages/shared/src/prefix.ts` sind unter anderem `api`, `health`, `assets`, `login`, `account`, `links`, `campaigns`, `analytics`, `admin` und `docs`. Ein Kurzlink-Präfix kann diese URLs nicht belegen. Slugs reservieren dieselben Namen plus `favicon.ico` und `robots.txt`.

Das Präfix wird nicht am Link gespeichert. Angezeigte Kurz-URLs werden aus der Weiterleitungsdomain des Links gebaut, wenn diese Domain noch verifiziert ist, sonst aus `SHORT_URL_BASE`, dann dem aktuellen Präfix und dem Slug. Eine Änderung des Präfixes in den Einstellungen schreibt jeden angezeigten Link beim nächsten Lesen um. Gedruckte QR-Codes enthalten weiter den alten Pfad. Das Einschalten alter Präfixe löst bisherige Präfixe weiter auf. Diese Änderung verlangt eine Bestätigung, weil gespeicherte Adressen sonst 404 würden.

## Weiterleitungsdomains

Administratorinnen und Administratoren fügen Hostnamen unter Domains hinzu. Sharry speichert eine ausstehende Zeile und einen TXT-Token. Die Verifizierung schlägt `_<slug>-challenge.<hostname>` nach. Der Slug kommt aus `APP_NAME` und ist in der Vorgabe `sharry`. Die Domain wird nur akzeptiert, wenn dieser TXT-Wert passt. Der Deployment-Hostname aus `SHORT_URL_BASE` oder `APP_URL` kann nicht hinzugefügt werden. `GET /api/redirect-domains` gibt verifizierte Hostnamen an jede angemeldete Person zurück. Das Anlegen oder Bearbeiten eines Links kann `redirectDomainId` speichern. Eine fehlende, ausstehende oder gelöschte Domain fällt für die angezeigte URL, den CSV-Export und neue QR-Codes auf `SHORT_URL_BASE` zurück.

Derselbe Slug löst weiter auf jedem Host auf, der diesen Prozess erreicht. Die gewählte Domain ist die kanonische Adresse. Sie macht den Slug nicht exklusiv für diesen Host.

Sharry prüft verifizierte Domains jede Stunde erneut. Ein Lookup-Timeout oder ein anderer vorübergehender DNS-Fehler lässt die Domain verifiziert. Zwei Prüfungen hintereinander ohne passenden TXT-Eintrag setzen sie auf ausstehend zurück. Ausstehend stoppt neue Zertifikate und nimmt den Hostnamen aus dem Weiterleitungsmenü, bis eine Administratorin oder ein Administrator ihn wieder prüft.

Caddy fragt `GET /internal/caddy/ask?domain=` bevor es ein Zertifikat ausstellt. Die Route gibt nur für einen verifizierten Hostnamen 200 zurück, und nur wenn die Verbindung von Loopback kommt. Andere Namen geben 404 zurück. Pfade, die kein Kurzlink sind, geben auf einem verifizierten eigenen Host 404 zurück, deshalb bleibt das Dashboard auf dem Deployment-Host.

Die Eindeutigkeit von Slugs ignoriert die Großschreibung. Die Antwort für einen vergebenen Slug ist 409 mit "This short URL is already in use. Please choose a different slug."

## Passwort, Cache und Klicks

Ein passwortgeschützter Link zeigt ein kleines HTML-Formular und setzt ein Freischalt-Cookie. Falsche Passwörter sind auf 10 Versuche pro Minute für diesen Link und Besucher begrenzt. Die Besucher-ID ist derselbe tägliche HMAC wie für Klicks, deshalb wird die rohe IP nicht gespeichert. Der Zähler liegt in der Datenbank, und alte Zeilen gehen mit der stündlichen Bereinigung raus. Eine erfolgreiche Passworteingabe antwortet mit 303, damit der Browser dem Ziel mit GET folgt, und dieses Freischalten zählt als Klick. Spätere Besuche nutzen den Weiterleitungstyp des Links. Jede Weiterleitung sendet `Cache-Control: no-store`, auch 301 und 308, damit eine Zieländerung nicht im Browser hängen bleibt.

Klicks werden nach der Antwort aufgezeichnet, aus einem `onResponse`-Hook. Ein pausierter, fehlender oder abgelaufener Link zeichnet keinen Klick auf. Die anonyme Besucher-ID ist ein täglicher HMAC einer gekürzten IP und des User-Agents. Die rohe IP wird nicht gespeichert. Referrer werden als Hostnamen gespeichert.

## UTM zusammenführen

UTM-Werte vom Link und von einer `v`-Variante oder einem `qr`-Code, wenn sie zu diesem Link gehören, werden einmal aufgelöst und auf das Ziel gelegt. Eine Varianten- oder QR-ID von einem anderen Link wird ignoriert. Leere Variantenfelder behalten die Werte des Links. Query-Parameter am Ziel, die nicht ersetzt werden, und das URL-Fragment bleiben.

## Routing

Vor diesem Zusammenführen liest `matchRoute` in `packages/shared` `links.routing_rules`. Der Besuch besteht aus dem ausgewerteten User-Agent, dem Referrer-Hostnamen, dem Geo-Land wenn `GEOIP_DB_PATH` gesetzt ist, und den `utm_*`-Parametern am Kurzlink. Regeln laufen in der Reihenfolge des Arrays. Eine Regel passt nur, wenn jede Bedingung passt. Der erste Treffer ersetzt das Ziel. UTM-Werte von Link und Variante werden danach auf diese URL gelegt.

Browser, Gerät, Betriebssystem und Land kommen aus gemeinsamen Katalogen. Referrer-Vorgaben sowie UTM-Quelle und Medium ebenfalls, und diese Felder akzeptieren auch eigene Werte. Kampagne, ID, Begriff und Inhalt sind freie Zeichenfolgen, und gespeicherte Werte stehen in der Liste. Der Vergleich ignoriert die Großschreibung. Eine Referrer-Vorgabe oder ein eigener Host trifft diesen Hostnamen oder eine Subdomain, deshalb trifft Google `news.google.com`.

`is` passt, wenn der Besuch einem der gewählten Werte entspricht. `is not` passt, wenn er keinem davon entspricht. Eine leere Liste nutzt das Linkziel. Eine Regel wird übersprungen, wenn ihre URL nicht `http` oder `https` ist, ein Feld oder Operator unbekannt ist, keiner der gewählten Werte noch erkannt wird oder eine Länderbedingung kein Geo-Ergebnis hat. Eine Route, die mit dem älteren Operator „ist einer von“ gespeichert wurde, wird als `is` gelesen. Die Auswertung ist auf 50 Regeln und 30 Bedingungen begrenzt. Jeder Fehler nutzt das Linkziel, und die Weiterleitung wird trotzdem abgeschlossen.
