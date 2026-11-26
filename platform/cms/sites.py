"""
sites.py: client websites from start to finish.

    create_site()   a new site: database rows + its starting pages. Takes milliseconds (see docs/ARCHITECTURE.md §7).
    deploy()        draw every page into cms_data/builds/<id>/ and make it the live version at <subdomain>.localhost
    rollback()      make an older deployment live again
    clone_site()    copy a whole site (pages, media, galleries, portfolio) under a new address
    backup()        one ZIP of everything about a site;  restore() puts it back
    health()        a checklist with a score (missing alt text, empty pages, missing contact details …)
    export()        the Export Manager's ZIP: website, media, database, theme, configuration (no lock-in)
"""

import json
import re
import shutil
import sqlite3
import time
import zipfile
from datetime import date
from pathlib import Path

from tenshi import profile as prof

from . import blocks, config, db, media as media_mod, render, templates

RESERVED = {"www", "admin", "api", "app", "cms", "files", "mail", "static", "assets", "tenshi", "localhost", "preview"}
SITE_TABLES = ["pages", "media_folders", "media", "albums", "portfolio_items"]   # rows that belong to a site


class SiteError(ValueError):
    pass


# ---------------------------------------------------------------------------------------------- creating

def slugify(text):
    s = re.sub(r"[^a-z0-9]+", "-", str(text).lower().replace("&", " ").replace("'", "")).strip("-")
    return s[:40].strip("-")


def check_subdomain(sub, ignore_site=None):
    if not re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])", sub or ""):
        raise SiteError("Web addresses use 3-40 lowercase letters, numbers and dashes (no dash at either end).")
    if sub in RESERVED:
        raise SiteError(f"'{sub}' is reserved. Please choose another address.")
    taken = db.one("SELECT id FROM sites WHERE subdomain = ?", sub)
    if taken and taken["id"] != ignore_site:
        raise SiteError(f"{sub}.{config.SITES_DOMAIN} is already taken.")


def free_subdomain(name):
    base = slugify(name) or "site"
    if len(base) < 3:
        base = f"{base}-site"
    sub, n = base, 2
    while db.one("SELECT id FROM sites WHERE subdomain = ?", sub) or sub in RESERVED:
        sub, n = f"{base[:36]}-{n}", n + 1
    return sub


def create_site(name, template_id, subdomain=None, profile=None, user=None):
    """Make a new site with its starting pages. Returns the site row."""
    templates.get(template_id)                                   # stops here if the template doesn't exist
    subdomain = subdomain or free_subdomain(name)
    check_subdomain(subdomain)
    profile = prof.with_defaults(profile or {})
    profile["company"]["name"] = profile["company"].get("name") or name
    profile.setdefault("locations", [])
    profile["site"] = {**profile.get("site", {}), "template": template_id, "subdomain": subdomain,
                       "domain": f"{subdomain}.{config.SITES_DOMAIN}"}
    now = db.now()
    with db.transaction() as conn:
        cur = conn.execute("INSERT INTO sites (name, subdomain, template_id, status, profile_json, theme_json, created_at, updated_at) "
                           "VALUES (?, ?, ?, 'draft', ?, '{}', ?, ?)", (name, subdomain, template_id, db.dumps(profile), now, now))
        site_id = cur.lastrowid
        for position, (slug, title, page_blocks) in enumerate(blocks.default_pages(profile)):
            conn.execute("INSERT INTO pages (site_id, slug, title, position, blocks_json, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
                         (site_id, slug, title, position, db.dumps(page_blocks), now))
        for folder in ("Logos", "Photos", "Projects", "Documents", "Videos"):
            conn.execute("INSERT INTO media_folders (site_id, name) VALUES (?, ?)", (site_id, folder))
    db.log("Created site", f"{name} ({subdomain})", user, site_id)
    return get(site_id)


def get(site_id):
    site = db.one("SELECT * FROM sites WHERE id = ?", site_id)
    if not site:
        raise SiteError("That site doesn't exist.")
    return site


