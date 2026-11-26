"""
widgets/booking.py: online booking from an outside service (Calendly, Cal.com, Acuity, SimplyBook, Square …): either a
button that opens the booking page, or the booking page embedded in the site.

The embed's host is added to frame-src ONLY on the page that has this block (Widget.block_csp → the deployment
manifest → widgets.csp_for_file), so other pages keep the strict policy. A button needs no policy change.
"""

from __future__ import annotations

from typing import Literal
from urllib.parse import urlsplit

from markupsafe import Markup, escape
from pydantic import BaseModel, ConfigDict, Field, field_validator

from . import Widget, WidgetContext, block_uid, register
from ..security import HOST_RE

KNOWN = ("calendly.com", "cal.com", "acuityscheduling.com", "as.me", "simplybook.me", "square.site", "squareup.com",
         "setmore.com", "youcanbook.me", "tidycal.com", "zcal.co", "bookings.cloud.microsoft", "outlook.office365.com",
         "calendar.google.com", "booksy.com", "fresha.com", "vagaro.com", "opentable.com", "resy.com")


class BookingConfig(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
    heading: str = Field("Book a time", max_length=120, json_schema_extra={"label": "Heading (empty = none)"})
    intro: str = Field("Pick a time that suits you. You'll get a confirmation by email.", max_length=400,
                       json_schema_extra={"label": "Intro", "type": "textarea"})
    url: str = Field("", max_length=500, json_schema_extra={"label": "Booking page address (https://…, e.g. your Calendly link)"})
    display: Literal["button", "embed"] = Field("button", json_schema_extra={
        "label": "Show", "options": [["button", "A button that opens the booking page"], ["embed", "The booking page inside this page"]]})
    button_text: str = Field("Book now", max_length=40, json_schema_extra={"label": "Button text"})
    height: int = Field(720, ge=320, le=1600, json_schema_extra={"label": "Embed height (px)"})

    @field_validator("url")
    @classmethod
    def _url(cls, v):
        v = (v or "").strip()
        if not v:
            return v
        parts = urlsplit(v)
        host = (parts.hostname or "").lower()
        if parts.scheme != "https" or not host or not HOST_RE.fullmatch(host) or parts.username or parts.port not in (None, 443):
            raise ValueError("use the booking page's full https:// address, like https://calendly.com/your-name/30min")
        return v


def host_of(url: str) -> str:
    return (urlsplit(url).hostname or "").lower() if url else ""


def is_known(host: str) -> bool:
    return any(host == k or host.endswith("." + k) for k in KNOWN)


def block_csp(cfg: BookingConfig) -> dict[str, list[str]]:
    host = host_of(cfg.url)
    if cfg.display != "embed" or not host:
        return {}
    return {"frame-src": [f"https://{host}"]}


def render(block: dict, ctx: WidgetContext) -> Markup:
    from . import get
    cfg: BookingConfig = get("booking").config_for(block.get("data"))
    uid = block_uid(block)
    head = f'<h2 id="bk-{uid}-h" data-edit="heading">{escape(cfg.heading)}</h2>' if cfg.heading else ""
    intro = f'<p class="intro">{escape(cfg.intro)}</p>' if cfg.intro else ""
    if not cfg.url:
        body = ('<p class="empty-note">Booking: paste your booking page address (Calendly, Cal.com, Acuity …) in the block\'s settings.</p>'
                if ctx.mode == "preview" else "")
    elif cfg.display == "embed":
        note = ("" if is_known(host_of(cfg.url)) or ctx.mode != "preview" else
                '<p class="tw-note">Not a booking service we know: check the page appears below once published. '
                "Some sites refuse to be shown inside other sites; use the button instead if so.</p>")
        body = (f'{note}<div class="tw-booking-frame"><iframe src="{escape(cfg.url)}" title="{escape(cfg.heading or "Booking")}" '
                f'style="height:{cfg.height}px" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="payment"></iframe></div>'
                f'<p class="tw-booking-alt"><a href="{escape(cfg.url)}" target="_blank" rel="noopener">Open the booking page in a new tab ↗</a></p>')
    else:
        body = f'<p><a class="btn" href="{escape(cfg.url)}" target="_blank" rel="noopener">{escape(cfg.button_text or "Book now")}</a></p>'
    labelled = f' aria-labelledby="bk-{uid}-h"' if head else ""
    return Markup(f'<section class="band tw-booking tw-booking-{cfg.display}"{labelled}><div class="wrap">{head}{intro}{body}</div></section>')


register(Widget(
    name="booking", label="Booking", about="Let customers book online: a button or an embedded Calendly, Cal.com, Acuity … page.",
    config=BookingConfig, render=render, assets=["booking.css"], block_csp=block_csp,
    hint="The booking service's address is allowed only on pages with this block (see Settings › Security).",
))
