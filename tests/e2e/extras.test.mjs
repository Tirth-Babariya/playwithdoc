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
  await page.locator("button.run").click({ timeout: 2500 }).catch(() => {}); // tools that start on their own have no button
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

/* ───────── Markdown family ───────── */
await open("md-to-word", ["notes.md"]);
r = await finish();
let docxPath = "";
if (r.files) {
  docxPath = r.files[0];
  const z = await JSZip.loadAsync(fs.readFileSync(docxPath));
  const xml = await z.file("word/document.xml").async("string");
  ok("Markdown → Word: real Word headings, table, list and link", /Heading1/.test(xml) && /Project Notes/.test(xml) && /<w:tbl>/.test(xml) && /<w:numPr>/.test(xml) && /<w:hyperlink/.test(xml), xml.length);
  const wellFormed = await page.evaluate((x) => !new DOMParser().parseFromString(x, "application/xml").querySelector("parsererror"), xml);
  ok("Markdown → Word: document.xml is well-formed XML", wellFormed);
  for (const part of ["word/styles.xml", "word/numbering.xml"]) {
    const ok2 = await page.evaluate((x) => !new DOMParser().parseFromString(x, "application/xml").querySelector("parsererror"), await z.file(part).async("string"));
    ok(`Markdown → Word: ${part} is well-formed XML`, ok2);
  }
} else ok("Markdown → Word produced a file", false, r.error);

