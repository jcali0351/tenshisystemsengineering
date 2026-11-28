"""
widgets/columns.py: "Columns": a row of 1 to 4 content areas side by side. Each area can hold a picture, a heading,
formatted text and a button, and every part is edited in place in the page builder: type over the words, drop a
photo onto the picture, use the formatting bar on the text. On phones the areas stack.

Field names inside an area use dotted paths in the builder's inline editing (areas.0.heading, areas.1.text), which the
builder writes back into the block's data. Text is formatted HTML, cleaned on save (sanitize.clean) and again when drawn.
"""

from __future__ import annotations

from typing import Literal

from markupsafe import Markup, escape
from pydantic import BaseModel, ConfigDict, Field, field_validator

from . import Widget, WidgetContext, block_uid, clean_link, register


def _clean(v):
    from .. import sanitize
    return sanitize.clean(str(v or ""))


class Area(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
    image: str = Field("", max_length=12, json_schema_extra={"label": "Picture", "type": "media"})
    heading: str = Field("A clear heading", max_length=160, json_schema_extra={"label": "Heading"})
    text: str = Field("<p>A few words about this. Click here in the preview and type.</p>", max_length=8000,
                      json_schema_extra={"label": "Text", "type": "rich"})
    button_text: str = Field("", max_length=60, json_schema_extra={"label": "Button text (empty = no button)"})
    button_link: str = Field("", max_length=500, json_schema_extra={"label": "Button goes to", "type": "link"})

    @field_validator("image", mode="before")
    @classmethod
    def _i(cls, v):
        return "" if v is None else str(v)

    @field_validator("text")
    @classmethod
    def _t(cls, v):
        return _clean(v)

    @field_validator("button_link")
    @classmethod
    def _l(cls, v):
        return clean_link(v)


def _three():
    return [Area(heading="First thing", text="<p>Say what makes you different.</p>"),
            Area(heading="Second thing", text="<p>One short paragraph each works best.</p>"),
            Area(heading="Third thing", text="<p>Drop a photo on any area to add a picture.</p>")]


class ColumnsConfig(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
    heading: str = Field("", max_length=160, json_schema_extra={"label": "Heading above the columns (optional)"})
    areas: list[Area] = Field(default_factory=_three, min_length=1, max_length=4,
                              json_schema_extra={"label": "Content areas (1 to 4, side by side)", "item_label": "Area"})
    style: Literal["plain", "cards", "lined"] = Field("cards", json_schema_extra={"label": "Look", "options": [
        ["plain", "Plain"], ["cards", "Cards"], ["lined", "Thin lines between"]]})
    align: Literal["left", "center"] = Field("left", json_schema_extra={"label": "Text", "options": [["left", "Left"], ["center", "Centred"]]})
    picture: Literal["wide", "square", "round", "natural"] = Field("wide", json_schema_extra={"label": "Picture shape", "options": [
        ["wide", "Wide (3:2)"], ["square", "Square"], ["round", "Round"], ["natural", "As it is"]]})
    widths: Literal["equal", "wide-first", "wide-last"] = Field("equal", json_schema_extra={"label": "Widths (2 or 3 areas)", "options": [
        ["equal", "Equal"], ["wide-first", "First one wider"], ["wide-last", "Last one wider"]]})
    background: Literal["none", "soft", "brand"] = Field("none", json_schema_extra={"label": "Background", "options": [
        ["none", "None"], ["soft", "Soft tint"], ["brand", "Brand colour"]]})


def render(block: dict, ctx: WidgetContext) -> Markup:
    from . import get
    from ..render import clean_html
    cfg: ColumnsConfig = get("columns").config_for(block.get("data"))
    uid = block_uid(block)
    areas = []
    for i, a in enumerate(cfg.areas):
        pic = ctx.media(a.image, 1200) if a.image else ""
        if pic:
            img = f'<figure class="tw-col-pic" data-media="areas.{i}.image"><img src="{escape(pic)}" alt="{escape(ctx.media_alt(a.image))}" loading="lazy"></figure>'
        elif ctx.editing:
            img = f'<figure class="tw-col-pic tw-col-drop" data-media="areas.{i}.image"><span>Drop a photo here</span></figure>'
        else:
            img = ""
        head = f'<h3 data-edit="areas.{i}.heading">{escape(a.heading)}</h3>' if (a.heading or ctx.editing) else ""
        body = f'<div class="tw-col-text" data-edit="areas.{i}.text" data-rich>{clean_html(a.text)}</div>' if (a.text or ctx.editing) else ""
        btn = (f'<p class="tw-col-act"><a class="tw-btn" href="{escape(ctx.link(a.button_link or "contact"))}" data-edit="areas.{i}.button_text">{escape(a.button_text)}</a></p>'
               if a.button_text else "")
        areas.append(f'<div class="tw-col">{img}<div class="tw-col-body">{head}{body}{btn}</div></div>')
    n = len(areas)
    cls = f"tw-cols tw-cols-{n} tw-cols-{cfg.style} tw-cols-{cfg.align} tw-pic-{cfg.picture}" + (f" tw-w-{cfg.widths}" if n in (2, 3) else "")
    head = (f'<h2 id="col-{uid}-h" data-edit="heading">{escape(cfg.heading)}</h2>' if cfg.heading else "")
    label = f' aria-labelledby="col-{uid}-h"' if cfg.heading else ""
    return Markup(f'<section class="band tw-mod tw-columns tw-bg-{cfg.background}"{label}>'
                  f'<div class="wrap">{head}<div class="{cls}">{"".join(areas)}</div></div></section>')


register(Widget(
    name="columns", label="Columns", about="1 to 4 content areas side by side: picture, heading, text and a button in each.",
    config=ColumnsConfig, render=render, assets=["columns.css"], requires=["modkit"],
))
