export type Fmt =
  | "pdf" | "jpg" | "png" | "webp" | "gif" | "bmp" | "avif" | "heic" | "svg"
  | "docx" | "xlsx" | "pptx" | "txt" | "csv" | "json" | "html" | "md" | "zip";

export const FORMATS: Record<Fmt, { label: string; hue: number; mime: string }> = {
  pdf: { label: "PDF", hue: 8, mime: "application/pdf" },
  jpg: { label: "JPG", hue: 38, mime: "image/jpeg" },
  png: { label: "PNG", hue: 222, mime: "image/png" },
  webp: { label: "WEBP", hue: 152, mime: "image/webp" },
  gif: { label: "GIF", hue: 320, mime: "image/gif" },
  bmp: { label: "BMP", hue: 190, mime: "image/bmp" },
  avif: { label: "AVIF", hue: 275, mime: "image/avif" },
  heic: { label: "HEIC", hue: 340, mime: "image/heic" },
  svg: { label: "SVG", hue: 25, mime: "image/svg+xml" },
  docx: { label: "DOCX", hue: 214, mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
  xlsx: { label: "XLSX", hue: 142, mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  pptx: { label: "PPTX", hue: 30, mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation" },
  txt: { label: "TXT", hue: 240, mime: "text/plain" },
  csv: { label: "CSV", hue: 165, mime: "text/csv" },
  json: { label: "JSON", hue: 55, mime: "application/json" },
  html: { label: "HTML", hue: 15, mime: "text/html" },
  md: { label: "MD", hue: 260, mime: "text/markdown" },
  zip: { label: "ZIP", hue: 90, mime: "application/zip" },
};

const EXT: Record<string, Fmt> = {
  pdf: "pdf", jpg: "jpg", jpeg: "jpg", jpe: "jpg", png: "png", webp: "webp", gif: "gif",
  bmp: "bmp", avif: "avif", heic: "heic", heif: "heic", svg: "svg", docx: "docx",
  xlsx: "xlsx", xls: "xlsx", xlsm: "xlsx", pptx: "pptx", txt: "txt", text: "txt", log: "txt", csv: "csv",
  json: "json", html: "html", htm: "html", md: "md", markdown: "md", zip: "zip",
};

export function typeOfFile(f: { name: string; type?: string }): Fmt | null {
  const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
  if (EXT[ext]) return EXT[ext];
  const m = (f.type || "").toLowerCase();
  for (const [k, v] of Object.entries(FORMATS)) if (v.mime === m) return k as Fmt;
  return null;
}

export const IMAGE_FMTS: Fmt[] = ["jpg", "png", "webp", "gif", "bmp", "avif", "heic", "svg"];

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const u = ["KB", "MB", "GB"];
  let i = -1;
  do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
  return `${n < 10 ? n.toFixed(2) : n < 100 ? n.toFixed(1) : Math.round(n)} ${u[i]}`;
}

export function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, "");
}
