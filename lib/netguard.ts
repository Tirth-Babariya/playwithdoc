/**
 * Counts requests made by this page's own code that could carry user data out:
 *   • anything sent to another website, and
 *   • same-site requests that carry a body (POST/PUT…), other than the framework's own internal endpoints.
 * Files are never sent anywhere, so the counter should always read 0 — it's here so you can watch it.
 */
let installed = false;
let outgoing = 0;
let last = "";
const subs = new Set<() => void>();
const notify = () => subs.forEach((f) => f());

/** Endpoints the framework itself uses (dev overlay, HMR, static assets…). They never carry user files. */
const INTERNAL = /^\/(__nextjs|_next\/|_vercel\/)/;

function note(method: string, target: string, hasBody: boolean) {
  let u: URL;
  try { u = new URL(target, location.href); } catch { return; }
  const crossSite = u.origin !== location.origin;
  const carries = hasBody || (method !== "GET" && method !== "HEAD");
  if (!crossSite && (!carries || INTERNAL.test(u.pathname))) return;
  outgoing++;
  last = `${method} ${crossSite ? u.origin : ""}${u.pathname}`;
  notify();
}

export function installNetGuard() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const isReq = typeof Request !== "undefined" && input instanceof Request;
    const method = (init?.method || (isReq ? (input as Request).method : "GET")).toUpperCase();
    const body = init?.body != null || (isReq && (input as Request).body != null);
    note(method, isReq ? (input as Request).url : String(input), body);
    return nativeFetch(input, init);
  };

  const open = XMLHttpRequest.prototype.open;
  const send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (this: XMLHttpRequest & { __af?: [string, string] }, method: string, url: string | URL, ...rest: any[]) {
    this.__af = [method.toUpperCase(), String(url)];
    return (open as any).call(this, method, url, ...rest);
  } as typeof open;
  XMLHttpRequest.prototype.send = function (this: XMLHttpRequest & { __af?: [string, string] }, body?: Document | XMLHttpRequestBodyInit | null) {
    const [m, u] = this.__af ?? ["GET", ""];
    if (u) note(m, u, body != null);
    return send.call(this, body);
  };

  if (navigator.sendBeacon) {
    const beacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = (url: string | URL, data?: BodyInit | null) => { note("POST", String(url), true); return beacon(url, data); };
  }
}

export const getOutgoing = () => outgoing;
export const getLast = () => last;
export function subscribeNet(f: () => void) { subs.add(f); return () => { subs.delete(f); }; }
