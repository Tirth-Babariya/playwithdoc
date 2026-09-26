import type { PDFDocument, PDFFont, PDFPage } from "pdf-lib";
import { baseName } from "../formats";
import type { Ctx, Result } from "../types";
import { mammoth, pdfBlob, sheetjs, tick, UserError } from "./common";

type PdfLib = typeof import("pdf-lib");
type Run = { t: string; b?: boolean; i?: boolean; mono?: boolean };
type Family = "sans" | "serif" | "mono";
type Tok = { s: string; f: PDFFont; w: number; space?: boolean; br?: boolean };

const PAGES: Record<string, [number, number]> = { a4: [595.28, 841.89], letter: [612, 792] };

/** A tiny flowing-text layout engine on top of pdf-lib's standard fonts. */
class Writer {
  page!: PDFPage;
  y = 0;
  indent = 0;
  private fonts: Record<string, PDFFont> = {};
  private ok = new Map<PDFFont, Map<string, string>>();

  private constructor(private lib: PdfLib, readonly doc: PDFDocument, readonly W: number, readonly H: number, readonly m: number, private family: Family) {}

  static async create(opts: { size?: string; margin?: number; landscape?: boolean; family?: Family }) {
    const lib = await import("pdf-lib");
    const doc = await lib.PDFDocument.create();
    let [W, H] = PAGES[opts.size || "a4"] ?? PAGES.a4;
    if (opts.landscape) [W, H] = [H, W];
    const w = new Writer(lib, doc, W, H, opts.margin ?? 56, opts.family ?? "sans");
    const F = lib.StandardFonts;
    const map = {
      sans: [F.Helvetica, F.HelveticaBold, F.HelveticaOblique, F.HelveticaBoldOblique],
      serif: [F.TimesRoman, F.TimesRomanBold, F.TimesRomanItalic, F.TimesRomanBoldItalic],
      mono: [F.Courier, F.CourierBold, F.CourierOblique, F.CourierBoldOblique],
    };
    for (const fam of Object.keys(map) as Family[]) {
      const [r, b, i, bi] = map[fam];
      w.fonts[`${fam}`] = await doc.embedFont(r);
      w.fonts[`${fam}-b`] = await doc.embedFont(b);
      w.fonts[`${fam}-i`] = await doc.embedFont(i);
      w.fonts[`${fam}-bi`] = await doc.embedFont(bi);
    }
    w.newPage();
    return w;
  }

  get width() { return this.W - this.m * 2; }
  newPage() { this.page = this.doc.addPage([this.W, this.H]); this.y = this.H - this.m; }
  font(r: { b?: boolean; i?: boolean; mono?: boolean }, family?: Family) {
    const fam = r.mono ? "mono" : family ?? this.family;
    return this.fonts[`${fam}${r.b || r.i ? "-" : ""}${r.b ? "b" : ""}${r.i ? "i" : ""}`];
  }

  clean(s: string, f: PDFFont): string {
    let cache = this.ok.get(f);
    if (!cache) this.ok.set(f, (cache = new Map()));
    let out = "";
    for (const ch of s.replace(/\t/g, "    ").replace(/ /g, " ")) {
      let r = cache.get(ch);
      if (r === undefined) { try { f.encodeText(ch); r = ch; } catch { r = "?"; } cache.set(ch, r); }
      out += r;
    }
    return out;
  }

  private tokenize(runs: Run[], size: number, family?: Family): Tok[] {
    const toks: Tok[] = [];
    for (const r of runs) {
      const f = this.font(r, family);
      for (const part of r.t.split(/(\n|[ \t]+)/)) {
        if (!part) continue;
        if (part === "\n") toks.push({ s: "", f, w: 0, br: true });
        else if (/^[ \t]+$/.test(part)) { const s = this.clean(part, f); toks.push({ s, f, w: f.widthOfTextAtSize(s, size), space: true }); }
        else { const s = this.clean(part, f); toks.push({ s, f, w: f.widthOfTextAtSize(s, size) }); }
      }
    }
    return toks;
  }

