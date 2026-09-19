"use client";

import { useEffect, useRef, useState } from "react";
import { canvasBlob, decodeImage, enqueueThumb, makeCanvas, openPdfJs } from "@/lib/engines/common";
import type { Fmt } from "@/lib/formats";
import { FormatChip } from "./FormatChip";
import { Icon } from "./Icon";

const NATIVE_IMG: Fmt[] = ["jpg", "png", "webp", "gif", "bmp", "avif", "svg"];
const TEXTY: Fmt[] = ["txt", "csv", "json", "md", "html"];

export type Slide = { title: string; load: () => Promise<{ src: string; dispose?: () => void }> };

const IMG_TYPES: Fmt[] = ["jpg", "png", "webp", "gif", "bmp", "avif", "svg"];
export const canPreview = (t: Fmt | null) => !!t && (IMG_TYPES.includes(t) || t === "heic" || t === "pdf");

async function renderPdfPage(blob: Blob, index: number, width: number): Promise<string> {
  const pdf = await openPdfJs(new File([blob], "preview.pdf"));
  try {
    const page = await pdf.getPage(index + 1);
    const w1 = page.getViewport({ scale: 1 }).width;
    const vp = page.getViewport({ scale: width / w1 });
    const c = makeCanvas(vp.width, vp.height);
    const g = c.getContext("2d")!;
    g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: g, viewport: vp }).promise;
    return URL.createObjectURL(await canvasBlob(c, "image/jpeg", 0.92));
  } finally { pdf.destroy(); }
}

/** Full-size viewer source for an uploaded file. */
export function fileSlide(file: File, type: Fmt | null): Slide | null {
  if (!canPreview(type)) return null;
  return {
    title: file.name,
    load: async () => {
      if (type === "pdf") { const u = await renderPdfPage(file, 0, 1500); return { src: u, dispose: () => URL.revokeObjectURL(u) }; }
      if (type === "heic") {
        const d = await decodeImage(file);
        const c = makeCanvas(d.w, d.h);
        c.getContext("2d")!.drawImage(d.img, 0, 0);
        d.done();
        const u = URL.createObjectURL(await canvasBlob(c, "image/jpeg", 0.92));
        return { src: u, dispose: () => URL.revokeObjectURL(u) };
      }
      const u = URL.createObjectURL(file);
      return { src: u, dispose: () => URL.revokeObjectURL(u) };
    },
  };
}

export function pdfPageSlide(blob: Blob, index: number, title: string): Slide {
  return { title, load: async () => { const u = await renderPdfPage(blob, index, 1500); return { src: u, dispose: () => URL.revokeObjectURL(u) }; } };
}

export type Thumb = { src?: string; text?: string; meta?: string; state: "loading" | "ready" | "none" | "locked" };

/** Builds a preview (image / first PDF page / text excerpt) for any file, entirely on-device. */
export function useThumb(file: Blob & { name?: string }, type: Fmt | null): Thumb {
  const [t, setT] = useState<Thumb>({ state: type ? "loading" : "none" });

  useEffect(() => {
    let dead = false;
    let url: string | undefined;
    const set = (v: Thumb) => { if (!dead) setT(v); };
    const own = (u: string) => { url = u; return u; };

    (async () => {
      try {
        if (type && NATIVE_IMG.includes(type)) {
          const u = own(URL.createObjectURL(file));
          const img = new Image();
          img.onload = () => set({ src: u, meta: img.naturalWidth ? `${img.naturalWidth} × ${img.naturalHeight}` : undefined, state: "ready" });
          img.onerror = () => set({ state: "none" });
          img.src = u;
        } else if (type === "heic") {
          await enqueueThumb(async () => {
            if (dead) return;
            const d = await decodeImage(file);
            const k = Math.min(1, 480 / Math.max(d.w, d.h));
            const c = makeCanvas(d.w * k, d.h * k);
            c.getContext("2d")!.drawImage(d.img, 0, 0, c.width, c.height);
            d.done();
            const b = await canvasBlob(c, "image/jpeg", 0.82);
            set({ src: own(URL.createObjectURL(b)), meta: `${d.w} × ${d.h}`, state: "ready" });
          });
        } else if (type === "pdf") {
          await enqueueThumb(async () => {
            if (dead) return;
            let pdf: any;
            try { pdf = await openPdfJs(file as File); } catch { set({ state: "locked", meta: "Can’t read this PDF" }); return; }
            const page = await pdf.getPage(1);
            const w1 = page.getViewport({ scale: 1 }).width;
            const vp = page.getViewport({ scale: (360 * Math.min(devicePixelRatio || 1, 2)) / w1 });
            const c = makeCanvas(vp.width, vp.height);
            const g = c.getContext("2d")!;
            g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
            await page.render({ canvasContext: g, viewport: vp }).promise;
            const n = pdf.numPages;
            pdf.destroy();
            const b = await canvasBlob(c, "image/jpeg", 0.85);
            set({ src: own(URL.createObjectURL(b)), meta: `${n} page${n === 1 ? "" : "s"}`, state: "ready" });
          });
        } else if (type && TEXTY.includes(type)) {
          const txt = (await file.slice(0, 700).text()).replace(/\r/g, "");
          set({ text: txt.split("\n").slice(0, 9).join("\n"), state: "ready" });
        } else set({ state: "none" });
      } catch { set({ state: "none" }); }
    })();

    return () => { dead = true; if (url) URL.revokeObjectURL(url); };
  }, [file, type]);

  return t;
}

