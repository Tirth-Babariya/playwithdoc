import { baseName } from "../formats";
import type { Ctx, Result } from "../types";
import { canvasBlob, makeCanvas, openPdfJs, pdfBlob, tick, UserError } from "./common";
import { extractLines } from "./render";

const W = 640; // width every page is compared at

async function renderPage(pdf: any, i: number): Promise<HTMLCanvasElement | null> {
  if (i >= pdf.numPages) return null;
  const page = await pdf.getPage(i + 1);
  const base = page.getViewport({ scale: 1 });
  const vp = page.getViewport({ scale: W / base.width });
  const c = makeCanvas(vp.width, vp.height);
  const g = c.getContext("2d")!;
  g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: g, viewport: vp }).promise;
  page.cleanup();
  return c;
}

/** Word-level diff (longest common subsequence). Falls back to a cheaper comparison for very long pages. */
function wordDiff(a: string[], b: string[]): { removed: string[]; added: string[] } {
  const n = a.length, m = b.length;
  if (n * m > 6_000_000) {
    const count = new Map<string, number>();
    for (const w of a) count.set(w, (count.get(w) ?? 0) + 1);
    const added: string[] = [];
    for (const w of b) { const c = count.get(w) ?? 0; if (c > 0) count.set(w, c - 1); else added.push(w); }
    const removed: string[] = [];
    for (const [w, c] of count) for (let k = 0; k < c; k++) removed.push(w);
    return { removed, added };
  }
  const width = m + 1;
  const L = new Uint16Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i * width + j] = a[i] === b[j] ? L[(i + 1) * width + j + 1] + 1 : Math.max(L[(i + 1) * width + j], L[i * width + j + 1]);
  const removed: string[] = [], added: string[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { i++; j++; }
    else if (L[(i + 1) * width + j] >= L[i * width + j + 1]) removed.push(a[i++]);
    else added.push(b[j++]);
  }
  while (i < n) removed.push(a[i++]);
  while (j < m) added.push(b[j++]);
  return { removed, added };
}

const words = (lines: { text: string }[] | undefined) => (lines ?? []).flatMap((l) => l.text.split(/\s+/)).filter(Boolean);

type PageResult = { index: number; ratio: number; removed: string[]; added: string[]; a: HTMLCanvasElement | null; b: HTMLCanvasElement | null; diff: HTMLCanvasElement };

