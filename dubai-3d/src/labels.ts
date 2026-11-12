// DOM labels projected with the 3D layer's own matrix: districts, major roads, metro stations and landmarks.
// DOM text gives correct Arabic shaping with system fonts and needs no glyph server.
import { Meta, project } from "./geo";

interface Item { el: HTMLElement; x: number; y: number; z: number; rank: number; kind: string; minZoom: number; lm?: number; ang?: number }

export class Labels {
  items: Item[] = [];
  lang: "en" | "ar" = "en";
  visible = true;
  constructor(private root: HTMLElement, private meta: Meta, private exag: number, private onLandmark: (idx: number) => void) {
    this.build();
  }
  build() {
    this.root.innerHTML = "";
    this.items = [];
    const add = (text: string, cls: string, x: number, y: number, z: number, rank: number, minZoom: number, extra: Partial<Item> = {}) => {
      if (!text) return;
      const el = document.createElement("div");
      el.className = `lbl ${cls}`;
      el.textContent = text;
      if (this.lang === "ar") el.dir = "rtl";
      this.root.appendChild(el);
      this.items.push({ el, x, y, z, rank, kind: cls.split(" ")[0], minZoom, ...extra });
    };
    const T = (en: string, ar: string) => (this.lang === "ar" ? ar || en : en);
    for (const L of this.meta.landmarks) {
      if (L.x === undefined) continue;
      add(T(L.name, L.name_ar), "landmark", L.x, L.y, L.z * this.exag + (L.height ?? 40) + 12, 10, L.height && L.height > 250 ? 12.5 : 14.2, { lm: L.idx });
    }
    for (const l of this.meta.labels) {
      if (l.t === "district") add(T(l.en, l.ar), `district r${l.r}`, l.x, l.y, l.z * this.exag + 30, 5 + l.r, l.r >= 3 ? 11 : l.r === 2 ? 13.6 : 15);
      else add(T(l.en, l.ar), "road", l.x, l.y, l.z * this.exag + 2, 2 + l.r, l.r >= 2 ? 14.6 : 15.6, { ang: l.a });
    }
    for (const s of this.meta.stations) add(`Ⓜ ${T(s.name, s.name_ar)}`, "station", s.x, s.y, (s.z ?? 0) * this.exag + 14, 3, 15.2);
    this.items.sort((a, b) => b.rank - a.rank);
    for (const it of this.items) if (it.lm !== undefined) {
      const idx = it.lm;
      it.el.addEventListener("click", (e) => { e.stopPropagation(); this.onLandmark(idx); });
    }
  }
  setLang(l: "en" | "ar") { this.lang = l; this.build(); }

  update(m: ArrayLike<number>, w: number, h: number, zoom: number, bearing: number) {
    const placed: [number, number, number, number][] = [];
    for (const it of this.items) {
      const show = this.visible || it.kind === "landmark";
      if (!show || zoom < it.minZoom) { it.el.style.display = "none"; continue; }
      const c = project(m, it.x, it.y, it.z);
      if (c[3] <= 0) { it.el.style.display = "none"; continue; }
      const sx = ((c[0] / c[3] + 1) / 2) * w, sy = ((1 - c[1] / c[3]) / 2) * h;
      if (sx < -100 || sx > w + 100 || sy < 40 || sy > h + 40) { it.el.style.display = "none"; continue; }
      it.el.style.display = "block";
      const bw = it.el.offsetWidth, bh = it.el.offsetHeight;
      const x0 = sx - bw / 2, y0 = it.kind === "landmark" ? sy - bh - 6 : sy - bh / 2;
      const box: [number, number, number, number] = [x0 - 4, y0 - 2, x0 + bw + 4, y0 + bh + 2];
      if (placed.some((p) => !(box[2] < p[0] || box[0] > p[2] || box[3] < p[1] || box[1] > p[3]))) { it.el.style.display = "none"; continue; }
      placed.push(box);
      let rot = "";
      if (it.ang !== undefined) {
        let a = -(it.ang) - bearing;
        a = ((a + 540) % 360) - 180;
        if (a > 90) a -= 180; if (a < -90) a += 180;
        rot = ` rotate(${a.toFixed(1)}deg)`;
      }
      it.el.style.transform = `translate(${x0.toFixed(1)}px, ${y0.toFixed(1)}px)${rot}`;
    }
  }
}
