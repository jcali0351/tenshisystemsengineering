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


# ---------------------------------------------------------------------------------------------- 2. header and footer

def test_header_footer_off_by_default(cms):
    c, sid = cms
    html = c.get(f"/sites/{sid}/preview/index").text
    assert '<header class="top">' in html and "tc-header" not in html and "chrome.css" not in html


def test_header_footer_on_every_page(cms):
    from datetime import date
    c, sid = cms
    data = {"header": {"enabled": True, "menu": "custom", "show_name": True, "cta_text": "Book a plumber", "cta_link": "contact",
                       "links": [{"label": "Home", "link": "index"}, {"label": "About us", "link": "about"}, {"label": "Shop", "link": "https://shop.example.com"}]},
            "footer": {"enabled": True, "about": "Fast, tidy, insured.", "copyright": "© {year} {name}. All rights reserved.",
                       "columns": [{"heading": "Help", "links": [{"label": "FAQ", "link": "about"}]}],
                       "social": {"instagram": "https://instagram.com/veetwo", "facebook": ""}}}
    r = c.put(f"/api/sites/{sid}/chrome", json=data, headers=H)
    assert r.status_code == 200, r.text
    assert r.json()["footer"]["social"] == {"instagram": "https://instagram.com/veetwo"}
    for slug in ("index", "about", "post-winter-pipe-care"):
        html = c.get(f"/sites/{sid}/preview/{slug}").text
        assert html.count("<header") == 1 and html.count("<footer") == 1, slug
        assert "tc-header" in html and "Book a plumber" in html and "About us" in html and "widgets/chrome/chrome.css" in html
        assert ">Help</h2>" in html and "Fast, tidy, insured." in html and f"© {date.today().year} Vee Two Plumbing. All rights reserved." in html
        assert 'href="https://instagram.com/veetwo"' in html and 'href="https://shop.example.com" target="_blank"' in html
    about = c.get(f"/sites/{sid}/preview/about").text
    assert f'href="/sites/{sid}/preview/about" aria-current="page">About us' in about
    assert '<a href="/sites/{}/preview/services">'.format(sid) not in about.split("</header>")[0]       # custom: only the links
    folder = _deploy(c, sid)
    assert (folder / "widgets/chrome/chrome.css").exists() and "tc-footer" in (folder / "post-winter-pipe-care.html").read_text()
    assert 'href="about.html" aria-current="page"' in (folder / "about.html").read_text()


@pytest.mark.parametrize("bad", [{"header": {"links": [{"label": "x", "link": "javascript:alert(1)"}]}},
                                 {"footer": {"social": {"x": "http://x.com/me"}}},
                                 {"header": {"menu": "random"}}, {"footer": {"columns": [{}] * 5}}])
def test_header_footer_refuses_bad_values(cms, bad):
    c, sid = cms
    assert c.put(f"/api/sites/{sid}/chrome", json=bad, headers=H).status_code == 400


def test_header_footer_respects_brand_lock(cms):
    c, sid = cms
    _user("v2-ed@example.com", "correct-horse-4")
    c.put(f"/api/sites/{sid}/brand", json={"locked": True}, headers=H)
    with TestClient(app) as ed:
        _login(ed, "v2-ed@example.com", "correct-horse-4")
        assert ed.put(f"/api/sites/{sid}/chrome", json={}, headers=H).status_code == 403
        assert "The brand is locked" in ed.get(f"/sites/{sid}/chrome").text
    c.put(f"/api/sites/{sid}/brand", json={"locked": False}, headers=H)
    assert 'id="hdr"' in c.get(f"/sites/{sid}/chrome").text


# ---------------------------------------------------------------------------------------------- 3. dark mode and fonts

def _theme(c, sid, theme):
    return c.post(f"/api/sites/{sid}/settings", json={"theme": theme}, headers=H)


def test_dark_modes_and_toggle(cms):
    from cms import theme as theme_mod
    c, sid = cms
    assert _theme(c, sid, {"mode": "sepia"}).status_code == 400
    assert _theme(c, sid, {"dark_colors": {"surface": "black"}}).status_code == 400
    assert _theme(c, sid, {"mode": "light"}).status_code == 200
    html = c.get(f"/sites/{sid}/preview/index").text
    assert "data-theme" not in html and "prefers-color-scheme" not in html          # light only: nothing extra
    _theme(c, sid, {"mode": "auto"})
    html = c.get(f"/sites/{sid}/preview/index").text
    assert "@media (prefers-color-scheme: dark)" in html and 'html:not([data-theme="light"]) .card' in html
    assert "tenshi-scheme" not in html                                              # no switch unless asked
    _theme(c, sid, {"mode": "dark", "toggle": True, "dark_colors": {"surface": "#000000"}})
    html = c.get(f"/sites/{sid}/preview/index").text
    assert "prefers-color-scheme" not in html and '--s: #000000' in html
    assert 'class="tenshi-scheme"' in html and "localStorage" in html
    assert html.index("tenshi-scheme\")") < html.index("</head>")                  # the choice applies before paint
    _theme(c, sid, {"mode": "light", "toggle": True})
    assert 'html[data-theme="dark"] .btn' in c.get(f"/sites/{sid}/preview/index").text


