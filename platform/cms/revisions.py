"""
revisions.py: earlier versions of a page, so a bad edit in the builder can be undone.

The builder saves 0.6 s after every change, so a snapshot per save would be noise. Instead, before a save the page is
copied as it was if its newest snapshot is over GAP old (or there is none): one checkpoint per editing session.
Restoring first snapshots the current page (always), so a restore can be undone too. KEEP newest per page are kept.
"""
from datetime import datetime, timedelta, timezone

from . import db

GAP = timedelta(minutes=5)
KEEP = 50


def _ago(delta):
    return (datetime.now(timezone.utc) - delta).strftime("%Y-%m-%dT%H:%M:%SZ")


def snapshot(page: dict, user=None, force=False) -> bool:
    """Copy the page as it is now. Unless force, only when the newest copy is older than GAP. True if copied."""
    if not force:
        last = db.one("SELECT created_at, blocks_json, title FROM page_revisions WHERE page_id = ? ORDER BY id DESC LIMIT 1", page["id"])
        if last and last["created_at"] > _ago(GAP):
            return False
        if last and last["blocks_json"] == page.get("blocks_json") and last["title"] == page.get("title"):
            return False
    db.run("INSERT INTO page_revisions (page_id, site_id, title, blocks_json, seo_title, seo_description, user_id, created_at) "
           "VALUES (?, ?, ?, ?, ?, ?, ?, ?)", page["id"], page["site_id"], page.get("title") or "", page.get("blocks_json") or "[]",
           page.get("seo_title") or "", page.get("seo_description") or "", (user or {}).get("id"), db.now())
    db.run("DELETE FROM page_revisions WHERE page_id = ? AND id NOT IN "
           "(SELECT id FROM page_revisions WHERE page_id = ? ORDER BY id DESC LIMIT ?)", page["id"], page["id"], KEEP)
    return True


def for_page(page_id) -> list[dict]:
    rows = db.all("SELECT r.id, r.title, r.blocks_json, r.created_at, u.name AS user_name FROM page_revisions r "
                  "LEFT JOIN users u ON u.id = r.user_id WHERE r.page_id = ? ORDER BY r.id DESC", page_id)
    return [{"id": r["id"], "title": r["title"], "created_at": r["created_at"], "user_name": r["user_name"] or "",
             "blocks": len(db.j(r["blocks_json"], []))} for r in rows]


def restore(page: dict, revision_id: int, user=None) -> dict:
    rev = db.one("SELECT * FROM page_revisions WHERE id = ? AND page_id = ?", revision_id, page["id"])
    if not rev:
        return {}
    snapshot(page, user, force=True)
    db.run("UPDATE pages SET title = ?, blocks_json = ?, seo_title = ?, seo_description = ?, updated_at = ? WHERE id = ?",
           rev["title"] or page["title"], rev["blocks_json"], rev["seo_title"], rev["seo_description"], db.now(), page["id"])
    db.run("UPDATE sites SET updated_at = ? WHERE id = ?", db.now(), page["site_id"])
    db.log("Restored an earlier version", f"{page['title']} ({rev['created_at']})", user, page["site_id"])
    return rev
