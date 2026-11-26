"""
widgets/gallery.py: the Gallery block (replaces the templates' own gallery, same settings, so existing blocks keep
working): pictures as masonry, a grid or a carousel, opening in the accessible lightbox (widgets/lightbox.py).

Where the pictures come from:
    album     one album (Galleries)
    albums    every album, or only albums whose category contains a tag; the filter chips are the album names
    tag       every picture in the Media Center with that tag; the filter chips are the pictures' other tags
Filters work without a reload; with JavaScript off every picture shows and opens as a plain link.
"""

from __future__ import annotations

from typing import Literal

from markupsafe import Markup, escape
from pydantic import BaseModel, ConfigDict, Field, field_validator

from . import Widget, WidgetContext, block_uid, register
from .modkit import carousel_nav, chip_bar
from .. import db


def _tags(text: str) -> list[str]:
    return [t.strip() for t in (text or "").split(",") if t.strip()]


class GalleryConfig(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
    heading: str = Field("Gallery", max_length=120, json_schema_extra={"label": "Heading"})
    intro: str = Field("", max_length=400, json_schema_extra={"label": "Intro", "type": "textarea"})
    source: Literal["album", "albums", "tag"] = Field("album", json_schema_extra={"label": "Pictures from", "options": [
        ["album", "One album"], ["albums", "Several albums (filter by album)"], ["tag", "Media Center pictures with a tag"]]})
    album: str = Field("", max_length=12, json_schema_extra={"label": "Album", "type": "album"})
    album_tag: str = Field("", max_length=60, json_schema_extra={"label": "Several albums: only albums with this category (empty = all)"})
    tag: str = Field("", max_length=60, json_schema_extra={"label": "Tag (for “pictures with a tag”)"})
    layout: Literal["", "masonry", "grid", "carousel"] = Field("", json_schema_extra={"label": "Layout", "options": [
        ["", "The album's own layout"], ["masonry", "Masonry"], ["grid", "Grid (same size)"], ["carousel", "Carousel"]]})
    columns: Literal["2", "3", "4", "5"] = Field("3", json_schema_extra={"label": "Columns"})
    filters: bool = Field(False, json_schema_extra={"label": "Show filter buttons"})
    captions: bool = Field(True, json_schema_extra={"label": "Show captions"})
    lightbox: bool = Field(True, json_schema_extra={"label": "Open pictures full screen"})
    limit: int = Field(60, ge=1, le=300, json_schema_extra={"label": "Show at most"})

    @field_validator("album", mode="before")
    @classmethod
    def _album(cls, v):                     # older blocks saved the album as a number
        return "" if v is None else str(v)

    @field_validator("layout", mode="before")
    @classmethod
    def _layout(cls, v):
        return v if v in ("", "masonry", "grid", "carousel") else ""


def pictures(site_id, cfg: GalleryConfig) -> list[dict]:
    """[{media_id, caption, alt, width, height, keys: [filter keys], album}] in order."""
    if not site_id:
        return []
    out = []
    if cfg.source == "album" and cfg.album.isdigit():
        rows = db.all("SELECT ai.caption AS item_caption, m.* FROM album_items ai JOIN media m ON m.id = ai.media_id "
                      "WHERE ai.album_id = ? AND m.site_id = ? ORDER BY ai.position, ai.id", int(cfg.album), site_id)
        out = [{"row": r, "caption": r["item_caption"] or r["caption"], "keys": _tags(r["tags"])} for r in rows]
    elif cfg.source == "albums":
        for a in db.all("SELECT * FROM albums WHERE site_id = ? ORDER BY name", site_id):
            if cfg.album_tag and cfg.album_tag.lower() not in [t.lower() for t in _tags(a["category"])]:
                continue
            for r in db.all("SELECT ai.caption AS item_caption, m.* FROM album_items ai JOIN media m ON m.id = ai.media_id "
                            "WHERE ai.album_id = ? AND m.site_id = ? ORDER BY ai.position, ai.id", a["id"], site_id):
                out.append({"row": r, "caption": r["item_caption"] or r["caption"], "keys": [a["name"]], "album": a["name"]})
    elif cfg.source == "tag" and cfg.tag:
        want = cfg.tag.lower()
        for r in db.all("SELECT * FROM media WHERE site_id = ? AND kind IN ('image', 'svg') ORDER BY id DESC", site_id):
            tags = _tags(r["tags"])
            if want in [t.lower() for t in tags]:
                out.append({"row": r, "caption": r["caption"], "keys": [t for t in tags if t.lower() != want]})
    return [p for p in out if p["row"]["kind"] in ("image", "svg")][: cfg.limit]


def album_layout(album_id: str) -> str:
    row = db.one("SELECT layout FROM albums WHERE id = ?", int(album_id)) if album_id.isdigit() else None
    return row["layout"] if row else ""


def render(block: dict, ctx: WidgetContext) -> Markup:
    from . import get
    cfg: GalleryConfig = get("gallery").config_for(block.get("data"))
    uid = block_uid(block)
    pics = pictures(ctx.site.get("id"), cfg)
    layout = cfg.layout or (album_layout(cfg.album) if cfg.source == "album" else "") or "masonry"
    if layout not in ("masonry", "grid", "carousel"):
        layout = "masonry"
    head = f'<h2 id="gal-{uid}-h" data-edit="heading">{escape(cfg.heading)}</h2>' if cfg.heading else ""
    intro = f'<p class="tw-intro">{escape(cfg.intro)}</p>' if cfg.intro else ""
    if not pics:
        if ctx.mode != "preview":
            return Markup("")
        why = {"album": "Choose an album in this block's settings (albums are made under Galleries).",
               "albums": "No albums yet (or none with that category). Make albums under Galleries.",
               "tag": "No pictures with that tag yet. Tag pictures in the Media Center."}[cfg.source]
        return Markup(f'<section class="band tw-mod tw-gal"><div class="wrap">{head}<p class="tw-empty">{why}</p></div></section>')
    keys: list[str] = []
    for p in pics:
        for k in p["keys"]:
            if k not in keys:
                keys.append(k)
    items = []
    for i, p in enumerate(pics):
        r = p["row"]
        alt = r["alt"] or r["title"] or ""
        cap = p["caption"] if cfg.captions else ""
        size = f' width="{r["width"]}" height="{r["height"]}"' if r["width"] and r["height"] else ""
        img = (f'<img src="{escape(ctx.media(r["id"], 800))}" alt="{escape(alt)}"{size} loading="{"eager" if i < 2 else "lazy"}" decoding="async">')
        inner = (f'<a class="tw-gal-link" href="{escape(ctx.media(r["id"], 1600))}" data-tw-lb-item data-caption="{escape(p["caption"] or "")}">{img}</a>'
                 if cfg.lightbox else img)
        figcap = f"<figcaption>{escape(cap)}</figcaption>" if cap else ""
        tag = "li" if layout == "carousel" else "figure"
        wrap_open = f'<{tag} class="tw-gal-item" data-tw-tags="{escape("|".join(p["keys"]))}">' + ("<figure>" if tag == "li" else "")
        wrap_close = ("</figure>" if tag == "li" else "") + f"</{tag}>"
        items.append(wrap_open + inner + figcap + wrap_close)
    bar = chip_bar([(k, k) for k in keys[:24]], "Filter pictures") if cfg.filters and keys else Markup("")
    lb = " data-tw-lb" if cfg.lightbox else ""
    if layout == "carousel":
        body = (f'<div class="tw-carousel tw-gal-car" data-tw-carousel role="region" aria-roledescription="carousel" aria-label="{escape(cfg.heading or "Gallery")}"{lb}>'
                f'<ul class="tw-track" style="--m-slide:calc((100% - {(int(cfg.columns) - 1) * 20}px) / {cfg.columns})">{"".join(items)}</ul></div>')
        nav = carousel_nav("pictures")
    else:
        body = f'<div class="tw-gal-{layout}" style="--m-cols:{cfg.columns}"{lb}>{"".join(items)}</div>'
        nav = Markup("")
    label = f'aria-labelledby="gal-{uid}-h"' if cfg.heading else 'aria-label="Gallery"'
    return Markup(f'<section class="band tw-mod tw-gal" {label}><div class="wrap" data-tw-filterable>'
                  f'<div class="tw-head">{head}{nav}</div>{intro}{bar}{body}</div></section>')


register(Widget(
    name="gallery", label="Gallery", about="Pictures as masonry, a grid or a carousel, full screen on a click. Filters by album or tag.",
    config=GalleryConfig, render=render, assets=["gallery.css"], requires=["modkit", "lightbox"],
    hint="Pictures come from Galleries (albums) or the Media Center (tags). Alt text and captions come from the Media Center.",
))
