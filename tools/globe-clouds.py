"""World Pulse globe: where the clouds are. Writes data/globe/clouds.png, a 720 x 360 grey picture of the whole Earth
(longitude -180..180, north at the top) in which a pixel is black where there is no cloud and brighter the brighter
the cloud top, and data/globe/clouds.json, a note of the day, the satellite and how much of the globe is covered.

Source: NASA GIBS (public domain), yesterday's true-colour picture from one of the daily-pass satellites. A pixel that
is bright and nearly colourless is taken as cloud. Snow and ice look the same from above, so everything north of 66N
and south of 60S is left out and the page says so. Yesterday is used because today's picture is still being put
together. Which satellites still deliver changes over the years, so several are tried in turn and the log says which.
Runs from the data workflow; skips when the saved picture is already yesterday's.
"""
import datetime, io, json, math, os, subprocess, sys, urllib.request

try:
    from PIL import Image
except ImportError:
    subprocess.check_call("sudo apt-get update -qq && sudo apt-get install -y -qq python3-pil", shell=True)
    from PIL import Image

W, H, OUT = 720, 360, "data/globe/clouds"
day = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=1)).strftime("%Y-%m-%d")
if os.path.exists(OUT + ".json") and json.load(open(OUT + ".json")).get("day") == day and "--force" not in sys.argv:
    print(f"clouds for {day} already saved; skipping"); sys.exit(0)

LAYERS = ["VIIRS_NOAA20_CorrectedReflectance_TrueColor", "VIIRS_NOAA21_CorrectedReflectance_TrueColor", "VIIRS_SNPP_CorrectedReflectance_TrueColor",
          "MODIS_Aqua_CorrectedReflectance_TrueColor", "MODIS_Terra_CorrectedReflectance_TrueColor"]
best = None
for layer in LAYERS:
    url = ("https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap"
           f"&LAYERS={layer}&STYLES=&FORMAT=image/jpeg&CRS=EPSG:4326&BBOX=-90,-180,90,180&WIDTH=1440&HEIGHT=720&TIME={day}")
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "TenshiWorldPulse/1.0 (https://tenshisystems.com)"})
        data = urllib.request.urlopen(req, timeout=180).read()
        img = Image.open(io.BytesIO(data)).convert("RGB").resize((W, H), Image.BILINEAR)
    except Exception as e:
        print(f"{layer}: {e}"); continue
    px, out, area, seen = img.load(), bytearray(W * H), 0.0, 0.0
    for y in range(H):
        lat = 90 - (y + 0.5) / 2
        if lat > 66 or lat < -60: continue
        wgt = math.cos(math.radians(lat))
        for x in range(W):
            r, g, b = px[x, y]; mn, mx = min(r, g, b), max(r, g, b)
            if mx < 12: continue                                   # black: no picture here (gaps between passes)
            seen += wgt
            if mn > 150 and mx - mn < 46: out[y * W + x] = 60 + (mn - 150) * 195 // 105; area += wgt
    band = sum(math.cos(math.radians(90 - (y + 0.5) / 2)) for y in range(H) if -60 <= 90 - (y + 0.5) / 2 <= 66) * W
    cover, pct = seen / band, (area / seen * 100 if seen else 0)
    print(f"{layer}: picture covers {cover:.0%} of the band, {pct:.0f}% of that is cloud ({len(data)} bytes)")
    if cover > 0.6 and 15 < pct < 90 and (best is None or cover > best[1]): best = (layer, cover, pct, bytes(out))
    if best and best[1] > 0.9: break
if best is None: sys.exit("no usable cloud picture today; keeping the last saved one")
Image.frombytes("L", (W, H), best[3]).save(OUT + ".png", optimize=True)
json.dump({"day": day, "layer": best[0], "satellite": best[0].split("_Corrected")[0].replace("_", " "), "pct": round(best[2]), "updatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat()}, open(OUT + ".json", "w"))
print(f"clouds.png written from {best[0]} for {day}")
