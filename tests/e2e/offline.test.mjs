// End-to-end tests — offline-first (18 checks: works with the network off, never-opened tools, OCR pack).
// Run against a production build:  npm run build && npm start   (port 3100 → set BASE_URL if different)
//   BASE_URL=http://localhost:3000 node tests/e2e/offline.test.mjs
// Uses Playwright's Chromium by default; set CHROME_PATH to use an installed Chrome/Edge instead.
import fs from "node:fs";
import path from "node:path";
import { BASE, FIXTURES, OUT, launch, makeFixtures, require } from "./helpers.mjs";
const { PDFDocument } = require("pdf-lib");
const fx = FIXTURES, out = OUT;
const res = [];
const ok = (n, c, d = "") => { res.push(c); console.log(c ? "PASS" : "FAIL", "|", n, "|", String(d).slice(0, 150)); };

const browser = await launch();
await makeFixtures(browser);
const ctx = await browser.newContext({ viewport: { width: 1360, height: 1200 }, acceptDownloads: true });
const page = await ctx.newPage();
const errs = []; page.on("pageerror", (e) => errs.push(e.message));

// 1. ONE visit to the home page only.
await page.goto(BASE + "/");
await page.evaluate(() => navigator.serviceWorker.ready);
// wait for precache to finish
await page.waitForFunction(async () => { const keys = await caches.keys(); const core = keys.find((k) => k.startsWith("af-core-")); if (!core) return false; return (await (await caches.open(core)).keys()).length >= 90; }, null, { timeout: 60000, polling: 500 }).catch(() => {});
const stats = await page.evaluate(async () => { const out = {}; for (const k of await caches.keys()) out[k] = (await (await caches.open(k)).keys()).length; return out; });
console.log("caches:", stats);
ok("core precache populated (pages+assets)", Object.entries(stats).some(([k, n]) => k.startsWith("af-core-") && n >= 90));
ok("vendor engines cached", Object.entries(stats).some(([k, n]) => k.startsWith("af-vendor-") && n >= 6));
await page.reload(); await page.waitForTimeout(800);
ok("pill says Offline ready", /offline ready/i.test(await page.locator(".off-pill").innerText()));
await page.screenshot({ path: path.join(out, "pill.png") });
await page.locator(".off-pill").click(); await page.waitForTimeout(300);
await page.screenshot({ path: path.join(out, "offline-menu.png") });
await page.keyboard.press("Escape"); await page.mouse.click(10, 300);

// 2. Go offline and use tools that were NEVER opened before.
await ctx.setOffline(true);
await page.goto(BASE + "/tools/merge-pdf", { waitUntil: "domcontentloaded" });
await page.waitForSelector("input[type=file]", { state: "attached", timeout: 15000 });
ok("never-visited tool page loads offline", true);
ok("offline pill shown", /offline/i.test(await page.locator(".off-pill").innerText()) && !/ready/i.test(await page.locator(".off-pill").innerText()));
await page.setInputFiles("input[type=file]", [path.join(fx, "a.pdf"), path.join(fx, "b.pdf")]);
await page.waitForSelector(".fc"); await page.locator("button.run").click();
let merged = true; try { await page.waitForSelector(".panel.done", { timeout: 30000 }); } catch { merged = false; }
ok("merge PDFs works offline", merged);
if (merged) { const [d] = await Promise.all([page.waitForEvent("download"), page.locator(".outs a[download]").click()]); const p = path.join(out, "m.pdf"); await d.saveAs(p); ok("merged output valid (5 pages)", (await PDFDocument.load(fs.readFileSync(p))).getPageCount() === 5); }
await page.screenshot({ path: path.join(out, "offline-merge.png") });

const trySlug = async (slug, files, extra) => {
  await page.goto(`${BASE}/tools/${slug}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("input[type=file]", { state: "attached", timeout: 15000 });
  await page.setInputFiles("input[type=file]", files.map((f) => path.join(fx, f)));
  if (extra) await extra();
  await page.locator("button.run").click().catch(() => {});
  try { await page.waitForSelector(".panel.done", { timeout: 60000 }); return true; } catch { return false; }
};
ok("PDF → JPG offline (pdf.js)", await trySlug("pdf-to-jpg", ["a.pdf"]));
ok("Protect PDF offline (qpdf wasm)", await trySlug("protect-pdf", ["a.pdf"], async () => { await page.locator("#opt-password").fill("offline123"); }));
ok("Word → PDF offline (mammoth)", await trySlug("word-to-pdf", ["report.docx"]));
ok("Compress image offline", await trySlug("compress-image", ["red.jpg"]));
await page.goto(`${BASE}/tools/sign-pdf`, { waitUntil: "domcontentloaded" });
await page.setInputFiles("input[type=file]", [path.join(fx, "a.pdf")]);
let ed = true; try { await page.waitForSelector(".ed-over", { timeout: 20000 }); } catch { ed = false; }
ok("Sign PDF editor opens offline", ed);
ok("home page offline", await (async () => { await page.goto(BASE + "/", { waitUntil: "domcontentloaded" }); return (await page.locator("h1").innerText()).includes("Every file format"); })());
ok("command palette offline", await (async () => { await page.keyboard.press("Control+k"); await page.keyboard.type("jpg to pdf"); await page.waitForTimeout(300); return /JPG to PDF/.test(await page.locator(".pal-item").first().innerText()); })());
await page.keyboard.press("Escape");

// 3. OCR without the pack, offline → clean failure; then online → download pack → offline OCR works.
const ocrOffline = await trySlug("ocr-to-text", ["ocr.png"]);
const err1 = await page.locator(".alert.bad").count() ? await page.locator(".alert.bad").first().innerText() : "";
ok("OCR without pack offline fails cleanly (no crash)", !ocrOffline && err1.length > 0, err1);
await ctx.setOffline(false);
await page.goto(BASE + "/"); await page.waitForTimeout(800);
await page.locator(".off-pill").click();
await page.getByRole("button", { name: /^Download$/ }).click();
await page.waitForFunction(() => /ready/i.test(document.querySelector(".off-row em")?.textContent || ""), null, { timeout: 120000 }).catch(() => {});
ok("offline pack downloaded (OCR + HEIC ready)", /ready/i.test(await page.locator(".off-row").innerText()), await page.locator(".off-row").innerText());
await page.screenshot({ path: path.join(out, "offline-packs.png") });
await ctx.setOffline(true);
const ocr2 = await trySlug("ocr-to-text", ["ocr.png"]);
let txt = ""; if (ocr2) { const [d] = await Promise.all([page.waitForEvent("download"), page.locator(".outs a[download]").click()]); const p = path.join(out, "o.txt"); await d.saveAs(p); txt = fs.readFileSync(p, "utf8"); }
ok("OCR works fully offline after pack download", ocr2 && /hello/i.test(txt), txt.replace(/\n/g, " "));
await ctx.setOffline(false);

// 4. No uploads at all
ok("net badge 0 uploads", /0 uploads/.test(await (async () => { await page.goto(BASE + "/tools/jpg-to-pdf"); return page.locator(".netbadge").first().innerText(); })()));

console.log(`\n${res.filter(Boolean).length}/${res.length} passed`, errs.length ? errs.slice(0, 5) : "");
await browser.close();
process.exit(res.every(Boolean) ? 0 : 1);
