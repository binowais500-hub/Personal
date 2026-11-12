// Dubai Metro, simulated. No public RTA GTFS feed was reachable when this was built, so trains run on the
// real OSM track geometry with approximate published headways, operating hours and station dwell times.
import * as THREE from "three";
import { Geo, Meta } from "./geo";
import { DUBAI } from "./env";
import { mergeGeos } from "./vegetation";

const LINES: Record<string, { color: string; peak: number; off: number; late: number; atGrade?: boolean }> = {
  red: { color: "#d7322b", peak: 180, off: 300, late: 420 },
  green: { color: "#1f9d55", peak: 240, off: 360, late: 480 },
  // Dubai Tram (Al Sufouh / Marina / JBR): appears once the bbox is extended there
  tram: { color: "#3b6fd6", peak: 480, off: 600, late: 720, atGrade: true },
};
const CRUISE = 17;   // m/s average between stations incl. accel
const DWELL = 30;    // s
const DECK = 10.5;   // viaduct deck height, m
const CAR = 16.8, GAP = 0.9, CARS = 5;

/** Headway in seconds for a line at a Dubai-local time, or null outside operating hours. */
export function headway(line: string, d: Date): number | null {
  const L = LINES[line];
  const local = new Date(d.getTime() + DUBAI.utcOffsetMin * 60000);
  const dow = local.getUTCDay(); // 0 Sun .. 6 Sat (Dubai weekend: Sat-Sun)
  const m = local.getUTCHours() * 60 + local.getUTCMinutes();
  const prevDow = (dow + 6) % 7;
  if (m < 60 && prevDow === 5) return L.late; // Friday service runs until 01:00
  const open = dow === 0 ? 8 * 60 : 5 * 60;
  if (m < open) return null;
  const weekday = dow >= 1 && dow <= 5;
  const peak = weekday && ((m >= 420 && m < 600) || (m >= 1020 && m < 1200));
  if (peak) return L.peak;
  return m >= 22 * 60 ? L.late : L.off;
}

interface Track { key: string; pts: THREE.Vector3[]; zb: number[]; cum: number[]; len: number; stops: number[]; profA: number[][]; profB: number[][] }

export class Trains {
  group = new THREE.Group();
  tracks: Track[] = [];
  cars: THREE.InstancedMesh[] = [];
  note = "";

