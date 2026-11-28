"""
redirects.py: send an old address to a new one on a live site (like the Redirection plugin for WordPress), and keep a
list of addresses visitors asked for that weren't there, so they can be redirected with one click.

    from_path   /old-page, /old-page.html, /blog/2019/my-post, or /blog/* (a trailing * matches everything after it;
                the rest is added to the target when the target also ends in *)
    to_url      one of the site's pages (about), a path (/about.html), or an http(s) address
    code        301 (moved for good: search engines move the ranking) or 302 (for now)

serve(site_id, path) is called by app.serve_site before it looks for the file. When a page's address changes in the
builder, page_moved() adds a redirect from the old address automatically.
"""

from __future__ import annotations

import re
from urllib.parse import unquote

from . import db

MAX_RULES = 500
MAX_NOT_FOUND = 300
FROM_RE = re.compile(r"^/[^\s\"'<>\\]{0,400}$")
TO_RE = re.compile(r"^(?:https?://[^\s\"'<>]{1,800}|/[^\s\"'<>\\]{0,400}|[a-z0-9][a-z0-9-]{0,80})$")
NOISE = re.compile(r"\.(?:php|asp|aspx|env|git|sql|bak|ini|cgi)\b|/wp-(?:admin|login|includes|content/plugins)|/\.well-known/|xmlrpc", re.I)


class RedirectError(ValueError):
    pass


def norm(path: str) -> str:
    """'/About.html/' → '/about'. Lower case, no trailing slash or .html, no query."""
    p = unquote(str(path or "").split("?")[0].split("#")[0]).strip()
    if not p.startswith("/"):
        p = "/" + p
    p = re.sub(r"/{2,}", "/", p).lower()
    if p.endswith("/index.html"):
        p = p[:-len("index.html")]
    if p.endswith(".html"):
        p = p[:-5]
    if len(p) > 1:
        p = p.rstrip("/")
    return p or "/"


def clean(from_path: str, to_url: str, code) -> tuple[str, str, int]:
    f = str(from_path or "").strip()
    t = str(to_url or "").strip()
    if f.startswith("http://") or f.startswith("https://"):
        f = "/" + f.split("/", 3)[3] if f.count("/") >= 3 else "/"
    if not f.startswith("/"):
        f = "/" + f
    star = f.endswith("*")
    f = norm(f[:-1] if star else f) + ("*" if star else "")
    if star and not f.endswith("/*") and f != "/*":
        f = f[:-1].rstrip("/") + "*"
    if not FROM_RE.match(f) or f in ("/", "/*"):
        raise RedirectError("“From” is an old address on this site, like /old-page or /blog/* (not the home page).")
    if not TO_RE.match(t):
        raise RedirectError("“To” is one of your pages (like about), a path like /about.html, or an address starting with https://.")
    try:
        code = int(code or 301)
    except (TypeError, ValueError):
        code = 301
    if code not in (301, 302):
        raise RedirectError("The type is 301 (moved for good) or 302 (for now).")
    if not t.startswith("http") and norm(t if t.startswith("/") else "/" + t) == f:
        raise RedirectError("That would send the address to itself.")
    return f, t, code


def all_for(site_id) -> list[dict]:
    return db.all("SELECT * FROM redirects WHERE site_id = ? ORDER BY from_path", site_id)


def add(site_id, from_path, to_url, code=301, note="", user=None) -> dict:
    f, t, c = clean(from_path, to_url, code)
    if db.one("SELECT COUNT(*) AS n FROM redirects WHERE site_id = ?", site_id)["n"] >= MAX_RULES:
        raise RedirectError(f"A site can have up to {MAX_RULES} redirects.")
    db.run("INSERT INTO redirects (site_id, from_path, to_url, code, note, created_at) VALUES (?, ?, ?, ?, ?, ?) "
           "ON CONFLICT (site_id, from_path) DO UPDATE SET to_url = excluded.to_url, code = excluded.code, note = excluded.note",
           site_id, f, t, c, str(note or "")[:200], db.now())
    db.run("DELETE FROM not_found WHERE site_id = ? AND path = ?", site_id, f)
    db.log("Added a redirect", f"{f} → {t}", user, site_id)
    return db.one("SELECT * FROM redirects WHERE site_id = ? AND from_path = ?", site_id, f)


