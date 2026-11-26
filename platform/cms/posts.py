"""
posts.py: a site's blog posts.

  - Edited on /sites/<id>/posts (ui/posts.html, ui/post_edit.html); body is HTML cleaned with nh3 (sanitize.py, the
    Custom HTML allowlist) when saved.
  - Shown by the Blog widget (widgets/blog.py: a list or a featured post) on any page, each post on its own page
    post-<slug>.html (render.SiteRenderer.render_post, drawn by the hidden "post" widget inside the template's frame).
  - Each deployment also gets feed.xml (RSS 2.0) and sitemap.xml with the pages and posts.
  - A post is live when status is "published" and published_at has passed, as of the last Publish.
"""
import re
from datetime import datetime, timezone
from email.utils import format_datetime
from xml.sax.saxutils import escape as xml_escape

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from . import db, sanitize

PREFIX = "post-"
RESERVED_PAGE_SLUGS = {"feed", "sitemap", "robots", "media"}


class PostError(ValueError):
    pass


def _iso(value) -> str:
    """'2026-11-25T19:30', '2026-11-25T19:30:00.000Z' or '' → '2026-11-26T01:30:00Z' (UTC). Naive times are UTC."""
    value = str(value or "").strip()
    if not value:
        return ""
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise ValueError("publish date: use a date and time like 2026-11-25 09:30") from None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class PostIn(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
    title: str = Field(..., min_length=1, max_length=200)
    slug: str = Field("", max_length=80)
    excerpt: str = Field("", max_length=500)
    body: str = Field("", max_length=200_000)
    cover_media_id: int | None = None
    tags: str = Field("", max_length=300)
    author: str = Field("", max_length=100)
    status: str = "draft"
    published_at: str = ""

    @field_validator("cover_media_id", mode="before")
    @classmethod
    def _cover(cls, v):
        return int(v) if str(v or "").isdigit() else None

    @field_validator("tags", mode="before")
    @classmethod
    def _tags(cls, v):
        items = v if isinstance(v, list) else str(v or "").split(",")
        seen = []
        for t in (str(x).strip()[:40] for x in items):
            if t and t.lower() not in [s.lower() for s in seen]:
                seen.append(t)
        return ", ".join(seen[:12])

    @field_validator("status")
    @classmethod
    def _status(cls, v):
        if v not in ("draft", "published"):
            raise ValueError("status is draft or published")
        return v

    @field_validator("published_at", mode="before")
    @classmethod
    def _published(cls, v):
        return _iso(v)


def slugify(text) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", str(text).lower().replace("&", " and ").replace("'", "")).strip("-")
    return s[:70].strip("-") or "post"


def unique_slug(site_id, slug, post_id=None) -> str:
    base, n, out = slug, 2, slug
    while db.one("SELECT id FROM posts WHERE site_id = ? AND slug = ? AND id != ?", site_id, out, post_id or 0):
        out, n = f"{base}-{n}", n + 1
    return out


def safe_page_slug(slug) -> str:
    """Page addresses may not look like post pages (post-…) or the feed/sitemap files."""
    return f"page-{slug}" if slug.startswith(PREFIX) or slug in RESERVED_PAGE_SLUGS else slug


def get(post_id, site_id=None):
    row = db.one("SELECT * FROM posts WHERE id = ?" + (" AND site_id = ?" if site_id else ""), *([post_id, site_id] if site_id else [post_id]))
    return row


def save(site_id, data: dict, user=None, post_id=None) -> dict:
    from . import widgets
    try:
        p = PostIn.model_validate(data or {})
    except ValidationError as error:
        raise PostError(widgets.friendly(error)) from None
    old = get(post_id, site_id) if post_id else None
    if post_id and not old:
        raise PostError("That post isn't there any more.")
    slug = unique_slug(site_id, slugify(p.slug or p.title), post_id)
    published_at = p.published_at or (old["published_at"] if old and old["published_at"] else "")
    if p.status == "published" and not published_at:
        published_at = db.now()
    values = {"title": p.title, "slug": slug, "excerpt": p.excerpt, "body": sanitize.clean(p.body, advanced=True),
              "cover_media_id": p.cover_media_id, "tags": p.tags, "author": p.author, "status": p.status,
              "published_at": published_at, "updated_at": db.now()}
    if old:
        db.run(f"UPDATE posts SET {', '.join(k + ' = ?' for k in values)} WHERE id = ?", *values.values(), post_id)
        db.log("Edited post", p.title, user, site_id)
    else:
        cols = list(values) + ["site_id", "created_at"]
        post_id = db.run(f"INSERT INTO posts ({', '.join(cols)}) VALUES ({', '.join('?' * len(cols))})", *values.values(), site_id, db.now())
        db.log("Wrote post", p.title, user, site_id)
    db.run("UPDATE sites SET updated_at = ? WHERE id = ?", db.now(), site_id)
    return get(post_id)


def delete(post_id, site_id, user=None):
    row = get(post_id, site_id)
    if row:
        db.run("DELETE FROM posts WHERE id = ?", post_id)
        db.log("Deleted post", row["title"], user, site_id)


def all_for(site_id) -> list[dict]:
    return db.all("SELECT * FROM posts WHERE site_id = ? ORDER BY CASE status WHEN 'draft' THEN 0 ELSE 1 END, published_at DESC, id DESC", site_id)


def published(site_id, tag="", limit=None) -> list[dict]:
    rows = db.all("SELECT * FROM posts WHERE site_id = ? AND status = 'published' AND published_at != '' AND published_at <= ? "
                  "ORDER BY published_at DESC, id DESC", site_id, db.now())
    if tag:
        rows = [r for r in rows if tag.lower() in [t.strip().lower() for t in r["tags"].split(",")]]
    return rows[:limit] if limit else rows


def is_live(row) -> bool:
    return bool(row and row["status"] == "published" and row["published_at"] and row["published_at"] <= db.now())


def tags_of(row) -> list[str]:
    return [t.strip() for t in (row.get("tags") or "").split(",") if t.strip()]


def file_name(row) -> str:
    return f"{PREFIX}{row['slug']}.html"


def page_for(row) -> dict:
    """A post as a page for the renderer: the template's frame with one hidden "post" block in the middle."""
    return {"id": None, "slug": PREFIX + row["slug"], "title": row["title"], "seo_title": "", "in_menu": 0,
            "seo_description": row["excerpt"][:300], "blocks": [{"id": "post", "type": "post", "data": {"post_id": row["id"]}}]}


def nice_date(iso) -> str:
    try:
        d = datetime.strptime(iso, "%Y-%m-%dT%H:%M:%SZ")
    except (TypeError, ValueError):
        return ""
    return f"{d.day} {d:%B %Y}"


def rfc822(iso) -> str:
    try:
        return format_datetime(datetime.strptime(iso, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc))
    except (TypeError, ValueError):
        return ""


# ---------------------------------------------------------------------------------------------- feed and sitemap

def feed_xml(site, base_url, profile) -> str:
    """RSS 2.0 of the newest 30 published posts."""
    company = (profile or {}).get("company") or {}
    title = company.get("name") or site["name"]
    rows = published(site["id"], limit=30)
    items = []
    for r in rows:
        link = base_url + file_name(r)
        cats = "".join(f"<category>{xml_escape(t)}</category>" for t in tags_of(r))
        items.append(f"<item><title>{xml_escape(r['title'])}</title><link>{xml_escape(link)}</link>"
                     f'<guid isPermaLink="true">{xml_escape(link)}</guid><pubDate>{rfc822(r["published_at"])}</pubDate>'
                     f"<description>{xml_escape(r['excerpt'] or '')}</description>{cats}</item>")
    built = rfc822(rows[0]["published_at"]) if rows else rfc822(db.now())
    return ('<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>'
            f"<title>{xml_escape(title)}</title><link>{xml_escape(base_url)}</link>"
            f"<description>{xml_escape(company.get('tagline') or company.get('description') or title)}</description>"
            f'<language>{xml_escape(str((db.j(site.get("theme_json")) or {}).get("lang") or "en"))}</language>'
            f'<atom:link href="{xml_escape(base_url)}feed.xml" rel="self" type="application/rss+xml"/>'
            f"<lastBuildDate>{built}</lastBuildDate>{''.join(items)}</channel></rss>\n")


def sitemap_xml(site, base_url, pages) -> str:
    urls = []
    for p in pages:
        loc = base_url if p["slug"] == "index" else f"{base_url}{p['slug']}.html"
        urls.append((loc, (p.get("updated_at") or "")[:10]))
    for r in published(site["id"]):
        urls.append((base_url + file_name(r), (r["updated_at"] or r["published_at"])[:10]))
    body = "".join(f"<url><loc>{xml_escape(loc)}</loc>" + (f"<lastmod>{d}</lastmod>" if d else "") + "</url>" for loc, d in urls)
    return f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{body}</urlset>\n'
