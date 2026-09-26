import { typeOfFile, type Fmt } from "../formats";
import type { Ctx, Result } from "../types";
import { loadPdfLib, UserError } from "./common";

/** Document properties: read, edit and remove the "who / what made this file" data inside PDFs, Office files and JPG photos. All on-device. */

export type MetaKind = "pdf" | "office" | "jpg";
export type Row = { label: string; value: string; warn?: boolean };
export type EditKey = "title" | "author" | "subject" | "keywords" | "creator" | "producer" | "company" | "lastModifiedBy" | "created" | "modified";
export type EditField = { key: EditKey; label: string; value: string; kind?: "date"; hint?: string };
export type MetaInfo = {
  kind: MetaKind;
  typeLabel: string;
  /** The "made with" line — the answer to "which program generated this?" */
  madeWith: { label: string; value: string }[];
  fields: EditField[];
  facts: Row[];
  notes: string[];
  /** Whether individual fields can be edited (JPG can only be stripped). */
  editable: boolean;
};

export const SUPPORTED = [".pdf", ".docx", ".xlsx", ".pptx", ".jpg", ".jpeg"];
export const META_FMTS: Fmt[] = ["pdf", "docx", "xlsx", "pptx", "jpg"];

/* ───────────── helpers ───────────── */

const xmlUnesc = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const xmlEsc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function tagValue(xml: string, tag: string): string {
  const m = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`).exec(xml);
  return m ? xmlUnesc(m[1].trim()) : "";
}

/** Replace (or insert, or drop when empty) a simple element in an OOXML properties part. */
function setTag(xml: string, tag: string, value: string, attrs = ""): string {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?(?:/>|>[\\s\\S]*?</${tag}>)`);
  const el = value ? `<${tag}${attrs}>${xmlEsc(value)}</${tag}>` : "";
  if (re.test(xml)) return xml.replace(re, () => el);
  if (!el) return xml;
  return xml.replace(/<\/([A-Za-z:]+)>\s*$/, (_m, root) => `${el}</${root}>`);
}