export async function comparePdf(files: File[], ctx: Ctx): Promise<Result> {
  if (files.length !== 2) throw new UserError("Add exactly two PDFs — the original first, then the new version.");
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const [fa, fb] = files;
  const [pa, pb] = await Promise.all([openPdfJs(fa), openPdfJs(fb)]);
  const quiet: Ctx = { opts: {}, progress: () => {} };
  ctx.progress(0.02, "Reading text");
  const [ta, tb] = await Promise.all([extractLines(fa, quiet).catch(() => []), extractLines(fb, quiet).catch(() => [])]);

  const total = Math.max(pa.numPages, pb.numPages);
  const changed: PageResult[] = [];
  let addedTotal = 0, removedTotal = 0;

  for (let i = 0; i < total; i++) {
    ctx.progress(0.1 + (0.6 * i) / total, `Comparing page ${i + 1} of ${total}`);
    const [ca, cb] = [await renderPage(pa, i), await renderPage(pb, i)];
    const H = Math.round(Math.max(ca?.height ?? 1, cb?.height ?? 1));
    const A = makeCanvas(W, H), B = makeCanvas(W, H);
    for (const [c, src] of [[A, ca], [B, cb]] as const) { const g = c.getContext("2d")!; g.fillStyle = "#fff"; g.fillRect(0, 0, W, H); if (src) g.drawImage(src, 0, 0); }
    const da = A.getContext("2d")!.getImageData(0, 0, W, H), db = B.getContext("2d")!.getImageData(0, 0, W, H);

    const diff = makeCanvas(W, H);
    const dg = diff.getContext("2d")!;
    const out = dg.createImageData(W, H);
    let n = 0;
    for (let p = 0; p < da.data.length; p += 4) {
      const d = Math.abs(da.data[p] - db.data[p]) + Math.abs(da.data[p + 1] - db.data[p + 1]) + Math.abs(da.data[p + 2] - db.data[p + 2]);
      if (!ca || !cb || d > 90) { out.data[p] = 232; out.data[p + 1] = 40; out.data[p + 2] = 70; n++; }
      else { out.data[p] = db.data[p] * 0.4 + 153; out.data[p + 1] = db.data[p + 1] * 0.4 + 153; out.data[p + 2] = db.data[p + 2] * 0.4 + 153; }
      out.data[p + 3] = 255;
    }
    dg.putImageData(out, 0, 0);

    const { removed, added } = wordDiff(words(ta[i]), words(tb[i]));
    const ratio = n / (W * H);
    if (ratio > 0.0004 || removed.length || added.length) {
      changed.push({ index: i, ratio, removed, added, a: A, b: B, diff });
      removedTotal += removed.length; addedTotal += added.length;
    } else { A.width = A.height = B.width = B.height = diff.width = diff.height = 0; }
    if (ca) ca.width = ca.height = 0;
    if (cb) cb.width = cb.height = 0;
    await tick();
  }
  await pa.destroy(); await pb.destroy();

  /* ── build the report ── */
  ctx.progress(0.75, "Building the report");
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const safe = (s: string) => [...s].map((ch) => { try { font.encodeText(ch); return ch; } catch { return "?"; } }).join("");
  const wrap = (text: string, size: number, maxW: number) => {
    const lines: string[] = []; let cur = "";
    for (const w of safe(text).split(/\s+/)) { const t = cur ? `${cur} ${w}` : w; if (font.widthOfTextAtSize(t, size) > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
    if (cur) lines.push(cur);
    return lines;
  };

  const sum = doc.addPage([595, 842]);
  let y = 780;
  sum.drawText("PDF comparison", { x: 48, y, size: 26, font: bold, color: rgb(0.1, 0.1, 0.1) }); y -= 34;
  for (const [tag, f, pdf] of [["A (original)", fa, pa], ["B (new)", fb, pb]] as const) {
    for (const ln of wrap(`${tag}: ${f.name} — ${pdf.numPages} page${pdf.numPages === 1 ? "" : "s"}`, 11, 500)) { sum.drawText(ln, { x: 48, y, size: 11, font, color: rgb(0.3, 0.3, 0.3) }); y -= 15; }
  }
  y -= 12;
  const verdict = changed.length ? `${changed.length} of ${total} page${total === 1 ? "" : "s"} differ` : "The two files look identical";
  sum.drawText(verdict, { x: 48, y, size: 16, font: bold, color: changed.length ? rgb(0.85, 0.15, 0.25) : rgb(0.1, 0.55, 0.3) }); y -= 24;
  if (changed.length) {
    sum.drawText(`+${addedTotal} words added   −${removedTotal} words removed`, { x: 48, y, size: 11, font, color: rgb(0.3, 0.3, 0.3) }); y -= 26;
    for (const c of changed) {
      if (y < 60) break;
      sum.drawText(safe(`Page ${c.index + 1}: ${(c.ratio * 100).toFixed(1)}% of the page changed · +${c.added.length} / −${c.removed.length} words`), { x: 48, y, size: 11, font, color: rgb(0.15, 0.15, 0.15) }); y -= 16;
    }
  }
  sum.drawText("Red marks on the right-hand image show what changed on the page.", { x: 48, y: 40, size: 9, font, color: rgb(0.5, 0.5, 0.5) });

  const txt: string[] = [`PDF comparison\nA: ${fa.name}\nB: ${fb.name}\n`];
  const [PW, PH, M] = [842, 595, 24];
  for (const c of changed) {
    const page = doc.addPage([PW, PH]);
    page.drawText(`Page ${c.index + 1}`, { x: M, y: PH - 34, size: 16, font: bold });
    page.drawText(`${(c.ratio * 100).toFixed(1)}% changed  ·  +${c.added.length} / −${c.removed.length} words`, { x: M + 80, y: PH - 32, size: 10, font, color: rgb(0.4, 0.4, 0.4) });
    const gap = 14, cw = (PW - M * 2 - gap * 2) / 3, availH = PH - 60 - 150;
    const scale = Math.min(cw / W, availH / c.diff.height);
    const iw = W * scale, ih = c.diff.height * scale;
    const imgs: [string, HTMLCanvasElement | null][] = [["A — original", c.a], ["B — new", c.b], ["Changes", c.diff]];
    for (let k = 0; k < 3; k++) {
      const [label, cv] = imgs[k];
      const x = M + k * (cw + gap);
      page.drawText(label, { x, y: PH - 56, size: 9, font: bold, color: rgb(0.35, 0.35, 0.35) });
      if (cv) {
        const jpg = await doc.embedJpg(new Uint8Array(await (await canvasBlob(cv, "image/jpeg", 0.78)).arrayBuffer()));
        page.drawImage(jpg, { x, y: PH - 62 - ih, width: iw, height: ih });
        page.drawRectangle({ x, y: PH - 62 - ih, width: iw, height: ih, borderColor: rgb(0.8, 0.8, 0.8), borderWidth: 0.5 });
      }
    }
    const colW = (PW - M * 2 - gap) / 2;
    const blocks: [string, string[], [number, number, number]][] = [["Removed", c.removed, [0.85, 0.15, 0.25]], ["Added", c.added, [0.1, 0.55, 0.3]]];
    blocks.forEach(([title, list, col], k) => {
      const x = M + k * (colW + gap);
      page.drawText(`${title} (${list.length})`, { x, y: 130, size: 10, font: bold, color: rgb(...col) });
      const shown = list.slice(0, 70).join(" ") + (list.length > 70 ? " …" : "");
      wrap(shown || "—", 8.5, colW).slice(0, 9).forEach((ln, li) => page.drawText(ln, { x, y: 115 - li * 11, size: 8.5, font, color: rgb(0.2, 0.2, 0.2) }));
    });
    txt.push(`--- Page ${c.index + 1} ---\nRemoved (${c.removed.length}): ${c.removed.join(" ") || "—"}\nAdded (${c.added.length}): ${c.added.join(" ") || "—"}\n`);
    for (const cv of [c.a, c.b, c.diff]) if (cv) cv.width = cv.height = 0;
    await tick();
  }

  const bytes = await doc.save({ useObjectStreams: true });
  const stem = `${baseName(fa.name)}-vs-${baseName(fb.name)}`;
  return {
    files: [
      { name: `${stem}-comparison.pdf`, blob: pdfBlob(bytes) },
      { name: `${stem}-changes.txt`, blob: new Blob([txt.join("\n")], { type: "text/plain;charset=utf-8" }) },
    ],
    note: changed.length
      ? `${changed.length} of ${total} pages differ (${changed.map((c) => c.index + 1).slice(0, 12).join(", ")}${changed.length > 12 ? "…" : ""}). +${addedTotal} / −${removedTotal} words. Differences are shown in red in the report.`
      : "No differences found — the pages look identical and the text matches.",
  };
}
