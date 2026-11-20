#!/usr/bin/env python3
"""Build high-resolution VIIRS nighttime-light textures for Alpiq Energy Atlas.

Downloads the OpenGeoHub 2024 annual VIIRS VNL V2.1 GeoTIFF (15 arc-second
geographic grid; approximately 464 m at the equator), then creates:
  public/tex/central_europe_night_viirs.png  - native-resolution Central Europe crop, radiance only
  public/tex/night_8k.jpg        - optional 8K global light-enhanced texture

The old vector-painted ch_night.png is no longer used by the app.
The VIIRS image contains real satellite-derived radiance; the app's GLSL shader
adds a restrained warm glow on top at render time. A swisstopo hillshade is
also downloaded as a separate low-contrast terrain layer when available.

Source record: https://zenodo.org/records/17294744
Data file: nightlights.average_viirs.v21_m_500m_s_20240101_20241231_go_epsg4326_v20250904.tif
MD5: 0b976892d40c2d0d99177c727289eaf2
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
import urllib.request
from pathlib import Path
from urllib.parse import urlencode

import numpy as np
import rasterio
from PIL import Image
from rasterio.windows import from_bounds

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
TEX = PUBLIC / "tex"
CACHE = ROOT / ".cache"
SOURCE_URL = (
    "https://zenodo.org/records/17294744/files/"
    "nightlights.average_viirs.v21_m_500m_s_20240101_20241231_go_epsg4326_v20250904.tif?download=1"
)
SOURCE_RECORD = "https://zenodo.org/records/17294744"
SOURCE_MD5 = "0b976892d40c2d0d99177c727289eaf2"
SOURCE_NAME = "viirs_annual_2024.tif"  # local cache filename
SOURCE_FILENAME = "nightlights.average_viirs.v21_m_500m_s_20240101_20241231_go_epsg4326_v20250904.tif"
SWISS_HILLSHADE_BOX = (5.0, 45.3, 11.4, 48.3)  # west, south, east, north
SWISSTOPO_WMS = "https://wms.geo.admin.ch/"
SWISSTOPO_HILLSHADE_LAYER = "ch.swisstopo.swissalti3d-reliefschattierung"
# The same extent is used by Globe.tsx / switzerland-detail.json.
BOX = (2.0, 43.5, 16.0, 52.5)  # west, south, east, north; Switzerland plus neighbours


def file_md5(path: Path) -> str:
    digest = hashlib.md5()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(4 * 1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def download_source(path: Path, force: bool = False) -> None:
    if path.exists() and not force:
        existing = file_md5(path)
        if existing == SOURCE_MD5:
            print(f"Using verified cached VIIRS source: {path}")
            return
        print("Cached VIIRS file failed checksum; downloading a clean copy.")
        path.unlink(missing_ok=True)

    path.parent.mkdir(parents=True, exist_ok=True)
    part = path.with_suffix(path.suffix + ".part")
    part.unlink(missing_ok=True)
    request = urllib.request.Request(
        SOURCE_URL,
        headers={"User-Agent": "Alpiq-Energy-Atlas/1.1 (VIIRS texture builder)"},
    )
    print("Downloading 2024 annual VIIRS raster from Zenodo (about 64 MB)...")
    digest = hashlib.md5()
    total = 0
    try:
        with urllib.request.urlopen(request, timeout=120) as response, part.open("wb") as out:
            expected = int(response.headers.get("Content-Length", "0") or 0)
            while True:
                block = response.read(1024 * 1024)
                if not block:
                    break
                out.write(block)
                digest.update(block)
                total += len(block)
                if expected:
                    print(f"\r  {total / expected * 100:5.1f}%", end="", flush=True)
        print()
        actual_md5 = digest.hexdigest()
        if actual_md5 != SOURCE_MD5:
            raise RuntimeError(f"VIIRS checksum mismatch: expected {SOURCE_MD5}, got {actual_md5}")
        part.replace(path)
        print(f"Verified source ({total / 1024 / 1024:.1f} MB, MD5 OK).")
    except Exception:
        part.unlink(missing_ok=True)
        raise


def stretch_radiance(data: np.ndarray) -> np.ndarray:
    """Suppress low-level haze and preserve compact city/transport radiance."""
    value = np.asarray(data, dtype=np.float32).copy()
    value[~np.isfinite(value)] = 0.0
    value[value < 0.0] = 0.0
    positive = value[value > 0.0]
    if positive.size == 0:
        raise RuntimeError("The selected VIIRS window contains no positive radiance pixels.")
    floor = float(np.percentile(positive, 4.0))
    high = max(float(np.percentile(positive, 99.85)), floor + 1e-6)
    log_floor = math.log1p(max(floor, 0.0))
    log_high = max(math.log1p(high), log_floor + 1e-6)
    normalized = np.clip((np.log1p(value) - log_floor) / (log_high - log_floor), 0.0, 1.0)
    # Gamma > 1 keeps the low-radiance background restrained and city structures crisp.
    return np.power(normalized, 1.16).astype(np.float32, copy=False)


def colorize_radiance(data: np.ndarray) -> np.ndarray:
    """Store near-neutral warm-white radiance; shader applies the glow exactly once."""
    intensity = stretch_radiance(data)
    red = intensity
    green = intensity * 0.94
    blue = intensity * 0.82
    rgb = np.stack([red, green, blue], axis=-1)
    return np.uint8(np.clip(rgb * 255.0, 0, 255))


def read_central_europe_window(src) -> tuple[np.ndarray, tuple[int, int]]:
    if src.crs is None or src.crs.to_epsg() != 4326:
        raise RuntimeError(f"Expected EPSG:4326 source raster, got {src.crs}")
    window = from_bounds(*BOX, transform=src.transform).round_offsets().round_lengths()
    if window.width <= 0 or window.height <= 0:
        raise RuntimeError(f"Invalid Central Europe raster window: {window}")
    fill = src.nodata if src.nodata is not None else 0
    data = src.read(1, window=window, boundless=True, fill_value=fill)
    return data, (int(window.width), int(window.height))


def make_central_europe_texture(src) -> None:
    data, native_size = read_central_europe_window(src)
    rgb = colorize_radiance(data)
    out_path = TEX / "central_europe_night_viirs.png"
    Image.fromarray(rgb, mode="RGB").save(out_path, format="PNG", optimize=True)

    metadata = {
        "product": "Annual VIIRS VNL V2.1 nighttime lights",
        "year": 2024,
        "source_record": SOURCE_RECORD,
        "source_file": SOURCE_FILENAME,
        "source_md5": SOURCE_MD5,
        "source_grid": "15 arc-seconds, EPSG:4326 (approximately 464 m at the equator)",
        "extent_wsen": [BOX[0], BOX[1], BOX[2], BOX[3]],
        "region": "Central Europe context tile centred on Switzerland; includes adjacent France, Germany, Italy, Austria and Liechtenstein",
        "native_crop_dimensions": [native_size[0], native_size[1]],
        "texture_file": out_path.name,
        "note": "Near-neutral warm-white radiance pixels only. Low-level haze is suppressed; city bloom and warm color are applied once by the Three.js shader. No synthetic fallback is used when this tile is absent.",
    }
    (TEX / "central_europe_night_viirs.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    print(f"Real Central Europe VIIRS crop: {native_size[0]} × {native_size[1]} px (native source window)")
    print(f"Saved: {out_path} ({out_path.stat().st_size / 1024:.0f} KB)")



def make_swiss_hillshade() -> None:
    """Download official swisstopo multidirectional swissALTI3D hillshade."""
    west, south, east, north = SWISS_HILLSHADE_BOX
    width, height = 2048, 960
    # WMS 1.3.0 with EPSG:4326 uses latitude, longitude axis order.
    params = {
        "SERVICE": "WMS",
        "VERSION": "1.3.0",
        "REQUEST": "GetMap",
        "LAYERS": SWISSTOPO_HILLSHADE_LAYER,
        "STYLES": "",
        "CRS": "EPSG:4326",
        "BBOX": f"{south},{west},{north},{east}",
        "WIDTH": str(width),
        "HEIGHT": str(height),
        "FORMAT": "image/png",
        "TRANSPARENT": "TRUE",
    }
    url = SWISSTOPO_WMS + "?" + urlencode(params)
    request = urllib.request.Request(url, headers={"User-Agent": "Alpiq-Energy-Atlas/1.2 (terrain texture builder)"})
    print("Downloading official swisstopo swissALTI3D hillshade...")
    with urllib.request.urlopen(request, timeout=45) as response:
        content_type = response.headers.get("Content-Type", "")
        payload = response.read()
    if not content_type.lower().startswith("image/"):
        preview = payload[:180].decode("utf-8", errors="replace")
        raise RuntimeError(f"swisstopo WMS returned {content_type or 'unknown content'}: {preview}")
    from io import BytesIO
    image = Image.open(BytesIO(payload)).convert("RGBA")
    if image.size != (width, height):
        image = image.resize((width, height), Image.Resampling.LANCZOS)
    out_path = TEX / "ch_hillshade.png"
    image.save(out_path, format="PNG", optimize=True)
    metadata = {
        "source": "swisstopo WMS-FSDI",
        "layer": SWISSTOPO_HILLSHADE_LAYER,
        "method": "Multidirectional hillshade derived from swissALTI3D elevation data",
        "extent_wsen": [west, south, east, north],
        "dimensions": [width, height],
        "service": SWISSTOPO_WMS,
        "note": "Relief-only layer. It is rendered subtly beneath the real night lights and does not add or invent city illumination.",
    }
    (TEX / "ch_hillshade.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    print(f"Saved official Swiss hillshade: {width} × {height} px ({out_path.stat().st_size / 1024:.0f} KB)")


def read_global_window(src, bounds, out_shape):
    window = from_bounds(*bounds, transform=src.transform).round_offsets().round_lengths()
    fill = src.nodata if src.nodata is not None else 0
    return src.read(
        1,
        window=window,
        out_shape=out_shape,
        resampling=rasterio.enums.Resampling.average,
        boundless=True,
        fill_value=fill,
    )


def make_global_8k(src) -> None:
    global_w, global_h = 8192, 4096
    lat_north, lat_south = 75.0, -65.0
    data_h = round(global_h * (lat_north - lat_south) / 180.0)
    data_y0 = round((90.0 - lat_north) / 180.0 * global_h)
    data = read_global_window(src, (-180.0, lat_south, 180.0, lat_north), (data_h, global_w))
    light = colorize_radiance(data)

    source_path = TEX / "night.jpg"
    if not source_path.exists():
        raise FileNotFoundError(f"Global base texture not found: {source_path}")
    base_img = Image.open(source_path).convert("RGB").resize((global_w, global_h), Image.Resampling.LANCZOS)
    base = np.asarray(base_img, dtype=np.float32) / 255.0
    target = base[data_y0:data_y0 + data_h, :, :]
    alpha = np.clip(light[:, :, 0].astype(np.float32) / 255.0 * 0.88, 0.0, 0.90)[..., None]
    target[:] = np.clip(target * (1.0 - alpha * 0.45) + (light.astype(np.float32) / 255.0) * alpha, 0.0, 1.0)
    out_path = TEX / "night_8k.jpg"
    Image.fromarray(np.uint8(np.clip(base * 255.0, 0, 255)), mode="RGB").save(
        out_path, format="JPEG", quality=93, subsampling=0, optimize=True
    )
    print(f"Global 8K enhancement: {global_w} × {global_h} px")
    print("Note: this retains the existing 4K surface image and adds native VIIRS light detail; it is not a new 8K terrain map.")
    print(f"Saved: {out_path} ({out_path.stat().st_size / 1024 / 1024:.1f} MB)")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--swiss-only", action="store_true", help="Build only the Central Europe VIIRS texture; skip the optional global 8K output.")
    parser.add_argument("--force-download", action="store_true", help="Redownload the source GeoTIFF even if a checksum-valid cached copy exists.")
    args = parser.parse_args()

    TEX.mkdir(parents=True, exist_ok=True)
    source_path = CACHE / SOURCE_NAME
    try:
        try:
            make_swiss_hillshade()
        except Exception as hillshade_error:
            print(f"WARNING: Could not download swisstopo hillshade: {hillshade_error}", file=sys.stderr)
            print("The app will still run without the optional relief layer.", file=sys.stderr)
        download_source(source_path, force=args.force_download)
        with rasterio.open(source_path) as src:
            print(f"Source raster: {src.width} × {src.height}, CRS={src.crs}, nodata={src.nodata}")
            make_central_europe_texture(src)
            if not args.swiss_only:
                make_global_8k(src)
        print("Done. Restart/reload the Vite app; the Central Europe VIIRS tile is used around Switzerland and the swisstopo hillshade adds subtle Alpine relief.")
        return 0
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        print("No existing textures were deleted. The app will continue using the continuous global night texture until the Central Europe VIIRS tile is available.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
