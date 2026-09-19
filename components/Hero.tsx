"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getRecent } from "@/lib/recent";
import { getTool } from "@/lib/tools";
import { usePalette } from "./CommandPalette";
import { Icon } from "./Icon";

const PHRASES = ["jpg to pdf", "compress pdf", "heic to jpg", "merge pdfs", "word to pdf", "pdf to word", "split pages", "png to webp", "excel to pdf"];

function useTyper() {
  const [text, setText] = useState(PHRASES[0]);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let i = 0, n = 0, dir = 1, t: ReturnType<typeof setTimeout>;
    const tick = () => {
      const p = PHRASES[i];
      n += dir;
      setText(p.slice(0, n));
      let d = dir === 1 ? 55 + Math.random() * 45 : 24;
      if (dir === 1 && n === p.length) { dir = -1; d = 1400; }
      else if (dir === -1 && n === 0) { dir = 1; i = (i + 1) % PHRASES.length; d = 350; }
      t = setTimeout(tick, d);
    };
    setText("");
    t = setTimeout(tick, 500);
    return () => clearTimeout(t);
  }, []);
  return text;
}

export function Hero() {
  const { open, mod } = usePalette();
  const typed = useTyper();
  const [recent, setRecent] = useState<{ slug: string; name: string }[]>([]);
  useEffect(() => { setRecent(getRecent().map((r) => getTool(r.slug)).filter(Boolean).slice(0, 3).map((t) => ({ slug: t!.slug, name: t!.name }))); }, []);
  return (
    <section className="hero">
      <div className="hero-bg" aria-hidden />
      <div className="container hero-in">
        <div className="pill"><span className="dot" /> Free forever · No sign-up · Files never leave your device</div>
        <h1>Every file format,<br /><span className="grad">one keystroke away.</span></h1>
        <p className="lead">Merge, split, compress and convert PDFs, Word, Excel and images — right in your browser. Press <kbd>{mod}</kbd><kbd>K</kbd>, type what you want, hit enter. Done.</p>

        <button className="hero-search" onClick={() => open()} aria-label="Search conversions">
          <Icon name="search" size={20} />
          <span className="typed">{typed}<i className="caret" /></span>
          <span className="keys"><kbd>{mod}</kbd><kbd>K</kbd></span>
        </button>

        {recent.length > 0 && (
          <div className="quick">
            <span>Recent:</span>
            {recent.map((r) => <Link key={r.slug} href={`/tools/${r.slug}`}>{r.name}</Link>)}
          </div>
        )}
        <div className="quick">
          <span>Popular:</span>
          {[["jpg-to-pdf", "JPG to PDF"], ["compress-pdf", "Compress PDF"], ["merge-pdf", "Merge PDF"], ["heic-to-jpg", "HEIC to JPG"], ["word-to-pdf", "Word to PDF"]].map(([s, l]) => (
            <Link key={s} href={`/tools/${s}`}>{l}</Link>
          ))}
        </div>
      </div>
    </section>
  );
}
