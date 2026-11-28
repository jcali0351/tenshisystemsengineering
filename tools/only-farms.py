"""Only Farms (tenshisystems.com/only-farms/): copies every tractor photo from the CMS stock library seed into
only-farms/photos/, makes a 560 px preview of each in only-farms/thumbs/, and writes only-farms/photos.json with each
photo's title, kinds, year, make and credit (creator, licence, source page) from the library's own manifest.
Run again after the library changes:  python3 tools/only-farms.py
"""
import json, re, shutil
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SEED = ROOT / "platform/cms/stock_seed"
OUT = ROOT / "only-farms"
(OUT / "photos").mkdir(parents=True, exist_ok=True); (OUT / "thumbs").mkdir(exist_ok=True)

MAKES = ["John Deere", "Massey Ferguson", "Massey Harris", "New Holland", "Case IH", "Allis Chalmers", "Minneapolis Moline",
         "David Brown", "Field Marshall", "Deutz Fahr", "International Harvester", "McCormick", "Farmall", "Fordson", "Ford",
         "Fendt", "Claas", "Kubota", "Challenger", "Ferguson", "Deutz", "Belarus", "MTZ", "Zetor", "Steyr", "Fiat", "Iseki",
         "Oliver", "Rumely", "Cletrac", "Caterpillar", "Lister", "Nuffield", "Leyland", "Twin City", "Buehrer", "Lovol",
         "Sheppard", "Lauson", "Moline", "LTZ", "Valtra", "Landini", "Lamborghini", "SAME", "Hurlimann", "Renault", "Ursus"]
SMALL = {"and", "at", "in", "on", "with", "of", "a", "the", "by", "from", "to"}
KEEP = {m.lower(): m for m in MAKES} | {"ih": "IH", "jd": "JD", "4wd": "4WD", "ttv": "TTV", "tms": "TMS", "ps": "PS", "mt765c": "MT765C"}

def nice(t):
    t = re.sub(r"\b(pic|p)\d\b|\bva1\b|\bg1\b", "", t, flags=re.I).strip()
    for m in sorted(MAKES, key=len, reverse=True):
        t = re.sub(r"\b" + re.escape(m) + r"\b", m, t, flags=re.I)
    words = t.split()
    out = []
    for i, w in enumerate(words):
        lw = w.lower()
        if lw in KEEP and not any(c.isupper() for c in w[1:]): out.append(KEEP[lw])
        elif i and lw in SMALL: out.append(lw)
        elif any(c.isupper() for c in w): out.append(w)
        elif re.fullmatch(r"[a-z]+\d+[a-z]*|\d+[a-z]+", lw) and not re.fullmatch(r"\d{4}s", lw): out.append(w.upper())
        else: out.append(w[:1].upper() + w[1:])
    return " ".join(out).replace("Mccormick", "McCormick")

def kinds(t, year):
    t = t.lower(); k = []
    if re.search(r"wheel|engine|grille|badge|dashboard|steering|nameplate|tire|tyre|pipes|block", t): k.append("details")
    if re.search(r"snow|winter|blow", t): k.append("winter")
    if re.search(r"bal(e|ing)|hay|harvest|thresh|rotonde|accumulator|silage|grass harvest", t): k.append("harvest")
    if "winter" not in k and re.search(r"plou|plow|harrow|cultivat|sprayer|planting|tilling|field|seedling|furrow|rapeseed|soil|implement", t): k.append("field")
    if re.search(r"pull\b|show|rally|festival|museum|agritechnica|agra\b|woche|match|contest|crafts day|road show|ploughing run|christmas", t): k.append("shows")
    old = (year and year < 1975) or re.search(r"farmall|fordson|allis|massey harris|oil pull|rumely|field marshall|(?<!massey )ferguson|massey ferguson [0-3]?\d{2}\b|fendt (farmer|fix|dieselross|favorit)|david brown|deutz d\d|international harvester|nuffield|ford \d{4} |mtz|belarus|historic|antique|rusty|vintage|lister|cletrac|oliver|minneapolis|twin city|mccormick|lauson|abandoned|disused|ansel", t)
    k.append("vintage" if old else "modern")
    return k

man = json.loads((SEED / "manifest.json").read_text())["images"]
rows = []
for i in man:
    blob = (i["title"] + " " + i["alt"]).lower()
    if not (i["category"] == "tractors" or (i["category"] == "farm-equipment" and "tractor" in blob)): continue
    src = SEED / i["file"]
    if not src.is_file(): continue
    name = Path(i["file"]).name
    shutil.copyfile(src, OUT / "photos" / name)
    th = OUT / "thumbs" / name
    if not th.exists():
        im = Image.open(src); im.thumbnail((560, 560)); im.save(th, "WEBP", quality=72, method=6)
    title = i["title"] if i["title"].lower() not in ("tractor field", "tractor farm") else i["alt"] or i["title"]
    y = re.search(r"\b(19[0-9]{2}|20[0-2][0-9])\b", title)
    year = int(y.group(1)) if y else None
    make = next((m for m in sorted(MAKES, key=len, reverse=True) if re.search(r"\b" + re.escape(m) + r"\b", title, re.I)), "")
    if make == "Moline": make = "Minneapolis Moline" if "minneapolis" in title.lower() else "Moline"
    lic = i.get("license", "")
    w, h = Image.open(th).size
    rows.append({"f": name, "t": nice(title), "k": kinds(title, year), "y": year, "m": make,
                 "by": i.get("creator", ""), "lic": lic, "licUrl": i.get("license_url", ""), "src": i.get("source_url", ""),
                 "credit": bool(re.search(r"\bBY\b", lic)), "w": w, "h": h})
rows.sort(key=lambda r: r["t"].lower())
(OUT / "photos.json").write_text(json.dumps(rows, separators=(",", ":"), ensure_ascii=False))
from collections import Counter
print(len(rows), "photos;", Counter(k for r in rows for k in r["k"]), "; makes:", len({r["m"] for r in rows if r["m"]}), "; credit:", sum(r["credit"] for r in rows))
