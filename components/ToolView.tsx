"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Ann } from "@/lib/annotations";
import { UserError, zipOuts } from "@/lib/engines/common";
import { FORMATS, IMAGE_FMTS, fmtBytes, typeOfFile, type Fmt } from "@/lib/formats";
import { setPending, takePending } from "@/lib/handoff";
import { pushRecent } from "@/lib/recent";
import { getTool, toolsForFormat } from "@/lib/tools";
import type { OptionSpec, Opts, Result } from "@/lib/types";
import { CompareSlider } from "./CompareSlider";
import { usePalette } from "./CommandPalette";
import { fileSlide, PdfStrip, pdfPageSlide, ThumbView, useThumb, type Slide } from "./FilePreview";
import { FormatChip } from "./FormatChip";
import { Icon, toolIcon } from "./Icon";
import { Lightbox } from "./Lightbox";
import { NetBadge } from "./NetBadge";
import { PageGrid, type PageSpec } from "./PageGrid";
import { PdfEditor } from "./PdfEditor";
import { useToast } from "./Toast";

type Item = { id: string; file: File; type: Fmt | null; rot: number };
const uid = () => Math.random().toString(36).slice(2, 10);

function defaults(specs: OptionSpec[] | undefined): Opts {
  const o: Opts = {};
  for (const s of specs ?? []) o[s.key] = s.default;
  return o;
}

function Field({ spec, value, onChange }: { spec: OptionSpec; value: any; onChange: (v: any) => void }) {
  const id = `opt-${spec.key}`;
  return (
    <div className="field">
      <label htmlFor={id} className="field-label">{spec.label}{spec.type === "range" && <b>{(spec.format ?? String)(value)}</b>}</label>
      {spec.type === "select" && (spec.options.length <= 4 ? (
        <div className="seg" role="radiogroup" aria-label={spec.label}>
          {spec.options.map((o) => (
            <button key={o.value} role="radio" aria-checked={value === o.value} className={value === o.value ? "on" : ""} onClick={() => onChange(o.value)} title={o.hint}>{o.label}</button>
          ))}
        </div>
      ) : (
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>{spec.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
      ))}
      {spec.type === "select" && spec.options.find((o) => o.value === value)?.hint && <div className="field-help">{spec.options.find((o) => o.value === value)!.hint}</div>}
      {spec.type === "range" && <input id={id} type="range" min={spec.min} max={spec.max} step={spec.step} value={value} onChange={(e) => onChange(+e.target.value)} />}
      {spec.type === "text" && <input id={id} type={spec.secret ? "password" : "text"} autoComplete={spec.secret ? "off" : undefined} value={value ?? ""} placeholder={spec.placeholder} onChange={(e) => onChange(e.target.value)} spellCheck={false} />}
      {spec.type === "number" && (
        <div className="num">
          <input id={id} type="number" min={spec.min} max={spec.max} value={value} onChange={(e) => onChange(e.target.value === "" ? "" : +e.target.value)} />
          {spec.suffix && <span>{spec.suffix}</span>}
        </div>
      )}
      {spec.help && <div className="field-help">{spec.help}</div>}
    </div>
  );
}

type DnD = { draggable: boolean; onDragStart: (e: React.DragEvent) => void; onDragOver: (e: React.DragEvent) => void; onDragEnd: () => void };

function FileCard({ it, idx, total, sort, single, canRotate, dragging, onRemove, onMove, onRotate, onReplace, onOpen, dnd }: {
  it: Item; idx: number; total: number; sort: boolean; single: boolean; canRotate: boolean; dragging: boolean;
  onRemove: () => void; onMove: (d: number) => void; onRotate: () => void; onReplace: () => void; onOpen: () => void; dnd: DnD;
}) {
  const thumb = useThumb(it.file, it.type);
  const ordered = sort && total > 1;
  const onKey = (e: React.KeyboardEvent) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); if (!single) onRemove(); }
    else if (e.key.toLowerCase() === "r" && canRotate) { e.preventDefault(); onRotate(); }
    else if (e.altKey && e.key === "ArrowLeft" && ordered) { e.preventDefault(); onMove(-1); }
    else if (e.altKey && e.key === "ArrowRight" && ordered) { e.preventDefault(); onMove(1); }
    else if ((e.key === "Enter" || e.key === " ") && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); onOpen(); }
  };
  return (
    <li className={`fc${dragging ? " dragging" : ""}${single ? " wide" : ""}`} data-fid={it.id} tabIndex={0} onKeyDown={onKey} aria-label={`${it.file.name}. Press Enter to preview${canRotate ? ", R to rotate" : ""}${ordered ? ", Alt and arrows to reorder" : ""}, Delete to remove.`} {...dnd}>
      <div className="fc-media" onClick={onOpen} role="button" aria-label={`Preview ${it.file.name}`}>
        <ThumbView thumb={thumb} type={it.type} rot={it.rot} />
        {ordered && <span className="fc-idx">{idx + 1}</span>}
        <span className="fc-tools" onClick={(e) => e.stopPropagation()}>
          {canRotate && <button onClick={onRotate} aria-label={`Rotate ${it.file.name}`} title="Rotate 90° (R)"><Icon name="rotate" size={15} /></button>}
          {!single && <button className="del" onClick={onRemove} aria-label={`Remove ${it.file.name}`} title="Remove (Del)"><Icon name="trash" size={15} /></button>}
        </span>
        {ordered && (
          <span className="fc-mv" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => onMove(-1)} disabled={idx === 0} aria-label="Move earlier"><Icon name="back" size={14} /></button>
            <button onClick={() => onMove(1)} disabled={idx === total - 1} aria-label="Move later"><Icon name="arrow" size={14} /></button>
          </span>
        )}
      </div>
      <div className="fc-meta">
        <b title={it.file.name}>{it.file.name}</b>
        <small>{it.type && <FormatChip f={it.type} size="sm" />} {fmtBytes(it.file.size)}{thumb.meta ? ` · ${thumb.meta}` : ""}</small>
        {single && <span className="fc-actions"><button className="btn btn-secondary btn-sm" onClick={onReplace}>Change file</button><button className="btn btn-ghost btn-sm" onClick={onRemove}>Remove</button></span>}
      </div>
    </li>
  );
}

