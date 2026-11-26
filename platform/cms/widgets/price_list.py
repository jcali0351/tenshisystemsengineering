"""
widgets/price_list.py: a restaurant menu or price list: sections of items with prices, descriptions and dietary or
other labels (V, VG, GF, spicy, new …), one or two columns, optional jump links between sections, and schema.org
Menu data for search engines when it is a food menu.

Items are typed one per line, so long menus stay quick to edit:  Name | price | description | labels
"""

from __future__ import annotations

import json
import re
from typing import Literal

from markupsafe import Markup, escape
from pydantic import BaseModel, ConfigDict, Field, field_validator

from . import Widget, WidgetContext, block_uid, register

LABELS = {"v": "Vegetarian", "vg": "Vegan", "gf": "Gluten-free", "df": "Dairy-free", "n": "Contains nuts", "spicy": "Spicy",
          "new": "New", "popular": "Popular", "hot": "Spicy"}


def parse_items(text: str) -> list[dict]:
    out = []
    for line in (text or "").splitlines():
        if not line.strip():
            continue
        parts = [p.strip() for p in line.split("|")] + ["", "", ""]
        out.append({"name": parts[0][:100], "price": parts[1][:30], "about": parts[2][:300],
                    "labels": [t.strip().lower() for t in parts[3].split(",") if t.strip()][:6]})
    return out


class Section(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
    name: str = Field("Starters", max_length=80, json_schema_extra={"label": "Section"})
    note: str = Field("", max_length=200, json_schema_extra={"label": "Note under the section name (optional)"})
    items: str = Field("Soup of the day | $8 | With sourdough | v\nGarlic bread | $6 | | v, popular", max_length=8000, json_schema_extra={
        "label": "Items, one per line: Name | price | description | labels (v, vg, gf, df, n, spicy, new, popular)", "type": "textarea"})
    image: str = Field("", max_length=12, json_schema_extra={"label": "Picture (optional)", "type": "media"})

    @field_validator("image", mode="before")
    @classmethod
    def _i(cls, v):
        return "" if v is None else str(v)

    @field_validator("items")
    @classmethod
    def _items(cls, v):
        rows = parse_items(v)
        if len(rows) > 120:
            raise ValueError("up to 120 items per section")
        if any(not r["name"] for r in rows):
            raise ValueError("each line starts with the item's name")
        return v


class PriceListConfig(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
    heading: str = Field("Menu", max_length=120, json_schema_extra={"label": "Heading"})
    intro: str = Field("", max_length=400, json_schema_extra={"label": "Intro", "type": "textarea"})
    kind: Literal["food", "services"] = Field("food", json_schema_extra={"label": "This is", "options": [["food", "A food or drinks menu"], ["services", "A price list"]]})
    sections: list[Section] = Field(default_factory=lambda: [Section()], min_length=1, max_length=20, json_schema_extra={"label": "Sections", "item_label": "Section"})
    columns: Literal["1", "2"] = Field("2", json_schema_extra={"label": "Columns", "options": [["1", "1"], ["2", "2"]]})
    jump: bool = Field(True, json_schema_extra={"label": "Links to each section at the top"})
    dots: bool = Field(True, json_schema_extra={"label": "Dotted line between name and price"})
    footnote: str = Field("", max_length=400, json_schema_extra={"label": "Small print (allergens, service charge …)", "type": "textarea"})


def _slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:40] or "section"


def render(block: dict, ctx: WidgetContext) -> Markup:
    from . import get
    cfg: PriceListConfig = get("price_list").config_for(block.get("data"))
    uid = block_uid(block)
    secs, jumps, schema = [], [], []
    for n, s in enumerate(cfg.sections):
        sid = f"pl-{uid}-{n}-{_slug(s.name)}"
        jumps.append(f'<a href="#{sid}">{escape(s.name)}</a>')
        rows = parse_items(s.items)
        items = "".join(
            f'<li class="tw-pl-i"><div class="tw-pl-top"><span class="tw-pl-n">{escape(r["name"])}</span>'
            + "".join(f'<abbr class="tw-pl-tag tw-pl-{escape(t)}" title="{escape(LABELS.get(t, t.title()))}">{escape(t.upper())}</abbr>' for t in r["labels"])
            + (f'<span class="tw-pl-dots" aria-hidden="true"></span>' if cfg.dots else '<span class="tw-pl-sp"></span>')
            + (f'<span class="tw-pl-p">{escape(r["price"])}</span>' if r["price"] else "") + "</div>"
            + (f'<p class="tw-pl-d">{escape(r["about"])}</p>' if r["about"] else "") + "</li>" for r in rows)
        pic = ctx.media(s.image, 1200) if s.image else ""
        secs.append(f'<section class="tw-pl-s" id="{sid}" aria-labelledby="{sid}-h"><h3 id="{sid}-h">{escape(s.name)}</h3>'
                    + (f'<p class="tw-pl-note">{escape(s.note)}</p>' if s.note else "")
                    + (f'<img class="tw-pl-pic" src="{escape(pic)}" alt="" loading="lazy">' if pic else "")
                    + f'<ul class="tw-pl-list">{items}</ul></section>')
        schema.append({"@type": "MenuSection", "name": s.name, "hasMenuItem": [
            {"@type": "MenuItem", "name": r["name"], **({"description": r["about"]} if r["about"] else {}),
             **({"offers": {"@type": "Offer", "price": re.sub(r"[^0-9.]", "", r["price"]) or r["price"]}} if r["price"] else {})} for r in rows]})
    used = sorted({t for s in cfg.sections for r in parse_items(s.items) for t in r["labels"] if t in LABELS})
    key = " · ".join(f'<b>{t.upper()}</b> {LABELS[t]}' for t in used)
    ld = ""
    if cfg.kind == "food":
        data = {"@context": "https://schema.org", "@type": "Menu", "name": cfg.heading or "Menu", "hasMenuSection": schema}
        ld = '<script type="application/ld+json">' + json.dumps(data, ensure_ascii=False).replace("<", "\\u003c") + "</script>"
    return Markup(f'<section class="band tw-mod tw-pl" aria-labelledby="pl-{uid}-h"><div class="wrap">'
                  f'<div class="tw-head"><h2 id="pl-{uid}-h" data-edit="heading">{escape(cfg.heading)}</h2></div>'
                  + (f'<p class="tw-intro" data-edit="intro">{escape(cfg.intro)}</p>' if cfg.intro else "")
                  + (f'<nav class="tw-pl-jump" aria-label="Menu sections">{"".join(jumps)}</nav>' if cfg.jump and len(jumps) > 1 else "")
                  + f'<div class="tw-pl-cols tw-pl-c{cfg.columns}">{"".join(secs)}</div>'
                  + (f'<p class="tw-note tw-pl-key">{key}</p>' if key else "")
                  + (f'<p class="tw-note">{escape(cfg.footnote)}</p>' if cfg.footnote else "") + f"{ld}</div></section>")


register(Widget(
    name="price_list", label="Menu / price list", about="A food menu or price list: sections, prices, descriptions and dietary labels.",
    config=PriceListConfig, render=render, assets=["price_list.css"], requires=["modkit"],
))
