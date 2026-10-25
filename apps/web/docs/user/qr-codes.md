# QR codes

QR codes encode the short URL plus a `qr` id, so a destination change does not require a new code. A code can also carry a campaign variant. The preview and downloads follow the variant selected in the editor, including before you save. Saved codes are listed newest first, and choosing one loads that code’s center image.

The encoded address looks like `https://share.example.com/s/summer-sale?qr=<qr id>`. When a variant is selected it also includes `v=<variant id>`. A scan is counted on that code. A variant id or QR id that belongs to a different link is ignored, and the visit uses the link’s own UTM values.

## Editor

Open a link and use the QR code section under the link fields. The preview sits above those controls on a narrow screen and to their right on a wide one.

| Control | Choices |
| --- | --- |
| Name | Label in the saved-code list |
| Campaign variant | No variant, or a variant of this link |
| Modules | Square, Rounded, Dots, Rounded dots |
| Finder | Square, Rounded, Extra rounded, Dot |
| Foreground and background | Colors |
| Transparent background | PNG and SVG only |
| Center image scale | How much of the middle the logo covers |
| Error correction | L, M, Q, or H. H recovers about 30% of the code and is the right choice when a center image covers part of the pattern |
| Quiet zone | Empty margin around the code, in modules |

Scan warnings sit on the control they describe: foreground contrast, center image scale, error correction, quiet zone, and transparent background. They cover low contrast, a center image that is large, high error correction missing while a center image is shown, a quiet zone that is too small, and a transparent background that can fail on a dark surface.

## Downloads

Downloads are PNG, JPEG, and SVG. JPEG always uses a solid background. JPEG cannot store transparency, so a transparent design is flattened onto the JPEG background color.

Center images are stored on disk, not in PostgreSQL. Use a PNG, JPEG, or WebP file, 512 KB or smaller, and at most 1024 pixels on each side. On a server the directory is `QR_DATA_DIR` under `shared/data`, which each release links as `data`.

A downloaded image keeps the address that was encoded at the time. Redirects match the path, so a host that still reaches this process keeps working. Changing the public prefix or the domain does not rewrite a file you already downloaded. Enable legacy prefixes, or download a new code, when those addresses must keep resolving.
