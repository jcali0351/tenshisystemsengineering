"""
widgets/autopost.py: suggest a social post when something new is published, and post it ONLY after the client
approves it.

  1. After a successful deployment (sites.deploy → widgets.after_publish), each blog post that went live in the last
     14 days and hasn't been suggested yet becomes a PENDING item in Modules & inbox › Social posts, with text from
     the site's template ("New on our blog: {title} {url}"). Nothing is sent at this point.
  2. A site owner or CMS admin chooses "approved" (an explicit click, confirmed in a dialog). Only then, and only if
     the site has a webhook (e.g. Postiz's webhook/API URL), the CMS POSTs the post as JSON to it, signed with
     X-Tenshi-Signature if a secret is set. Without a webhook the item stays "approved" for posting by hand.
  3. The item becomes "sent" (or "failed" with the reason; approving again retries).

Off by default; the settings (owners and admins only) are on Modules & inbox › Auto-post on publish.
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

from markupsafe import Markup
from pydantic import BaseModel, ConfigDict, Field, field_validator

from . import ON_PUBLISH, Widget, register
from .. import db, inbox, modcache, sitetime

WINDOW_DAYS = 14


class AutopostSettings(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
    enabled: bool = Field(False, json_schema_extra={"label": "Suggest a social post for each new blog post when the site is published",
                                                    "help": "Suggestions wait for your approval in Modules & inbox › Social posts. Nothing posts by itself."})
    template: str = Field("New on our blog: {title} {url}", max_length=280, json_schema_extra={
        "label": "Post text", "help": "{title}, {excerpt} and {url} are filled in."})
    webhook_url: str = Field("", max_length=500, json_schema_extra={
        "label": "Webhook address (optional, e.g. your Postiz webhook)", "secret": True,
        "help": "Called only when you approve a post. Without it, approved posts wait for you to post them by hand."})
    webhook_secret: str = Field("", max_length=200, json_schema_extra={"label": "Webhook signing secret (optional)", "secret": True})
    channels: str = Field("", max_length=200, json_schema_extra={"label": "Channels to send to the webhook (optional, comma-separated)"})

    @field_validator("webhook_url")
    @classmethod
    def _u(cls, v):
        # the address is checked properly (public, not this server) each time it is called: modcache.post_webhook
        if v and not v.startswith("••") and not re.match(r"^https://(?!(localhost|127\.|10\.|192\.168\.|0\.|\[))[^\s\"'<>]{4,490}$", v):
            raise ValueError("the webhook must be a public https:// address")
        return v


def connected(settings) -> bool:
    return bool(settings and settings.enabled)


def post_url(site: dict, slug: str) -> str:
    from .. import config
    return config.site_url(site["subdomain"]) + f"post-{slug}.html"


def suggest(site: dict, user=None) -> int:
    """Pending items for blog posts newly live. Returns how many were added."""
    from . import load_settings
    from .. import posts
    st = load_settings(site["id"], "autopost")
    if not st or not st.enabled:
        return 0
    since = (datetime.now(timezone.utc) - timedelta(days=WINDOW_DAYS)).strftime("%Y-%m-%dT%H:%M:%SZ")
    added = 0
    for p in posts.published(site["id"]):
        if p["published_at"] < since:
            continue
        ref = f"post:{p['id']}"
        if db.one("SELECT 1 FROM social_posts WHERE site_id = ? AND ref = ?", site["id"], ref):
            continue
        url = post_url(site, p["slug"])
        text = st.template.replace("{title}", p["title"]).replace("{excerpt}", p["excerpt"] or "").replace("{url}", url)[:500]
        db.run("INSERT INTO social_posts (site_id, ref, title, url, text, status, result, created_at) VALUES (?, ?, ?, ?, ?, 'pending', '', ?)",
               site["id"], ref, p["title"], url, text, db.now())
        added += 1
    if added:
        db.log("Social posts suggested", f"{added} waiting for approval", user, site["id"])
    return added


ON_PUBLISH.append(suggest)


def _on_status(site: dict, row: dict, status: str, user):
    """Approving is what sends it: to the webhook if there is one. Returns the status to store."""
    if status != "approved":
        return status
    if row["status"] == "sent":
        raise ValueError("This one has already been sent.")
    from . import load_settings
    st = load_settings(site["id"], "autopost")
    if not st or not st.webhook_url:
        db.run("UPDATE social_posts SET result = ?, approved_by = ? WHERE id = ?",
               "Approved. No webhook is set, so copy the text and post it yourself.", (user or {}).get("id"), row["id"])
        return "approved"
    payload = {"type": "social_post", "id": row["id"], "site": site.get("name", ""), "text": row["text"], "url": row["url"],
               "title": row["title"], "channels": [c.strip() for c in st.channels.split(",") if c.strip()], "approved_at": db.now()}
    try:
        code = modcache.post_webhook(st.webhook_url, payload, st.webhook_secret)
        ok = 200 <= code < 300
        result = f"Sent to the webhook (HTTP {code})." if ok else f"The webhook answered HTTP {code}."
    except Exception as error:  # noqa: BLE001
        ok, result = False, f"The webhook couldn't be reached ({type(error).__name__}). Choose “approved” again to retry."
    db.run("UPDATE social_posts SET result = ?, approved_by = ? WHERE id = ?", result, (user or {}).get("id"), row["id"])
    db.log("Social post " + ("sent" if ok else "failed"), row["title"][:100], user, site["id"])
    return "sent" if ok else "failed"


def _rows(site_id):
    return [{**r, "when": sitetime.local_text(site_id, r["created_at"])} for r in
            db.all("SELECT * FROM social_posts WHERE site_id = ? ORDER BY (status = 'pending') DESC, id DESC LIMIT 300", site_id)]


def _note(site_id):
    from . import load_settings
    st = load_settings(site_id, "autopost")
    if not st or not st.enabled:
        return "Suggestions are off. Turn them on under Modules & inbox › Auto-post on publish."
    return ("Approving sends the post to your webhook." if st.webhook_url else
            "No webhook is set: approving only marks a post as approved, and you post it yourself.")


inbox.register("social", label="Social posts", table="social_posts",
               about="Posts suggested when new blog posts go live. Nothing is posted until an owner or admin approves it.",
               columns=[("text", "Post"), ("when", "Suggested"), ("result", "Result")],
               statuses=["pending", "approved", "dismissed", "sent", "failed"], rows=_rows, manage_only=True,
               count_new=lambda sid: db.one("SELECT COUNT(*) AS n FROM social_posts WHERE site_id = ? AND status = 'pending'", sid)["n"],
               on_status=_on_status, actions_note="Only owners and CMS admins can approve. Approving is final: it posts if a webhook is set.",
               extra={"note": _note, "confirm": {"approved": "Approve this post? If a webhook is set, it is sent right away."}})

register(Widget(
    name="autopost", label="Auto-post on publish", about="Suggest a social post for each new blog post; it goes out only after you approve it.",
    config=BaseModel, render=lambda b, c: Markup(""), settings=AutopostSettings, connected=connected, hidden=True, settings_page=True,
))
