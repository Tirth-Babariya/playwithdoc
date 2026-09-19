"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Ann, ImageAnn, RectAnn, TextAnn } from "@/lib/annotations";
import { openPdfJs, UserError } from "@/lib/engines/common";
import { Icon } from "./Icon";
import { SignatureModal } from "./SignatureModal";

type Mode = "sign" | "edit" | "redact";
type ToolId = "select" | "text" | "highlight" | "whiteout" | "box" | "draw" | "redact";

const TOOLS: Record<ToolId, { label: string; icon: string; hint: string }> = {
  select: { label: "Select", icon: "cursor", hint: "Move and resize" },
  text: { label: "Text", icon: "text", hint: "Click the page to type" },
  highlight: { label: "Highlight", icon: "highlight", hint: "Drag over text" },
  whiteout: { label: "Whiteout", icon: "box", hint: "Drag to cover something" },
  box: { label: "Box", icon: "boxline", hint: "Drag to draw an outline" },
  draw: { label: "Draw", icon: "pen", hint: "Draw freehand" },
  redact: { label: "Redact", icon: "redact", hint: "Drag over anything to remove permanently" },
};
const BY_MODE: Record<Mode, ToolId[]> = {
  sign: ["select", "text", "draw"],
  edit: ["select", "text", "highlight", "whiteout", "box", "draw"],
  redact: ["redact", "select"],
};
const COLORS = ["#111111", "#1d4ed8", "#dc2626", "#16a34a"];
const uid = () => Math.random().toString(36).slice(2, 10);
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));

type Drag =
  | { kind: "move"; id: string; sx: number; sy: number; ox: number; oy: number }
  | { kind: "resize"; id: string; sx: number; ox: number; ow: number; oh: number; osize: number; ratio: number }
  | { kind: "create"; id: string; sx: number; sy: number }
  | { kind: "ink"; id: string };

