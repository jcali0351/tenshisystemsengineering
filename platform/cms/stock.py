"""
stock.py: the shared Stock Photo Library (cms.<domain>/stock).

One library for the whole CMS, not per site:
    admins       upload, edit (title, alt text, tags, category, licence, credit), bulk-tag and delete
    everyone     signed in (client owners and editors too) browses it, and copies a photo into one of their sites
                 from any picture field in the builder ("Choose from stock"). The copy becomes a normal Media Center
                 file of that site (resized copies, alt text, tags, and the credit line as its caption), so editing or
                 deleting it later never touches the library.

Where things are kept:
    stock_photos        one row per photo (tables below, created at start-up like the rest of db.py)
    DATA_DIR/stock/     the photos (WebP, at most 2400 px on the long side), outside the web root
    DATA_DIR/stock/thumbs/   480 px previews for the grid

The seed: platform/cms/stock_seed/ holds every licensed photo collected for Tenshi so far (manifest.json lists each
one's licence, creator and source, taken from the collectors' own manifests). seed() imports what's new: it is safe to
run every start-up, and a seed photo an admin deleted is never brought back (stock_seed_log remembers it).
"""

import fcntl
import hashlib
import io
import json
import os
import re
import secrets
import shutil
import sys
import threading
from pathlib import Path

from PIL import Image, ImageOps

from . import config, db, media

SEED_DIR = Path(__file__).resolve().parent / "stock_seed"
MAX_SIDE = 2400                  # longest side of a library photo
THUMB_SIDE = 480                 # grid previews
QUALITY = 82
MAX_MB = int(os.environ.get("TENSHI_STOCK_MAX_MB", "25"))
MAX_PIXELS = 80_000_000          # refuse "decompression bombs" (a tiny file that opens into a gigantic picture)
ACCEPTED = {"image/jpeg", "image/png", "image/webp", "image/gif"}
LICENSES = ["CC0 1.0", "Public domain", "CC BY 2.0", "CC BY 3.0", "CC BY 4.0", "CC BY-SA 2.0", "CC BY-SA 3.0", "CC BY-SA 4.0",
            "AI-generated (no attribution required)", "Owned by Tenshi Systems", "Supplied by the client"]
NO_CREDIT = ("cc0", "public domain", "ai-generated", "owned by", "supplied by")

SCHEMA = """
-- The shared Stock Photo Library (stock.py). key: the first 16 hex of the original file's SHA-256 (finds duplicates).
-- origin: 'seed' (platform/cms/stock_seed) or 'upload'. tags: comma separated, lower case.
CREATE TABLE IF NOT EXISTS stock_photos (
  id INTEGER PRIMARY KEY, key TEXT UNIQUE NOT NULL, stored TEXT NOT NULL, thumb TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '', alt TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT '', tags TEXT NOT NULL DEFAULT '',
  creator TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT '', source_url TEXT NOT NULL DEFAULT '',
  license TEXT NOT NULL DEFAULT '', license_url TEXT NOT NULL DEFAULT '', role TEXT NOT NULL DEFAULT '',
  width INTEGER NOT NULL DEFAULT 0, height INTEGER NOT NULL DEFAULT 0, bytes INTEGER NOT NULL DEFAULT 0,
  origin TEXT NOT NULL DEFAULT 'upload', user_id INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS stock_photos_cat ON stock_photos (category);
-- Seed photos already imported once (so one an admin deletes isn't imported again)
CREATE TABLE IF NOT EXISTS stock_seed_log (key TEXT PRIMARY KEY, created_at TEXT NOT NULL);
-- Which library photo was copied into which site's Media Center (inserting it again reuses the copy)
CREATE TABLE IF NOT EXISTS stock_site_copies (
  stock_id INTEGER NOT NULL, site_id INTEGER NOT NULL, media_id INTEGER NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY (stock_id, site_id)
);
"""

