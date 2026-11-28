"""
extras_routes.py: screens and API for the WordPress/Joomla/Drupal-style features. app.py calls install(...) once.

    (every request)                        access.py: people only open the sites they belong to; authors and contributors
                                           only Blog posts and the Media Center
    GET  /sites/{id}/trash                 Trash (trash.py)
    POST /api/sites/{id}/trash/{t}/restore   DELETE /api/sites/{id}/trash/{t}   DELETE /api/sites/{id}/trash (empty it)
    GET  /sites/{id}/redirects             Redirects and the "Not found" list (redirects.py)
    POST /api/sites/{id}/redirects   DELETE /api/sites/{id}/redirects/{r}   DELETE /api/sites/{id}/not-found
    GET  /account                          My account: password, two-step sign-in (account.py)
    POST /api/account/password   /api/account/2fa/start   /api/account/2fa/confirm   /api/account/2fa/off
    GET|POST /login/code                   the second step of signing in
    GET|POST /forgot   GET|POST /reset     forgotten passwords
    POST /api/users/{id}/reset-2fa         admins: switch off someone's two-step sign-in (they lost their phone)
    GET  /sites/{id}/languages             Languages (languages.py)
    PUT  /api/sites/{id}/languages         POST /api/pages/{id}/translate {lang}
    POST /api/scheduler/run                admins: publish anything due now (scheduler.py; it also runs every minute)
"""

from __future__ import annotations

import time

from fastapi import Form, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse

from . import access, account, auth, db, languages, mail, members, redirects, scheduler, trash

PENDING_SECONDS = 600


