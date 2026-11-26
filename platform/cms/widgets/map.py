"""
widgets/map.py: a map of one or more places, from Google Maps or OpenStreetMap.

  - Google, no key (the default): Google's plain maps?q=…&output=embed iframe. Several places: a list beside the map;
    choosing one moves the map there (map.js), and every place has a "Get directions" button.
  - Google with the site's own API key (Online › Map settings, /sites/<id>/widgets/map; site_settings, owners and
    admins only, never in git): the Maps JavaScript API with all places as markers in the theme's colour, the map
    fitted around them, and a style (standard, muted, dark or tinted with the theme). The script loads only when the
    map scrolls into view. If Google refuses the key, the plain iframe is shown instead.
  - OpenStreetMap: export/embed.html by latitude and longitude, no Google at all.

The Content-Security-Policy gets Google's (or OpenStreetMap's) hosts only on pages with a Map block (block_csp).
Empty address and no places = the business address and the locations in Business data.
"""

from __future__ import annotations

import json
import re
from typing import Literal
from urllib.parse import quote_plus

from markupsafe import Markup, escape
from pydantic import BaseModel, ConfigDict, Field, field_validator

from . import Widget, WidgetContext, block_uid, register

HEIGHTS = {"small": 280, "medium": 400, "large": 560}
KEY_RE = re.compile(r"^AIza[0-9A-Za-z_-]{35}$")
GOOGLE_JS = {"script-src": ["https://maps.googleapis.com"], "connect-src": ["https://maps.googleapis.com"],
             "style-src": ["https://fonts.googleapis.com"], "font-src": ["https://fonts.gstatic.com"],
             "img-src": ["https://maps.gstatic.com", "https://maps.googleapis.com"]}


def _coord(v, lo, hi, what):
    v = str(v or "").strip().replace(",", ".")
    if not v:
        return ""
    try:
        f = float(v)
    except ValueError:
        raise ValueError(f"{what} is a number like 51.5072") from None
    if not lo <= f <= hi:
        raise ValueError(f"{what} must be between {lo} and {hi}")
    return f"{f:.6f}".rstrip("0").rstrip(".")


