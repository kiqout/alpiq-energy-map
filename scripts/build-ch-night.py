#!/usr/bin/env python3
"""Build a high-resolution stylized Swiss city-light layer from bundled vector data.

This is a cartographic visualization of Natural Earth populated-place points, not
an observed satellite-radiance product. Replace it with a VIIRS-derived raster
when one is available; the app uses the same geographic extent either way.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
DETAIL = ROOT / "public/geo/switzerland-detail.json"
OUT = ROOT / "public/tex/ch_night.png"


def xy(lon: float, lat: float, box: list[float], size: tuple[int, int]) -> tuple[float, float]:
    lo0, la0, lo1, la1 = box
    w, h = size
    return (lon - lo0) / (lo1 - lo0) * (w - 1), (la1 - lat) / (la1 - la0) * (h - 1)


def draw_rings(draw: ImageDraw.ImageDraw, rings, box, size, fill=None, outline=None, width=1):
    for ring in rings:
        pts = [xy(float(lo), float(la), box, size) for lo, la in ring]
        if len(pts) >= 3:
            draw.polygon(pts, fill=fill, outline=outline)
            if outline and width > 1:
                draw.line(pts + [pts[0]], fill=outline, width=width, joint="curve")


def point_in_ring(x: float, y: float, ring) -> bool:
    inside = False
    j = len(ring) - 1
    for i, (xi, yi) in enumerate(ring):
        xj, yj = ring[j]
        if (yi > y) != (yj > y):
            cross = (xj - xi) * (y - yi) / ((yj - yi) or 1e-30) + xi
            if x < cross:
                inside = not inside
        j = i
    return inside


def main() -> None:
    data = json.loads(DETAIL.read_text(encoding="utf-8"))
    box = [float(x) for x in data["box"]]
    w, h = 2048, 960
    size = (w, h)

    # Retain the original global night map as a subdued geographic backdrop so
    # nearby land remains visible around Switzerland. Its warm city pixels are
    # suppressed; the crisp Swiss city layer below supplies the local lights.
    global_map = Image.open(ROOT / "public/tex/night.jpg").convert("RGB")
    gw, gh = global_map.size
    lo0, la0, lo1, la1 = box
    crop_box = (
        round((lo0 + 180.0) / 360.0 * gw),
        round((90.0 - la1) / 180.0 * gh),
        round((lo1 + 180.0) / 360.0 * gw),
        round((90.0 - la0) / 180.0 * gh),
    )
    crop = global_map.crop(crop_box).resize(size, Image.Resampling.LANCZOS)
    base_np = np.asarray(crop, dtype=np.float32) / 255.0
    warm = np.maximum(base_np[:, :, 0] - base_np[:, :, 2] * 0.58, 0.0)
    base_np[:, :, 0] = np.maximum(0.0, base_np[:, :, 0] * 0.19 - warm * 0.15)
    base_np[:, :, 1] *= 0.19
    base_np[:, :, 2] *= 0.24

    land = Image.new("L", size, 0)
    land_draw = ImageDraw.Draw(land)
    draw_rings(land_draw, data["border"], box, size, fill=255)
    land_np = np.asarray(land, dtype=np.float32) / 255.0
    base_np[:, :, 0] += land_np * 0.004
    base_np[:, :, 1] += land_np * 0.010
    base_np[:, :, 2] += land_np * 0.022
    base = Image.fromarray(np.uint8(np.clip(base_np, 0, 1) * 255), "RGB")

    # Quiet geographic structure: canton boundaries, lakes and rivers.
    geo = Image.new("RGBA", size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(geo)
    for ring in data.get("cantons", []):
        pts = [xy(float(lo), float(la), box, size) for lo, la in ring]
        if len(pts) > 1:
            gd.line(pts, fill=(25, 76, 112, 105), width=2, joint="curve")
    for ring in data.get("lakes", []):
        pts = [xy(float(lo), float(la), box, size) for lo, la in ring]
        if len(pts) >= 3:
            gd.polygon(pts, fill=(4, 21, 38, 210), outline=(26, 90, 132, 120))
    for ring in data.get("rivers", []):
        pts = [xy(float(lo), float(la), box, size) for lo, la in ring]
        if len(pts) > 1:
            gd.line(pts, fill=(22, 70, 104, 95), width=2, joint="curve")
    base = Image.alpha_composite(base.convert("RGBA"), geo).convert("RGB")

    # Rasterize 43 real populated-place coordinates as soft light fields.
    # Radii are intentionally illustrative; only coordinates and population values are sourced.
    field = np.zeros((h, w), dtype=np.float32)
    core_field = np.zeros((h, w), dtype=np.float32)
    py, px = np.mgrid[0:h, 0:w]
    swiss_border = data["border"][0]
    included_cities = 0
    for lon, lat, population in data.get("cities", []):
        if not point_in_ring(float(lon), float(lat), swiss_border):
            continue
        included_cities += 1
        pop = max(1000.0, float(population))
        cx, cy = xy(float(lon), float(lat), box, size)
        scale = np.clip((math.log10(pop) - 3.6) / 1.3, 0.0, 1.0)
        sigma_x = 8.0 + 17.0 * scale
        sigma_y = sigma_x * 0.68
        r2 = ((px - cx) / sigma_x) ** 2 + ((py - cy) / sigma_y) ** 2
        strength = 0.38 + 0.27 * scale
        field += strength * np.exp(-0.5 * r2)
        field += 0.08 * np.exp(-0.5 * r2 / 6.0)
        core_sigma = max(1.5, 2.0 + 1.8 * scale)
        rc2 = ((px - cx) / core_sigma) ** 2 + ((py - cy) / (core_sigma * 0.8)) ** 2
        core_field += 0.9 * np.exp(-0.5 * rc2)

    # Convert radiance-like intensity to warm amber + white city cores.
    intensity = np.clip(field, 0.0, 1.5)
    core = np.clip(core_field, 0.0, 1.0)
    out = np.asarray(base, dtype=np.float32) / 255.0
    out[:, :, 0] += intensity * 0.95 + core * 0.95
    out[:, :, 1] += intensity * 0.38 + core * 0.78
    out[:, :, 2] += intensity * 0.08 + core * 0.42
    out = np.clip(out, 0.0, 1.0)

    # A restrained local blur softens the urban halo without smearing the city core.
    image = Image.fromarray(np.uint8(out * 255), "RGB")
    glow = image.filter(ImageFilter.GaussianBlur(radius=2.2))
    image = Image.blend(image, glow, 0.16)
    image.save(OUT, format="PNG", optimize=True)
    print(f"Wrote {OUT} ({w}x{h}, {OUT.stat().st_size / 1024:.1f} KB; {included_cities} Swiss populated places)")
    print("Note: vector-derived city-light visualization, not a satellite VIIRS raster.")


if __name__ == "__main__":
    main()
