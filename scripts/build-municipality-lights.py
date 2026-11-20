"""Build 2,110 evenly distributed illustrative light markers over Swiss land.

The count follows the Swiss Federal Statistical Office municipality total for
01.01.2026. Locations are a visualization distribution, not official commune
centroids; they are regenerated deterministically from the local Swiss mask.
"""
from __future__ import annotations

import json
import math
import random
import struct
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
TERRAIN = ROOT / "public" / "terrain"
TARGET = 2110
WIDTH = 1024
RADIUS = 10.0
SEED = 21102026


def build_land_mask() -> np.ndarray:
    scene = json.loads((TERRAIN / "ch_scene.json").read_text(encoding="utf-8"))
    vectors = json.loads((TERRAIN / "ch_vectors.json").read_text(encoding="utf-8"))
    min_x, min_y, max_x, max_y = scene["bounds"]
    aspect = (max_y - min_y) / (max_x - min_x)
    height = round(WIDTH * aspect)

    mask = Image.open(TERRAIN / "ch_mask.png").convert("L").resize((WIDTH, height), Image.Resampling.NEAREST)
    draw = ImageDraw.Draw(mask)
    # Subtract the five closed lake polygons so no light is placed in open water.
    for ring in vectors.get("lakes", []):
        pixels = [
            ((x - min_x) / (max_x - min_x) * (WIDTH - 1),
             (max_y - y) / (max_y - min_y) * (height - 1))
            for x, y in ring
        ]
        if len(pixels) >= 3:
            draw.polygon(pixels, fill=0)
    return np.asarray(mask) > 128


def poisson_points(valid: np.ndarray) -> list[tuple[float, float]]:
    height, width = valid.shape
    cell = RADIUS / math.sqrt(2)
    grid_w, grid_h = math.ceil(width / cell), math.ceil(height / cell)
    grid = [-1] * (grid_w * grid_h)
    points: list[tuple[float, float]] = []
    active: list[int] = []
    ys, xs = np.where(valid)
    if len(xs) < TARGET:
        raise RuntimeError("Swiss land mask contains fewer than 2,110 valid pixels.")

    rng = random.Random(SEED)
    first = rng.randrange(len(xs))
    points.append((float(xs[first]), float(ys[first])))
    active.append(0)
    grid[int(points[0][1] / cell) * grid_w + int(points[0][0] / cell)] = 0

    while active:
        active_index = rng.randrange(len(active))
        point_index = active[active_index]
        x, y = points[point_index]
        accepted = False
        for _ in range(30):
            angle = rng.random() * math.tau
            radius = RADIUS * math.sqrt(1 + 3 * rng.random())
            nx, ny = x + math.cos(angle) * radius, y + math.sin(angle) * radius
            if not (1 <= nx < width - 1 and 1 <= ny < height - 1):
                continue
            if not valid[int(ny), int(nx)]:
                continue
            gx, gy = int(nx / cell), int(ny / cell)
            clear = True
            for yy in range(max(0, gy - 2), min(grid_h, gy + 3)):
                for xx in range(max(0, gx - 2), min(grid_w, gx + 3)):
                    existing = grid[yy * grid_w + xx]
                    if existing >= 0:
                        px, py = points[existing]
                        if (nx - px) ** 2 + (ny - py) ** 2 < RADIUS ** 2:
                            clear = False
                            break
                if not clear:
                    break
            if clear:
                points.append((nx, ny))
                active.append(len(points) - 1)
                grid[gy * grid_w + gx] = len(points) - 1
                accepted = True
                break
        if not accepted:
            active.pop(active_index)

    if len(points) < TARGET:
        raise RuntimeError(f"Poisson sampler produced {len(points)} points; {TARGET} required.")
    # Deterministically subsample the full-country distribution, retaining broad coverage.
    chosen = rng.sample(points, TARGET)
    return chosen


def main() -> None:
    scene = json.loads((TERRAIN / "ch_scene.json").read_text(encoding="utf-8"))
    min_x, min_y, max_x, max_y = scene["bounds"]
    valid = build_land_mask()
    points = poisson_points(valid)
    height, width = valid.shape
    output = bytearray()
    for x, y in points:
        u = x / (width - 1)
        v = y / (height - 1)
        output.extend(struct.pack("<ff", u, v))
    destination = TERRAIN / "ch_municipality_lights.bin"
    destination.write_bytes(output)
    print(f"Wrote {len(points):,} normalized light positions to {destination}")
    print(f"Binary size: {len(output):,} bytes; land mask: {width} × {height}")


if __name__ == "__main__":
    main()