class Place(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
    name: str = Field("", max_length=80, json_schema_extra={"label": "Name (e.g. Downtown shop)"})
    address: str = Field("", max_length=300, json_schema_extra={"label": "Address or place name"})
    latitude: str = Field("", max_length=20, json_schema_extra={"label": "Latitude (optional; needed for OpenStreetMap)"})
    longitude: str = Field("", max_length=20, json_schema_extra={"label": "Longitude (optional)"})

    @field_validator("latitude")
    @classmethod
    def _lat(cls, v):
        return _coord(v, -90, 90, "latitude")

    @field_validator("longitude")
    @classmethod
    def _lon(cls, v):
        return _coord(v, -180, 180, "longitude")


class MapSettings(BaseModel):
    """Per site (site_settings key widget:map). The key is a browser key: Google shows it to visitors by design, so
    restrict it to the site's addresses in Google Cloud. Owners and admins only."""
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
    api_key: str = Field("", max_length=60)
    style: Literal["standard", "muted", "dark", "theme"] = "theme"

    @field_validator("api_key")
    @classmethod
    def _key(cls, v):
        if v and not KEY_RE.fullmatch(v):
            raise ValueError("a Google Maps API key starts with AIza and is 39 characters long")
        return v


class MapConfig(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
    heading: str = Field("Find us", max_length=120, json_schema_extra={"label": "Heading (empty = none)"})
    address: str = Field("", max_length=300, json_schema_extra={"label": "Address or place (empty = the places below, or Business data)"})
    places: list[Place] = Field(default_factory=list, max_length=12, json_schema_extra={"label": "More places", "item_label": "Place"})
    provider: Literal["google", "openstreetmap"] = Field("google", json_schema_extra={
        "label": "Map", "options": [["google", "Google Maps"], ["openstreetmap", "OpenStreetMap (no Google; needs latitude and longitude)"]]})
    latitude: str = Field("", max_length=20, json_schema_extra={"label": "Latitude (OpenStreetMap)"})
    longitude: str = Field("", max_length=20, json_schema_extra={"label": "Longitude (OpenStreetMap)"})
    zoom: int = Field(15, ge=3, le=19, json_schema_extra={"label": "Zoom (3 = country, 19 = street)"})
    height: Literal["small", "medium", "large"] = Field("medium", json_schema_extra={
        "label": "Height", "options": [["small", "Small"], ["medium", "Medium"], ["large", "Large"]]})
    directions_button: bool = Field(True, json_schema_extra={"label": "Show a “Get directions” button"})
    directions_link: bool = Field(True, json_schema_extra={"label": "Show an “Open in maps” link"})

    @field_validator("latitude")
    @classmethod
    def _lat(cls, v):
        return _coord(v, -90, 90, "latitude")

    @field_validator("longitude")
    @classmethod
    def _lon(cls, v):
        return _coord(v, -180, 180, "longitude")


def places_for(cfg: MapConfig, profile: dict) -> list[dict]:
    """Every place to show: the address/coordinates, then the list; nothing typed = Business data."""
    out = []
    if cfg.address or (cfg.latitude and cfg.longitude):
        out.append({"name": "", "address": cfg.address, "lat": cfg.latitude, "lon": cfg.longitude})
    out += [{"name": p.name, "address": p.address, "lat": p.latitude, "lon": p.longitude} for p in cfg.places
            if p.address or (p.latitude and p.longitude)]
    if not out:
        company = (profile or {}).get("company") or {}
        if company.get("address"):
            out.append({"name": company.get("name", ""), "address": company["address"], "lat": "", "lon": ""})
        out += [{"name": loc.get("name", ""), "address": loc.get("address", ""), "lat": "", "lon": ""}
                for loc in (profile or {}).get("locations") or [] if loc.get("address") and loc.get("address") != company.get("address")]
    return out


def _query(p):
    return quote_plus(p["address"] or f"{p['lat']},{p['lon']}")


def urls(cfg: MapConfig, p: dict) -> dict:
    """embed, open (in maps), directions, and whether OpenStreetMap was used, for one place."""
    if cfg.provider == "openstreetmap" and p["lat"] and p["lon"]:
        lat, lon = float(p["lat"]), float(p["lon"])
        d = 360 / 2 ** cfg.zoom
        bbox = f"{lon - d:.5f},{lat - d * .6:.5f},{lon + d:.5f},{lat + d * .6:.5f}"
        return {"embed": f"https://www.openstreetmap.org/export/embed.html?bbox={bbox}&layer=mapnik&marker={lat},{lon}",
                "open": f"https://www.openstreetmap.org/?mlat={lat}&mlon={lon}#map={cfg.zoom}/{lat}/{lon}",
                "dir": f"https://www.openstreetmap.org/directions?route=%3B{lat}%2C{lon}", "osm": True}
    q = _query(p)
    return {"embed": f"https://www.google.com/maps?q={q}&z={cfg.zoom}&output=embed",
            "open": f"https://www.google.com/maps/search/?api=1&query={q}",
            "dir": f"https://www.google.com/maps/dir/?api=1&destination={q}", "osm": False}


def _uses_js(cfg: MapConfig, settings) -> bool:
    return cfg.provider == "google" and bool(settings and getattr(settings, "api_key", ""))


def block_csp(cfg: MapConfig, settings=None) -> dict[str, list[str]]:
    if cfg.provider == "openstreetmap":
        return {"frame-src": ["https://www.openstreetmap.org", "https://www.google.com"]}   # Google = fallback without coordinates
    if _uses_js(cfg, settings):
        return {**GOOGLE_JS, "frame-src": ["https://www.google.com"]}
    return {"frame-src": ["https://www.google.com"]}


def render(block: dict, ctx: WidgetContext) -> Markup:
    from . import get
    cfg: MapConfig = get("map").config_for(block.get("data"))
    uid = block_uid(block)
    places = places_for(cfg, ctx.profile)
    if not places:
        return Markup('<section class="band tw-map"><div class="wrap"><p class="empty-note">Map: type an address in the block\'s settings '
                      "or add the business address under Business data.</p></div></section>" if ctx.mode == "preview" else "")
    links = [urls(cfg, p) for p in places]
    first, u0 = places[0], links[0]
    note = ""
    if cfg.provider == "openstreetmap" and not u0["osm"] and ctx.mode == "preview":
        note = '<p class="tw-note">OpenStreetMap needs the latitude and longitude, so Google Maps is shown for now.</p>'
    label = f"Map of {first['name'] or first['address']}" if (first["name"] or first["address"]) else "Map"
    head = f'<h2 id="map-{uid}-h" data-edit="heading">{escape(cfg.heading)}</h2>' if cfg.heading else ""
    height = HEIGHTS[cfg.height]
    iframe = (f'<iframe src="{escape(u0["embed"])}" title="{escape(label)}" loading="lazy" '
              f'referrerpolicy="no-referrer-when-downgrade" allowfullscreen data-tw-map-frame></iframe>')
    js_cfg = ""
    if _uses_js(cfg, ctx.settings):
        data = {"key": ctx.settings.api_key, "style": ctx.settings.style, "zoom": cfg.zoom,
                "places": [{"name": p["name"], "address": p["address"], "lat": p["lat"], "lon": p["lon"], "dir": u["dir"]} for p, u in zip(places, links)]}
        js_cfg = ('<script type="application/json" data-tw-map-config>'
                  + json.dumps(data, ensure_ascii=False).replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026") + "</script>")
    frame = f'<div class="tw-map-frame" style="height:{height}px" data-tw-map>{iframe}{js_cfg}</div>'

    def actions(p, u, extra=""):
        bits = []
        if cfg.directions_button:
            bits.append(f'<a class="btn tw-map-dir" href="{escape(u["dir"])}" target="_blank" rel="noopener" data-tw-dir>Get directions</a>')
        if cfg.directions_link:
            bits.append(f'<a class="tw-map-open" href="{escape(u["open"])}" target="_blank" rel="noopener" data-tw-open>Open in maps ↗</a>')
        return f'<p class="tw-map-actions{extra}">' + "".join(bits) + "</p>" if bits else ""

    if len(places) > 1:
        items = "".join(
            f'<li><button type="button" class="tw-map-place" aria-pressed="{"true" if i == 0 else "false"}" '
            f'data-embed="{escape(u["embed"])}" data-dir="{escape(u["dir"])}" data-open="{escape(u["open"])}" data-i="{i}">'
            f'<b>{escape(p["name"] or p["address"])}</b>' + (f"<span>{escape(p['address'])}</span>" if p["name"] and p["address"] else "")
            + "</button></li>" for i, (p, u) in enumerate(zip(places, links)))
        body = (f'<div class="tw-map-multi"><div class="tw-map-side"><ul class="tw-map-list">{items}</ul>{actions(first, u0)}</div>{frame}</div>')
    else:
        foot_addr = f"<span>{escape(first['address'])}</span>" if first["address"] else ""
        body = frame + (f'<div class="tw-map-foot">{foot_addr}{actions(first, u0, " tw-map-actions-row")}</div>'
                        if foot_addr or cfg.directions_button or cfg.directions_link else "")
    labelled = f' aria-labelledby="map-{uid}-h"' if head else ""
    return Markup(f'<section class="band tw-map"{labelled}><div class="wrap">{head}{note}{body}</div></section>')


register(Widget(
    name="map", label="Map", about="A map of your address or several places: Google Maps (no key needed) or OpenStreetMap.",
    config=MapConfig, render=render, assets=["map.css", "map.js"], settings=MapSettings, block_csp=block_csp,
    hint='No key needed. For styled maps with all your places as markers, add a Google Maps API key under '
         '<a href="{settings}" target="_blank">Map settings</a> (owners and admins). '
         "For OpenStreetMap, find the place on openstreetmap.org, right-click it, choose “Show address” and copy the two numbers.",
))
