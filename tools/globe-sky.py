"""World Pulse globe: the real night sky. Writes data/globe/sky.json from the star and constellation files of
d3-celestial (https://github.com/ofrohn/d3-celestial, BSD 3-Clause, (c) 2015 Olaf Frohn; stars from ESA's Hipparcos
catalogue). The sky does not change, so this is run by hand once, not by the data workflow:

    git clone --depth 1 https://github.com/ofrohn/d3-celestial /tmp/celestial
    python3 tools/globe-sky.py /tmp/celestial/data

Output: stars  flat list, four numbers per star: right ascension * 100, declination * 100 (degrees), magnitude * 10,
               colour index B-V * 100; every star to magnitude 6.5
        named  [ra, dec, magnitude, name, constellation id] for the bright stars that have a proper name
        cons   [id, Latin name, rank 1-3, label ra, label dec, [[ra * 100, dec * 100, ...], ...]] for the 88 constellations
"""
import json, sys

src = sys.argv[1]
load = lambda f: json.load(open(f"{src}/{f}", encoding="utf-8"))
ra = lambda x: x + 360 if x < 0 else x

stars, named, names = [], [], load("starnames.json")
for f in load("stars.8.json")["features"]:
    mag = f["properties"]["mag"]
    if mag > 6.5: continue
    lon, lat = f["geometry"]["coordinates"]
    try: bv = float(f["properties"].get("bv") or 0.6)
    except ValueError: bv = 0.6
    stars += [round(ra(lon) * 100), round(lat * 100), round(mag * 10), round(bv * 100)]
    n = names.get(str(f["id"]), {})
    if n.get("name") and mag <= 3.6: named.append([round(ra(lon), 2), round(lat, 2), mag, n["name"], n.get("c", "")])

info = {f["id"]: f for f in load("constellations.json")["features"]}
cons = []
for f in load("constellations.lines.json")["features"]:
    i = info.get(f["id"]); 
    if not i: continue
    lon, lat = i["geometry"]["coordinates"]
    lines = [[v for p in line for v in (round(ra(p[0]) * 100), round(p[1] * 100))] for line in f["geometry"]["coordinates"]]
    cons.append([f["id"], i["properties"]["name"].replace("\u2005", " "), int(i["properties"].get("rank", 3)), round(ra(lon), 1), round(lat, 1), lines])

json.dump({"source": "d3-celestial (BSD 3-Clause, Olaf Frohn); stars: ESA Hipparcos", "stars": stars, "named": named, "cons": cons},
          open("data/globe/sky.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(f"sky.json: {len(stars) // 4} stars, {len(named)} named, {len(cons)} constellations")
