"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { UserError } from "@/lib/engines/common";
import { fmtBytes } from "@/lib/formats";
import { takePending } from "@/lib/handoff";
import { fromLocalInput, kindOf, readMeta, stripMeta, toLocalInput, writeMeta, SUPPORTED, type EditKey, type MetaInfo } from "@/lib/engines/meta";
import { Icon } from "./Icon";
import { useToast } from "./Toast";

type Saved = { name: string; url: string; size: number; label: string };

/** Document properties: shows who / what made a file, lets you edit the fields, or wipe them. */
export function MetaPanel() {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [info, setInfo] = useState<MetaInfo | null>(null);
  const [vals, setVals] = useState<Partial<Record<EditKey, string>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<Saved | null>(null);
  const [hover, setHover] = useState(false);

  const open = useCallback(async (f: File) => {
    setError(""); setSaved(null); setInfo(null); setFile(f); setBusy(true);
    try {
      if (!kindOf(f)) throw new UserError(`“${f.name}” can’t be read here. Use a PDF, Word / Excel / PowerPoint file (.docx .xlsx .pptx) or a JPG photo.`);
      const m = await readMeta(f);
      setInfo(m);
      setVals(Object.fromEntries(m.fields.map((x) => [x.key, x.value])) as Partial<Record<EditKey, string>>);
    } catch (e: any) {
      setFile(null);
      setError(e instanceof UserError ? e.message : "Couldn’t read this file. It may be damaged.");
    } finally { setBusy(false); }
  }, []);

  useEffect(() => { const f = takePending(); if (f.length) open(f[0]); }, [open]);
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => { const f = e.clipboardData?.files?.[0]; if (f) { e.preventDefault(); open(f); } };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [open]);
  useEffect(() => () => { if (saved) URL.revokeObjectURL(saved.url); }, [saved]);

  const finish = (blob: Blob, name: string, label: string) => setSaved({ name, url: URL.createObjectURL(blob), size: blob.size, label });
  const stem = file ? file.name.replace(/\.[^.]+$/, "") : "";
  const ext = file ? file.name.split(".").pop() : "";

  const save = async () => {
    if (!file || !info) return;
    setBusy(true); setError("");
    try {
      const changed: Partial<Record<EditKey, string>> = {};
      for (const f of info.fields) if ((vals[f.key] ?? "") !== f.value) changed[f.key] = vals[f.key] ?? "";
      if (!Object.keys(changed).length) { toast("Nothing changed yet — edit a field first."); return; }
      finish(await writeMeta(file, changed), `${stem}-edited.${ext}`, "Properties updated");
    } catch (e: any) { setError(e instanceof UserError ? e.message : "Couldn’t save the changes."); } finally { setBusy(false); }
  };
  const wipe = async () => {
    if (!file) return;
    setBusy(true); setError("");
    try { finish(await stripMeta(file), `${stem}-clean.${ext}`, "All metadata removed"); }
    catch (e: any) { setError(e instanceof UserError ? e.message : "Couldn’t remove the metadata."); } finally { setBusy(false); }
  };
  const reset = () => { setFile(null); setInfo(null); setSaved(null); setError(""); setVals({}); };

  if (!file || (!info && !busy)) {
    return (
      <section
        className={`panel work${hover ? " hover" : ""}`}
        onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setHover(true); } }}
        onDragLeave={(e) => { if (e.currentTarget === e.target) setHover(false); }}
        onDrop={(e) => { if (e.dataTransfer.files.length) { e.preventDefault(); setHover(false); open(e.dataTransfer.files[0]); } }}
      >
        <input ref={inputRef} type="file" hidden accept={SUPPORTED.join(",")} onChange={(e) => { const f = e.target.files?.[0]; if (f) open(f); e.target.value = ""; }} />
        <button className="drop" onClick={() => inputRef.current?.click()}>
          <span className="drop-ico"><Icon name="info" size={26} /></span>
          <span className="drop-title">Drop a PDF, Office file or photo here</span>
          <span className="drop-sub">or <u>browse</u> · PDF, DOCX, XLSX, PPTX, JPG</span>
          <span className="drop-priv"><Icon name="lock" size={12} /> Read on your device — never uploaded</span>
        </button>
        {error && <p className="field-err" role="alert">{error}</p>}
      </section>
    );
  }

  return (
    <section className="panel meta" aria-live="polite">
      <div className="meta-head">
        <span className="tool-ico"><Icon name="info" size={18} /></span>
        <div><b>{file.name}</b><span className="muted">{info?.typeLabel ?? "Reading…"} · {fmtBytes(file.size)}</span></div>
        <span className="grow" />
        <button className="btn btn-ghost btn-sm" onClick={reset}><Icon name="back" size={14} /> Another file</button>
      </div>

      {!info ? <p className="muted"><span className="spin" /> Reading properties…</p> : (
        <>
          {info.notes.map((n, i) => <p key={i} className="meta-note"><Icon name="shield" size={15} />{n}</p>)}

          <div className="meta-made">
            {info.madeWith.map((r) => (
              <div key={r.label}><span>{r.label}</span><b className={r.value ? "" : "none"}>{r.value || "Not stored"}</b></div>
            ))}
          </div>

          {info.fields.length > 0 && (
            <div className="meta-form">
              {info.fields.map((f) => (
                <div className="field" key={f.key}>
                  <label htmlFor={`m-${f.key}`} className="field-label">{f.label}</label>
                  {f.kind === "date"
                    ? <input id={`m-${f.key}`} type="datetime-local" value={toLocalInput(vals[f.key] ?? "")} onChange={(e) => setVals({ ...vals, [f.key]: fromLocalInput(e.target.value) })} />
                    : <input id={`m-${f.key}`} type="text" value={vals[f.key] ?? ""} placeholder="Not stored" spellCheck={false} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} />}
                  {f.hint && <div className="field-help">{f.hint}</div>}
                </div>
              ))}
            </div>
          )}

          {info.facts.length > 0 && (
            <dl className="meta-facts">
              {info.facts.map((r, i) => <div key={r.label + i} className={r.warn ? "warn" : ""}><dt>{r.label}</dt><dd>{r.value}</dd></div>)}
            </dl>
          )}

          {error && <p className="field-err" role="alert">{error}</p>}

          {saved ? (
            <div className="meta-done">
              <span><Icon name="check" size={16} /> {saved.label} · {fmtBytes(saved.size)}</span>
              <a className="btn btn-primary" href={saved.url} download={saved.name}><Icon name="download" size={16} /> Download {saved.name}</a>
            </div>
          ) : (
            <div className="meta-actions">
              {info.editable && info.fields.length > 0 && <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? <span className="spin" /> : <Icon name="check" size={16} />} Save changes</button>}
              <button className={`btn ${info.editable && info.fields.length ? "btn-secondary" : "btn-primary"}`} onClick={wipe} disabled={busy}><Icon name="trash" size={16} /> Remove all metadata</button>
              {!info.editable && info.kind === "jpg" && <span className="muted">Photos can’t be edited field by field — removing is lossless: the picture itself isn’t touched.</span>}
            </div>
          )}
        </>
      )}
    </section>
  );
}
