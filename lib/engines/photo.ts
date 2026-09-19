import { baseName, fmtBytes } from "../formats";
import { DEFAULT_CROP, presetDims, presetById, type Crop } from "../presets";
import type { Ctx, Result } from "../types";
import { canvasBlob, decodeImage, makeCanvas, UserError } from "./common";

/** Paper → white, ink → darker and greyscale: makes a photographed signature look like a clean scan. */
function cleanInk(c: HTMLCanvasElement) {
  const g = c.getContext("2d")!;
  const img = g.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const v = lum > 205 ? 255 : Math.max(0, (lum - 30) * 1.25);
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
}

const MIME = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" } as const;

/** Finds the best quality that fits under the size limit (JPEG/WebP). PNG can't be tuned, so it reports whether it fits. */
async function fitToLimit(c: HTMLCanvasElement, mime: string, limit: number): Promise<{ blob: Blob; met: boolean }> {
  if (mime === MIME.png || !limit) {
    const b = await canvasBlob(c, mime, 0.95);
    return { blob: b, met: !limit || b.size <= limit };
  }
  const top = await canvasBlob(c, mime, 0.95);
  if (top.size <= limit) return { blob: top, met: true };
  let lo = 0.05, hi = 0.95, best: Blob | null = null;
  for (let i = 0; i < 9; i++) {
    const mid = (lo + hi) / 2;
    const b = await canvasBlob(c, mime, mid);
    if (b.size <= limit) { best = b; lo = mid; } else hi = mid;
  }
  if (best) return { blob: best, met: true };
  const smallest = await canvasBlob(c, mime, 0.05);
  return { blob: smallest, met: smallest.size <= limit };
}

/** Frames a photo or signature to an exact pixel size and file-size limit. */
export async function presetImage(files: File[], ctx: Ctx): Promise<Result> {
  const file = files[0];
  const o = ctx.opts;
  const d = presetDims(o);
  const crop: Crop = { ...DEFAULT_CROP, ...(o.crop ?? {}) };
  const limit = d.maxKb * 1024;

  ctx.progress(0.1, "Framing your photo");
  const src = await decodeImage(file);
  const c = makeCanvas(d.w, d.h);
  const g = c.getContext("2d")!;
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  g.fillStyle = "#fff";
  g.fillRect(0, 0, d.w, d.h);
  const cover = Math.max(d.w / src.w, d.h / src.h);
  const s = cover * (crop.zoom || 1);
  g.drawImage(src.img, d.w / 2 + crop.dx * d.w - (src.w * s) / 2, d.h / 2 + crop.dy * d.h - (src.h * s) / 2, src.w * s, src.h * s);
  src.done();

  const clean = d.clean && o.clean !== "no";
  if (clean) cleanInk(c);

  ctx.progress(0.55, limit ? `Fitting under ${d.maxKb} KB` : "Saving");
  let fmt: keyof typeof MIME = o.format === "png" ? "png" : o.format === "webp" ? "webp" : "jpg";
  let out = await fitToLimit(c, MIME[fmt], limit);
  let note = "";
  if (fmt === "png" && limit && out.blob.size > limit) {
    // PNG can't be squeezed to a target — switch to JPG so the limit can be met.
    fmt = "jpg";
    out = await fitToLimit(c, MIME.jpg, limit);
    note = " PNG files can’t be compressed to a target, so this was saved as JPG.";
  }
  if (out.blob.type !== MIME[fmt]) throw new UserError("Your browser can't save this format. Try JPG.");
  if (limit && !out.met) throw new UserError(`Couldn't get under ${d.maxKb} KB at ${d.w}×${d.h} px — try a simpler photo or a larger limit.`);

  const id = String(o.preset ?? "passport");
  const tag = id === "custom" ? `${d.w}x${d.h}` : presetById(id).id;
  const name = `${baseName(file.name)}-${tag}.${fmt}`;
  const kb = out.blob.size / 1024;
  return {
    files: [{ name, blob: out.blob }],
    before: file.size,
    after: out.blob.size,
    note: `${d.w}×${d.h} px · ${fmtBytes(out.blob.size)}${limit ? ` (limit ${d.maxKb} KB${kb <= d.maxKb ? " ✓" : ""})` : ""}.${note} Check the form's exact requirements before uploading.`,
  };
}