SEED_STATUS = {"running": False, "done": 0, "total": 0, "error": ""}
_seed_lock = threading.Lock()


class StockError(ValueError):
    """A problem worded for the person using the library."""


def folder():
    f = config.DATA_DIR / "stock"
    (f / "thumbs").mkdir(parents=True, exist_ok=True)
    return f


def setup():
    db.connect().executescript(SCHEMA)
    folder()


# ---------------------------------------------------------------------------------------------- reading

def clean_tags(text):
    if isinstance(text, (list, tuple)):
        text = ",".join(text)
    seen = []
    for t in str(text or "").split(","):
        t = re.sub(r"\s+", " ", t).strip().lower()[:40]
        if t and t not in seen:
            seen.append(t)
    return ", ".join(seen[:30])


def needs_credit(license_text):
    low = (license_text or "").lower()
    return bool(low) and not any(word in low for word in NO_CREDIT)


def credit(row):
    """The line to show under the photo where its licence asks for one, e.g. 'Photo: Jane Doe / Wikimedia Commons, CC BY-SA 4.0'."""
    if not needs_credit(row.get("license")):
        return ""
    who = " / ".join(x for x in (row.get("creator"), row.get("source")) if x)
    return f"Photo: {who}, {row['license']}" if who else f"Photo: {row['license']}"


def to_json(row, can_manage=False):
    out = {k: row[k] for k in ("id", "title", "alt", "category", "tags", "creator", "source", "source_url", "license",
                               "license_url", "role", "width", "height", "bytes", "origin", "created_at")}
    out.update(url=f"/stock/f/{row['stored']}", thumb=f"/stock/t/{row['thumb']}", download=f"/stock/f/{row['stored']}?download=1",
               size=media.human_size(row["bytes"]), credit=credit(row), needs_credit=needs_credit(row["license"]),
               license_missing=not row["license"].strip())
    return out


def get(stock_id):
    row = db.one("SELECT * FROM stock_photos WHERE id = ?", stock_id)
    if not row:
        raise StockError("That photo isn't in the library any more.")
    return row


def search(q="", category="", tag="", license="", page=1, per=60):
    where, params = ["1 = 1"], []
    if q:
        for word in q.split()[:6]:
            where.append("(title LIKE ? OR alt LIKE ? OR tags LIKE ? OR category LIKE ? OR creator LIKE ?)")
            params += [f"%{word}%"] * 5
    if category:
        where.append("category = ?")
        params.append(category)
    if license == "free":
        where.append("(LOWER(license) LIKE 'cc0%' OR LOWER(license) LIKE 'public domain%' OR LOWER(license) LIKE 'ai-generated%' "
                     "OR LOWER(license) LIKE 'owned by%')")
    elif license == "credit":
        where.append("(LOWER(license) LIKE 'cc by%')")
    elif license == "missing":
        where.append("TRIM(license) = ''")
    # tag chips: the most used tags among the results before the chosen tag is applied
    counts = {}
    for r in db.all(f"SELECT tags FROM stock_photos WHERE {' AND '.join(where)}", *params):
        for t in r["tags"].split(","):
            t = t.strip()
            if t and t != category:
                counts[t] = counts.get(t, 0) + 1
    tags = [{"tag": t, "n": n} for t, n in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[:36]]
    if tag:
        where.append("(',' || REPLACE(tags, ', ', ',') || ',') LIKE ?")
        params.append(f"%,{tag.strip().lower()},%")
    sql_where = " AND ".join(where)
    total = db.one(f"SELECT COUNT(*) AS n FROM stock_photos WHERE {sql_where}", *params)["n"]
    per = max(1, min(int(per or 60), 200))
    page = max(1, int(page or 1))
    rows = db.all(f"SELECT * FROM stock_photos WHERE {sql_where} ORDER BY category, title, id LIMIT ? OFFSET ?",
                  *params, per, (page - 1) * per)
    return {"items": rows, "total": total, "page": page, "per": per, "tags": tags}


