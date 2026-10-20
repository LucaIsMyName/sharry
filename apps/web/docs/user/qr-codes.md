# QR codes

QR codes encode the short URL plus a `qr` id, so a destination change does not require a new code. A code can also carry a campaign variant.

The editor supports square, rounded, dot, and extra-rounded modules, finder styles, colors, a transparent background, quiet zone, error correction, and a center image. Downloads are PNG, JPEG, and SVG. JPEG always uses a solid background.

Center images are stored on disk, not in PostgreSQL. A downloaded image keeps the address that was encoded at the time. Redirects match the path, so a host that still reaches this process keeps working.
