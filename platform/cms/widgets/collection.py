"""
widgets/collection.py: the Collection block, which shows the entries of one of the site's own content types
(content_types.py) as cards, a list or a table, with filter chips for "One of a list" fields marked as filters and an
optional search box; and the hidden "entry" widget that draws one entry on its own page (<type>-<entry>.html) when the
type has "Each entry gets its own page" switched on.
"""

from __future__ import annotations

from typing import Literal

from markupsafe import Markup, escape
from pydantic import BaseModel, ConfigDict, Field

from . import Widget, WidgetContext, block_uid, register
from .. import content_types as ct, db


class CollectionConfig(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
    type_id: int = Field(0, ge=0, json_schema_extra={"label": "Content type", "type": "collection"})
    heading: str = Field("", max_length=120, json_schema_extra={"label": "Heading (empty = the type's name)"})
    intro: str = Field("", max_length=400, json_schema_extra={"label": "Intro", "type": "textarea"})
    layout: Literal["cards", "list", "table"] = Field("cards", json_schema_extra={"label": "Show as", "options": [
        ["cards", "Cards with pictures"], ["list", "A list"], ["table", "A table"]]})
    columns: Literal["2", "3", "4"] = Field("3", json_schema_extra={"label": "Columns (cards)", "options": [["2", "2"], ["3", "3"], ["4", "4"]]})
    sort: Literal["manual", "newest", "title"] = Field("manual", json_schema_extra={"label": "Order", "options": [
        ["manual", "As arranged"], ["newest", "Newest first"], ["title", "A to Z"]]})
    limit: int = Field(0, ge=0, le=500, json_schema_extra={"label": "Show at most (0 = all)"})
    filters: bool = Field(True, json_schema_extra={"label": "Filter buttons (for list fields marked as filters)"})
    search: bool = Field(False, json_schema_extra={"label": "Search box"})


class EntryConfig(BaseModel):
    model_config = ConfigDict(extra="ignore")
    entry_id: int = 0


def _value(f, v, ctx, full=False) -> str:
    if v in ("", None):
        return ""
    t = f["type"]
    if t == "checkbox":
        return "Yes" if v else ""
    if t == "rich":
        from ..render import clean_html
        return str(clean_html(v)) if full else ""
    if t == "link":
        return f'<a href="{escape(ctx.link(v))}">{escape(v if v.startswith("http") else "Open")}</a>'
    if t == "email":
        return f'<a href="mailto:{escape(v)}">{escape(v)}</a>'
    if t == "media":
        return ""
    if t == "textarea":
        from . import paragraphs
        return str(paragraphs(v)) if full else escape(str(v)[:160])
    return str(escape(v))


def _image(t, e, ctx, size=800):
    for f in t["fields"]:
        if f["type"] == "media" and e["data"].get(f["name"]):
            return ctx.media(e["data"][f["name"]], size), ctx.media_alt(e["data"][f["name"]]) or e["title"]
    return "", ""


def _rows(cfg, t):
    rows = ct.entries(t["id"], published_only=True)
    if cfg.sort == "newest":
        rows.sort(key=lambda r: r["created_at"], reverse=True)
    elif cfg.sort == "title":
        rows.sort(key=lambda r: r["title"].lower())
    return rows[:cfg.limit] if cfg.limit else rows


def render(block: dict, ctx: WidgetContext) -> Markup:
    from . import get
    cfg: CollectionConfig = get("collection").config_for(block.get("data"))
    uid = block_uid(block)
    site_id = (ctx.site or {}).get("id")
    t = None
    if cfg.type_id and site_id:
        try:
            t = ct.get_type(cfg.type_id, site_id)
        except ct.ContentError:
            t = None
    if not t:
        note = "Choose a content type in this block's settings (make one under Content types)." if ctx.editing or ctx.mode == "preview" else ""
        return Markup(f'<section class="band tw-mod"><div class="wrap"><p class="tw-empty">{note}</p></div></section>' if note else "")
    rows = _rows(cfg, t)
    shown = [f for f in t["fields"] if f.get("show", True) and f["type"] not in ("media", "rich")]
    filt = [f for f in t["fields"] if f.get("filter")] if cfg.filters else []
    link_of = (lambda e: ctx.link(ct.page_slug(t, e))) if t["detail_pages"] else (lambda e: "")
    items = []
    for e in rows:
        tags = "|".join(str(e["data"].get(f["name"]) or "") for f in filt)
        meta = "".join(f'<div class="tw-cl-f"><dt>{escape(f["label"])}</dt><dd>{_value(f, e["data"].get(f["name"]), ctx)}</dd></div>'
                       for f in shown if _value(f, e["data"].get(f["name"]), ctx))
        href = link_of(e)
        title = f'<a href="{escape(href)}">{escape(e["title"])}</a>' if href else escape(e["title"])
        if cfg.layout == "table":
            cells = "".join(f'<td>{_value(f, e["data"].get(f["name"]), ctx)}</td>' for f in shown)
            items.append(f'<tr data-tw-tags="{escape(tags)}"><th scope="row">{title}</th>{cells}</tr>')
            continue
        pic, alt = _image(t, e, ctx)
        img = f'<img src="{escape(pic)}" alt="{escape(alt)}" loading="lazy">' if pic and cfg.layout == "cards" else \
              (f'<img class="tw-cl-thumb" src="{escape(pic)}" alt="" loading="lazy">' if pic else "")
        items.append(f'<article class="tw-cl-item" data-tw-tags="{escape(tags)}">{img}<div class="tw-cl-body"><h3>{title}</h3>'
                     + (f'<dl class="tw-cl-meta">{meta}</dl>' if meta else "") + "</div></article>")
    if not rows:
        body = f'<p class="tw-empty">No {escape(t["name"].lower())} yet.</p>'
    elif cfg.layout == "table":
        head = "".join(f'<th scope="col">{escape(f["label"])}</th>' for f in shown)
        body = f'<div class="tw-cl-tablewrap"><table class="tw-cl-table"><thead><tr><th scope="col">{escape(t["singular"])}</th>{head}</tr></thead><tbody>{"".join(items)}</tbody></table></div>'
    else:
        body = f'<div class="tw-cl tw-cl-{cfg.layout}" style="--m-cols:{cfg.columns}">{"".join(items)}</div>'
    bar = ""
    keys = []
    for f in filt:
        vals = f.get("options") if f["type"] == "select" else sorted({str(e["data"].get(f["name"])) for e in rows if e["data"].get(f["name"])})
        if f["type"] == "checkbox":
            vals = ["True"]
        keys += [(v, (f["label"] if f["type"] == "checkbox" else v)) for v in (vals or [])]
    if rows and (keys or cfg.search):
        from . import modkit
        bar = str(modkit.chip_bar(keys, t["name"], search=f"Search {t['name'].lower()}" if cfg.search else ""))
    heading = cfg.heading or t["name"]
    return Markup(f'<section class="band tw-mod tw-collection" aria-labelledby="cl-{uid}-h"><div class="wrap" data-tw-filterable>'
                  f'<div class="tw-head"><h2 id="cl-{uid}-h" data-edit="heading">{escape(heading)}</h2></div>'
                  + (f'<p class="tw-intro" data-edit="intro">{escape(cfg.intro)}</p>' if cfg.intro else "")
                  + bar + body + "</div></section>")


def render_entry(block: dict, ctx: WidgetContext) -> Markup:
    site_id = (ctx.site or {}).get("id")
    eid = EntryConfig.model_validate(block.get("data") or {}).entry_id
    try:
        e = ct.get_entry(eid, site_id)
        t = ct.get_type(e["type_id"], site_id)
    except ct.ContentError:
        return Markup('<section class="band"><div class="wrap"><p class="empty-note">This entry isn\'t there any more.</p></div></section>')
    pic, alt = _image(t, e, ctx, 1600)
    facts = "".join(f'<div class="tw-cl-f"><dt>{escape(f["label"])}</dt><dd>{_value(f, e["data"].get(f["name"]), ctx, True)}</dd></div>'
                    for f in t["fields"] if f["type"] not in ("media", "rich", "textarea") and _value(f, e["data"].get(f["name"]), ctx, True))
    long = "".join(f'<div class="tw-cl-long"><h2>{escape(f["label"])}</h2>{_value(f, e["data"].get(f["name"]), ctx, True)}</div>'
                   for f in t["fields"] if f["type"] in ("rich", "textarea") and e["data"].get(f["name"]))
    gallery = "".join(f'<img src="{escape(ctx.media(e["data"][f["name"]], 1200))}" alt="" loading="lazy">'
                      for f in [x for x in t["fields"] if x["type"] == "media"][1:] if e["data"].get(f["name"]))
    back = next((p["slug"] for p in db.all("SELECT slug, blocks_json FROM pages WHERE site_id = ? ORDER BY position", site_id)
                 if f'"type_id": {t["id"]}' in p["blocks_json"] and '"collection"' in p["blocks_json"]), "")
    draft = '<p class="tw-cl-draft">Draft: not on the published site.</p>' if e["status"] == "draft" else ""
    return Markup(f'<article class="band tw-mod tw-entry"><div class="wrap">{draft}'
                  + (f'<p class="tw-cl-back"><a href="{escape(ctx.link(back))}">← All {escape(t["name"].lower())}</a></p>' if back else "")
                  + f'<h1>{escape(e["title"])}</h1><div class="tw-entry-grid">'
                  + (f'<figure class="tw-entry-pic"><img src="{escape(pic)}" alt="{escape(alt)}"></figure>' if pic else "")
                  + (f'<dl class="tw-cl-meta tw-entry-facts">{facts}</dl>' if facts else "") + "</div>"
                  + long + (f'<div class="tw-entry-more">{gallery}</div>' if gallery else "") + "</div></article>")


def extra_pages(renderer, pages) -> list[dict]:
    site_id = renderer.site.get("id")
    if not site_id:
        return []
    out = []
    for t in ct.types(site_id):
        if not t["detail_pages"]:
            continue
        for e in ct.entries(t["id"], published_only=renderer.mode != "preview"):
            desc = next((str(e["data"].get(f["name"]) or "")[:155] for f in t["fields"] if f["type"] in ("textarea", "text") and e["data"].get(f["name"])), "")
            out.append({"slug": ct.page_slug(t, e), "title": e["title"], "in_menu": 0, "seo_title": f"{e['title']} · {renderer.site.get('name', '')}",
                        "seo_description": desc, "blocks": [{"id": f"en{e['id']}", "type": "entry", "data": {"entry_id": e["id"]}}]})
    return out


register(Widget(
    name="collection", label="Collection", about="Entries of one of your own content types (Tractors, Listings …) as cards, a list or a table.",
    config=CollectionConfig, render=render, assets=["collection.css"], requires=["modkit"], extra_pages=extra_pages,
    hint="Make content types and add entries under <b>Content types</b> in the sidebar.",
))
register(Widget(
    name="entry", label="Entry", about="One content entry on its own page.", config=EntryConfig, render=render_entry,
    assets=["collection.css"], requires=["modkit"], hidden=True,
))
