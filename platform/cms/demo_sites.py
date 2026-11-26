"""
demo_sites.py: the public demo sites (demo-<type>.<SITES_DOMAIN>) and the "Try the CMS" sandbox.

Five fictional Madison, WI businesses and four faith communities (demo_faith.py), each on its own template and theme,
built from Content Bot's starter copy (cms/demo_content/, used here with the owner's go-ahead) and clear-origin pictures
only (CC0, public domain or AI-generated for Tenshi: cms/stock_seed/ and demo_content/faith/images/). Every demo site:
  * carries a "Demo site by Tenshi Systems" ribbon and noindex (render.py);
  * sends no email and posts nothing (mail.py, notify.py, autopost, newsletter, AI assist check is_demo());
  * is created on start-up when missing (seed_all, idempotent) and rebuilt from scratch every night (reset_all).
The sandbox site ("demo-sandbox") is a copy of demo-cafe that the restricted demo user edits (see sandbox.py). It is
never served publicly: publishing works, but its address shows a short note instead (app.serve_client_sites).
"""

from __future__ import annotations

import copy
import json
import re
import threading
from datetime import date, datetime, timedelta
from pathlib import Path

from . import blocks, db, media, sites, sitetime, templates, widgets

HERE = Path(__file__).parent
CONTENT_DIR = HERE / "demo_content"
STOCK_DIR = HERE / "stock_seed"
CLEAR_LICENCES = ("CC0", "Public domain", "AI-generated")      # no credit needed, no held images
SETTING = "demo"                                                # site_settings key marking a demo site
SANDBOX = "demo-sandbox"
_lock = threading.Lock()


# ---------------------------------------------------------------------------------------------- flags

def demo_info(site_id) -> dict | None:
    if not site_id:
        return None
    row = db.one("SELECT value_json FROM site_settings WHERE site_id = ? AND key = ?", site_id, SETTING)
    return db.j(row["value_json"], {}) if row else None


def is_demo(site) -> bool:
    """True for every demo site and the sandbox: no email, no posting, ribbon, nightly reset."""
    sid = site.get("id") if isinstance(site, dict) else site
    return demo_info(sid) is not None


def sandbox_id() -> int | None:
    row = db.one("SELECT id FROM sites WHERE subdomain = ?", SANDBOX)
    return row["id"] if row else None


# ---------------------------------------------------------------------------------------------- pictures

def _manifest() -> list[dict]:
    try:
        return json.loads((STOCK_DIR / "manifest.json").read_text(encoding="utf-8"))["images"]
    except (OSError, ValueError, KeyError):
        return []


FAITH_DIR = CONTENT_DIR / "faith"


def _faith_manifest() -> list[dict]:
    try:
        items = json.loads((FAITH_DIR / "images" / "manifest.json").read_text(encoding="utf-8"))["images"]
    except (OSError, ValueError, KeyError):
        return []
    return [{**m, "_dir": str(FAITH_DIR)} for m in items]


def clear_images(category: str) -> list[dict]:
    pool = _faith_manifest() if category == "faith" else _manifest()
    return [m for m in pool if m["category"] == category and m.get("license", "").startswith(CLEAR_LICENCES)]


class Pics:
    """Copies chosen stock photos into one site's Media Center (once each) and hands out media ids."""

    def __init__(self, site_id: int, categories: list[str]):
        self.site_id, self.ids = site_id, {}
        self.pool = [m for c in categories for m in clear_images(c)]
        folders = {f["name"]: f["id"] for f in db.all("SELECT * FROM media_folders WHERE site_id = ?", site_id)}
        self.folder = folders.get("Photos")

    def get(self, file_part: str) -> str:
        """The media id (as text, like a media field) of the first pool photo whose file name contains file_part."""
        m = next((m for m in self.pool if file_part in m["file"]), None)
        if not m:
            return ""
        if m["key"] not in self.ids:
            data = (Path(m.get("_dir") or STOCK_DIR) / m["file"]).read_bytes()
            item = media.save_upload(self.site_id, Path(m["file"]).name, data, self.folder)
            alt = (m.get("alt") or m.get("title") or "").strip()
            db.run("UPDATE media SET alt = ?, tags = ? WHERE id = ?", alt[:300] if len(alt) > 3 else "Sample photo",
                   "demo, stock", item["id"])
            self.ids[m["key"]] = str(item["id"])
        return self.ids[m["key"]]

    def file(self, path: Path, title: str = "") -> str:
        """Copy one of our own placeholder files (video/audio) into the site's Media Center; its media id as text."""
        item = media.save_upload(self.site_id, path.name, path.read_bytes(), self.folder)
        db.run("UPDATE media SET alt = ?, tags = ? WHERE id = ?", title[:300], "demo, placeholder", item["id"])
        return str(item["id"])

    def album(self, name: str, parts: list[str], layout="masonry") -> str:
        album = db.run("INSERT INTO albums (site_id, name, layout, created_at) VALUES (?, ?, ?, ?)", self.site_id, name, layout, db.now())
        for n, part in enumerate(parts):
            mid = self.get(part)
            if mid:
                db.run("INSERT INTO album_items (album_id, media_id, position) VALUES (?, ?, ?)", album, int(mid), n)
        return str(album)


