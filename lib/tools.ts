import { UserError } from "./engines/common";
import { FORMATS, IMAGE_FMTS, type Fmt } from "./formats";
import { PRESETS } from "./presets";
import type { Category, OptionSpec, Runner, Tool } from "./types";

export const CATEGORIES: { id: Category; label: string; blurb: string }[] = [
  { id: "organize", label: "Organize", blurb: "Merge, split, reorder and clean up pages." },
  { id: "optimize", label: "Optimize", blurb: "Shrink and repair your PDFs." },
  { id: "to-pdf", label: "Convert to PDF", blurb: "Images, Word, Excel, HTML and text to PDF." },
  { id: "from-pdf", label: "Convert from PDF", blurb: "PDF to images, Word, text and Markdown." },
  { id: "edit", label: "Edit", blurb: "Type, draw, rotate, crop, number and watermark." },
  { id: "security", label: "Security", blurb: "Sign, protect, unlock and redact." },
  { id: "image", label: "Images", blurb: "Convert, compress and resize any image." },
  { id: "markdown", label: "Markdown", blurb: "Markdown ⇄ PDF, Word and HTML." },
  { id: "utility", label: "QR & properties", blurb: "Make and read QR codes, check and clean document properties." },
  { id: "data", label: "Data", blurb: "Spreadsheets and structured data." },
];

const accept = (f: Fmt[]) => f.map((x) => (x === "jpg" ? ".jpg,.jpeg" : x === "heic" ? ".heic,.heif" : x === "html" ? ".html,.htm" : x === "md" ? ".md,.markdown" : x === "xlsx" ? ".xlsx,.xls,.xlsm" : x === "txt" ? ".txt,.text,.log" : `.${x}`)).join(",");

type Def = Omit<Tool, "accept" | "load" | "to"> & { to: Fmt | Fmt[]; run: () => Promise<Runner> };
const def = (d: Def): Tool => ({ ...d, to: Array.isArray(d.to) ? d.to : [d.to], accept: accept(d.from), load: d.run });

const pageSizeOpt: OptionSpec = { key: "size", label: "Page size", type: "select", default: "a4", options: [{ value: "a4", label: "A4" }, { value: "letter", label: "US Letter" }] };
const docMargin: OptionSpec = { key: "margin", label: "Margins", type: "select", default: "56", options: [{ value: "36", label: "Narrow" }, { value: "56", label: "Normal" }, { value: "80", label: "Wide" }] };

const imgToPdfOpts: OptionSpec[] = [
  { key: "size", label: "Page size", type: "select", default: "a4", options: [{ value: "a4", label: "A4" }, { value: "letter", label: "US Letter" }, { value: "fit", label: "Fit to image" }] },
  { key: "orient", label: "Orientation", type: "select", default: "auto", showWhen: (o) => o.size !== "fit", options: [{ value: "auto", label: "Auto" }, { value: "portrait", label: "Portrait" }, { value: "landscape", label: "Landscape" }] },
  { key: "margin", label: "Margin", type: "select", default: "small", options: [{ value: "none", label: "None" }, { value: "small", label: "Small" }, { value: "medium", label: "Medium" }] },
];

const imgRun = (): Promise<Runner> => import("./engines/image").then((m) => m.imagesToPdf);
const pdfRun = <K extends keyof typeof import("./engines/pdf")>(k: K) => (): Promise<Runner> => import("./engines/pdf").then((m) => m[k] as unknown as Runner);

const PHOTO_FROM: Fmt[] = ["jpg", "png", "webp", "heic", "avif", "bmp", "gif"];

