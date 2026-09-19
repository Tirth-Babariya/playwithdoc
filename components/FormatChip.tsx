import type { CSSProperties } from "react";
import { FORMATS, type Fmt } from "@/lib/formats";
import { Icon } from "./Icon";

export function FormatChip({ f, size = "md" }: { f: Fmt; size?: "sm" | "md" | "lg" }) {
  const fm = FORMATS[f];
  return (
    <span className={`chip chip-${size}`} style={{ "--h": fm.hue } as CSSProperties}>
      {fm.label}
    </span>
  );
}

export function FlowChips({ from, to, size = "md" }: { from: Fmt[]; to: Fmt[]; size?: "sm" | "md" | "lg" }) {
  const many = from.length > 2;
  return (
    <span className="flow">
      {many ? <span className="chip chip-sm chip-any">ANY IMAGE</span> : from.map((f) => <FormatChip key={f} f={f} size={size} />)}
      <Icon name="arrow" size={size === "lg" ? 16 : 12} className="flow-arrow" />
      {to.length > 2 ? <span className="chip chip-sm chip-any">ANY</span> : to.map((f) => <FormatChip key={f} f={f} size={size} />)}
    </span>
  );
}
