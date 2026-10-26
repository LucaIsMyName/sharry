# Analysen

Das Dashboard zeigt Klicks, eindeutige Besucher, Bot-Klicks, eine Tagesreihe und Aufschlüsselungen für Referrer, Land, Browser, Betriebssystem, Gerät und jeden `utm_*`-Wert. Analysen zeichnen außerdem einen Balken für Personen und Bot-Klicks neben der Bot-Summe. Ein leerer UTM-Wert zählt als „Not set“. Land und Region werden nur gefüllt, wenn eine lokale GeoIP-Datenbank eingerichtet ist.

Übersicht ist die Zusammenfassung der Links, die du sehen kannst, mit den letzten Links. Analysen sind dieselben Summen mit einer Linkauswahl und den Aufschlüsselungen. Standardbenutzer sehen Analysen für ihre eigenen Links und für alle anderen Links, die die Einstellungen öffnen. Administratorinnen und Administratoren können über jeden Link schauen.

## Was gezählt wird

Jede Weiterleitung schreibt einen Klick, nachdem die Antwort gesendet wurde. Ein erfolgreiches Freischalten mit Passwort ist ein Klick. Ein pausierter, unbekannter oder abgelaufener Link ist keiner.

Eindeutige Besucher sind verschiedene anonyme IDs im gewählten Zeitraum. Die ID ist ein täglicher HMAC einer gekürzten Adresse und des User-Agents. IPv4 behält die ersten drei Oktette. IPv6 behält ein kurzes Präfix. Die rohe Adresse wird nicht gespeichert. Die ID wechselt am nächsten UTC-Tag, deshalb ist eine Person, die morgen wiederkommt, ein neuer Besucher. Referrer werden nur als Hostnamen gespeichert.

Eine Anfrage ist ein Bot, wenn der User-Agent leer ist oder zu einem Crawler, Vorschau-Abruf oder Skriptclient wie `curl` passt. Bot-Klicks werden getrennt gezählt, und das Gerät wird als Bot gespeichert. Browsernamen sind Chrome, Edge, Firefox, Safari, Opera oder Other. Geräte sind desktop, mobile, tablet oder bot.

Land und Region bleiben leer, außer `GEOIP_DB_PATH` zeigt auf eine lokale MaxMind-Datenbank auf dem Server. Sharry ruft keinen GeoIP-Dienst auf.

## Filter

Die Leiste unter der Überschrift filtert die Karten, das Diagramm, die Aufschlüsselungen, die Zusammenfassung und die Zählungen in der Linktabelle. Sie ist da, ob die KI an ist oder nicht.

Links ist eine Mehrfachauswahl der Links, die du sehen kannst. Leer heißt jeder sichtbare Link. Mehrere Links passen, wenn einer davon stimmt. Ein Link behält den Namen dieses Links in der Überschrift. Eine Zeile in der Tabelle wählt genau diesen Link. Alle Links löscht nur die Linkauswahl.

Von und Bis sind Kalendertage. Der Schieberegler am Diagramm schreibt dieselben zwei Felder. Beide leer heißt etwa die letzten 30 Tage. Ein Zeitraum länger als 400 Tage zeigt einen Fehler und wird nicht gesendet.

Land, Browser, Betriebssystem und jedes UTM-Feld sind Mehrfachauswahlen. Ein leeres Feld wird nicht gefiltert. Mehrere Werte in einem Feld passen, wenn einer davon stimmt. Verschiedene Felder müssen alle passen. Ein leerer gespeicherter Wert ist „Nicht gesetzt“ und kann gewählt werden. Die Auswahl kommt aus den Klicks der gewählten Tage und Links und ignoriert die anderen Dimensionsfilter. Zurücksetzen entfernt jeden Filter.

## Eine kurze Zusammenfassung

Wenn die KI eingeschaltet ist, zeigt Analysen Zusammenfassen in einer eigenen Karte über dem Diagramm. Übersicht und das Diagramm an einem Link setzen Zeitraum und Zusammenfassen weiter zusammen. Der Zeitraum beginnt mit den letzten 30 Tagen. Der Schieberegler läuft vom ältesten Link, den du sehen kannst, oder von 400 Tagen zuvor, wenn dieser Tag unbekannt ist, bis heute. An einem Link beginnt der Regler an dem Tag, an dem dieser Link angelegt wurde. Ein Zeitraum länger als 400 Tage bittet dich, ihn enger zu fassen. Zusammenfassen schreibt zwei oder drei Sätze für diesen Zeitraum: die Summen, ob die spätere Hälfte gestiegen oder gefallen ist, und den stärksten Verweis, das Land oder den UTM-Wert. Zusammenfassen verwendet dieselben Filter wie die Karten, auch mehrere Links, für dieselben Tage wie das Diagramm. Die Sätze werden nicht gespeichert.

## Zeitraum

`from` und `to` sind UTC-Kalendertage, und beide Enden zählen mit. `from=2026-10-20&to=2026-10-20` ist dieser eine Tag. Lass `to` weg, um bis zur aktuellen Zeit zu gehen. Ein Zeitraum länger als 400 Tage wird abgelehnt, damit die Tagesreihe keine Tage verliert, während die Summen sie noch zählen. Der Anfang muss vor dem Ende liegen. Der Regler bewegt sich beim Ziehen und lädt das Diagramm neu, wenn du loslässt oder nach einer kurzen Pause.

## Aufbewahrung und Export

`analytics_retention_days` in den Einstellungen löscht ältere Klickereignisse beim Start und danach jede Stunde. Die Vorgabe ist 365. Nutze `0`, um sie zu behalten. Das Maximum sind 3650 Tage. Abgelaufene Passwort-Reset-Token und abgelaufene Sitzungen werden nach demselben Zeitplan gelöscht.

Administratorinnen und Administratoren können Links und Klicks aus den Einstellungen als CSV exportieren. Der Klickexport enthält jede UTM-Spalte plus Zeit, Slug, Referrer, Land, Browser, Betriebssystem, Gerät und ob der Klick ein Bot war.
