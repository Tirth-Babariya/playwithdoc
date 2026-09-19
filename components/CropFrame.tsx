"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { decodeImage, type Decoded } from "@/lib/engines/common";
import { DEFAULT_CROP, type Crop, type Dims } from "@/lib/presets";
import { Icon } from "./Icon";

/**
 * Drag the photo to position it, zoom with the slider or mouse wheel. What you see in the frame is exactly
 * what gets saved (same maths as the engine in lib/engines/photo.ts).
 */
export function CropFrame({ file, dims, onChange }: { file: File; dims: Dims; onChange: (c: Crop) => void }) {
  const { w, h } = dims;
  const [img, setImg] = useState<Decoded | null>(null);
  const [error, setError] = useState("");
  const [crop, setCrop] = useState<Crop>(DEFAULT_CROP);
  const canvas = useRef<HTMLCanvasElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; dx: number; dy: number } | null>(null);

  // Preview size: as large as is comfortable, keeping the true aspect ratio.
  const cssW = Math.round(Math.min(400, Math.max(180, w >= h ? 400 : (400 * w) / h)));
  const cssH = Math.round((cssW * h) / w);

  useEffect(() => {
    let dead = false, dec: Decoded | undefined;
    setImg(null); setError("");
    decodeImage(file).then((d) => { if (dead) d.done(); else { dec = d; setImg(d); } }).catch((e) => setError(e?.message || "Couldn't open this image."));
    return () => { dead = true; dec?.done(); };
  }, [file]);

  // New frame shape → start over so nothing is cut off unexpectedly.
  useEffect(() => { setCrop(DEFAULT_CROP); }, [w, h, file]);
  useEffect(() => { onChange(crop); }, [crop, onChange]);

  const containZoom = useMemo(() => (img ? Math.min(w / img.w, h / img.h) / Math.max(w / img.w, h / img.h) : 0.5), [img, w, h]);

  useEffect(() => {
    const c = canvas.current;
    if (!c || !img) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(cssW * dpr); c.height = Math.round(cssH * dpr);
    const g = c.getContext("2d")!;
    const k = (cssW / w) * dpr;
    g.setTransform(k, 0, 0, k, 0, 0);
    g.imageSmoothingQuality = "high";
    g.fillStyle = "#fff"; g.fillRect(0, 0, w, h);
    const cover = Math.max(w / img.w, h / img.h);
    const s = cover * crop.zoom;
    g.drawImage(img.img, w / 2 + crop.dx * w - (img.w * s) / 2, h / 2 + crop.dy * h - (img.h * s) / 2, img.w * s, img.h * s);
  }, [img, crop, w, h, cssW, cssH]);

  // Wheel zoom needs a non-passive listener so the page doesn't scroll at the same time.
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => { e.preventDefault(); setCrop((c) => ({ ...c, zoom: Math.min(6, Math.max(containZoom * 0.9, c.zoom * (e.deltaY < 0 ? 1.06 : 0.94))) })); };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [containZoom]);

  const down = (e: React.PointerEvent) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, dx: crop.dx, dy: crop.dy }; };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    setCrop((c) => ({ ...c, dx: d.dx + (e.clientX - d.x) / cssW, dy: d.dy + (e.clientY - d.y) / cssH }));
  };
  const up = () => { drag.current = null; };

  if (error) return <div className="alert bad" role="alert">{error}</div>;
  if (!img) return <div className="pg-loading"><span className="spin" /> Opening photo…</div>;

  const maxZoom = 6;
  const step = (f: number) => setCrop((c) => ({ ...c, zoom: Math.min(maxZoom, Math.max(containZoom * 0.9, c.zoom * f)) }));

  return (
    <div className="crop">
      <div className="crop-stage">
        <div ref={frame} className="crop-frame" style={{ width: cssW, height: cssH }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} role="img" aria-label="Photo frame — drag to reposition">
          <canvas ref={canvas} style={{ width: cssW, height: cssH }} />
          {dims.guide === "face" && (
            <svg className="crop-guide" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
              <ellipse cx="50" cy="44" rx="27" ry="34" />
              <line x1="0" y1="40" x2="100" y2="40" />
              <line x1="50" y1="0" x2="50" y2="100" />
            </svg>
          )}
          {dims.guide === "signature" && (
            <svg className="crop-guide" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
              <line x1="6" y1="70" x2="94" y2="70" />
              <rect x="3" y="12" width="94" height="76" rx="3" />
            </svg>
          )}
        </div>
        <p className="crop-hint"><Icon name="grip" size={13} /> Drag to position · scroll or use the slider to zoom</p>
      </div>

      <div className="crop-ctl">
        <div className="crop-size"><b>{w} × {h} px</b><span>{dims.short}{dims.maxKb ? ` · max ${dims.maxKb} KB` : ""}</span></div>
        <label className="field">
          <span className="field-label">Zoom <b>{Math.round(crop.zoom * 100)}%</b></span>
          <input type="range" min={containZoom * 0.9} max={maxZoom} step={0.005} value={crop.zoom}
            style={{ "--pct": `${((crop.zoom - containZoom * 0.9) / (maxZoom - containZoom * 0.9)) * 100}%` } as React.CSSProperties}
            onChange={(e) => setCrop((c) => ({ ...c, zoom: +e.target.value }))} />
        </label>
        <div className="crop-btns">
          <button className="btn btn-secondary btn-sm" onClick={() => step(0.9)}>−</button>
          <button className="btn btn-secondary btn-sm" onClick={() => step(1.1)}>+</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setCrop({ zoom: 1, dx: 0, dy: 0 })}>Fill frame</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setCrop({ zoom: containZoom, dx: 0, dy: 0 })}>Fit whole photo</button>
        </div>
      </div>
    </div>
  );
}
