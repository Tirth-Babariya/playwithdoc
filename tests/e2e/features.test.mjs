// End-to-end tests — features (53 checks: previews, reorder, OCR, sign/edit/redact, protect, PowerPoint…).
// Run against a production build:  npm run build && npm start   (port 3100 → set BASE_URL if different)
//   BASE_URL=http://localhost:3000 node tests/e2e/features.test.mjs
// Uses Playwright's Chromium by default; set CHROME_PATH to use an installed Chrome/Edge instead.
import fs from "node:fs";
import path from "node:path";
import { BASE, FIXTURES, OUT, launch, makeFixtures, require, hydrated, openPalette } from "./helpers.mjs";

const { PDFDocument } = require("pdf-lib");
const JSZip = require("jszip");
const fx = FIXTURES, out = OUT;

const results = [];
const ok = (n, c, d = "") => { results.push([c ? "PASS" : "FAIL", n, String(d).slice(0, 160)]); console.log(c ? "PASS" : "FAIL", "|", n, "|", String(d).slice(0, 160)); };

const browser = await launch();
await makeFixtures(browser);
const ctx = await browser.newContext({ viewport: { width: 1360, height: 1500 }, acceptDownloads: true, colorScheme: "light" });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text().slice(0, 200) + " @" + (m.location().url || "").slice(0, 80)); });

const abs = (f) => (path.isAbsolute(f) ? f : path.join(fx, f));
async function open(slug, files) {
  await page.goto(`${BASE}/tools/${slug}`);
  await page.waitForSelector("input[type=file]", { state: "attached" }); await hydrated(page);
  if (files?.length) await page.setInputFiles("input[type=file]", files.map(abs));
}
async function runAndWait(timeout = 90000) {
  const b = page.locator("button.run");
  if (await b.count()) { await page.waitForTimeout(200); if (await b.isEnabled().catch(() => false)) await b.click(); }
  await page.waitForSelector(".panel.done, .alert.bad", { timeout });
  if (await page.locator(".alert.bad").count()) return { error: await page.locator(".alert.bad").first().innerText() };
  return {};
}
async function downloads(tag) {
  const dl = [];
  const links = page.locator(".outs a[download]");
  for (let i = 0; i < Math.min(await links.count(), 6); i++) {
    const [d] = await Promise.all([page.waitForEvent("download"), links.nth(i).click()]);
    const p = path.join(out, `${tag}__${d.suggestedFilename()}`); await d.saveAs(p); dl.push(p);
  }
  return dl;
}
async function tool(slug, files, opts = {}) {
  await open(slug, files);
  if (opts.tweak) await opts.tweak();
  const r = await runAndWait(opts.timeout);
  if (r.error) return r;
  const names = await page.locator(".out-edit input").evaluateAll((els) => els.map((e) => e.value));
  const dl = await downloads(slug);
  const note = (await page.locator(".alert.info").allInnerTexts()).join(" ");
  return { names, dl, note };
}
const pages = async (p) => (await PDFDocument.load(fs.readFileSync(p))).getPageCount();

// ── fixtures ──
await page.goto(BASE + "/");
const fxs = await page.evaluate(async () => {
  const blob = (c, t, q) => new Promise((r) => c.toBlob(r, t, q));
  const arr = async (b) => Array.from(new Uint8Array(await b.arrayBuffer()));
  const text = document.createElement("canvas"); text.width = 1000; text.height = 320;
  let g = text.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, 1000, 320); g.fillStyle = "#000"; g.font = "bold 84px Arial"; g.fillText("Hello OCR 2026", 40, 130); g.font = "60px Arial"; g.fillText("Anyform private tools", 40, 250);
  const noisy = document.createElement("canvas"); noisy.width = 2400; noisy.height = 3200; g = noisy.getContext("2d");
  const id = g.createImageData(2400, 3200); for (let i = 0; i < id.data.length; i += 4) { const v = (Math.random() * 255) | 0; id.data[i] = v; id.data[i + 1] = (v * 0.7) | 0; id.data[i + 2] = 200; id.data[i + 3] = 255; } g.putImageData(id, 0, 0);
  const mk = async (c, col) => { const k = document.createElement("canvas"); k.width = 800; k.height = 500; const x = k.getContext("2d"); x.fillStyle = col; x.fillRect(0, 0, 800, 500); x.fillStyle = "#fff"; x.font = "bold 90px Arial"; x.fillText(c, 60, 280); return arr(await blob(k, "image/jpeg", 0.9)); };
  return { ocr: await arr(await blob(text, "image/png")), noisy: await arr(await blob(noisy, "image/jpeg", 0.95)), r: await mk("RED", "#c0392b"), g: await mk("GREEN", "#27ae60"), b: await mk("BLUE", "#2980b9") };
});
for (const [k, v] of Object.entries({ "ocr.png": fxs.ocr, "noisy.jpg": fxs.noisy, "red.jpg": fxs.r, "green.jpg": fxs.g, "blue.jpg": fxs.b })) fs.writeFileSync(path.join(fx, k), Buffer.from(v));

