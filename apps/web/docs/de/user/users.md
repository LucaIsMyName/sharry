# Benutzer

Benutzer steht Administratorinnen und Administratoren zur Verfügung. Die Registrierung ist geschlossen, deshalb wird jedes Konto hier angelegt.

## Ein Konto anlegen

Benutzer anlegen steht in einer Zeile mit der Überschrift Benutzer. Auf einem kleinen Bildschirm steht der Knopf in der Leiste unter der oberen Leiste. Er öffnet einen Dialog. Gib einen Benutzernamen, eine E-Mail, ein vorläufiges Passwort und eine Rolle ein. Benutzername und E-Mail müssen unabhängig von der Großschreibung eindeutig sein. Ein vergebener Wert antwortet: "That username or email is already in use."

Das vorläufige Passwort muss mindestens 12 Zeichen haben. Passwort erzeugen füllt ein 16-stelliges Passwort und zeigt es, damit du es kopieren und der Person schicken kannst. Ihre erste Anmeldung verlangt ein neues Passwort, bevor das Dashboard aufgeht. Das vorläufige Passwort wird als Argon2id-Hash gespeichert.

Die Rolle ist `user` oder `admin`. Ein Standardbenutzer verwaltet nur die eigenen Links, Kampagnen und Analysen, außer die Einstellungen teilen die Links anderer Personen. Eine Administratorin oder ein Administrator verwaltet jedes Konto und jeden Link, plus Einstellungen, Domains, Server, API-Schlüssel und Audit.

## Ein Konto ändern

Die Liste zeigt Benutzername, E-Mail, Rolle und ob das Konto aktiv ist. „password change“ bedeutet, dass die nächste Anmeldung ein neues Passwort setzen muss.

Das Rollenmenü speichert sofort. Passwort setzen öffnet einen Dialog, beendet die aktuelle Anmeldung dieser Person und verlangt bei der nächsten Anmeldung ein neues Passwort. Du kannst dieses vorläufige Passwort im Dialog erzeugen und kopieren.

Deaktivieren behält das Konto und seine Daten, blockiert aber die Anmeldung. API-Schlüssel eines deaktivierten Kontos werden abgelehnt. Aktivieren stellt die Anmeldung wieder her. Du kannst dein eigenes Konto nicht deaktivieren. Du kannst auch nicht die letzte aktive Administratorin oder den letzten aktiven Administrator deaktivieren.

Löschen entfernt das Konto und die Links, Kampagnen, QR-Codes und API-Schlüssel, die dazu gehören. Mittelbilder und das Kontofoto werden von der Festplatte gelöscht. Du kannst dein eigenes Konto nicht löschen und auch nicht die letzte aktive Administratorin oder den letzten aktiven Administrator. Die Klickhistorie der Links dieser Person verschwindet mit den Links.

## Audit

Audit listet Ereignisse mit dem neuesten zuerst: wann, welcher Benutzer, der Aktionsname und der Entitätstyp. Die Tabelle scrollt auf einem schmalen Bildschirm seitlich. Frühere Ereignisse eines gelöschten Benutzers bleiben, mit leerem Benutzernamen, wenn das Konto weg ist.

Aktionen, die du siehst, sind unter anderem:

| Aktion | Wann sie geschrieben wird |
| --- | --- |
| `auth.login` | Ein Passwort wird akzeptiert |
| `auth.password_changed` | Die angemeldete Person ändert ihr Passwort |
| `auth.password_reset` | Ein Reset-Link setzt ein neues Passwort |
| `auth.mfa_enabled` | Die Zwei-Faktor-Authentifizierung wird eingeschaltet |
| `auth.mfa_disabled` | Die Zwei-Faktor-Authentifizierung wird ausgeschaltet |
| `user.created` | Eine Administratorin oder ein Administrator legt ein Konto an |
| `user.updated` | Rolle, Aktiv-Flag oder vorläufiges Passwort ändern sich |
| `user.deleted` | Ein Konto wird gelöscht |
| `admin.provisioned` | Die erste Administratorin oder der erste Administrator wird beim Start angelegt |
| `admin.created` | `npm run create-admin` fügt eine Administratorin oder einen Administrator hinzu |
| `link.created` | Ein Link wird angelegt |
| `link.destination_changed` | Ein Ziel wird bearbeitet |
| `link.slug_changed` | Ein Slug wird bearbeitet |
| `link.deleted` | Ein Link wird gelöscht |
| `campaign.created` | Eine Kampagne wird angelegt |
| `campaign.deleted` | Eine Kampagne wird gelöscht |
| `qr.created` | Ein QR-Code wird gespeichert |
| `page.created` | Eine Landingpage wird erstellt |
| `page.published` | Eine Landingpage wird veröffentlicht |
| `page.hidden` | Eine Landingpage wird vor Besuchern verborgen |
| `page.duplicated` | Eine Landingpage wird dupliziert |
| `page.deleted` | Eine Landingpage wird gelöscht |
| `api_key.create` | Ein API-Schlüssel wird angelegt |
| `api_key.revoke` | Ein API-Schlüssel wird widerrufen |
| `settings.prefix_changed` | Das öffentliche Präfix ändert sich |
| `settings.page_prefix_changed` | Das Präfix der Landingpages ändert sich |
| `settings.mfa_required` | Die Zwei-Faktor-Pflicht ändert sich |
| `settings.link_sharing` | Wer die Links einer anderen Person sehen oder ändern kann, ändert sich |
| `settings.smtp_updated` | Der Mailserver wird gespeichert |
| `redirect_domain.created` | Eine Administratorin oder ein Administrator fügt eine Weiterleitungsdomain hinzu |
| `redirect_domain.verified` | Der TXT-Eintrag passt und die Domain wird verifiziert |
| `redirect_domain.deleted` | Eine Administratorin oder ein Administrator entfernt eine Weiterleitungsdomain |
| `redirect_domain.verification_lost` | Eine verifizierte Domain hat ihren TXT-Eintrag verloren. |
