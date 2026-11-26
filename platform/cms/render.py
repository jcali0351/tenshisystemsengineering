"""
render.py: turn a site's business data + pages + template into web pages.

Three ways to draw a site (the "mode"):
    "preview"  inside the CMS: pictures come from the CMS, links stay in the preview, and with editing=True each
               block gets a clickable frame and its words can be typed over (the page builder).
    "hosted"   a deployment served by Tenshi: files go in cms_data/builds/<id>/, forms send leads to the CMS, and a
               tiny counter records visits (no cookies).
    "export"   a ZIP the owner takes away: the same files, but forms use email and there's no counter, so the site
               works on any web host with nothing from Tenshi behind it.

Templates run in Jinja2's sandbox with autoescaping, so neither a template nor a business name can run code.
"""

import re
import shutil
from datetime import date
from html.parser import HTMLParser
from pathlib import Path

from jinja2 import ChoiceLoader, FileSystemLoader, FunctionLoader, select_autoescape
from jinja2.sandbox import SandboxedEnvironment
from markupsafe import Markup, escape

from tenshi import profile as prof

from . import chrome as chrome_mod, config, db, media as media_mod, posts as posts_mod, templates, theme as theme_mod, widgets


# ---------------------------------------------------------------------------------------------- cleaning HTML

class _Cleaner(HTMLParser):
    """Keep only safe tags and attributes. Everything that could run code is dropped."""
    BASIC = {"p", "br", "b", "strong", "i", "em", "u", "a", "ul", "ol", "li", "h2", "h3", "h4", "blockquote", "hr", "small", "span"}
    ADVANCED = BASIC | {"div", "section", "article", "figure", "figcaption", "img", "table", "thead", "tbody", "tr", "td", "th",
                        "h1", "h5", "h6", "iframe", "button", "code", "pre", "sup", "sub", "dl", "dt", "dd", "picture", "source", "video"}
    ATTRS = {"href", "title", "alt", "src", "srcset", "width", "height", "class", "id", "target", "rel", "colspan", "rowspan",
             "loading", "allowfullscreen", "controls", "type", "style", "aria-label", "role"}
    VOID = {"br", "hr", "img", "source"}
    DROP_INSIDE = {"script", "style", "template", "object", "embed"}

    def __init__(self, advanced):
        super().__init__(convert_charrefs=False)
        self.allowed = self.ADVANCED if advanced else self.BASIC
        self.advanced, self.out, self.skip = advanced, [], 0

    def handle_starttag(self, tag, attrs):
        if tag in self.DROP_INSIDE:
            self.skip += 1
            return
        if self.skip or tag not in self.allowed:
            return
        kept = []
        for name, value in attrs:
            value = value or ""
            if name not in self.ATTRS or (name == "style" and not self.advanced):
                continue
            if name in ("href", "src", "srcset") and re.match(r"\s*(javascript|vbscript|data:text)", value, re.I):
                continue
            if name == "style" and re.search(r"expression|url\s*\(\s*['\"]?\s*javascript", value, re.I):
                continue
            if tag == "iframe" and name == "src" and not re.match(r"https://(www\.youtube(-nocookie)?\.com|player\.vimeo\.com|www\.google\.com/maps)/", value):
                continue
            kept.append(f' {name}="{escape(value)}"')
        self.out.append(f"<{tag}{''.join(kept)}>")

    def handle_endtag(self, tag):
        if tag in self.DROP_INSIDE:
            self.skip = max(0, self.skip - 1)
            return
        if not self.skip and tag in self.allowed and tag not in self.VOID:
            self.out.append(f"</{tag}>")

    def handle_data(self, data):
        if not self.skip:
            self.out.append(str(escape(data)))

    def handle_entityref(self, name):
        if not self.skip:
            self.out.append(f"&{name};")

    def handle_charref(self, name):
        if not self.skip:
            self.out.append(f"&#{name};")


