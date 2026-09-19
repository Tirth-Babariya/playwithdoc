"use client";

import { useRef, useState } from "react";

/** Drag to compare the original with the result. */
export function CompareSlider({ before, after, beforeLabel, afterLabel }: { before: string; after: string; beforeLabel: string; afterLabel: string }) {
  const [pos, setPos] = useState(50);
  const box = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const set = (clientX: number) => { const r = box.current!.getBoundingClientRect(); setPos(Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100))); };

  return (
    <div className="cmpx">
      <div ref={box} className="cmpx-box"
        onPointerDown={(e) => { dragging.current = true; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); set(e.clientX); }}
        onPointerMove={(e) => dragging.current && set(e.clientX)}
        onPointerUp={() => (dragging.current = false)}>
        <img src={after} alt="After" draggable={false} />
        <img className="cmpx-before" src={before} alt="Before" draggable={false} style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }} />
        <span className="cmpx-tag l">{beforeLabel}</span>
        <span className="cmpx-tag r">{afterLabel}</span>
        <span className="cmpx-line" style={{ left: `${pos}%` }}><span role="slider" tabIndex={0} aria-label="Compare before and after" aria-valuenow={Math.round(pos)} aria-valuemin={0} aria-valuemax={100}
          onKeyDown={(e) => { if (e.key === "ArrowLeft") setPos((p) => Math.max(0, p - 4)); if (e.key === "ArrowRight") setPos((p) => Math.min(100, p + 4)); }} /></span>
      </div>
    </div>
  );
}