/** The visual half of a file card. */
export function ThumbView({ thumb, type, rot = 0 }: { thumb: Thumb; type: Fmt | null; rot?: number }) {
  if (thumb.state === "loading") return <span className="th-skel" aria-hidden />;
  if (thumb.src) return <img src={thumb.src} alt="" draggable={false} style={{ transform: `rotate(${rot}deg)` }} />;
  if (thumb.text) return <pre className="th-text">{thumb.text}</pre>;
  return (
    <span className="th-none">
      <Icon name={thumb.state === "locked" ? "lock" : "file"} size={26} />
      {type && <FormatChip f={type} />}
    </span>
  );
}

/** First few pages of a generated PDF, so you can see what you're about to download. */
export function PdfStrip({ blob, max = 8, onOpen }: { blob: Blob; max?: number; onOpen?: (page: number, total: number) => void }) {
  const [pages, setPages] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const urls = useRef<string[]>([]);

  useEffect(() => {
    let dead = false;
    enqueueThumb(async () => {
      if (dead) return;
      let pdf: any;
      try { pdf = await openPdfJs(new File([blob], "preview.pdf")); } catch { return; }
      setTotal(pdf.numPages);
      for (let p = 1; p <= Math.min(pdf.numPages, max) && !dead; p++) {
        const page = await pdf.getPage(p);
        const w1 = page.getViewport({ scale: 1 }).width;
        const vp = page.getViewport({ scale: (300 * Math.min(devicePixelRatio || 1, 2)) / w1 });
        const c = makeCanvas(vp.width, vp.height);
        const g = c.getContext("2d")!;
        g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
        await page.render({ canvasContext: g, viewport: vp }).promise;
        const u = URL.createObjectURL(await canvasBlob(c, "image/jpeg", 0.85));
        urls.current.push(u);
        if (!dead) setPages((s) => [...s, u]);
        page.cleanup();
      }
      pdf.destroy();
    });
    const list = urls.current;
    return () => { dead = true; list.forEach((u) => URL.revokeObjectURL(u)); urls.current = []; };
  }, [blob, max]);

  if (!total && !pages.length) return <div className="strip"><span className="th-skel strip-skel" /><span className="th-skel strip-skel" /><span className="th-skel strip-skel" /></div>;
  return (
    <div className="strip" aria-label="Preview of the result">
      {pages.map((u, i) => (
        <figure key={u} style={{ animationDelay: `${i * 60}ms` }}>
          <button onClick={() => onOpen?.(i, total)} aria-label={`Open page ${i + 1} full screen`}><img src={u} alt={`Page ${i + 1}`} /></button>
          <figcaption>{i + 1}</figcaption>
        </figure>
      ))}
      {total > max && <div className="strip-more">+{total - max}<small>more pages</small></div>}
    </div>
  );
}