const core: Tool[] = [
  /* ── Organize ── */
  def({ slug: "merge-pdf", name: "Merge PDF", cat: "organize", from: ["pdf"], to: "pdf", multi: true, sort: true, featured: true,
    short: "Combine PDFs in the order you want.", desc: "Merge several PDF files into one document. Drag to set the order — everything happens on your device.",
    keywords: ["combine", "join", "concat", "append", "unite"], run: pdfRun("mergePdf") }),
  def({ slug: "split-pdf", name: "Split PDF", cat: "organize", from: ["pdf"], to: "pdf", multi: false, featured: true,
    short: "Split by range, every page, or every N pages.", desc: "Split a PDF into separate files by page range, single pages or fixed-size chunks.",
    keywords: ["separate", "divide", "cut", "burst", "break"],
    options: [
      { key: "mode", label: "Split mode", type: "select", default: "each", options: [{ value: "each", label: "Every page" }, { value: "ranges", label: "Custom ranges" }, { value: "chunks", label: "Every N pages" }] },
      { key: "ranges", label: "Ranges", type: "text", placeholder: "1-3, 4-6, 9", help: "Each comma-separated range becomes its own file.", showWhen: (o) => o.mode === "ranges" },
      { key: "size", label: "Pages per file", type: "number", min: 1, default: 2, showWhen: (o) => o.mode === "chunks" },
    ], run: pdfRun("splitPdf") }),
  def({ slug: "remove-pages", name: "Remove pages", cat: "organize", from: ["pdf"], to: "pdf", multi: false, pages: "remove",
    short: "Click the pages you don't want.", desc: "Delete unwanted pages from a PDF. Click a page to mark it for removal, then download.",
    keywords: ["delete pages", "drop pages", "trim"], run: pdfRun("arrangePdf") }),
  def({ slug: "extract-pages", name: "Extract pages", cat: "organize", from: ["pdf"], to: "pdf", multi: false, pages: "extract",
    short: "Pick pages to keep in a new PDF.", desc: "Select exactly the pages you need and save them as a new PDF.",
    keywords: ["select pages", "pull pages", "keep pages"], run: pdfRun("arrangePdf") }),
  def({ slug: "organize-pdf", name: "Organize PDF", cat: "organize", from: ["pdf"], to: "pdf", multi: false, pages: "organize",
    short: "Reorder, rotate and delete pages visually.", desc: "See every page as a thumbnail. Drag to reorder, rotate or delete, then save.",
    keywords: ["reorder", "rearrange", "sort pages", "arrange"], run: pdfRun("arrangePdf") }),
  def({ slug: "scan-to-pdf", name: "Scan to PDF", cat: "organize", from: ["jpg", "png"], to: "pdf", multi: true, sort: true, camera: true,
    short: "Snap document photos straight into a PDF.", desc: "Use your phone camera (or pick photos) and turn them into a clean multi-page PDF.",
    keywords: ["camera", "scanner", "photo", "document scan"], options: imgToPdfOpts, run: imgRun }),

  /* ── Optimize ── */
  def({ slug: "compress-pdf", name: "Compress PDF", cat: "optimize", from: ["pdf"], to: "pdf", multi: true, featured: true,
    short: "Make PDFs dramatically smaller.", desc: "Reduce PDF file size right in your browser. Choose lossless, balanced or maximum compression.",
    keywords: ["reduce", "shrink", "smaller", "optimize", "size", "email"],
    options: [{ key: "level", label: "Compression", type: "select", default: "balanced", options: [
      { value: "lossless", label: "Lossless", hint: "Keeps text selectable, small savings" },
      { value: "balanced", label: "Balanced", hint: "Best mix of size and quality" },
      { value: "small", label: "Smallest", hint: "Maximum reduction" },
    ] },
    { key: "target", label: "Target size", type: "select", default: "0", showWhen: (o) => o.level !== "lossless", help: "Keeps shrinking until it fits — or tells you the smallest it can get.",
      options: [{ value: "0", label: "No target" }, { value: "200", label: "Under 200 KB" }, { value: "500", label: "Under 500 KB" }, { value: "1024", label: "Under 1 MB" }, { value: "2048", label: "Under 2 MB" }, { value: "5120", label: "Under 5 MB" }] }], run: pdfRun("compressPdf") }),
  def({ slug: "repair-pdf", name: "Repair PDF", cat: "optimize", from: ["pdf"], to: "pdf", multi: true,
    short: "Recover PDFs that won't open.", desc: "Rebuild a damaged PDF's structure and recover what's readable.",
    keywords: ["fix", "corrupt", "broken", "recover", "damaged"], run: pdfRun("repairPdf") }),

  /* ── To PDF ── */
  def({ slug: "jpg-to-pdf", name: "JPG to PDF", cat: "to-pdf", from: ["jpg"], to: "pdf", multi: true, sort: true, featured: true,
    short: "Turn photos into a PDF, in any order.", desc: "Convert JPG images to PDF. Combine many photos into one document, reorder them, and pick page size.",
    keywords: ["jpeg", "photo", "picture", "image to pdf"], options: imgToPdfOpts, run: imgRun }),
  def({ slug: "png-to-pdf", name: "PNG to PDF", cat: "to-pdf", from: ["png"], to: "pdf", multi: true, sort: true,
    short: "Turn PNG images into a PDF.", desc: "Convert PNG images to a single PDF, with transparency handled cleanly.",
    keywords: ["screenshot", "image to pdf"], options: imgToPdfOpts, run: imgRun }),
  def({ slug: "webp-to-pdf", name: "WEBP to PDF", cat: "to-pdf", from: ["webp"], to: "pdf", multi: true, sort: true,
    short: "Turn WebP images into a PDF.", desc: "Convert WebP images to PDF.", keywords: ["image to pdf"], options: imgToPdfOpts, run: imgRun }),
  def({ slug: "heic-to-pdf", name: "HEIC to PDF", cat: "to-pdf", from: ["heic"], to: "pdf", multi: true, sort: true,
    short: "iPhone photos to PDF.", desc: "Convert iPhone HEIC photos to PDF without uploading anything.", keywords: ["iphone", "apple", "heif"], options: imgToPdfOpts, run: imgRun }),
  def({ slug: "image-to-pdf", name: "Image to PDF", cat: "to-pdf", from: ["jpg", "png", "webp", "gif", "bmp", "avif", "heic", "svg"], to: "pdf", multi: true, sort: true,
    short: "Any image format to PDF.", desc: "Mix JPG, PNG, WebP, HEIC, GIF, BMP, AVIF or SVG and combine them into one PDF.",
    keywords: ["photo", "picture", "any image", "jpeg"], options: imgToPdfOpts, run: imgRun }),
  def({ slug: "word-to-pdf", name: "Word to PDF", cat: "to-pdf", from: ["docx"], to: "pdf", multi: true, featured: true,
    short: "DOCX to PDF, no Office needed.", desc: "Convert Word documents to PDF in your browser. Headings, lists, tables and images are preserved.",
    keywords: ["doc", "docx", "microsoft word", "office"], options: [pageSizeOpt, docMargin], run: () => import("./engines/docs").then((m) => m.wordToPdf) }),
  def({ slug: "excel-to-pdf", name: "Excel to PDF", cat: "to-pdf", from: ["xlsx", "csv"], to: "pdf", multi: true,
    short: "Spreadsheets to printable PDFs.", desc: "Turn XLSX, XLS or CSV files into clean, paginated PDF tables.",
    keywords: ["xls", "xlsx", "spreadsheet", "csv", "sheet"], options: [pageSizeOpt, { key: "orient", label: "Orientation", type: "select", default: "auto", options: [{ value: "auto", label: "Auto" }, { value: "portrait", label: "Portrait" }, { value: "landscape", label: "Landscape" }] }],
    run: () => import("./engines/docs").then((m) => m.excelToPdf) }),
  def({ slug: "html-to-pdf", name: "HTML to PDF", cat: "to-pdf", from: ["html"], to: "pdf", multi: true,
    short: "HTML files to PDF.", desc: "Convert local HTML files into PDF documents.", keywords: ["web", "page", "htm"], options: [pageSizeOpt, docMargin],
    run: () => import("./engines/docs").then((m) => m.htmlFileToPdf) }),
  def({ slug: "txt-to-pdf", name: "Text to PDF", cat: "to-pdf", from: ["txt"], to: "pdf", multi: true,
    short: "Plain text to a tidy PDF.", desc: "Convert TXT files into PDF with your choice of typeface.", keywords: ["txt", "plain text", "notes", "log"],
    options: [pageSizeOpt, { key: "font", label: "Typeface", type: "select", default: "mono", options: [{ value: "mono", label: "Monospace" }, { value: "sans", label: "Sans" }, { value: "serif", label: "Serif" }] }, { key: "fontSize", label: "Font size", type: "number", min: 6, max: 24, default: 10.5, suffix: "pt" }],
    run: () => import("./engines/docs").then((m) => m.textToPdf) }),

  /* ── From PDF ── */
  ...(["jpg", "png"] as const).map((t) => def({
    slug: `pdf-to-${t}`, name: `PDF to ${t.toUpperCase()}`, cat: "from-pdf", from: ["pdf"], to: t, multi: false, featured: t === "jpg",
    short: `Export every page as a ${t.toUpperCase()}.`, desc: `Convert each PDF page into a high-quality ${t.toUpperCase()} image.`,
    keywords: ["image", "picture", "export", "pages to images", t === "jpg" ? "jpeg" : "screenshot"],
    options: [
      { key: "dpi", label: "Quality", type: "select", default: "150", options: [{ value: "96", label: "Screen (96 dpi)" }, { value: "150", label: "Standard (150 dpi)" }, { value: "200", label: "High (200 dpi)" }, { value: "300", label: "Print (300 dpi)" }] },
      { key: "pages", label: "Pages", type: "text", placeholder: "All pages — or e.g. 1-3, 7" },
    ],
    run: async () => (f, c) => import("./engines/render").then((m) => m.pdfToImages(f, c, t)),
  })),
  def({ slug: "pdf-to-word", name: "PDF to Word", cat: "from-pdf", from: ["pdf"], to: "docx", multi: true, featured: true,
    short: "Editable DOCX from any text PDF.", desc: "Convert PDFs into editable Word documents. Text and headings are kept; runs entirely on your device.",
    keywords: ["doc", "docx", "microsoft word", "editable", "office"], run: () => import("./engines/render").then((m) => m.pdfToWord) }),
  def({ slug: "pdf-to-text", name: "PDF to Text", cat: "from-pdf", from: ["pdf"], to: "txt", multi: true,
    short: "Pull all the text out of a PDF.", desc: "Extract the text layer of any PDF into a plain .txt file.", keywords: ["extract text", "copy text", "txt"], run: () => import("./engines/render").then((m) => m.pdfToText) }),
  def({ slug: "pdf-to-markdown", name: "PDF to Markdown", cat: "from-pdf", from: ["pdf"], to: "md", multi: true,
    short: "Headings and lists, ready for docs & LLMs.", desc: "Convert a PDF to Markdown with headings and lists detected from font sizes.", keywords: ["md", "llm", "notes", "docs"], run: () => import("./engines/render").then((m) => m.pdfToMarkdown) }),

  /* ── Edit ── */
  def({ slug: "rotate-pdf", name: "Rotate PDF", cat: "edit", from: ["pdf"], to: "pdf", multi: true,
    short: "Rotate all or selected pages.", desc: "Rotate PDF pages 90°, 180° or 270° — all pages or only the ones you choose.", keywords: ["turn", "flip", "orientation", "sideways"],
    options: [
      { key: "angle", label: "Rotate", type: "select", default: "90", options: [{ value: "90", label: "90° clockwise" }, { value: "180", label: "180°" }, { value: "270", label: "90° counter-clockwise" }] },
      { key: "pages", label: "Pages", type: "text", placeholder: "All pages — or e.g. 2, 4-6" },
    ], run: pdfRun("rotatePdf") }),
  def({ slug: "add-page-numbers", name: "Add page numbers", cat: "edit", from: ["pdf"], to: "pdf", multi: false,
    short: "Number every page, your way.", desc: "Stamp page numbers on a PDF with flexible position and format.", keywords: ["numbering", "paginate", "footer"],
    options: [
      { key: "position", label: "Position", type: "select", default: "bottom-center", options: [{ value: "bottom-center", label: "Bottom center" }, { value: "bottom-right", label: "Bottom right" }, { value: "bottom-left", label: "Bottom left" }, { value: "top-center", label: "Top center" }, { value: "top-right", label: "Top right" }] },
      { key: "format", label: "Format", type: "select", default: "n", options: [{ value: "n", label: "1" }, { value: "page", label: "Page 1" }, { value: "slash", label: "1 / 10" }, { value: "of", label: "Page 1 of 10" }] },
      { key: "start", label: "Start at", type: "number", min: 0, default: 1 },
      { key: "skipFirst", label: "Cover page", type: "select", default: "no", options: [{ value: "no", label: "Number it" }, { value: "yes", label: "Skip first page" }] },
    ], run: pdfRun("pageNumbers") }),
  def({ slug: "add-watermark", name: "Add watermark", cat: "edit", from: ["pdf"], to: "pdf", multi: false,
    short: "Stamp text across every page.", desc: "Add a text watermark like CONFIDENTIAL or DRAFT to every page of your PDF.", keywords: ["stamp", "confidential", "draft", "overlay"],
    options: [
      { key: "text", label: "Text", type: "text", placeholder: "CONFIDENTIAL", default: "CONFIDENTIAL" },
      { key: "size", label: "Size", type: "range", min: 24, max: 140, step: 2, default: 64, format: (v) => `${v} pt` },
      { key: "opacity", label: "Opacity", type: "range", min: 0.05, max: 0.7, step: 0.01, default: 0.2, format: (v) => `${Math.round(v * 100)}%` },
      { key: "angle", label: "Angle", type: "select", default: "45", options: [{ value: "45", label: "Diagonal" }, { value: "0", label: "Horizontal" }, { value: "90", label: "Vertical" }] },
      { key: "color", label: "Color", type: "select", default: "gray", options: [{ value: "gray", label: "Gray" }, { value: "red", label: "Red" }, { value: "blue", label: "Blue" }] },
    ], run: pdfRun("watermarkPdf") }),
  def({ slug: "crop-pdf", name: "Crop PDF", cat: "edit", from: ["pdf"], to: "pdf", multi: false,
    short: "Trim margins from every page.", desc: "Crop white space or unwanted edges off all pages of a PDF.", keywords: ["trim", "margins", "cut edges"],
    options: (["top", "right", "bottom", "left"] as const).map((k) => ({ key: k, label: `${k[0].toUpperCase()}${k.slice(1)} margin`, type: "number" as const, min: 0, max: 200, default: 0, suffix: "mm" })),
    run: pdfRun("cropPdf") }),


  /* ── OCR ── */
  def({ slug: "ocr-pdf", name: "OCR PDF", cat: "optimize", from: ["pdf", "jpg", "png", "webp"], to: "pdf", multi: true, featured: true,
    short: "Make scanned PDFs searchable & selectable.", desc: "Recognize the text in scanned PDFs or photos and add an invisible text layer, so you can search, select and copy it. Runs fully on your device.",
    keywords: ["ocr", "scan", "scanned", "searchable", "text recognition", "recognize"],
    options: [{ key: "lang", label: "Language", type: "select", default: "eng", options: [{ value: "eng", label: "English" }, { value: "spa", label: "Spanish" }, { value: "fra", label: "French" }, { value: "deu", label: "German" }, { value: "por", label: "Portuguese" }, { value: "ita", label: "Italian" }] }], run: () => import("./engines/ocr").then((m) => m.ocrPdf) }),
  def({ slug: "ocr-to-text", name: "Scan to Text (OCR)", cat: "from-pdf", from: ["pdf", "jpg", "png", "webp", "bmp"], to: "txt", multi: true, featured: true,
    short: "Extract text from scans and photos.", desc: "Turn scanned PDFs and images into plain text using on-device OCR, in 9 languages.",
    keywords: ["ocr", "image to text", "scan to text", "recognize", "extract text", "photo to text"],
    options: [{ key: "lang", label: "Language", type: "select", default: "eng", options: [{ value: "eng", label: "English" }, { value: "hin", label: "Hindi" }, { value: "spa", label: "Spanish" }, { value: "fra", label: "French" }, { value: "deu", label: "German" }, { value: "por", label: "Portuguese" }, { value: "ita", label: "Italian" }, { value: "rus", label: "Russian" }, { value: "ara", label: "Arabic" }] }], run: () => import("./engines/ocr").then((m) => m.ocrToText) }),

  /* ── Security & editing ── */
  def({ slug: "protect-pdf", name: "Protect PDF", cat: "security", from: ["pdf"], to: "pdf", multi: true,
    short: "Lock a PDF with a password (AES-256).", desc: "Encrypt a PDF with a password using AES-256, and choose whether people can print, copy or edit it.",
    keywords: ["password", "encrypt", "lock", "secure", "restrict"],
    options: [
      { key: "password", label: "Password", type: "text", secret: true, placeholder: "At least 4 characters" },
      { key: "print", label: "Printing", type: "select", default: "yes", options: [{ value: "yes", label: "Allowed" }, { value: "no", label: "Blocked" }] },
      { key: "copy", label: "Copying text", type: "select", default: "no", options: [{ value: "yes", label: "Allowed" }, { value: "no", label: "Blocked" }] },
      { key: "edit", label: "Editing", type: "select", default: "no", options: [{ value: "yes", label: "Allowed" }, { value: "no", label: "Blocked" }] },
    ], run: () => import("./engines/qpdf").then((m) => m.protectPdf) }),
  def({ slug: "unlock-pdf", name: "Unlock PDF", cat: "security", from: ["pdf"], to: "pdf", multi: true,
    short: "Remove a PDF’s password or restrictions.", desc: "Remove the password from a PDF you have the right to open, or strip printing and copying restrictions.",
    keywords: ["password", "decrypt", "remove password", "restrictions", "open"],
    options: [{ key: "password", label: "Password", type: "text", secret: true, placeholder: "Leave empty for restrictions-only files", help: "Needed only if the PDF asks for a password to open." }],
    run: () => import("./engines/qpdf").then((m) => m.unlockPdf) }),
  def({ slug: "sign-pdf", name: "Sign PDF", cat: "security", from: ["pdf"], to: "pdf", multi: false, editor: "sign", featured: true,
    short: "Draw, type or upload a signature and place it.", desc: "Sign a PDF: draw, type or upload your signature, drag it into place, add the date — all without uploading anything.",
    keywords: ["signature", "esign", "sign document", "initial", "date"],
    run: async () => (f, c) => import("./engines/edit").then((m) => m.editPdf(f, { ...c, opts: { ...c.opts, tag: "signed" } })) }),
  def({ slug: "edit-pdf", name: "Edit PDF", cat: "edit", from: ["pdf"], to: "pdf", multi: false, editor: "edit", featured: true,
    short: "Add text, whiteout, highlights, drawings & images.", desc: "Type on a PDF, cover mistakes with whiteout, highlight, draw freehand or drop in images. Everything stays on your device.",
    keywords: ["annotate", "add text", "highlight", "whiteout", "draw", "fill", "markup", "form"],
    run: () => import("./engines/edit").then((m) => m.editPdf) }),
  def({ slug: "redact-pdf", name: "Redact PDF", cat: "security", from: ["pdf"], to: "pdf", multi: false, editor: "redact",
    short: "Permanently black out sensitive content.", desc: "Draw boxes over names, numbers or anything sensitive. Redacted pages are flattened so the hidden text is truly gone, not just covered.",
    keywords: ["black out", "censor", "hide text", "sensitive", "blackout", "remove text"],
    run: () => import("./engines/edit").then((m) => m.editPdf) }),

  /* ── PowerPoint ── */
  def({ slug: "pptx-to-pdf", name: "PowerPoint to PDF", cat: "to-pdf", from: ["pptx"], to: "pdf", multi: true, featured: true,
    short: "PPTX slides to PDF pages.", desc: "Convert PowerPoint presentations to PDF in your browser. Text, shapes, tables and pictures are kept.",
    keywords: ["ppt", "pptx", "slides", "presentation", "powerpoint", "deck"], options: [],
    run: () => import("./engines/pptx").then((m) => m.pptxToPdf) }),
  def({ slug: "pdf-to-pptx", name: "PDF to PowerPoint", cat: "from-pdf", from: ["pdf"], to: "pptx", multi: true, featured: true,
    short: "Turn PDF pages into slides.", desc: "Convert a PDF to a PowerPoint deck — either exact-look image slides or editable text boxes.",
    keywords: ["ppt", "pptx", "slides", "presentation", "powerpoint", "deck"],
    options: [{ key: "mode", label: "Slide type", type: "select", default: "image", options: [{ value: "image", label: "Exact look", hint: "Each page is a full-slide image — identical, not editable" }, { value: "text", label: "Editable text", hint: "Text boxes at original positions — no images" }] }],
    run: () => import("./engines/pptx").then((m) => m.pdfToPptx) }),


  /* ── Markdown ── */
  def({ slug: "md-to-pdf", name: "Markdown to PDF", cat: "markdown", from: ["md"], to: "pdf", multi: true, featured: true,
    short: "Turn .md notes and docs into a clean PDF.", desc: "Convert Markdown files to PDF — headings, lists, code blocks, quotes and tables are laid out for you. Perfect for READMEs, notes and documentation.",
    keywords: ["markdown", "md", "readme", "notes", "documentation", "github", "export"], options: [pageSizeOpt, docMargin],
    run: () => import("./engines/markdown").then((m) => m.mdToPdf) }),
  def({ slug: "md-to-word", name: "Markdown to Word", cat: "markdown", from: ["md"], to: "docx", multi: true, featured: true,
    short: "Markdown to a real, editable .docx.", desc: "Convert Markdown into a Word document with real headings, lists, tables, code blocks and links — ready to edit or share.",
    keywords: ["markdown", "md", "docx", "word", "microsoft word", "export", "readme"], options: [pageSizeOpt, docMargin],
    run: () => import("./engines/markdown").then((m) => m.mdToWord) }),
  def({ slug: "word-to-md", name: "Word to Markdown", cat: "markdown", from: ["docx"], to: "md", multi: true, featured: true,
    short: "Word documents to clean Markdown.", desc: "Convert a .docx into Markdown: headings, lists, tables, links and emphasis. Pictures are saved as separate files next to it.",
    keywords: ["markdown", "md", "docx", "word", "microsoft word", "import", "notes", "github"],
    options: [{ key: "images", label: "Pictures", type: "select", default: "folder", options: [{ value: "folder", label: "Save as files", hint: "Each picture becomes its own image file, linked from the Markdown" }, { value: "skip", label: "Leave out" }, { value: "embed", label: "Embed", hint: "Stored inside the Markdown as base64 — makes the file large" }] }],
    run: () => import("./engines/markdown").then((m) => m.wordToMd) }),
  def({ slug: "md-to-html", name: "Markdown to HTML", cat: "markdown", from: ["md"], to: "html", multi: true,
    short: "A styled, self-contained web page.", desc: "Convert Markdown to a standalone HTML page with tidy styling that follows light and dark mode.",
    keywords: ["markdown", "md", "html", "web page", "website", "preview", "blog"], run: () => import("./engines/markdown").then((m) => m.mdToHtml) }),
  def({ slug: "html-to-md", name: "HTML to Markdown", cat: "markdown", from: ["html"], to: "md", multi: true,
    short: "Web pages to readable Markdown.", desc: "Convert saved HTML pages into Markdown — headings, lists, links, tables and code.",
    keywords: ["markdown", "md", "html", "web page", "clean", "scrape", "blog", "notes"], run: () => import("./engines/markdown").then((m) => m.htmlToMd) }),
  def({ slug: "md-to-txt", name: "Markdown to Text", cat: "markdown", from: ["md"], to: "txt", multi: true,
    short: "Strip the formatting, keep the words.", desc: "Convert Markdown to plain text: formatting marks are removed, lists keep their bullets and links show their address.",
    keywords: ["markdown", "md", "txt", "plain text", "strip formatting", "remove markdown"], run: () => import("./engines/markdown").then((m) => m.mdToTxt) }),

  /* ── Forms, comparing, spreadsheets ── */
  def({ slug: "fill-pdf-form", name: "Fill PDF form", cat: "edit", from: ["pdf"], to: "pdf", multi: false, form: true, featured: true,
    short: "Fill in fields, tick boxes and pick options.", desc: "Fill in fillable PDF forms — text boxes, check boxes, radio buttons and drop-downs — right in your browser, then save. Nothing is uploaded.",
    keywords: ["form", "fillable", "acroform", "fill in", "checkbox", "application", "questionnaire", "tax form"],
    options: [{ key: "flatten", label: "When saving", type: "select", default: "no", options: [{ value: "no", label: "Keep editable" }, { value: "yes", label: "Lock in place", hint: "Turns the answers into fixed text so they can't be changed" }] }],
    run: () => import("./engines/forms").then((m) => m.fillForm) }),
  def({ slug: "compare-pdf", name: "Compare PDFs", cat: "edit", from: ["pdf"], to: ["pdf"], multi: true, sort: true, max: 2, abLabels: true, featured: true,
    short: "See exactly what changed between two versions.", desc: "Compare two PDFs page by page. Get a report with the changes highlighted in red and a list of words that were added or removed.",
    keywords: ["diff", "difference", "changes", "versions", "redline", "compare documents", "what changed"],
    run: () => import("./engines/compare").then((m) => m.comparePdf) }),
  def({ slug: "pdf-to-excel", name: "PDF to Excel", cat: "from-pdf", from: ["pdf"], to: "xlsx", multi: true, featured: true,
    short: "Pull tables out of a PDF into a spreadsheet.", desc: "Convert tables in text-based PDFs into an Excel workbook. Columns are detected from where the text sits, and numbers become real numbers.",
    keywords: ["xls", "xlsx", "spreadsheet", "table", "extract table", "statement", "invoice"],
    options: [
      { key: "layout", label: "Sheets", type: "select", default: "pages", options: [{ value: "pages", label: "One per page" }, { value: "single", label: "All in one" }] },
      { key: "numbers", label: "Numbers", type: "select", default: "yes", options: [{ value: "yes", label: "Convert to numbers" }, { value: "no", label: "Keep as text" }], help: "Turns things like 1,250.00 or 12% into real numbers you can calculate with." },
    ],
    run: () => import("./engines/table").then((m) => m.pdfToExcel) }),

  /* ── Images ── */
  def({ slug: "compress-image", name: "Compress image", cat: "image", from: ["jpg", "png", "webp"], to: ["jpg", "png", "webp"], multi: true, featured: true, estimate: true,
    short: "Shrink JPG, PNG & WebP with no fuss.", desc: "Compress images in bulk while keeping them sharp. Optionally downscale or switch to WebP.",
    keywords: ["reduce", "optimize", "smaller", "shrink", "photo size", "kb"],
    options: [
      { key: "target", label: "Target size", type: "select", default: "0", help: "Finds the best quality that fits under the limit.",
        options: [{ value: "0", label: "No target" }, { value: "50", label: "Under 50 KB" }, { value: "100", label: "Under 100 KB" }, { value: "200", label: "Under 200 KB" }, { value: "500", label: "Under 500 KB" }, { value: "1024", label: "Under 1 MB" }, { value: "2048", label: "Under 2 MB" }] },
      { key: "quality", label: "Quality", type: "range", min: 0.3, max: 0.95, step: 0.01, default: 0.72, showWhen: (o) => o.target === "0", format: (v) => `${Math.round(v * 100)}%` },
      { key: "maxDim", label: "Max dimension", type: "select", default: "0", options: [{ value: "0", label: "Original size" }, { value: "3840", label: "4K (3840 px)" }, { value: "2560", label: "2560 px" }, { value: "1920", label: "Full HD (1920 px)" }, { value: "1280", label: "1280 px" }, { value: "800", label: "800 px" }] },
      { key: "format", label: "Output format", type: "select", default: "keep", options: [{ value: "keep", label: "Keep original" }, { value: "webp", label: "WebP (smallest)" }, { value: "jpg", label: "JPG" }] },
    ], run: () => import("./engines/image").then((m) => m.compressImages) }),
  def({ slug: "resize-image", name: "Resize image", cat: "image", from: ["jpg", "png", "webp"], to: ["jpg", "png", "webp"], multi: true, featured: true, estimate: true,
    short: "Set exact width and height.", desc: "Resize images to exact pixel dimensions while keeping proportions.", keywords: ["dimensions", "scale", "pixels", "thumbnail"],
    options: [
      { key: "width", label: "Width", type: "number", min: 0, default: 0, suffix: "px", help: "0 = automatic" },
      { key: "height", label: "Height", type: "number", min: 0, default: 0, suffix: "px", help: "0 = automatic" },
    ], run: () => import("./engines/image").then((m) => m.resizeImages) }),

  /* ── Photo & signature presets ── */
  def({ slug: "photo-resizer", name: "Photo & signature resizer", cat: "image", from: PHOTO_FROM, to: ["jpg", "png"], multi: false, crop: true, featured: true,
    short: "Exact sizes and file limits for online forms.", desc: "Pick a ready-made size — passport photo, visa photo, signature under 20 KB — or set your own. Position your photo in the frame and save a file that fits the form.",
    keywords: ["passport", "visa", "photo size", "signature", "under 20kb", "under 50kb", "form upload", "id photo", "exam", "application"],
    options: [
      { key: "preset", label: "Size", type: "select", default: "passport", options: PRESETS.map((p) => ({ value: p.id, label: p.label })) },
      { key: "w", label: "Width", type: "number", min: 20, max: 4000, default: 600, suffix: "px", showWhen: (o) => o.preset === "custom" },
      { key: "h", label: "Height", type: "number", min: 20, max: 4000, default: 600, suffix: "px", showWhen: (o) => o.preset === "custom" },
      { key: "maxKb", label: "Max file size", type: "number", min: 0, default: 100, suffix: "KB", help: "0 = no limit", showWhen: (o) => o.preset === "custom" },
      { key: "format", label: "Format", type: "select", default: "jpg", showWhen: (o) => o.preset === "custom", options: [{ value: "jpg", label: "JPG" }, { value: "png", label: "PNG" }, { value: "webp", label: "WebP" }] },
      { key: "clean", label: "Clean signature", type: "select", default: "yes", showWhen: (o) => String(o.preset).startsWith("signature"), options: [{ value: "yes", label: "Whiten paper" }, { value: "no", label: "Off" }], help: "Turns a photo of a signature into crisp dark ink on white." },
    ], run: () => import("./engines/photo").then((m) => m.presetImage) }),
  def({ slug: "passport-photo", name: "Passport photo maker", cat: "image", from: PHOTO_FROM, to: ["jpg"], multi: false, crop: true, presetId: "passport", featured: true,
    short: "35×45 mm passport photo, under 200 KB.", desc: "Frame your photo to the standard 35×45 mm passport size (413×531 px) and keep the file under 200 KB. Guides help you centre your face.",
    keywords: ["passport photo", "35x45", "id photo", "visa photo", "photo booth", "biometric"], run: () => import("./engines/photo").then((m) => m.presetImage) }),
  def({ slug: "us-visa-photo", name: "US visa / passport photo", cat: "image", from: PHOTO_FROM, to: ["jpg"], multi: false, crop: true, presetId: "us-visa",
    short: "2×2 inch square photo, 600×600 px.", desc: "Make the 2×2 inch (600×600 px) square photo used for US passports and visas, under 240 KB.",
    keywords: ["us visa", "2x2", "square photo", "green card", "dv lottery", "usa passport"], run: () => import("./engines/photo").then((m) => m.presetImage) }),
  def({ slug: "signature-resizer", name: "Signature resizer", cat: "image", from: PHOTO_FROM, to: ["jpg"], multi: false, crop: true, presetId: "signature", featured: true,
    short: "Signature under 20 KB, clean on white.", desc: "Turn a photo of your signature into a small, clean image — 140×60 px under 20 KB or 300×100 px under 30 KB — ready for form uploads.",
    keywords: ["signature", "sign", "under 20kb", "esignature", "resize signature", "signature photo"],
    options: [
      { key: "preset", label: "Size", type: "select", default: "signature", options: [{ value: "signature", label: "140×60 px · under 20 KB" }, { value: "signature-wide", label: "300×100 px · under 30 KB" }] },
      { key: "clean", label: "Clean signature", type: "select", default: "yes", options: [{ value: "yes", label: "Whiten paper" }, { value: "no", label: "Off" }] },
    ], run: () => import("./engines/photo").then((m) => m.presetImage) }),
  def({ slug: "profile-picture", name: "Profile picture maker", cat: "image", from: PHOTO_FROM, to: ["jpg"], multi: false, crop: true, presetId: "profile",
    short: "Square 400×400 avatar, under 100 KB.", desc: "Crop a photo to a square 400×400 px profile picture and keep it under 100 KB.",
    keywords: ["avatar", "profile photo", "square", "dp", "profile pic"], run: () => import("./engines/photo").then((m) => m.presetImage) }),
];

