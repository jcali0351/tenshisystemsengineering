"""
templates.py: the Template Gallery.

A template is a folder in cms_data/templates/<id>/:
    template.json        name, group, colours, shape (clean/bold/elegant), fonts, version history
    current/             the files in use: layout.html.j2, page.html.j2, blocks/*.html.j2, style.css, site.js
    versions/<n>/        saved copies of current/ ("Save version"), so any version can be previewed or restored

The first time the CMS runs, the gallery is filled from the 16 designs on the public Portfolio page
(data/templates.json), each a copy of the starter design (platform/designs/starter/) in its own colours.
Templates are presentation only: they never hold business data, so a site can switch template any time.
"""

import json
import re
import shutil
from pathlib import Path

from . import config, db

# Font choices for templates and sites: (label, CSS stack[, self-hosted file, weight range]).
# System fonts load instantly. The self-hosted ones (cms/static/fonts/, SIL Open Font License, Latin subset, woff2,
# about 20-50 KB each) are copied into each deployment that uses them: no request ever goes to Google Fonts.
FONTS = {
    "system": ("Modern (system)", 'system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'),
    "humanist": ("Friendly", '"Segoe UI", "Trebuchet MS", "Gill Sans", Candara, sans-serif'),
    "serif": ("Classic serif", 'Georgia, "Times New Roman", "Yu Mincho", serif'),
    "elegant": ("Elegant serif", '"Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif'),
    "geometric": ("Geometric", 'Avenir, "Century Gothic", Futura, "Segoe UI", sans-serif'),
    "condensed": ("Strong", '"Arial Narrow", "Roboto Condensed", Impact, "Segoe UI", sans-serif'),
    "mono": ("Typewriter", 'ui-monospace, Consolas, "Courier New", monospace'),
    "inter": ("Inter (clean sans)", '"Inter", system-ui, "Segoe UI", Roboto, Arial, sans-serif', "inter.woff2", "400 800"),
    "dm-sans": ("DM Sans (soft geometric)", '"DM Sans", system-ui, "Segoe UI", Arial, sans-serif', "dm-sans.woff2", "400 800"),
    "figtree": ("Figtree (friendly sans)", '"Figtree", system-ui, "Segoe UI", Arial, sans-serif', "figtree.woff2", "400 800"),
    "montserrat": ("Montserrat (bold geometric)", '"Montserrat", "Century Gothic", system-ui, Arial, sans-serif', "montserrat.woff2", "400 800"),
    "nunito": ("Nunito (rounded)", '"Nunito", system-ui, "Segoe UI", Arial, sans-serif', "nunito.woff2", "400 800"),
    "oswald": ("Oswald (condensed)", '"Oswald", "Arial Narrow", Impact, system-ui, sans-serif', "oswald.woff2", "400 700"),
    "fraunces": ("Fraunces (display serif)", '"Fraunces", Georgia, "Times New Roman", serif', "fraunces.woff2", "400 800"),
    "newsreader": ("Newsreader (reading serif)", '"Newsreader", Georgia, "Times New Roman", serif', "newsreader.woff2", "400 700"),
    "bitter": ("Bitter (slab serif)", '"Bitter", Rockwell, Georgia, serif', "bitter.woff2", "400 800"),
    "eb-garamond": ("EB Garamond (classic serif)", '"EB Garamond", Garamond, "Palatino Linotype", Georgia, serif', "eb-garamond.woff2", "400 700"),
}
FONTS_DIR = Path(__file__).resolve().parent / "static" / "fonts"


def font_files(font_keys) -> list[tuple[str, str, str]]:
    """(family, file, weights) for the self-hosted fonts among these font keys."""
    out = []
    for key in dict.fromkeys(font_keys or []):
        f = FONTS.get(key)
        if f and len(f) > 2:
            out.append((f[1].split(",")[0].strip().strip('"'), f[2], f[3]))
    return out


STYLE_FONTS = {"clean": ("system", "system"), "bold": ("condensed", "system"), "elegant": ("elegant", "humanist")}
EDITABLE = (".j2", ".css", ".js", ".json", ".html", ".svg", ".txt")


class TemplateError(ValueError):
    pass


def folder(template_id):
    return config.TEMPLATES_DIR / template_id


def current_dir(template_id):
    return folder(template_id) / "current"


def _slug(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:40] or "template"


def _write_meta(meta):
    (folder(meta["id"]) / "template.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")


