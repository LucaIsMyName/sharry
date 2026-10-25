# Analysen

Das Dashboard zeigt Klicks, eindeutige Besucher, Bot-Klicks, eine Tagesreihe und Aufschlüsselungen für Referrer, Land, Browser, Gerät und jeden `utm_*`-Wert. Ein leerer UTM-Wert zählt als „Not set“. Land und Region werden nur gefüllt, wenn eine lokale GeoIP-Datenbank eingerichtet ist.

Übersicht ist die Zusammenfassung über alle Konten oder die eigenen Links, je nach Rolle, mit den letzten Links. Analysen sind dieselben Summen mit einer Linkauswahl und den Aufschlüsselungen. Standardbenutzer sehen Analysen für ihre eigenen Links. Administratorinnen und Administratoren können über jeden Link schauen.

## Was gezählt wird

Jede Weiterleitung schreibt einen Klick, nachdem die Antwort gesendet wurde. Ein erfolgreiches Freischalten mit Passwort ist ein Klick. Ein pausierter, unbekannter oder abgelaufener Link ist keiner.

Eindeutige Besucher sind verschiedene anonyme IDs im gewählten Zeitraum. Die ID ist ein täglicher HMAC einer gekürzten Adresse und des User-Agents. IPv4 behält die ersten drei Oktette. IPv6 behält ein kurzes Präfix. Die rohe Adresse wird nicht gespeichert. Die ID wechselt am nächsten UTC-Tag, deshalb ist eine Person, die morgen wiederkommt, ein neuer Besucher. Referrer werden nur als Hostnamen gespeichert.

Eine Anfrage ist ein Bot, wenn der User-Agent leer ist oder zu einem Crawler, Vorschau-Abruf oder Skriptclient wie `curl` passt. Bot-Klicks werden getrennt gezählt, und das Gerät wird als Bot gespeichert. Browsernamen sind Chrome, Edge, Firefox, Safari, Opera oder Other. Geräte sind desktop, mobile, tablet oder bot.

Land und Region bleiben leer, außer `GEOIP_DB_PATH` zeigt auf eine lokale MaxMind-Datenbank auf dem Server. Sharry ruft keinen GeoIP-Dienst auf.

## Zeitraum

`from` und `to` sind UTC-Kalendertage, und beide Enden zählen mit. `from=2026-10-20&to=2026-10-20` ist dieser eine Tag. Lass `to` weg, um bis zur aktuellen Zeit zu gehen. Ein Zeitraum länger als 400 Tage wird abgelehnt, damit die Tagesreihe keine Tage verliert, während die Summen sie noch zählen. Der Anfang muss vor dem Ende liegen.

## Aufbewahrung und Export

`analytics_retention_days` in den Einstellungen löscht ältere Klickereignisse beim Start und danach jede Stunde. Die Vorgabe ist 365. Nutze `0`, um sie zu behalten. Das Maximum sind 3650 Tage. Abgelaufene Passwort-Reset-Token und abgelaufene Sitzungen werden nach demselben Zeitplan gelöscht.

Administratorinnen und Administratoren können Links und Klicks aus den Einstellungen als CSV exportieren. Der Klickexport enthält jede UTM-Spalte plus Zeit, Slug, Referrer, Land, Browser, Betriebssystem, Gerät und ob der Klick ein Bot war.
