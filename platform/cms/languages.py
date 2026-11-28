"""
languages.py: one site in several languages (like Joomla's multilingual sites or WordPress with Polylang).

The site's main language is its theme language (Settings & theme). Extra languages are switched on per site
(site_settings "languages": {"extra": ["es", "fr"]}). Any page can then get a translation: a copy of the page
(pages.lang = "es", pages.translation_of = the main page's id) at the address es-<page>.html (the home page: es.html),
edited in the builder like any page. On the published site:
  * each page's menu lists the pages in its own language,
  * a small language switcher links to the same page in the other languages (when it has been translated),
  * <html lang> is the page's language, with hreflang links for search engines.
"""

from __future__ import annotations

import re

from markupsafe import escape

from . import db

NAMES = {"en": "English", "es": "Español", "fr": "Français", "de": "Deutsch", "it": "Italiano", "pt": "Português",
         "nl": "Nederlands", "pl": "Polski", "sv": "Svenska", "no": "Norsk", "da": "Dansk", "fi": "Suomi", "cs": "Čeština",
         "ro": "Română", "hu": "Magyar", "el": "Ελληνικά", "tr": "Türkçe", "ru": "Русский", "uk": "Українська",
         "ar": "العربية", "he": "עברית", "fa": "فارسی", "hi": "हिन्दी", "bn": "বাংলা", "ur": "اردو", "zh": "中文",
         "ja": "日本語", "ko": "한국어", "vi": "Tiếng Việt", "th": "ไทย", "id": "Bahasa Indonesia", "ms": "Bahasa Melayu",
         "tl": "Tagalog", "sw": "Kiswahili", "so": "Soomaali", "hmn": "Hmoob", "pcm": "Naijá", "ht": "Kreyòl ayisyen"}
RTL = {"ar", "he", "fa", "ur"}
KEY = "languages"


class LanguageError(ValueError):
    pass


def main(site) -> str:
    lang = str((db.j(site.get("theme_json")) or {}).get("lang") or "en").lower()
    return lang if lang in NAMES else "en"


def extra(site_id) -> list[str]:
    if not site_id:
        return []
    row = db.one("SELECT value_json FROM site_settings WHERE site_id = ? AND key = ?", site_id, KEY)
    return [c for c in (db.j(row["value_json"]).get("extra", []) if row else []) if c in NAMES]


def save_extra(site, codes, user=None) -> list[str]:
    m = main(site)
    clean = []
    for c in codes or []:
        c = str(c).strip().lower()
        if c not in NAMES:
            raise LanguageError(f"Unknown language: {c}")
        if c != m and c not in clean:
            clean.append(c)
    if len(clean) > 8:
        raise LanguageError("Up to 8 extra languages.")
    db.run("INSERT INTO site_settings (site_id, key, value_json, updated_at) VALUES (?, ?, ?, ?) "
           "ON CONFLICT (site_id, key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at",
           site["id"], KEY, db.dumps({"extra": clean}), db.now())
    db.log("Changed the site's languages", ", ".join(clean) or "main language only", user, site["id"])
    return clean


def active(site) -> bool:
    return bool(site.get("id") and extra(site["id"]))


def lang_of(page, site) -> str:
    return (page or {}).get("lang") or main(site)


def translation_slug(code, slug) -> str:
    return code if slug == "index" else f"{code}-{slug}"


