# Third-party software

PlayWithDoc's own code is released under the [MIT License](LICENSE). It runs on top of excellent open-source projects,
each of which keeps its own license. They are listed here with thanks.

| Project | Used for | License |
|---|---|---|
| [Next.js](https://nextjs.org) · [React](https://react.dev) | The application framework | MIT |
| [pdf-lib](https://pdf-lib.js.org) | Creating and editing PDFs (merge, split, sign, watermark…) | MIT |
| [PDF.js](https://mozilla.github.io/pdf.js/) (Mozilla) | Rendering PDF pages, reading text | Apache-2.0 |
| [QPDF](https://github.com/qpdf/qpdf) via [@neslinesli93/qpdf-wasm](https://github.com/neslinesli93/qpdf-wasm) | Encrypt, decrypt, repair, optimize PDFs (WebAssembly) | Apache-2.0 (QPDF) · ISC (wrapper) |
| [Tesseract OCR](https://github.com/tesseract-ocr/tesseract) via [tesseract.js](https://github.com/naptha/tesseract.js) | Text recognition (WebAssembly) | Apache-2.0 |
| [Tesseract language data](https://github.com/tesseract-ocr/tessdata_fast) | OCR language models (9 languages) | Apache-2.0 |
| [JSZip](https://stuk.github.io/jszip/) | ZIP files, DOCX/PPTX packaging | MIT (dual-licensed MIT or GPL-3.0; used under MIT) |
| [mammoth.js](https://github.com/mwilliamson/mammoth.js) | Reading Word (.docx) documents | BSD-2-Clause |
| [SheetJS Community Edition](https://sheetjs.com) (v0.18.5) | Reading Excel and CSV files | Apache-2.0 |
| [heic2any](https://github.com/alexcorvi/heic2any) | Decoding iPhone HEIC photos (bundles libheif) | MIT (libheif: LGPL-3.0) |
| [Geist](https://vercel.com/font) | Typeface | SIL Open Font License 1.1 |

The browser builds of these engines are self-hosted under `public/vendor/` so the site makes no third-party requests.
Each project's license text applies to its own files; consult the upstream repositories for the full terms.
