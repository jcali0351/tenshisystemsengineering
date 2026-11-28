"""
content_types.py: a site's own kinds of content, like Drupal's content types or WordPress's custom post types with
custom fields. Examples: Tractors for sale (make, year, hours, price, photo), Listings, Menu items, Volunteers.

  * A type has a name ("Tractors"), a singular ("Tractor"), an address (slug: tractors) and fields.
    Field types: text, textarea, rich (formatted text), number, price, date, media (a picture), link, email, select
    (one of a list), checkbox. Every type also has a title.
  * Entries are filled in on Content types › <type> (a form drawn from the fields). Draft entries stay off the site.
  * The Collection block (widgets/collection.py) shows a type's entries on any page: cards, a list or a table,
    with filters and search. With "Each entry gets its own page" on, every entry also gets <type>-<entry>.html.
"""

from __future__ import annotations

import re

from . import db, sanitize

FIELD_TYPES = {"text": "Short text", "textarea": "Long text", "rich": "Formatted text", "number": "Number", "price": "Price",
               "date": "Date", "media": "Picture", "link": "Link", "email": "Email", "select": "One of a list", "checkbox": "Yes / no"}
MAX_FIELDS = 30
MAX_ENTRIES = 2000


class ContentError(ValueError):
    pass


def slugify(text, fallback="item") -> str:
    s = re.sub(r"[^a-z0-9]+", "-", str(text or "").lower().replace("&", " and ").replace("'", "")).strip("-")
    return s[:60].strip("-") or fallback


def clean_fields(fields) -> list[dict]:
    out, names = [], set()
    for f in (fields or [])[:MAX_FIELDS]:
        if not isinstance(f, dict):
            continue
        label = str(f.get("label") or "").strip()[:80]
        if not label:
            continue
        ftype = f.get("type") if f.get("type") in FIELD_TYPES else "text"
        name = re.sub(r"[^a-z0-9_]", "_", str(f.get("name") or slugify(label).replace("-", "_")).lower())[:40].strip("_") or "field"
        if name in ("title", "slug", "id", "status") or name in names:
            n = 2
            while f"{name}_{n}" in names:
                n += 1
            name = f"{name}_{n}"
        names.add(name)
        spec = {"name": name, "label": label, "type": ftype, "required": bool(f.get("required")),
                "show": bool(f.get("show", True)), "filter": bool(f.get("filter")) and ftype in ("select", "checkbox", "text")}
        if ftype == "select":
            opts = f.get("options")
            opts = opts if isinstance(opts, list) else str(opts or "").split(",")
            spec["options"] = [str(o).strip()[:60] for o in opts if str(o).strip()][:50]
            if not spec["options"]:
                raise ContentError(f"“{label}”: list the choices, separated by commas.")
        out.append(spec)
    return out


def types(site_id) -> list[dict]:
    rows = db.all("SELECT t.*, (SELECT COUNT(*) FROM entries e WHERE e.type_id = t.id) AS n FROM content_types t WHERE t.site_id = ? ORDER BY t.name", site_id)
    for r in rows:
        r["fields"] = db.j(r["fields_json"], [])
    return rows


def get_type(type_id, site_id=None) -> dict:
    row = db.one("SELECT * FROM content_types WHERE id = ?" + (" AND site_id = ?" if site_id else ""), *([type_id, site_id] if site_id else [type_id]))
    if not row:
        raise ContentError("That content type isn't there any more.")
    row["fields"] = db.j(row["fields_json"], [])
    return row


