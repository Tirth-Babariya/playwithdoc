import { baseName, FORMATS, typeOfFile, type Fmt } from "../formats";
import type { Ctx, Out, Result } from "../types";
import { canvasBlob, decodeImage, loadScript, makeCanvas, pdfBlob, tick, UserError, uniqueName } from "./common";

const total = (fs: File[]) => fs.reduce((n, f) => n + f.size, 0);

/** Reads the EXIF orientation tag of a JPEG (1 when absent). */
function jpegOrientation(b: Uint8Array): number {
  if (b[0] !== 0xff || b[1] !== 0xd8) return 1;
  let o = 2;
  while (o + 4 < b.length) {
    if (b[o] !== 0xff) break;
    const marker = b[o + 1];
    const len = (b[o + 2] << 8) | b[o + 3];
    if (marker === 0xe1 && b[o + 4] === 0x45 && b[o + 5] === 0x78) {
      const t = o + 10;
      const le = b[t] === 0x49;
      const u16 = (p: number) => (le ? b[p] | (b[p + 1] << 8) : (b[p] << 8) | b[p + 1]);
      const u32 = (p: number) => (le ? (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)) >>> 0 : ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) >>> 0);
      const ifd = t + u32(t + 4);
      const n = u16(ifd);
      for (let i = 0; i < n; i++) {
        const e = ifd + 2 + i * 12;
        if (u16(e) === 0x0112) return u16(e + 8);
      }
      return 1;
    }
    o += 2 + len;
  }
  return 1;
}

const PAGE: Record<string, [number, number]> = { a4: [595.28, 841.89], letter: [612, 792] };
const MARGIN: Record<string, number> = { none: 0, small: 24, medium: 48 };

export async function imagesToPdf(files: File[], ctx: Ctx): Promise<Result> {
  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const size = ctx.opts.size || "a4";
  const margin = MARGIN[ctx.opts.margin ?? "small"] ?? 24;
  const orient = ctx.opts.orient || "auto";

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    ctx.progress(i / files.length, `Adding ${f.name}`);
    const t = typeOfFile(f);
    const bytes = new Uint8Array(await f.arrayBuffer());
    const rot = (((ctx.opts.rotations?.[i] ?? 0) % 360) + 360) % 360;
    let emb: Awaited<ReturnType<typeof doc.embedJpg>> | null = null;
    try {
      if (!rot && t === "jpg" && jpegOrientation(bytes) === 1) emb = await doc.embedJpg(bytes);
      else if (!rot && t === "png") emb = await doc.embedPng(bytes);
    } catch { emb = null; }
    if (!emb) {
      const d = await decodeImage(f);
      const swap = rot === 90 || rot === 270;
      const c = makeCanvas(swap ? d.h : d.w, swap ? d.w : d.h);
      const g = c.getContext("2d")!;
      const png = t === "svg";
      if (!png) { g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); }
      g.translate(c.width / 2, c.height / 2);
      g.rotate((rot * Math.PI) / 180);
      g.drawImage(d.img, -d.w / 2, -d.h / 2, d.w, d.h);
      d.done();
      const blob = await canvasBlob(c, png ? "image/png" : "image/jpeg", 0.92);
      const raw = new Uint8Array(await blob.arrayBuffer());
      emb = png ? await doc.embedPng(raw) : await doc.embedJpg(raw);
      c.width = c.height = 0;
    }
    const iw = emb.width, ih = emb.height;
    let pw: number, ph: number;
    if (size === "fit") {
      const k = Math.min(1, 1600 / Math.max(iw, ih)) * 0.75;
      pw = iw * k + margin * 2; ph = ih * k + margin * 2;
    } else {
      [pw, ph] = PAGE[size] ?? PAGE.a4;
      const landscape = orient === "landscape" || (orient === "auto" && iw > ih);
      if (landscape) [pw, ph] = [ph, pw];
    }
    const page = doc.addPage([pw, ph]);
    const bw = pw - margin * 2, bh = ph - margin * 2;
    const k = Math.min(bw / iw, bh / ih);
    const w = iw * k, h = ih * k;
    page.drawImage(emb, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
    await tick();
  }
  const out = await doc.save({ useObjectStreams: true });
  return { files: [{ name: files.length === 1 ? `${baseName(files[0].name)}.pdf` : "images.pdf", blob: pdfBlob(out) }], before: total(files), after: out.length };
}