def seed():
    """Fill an empty gallery from data/templates.json (run at start-up; does nothing once templates exist)."""
    config.ensure_folders()
    if any(config.TEMPLATES_DIR.iterdir()):
        return
    gallery = json.loads(config.GALLERY_FILE.read_text(encoding="utf-8")) if config.GALLERY_FILE.exists() else {"templates": []}
    designs = gallery.get("templates") or [{"id": "corporate", "name": "Tenshi Corporate", "group": "professional",
                                            "colors": {"primary": "#c8102e", "accent": "#3d4249", "surface": "#ffffff", "ink": "#2b2f35"}, "style": "clean"}]
    for d in designs:
        head, body = STYLE_FONTS.get(d.get("style"), STYLE_FONTS["clean"])
        meta = {"id": d["id"], "name": d["name"], "group": d.get("group", ""), "for": d.get("for", ""),
                "description": ", ".join(d.get("features", [])), "colors": d["colors"], "style": d.get("style", "clean"),
                "fonts": {"heading": head, "body": body}, "sample": d.get("sample", ""), "headline": d.get("headline", ""),
                "version": 1, "versions": [], "created_at": db.now(), "source": "Tenshi Design Gallery"}
        _create_files(meta, config.STARTER_DESIGN)


def seed_premium():
    """Add the premium designs (platform/designs/<id>/ with a design.json: Aurora, Meridian, Maison) to the gallery once each.
    Runs at every start-up, so a server that already has templates gets new designs too; a design already in the
    gallery (or deleted by its id afterwards and re-made) is left alone."""
    config.ensure_folders()
    added = []
    for spec in sorted(config.STARTER_DESIGN.parent.glob("*/design.json")):
        d = json.loads(spec.read_text(encoding="utf-8"))
        if folder(d["id"]).exists():
            continue
        meta = {"id": d["id"], "name": d["name"], "group": d.get("group", "premium"), "for": d.get("for", ""),
                "description": d.get("description", ""), "colors": d["colors"], "style": d.get("style", "clean"),
                "fonts": d.get("fonts") or dict(zip(("heading", "body"), STYLE_FONTS.get(d.get("style"), STYLE_FONTS["clean"]))),
                "sample": d.get("sample", ""), "headline": d.get("headline", ""), "inspired_by": d.get("inspired_by", ""), "premium": True,
                "version": 1, "versions": [], "created_at": db.now(), "source": "Tenshi premium design"}
        _create_files(meta, spec.parent, skip=("design.json",))
        added.append(d["id"])
    return added


def _create_files(meta, source_dir, skip=()):
    target = folder(meta["id"])
    if target.exists():
        raise TemplateError(f"A template called {meta['id']} already exists.")
    shutil.copytree(source_dir, target / "current", ignore=shutil.ignore_patterns(*skip) if skip else None)
    (target / "versions").mkdir()
    _write_meta(meta)
    save_version(meta["id"], "First version")


def all_templates():
    """Every template's details, sorted by group then name."""
    items = []
    for f in sorted(config.TEMPLATES_DIR.glob("*/template.json")):
        meta = json.loads(f.read_text(encoding="utf-8"))
        meta["used_by"] = db.one("SELECT COUNT(*) AS n FROM sites WHERE template_id = ?", meta["id"])["n"]
        items.append(meta)
    return sorted(items, key=lambda m: (not m.get("premium"), m.get("group", ""), m["name"]))    # premium designs first


def get(template_id):
    file = folder(template_id) / "template.json"
    if not file.exists():
        raise TemplateError("That template doesn't exist.")
    return json.loads(file.read_text(encoding="utf-8"))


def update_meta(template_id, **changes):
    meta = get(template_id)
    meta.update({k: v for k, v in changes.items() if v is not None})
    _write_meta(meta)
    return meta


def create(name, base_id=None, **meta_changes):
    """A new template: a copy of another template (or of the starter design)."""
    new_id = _slug(name)
    n = 2
    while folder(new_id).exists():
        new_id, n = f"{_slug(name)}-{n}", n + 1
    if base_id:
        base = get(base_id)
        source = current_dir(base_id)
        meta = {**{k: v for k, v in base.items() if k not in ("versions", "used_by")}, "source": f"Cloned from {base['name']}"}
    else:
        source = config.STARTER_DESIGN
        meta = {"group": "", "for": "", "description": "", "style": "clean", "fonts": {"heading": "system", "body": "system"},
                "colors": {"primary": "#c8102e", "accent": "#3d4249", "surface": "#ffffff", "ink": "#222222"}, "source": "New from the starter design"}
    meta.update({"id": new_id, "name": name, "version": 1, "versions": [], "created_at": db.now()}, **meta_changes)
    _create_files(meta, source)
    return get(new_id)


def delete(template_id):
    used = db.one("SELECT COUNT(*) AS n FROM sites WHERE template_id = ?", template_id)["n"]
    if used:
        raise TemplateError(f"{used} site(s) use this template. Switch them to another template first.")
    shutil.rmtree(folder(template_id))


