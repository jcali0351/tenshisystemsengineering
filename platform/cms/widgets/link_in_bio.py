"""
widgets/link_in_bio.py: a link-in-bio page (the one link in an Instagram/TikTok/X profile): picture, name, a line about
you, big buttons, and your social profiles from Business data › Social. Put it on its own page (e.g. "links") and
choose "Just this block" to hide the site's header and footer there.
"""

from __future__ import annotations

from markupsafe import Markup, escape
from pydantic import BaseModel, ConfigDict, Field, field_validator

from . import Widget, WidgetContext, block_uid, clean_link, register

SOCIAL = {"instagram": "Instagram", "tiktok": "TikTok", "x": "X", "twitter": "X", "facebook": "Facebook", "youtube": "YouTube",
          "linkedin": "LinkedIn", "bluesky": "Bluesky", "threads": "Threads", "pinterest": "Pinterest", "github": "GitHub", "mastodon": "Mastodon"}


class BioLink(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
    label: str = Field("Shop the drop", min_length=1, max_length=60, json_schema_extra={"label": "Button text"})
    url: str = Field("index", max_length=500, json_schema_extra={"label": "Goes to", "type": "link"})
    note: str = Field("", max_length=80, json_schema_extra={"label": "Small line under it (optional)"})
    emoji: str = Field("", max_length=4, json_schema_extra={"label": "Emoji (optional)"})
    highlight: bool = Field(False, json_schema_extra={"label": "Highlight"})

    @field_validator("url")
    @classmethod
    def _u(cls, v):
        return clean_link(v)


class BioConfig(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
    picture: str = Field("", max_length=12, json_schema_extra={"label": "Picture or logo", "type": "media"})
    name: str = Field("", max_length=80, json_schema_extra={"label": "Name (empty = the site's name)"})
    bio: str = Field("", max_length=300, json_schema_extra={"label": "A line about you", "type": "textarea"})
    links: list[BioLink] = Field(default_factory=lambda: [BioLink(highlight=True), BioLink(label="Get in touch", url="contact")],
                                 min_length=1, max_length=30, json_schema_extra={"label": "Buttons", "item_label": "Button"})
    social: bool = Field(True, json_schema_extra={"label": "Show social profiles (Business data › Social)"})
    solo: bool = Field(True, json_schema_extra={"label": "Just this block (hide the site's header and footer on this page)"})

    @field_validator("picture", mode="before")
    @classmethod
    def _p(cls, v):
        return "" if v is None else str(v)


def render(block: dict, ctx: WidgetContext) -> Markup:
    from . import get
    cfg: BioConfig = get("link_in_bio").config_for(block.get("data"))
    uid = block_uid(block)
    name = cfg.name or ctx.site.get("name", "")
    pic = ctx.media(cfg.picture, 400) if cfg.picture else ""
    face = (f'<img class="tw-lib-pic" src="{escape(pic)}" alt="" width="112" height="112">' if pic
            else f'<span class="tw-lib-pic tw-lib-init" aria-hidden="true">{escape((name[:1] or "★").upper())}</span>')
    links = "".join(
        f'<li><a class="tw-lib-a{" tw-lib-hi" if l.highlight else ""}" href="{escape(ctx.link(l.url))}"'
        + (' rel="noopener"' if l.url.startswith("http") else "") + ">"
        + (f'<span class="tw-lib-e" aria-hidden="true">{escape(l.emoji)}</span>' if l.emoji else "")
        + f'<span><b>{escape(l.label)}</b>' + (f'<small>{escape(l.note)}</small>' if l.note else "") + "</span></a></li>" for l in cfg.links)
    socials = ""
    if cfg.social:
        found = [(SOCIAL.get(k.lower(), k.title()), v) for k, v in ((ctx.profile or {}).get("social") or {}).items()
                 if isinstance(v, str) and v.startswith("https://")]
        socials = "".join(f'<li><a href="{escape(v)}" rel="noopener me" target="_blank">{escape(n)}</a></li>' for n, v in found[:12])
    return Markup(f'<section class="band tw-mod tw-lib" aria-labelledby="lib-{uid}-h"{" data-tw-solo" if cfg.solo else ""}><div class="tw-lib-col">'
                  f'{face}<h1 id="lib-{uid}-h" class="tw-lib-name">{escape(name)}</h1>'
                  + (f'<p class="tw-lib-bio" data-edit="bio">{escape(cfg.bio)}</p>' if cfg.bio else "")
                  + f'<ul class="tw-lib-links">{links}</ul>'
                  + (f'<ul class="tw-lib-social" aria-label="Social profiles">{socials}</ul>' if socials else "") + "</div></section>")


register(Widget(
    name="link_in_bio", label="Link in bio", about="A phone-friendly page of big buttons for the link in your social profiles.",
    config=BioConfig, render=render, assets=["link_in_bio.css"], requires=["modkit"],
    hint="Add a page called “links”, put only this block on it, and use its address in your social profiles.",
))