def translate(page_id, code, user=None) -> dict:
    """Make the page's translation into `code` (a copy to edit), or return the existing one."""
    page = db.one("SELECT * FROM pages WHERE id = ?", page_id)
    if not page:
        raise LanguageError("That page isn't there any more.")
    site = db.one("SELECT * FROM sites WHERE id = ?", page["site_id"])
    if code not in extra(site["id"]):
        raise LanguageError("Switch that language on first (Languages in the sidebar).")
    source = db.one("SELECT * FROM pages WHERE id = ?", page["translation_of"]) if page.get("translation_of") else page
    have = db.one("SELECT * FROM pages WHERE site_id = ? AND translation_of = ? AND lang = ?", site["id"], source["id"], code)
    if have:
        return have
    slug, n = translation_slug(code, source["slug"]), 2
    base = slug
    while db.one("SELECT 1 AS x FROM pages WHERE site_id = ? AND slug = ?", site["id"], slug):
        slug, n = f"{base}-{n}", n + 1
    pos = (db.one("SELECT MAX(position) AS m FROM pages WHERE site_id = ?", site["id"])["m"] or 0) + 1
    new_id = db.run("INSERT INTO pages (site_id, slug, title, position, in_menu, seo_title, seo_description, blocks_json, updated_at, lang, translation_of) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", site["id"], slug, source["title"], pos, source["in_menu"], source["seo_title"],
                    source["seo_description"], source["blocks_json"], db.now(), code, source["id"])
    db.log("Translated a page", f"{source['title']} → {NAMES[code]}", user, site["id"])
    return db.one("SELECT * FROM pages WHERE id = ?", new_id)


def versions(page, pages, site) -> list[dict]:
    """The same page in every language it exists in: [{lang, name, slug, current}] (main language first)."""
    root_id = page.get("translation_of") or page.get("id")
    if not root_id:
        return []
    group = [p for p in pages if p.get("id") == root_id or p.get("translation_of") == root_id]
    m = main(site)
    out = sorted(({"lang": lang_of(p, site), "name": NAMES.get(lang_of(p, site), lang_of(p, site)), "slug": p["slug"],
                   "current": p.get("id") == page.get("id")} for p in group), key=lambda v: (v["lang"] != m, v["lang"]))
    return out


def menu_for(page, menu_pages, site) -> list:
    lang = (page or {}).get("lang") or ""
    return [p for p in menu_pages if (p.get("lang") or "") == lang]


STYLE = ("<style id=\"tw-langs-css\">.tw-langs{display:flex;gap:4px;flex-wrap:wrap;align-items:center;font:600 .8rem/1 system-ui,sans-serif;"
         "margin:0 0 0 auto;padding:4px}.tw-langs a{padding:5px 9px;border-radius:999px;text-decoration:none;color:inherit;"
         "border:1px solid transparent;opacity:.8}.tw-langs a[aria-current]{opacity:1;border-color:currentColor;font-weight:800}"
         ".tw-langs-float{position:fixed;top:10px;right:10px;z-index:60;"
         "background:rgba(255,255,255,.92);color:#111;border-radius:999px;box-shadow:0 2px 10px rgba(0,0,0,.15)}</style>")


def apply(html: str, page, pages, site, link, base_url: str = "") -> str:
    """Set <html lang>, add hreflang links and the switcher to one drawn page."""
    lang = lang_of(page, site)
    html = re.sub(r"<html\b([^>]*?)\blang=\"[^\"]*\"", lambda m: f'<html{m.group(1)}lang="{lang}"', html, count=1)
    if lang in RTL and ' dir="' not in html[:400]:
        html = html.replace("<html", '<html dir="rtl"', 1)
    vs = versions(page, pages, site)
    if len(vs) < 2:
        return html
    if base_url:
        alts = "".join(f'<link rel="alternate" hreflang="{v["lang"]}" href="{escape(base_url + ("" if v["slug"] == "index" else v["slug"] + ".html"))}">' for v in vs)
        html = html.replace("</head>", alts + "\n</head>", 1)
    links = "".join(f'<a href="{escape(link(v["slug"]))}" hreflang="{v["lang"]}" lang="{v["lang"]}"' + (' aria-current="true"' if v["current"] else "")
                    + f'><span>{escape(v["name"])}</span></a>' for v in vs)
    m = re.search(r"<header\b[^>]*>.*?</header>", html, re.S)
    if m:
        bar = f'<nav class="tw-langs" aria-label="Language">{links}</nav>'
        end = m.end() - len("</header>")
        html = html[:end] + bar + html[end:]
    else:
        bar = f'<nav class="tw-langs tw-langs-float" aria-label="Language">{links}</nav>'
        html = re.sub(r"(<body\b[^>]*>)", lambda mm: mm.group(1) + bar, html, count=1)
    return html.replace("</head>", STYLE + "\n</head>", 1)
