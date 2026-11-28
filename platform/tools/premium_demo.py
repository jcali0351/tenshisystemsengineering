"""
Make one sample site per premium design (Aurora, Meridian, Maison) with a farm-equipment business and real tractor photos
from the stock library, for screenshots (.github/workflows/cms-screens.yml). Prints "<template> <site id>" per site.
"""

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HERE))

from cms import db, media, sites, templates  # noqa: E402

db.setup()
templates.seed()
templates.seed_premium()
seed = HERE / "cms" / "stock_seed"
manifest = json.loads((seed / "manifest.json").read_text())["images"]
pics = [i for i in manifest if i["category"] == "tractors" and not i.get("license", "").count("BY")][:12]

profile = {
    "company": {"name": "Green Acres Equipment", "tagline": "Tractors that work as hard as you do",
                "description": "New and used tractors, hay equipment and repairs for Wisconsin farms since 1987. Honest prices, fast service, parts on the shelf.",
                "phone": "+1 608 555 0142", "email": "hello@example.com", "address": "4120 County Road K, Mount Horeb, WI",
                "service_areas": ["Dane County", "Iowa County", "Green County"],
                "hours": [{"days": "Mon–Fri", "time": "7:00–18:00"}, {"days": "Sat", "time": "8:00–12:00"}]},
    "services": [{"name": "Tractor sales", "description": "New and pre-owned tractors from 25 to 400 horsepower, checked by our own mechanics.", "price": "Financing available"},
                 {"name": "Hay & harvest equipment", "description": "Balers, mowers, rakes and wagons, ready for the season.", "price": "From $4,500"},
                 {"name": "Service & repairs", "description": "On-farm repairs, winter servicing and genuine parts, usually same week.", "price": "Free estimate"}],
    "staff": [{"name": "Dale Jensen", "role": "Owner", "bio": "Grew up on a dairy farm, has sold tractors for 35 years."},
              {"name": "Maria Olson", "role": "Service manager", "bio": "Keeps every machine in the county running."},
              {"name": "Tom Berg", "role": "Parts", "bio": "If it fits a tractor, he can find it."}],
    "testimonials": [{"quote": "They had our baler fixed in two days in the middle of haying. Lifesavers.", "author": "R. Lindqvist, Verona", "rating": 5},
                     {"quote": "Fair price on a used 5075E and they delivered it the next morning.", "author": "K. Moen, New Glarus", "rating": 5},
                     {"quote": "Straight answers and no pressure. We'll buy our next tractor here too.", "author": "J. Halverson, Dodgeville", "rating": 5}],
    "social": {"facebook": "https://facebook.com/example", "instagram": "https://instagram.com/example"},
    "seo": {"description": "Green Acres Equipment: tractors, hay equipment and repairs in south-west Wisconsin."},
}

for tpl in ("aurora", "meridian", "maison"):
    sub = f"green-acres-{tpl}"
    row = db.one("SELECT id FROM sites WHERE subdomain = ?", sub)
    site = sites.get(row["id"]) if row else sites.create_site(f"Green Acres ({tpl.title()})", tpl, sub, profile)
    sid = site["id"]
    ids = []
    for i in pics:
        item = media.save_upload(sid, Path(i["file"]).name, (seed / i["file"]).read_bytes(), None)
        db.run("UPDATE media SET alt = ? WHERE id = ?", i.get("alt") or i["title"], item["id"])
        ids.append(item["id"])
    for n, pid in enumerate(ids[1:7]):
        db.run("INSERT INTO portfolio_items (site_id, title, category, summary, cover_media_id, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
               sid, ["Restored 1967 tractor", "Hay season prep", "New compact tractor", "Field-ready rebuild", "Winter service", "Dealer delivery"][n],
               ["Restorations", "Service", "Sales", "Restorations", "Service", "Sales"][n], "Sample project.", pid, n, db.now())
    prof = db.j(db.one("SELECT profile_json FROM sites WHERE id = ?", sid)["profile_json"])
    for n, s in enumerate(prof.get("services", [])):
        s["image_media"] = ids[7 + n] if len(ids) > 7 + n else ""
    db.run("UPDATE sites SET profile_json = ? WHERE id = ?", db.dumps(prof), sid)
    for page in db.all("SELECT * FROM pages WHERE site_id = ?", sid):
        blocks = db.j(page["blocks_json"], [])
        for b in blocks:
            if b["type"] == "hero":
                b["data"].update({"image": ids[0], "button_text": "See tractors for sale", "kicker": "Family-run since 1987", "call_button": True})
            if b["type"] == "cta":
                b["data"].update({"heading": "Haying season is coming", "text": "Book your pre-season service now and skip the rush.", "button_text": "Book a service"})
        db.run("UPDATE pages SET blocks_json = ? WHERE id = ?", db.dumps(blocks), page["id"])
    print(tpl, sid)
