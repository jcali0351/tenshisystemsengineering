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
BRAND_KEYS = ("colors", "fonts", "style", "radius", "space", "mode", "toggle", "dark_colors")
MODES = ("light", "dark", "auto")       # what the brand lock protects (not the language)

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


def _check_colors(v):
    out = {}
    for k, c in (v if isinstance(v, dict) else {}).items():
        if k not in COLOR_KEYS or not c:
            continue
        if not isinstance(c, str) or not HEX_RE.match(c):
            raise ValueError(f"colour {k}: “{c}” isn't a colour like #1f2937")
        out[k] = c.lower()
    return out


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
    mode: str = "light"            # light | dark | auto (follows the visitor's device: prefers-color-scheme)
    toggle: bool = False           # a button on the site lets visitors choose auto, light or dark
    dark_colors: dict[str, str] = {}   # the dark palette; empty keys are worked out from the light colours

    @field_validator("dark_colors", mode="before")
    @classmethod
    def _dark(cls, v):
        return _check_colors(v)

    @field_validator("mode")
    @classmethod
    def _mode(cls, v):
        if v and v not in MODES:
            raise ValueError("colour mode must be light, dark or auto")
        return v or "light"

    @field_validator("colors", mode="before")
    @classmethod
    def _colors(cls, v):
        return _check_colors(v)

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


def _rgb(h):
    h = h.lstrip("#")
    return [int(h[i:i + 2], 16) for i in (0, 2, 4)]


def mix(a, b, t) -> str:
    """a with t (0..1) of b mixed in."""
    return "#" + "".join(f"{round(x + (y - x) * t):02x}" for x, y in zip(_rgb(a), _rgb(b)))


def _until(colour, towards, against, need, step=.04):
    """Mix colour towards another until it has the needed contrast against a background (or as far as it goes)."""
    t = 0.0
    while t <= 1 and contrast(mix(colour, towards, t), against) < need:
        t += step
    return mix(colour, towards, min(t, 1))


def dark_palette(colors, dark=None) -> dict:
    """The dark-mode colours: the site's own dark colours, the rest worked out from the light ones so they pass AA.
    primary = links and accents on the dark background; solid = button and band backgrounds under white text."""
    dark = dark or {}
    p = colors.get("primary") if HEX_RE.match(colors.get("primary") or "") else "#5b21b6"
    a = colors.get("accent") if HEX_RE.match(colors.get("accent") or "") else "#c2410c"
    surface = dark.get("surface") or mix("#111318", p, .06)
    ink = dark.get("ink") or "#eceef3"
    card = mix(surface, "#ffffff", .06)
    primary = dark.get("primary") or _until(p, "#ffffff", card, 4.5)
    accent = dark.get("accent") or _until(a, "#ffffff", surface, 3.0)
    solid = _until(p, "#000000", "#ffffff", 4.5)
    return {"primary": primary, "accent": accent, "surface": surface, "ink": ink, "card": card, "solid": solid,
            "footer": mix(surface, "#000000", .35)}


DARK_PAIRS = [
    ("ink", "surface", "Dark mode: text on the page background", 4.5),
    ("ink", "card", "Dark mode: text on cards and forms", 4.5),
    ("#ffffff", "solid", "Dark mode: white text on buttons and bands", 4.5),
    ("primary", "surface", "Dark mode: links and prices on the page background", 4.5),
    ("primary", "card", "Dark mode: links on cards", 4.5),
    ("accent", "surface", "Dark mode: focus ring and accent lines (not text)", 3.0),
]

PAIRS = [   # (foreground, background, what, needed ratio)
    ("ink", "surface", "Text on the page background", 4.5),
    ("ink", "#ffffff", "Text on cards and forms", 4.5),
    ("#ffffff", "primary", "White text on buttons, the call-to-action band and the hero", 4.5),
    ("primary", "surface", "Links, prices and outline buttons on the page background", 4.5),
    ("accent", "surface", "Focus ring and accent lines (not text)", 3.0),
]


def contrast_checks(colors, pairs=None) -> list[dict]:
    out = []
    for fg, bg, what, need in pairs or PAIRS:
        a, b = (c if c.startswith("#") else colors.get(c, "") for c in (fg, bg))
        if not (HEX_RE.match(a or "") and HEX_RE.match(b or "")):
            continue
        ratio = contrast(a, b)
        out.append({"pair": f"{fg}/{bg}", "what": what, "fg": a, "bg": b, "ratio": ratio, "need": need, "ok": ratio >= need})
    return out


def all_checks(theme) -> list[dict]:
    """AA checks for the light colours, plus the dark ones when the site can show dark mode."""
    checks = contrast_checks(theme.get("colors", {}))
    if theme.get("mode", "light") != "light" or theme.get("toggle"):
        checks += contrast_checks(dark_palette(theme.get("colors", {}), theme.get("dark_colors")), DARK_PAIRS)
    return checks


# ---------------------------------------------------------------------------------------------- the CSS

