import { baseName } from "../formats";
import type { Ctx, Out, Result } from "../types";
import { sheetjs, UserError } from "./common";

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  const delim = [",", ";", "\t", "|"].map((d) => [d, first.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); cell = ""; rows.push(row); row = []; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c !== ""));
}

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const textBlob = (s: string, type: string) => new Blob([s], { type: `${type};charset=utf-8` });

export async function csvToJson(files: File[], ctx: Ctx): Promise<Result> {
  const outs: Out[] = [];
  for (const f of files) {
    const rows = parseCsv((await f.text()).replace(/^﻿/, ""));
    if (rows.length < 1) throw new UserError(`"${f.name}" is empty.`);
    const [head, ...body] = rows;
    const data = body.map((r) => Object.fromEntries(head.map((h, i) => [h || `column_${i + 1}`, r[i] ?? ""])));
    outs.push({ name: `${baseName(f.name)}.json`, blob: textBlob(JSON.stringify(data, null, ctx.opts.minify === "yes" ? 0 : 2), "application/json") });
  }
  return { files: outs };
}

export async function jsonToCsv(files: File[]): Promise<Result> {
  const outs: Out[] = [];
  for (const f of files) {
    let data: unknown;
    try { data = JSON.parse(await f.text()); } catch { throw new UserError(`"${f.name}" isn't valid JSON.`); }
    const arr = Array.isArray(data) ? data : data && typeof data === "object" ? [data] : null;
    if (!arr) throw new UserError(`"${f.name}" needs to contain an array of objects.`);
    const keys: string[] = [];
    for (const r of arr) if (r && typeof r === "object") for (const k of Object.keys(r)) if (!keys.includes(k)) keys.push(k);
    const lines = [keys.map(csvCell).join(",")];
    for (const r of arr as any[]) lines.push(keys.map((k) => csvCell(r?.[k])).join(","));
    outs.push({ name: `${baseName(f.name)}.csv`, blob: textBlob(lines.join("\n"), "text/csv") });
  }
  return { files: outs };
}

export async function xlsxTo(files: File[], _ctx: Ctx, target: "csv" | "json"): Promise<Result> {
  const X = await sheetjs();
  const outs: Out[] = [];
  for (const f of files) {
    let wb;
    try { wb = X.read(await f.arrayBuffer(), { type: "array" }); } catch { throw new UserError(`"${f.name}" couldn't be read as a spreadsheet.`); }
    wb.SheetNames.forEach((n: string) => {
      const ws = wb.Sheets[n];
      const suffix = wb.SheetNames.length > 1 ? `-${n.replace(/[^\w-]+/g, "_")}` : "";
      const s = target === "csv" ? X.utils.sheet_to_csv(ws) : JSON.stringify(X.utils.sheet_to_json(ws, { defval: "" }), null, 2);
      if (s.trim()) outs.push({ name: `${baseName(f.name)}${suffix}.${target}`, blob: textBlob(s, target === "csv" ? "text/csv" : "application/json") });
    });
  }
  if (!outs.length) throw new UserError("No data found in the spreadsheet.");
  return { files: outs };
}
