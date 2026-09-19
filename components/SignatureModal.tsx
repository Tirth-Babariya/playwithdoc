"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

const FONTS = [
  '"Snell Roundhand", "Segoe Script", "Brush Script MT", cursive',
  '"Lucida Handwriting", "Apple Chancery", cursive',
  '"Bradley Hand", "Segoe Print", "Comic Sans MS", cursive',
];
const INKS = ["#111111", "#1d4ed8", "#0f172a"];

/** Crop transparent margins so the signature sits tightly when placed. */
function trim(c: HTMLCanvasElement): string {
  const g = c.getContext("2d")!;
  const { data, width, height } = g.getImageData(0, 0, c.width, c.height);
  let x0 = width, y0 = height, x1 = 0, y1 = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (data[(y * width + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 <= x0 || y1 <= y0) return "";
  const pad = 8;
  const w = x1 - x0 + pad * 2, h = y1 - y0 + pad * 2;
  const out = document.createElement("canvas");
  out.width = w; out.height = h;
  out.getContext("2d")!.drawImage(c, x0 - pad, y0 - pad, w, h, 0, 0, w, h);
  return out.toDataURL("image/png");
}

const load = (): string[] => { try { return JSON.parse(localStorage.getItem("af-sigs") || "[]"); } catch { return []; } };
const save = (list: string[]) => { try { localStorage.setItem("af-sigs", JSON.stringify(list.slice(0, 4))); } catch { /* storage unavailable */ } };

export function SignatureModal({ onDone, onClose }: { onDone: (dataUrl: string) => void; onClose: () => void }) {
  const [tab, setTab] = useState<"draw" | "type" | "upload">("draw");
  const [ink, setInk] = useState(INKS[0]);
  const [name, setName] = useState("");
  const [font, setFont] = useState(0);
  const [remember, setRemember] = useState(true);
  const [saved, setSaved] = useState<string[]>([]);
  const [hasInk, setHasInk] = useState(false);
  const [uploaded, setUploaded] = useState("");
  const pad = useRef<HTMLCanvasElement>(null);
  const last = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => { setSaved(load()); }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  const pos = (e: React.PointerEvent) => {
    const c = pad.current!, r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  };
  const down = (e: React.PointerEvent) => { pad.current!.setPointerCapture(e.pointerId); last.current = pos(e); setHasInk(true); };
  const move = (e: React.PointerEvent) => {
    if (!last.current) return;
    const g = pad.current!.getContext("2d")!, p = pos(e), l = last.current;
    g.strokeStyle = ink; g.lineWidth = 5; g.lineCap = "round"; g.lineJoin = "round";
    g.beginPath(); g.moveTo(l.x, l.y); g.quadraticCurveTo(l.x, l.y, (l.x + p.x) / 2, (l.y + p.y) / 2); g.stroke();
    last.current = p;
  };
  const clear = () => { const c = pad.current; if (c) c.getContext("2d")!.clearRect(0, 0, c.width, c.height); setHasInk(false); };

  const typed = () => {
    const c = document.createElement("canvas");
    c.width = 1400; c.height = 300;
    const g = c.getContext("2d")!;
    g.fillStyle = ink; g.font = `120px ${FONTS[font]}`; g.textBaseline = "middle";
    g.fillText(name, 40, 150);
    return trim(c);
  };

  const finish = () => {
    let url = "";
    if (tab === "draw" && pad.current) url = trim(pad.current);
    else if (tab === "type") url = typed();
    else url = uploaded;
    if (!url) return;
    if (remember && tab !== "upload") save([url, ...saved.filter((s) => s !== url)]);
    onDone(url);
  };

  const onUpload = (f: File | undefined) => {
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      const im = new Image();
      im.onload = () => {
        const c = document.createElement("canvas");
        c.width = im.naturalWidth; c.height = im.naturalHeight;
        const g = c.getContext("2d")!;
        g.drawImage(im, 0, 0);
        // Turn near-white paper into transparency so only the ink remains.
        const d = g.getImageData(0, 0, c.width, c.height);
        for (let i = 0; i < d.data.length; i += 4) { const lum = (d.data[i] + d.data[i + 1] + d.data[i + 2]) / 3; if (lum > 225) d.data[i + 3] = 0; else if (lum > 170) d.data[i + 3] = Math.round((225 - lum) * 4.6); }
        g.putImageData(d, 0, 0);
        setUploaded(trim(c));
      };
      im.src = String(r.result);
    };
    r.readAsDataURL(f);
  };

  const ready = tab === "draw" ? hasInk : tab === "type" ? !!name.trim() : !!uploaded;

  return (
    <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Create your signature">
        <div className="modal-head">
          <h3>Your signature</h3>
          <button className="rm" onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button>
        </div>
        <div className="seg" role="tablist">
          {(["draw", "type", "upload"] as const).map((t) => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{t === "draw" ? "Draw" : t === "type" ? "Type" : "Upload"}</button>)}
        </div>

        {tab === "draw" && (
          <div className="sig-pad">
            <canvas ref={pad} width={1000} height={320} onPointerDown={down} onPointerMove={move} onPointerUp={() => (last.current = null)} onPointerCancel={() => (last.current = null)} />
            {!hasInk && <span className="sig-ph">Sign here with your mouse, finger or stylus</span>}
            <button className="link-btn" onClick={clear}>Clear</button>
          </div>
        )}
        {tab === "type" && (
          <div className="sig-type">
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Type your name" maxLength={40} />
            <div className="sig-fonts">
              {FONTS.map((f, i) => <button key={i} className={font === i ? "on" : ""} style={{ fontFamily: f, color: ink }} onClick={() => setFont(i)}>{name || "Your name"}</button>)}
            </div>
          </div>
        )}
        {tab === "upload" && (
          <label className="sig-up">
            {uploaded ? <img src={uploaded} alt="Your signature" /> : <><Icon name="upload" size={22} /><span>Choose a photo of your signature on white paper</span></>}
            <input type="file" accept="image/*" hidden onChange={(e) => onUpload(e.target.files?.[0])} />
          </label>
        )}

        {tab !== "upload" && (
          <div className="sig-inks">
            {INKS.map((c) => <button key={c} className={ink === c ? "on" : ""} style={{ background: c }} onClick={() => setInk(c)} aria-label={`Ink ${c}`} />)}
          </div>
        )}

        {saved.length > 0 && (
          <div className="sig-saved">
            <span>Saved on this device</span>
            <div>{saved.map((s, i) => (
              <span key={i} className="sig-chip"><button onClick={() => onDone(s)}><img src={s} alt="Saved signature" /></button><button className="x" onClick={() => { const n = saved.filter((_, k) => k !== i); setSaved(n); save(n); }} aria-label="Forget this signature"><Icon name="x" size={11} /></button></span>
            ))}</div>
          </div>
        )}

        <div className="modal-foot">
          <label className="chk"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Remember on this device</label>
          <span className="grow" />
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={finish} disabled={!ready}>Use signature</button>
        </div>
      </div>
    </div>
  );
}
