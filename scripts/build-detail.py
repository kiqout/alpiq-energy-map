#!/usr/bin/env python3
"""Builds public/geo/switzerland-detail.json from Natural Earth 10m vector data (public domain).
Usage: python3 scripts/build-detail.py <dir with ne_10m_*.geojson>  (stdlib only)"""
import json, sys, os
src = sys.argv[1] if len(sys.argv) > 1 else '.'
BOX = (5.0, 45.3, 11.4, 48.3)  # lon0, lat0, lon1, lat1
r4 = lambda p: [round(p[0], 4), round(p[1], 4)]
load = lambda n: json.load(open(os.path.join(src, n)))
inbox = lambda p: BOX[0] <= p[0] <= BOX[2] and BOX[1] <= p[1] <= BOX[3]
def rings(g):
    c = g['coordinates']
    polys = [c] if g['type'] == 'Polygon' else c if g['type'] == 'MultiPolygon' else []
    return [r for poly in polys for r in poly]
def lines(g):
    c = g['coordinates']
    return [c] if g['type'] == 'LineString' else c if g['type'] == 'MultiLineString' else []
def clip_lines(ls):  # keep runs of vertices inside the box
    out = []
    for l in ls:
        run = []
        for p in l:
            if inbox(p): run.append(r4(p))
            elif len(run) > 1: out.append(run); run = []
            else: run = []
        if len(run) > 1: out.append(run)
    return out
ch = next(f for f in load('ne_10m_admin_0_countries.geojson')['features'] if f['properties'].get('ADM0_A3') == 'CHE')
border = [[r4(p) for p in r] for r in rings(ch['geometry'])]
cantons = [[[r4(p) for p in r] for r in rings(f['geometry'])] for f in load('ne_10m_admin_1_states_provinces.geojson')['features'] if f['properties'].get('adm0_a3') == 'CHE']
cantons = [r for c in cantons for r in c]
lakes = [[r4(p) for p in r] for f in load('ne_10m_lakes.geojson')['features'] if f['geometry'] for r in rings(f['geometry']) if any(inbox(p) for p in r)]
rivers = clip_lines([l for f in load('ne_10m_rivers_lake_centerlines.geojson')['features'] if f['geometry'] for l in lines(f['geometry'])])
cities = []
for f in load('ne_10m_populated_places_simple.geojson')['features']:
    p = f['properties']; lon, lat = p['longitude'], p['latitude']
    if inbox((lon, lat)): cities.append([round(lon, 4), round(lat, 4), int(p.get('pop_max') or 0)])
out = dict(box=BOX, border=border, cantons=cantons, lakes=lakes, rivers=rivers, cities=cities,
           source='Natural Earth 10m (public domain) — admin 0/1, lakes, rivers, populated places')
json.dump(out, open('public/geo/switzerland-detail.json', 'w'), separators=(',', ':'))
print({k: len(v) for k, v in out.items() if isinstance(v, list)}, os.path.getsize('public/geo/switzerland-detail.json') // 1024, 'KB')