/* Every image → image conversion (jpg/png/webp targets). */
const imageConversions: Tool[] = [];
for (const from of IMAGE_FMTS) {
  for (const to of ["jpg", "png", "webp"] as const) {
    if (from === to) continue;
    const F = FORMATS[from].label, T = FORMATS[to].label;
    const opts: OptionSpec[] = [];
    if (to !== "png") opts.push({ key: "quality", label: "Quality", type: "range", min: 0.4, max: 1, step: 0.01, default: 0.92, format: (v) => `${Math.round(v * 100)}%` });
    if (from === "svg") opts.push({ key: "scale", label: "Scale", type: "select", default: "1", options: [{ value: "1", label: "1×" }, { value: "2", label: "2×" }, { value: "4", label: "4×" }] });
    imageConversions.push(def({
      slug: `${from}-to-${to}`, name: `${F} to ${T}`, cat: "image", from: [from], to, multi: true,
      featured: ["jpg-png", "png-jpg", "heic-jpg", "webp-jpg", "webp-png", "jpg-webp"].includes(`${from}-${to}`),
      short: `Convert ${F} images to ${T}.`, desc: `Convert ${F} to ${T} instantly in your browser. Batch as many files as you like.`,
      keywords: [F.toLowerCase(), T.toLowerCase(), "image converter", "convert image", ...(from === "jpg" ? ["jpeg"] : []), ...(from === "heic" ? ["iphone", "apple", "heif"] : [])],
      options: opts, run: async () => (f, c) => import("./engines/image").then((m) => m.convertImages(f, c, to)),
    }));
  }
}

