# Users

Users is available to administrators. Registration is closed, so every account is created here.

## Create an account

Create user, under the Users heading, opens a dialog. Enter a username, an email, a temporary password, and a role. The username and email must be unique without regard to case. A taken value returns: "That username or email is already in use."

The temporary password must be at least 12 characters. Generate password fills a 16-character password and shows it so you can copy it and send it to the person. Their first sign-in asks for a new password before the dashboard opens. The temporary password is stored as an Argon2id hash.

The role is `user` or `admin`. A standard user manages only their own links, campaigns, and analytics, unless Settings shares other people's links. An administrator manages every account and every link, plus Settings, Domains, Server, API keys, and Audit.

## Change an account

The list shows the username, email, role, and whether the account is active. “password change” means the next sign-in must set a new password.

The role menu saves immediately. Set password opens a dialog, ends that person’s current sign-in, and requires a new password at the next sign-in. You can generate and copy that temporary password in the dialog.

Deactivate keeps the account and its data, but blocks sign-in. API keys for a deactivated account are rejected. Activate restores sign-in. You cannot deactivate your own account. You also cannot deactivate the last active administrator.

Delete removes the account and the links, campaigns, QR codes, and API keys that belong to it. Center images and the account photo are deleted from disk. You cannot delete your own account, and you cannot delete the last active administrator. Click history for that person’s links goes away with the links.

## Audit

Audit lists events newest first: when, which user, the action name, and the entity type. The table scrolls sideways on a narrow screen. A deleted user’s earlier events stay, with an empty user name when the account is gone.

Actions you will see include:

| Action | When it is written |
| --- | --- |
| `auth.login` | A password is accepted |
| `auth.password_changed` | The signed-in person changes their password |
| `auth.password_reset` | A reset link sets a new password |
| `auth.mfa_enabled` | Two-factor authentication is turned on |
| `auth.mfa_disabled` | Two-factor authentication is turned off |
| `user.created` | An administrator creates an account |
| `user.updated` | Role, active flag, or temporary password changes |
| `user.deleted` | An account is deleted |
| `admin.provisioned` | The first administrator is created at startup |
| `admin.created` | `npm run create-admin` adds an administrator |
| `link.created` | A link is created |
| `link.destination_changed` | A destination is edited |
| `link.slug_changed` | A slug is edited |
| `link.deleted` | A link is deleted |
| `campaign.created` | A campaign is created |
| `campaign.deleted` | A campaign is deleted |
| `qr.created` | A QR code is saved |
| `page.created` | A landing page is created |
| `page.published` | A landing page is published |
| `page.hidden` | A landing page is hidden from visitors |
| `page.duplicated` | A landing page is duplicated |
| `page.deleted` | A landing page is deleted |
| `api_key.create` | An API key is created |
| `api_key.revoke` | An API key is revoked |
| `settings.prefix_changed` | The public prefix changes |
| `settings.page_prefix_changed` | The landing page prefix changes |
| `settings.mfa_required` | The two-factor requirement changes |
| `settings.link_sharing` | Who can see or change another person's links changes |
| `settings.smtp_updated` | The mail server is saved |
| `redirect_domain.created` | An administrator adds a redirect domain |
| `redirect_domain.verified` | The TXT record matches and the domain becomes verified |
| `redirect_domain.deleted` | An administrator removes a redirect domain |
| `redirect_domain.verification_lost` | A verified domain lost its TXT record. |
