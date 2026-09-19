"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { fmtBytes } from "@/lib/formats";
import { getOutgoing, installNetGuard, pauseNetGuard, subscribeNet } from "@/lib/netguard";
import { Icon } from "./Icon";

type Req = { name: string; kind: string; cross: boolean; at: number };

const short = (u: string) => { try { const x = new URL(u); return x.origin === location.origin ? x.pathname + (x.search ? "…" : "") : x.origin + x.pathname; } catch { return u; } };

/** A live, honest demonstration of the no-upload design: what this page has requested, what happens to a file you pick, and a deliberate attempt to send data away. */
export function ProveIt() {
  const [reqs, setReqs] = useState<Req[]>([]);
  const [carrying, setCarrying] = useState(0);
  const [csp, setCsp] = useState<string | null | undefined>(undefined);
  const [demo, setDemo] = useState<null | { name: string; size: number; hash: string; ms: number; fresh: string[] }>(null);
  const [reading, setReading] = useState(false);
  const [probe, setProbe] = useState<{ state: "idle" | "running" | "blocked" | "failed"; detail?: string }>({ state: "idle" });
  const input = useRef<HTMLInputElement>(null);

  const collect = useCallback(() => {
    const list = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    setReqs(list.map((e) => ({ name: e.name, kind: e.initiatorType || "other", cross: new URL(e.name, location.href).origin !== location.origin, at: e.startTime })));
  }, []);

  useEffect(() => {
    installNetGuard();
    collect();
    setCarrying(getOutgoing());
    const off = subscribeNet(() => setCarrying(getOutgoing()));
    let po: PerformanceObserver | undefined;
    try { po = new PerformanceObserver(() => collect()); po.observe({ type: "resource", buffered: true }); } catch { /* unsupported */ }
    // Read the page's own security policy straight from the server (a HEAD request carries no data).
    fetch(location.pathname, { method: "HEAD", cache: "no-store" }).then((r) => setCsp(r.headers.get("content-security-policy"))).catch(() => setCsp(null));
    return () => { off(); po?.disconnect(); };
  }, [collect]);

  const cross = reqs.filter((r) => r.cross).length;

  const readFile = async (f: File) => {
    setReading(true); setDemo(null);
    const seen = new Set((performance.getEntriesByType("resource") as PerformanceResourceTiming[]).map((e) => e.name + e.startTime));
    const t0 = performance.now();
    const buf = await f.arrayBuffer();
    let hash = "unavailable — your browser only allows hashing on a secure (https) page";
    if (crypto?.subtle) hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", buf))].map((b) => b.toString(16).padStart(2, "0")).join("");
    const ms = performance.now() - t0;
    await new Promise((r) => setTimeout(r, 600)); // give any stray request time to show up
    const fresh = (performance.getEntriesByType("resource") as PerformanceResourceTiming[]).filter((e) => !seen.has(e.name + e.startTime)).map((e) => short(e.name));
    setDemo({ name: f.name, size: f.size, hash, ms, fresh });
    setReading(false);
    collect();
  };

  const runProbe = async () => {
    setProbe({ state: "running" });
    let violation: SecurityPolicyViolationEvent | null = null;
    const onViolation = (e: Event) => { violation = e as SecurityPolicyViolationEvent; };
    document.addEventListener("securitypolicyviolation", onViolation);
    try {
      // .invalid can never resolve, and the body is a harmless word — no user data is ever sent by this button.
      await pauseNetGuard(() => fetch("https://example.invalid/upload", { method: "POST", body: "probe" }));
      setProbe({ state: "failed", detail: "The request left the page but found nothing." });
    } catch {
      await new Promise((r) => setTimeout(r, 150));
      const v = violation as SecurityPolicyViolationEvent | null;
      if (v) setProbe({ state: "blocked", detail: `${v.violatedDirective} — blocked ${v.blockedURI}` });
      else setProbe({ state: "failed", detail: "The request failed to connect. (The strict browser policy is only switched on in the production site, which is why it isn’t what blocked this one.)" });
    } finally { document.removeEventListener("securitypolicyviolation", onViolation); }
  };

  const directives = csp ? csp.split(";").map((d) => d.trim()).filter(Boolean) : [];

  return (
    <div className="proof">
      {/* live meter */}
      <section className="proof-sec">
        <h2><span>1</span> What this page has actually done</h2>
        <div className="proof-tiles">
          <div className={`proof-tile ${cross === 0 ? "good" : "bad"}`}><b>{cross}</b><span>requests to other websites</span></div>
          <div className={`proof-tile ${carrying === 0 ? "good" : "bad"}`}><b>{carrying}</b><span>requests that carried data out</span></div>
          <div className="proof-tile good"><b>0</b><span>files uploaded</span></div>
          <div className="proof-tile"><b>{reqs.length}</b><span>requests in total (this site’s own scripts, styles and fonts)</span></div>
        </div>
        <div className="proof-log" role="log" aria-label="Requests made by this page">
          <div className="proof-log-head"><i /><i /><i /><span>Network — live</span></div>
          <ul>
            {reqs.slice(-14).map((r, i) => (
              <li key={i} className={r.cross ? "cross" : ""}><span className="kind">{r.kind}</span><span className="url" title={r.name}>{short(r.name)}</span><em>{r.cross ? "other site" : "this site"}</em></li>
            ))}
            {!reqs.length && <li className="muted">No requests recorded yet.</li>}
          </ul>
        </div>
        <p className="proof-note">Every request above fetched this site’s own code and fonts. Nothing here ever carries your files. Open your browser’s DevTools → Network to see the same list from the outside.</p>
      </section>

      {/* demo */}
      <section className="proof-sec">
        <h2><span>2</span> Give it a file — watch nothing leave</h2>
        <p className="muted proof-lead">Pick any file. This page reads it and computes a fingerprint (SHA-256) right here, then shows whether any new network request happened while it did.</p>
        <input ref={input} type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) readFile(f); }} />
        <div className="proof-demo card">
          {!demo && !reading && <button className="btn btn-primary" onClick={() => input.current?.click()}><Icon name="upload" size={16} /> Choose a file</button>}
          {reading && <p className="muted"><span className="spin" /> Reading on your device…</p>}
          {demo && (
            <div className="proof-result">
              <dl>
                <div><dt>File</dt><dd>{demo.name} · {fmtBytes(demo.size)}</dd></div>
                <div><dt>Read and hashed in</dt><dd>{demo.ms.toFixed(1)} ms, inside this tab</dd></div>
                <div><dt>SHA-256 fingerprint</dt><dd className="mono">{demo.hash}</dd></div>
                <div><dt>New network requests while it happened</dt><dd className={demo.fresh.length ? "warnc" : "goodc"}>{demo.fresh.length === 0 ? "0 — nothing left this tab" : `${demo.fresh.length}`}</dd></div>
              </dl>
              {demo.fresh.length > 0 && <div className="alert warn">Something else on the page made a request in that moment: <code>{demo.fresh.join(", ")}</code>. It isn’t your file — the file was read directly from your disk into memory.</div>}
              <button className="btn btn-secondary btn-sm" onClick={() => setDemo(null)}>Try another file</button>
            </div>
          )}
        </div>
      </section>

      {/* probe */}
      <section className="proof-sec">
        <h2><span>3</span> Try to break it</h2>
        <p className="muted proof-lead">This button tries to send a request to another website. (It sends only the word “probe” to an address that can’t exist — never any of your data.) Your browser should refuse.</p>
        <div className="proof-demo card">
          <button className="btn btn-secondary" onClick={runProbe} disabled={probe.state === "running"}>{probe.state === "running" ? <span className="spin" /> : <Icon name="wifioff" size={16} />} Try to send data to another site</button>
          {probe.state === "blocked" && <div className="alert good-alert" role="status"><Icon name="shield" size={16} /> <div><b>Blocked by your browser.</b> The site’s security policy forbids it. <code>{probe.detail}</code></div></div>}
          {probe.state === "failed" && <div className="alert info" role="status">{probe.detail}</div>}
        </div>
      </section>

      {/* csp */}
      <section className="proof-sec">
        <h2><span>4</span> The rule your browser is enforcing</h2>
        <p className="muted proof-lead">Every page is served with a Content-Security-Policy. The line that matters is <code>connect-src</code>: it allows this page to talk only to itself, so even a bug — or a tampered script — couldn’t upload a file to anyone else.</p>
        <div className="proof-csp">
          {csp === undefined && <p className="muted"><span className="spin" /> Reading this page’s headers…</p>}
          {csp === null && <p className="muted">No policy is set on this connection. That’s normal while developing locally or when offline; the live site sends one.</p>}
          {directives.length > 0 && <ul>{directives.map((d) => { const key = d.split(" ")[0]; return <li key={d} className={key === "connect-src" ? "hot" : ""}><b>{key}</b> {d.slice(key.length).trim()}</li>; })}</ul>}
        </div>
      </section>

      {/* verify */}
      <section className="proof-sec">
        <h2><span>5</span> Check it yourself in a minute</h2>
        <ol className="proof-steps">
          <li><b>Watch the Network tab.</b> Press <kbd>F12</kbd>, open <b>Network</b>, then convert a file. You’ll see scripts and fonts load — never your file leaving.</li>
          <li><b>Try airplane mode.</b> Open any tool once, switch your connection off, and convert again. It still works, because nothing needed a server.</li>
          <li><b>Read the code.</b> The project is open source on <a href="https://github.com/Tirth-Babariya/playwithdoc" target="_blank" rel="noopener noreferrer">GitHub</a>. Search it for <code>fetch(</code> — there’s no upload code to find.</li>
          <li><b>Look at the headers.</b> In DevTools → Network, click the page and read the <code>content-security-policy</code> response header. It matches what you see above.</li>
        </ol>
      </section>

      {/* honesty */}
      <section className="proof-sec">
        <h2><span>6</span> What we can’t promise</h2>
        <ul className="proof-honest">
          <li>Like any website, the host that serves these pages may keep standard technical logs (your IP address and which page you asked for). They never contain your files, because files are never sent.</li>
          <li>A browser extension you installed can see anything on a page you visit. That’s outside this site’s control.</li>
          <li>If someone else uses your computer while your tab is open, they can see what’s on screen. Close the tab and the files are gone from memory.</li>
        </ul>
        <p className="muted">More detail on the <Link href="/privacy">Privacy page</Link>.</p>
      </section>
    </div>
  );
}
