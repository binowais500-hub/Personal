import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Protocol } from "pmtiles";
// MapLibre v6 ships its worker as a separate ES module; let Vite bundle it and hand MapLibre the URL.
import mlWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "./ui.css";
import { buildStyle, applyEnv } from "./style";
import { City3D } from "./city3d";
import { Labels } from "./labels";
import { Meta, Geo, project } from "./geo";
import { computeEnv, fetchWeather, weatherLabel, dubaiMinutes, dubaiDateAt, fmtDubai, Weather, Env } from "./env";

const $ = <T extends HTMLElement>(s: string) => document.querySelector(s) as T;
const params = new URL(location.href).searchParams;
const mobile = matchMedia("(pointer: coarse)").matches || /iPhone|iPad|Android/i.test(navigator.userAgent);
// Tiles can live on R2 / another origin: set VITE_TILES_BASE at build time (must end with "/").
const BASE: string = import.meta.env.VITE_TILES_BASE || new URL("./", location.href).href;
// VITE_PMTILES_B64=1: archives are served as base64 text (for hosts that refuse binary files)
const PM = (name: string) => `${BASE}tiles/${name}.pmtiles${import.meta.env.VITE_PMTILES_B64 ? ".b64.txt" : ""}`;

import { archive } from "./pmtilesSource";
maplibregl.setWorkerUrl(mlWorkerUrl);
const protocol = new Protocol();
maplibregl.addProtocol("pmtiles", protocol.tile);

async function hasPainted() {
  try {
    const r = await fetch(PM("painted"), { method: "HEAD" });
    return r.ok && !(r.headers.get("content-type") || "").includes("text/html");
  } catch { return false; }
}

