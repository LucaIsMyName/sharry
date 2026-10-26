# Einstellungen

Einstellungen stehen Administratorinnen und Administratoren zur Verfügung. Mail und Zwei-Faktor-Regeln werden hier gespeichert. Die öffentliche Site-Adresse, der Kurzlink-Ursprung, das Sitzungsgeheimnis und der Verschlüsselungsschlüssel bleiben in der Serverumgebung. `APP_URL` oder `SHORT_URL_BASE` ändern heißt, diese Umgebung zu bearbeiten und den Prozess neu zu starten. Die Einstellungen können sie nicht ändern.

Einstellungen speichern schreibt die Karten in einer Anfrage. Links exportieren und Klicks exportieren stehen außerhalb dieses Formulars. Sie laden CSV-Dateien aller Links und aller Klicks herunter. Die Klickdatei enthält jede `utm_*`-Spalte.

## Links

Das öffentliche Präfix ist das erste Segment jeder Kurz-URL, zum Beispiel `/s`. Es muss mit `/` beginnen, ein einzelnes Segment sein und nur Kleinbuchstaben, Ziffern und Bindestriche nutzen. Es darf kein Dashboard-Pfad wie `api`, `docs` oder `login` sein.

Eine Änderung des Präfixes verlangt eine Bestätigung. Gedruckte QR-Codes und gespeicherte Kurz-URLs behalten den alten Pfad. Schalte in diesem Dialog „Das vorherige Präfix weiterleiten“ ein oder lade neue Codes herunter. „Vorherige Präfixe weiter funktionieren lassen“ bleibt an, damit diese alten Pfade weiter aufgelöst werden. Die Seite listet die alten Präfixe, die noch akzeptiert werden.

Die Standardweiterleitung ist der Typ, der gilt, wenn jemand einen Link anlegt und keinen anderen wählt. Die Möglichkeiten sind 301, 302, 307 und 308. Eine neue Installation nutzt 302.

Die Länge zufälliger Slugs gilt, wenn ein neuer Link den Slug leer lässt. Es ist eine ganze Zahl von 4 bis 16. Die Vorgabe ist 5.

Vier Schalter entscheiden, ob ein Benutzer einen Link sehen oder ändern kann, der jemand anderem gehört. Sie gelten für die Rolle Benutzer. Eine Administratorin oder ein Administrator sieht und bearbeitet immer jeden Link. Ein API-Schlüssel folgt dem Benutzer, zu dem er gehört. Die Vorgabe lässt die Links jeder Person privat.

„Benutzer sehen die Links der anderen“ ist standardmäßig aus. Solange es aus ist, haben die anderen drei Schalter keine Wirkung.

„Benutzer können die Links der anderen bearbeiten“ ist standardmäßig aus. Ein geteilter Link kann dann geöffnet werden, einschließlich seiner Klicks und eines QR-Downloads, aber nicht geändert werden. Einschalten erlaubt Änderungen, einschließlich Löschen, Passwort, UTM und QR-Aktualisierungen. Der Schalter bleibt deaktiviert, bis „Benutzer sehen die Links der anderen“ an ist. Ein verborgener Link wird nicht gefunden. Ein sichtbarer Link, den der Benutzer nicht ändern darf, lehnt die Änderung ab.

„Benutzer sehen Admin-Links“ ist standardmäßig aus. Benutzer sehen diese Links nur, wenn dieser Schalter und „Benutzer sehen die Links der anderen“ beide an sind.

„Benutzer können Admin-Links ändern“ ist standardmäßig aus. Einschalten schaltet auch „Benutzer sehen Admin-Links“ ein. Ausschalten von „Benutzer sehen Admin-Links“ schaltet diesen Schalter aus.

Kampagnen bleiben privat. Ein Benutzer kann einen Link, den er ansehen darf, an die eigene Kampagne hängen.

## Sitzungen

Analysen aufbewahren, Tage, löscht Klickereignisse, die älter als diese Anzahl Tage sind. Die Bereinigung läuft beim Prozessstart und danach jede Stunde. Nutze `0`, um Ereignisse zu behalten. Das Maximum ist 3650. Die Vorgabe ist 365.

Sitzungsdauer, Stunden, ist, wie lange eine abgeschlossene Anmeldung gültig bleibt. Die Vorgabe sind 168 Stunden (7 Tage). Das Minimum ist 1 Stunde und das Maximum 2160 Stunden (90 Tage). Eine Sitzung, die noch einen Passwortwechsel, eine Einrichtung oder einen Authenticator-Code braucht, nutzt eine kürzere Lebensdauer, beschrieben unter Auth.

Die Registrierung ist geschlossen. Administratorinnen und Administratoren legen jedes Konto an. Es gibt keinen Schalter, um sie zu öffnen.

Einen Zwei-Faktor-Code für jedes Konto verlangen schickt Personen, die noch nicht eingerichtet sind, nach dem Passwort auf die Einrichtungsseite. Der Schalter bleibt deaktiviert, bis in der Karte E-Mail ein Mailserver gespeichert ist. Wenn die Pflicht aus ist, kann jede Person einen Code unter Konto einschalten. Wenn sie an ist, kann sie ihn nicht ausschalten.

## E-Mail

Das Zurücksetzen des Passworts nutzt diesen Mailserver, sobald ein Host und eine Absenderadresse gespeichert sind. Das Passwort wird in der Datenbank verschlüsselt und nicht wieder angezeigt. Lass das Passwortfeld leer, um das gespeicherte zu behalten.

Solange hier kein Host und keine Absenderadresse gespeichert sind, fällt Sharry auf `SMTP_HOST` und `EMAIL_FROM` in der Serverumgebung zurück, wenn diese gesetzt sind. Wenn an keiner der beiden Stellen Host und Absenderadresse stehen, bleibt die Reset-E-Mail aus, und die Zwei-Faktor-Authentifizierung lässt sich nicht einschalten.

Die Statuszeile unter den Feldern sagt, welcher der drei Zustände aktiv ist: hier gespeichert, noch die Serverumgebung, oder aus.

## KI

Die Karte KI stellt die Assistenz für jede angemeldete Person ein. Wähle einen Anbieter: OpenAI, Anthropic, Google Gemini, Mistral oder einen OpenAI-kompatiblen Endpunkt. Die Modellliste folgt dem Anbieter. Eigenes Modell nimmt eine ID auf, die die Liste nicht zeigt. Ein OpenAI-kompatibler Anbieter braucht zusätzlich eine Basis-URL, zum Beispiel `https://example.com/v1`. Der Server sendet den API-Schlüssel an diese URL.

Der API-Schlüssel wird mit demselben Schlüssel verschlüsselt wie das SMTP-Passwort. Er ist keine Umgebungsvariable, und die Einstellungen zeigen ihn nicht wieder an. Lass das Feld leer, um den gespeicherten Schlüssel zu behalten. Gespeicherten Schlüssel löschen entfernt ihn beim nächsten Speichern. Die KI ist nur verfügbar, wenn ein Anbieter, ein Modell und ein Schlüssel gespeichert sind, plus eine Basis-URL beim kompatiblen Anbieter.

Verbindung prüfen kontrolliert Anbieter, Modell und Schlüssel im Formular, auch einen Schlüssel, den du noch nicht gespeichert hast. Das fragt den Anbieter nach einer kurzen Antwort und speichert weder einen Chat noch den Schlüssel. Speichere die Einstellungen, damit der Chat unter `/chat` sie nutzt. Alte Chats bleiben lesbar, wenn der Anbieter geleert wird. Neue Antworten pausieren, bis wieder Anbieter, Modell und Schlüssel gespeichert sind.
