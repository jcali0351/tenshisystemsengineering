"""
demo.py: fill the CMS with one sample business, so there's something to look at.

    platform\\.venv\\Scripts\\python platform\\run_cms.py --demo      (or: python -m cms.demo, in the platform folder)

Makes "Ridgeline Builders" (Local Contractor template) with generated sample pictures, a gallery, three projects
(one with before and after), services, team, reviews, and deploys it. Running it again does nothing if the
demo site already exists. Everything it makes is clearly sample content and can be deleted from the CMS.
"""

import io

from PIL import Image, ImageDraw

from . import config, db, media, sites, templates


def _picture(text, top, bottom, size=(1600, 1067)):
    """A simple sample picture: a two-colour gradient with a few shapes and a label."""
    w, h = size
    img = Image.new("RGB", size)
    draw = ImageDraw.Draw(img)
    for y in range(h):
        t = y / h
        draw.line([(0, y), (w, y)], fill=tuple(int(top[i] * (1 - t) + bottom[i] * t) for i in range(3)))
    for i in range(6):                      # a few "buildings"
        x = 80 + i * (w - 160) // 6
        bh = int(h * (0.25 + 0.08 * ((i * 7) % 5)))
        draw.rectangle([x, h - bh, x + (w - 160) // 7, h], fill=tuple(max(0, c - 40) for c in bottom))
    draw.rectangle([0, h - 90, w, h], fill=(30, 30, 34))
    draw.text((40, h - 70), text, fill=(255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=88)
    return buf.getvalue()


def make_demo():
    config.ensure_folders()
    db.setup()
    templates.seed()
    if db.one("SELECT id FROM sites WHERE subdomain = 'ridgeline-builders'"):
        return None
    profile = {
        "company": {"name": "Ridgeline Builders", "tagline": "Built right. Built to last.",
                    "description": "A family-run building and renovation company. Kitchens, bathrooms, extensions and repairs, done on time and explained in plain words.",
                    "phone": "+81 6 1234 5678", "email": "hello@example.com", "address": "1-2-3 Example-cho, Kita-ku, Osaka",
                    "service_areas": ["Osaka", "Kobe", "Kyoto"], "hours": [{"days": "Mon–Fri", "time": "8:00–18:00"}, {"days": "Sat", "time": "9:00–13:00"}]},
        "services": [{"name": "Kitchen renovation", "description": "New layouts, cabinets, worktops and lighting, from plan to finish.", "price": "From ¥1,200,000"},
                     {"name": "Bathroom remodel", "description": "Walk-in showers, tiling and accessible bathrooms.", "price": "From ¥800,000"},
                     {"name": "Repairs", "description": "Leaks, doors, floors and walls. No job too small.", "price": "Free estimate"}],
        "staff": [{"name": "Kenji Mori", "role": "Founder", "bio": "Thirty years on building sites."},
                  {"name": "Aya Mori", "role": "Design & estimates", "bio": "Turns ideas into plans and honest prices."}],
        "testimonials": [{"quote": "They finished our kitchen a week early and left the house spotless.", "author": "T. Sato, Kobe", "rating": 5},
                         {"quote": "Clear prices, no surprises, lovely work.", "author": "M. Ito, Osaka", "rating": 5}],
        "locations": [{"name": "Osaka workshop", "address": "1-2-3 Example-cho, Kita-ku, Osaka", "phone": "+81 6 1234 5678"}],
        "social": {"instagram": "https://instagram.com/example"},
        "seo": {"description": "Ridgeline Builders: kitchens, bathrooms and repairs in Osaka, Kobe and Kyoto."},
    }
    site = sites.create_site("Ridgeline Builders", "contractor", "ridgeline-builders", profile)
    sid = site["id"]
    folder = {f["name"]: f["id"] for f in db.all("SELECT * FROM media_folders WHERE site_id = ?", sid)}
    pics = {}
    for key, label, top, bottom in [("hero", "Sample: finished kitchen", (224, 122, 31), (90, 40, 10)),
                                    ("k1", "Sample: oak kitchen", (210, 180, 140), (110, 80, 50)),
                                    ("k2", "Sample: white kitchen", (235, 235, 230), (150, 150, 145)),
                                    ("b1", "Sample: bathroom", (140, 190, 210), (40, 80, 100)),
                                    ("before", "Sample: BEFORE", (120, 110, 100), (60, 55, 50)),
                                    ("after", "Sample: AFTER", (250, 200, 120), (180, 90, 30)),
                                    ("team", "Sample: team on site", (180, 200, 160), (60, 90, 50))]:
        item = media.save_upload(sid, f"{key}-sample.jpg", _picture(label, top, bottom), folder.get("Projects" if key != "hero" else "Photos"))
        db.run("UPDATE media SET alt = ?, tags = 'sample' WHERE id = ?", label.replace("Sample: ", "Sample photo: "), item["id"])
        pics[key] = item["id"]
    album = db.run("INSERT INTO albums (site_id, name, layout, created_at) VALUES (?, 'Recent projects', 'masonry', ?)", sid, db.now())
    for n, key in enumerate(["k1", "k2", "b1", "after", "team"]):
        db.run("INSERT INTO album_items (album_id, media_id, position) VALUES (?, ?, ?)", album, pics[key], n)
    for n, (title, cat, cover, before, after) in enumerate([("Kitchen in Kobe", "Kitchens", pics["after"], pics["before"], pics["after"]),
                                                           ("Oak kitchen, Osaka", "Kitchens", pics["k1"], None, None),
                                                           ("Accessible bathroom", "Bathrooms", pics["b1"], None, None)]):
        db.run("INSERT INTO portfolio_items (site_id, title, category, summary, cover_media_id, before_media_id, after_media_id, position, created_at) "
               "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", sid, title, cat, "Sample project for the demo.", cover, before, after, n, db.now())
    # Put the hero picture and the album into the starting pages
    for page in db.all("SELECT * FROM pages WHERE site_id = ?", sid):
        blocks = db.j(page["blocks_json"], [])
        for b in blocks:
            if b["type"] == "hero":
                b["data"]["image"] = pics["hero"]
            if b["type"] == "gallery":
                b["data"]["album"] = album
        db.run("UPDATE pages SET blocks_json = ? WHERE id = ?", db.dumps(blocks), page["id"])
    sites.deploy(sid, "Demo content")
    return sites.get(sid)


if __name__ == "__main__":
    made = make_demo()
    print(f"Demo site ready: {config.site_url(made['subdomain'])}" if made else "The demo site already exists.")
