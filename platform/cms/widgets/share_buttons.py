"""
widgets/share_buttons.py: share buttons and click-to-post quotes as PLAIN LINKS to each network's own share page
(no third-party scripts, nothing loads from the networks, no tracking). On the live site a tiny script swaps in the
address the visitor is actually on (e.g. a custom domain); without scripts the links use the site's address.
"""

from __future__ import annotations

import re
from urllib.parse import quote, urlencode

from markupsafe import Markup, escape
from pydantic import BaseModel, ConfigDict, Field, field_validator

from . import Widget, WidgetContext, block_uid, register

NETS = [("x", "X"), ("facebook", "Facebook"), ("linkedin", "LinkedIn"), ("whatsapp", "WhatsApp"), ("bluesky", "Bluesky"),
        ("reddit", "Reddit"), ("email", "Email")]
GLYPH = {"x": "𝕏", "facebook": "f", "linkedin": "in", "whatsapp": "✆", "bluesky": "🦋", "reddit": "r/", "email": "✉", "copy": "⧉"}


def share_url(net: str, url: str, text: str) -> str:
    u, t = quote(url, safe=""), quote(text, safe="")
    return {"x": f"https://x.com/intent/post?text={t}&url={u}",
            "facebook": f"https://www.facebook.com/sharer/sharer.php?u={u}",
            "linkedin": f"https://www.linkedin.com/sharing/share-offsite/?url={u}",
            "whatsapp": f"https://wa.me/?text={quote(f'{text} {url}'.strip(), safe='')}",
            "bluesky": f"https://bsky.app/intent/compose?text={quote(f'{text} {url}'.strip(), safe='')}",
            "reddit": f"https://www.reddit.com/submit?url={u}&title={t}",
            "email": "mailto:?subject=" + t + "&body=" + quote((text + "\n\n" + url).strip(), safe="")}[net]


def page_url(block: dict, ctx: WidgetContext) -> str:
    from .. import config
    page = block.get("_page") or "index"
    base = config.site_url(ctx.site.get("subdomain", "")) if ctx.site.get("subdomain") else ""
    return base + ("" if page == "index" else f"{page}.html")