function OutRow({ f, name, onRename, url, preview, primary }: { f: { name: string; blob: Blob }; name: string; onRename: (n: string) => void; url: string; preview: boolean; primary: boolean }) {
  const t = typeOfFile(f);
  const thumb = useThumb(f.blob, preview ? t : null);
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot) : "";
  return (
    <li>
      <span className="out-th">{thumb.src ? <img src={thumb.src} alt="" /> : t ? <FormatChip f={t} /> : <Icon name="file" />}</span>
      <span className="out-name">
        <span className="out-edit" title="Click to rename before downloading">
          <span className="out-fit">
            <span className="out-sizer" aria-hidden>{stem || " "}</span>
            <input value={stem} onChange={(e) => onRename(`${e.target.value.replace(/[\\/:*?"<>|]/g, "")}${ext}`)} onFocus={(e) => e.currentTarget.select()} aria-label="File name" spellCheck={false} />
          </span>
          <em>{ext}</em><Icon name="edit" size={13} />
        </span>
        {thumb.meta && <small>{thumb.meta}</small>}
      </span>
      <span className="muted out-size">{fmtBytes(f.blob.size)}</span>
      <a className={`btn ${primary ? "btn-primary" : "btn-secondary"} btn-sm`} href={url} download={name || f.name}><Icon name="download" size={15} /> Download</a>
    </li>
  );
}

function Stepper({ step }: { step: 1 | 2 | 3 }) {
  const items = ["Add files", "Customize", "Download"];
  return (
    <ol className="stepper" aria-label="Progress">
      {items.map((l, i) => (
        <li key={l} className={step > i + 1 ? "past" : step === i + 1 ? "now" : ""}>
          <span>{step > i + 1 ? <Icon name="check" size={12} /> : i + 1}</span>{l}
        </li>
      ))}
    </ol>
  );
}

const EDITOR_LABEL = { sign: "Save signed PDF", edit: "Save edited PDF", redact: "Redact & save" } as const;

