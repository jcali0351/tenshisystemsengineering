"""
widgets/: the widget registry. A widget is a page-builder block with its own code, rather than a Jinja file in each template.

Why a registry (and not just blocks/<type>.html.j2 in the template)? Templates are copied into cms_data/ when the
gallery is seeded and can be edited per template, so a new block type would never reach existing templates. A widget
draws itself in Python and brings its own files, so it works with every template, old and new.

Each widget has:
    name, label, about     what the builder's "Add block" list shows (name is also the block's "type")
    config                 a Pydantic model: the block's settings. It is the single source for the builder's settings
                           form (fields()), for what a new block starts with (defaults()) and for checking what the
                           builder saves (clean_config()). Unknown keys are dropped, bad values are refused.
    render(block, ctx)     server-side HTML (Markup) for one block. ctx is a WidgetContext (mode, editing, the site,
                           its saved widget settings, and asset(name) for the address of one of the widget's files).
    assets                 the widget's own CSS and JS (in cms/static/widgets/<name>/). They are linked into a page
                           only when the widget is on that page, and copied into a deployment only when it's used.
    files                  extra files (pictures, sample data) copied into deployments that use the widget.
    csp                    extra Content-Security-Policy sources the widget needs ({"connect-src": [...], ...}),
                           added only to pages that contain it (see csp_for()).
    block_csp(config)      optional: sources that depend on one block's settings (e.g. the booking widget's embed
                           host), added only to the page that has that block.
    settings               optional Pydantic model for per-site settings (e.g. the store's Shopify connection), kept
                           in the site_settings table (db.py), never in git. Edited on /sites/<id>/widgets/<name>.
    settings_admin_only    only admins and the site's owners (members.py) may change the settings; False = any editor.
    hint                   a line under the block's settings in the builder (e.g. where to connect the store).

To add a widget: write cms/widgets/<name>.py with a Widget(...) and register(...) it, put its files in
cms/static/widgets/<name>/, and import the module at the bottom of this file. The builder, the renderer, deployments
and the CSP pick it up from here.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Literal, get_args, get_origin

from markupsafe import Markup
from pydantic import BaseModel, ValidationError

from .. import db

STATIC_DIR = Path(__file__).resolve().parent.parent / "static" / "widgets"
MANIFEST = ".tenshi-widgets.json"          # in each deployment: which widgets each page uses (for the CSP); never served

# The policy every hosted client page gets. Pictures may come from any https address (Custom HTML blocks may link
# them), but scripts, connections, frames and form posts stay on the site unless a widget on the page adds a source.
BASE_CSP = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'"],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "font-src": ["'self'", "data:"],
    "media-src": ["'self'", "blob:"],
    "connect-src": ["'self'"],
    "frame-src": ["'self'", "https://www.youtube-nocookie.com", "https://www.youtube.com", "https://player.vimeo.com",
                  "https://www.google.com", "https://www.openstreetmap.org"],
    "form-action": ["'self'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
    "frame-ancestors": ["'self'"],
}


def model_fields(model: type[BaseModel]) -> list[dict]:
    """A Pydantic model as builder fields. list[SubModel] becomes an "items" field: a list of small forms the builder
    lets people add, remove and reorder (FAQ questions, pricing tiers), with the sub-model's own fields."""
    out = []
    for name, f in model.model_fields.items():
        extra = dict(f.json_schema_extra or {})
        spec = {"name": name, "label": extra.pop("label", f.title or name.replace("_", " ").capitalize())}
        ann = f.annotation
        args = get_args(ann)
        if extra.get("type"):
            spec["type"] = extra.pop("type")
        elif get_origin(ann) is list and args and isinstance(args[0], type) and issubclass(args[0], BaseModel):
            spec.update(type="items", fields=model_fields(args[0]), item=args[0]().model_dump(),
                        max=next((m.max_length for m in f.metadata if hasattr(m, "max_length")), 50))
        elif get_origin(ann) is Literal:
            spec["type"] = "select"
        elif ann is bool:
            spec["type"] = "checkbox"
        elif ann is int:
            spec["type"] = "number"
        else:
            spec["type"] = "text"
        if spec["type"] == "select" and "options" not in extra and get_origin(ann) is Literal:
            spec["options"] = [[v, str(v)] for v in get_args(ann)]
        spec.update(extra)
        out.append(spec)
    return out


LINK_RE = re.compile(r"^(?:[a-z0-9][a-z0-9-]{0,80}|https?://[^\s\"'<>]{1,500}|mailto:[^\s\"'<>]{1,200}|tel:[0-9+() .-]{3,30}|#[A-Za-z0-9_-]{0,80})$")


def clean_link(value: str) -> str:
    """A page (its address, like contact), an https:// or http:// address, mailto:, tel: or #anchor. Nothing else."""
    value = (value or "").strip()
    if value and not LINK_RE.fullmatch(value):
        raise ValueError("a link is one of your pages, or an address starting with https://, mailto: or tel:")
    return value


