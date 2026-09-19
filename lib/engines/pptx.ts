import type { PDFDocument, PDFFont, PDFPage } from "pdf-lib";
import { baseName } from "../formats";
import type { Ctx, Result } from "../types";
import { canvasBlob, makeCanvas, openPdfJs, pdfBlob, tick, UserError } from "./common";

const EMU = 12700; // EMU per point

/* ───────────────────────── PPTX → PDF ───────────────────────── */

const kids = (el: Element | null | undefined, name?: string) => [...(el?.children ?? [])].filter((c) => !name || c.localName === name);
const kid = (el: Element | null | undefined, ...path: string[]) => { let cur: Element | null | undefined = el; for (const n of path) cur = kids(cur, n)[0]; return cur ?? null; };
const all = (el: Element | Document, name: string) => [...el.getElementsByTagNameNS("*", name)];
const num = (v: string | null, d = 0) => (v === null || v === "" || isNaN(+v) ? d : +v);

type Xf = { x: number; y: number; w: number; h: number };
type Tf = (x: Xf) => Xf;
const ident: Tf = (x) => x;

function parseXml(text: string): Document {
  return new DOMParser().parseFromString(text, "application/xml");
}

function relMap(xml: string | undefined): Map<string, string> {
  const m = new Map<string, string>();
  if (!xml) return m;
  for (const r of all(parseXml(xml), "Relationship")) m.set(r.getAttribute("Id")!, r.getAttribute("Target")!);
  return m;
}

function resolvePath(base: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const parts = base.split("/").slice(0, -1);
  for (const seg of target.split("/")) { if (seg === "..") parts.pop(); else if (seg !== ".") parts.push(seg); }
  return parts.join("/");
}

function readXfrm(x: Element | null | undefined): Xf | null {
  if (!x) return null;
  const off = kid(x, "off"), ext = kid(x, "ext");
  if (!off || !ext) return null;
  return { x: num(off.getAttribute("x")) / EMU, y: num(off.getAttribute("y")) / EMU, w: num(ext.getAttribute("cx")) / EMU, h: num(ext.getAttribute("cy")) / EMU };
}

type Theme = Record<string, string>;
function readTheme(xml: string | undefined): Theme {
  const t: Theme = {};
  if (!xml) return t;
  const scheme = all(parseXml(xml), "clrScheme")[0];
  for (const c of kids(scheme)) {
    const v = kid(c, "srgbClr")?.getAttribute("val") ?? kid(c, "sysClr")?.getAttribute("lastClr");
    if (v) t[c.localName] = v;
  }
  return t;
}
const SCHEME_ALIAS: Record<string, string> = { tx1: "dk1", bg1: "lt1", tx2: "dk2", bg2: "lt2" };

function colorOf(fill: Element | null | undefined, theme: Theme): [number, number, number] | null {
  const c = fill && (kid(fill, "srgbClr") ?? kid(fill, "schemeClr") ?? kid(fill, "sysClr"));
  if (!c) return null;
  let hex = c.localName === "srgbClr" ? c.getAttribute("val") : c.localName === "sysClr" ? c.getAttribute("lastClr") : theme[SCHEME_ALIAS[c.getAttribute("val")!] ?? c.getAttribute("val")!];
  if (!hex || !/^[0-9a-f]{6}$/i.test(hex)) return null;
  let r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
  const lm = kid(c, "lumMod"), lo = kid(c, "lumOff");
  if (lm || lo) {
    const mod = lm ? num(lm.getAttribute("val"), 100000) / 100000 : 1, off = lo ? num(lo.getAttribute("val")) / 100000 : 0;
    const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * mod + 255 * off)));
    r = f(r); g = f(g); b = f(b);
  }
  return [r / 255, g / 255, b / 255];
}
function fillOf(spPr: Element | null | undefined, theme: Theme) {
  if (!spPr) return null;
  const solid = kid(spPr, "solidFill");
  if (solid) return colorOf(solid, theme);
  const grad = kid(spPr, "gradFill");
  if (grad) return colorOf(kid(grad, "gsLst", "gs"), theme);
  return null;
}

