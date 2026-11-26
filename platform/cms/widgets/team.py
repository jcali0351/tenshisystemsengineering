"""
widgets/team.py: a team directory. Replaces the template's Team block (same heading/intro, so existing pages keep
working) and adds people typed into the block, departments with filters, a search box for bigger teams, and
optional contact details. People come from Business data › Team first.
"""

from __future__ import annotations

import re
from typing import Literal

from markupsafe import Markup, escape
from pydantic import BaseModel, ConfigDict, Field, field_validator

from . import Widget, WidgetContext, block_uid, clean_link, register
from .modkit import chip_bar

EMAIL_RE = re.compile(r"^[^@\s<>\"']{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$")


class Person(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
    name: str = Field("", max_length=80, json_schema_extra={"label": "Name"})
    role: str = Field("", max_length=100, json_schema_extra={"label": "Job title"})
    department: str = Field("", max_length=60, json_schema_extra={"label": "Department / team (for filters)"})
    photo: str = Field("", max_length=12, json_schema_extra={"label": "Photo", "type": "media"})
    bio: str = Field("", max_length=600, json_schema_extra={"label": "Short bio", "type": "textarea"})
    email: str = Field("", max_length=200, json_schema_extra={"label": "Email (optional)"})
    phone: str = Field("", max_length=40, json_schema_extra={"label": "Phone (optional)"})
    link: str = Field("", max_length=300, json_schema_extra={"label": "Profile link (optional, e.g. LinkedIn)", "type": "link"})

    @field_validator("photo", mode="before")
    @classmethod
    def _p(cls, v):
        return "" if v is None else str(v)

    @field_validator("email")
    @classmethod
    def _e(cls, v):
        if v and not EMAIL_RE.match(v):
            raise ValueError("that email address doesn't look right")
        return v

    @field_validator("phone")
    @classmethod
    def _ph(cls, v):
        if v and not re.match(r"^[0-9+()./ -]{3,40}$", v):
            raise ValueError("a phone number has digits, spaces, +, - and brackets")
        return v

    @field_validator("link")
    @classmethod
    def _l(cls, v):
        return clean_link(v)


class TeamConfig(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
    heading: str = Field("Meet the team", max_length=120, json_schema_extra={"label": "Heading"})
    intro: str = Field("", max_length=400, json_schema_extra={"label": "Intro", "type": "textarea"})
    from_business: bool = Field(True, json_schema_extra={"label": "Include Business data › Team"})
    people: list[Person] = Field(default_factory=list, max_length=200, json_schema_extra={"label": "More people", "item_label": "Person"})
    layout: Literal["grid", "list"] = Field("grid", json_schema_extra={"label": "Layout", "options": [["grid", "Cards"], ["list", "Directory list"]]})
    filters: bool = Field(True, json_schema_extra={"label": "Filter by department (when there are several)"})
    search: bool = Field(False, json_schema_extra={"label": "Search box"})
    contact: bool = Field(True, json_schema_extra={"label": "Show email and phone"})


def people(cfg: TeamConfig, ctx: WidgetContext) -> list[dict]:
    out = []
    if cfg.from_business:
        for s in (ctx.profile or {}).get("staff") or []:
            if isinstance(s, dict) and s.get("name"):
                out.append({"name": str(s["name"]), "role": str(s.get("role") or ""), "department": "", "photo": s.get("photo_media") or "",
                            "bio": str(s.get("bio") or ""), "email": "", "phone": "", "link": ""})
    out += [p.model_dump() for p in cfg.people if p.name]
    return out


def render(block: dict, ctx: WidgetContext) -> Markup:
    from . import get
    cfg: TeamConfig = get("team").config_for(block.get("data"))
    uid = block_uid(block)
    ppl = people(cfg, ctx)
    if not ppl and ctx.mode != "preview":
        return Markup("")
    depts = list(dict.fromkeys(p["department"] for p in ppl if p["department"]))
    cards = []
    for p in ppl:
        src = ctx.media(p["photo"], 600) if p["photo"] else ""
        face = (f'<img class="tw-tp-pic" src="{escape(src)}" alt="" loading="lazy">' if src
                else f'<span class="tw-tp-pic tw-tp-init" aria-hidden="true">{escape("".join(w[0] for w in p["name"].split()[:2]).upper())}</span>')
        contact = ""
        if cfg.contact:
            contact = "".join(x for x in (
                f'<a href="mailto:{escape(p["email"])}">{escape(p["email"])}</a>' if p["email"] else "",
                f'<a href="tel:{escape(re.sub(r"[^0-9+]", "", p["phone"]))}">{escape(p["phone"])}</a>' if p["phone"] else "") if x)
        link = (f'<a class="tw-tp-link" href="{escape(ctx.link(p["link"]))}" rel="noopener">Profile<span class="tw-sr"> of {escape(p["name"])}</span></a>'
                if p["link"] else "")
        cards.append(f'<li class="tw-tp" data-tw-tags="{escape(p["department"])}">{face}<div class="tw-tp-body"><h3>{escape(p["name"])}</h3>'
                     + (f'<p class="tw-tp-role">{escape(p["role"])}' + (f' · {escape(p["department"])}' if p["department"] and cfg.layout == "list" else "") + "</p>" if p["role"] or p["department"] else "")
                     + (f'<p class="tw-tp-bio">{escape(p["bio"])}</p>' if p["bio"] else "")
                     + (f'<p class="tw-tp-contact">{contact}{link}</p>' if contact or link else "") + "</div></li>")
    bar = chip_bar([(d, d) for d in depts], "Filter by department", search="Search the team" if cfg.search else "") \
        if (cfg.filters and len(depts) > 1) or cfg.search else ""
    head = f'<h2 id="tp-{uid}-h" data-edit="heading">{escape(cfg.heading)}</h2>' if cfg.heading else ""
    label = f'aria-labelledby="tp-{uid}-h"' if cfg.heading else 'aria-label="Team"'
    body = f'<ul class="tw-tp-list tw-tp-{cfg.layout}">{"".join(cards)}</ul>' if cards else \
        '<p class="tw-empty">No people yet: add them in Business data › Team or in this block.</p>'
    return Markup(f'<section class="band tw-mod tw-tps" {label}><div class="wrap" data-tw-filterable><div class="tw-head">{head}</div>'
                  + (f'<p class="tw-intro" data-edit="intro">{escape(cfg.intro)}</p>' if cfg.intro else "") + f"{bar}{body}</div></section>")


register(Widget(
    name="team", label="Team", about="Your people from Business data and more: departments, filters, search and contact details.",
    config=TeamConfig, render=render, assets=["team.css"], requires=["modkit"],
))
