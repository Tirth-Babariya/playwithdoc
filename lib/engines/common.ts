import { typeOfFile } from "../formats";
import type { Out } from "../types";

/** An error whose message is safe and useful to show to the user. */
export class UserError extends Error {}

const scripts = new Map<string, Promise<void>>();
export function loadScript(src: string): Promise<void> {
  let p = scripts.get(src);
  if (!p) {
    p = new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => { scripts.delete(src); reject(new UserError("Could not load a processing module. Check your connection and try again.")); };
      document.head.appendChild(s);
    });
    scripts.set(src, p);
  }
  return p;
}

export async function pdfjs(): Promise<any> {
  await loadScript("/vendor/pdf.min.js");
  const lib = (window as any).pdfjsLib;
  lib.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.min.js";
  return lib;
}
export async function mammoth(): Promise<any> { await loadScript("/vendor/mammoth.min.js"); return (window as any).mammoth; }
export async function sheetjs(): Promise<any> { await loadScript("/vendor/xlsx.min.js"); return (window as any).XLSX; }
export async function heic2any(): Promise<any> { await loadScript("/vendor/heic2any.min.js"); return (window as any).heic2any; }

export async function openPdfJs(file: File | ArrayBuffer): Promise<any> {
  const lib = await pdfjs();
  const data = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
  try {
    return await lib.getDocument({ data: new Uint8Array(data) }).promise;
  } catch (e: any) {
    if (e?.name === "PasswordException") throw new UserError("This PDF is password-protected. Remove the password first, then try again.");
    throw new UserError("This PDF looks damaged. Try the Repair PDF tool first.");
  }
}

export async function loadPdfLib(file: File, opts: { lenient?: boolean } = {}) {
  const { PDFDocument } = await import("pdf-lib");
  const buf = await file.arrayBuffer();
  try {
    return await PDFDocument.load(buf, opts.lenient ? { ignoreEncryption: true, throwOnInvalidObject: false, updateMetadata: false } : { updateMetadata: false });
  } catch (e: any) {
    if (/encrypt/i.test(e?.message || "")) throw new UserError(`"${file.name}" is password-protected. Remove the password first, then try again.`);
    throw new UserError(`"${file.name}" could not be read. It may be damaged — try Repair PDF.`);
  }
}

export function uniqueName(name: string, used: Set<string>): string {
  if (!used.has(name)) { used.add(name); return name; }
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  let i = 2;
  while (used.has(`${stem}-${i}${ext}`)) i++;
  const n = `${stem}-${i}${ext}`;
  used.add(n);
  return n;
}

export async function zipOuts(outs: Out[]): Promise<Blob> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const used = new Set<string>();
  for (const o of outs) zip.file(uniqueName(o.name, used), o.blob);
  return zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
}

export function canvasBlob(c: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new UserError("Your browser could not encode this image."))), type, quality));
}

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

export type Decoded = { img: CanvasImageSource; w: number; h: number; done: () => void };

export async function decodeImage(file: Blob & { name?: string }): Promise<Decoded> {
  let blob: Blob = file;
  const t = typeOfFile({ name: (file as File).name || "", type: file.type });
  if (t === "heic") {
    const h = await heic2any();
    try {
      const r = await h({ blob: file, toType: "image/jpeg", quality: 0.92 });
      blob = Array.isArray(r) ? r[0] : r;
    } catch { throw new UserError("This HEIC file could not be decoded."); }
  }
  if (t === "svg") {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new UserError("This SVG could not be rendered.")); img.src = url; });
    const w = img.naturalWidth || 1024;
    const h = img.naturalHeight || 1024;
    return { img, w, h, done: () => URL.revokeObjectURL(url) };
  }
  try {
    const bmp = await createImageBitmap(blob);
    return { img: bmp, w: bmp.width, h: bmp.height, done: () => bmp.close() };
  } catch {
    throw new UserError(`"${(file as File).name || "image"}" could not be decoded as an image.`);
  }
}

/** "1-3, 5, 8-" → sorted unique zero-based indices. Throws on garbage. */
export function parsePages(input: string, total: number): number[] {
  const out = new Set<number>();
  for (const part of input.split(/[,\s;]+/).filter(Boolean)) {
    const m = part.match(/^(\d*)-(\d*)$/);
    if (m) {
      const a = m[1] ? +m[1] : 1;
      const b = m[2] ? +m[2] : total;
      if (a < 1 || b < a || a > total) throw new UserError(`Page range "${part}" is outside this document (1–${total}).`);
      for (let i = a; i <= Math.min(b, total); i++) out.add(i - 1);
    } else if (/^\d+$/.test(part)) {
      const n = +part;
      if (n < 1 || n > total) throw new UserError(`Page ${n} doesn't exist — this document has ${total} page${total === 1 ? "" : "s"}.`);
      out.add(n - 1);
    } else throw new UserError(`Couldn't understand "${part}". Use something like 1-3, 5, 8-.`);
  }
  return [...out].sort((a, b) => a - b);
}

/** "1-3, 5" → [[0,1,2],[4]] preserving the groups the user typed. */
export function parseGroups(input: string, total: number): number[][] {
  return input.split(/[,;]+/).map((s) => s.trim()).filter(Boolean).map((g) => parsePages(g, total));
}

export function pdfBlob(bytes: Uint8Array): Blob {
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}

export const tick = () => new Promise<void>((r) => setTimeout(r, 0));

// Thumbnails are rendered one at a time so big PDFs/HEICs don't freeze the UI.
let thumbChain: Promise<unknown> = Promise.resolve();
export function enqueueThumb<T>(fn: () => Promise<T>): Promise<T> {
  const p = thumbChain.then(fn);
  thumbChain = p.catch(() => {});
  return p;
}
