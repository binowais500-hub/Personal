// Playwright screenshots of the running app at a few camera positions / times.
// Usage: node scripts/shoot.mjs [baseUrl] [outDir]   (start `npm run dev` or `npm run preview` first)
import { createRequire } from "node:module";
// playwright is not a dependency (install with `npm i -D playwright && npx playwright install chromium`)
const { chromium } = createRequire(import.meta.url)("playwright");
import fs from "node:fs";

const base = process.argv[2] || "http://localhost:5173/";
const out = process.argv[3] || "screenshots";
fs.mkdirSync(out, { recursive: true });
const shots = (process.env.SHOTS || "creek@10:30,downtown@16:00,coast@11:00,canal@18:10,downtown@21:30").split(",");
const mobile = process.env.MOBILE === "1";

const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const ctx = await browser.newContext(mobile ? { viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
  : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on("console", (m) => { if (["error", "warning"].includes(m.type())) console.log(`[${m.type()}]`, m.text().slice(0, 300)); });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
page.setDefaultTimeout(240000);
await page.goto(`${base}?notour&static&view=downtown${process.env.QS || ""}`, { waitUntil: "load" });
await page.waitForFunction(() => window.__app, null, { timeout: 60000 });
for (const s of shots) {
  const [vw, t] = s.split("@");
  const [view, lang] = vw.split("+"); // e.g. creek+ar@17:00 for Arabic labels
  await page.evaluate(([v, tt, l]) => { window.__app.view(v); if (tt) window.__app.setTime(tt); window.__app.setLang(l || "en"); }, [view, t, lang]);
  const t0 = Date.now();
  await page.waitForFunction(() => window.__app.ready(), null, { timeout: 120000 }).catch(() => console.log("not fully ready", view));
  await page.evaluate(() => window.__app.map.triggerRepaint());
  await page.waitForTimeout(2500);
  const ext = process.env.JPEG ? "jpg" : "png";
  const f = `${out}/${view}${lang ? "-" + lang : ""}-${(t || "now").replace(":", "")}${mobile ? "-mobile" : ""}.${ext}`;
  await page.screenshot({ path: f, ...(process.env.JPEG ? { type: "jpeg", quality: 82 } : {}) });
  console.log("saved", f, `${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
await browser.close();
