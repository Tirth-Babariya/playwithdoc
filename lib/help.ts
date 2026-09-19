import { FORMATS } from "./formats";
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
  "heic-to-jpg": ["iPhone photos in HEIC convert to standard JPG that opens everywhere.", "Drop a whole batch at once and download them as a ZIP."],
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
  const faq = [
    { q: `Is ${t.name} really free?`, a: "Yes — free with no sign-up, no watermark and no limits on how many files you process." },
    { q: "Are my files uploaded to a server?", a: "No. Everything happens in your browser. The site even tells your browser to block connections to other websites, and the badge on the page shows uploads staying at zero." },
    { q: `What ${from} files can I use?`, a: `${t.name} accepts ${t.from.map((f) => FORMATS[f].label).join(", ")} files and produces ${to}.` },
    { q: "Is there a size limit?", a: "Only your device’s memory. Typical documents and photos are instant; very large files may be slow on older phones." },
  ];
  return { about, tips, faq };
}

export function jsonLd(t: Tool, help: Help) {
  return [
    { "@context": "https://schema.org", "@type": "SoftwareApplication", name: t.name, applicationCategory: "UtilitiesApplication", operatingSystem: "Any (web browser)", description: t.desc, offers: { "@type": "Offer", price: "0", priceCurrency: "USD" } },
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: help.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
  ];
}
