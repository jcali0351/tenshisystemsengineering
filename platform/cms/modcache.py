"""
modcache.py: outside data a module shows (Google reviews, social posts), fetched by the SERVER and kept in the
widget_cache table, so visitors' browsers never talk to those services and API keys never leave the CMS.

    get_json(site_id, key, ttl_seconds, fetch)   the cached value if it's fresh, else fetch() (and cache it);
                                                 on a failed fetch, the last good value (or None)
    http_json(url, headers=None, data=None)      a small HTTPS client (tests replace it)
"""

from __future__ import annotations

import ipaddress
import json
import logging
import socket
import urllib.request
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

from . import db

log = logging.getLogger("tenshi.modcache")


def _now():
    return datetime.now(timezone.utc)


def get_json(site_id, key: str, ttl_seconds: int, fetch):
    row = db.one("SELECT value_json, fetched_at FROM widget_cache WHERE site_id = ? AND key = ?", site_id, key)
    if row:
        try:
            fresh = datetime.strptime(row["fetched_at"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc) > _now() - timedelta(seconds=ttl_seconds)
        except ValueError:
            fresh = False
        if fresh:
            return db.j(row["value_json"])
    try:
        value = fetch()
    except Exception as error:  # noqa: BLE001 - any failure: keep the last good copy
        log.warning("Fetching %s for site %s failed: %s", key.split(":")[0], site_id, type(error).__name__)
        return db.j(row["value_json"]) if row else None
    db.run("INSERT INTO widget_cache (site_id, key, value_json, fetched_at) VALUES (?, ?, ?, ?) "
           "ON CONFLICT (site_id, key) DO UPDATE SET value_json = excluded.value_json, fetched_at = excluded.fetched_at",
           site_id, key, db.dumps(value), db.now())
    return value


def clear(site_id, prefix: str = "") -> None:
    db.run("DELETE FROM widget_cache WHERE site_id = ? AND key LIKE ?", site_id, prefix + "%")


def public_https(url: str) -> bool:
    """https only, and not this machine or a private network (so a URL a client types can't reach inside the server)."""
    try:
        u = urlparse(url)
    except ValueError:
        return False
    if u.scheme != "https" or not u.hostname or u.username or u.password:
        return False
    try:
        infos = socket.getaddrinfo(u.hostname, u.port or 443, proto=socket.IPPROTO_TCP)
    except OSError:
        return False
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast or ip.is_unspecified:
            return False
    return True


def http_json(url: str, headers: dict | None = None, data=None, method: str | None = None, timeout: int = 10):
    """GET (or POST with data, a dict sent as JSON) an https URL and read JSON back."""
    if not url.startswith("https://"):
        raise ValueError("https only")
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(url, data=body, method=method or ("POST" if body is not None else "GET"),
                                 headers={"User-Agent": "TenshiCMS/1.0", "Accept": "application/json",
                                          **({"Content-Type": "application/json"} if body is not None else {}), **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as res:  # noqa: S310 - https only, checked above
        raw = res.read(2_000_000)
    return json.loads(raw or b"null")
