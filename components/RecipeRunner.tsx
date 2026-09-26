"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { UserError, zipOuts } from "@/lib/engines/common";
import { FORMATS, fmtBytes, typeOfFile, type Fmt } from "@/lib/formats";
import { pushRecent } from "@/lib/recent";
import { CATEGORIES, getTool } from "@/lib/tools";
import type { Opts, Out, Tool } from "@/lib/types";
import { Field, defaults } from "./Field";
import { FlowChips, FormatChip } from "./FormatChip";
import { Icon, toolIcon } from "./Icon";
import { NetBadge } from "./NetBadge";
import { useToast } from "./Toast";

/** Tools that can run without stopping to ask you something on the page. */
const RECIPE_SLUGS = [
  "merge-pdf", "split-pdf", "compress-pdf", "repair-pdf", "ocr-pdf", "rotate-pdf", "add-page-numbers", "add-watermark", "crop-pdf", "protect-pdf", "unlock-pdf",
  "image-to-pdf", "word-to-pdf", "excel-to-pdf", "pptx-to-pdf", "html-to-pdf", "txt-to-pdf",
  "md-to-pdf", "md-to-word", "word-to-md", "md-to-html", "html-to-md", "pdf-to-jpg", "pdf-to-png", "pdf-to-word", "pdf-to-text", "pdf-to-excel", "pdf-to-pptx", "compress-image", "resize-image",
];

type Step = { id: string; slug: string; opts: Opts };
type Saved = { id: string; name: string; steps: { slug: string; opts: Opts }[] };

const TEMPLATES: { name: string; blurb: string; icon: string; steps: { slug: string; opts?: Opts }[] }[] = [
  { name: "Email-ready PDF", blurb: "Merge several PDFs, then shrink the result under 1 MB.", icon: "layers", steps: [{ slug: "merge-pdf" }, { slug: "compress-pdf", opts: { level: "balanced", target: "1024" } }] },
  { name: "Scans → searchable & small", blurb: "Photos of pages → one PDF → recognise the text → shrink safely.", icon: "sparkle", steps: [{ slug: "image-to-pdf" }, { slug: "ocr-pdf" }, { slug: "compress-pdf", opts: { level: "lossless" } }] },
  { name: "Confidential copy", blurb: "Stamp CONFIDENTIAL on every page, then lock it with a password.", icon: "lock", steps: [{ slug: "add-watermark", opts: { text: "CONFIDENTIAL" } }, { slug: "protect-pdf" }] },
  { name: "Photos → one small PDF", blurb: "Shrink every photo under 200 KB, then combine them into a PDF.", icon: "image", steps: [{ slug: "compress-image", opts: { target: "200" } }, { slug: "image-to-pdf" }] },
  { name: "Word → protected PDF", blurb: "Convert a Word document to PDF and add a password.", icon: "file", steps: [{ slug: "word-to-pdf" }, { slug: "protect-pdf" }] },
];

const uid = () => Math.random().toString(36).slice(2, 9);
const KEY = "af-recipes";

const makeStep = (slug: string, opts?: Opts): Step => ({ id: uid(), slug, opts: { ...defaults(getTool(slug)?.options), ...(opts ?? {}) } });
const visible = (t: Tool, o: Opts) => (t.options ?? []).filter((s) => !s.showWhen || s.showWhen(o));

