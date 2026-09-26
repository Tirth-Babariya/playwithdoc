import { ImageResponse } from "next/og";
import { FORMATS } from "@/lib/formats";
import { getTool, TOOLS } from "@/lib/tools";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamicParams = false;

export function generateStaticParams() {
  return TOOLS.map((t) => ({ slug: t.slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const t = getTool((await params).slug)!;
  const from = t.flow ? t.flow[0] : t.from.length > 2 ? "ANY" : t.from.map((f) => FORMATS[f].label).join(" ");
  const to = t.flow ? t.flow[1] : t.to.length > 2 ? "ANY" : t.to.map((f) => FORMATS[f].label).join(" ");
  const chip = (s: string) => <div style={{ padding: "12px 26px", borderRadius: 18, background: "#1f1f24", border: "2px solid #3a3a44", fontSize: 44, fontWeight: 700, color: "#fff" }}>{s}</div>;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "#000", color: "#fff", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 32, fontWeight: 700 }}>PlayWithDoc</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>{chip(from)}<div style={{ fontSize: 44, color: "#71717a" }}>to</div>{chip(to)}</div>
          <div style={{ fontSize: 92, fontWeight: 800, letterSpacing: -3, lineHeight: 1.02 }}>{t.name}</div>
          <div style={{ fontSize: 34, color: "#a1a1aa", maxWidth: 950 }}>{t.short}</div>
        </div>
        <div style={{ fontSize: 28, color: "#4ade80" }}>Free · Private · Runs in your browser</div>
      </div>
    ),
    size,
  );
}
