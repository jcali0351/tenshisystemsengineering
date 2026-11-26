"""
Theme tokens: one site's colours, fonts, corner radius and spacing, the presets to start from, a WCAG contrast check,
and the brand lock.

  - The layout of every template already writes --p --a --s --i --font-head --font-body from the theme. On top of that,
    every rendered page gets <style id="tenshi-tokens"> just before </head> (tokens_css), so the tokens also reach
    template copies made before radius and spacing existed, and widgets (the store reads --radius) follow them.
  - Radius and spacing are only written when the site picked one; otherwise the template's own shapes stay.
  - contrast_checks() lists the text/background pairs the starter design uses and whether each passes WCAG AA.
  - The brand lock (site_settings key "brand") stops editors changing colours, fonts, shape, radius and spacing.
    Admins and the site's owners can always change them, and lock or unlock.
"""
import re

from pydantic import BaseModel, ConfigDict, field_validator

from . import db, members, templates

KEY = "brand"
HEX_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
COLOR_KEYS = ("primary", "accent", "surface", "ink")
SPACING = {"compact": 0.8, "normal": 1.0, "airy": 1.25}
RADIUS_MAX = 32
BRAND_KEYS = ("colors", "fonts", "style", "radius", "space")       # what the brand lock protects (not the language)

PRESETS = {
    "tenshi": {"name": "Tenshi violet", "about": "Friendly violet with a warm orange accent",
               "colors": {"primary": "#5b21b6", "accent": "#c2410c", "surface": "#ffffff", "ink": "#1f2937"},
               "fonts": {"heading": "system", "body": "system"}, "style": "clean", "radius": 14, "space": "normal"},
    "ocean": {"name": "Ocean calm", "about": "Deep blue and teal, soft corners",
              "colors": {"primary": "#0b5a8a", "accent": "#0f766e", "surface": "#f6fafc", "ink": "#14232e"},
              "fonts": {"heading": "humanist", "body": "humanist"}, "style": "clean", "radius": 10, "space": "normal"},
    "forest": {"name": "Forest classic", "about": "Green and brass, serif headings, roomy",
               "colors": {"primary": "#1f5135", "accent": "#8a5a12", "surface": "#fbf8f1", "ink": "#1d2a21"},
               "fonts": {"heading": "serif", "body": "humanist"}, "style": "clean", "radius": 6, "space": "airy"},
    "bold": {"name": "Bold contrast", "about": "Black and red, square and tight",
             "colors": {"primary": "#111111", "accent": "#be123c", "surface": "#ffffff", "ink": "#111111"},
             "fonts": {"heading": "condensed", "body": "system"}, "style": "bold", "radius": 0, "space": "compact"},
    "elegant": {"name": "Elegant plum", "about": "Plum and gold, elegant serif, airy",
                "colors": {"primary": "#6d2843", "accent": "#8a6d12", "surface": "#fdf8f6", "ink": "#2b1d22"},
                "fonts": {"heading": "elegant", "body": "elegant"}, "style": "elegant", "radius": 2, "space": "airy"},
}


class ThemeError(ValueError):
    pass


class BrandSettings(BaseModel):
    model_config = ConfigDict(extra="ignore")
    locked: bool = False


class Theme(BaseModel):
    """What a site may store in theme_json. Empty values mean 'the template's choice'."""
    model_config = ConfigDict(extra="ignore")
    colors: dict[str, str] = {}
    fonts: dict[str, str] = {}
    style: str = ""
    radius: int | None = None
    space: str = ""
    lang: str = "en"
    preset: str = ""

    @field_validator("colors", mode="before")
    @classmethod
    def _colors(cls, v):
        out = {}
        for k, c in (v if isinstance(v, dict) else {}).items():
            if k not in COLOR_KEYS or not c:
                continue
            if not isinstance(c, str) or not HEX_RE.match(c):
                raise ValueError(f"colour {k}: “{c}” isn't a colour like #1f2937")
            out[k] = c.lower()
        return out

    @field_validator("fonts", mode="before")
    @classmethod
    def _fonts(cls, v):
        out = {}
        for k, f in (v if isinstance(v, dict) else {}).items():
            if k in ("heading", "body") and f:
                if f not in templates.FONTS:
                    raise ValueError(f"font {k}: unknown font “{f}”")
                out[k] = f
        return out

    @field_validator("style")
    @classmethod
    def _style(cls, v):
        if v and v not in ("clean", "bold", "elegant"):
            raise ValueError("shape must be clean, bold or elegant")
        return v or ""

    @field_validator("radius", mode="before")
    @classmethod
    def _radius(cls, v):
        if v in (None, ""):
            return None
        v = int(v)
        if not 0 <= v <= RADIUS_MAX:
            raise ValueError(f"corner radius must be 0 to {RADIUS_MAX} px")
        return v

    @field_validator("space")
    @classmethod
    def _space(cls, v):
        if v and v not in SPACING:
            raise ValueError("spacing must be compact, normal or airy")
        return v or ""

    @field_validator("lang")
    @classmethod
    def _lang(cls, v):
        return v if re.fullmatch(r"[a-z]{2}(-[A-Za-z]{2,4})?", v or "") else "en"


