"""
widgets/video_gallery.py: YouTube and Vimeo videos as a grid of cards that play in the lightbox.

Privacy: nothing loads from YouTube or Vimeo until a visitor presses play. Videos play from youtube-nocookie.com
and Vimeo with dnt=1. YouTube thumbnails (i.ytimg.com) are optional; with them off, or for Vimeo without a picture of
your own, the card is drawn in the theme's colours. Only pages with this block allow those players (block_csp).
"""

from __future__ import annotations

import re
from typing import Literal

from markupsafe import Markup, escape
from pydantic import BaseModel, ConfigDict, Field, field_validator

from . import Widget, WidgetContext, block_uid, register
from .modkit import carousel_nav

YT = re.compile(r"(?:youtu\.be/|youtube(?:-nocookie)?\.com/(?:watch\?(?:.*&)?v=|embed/|shorts/|live/))([A-Za-z0-9_-]{11})")
VIMEO = re.compile(r"vimeo\.com/(?:video/|channels/[^/]+/|groups/[^/]+/videos/)?(\d{6,12})")


def parse(url: str) -> tuple[str, str]:
    """("youtube", id) / ("vimeo", id) / ("", "")"""
    m = YT.search(url or "")
    if m:
        return "youtube", m.group(1)
    m = VIMEO.search(url or "")
    return ("vimeo", m.group(1)) if m else ("", "")


def embed_url(kind: str, vid: str) -> str:
    if kind == "youtube":
        return f"https://www.youtube-nocookie.com/embed/{vid}?autoplay=1&rel=0&modestbranding=1"
    if kind == "vimeo":
        return f"https://player.vimeo.com/video/{vid}?autoplay=1&dnt=1"
    return ""


class Video(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
    title: str = Field("A video", max_length=120, json_schema_extra={"label": "Title"})
    url: str = Field("", max_length=300, json_schema_extra={"label": "YouTube or Vimeo link"})
    caption: str = Field("", max_length=300, json_schema_extra={"label": "Caption"})
    thumbnail: str = Field("", max_length=12, json_schema_extra={"label": "Picture (optional)", "type": "media"})
    category: str = Field("", max_length=40, json_schema_extra={"label": "Category (for filters)"})

    @field_validator("url")
    @classmethod
    def _url(cls, v):
        if v and not parse(v)[0]:
            raise ValueError("a video link is a YouTube or Vimeo address")
        return v

    @field_validator("thumbnail", mode="before")
    @classmethod
    def _thumb(cls, v):
        return "" if v is None else str(v)


class VideoGalleryConfig(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
    heading: str = Field("Videos", max_length=120, json_schema_extra={"label": "Heading"})
    intro: str = Field("", max_length=400, json_schema_extra={"label": "Intro", "type": "textarea"})
    items: list[Video] = Field(default_factory=list, max_length=40, json_schema_extra={"label": "Videos", "item_label": "Video"})
    layout: Literal["grid", "carousel"] = Field("grid", json_schema_extra={"label": "Layout", "options": [["grid", "Grid"], ["carousel", "Carousel"]]})
    columns: Literal["2", "3", "4"] = Field("3", json_schema_extra={"label": "Columns"})
    youtube_thumbs: bool = Field(True, json_schema_extra={"label": "Show YouTube's own thumbnails (loads them from YouTube)"})
    filters: bool = Field(False, json_schema_extra={"label": "Show category filters"})


def block_csp(cfg: VideoGalleryConfig) -> dict:
    kinds = {parse(v.url)[0] for v in cfg.items}
    frames = (["https://www.youtube-nocookie.com"] if "youtube" in kinds else []) + (["https://player.vimeo.com"] if "vimeo" in kinds else [])
    return {"frame-src": frames} if frames else {}


def render(block: dict, ctx: WidgetContext) -> Markup:
    from . import get
    from .modkit import chip_bar
    cfg: VideoGalleryConfig = get("video_gallery").config_for(block.get("data"))
    uid = block_uid(block)
    vids = [(v, *parse(v.url)) for v in cfg.items if v.url]
    head = f'<h2 id="vg-{uid}-h" data-edit="heading">{escape(cfg.heading)}</h2>' if cfg.heading else ""
    if not vids:
        if ctx.mode != "preview":
            return Markup("")
        return Markup(f'<section class="band tw-mod tw-vg"><div class="wrap">{head}<p class="tw-empty">Add YouTube or Vimeo links in this block\'s settings.</p></div></section>')
    cards = []
    cats = []
    for v, kind, vid in vids:
        if v.category and v.category not in cats:
            cats.append(v.category)
        thumb = ctx.media(v.thumbnail, 800) if v.thumbnail else (f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg" if kind == "youtube" and cfg.youtube_thumbs else "")
        pic = (f'<img src="{escape(thumb)}" alt="" loading="lazy" decoding="async">' if thumb else
               f'<span class="tw-vg-blank" aria-hidden="true">{"YouTube" if kind == "youtube" else "Vimeo"}</span>')
        watch = f"https://www.youtube.com/watch?v={vid}" if kind == "youtube" else f"https://vimeo.com/{vid}"
        tag = "li" if cfg.layout == "carousel" else "article"
        cards.append(
            f'<{tag} class="tw-vg-item" data-tw-tags="{escape(v.category)}"><a class="tw-vg-link" href="{watch}" data-tw-lb-item data-embed="{escape(embed_url(kind, vid))}" '
            f'data-title="{escape(v.title)}" data-caption="{escape(v.caption or v.title)}" aria-label="Play video: {escape(v.title)}">'
            f'<span class="tw-vg-pic">{pic}<span class="tw-vg-play" aria-hidden="true"></span></span></a>'
            f'<h3 class="tw-vg-title">{escape(v.title)}</h3>' + (f'<p class="tw-note">{escape(v.caption)}</p>' if v.caption else "") + f"</{tag}>")
    note = '<p class="tw-note tw-vg-privacy">Videos load from YouTube or Vimeo only when you press play.</p>'
    bar = chip_bar([(c, c) for c in cats], "Filter videos") if cfg.filters and cats else Markup("")
    if cfg.layout == "carousel":
        body = (f'<div class="tw-carousel" data-tw-carousel data-tw-lb role="region" aria-roledescription="carousel" aria-label="{escape(cfg.heading or "Videos")}">'
                f'<ul class="tw-track">{"".join(cards)}</ul></div>')
        nav = carousel_nav("videos")
    else:
        body = f'<div class="tw-cards tw-vg-grid" style="--m-cols:{cfg.columns}" data-tw-lb>{"".join(cards)}</div>'
        nav = Markup("")
    intro = f'<p class="tw-intro">{escape(cfg.intro)}</p>' if cfg.intro else ""
    return Markup(f'<section class="band tw-mod tw-vg" aria-labelledby="vg-{uid}-h"><div class="wrap" data-tw-filterable>'
                  f'<div class="tw-head">{head}{nav}</div>{intro}{bar}{body}{note}</div></section>')


register(Widget(
    name="video_gallery", label="Video gallery", about="YouTube and Vimeo videos that play full screen. Nothing loads until play.",
    config=VideoGalleryConfig, render=render, assets=["video_gallery.css"], requires=["modkit", "lightbox"], block_csp=block_csp,
    hint="Paste YouTube or Vimeo links. Videos play from youtube-nocookie.com (YouTube) and with Do Not Track (Vimeo).",
))