export function ToolView({ slug }: { slug: string }) {
  const tool = getTool(slug)!;
  const router = useRouter();
  const toast = useToast();
  const { mod } = usePalette();
  const [items, setItems] = useState<Item[]>([]);
  const [opts, setOpts] = useState<Opts>(() => defaults(tool.options));
  const [pages, setPages] = useState<PageSpec[]>([]);
  const [anns, setAnns] = useState<Ann[]>([]);
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");
  const [prog, setProg] = useState({ p: 0, label: "" });
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [names, setNames] = useState<string[]>([]);
  const [secs, setSecs] = useState(0);
  const [hover, setHover] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [est, setEst] = useState<{ bytes: number; before: number; busy: boolean } | null>(null);
  const [lb, setLb] = useState<{ slides: Slide[]; start: number; map?: number[] } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragId = useRef<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const listRef = useRef<HTMLUListElement>(null);
  const rects = useRef(new Map<string, { x: number; y: number }>());
  const lastOrder = useRef("");
  const autorun = useRef(false);
  const runId = useRef(0);

  const allowed = useMemo(() => new Set<Fmt>(tool.from), [tool]);

  const addFiles = useCallback((list: File[]) => {
    const good = list.filter((f) => { const t = typeOfFile(f); return !!t && allowed.has(t); });
    const bad = list.filter((f) => !good.includes(f));
    setNotice(bad.length ? `Skipped ${bad.length === 1 ? `“${bad[0].name}”` : `${bad.length} files`} — ${tool.name} accepts ${tool.from.map((f) => FORMATS[f].label).join(", ")} only.` : "");
    if (!good.length) return;
    const make = (file: File): Item => ({ id: uid(), file, type: typeOfFile(file), rot: 0 });
    const fresh = (tool.multi ? good : good.slice(0, 1)).map(make);
    setErr(""); setResult(null); setPhase("idle");
    setItems((prev) => {
      if (prev.length === 0 && tool.autorun) autorun.current = true;
      if (!tool.multi) return fresh;
      return [...prev, ...fresh];
    });
  }, [allowed, tool]);

  // Files handed over from the home page or a previous tool.
  useEffect(() => {
    const f = takePending();
    if (f.length) addFiles(f);
  }, [addFiles]);

  // Paste files/screenshots straight from the clipboard.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])];
      if (files.length) { e.preventDefault(); addFiles(files); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addFiles]);

  const removeItem = (id: string) => setItems((p) => p.filter((x) => x.id !== id));
  const move = (from: number, to: number) => setItems((p) => {
    if (to < 0 || to >= p.length || from === to) return p;
    const c = [...p]; const [m] = c.splice(from, 1); c.splice(to, 0, m); return c;
  });
  const rotateItem = (id: string) => setItems((p) => p.map((x) => (x.id === id ? { ...x, rot: (x.rot + 90) % 360 } : x)));
  const rotateAll = () => setItems((p) => p.map((x) => ({ ...x, rot: (x.rot + 90) % 360 })));
  const sortByName = () => {
    setItems((p) => [...p].sort((a, b) => a.file.name.localeCompare(b.file.name, undefined, { numeric: true }) * (sortAsc ? 1 : -1)));
    setSortAsc((v) => !v);
  };
  // Live reorder while dragging: the dragged card takes the slot of the card it's hovering.
  const hoverSwap = (overId: string) => {
    const from = dragId.current;
    if (!from || from === overId) return;
    setItems((p) => {
      const f = p.findIndex((x) => x.id === from), t = p.findIndex((x) => x.id === overId);
      if (f < 0 || t < 0 || f === t) return p;
      const c = [...p]; const [m] = c.splice(f, 1); c.splice(t, 0, m); return c;
    });
  };

  // FLIP: cards glide to their new slots instead of teleporting.
  const orderKey = items.map((i) => i.id).join(",");
  useLayoutEffect(() => {
    const ul = listRef.current;
    if (!ul) return;
    const base = ul.getBoundingClientRect();
    const next = new Map<string, { x: number; y: number }>();
    const animate = lastOrder.current !== orderKey && !matchMedia("(prefers-reduced-motion: reduce)").matches;
    ul.querySelectorAll<HTMLElement>("[data-fid]").forEach((el) => {
      const r = el.getBoundingClientRect();
      const pos = { x: r.left - base.left, y: r.top - base.top };
      next.set(el.dataset.fid!, pos);
      const prev = rects.current.get(el.dataset.fid!);
      if (animate && prev && (prev.x !== pos.x || prev.y !== pos.y)) {
        el.animate([{ transform: `translate(${prev.x - pos.x}px, ${prev.y - pos.y}px)` }, { transform: "none" }], { duration: 260, easing: "cubic-bezier(.2,.8,.2,1)" });
      }
    });
    rects.current = next;
    lastOrder.current = orderKey;
  });

  const run = useCallback(async () => {
    if (!items.length) return;
    const id = ++runId.current;
    setErr(""); setPhase("running"); setProg({ p: 0, label: "Starting…" });
    const t0 = performance.now();
    try {
      const runner = await tool.load();
      const res = await runner(items.map((i) => i.file), {
        opts: { ...opts, pages: tool.pages ? pages : undefined, annotations: tool.editor ? anns : undefined, rotations: items.map((i) => i.rot) },
        progress: (p, label) => { if (runId.current === id) setProg((prev) => ({ p, label: label ?? prev.label })); },
      });
      if (runId.current !== id) return;
      setSecs((performance.now() - t0) / 1000);
      setResult(res);
      setNames(res.files.map((f) => f.name));
      setPhase("done");
      pushRecent(tool.slug);
    } catch (e) {
      if (runId.current !== id) return;
      console.error(e);
      setErr(e instanceof UserError ? e.message : "Something went wrong while processing. The file may be unsupported or too large for your browser's memory.");
      setPhase("idle");
    }
  }, [items, opts, pages, anns, tool]);

  useEffect(() => {
    if (autorun.current && items.length && phase === "idle") { autorun.current = false; run(); }
  }, [items, phase, run]);

  // Live output-size estimate (first file only) for compress / resize.
  const optsKey = JSON.stringify(opts);
  const firstId = items[0]?.id;
  useEffect(() => {
    if (!tool.estimate || !firstId || phase !== "idle") { setEst(null); return; }
    let dead = false;
    setEst((e) => (e ? { ...e, busy: true } : { bytes: 0, before: items[0].file.size, busy: true }));
    const t = setTimeout(async () => {
      try {
        const runner = await tool.load();
        const res = await runner([items[0].file], { opts: JSON.parse(optsKey), progress: () => {} });
        if (!dead) setEst({ bytes: res.files[0].blob.size, before: items[0].file.size, busy: false });
      } catch { if (!dead) setEst(null); }
    }, 450);
    return () => { dead = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, firstId, optsKey, phase]);

  // Blob URLs for the result list, and the "before" image for the compare slider.
  const urls = useMemo(() => result?.files.map((f) => URL.createObjectURL(f.blob)) ?? [], [result]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  const beforeUrl = useMemo(() => (result && tool.estimate && items[0] ? URL.createObjectURL(items[0].file) : ""), [result, tool.estimate, items]);
  useEffect(() => () => { if (beforeUrl) URL.revokeObjectURL(beforeUrl); }, [beforeUrl]);

  const named = useCallback(() => (result?.files ?? []).map((f, i) => ({ name: names[i]?.trim() || f.name, blob: f.blob })), [result, names]);

  const downloadAll = async () => {
    if (!result) return;
    setZipping(true);
    try {
      const blob = await zipOuts(named());
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `playwithdoc-${tool.slug}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } finally { setZipping(false); }
  };

  const canPickFolder = typeof window !== "undefined" && "showDirectoryPicker" in window;
  const saveToFolder = async () => {
    try {
      const dir = await (window as any).showDirectoryPicker({ mode: "readwrite" });
      for (const f of named()) {
        const h = await dir.getFileHandle(f.name, { create: true });
        const w = await h.createWritable();
        await w.write(f.blob);
        await w.close();
      }
      toast(`Saved ${result!.files.length} file${result!.files.length === 1 ? "" : "s"} to “${dir.name}”`);
    } catch (e: any) { if (e?.name !== "AbortError") toast("Couldn’t save to that folder", "err"); }
  };

  const continueWith = (slug2: string) => {
    if (!result) return;
    setPending(named().map((o) => new File([o.blob], o.name, { type: o.blob.type })));
    router.push(`/tools/${slug2}`);
  };

  const next = useMemo(() => {
    if (!result) return [];
    const types = [...new Set(result.files.map((f) => typeOfFile(f)).filter(Boolean) as Fmt[])];
    const seen = new Set<string>([tool.slug]);
    const out = [];
    for (const t of types) for (const c of toolsForFormat(t).sort((a, b) => Number(!!b.featured) - Number(!!a.featured))) {
      if (seen.has(c.slug)) continue;
      if (c.cat === "image" && !c.featured && !/compress|resize/.test(c.slug)) continue;
      seen.add(c.slug); out.push(c);
    }
    return out.slice(0, 6);
  }, [result, tool.slug]);

  const reset = () => { runId.current++; setItems([]); setResult(null); setPhase("idle"); setErr(""); setNotice(""); setOpts(defaults(tool.options)); setAnns([]); };

  const totalSize = items.reduce((n, i) => n + i.file.size, 0);
  const pct = Math.round(prog.p * 100);
  const toLabel = tool.editor ? EDITOR_LABEL[tool.editor]
    : !/^ocr/.test(tool.slug) && ["to-pdf", "from-pdf", "image", "data"].includes(tool.cat) && tool.to.length === 1 && tool.from.join() !== tool.to.join() ? `Convert to ${FORMATS[tool.to[0]].label}` : tool.name;
  const canRotate = tool.to[0] === "pdf" && tool.from.every((f) => IMAGE_FMTS.includes(f));
  const canRun = items.length > 0
    && !(tool.pages && !pages.some((p) => p.on))
    && !(tool.editor && !(tool.editor === "redact" ? anns.some((a) => a.kind === "rect" && a.redact) : anns.length > 0));
  const acceptedLabel = tool.from.length > 3 ? "images" : tool.from.map((f) => FORMATS[f].label).join(" / ");
  const saved = result?.before && result.after !== undefined ? Math.round((1 - result.after / result.before) * 100) : null;
  const running = phase === "running";

  // Keyboard: Ctrl/⌘+O add files · Ctrl/⌘+Enter convert or download.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const m = e.ctrlKey || e.metaKey;
      if (m && e.key.toLowerCase() === "o") { e.preventDefault(); inputRef.current?.click(); }
      else if (m && e.key === "Enter") {
        e.preventDefault();
        if (phase === "idle" && canRun) run();
        else if (phase === "done") { const a = document.querySelector<HTMLAnchorElement>(".outs a[download]"); if (result?.files.length === 1) a?.click(); else downloadAll(); }
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, canRun, run, result]);

  const openFile = (idx: number) => {
    const slides: Slide[] = [], map: number[] = [];
    let start = 0;
    items.forEach((it, k) => { const s = fileSlide(it.file, it.type); if (s) { if (k === idx) start = slides.length; slides.push(s); map.push(k); } });
    if (slides.length) setLb({ slides, start, map });
  };

  /* ───────────── RESULT ───────────── */
  if (phase === "done" && result) {
    const single = result.files.length === 1;
    const t0 = typeOfFile(result.files[0]);
    const isImg = single && ["jpg", "png", "webp"].includes(t0 ?? "");
    return (
      <section className="panel done" aria-live="polite">
        <Stepper step={3} />
        <div className="done-head">
          <span className="done-check"><Icon name="check" size={22} /></span>
          <div>
            <h2>{single ? "Your file is ready" : `${result.files.length} files are ready`}</h2>
            <p className="muted">Processed on your device in {secs < 0.1 ? "under 0.1" : secs.toFixed(1)}s · nothing was uploaded</p>
          </div>
          {saved !== null && result.before !== result.after && (
            <div className={`saved${saved > 0 ? "" : " neg"}`}>
              <b>{saved > 0 ? `−${saved}%` : `+${Math.abs(saved)}%`}</b>
              <span>{fmtBytes(result.before!)} → {fmtBytes(result.after!)}</span>
            </div>
          )}
        </div>

        {single && t0 === "pdf" && (
          <PdfStrip blob={result.files[0].blob} onOpen={(page, total) => setLb({ slides: Array.from({ length: total }, (_, p) => pdfPageSlide(result.files[0].blob, p, `${names[0] || result.files[0].name} — page ${p + 1}`)), start: page })} />
        )}
        {isImg && beforeUrl && <CompareSlider before={beforeUrl} after={urls[0]} beforeLabel={`Original · ${fmtBytes(items[0].file.size)}`} afterLabel={`Result · ${fmtBytes(result.files[0].blob.size)}`} />}
        {isImg && !beforeUrl && <div className="res-img"><img src={urls[0]} alt="Result preview" onClick={() => setLb({ slides: [{ title: names[0] || result.files[0].name, load: async () => ({ src: urls[0] }) }], start: 0 })} /></div>}

        <ul className="outs">
          {result.files.slice(0, 50).map((f, i) => {
            const t = typeOfFile(f);
            const prev = !single && (t === "pdf" || (!!t && ["jpg", "png", "webp", "gif"].includes(t)));
            return <OutRow key={f.name + i} f={f} name={names[i] ?? f.name} onRename={(n) => setNames((a) => a.map((x, k) => (k === i ? n : x)))} url={urls[i]} preview={prev && i < 24} primary={single} />;
          })}
          {result.files.length > 50 && <li className="muted">…and {result.files.length - 50} more (included in the ZIP)</li>}
        </ul>
        {result.note && <div className="alert info">{result.note}</div>}

        <div className="done-actions">
          {!single && <button className="btn btn-primary" onClick={downloadAll} disabled={zipping}>{zipping ? <span className="spin" /> : <Icon name="download" size={16} />} Download all (.zip)</button>}
          {canPickFolder && <button className="btn btn-secondary" onClick={saveToFolder}><Icon name="folder" size={16} /> Save to folder</button>}
          <button className="btn btn-secondary" onClick={() => { setPhase("idle"); setResult(null); }}><Icon name="back" size={16} /> Adjust settings</button>
          <button className="btn btn-ghost" onClick={reset}>Start over</button>
        </div>
        <p className="kbd-hint"><kbd>{mod}</kbd><kbd>Enter</kbd> downloads</p>

        {next.length > 0 && (
          <div className="next">
            <div className="next-title"><Icon name="link" size={14} /> Keep going — send {single ? "this file" : "these files"} straight into…</div>
            <div className="next-list">
              {next.map((t) => (
                <button key={t.slug} className="next-item" onClick={() => continueWith(t.slug)}>
                  <Icon name={toolIcon(t.slug, t.cat)} size={15} /> {t.name} <Icon name="arrow" size={13} />
                </button>
              ))}
              <button className="next-item ghost" onClick={() => router.push("/#tools")}>All tools</button>
            </div>
          </div>
        )}
        {lb && <Lightbox slides={lb.slides} start={lb.start} onClose={() => setLb(null)} />}
      </section>
    );
  }

  /* ───────────── WORKSPACE ───────────── */
  const visibleOpts = (tool.options ?? []).filter((o) => !o.showWhen || o.showWhen(opts));
  const estPct = est && !est.busy && est.before ? Math.round((1 - est.bytes / est.before) * 100) : null;

  return (
    <section
      className={`panel work${hover ? " hover" : ""}`}
      onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setHover(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setHover(false); }}
      onDrop={(e) => { if (e.dataTransfer.files.length) { e.preventDefault(); setHover(false); addFiles([...e.dataTransfer.files]); } }}
    >
      <input ref={inputRef} type="file" hidden multiple={tool.multi} accept={tool.accept}
        {...(tool.camera ? { capture: "environment" as const } : {})}
        onChange={(e) => { addFiles([...(e.target.files ?? [])]); e.target.value = ""; }} />

      <Stepper step={items.length ? 2 : 1} />
      {items.length === 0 ? (
        <button className="drop" onClick={() => inputRef.current?.click()}>
          <span className="drop-ico"><Icon name={tool.camera ? "camera" : "upload"} size={26} /></span>
          <span className="drop-title">{tool.camera ? "Take photos or choose images" : `Drop ${tool.multi ? "your " : "a "}${acceptedLabel} file${tool.multi ? "s" : ""} here`}</span>
          <span className="drop-sub">or <u>browse</u> · or paste with <kbd>{mod}</kbd><kbd>V</kbd></span>
          <span className="drop-priv"><Icon name="lock" size={12} /> Stays on your device</span>
          {notice && <span className="alert warn drop-alert" role="status">{notice}</span>}
        </button>
      ) : (
        <div className="ws">
          <div className="ws-main">
            <div className="ws-bar">
              <span className="ws-count">
                {tool.pages || tool.editor ? <><b>{items[0].file.name}</b> · {fmtBytes(items[0].file.size)}</> : <><b>{items.length}</b> file{items.length === 1 ? "" : "s"} · {fmtBytes(totalSize)}</>}
              </span>
              <span className="grow" />
              {tool.sort && items.length > 1 && <button className="btn btn-secondary btn-sm" onClick={sortByName}><Icon name="swap" size={14} /> Sort {sortAsc ? "A–Z" : "Z–A"}</button>}
              {canRotate && <button className="btn btn-secondary btn-sm" onClick={rotateAll}><Icon name="rotate" size={14} /> Rotate all</button>}
              {tool.multi && <button className="btn btn-secondary btn-sm" onClick={() => inputRef.current?.click()} title={`Add more (${mod}+O)`}><Icon name="plus" size={14} /> Add more <span className="count">{items.length}</span></button>}
              {(tool.pages || tool.editor) && <button className="btn btn-ghost btn-sm" onClick={reset}>Change PDF</button>}
            </div>
            {notice && <div className="alert warn" role="status">{notice}</div>}
            {tool.sort && items.length > 1 && <p className="ws-hint"><Icon name="grip" size={14} /> Drag to reorder — cards move as you drag. Click a card to preview it. Keyboard: focus a card, then <kbd>Alt</kbd>+<kbd>←</kbd>/<kbd>→</kbd> to move, <kbd>R</kbd> to rotate, <kbd>Del</kbd> to remove.</p>}

            {tool.editor ? (
              <PdfEditor file={items[0].file} mode={tool.editor} onChange={setAnns} />
            ) : tool.pages ? (
              <PageGrid file={items[0].file} mode={tool.pages} onChange={setPages} />
            ) : (
              <ul ref={listRef} className={`fgrid${!tool.multi ? " single" : ""}`}>
                {items.map((it, idx) => (
                  <FileCard key={it.id} it={it} idx={idx} total={items.length} sort={!!tool.sort} single={!tool.multi} canRotate={canRotate} dragging={draggingId === it.id}
                    onRemove={() => removeItem(it.id)} onMove={(d) => move(idx, idx + d)} onRotate={() => rotateItem(it.id)} onReplace={() => inputRef.current?.click()} onOpen={() => openFile(idx)}
                    dnd={{
                      draggable: !!tool.sort && items.length > 1,
                      onDragStart: (e) => { dragId.current = it.id; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", it.id); setTimeout(() => setDraggingId(it.id), 0); },
                      onDragOver: (e) => { if (dragId.current) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; hoverSwap(it.id); } },
                      onDragEnd: () => { dragId.current = null; setDraggingId(null); },
                    }} />
                ))}
                {tool.multi && (
                  <li className="fc add"><button onClick={() => inputRef.current?.click()}><span><Icon name="plus" size={22} /></span>Add more files</button></li>
                )}
              </ul>
            )}
          </div>

          <aside className="ws-side">
            <div className="side-head">
              <h3>{tool.name}</h3>
              <p>{tool.editor ? "Make your changes on the page, then save." : tool.pages ? "Adjust pages on the left, then save." : tool.sort ? "Set the order and options, then convert." : "Choose your options, then go."}</p>
            </div>
            {visibleOpts.length > 0 && (
              <div className="side-opts">
                {visibleOpts.map((sp) => <Field key={sp.key} spec={sp} value={opts[sp.key]} onChange={(v) => setOpts((o) => ({ ...o, [sp.key]: v }))} />)}
              </div>
            )}
            {tool.estimate && est && (
              <div className={`est${est.busy ? " busy" : ""}`} aria-live="polite">
                <span>Estimated size · first file</span>
                <b>{est.busy ? "Calculating…" : `≈ ${fmtBytes(est.bytes)}`}</b>
                {!est.busy && estPct !== null && <em className={estPct > 0 ? "good" : "warn"}>{estPct > 0 ? `−${estPct}%` : `+${Math.abs(estPct)}%`}</em>}
              </div>
            )}
            {err && <div className="alert bad" role="alert">{err}</div>}
            <button className="btn btn-primary btn-lg run" onClick={run} disabled={!canRun || running} style={{ "--p": `${pct}%` } as React.CSSProperties} autoFocus>
              {running ? <><span className="spin" /> <span className="run-l">{prog.label || "Working…"}</span> <span className="run-p">{pct}%</span></> : <>{toLabel} <Icon name="arrow" size={16} /></>}
            </button>
            <p className="kbd-hint"><kbd>{mod}</kbd><kbd>Enter</kbd> to run</p>
            <NetBadge compact />
          </aside>
        </div>
      )}
      {lb && (
        <Lightbox slides={lb.slides} start={lb.start} onClose={() => setLb(null)}
          rotations={lb.map ? lb.map.map((k) => items[k]?.rot ?? 0) : undefined}
          onRotate={canRotate && lb.map ? (i) => { const it = items[lb.map![i]]; if (it) rotateItem(it.id); } : undefined} />
      )}
    </section>
  );
}
