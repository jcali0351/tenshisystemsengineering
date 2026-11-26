"""
widgets/news.py: a news widget built on the blog (posts.py): latest headlines with dates, a ticker-style strip, or
compact cards, an "All news" link and the site's RSS feed (feed.xml, made with every deployment). As with the
Blog block, the posts shown are those live at the last Publish.
"""

from __future__ import annotations

from typing import Literal

from markupsafe import Markup, escape
from pydantic import BaseModel, ConfigDict, Field

from . import Widget, WidgetContext, block_uid, register
from .. import posts as posts_mod


class NewsConfig(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
    heading: str = Field("Latest news", max_length=120, json_schema_extra={"label": "Heading (empty = none)"})
    layout: Literal["headlines", "strip", "compact"] = Field("headlines", json_schema_extra={"label": "Look", "options": [
        ["headlines", "Headlines with dates"], ["strip", "One-line strip (newest first)"], ["compact", "Small cards with pictures"]]})
    tag: str = Field("", max_length=40, json_schema_extra={"label": "Only posts tagged (empty = all)"})
    limit: int = Field(5, ge=1, le=20, json_schema_extra={"label": "How many"})
    all_link: str = Field("All news", max_length=40, json_schema_extra={"label": "“All news” link text (empty = none)"})
    rss: bool = Field(True, json_schema_extra={"label": "Show the RSS feed link"})


def render(block: dict, ctx: WidgetContext) -> Markup:
    from . import get
    from .blog import _blog_page_slug
    cfg: NewsConfig = get("news").config_for(block.get("data"))
    uid = block_uid(block)
    rows = posts_mod.published(ctx.site.get("id"), cfg.tag, cfg.limit) if ctx.site.get("id") else []
    if not rows and ctx.mode != "preview":
        return Markup("")
    link = lambda r: escape(ctx.link(posts_mod.PREFIX + r["slug"]))   # noqa: E731
    date = lambda r: (f'<time datetime="{escape(r["published_at"][:10])}">{escape(posts_mod.nice_date(r["published_at"]))}</time>' if r["published_at"] else "")  # noqa: E731
    if not rows:
        body = '<p class="tw-empty">No posts yet. Write one under Blog posts and publish.</p>'
    elif cfg.layout == "strip":
        body = '<ul class="tw-nw-strip">' + "".join(f'<li>{date(r)} <a href="{link(r)}">{escape(r["title"])}</a></li>' for r in rows) + "</ul>"
    elif cfg.layout == "compact":
        items = []
        for r in rows:
            src = ctx.media(r["cover_media_id"], 400) if r["cover_media_id"] else ""
            items.append(f'<li class="tw-nw-c">' + (f'<img src="{escape(src)}" alt="" loading="lazy">' if src else '<span class="tw-nw-ph" aria-hidden="true"></span>')
                         + f'<div><a href="{link(r)}">{escape(r["title"])}</a>{date(r)}</div></li>')
        body = f'<ul class="tw-nw-cards">{"".join(items)}</ul>'
    else:
        body = '<ul class="tw-nw-list">' + "".join(
            f'<li>{date(r)}<div><a href="{link(r)}">{escape(r["title"])}</a>'
            + (f'<p>{escape(r["excerpt"])}</p>' if r["excerpt"] else "") + "</div></li>" for r in rows) + "</ul>"
    foot = []
    if cfg.all_link:
        foot.append(f'<a href="{escape(ctx.link(_blog_page_slug(ctx.site.get("id"))))}">{escape(cfg.all_link)} →</a>')
    if cfg.rss:
        foot.append(f'<a href="{escape(ctx.link("feed.xml") if ctx.mode == "preview" else "feed.xml")}" type="application/rss+xml">'
                    '<span aria-hidden="true">◉</span> RSS feed</a>')
    head = f'<h2 id="nw-{uid}-h" data-edit="heading">{escape(cfg.heading)}</h2>' if cfg.heading else ""
    label = f'aria-labelledby="nw-{uid}-h"' if cfg.heading else 'aria-label="News"'
    return Markup(f'<section class="band tw-mod tw-nw tw-nw-{cfg.layout}" {label}><div class="wrap"><div class="tw-head">{head}</div>{body}'
                  + (f'<p class="tw-nw-foot">{" · ".join(foot)}</p>' if foot else "") + "</div></section>")


register(Widget(
    name="news", label="News", about="Your latest blog posts as headlines, a one-line strip or small cards, with the RSS feed.",
    config=NewsConfig, render=render, assets=["news.css"], requires=["modkit"],
))