def install(app, *, ui, page_user, api_user, show, current_user, site_or_404, client_ip):

    for err in (trash.TrashError, redirects.RedirectError, account.AccountError, languages.LanguageError):
        @app.exception_handler(err)
        async def _friendly(request, error):
            return JSONResponse({"error": str(error)}, status_code=400)

    # ------------------------------------------------------------------------------------------ who may open what
    @app.middleware("http")
    async def site_access(request: Request, call_next):
        path = request.url.path
        if path.startswith(("/sites/", "/api/", "/backups/")) and "session" in request.scope:
            uid = request.session.get("uid")
            user = db.one("SELECT * FROM users WHERE id = ?", uid) if uid else None
            if user and not access.allowed(user, path, request.method):
                if path.startswith("/api/"):
                    return JSONResponse({"error": "You don't have access to this on this site."}, status_code=403)
                sid = access.site_for(path)
                if sid and members.role_on(user, sid) in members.WRITERS and request.method == "GET":
                    return RedirectResponse(access.first_page_for(user, sid), 303)
                return HTMLResponse("<!doctype html><meta charset=utf-8><title>No access</title><body style='font:18px system-ui;"
                                    "display:grid;place-items:center;min-height:80vh'><div><h1>No access</h1><p>You don't have access to "
                                    "this site. <a href='/'>Back to the dashboard</a></p></div>", status_code=403)
        return await call_next(request)

    def manager_or_editor(user, site_id):
        role = members.role_on(user, site_id)
        if role in members.WRITERS:
            raise HTTPException(403, "Only editors, owners and admins can do this.")
        return role

    # ------------------------------------------------------------------------------------------ Trash
    @app.get("/sites/{site_id}/trash", response_class=HTMLResponse)
    def trash_page(request: Request, site_id: int):
        user = page_user(request)
        site = site_or_404(site_id)
        return show("trash.html", request, user, site=site, section="trash", items=trash.items(site_id), days=trash.DAYS)

    @app.post("/api/sites/{site_id}/trash/{trash_id}/restore")
    def api_trash_restore(request: Request, site_id: int, trash_id: int):
        user = api_user(request)
        manager_or_editor(user, site_id)
        return trash.restore(trash_id, site_id, user)

    @app.delete("/api/sites/{site_id}/trash/{trash_id}")
    def api_trash_purge(request: Request, site_id: int, trash_id: int):
        user = api_user(request)
        manager_or_editor(user, site_id)
        trash.purge(trash_id, site_id, user)
        return {"ok": True}

    @app.delete("/api/sites/{site_id}/trash")
    def api_trash_empty(request: Request, site_id: int):
        user = api_user(request)
        manager_or_editor(user, site_id)
        return {"ok": True, "count": trash.empty(site_id, user)}

    # ------------------------------------------------------------------------------------------ Redirects
    @app.get("/sites/{site_id}/redirects", response_class=HTMLResponse)
    def redirects_page(request: Request, site_id: int):
        user = page_user(request)
        site = site_or_404(site_id)
        pages = db.all("SELECT slug, title FROM pages WHERE site_id = ? ORDER BY position", site_id)
        return show("redirects.html", request, user, site=site, section="redirects", rules=redirects.all_for(site_id),
                    missing=redirects.missing(site_id), pages=pages)

    @app.get("/api/sites/{site_id}/redirects")
    def api_redirects(request: Request, site_id: int):
        api_user(request)
        return {"redirects": redirects.all_for(site_id), "not_found": redirects.missing(site_id)}

    @app.post("/api/sites/{site_id}/redirects")
    async def api_add_redirect(request: Request, site_id: int):
        user = api_user(request)
        site_or_404(site_id)
        body = await request.json()
        return redirects.add(site_id, body.get("from_path", ""), body.get("to_url", ""), body.get("code", 301), body.get("note", ""), user)

    @app.delete("/api/sites/{site_id}/redirects/{redirect_id}")
    def api_remove_redirect(request: Request, site_id: int, redirect_id: int):
        user = api_user(request)
        redirects.remove(site_id, redirect_id, user)
        return {"ok": True}

    @app.delete("/api/sites/{site_id}/not-found")
    def api_clear_not_found(request: Request, site_id: int):
        api_user(request)
        redirects.forget_missing(site_id)
        return {"ok": True}

    # ------------------------------------------------------------------------------------------ My account
    @app.get("/account", response_class=HTMLResponse)
    def account_page(request: Request):
        user = page_user(request)
        if user["role"] == "demo":
            raise HTTPException(403)
        return show("account.html", request, user, section="account", tfa_on=account.enabled(user), backup_left=account.backup_left(user))

    @app.post("/api/account/password")
    async def api_change_password(request: Request):
        user = api_user(request)
        if user["role"] == "demo":
            raise HTTPException(403)
        body = await request.json()
        account.change_password(user, body.get("current", ""), body.get("new", ""))
        return {"ok": True}

    @app.post("/api/account/2fa/start")
    def api_tfa_start(request: Request):
        user = api_user(request)
        if user["role"] == "demo":
            raise HTTPException(403)
        secret = account.new_secret()
        link = account.uri(secret, user["email"])
        return {"secret": secret, "uri": link, "qr": account.qr_svg(link)}

    @app.post("/api/account/2fa/confirm")
    async def api_tfa_confirm(request: Request):
        user = api_user(request)
        if user["role"] == "demo":
            raise HTTPException(403)
        body = await request.json()
        secret = str(body.get("secret") or "").strip().upper()
        if not 16 <= len(secret) <= 64 or not all(c in "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567" for c in secret):
            raise account.AccountError("Start the setup again.")
        return {"backup_codes": account.turn_on(user["id"], secret, body.get("code", ""))}

    @app.post("/api/account/2fa/off")
    async def api_tfa_off(request: Request):
        user = api_user(request)
        body = await request.json()
        if not auth.check_password(str(body.get("password") or ""), user["password_hash"]):
            raise account.AccountError("That password isn't right.")
        account.turn_off(user["id"], user)
        return {"ok": True}

    @app.post("/api/users/{user_id}/reset-2fa")
    def api_admin_reset_tfa(request: Request, user_id: int):
        user = api_user(request, admin=True)
        account.turn_off(user_id, user)
        return {"ok": True}

    # ------------------------------------------------------------------------------------------ signing in: step two
    def pending(request):
        uid, at = request.session.get("pending_uid"), request.session.get("pending_at", 0)
        if not uid or time.time() - at > PENDING_SECONDS:
            return None
        return db.one("SELECT * FROM users WHERE id = ?", uid)

    @app.get("/login/code", response_class=HTMLResponse)
    def login_code_page(request: Request):
        if not pending(request):
            return RedirectResponse("/login", 303)
        return HTMLResponse(ui.get_template("login_code.html").render(error=None))

    @app.post("/login/code")
    def login_code_submit(request: Request, code: str = Form("")):
        user = pending(request)
        if not user:
            return RedirectResponse("/login", 303)
        ip, key = client_ip(request), "2fa:" + user["email"]
        wait = auth.locked_for(ip, key)
        if wait:
            return HTMLResponse(ui.get_template("login_code.html").render(error=f"Too many wrong codes. Try again in {max(1, (wait + 59) // 60)} minutes."),
                                status_code=429, headers={"Retry-After": str(wait)})
        if not account.verify_second_step(user, code):
            auth.note_failure(ip, key)
            return HTMLResponse(ui.get_template("login_code.html").render(error="That code isn't right. Type the newest one."), status_code=401)
        auth.clear_failures(ip, key)
        target = request.session.get("pending_next") or "/"
        request.session.clear()
        request.session["uid"] = user["id"]
        return RedirectResponse(target if target.startswith("/") and not target.startswith("//") else "/", 303)

    # ------------------------------------------------------------------------------------------ forgotten passwords
    @app.get("/forgot", response_class=HTMLResponse)
    def forgot_page(request: Request):
        return HTMLResponse(ui.get_template("forgot.html").render(sent=False))

    @app.post("/forgot")
    def forgot_submit(request: Request, email: str = Form("")):
        ip = client_ip(request)
        if auth.locked_for(ip, "reset:" + ip):
            return HTMLResponse(ui.get_template("forgot.html").render(sent=True, email=email, mail_on=mail.configured()), status_code=429)
        auth.note_failure(ip, "reset:" + ip)            # at most a few links per hour from one place
        account.start_reset(email)
        return HTMLResponse(ui.get_template("forgot.html").render(sent=True, email=email[:200], mail_on=mail.configured()))

    @app.get("/reset", response_class=HTMLResponse)
    def reset_page(request: Request, token: str = ""):
        user = account.reset_user(token)
        if not user:
            return HTMLResponse(ui.get_template("reset.html").render(ok=False, error="This link has expired or was already used."), status_code=400)
        return HTMLResponse(ui.get_template("reset.html").render(ok=True, token=token, email=user["email"], error=None))

    @app.post("/reset")
    def reset_submit(request: Request, token: str = Form(""), password: str = Form("")):
        try:
            account.finish_reset(token, password)
        except account.AccountError as error:
            user = account.reset_user(token)
            return HTMLResponse(ui.get_template("reset.html").render(ok=bool(user), token=token, email=user["email"] if user else "", error=str(error)), status_code=400)
        return RedirectResponse("/login", 303)

    # ------------------------------------------------------------------------------------------ Languages
    @app.get("/sites/{site_id}/languages", response_class=HTMLResponse)
    def languages_page(request: Request, site_id: int):
        user = page_user(request)
        site = site_or_404(site_id)
        pages = db.all("SELECT id, slug, title, lang, translation_of FROM pages WHERE site_id = ? ORDER BY position, id", site_id)
        return show("languages.html", request, user, site=site, section="languages", names=languages.NAMES, main=languages.main(site),
                    extra=languages.extra(site_id), main_pages=[p for p in pages if not p["lang"]],
                    translations={(p["translation_of"], p["lang"]): p for p in pages if p["lang"] and p["translation_of"]})

    @app.put("/api/sites/{site_id}/languages")
    async def api_save_languages(request: Request, site_id: int):
        user = api_user(request)
        site = site_or_404(site_id)
        manager_or_editor(user, site_id)
        body = await request.json()
        return {"extra": languages.save_extra(site, body.get("extra") or [], user)}

    @app.post("/api/pages/{page_id}/translate")
    async def api_translate_page(request: Request, page_id: int):
        user = api_user(request)
        body = await request.json()
        page = languages.translate(page_id, str(body.get("lang") or ""), user)
        return {"id": page["id"], "slug": page["slug"], "url": f"/sites/{page['site_id']}/builder/{page['id']}"}

    @app.post("/api/scheduler/run")
    def api_scheduler_run(request: Request):
        api_user(request, admin=True)
        return {"published": scheduler.run_once()}
