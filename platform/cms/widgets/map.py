"""
widgets/map.py: a map of an address, embedded from Google Maps or OpenStreetMap. No API key: Google's plain
maps?q=…&output=embed page, or OpenStreetMap's export/embed.html (which needs the latitude and longitude).
Both hosts are in every client page's frame-src already (widgets.BASE_CSP). Empty address = the business address.
"""

from __future__ import annotations

from typing import Literal
from urllib.parse import quote_plus

from markupsafe import Markup, escape
from pydantic import BaseModel, ConfigDict, Field, field_validator

from . import Widget, WidgetContext, block_uid, register

HEIGHTS = {"small": 280, "medium": 400, "large": 560}


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


class MapConfig(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
    heading: str = Field("Find us", max_length=120, json_schema_extra={"label": "Heading (empty = none)"})
    address: str = Field("", max_length=300, json_schema_extra={"label": "Address (empty = the address in Business data)"})
    provider: Literal["google", "openstreetmap"] = Field("google", json_schema_extra={
        "label": "Map", "options": [["google", "Google Maps"], ["openstreetmap", "OpenStreetMap (needs latitude and longitude)"]]})
    latitude: str = Field("", max_length=20, json_schema_extra={"label": "Latitude (OpenStreetMap)"})
    longitude: str = Field("", max_length=20, json_schema_extra={"label": "Longitude (OpenStreetMap)"})
    zoom: int = Field(15, ge=3, le=19, json_schema_extra={"label": "Zoom (3 = country, 19 = street)"})
    height: Literal["small", "medium", "large"] = Field("medium", json_schema_extra={
        "label": "Height", "options": [["small", "Small"], ["medium", "Medium"], ["large", "Large"]]})
    directions_link: bool = Field(True, json_schema_extra={"label": "Show an “Open in maps” link"})

    @field_validator("latitude")
    @classmethod
    def _lat(cls, v):
        return _coord(v, -90, 90, "latitude")

    @field_validator("longitude")
    @classmethod
    def _lon(cls, v):
        return _coord(v, -180, 180, "longitude")


def urls(cfg: MapConfig, address: str) -> tuple[str, str, bool]:
    """(embed address, 'open in maps' address, used OpenStreetMap)."""
    if cfg.provider == "openstreetmap" and cfg.latitude and cfg.longitude:
        lat, lon = float(cfg.latitude), float(cfg.longitude)
        d = 360 / 2 ** cfg.zoom
        bbox = f"{lon - d:.5f},{lat - d * .6:.5f},{lon + d:.5f},{lat + d * .6:.5f}"
        return (f"https://www.openstreetmap.org/export/embed.html?bbox={bbox}&layer=mapnik&marker={lat},{lon}",
                f"https://www.openstreetmap.org/?mlat={lat}&mlon={lon}#map={cfg.zoom}/{lat}/{lon}", True)
    q = quote_plus(address or f"{cfg.latitude},{cfg.longitude}")
    return (f"https://www.google.com/maps?q={q}&z={cfg.zoom}&output=embed",
            f"https://www.google.com/maps/search/?api=1&query={q}", False)


def render(block: dict, ctx: WidgetContext) -> Markup:
    from . import get
    cfg: MapConfig = get("map").config_for(block.get("data"))
    uid = block_uid(block)
    address = cfg.address or str(((ctx.profile or {}).get("company") or {}).get("address") or "")
    if not address and not (cfg.latitude and cfg.longitude):
        return Markup('<section class="band tw-map"><div class="wrap"><p class="empty-note">Map: type an address in the block\'s settings '
                      "or add the business address under Business data.</p></div></section>" if ctx.mode == "preview" else "")
    embed, open_url, osm = urls(cfg, address)
    note = ""
    if cfg.provider == "openstreetmap" and not osm and ctx.mode == "preview":
        note = '<p class="tw-note">OpenStreetMap needs the latitude and longitude, so Google Maps is shown for now.</p>'
    label = f"Map of {address}" if address else "Map"
    head = f'<h2 id="map-{uid}-h" data-edit="heading">{escape(cfg.heading)}</h2>' if cfg.heading else ""
    foot = ""
    if cfg.directions_link or address:
        foot = ('<p class="tw-map-foot">' + (f"<span>{escape(address)}</span>" if address else "")
                + (f'<a href="{escape(open_url)}" target="_blank" rel="noopener">Open in maps ↗</a>' if cfg.directions_link else "") + "</p>")
    labelled = f' aria-labelledby="map-{uid}-h"' if head else ""
    return Markup(
        f'<section class="band tw-map"{labelled}><div class="wrap">{head}{note}'
        f'<div class="tw-map-frame" style="height:{HEIGHTS[cfg.height]}px"><iframe src="{escape(embed)}" title="{escape(label)}" '
        f'loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe></div>{foot}</div></section>')


register(Widget(
    name="map", label="Map", about="A map of your address from Google Maps or OpenStreetMap. No account or key needed.",
    config=MapConfig, render=render, assets=["map.css"],
    hint="For OpenStreetMap, find the place on openstreetmap.org, right-click it, choose “Show address” and copy the two numbers.",
))
