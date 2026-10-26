# Kampagnen

Eine Kampagne ist eine benannte Gruppe von Varianten. Sie ändert das Ziel nicht und ist kein A/B-Test. Die Kampagnenliste zeigt, wie viele Varianten jede Kampagne hat.

## Wofür eine Kampagne da ist

Nutze eine Kampagne, wenn derselbe Kurzlink mit unterschiedlichen UTM-Werten gemessen werden soll. Ein gedrucktes Plakat, eine E-Mail und ein QR-Code können jeweils eine Variante tragen. Slug und Ziel bleiben am Link. Eine spätere Änderung des Ziels aktualisiert jede Variante, weil die Variante kein eigenes Ziel speichert.

Du siehst deine eigenen Kampagnen. Eine Administratorin oder ein Administrator sieht jede Kampagne. Das Löschen einer Kampagne löscht ihre Varianten. Das Löschen des Kurzlinks löscht die Varianten, die auf ihn zeigen.

## Varianten

Eine Variante gehört zu einem Kurzlink und kann dessen UTM-Parameter überschreiben. Leere Felder behalten die Werte des Links. Setze nur die Schlüssel, die abweichen sollen, zum Beispiel `utm_content=poster`, während `utm_source` am Link bleibt.

Die Variante gilt, wenn der Kurzlink mit `?v=<variant id>` geöffnet wird oder ein QR-Code mit dieser Variante gespeichert ist. Eine Varianten-ID von einem anderen Link wird ignoriert. Der Besuch nutzt dann die eigenen UTM-Werte des Links.

Die verfolgte Adresse sieht so aus: `https://share.example.com/s/summer-sale?v=<variant id>`.

Lege zuerst die Kampagne an und füge dann auf ihrer Seite Varianten hinzu. Jede Variante hat einen Namen, einen Link und die UTM-Überschreibungen. Die Varianten stehen in einer Tabelle mit Name, Kurz-URL, UTM-Werten und Symbolschaltflächen zum Bearbeiten, Kopieren oder Löschen. Der Link-Editor kann eine gespeicherte Variante auch an einen QR-Code hängen. Die QR-Vorschau nutzt die UTM-Werte dieser Variante, bevor du den Code speicherst.
