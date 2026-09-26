"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FORMATS, fmtBytes, typeOfFile, type Fmt } from "@/lib/formats";
import { setPending } from "@/lib/handoff";
import { TOOLS } from "@/lib/tools";
import { FlowChips, FormatChip } from "./FormatChip";
import { usePalette } from "./CommandPalette";
import { Icon, toolIcon } from "./Icon";

const CAT_RANK: Record<string, number> = { "to-pdf": 0, "from-pdf": 0, optimize: 1, organize: 1, edit: 2, image: 2, data: 3 };

export function UniversalDrop() {
  const router = useRouter();
  const { mod } = usePalette();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [hover, setHover] = useState(false);
  const [all, setAll] = useState(false);
  const depth = useRef(0);

  const take = useCallback((list: File[]) => { if (list.length) { setFiles(list); setAll(false); } }, []);

  // Drop or paste anywhere on the home page.
  useEffect(() => {
    const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes("Files");
    const enter = (e: DragEvent) => { if (hasFiles(e)) { depth.current++; setHover(true); } };
    const leave = (e: DragEvent) => { if (hasFiles(e) && --depth.current <= 0) { depth.current = 0; setHover(false); } };
    const over = (e: DragEvent) => { if (hasFiles(e)) e.preventDefault(); };
    const drop = (e: DragEvent) => { if (hasFiles(e)) { e.preventDefault(); depth.current = 0; setHover(false); take([...e.dataTransfer!.files]); document.getElementById("drop")?.scrollIntoView({ behavior: "smooth", block: "center" }); } };
    const paste = (e: ClipboardEvent) => { const f = [...(e.clipboardData?.files ?? [])]; if (f.length) { e.preventDefault(); take(f); } };
    window.addEventListener("dragenter", enter); window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over); window.addEventListener("drop", drop); window.addEventListener("paste", paste);
    return () => { window.removeEventListener("dragenter", enter); window.removeEventListener("dragleave", leave); window.removeEventListener("dragover", over); window.removeEventListener("drop", drop); window.removeEventListener("paste", paste); };
  }, [take]);

  const types = useMemo(() => files.map((f) => typeOfFile(f)), [files]);
  const unknown = files.filter((_, i) => !types[i]);
  const known = types.filter(Boolean) as Fmt[];
  const options = useMemo(() => {
    if (!known.length) return [];
    return TOOLS
      .filter((t) => known.every((k) => t.from.includes(k)) && (t.multi || files.length === 1))
      .sort((a, b) => (Number(!!b.featured) - Number(!!a.featured)) || ((CAT_RANK[a.cat] ?? 9) - (CAT_RANK[b.cat] ?? 9)));
  }, [known, files.length]);

  const go = (slug: string) => { setPending(files.filter((_, i) => types[i])); router.push(`/tools/${slug}`); };
  const shown = all ? options : options.slice(0, 9);
  const uniqueTypes = [...new Set(known)];

  return (
    <section id="drop" className="container drop-sec">
      {hover && <div className="drop-overlay"><div><Icon name="upload" size={34} /><b>Drop to see what it can become</b></div></div>}
      <input ref={inputRef} type="file" multiple hidden onChange={(e) => { take([...(e.target.files ?? [])]); e.target.value = ""; }} />

      {!files.length ? (
        <div className="udrop" onClick={() => inputRef.current?.click()} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}>
          <span className="tick tl" /><span className="tick tr" /><span className="tick bl" /><span className="tick br" />
          <span className="drop-ico"><Icon name="upload" size={26} /></span>
          <div>
            <b>Or just drop any file here</b>
            <p className="muted">We’ll show every format it can become. Paste with <kbd>{mod}</kbd><kbd>V</kbd> works too.</p>
          </div>
          <span className="btn btn-secondary">Choose files</span>
        </div>
      ) : (
        <div className="udrop open">
          <span className="tick tl" /><span className="tick tr" /><span className="tick bl" /><span className="tick br" />
          <div className="ud-head">
            <div className="ud-files">
              {uniqueTypes.map((t) => <FormatChip key={t} f={t} />)}
              <span><b>{files.length === 1 ? files[0].name : `${files.length} files`}</b> <span className="muted">· {fmtBytes(files.reduce((n, f) => n + f.size, 0))}</span></span>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => setFiles([])}>Clear</button>
          </div>
          {unknown.length > 0 && <div className="alert warn">Can’t convert {unknown.length === 1 ? `“${unknown[0].name}”` : `${unknown.length} of these files`} yet — supported: {Object.values(FORMATS).map((f) => f.label).join(", ")}.</div>}
          {options.length > 0 ? (
            <>
              <p className="ud-q">What should {files.length === 1 ? "it" : "they"} become?</p>
              <div className="ud-grid">
                {shown.map((t) => (
                  <button key={t.slug} className="ud-item" onClick={() => go(t.slug)}>
                    <Icon name={toolIcon(t.slug, t.cat)} size={17} />
                    <span><b>{t.name}</b><small>{t.short}</small></span>
                    <FlowChips from={t.from} to={t.to} flow={t.flow} size="sm" />
                  </button>
                ))}
              </div>
              {options.length > shown.length && <button className="link-btn" onClick={() => setAll(true)}>Show all {options.length} options</button>}
            </>
          ) : known.length > 0 ? <p className="muted">No single tool takes this exact mix of files — try dropping one type at a time.</p> : null}
        </div>
      )}
    </section>
  );
}