type Ctx2 = {
  zip: any; doc: PDFDocument; page: PDFPage; W: number; H: number; theme: Theme;
  fonts: { r: PDFFont; b: PDFFont; i: PDFFont; bi: PDFFont }; rels: Map<string, string>; slidePath: string;
  layout: Document | null; master: Document | null; lib: typeof import("pdf-lib");
};

function findPlaceholderXfrm(root: Document | null, ph: Element | null): Xf | null {
  if (!root || !ph) return null;
  const type = ph.getAttribute("type"), idx = ph.getAttribute("idx");
  for (const sp of all(root, "sp")) {
    const p = kid(sp, "nvSpPr", "nvPr", "ph");
    if (!p) continue;
    const same = (idx !== null && p.getAttribute("idx") === idx) || (idx === null && p.getAttribute("type") === type) || (type && p.getAttribute("type") === type && idx === null);
    if (same) { const x = readXfrm(kid(sp, "spPr", "xfrm")); if (x) return x; }
  }
  return null;
}

function defaultSize(master: Document | null, ph: Element | null): number {
  const isTitle = ph && /title/i.test(ph.getAttribute("type") ?? "");
  const style = master && all(master, isTitle ? "titleStyle" : "bodyStyle")[0];
  const sz = num(kid(style, "lvl1pPr", "defRPr")?.getAttribute("sz") ?? null, isTitle ? 3200 : ph ? 2000 : 1800);
  return sz / 100;
}

type Run = { t: string; b: boolean; i: boolean; size: number; color: [number, number, number] };
type Para = { runs: Run[]; algn: string; bullet: string; indent: number };

function readParas(txBody: Element, c: Ctx2, baseSize: number, scale: number): Para[] {
  const out: Para[] = [];
  let auto = 0;
  for (const p of kids(txBody, "p")) {
    const pPr = kid(p, "pPr");
    const lvl = num(pPr?.getAttribute("lvl") ?? null);
    const marL = num(pPr?.getAttribute("marL") ?? null) / EMU;
    const bu = kid(pPr, "buChar")?.getAttribute("char") ?? (kid(pPr, "buAutoNum") ? `${++auto}.` : "");
    if (!kid(pPr, "buAutoNum")) auto = 0;
    const defRPr = kid(pPr, "defRPr");
    const runs: Run[] = [];
    for (const r of p.children) {
      if (r.localName !== "r" && r.localName !== "br" && r.localName !== "fld") continue;
      if (r.localName === "br") { runs.push({ t: "\n", b: false, i: false, size: baseSize, color: [0, 0, 0] }); continue; }
      const rPr = kid(r, "rPr");
      const t = kid(r, "t")?.textContent ?? "";
      if (!t) continue;
      const sz = num(rPr?.getAttribute("sz") ?? null, num(defRPr?.getAttribute("sz") ?? null, baseSize * 100)) / 100;
      runs.push({ t, b: rPr?.getAttribute("b") === "1", i: rPr?.getAttribute("i") === "1", size: sz * scale, color: colorOf(kid(rPr, "solidFill"), c.theme) ?? [0.1, 0.1, 0.1] });
    }
    out.push({ runs, algn: pPr?.getAttribute("algn") ?? "l", bullet: bu, indent: marL || (bu ? 18 + lvl * 18 : lvl * 18) });
  }
  return out;
}

function clean(f: PDFFont, s: string): string {
  return [...s.replace(/\t/g, "    ").replace(/ /g, " ")].map((ch) => { try { f.encodeText(ch); return ch; } catch { return "?"; } }).join("");
}

