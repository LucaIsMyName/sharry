# QR codes

QR codes encode the short URL plus a `qr` id, so a destination change does not require a new code. A code can also carry a campaign variant. The preview and downloads follow the variant selected in the editor, including before you save. Saved codes are listed newest first, and choosing one loads that code’s center image.

The editor supports square, rounded, dot, and extra-rounded modules, finder styles, colors, a transparent background, quiet zone, error correction, and a center image. The preview sits above those controls on a narrow screen and to their right on a wide one. Downloads are PNG, JPEG, and SVG. JPEG always uses a solid background. Scan warnings appear once, under the preview.

Center images are stored on disk, not in PostgreSQL. A downloaded image keeps the address that was encoded at the time. Redirects match the path, so a host that still reaches this process keeps working.