// ── 1. previews / rotate / drag reorder / rename ──
await open("jpg-to-pdf", ["red.jpg", "green.jpg", "blue.jpg"]);
await page.waitForSelector(".fc img", { timeout: 15000 });
ok("3 cards with image previews", (await page.locator(".fc:not(.add) img").count()) === 3);
await page.screenshot({ path: path.join(out, "cards.png") });
// rotate the first card
await page.locator(".fc").nth(0).hover();
await page.locator(".fc").nth(0).locator("button[aria-label^='Rotate']").click();
ok("card image rotated 90°", /rotate\(90deg\)/.test(await page.locator(".fc").nth(0).locator("img").getAttribute("style")));
// drag: move first card onto third
const before = await page.locator(".fc:not(.add) .fc-meta b").allInnerTexts();
await page.locator(".fc").nth(0).dragTo(page.locator(".fc").nth(2), { force: true });
await page.waitForTimeout(600);
let after = await page.locator(".fc:not(.add) .fc-meta b").allInnerTexts();
if (JSON.stringify(before) === JSON.stringify(after)) { await page.locator(".fc").nth(0).dragTo(page.locator(".fc").nth(1), { force: true }); await page.waitForTimeout(600); after = await page.locator(".fc:not(.add) .fc-meta b").allInnerTexts(); }
ok("drag reorder changed order", JSON.stringify(before) !== JSON.stringify(after), `${before} -> ${after}`);
// sort button
await page.getByRole("button", { name: /Sort A/ }).click();
const sorted = await page.locator(".fc:not(.add) .fc-meta b").allInnerTexts();
ok("Sort A–Z", JSON.stringify(sorted) === JSON.stringify([...sorted].sort()), sorted);
// keyboard reorder
await page.locator(".fc").nth(0).focus();
await page.keyboard.press("Alt+ArrowRight"); await page.waitForTimeout(300);
ok("Alt+→ reorders", (await page.locator(".fc:not(.add) .fc-meta b").first().innerText()) !== sorted[0]);
// lightbox
await page.locator(".fc-media").nth(1).click();
ok("click opens lightbox", await page.locator(".lb").count() === 1);
await page.waitForSelector(".lb-stage img", { timeout: 8000 });
await page.screenshot({ path: path.join(out, "lightbox.png") });
await page.keyboard.press("ArrowRight"); await page.keyboard.press("Escape");
ok("Esc closes lightbox", await page.locator(".lb").count() === 0);
// run with Ctrl+Enter
await page.keyboard.press("Control+Enter");
await page.waitForSelector(".panel.done", { timeout: 30000 });
ok("Ctrl+Enter converts", true);
// PDF result preview strip + rename
await page.waitForFunction(() => document.querySelectorAll(".strip img").length >= 3, null, { timeout: 20000 }).catch(() => {});
ok("result shows 3 page previews", (await page.locator(".strip img").count()) === 3);
await page.locator(".out-edit input").fill("my scan");
ok("rename input width fits text (no stretch)", (await page.locator(".out-edit").evaluate((e) => e.getBoundingClientRect().width)) < 300, await page.locator(".out-edit").evaluate((e) => Math.round(e.getBoundingClientRect().width)));
await page.screenshot({ path: path.join(out, "result-rename.png") });
const [d] = await Promise.all([page.waitForEvent("download"), page.locator(".outs a[download]").click()]);
ok("download uses renamed file", d.suggestedFilename() === "my scan.pdf", d.suggestedFilename());
const p1 = path.join(out, "renamed.pdf"); await d.saveAs(p1);
ok("pdf has 3 pages", (await pages(p1)) === 3);
// rotated first image: after sort+move the rotated one may not be first; just verify a rotated page exists (landscape 800x500 rotated → portrait)
const doc = await PDFDocument.load(fs.readFileSync(p1));
ok("rotation baked into pdf", doc.getPages().some((pg) => pg.getSize().height > pg.getSize().width) && doc.getPages().some((pg) => pg.getSize().width > pg.getSize().height));
await page.locator(".strip button").first().click();
ok("strip click opens viewer", await page.locator(".lb").count() === 1);
await page.keyboard.press("Escape");

