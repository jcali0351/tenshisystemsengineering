"""World Pulse globe: the face of Mars. Writes data/globe/mars.jpg, a 1440 x 720 map of the whole planet (longitude
-180..180 left to right, north at the top), and data/globe/mars.json, a note of where it came from.

Source: the US Geological Survey's planetary map server (public domain): the Viking orbiter mosaic of Mars, in colour
when the server offers a colour layer, darkened and lightened by the shaded relief from Mars Global Surveyor's laser
altimeter (MOLA) so that volcanoes, canyons and craters stand out. The layer names are read from the server's own list
(printed in the log), because they are not ours to guess. Mars does not change, so the data workflow runs this only
while data/globe/mars.jpg does not exist.
"""
import io, json, re, subprocess, sys, urllib.request

try:
    from PIL import Image, ImageChops
except ImportError:
    subprocess.check_call("sudo apt-get update -qq && sudo apt-get install -y -qq python3-pil", shell=True)
    from PIL import Image, ImageChops

SERVER, W, H = "https://planetarymaps.usgs.gov/cgi-bin/mapserv?map=/maps/mars/mars_simp_cyl.map&SERVICE=WMS&VERSION=1.1.1", 1440, 720

def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "TenshiWorldPulse/1.0 (https://tenshisystems.com)"})
    return urllib.request.urlopen(req, timeout=240).read()

names = re.findall(r"<Name>([^<]+)</Name>", get(SERVER + "&REQUEST=GetCapabilities").decode("utf-8", "replace"))
print("layers on the server:", ", ".join(names))

def layer(patterns, avoid=None):
    for p in patterns:
        for n in names:
            if re.search(p, n, re.I) and not (avoid and re.search(avoid, n, re.I)): return n
    return None

def picture(name, mode):
    data = get(f"{SERVER}&REQUEST=GetMap&LAYERS={name}&STYLES=&SRS=EPSG:4326&BBOX=-180,-90,180,90&WIDTH={W}&HEIGHT={H}&FORMAT=image/jpeg")
    img = Image.open(io.BytesIO(data)).convert(mode).resize((W, H), Image.LANCZOS)
    lo, hi = img.convert("L").getextrema()
    if hi - lo < 40: raise ValueError(f"{name}: picture is blank")
    print(f"fetched {name}: {len(data)} bytes")
    return img

face, colour, used = None, False, []
for patterns, is_colour in (([r"mdim.*colou?r", r"viking.*colou?r", r"colou?r.*(viking|mdim)"], True), ([r"^mdim21$", r"mdim", r"viking", r"themis.*day"], False)):
    name = layer(patterns, avoid=r"mola|nomen|grid|feature")
    if not name: continue
    try: face = picture(name, "RGB"); colour = is_colour; used.append(name); break
    except Exception as e: print(e)
if face is None: sys.exit("no map of Mars could be fetched")

shade = layer([r"mola.*(bw|gr[ae]y|shade)", r"shade"], avoid=r"colou?r|nomen")
if shade:
    try:
        s = picture(shade, "L").point(lambda v: min(255, int(120 + v * 0.75)))        # keep the shadows gentle
        face = ImageChops.multiply(face, Image.merge("RGB", (s, s, s))).point(lambda v: min(255, int(v * 1.22)))
        used.append(shade)
    except Exception as e: print(e)

face.save("data/globe/mars.jpg", quality=88)
json.dump({"source": "USGS Astrogeology planetary map server, public domain", "layers": used, "colour": colour, "relief": len(used) > 1}, open("data/globe/mars.json", "w"))
print(f"mars.jpg written from {used}, colour: {colour}")
