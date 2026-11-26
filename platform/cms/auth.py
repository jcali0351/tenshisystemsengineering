"""
auth.py: signing in.

Passwords are never stored. We store a "hash": a scrambled fingerprint made with scrypt (built into Python),
which can check a password but can't be turned back into it.

The first time the CMS runs there are no users, so it shows a Setup screen that creates the first admin.
"""

import base64
import hashlib
import hmac
import os
import secrets
import time

from . import db

ROLES = {"demo": "Demo visitor: the public \u201cTry the CMS\u201d sandbox only (sandbox.py); not for real people",
         "admin": "Admin: everything, including users, deployments, export and deleting",
         "editor": "Editor: content, media, pages, portfolio and galleries"}


def hash_password(password):
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2 ** 14, r=8, p=1, dklen=32)
    return "scrypt$" + base64.b64encode(salt).decode() + "$" + base64.b64encode(digest).decode()


def check_password(password, stored):
    try:
        _, salt_b64, digest_b64 = stored.split("$")
        salt, digest = base64.b64decode(salt_b64), base64.b64decode(digest_b64)
    except ValueError:
        return False
    test = hashlib.scrypt(password.encode(), salt=salt, n=2 ** 14, r=8, p=1, dklen=len(digest))
    return hmac.compare_digest(test, digest)          # compare safely (same time whatever the answer)


def create_user(email, name, password, role="editor"):
    if role not in ROLES:
        raise ValueError("Unknown role")
    if len(password) < 8:
        raise ValueError("Passwords need at least 8 characters.")
    return db.run("INSERT INTO users (email, name, role, password_hash, created_at) VALUES (?, ?, ?, ?, ?)",
                  email.strip().lower(), name.strip(), role, hash_password(password), db.now())


def sign_in(email, password):
    """The user if the email and password match, otherwise None."""
    user = db.one("SELECT * FROM users WHERE email = ?", email.strip().lower())
    if user and check_password(password, user["password_hash"]):
        return user
    return None


def needs_setup():
    return db.one("SELECT COUNT(*) AS n FROM users")["n"] == 0


# ---------------------------------------------------------------------------------------------- sign-in rate limiting
# After MAX_FAILS wrong passwords for the same email from the same IP within WINDOW seconds, that IP can't try that
# email again until LOCK seconds after the last failure. One IP is also stopped after IP_MAX_FAILS failures across any
# emails (password spraying). A successful sign-in clears that IP + email's failures. Stored in the database, so it
# survives restarts. Settings: TENSHI_LOGIN_MAX_FAILS, TENSHI_LOGIN_WINDOW, TENSHI_LOGIN_LOCK, TENSHI_LOGIN_IP_MAX_FAILS.

def _limit(name, default):
    return int(os.environ.get(name, default))


MAX_FAILS = _limit("TENSHI_LOGIN_MAX_FAILS", 5)
WINDOW = _limit("TENSHI_LOGIN_WINDOW", 15 * 60)
LOCK = _limit("TENSHI_LOGIN_LOCK", 15 * 60)
IP_MAX_FAILS = _limit("TENSHI_LOGIN_IP_MAX_FAILS", 20)


def _wait(times, limit, now):
    """Seconds left on a lockout, given failure times (oldest first): locked when `limit` of them fall within WINDOW
    of the latest one, until LOCK seconds after that latest failure."""
    if len(times) < limit:
        return 0
    last = times[-1]
    if len([t for t in times if t >= last - WINDOW]) < limit:
        return 0
    return max(0, last + LOCK - now)


def locked_for(ip, email, now=None):
    """Seconds this IP must wait before trying this email again (0 = may try now)."""
    now = now or time.time()
    since = now - WINDOW - LOCK
    mine = [r["at"] for r in db.all("SELECT at FROM login_failures WHERE ip = ? AND email = ? AND at > ? ORDER BY at",
                                      ip, (email or "").strip().lower(), since)]
    anyone = [r["at"] for r in db.all("SELECT at FROM login_failures WHERE ip = ? AND at > ? ORDER BY at", ip, since)]
    wait = max(_wait(mine, MAX_FAILS, now), _wait(anyone, IP_MAX_FAILS, now))
    return int(wait) + (1 if wait % 1 else 0)


def note_failure(ip, email, now=None):
    now = now or time.time()
    db.run("INSERT INTO login_failures (ip, email, at) VALUES (?, ?, ?)", ip, (email or "").strip().lower(), now)
    db.run("DELETE FROM login_failures WHERE at < ?", now - (WINDOW + LOCK) * 2)


def clear_failures(ip, email):
    db.run("DELETE FROM login_failures WHERE ip = ? AND email = ?", ip, (email or "").strip().lower())
