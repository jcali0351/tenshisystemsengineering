"""World Pulse globe: the Moon's face. Writes data/globe/moon.json: one brightness value (0-255) for every point of a
720 x 360 map of the whole Moon (longitude -180..180 left to right with the near side in the middle, north at the top),
packed as base64. Brightness is the real surface colour from NASA's Lunar Reconnaissance Orbiter camera, shaded with
the real heights from its laser altimeter so that crater rims and mountain ranges stand out.

Source: NASA Scientific Visualization Studio, "CGI Moon Kit" (https://svs.gsfc.nasa.gov/4720), public domain.
The Moon does not change, so the data workflow runs this only while data/globe/moon.json does not exist.
"""
import base64, io, json, subprocess, sys, urllib.request

try:
    from PIL import Image
except ImportError:
    subprocess.check_call("sudo apt-get update -qq && sudo apt-get install -y -qq python3-pil", shell=True)
    from PIL import Image

BASE, W, H = "https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/", 720, 360
# A second home for the same camera mosaic: the US Geological Survey's planetary map server (public domain). NASA's
# server answers "403 Forbidden" to GitHub's runners; that is its decision, so this asks the USGS instead.
USGS = ("https://planetarymaps.usgs.gov/cgi-bin/mapserv?map=/maps/earth/moon_simp_cyl.map&SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap"
        "&LAYERS={layer}&STYLES=&SRS=EPSG:4326&BBOX=-180,-90,180,90&WIDTH=1440&HEIGHT=720&FORMAT=image/jpeg")

def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "TenshiWorldPulse/1.0 (https://tenshisystems.com)"})
    data = urllib.request.urlopen(req, timeout=180).read()
    img = Image.open(io.BytesIO(data)).convert("L").resize((W, H), Image.LANCZOS)
    lo, hi = img.getextrema()
    if hi - lo < 40: raise ValueError("picture is blank")
    print(f"fetched {url[:110]}: {len(data)} bytes")
    return img

colour, source = None, ""
for url, src in [(BASE + "lroc_color_poles_1k.jpg", "NASA SVS CGI Moon Kit (LRO camera)"),
                 (USGS.format(layer="LROC_WAC"), "USGS Astrogeology map server (LRO wide-angle camera mosaic)"), (USGS.format(layer="LO"), "USGS Astrogeology map server (Lunar Orbiter mosaic)")]:
    try: colour = fetch(url); source = src; break
    except Exception as e: print(f"{url[:110]}: {e}")
if colour is None: sys.exit("no Moon map could be fetched")
relief = None
try: relief = fetch(BASE + "ldem_3_8bit.jpg")
except Exception as e: print(f"relief map: {e}")

a = list(colour.getdata())
lo, hi = sorted(a)[len(a) // 50], sorted(a)[-len(a) // 50]          # stretch the middle 96% of the brightness range
a = [max(0.0, min(1.0, (v - lo) / max(1, hi - lo))) for v in a]
if relief is not None:                                               # light from the west: slopes facing it brighten
    d = list(relief.getdata())
    for y in range(H):
        for x in range(W):
            slope = d[y * W + (x - 1) % W] - d[y * W + (x + 1) % W]
            a[y * W + x] = max(0.0, min(1.0, a[y * W + x] * (1 + slope / 28.0)))
out = bytes(round(v * 255) for v in a)
json.dump({"source": source + ", public domain", "w": W, "h": H, "relief": relief is not None,
           "b64": base64.b64encode(out).decode()}, open("data/globe/moon.json", "w"))
print(f"moon.json written, relief shading: {relief is not None}")