function drawParas(c: Ctx2, paras: Para[], box: Xf, anchor: string, ins: { l: number; t: number; r: number; b: number }) {
  const maxW = Math.max(10, box.w - ins.l - ins.r);
  type Line = { toks: { s: string; f: PDFFont; size: number; w: number; color: [number, number, number] }[]; w: number; size: number; algn: string; x0: number; bullet?: string; gap: number };
  const lines: Line[] = [];
  for (const p of paras) {
    const x0 = p.indent, avail = maxW - x0;
    let cur: Line = { toks: [], w: 0, size: Math.max(...p.runs.map((r) => r.size), 8), algn: p.algn, x0, bullet: p.bullet, gap: 0 };
    const flush = (last = false) => { lines.push(cur); cur = { toks: [], w: 0, size: cur.size, algn: p.algn, x0, gap: 0 }; if (last) lines[lines.length - 1].gap = cur.size * 0.35; };
    if (!p.runs.length) { lines.push({ ...cur, gap: cur.size * 0.35 }); continue; }
    for (const r of p.runs) {
      const f = r.b && r.i ? c.fonts.bi : r.b ? c.fonts.b : r.i ? c.fonts.i : c.fonts.r;
      for (const part of r.t.split(/(\n|\s+)/)) {
        if (!part) continue;
        if (part === "\n") { flush(); continue; }
        const s = clean(f, part);
        const w = f.widthOfTextAtSize(s, r.size);
        if (!/\S/.test(part) && cur.toks.length === 0) continue;
        if (cur.w + w > avail && cur.toks.length && /\S/.test(part)) { while (cur.toks.at(-1) && !/\S/.test(cur.toks.at(-1)!.s)) cur.w -= cur.toks.pop()!.w; flush(); }
        cur.toks.push({ s, f, size: r.size, w, color: r.color });
        cur.w += w;
        cur.size = Math.max(cur.size, r.size);
      }
    }
    flush(true);
  }
  const total = lines.reduce((n, l) => n + l.size * 1.2 + l.gap, 0);
  let y = box.y + ins.t;
  if (anchor === "ctr") y = box.y + (box.h - total) / 2; else if (anchor === "b") y = box.y + box.h - ins.b - total;
  for (const l of lines) {
    const baseline = c.H - (y + l.size * 1.0);
    let x = box.x + ins.l + l.x0;
    if (l.algn === "ctr") x = box.x + ins.l + l.x0 + (maxW - l.x0 - l.w) / 2; else if (l.algn === "r") x = box.x + ins.l + maxW - l.w;
    if (l.bullet && l.toks[0]) c.page.drawText(clean(l.toks[0].f, l.bullet), { x: x - 14, y: baseline, size: l.toks[0].size, font: l.toks[0].f, color: c.lib.rgb(...l.toks[0].color) });
    for (const t of l.toks) { if (/\S/.test(t.s)) c.page.drawText(t.s, { x, y: baseline, size: t.size, font: t.f, color: c.lib.rgb(...t.color) }); x += t.w; }
    y += l.size * 1.2 + l.gap;
  }
}

