import { ImageResponse } from "next/og";
import { GUIDES, getGuide } from "@/lib/guides";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamicParams = false;

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const g = getGuide((await params).slug)!;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "#000", color: "#fff", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 32, fontWeight: 700 }}>
          <div style={{ display: "flex" }}>PlayWith</div><div style={{ display: "flex", color: "#8b8bff", marginLeft: -12 }}>Doc</div>
          <div style={{ display: "flex", marginLeft: 16, padding: "6px 16px", borderRadius: 12, background: "#1f1f24", fontSize: 24, color: "#a1a1aa" }}>GUIDE</div>
        </div>
        <div style={{ display: "flex", fontSize: 68, fontWeight: 800, lineHeight: 1.08, letterSpacing: -2, maxWidth: 1050 }}>{g.title}</div>
        <div style={{ display: "flex", fontSize: 28, color: "#4ade80" }}>Free · Private · Runs in your browser</div>
      </div>
    ),
    size,
  );
}
