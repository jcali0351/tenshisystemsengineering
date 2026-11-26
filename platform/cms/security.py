"""
security.py: each client site's Content-Security-Policy settings, and an audit of what its pages load.

Every published client page gets a policy (widgets.BASE_CSP, plus the sources of the widgets on that page). A site can
also have, under Settings & theme › Security (admins and the site's owners):
    extra_hosts    hostnames the site's own code may load from (e.g. a booking script in an edited template), added
                   to scripts, styles, fonts, pictures, media, connections, frames and form posts
    report_only    send the policy as Content-Security-Policy-Report-Only: the browser only reports what it would
                   block. A safety valve if a page breaks; switch it off again once the audit is clean.
Stored in site_settings (key "security"), never in git.

audit(site) draws every page the way a deployment would and lists every outside address the pages load, with whether
the page's policy allows it. Custom HTML blocks are already cleaned (no <script>, no <form>, iframes only from
YouTube, Vimeo and Google Maps), so findings usually come from edited template code. From the command line:

    python -m cms.security            (in the platform folder; reads cms_data, changes nothing)
"""

from __future__ import annotations

import re
from html.parser import HTMLParser
from urllib.parse import urlparse

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from . import db

KEY = "security"
HOST_RE = re.compile(r"^(\*\.)?([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$")
EXTRA_DIRECTIVES = ["script-src", "style-src", "img-src", "font-src", "media-src", "connect-src", "frame-src", "form-action"]


class SecurityError(ValueError):
    pass


class SecuritySettings(BaseModel):
    model_config = ConfigDict(extra="ignore")
    extra_hosts: list[str] = Field(default_factory=list, max_length=30)
    report_only: bool = False

    @field_validator("extra_hosts", mode="before")
    @classmethod
    def _split(cls, v):
        if isinstance(v, str):
            v = re.split(r"[\s,]+", v)
        return [str(x) for x in (v or []) if str(x).strip()]

    @field_validator("extra_hosts")
    @classmethod
    def _hosts(cls, v):
        out = []
        for raw in v:
            host = raw.strip().lower()
            if "://" in host:
                host = urlparse(host).hostname or ""
            host = host.split("/")[0].split(":")[0].rstrip(".")
            if host.startswith("*.") and host.count(".") < 2:
                raise ValueError(f"“{host}” is too broad: a wildcard needs a real domain after it, like *.example.com")
            if not HOST_RE.fullmatch(host):
                raise ValueError(f"“{raw.strip()[:60]}” isn't a hostname. Use a name like booking.example.com or *.example.com")
            if host not in out:
                out.append(host)
        return out


def load(site_id) -> SecuritySettings:
    row = db.one("SELECT value_json FROM site_settings WHERE site_id = ? AND key = ?", site_id, KEY) if site_id else None
    try:
        return SecuritySettings.model_validate(db.j(row["value_json"]) if row else {})
    except ValidationError:
        return SecuritySettings()


def save(site_id, data, user=None) -> SecuritySettings:
    from . import widgets
    try:
        value = SecuritySettings.model_validate(data or {})
    except ValidationError as error:
        raise SecurityError(widgets.friendly(error)) from None
    db.run("INSERT INTO site_settings (site_id, key, value_json, updated_at) VALUES (?, ?, ?, ?) "
           "ON CONFLICT (site_id, key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at",
           site_id, KEY, db.dumps(value.model_dump()), db.now())
    db.log("Changed security settings", f"{len(value.extra_hosts)} extra hosts, report-only {'on' if value.report_only else 'off'}", user, site_id)
    return value


def extra_sources(settings: SecuritySettings) -> dict[str, list[str]]:
    hosts = [f"https://{h}" for h in settings.extra_hosts]
    return {d: hosts for d in EXTRA_DIRECTIVES} if hosts else {}


def header_name(settings: SecuritySettings) -> str:
    return "Content-Security-Policy-Report-Only" if settings.report_only else "Content-Security-Policy"


# ---------------------------------------------------------------------------------------------- the audit

def parse_policy(policy: str) -> dict[str, list[str]]:
    out = {}
    for part in policy.split(";"):
        bits = part.split()
        if bits:
            out[bits[0]] = bits[1:]
    return out


def allows(policy: dict, directive: str, url: str) -> bool:
    """Does this policy let `directive` load `url`? (The parts of CSP matching that pages here need.)"""
    sources = policy.get(directive, policy.get("default-src", [])) if directive != "form-action" else policy.get("form-action", ["*"])
    u = urlparse(url)
    scheme, host = (u.scheme or "https").lower(), (u.hostname or "").lower()
    for s in sources:
        if s == "*" or s == f"{scheme}:":
            return True
        m = re.fullmatch(r"(?:(https?)://)?(\*\.)?([^/:]+)(?::\d+)?(/.*)?", s)
        if not m or s.startswith("'"):
            continue
        if m.group(1) and m.group(1) != scheme and not (m.group(1) == "http" and scheme == "https"):
            continue
        base = m.group(3).lower()
        if (m.group(2) and host.endswith("." + base)) or (not m.group(2) and host == base):
            return True
    return False


