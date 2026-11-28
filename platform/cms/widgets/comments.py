"""
widgets/comments.py: comments under blog posts, like WordPress's discussion settings.

Switched on per site (Blog posts › Comments). Every post page then ends with the approved comments and a form. A new
comment waits in Modules & inbox › Comments until an editor approves it; approved comments appear on the live site
straight away (fetched from /__w/comments/list), without publishing again. Spam protection: a hidden box robots fill in,
the shared rate limit, a minimum time on the page, at most 2 links, and nothing shows until approved.
Settings live in site_settings "comments": {"on": false, "auto_approve_known": false}.
"""

from __future__ import annotations

import hashlib
import re
import time

from markupsafe import Markup, escape
from pydantic import BaseModel, ConfigDict

from . import Widget, WidgetContext, register
from .. import db, inbox, sitetime

KEY = "comments"
EMAIL_RE = re.compile(r"^[^@\s]{1,100}@[^@\s]{1,150}\.[^@\s]{2,20}$")


class CommentsConfig(BaseModel):
    model_config = ConfigDict(extra="ignore")
    post_slug: str = ""


def settings(site_id) -> dict:
    row = db.one("SELECT value_json FROM site_settings WHERE site_id = ? AND key = ?", site_id, KEY) if site_id else None
    data = db.j(row["value_json"]) if row else {}
    return {"on": bool(data.get("on")), "auto_approve_known": bool(data.get("auto_approve_known"))}


def save_settings(site_id, data, user=None) -> dict:
    value = {"on": bool(data.get("on")), "auto_approve_known": bool(data.get("auto_approve_known"))}
    db.run("INSERT INTO site_settings (site_id, key, value_json, updated_at) VALUES (?, ?, ?, ?) "
           "ON CONFLICT (site_id, key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at",
           site_id, KEY, db.dumps(value), db.now())
    db.log("Changed comment settings", "on" if value["on"] else "off", user, site_id)
    return value


def approved(site_id, slug) -> list[dict]:
    return db.all("SELECT name, body, created_at FROM comments WHERE site_id = ? AND post_slug = ? AND status = 'approved' ORDER BY id LIMIT 500",
                  site_id, slug)


def _one(c, site_id) -> str:
    body = "".join(f"<p>{escape(p)}</p>" for p in re.split(r"\n\s*\n", c["body"]) if p.strip())
    return (f'<li class="tw-cm-item"><p class="tw-cm-who"><b>{escape(c["name"])}</b> '
            f'<time datetime="{escape(c["created_at"])}">{escape(sitetime.local_text(site_id, c["created_at"]))}</time></p>{body}</li>')


def render(block: dict, ctx: WidgetContext) -> Markup:
    from . import block_uid, modkit
    site_id = (ctx.site or {}).get("id")
    slug = CommentsConfig.model_validate(block.get("data") or {}).post_slug
    rows = approved(site_id, slug) if site_id else []
    uid = block_uid(block)
    items = "".join(_one(c, site_id) for c in rows)
    form = (str(modkit.form_open("comments", "send", modkit.block_key(block), "Thank you! Your comment will appear once it's approved.", "tw-cm-form", "Leave a comment"))
            + f'<input type="hidden" name="post" value="{escape(slug)}"><input type="hidden" name="_t" value="{int(time.time())}">'
            + str(modkit.field("body", "Your comment", "textarea", True, 'maxlength="3000" minlength="2"'))
            + '<div class="tw-row">' + str(modkit.field("name", "Your name", required=True, attrs='autocomplete="name" maxlength="80"'))
            + str(modkit.field("email", "Email (never shown)", "email", attrs='autocomplete="email" maxlength="200"')) + "</div>"
            + f'<p><button class="tw-btn" type="submit">Post comment</button></p>{modkit.status_line()}</form>')
    return Markup(f'<section class="band tw-mod tw-comments" aria-labelledby="cm-{uid}-h" data-tw-comments="{escape(slug)}"><div class="wrap narrow">'
                  f'<h2 id="cm-{uid}-h">Comments <span class="tw-cm-n">{len(rows) or ""}</span></h2>'
                  f'<ol class="tw-cm-list">{items}</ol>'
                  + ("" if rows else '<p class="tw-cm-none">No comments yet. Be the first.</p>') + form + "</div></section>")


