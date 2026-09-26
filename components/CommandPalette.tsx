"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { getRecent } from "@/lib/recent";
import { searchTools } from "@/lib/search";
import { getTool } from "@/lib/tools";
import type { Tool } from "@/lib/types";
import { FlowChips } from "./FormatChip";
import { Icon, toolIcon } from "./Icon";

/** Not a real tool: a shortcut to the multi-step Recipes page, so Ctrl+K reaches it too. */
const page = (slug: string, name: string, short: string) => ({ slug, name, short, cat: "organize", from: ["pdf"], to: ["pdf"], keywords: [] } as unknown as Tool);
const PAGES: { entry: Tool; href: string; words: RegExp }[] = [
  { entry: page("recipes", "Recipes — chain tools", "Merge → compress → protect, saved and re-run in one click"), href: "/recipes", words: /recip|workflow|chain|automat|multi.?step|combo|pipeline|batch|several/i },
  { entry: page("guides", "How-to guides", "Step-by-step: shrink a PDF, sign without uploading, passport photo…"), href: "/guides", words: /guide|how.?to|tutorial|learn|help|steps|explain/i },
  { entry: page("whats-new", "What’s new", "The newest tools and improvements"), href: "/whats-new", words: /new|update|change|latest|release|changelog|recent/i },
  { entry: page("prove-it", "Prove it — nothing is uploaded", "A live demo of the no-upload, network-locked design"), href: "/prove-it", words: /prove|proof|privacy|private|secure|safe|trust|upload|verify|network/i },
];
const PAGE_HREF = Object.fromEntries(PAGES.map((p) => [p.entry.slug, p.href]));

type Ctx = { open: (q?: string) => void; mod: string };
const PaletteCtx = createContext<Ctx>({ open: () => {}, mod: "Ctrl" });
export const usePalette = () => useContext(PaletteCtx);

export function PaletteProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const [initial, setInitial] = useState("");
  const [mod, setMod] = useState("Ctrl");
  const router = useRouter();

  useEffect(() => { if (/Mac|iPhone|iPad/i.test(navigator.platform)) setMod("⌘"); }, []);

  const open = useCallback((q = "") => { setInitial(q); setOpen(true); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (k === "k" || k === "s")) {
        e.preventDefault(); // Ctrl+S would otherwise open "Save page as…"
        setOpen((o) => !o);
      } else if (k === "/" && !e.ctrlKey && !e.metaKey) {
        const t = e.target as HTMLElement;
        if (!/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && !t.isContentEditable) { e.preventDefault(); open(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const value = useMemo(() => ({ open, mod }), [open, mod]);

  return (
    <PaletteCtx.Provider value={value}>
      {children}
      {isOpen && <Palette initial={initial} onClose={() => setOpen(false)} onPick={(slug) => { setOpen(false); router.push(PAGE_HREF[slug] ?? `/tools/${slug}`); }} />}
    </PaletteCtx.Provider>
  );
}

function Palette({ initial, onClose, onPick }: { initial: string; onClose: () => void; onPick: (slug: string) => void }) {
  const [q, setQ] = useState(initial);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const recent = useMemo(() => getRecent().map((r) => getTool(r.slug)).filter(Boolean).slice(0, 3) as ReturnType<typeof searchTools>, []);
  const recentSet = useMemo(() => new Set(recent.map((t) => t.slug)), [recent]);
  const results = useMemo(() => {
    const base = searchTools(q, 40);
    if (!q.trim()) return [...recent, ...base.filter((t) => !recentSet.has(t.slug)), ...PAGES.map((p) => p.entry)];
    return [...PAGES.filter((p) => p.words.test(q)).map((p) => p.entry), ...base];
  }, [q, recent, recentSet]);

  useEffect(() => { setActive(0); }, [q]);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (results[active]) onPick(results[active].slug); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
  };

  return (
    <div className="pal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="pal" role="dialog" aria-modal="true" aria-label="Search conversions" onKeyDown={onKey}>
        <div className="pal-input">
          <Icon name="search" size={18} />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type what you want — “jpg to pdf”, “compress”, “merge”…" spellCheck={false} autoComplete="off" role="combobox" aria-expanded="true" aria-controls="pal-list" />
          <kbd>esc</kbd>
        </div>
        <div className="pal-list" id="pal-list" role="listbox" ref={listRef}>
          <div className="pal-label">{q.trim() ? `${results.length} result${results.length === 1 ? "" : "s"}` : recent.length ? "Recent & popular" : "Popular conversions"}</div>
          {results.map((t, i) => (
            <button key={t.slug} data-i={i} role="option" aria-selected={i === active} className={`pal-item${i === active ? " on" : ""}`} onMouseMove={() => setActive(i)} onClick={() => onPick(t.slug)}>
              <span className="pal-ico"><Icon name={!q.trim() && recentSet.has(t.slug) ? "clock" : toolIcon(t.slug, t.cat)} size={17} /></span>
              <span className="pal-txt"><b>{t.name}</b><small>{t.short}</small></span>
              <FlowChips from={t.from} to={t.to} flow={t.flow} size="sm" />
              {i === active && <kbd className="pal-enter">↵</kbd>}
            </button>
          ))}
          {!results.length && (
            <div className="pal-empty">
              <p>Nothing matches “{q}”.</p>
              <p>Try <button onClick={() => setQ("jpg to pdf")}>jpg to pdf</button>, <button onClick={() => setQ("compress")}>compress</button> or <button onClick={() => setQ("word")}>word</button>.</p>
            </div>
          )}
        </div>
        <div className="pal-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> open</span>
          <span className="grow" />
          <span className="pal-priv"><Icon name="lock" size={12} /> Files never leave your device</span>
        </div>
      </div>
    </div>
  );
}
