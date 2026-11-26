"""
widgets/hours.py: opening hours with holidays and an "Open now" badge, in the site's time zone (sitetime.py).

The table and holiday list are drawn on the server; the badge ("Open now · closes 5 pm" / "Closed · opens Mon 9 am")
is worked out in the visitor's browser with the site's time zone, so a published page stays right all day. Closing
after midnight works (e.g. 18:00–02:00). Search engines get openingHoursSpecification (JSON-LD).
"""

from __future__ import annotations

import json
import re
from datetime import date
from typing import Literal

from markupsafe import Markup, escape
from pydantic import BaseModel, ConfigDict, Field, field_validator

from . import Widget, WidgetContext, block_uid, register
from .. import sitetime

TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
DAYS = [("mon", "Monday"), ("tue", "Tuesday"), ("wed", "Wednesday"), ("thu", "Thursday"), ("fri", "Friday"), ("sat", "Saturday"), ("sun", "Sunday")]
SCHEMA_DAYS = {"mon": "Monday", "tue": "Tuesday", "wed": "Wednesday", "thu": "Thursday", "fri": "Friday", "sat": "Saturday", "sun": "Sunday"}


def _time(v):
    if v and not TIME_RE.match(v):
        raise ValueError("a time is written like 09:00 or 17:30")
    return v


