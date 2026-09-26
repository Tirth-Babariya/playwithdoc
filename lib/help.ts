import { FORMATS } from "./formats";
import { SITE_URL } from "./site";
import type { Tool } from "./types";

export type Help = { about: string[]; tips: string[]; faq: { q: string; a: string }[] };

const TIPS: Record<string, string[]> = {
  "jpg-to-pdf": ["Drag the photos into the order you want — the numbers show the page order.", "Use the rotate button on a card if a photo came in sideways.", "Choose “Fit to image” for pages that match each photo exactly, or A4/Letter for printing."],
  "merge-pdf": ["Drag the cards to set the order, or use Sort A–Z for numbered file names.", "Need only some pages from each file? Extract them first, then merge."],
  "compress-pdf": ["Need to hit an upload limit? Pick a target size and it keeps shrinking until it fits.", "Lossless keeps text selectable; Balanced and Smallest turn pages into images for the biggest savings."],
  "compress-image": ["Pick a target size (like under 100 KB) for forms with strict limits.", "The slider under “Quality” is replaced by the target when you set one.", "After compressing, drag the comparison slider to check nothing important was lost."],
  "sign-pdf": ["Draw with a mouse, finger or stylus — or type your name, or upload a photo of a signature.", "Signatures you save stay only on this device.", "Drag the corner handle to resize the signature."],
  "ocr-pdf": ["Higher-quality scans give better results — 300 dpi is ideal.", "Pick the document’s language before you start.", "Your pages look exactly the same afterwards; the text layer is invisible but selectable."],
  "redact-pdf": ["Redacted pages are flattened, so the covered text is removed from the file, not just hidden.", "Zoom in and double-check every box before saving."],
  "protect-pdf": ["Use a long password you can remember — there is no recovery if you forget it.", "You can block printing, copying and editing separately."],
  "passport-photo": ["Stand about an arm's length from the camera, with a plain light background and even light on your face.", "Use the oval guide: your face should fill most of it, with the eyes near the horizontal line.", "Always check the exact rules of the office you're applying to — sizes and limits vary by country."],
  "signature-resizer": ["Sign in dark ink on plain white paper and take the photo in good light.", "“Whiten paper” removes shadows so only the ink remains.", "Need a different size? Pick “Custom” in the Photo & signature resizer."],
  "fill-pdf-form": ["Only fields you change are written to the file.", "“Lock in place” makes the answers permanent text — good before sending the form on.", "No fields found? The PDF is flat; use Edit PDF to type on it instead."],
  "compare-pdf": ["Put the older version first (A) and the newer second (B) — drag the cards to swap them.", "Works best on text documents; changed words are listed and changed areas are marked in red.", "Scanned documents are compared by how the page looks, since they contain no text."],
  "pdf-to-excel": ["This works on PDFs with real text (bank statements, invoices, reports). For scans, run OCR PDF first.", "Columns are inferred from where text sits, so check merged headers and unusual cells.", "Choose “All in one” to get a single continuous sheet across pages."],
  "md-to-pdf": ["Great for READMEs, notes and documentation — headings, lists, code blocks, quotes and tables are all laid out.", "Images and links to other pages aren't included in the PDF.", "Want it editable instead? Try Markdown to Word."],
  "md-to-word": ["Headings become real Word headings, so the navigation pane and table of contents work.", "Nested and numbered lists, tables, code blocks and links become real Word formatting.", "Images aren't embedded — a note marks where each one was."],
  "word-to-md": ["Use the Pictures option to save images as separate files next to the Markdown (keep them in the same folder).", "Word styles like Heading 1–6 become # headings, and tables become Markdown tables.", "Complex layouts and text boxes are simplified — check the result before publishing."],
  "qr-code-generator": ["Keep a quiet border around the code and use dark on light — that scans best.", "Short links make simpler, easier-to-scan codes. Long text makes a dense code.", "Always test the printed code with a phone before you print a hundred copies."],
  "qr-code-reader": ["Paste a screenshot with Ctrl/⌘+V — no need to save it first.", "Fill the frame with the code and keep the camera steady; good light matters more than resolution.", "Wi-Fi codes reveal the password with a click — handy for sharing without asking."],
  "document-properties": ["Check the Producer field to see which program generated a PDF.", "Remove the metadata before sharing files publicly — it can include your name, company and, for photos, your location.", "Editing the dates or author changes only the properties, not the content."],
  "heic-to-jpg": ["iPhone photos in HEIC convert to standard JPG that opens everywhere.", "Drop a whole batch at once and download them as a ZIP."],
};

