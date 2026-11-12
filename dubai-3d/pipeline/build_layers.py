"""Normalise raw Overture/OSM features for the bbox into:
  data/work/layers/*.geojsonl   -> tippecanoe -> public/tiles/dubai.pmtiles (ground layers)
  public/tiles/b3d/*.json       -> chunked building footprints + vegetation for the 3D layer
  public/tiles/meta.json        -> scene origin, chunk index, landmarks, labels, metro lines
Heights, in order: Overture `height` (OSM height tag or other source) -> num_floors x 3.2 m
-> median of nearby known heights for similar footprints -> building-type default.
Landmarks in config/landmarks.json override everything.
"""
import json, os, math, random, hashlib, collections
import numpy as np
from shapely.geometry import shape, mapping, box, Point, LineString, Polygon, MultiPolygon
from shapely.ops import transform, unary_union, linemerge
from shapely.strtree import STRtree
from shapely import affinity
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CFG = json.load(open(os.path.join(ROOT, "config/area.json")))
LMK = json.load(open(os.path.join(ROOT, "config/landmarks.json")))["landmarks"]
RAW = os.path.join(ROOT, "data/raw")
LAY = os.path.join(ROOT, "data/work/layers"); os.makedirs(LAY, exist_ok=True)
PUB = os.path.join(ROOT, "public/tiles"); B3D = os.path.join(PUB, "b3d"); os.makedirs(B3D, exist_ok=True)
R = 6378137.0
CHUNK = 1200.0  # metres (EPSG:3857 units)

W, S, E, N = CFG["bbox"]
CLIP = box(W - 0.004, S - 0.004, E + 0.004, N + 0.004)
INNER = box(W, S, E, N)

def merc(lon, lat, z=None):
    x = R * np.radians(lon); y = R * np.log(np.tan(np.pi / 4 + np.radians(lat) / 2))
    return (x, y) if z is None else (x, y, z)
import shapely
def to_m(g): return shapely.transform(g, lambda c: np.column_stack(merc(c[:, 0], c[:, 1])))
OX, OY = (round(v) for v in merc((W + E) / 2, (S + N) / 2))
LAT0 = math.radians((S + N) / 2)
SCALE = 1 / math.cos(LAT0)  # mercator metres per real metre at the centre

def load(t):
    p = os.path.join(RAW, f"{t}.geojsonl")
    return [json.loads(l) for l in open(p)] if os.path.exists(p) else []

def h32(s):
    return int(hashlib.md5(str(s).encode()).hexdigest()[:8], 16)

def write(name, feats):
    with open(os.path.join(LAY, f"{name}.geojsonl"), "w") as fh:
        for g, p in feats:
            if g is None or g.is_empty: continue
            ft = {"type": "Feature", "geometry": mapping(g), "properties": p}
            p.pop("_mz", None)  # zoom gating is done in the map style (per-feature tippecanoe.minzoom dropped features)
            fh.write(json.dumps(ft) + "\n")
    print(f"  {name}: {len(feats)}")

def clipped(f, clip=CLIP):
    g = shape(f["geometry"])
    if not g.is_valid: g = g.buffer(0)
    if not g.intersects(clip): return None
    return g if clip.contains(g) else g.intersection(clip)

# ---------------- DEM sampling (processed bare-earth DEM from fetch_dem.py)
DEM = None
def dem_load():
    global DEM
    import subprocess
    tif = os.path.join(ROOT, "data/work/dem_3857.tif")
    info = json.loads(subprocess.check_output(["gdalinfo", "-json", tif]))
    binp = os.path.join(ROOT, "data/work/dem_raw.bin")
    cols, rows = info["size"]; gt = info["geoTransform"]
    DEM = (np.fromfile(binp, dtype=np.float32).reshape(rows, cols), gt)
def elev(xm, ym):
    a, gt = DEM
    c = (np.asarray(xm) - gt[0]) / gt[1]; r = (np.asarray(ym) - gt[3]) / gt[5]
    return ndimage.map_coordinates(a, [np.atleast_1d(r), np.atleast_1d(c)], order=1, mode="nearest")

# ---------------- ground layers
WATER_KIND = {"ocean": "sea", "physical": "sea", "canal": "creek", "river": "creek", "reservoir": "lake",
              "pond": "lake", "water": "lake"}
