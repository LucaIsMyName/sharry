# Server

Server steht Administratorinnen und Administratoren zur Verfügung. Die Seite zeigt die Maschine, auf der dieser Sharry-Prozess läuft, damit du sehen kannst, ob Arbeitsspeicher, Festplatte oder die installierte Laufzeit Aufmerksamkeit brauchen, während die App in Benutzung ist.

Aktualisieren liest die Zahlen neu. Sie sind eine Momentaufnahme des Hosts zu diesem Zeitpunkt, keine Historie.

## Arbeitsspeicher

Gesamt, belegt und verfügbar sind die Werte des Hosts. Unter Linux enthält der verfügbare Speicher Cache, den das System zurückholen kann. Dieser Prozess ist der Speicher, den der Sharry-Node-Prozess selbst nutzt.

## Speicher

Belegter und verfügbarer Speicher sind die Festplatte, die das Anwendungsverzeichnis enthält. Unter diesen Summen listet Was diese Festplatte belegt das Betriebssystem, Node, den Anwendungscode, installierte Pakete, Mediendateien und diese Datenbank. Mediendateien sind die Mediathek, Kontofotos und ältere QR-Bilder. Die Zeile Betriebssystem ist alles andere auf dieser Festplatte, einschließlich Ubuntu und Dateien, die nicht zu Sharry gehören. Die Zeile Datenbank ist die PostgreSQL-Datenbank, mit der Sharry verbunden ist. Sie wächst mit Links, Klicks und gespeicherten Einstellungen und ist in der Festplattensumme schon enthalten, deshalb wird sie in der Betriebssystemzeile nicht noch einmal gezählt.

## Laufzeit

Betriebssystem, Plattform, Architektur und Hostname identifizieren den Host. Paket ist die installierte Sharry-Version. Node und PostgreSQL sind die Versionen, die dieser Prozess nutzt. CPU zeigt die Kernzahl und die Lastdurchschnitte von 1, 5 und 15 Minuten. Laufzeit ist, wie lange das Betriebssystem und dieser Prozess schon laufen.
