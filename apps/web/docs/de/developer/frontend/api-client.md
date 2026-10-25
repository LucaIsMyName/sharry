# API-Client

`apps/web/src/api.ts` umschließt `fetch`. Es sendet das Sitzungscookie (`credentials: 'include'`), setzt `content-type` für JSON-Körper und wirft `ApiError` mit der Servernachricht und dem HTTP-Status.

Seiten rufen `api('/api/links')` und ähnliche Pfade auf. Sie senden keine API-Schlüssel. Externe Programme nutzen den Bearer-Token, der unter Benutzer, API-Schlüssel und in der API-Referenz beschrieben ist.

Eine Antwort, die nicht OK ist, liest das JSON-Feld `error`, wenn der Körper JSON ist, und wirft `ApiError`. Aufrufer fangen diesen Fehler und zeigen die Nachricht in einem Toast. Eine Nachricht, die zu einem Feld gehört, ist ein Tooltip neben diesem Feld. Netzwerkfehler werfen den zugrunde liegenden `fetch`-Fehler. Eine leere 204-Antwort gibt `undefined` zurück.

Der Client hängt kein `Authorization` an. Eine Dashboard-Anfrage, die einen Benutzer braucht, wird nur durch `sharry_session` authentifiziert. Deshalb können Kontorouten Bearer-Token ignorieren, ohne dass die Oberfläche ein zweites Geheimnis hat.

Gemeinsame Antworttypen, zum Beispiel `LinkSummary`, liegen neben `api()`, damit Seiten die Nutzlast nicht noch einmal deklarieren. Anfragekörper sind einfache Objekte, die durch `JSON.stringify` gehen. Datei-Uploads, zum Beispiel ein QR-Mittelbild oder ein Kontofoto, nutzen `FormData` und lassen den JSON-Content-Type weg, damit der Browser die Multipart-Grenze setzen kann.
