// End-to-end tests — phones, tablets and desktops (11 device profiles with touch).
// Run against a production build:  npm run build && npm start   (port 3100 → set BASE_URL if different)
//   BASE_URL=http://localhost:3000 node tests/e2e/devices.test.mjs
// Uses Playwright's Chromium by default; set CHROME_PATH to use an installed Chrome/Edge instead.
import path from "node:path";
import { BASE, FIXTURES, OUT, launch, makeFixtures, require, hydrated } from "./helpers.mjs";
const { devices } = require("playwright-core");
const B = BASE;
const FX = FIXTURES.split(path.sep).join("/"), SHOTS = OUT.split(path.sep).join("/");
const browser = await launch();
await makeFixtures(browser);

const list = [
  ["iPhone SE (small)", { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
  ["iPhone 14", devices["iPhone 14"]],
  ["Pixel 7", devices["Pixel 7"]],
  ["Galaxy small (360)", { viewport: { width: 360, height: 740 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }],
  ["iPhone 14 landscape", { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }],
  ["iPad Mini portrait", devices["iPad Mini"]],
  ["iPad Pro 11 portrait", devices["iPad Pro 11"]],
  ["iPad Pro 11 landscape", devices["iPad Pro 11 landscape"]],
  ["Galaxy Tab S4", devices["Galaxy Tab S4"]],
  ["Laptop 1280", { viewport: { width: 1280, height: 720 } }],
  ["Desktop 1920", { viewport: { width: 1920, height: 1080 } }],
];

const overflow = (p) => p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, off: [...document.querySelectorAll("body *")].filter((e) => e.getBoundingClientRect().right > innerWidth + 1 && getComputedStyle(e).position !== "fixed" && !e.closest(".marquee, .ed-stage, .strip, .pgs-grid, .tabs, .cmp-scroll")).slice(0, 2).map((e) => e.tagName + "." + String(e.className).slice(0, 25)) }));
let bad = 0;
const report = (dev, what, o) => { const ok = o.sw <= o.iw + 1 && !o.off.length; if (!ok) bad++; console.log(ok ? "OK  " : "FAIL", dev.padEnd(24), what.padEnd(26), ok ? "" : `scrollWidth ${o.sw} > ${o.iw} ${o.off}`); };

