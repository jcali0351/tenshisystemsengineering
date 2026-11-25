#!/usr/bin/env python3
"""Build contact-map-land.json from Natural Earth land (public domain).

Downloads world-atlas 2.0.2 land-50m TopoJSON (Natural Earth 1:50m land),
drops Antarctica, splits antimeridian-crossing rings, simplifies, and writes
a compact lon/lat polygon file used by contact-map.js. No runtime fetch of
the source: run this script only when regenerating the coastline file.

    python3 tools/build-contact-map-land.py

The output is projected at runtime with the same equirectangular formula as
the pins, so host/server positions stay lined up.
"""
from __future__ import annotations

import hashlib
import json
import math
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/land-50m.json"
SRC_META = "Natural Earth land 1:50m via world-atlas 2.0.2 (public domain); Antarctica omitted; simplified"
OUT = ROOT / "contact-map-land.json"
CACHE = Path("/tmp/ne-land/land-50m.topojson")

# About 0.1° (~11 km). min_area keeps small but recognizable islands under 150 KB.
SIMPLIFY_EPS = 0.1
MIN_AREA = 0.03


def decode_arc(raw, scale, translate):
    x = y = 0
    sx, sy = scale
    tx, ty = translate
    pts = []
    for dx, dy in raw:
        x += dx
        y += dy
        pts.append((x * sx + tx, y * sy + ty))
    return pts


def ring_from_arcs(idxs, decoded):
    pts = []
    for i in idxs:
        arc = decoded[~i][::-1] if i < 0 else decoded[i]
        chunk = arc if not pts else arc[1:]
        pts.extend(chunk)
    if pts and pts[0] != pts[-1]:
        pts.append(pts[0])
    return pts


def area(ring):
    a = 0.0
    for i in range(len(ring) - 1):
        a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
    return a / 2.0


def is_antarctica(ring):
    return max(p[1] for p in ring) < -58


def perp_dist(p, a, b):
    (x, y), (x1, y1), (x2, y2) = p, a, b
    dx, dy = x2 - x1, y2 - y1
    if dx == 0 and dy == 0:
        return math.hypot(x - x1, y - y1)
    t = max(0, min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)))
    return math.hypot(x - (x1 + t * dx), y - (y1 + t * dy))


def douglas_peucker(ring, eps):
    if len(ring) <= 4:
        return ring
    closed = ring[0] == ring[-1]
    pts = ring[:-1] if closed else ring[:]
    stack = [(0, len(pts) - 1)]
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    while stack:
        i, j = stack.pop()
        maxd, idx = 0, None
        a, b = pts[i], pts[j]
        for k in range(i + 1, j):
            d = perp_dist(pts[k], a, b)
            if d > maxd:
                maxd, idx = d, k
        if maxd > eps and idx is not None:
            keep[idx] = True
            stack.append((i, idx))
            stack.append((idx, j))
    out = [p for p, k in zip(pts, keep) if k]
    if closed:
        out.append(out[0])
    return out


def interpolate(p1, p2, lon):
    lon1, lat1 = p1
    lon2, lat2 = p2
    if lon2 == lon1:
        return (lon, lat1)
    t = (lon - lon1) / (lon2 - lon1)
    return (lon, lat1 + t * (lat2 - lat1))


def clip_half(ring, pred, edge_lon):
    if not ring:
        return []
    pts = ring[:-1] if ring[0] == ring[-1] else ring[:]
    if not pts:
        return []
    out = []
    s = pts[-1]
    for e in pts:
        ein, sin_ = pred(e), pred(s)
        if ein:
            if not sin_:
                out.append(interpolate(s, e, edge_lon))
            out.append(e)
        elif sin_:
            out.append(interpolate(s, e, edge_lon))
        s = e
    if not out:
        return []
    if out[0] != out[-1]:
        out.append(out[0])
    return out


def unwrap_ring(ring):
    out = [ring[0]]
    for lon, lat in ring[1:]:
        prev = out[-1][0]
        while lon - prev > 180:
            lon -= 360
        while lon - prev < -180:
            lon += 360
        out.append((lon, lat))
    return out


def clip_to_lon_window(ring, lo, hi):
    r = clip_half(ring, lambda p: p[0] >= lo, lo)
    r = clip_half(r, lambda p: p[0] <= hi, hi)
    return r


