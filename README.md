<div align="center">

# PlayWithDoc

### Press **Ctrl + K**. Type what you want. Done.

**Every PDF, image and document tool — in one keystroke, in your browser, even offline.**
No sign‑up · No uploads · No limits · Free

[**Built by Tirth Babariya →**](https://github.com/Tirth-Babariya/)

<br />

<img src="docs/screenshots/home.png" alt="PlayWithDoc home screen in dark theme: a search box that types itself, quick links to popular tools, a drop zone for any file, and a ribbon of supported formats" width="900" />

<sub>Home screen · press <b>Ctrl + K</b> anywhere to jump to any tool</sub>

</div>

---

## The idea: never leave the page

Most converter sites make you hunt: open a new tab, Google *"jpg to pdf"*, dodge ads, find the right page, upload your file, wait, download, then start over for the next step.

**PlayWithDoc removes all of that.**

> Press **`Ctrl + K`** (or **`⌘ K`**, or **`Ctrl + S`**, or **`/`**) — from *any* page — and type what you want.
> `jpg to pdf` · `compress` · `sign` · `heic` · `merge` · `ocr` · `word to pdf`
> Hit **Enter**. You're in the tool. That's it.

No navbar hunting. No new tabs. No searching the web. You can jump **from anywhere to anywhere** — and when a conversion finishes, **send the result straight into the next tool** without downloading and re‑uploading:

```
Word ─▶ PDF ─▶ Compress ─▶ Sign ─▶ Protect ─▶ Download
                 (one click between each step)
```

Or don't even pick a tool — **drop any file on the home page** and PlayWithDoc shows every format it can become.

---

## Works offline — really

PlayWithDoc is **offline‑first**. The first time you open it, it saves itself to your device:

| | |
|---|---|
| ✅ **Every page & script** | Cached at install, so tools you've *never opened* still work with no connection |
| ✅ **Core engines** | PDF, Word, Excel, PowerPoint, qpdf (protect/unlock/repair) — all local |
| ✅ **Optional OCR + HEIC pack** | ~24 MB, 9 languages, downloaded only if you ask (from the **Offline ready** menu) |
| ✅ **Installable** | Add it to your desktop or phone home screen like a native app |
| ✅ **Quiet updates** | New versions install in the background and wait for you to press *Update* |

<div align="center">

<img src="docs/screenshots/offline-tool.png" alt="The Split PDF tool open while the browser is offline: the amber Offline pill in the navbar confirms it, and the green badge under the panel reads 0 uploads this visit" width="900" />

<sub>Airplane mode: the navbar shows an <b>Offline</b> pill, every tool still works — and the live badge reads <b>0 uploads</b></sub>

</div>

Get on a plane, lose Wi‑Fi, open a PDF on a train — it just works. *(This is tested: the automated suite turns the network off and runs merge, protect, Word→PDF, PDF→JPG, opens the sign editor, and runs OCR.)*

---

## Private by design — and provable

Your files **never leave your device**. Everything is processed by your browser.

- **Live proof:** every tool page shows a *"0 uploads this visit"* badge that counts any request the page's own code makes.
- **Enforced by the browser:** the site ships a strict `Content-Security-Policy` (`connect-src 'self'`), so even a bug or a tampered script cannot send data to another website.
- **Verify it yourself:** open DevTools → Network while converting. Nothing leaves.
- **Self‑hosted everything:** fonts and engines (pdf.js, pdf‑lib, qpdf, Tesseract…) are served from this site — no third‑party requests.
- **No accounts, no analytics, no ads, no cookies to track you.** The only thing stored is on *your* device (theme, recent tools, saved signatures).

---

## What you can do

**60+ tools**, all free, all local.

| | |
|---|---|
| **Organize** | Merge · Split · Remove pages · Extract pages · Organize (drag thumbnails, rotate, delete) · Scan to PDF (phone camera) |
| **Optimize** | Compress (lossless / balanced / smallest / **target size**) · Repair · **OCR PDF** (make scans searchable) |
| **To PDF** | JPG · PNG · WebP · HEIC · any image · **Word** · **Excel/CSV** · **PowerPoint** · HTML · Text |
| **From PDF** | JPG · PNG · **Word** · **PowerPoint** · Text · Markdown · **Scan → Text (OCR, 9 languages)** |
| **Edit** | **Edit PDF** (text, whiteout, highlight, draw, images) · Rotate · Crop · Page numbers · Watermark |
| **Security** | **Sign PDF** (draw / type / upload) · **Protect** (AES‑256) · **Unlock** · **Redact** (truly removes text) |
| **Images** | 21 image ⇄ image conversions (JPG, PNG, WebP, GIF, BMP, AVIF, HEIC, SVG) · Compress (**under 100 KB**) · Resize |
| **Data** | CSV ⇄ JSON · Excel → CSV / JSON |

### Little things that feel good

- 🖼️ **Real previews** of every file — images, PDF pages, HEIC, even text snippets
- ↔️ **Drag to reorder** — cards glide out of the way as you drag; **rotate** each image; **Sort A–Z**
- 🔍 **Click to zoom** any preview full‑screen (← → to browse, **R** to rotate)
- 🗜️ **Target‑size compression** — "make this under 100 KB" for strict upload forms
- 👀 **Before / after slider** and a **live size estimate** before you convert
- ✏️ **Rename before download** (click the file name) · **Save to folder**
- ⌨️ **Keyboard everywhere** — see the table below
- 🌗 **Light / dark / system** theme · fully responsive · installable

---

## Keyboard

| Keys | Does |
|---|---|
| **Ctrl/⌘ + K**, **Ctrl/⌘ + S**, **/** | Open search — go to any tool from anywhere |
| **Enter** | Open the highlighted tool |
| **Ctrl/⌘ + O** | Add files |
| **Ctrl/⌘ + Enter** | Convert · or download the result |
| **Ctrl/⌘ + V** | Paste a screenshot or file straight in |
| **Alt + ← / →** on a card | Reorder |
| **R** / **Del** on a card | Rotate / remove |
| **Ctrl/⌘ + Z** in the editor | Undo |

---

## Run it

```bash
npm install
npm run dev            # http://localhost:3000   (add  -- -H 0.0.0.0  to test on your phone)

npm run build          # builds the app AND generates the offline service worker
npm start              # serve the production build (service worker + CSP are production‑only)
```

Requires Node 20+. The service worker and security headers only run in **production** mode — use `npm run build && npm start` to try offline mode.

## Deploy to Vercel

1. Push this project to a GitHub repository.
2. In Vercel: **Add New → Project → Import** that repository. It's detected as **Next.js** automatically.
3. Leave the build settings alone — the default `npm run build` already builds the site **and** generates the offline service worker. No environment variables are required.
4. Once you have a custom domain, add an environment variable `NEXT_PUBLIC_SITE_URL` (for example `https://playwithdoc.com`) and redeploy, so the sitemap and social‑share images use your real address.

Everything is static, so it runs on Vercel's free tier with no server functions. After the first deploy, open the live URL and run one OCR job plus one conversion in airplane mode to confirm the offline pack works on your host.

## How it's built

- **Next.js (App Router) + TypeScript** — every tool has its own statically generated page (`/tools/jpg-to-pdf`, …) with SEO metadata, structured data and share images
- **Client‑side engines:** pdf‑lib · pdf.js · qpdf (WebAssembly) · Tesseract (WebAssembly) · mammoth · SheetJS · heic2any · JSZip
- **Offline‑first service worker** generated at build time (`scripts/build-sw.mjs`) — precaches the app shell, versioned caches, user‑controlled updates
- **Tool registry** in `lib/tools.ts` — add a tool with one `def({...})` entry plus an engine function in `lib/engines/`

## Honest limits

- **Word ⇄ PDF and PowerPoint ⇄ PDF** keep text, headings, lists, tables and images but simplify complex layouts and fonts (PowerPoint output is validated by round‑trip tests; open it in PowerPoint to confirm it looks right for your deck)
- **Compress (balanced/smallest)** turns pages into images to get big savings, so text isn't selectable afterwards — *Lossless* keeps it
- **OCR** quality depends on the scan; always proofread. The searchable‑PDF layer supports Latin‑script languages
- **Very large files** are limited by your device's memory

## On the roadmap

Fillable PDF forms · Compare two PDFs · PDF ⇄ Excel · PDF/A · background‑thread processing for huge files

---

<div align="center">

**Built by [Tirth Babariya](https://github.com/Tirth-Babariya/)**

*Press **Ctrl + K** and play.*

</div>