// ── 2. netbadge, csp ──
ok("net badge shows 0 uploads", /0 uploads/.test(await page.locator(".netbadge").first().innerText()));
const blocked = await page.evaluate(async () => { try { await fetch("https://example.com/", { mode: "no-cors" }); return false; } catch { return true; } });
ok("CSP blocks connections to other sites", blocked);

// ── 3. target size ──
let r = await tool("compress-image", ["noisy.jpg"], { tweak: async () => { await page.locator("#opt-target").selectOption("100"); } });
const sz = r.dl ? fs.statSync(r.dl[0]).size : 0;
ok("compress-image target ≤100 KB", !r.error && sz <= 102400 && sz > 10000, r.error || `${sz} bytes; ${r.note}`);
ok("compare slider shown", await page.locator(".cmpx-box").count() === 1);
await page.screenshot({ path: path.join(out, "compare.png") });
// live estimate
await open("compress-image", ["noisy.jpg"]);
await page.waitForSelector(".est b", { timeout: 20000 });
await page.waitForFunction(() => !document.querySelector(".est.busy"), null, { timeout: 30000 });
ok("live size estimate appears", /≈/.test(await page.locator(".est b").innerText()), await page.locator(".est").innerText());

// pdf target (photo pdf)
{
  const d1 = await PDFDocument.create(); const im = await d1.embedJpg(fs.readFileSync(path.join(fx, "noisy.jpg"))); d1.addPage([595, 842]).drawImage(im, { x: 0, y: 0, width: 595, height: 842 });
  fs.writeFileSync(path.join(fx, "photo2.pdf"), await d1.save());
  r = await tool("compress-pdf", ["photo2.pdf"], { tweak: async () => { await page.locator("#opt-target").selectOption("200"); }, timeout: 120000 });
  const s2 = r.dl ? fs.statSync(r.dl[0]).size : 0;
  ok("compress-pdf target ≤200 KB", !r.error && s2 <= 204800, r.error || `${s2} bytes; ${r.note}`);
}

// ── 4. OCR ──
r = await tool("ocr-to-text", ["ocr.png"], { timeout: 180000 });
const txt = r.dl ? fs.readFileSync(r.dl[0], "utf8") : "";
ok("OCR → text recognizes words", !r.error && /hello/i.test(txt) && /2026/.test(txt), r.error || txt.replace(/\n/g, " "));
r = await tool("ocr-pdf", ["ocr.png"], { timeout: 180000 });
ok("OCR PDF produced", !r.error && r.dl?.length === 1, r.error || r.note);
if (r.dl) {
  const searchable = r.dl[0];
  const t2 = await tool("pdf-to-text", [searchable]);
  const tt = t2.dl ? fs.readFileSync(t2.dl[0], "utf8") : "";
  ok("searchable PDF text layer extractable", !t2.error && /hello/i.test(tt), t2.error || tt.replace(/\n/g, " "));
}

