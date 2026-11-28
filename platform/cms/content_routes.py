"""
content_routes.py: screens and API for custom content types (content_types.py), the WordPress import (wp_import.py)
and comment settings (widgets/comments.py). app.py calls install(...) once.

    GET  /sites/{id}/content                  the site's content types       POST /api/sites/{id}/content-types
    PUT  /api/content-types/{t}               change a type                  DELETE /api/content-types/{t}
    GET  /sites/{id}/content/{t}              a type's entries               POST /api/content-types/{t}/entries
    PUT  /api/entries/{e}   DELETE /api/entries/{e} (to the Trash)            POST /api/content-types/{t}/order {ids}
    GET  /sites/{id}/import                   Import from WordPress
    POST /api/sites/{id}/import/wordpress/check   (what's in the file)       POST /api/sites/{id}/import/wordpress
    GET|PUT /api/sites/{id}/comments          comments on or off
"""

from __future__ import annotations

from fastapi import File, Form, HTTPException, Request, UploadFile
from fastapi.responses import HTMLResponse, JSONResponse

from . import content_types as ct, db, members, wp_import
from .widgets import comments as comments_mod


def install(app, *, page_user, api_user, show, site_or_404):

    for err in (ct.ContentError, wp_import.ImportError_):
        @app.exception_handler(err)
        async def _friendly(request, error):
            return JSONResponse({"error": str(error)}, status_code=400)

    def editor_only(user, site_id):
        if members.role_on(user, site_id) in members.WRITERS:
            raise HTTPException(403, "Only editors, owners and admins can do this.")

    @app.get("/sites/{site_id}/content", response_class=HTMLResponse)
    def content_page(request: Request, site_id: int):
        user = page_user(request)
        site = site_or_404(site_id)
        return show("content.html", request, user, site=site, section="content", types=ct.types(site_id),
                    starters=ct.STARTERS, field_types=ct.FIELD_TYPES)

    @app.post("/api/sites/{site_id}/content-types")
    async def api_new_type(request: Request, site_id: int):
        user = api_user(request)
        site_or_404(site_id)
        editor_only(user, site_id)
        return ct.save_type(site_id, await request.json(), user)

    @app.put("/api/content-types/{type_id}")
    async def api_save_type(request: Request, type_id: int):
        user = api_user(request)
        t = ct.get_type(type_id)
        editor_only(user, t["site_id"])
        return ct.save_type(t["site_id"], await request.json(), user, type_id)

    @app.delete("/api/content-types/{type_id}")
    def api_delete_type(request: Request, type_id: int):
        user = api_user(request)
        t = ct.get_type(type_id)
        editor_only(user, t["site_id"])
        ct.delete_type(type_id, t["site_id"], user)
        return {"ok": True}

    @app.get("/sites/{site_id}/content/{type_id}", response_class=HTMLResponse)
    def entries_page(request: Request, site_id: int, type_id: int):
        user = page_user(request)
        site = site_or_404(site_id)
        try:
            t = ct.get_type(type_id, site_id)
        except ct.ContentError:
            raise HTTPException(404, "That content type doesn't exist.")
        rows = ct.entries(type_id)
        list_fields = [f for f in t["fields"] if f.get("show", True) and f["type"] not in ("media", "rich", "textarea")][:4]
        return show("content_entries.html", request, user, site=site, section="content", ctype=t, rows=rows, list_fields=list_fields)

    @app.post("/api/content-types/{type_id}/entries")
    async def api_new_entry(request: Request, type_id: int):
        user = api_user(request)
        t = ct.get_type(type_id)
        editor_only(user, t["site_id"])
        return ct.save_entry(type_id, t["site_id"], await request.json(), user)

    @app.put("/api/entries/{entry_id}")
    async def api_save_entry(request: Request, entry_id: int):
        user = api_user(request)
        e = ct.get_entry(entry_id)
        editor_only(user, e["site_id"])
        return ct.save_entry(e["type_id"], e["site_id"], await request.json(), user, entry_id)

    @app.delete("/api/entries/{entry_id}")
    def api_delete_entry(request: Request, entry_id: int):
        user = api_user(request)
        e = ct.get_entry(entry_id)
        editor_only(user, e["site_id"])
        ct.delete_entry(entry_id, e["site_id"], user)
        return {"ok": True}

    @app.post("/api/content-types/{type_id}/order")
    async def api_order_entries(request: Request, type_id: int):
        user = api_user(request)
        t = ct.get_type(type_id)
        editor_only(user, t["site_id"])
        ct.reorder(type_id, t["site_id"], (await request.json()).get("ids") or [])
        return {"ok": True}

    # ------------------------------------------------------------------------------------------ WordPress import
    @app.get("/sites/{site_id}/import", response_class=HTMLResponse)
    def import_page(request: Request, site_id: int):
        user = page_user(request)
        site = site_or_404(site_id)
        return show("import.html", request, user, site=site, section="import", status=wp_import.status(site_id))

    async def _read(file: UploadFile) -> bytes:
        data = await file.read(wp_import.MAX_BYTES + 1)
        if len(data) > wp_import.MAX_BYTES:
            raise wp_import.ImportError_("That file is over 40 MB.")
        return data

    @app.post("/api/sites/{site_id}/import/wordpress/check")
    async def api_wp_check(request: Request, site_id: int, file: UploadFile = File(...)):
        user = api_user(request)
        site_or_404(site_id)
        editor_only(user, site_id)
        return wp_import.summary(wp_import.parse(await _read(file)))

    @app.post("/api/sites/{site_id}/import/wordpress")
    async def api_wp_import(request: Request, site_id: int, file: UploadFile = File(...), pages: str = Form("1"),
                            drafts: str = Form("1"), redirects: str = Form("1"), images: str = Form("1")):
        user = api_user(request)
        site_or_404(site_id)
        editor_only(user, site_id)
        data = await _read(file)
        return wp_import.run(site_id, data, user, pages_too=pages == "1", drafts_too=drafts == "1",
                             make_redirects=redirects == "1", download_images=images == "1")

    # ------------------------------------------------------------------------------------------ comments
    @app.get("/api/sites/{site_id}/comments")
    def api_comment_settings(request: Request, site_id: int):
        api_user(request)
        return comments_mod.settings(site_id)

    @app.put("/api/sites/{site_id}/comments")
    async def api_save_comment_settings(request: Request, site_id: int):
        user = api_user(request)
        site_or_404(site_id)
        editor_only(user, site_id)
        return comments_mod.save_settings(site_id, await request.json(), user)
