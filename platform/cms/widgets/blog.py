"""
widgets/blog.py: the Blog widget (a list of posts, or one featured post with the next ones beside it) and the hidden
"post" widget that draws one post on its own page (post-<slug>.html; posts.page_for puts it there).
Posts come from posts.py. Only published posts whose date has passed are shown, as of the last Publish.
"""

from __future__ import annotations

import json
from typing import Literal

from markupsafe import Markup, escape
from pydantic import BaseModel, ConfigDict, Field

from . import Widget, WidgetContext, block_uid, register
from .. import db, posts as posts_mod


class BlogConfig(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
    variant: Literal["list", "featured"] = Field("list", json_schema_extra={
        "label": "Show", "options": [["list", "A list of posts (cards)"], ["featured", "The newest post large, the next ones beside it"]]})
    heading: str = Field("From the blog", max_length=120, json_schema_extra={"label": "Heading (empty = none)"})
    intro: str = Field("", max_length=400, json_schema_extra={"label": "Intro", "type": "textarea"})
    tag: str = Field("", max_length=40, json_schema_extra={"label": "Only posts tagged (empty = all)"})
    limit: int = Field(6, ge=1, le=48, json_schema_extra={"label": "Show at most (posts)"})
    columns: Literal["2", "3"] = Field("3", json_schema_extra={"label": "Columns (list)", "options": [["2", "2"], ["3", "3"]]})
    show_excerpt: bool = Field(True, json_schema_extra={"label": "Show the excerpt"})
    show_date: bool = Field(True, json_schema_extra={"label": "Show the date"})


class PostConfig(BaseModel):
    model_config = ConfigDict(extra="ignore")
    post_id: int = 0


def _date(row, show=True):
    if not show or not row["published_at"]:
        return ""
    return f'<time datetime="{escape(row["published_at"])}">{escape(posts_mod.nice_date(row["published_at"]))}</time>'


def _card(row, cfg: BlogConfig, ctx: WidgetContext, big=False) -> str:
    href = escape(ctx.link(posts_mod.PREFIX + row["slug"]))
    img = ""
    if row["cover_media_id"]:
        src = ctx.media(row["cover_media_id"], 1600 if big else 800)
        if src:
            img = f'<a class="tw-post-pic" href="{href}" tabindex="-1" aria-hidden="true"><img src="{escape(src)}" alt="" loading="lazy"></a>'
    tags = posts_mod.tags_of(row)
    meta = " · ".join(x for x in (_date(row, cfg.show_date), escape(tags[0]) if tags else "") if x)
    return (f'<article class="tw-post{" tw-post-big" if big else ""}">{img}<div class="tw-post-body">'
            + (f'<p class="tw-post-meta">{meta}</p>' if meta else "")
            + f'<h3><a href="{href}">{escape(row["title"])}</a></h3>'
            + (f'<p class="tw-post-ex">{escape(row["excerpt"])}</p>' if cfg.show_excerpt and row["excerpt"] else "")
            + f'<a class="tw-post-more" href="{href}" aria-label="Read: {escape(row["title"])}">Read more →</a></div></article>')


def render(block: dict, ctx: WidgetContext) -> Markup:
    from . import get
    cfg: BlogConfig = get("blog").config_for(block.get("data"))
    uid = block_uid(block)
    rows = posts_mod.published((ctx.site or {}).get("id"), cfg.tag, cfg.limit) if (ctx.site or {}).get("id") else []
    head = (f'<h2 id="blog-{uid}-h" data-edit="heading">{escape(cfg.heading)}</h2>' if cfg.heading else "") + \
           (f'<p class="intro">{escape(cfg.intro)}</p>' if cfg.intro else "")
    if not rows:
        body = ('<p class="empty-note">No published posts yet. Write one under <b>Blog posts</b> in the CMS; '
                "it appears here after you publish the site.</p>" if ctx.mode == "preview" else "<p>New posts are on their way.</p>")
    elif cfg.variant == "featured":
        rest = "".join(_card(r, cfg, ctx) for r in rows[1:])
        body = f'<div class="tw-blog-feat">{_card(rows[0], cfg, ctx, big=True)}' + (f'<div class="tw-blog-side">{rest}</div>' if rest else "") + "</div>"
    else:
        body = f'<div class="tw-blog-grid tw-blog-cols-{cfg.columns}">{"".join(_card(r, cfg, ctx) for r in rows)}</div>'
    labelled = f' aria-labelledby="blog-{uid}-h"' if cfg.heading else ""
    return Markup(f'<section class="band tw-blog tw-blog-{cfg.variant}"{labelled}><div class="wrap">{head}{body}</div></section>')


def _blog_page_slug(site_id) -> str:
    """The first page with a Blog block (for "All posts"), or the home page."""
    for p in db.all("SELECT slug, blocks_json FROM pages WHERE site_id = ? ORDER BY position, id", site_id):
        if any((b or {}).get("type") == "blog" for b in db.j(p["blocks_json"], [])):
            return p["slug"]
    return "index"


def render_post(block: dict, ctx: WidgetContext) -> Markup:
    from ..render import clean_html
    site_id = (ctx.site or {}).get("id")
    pid = PostConfig.model_validate(block.get("data") or {}).post_id
    row = posts_mod.get(pid, site_id) if site_id else None
    if not row:
        return Markup('<section class="band"><div class="wrap"><p class="empty-note">This post isn\'t there any more.</p></div></section>')
    tags = posts_mod.tags_of(row)
    cover = ctx.media(row["cover_media_id"], 1600) if row["cover_media_id"] else ""
    draft = "" if posts_mod.is_live(row) or ctx.mode != "preview" else \
        '<p class="tw-post-draft">Not live: ' + ("this post is a draft." if row["status"] == "draft" else "its publish date hasn't come yet.") + "</p>"
    live = posts_mod.published(site_id)
    ids = [r["id"] for r in live]
    newer = older = None
    if row["id"] in ids:
        i = ids.index(row["id"])
        newer = live[i - 1] if i > 0 else None
        older = live[i + 1] if i + 1 < len(live) else None
    nav = ""
    if newer or older:
        nav = ('<nav class="tw-post-nav" aria-label="More posts">'
               + (f'<a rel="prev" href="{escape(ctx.link(posts_mod.PREFIX + older["slug"]))}"><small>Older</small>{escape(older["title"])}</a>' if older else "<span></span>")
               + (f'<a rel="next" href="{escape(ctx.link(posts_mod.PREFIX + newer["slug"]))}"><small>Newer</small>{escape(newer["title"])}</a>' if newer else "")
               + "</nav>")
    company = ((ctx.profile or {}).get("company") or {}).get("name") or (ctx.site or {}).get("name") or ""
    ld = {"@context": "https://schema.org", "@type": "BlogPosting", "headline": row["title"], "datePublished": row["published_at"] or None,
          "dateModified": row["updated_at"], "description": row["excerpt"] or None,
          "author": {"@type": "Person" if row["author"] else "Organization", "name": row["author"] or company},
          "publisher": {"@type": "Organization", "name": company}, "keywords": ", ".join(tags) or None}
    ld = json.dumps({k: v for k, v in ld.items() if v}, ensure_ascii=False).replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")
    by = " · ".join(x for x in (escape(row["author"]) if row["author"] else "", _date(row)) if x)
    return Markup(
        f'<article class="band tw-article"><div class="wrap tw-article-in">{draft}'
        f'<p class="tw-article-back"><a href="{escape(ctx.link(_blog_page_slug(site_id)))}">← All posts</a></p>'
        + ('<p class="tw-article-tags">' + "".join(f"<span>{escape(t)}</span>" for t in tags) + "</p>" if tags else "")
        + f'<h1>{escape(row["title"])}</h1>' + (f'<p class="tw-article-by">{by}</p>' if by else "")
        + (f'<p class="tw-article-lead">{escape(row["excerpt"])}</p>' if row["excerpt"] else "")
        + (f'<figure class="tw-article-cover"><img src="{escape(cover)}" alt="{escape(ctx.media_alt(row["cover_media_id"]))}"></figure>' if cover else "")
        + f'<div class="tw-article-body">{clean_html(row["body"], advanced=True)}</div>{nav}</div>'
        f'<script type="application/ld+json">{ld}</script></article>')


register(Widget(
    name="blog", label="Blog", about="Your newest posts: a list of cards, or one featured post with the next ones beside it.",
    config=BlogConfig, render=render, assets=["blog.css"],
    hint='Write posts under <b>Blog posts</b> in the sidebar. Each post gets its own page; the site also gets an RSS feed (feed.xml).',
))
register(Widget(
    name="post", label="Post", about="One blog post (used on post pages).", config=PostConfig, render=render_post,
    assets=["post.css"], hidden=True,
))
