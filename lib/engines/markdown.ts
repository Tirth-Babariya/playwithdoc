import { baseName } from "../formats";
import type { Ctx, Out, Result } from "../types";
import { mammoth, pdfBlob, uniqueName, UserError } from "./common";
import { htmlToDoc } from "./docs";

/* ───────────────────────── shared helpers ───────────────────────── */

const readText = async (f: File) => (await f.text()).replace(/^﻿/, "").replace(/\r\n?/g, "\n");

async function parseMarkdown(md: string) {
  const { marked } = await import("marked");
  return { tokens: marked.lexer(md), html: (await marked.parse(md, { gfm: true })) as string };
}

/** marked escapes text for HTML output; get the plain characters back. */
const unescape = (s: string) =>
  s.replace(/&(amp|lt|gt|quot|#39|apos);/g, (_, e) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'" }[e as string]!))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d));

const stripTags = (s: string) => unescape(s.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")).trim();

/** Parses HTML into a detached document and removes anything that could run code. */
function safeDom(html: string): Document {
  const dom = new DOMParser().parseFromString(html, "text/html");
  dom.querySelectorAll("script, iframe, object, embed, style, link, meta, noscript, form, template").forEach((n) => n.remove());
  dom.querySelectorAll<HTMLElement>("*").forEach((el) => {
    for (const a of [...el.attributes]) {
      if (/^on/i.test(a.name) || (/^(href|src|xlink:href|action)$/i.test(a.name) && /^\s*javascript:/i.test(a.value))) el.removeAttribute(a.name);
    }
  });
  return dom;
}

const b64ToBlob = (b64: string, type: string) => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
};

const sizes = (o: Ctx["opts"]) => (o.size === "letter" ? [12240, 15840] : [11906, 16838]);

/* ───────────────────────── Markdown → PDF ───────────────────────── */

export async function mdToPdf(files: File[], ctx: Ctx): Promise<Result> {
  const outs: Out[] = [];
  for (let i = 0; i < files.length; i++) {
    ctx.progress(i / files.length, `Converting ${files[i].name}`);
    const md = await readText(files[i]);
    if (!md.trim()) throw new UserError(`“${files[i].name}” is empty.`);
    const dom = safeDom((await parseMarkdown(md)).html);
    // Task-list boxes become text the PDF font can draw.
    dom.querySelectorAll('input[type="checkbox"]').forEach((c) => c.replaceWith(dom.createTextNode((c as HTMLInputElement).checked ? "[x] " : "[ ] ")));
    const bytes = await htmlToDoc(`<!doctype html><html><body>${dom.body.innerHTML}</body></html>`, ctx);
    outs.push({ name: `${baseName(files[i].name)}.pdf`, blob: pdfBlob(bytes) });
  }
  return { files: outs, note: "Headings, paragraphs, bold/italic, lists, quotes, code blocks and tables are laid out. Images and links to other pages aren’t included." };
}

/* ───────────────────────── Markdown → HTML ───────────────────────── */

const PAGE_CSS = `:root{color-scheme:light dark}body{font:16px/1.65 system-ui,-apple-system,"Segoe UI",sans-serif;max-width:780px;margin:40px auto;padding:0 20px}h1,h2,h3{line-height:1.25}pre{overflow:auto;padding:14px;border-radius:8px;background:rgba(127,127,127,.14)}code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:.92em}:not(pre)>code{padding:2px 5px;border-radius:5px;background:rgba(127,127,127,.16)}table{border-collapse:collapse;margin:1em 0}td,th{border:1px solid rgba(127,127,127,.45);padding:6px 12px}th{background:rgba(127,127,127,.12)}blockquote{margin:1em 0;padding:0 0 0 16px;border-left:4px solid rgba(127,127,127,.5);opacity:.9}img{max-width:100%}hr{border:0;border-top:1px solid rgba(127,127,127,.4)}`;

export async function mdToHtml(files: File[], ctx: Ctx): Promise<Result> {
  const outs: Out[] = [];
  const used = new Set<string>();
  for (let i = 0; i < files.length; i++) {
    ctx.progress(i / files.length, `Converting ${files[i].name}`);
    const dom = safeDom((await parseMarkdown(await readText(files[i]))).html);
    const title = (dom.querySelector("h1")?.textContent || baseName(files[i].name)).trim().replace(/[<>&]/g, "");
    const html = `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>${title}</title>\n<style>${PAGE_CSS}</style>\n</head>\n<body>\n${dom.body.innerHTML}\n</body>\n</html>\n`;
    outs.push({ name: uniqueName(`${baseName(files[i].name)}.html`, used), blob: new Blob([html], { type: "text/html;charset=utf-8" }) });
  }
  return { files: outs, note: "A single, self-contained HTML page with light and dark styling. Scripts and event handlers in the source were removed." };
}

/* ───────────────────────── Markdown → plain text ───────────────────────── */

type Tok = { type: string; text?: string; raw?: string; tokens?: Tok[]; items?: Tok[]; ordered?: boolean; start?: number | ""; depth?: number; href?: string; header?: { tokens: Tok[] }[]; rows?: { tokens: Tok[] }[][]; task?: boolean; checked?: boolean; align?: (string | null)[] };

function plainInline(tokens: Tok[] | undefined): string {
  return (tokens ?? []).map((t) => {
    switch (t.type) {
      case "text": case "escape": return t.tokens?.length ? plainInline(t.tokens) : unescape(t.text ?? "");
      case "codespan": return unescape(t.text ?? "");
      case "br": return "\n";
      case "link": { const label = plainInline(t.tokens); return label && label !== t.href ? `${label} (${t.href})` : t.href ?? label; }
      case "image": return unescape(t.text ?? "");
      case "html": return stripTags(t.raw ?? "");
      case "checkbox": return "";
      default: return t.tokens ? plainInline(t.tokens) : unescape(t.text ?? t.raw ?? "");
    }
  }).join("");
}

function plainBlocks(tokens: Tok[], indent = ""): string[] {
  const out: string[] = [];
  for (const t of tokens) {
    if (t.type === "heading") out.push(indent + plainInline(t.tokens).toUpperCase(), "");
    else if (t.type === "paragraph" || t.type === "text") out.push(...plainInline(t.tokens ?? [{ type: "text", text: t.text }]).split("\n").map((l) => indent + l), "");
    else if (t.type === "code") out.push(...(t.text ?? "").split("\n").map((l) => indent + "    " + l), "");
    else if (t.type === "blockquote") out.push(...plainBlocks(t.tokens ?? [], indent + "  "));
    else if (t.type === "hr") out.push(indent + "----------------------------------------", "");
    else if (t.type === "html") { const s = stripTags(t.raw ?? ""); if (s) out.push(indent + s, ""); }
    else if (t.type === "table") {
      out.push(indent + (t.header ?? []).map((c) => plainInline(c.tokens)).join("\t"));
      for (const r of t.rows ?? []) out.push(indent + r.map((c) => plainInline(c.tokens)).join("\t"));
      out.push("");
    } else if (t.type === "list") {
      let n = typeof t.start === "number" ? t.start : 1;
      for (const it of t.items ?? []) {
        const mark = it.task ? (it.checked ? "[x]" : "[ ]") : t.ordered ? `${n++}.` : "-";
        const inner = (it.tokens ?? []).filter((x) => x.type !== "checkbox");
        const first = inner.find((x) => x.type === "text" || x.type === "paragraph");
        out.push(`${indent}${mark} ${plainInline(first?.tokens ?? [{ type: "text", text: first?.text }])}`);
        out.push(...plainBlocks(inner.filter((x) => x !== first), indent + "  ").filter((l, i, a) => !(l === "" && i === a.length - 1)));
      }
      out.push("");
    }
  }
  return out;
}

export async function mdToTxt(files: File[], ctx: Ctx): Promise<Result> {
  const outs: Out[] = [];
  const used = new Set<string>();
  for (let i = 0; i < files.length; i++) {
    ctx.progress(i / files.length, `Converting ${files[i].name}`);
    const { tokens } = await parseMarkdown(await readText(files[i]));
    const text = plainBlocks(tokens as Tok[]).join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
    outs.push({ name: uniqueName(`${baseName(files[i].name)}.txt`, used), blob: new Blob([text], { type: "text/plain;charset=utf-8" }) });
  }
  return { files: outs, note: "Formatting marks are removed: headings are shown in capitals, lists keep their bullets, links show their address in brackets." };
}

/* ───────────────────────── Markdown → Word (.docx) ───────────────────────── */

const XE = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!)).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
const NS = `xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"`;
const HDR = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`;

type Style = { b?: boolean; i?: boolean; strike?: boolean; code?: boolean; link?: boolean };
type Doc = { links: string[]; nums: string[]; hadImage: boolean };

const run = (text: string, s: Style = {}) => {
  if (!text) return "";
  const pr = `${s.code ? '<w:rStyle w:val="CodeChar"/>' : ""}${s.link ? '<w:rStyle w:val="Hyperlink"/>' : ""}${s.b ? "<w:b/>" : ""}${s.i ? "<w:i/>" : ""}${s.strike ? "<w:strike/>" : ""}`;
  return `<w:r>${pr ? `<w:rPr>${pr}</w:rPr>` : ""}<w:t xml:space="preserve">${XE(text)}</w:t></w:r>`;
};

function inline(tokens: Tok[] | undefined, s: Style, d: Doc): string {
  return (tokens ?? []).map((t) => {
    switch (t.type) {
      case "text": return t.tokens?.length ? inline(t.tokens, s, d) : run(unescape(t.text ?? ""), s);
      case "escape": return run(unescape(t.text ?? ""), s);
      case "strong": return inline(t.tokens, { ...s, b: true }, d);
      case "em": return inline(t.tokens, { ...s, i: true }, d);
      case "del": return inline(t.tokens, { ...s, strike: true }, d);
      case "codespan": return run(unescape(t.text ?? ""), { ...s, code: true });
      case "br": return "<w:r><w:br/></w:r>";
      case "link": {
        if (!t.href) return inline(t.tokens, s, d);
        d.links.push(t.href);
        return `<w:hyperlink r:id="rIdL${d.links.length}">${inline(t.tokens, { ...s, link: true }, d)}</w:hyperlink>`;
      }
      case "image": d.hadImage = true; return run(`[Image: ${unescape(t.text || t.href || "")}]`, { ...s, i: true });
      case "html": { const x = t.raw ?? ""; return /^<br\s*\/?>$/i.test(x.trim()) ? "<w:r><w:br/></w:r>" : run(stripTags(x), s); }
      case "checkbox": return "";
      default: return t.tokens ? inline(t.tokens, s, d) : run(unescape(t.text ?? t.raw ?? ""), s);
    }
  }).join("");
}

const para = (content: string, pPr = "") => `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ""}${content}</w:p>`;

function newNum(d: Doc, ordered: boolean, level: number, start: number): number {
  if (!ordered) return 1;
  const id = 2 + d.nums.length;
  d.nums.push(`<w:num w:numId="${id}"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="${level}"><w:startOverride w:val="${start}"/></w:lvlOverride></w:num>`);
  return id;
}

function blocks(tokens: Tok[], d: Doc, quote = false): string {
  let out = "";
  for (const t of tokens) {
    switch (t.type) {
      case "heading": out += para(inline(t.tokens, {}, d), `<w:pStyle w:val="Heading${Math.min(6, t.depth ?? 1)}"/>`); break;
      case "paragraph": out += para(inline(t.tokens, {}, d), quote ? '<w:pStyle w:val="Quote"/>' : ""); break;
      case "text": out += para(inline(t.tokens ?? [{ type: "text", text: t.text }], {}, d), quote ? '<w:pStyle w:val="Quote"/>' : ""); break;
      case "code":
        for (const line of (t.text ?? "").replace(/\t/g, "    ").split("\n")) out += para(`<w:r><w:t xml:space="preserve">${XE(line || " ")}</w:t></w:r>`, '<w:pStyle w:val="Code"/>');
        out += para("", "<w:spacing w:after=\"60\"/>");
        break;
      case "blockquote": out += blocks(t.tokens ?? [], d, true); break;
      case "hr": out += para("", '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="AAAAAA"/></w:pBdr>'); break;
      case "html": { const s = stripTags(t.raw ?? ""); if (s) out += para(run(s)); break; }
      case "list": out += list(t, d, 0); break;
      case "table": out += table(t, d); break;
      default: break; // "space"
    }
  }
  return out;
}

function list(t: Tok, d: Doc, level: number): string {
  const lvl = Math.min(level, 8);
  const numId = newNum(d, !!t.ordered, lvl, typeof t.start === "number" ? t.start : 1);
  let out = "";
  for (const it of t.items ?? []) {
    let first = true;
    for (const part of (it.tokens ?? []).filter((x) => x.type !== "checkbox")) {
      if (part.type === "text" || part.type === "paragraph") {
        const prefix = first && it.task ? run(it.checked ? "[x] " : "[ ] ") : "";
        const pPr = first ? `<w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="${lvl}"/><w:numId w:val="${numId}"/></w:numPr>` : `<w:pStyle w:val="ListParagraph"/><w:ind w:left="${720 * (lvl + 1)}"/>`;
        out += para(prefix + inline(part.tokens ?? [{ type: "text", text: part.text }], {}, d), pPr);
        first = false;
      } else if (part.type === "list") out += list(part, d, level + 1);
      else out += blocks([part], d);
    }
  }
  return out;
}

function table(t: Tok, d: Doc): string {
  const cols = Math.max(1, (t.header ?? []).length);
  const w = Math.floor(9300 / cols);
  const cell = (tokens: Tok[], i: number, head: boolean) => {
    const a = t.align?.[i];
    const jc = a === "right" ? '<w:jc w:val="right"/>' : a === "center" ? '<w:jc w:val="center"/>' : "";
    return `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${head ? '<w:shd w:val="clear" w:color="auto" w:fill="EDEFF3"/>' : ""}</w:tcPr>${para(inline(tokens, { b: head }, d), `<w:spacing w:before="40" w:after="40"/>${jc}`)}</w:tc>`;
  };
  const row = (cells: { tokens: Tok[] }[], head: boolean) => `<w:tr>${head ? "<w:trPr><w:tblHeader/></w:trPr>" : ""}${Array.from({ length: cols }, (_, i) => cell(cells[i]?.tokens ?? [], i, head)).join("")}</w:tr>`;
  return `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="${w * cols}" w:type="dxa"/></w:tblPr><w:tblGrid>${Array.from({ length: cols }, () => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>${row(t.header ?? [], true)}${(t.rows ?? []).map((r) => row(r, false)).join("")}</w:tbl>${para("", '<w:spacing w:after="80"/>')}`;
}

const heading = (n: number, size: number, before: number) => `<w:style w:type="paragraph" w:styleId="Heading${n}"><w:name w:val="heading ${n}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="${before}" w:after="120"/><w:outlineLvl w:val="${n - 1}"/></w:pPr><w:rPr><w:b/><w:color w:val="1F2937"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr></w:style>`;

const STYLES = `${HDR}<w:styles ${NS}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="140" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
${[[1, 40, 360], [2, 32, 300], [3, 28, 260], [4, 24, 220], [5, 22, 200], [6, 20, 200]].map(([n, s, b]) => heading(n, s, b)).join("")}
<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:pBdr><w:left w:val="single" w:sz="18" w:space="10" w:color="B8BCC6"/></w:pBdr><w:ind w:left="480"/></w:pPr><w:rPr><w:i/><w:color w:val="4B5563"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="F3F4F6"/><w:spacing w:after="0" w:line="240" w:lineRule="auto"/><w:ind w:left="120" w:right="120"/></w:pPr><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:sz w:val="19"/><w:szCs w:val="19"/></w:rPr></w:style>
<w:style w:type="character" w:styleId="CodeChar"><w:name w:val="Code Char"/><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:shd w:val="clear" w:color="auto" w:fill="F3F4F6"/></w:rPr></w:style>
<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="2563EB"/><w:u w:val="single"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="60"/></w:pPr></w:style>
<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:basedOn w:val="TableNormal"/><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="BFC3CC"/><w:left w:val="single" w:sz="4" w:space="0" w:color="BFC3CC"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="BFC3CC"/><w:right w:val="single" w:sz="4" w:space="0" w:color="BFC3CC"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="BFC3CC"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="BFC3CC"/></w:tblBorders></w:tblPr></w:style>
</w:styles>`;

const levels = (fmt: (i: number) => [string, string]) => Array.from({ length: 9 }, (_, i) => { const [f, text] = fmt(i); return `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="${f}"/><w:lvlText w:val="${text}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${720 * (i + 1)}" w:hanging="360"/></w:pPr></w:lvl>`; }).join("");

const numbering = (extra: string[]) => `${HDR}<w:numbering ${NS}><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>${levels((i) => ["bullet", ["•", "◦", "▪"][i % 3]])}</w:abstractNum><w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>${levels((i) => [["decimal", "lowerLetter", "lowerRoman"][i % 3], `%${i + 1}.`])}</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>${extra.join("")}</w:numbering>`;

export async function mdToWord(files: File[], ctx: Ctx): Promise<Result> {
  const JSZip = (await import("jszip")).default;
  const [pw, ph] = sizes(ctx.opts);
  const margin = Math.round((+ctx.opts.margin || 56) * 20);
  const outs: Out[] = [];
  let images = false;

  for (let i = 0; i < files.length; i++) {
    ctx.progress(i / files.length, `Converting ${files[i].name}`);
    const md = await readText(files[i]);
    if (!md.trim()) throw new UserError(`“${files[i].name}” is empty.`);
    const { tokens } = await parseMarkdown(md);
    const d: Doc = { links: [], nums: [], hadImage: false };
    const body = blocks(tokens as Tok[], d);
    images ||= d.hadImage;

    const zip = new JSZip();
    zip.file("[Content_Types].xml", `${HDR}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>`);
    zip.file("_rels/.rels", `${HDR}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
    zip.file("word/_rels/document.xml.rels", `${HDR}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdN" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>${d.links.map((h, k) => `<Relationship Id="rIdL${k + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${XE(h)}" TargetMode="External"/>`).join("")}</Relationships>`);
    zip.file("word/styles.xml", STYLES);
    zip.file("word/numbering.xml", numbering(d.nums));
    zip.file("word/document.xml", `${HDR}<w:document ${NS}><w:body>${body || para("")}<w:sectPr><w:pgSz w:w="${pw}" w:h="${ph}"/><w:pgMar w:top="${margin}" w:right="${margin}" w:bottom="${margin}" w:left="${margin}" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`);
    outs.push({ name: `${baseName(files[i].name)}.docx`, blob: await zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", compression: "DEFLATE" }) });
  }
  return { files: outs, note: `Headings, bold/italic/strikethrough, lists (nested and numbered), quotes, code blocks, tables and links become real Word formatting.${images ? " Images aren’t embedded — a [Image: …] note marks where each one was." : ""}` };
}

/* ───────────────────────── HTML / Word → Markdown ───────────────────────── */

async function turndown() {
  const TurndownService = (await import("turndown")).default;
  const { gfm } = await import("turndown-plugin-gfm");
  const td = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced", bulletListMarker: "-", emDelimiter: "*", strongDelimiter: "**", linkStyle: "inlined", hr: "---" });
  td.use(gfm);
  return td;
}

const tidy = (md: string) => md.replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").trim() + "\n";

export async function htmlToMd(files: File[], ctx: Ctx): Promise<Result> {
  const td = await turndown();
  const outs: Out[] = [];
  const used = new Set<string>();
  for (let i = 0; i < files.length; i++) {
    ctx.progress(i / files.length, `Converting ${files[i].name}`);
    const dom = safeDom(await files[i].text());
    const md = tidy(td.turndown(dom.body));
    if (!md.trim()) throw new UserError(`No readable content was found in “${files[i].name}”.`);
    outs.push({ name: uniqueName(`${baseName(files[i].name)}.md`, used), blob: new Blob([md], { type: "text/markdown;charset=utf-8" }) });
  }
  return { files: outs, note: "Headings, lists, links, tables, code and emphasis are converted. Scripts and styling are dropped." };
}

export async function wordToMd(files: File[], ctx: Ctx): Promise<Result> {
  const m = await mammoth();
  const td = await turndown();
  const mode = ctx.opts.images || "folder";
  const outs: Out[] = [];
  const used = new Set<string>();
  let saved = 0;

  for (let i = 0; i < files.length; i++) {
    ctx.progress(i / files.length, `Converting ${files[i].name}`);
    const stem = baseName(files[i].name);
    let html: string;
    try { html = (await m.convertToHtml({ arrayBuffer: await files[i].arrayBuffer() })).value; }
    catch { throw new UserError(`“${files[i].name}” isn’t a valid .docx file. For old .doc files, re-save as .docx in Word first.`); }
    const dom = safeDom(html);

    const pics: Out[] = [];
    let n = 0;
    dom.querySelectorAll("img").forEach((img) => {
      const found = /^data:image\/([\w+.-]+);base64,(.+)$/i.exec(img.getAttribute("src") || "");
      n++;
      if (mode === "skip" || !found) { img.replaceWith(dom.createTextNode(mode === "skip" ? "" : img.getAttribute("alt") || "")); return; }
      img.setAttribute("alt", img.getAttribute("alt") || `Image ${n}`);
      if (mode === "folder") {
        const ext = found[1].toLowerCase().replace("jpeg", "jpg").replace("svg+xml", "svg");
        const name = uniqueName(`${stem}-image${n}.${ext}`, used);
        pics.push({ name, blob: b64ToBlob(found[2], `image/${found[1]}`) });
        img.setAttribute("src", name);
      }
    });

    const md = tidy(td.turndown(dom.body));
    if (!md.trim()) throw new UserError(`“${files[i].name}” has no readable text.`);
    outs.push({ name: uniqueName(`${stem}.md`, used), blob: new Blob([md], { type: "text/markdown;charset=utf-8" }) }, ...pics);
    saved += pics.length;
  }
  return {
    files: outs,
    note: saved
      ? `${saved} image${saved === 1 ? "" : "s"} saved next to the Markdown file — keep them in the same folder so the links keep working.`
      : mode === "embed" ? "Images are embedded inside the Markdown as base64 data, which makes the file large." : "Headings, lists, tables, links and emphasis are converted. Complex layouts and text boxes are simplified.",
  };
}
