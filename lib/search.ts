import { FORMATS, IMAGE_FMTS, type Fmt } from "./formats";
import { getTool, POPULAR, TOOLS } from "./tools";
import type { Tool } from "./types";

const ALIAS: Record<string, Fmt[]> = {
  jpeg: ["jpg"], word: ["docx"], doc: ["docx"], excel: ["xlsx"], xls: ["xlsx"], sheet: ["xlsx"], spreadsheet: ["xlsx"],
  text: ["txt"], markdown: ["md"], heif: ["heic"], htm: ["html"], webpage: ["html"],
  image: IMAGE_FMTS, images: IMAGE_FMTS, photo: IMAGE_FMTS, picture: IMAGE_FMTS, img: IMAGE_FMTS,
};

function expand(w: string): Fmt[] {
  if (!w) return [];
  if (ALIAS[w]) return ALIAS[w];
  if (w in FORMATS) return [w as Fmt];
  const out = new Set<Fmt>();
  for (const k of Object.keys(FORMATS)) if (k.startsWith(w)) out.add(k as Fmt);
  for (const [a, f] of Object.entries(ALIAS)) if (a.startsWith(w)) f.forEach((x) => out.add(x));
  return [...out];
}

const PAIR = /^(\S+?)(?:\s+(?:to|into|as|→)\s+|\s*(?:2|->|→|>)\s*)(\S*)$/;

export function searchTools(query: string, limit = 12): Tool[] {
  const q = query.toLowerCase().trim();
  if (!q) return POPULAR.map((s) => getTool(s)!).filter(Boolean);

  const m = q.match(PAIR);
  if (m) {
    const A = expand(m[1]);
    const B = m[2] ? expand(m[2]) : [];
    if (A.length && (!m[2] || B.length)) {
      const hits = TOOLS.filter((t) => t.from.some((f) => A.includes(f)) && (!B.length || t.to.some((f) => B.includes(f))));
      hits.sort((a, b) => {
        const exact = (t: Tool) => (t.from.length === 1 && A.length === 1 && t.from[0] === A[0] ? 2 : 0) + (B.length === 1 && t.to[0] === B[0] ? 2 : 0) + (t.featured ? 1 : 0);
        return exact(b) - exact(a);
      });
      if (hits.length) return hits.slice(0, limit);
    }
  }

  const tokens = q.split(/\s+/).filter(Boolean);
  const scored: { t: Tool; s: number }[] = [];
  for (const t of TOOLS) {
    const name = t.name.toLowerCase();
    const words = name.split(/\W+/);
    const kw = t.keywords.join(" ").toLowerCase();
    const fmts = [...t.from, ...t.to].map((f) => f.toLowerCase());
    let total = 0;
    let all = true;
    for (const tok of tokens) {
      let s = 0;
      if (name.includes(tok)) s += 10;
      if (words.some((w) => w.startsWith(tok))) s += 5;
      if (kw.includes(tok)) s += 6;
      if (fmts.includes(tok)) s += 7;
      else if (fmts.some((f) => f.startsWith(tok))) s += 3;
      if (t.desc.toLowerCase().includes(tok)) s += 1;
      if (!s) { all = false; break; }
      total += s;
    }
    if (all) scored.push({ t, s: total + (t.featured ? 2 : 0) });
  }
  scored.sort((a, b) => b.s - a.s);
  return scored.slice(0, limit).map((x) => x.t);
}
