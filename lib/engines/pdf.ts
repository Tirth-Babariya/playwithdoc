import { baseName } from "../formats";
import type { Ctx, Result } from "../types";
import { canvasBlob, loadPdfLib, makeCanvas, openPdfJs, parseGroups, parsePages, pdfBlob, tick, UserError } from "./common";

const total = (fs: File[]) => fs.reduce((n, f) => n + f.size, 0);

export async function mergePdf(files: File[], ctx: Ctx): Promise<Result> {
  if (files.length < 2) throw new UserError("Add at least two PDFs to merge.");
  const { PDFDocument } = await import("pdf-lib");
  const out = await PDFDocument.create();
  for (let i = 0; i < files.length; i++) {
    ctx.progress(i / files.length, `Merging ${files[i].name}`);
    const src = await loadPdfLib(files[i]);
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((p) => out.addPage(p));
    await tick();
  }
  const bytes = await out.save({ useObjectStreams: true });
  return { files: [{ name: "merged.pdf", blob: pdfBlob(bytes) }], before: total(files), after: bytes.length };
}

export async function splitPdf(files: File[], ctx: Ctx): Promise<Result> {
  const { PDFDocument } = await import("pdf-lib");
  const src = await loadPdfLib(files[0]);
  const n = src.getPageCount();
  const mode = ctx.opts.mode || "each";
  let groups: number[][];
  if (mode === "ranges") {
    groups = parseGroups(String(ctx.opts.ranges || ""), n);
    if (!groups.length) throw new UserError("Enter the page ranges to split, e.g. 1-3, 4-6.");
  } else if (mode === "chunks") {
    const size = Math.max(1, Math.floor(+ctx.opts.size || 1));
    groups = [];
    for (let i = 0; i < n; i += size) groups.push(Array.from({ length: Math.min(size, n - i) }, (_, k) => i + k));
  } else groups = Array.from({ length: n }, (_, i) => [i]);

  const stem = baseName(files[0].name);
  const outs = [];
  for (let g = 0; g < groups.length; g++) {
    ctx.progress(g / groups.length, `Creating part ${g + 1} of ${groups.length}`);
    const d = await PDFDocument.create();
    (await d.copyPages(src, groups[g])).forEach((p) => d.addPage(p));
    const b = await d.save({ useObjectStreams: true });
    const a = groups[g][0] + 1, z = groups[g][groups[g].length - 1] + 1;
    outs.push({ name: `${stem}-${a === z ? `page-${a}` : `pages-${a}-${z}`}.pdf`, blob: pdfBlob(b) });
    await tick();
  }
  return { files: outs };
}

/** Organize / Remove / Extract all reduce to: ordered list of {index, rotate} to keep. */
export async function arrangePdf(files: File[], ctx: Ctx): Promise<Result> {
  const { PDFDocument, degrees } = await import("pdf-lib");
  const src = await loadPdfLib(files[0]);
  const spec: { i: number; rot: number; on: boolean }[] | undefined = ctx.opts.pages;
  const keep = (spec ?? []).filter((p) => p.on);
  if (!keep.length) throw new UserError("No pages selected — keep at least one page.");
  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, keep.map((p) => p.i));
  copied.forEach((page, k) => {
    const extra = keep[k].rot % 360;
    if (extra) page.setRotation(degrees((page.getRotation().angle + extra + 360) % 360));
    out.addPage(page);
  });
  const bytes = await out.save({ useObjectStreams: true });
  return { files: [{ name: `${baseName(files[0].name)}-edited.pdf`, blob: pdfBlob(bytes) }] };
}

export async function rotatePdf(files: File[], ctx: Ctx): Promise<Result> {
  const { degrees } = await import("pdf-lib");
  const outs = [];
  for (let f = 0; f < files.length; f++) {
    ctx.progress(f / files.length);
    const doc = await loadPdfLib(files[f]);
    const angle = +ctx.opts.angle || 90;
    const targets = String(ctx.opts.pages || "").trim() ? parsePages(String(ctx.opts.pages), doc.getPageCount()) : doc.getPageIndices();
    const pages = doc.getPages();
    targets.forEach((i) => pages[i].setRotation(degrees((pages[i].getRotation().angle + angle) % 360)));
    outs.push({ name: `${baseName(files[f].name)}-rotated.pdf`, blob: pdfBlob(await doc.save({ useObjectStreams: true })) });
  }
  return { files: outs };
}