# ---------------------------------------------------------------------------------------------- starter copy

COMMON = {"[City]": "Madison", "[State]": "WI", "[Nearby Town]": "Middleton", "[Date range]": "December 1–23",
          "[Time]": "6:00 PM", "[Date]": "the first Saturday of the month", "[X]": "2", "[year]": "2014",
          "[Add or remove team members under Business data › Team.]": ""}


PH_TITLE = "Placeholder: the congregation fills this in (edit it in the CMS)"
DROP = re.compile(r"\s*\[(?:Add|Describe|Explain|Check|Mention|Edit|Replace|These are|List|ADD|PLACEHOLDER|describe|explain|list|remove if|placeholder)[^\]\"]*\]")


def _mark(obj):
    """⟦token⟧ (a placeholder kept on purpose) → a visible highlighted placeholder in HTML, or [token] in plain text."""
    if isinstance(obj, dict):
        return {k: _mark(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_mark(v) for v in obj]
    if isinstance(obj, str) and "⟦" in obj:
        html = "<" in obj
        return re.sub(r"⟦([^⟧]*)⟧", (lambda m: f'<span class="demo-ph" title="{PH_TITLE}">{m.group(1)}</span>') if html
                      else (lambda m: f"[{m.group(1)}]"), obj)
    return obj


def adapt(obj, fills: dict, prices=("12", "18", "24", "9", "15", "30"), keep=()):
    """Swap the starter's [placeholders] for this demo's details; drop instructions meant for the owner.
    Placeholders listed in keep (e.g. the mosque's prayer times) stay, visibly marked as placeholders."""
    text = json.dumps(obj, ensure_ascii=False)
    for k in keep:
        text = text.replace(k, "⟦" + k.strip("[]") + "⟧")
    for k, v in [*fills.items(), *COMMON.items()]:          # this demo's own (more specific) fills first
        text = text.replace(k, json.dumps(v, ensure_ascii=False)[1:-1])
    text = text.replace("[Sample review — replace with a real customer quote] ", "Sample review: ")
    text = DROP.sub("", text)
    n = iter(range(10_000))
    text = re.sub(r"\[XX\]", lambda m: prices[next(n) % len(prices)], text)
    text = re.sub(r"\[([^\]\"]{1,60})\]", r"\1", text)          # anything left: keep the words, lose the brackets
    return _mark(json.loads(text))


def starter(category: str) -> dict:
    return json.loads((CONTENT_DIR / f"{category}.json").read_text(encoding="utf-8"))


def B(block_type, /, **data):
    """Like blocks.new_block, but a field may be called "kind" (the price list has one)."""
    if block_type not in blocks.BLOCKS:                 # modules registered after blocks.py was first imported
        blocks.BLOCKS.update(widgets.block_types())
    block = blocks.new_block(block_type)
    block["data"].update(data)
    return block


def _days(n):
    return (date.today() + timedelta(days=n)).isoformat()


def _next(weekday: int, weeks=0):
    d = date.today() + timedelta(days=1)
    while d.weekday() != weekday:
        d += timedelta(days=1)
    return (d + timedelta(weeks=weeks)).isoformat()


WEEK = lambda opens, closes, closed=(): [{"day": d, "opens": opens.get(d, opens.get("*", "09:00")), "closes": closes.get(d, closes.get("*", "17:00")),
                                         "closed": d in closed} for d in ("mon", "tue", "wed", "thu", "fri", "sat", "sun")]   # noqa: E731


# ---------------------------------------------------------------------------------------------- the six sites

def _cafe(p: Pics, name: str) -> dict:
    hero, about = p.get("restaurant-hero-1"), p.get("restaurant-about")
    album = p.album("Around the café", ["restaurant-service-2", "restaurant-gallery-3", "restaurant-service-3", "restaurant-hero-2",
                                       "restaurant-gallery-2", "restaurant-gallery-1", "restaurant-service-1", "madison/c-chen"])
    menu = [{"name": "Coffee & espresso", "note": "Beans roasted weekly by a Wisconsin roaster", "items":
             "Drip coffee | $3 | Bottomless when you stay in | popular\nCortado | $4.25\nOat-milk latte | $5.50 | | vg\nMaple cardamom latte | $6 | Our winter special | new"},
            {"name": "Breakfast (until 2 PM)", "items": "Driftless breakfast sandwich | $9 | Egg, cheddar, greens on a brioche bun\n"
             "Overnight oats | $7 | Cherries from Door County, toasted pecans | vg\nShakshuka | $12 | With sourdough | v, spicy"},
            {"name": "Lunch & bakery", "items": "Seasonal soup | $8 | With bread\nRoasted squash grain bowl | $13 | | vg, gf\n"
             "Cardamom bun | $4.50 | Baked every morning | popular\nGluten-free brownie | $4 | | gf"}]
    return {"category": "restaurant", "template": "restaurant",
            "theme": {"preset": "forest", "colors": {"primary": "#4a2c1a", "accent": "#b45309", "surface": "#fbf7f1", "ink": "#24170f"},
                      "fonts": {"heading": "fraunces", "body": "figtree"}, "style": "clean", "radius": 12, "space": "normal", "mode": "light", "toggle": True},
            "fills": {"[Your Business Name]": name, "[Street Address]": "1452 Williamson St", "[Phone]": "(608) 555-0142",
                      "[Owner Name]": "Maya Lindqvist", "[Chef Name]": "Jonah Reyes", "[Team Member Name]": "Priya Shah",
                      "[11:30 AM]": "7:00 AM", "[9:00 PM]": "6:00 PM", "[10:00 PM]": "9:00 PM", "[11:00 AM]": "8:00 AM", "[3:00 PM]": "3:00 PM",
                      "Now open in Madison": "Willy Street, Madison", "Good food, good company, a table waiting for you": "Slow coffee, warm bakes and a seat by the window",
                      "[Starter Name]": "Seasonal soup", "[Main Dish Name]": "Grain bowl", "[Vegetarian Main]": "Shakshuka", "[Dessert Name]": "Cardamom bun"},
            "company": {"tagline": "Slow coffee, warm bakes, Willy Street", "email": "hello@example.com",
                        "description": f"{name} is a neighborhood coffee house and café on Williamson Street in Madison, WI. Locally roasted coffee, breakfast and lunch all day, and a calendar full of community nights."},
            "hero": hero, "about_img": about, "album": album, "keep": ["index", "about", "services", "faq", "contact"],
            "pages": {
                "index": ("Home", None, [B("hours", heading="Open today?", layout="compact", days=WEEK({"*": "07:00", "sat": "08:00", "sun": "08:00"}, {"*": "18:00", "fri": "21:00", "sat": "21:00", "sun": "15:00"}),
                                            holidays=[{"date": f"{date.today().year}-12-25", "label": "Christmas Day", "closed": True}]),
                                          B("newsletter", heading="Join the Willy Street regulars", text="Monthly news: new drinks, events and the occasional free cardamom bun.", look="band")]),
                "menu": ("Menu", [B("price_list", heading="Menu", intro="Everything is made in our kitchen. Ask us about allergens.", sections=menu,
                                    footnote="Prices include sales tax. Sample menu for a demo site.")], None),
                "book": ("Book", [B("appointments", heading="Book a table or the back room", intro="Reserve a table for brunch, or the back room for a meeting or a small party.",
                                    services=[{"name": "Table for 2–4 (brunch)", "minutes": 60, "price": "", "about": "Weekends fill up fast."},
                                              {"name": "Back room (up to 16)", "minutes": 120, "price": "$40", "about": "Screen, whiteboard and coffee service.", "buffer_after": 30}],
                                    days="mon, tue, wed, thu, fri, sat, sun", opens="08:00", closes="17:00", step=30, notice_hours=4),
                                  B("events", heading="Community nights", view="month", items=[
                                      {"title": "Open mic night", "date": _next(3), "start": "19:00", "end": "21:00", "location": name, "category": "Music",
                                       "description": "Sign up at the counter from 6:30. Acoustic sets, poetry and the odd ukulele.", "capacity": 40, "image": p.get("restaurant-service-4")},
                                      {"title": "Latte art class", "date": _next(5, 1), "start": "10:00", "end": "11:30", "location": name, "category": "Class",
                                       "description": "Learn to pour hearts and tulips with our baristas. Coffee included.", "capacity": 8, "max_guests": 2, "image": p.get("restaurant-service-2")},
                                      {"title": "Board game Sunday", "date": _next(6, 1), "start": "13:00", "end": "15:00", "location": name, "category": "Community",
                                       "description": "Bring a game or borrow one of ours.", "rsvp": False}])], None),
                "gallery": ("Gallery", [B("gallery", heading="Around the café", album=album, layout="masonry", lightbox=True)], None),
                "contact": ("Visit", [B("map", heading="Find us on Willy Street", address="1452 Williamson St, Madison, WI 53703", provider="google", latitude="43.0889", longitude="-89.3612"),
                                       B("contact_form", heading="Questions, catering or wholesale?", preset="contact")], "replace")},
            }


def _salon(p: Pics, name: str) -> dict:
    album = p.album("Our work", ["salon-spa-gallery-1", "salon-spa-gallery-2", "salon-spa-service-2", "salon-spa-gallery-3", "salon-spa-service-3", "salon-spa-gallery-4"])
    prices = [{"name": "Hair", "items": "Women's cut & style | $68 | Includes wash and blow-dry | popular\nMen's cut | $38\nBalayage | $185+ | Consultation included\nGloss treatment | $45"},
              {"name": "Spa", "items": "Signature facial (60 min) | $95 | | popular\nHot stone massage (75 min) | $120\nAromatherapy add-on | $15"},
              {"name": "Nails", "items": "Gel manicure | $42\nSpa pedicure | $55 | Sea-salt soak and massage\nNail art | $5+ | | new"}]
    return {"category": "salon", "template": "portfolio",
            "theme": {"preset": "elegant", "colors": {"primary": "#5b3a55", "accent": "#9a6b2f", "surface": "#fdf9f7", "ink": "#2a1f28"},
                      "fonts": {"heading": "eb-garamond", "body": "nunito"}, "style": "elegant", "radius": 18, "space": "airy", "mode": "light", "toggle": True},
            "fills": {"[Your Business Name]": name, "[Street Address]": "2120 Atwood Ave", "[Phone]": "(608) 555-0177", "[Owner Name]": "Elena Moreau",
                      "[Stylist Name]": "Sofia Grant", "[Therapist Name]": "Hana Kim", "[9:00 AM]": "9:00 AM", "[5:00 PM]": "5:00 PM", "[7:00 PM]": "8:00 PM",
                      "[24]": "24", "[5–10]": "10", "[add your offer]": "20% off your first facial", "[hair, nail and beauty treatments]": "hair, nail and spa treatments",
                      "[online]": "online"},
            "company": {"tagline": "Hair, skin and calm on Atwood Avenue", "email": "hello@example.com",
                        "description": f"{name} is a calm, light-filled salon and day spa on Atwood Avenue in Madison, WI: cuts and color, facials, massage and nails."},
            "hero": p.get("salon-spa-hero-1"), "about_img": p.get("salon-spa-about"), "album": album, "keep": ["index", "about", "services", "faq", "contact"],
            "pages": {
                "index": ("Home", None, [B("testimonials", heading="Kind words (sample reviews)", layout="featured", from_google=False)]),
                "book": ("Book online", [B("appointments", heading="Book an appointment", intro="Choose a treatment, a stylist and a time. You'll get a confirmation on screen (emails are off on this demo).",
                                           services=[{"name": "Women's cut & style", "minutes": 60, "price": "$68", "buffer_after": 15},
                                                     {"name": "Men's cut", "minutes": 30, "price": "$38"},
                                                     {"name": "Signature facial", "minutes": 60, "price": "$95", "buffer_after": 15},
                                                     {"name": "Gel manicure", "minutes": 45, "price": "$42"}],
                                           staff=[{"name": "Sofia Grant", "services": "Women's cut & style, Men's cut"}, {"name": "Hana Kim", "services": "Signature facial, Gel manicure"},
                                                  {"name": "Elena Moreau", "days": "tue, thu, sat"}],
                                           days="tue, wed, thu, fri, sat", opens="09:00", closes="19:00", step=15, notice_hours=6)], None),
                "prices": ("Prices", [B("price_list", heading="Price list", kind="services", sections=prices, columns="2", footnote="Sample prices for a demo site."),
                                      B("testimonials", heading="What clients say", layout="wall", from_google=False)], None),
                "gallery": ("Gallery", [B("gallery", heading="Our work", album=album, layout="grid", lightbox=True)], None),
                "contact": ("Contact", [B("hours", heading="Opening hours", days=WEEK({"*": "09:00"}, {"*": "19:00", "sat": "17:00"}, ("sun", "mon"))),
                                         B("map", heading="Find us", address="2120 Atwood Ave, Madison, WI 53704", latitude="43.0927", longitude="-89.3492"),
                                         B("contact_form", heading="Ask us anything", preset="contact")], "replace")},
            }


def _contractor(p: Pics, name: str) -> dict:
    return {"category": "contractor", "template": "roofing",
            "theme": {"preset": "bold", "colors": {"primary": "#1f2937", "accent": "#ea580c", "surface": "#ffffff", "ink": "#111827"},
                      "fonts": {"heading": "oswald", "body": "inter"}, "style": "bold", "radius": 4, "space": "compact", "mode": "light", "toggle": True},
            "fills": {"[Your Business Name]": name, "[Street Address]": "4802 Tradewinds Pkwy", "[Phone]": "(608) 555-0119", "[Owner Name]": "Dan Kowalski",
                      "[Team Member Name]": "Rosa Jimenez", "[7:00 AM]": "7:00 AM", "[5:00 PM]": "5:00 PM", "[By appointment]": "By appointment",
                      "[price]": "free estimate", "Quality building work, done right the first time": "Roofs built for Wisconsin winters",
                      "Building and renovation in Madison": "Roofing & exteriors in Madison",
                      "From a small repair to a full renovation": "From a missing shingle to a full re-roof"},
            "company": {"tagline": "Roofs, siding and gutters that ride out Wisconsin winters", "email": "estimates@example.com",
                        "description": f"{name} replaces and repairs roofs, siding and gutters across Dane County. Licensed, insured and family-run since 2009."},
            "hero": p.get("roofing-hero-1"), "about_img": p.get("roofing-about"),
            "album": p.album("Recent roofs", ["roofing-gallery-1", "roofing-gallery-4", "roofing-service-1", "roofing-gallery-3", "roofing-hero-2", "roofing-og"]),
            "keep": ["index", "about", "services", "faq", "contact"],
            "pages": {
                "index": ("Home", None, [B("trust_badges", heading="", items=[{"icon": "shield", "title": "Licensed & insured"}, {"icon": "star", "title": "Since 2009"},
                                                                             {"icon": "clock", "title": "48-hour estimates"}, {"icon": "check", "title": "10-year workmanship warranty"}])]),
                "projects": ("Projects", [B("before_after", heading="Before and after", before=p.get("roofing-service-2"), after=p.get("roofing-gallery-1"),
                                            caption="Sample pair: storm-damaged tile roof replaced with architectural shingles",
                                            more=[{"before": p.get("roofing-service-4"), "after": p.get("roofing-hero-2"), "caption": "Sample pair: worn tiles to a new roof"}]),
                                          B("case_studies", heading="Case studies", intro="Sample projects for a demo site.", filters=True, items=[
                                              {"title": "Hail damage on the near west side", "client": "Sample homeowner, Regent St", "tags": "Roofing, Insurance", "image": p.get("roofing-gallery-4"),
                                               "summary": "A full tear-off and re-roof after June hail, handled with the insurer from first photo to final check.",
                                               "metrics": "4 days | start to finish\n$0 | out of pocket beyond the deductible", "challenge": "Hail cracked shingles and dented gutters across two elevations.",
                                               "solution": "Photo report for the insurer in 24 hours, tear-off, ice-and-water shield, architectural shingles and new seamless gutters.",
                                               "results": "Approved in one visit; the family never left the house.", "quote": "Sample review: they dealt with the insurance so we didn't have to.", "quote_by": "Sample Customer A"},
                                              {"title": "Siding and gutters for a 1920s bungalow", "client": "Sample homeowner, Schenk-Atwood", "tags": "Siding, Gutters", "image": p.get("roofing-gallery-3"),
                                               "summary": "Fiber-cement siding in a period color with hidden-hanger gutters.", "metrics": "−18% | heating bill the next winter\n2 weeks | on site",
                                               "challenge": "Rotting clapboard and gutters pulling away from the fascia.", "solution": "New house wrap, insulation board, fiber-cement lap siding and 6-inch seamless gutters.",
                                               "results": "A tighter, warmer house that still looks like it belongs on the street."}]),
                                          B("gallery", heading="Recent roofs", source="album", layout="carousel")], None),
                "quote": ("Free quote", [B("contact_form", heading="Get a free estimate", intro="Tell us about the job. We reply within one working day (on this demo, messages are saved to Leads only).",
                                           preset="quote", consent=True)], None),
                "contact": ("Contact", [B("map", heading="Our yard", address="4802 Tradewinds Pkwy, Madison, WI 53718", latitude="43.0436", longitude="-89.3060"),
                                         B("contact_form", heading="Send us a message", preset="contact")], "replace")},
            }


def _retail(p: Pics, name: str) -> dict:
    return {"category": "retail", "template": "ecommerce",
            "theme": {"preset": "tenshi", "colors": {"primary": "#7c3aed", "accent": "#db2777", "surface": "#ffffff", "ink": "#1e1b2e"},
                      "fonts": {"heading": "montserrat", "body": "dm-sans"}, "style": "clean", "radius": 16, "space": "normal", "mode": "dark", "toggle": True},
            "fills": {"[Your Business Name]": name, "[Street Address]": "2818 Atwood Ave", "[Phone]": "(608) 555-0163", "[Owner Name]": "Leo Tanaka",
                      "[Team Member Name]": "Ava Brooks", "[10:00 AM]": "10:00 AM", "[12:00 PM]": "11:00 AM", "[5:00 PM]": "5:00 PM", "[6:00 PM]": "7:00 PM",
                      "[Product Name]": "Glow tee", "[describe your range]": "tees, art prints and desk gear", "[products]": "prints and merch",
                      "[regions]": "the Midwest", "[season]": "winter", "[type of products]": "screen-printed goods"},
            "company": {"tagline": "Screen-printed tees, art prints and desk gear", "email": "shop@example.com",
                        "description": f"{name} is a small print shop and gift store on Atwood Avenue in Madison, WI: tees, art prints and desk mats printed in the back room."},
            "hero": p.get("ecommerce-hero-2"), "about_img": p.get("ecommerce-about"),
            "album": p.album("In the shop", ["ecommerce-og", "ecommerce-gallery-1", "ecommerce-service-3", "ecommerce-gallery-4", "ecommerce-service-1", "ecommerce-gallery-3"]),
            "keep": ["index", "about", "services", "faq", "contact"],
            "pages": {
                "index": ("Home", None, [B("store", variant="grid", heading="New in the shop", limit=4, columns="4")]),
                "shop": ("Shop", [B("store", variant="grid", heading="Shop everything", intro="Demo store: browse, add to the cart and try checkout (it's switched off, nothing is charged).",
                                    limit=12, columns="3", filters=True, sort="featured"),
                                  B("store", variant="product", heading="Staff pick", product_handle="neon-angel-tee"),
                                  B("store", variant="buy", heading="Gift it in one click", product_handle="undercity-art-print", button_text="Buy the print"),
                                  B("store", variant="cart", heading="Your cart")], None),
                "gallery": ("In the shop", [B("gallery", heading="In the shop", layout="grid", lightbox=True)], None),
                "contact": ("Visit", [B("hours", heading="Shop hours", days=WEEK({"*": "10:00", "sun": "11:00"}, {"*": "19:00", "sun": "17:00"}, ("mon",))),
                                       B("map", heading="Find the shop", address="2818 Atwood Ave, Madison, WI 53704", latitude="43.0961", longitude="-89.3387"),
                                       B("contact_form", heading="Custom printing or wholesale?", preset="quote")], "replace")},
            }


def _law(p: Pics, name: str) -> dict:
    people = [{"name": "Grace Hartwell", "role": "Founding partner", "department": "Family law", "email": "ghartwell@example.com",
               "bio": "Twenty years in Dane County family court. Mediator and collaborative-law trained."},
              {"name": "Samuel Okafor", "role": "Partner", "department": "Estate planning", "email": "sokafor@example.com", "bio": "Wills, trusts and probate, explained in plain English."},
              {"name": "Lena Brandt", "role": "Associate", "department": "Business law", "bio": "Contracts, LLCs and leases for small businesses."},
              {"name": "Marcus Lee", "role": "Associate", "department": "Family law", "bio": "Custody, support and adoption."},
              {"name": "Ruth Alvarez", "role": "Paralegal", "department": "Estate planning", "phone": "(608) 555-0185"},
              {"name": "Tom Nguyen", "role": "Office manager", "department": "Client services", "phone": "(608) 555-0180"}]
    faq = [{"question": "Is the first consultation free?", "answer": "Yes: 30 minutes, in person or by video, with no obligation. (Sample answer for a demo site.)"},
           {"question": "Do you offer flat fees?", "answer": "For wills, simple trusts and LLC formation, yes. We'll quote before we start."},
           {"question": "Which office should I visit?", "answer": "Either: both offices have meeting rooms and free parking. Video meetings are available too."},
           {"question": "Is this real legal advice?", "answer": "No. This is a demo website for a fictional firm made by Tenshi Systems."}]
    return {"category": "legal", "template": "lawfirm",
            "theme": {"preset": "ocean", "colors": {"primary": "#14365d", "accent": "#a16207", "surface": "#f7f9fc", "ink": "#0f1c2c"},
                      "fonts": {"heading": "newsreader", "body": "inter"}, "style": "clean", "radius": 6, "space": "normal", "mode": "light", "toggle": True},
            "fills": {"[Your Business Name]": name, "[Street Address]": "16 N Carroll St, Suite 400", "[Phone]": "(608) 555-0180", "[Attorney Name]": "Grace Hartwell",
                      "[Team Member Name]": "Samuel Okafor", "[9:00 AM]": "8:30 AM", "[5:00 PM]": "5:30 PM", "[Practice Area 1]": "Family law",
                      "[Practice Area 2]": "Estate planning", "[Practice Area 3]": "Small-business law", "[list your practice areas]": "family law, estate planning and small-business law",
                      "[practice area]": "family law", "[practice areas]": "family, estate and business law", "[price]": "a free 30-minute consultation"},
            "company": {"tagline": "Family, estate and small-business law on the Capitol Square", "email": "office@example.com",
                        "description": f"{name} is a fictional Madison, WI law firm (a demo site): family law, estate planning and small-business law, with offices on the Capitol Square and in Middleton."},
            "hero": p.get("lawfirm-hero-2"), "about_img": p.get("lawfirm-gallery-2"), "album": None, "keep": ["index", "about", "services", "contact"],
            "pages": {
                "index": ("Home", None, [B("trust_badges", heading="", items=[{"icon": "shield", "title": "Free first consultation"}, {"icon": "star", "title": "25+ years combined"},
                                                                             {"icon": "clock", "title": "Replies within one business day"}])]),
                "team": ("Our team", [B("team", heading="Our attorneys and staff", from_business=False, people=people, layout="grid", filters=True, search=True)], None),
                "faq": ("FAQ", [B("faq", heading="Questions clients ask", items=faq, open_first=True)], None),
                "locations": ("Offices", [B("locations", heading="Two offices, one team", provider="google", places=[
                    {"name": "Capitol Square", "address": "16 N Carroll St, Madison, WI 53703", "phone": "(608) 555-0180", "hours": "Mon–Fri 8:30–5:30", "latitude": "43.0760", "longitude": "-89.3863"},
                    {"name": "Middleton", "address": "7601 University Ave, Middleton, WI 53562", "phone": "(608) 555-0181", "hours": "Tue–Thu 9–5", "latitude": "43.0969", "longitude": "-89.5043"}])], None),
                "contact": ("Contact", [B("contact_form", heading="Request a consultation", preset="appointment", consent=True,
                                          intro="Tell us briefly what it's about. Please don't send confidential details through a website form.")], "replace")},
            }


DEMOS = {
    "demo-cafe": ("Driftless Bean Coffee House", "Café & restaurant", _cafe, ["restaurant", "madison"],
                  ["Gallery", "Menu", "Booking", "Events + RSVP", "Hours", "Google map", "Contact form", "Newsletter", "Dark mode"]),
    "demo-salon": ("Willow & Stone Salon + Spa", "Salon & spa", _salon, ["salon-spa"],
                   ["Appointment booking", "Price list", "Testimonials", "Gallery", "Hours", "Map"]),
    "demo-contractor": ("Isthmus Roofing & Exteriors", "Roofing contractor", _contractor, ["roofing"],
                        ["Before/after", "Case studies", "Quote form", "Gallery carousel", "Trust badges", "Map"]),
    "demo-retail": ("Atwood Print & Merch", "Retail store", _retail, ["ecommerce"],
                    ["Store (demo mode)", "Cart", "Buy buttons", "Gallery", "Hours", "Map"]),
    "demo-law": ("Hartwell & Okafor Law", "Law firm", _law, ["lawfirm"],
                 ["Team directory", "FAQ", "Contact form", "Multi-location map", "Trust badges"]),
}


BUSINESS = list(DEMOS)
from .demo_faith import FAITH, FAITH_TEMPLATE  # noqa: E402  (demo_faith uses the helpers above)
DEMOS.update(FAITH)


def catalog() -> list[dict]:
    from . import config
    return [{"subdomain": sub, "name": n, "type": t, "modules": mods, "url": config.site_url(sub), "group": "faith" if sub in FAITH else "business"}
            for sub, (n, t, _f, _c, mods) in DEMOS.items()]


# ---------------------------------------------------------------------------------------------- build one site

def build(subdomain: str, name: str | None = None, kind: str | None = None) -> int:
    """Create one demo site from nothing and deploy it. Returns the site id."""
    base = SANDBOX_OF if subdomain == SANDBOX else subdomain
    title, label, fn, cats, mods = DEMOS[base]
    name = name or title
    site = sites.create_site(name, DEMOS_TEMPLATE[base], subdomain, {"company": {"name": name}})
    sid = site["id"]
    try:
        return _fill(sid, subdomain, base, name, label, fn, cats)
    except Exception:
        sites.delete_site(sid)                          # never leave half a demo behind
        raise


def _fill(sid, subdomain, base, name, label, fn, cats) -> int:
    pics = Pics(sid, cats)
    spec = fn(pics, name)
    st = starter(spec["category"])
    keep = spec.get("keep_ph", ())
    profile = adapt(st["profile"], spec["fills"], keep=keep)
    if spec.get("staff"):
        profile["staff"] = spec["staff"]
    profile["company"].update({k: v for k, v in spec["company"].items() if v})
    profile["company"].update({"name": name, "city": "Madison", "state": "WI", "logo": None})
    profile["company"]["address"] = spec["fills"].get("[Street Address]", "") + ", Madison, WI"
    profile["site"] = {**profile.get("site", {}), "template": spec["template"], "subdomain": subdomain}
    profile.setdefault("seo", {})["description"] = profile["company"]["description"][:300]
    sites.save_profile(sid, profile)
    db.run("UPDATE sites SET template_id = ?, theme_json = ? WHERE id = ?", spec["template"], db.dumps(spec["theme"]), sid)
    # pages: the starter's (adapted) + this demo's own
    pages = []
    for pg in st["pages"]:
        if pg["slug"] not in spec["keep"]:
            continue
        bl = []
        for b in adapt(pg["blocks"], {**spec["fills"], **spec.get("page_fills", {}).get(pg["slug"], {})}, keep=keep):
            if b["type"] in spec.get("drop_blocks", {}).get(pg["slug"], ()) or (b["data"].get("heading") or "") in spec.get("drop_headings", ()):
                continue
            data = dict(b["data"])
            if b["type"] == "hero" and spec.get("hero"):
                data["image"] = spec["hero"]
            if b["type"] == "testimonials":
                data.setdefault("heading", "What customers say")
                data["heading"] = data["heading"] + " (sample reviews)"
            if b["type"] == "text" and spec.get("about_img") and pg["slug"] == "about" and not bl:
                data["image"] = spec["about_img"]
            if b["type"] == "gallery" and spec.get("album"):
                data["album"] = spec["album"]
            bl.append(B(b["type"], **data))
        pages.append([pg["slug"], pg["title"], bl, pg])
    for slug, (title_, page_blocks, extra) in spec["pages"].items():
        found = next((x for x in pages if x[0] == slug), None)
        if extra == "replace" and found:
            found[1], found[2] = title_, [b for b in found[2] if b["type"] == "contact"] + page_blocks
        elif found and extra:
            found[2] = found[2][:-1] + extra + found[2][-1:] if found[2] and found[2][-1]["type"] == "cta" else found[2] + extra
        elif found:
            found[1], found[2] = title_, page_blocks
        else:
            pages.insert(len(pages) - 1 if pages and pages[-1][0] == "contact" else len(pages), [slug, title_, page_blocks or [], {}])
    if spec.get("order"):
        pages.sort(key=lambda x: spec["order"].index(x[0]) if x[0] in spec["order"] else len(spec["order"]))
    for b in [b for p_ in pages for b in p_[2]]:
        if b["type"] == "gallery" and not b["data"].get("album") and spec.get("album"):
            b["data"]["album"] = spec["album"]
        w = widgets.get(b["type"])
        if w:
            w.config(**b["data"])                       # a mistake here fails the seed (and the tests), not the page
    now = db.now()
    db.run("DELETE FROM pages WHERE site_id = ?", sid)
    for pos, (slug, title_, page_blocks, pg) in enumerate(pages):
        db.run("INSERT INTO pages (site_id, slug, title, position, in_menu, seo_title, seo_description, blocks_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
               sid, slug, title_, pos, 1, (pg or {}).get("seo_title", "") or "", adapt((pg or {}).get("seo_description", "") or "", spec["fills"]) if pg else "",
               db.dumps(page_blocks), now)
    # two blog posts from the starter, so News/blog widgets have something
    for i, post in enumerate(st.get("blog_posts", [])[:2]):
        post = adapt(post, spec["fills"], keep=keep)
        body = "".join(b["data"].get("body", "") for b in post["blocks"] if b["type"] == "text")
        when = (datetime.utcnow() - timedelta(days=4 + i * 9)).strftime("%Y-%m-%dT%H:%M:%SZ")
        db.run("INSERT INTO posts (site_id, title, slug, excerpt, body, status, published_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'published', ?, ?, ?)",
               sid, post["title"], post["slug"].removeprefix("blog-")[:80], post.get("seo_description", "")[:300], body, when, when, when)
    db.run("INSERT OR REPLACE INTO site_settings (site_id, key, value_json, updated_at) VALUES (?, ?, ?, ?)", sid, SETTING,
           db.dumps({"kind": label, "of": base, "sandbox": subdomain == SANDBOX}), now)
    sitetime.save(sid, "America/Chicago")          # (a Store block runs in demo mode by default: sample products, checkout off)
    sites.deploy(sid, "Demo site (seeded)")
    db.run("UPDATE sites SET status = 'live' WHERE id = ? AND status = 'draft'", sid)
    return sid


SANDBOX_OF = "demo-cafe"
DEMOS_TEMPLATE = {"demo-cafe": "restaurant", "demo-salon": "portfolio", "demo-contractor": "roofing", "demo-retail": "ecommerce",
                  "demo-law": "lawfirm", **FAITH_TEMPLATE}


def seed_all(only: list[str] | None = None) -> list[str]:
    """Create any demo site (and the sandbox) that's missing. Safe to call on every start-up."""
    made = []
    with _lock:
        templates.seed()
        if not only:                                    # demos we no longer offer (e.g. demo-nonprofit) go away
            for row in db.all("SELECT s.id, s.subdomain FROM sites s JOIN site_settings ss ON ss.site_id = s.id AND ss.key = ?", SETTING):
                if row["subdomain"] not in DEMOS and row["subdomain"] != SANDBOX:
                    sites.delete_site(row["id"])
                    db.log("Removed old demo site", row["subdomain"])
        for sub in (only or list(DEMOS) + [SANDBOX]):
            if db.one("SELECT 1 FROM sites WHERE subdomain = ?", sub):
                continue
            if sub == SANDBOX:
                build(SANDBOX, "Driftless Bean (sandbox)")
            else:
                build(sub)
            made.append(sub)
    return made


def reset(subdomain: str) -> int:
    """Delete one demo site (everything in it: leads, RSVPs, bookings, uploads) and build it again."""
    with _lock:
        row = db.one("SELECT id FROM sites WHERE subdomain = ?", subdomain)
        if row:
            if not demo_info(row["id"]):
                raise ValueError("That isn't a demo site.")
            sites.delete_site(row["id"])
    if subdomain == SANDBOX:
        with _lock:
            return build(SANDBOX, "Driftless Bean (sandbox)")
    with _lock:
        return build(subdomain)


def reset_all() -> list[str]:
    done = []
    for sub in list(DEMOS) + [SANDBOX]:
        try:
            reset(sub)
            done.append(sub)
        except Exception as error:  # noqa: BLE001 - one broken demo mustn't stop the others
            db.log("Demo reset failed", f"{sub}: {type(error).__name__}: {error}"[:300])
    db.log("Demo sites reset", ", ".join(done))
    return done
