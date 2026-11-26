"""
widgets/testimonials.py: testimonials as a carousel, a wall or one featured quote with the rest around it, with stars.

Replaces the template block of the same name (same "heading" setting, so existing pages keep working) and gathers:
  • Business data › Testimonials (as before),
  • quotes typed into the block,
  • reviews sent through the Review form block (widgets/review_form.py) once an owner or admin APPROVES them in
    Modules & inbox › Reviews. Nothing shows before that. On the live site, newly approved reviews appear without
    republishing (GET __w/testimonials/reviews returns approved ones only),
  • Google reviews, only when the site has its own Places API key and place ID (settings, owners and admins only).
    Fetched by the server (Places API, New), cached 12 hours, the last good copy kept if Google fails; the key
    never reaches a page. No key: nothing from Google is shown and nothing is fetched; the builder shows a hint.
"""

from __future__ import annotations

import re
from typing import Literal
from urllib.parse import quote as urlquote

from markupsafe import Markup, escape
from pydantic import BaseModel, ConfigDict, Field, field_validator

from . import Widget, WidgetContext, block_uid, register
from .modkit import block_key, carousel_nav, stars
from .. import db, modcache

PLACE_RE = re.compile(r"^[A-Za-z0-9_-]{10,300}$")
TTL = 12 * 3600


