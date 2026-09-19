"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fmtBytes } from "@/lib/formats";
import { PACK_FILES, PACK_SIZE_MB, packsCached } from "@/lib/offline";
import { Icon } from "./Icon";
import { useToast } from "./Toast";

/** Registers the service worker and shows offline state, install prompt, update prompt and the optional OCR/HEIC packs. */
export function OfflineStatus() {
  const toast = useToast();
  const [online, setOnline] = useState(true);
  const [ready, setReady] = useState(false);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [cached, setCached] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [prog, setProg] = useState(0);
  const [open, setOpen] = useState(false);
  const [usage, setUsage] = useState<{ used: number; quota: number } | null>(null);
  const [installEvt, setInstallEvt] = useState<any>(null);
  const reloading = useRef(false);
  const box = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    setCached(await packsCached());
    try { const e = await navigator.storage?.estimate?.(); if (e?.usage !== undefined) setUsage({ used: e.usage, quota: e.quota ?? 0 }); } catch { /* unsupported */ }
  }, []);

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    const before = (e: Event) => { e.preventDefault(); setInstallEvt(e); };
    window.addEventListener("beforeinstallprompt", before);
    window.addEventListener("appinstalled", () => setInstallEvt(null));

    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").then((reg) => {
        if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const w = reg.installing;
          w?.addEventListener("statechange", () => { if (w.state === "installed" && navigator.serviceWorker.controller) setWaiting(w); });
        });
        return navigator.serviceWorker.ready;
      }).then(() => { setReady(true); refresh(); navigator.storage?.persist?.().catch(() => {}); }).catch(() => {});
      navigator.serviceWorker.addEventListener("controllerchange", () => { if (reloading.current) location.reload(); });
    }
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); window.removeEventListener("beforeinstallprompt", before); };
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const downloadPacks = async () => {
    setLoading(true); setProg(0);
    let done = 0;
    for (const url of PACK_FILES) {
      try { if (!(await caches.match(url))) await (await fetch(url)).arrayBuffer(); } catch { /* keep going; status shows what's missing */ }
      setProg(++done / PACK_FILES.length);
    }
    await refresh();
    setLoading(false);
    const missing = PACK_FILES.length - (await packsCached());
    toast(missing ? `${missing} file${missing === 1 ? "" : "s"} couldn’t be saved — try again` : "OCR & HEIC are ready offline", missing ? "err" : "ok");
  };

  const update = () => { reloading.current = true; waiting?.postMessage("SKIP_WAITING"); setTimeout(() => location.reload(), 1500); };
  const install = async () => { await installEvt?.prompt?.(); setInstallEvt(null); };

  const packsDone = cached !== null && cached >= PACK_FILES.length;
  if (!ready && online && !waiting) return null;

  return (
    <>
      <div className="off" ref={box}>
        <button className={`off-pill ${online ? "ok" : "warn"}`} onClick={() => { setOpen((o) => !o); refresh(); }} aria-expanded={open} title={online ? "Works offline" : "You’re offline"}>
          <Icon name={online ? "check" : "wifioff"} size={14} />
          <span>{online ? "Offline ready" : "Offline"}</span>
        </button>
        {open && (
          <div className="off-pop" role="dialog" aria-label="Offline mode">
            <b>{online ? "Works without internet" : "You’re offline — everything still works"}</b>
            <p>PlayWithDoc saved itself to this device. PDF, image, Word, Excel and PowerPoint tools, signing, editing and more all run with no connection.</p>
            <div className="off-row">
              <span><Icon name="sparkle" size={14} /> OCR &amp; HEIC engines <small>≈ {PACK_SIZE_MB} MB · 9 languages</small></span>
              {packsDone ? <em className="okk"><Icon name="check" size={13} /> Ready</em>
                : <button className="btn btn-secondary btn-sm" onClick={downloadPacks} disabled={loading || !online}>{loading ? `${Math.round(prog * 100)}%` : cached ? "Finish download" : "Download"}</button>}
            </div>
            {loading && <div className="off-bar"><i style={{ width: `${prog * 100}%` }} /></div>}
            {!packsDone && !online && <p className="muted off-note">Connect once to download these. Until then, OCR and HEIC need a connection.</p>}
            {installEvt && <button className="btn btn-primary btn-sm off-install" onClick={install}><Icon name="download" size={14} /> Install as an app</button>}
            {usage && <p className="muted off-note">Using {fmtBytes(usage.used)} of local storage on this device.</p>}
          </div>
        )}
      </div>
      {waiting && (
        <div className="upd" role="status">
          <span><Icon name="sparkle" size={15} /> A new version of PlayWithDoc is ready.</span>
          <button className="btn btn-primary btn-sm" onClick={update}>Update</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setWaiting(null)}>Later</button>
        </div>
      )}
    </>
  );
}
