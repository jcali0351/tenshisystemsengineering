"""
wp_import.py: bring a WordPress site in. In WordPress: Tools › Export › All content gives an .xml file (WXR). Upload it on
Import, and this makes:
  * every post → a blog post (title, address, text, excerpt, date, published or draft, categories and tags as tags),
  * every page → a page with one Text block holding its text (built with the block editor or the classic editor),
  * a redirect from each old WordPress address (/2019/05/my-post/, /about-us/) to its new page, so links keep working,
  * optionally (in the background): featured images downloaded into the Media Center as each post's cover picture.
Pictures inside the text keep pointing at the old site until it goes away; the import says how many there are.
WordPress shortcodes ([gallery] …) are removed. Nothing is published until you press Publish.
"""

from __future__ import annotations

import ipaddress
import re
import socket
import threading
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from urllib.parse import urlparse

from . import db, posts, redirects, sanitize

NS = {"wp": "http://wordpress.org/export/1.2/", "content": "http://purl.org/rss/1.0/modules/content/",
      "excerpt": "http://wordpress.org/export/1.2/excerpt/", "dc": "http://purl.org/dc/elements/1.1/"}
MAX_BYTES = 40 * 1024 * 1024
MAX_IMAGES = 300
STATUS_KEY = "wp_import"


class ImportError_(ValueError):
    pass


def _t(el, path):
    found = el.find(path, NS)
    return (found.text or "").strip() if found is not None and found.text else ""


def autop(html: str) -> str:
    """WordPress's classic editor stores paragraphs as blank lines; the block editor as <!-- wp:… --> comments."""
    html = re.sub(r"<!--\s*/?wp:[^>]*-->", "", html or "")
    html = re.sub(r"\[/?[a-z_]+[^\]]*\]", "", html)                     # shortcodes
    if re.search(r"<(p|h[1-6]|ul|ol|blockquote|figure|div)\b", html, re.I):
        return html.strip()
    parts = [p.strip() for p in re.split(r"\n\s*\n", html) if p.strip()]
    return "".join(f"<p>{p.replace(chr(10), '<br>')}</p>" for p in parts)


