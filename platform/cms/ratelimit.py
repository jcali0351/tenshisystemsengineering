"""
ratelimit.py: how often one visitor may post a live site's contact form (/__form), kept in the database (form_posts)
so it holds across restarts and workers. Per site: PER_IP posts per visitor per IP_WINDOW, and PER_SITE posts from
everyone per SITE_WINDOW (a flood from many addresses can't fill the leads inbox). IPs are stored hashed.
"""
import hashlib
from datetime import datetime, timedelta, timezone

from . import config, db

PER_IP, IP_WINDOW = 5, timedelta(minutes=10)
PER_SITE, SITE_WINDOW = 60, timedelta(hours=1)
KEEP = timedelta(days=1)


def _ago(delta):
    return (datetime.now(timezone.utc) - delta).strftime("%Y-%m-%dT%H:%M:%SZ")


def ip_hash(site_id, ip) -> str:
    key = config.secret_key()
    key = key if isinstance(key, bytes) else str(key).encode()
    return hashlib.sha256(key + f"|{site_id}|{ip}".encode()).hexdigest()[:32]


def allow_form_post(site_id, ip) -> bool:
    """Record one post and say whether it's within the limits. A visitor's refused posts count against that visitor
    (hammering keeps them out), but only accepted posts count toward the site's total (one abuser can't block it)."""
    h = ip_hash(site_id, ip)
    mine = db.one("SELECT COUNT(*) AS n FROM form_posts WHERE site_id = ? AND ip_hash = ? AND created_at > ?", site_id, h, _ago(IP_WINDOW))["n"]
    everyone = db.one("SELECT COUNT(*) AS n FROM form_posts WHERE site_id = ? AND ok = 1 AND created_at > ?", site_id, _ago(SITE_WINDOW))["n"]
    ok = mine < PER_IP and everyone < PER_SITE
    db.run("INSERT INTO form_posts (site_id, ip_hash, ok, created_at) VALUES (?, ?, ?, ?)", site_id, h, int(ok), db.now())
    db.run("DELETE FROM form_posts WHERE created_at < ?", _ago(KEEP))
    return ok