def remove(site_id, redirect_id, user=None) -> None:
    r = db.one("SELECT * FROM redirects WHERE id = ? AND site_id = ?", redirect_id, site_id)
    if r:
        db.run("DELETE FROM redirects WHERE id = ?", redirect_id)
        db.log("Removed a redirect", r["from_path"], user, site_id)


def _target(to_url: str, rest: str = "") -> str:
    t = to_url
    if t.endswith("*"):
        t = t[:-1] + rest.lstrip("/")
    if re.match(r"^https?://", t):
        return t
    if t.startswith("/"):
        return t
    return "/" if t == "index" else f"/{t}.html"


def match(site_id, path: str) -> tuple[str, int] | None:
    """(where to send the visitor, 301 or 302) for a request path, or None."""
    p = norm(path)
    exact = db.one("SELECT * FROM redirects WHERE site_id = ? AND from_path = ?", site_id, p)
    if exact:
        db.run("UPDATE redirects SET hits = hits + 1 WHERE id = ?", exact["id"])
        return _target(exact["to_url"]), exact["code"]
    best = None
    for r in db.all("SELECT * FROM redirects WHERE site_id = ? AND from_path LIKE '%*'", site_id):
        prefix = r["from_path"][:-1]
        if p.startswith(prefix) and (best is None or len(prefix) > len(best["from_path"]) - 1):
            best = r
    if best:
        db.run("UPDATE redirects SET hits = hits + 1 WHERE id = ?", best["id"])
        return _target(best["to_url"], p[len(best["from_path"]) - 1:]), best["code"]
    return None


def note_missing(site_id, path: str, referrer: str = "") -> None:
    """Remember an address that wasn't found (robots probing for WordPress files are left out)."""
    p = norm(path)
    if NOISE.search(p) or len(p) > 300 or re.search(r"\.(?:css|js|map|png|jpe?g|gif|webp|svg|ico|woff2?)$", p):
        return
    db.run("INSERT INTO not_found (site_id, path, hits, last_at, referrer) VALUES (?, ?, 1, ?, ?) "
           "ON CONFLICT (site_id, path) DO UPDATE SET hits = hits + 1, last_at = excluded.last_at, referrer = excluded.referrer",
           site_id, p, db.now(), str(referrer or "")[:300])
    n = db.one("SELECT COUNT(*) AS n FROM not_found WHERE site_id = ?", site_id)["n"]
    if n > MAX_NOT_FOUND:
        db.run("DELETE FROM not_found WHERE site_id = ? AND path IN (SELECT path FROM not_found WHERE site_id = ? "
               "ORDER BY hits ASC, last_at ASC LIMIT ?)", site_id, site_id, n - MAX_NOT_FOUND)


def missing(site_id) -> list[dict]:
    return db.all("SELECT * FROM not_found WHERE site_id = ? ORDER BY hits DESC, last_at DESC LIMIT 100", site_id)


def forget_missing(site_id, path=None) -> None:
    if path:
        db.run("DELETE FROM not_found WHERE site_id = ? AND path = ?", site_id, path)
    else:
        db.run("DELETE FROM not_found WHERE site_id = ?", site_id)


def page_moved(site_id, old_slug: str, new_slug: str, user=None) -> None:
    """A page's address changed in the builder: old links keep working."""
    if not old_slug or old_slug == new_slug or old_slug == "index":
        return
    try:
        add(site_id, "/" + old_slug, new_slug, 301, "Added when the page's address changed", user)
    except RedirectError:
        pass
    db.run("DELETE FROM redirects WHERE site_id = ? AND from_path = ?", site_id, "/" + new_slug)   # no loop back
