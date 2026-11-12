#!/usr/bin/env bash
# Ground vector tiles (water, land use, roads, piers, flat footprints) -> public/tiles/dubai.pmtiles
set -euo pipefail
cd "$(dirname "$0")/.."
L=data/work/layers
command -v tippecanoe >/dev/null || { echo "tippecanoe not found (apt install tippecanoe / brew install tippecanoe)"; exit 1; }
tippecanoe -q --force -o public/tiles/dubai.pmtiles \
  -Z11 -z16 --no-tile-size-limit --no-feature-limit \
  --simplification=2 --detect-shared-borders --no-tiny-polygon-reduction-at-maximum-zoom \
  --attribution='© OpenStreetMap contributors · Overture Maps' \
  -L earth:$L/earth.geojsonl \
  -L water:$L/water.geojsonl \
  -L shoreline:$L/shoreline.geojsonl \
  -L landuse:$L/landuse.geojsonl \
  -L roads:$L/roads.geojsonl \
  -L piers:$L/piers.geojsonl \
  -L buildings:$L/buildings.geojsonl
ls -lh public/tiles/*.pmtiles
