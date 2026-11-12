// Scene coordinates: x east / y north in EPSG:3857 metres relative to `origin`,
// z up in real metres. The model matrix maps this into MapLibre's mercator [0..1] space.
export const C = 2 * Math.PI * 6378137;

export interface Meta {
  origin: [number, number];
  lat0: number;
  chunk: number;
  bbox: [number, number, number, number];
  cameras: Record<string, { center: [number, number]; zoom: number; pitch: number; bearing: number }>;
  terrainExaggeration: number;
  chunks: { i: number; j: number; nb: number; nt: number }[];
  landmarks: Landmark[];
  labels: Label[];
  metro: Record<string, [number, number, number, number][]>;
  stations: { name: string; name_ar: string; x: number; y: number; z: number }[];
}
export interface Landmark {
  id: string; idx: number; name: string; name_ar: string; height?: number; year?: number;
  shape: "data" | "torus" | "frame"; x: number; y: number; z: number; axis: number; len: number; wid: number;
}
export interface Label { t: "district" | "road"; en: string; ar: string; x: number; y: number; z: number; r: number; a?: number }

export class Geo {
  scale: number; // mercator metres per real metre
  constructor(public meta: Meta) {
    this.scale = 1 / Math.cos((meta.lat0 * Math.PI) / 180);
  }
  /** column-major model matrix (scene -> mercator 0..1) */
  modelMatrix(): number[] {
    const [ox, oy] = this.meta.origin;
    const s = 1 / C;
    return [s, 0, 0, 0, 0, -s, 0, 0, 0, 0, this.scale / C, 0, (ox + C / 2) / C, (C / 2 - oy) / C, 0, 1];
  }
  toLngLat(x: number, y: number): [number, number] {
    const mx = x + this.meta.origin[0], my = y + this.meta.origin[1];
    return [(mx / 6378137) * (180 / Math.PI), (2 * Math.atan(Math.exp(my / 6378137)) - Math.PI / 2) * (180 / Math.PI)];
  }
  fromLngLat(lng: number, lat: number): [number, number] {
    const mx = 6378137 * (lng * Math.PI) / 180;
    const my = 6378137 * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
    return [mx - this.meta.origin[0], my - this.meta.origin[1]];
  }
}

export function mul4(a: ArrayLike<number>, b: ArrayLike<number>): Float64Array {
  const o = new Float64Array(16);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
  return o;
}

export function invert4(m: ArrayLike<number>): Float64Array | null {
  const a = Array.from(m), o = new Float64Array(16);
  const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = a;
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return null;
  det = 1 / det;
  o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det; o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det; o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det; o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det; o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det; o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det; o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det; o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det; o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
  return o;
}

export function project(m: ArrayLike<number>, x: number, y: number, z: number): [number, number, number, number] {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
    m[3] * x + m[7] * y + m[11] * z + m[15],
  ];
}
