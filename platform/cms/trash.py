"""
trash.py: deleting a page, a blog post or a file puts it in the site's Trash for DAYS days, like WordPress, so a wrong
click can be undone. Restore puts it back exactly as it was (a page whose address is taken again gets "-restored").
Entries older than DAYS days are purged: then a file is removed from disk too.

    put(kind, row, user, extra=None)   kind: page | post | media. The caller then deletes the row as before (for media:
                                       media rows only; the file stays until purge).
    items(site_id), restore(id, site_id, user), purge(id, site_id, user), empty(site_id, user), purge_old()
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from . import db

DAYS = 30
KINDS = {"page": "Page", "post": "Blog post", "media": "File", "entry": "Content entry"}


class TrashError(ValueError):
    pass


def put(kind: str, row: dict, user=None, extra: dict | None = None) -> int:
    title = row.get("title") or row.get("filename") or row.get("slug") or kind
    return db.run("INSERT INTO trash (site_id, kind, title, data_json, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                  row["site_id"], kind, str(title)[:200], db.dumps({"row": row, "extra": extra or {}}),
                  (user or {}).get("id"), db.now())


def items(site_id) -> list[dict]:
    purge_old()
    out = []
    for r in db.all("SELECT t.*, u.name AS user_name FROM trash t LEFT JOIN users u ON u.id = t.user_id WHERE t.site_id = ? ORDER BY t.id DESC", site_id):
        when = datetime.strptime(r["created_at"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        left = max(0, DAYS - (datetime.now(timezone.utc) - when).days)
        out.append({"id": r["id"], "kind": r["kind"], "kind_label": KINDS.get(r["kind"], r["kind"]), "title": r["title"],
                    "user_name": r["user_name"] or "", "created_at": r["created_at"], "days_left": left})
    return out


def _columns(table):
    return [c[1] for c in db.connect().execute(f"PRAGMA table_info({table})").fetchall()]


def _insert(table, row):
    cols = [c for c in _columns(table) if c in row]
    taken = db.one(f"SELECT 1 AS x FROM {table} WHERE id = ?", row.get("id")) if row.get("id") else None
    if taken:
        cols = [c for c in cols if c != "id"]
    return db.run(f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({', '.join('?' * len(cols))})", *[row[c] for c in cols])


def restore(trash_id: int, site_id: int, user=None) -> dict:
    t = db.one("SELECT * FROM trash WHERE id = ? AND site_id = ?", trash_id, site_id)
    if not t:
        raise TrashError("That isn't in the Trash any more.")
    data = db.j(t["data_json"])
    row, extra = dict(data.get("row") or {}), data.get("extra") or {}
    if t["kind"] == "page":
        base, n = row["slug"], 1
        while db.one("SELECT 1 AS x FROM pages WHERE site_id = ? AND slug = ?", site_id, row["slug"]):
            row["slug"] = f"{base}-restored" + (f"-{n}" if n > 1 else "")
            n += 1
        new_id = _insert("pages", row)
        if new_id != row.get("id"):
            db.run("UPDATE page_revisions SET page_id = ? WHERE page_id = ?", new_id, row.get("id"))
    elif t["kind"] == "post":
        base, n = row["slug"], 2
        while db.one("SELECT 1 AS x FROM posts WHERE site_id = ? AND slug = ?", site_id, row["slug"]):
            row["slug"], n = f"{base}-{n}", n + 1
        new_id = _insert("posts", row)
    elif t["kind"] == "media":
        new_id = _insert("media", row)
        for item in extra.get("album_items", []):
            if db.one("SELECT 1 AS x FROM albums WHERE id = ?", item.get("album_id")):
                item = dict(item, media_id=new_id)
                _insert("album_items", item)
    elif t["kind"] == "entry":
        if not db.one("SELECT 1 AS x FROM content_types WHERE id = ?", row.get("type_id")):
            raise TrashError("Its content type was deleted, so this entry can't come back.")
        base, n = row["slug"], 2
        while db.one("SELECT 1 AS x FROM entries WHERE type_id = ? AND slug = ?", row["type_id"], row["slug"]):
            row["slug"], n = f"{base}-{n}", n + 1
        new_id = _insert("entries", row)
    else:
        raise TrashError("Unknown kind of item.")
    db.run("DELETE FROM trash WHERE id = ?", trash_id)
    db.run("UPDATE sites SET updated_at = ? WHERE id = ?", db.now(), site_id)
    db.log(f"Restored {KINDS.get(t['kind'], t['kind']).lower()} from the Trash", t["title"], user, site_id)
    return {"kind": t["kind"], "id": new_id, "title": t["title"]}


def _destroy(t: dict) -> None:
    data = db.j(t["data_json"])
    row = data.get("row") or {}
    if t["kind"] == "media":
        from . import media
        folder = media.site_folder(t["site_id"])
        still_used = db.one("SELECT 1 AS x FROM media WHERE site_id = ? AND stored = ?", t["site_id"], row.get("stored", ""))
        if row.get("stored") and not still_used:
            (folder / row["stored"]).unlink(missing_ok=True)
            for name in db.j(row.get("variants_json")).values():
                (folder / name).unlink(missing_ok=True)
    if t["kind"] == "page" and row.get("id") and not db.one("SELECT 1 AS x FROM pages WHERE id = ?", row["id"]):
        db.run("DELETE FROM page_revisions WHERE page_id = ?", row["id"])
    db.run("DELETE FROM trash WHERE id = ?", t["id"])


def purge(trash_id: int, site_id: int, user=None) -> None:
    t = db.one("SELECT * FROM trash WHERE id = ? AND site_id = ?", trash_id, site_id)
    if t:
        _destroy(t)
        db.log("Deleted forever", t["title"], user, site_id)


def empty(site_id: int, user=None) -> int:
    rows = db.all("SELECT * FROM trash WHERE site_id = ?", site_id)
    for t in rows:
        _destroy(t)
    if rows:
        db.log("Emptied the Trash", f"{len(rows)} item(s)", user, site_id)
    return len(rows)


def purge_old() -> int:
    cutoff = (datetime.now(timezone.utc) - timedelta(days=DAYS)).strftime("%Y-%m-%dT%H:%M:%SZ")
    rows = db.all("SELECT * FROM trash WHERE created_at < ?", cutoff)
    for t in rows:
        _destroy(t)
    return len(rows)


def count(site_id) -> int:
    return db.one("SELECT COUNT(*) AS n FROM trash WHERE site_id = ?", site_id)["n"]