const data: Tool[] = [
  def({ slug: "csv-to-json", name: "CSV to JSON", cat: "data", from: ["csv"], to: "json", multi: true, short: "Spreadsheet rows to JSON objects.", desc: "Convert CSV files into a JSON array of objects.", keywords: ["comma separated", "api", "developer"], run: () => import("./engines/data").then((m) => m.csvToJson) }),
  def({ slug: "json-to-csv", name: "JSON to CSV", cat: "data", from: ["json"], to: "csv", multi: true, short: "JSON arrays to a spreadsheet-ready CSV.", desc: "Flatten a JSON array of objects into CSV.", keywords: ["api", "developer", "excel"], run: () => import("./engines/data").then((m) => m.jsonToCsv as Runner) }),
  def({ slug: "excel-to-csv", name: "Excel to CSV", cat: "data", from: ["xlsx"], to: "csv", multi: true, short: "XLSX sheets to CSV files.", desc: "Export every sheet of an Excel workbook as CSV.", keywords: ["xls", "xlsx", "spreadsheet"], run: async () => (f, c) => import("./engines/data").then((m) => m.xlsxTo(f, c, "csv")) }),
  def({ slug: "excel-to-json", name: "Excel to JSON", cat: "data", from: ["xlsx"], to: "json", multi: true, short: "XLSX sheets to JSON.", desc: "Export every sheet of an Excel workbook as JSON.", keywords: ["xls", "xlsx", "spreadsheet", "developer"], run: async () => (f, c) => import("./engines/data").then((m) => m.xlsxTo(f, c, "json")) }),
];

