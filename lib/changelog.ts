/** What's new — newest first. `tools` lists the tool slugs an entry introduced (they get a "New" badge for a while). */
export type Change = { id: string; date: string; title: string; summary: string; tools?: string[]; points: string[] };

export const CHANGELOG: Change[] = [
  {
    id: "2026-09-26-qr-and-properties",
    date: "2026-09-26",
    title: "QR codes and document properties",
    summary: "Make and read QR codes, and see (or wipe) who made a file — all on your device.",
    tools: ["qr-code-generator", "qr-code-reader", "document-properties"],
    points: [
      "QR code maker: links, Wi-Fi, contacts, email, phone, SMS and map locations, with colours, dot shapes, a logo in the middle, and PNG or SVG download.",
      "QR code reader: scan from an image, a pasted screenshot or your camera. Wi-Fi codes show the password, and links are shown before you open them.",
      "Document properties: see the title, author, creator and producer of a PDF, Word, Excel or PowerPoint file, and the camera and GPS location in a JPG. Edit the fields or remove everything.",
      "Three new how-to guides (Wi-Fi QR codes, scanning a QR from an image, checking PDF metadata), a What’s new page (this one) and “New” badges so you can spot fresh tools.",
      "Better search results: every page now has its own title, description and share preview.",
    ],
  },
  {
    id: "2026-09-26-markdown",
    date: "2026-09-26",
    title: "Markdown conversions",
    summary: "Move writing between Markdown, Word, PDF, HTML and text.",
    tools: ["md-to-pdf", "md-to-word", "word-to-md", "md-to-html", "html-to-md", "md-to-txt", "pdf-to-markdown"],
    points: ["Markdown to PDF, Word, HTML and text — headings, lists, tables, code and links keep their structure.", "Word, HTML and PDF back to clean Markdown, with an option to save pictures as separate files."],
  },
  {
    id: "2026-09-19-guides",
    date: "2026-09-19",
    title: "How-to guides and the Prove it page",
    summary: "Short guides for the things people search most, and a live test that nothing is uploaded.",
    tools: [],
    points: ["18 step-by-step guides, each ending at the right tool.", "Prove it: run a real conversion while the page counts network requests — it stays at zero."],
  },
  {
    id: "2026-09-19-presets",
    date: "2026-09-19",
    title: "Photo presets, forms, compare and recipes",
    summary: "Exact-size passport photos and signatures, fillable forms, Compare PDFs, PDF to Excel and saved recipes.",
    tools: ["passport-photo", "signature-resizer", "fill-pdf-form", "compare-pdf", "pdf-to-excel"],
    points: ["Passport, visa, profile and signature presets with a draggable frame.", "Fill in PDF forms, compare two versions of a document, turn PDF tables into Excel.", "Recipes: chain several tools into one saved multi-step run."],
  },
];

export const LATEST = CHANGELOG[0].id;
const DAY = 86_400_000;
/** Slugs introduced within the last `days` days (for "New" badges). */
export function newSlugs(days = 30, now = Date.now()): Set<string> {
  const s = new Set<string>();
  for (const c of CHANGELOG) if (now - Date.parse(c.date) <= days * DAY) c.tools?.forEach((t) => s.add(t));
  return s;
}
