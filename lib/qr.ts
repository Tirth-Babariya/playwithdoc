/** QR helpers: build the text a QR code should contain, understand what a scanned code says, and draw QR codes (canvas + SVG). All on-device. */

/* ───────────── what goes inside ───────────── */

const wifiEsc = (s: string) => s.replace(/([\\;,:"])/g, "\\$1");

export type Wifi = { ssid: string; password: string; security: "WPA" | "WEP" | "nopass"; hidden: boolean };
export const wifiPayload = (w: Wifi) => `WIFI:T:${w.security};S:${wifiEsc(w.ssid)};${w.security === "nopass" ? "" : `P:${wifiEsc(w.password)};`}${w.hidden ? "H:true;" : ""};`;

export type Contact = { first: string; last: string; org: string; title: string; phone: string; email: string; url: string; address: string };
const vEsc = (s: string) => s.replace(/([\\,;])/g, "\\$1").replace(/\n/g, "\\n");
export function contactPayload(c: Contact): string {
  const lines = ["BEGIN:VCARD", "VERSION:3.0", `N:${vEsc(c.last)};${vEsc(c.first)};;;`, `FN:${vEsc(`${c.first} ${c.last}`.trim())}`];
  if (c.org) lines.push(`ORG:${vEsc(c.org)}`);
  if (c.title) lines.push(`TITLE:${vEsc(c.title)}`);
  if (c.phone) lines.push(`TEL:${c.phone}`);
  if (c.email) lines.push(`EMAIL:${c.email}`);
  if (c.url) lines.push(`URL:${c.url}`);
  if (c.address) lines.push(`ADR:;;${vEsc(c.address)};;;;`);
  lines.push("END:VCARD");
  return lines.join("\n");
}

export const emailPayload = (to: string, subject: string, body: string) => {
  const q = [subject && `subject=${encodeURIComponent(subject)}`, body && `body=${encodeURIComponent(body)}`].filter(Boolean).join("&");
  return `mailto:${to}${q ? `?${q}` : ""}`;
};
export const phonePayload = (n: string) => `tel:${n.replace(/[^\d+]/g, "")}`;
export const smsPayload = (n: string, msg: string) => `SMSTO:${n.replace(/[^\d+]/g, "")}:${msg}`;
export const geoPayload = (lat: string, lon: string) => `geo:${lat.trim()},${lon.trim()}`;

/* ───────────── understanding a scanned code ───────────── */

export type Parsed = { kind: "url" | "wifi" | "contact" | "email" | "phone" | "sms" | "geo" | "text"; label: string; rows: { label: string; value: string; secret?: boolean }[]; url?: string };

function splitUnescaped(s: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\" && i + 1 < s.length) { cur += s[i] + s[i + 1]; i++; }
    else if (s[i] === sep) { out.push(cur); cur = ""; }
    else cur += s[i];
  }
  out.push(cur);
  return out;
}
const unesc = (s: string) => s.replace(/\\([\\;,:"])/g, "$1");

export function parsePayload(raw: string): Parsed {
  const text = raw.trim();
  if (/^WIFI:/i.test(text)) {
    const f: Record<string, string> = {};
    for (const part of splitUnescaped(text.slice(5), ";")) { const i = part.indexOf(":"); if (i > 0) f[part.slice(0, i).toUpperCase()] = unesc(part.slice(i + 1)); }
    return { kind: "wifi", label: "Wi-Fi network", rows: [{ label: "Network name", value: f.S ?? "" }, { label: "Password", value: f.P ?? "(none)", secret: !!f.P }, { label: "Security", value: f.T || "open" }, ...(f.H === "true" ? [{ label: "Hidden network", value: "yes" }] : [])] };
  }
  if (/^BEGIN:VCARD/i.test(text)) {
    const get = (k: string) => text.split("\n").filter((l) => new RegExp(`^${k}(;[^:]*)?:`, "i").test(l)).map((l) => l.slice(l.indexOf(":") + 1).replace(/\\n/g, "\n").replace(/\\([,;\\])/g, "$1").trim()).filter(Boolean);
    const rows = [["Name", get("FN")[0]], ["Organisation", get("ORG")[0]], ["Title", get("TITLE")[0]], ["Phone", get("TEL").join(", ")], ["Email", get("EMAIL").join(", ")], ["Website", get("URL")[0]], ["Address", get("ADR")[0]?.replace(/;+/g, " ").trim()]].filter(([, v]) => v).map(([label, value]) => ({ label, value: value as string }));
    return { kind: "contact", label: "Contact card", rows };
  }
  if (/^mailto:/i.test(text)) {
    try { const u = new URL(text); return { kind: "email", label: "Email", rows: [{ label: "To", value: decodeURIComponent(u.pathname) }, ...(u.searchParams.get("subject") ? [{ label: "Subject", value: u.searchParams.get("subject")! }] : []), ...(u.searchParams.get("body") ? [{ label: "Message", value: u.searchParams.get("body")! }] : [])] }; } catch { /* fall through */ }
  }
  if (/^tel:/i.test(text)) return { kind: "phone", label: "Phone number", rows: [{ label: "Number", value: text.slice(4) }] };
  if (/^(smsto|sms):/i.test(text)) { const m = /^(?:smsto|sms):([^:]*):?([\s\S]*)$/i.exec(text); return { kind: "sms", label: "Text message", rows: [{ label: "To", value: m?.[1] ?? "" }, ...(m?.[2] ? [{ label: "Message", value: m[2] }] : [])] }; }
  if (/^geo:/i.test(text)) { const [lat, lon] = text.slice(4).split(/[,;?]/); return { kind: "geo", label: "Location", rows: [{ label: "Latitude", value: lat }, { label: "Longitude", value: lon ?? "" }], url: `https://www.openstreetmap.org/?mlat=${encodeURIComponent(lat)}&mlon=${encodeURIComponent(lon ?? "")}#map=16/${encodeURIComponent(lat)}/${encodeURIComponent(lon ?? "")}` }; }
  if (/^https?:\/\//i.test(text)) {
    try { const u = new URL(text); return { kind: "url", label: "Web link", rows: [{ label: "Website", value: u.host }, { label: "Full address", value: text }], url: u.href }; } catch { /* plain text */ }
  }
  return { kind: "text", label: "Text", rows: [{ label: "Content", value: text }] };
}

/* ───────────── drawing ───────────── */

export type QrMatrix = { size: number; get: (row: number, col: number) => boolean };
export type QrStyle = { size: number; margin: number; fg: string; bg: string; dots: "square" | "rounded" | "dots"; transparent: boolean; caption?: string; captionPos?: "top" | "bottom"; eyes?: EyeShape; frame?: FrameShape };
export type EyeShape = "square" | "rounded" | "circle";
export type FrameShape = "square" | "rounded";
export type EcLevel = "L" | "M" | "Q" | "H";

export async function makeMatrix(text: string, ec: EcLevel): Promise<QrMatrix> {
  const QRCode = await import("qrcode");
  const create = (QRCode as any).create ?? (QRCode as any).default?.create;
  const qr = create(text, { errorCorrectionLevel: ec });
  return { size: qr.modules.size, get: (r, c) => !!qr.modules.get(r, c) };
}

/** Top-left corner (in modules) of the three 7×7 position markers ("eyes"). */
const eyeOrigins = (n: number): [number, number][] => [[0, 0], [n - 7, 0], [0, n - 7]];
const SHAPE_R = 0.28;

/** Canvas path for a square / rounded / circular shape of side w. */
function shapePath(g: CanvasRenderingContext2D, x: number, y: number, w: number, kind: EyeShape) {
  if (kind === "circle") { g.moveTo(x + w, y + w / 2); g.arc(x + w / 2, y + w / 2, w / 2, 0, Math.PI * 2); }
  else if (kind === "rounded") g.roundRect(x, y, w, w, w * SHAPE_R);
  else g.rect(x, y, w, w);
}
/** The same shape as an SVG path (for evenodd rings). */
function shapeD(x: number, y: number, w: number, kind: EyeShape): string {
  if (kind === "circle") { const r = w / 2; return `M${x + r} ${y}A${r} ${r} 0 1 1 ${x + r} ${y + w}A${r} ${r} 0 1 1 ${x + r} ${y}Z`; }
  if (kind === "rounded") { const r = w * SHAPE_R; return `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + w - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + w}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + w - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`; }
  return `M${x} ${y}h${w}v${w}h${-w}z`;
}

const inFinder = (n: number, r: number, c: number) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);

/** Pixel size of the image for a requested size (whole pixels per module keep edges sharp). */
export const cellFor = (m: QrMatrix, s: QrStyle) => Math.max(2, Math.floor(s.size / (m.size + 2 * s.margin)));

const CAPTION_BAND = 0.16;
const FONT = `700 SIZEpx ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;

export function drawQr(canvas: HTMLCanvasElement, m: QrMatrix, s: QrStyle, logo?: CanvasImageSource | null, logoAspect = 1) {
  const cell = cellFor(m, s), total = (m.size + 2 * s.margin) * cell;
  const caption = s.caption?.trim() ?? "";
  const band = caption ? Math.round(total * CAPTION_BAND) : 0;
  const top = caption && s.captionPos === "top" ? band : 0;
  canvas.width = total; canvas.height = total + band;
  const g = canvas.getContext("2d")!;
  g.clearRect(0, 0, total, total + band);
  const frameR = s.frame === "rounded" ? total * 0.07 : 0;
  if (!s.transparent) { g.fillStyle = s.bg; g.beginPath(); g.roundRect(0, 0, total, total + band, frameR); g.fill(); }
  if (caption) {
    // Shrink the type until the whole name fits inside the code's width.
    let px = Math.round(band * 0.5);
    g.font = FONT.replace("SIZE", String(px));
    while (px > 8 && g.measureText(caption).width > total * 0.9) { px -= 2; g.font = FONT.replace("SIZE", String(px)); }
    g.fillStyle = s.fg; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(caption, total / 2, s.captionPos === "top" ? band / 2 : total + band / 2);
  }
  g.save();
  g.translate(0, top);
  g.fillStyle = s.fg;
  for (let r = 0; r < m.size; r++) for (let c = 0; c < m.size; c++) {
    if (!m.get(r, c)) continue;
    const x = (c + s.margin) * cell, y = (r + s.margin) * cell;
    if (inFinder(m.size, r, c)) continue;
    if (s.dots === "square") { g.fillRect(x, y, cell, cell); continue; }
    g.beginPath();
    if (s.dots === "dots") g.arc(x + cell / 2, y + cell / 2, cell * 0.46, 0, Math.PI * 2);
    else g.roundRect(x, y, cell, cell, cell * 0.38);
    g.fill();
  }
  const eyeKind = s.eyes ?? "square";
  for (const [c0, r0] of eyeOrigins(m.size)) {
    const x = (c0 + s.margin) * cell, y = (r0 + s.margin) * cell;
    g.beginPath(); shapePath(g, x, y, 7 * cell, eyeKind); shapePath(g, x + cell, y + cell, 5 * cell, eyeKind); g.fill("evenodd");
    g.beginPath(); shapePath(g, x + 2 * cell, y + 2 * cell, 3 * cell, eyeKind); g.fill();
  }
  if (logo) {
    const box = total * 0.22, pad = cell;
    const cx = total / 2, cy = total / 2;
    g.fillStyle = s.transparent ? "#ffffff" : s.bg;
    g.beginPath(); g.roundRect(cx - box / 2 - pad, cy - box / 2 - pad, box + pad * 2, box + pad * 2, cell * 1.4); g.fill();
    const w = logoAspect >= 1 ? box : box * logoAspect, h = logoAspect >= 1 ? box / logoAspect : box;
    g.drawImage(logo, cx - w / 2, cy - h / 2, w, h);
  }
  g.restore();
}

export function qrSvg(m: QrMatrix, s: QrStyle, logoDataUrl?: string, logoAspect = 1): string {
  const n = m.size, total = n + 2 * s.margin;
  const parts: string[] = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (!m.get(r, c)) continue;
    const x = c + s.margin, y = r + s.margin;
    if (inFinder(n, r, c)) continue;
    if (s.dots === "square") parts.push(`<rect x="${x}" y="${y}" width="1" height="1"/>`);
    else if (s.dots === "dots") parts.push(`<circle cx="${x + 0.5}" cy="${y + 0.5}" r="0.46"/>`);
    else parts.push(`<rect x="${x}" y="${y}" width="1" height="1" rx="0.38"/>`);
  }
  let logo = "";
  if (logoDataUrl) {
    const box = total * 0.22, pad = 1, mid = total / 2;
    const w = logoAspect >= 1 ? box : box * logoAspect, h = logoAspect >= 1 ? box / logoAspect : box;
    logo = `<rect x="${mid - box / 2 - pad}" y="${mid - box / 2 - pad}" width="${box + pad * 2}" height="${box + pad * 2}" rx="1.4" fill="${s.transparent ? "#ffffff" : s.bg}"/><image href="${logoDataUrl}" x="${mid - w / 2}" y="${mid - h / 2}" width="${w}" height="${h}"/>`;
  }
  const eyeKind = s.eyes ?? "square";
  const eyeSvg = eyeOrigins(n).map(([c0, r0]) => { const x = c0 + s.margin, y = r0 + s.margin; return `<path fill-rule="evenodd" d="${shapeD(x, y, 7, eyeKind)}${shapeD(x + 1, y + 1, 5, eyeKind)}"/><path d="${shapeD(x + 2, y + 2, 3, eyeKind)}"/>`; }).join("");
  const caption = s.caption?.trim() ?? "";
  const band = caption ? total * CAPTION_BAND : 0, top = caption && s.captionPos === "top" ? band : 0;
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const fs = band * 0.5, fit = Math.min(fs, (total * 0.9) / Math.max(1, caption.length * 0.58));
  const text = caption ? `<text x="${total / 2}" y="${(s.captionPos === "top" ? band / 2 : total + band / 2)}" fill="${s.fg}" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-weight="700" font-size="${fit}" text-anchor="middle" dominant-baseline="central">${esc(caption)}</text>` : "";
  const H = total + band;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${H}" width="${total * 10}" height="${H * 10}">${s.transparent ? "" : `<rect width="${total}" height="${H}" rx="${s.frame === "rounded" ? total * 0.07 : 0}" fill="${s.bg}"/>`}${text}<g transform="translate(0 ${top})"><g fill="${s.fg}" shape-rendering="crispEdges">${parts.join("")}</g>${eyeSvg}${logo}</g></svg>`;
}

/** WCAG-style contrast ratio between two #rrggbb colours. */
export function contrast(a: string, b: string): number {
  const lum = (h: string) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0); };
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/* ───────────── ready-made designs ───────────── */

export type QrTemplate = { id: string; name: string; style: Pick<QrStyle, "fg" | "bg" | "dots" | "eyes" | "frame" | "transparent" | "margin"> };

/** Designs to start from. Every one keeps strong contrast (dark code on a light ground) so it scans on any phone. */
export const QR_TEMPLATES: QrTemplate[] = [
  { id: "classic", name: "Classic", style: { fg: "#0a0a0a", bg: "#ffffff", dots: "square", eyes: "square", frame: "square", transparent: false, margin: 3 } },
  { id: "ink", name: "Ink", style: { fg: "#111827", bg: "#f9fafb", dots: "dots", eyes: "circle", frame: "rounded", transparent: false, margin: 3 } },
  { id: "ocean", name: "Ocean", style: { fg: "#075985", bg: "#f0f9ff", dots: "rounded", eyes: "rounded", frame: "rounded", transparent: false, margin: 3 } },
  { id: "forest", name: "Forest", style: { fg: "#166534", bg: "#f0fdf4", dots: "dots", eyes: "circle", frame: "rounded", transparent: false, margin: 3 } },
  { id: "sunset", name: "Sunset", style: { fg: "#c2410c", bg: "#fff7ed", dots: "rounded", eyes: "rounded", frame: "rounded", transparent: false, margin: 3 } },
  { id: "royal", name: "Royal", style: { fg: "#5b21b6", bg: "#f5f3ff", dots: "rounded", eyes: "circle", frame: "rounded", transparent: false, margin: 3 } },
  { id: "rose", name: "Rose", style: { fg: "#be123c", bg: "#fff1f2", dots: "dots", eyes: "rounded", frame: "rounded", transparent: false, margin: 3 } },
  { id: "cafe", name: "Café", style: { fg: "#78350f", bg: "#fef3c7", dots: "rounded", eyes: "rounded", frame: "square", transparent: false, margin: 3 } },
  { id: "business", name: "Business", style: { fg: "#1e293b", bg: "#ffffff", dots: "square", eyes: "rounded", frame: "square", transparent: false, margin: 2 } },
  { id: "sticker", name: "Sticker", style: { fg: "#0a0a0a", bg: "#ffffff", dots: "rounded", eyes: "rounded", frame: "rounded", transparent: true, margin: 2 } },
];