const MIME: Partial<Record<Fmt, string>> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

export async function convertImages(files: File[], ctx: Ctx, target: "jpg" | "png" | "webp"): Promise<Result> {
  const quality = ctx.opts.quality ?? 0.92;
  const scale = +ctx.opts.scale || 1;
  const outs: Out[] = [];
  const used = new Set<string>();
  for (let i = 0; i < files.length; i++) {
    ctx.progress(i / files.length, `Converting ${files[i].name}`);
    const d = await decodeImage(files[i]);
    const isSvg = typeOfFile(files[i]) === "svg";
    const k = isSvg ? scale * (d.w < 512 ? 1024 / d.w : 1) : 1;
    const c = makeCanvas(d.w * k, d.h * k);
    const g = c.getContext("2d")!;
    if (target === "jpg") { g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); }
    g.drawImage(d.img, 0, 0, c.width, c.height);
    d.done();
    const blob = await canvasBlob(c, MIME[target]!, target === "png" ? undefined : quality);
    if (blob.type !== MIME[target]) throw new UserError(`Your browser can't encode ${FORMATS[target].label} images.`);
    outs.push({ name: uniqueName(`${baseName(files[i].name)}.${target}`, used), blob });
    c.width = c.height = 0;
    await tick();
  }
  return { files: outs, before: total(files), after: outs.reduce((n, o) => n + o.blob.size, 0) };
}

async function encodeScaled(file: File, maxW: number, maxH: number, fmt: Fmt, quality: number): Promise<{ blob: Blob; fmt: Fmt }> {
  const d = await decodeImage(file);
  let k = Math.min(1, maxW ? maxW / d.w : 1, maxH ? maxH / d.h : 1);
  if (!isFinite(k) || k <= 0) k = 1;
  const c = makeCanvas(d.w * k, d.h * k);
  const g = c.getContext("2d")!;
  g.imageSmoothingQuality = "high";
  if (fmt === "jpg") { g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); }
  g.drawImage(d.img, 0, 0, c.width, c.height);
  d.done();
  const blob = await canvasBlob(c, MIME[fmt]!, fmt === "png" ? undefined : quality);
  c.width = c.height = 0;
  return { blob, fmt };
}

function pickFormat(pref: string, src: Fmt | null): Fmt {
  if (pref === "webp" || pref === "jpg" || pref === "png") return pref;
  return src === "jpg" || src === "png" || src === "webp" ? src : "png";
}

/** Finds the best-looking encoding that fits under `target` bytes (quality search, then downscaling). */
async function encodeToTarget(file: File, maxDim: number, fmt: Fmt, target: number): Promise<{ blob: Blob; shrunk: boolean; met: boolean }> {
  const d = await decodeImage(file);
  let scale = Math.min(1, maxDim ? maxDim / Math.max(d.w, d.h) : 1);
  const render = async (k: number, q: number) => {
    const c = makeCanvas(d.w * k, d.h * k);
    const g = c.getContext("2d")!;
    g.imageSmoothingQuality = "high";
    if (fmt === "jpg") { g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); }
    g.drawImage(d.img, 0, 0, c.width, c.height);
    const b = await canvasBlob(c, MIME[fmt]!, fmt === "png" ? undefined : q);
    c.width = c.height = 0;
    return b;
  };
  try {
    const start = scale;
    if (fmt === "png") {
      let best = await render(scale, 1);
      if (best.size <= target) return { blob: best, shrunk: scale < 1, met: true };
      let lo = 0.05, hi = scale;
      for (let i = 0; i < 8; i++) { const mid = (lo + hi) / 2; const b = await render(mid, 1); if (b.size <= target) { best = b; lo = mid; } else hi = mid; }
      return { blob: best, shrunk: true, met: best.size <= target };
    }
    for (let attempt = 0; attempt < 7; attempt++) {
      const top = await render(scale, 0.95);
      if (top.size <= target) return { blob: top, shrunk: scale < start, met: true };
      let lo = 0.05, hi = 0.95, best: Blob | null = null;
      for (let i = 0; i < 7; i++) { const mid = (lo + hi) / 2; const b = await render(scale, mid); if (b.size <= target) { best = b; lo = mid; } else hi = mid; }
      if (best) return { blob: best, shrunk: scale < start, met: true };
      scale *= 0.8;
    }
    const last = await render(scale, 0.05);
    return { blob: last, shrunk: true, met: last.size <= target };
  } finally { d.done(); }
}