def save_profile(site_id, profile, user=None):
    """Save the business profile, keeping the old one as a revision (so it can be undone)."""
    site = get(site_id)
    db.run("INSERT INTO profile_revisions (site_id, profile_json, user_id, created_at) VALUES (?, ?, ?, ?)",
           site_id, site["profile_json"], user["id"] if user else None, db.now())
    name = (profile.get("company") or {}).get("name") or site["name"]
    db.run("UPDATE sites SET profile_json = ?, name = ?, updated_at = ? WHERE id = ?", db.dumps(profile), name, db.now(), site_id)
    db.log("Edited business data", name, user, site_id)


def delete_site(site_id, user=None):
    site = get(site_id)
    with db.transaction() as conn:
        for table in SITE_TABLES + ["builds", "backups", "leads", "visits", "profile_revisions", "site_settings", "site_members"]:
            conn.execute(f"DELETE FROM {table} WHERE site_id = ?", (site_id,))
        conn.execute("DELETE FROM album_items WHERE album_id NOT IN (SELECT id FROM albums)")
        conn.execute("DELETE FROM sites WHERE id = ?", (site_id,))
    shutil.rmtree(config.MEDIA_DIR / str(site_id), ignore_errors=True)
    for build in config.BUILDS_DIR.glob(f"{site_id}-*"):
        shutil.rmtree(build, ignore_errors=True)
    db.log("Deleted site", f"{site['name']} ({site['subdomain']})", user)


# ---------------------------------------------------------------------------------------------- deploying

def build_dir(site_id, build_id):
    return config.BUILDS_DIR / f"{site_id}-{build_id}"


def deploy(site_id, note="", user=None):
    """Publish: draw the whole site into a new build folder, then switch the live site to it."""
    site = get(site_id)
    started = time.perf_counter()
    build_id = db.run("INSERT INTO builds (site_id, status, note, user_id, created_at) VALUES (?, 'building', ?, ?, ?)",
                      site_id, note, user["id"] if user else None, db.now())
    out = build_dir(site_id, build_id)
    try:
        pages, size = render.build_to(site, out, "hosted")
    except Exception as error:                                    # a template mistake: keep the old live version
        shutil.rmtree(out, ignore_errors=True)
        db.run("UPDATE builds SET status = 'failed', log = ?, seconds = ? WHERE id = ?",
               f"{type(error).__name__}: {error}", time.perf_counter() - started, build_id)
        db.log("Deployment failed", str(error)[:200], user, site_id)
        raise SiteError(f"The deployment failed and the live site was left as it was. Details: {error}")
    seconds = time.perf_counter() - started
    db.run("UPDATE builds SET status = 'ready', pages = ?, bytes = ?, seconds = ?, log = ? WHERE id = ?",
           pages, size, seconds, f"Built {pages} pages ({media_mod.human_size(size)}) in {seconds:.2f} s", build_id)
    # (updated_at is NOT changed here: it means "content last changed", which Health compares with the live build)
    db.run("UPDATE sites SET current_build_id = ?, status = 'live' WHERE id = ?", build_id, site_id)
    db.log("Deployed", f"{site['subdomain']}: {pages} pages in {seconds:.2f} s", user, site_id)
    _keep_recent_builds(site_id)
    return db.one("SELECT * FROM builds WHERE id = ?", build_id)


def _keep_recent_builds(site_id, keep=10):
    """Keep the 10 newest builds of each site (older ones are removed from disk to save space)."""
    current = get(site_id)["current_build_id"]
    for old in db.all("SELECT id FROM builds WHERE site_id = ? AND status = 'ready' ORDER BY id DESC LIMIT -1 OFFSET ?", site_id, keep):
        if old["id"] != current:
            shutil.rmtree(build_dir(site_id, old["id"]), ignore_errors=True)
            db.run("UPDATE builds SET status = 'removed' WHERE id = ?", old["id"])


def rollback(site_id, build_id, user=None):
    build = db.one("SELECT * FROM builds WHERE id = ? AND site_id = ? AND status = 'ready'", build_id, site_id)
    if not build or not build_dir(site_id, build_id).exists():
        raise SiteError("That deployment can't be restored (it may have been cleaned up).")
    # (updated_at is NOT changed here: it means "content last changed", which Health compares with the live build)
    db.run("UPDATE sites SET current_build_id = ?, status = 'live' WHERE id = ?", build_id, site_id)
    db.log("Rolled back", f"to deployment #{build_id}", user, site_id)