CONTEXT = box(W - 0.08, S - 0.08, E + 0.08, N + 0.08)
def build_earth():
    """Coastline-derived land polygons (OSM coastline via Overture). The map background is sea,
    so this gives a correct coastline even outside the detailed bbox (context ring)."""
    out = []
    for f in load("land"):
        p = f["properties"]
        if p.get("subtype") != "land" or p.get("class") not in ("land", "island", "islet"): continue
        g = clipped(f, CONTEXT)
        if g is not None and not g.is_empty and g.area > 0: out.append((g.simplify(0.00003), {"kind": "land"}))
    write("earth", out)
    return unary_union([g for g, _ in out])

def build_shoreline(earth, water_union):
    """Real shoreline LineStrings (sea/creek/lake edges) for the glow + foam layers. Drawing these on
    polygon outlines instead would also stroke tippecanoe's tile-clip edges and show tile seams."""
    wet = CONTEXT.difference(earth).union(water_union)
    edge = CONTEXT.exterior.buffer(0.0002)
    lines = wet.boundary.difference(edge)
    lines = linemerge(lines) if lines.geom_type == "MultiLineString" else lines
    parts = list(lines.geoms) if hasattr(lines, "geoms") else [lines]
    write("shoreline", [(g, {"kind": "shore"}) for g in parts if g.length > 0])

def build_water():
    out = []
    for f in load("water"):
        p = f["properties"]; st = p.get("subtype"); cl = p.get("class")
        if f["geometry"]["type"] not in ("Polygon", "MultiPolygon"): continue
        g = clipped(f)
        if g is None or g.is_empty: continue
        kind = "pool" if cl in ("swimming_pool", "reflecting_pool") else WATER_KIND.get(st, "lake")
        if cl in ("bay",): kind = "sea"
        if st == "ocean": continue  # the map background is the sea; coastline comes from `earth`
        nm = p.get("name") or ""
        if "خور" in nm or "قناة" in nm or "Creek" in nm or "Canal" in nm: kind = "creek"
        out.append((g, {"kind": kind, "name": p.get("name_en") or nm, **({"_mz": 14} if kind == "pool" else {})}))
    write("water", out)
    return unary_union([g for g, p in out if p["kind"] != "pool"])

LU = {  # (subtype, class) -> kind
    "park": "park", "garden": "garden", "grass": "grass", "flowerbed": "garden", "meadow": "grass",
    "orchard": "garden", "dog_park": "park", "recreation_ground": "park", "golf_course": "golf", "tee": "golf",
    "bunker": "sand", "pitch": "pitch", "playground": "park", "track": "pitch", "beach_resort": "beach",
    "resort": "park", "construction": "construction", "greenfield": "sand", "brownfield": "construction",
    "landfill": "sand", "residential": "residential", "commercial": "commercial", "retail": "commercial",
    "industrial": "industrial", "school": "civic", "kindergarten": "civic", "hospital": "civic", "clinic": "civic",
    "religious": "civic", "cemetery": "cemetery", "grave_yard": "cemetery", "pedestrian": "plaza", "plaza": "plaza",
    "marina": "plaza", "water_park": "park", "nature_reserve": "wetland", "species_management_area": "wetland",
    "garages": "commercial",
}
LAND = {"beach": "beach", "sand": "sand", "scrub": "scrub", "shrub": "scrub", "grassland": "grass",
        "wood": "wood", "forest": "wood", "wetland": "wetland"}
GREEN = {"park", "garden", "grass", "golf", "wood", "pitch"}