const CUSTOM_FAQ: Record<string, { q: string; a: string }[]> = {
  "qr-code-generator": [
    { q: "Do these QR codes expire?", a: "No. The code simply contains your text or link, so it works for as long as that link works. Nothing is stored or tracked by this site." },
    { q: "Which type should I pick for Wi-Fi?", a: "Choose Wi-Fi, enter the network name and password, and pick the security type (most home routers use WPA/WPA2). Guests can join by scanning — no typing." },
    { q: "Does adding a logo hurt scanning?", a: "A logo covers the middle of the code. The maker switches to the highest error correction so it still scans, but test it with your own phone before printing." },
  ],
  "qr-code-reader": [
    { q: "Does it work with a live camera?", a: "Yes. Press “Scan with camera”, allow access, and point it at the code. The video never leaves your device." },
    { q: "Is it safe to open a scanned link?", a: "The reader shows the full address first and never opens anything by itself. Only open links you trust." },
    { q: "What can it read?", a: "QR codes in PNG, JPG, WEBP, GIF, BMP and AVIF images, including screenshots you paste in. Other barcode types (like product barcodes) aren’t supported." },
  ],
  "document-properties": [
    { q: "Which files does it work with?", a: "PDF, modern Word / Excel / PowerPoint files (.docx .xlsx .pptx) and JPG photos. Older .doc / .xls / .ppt files and other image types aren’t supported yet." },
    { q: "How can I tell which program made my PDF?", a: "Look at “Creator” (the program the content was written in) and “Producer” (the program that produced the PDF file). Some generators leave them empty." },
    { q: "Is removing metadata safe for the content?", a: "Yes. Text, pages and pictures stay exactly as they are. Only the properties (author, dates, company, GPS and similar) are removed. Comments and tracked changes inside a Word file are content, so they are listed but not removed." },
  ],
};

const ABOUT: Record<string, string> = {
  organize: "Rearrange, combine and clean up your PDFs without installing anything.",
  optimize: "Make PDFs smaller, searchable or repaired — right in your browser.",
  "to-pdf": "Turn documents and images into a shareable PDF.",
  "from-pdf": "Pull your content out of a PDF into an editable format.",
  edit: "Make changes to a PDF without needing desktop software.",
  security: "Protect, sign or clean sensitive PDFs — privately, on your device.",
  image: "Convert, shrink and resize images in bulk.",
  data: "Move data between spreadsheet and developer formats.",
  utility: "Make and read QR codes and see what a document says about itself — privately, without uploading anything.",
  markdown: "Move writing between Markdown, Word, PDF and HTML without losing its structure.",
};

export function helpFor(t: Tool): Help {
  const from = t.from.length > 3 ? "images" : t.from.map((f) => FORMATS[f].label).join("/");
  const to = t.to.length > 2 ? "the format you choose" : t.to.map((f) => FORMATS[f].label).join("/");
  const about = [
    `${t.desc} ${ABOUT[t.cat]}`,
    `${t.name} runs entirely inside your browser. Your ${from} file${t.multi ? "s are" : " is"} read and processed on your own device, so nothing is uploaded, there’s no queue and no file-size limit beyond your device’s memory. There’s no account, watermark or daily quota.`,
  ];
  const tips = TIPS[t.slug] ?? [
    t.multi ? "Add several files at once — they’re processed together." : "Drop the file anywhere on the page, or paste it with Ctrl/⌘+V.",
    "Press Ctrl/⌘+K from any page to jump straight to another tool.",
    "When it’s done, send the result directly into another tool without downloading it first.",
  ];
  const custom = CUSTOM_FAQ[t.slug];
  const faq = [
    { q: `Is ${t.name} really free?`, a: "Yes — free with no sign-up, no watermark and no limits on how many files you process." },
    { q: "Are my files uploaded to a server?", a: "No. Everything happens in your browser. The site even tells your browser to block connections to other websites, and the badge on the page shows uploads staying at zero." },
    ...(custom ?? [{ q: `What ${from} files can I use?`, a: `${t.name} accepts ${t.from.map((f) => FORMATS[f].label).join(", ")} files and produces ${to}.` }]),
    { q: "Is there a size limit?", a: "Only your device’s memory. Typical documents and photos are instant; very large files may be slow on older phones." },
  ];
  return { about, tips, faq };
}

export function jsonLd(t: Tool, help: Help) {
  return [
    { "@context": "https://schema.org", "@type": "SoftwareApplication", name: t.name, applicationCategory: "UtilitiesApplication", operatingSystem: "Any (web browser)", url: `${SITE_URL}/tools/${t.slug}`, description: t.desc, offers: { "@type": "Offer", price: "0", priceCurrency: "USD" } },
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: help.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
    {
      "@context": "https://schema.org", "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "PlayWithDoc", item: SITE_URL },
        { "@type": "ListItem", position: 2, name: "Tools", item: `${SITE_URL}/#tools` },
        { "@type": "ListItem", position: 3, name: t.name, item: `${SITE_URL}/tools/${t.slug}` },
      ],
    },
  ];
}