export async function pageNumbers(files: File[], ctx: Ctx): Promise<Result> {
  const { StandardFonts, rgb } = await import("pdf-lib");
  const doc = await loadPdfLib(files[0]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  const n = pages.length;
  const start = Math.floor(+ctx.opts.start || 1);
  const skipFirst = ctx.opts.skipFirst === "yes";
  const pos = ctx.opts.position || "bottom-center";
  const fmt = ctx.opts.format || "n";
  const size = 10;
  pages.forEach((page, i) => {
    if (skipFirst && i === 0) return;
    const num = i + start - (skipFirst ? 1 : 0);
    const label = fmt === "page" ? `Page ${num}` : fmt === "of" ? `Page ${num} of ${n + start - 1 - (skipFirst ? 1 : 0)}` : fmt === "slash" ? `${num} / ${n + start - 1 - (skipFirst ? 1 : 0)}` : `${num}`;
    const { width, height } = page.getSize();
    const w = font.widthOfTextAtSize(label, size);
    const m = 28;
    const x = pos.endsWith("left") ? m : pos.endsWith("right") ? width - m - w : (width - w) / 2;
    const y = pos.startsWith("top") ? height - m : m - 6;
    page.drawText(label, { x, y, size, font, color: rgb(0.25, 0.25, 0.25) });
  });
  const bytes = await doc.save({ useObjectStreams: true });
  return { files: [{ name: `${baseName(files[0].name)}-numbered.pdf`, blob: pdfBlob(bytes) }] };
}

export async function watermarkPdf(files: File[], ctx: Ctx): Promise<Result> {
  const { StandardFonts, rgb, degrees } = await import("pdf-lib");
  const text = String(ctx.opts.text || "").trim();
  if (!text) throw new UserError("Enter the watermark text.");
  const doc = await loadPdfLib(files[0]);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const safe = [...text].map((c) => { try { font.encodeText(c); return c; } catch { return "?"; } }).join("");
  const size = +ctx.opts.size || 64;
  const opacity = +ctx.opts.opacity || 0.18;
  const ang = +ctx.opts.angle;
  const rad = ((Number.isFinite(ang) ? ang : 45) * Math.PI) / 180;
  const shade = ctx.opts.color === "red" ? rgb(0.85, 0.15, 0.15) : ctx.opts.color === "blue" ? rgb(0.15, 0.3, 0.85) : rgb(0.35, 0.35, 0.35);
  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    const w = font.widthOfTextAtSize(safe, size);
    const h = size * 0.7;
    page.drawText(safe, {
      x: width / 2 - (w / 2) * Math.cos(rad) + (h / 2) * Math.sin(rad),
      y: height / 2 - (w / 2) * Math.sin(rad) - (h / 2) * Math.cos(rad),
      size, font, color: shade, opacity, rotate: degrees(Number.isFinite(ang) ? ang : 45),
    });
  }
  const bytes = await doc.save({ useObjectStreams: true });
  return { files: [{ name: `${baseName(files[0].name)}-watermarked.pdf`, blob: pdfBlob(bytes) }] };
}

export async function cropPdf(files: File[], ctx: Ctx): Promise<Result> {
  const mm = 2.8346;
  const t = (+ctx.opts.top || 0) * mm, r = (+ctx.opts.right || 0) * mm, b = (+ctx.opts.bottom || 0) * mm, l = (+ctx.opts.left || 0) * mm;
  if (!t && !r && !b && !l) throw new UserError("Set at least one margin to crop.");
  const doc = await loadPdfLib(files[0]);
  for (const page of doc.getPages()) {
    const box = page.getCropBox();
    const w = box.width - l - r, h = box.height - t - b;
    if (w < 20 || h < 20) throw new UserError("That crop removes the whole page — use smaller margins.");
    page.setCropBox(box.x + l, box.y + b, w, h);
    page.setMediaBox(box.x + l, box.y + b, w, h);
  }
  const bytes = await doc.save({ useObjectStreams: true });
  return { files: [{ name: `${baseName(files[0].name)}-cropped.pdf`, blob: pdfBlob(bytes) }] };
}

/** Render every page of a PDF to JPEG and rebuild a fresh PDF from them. */
async function rasterize(file: File, dpi: number, quality: number, ctx: Ctx, base: number, span: number): Promise<Uint8Array> {
  const { PDFDocument } = await import("pdf-lib");
  const pdf = await openPdfJs(file);
  const out = await PDFDocument.create();
  for (let p = 1; p <= pdf.numPages; p++) {
    ctx.progress(base + (span * (p - 1)) / pdf.numPages, `Optimizing page ${p} of ${pdf.numPages}`);
    const page = await pdf.getPage(p);
    const pt = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: dpi / 72 });
    const c = makeCanvas(vp.width, vp.height);
    const g = c.getContext("2d")!;
    g.fillStyle = "#fff";
    g.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: g, viewport: vp }).promise;
    const jpg = await canvasBlob(c, "image/jpeg", quality);
    const img = await out.embedJpg(new Uint8Array(await jpg.arrayBuffer()));
    const pg = out.addPage([pt.width, pt.height]);
    pg.drawImage(img, { x: 0, y: 0, width: pt.width, height: pt.height });
    c.width = c.height = 0;
    page.cleanup();
    await tick();
  }
  await pdf.destroy();
  return out.save({ useObjectStreams: true });
}

