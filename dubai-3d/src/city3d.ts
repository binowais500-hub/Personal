// Three.js custom layer: buildings, soft swept shadows, vegetation, landmarks and trains.
import * as THREE from "three";
import type { Map as MLMap, CustomLayerInterface, CustomRenderMethodInput } from "maplibre-gl";
import { Geo, Meta, mul4, invert4 } from "./geo";
import { Env } from "./env";
import { buildingVS, buildingFS, litVS, litFS, shadowVS, shadowFS } from "./shaders";
import { palmGeometry, roundTreeGeometry, shrubGeometry, CANOPY, GEO_OF_TYPE, SCALE_OF_TYPE, mergeGeos } from "./vegetation";
import { Trains } from "./trains";

interface ChunkState {
  key: string; i: number; j: number; cx: number; cy: number; status: "queued" | "loading" | "ready";
  group?: THREE.Group; shadow?: THREE.Mesh; trees?: THREE.InstancedMesh[]; treeCount?: number[];
}

export class City3D implements CustomLayerInterface {
  id = "city3d";
  type = "custom" as const;
  renderingMode = "3d" as const;
  map!: MLMap;
  renderer!: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  /** ground shadows are drawn in their own pass before the buildings */
  shadowScene = new THREE.Scene();
  camera = new THREE.Camera();
  geo: Geo;
  chunks = new Map<string, ChunkState>();
  workers: Worker[] = [];
  inflight = 0;
  uniforms: Record<string, THREE.IUniform>;
  bMat: THREE.ShaderMaterial; lMat: THREE.ShaderMaterial; iMat: THREE.ShaderMaterial; sMat: THREE.ShaderMaterial;
  treeGeos: THREE.BufferGeometry[];
  trains: Trains;
  showTrains = true;
  /** continuous animation (trains, sway). `?static` turns it off for automated screenshots. */
  animate = true;
  exag: number;
  /** scene->clip matrix of the last frame (for labels) */
  lastMatrix: Float64Array | null = null;
  onFrame: ((m: Float64Array) => void) | null = null;
  mobile: boolean;
  base: string;
  private nextJob = 0;
  private queue: string[] = [];
  private lastUpdate = 0;
  private t0 = performance.now();

  constructor(public meta: Meta, opts: { mobile: boolean; base: string }) {
    this.base = opts.base;
    this.geo = new Geo(meta);
    this.mobile = opts.mobile;
    this.exag = meta.terrainExaggeration;
    const u = (v: unknown) => ({ value: v });
    this.uniforms = {
      uSunDir: u(new THREE.Vector3(0, 0, 1)), uSunColor: u(new THREE.Color(1, 1, 1)), uSunI: u(1),
      uSkyAmb: u(new THREE.Color(0.8, 0.85, 0.9)), uGroundAmb: u(new THREE.Color(0.9, 0.85, 0.8)),
      uFogColor: u(new THREE.Color(0.9, 0.93, 0.95)), uFogNear: u(1500), uFogFar: u(9000),
      uCam: u(new THREE.Vector3()), uScale: u(this.geo.scale), uNight: u(0), uTime: u(0), uExag: u(this.exag),
      uHL: u(-1), uSway: u(1), uEmissive: u(0),
      uShadowVec: u(new THREE.Vector2()), uShadowColor: u(new THREE.Color("#3a4a78")), uShadowA: u(0.25),
    };
    this.bMat = new THREE.ShaderMaterial({ vertexShader: buildingVS, fragmentShader: buildingFS, uniforms: this.uniforms });
    const litOpts = { vertexShader: litVS, fragmentShader: litFS, vertexColors: true, side: THREE.DoubleSide };
    this.lMat = new THREE.ShaderMaterial({ ...litOpts, uniforms: this.uniforms });
    this.iMat = new THREE.ShaderMaterial({ ...litOpts, uniforms: { ...this.uniforms, uEmissive: { value: 0.0 } } });
    this.sMat = new THREE.ShaderMaterial({
      vertexShader: shadowVS, fragmentShader: shadowFS, uniforms: this.uniforms, transparent: true, depthWrite: false, depthTest: false,
      side: THREE.DoubleSide,
      // each pixel is darkened at most once, however many shadow polygons overlap
      stencilWrite: true, stencilRef: 1, stencilFunc: THREE.NotEqualStencilFunc, stencilZPass: THREE.ReplaceStencilOp,
      stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp,
    });
    this.treeGeos = [palmGeometry(), roundTreeGeometry(), shrubGeometry()];
    this.trains = new Trains(this.geo, meta, this.lMat, this.exag);
    this.scene.add(this.trains.group);
    this.addLandmarkShapes();
  }

