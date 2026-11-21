#!/usr/bin/env python3
"""Tenshi contact form service: receives the website's contact form and emails it to the team.

Runs on the server as the systemd service "tenshi-contact" (see tools/server/setup.sh), listening on
127.0.0.1:9124. Caddy sends https://tenshisystems.com/api/contact here. Python standard library only.

Every message is first saved to CONTACT_DIR as a JSON file, so nothing is lost if email is not set up yet or the
mail server is down; unsent messages are retried on start-up and every 10 minutes.

Settings come from environment variables (systemd EnvironmentFile /etc/tenshi-contact.env, never in git):
    CONTACT_TO       comma-separated recipients            (required to send)
    CONTACT_FROM     sender address, e.g. "Tenshi Website <admin@tenshisystems.com>"
    SMTP_HOST        e.g. smtp.hostinger.com or smtp.gmail.com
    SMTP_PORT        465 (SSL) or 587 (STARTTLS)
    SMTP_USER        mailbox login
    SMTP_PASS        mailbox password or app password
    CONTACT_DIR      where messages are saved              (default /srv/tenshi/data/contact)
    ALLOWED_ORIGINS  comma-separated                       (default https://tenshisystems.com,https://www.tenshisystems.com)

Protection: same-origin check, a hidden honeypot field, a minimum fill-in time, size limits, field validation and
a per-IP rate limit (5 messages per hour). Nothing the visitor typed is ever put into email headers except a
validated Reply-To address.
"""
import json
import os
import re
import secrets
import smtplib
import ssl
import threading
import time
from datetime import datetime, timezone
from email.message import EmailMessage
from email.utils import formataddr, make_msgid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PORT = int(os.environ.get("CONTACT_PORT", "9124"))
DIR = Path(os.environ.get("CONTACT_DIR", "/srv/tenshi/data/contact"))
ORIGINS = {o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "https://tenshisystems.com,https://www.tenshisystems.com").split(",") if o.strip()}
MAX_BODY = 32 * 1024
RATE = 5                 # messages
RATE_WINDOW = 3600       # per hour per IP
EMAIL_RE = re.compile(r"^[^@\s<>\"',;]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$")
TOPICS = {"web design", "web development", "web hosting", "ai services", "software development", "technology consulting",
          "branding", "media design", "content management", "other", ""}

_hits = {}
_lock = threading.Lock()


def clean(v, n):
    v = "" if v is None else str(v)
    v = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", v).strip()
    return v[:n]


def rate_ok(ip):
    now = time.time()
    with _lock:
        hits = [t for t in _hits.get(ip, []) if now - t < RATE_WINDOW]
        if len(hits) >= RATE:
            _hits[ip] = hits
            return False
        hits.append(now)
        _hits[ip] = hits
        return True


def smtp_ready():
    return all(os.environ.get(k) for k in ("CONTACT_TO", "SMTP_HOST", "SMTP_USER", "SMTP_PASS"))


def send(msg):
    to = [a.strip() for a in os.environ["CONTACT_TO"].split(",") if a.strip()]
    sender = os.environ.get("CONTACT_FROM") or os.environ["SMTP_USER"]
    m = EmailMessage()
    m["Subject"] = f"New website inquiry: {msg['topic'] or 'General'} from {msg['name']}"
    m["From"] = sender
    m["To"] = ", ".join(to)
    m["Reply-To"] = formataddr((msg["name"], msg["email"]))
    m["Message-ID"] = make_msgid(domain="tenshisystems.com")
    lines = [
        f"Name:     {msg['name']}",
        f"Email:    {msg['email']}",
        f"Company:  {msg['company'] or '-'}",
        f"Phone:    {msg['phone'] or '-'}",
        f"Topic:    {msg['topic'] or '-'}",
        f"Page:     {msg['page'] or '-'}",
        f"Received: {msg['received']}",
        "",
        msg["message"],
        "",
        "-- Sent from the contact form on tenshisystems.com. Reply to this email to answer the visitor.",
    ]
    m.set_content("\n".join(lines))
    host, port = os.environ["SMTP_HOST"], int(os.environ.get("SMTP_PORT", "465"))
    ctx = ssl.create_default_context()
    if port == 465:
        with smtplib.SMTP_SSL(host, port, context=ctx, timeout=20) as s:
            s.login(os.environ["SMTP_USER"], os.environ["SMTP_PASS"])
            s.send_message(m, to_addrs=to)
    else:
        with smtplib.SMTP(host, port, timeout=20) as s:
            s.starttls(context=ctx)
            s.login(os.environ["SMTP_USER"], os.environ["SMTP_PASS"])
            s.send_message(m, to_addrs=to)


