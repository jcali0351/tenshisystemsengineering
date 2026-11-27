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

def fetch(name):
    req = urllib.request.Request(BASE + name, headers={"User-Agent": "TenshiWorldPulse/1.0 (https://tenshisystems.com)"})
    data = urllib.request.urlopen(req, timeout=180).read()
    print(f"fetched {name}: {len(data)} bytes")
    return Image.open(io.BytesIO(data)).convert("L").resize((W, H), Image.LANCZOS)

colour = None
for name in ("lroc_color_poles_1k.jpg", "lroc_color_2k.jpg", "lroc_color_poles_2k.tif"):
    try: colour = fetch(name); break
    except Exception as e: print(f"{name}: {e}")
if colour is None: sys.exit("no Moon colour map could be fetched")
relief = None
for name in ("ldem_3_8bit.jpg", "ldem_4.tif"):
    try: relief = fetch(name); break
    except Exception as e: print(f"{name}: {e}")

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
json.dump({"source": "NASA SVS CGI Moon Kit (LRO camera and laser altimeter), public domain", "w": W, "h": H, "relief": relief is not None,
           "b64": base64.b64encode(out).decode()}, open("data/globe/moon.json", "w"))
print(f"moon.json written, relief shading: {relief is not None}")
