"""
sandbox.py: "Try the CMS": a password-free, short-lived session as the restricted demo user.

    GET /demo/start   → a demo session (2 hours) as the shared "demo" user, landing in the builder of the sandbox site
                        (demo_sites.SANDBOX, a copy of demo-cafe). Rate-limited per IP.
The demo role can only reach that one site, and inside it only content screens: no Users, no other sites, no
Settings (keys, lead email, members, domains, security), no module or store settings (keys), no export, no stock
uploads, no AI assist. Email and posting are off for every demo site at the server (demo_sites.is_demo). Writes,
uploads and publishes are rate-limited. guard() enforces all of this for every request (an allow-list of routes, and
every id in the address must belong to the sandbox site). Admins get "Reset demo sites" (POST /api/demo/reset);
all demo sites and the sandbox are also rebuilt every night (start_nightly).
"""

from __future__ import annotations

import os
import secrets
import threading
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from starlette.responses import HTMLResponse, JSONResponse, RedirectResponse
from starlette.routing import Match

from . import auth, db, demo_sites

DEMO_EMAIL = "demo@sandbox.invalid"
SESSION_MINUTES = 120
START_PER_IP, START_WINDOW = 6, 3600            # demo sessions per IP per hour
START_ALL = 300                                  # demo sessions per hour from everyone
WRITES_PER_IP, WRITES_WINDOW = 240, 600          # changes per IP per 10 minutes
UPLOADS_PER_IP, PUBLISH_PER_IP, HEAVY_WINDOW = 25, 20, 3600
MAX_UPLOAD = 6 * 1024 * 1024
RESET_HOUR = 3                                   # 3 AM Madison time
TZ = ZoneInfo("America/Chicago")
_hits: dict[str, deque] = defaultdict(deque)
_hits_lock = threading.Lock()


def _allow(key: str, limit: int, window: int) -> bool:
    now = time.monotonic()
    with _hits_lock:
        q = _hits[key]
        while q and now - q[0] > window:
            q.popleft()
        if len(q) >= limit:
            return False
        q.append(now)
        return True


# ---------------------------------------------------------------------------------------------- the demo user

def client_ip(request) -> str:
    """Same rule as app.client_ip: behind Caddy (peer = this machine) the last X-Forwarded-For entry, set by Caddy."""
    peer = request.client.host if request.client else ""
    forwarded = request.headers.get("x-forwarded-for", "")
    if peer in ("127.0.0.1", "::1") and forwarded:
        return forwarded.split(",")[-1].strip()
    return peer or "unknown"


def demo_user() -> dict:
    """The shared demo user (created when missing), a member (editor) of the sandbox site only."""
    user = db.one("SELECT * FROM users WHERE email = ?", DEMO_EMAIL)
    if not user:
        uid = auth.create_user(DEMO_EMAIL, "Demo visitor", secrets.token_urlsafe(32), "demo")   # nobody knows the password
        user = db.one("SELECT * FROM users WHERE id = ?", uid)
    sid = demo_sites.sandbox_id()
    db.run("DELETE FROM site_members WHERE user_id = ? AND site_id != ?", user["id"], sid or -1)
    if sid:
        db.run("INSERT OR IGNORE INTO site_members (site_id, user_id, role, created_at) VALUES (?, ?, 'editor', ?)", sid, user["id"], db.now())
    return user


def is_demo_user(user) -> bool:
    return bool(user) and user.get("role") == "demo"


def start(request, ip: str):
    """GET /demo/start."""
    if not (_allow("start:" + ip, START_PER_IP, START_WINDOW) and _allow("start:*", START_ALL, START_WINDOW)):
        return HTMLResponse(_page("Lots of demos right now", "Please try again in a little while.", "https://tenshisystems.com/", "Back to Tenshi Systems"),
                            status_code=429, headers={"Retry-After": "600"})
    sid = demo_sites.sandbox_id()
    if not sid:
        demo_sites.seed_all([demo_sites.SANDBOX_OF, demo_sites.SANDBOX])
        sid = demo_sites.sandbox_id()
    user = demo_user()
    request.session.clear()
    request.session["uid"] = user["id"]
    request.session["demo_until"] = time.time() + SESSION_MINUTES * 60
    page = db.one("SELECT id FROM pages WHERE site_id = ? AND slug = 'index'", sid) or db.one("SELECT id FROM pages WHERE site_id = ? ORDER BY position LIMIT 1", sid)
    db.log("Demo session started", "", None, sid)
    return RedirectResponse(f"/sites/{sid}/builder/{page['id']}" if page else f"/sites/{sid}", 303)