def paragraphs(text: str) -> Markup:
    """Plain text as HTML: blank lines make paragraphs, single line breaks stay. Everything is escaped."""
    from markupsafe import escape
    parts = [p.strip() for p in re.split(r"\n\s*\n", str(text or "").replace("\r", "")) if p.strip()]
    return Markup("".join(f"<p>{Markup('<br>').join(escape(line) for line in part.splitlines())}</p>" for part in parts))


def block_uid(block: dict) -> str:
    return re.sub(r"[^a-z0-9]", "", str((block or {}).get("id") or "x").lower())[:16] or "x"


class WidgetError(ValueError):
    """A setting a person typed is not acceptable. The message is shown to them as it is."""


@dataclass
class WidgetContext:
    site: dict
    mode: str                      # preview | hosted | export (see render.py)
    editing: bool
    settings: BaseModel | None     # the site's saved settings for this widget (validated), or None
    asset: Callable[[str], str]    # asset("store.js") -> the address of a widget file for this mode
    link: Callable[[str], str] = lambda slug: slug   # link("contact") -> the address of a page (or a URL as it is)
    profile: dict = field(default_factory=dict)      # the site's business data (company.address, …)


@dataclass
class Widget:
    name: str
    label: str
    about: str
    config: type[BaseModel]
    render: Callable[[dict, WidgetContext], Markup]
    assets: list[str] = field(default_factory=list)
    files: list[str] = field(default_factory=list)
    csp: dict[str, list[str]] = field(default_factory=dict)
    settings: type[BaseModel] | None = None
    settings_admin_only: bool = True
    hint: str = ""
    block_csp: Callable[[BaseModel], dict[str, list[str]]] | None = None

    # --- the builder ----------------------------------------------------------------------------------------------
    def defaults(self) -> dict:
        return self.config().model_dump()

    def fields(self) -> list[dict]:
        """The builder's settings form, from the config model. A field's json_schema_extra may give label/type/options."""
        return model_fields(self.config)

    def block_type(self) -> dict:
        """This widget in the shape blocks.BLOCKS uses, so the builder lists and edits it like any block."""
        return {"label": self.label, "about": self.about, "fields": self.fields(), "data": self.defaults(),
                "widget": True, "hint": self.hint}

    # --- saving -----------------------------------------------------------------------------------------------------
    def clean_config(self, data: dict | None) -> dict:
        """What the builder sent, checked against the config model. Empty boxes fall back to the default."""
        data = {k: v for k, v in (data or {}).items() if k in self.config.model_fields and not (v == "" and self.config.model_fields[k].annotation is not str)}
        try:
            return self.config.model_validate(data).model_dump()
        except ValidationError as error:
            raise WidgetError(f"{self.label}: {friendly(error)}") from None

    def config_for(self, data: dict | None) -> BaseModel:
        """For drawing: the block's settings, falling back to defaults for anything that no longer validates."""
        try:
            return self.config.model_validate(self.clean_config(data))
        except WidgetError:
            return self.config()


REGISTRY: dict[str, Widget] = {}


def register(widget: Widget) -> Widget:
    if not re.fullmatch(r"[a-z][a-z0-9_]{1,30}", widget.name):
        raise ValueError(f"Bad widget name: {widget.name}")
    REGISTRY[widget.name] = widget
    return widget


def get(name: str) -> Widget | None:
    return REGISTRY.get(name)


def block_types() -> dict:
    return {name: w.block_type() for name, w in REGISTRY.items()}


def friendly(error: ValidationError) -> str:
    """The first problem in a Pydantic error, in words a person can act on."""
    first = error.errors()[0]
    where = ".".join(str(p) for p in first.get("loc", ()) if p != "__root__")
    msg = str(first.get("msg", "Invalid value"))
    msg = re.sub(r"^(Value|Assertion) error, ", "", msg)
    return f"{where.replace('_', ' ')}: {msg}" if where else msg


# ---------------------------------------------------------------------------------------------- per-site settings

def load_settings(site_id, name: str) -> BaseModel | None:
    """A site's saved settings for one widget (validated), or the defaults. None when the widget has no settings."""
    widget = get(name)
    if not widget or not widget.settings:
        return None
    row = db.one("SELECT value_json FROM site_settings WHERE site_id = ? AND key = ?", site_id, f"widget:{name}") if site_id else None
    try:
        return widget.settings.model_validate(db.j(row["value_json"]) if row else {})
    except ValidationError:
        return widget.settings()


def save_settings(site_id: int, name: str, data: dict, user: dict | None = None) -> BaseModel:
    widget = get(name)
    if not widget or not widget.settings:
        raise WidgetError("This widget has no settings.")
    if not can_edit_settings(user, name, site_id):
        raise PermissionError("Only admins and the site's owners can change this.")
    try:
        value = widget.settings.model_validate(data or {})
    except ValidationError as error:
        raise WidgetError(friendly(error)) from None
    db.run("INSERT INTO site_settings (site_id, key, value_json, updated_at) VALUES (?, ?, ?, ?) "
           "ON CONFLICT (site_id, key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at",
           site_id, f"widget:{name}", db.dumps(value.model_dump()), db.now())
    db.log("Changed widget settings", widget.label, user, site_id)
    return value