if (docxPath) {
  await open("word-to-md", [docxPath]);
  r = await finish();
  const md = r.files ? fs.readFileSync(r.files[0], "utf8") : "";
  ok("Word → Markdown: heading, bold, list and table survive a round trip", /^# Project Notes/m.test(md) && /\*\*bold\*\*/.test(md) && /^- First item/m.test(md) && /\| Name \| Qty \|/.test(md) && /\| ?-+/.test(md), r.error || md.slice(0, 120).replace(/\n/g, " ⏎ "));
  ok("Word → Markdown: inline code and code block survive", /`inline code`/.test(md) && /```/.test(md) && /const answer = 42/.test(md), md.slice(-160).replace(/\n/g, " ⏎ "));
}

await open("md-to-pdf", ["notes.md"]);
r = await finish();
if (r.files) {
  ok("Markdown → PDF made a PDF", (await PDFDocument.load(fs.readFileSync(r.files[0]))).getPageCount() >= 1);
  await open("pdf-to-text", [r.files[0]]);
  const t = await finish();
  const text = t.files ? fs.readFileSync(t.files[0], "utf8") : "";
  ok("Markdown → PDF: the text is in the PDF (heading, list, table)", /Project Notes/.test(text) && /First item/.test(text) && /Pen/.test(text), t.error || text.slice(0, 100).replace(/\n/g, " "));
} else ok("Markdown → PDF produced a file", false, r.error);

await open("md-to-html", ["notes.md"]);
r = await finish();
const html = r.files ? fs.readFileSync(r.files[0], "utf8") : "";
ok("Markdown → HTML: a full page with heading and table", /<h1[^>]*>Project Notes/.test(html) && /<table>/.test(html) && /<!doctype html>/i.test(html), r.error || html.slice(0, 60));

await open("md-to-txt", ["notes.md"]);
r = await finish();
const plain = r.files ? fs.readFileSync(r.files[0], "utf8") : "";
ok("Markdown → Text: words kept, formatting marks removed", /PROJECT NOTES/.test(plain) && !/\*\*|^#/m.test(plain) && /bold/.test(plain), r.error || plain.slice(0, 80).replace(/\n/g, " "));

await open("html-to-md", [path.join(fx, "page.html")]);
r = await finish();
const back = r.files ? fs.readFileSync(r.files[0], "utf8") : "";
ok("HTML → Markdown: heading, list and link", /^# Hello/m.test(back) && /^- one/m.test(back) && /\[site\]\(https:\/\/example\.com\/?\)/.test(back), r.error || back.slice(0, 100).replace(/\n/g, " "));

/* ───────── How-to guides ───────── */
await page.goto(`${BASE}/guides`);
ok("guides index lists all 21 guides", (await page.locator(".guide-card").count()) === 21, await page.locator(".guide-card").count());
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

/* ───────── QR code maker + reader ───────── */
const canvasPng = async (file) => {
  await page.waitForSelector(".qr-canvas canvas", { timeout: 20000 });
  await page.waitForTimeout(400);
  const url = await page.locator(".qr-canvas canvas").evaluate((c) => c.toDataURL("image/png"));
  fs.writeFileSync(file, Buffer.from(url.split(",")[1], "base64"));
  return file;
};
await page.goto(`${BASE}/tools/qr-code-generator`);
await hydrated(page, ".qr-kinds button");
await page.getByLabel("Web address").fill("https://playwithdoc.example/hello?x=1");
const qrLink = await canvasPng(path.join(out, "qr-link.png"));
const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "PNG" }).click()]);
ok("QR maker downloads a PNG", /\.png$/.test(dl.suggestedFilename()), dl.suggestedFilename());
const [dsvg] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "SVG" }).click()]);
const svgPath = path.join(out, "qr.svg"); await dsvg.saveAs(svgPath);
const svgText = fs.readFileSync(svgPath, "utf8");
ok("QR maker downloads a sharp SVG", /<svg[^>]*viewBox/.test(svgText) && /<rect/.test(svgText));
ok("QR maker offers ready-made designs", (await page.locator(".qr-tpl").count()) >= 8, await page.locator(".qr-tpl").count());
await page.locator(".qr-tpl", { hasText: "Ocean" }).click();
ok("QR maker: picking a design applies its colours", (await page.locator("#qr-fg").inputValue()) === "#075985" && /Ocean/.test(await page.locator(".qr-tpl.on").innerText()), await page.locator("#qr-fg").inputValue());
const qrOcean = await canvasPng(path.join(out, "qr-ocean.png"));
await page.locator(".qr-tpl", { hasText: "Classic" }).click();
await page.getByLabel("Name or title").fill("Scan me — Guest Wi-Fi");
await page.getByRole("button", { name: "Above the code" }).click();
await page.getByRole("button", { name: "Circle" }).click();
await page.getByRole("button", { name: "Rounded", exact: true }).nth(2).click();
const styledDims = await page.locator(".qr-canvas canvas").evaluate((c) => [c.width, c.height]);
ok("QR maker: a name adds a band above the code", styledDims[1] > styledDims[0], styledDims.join("x"));
const qrStyled = await canvasPng(path.join(out, "qr-styled.png"));
const svgStyled = await (async () => { const [d] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "SVG" }).click()]); const f = path.join(out, "qr-styled.svg"); await d.saveAs(f); return fs.readFileSync(f, "utf8"); })();
ok("QR maker: SVG keeps the name and the round corner markers", /Scan me/.test(svgStyled) && /fill-rule="evenodd"/.test(svgStyled) && /A/.test(svgStyled));
await page.getByRole("button", { name: "Square", exact: true }).nth(1).click();
await page.getByRole("button", { name: "Square", exact: true }).nth(2).click();
await page.getByLabel("Name or title").fill("");
await page.getByRole("tab", { name: "Wi-Fi" }).click();
await page.getByLabel("Network name (SSID)").fill("Cafe Guest");
await page.getByLabel("Password").fill("pa;ss:word1");
const qrWifi = await canvasPng(path.join(out, "qr-wifi.png"));
await page.locator("#qr-fg").fill("#ffffff");
await page.locator("#qr-bg").fill("#f8f8f8");
ok("QR maker warns when contrast is too low", (await page.locator(".meta-note").count()) === 1, await page.locator(".meta-note").allInnerTexts());

await page.goto(`${BASE}/tools/qr-code-reader`);
await hydrated(page, "input[type=file]");
await page.setInputFiles("input[type=file]", [qrLink, qrWifi, qrStyled, qrOcean]);
await page.waitForSelector(".qr-hit:nth-child(4)", { timeout: 30000 });
const hitsText = (await page.locator(".qr-hit").allInnerTexts()).join(" | ");
ok("QR reader reads a QR with round corner markers, a name and rounded corners", (hitsText.match(/playwithdoc\.example\/hello\?x=1/g) || []).length >= 2, hitsText.slice(0, 120));
ok("QR reader reads back the link the maker made", /playwithdoc\.example\/hello\?x=1/.test(hitsText), hitsText.slice(0, 120));
ok("QR reader understands a Wi-Fi code (and hides the password)", /Cafe Guest/.test(hitsText) && !/pa;ss:word1/.test(hitsText) && /Wi-Fi network/.test(hitsText), hitsText.slice(0, 160));
await page.locator(".qr-eye").first().click();
ok("QR reader reveals the password on request", /pa;ss:word1/.test(await page.locator(".qr-hits").innerText()));
await page.setInputFiles("input[type=file]", [path.join(fx, "red.jpg")]);
await page.waitForSelector(".qr-hit.miss", { timeout: 20000 });
ok("QR reader says so when an image has no QR code", (await page.locator(".qr-hit.miss").count()) === 1);

/* ───────── Document properties ───────── */
await page.goto(`${BASE}/tools/document-properties`);
await hydrated(page, "input[type=file]");
await page.setInputFiles("input[type=file]", abs("a.pdf"));
await page.waitForSelector(".meta-made", { timeout: 20000 });
ok("properties: shows which program produced the PDF", /pdf-lib/i.test(await page.locator(".meta-made").innerText()), await page.locator(".meta-made").innerText());
await page.getByLabel("Title").fill("Quarterly numbers");
await page.getByLabel("Author").fill("Ada Lovelace");
await page.getByLabel("Producer").fill("PlayWithDoc test suite");
await page.getByRole("button", { name: "Save changes" }).click();
await page.waitForSelector(".meta-done a[download]");
let [dm] = await Promise.all([page.waitForEvent("download"), page.locator(".meta-done a[download]").click()]);
let mp = path.join(out, "meta-edited.pdf"); await dm.saveAs(mp);
const edited = await PDFDocument.load(fs.readFileSync(mp), { updateMetadata: false });
ok("properties: edited PDF carries the new title, author and producer", edited.getTitle() === "Quarterly numbers" && edited.getAuthor() === "Ada Lovelace" && edited.getProducer() === "PlayWithDoc test suite", `${edited.getTitle()} | ${edited.getAuthor()} | ${edited.getProducer()}`);
ok("properties: the pages are untouched", edited.getPageCount() === (await PDFDocument.load(fs.readFileSync(abs("a.pdf")))).getPageCount());
await page.getByRole("button", { name: "Another file" }).click();
await page.setInputFiles("input[type=file]", mp);
await page.waitForSelector(".meta-made");
await page.getByRole("button", { name: "Remove all metadata" }).click();
await page.waitForSelector(".meta-done a[download]");
[dm] = await Promise.all([page.waitForEvent("download"), page.locator(".meta-done a[download]").click()]);
mp = path.join(out, "meta-clean.pdf"); await dm.saveAs(mp);
const clean = await PDFDocument.load(fs.readFileSync(mp), { updateMetadata: false });
ok("properties: removing wipes title, author and producer", !clean.getTitle() && !clean.getAuthor() && !clean.getProducer(), `${clean.getTitle()}|${clean.getAuthor()}|${clean.getProducer()}`);

await page.getByRole("button", { name: "Another file" }).click();
await page.setInputFiles("input[type=file]", abs("report.docx"));
await page.waitForSelector(".meta-form", { timeout: 20000 });
await page.getByLabel("Author").fill("Grace Hopper");
await page.getByLabel("Company").fill("Navy Labs");
await page.getByRole("button", { name: "Save changes" }).click();
await page.waitForSelector(".meta-done a[download]");
[dm] = await Promise.all([page.waitForEvent("download"), page.locator(".meta-done a[download]").click()]);
mp = path.join(out, "meta-edited.docx"); await dm.saveAs(mp);
const dz = await JSZip.loadAsync(fs.readFileSync(mp));
const coreXml = await dz.file("docProps/core.xml").async("string"), appXml = await dz.file("docProps/app.xml").async("string");
ok("properties: Word file gets the new author and company", /<dc:creator>Grace Hopper<\/dc:creator>/.test(coreXml) && /<Company>Navy Labs<\/Company>/.test(appXml), coreXml.slice(-200));
ok("properties: the Word text is still there", (await dz.file("word/document.xml").async("string")).length > 500);

// A JPG carrying EXIF (camera, software, GPS) — build one, then read it and strip it.
const exifJpg = (() => {
  const base = fs.readFileSync(path.join(fx, "red.jpg"));
  const t = [];
  const w16 = (v) => t.push(v & 255, (v >> 8) & 255), w32 = (v) => t.push(v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255);
  const str = (x) => [...Buffer.from(x + "\0")];
  const make = "TestCam", sw = "PlayWithDoc Camera 9";
  t.push(0x49, 0x49, 42, 0); w32(8);
  const n0 = 3, dataStart = 8 + 2 + n0 * 12 + 4;
  const makeOff = dataStart, swOff = makeOff + make.length + 1, gpsOff = swOff + sw.length + 1;
  w16(n0);
  w16(0x010f); w16(2); w32(make.length + 1); w32(makeOff);
  w16(0x0131); w16(2); w32(sw.length + 1); w32(swOff);
  w16(0x8825); w16(4); w32(1); w32(gpsOff);
  w32(0);
  t.push(...str(make), ...str(sw));
  const gn = 4, gStart = gpsOff + 2 + gn * 12 + 4, latOff = gStart, lonOff = gStart + 24;
  w16(gn);
  w16(1); w16(2); w32(2); t.push(78, 0, 0, 0);
  w16(2); w16(5); w32(3); w32(latOff);
  w16(3); w16(2); w32(2); t.push(69, 0, 0, 0);
  w16(4); w16(5); w32(3); w32(lonOff);
  w32(0);
  for (const v of [12, 30, 0, 77, 36, 0]) { w32(v); w32(1); }
  const body = Buffer.concat([Buffer.from("Exif\0\0"), Buffer.from(t)]);
  const seg = Buffer.alloc(4); seg[0] = 0xff; seg[1] = 0xe1; seg.writeUInt16BE(body.length + 2, 2);
  return Buffer.concat([base.subarray(0, 2), seg, body, base.subarray(2)]);
})();
const exifPath = path.join(out, "exif.jpg"); fs.writeFileSync(exifPath, exifJpg);
await page.getByRole("button", { name: "Another file" }).click();
await page.setInputFiles("input[type=file]", exifPath);
await page.waitForSelector(".meta-facts", { timeout: 20000 });
const jt = await page.locator(".meta").innerText();
ok("properties: photo shows camera, software and GPS location", /TestCam/.test(jt) && /PlayWithDoc Camera 9/.test(jt) && /12\.5\d*, 77\.6\d*/.test(jt), jt.slice(0, 260).replace(/\n/g, " "));
await page.getByRole("button", { name: "Remove all metadata" }).click();
await page.waitForSelector(".meta-done a[download]");
[dm] = await Promise.all([page.waitForEvent("download"), page.locator(".meta-done a[download]").click()]);
mp = path.join(out, "meta-clean.jpg"); await dm.saveAs(mp);
const cj = fs.readFileSync(mp);
ok("properties: stripped photo has no EXIF and is still a valid JPG", !cj.includes(Buffer.from("TestCam")) && jpegSize(cj).join("x") === jpegSize(fs.readFileSync(path.join(fx, "red.jpg"))).join("x"), jpegSize(cj).join("x"));

/* ───────── What's new + SEO ───────── */
await page.goto(`${BASE}/whats-new`);
ok("What's new lists the releases", (await page.locator(".wn-item").count()) >= 3 && /QR codes and document properties/.test(await page.locator(".wn-item").first().innerText()));
const feed = await page.request.get(`${BASE}/whats-new/feed.xml`);
ok("What's new has an Atom feed", feed.ok() && /<feed[^>]*Atom/.test(await feed.text()));
await page.goto(BASE + "/");
ok("nav: What's new link is present", (await page.locator('.hdr-nav a[href="/whats-new"]').count()) === 1);
const seoOf = async (u) => { await page.goto(BASE + u); return { canon: await page.locator('link[rel="canonical"]').getAttribute("href"), ver: await page.locator('meta[name="google-site-verification"]').getAttribute("content") }; };
const s1 = await seoOf("/tools/merge-pdf");
ok("SEO: tool pages have a canonical URL and the Google verification tag", /\/tools\/merge-pdf$/.test(s1.canon ?? "") && !!s1.ver, JSON.stringify(s1));
const s2 = await seoOf("/guides/split-a-pdf");
ok("SEO: guide pages have a canonical URL", /\/guides\/split-a-pdf$/.test(s2.canon ?? ""), s2.canon);
const sm = await (await page.request.get(`${BASE}/sitemap.xml`)).text();
ok("SEO: the sitemap lists the new pages", /whats-new/.test(sm) && /qr-code-generator/.test(sm) && /document-properties/.test(sm) && /make-wifi-qr-code/.test(sm));

console.log(`\n${results.filter(Boolean).length}/${results.length} passed`, errors.length ? errors.slice(0, 5) : "");
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