def _page(title, text, href, link):
    from markupsafe import escape
    return (f"<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>{escape(title)}</title>"
            "<body style='font:18px/1.5 system-ui;display:grid;place-items:center;min-height:90vh;margin:0 20px;background:#0f0d1a;color:#eee'>"
            f"<div style='max-width:520px'><h1>{escape(title)}</h1><p>{escape(text)}</p>"
            f"<p><a style='color:#f0abfc' href='{escape(href)}'>{escape(link)}</a></p></div>")


def ended_page():
    return HTMLResponse(_page("Your demo session ended", "Demo sessions last two hours. Start a fresh one any time; the demo site is reset every night.",
                              "/demo/start", "Start a new demo"))


# ---------------------------------------------------------------------------------------------- what the demo role may do

PAGES = {"/sites/{site_id}", "/sites/{site_id}/builder/{page_id}", "/sites/{site_id}/business", "/sites/{site_id}/chrome",
         "/sites/{site_id}/deployments", "/sites/{site_id}/galleries", "/sites/{site_id}/inbox/{kind}", "/sites/{site_id}/leads",
         "/sites/{site_id}/leads.csv", "/sites/{site_id}/leads/{lead_id}", "/sites/{site_id}/leads/{lead_id}/files/{file_id}",
         "/sites/{site_id}/media", "/sites/{site_id}/modules", "/sites/{site_id}/pages", "/sites/{site_id}/portfolio",
         "/sites/{site_id}/posts", "/sites/{site_id}/posts/{post_id}", "/sites/{site_id}/preview/{slug}",
         "/stock", "/stock/f/{name}", "/stock/t/{name}", "/api/stock", "/api/stock/{stock_id}", "/api/media/{media_id}",
         "/api/pages/{page_id}/revisions", "/api/sites/{site_id}/media", "/api/sites/{site_id}/posts", "/api/sites/{site_id}/chrome",
         "/m/{site_id}/{name}", "/t/{template_id}/{path:path}"}
CHANGES = {"/api/album-items/{item_id}", "/api/albums/{album_id}", "/api/albums/{album_id}/items", "/api/folders/{folder_id}",
           "/api/leads/{lead_id}", "/api/media/{media_id}", "/api/media/{media_id}/edit", "/api/pages/{page_id}",
           "/api/pages/{page_id}/revisions/{revision_id}/restore", "/api/portfolio/{item_id}",
           "/api/sites/{site_id}/albums", "/api/sites/{site_id}/chrome", "/api/sites/{site_id}/deploy", "/api/sites/{site_id}/folders",
           "/api/sites/{site_id}/inbox/{kind}/{row_id}", "/api/sites/{site_id}/media", "/api/sites/{site_id}/media/bulk",
           "/api/sites/{site_id}/pages", "/api/sites/{site_id}/pages/order", "/api/sites/{site_id}/portfolio",
           "/api/sites/{site_id}/portfolio/order", "/api/sites/{site_id}/posts", "/api/sites/{site_id}/posts/{post_id}",
           "/api/sites/{site_id}/profile", "/api/sites/{site_id}/profile/undo/{revision_id}", "/api/sites/{site_id}/settings",
           "/api/sites/{site_id}/stock/{stock_id}", "/api/sites/{site_id}/theme/preview", "/sites/{site_id}/preview/__w/{widget}/{action}",
           "/logout"}
OPEN = {"/login", "/demo/start", "/demo/ended", "/static/{name}", "/static/fonts/{name}", "/static/widgets/{name}/{path:path}"}

# which table says which site an id in the address belongs to
OWNERS = {"page_id": "SELECT site_id FROM pages WHERE id = ?", "media_id": "SELECT site_id FROM media WHERE id = ?",
          "album_id": "SELECT site_id FROM albums WHERE id = ?", "folder_id": "SELECT site_id FROM media_folders WHERE id = ?",
          "lead_id": "SELECT site_id FROM leads WHERE id = ?", "post_id": "SELECT site_id FROM posts WHERE id = ?",
          "file_id": "SELECT site_id FROM lead_files WHERE id = ?"}
FREE = {"kind", "slug", "name", "widget", "action", "path", "stock_id", "template_id", "row_id", "revision_id"}


def _route(app, scope):
    """The route this request will reach and the ids in its address. A path that exists only for other methods
    still counts (its ids are checked; the app then answers 405), so a method mismatch can never skip the checks."""
    partial = None
    for route in app.router.routes:
        match, child = route.matches(scope)
        if match == Match.FULL:
            return route, child.get("path_params", {})
        if match == Match.PARTIAL and partial is None:
            partial = (route, child.get("path_params", {}))
    return partial or (None, {})


def _owner(name, value, path):
    if name == "item_id":
        sql = ("SELECT a.site_id FROM album_items i JOIN albums a ON a.id = i.album_id WHERE i.id = ?" if path.startswith("/api/album-items")
               else "SELECT site_id FROM portfolio_items WHERE id = ?")
    elif name in OWNERS:
        sql = OWNERS[name]
    else:
        return None
    row = db.one(sql, value)
    return row["site_id"] if row else -1


