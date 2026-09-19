"use client";

import { useEffect, useMemo, useState } from "react";
import { readForm, type FormField } from "@/lib/engines/forms";
import { Icon } from "./Icon";

type Value = string | boolean | string[];

/** Lists every fillable field of a PDF as a tidy form. Only fields you touch are sent to the engine. */
export function FormFiller({ file, onChange, onNoFields }: { file: File; onChange: (values: Record<string, Value>, touched: number) => void; onNoFields: () => void }) {
  const [fields, setFields] = useState<FormField[] | null>(null);
  const [touched, setTouched] = useState<Record<string, Value>>({});
  const [q, setQ] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let dead = false;
    setFields(null); setTouched({}); setError("");
    readForm(file).then((f) => { if (!dead) setFields(f); }).catch((e) => { if (!dead) setError(e?.message || "Couldn't read this PDF."); });
    return () => { dead = true; };
  }, [file]);

  useEffect(() => { onChange(touched, Object.keys(touched).length); }, [touched, onChange]);

  const set = (name: string, v: Value) => setTouched((t) => ({ ...t, [name]: v }));
  const shown = useMemo(() => (fields ?? []).filter((f) => !f.readOnly && f.name.toLowerCase().includes(q.trim().toLowerCase())), [fields, q]);
  const groups = useMemo(() => {
    const m = new Map<number, FormField[]>();
    for (const f of shown) { const k = f.page ?? -1; m.set(k, [...(m.get(k) ?? []), f]); }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [shown]);

  if (error) return <div className="alert bad" role="alert">{error}</div>;
  if (!fields) return <div className="pg-loading"><span className="spin" /> Looking for form fields…</div>;

  const fillable = fields.filter((f) => !f.readOnly);
  if (!fillable.length) {
    return (
      <div className="form-empty">
        <span className="drop-ico"><Icon name="file" size={26} /></span>
        <h3>This PDF has no fillable fields</h3>
        <p className="muted">It’s a flat document, so there are no boxes to fill. You can still type on it, tick things with a mark, or add your signature.</p>
        <button className="btn btn-primary" onClick={onNoFields}>Open in Edit PDF <Icon name="arrow" size={16} /></button>
      </div>
    );
  }

  const label = (n: string) => n.replace(/[._\-[\]]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/\s+/g, " ").trim() || n;
  const done = Object.keys(touched).length;

  return (
    <div className="form">
      <div className="form-bar">
        <div className="form-count"><b>{done}</b> of {fillable.length} fields filled</div>
        <label className="form-search"><Icon name="search" size={14} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a field…" spellCheck={false} /></label>
      </div>
      <div className="form-progress" aria-hidden><i style={{ width: `${(done / fillable.length) * 100}%` }} /></div>

      {groups.map(([page, list]) => (
        <section key={page} className="form-group">
          {page >= 0 && <h4>Page {page + 1}</h4>}
          {list.map((f) => {
            const v = f.name in touched ? touched[f.name] : f.value;
            const id = `ff-${f.name}`;
            return (
              <div key={f.name} className={`form-row${f.name in touched ? " done" : ""}`}>
                <label htmlFor={id} className="form-label" title={f.name}>{label(f.name)}</label>
                {f.kind === "text" && (f.multiline
                  ? <textarea id={id} rows={3} value={String(v)} onChange={(e) => set(f.name, e.target.value)} />
                  : <input id={id} type="text" value={String(v)} onChange={(e) => set(f.name, e.target.value)} spellCheck={false} />)}
                {f.kind === "check" && (
                  <button id={id} role="checkbox" aria-checked={!!v} className={`form-check${v ? " on" : ""}`} onClick={() => set(f.name, !v)}><Icon name="check" size={15} /></button>
                )}
                {(f.kind === "select" || f.kind === "radio") && (
                  <select id={id} value={String(v)} onChange={(e) => set(f.name, e.target.value)}>
                    <option value="">{f.kind === "radio" ? "— choose —" : "— select —"}</option>
                    {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                )}
                {f.kind === "list" && (
                  <select id={id} multiple size={Math.min(5, (f.options ?? []).length)} value={Array.isArray(v) ? v : []} onChange={(e) => set(f.name, [...e.target.selectedOptions].map((o) => o.value))}>
                    {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                )}
              </div>
            );
          })}
        </section>
      ))}
      {!shown.length && <p className="muted form-none">No field matches “{q}”.</p>}
    </div>
  );
}
