"use client";

import { useEffect, useRef, useState } from "react";
import { openPdfJs, parsePages, UserError } from "@/lib/engines/common";
import { Icon } from "./Icon";

export type PageSpec = { i: number; rot: number; on: boolean };
type Mode = "organize" | "remove" | "extract";

// Render thumbnails one at a time so a 300-page PDF doesn't freeze the tab.
let chain: Promise<unknown> = Promise.resolve();
const enqueue = (fn: () => Promise<void>) => { chain = chain.then(fn).catch(() => {}); };

function Tile({ doc, spec, mode, pos, onToggle, onRotate, dnd }: {
  doc: any; spec: PageSpec; mode: Mode; pos: number;
  onToggle: () => void; onRotate: () => void;
  dnd: { draggable: boolean; onDragStart: () => void; onDragOver: (e: React.DragEvent) => void; onDrop: () => void; over: boolean };
}) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let dead = false;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      enqueue(async () => {
        if (dead || !canvas.current) return;
        const page = await doc.getPage(spec.i + 1);
        const w1 = page.getViewport({ scale: 1 }).width;
        const vp = page.getViewport({ scale: (240 * Math.min(window.devicePixelRatio || 1, 2)) / w1 });
        const c = canvas.current;
        if (!c) return;
        c.width = vp.width; c.height = vp.height;
        const g = c.getContext("2d")!;
        g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
        await page.render({ canvasContext: g, viewport: vp }).promise;
        page.cleanup();
        if (!dead) setReady(true);
      });
    }, { rootMargin: "400px" });
    io.observe(el);
    return () => { dead = true; io.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, spec.i]);

  const clickable = mode !== "organize";
  return (
    <div
      className={`pg${!spec.on ? " off" : ""}${mode === "extract" && spec.on ? " picked" : ""}${dnd.over ? " over" : ""}`}
      draggable={dnd.draggable} onDragStart={dnd.onDragStart} onDragOver={dnd.onDragOver} onDrop={dnd.onDrop}
    >
      <div ref={box} className={`pg-thumb${ready ? " ready" : ""}`} onClick={clickable ? onToggle : undefined} role={clickable ? "button" : undefined} tabIndex={clickable ? 0 : undefined}
        onKeyDown={clickable ? (e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); onToggle(); } } : undefined}
        aria-label={clickable ? `${mode === "remove" ? "Remove" : "Select"} page ${spec.i + 1}` : undefined} aria-pressed={clickable ? (mode === "extract" ? spec.on : !spec.on) : undefined}>
        <canvas ref={canvas} style={{ transform: `rotate(${spec.rot}deg)`, scale: spec.rot % 180 ? "0.72" : "1" }} />
        {mode === "remove" && !spec.on && <span className="pg-badge bad"><Icon name="x" size={16} /></span>}
        {mode === "extract" && spec.on && <span className="pg-badge good"><Icon name="check" size={16} /></span>}
        {mode === "organize" && (
          <span className="pg-tools">
            <button onClick={(e) => { e.stopPropagation(); onRotate(); }} aria-label="Rotate page" title="Rotate"><Icon name="rotate" size={14} /></button>
            <button onClick={(e) => { e.stopPropagation(); onToggle(); }} aria-label={spec.on ? "Delete page" : "Restore page"} title={spec.on ? "Delete" : "Restore"}><Icon name={spec.on ? "trash" : "plus"} size={14} /></button>
          </span>
        )}
      </div>
      <div className="pg-num">{mode === "organize" ? pos + 1 : spec.i + 1}{mode === "organize" && spec.i !== pos ? <small> · was {spec.i + 1}</small> : null}</div>
    </div>
  );
}

