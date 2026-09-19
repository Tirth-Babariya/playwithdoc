// End-to-end tests — photo & signature presets, fillable forms, Compare PDFs, PDF to Excel, Recipes.
// Run against a production build:  npm run build && npm start
//   BASE_URL=http://localhost:3000 node tests/e2e/extras.test.mjs
import fs from "node:fs";
import path from "node:path";
import { BASE, FIXTURES, OUT, hydrated, launch, makeFixtures, openPalette, require } from "./helpers.mjs";

const { PDFDocument } = require("pdf-lib");
const JSZip = require("jszip");
const fx = FIXTURES, out = OUT;

const results = [];
const ok = (name, cond, detail = "") => { results.push(!!cond); console.log(cond ? "PASS" : "FAIL", "|", name, "|", String(detail).slice(0, 160)); };

/** Width × height of a JPEG, read from its header. */
function jpegSize(buf) {
  let o = 2;
  while (o < buf.length) {
    if (buf[o] !== 0xff) { o++; continue; }
    const m = buf[o + 1];
    if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return [buf.readUInt16BE(o + 7), buf.readUInt16BE(o + 5)];
    o += 2 + buf.readUInt16BE(o + 2);
  }
  return [0, 0];
}

const browser = await launch();
await makeFixtures(browser);
const ctx = await browser.newContext({ viewport: { width: 1360, height: 1300 }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

const abs = (f) => (path.isAbsolute(f) ? f : path.join(fx, f));

async function open(slug, files) {
  await page.goto(`${BASE}/tools/${slug}`);
  await page.waitForSelector("input[type=file]", { state: "attached" });
  await hydrated(page);
  if (files?.length) await page.setInputFiles("input[type=file]", files.map(abs));
}

/** Presses the main button, waits for the result and downloads every output. */
async function finish(timeout = 90000) {
  await page.locator("button.run").click();
  await page.waitForSelector(".panel.done, .alert.bad", { timeout });
  if (await page.locator(".alert.bad").count()) return { error: await page.locator(".alert.bad").first().innerText() };
  const links = page.locator(".outs a[download]");
  const files = [];
  for (let i = 0; i < (await links.count()); i++) {
    const [d] = await Promise.all([page.waitForEvent("download"), links.nth(i).click()]);
    const p = path.join(out, `x_${Date.now()}_${i}_${d.suggestedFilename()}`);
    await d.saveAs(p);
    files.push(p);
  }
  const note = (await page.locator(".alert.info").allInnerTexts()).join(" ");
  return { files, note };
}

/* ───────── Photo & signature presets ───────── */
await open("passport-photo", ["red.jpg"]);
await page.waitForSelector(".crop-frame canvas", { timeout: 20000 });
const box = await page.locator(".crop-frame").boundingBox();
ok("passport frame has the 35:45 shape", Math.abs(box.width / box.height - 413 / 531) < 0.02, `${Math.round(box.width)}×${Math.round(box.height)}`);
await page.mouse.move(box.x + 60, box.y + 60); await page.mouse.down(); await page.mouse.move(box.x + 90, box.y + 80, { steps: 4 }); await page.mouse.up();
let r = await finish();
let buf = r.files ? fs.readFileSync(r.files[0]) : Buffer.alloc(0);
ok("passport photo is exactly 413×531 px", !r.error && jpegSize(buf).join("x") === "413x531", r.error || jpegSize(buf).join("x"));
ok("passport photo is under 200 KB", buf.length > 0 && buf.length <= 200 * 1024, `${Math.round(buf.length / 1024)} KB`);
await page.screenshot({ path: path.join(out, "passport-result.png") });

await open("signature-resizer", ["noisy.jpg"]);
await page.waitForSelector(".crop-frame canvas", { timeout: 30000 });
r = await finish();
buf = r.files ? fs.readFileSync(r.files[0]) : Buffer.alloc(0);
ok("signature is 140×60 px", !r.error && jpegSize(buf).join("x") === "140x60", r.error || jpegSize(buf).join("x"));
ok("signature is under 20 KB (even from a noisy photo)", buf.length > 0 && buf.length <= 20 * 1024, `${(buf.length / 1024).toFixed(1)} KB`);

await open("photo-resizer", ["green.jpg"]);
await page.waitForSelector(".crop-frame canvas", { timeout: 20000 });
await page.locator("#opt-preset").selectOption("custom");
await page.locator("#opt-w").fill("300"); await page.locator("#opt-h").fill("200"); await page.locator("#opt-maxKb").fill("15");
await page.waitForTimeout(400);
const cbox = await page.locator(".crop-frame").boundingBox();
ok("custom size reshapes the frame (300:200)", Math.abs(cbox.width / cbox.height - 1.5) < 0.03, `${Math.round(cbox.width)}×${Math.round(cbox.height)}`);
r = await finish();
buf = r.files ? fs.readFileSync(r.files[0]) : Buffer.alloc(0);
ok("custom photo is 300×200 and under 15 KB", !r.error && jpegSize(buf).join("x") === "300x200" && buf.length <= 15 * 1024, r.error || `${jpegSize(buf).join("x")} ${(buf.length / 1024).toFixed(1)} KB`);

/* ───────── Fillable forms ───────── */
await open("fill-pdf-form", ["form.pdf"]);
await page.waitForSelector(".form-row", { timeout: 20000 });
ok("form fields are listed (3)", (await page.locator(".form-row").count()) === 3);
await page.locator("#ff-full_name").fill("Tirth Babariya");
await page.locator("#ff-agree_terms").click();
await page.locator("#ff-country").selectOption("France");
ok("progress shows 3 of 3 filled", /3\s*of\s*3/.test(await page.locator(".form-count").innerText()), await page.locator(".form-count").innerText());
r = await finish();
if (r.files) {
  const form = (await PDFDocument.load(fs.readFileSync(r.files[0]))).getForm();
  ok("text field was filled", form.getTextField("full_name").getText() === "Tirth Babariya");
  ok("check box was ticked", form.getCheckBox("agree_terms").isChecked());
  ok("drop-down was set", form.getDropdown("country").getSelected()[0] === "France");
} else ok("fill form saved", false, r.error);

await open("fill-pdf-form", ["a.pdf"]);
await page.waitForSelector(".form-empty", { timeout: 20000 });
ok("a flat PDF explains it has no fields", /no fillable fields/i.test(await page.locator(".form-empty").innerText()));
await page.getByRole("button", { name: /Open in Edit PDF/ }).click();
await page.waitForURL("**/tools/edit-pdf");
await page.waitForSelector(".ed-over", { timeout: 20000 });
ok("…and hands the file to Edit PDF", true);

/* ───────── Compare PDFs ───────── */
await open("compare-pdf", ["a.pdf", "a-edited.pdf"]);
await page.waitForSelector(".fc:not(.add)");
ok("cards are labelled A and B", (await page.locator(".fc-idx").allInnerTexts()).join("") === "AB", (await page.locator(".fc-idx").allInnerTexts()).join(","));
ok("no 'add more' once two PDFs are in", (await page.locator(".fc.add").count()) === 0);
r = await finish();
ok("compare finds the changed page", !r.error && /1 of 3 pages? differ/i.test(r.note ?? ""), r.error || r.note);
if (r.files) {
  const report = r.files.find((f) => f.endsWith(".pdf")), changes = r.files.find((f) => f.endsWith(".txt"));
  ok("report has a summary + the changed page (2 pages)", (await PDFDocument.load(fs.readFileSync(report))).getPageCount() === 2);
  const txt = fs.readFileSync(changes, "utf8");
  ok("changes list shows what was added/removed", /Removed/.test(txt) && /EDITED/.test(txt) && /Page 2/.test(txt));
}
await open("compare-pdf", ["a.pdf", "a.pdf"]);
await page.waitForSelector(".fc:not(.add)");
r = await finish();
ok("identical files are reported as identical", !r.error && /no differences|identical/i.test(r.note ?? ""), r.error || r.note);

/* ───────── PDF to Excel ───────── */
await open("pdf-to-excel", ["table.pdf"]);
r = await finish();
if (r.files) {
  const z = await JSZip.loadAsync(fs.readFileSync(r.files[0]));
  const sheet = await z.file("xl/worksheets/sheet1.xml").async("string");
  const strings = z.file("xl/sharedStrings.xml") ? await z.file("xl/sharedStrings.xml").async("string") : "";
  ok("spreadsheet contains the table text", /Item/.test(sheet + strings) && /Paper/.test(sheet + strings), (sheet + strings).slice(0, 80));
  ok("numbers became real numbers (12, 1.5, 8.25)", /<v>12<\/v>/.test(sheet) && /<v>1\.5<\/v>/.test(sheet) && /<v>8\.25<\/v>/.test(sheet));
} else ok("pdf-to-excel produced a file", false, r.error);

/* ───────── Recipes ───────── */
await page.goto(`${BASE}/recipes`);
await page.waitForSelector(".rc-tpl");
await hydrated(page, ".rc-tpl");
ok("Recipes link is in the navbar", (await page.locator(".hdr-nav a", { hasText: "Recipes" }).count()) === 1);
await page.locator(".rc-tpl", { hasText: "Email-ready PDF" }).click();
ok("template loads two steps", (await page.locator(".rc-step").count()) === 2);
await page.setInputFiles(".rc input[type=file]", [abs("a.pdf"), abs("b.pdf")]);
await page.waitForSelector(".rc-files li");
await page.locator(".rc-run button.run").click();
await page.waitForSelector(".rc-done, .alert.bad", { timeout: 90000 });
ok("recipe ran to the end", (await page.locator(".rc-done").count()) === 1, (await page.locator(".alert.bad").allInnerTexts()).join(" "));
if (await page.locator(".rc-done").count()) {
  const [d] = await Promise.all([page.waitForEvent("download"), page.locator(".rc-done .outs a[download]").first().click()]);
  const p = path.join(out, `recipe_${d.suggestedFilename()}`);
  await d.saveAs(p);
  ok("merge → compress kept all 5 pages", (await PDFDocument.load(fs.readFileSync(p))).getPageCount() === 5);
}
await page.locator(".rc-save input").fill("My test recipe");
await page.getByRole("button", { name: /^Save$/ }).click();
await page.reload();
await page.waitForSelector(".rc-tpl");
ok("saved recipe survives a reload", /My test recipe/.test(await page.locator(".rc-saved").innerText()));

await page.goto(BASE + "/");
await openPalette(page);
await page.keyboard.type("recipe");
await page.waitForTimeout(300);
ok("Ctrl+K finds Recipes", /Recipes/.test(await page.locator(".pal-item").first().innerText()));

/* ───────── How-to guides ───────── */
await page.goto(`${BASE}/guides`);
ok("guides index lists all 16 guides", (await page.locator(".guide-card").count()) === 16, await page.locator(".guide-card").count());
await page.goto(`${BASE}/guides/reduce-pdf-size-under-200kb`);
ok("guide shows its 5 steps", (await page.locator(".guide-steps li").count()) === 5);
ok("guide leads to the tool", (await page.locator(".guide-short a.btn").getAttribute("href")) === "/tools/compress-pdf");
const ld = await page.locator('script[type="application/ld+json"]').first().innerText();
ok("guide has HowTo structured data for search engines", /"@type":"HowTo"/.test(ld) && /"@type":"HowToStep"/.test(ld));
await page.goto(`${BASE}/tools/compress-pdf`);
ok("the tool page links to its guide", (await page.locator('a[href="/guides/reduce-pdf-size-under-200kb"]').count()) >= 1);

/* ───────── Prove it ───────── */
await page.goto(`${BASE}/prove-it`);
await page.waitForSelector(".proof-tile");
await hydrated(page, ".proof-demo button");
const tiles = await page.locator(".proof-tile b").allInnerTexts();
ok("prove-it: 0 requests to other websites, 0 carrying data", tiles[0] === "0" && tiles[1] === "0", tiles.join(","));
await page.setInputFiles(".proof input[type=file]", abs("a.pdf"));
await page.waitForSelector(".proof-result", { timeout: 15000 });
const hash = await page.locator(".proof-result .mono").innerText();
ok("prove-it: the file is fingerprinted (SHA-256) inside the tab", /^[0-9a-f]{64}$/.test(hash.trim()), hash.slice(0, 20));
await page.getByRole("button", { name: /Try to send data to another site/ }).click();
await page.waitForSelector(".good-alert, .proof-demo .alert.info", { timeout: 10000 });
ok("prove-it: the browser blocks sending data to another site", (await page.locator(".good-alert").count()) === 1, (await page.locator(".proof-demo .alert").allInnerTexts()).join(" "));
const after = await page.locator(".proof-tile b").allInnerTexts();
ok("prove-it: the upload counter is still 0 afterwards", after[0] === "0" && after[1] === "0", after.join(","));
await page.goto(BASE + "/");
ok("the home page privacy pill links to the proof", (await page.locator("a.pill-link").getAttribute("href")) === "/prove-it");
await openPalette(page);
await page.keyboard.type("prove");
await page.waitForTimeout(300);
ok("Ctrl+K finds the Prove it page", /Prove it/.test(await page.locator(".pal-item").first().innerText()));

console.log(`\n${results.filter(Boolean).length}/${results.length} passed`, errors.length ? errors.slice(0, 5) : "");
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