  para(runs: Run[], o: { size?: number; lead?: number; before?: number; after?: number; bullet?: string; keepSpaces?: boolean; family?: Family; gray?: number } = {}) {
    const size = o.size ?? 11, lead = size * (o.lead ?? 1.4);
    const x0 = this.m + this.indent + (o.bullet ? 16 : 0);
    const maxW = this.W - this.m - x0;
    const toks = this.tokenize(runs, size, o.family);
    const lines: Tok[][] = [[]];
    let lw = 0;
    const push = (t: Tok) => { lines[lines.length - 1].push(t); lw += t.w; };
    const brk = () => { lines.push([]); lw = 0; };
    for (const t of toks) {
      if (t.br) { brk(); continue; }
      if (t.space) { if (lw > 0 || o.keepSpaces) push(t); continue; }
      if (lw + t.w > maxW && lw > 0) {
        while (lines[lines.length - 1].at(-1)?.space) { lw -= lines[lines.length - 1].pop()!.w; }
        brk();
      }
      if (t.w > maxW) {
        let chunk = "";
        for (const ch of t.s) {
          if (t.f.widthOfTextAtSize(chunk + ch, size) > maxW && chunk) { push({ s: chunk, f: t.f, w: t.f.widthOfTextAtSize(chunk, size) }); brk(); chunk = ""; }
          chunk += ch;
        }
        if (chunk) push({ s: chunk, f: t.f, w: t.f.widthOfTextAtSize(chunk, size) });
      } else push(t);
    }
    if (o.before && this.y < this.H - this.m - 1) this.y -= o.before;
    const gray = o.gray ?? 0.08;
    const color = this.lib.rgb(gray, gray, gray);
    lines.forEach((line, li) => {
      if (this.y - lead < this.m) this.newPage();
      this.y -= lead;
      if (li === 0 && o.bullet) this.page.drawText(this.clean(o.bullet, this.font({}, o.family)), { x: x0 - 16, y: this.y + size * 0.22, size, font: this.font({}, o.family), color });
      let x = x0;
      for (const t of line) {
        if (!t.space && t.s) this.page.drawText(t.s, { x, y: this.y + size * 0.22, size, font: t.f, color });
        x += t.w;
      }
    });
    this.y -= o.after ?? 0;
  }

  rule() {
    if (this.y - 12 < this.m) this.newPage();
    this.y -= 6;
    this.page.drawLine({ start: { x: this.m, y: this.y }, end: { x: this.W - this.m, y: this.y }, thickness: 0.6, color: this.lib.rgb(0.75, 0.75, 0.75) });
    this.y -= 8;
  }

  async image(bytes: Uint8Array, kind: "png" | "jpg") {
    let img;
    try { img = kind === "png" ? await this.doc.embedPng(bytes) : await this.doc.embedJpg(bytes); } catch { return; }
    const maxW = this.width - this.indent, maxH = this.H - this.m * 2;
    const k = Math.min(1, maxW / img.width, maxH / img.height);
    const w = img.width * k, h = img.height * k;
    if (this.y - h < this.m) this.newPage();
    this.page.drawImage(img, { x: this.m + this.indent, y: this.y - h, width: w, height: h });
    this.y -= h + 8;
  }

  private wrap(text: string, f: PDFFont, size: number, maxW: number): string[] {
    const out: string[] = [];
    let cur = "";
    for (const word of this.clean(text, f).split(/\s+/).filter(Boolean)) {
      const trial = cur ? `${cur} ${word}` : word;
      if (f.widthOfTextAtSize(trial, size) <= maxW) { cur = trial; continue; }
      if (cur) out.push(cur);
      cur = "";
      let chunk = "";
      for (const ch of word) {
        if (f.widthOfTextAtSize(chunk + ch, size) > maxW && chunk) { out.push(chunk); chunk = ""; }
        chunk += ch;
      }
      cur = chunk;
    }
    if (cur) out.push(cur);
    return out.length ? out : [""];
  }

