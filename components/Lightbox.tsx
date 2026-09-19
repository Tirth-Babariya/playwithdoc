"use client";

import { useEffect, useRef, useState } from "react";
import type { Slide } from "./FilePreview";
import { Icon } from "./Icon";

/** Full-screen viewer: ←/→ to browse, R to rotate, Z or click to zoom, Esc to close. */
export function Lightbox({ slides, start, rotations, onRotate, onClose }: {
  slides: Slide[]; start: number; rotations?: number[]; onRotate?: (i: number) => void; onClose: () => void;
}) {
  const [i, setI] = useState(start);
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [localRot, setLocalRot] = useState<Record<number, number>>({});
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let dead = false, dispose: (() => void) | undefined;
    setSrc(null); setFailed(false); setZoom(false);
    slides[i].load().then((r) => { if (dead) { r.dispose?.(); return; } dispose = r.dispose; setSrc(r.src); }).catch(() => !dead && setFailed(true));
    return () => { dead = true; dispose?.(); };
  }, [i, slides]);

  const rot = onRotate ? rotations?.[i] ?? 0 : localRot[i] ?? 0;
  const rotate = () => (onRotate ? onRotate(i) : setLocalRot((r) => ({ ...r, [i]: ((r[i] ?? 0) + 90) % 360 })));
  const go = (d: number) => setI((v) => Math.min(slides.length - 1, Math.max(0, v + d)));

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
      else if (e.key.toLowerCase() === "r") rotate();
      else if (e.key.toLowerCase() === "z") setZoom((z) => !z);
    };
    window.addEventListener("keydown", k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", k); document.body.style.overflow = prev; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onRotate, rotations]);

  return (
    <div className="lb" role="dialog" aria-modal="true" aria-label="Preview" onMouseDown={(e) => { if (e.target === e.currentTarget || e.target === box.current) onClose(); }}>
      <div className="lb-top">
        <span className="lb-title" title={slides[i].title}>{slides[i].title}</span>
        <span className="lb-count">{i + 1} / {slides.length}</span>
        <span className="grow" />
        <button onClick={rotate} aria-label="Rotate" title="Rotate (R)"><Icon name="rotate" size={18} /></button>
        <button onClick={() => setZoom((z) => !z)} aria-label="Zoom" title="Zoom (Z)"><Icon name="fullscreen" size={18} /></button>
        <button onClick={onClose} aria-label="Close" title="Close (Esc)"><Icon name="x" size={18} /></button>
      </div>
      <div ref={box} className={`lb-stage${zoom ? " zoom" : ""}`}>
        {!src && !failed && <span className="spin lb-spin" />}
        {failed && <p className="lb-fail">This file can’t be previewed.</p>}
        {src && <img src={src} alt={slides[i].title} draggable={false} onClick={() => setZoom((z) => !z)} style={{ transform: `rotate(${rot}deg)` }} />}
      </div>
      {slides.length > 1 && <>
        <button className="lb-nav prev" onClick={() => go(-1)} disabled={i === 0} aria-label="Previous"><Icon name="back" size={22} /></button>
        <button className="lb-nav next" onClick={() => go(1)} disabled={i === slides.length - 1} aria-label="Next"><Icon name="arrow" size={22} /></button>
      </>}
    </div>
  );
}
