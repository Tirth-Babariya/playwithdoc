/** Annotations placed in the visual PDF editor. All geometry is a fraction of the page (0–1), y measured from the top. */
type Base = { id: string; page: number; x: number; y: number; w: number; h: number };

export type TextAnn = Base & { kind: "text"; text: string; size: number; color: string; bold?: boolean };
export type RectAnn = Base & { kind: "rect"; color: string; opacity: number; style: "fill" | "outline"; redact?: boolean };
export type ImageAnn = Base & { kind: "image"; src: string };
export type InkAnn = Base & { kind: "ink"; points: [number, number][]; color: string; width: number };
export type Ann = TextAnn | RectAnn | ImageAnn | InkAnn;