def categories():
    return db.all("SELECT category, COUNT(*) AS n FROM stock_photos GROUP BY category ORDER BY category")


# ---------------------------------------------------------------------------------------------- writing

def _slug(text):
    return (re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-") or "photo")[:40]


def _save_pair(img, base):
    """Save the library copy and its preview. Returns (stored, thumb, width, height, bytes)."""
    f = folder()
    img = img.convert("RGBA" if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info) else "RGB")
    if max(img.size) > MAX_SIDE:
        img.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
    stored = f"{base}.webp"
    img.save(f / stored, "WEBP", quality=QUALITY, method=4)
    small = img.copy()
    small.thumbnail((THUMB_SIDE, THUMB_SIDE), Image.LANCZOS)
    small.save(f / "thumbs" / stored, "WEBP", quality=70, method=4)
    return stored, stored, img.width, img.height, (f / stored).stat().st_size


def upload(filename, data, user=None, category="", tags="", license="", creator="", source="", source_url=""):
    """Check, convert (WebP, at most 2400 px) and add one picture. Returns (row, duplicate?)."""
    name = filename or "photo"
    if not data:
        raise StockError(f"{name} is empty.")
    if len(data) > MAX_MB * 1024 * 1024:
        raise StockError(f"{name} is larger than {MAX_MB} MB.")
    try:
        kind, mime, _ = media.identify(data, name)
    except media.MediaError:
        kind, mime = "", ""
    if kind != "image" or mime not in ACCEPTED:
        raise StockError(f"{name}: only photos can go in the library (JPG, PNG, WebP or GIF). The file's contents were checked, not just its name.")
    try:
        img = Image.open(io.BytesIO(data))
        if img.width * img.height > MAX_PIXELS:
            raise StockError(f"{name} is too large ({img.width} × {img.height} pixels). The limit is {MAX_PIXELS // 1_000_000} megapixels.")
        img.load()
    except StockError:
        raise
    except Exception as error:
        raise StockError(f"{name} looks like a picture but couldn't be opened ({error}).")
    key = hashlib.sha256(data).hexdigest()[:16]
    existing = db.one("SELECT * FROM stock_photos WHERE key = ?", key)
    if existing:
        return existing, True
    img = ImageOps.exif_transpose(img)        # also drops the EXIF block (GPS etc.): the WebP is written without it
    base = f"{_slug(Path(name).stem)}-{secrets.token_hex(4)}"
    stored, thumb, w, h, size = _save_pair(img, base)
    title = Path(name).stem.replace("-", " ").replace("_", " ").strip()[:120]
    now = db.now()
    sid = db.run("INSERT INTO stock_photos (key, stored, thumb, title, alt, category, tags, creator, source, source_url, license, "
                 "width, height, bytes, origin, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'upload', ?, ?, ?)",
                 key, stored, thumb, title, _slug(category) if category else "", clean_tags(tags), creator[:200], source[:200],
                 source_url[:500] if source_url.startswith(("http://", "https://")) else "", license[:120], w, h, size,
                 user["id"] if user else None, now, now)
    db.log("Stock photo uploaded", name, user)
    return get(sid), False


EDITABLE = ("title", "alt", "category", "tags", "creator", "source", "source_url", "license", "license_url")


def update(stock_id, changes, user=None):
    get(stock_id)
    values = {}
    for k in EDITABLE:
        if k in changes:
            v = str(changes[k] or "").strip()
            if k == "tags":
                v = clean_tags(v)
            elif k == "category":
                v = _slug(v) if v else ""
            elif k in ("source_url", "license_url"):
                if v and not v.startswith(("http://", "https://")):
                    raise StockError("Links must start with http:// or https://")
                v = v[:500]
            else:
                v = v[:300 if k == "alt" else 200]
            values[k] = v
    if values:
        values["updated_at"] = db.now()
        db.run(f"UPDATE stock_photos SET {', '.join(k + ' = ?' for k in values)} WHERE id = ?", *values.values(), stock_id)
        db.log("Stock photo edited", f"#{stock_id}", user)
    return get(stock_id)