def clean(data) -> dict:
    from . import widgets
    try:
        return Theme.model_validate(data or {}).model_dump()
    except Exception as error:                      # ValidationError or a bad int()
        raise ThemeError(widgets.friendly(error) if hasattr(error, "errors") else str(error)) from None


def brand_part(theme) -> dict:
    try:
        t = Theme.model_validate(theme or {}).model_dump()
    except Exception:                               # an old, odd theme: compare it as stored
        t = theme if isinstance(theme, dict) else {}
    return {k: t.get(k) for k in BRAND_KEYS}


# ---------------------------------------------------------------------------------------------- brand lock

def load_brand(site_id) -> BrandSettings:
    row = db.one("SELECT value_json FROM site_settings WHERE site_id = ? AND key = ?", site_id, KEY) if site_id else None
    try:
        return BrandSettings.model_validate(db.j(row["value_json"]) if row else {})
    except Exception:
        return BrandSettings()


def save_brand(site_id, data, user=None) -> BrandSettings:
    value = BrandSettings.model_validate(data or {})
    db.run("INSERT INTO site_settings (site_id, key, value_json, updated_at) VALUES (?, ?, ?, ?) "
           "ON CONFLICT (site_id, key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at",
           site_id, KEY, db.dumps(value.model_dump()), db.now())
    db.log("Brand lock " + ("on" if value.locked else "off"), "", user, site_id)
    return value


def can_change_brand(user, site_id) -> bool:
    return members.can_manage(user, site_id) or not load_brand(site_id).locked


# ---------------------------------------------------------------------------------------------- contrast (WCAG 2.1)

def _lum(hex_colour):
    h = hex_colour.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in (r, g, b)]
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]


def contrast(a, b) -> float:
    la, lb = sorted((_lum(a), _lum(b)), reverse=True)
    return round((la + 0.05) / (lb + 0.05), 2)


PAIRS = [   # (foreground, background, what, needed ratio)
    ("ink", "surface", "Text on the page background", 4.5),
    ("ink", "#ffffff", "Text on cards and forms", 4.5),
    ("#ffffff", "primary", "White text on buttons, the call-to-action band and the hero", 4.5),
    ("primary", "surface", "Links, prices and outline buttons on the page background", 4.5),
    ("accent", "surface", "Focus ring and accent lines (not text)", 3.0),
]


def contrast_checks(colors) -> list[dict]:
    out = []
    for fg, bg, what, need in PAIRS:
        a, b = (c if c.startswith("#") else colors.get(c, "") for c in (fg, bg))
        if not (HEX_RE.match(a or "") and HEX_RE.match(b or "")):
            continue
        ratio = contrast(a, b)
        out.append({"pair": f"{fg}/{bg}", "what": what, "fg": a, "bg": b, "ratio": ratio, "need": need, "ok": ratio >= need})
    return out


# ---------------------------------------------------------------------------------------------- the CSS

RADIUS_LARGE = (".card", ".quote", ".work", ".gallery-item", ".hero-pic img", ".image-block img", ".embed iframe", "video", ".ba")
RADIUS_SMALL = (".btn", ".menu a", ".menu-btn", ".lead input", ".lead textarea", ".lead select", ".empty-note")


def tokens_css(theme) -> str:
    """The <style id="tenshi-tokens"> for a theme as returned by templates.theme_for()."""
    c, f = theme.get("colors", {}), theme.get("fonts", {})
    lines = [":root {"]
    for var, key in (("--p", "primary"), ("--a", "accent"), ("--s", "surface"), ("--i", "ink")):
        if HEX_RE.match(c.get(key, "") or ""):
            lines.append(f"  {var}: {c[key]};")
    for var, key in (("--font-head", "heading"), ("--font-body", "body")):
        if f.get(key):
            lines.append(f"  {var}: {f[key]};")
    radius, space = theme.get("radius"), theme.get("space")
    if radius is not None:
        lines.append(f"  --radius: {int(radius)}px;")
    if space:
        lines.append(f"  --space: {SPACING[space]};")
    lines.append("}")
    # html:root beats the template's own .style-bold/.style-elegant shape rules
    if radius is not None:
        lines.append(", ".join(f"html:root {s}" for s in RADIUS_LARGE) + " { border-radius: var(--radius); }")
        lines.append(", ".join(f"html:root {s}" for s in RADIUS_SMALL) + " { border-radius: calc(var(--radius) * .7); }")
        lines.append("html:root .card-pic { border-radius: var(--radius) var(--radius) 0 0; }")
    if space:
        lines.append("html:root .band { padding-block: calc(clamp(56px, 9vw, 110px) * var(--space)); }")
        lines.append("html:root .hero { padding-block: calc(clamp(60px, 11vw, 140px) * var(--space)); }")
        lines.append("html:root .cta { padding-block: calc(clamp(48px, 7vw, 80px) * var(--space)); }")
        lines.append("html:root .cards { gap: calc(22px * var(--space)); }")
    return "\n".join(lines)


def inject(html, theme) -> str:
    css = tokens_css(theme).replace("</", "<\\/")
    tag = f'<style id="tenshi-tokens">\n{css}\n</style>\n'
    i = html.lower().rfind("</head>")
    return html[:i] + tag + html[i:] if i >= 0 else tag + html
