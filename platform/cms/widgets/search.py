"""
widgets/search.py: the Site search block. Visitors type and see matching pages, blog posts and content entries at once.
When any page has a Search block, each deployment gets search.json: the title, address and words of every published
page, post and entry (made here in extra_files). The block's script searches it in the browser: nothing is sent anywhere.
"""

from __future__ import annotations

import json
import re

from markupsafe import Markup, escape
from pydantic import BaseModel, ConfigDict, Field

from . import Widget, WidgetContext, block_uid, register
from .. import content_types as ct, db, posts as posts_mod

TAG = re.compile(r"<[^>]+>")


class SearchConfig(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
    heading: str = Field("Search", max_length=120, json_schema_extra={"label": "Heading (empty = none)"})
    placeholder: str = Field("What are you looking for?", max_length=80, json_schema_extra={"label": "Text in the box"})
    limit: int = Field(20, ge=5, le=100, json_schema_extra={"label": "Show at most (results)"})


def _words(value, out):
    if isinstance(value, str):
        if not re.fullmatch(r"\d+|https?://\S+|#[0-9a-fA-F]{3,8}|[a-z_]+", value):
            out.append(TAG.sub(" ", value))
    elif isinstance(value, dict):
        for k, v in value.items():
            if k not in ("id", "layout", "style", "width", "image", "video", "album", "link", "button_link", "type_id"):
                _words(v, out)
    elif isinstance(value, list):
        for v in value:
            _words(v, out)


def _text(parts, n=3000):
    return re.sub(r"\s+", " ", " ".join(parts)).strip()[:n]


def index(site_id, pages) -> list[dict]:
    out = []
    for p in pages:
        parts = []
        _words(db.j(p.get("blocks_json"), []), parts)
        out.append({"t": p["title"], "s": p["slug"], "k": "Page", "x": _text([p.get("seo_description") or ""] + parts)})
    for r in posts_mod.published(site_id):
        out.append({"t": r["title"], "s": posts_mod.PREFIX + r["slug"], "k": "Blog", "x": _text([r["excerpt"], TAG.sub(" ", r["body"]), r["tags"]])})
    for t in ct.types(site_id):
        if t["detail_pages"]:
            for e in ct.entries(t["id"], published_only=True):
                parts = []
                _words(e["data"], parts)
                out.append({"t": e["title"], "s": ct.page_slug(t, e), "k": t["singular"], "x": _text(parts, 1500)})
    return out


def extra_files(renderer, pages) -> dict[str, str]:
    site_id = renderer.site.get("id")
    if not site_id or not any('"type": "search"' in (p.get("blocks_json") or "") for p in pages):
        return {}
    return {"search.json": json.dumps(index(site_id, pages), ensure_ascii=False, separators=(",", ":"))}


def render(block: dict, ctx: WidgetContext) -> Markup:
    from . import get
    cfg: SearchConfig = get("search").config_for(block.get("data"))
    uid = block_uid(block)
    preview = ctx.mode == "preview"
    base = f"/sites/{ctx.site.get('id')}/preview/" if preview and ctx.site.get("id") else ""
    src = base + "search.json"
    return Markup(f'<section class="band tw-mod tw-search-block" aria-labelledby="se-{uid}-h"><div class="wrap narrow">'
                  + (f'<h2 id="se-{uid}-h" data-edit="heading">{escape(cfg.heading)}</h2>' if cfg.heading else "")
                  + f'<form class="tw-se-form" role="search" data-tw-site-search data-src="{escape(src)}" data-base="{escape(base)}" '
                  f'data-preview="{1 if preview else 0}" data-limit="{cfg.limit}" onsubmit="return false">'
                  f'<label class="tw-sr" for="se-{uid}-q">Search this site</label>'
                  f'<input id="se-{uid}-q" type="search" name="q" autocomplete="off" placeholder="{escape(cfg.placeholder)}">'
                  f'</form><p class="tw-se-count" aria-live="polite"></p><ol class="tw-se-results"></ol></div></section>')


register(Widget(
    name="search", label="Site search", about="A search box: visitors find any page, blog post or entry on the site as they type.",
    config=SearchConfig, render=render, assets=["search.css", "search.js"], requires=["modkit"], extra_files=extra_files,
))
