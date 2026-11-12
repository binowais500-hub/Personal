// Low-poly instanced vegetation geometries (z-up, metres). aPart: 0 trunk (vertex colour), 1 canopy (instance colour).
import * as THREE from "three";

function finish(parts: { g: THREE.BufferGeometry; part: number; color: THREE.Color }[]) {
  const geos = parts.map(({ g, part, color }) => {
    const ng = g.index ? g.toNonIndexed() : g;
    if (!ng.getAttribute("normal")) ng.computeVertexNormals();
    const n = ng.getAttribute("position").count;
    ng.setAttribute("aPart", new THREE.Float32BufferAttribute(new Float32Array(n).fill(part), 1));
    const c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) color.toArray(c, i * 3);
    ng.setAttribute("color", new THREE.Float32BufferAttribute(c, 3));
    for (const k of Object.keys(ng.attributes)) if (!["position", "normal", "aPart", "color"].includes(k)) ng.deleteAttribute(k);
    return ng;
  });
  return mergeGeos(geos);
}

export function mergeGeos(geos: THREE.BufferGeometry[]) {
  const out = new THREE.BufferGeometry();
  for (const name of ["position", "normal", "aPart", "color"]) {
    const arrs = geos.map((g) => g.getAttribute(name).array as Float32Array);
    const tot = arrs.reduce((a, b) => a + b.length, 0);
    const m = new Float32Array(tot);
    let o = 0;
    for (const a of arrs) { m.set(a, o); o += a.length; }
    out.setAttribute(name, new THREE.BufferAttribute(m, geos[0].getAttribute(name).itemSize));
  }
  return out;
}

const up = (g: THREE.BufferGeometry) => g.rotateX(Math.PI / 2);
const TRUNK = new THREE.Color("#8b6a4c");

export function palmGeometry() {
  const parts: { g: THREE.BufferGeometry; part: number; color: THREE.Color }[] = [];
  const trunk = up(new THREE.CylinderGeometry(0.2, 0.32, 8.6, 5, 1, true)).translate(0, 0, 4.3);
  parts.push({ g: trunk, part: 0, color: TRUNK });
  const fronds = 8;
  const pos: number[] = [];
  const prof = [[0, 8.7, 0], [1.3, 9.15, 0.5], [2.5, 8.85, 0.45], [3.5, 7.9, 0.0]];
  for (let k = 0; k < fronds; k++) {
    const a = (k / fronds) * Math.PI * 2 + (k % 2) * 0.2;
    const ca = Math.cos(a), sa = Math.sin(a);
    const droop = k % 2 ? 0.85 : 1.0;
    for (let s = 0; s < prof.length - 1; s++) {
      const [r0, z0, w0] = prof[s], [r1, z1, w1] = prof[s + 1];
      const P = (r: number, z: number, w: number) => [r * ca - w * sa, r * sa + w * ca, 8.7 + (z - 8.7) * droop];
      const a0 = P(r0, z0, -w0), b0 = P(r0, z0, w0), a1 = P(r1, z1, -w1), b1 = P(r1, z1, w1);
      pos.push(...a0, ...b0, ...b1, ...a0, ...b1, ...a1);
    }
  }
  const fg = new THREE.BufferGeometry();
  fg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  parts.push({ g: fg, part: 1, color: new THREE.Color("#5f9e3a") });
  return finish(parts);
}

export function roundTreeGeometry() {
  const trunk = up(new THREE.CylinderGeometry(0.18, 0.28, 2.8, 5, 1, true)).translate(0, 0, 1.4);
  const c1 = new THREE.IcosahedronGeometry(2.4, 0).scale(1, 1, 0.85).translate(0, 0, 4.0);
  const c2 = new THREE.IcosahedronGeometry(1.7, 0).scale(1, 1, 0.9).translate(0.9, 0.5, 5.2);
  return finish([
    { g: trunk, part: 0, color: TRUNK },
    { g: c1, part: 1, color: new THREE.Color("#5aa03c") },
    { g: c2, part: 1, color: new THREE.Color("#5aa03c") },
  ]);
}

export function shrubGeometry() {
  const c = new THREE.IcosahedronGeometry(1.3, 0).scale(1, 1, 0.75).translate(0, 0, 0.9);
  return finish([{ g: c, part: 1, color: new THREE.Color("#5aa03c") }]);
}

// canopy colours per tree type: 0 palm, 1 round, 2 jacaranda, 3 flame tree, 4 shrub/bougainvillea, 5 tall palm
export const CANOPY: Record<number, string[]> = {
  0: ["#6cb83e", "#7cc447", "#5eaa3a", "#88cc4e"],
  1: ["#5fb23f", "#4fa23a", "#74c04a", "#8ccd52", "#58a844"],
  2: ["#9b7fdc", "#8f70d4", "#a68be0"],
  3: ["#ea6a2e", "#f28236", "#e2552a"],
  4: ["#d64b9b", "#c43f8d", "#5ca23c", "#e070b0"],
  5: ["#6cb83e", "#7cc447"],
};
export const GEO_OF_TYPE = [0, 1, 1, 1, 2, 0]; // -> palm, round, shrub
export const SCALE_OF_TYPE = [1, 1, 1.1, 1.15, 1, 1.45];
