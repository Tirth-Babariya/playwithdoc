import { baseName, typeOfFile } from "../formats";
import type { Ctx, Result } from "../types";
import { canvasBlob, decodeImage, loadScript, loadPdfLib, makeCanvas, openPdfJs, pdfBlob, tick, UserError } from "./common";

type Word = { text: string; x0: number; y0: number; x1: number; y1: number };
type Page = { text: string; words: Word[]; w: number; h: number };

async function createWorker(lang: string, onProgress: (p: number) => void) {
  await loadScript("/vendor/tesseract/tesseract.min.js");
  const T = (window as any).Tesseract;
  try {
    return await T.createWorker(lang, 1, {
      workerPath: "/vendor/tesseract/worker.min.js",
      corePath: "/vendor/tesseract",
      langPath: "/vendor/tesseract/lang",
      gzip: true,
      logger: (m: any) => { if (m.status === "recognizing text") onProgress(m.progress ?? 0); },
    });
  } catch (e) {
    console.error(e);
    throw new UserError("The OCR engine could not start in this browser.");
  }
}

function collectWords(data: any): Word[] {
  const out: Word[] = [];
  const push = (w: any) => { if (w?.text?.trim() && w.bbox) out.push({ text: w.text, x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1 }); };
  if (Array.isArray(data.words)) data.words.forEach(push);
  else for (const b of data.blocks ?? []) for (const p of b.paragraphs ?? []) for (const l of p.lines ?? []) for (const w of l.words ?? []) push(w);
  return out;
}

/** Yields one canvas per page/image. Caller owns disposing them. */
async function* sources(file: File, dpi: number): AsyncGenerator<{ canvas: HTMLCanvasElement; ptW: number; ptH: number; index: number; count: number }> {
  const t = typeOfFile(file);
  if (t === "pdf") {
    const pdf = await openPdfJs(file);
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const pt = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: dpi / 72 });
      const c = makeCanvas(vp.width, vp.height);
      const g = c.getContext("2d")!;
      g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: g, viewport: vp }).promise;
      page.cleanup();
      yield { canvas: c, ptW: pt.width, ptH: pt.height, index: p - 1, count: pdf.numPages };
    }
    await pdf.destroy();
  } else {
    const d = await decodeImage(file);
    const k = Math.min(1, 3200 / Math.max(d.w, d.h));
    const c = makeCanvas(d.w * k, d.h * k);
    const g = c.getContext("2d")!;
    g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(d.img, 0, 0, c.width, c.height);
    d.done();
    yield { canvas: c, ptW: c.width * 0.75, ptH: c.height * 0.75, index: 0, count: 1 };
  }
}

async function recognizeAll(files: File[], ctx: Ctx, lang: string, per: (f: File, fi: number, pages: (Page & { canvas?: HTMLCanvasElement; ptW: number; ptH: number })[]) => Promise<void>, keepCanvas = false) {
  let fileIdx = 0, pageFrac = 0, pageMeta = { i: 0, n: 1 };
  const report = () => ctx.progress((fileIdx + (pageMeta.i + pageFrac) / pageMeta.n) / files.length, `Reading page ${pageMeta.i + 1} of ${pageMeta.n}`);
  ctx.progress(0, "Starting OCR engine…");
  const worker = await createWorker(lang, (p) => { pageFrac = p; report(); });
  try {
    for (fileIdx = 0; fileIdx < files.length; fileIdx++) {
      const pages: (Page & { canvas?: HTMLCanvasElement; ptW: number; ptH: number })[] = [];
      for await (const src of sources(files[fileIdx], +ctx.opts.dpi || 200)) {
        pageMeta = { i: src.index, n: src.count }; pageFrac = 0; report();
        const { data } = await worker.recognize(src.canvas, {}, { text: true, blocks: true });
        pages.push({ text: (data.text ?? "").trim(), words: collectWords(data), w: src.canvas.width, h: src.canvas.height, ptW: src.ptW, ptH: src.ptH, canvas: keepCanvas ? src.canvas : undefined });
        if (!keepCanvas) src.canvas.width = src.canvas.height = 0;
        await tick();
      }
      await per(files[fileIdx], fileIdx, pages);
    }
  } finally {
    await worker.terminate();
  }
}

export async function ocrToText(files: File[], ctx: Ctx): Promise<Result> {
  const outs: { name: string; blob: Blob }[] = [];
  await recognizeAll(files, ctx, ctx.opts.lang || "eng", async (f, _i, pages) => {
    const text = pages.map((p) => p.text).join("\n\n\f\n").trim();
    if (!text) throw new UserError(`No text was found in “${f.name}”. Try a higher-resolution scan or another language.`);
    outs.push({ name: `${baseName(f.name)}-ocr.txt`, blob: new Blob([text], { type: "text/plain;charset=utf-8" }) });
  });
  return { files: outs, note: "Recognized entirely on your device. Always proofread — OCR can misread poor scans." };
}

export async function ocrPdf(files: File[], ctx: Ctx): Promise<Result> {
  const { PDFDocument, StandardFonts } = await import("pdf-lib");
  const outs: { name: string; blob: Blob }[] = [];
  let totalWords = 0;

  await recognizeAll(files, ctx, ctx.opts.lang || "eng", async (f, _i, pages) => {
    const isPdf = typeOfFile(f) === "pdf";
    const doc = isPdf ? await loadPdfLib(f, { lenient: true }) : await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const ok = (s: string) => { try { font.encodeText(s); return true; } catch { return false; } };

    for (let i = 0; i < pages.length; i++) {
      const pg = pages[i];
      let page;
      if (isPdf) page = doc.getPage(i);
      else {
        page = doc.addPage([pg.ptW, pg.ptH]);
        const jpg = await canvasBlob(pg.canvas!, "image/jpeg", 0.9);
        const img = await doc.embedJpg(new Uint8Array(await jpg.arrayBuffer()));
        page.drawImage(img, { x: 0, y: 0, width: pg.ptW, height: pg.ptH });
      }
      const { width: W, height: H } = page.getSize();
      const sx = W / pg.w, sy = H / pg.h;
      for (const w of pg.words) {
        const txt = w.text.trim();
        if (!txt || !ok(txt)) continue;
        const wPt = (w.x1 - w.x0) * sx, hPt = (w.y1 - w.y0) * sy;
        const base = font.widthOfTextAtSize(txt, 10) / 10 || 1;
        const size = Math.max(3, Math.min(wPt / base, hPt * 1.35));
        // Fully transparent text: invisible, but selectable and searchable.
        page.drawText(txt, { x: w.x0 * sx, y: H - w.y1 * sy + hPt * 0.18, size, font, opacity: 0 });
        totalWords++;
      }
      if (pg.canvas) pg.canvas.width = pg.canvas.height = 0;
    }
    const bytes = await doc.save({ useObjectStreams: true });
    outs.push({ name: `${baseName(f.name)}-searchable.pdf`, blob: pdfBlob(bytes) });
  }, true);

  if (!totalWords) throw new UserError("No text could be recognized. Try another language or a clearer scan.");
  return { files: outs, note: `Made searchable — ${totalWords.toLocaleString()} words recognized. Your pages look exactly the same; you can now select, copy and search the text.` };
}
