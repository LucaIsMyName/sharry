# Campaigns

A campaign is a named group of variants. It does not change the destination and it is not an A/B test. The campaign list shows how many variants each campaign has.

## What a campaign is for

Use a campaign when the same short link should be measured with different UTM values. A printed poster, an email, and a QR code can each carry a variant. The slug and the destination stay on the link. Editing the destination later updates every variant, because the variant does not store its own destination.

You see your own campaigns. An administrator sees every campaign. Deleting a campaign deletes its variants. Deleting the short link deletes the variants that point at it.

## Variants

A variant belongs to one short link and can override that link’s UTM parameters. Blank fields keep the link’s values. Set only the keys that should differ, such as `utm_content=poster` while `utm_source` stays on the link.

The variant is used when the short link is opened with `?v=<variant id>`, or when a QR code is saved with that variant. A variant id from another link is ignored. The visit then uses the link’s own UTM values.

The tracked address looks like `https://share.example.com/s/summer-sale?v=<variant id>`.

Create the campaign first, then add variants on its page. When AI is on, one sentence such as “newsletter, Instagram, poster” drafts several variants with names and UTM values. Use copies one draft into the variant form. Add these variants stores the remaining drafts on the link chosen in that form. If the description is empty, the same reply fills it, and Save campaign stores that text. Each variant has a name, one link, and the UTM overrides. The variants are listed in a table with the name, short URL, UTM values, and icon buttons to edit, copy, or delete. The link editor can also attach a saved variant to a QR code. The QR preview uses that variant’s UTM values before you save the code.