const noRun = (name: string) => async (): Promise<Runner> => async () => { throw new UserError(`${name} works on its own page — open it from the tool page.`); };
const utilities: Tool[] = [
  def({ slug: "qr-code-generator", name: "QR code maker", cat: "utility", from: [], to: "png", multi: false, custom: "qr-maker", flow: ["TEXT", "QR"], featured: true,
    short: "QR codes for links, Wi-Fi, contacts and more.", desc: "Make a QR code for a link, Wi-Fi network, contact card, email, phone number or location. Pick colours, dot shapes and a logo, then download PNG or SVG.",
    keywords: ["qr", "qrcode", "barcode", "wifi qr", "vcard", "link", "generator", "create"], run: noRun("The QR code maker") }),
  def({ slug: "qr-code-reader", name: "QR code reader", cat: "utility", from: IMAGE_FMTS.filter((f) => f !== "svg" && f !== "heic"), to: "txt", multi: true, custom: "qr-reader", flow: ["QR", "TEXT"], featured: true,
    short: "Scan a QR code from an image or your camera.", desc: "Read a QR code from a picture, a screenshot or your live camera. See what's inside — link, Wi-Fi details, contact card — before you open anything.",
    keywords: ["qr", "scan", "scanner", "decode", "barcode", "read qr", "camera"], run: noRun("The QR code reader") }),
  def({ slug: "document-properties", name: "Document properties", cat: "utility", from: ["pdf", "docx", "xlsx", "pptx", "jpg"], to: ["pdf", "docx", "xlsx", "pptx", "jpg"], multi: false, custom: "metadata", flow: ["FILE", "INFO"], featured: true,
    short: "See who made a file, then edit or remove it.", desc: "Check a PDF, Word, Excel, PowerPoint or JPG for its author, the program that created it, dates and hidden details like GPS location. Edit the fields or remove all metadata.",
    keywords: ["metadata", "properties", "author", "producer", "creator", "exif", "gps", "info", "remove metadata", "who made", "generator", "strip"], run: () => import("./engines/meta").then((m) => m.stripAll) }),
];