async function drawShape(c: Ctx2, el: Element, tf: Tf) {
  const { rgb } = c.lib;
  const tag = el.localName;
  if (tag === "grpSp") {
    const gx = kid(el, "grpSpPr", "xfrm");
    const off = readXfrm(gx);
    const ch = gx && kid(gx, "chOff") && kid(gx, "chExt") ? { x: num(kid(gx, "chOff")!.getAttribute("x")) / EMU, y: num(kid(gx, "chOff")!.getAttribute("y")) / EMU, w: num(kid(gx, "chExt")!.getAttribute("cx")) / EMU, h: num(kid(gx, "chExt")!.getAttribute("cy")) / EMU } : null;
    const inner: Tf = off && ch && ch.w && ch.h
      ? (b) => tf({ x: off.x + (b.x - ch.x) * (off.w / ch.w), y: off.y + (b.y - ch.y) * (off.h / ch.h), w: b.w * (off.w / ch.w), h: b.h * (off.h / ch.h) })
      : tf;
    for (const k of el.children) if (["sp", "pic", "grpSp", "graphicFrame", "cxnSp"].includes(k.localName)) await drawShape(c, k, inner);
    return;
  }

  const spPr = kid(el, tag === "graphicFrame" ? "" : "spPr");
  const ph = kid(el, "nvSpPr", "nvPr", "ph");
  let xf = tag === "graphicFrame" ? readXfrm(kid(el, "xfrm")) : readXfrm(kid(spPr, "xfrm"));
  if (!xf && ph) xf = findPlaceholderXfrm(c.layout, ph) ?? findPlaceholderXfrm(c.master, ph);
  if (!xf) return;
  const b = tf(xf);
  const y = c.H - b.y - b.h;

  if (tag === "pic") {
    const rid = kid(el, "blipFill", "blip")?.getAttribute("r:embed") ?? all(el, "blip")[0]?.getAttribute("r:embed");
    const target = rid && c.rels.get(rid);
    if (!target) return;
    const path = resolvePath(c.slidePath, target);
    const file = c.zip.file(path);
    if (!file) return;
    const bytes: Uint8Array = await file.async("uint8array");
    const ext = path.split(".").pop()!.toLowerCase();
    try {
      const img = ext === "png" ? await c.doc.embedPng(bytes) : ext === "jpg" || ext === "jpeg" ? await c.doc.embedJpg(bytes) : null;
      if (img) c.page.drawImage(img, { x: b.x, y, width: b.w, height: b.h });
    } catch { /* unsupported image — skip */ }
    return;
  }

  if (tag === "graphicFrame") {
    const tbl = all(el, "tbl")[0];
    if (!tbl) return;
    const cols = all(tbl, "gridCol").map((g) => num(g.getAttribute("w")) / EMU);
    const scaleX = cols.length ? b.w / cols.reduce((a, v) => a + v, 0) : 1;
    let ty = b.y;
    for (const tr of kids(tbl, "tr")) {
      const rh = num(tr.getAttribute("h")) / EMU;
      let tx = b.x;
      kids(tr, "tc").forEach((tc, ci) => {
        const cw = (cols[ci] ?? 80) * scaleX;
        const fill = fillOf(kid(tc, "tcPr"), c.theme);
        c.page.drawRectangle({ x: tx, y: c.H - ty - rh, width: cw, height: rh, borderColor: rgb(0.75, 0.75, 0.75), borderWidth: 0.6, ...(fill ? { color: rgb(...fill) } : {}) });
        const tb = kid(tc, "txBody");
        if (tb) drawParas(c, readParas(tb, c, 12, 1), { x: tx, y: ty, w: cw, h: rh }, "t", { l: 4, t: 3, r: 4, b: 3 });
        tx += cw;
      });
      ty += rh;
    }
    return;
  }

  const geom = kid(spPr, "prstGeom")?.getAttribute("prst") ?? "rect";
  const fill = fillOf(spPr, c.theme);
  const ln = kid(spPr, "ln");
  const lineColor = ln && !kid(ln, "noFill") ? colorOf(kid(ln, "solidFill"), c.theme) : null;
  const lw = ln ? Math.max(0.5, num(ln.getAttribute("w")) / EMU) : 0.75;
  if (geom === "ellipse" && (fill || lineColor)) {
    c.page.drawEllipse({ x: b.x + b.w / 2, y: y + b.h / 2, xScale: b.w / 2, yScale: b.h / 2, ...(fill ? { color: rgb(...fill) } : {}), ...(lineColor ? { borderColor: rgb(...lineColor), borderWidth: lw } : {}) });
  } else if (["rect", "roundRect", "flowChartProcess", "snip1Rect", "round1Rect"].includes(geom) && (fill || lineColor)) {
    c.page.drawRectangle({ x: b.x, y, width: b.w, height: b.h, ...(fill ? { color: rgb(...fill) } : {}), ...(lineColor ? { borderColor: rgb(...lineColor), borderWidth: lw } : {}) });
  } else if (tag === "cxnSp" && lineColor) {
    c.page.drawLine({ start: { x: b.x, y: y + b.h }, end: { x: b.x + b.w, y }, thickness: lw, color: rgb(...lineColor) });
  }

  const tb = kid(el, "txBody");
  if (tb && all(tb, "t").some((t) => t.textContent?.trim())) {
    const bodyPr = kid(tb, "bodyPr");
    const fs = num(kid(bodyPr, "normAutofit")?.getAttribute("fontScale") ?? null, 100000) / 100000;
    const ins = { l: num(bodyPr?.getAttribute("lIns") ?? null, 91440) / EMU, t: num(bodyPr?.getAttribute("tIns") ?? null, 45720) / EMU, r: num(bodyPr?.getAttribute("rIns") ?? null, 91440) / EMU, b: num(bodyPr?.getAttribute("bIns") ?? null, 45720) / EMU };
    drawParas(c, readParas(tb, c, defaultSize(c.master, ph), fs), b, bodyPr?.getAttribute("anchor") ?? "t", ins);
  }
}