class Quote(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
    quote: str = Field("", max_length=1500, json_schema_extra={"label": "What they said", "type": "textarea"})
    author: str = Field("", max_length=80, json_schema_extra={"label": "Who said it"})
    role: str = Field("", max_length=100, json_schema_extra={"label": "Their role or company (optional)"})
    rating: int = Field(5, ge=0, le=5, json_schema_extra={"label": "Stars (0 = none)"})
    photo: str = Field("", max_length=12, json_schema_extra={"label": "Photo (optional)", "type": "media"})
    featured: bool = Field(False, json_schema_extra={"label": "Feature this one"})

    @field_validator("photo", mode="before")
    @classmethod
    def _p(cls, v):
        return "" if v is None else str(v)


class TestimonialsConfig(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
    heading: str = Field("What customers say", max_length=120, json_schema_extra={"label": "Heading"})
    intro: str = Field("", max_length=400, json_schema_extra={"label": "Intro", "type": "textarea"})
    layout: Literal["carousel", "wall", "featured"] = Field("carousel", json_schema_extra={"label": "Layout", "options": [
        ["carousel", "Carousel"], ["wall", "Wall"], ["featured", "One featured, the rest below"]]})
    from_business: bool = Field(True, json_schema_extra={"label": "Include Business data › Testimonials"})
    from_reviews: bool = Field(True, json_schema_extra={"label": "Include approved reviews from the Review form"})
    from_google: bool = Field(True, json_schema_extra={"label": "Include Google reviews (needs a Places key in this block's settings)"})
    items: list[Quote] = Field(default_factory=list, max_length=40, json_schema_extra={"label": "More quotes", "item_label": "Quote"})
    min_rating: int = Field(0, ge=0, le=5, json_schema_extra={"label": "Only show ratings of at least (0 = all)"})
    limit: int = Field(12, ge=1, le=60, json_schema_extra={"label": "Show at most"})
    show_stars: bool = Field(True, json_schema_extra={"label": "Show stars"})
    summary: bool = Field(True, json_schema_extra={"label": "Show the average rating"})

    @field_validator("layout", mode="before")
    @classmethod
    def _l(cls, v):
        return v if v in ("carousel", "wall", "featured") else "carousel"


class TestimonialsSettings(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
    places_key: str = Field("", max_length=200, json_schema_extra={
        "label": "Google Places API key", "secret": True,
        "help": "Optional. From Google Cloud (Places API (New)). Restrict it to the Places API. Without it, no Google reviews are shown."})
    place_id: str = Field("", max_length=300, json_schema_extra={"label": "Google place ID", "placeholder": "ChIJ…",
                                                                 "help": "Find it with Google's Place ID Finder."})

    @field_validator("place_id")
    @classmethod
    def _pid(cls, v):
        if v and not PLACE_RE.match(v):
            raise ValueError("a place ID looks like ChIJN1t_tDeuEmsRUsoyG83frY4")
        return v


def connected(settings) -> bool:
    return bool(settings and settings.places_key and settings.place_id)


def google_reviews(site_id, settings) -> dict | None:
    """{"rating", "count", "url", "reviews": [...]} from Google (cached), or None without a key."""
    if not connected(settings):
        return None

    def fetch():
        data = modcache.http_json(f"https://places.googleapis.com/v1/places/{urlquote(settings.place_id)}",
                                  headers={"X-Goog-Api-Key": settings.places_key,
                                           "X-Goog-FieldMask": "displayName,rating,userRatingCount,reviews,googleMapsUri"})
        out = []
        for r in (data or {}).get("reviews", [])[:10]:
            text = ((r.get("originalText") or r.get("text") or {}).get("text") or "").strip()
            if text:
                out.append({"quote": text[:1500], "author": ((r.get("authorAttribution") or {}).get("displayName") or "Google user")[:80],
                            "rating": int(r.get("rating") or 0), "when": (r.get("relativePublishTimeDescription") or "")[:40]})
        return {"rating": float(data.get("rating") or 0), "count": int(data.get("userRatingCount") or 0),
                "url": data.get("googleMapsUri") if str(data.get("googleMapsUri", "")).startswith("https://") else "", "reviews": out}
    return modcache.get_json(site_id, f"google-reviews:{settings.place_id}", TTL, fetch)


def approved_reviews(site_id) -> list[dict]:
    return db.all("SELECT id, name, role, rating, quote FROM reviews WHERE site_id = ? AND status = 'approved' ORDER BY id DESC LIMIT 60", site_id)


def gather(cfg: TestimonialsConfig, ctx: WidgetContext) -> tuple[list[dict], dict | None]:
    items: list[dict] = []
    for q in cfg.items:
        if q.quote:
            items.append({"quote": q.quote, "author": q.author, "role": q.role, "rating": q.rating, "photo": q.photo, "featured": q.featured, "src": "own"})
    if cfg.from_business:
        for t in (ctx.profile or {}).get("testimonials") or []:
            if isinstance(t, dict) and t.get("quote"):
                try:
                    r = int(float(t.get("rating") or 0))
                except (TypeError, ValueError):
                    r = 0
                items.append({"quote": str(t["quote"]), "author": str(t.get("author") or ""), "role": "", "rating": r, "src": "business"})
    if cfg.from_reviews and ctx.site.get("id"):
        for r in approved_reviews(ctx.site["id"]):
            items.append({"quote": r["quote"], "author": r["name"], "role": r["role"], "rating": r["rating"], "src": "review", "id": r["id"]})
    google = None
    if cfg.from_google and ctx.site.get("id"):
        google = google_reviews(ctx.site["id"], ctx.settings)
        for g in (google or {}).get("reviews", []):
            items.append({**g, "role": g.get("when", ""), "src": "google"})
    items = [i for i in items if not cfg.min_rating or i["rating"] >= cfg.min_rating]
    items.sort(key=lambda i: not i.get("featured"))           # featured ones first, otherwise as gathered
    return items[:cfg.limit], google


def _initials(name: str) -> str:
    parts = [p for p in re.split(r"\s+", name or "") if p]
    return ("".join(p[0] for p in parts[:2]) or "★").upper()


def card(i: dict, ctx: WidgetContext, show_stars: bool, tag: str = "li", big: bool = False) -> str:
    photo = ctx.media(i["photo"], 200) if i.get("photo") else ""
    face = (f'<img class="tw-tm-face" src="{escape(photo)}" alt="" loading="lazy" width="48" height="48">' if photo
            else f'<span class="tw-tm-face tw-tm-init" aria-hidden="true">{escape(_initials(i["author"]))}</span>')
    src = ' <span class="tw-tm-src">on Google</span>' if i["src"] == "google" else ""
    rid = f' data-review-id="{i["id"]}"' if i.get("id") else ""
    return (f'<{tag} class="tw-tm{" tw-tm-big" if big else ""}"{rid}><figure>'
            + (str(stars(i["rating"])) if show_stars and i["rating"] else "")
            + f'<blockquote><p>{escape(i["quote"])}</p></blockquote><figcaption>{face}<span><b>{escape(i["author"] or "A customer")}</b>{src}'
            + (f'<span class="tw-tm-role">{escape(i["role"])}</span>' if i.get("role") else "") + f'</span></figcaption></figure></{tag}>')


def render(block: dict, ctx: WidgetContext) -> Markup:
    from . import get
    cfg: TestimonialsConfig = get("testimonials").config_for(block.get("data"))
    uid = block_uid(block)
    items, google = gather(cfg, ctx)
    hint = ""
    if ctx.mode == "preview" and cfg.from_google and not connected(ctx.settings):
        hint = ('<p class="tw-builder-hint">Google reviews: add the site\'s Places API key and place ID in this block\'s settings '
                '(Modules &amp; inbox › Testimonials) to show them here. Visitors see nothing about Google until then.</p>')
    if not items and not hint and ctx.mode != "preview":
        return Markup("")                                       # nothing to show yet: no empty band on the live site
    rated = [i["rating"] for i in items if i["rating"]]
    summary = ""
    if cfg.summary and (google and google.get("count")):
        summary = (f'<p class="tw-tm-sum">{stars(google["rating"])} <b>{google["rating"]:.1f}</b> from {google["count"]} Google reviews'
                   + (f' · <a href="{escape(google["url"])}" rel="noopener" target="_blank">See them on Google</a>' if google.get("url") else "") + "</p>")
    elif cfg.summary and len(rated) >= 2:
        avg = sum(rated) / len(rated)
        summary = f'<p class="tw-tm-sum">{stars(avg)} <b>{avg:.1f}</b> average from {len(rated)} reviews</p>'
    show = cfg.show_stars
    feed = f' data-tw-reviews="__w/testimonials/reviews?_block={escape(block_key(block))}"' if cfg.from_reviews and ctx.mode == "hosted" else ""
    nav = ""
    if not items:
        body = '<p class="tw-empty">No testimonials yet: add quotes here or in Business data, or approve reviews in Modules &amp; inbox.</p>'
    elif cfg.layout == "carousel":
        body = (f'<div class="tw-carousel" data-tw-carousel role="region" aria-roledescription="carousel" aria-label="{escape(cfg.heading or "Testimonials")}">'
                f'<ul class="tw-track tw-tm-list" data-tw-tm-list>{"".join(card(i, ctx, show) for i in items)}</ul></div>')
        nav = str(carousel_nav("testimonials")) if len(items) > 1 else ""
    elif cfg.layout == "featured":
        first, rest = items[0], items[1:]
        body = (card(first, ctx, show, "div", big=True)
                + (f'<ul class="tw-tm-grid tw-tm-list" data-tw-tm-list>{"".join(card(i, ctx, show) for i in rest)}</ul>' if rest or feed else ""))
    else:
        body = f'<ul class="tw-tm-wall tw-tm-list" data-tw-tm-list>{"".join(card(i, ctx, show) for i in items)}</ul>'
    head = f'<h2 id="tm-{uid}-h" data-edit="heading">{escape(cfg.heading)}</h2>' if cfg.heading else ""
    label = f'aria-labelledby="tm-{uid}-h"' if cfg.heading else 'aria-label="Testimonials"'
    return Markup(f'<section class="band tw-mod tw-tms tw-tms-{cfg.layout}" {label}{feed} data-stars="{int(show)}"><div class="wrap">'
                  f'<div class="tw-head">{head}{nav}</div>'
                  + (f'<p class="tw-intro" data-edit="intro">{escape(cfg.intro)}</p>' if cfg.intro else "")
                  + f'{summary}{hint}{body}</div></section>')


def act_reviews(req):
    """Approved reviews only (what an owner chose to publish), so the live site picks up new approvals."""
    if not req.cfg or not req.cfg.from_reviews:
        return 200, {"ok": True, "reviews": []}
    rows = approved_reviews(req.site["id"])
    if req.cfg.min_rating:
        rows = [r for r in rows if r["rating"] >= req.cfg.min_rating]
    return 200, {"ok": True, "reviews": [{"id": r["id"], "quote": r["quote"], "author": r["name"], "role": r["role"], "rating": r["rating"]}
                                         for r in rows[:req.cfg.limit]]}


register(Widget(
    name="testimonials", label="Testimonials", about="Customer quotes and approved reviews as a carousel, a wall or a featured quote, with stars.",
    config=TestimonialsConfig, render=render, settings=TestimonialsSettings, connected=connected,
    assets=["testimonials.css", "testimonials.js"], requires=["modkit"], actions={"reviews": act_reviews},
    hint="Reviews from the Review form appear once approved in Modules & inbox › Reviews. Google reviews need the site's own Places key.",
))