def test_dark_palette_passes_aa_for_every_preset():
    from cms import theme as theme_mod
    for name, p in theme_mod.PRESETS.items():
        checks = theme_mod.contrast_checks(theme_mod.dark_palette(p["colors"]), theme_mod.DARK_PAIRS)
        assert checks and all(ch["ok"] for ch in checks), (name, [ch for ch in checks if not ch["ok"]])
    # hard cases: a very light and a very dark primary
    for colors in ({"primary": "#ffee00", "accent": "#ffffff"}, {"primary": "#000033", "accent": "#000000"}):
        assert all(ch["ok"] for ch in theme_mod.contrast_checks(theme_mod.dark_palette(colors), theme_mod.DARK_PAIRS)), colors


def test_theme_preview_reports_both_modes(cms):
    c, sid = cms
    res = c.post(f"/api/sites/{sid}/theme/preview", json={"theme": {"mode": "auto"}}, headers=H).json()
    whats = [ch["what"] for ch in res["checks"]]
    assert any(w.startswith("Dark mode") for w in whats) and any(not w.startswith("Dark mode") for w in whats)
    assert res["dark"]["surface"].startswith("#")
    res = c.post(f"/api/sites/{sid}/theme/preview", json={"theme": {"mode": "light"}}, headers=H).json()
    assert not any(ch["what"].startswith("Dark mode") for ch in res["checks"])


def test_self_hosted_fonts_no_google(cms, tmp_path):
    from cms import templates
    c, sid = cms
    assert _theme(c, sid, {"fonts": {"heading": "comic-sans"}}).status_code == 400
    assert _theme(c, sid, {"mode": "light", "toggle": False, "fonts": {"heading": "fraunces", "body": "inter"}}).status_code == 200
    html = c.get(f"/sites/{sid}/preview/index").text
    assert 'url("/static/fonts/fraunces.woff2")' in html and 'url("/static/fonts/inter.woff2")' in html
    assert "fonts.googleapis.com" not in html and "fonts.gstatic.com" not in html
    r = c.get("/static/fonts/inter.woff2")
    assert r.status_code == 200 and r.content[:4] == b"wOF2"
    assert c.get("/static/fonts/../app.py").status_code == 404
    render.build_to(sites.get(sid), tmp_path)
    assert sorted(p.name for p in (tmp_path / "fonts").iterdir()) == ["fraunces.woff2", "inter.woff2"]
    assert 'url("fonts/fraunces.woff2")' in (tmp_path / "index.html").read_text()
    for key, f in templates.FONTS.items():                        # every self-hosted font file exists and is small
        if len(f) > 2:
            path = templates.FONTS_DIR / f[2]
            assert path.is_file() and path.stat().st_size < 80_000, key
    assert (templates.FONTS_DIR / "OFL.txt").is_file()
    _theme(c, sid, {"fonts": {}})


# ---------------------------------------------------------------------------------------------- 4. more of the Shopify store

def test_store_filters_sort_and_buy_button(cms):
    import re
    c, sid = cms
    r = _put_blocks(c, sid, "index", [
        {"id": "g1", "type": "store", "data": {"variant": "grid", "limit": "8", "filters": True, "sort": "price-asc"}},
        {"id": "b1", "type": "store", "data": {"variant": "buy", "product_handle": "neon-angel-tee", "heading": "Get the tee"}},
    ])
    assert r.status_code == 200, r.text
    html = c.get(f"/sites/{sid}/preview/index").text
    assert "data-tws-bar" in html and 'data-tws-filter=""' in html and "data-tws-instock" in html
    assert re.search(r'<option value="price-asc" selected', html)
    prices = [float(p) for p in re.findall(r'class="tws-item" data-type="[^"]*" data-price="([\d.]+)"', html)]
    assert len(prices) >= 4 and prices == sorted(prices)
    assert 'class="tws-buy"' in html and 'data-tws-add="neon-angel-tee"' in html and "Get the tee" in html
    assert 'href="#product-neon-angel-tee"' in html                     # titles are shareable deep links to the quick view
    # by name
    _put_blocks(c, sid, "index", [{"id": "g1", "type": "store", "data": {"variant": "grid", "limit": "8", "filters": True, "sort": "title"}}])
    titles = re.findall(r'data-title="([^"]*)"', c.get(f"/sites/{sid}/preview/index").text)
    assert titles == sorted(titles)
    # a made-up sort is refused
    bad = _put_blocks(c, sid, "index", [{"id": "g1", "type": "store", "data": {"variant": "grid", "sort": "random"}}])
    assert bad.status_code == 400


def test_store_header_cart_on_every_page(cms):
    c, sid = cms
    _put_blocks(c, sid, "index", [{"id": "g1", "type": "store", "data": {"variant": "grid"}}])
    about = c.get(f"/sites/{sid}/preview/about").text
    if "<header" in about:                                              # templates with a header get the cart in it
        head = about[about.index("<header"):about.index("</header>")]
        assert "tws-hcart" in head and "data-tws-count" in head and "widgets/store/store.js" in about
    assert c.put(f"/api/sites/{sid}/widgets/store/settings", json={"header_cart": False}, headers=H).status_code == 200
    assert "tws-hcart" not in c.get(f"/sites/{sid}/preview/about").text
    assert c.put(f"/api/sites/{sid}/widgets/store/settings", json={"header_cart": True}, headers=H).status_code == 200
    folder = _deploy(c, sid)
    if "<header" in (folder / "about.html").read_text():
        assert "tws-hcart" in (folder / "about.html").read_text()
    _put_blocks(c, sid, "index", [])                                    # no store anywhere: no cart either
    assert "tws-hcart" not in c.get(f"/sites/{sid}/preview/about").text