def save_version(template_id, note=""):
    """Copy current/ to versions/<n>/ and note it in the history."""
    meta = get(template_id)
    n = max([v["n"] for v in meta.get("versions", [])] or [0]) + 1
    shutil.copytree(current_dir(template_id), folder(template_id) / "versions" / str(n))
    meta.setdefault("versions", []).append({"n": n, "note": note or f"Version {n}", "date": db.now()})
    meta["version"] = n
    _write_meta(meta)
    return n


def restore_version(template_id, n):
    """Put an old version back as current (current is saved as a new version first, so nothing is lost)."""
    source = folder(template_id) / "versions" / str(int(n))
    if not source.exists():
        raise TemplateError("That version doesn't exist.")
    save_version(template_id, f"Before restoring version {n}")
    current = current_dir(template_id)
    # Copy the old files over the current ones, then remove files the old version didn't have.
    # (Deleting whole folders first can fail on Windows while something still has them open.)
    shutil.copytree(source, current, dirs_exist_ok=True)
    keep = {p.relative_to(source) for p in source.rglob("*") if p.is_file()}
    for p in list(current.rglob("*")):
        if p.is_file() and p.relative_to(current) not in keep:
            p.unlink()


def files(template_id):
    """The editable files of a template, e.g. ["blocks/hero.html.j2", "layout.html.j2", "style.css", …]."""
    base = current_dir(template_id)
    return sorted(str(p.relative_to(base)).replace("\\", "/") for p in base.rglob("*") if p.is_file() and p.suffix in EDITABLE)


def _safe_path(template_id, rel):
    base = current_dir(template_id).resolve()
    path = (base / rel).resolve()
    if base not in path.parents or path.suffix not in EDITABLE:
        raise TemplateError("That file can't be edited here.")
    return path


def read_file(template_id, rel):
    return _safe_path(template_id, rel).read_text(encoding="utf-8")


def write_file(template_id, rel, text):
    """Save a template file. Jinja templates are checked first, so a typo can't break every site using it."""
    path = _safe_path(template_id, rel)
    if path.suffix == ".j2":
        from jinja2 import Environment, TemplateSyntaxError
        try:
            Environment().parse(text)
        except TemplateSyntaxError as error:
            raise TemplateError(f"Not saved: line {error.lineno}: {error.message}")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def theme_for(template_id, site_theme=None):
    """The colours, fonts and shape a site uses: the template's, with the site's own choices on top."""
    meta = get(template_id)
    site_theme = site_theme or {}
    colors = {**meta.get("colors", {}), **{k: v for k, v in (site_theme.get("colors") or {}).items() if v}}
    font_keys = {**meta.get("fonts", {}), **{k: v for k, v in (site_theme.get("fonts") or {}).items() if v}}
    return {
        "colors": colors,
        "style": site_theme.get("style") or meta.get("style", "clean"),
        "fonts": {k: FONTS.get(v, FONTS["system"])[1] for k, v in {"heading": font_keys.get("heading", "system"),
                                                                    "body": font_keys.get("body", "system")}.items()},
        "font_keys": font_keys,
        "lang": site_theme.get("lang", "en"),
        "radius": site_theme.get("radius") if isinstance(site_theme.get("radius"), int) else None,
        "space": site_theme.get("space") or "",
        "mode": site_theme.get("mode") or "light",
        "toggle": bool(site_theme.get("toggle")),
        "dark_colors": site_theme.get("dark_colors") or {},
    }


def size_bytes(template_id):
    return sum(p.stat().st_size for p in folder(template_id).rglob("*") if p.is_file())


def sample_profile(meta):
    """Made-up business data for previewing a template with nothing real in it yet."""
    name = meta.get("sample") or "Sample Business"
    return {
        "company": {"name": name, "tagline": meta.get("headline") or "Your headline here",
                    "description": "This is a preview with made-up details. Your own words and photos replace them.",
                    "phone": "+81 6 0000 0000", "email": "hello@example.com", "address": "1-2-3 Example Street, Osaka",
                    "service_areas": ["Osaka", "Kobe", "Kyoto"], "hours": [{"days": "Mon–Fri", "time": "9:00–18:00"}]},
        "services": [{"name": "First service", "description": "What it includes, in a sentence or two.", "price": "From ¥10,000"},
                     {"name": "Second service", "description": "Another thing customers come to you for.", "price": ""},
                     {"name": "Third service", "description": "One more, so the layout looks complete.", "price": "Ask us"}],
        "staff": [{"name": "Aiko Tanaka", "role": "Founder", "bio": "Started the business in 2010."},
                  {"name": "Ken Sato", "role": "Lead", "bio": "Ten years in the trade."}],
        "testimonials": [{"quote": "Friendly, fast and fairly priced. We'd use them again.", "author": "A happy customer", "rating": 5},
                         {"quote": "They explained everything clearly and finished on time.", "author": "Another customer", "rating": 5}],
        "locations": [], "social": {}, "seo": {},
    }
