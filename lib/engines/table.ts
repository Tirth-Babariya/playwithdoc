import { baseName } from "../formats";
import type { Ctx, Result } from "../types";
import { openPdfJs, sheetjs, tick, UserError } from "./common";

type Cell = { text: string; x0: number; x1: number };
type Row = { y: number; size: number; cells: Cell[] };

/** Groups a page's text into rows and cells using positions (works for text-based PDFs, not scans). */
async function pageRows(page: any): Promise<Row[]> {
  const tc = await page.getTextContent();
  const items = (tc.items as any[])
    .filter((it) => typeof it.str === "string" && it.str.trim() !== "")
    .map((it) => ({ s: it.str as string, x: it.transform[4] as number, y: it.transform[5] as number, w: (it.width as number) || 0, size: Math.hypot(it.transform[0], it.transform[1]) || 10 }));
  items.sort((a, b) => b.y - a.y || a.x - b.x);

  const rows: { y: number; size: number; items: typeof items }[] = [];
  for (const it of items) {
    const r = rows.find((row) => Math.abs(row.y - it.y) <= Math.max(2, Math.min(row.size, it.size) * 0.45));
    if (r) r.items.push(it); else rows.push({ y: it.y, size: it.size, items: [it] });
  }
  rows.sort((a, b) => b.y - a.y);

  return rows.map((r) => {
    r.items.sort((a, b) => a.x - b.x);
    const cells: Cell[] = [];
    for (const it of r.items) {
      const last = cells[cells.length - 1];
      const gap = last ? it.x - last.x1 : Infinity;
      if (last && gap < Math.max(r.size * 1.1, 6)) { last.text += (gap > r.size * 0.15 ? " " : "") + it.s; last.x1 = it.x + it.w; }
      else cells.push({ text: it.s, x0: it.x, x1: it.x + it.w });
    }
    return { y: r.y, size: r.size, cells };
  });
}

/** Finds the column start positions shared by several rows. */
function columnsOf(rows: Row[]): number[] {
  const multi = rows.filter((r) => r.cells.length >= 2);
  if (!multi.length) return [];
  const xs = multi.flatMap((r) => r.cells.map((c) => c.x0)).sort((a, b) => a - b);
  const clusters: { x: number; n: number }[] = [];
  for (const x of xs) {
    const c = clusters[clusters.length - 1];
    if (c && x - c.x <= 6) { c.x = (c.x * c.n + x) / (c.n + 1); c.n++; } else clusters.push({ x, n: 1 });
  }
  const need = Math.max(2, Math.ceil(multi.length * 0.2));
  return clusters.filter((c) => c.n >= need).map((c) => c.x);
}

const NUM = /^\(?-?[$€£₹]?\s?\d[\d,]*(\.\d+)?%?\)?$/;
function asValue(text: string, numbers: boolean): string | number {
  if (!numbers) return text;
  const t = text.trim();
  if (!NUM.test(t)) return text;
  const neg = t.startsWith("(") && t.endsWith(")");
  const n = parseFloat(t.replace(/[^\d.\-]/g, ""));
  if (!isFinite(n)) return text;
  const v = t.endsWith("%") ? n / 100 : n;
  return neg ? -Math.abs(v) : v;
}

export async function pdfToExcel(files: File[], ctx: Ctx): Promise<Result> {
  const X = await sheetjs();
  const numbers = ctx.opts.numbers !== "no";
  const perPage = ctx.opts.layout !== "single";
  const outs = [];
  let tables = 0;

  for (let f = 0; f < files.length; f++) {
    const pdf = await openPdfJs(files[f]);
    const wb = X.utils.book_new();
    const all: (string | number)[][] = [];
    let hadText = false;

    for (let p = 1; p <= pdf.numPages; p++) {
      ctx.progress((f + (p - 1) / pdf.numPages) / files.length, `Reading page ${p} of ${pdf.numPages}`);
      const page = await pdf.getPage(p);
      const rows = await pageRows(page);
      page.cleanup();
      if (!rows.length) continue;
      hadText = true;
      const cols = columnsOf(rows);
      if (cols.length >= 2) tables++;
      const width = Math.max(1, cols.length);

      const data: (string | number)[][] = [];
      let prevY: number | null = null;
      for (const r of rows) {
        if (prevY !== null && prevY - r.y > r.size * 2.6) data.push(Array(width).fill(""));
        prevY = r.y;
        const line: (string | number)[] = Array(width).fill("");
        for (const c of r.cells) {
          let k = 0;
          if (cols.length && r.cells.length >= 2) { let best = Infinity; cols.forEach((cx, i) => { const d = Math.abs(cx - c.x0); if (d < best) { best = d; k = i; } }); }
          const prev = line[k];
          line[k] = prev === "" ? asValue(c.text, numbers) : `${prev} ${c.text}`;
        }
        data.push(line);
      }
      if (perPage) X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(data), `Page ${p}`);
      else { if (all.length) all.push([]); all.push(...data); }
      await tick();
    }
    await pdf.destroy();

    if (!hadText) throw new UserError(`No selectable text in “${files[f].name}” — it looks scanned. Run it through OCR PDF first, then try again.`);
    if (!perPage) X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(all), "Data");
    const bytes: ArrayBuffer = X.write(wb, { type: "array", bookType: "xlsx" });
    outs.push({ name: `${baseName(files[f].name)}.xlsx`, blob: new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }) });
  }

  return {
    files: outs,
    note: tables
      ? `Found table-like layouts on ${tables} page${tables === 1 ? "" : "s"}. Check merged or unusual cells — PDFs don’t store tables, so columns are inferred from where text sits.`
      : "No clear tables were detected, so text was placed row by row. PDFs don’t store tables — columns are inferred from where text sits.",
  };
}
