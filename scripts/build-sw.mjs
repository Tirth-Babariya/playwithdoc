// Generates public/sw.js (offline-first service worker) from scripts/sw.template.js after `next build`.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const walk = (dir) => {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
};
const rel = (base, p) => path.relative(base, p).split(path.sep).join("/");

const staticDir = path.join(root, ".next", "static");
const appDir = path.join(root, ".next", "server", "app");

const assets = walk(staticDir).filter((f) => !f.endsWith(".map")).map((f) => "/_next/static/" + rel(staticDir, f));
const pages = walk(appDir)
  .filter((f) => f.endsWith(".html") && !path.basename(f).startsWith("_"))
  .map((f) => rel(appDir, f))
  .map((f) => (f === "index.html" ? "/" : "/" + f.replace(/\.html$/, "")));

// Core engines every common tool needs. Big optional packs (OCR, HEIC) are downloaded on demand.
const vendorCore = ["pdf.min.js", "pdf.worker.min.js", "mammoth.min.js", "xlsx.min.js", "qpdf/qpdf.js", "qpdf/qpdf.wasm"].map((f) => "/vendor/" + f);
const publicFiles = ["/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/maskable-512.png"];

const precache = [...new Set([...pages, ...assets, ...vendorCore, ...publicFiles])].filter((u) => {
  if (u.startsWith("/vendor/")) return fs.existsSync(path.join(root, "public", u));
  return true;
});

const sig = (files) => crypto.createHash("sha1").update(files.map((f) => f + ":" + (fs.existsSync(f) ? fs.statSync(f).size : 0)).join("|")).digest("hex");
const version = sig([...walk(staticDir), ...walk(appDir).filter((f) => f.endsWith(".html"))]).slice(0, 10);
const vendorVersion = sig(walk(path.join(root, "public", "vendor"))).slice(0, 8);

const template = fs.readFileSync(path.join(root, "scripts", "sw.template.js"), "utf8");
const sw = template
  .replace("__VERSION__", version)
  .replace("__VENDOR__", vendorVersion)
  .replace("__PRECACHE__", JSON.stringify(precache, null, 1));
fs.writeFileSync(path.join(root, "public", "sw.js"), sw);

const bytes = precache.reduce((n, u) => {
  const f = u.startsWith("/_next/static/") ? path.join(staticDir, u.slice("/_next/static/".length)) : u.startsWith("/vendor/") || u.startsWith("/icons/") ? path.join(root, "public", u) : null;
  return n + (f && fs.existsSync(f) ? fs.statSync(f).size : 0);
}, 0);
console.log(`service worker: v${version} · ${pages.length} pages · ${assets.length} assets · ${vendorCore.length} engines · ≈ ${(bytes / 1048576).toFixed(1)} MB (+ pages)`);
