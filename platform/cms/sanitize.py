"""
sanitize.py: clean Custom HTML and rich text when a page is SAVED (render.clean_html cleans again when it's drawn).

Uses nh3 (the Rust ammonia sanitizer) with the same allowlist as render._Cleaner: the same tags, attributes and
iframe hosts (YouTube, Vimeo, Google Maps), no scripts, styles, event handlers or javascript: links. If nh3 isn't
installed yet (e.g. right after a deploy, before pip has run), the built-in cleaner is used instead.
"""
import re

try:
    import nh3
except ImportError:                                  # pragma: no cover - the fallback is tested by forcing nh3 = None
    nh3 = None

from . import blocks as blocks_mod

IFRAME_OK = re.compile(r"^https://(www\.youtube(-nocookie)?\.com|player\.vimeo\.com|www\.google\.com/maps)/")
BAD_URL = re.compile(r"^\s*(javascript|vbscript|data:text)", re.I)
BAD_STYLE = re.compile(r"expression|url\s*\(|behavior|-moz-binding|@import", re.I)
LOOKS_LIKE_HTML = re.compile(r"<[a-zA-Z!/?]")
DROP_WITH_CONTENT = {"script", "style", "template", "object", "embed", "noscript", "textarea", "select"}


def _allow(advanced):
    from .render import _Cleaner
    tags = set(_Cleaner.ADVANCED if advanced else _Cleaner.BASIC)
    attrs = set(_Cleaner.ATTRS) - ({"style"} if not advanced else set())
    return tags, attrs


def _attribute_filter(tag, attr, value):
    if attr in ("href", "src", "srcset") and BAD_URL.match(value or ""):
        return None
    if tag == "iframe" and attr == "src" and not IFRAME_OK.match(value or ""):
        return None
    if attr == "style" and BAD_STYLE.search(value or ""):
        return None
    return value


def clean(text, advanced=False) -> str:
    """Safe HTML to store. Plain text (no tags) is kept as typed; the renderer turns it into paragraphs."""
    text = str(text or "")
    if not LOOKS_LIKE_HTML.search(text):           # "a < b", "<3": plain text, left for the renderer to escape
        return text
    tags, attrs = _allow(advanced)
    if nh3 is not None:
        return nh3.clean(text, tags=tags, clean_content_tags=DROP_WITH_CONTENT - tags,
                         attributes={"*": attrs}, attribute_filter=_attribute_filter, link_rel=None,
                         url_schemes={"http", "https", "mailto", "tel"}, strip_comments=True)
    from .render import _Cleaner
    cleaner = _Cleaner(advanced)
    cleaner.feed(text)
    cleaner.close()
    return "".join(cleaner.out)


def html_fields(block_type) -> dict[str, bool]:
    """{field name: advanced?} for a block type's Custom HTML (advanced) and rich text (basic) fields."""
    spec = blocks_mod.BLOCKS.get(block_type) or {}
    return {f["name"]: f.get("type") == "html" for f in spec.get("fields", []) if f.get("type") in ("html", "rich")}


def clean_block_data(block_type, data: dict) -> dict:
    fields = html_fields(block_type)
    if not fields:
        return data
    return {k: (clean(v, fields[k]) if k in fields and isinstance(v, str) else v) for k, v in data.items()}


def engine() -> str:
    return "nh3" if nh3 is not None else "built-in"