export function PdfEditor({ file, mode, onChange }: { file: File; mode: Mode; onChange: (a: Ann[]) => void }) {
  const [doc, setDoc] = useState<any>(null);
  const [count, setCount] = useState(0);
  const [pageNo, setPageNo] = useState(0);
  const [asp, setAsp] = useState(0.707);
  const [anns, setAnns] = useState<Ann[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [tool, setTool] = useState<ToolId>(mode === "redact" ? "redact" : mode === "sign" ? "select" : "text");
  const [color, setColor] = useState("#111111");
  const [error, setError] = useState("");
  const [sigOpen, setSigOpen] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const over = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const history = useRef<Ann[][]>([]);
  const ratios = useRef(new Map<string, number>());
  const imgInput = useRef<HTMLInputElement>(null);
  const focusedFor = useRef<string | null>(null);
  const textEls = useRef(new Map<string, HTMLElement>());
  const pendingFocus = useRef<string | null>(null);
  const focusText = (el: HTMLElement) => { el.focus(); const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s?.removeAllRanges(); s?.addRange(r); };
  const annsRef = useRef<Ann[]>([]);
  annsRef.current = anns;

  useEffect(() => { onChange(anns); }, [anns, onChange]);

  useEffect(() => {
    let dead = false, d: any;
    setDoc(null); setError(""); setAnns([]); setPageNo(0);
    openPdfJs(file).then((pdf) => { d = pdf; if (dead) { pdf.destroy(); return; } setDoc(pdf); setCount(pdf.numPages); })
      .catch((e) => setError(e instanceof UserError ? e.message : "Couldn't open this PDF."));
    return () => { dead = true; d?.destroy(); };
  }, [file]);

  // Render the current page.
  useEffect(() => {
    if (!doc) return;
    let dead = false, task: any;
    (async () => {
      const page = await doc.getPage(pageNo + 1);
      const base = page.getViewport({ scale: 1 });
      setAsp(base.width / base.height);
      const vp = page.getViewport({ scale: (900 * Math.min(devicePixelRatio || 1, 2)) / base.width });
      const c = canvas.current;
      if (!c || dead) return;
      c.width = vp.width; c.height = vp.height;
      const g = c.getContext("2d")!;
      g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
      task = page.render({ canvasContext: g, viewport: vp });
      try { await task.promise; } catch { /* cancelled */ }
      page.cleanup();
    })();
    return () => { dead = true; task?.cancel?.(); };
  }, [doc, pageNo]);

  const snapshot = () => { history.current.push(annsRef.current); if (history.current.length > 60) history.current.shift(); };
  const undo = () => { const p = history.current.pop(); if (p) { setAnns(p); setSel(null); setEditing(null); } };
  const patch = (id: string, fn: (a: Ann) => Ann) => setAnns((s) => s.map((a) => (a.id === id ? fn(a) : a)));
  const remove = (id: string) => { snapshot(); setAnns((s) => s.filter((a) => a.id !== id)); setSel(null); setEditing(null); };

  const pt = (e: { clientX: number; clientY: number }) => {
    const r = over.current!.getBoundingClientRect();
    return { x: clamp((e.clientX - r.left) / r.width), y: clamp((e.clientY - r.top) / r.height) };
  };

  const addImage = useCallback((src: string, widthFrac = 0.3) => {
    const img = new Image();
    img.onload = () => {
      const ratioPx = img.naturalHeight / img.naturalWidth;
      const w = widthFrac, h = w * ratioPx / asp; // convert pixel ratio to page-fraction space
      const a: ImageAnn = { id: uid(), page: pageNo, kind: "image", x: clamp(0.5 - w / 2, 0, 1 - w), y: clamp(0.5 - h / 2, 0, 1 - h), w, h, src };
      ratios.current.set(a.id, h / w);
      snapshot();
      setAnns((s) => [...s, a]); setSel(a.id); setTool("select");
    };
    img.src = src;
  }, [asp, pageNo]);

  const addDate = () => {
    const a: TextAnn = { id: uid(), page: pageNo, kind: "text", x: 0.55, y: 0.85, w: 0.3, h: 0.03, text: new Date().toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }), size: 0.02, color: "#111111" };
    snapshot(); setAnns((s) => [...s, a]); setSel(a.id); setTool("select");
  };

  const onBgDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest(".ann")) return;
    const p = pt(e);
    setSel(null); setEditing(null);
    if (tool === "text") {
      const a: TextAnn = { id: uid(), page: pageNo, kind: "text", x: clamp(p.x, 0, 0.5), y: clamp(p.y - 0.01, 0, 0.95), w: 0.5, h: 0.03, text: "Text", size: 0.022, color };
      snapshot(); setAnns((s) => [...s, a]); setSel(a.id); setEditing(a.id); pendingFocus.current = a.id; return;
    }
    if (tool === "highlight" || tool === "whiteout" || tool === "box" || tool === "redact") {
      const spec = tool === "highlight" ? { color: "#ffe600", opacity: 0.38, style: "fill" as const }
        : tool === "whiteout" ? { color: "#ffffff", opacity: 1, style: "fill" as const }
        : tool === "redact" ? { color: "#000000", opacity: 1, style: "fill" as const, redact: true }
        : { color, opacity: 1, style: "outline" as const };
      const a: RectAnn = { id: uid(), page: pageNo, kind: "rect", x: p.x, y: p.y, w: 0, h: 0, ...spec };
      snapshot(); setAnns((s) => [...s, a]);
      drag.current = { kind: "create", id: a.id, sx: p.x, sy: p.y };
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } else if (tool === "draw") {
      snapshot();
      const a: Ann = { id: uid(), page: pageNo, kind: "ink", x: 0, y: 0, w: 1, h: 1, points: [[p.x, p.y]], color, width: 0.0035 };
      setAnns((s) => [...s, a]);
      drag.current = { kind: "ink", id: a.id };
      (e.target as Element).setPointerCapture?.(e.pointerId);
    }
  };

  const startMove = (e: React.PointerEvent, a: Ann) => {
    if (editing === a.id) return;
    if (tool === "draw" || tool === "highlight" || tool === "whiteout" || tool === "box" || tool === "redact") return;
    e.stopPropagation();
    setSel(a.id);
    const p = pt(e);
    snapshot();
    drag.current = { kind: "move", id: a.id, sx: p.x, sy: p.y, ox: a.x, oy: a.y };
    over.current!.setPointerCapture?.(e.pointerId);
  };
  const startResize = (e: React.PointerEvent, a: Ann) => {
    e.stopPropagation();
    const p = pt(e);
    snapshot();
    drag.current = { kind: "resize", id: a.id, sx: p.x, ox: a.x, ow: a.w, oh: a.h, osize: a.kind === "text" ? a.size : 0, ratio: ratios.current.get(a.id) ?? (a.w ? a.h / a.w : 1) };
    over.current!.setPointerCapture?.(e.pointerId);
  };

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = pt(e);
    if (d.kind === "move") {
      patch(d.id, (a) => ({ ...a, x: clamp(d.ox + p.x - d.sx, 0, 1 - a.w), y: clamp(d.oy + p.y - d.sy, 0, 1 - (a.kind === "text" ? 0.02 : a.h)) }));
    } else if (d.kind === "resize") {
      patch(d.id, (a) => {
        const w = clamp(d.ow + (p.x - d.sx), 0.04, 1 - a.x);
        if (a.kind === "text") return { ...a, w, size: clamp(d.osize * (w / d.ow), 0.008, 0.12) };
        if (a.kind === "image") return { ...a, w, h: w * d.ratio };
        return { ...a, w, h: clamp(a.h + (p.y - (a.y + a.h)), 0.005, 1 - a.y) };
      });
    } else if (d.kind === "create") {
      patch(d.id, (a) => ({ ...a, x: Math.min(p.x, d.sx), y: Math.min(p.y, d.sy), w: Math.abs(p.x - d.sx), h: Math.abs(p.y - d.sy) }));
    } else if (d.kind === "ink") {
      patch(d.id, (a) => (a.kind === "ink" ? { ...a, points: [...a.points, [p.x, p.y]] } : a));
    }
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (pendingFocus.current) { const el = textEls.current.get(pendingFocus.current); pendingFocus.current = null; if (el) focusText(el); }
    if (d?.kind === "create") {
      setAnns((s) => { const a = s.find((x) => x.id === d.id); return a && (a.w < 0.006 || a.h < 0.004) ? s.filter((x) => x.id !== d.id) : s; });
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); }
      else if ((e.key === "Delete" || e.key === "Backspace") && sel) { e.preventDefault(); remove(sel); }
      else if (e.key === "Escape") { setSel(null); setEditing(null); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel]);

  if (error) return <div className="alert bad" role="alert">{error}</div>;
  if (!doc) return <div className="pg-loading"><span className="spin" /> Opening PDF…</div>;

  const list = anns.filter((a) => a.page === pageNo);
  const selected = anns.find((a) => a.id === sel);
  const tools = BY_MODE[mode];
  const paintColor = tool === "text" || tool === "draw" || tool === "box" || selected?.kind === "text" || selected?.kind === "ink";
  const setColorAll = (c: string) => { setColor(c); if (selected && (selected.kind === "text" || selected.kind === "ink" || (selected.kind === "rect" && selected.style === "outline"))) patch(selected.id, (a) => ({ ...a, color: c } as Ann)); };

  return (
    <div className="ed">
      <div className="ed-bar" role="toolbar" aria-label="Editing tools">
        {tools.map((t) => (
          <button key={t} className={`ed-tool${tool === t ? " on" : ""}`} onClick={() => setTool(t)} title={TOOLS[t].hint} aria-pressed={tool === t}>
            <Icon name={TOOLS[t].icon} size={16} /><span>{TOOLS[t].label}</span>
          </button>
        ))}
        {mode !== "redact" && <>
          <span className="ed-sep" />
          <button className="ed-tool sig" onClick={() => setSigOpen(true)} title="Draw, type or upload your signature"><Icon name="signature" size={16} /><span>Signature</span></button>
          <button className="ed-tool" onClick={() => imgInput.current?.click()} title="Insert an image"><Icon name="image" size={16} /><span>Image</span></button>
          {mode === "sign" && <button className="ed-tool" onClick={addDate} title="Add today’s date"><Icon name="calendar" size={16} /><span>Date</span></button>}
        </>}
        <span className="grow" />
        {paintColor && (
          <span className="ed-colors" aria-label="Color">
            {COLORS.map((c) => <button key={c} className={color === c ? "on" : ""} style={{ background: c }} onClick={() => setColorAll(c)} aria-label={`Color ${c}`} />)}
          </span>
        )}
        {selected?.kind === "text" && (
          <span className="ed-text">
            <button onClick={() => patch(selected.id, (a) => ({ ...a, size: clamp((a as TextAnn).size * 0.9, 0.008, 0.12) } as Ann))} aria-label="Smaller text">A−</button>
            <button onClick={() => patch(selected.id, (a) => ({ ...a, size: clamp((a as TextAnn).size * 1.1, 0.008, 0.12) } as Ann))} aria-label="Larger text">A+</button>
            <button className={selected.bold ? "on" : ""} onClick={() => patch(selected.id, (a) => ({ ...a, bold: !(a as TextAnn).bold } as Ann))} aria-label="Bold"><b>B</b></button>
          </span>
        )}
        <button className="ed-tool ghost" onClick={undo} disabled={!history.current.length} title="Undo (Ctrl+Z)"><Icon name="undo" size={16} /></button>
        <button className="ed-tool ghost del" onClick={() => sel && remove(sel)} disabled={!sel} title="Delete selected (Del)"><Icon name="trash" size={16} /></button>
      </div>

      <p className="ed-hint">{TOOLS[tool].hint}{mode === "redact" && " — covered pages are flattened, so the text underneath is permanently removed."}</p>

      <div className="ed-stage">
        <div className="ed-page" style={{ aspectRatio: String(asp) }}>
          <canvas ref={canvas} />
          <div ref={over} className="ed-over" data-tool={tool} onPointerDown={onBgDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
            {list.map((a) => {
              const box = { left: `${a.x * 100}%`, top: `${a.y * 100}%`, width: `${a.w * 100}%`, height: `${a.h * 100}%` };
              const isSel = sel === a.id;
              if (a.kind === "ink") {
                return (
                  <svg key={a.id} className="ann-ink" viewBox={`0 0 ${asp * 1000} 1000`} preserveAspectRatio="none">
                    <polyline points={a.points.map(([x, y]) => `${(x * asp * 1000).toFixed(1)},${(y * 1000).toFixed(1)}`).join(" ")} fill="none" stroke={a.color} strokeWidth={a.width * 1000} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                );
              }
              return (
                <div key={a.id} className={`ann ${a.kind}${isSel ? " sel" : ""}${a.kind === "rect" && a.redact ? " redact" : ""}`}
                  style={a.kind === "text" ? { left: box.left, top: box.top, width: box.width } : box}
                  onPointerDown={(e) => startMove(e, a)}
                  onDoubleClick={() => { if (a.kind === "text") { focusedFor.current = null; setEditing(a.id); } }}>
                  {a.kind === "rect" && <span className="ann-fill" style={a.style === "fill" ? { background: a.color, opacity: a.opacity } : { border: `2px solid ${a.color}` }} />}
                  {a.kind === "image" && <img src={a.src} alt="" draggable={false} />}
                  {a.kind === "text" && (
                    <div className="ann-text" contentEditable={editing === a.id} suppressContentEditableWarning spellCheck={false}
                      style={{ fontSize: `${a.size * 100}cqh`, color: a.color, fontWeight: a.bold ? 700 : 400 }}
                      ref={(el) => {
                        if (!el) { textEls.current.delete(a.id); return; }
                        textEls.current.set(a.id, el);
                        if (editing !== a.id || focusedFor.current === a.id) return;
                        focusedFor.current = a.id;
                        // The click that created this box steals focus on mouse-up, so focus again shortly after too.
                        setTimeout(() => { if (document.activeElement !== el) focusText(el); }, 30);
                      }}
                      onBlur={(e) => { focusedFor.current = null; if (editing === a.id) { const t = e.currentTarget.innerText.replace(/\n$/, ""); setEditing(null); if (!t.trim()) remove(a.id); else patch(a.id, (x) => ({ ...x, text: t } as Ann)); } }}
                      onKeyDown={(e) => { if (e.key === "Escape") (e.currentTarget as HTMLElement).blur(); }}>
                      {a.text}
                    </div>
                  )}
                  {isSel && !editing && <>
                    <span className="ann-handle" onPointerDown={(e) => startResize(e, a)} />
                    <button className="ann-del" onPointerDown={(e) => e.stopPropagation()} onClick={() => remove(a.id)} aria-label="Delete"><Icon name="x" size={12} /></button>
                  </>}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {count > 1 && (
        <div className="ed-pages">
          <button className="btn btn-secondary btn-sm" onClick={() => setPageNo((p) => Math.max(0, p - 1))} disabled={pageNo === 0}><Icon name="back" size={14} /> Prev</button>
          <span>Page <b>{pageNo + 1}</b> of {count}{anns.filter((a) => a.page === pageNo).length ? "" : ""}</span>
          <button className="btn btn-secondary btn-sm" onClick={() => setPageNo((p) => Math.min(count - 1, p + 1))} disabled={pageNo === count - 1}>Next <Icon name="arrow" size={14} /></button>
        </div>
      )}

      <input ref={imgInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => {
        const f = e.target.files?.[0]; e.target.value = "";
        if (!f) return;
        const r = new FileReader();
        r.onload = () => {
          // Normalise to PNG/JPEG so it can always be embedded.
          const im = new Image();
          im.onload = () => { const c = document.createElement("canvas"); c.width = im.naturalWidth; c.height = im.naturalHeight; c.getContext("2d")!.drawImage(im, 0, 0); addImage(c.toDataURL("image/png"), 0.3); };
          im.src = String(r.result);
        };
        r.readAsDataURL(f);
      }} />
      {sigOpen && <SignatureModal onClose={() => setSigOpen(false)} onDone={(src) => { setSigOpen(false); addImage(src, 0.28); }} />}
    </div>
  );
}