export function PageGrid({ file, mode, onChange }: { file: File; mode: Mode; onChange: (p: PageSpec[]) => void }) {
  const [doc, setDoc] = useState<any>(null);
  const [pages, setPages] = useState<PageSpec[]>([]);
  const [error, setError] = useState("");
  const [range, setRange] = useState("");
  const [rangeErr, setRangeErr] = useState("");
  const dragFrom = useRef<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  useEffect(() => {
    let dead = false, d: any;
    setDoc(null); setError("");
    openPdfJs(file).then((pdf) => {
      d = pdf;
      if (dead) { pdf.destroy(); return; }
      setDoc(pdf);
      setPages(Array.from({ length: pdf.numPages }, (_, i) => ({ i, rot: 0, on: mode !== "extract" })));
    }).catch((e) => setError(e instanceof UserError ? e.message : "Couldn't read this PDF."));
    return () => { dead = true; d?.destroy(); };
  }, [file, mode]);

  useEffect(() => { onChange(pages); }, [pages, onChange]);

  const update = (fn: (p: PageSpec[]) => PageSpec[]) => setPages((p) => fn(p));
  const applyRange = (v: string) => {
    setRange(v);
    if (!v.trim()) { setRangeErr(""); return; }
    try {
      const set = new Set(parsePages(v, pages.length));
      setRangeErr("");
      update((p) => p.map((s) => ({ ...s, on: mode === "extract" ? set.has(s.i) : !set.has(s.i) })));
    } catch (e) { setRangeErr(e instanceof UserError ? e.message : "Invalid range"); }
  };

  if (error) return <div className="alert bad" role="alert">{error}</div>;
  if (!doc) return <div className="pg-loading"><span className="spin" /> Reading pages…</div>;

  const kept = pages.filter((p) => p.on).length;
  return (
    <div className="pgs">
      <div className="pgs-bar">
        <div className="pgs-count"><b>{kept}</b> of {pages.length} pages will be in the new PDF</div>
        <span className="grow" />
        {mode !== "organize" && (
          <label className="pgs-range">
            <span>{mode === "remove" ? "Remove" : "Keep"}</span>
            <input value={range} onChange={(e) => applyRange(e.target.value)} placeholder="e.g. 1-3, 7" spellCheck={false} aria-invalid={!!rangeErr} />
          </label>
        )}
        {mode === "extract" && <><button className="btn btn-ghost btn-sm" onClick={() => update((p) => p.map((s) => ({ ...s, on: true })))}>Select all</button><button className="btn btn-ghost btn-sm" onClick={() => update((p) => p.map((s) => ({ ...s, on: false })))}>Clear</button></>}
        {mode === "remove" && <button className="btn btn-ghost btn-sm" onClick={() => { setRange(""); update((p) => p.map((s) => ({ ...s, on: true }))); }}>Restore all</button>}
        {mode === "organize" && <>
          <button className="btn btn-ghost btn-sm" onClick={() => update((p) => [...p].reverse())}><Icon name="swap" size={14} /> Reverse</button>
          <button className="btn btn-ghost btn-sm" onClick={() => update((p) => p.map((s) => ({ ...s, rot: (s.rot + 90) % 360 })))}><Icon name="rotate" size={14} /> Rotate all</button>
        </>}
      </div>
      {rangeErr && <div className="field-err">{rangeErr}</div>}
      <p className="pgs-hint">
        {mode === "organize" ? "Drag pages to reorder. Hover a page to rotate or delete it." : mode === "remove" ? "Click any page to mark it for removal." : "Click the pages you want to keep."}
      </p>
      <div className="pgs-grid">
        {pages.map((s, pos) => (
          <Tile key={s.i} doc={doc} spec={s} mode={mode} pos={pos}
            onToggle={() => update((p) => p.map((x) => (x.i === s.i ? { ...x, on: !x.on } : x)))}
            onRotate={() => update((p) => p.map((x) => (x.i === s.i ? { ...x, rot: (x.rot + 90) % 360 } : x)))}
            dnd={{
              draggable: mode === "organize",
              over: over === pos && dragFrom.current !== pos,
              onDragStart: () => { dragFrom.current = pos; },
              onDragOver: (e) => { if (mode === "organize") { e.preventDefault(); setOver(pos); } },
              onDrop: () => {
                const from = dragFrom.current;
                dragFrom.current = null; setOver(null);
                if (from === null || from === pos) return;
                update((p) => { const c = [...p]; const [m] = c.splice(from, 1); c.splice(pos, 0, m); return c; });
              },
            }} />
        ))}
      </div>
    </div>
  );
}