def _date(text: str) -> str:
    try:
        return datetime.strptime(text, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    except (TypeError, ValueError):
        return ""


def parse(data: bytes) -> dict:
    if len(data) > MAX_BYTES:
        raise ImportError_("That file is over 40 MB. Export one post type at a time from WordPress.")
    head = data[:4096].decode("utf-8", "ignore")
    if "<!ENTITY" in data[:200_000].decode("utf-8", "ignore") or "<!DOCTYPE" in head:
        raise ImportError_("That file has parts a WordPress export doesn't have, so it wasn't read.")
    try:
        root = ET.fromstring(data)
    except ET.ParseError as error:
        raise ImportError_(f"That isn't a WordPress export file (.xml from Tools › Export): {error}") from None
    channel = root.find("channel")
    if channel is None or root.tag != "rss":
        raise ImportError_("That isn't a WordPress export file (.xml from Tools › Export).")
    site_url = _t(channel, "wp:base_blog_url") or _t(channel, "link")
    attachments, items = {}, []
    for it in channel.findall("item"):
        kind = _t(it, "wp:post_type")
        pid = _t(it, "wp:post_id")
        if kind == "attachment":
            attachments[pid] = _t(it, "wp:attachment_url")
            continue
        if kind not in ("post", "page"):
            continue
        meta = {_t(m, "wp:meta_key"): _t(m, "wp:meta_value") for m in it.findall("wp:postmeta", NS)}
        cats = [(c.text or "").strip() for c in it.findall("category") if c.get("domain") in ("category", "post_tag") and (c.text or "").strip()]
        items.append({"kind": kind, "id": pid, "title": _t(it, "title") or "(no title)", "slug": _t(it, "wp:post_name"),
                      "link": _t(it, "link"), "body": _t(it, "content:encoded"), "excerpt": _t(it, "excerpt:encoded"),
                      "status": _t(it, "wp:status"), "date": _date(_t(it, "wp:post_date_gmt")) or _date(_t(it, "wp:post_date")),
                      "author": _t(it, "dc:creator"), "tags": [c for c in cats if c.lower() != "uncategorized"],
                      "thumb": meta.get("_thumbnail_id", ""), "order": _t(it, "wp:menu_order")})
    for i in items:
        i["thumb_url"] = attachments.get(i["thumb"], "")
    return {"site_url": site_url, "title": _t(channel, "title"), "items": items}


def summary(parsed: dict) -> dict:
    items = parsed["items"]
    return {"title": parsed["title"], "site_url": parsed["site_url"],
            "posts": sum(1 for i in items if i["kind"] == "post" and i["status"] != "trash"),
            "pages": sum(1 for i in items if i["kind"] == "page" and i["status"] != "trash"),
            "images": sum(1 for i in items if i["thumb_url"])}


def run(site_id: int, data: bytes, user=None, *, pages_too=True, drafts_too=True, make_redirects=True, download_images=True) -> dict:
    parsed = parse(data)
    made = {"posts": 0, "pages": 0, "redirects": 0, "skipped": 0, "inline_images": 0}
    covers = []
    pos = (db.one("SELECT MAX(position) AS m FROM pages WHERE site_id = ?", site_id)["m"] or 0) + 1
    for it in parsed["items"]:
        if it["status"] == "trash" or (it["status"] != "publish" and not drafts_too):
            made["skipped"] += 1
            continue
        body = sanitize.clean(autop(it["body"]), advanced=True)
        made["inline_images"] += len(re.findall(r"<img\b", body))
        old_path = urlparse(it["link"]).path if it["link"] else ""
        if it["kind"] == "post":
            row = posts.save(site_id, {"title": it["title"][:200], "slug": it["slug"] or it["title"], "body": body,
                                       "excerpt": re.sub(r"<[^>]+>", "", it["excerpt"])[:500], "tags": ", ".join(it["tags"])[:300],
                                       "author": it["author"][:100], "status": "published" if it["status"] == "publish" else "draft",
                                       "published_at": it["date"] if it["status"] == "publish" else ""}, user)
            made["posts"] += 1
            target = posts.PREFIX + row["slug"]
            if it["thumb_url"]:
                covers.append((row["id"], it["thumb_url"]))
        else:
            if not pages_too:
                continue
            from . import blocks
            slug = posts.safe_page_slug(re.sub(r"[^a-z0-9-]+", "-", (it["slug"] or it["title"]).lower()).strip("-")[:60] or "page")
            base, n = slug, 2
            while db.one("SELECT 1 AS x FROM pages WHERE site_id = ? AND slug = ?", site_id, slug):
                slug, n = f"{base}-{n}", n + 1
            block = blocks.new_block("text", heading=it["title"][:160], body=body)
            db.run("INSERT INTO pages (site_id, slug, title, position, in_menu, blocks_json, updated_at, publish_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                   site_id, slug, it["title"][:120], pos, 0, db.dumps([block]), db.now(), "")
            pos += 1
            made["pages"] += 1
            target = slug
        if make_redirects and old_path and old_path not in ("/", ""):
            try:
                redirects.add(site_id, old_path, target, 301, "From the WordPress import")
                made["redirects"] += 1
            except redirects.RedirectError:
                pass
    db.log("Imported from WordPress", f"{made['posts']} posts, {made['pages']} pages", user, site_id)
    set_status(site_id, {"state": "done", **made, "covers": len(covers), "covers_done": 0})
    if download_images and covers:
        set_status(site_id, {"state": "images", **made, "covers": len(covers), "covers_done": 0})
        threading.Thread(target=_download_covers, args=(site_id, covers[:MAX_IMAGES], made, user), daemon=True).start()
    return {**made, "covers": len(covers)}


def set_status(site_id, value: dict) -> None:
    db.run("INSERT INTO site_settings (site_id, key, value_json, updated_at) VALUES (?, ?, ?, ?) "
           "ON CONFLICT (site_id, key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at",
           site_id, STATUS_KEY, db.dumps(value), db.now())


def status(site_id) -> dict:
    row = db.one("SELECT value_json FROM site_settings WHERE site_id = ? AND key = ?", site_id, STATUS_KEY)
    return db.j(row["value_json"]) if row else {}


def public_address(url: str) -> bool:
    """Only http(s) addresses on the public internet (never this server or a private network)."""
    try:
        u = urlparse(url)
        if u.scheme not in ("http", "https") or not u.hostname:
            return False
        for info in socket.getaddrinfo(u.hostname, u.port or (443 if u.scheme == "https" else 80)):
            if not ipaddress.ip_address(info[4][0]).is_global:
                return False
        return True
    except (OSError, ValueError):
        return False


def fetch_image(url: str, limit=8 * 1024 * 1024) -> bytes | None:
    if not public_address(url):
        return None
    req = urllib.request.Request(url, headers={"User-Agent": "TenshiCMS-WordPressImport/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:               # noqa: S310 - checked by public_address
            if not str(r.headers.get("content-type", "")).startswith("image/"):
                return None
            data = r.read(limit + 1)
            return data if 0 < len(data) <= limit else None
    except Exception:  # noqa: BLE001 - a picture that can't be fetched is skipped
        return None


def _download_covers(site_id, covers, made, user):
    from . import media
    folder = db.one("SELECT id FROM media_folders WHERE site_id = ? AND name = 'WordPress import' AND parent_id IS NULL", site_id)
    folder_id = folder["id"] if folder else db.run("INSERT INTO media_folders (site_id, name) VALUES (?, 'WordPress import')", site_id)
    done = 0
    for post_id, url in covers:
        data = fetch_image(url)
        if data:
            try:
                item = media.save_upload(site_id, (urlparse(url).path.rsplit("/", 1)[-1] or "picture.jpg")[:120], data, folder_id, user)
                db.run("UPDATE posts SET cover_media_id = ? WHERE id = ? AND site_id = ?", item["id"], post_id, site_id)
                done += 1
            except Exception:  # noqa: BLE001
                pass
        set_status(site_id, {"state": "images", **made, "covers": len(covers), "covers_done": done})
    set_status(site_id, {"state": "done", **made, "covers": len(covers), "covers_done": done})
