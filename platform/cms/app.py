"""
app.py: the Tenshi CMS web server.

One program does three jobs, told apart by the address in the browser:
    localhost:8000/...                 the CMS itself (sign in, dashboard, every module)
    localhost:8000/api/...             the CMS's JSON API (what the CMS pages call when you click Save)
    <subdomain>.localhost:8000/...     a client's live website (the files of its current deployment)

Start it with:   .venv\\Scripts\\python -m cms        (from the platform folder; see platform/README.md)

Safety notes:
  * Every CMS page and API call needs a signed-in user (a signed cookie). Admin-only actions are marked admin=True.
  * API calls that change something must send the header "X-Tenshi: 1". Browsers won't let another website add that
    header, so a malicious page can't make your browser change things in the CMS behind your back.
"""

import csv
import io
import json
import mimetypes
import re
from datetime import date, timedelta
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse, Response
from jinja2 import Environment, FileSystemLoader, select_autoescape
from markupsafe import escape
from starlette.middleware.sessions import SessionMiddleware

from tenshi import forms as tforms, profile as prof, scanner

from . import auth, blocks, chrome, config, db, domains, forms as lead_forms, mail, media, members, notify, posts, ratelimit, render, revisions, sanitize, security, sites, templates, theme as theme_mod, widgets
from . import stock, stock_routes

VERSION = "1.0.0"
UI_DIR = Path(__file__).parent / "ui"
STATIC_DIR = Path(__file__).parent / "static"

# Names the site templates use that are not business data (so the Business form never shows boxes for them)
# (Loop variables like `service` are understood by the scanner itself, so they don't belong here.)
scanner.PLATFORM_NAMES |= {"media", "media_alt", "album", "album_layout", "portfolio", "link", "asset", "editing", "tracking",
                           "form_is_mail", "theme", "page", "blocks", "block", "site", "widget"}

# The automatic API docs (/api/docs, /redoc, /openapi.json) are off: they listed every endpoint to anyone.
# Turn them on for local development only with TENSHI_API_DOCS=1.
_DOCS = config.API_DOCS
app = FastAPI(title="Tenshi CMS", docs_url="/api/docs" if _DOCS else None, redoc_url=None,
              openapi_url="/openapi.json" if _DOCS else None)
ui = Environment(loader=FileSystemLoader(str(UI_DIR)), autoescape=select_autoescape(["html"]))
ui.filters["size"] = media.human_size
ui.filters["when"] = lambda t: (t or "")[:16].replace("T", " ")
ui.filters["j"] = lambda text, default=None: db.j(text, default)
ui.filters["tojson_attr"] = lambda v: json.dumps(v, ensure_ascii=False)


# ---------------------------------------------------------------------------------------------- start-up

@app.on_event("startup")
def startup():
    config.ensure_folders()
    db.setup()
    templates.seed()
    stock.setup()
    stock.start_seed_in_background()       # the Stock Photo Library's seed photos (stock.py), imported once


# ---------------------------------------------------------------------------------------------- client sites

SITE_HOST = re.compile(r"^([a-z0-9-]+)\." + re.escape(config.SITES_DOMAIN) + r"(:\d+)?$")
TRANSPARENT_GIF = bytes.fromhex("47494638396101000100800000000000ffffff21f90401000000002c00000000010001000002024401003b")



def _wants_json(request: Request) -> bool:
    return "application/json" in request.headers.get("accept", "")


async def _form_builder_send(request: Request, site: dict, spec: dict, form):
    """Check and keep one send of a Form builder form; email the form's recipient (forms.py, mail.py)."""
    try:
        data, uploads = await lead_forms.check(spec, form)
        files = []
        for field, up in uploads:
            content, ext = await lead_forms.read_upload(field, up)
            files.append((field, content, ext, up.filename or ""))
    except lead_forms.FormProblem as problem:
        if _wants_json(request):
            return JSONResponse({"ok": False, "error": str(problem), "field": problem.field}, status_code=400)
        return HTMLResponse(_form_page("That didn't send", str(problem), "./", "Back to the website"), status_code=400)
    lead_id = lead_forms.save(site["id"], spec, data, files)
    # the form's own recipient, else the site's lead email address; the site's on/off switch and hourly limit (notify.py)
    notify.lead_received(site, lead_id, spec.get("title", "Form"), data, [name for _, _, _, name in files], spec.get("recipient") or "")
    if _wants_json(request):
        return JSONResponse({"ok": True})
    return HTMLResponse(_form_page("Thank you", spec.get("success") or "Your message is on its way.", "./", "Back to the website"))


def _form_page(title, text, href, link_text):
    """The page a visitor sees after sending a form with JavaScript switched off."""
    return (f"<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>{escape(title)}</title>"
            f"<body style='font:18px/1.5 system-ui;display:grid;place-items:center;min-height:90vh;color:#222;margin:0 20px'>"
            f"<div><h1>{escape(title)}</h1><p>{escape(text)}</p><p><a href='{escape(href)}'>{escape(link_text)}</a></p></div>")

@app.middleware("http")
async def serve_client_sites(request: Request, call_next):
    """
    A client's website, not the CMS, is asked for in two ways:
      <subdomain>.localhost/<page>     its own address (the normal way; *.tenshisystems.com in production)
      <cms address>/s/<subdomain>/<page>   the same site under the CMS's address, for when only one address exists
                                            (e.g. a temporary review link). Built sites use relative links, so both work.
    """
    match = SITE_HOST.match(request.headers.get("host", "").lower())
    if match and match.group(1) not in sites.RESERVED:      # cms.<domain> (and www, api...) is the CMS itself, not a client site
        return await serve_site(request, match.group(1), request.url.path)
    under = re.match(r"^/s/([a-z0-9-]+)(/.*)?$", request.url.path)
    if under:
        if under.group(2) is None:                            # /s/name  →  /s/name/ so relative links work
            return RedirectResponse(request.url.path + "/", 301)
        return await serve_site(request, under.group(1), under.group(2))
    if not match and request.url.path != "/__tls/ask":
        own = domains.subdomain_for_host(request.headers.get("host", ""))   # a site's own domain (domains.py)
        if own:
            return await serve_site(request, own, request.url.path)
    return await call_next(request)


@app.get("/__tls/ask")
def tls_ask(request: Request, domain: str = ""):
    """Caddy's on-demand TLS question (domains.py, tools/server/tenshi-tls-ask.sh): 200 = get a certificate for it."""
    if not domains.from_caddy(request.client.host if request.client else None, request.headers):
        return Response("Not found", status_code=404, media_type="text/plain")
    ok = domains.allowed_for_tls(domain)
    return Response("yes" if ok else "no", status_code=200 if ok else 404, media_type="text/plain",
                    headers={"X-Tenshi-Ask": "1", "Cache-Control": "no-store"})


async def serve_site(request: Request, subdomain: str, path: str):
    """Answer one request for a client's live website: a page or file of its current deployment, a form, a visit."""
    folder, site = sites.live_folder(subdomain)
    if site and path == "/__form" and request.method == "POST":
        if not ratelimit.allow_form_post(site["id"], client_ip(request)):
            return JSONResponse({"ok": False, "error": "Too many messages from here. Please try again in a few minutes, or call us."},
                                status_code=429, headers={"Retry-After": "600"})
        try:
            size = int(request.headers.get("content-length") or 0)
        except ValueError:
            size = 0
        if size > lead_forms.MAX_REQUEST_MB * 1024 * 1024:
            return JSONResponse({"ok": False, "error": "The files are too large to send."}, status_code=413)
        try:
            form = await request.form(max_files=25, max_fields=200)
        except TypeError:                                     # an older Starlette without the limits
            form = await request.form()
        if form.get("_hp"):                                   # the hidden box only robots fill in
            return JSONResponse({"ok": True})
        spec = lead_forms.load_spec(folder, f"{form.get('_page', '')}/{form.get('_form', '')}") if form.get("_form") else None
        if spec:                                              # a Form builder form (forms.py)
            return await _form_builder_send(request, site, spec, form)
        fields = {k: v for k, v in form.items() if isinstance(v, str)}
        try:
            lead_id = sites.save_lead(site["id"], fields)
        except sites.SiteError:
            return JSONResponse({"ok": False}, status_code=400)
        notify.lead_received(site, lead_id, "Contact", {k: str(v)[:4000] for k, v in fields.items() if not k.startswith("_")})
        return JSONResponse({"ok": True})
    if site and path == "/__visit":
        if folder:
            sites.count_visit(site["id"], request.query_params.get("p", "index"))
        return Response(TRANSPARENT_GIF, media_type="image/gif", headers={"Cache-Control": "no-store"})
    if not folder:
        title = "This site is paused" if site and site["status"] == "paused" else "Nothing here yet"
        return HTMLResponse(f"<!doctype html><meta charset=utf-8><title>{title}</title><body style='font:18px system-ui;"
                            f"display:grid;place-items:center;min-height:90vh;color:#444'><div><h1>{title}</h1>"
                            "<p>This address belongs to a Tenshi website that isn't published.</p></div>", status_code=404)
    rel = path.lstrip("/") or "index.html"
    if rel.endswith("/"):
        rel += "index.html"
    file = (folder / rel).resolve()
    if not file.suffix and (folder / f"{rel}.html").exists():
        file = (folder / f"{rel}.html").resolve()
    if folder.resolve() not in file.parents or not file.is_file() or any(part.startswith(".") for part in file.relative_to(folder.resolve()).parts):
        not_found = folder / "404.html"
        return FileResponse(not_found) if not_found.exists() else HTMLResponse("<h1>Page not found</h1>", status_code=404)
    headers = {"Cache-Control": "public, max-age=60"}
    if file.suffix == ".html":
        # Each page's own policy: the base policy plus what the widgets on that page need (e.g. the Store widget adds
        # Shopify's hosts), read from the deployment's manifest (widgets.write_manifest). Pages without widgets get the base.
        # The site's own extra allowed hosts and its report-only switch (Settings & theme › Security, security.py).
        sec = security.load(site["id"])
        headers[security.header_name(sec)] = widgets.csp_for_file(folder, file.relative_to(folder.resolve()).as_posix(), security.extra_sources(sec))
    if file.name == "feed.xml":
        return FileResponse(file, headers=headers, media_type="application/rss+xml; charset=utf-8")
    return FileResponse(file, headers=headers)


