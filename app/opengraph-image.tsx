import { ImageResponse } from "next/og";

export const alt = "PlayWithDoc — convert anything to anything. Privately.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "#000", color: "#fff", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: "#fff", color: "#000", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34, fontWeight: 800 }}>P</div>
          <div style={{ fontSize: 38, fontWeight: 700 }}>PlayWithDoc</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 84, fontWeight: 800, lineHeight: 1.02, letterSpacing: -3 }}>Every file format,</div>
          <div style={{ fontSize: 84, fontWeight: 800, lineHeight: 1.02, letterSpacing: -3, color: "#8b8bff" }}>one keystroke away.</div>
          <div style={{ fontSize: 32, color: "#a1a1aa", marginTop: 12 }}>Free PDF & image tools · No sign-up · Files never leave your device</div>
        </div>
      </div>
    ),
    size,
  );
}