def build_landuse():
    out = []
    for f in load("land_use"):
        p = f["properties"]
        if f["geometry"]["type"] not in ("Polygon", "MultiPolygon"): continue
        k = LU.get(p.get("class")) or LU.get(p.get("subtype"))
        if p.get("subtype") == "managed": k = "grass"
        if not k: continue
        g = clipped(f)
        if g is not None and not g.is_empty: out.append((g, {"kind": k, "name": p.get("name_en") or p.get("name") or ""}))
    for f in load("land"):
        p = f["properties"]
        if f["geometry"]["type"] not in ("Polygon", "MultiPolygon"): continue
        k = LAND.get(p.get("class"))
        if not k: continue
        g = clipped(f)
        if g is not None and not g.is_empty: out.append((g, {"kind": k}))
    for f in load("infrastructure"):
        p = f["properties"]
        if f["geometry"]["type"] not in ("Polygon", "MultiPolygon"): continue
        k = {"parking": "parking", "pier": "pier", "breakwater": "pier", "platform": "plaza", "helipad": "plaza"}.get(p.get("class"))
        if not k: continue
        g = clipped(f)
        if g is not None and not g.is_empty: out.append((g, {"kind": k}))
    # draw order: big/background first
    order = ["residential", "commercial", "industrial", "civic", "construction", "sand", "beach", "cemetery",
             "scrub", "wetland", "parking", "plaza", "grass", "golf", "park", "garden", "wood", "pitch", "pier"]
    out.sort(key=lambda gp: (order.index(gp[1]["kind"]) if gp[1]["kind"] in order else 0, -gp[0].area))
    for i, (g, p) in enumerate(out): p["o"] = i
    write("landuse", out)
    return out

ROADK = {"motorway": "motorway", "trunk": "trunk", "primary": "primary", "secondary": "secondary",
         "tertiary": "tertiary", "residential": "minor", "unclassified": "minor", "living_street": "minor",
         "unknown": "minor", "service": "service", "footway": "path", "pedestrian": "path", "path": "path",
         "cycleway": "path", "steps": "path", "track": "service"}
def flag_ranges(js, key):
    if not js: return []
    try: arr = json.loads(js)
    except Exception: return []
    res = []
    for r in arr:
        if key in (r.get("values") or []):
            res.append(tuple(r.get("between") or (0.0, 1.0)))
    return res

def build_roads():
    out = []; rails = []
    for f in load("segment"):
        p = f["properties"]; st = p.get("subtype")
        g = shape(f["geometry"])
        if st == "road":
            k = ROADK.get(p.get("class"), "minor")
            bridges = flag_ranges(p.get("road_flags"), "is_bridge")
            tunnels = flag_ranges(p.get("road_flags"), "is_tunnel")
            gc = clipped(f)
            if gc is None or gc.is_empty: continue
            nm_ar = p.get("name_ar") or (p.get("name") if any("\u0600" <= ch <= "\u06ff" for ch in (p.get("name") or "")) else "")
            out.append((gc, {"kind": k, "name": p.get("name_en") or p.get("name") or "", "name_ar": nm_ar,
                             "_mz": {"path": 15, "service": 14, "minor": 13, "tertiary": 12}.get(k, 11),
                             "bridge": 1 if bridges else 0, "tunnel": 1 if tunnels and not bridges else 0}))
        elif st == "rail":
            rails.append((g, p))
    write("roads", out)
    return out, rails

def build_piers():
    out = []
    for f in load("infrastructure"):
        p = f["properties"]
        if p.get("class") in ("pier",) and f["geometry"]["type"] == "LineString":
            g = clipped(f)
            if g is not None and not g.is_empty: out.append((g, {"kind": "pier"}))
        if p.get("class") in ("bridge",) and f["geometry"]["type"] == "LineString":
            pass
    write("piers", out)

# ---------------- buildings
DEFAULT_H = {"house": 7, "residential": 12, "apartments": 24, "commercial": 14, "retail": 9, "roof": 5,
             "carport": 3, "mosque": 12, "parking": 12, "hotel": 40, "industrial": 9, "service": 5,
             "school": 10, "office": 30, "terrace": 8, "guardhouse": 3, "hospital": 18, "train_station": 14,
             "transportation": 10, "garage": 4, "warehouse": 9, "shed": 3, "kiosk": 3}

def lm_resolve(bgeoms, names, ids):
    """Return {building_index: landmark} for config landmarks inside the bbox.
    Match by `match` (names or GERS id prefixes) within 800 m, else the footprint containing /
    nearest to lon/lat within `radius` m."""
    tree = STRtree(bgeoms); res = {}
    for L in LMK:
        pt = Point(L["lon"], L["lat"])
        if not INNER.buffer(0.01).contains(pt):
            continue
        hits = []
        wanted = [m.lower() for m in L.get("match", [])]
        for i in tree.query(pt.buffer(800 / 111000)):
            nm = (names[i] or "").lower()
            if any(w in nm.split("|") or ids[i].startswith(w) for w in wanted): hits.append(i)
        if not hits:
            cands = list(tree.query(pt.buffer(L.get("radius", 40) / 111000)))
            if cands:
                hits = [min(cands, key=lambda i: (0 if bgeoms[i].contains(pt) else 1, bgeoms[i].distance(pt)))]
        if not hits:
            print(f"  ! landmark {L['id']}: no footprint found"); continue
        for i in hits: res[i] = L
        print(f"  landmark {L['id']} -> {[names[i] or ids[i][:8] for i in hits]}")
    return res