def set_status(site_id, status, user=None):
    if status not in ("live", "paused", "draft"):
        raise SiteError("Unknown status")
    db.run("UPDATE sites SET status = ? WHERE id = ?", status, site_id)
    db.log("Site " + status, get(site_id)["subdomain"], user, site_id)


def live_folder(subdomain):
    """The folder a live site is served from, or None if it isn't live."""
    site = db.one("SELECT * FROM sites WHERE subdomain = ?", subdomain)
    if not site or site["status"] != "live" or not site["current_build_id"]:
        return None, site
    folder = build_dir(site["id"], site["current_build_id"])
    return (folder if folder.exists() else None), site


# ---------------------------------------------------------------------------------------------- cloning

def clone_site(site_id, name, subdomain=None, user=None):
    """Copy a whole site under a new name and address (pages, media, galleries, portfolio, theme)."""
    src = get(site_id)
    subdomain = subdomain or free_subdomain(name)
    check_subdomain(subdomain)
    profile = db.j(src["profile_json"])
    profile.setdefault("company", {})["name"] = name
    profile["site"] = {**profile.get("site", {}), "subdomain": subdomain, "domain": f"{subdomain}.{config.SITES_DOMAIN}"}
    now = db.now()
    new_id = db.run("INSERT INTO sites (name, subdomain, template_id, status, profile_json, theme_json, created_at, updated_at) "
                    "VALUES (?, ?, ?, 'draft', ?, ?, ?, ?)", name, subdomain, src["template_id"], db.dumps(profile), src["theme_json"], now, now)
    media_map = media_mod.copy_site_media(site_id, new_id)
    _copy_content(site_id, new_id, media_map)
    db.log("Cloned site", f"{src['name']} → {name}", user, new_id)
    return get(new_id)


def _remap_media_ids(value, media_map):
    """Inside block settings and profiles, picture ids from the old site become the new site's ids."""
    if isinstance(value, dict):
        return {k: (media_map.get(v, v) if k in MEDIA_KEYS and isinstance(v, int) else
                    media_map.get(int(v), v) if k in MEDIA_KEYS and str(v).isdigit() else _remap_media_ids(v, media_map))
                for k, v in value.items()}
    if isinstance(value, list):
        return [_remap_media_ids(v, media_map) for v in value]
    return value


MEDIA_KEYS = {"image", "before", "after", "video", "logo_media", "image_media", "photo_media"}


