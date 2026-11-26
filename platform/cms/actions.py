"""
actions.py: what a live (or previewed) client site can ask the CMS to do for a widget, at <site>/__w/<widget>/<action>.

Widgets list their endpoints in Widget.actions = {"rsvp": handler, ...}. A request names the block it's for
(_block = "<page>/<block id>"); the handler gets that block's settings as they were PUBLISHED (the deployment's
.tenshi-blocks.json, written by render.build_to) on the live site, or as they are now (the database) in the CMS
preview. So a visitor can't send settings of their own (a capacity, a price, an email address): only the site owner's.

Every POST counts against the same per-visitor and per-site limits as the contact forms (ratelimit.py), and a
filled-in honeypot box (_hp) is accepted and thrown away, so robots learn nothing.

Handlers: handler(req: ActionRequest) -> (status, payload) where payload is a dict (sent as JSON) or a Response.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

from pydantic import BaseModel

from . import db

SPECS = ".tenshi-blocks.json"


@dataclass
class ActionRequest:
    site: dict
    widget: "widgets.Widget"
    cfg: BaseModel | None             # the block's settings (None if the action doesn't need a block)
    block_key: str                    # "<page>/<uid>"
    form: dict                        # text fields of a POST (files are ignored)
    query: dict
    ip: str
    method: str
    mode: str                         # hosted | preview
    settings: BaseModel | None = None
    extra: dict = field(default_factory=dict)


def write_specs(out_dir: Path, specs: dict) -> None:
    (Path(out_dir) / SPECS).write_text(json.dumps(specs, ensure_ascii=False), encoding="utf-8")


def published_block(folder: Path | None, key: str) -> dict | None:
    if not folder:
        return None
    try:
        return json.loads((Path(folder) / SPECS).read_text(encoding="utf-8")).get(key)
    except (OSError, ValueError):
        return None


def current_block(site_id: int, key: str) -> dict | None:
    """The block as it is in the CMS now (preview), found by "<page>/<uid>"."""
    from . import widgets
    slug, _, uid = (key or "").partition("/")
    if not slug or not uid:
        return None
    page = db.one("SELECT blocks_json FROM pages WHERE site_id = ? AND slug = ?", site_id, slug)
    for b in (db.j(page["blocks_json"], []) if page else []):
        if isinstance(b, dict) and widgets.block_uid(b) == uid:
            return {"type": b.get("type"), "data": b.get("data") or {}}
    return None


def find_block(site: dict, folder, key: str, mode: str) -> dict | None:
    return published_block(folder, key) if mode == "hosted" else current_block(site["id"], key)


async def dispatch(request, site: dict, folder, widget_name: str, action: str, mode: str, ip: str):
    """Shared by serve_site (live) and the CMS preview route."""
    from fastapi.responses import JSONResponse, Response
    from . import ratelimit, widgets
    w = widgets.get(widget_name)
    handler = (w.actions or {}).get(action) if w else None
    if not handler:
        return JSONResponse({"ok": False, "error": "Not found"}, status_code=404)
    form = {}
    if request.method == "POST":
        try:
            size = int(request.headers.get("content-length") or 0)
        except ValueError:
            size = 0
        if size > 64 * 1024:
            return JSONResponse({"ok": False, "error": "That's too much to send."}, status_code=413)
        ctype = request.headers.get("content-type", "")
        if ctype.startswith("application/json"):
            try:
                body = await request.json()
            except ValueError:
                body = {}
            form = {str(k): str(v)[:5000] for k, v in (body or {}).items()} if isinstance(body, dict) else {}
        else:
            data = await request.form()
            form = {k: str(v)[:5000] for k, v in data.items() if isinstance(v, str)}
        if form.get("_hp"):
            return JSONResponse({"ok": True})
        if mode == "hosted" and not ratelimit.allow_form_post(site["id"], ip):
            return JSONResponse({"ok": False, "error": "Too many messages from here. Please try again in a few minutes."},
                                status_code=429, headers={"Retry-After": "600"})
    elif request.method != "GET":
        return JSONResponse({"ok": False}, status_code=405)
    query = dict(request.query_params)
    key = form.get("_block") or query.get("_block") or ""
    cfg = None
    if key:
        block = find_block(site, folder, key, mode)
        if not block or block.get("type") != w.name:
            return JSONResponse({"ok": False, "error": "This form isn't on the site any more. Reload the page."}, status_code=404)
        cfg = w.config_for(block.get("data"))
    req = ActionRequest(site=site, widget=w, cfg=cfg, block_key=key, form=form, query=query, ip=ip, method=request.method,
                        mode=mode, settings=widgets.load_settings(site["id"], w.name) if w.settings else None)
    status, payload = handler(req)
    if isinstance(payload, Response):
        return payload
    return JSONResponse(payload, status_code=status, headers={"Cache-Control": "no-store"})
