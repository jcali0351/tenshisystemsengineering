"""
widgets/popup.py: a popup (announcement, offer, newsletter sign-up) with frequency caps.

Opens after a delay, when the visitor scrolls part-way, or when the mouse leaves towards the tab bar (desktop).
How often: once per visit, once every N days, or until closed for good, remembered in the visitor's browser
(localStorage, no cookies, nothing sent anywhere). An accessible modal <dialog>: focus moves in, Esc and the close
button close it, focus returns. In the builder it is drawn in place (not as a popup) so it can be edited.
"""

from __future__ import annotations

from typing import Literal

from markupsafe import Markup, escape
from pydantic import BaseModel, ConfigDict, Field, field_validator

from . import Widget, WidgetContext, block_uid, clean_link, paragraphs, register


class PopupConfig(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
    heading: str = Field("10% off your first order", max_length=120, json_schema_extra={"label": "Heading"})
    text: str = Field("Join our list for news and offers.", max_length=800, json_schema_extra={"label": "Text", "type": "textarea"})
    image: str = Field("", max_length=12, json_schema_extra={"label": "Picture (optional)", "type": "media"})
    button_text: str = Field("Shop now", max_length=40, json_schema_extra={"label": "Button text (empty = none)"})
    button_link: str = Field("index", max_length=300, json_schema_extra={"label": "Button goes to", "type": "link"})
    newsletter: bool = Field(False, json_schema_extra={"label": "Show the newsletter sign-up instead of the button (needs a Newsletter block's settings)"})
    trigger: Literal["delay", "scroll", "exit"] = Field("delay", json_schema_extra={"label": "Opens", "options": [
        ["delay", "After a few seconds"], ["scroll", "When the visitor scrolls down"], ["exit", "When the mouse leaves the page (desktop)"]]})
    delay: int = Field(8, ge=0, le=120, json_schema_extra={"label": "Seconds (after a few seconds)"})
    scroll: int = Field(50, ge=10, le=100, json_schema_extra={"label": "Percent scrolled (when scrolling)"})
    frequency: Literal["session", "days", "once"] = Field("days", json_schema_extra={"label": "How often", "options": [
        ["session", "Once per visit"], ["days", "Once every few days"], ["once", "Once, never again after closing"]]})
    days: int = Field(7, ge=1, le=365, json_schema_extra={"label": "Days between (once every few days)"})
    mobile: bool = Field(True, json_schema_extra={"label": "Also on phones"})
    version: int = Field(1, ge=1, le=9999, json_schema_extra={"label": "Version (raise it to show a changed popup to everyone again)"})

    @field_validator("image", mode="before")
    @classmethod
    def _i(cls, v):
        return "" if v is None else str(v)

    @field_validator("button_link")
    @classmethod
    def _l(cls, v):
        return clean_link(v)


def render(block: dict, ctx: WidgetContext) -> Markup:
    from . import get
    cfg: PopupConfig = get("popup").config_for(block.get("data"))
    uid = block_uid(block)
    pic = ctx.media(cfg.image, 800) if cfg.image else ""
    action = ""
    if cfg.newsletter and get("newsletter"):
        from .newsletter import signup_form
        action = signup_form(block, ctx, compact=True)
    elif cfg.button_text:
        action = f'<p><a class="tw-btn" href="{escape(ctx.link(cfg.button_link))}" data-tw-popup-go>{escape(cfg.button_text)}</a></p>'
    inner = ((f'<img class="tw-pop-pic" src="{escape(pic)}" alt="" loading="lazy">' if pic else "")
             + f'<div class="tw-pop-body"><h2 id="pop-{uid}-h" data-edit="heading">{escape(cfg.heading)}</h2>'
             + (f'<div class="tw-pop-text">{paragraphs(cfg.text)}</div>' if cfg.text else "") + action + "</div>")
    if ctx.editing:
        return Markup(f'<section class="band tw-mod tw-pop-edit"><div class="wrap"><p class="tw-builder-hint">Popup: on the site this opens '
                      f'{"after " + str(cfg.delay) + " s" if cfg.trigger == "delay" else "at " + str(cfg.scroll) + "% scrolled" if cfg.trigger == "scroll" else "when the mouse leaves the page"}'
                      f', {"once per visit" if cfg.frequency == "session" else "at most every " + str(cfg.days) + " days" if cfg.frequency == "days" else "once"}.</p>'
                      f'<div class="tw-pop tw-pop-inline">{inner}</div></div></section>')
    key = f"tw-pop:{block.get('_page', '')}:{uid}:{cfg.version}"
    return Markup(f'<dialog class="tw-mod tw-pop" aria-labelledby="pop-{uid}-h" data-tw-popup data-key="{escape(key)}" data-trigger="{cfg.trigger}" '
                  f'data-delay="{cfg.delay}" data-scroll="{cfg.scroll}" data-frequency="{cfg.frequency}" data-days="{cfg.days}" data-mobile="{int(cfg.mobile)}">'
                  f'<button type="button" class="tw-pop-x" data-tw-popup-close aria-label="Close">×</button>{inner}</dialog>')


register(Widget(
    name="popup", label="Popup", about="An offer or announcement that opens once, with a delay, on scroll or on exit, and remembers it was closed.",
    config=PopupConfig, render=render, assets=["popup.css", "popup.js"], requires=["modkit", "newsletter"],
    hint="Shown in place while you edit. Visitors see it at most as often as you choose; no cookies are used.",
))
