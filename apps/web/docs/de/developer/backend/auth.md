# Auth

Dashboard-Anfragen senden das Cookie `sharry_session`. Das Cookie ist `HttpOnly`, `SameSite=Lax` und in Produktion `Secure`. `requireUser` in `apps/api/src/auth.ts` lädt diese Sitzung und lehnt Konten ab, die noch einen Passwortwechsel oder einen Zwei-Faktor-Schritt brauchen.

Die Sitzungszeile speichert einen Hash des Tokens, nicht den Token. Der Hash nutzt `SESSION_SECRET`.

## Sitzungs-Scope

Die Anmeldung erzeugt einen von vier Scopes. Die Dashboard-Loader erlauben nur `full`.

| Scope | Wann | Lebensdauer |
| --- | --- | --- |
| `password_change` | `mustChangePassword` ist gesetzt | 30 Minuten |
| `mfa_challenge` | Die Zwei-Faktor-Authentifizierung ist schon an | 5 Minuten |
| `mfa_enroll` | Die Einstellungen verlangen einen Code und dieses Konto ist noch nicht eingerichtet | 30 Minuten |
| `full` | Passwort akzeptiert und kein weiterer Schritt | `sessionTtlHours` aus den Einstellungen, Vorgabe 168 Stunden |

Eine Sitzung zum Passwortwechsel, die die Einrichtungsseite öffnet, geht zur Passwortseite, nicht zurück zur Anmeldung. Das Ersetzen der Sitzung löscht den vorherigen Token. Abmelden löscht die aktuelle Sitzung und leert das Cookie.

Passwörter werden mit Argon2id gehasht. Ein fehlender Benutzer führt trotzdem eine Dummy-Prüfung aus, damit die Antwortzeit nicht verrät, ob das Konto existiert.

## API-Schlüssel

Außerhalb von `/api/auth` darf eine Anfrage stattdessen `Authorization: Bearer` senden. `actorFromApiKey` in `apps/api/src/api-keys.ts` hasht das Geheimnis mit `SESSION_SECRET` und lädt den gebundenen Benutzer als volle Sitzung. Der Klartext wird nicht gespeichert. Widerrufene Schlüssel, inaktive Benutzer und Benutzer, die das Passwort ändern müssen, werden abgelehnt.

`requireAdmin` ist dieselbe Prüfung plus die Admin-Rolle. Abfragen für Links, Kampagnen, QR und Analysen nutzen weiter diesen Akteur, deshalb kann der Schlüssel eines Standardbenutzers keine Zeilen eines anderen Benutzers lesen.

Anfragen mit API-Schlüssel sind auf etwa 120 pro Minute und Schlüssel begrenzt. Kontorouten ignorieren Schlüssel und behalten ihre eigenen strengeren Limits. Anmeldung, Passwort zurücksetzen, die Zwei-Faktor-Abfrage und die Authenticator-Bestätigung sind jeweils auf 10 Versuche pro Minute begrenzt.

## Wiederherstellung und Zurücksetzen

Eine neue E-Mail zum Zurücksetzen ersetzt jeden ungenutzten Link für dieses Konto. Der Reset-Token läuft nach einer Stunde ab. Er wird in derselben Datenbanktransaktion als benutzt markiert wie der Passwortwechsel, damit eine wiederholte oder überlappende Anfrage kein zweites Passwort setzen kann.

Das Bestätigen einer Authenticator-Einrichtung gibt acht Wiederherstellungscodes zurück. Ein Wiederherstellungscode wird in einem Update als benutzt markiert, deshalb kann er nicht zweimal akzeptiert werden. Das Ersetzen des Satzes oder das Ausschalten der Zwei-Faktor-Authentifizierung löscht die vorherigen Codes. Das Authenticator-Geheimnis wird mit `ENCRYPTION_KEY` verschlüsselt, bevor es gespeichert wird.

Abgelaufene und benutzte Reset-Token werden beim Start und dann stündlich gelöscht, zusammen mit abgelaufenen Sitzungen.

Die Zwei-Faktor-Einrichtung wird abgelehnt, bis die Einstellungen einen gespeicherten Mailserver haben (`smtpSource` ist `app`). Der Umgebungs-Fallback reicht zum Einrichten nicht. Wenn `mfaRequired` an ist, kann ein Konto die Zwei-Faktor-Authentifizierung nicht ausschalten.