export async function pptxToPdf(files: File[], ctx: Ctx): Promise<Result> {
  const JSZip = (await import("jszip")).default;
  const lib = await import("pdf-lib");
  const outs = [];
  for (let f = 0; f < files.length; f++) {
    let zip: any;
    try { zip = await JSZip.loadAsync(await files[f].arrayBuffer()); } catch { throw new UserError(`"${files[f].name}" isn't a valid .pptx file. For old .ppt files, re-save as .pptx first.`); }
    const text = async (p: string) => (zip.file(p) ? (zip.file(p).async("string") as Promise<string>) : undefined);
    const presXml = await text("ppt/presentation.xml");
    if (!presXml) throw new UserError(`"${files[f].name}" isn't a valid .pptx file.`);
    const pres = parseXml(presXml);
    const sz = all(pres, "sldSz")[0];
    const W = num(sz?.getAttribute("cx") ?? null, 9144000) / EMU, H = num(sz?.getAttribute("cy") ?? null, 6858000) / EMU;
    const presRels = relMap(await text("ppt/_rels/presentation.xml.rels"));
    const theme = readTheme(await text("ppt/theme/theme1.xml"));
    const slidePaths = all(pres, "sldId").map((s) => presRels.get(s.getAttribute("r:id")!)).filter(Boolean).map((t) => resolvePath("ppt/presentation.xml", t!));
    if (!slidePaths.length) throw new UserError("This presentation has no slides.");

    const doc = await lib.PDFDocument.create();
    const F = lib.StandardFonts;
    const fonts = { r: await doc.embedFont(F.Helvetica), b: await doc.embedFont(F.HelveticaBold), i: await doc.embedFont(F.HelveticaOblique), bi: await doc.embedFont(F.HelveticaBoldOblique) };

    for (let i = 0; i < slidePaths.length; i++) {
      ctx.progress((f + i / slidePaths.length) / files.length, `Slide ${i + 1} of ${slidePaths.length}`);
      const sp = slidePaths[i];
      const slide = parseXml((await text(sp))!);
      const rels = relMap(await text(sp.replace(/([^/]+)$/, "_rels/$1.rels")));
      const layoutPath = [...rels.values()].find((t) => /slideLayout/.test(t));
      const layoutFull = layoutPath ? resolvePath(sp, layoutPath) : "";
      const layout = layoutFull && (await text(layoutFull)) ? parseXml((await text(layoutFull))!) : null;
      const layoutRels = layoutFull ? relMap(await text(layoutFull.replace(/([^/]+)$/, "_rels/$1.rels"))) : new Map();
      const masterPath = [...layoutRels.values()].find((t) => /slideMaster/.test(t));
      const masterFull = masterPath ? resolvePath(layoutFull, masterPath) : "";
      const master = masterFull && (await text(masterFull)) ? parseXml((await text(masterFull))!) : null;

      const page = doc.addPage([W, H]);
      const bgFill = [slide, layout, master].map((d) => d && fillOf(all(d, "bgPr")[0], theme)).find(Boolean);
      if (bgFill) page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: lib.rgb(...bgFill) });

      const c: Ctx2 = { zip, doc, page, W, H, theme, fonts, rels, slidePath: sp, layout, master, lib };
      // Draw master/layout picture & shape decorations first (non-placeholders), then the slide itself.
      for (const src of [master, layout]) {
        const tree = src && all(src, "spTree")[0];
        if (!tree) continue;
        const srcRels = src === master ? relMap(await text(masterFull.replace(/([^/]+)$/, "_rels/$1.rels"))) : layoutRels;
        const cc = { ...c, rels: srcRels, slidePath: src === master ? masterFull : layoutFull };
        for (const k of tree.children) if (["sp", "pic", "grpSp"].includes(k.localName) && !kid(k, "nvSpPr", "nvPr", "ph")) await drawShape(cc, k, ident);
      }
      const tree = all(slide, "spTree")[0];
      if (tree) for (const k of tree.children) if (["sp", "pic", "grpSp", "graphicFrame", "cxnSp"].includes(k.localName)) await drawShape(c, k, ident);
      await tick();
    }
    outs.push({ name: `${baseName(files[f].name)}.pdf`, blob: pdfBlob(await doc.save({ useObjectStreams: true })) });
  }
  return { files: outs, note: "Text, shapes, tables and pictures are converted. Charts, SmartArt, animations and custom fonts aren’t supported." };
}