def delete(stock_id, user=None):
    row = db.one("SELECT * FROM stock_photos WHERE id = ?", stock_id)
    if not row:
        return
    f = folder()
    (f / row["stored"]).unlink(missing_ok=True)
    (f / "thumbs" / row["thumb"]).unlink(missing_ok=True)
    with db.transaction() as conn:
        conn.execute("DELETE FROM stock_photos WHERE id = ?", (stock_id,))
        conn.execute("DELETE FROM stock_site_copies WHERE stock_id = ?", (stock_id,))   # site copies stay in their Media Centers
    db.log("Stock photo deleted", row["title"], user)


def bulk(ids, action, value="", user=None):
    rows = [r for r in (db.one("SELECT * FROM stock_photos WHERE id = ?", int(i)) for i in ids if str(i).isdigit()) if r]
    for r in rows:
        if action == "delete":
            delete(r["id"], user)
        elif action == "tag":
            db.run("UPDATE stock_photos SET tags = ?, updated_at = ? WHERE id = ?", clean_tags(r["tags"] + "," + value), db.now(), r["id"])
        elif action == "untag":
            drop = {t for t in clean_tags(value).split(", ") if t}
            keep = [t for t in r["tags"].split(", ") if t and t not in drop]
            db.run("UPDATE stock_photos SET tags = ?, updated_at = ? WHERE id = ?", ", ".join(keep), db.now(), r["id"])
        elif action == "category":
            db.run("UPDATE stock_photos SET category = ?, updated_at = ? WHERE id = ?", _slug(value) if value.strip() else "", db.now(), r["id"])
        elif action == "license":
            db.run("UPDATE stock_photos SET license = ?, updated_at = ? WHERE id = ?", value.strip()[:120], db.now(), r["id"])
        else:
            raise StockError("Unknown action.")
    db.log(f"Stock photos: {action}", f"{len(rows)} photo(s)", user)
    return len(rows)


# ---------------------------------------------------------------------------------------------- into a site

def copy_to_site(stock_id, site_id, user=None):
    """Put a library photo in a site's Media Center (folder 'Stock photos') and return the media row.
    Doing it again for the same site returns the earlier copy while it still exists."""
    row = get(stock_id)
    prior = db.one("SELECT m.* FROM stock_site_copies c JOIN media m ON m.id = c.media_id WHERE c.stock_id = ? AND c.site_id = ?",
                   stock_id, site_id)
    if prior:
        return prior
    path = folder() / row["stored"]
    if not path.is_file():
        raise StockError("That photo's file is missing from the library.")
    fold = db.one("SELECT id FROM media_folders WHERE site_id = ? AND name = 'Stock photos' AND parent_id IS NULL", site_id)
    fold_id = fold["id"] if fold else db.run("INSERT INTO media_folders (site_id, name) VALUES (?, 'Stock photos')", site_id)
    item = media.save_upload(site_id, f"{_slug(row['title'])}.webp", path.read_bytes(), fold_id, user)
    db.run("UPDATE media SET title = ?, alt = ?, caption = ?, category = ?, tags = ? WHERE id = ?",
           row["title"][:200], row["alt"][:300], credit(row)[:500], row["category"], clean_tags(row["tags"] + ", stock"), item["id"])
    db.run("INSERT OR REPLACE INTO stock_site_copies (stock_id, site_id, media_id, created_at) VALUES (?, ?, ?, ?)",
           stock_id, site_id, item["id"], db.now())
    return db.one("SELECT * FROM media WHERE id = ?", item["id"])


# ---------------------------------------------------------------------------------------------- the seed

