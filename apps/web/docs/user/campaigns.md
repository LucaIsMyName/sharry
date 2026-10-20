# Campaigns

A campaign is a named group of variants. It does not change the destination and it is not an A/B test.

A variant belongs to one short link and can override that link’s UTM parameters. Blank fields keep the link’s values. The variant is used when the short link is opened with `?v=<variant id>`, or when a QR code is saved with that variant. A variant id from another link is ignored.

The tracked address looks like `https://share.example.com/s/summer-sale?v=<variant id>`.
