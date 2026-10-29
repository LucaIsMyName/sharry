# API-Schlüssel

Administratorinnen und Administratoren legen benannte Schlüssel unter API-Schlüssel an. API-Schlüssel anlegen steht an der Überschrift. Auf einem kleinen Bildschirm steht die Schaltfläche in der Leiste unter der oberen Leiste. Sie öffnet einen Dialog für den Namen und den Benutzer. Jeder Schlüssel gehört zu einem Benutzer und kann das, was dieser Benutzer kann: dessen Links, Kampagnen, QR-Codes und Analysen. Ein Schlüssel für eine Administratorin oder einen Administrator kann auch Admin-Routen aufrufen.

Das Geheimnis wird einmal gezeigt. Sein Präfix ist der Slug von `APP_NAME`: kleingeschrieben, Leerzeichen werden Bindestriche. Die Vorgabe `Sharry` nutzt `sharry_`. Sende es bei jeder Anfrage:

```http
Authorization: Bearer sharry_...
```

Sharry speichert nur einen Hash des Geheimnisses, mit `SESSION_SECRET`. Es kann nicht wieder angezeigt werden. Widerrufe den Schlüssel und lege einen neuen an, wenn er verloren geht. Das Widerrufen löscht die Links des Benutzers nicht.

## Was ein Schlüssel aufrufen kann

Aufrufe nutzen dieselben Pfade wie das Dashboard, zum Beispiel `GET /api/links` auf der Domain dieser Site. Die API-Referenz unter `/docs/api` listet jede Route, die Auth, die sie akzeptiert, und die Antworten.

Der Schlüssel eines Standardbenutzers sieht nur die Links, Kampagnen, QR-Codes und Analysen dieses Benutzers. Der Schlüssel einer Administratorin oder eines Administrators kann auch Admin-Routen aufrufen: Benutzer, Einstellungen, Audit, Exporte und andere Schlüssel.

Kontorouten unter `/api/auth`, einschließlich Anmeldung, Passwortwechsel und Zwei-Faktor-Authentifizierung, akzeptieren nur das Sitzungscookie. Ein Bearer-Token auf diesen Routen wird abgelehnt.

Ein widerrufener Schlüssel, ein Schlüssel für ein deaktiviertes Konto und ein Schlüssel für ein Konto, das noch das Passwort ändern muss, werden abgelehnt. Wenn die Einstellungen Zwei-Faktor-Authentifizierung verlangen, funktioniert ein Schlüssel erst, nachdem dieser Benutzer sie eingerichtet hat. Das Geheimnis bleibt gleich. Es wird abgelehnt, bis die Einrichtung fertig ist, und es sendet keinen Authenticator-Code. Einen Schlüssel für einen Benutzer anzulegen, der noch nicht eingerichtet ist, wird abgelehnt, solange diese Einstellung an ist.

Anfragen mit API-Schlüssel sind auf etwa 120 pro Minute und Schlüssel begrenzt. Anmeldung, Passwort zurücksetzen, die Zwei-Faktor-Abfrage und die Authenticator-Bestätigung sind jeweils auf 10 Versuche pro Minute begrenzt und akzeptieren keinen Schlüssel.

## Browser

Browserseiten von anderen Origins bleiben blockiert. Eine zustandsändernde Anfrage mit einem `Origin`-Header muss von `APP_URL` oder `SHORT_URL_BASE` kommen. Außerhalb der Produktion sind auch `localhost` und `127.0.0.1` erlaubt. Nutze den Schlüssel von deinem eigenen Server oder Skript, wo die Anfrage keinen Browser-Origin hat. `GET` und `HEAD` wenden diese Origin-Prüfung nicht an.