for (const [name, cfg] of list.filter(([n]) => !process.env.ONLY || process.env.ONLY.split("|").includes(n))) {
  const ctx = await browser.newContext({ ...cfg, serviceWorkers: "block", colorScheme: "light" });
  const p = await ctx.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  const touch = !!cfg.hasTouch;
  const tap = (loc) => (touch ? loc.tap() : loc.click());

  await p.goto(B + "/"); await p.waitForTimeout(1800);
  report(name, "home", await overflow(p));
  // header items visible & inside viewport
  const hdr = await p.evaluate(() => [...document.querySelectorAll(".hdr .hdr-gh, .hdr .hdr-search, .hdr .theme, .hdr .brand")].map((e) => { const r = e.getBoundingClientRect(); return r.right <= innerWidth + 1 && r.left >= -1 && r.width > 0; }));
  if (!hdr.every(Boolean)) { bad++; console.log("FAIL", name.padEnd(24), "navbar items cut off", hdr); }
  // search palette via tap/click
  await hydrated(p, ".hero-search"); await tap(p.locator(".hero-search")); await p.waitForSelector(".pal"); await p.keyboard.type("jpg to pdf"); await p.waitForTimeout(250);
  const palBox = await p.locator(".pal").boundingBox();
  if (palBox.x < -1 || palBox.x + palBox.width > cfg.viewport.width + 1) { bad++; console.log("FAIL", name.padEnd(24), "palette off-screen", JSON.stringify(palBox)); }
  await tap(p.locator(".pal-item").first()); await p.waitForURL("**/tools/jpg-to-pdf");

  await p.setInputFiles("input[type=file]", ["red.jpg", "green.jpg", "blue.jpg"].map((f) => `${FX}/${f}`)); await p.waitForSelector(".fc img"); await p.waitForTimeout(500);
  report(name, "tool with 3 images", await overflow(p));
  // controls reachable on touch (no hover): rotate + move buttons visible
  if (touch) {
    const vis = await p.evaluate(() => { const t = document.querySelector(".fc-tools"), m = document.querySelector(".fc-mv"); return [getComputedStyle(t).opacity, m ? getComputedStyle(m).opacity : "1"]; });
    if (vis.some((v) => +v < 1)) { bad++; console.log("FAIL", name.padEnd(24), "card controls hidden on touch", vis); }
    // rotate via tap
    await p.locator(".fc").nth(0).locator("button[aria-label^='Rotate']").tap();
    if (!/rotate\(90deg\)/.test(await p.locator(".fc").nth(0).locator("img").getAttribute("style"))) { bad++; console.log("FAIL", name.padEnd(24), "tap-rotate didn't rotate"); }
    // move with arrows (touch has no drag&drop)
    const first = await p.locator(".fc:not(.add) .fc-meta b").first().innerText();
    await p.locator(".fc").nth(0).locator("button[aria-label='Move later']").tap(); await p.waitForTimeout(300);
    if ((await p.locator(".fc:not(.add) .fc-meta b").first().innerText()) === first) { bad++; console.log("FAIL", name.padEnd(24), "tap-move failed"); }
    // tap opens viewer
    await p.locator(".fc-media").nth(1).tap(); await p.waitForSelector(".lb-stage img", { timeout: 8000 }).catch(() => { bad++; console.log("FAIL", name.padEnd(24), "viewer didn't open"); });
    await p.locator(".lb-top button[aria-label='Close']").tap();
  }
  // primary button size (tap target) and run
  const btn = await p.locator("button.run").boundingBox();
  if (btn.height < 44) { bad++; console.log("FAIL", name.padEnd(24), "convert button too small", btn.height); }
  await tap(p.locator("button.run")); await p.waitForSelector(".panel.done", { timeout: 30000 });
  await p.waitForTimeout(900);
  report(name, "result screen", await overflow(p));
  await p.screenshot({ path: `${SHOTS}/${name.replace(/\W+/g, "_")}_result.png` });

  // editor
  await p.goto(B + "/tools/sign-pdf"); await hydrated(p); await p.setInputFiles("input[type=file]", [`${FX}/a.pdf`]); await p.waitForSelector(".ed-over"); await p.waitForTimeout(800);
  report(name, "sign/edit editor", await overflow(p));
  const pageBox = await p.locator(".ed-page").boundingBox();
  if (pageBox.width > cfg.viewport.width) { bad++; console.log("FAIL", name.padEnd(24), "PDF page wider than screen", pageBox.width); }
  await p.screenshot({ path: `${SHOTS}/${name.replace(/\W+/g, "_")}_editor.png` });

  // home screenshot for a few devices
  if (["iPhone 14", "iPad Mini portrait", "Pixel 7"].includes(name)) { await p.goto(B + "/"); await p.waitForTimeout(900); await p.screenshot({ path: `${SHOTS}/${name.replace(/\W+/g, "_")}_home.png` }); await p.goto(B + "/tools/jpg-to-pdf"); await hydrated(p); await p.setInputFiles("input[type=file]", ["red.jpg", "green.jpg", "blue.jpg"].map((f) => `${FX}/${f}`)); await p.waitForSelector(".fc img"); await p.waitForTimeout(600); await p.screenshot({ path: `${SHOTS}/${name.replace(/\W+/g, "_")}_tool.png` }); }
  if (errs.length) { bad++; console.log("FAIL", name, "page errors", errs.slice(0, 2)); }
  await ctx.close();
}
console.log(bad ? `\n${bad} problem(s)` : "\nAll devices OK");
await browser.close();
process.exit(bad ? 1 : 0);
