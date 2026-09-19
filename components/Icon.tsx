import type { SVGProps } from "react";

const P: Record<string, React.ReactNode> = {
  cursor: <path d="m5 3 14 7-6 2-2 6L5 3Z" />,
  text: <path d="M5 6V4h14v2M12 4v16M9 20h6" />,
  highlight: <><path d="m9 11 6 6-4 1-3 3H5v-3l3-3 1-4Z" /><path d="m14 6 4 4M13 7l3-3 4 4-3 3" /></>,
  boxline: <rect x="4" y="5" width="16" height="14" rx="2" strokeDasharray="3 2.5" />,
  pen: <><path d="M4 20c2-6 4-9 7-9s0 6 4 5 3-6 5-6" /></>,
  redact: <><rect x="3" y="9" width="18" height="6" rx="1" fill="currentColor" /><path d="M3 5h10M3 19h14" /></>,
  signature: <><path d="M3 17c2-1 4-6 5-9 .5-1.5 2-1 1.5.5C8.5 12 7 17 9.5 15.5S12 12 13 13c1 1 0 3 2 3s3-2 6-1" /><path d="M3 21h18" /></>,
  undo: <path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" />,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  fullscreen: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />,
  edit: <path d="M4 20h4L19 9l-4-4L4 16v4ZM14 6l4 4" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />,
  monitor: <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></>,
  upload: <><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></>,
  download: <><path d="M12 4v12M7 11l5 5 5-5" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></>,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  back: <path d="M19 12H5M11 6l-6 6 6 6" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  plus: <path d="M12 5v14M5 12h14" />,
  up: <path d="m6 15 6-6 6 6" />,
  down: <path d="m6 9 6 6 6-6" />,
  grip: <><circle cx="9" cy="6" r="1" /><circle cx="15" cy="6" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="9" cy="18" r="1" /><circle cx="15" cy="18" r="1" /></>,
  lock: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  shield: <><path d="M12 3 4 6v6c0 4.5 3.2 8 8 9 4.8-1 8-4.5 8-9V6l-8-3Z" /><path d="m9 12 2 2 4-4" /></>,
  zap: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />,
  wifioff: <><path d="M2 2l20 20M8.5 16.4a5 5 0 0 1 7 0M2 8.8a15 15 0 0 1 4.2-2.7M22 8.8A15 15 0 0 0 10.8 5M5 12.9a10 10 0 0 1 5-2.7M19 12.9a10 10 0 0 0-2.4-1.9" /><circle cx="12" cy="20" r=".8" /></>,
  command: <path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6Z" />,
  layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 13 9 5 9-5" /></>,
  scissors: <><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12" /></>,
  minimize: <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" />,
  rotate: <><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v5h-5" /></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  trash: <><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M9 7V4h6v3" /></>,
  extract: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" /><path d="M14 3v5h5M9 14h6M12 11v6" /></>,
  wrench: <path d="M14.7 6.3a4 4 0 0 0-5.4 5.1L3 17.7 6.3 21l6.3-6.3a4 4 0 0 0 5.1-5.4l-2.6 2.6-2.4-.6-.6-2.4 2.6-2.6Z" />,
  camera: <><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" /><circle cx="12" cy="13" r="3.5" /></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="m21 16-5-5-9 9" /></>,
  file: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></>,
  table: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M3 15h18M9 4v16" /></>,
  code: <path d="m8 8-5 4 5 4M16 8l5 4-5 4M14 5l-4 14" />,
  hash: <path d="M5 9h14M5 15h14M10 4 8 20M16 4l-2 16" />,
  drop: <path d="M12 3s6 6.2 6 10.5A6 6 0 0 1 6 13.5C6 9.2 12 3 12 3Z" />,
  crop: <path d="M6 2v14a2 2 0 0 0 2 2h14M2 6h14a2 2 0 0 1 2 2v14" />,
  resize: <><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></>,
  swap: <path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" />,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1" /></>,
  sparkle: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />,
  infinity: <path d="M18.2 8.2c-3.2 0-4.7 3.8-6.2 3.8S9 8.2 5.8 8.2a3.8 3.8 0 0 0 0 7.6c3.2 0 4.7-3.8 6.2-3.8s3 3.8 6.2 3.8a3.8 3.8 0 0 0 0-7.6Z" />,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  minus: <path d="M5 12h14" />,
  cpu: <><rect x="6" y="6" width="12" height="12" rx="2" /><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" /></>,
};

export function Icon({ name, size = 18, ...rest }: { name: string; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {P[name] ?? P.file}
    </svg>
  );
}

const SLUG_ICON: Record<string, string> = {
  "merge-pdf": "layers", "split-pdf": "scissors", "remove-pages": "trash", "extract-pages": "extract", "organize-pdf": "grid",
  "scan-to-pdf": "camera", "compress-pdf": "minimize", "repair-pdf": "wrench", "word-to-pdf": "file", "excel-to-pdf": "table",
  "html-to-pdf": "code", "txt-to-pdf": "file", "pdf-to-word": "file", "pdf-to-text": "file", "pdf-to-markdown": "hash",
  "rotate-pdf": "rotate", "add-page-numbers": "hash", "add-watermark": "drop", "crop-pdf": "crop",
  "ocr-pdf": "sparkle", "ocr-to-text": "sparkle", "protect-pdf": "lock", "unlock-pdf": "lock", "sign-pdf": "signature", "edit-pdf": "edit", "redact-pdf": "redact", "pptx-to-pdf": "file", "pdf-to-pptx": "file",
  "compress-image": "minimize", "resize-image": "resize", "csv-to-json": "code", "json-to-csv": "table", "excel-to-csv": "table", "excel-to-json": "code",
};

export function toolIcon(slug: string, cat: string): string {
  if (SLUG_ICON[slug]) return SLUG_ICON[slug];
  if (cat === "image" || slug.includes("jpg") || slug.includes("png") || slug.includes("webp") || slug.includes("heic") || slug.startsWith("image")) return "image";
  return "file";
}

export function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="var(--fg)" />
      <path d="M9 12.5h10.5M16.5 9l3.5 3.5-3.5 3.5" fill="none" stroke="var(--bg)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M23 19.5H12.5M15.5 16l-3.5 3.5 3.5 3.5" fill="none" stroke="var(--bg)" strokeOpacity=".55" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
