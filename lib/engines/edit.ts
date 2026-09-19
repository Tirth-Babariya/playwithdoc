import type { Ann } from "../annotations";
import { baseName } from "../formats";
import type { Ctx, Result } from "../types";
import { canvasBlob, loadPdfLib, makeCanvas, openPdfJs, pdfBlob, UserError } from "./common";

const hex = (c: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(c) ?? ["", "000000"];
  const n = parseInt(m[1], 16);
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255] as const;
};

function dataUrlBytes(src: string): { bytes: Uint8Array; png: boolean } {
  const [head, b64] = src.split(",");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, png: /png/i.test(head) };
}

/** Applies sign / annotate / redact overlays to a PDF. Redacted (and rotated) pages are flattened to images so nothing hidden survives. */
export async function editPdf(files: File[], ctx: Ctx): Promise<Result> {
  const anns: Ann[] = ctx.opts.annotations ?? [];
  if (!anns.length) throw new UserError("Add something to the PDF first — text, a signature, a highlight…");
  const { StandardFonts, rgb, LineCapStyle } = await import("pdf-lib");
  const doc = await loadPdfLib(files[0]);
  const count = doc.getPageCount();

  // Pages that must be flattened: anything redacted, or rotated pages we place things on.
  const flatten = new Set<number>();
  for (const a of anns) {
    if (a.page >= count) continue;
    if (a.kind === "rect" && a.redact) flatten.add(a.page);
    else if (doc.getPage(a.page).getRotation().angle % 360 !== 0) flatten.add(a.page);
  }
  if (flatten.size) {
    const pdf = await openPdfJs(files[0]);
    let n = 0;
    for (const pi of [...flatten].sort((a, b) => a - b)) {
      ctx.progress(0.1 + (0.5 * n++) / flatten.size, `Flattening page ${pi + 1}`);
      const page = await pdf.getPage(pi + 1);
      const pt = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: 200 / 72 });
      const c = makeCanvas(vp.width, vp.height);
      const g = c.getContext("2d")!;
      g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: g, viewport: vp }).promise;
      g.fillStyle = "#000";
      for (const a of anns) if (a.page === pi && a.kind === "rect" && a.redact) g.fillRect(a.x * c.width, a.y * c.height, a.w * c.width, a.h * c.height);
      const jpg = await canvasBlob(c, "image/jpeg", 0.9);
      const img = await doc.embedJpg(new Uint8Array(await jpg.arrayBuffer()));
      doc.removePage(pi);
      const np = doc.insertPage(pi, [pt.width, pt.height]);
      np.drawImage(img, { x: 0, y: 0, width: pt.width, height: pt.height });
      c.width = c.height = 0;
      page.cleanup();
    }
    await pdf.destroy();
  }

  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  for (let i = 0; i < anns.length; i++) {
    const a = anns[i];
    if (a.page >= count) continue;
    ctx.progress(0.6 + (0.4 * i) / anns.length, "Applying changes");
    const page = doc.getPage(a.page);
    const { width: W, height: H } = page.getSize();
    const x = a.x * W, w = a.w * W, h = a.h * H, yb = H - a.y * H - h;

    if (a.kind === "rect") {
      const [r, g, b] = hex(a.color);
      page.drawRectangle(a.style === "fill"
        ? { x, y: yb, width: w, height: h, color: rgb(r, g, b), opacity: a.opacity }
        : { x, y: yb, width: w, height: h, borderColor: rgb(r, g, b), borderWidth: 1.6, borderOpacity: a.opacity });
    } else if (a.kind === "text") {
      const font = a.bold ? bold : reg;
      const size = a.size * H;
      const [r, g, b] = hex(a.color);
      const clean = (s: string) => [...s].map((ch) => { try { font.encodeText(ch); return ch; } catch { return "?"; } }).join("");
      const lines: string[] = [];
      for (const para of a.text.split("\n")) {
        let cur = "";
        for (const word of para.split(/(\s+)/)) {
          const trial = cur + word;
          if (cur && font.widthOfTextAtSize(clean(trial).trimEnd(), size) > Math.max(w, size * 2)) { lines.push(cur.trimEnd()); cur = word.trimStart(); } else cur = trial;
        }
        lines.push(cur.trimEnd());
      }
      lines.forEach((ln, li) => { if (ln) page.drawText(clean(ln), { x, y: H - a.y * H - size * (0.92 + li * 1.2), size, font, color: rgb(r, g, b) }); });
    } else if (a.kind === "image") {
      const { bytes, png } = dataUrlBytes(a.src);
      const img = png ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
      page.drawImage(img, { x, y: yb, width: w, height: h });
    } else if (a.kind === "ink" && a.points.length > 1) {
      const [r, g, b] = hex(a.color);
      const d = a.points.map(([px, py], k) => `${k ? "L" : "M"} ${(px * W).toFixed(2)} ${(py * H).toFixed(2)}`).join(" ");
      page.drawSvgPath(d, { x: 0, y: H, borderColor: rgb(r, g, b), borderWidth: a.width * H, borderLineCap: LineCapStyle.Round });
    }
  }

  const bytes = await doc.save({ useObjectStreams: true });
  const redacted = flatten.size > 0 && anns.some((a) => a.kind === "rect" && a.redact);
  return {
    files: [{ name: `${baseName(files[0].name)}-${redacted ? "redacted" : ctx.opts.tag || "edited"}.pdf`, blob: pdfBlob(bytes) }],
    note: redacted ? "Redacted pages were flattened to images, so the covered text is permanently removed from the file." : undefined,
  };
}
