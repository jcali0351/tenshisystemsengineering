"""
mail.py: email from the CMS (new-lead notifications), through the same SMTP settings as the website's contact form
(tools/server/contact_service.py). Put them in /etc/tenshi-cms.env (tools/server/cms-mail-setup.sh copies them from
/etc/tenshi-contact.env) and restart tenshi-cms:

    SMTP_HOST      e.g. smtp.hostinger.com
    SMTP_PORT      465 (SSL, the default) or 587 (STARTTLS)
    SMTP_USER      the mailbox login
    SMTP_PASS      its password
    CONTACT_FROM   optional: the From address (default SMTP_USER)

Without them nothing is sent (leads still arrive in the dashboard, and the Leads screen says email is off).
Sending happens on a background thread, so a slow mail server never slows a visitor's form.
"""

from __future__ import annotations

import logging
import os
import smtplib
import ssl
import threading
from email.message import EmailMessage
from email.utils import formataddr

log = logging.getLogger("tenshi.mail")
sent: list[EmailMessage] = []          # tests: messages "sent" when TENSHI_MAIL_TEST=1


def configured() -> bool:
    return os.environ.get("TENSHI_MAIL_TEST") == "1" or all(os.environ.get(k) for k in ("SMTP_HOST", "SMTP_USER", "SMTP_PASS"))


def _send(msg: EmailMessage) -> None:
    if os.environ.get("TENSHI_MAIL_TEST") == "1":
        sent.append(msg)
        return
    host, port = os.environ["SMTP_HOST"], int(os.environ.get("SMTP_PORT") or 465)
    ctx = ssl.create_default_context()
    try:
        if port == 465:
            with smtplib.SMTP_SSL(host, port, context=ctx, timeout=20) as s:
                s.login(os.environ["SMTP_USER"], os.environ["SMTP_PASS"])
                s.send_message(msg)
        else:
            with smtplib.SMTP(host, port, timeout=20) as s:
                s.starttls(context=ctx)
                s.login(os.environ["SMTP_USER"], os.environ["SMTP_PASS"])
                s.send_message(msg)
    except (OSError, smtplib.SMTPException) as error:
        log.warning("Lead email to %s not sent: %s", msg["To"], type(error).__name__)


def lead_notification(site: dict, form_title: str, data: dict, to: str, lead_url: str, files: list[str], reply_to: str = "") -> EmailMessage:
    msg = EmailMessage()
    sender = os.environ.get("CONTACT_FROM") or os.environ.get("SMTP_USER") or "no-reply@localhost"
    msg["From"] = formataddr((f"{site.get('name', 'Website')} (Tenshi)"[:70], sender))
    msg["To"] = to
    msg["Subject"] = f"New {form_title or 'form'} message from your website"[:150].replace("\n", " ").replace("\r", " ")
    if reply_to:
        msg["Reply-To"] = reply_to
    lines = [f"Someone sent the “{form_title}” form on {site.get('name', 'your website')}.", ""]
    lines += [f"{k}: {v}" for k, v in data.items()]
    if files:
        lines += ["", "Attached files (sign in to download): " + ", ".join(files)]
    lines += ["", f"See it in your dashboard: {lead_url}"]
    msg.set_content("\n".join(lines))
    return msg


def send_later(msg: EmailMessage) -> bool:
    """Send in the background. False (and nothing sent) when the server has no mail settings."""
    if not configured():
        return False
    if os.environ.get("TENSHI_MAIL_TEST") == "1":
        _send(msg)
    else:
        threading.Thread(target=_send, args=(msg,), daemon=True).start()
    return True


def simple(site: dict, to: str, subject: str, body: str, reply_to: str = "") -> bool:
    """A plain message from a site (an RSVP or booking confirmation). Nothing is sent when mail is off: returns False."""
    if not to or not configured():
        return False
    from . import demo_sites
    if demo_sites.is_demo(site):                       # demo sites never send email
        return False
    msg = EmailMessage()
    sender = os.environ.get("CONTACT_FROM") or os.environ.get("SMTP_USER") or "no-reply@localhost"
    msg["From"] = formataddr((str(site.get("name") or "Website")[:70], sender))
    msg["To"] = to
    msg["Subject"] = subject[:150].replace("\n", " ").replace("\r", " ")
    if reply_to:
        msg["Reply-To"] = reply_to
    msg.set_content(body)
    return send_later(msg)
