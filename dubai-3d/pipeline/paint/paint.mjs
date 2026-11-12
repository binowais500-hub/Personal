#!/usr/bin/env node
// "Painted with AI" ground layer.
//
//   npm run paint:estimate                 tile counts + cost per provider (no network, no browser)
//   npm run paint -- --pilot               render + paint a 3x3 pilot around config/paint.json pilotCenter
//   npm run paint -- --approve-pilot       record that you reviewed the pilot (required before --all)
//   npm run paint -- --all                 paint every tile in the bbox (asks for confirmation; add --yes to skip)
//   npm run paint -- --mosaic              (re)build public/tiles/painted.pmtiles from whatever is painted
// Options: --provider gemini|openai|replicate  --render-only (base images only, free)  --limit N
//
// Every painted tile is cached by sha256(base image + provider + model + prompt + seed), so reruns cost nothing.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import readline from "node:readline/promises";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { providers } from "./providers.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const area = JSON.parse(fs.readFileSync(path.join(ROOT, "config/area.json"), "utf8"));
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "config/paint.json"), "utf8"));
const DIR = path.join(ROOT, "data/paint");
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const opt = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const providerName = opt("--provider", cfg.provider);
const pcfg = cfg.providers[providerName];
if (!pcfg) { console.error(`unknown provider ${providerName}`); process.exit(1); }