def act_list(req):
    slug = (req.query.get("post") or "")[:120]
    rows = approved(req.site["id"], slug)
    return 200, {"ok": True, "html": "".join(_one(c, req.site["id"]) for c in rows), "count": len(rows)}


def act_send(req):
    f = req.form
    name, body, email = f.get("name", "").strip()[:80], f.get("body", "").strip()[:3000], f.get("email", "").strip()[:200]
    slug = f.get("post", "").strip()[:120]
    if not settings(req.site["id"])["on"]:
        return 400, {"ok": False, "error": "Comments are closed."}
    if not name:
        return 400, {"ok": False, "error": "Please give your name.", "field": "name"}
    if len(body) < 2:
        return 400, {"ok": False, "error": "Please write a comment.", "field": "body"}
    if email and not EMAIL_RE.match(email):
        return 400, {"ok": False, "error": "That email address doesn't look right.", "field": "email"}
    if len(re.findall(r"https?://|www\.", body)) > 2:
        return 400, {"ok": False, "error": "Please use at most two links.", "field": "body"}
    try:
        if time.time() - int(f.get("_t") or 0) < 3:          # robots post the instant the page loads
            return 200, {"ok": True, "message": "Thank you!"}
    except ValueError:
        pass
    if req.mode != "hosted":
        return 200, {"ok": True, "message": "Preview: comments are saved on the live site. Nothing was saved here."}
    if not db.one("SELECT 1 AS x FROM posts WHERE site_id = ? AND slug = ? AND status = 'published'", req.site["id"], slug.removeprefix("post-")):
        return 404, {"ok": False, "error": "This post isn't there any more."}
    known = email and settings(req.site["id"])["auto_approve_known"] and db.one(
        "SELECT 1 AS x FROM comments WHERE site_id = ? AND email = ? AND status = 'approved'", req.site["id"], email)
    db.run("INSERT INTO comments (site_id, post_slug, name, email, body, status, ip_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
           req.site["id"], slug, name, email, body, "approved" if known else "pending",
           hashlib.sha256(("tenshi-comment:" + (req.ip or "")).encode()).hexdigest()[:24], db.now())
    db.log("New comment", f"{name} on {slug}", None, req.site["id"])
    return 200, {"ok": True, "message": "Thank you! Your comment is up." if known else "Thank you! Your comment will appear once it's approved."}


def _rows(site_id):
    return [{**r, "post": r["post_slug"].removeprefix("post-"), "comment": r["body"][:300], "when": sitetime.local_text(site_id, r["created_at"])}
            for r in db.all("SELECT * FROM comments WHERE site_id = ? ORDER BY (status = 'pending') DESC, id DESC LIMIT 500", site_id)]


inbox.register("comments", label="Comments", table="comments",
               about="Comments on blog posts. Nothing shows on the site until you approve it; approved comments appear at once, without publishing.",
               columns=[("comment", "Comment"), ("name", "Name"), ("email", "Email"), ("post", "Post"), ("when", "Sent")],
               statuses=["pending", "approved", "spam"], rows=_rows,
               count_new=lambda sid: db.one("SELECT COUNT(*) AS n FROM comments WHERE site_id = ? AND status = 'pending'", sid)["n"],
               actions_note="Switch comments on or off under Blog posts.")

register(Widget(
    name="comments", label="Comments", about="Comments under a blog post (added to post pages when comments are on).",
    config=CommentsConfig, render=render, assets=["comments.css", "comments.js"], requires=["modkit"],
    actions={"send": act_send, "list": act_list}, hidden=True,
))