  table(rows: string[][], colW: number[], size: number, header: boolean) {
    const pad = 3, lead = size * 1.3;
    const { rgb } = this.lib;
    rows.forEach((row, ri) => {
      const head = header && ri === 0;
      const f = this.font({ b: head });
      const cells = colW.map((w, ci) => this.wrap(row[ci] ?? "", f, size, w - pad * 2));
      const h = Math.max(...cells.map((c) => c.length)) * lead + pad * 2;
      if (this.y - h < this.m) this.newPage();
      let x = this.m;
      colW.forEach((w, ci) => {
        this.page.drawRectangle({ x, y: this.y - h, width: w, height: h, borderColor: rgb(0.78, 0.78, 0.78), borderWidth: 0.5, color: head ? rgb(0.93, 0.93, 0.95) : undefined });
        cells[ci].forEach((ln, li) => this.page.drawText(ln, { x: x + pad, y: this.y - pad - (li + 1) * lead + size * 0.28, size, font: f, color: rgb(0.1, 0.1, 0.1) }));
        x += w;
      });
      this.y -= h;
    });
    this.y -= 10;
  }

  async save() { return this.doc.save({ useObjectStreams: true }); }
}

/* ---------- HTML → PDF ---------- */

const BLOCK = new Set(["P", "DIV", "SECTION", "ARTICLE", "HEADER", "FOOTER", "MAIN", "NAV", "ASIDE", "UL", "OL", "LI", "TABLE", "PRE", "BLOCKQUOTE", "H1", "H2", "H3", "H4", "H5", "H6", "HR", "FIGURE", "FORM", "DETAILS", "DL", "DT", "DD"]);
const SKIP = new Set(["SCRIPT", "STYLE", "HEAD", "NOSCRIPT", "SVG", "IFRAME", "CANVAS", "TEMPLATE"]);
const HEAD_SIZE: Record<string, number> = { H1: 22, H2: 18, H3: 15, H4: 13, H5: 12, H6: 11 };

function runsOf(nodes: Node[], style: { b?: boolean; i?: boolean; mono?: boolean } = {}): Run[] {
  const out: Run[] = [];
  for (const n of nodes) {
    if (n.nodeType === 3) {
      const t = (n.textContent || "").replace(/\s+/g, " ");
      if (t) out.push({ t, ...style });
    } else if (n.nodeType === 1) {
      const el = n as Element, tag = el.tagName;
      if (SKIP.has(tag) || tag === "IMG") continue;
      if (tag === "BR") out.push({ t: "\n", ...style });
      else out.push(...runsOf([...el.childNodes], { b: style.b || tag === "STRONG" || tag === "B" || tag === "TH", i: style.i || tag === "EM" || tag === "I", mono: style.mono || tag === "CODE" || tag === "KBD" || tag === "SAMP" }));
    }
  }
  return out;
}

function trimRuns(runs: Run[]): Run[] {
  if (runs.length) { runs[0] = { ...runs[0], t: runs[0].t.replace(/^\s+/, "") }; runs[runs.length - 1] = { ...runs[runs.length - 1], t: runs[runs.length - 1].t.replace(/\s+$/, "") }; }
  return runs.filter((r) => r.t);
}

function dataImages(nodes: Node[]): { bytes: Uint8Array; kind: "png" | "jpg" }[] {
  const out: { bytes: Uint8Array; kind: "png" | "jpg" }[] = [];
  const visit = (n: Node) => {
    if (n.nodeType !== 1) return;
    const el = n as Element;
    if (el.tagName === "IMG") {
      const m = /^data:image\/(png|jpe?g);base64,(.+)$/i.exec(el.getAttribute("src") || "");
      if (m) {
        const bin = atob(m[2]);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        out.push({ bytes, kind: m[1].toLowerCase() === "png" ? "png" : "jpg" });
      }
    } else el.childNodes.forEach(visit);
  };
  nodes.forEach(visit);
  return out;
}

