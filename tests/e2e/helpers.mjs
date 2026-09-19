// Shared setup for the browser tests: where the app is running, which browser to use, and the sample files.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

export const require = createRequire(import.meta.url);
export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const BASE = process.env.BASE_URL || "http://localhost:3100";
export const FIXTURES = path.join(HERE, ".fixtures");
export const OUT = path.join(HERE, ".out");

/** Launches Chromium. Set CHROME_PATH to use an installed browser (for example Edge or Chrome) instead of Playwright's. */
export async function launch() {
  const { chromium } = require("playwright-core");
  return chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
}

async function pdf(name, pages, title) {
  const { PDFDocument, StandardFonts } = require("pdf-lib");
  const d = await PDFDocument.create();
  const f = await d.embedFont(StandardFonts.Helvetica), fb = await d.embedFont(StandardFonts.HelveticaBold);
  for (let i = 1; i <= pages; i++) {
    const p = d.addPage([595, 842]);
    p.drawText(`${title} — Page ${i}`, { x: 60, y: 760, size: 26, font: fb });
    for (let l = 0; l < 20; l++) p.drawText(`Line ${l + 1}: The quick brown fox jumps over the lazy dog on page ${i}.`, { x: 60, y: 700 - l * 18, size: 11, font: f });
  }
  fs.writeFileSync(path.join(FIXTURES, name), await d.save());
}

async function docx(name) {
  const JSZip = require("jszip");
  const z = new JSZip();
  z.file("[Content_Types].xml", `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  z.file("_rels/.rels", `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  const p = (t, extra = "") => `<w:p><w:pPr>${extra}</w:pPr><w:r><w:t>${t}</w:t></w:r></w:p>`;
  z.file("word/document.xml", `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${p("Quarterly Report", '<w:pStyle w:val="Heading1"/>')}${p("This is a paragraph of text that should wrap across the page nicely because it is fairly long and keeps going on and on for a while to test wrapping.")}${p("Second paragraph.")}<w:sectPr/></w:body></w:document>`);
  fs.writeFileSync(path.join(FIXTURES, name), await z.generateAsync({ type: "nodebuffer" }));
}

/** Creates every sample file the tests use: PDFs, a Word doc, a CSV and several images. Needs the app running (images are drawn in the browser). */
export async function makeFixtures(browser) {
  fs.mkdirSync(FIXTURES, { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });
  await pdf("a.pdf", 3, "Doc A");
  await pdf("b.pdf", 2, "Doc B");
  await docx("report.docx");
  fs.writeFileSync(path.join(FIXTURES, "data.csv"), 'name,age,city\nAnn,30,"Paris, FR"\nBob,25,Rome\n');

  const page = await browser.newPage();
  await page.goto(BASE + "/");
  const imgs = await page.evaluate(async () => {
    const blob = (c, t, q) => new Promise((r) => c.toBlob(r, t, q));
    const arr = async (b) => Array.from(new Uint8Array(await b.arrayBuffer()));
    const text = document.createElement("canvas"); text.width = 1000; text.height = 320;
    let g = text.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, 1000, 320); g.fillStyle = "#000";
    g.font = "bold 84px Arial, Helvetica, sans-serif"; g.fillText("Hello OCR 2026", 40, 130);
    g.font = "60px Arial, Helvetica, sans-serif"; g.fillText("Anyform private tools", 40, 250);
    const noisy = document.createElement("canvas"); noisy.width = 2400; noisy.height = 3200; g = noisy.getContext("2d");
    const id = g.createImageData(2400, 3200);
    for (let i = 0; i < id.data.length; i += 4) { const v = (Math.random() * 255) | 0; id.data[i] = v; id.data[i + 1] = (v * 0.7) | 0; id.data[i + 2] = 200; id.data[i + 3] = 255; }
    g.putImageData(id, 0, 0);
    const solid = async (label, color) => { const k = document.createElement("canvas"); k.width = 800; k.height = 500; const x = k.getContext("2d"); x.fillStyle = color; x.fillRect(0, 0, 800, 500); x.fillStyle = "#fff"; x.font = "bold 90px Arial, Helvetica, sans-serif"; x.fillText(label, 60, 280); return arr(await blob(k, "image/jpeg", 0.9)); };
    return { ocr: await arr(await blob(text, "image/png")), noisy: await arr(await blob(noisy, "image/jpeg", 0.95)), red: await solid("RED", "#c0392b"), green: await solid("GREEN", "#27ae60"), blue: await solid("BLUE", "#2980b9") };
  });
  await page.close();
  for (const [name, bytes] of Object.entries({ "ocr.png": imgs.ocr, "noisy.jpg": imgs.noisy, "red.jpg": imgs.red, "green.jpg": imgs.green, "blue.jpg": imgs.blue })) fs.writeFileSync(path.join(FIXTURES, name), Buffer.from(bytes));
}

/**
 * Waits until the page is truly interactive. The HTML shows up first and React "wakes up" a moment later;
 * on a slow machine (like a CI runner) keys and file drops sent in that gap are silently lost.
 * React marks every DOM node it has taken over with a __reactProps$… property — that is the signal we wait for.
 */
export async function hydrated(page, selector = "input[type=file]") {
  await page.waitForFunction((sel) => {
    const el = document.querySelector(sel);
    return !!el && Object.keys(el).some((k) => k.startsWith("__reactProps"));
  }, selector, { timeout: 45000 });
}

/** Opens the command palette (Ctrl+K), retrying until it appears — never toggles it closed again. */
export async function openPalette(page) {
  await hydrated(page, ".hdr-search");
  for (let i = 0; i < 20; i++) {
    if (await page.locator(".pal").count()) return;
    await page.keyboard.press("Control+k");
    await page.waitForTimeout(600);
  }
  if (!(await page.locator(".pal").count())) throw new Error("The command palette did not open");
}
