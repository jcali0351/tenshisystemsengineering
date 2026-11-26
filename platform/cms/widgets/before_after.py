"""
widgets/before_after.py: the Before & after block (replaces the templates' own, same settings, so existing blocks keep
working), upgraded: side-to-side or top-to-bottom, a starting position, your own labels, more pairs in one block, and
an accessible control: drag the picture (mouse or touch), or focus it and use the arrow keys (Home / End jump to the
ends); screen readers hear "40% before, 60% after". Without JavaScript both pictures show split in the middle.
"""

from __future__ import annotations

from typing import Literal

from markupsafe import Markup, escape
from pydantic import BaseModel, ConfigDict, Field, field_validator

from . import Widget, WidgetContext, block_uid, register


def _media_id(v):
    return "" if v is None else str(v)


class Pair(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
    before: str = Field("", max_length=12, json_schema_extra={"label": "Before picture", "type": "media"})
    after: str = Field("", max_length=12, json_schema_extra={"label": "After picture", "type": "media"})
    caption: str = Field("", max_length=200, json_schema_extra={"label": "Caption"})
    _m = field_validator("before", "after", mode="before")(classmethod(lambda cls, v: _media_id(v)))


class BeforeAfterConfig(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
    heading: str = Field("Before and after", max_length=120, json_schema_extra={"label": "Heading"})
    before: str = Field("", max_length=12, json_schema_extra={"label": "Before picture", "type": "media"})
    after: str = Field("", max_length=12, json_schema_extra={"label": "After picture", "type": "media"})
    caption: str = Field("", max_length=200, json_schema_extra={"label": "Caption"})
    more: list[Pair] = Field(default_factory=list, max_length=12, json_schema_extra={"label": "More pairs", "item_label": "Pair"})
    direction: Literal["horizontal", "vertical"] = Field("horizontal", json_schema_extra={"label": "Slide", "options": [
        ["horizontal", "Side to side"], ["vertical", "Top to bottom"]]})
    start: int = Field(50, ge=0, le=100, json_schema_extra={"label": "Start at (% showing “before”)"})
    before_label: str = Field("Before", max_length=30, json_schema_extra={"label": "“Before” label"})
    after_label: str = Field("After", max_length=30, json_schema_extra={"label": "“After” label"})
    _m = field_validator("before", "after", mode="before")(classmethod(lambda cls, v: _media_id(v)))


def pair_html(ctx: WidgetContext, cfg: BeforeAfterConfig, before: str, after: str, caption: str, n: int) -> str:
    b_alt = ctx.media_alt(before) or cfg.before_label
    a_alt = ctx.media_alt(after) or cfg.after_label
    label = f"{caption} – " if caption else ""
    start = cfg.start
    return (
        f'<figure class="tw-ba tw-ba-{cfg.direction[0]}" style="--pos:{start}%" data-tw-ba data-dir="{cfg.direction[0]}">'
        f'<div class="tw-ba-frame">'
        f'<img class="tw-ba-after" src="{escape(ctx.media(after, 1600))}" alt="{escape(cfg.after_label)}: {escape(a_alt)}" loading="{"eager" if n == 0 else "lazy"}" decoding="async">'
        f'<img class="tw-ba-before" src="{escape(ctx.media(before, 1600))}" alt="{escape(cfg.before_label)}: {escape(b_alt)}" loading="{"eager" if n == 0 else "lazy"}" decoding="async">'
        f'<span class="tw-ba-line" aria-hidden="true"><span class="tw-ba-knob"></span></span>'
        f'<span class="tw-ba-tag tw-ba-tag-b" aria-hidden="true">{escape(cfg.before_label)}</span>'
        f'<span class="tw-ba-tag tw-ba-tag-a" aria-hidden="true">{escape(cfg.after_label)}</span>'
        f'<input class="tw-ba-range" type="range" min="0" max="100" step="1" value="{start}" '
        f'aria-label="{escape(label)}compare {escape(cfg.before_label.lower())} and {escape(cfg.after_label.lower())}" '
        f'aria-valuetext="{start}% {escape(cfg.before_label.lower())}, {100 - start}% {escape(cfg.after_label.lower())}"'
        f'{" aria-orientation=" + chr(34) + "vertical" + chr(34) if cfg.direction == "vertical" else ""}>'
        f'</div>' + (f'<figcaption>{escape(caption)}</figcaption>' if caption else "") + '</figure>')


def render(block: dict, ctx: WidgetContext) -> Markup:
    from . import get
    cfg: BeforeAfterConfig = get("before_after").config_for(block.get("data"))
    uid = block_uid(block)
    pairs = ([(cfg.before, cfg.after, cfg.caption)] if cfg.before and cfg.after else []) + \
            [(p.before, p.after, p.caption) for p in cfg.more if p.before and p.after]
    pairs = [p for p in pairs if ctx.media(p[0], 1600) and ctx.media(p[1], 1600)]
    head = f'<h2 id="ba-{uid}-h" data-edit="heading">{escape(cfg.heading)}</h2>' if cfg.heading else ""
    if not pairs:
        if ctx.mode != "preview":
            return Markup("")
        return Markup(f'<section class="band tw-mod tw-bab"><div class="wrap narrow">{head}<p class="tw-empty">Pick a “before” and an “after” picture in this block\'s settings.</p></div></section>')
    body = "".join(pair_html(ctx, cfg, b, a, c, i) for i, (b, a, c) in enumerate(pairs))
    cls = "tw-ba-list" + (" tw-ba-many" if len(pairs) > 1 else "")
    return Markup(f'<section class="band tw-mod tw-bab" aria-labelledby="ba-{uid}-h"><div class="wrap{" narrow" if len(pairs) == 1 else ""}">'
                  f'{head}<div class="{cls}">{body}</div></div></section>')


register(Widget(
    name="before_after", label="Before & after", about="Drag to compare two pictures: side to side or top to bottom, one pair or several.",
    config=BeforeAfterConfig, render=render, assets=["before_after.css", "before_after.js"], requires=["modkit"],
    hint="Use two pictures taken from the same spot and the same size, so the slider lines up.",
))
