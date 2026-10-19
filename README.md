# Converter — Tangerine

A 100% local, installable (PWA) file converter for phone and desktop.
Everything is converted **on the device** — files are never uploaded.

- **Images** (Canvas + heic2any): PNG/JPG/WebP out, HEIC in, resize / quality / rotate, image → PDF
- **Media** (FFmpeg.wasm, lazy-loaded from a pinned CDN on first media job): video → MP4 / WebM / GIF, extract audio → MP3 / WAV, audio → MP3 / WAV, trim
- **PDF** (pdf-lib + pdf.js): PDF → PNG per page, merge, split by page range, images → PDF
- **Data** (SheetJS): CSV / TSV / JSON / XLSX → CSV, TSV, JSON, XLSX, HTML table, Markdown, TXT
- **Text**: TXT / MD / HTML basic interconversion
- **Zip** (JSZip): zip all queued files, extract zip entries

Bilingual English / العربية with full RTL, dark (default) / light themes.

## Run locally

```bash
npm install
npm run dev      # development
npm run build    # production build into dist/
npm run preview  # serve the production build
npm run icons    # regenerate PWA icons
```

## Deploy free

Drag the `dist/` folder onto **Netlify Drop** (app.netlify.com/drop), or push
`dist/` to **GitHub Pages** / Cloudflare Pages. Then open the link on a phone
and choose "Add to Home Screen" — it installs and runs full-screen like a
native app, and works offline after the first visit.