class Day(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
    day: Literal["mon", "tue", "wed", "thu", "fri", "sat", "sun"] = Field("mon", json_schema_extra={"label": "Day", "options": [[k, v] for k, v in DAYS]})
    opens: str = Field("09:00", max_length=5, json_schema_extra={"label": "Opens (HH:MM)"})
    closes: str = Field("17:00", max_length=5, json_schema_extra={"label": "Closes (HH:MM)"})
    closed: bool = Field(False, json_schema_extra={"label": "Closed all day"})
    @field_validator("opens", "closes")
    @classmethod
    def _times(cls, v):
        return _time(v)


class Holiday(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
    date: str = Field("", max_length=10, json_schema_extra={"label": "Date (YYYY-MM-DD)"})
    label: str = Field("Holiday", max_length=60, json_schema_extra={"label": "Name"})
    closed: bool = Field(True, json_schema_extra={"label": "Closed"})
    opens: str = Field("", max_length=5, json_schema_extra={"label": "Or opens (HH:MM)"})
    closes: str = Field("", max_length=5, json_schema_extra={"label": "Closes (HH:MM)"})
    @field_validator("opens", "closes")
    @classmethod
    def _times(cls, v):
        return _time(v)

    @field_validator("date")
    @classmethod
    def _d(cls, v):
        if v:
            if not re.match(r"^\d{4}-\d{2}-\d{2}$", v):
                raise ValueError("a date is written like 2026-12-25")
            date.fromisoformat(v)
        return v


def _week():
    return [Day(day=k, opens="09:00", closes="17:00") for k in ("mon", "tue", "wed", "thu", "fri")] + \
           [Day(day="sat", opens="10:00", closes="14:00"), Day(day="sun", closed=True)]


class HoursConfig(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
    heading: str = Field("Opening hours", max_length=120, json_schema_extra={"label": "Heading"})
    days: list[Day] = Field(default_factory=_week, max_length=14, json_schema_extra={"label": "Week", "item_label": "Day"})
    holidays: list[Holiday] = Field(default_factory=list, max_length=60, json_schema_extra={"label": "Holidays and special days", "item_label": "Day"})
    badge: bool = Field(True, json_schema_extra={"label": "Show “Open now / Closed”"})
    note: str = Field("", max_length=300, json_schema_extra={"label": "Note (e.g. “Appointments outside these hours on request”)"})
    layout: Literal["card", "compact"] = Field("card", json_schema_extra={"label": "Look", "options": [["card", "Card"], ["compact", "Compact line"]]})


def _fmt(t: str) -> str:
    if not t:
        return ""
    h, m = int(t[:2]), t[3:]
    return f"{h % 12 or 12}{'' if m == '00' else ':' + m} {'am' if h < 12 else 'pm'}"


def week_map(cfg: HoursConfig) -> dict[str, list[tuple[str, str]]]:
    out: dict[str, list[tuple[str, str]]] = {k: [] for k, _ in DAYS}
    for d in cfg.days:
        if not d.closed and d.opens and d.closes:
            out[d.day].append((d.opens, d.closes))
    return out


def json_ld(site: dict, week: dict, cfg: HoursConfig) -> str:
    spec = [{"@type": "OpeningHoursSpecification", "dayOfWeek": f"https://schema.org/{SCHEMA_DAYS[k]}", "opens": o, "closes": c}
            for k, spans in week.items() for o, c in spans]
    spec += [{"@type": "OpeningHoursSpecification", "validFrom": h.date, "validThrough": h.date,
              **({"opens": "00:00", "closes": "00:00"} if h.closed or not (h.opens and h.closes) else {"opens": h.opens, "closes": h.closes})}
             for h in cfg.holidays if h.date]
    data = {"@context": "https://schema.org", "@type": "LocalBusiness", "name": site.get("name") or "", "openingHoursSpecification": spec}
    return json.dumps(data, ensure_ascii=False).replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")


def render(block: dict, ctx: WidgetContext) -> Markup:
    from . import get
    cfg: HoursConfig = get("hours").config_for(block.get("data"))
    uid = block_uid(block)
    tz = sitetime.get(ctx.site.get("id"))
    week = week_map(cfg)
    rows = "".join(
        f'<tr data-day="{k}"><th scope="row">{label}</th><td>'
        + (", ".join(f"{_fmt(o)} – {_fmt(c)}" for o, c in week[k]) or "Closed") + "</td></tr>" for k, label in DAYS)
    today = sitetime.now(ctx.site.get("id")).date().isoformat()
    upcoming = sorted([h for h in cfg.holidays if h.date and h.date >= today], key=lambda h: h.date)[:8]
    hol = "".join(f'<li data-date="{h.date}"><b>{escape(h.label)}</b> <span>{date.fromisoformat(h.date):%a %-d %b}</span>: '
                  + ("Closed" if h.closed or not (h.opens and h.closes) else f"{_fmt(h.opens)} – {_fmt(h.closes)}") + "</li>" for h in upcoming)
    data = json.dumps({"tz": tz, "week": week, "holidays": {h.date: ([] if h.closed or not (h.opens and h.closes) else [[h.opens, h.closes]])
                                                           for h in cfg.holidays if h.date}}).replace("<", "\\u003c")
    badge = f'<p class="tw-open" data-tw-open role="status" hidden></p>' if cfg.badge else ""
    head = f'<h2 id="hr-{uid}-h" data-edit="heading">{escape(cfg.heading)}</h2>' if cfg.heading else ""
    if cfg.layout == "compact":
        return Markup(f'<section class="band tw-mod tw-hours tw-hours-compact" aria-label="{escape(cfg.heading or "Opening hours")}" data-tw-hours>'
                      f'<div class="wrap">{badge}<details><summary>See all opening hours</summary><table class="tw-hours-t">{rows}</table></details>'
                      f'<script type="application/json" data-tw-hours-data>{data}</script></div></section>')
    return Markup(
        f'<section class="band tw-mod tw-hours" aria-labelledby="hr-{uid}-h" data-tw-hours><div class="wrap"><div class="tw-hours-card">'
        f'<div class="tw-head">{head}{badge}</div>'
        f'<table class="tw-hours-t"><caption class="tw-sr">Opening hours, {escape(tz.replace("_", " "))} time</caption>{rows}</table>'
        + (f'<h3 class="tw-hours-h">Holidays and special days</h3><ul class="tw-hours-hol">{hol}</ul>' if hol else "")
        + (f'<p class="tw-note">{escape(cfg.note)}</p>' if cfg.note else "")
        + f'<p class="tw-note">Times are {escape(tz.replace("_", " "))} time.</p></div>'
        f'<script type="application/json" data-tw-hours-data>{data}</script>'
        f'<script type="application/ld+json">{json_ld(ctx.site, week, cfg)}</script></div></section>')


register(Widget(
    name="hours", label="Opening hours", about="Your week, holidays and special days, with an “Open now” badge in your time zone.",
    config=HoursConfig, render=render, assets=["hours.css", "hours.js"], requires=["modkit"],
    hint="The time zone is under Settings & theme › Address. Holidays override the usual hours on their day.",
))
