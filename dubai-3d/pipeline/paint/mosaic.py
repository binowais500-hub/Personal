"""Blend overlapping painted tiles (feathered margins) into a raster PMTiles pyramid.

Each painted image covers its z{zoom} tile plus `marginPx` of the neighbours on every side.
For every output tile we take a weighted average of all painted images that cover it, with
weights that ramp from 1 inside the core to 0 at the outer margin edge, which hides seams.
Output: public/tiles/painted.pmtiles (WebP, z{outputMinZoom}..{outputMaxZoom}).
"""
import json, os, sys, io, glob, math
import numpy as np
from PIL import Image
from pmtiles.writer import Writer
from pmtiles.tile import zxy_to_tileid, TileType, Compression

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CFG = json.load(open(os.path.join(ROOT, "config/paint.json")))
DIR = os.path.join(ROOT, "data/paint")
provider = sys.argv[1] if len(sys.argv) > 1 else CFG["provider"]
Z, SIZE = CFG["zoom"], CFG["imageSize"]
FR = CFG["renderMarginPx"] / (CFG["renderCorePx"] + 2 * CFG["renderMarginPx"])  # margin fraction per side
M = SIZE * FR
ZMAX, ZMIN = CFG["outputMaxZoom"], CFG["outputMinZoom"]
CORE = SIZE - 2 * M
OUT = 256 * 2 ** (ZMAX - Z)  # output pixels per painted tile core

idx = {}
for f in glob.glob(os.path.join(DIR, "index", f"{Z}_*_{provider}.json")):
    j = json.load(open(f)); idx[(j["x"], j["y"])] = os.path.join(DIR, j["file"])
if not idx:
    print("  nothing painted yet"); sys.exit(0)

def load(xy):
    im = Image.open(idx[xy]).convert("RGB")
    if im.size != (SIZE, SIZE): im = im.resize((SIZE, SIZE), Image.LANCZOS)
    # rescale so the core maps to OUT px
    s = OUT / CORE
    return np.asarray(im.resize((round(SIZE * s), round(SIZE * s)), Image.LANCZOS), dtype=np.float32), s

ramp_cache = {}
def weight(n, m):
    if (n, m) in ramp_cache: return ramp_cache[(n, m)]
    t = np.ones(n, np.float32)
    r = np.linspace(0, 1, 2 * m, dtype=np.float32)  # 0 at outer edge -> 1 at m inside the core
    t[: 2 * m] = r; t[-2 * m:] = r[::-1]
    w = np.outer(t, t); ramp_cache[(n, m)] = w
    return w

tiles = {}  # (z,x,y) -> webp bytes
cache = {}
for (x, y) in sorted(idx):
    acc = np.zeros((OUT, OUT, 3), np.float32); wacc = np.zeros((OUT, OUT, 1), np.float32)
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            k = (x + dx, y + dy)
            if k not in idx: continue
            if k not in cache: cache[k] = load(k)
            img, s = cache[k]
            m = round(M * s); n = img.shape[0]
            w = weight(n, m)[..., None]
            # neighbour image origin relative to this tile's core origin
            ox, oy = dx * OUT - m, dy * OUT - m
            x0, y0 = max(0, ox), max(0, oy); x1, y1 = min(OUT, ox + n), min(OUT, oy + n)
            if x1 <= x0 or y1 <= y0: continue
            acc[y0:y1, x0:x1] += img[y0 - oy:y1 - oy, x0 - ox:x1 - ox] * w[y0 - oy:y1 - oy, x0 - ox:x1 - ox]
            wacc[y0:y1, x0:x1] += w[y0 - oy:y1 - oy, x0 - ox:x1 - ox]
    big = Image.fromarray(np.clip(acc / np.maximum(wacc, 1e-4), 0, 255).astype(np.uint8))
    k = 2 ** (ZMAX - Z)
    for i in range(k):
        for j in range(k):
            t = big.crop((i * 256, j * 256, i * 256 + 256, j * 256 + 256))
            b = io.BytesIO(); t.save(b, "WEBP", quality=86); tiles[(ZMAX, x * k + i, y * k + j)] = b.getvalue()
    if len(cache) > 30: cache.clear()
print(f"  z{ZMAX}: {len(tiles)} tiles")

# pyramid
for z in range(ZMAX - 1, ZMIN - 1, -1):
    parents = {}
    for (zz, x, y) in [k for k in tiles if k[0] == z + 1]:
        parents.setdefault((x // 2, y // 2), []).append((x, y))
    for (x, y), kids in parents.items():
        canvas = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
        for (cx, cy) in kids:
            canvas.paste(Image.open(io.BytesIO(tiles[(z + 1, cx, cy)])).convert("RGBA"), ((cx - 2 * x) * 256, (cy - 2 * y) * 256))
        b = io.BytesIO(); canvas.resize((256, 256), Image.LANCZOS).save(b, "WEBP", quality=86); tiles[(z, x, y)] = b.getvalue()

area = json.load(open(os.path.join(ROOT, "config/area.json")))
w_, s_, e_, n_ = area["bbox"]
out = os.path.join(ROOT, "public/tiles/painted.pmtiles")
with open(out, "wb") as f:
    wr = Writer(f)
    for (z, x, y) in sorted(tiles, key=lambda k: zxy_to_tileid(*k)):
        wr.write_tile(zxy_to_tileid(z, x, y), tiles[(z, x, y)])
    wr.finalize({"tile_type": TileType.WEBP, "tile_compression": Compression.NONE, "min_zoom": ZMIN, "max_zoom": ZMAX,
                 "min_lon_e7": int(w_ * 1e7), "min_lat_e7": int(s_ * 1e7), "max_lon_e7": int(e_ * 1e7), "max_lat_e7": int(n_ * 1e7),
                 "center_zoom": 15, "center_lon_e7": int(area["center"][0] * 1e7), "center_lat_e7": int(area["center"][1] * 1e7)},
                {"name": "painted", "attribution": "Painted with AI"})
print(f"[ok] {out}: {len(tiles)} tiles")
