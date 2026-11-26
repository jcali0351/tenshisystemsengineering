"""
stock_routes.py: the screens and API of the Stock Photo Library (stock.py). app.py calls install(...) once.

    GET    /stock                              the library (any signed-in user; admins also get upload/edit/delete)
    GET    /api/stock?q=&category=&tag=&license=&page=   search
    GET    /api/stock/{id}                     one photo
    POST   /api/stock                          upload (admins): files=…, category, tags, license, creator, source, source_url
    PATCH  /api/stock/{id}                     edit (admins)
    DELETE /api/stock/{id}                     delete (admins)
    POST   /api/stock/bulk                     {ids, action: tag|untag|category|license|delete, value} (admins)
    POST   /api/sites/{site}/stock/{id}        copy into that site's Media Center; returns the media item (site members)
    GET    /stock/f/{name}  /stock/t/{name}    the photo / its preview (signed-in only; ?download=1 to save it)
"""

import re

from fastapi import File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse

from . import db, members, stock


def may_use_site(user, site_id):
    """Admins: every site. Site owners/editors: their sites. CMS editors who belong to no site keep their usual access."""
    if user["role"] == "admin" or members.role_on(user, site_id):
        return True
    return not db.one("SELECT 1 AS x FROM site_members WHERE user_id = ?", user["id"])


def install(app, *, page_user, api_user, show, current_user, media_json):

    @app.exception_handler(stock.StockError)
    async def stock_errors(request, error):
        return JSONResponse({"error": str(error)}, status_code=400)

    def manager(user):
        return user["role"] == "admin"

    @app.get("/stock", response_class=HTMLResponse)
    def stock_page(request: Request):
        user = page_user(request)
        my_sites = [s for s in db.all("SELECT id, name FROM sites ORDER BY name") if may_use_site(user, s["id"])]
        return show("stock.html", request, user, section="stock", can_manage=manager(user), categories=stock.categories(),
                    my_sites=my_sites, licenses=stock.LICENSES, max_mb=stock.MAX_MB, seed=stock.SEED_STATUS)

    @app.get("/api/stock")
    def api_stock(request: Request, q: str = "", category: str = "", tag: str = "", license: str = "", page: int = 1, per: int = 60):
        user = api_user(request)
        res = stock.search(q.strip()[:100], category.strip()[:60], tag.strip()[:40], license, page, per)
        res["items"] = [stock.to_json(r, manager(user)) for r in res["items"]]
        res["categories"] = stock.categories()
        res["seed"] = stock.SEED_STATUS
        return res

    @app.get("/api/stock/{stock_id}")
    def api_stock_one(request: Request, stock_id: int):
        user = api_user(request)
        return stock.to_json(stock.get(stock_id), manager(user))

    @app.post("/api/stock")
    async def api_stock_upload(request: Request, files: list[UploadFile] = File(...), category: str = Form(""), tags: str = Form(""),
                               license: str = Form(""), creator: str = Form(""), source: str = Form(""), source_url: str = Form("")):
        user = api_user(request, admin=True)
        done, errors = [], []
        for f in files[:50]:
            data = await f.read(stock.MAX_MB * 1024 * 1024 + 1)
            try:
                row, dup = stock.upload(f.filename or "photo", data, user, category, tags, license, creator, source, source_url)
                done.append({**stock.to_json(row, True), "duplicate": dup})
            except stock.StockError as error:
                errors.append(str(error))
        if len(files) > 50:
            errors.append("Only the first 50 files were uploaded. Add the rest in another go.")
        return {"items": done, "errors": errors}

    @app.patch("/api/stock/{stock_id}")
    async def api_stock_update(request: Request, stock_id: int):
        user = api_user(request, admin=True)
        return stock.to_json(stock.update(stock_id, await request.json(), user), True)

    @app.delete("/api/stock/{stock_id}")
    def api_stock_delete(request: Request, stock_id: int):
        user = api_user(request, admin=True)
        stock.delete(stock_id, user)
        return {"ok": True}

    @app.post("/api/stock/bulk")
    async def api_stock_bulk(request: Request):
        user = api_user(request, admin=True)
        body = await request.json()
        n = stock.bulk(body.get("ids") or [], body.get("action", ""), str(body.get("value") or ""), user)
        return {"ok": True, "count": n}

    @app.post("/api/sites/{site_id}/stock/{stock_id}")
    def api_stock_use(request: Request, site_id: int, stock_id: int):
        user = api_user(request)
        if not db.one("SELECT id FROM sites WHERE id = ?", site_id):
            raise HTTPException(404, "That site doesn't exist.")
        if not may_use_site(user, site_id):
            raise HTTPException(403, "You can only add photos to your own sites.")
        item = stock.copy_to_site(stock_id, site_id, user)
        return media_json(item)

    def _file(request, name, sub, download=False):
        if not current_user(request):
            raise HTTPException(403)
        if not re.fullmatch(r"[a-z0-9][a-z0-9.-]*\.webp", name):
            raise HTTPException(404)
        path = stock.folder() / sub / name
        if not path.is_file():
            raise HTTPException(404)
        headers = {"Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff"}
        if download:
            headers["Content-Disposition"] = f'attachment; filename="{name}"'
        return FileResponse(path, media_type="image/webp", headers=headers)

    @app.get("/stock/f/{name}")
    def stock_file(request: Request, name: str, download: int = 0):
        return _file(request, name, "", bool(download))

    @app.get("/stock/t/{name}")
    def stock_thumb(request: Request, name: str):
        return _file(request, name, "thumbs")
