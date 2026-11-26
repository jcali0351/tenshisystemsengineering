"""
widgets/review_form.py: ask customers for a review. Sent reviews wait in Modules & inbox › Reviews; nothing is shown
anywhere until a site owner or CMS admin approves it (inbox kind "reviews" is manage_only). Approved reviews then
appear in Testimonials blocks (widgets/testimonials.py). Honeypot and rate limits as for every module form
(actions.py); the CMS preview checks the form but saves nothing.
"""

from __future__ import annotations

import re

from markupsafe import Markup, escape
from pydantic import BaseModel, ConfigDict, Field

from . import Widget, WidgetContext, block_uid, register
from . import modkit
from .modkit import block_key
from .. import db, inbox, sitetime

EMAIL_RE = re.compile(r"^[^@\s<>\"']{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$")


class ReviewFormConfig(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
    heading: str = Field("How did we do?", max_length=120, json_schema_extra={"label": "Heading"})
    intro: str = Field("We'd love to hear about your experience. Reviews appear on the site after we've read them.", max_length=400,
                       json_schema_extra={"label": "Intro", "type": "textarea"})
    ask_role: bool = Field(True, json_schema_extra={"label": "Ask for their role or company"})
    ask_email: bool = Field(True, json_schema_extra={"label": "Ask for an email (never shown)"})
    consent: str = Field("You may show my review and name on this website.", max_length=300, json_schema_extra={"label": "Permission checkbox text"})
    button: str = Field("Send my review", max_length=40, json_schema_extra={"label": "Button"})


def act_send(req):
    f = req.form
    name, quote = f.get("name", "").strip()[:80], f.get("quote", "").strip()[:2000]
    role, email = f.get("role", "").strip()[:100], f.get("email", "").strip()[:200]
    try:
        rating = int(f.get("rating") or 0)
    except ValueError:
        rating = 0
    if not 1 <= rating <= 5:
        return 400, {"ok": False, "error": "Please choose 1 to 5 stars.", "field": "rating"}
    if len(quote) < 10:
        return 400, {"ok": False, "error": "Please write a few words about your experience.", "field": "quote"}
    if not name:
        return 400, {"ok": False, "error": "Please give your name.", "field": "name"}
    if email and not EMAIL_RE.match(email):
        return 400, {"ok": False, "error": "That email address doesn't look right.", "field": "email"}
    if f.get("consent") not in ("yes", "on", "1", "true"):
        return 400, {"ok": False, "error": "Please tick the box so we may show your review.", "field": "consent"}
    if req.mode != "hosted":
        return 200, {"ok": True, "message": "Preview: reviews are saved on the live site. Nothing was saved here."}
    db.run("INSERT INTO reviews (site_id, block_key, name, role, email, rating, quote, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)",
           req.site["id"], req.block_key, name, role, email, rating, quote, db.now())
    db.log("New review", f"{name} · {rating}★", None, req.site["id"])
    return 200, {"ok": True, "message": "Thank you! Your review will appear once we've read it."}


def render(block: dict, ctx: WidgetContext) -> Markup:
    from . import get
    cfg: ReviewFormConfig = get("review_form").config_for(block.get("data"))
    uid = block_uid(block)
    radios = "".join(f'<input type="radio" id="rv-{uid}-{n}" name="rating" value="{n}"{" required" if n == 5 else ""}>'
                     f'<label for="rv-{uid}-{n}" title="{n} star{"s" if n > 1 else ""}"><span class="tw-sr">{n} star{"s" if n > 1 else ""}</span>★</label>'
                     for n in range(5, 0, -1))
    form = (str(modkit.form_open("review_form", "send", block_key(block), "Thank you!", "tw-rv-form", cfg.heading or "Review"))
            + f'<fieldset class="tw-rv-stars"><legend>Your rating <span aria-hidden="true">*</span></legend><div class="tw-rv-pick">{radios}</div></fieldset>'
            + str(modkit.field("quote", "Your review", "textarea", True, 'maxlength="2000" minlength="10"'))
            + '<div class="tw-row">' + str(modkit.field("name", "Your name", required=True, attrs='autocomplete="name" maxlength="80"'))
            + (str(modkit.field("role", "Role or company (optional)", attrs='maxlength="100" autocomplete="organization"')) if cfg.ask_role else "") + "</div>"
            + (str(modkit.field("email", "Email (optional, never shown)", "email", attrs='autocomplete="email" maxlength="200"')) if cfg.ask_email else "")
            + f'<label class="tw-check"><input type="checkbox" name="consent" value="yes" required> {escape(cfg.consent)}</label>'
            + f'<p><button class="tw-btn" type="submit">{escape(cfg.button)}</button></p>{modkit.status_line()}</form>')
    return Markup(f'<section class="band tw-mod tw-rv" aria-labelledby="rv-{uid}-h"><div class="wrap">'
                  f'<div class="tw-head"><h2 id="rv-{uid}-h" data-edit="heading">{escape(cfg.heading)}</h2></div>'
                  + (f'<p class="tw-intro" data-edit="intro">{escape(cfg.intro)}</p>' if cfg.intro else "") + f'{form}</div></section>')


def _rows(site_id):
    return [{**r, "stars": "★" * r["rating"], "when": sitetime.local_text(site_id, r["created_at"])} for r in
            db.all("SELECT * FROM reviews WHERE site_id = ? ORDER BY (status = 'pending') DESC, id DESC LIMIT 500", site_id)]


inbox.register("reviews", label="Reviews", table="reviews",
               about="Reviews sent through the Review form. Nothing is shown on the site until you approve it; approved reviews appear in Testimonials blocks.",
               columns=[("stars", "Stars"), ("quote", "Review"), ("name", "Name"), ("role", "Role"), ("email", "Email"), ("when", "Sent")],
               statuses=["pending", "approved", "hidden"], rows=_rows, manage_only=True,
               count_new=lambda sid: db.one("SELECT COUNT(*) AS n FROM reviews WHERE site_id = ? AND status = 'pending'", sid)["n"],
               actions_note="Only owners and CMS admins can approve. To ask a customer for a review, send them the address of the page with your Review form.")

register(Widget(
    name="review_form", label="Review form", about="Ask customers for a review with stars; you approve each one before it shows.",
    config=ReviewFormConfig, render=render, assets=["review_form.css"], requires=["modkit"], actions={"send": act_send},
    hint="Reviews wait in Modules & inbox › Reviews until an owner or admin approves them.",
))
