"""
auth.py: signing in.

Passwords are never stored. We store a "hash": a scrambled fingerprint made with scrypt (built into Python),
which can check a password but can't be turned back into it.

The first time the CMS runs there are no users, so it shows a Setup screen that creates the first admin.
"""

import base64
import hashlib
import hmac
import secrets

from . import db

ROLES = {"admin": "Admin: everything, including users, deployments, export and deleting",
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