  constructor(private geo: Geo, meta: Meta, mat: THREE.ShaderMaterial, exag: number) {
    const S = geo.scale;
    const viaduct: THREE.BufferGeometry[] = [];
    for (const [key, raw] of Object.entries(meta.metro)) {
      if (!LINES[key] || raw.length < 2) continue;
      const pts = raw.map(([x, y, u]) => new THREE.Vector3(x, y, u));
      const zb = raw.map((r) => (r[3] ?? 0) * exag);
      const cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) / S);
      const len = cum[cum.length - 1];
      // project stations onto this line
      const stops: number[] = [];
      for (const st of meta.stations) {
        let best = 1e9, bs = 0;
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1], b = pts[i];
          const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
          const t = Math.max(0, Math.min(1, ((st.x - a.x) * dx + (st.y - a.y) * dy) / l2));
          const d = Math.hypot(a.x + dx * t - st.x, a.y + dy * t - st.y);
          if (d < best) { best = d; bs = cum[i - 1] + (cum[i] - cum[i - 1]) * t; }
        }
        if (best / S < 160 && bs > 50 && bs < len - 50) stops.push(bs);
      }
      stops.sort((a, b) => a - b);
      const profA = profile([0, ...stops, len]);
      const profB = profile([0, ...stops.map((s) => len - s).reverse(), len]);
      this.tracks.push({ key, pts, zb, cum, len, stops, profA, profB });
      if (!LINES[key].atGrade) viaduct.push(...this.viaductGeo(pts, zb, S));
    }
    if (viaduct.length) {
      const vm = new THREE.Mesh(mergeGeos(viaduct), mat);
      vm.renderOrder = 2;
      this.group.add(vm);
    }
    // cars: white body, dark window band, line-coloured skirt (instance colour)
    const body = (h0: number, h1: number, part: number, c: string) => {
      const g = new THREE.BoxGeometry(CAR, 3.0, h1 - h0).translate(0, 0, (h0 + h1) / 2).toNonIndexed();
      g.computeVertexNormals();
      const n = g.getAttribute("position").count, col = new THREE.Color(c), arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) col.toArray(arr, i * 3);
      g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
      g.setAttribute("aPart", new THREE.BufferAttribute(new Float32Array(n).fill(part), 1));
      g.deleteAttribute("uv");
      return g;
    };
    const carGeo = mergeGeos([body(0, 1.1, 1, "#ffffff"), body(1.1, 2.4, 0, "#2b3946"), body(2.4, 3.6, 0, "#f3f5f7")]);
    for (const tr of this.tracks) {
      const im = new THREE.InstancedMesh(carGeo, mat, 60 * CARS);
      im.frustumCulled = false; im.count = 0; im.renderOrder = 3;
      const c = new THREE.Color(LINES[tr.key].color);
      for (let i = 0; i < 60 * CARS; i++) im.setColorAt(i, c);
      this.cars.push(im); this.group.add(im);
    }
  }

  private viaductGeo(pts: THREE.Vector3[], zb: number[], S: number) {
    const out: THREE.BufferGeometry[] = [];
    const deckPos: number[] = [];
    const w = 4.6 * S;
    let since = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      if (a.z < 0.5 || b.z < 0.5) continue; // tunnel
      const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1, nx = (-dy / l) * w, ny = (dx / l) * w;
      const za = zb[i - 1], zbb = zb[i];
      const z0 = DECK - 1.4, z1 = DECK;
      const q = (x: number, y: number, z: number) => [x, y, z];
      const A0 = q(a.x + nx, a.y + ny, z1 + za), A1 = q(a.x - nx, a.y - ny, z1 + za), B0 = q(b.x + nx, b.y + ny, z1 + zbb), B1 = q(b.x - nx, b.y - ny, z1 + zbb);
      const a0 = q(a.x + nx, a.y + ny, z0 + za), a1 = q(a.x - nx, a.y - ny, z0 + za), b0 = q(b.x + nx, b.y + ny, z0 + zbb), b1 = q(b.x - nx, b.y - ny, z0 + zbb);
      deckPos.push(...A0, ...A1, ...B1, ...A0, ...B1, ...B0); // top
      deckPos.push(...a0, ...b0, ...B0, ...a0, ...B0, ...A0); // side
      deckPos.push(...a1, ...A1, ...B1, ...a1, ...B1, ...b1); // side
      since += l / S;
      if (since > 32) {
        since = 0;
        const p = new THREE.BoxGeometry(2.2 * S, 2.2 * S, z0 + 2).translate(b.x, b.y, zbb + z0 / 2 - 1);
        out.push(paintGeo(p, "#bdb8ae"));
      }
    }
    if (deckPos.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(deckPos, 3));
      out.push(paintGeo(g, "#cfcac0"));
    }
    return out;
  }

  update(now: Date) {
    const t = now.getTime() / 1000;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), zAxis = new THREE.Vector3(0, 0, 1);
    const S = this.geo.scale;
    const notes: string[] = [];
    this.tracks.forEach((tr, li) => {
      const im = this.cars[li];
      const H = headway(tr.key, now);
      let n = 0;
      if (H) {
        for (const [prof, dir] of [[tr.profA, 1], [tr.profB, -1]] as const) {
          const T = prof[prof.length - 1][0];
          const trains = Math.ceil(T / H);
          for (let k = 0; k < trains; k++) {
            const tau = (((t + (dir < 0 ? H / 2 : 0) - k * H) % (trains * H)) + trains * H) % (trains * H);
            if (tau > T) continue;
            let s = sample(prof, tau);
            if (dir < 0) s = tr.len - s;
            for (let c = 0; c < CARS; c++) {
              const sc = s - dir * (c * (CAR + GAP));
              if (sc < 0 || sc > tr.len) continue;
              const p = this.at(tr, sc);
              if (!p) continue;
              q.setFromAxisAngle(zAxis, p.ang);
              const deck = LINES[tr.key].atGrade ? 0.2 : DECK + 0.1;
              m.compose(new THREE.Vector3(p.x, p.y, (p.under ? -3 * DECK : deck) + p.zb), q, new THREE.Vector3(S, S, 1));
              im.setMatrixAt(n++, m);
            }
          }
        }
        notes.push(`${{ red: "Red", green: "Green", tram: "Tram" }[tr.key] ?? tr.key} every ${Math.round(H / 60)} min`);
      }
      im.count = n;
      im.instanceMatrix.needsUpdate = true;
    });
    this.note = notes.length ? `Metro simulated from published RTA headways (${notes.join(", ")}). Not live positions.` :
      "Metro closed now (simulated from RTA operating hours).";
  }

  private at(tr: Track, s: number) {
    const { cum, pts } = tr;
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= s) lo = mid; else hi = mid; }
    const a = pts[lo], b = pts[hi];
    const f = (s - cum[lo]) / ((cum[hi] - cum[lo]) || 1);
    const under = a.z < 0.5 || b.z < 0.5;
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, ang: Math.atan2(b.y - a.y, b.x - a.x), under, zb: tr.zb[lo] + (tr.zb[hi] - tr.zb[lo]) * f };
  }
}

/** Piecewise time->distance profile through stops: [[t, s, kind]] with eased runs and dwell. */
function profile(stops: number[]) {
  const P: number[][] = [[0, stops[0], 0]];
  let t = 0;
  for (let i = 1; i < stops.length; i++) {
    const d = stops[i] - stops[i - 1];
    t += d / CRUISE + 12;
    P.push([t, stops[i], 1]);
    if (i < stops.length - 1) { t += DWELL; P.push([t, stops[i], 0]); }
  }
  return P;
}
function sample(P: number[][], tau: number) {
  for (let i = 1; i < P.length; i++) {
    if (tau <= P[i][0]) {
      const [t0, s0] = P[i - 1], [t1, s1, moving] = P[i];
      if (!moving) return s0;
      const x = (tau - t0) / (t1 - t0);
      const e = x * x * (3 - 2 * x);
      return s0 + (s1 - s0) * (0.15 * x + 0.85 * e);
    }
  }
  return P[P.length - 1][1];
}

function paintGeo(g: THREE.BufferGeometry, hex: string) {
  const ng = g.index ? g.toNonIndexed() : g;
  ng.computeVertexNormals();
  const n = ng.getAttribute("position").count, c = new THREE.Color(hex), arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.toArray(arr, i * 3);
  ng.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  ng.setAttribute("aPart", new THREE.BufferAttribute(new Float32Array(n), 1));
  for (const k of Object.keys(ng.attributes)) if (!["position", "normal", "aPart", "color"].includes(k)) ng.deleteAttribute(k);
  return ng;
}