def deliver(path):
    """Try to email one saved message; mark it sent on success."""
    data = json.loads(path.read_text("utf-8"))
    if data.get("sent") or not smtp_ready():
        return bool(data.get("sent"))
    try:
        send(data)
        data["sent"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
        data.pop("error", None)
        ok = True
    except Exception as e:                       # keep it for the next retry
        data["error"] = f"{type(e).__name__}: {e}"[:300]
        ok = False
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False), "utf-8")
    tmp.replace(path)
    return ok


def retry_loop():
    while True:
        try:
            for p in sorted(DIR.glob("*.json")):
                deliver(p)
        except Exception:
            pass
        time.sleep(600)


class Handler(BaseHTTPRequestHandler):
    server_version = "tenshi-contact"

    def log_message(self, fmt, *args):          # no visitor data in the logs
        pass

    def reply(self, code, body):
        raw = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        if self.path.split("?")[0] == "/api/contact/health":
            return self.reply(200, {"ok": True, "email": smtp_ready()})
        self.reply(404, {"ok": False})

    def do_POST(self):
        if self.path.split("?")[0] != "/api/contact":
            return self.reply(404, {"ok": False})
        origin = self.headers.get("Origin", "")
        if origin not in ORIGINS:
            return self.reply(403, {"ok": False, "error": "origin"})
        n = int(self.headers.get("Content-Length") or 0)
        if n <= 0 or n > MAX_BODY:
            return self.reply(413, {"ok": False, "error": "size"})
        try:
            data = json.loads(self.rfile.read(n).decode("utf-8"))
            assert isinstance(data, dict)
        except Exception:
            return self.reply(400, {"ok": False, "error": "format"})

        # bots: a hidden field people never fill in, and forms sent faster than a person can type
        if clean(data.get("website"), 200) or float(data.get("elapsed") or 0) < 3000:
            return self.reply(200, {"ok": True})

        ip = (self.headers.get("X-Forwarded-For") or self.client_address[0]).split(",")[0].strip()
        if not rate_ok(ip):
            return self.reply(429, {"ok": False, "error": "rate"})

        msg = {
            "name": clean(data.get("name"), 100),
            "email": clean(data.get("email"), 254),
            "company": clean(data.get("company"), 120),
            "phone": clean(data.get("phone"), 40),
            "topic": clean(data.get("topic"), 60),
            "message": clean(data.get("message"), 5000),
            "page": clean(data.get("page"), 200),
            "received": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        }
        errors = {}
        if not msg["name"]:
            errors["name"] = "required"
        if not EMAIL_RE.match(msg["email"]):
            errors["email"] = "invalid"
        if len(msg["message"]) < 10:
            errors["message"] = "short"
        if msg["topic"].lower() not in TOPICS:
            msg["topic"] = clean(msg["topic"], 60)
        if errors:
            return self.reply(422, {"ok": False, "error": "fields", "fields": errors})

        DIR.mkdir(parents=True, exist_ok=True)
        path = DIR / f"{datetime.now(timezone.utc):%Y%m%d-%H%M%S}-{secrets.token_hex(4)}.json"
        path.write_text(json.dumps(msg, indent=2, ensure_ascii=False), "utf-8")
        os.chmod(path, 0o600)
        sent = deliver(path)
        self.reply(200, {"ok": True, "emailed": sent})


if __name__ == "__main__":
    DIR.mkdir(parents=True, exist_ok=True)
    threading.Thread(target=retry_loop, daemon=True).start()
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