def clean_html(text, advanced=False):
    """Safe HTML from text typed in the CMS. Plain text (no tags) becomes paragraphs."""
    text = str(text or "")
    if "<" not in text:
        return Markup("".join(f"<p>{escape(p.strip())}</p>" for p in re.split(r"\n\s*\n", text) if p.strip()))
    cleaner = _Cleaner(advanced)
    cleaner.feed(text)
    cleaner.close()
    return Markup("".join(cleaner.out))


def youtube_id(url):
    match = re.search(r"(?:youtu\.be/|v=|embed/|shorts/)([A-Za-z0-9_-]{11})", str(url or ""))
    return match.group(1) if match else ""


# ---------------------------------------------------------------------------------------------- drawing pages

def make_env(template_id):
    # Widgets first: blocks/<widget>.html.j2 is answered by the widget registry for every template (cms/widgets/)
    loader = ChoiceLoader([FunctionLoader(widgets.block_template_source), FileSystemLoader(str(templates.current_dir(template_id)))])
    env = SandboxedEnvironment(loader=loader,
                               autoescape=select_autoescape(["html", "j2"]), trim_blocks=True, lstrip_blocks=True)
    env.filters["tel"] = lambda phone: re.sub(r"[^\d+]", "", str(phone or ""))
    env.filters["clean_html"] = clean_html
    env.filters["youtube_id"] = youtube_id
    return env


