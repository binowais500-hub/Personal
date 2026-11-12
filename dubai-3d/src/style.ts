// MapLibre ground style: painted-miniature palette, recoloured live for dusk/night.
import type { StyleSpecification, Map as MLMap, ExpressionSpecification } from "maplibre-gl";
import { Env, RGB, hex, mix, css } from "./env";

type Pair = [string, string]; // [day, night]
const P: Record<string, Pair> = {
  sea: ["#2a8fdc", "#0b2447"], creek: ["#1f80d6", "#0a2244"], lake: ["#39a4e4", "#0d2a4f"], pool: ["#57d3ea", "#2a7fa0"],
  shore: ["#8fe3ef", "#1f5c7c"], foam: ["#f4fcff", "#5f8fa8"],
  land: ["#ebe6dc", "#2a2d38"],
  residential: ["#ece6d9", "#2b2e39"], commercial: ["#e7e2da", "#2c2f3a"], industrial: ["#e2ddd5", "#2a2c35"],
  civic: ["#eee3d6", "#2e2d38"], construction: ["#e9d6b0", "#36302a"], sand: ["#efdcb2", "#3a3328"], beach: ["#f6e2b4", "#3d3629"],
  cemetery: ["#d3dcbc", "#262f2a"], scrub: ["#cfd9a5", "#263026"], wetland: ["#b6d6aa", "#22302b"], parking: ["#dfdcd6", "#2a2c33"],
  plaza: ["#f1ebe0", "#34333a"], grass: ["#b4dd7a", "#1f3326"], golf: ["#9dd56a", "#1c3324"], park: ["#a3d468", "#1d3425"],
  garden: ["#9ccf62", "#1c3324"], wood: ["#7fbf55", "#18301f"], pitch: ["#84c95c", "#1c3a25"], pier: ["#dccfb8", "#3a3730"],
  parkEdge: ["#86b955", "#16281c"],
  motorway: ["#b3b8c0", "#d09550"], motorwayCase: ["#9097a2", "#3a3328"], primary: ["#c4c8ce", "#c58a4c"], primaryCase: ["#a3a9b2", "#33302c"],
  minor: ["#d3d5d8", "#6b5f50"], minorCase: ["#bcc0c5", "#2e2e33"], service: ["#dcdddf", "#4a4540"], path: ["#f3eee4", "#4e4a45"],
  footprint: ["#d8d2c6", "#25262e"],
};
const LU_KINDS = ["residential", "commercial", "industrial", "civic", "construction", "sand", "beach", "cemetery", "scrub", "wetland",
  "parking", "plaza", "grass", "golf", "park", "garden", "wood", "pitch", "pier"];

function col(k: string, env: Env | null): string {
  const [d, n] = P[k];
  if (!env) return d;
  let c: RGB = mix(hex(d), hex(n), env.night);
  // golden hour warmth + overcast / dust desaturation
  c = mix(c, [c[0] * 1.04, c[1] * 0.95, c[2] * 0.86], env.golden * 0.6);
  c = mix(c, [c[0] * 1.02, c[1] * 0.98, c[2] * 0.9], env.dust * 0.5);
  return css(c.map((v) => Math.min(1, v)) as RGB);
}

function matchKind(env: Env | null, kinds: string[], fallback: string): ExpressionSpecification {
  const m: unknown[] = ["match", ["get", "kind"]];
  for (const k of kinds) m.push(k, col(k, env));
  m.push(col(fallback, env));
  return m as ExpressionSpecification;
}

const W = (pairs: [number, number][]): ExpressionSpecification =>
  ["interpolate", ["exponential", 1.6], ["zoom"], ...pairs.flat()] as unknown as ExpressionSpecification;

export function buildStyle(base: string, opts: { painted: boolean; exaggeration: number; flat?: boolean }): StyleSpecification {
  const src = "base";
  const style: StyleSpecification = {
    version: 8,
    sources: {
      [src]: { type: "vector", url: `pmtiles://${base}tiles/dubai.pmtiles` },
      terrain: { type: "raster-dem", url: `pmtiles://${base}tiles/terrain.pmtiles`, encoding: "terrarium", tileSize: 256 },
      ...(opts.painted ? { painted: { type: "raster", url: `pmtiles://${base}tiles/painted.pmtiles`, tileSize: 256 } } : {}),
    },
    ...(opts.exaggeration > 0 ? { terrain: { source: "terrain", exaggeration: opts.exaggeration } } : {}),
    sky: {},
    layers: [
      { id: "bg", type: "background", paint: { "background-color": col("sea", null) } },
      { id: "earth", type: "fill", source: src, "source-layer": "earth", paint: { "fill-color": col("land", null), "fill-antialias": false } },
      { id: "landuse", type: "fill", source: src, "source-layer": "landuse", paint: { "fill-color": matchKind(null, LU_KINDS, "residential") } },
      {
        id: "park-edge", type: "line", source: src, "source-layer": "landuse", minzoom: 14,
        filter: ["in", ["get", "kind"], ["literal", ["park", "garden", "grass", "golf", "wood", "pitch"]]],
        paint: { "line-color": col("parkEdge", null), "line-width": W([[14, 0.4], [17, 1.6]]), "line-opacity": 0.7 },
      },
      { id: "footprints", type: "fill", source: src, "source-layer": "buildings", minzoom: 13, paint: { "fill-color": col("footprint", null) } },
      // water with a soft turquoise shallows band and a thin foam line (pools excluded)
      { id: "water", type: "fill", source: src, "source-layer": "water", paint: { "fill-color": matchKind(null, ["sea", "creek", "lake", "pool"], "lake") } },
      // shallows glow + foam along real shoreline lines (sea, Creek, Canal, lakes)
      {
        id: "shore", type: "line", source: src, "source-layer": "shoreline",
        paint: { "line-color": col("shore", null), "line-width": W([[11, 3], [14, 14], [17, 48]]), "line-blur": W([[11, 3], [14, 12], [17, 40]]), "line-opacity": 0.6 },
      },
      {
        id: "foam", type: "line", source: src, "source-layer": "shoreline",
        paint: { "line-color": col("foam", null), "line-width": W([[12, 0.6], [15, 1.8], [18, 4.5]]), "line-blur": 0.8, "line-opacity": 0.9 },
      },
      { id: "piers", type: "line", source: src, "source-layer": "piers", paint: { "line-color": col("pier", null), "line-width": W([[13, 1], [17, 5]]) } },
      ...roadLayers(src),
      ...(opts.painted ? [{ id: "painted", type: "raster" as const, source: "painted", paint: { "raster-opacity": 1, "raster-fade-duration": 200 } }] : []),
    ],
  };
  if (opts.flat) {
    // paint base: no terrain/sky; draw footprints with a crisp outline so the image model keeps them
    delete style.sky;
    delete (style.sources as Record<string, unknown>).terrain;
    style.layers.push({ id: "footprint-edge", type: "line", source: src, "source-layer": "buildings", paint: { "line-color": "#bdb5a6", "line-width": 1 } });
  }
  return style;
}