def _deny(request, code=403, text="The demo can't open that. It's limited to the sandbox site's content."):
    if "application/json" in request.headers.get("accept", "") or request.url.path.startswith("/api/") or request.method != "GET":
        return JSONResponse({"error": text}, status_code=code)
    return HTMLResponse(_page("Not in the demo", text, "/demo/start" if code != 404 else "/", "Back to the demo"), status_code=code)


def guard(request, user, app):
    """None to carry on, or the answer. Runs for every CMS request (not for client sites)."""
    path = request.url.path
    sid = demo_sites.sandbox_id()
    if sid and path.startswith(f"/m/{sid}/") and not user:
        return _deny(request, 404, "Not found.")       # the sandbox's uploads are only for signed-in demo visitors
    if not is_demo_user(user) or path in ("/demo/start", "/demo/ended", "/login") or path.startswith("/static/"):
        return None
    if time.time() > float(request.session.get("demo_until") or 0):
        request.session.clear()
        return RedirectResponse("/demo/ended", 303) if request.method == "GET" else JSONResponse({"error": "Your demo session ended."}, status_code=401)
    if path in ("/", "/sites"):
        return RedirectResponse(f"/sites/{sid}", 303)
    route, params = _route(app, request.scope)
    if route is None:
        return None                                      # 404 from the app
    template = getattr(route, "path", "")
    if template in OPEN:
        return None
    method = request.method
    if method in ("GET", "HEAD"):
        if template not in PAGES and template != "/sites/{site_id}/preview/__w/{widget}/{action}":
            return _deny(request)
    elif template not in CHANGES:
        return _deny(request)
    for name, value in params.items():
        if name == "site_id":
            if int(value) != sid:
                return _deny(request)
        elif name in FREE:
            continue
        elif _owner(name, value, template) != sid:
            return _deny(request)
    ip = client_ip(request)
    if method not in ("GET", "HEAD"):
        if not _allow("w:" + ip, WRITES_PER_IP, WRITES_WINDOW):
            return _deny(request, 429, "That's a lot of changes in a few minutes. Take a breather and try again shortly.")
        if template == "/api/sites/{site_id}/media" and method == "POST":
            if int(request.headers.get("content-length") or 0) > MAX_UPLOAD:
                return _deny(request, 413, "Demo uploads are limited to 6 MB.")
            if not _allow("u:" + ip, UPLOADS_PER_IP, HEAVY_WINDOW):
                return _deny(request, 429, "The demo allows 25 uploads an hour.")
        if template == "/api/sites/{site_id}/deploy" and not _allow("d:" + ip, PUBLISH_PER_IP, HEAVY_WINDOW):
            return _deny(request, 429, "The demo allows 20 publishes an hour.")
    return None


# ---------------------------------------------------------------------------------------------- seeding and the nightly reset

def enabled() -> bool:
    return os.environ.get("TENSHI_DEMO_SITES", "1") != "0"


def _claim(day: str) -> bool:
    """Only one process resets per night (site_settings row for site 0)."""
    try:
        with db.transaction() as conn:
            row = conn.execute("SELECT value_json FROM site_settings WHERE site_id = 0 AND key = 'demo_reset'").fetchone()
            if row and day in (row[0] or ""):
                return False
            conn.execute("INSERT OR REPLACE INTO site_settings (site_id, key, value_json, updated_at) VALUES (0, 'demo_reset', ?, ?)",
                         (db.dumps(day), db.now()))
        return True
    except Exception:  # noqa: BLE001
        return False


def reset_everything():
    demo_sites.reset_all()
    user = db.one("SELECT id FROM users WHERE email = ?", DEMO_EMAIL)
    if user:
        demo_user()                                     # membership of the new sandbox site


def _nightly():
    while True:
        now = datetime.now(TZ)
        run = now.replace(hour=RESET_HOUR, minute=0, second=0, microsecond=0)
        if run <= now:
            run += timedelta(days=1)
        time.sleep(max(30, (run - now).total_seconds()))
        if _claim(datetime.now(TZ).date().isoformat()):
            try:
                reset_everything()
            except Exception as error:  # noqa: BLE001
                db.log("Demo nightly reset failed", f"{type(error).__name__}: {error}"[:300])


def start_background():
    """On start-up: build missing demo sites, then reset them every night at 3 AM (Madison)."""
    if not enabled():
        return

    def run():
        try:
            demo_sites.seed_all()
            demo_user()
        except Exception as error:  # noqa: BLE001
            db.log("Demo seed failed", f"{type(error).__name__}: {error}"[:300])
        _nightly()
    threading.Thread(target=run, daemon=True, name="demo-sites").start()