def save_type(site_id, data: dict, user=None, type_id=None) -> dict:
    name = str(data.get("name") or "").strip()[:60]
    if not name:
        raise ContentError("Give the content type a name, like “Tractors for sale”.")
    singular = str(data.get("singular") or "").strip()[:60] or re.sub(r"s$", "", name)
    slug = slugify(data.get("slug") or name, "items")
    fields = clean_fields(data.get("fields"))
    detail = 1 if data.get("detail_pages", True) else 0
    clash = db.one("SELECT id FROM content_types WHERE site_id = ? AND slug = ? AND id != ?", site_id, slug, type_id or 0)
    if clash:
        raise ContentError("Another content type already uses that address.")
    if type_id:
        get_type(type_id, site_id)
        db.run("UPDATE content_types SET name = ?, singular = ?, slug = ?, fields_json = ?, detail_pages = ? WHERE id = ?",
               name, singular, slug, db.dumps(fields), detail, type_id)
        db.log("Changed content type", name, user, site_id)
    else:
        if db.one("SELECT COUNT(*) AS n FROM content_types WHERE site_id = ?", site_id)["n"] >= 30:
            raise ContentError("A site can have up to 30 content types.")
        type_id = db.run("INSERT INTO content_types (site_id, slug, name, singular, fields_json, detail_pages, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                         site_id, slug, name, singular, db.dumps(fields), detail, db.now())
        db.log("Made content type", name, user, site_id)
    return get_type(type_id)


def delete_type(type_id, site_id, user=None) -> None:
    t = get_type(type_id, site_id)
    n = db.one("SELECT COUNT(*) AS n FROM entries WHERE type_id = ?", type_id)["n"]
    db.run("DELETE FROM entries WHERE type_id = ?", type_id)
    db.run("DELETE FROM content_types WHERE id = ?", type_id)
    db.log("Deleted content type", f"{t['name']} ({n} entries)", user, site_id)


def clean_value(f: dict, v):
    t = f["type"]
    if v is None:
        v = ""
    if t == "checkbox":
        return bool(v) and v not in ("0", "false", "no")
    v = str(v).strip()
    if t == "rich":
        return sanitize.clean(v[:50_000], advanced=False)
    if t in ("text", "price"):
        return v[:300]
    if t == "textarea":
        return v[:8000]
    if t == "number":
        if v and not re.fullmatch(r"-?\d+(\.\d+)?", v.replace(",", "")):
            raise ContentError(f"“{f['label']}” should be a number.")
        return v.replace(",", "")[:30]
    if t == "date":
        if v and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", v):
            raise ContentError(f"“{f['label']}”: use a date like 2026-11-28.")
        return v
    if t == "media":
        return int(v) if v.isdigit() else ""
    if t == "link":
        if v and not re.fullmatch(r"(https?://[^\s\"'<>]{1,500}|[a-z0-9][a-z0-9-]{0,80}|mailto:[^\s\"'<>]{1,200}|tel:[0-9+() .-]{3,30})", v):
            raise ContentError(f"“{f['label']}”: a page of the site or an address starting with https://.")
        return v
    if t == "email":
        if v and not re.fullmatch(r"[^@\s]{1,100}@[^@\s]{1,150}\.[^@\s]{2,20}", v):
            raise ContentError(f"“{f['label']}” doesn't look like an email address.")
        return v
    if t == "select":
        if v and v not in f.get("options", []):
            raise ContentError(f"“{f['label']}”: choose one of the list.")
        return v
    return v[:300]


def entries(type_id, published_only=False) -> list[dict]:
    rows = db.all("SELECT * FROM entries WHERE type_id = ?" + (" AND status = 'published'" if published_only else "") + " ORDER BY position, id", type_id)
    for r in rows:
        r["data"] = db.j(r["data_json"])
    return rows


def get_entry(entry_id, site_id=None) -> dict:
    row = db.one("SELECT * FROM entries WHERE id = ?" + (" AND site_id = ?" if site_id else ""), *([entry_id, site_id] if site_id else [entry_id]))
    if not row:
        raise ContentError("That entry isn't there any more.")
    row["data"] = db.j(row["data_json"])
    return row


def save_entry(type_id, site_id, data: dict, user=None, entry_id=None) -> dict:
    t = get_type(type_id, site_id)
    title = str(data.get("title") or "").strip()[:200]
    if not title:
        raise ContentError(f"Give the {t['singular'].lower()} a title.")
    values = {}
    src = data.get("data") or {}
    for f in t["fields"]:
        v = clean_value(f, src.get(f["name"]))
        if f.get("required") and v in ("", None, False):
            raise ContentError(f"“{f['label']}” is needed.")
        values[f["name"]] = v
    status = "draft" if data.get("status") == "draft" else "published"
    slug, n = slugify(data.get("slug") or title), 2
    base = slug
    while db.one("SELECT id FROM entries WHERE type_id = ? AND slug = ? AND id != ?", type_id, slug, entry_id or 0):
        slug, n = f"{base}-{n}", n + 1
    if entry_id:
        get_entry(entry_id, site_id)
        db.run("UPDATE entries SET title = ?, slug = ?, data_json = ?, status = ?, updated_at = ? WHERE id = ?",
               title, slug, db.dumps(values), status, db.now(), entry_id)
    else:
        if db.one("SELECT COUNT(*) AS n FROM entries WHERE type_id = ?", type_id)["n"] >= MAX_ENTRIES:
            raise ContentError(f"A content type can have up to {MAX_ENTRIES} entries.")
        pos = (db.one("SELECT MAX(position) AS m FROM entries WHERE type_id = ?", type_id)["m"] or 0) + 1
        entry_id = db.run("INSERT INTO entries (site_id, type_id, slug, title, data_json, status, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                          site_id, type_id, slug, title, db.dumps(values), status, pos, db.now(), db.now())
    db.run("UPDATE sites SET updated_at = ? WHERE id = ?", db.now(), site_id)
    db.log("Saved " + t["singular"].lower(), title, user, site_id)
    return get_entry(entry_id)


def delete_entry(entry_id, site_id, user=None) -> None:
    from . import trash
    e = get_entry(entry_id, site_id)
    e.pop("data", None)
    trash.put("entry", e, user)
    db.run("DELETE FROM entries WHERE id = ?", entry_id)
    db.log("Deleted entry", e["title"] + " (in the Trash)", user, site_id)


def reorder(type_id, site_id, ids) -> None:
    get_type(type_id, site_id)
    for pos, eid in enumerate(i for i in ids if str(i).isdigit()):
        db.run("UPDATE entries SET position = ? WHERE id = ? AND type_id = ?", pos, int(eid), type_id)


def page_slug(t: dict, e: dict) -> str:
    return f"{t['slug']}-{e['slug']}"


STARTERS = {
    "tractors": {"name": "Tractors for sale", "singular": "Tractor", "fields": [
        {"label": "Photo", "type": "media"}, {"label": "Make", "type": "select", "options": "John Deere, Case IH, New Holland, Kubota, Massey Ferguson, Fendt, Other", "filter": True},
        {"label": "Year", "type": "number"}, {"label": "Hours", "type": "number"}, {"label": "Price", "type": "price"},
        {"label": "Description", "type": "rich", "show": False}]},
    "listings": {"name": "Listings", "singular": "Listing", "fields": [
        {"label": "Photo", "type": "media"}, {"label": "Category", "type": "select", "options": "For sale, For rent, Wanted", "filter": True},
        {"label": "Price", "type": "price"}, {"label": "Location", "type": "text"}, {"label": "Details", "type": "rich", "show": False},
        {"label": "Contact email", "type": "email", "show": False}]},
    "menu": {"name": "Menu items", "singular": "Menu item", "fields": [
        {"label": "Photo", "type": "media"}, {"label": "Course", "type": "select", "options": "Starters, Mains, Desserts, Drinks", "filter": True},
        {"label": "Price", "type": "price"}, {"label": "Description", "type": "textarea"}, {"label": "Vegetarian", "type": "checkbox"}]},
    "people": {"name": "People", "singular": "Person", "fields": [
        {"label": "Photo", "type": "media"}, {"label": "Role", "type": "text"}, {"label": "Bio", "type": "rich", "show": False},
        {"label": "Email", "type": "email", "show": False}]},
}
