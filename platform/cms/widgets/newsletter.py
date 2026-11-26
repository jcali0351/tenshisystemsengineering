"""
widgets/newsletter.py: a newsletter sign-up that adds the visitor to the site's own Mailchimp audience or Resend
audience (keys in settings, owners and admins only, masked, used only by the server). No provider or key: the
sign-up is saved as a lead (Leads) so nothing is lost. If the provider fails, it is saved as a lead too.

Mailchimp uses double opt-in by default (Mailchimp emails the visitor to confirm, at the visitor's own request).
Honeypot and rate limits via actions.py; the CMS preview checks the form but sends nothing.
"""

from __future__ import annotations

import base64
import hashlib
import re
from typing import Literal
from urllib.parse import quote

from markupsafe import Markup, escape
from pydantic import BaseModel, ConfigDict, Field, field_validator

from . import Widget, WidgetContext, block_uid, register
from . import modkit
from .modkit import block_key
from .. import db, modcache

EMAIL_RE = re.compile(r"^[^@\s<>\"']{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$")


class NewsletterConfig(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
    heading: str = Field("Get our newsletter", max_length=120, json_schema_extra={"label": "Heading"})
    text: str = Field("News, offers and the occasional behind-the-scenes. No spam; leave any time.", max_length=400,
                      json_schema_extra={"label": "Text", "type": "textarea"})
    ask_name: bool = Field(False, json_schema_extra={"label": "Ask for a first name"})
    button: str = Field("Sign up", max_length=30, json_schema_extra={"label": "Button"})
    consent: str = Field("", max_length=300, json_schema_extra={"label": "Consent checkbox text (empty = no checkbox)"})
    look: Literal["band", "card", "inline"] = Field("band", json_schema_extra={"label": "Look", "options": [["band", "Coloured band"], ["card", "Card"], ["inline", "Plain"]]})


class NewsletterSettings(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
    provider: Literal["", "mailchimp", "resend"] = Field("", json_schema_extra={"label": "Send sign-ups to", "options": [
        ["", "Nowhere: keep them in Leads"], ["mailchimp", "Mailchimp"], ["resend", "Resend"]]})
    mailchimp_key: str = Field("", max_length=100, json_schema_extra={"label": "Mailchimp API key", "secret": True,
                               "help": "Mailchimp › Profile › Extras › API keys. Ends in -us21 or similar."})
    mailchimp_list: str = Field("", max_length=40, json_schema_extra={"label": "Mailchimp audience ID"})
    double_opt_in: bool = Field(True, json_schema_extra={"label": "Mailchimp: ask subscribers to confirm by email (double opt-in)"})
    resend_key: str = Field("", max_length=120, json_schema_extra={"label": "Resend API key", "secret": True})
    resend_audience: str = Field("", max_length=60, json_schema_extra={"label": "Resend audience ID"})

    @field_validator("mailchimp_key")
    @classmethod
    def _mk(cls, v):
        if v and not v.startswith("••") and not re.match(r"^[0-9a-f]{20,40}-[a-z]{2}\d{1,3}$", v):
            raise ValueError("a Mailchimp key looks like 0123abcd…-us21")
        return v

    @field_validator("mailchimp_list", "resend_audience")
    @classmethod
    def _id(cls, v):
        if v and not re.match(r"^[A-Za-z0-9-]{4,60}$", v):
            raise ValueError("an audience ID has letters, numbers and dashes")
        return v


def connected(s) -> bool:
    if not s:
        return False
    return (s.provider == "mailchimp" and bool(s.mailchimp_key and s.mailchimp_list)) or (s.provider == "resend" and bool(s.resend_key and s.resend_audience))


def to_provider(s: NewsletterSettings, email: str, name: str) -> str:
    """Add the address to the provider. Returns "ok" or "exists"; raises on failure."""
    if s.provider == "mailchimp":
        dc = s.mailchimp_key.rsplit("-", 1)[1]
        auth = "Basic " + base64.b64encode(f"tenshi:{s.mailchimp_key}".encode()).decode()
        member = hashlib.md5(email.lower().encode()).hexdigest()  # noqa: S324 - Mailchimp's member id is the MD5 of the address
        url = f"https://{dc}.api.mailchimp.com/3.0/lists/{quote(s.mailchimp_list)}/members/{member}"
        body = {"email_address": email, "status_if_new": "pending" if s.double_opt_in else "subscribed",
                **({"merge_fields": {"FNAME": name}} if name else {})}
        modcache.http_json(url, headers={"Authorization": auth}, data=body, method="PUT")
        return "ok"
    if s.provider == "resend":
        modcache.http_json(f"https://api.resend.com/audiences/{quote(s.resend_audience)}/contacts",
                           headers={"Authorization": f"Bearer {s.resend_key}"}, data={"email": email, "first_name": name, "unsubscribed": False})
        return "ok"
    raise ValueError("no provider")


def act_subscribe(req):
    from .. import notify
    f = req.form
    email, name = f.get("email", "").strip()[:200], f.get("name", "").strip()[:80]
    if not EMAIL_RE.match(email):
        return 400, {"ok": False, "error": "Please give an email address.", "field": "email"}
    if req.cfg and req.cfg.consent and f.get("consent") not in ("yes", "on", "1"):
        return 400, {"ok": False, "error": "Please tick the box to sign up.", "field": "consent"}
    if req.mode != "hosted":
        where = {"mailchimp": "Mailchimp", "resend": "Resend"}.get(req.settings.provider if connected(req.settings) else "", "Leads")
        return 200, {"ok": True, "message": f"Preview: on the live site this sign-up goes to {where}. Nothing was sent here."}
    from .. import demo_sites
    s = None if demo_sites.is_demo(req.site) else req.settings     # demo sites: always Leads, never a provider
    if connected(s):
        try:
            to_provider(s, email, name)
            db.log("Newsletter sign-up", f"{s.provider}", None, req.site["id"])
            return 200, {"ok": True, "message": "Thanks! Check your inbox to confirm." if s.provider == "mailchimp" and s.double_opt_in else "Thanks, you're on the list!"}
        except Exception as error:  # noqa: BLE001 - keep the sign-up as a lead instead
            db.log("Newsletter provider failed", f"{s.provider}: {type(error).__name__}", None, req.site["id"])
    data = {"Form": "Newsletter", "email": email, **({"name": name} if name else {})}
    lead_id = db.run("INSERT INTO leads (site_id, page, data_json, created_at) VALUES (?, ?, ?, ?)", req.site["id"],
                     (req.block_key or "newsletter").split("/")[0], db.dumps(data), db.now())
    notify.lead_received(req.site, lead_id, "Newsletter sign-up", data)
    return 200, {"ok": True, "message": "Thanks, you're on the list!"}


def signup_form(block: dict, ctx: WidgetContext, compact: bool = False, cfg: NewsletterConfig | None = None) -> str:
    cfg = cfg or NewsletterConfig()
    key = block_key(block) if block.get("type") == "newsletter" else ""
    fields = ((str(modkit.field("name", "First name", attrs='autocomplete="given-name" maxlength="80"')) if cfg.ask_name else "")
              + str(modkit.field("email", "Email address", "email", True, 'autocomplete="email" maxlength="200"')))
    return (str(modkit.form_open("newsletter", "subscribe", key, "Thanks!", "tw-nl-form" + (" tw-nl-compact" if compact else ""), "Newsletter sign-up"))
            + f'<div class="tw-nl-row">{fields}<button class="tw-btn" type="submit">{escape(cfg.button)}</button></div>'
            + (f'<label class="tw-check"><input type="checkbox" name="consent" value="yes" required> {escape(cfg.consent)}</label>' if cfg.consent else "")
            + f'{modkit.status_line()}</form>')


def render(block: dict, ctx: WidgetContext) -> Markup:
    from . import get
    cfg: NewsletterConfig = get("newsletter").config_for(block.get("data"))
    uid = block_uid(block)
    return Markup(f'<section class="band tw-mod tw-nl tw-nl-{cfg.look}" aria-labelledby="nl-{uid}-h"><div class="wrap"><div class="tw-nl-box">'
                  f'<div><h2 id="nl-{uid}-h" data-edit="heading">{escape(cfg.heading)}</h2>'
                  + (f'<p class="tw-intro" data-edit="text">{escape(cfg.text)}</p>' if cfg.text else "") + "</div>"
                  + signup_form(block, ctx, cfg=cfg) + "</div></div></section>")


register(Widget(
    name="newsletter", label="Newsletter sign-up", about="Collect sign-ups into Mailchimp or Resend with your own keys, or into Leads.",
    config=NewsletterConfig, render=render, settings=NewsletterSettings, connected=connected,
    assets=["newsletter.css"], requires=["modkit"], actions={"subscribe": act_subscribe},
    hint="Without a Mailchimp or Resend key, sign-ups are kept in Leads. Keys: Modules & inbox › Newsletter sign-up.",
))