class SiteRenderer:
    """Draws every page of one site. Remembers which pictures were used so a build copies only those."""

    def __init__(self, site, mode="preview", editing=False, template_id=None, profile=None, theme=None):
        self.site = site
        self.mode = mode
        self.editing = editing
        self.template_id = template_id or site["template_id"]
        self.profile = prof.with_defaults(profile if profile is not None else db.j(site["profile_json"]))
        self.profile.setdefault("locations", [])
        self.chrome = chrome_mod.load(site.get("id"))
        self.theme = templates.theme_for(self.template_id, theme if theme is not None else db.j(site["theme_json"]))
        self.media_rows = {m["id"]: m for m in db.all("SELECT * FROM media WHERE site_id = ?", site["id"])} if site.get("id") else {}
        self.used_files = set()
        self.used_widgets = {}          # page file -> [widget names], for the deployment's CSP manifest
        self.page_sources = {}          # page file -> CSP sources from its blocks' settings (e.g. a booking embed host)
        self._widget_settings = {}
        self.env = make_env(self.template_id)

    # --- helpers the templates call -------------------------------------------------------------------------
    def media(self, media_id, size=None):
        item = self.media_rows.get(_int(media_id))
        if not item:
            return ""
        name = media_mod.file_path(item, size).name
        if self.mode == "preview":
            return f"/m/{item['site_id']}/{name}"
        self.used_files.add(name)
        return f"media/{name}"

    def media_alt(self, media_id):
        item = self.media_rows.get(_int(media_id))
        return (item["alt"] or item["title"]) if item else ""

    def album(self, album_id):
        rows = db.all("SELECT ai.caption AS item_caption, m.* FROM album_items ai JOIN media m ON m.id = ai.media_id "
                      "WHERE ai.album_id = ? AND m.site_id = ? ORDER BY ai.position, ai.id", _int(album_id), self.site.get("id"))
        return [{"thumb": self.media(r["id"], 800), "full": self.media(r["id"], 1600), "alt": r["alt"] or r["title"],
                 "caption": r["item_caption"] or r["caption"], "width": r["width"], "height": r["height"]}
                for r in rows if r["kind"] in ("image", "svg")]

    def album_layout(self, album_id):
        row = db.one("SELECT layout FROM albums WHERE id = ?", _int(album_id))
        return row["layout"] if row else ""

    def portfolio(self, category=None, limit=None):
        sql, params = "SELECT * FROM portfolio_items WHERE site_id = ?", [self.site.get("id")]
        if category:
            sql += " AND category = ?"
            params.append(category)
        sql += " ORDER BY position, id"
        if limit and str(limit).isdigit():
            sql += f" LIMIT {int(limit)}"
        items = []
        for row in db.all(sql, *params):
            items.append({**row, "cover": self.media(row["cover_media_id"], 800), "cover_full": self.media(row["cover_media_id"], 1600),
                          "before": self.media(row["before_media_id"], 1600), "after": self.media(row["after_media_id"], 1600)})
        return items

    def link(self, slug):
        slug = str(slug or "index")
        if re.match(r"^(https?:|mailto:|tel:|#)", slug):
            return slug
        if self.mode == "preview":
            return f"/sites/{self.site['id']}/preview/{slug}" + ("?edit=1" if self.editing else "")
        return "index.html" if slug == "index" else f"{slug}.html"

    def asset(self, name):
        if self.mode == "preview":
            return f"/t/{self.template_id}/{name}"
        return name

    def widget(self, block):
        """Draw a widget block (called from the template loader's blocks/<widget>.html.j2)."""
        w = widgets.get((block or {}).get("type"))
        if not w:
            return ""
        if w.name not in self._widget_settings:
            self._widget_settings[w.name] = widgets.load_settings(self.site.get("id"), w.name)
        ctx = widgets.WidgetContext(site=self.site, mode=self.mode, editing=self.editing, settings=self._widget_settings[w.name],
                                    asset=lambda file, n=w.name: widgets.asset_url(n, file, self.mode),
                                    link=self.link, profile=self.profile, media=self.media, media_alt=self.media_alt)
        return w.render(block, ctx)

    # --- pages ------------------------------------------------------------------------------------------------
    def context(self, page, menu_pages):
        p = self.profile
        hosted = self.mode == "hosted"
        email = p["company"].get("email", "")
        # Relative ("__form", not "/__form"), so it works at the site's own address and under /s/<address>/
        form_action = "__form" if hosted else ("#" if self.mode == "preview" else (f"mailto:{email}" if email else "#"))
        tracking = Markup(f'<img src="__visit?p={escape(page["slug"])}" alt="" width="1" height="1" style="position:absolute;left:-9999px">') if hosted else ""
        return {
            **p, "site": {"name": self.site.get("name"), "subdomain": self.site.get("subdomain")},
            "theme": self.theme, "page": page, "pages": menu_pages, "blocks": db.j(page.get("blocks_json"), []) if "blocks_json" in page else page.get("blocks", []),
            "editing": self.editing, "year": date.today().year, "form_action": form_action,
            "form_is_mail": form_action.startswith("mailto:"), "tracking": tracking,
            "media": self.media, "media_alt": self.media_alt, "album": self.album, "album_layout": self.album_layout,
            "portfolio": self.portfolio, "link": self.link, "asset": self.asset, "widget": self.widget,
        }

    def render_page(self, page, menu_pages):
        ctx = self.context(page, menu_pages)
        html = self.env.get_template("page.html.j2").render(ctx)
        used = widgets.used_in(ctx["blocks"])
        if chrome_mod.active(self.chrome):            # the site's own header and footer (Header & footer)
            html = chrome_mod.apply(html, self.chrome, self, page, menu_pages)
            used = used + ["chrome"]
        file = "index.html" if page.get("slug") == "index" else f"{page.get('slug')}.html"
        if used:
            self.used_widgets[file] = used
            sources = widgets.block_sources(ctx["blocks"])
            if sources:
                self.page_sources[file] = sources
        html = theme_mod.inject(html, self.theme)
        if self.mode != "preview" and self.has_posts():
            html = html.replace("</head>", f'<link rel="alternate" type="application/rss+xml" title="{escape(self.site.get("name") or "")}" href="feed.xml">\n</head>', 1)
        return widgets.inject_assets(html, used, self.mode)

    def has_posts(self):
        if not hasattr(self, "_has_posts"):
            self._has_posts = bool(self.site.get("id") and posts_mod.published(self.site["id"], limit=1))
        return self._has_posts

    def render_post(self, post, menu_pages):
        """One blog post on its own page: the template's frame around the hidden "post" widget."""
        return self.render_page(posts_mod.page_for(post), menu_pages)


def site_pages(site_id):
    pages = db.all("SELECT * FROM pages WHERE site_id = ? ORDER BY position, id", site_id)
    menu = [p for p in pages if p["in_menu"]]
    return pages, menu


