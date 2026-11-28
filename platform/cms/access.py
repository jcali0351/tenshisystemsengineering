"""
access.py: who may open which site in the CMS. One check for every request, so a new screen can't forget it.

  * CMS admins: every site.
  * People who belong to sites (members.py): only their own sites. Owners and editors: everything on those sites
    except what is admin-only. Authors and contributors (WordPress-style): the site's Overview, Blog posts and Media
    Center only; authors may also Publish (posts go live on Publish).
  * Editors who belong to no site at all keep the old behaviour (every site), so existing setups don't break.
  * The public "Try the CMS" visitor is checked by sandbox.py instead.

site_for(path) works out which site a CMS address is about, including addresses by item (/api/pages/12 …).
"""

from __future__ import annotations

import re

from . import db, members

SITE_PATH = re.compile(r"^/(?:api/)?sites/(\d+)(?:/|$)")
BY_ITEM = [  # address → (table, how to find the site)
    (re.compile(r"^/api/pages/(\d+)"), "SELECT site_id FROM pages WHERE id = ?"),
    (re.compile(r"^/api/media/(\d+)"), "SELECT site_id FROM media WHERE id = ?"),
    (re.compile(r"^/api/folders/(\d+)"), "SELECT site_id FROM media_folders WHERE id = ?"),
    (re.compile(r"^/api/albums/(\d+)"), "SELECT site_id FROM albums WHERE id = ?"),
    (re.compile(r"^/api/album-items/(\d+)"), "SELECT a.site_id FROM album_items i JOIN albums a ON a.id = i.album_id WHERE i.id = ?"),
    (re.compile(r"^/api/portfolio/(\d+)"), "SELECT site_id FROM portfolio_items WHERE id = ?"),
    (re.compile(r"^/api/leads/(\d+)"), "SELECT site_id FROM leads WHERE id = ?"),
    (re.compile(r"^/api/backups/(\d+)"), "SELECT site_id FROM backups WHERE id = ?"),
    (re.compile(r"^/backups/(\d+)"), "SELECT site_id FROM backups WHERE id = ?"),
    (re.compile(r"^/api/entries/(\d+)"), "SELECT site_id FROM entries WHERE id = ?"),
    (re.compile(r"^/api/content-types/(\d+)"), "SELECT site_id FROM content_types WHERE id = ?"),
]
WRITER_OK = [   # what authors and contributors may open on their sites
    re.compile(r"^/sites/\d+/?$"),
    re.compile(r"^/(?:api/)?sites/\d+/posts(?:/|$)"),
    re.compile(r"^/(?:api/)?sites/\d+/media(?:/|$)"),
    re.compile(r"^/api/sites/\d+/stock/\d+$"),
    re.compile(r"^/sites/\d+/preview/post-[a-z0-9-]+$"),
    re.compile(r"^/api/media/\d+(?:/edit)?$"),
    re.compile(r"^/api/sites/\d+/folders$"),
]
AUTHOR_OK = [re.compile(r"^/api/sites/\d+/deploy$")]


def site_for(path: str) -> int | None:
    m = SITE_PATH.match(path)
    if m:
        return int(m.group(1))
    for rx, sql in BY_ITEM:
        m = rx.match(path)
        if m:
            if sql is None:
                return int(m.group(1))
            row = db.one(sql, int(m.group(1)))
            return row["site_id"] if row else None
    return None


def allowed(user: dict, path: str, method: str = "GET") -> bool:
    """May this signed-in user open this CMS address?"""
    if not user or user.get("role") in ("admin", "demo"):
        return True
    sid = site_for(path)
    if sid is None:
        return True
    role = members.role_on(user, sid)
    if role is None:
        # no role on this site: allowed only for editors who belong to no site at all (the old behaviour)
        return not db.one("SELECT 1 AS x FROM site_members WHERE user_id = ?", user["id"]) and user.get("role") == "editor"
    if role in members.WRITERS:
        rules = WRITER_OK + (AUTHOR_OK if role == "author" else [])
        if not any(r.match(path) for r in rules):
            return False
        if method == "DELETE" and re.match(r"^/api/(?:media|folders)/", path):
            return False                                 # writers upload and use pictures; editors delete them
    return True


def first_page_for(user: dict, sid: int) -> str:
    role = members.role_on(user, sid)
    return f"/sites/{sid}/posts" if role in members.WRITERS else f"/sites/{sid}"