export async function compressImages(files: File[], ctx: Ctx): Promise<Result> {
  const quality = ctx.opts.quality ?? 0.72;
  const maxDim = +ctx.opts.maxDim || 0;
  const targetBytes = (+ctx.opts.target || 0) * 1024;
  const missed: string[] = [];
  const outs: Out[] = [];
  const used = new Set<string>();
  let before = 0, after = 0;
  let kept = 0;
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    ctx.progress(i / files.length, `Compressing ${f.name}`);
    const src = typeOfFile(f);
    const fmt = pickFormat(ctx.opts.format || "keep", src);
    let blob: Blob;
    if (targetBytes) {
      const r = await encodeToTarget(f, maxDim, fmt, targetBytes);
      blob = r.blob;
      if (!r.met) missed.push(f.name);
    } else ({ blob } = await encodeScaled(f, maxDim, maxDim, fmt, quality));
    before += f.size;
    if (!targetBytes && blob.size >= f.size && fmt === src) { outs.push({ name: uniqueName(f.name, used), blob: f }); after += f.size; kept++; }
    else { outs.push({ name: uniqueName(`${baseName(f.name)}${fmt === src ? "-compressed" : ""}.${fmt}`, used), blob }); after += blob.size; }
    await tick();
  }
  const notes: string[] = [];
  if (kept) notes.push(`${kept} file${kept > 1 ? "s were" : " was"} already as small as it gets — kept as-is. PNG is lossless; pick WebP for bigger savings.`);
  if (missed.length) notes.push(`Couldn’t reach the target for ${missed.slice(0, 3).join(", ")}${missed.length > 3 ? "…" : ""} — these are as small as they can safely go.`);
  if (targetBytes && !missed.length) notes.push("Every file is under your target size.");
  return { files: outs, before, after, note: notes.join(" ") || undefined };
}

export async function resizeImages(files: File[], ctx: Ctx): Promise<Result> {
  const w = Math.max(0, Math.floor(+ctx.opts.width || 0));
  const h = Math.max(0, Math.floor(+ctx.opts.height || 0));
  if (!w && !h) throw new UserError("Enter a width, a height, or both.");
  const outs: Out[] = [];
  const used = new Set<string>();
  for (let i = 0; i < files.length; i++) {
    ctx.progress(i / files.length, `Resizing ${files[i].name}`);
    const fmt = pickFormat("keep", typeOfFile(files[i]));
    const d = await decodeImage(files[i]);
    let tw = w || (d.w * h) / d.h, th = h || (d.h * w) / d.w;
    if (w && h && ctx.opts.keepAspect !== "no") { const k = Math.min(w / d.w, h / d.h); tw = d.w * k; th = d.h * k; }
    const c = makeCanvas(tw, th);
    const g = c.getContext("2d")!;
    g.imageSmoothingQuality = "high";
    if (fmt === "jpg") { g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); }
    g.drawImage(d.img, 0, 0, c.width, c.height);
    d.done();
    const blob = await canvasBlob(c, MIME[fmt]!, fmt === "png" ? undefined : 0.92);
    outs.push({ name: uniqueName(`${baseName(files[i].name)}-${c.width}x${c.height}.${fmt}`, used), blob });
    c.width = c.height = 0;
    await tick();
  }
  return { files: outs };
}

export { loadScript };