function roadLayers(src: string) {
  const sel = (kinds: string[]) => ["all", ["in", ["get", "kind"], ["literal", kinds]], ["!=", ["get", "tunnel"], 1]] as ExpressionSpecification;
  const L = (id: string, kinds: string[], color: string, width: ExpressionSpecification, extra: object = {}, minzoom = 11) => ({
    id, type: "line" as const, source: src, "source-layer": "roads", filter: sel(kinds), minzoom,
    layout: { "line-join": "round" as const, "line-cap": "round" as const }, paint: { "line-color": col(color, null), "line-width": width, ...extra },
  });
  return [
    L("road-path", ["path"], "path", W([[15, 0.6], [18, 2.5]]), { "line-opacity": 0.9 }, 15),
    L("road-service", ["service"], "service", W([[14, 0.6], [16, 2], [18, 6]]), {}, 14),
    L("road-minor-case", ["minor", "tertiary"], "minorCase", W([[12, 0.8], [15, 4], [18, 16]]), {}, 12.5),
    L("road-minor", ["minor", "tertiary"], "minor", W([[12, 0.5], [15, 3], [18, 13]]), {}, 12.5),
    L("road-primary-case", ["primary", "secondary"], "primaryCase", W([[11, 1.2], [14, 4.5], [17, 18], [18, 30]])),
    L("road-primary", ["primary", "secondary"], "primary", W([[11, 0.8], [14, 3.4], [17, 15], [18, 26]])),
    L("road-motorway-case", ["motorway", "trunk"], "motorwayCase", W([[11, 2], [14, 7], [17, 28], [18, 48]])),
    L("road-motorway", ["motorway", "trunk"], "motorway", W([[11, 1.4], [14, 5.4], [17, 24], [18, 42]])),
  ];
}

/** Recolour everything for the current environment (called when the sun/weather changes noticeably). */
export function applyEnv(map: MLMap, env: Env) {
  const sp = (id: string, prop: string, v: unknown) => { if (map.getLayer(id)) map.setPaintProperty(id, prop as never, v as never); };
  sp("bg", "background-color", col("sea", env));
  sp("earth", "fill-color", col("land", env));
  sp("landuse", "fill-color", matchKind(env, LU_KINDS, "residential"));
  sp("park-edge", "line-color", col("parkEdge", env));
  sp("footprints", "fill-color", col("footprint", env));
  sp("water", "fill-color", matchKind(env, ["sea", "creek", "lake", "pool"], "lake"));
  sp("shore", "line-color", col("shore", env));
  sp("foam", "line-color", col("foam", env));

  sp("piers", "line-color", col("pier", env));
  for (const [id, k] of [["road-path", "path"], ["road-service", "service"], ["road-minor-case", "minorCase"], ["road-minor", "minor"],
    ["road-primary-case", "primaryCase"], ["road-primary", "primary"], ["road-motorway-case", "motorwayCase"], ["road-motorway", "motorway"]])
    sp(id, "line-color", col(k, env));
  // street lights: roads glow a little at night
  sp("road-motorway", "line-blur", env.night * 2);
  sp("road-primary", "line-blur", env.night * 1.5);
  sp("painted", "raster-brightness-max", 1 - env.night * 0.78);
  sp("painted", "raster-saturation", -env.night * 0.5 - env.dust * 0.3);
  sp("painted", "raster-hue-rotate", env.night * 12);
  map.setSky({
    "sky-color": css(env.skyColor), "horizon-color": css(env.horizonColor), "fog-color": css(env.fogColor),
    "fog-ground-blend": 0.35 + env.haze * 0.5, "horizon-fog-blend": 0.6 + env.haze * 0.35, "sky-horizon-blend": 0.6, "atmosphere-blend": 0.5,
  });
}
