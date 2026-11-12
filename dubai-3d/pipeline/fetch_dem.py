"""Copernicus GLO-30 DEM -> bare-earth-ish terrain -> Terrarium PNG tiles in PMTiles.

GLO-30 is a *surface* model: Dubai's towers appear as 30 m pixel spikes. We remove them
with a grey-scale morphological opening (min then max filter, ~150 m window), then
smooth. Sea is clamped to 0. Output: public/tiles/terrain.pmtiles (z9..14, 256px)
and data/work/dem_3857.tif (used to bake tree/palm elevations).
"""
import json, os, math, subprocess, io, gzip
import numpy as np
from PIL import Image
from scipy import ndimage
from pmtiles.writer import Writer
from pmtiles.tile import zxy_to_tileid, TileType, Compression

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CFG = json.load(open(os.path.join(ROOT, "config/area.json")))
WORK = os.path.join(ROOT, "data/work"); os.makedirs(WORK, exist_ok=True)
OUT = os.path.join(ROOT, "public/tiles/terrain.pmtiles")
R = 6378137.0

def tiles_needed(w, s, e, n):
    for lat in range(math.floor(s), math.floor(n) + 1):
        for lon in range(math.floor(w), math.floor(e) + 1):
            ns = f"N{lat:02d}" if lat >= 0 else f"S{-lat:02d}"
            ew = f"E{lon:03d}" if lon >= 0 else f"W{-lon:03d}"
            name = f"Copernicus_DSM_COG_10_{ns}_00_{ew}_00_DEM"
            yield f"/vsicurl/https://copernicus-dem-30m.s3.amazonaws.com/{name}/{name}.tif"

def merc(lon, lat):
    return R * math.radians(lon), R * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))

def main():
    w, s, e, n = CFG["bbox"]
    pad = 0.03
    W, S, E, N = w - pad, s - pad, e + pad, n + pad
    src = list(tiles_needed(W, S, E, N))
    vrt = os.path.join(WORK, "dem.vrt")
    key = "_".join(f"{v:.4f}" for v in CFG["bbox"])
    raw = os.path.join(WORK, f"dem_3857_raw_{key}.tif")  # cache keyed by bbox
    if not os.path.exists(raw):
        subprocess.check_call(["gdalbuildvrt", "-q", vrt] + src)
        x0, y0 = merc(W, S); x1, y1 = merc(E, N)
        subprocess.check_call(["gdalwarp", "-q", "-overwrite", "-t_srs", "EPSG:3857", "-te", str(x0), str(y0), str(x1), str(y1),
                               "-tr", "20", "20", "-r", "bilinear", "-ot", "Float32", vrt, raw])
    # read via gdal_translate -> ENVI raw for numpy without python-gdal
    hdr = os.path.join(WORK, "dem_raw.bin")
    subprocess.check_call(["gdal_translate", "-q", "-of", "ENVI", raw, hdr])
    info = json.loads(subprocess.check_output(["gdalinfo", "-json", raw]))
    cols, rows = info["size"]; gt = info["geoTransform"]
    a = np.fromfile(hdr, dtype=np.float32).reshape(rows, cols)
    a = np.where(np.isfinite(a), a, 0)
    # bare-earth approximation: remove buildings (opening), then smooth
    a = ndimage.grey_opening(a, size=(9, 9))
    a = ndimage.gaussian_filter(a, 3)
    a = np.clip(a, 0, None)  # sea / reclaimed edges at >= 0 m
    a[a < 0.6] = 0
    # write processed DEM (used to bake vegetation z)
    a.astype(np.float32).tofile(hdr)
    subprocess.check_call(["gdal_translate", "-q", "-of", "GTiff", "-a_srs", "EPSG:3857",
                           "-a_ullr", str(gt[0]), str(gt[3]), str(gt[0] + gt[1] * cols), str(gt[3] + gt[5] * rows),
                           hdr, os.path.join(WORK, "dem_3857.tif")])
    print(f"DEM {cols}x{rows} min {a.min():.1f} max {a.max():.1f} m")

    def sample(xs, ys):
        c = (xs - gt[0]) / gt[1]; r = (ys - gt[3]) / gt[5]
        return ndimage.map_coordinates(a, [r, c], order=1, mode="nearest")

    C = 2 * math.pi * R
    with open(OUT, "wb") as f:
        wr = Writer(f); count = 0
        zmin, zmax = 9, 14
        ids = []
        for z in range(zmin, zmax + 1):
            nt = 2 ** z
            tx0 = int((merc(W, 0)[0] + C / 2) / C * nt); tx1 = int((merc(E, 0)[0] + C / 2) / C * nt)
            ty0 = int((C / 2 - merc(0, N)[1]) / C * nt); ty1 = int((C / 2 - merc(0, S)[1]) / C * nt)
            for x in range(tx0, tx1 + 1):
                for y in range(ty0, ty1 + 1):
                    ids.append((zxy_to_tileid(z, x, y), z, x, y))
        for tid, z, x, y in sorted(ids):
            nt = 2 ** z; size = C / nt; px = 256
            u = (np.arange(px) + 0.5) / px
            xs = -C / 2 + (x + u) * size
            ys = C / 2 - (y + u) * size
            X, Y = np.meshgrid(xs, ys)
            h = sample(X.ravel(), Y.ravel()).reshape(px, px)
            v = np.round((h + 32768) * 256).astype(np.int64)  # terrarium
            rgb = np.stack([(v >> 16) & 255, (v >> 8) & 255, v & 255], -1).astype(np.uint8)
            buf = io.BytesIO(); Image.fromarray(rgb, "RGB").save(buf, "PNG", optimize=True)
            wr.write_tile(tid, buf.getvalue()); count += 1
        wr.finalize({"tile_type": TileType.PNG, "tile_compression": Compression.NONE,
                     "min_zoom": zmin, "max_zoom": zmax,
                     "min_lon_e7": int(W * 1e7), "min_lat_e7": int(S * 1e7),
                     "max_lon_e7": int(E * 1e7), "max_lat_e7": int(N * 1e7),
                     "center_zoom": 12, "center_lon_e7": int(CFG["center"][0] * 1e7), "center_lat_e7": int(CFG["center"][1] * 1e7)},
                    {"name": "terrain", "encoding": "terrarium",
                     "attribution": "Copernicus DEM © DLR, Airbus DS"})
    print(f"[ok] terrain.pmtiles: {count} tiles")

if __name__ == "__main__":
    main()
