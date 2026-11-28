"""World Pulse globe: the faint stars and the Milky Way. Writes data/globe/stars.bin, read by the page after the bright
sky (data/globe/sky.json, tools/globe-sky.py) is up. Made once by hand from the same d3-celestial checkout:

    python3 tools/globe-stars.py /tmp/celestial/data

The file is packed bytes, little-endian:
  uint32 number of stars, uint32 number of Milky Way points
  per star (6 bytes):  uint16 right ascension * 100 (degrees), int16 declination * 100, uint8 magnitude * 10, int8 colour index B-V * 50
  per Milky Way point (5 bytes): uint16 right ascension * 100, int16 declination * 100, uint8 brightness level 1-5
Stars: every star of ESA's Hipparcos catalogue fainter than magnitude 6.5 (the brighter ones are already in sky.json),
about 109,000 of them. Milky Way: points scattered inside the five brightness outlines that d3-celestial ships
(mw.json), more of them where the outlines say the band is brighter, so the page can draw its glow as fine particles.
"""
import json, struct, sys
import numpy as np

src = sys.argv[1]
ra = lambda x: x + 360 if x < 0 else x
stars = []
for f in json.load(open(f"{src}/stars.14.json"))["features"]:
    mag = f["properties"]["mag"]
    if mag <= 6.5: continue
    lon, lat = f["geometry"]["coordinates"]
    try: bv = float(f["properties"].get("bv") or 0.6)
    except ValueError: bv = 0.6
    stars.append((min(35999, round(ra(lon) * 100)), round(lat * 100), min(255, round(mag * 10)), max(-127, min(127, round(bv * 50)))))

def inside(px, py, ring):
    """Which of the points lie inside one closed outline (even-odd rule)."""
    x, y = ring[:, 0], ring[:, 1]; x2, y2 = np.roll(x, -1), np.roll(y, -1); hit = np.zeros(len(px), bool)
    for i in range(len(x)):
        if y[i] == y2[i]: continue
        c = ((y[i] > py) != (y2[i] > py)) & (px < (x2[i] - x[i]) * (py - y[i]) / (y2[i] - y[i]) + x[i])
        hit ^= c
    return hit

rng = np.random.default_rng(7)
N = 1500000                                                         # trial points, spread evenly over the whole sky
lon, lat = rng.uniform(-180, 180, N), np.degrees(np.arcsin(rng.uniform(-1, 1, N)))
level = np.zeros(N, np.uint8)
for k, f in enumerate(json.load(open(f"{src}/mw.json"))["features"], 1):          # outlines run from the faint edge (1) to the bright core (5)
    hit = np.zeros(N, bool)
    for poly in f["geometry"]["coordinates"]:
        for ring in poly:                                           # holes flip the answer back, by the even-odd rule
            r = np.array(ring, float); d = np.diff(r[:, 0]); r[1:, 0] += -360 * np.cumsum(np.round(d / 360))      # undo jumps across the 180-degree line
            for shift in (-360, 0, 360):
                box = (lon + shift >= r[:, 0].min()) & (lon + shift <= r[:, 0].max()) & (lat >= r[:, 1].min()) & (lat <= r[:, 1].max())
                if box.any(): idx = np.where(box)[0]; hit[idx] ^= inside(lon[idx] + shift, lat[idx], r)
    level[hit] = k
    print(f"Milky Way outline {k}: {hit.sum()} of {N} trial points inside")
keep = np.where((level > 0) & (rng.uniform(0, 1, N) < np.array([0, 0.1, 0.3, 0.8, 1.0, 1.0])[level]))[0]
with open("data/globe/stars.bin", "wb") as out:
    out.write(struct.pack("<II", len(stars), len(keep)))
    for s in stars: out.write(struct.pack("<HhBb", *s))
    for i in keep: out.write(struct.pack("<HhB", min(35999, round(ra(lon[i]) * 100)), round(lat[i] * 100), int(level[i])))
print(f"stars.bin: {len(stars)} stars, {len(keep)} Milky Way points")
