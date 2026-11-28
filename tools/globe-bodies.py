"""World Pulse globe: sharp maps of Mars and the Moon, for the page to wrap round a sphere.
Writes data/globe/mars-4k.jpg (colour), data/globe/moon-4k.jpg and data/globe/moon-1k.jpg (grey): whole-globe maps,
longitude -180..180 left to right, north at the top, 4096 x 2048 where the server allows (1024 x 512 for the small one,
which the page uses for the little Moon beside the Earth).

Source: the US Geological Survey's planetary map server (public domain).
  Mars: the Viking orbiter colour mosaic (MDIM 2.1), with the shaded relief from Mars Global Surveyor's laser altimeter
        laid over it so volcanoes, canyons and craters stand out.
  Moon: the Lunar Reconnaissance Orbiter wide-angle camera mosaic.
Neither changes, so the data workflow runs this only while one of the files is missing.
"""
import io, os, subprocess, sys, urllib.request

try:
    from PIL import Image, ImageChops, ImageEnhance
except ImportError:
    subprocess.check_call("sudo apt-get update -qq && sudo apt-get install -y -qq python3-pil", shell=True)
    from PIL import Image, ImageChops, ImageEnhance
Image.MAX_IMAGE_PIXELS = None

def picture(body, layer, mode):
    """The layer as one picture, at the largest of three sizes the server will give."""
    for w in (4096, 2048, 1440):
        url = (f"https://planetarymaps.usgs.gov/cgi-bin/mapserv?map=/maps/{body}_simp_cyl.map&SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap"
               f"&LAYERS={layer}&STYLES=&SRS=EPSG:4326&BBOX=-180,-90,180,90&WIDTH={w}&HEIGHT={w // 2}&FORMAT=image/jpeg")
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "TenshiWorldPulse/1.0 (https://tenshisystems.com)"})
            data = urllib.request.urlopen(req, timeout=300).read()
            img = Image.open(io.BytesIO(data)).convert(mode)
            lo, hi = img.convert("L").getextrema()
            if hi - lo < 40: raise ValueError("picture is blank")
            print(f"fetched {layer} at {img.size[0]} x {img.size[1]}: {len(data)} bytes")
            return img
        except Exception as e: print(f"{layer} at {w}: {e}")
    return None

done = 0
if not os.path.exists("data/globe/mars-4k.jpg"):
    face = picture("mars/mars", "MDIM21_color", "RGB")
    if face:
        shade = picture("mars/mars", "MOLA_bw", "L")
        if shade:
            s = shade.resize(face.size, Image.LANCZOS).point(lambda v: min(255, int(105 + v * 0.82)))     # keep the shadows gentle
            face = ImageChops.multiply(face, Image.merge("RGB", (s, s, s))).point(lambda v: min(255, int(v * 1.2)))
        face = ImageEnhance.Contrast(ImageEnhance.Color(face).enhance(1.12)).enhance(1.06)
        face.save("data/globe/mars-4k.jpg", quality=90, optimize=True); done += 1
        print(f"mars-4k.jpg written, {face.size[0]} x {face.size[1]}, relief shading: {shade is not None}")
if not os.path.exists("data/globe/moon-4k.jpg"):
    face = picture("earth/moon", "LROC_WAC", "L")
    if face:
        face = ImageEnhance.Contrast(face).enhance(1.12)
        face.save("data/globe/moon-4k.jpg", quality=90, optimize=True)
        face.resize((1024, 512), Image.LANCZOS).save("data/globe/moon-1k.jpg", quality=88, optimize=True); done += 1
        print(f"moon-4k.jpg and moon-1k.jpg written, {face.size[0]} x {face.size[1]}")
if not done: sys.exit("nothing new could be fetched")