const isoDate = (d?: Date | null) => (d && !isNaN(+d) ? d.toISOString().replace(/\.\d+Z$/, "Z") : "");
const niceDate = (iso: string) => { const d = new Date(iso); return iso && !isNaN(+d) ? d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : iso; };
/** <input type="datetime-local"> value from an ISO string (local time). */
export const toLocalInput = (iso: string) => { const d = new Date(iso); if (!iso || isNaN(+d)) return ""; const p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
export const fromLocalInput = (v: string) => (v ? isoDate(new Date(v)) : "");

export function kindOf(file: File): MetaKind | null {
  const t = typeOfFile(file);
  return t === "pdf" ? "pdf" : t === "docx" || t === "xlsx" || t === "pptx" ? "office" : t === "jpg" ? "jpg" : null;
}

/* ───────────── PDF ───────────── */

async function readPdf(file: File): Promise<MetaInfo> {
  const { PDFName, PDFDict } = await import("pdf-lib");
  const buf = new Uint8Array(await file.arrayBuffer());
  const head = new TextDecoder("latin1").decode(buf.slice(0, 1024));
  const version = /%PDF-(\d\.\d)/.exec(head)?.[1] ?? "";
  const doc = await loadPdfLib(file, { lenient: true });
  const encrypted = doc.isEncrypted;
  const notes: string[] = [];
  const pick = (f: () => string | undefined) => { try { return f() ?? ""; } catch { return ""; } };
  const pickDate = (f: () => Date | undefined) => { try { return isoDate(f()); } catch { return ""; } };
  const info = encrypted ? null : {
    title: pick(() => doc.getTitle()), author: pick(() => doc.getAuthor()), subject: pick(() => doc.getSubject()), keywords: pick(() => doc.getKeywords()),
    creator: pick(() => doc.getCreator()), producer: pick(() => doc.getProducer()),
    created: pickDate(() => doc.getCreationDate()), modified: pickDate(() => doc.getModificationDate()),
  };
  if (encrypted) notes.push("This PDF is password-protected, so its properties are scrambled. Remove the password first (Unlock PDF), then check it again.");
  const hasXmp = doc.catalog.has(PDFName.of("Metadata"));
  const pages = doc.getPageCount();
  const p0 = pages ? doc.getPage(0).getSize() : null;
  const mm = (n: number) => Math.round((n / 72) * 25.4);
  const facts: Row[] = [
    { label: "Pages", value: String(pages) },
    ...(p0 ? [{ label: "Page size", value: `${mm(p0.width)} × ${mm(p0.height)} mm` }] : []),
    { label: "PDF version", value: version || "unknown" },
    { label: "Password-protected", value: encrypted ? "Yes" : "No" },
    { label: "Embedded XMP metadata", value: hasXmp ? "Yes — a second, richer copy of the properties" : "No" },
  ];
  const trailerInfo = doc.context.lookup(doc.context.trailerInfo.Info);
  const custom: Row[] = [];
  if (trailerInfo instanceof PDFDict) {
    const standard = new Set(["Title", "Author", "Subject", "Keywords", "Creator", "Producer", "CreationDate", "ModDate", "Trapped"]);
    for (const [k] of trailerInfo.entries()) {
      const name = k.decodeText?.() ?? String(k).replace(/^\//, "");
      if (standard.has(name)) continue;
      try { const v = (trailerInfo.lookup(k) as any)?.decodeText?.() ?? String((trailerInfo.lookup(k) as any) ?? ""); if (v) custom.push({ label: name, value: v }); } catch { /* skip */ }
    }
  }
  if (custom.length) facts.push(...custom);
  if (info && !info.producer && !info.creator) notes.push("No “made with” information is stored — the program that made it left it blank, or someone removed it.");
  return {
    kind: "pdf", typeLabel: "PDF document", editable: !encrypted, notes, facts,
    madeWith: info ? [{ label: "Created with (Creator)", value: info.creator }, { label: "PDF produced by (Producer)", value: info.producer }] : [],
    fields: info ? [
      { key: "title", label: "Title", value: info.title }, { key: "author", label: "Author", value: info.author },
      { key: "subject", label: "Subject", value: info.subject }, { key: "keywords", label: "Keywords", value: info.keywords, hint: "Separate with commas" },
      { key: "creator", label: "Creator", value: info.creator, hint: "The program the content was written in, e.g. Word" },
      { key: "producer", label: "Producer", value: info.producer, hint: "The program that made the PDF file, e.g. Skia/PDF" },
      { key: "created", label: "Created", value: info.created, kind: "date" }, { key: "modified", label: "Modified", value: info.modified, kind: "date" },
    ] : [],
  };
}

async function writePdf(file: File, vals: Partial<Record<EditKey, string>>, strip: boolean): Promise<Blob> {
  const { PDFName } = await import("pdf-lib");
  const doc = await loadPdfLib(file, { lenient: false });
  if (strip) {
    const info = doc.context.lookup(doc.context.trailerInfo.Info) as any;
    if (info?.keys) for (const k of [...info.keys()]) info.delete(k);
    doc.catalog.delete(PDFName.of("Metadata"));
  } else {
    const d = (s?: string) => (s ? new Date(s) : undefined);
    if (vals.title !== undefined) doc.setTitle(vals.title);
    if (vals.author !== undefined) doc.setAuthor(vals.author);
    if (vals.subject !== undefined) doc.setSubject(vals.subject);
    if (vals.keywords !== undefined) doc.setKeywords(vals.keywords.split(",").map((s) => s.trim()).filter(Boolean));
    if (vals.creator !== undefined) doc.setCreator(vals.creator);
    if (vals.producer !== undefined) doc.setProducer(vals.producer);
    const c = d(vals.created), m = d(vals.modified);
    if (c && !isNaN(+c)) doc.setCreationDate(c);
    if (m && !isNaN(+m)) doc.setModificationDate(m);
    // The old embedded XMP copy would contradict the new values, so drop it.
    doc.catalog.delete(PDFName.of("Metadata"));
  }
  const bytes = await doc.save({ useObjectStreams: false });
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}

/* ───────────── Office (docx / xlsx / pptx) ───────────── */

const CORE = "docProps/core.xml", APP = "docProps/app.xml";
const CORE_EMPTY = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"></cp:coreProperties>`;
const APP_EMPTY = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"></Properties>`;

async function readOffice(file: File): Promise<MetaInfo> {
  const JSZip = (await import("jszip")).default;
  let zip: any;
  try { zip = await JSZip.loadAsync(await file.arrayBuffer()); } catch { throw new UserError(`“${file.name}” isn’t a valid Office file. Only the modern formats (.docx, .xlsx, .pptx) are supported.`); }
  const core = (await zip.file(CORE)?.async("string")) ?? "";
  const app = (await zip.file(APP)?.async("string")) ?? "";
  const t = typeOfFile(file);
  const c = (tag: string) => tagValue(core, tag), a = (tag: string) => tagValue(app, tag);
  const notes: string[] = [];
  if (!core && !app) notes.push("This file has no properties stored. You can add some below.");
  const facts: Row[] = [];
  const fact = (label: string, v: string, warn?: boolean) => { if (v) facts.push({ label, value: v, warn }); };
  fact("Program version", a("AppVersion")); fact("Template", a("Template")); fact("Manager", a("Manager")); fact("Category", c("cp:category")); fact("Comments", c("dc:description"));
  fact("Revision", c("cp:revision")); fact("Editing time", a("TotalTime") ? `${a("TotalTime")} min` : "");
  fact("Pages", a("Pages")); fact("Words", a("Words")); fact("Characters", a("Characters")); fact("Slides", a("Slides")); fact("Last printed", niceDate(c("cp:lastPrinted")));
  if (zip.file("docProps/custom.xml")) facts.push({ label: "Custom properties", value: "Yes (stored in docProps/custom.xml)" });
  if (zip.file("word/comments.xml")) facts.push({ label: "Comments in the text", value: "Yes", warn: true });
  if (zip.file("word/document.xml") && /<w:(ins|del) /.test((await zip.file("word/document.xml")!.async("string")).slice(0, 4_000_000))) facts.push({ label: "Tracked changes", value: "Yes — visible history of edits", warn: true });
  return {
    kind: "office", typeLabel: t === "docx" ? "Word document" : t === "xlsx" ? "Excel workbook" : "PowerPoint presentation", editable: true, notes, facts,
    madeWith: [{ label: "Created with (Application)", value: [a("Application"), a("AppVersion") && `v${a("AppVersion")}`].filter(Boolean).join(" ") }],
    fields: [
      { key: "title", label: "Title", value: c("dc:title") }, { key: "author", label: "Author", value: c("dc:creator") },
      { key: "lastModifiedBy", label: "Last modified by", value: c("cp:lastModifiedBy") }, { key: "subject", label: "Subject", value: c("dc:subject") },
      { key: "keywords", label: "Keywords", value: c("cp:keywords") }, { key: "company", label: "Company", value: a("Company") },
      { key: "created", label: "Created", value: c("dcterms:created"), kind: "date" }, { key: "modified", label: "Modified", value: c("dcterms:modified"), kind: "date" },
    ],
  };
}

async function writeOffice(file: File, vals: Partial<Record<EditKey, string>>, strip: boolean): Promise<Blob> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  let core = (await zip.file(CORE)?.async("string")) ?? "";
  let app = (await zip.file(APP)?.async("string")) ?? "";
  if (!core) {
    core = CORE_EMPTY;
    zip.file(CORE, core);
    const ct = await zip.file("[Content_Types].xml")?.async("string");
    if (ct && !ct.includes("/docProps/core.xml")) zip.file("[Content_Types].xml", ct.replace("</Types>", `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`));
    const rels = await zip.file("_rels/.rels")?.async("string");
    if (rels && !rels.includes("core-properties")) zip.file("_rels/.rels", rels.replace("</Relationships>", `<Relationship Id="rIdCore" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`));
  }
  if (!app) app = APP_EMPTY;
  const W3C = ` xsi:type="dcterms:W3CDTF"`;
  if (strip) {
    for (const t of ["dc:title", "dc:creator", "cp:lastModifiedBy", "dc:subject", "cp:keywords", "dc:description", "cp:category", "cp:lastPrinted", "cp:contentStatus"]) core = setTag(core, t, "");
    core = setTag(core, "dcterms:created", "", W3C); core = setTag(core, "dcterms:modified", "", W3C);
    for (const t of ["Company", "Manager", "Template", "TotalTime", "HyperlinkBase"]) app = setTag(app, t, "");
    zip.remove("docProps/custom.xml");
    const ct = await zip.file("[Content_Types].xml")?.async("string");
    if (ct) zip.file("[Content_Types].xml", ct.replace(/<Override[^>]*custom\.xml[^>]*\/>/g, ""));
    const rels = await zip.file("_rels/.rels")?.async("string");
    if (rels) zip.file("_rels/.rels", rels.replace(/<Relationship\b[^>]*custom-properties[^>]*\/>/g, ""));
    zip.remove("docProps/thumbnail.jpeg");
  } else {
    const m: [EditKey, string][] = [["title", "dc:title"], ["author", "dc:creator"], ["lastModifiedBy", "cp:lastModifiedBy"], ["subject", "dc:subject"], ["keywords", "cp:keywords"]];
    for (const [k, tag] of m) if (vals[k] !== undefined) core = setTag(core, tag, vals[k]!);
    if (vals.created !== undefined) core = setTag(core, "dcterms:created", vals.created, W3C);
    if (vals.modified !== undefined) core = setTag(core, "dcterms:modified", vals.modified, W3C);
    if (vals.company !== undefined) app = setTag(app, "Company", vals.company);
  }
  zip.file(CORE, core);
  zip.file(APP, app);
  const t = typeOfFile(file)!;
  return zip.generateAsync({ type: "blob", mimeType: t === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : t === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/vnd.openxmlformats-officedocument.presentationml.presentation", compression: "DEFLATE" });
}

/* ───────────── JPG (EXIF) ───────────── */

type Seg = { marker: number; start: number; end: number };
function jpegSegments(b: Uint8Array): Seg[] {
  const out: Seg[] = [];
  if (b[0] !== 0xff || b[1] !== 0xd8) return out;
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) break;
    const marker = b[i + 1];
    if (marker === 0xd9 || marker === 0xda) break;
    const len = (b[i + 2] << 8) | b[i + 3];
    out.push({ marker, start: i, end: i + 2 + len });
    i += 2 + len;
  }
  return out;
}

const TAGS: Record<number, string> = { 0x010e: "Description", 0x010f: "Camera make", 0x0110: "Camera model", 0x0131: "Software", 0x0132: "Date", 0x013b: "Artist", 0x8298: "Copyright", 0x9003: "Taken", 0xa434: "Lens", 0xa433: "Lens make", 0x829a: "Exposure", 0x829d: "Aperture", 0x8827: "ISO", 0x920a: "Focal length", 0xa002: "Width", 0xa003: "Height" };

function readExif(b: Uint8Array, seg: Seg) {
  const dv = new DataView(b.buffer, b.byteOffset + seg.start + 4);
  const base = 6; // after "Exif\0\0"
  const little = dv.getUint16(base) === 0x4949;
  const u16 = (o: number) => dv.getUint16(base + o, little), u32 = (o: number) => dv.getUint32(base + o, little);
  const vals: Record<string, string> = {};
  let gps: Record<number, number[]> = {};
  const latin = (o: number, n: number) => { let s = ""; for (let k = 0; k < n; k++) { const c = dv.getUint8(base + o + k); if (!c) break; s += String.fromCharCode(c); } return s.trim(); };
  const rat = (o: number) => { const d = u32(o + 4); return d ? u32(o) / d : 0; };
  const ifd = (off: number, kind: "main" | "exif" | "gps") => {
    const n = u16(off);
    for (let i = 0; i < n; i++) {
      const e = off + 2 + i * 12, tag = u16(e), type = u16(e + 2), count = u32(e + 4);
      const size = ({ 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 } as Record<number, number>)[type] ?? 1;
      const vo = size * count > 4 ? u32(e + 8) : e + 8;
      if (kind === "main" && tag === 0x8769) { ifd(u32(e + 8), "exif"); continue; }
      if (kind === "main" && tag === 0x8825) { ifd(u32(e + 8), "gps"); continue; }
      if (kind === "gps") { if (type === 5) gps[tag] = Array.from({ length: count }, (_, k) => rat(vo + k * 8)); else if (type === 2) gps[tag] = [latin(vo, count).charCodeAt(0)]; continue; }
      const name = TAGS[tag];
      if (!name) continue;
      let v = "";
      if (type === 2) v = latin(vo, count);
      else if (type === 3) v = String(u16(vo));
      else if (type === 4) v = String(u32(vo));
      else if (type === 5) { const r = rat(vo); v = tag === 0x829a ? (r && r < 1 ? `1/${Math.round(1 / r)} s` : `${r} s`) : tag === 0x829d ? `f/${r.toFixed(1)}` : tag === 0x920a ? `${r.toFixed(0)} mm` : String(r); }
      if (v) vals[name] = v;
    }
  };
  try { ifd(u32(4), "main"); } catch { /* truncated EXIF — show what we have */ }
  let where = "";
  const dms = (a?: number[]) => (a && a.length === 3 ? a[0] + a[1] / 60 + a[2] / 3600 : null);
  const la = dms(gps[2]), lo = dms(gps[4]);
  if (la !== null && lo !== null) where = `${((gps[1]?.[0] === 83 ? -1 : 1) * la).toFixed(5)}, ${((gps[3]?.[0] === 87 ? -1 : 1) * lo).toFixed(5)}`;
  return { vals, where };
}

async function readJpg(file: File): Promise<MetaInfo> {
  const b = new Uint8Array(await file.arrayBuffer());
  const segs = jpegSegments(b);
  if (!segs.length) throw new UserError(`“${file.name}” doesn’t look like a valid JPG.`);
  const isExif = (s: Seg) => s.marker === 0xe1 && b[s.start + 4] === 0x45 && b[s.start + 5] === 0x78 && b[s.start + 6] === 0x69 && b[s.start + 7] === 0x66;
  const exifSeg = segs.find(isExif);
  const hasXmp = segs.some((s) => s.marker === 0xe1 && !isExif(s));
  const hasIptc = segs.some((s) => s.marker === 0xed);
  const { vals, where } = exifSeg ? readExif(b, exifSeg) : { vals: {} as Record<string, string>, where: "" };
  const facts: Row[] = [];
  const f = (label: string, v?: string) => { if (v) facts.push({ label, value: v }); };
  f("Camera", [vals["Camera make"], vals["Camera model"]].filter(Boolean).join(" ")); f("Lens", vals.Lens);
  f("Taken", vals.Taken); f("Exposure", [vals.Exposure, vals.Aperture, vals.ISO && `ISO ${vals.ISO}`, vals["Focal length"]].filter(Boolean).join(" · "));
  f("Photographer", vals.Artist); f("Copyright", vals.Copyright); f("Description", vals.Description);
  if (where) facts.push({ label: "GPS location", value: where, warn: true });
  facts.push({ label: "EXIF data", value: exifSeg ? "Yes" : "No" }, { label: "XMP / IPTC data", value: hasXmp || hasIptc ? "Yes" : "No" });
  const notes = where ? ["This photo contains the exact GPS location where it was taken. Remove the metadata before sharing it publicly."] : exifSeg ? [] : ["No camera information is stored in this photo."];
  return { kind: "jpg", typeLabel: "JPG photo", editable: false, notes, facts, fields: [], madeWith: [{ label: "Software", value: vals.Software ?? "" }, { label: "Camera", value: [vals["Camera make"], vals["Camera model"]].filter(Boolean).join(" ") }] };
}

/** Lossless: copies the photo bytes untouched, dropping only the EXIF / XMP / IPTC / comment blocks. */
async function stripJpg(file: File): Promise<Blob> {
  const b = new Uint8Array(await file.arrayBuffer());
  const drop = new Set<number>();
  const segs = jpegSegments(b);
  segs.forEach((s, i) => { if (s.marker === 0xe1 || s.marker === 0xed || s.marker === 0xfe) drop.add(i); });
  const parts: Uint8Array[] = [];
  let pos = 0;
  segs.forEach((s, i) => { if (drop.has(i)) { parts.push(b.subarray(pos, s.start)); pos = s.end; } });
  parts.push(b.subarray(pos));
  return new Blob(parts as BlobPart[], { type: "image/jpeg" });
}

/* ───────────── public API ───────────── */

export async function readMeta(file: File): Promise<MetaInfo> {
  const k = kindOf(file);
  if (k === "pdf") return readPdf(file);
  if (k === "office") return readOffice(file);
  if (k === "jpg") return readJpg(file);
  throw new UserError("That file type isn’t supported yet. Use a PDF, a Word / Excel / PowerPoint file (.docx .xlsx .pptx) or a JPG photo.");
}

export async function writeMeta(file: File, vals: Partial<Record<EditKey, string>>): Promise<Blob> {
  const k = kindOf(file);
  if (k === "pdf") return writePdf(file, vals, false);
  if (k === "office") return writeOffice(file, vals, false);
  throw new UserError("Only PDFs and Office files can be edited field by field. For photos, use “Remove all metadata”.");
}

export async function stripMeta(file: File): Promise<Blob> {
  const k = kindOf(file);
  if (k === "pdf") return writePdf(file, {}, true);
  if (k === "office") return writeOffice(file, {}, true);
  if (k === "jpg") return stripJpg(file);
  throw new UserError("That file type isn’t supported yet.");
}

const stem = (n: string) => n.replace(/\.[^.]+$/, "");
const ext = (n: string) => n.split(".").pop() ?? "";

/** Tool runner (for Recipes and the palette): removes all metadata from every file. */
export async function stripAll(files: File[], ctx: Ctx): Promise<Result> {
  const outs = [];
  let before = 0, after = 0;
  for (let i = 0; i < files.length; i++) {
    ctx.progress(i / files.length, files[i].name);
    const blob = await stripMeta(files[i]);
    before += files[i].size; after += blob.size;
    outs.push({ name: `${stem(files[i].name)}-clean.${ext(files[i].name)}`, blob });
  }
  return { files: outs, before, after, note: "All properties, author names, timestamps and hidden metadata were removed." };
}
