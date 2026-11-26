"""
chrome.py: a site's global header and footer, edited once (Header & footer, ui/chrome.html) and used on every page.

When turned on, the renderer swaps the template's own <header class="top"> and <footer class="bottom"> for these
(templates without them get the header after <body> and the footer before </body>). The markup reuses the starter
design's classes (.top, .menu, .menu-btn, .bottom …), so it looks native in every template and site.js's phone menu
still works; static/widgets/chrome/chrome.css adds the CTA, footer columns and social links.
Stored in site_settings (key "chrome"). With the brand lock on, only owners and admins can change it.
"""
import re
from datetime import date

from markupsafe import Markup, escape
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from . import db

KEY = "chrome"
NETWORKS = {"facebook": "Facebook", "instagram": "Instagram", "x": "X", "linkedin": "LinkedIn", "youtube": "YouTube",
            "tiktok": "TikTok", "pinterest": "Pinterest", "threads": "Threads", "whatsapp": "WhatsApp"}


class ChromeError(ValueError):
    pass


def _link(v):
    from .widgets import clean_link
    return clean_link(v)


class NavLink(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
    label: str = Field("", max_length=60)
    link: str = Field("", max_length=500)

    @field_validator("link")
    @classmethod
    def _l(cls, v):
        return _link(v)


class Column(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
    heading: str = Field("", max_length=60)
    text: str = Field("", max_length=600)
    links: list[NavLink] = Field(default_factory=list, max_length=10)


class Header(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
    enabled: bool = False
    logo_media: int | None = None
    show_name: bool = True
    menu: str = "pages"                      # pages: the pages marked "Show in the menu" (+ links); custom: only links
    links: list[NavLink] = Field(default_factory=list, max_length=12)
    cta_text: str = Field("", max_length=40)
    cta_link: str = Field("contact", max_length=500)
    show_phone: bool = True

    @field_validator("logo_media", mode="before")
    @classmethod
    def _logo(cls, v):
        return int(v) if str(v or "").isdigit() else None

    @field_validator("menu")
    @classmethod
    def _menu(cls, v):
        if v not in ("pages", "custom"):
            raise ValueError("menu is pages or custom")
        return v

    @field_validator("cta_link")
    @classmethod
    def _cta(cls, v):
        return _link(v)


class Footer(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
    enabled: bool = False
    about: str = Field("", max_length=400)
    show_contact: bool = True
    columns: list[Column] = Field(default_factory=list, max_length=4)
    social: dict[str, str] = Field(default_factory=dict)
    copyright: str = Field("© {year} {name}", max_length=200)

    @field_validator("social", mode="before")
    @classmethod
    def _social(cls, v):
        out = {}
        for k, url in (v if isinstance(v, dict) else {}).items():
            url = str(url or "").strip()
            if k not in NETWORKS or not url:
                continue
            if not re.match(r"^https://[^\s\"'<>]{3,300}$", url):
                raise ValueError(f"{NETWORKS[k]}: use the full https:// address of your profile")
            out[k] = url
        return out


class Chrome(BaseModel):
    model_config = ConfigDict(extra="ignore")
    header: Header = Field(default_factory=Header)
    footer: Footer = Field(default_factory=Footer)


def load(site_id) -> Chrome:
    row = db.one("SELECT value_json FROM site_settings WHERE site_id = ? AND key = ?", site_id, KEY) if site_id else None
    try:
        return Chrome.model_validate(db.j(row["value_json"]) if row else {})
    except ValidationError:
        return Chrome()


def save(site_id, data, user=None) -> Chrome:
    from . import widgets
    try:
        value = Chrome.model_validate(data or {})
    except ValidationError as error:
        raise ChromeError(widgets.friendly(error)) from None
    db.run("INSERT INTO site_settings (site_id, key, value_json, updated_at) VALUES (?, ?, ?, ?) "
           "ON CONFLICT (site_id, key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at",
           site_id, KEY, db.dumps(value.model_dump()), db.now())
    db.run("UPDATE sites SET updated_at = ? WHERE id = ?", db.now(), site_id)
    db.log("Changed header and footer", "", user, site_id)
    return value


def active(c: Chrome) -> bool:
    return c.header.enabled or c.footer.enabled


# ---------------------------------------------------------------------------------------------- drawing

def _a(r, item: NavLink, page_slug="", cls=""):
    href = r.link(item.link or "index")
    current = ' aria-current="page"' if item.link and item.link == page_slug else ""
    ext = ' target="_blank" rel="noopener"' if re.match(r"^https?:", item.link) else ""
    klass = f' class="{cls}"' if cls else ""
    return f'<a{klass} href="{escape(href)}"{current}{ext}>{escape(item.label or item.link)}</a>'


def header_html(c: Chrome, r, page, menu_pages) -> str:
    h, company = c.header, r.profile.get("company", {})
    name = company.get("name") or r.site.get("name") or ""
    logo = r.media(h.logo_media or company.get("logo_media"), 320) if (h.logo_media or company.get("logo_media")) else ""
    brand = (f'<img src="{escape(logo)}" alt="{escape(name) if not h.show_name else ""}" height="44">' if logo else "") + \
            (f"<span>{escape(name)}</span>" if h.show_name or not logo else "")
    slug = page.get("slug", "")
    links = []
    if h.menu == "pages":
        for p in menu_pages:
            current = ' aria-current="page"' if p["slug"] == slug else ""
            links.append(f'<a href="{escape(r.link(p["slug"]))}"{current}>{escape(p["title"])}</a>')
    links += [_a(r, item, slug) for item in h.links if item.label or item.link]
    if h.show_phone and company.get("phone"):
        tel = re.sub(r"[^\d+]", "", company["phone"])
        links.append(f'<a class="menu-call" href="tel:{escape(tel)}">{escape(company["phone"])}</a>')
    if h.cta_text:
        links.append(f'<a class="btn tc-cta" href="{escape(r.link(h.cta_link or "contact"))}">{escape(h.cta_text)}</a>')
    return (f'<header class="top tc-header"><div class="wrap top-in"><a class="brand tc-brand" href="{escape(r.link("index"))}">{brand}</a>'
            '<button class="menu-btn" type="button" aria-expanded="false" aria-controls="menu">Menu</button>'
            f'<nav id="menu" class="menu" aria-label="Main menu">{"".join(links)}</nav></div></header>')


def footer_html(c: Chrome, r) -> str:
    f, company = c.footer, r.profile.get("company", {})
    name = company.get("name") or r.site.get("name") or ""
    cols = [f'<div class="tc-col"><strong class="bottom-name">{escape(name)}</strong>'
            + (f"<p>{escape(f.about)}</p>" if f.about else (f"<p>{escape(company.get('tagline'))}</p>" if company.get("tagline") else "")) + "</div>"]
    if f.show_contact and any(company.get(k) for k in ("phone", "email", "address")):
        bits = []
        if company.get("phone"):
            bits.append(f'<li><a href="tel:{escape(re.sub(r"[^0-9+]", "", company["phone"]))}">{escape(company["phone"])}</a></li>')
        if company.get("email"):
            bits.append(f'<li><a href="mailto:{escape(company["email"])}">{escape(company["email"])}</a></li>')
        if company.get("address"):
            bits.append(f"<li>{escape(company['address'])}</li>")
        cols.append(f'<div class="tc-col"><h2 class="tc-h">Contact</h2><ul>{"".join(bits)}</ul></div>')
    for col in f.columns:
        items = "".join(f"<li>{_a(r, link)}</li>" for link in col.links if link.label or link.link)
        cols.append('<div class="tc-col">' + (f'<h2 class="tc-h">{escape(col.heading)}</h2>' if col.heading else "")
                    + (f"<p>{escape(col.text)}</p>" if col.text else "") + (f"<ul>{items}</ul>" if items else "") + "</div>")
    social = "".join(f'<a href="{escape(url)}" target="_blank" rel="noopener me">{NETWORKS[k]}</a>' for k, url in f.social.items())
    line = escape(f.copyright or "").replace("{year}", str(date.today().year)).replace("{name}", str(escape(name)))
    return (f'<footer class="bottom tc-footer"><div class="wrap bottom-in tc-cols">{"".join(cols)}</div>'
            + (f'<div class="wrap tc-social" aria-label="Social media">{social}</div>' if social else "")
            + f'<p class="wrap made">{line}</p></footer>')


HEADER_RE = re.compile(r'<header class="top"[^>]*>.*?</header>', re.S)
FOOTER_RE = re.compile(r'<footer class="bottom"[^>]*>.*?</footer>', re.S)


def apply(html: str, c: Chrome, r, page, menu_pages) -> str:
    if c.header.enabled:
        new = header_html(c, r, page, menu_pages)
        if HEADER_RE.search(html):
            html = HEADER_RE.sub(lambda m: new, html, count=1)
        else:
            html = re.sub(r"(<body[^>]*>)", lambda m: m.group(1) + new, html, count=1)
    if c.footer.enabled:
        new = footer_html(c, r)
        if FOOTER_RE.search(html):
            html = FOOTER_RE.sub(lambda m: new, html, count=1)
        else:
            i = html.lower().rfind("</body>")
            html = html[:i] + new + html[i:] if i >= 0 else html + new
    return html
