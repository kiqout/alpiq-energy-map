#!/usr/bin/env python3
"""Build the local 3D Switzerland scene assets for Alpiq Energy Atlas.

Outputs:
  public/terrain/ch_satellite.jpg       swisstopo SWISSIMAGE orthophoto
  public/terrain/ch_hillshade.png       swisstopo swissALTI3D multidirectional relief
  public/terrain/ch_night_radiance.png  2024 VIIRS annual night radiance
  public/terrain/ch_mask.png            Swiss national outline mask
  public/terrain/ch_height_u16.bin      Copernicus DEM GLO-30 height grid
  public/terrain/ch_vectors.json        canton, lake, river and city overlays in LV95
  public/terrain/ch_scene.json          dimensions and coordinate metadata

The elevation model is Copernicus DEM GLO-30 (DSM, 30 m source grid). It is
resampled to a compact regular mesh for WebGL. SWISSIMAGE is an orthophoto
(aerial-photo mosaic), not a satellite sensor product. VIIRS provides the
actual night-radiance layer; the browser shader adds only restrained glow.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import io
import json
import math
import os
import sys
import time
from pathlib import Path

import numpy as np
import rasterio
import requests
from PIL import Image, ImageDraw
from pyproj import Transformer
from rasterio.enums import Resampling
from rasterio.merge import merge
from rasterio.transform import from_bounds, from_origin
from rasterio.warp import reproject, transform_bounds

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
TERRAIN = PUBLIC / "terrain"
GEO = PUBLIC / "geo"
CACHE = ROOT / ".cache" / "swiss-terrain"

# Public source assets.
WMS_URL = "https://wms.geo.admin.ch/"
WMTS_URL = "https://wmts.geo.admin.ch/1.0.0/{layer}/default/current/3857/{z}/{x}/{y}.{ext}"
SWISSIMAGE_LAYER = "ch.swisstopo.swissimage"
HILLSHADE_LAYER = "ch.swisstopo.swissalti3d-reliefschattierung"
COP_DEM_BUCKET = "https://copernicus-dem-30m.s3.amazonaws.com"
COP_DEM_90_BUCKET = "https://copernicus-dem-90m.s3.amazonaws.com"
VIIRS_URL = (
    "https://zenodo.org/records/17294744/files/"
    "nightlights.average_viirs.v21_m_500m_s_20240101_20241231_go_epsg4326_v20250904.tif?download=1"
)
VIIRS_FILENAME = "viirs_annual_2024.tif"

# LV95 bounding box is calculated from the supplied Swiss national border and padded in main().
OUT_WIDTH = 4096
HEIGHT_WIDTH = 2048
HEIGHT_MAX_METRES = 6000.0
VERTICAL_EXAGGERATION = 6.5
WMTS_ZOOM = 10
WEBMERCATOR_LIMIT = 20037508.342789244
TILE_SIZE = 256
USER_AGENT = "Alpiq-Energy-Atlas/1.0 (local Swiss 3D terrain builder)"

CITY_LABELS = [
    (8.5481, 47.3819, "Zürich"),
    (6.14, 46.21, "Geneva"),
    (7.59, 47.5804, "Basel"),
    (7.467, 46.9167, "Bern"),
    (6.65, 46.5304, "Lausanne"),
    (8.28, 47.0504, "Lucerne"),
    (8.9667, 46.0004, "Lugano"),
    (9.362, 47.423, "St. Gallen"),
    (9.5, 46.85, "Chur"),
    (7.25, 47.1666, "Biel/Bienne"),
]


def safe_request(url: str, *, params: dict | None = None, timeout: int = 90) -> requests.Response:
    response = requests.get(url, params=params, headers={"User-Agent": USER_AGENT}, timeout=timeout)
    response.raise_for_status()
    return response


def read_detail() -> dict:
    path = GEO / "switzerland-detail.json"
    if not path.exists():
        raise FileNotFoundError(f"Missing {path.relative_to(ROOT)}")
    return json.loads(path.read_text(encoding="utf-8"))


def transformed_lines(detail: dict, transformer: Transformer) -> dict:
    def convert_rings(lines):
        out = []
        for ring in lines:
            points = []
            for lon, lat in ring:
                x, y = transformer.transform(float(lon), float(lat))
                points.append([round(x, 2), round(y, 2)])
            if len(points) >= 2:
                out.append(points)
        return out

    border = convert_rings(detail["border"])
    cantons = convert_rings(detail["cantons"])
    lakes = convert_rings(detail["lakes"])
    rivers = convert_rings(detail["rivers"])

    labels = [(lon, lat, name) for lon, lat, name in CITY_LABELS]
    cities = []
    for lon, lat, population in detail.get("cities", []):
        if not any(min(abs(lon - cx), 360 - abs(lon - cx)) < 0.045 and abs(lat - cy) < 0.045 for cx, cy, _ in labels):
            continue
        name = min(labels, key=lambda c: abs(c[0] - lon) + abs(c[1] - lat))[2]
        x, y = transformer.transform(float(lon), float(lat))
        cities.append({"x": round(x, 2), "y": round(y, 2), "population": int(population), "name": name})

    return {"border": border, "cantons": cantons, "lakes": lakes, "rivers": rivers, "cities": cities}


def compute_bounds(vectors: dict, margin: float = 6500.0):
    pts = [p for ring in vectors["border"] for p in ring]
    if not pts:
        raise RuntimeError("The Switzerland border is empty.")
    min_x = min(p[0] for p in pts) - margin
    min_y = min(p[1] for p in pts) - margin
    max_x = max(p[0] for p in pts) + margin
    max_y = max(p[1] for p in pts) + margin
    return (min_x, min_y, max_x, max_y)


def get_wms_image(layer: str, bounds: tuple[float, float, float, float], width: int, height: int, image_format: str):
    min_x, min_y, max_x, max_y = bounds
    params = {
        "SERVICE": "WMS", "VERSION": "1.3.0", "REQUEST": "GetMap",
        "LAYERS": layer, "STYLES": "default", "CRS": "EPSG:2056",
        "BBOX": f"{min_x},{min_y},{max_x},{max_y}",
        "WIDTH": str(width), "HEIGHT": str(height), "FORMAT": image_format,
    }
    response = safe_request(WMS_URL, params=params)
    content_type = response.headers.get("Content-Type", "").lower()
    if not content_type.startswith("image/"):
        raise RuntimeError(f"WMS layer {layer} returned {content_type or 'unknown content'}: {response.text[:180]}")
    image = Image.open(io.BytesIO(response.content))
    if image.size != (width, height):
        image = image.resize((width, height), Image.Resampling.LANCZOS)
    return image


def tile_xy(lon: float, lat: float, zoom: int):
    n = 1 << zoom
    x = int(math.floor((lon + 180.0) / 360.0 * n))
    lat_rad = math.radians(max(-85.05112878, min(85.05112878, lat)))
    y = int(math.floor((1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n))
    return max(0, min(n - 1, x)), max(0, min(n - 1, y))


def get_wmts_mosaic(layer: str, bounds_lv95, zoom: int, extension: str) -> tuple[Image.Image, tuple[float, float, float, float]]:
    to_3857 = Transformer.from_crs("EPSG:2056", "EPSG:3857", always_xy=True)
    min_x, min_y, max_x, max_y = bounds_lv95
    x0m, y0m = to_3857.transform(min_x, min_y)
    x1m, y1m = to_3857.transform(max_x, max_y)
    x0, y0 = tile_xy(*Transformer.from_crs("EPSG:3857", "EPSG:4326", always_xy=True).transform(x0m, y1m), zoom)
    x1, y1 = tile_xy(*Transformer.from_crs("EPSG:3857", "EPSG:4326", always_xy=True).transform(x1m, y0m), zoom)
    if x1 < x0: x0, x1 = x1, x0
    if y1 < y0: y0, y1 = y1, y0
    width = (x1 - x0 + 1) * TILE_SIZE
    height = (y1 - y0 + 1) * TILE_SIZE
    mode = "RGB" if extension in ("jpeg", "jpg") else "RGBA"
    canvas = Image.new(mode, (width, height), (0, 0, 0) if mode == "RGB" else (0, 0, 0, 0))

    def fetch_tile(args):
        x, y = args
        url = WMTS_URL.format(layer=layer, z=zoom, x=x, y=y, ext=extension)
        response = safe_request(url, timeout=45)
        if not response.headers.get("Content-Type", "").lower().startswith("image/"):
            raise RuntimeError(f"WMTS tile {z}/{x}/{y} was not an image")
        image = Image.open(io.BytesIO(response.content)).convert(mode)
        if image.size != (TILE_SIZE, TILE_SIZE):
            image = image.resize((TILE_SIZE, TILE_SIZE), Image.Resampling.LANCZOS)
        return x, y, image

    requests_to_make = [(x, y) for y in range(y0, y1 + 1) for x in range(x0, x1 + 1)]
    print(f"  Fetching {len(requests_to_make)} {layer} WMTS tiles at z={zoom}…")
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
        for x, y, image in pool.map(fetch_tile, requests_to_make):
            canvas.paste(image, ((x - x0) * TILE_SIZE, (y - y0) * TILE_SIZE))

    res = 2.0 * WEBMERCATOR_LIMIT / (TILE_SIZE * (1 << zoom))
    mosaic_min_x = -WEBMERCATOR_LIMIT + x0 * TILE_SIZE * res
    mosaic_max_y = WEBMERCATOR_LIMIT - y0 * TILE_SIZE * res
    mosaic_max_x = mosaic_min_x + width * res
    mosaic_min_y = mosaic_max_y - height * res
    return canvas, (mosaic_min_x, mosaic_min_y, mosaic_max_x, mosaic_max_y)


def reproject_wmts_image(image: Image.Image, bounds_3857, bounds_2056, width: int, height: int, resampling=Resampling.bilinear) -> Image.Image:
    arr = np.asarray(image.convert("RGB" if image.mode != "L" else "L"))
    if arr.ndim == 2:
        src_bands = arr[np.newaxis, :, :]
    else:
        src_bands = arr.transpose(2, 0, 1)
    src_min_x, src_min_y, src_max_x, src_max_y = bounds_3857
    src_transform = from_bounds(src_min_x, src_min_y, src_max_x, src_max_y, image.width, image.height)
    dst_transform = from_bounds(*bounds_2056, width, height)
    dst = np.zeros((src_bands.shape[0], height, width), dtype=np.uint8)
    for band in range(src_bands.shape[0]):
        reproject(
            source=src_bands[band], destination=dst[band],
            src_transform=src_transform, src_crs="EPSG:3857",
            dst_transform=dst_transform, dst_crs="EPSG:2056",
            resampling=resampling, src_nodata=0, dst_nodata=0,
        )
    if dst.shape[0] == 1:
        return Image.fromarray(dst[0], mode="L")
    return Image.fromarray(dst.transpose(1, 2, 0), mode="RGB")


def obtain_map_image(layer: str, bounds, width: int, height: int, image_format: str, wmts_extension: str) -> Image.Image:
    try:
        print(f"  Requesting swisstopo WMS: {layer}")
        return get_wms_image(layer, bounds, width, height, image_format)
    except Exception as wms_error:
        print(f"  WMS request failed ({wms_error}); falling back to official WMTS tiles.")
    mosaic, bounds3857 = get_wmts_mosaic(layer, bounds, WMTS_ZOOM, wmts_extension)
    return reproject_wmts_image(mosaic, bounds3857, bounds, width, height, Resampling.bilinear)


def download_viirs() -> Path:
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / VIIRS_FILENAME
    if path.exists() and path.stat().st_size > 10 * 1024 * 1024:
        return path
    print("Downloading annual 2024 VIIRS night-radiance GeoTIFF (public Zenodo mirror)…")
    part = path.with_suffix(path.suffix + ".part")
    part.unlink(missing_ok=True)
    with safe_request(VIIRS_URL, timeout=180) as response:
        total = 0
        with part.open("wb") as output:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    output.write(chunk)
                    total += len(chunk)
                    if total and total % (12 * 1024 * 1024) < 1024 * 1024:
                        print(f"  {total / 1024 / 1024:.0f} MB downloaded…")
    if part.stat().st_size < 10 * 1024 * 1024:
        part.unlink(missing_ok=True)
        raise RuntimeError("The VIIRS download is unexpectedly small; the server may have returned an HTML error page.")
    part.replace(path)
    return path


def dem_tile_path(bucket: str, arc_seconds: int, lat: int, lon: int) -> str:
    lat_hemi = "N" if lat >= 0 else "S"
    lon_hemi = "E" if lon >= 0 else "W"
    folder = f"Copernicus_DSM_COG_{arc_seconds}_{lat_hemi}{abs(lat):02d}_00_{lon_hemi}{abs(lon):03d}_00_DEM"
    return f"/vsicurl/{bucket}/{folder}/{folder}.tif"


def read_dem_tiles(wgs_bounds):
    west, south, east, north = wgs_bounds
    sources = []
    missing = []
    resolution_counts = {"GLO-30": 0, "GLO-90": 0}
    first_lon = math.floor(west)
    last_lon = math.ceil(east) - 1
    first_lat = math.floor(south)
    last_lat = math.ceil(north) - 1
    env = rasterio.Env(
        GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR",
        CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif",
        GDAL_HTTP_MULTIRANGE="YES",
        GDAL_HTTP_MERGE_CONSECUTIVE_RANGES="YES",
        GDAL_CACHEMAX=256,
    )
    env.__enter__()
    try:
        for lat in range(first_lat, last_lat + 1):
            for lon in range(first_lon, last_lon + 1):
                tile = None
                errors = []
                # Use 30 m where the public tile exists. GLO-30 Public has limited
                # country coverage, so fall back per-tile to globally available 90 m.
                for label, bucket, arc_seconds in (
                    ("GLO-30", COP_DEM_BUCKET, 10),
                    ("GLO-90", COP_DEM_90_BUCKET, 30),
                ):
                    url = dem_tile_path(bucket, arc_seconds, lat, lon)
                    try:
                        candidate = rasterio.open(url)
                        if candidate.crs is None:
                            candidate.close()
                            raise RuntimeError("DEM tile has no coordinate reference system")
                        tile = (candidate, label)
                        break
                    except Exception as exc:
                        errors.append(f"{label}: {str(exc)[:90]}")
                if tile is None:
                    missing.append((lat, lon, " | ".join(errors)))
                    continue
                src, label = tile
                sources.append(src)
                resolution_counts[label] += 1
                print(f"  DEM tile ready: {('N' if lat >= 0 else 'S')}{abs(lat):02d} {('E' if lon >= 0 else 'W')}{abs(lon):03d} ({label})")
        if not sources:
            raise RuntimeError("Could not open any public Copernicus DEM GLO-30 or GLO-90 tiles. Check access to the AWS open-data buckets.")
        # The source is 1° COG tiles; a 0.0018° intermediate grid avoids loading full native rasters into memory.
        mosaic, transform = merge(
            sources,
            bounds=(west, south, east, north),
            res=(0.0018, 0.0018),
            nodata=0,
            dtype="float32",
            method="first",
        )
        valid_coverage = float(np.count_nonzero(mosaic[0] > 0)) / mosaic[0].size
        if valid_coverage < 0.88:
            detail = "; ".join(f"{('N' if lat >= 0 else 'S')}{abs(lat):02d} {('E' if lon >= 0 else 'W')}{abs(lon):03d}" for lat, lon, _ in missing[:8])
            raise RuntimeError(f"Copernicus DEM coverage over the Swiss map is only {valid_coverage:.0%}. Missing tiles: {detail}")
        print(f"  DEM mix: {resolution_counts['GLO-30']} GLO-30 tiles, {resolution_counts['GLO-90']} GLO-90 fallback tiles; valid coverage {valid_coverage:.1%}.")
        return mosaic[0], transform, resolution_counts
    finally:
        for src in sources:
            src.close()
        env.__exit__(None, None, None)


def stretch_viirs(raw: np.ndarray, mask: np.ndarray) -> np.ndarray:
    values = np.asarray(raw, dtype=np.float32)
    valid = mask & np.isfinite(values) & (values > 0)
    positive = values[valid]
    if positive.size < 20:
        raise RuntimeError("No meaningful positive VIIRS radiance pixels were found in the Swiss area.")
    floor = float(np.percentile(positive, 7.0))
    high = max(float(np.percentile(positive, 99.65)), floor + 1e-6)
    normalized = np.zeros_like(values, dtype=np.float32)
    normalized[valid] = np.clip((np.log1p(values[valid]) - math.log1p(floor)) / (math.log1p(high) - math.log1p(floor)), 0, 1)
    normalized = np.power(normalized / (1.0 + 0.30 * normalized) * 1.30, 1.10)
    normalized[~valid] = 0
    return np.uint8(np.clip(normalized * 255, 0, 255))


def create_mask(vectors: dict, bounds, size):
    min_x, min_y, max_x, max_y = bounds
    width, height = size
    image = Image.new("L", size, 0)
    draw = ImageDraw.Draw(image)
    for ring in vectors["border"]:
        polygon = [((x - min_x) / (max_x - min_x) * (width - 1), (max_y - y) / (max_y - min_y) * (height - 1)) for x, y in ring]
        if len(polygon) >= 3:
            draw.polygon(polygon, fill=255)
    return image


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--skip-night", action="store_true", help="Build day imagery and terrain only; do not download VIIRS.")
    parser.add_argument("--force-viirs", action="store_true", help="Redownload the annual VIIRS source even if it is already cached.")
    args = parser.parse_args()

    TERRAIN.mkdir(parents=True, exist_ok=True)
    CACHE.mkdir(parents=True, exist_ok=True)
    detail = read_detail()
    forward = Transformer.from_crs("EPSG:4326", "EPSG:2056", always_xy=True)
    inverse = Transformer.from_crs("EPSG:2056", "EPSG:4326", always_xy=True)
    vectors = transformed_lines(detail, forward)
    bounds = compute_bounds(vectors)
    min_x, min_y, max_x, max_y = bounds
    ratio = (max_y - min_y) / (max_x - min_x)
    out_height = round(OUT_WIDTH * ratio)
    height_height = round(HEIGHT_WIDTH * ratio)
    out_transform = from_bounds(*bounds, OUT_WIDTH, out_height)
    height_transform = from_bounds(*bounds, HEIGHT_WIDTH, height_height)
    wgs_bounds = transform_bounds("EPSG:2056", "EPSG:4326", min_x, min_y, max_x, max_y, densify_pts=21)

    print("Alpiq Swiss 3D scene builder")
    print(f"LV95 bounds: {tuple(round(v) for v in bounds)}")
    print(f"Aerial texture: {OUT_WIDTH} × {out_height}; height grid: {HEIGHT_WIDTH} × {height_height}")

    # Real aerial orthophoto and true hillshade from swisstopo.
    satellite = obtain_map_image(SWISSIMAGE_LAYER, bounds, OUT_WIDTH, out_height, "image/jpeg", "jpeg").convert("RGB")
    satellite.save(TERRAIN / "ch_satellite.jpg", quality=92, subsampling=0, optimize=True)
    hillshade = obtain_map_image(HILLSHADE_LAYER, bounds, OUT_WIDTH, out_height, "image/png", "png").convert("L")
    hillshade.save(TERRAIN / "ch_hillshade.png", optimize=True)

    # Public Copernicus DEM GLO-30 COG tiles are sampled into a compact local LV95 grid.
    print("Reading Copernicus DEM GLO-30 (30 m source DSM) tiles…")
    mosaic, mosaic_transform, dem_resolution_counts = read_dem_tiles(wgs_bounds)
    dem = np.zeros((height_height, HEIGHT_WIDTH), dtype=np.float32)
    reproject(
        source=mosaic, destination=dem,
        src_transform=mosaic_transform, src_crs="EPSG:4326",
        dst_transform=height_transform, dst_crs="EPSG:2056",
        src_nodata=0, dst_nodata=0,
        resampling=Resampling.bilinear,
    )
    valid_dem = dem > 0
    if float(valid_dem.mean()) < 0.88:
        raise RuntimeError("The reprojected elevation grid has too many empty pixels.")
    dem = np.nan_to_num(dem, nan=0.0, posinf=0.0, neginf=0.0)
    encoded_height = np.uint16(np.clip(dem / HEIGHT_MAX_METRES * 65535.0, 0, 65535))
    encoded_height.astype("<u2", copy=False).tofile(TERRAIN / "ch_height_u16.bin")

    # If WMS hillshade is fully transparent or empty, make a hillshade from the real DEM.
    if np.asarray(hillshade).std() < 2.0:
        gy, gx = np.gradient(dem.astype(np.float32))
        slope = np.sqrt(gx * gx + gy * gy)
        hill = np.clip(170 - slope * 0.08, 45, 220).astype(np.uint8)
        Image.fromarray(hill, mode="L").resize((OUT_WIDTH, out_height), Image.Resampling.BILINEAR).save(TERRAIN / "ch_hillshade.png")

    mask = create_mask(vectors, bounds, (OUT_WIDTH, out_height))
    mask.save(TERRAIN / "ch_mask.png", optimize=True)
    (TERRAIN / "ch_vectors.json").write_text(json.dumps(vectors, separators=(",", ":")), encoding="utf-8")

    if not args.skip_night:
        viirs_path = CACHE / VIIRS_FILENAME
        if args.force_viirs:
            viirs_path.unlink(missing_ok=True)
        if not viirs_path.exists():
            viirs_path = download_viirs()
        print("Reprojecting VIIRS 2024 radiance to the Swiss orthophoto grid…")
        with rasterio.open(viirs_path) as source:
            if source.crs is None or source.crs.to_epsg() != 4326:
                raise RuntimeError(f"Expected VIIRS EPSG:4326, got {source.crs}")
            with rasterio.vrt.WarpedVRT(
                source,
                crs="EPSG:2056",
                transform=out_transform,
                width=OUT_WIDTH,
                height=out_height,
                resampling=Resampling.bilinear,
                nodata=0,
            ) as vrt:
                radiance = vrt.read(1, out_dtype="float32")
                valid = vrt.read_masks(1) > 0
        light = stretch_viirs(radiance, valid)
        Image.fromarray(light, mode="L").save(TERRAIN / "ch_night_radiance.png", optimize=True)
    else:
        # Preserve an explicit zero-light layer so the app can still load in Satellite mode.
        Image.new("L", (OUT_WIDTH, out_height), 0).save(TERRAIN / "ch_night_radiance.png", optimize=True)

    metadata = {
        "width": OUT_WIDTH,
        "height": out_height,
        "heightWidth": HEIGHT_WIDTH,
        "heightHeight": height_height,
        "bounds": [min_x, min_y, max_x, max_y],
        "heightMaxMetres": HEIGHT_MAX_METRES,
        "verticalExaggeration": VERTICAL_EXAGGERATION,
        "dem": "Copernicus DEM GLO-30 where public 30 m tiles are available, with per-tile GLO-90 fallback; resampled for WebGL mesh",
        "dem_tile_counts": dem_resolution_counts,
        "orthophoto": "swisstopo SWISSIMAGE (orthorectified aerial imagery)",
        "relief": "swisstopo swissALTI3D multidirectional hillshade",
        "nightlights": "Annual VIIRS VNL 2024, ~500 m source radiance, contrast-normalized for visualization",
        "attribution": "swisstopo SWISSIMAGE / swissALTI3D · Copernicus DEM GLO-30 · VIIRS VNL 2024",
        "note": "The visible 3D relief is vertically exaggerated for readability. VIIRS is the real night-light source; additional glow is a shader effect, not electricity supply data.",
    }
    (TERRAIN / "ch_scene.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")

    print("\nSwiss 3D scene assets created:")
    for name in ["ch_satellite.jpg", "ch_hillshade.png", "ch_night_radiance.png", "ch_mask.png", "ch_height_u16.bin", "ch_vectors.json", "ch_scene.json"]:
        path = TERRAIN / name
        print(f"  {name}: {path.stat().st_size / 1024 / 1024:.2f} MB")
    print("Done. Restart Vite and select Switzerland; the separate tilted 3D terrain scene loads automatically.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"\nBUILD FAILED: {exc}", file=sys.stderr)
        print("Existing assets were left untouched. Check internet access to swisstopo, Zenodo and the public Copernicus DEM bucket.", file=sys.stderr)
        raise SystemExit(1)
