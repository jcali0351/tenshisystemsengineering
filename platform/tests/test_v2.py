"""
v2 of the CMS: blog posts and the Blog widget; the global header and footer; dark theme tokens and self-hosted fonts;
more of the Shopify store; lead email notifications; the Caddy on-demand TLS 'ask' endpoint.
Throw-away data folder, like the other tests.
"""

import os
import sys
import tempfile
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
os.environ.setdefault("TENSHI_DATA", tempfile.mkdtemp(prefix="tenshi-test-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from cms import auth, config, db, posts, render, sites, templates, widgets  # noqa: E402
from cms.app import app  # noqa: E402

H = {"X-Tenshi": "1"}


def _login(c, email, password):
    r = c.post("/login", data={"email": email, "password": password, "next": "/"}, follow_redirects=False)
    assert r.status_code == 303, r.text


def _user(email, pw, role="editor"):
    row = db.one("SELECT id FROM users WHERE email = ?", email)
    return row["id"] if row else auth.create_user(email, email.split("@")[0], pw, role)


@pytest.fixture(scope="module")
def cms():
    with TestClient(app) as c:
        _user("v2-admin@example.com", "correct-horse-9", "admin")
        _login(c, "v2-admin@example.com", "correct-horse-9")
        tpl = templates.all_templates()[0]["id"]
        sid = c.post("/api/sites", json={"name": "Vee Two Plumbing", "template": tpl}, headers=H).json()["site"]["id"]
        yield c, sid


def _put_blocks(c, sid, slug, blocks):
    page = db.one("SELECT * FROM pages WHERE site_id = ? AND slug = ?", sid, slug)
    return c.patch(f"/api/pages/{page['id']}", json={"blocks": blocks}, headers=H)


def _deploy(c, sid):
    build = c.post(f"/api/sites/{sid}/deploy", json={"note": "v2 test"}, headers=H).json()["build"]
    assert build["status"] == "ready", build
    folder, _ = sites.live_folder(sites.get(sid)["subdomain"])
    return folder


# ---------------------------------------------------------------------------------------------- 1. posts and the blog

def test_post_saving_cleans_and_slugs(cms):
    c, sid = cms
    r = c.post(f"/api/sites/{sid}/posts", json={"title": "Fix a dripping tap!", "body": '<p onclick="x()">Turn off <script>alert(1)</script>the water.</p>',
                                                 "tags": "Tips, tips, DIY", "excerpt": "Five minutes, one washer."}, headers=H)
    assert r.status_code == 200, r.text
    p = r.json()
    assert p["slug"] == "fix-a-dripping-tap" and p["status"] == "draft" and p["published_at"] == ""
    assert p["body"] == "<p>Turn off the water.</p>" and p["tags"] == "Tips, DIY"
    again = c.post(f"/api/sites/{sid}/posts", json={"title": "Fix a dripping tap"}, headers=H).json()
    assert again["slug"] == "fix-a-dripping-tap-2"
    assert c.post(f"/api/sites/{sid}/posts", json={"title": ""}, headers=H).status_code == 400
    assert c.post(f"/api/sites/{sid}/posts", json={"title": "x", "status": "live"}, headers=H).status_code == 400
    c.delete(f"/api/sites/{sid}/posts/{again['id']}", headers=H)
    assert "Fix a dripping tap!" in c.get(f"/sites/{sid}/posts").text
    assert 'id="body"' in c.get(f"/sites/{sid}/posts/{p['id']}").text and c.get(f"/sites/{sid}/posts/new").status_code == 200


def test_blog_widget_shows_only_live_posts(cms):
    c, sid = cms
    assert "post" not in widgets.block_types() and "blog" in widgets.block_types()
    draft = posts.all_for(sid)[0]
    _put_blocks(c, sid, "about", [{"id": "b1", "type": "blog", "data": {"heading": "News"}}])
    html = c.get(f"/sites/{sid}/preview/about").text
    assert "No published posts yet" in html and draft["title"] not in html
    # the draft's own preview page works, with a "not live" note
    page = c.get(f"/sites/{sid}/preview/post-{draft['slug']}").text
    assert "<h1>Fix a dripping tap!</h1>" in page and "this post is a draft" in page
    c.patch(f"/api/sites/{sid}/posts/{draft['id']}", json={**draft, "status": "published"}, headers=H)
    c.post(f"/api/sites/{sid}/posts", json={"title": "Coming next week", "status": "published", "published_at": "2099-01-01T09:00"}, headers=H)
    c.post(f"/api/sites/{sid}/posts", json={"title": "Winter pipe care", "status": "published", "published_at": "2026-01-10T09:00", "tags": "Winter"}, headers=H)
    html = c.get(f"/sites/{sid}/preview/about").text
    assert "Fix a dripping tap!" in html and "Winter pipe care" in html and "Coming next week" not in html
    assert html.index("Fix a dripping tap!") < html.index("Winter pipe care")            # newest first
    assert "blog/blog.css" in html
    _put_blocks(c, sid, "about", [{"id": "b1", "type": "blog", "data": {"variant": "featured", "tag": "winter"}}])
    html = c.get(f"/sites/{sid}/preview/about").text
    assert "tw-post-big" in html and "Winter pipe care" in html and "Fix a dripping tap!" not in html


def test_deploy_writes_posts_feed_and_sitemap(cms):
    c, sid = cms
    folder = _deploy(c, sid)
    live = posts.published(sid)
    assert len(live) == 2
    for p in live:
        page = (folder / f"post-{p['slug']}.html").read_text()
        assert f"<h1>{p['title']}</h1>" in page and "BlogPosting" in page and 'href="widgets/post/post.css"' in page
    assert not (folder / "post-coming-next-week.html").exists()
    feed = ET.fromstring((folder / "feed.xml").read_text())
    items = feed.findall("./channel/item")
    base = config.site_url(sites.get(sid)["subdomain"])
    assert [i.findtext("title") for i in items] == ["Fix a dripping tap!", "Winter pipe care"]
    assert items[0].findtext("link") == base + "post-fix-a-dripping-tap.html" and items[0].findtext("pubDate")
    smap = (folder / "sitemap.xml").read_text()
    locs = [e.text for e in ET.fromstring(smap).iter("{http://www.sitemaps.org/schemas/sitemap/0.9}loc")]
    assert base in locs and base + "about.html" in locs and base + "post-winter-pipe-care.html" in locs
    assert "Sitemap: " + base + "sitemap.xml" in (folder / "robots.txt").read_text()
    index = (folder / "index.html").read_text()
    assert '<link rel="alternate" type="application/rss+xml"' in index
    host = {"host": f"{sites.get(sid)['subdomain']}.{config.SITES_DOMAIN}"}
    r = c.get("/feed.xml", headers=host)
    assert r.status_code == 200 and r.headers["content-type"].startswith("application/rss+xml")
    assert c.get("/post-winter-pipe-care", headers=host).status_code == 200


def test_page_addresses_cannot_take_post_names(cms):
    c, sid = cms
    r = c.post(f"/api/sites/{sid}/pages", json={"title": "Post office", "slug": "post-office"}, headers=H).json()
    assert db.one("SELECT slug FROM pages WHERE id = ?", r["id"])["slug"] == "page-post-office"
    r2 = c.post(f"/api/sites/{sid}/pages", json={"title": "Feed"}, headers=H).json()
    assert db.one("SELECT slug FROM pages WHERE id = ?", r2["id"])["slug"] == "page-feed"