// ── 5. protect / unlock ──
r = await tool("protect-pdf", ["a.pdf"], { tweak: async () => { await page.locator("#opt-password").fill("secret123"); } });
ok("protect-pdf runs", !r.error && r.dl?.length === 1, r.error || "");
if (r.dl) {
  const protectedPath = r.dl[0];
  let enc = false; try { await PDFDocument.load(fs.readFileSync(protectedPath)); } catch (e) { enc = /encrypt/i.test(String(e.message)); }
  ok("protected file is encrypted", enc);
  const bad = await tool("unlock-pdf", [protectedPath], { tweak: async () => { await page.locator("#opt-password").fill("wrong"); } });
  ok("unlock with wrong password fails cleanly", !!bad.error && /password/i.test(bad.error), bad.error || "no error");
  const good = await tool("unlock-pdf", [protectedPath], { tweak: async () => { await page.locator("#opt-password").fill("secret123"); } });
  ok("unlock with right password", !good.error && (await pages(good.dl[0])) === 3, good.error || "");
}

// ── 6. sign / edit / redact ──
await open("sign-pdf", ["a.pdf"]);
await page.waitForSelector(".ed-over", { timeout: 20000 });
await page.waitForTimeout(800);
await page.screenshot({ path: path.join(out, "sign-editor.png") });
await page.getByRole("button", { name: /Signature/ }).click();
const pad = await page.locator(".sig-pad canvas").boundingBox();
await page.mouse.move(pad.x + 80, pad.y + 150); await page.mouse.down();
for (let i = 0; i < 25; i++) await page.mouse.move(pad.x + 80 + i * 14, pad.y + 150 + Math.sin(i / 2) * 50);
await page.mouse.up();
await page.screenshot({ path: path.join(out, "sign-modal.png") });
await page.getByRole("button", { name: "Use signature" }).click();
await page.waitForSelector(".ann.image", { timeout: 5000 });
ok("signature placed on page", await page.locator(".ann.image").count() === 1);
// drag it
const a0 = await page.locator(".ann.image").boundingBox();
await page.mouse.move(a0.x + a0.width / 2, a0.y + a0.height / 2); await page.mouse.down(); await page.mouse.move(a0.x + a0.width / 2 + 120, a0.y + a0.height / 2 + 160, { steps: 6 }); await page.mouse.up();
const a1 = await page.locator(".ann.image").boundingBox();
ok("signature can be dragged", Math.abs(a1.x - a0.x) > 60 && Math.abs(a1.y - a0.y) > 60, `${Math.round(a1.x - a0.x)},${Math.round(a1.y - a0.y)}`);
await page.getByRole("button", { name: /Date/ }).click();
ok("date text added", await page.locator(".ann.text").count() === 1);
await page.screenshot({ path: path.join(out, "sign-placed.png") });
await page.locator("button.run").click(); await page.waitForSelector(".panel.done, .alert.bad", { timeout: 60000 });
ok("sign-pdf saved", !(await page.locator(".alert.bad").count()));
const dlS = await downloads("sign");
const sd = await PDFDocument.load(fs.readFileSync(dlS[0]));
ok("signed pdf same page count & larger than original", sd.getPageCount() === 3 && fs.statSync(dlS[0]).size > fs.statSync(path.join(fx, "a.pdf")).size);
await page.screenshot({ path: path.join(out, "sign-done.png") });

