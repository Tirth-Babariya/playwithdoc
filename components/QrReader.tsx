"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { takePending } from "@/lib/handoff";
import { parsePayload, type Parsed } from "@/lib/qr";
import { Icon } from "./Icon";
import { useToast } from "./Toast";

type Hit = { id: string; name: string; raw: string | null; parsed: Parsed | null };
const uid = () => Math.random().toString(36).slice(2, 9);

async function decodeImage(file: Blob): Promise<string | null> {
  const { default: jsQR } = await import("jsqr");
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return null;
  const c = document.createElement("canvas");
  const g = c.getContext("2d", { willReadFrequently: true })!;
  // Big photos often scan better when shrunk; tiny ones need enlarging. Try a few sizes.
  const long = Math.max(bmp.width, bmp.height);
  for (const k of [Math.min(1, 1600 / long), Math.min(1, 800 / long), long < 700 ? 2.5 : 0.5]) {
    const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
    c.width = w; c.height = h;
    g.fillStyle = "#fff"; g.fillRect(0, 0, w, h);
    g.drawImage(bmp, 0, 0, w, h);
    const r = jsQR(g.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "attemptBoth" });
    if (r?.data) { bmp.close(); return r.data; }
  }
  bmp.close();
  return null;
}

function Result({ hit, onRemove }: { hit: Hit; onRemove: () => void }) {
  const toast = useToast();
  const [show, setShow] = useState(false);
  const p = hit.parsed;
  const copy = (v: string) => navigator.clipboard.writeText(v).then(() => toast("Copied"), () => toast("Couldn’t copy"));
  return (
    <li className={`qr-hit${p ? "" : " miss"}`}>
      <div className="qr-hit-head">
        <span className="tool-ico"><Icon name={p ? "qr" : "x"} size={16} /></span>
        <div><b>{p ? p.label : "No QR code found"}</b><span className="muted">{hit.name}</span></div>
        <span className="grow" />
        <button className="btn btn-ghost btn-sm" onClick={onRemove} aria-label={`Remove ${hit.name}`}><Icon name="x" size={14} /></button>
      </div>
      {p ? (
        <>
          <dl className="meta-facts">
            {p.rows.map((r) => (
              <div key={r.label}><dt>{r.label}</dt><dd>{r.secret && !show ? "••••••••" : r.value}{r.secret && <button className="qr-eye" onClick={() => setShow(!show)}>{show ? "Hide" : "Show"}</button>}</dd></div>
            ))}
          </dl>
          {p.kind === "url" && <p className="meta-note"><Icon name="shield" size={15} />Only open links you trust — scanned codes can lead anywhere. The address is shown above so you can check it first.</p>}
          <div className="qr-actions">
            <button className="btn btn-secondary btn-sm" onClick={() => copy(hit.raw!)}><Icon name="extract" size={14} /> Copy all</button>
            {p.kind === "wifi" && p.rows.find((r) => r.label === "Password")?.secret && <button className="btn btn-secondary btn-sm" onClick={() => copy(p.rows.find((r) => r.label === "Password")!.value)}>Copy password</button>}
            {p.url && <a className="btn btn-secondary btn-sm" href={p.url} target="_blank" rel="noopener noreferrer">{p.kind === "geo" ? "Open map" : "Open link"} <Icon name="arrow" size={14} /></a>}
          </div>
        </>
      ) : <p className="muted">Try a sharper, closer photo with the whole code in view and a plain border around it.</p>}
    </li>
  );
}