async function flushInline(w: Writer, buf: Node[], o: { size?: number; b?: boolean } = {}) {
  const runs = trimRuns(runsOf(buf, { b: o.b }));
  if (runs.some((r) => r.t.trim())) w.para(runs, { size: o.size ?? 11, after: 7 });
  for (const im of dataImages(buf)) await w.image(im.bytes, im.kind);
  buf.length = 0;
}

async function walk(w: Writer, parent: Node) {
  const buf: Node[] = [];
  for (const n of [...parent.childNodes]) {
    if (n.nodeType === 1) {
      const el = n as Element, tag = el.tagName;
      if (SKIP.has(tag)) continue;
      if (BLOCK.has(tag)) {
        await flushInline(w, buf);
        await block(w, el);
        continue;
      }
    }
    buf.push(n);
  }
  await flushInline(w, buf);
}

async function list(w: Writer, el: Element, depth: number) {
  let n = 0;
  const ordered = el.tagName === "OL";
  for (const li of [...el.children]) {
    if (li.tagName !== "LI") continue;
    n++;
    const inline: Node[] = [], nested: Element[] = [];
    li.childNodes.forEach((c) => { if (c.nodeType === 1 && (c as Element).tagName.match(/^[UO]L$/)) nested.push(c as Element); else inline.push(c); });
    const runs = trimRuns(runsOf(inline));
    const saved = w.indent;
    w.indent = saved + depth * 16;
    if (runs.length) w.para(runs, { bullet: ordered ? `${n}.` : "•", after: 3 });
    for (const im of dataImages(inline)) await w.image(im.bytes, im.kind);
    w.indent = saved;
    for (const s of nested) await list(w, s, depth + 1);
  }
  w.y -= 4;
}

async function block(w: Writer, el: Element) {
  const tag = el.tagName;
  if (HEAD_SIZE[tag]) {
    const runs = trimRuns(runsOf([...el.childNodes], { b: true }));
    if (runs.length) w.para(runs, { size: HEAD_SIZE[tag], before: 8, after: 6, lead: 1.25 });
    for (const im of dataImages([...el.childNodes])) await w.image(im.bytes, im.kind);
  } else if (tag === "UL" || tag === "OL") await list(w, el, 0);
  else if (tag === "HR") w.rule();
  else if (tag === "PRE") {
    w.para([{ t: (el.textContent || "").replace(/\n$/, ""), mono: true }], { size: 9, keepSpaces: true, after: 8, lead: 1.3 });
  } else if (tag === "TABLE") {
    const rows = [...el.querySelectorAll("tr")].map((tr) => [...tr.children].filter((c) => /^(TD|TH)$/.test(c.tagName)).map((c) => (c.textContent || "").replace(/\s+/g, " ").trim()));
    const cols = Math.max(0, ...rows.map((r) => r.length));
    if (cols) {
      const colW = Array(cols).fill(w.width / cols);
      w.table(rows, colW, cols > 6 ? 7.5 : 9.5, !!el.querySelector("th"));
    }
  } else if (tag === "BLOCKQUOTE") {
    const s = w.indent; w.indent += 18; await walk(w, el); w.indent = s;
  } else if (tag === "P" || tag === "LI" || tag === "DT" || tag === "DD") {
    await flushInline(w, [...el.childNodes].filter((c) => !(c.nodeType === 1 && BLOCK.has((c as Element).tagName))));
    for (const c of [...el.children]) if (BLOCK.has(c.tagName)) await block(w, c);
  } else await walk(w, el);
}

export async function htmlToDoc(html: string, ctx: Ctx): Promise<Uint8Array> {
  const dom = new DOMParser().parseFromString(html, "text/html");
  const w = await Writer.create({ size: ctx.opts.size, margin: +ctx.opts.margin || 56, family: "sans" });
  await walk(w, dom.body);
  return w.save();
}