class _Loads(HTMLParser):
    """Every outside address a page asks the browser to load, with the CSP directive that governs it."""
    TAGS = {("script", "src"): "script-src", ("iframe", "src"): "frame-src", ("frame", "src"): "frame-src",
            ("img", "src"): "img-src", ("video", "src"): "media-src", ("audio", "src"): "media-src", ("source", "src"): "media-src",
            ("track", "src"): "media-src", ("embed", "src"): "object-src", ("object", "data"): "object-src", ("form", "action"): "form-action",
            ("video", "poster"): "img-src"}

    def __init__(self):
        super().__init__()
        self.found, self._style = [], False

    def handle_starttag(self, tag, attrs):
        a = {k: (v or "") for k, v in attrs}
        for (t, attr), directive in self.TAGS.items():
            if tag == t and a.get(attr):
                self._add(tag, a[attr], directive)
        if tag == "link" and a.get("href"):
            rel = a.get("rel", "").lower()
            directive = "style-src" if "stylesheet" in rel else ("font-src" if a.get("as") == "font" else ("script-src" if a.get("as") == "script" else ("img-src" if "icon" in rel else None)))
            if directive:
                self._add("link", a["href"], directive)
        if a.get("style"):
            for url in re.findall(r"url\(\s*['\"]?([^'\")]+)", a["style"]):
                self._add(tag + "[style]", url, "img-src")
        self._style = tag == "style"

    def handle_data(self, data):
        if self._style:
            for url in re.findall(r"@import\s+(?:url\()?\s*['\"]?([^'\")\s;]+)", data):
                self._add("style @import", url, "style-src")
            for url in re.findall(r"url\(\s*['\"]?(https?://[^'\")]+)", data):
                self._add("style url()", url, "font-src" if re.search(r"\.(woff2?|ttf|otf)(\?|$)", url) else "img-src")

    def handle_endtag(self, tag):
        if tag == "style":
            self._style = False

    def _add(self, tag, url, directive):
        url = url.strip()
        if url.startswith("//"):
            url = "https:" + url
        if re.match(r"^https?://", url, re.I):
            self.found.append({"tag": tag, "url": url[:300], "host": (urlparse(url).hostname or "").lower(), "directive": directive})


def audit(site) -> list[dict]:
    """Outside addresses each page of the site loads (as published now, from the current pages and template)."""
    from . import render, templates, widgets
    renderer = render.SiteRenderer(site, "hosted")
    pages, menu = render.site_pages(site["id"])
    settings = load(site["id"])
    findings = []
    css_files = []
    tpl = templates.current_dir(renderer.template_id)
    if tpl.exists():
        css_files = [f for f in tpl.rglob("*.css") if f.is_file()]
    for page in pages:
        html = renderer.render_page(page, menu)
        file = "index.html" if page["slug"] == "index" else f"{page['slug']}.html"
        policy = parse_policy(widgets.csp_for(renderer.used_widgets.get(file, []), extra=extra_sources(settings),
                                              block_sources=renderer.page_sources.get(file)))
        p = _Loads()
        p.feed(html)
        for css in css_files:             # the template's stylesheets load on every page
            p.handle_starttag("style", [])
            p.handle_data(css.read_text(encoding="utf-8", errors="ignore"))
            p.handle_endtag("style")
        for f in p.found:
            findings.append({**f, "page": file, "allowed": allows(policy, f["directive"], f["url"])})
    return findings


def blocked_hosts(findings) -> list[str]:
    return sorted({f["host"] for f in findings if not f["allowed"] and f["host"]})


def main():  # pragma: no cover - command line
    from . import config
    config.ensure_folders()
    db.setup()
    rows = db.all("SELECT * FROM sites ORDER BY id")
    bad = 0
    for site in rows:
        f = audit(site)
        blocked = [x for x in f if not x["allowed"]]
        bad += bool(blocked)
        print(f"#{site['id']} {site['subdomain']}: {len(f)} outside loads, {len(blocked)} blocked by its policy"
              + (" (report-only on)" if load(site["id"]).report_only else ""))
        for x in blocked:
            print(f"    {x['page']}: <{x['tag']}> {x['url']}  ({x['directive']})")
    print(f"{len(rows)} sites checked, {bad} with something blocked. Fix: Settings & theme › Security › Extra allowed hosts.")


if __name__ == "__main__":  # pragma: no cover
    main()