/** QR code reader — from an image, a screenshot, a pasted picture or the live camera. Decoded on-device. */
export function QrReader() {
  const inputRef = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const raf = useRef(0);
  const [hits, setHits] = useState<Hit[]>([]);
  const [busy, setBusy] = useState(false);
  const [hover, setHover] = useState(false);
  const [cam, setCam] = useState(false);
  const [camErr, setCamErr] = useState("");

  const add = useCallback(async (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(f.name));
    if (!imgs.length) return;
    setBusy(true);
    for (const f of imgs) {
      const raw = await decodeImage(f).catch(() => null);
      setHits((h) => [{ id: uid(), name: f.name || "Pasted image", raw, parsed: raw ? parsePayload(raw) : null }, ...h]);
    }
    setBusy(false);
  }, []);

  useEffect(() => { const f = takePending(); if (f.length) add(f); }, [add]);
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => { const f = [...(e.clipboardData?.files ?? [])]; if (f.length) { e.preventDefault(); add(f); } };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [add]);

  const stopCam = useCallback(() => {
    cancelAnimationFrame(raf.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setCam(false);
  }, []);
  useEffect(() => stopCam, [stopCam]);

  const startCam = async () => {
    setCamErr("");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } }, audio: false });
      stream.current = s; setCam(true);
      await new Promise((r) => requestAnimationFrame(r));
      const v = video.current!;
      v.srcObject = s; await v.play();
      const { default: jsQR } = await import("jsqr");
      const c = document.createElement("canvas"), g = c.getContext("2d", { willReadFrequently: true })!;
      let last = 0;
      const tick = (t: number) => {
        if (!stream.current) return;
        if (t - last > 120 && v.videoWidth) {
          last = t; c.width = v.videoWidth; c.height = v.videoHeight;
          g.drawImage(v, 0, 0);
          const r = jsQR(g.getImageData(0, 0, c.width, c.height).data, c.width, c.height, { inversionAttempts: "attemptBoth" });
          if (r?.data) { setHits((h) => [{ id: uid(), name: "Camera", raw: r.data, parsed: parsePayload(r.data) }, ...h]); stopCam(); return; }
        }
        raf.current = requestAnimationFrame(tick);
      };
      raf.current = requestAnimationFrame(tick);
    } catch (e: any) {
      stopCam();
      setCamErr(e?.name === "NotAllowedError" ? "Camera permission was denied. Allow it in your browser’s address bar, or scan from an image instead." : "No camera could be opened on this device. Scan from an image instead.");
    }
  };

  return (
    <section
      className={`panel work${hover ? " hover" : ""}`}
      onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setHover(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setHover(false); }}
      onDrop={(e) => { if (e.dataTransfer.files.length) { e.preventDefault(); setHover(false); add([...e.dataTransfer.files]); } }}
    >
      <input ref={inputRef} type="file" hidden multiple accept="image/*" onChange={(e) => { add([...(e.target.files ?? [])]); e.target.value = ""; }} />
      {cam ? (
        <div className="qr-cam">
          <video ref={video} playsInline muted />
          <span className="qr-frame" aria-hidden="true" />
          <button className="btn btn-secondary" onClick={stopCam}><Icon name="x" size={15} /> Stop camera</button>
        </div>
      ) : (
        <div className="qr-drop">
          <button className="drop" onClick={() => inputRef.current?.click()}>
            <span className="drop-ico"><Icon name="qr" size={26} /></span>
            <span className="drop-title">Drop an image with a QR code</span>
            <span className="drop-sub">or <u>browse</u> · or paste a screenshot with <kbd>Ctrl</kbd><kbd>V</kbd></span>
            <span className="drop-priv"><Icon name="lock" size={12} /> Decoded on your device</span>
          </button>
          <button className="btn btn-secondary" onClick={startCam}><Icon name="camera" size={16} /> Scan with camera</button>
        </div>
      )}
      {camErr && <p className="field-err" role="alert">{camErr}</p>}
      {busy && <p className="muted"><span className="spin" /> Reading…</p>}
      {hits.length > 0 && <ul className="qr-hits">{hits.map((h) => <Result key={h.id} hit={h} onRemove={() => setHits((x) => x.filter((y) => y.id !== h.id))} />)}</ul>}
    </section>
  );
}