await open("edit-pdf", ["a.pdf"]);
await page.waitForSelector(".ed-over"); await page.waitForTimeout(800);
const ov = await page.locator(".ed-over").boundingBox();
await page.mouse.click(ov.x + ov.width * 0.2, ov.y + ov.height * 0.7);
await page.keyboard.type("ANYFORM EDIT TEST"); await page.locator(".ed-hint").click();
ok("text annotation typed", /ANYFORM EDIT TEST/.test(await page.locator(".ann-text").first().innerText()));
await page.getByRole("button", { name: /Highlight/ }).click();
await page.mouse.move(ov.x + ov.width * 0.1, ov.y + ov.height * 0.2); await page.mouse.down(); await page.mouse.move(ov.x + ov.width * 0.6, ov.y + ov.height * 0.25, { steps: 5 }); await page.mouse.up();
ok("highlight drawn", await page.locator(".ann.rect").count() === 1);
await page.getByRole("button", { name: /Draw/ }).click();
await page.mouse.move(ov.x + 100, ov.y + 600); await page.mouse.down(); await page.mouse.move(ov.x + 300, ov.y + 640, { steps: 8 }); await page.mouse.up();
ok("freehand ink drawn", await page.locator("svg.ann-ink").count() === 1);
await page.screenshot({ path: path.join(out, "edit-editor.png") });
await page.keyboard.press("Control+z");
ok("undo removes last drawing", await page.locator("svg.ann-ink").count() === 0);
await page.locator("button.run").click(); await page.waitForSelector(".panel.done, .alert.bad", { timeout: 60000 });
const dlE = await downloads("edit");
const te = await tool("pdf-to-text", [dlE[0]]);
ok("edited PDF contains typed text", !te.error && /ANYFORM\s+EDIT\s+TEST/.test(fs.readFileSync(te.dl[0], "utf8")), te.error || "");

await open("redact-pdf", ["a.pdf"]);
await page.waitForSelector(".ed-over"); await page.waitForTimeout(800);
const ov2 = await page.locator(".ed-over").boundingBox();
await page.mouse.move(ov2.x + ov2.width * 0.03, ov2.y + ov2.height * 0.03); await page.mouse.down(); await page.mouse.move(ov2.x + ov2.width * 0.97, ov2.y + ov2.height * 0.7, { steps: 6 }); await page.mouse.up();
ok("redact box drawn", await page.locator(".ann.redact").count() === 1);
await page.screenshot({ path: path.join(out, "redact-editor.png") });
await page.locator("button.run").click(); await page.waitForSelector(".panel.done, .alert.bad", { timeout: 60000 });
const dlR = await downloads("redact");
const tr = await tool("pdf-to-text", [dlR[0]]);
const rt = tr.dl ? fs.readFileSync(tr.dl[0], "utf8") : "";
ok("redacted page text removed, other pages intact", !tr.error && !/on page 1\./.test(rt) && /on page 2\./.test(rt), tr.error || rt.slice(0, 80).replace(/\n/g, " "));

// ── 7. PowerPoint round trip ──
r = await tool("pdf-to-pptx", ["a.pdf"], { tweak: async () => { await page.getByRole("radio", { name: /Editable text/ }).click(); } });
ok("pdf-to-pptx (text) runs", !r.error && r.dl?.[0].endsWith(".pptx"), r.error || "");
let pptxText = "";
if (r.dl) {
  const z = await JSZip.loadAsync(fs.readFileSync(r.dl[0]));
  const names = Object.keys(z.files);
  ok("pptx has 3 slides + master/theme", names.filter((n) => /slides\/slide\d+\.xml$/.test(n)).length === 3 && names.includes("ppt/theme/theme1.xml"));
  pptxText = await z.file("ppt/slides/slide1.xml").async("string");
  const wellFormed = await page.evaluate((x) => !new DOMParser().parseFromString(x, "application/xml").querySelector("parsererror"), pptxText);
  ok("slide xml well-formed", wellFormed);
  const back = await tool("pptx-to-pdf", [r.dl[0]]);
  ok("pptx → pdf round trip (3 pages)", !back.error && (await pages(back.dl[0])) === 3, back.error || "");
  if (back.dl) { const bt = await tool("pdf-to-text", [back.dl[0]]); ok("round-trip text preserved", !bt.error && /Doc A/.test(fs.readFileSync(bt.dl[0], "utf8")), bt.error || ""); }
}
r = await tool("pdf-to-pptx", ["a.pdf"]);
ok("pdf-to-pptx (image) runs", !r.error && r.dl?.[0].endsWith(".pptx"), r.error || "");
if (r.dl) { const back = await tool("pptx-to-pdf", [r.dl[0]]); ok("image pptx → pdf (3 pages)", !back.error && (await pages(back.dl[0])) === 3, back.error || ""); }

