"""World Pulse globe: the true colours of the land, so forests are green, deserts tan and brown, and ice white.
Writes data/globe/earth.jpg, a 1440 x 720 picture of the whole Earth without clouds (longitude -180..180 left to right,
north at the top). The page does not show the picture itself: it takes the colour under each land dot from it.

Source: NASA's Blue Marble (public domain), from NASA GIBS. It is a cloud-free composite of many months of satellite
passes, so it shows the land as it usually looks, not today's weather. It does not change, so the data workflow runs
this only while the file is missing.
"""
import io, subprocess, sys, urllib.request

try:
    from PIL import Image
except ImportError:
    subprocess.check_call("sudo apt-get update -qq && sudo apt-get install -y -qq python3-pil", shell=True)
    from PIL import Image

for layer in ("BlueMarble_NextGeneration", "BlueMarble_ShadedRelief", "BlueMarble_ShadedRelief_Bathymetry"):
    url = ("https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap"
           f"&LAYERS={layer}&STYLES=&FORMAT=image/jpeg&CRS=EPSG:4326&BBOX=-90,-180,90,180&WIDTH=2880&HEIGHT=1440")
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "TenshiWorldPulse/1.0 (https://tenshisystems.com)"})
        data = urllib.request.urlopen(req, timeout=300).read()
        img = Image.open(io.BytesIO(data)).convert("RGB")
        lo, hi = img.convert("L").getextrema()
        if hi - lo < 60: raise ValueError("picture is blank")
        # the Sahara should be clearly redder than the Amazon is, and the Amazon greener: a check that this is a colour map of land
        sahara, amazon = img.getpixel((int((10 + 180) * 8), int((90 - 23) * 8))), img.getpixel((int((-63 + 180) * 8), int((90 + 3) * 8)))
        if not (sahara[0] > sahara[2] + 20 and amazon[1] > amazon[0]): raise ValueError(f"colours look wrong (Sahara {sahara}, Amazon {amazon})")
    except Exception as e:
        print(f"{layer}: {e}"); continue
    img.resize((1440, 720), Image.LANCZOS).save("data/globe/earth.jpg", quality=88, optimize=True)
    print(f"earth.jpg written from {layer}: Sahara {sahara}, Amazon {amazon}")
    sys.exit(0)
sys.exit("no land-colour picture could be fetched")