def seed_manifest(seed_dir=None):
    file = Path(seed_dir or SEED_DIR) / "manifest.json"
    return json.loads(file.read_text(encoding="utf-8"))["images"] if file.is_file() else []


def seed(seed_dir=None):
    """Import the seed photos not imported before. Returns how many were added. Safe to run any number of times."""
    seed_dir = Path(seed_dir or SEED_DIR)
    images = seed_manifest(seed_dir)
    if not images:
        return 0
    with _seed_lock:
        f = folder()
        with open(f / ".seed.lock", "w") as lock:               # one importer at a time, even across processes
            fcntl.flock(lock, fcntl.LOCK_EX)
            done = {r["key"] for r in db.all("SELECT key FROM stock_seed_log")}
            todo = [im for im in images if im["key"] not in done]
            SEED_STATUS.update(running=bool(todo), done=0, total=len(todo), error="")
            added = 0
            for im in todo:
                im = {k: ("" if v is None else v) for k, v in im.items()}
                src = seed_dir / im["file"]
                try:
                    if db.one("SELECT id FROM stock_photos WHERE key = ?", im["key"]):
                        _seed_done(im["key"])                    # already there (e.g. uploaded by hand first)
                        continue
                    if not src.is_file():
                        continue                                 # not logged: imported if the file turns up later
                    stored = Path(im["file"]).name
                    shutil.copyfile(src, f / stored)
                    with Image.open(f / stored) as img:
                        img.load()
                        w, h = img.size
                        small = img.convert("RGBA" if img.mode in ("RGBA", "LA") else "RGB")
                        small.thumbnail((THUMB_SIDE, THUMB_SIDE), Image.LANCZOS)
                        small.save(f / "thumbs" / stored, "WEBP", quality=70, method=4)
                    now = db.now()
                    with db.transaction() as conn:
                        conn.execute("INSERT INTO stock_photos (key, stored, thumb, title, alt, category, tags, creator, source, source_url, "
                                     "license, license_url, role, width, height, bytes, origin, created_at, updated_at) "
                                     "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'seed', ?, ?)",
                                     (im["key"], stored, stored, str(im.get("title", ""))[:200], str(im.get("alt", ""))[:300],
                                      im.get("category", ""), clean_tags(im.get("tags", [])), str(im.get("creator", ""))[:200],
                                      str(im.get("source", ""))[:200], str(im.get("source_url", ""))[:500], str(im.get("license", ""))[:120],
                                      str(im.get("license_url", ""))[:500], im.get("role", ""), w, h, (f / stored).stat().st_size, now, now))
                        conn.execute("INSERT OR IGNORE INTO stock_seed_log (key, created_at) VALUES (?, ?)", (im["key"], now))
                    added += 1
                except Exception as error:                       # one bad file never stops the rest; it's tried again next start
                    SEED_STATUS["error"] = f"{im.get('file')}: {error}"
                finally:
                    SEED_STATUS["done"] += 1
            SEED_STATUS["running"] = False
    if added:
        db.log("Stock library seeded", f"{added} photo(s)")
    return added


def _seed_done(key):
    db.run("INSERT OR IGNORE INTO stock_seed_log (key, created_at) VALUES (?, ?)", key, db.now())


def start_seed_in_background():
    """At start-up: import new seed photos without holding up the CMS. Off with TENSHI_STOCK_SEED=0 (and in the tests)."""
    if os.environ.get("TENSHI_STOCK_SEED", "1") == "0" or "pytest" in sys.modules:
        return None
    images = seed_manifest()
    if not images:
        return None
    done = db.one("SELECT COUNT(*) AS n FROM stock_seed_log")["n"]
    if done >= len(images) and not ({im["key"] for im in images} - {r["key"] for r in db.all("SELECT key FROM stock_seed_log")}):
        return None
    t = threading.Thread(target=seed, name="stock-seed", daemon=True)
    t.start()
    return t
