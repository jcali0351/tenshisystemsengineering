"""
account.py: two-step sign-in and forgotten passwords.

Two-step sign-in (TOTP, RFC 6238): the same 6-digit codes as Google Authenticator, Microsoft Authenticator, 1Password,
Authy … After the password, people who switched it on type the code from their phone (or one of 8 one-use backup codes).
The secret is kept in users.totp_secret; backup codes only as SHA-256 hashes. Wrong codes count towards the sign-in
lockout (auth.py) under the key "2fa:<email>".

Forgotten password: "Forgot your password?" emails a one-use link valid for an hour (only its hash is stored). The answer
on screen is the same whether or not the address has an account, so nobody can find out who has one.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets
import struct
import time
from email.message import EmailMessage
from email.utils import formataddr
from urllib.parse import quote

from . import auth, config, db

ISSUER = "Tenshi CMS"
RESET_SECONDS = 3600


class AccountError(ValueError):
    pass


# ---------------------------------------------------------------------------------------------- TOTP

def new_secret() -> str:
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")


def _code(secret: str, counter: int) -> str:
    key = base64.b32decode(secret + "=" * (-len(secret) % 8), casefold=True)
    digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    off = digest[-1] & 0x0F
    return f"{(struct.unpack('>I', digest[off:off + 4])[0] & 0x7FFFFFFF) % 1_000_000:06d}"


def code_now(secret: str, at: float | None = None) -> str:
    return _code(secret, int((at or time.time()) // 30))


def check_code(secret: str, code: str, at: float | None = None) -> bool:
    code = "".join(ch for ch in str(code or "") if ch.isdigit())
    if len(code) != 6 or not secret:
        return False
    step = int((at or time.time()) // 30)
    return any(hmac.compare_digest(_code(secret, step + d), code) for d in (-1, 0, 1))


def uri(secret: str, email: str) -> str:
    return f"otpauth://totp/{quote(ISSUER)}:{quote(email)}?secret={secret}&issuer={quote(ISSUER)}&digits=6&period=30"


def qr_svg(text: str) -> str:
    """The setup link as a QR code (SVG), when the segno package is installed; '' otherwise (the key is shown instead)."""
    try:
        import io
        import segno
    except ImportError:
        return ""
    buf = io.BytesIO()
    segno.make(text, error="m").save(buf, kind="svg", scale=5, border=2, dark="#111", light="#fff", xmldecl=False, svgns=True)
    return buf.getvalue().decode()


def _hash(code: str) -> str:
    return hashlib.sha256(("tenshi-backup:" + code.replace("-", "").upper()).encode()).hexdigest()


def new_backup_codes() -> list[str]:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return ["".join(secrets.choice(alphabet) for _ in range(5)) + "-" + "".join(secrets.choice(alphabet) for _ in range(5)) for _ in range(8)]


def enabled(user) -> bool:
    return bool(user and user.get("totp_secret"))


def turn_on(user_id: int, secret: str, code: str) -> list[str]:
    if not check_code(secret, code):
        raise AccountError("That code doesn't match. Check the time on your phone is right, and type the newest code.")
    codes = new_backup_codes()
    db.run("UPDATE users SET totp_secret = ?, totp_backup = ? WHERE id = ?", secret, ",".join(_hash(c) for c in codes), user_id)
    db.log("Turned on two-step sign-in", "", {"id": user_id})
    return codes


def turn_off(user_id: int, by=None) -> None:
    db.run("UPDATE users SET totp_secret = '', totp_backup = '' WHERE id = ?", user_id)
    db.log("Turned off two-step sign-in", f"user #{user_id}", by)


def verify_second_step(user: dict, code: str) -> bool:
    """A 6-digit code, or an unused backup code (which is then used up)."""
    if check_code(user.get("totp_secret", ""), code):
        return True
    raw = str(code or "").strip().upper()
    if len(raw.replace("-", "")) == 10:
        hashes = [h for h in (user.get("totp_backup") or "").split(",") if h]
        h = _hash(raw)
        if h in hashes:
            hashes.remove(h)
            db.run("UPDATE users SET totp_backup = ? WHERE id = ?", ",".join(hashes), user["id"])
            db.log("Signed in with a backup code", f"{len(hashes)} left", user)
            return True
    return False


def backup_left(user) -> int:
    return len([h for h in (user.get("totp_backup") or "").split(",") if h])


# ---------------------------------------------------------------------------------------------- passwords

def change_password(user: dict, current: str, new: str) -> None:
    if not auth.check_password(current or "", user["password_hash"]):
        raise AccountError("Your current password isn't right.")
    set_password(user["id"], new)
    db.log("Changed their password", "", user)


def set_password(user_id: int, new: str) -> None:
    if len(new or "") < 8:
        raise AccountError("Passwords need at least 8 characters.")
    db.run("UPDATE users SET password_hash = ? WHERE id = ?", auth.hash_password(new), user_id)


def start_reset(email: str) -> bool:
    """Email a reset link if the address has an account (and mail is set up). Returns whether a message was queued."""
    from . import mail
    user = db.one("SELECT * FROM users WHERE email = ?", (email or "").strip().lower())
    if not user or user["role"] == "demo" or not mail.configured():
        return False
    db.run("DELETE FROM password_resets WHERE expires < ? OR user_id = ?", time.time(), user["id"])
    token = secrets.token_urlsafe(32)
    db.run("INSERT INTO password_resets (user_id, token_hash, expires, created_at) VALUES (?, ?, ?, ?)",
           user["id"], hashlib.sha256(token.encode()).hexdigest(), time.time() + RESET_SECONDS, db.now())
    link = f"{config.PUBLIC_URL.rstrip('/')}/reset?token={token}"
    msg = EmailMessage()
    sender = os.environ.get("CONTACT_FROM") or os.environ.get("SMTP_USER") or "no-reply@localhost"
    msg["From"] = formataddr((ISSUER, sender))
    msg["To"] = user["email"]
    msg["Subject"] = "Reset your Tenshi CMS password"
    msg.set_content(f"Hello {user['name']},\n\nSomeone (hopefully you) asked to reset the password for {user['email']}.\n"
                    f"Open this link within an hour to choose a new one:\n\n{link}\n\n"
                    "If it wasn't you, ignore this email: your password stays the same.\n")
    db.log("Asked for a password reset", "", user)
    return mail.send_later(msg)


def reset_user(token: str) -> dict | None:
    if not token:
        return None
    row = db.one("SELECT * FROM password_resets WHERE token_hash = ? AND used = 0 AND expires > ?",
                 hashlib.sha256(token.encode()).hexdigest(), time.time())
    return db.one("SELECT * FROM users WHERE id = ?", row["user_id"]) if row else None


def finish_reset(token: str, new: str) -> dict:
    user = reset_user(token)
    if not user:
        raise AccountError("This link has expired or was already used. Ask for a new one.")
    set_password(user["id"], new)
    db.run("UPDATE password_resets SET used = 1 WHERE token_hash = ?", hashlib.sha256(token.encode()).hexdigest())
    db.log("Reset their password by email", "", user)
    return user
