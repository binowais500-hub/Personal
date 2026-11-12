// Flat, label-free render of the ground style for one paint tile (used by pipeline/paint/paint.mjs).
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Protocol } from "pmtiles";
import mlWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { buildStyle } from "./style";

maplibregl.setWorkerUrl(mlWorkerUrl);
maplibregl.addProtocol("pmtiles", new Protocol().tile);
const size = Number(new URLSearchParams(location.search).get("size") || 1024);
const el = document.getElementById("map")!;
el.style.width = el.style.height = `${size}px`;
const style = buildStyle(new URL("./", location.href).href, { painted: false, exaggeration: 0, flat: true });
const map = new maplibregl.Map({
  container: el, style, center: [55.27, 25.2], zoom: 16, interactive: false, pixelRatio: 1,
  fadeDuration: 0, attributionControl: false, canvasContextAttributes: { preserveDrawingBuffer: true },
});
const w = window as unknown as Record<string, unknown>;
w.__setView = (lng: number, lat: number, zoom: number) =>
  new Promise<void>((res) => { map.jumpTo({ center: [lng, lat], zoom, pitch: 0, bearing: 0 }); map.once("idle", () => res()); });
map.once("idle", () => { w.__ready = true; });
// downscale the rendered canvas in the browser so the pipeline needs no image library
w.__capture = (out: number) => {
  const c = document.createElement("canvas");
  c.width = c.height = out;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(map.getCanvas(), 0, 0, out, out);
  return c.toDataURL("image/png");
};
