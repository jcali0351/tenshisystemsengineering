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

import inspect
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
    "frame-src": ["'self'"],
    # Video (YouTube, Vimeo) and map (Google Maps, OpenStreetMap) frames are added only to pages that have one: an
    # iframe in the page itself (render.py: frame_sources) or a block that opens one (block_csp, e.g. the video gallery).
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
    media: Callable = lambda media_id, size=None: ""  # media(id, 800) -> the address of a picture (copied into deployments)
    media_alt: Callable = lambda media_id: ""


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
    hidden: bool = False           # not in the builder's list (e.g. "post": the CMS puts it on post pages itself)
    presets: dict = field(default_factory=dict)   # {field: {value: settings}}: choosing that value in the builder fills them in
    # Modules (cms/actions.py, render.py): public endpoints <site>/__w/<name>/<action>; pages and files a deployment
    # gets because of this widget (event pages, calendar files): extra_pages(renderer, pages) -> [page dicts],
    # extra_files(renderer, pages) -> {file name: text}.
    actions: dict = field(default_factory=dict)
    extra_pages: Callable | None = None
    extra_files: Callable | None = None
    connected: Callable | None = None      # connected(settings) -> bool: the Modules page's "Connected" badge
    requires: list = field(default_factory=list)   # other (hidden) widgets whose files this one uses, e.g. ["lightbox"]
    settings_page: bool = False            # a hidden widget that is only settings (e.g. autopost): still listed on Modules

    # --- the builder ----------------------------------------------------------------------------------------------
    def defaults(self) -> dict:
        return self.config().model_dump()

    def fields(self) -> list[dict]:
        """The builder's settings form, from the config model. A field's json_schema_extra may give label/type/options."""
        return model_fields(self.config)

    def block_type(self) -> dict:
        """This widget in the shape blocks.BLOCKS uses, so the builder lists and edits it like any block."""
        return {"label": self.label, "about": self.about, "fields": self.fields(), "data": self.defaults(),
                "widget": True, "hint": self.hint, **({"presets": self.presets} if self.presets else {})}

    # --- saving -----------------------------------------------------------------------------------------------------
    def clean_config(self, data: dict | None) -> dict:
        """What the builder sent, checked against the config model. Empty boxes fall back to the default."""
        data = {k: v for k, v in (data or {}).items() if k in self.config.model_fields and not (v == "" and self.config.model_fields[k].annotation is not str)}
        try:
            return self.config.model_validate(data).model_dump()
        except ValidationError as error:
            raise WidgetError(f"{self.label}: {friendly(error)}") from None

    def clean_config_safe(self, data: dict | None) -> dict:
        try:
            return self.clean_config(data)
        except WidgetError:
            return self.defaults()

    def config_for(self, data: dict | None) -> BaseModel:
        """For drawing: the block's settings, falling back to defaults for anything that no longer validates."""
        try:
            return self.config.model_validate(self.clean_config(data))
        except WidgetError:
            return self.config()


REGISTRY: dict[str, Widget] = {}
# Inboxes on the Modules page: {"label", "about", "path" (under /sites/<id>/), "count": count_new(site_id)}
INBOX: list[dict] = []


ON_PUBLISH: list[Callable] = []           # fn(site, user) after a successful deployment (sites.deploy); must not raise


def after_publish(site: dict, user=None) -> None:
    import logging
    for fn in ON_PUBLISH:
        try:
            fn(site, user)
        except Exception:  # noqa: BLE001 - a module's hook never breaks a deployment
            logging.getLogger("tenshi.widgets").exception("after_publish hook %s failed", getattr(fn, "__name__", fn))


def register(widget: Widget) -> Widget:
    if not re.fullmatch(r"[a-z][a-z0-9_]{1,30}", widget.name):
        raise ValueError(f"Bad widget name: {widget.name}")
    REGISTRY[widget.name] = widget
    return widget


def get(name: str) -> Widget | None:
    return REGISTRY.get(name)


def block_types() -> dict:
    return {name: w.block_type() for name, w in REGISTRY.items() if not w.hidden}


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


MASK = "••••••"


