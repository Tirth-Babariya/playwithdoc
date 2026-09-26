import type { Fmt } from "./formats";

export type Out = { name: string; blob: Blob };

export type Result = {
  files: Out[];
  /** Human readable remark shown under the result (e.g. "Already optimized"). */
  note?: string;
  /** Total input vs output size, used for the "-62%" badge. */
  before?: number;
  after?: number;
};

export type Opts = Record<string, any>;

export type Ctx = {
  opts: Opts;
  progress: (fraction: number, label?: string) => void;
};

export type Runner = (files: File[], ctx: Ctx) => Promise<Result>;

type Base = { key: string; label: string; help?: string; showWhen?: (o: Opts) => boolean };
export type OptionSpec =
  | (Base & { type: "select"; options: { value: string; label: string; hint?: string }[]; default: string })
  | (Base & { type: "range"; min: number; max: number; step: number; default: number; format?: (v: number) => string })
  | (Base & { type: "text"; placeholder?: string; default?: string; secret?: boolean })
  | (Base & { type: "number"; min?: number; max?: number; default: number; suffix?: string });

export type Category = "organize" | "optimize" | "to-pdf" | "from-pdf" | "edit" | "security" | "image" | "data" | "markdown" | "utility";

export type Tool = {
  slug: string;
  name: string;
  /** One-liner for cards. */
  short: string;
  /** Longer description for the tool page + meta description. */
  desc: string;
  cat: Category;
  from: Fmt[];
  to: Fmt[];
  accept: string;
  multi: boolean;
  /** Show reorder controls for the file list. */
  sort?: boolean;
  /** Use the visual page organizer instead of a plain file list. */
  pages?: "organize" | "remove" | "extract";
  /** Use the visual PDF editor (sign / annotate / redact). */
  editor?: "sign" | "edit" | "redact";
  /** Show a live output-size estimate for the first file. */
  estimate?: boolean;
  /** Photo/signature frame editor (drag to position, zoom) — output size comes from a preset. */
  crop?: boolean;
  /** A fixed preset id (see lib/presets.ts) for one-click photo/signature tools. */
  presetId?: string;
  /** Fill-in-the-fields form UI for fillable PDFs. */
  form?: boolean;
  /** Maximum number of files the tool accepts (e.g. exactly 2 for Compare). */
  max?: number;
  /** Label the file cards A, B… instead of 1, 2… */
  abLabels?: boolean;
  /** Tool has its own screen instead of the file-in / file-out workspace. */
  custom?: "qr-maker" | "qr-reader" | "metadata";
  /** Overrides the format chips on cards ("Text → QR"). */
  flow?: [string, string];
  keywords: string[];
  featured?: boolean;
  camera?: boolean;
  /** Start converting as soon as files are added (no options to think about). */
  autorun?: boolean;
  options?: OptionSpec[];
  load: () => Promise<Runner>;
};
