import type { Opts } from "./types";

/** Ready-made photo / signature sizes for online forms. Pixel sizes assume 300 dpi where a physical size is given. */
export type Preset = {
  id: string;
  label: string;
  short: string;
  w: number;
  h: number;
  maxKb: number;
  /** On-screen framing guide in the editor. */
  guide: "face" | "signature" | "none";
  /** Whiten the paper and darken the ink by default. */
  clean?: boolean;
};

export const PRESETS: Preset[] = [
  { id: "passport", label: "Passport photo · 35×45 mm", short: "35×45 mm (413×531 px @ 300 dpi)", w: 413, h: 531, maxKb: 200, guide: "face" },
  { id: "us-visa", label: "US passport / visa · 2×2 in", short: "2×2 in (600×600 px @ 300 dpi)", w: 600, h: 600, maxKb: 240, guide: "face" },
  { id: "id-small", label: "Small ID / exam photo · 200×230", short: "200×230 px", w: 200, h: 230, maxKb: 50, guide: "face" },
  { id: "profile", label: "Profile picture · 400×400", short: "400×400 px", w: 400, h: 400, maxKb: 100, guide: "face" },
  { id: "signature", label: "Signature · 140×60", short: "140×60 px", w: 140, h: 60, maxKb: 20, guide: "signature", clean: true },
  { id: "signature-wide", label: "Signature · 300×100", short: "300×100 px", w: 300, h: 100, maxKb: 30, guide: "signature", clean: true },
  { id: "custom", label: "Custom size…", short: "your own size", w: 600, h: 600, maxKb: 100, guide: "none" },
];

export const presetById = (id: string) => PRESETS.find((p) => p.id === id) ?? PRESETS[0];

export type Dims = { w: number; h: number; maxKb: number; guide: Preset["guide"]; clean: boolean; label: string; short: string };

/** Resolves the target size from the current options (custom sizes come from the w/h/maxKb fields). */
export function presetDims(o: Opts): Dims {
  const p = presetById(String(o.preset ?? "passport"));
  if (p.id === "custom") {
    const w = Math.min(4000, Math.max(20, Math.round(+o.w || p.w)));
    const h = Math.min(4000, Math.max(20, Math.round(+o.h || p.h)));
    return { w, h, maxKb: Math.max(0, Math.round(+o.maxKb || 0)), guide: "none", clean: false, label: `${w}×${h}`, short: `${w}×${h} px` };
  }
  return { w: p.w, h: p.h, maxKb: p.maxKb, guide: p.guide, clean: !!p.clean, label: p.label, short: p.short };
}

/** Where the image sits inside the frame. zoom 1 = fills the frame; dx/dy = offset as a fraction of the frame. */
export type Crop = { zoom: number; dx: number; dy: number };
export const DEFAULT_CROP: Crop = { zoom: 1, dx: 0, dy: 0 };
