"""
widgets/modkit.py: what every module block shares, so each one stays small and looks like the site:
  modkit.css   theme tokens (--m-p primary, --m-a accent, --m-s surface, --m-i ink, --m-card, --m-r radius, from the
               site's theme: cms/theme.py, light and dark), buttons, chips, cards, stars, form fields, carousels
  modkit.js    filter chips and search, carousels (buttons, keys), forms that send to the site's /__w/ endpoints
               (actions.py) with a status line that screen readers hear
Hidden: modules list it in requires=["modkit"].

Python helpers for module renderers: stars(), chip_bar(), carousel_nav(), form_open(), honeypot(), status_line().
"""

from __future__ import annotations

from markupsafe import Markup, escape
from pydantic import BaseModel

from . import Widget, register

register(Widget(name="modkit", label="Module kit", about="Shared styles and scripts of the module blocks.", config=BaseModel,
                render=lambda block, ctx: Markup(""), assets=["modkit.css", "modkit.js"], hidden=True))


def stars(rating, label=True) -> Markup:
    """★★★★☆ with the number for screen readers (rating 0-5, halves round to the nearest whole star)."""
    try:
        r = max(0.0, min(5.0, float(rating or 0)))
    except (TypeError, ValueError):
        r = 0.0
    full = int(round(r))
    text = f"{r:g} out of 5 stars"
    return Markup(f'<span class="tw-stars" role="img" aria-label="{text}"><span aria-hidden="true">{"★" * full}{"☆" * (5 - full)}</span></span>'
                  if label else f'<span class="tw-stars" aria-hidden="true">{"★" * full}{"☆" * (5 - full)}</span>')


def chip_bar(keys: list[tuple[str, str]], label: str, all_label: str = "All", search: str = "") -> Markup:
    """Filter chips (and an optional search box) for the items inside the same [data-tw-filterable]."""
    if not keys and not search:
        return Markup("")
    chips = "".join(f'<button type="button" class="tw-chip" data-tw-filter="{escape(k)}" aria-pressed="false">{escape(v)}</button>' for k, v in keys)
    box = (f'<label class="tw-search"><span class="tw-sr">{escape(search)}</span><input type="search" data-tw-search placeholder="{escape(search)}"></label>'
           if search else "")
    allb = f'<button type="button" class="tw-chip" data-tw-filter="" aria-pressed="true">{escape(all_label)}</button>' if keys else ""
    return Markup(f'<div class="tw-bar" role="group" aria-label="{escape(label)}">{box}<div class="tw-chips">{allb}{chips}</div>'
                  f'<p class="tw-shown tw-sr" data-tw-shown aria-live="polite"></p></div>')


def carousel_nav(label: str) -> Markup:
    return Markup(f'<div class="tw-cnav"><button type="button" class="tw-cbtn" data-tw-prev aria-label="Previous {escape(label)}">‹</button>'
                  f'<button type="button" class="tw-cbtn" data-tw-next aria-label="Next {escape(label)}">›</button></div>')


def honeypot() -> Markup:
    return Markup('<label class="tw-hp" aria-hidden="true">Leave this empty <input type="text" name="_hp" tabindex="-1" autocomplete="off"></label>')


def form_open(widget: str, action: str, block_key: str, ok: str, cls: str = "", label: str = "") -> Markup:
    """<form> that posts to the site's own /__w/<widget>/<action> (relative: works at every address of the site)."""
    return Markup(f'<form class="tw-form {escape(cls)}" method="post" action="__w/{escape(widget)}/{escape(action)}" data-tw-form '
                  f'data-ok="{escape(ok)}" novalidate{f" aria-label={chr(34)}{escape(label)}{chr(34)}" if label else ""}>'
                  f'<input type="hidden" name="_block" value="{escape(block_key)}">') + honeypot()


def status_line() -> Markup:
    return Markup('<p class="tw-status" data-tw-status role="status" aria-live="polite"></p>')


def field(name: str, label: str, type_: str = "text", required: bool = False, attrs: str = "", value: str = "") -> Markup:
    req = " required" if required else ""
    star = ' <span aria-hidden="true">*</span>' if required else ""
    if type_ == "textarea":
        inner = f'<textarea name="{name}" rows="4"{req} {attrs}>{escape(value)}</textarea>'
    else:
        inner = f'<input type="{type_}" name="{name}" value="{escape(value)}"{req} {attrs}>'
    return Markup(f'<label class="tw-field"><span>{escape(label)}{star}</span>{inner}</label>')


def block_key(block: dict) -> str:
    from . import block_uid
    return f"{block.get('_page', '')}/{block_uid(block)}"
