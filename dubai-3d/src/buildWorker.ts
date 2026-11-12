/// <reference lib="webworker" />
// Builds compact building meshes (walls + earcut roofs) and swept-shadow geometry for one chunk.
import earcut from "earcut";

// record: [h_dm, minh_dm, z_dm, colorIdx, landmarkIdx, seed, rings(dm)[]]
type Rec = [number, number, number, number, number, number, number[][]];
interface Chunk { b: Rec[]; t: number[] }

// pastel palette (sRGB 0..255) + glass flag
const PALETTE: [number, number, number, number][] = [
  [250, 247, 240, 0], [247, 237, 214, 0], [236, 218, 182, 0], [214, 230, 242, 0], [246, 222, 212, 0], [222, 150, 108, 0],
  [186, 216, 238, 1], [200, 226, 230, 1], [232, 234, 238, 0], [222, 232, 244, 1], [218, 182, 100, 0], [226, 230, 236, 0],
];

// extra pastel variety for low/mid-rise facades (picked by building seed)
const PASTELS: [number, number, number][] = [
  [255, 214, 196], [255, 236, 170], [196, 236, 214], [206, 222, 255], [232, 210, 250],
  [255, 200, 214], [190, 230, 240], [250, 224, 190], [214, 240, 186], [244, 246, 250],
  [255, 190, 150], [170, 214, 246],
];
const GLASS: [number, number, number][] = [[150, 200, 240], [140, 214, 226], [176, 196, 246], [200, 230, 250]];

class Buf {
  pos: number[] = []; nrm: number[] = []; col: number[] = []; ext: number[] = []; idx: number[] = [];
  get n() { return this.pos.length / 3; }
}

function area(r: number[]) {
  let a = 0;
  for (let i = 0, n = r.length / 2; i < n; i++) {
    const j = (i + 1) % n;
    a += r[i * 2] * r[j * 2 + 1] - r[j * 2] * r[i * 2 + 1];
  }
  return a / 2;
}
function reverse(r: number[]) {
  const o: number[] = [];
  for (let i = r.length / 2 - 1; i >= 0; i--) o.push(r[i * 2], r[i * 2 + 1]);
  return o;
}

self.onmessage = (ev: MessageEvent<{ id: string; chunk: Chunk; scale: number }>) => {
  const { id, chunk, scale } = ev.data;
  const B = new Buf();
  const S = { pos: [] as number[], sh: [] as number[], idx: [] as number[] };
  for (const rec of chunk.b) {
    const [hdm, mdm, zdm, ci, li, seed, ringsDm] = rec;
    const h = hdm / 10, mh = mdm / 10, base = zdm / 10;
    if (h - mh < 0.5) continue;
    let pal = PALETTE[ci] ?? PALETTE[0];
    if (li < 0) {
      // colourful town: most non-landmark buildings get a saturated pastel, glass towers a tinted blue/teal
      const r = (seed * 7919) % 100;
      if (pal[3]) pal = [...GLASS[seed % GLASS.length], 1];
      else if (r < 72) pal = [...PASTELS[seed % PASTELS.length], 0];
    }
    const tall = h > 6 ? 1 : 0;
    // kind: 0 wall w/ windows, 1 roof, 2 wall without windows; +4 glass facade
    const wallKind = (tall ? 0 : 2) + (pal[3] ? 4 : 0);
    const rings = ringsDm.map((r, k) => {
      let m = r.map((v) => v / 10);
      const a = area(m);
      if ((k === 0 && a < 0) || (k > 0 && a > 0)) m = reverse(m);
      return m;
    });
    // walls
    for (const r of rings) {
      const n = r.length / 2;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const ax = r[i * 2], ay = r[i * 2 + 1], bx = r[j * 2], by = r[j * 2 + 1];
        const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
        if (len < 0.05) continue;
        const nx = dy / len, ny = -dx / len, lenReal = len / scale;
        const v0 = B.n;
        B.pos.push(ax, ay, mh, bx, by, mh, bx, by, h, ax, ay, h);
        for (let k = 0; k < 4; k++) {
          B.nrm.push(Math.round(nx * 127), Math.round(ny * 127), 0, 0);
          B.col.push(pal[0], pal[1], pal[2], li + 1);
        }
        B.ext.push(0, base, seed, wallKind, lenReal, base, seed, wallKind, lenReal, base, seed, wallKind, 0, base, seed, wallKind);
        B.idx.push(v0, v0 + 1, v0 + 2, v0, v0 + 2, v0 + 3);
      }
    }
    // roof
    const flat: number[] = []; const holes: number[] = [];
    rings.forEach((r, k) => { if (k > 0) holes.push(flat.length / 2); flat.push(...r); });
    const tri = earcut(flat, holes, 2);
    const v0 = B.n;
    // roofs: mostly light, some terracotta / teal / sand on low-rise for a toy-town look
    const rr = (seed * 104729) % 100;
    const roofPal: [number, number, number] | null = h < 25 && rr < 22 ? ([[222, 120, 84], [92, 186, 186], [236, 196, 120], [200, 110, 130]][rr % 4] as [number, number, number]) : null;
    const rc = roofPal ? roofPal[0] : Math.min(255, pal[0] * 1.05), gc = roofPal ? roofPal[1] : Math.min(255, pal[1] * 1.05), bc = roofPal ? roofPal[2] : Math.min(255, pal[2] * 1.05);
    for (let i = 0; i < flat.length / 2; i++) {
      B.pos.push(flat[i * 2], flat[i * 2 + 1], h);
      B.nrm.push(0, 0, 127, 0);
      B.col.push(rc, gc, bc, li + 1);
      B.ext.push(0, base, seed, 1);
    }
    for (const t of tri) B.idx.push(v0 + t);

    // swept shadow volume (outer ring sides + translated roof cap); flag 1 = displaced by sun vector * height
    const r = rings[0], n = r.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, s0 = S.pos.length / 3;
      S.pos.push(r[i * 2], r[i * 2 + 1], base, r[j * 2], r[j * 2 + 1], base, r[j * 2], r[j * 2 + 1], base, r[i * 2], r[i * 2 + 1], base);
      S.sh.push(h, 0, h, 0, h, 1, h, 1);
      S.idx.push(s0, s0 + 1, s0 + 2, s0, s0 + 2, s0 + 3);
    }
    const c0 = S.pos.length / 3;
    const capTri = earcut(r, undefined, 2);
    for (let i = 0; i < n; i++) { S.pos.push(r[i * 2], r[i * 2 + 1], base); S.sh.push(h, 1); }
    for (const t of capTri) S.idx.push(c0 + t);
  }
  const out = {
    id,
    pos: new Float32Array(B.pos), nrm: new Int8Array(B.nrm), col: new Uint8Array(B.col), ext: new Float32Array(B.ext),
    idx: new Uint32Array(B.idx),
    spos: new Float32Array(S.pos), ssh: new Float32Array(S.sh), sidx: new Uint32Array(S.idx),
    trees: new Int32Array(chunk.t),
  };
  (self as unknown as Worker).postMessage(out, [out.pos.buffer, out.nrm.buffer, out.col.buffer, out.ext.buffer, out.idx.buffer,
    out.spos.buffer, out.ssh.buffer, out.sidx.buffer, out.trees.buffer]);
};