export async function compressPdf(files: File[], ctx: Ctx): Promise<Result> {
  const level = ctx.opts.level || "balanced";
  const outs = [];
  const notes: string[] = [];
  let before = 0, after = 0;
  for (let f = 0; f < files.length; f++) {
    const file = files[f];
    const base = f / files.length, span = 1 / files.length;
    ctx.progress(base, `Compressing ${file.name}`);
    let best: Uint8Array | null = null;

    // Lossless pass: rewrite with compressed object streams (qpdf first, pdf-lib as fallback).
    try {
      const { qpdfRun } = await import("./qpdf");
      best = await qpdfRun(file, ["--recompress-flate", "--compression-level=9", "--object-streams=generate", "--remove-unreferenced-resources=yes"]);
    } catch { /* fall through */ }
    try {
      const doc = await loadPdfLib(file, { lenient: true });
      const alt = await doc.save({ useObjectStreams: true });
      if (!best || alt.length < best.length) best = alt;
    } catch (e) { if (level === "lossless" && !best) throw e; }

    const targetBytes = (+ctx.opts.target || 0) * 1024;
    if (level !== "lossless") {
      const ladder: [number, number][] = targetBytes
        ? [[130, 0.72], [110, 0.6], [96, 0.5], [84, 0.42], [72, 0.35], [60, 0.3]]
        : [level === "small" ? [96, 0.5] : [130, 0.72]];
      for (let k = 0; k < ladder.length; k++) {
        const r = await rasterize(file, ladder[k][0], ladder[k][1], ctx, base + (span * k) / ladder.length, span / ladder.length);
        if (!best || r.length < best.length) best = r;
        if (!targetBytes || r.length <= targetBytes) break;
      }
      if (targetBytes && best && best.length > targetBytes) notes.push(`${file.name}: couldn’t get under the target — ${Math.round(best.length / 1024)} KB is the smallest possible.`);
    }
    before += file.size;
    const name = `${baseName(file.name)}-compressed.pdf`;
    if (!best || best.length >= file.size) {
      outs.push({ name, blob: file.slice(0, file.size, "application/pdf") });
      after += file.size;
      notes.push(`${file.name} is already well optimized — kept as-is.`);
    } else {
      outs.push({ name, blob: pdfBlob(best) });
      after += best.length;
    }
  }
  const raster = level !== "lossless";
  return {
    files: outs, before, after,
    note: notes[0] ?? (raster ? "Pages were re-rendered as images to shrink the file, so text is no longer selectable. Use “Lossless” to keep text." : undefined),
  };
}

export async function repairPdf(files: File[], ctx: Ctx): Promise<Result> {
  const { PDFDocument } = await import("pdf-lib");
  const outs = [];
  const notes: string[] = [];
  for (let f = 0; f < files.length; f++) {
    ctx.progress(f / files.length, `Repairing ${files[f].name}`);
    const name = `${baseName(files[f].name)}-repaired.pdf`;
    try {
      try {
        const { qpdfRun } = await import("./qpdf");
        outs.push({ name, blob: pdfBlob(await qpdfRun(files[f], [])) });
        continue;
      } catch { /* try the pdf-lib rebuild next */ }
      const src = await loadPdfLib(files[f], { lenient: true });
      const out = await PDFDocument.create();
      (await out.copyPages(src, src.getPageIndices())).forEach((p) => out.addPage(p));
      if (!out.getPageCount()) throw new Error("empty");
      outs.push({ name, blob: pdfBlob(await out.save({ useObjectStreams: true })) });
    } catch {
      try {
        const bytes = await rasterize(files[f], 150, 0.85, ctx, f / files.length, 1 / files.length);
        outs.push({ name, blob: pdfBlob(bytes) });
        notes.push(`${files[f].name} was rebuilt from page images (text is not selectable).`);
      } catch {
        throw new UserError(`"${files[f].name}" is too damaged to recover in the browser.`);
      }
    }
  }
  return { files: outs, note: notes.join(" ") || "Structure rebuilt page by page — text and layout preserved." };
}
