"""Fetch Overture Maps GeoParquet for the configured bbox straight from the public
S3 bucket (anonymous, HTTP range reads; only row groups intersecting the bbox are read).

Overture's base / transportation / buildings themes are derived from OpenStreetMap
(ODbL) plus other open sources, so this is our OSM source too: one schema, no Overpass
load, no full-country extract. Output: data/raw/<type>.geojsonl (cached; --force refetches).
"""
import json, os, sys, time, argparse
from concurrent.futures import ThreadPoolExecutor
import pyarrow.dataset as ds, pyarrow.fs as pfs, pyarrow.compute as pc
from shapely import wkb
from shapely.geometry import mapping

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CFG = json.load(open(os.path.join(ROOT, "config/area.json")))
RAW = os.path.join(ROOT, "data/raw")

TYPES = {  # type -> theme
    "building": "buildings", "building_part": "buildings",
    "segment": "transportation",
    "land": "base", "land_use": "base", "water": "base", "infrastructure": "base",
    "division": "divisions",
}
KEEP = ["id", "subtype", "class", "height", "min_height", "num_floors", "roof_shape",
        "roof_height", "level", "is_underground", "facade_color", "roof_color",
        "building_id", "elevation", "is_salt", "is_intermittent", "surface"]

def s3():
    proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")
    kw = dict(anonymous=True, region="us-west-2")
    if proxy:
        kw["proxy_options"] = proxy
    return pfs.S3FileSystem(**kw)

def fetch(t, force=False):
    out = os.path.join(RAW, f"{t}.geojsonl")
    stamp = {"bbox": CFG["bbox"], "release": CFG["overtureRelease"]}
    sp = out + ".meta.json"
    if os.path.exists(out) and os.path.exists(sp) and json.load(open(sp)) == stamp and not force:
        print(f"[cache] {t}"); return
    w, s, e, n = CFG["bbox"]
    path = f"overturemaps-us-west-2/release/{CFG['overtureRelease']}/theme={TYPES[t]}/type={t}/"
    t0 = time.time()
    d = ds.dataset(path, filesystem=s3(), format="parquet")
    names = set(d.schema.names)
    cols = [c for c in KEEP if c in names] + ["geometry"]
    if "names" in names: cols.append("names")
    if "sources" in names: cols.append("sources")
    for extra in ("road_flags", "rail_flags", "road_surface"):
        if extra in names: cols.append(extra)
    if "subclass" in names: cols.append("subclass")
    f = ((pc.field("bbox", "xmin") < e) & (pc.field("bbox", "xmax") > w) &
         (pc.field("bbox", "ymin") < n) & (pc.field("bbox", "ymax") > s))
    tb = d.to_table(filter=f, columns=cols)
    tmp = out + ".tmp"
    with open(tmp, "w") as fh:
        for row in tb.to_pylist():
            g = wkb.loads(row.pop("geometry"))
            props = {k: v for k, v in row.items() if v is not None and k not in ("names", "sources", "road_flags", "rail_flags", "road_surface")}
            nm = row.get("names") or {}
            if nm.get("primary"): props["name"] = nm["primary"]
            common = nm.get("common") or {}
            if isinstance(common, list): common = dict(common)
            if common.get("en"): props["name_en"] = common["en"]
            if common.get("ar"): props["name_ar"] = common["ar"]
            srcs = row.get("sources") or []
            props["src"] = ",".join(sorted({x.get("dataset", "") for x in srcs if x}))
            # OSM ids for buildings let us honour OSM height tags via provenance
            for x in srcs:
                if x and x.get("dataset") == "OpenStreetMap" and x.get("record_id"):
                    props["osm"] = x["record_id"]; break
            for extra in ("road_flags", "rail_flags"):
                if row.get(extra): props[extra] = json.dumps(row[extra])
            fh.write(json.dumps({"type": "Feature", "geometry": mapping(g), "properties": props}) + "\n")
    os.replace(tmp, out)
    json.dump(stamp, open(sp, "w"))
    print(f"[ok] {t}: {tb.num_rows} features in {time.time()-t0:.0f}s")

if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--force", action="store_true")
    ap.add_argument("types", nargs="*"); a = ap.parse_args()
    os.makedirs(RAW, exist_ok=True)
    ts = a.types or list(TYPES)
    with ThreadPoolExecutor(3) as ex:
        list(ex.map(lambda t: fetch(t, a.force), ts))