export const TOOLS: Tool[] = [...core, ...imageConversions, ...data, ...utilities];

const AUTORUN = new Set(["md-to-pdf", "md-to-word", "word-to-md", "md-to-html", "html-to-md", "md-to-txt", "pdf-to-word", "pdf-to-text", "pdf-to-markdown", "repair-pdf", "word-to-pdf", "csv-to-json", "json-to-csv", "excel-to-csv", "excel-to-json", "excel-to-pdf", "html-to-pdf"]);
for (const t of TOOLS) if (AUTORUN.has(t.slug) || (t.cat === "image" && /^[a-z]+-to-[a-z]+$/.test(t.slug) && t.from.length === 1)) t.autorun = true;
export const TOOL_MAP = new Map(TOOLS.map((t) => [t.slug, t]));
export const getTool = (slug: string) => TOOL_MAP.get(slug);

export const POPULAR = ["jpg-to-pdf", "compress-pdf", "merge-pdf", "sign-pdf", "word-to-pdf", "ocr-pdf", "pdf-to-jpg", "heic-to-jpg", "pdf-to-word", "split-pdf"];

export function toolsForFormat(f: Fmt): Tool[] {
  return TOOLS.filter((t) => t.from.includes(f));
}

/** Roadmap items — shown honestly in the UI, never listed as working. */
export const ROADMAP = ["PDF/A archiving (needs a proper validator)", "Background-thread processing for huge files", "More languages for the interface"];
