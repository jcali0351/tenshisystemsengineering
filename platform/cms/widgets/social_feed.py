"""
widgets/social_feed.py: the client's latest posts from Instagram, X, YouTube or Bluesky, fetched by the SERVER with the
site's own account and key (settings, owners and admins only; keys masked, never on a page) and cached for an hour
(modcache.py; the last good copy is kept if the network fails).

No account/key for the chosen network: the block draws nothing on the published site, and a hint in the builder.
No third-party scripts: plain cards linking to the posts. Pictures load from the network's image host, which is
added to img-src only on pages with this block (block_csp). The live page refreshes from __w/social_feed/items.
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Literal
from urllib.parse import quote, urlencode

from markupsafe import Markup, escape
from pydantic import BaseModel, ConfigDict, Field, field_validator

from . import Widget, WidgetContext, block_uid, register
from .modkit import block_key, carousel_nav
from .. import modcache

TTL = 3600
NETWORKS = {"instagram": "Instagram", "x": "X", "youtube": "YouTube", "bluesky": "Bluesky"}
IMG_HOSTS = {"instagram": ["https://*.cdninstagram.com", "https://*.fbcdn.net"], "x": ["https://pbs.twimg.com"],
             "youtube": ["https://i.ytimg.com"], "bluesky": ["https://cdn.bsky.app"]}
HANDLE_RE = re.compile(r"^@?[A-Za-z0-9_.-]{1,100}$")


class FeedConfig(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
    heading: str = Field("Follow along", max_length=120, json_schema_extra={"label": "Heading"})
    network: Literal["instagram", "x", "youtube", "bluesky"] = Field("instagram", json_schema_extra={"label": "Network", "options": [[k, v] for k, v in NETWORKS.items()]})
    count: int = Field(6, ge=1, le=12, json_schema_extra={"label": "How many posts"})
    layout: Literal["grid", "carousel"] = Field("grid", json_schema_extra={"label": "Layout", "options": [["grid", "Grid"], ["carousel", "Carousel"]]})
    show_text: bool = Field(True, json_schema_extra={"label": "Show the post text"})
    follow: str = Field("Follow us", max_length=40, json_schema_extra={"label": "Follow button (empty = none)"})


class FeedSettings(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
    instagram_token: str = Field("", max_length=600, json_schema_extra={"label": "Instagram access token", "secret": True,
                                 "help": "A long-lived token from Instagram's API for your business or creator account."})
    instagram_handle: str = Field("", max_length=100, json_schema_extra={"label": "Instagram username (for the Follow link)"})
    x_bearer: str = Field("", max_length=300, json_schema_extra={"label": "X API bearer token", "secret": True,
                          "help": "From the X developer portal. Reading posts needs a paid X API plan."})
    x_username: str = Field("", max_length=100, json_schema_extra={"label": "X username"})
    youtube_key: str = Field("", max_length=200, json_schema_extra={"label": "YouTube Data API key", "secret": True})
    youtube_channel: str = Field("", max_length=60, json_schema_extra={"label": "YouTube channel ID (UC…)"})
    bluesky_handle: str = Field("", max_length=100, json_schema_extra={"label": "Bluesky handle (e.g. you.bsky.social)",
                                "help": "Public posts; no key needed."})

    @field_validator("instagram_handle", "x_username", "bluesky_handle")
    @classmethod
    def _h(cls, v):
        if v and not HANDLE_RE.match(v):
            raise ValueError("a username has letters, numbers, dots, dashes or underscores")
        return v.lstrip("@")

    @field_validator("youtube_channel")
    @classmethod
    def _yc(cls, v):
        if v and not re.match(r"^UC[A-Za-z0-9_-]{20,30}$", v):
            raise ValueError("a channel ID starts with UC (YouTube › Settings › Advanced)")
        return v


def ready(settings, network: str) -> bool:
    s = settings
    if not s:
        return False
    return {"instagram": bool(s.instagram_token), "x": bool(s.x_bearer and s.x_username), "youtube": bool(s.youtube_key and s.youtube_channel),
            "bluesky": bool(s.bluesky_handle)}.get(network, False)


def connected(settings) -> bool:
    return any(ready(settings, n) for n in NETWORKS)


def _https(u) -> str:
    return u if isinstance(u, str) and u.startswith("https://") and len(u) < 2000 else ""


def _fetch(network: str, s: FeedSettings) -> list[dict]:
    get = modcache.http_json
    if network == "instagram":
        data = get("https://graph.instagram.com/me/media?" + urlencode({"fields": "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp",
                                                                        "limit": 12, "access_token": s.instagram_token}))
        return [{"text": (m.get("caption") or "")[:500], "image": _https(m.get("thumbnail_url") if m.get("media_type") == "VIDEO" else m.get("media_url")),
                 "url": _https(m.get("permalink")), "date": (m.get("timestamp") or "")[:10], "video": m.get("media_type") == "VIDEO"} for m in data.get("data", [])]
    if network == "x":
        auth = {"Authorization": f"Bearer {s.x_bearer}"}
        user = get(f"https://api.x.com/2/users/by/username/{quote(s.x_username)}", headers=auth)["data"]
        data = get(f"https://api.x.com/2/users/{quote(user['id'])}/tweets?" + urlencode({
            "max_results": 12, "exclude": "retweets,replies", "tweet.fields": "created_at,attachments",
            "expansions": "attachments.media_keys", "media.fields": "url,preview_image_url,type"}), headers=auth)
        media = {m["media_key"]: m for m in (data.get("includes") or {}).get("media", [])}
        out = []
        for t in data.get("data", []):
            keys = (t.get("attachments") or {}).get("media_keys") or []
            m = media.get(keys[0], {}) if keys else {}
            out.append({"text": (t.get("text") or "")[:500], "image": _https(m.get("url") or m.get("preview_image_url")),
                        "url": f"https://x.com/{s.x_username}/status/{t['id']}", "date": (t.get("created_at") or "")[:10], "video": m.get("type") == "video"})
        return out
    if network == "youtube":
        data = get("https://www.googleapis.com/youtube/v3/playlistItems?" + urlencode({
            "part": "snippet", "maxResults": 12, "playlistId": "UU" + s.youtube_channel[2:], "key": s.youtube_key}))
        out = []
        for it in data.get("items", []):
            sn = it.get("snippet") or {}
            vid = (sn.get("resourceId") or {}).get("videoId", "")
            if re.match(r"^[A-Za-z0-9_-]{6,20}$", vid or ""):
                th = sn.get("thumbnails") or {}
                out.append({"text": (sn.get("title") or "")[:300], "image": _https((th.get("medium") or th.get("default") or {}).get("url")),
                            "url": f"https://www.youtube.com/watch?v={vid}", "date": (sn.get("publishedAt") or "")[:10], "video": True})
        return out
    data = get("https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?" + urlencode({"actor": s.bluesky_handle, "limit": 20, "filter": "posts_no_replies"}))
    out = []
    for f in data.get("feed", []):
        p = f.get("post") or {}
        if f.get("reason"):                                   # reposts
            continue
        rkey = (p.get("uri") or "").rsplit("/", 1)[-1]
        imgs = (p.get("embed") or {}).get("images") or []
        out.append({"text": ((p.get("record") or {}).get("text") or "")[:500], "image": _https(imgs[0].get("thumb")) if imgs else "",
                    "url": f"https://bsky.app/profile/{quote(s.bluesky_handle)}/post/{quote(rkey)}", "date": (p.get("indexedAt") or "")[:10], "video": False})
    return out


def items_for(site_id, cfg: FeedConfig, settings) -> list[dict] | None:
    if not site_id or not ready(settings, cfg.network):
        return None
    account = {"instagram": "me", "x": settings.x_username, "youtube": settings.youtube_channel, "bluesky": settings.bluesky_handle}[cfg.network]
    got = modcache.get_json(site_id, f"social:{cfg.network}:{account}", TTL, lambda: _fetch(cfg.network, settings))
    return (got or [])[:cfg.count]


def profile_url(network: str, s) -> str:
    if not s:
        return ""
    return {"instagram": f"https://www.instagram.com/{s.instagram_handle}/" if s.instagram_handle else "",
            "x": f"https://x.com/{s.x_username}" if s.x_username else "",
            "youtube": f"https://www.youtube.com/channel/{s.youtube_channel}" if s.youtube_channel else "",
            "bluesky": f"https://bsky.app/profile/{s.bluesky_handle}" if s.bluesky_handle else ""}[network]


def _date(d: str) -> str:
    try:
        return f"{datetime.strptime(d, '%Y-%m-%d'):%b} {int(d[8:])}, {d[:4]}"
    except ValueError:
        return ""


def card(i: dict, show_text: bool, network: str) -> str:
    text = i.get("text") or ""
    pic = (f'<span class="tw-sf-pic"><img src="{escape(i["image"])}" alt="" loading="lazy">'
           + ('<span class="tw-sf-play" aria-hidden="true">▶</span>' if i.get("video") else "") + "</span>") if i.get("image") else ""
    label = f'{NETWORKS[network]} post' + (f' from {_date(i.get("date", ""))}' if i.get("date") else "") + (f': {text[:80]}' if text else "")
    return (f'<li class="tw-sf"><a href="{escape(i["url"])}" target="_blank" rel="noopener noreferrer" aria-label="{escape(label)}">{pic}'
            + (f'<span class="tw-sf-text">{escape(text[:280])}</span>' if show_text and text else "")
            + (f'<span class="tw-sf-date">{_date(i.get("date", ""))}</span>' if i.get("date") else "") + "</a></li>")


def render(block: dict, ctx: WidgetContext) -> Markup:
    from . import get
    cfg: FeedConfig = get("social_feed").config_for(block.get("data"))
    uid = block_uid(block)
    items = items_for(ctx.site.get("id"), cfg, ctx.settings)
    if items is None:
        if ctx.mode != "preview":
            return Markup("")                                   # no account/key: nothing on the published site
        return Markup(f'<section class="band tw-mod tw-sfs" aria-label="Social feed"><div class="wrap"><p class="tw-builder-hint">'
                      f'{escape(NETWORKS[cfg.network])} feed: add the site\'s {escape(NETWORKS[cfg.network])} account'
                      f'{"" if cfg.network == "bluesky" else " and key"} under Modules &amp; inbox › Social feed. '
                      f'Until then this block is hidden on the published site.</p></div></section>')
    if not items and ctx.mode != "preview":
        return Markup("")
    follow = profile_url(cfg.network, ctx.settings)
    cards = "".join(card(i, cfg.show_text, cfg.network) for i in items if i.get("url"))
    if cfg.layout == "carousel":
        body = (f'<div class="tw-carousel" data-tw-carousel role="region" aria-roledescription="carousel" aria-label="{escape(cfg.heading or "Social posts")}">'
                f'<ul class="tw-track tw-sf-list" data-tw-sf-list>{cards}</ul></div>')
        nav = str(carousel_nav("posts"))
    else:
        body, nav = f'<ul class="tw-sf-grid tw-sf-list" data-tw-sf-list>{cards}</ul>', ""
    btn = (f'<a class="tw-btn tw-btn-ghost" href="{escape(follow)}" target="_blank" rel="noopener noreferrer">{escape(cfg.follow)}'
           f'<span class="tw-sr"> on {NETWORKS[cfg.network]}</span></a>' if cfg.follow and follow else "")
    feed = (f' data-tw-sf="__w/social_feed/items?_block={escape(block_key(block))}" data-network="{cfg.network}" data-text="{int(cfg.show_text)}"'
            if ctx.mode == "hosted" else "")
    head = f'<h2 id="sf-{uid}-h" data-edit="heading">{escape(cfg.heading)}</h2>' if cfg.heading else ""
    label = f'aria-labelledby="sf-{uid}-h"' if cfg.heading else 'aria-label="Social posts"'
    return Markup(f'<section class="band tw-mod tw-sfs" {label}{feed}><div class="wrap"><div class="tw-head">{head}<div class="tw-sf-actions">{nav}{btn}</div></div>'
                  + (body if cards else '<p class="tw-empty">No posts yet.</p>') + "</div></section>")


def block_csp(cfg: FeedConfig, settings=None) -> dict:
    return {"img-src": IMG_HOSTS[cfg.network]} if ready(settings, cfg.network) else {}


def act_items(req):
    items = items_for(req.site["id"], req.cfg, req.settings) if req.cfg else None
    return 200, {"ok": True, "items": [{k: i.get(k) for k in ("text", "image", "url", "date", "video")} for i in (items or []) if i.get("url")]}


register(Widget(
    name="social_feed", label="Social feed", about="Your latest Instagram, X, YouTube or Bluesky posts, cached on the server. No outside scripts.",
    config=FeedConfig, render=render, settings=FeedSettings, connected=connected, block_csp=block_csp,
    assets=["social_feed.css", "social_feed.js"], requires=["modkit"], actions={"items": act_items},
    hint="Accounts and keys go under Modules & inbox › Social feed (owners and admins). Without them the block is hidden on the site.",
))
