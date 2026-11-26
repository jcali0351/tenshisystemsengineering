"""
domains.py: a site's own domains (www.example.com) and the HTTPS certificate guard Caddy asks.

A client site always has <subdomain>.<SITES_DOMAIN>. Owners and admins can attach up to MAX_PER_SITE of their own
domains (Settings › Custom domains); the CMS then serves the site for those names too.

Caddy gets HTTPS certificates on demand, the first time a browser asks for a name. Before it does, it asks
GET /__tls/ask?domain=<name> (tools/server/tenshi-tls-ask.sh points it here). The answer is 200 only for
  - <subdomain>.<SITES_DOMAIN> of a site that exists, and
  - a custom domain attached to a site that exists;
anything else gets 404, so nobody can make the server request certificates for made-up names (Let's Encrypt limits).
Only Caddy itself may ask: a request that came through Caddy's proxy (it adds X-Forwarded-For) or from another
machine gets a plain 404.
"""

from __future__ import annotations

import ipaddress
import re

from . import config, db, members

MAX_PER_SITE = 5
LABEL = re.compile(r"^(?!-)[a-z0-9-]{1,63}(?<!-)$")
TLD = re.compile(r"^([a-z]{2,63}|xn--[a-z0-9-]{1,59})$")
MAIN_DOMAINS = {"tenshisystems.com"}


class DomainError(ValueError):
    pass


def normalize(name: str) -> str:
    """'HTTPS://Www.Example.com:443/path' -> 'www.example.com' (IDN names in their xn-- form). '' if it can't be one."""
    name = (name or "").strip().lower()
    name = re.sub(r"^[a-z]+://", "", name).split("/")[0].split("?")[0].split("#")[0]
    name = re.sub(r":\d+$", "", name).rstrip(".")
    if not name or len(name) > 253 or "@" in name or "*" in name:
        return ""
    try:
        name = name.encode("idna").decode("ascii")
    except UnicodeError:
        return ""
    labels = name.split(".")
    if len(labels) < 2 or not all(LABEL.match(x) for x in labels) or not TLD.match(labels[-1]):
        return ""
    try:
        ipaddress.ip_address(name)
        return ""
    except ValueError:
        return name


def _ours(name: str) -> bool:
    """A name under the CMS's own domains (those are subdomains, not custom domains)."""
    for d in MAIN_DOMAINS | {config.SITES_DOMAIN.lower()}:
        if name == d or name.endswith("." + d):
            return True
    return False


def for_site(site_id) -> list[dict]:
    return db.all("SELECT domain, created_at FROM site_domains WHERE site_id = ? ORDER BY domain", site_id)


def add(site_id: int, name: str, user: dict | None) -> str:
    if not members.can_manage(user, site_id):
        raise PermissionError("Only admins and the site's owners can add a domain.")
    domain = normalize(name)
    if not domain:
        raise DomainError("That isn't a domain name. Type it like www.example.com.")
    if _ours(domain):
        raise DomainError("That's one of our own addresses: change the site's web address above instead.")
    taken = db.one("SELECT site_id FROM site_domains WHERE domain = ?", domain)
    if taken:
        raise DomainError("This site already has that domain." if taken["site_id"] == site_id else "Another site already uses that domain.")
    if len(for_site(site_id)) >= MAX_PER_SITE:
        raise DomainError(f"A site can have up to {MAX_PER_SITE} domains.")
    db.run("INSERT INTO site_domains (domain, site_id, created_at) VALUES (?, ?, ?)", domain, site_id, db.now())
    db.log("Added a domain", domain, user, site_id)
    return domain


def remove(site_id: int, name: str, user: dict | None) -> None:
    if not members.can_manage(user, site_id):
        raise PermissionError("Only admins and the site's owners can remove a domain.")
    domain = normalize(name) or (name or "").strip().lower()
    if not db.one("SELECT 1 FROM site_domains WHERE domain = ? AND site_id = ?", domain, site_id):
        raise DomainError("This site doesn't have that domain.")
    db.run("DELETE FROM site_domains WHERE domain = ? AND site_id = ?", domain, site_id)
    db.log("Removed a domain", domain, user, site_id)


def subdomain_for_host(host: str) -> str | None:
    """The site subdomain a custom domain belongs to (for serving it), or None."""
    name = normalize(host)
    if not name or _ours(name):
        return None
    row = db.one("SELECT s.subdomain FROM site_domains d JOIN sites s ON s.id = d.site_id WHERE d.domain = ?", name)
    return row["subdomain"] if row else None


def allowed_for_tls(name: str) -> bool:
    """Caddy's question: may it get a certificate for this name?"""
    from .sites import RESERVED
    name = normalize(name)
    if not name:
        return False
    base = config.SITES_DOMAIN.lower()
    if name.endswith("." + base):
        sub = name[: -len(base) - 1]
        return "." not in sub and sub not in RESERVED and bool(db.one("SELECT 1 FROM sites WHERE subdomain = ?", sub))
    if _ours(name):
        return False
    return bool(db.one("SELECT 1 FROM site_domains d JOIN sites s ON s.id = d.site_id WHERE d.domain = ?", name))


def from_caddy(client_host: str | None, headers) -> bool:
    """Caddy asks over loopback, directly. Anything proxied (X-Forwarded-For) or remote is someone else."""
    if (client_host or "") not in ("127.0.0.1", "::1"):
        return False
    return not any(h in headers for h in ("x-forwarded-for", "x-forwarded-host", "forwarded", "x-real-ip"))