// ---------- .env (tiny parser; keys never leave this machine except to the chosen provider)
for (const f of [".env.local", ".env"]) {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

// ---------- tile maths (XYZ / web mercator)
const lon2x = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z);
const lat2y = (lat, z) => Math.floor(((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z);
const x2lon = (x, z) => (x / 2 ** z) * 360 - 180;
const y2lat = (y, z) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI;
const Z = cfg.zoom;
const [W, S, E, N] = area.bbox;
const all = [];
for (let x = lon2x(W, Z); x <= lon2x(E, Z); x++) for (let y = lat2y(N, Z); y <= lat2y(S, Z); y++) all.push([x, y]);
const pc = cfg.pilotCenter, px = lon2x(pc[0], Z), py = lat2y(pc[1], Z);
const pilot = all.filter(([x, y]) => Math.abs(x - px) <= 1 && Math.abs(y - py) <= 1);

function estimate() {
  const cached = all.filter(([x, y]) => fs.existsSync(path.join(DIR, "index", `${Z}_${x}_${y}_${providerName}.json`))).length;
  const tileKm = (40075 * Math.cos((((S + N) / 2) * Math.PI) / 180)) / 2 ** Z;
  const ov = Math.round((100 * cfg.renderMarginPx) / cfg.renderCorePx);
  console.log(`\nPaint layer for bbox ${area.bbox.join(", ")} at z${Z} (each tile ≈ ${(tileKm * 1000).toFixed(0)} m + ${ov}% overlap per side, sent as ${cfg.imageSize}px)`);
  console.log(`  tiles: ${all.length} total · pilot ${pilot.length} · already painted with ${providerName}: ${cached}\n`);
  console.log("  provider     model                              $/img   pilot     full bbox   ~time (full)");
  for (const [k, p] of Object.entries(cfg.providers)) {
    const t = (all.length * p.secondsPerImage) / 60;
    console.log(`  ${k.padEnd(12)} ${p.model.padEnd(34)} ${p.pricePerImageUSD.toFixed(3)}   $${(pilot.length * p.pricePerImageUSD).toFixed(2).padEnd(7)}  $${(all.length * p.pricePerImageUSD).toFixed(2).padEnd(10)} ${t.toFixed(0)} min`);
  }
  console.log("\n  Prices are approximate. Check your provider's current pricing. Cached tiles cost $0 on reruns.\n");
}

// ---------- base renders (flat style via Vite + Playwright)
async function renderBases(tiles) {
  const todo = tiles.filter(([x, y]) => !fs.existsSync(path.join(DIR, "base", `${Z}_${x}_${y}.png`)));
  if (!todo.length) return;
  fs.mkdirSync(path.join(DIR, "base"), { recursive: true });
  const { createServer } = await import("vite");
  const server = await createServer({ root: ROOT, server: { port: 0 }, logLevel: "error" });
  await server.listen();
  const url = server.resolvedUrls.local[0];
  const { chromium } = createRequire(import.meta.url)("playwright");
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const R = cfg.renderCorePx + 2 * cfg.renderMarginPx;
  const page = await browser.newPage({ viewport: { width: R, height: R }, deviceScaleFactor: 1 });
  await page.goto(`${url}paint.html?size=${R}`);
  await page.waitForFunction(() => window.__ready, null, { timeout: 120000 });
  const zoom = Z + Math.log2(cfg.renderCorePx / 512); // MapLibre zoom uses 512px tiles; keep it an integer
  if (!Number.isInteger(zoom)) console.warn("  warning: renderCorePx should be 512 * 2^k for seam-free renders");
  for (const [x, y] of todo) {
    const lon = x2lon(x + 0.5, Z), lat = y2lat(y + 0.5, Z);
    await page.evaluate(([a, b, c]) => window.__setView(a, b, c), [lon, lat, zoom]);
    const dataUrl = await page.evaluate((n) => window.__capture(n), cfg.imageSize);
    fs.writeFileSync(path.join(DIR, "base", `${Z}_${x}_${y}.png`), Buffer.from(dataUrl.split(",")[1], "base64"));
    process.stdout.write(`\r  rendered base ${Z}/${x}/${y}`);
  }
  console.log();
  await browser.close();
  await server.close();
}

// ---------- painting with cache
async function paintTiles(tiles) {
  const key = process.env[pcfg.env];
  if (!key) { console.error(`\n  Missing ${pcfg.env} in .env (see .env.example). Nothing was painted.`); process.exit(1); }
  fs.mkdirSync(path.join(DIR, "painted"), { recursive: true });
  fs.mkdirSync(path.join(DIR, "index"), { recursive: true });
  let spent = 0, n = 0;
  for (const [x, y] of tiles) {
    const base = fs.readFileSync(path.join(DIR, "base", `${Z}_${x}_${y}.png`));
    const h = crypto.createHash("sha256").update(base).update(providerName).update(pcfg.model).update(cfg.prompt).update(String(cfg.seed)).digest("hex").slice(0, 24);
    const out = path.join(DIR, "painted", `${h}.png`);
    if (!fs.existsSync(out)) {
      const img = await providers[providerName]({ png: base, prompt: cfg.prompt, seed: cfg.seed, size: cfg.imageSize, cfg: pcfg });
      fs.writeFileSync(out, img);
      spent += pcfg.pricePerImageUSD; n++;
    }
    fs.writeFileSync(path.join(DIR, "index", `${Z}_${x}_${y}_${providerName}.json`), JSON.stringify({ z: Z, x, y, file: `painted/${h}.png`, provider: providerName }));
    process.stdout.write(`\r  painted ${Z}/${x}/${y}  (new: ${n}, ~$${spent.toFixed(2)})   `);
  }
  console.log();
}

function mosaic() {
  const r = spawnSync("python3", [path.join(ROOT, "pipeline/paint/mosaic.py"), providerName], { stdio: "inherit" });
  if (r.status) process.exit(r.status);
}

const approvedFile = path.join(DIR, "PILOT_APPROVED");
if (has("--estimate") || !args.length) { estimate(); process.exit(0); }
if (has("--approve-pilot")) { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(approvedFile, new Date().toISOString()); console.log("Pilot approved. You can now run: npm run paint -- --all"); process.exit(0); }
if (has("--mosaic")) { mosaic(); process.exit(0); }

let tiles = has("--all") ? all : pilot;
if (opt("--limit")) tiles = tiles.slice(0, Number(opt("--limit")));
estimate();
if (has("--all") && !fs.existsSync(approvedFile)) {
  console.error("  Full run blocked: paint and review the 3x3 pilot first (npm run paint -- --pilot), then npm run paint -- --approve-pilot.");
  process.exit(1);
}
await renderBases(tiles);
if (has("--render-only")) { console.log(`  base images in data/paint/base (${tiles.length} tiles). No API calls made.`); process.exit(0); }
if (has("--all") && !has("--yes")) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const a = await rl.question(`  Paint ${tiles.length} tiles with ${providerName} (≈$${(tiles.length * pcfg.pricePerImageUSD).toFixed(2)} before cache)? Type "paint" to continue: `);
  rl.close();
  if (a.trim() !== "paint") { console.log("  aborted"); process.exit(0); }
}
await paintTiles(tiles);
mosaic();
if (!has("--all")) console.log("\n  Pilot done. Review it in the app (toggle 'Painted'), then: npm run paint -- --approve-pilot && npm run paint -- --all");
