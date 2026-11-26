"""
widgets/trust_badges.py: a strip of trust signals: built-in icons (secure payments, guarantee, licensed, insured …)
drawn as inline SVG in the theme's colours, or your own badge and partner logos from the Media Center. No outside
scripts or images.
"""

from __future__ import annotations

from typing import Literal

from markupsafe import Markup, escape
from pydantic import BaseModel, ConfigDict, Field, field_validator

from . import Widget, WidgetContext, block_uid, clean_link, register

_P = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"'
ICONS = {
    "secure": ("Secure payments", '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>'),
    "guarantee": ("Satisfaction guarantee", '<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-4"/>'),
    "licensed": ("Licensed", '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2.5"/><path d="M6 16c.8-1.6 1.8-2 3-2s2.2.4 3 2M14 10h4M14 13h3"/>'),
    "insured": ("Fully insured", '<path d="M3 12a9 9 0 0 1 18 0z"/><path d="M12 12v6a2 2 0 0 0 4 0"/>'),
    "award": ("Award winning", '<circle cx="12" cy="9" r="5"/><path d="M9 13.5L7.5 21l4.5-2.5 4.5 2.5-1.5-7.5"/>'),
    "rated": ("5-star rated", '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>'),
    "local": ("Locally owned", '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>'),
    "fast": ("Fast turnaround", '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>'),
    "shipping": ("Free shipping", '<path d="M3 6h11v10H3zM14 9h4l3 3v4h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>'),
    "returns": ("Easy returns", '<path d="M4 9h11a5 5 0 0 1 0 10H8"/><path d="M8 5L4 9l4 4"/>'),
    "eco": ("Eco friendly", '<path d="M5 19c0-8 5-13 15-14-1 10-6 15-14 15"/><path d="M5 19c3-4 6-6 9-7"/>'),
    "support": ("Friendly support", '<path d="M4 13a8 8 0 0 1 16 0v3a2 2 0 0 1-2 2h-1v-6h3M4 13v3a2 2 0 0 0 2 2h1v-6H4"/>'),
}


class Badge(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
    icon: Literal["", *ICONS.keys()] = Field("guarantee", json_schema_extra={"label": "Icon", "options": [["", "My own picture"]] + [[k, v[0]] for k, v in ICONS.items()]})
    label: str = Field("", max_length=60, json_schema_extra={"label": "Text (empty = the icon's name)"})
    detail: str = Field("", max_length=100, json_schema_extra={"label": "Small print (optional, e.g. licence number)"})
    image: str = Field("", max_length=12, json_schema_extra={"label": "Picture or logo (instead of an icon)", "type": "media"})
    link: str = Field("", max_length=300, json_schema_extra={"label": "Links to (optional, e.g. a verification page)", "type": "link"})

    @field_validator("image", mode="before")
    @classmethod
    def _i(cls, v):
        return "" if v is None else str(v)

    @field_validator("link")
    @classmethod
    def _l(cls, v):
        return clean_link(v)

    @field_validator("icon", mode="before")
    @classmethod
    def _ic(cls, v):
        return v if v in ICONS or v == "" else "guarantee"


def _default():
    return [Badge(icon=k) for k in ("guarantee", "licensed", "insured", "rated")]


class TrustConfig(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
    heading: str = Field("", max_length=120, json_schema_extra={"label": "Heading (optional)"})
    items: list[Badge] = Field(default_factory=_default, max_length=24, json_schema_extra={"label": "Badges", "item_label": "Badge"})
    style: Literal["row", "cards", "logos"] = Field("row", json_schema_extra={"label": "Look", "options": [
        ["row", "Icons in a row"], ["cards", "Cards"], ["logos", "Logo strip (greyscale, colour on hover)"]]})
    tone: Literal["plain", "soft", "brand"] = Field("soft", json_schema_extra={"label": "Background", "options": [["plain", "None"], ["soft", "Soft"], ["brand", "Brand colour"]]})


def render(block: dict, ctx: WidgetContext) -> Markup:
    from . import get
    cfg: TrustConfig = get("trust_badges").config_for(block.get("data"))
    uid = block_uid(block)
    out = []
    for b in cfg.items:
        src = ctx.media(b.image, 400) if b.image else ""
        name = b.label or (ICONS[b.icon][0] if b.icon else ctx.media_alt(b.image) or "")
        if src:
            pic = f'<img src="{escape(src)}" alt="{escape(name if cfg.style == "logos" and not b.label else "")}" loading="lazy">'
        elif b.icon:
            pic = f'<svg viewBox="0 0 24 24" width="34" height="34" aria-hidden="true" {_P}>{ICONS[b.icon][1]}</svg>'
        else:
            continue
        text = "" if cfg.style == "logos" else (f'<span class="tw-tb-t"><b>{escape(name)}</b>' + (f'<small>{escape(b.detail)}</small>' if b.detail else "") + "</span>")
        inner = f'<span class="tw-tb-i">{pic}</span>{text}'
        if b.link:
            rel = ' rel="noopener"' if b.link.startswith("http") else ""
            inner = f'<a href="{escape(ctx.link(b.link))}"{rel}>{inner}</a>'
        out.append(f'<li class="tw-tb">{inner}</li>')
    if not out:
        return Markup("")
    head = f'<h2 class="tw-tb-h" id="tb-{uid}-h" data-edit="heading">{escape(cfg.heading)}</h2>' if cfg.heading else ""
    label = f'aria-labelledby="tb-{uid}-h"' if cfg.heading else 'aria-label="Why choose us"'
    return Markup(f'<section class="band tw-mod tw-tbs tw-tbs-{cfg.style} tw-tbs-{cfg.tone}" {label}><div class="wrap">{head}'
                  f'<ul class="tw-tb-list">{"".join(out)}</ul></div></section>')


register(Widget(
    name="trust_badges", label="Trust badges", about="Guarantees, licences, awards and partner logos in a tidy strip.",
    config=TrustConfig, render=render, assets=["trust_badges.css"], requires=["modkit"],
))