def secret_fields(model: type[BaseModel] | None) -> list[str]:
    """Settings fields marked {"secret": True} (API keys): never sent back to the browser in full."""
    return [n for n, f in (model.model_fields.items() if model else []) if (f.json_schema_extra or {}).get("secret")]


def public_settings(name: str, value: BaseModel | None) -> dict:
    """Settings for the browser: secrets as a mask plus their last 4 characters ("" when not set)."""
    data = value.model_dump() if value is not None else {}
    w = get(name)
    for k in secret_fields(w.settings if w else None):
        v = str(data.get(k) or "")
        data[k] = (MASK + v[-4:]) if v else ""
    return data


def save_settings(site_id: int, name: str, data: dict, user: dict | None = None) -> BaseModel:
    widget = get(name)
    if not widget or not widget.settings:
        raise WidgetError("This widget has no settings.")
    if not can_edit_settings(user, name, site_id):
        raise PermissionError("Only admins and the site's owners can change this.")
    old = load_settings(site_id, name)
    data = dict(data or {})
    for k in secret_fields(widget.settings):          # an untouched (masked) key keeps the saved one
        if str(data.get(k, MASK)).startswith(MASK):
            data[k] = getattr(old, k, "") if old is not None else ""
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
    for t in list(seen):                    # shared files (the lightbox …) come first, so they're loaded before their users
        for r in REGISTRY[t].requires:
            if r in REGISTRY and r not in seen:
                seen.insert(0, r)
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


HTML_MAP_RE = re.compile(r"<iframe[^>]+src=[\"']https://www\.google\.com/maps", re.I)


FRAME_RE = re.compile(r"<iframe\b[^>]*?\ssrc=[\"'](https://(?:www\.youtube-nocookie\.com|www\.youtube\.com|player\.vimeo\.com|www\.google\.com|www\.openstreetmap\.org))[/\"'?]", re.I)


def frame_sources(html: str) -> dict[str, list[str]]:
    """The video and map hosts of the iframes actually on a page (Custom HTML, text, posts, the Video block …)."""
    hosts = sorted({m.group(1).lower() for m in FRAME_RE.finditer(html or "")})
    return {"frame-src": hosts} if hosts else {}


def block_sources(blocks: list, site_id=None) -> dict[str, list[str]]:
    """Sources that depend on the blocks on a page: each widget's block_csp(config, site settings), and Google for
    a Google Maps iframe pasted into a Custom HTML block."""
    out: dict[str, list[str]] = {}

    def add(found):
        for directive, sources in (found or {}).items():
            have = out.setdefault(directive, [])
            have.extend(s for s in sources if s not in have)

    for b in blocks or []:
        b = b or {}
        w = REGISTRY.get(b.get("type"))
        if w and w.block_csp:
            cfg = w.config_for(b.get("data"))
            try:
                params = len(inspect.signature(w.block_csp).parameters)
            except (TypeError, ValueError):
                params = 1
            add(w.block_csp(cfg, load_settings(site_id, w.name) if w.settings else None) if params > 1 else w.block_csp(cfg))
        elif b.get("type") == "html" and HTML_MAP_RE.search(str((b.get("data") or {}).get("html") or "")):
            add({"frame-src": ["https://www.google.com"]})
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
from . import blog, booking, contact_form, faq, map, pricing, store  # noqa: E402,F401
from . import modkit, lightbox, gallery, video_gallery, before_after  # noqa: E402,F401  (modules: galleries)
from . import events, hours, appointments  # noqa: E402,F401  (modules: calendars and booking)
from . import testimonials, review_form, trust_badges, case_studies  # noqa: E402,F401  (modules: testimonials and trust)
from . import social_feed, share_buttons, link_in_bio, autopost  # noqa: E402,F401  (modules: social)
from . import popup, newsletter, news, price_list, team, jobs, locations  # noqa: E402,F401  (modules: extras)

# The global header and footer (cms/chrome.py) bring their CSS like a widget, so it's linked and deployed the same way.
register(Widget(name="chrome", label="Header and footer", about="The site's own header and footer.", config=BaseModel,
                render=lambda block, ctx: Markup(""), assets=["chrome.css"], hidden=True))