def can_edit_settings(user: dict | None, name: str, site_id: int | None = None) -> bool:
    """Admins always; the site's owners when site_id is given; any signed-in user if the widget allows editors."""
    from .. import members
    widget = get(name)
    if not (user and widget):
        return False
    return not widget.settings_admin_only or members.can_manage(user, site_id)


# ---------------------------------------------------------------------------------------------- pages

def used_in(blocks: list) -> list[str]:
    """The widgets on a page, in the order they first appear."""
    seen = []
    for b in blocks or []:
        t = (b or {}).get("type")
        if t in REGISTRY and t not in seen:
            seen.append(t)
    return seen


def asset_url(name: str, file: str, mode: str) -> str:
    """Preview: served by the CMS. Hosted and export: copied next to the pages (relative, so /s/<address>/ works too)."""
    return f"/static/widgets/{name}/{file}" if mode == "preview" else f"widgets/{name}/{file}"


def inject_assets(html: str, names: list[str], mode: str) -> str:
    """Link each used widget's CSS (end of <head>) and JS (end of <body>, deferred)."""
    if not names:
        return html
    css = "".join(f'<link rel="stylesheet" href="{asset_url(n, a, mode)}" data-widget="{n}">'
                  for n in names for a in REGISTRY[n].assets if a.endswith(".css"))
    js = "".join(f'<script src="{asset_url(n, a, mode)}" defer data-widget="{n}"></script>'
                 for n in names for a in REGISTRY[n].assets if a.endswith(".js"))
    html = html.replace("</head>", css + "</head>", 1) if "</head>" in html else css + html
    return html.replace("</body>", js + "</body>", 1) if "</body>" in html else html + js


def copy_files(names, out_dir: Path) -> None:
    """Copy the files of the widgets a deployment uses into <out>/widgets/<name>/."""
    import shutil
    for n in names:
        w = REGISTRY.get(n)
        if not w:
            continue
        for rel in w.assets + w.files:
            src = STATIC_DIR / n / rel
            if src.is_file():
                target = Path(out_dir) / "widgets" / n / rel
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src, target)


def block_sources(blocks: list) -> dict[str, list[str]]:
    """Sources that depend on the settings of the widget blocks on a page (Widget.block_csp)."""
    out: dict[str, list[str]] = {}
    for b in blocks or []:
        w = REGISTRY.get((b or {}).get("type"))
        if w and w.block_csp:
            for directive, sources in (w.block_csp(w.config_for(b.get("data"))) or {}).items():
                have = out.setdefault(directive, [])
                have.extend(s for s in sources if s not in have)
    return out


def write_manifest(out_dir: Path, pages: dict[str, list[str]], sources: dict[str, dict] | None = None) -> None:
    """pages: {"index.html": ["store"], ...}; sources: {"book.html": {"frame-src": [...]}}. Read by csp_for_file()."""
    (Path(out_dir) / MANIFEST).write_text(json.dumps({"pages": pages, "sources": sources or {}}), encoding="utf-8")


def _merge(policy: dict, extra: dict | None) -> None:
    for directive, sources in (extra or {}).items():
        have = policy.setdefault(directive, [])
        have.extend(s for s in sources if s not in have)


def csp_for(names, extra: dict | None = None, block_sources: dict | None = None) -> str:
    """The Content-Security-Policy for a page: the base policy, each widget's sources, the sources of its blocks'
    settings, and the site's own extra allowed hosts (security.py)."""
    policy = {k: list(v) for k, v in BASE_CSP.items()}
    for n in names or []:
        w = REGISTRY.get(n)
        _merge(policy, w.csp if w else {})
    _merge(policy, block_sources)
    _merge(policy, extra)
    return "; ".join(f"{k} {' '.join(v)}" for k, v in policy.items())


def csp_for_file(folder: Path, rel: str, extra: dict | None = None) -> str:
    """The CSP for one page of a deployment, from its manifest (no manifest: the base policy)."""
    try:
        data = json.loads((Path(folder) / MANIFEST).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        data = {}
    return csp_for(data.get("pages", {}).get(rel, []), extra=extra, block_sources=data.get("sources", {}).get(rel))


def block_template_source(name: str) -> str | None:
    """Jinja loader hook (render.py): blocks/<widget>.html.j2 for every template, drawn by the widget's render()."""
    match = re.fullmatch(r"blocks/([a-z][a-z0-9_]*)\.html\.j2", name)
    if match and match.group(1) in REGISTRY:
        return "{{ widget(block) }}"
    return None


# The widgets. Import order is the order in the builder's "Add block" list (after the built-in blocks).
from . import booking, faq, map, pricing, store  # noqa: E402,F401