def build_buildings(water_union):
    bs = load("building"); parts = load("building_part")
    by_parent = collections.defaultdict(list)
    for f in parts: by_parent[f["properties"].get("building_id")].append(f)
    geoms, props = [], []
    for f in bs:
        g = shape(f["geometry"])
        if not g.is_valid: g = g.buffer(0)
        if g.is_empty or not g.intersects(CLIP): continue
        geoms.append(g); props.append(f["properties"])
    names = ["|".join(filter(None, [p.get("name"), p.get("name_en")])) for p in props]
    lmk = lm_resolve(geoms, names, [p["id"] for p in props])
    for i, p in enumerate(props):  # also allow the English common name to match
        pass
    gm = [to_m(g) for g in geoms]
    areas = np.array([g.area / SCALE**2 for g in gm])
    cent = np.array([[g.centroid.x, g.centroid.y] for g in gm])

    # explicit heights
    H = np.full(len(gm), np.nan); src = [""] * len(gm)
    for i, p in enumerate(props):
        if p.get("height"): H[i] = float(p["height"]); src[i] = "height"
        elif p.get("num_floors"): H[i] = float(p["num_floors"]) * 3.2 + 1.5; src[i] = "levels"
    known = ~np.isnan(H)
    # neighbourhood estimate for unknowns (median of known within 350 m with similar footprint size)
    from scipy.spatial import cKDTree
    kt = cKDTree(cent[known]); kh = H[known]; ka = areas[known]
    for i in np.where(~known)[0]:
        cls = props[i].get("class")
        a = areas[i]
        rnd = 0.85 + 0.3 * ((h32(props[i]["id"]) % 1000) / 1000)
        if cls in DEFAULT_H and cls not in ("residential", "commercial", "apartments", "hotel", "office"):
            H[i] = DEFAULT_H[cls] * rnd; src[i] = "type"; continue
        if a < 60: H[i] = 3.5 * rnd; src[i] = "area"; continue
        idx = kt.query_ball_point(cent[i], 350 * SCALE)
        sim = [j for j in idx if ka[j] / a < 3 and a / ka[j] < 3]
        if len(sim) >= 3:
            est = float(np.median(kh[sim]))
            if a < 350: est = min(est, 12)        # villas stay low
            H[i] = max(4, est * rnd); src[i] = "nearby"
        else:
            base = DEFAULT_H.get(cls, 9 if a < 400 else 15 if a < 1500 else 24)
            H[i] = base * rnd; src[i] = "type"
    print("  height sources:", collections.Counter(src))

    # chunked output
    chunks = collections.defaultdict(lambda: {"b": [], "t": []})
    flat = []
    lm_out = []
    def ring_dm(coords):
        arr = []
        cs = list(coords)[:-1]
        for x, y in cs:
            arr += [int(round((x - OX) * 10)), int(round((y - OY) * 10))]
        return arr
    def emit(gmerc, h, minh, color, lidx, seed, roof=0):
        gmerc = gmerc.simplify(0.25 * SCALE, preserve_topology=True)
        polys = list(gmerc.geoms) if isinstance(gmerc, MultiPolygon) else [gmerc]
        for poly in polys:
            if poly.is_empty or poly.area < 4: continue
            c = poly.representative_point()
            z = float(elev(c.x, c.y)[0])
            rings = [ring_dm(poly.exterior.coords)] + [ring_dm(r.coords) for r in poly.interiors if Polygon(r).area > 4]
            key = (int((c.x - OX) // CHUNK), int((c.y - OY) // CHUNK))
            chunks[key]["b"].append([round(h * 10), round(minh * 10), round(z * 10), color, lidx, seed % 997, rings])

    def color_for(i, h):
        r = h32(props[i]["id"]) % 100
        if h > 70:  # glassy towers: pale blue glass, silver, white
            return [6, 9, 9, 7, 11, 0, 0, 3][r % 8]
        if h > 25 and r >= 89: r = r % 34   # no terracotta / pink mid-rises
        if r < 34: return 0      # off-white
        if r < 56: return 1      # cream
        if r < 72: return 2      # sand
        if r < 82: return 3      # pale blue
        if r < 88: return 4      # pale pink
        if r < 92: return 5      # terracotta
        return 8                 # pale grey
    lm_index = {}
    for L in LMK: lm_index[L["id"]] = len(lm_index)
    for i, g in enumerate(gm):
        pid = props[i]["id"]; L = lmk.get(i)
        lidx = lm_index[L["id"]] if L else -1
        h = float(H[i])
        if L and L.get("height") and not by_parent.get(pid): h = float(L["height"])
        hc = max([float(pp["properties"].get("height") or 0) for pp in by_parent.get(pid, [])] + [h])
        col = color_for(i, hc)
        if L and L["id"] == "burj_khalifa": col = 11
        if L and not any(o["id"] == L["id"] for o in lm_out):
            c = geoms[i].centroid
            mrr = gm[i].minimum_rotated_rectangle
            xs, ys = mrr.exterior.coords.xy
            e1 = (xs[1] - xs[0], ys[1] - ys[0]); e2 = (xs[2] - xs[1], ys[2] - ys[1])
            lng = e1 if math.hypot(*e1) >= math.hypot(*e2) else e2
            lm_out.append({**L, "lon": c.x, "lat": c.y, "x": round(gm[i].centroid.x - OX, 1), "y": round(gm[i].centroid.y - OY, 1),
                           "z": float(elev(gm[i].centroid.x, gm[i].centroid.y)[0]),
                           "axis": math.degrees(math.atan2(lng[1], lng[0])),
                           "len": max(math.hypot(*e1), math.hypot(*e2)) / SCALE,
                           "wid": min(math.hypot(*e1), math.hypot(*e2)) / SCALE,
                           "height": L.get("height") or round(h), "idx": lidx})
        if L and L.get("shape") in ("torus", "frame"):
            flat.append((geoms[i], {"h": round(h)}))
            continue
        if by_parent.get(pid):
            ph = [float(pp["properties"].get("height") or 0) for pp in by_parent[pid]]
            scale = (L["height"] / max(ph)) if (L and L.get("height") and max(ph) > 0) else 1.0
            for pp in by_parent[pid]:
                pg = shape(pp["geometry"])
                if not pg.is_valid: pg = pg.buffer(0)
                q = pp["properties"]
                if q.get("is_underground"): continue
                ph_i = float(q.get("height") or (q.get("num_floors") or 0) * 3.2 or h)
                mh = float(q.get("min_height") or 0)
                if ph_i <= mh: continue
                emit(to_m(pg), ph_i * scale, mh * scale, col, lidx, h32(q["id"]))
        else:
            emit(g, h, 0, col, lidx, h32(pid))
        flat.append((geoms[i], {"h": round(h)}))
    for g, p in flat: p["_mz"] = 13
    write("buildings", flat)
    return chunks, lm_out, gm

# ---------------- vegetation
def build_vegetation(chunks, landuse, roads, water_union, bm, beach_polys):
    rng = random.Random(42)
    btree = STRtree(bm)
    wm = to_m(water_union) if not water_union.is_empty else None
    from shapely.prepared import prep
    wprep = prep(wm) if wm is not None else None
    # roads in metres for keeping trees off carriageways
    rgeo = [to_m(g) for g, p in roads if p["kind"] in ("motorway", "trunk", "primary", "secondary", "tertiary", "minor", "service") and not p["tunnel"]]
    rwid = [{"motorway": 16, "trunk": 16, "primary": 11, "secondary": 9, "tertiary": 7, "minor": 5, "service": 3.5}[p["kind"]]
            for g, p in roads if p["kind"] in ("motorway", "trunk", "primary", "secondary", "tertiary", "minor", "service") and not p["tunnel"]]
    rtree = STRtree(rgeo)
    pts = []  # (x, y, type, scale)  type: 0 palm, 1 round tree, 2 jacaranda, 3 flame, 4 shrub/bougainvillea, 5 tall palm
    def ok(x, y, clearance=2.0):
        p = Point(x, y)
        for i in btree.query(p.buffer(clearance * SCALE)):
            if bm[i].distance(p) < clearance * SCALE: return False
        if wprep is not None and wprep.contains(p): return False
        for i in rtree.query(p.buffer(20 * SCALE)):
            if rgeo[i].distance(p) < (rwid[i] / 2 + 1.0) * SCALE: return False
        return True
    def pick(mix):
        r = rng.random(); acc = 0
        for t, w in mix:
            acc += w
            if r < acc: return t
        return mix[-1][0]
    PARK_MIX = [(0, .42), (1, .36), (2, .08), (3, .08), (4, .06)]
    # 1) OSM tree points / rows
    for f in load("land"):
        p = f["properties"]
        if p.get("subtype") != "tree": continue
        g = shape(f["geometry"])
        if not g.intersects(CLIP): continue
        gm = to_m(g)
        if gm.geom_type == "Point":
            pts.append((gm.x, gm.y, pick(PARK_MIX), 0.9 + rng.random() * 0.4))
        elif gm.geom_type == "LineString":
            n = int(gm.length / (8 * SCALE))
            for k in range(n + 1):
                q = gm.interpolate(k / max(n, 1), normalized=True); pts.append((q.x, q.y, 0, 1.0))
    osm_n = len(pts)
    # 2) scatter inside green polygons
    DENS = {"park": 1 / 220, "garden": 1 / 160, "grass": 1 / 900, "golf": 1 / 1500, "wood": 1 / 60, "pitch": 0}
    for g, p in landuse:
        d = DENS.get(p["kind"])
        if not d: continue
        gm = to_m(g); area = gm.area / SCALE**2
        n = int(area * d)
        if n == 0: continue
        minx, miny, maxx, maxy = gm.bounds
        from shapely.prepared import prep as _p
        pg = _p(gm); tries = 0; placed = 0
        while placed < n and tries < n * 6:
            tries += 1
            x = rng.uniform(minx, maxx); y = rng.uniform(miny, maxy)
            if not pg.contains(Point(x, y)) or not ok(x, y): continue
            pts.append((x, y, pick(PARK_MIX), 0.8 + rng.random() * 0.5)); placed += 1
        # palms along park edges
        if p["kind"] in ("park", "garden") and area > 3000:
            ring = gm.exterior; L = ring.length / SCALE
            for k in range(int(L / 16)):
                q = ring.interpolate(k * 16 * SCALE)
                c = gm.centroid; dx, dy = c.x - q.x, c.y - q.y; dd = math.hypot(dx, dy) or 1
                x, y = q.x + dx / dd * 3 * SCALE, q.y + dy / dd * 3 * SCALE
                if ok(x, y): pts.append((x, y, 0, 1.0 + rng.random() * 0.3))
    park_n = len(pts) - osm_n
    # 3) palms along major roads (both verges), where OSM has none nearby
    have = STRtree([Point(x, y) for x, y, _, _ in pts]) if pts else None
    for g, p in roads:
        if p["kind"] not in ("trunk", "primary", "secondary") or p["bridge"] or p["tunnel"]: continue
        gm = to_m(g)
        lines = list(gm.geoms) if gm.geom_type == "MultiLineString" else [gm]
        off = {"trunk": 13, "primary": 10, "secondary": 8}[p["kind"]] * SCALE
        for ln in lines:
            if ln.length < 30 * SCALE: continue
            step = 15 * SCALE
            for side in (-1, 1):
                try: oln = ln.offset_curve(side * off)
                except Exception: continue
                if oln.is_empty: continue
                ols = list(oln.geoms) if oln.geom_type == "MultiLineString" else [oln]
                for o in ols:
                    for k in range(int(o.length / step)):
                        q = o.interpolate(k * step + rng.random() * 2)
                        if have is not None and len(have.query(q.buffer(6 * SCALE))): continue
                        if ok(q.x, q.y, 3): pts.append((q.x, q.y, 0 if rng.random() < .9 else 5, 0.95 + rng.random() * 0.25))
    road_n = len(pts) - osm_n - park_n
    # 4) beach palms: along the landward edge of beach polygons
    for g in beach_polys:
        gm = to_m(g)
        if gm.area / SCALE**2 < 2000: continue
        polys = list(gm.geoms) if gm.geom_type == "MultiPolygon" else [gm]
        for pl in polys:
            ring = pl.exterior
            for k in range(int(ring.length / (14 * SCALE))):
                q = ring.interpolate(k * 14 * SCALE)
                # landward side: not near the sea
                if wprep is not None and wm.distance(q) < 25 * SCALE: continue
                if ok(q.x, q.y, 2): pts.append((q.x, q.y, 0 if rng.random() < .8 else 5, 1.0 + rng.random() * 0.3))
    beach_n = len(pts) - osm_n - park_n - road_n
    print(f"  vegetation: osm {osm_n}, parks {park_n}, road palms {road_n}, beach palms {beach_n}")
    xs = np.array([p[0] for p in pts]); ys = np.array([p[1] for p in pts]); zs = elev(xs, ys) if pts else []
    for (x, y, t, s), z in zip(pts, zs):
        if not INNER.buffer(0.004).contains(Point(*transform_inv(x, y))): continue
        key = (int((x - OX) // CHUNK), int((y - OY) // CHUNK))
        chunks[key]["t"] += [int(round((x - OX) * 10)), int(round((y - OY) * 10)), int(round(z * 10)), t, int(s * 100)]
    return len(pts)

def transform_inv(x, y):
    return math.degrees(x / R), math.degrees(2 * math.atan(math.exp(y / R)) - math.pi / 2)

# ---------------- metro
def build_metro(rails):
    lines = collections.defaultdict(list)
    big = CLIP.buffer(0.02)
    for g, p in rails:
        if p.get("class") not in ("subway", "tram", "light_rail"): continue
        if not g.intersects(big): continue
        nm = p.get("name") or ""
        key = ("red" if "Red" in nm else "green" if "Green" in nm else "trolley" if "Trolley" in nm
               else "tram" if ("Tram" in nm or "ترام" in nm) else "other")
        tunnels = flag_ranges(p.get("rail_flags"), "is_tunnel")
        lines[key].append((g, tunnels))
    out = {}
    for key, segs in lines.items():
        if key == "other": continue
        mls = []
        for g, tun in segs:
            # split into elevated (z=1) / tunnel (z=0) vertices
            gm = to_m(g); L = gm.length
            coords = list(gm.coords); acc = [0]
            for a, b in zip(coords, coords[1:]): acc.append(acc[-1] + math.dist(a, b))
            pts = []
            for (x, y), d in zip(coords, acc):
                t = d / L if L else 0
                under = any(a <= t <= b for a, b in tun)
                pts.append((x, y, 0 if under else 1))
            mls.append(pts)
        # merge the segment chains greedily by endpoints
        chains = merge_chains(mls)
        best = max(chains, key=lambda c: len(c))
        clip_m = to_m(big)
        keep = [(x, y, u) for x, y, u in best if clip_m.contains(Point(x, y))]
        zz = elev([k[0] for k in keep], [k[1] for k in keep]) if keep else []
        pts = [(round(x - OX, 1), round(y - OY, 1), u, round(float(z), 1)) for (x, y, u), z in zip(keep, zz)]
        out[key] = pts
    print("  metro:", {k: len(v) for k, v in out.items()})
    st = []
    for f in load("infrastructure"):
        p = f["properties"]
        if p.get("class") == "subway_station":
            g = shape(f["geometry"]).centroid; x, y = merc(g.x, g.y)
            st.append({"name": p.get("name_en") or p.get("name"), "name_ar": p.get("name_ar") or p.get("name"),
                       "x": round(float(x) - OX, 1), "y": round(float(y) - OY, 1), "z": round(float(elev(x, y)[0]), 1)})
    seen = set(); stations = []
    for s_ in st:
        k = s_["name"].lower().replace(" ", "")
        if k in seen: continue
        seen.add(k); stations.append(s_)
    return out, stations

def merge_chains(chains):
    chains = [list(c) for c in chains if len(c) > 1]
    tol = 3.0
    def close(a, b): return math.dist(a[:2], b[:2]) < tol
    merged = True
    while merged and len(chains) > 1:
        merged = False
        for i in range(len(chains)):
            for j in range(len(chains)):
                if i == j: continue
                a, b = chains[i], chains[j]
                if close(a[-1], b[0]): chains[i] = a + b[1:]
                elif close(a[-1], b[-1]): chains[i] = a + b[::-1][1:]
                elif close(a[0], b[-1]): chains[i] = b + a[1:]
                elif close(a[0], b[0]): chains[i] = b[::-1] + a[1:]
                else: continue
                chains.pop(j); merged = True; break
            if merged: break
    return chains

# ---------------- labels
def build_labels(roads):
    labels = []
    seen = set()
    for f in load("division"):
        p = f["properties"]
        if p.get("subtype") not in ("macrohood", "neighborhood", "locality", "microhood"): continue
        en = p.get("name_en"); ar = p.get("name_ar") or p.get("name")
        if not en or en in seen or en == "Dubai": continue
        g = shape(f["geometry"])
        if not INNER.contains(g): continue
        seen.add(en)
        x, y = merc(g.x, g.y)
        rank = {"locality": 3, "neighborhood": 2, "macrohood": 2, "microhood": 1}[p["subtype"]]
        if en in ("Downtown Dubai", "Business Bay", "Dubai International Financial Centre", "Deira", "Bur Dubai", "Jumeirah", "Al Karama", "Za'abeel 2", "Al Shindagha"): rank = 3
        labels.append({"t": "district", "en": en, "ar": ar, "x": round(float(x) - OX), "y": round(float(y) - OY), "r": rank,
                       "z": round(float(elev(x, y)[0]), 1)})
    # roads: longest merged named major road
    byname = collections.defaultdict(list); arname = {}
    for g, p in roads:
        if p["kind"] in ("motorway", "trunk", "primary") and p["name"] and not p["tunnel"]:
            byname[p["name"]].append(to_m(g))
            if p.get("name_ar"): arname[p["name"]] = p["name_ar"]
    for nm, gs in byname.items():
        tot = sum(g.length for g in gs) / SCALE
        if tot < 1200: continue
        longest = max(gs, key=lambda g: g.length)
        q = longest.interpolate(0.5, normalized=True)
        a = longest.interpolate(0.45, normalized=True); b = longest.interpolate(0.55, normalized=True)
        labels.append({"t": "road", "en": nm, "ar": arname.get(nm, ""), "x": round(q.x - OX), "y": round(q.y - OY),
                       "z": round(float(elev(q.x, q.y)[0]), 1),
                       "a": round(math.degrees(math.atan2(b.y - a.y, b.x - a.x)), 1), "r": 2 if tot > 3000 else 1})
    print("  labels:", collections.Counter(l["t"] for l in labels))
    return labels

def main():
    print("ground layers"); dem_load()
    earth = build_earth()
    water_union = build_water()
    build_shoreline(earth, water_union)
    landuse = build_landuse()
    roads, rails = build_roads()
    build_piers()
    print("buildings")
    chunks, landmarks, bm = build_buildings(water_union)
    print("vegetation")
    beach = [g for g, p in landuse if p["kind"] == "beach"]
    build_vegetation(chunks, landuse, roads, water_union, bm, beach)
    print("metro + labels")
    metro, stations = build_metro(rails)
    labels = build_labels(roads)
    # Arabic road names
    for f in []: pass
    # write chunks
    for old in os.listdir(B3D): os.remove(os.path.join(B3D, old))
    index = []
    for (i, j), c in sorted(chunks.items()):
        fn = f"{i}_{j}.json"
        with open(os.path.join(B3D, fn), "w") as fh: json.dump(c, fh, separators=(",", ":"))
        index.append({"i": i, "j": j, "nb": len(c["b"]), "nt": len(c["t"]) // 5})
    meta = {"origin": [OX, OY], "lat0": math.degrees(LAT0), "chunk": CHUNK, "bbox": CFG["bbox"], "cameras": CFG["cameras"],
            "terrainExaggeration": CFG["terrainExaggeration"], "chunks": index, "landmarks": landmarks,
            "labels": labels, "metro": metro, "stations": stations}
    with open(os.path.join(PUB, "meta.json"), "w") as fh: json.dump(meta, fh, separators=(",", ":"), ensure_ascii=False)
    tot = sum(os.path.getsize(os.path.join(B3D, f)) for f in os.listdir(B3D))
    print(f"[ok] {len(index)} chunks, {sum(c['nb'] for c in index)} building prisms, {sum(c['nt'] for c in index)} trees, {tot/1e6:.1f} MB")

if __name__ == "__main__":
    main()
