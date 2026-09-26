"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { contactPayload, contrast, emailPayload, geoPayload, makeMatrix, phonePayload, qrSvg, smsPayload, wifiPayload, drawQr, QR_TEMPLATES, type QrTemplate, type EcLevel, type EyeShape, type FrameShape, type QrMatrix, type QrStyle, type Wifi, type Contact } from "@/lib/qr";
import { Icon } from "./Icon";
import { useToast } from "./Toast";

type Kind = "url" | "text" | "wifi" | "contact" | "email" | "phone" | "sms" | "geo";
const KINDS: { id: Kind; label: string }[] = [
  { id: "url", label: "Link" }, { id: "text", label: "Text" }, { id: "wifi", label: "Wi-Fi" }, { id: "contact", label: "Contact" },
  { id: "email", label: "Email" }, { id: "phone", label: "Phone" }, { id: "sms", label: "SMS" }, { id: "geo", label: "Location" },
];

const download = (blob: Blob, name: string) => { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };

function TextField({ label, value, onChange, ...rest }: { label: string; value: string; onChange: (v: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value">) {
  const id = `qr-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return <div className="field"><label htmlFor={id} className="field-label">{label}</label><input id={id} type="text" value={value} spellCheck={false} onChange={(e) => onChange(e.target.value)} {...rest} /></div>;
}

/** A tiny live preview of a design, drawn with the same code that draws the real thing. */
function Thumb({ tpl, sample }: { tpl: QrTemplate; sample: QrMatrix | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { if (sample && ref.current) drawQr(ref.current, sample, { ...tpl.style, size: 132 }); }, [tpl, sample]);
  return <canvas ref={ref} aria-hidden="true" />;
}

/** QR code maker — links, Wi-Fi, contacts and more, styled, downloaded as PNG or SVG. Nothing leaves the device. */
export function QrMaker() {
  const toast = useToast();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [kind, setKind] = useState<Kind>("url");
  const [url, setUrl] = useState("https://");
  const [text, setText] = useState("");
  const [wifi, setWifi] = useState<Wifi>({ ssid: "", password: "", security: "WPA", hidden: false });
  const [contact, setContact] = useState<Contact>({ first: "", last: "", org: "", title: "", phone: "", email: "", url: "", address: "" });
  const [mail, setMail] = useState({ to: "", subject: "", body: "" });
  const [phone, setPhone] = useState("");
  const [sms, setSms] = useState({ to: "", msg: "" });
  const [geo, setGeo] = useState({ lat: "", lon: "" });

  const [fg, setFg] = useState("#0a0a0a");
  const [bg, setBg] = useState("#ffffff");
  const [dots, setDots] = useState<QrStyle["dots"]>("square");
  const [transparent, setTransparent] = useState(false);
  const [ec, setEc] = useState<EcLevel>("M");
  const [size, setSize] = useState(1024);
  const [margin, setMargin] = useState(3);
  const [eyes, setEyes] = useState<EyeShape>("square");
  const [frame, setFrame] = useState<FrameShape>("square");
  const [caption, setCaption] = useState("");
  const [captionPos, setCaptionPos] = useState<"top" | "bottom">("bottom");
  const [logo, setLogo] = useState<{ img: HTMLImageElement; url: string; aspect: number } | null>(null);
  const [matrix, setMatrix] = useState<QrMatrix | null>(null);
  const [tooLong, setTooLong] = useState(false);
  const [sample, setSample] = useState<QrMatrix | null>(null);
  useEffect(() => { makeMatrix("https://playwithdoc.app", "M").then(setSample).catch(() => {}); }, []);

  const payload = useMemo(() => {
    switch (kind) {
      case "url": return url.trim() === "https://" ? "" : url.trim();
      case "text": return text;
      case "wifi": return wifi.ssid ? wifiPayload(wifi) : "";
      case "contact": return contact.first || contact.last || contact.org ? contactPayload(contact) : "";
      case "email": return mail.to ? emailPayload(mail.to.trim(), mail.subject, mail.body) : "";
      case "phone": return phone.trim() ? phonePayload(phone) : "";
      case "sms": return sms.to.trim() ? smsPayload(sms.to, sms.msg) : "";
      case "geo": return geo.lat.trim() && geo.lon.trim() ? geoPayload(geo.lat, geo.lon) : "";
    }
  }, [kind, url, text, wifi, contact, mail, phone, sms, geo]);

  // Logos cover the middle of the code, so force the highest error correction while one is set.
  const level: EcLevel = logo ? "H" : ec;
  const style: QrStyle = { size, margin, fg, bg, dots, transparent, caption, captionPos, eyes, frame };

  useEffect(() => {
    let live = true;
    setTooLong(false);
    if (!payload) { setMatrix(null); return; }
    makeMatrix(payload, level).then((m) => live && setMatrix(m)).catch(() => { if (live) { setMatrix(null); setTooLong(true); } });
    return () => { live = false; };
  }, [payload, level]);

  useEffect(() => { if (matrix && canvas.current) drawQr(canvas.current, matrix, style, logo?.img, logo?.aspect); }, [matrix, fg, bg, dots, transparent, size, margin, logo, caption, captionPos, eyes, frame]); // eslint-disable-line react-hooks/exhaustive-deps

  const apply = (t: QrTemplate) => { const v = t.style; setFg(v.fg); setBg(v.bg); setDots(v.dots); setEyes(v.eyes ?? "square"); setFrame(v.frame ?? "square"); setTransparent(v.transparent); setMargin(v.margin); };
  const isTpl = (t: QrTemplate) => { const v = t.style; return v.fg === fg && v.bg === bg && v.dots === dots && (v.eyes ?? "square") === eyes && (v.frame ?? "square") === frame && v.transparent === transparent && v.margin === margin; };
  const ratio = contrast(fg, bg);
  const weak = !transparent && ratio < 3;
  const inverted = !transparent && contrast(fg, "#000000") > contrast(bg, "#000000") && ratio >= 3;

  const pickLogo = (f?: File) => {
    if (!f) return;
    const u = URL.createObjectURL(f), img = new Image();
    img.onload = () => setLogo((old) => { if (old) URL.revokeObjectURL(old.url); return { img, url: u, aspect: img.naturalWidth / img.naturalHeight }; });
    img.onerror = () => { URL.revokeObjectURL(u); toast("That image couldn’t be read."); };
    img.src = u;
  };

  const png = () => canvas.current?.toBlob((b) => b && download(b, "qr-code.png"), "image/png");
  const svg = async () => {
    if (!matrix) return;
    let dataUrl: string | undefined;
    if (logo) {
      const c = document.createElement("canvas"); c.width = logo.img.naturalWidth; c.height = logo.img.naturalHeight;
      c.getContext("2d")!.drawImage(logo.img, 0, 0); dataUrl = c.toDataURL("image/png");
    }
    download(new Blob([qrSvg(matrix, style, dataUrl, logo?.aspect)], { type: "image/svg+xml" }), "qr-code.svg");
  };
  const copy = async () => {
    try { const b = await new Promise<Blob | null>((r) => canvas.current?.toBlob(r, "image/png")); if (b) { await navigator.clipboard.write([new ClipboardItem({ "image/png": b })]); toast("QR code copied"); } }
    catch { toast("Copy isn’t available here — use Download instead."); }
  };

  return (
    <section className="panel qr">
      <div className="qr-kinds seg" role="tablist" aria-label="What should the QR code open?">
        {KINDS.map((k) => <button key={k.id} role="tab" aria-selected={kind === k.id} className={kind === k.id ? "on" : ""} onClick={() => setKind(k.id)}>{k.label}</button>)}
      </div>

      <div className="qr-tpls" role="group" aria-label="Ready-made designs">
        <span className="field-label">Start from a design</span>
        <div className="qr-tpl-row">
          {QR_TEMPLATES.map((t) => (
            <button key={t.id} type="button" className={`qr-tpl${isTpl(t) ? " on" : ""}`} aria-pressed={isTpl(t)} onClick={() => apply(t)} title={`${t.name} design`}>
              <span className={`qr-tpl-img${t.style.transparent ? " checker" : ""}`}><Thumb tpl={t} sample={sample} /></span>
              <span>{t.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="qr-grid">
        <div className="qr-form">
          {kind === "url" && <TextField label="Web address" value={url} onChange={setUrl} inputMode="url" placeholder="https://example.com" />}
          {kind === "text" && <div className="field"><label htmlFor="qr-text" className="field-label">Text</label><textarea id="qr-text" rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder="Anything you want people to read" /></div>}
          {kind === "wifi" && (
            <>
              <TextField label="Network name (SSID)" value={wifi.ssid} onChange={(v) => setWifi({ ...wifi, ssid: v })} autoComplete="off" />
              <div className="field"><span className="field-label">Security</span>
                <div className="seg">{(["WPA", "WEP", "nopass"] as const).map((s) => <button key={s} className={wifi.security === s ? "on" : ""} onClick={() => setWifi({ ...wifi, security: s })}>{s === "nopass" ? "Open" : s === "WPA" ? "WPA / WPA2 / WPA3" : "WEP"}</button>)}</div>
              </div>
              {wifi.security !== "nopass" && <TextField label="Password" value={wifi.password} onChange={(v) => setWifi({ ...wifi, password: v })} autoComplete="off" />}
              <label className="qr-check"><input type="checkbox" checked={wifi.hidden} onChange={(e) => setWifi({ ...wifi, hidden: e.target.checked })} /> Hidden network</label>
            </>
          )}
          {kind === "contact" && (
            <div className="qr-two">
              <TextField label="First name" value={contact.first} onChange={(v) => setContact({ ...contact, first: v })} />
              <TextField label="Last name" value={contact.last} onChange={(v) => setContact({ ...contact, last: v })} />
              <TextField label="Company" value={contact.org} onChange={(v) => setContact({ ...contact, org: v })} />
              <TextField label="Job title" value={contact.title} onChange={(v) => setContact({ ...contact, title: v })} />
              <TextField label="Phone" value={contact.phone} onChange={(v) => setContact({ ...contact, phone: v })} inputMode="tel" />
              <TextField label="Email" value={contact.email} onChange={(v) => setContact({ ...contact, email: v })} inputMode="email" />
              <TextField label="Website" value={contact.url} onChange={(v) => setContact({ ...contact, url: v })} />
              <TextField label="Address" value={contact.address} onChange={(v) => setContact({ ...contact, address: v })} />
            </div>
          )}
          {kind === "email" && (
            <>
              <TextField label="To" value={mail.to} onChange={(v) => setMail({ ...mail, to: v })} inputMode="email" placeholder="name@example.com" />
              <TextField label="Subject (optional)" value={mail.subject} onChange={(v) => setMail({ ...mail, subject: v })} />
              <div className="field"><label htmlFor="qr-body" className="field-label">Message (optional)</label><textarea id="qr-body" rows={3} value={mail.body} onChange={(e) => setMail({ ...mail, body: e.target.value })} /></div>
            </>
          )}
          {kind === "phone" && <TextField label="Phone number" value={phone} onChange={setPhone} inputMode="tel" placeholder="+1 555 0100" />}
          {kind === "sms" && (
            <>
              <TextField label="Phone number" value={sms.to} onChange={(v) => setSms({ ...sms, to: v })} inputMode="tel" />
              <div className="field"><label htmlFor="qr-sms" className="field-label">Message (optional)</label><textarea id="qr-sms" rows={3} value={sms.msg} onChange={(e) => setSms({ ...sms, msg: e.target.value })} /></div>
            </>
          )}
          {kind === "geo" && (
            <div className="qr-two">
              <TextField label="Latitude" value={geo.lat} onChange={(v) => setGeo({ ...geo, lat: v })} inputMode="decimal" placeholder="37.7749" />
              <TextField label="Longitude" value={geo.lon} onChange={(v) => setGeo({ ...geo, lon: v })} inputMode="decimal" placeholder="-122.4194" />
            </div>
          )}

          <details className="qr-style" open>
            <summary>Style</summary>
            <div className="qr-two">
              <div className="field"><label htmlFor="qr-fg" className="field-label">Code colour</label><input id="qr-fg" type="color" value={fg} onChange={(e) => setFg(e.target.value)} /></div>
              <div className="field"><label htmlFor="qr-bg" className="field-label">Background</label><input id="qr-bg" type="color" value={bg} disabled={transparent} onChange={(e) => setBg(e.target.value)} /></div>
            </div>
            <label className="qr-check"><input type="checkbox" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} /> Transparent background</label>
            <div className="field"><span className="field-label">Dot shape</span>
              <div className="seg">{(["square", "rounded", "dots"] as const).map((d) => <button key={d} className={dots === d ? "on" : ""} onClick={() => setDots(d)}>{d[0].toUpperCase() + d.slice(1)}</button>)}</div>
            </div>
            <div className="field"><span className="field-label">Corner markers</span>
              <div className="seg">{(["square", "rounded", "circle"] as const).map((k) => <button key={k} className={eyes === k ? "on" : ""} onClick={() => setEyes(k)}>{k[0].toUpperCase() + k.slice(1)}</button>)}</div>
            </div>
            <div className="field"><span className="field-label">Image corners</span>
              <div className="seg">{(["square", "rounded"] as const).map((k) => <button key={k} className={frame === k ? "on" : ""} onClick={() => setFrame(k)}>{k[0].toUpperCase() + k.slice(1)}</button>)}</div>
              {frame === "rounded" && !transparent && <div className="field-help">The PNG gets see-through corners outside the rounded edge.</div>}
            </div>
            <div className="field"><span className="field-label">Error correction {logo && <b>H (logo)</b>}</span>
              <div className="seg" aria-disabled={!!logo}>{(["L", "M", "Q", "H"] as const).map((l) => <button key={l} disabled={!!logo} className={level === l ? "on" : ""} onClick={() => setEc(l)} title={{ L: "Smallest code, 7% repair", M: "Balanced, 15% repair", Q: "25% repair", H: "Most robust, 30% repair" }[l]}>{l}</button>)}</div>
            </div>
            <div className="field"><label htmlFor="qr-size" className="field-label">Image size <b>{size} px</b></label>
              <input id="qr-size" type="range" min={256} max={4096} step={128} value={size} style={{ "--pct": `${((size - 256) / (4096 - 256)) * 100}%` } as React.CSSProperties} onChange={(e) => setSize(+e.target.value)} /></div>
            <div className="field"><label htmlFor="qr-margin" className="field-label">Quiet border <b>{margin} modules</b></label>
              <input id="qr-margin" type="range" min={0} max={8} step={1} value={margin} style={{ "--pct": `${(margin / 8) * 100}%` } as React.CSSProperties} onChange={(e) => setMargin(+e.target.value)} /></div>
            <div className="field"><label htmlFor="qr-caption" className="field-label">Name or title</label>
              <input id="qr-caption" type="text" value={caption} maxLength={60} placeholder="e.g. Guest Wi-Fi, Scan to pay, Menu" spellCheck={false} onChange={(e) => setCaption(e.target.value)} />
              <div className="seg" aria-label="Where the name goes">{(["top", "bottom"] as const).map((p) => <button key={p} className={captionPos === p ? "on" : ""} disabled={!caption.trim()} onClick={() => setCaptionPos(p)}>{p === "top" ? "Above the code" : "Below the code"}</button>)}</div>
            </div>
            <div className="field"><span className="field-label">Logo in the middle</span>
              <div className="qr-logo">
                <label className="btn btn-secondary btn-sm"><Icon name="image" size={14} /> {logo ? "Change logo" : "Add logo"}<input type="file" hidden accept="image/*" onChange={(e) => { pickLogo(e.target.files?.[0]); e.target.value = ""; }} /></label>
                {logo && <button className="btn btn-ghost btn-sm" onClick={() => { URL.revokeObjectURL(logo.url); setLogo(null); }}><Icon name="x" size={14} /> Remove</button>}
              </div>
            </div>
          </details>
        </div>

        <div className="qr-out">
          <div className={`qr-canvas${transparent ? " checker" : ""}`}>
            {matrix ? <canvas ref={canvas} aria-label="Your QR code" /> : (
              <div className="qr-empty"><Icon name="qr" size={44} /><span>{tooLong ? "That’s too much for one QR code. Shorten it." : "Fill in the details and your QR code appears here."}</span></div>
            )}
          </div>
          {matrix && (weak || inverted) && (
            <p className="meta-note"><Icon name="shield" size={15} />{weak ? "Low contrast — many phones won’t scan this. Use a much darker code on a lighter background." : "Light code on a dark background — some older scanners can’t read inverted codes."}</p>
          )}
          <div className="qr-actions">
            <button className="btn btn-primary" onClick={png} disabled={!matrix}><Icon name="download" size={16} /> PNG</button>
            <button className="btn btn-secondary" onClick={svg} disabled={!matrix}><Icon name="download" size={16} /> SVG</button>
            <button className="btn btn-secondary" onClick={copy} disabled={!matrix}><Icon name="extract" size={16} /> Copy</button>
          </div>
          {matrix && <p className="field-help qr-meta">{matrix.size}×{matrix.size} modules · level {level} · {payload.length} characters</p>}
        </div>
      </div>
    </section>
  );
}