export async function wordToPdf(files: File[], ctx: Ctx): Promise<Result> {
  const m = await mammoth();
  const outs = [];
  for (let i = 0; i < files.length; i++) {
    ctx.progress(i / files.length, `Converting ${files[i].name}`);
    let html: string;
    try {
      html = (await m.convertToHtml({ arrayBuffer: await files[i].arrayBuffer() })).value;
    } catch { throw new UserError(`"${files[i].name}" isn't a valid .docx file. For old .doc files, re-save as .docx in Word first.`); }
    if (!html.trim()) throw new UserError(`"${files[i].name}" appears to be empty.`);
    const bytes = await htmlToDoc(html, ctx);
    outs.push({ name: `${baseName(files[i].name)}.pdf`, blob: pdfBlob(bytes) });
    await tick();
  }
  return { files: outs, note: "Text, headings, lists, tables and images are converted. Fonts and complex page layouts are simplified." };
}

export async function htmlFileToPdf(files: File[], ctx: Ctx): Promise<Result> {
  const outs = [];
  for (let i = 0; i < files.length; i++) {
    ctx.progress(i / files.length, `Converting ${files[i].name}`);
    const bytes = await htmlToDoc(await files[i].text(), ctx);
    outs.push({ name: `${baseName(files[i].name)}.pdf`, blob: pdfBlob(bytes) });
  }
  return { files: outs, note: "Renders the HTML structure (headings, text, lists, tables, embedded images). Scripts and external CSS aren't executed." };
}

export async function textToPdf(files: File[], ctx: Ctx): Promise<Result> {
  const family = (ctx.opts.font || "mono") as Family;
  const size = +ctx.opts.fontSize || 10.5;
  const outs = [];
  for (let i = 0; i < files.length; i++) {
    ctx.progress(i / files.length, `Converting ${files[i].name}`);
    const w = await Writer.create({ size: ctx.opts.size, margin: 56, family });
    const text = (await files[i].text()).replace(/\r\n?/g, "\n");
    for (const line of text.split("\n")) w.para([{ t: line || " " }], { size, keepSpaces: true, lead: 1.35, family });
    outs.push({ name: `${baseName(files[i].name)}.pdf`, blob: pdfBlob(await w.save()) });
    await tick();
  }
  return { files: outs };
}

export async function excelToPdf(files: File[], ctx: Ctx): Promise<Result> {
  const X = await sheetjs();
  const outs = [];
  for (let i = 0; i < files.length; i++) {
    ctx.progress(i / files.length, `Converting ${files[i].name}`);
    let wb;
    try { wb = X.read(await files[i].arrayBuffer(), { type: "array" }); } catch { throw new UserError(`"${files[i].name}" couldn't be read as a spreadsheet.`); }
    const sheets = wb.SheetNames.map((n: string) => ({ n, rows: X.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: false, defval: "" }) as string[][] })).filter((s: any) => s.rows.length);
    if (!sheets.length) throw new UserError(`"${files[i].name}" has no data.`);
    const maxCols = Math.max(...sheets.map((s: any) => Math.max(...s.rows.map((r: any[]) => r.length))));
    const w = await Writer.create({ size: ctx.opts.size, margin: 36, landscape: ctx.opts.orient === "landscape" || (ctx.opts.orient !== "portrait" && maxCols > 6) });
    sheets.forEach((s: any, si: number) => {
      if (si > 0) w.newPage();
      if (sheets.length > 1) w.para([{ t: s.n, b: true }], { size: 13, after: 6 });
      const cols = Math.max(...s.rows.map((r: any[]) => r.length));
      const want = Array.from({ length: cols }, (_, c) => Math.min(40, Math.max(5, ...s.rows.slice(0, 300).map((r: any[]) => String(r[c] ?? "").length))));
      const sum = want.reduce((a: number, b: number) => a + b, 0);
      const colW = want.map((x: number) => (x / sum) * w.width);
      w.table(s.rows.map((r: any[]) => r.map((c) => String(c ?? ""))), colW, cols > 14 ? 6 : cols > 8 ? 7 : 9, true);
    });
    outs.push({ name: `${baseName(files[i].name)}.pdf`, blob: pdfBlob(await w.save()) });
    await tick();
  }
  return { files: outs, note: "Each sheet becomes a table on its own page(s). Charts and cell styling aren't included." };
}