async function main() {
  for (const f of ["dubai", "terrain"]) protocol.add(archive(PM(f)));
  const [meta, painted] = await Promise.all([fetch(`${BASE}tiles/meta.json`).then((r) => r.json() as Promise<Meta>), hasPainted()]);
  if (painted) protocol.add(archive(PM("painted")));
  const geo = new Geo(meta);
  const [w, s, e, n] = meta.bbox;
  const pad = 0.05;
  const startView = params.get("view") && meta.cameras[params.get("view")!] ? meta.cameras[params.get("view")!] : meta.cameras.gulf;

  const map = new maplibregl.Map({
    container: "map",
    style: buildStyle(BASE, { pm: PM, painted, exaggeration: params.has("noterrain") ? 0 : meta.terrainExaggeration }),
    center: startView.center, zoom: startView.zoom, pitch: startView.pitch, bearing: startView.bearing,
    minZoom: 11.5, maxZoom: 18.5, maxPitch: 78,
    maxBounds: [[w - pad, s - pad], [e + pad, n + pad]],
    pixelRatio: Math.min(window.devicePixelRatio || 1, mobile ? 1.75 : 2),
    canvasContextAttributes: { antialias: !mobile, stencil: true, powerPreference: "high-performance" },
    attributionControl: false,
    fadeDuration: 150,
    maxTileCacheSize: mobile ? 80 : 300,
  });
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true, showZoom: !mobile }), "bottom-right");

  const city = new City3D(meta, { mobile, base: BASE });
  if (params.has("static")) city.animate = false;
  let cardIdx = -1;
  const labels = new Labels($("#labels"), meta, meta.terrainExaggeration, (idx) => openCard(idx));

  // ---------- time & environment
  let live = !params.get("t");
  let minutes = dubaiMinutes(new Date());
  if (params.get("t")) { const [hh, mm] = params.get("t")!.split(":").map(Number); minutes = hh * 60 + (mm || 0); }
  let weather: Weather | null = null;
  let env: Env;
  const slider = $<HTMLInputElement>("#time");
  const liveBtn = $<HTMLButtonElement>("#live");
  const currentDate = () => (live ? new Date() : dubaiDateAt(minutes));
  let lastKey = "";
  function refreshEnv(force = false) {
    const d = currentDate();
    env = computeEnv(d, weather);
    const key = `${env.altitude.toFixed(1)}|${env.haze.toFixed(2)}`;
    if (!force && key === lastKey) return;
    lastKey = key;
    if (map.isStyleLoaded()) applyEnv(map, env);
    city.setEnv(env);
    document.body.classList.toggle("night", env.night > 0.6);
    const chip = $("#weather");
    if (weather) { chip.hidden = false; chip.textContent = env.night > 0.6 ? weatherLabel(weather).replace("☀️", "🌙") : weatherLabel(weather); }
  }
  function tickClock() {
    const d = currentDate();
    $("#clock").textContent = `${fmtDubai(d)} Dubai`;
    if (live) slider.value = String(dubaiMinutes(d));
  }
  slider.value = String(minutes);
  slider.addEventListener("input", () => { live = false; minutes = +slider.value; liveBtn.classList.remove("on"); tickClock(); refreshEnv(); });
  liveBtn.addEventListener("click", () => { live = true; liveBtn.classList.add("on"); tickClock(); refreshEnv(true); });
  if (!live) liveBtn.classList.remove("on");
  setInterval(() => { tickClock(); if (live) refreshEnv(); }, 1000);
  tickClock();
  env = computeEnv(currentDate(), null);
  const pullWeather = async () => { weather = await fetchWeather(); refreshEnv(true); };
  setInterval(pullWeather, 15 * 60 * 1000);

  // ---------- toggles
  const tp = $<HTMLInputElement>("#t-painted");
  if (!painted) { tp.disabled = true; tp.parentElement!.classList.add("disabled"); tp.parentElement!.title = "No painted layer yet: run `npm run paint`"; }
  else tp.checked = params.get("painted") !== "0";
  tp.addEventListener("change", () => map.setLayoutProperty("painted", "visibility", tp.checked ? "visible" : "none"));
  $<HTMLInputElement>("#t-trains").addEventListener("change", (ev) => { city.showTrains = (ev.target as HTMLInputElement).checked; $("#trainnote").hidden = !city.showTrains; });
  $<HTMLInputElement>("#t-labels").addEventListener("change", (ev) => { labels.visible = (ev.target as HTMLInputElement).checked; });
  const langBtn = $<HTMLButtonElement>("#lang");
  langBtn.addEventListener("click", () => { const l = labels.lang === "en" ? "ar" : "en"; labels.setLang(l); langBtn.textContent = l === "en" ? "EN" : "عربي"; });
  setInterval(() => { $("#trainnote").textContent = city.showTrains ? city.trains.note : ""; }, 2000);

  // ---------- landmark cards
  function openCard(idx: number) {
    const L = meta.landmarks.find((l) => l.idx === idx);
    if (!L) return;
    cardIdx = idx;
    city.highlight(idx);
    const card = $("#card");
    card.hidden = false;
    card.innerHTML = `<button class="x" aria-label="Close">×</button><h2>${L.name}</h2><div class="ar">${L.name_ar}</div>
      <dl>${L.height ? `<dt>Height</dt><dd>${L.height} m</dd>` : ""}${L.year ? `<dt>Completed</dt><dd>${L.year}</dd>` : ""}</dl>`;
    card.querySelector(".x")!.addEventListener("click", closeCard);
    const [lng, lat] = geo.toLngLat(L.x, L.y);
    map.easeTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), L.height && L.height > 300 ? 15 : 16), duration: 1400 });
  }
  function closeCard() { cardIdx = -1; city.highlight(-1); $("#card").hidden = true; }
  map.on("click", (ev: maplibregl.MapMouseEvent) => {
    const m = city.lastMatrix;
    if (!m) return;
    const W = map.getCanvas().clientWidth, H = map.getCanvas().clientHeight;
    let best = -1, bd = 1e9;
    for (const L of meta.landmarks) {
      if (L.x === undefined) continue;
      const scr = (z: number) => { const c = project(m, L.x, L.y, z); return [((c[0] / c[3] + 1) / 2) * W, ((1 - c[1] / c[3]) / 2) * H, c[3]]; };
      const b = scr(L.z * meta.terrainExaggeration), t = scr(L.z * meta.terrainExaggeration + (L.height ?? 30));
      if (b[2] <= 0) continue;
      // distance from click to the projected vertical axis of the landmark
      const vx = t[0] - b[0], vy = t[1] - b[1], l2 = vx * vx + vy * vy || 1;
      const u = Math.max(0, Math.min(1, ((ev.point.x - b[0]) * vx + (ev.point.y - b[1]) * vy) / l2));
      const d = Math.hypot(ev.point.x - (b[0] + vx * u), ev.point.y - (b[1] + vy * u));
      if (d < bd) { bd = d; best = L.idx; }
    }
    if (best >= 0 && bd < 36) openCard(best); else if (cardIdx >= 0) closeCard();
  });

  // ---------- views & intro tour
  const views = document.querySelectorAll<HTMLButtonElement>("[data-view]");
  const fly = (k: string, duration = 3500) => {
    const c = meta.cameras[k];
    views.forEach((b) => b.classList.toggle("active", b.dataset.view === k));
    map.flyTo({ center: c.center, zoom: c.zoom, pitch: c.pitch, bearing: c.bearing, duration, essential: true, curve: 1.2 });
  };
  views.forEach((b) => b.addEventListener("click", () => { touring = false; fly(b.dataset.view!); }));
  let touring = false;
  async function tour() {
    touring = true;
    const g = meta.cameras.gulf;
    map.jumpTo({ center: g.center, zoom: g.zoom, pitch: g.pitch, bearing: g.bearing });
    const step = (k: string, ms: number) => new Promise<void>((res) => {
      if (!touring) return res();
      fly(k, ms);
      map.once("moveend", () => res());
    });
    await step("creek", 6500);
    if (touring) await new Promise((r) => setTimeout(r, 400));
    await step("downtown", 8000);
    touring = false;
  }
  for (const evName of ["mousedown", "touchstart", "wheel"] as const) map.getCanvas().addEventListener(evName, () => { touring = false; }, { passive: true });
  $("#tour").addEventListener("click", tour);

  // ---------- frame hook: labels follow the 3D layer's matrix
  city.onFrame = (m) => {
    const c = map.getCanvas();
    labels.update(m, c.clientWidth, c.clientHeight, map.getZoom(), map.getBearing());
  };

  map.on("load", () => {
    if (!params.has("nocity")) map.addLayer(city);
    refreshEnv(true);
    pullWeather();
    let done = false;
    const finish = () => {
      if (done) return; done = true;
      $("#loading").classList.add("done");
      if (!params.has("view") && !params.has("notour")) setTimeout(tour, 300);
    };
    const poll = setInterval(() => { if (city.loadedRatio > 0.6 || city.chunks.size === 0) { clearInterval(poll); finish(); } }, 200);
    setTimeout(finish, 9000);
  });

  // test / automation hooks
  (window as unknown as Record<string, unknown>).__app = {
    map, city,
    setTime: (hhmm: string) => { const [h, mm] = hhmm.split(":").map(Number); live = false; minutes = h * 60 + (mm || 0); slider.value = String(minutes); liveBtn.classList.remove("on"); tickClock(); refreshEnv(true); },
    view: (k: string) => { const c = meta.cameras[k]; touring = false; map.jumpTo({ center: c.center, zoom: c.zoom, pitch: c.pitch, bearing: c.bearing }); },
    ready: () => city.loadedRatio > 0.99 && map.areTilesLoaded(),
    setLang: (l: "en" | "ar") => { labels.setLang(l); langBtn.textContent = l === "en" ? "EN" : "عربي"; },
  };
}

main().catch((e) => { console.error(e); $("#loading").textContent = "Failed to load map data. Run `npm run data` first."; });