class ShareConfig(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
    label: str = Field("Share this page", max_length=60, json_schema_extra={"label": "Label (empty = none)"})
    text: str = Field("", max_length=200, json_schema_extra={"label": "Text to share (empty = the site's name)"})
    networks: str = Field("x, facebook, linkedin, whatsapp, email", max_length=120, json_schema_extra={
        "label": "Networks (comma-separated: x, facebook, linkedin, whatsapp, bluesky, reddit, email)"})
    copy_link: bool = Field(True, json_schema_extra={"label": "“Copy link” button"})
    style: str = Field("buttons", max_length=10, json_schema_extra={"label": "Look", "type": "select", "options": [["buttons", "Buttons with names"], ["icons", "Round icons"]]})
    align: str = Field("left", max_length=10, json_schema_extra={"label": "Align", "type": "select", "options": [["left", "Left"], ["center", "Centre"]]})

    @field_validator("networks")
    @classmethod
    def _n(cls, v):
        keys = [k.strip().lower() for k in re.split(r"[,\s]+", v or "") if k.strip()]
        bad = [k for k in keys if k not in dict(NETS)]
        if bad:
            raise ValueError(f"unknown network: {bad[0]} (use x, facebook, linkedin, whatsapp, bluesky, reddit, email)")
        return ", ".join(dict.fromkeys(keys))

    @field_validator("style", "align", mode="before")
    @classmethod
    def _s(cls, v, info):
        ok = ("buttons", "icons") if info.field_name == "style" else ("left", "center")
        return v if v in ok else ok[0]


def render(block: dict, ctx: WidgetContext) -> Markup:
    from . import get
    cfg: ShareConfig = get("share_buttons").config_for(block.get("data"))
    url, text = page_url(block, ctx), cfg.text or ctx.site.get("name", "")
    nets = [k for k in cfg.networks.replace(" ", "").split(",") if k]
    names = dict(NETS)
    links = "".join(
        f'<li><a class="tw-sh tw-sh-{k}" href="{escape(share_url(k, url, text))}" data-share="{k}"'
        + ('' if k == "email" else ' target="_blank" rel="noopener noreferrer"')
        + f'><span class="tw-sh-g" aria-hidden="true">{GLYPH[k]}</span><span class="{"tw-sr" if cfg.style == "icons" else ""}">'
        + (f"Email this page" if k == "email" else f"Share on {names[k]}") + "</span></a></li>" for k in nets)
    if cfg.copy_link:
        links += (f'<li hidden data-tw-copy-li><button type="button" class="tw-sh tw-sh-copy" data-tw-copy><span class="tw-sh-g" aria-hidden="true">{GLYPH["copy"]}</span>'
                  f'<span class="{"tw-sr" if cfg.style == "icons" else ""}" data-tw-copy-label>Copy link</span></button></li>')
    lab = f'<p class="tw-sh-label" id="sh-{block_uid(block)}">{escape(cfg.label)}</p>' if cfg.label else ""
    aria = f'aria-labelledby="sh-{block_uid(block)}"' if cfg.label else 'aria-label="Share"'
    return Markup(f'<section class="band tw-mod tw-shs tw-shs-{cfg.style} tw-shs-{cfg.align}" data-tw-share data-text="{escape(text)}"><div class="wrap">'
                  f'{lab}<ul class="tw-sh-list" {aria}>{links}</ul><p class="tw-sr" role="status" data-tw-copy-status></p></div></section>')


class TweetConfig(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
    quote: str = Field("Small businesses deserve websites that work as hard as they do.", min_length=1, max_length=240,
                       json_schema_extra={"label": "The quote (up to 240 characters)", "type": "textarea"})
    by: str = Field("", max_length=80, json_schema_extra={"label": "Who said it (optional)"})
    via: str = Field("", max_length=30, json_schema_extra={"label": "Your X username (adds “via @…”)"})
    hashtags: str = Field("", max_length=80, json_schema_extra={"label": "Hashtags (comma-separated, without #)"})
    link: bool = Field(True, json_schema_extra={"label": "Add a link to this page"})
    button: str = Field("Post this", max_length=30, json_schema_extra={"label": "Button text"})

    @field_validator("via")
    @classmethod
    def _v(cls, v):
        v = v.lstrip("@")
        if v and not re.match(r"^[A-Za-z0-9_]{1,30}$", v):
            raise ValueError("an X username has letters, numbers and underscores")
        return v

    @field_validator("hashtags")
    @classmethod
    def _h(cls, v):
        tags = [t.strip().lstrip("#") for t in (v or "").split(",") if t.strip()]
        if any(not re.match(r"^\w{1,40}$", t) for t in tags):
            raise ValueError("hashtags are words without spaces, separated by commas")
        return ", ".join(tags)


def render_tweet(block: dict, ctx: WidgetContext) -> Markup:
    from . import get
    cfg: TweetConfig = get("click_to_tweet").config_for(block.get("data"))
    text = f"“{cfg.quote}”" + (f" — {cfg.by}" if cfg.by else "")
    params = {"text": text}
    if cfg.link:
        params["url"] = page_url(block, ctx)
    if cfg.via:
        params["via"] = cfg.via
    if cfg.hashtags:
        params["hashtags"] = cfg.hashtags.replace(" ", "")
    href = "https://x.com/intent/post?" + urlencode(params, quote_via=quote)
    return Markup(f'<section class="band tw-mod tw-ctt" data-tw-share><div class="wrap"><figure class="tw-ctt-box"><blockquote><p data-edit="quote">{escape(cfg.quote)}</p></blockquote>'
                  + (f'<figcaption>— {escape(cfg.by)}</figcaption>' if cfg.by else "")
                  + f'<a class="tw-btn" href="{escape(href)}" data-share="x"{" data-share-url" if cfg.link else ""} target="_blank" rel="noopener noreferrer">'
                  f'<span aria-hidden="true">𝕏</span> {escape(cfg.button)}<span class="tw-sr"> on X (opens X in a new tab)</span></a></figure></div></section>')


register(Widget(
    name="share_buttons", label="Share buttons", about="Let visitors share the page on X, Facebook, LinkedIn, WhatsApp … Plain links, no tracking.",
    config=ShareConfig, render=render, assets=["share_buttons.css", "share_buttons.js"], requires=["modkit"],
))
register(Widget(
    name="click_to_tweet", label="Click to post", about="A quote visitors can post on X in one click. Plain link, no X scripts.",
    config=TweetConfig, render=render_tweet, assets=["share_buttons.css", "share_buttons.js"], requires=["modkit"],
))