  onAdd(map: MLMap, gl: WebGL2RenderingContext) {
    this.map = map;
    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: !this.mobile });
    this.renderer.autoClear = false;
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    const nw = Math.min(2, Math.max(1, (navigator.hardwareConcurrency || 2) - 1));
    for (let i = 0; i < nw; i++) {
      const w = new Worker(new URL("./buildWorker.ts", import.meta.url), { type: "module" });
      w.onmessage = (e) => this.onBuilt(e.data);
      this.workers.push(w);
    }
  }

  onRemove() { this.workers.forEach((w) => w.terminate()); }

  setEnv(env: Env) {
    const U = this.uniforms;
    (U.uSunDir.value as THREE.Vector3).set(...env.sunDir);
    (U.uSunColor.value as THREE.Color).setRGB(...env.sunColor);
    U.uSunI.value = env.sunIntensity;
    (U.uSkyAmb.value as THREE.Color).setRGB(...env.skyAmbient);
    (U.uGroundAmb.value as THREE.Color).setRGB(...env.groundAmbient);
    (U.uFogColor.value as THREE.Color).setRGB(...env.fogColor);
    U.uFogNear.value = env.fogNear; U.uFogFar.value = env.fogFar;
    U.uNight.value = env.night;
    (this.iMat.uniforms.uEmissive as THREE.IUniform).value = 0;
    // shadow vector (mercator metres per metre of height), clamped for low sun
    const alt = Math.max(env.altitude, 4) * Math.PI / 180;
    const len = Math.min(1 / Math.tan(alt), 6) * this.geo.scale;
    (U.uShadowVec.value as THREE.Vector2).set(-env.sunDir[0], -env.sunDir[1]).normalize().multiplyScalar(len);
    U.uShadowA.value = 0.3 * Math.min(1, env.sunIntensity * 1.4) * (1 - env.overcast * 0.6);
    this.map?.triggerRepaint();
  }

  highlight(idx: number) { this.uniforms.uHL.value = idx; this.map?.triggerRepaint(); }

  // ---------- chunk streaming
  private updateChunks() {
    const c = this.map.getCenter();
    const [tx, ty] = this.geo.fromLngLat(c.lng, c.lat);
    const z = this.map.getZoom(), pitch = this.map.getPitch();
    const R = Math.min(16000, Math.max(1800, 2600 * Math.pow(2, 15 - z) * (1 + pitch / 45)));
    const S = this.meta.chunk;
    const want: { key: string; d: number; i: number; j: number }[] = [];
    for (const ch of this.meta.chunks) {
      const cx = (ch.i + 0.5) * S, cy = (ch.j + 0.5) * S;
      const d = Math.hypot(cx - tx, cy - ty);
      const key = `${ch.i}_${ch.j}`;
      if (d < R + S) { if (!this.chunks.has(key)) want.push({ key, d, i: ch.i, j: ch.j }); }
      else if (d > R * 1.8 + S) this.unload(key);
    }
    for (const w of want) this.chunks.set(w.key, { key: w.key, i: w.i, j: w.j, cx: (w.i + 0.5) * S, cy: (w.j + 0.5) * S, status: "queued" });
    this.queue = [...this.chunks.values()].filter((c) => c.status === "queued")
      .sort((a, b) => Math.hypot(a.cx - tx, a.cy - ty) - Math.hypot(b.cx - tx, b.cy - ty)).map((c) => c.key);
    this.pump();
    // tree LOD
    const treeR = z < 13.6 ? 0 : Math.min(5000, 1700 * Math.pow(2, 16 - z) * (1 + pitch / 60));
    for (const ch of this.chunks.values()) {
      if (!ch.trees) continue;
      const d = Math.hypot(ch.cx - tx, ch.cy - ty);
      const frac = d < treeR * 0.55 ? 1 : d < treeR ? 0.45 : 0;
      ch.trees.forEach((m, k) => { m.visible = frac > 0; m.count = Math.floor(ch.treeCount![k] * frac); });
    }
  }

  private pump() {
    const maxInflight = this.workers.length * 2;
    while (this.inflight < maxInflight && this.queue.length) {
      const key = this.queue.shift()!;
      const ch = this.chunks.get(key);
      if (!ch || ch.status !== "queued") continue;
      ch.status = "loading";
      this.inflight++;
      fetch(`${this.base}tiles/b3d/${key}.json`)
        .then((r) => r.json())
        .then((chunk) => {
          const w = this.workers[this.nextJob++ % this.workers.length];
          w.postMessage({ id: key, chunk, scale: this.geo.scale });
        })
        .catch((e) => { console.warn("chunk", key, e); this.inflight--; this.chunks.delete(key); });
    }
  }

  private onBuilt(d: {
    id: string; pos: Float32Array; nrm: Int8Array; col: Uint8Array; ext: Float32Array; idx: Uint32Array;
    spos: Float32Array; ssh: Float32Array; sidx: Uint32Array; trees: Int32Array;
  }) {
    this.inflight--;
    this.pump();
    const ch = this.chunks.get(d.id);
    if (!ch) return;
    const group = new THREE.Group();
    if (d.idx.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(d.pos, 3));
      g.setAttribute("aNormal", new THREE.BufferAttribute(d.nrm, 4, true));
      g.setAttribute("aColor", new THREE.BufferAttribute(d.col, 4, true));
      g.setAttribute("aExt", new THREE.BufferAttribute(d.ext, 4));
      g.setIndex(new THREE.BufferAttribute(d.idx, 1));
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, this.bMat); m.renderOrder = 2; group.add(m);
      const sg = new THREE.BufferGeometry();
      sg.setAttribute("position", new THREE.BufferAttribute(d.spos, 3));
      sg.setAttribute("aSh", new THREE.BufferAttribute(d.ssh, 2));
      sg.setIndex(new THREE.BufferAttribute(d.sidx, 1));
      sg.boundingSphere = g.boundingSphere!.clone(); sg.boundingSphere.radius += 1500;
      const sm = new THREE.Mesh(sg, this.sMat);
      this.shadowScene.add(sm); ch.shadow = sm;
    }
    // vegetation: one InstancedMesh per geometry kind
    const t = d.trees, n = t.length / 5;
    const byGeo: number[][] = [[], [], []];
    for (let k = 0; k < n; k++) byGeo[GEO_OF_TYPE[t[k * 5 + 3]] ?? 1].push(k);
    const trees: THREE.InstancedMesh[] = []; const counts: number[] = [];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), zAxis = new THREE.Vector3(0, 0, 1), col = new THREE.Color();
    byGeo.forEach((list, gi) => {
      if (!list.length) return;
      // shuffle so a prefix (LOD) is spatially uniform
      for (let a = list.length - 1; a > 0; a--) { const b = (a * 7919) % (a + 1); [list[a], list[b]] = [list[b], list[a]]; }
      const im = new THREE.InstancedMesh(this.treeGeos[gi], this.iMat, list.length);
      list.forEach((k, ii) => {
        // trees are drawn ~1.5x life size so they read at city scale, like a model railway
        const x = t[k * 5] / 10, y = t[k * 5 + 1] / 10, z = (t[k * 5 + 2] / 10) * this.exag, type = t[k * 5 + 3], s = 1.5 * (t[k * 5 + 4] / 100) * (SCALE_OF_TYPE[type] ?? 1);
        q.setFromAxisAngle(zAxis, ((k * 2654435761) % 6283) / 1000);
        m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s * this.geo.scale, s * this.geo.scale, s));
        im.setMatrixAt(ii, m4);
        // more blossom: a share of plain shade trees flower purple, orange, pink or yellow
        let ct = type;
        const hsh = (k * 2654435761) % 100;
        if (type === 1 && hsh < 34) ct = [2, 3, 4, 2][hsh % 4];
        const pal = CANOPY[ct] ?? CANOPY[1];
        im.setColorAt(ii, col.set(hsh > 96 && type === 1 ? "#ffd23a" : pal[(k * 31) % pal.length]));
      });
      im.computeBoundingSphere();
      im.renderOrder = 3;
      group.add(im); trees.push(im); counts.push(list.length);
    });
    ch.group = group; ch.trees = trees; ch.treeCount = counts; ch.status = "ready";
    this.scene.add(group);
    this.lastUpdate = 0;
    this.map.triggerRepaint();
  }

  private unload(key: string) {
    const ch = this.chunks.get(key);
    if (!ch) return;
    if (ch.shadow) { this.shadowScene.remove(ch.shadow); ch.shadow.geometry.dispose(); }
    if (ch.group) {
      this.scene.remove(ch.group);
      ch.group.traverse((o) => { if ((o as THREE.Mesh).geometry && !(o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.Mesh).geometry.dispose(); if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose(); });
    }
    this.chunks.delete(key);
  }

  get loadedRatio() {
    let r = 0, t = 0;
    for (const c of this.chunks.values()) { t++; if (c.status === "ready") r++; }
    return t ? r / t : 0;
  }

  // ---------- procedural landmark shapes (Museum of the Future torus, Dubai Frame)
  private addLandmarkShapes() {
    const S = this.geo.scale;
    for (const L of this.meta.landmarks) {
      if (L.shape !== "torus" && L.shape !== "frame") continue;
      let g: THREE.BufferGeometry;
      if (L.shape === "torus") {
        const tube = 0.42;
        g = new THREE.TorusGeometry(1, tube, 24, 64);
        g.rotateX(Math.PI / 2);
        const len = Math.max(L.len, 70), H = L.height ?? 77;
        g.scale(len / 2 / (1 + tube), Math.max(L.wid, 28) / (2 * tube), H / 2 / (1 + tube));
        g.translate(0, 0, H / 2 + 4);
        g = this.paint(g, "#b9c2cc");
      } else {
        const len = Math.max(L.len, 90), H = L.height ?? 150, legW = len * 0.17, dep = Math.max(Math.min(L.wid, 30), 14), top = H * 0.17;
        const legA = new THREE.BoxGeometry(legW, dep, H).translate(-len / 2 + legW / 2, 0, H / 2);
        const legB = new THREE.BoxGeometry(legW, dep, H).translate(len / 2 - legW / 2, 0, H / 2);
        const bridge = new THREE.BoxGeometry(len, dep, top).translate(0, 0, H - top / 2);
        g = mergeGeos([this.paint(legA, "#d8b25e"), this.paint(legB, "#d8b25e"), this.paint(bridge, "#d8b25e")]);
      }
      g.rotateZ((L.axis * Math.PI) / 180);
      g.scale(S, S, 1);
      g.translate(L.x, L.y, L.z * this.exag);
      const m = new THREE.Mesh(g, this.lMat);
      m.renderOrder = 2;
      this.scene.add(m);
    }
  }
  private paint(g: THREE.BufferGeometry, hex: string) {
    const ng = g.index ? g.toNonIndexed() : g;
    if (!ng.getAttribute("normal")) ng.computeVertexNormals();
    const n = ng.getAttribute("position").count, c = new THREE.Color(hex), arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) c.toArray(arr, i * 3);
    ng.setAttribute("color", new THREE.BufferAttribute(arr, 3));
    ng.setAttribute("aPart", new THREE.BufferAttribute(new Float32Array(n), 1));
    for (const k of Object.keys(ng.attributes)) if (!["position", "normal", "aPart", "color"].includes(k)) ng.deleteAttribute(k);
    return ng;
  }

  // ---------- frame
  render(gl: WebGL2RenderingContext, args: CustomRenderMethodInput) {
    const now = performance.now();
    if (now - this.lastUpdate > 250) { this.lastUpdate = now; this.updateChunks(); }
    // mainMatrix maps web-mercator [0..1] (z conformal) to clip space
    const mvp = mul4(args.defaultProjectionData.mainMatrix as unknown as number[], this.geo.modelMatrix());
    this.lastMatrix = mvp;
    this.camera.projectionMatrix.fromArray(Array.from(mvp));
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
    // camera position in scene space (unproject the near-plane centre)
    const inv = invert4(mvp);
    if (inv) {
      const w = inv[3] * 0 + inv[7] * 0 + inv[11] * -1 + inv[15];
      (this.uniforms.uCam.value as THREE.Vector3).set((inv[8] * -1 + inv[12]) / w, (inv[9] * -1 + inv[13]) / w, (inv[10] * -1 + inv[14]) / w);
    }
    const t = (now - this.t0) / 1000;
    this.uniforms.uTime.value = t;
    this.trains.group.visible = this.showTrains;
    if (this.showTrains) this.trains.update(new Date());
    this.renderer.resetState();
    gl.clearStencil(0); gl.clear(gl.STENCIL_BUFFER_BIT);
    this.renderer.render(this.shadowScene, this.camera);
    gl.clear(gl.STENCIL_BUFFER_BIT);
    this.renderer.render(this.scene, this.camera);
    this.onFrame?.(mvp);
    // keep animating (sway, trains, highlight). Throttled to ~30 fps on mobile.
    if (!this.animate) return;
    if (this.mobile) setTimeout(() => this.map.triggerRepaint(), 33); else this.map.triggerRepaint();
  }
}