export function RecipeRunner() {
  const toast = useToast();
  const [steps, setSteps] = useState<Step[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [name, setName] = useState("");
  const [running, setRunning] = useState(false);
  const [prog, setProg] = useState({ step: 0, p: 0, label: "" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<{ files: Out[]; secs: number; notes: string[] } | null>(null);
  const [zipping, setZipping] = useState(false);
  const [hover, setHover] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { try { setSaved(JSON.parse(localStorage.getItem(KEY) || "[]")); } catch { /* none saved yet */ } }, []);
  const persist = (list: Saved[]) => { setSaved(list); try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* storage unavailable */ } };

  const groups = useMemo(() => CATEGORIES.map((c) => ({ c, tools: RECIPE_SLUGS.map((s) => getTool(s)!).filter((t) => t && t.cat === c.id) })).filter((g) => g.tools.length), []);
  const urls = useMemo(() => result?.files.map((f) => URL.createObjectURL(f.blob)) ?? [], [result]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);

  const load = (list: { slug: string; opts?: Opts }[]) => { setSteps(list.filter((s) => getTool(s.slug)).map((s) => makeStep(s.slug, s.opts))); setResult(null); setError(""); };

  const patchStep = (id: string, fn: (s: Step) => Step) => setSteps((all) => all.map((s) => (s.id === id ? fn(s) : s)));
  const move = (i: number, d: number) => setSteps((all) => { const j = i + d; if (j < 0 || j >= all.length) return all; const c = [...all]; [c[i], c[j]] = [c[j], c[i]]; return c; });

  const addFiles = useCallback((list: File[]) => {
    const first = steps[0] && getTool(steps[0].slug);
    const ok = first ? list.filter((f) => { const t = typeOfFile(f); return !!t && first.from.includes(t); }) : list;
    const bad = list.length - ok.length;
    setNotice(bad ? `${bad} file${bad === 1 ? " was" : "s were"} skipped — the first step (${first?.name}) accepts ${first?.from.map((f) => FORMATS[f].label).join(", ")} only.` : "");
    if (ok.length) { setFiles((f) => [...f, ...ok]); setResult(null); setError(""); }
  }, [steps]);

  /** For each step: can it take what the step before it produces? */
  const problems = useMemo(() => steps.map((st, i) => {
    const t = getTool(st.slug)!;
    if (i === 0) {
      if (!files.length) return "";
      const types = files.map((f) => typeOfFile(f)).filter(Boolean) as Fmt[];
      return types.some((x) => t.from.includes(x)) ? "" : `${t.name} can't open these files.`;
    }
    const prev = getTool(steps[i - 1].slug)!;
    return t.from.some((f) => prev.to.includes(f)) ? "" : `${prev.name} makes ${prev.to.map((f) => FORMATS[f].label).join("/")}, but ${t.name} needs ${t.from.map((f) => FORMATS[f].label).slice(0, 3).join("/")}.`;
  }), [steps, files]);

  const canRun = steps.length > 0 && files.length > 0 && !problems.some(Boolean) && !running;

  const run = async () => {
    setRunning(true); setError(""); setResult(null);
    const t0 = performance.now();
    const notes: string[] = [];
    try {
      let current: File[] = files;
      for (let i = 0; i < steps.length; i++) {
        const t = getTool(steps[i].slug)!;
        const runner = await t.load();
        const inputs = current.filter((f) => { const ty = typeOfFile(f); return !!ty && t.from.includes(ty); });
        if (!inputs.length) throw new UserError(`Step ${i + 1} (${t.name}) has nothing it can work on.`);
        const outs: Out[] = [];
        const runOne = async (fs: File[]) => {
          const r = await runner(fs, { opts: steps[i].opts, progress: (p, label) => setProg({ step: i, p, label: label ?? t.name }) });
          outs.push(...r.files);
          if (r.note && !notes.includes(r.note)) notes.push(`${t.name}: ${r.note}`);
        };
        if (t.multi) await runOne(inputs); else for (const f of inputs) await runOne([f]);
        current = outs.map((o) => new File([o.blob], o.name, { type: o.blob.type }));
      }
      setResult({ files: current.map((f) => ({ name: f.name, blob: f })), secs: (performance.now() - t0) / 1000, notes });
      steps.forEach((s) => pushRecent(s.slug));
    } catch (e) {
      console.error(e);
      setError(e instanceof UserError ? e.message : "Something went wrong while running the recipe. Check the files and options for the step that was running.");
    } finally { setRunning(false); }
  };

  const save = () => {
    const nm = name.trim() || `Recipe ${saved.length + 1}`;
    const clean = steps.map((s) => ({ slug: s.slug, opts: Object.fromEntries(Object.entries(s.opts).filter(([k]) => !(getTool(s.slug)?.options ?? []).some((o) => o.key === k && o.type === "text" && o.secret))) }));
    persist([{ id: uid(), name: nm, steps: clean }, ...saved].slice(0, 12));
    setName("");
    toast(`Saved “${nm}”`);
  };

  const zip = async () => {
    if (!result) return;
    setZipping(true);
    try { const b = await zipOuts(result.files); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "playwithdoc-recipe.zip"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); } finally { setZipping(false); }
  };

  const overall = steps.length ? Math.round(((prog.step + prog.p) / steps.length) * 100) : 0;
  const totalSize = files.reduce((n, f) => n + f.size, 0);

  return (
    <div className="rc">
      {/* 1 · start */}
      <section className="rc-sec">
        <h2><span>1</span> Start from a recipe</h2>
        <div className="rc-templates">
          {TEMPLATES.map((t) => (
            <button key={t.name} className="rc-tpl card" onClick={() => load(t.steps)}>
              <span className="tool-ico"><Icon name={t.icon} size={18} /></span>
              <b>{t.name}</b>
              <span className="muted">{t.blurb}</span>
              <span className="rc-tpl-flow">{t.steps.map((s) => getTool(s.slug)?.name).join("  →  ")}</span>
            </button>
          ))}
        </div>
        {saved.length > 0 && (
          <div className="rc-saved">
            <div className="side-label">Your saved recipes</div>
            <ul>
              {saved.map((r) => (
                <li key={r.id}>
                  <button className="rc-saved-name" onClick={() => load(r.steps)}><Icon name="clock" size={14} /> <b>{r.name}</b> <span className="muted">{r.steps.map((s) => getTool(s.slug)?.name).join(" → ")}</span></button>
                  <button className="rm" onClick={() => persist(saved.filter((x) => x.id !== r.id))} aria-label={`Delete ${r.name}`}><Icon name="trash" size={15} /></button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* 2 · steps */}
      <section className="rc-sec">
        <h2><span>2</span> Steps <small>{steps.length ? `${steps.length} step${steps.length === 1 ? "" : "s"}` : "add at least one"}</small></h2>
        <ol className="rc-steps">
          {steps.map((st, i) => {
            const t = getTool(st.slug)!;
            const opts = visible(t, st.opts);
            return (
              <li key={st.id} className={`rc-step card${problems[i] ? " bad" : ""}`}>
                <div className="rc-step-head">
                  <span className="rc-num">{i + 1}</span>
                  <span className="tool-ico"><Icon name={toolIcon(t.slug, t.cat)} size={17} /></span>
                  <select value={st.slug} aria-label={`Step ${i + 1} tool`} onChange={(e) => patchStep(st.id, () => makeStep(e.target.value))}>
                    {groups.map((g) => <optgroup key={g.c.id} label={g.c.label}>{g.tools.map((x) => <option key={x.slug} value={x.slug}>{x.name}</option>)}</optgroup>)}
                  </select>
                  <FlowChips from={t.from} to={t.to} flow={t.flow} size="sm" />
                  <span className="grow" />
                  <button className="rm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up"><Icon name="up" size={15} /></button>
                  <button className="rm" onClick={() => move(i, 1)} disabled={i === steps.length - 1} aria-label="Move down"><Icon name="down" size={15} /></button>
                  <button className="rm" onClick={() => setSteps((all) => all.filter((x) => x.id !== st.id))} aria-label="Remove step"><Icon name="x" size={15} /></button>
                </div>
                {opts.length > 0 && <div className="rc-opts">{opts.map((sp) => <Field key={sp.key} spec={sp} idPrefix={`st${st.id}`} value={st.opts[sp.key]} onChange={(v) => patchStep(st.id, (s) => ({ ...s, opts: { ...s.opts, [sp.key]: v } }))} />)}</div>}
                {problems[i] && <p className="rc-warn"><Icon name="x" size={13} /> {problems[i]}</p>}
              </li>
            );
          })}
        </ol>
        <div className="rc-add">
          <select value="" aria-label="Add a step" onChange={(e) => { if (e.target.value) setSteps((all) => [...all, makeStep(e.target.value)]); }}>
            <option value="">+ Add a step…</option>
            {groups.map((g) => <optgroup key={g.c.id} label={g.c.label}>{g.tools.map((x) => <option key={x.slug} value={x.slug}>{x.name}</option>)}</optgroup>)}
          </select>
          {steps.length > 0 && (
            <span className="rc-save">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name this recipe…" aria-label="Recipe name" maxLength={40} />
              <button className="btn btn-secondary btn-sm" onClick={save}><Icon name="download" size={14} /> Save</button>
            </span>
          )}
        </div>
      </section>

      {/* 3 · files + run */}
      <section className="rc-sec">
        <h2><span>3</span> Add your files</h2>
        <input ref={input} type="file" hidden multiple onChange={(e) => { addFiles([...(e.target.files ?? [])]); e.target.value = ""; }} />
        <div className={`rc-drop${hover ? " hover" : ""}`}
          onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setHover(true); } }} onDragLeave={() => setHover(false)}
          onDrop={(e) => { e.preventDefault(); setHover(false); addFiles([...e.dataTransfer.files]); }}>
          {files.length === 0 ? (
            <button className="rc-drop-btn" onClick={() => input.current?.click()} disabled={!steps.length}>
              <Icon name="upload" size={22} />
              <b>{steps.length ? "Drop files here or browse" : "Pick a recipe or add a step first"}</b>
              <span className="muted">They stay on your device — every step runs locally.</span>
            </button>
          ) : (
            <div className="rc-files">
              <ul>
                {files.map((f, i) => { const t = typeOfFile(f); return <li key={f.name + i}>{t && <FormatChip f={t} size="sm" />}<span title={f.name}>{f.name}</span><small>{fmtBytes(f.size)}</small><button className="rm" onClick={() => setFiles((all) => all.filter((_, k) => k !== i))} aria-label={`Remove ${f.name}`}><Icon name="x" size={14} /></button></li>; })}
              </ul>
              <div className="rc-files-bar"><span className="muted">{files.length} file{files.length === 1 ? "" : "s"} · {fmtBytes(totalSize)}</span><button className="btn btn-secondary btn-sm" onClick={() => input.current?.click()}><Icon name="plus" size={14} /> Add more</button><button className="btn btn-ghost btn-sm" onClick={() => setFiles([])}>Clear</button></div>
            </div>
          )}
        </div>
        {notice && <div className="alert warn">{notice}</div>}
        {error && <div className="alert bad" role="alert">{error}</div>}

        <div className="rc-run">
          <button className="btn btn-primary btn-lg run" onClick={run} disabled={!canRun} style={{ "--p": `${overall}%` } as React.CSSProperties}>
            {running ? <><span className="spin" /> <span className="run-l">Step {prog.step + 1}/{steps.length} · {prog.label || "Working…"}</span> <span className="run-p">{overall}%</span></> : <>Run recipe <Icon name="arrow" size={16} /></>}
          </button>
          <NetBadge compact />
        </div>
      </section>

      {/* result */}
      {result && (
        <section className="rc-sec rc-done panel done" aria-live="polite">
          <div className="done-head">
            <span className="done-check"><Icon name="check" size={22} /></span>
            <div><h2>{result.files.length === 1 ? "Your file is ready" : `${result.files.length} files are ready`}</h2><p className="muted">{steps.length} step{steps.length === 1 ? "" : "s"} · {result.secs.toFixed(1)}s · nothing was uploaded</p></div>
          </div>
          <ul className="outs">
            {result.files.slice(0, 40).map((f, i) => { const t = typeOfFile(f); return (
              <li key={f.name + i}><span className="out-th">{t ? <FormatChip f={t} /> : <Icon name="file" />}</span><span className="out-name"><span className="out-edit" style={{ cursor: "default", border: 0 }}><span className="out-fit" style={{ display: "inline" }}><b style={{ fontWeight: 550 }}>{f.name}</b></span></span></span><span className="muted out-size">{fmtBytes(f.blob.size)}</span><a className="btn btn-secondary btn-sm" href={urls[i]} download={f.name}><Icon name="download" size={15} /> Download</a></li>
            ); })}
          </ul>
          {result.notes.length > 0 && <div className="alert info">{result.notes.join("  ")}</div>}
          <div className="done-actions">
            {result.files.length > 1 && <button className="btn btn-primary" onClick={zip} disabled={zipping}>{zipping ? <span className="spin" /> : <Icon name="download" size={16} />} Download all (.zip)</button>}
            <button className="btn btn-ghost" onClick={() => { setResult(null); setFiles([]); }}>Start over</button>
          </div>
        </section>
      )}
    </div>
  );
}