/* ───────────────────────── PDF → PPTX ───────────────────────── */

const X = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!)).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
const NS = `xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"`;
const HDR = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`;

const THEME = `${HDR}<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="PlayWithDoc"><a:themeElements><a:clrScheme name="PlayWithDoc"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1F2937"/></a:dk2><a:lt2><a:srgbClr val="F3F4F6"/></a:lt2><a:accent1><a:srgbClr val="5B5BF0"/></a:accent1><a:accent2><a:srgbClr val="06B6D4"/></a:accent2><a:accent3><a:srgbClr val="16A34A"/></a:accent3><a:accent4><a:srgbClr val="D97706"/></a:accent4><a:accent5><a:srgbClr val="E5484D"/></a:accent5><a:accent6><a:srgbClr val="8B5CF6"/></a:accent6><a:hlink><a:srgbClr val="2563EB"/></a:hlink><a:folHlink><a:srgbClr val="7C3AED"/></a:folHlink></a:clrScheme><a:fontScheme name="PlayWithDoc"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="PlayWithDoc"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;

const GRP = `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>`;

export async function pdfToPptx(files: File[], ctx: Ctx): Promise<Result> {
  const JSZip = (await import("jszip")).default;
  const mode = ctx.opts.mode || "image";
  const outs = [];
  for (let f = 0; f < files.length; f++) {
    const pdf = await openPdfJs(files[f]);
    const zip = new JSZip();
    const slides: string[] = [];
    let cx = 0, cy = 0;
    for (let p = 1; p <= pdf.numPages; p++) {
      ctx.progress((f + (p - 1) / pdf.numPages) / files.length, `Slide ${p} of ${pdf.numPages}`);
      const page = await pdf.getPage(p);
      const pt = page.getViewport({ scale: 1 });
      if (p === 1) { cx = Math.round(pt.width * EMU); cy = Math.round(pt.height * EMU); }
      const sx = cx / pt.width, sy = cy / pt.height;
      let shapes = "";
      let rel = `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>`;
      if (mode === "image") {
        const vp = page.getViewport({ scale: 150 / 72 });
        const c = makeCanvas(vp.width, vp.height);
        const g = c.getContext("2d")!;
        g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
        await page.render({ canvasContext: g, viewport: vp }).promise;
        zip.file(`ppt/media/image${p}.jpeg`, await canvasBlob(c, "image/jpeg", 0.82));
        c.width = c.height = 0;
        rel += `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${p}.jpeg"/>`;
        shapes = `<p:pic><p:nvPicPr><p:cNvPr id="2" name="Page ${p}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
      } else {
        const tc = await page.getTextContent();
        type L = { s: string; x: number; y: number; size: number; end: number };
        const lines: L[] = [];
        let cur: L | null = null;
        for (const it of tc.items as any[]) {
          if (typeof it.str !== "string" || !it.str) continue;
          const y = it.transform[5], x = it.transform[4], size = Math.hypot(it.transform[0], it.transform[1]) || 10;
          if (cur && Math.abs(y - cur.y) < size * 0.5 && x >= cur.x) { cur.s += it.str; cur.end = x + (it.width || 0); }
          else { if (cur) lines.push(cur); cur = { s: it.str, x, y, size, end: x + (it.width || 0) }; }
        }
        if (cur) lines.push(cur);
        lines.filter((l) => l.s.trim()).forEach((l, i) => {
          const w = Math.max(10, l.end - l.x + 6), h = l.size * 1.3;
          shapes += `<p:sp><p:nvSpPr><p:cNvPr id="${i + 2}" name="Text ${i + 1}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${Math.round(l.x * sx)}" y="${Math.round((pt.height - l.y - l.size) * sy)}"/><a:ext cx="${Math.round(w * sx)}" cy="${Math.round(h * sy)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" rtlCol="0"><a:noAutofit/></a:bodyPr><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="${Math.max(600, Math.round(l.size * 100))}" dirty="0"/><a:t>${X(l.s)}</a:t></a:r></a:p></p:txBody></p:sp>`;
        });
      }
      slides.push(`${HDR}<p:sld ${NS}><p:cSld><p:spTree>${GRP}${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`);
      zip.file(`ppt/slides/_rels/slide${p}.xml.rels`, `${HDR}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rel}</Relationships>`);
      page.cleanup();
      await tick();
    }
    await pdf.destroy();

    slides.forEach((s, i) => zip.file(`ppt/slides/slide${i + 1}.xml`, s));
    const n = slides.length;
    zip.file("[Content_Types].xml", `${HDR}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpeg" ContentType="image/jpeg"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>${slides.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join("")}</Types>`);
    zip.file("_rels/.rels", `${HDR}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>`);
    zip.file("ppt/presentation.xml", `${HDR}<p:presentation ${NS} saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 3}"/>`).join("")}</p:sldIdLst><p:sldSz cx="${cx}" cy="${cy}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`);
    zip.file("ppt/_rels/presentation.xml.rels", `${HDR}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>${slides.map((_, i) => `<Relationship Id="rId${i + 3}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`).join("")}</Relationships>`);
    zip.file("ppt/slideMasters/slideMaster1.xml", `${HDR}<p:sldMaster ${NS}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>${GRP}</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>`);
    zip.file("ppt/slideMasters/_rels/slideMaster1.xml.rels", `${HDR}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>`);
    zip.file("ppt/slideLayouts/slideLayout1.xml", `${HDR}<p:sldLayout ${NS} type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>${GRP}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`);
    zip.file("ppt/slideLayouts/_rels/slideLayout1.xml.rels", `${HDR}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`);
    zip.file("ppt/theme/theme1.xml", THEME);
    const blob = await zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", compression: "DEFLATE" });
    outs.push({ name: `${baseName(files[f].name)}.pptx`, blob });
    void n;
  }
  return {
    files: outs,
    note: mode === "image" ? "Each page became a full-slide image, so it looks identical but isn’t editable. Choose “Editable text” to get text boxes." : "Text is placed as editable boxes at its original positions. Images and graphics aren’t included — use “Exact look” for those.",
  };
}