# Dark mode: the template's light-only rules (white cards, buttons on --p …) turned dark. Selectors are prefixed with
# the condition that turns dark mode on (dark_css), so old template copies follow too.
DARK_RULES = [
    (":root", "--p: {primary}; --a: {accent}; --s: {surface}; --i: {ink}; --p-solid: {solid}; --card: {card}; color-scheme: dark;"),
    ("body", "background: var(--s); color: var(--i);"),
    (".btn, .menu .menu-call, .tc-header .menu a.tc-cta, .tc-header .menu a.tc-cta:hover, .tw-tier-flag", "background: var(--p-solid); border-color: var(--p-solid); color: #fff;"),
    (".btn-line", "background: transparent; color: var(--p); border-color: var(--p);"),
    (".btn-light, .hero .btn", "background: #fff; color: var(--p-solid); border-color: #fff;"),
    (".hero .btn-line", "background: transparent; color: #fff; border-color: #fff;"),
    (".hero", "background: radial-gradient(circle at 85% 20%, color-mix(in srgb, var(--a) 30%, transparent), transparent 45%), linear-gradient(135deg, var(--p-solid), color-mix(in srgb, var(--p-solid) 55%, #000));"),
    (".cta, .person-initial, .filters button[aria-pressed=\"true\"]", "background: var(--p-solid); color: #fff;"),
    (".card, .quote, .work, .filters button, .lead input, .lead textarea, .lead select, .skip:focus, .tw-post, .tw-tier, .tw-booking-frame",
     "background: var(--card); color: var(--i);"),
    (".bottom", "background: {footer};"),
]


def dark_css(theme) -> str:
    mode, toggle = theme.get("mode", "light"), bool(theme.get("toggle"))
    if mode == "light" and not toggle:
        return ""
    pal = dark_palette(theme.get("colors", {}), theme.get("dark_colors"))

    def block(prefix):
        out = []
        for sel, decl in DARK_RULES:
            sels = ", ".join(prefix if s.strip() == ":root" else f"{prefix} {s.strip()}" for s in sel.split(", "))
            out.append(f"{sels} {{ {decl.format(**pal)} }}")
        return "\n".join(out)
    if mode == "dark":
        return block('html:not([data-theme="light"])')
    if mode == "auto":
        return block('html[data-theme="dark"]') + "\n@media (prefers-color-scheme: dark) {\n" + block('html:not([data-theme="light"])') + "\n}"
    return block('html[data-theme="dark"]')


def fonts_css(theme, base="/static/fonts/") -> str:
    """@font-face for the self-hosted fonts the theme uses (no Google Fonts request)."""
    keys = [(theme.get("font_keys") or {}).get(k) for k in ("heading", "body")]
    return "\n".join(f'@font-face {{ font-family: "{fam}"; src: url("{base}{file}") format("woff2"); font-weight: {w}; '
                     f"font-style: normal; font-display: swap; }}" for fam, file, w in templates.font_files(keys))

RADIUS_LARGE = (".card", ".quote", ".work", ".gallery-item", ".hero-pic img", ".image-block img", ".embed iframe", "video", ".ba")
RADIUS_SMALL = (".btn", ".menu a", ".menu-btn", ".lead input", ".lead textarea", ".lead select", ".empty-note")


def tokens_css(theme, font_base="/static/fonts/") -> str:
    """The <style id="tenshi-tokens"> for a theme as returned by templates.theme_for()."""
    c, f = theme.get("colors", {}), theme.get("fonts", {})
    lines = [fonts_css(theme, font_base), ":root {"] if fonts_css(theme, font_base) else [":root {"]
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
    dark = dark_css(theme)
    if dark:
        lines.append(dark)
    return "\n".join(lines)


# The visitor's choice (auto, light or dark) from the toggle, applied before the page paints
SCHEME_HEAD = ("<script>try{var t=localStorage.getItem(\"tenshi-scheme\");if(t==\"light\"||t==\"dark\")"
               "document.documentElement.setAttribute(\"data-theme\",t)}catch(e){}</script>")
TOGGLE = """<button type="button" class="tenshi-scheme" aria-label="Colour theme" title="Colour theme: auto, light or dark">
<span aria-hidden="true">◐</span><span class="tenshi-scheme-label">Auto</span></button>
<style>.tenshi-scheme{position:fixed;left:14px;bottom:14px;z-index:60;display:inline-flex;align-items:center;gap:6px;padding:8px 12px;
border-radius:999px;border:1px solid color-mix(in srgb,var(--i) 25%,transparent);background:var(--s);color:var(--i);font:600 .85rem/1 var(--font-body,system-ui);
cursor:pointer;box-shadow:0 6px 18px -10px rgba(0,0,0,.5)}.tenshi-scheme:focus-visible{outline:3px solid var(--a);outline-offset:2px}</style>
<script>(function(){var b=document.querySelector(".tenshi-scheme"),l=b.querySelector(".tenshi-scheme-label"),o=["auto","light","dark"],
n={auto:"Auto",light:"Light",dark:"Dark"};function cur(){return document.documentElement.getAttribute("data-theme")||"auto"}
function show(){l.textContent=n[cur()];b.setAttribute("aria-label","Colour theme: "+n[cur()]+". Change")}
b.addEventListener("click",function(){var x=o[(o.indexOf(cur())+1)%3];if(x=="auto")document.documentElement.removeAttribute("data-theme");
else document.documentElement.setAttribute("data-theme",x);try{if(x=="auto")localStorage.removeItem("tenshi-scheme");else localStorage.setItem("tenshi-scheme",x)}catch(e){}show()});show()})();</script>"""


def inject(html, theme, font_base="/static/fonts/") -> str:
    css = tokens_css(theme, font_base).replace("</", "<\\/")
    tag = f'<style id="tenshi-tokens">\n{css}\n</style>\n'
    if theme.get("toggle"):
        tag += SCHEME_HEAD + "\n"
    i = html.lower().rfind("</head>")
    html = html[:i] + tag + html[i:] if i >= 0 else tag + html
    if theme.get("toggle"):
        j = html.lower().rfind("</body>")
        html = html[:j] + TOGGLE + html[j:] if j >= 0 else html + TOGGLE
    return html