# ---------------------------------------------------------------------------------------------- sign-in helpers

def current_user(request: Request):
    uid = request.session.get("uid")
    return db.one("SELECT * FROM users WHERE id = ?", uid) if uid else None


def page_user(request: Request, admin=False):
    """For CMS pages: the signed-in user, or a redirect to the sign-in page."""
    user = current_user(request)
    if not user:
        raise HTTPException(303, headers={"Location": "/setup" if auth.needs_setup() else f"/login?next={request.url.path}"})
    if admin and user["role"] != "admin":
        raise HTTPException(403, "Only admins can do this.")
    return user


def api_user(request: Request, admin=False):
    """For API calls: the signed-in user; changes also need the X-Tenshi header (see the note at the top)."""
    user = current_user(request)
    if not user:
        raise HTTPException(401, "Please sign in again.")
    if request.method != "GET" and request.headers.get("x-tenshi") != "1":
        raise HTTPException(403, "Missing X-Tenshi header.")
    if admin and user["role"] != "admin":
        raise HTTPException(403, "Only admins can do this.")
    return user


@app.exception_handler(sites.SiteError)
@app.exception_handler(media.MediaError)
@app.exception_handler(templates.TemplateError)
@app.exception_handler(widgets.WidgetError)
@app.exception_handler(members.MemberError)
@app.exception_handler(security.SecurityError)
@app.exception_handler(theme_mod.ThemeError)
@app.exception_handler(posts.PostError)
@app.exception_handler(chrome.ChromeError)
async def friendly_errors(request, error):
    return JSONResponse({"error": str(error)}, status_code=400)


def show(name, request, user, **ctx):
    """Draw one CMS screen from cms/ui/<name>."""
    all_sites = db.all("SELECT id, name, subdomain, status FROM sites ORDER BY name")
    ctx.setdefault("site", None)          # the site chosen in the sidebar (None on Dashboard, Templates …)
    html = ui.get_template(name).render(user=user, request=request, sites_menu=all_sites, version=VERSION,
                                        sites_domain=config.SITES_DOMAIN, site_url=config.site_url, **ctx)
    return HTMLResponse(html)


def site_or_404(site_id):
    try:
        return sites.get(site_id)
    except sites.SiteError:
        raise HTTPException(404, "That site doesn't exist.")


# ---------------------------------------------------------------------------------------------- setup and sign-in pages

@app.get("/setup", response_class=HTMLResponse)
def setup_page(request: Request):
    if not auth.needs_setup():
        return RedirectResponse("/login", 303)
    return HTMLResponse(ui.get_template("setup.html").render(error=None))


@app.post("/setup")
def setup_submit(request: Request, name: str = Form(...), email: str = Form(...), password: str = Form(...)):
    if not auth.needs_setup():
        return RedirectResponse("/login", 303)
    try:
        uid = auth.create_user(email, name, password, "admin")
    except (ValueError, Exception) as error:
        return HTMLResponse(ui.get_template("setup.html").render(error=str(error)), status_code=400)
    request.session["uid"] = uid
    db.log("Set up the CMS", name, {"id": uid})
    return RedirectResponse("/", 303)


@app.get("/login", response_class=HTMLResponse)
def login_page(request: Request, next: str = "/"):
    if auth.needs_setup():
        return RedirectResponse("/setup", 303)
    return HTMLResponse(ui.get_template("login.html").render(error=None, next=next))


def client_ip(request: Request):
    """The visitor's IP. Behind Caddy (the peer is this machine) it's the last X-Forwarded-For entry, which Caddy sets
    itself; a visitor can't fake it because Caddy doesn't trust incoming X-Forwarded-For headers by default."""
    peer = request.client.host if request.client else ""
    forwarded = request.headers.get("x-forwarded-for", "")
    if peer in ("127.0.0.1", "::1") and forwarded:
        return forwarded.split(",")[-1].strip()
    return peer or "unknown"