def split_dateline(ring):
    u = unwrap_ring(ring)
    lo = min(p[0] for p in u)
    hi = max(p[0] for p in u)
    if hi - lo <= 180 and lo >= -180 and hi <= 180:
        return [[((lon + 180) % 360 - 180, lat) for lon, lat in u]]
    pieces, seen = [], set()
    for shift in (-360, 0, 360):
        shifted = [(lon + shift, lat) for lon, lat in u]
        clipped = clip_to_lon_window(shifted, -180, 180)
        if not clipped or len(clipped) < 4:
            continue
        key = tuple((round(p[0], 4), round(p[1], 4)) for p in clipped[::max(1, len(clipped) // 20)])
        if key in seen:
            continue
        seen.add(key)
        pieces.append(clipped)
    return pieces or [ring]


def split_jump_ring(ring):
    """Catch any antimeridian jumps left after rounding."""
    if len(ring) < 4:
        return [ring]
    pts = ring[:-1] if ring[0] == ring[-1] else list(ring)
    jumps = [i for i in range(len(pts)) if abs(pts[(i + 1) % len(pts)][0] - pts[i][0]) > 180]
    if not jumps:
        return [ring]
    pieces = []
    for n, j in enumerate(jumps):
        j2 = jumps[(n + 1) % len(jumps)]
        start = (j + 1) % len(pts)
        seg = pts[start:j2 + 1] if j2 >= start else pts[start:] + pts[:j2 + 1]
        if len(seg) < 2:
            continue
        side = 180 if sum(p[0] for p in seg) / len(seg) > 0 else -180
        closed = [(side, seg[0][1])] + seg + [(side, seg[-1][1]), (side, seg[0][1])]
        if len(closed) >= 4:
            pieces.append(closed)
    return pieces or [ring]


def quantize(ring, nd=2):
    out = []
    for lon, lat in ring:
        p = (round(lon, nd), round(lat, nd))
        if not out or out[-1] != p:
            out.append(p)
    if out and out[0] != out[-1]:
        out.append(out[0])
    return out if len(out) >= 4 else None


def topo_polygons(path):
    d = json.loads(Path(path).read_text())
    scale, translate = d["transform"]["scale"], d["transform"]["translate"]
    decoded = [decode_arc(a, scale, translate) for a in d["arcs"]]
    land = d["objects"]["land"]
    geoms = land.get("geometries") or [land]
    polygons = []
    for g in geoms:
        arcs = g["arcs"]
        if g["type"] == "Polygon":
            polys = [arcs]
        elif g["type"] == "MultiPolygon":
            polys = arcs
        else:
            continue
        for poly in polys:
            rings = [ring_from_arcs(r, decoded) for r in poly]
            if rings:
                polygons.append(rings)
    return polygons


def convert(src, eps=SIMPLIFY_EPS, min_area=MIN_AREA):
    out = []
    for rings in topo_polygons(src):
        outer = rings[0]
        if is_antarctica(outer):
            continue
        for o in split_dateline(outer):
            o = douglas_peucker(o, eps)
            o = quantize(o)
            if not o or abs(area(o)) < min_area:
                continue
            for part in split_jump_ring(o):
                part = quantize(part)
                if part and abs(area(part)) >= min_area:
                    out.append([part])
    return out


def fmt_num(n):
    r = round(float(n), 2)
    i = int(round(r))
    if abs(r - i) < 1e-9:
        return str(i)
    return f"{r:.2f}".rstrip("0")


def compact(polys, meta):
    def ring(r):
        pts = r[:-1] if r and r[0] == r[-1] else r
        return "[" + ",".join("[" + fmt_num(x) + "," + fmt_num(y) + "]" for x, y in pts) + "]"

    # Each polygon is a list of rings (outers only today) so holes can be added later.
    body = "[" + ",".join("[" + ",".join(ring(r) for r in p) + "]" for p in polys) + "]"
    return '{"source":%s,"closed":false,"polygons":%s}' % (json.dumps(meta), body)


def ensure_source():
    if CACHE.exists() and CACHE.stat().st_size > 10000:
        return CACHE
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    print("Downloading", SRC_URL)
    urllib.request.urlretrieve(SRC_URL, CACHE)
    return CACHE


def main():
    src = ensure_source()
    polys = convert(src)
    raw = compact(polys, SRC_META)
    # verify no leftover antimeridian jumps
    jumps = 0
    for p in polys:
        r = p[0]
        for i in range(1, len(r)):
            if abs(r[i][0] - r[i - 1][0]) > 180:
                jumps += 1
    OUT.write_text(raw)
    digest = hashlib.sha256(raw.encode()).hexdigest()[:8]
    print(f"Wrote {OUT.relative_to(ROOT)}  {len(raw)} bytes  {len(polys)} polygons  jumps={jumps}  sha256={digest}")
    # Keep the ?v= in contact-map.js in sync when regenerating.
    js = ROOT / "contact-map.js"
    if js.exists():
        text = js.read_text()
        import re
        updated, n = re.subn(
            r"contact-map-land\.json\?v=[0-9a-f]+",
            f"contact-map-land.json?v={digest}",
            text,
            count=1,
        )
        if n:
            js.write_text(updated)
            print(f"Updated LAND_URL in contact-map.js to v={digest}")


if __name__ == "__main__":
    main()