// ── 8. repair/compress lossless via qpdf ──
r = await tool("repair-pdf", ["a.pdf"]);
ok("repair-pdf (qpdf)", !r.error && (await pages(r.dl[0])) === 3, r.error || r.note);
r = await tool("compress-pdf", ["a.pdf"], { tweak: async () => { await page.getByRole("radio", { name: "Lossless" }).click(); } });
ok("compress-pdf lossless", !r.error, r.error || r.note);

// ── 9. palette recent, offline ──
await page.goto(BASE + "/");
await openPalette(page);
ok("palette shows Recent", /recent/i.test(await page.locator(".pal-label").innerText()), await page.locator(".pal-label").innerText());
await page.keyboard.press("Escape");
await page.goto(BASE + "/tools/jpg-to-pdf"); await page.waitForSelector("input[type=file]", { state: "attached" }); await hydrated(page);
await page.evaluate(async () => { await navigator.serviceWorker.ready; });
await page.reload(); await page.waitForTimeout(1500); await hydrated(page);
ok("service worker controls page", await page.evaluate(() => !!navigator.serviceWorker.controller));
await page.setInputFiles("input[type=file]", [abs("red.jpg")]); await page.locator("button.run").click(); await page.waitForSelector(".panel.done", { timeout: 30000 });
await ctx.setOffline(true);
await page.goto(BASE + "/tools/jpg-to-pdf", { waitUntil: "domcontentloaded" });
await page.waitForSelector("input[type=file]", { state: "attached", timeout: 15000 }); await hydrated(page);
await page.setInputFiles("input[type=file]", [abs("green.jpg")]); await page.locator("button.run").click();
let offlineOk = true; try { await page.waitForSelector(".panel.done", { timeout: 20000 }); } catch { offlineOk = false; }
ok("works fully OFFLINE after first use", offlineOk);
await ctx.setOffline(false);

// ── 10. visuals ──
await page.goto(BASE + "/"); await page.waitForTimeout(1200);
await page.screenshot({ path: path.join(out, "home.png") });
await hydrated(page, ".hdr-search");
await page.locator(".theme button[aria-label='Dark theme']").click();
await page.goto(BASE + "/tools/jpg-to-pdf"); await hydrated(page);
await page.setInputFiles("input[type=file]", ["red.jpg", "green.jpg", "blue.jpg"].map(abs)); await page.waitForSelector(".fc img"); await page.waitForTimeout(600);
await page.screenshot({ path: path.join(out, "cards-dark.png") });
const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: "dark", acceptDownloads: true });
const mp = await mob.newPage();
await mp.goto(BASE + "/tools/jpg-to-pdf"); await hydrated(mp); await mp.setInputFiles("input[type=file]", ["red.jpg", "green.jpg", "blue.jpg"].map(abs)); await mp.waitForSelector(".fc img"); await mp.waitForTimeout(600);
await mp.screenshot({ path: path.join(out, "mobile-cards.png"), fullPage: true });
ok("no horizontal overflow (mobile tool w/ files)", !(await mp.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
await mp.goto(BASE + "/tools/sign-pdf"); await hydrated(mp); await mp.setInputFiles("input[type=file]", [abs("a.pdf")]); await mp.waitForSelector(".ed-over"); await mp.waitForTimeout(700);
ok("no horizontal overflow (mobile editor)", !(await mp.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), await mp.evaluate(() => [...document.querySelectorAll("body *")].filter((e) => e.getBoundingClientRect().right > innerWidth + 1 && getComputedStyle(e).position !== "fixed").slice(0, 4).map((e) => e.tagName + "." + String(e.className).slice(0, 30) + " " + Math.round(e.getBoundingClientRect().right)).join(", ")));
await mp.screenshot({ path: path.join(out, "mobile-editor.png") });

const fails = results.filter((x) => x[0] === "FAIL");
console.log(`\n${results.length - fails.length}/${results.length} passed`);
console.log("FAILED:", fails.map((f) => f[1]));
console.log("ERRORS:", errors.slice(0, 12));
await browser.close();
process.exit(fails.length ? 1 : 0);