def preview(site, slug, editing=False):
    """One page of a site, drawn for the CMS preview."""
    pages, menu = site_pages(site["id"])
    page = next((p for p in pages if p["slug"] == slug), None)
    if not page and slug.startswith(posts_mod.PREFIX):            # a blog post (drafts too: this is the CMS preview)
        post = db.one("SELECT * FROM posts WHERE site_id = ? AND slug = ?", site["id"], slug[len(posts_mod.PREFIX):])
        return SiteRenderer(site, "preview", editing).render_post(post, menu) if post else None
    if not page:
        return None
    return SiteRenderer(site, "preview", editing).render_page(page, menu)


def build_to(site, out_dir, mode="hosted"):
    """Draw every page into out_dir with its styles, scripts and the pictures it uses. Returns (pages, bytes)."""
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    renderer = SiteRenderer(site, mode)
    pages, menu = site_pages(site["id"])
    for page in pages:
        html = renderer.render_page(page, menu)
        (out / ("index.html" if page["slug"] == "index" else f"{page['slug']}.html")).write_text(html, encoding="utf-8")
    # Blog: each published post on its own page, the RSS feed and the sitemap (posts.py)
    live_posts = posts_mod.published(site["id"]) if site.get("id") else []
    for post in live_posts:
        (out / posts_mod.file_name(post)).write_text(renderer.render_post(post, menu), encoding="utf-8")
    # The template's own files (style.css, site.js, pictures …): everything that isn't a Jinja template
    tpl = templates.current_dir(renderer.template_id)
    for file in tpl.rglob("*"):
        if file.is_file() and file.suffix != ".j2":
            target = out / file.relative_to(tpl)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(file, target)
    # Widgets: their own files (only the widgets this site uses), and which page uses which (for the CSP when served)
    used = sorted({n for names in renderer.used_widgets.values() for n in names})
    widgets.copy_files(used, out)
    if site.get("id"):
        base_url = config.site_url(site["subdomain"])
        if live_posts:
            (out / "feed.xml").write_text(posts_mod.feed_xml(site, base_url, renderer.profile), encoding="utf-8")
        (out / "sitemap.xml").write_text(posts_mod.sitemap_xml(site, base_url, pages), encoding="utf-8")
        if not (out / "robots.txt").exists():
            (out / "robots.txt").write_text(f"User-agent: *\nAllow: /\nSitemap: {base_url}sitemap.xml\n", encoding="utf-8")
    if mode == "hosted":
        widgets.write_manifest(out, renderer.used_widgets, renderer.page_sources)
    if renderer.used_files:
        (out / "media").mkdir(exist_ok=True)
        src = media_mod.site_folder(site["id"])
        for name in renderer.used_files:
            if (src / name).exists():
                shutil.copy2(src / name, out / "media" / name)
    size = sum(f.stat().st_size for f in out.rglob("*") if f.is_file())
    return len(pages), size


def preview_template(template_id):
    """A template drawn with made-up business data, for the Template Gallery's Preview."""
    meta = templates.get(template_id)
    fake_site = {"id": None, "name": meta["name"], "subdomain": "preview", "template_id": template_id,
                 "profile_json": "{}", "theme_json": "{}"}
    from . import blocks
    profile = templates.sample_profile(meta)
    renderer = SiteRenderer(fake_site, "export", template_id=template_id, profile=profile, theme={})
    renderer.asset = lambda name: f"/t/{template_id}/{name}"
    renderer.link = lambda slug: "#"
    page = {"slug": "index", "title": "Home", "seo_title": "", "seo_description": "",
            "blocks": [blocks.new_block("hero", heading=meta.get("headline") or meta["name"]), blocks.new_block("services"),
                       blocks.new_block("team"), blocks.new_block("testimonials"), blocks.new_block("cta"), blocks.new_block("contact")]}
    return renderer.render_page(page, [{"slug": "index", "title": "Home"}, {"slug": "services", "title": "Services"},
                                       {"slug": "work", "title": "Our Work"}, {"slug": "contact", "title": "Contact"}])


def _int(value):
    """A number from a block setting, or None when it's empty (templates may pass an empty or missing setting)."""
    try:
        return int(value)
    except Exception:
        return None
