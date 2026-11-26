"""
widgets/case_studies.py: case studies with headline metrics ("+38% | more bookings"): cards or alternating rows,
optional tag filters, and the full story (challenge, what we did, results, a client quote) opening in place.
"""

from __future__ import annotations

import re
from typing import Literal

from markupsafe import Markup, escape
from pydantic import BaseModel, ConfigDict, Field, field_validator

from . import Widget, WidgetContext, block_uid, clean_link, paragraphs, register
from .modkit import chip_bar


def parse_metrics(text: str) -> list[tuple[str, str]]:
    out = []
    for line in (text or "").splitlines():
        if line.strip():
            value, _, label = line.partition("|")
            out.append((value.strip()[:16], label.strip()[:60]))
    return out


class Case(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
    title: str = Field("A project we're proud of", max_length=120, json_schema_extra={"label": "Title"})
    client: str = Field("", max_length=80, json_schema_extra={"label": "Client"})
    tags: str = Field("", max_length=120, json_schema_extra={"label": "Tags (comma-separated, for filters)"})
    image: str = Field("", max_length=12, json_schema_extra={"label": "Picture", "type": "media"})
    summary: str = Field("", max_length=400, json_schema_extra={"label": "Summary (one or two sentences)", "type": "textarea"})
    metrics: str = Field("", max_length=400, json_schema_extra={"label": "Metrics: one per line, value | label (e.g. +38% | more bookings)", "type": "textarea"})
    challenge: str = Field("", max_length=3000, json_schema_extra={"label": "The challenge", "type": "textarea"})
    solution: str = Field("", max_length=3000, json_schema_extra={"label": "What we did", "type": "textarea"})
    results: str = Field("", max_length=3000, json_schema_extra={"label": "The results", "type": "textarea"})
    quote: str = Field("", max_length=600, json_schema_extra={"label": "Client quote (optional)", "type": "textarea"})
    quote_by: str = Field("", max_length=100, json_schema_extra={"label": "Quote by"})
    link: str = Field("", max_length=300, json_schema_extra={"label": "Read more link (optional)", "type": "link"})

    @field_validator("image", mode="before")
    @classmethod
    def _i(cls, v):
        return "" if v is None else str(v)

    @field_validator("link")
    @classmethod
    def _l(cls, v):
        return clean_link(v)

    @field_validator("metrics")
    @classmethod
    def _m(cls, v):
        rows = parse_metrics(v)
        if len(rows) > 4:
            raise ValueError("up to 4 metrics per case study")
        for value, label in rows:
            if not value or not label:
                raise ValueError("write each metric as value | label, e.g. +38% | more bookings")
        return v


class CaseStudiesConfig(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
    heading: str = Field("Case studies", max_length=120, json_schema_extra={"label": "Heading"})
    intro: str = Field("", max_length=400, json_schema_extra={"label": "Intro", "type": "textarea"})
    layout: Literal["cards", "rows"] = Field("cards", json_schema_extra={"label": "Layout", "options": [["cards", "Cards"], ["rows", "Alternating rows"]]})
    filters: bool = Field(False, json_schema_extra={"label": "Filter by tag"})
    items: list[Case] = Field(default_factory=lambda: [Case(metrics="+38% | more bookings\n2× | faster quotes")], max_length=30,
                              json_schema_extra={"label": "Case studies", "item_label": "Case study"})


def _tags(c: Case) -> list[str]:
    return [t.strip() for t in c.tags.split(",") if t.strip()]


def render(block: dict, ctx: WidgetContext) -> Markup:
    from . import get
    cfg: CaseStudiesConfig = get("case_studies").config_for(block.get("data"))
    uid = block_uid(block)
    cards, keys = [], []
    for n, c in enumerate(cfg.items):
        tags = _tags(c)
        keys += [t for t in tags if t not in keys]
        pic = ctx.media(c.image, 1200) if c.image else ""
        metrics = "".join(f'<li><b>{escape(v)}</b><span>{escape(lab)}</span></li>' for v, lab in parse_metrics(c.metrics))
        story = "".join(f'<h4>{h}</h4>{paragraphs(t)}' for h, t in (("The challenge", c.challenge), ("What we did", c.solution), ("The results", c.results)) if t)
        if c.quote:
            story += f'<blockquote class="tw-cs-q"><p>{escape(c.quote)}</p>' + (f'<footer>{escape(c.quote_by)}</footer>' if c.quote_by else "") + "</blockquote>"
        more = (f'<details class="tw-cs-more"><summary>Read the full story<span class="tw-sr"> of {escape(c.title)}</span></summary>{story}</details>' if story else "")
        if c.link:
            more += f'<p><a class="tw-cs-link" href="{escape(ctx.link(c.link))}">More about this project<span class="tw-sr">: {escape(c.title)}</span> →</a></p>'
        cards.append(
            f'<li class="tw-cs" data-tw-tags="{escape(", ".join(tags))}">'
            + (f'<div class="tw-cs-pic"><img src="{escape(pic)}" alt="{escape(ctx.media_alt(c.image) or "")}" loading="lazy"></div>' if pic else "")
            + '<div class="tw-cs-body">'
            + (f'<p class="tw-cs-client">{escape(c.client)}' + (f' · {escape(", ".join(tags))}' if tags else "") + "</p>" if c.client or tags else "")
            + f'<h3 id="cs-{uid}-{n}">{escape(c.title)}</h3>'
            + (f'<p class="tw-cs-sum">{escape(c.summary)}</p>' if c.summary else "")
            + (f'<ul class="tw-cs-metrics" aria-label="Results">{metrics}</ul>' if metrics else "")
            + f'{more}</div></li>')
    bar = chip_bar([(k, k) for k in keys[:16]], "Filter case studies") if cfg.filters and len(keys) > 1 else ""
    head = f'<h2 id="cs-{uid}-h" data-edit="heading">{escape(cfg.heading)}</h2>' if cfg.heading else ""
    label = f'aria-labelledby="cs-{uid}-h"' if cfg.heading else 'aria-label="Case studies"'
    return Markup(f'<section class="band tw-mod tw-css tw-css-{cfg.layout}" {label}><div class="wrap" data-tw-filterable>'
                  f'<div class="tw-head">{head}</div>' + (f'<p class="tw-intro" data-edit="intro">{escape(cfg.intro)}</p>' if cfg.intro else "")
                  + f'{bar}<ul class="tw-cs-list">{"".join(cards)}</ul></div></section>')


register(Widget(
    name="case_studies", label="Case studies", about="Projects with headline results (+38% bookings…), the full story and a client quote.",
    config=CaseStudiesConfig, render=render, assets=["case_studies.css"], requires=["modkit"],
))
