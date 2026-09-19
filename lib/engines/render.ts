import { baseName } from "../formats";
import type { Ctx, Result } from "../types";
import { canvasBlob, makeCanvas, openPdfJs, parsePages, tick, UserError } from "./common";

export async function pdfToImages(files: File[], ctx: Ctx, target: "jpg" | "png"): Promise<Result> {
  const scale = (+ctx.opts.dpi || 150) / 72;
  const outs = [];
  for (let f = 0; f < files.length; f++) {
    const pdf = await openPdfJs(files[f]);
    const pageList = String(ctx.opts.pages || "").trim() ? parsePages(String(ctx.opts.pages), pdf.numPages) : Array.from({ length: pdf.numPages }, (_, i) => i);
    const stem = baseName(files[f].name);
    for (let k = 0; k < pageList.length; k++) {
      ctx.progress((f + k / pageList.length) / files.length, `Rendering page ${pageList[k] + 1}`);
      const page = await pdf.getPage(pageList[k] + 1);
      const vp = page.getViewport({ scale });
      const c = makeCanvas(vp.width, vp.height);
      const g = c.getContext("2d")!;
      if (target === "jpg") { g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); }
      await page.render({ canvasContext: g, viewport: vp }).promise;
      const blob = await canvasBlob(c, target === "jpg" ? "image/jpeg" : "image/png", 0.92);
      const pad = String(pdf.numPages).length;
      outs.push({ name: `${stem}${pdf.numPages > 1 || pageList.length > 1 ? `-${String(pageList[k] + 1).padStart(pad, "0")}` : ""}.${target}`, blob });
      c.width = c.height = 0;
      page.cleanup();
      await tick();
    }
    await pdf.destroy();
  }
  return { files: outs };
}

export type Line = { text: string; size: number; gap: boolean; bold: boolean };

/** Reads a PDF's text layer into lines with rough font size and paragraph-gap info. */
export async function extractLines(file: File, ctx: Ctx): Promise<Line[][]> {
  const pdf = await openPdfJs(file);
  const pages: Line[][] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    ctx.progress((p - 1) / pdf.numPages, `Reading page ${p} of ${pdf.numPages}`);
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    const lines: Line[] = [];
    let cur = "", curY: number | null = null, curSize = 0, lastY: number | null = null, lastSize = 0, gap = false, bold = false;
    const flush = () => {
      const t = cur.replace(/\s+$/g, "");
      if (t.trim()) {
        lines.push({ text: t, size: curSize, gap, bold });
        lastY = curY; lastSize = curSize;
      }
      cur = ""; gap = false; bold = false;
    };
    for (const it of tc.items as any[]) {
      if (typeof it.str !== "string") continue;
      const y = it.transform[5];
      const size = Math.hypot(it.transform[0], it.transform[1]) || it.height || 10;
      if (curY !== null && Math.abs(y - curY) > Math.max(size, curSize) * 0.55) {
        flush();
      }
      if (!cur) {
        curY = y; curSize = size;
        gap = lastY !== null && lastY - y > Math.max(size, lastSize) * 1.65;
      }
      cur += it.str;
      const fn = String((tc.styles?.[it.fontName]?.fontFamily) ?? it.fontName ?? "");
      if (/bold|black|heavy/i.test(fn)) bold = true;
      if (it.hasEOL) flush();
    }
    flush();
    pages.push(lines);
    page.cleanup();
    await tick();
  }
  await pdf.destroy();
  return pages;
}

function requireText(pages: Line[][]) {
  const chars = pages.reduce((n, p) => n + p.reduce((m, l) => m + l.text.length, 0), 0);
  if (chars < 8) throw new UserError("No selectable text found — this looks like a scanned PDF. OCR support is on the roadmap.");
}

export async function pdfToText(files: File[], ctx: Ctx): Promise<Result> {
  const outs = [];
  for (const f of files) {
    const pages = await extractLines(f, ctx);
    requireText(pages);
    const txt = pages.map((p) => p.map((l) => (l.gap ? "\n" : "") + l.text).join("\n")).join("\n\n\f\n");
    outs.push({ name: `${baseName(f.name)}.txt`, blob: new Blob([txt], { type: "text/plain;charset=utf-8" }) });
  }
  return { files: outs };
}

function bodySize(pages: Line[][]): number {
  const sizes = pages.flat().map((l) => Math.round(l.size * 2) / 2).sort((a, b) => a - b);
  return sizes[Math.floor(sizes.length / 2)] || 10;
}

export async function pdfToMarkdown(files: File[], ctx: Ctx): Promise<Result> {
  const outs = [];
  for (const f of files) {
    const pages = await extractLines(f, ctx);
    requireText(pages);
    const body = bodySize(pages);
    const md: string[] = [];
    for (const p of pages) {
      for (const l of p) {
        const r = l.size / body;
        let t = l.text.trim();
        if (l.gap && md.length) md.push("");
        if (r >= 1.7) t = `# ${t}`;
        else if (r >= 1.35) t = `## ${t}`;
        else if (r >= 1.12 || (l.bold && t.length < 80 && l.gap)) t = `### ${t}`;
        else if (/^[•●▪◦‣·]\s*/.test(t)) t = t.replace(/^[•●▪◦‣·]\s*/, "- ");
        md.push(t);
      }
      md.push("");
    }
    outs.push({ name: `${baseName(f.name)}.md`, blob: new Blob([md.join("\n").replace(/\n{3,}/g, "\n\n")], { type: "text/markdown;charset=utf-8" }) });
  }
  return { files: outs };
}

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!)).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");

export async function pdfToWord(files: File[], ctx: Ctx): Promise<Result> {
  const JSZip = (await import("jszip")).default;
  const outs = [];
  for (const f of files) {
    const pages = await extractLines(f, ctx);
    requireText(pages);
    const body = bodySize(pages);
    const paras: string[] = [];
    pages.forEach((lines, pi) => {
      let buf: string[] = [];
      let head: Line | null = null;
      const isHead = (l: Line) => l.size / body >= 1.2 && l.text.length < 120;
      const emit = () => {
        if (!buf.length) return;
        const text = esc(buf.join(" "));
        paras.push(head
          ? `<w:p><w:pPr><w:spacing w:before="200" w:after="80"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="${Math.round(head.size * 2)}"/></w:rPr><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`
          : `<w:p><w:pPr><w:spacing w:after="120"/></w:pPr><w:r><w:rPr><w:sz w:val="${Math.round(body * 2)}"/></w:rPr><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`);
        buf = []; head = null;
      };
      for (const l of lines) {
        const h = isHead(l);
        if (buf.length && (h !== !!head || l.gap || /^[•●▪◦‣·]\s/.test(l.text))) emit();
        if (h && !head) head = l;
        buf.push(l.text.trim());
      }
      emit();
      if (pi < pages.length - 1) paras.push(`<w:p><w:r><w:br w:type="page"/></w:r></w:p>`);
    });
    const zip = new JSZip();
    zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
    zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
    zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paras.join("")}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`);
    const blob = await zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", compression: "DEFLATE" });
    outs.push({ name: `${baseName(f.name)}.docx`, blob });
  }
  return { files: outs, note: "Text and headings are converted; complex layouts, tables and images are simplified." };
}