def _copy_content(from_id, to_id, media_map):
    album_map = {}
    for a in db.all("SELECT * FROM albums WHERE site_id = ?", from_id):
        album_map[a["id"]] = db.run("INSERT INTO albums (site_id, name, category, layout, description, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                                    to_id, a["name"], a["category"], a["layout"], a["description"], db.now())
        for item in db.all("SELECT * FROM album_items WHERE album_id = ?", a["id"]):
            if item["media_id"] in media_map:
                db.run("INSERT INTO album_items (album_id, media_id, caption, position) VALUES (?, ?, ?, ?)",
                       album_map[a["id"]], media_map[item["media_id"]], item["caption"], item["position"])
    for p in db.all("SELECT * FROM portfolio_items WHERE site_id = ?", from_id):
        db.run("INSERT INTO portfolio_items (site_id, title, category, tags, summary, body, cover_media_id, before_media_id, after_media_id, "
               "album_id, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
               to_id, p["title"], p["category"], p["tags"], p["summary"], p["body"], media_map.get(p["cover_media_id"]),
               media_map.get(p["before_media_id"]), media_map.get(p["after_media_id"]), album_map.get(p["album_id"]), p["position"], db.now())
    for page in db.all("SELECT * FROM pages WHERE site_id = ?", from_id):
        page_blocks = _remap_media_ids(db.j(page["blocks_json"], []), media_map)
        for b in page_blocks:
            if b.get("type") == "gallery" and str(b.get("data", {}).get("album", "")).isdigit():
                b["data"]["album"] = album_map.get(int(b["data"]["album"]), "")
        db.run("INSERT INTO pages (site_id, slug, title, position, in_menu, seo_title, seo_description, blocks_json, updated_at) "
               "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", to_id, page["slug"], page["title"], page["position"], page["in_menu"],
               page["seo_title"], page["seo_description"], db.dumps(page_blocks), db.now())
    site = get(to_id)
    db.run("UPDATE sites SET profile_json = ? WHERE id = ?", db.dumps(_remap_media_ids(db.j(site["profile_json"]), media_map)), to_id)


# ---------------------------------------------------------------------------------------------- backups

def _site_data(site_id):
    """Everything about a site from the database, as plain data."""
    data = {"site": get(site_id)}
    for table in SITE_TABLES:
        data[table] = db.all(f"SELECT * FROM {table} WHERE site_id = ?", site_id)
    data["album_items"] = db.all("SELECT ai.* FROM album_items ai JOIN albums a ON a.id = ai.album_id WHERE a.site_id = ?", site_id)
    data["leads"] = db.all("SELECT * FROM leads WHERE site_id = ?", site_id)
    return data


def backup(site_id, note="", user=None):
    """Save the site's data and media in one ZIP (cms_data/backups/)."""
    site = get(site_id)
    stamp = db.now().replace(":", "").replace("-", "")
    file = config.BACKUPS_DIR / f"{site['subdomain']}-{stamp}.zip"
    with zipfile.ZipFile(file, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("site-data.json", json.dumps(_site_data(site_id), ensure_ascii=False, indent=1))
        folder = config.MEDIA_DIR / str(site_id)
        if folder.exists():
            for f in folder.iterdir():
                z.write(f, f"media/{f.name}")
    backup_id = db.run("INSERT INTO backups (site_id, file, bytes, note, created_at) VALUES (?, ?, ?, ?, ?)",
                       site_id, file.name, file.stat().st_size, note or "Manual backup", db.now())
    db.log("Backed up", site["subdomain"], user, site_id)
    return db.one("SELECT * FROM backups WHERE id = ?", backup_id)


def restore(backup_id, user=None):
    """Put a site back exactly as it was in a backup. A fresh backup is taken first, so this can be undone too."""
    b = db.one("SELECT * FROM backups WHERE id = ?", backup_id)
    if not b:
        raise SiteError("That backup doesn't exist.")
    site_id = b["site_id"]
    backup(site_id, "Automatic backup before a restore", user)
    with zipfile.ZipFile(config.BACKUPS_DIR / b["file"]) as z:
        data = json.loads(z.read("site-data.json"))
        with db.transaction() as conn:
            conn.execute("DELETE FROM album_items WHERE album_id IN (SELECT id FROM albums WHERE site_id = ?)", (site_id,))
            for table in SITE_TABLES:
                conn.execute(f"DELETE FROM {table} WHERE site_id = ?", (site_id,))
            for table in SITE_TABLES + ["album_items"]:
                for row in data.get(table, []):
                    cols = list(row)
                    conn.execute(f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({', '.join('?' * len(cols))})", [row[c] for c in cols])
            s = data["site"]
            conn.execute("UPDATE sites SET name = ?, template_id = ?, profile_json = ?, theme_json = ?, updated_at = ? WHERE id = ?",
                         (s["name"], s["template_id"], s["profile_json"], s["theme_json"], db.now(), site_id))
        folder = config.MEDIA_DIR / str(site_id)
        folder.mkdir(parents=True, exist_ok=True)
        for old in folder.iterdir():                 # empty the folder file by file (safer on Windows than deleting it)
            if old.is_file():
                old.unlink()
        for name in z.namelist():
            if name.startswith("media/") and not name.endswith("/"):
                (folder / Path(name).name).write_bytes(z.read(name))
    db.log("Restored backup", b["file"], user, site_id)


# ---------------------------------------------------------------------------------------------- health

def health(site_id):
    """A checklist for one site. Returns {"score": 0-100, "checks": [(ok, text, where to fix it)]}."""
    site = get(site_id)
    profile = prof.with_defaults(db.j(site["profile_json"]))
    c = profile["company"]
    pages = db.all("SELECT * FROM pages WHERE site_id = ?", site_id)
    images = db.all("SELECT * FROM media WHERE site_id = ? AND kind IN ('image', 'svg')", site_id)
    no_alt = [m for m in images if not (m["alt"] or "").strip()]
    big = [m for m in images if m["bytes"] > 3 * 1024 * 1024]
    empty_pages = [p["title"] for p in pages if not db.j(p["blocks_json"], [])]
    last = db.one("SELECT * FROM builds WHERE id = ?", site["current_build_id"]) if site["current_build_id"] else None
    changed_since = last and site["updated_at"] > last["created_at"]
    checks = [
        (site["status"] == "live" and bool(last), "The site is live" if site["status"] == "live" else "The site isn't live yet", "deployments"),
        (not changed_since, "Live site is up to date" if not changed_since else "There are changes that aren't live yet: deploy to publish them", "deployments"),
        (bool(c.get("description")), "Business description written", "business"),
        (bool(c.get("phone") or c.get("email")), "Phone or email on the site", "business"),
        (bool(profile["services"]), "At least one service listed", "business"),
        (bool(c.get("logo_media")), "Logo added", "business"),
        (not no_alt, "Every picture has a description for blind visitors and Google" if not no_alt else f"{len(no_alt)} picture(s) need a description (alt text)", "media"),
        (not big, "No oversized files" if not big else f"{len(big)} file(s) over 3 MB slow the site down", "media"),
        (not empty_pages, "Every page has content" if not empty_pages else f"Empty page(s): {', '.join(empty_pages)}", "pages"),
        (bool(profile["testimonials"]), "Customer reviews shown", "business"),
        (bool((profile.get("seo") or {}).get("description") or c.get("description")), "Search engine description set", "settings"),
    ]
    score = round(100 * sum(1 for ok, _, _ in checks if ok) / len(checks))
    return {"score": score, "checks": checks}


# ---------------------------------------------------------------------------------------------- export

EXPORT_PARTS = {
    "website": "The finished website (HTML, CSS, JavaScript and the pictures it uses): open index.html or upload it anywhere",
    "media": "Every file in the Media Center, original quality, with a list of titles, alt text and tags",
    "database": "All of the site's content as JSON, plus a SQLite database file you can open with any SQLite tool",
    "theme": "The template's source files (Jinja2), so the site can be changed and rebuilt",
    "config": "The business profile and the site's settings (colours, fonts, pages)",
}


def export(site_id, parts, user=None):
    """Make the export ZIP. parts: any of EXPORT_PARTS. Returns the file's path."""
    site = get(site_id)
    parts = [p for p in parts if p in EXPORT_PARTS] or list(EXPORT_PARTS)
    stamp = date.today().isoformat()
    file = config.EXPORTS_DIR / f"{site['subdomain']}-export-{stamp}-{int(time.time()) % 100000}.zip"
    with zipfile.ZipFile(file, "w", zipfile.ZIP_DEFLATED) as z:
        tmp = config.EXPORTS_DIR / f"_tmp-{site_id}-{int(time.time() * 1000)}"
        try:
            if "website" in parts:
                render.build_to(site, tmp / "website", "export")
                for f in (tmp / "website").rglob("*"):
                    if f.is_file():
                        z.write(f, "website/" + str(f.relative_to(tmp / "website")).replace("\\", "/"))
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
        if "media" in parts:
            rows = db.all("SELECT * FROM media WHERE site_id = ?", site_id)
            folder = media_mod.site_folder(site_id)
            for m in rows:
                if (folder / m["stored"]).exists():
                    z.write(folder / m["stored"], f"media/{m['stored']}")
            z.writestr("media/media-list.json", json.dumps([{k: m[k] for k in ("stored", "filename", "kind", "title", "alt", "caption",
                                                                             "category", "tags", "width", "height")} for m in rows], ensure_ascii=False, indent=1))
        if "database" in parts:
            data = _site_data(site_id)
            z.writestr("database/site-data.json", json.dumps(data, ensure_ascii=False, indent=1))
            z.writestr("database/site.sqlite", _sqlite_copy(data))
        if "theme" in parts:
            tpl = templates.current_dir(site["template_id"])
            for f in tpl.rglob("*"):
                if f.is_file():
                    z.write(f, "theme/" + str(f.relative_to(tpl)).replace("\\", "/"))
            z.writestr("theme/template.json", json.dumps(templates.get(site["template_id"]), ensure_ascii=False, indent=1))
        if "config" in parts:
            z.writestr("config/business-profile.json", json.dumps(db.j(site["profile_json"]), ensure_ascii=False, indent=2))
            z.writestr("config/site-settings.json", json.dumps({
                "name": site["name"], "subdomain": site["subdomain"], "template": site["template_id"], "theme": db.j(site["theme_json"]),
                "pages": [{k: p[k] for k in ("slug", "title", "position", "in_menu", "seo_title", "seo_description")}
                          for p in db.all("SELECT * FROM pages WHERE site_id = ? ORDER BY position", site_id)]}, ensure_ascii=False, indent=2))
        z.writestr("README.txt", EXPORT_README.format(name=site["name"], date=stamp,
                   parts="\n".join(f"  {p + '/':10} {EXPORT_PARTS[p]}" for p in parts)))
    db.log("Exported", f"{site['subdomain']}: {', '.join(parts)}", user, site_id)
    return file


def _sqlite_copy(data):
    """A small SQLite database holding just this site's rows (same tables as the CMS)."""
    path = config.EXPORTS_DIR / f"_tmp-{int(time.time() * 1000)}.sqlite"
    conn = sqlite3.connect(path)
    conn.executescript(db.SCHEMA)
    for table, rows in [("sites", [data["site"]])] + [(t, data.get(t, [])) for t in SITE_TABLES + ["album_items", "leads"]]:
        for row in rows:
            cols = list(row)
            conn.execute(f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({', '.join('?' * len(cols))})", [row[c] for c in cols])
    conn.commit()
    conn.close()
    blob = path.read_bytes()
    path.unlink()
    return blob


EXPORT_README = """{name}: website export ({date})

Everything in this package belongs to you, and it works without Tenshi Systems.

{parts}

To put the website online anywhere: upload the contents of website/ to any web host
(GitHub Pages, Netlify, Cloudflare Pages, or your own server). Forms in the exported site
send email, because there is no Tenshi server behind them.

The business profile (config/business-profile.json) uses the open Tenshi format, so the
site can be imported into any Tenshi installation, or rebuilt with the open-source tools.
"""


# ---------------------------------------------------------------------------------------------- visits and leads

def count_visit(site_id, page):
    page = re.sub(r"[^a-z0-9-]", "", str(page).lower())[:60] or "index"
    db.run("INSERT INTO visits (site_id, page, day, count) VALUES (?, ?, ?, 1) "
           "ON CONFLICT (site_id, page, day) DO UPDATE SET count = count + 1", site_id, page, date.today().isoformat())


def save_lead(site_id, fields):
    data = {k: str(v)[:4000] for k, v in fields.items() if not k.startswith("_")}
    if not any(data.values()):
        raise SiteError("Empty message")
    page = str(fields.get("_page", ""))[:60]
    db.run("INSERT INTO leads (site_id, page, data_json, created_at) VALUES (?, ?, ?, ?)", site_id, page, db.dumps(data), db.now())
    db.log("New lead", data.get("name") or data.get("email") or "", None, site_id)


def import_launch_profile(launch_profile):
    """A profile sent by the public website's Launch page (launch.js) becomes a real site, deployed at once."""
    company = launch_profile.get("company") or {}
    site_info = launch_profile.get("site") or {}
    name = str(company.get("name") or "").strip()
    if len(name) < 2:
        raise SiteError("The business needs a name.")
    template_id = site_info.get("template") or "corporate"
    try:
        templates.get(template_id)
    except templates.TemplateError:
        template_id = templates.all_templates()[0]["id"]
    sub = site_info.get("subdomain") or ""
    try:
        check_subdomain(sub)
    except SiteError:
        sub = free_subdomain(name)
    logo = company.pop("logo", None)
    profile = {k: v for k, v in launch_profile.items() if k in prof.EMPTY_PROFILE}
    profile["company"] = company
    site = create_site(name, template_id, sub, profile)
    if logo and logo.get("data_url", "").startswith("data:image/"):
        import base64
        try:
            raw = base64.b64decode(logo["data_url"].split(",", 1)[1])
            item = media_mod.save_upload(site["id"], logo.get("filename") or "logo.png", raw,
                                         db.one("SELECT id FROM media_folders WHERE site_id = ? AND name = 'Logos'", site["id"])["id"])
            p = db.j(get(site["id"])["profile_json"])
            p["company"]["logo_media"] = item["id"]
            db.run("UPDATE sites SET profile_json = ? WHERE id = ?", db.dumps(p), site["id"])
        except Exception:
            pass                                                    # a bad logo never stops a launch
    deploy(site["id"], "First launch from the public Launch page")
    return get(site["id"])
