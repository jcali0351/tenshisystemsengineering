"""
widgets/locations.py: several locations on one map (the Map widget, widgets/map.py: Google with or without the
site's key, or OpenStreetMap) with a card per location: address, phone, email, hours, Get directions, and
"Show on map" (moves the plain map there). Nothing typed = the business address and Business data › Locations.
"""

from __future__ import annotations

import dataclasses
import re
from typing import Literal

from markupsafe import Markup, escape
from pydantic import BaseModel, ConfigDict, Field, field_validator

from . import Widget, WidgetContext, block_uid, load_settings, register


class Spot(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
    name: str = Field("", max_length=80, json_schema_extra={"label": "Name (e.g. Downtown)"})
    address: str = Field("", max_length=300, json_schema_extra={"label": "Address"})
    phone: str = Field("", max_length=40, json_schema_extra={"label": "Phone"})
    email: str = Field("", max_length=200, json_schema_extra={"label": "Email"})
    hours: str = Field("", max_length=300, json_schema_extra={"label": "Hours (e.g. Mon–Fri 9–5, Sat 10–2)", "type": "textarea"})
    latitude: str = Field("", max_length=20, json_schema_extra={"label": "Latitude (optional)"})
    longitude: str = Field("", max_length=20, json_schema_extra={"label": "Longitude (optional)"})

    @field_validator("phone")
    @classmethod
    def _ph(cls, v):
        if v and not re.match(r"^[0-9+()./ -]{3,40}$", v):
            raise ValueError("a phone number has digits, spaces, +, - and brackets")
        return v

    @field_validator("email")
    @classmethod
    def _e(cls, v):
        if v and not re.match(r"^[^@\s<>\"']{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$", v):
            raise ValueError("that email address doesn't look right")
        return v


class LocationsConfig(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
    heading: str = Field("Our locations", max_length=120, json_schema_extra={"label": "Heading"})
    intro: str = Field("", max_length=400, json_schema_extra={"label": "Intro", "type": "textarea"})
    places: list[Spot] = Field(default_factory=list, max_length=12, json_schema_extra={"label": "Locations (empty = Business data)", "item_label": "Location"})
    provider: Literal["google", "openstreetmap"] = Field("google", json_schema_extra={"label": "Map", "options": [["google", "Google Maps"], ["openstreetmap", "OpenStreetMap"]]})
    height: Literal["small", "medium", "large"] = Field("medium", json_schema_extra={"label": "Map height", "options": [["small", "Small"], ["medium", "Medium"], ["large", "Large"]]})
    map_side: Literal["top", "left"] = Field("left", json_schema_extra={"label": "Map", "options": [["left", "Beside the cards"], ["top", "Above the cards"]]})


def spots(cfg: LocationsConfig, profile: dict) -> list[dict]:
    if cfg.places:
        return [p.model_dump() for p in cfg.places if p.address or (p.latitude and p.longitude)]
    company = (profile or {}).get("company") or {}
    out = []
    if company.get("address"):
        hours = "; ".join(f'{h.get("days", "")} {h.get("time", "")}'.strip() for h in company.get("hours") or [] if isinstance(h, dict))
        out.append({"name": company.get("name", ""), "address": company["address"], "phone": company.get("phone", ""), "email": company.get("email", ""),
                    "hours": hours, "latitude": "", "longitude": ""})
    for loc in (profile or {}).get("locations") or []:
        if isinstance(loc, dict) and loc.get("address") and loc.get("address") != company.get("address"):
            out.append({"name": loc.get("name", ""), "address": loc["address"], "phone": loc.get("phone", ""), "email": "", "hours": "", "latitude": "", "longitude": ""})
    return out


def _map_parts(cfg: LocationsConfig, sp: list[dict]):
    from . import get
    data = {"heading": "", "provider": cfg.provider, "height": cfg.height, "directions_button": False, "directions_link": False, "show_list": False,
            "places": [{"name": s["name"], "address": s["address"], "latitude": s["latitude"], "longitude": s["longitude"]} for s in sp]}
    return get("map"), data


def render(block: dict, ctx: WidgetContext) -> Markup:
    from . import get
    from .map import urls
    cfg: LocationsConfig = get("locations").config_for(block.get("data"))
    uid = block_uid(block)
    sp = spots(cfg, ctx.profile)
    if not sp:
        return Markup('<section class="band tw-mod"><div class="wrap"><p class="tw-builder-hint">Locations: add them in this block or in Business data › Locations.</p></div></section>'
                      if ctx.mode == "preview" else "")
    mw, data = _map_parts(cfg, sp)
    mcfg = mw.config_for(data)
    mctx = dataclasses.replace(ctx, settings=load_settings(ctx.site.get("id"), "map") if ctx.site.get("id") else None)
    map_html = str(mw.render({"id": f"{uid}-map", "type": "map", "data": data}, mctx))
    # just the map frame from the Map block's section
    m = re.search(r'<div class="tw-map-frame".*?</div>(?=</div></section>)', map_html, re.S)
    frame = m.group(0) if m else map_html
    cards = []
    for i, s in enumerate(sp):
        u = urls(mcfg, {"name": s["name"], "address": s["address"], "lat": s["latitude"], "lon": s["longitude"]})
        tel = re.sub(r"[^0-9+]", "", s["phone"] or "")
        cards.append(f'<li class="tw-loc"><h3>{escape(s["name"] or s["address"])}</h3>'
                     + (f'<p class="tw-loc-addr">{escape(s["address"])}</p>' if s["name"] and s["address"] else "")
                     + (f'<p><a href="tel:{escape(tel)}">{escape(s["phone"])}</a></p>' if s["phone"] else "")
                     + (f'<p><a href="mailto:{escape(s["email"])}">{escape(s["email"])}</a></p>' if s["email"] else "")
                     + (f'<p class="tw-loc-hours">{escape(s["hours"])}</p>' if s["hours"] else "")
                     + f'<p class="tw-loc-act"><a class="tw-btn" href="{escape(u["dir"])}" target="_blank" rel="noopener">Get directions'
                     f'<span class="tw-sr"> to {escape(s["name"] or s["address"])}</span></a>'
                     + (f'<button type="button" class="tw-btn tw-btn-ghost" data-tw-loc="{escape(u["embed"])}" aria-pressed="{"true" if i == 0 else "false"}" hidden>Show on map'
                        f'<span class="tw-sr">: {escape(s["name"] or s["address"])}</span></button>' if len(sp) > 1 else "") + "</p></li>")
    head = f'<h2 id="loc-{uid}-h" data-edit="heading">{escape(cfg.heading)}</h2>' if cfg.heading else ""
    label = f'aria-labelledby="loc-{uid}-h"' if cfg.heading else 'aria-label="Locations"'
    return Markup(f'<section class="band tw-mod tw-locs tw-locs-{cfg.map_side}" {label} data-tw-locs><div class="wrap"><div class="tw-head">{head}</div>'
                  + (f'<p class="tw-intro" data-edit="intro">{escape(cfg.intro)}</p>' if cfg.intro else "")
                  + f'<div class="tw-locs-grid"><div class="tw-locs-map tw-map">{frame}</div><ul class="tw-loc-list">{"".join(cards)}</ul></div></div></section>')


def block_csp(cfg: LocationsConfig, settings=None) -> dict:
    from . import get
    mw = get("map")
    data = {"provider": cfg.provider, "places": [{"address": p.address, "latitude": p.latitude, "longitude": p.longitude} for p in cfg.places]}
    return mw.block_csp(mw.config_for(data), settings)


register(Widget(
    name="locations", label="Locations", about="All your locations on one map, each with address, phone, hours and directions.",
    config=LocationsConfig, render=render, block_csp=block_csp, assets=["locations.css", "locations.js"], requires=["modkit", "map"],
    hint="Uses the Map settings (Google key, style) if you have them. Nothing typed = Business data.",
))
