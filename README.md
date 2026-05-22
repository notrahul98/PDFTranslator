# PDF Translator v2.3

Browser-based tool for Indonesian government tax letters (PDF). Produces two downloadable PDFs: a cleaned original and an English translation.

**v2.3 fix:** OCR stuck at 14% — caused by mismatched Tesseract v7 + v5 files. Now uses matching **Tesseract v5.1.1 from CDN** for worker, core, and language data.

## Features

- Runs entirely in the browser — no backend, no API key
- Text PDFs: extracted instantly with pdf.js (offline)
- Scanned PDFs: OCR via Tesseract.js (language data cached after first download)
- Built-in dictionary for Indonesian tax/legal terms → English
- Olive green UI, two download buttons

## Deploy to GitHub Pages

1. Create a repo (e.g. `PDFTranslator`) on GitHub.
2. Upload **all files** in this folder to the repo root (not in a subfolder).
3. Go to **Settings → Pages → Build and deployment**.
4. Source: **Deploy from a branch** → branch `main` (or `master`) → folder `/ (root)`.
5. Save. Your site will be at `https://<username>.github.io/PDFTranslator/`.

## Files to upload

| File | Required |
|------|----------|
| `index.html` | Yes |
| `pdf.min.js` | Yes |
| `pdf.worker.min.js` | Yes |
| `jspdf.umd.min.js` | Yes |
| `README.md` | Optional |

| `tesseract.worker.min.js` | **Yes** — must be same folder as `index.html` (GitHub Pages blocks CDN workers) |

OCR **core** and **language** files load from CDN (internet required first time). The main `tesseract.min.js` loads from CDN in `index.html`.

**Do not upload** `auth.js` or `storage.js` if present — they are unrelated leftovers.

## Local test

Serve the folder with any static server, for example:

```bash
npx serve .
```

Then open `http://localhost:3000` (or the port shown).

## First OCR run

The first time you process a **scanned** PDF, the browser downloads ~10 MB of language data from `tessdata.projectnaptha.com`. After that it is cached. Text-based PDFs need no download.
