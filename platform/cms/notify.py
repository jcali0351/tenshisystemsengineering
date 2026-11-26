"""
notify.py: who gets an email when a website form is sent, per site, on top of mail.py.

Each site has a Lead emails setting (Leads screen, owners and admins; site_settings key "lead_email"):
    enabled    the master switch. Off: no lead emails at all for this site, not even to a form's own recipient.
    to         up to 3 addresses. They get the messages from the site's classic contact forms and from Form builder
               forms that have no recipient of their own (a form's own recipient wins for that form).
    per_hour   at most this many lead emails per site per rolling hour (1 to 60, default 10), so a flood of spam or a
               broken form can't fill an inbox or get the mail account blocked. Leads over the limit are still saved
               in the dashboard; the next email that goes out says how many arrived without one.

Every decision is written to the lead_emails table ("sent", "limited"), which is also what the limit counts.
"""

from __future__ import annotations

import re
import threading
from datetime import datetime, timedelta, timezone

from pydantic import BaseModel, Field, ValidationError, field_validator

from . import config, db, mail, members
from .forms import EMAIL_RE, summary

KEY = "lead_email"
MAX_TO = 3
_lock = threading.Lock()


class LeadEmail(BaseModel):
    enabled: bool = True
    to: str = Field("", max_length=300)
    per_hour: int = Field(10, ge=1, le=60)

    @field_validator("to")
    @classmethod
    def _to(cls, v: str) -> str:
        found = []
        for part in re.split(r"[,;\s]+", (v or "").strip()):
            if not part:
                continue
            if not EMAIL_RE.match(part):
                raise ValueError(f"“{part[:60]}” isn't an email address.")
            if part.lower() not in [f.lower() for f in found]:
                found.append(part)
        if len(found) > MAX_TO:
            raise ValueError(f"Up to {MAX_TO} addresses, please.")
        return ", ".join(found)


class NotifyError(ValueError):
    pass


def load(site_id) -> LeadEmail:
    row = db.one("SELECT value_json FROM site_settings WHERE site_id = ? AND key = ?", site_id, KEY)
    try:
        return LeadEmail.model_validate(db.j(row["value_json"]) if row else {})
    except ValueError:
        return LeadEmail()


def save(site_id: int, data: dict, user: dict | None) -> LeadEmail:
    if not members.can_manage(user, site_id):
        raise PermissionError("Only admins and the site's owners can change where lead emails go.")
    try:
        value = LeadEmail.model_validate(data or {})
    except ValidationError as error:
        from .widgets import friendly
        raise NotifyError(re.sub(r"^to: ", "Send them to: ", re.sub(r"^per hour: ", "At most, per hour: ", friendly(error)))) from None
    db.run("INSERT INTO site_settings (site_id, key, value_json, updated_at) VALUES (?, ?, ?, ?) "
           "ON CONFLICT (site_id, key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at",
           site_id, KEY, db.dumps(value.model_dump()), db.now())
    db.log("Changed lead emails", "on" if value.enabled else "off", user, site_id)
    return value


def _hour_ago() -> str:
    return (datetime.now(timezone.utc) - timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%SZ")


def sent_last_hour(site_id) -> int:
    return db.one("SELECT COUNT(*) AS n FROM lead_emails WHERE site_id = ? AND status = 'sent' AND created_at >= ?",
                  site_id, _hour_ago())["n"]


def _held_since_last_send(site_id) -> int:
    last = db.one("SELECT MAX(id) AS id FROM lead_emails WHERE site_id = ? AND status = 'sent'", site_id)["id"] or 0
    return db.one("SELECT COUNT(*) AS n FROM lead_emails WHERE site_id = ? AND status = 'limited' AND id > ?", site_id, last)["n"]


def status(site_id) -> dict:
    """For the Leads screen."""
    st = load(site_id)
    return {"settings": st.model_dump(), "sent_last_hour": sent_last_hour(site_id), "mail_on": mail.configured(),
            "limited_last_hour": db.one("SELECT COUNT(*) AS n FROM lead_emails WHERE site_id = ? AND status = 'limited' AND created_at >= ?",
                                        site_id, _hour_ago())["n"]}


def lead_received(site: dict, lead_id: int, title: str, data: dict, files: list[str] | None = None, form_recipient: str = "") -> str:
    """
    Email a new lead if this site wants it. Returns what happened: "sent", "limited" (over the hourly cap),
    "off" (the site switched lead emails off), "nobody" (no address), "no-mail" (the server has no mail settings).
    """
    st = load(site["id"])
    if not st.enabled:
        return "off"
    to = form_recipient or st.to
    if not to:
        return "nobody"
    if not mail.configured():
        return "no-mail"
    with _lock:
        if sent_last_hour(site["id"]) >= st.per_hour:
            db.run("INSERT INTO lead_emails (site_id, lead_id, status, sent_to, created_at) VALUES (?, ?, 'limited', ?, ?)",
                   site["id"], lead_id, to, db.now())
            return "limited"
        held = _held_since_last_send(site["id"])
        db.run("INSERT INTO lead_emails (site_id, lead_id, status, sent_to, created_at) VALUES (?, ?, 'sent', ?, ?)",
               site["id"], lead_id, to, db.now())
    who = summary(data)
    reply = who["email"] if EMAIL_RE.match(who.get("email") or "") else ""
    msg = mail.lead_notification(site, title, data, to, f"{config.PUBLIC_URL.rstrip('/')}/sites/{site['id']}/leads/{lead_id}",
                                 files or [], reply)
    if held:
        msg.set_content(msg.get_content().rstrip("\n") + f"\n\nAlso: {held} more message{'s' if held != 1 else ''} arrived without an email "
                        f"(the limit is {st.per_hour} lead emails an hour). They're all in your dashboard.\n")
    mail.send_later(msg)
    return "sent"
