# Static assets

Files here are served straight from Cloudflare's edge cache — no Worker CPU,
no API call, no auth. Vite fingerprints them at build time.

Drop in:

- **`logo.png`** — the SSSIHL logo. PNG with transparency, under ~100 KB.
  Optionally add `logo@2x.png` and reference it via `srcset` for high-DPI
  screens. Referenced by `src/client/components/AppLayout.tsx`.
- **`favicon.png`** — 32×32 or 48×48. Referenced by `index.html`.

This replaces the Apps Script `getLogoBase64()` call. That existed only
because a sandboxed Apps Script `<iframe>` cannot reference Drive files
directly; the constraint does not apply here.

For letterhead images in appointment emails, host the image and use an
absolute URL — several mail clients (Outlook among them) block inline
base64 images.