@app.post("/login")
def login_submit(request: Request, email: str = Form(...), password: str = Form(...), next: str = Form("/")):
    ip = client_ip(request)
    wait = auth.locked_for(ip, email)
    if wait:
        minutes = max(1, (wait + 59) // 60)
        msg = f"Too many wrong passwords. Try again in {minutes} minute{'s' if minutes != 1 else ''}."
        return HTMLResponse(ui.get_template("login.html").render(error=msg, next=next), status_code=429,
                            headers={"Retry-After": str(wait)})
    user = auth.sign_in(email, password)
    if not user:
        auth.note_failure(ip, email)
        return HTMLResponse(ui.get_template("login.html").render(error="That email and password don't match.", next=next), status_code=401)
    auth.clear_failures(ip, email)
    request.session["uid"] = user["id"]
    return RedirectResponse(next if next.startswith("/") and not next.startswith("//") else "/", 303)


@app.post("/logout")
def logout(request: Request):
    request.session.clear()
    return RedirectResponse("/login", 303)


# ---------------------------------------------------------------------------------------------- dashboard

@app.get("/", response_class=HTMLResponse)
def dashboard(request: Request):
    user = page_user(request)
    week_ago = (date.today() - timedelta(days=6)).isoformat()
    all_sites = db.all("SELECT * FROM sites ORDER BY updated_at DESC")
    for s in all_sites:
        s["health"] = sites.health(s["id"])
        s["visits"] = db.one("SELECT COALESCE(SUM(count), 0) AS n FROM visits WHERE site_id = ? AND day >= ?", s["id"], week_ago)["n"]
        s["leads_new"] = db.one("SELECT COUNT(*) AS n FROM leads WHERE site_id = ? AND status = 'new'", s["id"])["n"]
    days = [(date.today() - timedelta(days=i)).isoformat() for i in range(13, -1, -1)]
    per_day = {r["day"]: r["n"] for r in db.all("SELECT day, SUM(count) AS n FROM visits WHERE day >= ? GROUP BY day", days[0])}
    tasks = [(s, text, where) for s in all_sites for ok, text, where in s["health"]["checks"] if not ok][:10]
    storage = {"media": media.storage_bytes(), "builds": _folder_bytes(config.BUILDS_DIR), "backups": _folder_bytes(config.BACKUPS_DIR)}
    stats = {
        "sites": len(all_sites), "live": sum(1 for s in all_sites if s["status"] == "live"),
        "deploys_week": db.one("SELECT COUNT(*) AS n FROM builds WHERE status != 'failed' AND created_at >= ?", week_ago)["n"],
        "last_deploy": db.one("SELECT b.*, s.name AS site_name FROM builds b JOIN sites s ON s.id = b.site_id ORDER BY b.id DESC LIMIT 1"),
        "leads_new": db.one("SELECT COUNT(*) AS n FROM leads WHERE status = 'new'")["n"],
        "leads_week": db.one("SELECT COUNT(*) AS n FROM leads WHERE created_at >= ?", week_ago)["n"],
        "visits_week": sum(per_day.get(d, 0) for d in days[-7:]), "storage": storage, "storage_total": sum(storage.values()),
    }
    activity = db.all("SELECT a.*, u.name AS user_name, s.name AS site_name FROM activity a LEFT JOIN users u ON u.id = a.user_id "
                      "LEFT JOIN sites s ON s.id = a.site_id ORDER BY a.id DESC LIMIT 14")
    leads = db.all("SELECT l.*, s.name AS site_name FROM leads l JOIN sites s ON s.id = l.site_id ORDER BY l.id DESC LIMIT 5")
    return show("dashboard.html", request, user, all_sites=all_sites, stats=stats, tasks=tasks, activity=activity, leads=leads,
                chart=[(d, per_day.get(d, 0)) for d in days], templates_list=templates.all_templates())


def _folder_bytes(folder):
    return sum(f.stat().st_size for f in Path(folder).rglob("*") if f.is_file()) if Path(folder).exists() else 0


# ---------------------------------------------------------------------------------------------- sites

@app.get("/sites", response_class=HTMLResponse)
def sites_page(request: Request):
    user = page_user(request)
    rows = db.all("SELECT * FROM sites ORDER BY name")
    for s in rows:
        s["health"] = sites.health(s["id"])["score"]
    return show("sites.html", request, user, rows=rows, templates_list=templates.all_templates())


@app.get("/sites/{site_id}", response_class=HTMLResponse)
def site_overview(request: Request, site_id: int):
    user = page_user(request)
    site = site_or_404(site_id)
    week_ago = (date.today() - timedelta(days=6)).isoformat()
    numbers = {
        "pages": db.one("SELECT COUNT(*) AS n FROM pages WHERE site_id = ?", site_id)["n"],
        "media": db.one("SELECT COUNT(*) AS n FROM media WHERE site_id = ?", site_id)["n"],
        "storage": media.storage_bytes(site_id),
        "leads": db.one("SELECT COUNT(*) AS n FROM leads WHERE site_id = ? AND status = 'new'", site_id)["n"],
        "visits": db.one("SELECT COALESCE(SUM(count), 0) AS n FROM visits WHERE site_id = ? AND day >= ?", site_id, week_ago)["n"],
        "portfolio": db.one("SELECT COUNT(*) AS n FROM portfolio_items WHERE site_id = ?", site_id)["n"],
    }
    top_pages = db.all("SELECT page, SUM(count) AS n FROM visits WHERE site_id = ? AND day >= ? GROUP BY page ORDER BY n DESC LIMIT 5", site_id, week_ago)
    build = db.one("SELECT * FROM builds WHERE id = ?", site["current_build_id"]) if site["current_build_id"] else None
    activity = db.all("SELECT a.*, u.name AS user_name FROM activity a LEFT JOIN users u ON u.id = a.user_id WHERE a.site_id = ? ORDER BY a.id DESC LIMIT 8", site_id)
    return show("site.html", request, user, site=site, section="overview", numbers=numbers, health=sites.health(site_id),
                build=build, activity=activity, top_pages=top_pages, template=templates.get(site["template_id"]))


@app.post("/api/sites")
async def api_create_site(request: Request):
    user = api_user(request)
    body = await request.json()
    profile = {"company": {"name": body.get("name", "").strip(), "description": body.get("description", ""),
                           "phone": body.get("phone", ""), "email": body.get("email", "")}}
    if not profile["company"]["name"]:
        raise sites.SiteError("Please give the site a name.")
    site = sites.create_site(profile["company"]["name"], body.get("template") or "corporate", body.get("subdomain") or None, profile, user)
    if body.get("deploy"):
        sites.deploy(site["id"], "First deployment", user)
    return {"site": sites.get(site["id"]), "url": f"/sites/{site['id']}"}


@app.post("/api/sites/{site_id}/deploy")
async def api_deploy(request: Request, site_id: int):
    user = api_user(request)
    body = await request.json() if request.headers.get("content-length", "0") != "0" else {}
    build = sites.deploy(site_id, body.get("note", ""), user)
    return {"build": build, "url": config.site_url(sites.get(site_id)["subdomain"])}


@app.post("/api/sites/{site_id}/rollback/{build_id}")
def api_rollback(request: Request, site_id: int, build_id: int):
    sites.rollback(site_id, build_id, api_user(request, admin=True))
    return {"ok": True}


@app.post("/api/sites/{site_id}/status/{status}")
def api_status(request: Request, site_id: int, status: str):
    sites.set_status(site_id, status, api_user(request, admin=True))
    return {"ok": True}


@app.post("/api/sites/{site_id}/clone")
async def api_clone(request: Request, site_id: int):
    user = api_user(request, admin=True)
    body = await request.json()
    site = sites.clone_site(site_id, body.get("name") or "Copy", body.get("subdomain") or None, user)
    return {"site": site, "url": f"/sites/{site['id']}"}


@app.post("/api/sites/{site_id}/backup")
async def api_backup(request: Request, site_id: int):
    user = api_user(request)
    body = await request.json() if request.headers.get("content-length", "0") != "0" else {}
    return {"backup": sites.backup(site_id, body.get("note", ""), user)}


@app.post("/api/backups/{backup_id}/restore")
def api_restore(request: Request, backup_id: int):
    sites.restore(backup_id, api_user(request, admin=True))
    return {"ok": True}


@app.get("/backups/{backup_id}/download")
def download_backup(request: Request, backup_id: int):
    page_user(request, admin=True)
    b = db.one("SELECT * FROM backups WHERE id = ?", backup_id)
    if not b:
        raise HTTPException(404)
    return FileResponse(config.BACKUPS_DIR / b["file"], filename=b["file"], media_type="application/zip")


@app.delete("/api/sites/{site_id}")
def api_delete_site(request: Request, site_id: int):
    sites.delete_site(site_id, api_user(request, admin=True))
    return {"ok": True}


@app.post("/api/sites/{site_id}/settings")
async def api_site_settings(request: Request, site_id: int):
    """Theme (colours, fonts, shape), template, and the site's name and address."""
    user = api_user(request)
    site = sites.get(site_id)
    body = await request.json()
    if "theme" in body:
        new_theme = theme_mod.clean(body["theme"])
        if (theme_mod.brand_part(new_theme) != theme_mod.brand_part(db.j(site["theme_json"]))
                and not theme_mod.can_change_brand(user, site_id)):
            raise HTTPException(403, "The brand is locked on this site: only its owners and CMS admins can change colours, fonts and shapes.")
        db.run("UPDATE sites SET theme_json = ?, updated_at = ? WHERE id = ?", db.dumps(new_theme), db.now(), site_id)
    if body.get("template") and body["template"] != site["template_id"]:
        templates.get(body["template"])
        db.run("UPDATE sites SET template_id = ?, updated_at = ? WHERE id = ?", body["template"], db.now(), site_id)
        db.log("Switched template", body["template"], user, site_id)
    if body.get("subdomain") and body["subdomain"] != site["subdomain"]:
        if user["role"] != "admin":
            raise HTTPException(403, "Only admins can change a site's address.")
        sites.check_subdomain(body["subdomain"], site_id)
        db.run("UPDATE sites SET subdomain = ?, updated_at = ? WHERE id = ?", body["subdomain"], db.now(), site_id)
    db.log("Changed settings", ", ".join(body), user, site_id)
    return {"ok": True}


def theme_editor_data(user, site):
    """What the theme editor (static/theme.js) needs, for the settings page and the builder."""
    tpl = templates.get(site["template_id"])
    return {"site": site["id"], "theme": theme_mod.Theme.model_validate(db.j(site["theme_json"]) or {}).model_dump(),
            "defaults": {"colors": tpl.get("colors", {}), "fonts": tpl.get("fonts", {}), "style": tpl.get("style", "clean")},
            "fonts": {k: list(v) for k, v in templates.FONTS.items()}, "presets": theme_mod.PRESETS,
            "spacing": list(theme_mod.SPACING), "radius_max": theme_mod.RADIUS_MAX, "modes": list(theme_mod.MODES),
            "locked": theme_mod.load_brand(site["id"]).locked, "can_manage": members.can_manage(user, site["id"]),
            "can_edit": theme_mod.can_change_brand(user, site["id"])}


@app.post("/api/sites/{site_id}/theme/preview")
async def api_theme_preview(request: Request, site_id: int):
    """The tokens CSS and the contrast check for a theme that isn't saved yet (the live preview)."""
    api_user(request)
    site = sites.get(site_id)
    merged = templates.theme_for(site["template_id"], theme_mod.clean((await request.json()).get("theme")))
    return {"css": theme_mod.tokens_css(merged), "style": merged["style"], "checks": theme_mod.all_checks(merged),
            "dark": theme_mod.dark_palette(merged["colors"], merged.get("dark_colors"))}


@app.put("/api/sites/{site_id}/brand")
async def api_site_brand(request: Request, site_id: int):
    """Lock or unlock the brand (colours, fonts, shapes) for editors. Admins and the site's owners only."""
    user = api_user(request)
    sites.get(site_id)
    if not members.can_manage(user, site_id):
        raise HTTPException(403, "Only CMS admins and this site's owners can lock or unlock the brand.")
    return theme_mod.save_brand(site_id, {"locked": bool((await request.json()).get("locked"))}, user).model_dump()


# ---------------------------------------------------------------------------------------------- business data

STANDARD_FIELDS = [
    "company.name", "company.tagline", "company.description", "company.phone", "company.email", "company.address",
    "company.service_areas", "company.logo_media", "company.hours[].days", "company.hours[].time",
    "services[].name", "services[].description", "services[].price", "services[].image_media",
    "staff[].name", "staff[].role", "staff[].bio", "staff[].photo_media",
    "testimonials[].quote", "testimonials[].author", "testimonials[].rating",
    "locations[].name", "locations[].address", "locations[].phone", "social", "seo.title", "seo.description",
]
BUSINESS_LABELS = {"labels": {"company.name": "Business name", "company.tagline": "Tagline (short slogan)", "company.description": "About the business",
                              "company.service_areas": "Places you serve", "company.hours[].days": "Days", "company.hours[].time": "Opening hours",
                              "services[].price": "Price (optional)", "staff[].role": "Job title", "testimonials[].quote": "What they said",
                              "testimonials[].author": "Who said it", "testimonials[].rating": "Stars", "seo.title": "Title in Google",
                              "seo.description": "Description in Google"},
                   "help": {"company.description": "Two or three sentences: what you do, who for, and why customers choose you.",
                            "seo.description": "About 150 characters. Shown under your name in search results."},
                   "required_fields": ["company.name", "company.description"]}


def business_form(template_id):
    """The Business data form: every field the site's template uses (found by the scanner) plus the standard schema."""
    used = scanner.scan_folder(templates.current_dir(template_id))
    paths = sorted(set(used) | set(STANDARD_FIELDS), key=lambda p: (STANDARD_FIELDS.index(p) if p in STANDARD_FIELDS else 999, p))
    keep = set(scanner.tidy(paths))                     # tidy() sorts alphabetically, so keep our own order
    form = tforms.build_form([p for p in paths if p in keep], BUSINESS_LABELS)
    for section in form:          # "company.hours[]" lives inside company: show it as its own repeating section
        hours = [f for f in section["fields"] if "hours[]" in f["path"]]
        if hours:
            section["fields"] = [f for f in section["fields"] if f not in hours]
            form.insert(form.index(section) + 1, {"section": "company.hours", "title": "Opening hours", "repeat": True,
                                                  "help": "", "required": False, "fields": hours})
            break
    return form, used


@app.get("/sites/{site_id}/business", response_class=HTMLResponse)
def business_page(request: Request, site_id: int):
    user = page_user(request)
    site = site_or_404(site_id)
    form, used = business_form(site["template_id"])
    profile = prof.with_defaults(db.j(site["profile_json"]))
    profile.setdefault("locations", [])
    revisions = db.all("SELECT r.id, r.created_at, u.name AS user_name FROM profile_revisions r LEFT JOIN users u ON u.id = r.user_id "
                       "WHERE site_id = ? ORDER BY r.id DESC LIMIT 10", site_id)
    return show("business.html", request, user, site=site, section="business", form=form, profile=profile,
                used_count=len(used), revisions=revisions)


@app.post("/api/sites/{site_id}/profile")
async def api_save_profile(request: Request, site_id: int):
    user = api_user(request)
    profile = await request.json()
    site = sites.get(site_id)
    old = db.j(site["profile_json"])
    profile["site"] = old.get("site", {})
    profile["schema"] = "tenshi.business/1"
    sites.save_profile(site_id, profile, user)
    return {"ok": True}


@app.post("/api/sites/{site_id}/profile/undo/{revision_id}")
def api_profile_undo(request: Request, site_id: int, revision_id: int):
    user = api_user(request)
    rev = db.one("SELECT * FROM profile_revisions WHERE id = ? AND site_id = ?", revision_id, site_id)
    if not rev:
        raise HTTPException(404)
    sites.save_profile(site_id, db.j(rev["profile_json"]), user)
    return {"ok": True}


# ---------------------------------------------------------------------------------------------- pages and the page builder

@app.get("/sites/{site_id}/pages", response_class=HTMLResponse)
def pages_page(request: Request, site_id: int):
    user = page_user(request)
    site = site_or_404(site_id)
    rows = db.all("SELECT * FROM pages WHERE site_id = ? ORDER BY position, id", site_id)
    return show("pages.html", request, user, site=site, section="pages", rows=rows)


@app.get("/sites/{site_id}/builder/{page_id}", response_class=HTMLResponse)
def builder_page(request: Request, site_id: int, page_id: int):
    user = page_user(request)
    site = site_or_404(site_id)
    page = db.one("SELECT * FROM pages WHERE id = ? AND site_id = ?", page_id, site_id)
    if not page:
        raise HTTPException(404)
    all_pages = db.all("SELECT id, slug, title FROM pages WHERE site_id = ? ORDER BY position, id", site_id)
    albums = db.all("SELECT id, name FROM albums WHERE site_id = ? ORDER BY name", site_id)
    cats = [r["category"] for r in db.all("SELECT DISTINCT category FROM portfolio_items WHERE site_id = ? AND category != ''", site_id)]
    return show("builder.html", request, user, site=site, section="pages", page=page, all_pages=all_pages,
                block_types=blocks.BLOCKS, albums=albums, categories=cats, theme_editor=theme_editor_data(user, site))


@app.get("/sites/{site_id}/preview/{slug}", response_class=HTMLResponse)
def site_preview(request: Request, site_id: int, slug: str, edit: int = 0):
    page_user(request)
    site = site_or_404(site_id)
    html = render.preview(site, slug, editing=bool(edit))
    if html is None:
        raise HTTPException(404, "No page with that address.")
    if edit:     # the page builder's helper: click to select a block, type over words to change them
        html = html.replace("</body>", '<link rel="stylesheet" href="/static/bridge.css"><script src="/static/bridge.js"></script></body>')
    return HTMLResponse(html)


@app.post("/api/sites/{site_id}/pages")
async def api_new_page(request: Request, site_id: int):
    user = api_user(request)
    body = await request.json()
    title = (body.get("title") or "New page").strip()
    slug = posts.safe_page_slug(sites.slugify(body.get("slug") or title) or "page")
    base, n = slug, 2
    while db.one("SELECT id FROM pages WHERE site_id = ? AND slug = ?", site_id, slug):
        slug, n = f"{base}-{n}", n + 1
    position = db.one("SELECT COALESCE(MAX(position), 0) + 1 AS n FROM pages WHERE site_id = ?", site_id)["n"]
    start = [blocks.new_block("text", heading=title, body="<p>Write something here.</p>")]
    if body.get("copy_from"):
        src = db.one("SELECT blocks_json FROM pages WHERE id = ? AND site_id = ?", body["copy_from"], site_id)
        if src:
            start = db.j(src["blocks_json"], [])
            for b in start:
                b["id"] = blocks.new_block(b["type"])["id"]
    page_id = db.run("INSERT INTO pages (site_id, slug, title, position, blocks_json, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
                     site_id, slug, title, position, db.dumps(start), db.now())
    db.log("Added page", title, user, site_id)
    return {"id": page_id, "url": f"/sites/{site_id}/builder/{page_id}"}


@app.patch("/api/pages/{page_id}")
async def api_save_page(request: Request, page_id: int):
    """Save a page: its blocks (from the builder) and/or its title, address, SEO and menu setting."""
    user = api_user(request)
    page = db.one("SELECT * FROM pages WHERE id = ?", page_id)
    if not page:
        raise HTTPException(404)
    body = await request.json()
    changes = {}
    if "blocks" in body:
        clean = []
        for b in body["blocks"]:
            if b.get("type") in blocks.BLOCKS:
                data = b.get("data") or {}
                widget = widgets.get(b["type"])
                if widget:                      # widgets check their settings against their Pydantic model
                    data = widget.clean_config(data if isinstance(data, dict) else {})
                elif isinstance(data, dict):    # Custom HTML and rich text: cleaned through the allowlist (sanitize.py)
                    data = sanitize.clean_block_data(b["type"], data)
                clean.append({"id": str(b.get("id") or blocks.new_block(b["type"])["id"])[:16], "type": b["type"], "data": data})
        changes["blocks_json"] = db.dumps(clean)
    for key in ("title", "seo_title", "seo_description"):
        if key in body:
            changes[key] = str(body[key])[:300]
    if "in_menu" in body:
        changes["in_menu"] = 1 if body["in_menu"] else 0
    if "slug" in body and page["slug"] != "index":
        slug = posts.safe_page_slug(sites.slugify(body["slug"])) if sites.slugify(body["slug"]) else ""
        if not slug or db.one("SELECT id FROM pages WHERE site_id = ? AND slug = ? AND id != ?", page["site_id"], slug, page_id):
            raise sites.SiteError("That page address is empty or already used.")
        changes["slug"] = slug
    if changes:
        revisions.snapshot(page, user)          # the page as it was, once per editing session (revisions.py)
        changes["updated_at"] = db.now()
        db.run(f"UPDATE pages SET {', '.join(k + ' = ?' for k in changes)} WHERE id = ?", *changes.values(), page_id)
        db.run("UPDATE sites SET updated_at = ? WHERE id = ?", db.now(), page["site_id"])
        if "blocks_json" not in changes or len(changes) > 2:
            db.log("Edited page", page["title"], user, page["site_id"])
    return {"ok": True, "slug": changes.get("slug", page["slug"])}


@app.get("/api/pages/{page_id}/revisions")
def api_page_revisions(request: Request, page_id: int):
    """Earlier versions of a page, newest first."""
    api_user(request)
    if not db.one("SELECT id FROM pages WHERE id = ?", page_id):
        raise HTTPException(404)
    return {"revisions": revisions.for_page(page_id)}


@app.post("/api/pages/{page_id}/revisions/{revision_id}/restore")
def api_restore_page_revision(request: Request, page_id: int, revision_id: int):
    """Put an earlier version back. The current version is kept as a revision first, so this can be undone."""
    user = api_user(request)
    page = db.one("SELECT * FROM pages WHERE id = ?", page_id)
    if not page:
        raise HTTPException(404)
    rev = revisions.restore(page, revision_id, user)
    if not rev:
        raise HTTPException(404, "That version isn't there any more.")
    fresh = db.one("SELECT * FROM pages WHERE id = ?", page_id)
    return {"ok": True, "blocks": db.j(fresh["blocks_json"], []), "title": fresh["title"],
            "seo_title": fresh["seo_title"], "seo_description": fresh["seo_description"]}


@app.post("/api/sites/{site_id}/pages/order")
async def api_page_order(request: Request, site_id: int):
    api_user(request)
    for position, page_id in enumerate((await request.json()).get("ids", [])):
        db.run("UPDATE pages SET position = ? WHERE id = ? AND site_id = ?", position, int(page_id), site_id)
    return {"ok": True}


@app.delete("/api/pages/{page_id}")
def api_delete_page(request: Request, page_id: int):
    user = api_user(request)
    page = db.one("SELECT * FROM pages WHERE id = ?", page_id)
    if page and page["slug"] == "index":
        raise sites.SiteError("The home page can't be deleted.")
    if page:
        db.run("DELETE FROM pages WHERE id = ?", page_id)
        db.run("DELETE FROM page_revisions WHERE page_id = ?", page_id)
        db.log("Deleted page", page["title"], user, page["site_id"])
    return {"ok": True}


# ---------------------------------------------------------------------------------------------- Media Center

def media_json(m, usage=None):
    variants = db.j(m["variants_json"])
    thumb = variants.get("320") or m["stored"]
    return {**{k: m[k] for k in ("id", "site_id", "folder_id", "kind", "filename", "mime", "bytes", "width", "height", "title",
                                 "alt", "caption", "category", "tags", "created_at")},
            "url": f"/m/{m['site_id']}/{m['stored']}", "thumb": f"/m/{m['site_id']}/{thumb}", "size": media.human_size(m["bytes"]),
            "variants": {w: f"/m/{m['site_id']}/{n}" for w, n in variants.items()}, "used": usage or []}


def media_usage(site_id, media_id):
    """Where a file is used: pages (blocks), business data, galleries and portfolio items."""
    used, mid = [], str(media_id)
    for p in db.all("SELECT title, blocks_json FROM pages WHERE site_id = ?", site_id):
        if re.search(r'"(image|before|after|video)":\s*"?' + mid + r'"?[,}]', p["blocks_json"]):
            used.append(f"Page: {p['title']}")
    if re.search(r'"(logo_media|image_media|photo_media)":\s*"?' + mid + r'"?[,}]', sites.get(site_id)["profile_json"]):
        used.append("Business data")
    used += [f"Gallery: {a['name']}" for a in db.all("SELECT DISTINCT a.name FROM album_items ai JOIN albums a ON a.id = ai.album_id WHERE ai.media_id = ?", media_id)]
    used += [f"Portfolio: {p['title']}" for p in db.all("SELECT title FROM portfolio_items WHERE ? IN (cover_media_id, before_media_id, after_media_id)", media_id)]
    return used


@app.get("/sites/{site_id}/media", response_class=HTMLResponse)
def media_page(request: Request, site_id: int):
    user = page_user(request)
    site = site_or_404(site_id)
    folders = db.all("SELECT f.*, (SELECT COUNT(*) FROM media m WHERE m.folder_id = f.id) AS n FROM media_folders f WHERE site_id = ? ORDER BY name", site_id)
    return show("media.html", request, user, site=site, section="media", folders=folders,
                total=db.one("SELECT COUNT(*) AS n FROM media WHERE site_id = ?", site_id)["n"], storage=media.storage_bytes(site_id),
                max_mb=config.MAX_UPLOAD_MB)


@app.get("/api/sites/{site_id}/media")
def api_list_media(request: Request, site_id: int, folder: str = "", kind: str = "", q: str = "", tag: str = "", category: str = ""):
    api_user(request)
    sql, params = "SELECT * FROM media WHERE site_id = ?", [site_id]
    if folder == "none":
        sql += " AND folder_id IS NULL"
    elif folder.isdigit():
        sql += " AND folder_id = ?"
        params.append(int(folder))
    if kind == "image":
        sql += " AND kind IN ('image', 'svg')"
    elif kind:
        sql += " AND kind = ?"
        params.append(kind)
    if q:
        sql += " AND (filename LIKE ? OR title LIKE ? OR alt LIKE ? OR tags LIKE ? OR category LIKE ?)"
        params += [f"%{q}%"] * 5
    if tag:
        sql += " AND (',' || REPLACE(tags, ', ', ',') || ',') LIKE ?"
        params.append(f"%,{tag},%")
    if category:
        sql += " AND category = ?"
        params.append(category)
    rows = db.all(sql + " ORDER BY id DESC", *params)
    tags = sorted({t.strip() for r in db.all("SELECT tags FROM media WHERE site_id = ?", site_id) for t in r["tags"].split(",") if t.strip()})
    cats = [r["category"] for r in db.all("SELECT DISTINCT category FROM media WHERE site_id = ? AND category != '' ORDER BY category", site_id)]
    return {"items": [media_json(m) for m in rows], "tags": tags, "categories": cats}


@app.get("/api/media/{media_id}")
def api_media_one(request: Request, media_id: int):
    api_user(request)
    m = db.one("SELECT * FROM media WHERE id = ?", media_id)
    if not m:
        raise HTTPException(404)
    return media_json(m, media_usage(m["site_id"], media_id))


@app.post("/api/sites/{site_id}/media")
async def api_upload(request: Request, site_id: int, files: list[UploadFile] = File(...), folder_id: str = Form("")):
    """Upload one or many files. Each is checked, compressed and resized (media.py). Problems are reported per file."""
    user = api_user(request)
    sites.get(site_id)
    folder = int(folder_id) if folder_id.isdigit() else None
    done, errors = [], []
    for f in files:
        try:
            done.append(media_json(media.save_upload(site_id, f.filename or "file", await f.read(), folder, user)))
        except media.MediaError as error:
            errors.append(str(error))
    return {"items": done, "errors": errors}


@app.patch("/api/media/{media_id}")
async def api_media_update(request: Request, media_id: int):
    api_user(request)
    body = await request.json()
    allowed = {k: str(v)[:500] for k, v in body.items() if k in ("title", "alt", "caption", "category", "tags")}
    if "tags" in allowed:
        allowed["tags"] = ", ".join(sorted({t.strip().lower() for t in allowed["tags"].split(",") if t.strip()}))
    if "folder_id" in body:
        allowed["folder_id"] = int(body["folder_id"]) if str(body["folder_id"]).isdigit() else None
    if allowed:
        db.run(f"UPDATE media SET {', '.join(k + ' = ?' for k in allowed)} WHERE id = ?", *allowed.values(), media_id)
    return media_json(db.one("SELECT * FROM media WHERE id = ?", media_id))


@app.post("/api/media/{media_id}/edit")
async def api_media_edit(request: Request, media_id: int):
    """Crop, resize or rotate a photo."""
    api_user(request)
    body = await request.json()
    item = media.edit_image(media_id, crop=body.get("crop"), width=body.get("width"), rotate=body.get("rotate", 0))
    return media_json(item)


@app.post("/api/sites/{site_id}/media/bulk")
async def api_media_bulk(request: Request, site_id: int):
    """Do one thing to many files: move, tag, set category or delete."""
    user = api_user(request)
    body = await request.json()
    ids = [int(i) for i in body.get("ids", []) if str(i).isdigit()]
    rows = [m for m in (db.one("SELECT * FROM media WHERE id = ? AND site_id = ?", i, site_id) for i in ids) if m]
    action = body.get("action")
    for m in rows:
        if action == "delete":
            media.delete(m["id"])
        elif action == "move":
            db.run("UPDATE media SET folder_id = ? WHERE id = ?", int(body["folder_id"]) if str(body.get("folder_id")).isdigit() else None, m["id"])
        elif action == "tag":
            tags = {t.strip().lower() for t in (m["tags"] + "," + body.get("value", "")).split(",") if t.strip()}
            db.run("UPDATE media SET tags = ? WHERE id = ?", ", ".join(sorted(tags)), m["id"])
        elif action == "category":
            db.run("UPDATE media SET category = ? WHERE id = ?", body.get("value", "")[:80], m["id"])
    db.log(f"Media: {action}", f"{len(rows)} file(s)", user, site_id)
    return {"ok": True, "count": len(rows)}


@app.delete("/api/media/{media_id}")
def api_media_delete(request: Request, media_id: int):
    user = api_user(request)
    m = db.one("SELECT * FROM media WHERE id = ?", media_id)
    if m:
        media.delete(media_id)
        db.log("Deleted file", m["filename"], user, m["site_id"])
    return {"ok": True}


@app.post("/api/sites/{site_id}/folders")
async def api_new_folder(request: Request, site_id: int):
    api_user(request)
    name = ((await request.json()).get("name") or "").strip()[:60]
    if not name:
        raise sites.SiteError("Folders need a name.")
    return {"id": db.run("INSERT INTO media_folders (site_id, name) VALUES (?, ?)", site_id, name)}


@app.patch("/api/folders/{folder_id}")
async def api_rename_folder(request: Request, folder_id: int):
    api_user(request)
    name = ((await request.json()).get("name") or "").strip()[:60]
    if name:
        db.run("UPDATE media_folders SET name = ? WHERE id = ?", name, folder_id)
    return {"ok": True}


@app.delete("/api/folders/{folder_id}")
def api_delete_folder(request: Request, folder_id: int):
    api_user(request)
    db.run("UPDATE media SET folder_id = NULL WHERE folder_id = ?", folder_id)       # files are kept, just unfiled
    db.run("DELETE FROM media_folders WHERE id = ?", folder_id)
    return {"ok": True}


@app.get("/m/{site_id}/{name}")
def media_file(site_id: int, name: str):
    """Media files, for the CMS and its previews. Names carry a random part, so they can't be guessed."""
    if not re.fullmatch(r"[a-z0-9.-]+", name):
        raise HTTPException(404)
    path = config.MEDIA_DIR / str(site_id) / name
    if not path.is_file():
        raise HTTPException(404)
    headers = {"Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff"}
    if name.endswith(".svg"):
        headers["Content-Security-Policy"] = "script-src 'none'"
    return FileResponse(path, headers=headers)


# ---------------------------------------------------------------------------------------------- galleries

@app.get("/sites/{site_id}/galleries", response_class=HTMLResponse)
def galleries_page(request: Request, site_id: int, album: int = 0):
    user = page_user(request)
    site = site_or_404(site_id)
    albums = db.all("SELECT a.*, (SELECT COUNT(*) FROM album_items i WHERE i.album_id = a.id) AS n, "
                    "(SELECT m.id FROM album_items i JOIN media m ON m.id = i.media_id WHERE i.album_id = a.id ORDER BY i.position LIMIT 1) AS cover "
                    "FROM albums a WHERE site_id = ? ORDER BY a.name", site_id)
    for a in albums:
        m = db.one("SELECT * FROM media WHERE id = ?", a["cover"]) if a["cover"] else None
        a["cover_url"] = media_json(m)["thumb"] if m else ""
    current = next((a for a in albums if a["id"] == album), None)
    items = []
    if current:
        for row in db.all("SELECT ai.id AS item_id, ai.caption AS item_caption, m.* FROM album_items ai JOIN media m ON m.id = ai.media_id "
                          "WHERE ai.album_id = ? ORDER BY ai.position, ai.id", album):
            items.append({**media_json(row), "item_id": row["item_id"], "item_caption": row["item_caption"]})
    return show("galleries.html", request, user, site=site, section="galleries", albums=albums, current=current, items=items)


@app.post("/api/sites/{site_id}/albums")
async def api_new_album(request: Request, site_id: int):
    user = api_user(request)
    body = await request.json()
    name = (body.get("name") or "").strip()[:80] or "New album"
    album_id = db.run("INSERT INTO albums (site_id, name, category, layout, created_at) VALUES (?, ?, ?, ?, ?)",
                      site_id, name, body.get("category", ""), body.get("layout", "masonry"), db.now())
    db.log("Created gallery", name, user, site_id)
    return {"id": album_id}


@app.patch("/api/albums/{album_id}")
async def api_update_album(request: Request, album_id: int):
    api_user(request)
    body = await request.json()
    allowed = {k: str(v)[:500] for k, v in body.items() if k in ("name", "category", "layout", "description")}
    if allowed:
        db.run(f"UPDATE albums SET {', '.join(k + ' = ?' for k in allowed)} WHERE id = ?", *allowed.values(), album_id)
    if "order" in body:
        for position, item_id in enumerate(body["order"]):
            db.run("UPDATE album_items SET position = ? WHERE id = ? AND album_id = ?", position, int(item_id), album_id)
    return {"ok": True}


@app.delete("/api/albums/{album_id}")
def api_delete_album(request: Request, album_id: int):
    api_user(request)
    db.run("DELETE FROM album_items WHERE album_id = ?", album_id)
    db.run("DELETE FROM albums WHERE id = ?", album_id)
    return {"ok": True}


@app.post("/api/albums/{album_id}/items")
async def api_add_album_items(request: Request, album_id: int):
    api_user(request)
    album = db.one("SELECT * FROM albums WHERE id = ?", album_id)
    start = db.one("SELECT COALESCE(MAX(position), 0) + 1 AS n FROM album_items WHERE album_id = ?", album_id)["n"]
    for n, media_id in enumerate((await request.json()).get("media_ids", [])):
        if db.one("SELECT id FROM media WHERE id = ? AND site_id = ?", int(media_id), album["site_id"]):
            db.run("INSERT INTO album_items (album_id, media_id, position) VALUES (?, ?, ?)", album_id, int(media_id), start + n)
    return {"ok": True}


@app.patch("/api/album-items/{item_id}")
async def api_update_album_item(request: Request, item_id: int):
    api_user(request)
    db.run("UPDATE album_items SET caption = ? WHERE id = ?", str((await request.json()).get("caption", ""))[:300], item_id)
    return {"ok": True}


@app.delete("/api/album-items/{item_id}")
def api_remove_album_item(request: Request, item_id: int):
    api_user(request)
    db.run("DELETE FROM album_items WHERE id = ?", item_id)
    return {"ok": True}


# ---------------------------------------------------------------------------------------------- portfolio

@app.get("/sites/{site_id}/portfolio", response_class=HTMLResponse)
def portfolio_page(request: Request, site_id: int):
    user = page_user(request)
    site = site_or_404(site_id)
    items = db.all("SELECT * FROM portfolio_items WHERE site_id = ? ORDER BY position, id", site_id)
    for it in items:
        for key in ("cover_media_id", "before_media_id", "after_media_id"):
            m = db.one("SELECT * FROM media WHERE id = ?", it[key]) if it[key] else None
            it[key.replace("_media_id", "_thumb")] = media_json(m)["thumb"] if m else ""
    albums = db.all("SELECT id, name FROM albums WHERE site_id = ? ORDER BY name", site_id)
    cats = sorted({i["category"] for i in items if i["category"]})
    return show("portfolio.html", request, user, site=site, section="portfolio", items=items, albums=albums, categories=cats)


PORTFOLIO_FIELDS = ("title", "category", "tags", "summary", "body", "cover_media_id", "before_media_id", "after_media_id", "album_id")


@app.post("/api/sites/{site_id}/portfolio")
async def api_save_portfolio(request: Request, site_id: int):
    """Create a portfolio item, or update one when the body has an id."""
    user = api_user(request)
    body = await request.json()
    values = {}
    for k in PORTFOLIO_FIELDS:
        if k in body:
            v = body[k]
            values[k] = (int(v) if str(v).isdigit() else None) if k.endswith("_id") else str(v or "")[:5000]
    if not (values.get("title") or "").strip() and not body.get("id"):
        raise sites.SiteError("Projects need a title.")
    if body.get("id"):
        db.run(f"UPDATE portfolio_items SET {', '.join(k + ' = ?' for k in values)} WHERE id = ? AND site_id = ?",
               *values.values(), int(body["id"]), site_id)
        item_id = int(body["id"])
    else:
        position = db.one("SELECT COALESCE(MAX(position), 0) + 1 AS n FROM portfolio_items WHERE site_id = ?", site_id)["n"]
        cols = list(values) + ["site_id", "position", "created_at"]
        item_id = db.run(f"INSERT INTO portfolio_items ({', '.join(cols)}) VALUES ({', '.join('?' * len(cols))})",
                         *values.values(), site_id, position, db.now())
        db.log("Added project", values.get("title", ""), user, site_id)
    db.run("UPDATE sites SET updated_at = ? WHERE id = ?", db.now(), site_id)
    return {"id": item_id}


@app.post("/api/sites/{site_id}/portfolio/order")
async def api_portfolio_order(request: Request, site_id: int):
    api_user(request)
    for position, item_id in enumerate((await request.json()).get("ids", [])):
        db.run("UPDATE portfolio_items SET position = ? WHERE id = ? AND site_id = ?", position, int(item_id), site_id)
    return {"ok": True}


@app.delete("/api/portfolio/{item_id}")
def api_delete_portfolio(request: Request, item_id: int):
    api_user(request)
    db.run("DELETE FROM portfolio_items WHERE id = ?", item_id)
    return {"ok": True}


# ---------------------------------------------------------------------------------------------- header and footer

@app.get("/sites/{site_id}/chrome", response_class=HTMLResponse)
def chrome_page(request: Request, site_id: int):
    """Header & footer: the site's own header and footer, used on every page."""
    user = page_user(request)
    site = site_or_404(site_id)
    c = chrome.load(site_id)
    logo = db.one("SELECT * FROM media WHERE id = ?", c.header.logo_media) if c.header.logo_media else None
    pages = db.all("SELECT slug, title FROM pages WHERE site_id = ? ORDER BY position, id", site_id)
    return show("chrome.html", request, user, site=site, section="chrome", data=c.model_dump(), pages=pages,
                networks=chrome.NETWORKS, can_edit=theme_mod.can_change_brand(user, site_id), logo_thumb=media_json(logo)["thumb"] if logo else "")


@app.get("/api/sites/{site_id}/chrome")
def api_chrome(request: Request, site_id: int):
    api_user(request)
    sites.get(site_id)
    return chrome.load(site_id).model_dump()


@app.put("/api/sites/{site_id}/chrome")
async def api_save_chrome(request: Request, site_id: int):
    user = api_user(request)
    sites.get(site_id)
    if not theme_mod.can_change_brand(user, site_id):
        raise HTTPException(403, "The brand is locked on this site: only its owners and CMS admins can change the header and footer.")
    return chrome.save(site_id, await request.json(), user).model_dump()


# ---------------------------------------------------------------------------------------------- blog posts

def post_json(row):
    m = db.one("SELECT * FROM media WHERE id = ?", row["cover_media_id"]) if row["cover_media_id"] else None
    return {**row, "cover_thumb": media_json(m)["thumb"] if m else "", "live": posts.is_live(row),
            "date": posts.nice_date(row["published_at"]), "file": posts.file_name(row)}


@app.get("/sites/{site_id}/posts", response_class=HTMLResponse)
def posts_page(request: Request, site_id: int):
    user = page_user(request)
    site = site_or_404(site_id)
    rows = [post_json(r) for r in posts.all_for(site_id)]
    blog_on = any(b.get("type") == "blog" for p in db.all("SELECT blocks_json FROM pages WHERE site_id = ?", site_id) for b in db.j(p["blocks_json"], []))
    return show("posts.html", request, user, site=site, section="posts", rows=rows, blog_on=blog_on)


@app.get("/sites/{site_id}/posts/{post_id}", response_class=HTMLResponse)
def post_edit_page(request: Request, site_id: int, post_id: str):
    """The post editor. post_id "new" starts a blank post."""
    user = page_user(request)
    site = site_or_404(site_id)
    row = None
    if post_id != "new":
        row = posts.get(int(post_id) if post_id.isdigit() else 0, site_id)
        if not row:
            raise HTTPException(404, "No such post.")
    tags = sorted({t for r in posts.all_for(site_id) for t in posts.tags_of(r)}, key=str.lower)
    return show("post_edit.html", request, user, site=site, section="posts", post=post_json(row) if row else None, all_tags=tags)


@app.get("/api/sites/{site_id}/posts")
def api_posts(request: Request, site_id: int):
    api_user(request)
    sites.get(site_id)
    return {"posts": [post_json(r) for r in posts.all_for(site_id)]}


@app.post("/api/sites/{site_id}/posts")
async def api_new_post(request: Request, site_id: int):
    user = api_user(request)
    sites.get(site_id)
    return post_json(posts.save(site_id, await request.json(), user))


@app.patch("/api/sites/{site_id}/posts/{post_id}")
async def api_save_post(request: Request, site_id: int, post_id: int):
    user = api_user(request)
    sites.get(site_id)
    return post_json(posts.save(site_id, await request.json(), user, post_id))


@app.delete("/api/sites/{site_id}/posts/{post_id}")
def api_delete_post(request: Request, site_id: int, post_id: int):
    user = api_user(request)
    posts.delete(post_id, site_id, user)
    return {"ok": True}


# ---------------------------------------------------------------------------------------------- leads

@app.get("/sites/{site_id}/leads", response_class=HTMLResponse)
def leads_page(request: Request, site_id: int):
    user = page_user(request)
    site = site_or_404(site_id)
    rows = db.all("SELECT * FROM leads WHERE site_id = ? ORDER BY id DESC", site_id)
    counts = {r["lead_id"]: r["n"] for r in db.all("SELECT lead_id, COUNT(*) AS n FROM lead_files WHERE site_id = ? GROUP BY lead_id", site_id)}
    for r in rows:
        r["summary"] = lead_forms.summary(db.j(r["data_json"]) or {})
        r["files"] = counts.get(r["id"], 0)
    return show("leads.html", request, user, site=site, section="leads", rows=rows, mail_on=mail.configured(),
                notify=notify.status(site_id), can_manage=members.can_manage(user, site_id))


@app.get("/api/sites/{site_id}/lead-email")
def lead_email_get(request: Request, site_id: int):
    api_user(request)
    site_or_404(site_id)
    return notify.status(site_id)


@app.put("/api/sites/{site_id}/lead-email")
async def lead_email_put(request: Request, site_id: int):
    user = api_user(request)
    site_or_404(site_id)
    try:
        value = notify.save(site_id, await request.json(), user)
    except PermissionError as error:
        return JSONResponse({"error": str(error)}, status_code=403)
    except (notify.NotifyError, ValueError) as error:
        return JSONResponse({"error": str(error)}, status_code=400)
    return {"settings": value.model_dump(), **{k: v for k, v in notify.status(site_id).items() if k != "settings"}}


def lead_or_404(site_id, lead_id):
    lead = db.one("SELECT * FROM leads WHERE id = ? AND site_id = ?", lead_id, site_id)
    if not lead:
        raise HTTPException(404, "That message doesn't exist.")
    return lead


@app.get("/sites/{site_id}/leads/{lead_id}", response_class=HTMLResponse)
def lead_page(request: Request, site_id: int, lead_id: int):
    """One lead with every answer and its uploaded files."""
    user = page_user(request)
    site = site_or_404(site_id)
    lead = lead_or_404(site_id, lead_id)
    files = lead_forms.files_for(lead_id)
    names = {f["name"] for f in files}
    data = db.j(lead["data_json"]) or {}
    return show("lead.html", request, user, site=site, section="leads", lead=lead, data=data, files=files, file_names=names,
                summary=lead_forms.summary(data), mail_on=mail.configured())


@app.get("/sites/{site_id}/leads/{lead_id}/files/{file_id}")
def lead_file(request: Request, site_id: int, lead_id: int, file_id: int):
    """A file a visitor attached to a form: only for signed-in CMS users, always as a download, never run as a page."""
    page_user(request)
    lead_or_404(site_id, lead_id)
    row = db.one("SELECT * FROM lead_files WHERE id = ? AND lead_id = ? AND site_id = ?", file_id, lead_id, site_id)
    path = lead_forms.file_path(row) if row else None
    if not row or not path.is_file():
        raise HTTPException(404, "That file isn't there any more.")
    ext = path.suffix.lower()
    inline = ext in (".jpg", ".jpeg", ".png", ".gif", ".webp", ".pdf") and request.query_params.get("view") == "1"
    return FileResponse(path, media_type=lead_forms.MIME.get(ext, "application/octet-stream"), filename=row["name"],
                        content_disposition_type="inline" if inline else "attachment",
                        headers={"X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
                                 "Cache-Control": "private, no-store"})


@app.patch("/api/leads/{lead_id}")
async def api_lead_status(request: Request, lead_id: int):
    api_user(request)
    status = (await request.json()).get("status")
    if status in ("new", "contacted", "won", "lost"):
        db.run("UPDATE leads SET status = ? WHERE id = ?", status, lead_id)
    return {"ok": True}


@app.delete("/api/leads/{lead_id}")
def api_lead_delete(request: Request, lead_id: int):
    api_user(request)
    lead_forms.delete_files(lead_id)
    db.run("DELETE FROM leads WHERE id = ?", lead_id)
    return {"ok": True}


@app.get("/sites/{site_id}/leads.csv")
def leads_csv(request: Request, site_id: int):
    page_user(request)
    site = site_or_404(site_id)
    rows = db.all("SELECT * FROM leads WHERE site_id = ? ORDER BY id", site_id)
    keys = []
    for r in rows:                                     # answers in form order, first seen first
        for k in db.j(r["data_json"]) or {}:
            if k not in keys:
                keys.append(k)
    files = {}
    for f in db.all("SELECT lead_id, name FROM lead_files WHERE site_id = ? ORDER BY id", site_id):
        files.setdefault(f["lead_id"], []).append(f["name"])
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(["date", "status", "page"] + keys + (["files"] if files else []))

    def safe(v):                                       # a cell starting with = + - @ would run as a formula in Excel
        v = str(v if v is not None else "")
        return "'" + v if v[:1] in ("=", "+", "-", "@", "\t", "\r") else v
    for r in rows:
        data = db.j(r["data_json"]) or {}
        writer.writerow([r["created_at"], r["status"], r["page"]] + [safe(data.get(k, "")) for k in keys]
                        + ([safe("; ".join(files.get(r["id"], [])))] if files else []))
    return Response(out.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="{site["subdomain"]}-leads.csv"'})


# ---------------------------------------------------------------------------------------------- deployments and export

@app.get("/sites/{site_id}/deployments", response_class=HTMLResponse)
def deployments_page(request: Request, site_id: int):
    user = page_user(request)
    site = site_or_404(site_id)
    builds = db.all("SELECT b.*, u.name AS user_name FROM builds b LEFT JOIN users u ON u.id = b.user_id WHERE site_id = ? ORDER BY b.id DESC LIMIT 30", site_id)
    backups = db.all("SELECT * FROM backups WHERE site_id = ? ORDER BY id DESC LIMIT 20", site_id)
    return show("deployments.html", request, user, site=site, section="deployments", builds=builds, backups=backups,
                health=sites.health(site_id))


@app.get("/sites/{site_id}/export", response_class=HTMLResponse)
def export_page(request: Request, site_id: int):
    user = page_user(request)
    site = site_or_404(site_id)
    return show("export.html", request, user, site=site, section="export", parts=sites.EXPORT_PARTS)


@app.post("/sites/{site_id}/export")
async def export_download(request: Request, site_id: int):
    user = page_user(request, admin=True)
    form = await request.form()
    file = sites.export(site_id, form.getlist("parts"), user)
    return FileResponse(file, filename=file.name, media_type="application/zip")


# ---------------------------------------------------------------------------------------------- site settings

@app.get("/sites/{site_id}/settings", response_class=HTMLResponse)
def settings_page(request: Request, site_id: int):
    user = page_user(request)
    site = site_or_404(site_id)
    return show("settings.html", request, user, site=site, section="settings", theme=db.j(site["theme_json"]),
                template=templates.get(site["template_id"]), templates_list=templates.all_templates(), fonts=templates.FONTS,
                members=members.for_site(site_id), member_roles=members.ROLES, my_role=members.role_on(user, site_id),
                can_manage=members.can_manage(user, site_id), sec=security.load(site_id).model_dump(),
                theme_editor=theme_editor_data(user, site), site_domains=domains.for_site(site_id),
                all_users=db.all("SELECT id, name, email, role FROM users ORDER BY name") if user["role"] == "admin" else [])


@app.get("/api/sites/{site_id}/domains")
def api_domains(request: Request, site_id: int):
    api_user(request)
    site_or_404(site_id)
    return {"domains": domains.for_site(site_id)}


@app.post("/api/sites/{site_id}/domains")
async def api_add_domain(request: Request, site_id: int):
    user = api_user(request)
    site_or_404(site_id)
    body = await request.json()
    try:
        name = domains.add(site_id, str(body.get("domain") or ""), user)
    except PermissionError as error:
        return JSONResponse({"error": str(error)}, status_code=403)
    except domains.DomainError as error:
        return JSONResponse({"error": str(error)}, status_code=400)
    return {"domain": name, "domains": domains.for_site(site_id)}


@app.delete("/api/sites/{site_id}/domains/{name}")
def api_remove_domain(request: Request, site_id: int, name: str):
    user = api_user(request)
    site_or_404(site_id)
    try:
        domains.remove(site_id, name, user)
    except PermissionError as error:
        return JSONResponse({"error": str(error)}, status_code=403)
    except domains.DomainError as error:
        return JSONResponse({"error": str(error)}, status_code=404)
    return {"domains": domains.for_site(site_id)}


# ---------------------------------------------------------------------------------------------- widget settings (per site)

def widget_or_404(name):
    widget = widgets.get(name)
    if not widget or not widget.settings:
        raise HTTPException(404, "No such widget.")
    return widget


@app.get("/sites/{site_id}/widgets/{name}", response_class=HTMLResponse)
def widget_settings_page(request: Request, site_id: int, name: str):
    """A widget's site settings, e.g. /sites/1/widgets/store: the site's Shopify connection and the how-to guide."""
    user = page_user(request)
    site = site_or_404(site_id)
    widget = widget_or_404(name)
    used_on = [p for p in db.all("SELECT id, title, slug, blocks_json FROM pages WHERE site_id = ? ORDER BY position, id", site_id)
               if name in widgets.used_in(db.j(p["blocks_json"], []))]
    return show(f"widget_{name}.html", request, user, site=site, section=f"widget:{name}", widget=widget,
                settings=widgets.load_settings(site_id, name).model_dump(), can_edit=widgets.can_edit_settings(user, name, site_id),
                used_on=used_on)


@app.get("/api/sites/{site_id}/widgets/{name}/settings")
def api_widget_settings(request: Request, site_id: int, name: str):
    api_user(request)
    site_or_404(site_id)
    return {"settings": widgets.load_settings(site_id, widget_or_404(name).name).model_dump()}


@app.put("/api/sites/{site_id}/widgets/{name}/settings")
async def api_save_widget_settings(request: Request, site_id: int, name: str):
    user = api_user(request)
    site_or_404(site_id)
    widget = widget_or_404(name)
    if not widgets.can_edit_settings(user, name, site_id):
        raise HTTPException(403, f"Only admins and this site's owners can change the {widget.label} settings.")
    body = await request.json()
    value = widgets.save_settings(site_id, name, body if isinstance(body, dict) else {}, user)
    return {"ok": True, "settings": value.model_dump()}


@app.get("/static/widgets/{name}/{path:path}")
def widget_asset(name: str, path: str):
    """A widget's CSS, JavaScript and pictures, for the CMS preview (deployments get their own copies)."""
    if name not in widgets.REGISTRY or not re.fullmatch(r"[a-z0-9_./-]+", path) or ".." in path:
        raise HTTPException(404)
    base = (widgets.STATIC_DIR / name).resolve()
    file = (base / path).resolve()
    if base not in file.parents or not file.is_file():
        raise HTTPException(404)
    return FileResponse(file, media_type=mimetypes.guess_type(file.name)[0], headers={"Cache-Control": "no-cache"})


# ---------------------------------------------------------------------------------------------- site security (CSP)

@app.get("/api/sites/{site_id}/security")
def api_security(request: Request, site_id: int):
    api_user(request)
    site = site_or_404(site_id)
    findings = security.audit(site)
    return {"settings": security.load(site_id).model_dump(), "findings": findings, "blocked_hosts": security.blocked_hosts(findings)}


@app.put("/api/sites/{site_id}/security")
async def api_save_security(request: Request, site_id: int):
    user = api_user(request)
    site_or_404(site_id)
    if not members.can_manage(user, site_id):
        raise HTTPException(403, "Only admins and this site's owners can change its security settings.")
    body = await request.json()
    return {"ok": True, "settings": security.save(site_id, body if isinstance(body, dict) else {}, user).model_dump()}


# ---------------------------------------------------------------------------------------------- site members

@app.get("/api/sites/{site_id}/members")
def api_members(request: Request, site_id: int):
    api_user(request)
    site_or_404(site_id)
    return {"members": members.for_site(site_id)}


@app.put("/api/sites/{site_id}/members/{user_id}")
async def api_set_member(request: Request, site_id: int, user_id: int):
    user = api_user(request, admin=True)
    site_or_404(site_id)
    members.set_member(site_id, user_id, (await request.json()).get("role", "editor"), user)
    return {"members": members.for_site(site_id)}


@app.delete("/api/sites/{site_id}/members/{user_id}")
def api_remove_member(request: Request, site_id: int, user_id: int):
    user = api_user(request, admin=True)
    site_or_404(site_id)
    members.remove_member(site_id, user_id, user)
    return {"members": members.for_site(site_id)}


# ---------------------------------------------------------------------------------------------- templates

@app.get("/templates", response_class=HTMLResponse)
def templates_page(request: Request):
    user = page_user(request)
    return show("templates.html", request, user, items=templates.all_templates())


@app.get("/templates/{template_id}", response_class=HTMLResponse)
def template_detail(request: Request, template_id: str, file: str = "style.css"):
    user = page_user(request)
    try:
        meta = templates.get(template_id)
    except templates.TemplateError:
        raise HTTPException(404)
    files = templates.files(template_id)
    file = file if file in files else files[0]
    return show("template.html", request, user, meta=meta, files=files, file=file, code=templates.read_file(template_id, file),
                fonts=templates.FONTS, used_by=db.all("SELECT id, name FROM sites WHERE template_id = ?", template_id))


@app.get("/templates/{template_id}/preview", response_class=HTMLResponse)
def template_preview(request: Request, template_id: str):
    page_user(request)
    return HTMLResponse(render.preview_template(template_id))


@app.get("/t/{template_id}/{path:path}")
def template_asset(template_id: str, path: str):
    """A template's CSS, JavaScript and pictures, for previews."""
    if not re.fullmatch(r"[a-z0-9-]+", template_id):
        raise HTTPException(404)
    base = templates.current_dir(template_id).resolve()
    file = (base / path).resolve()
    if base not in file.parents or not file.is_file() or file.suffix == ".j2":
        raise HTTPException(404)
    return FileResponse(file, headers={"Cache-Control": "no-cache"})


@app.post("/api/templates")
async def api_new_template(request: Request):
    user = api_user(request, admin=True)
    body = await request.json()
    meta = templates.create((body.get("name") or "").strip() or "New template", body.get("from") or None)
    db.log("Created template", meta["name"], user)
    return {"id": meta["id"], "url": f"/templates/{meta['id']}"}


@app.patch("/api/templates/{template_id}")
async def api_update_template(request: Request, template_id: str):
    api_user(request, admin=True)
    body = await request.json()
    keep = {k: body[k] for k in ("name", "group", "for", "description", "colors", "style", "fonts") if k in body}
    return templates.update_meta(template_id, **keep)


@app.put("/api/templates/{template_id}/file")
async def api_save_template_file(request: Request, template_id: str):
    user = api_user(request, admin=True)
    body = await request.json()
    templates.write_file(template_id, body["path"], body["text"])
    db.log("Edited template file", f"{template_id}/{body['path']}", user)
    return {"ok": True}


@app.post("/api/templates/{template_id}/versions")
async def api_save_template_version(request: Request, template_id: str):
    user = api_user(request, admin=True)
    n = templates.save_version(template_id, (await request.json()).get("note", ""))
    db.log("Saved template version", f"{template_id} v{n}", user)
    return {"version": n}


@app.post("/api/templates/{template_id}/versions/{n}/restore")
def api_restore_template_version(request: Request, template_id: str, n: int):
    user = api_user(request, admin=True)
    templates.restore_version(template_id, n)
    db.log("Restored template version", f"{template_id} v{n}", user)
    return {"ok": True}


@app.delete("/api/templates/{template_id}")
def api_delete_template(request: Request, template_id: str):
    user = api_user(request, admin=True)
    templates.delete(template_id)
    db.log("Deleted template", template_id, user)
    return {"ok": True}


# ---------------------------------------------------------------------------------------------- users

@app.get("/users", response_class=HTMLResponse)
def users_page(request: Request):
    user = page_user(request, admin=True)
    rows = db.all("SELECT id, email, name, role, created_at FROM users ORDER BY name")
    for r in rows:
        r["sites"] = members.for_user(r["id"])
    return show("users.html", request, user, rows=rows, roles=auth.ROLES)


@app.post("/api/users")
async def api_new_user(request: Request):
    user = api_user(request, admin=True)
    body = await request.json()
    try:
        auth.create_user(body.get("email", ""), body.get("name", ""), body.get("password", ""), body.get("role", "editor"))
    except Exception as error:
        raise sites.SiteError("Couldn't add that person: " + ("that email is already used." if "UNIQUE" in str(error) else str(error)))
    db.log("Added user", body.get("email", ""), user)
    return {"ok": True}


@app.patch("/api/users/{user_id}")
async def api_update_user(request: Request, user_id: int):
    user = api_user(request, admin=True)
    body = await request.json()
    if body.get("role") in auth.ROLES:
        if user_id == user["id"] and body["role"] != "admin":
            raise sites.SiteError("You can't remove your own admin role.")
        db.run("UPDATE users SET role = ? WHERE id = ?", body["role"], user_id)
    if body.get("password"):
        if len(body["password"]) < 8:
            raise sites.SiteError("Passwords need at least 8 characters.")
        db.run("UPDATE users SET password_hash = ? WHERE id = ?", auth.hash_password(body["password"]), user_id)
    return {"ok": True}


@app.delete("/api/users/{user_id}")
def api_delete_user(request: Request, user_id: int):
    user = api_user(request, admin=True)
    if user_id == user["id"]:
        raise sites.SiteError("You can't delete yourself.")
    db.run("DELETE FROM users WHERE id = ?", user_id)
    db.run("DELETE FROM site_members WHERE user_id = ?", user_id)
    return {"ok": True}


# ---------------------------------------------------------------------------------------------- the public Launch page

@app.options("/api/launch")
def launch_preflight(request: Request):
    return Response(headers=_cors(request))


@app.post("/api/launch")
async def api_launch(request: Request):
    """
    Receives the business profile from the public website's Launch Sequence (launch.js, LAUNCH_ENDPOINT) and creates
    and deploys the site in one go. Only the addresses in config.LAUNCH_ORIGINS may call it.
    """
    headers = _cors(request)
    if not headers:
        return JSONResponse({"error": "Not allowed from this website."}, status_code=403)
    try:
        site = sites.import_launch_profile(await request.json())
    except (sites.SiteError, ValueError) as error:
        return JSONResponse({"error": str(error)}, status_code=400, headers=headers)
    return JSONResponse({"admin_url": f"{config.PUBLIC_URL}/sites/{site['id']}", "site_url": config.site_url(site["subdomain"])}, headers=headers)


def _cors(request):
    origin = request.headers.get("origin", "")
    if origin not in config.LAUNCH_ORIGINS:
        return {}
    return {"Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type", "Vary": "Origin"}


# ---------------------------------------------------------------------------------------------- stock photo library

stock_routes.install(app, page_user=page_user, api_user=api_user, show=show, current_user=current_user, media_json=media_json)


# ---------------------------------------------------------------------------------------------- static files

@app.get("/static/fonts/{name}")
def font_file(name: str):
    """The self-hosted fonts (templates.FONTS) for the CMS preview; deployments get their own copies."""
    path = templates.FONTS_DIR / name
    if not re.fullmatch(r"[a-z0-9-]+\.woff2", name) or not path.is_file():
        raise HTTPException(404)
    return FileResponse(path, media_type="font/woff2", headers={"Cache-Control": "public, max-age=604800"})


@app.get("/static/{name}")
def static_file(name: str):
    path = STATIC_DIR / name
    if not re.fullmatch(r"[a-z0-9.-]+", name) or not path.is_file():
        raise HTTPException(404)
    return FileResponse(path, media_type=mimetypes.guess_type(name)[0], headers={"Cache-Control": "no-cache"})


# Signed login cookies (added last so it wraps everything). same_site="lax" stops other sites from using the cookie;
# https_only (the Secure flag) keeps it off plain http. On by default when TENSHI_PUBLIC_URL is https (the server);
# local http development and the tests run without it. Force with TENSHI_SECURE_COOKIES=1 or 0.
app.add_middleware(SessionMiddleware, secret_key=config.secret_key(), session_cookie="tenshi_cms", same_site="lax",
                   max_age=60 * 60 * 24 * 14, https_only=config.SECURE_COOKIES)
