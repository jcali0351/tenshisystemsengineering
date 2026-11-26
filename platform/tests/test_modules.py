"""
The client module library (DB-36): galleries, calendars and booking, testimonials and trust, social, extras.
Throw-away data folder, like the other tests. Outside services are never called: modcache.http_json is replaced.
"""

import os
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
os.environ.setdefault("TENSHI_DATA", tempfile.mkdtemp(prefix="tenshi-test-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from cms import auth, config, db, render, sites, templates, widgets  # noqa: E402
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
        _user("mod-admin@example.com", "correct-horse-9", "admin")
        _login(c, "mod-admin@example.com", "correct-horse-9")
        tpl = templates.all_templates()[0]["id"]
        sid = c.post("/api/sites", json={"name": "Module Bakery", "template": tpl}, headers=H).json()["site"]["id"]
        yield c, sid


def _put(c, sid, slug, blocks):
    page = db.one("SELECT * FROM pages WHERE site_id = ? AND slug = ?", sid, slug)
    r = c.patch(f"/api/pages/{page['id']}", json={"blocks": blocks}, headers=H)
    return r


def _deploy(c, sid):
    build = c.post(f"/api/sites/{sid}/deploy", json={"note": "modules test"}, headers=H).json()["build"]
    assert build["status"] == "ready", build
    folder, _ = sites.live_folder(sites.get(sid)["subdomain"])
    return folder


def _media(sid, name, tags="", alt="", w=1200, h=800):
    return db.run("INSERT INTO media (site_id, kind, filename, stored, mime, bytes, width, height, alt, tags, created_at) "
                  "VALUES (?, 'image', ?, ?, 'image/webp', 1000, ?, ?, ?, ?, ?)", sid, name, name, w, h, alt, tags, db.now())


def _csp(c, sub, file):
    return c.get(f"/s/{sub}/{file}").headers["content-security-policy"]


# ---------------------------------------------------------------------------------------------- 1. galleries

def test_gallery_layouts_filters_and_lightbox(cms):
    c, sid = cms
    a = _media(sid, "cake.webp", tags="cakes, weddings", alt="A three-tier cake")
    b = _media(sid, "bread.webp", tags="bread", alt="Sourdough loaves")
    d = _media(sid, "tart.webp", tags="cakes", alt="Lemon tart")
    album = db.run("INSERT INTO albums (site_id, name, category, layout, created_at) VALUES (?, 'Weddings', 'events, cakes', 'grid', ?)", sid, db.now())
    album2 = db.run("INSERT INTO albums (site_id, name, category, layout, created_at) VALUES (?, 'Shop', 'shop', 'masonry', ?)", sid, db.now())
    for i, m in enumerate([a, d]):
        db.run("INSERT INTO album_items (album_id, media_id, caption, position) VALUES (?, ?, ?, ?)", album, m, f"Pic {i}", i)
    db.run("INSERT INTO album_items (album_id, media_id, caption, position) VALUES (?, ?, '', 0)", album2, b)
    # an old gallery block (album as a number, the template's settings) still works, in the album's own layout
    assert _put(c, sid, "index", [{"id": "g1", "type": "gallery", "data": {"heading": "Our cakes", "album": album, "lightbox": True}}]).status_code == 200
    html = c.get(f"/sites/{sid}/preview/index").text
    assert "tw-gal-grid" in html and "data-tw-lb" in html and 'alt="A three-tier cake"' in html and "Pic 0" in html
    assert "widgets/lightbox/lightbox.js" in html and "widgets/modkit/modkit.js" in html
    # several albums with filters by album; carousel
    _put(c, sid, "index", [{"id": "g1", "type": "gallery", "data": {"source": "albums", "filters": True, "layout": "carousel"}}])
    html = c.get(f"/sites/{sid}/preview/index").text
    assert 'data-tw-filter="Weddings"' in html and 'data-tw-filter="Shop"' in html and "data-tw-carousel" in html and "data-tw-prev" in html
    _put(c, sid, "index", [{"id": "g1", "type": "gallery", "data": {"source": "albums", "album_tag": "cakes"}}])
    assert "Sourdough" not in c.get(f"/sites/{sid}/preview/index").text
    # by Media Center tag; the chips are the other tags
    _put(c, sid, "index", [{"id": "g1", "type": "gallery", "data": {"source": "tag", "tag": "Cakes", "filters": True}}])
    html = c.get(f"/sites/{sid}/preview/index").text
    assert "Lemon tart" in html and "Sourdough" not in html and 'data-tw-filter="weddings"' in html
    # nothing to show: a hint in the CMS, nothing on the live site
    _put(c, sid, "index", [{"id": "g1", "type": "gallery", "data": {"source": "tag", "tag": "nope"}}])
    assert "Tag pictures in the Media Center" in c.get(f"/sites/{sid}/preview/index").text
    folder = _deploy(c, sid)
    assert "tw-gal" not in (folder / "index.html").read_text()


def test_video_gallery_parses_links_and_csp_is_per_page(cms):
    c, sid = cms
    from cms.widgets.video_gallery import parse
    assert parse("https://youtu.be/dQw4w9WgXcQ") == ("youtube", "dQw4w9WgXcQ")
    assert parse("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3") == ("youtube", "dQw4w9WgXcQ")
    assert parse("https://vimeo.com/76979871") == ("vimeo", "76979871")
    bad = _put(c, sid, "index", [{"id": "v1", "type": "video_gallery", "data": {"items": [{"title": "x", "url": "https://evil.example/v"}]}}])
    assert bad.status_code == 400
    r = _put(c, sid, "index", [{"id": "v1", "type": "video_gallery", "data": {"heading": "Watch", "youtube_thumbs": False, "items": [
        {"title": "Proofing dough", "url": "https://youtu.be/dQw4w9WgXcQ"}, {"title": "Decorating", "url": "https://vimeo.com/76979871"}]}}])
    assert r.status_code == 200, r.text
    html = c.get(f"/sites/{sid}/preview/index").text
    assert "youtube-nocookie.com/embed/dQw4w9WgXcQ" in html and "player.vimeo.com/video/76979871?autoplay=1&amp;dnt=1" in html
    assert "i.ytimg.com" not in html and "<iframe" not in html                       # nothing loads before play
    assert 'aria-label="Play video: Proofing dough"' in html
    _put(c, sid, "about", [{"id": "t1", "type": "text", "data": {"heading": "Hi", "body": "<p>Plain</p>"}}])
    folder = _deploy(c, sid)
    sub = sites.get(sid)["subdomain"]
    frames = next(d for d in _csp(c, sub, "index.html").split("; ") if d.startswith("frame-src"))
    assert "https://www.youtube-nocookie.com" in frames and "https://player.vimeo.com" in frames
    about = next(d for d in _csp(c, sub, "about.html").split("; ") if d.startswith("frame-src"))
    assert about == "frame-src 'self'"                                            # no video players where there are no videos
    # a YouTube iframe pasted in Custom HTML allows that host on its page only
    _put(c, sid, "about", [{"id": "h1", "type": "html", "data": {"html": '<iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"></iframe>'}}])
    _deploy(c, sid)
    assert "https://www.youtube-nocookie.com" in _csp(c, sub, "about.html")


def test_before_after_upgrade_keeps_old_blocks_and_adds_pairs(cms):
    c, sid = cms
    b1, a1 = _media(sid, "kitchen-before.webp", alt="Old kitchen"), _media(sid, "kitchen-after.webp", alt="New kitchen")
    b2, a2 = _media(sid, "bath-before.webp"), _media(sid, "bath-after.webp")
    _put(c, sid, "index", [{"id": "b1", "type": "before_after", "data": {"heading": "Kitchen", "before": b1, "after": a1, "caption": "Kitchen refit"}}])
    html = c.get(f"/sites/{sid}/preview/index").text
    assert 'type="range"' in html and 'aria-valuetext="50% before, 50% after"' in html and "Before: Old kitchen" in html
    _put(c, sid, "index", [{"id": "b1", "type": "before_after", "data": {"before": b1, "after": a1, "direction": "vertical", "start": 30,
                                                                        "before_label": "Then", "after_label": "Now",
                                                                        "more": [{"before": b2, "after": a2, "caption": "Bathroom"}]}}])
    html = c.get(f"/sites/{sid}/preview/index").text
    assert html.count("data-tw-ba") == 2 and "tw-ba-v" in html and "--pos:30%" in html and "30% then, 70% now" in html
    assert 'aria-orientation="vertical"' in html and "Bathroom" in html
    assert _put(c, sid, "index", [{"id": "b1", "type": "before_after", "data": {"start": 150}}]).status_code == 400


def test_secret_settings_are_masked_and_kept(cms):
    """Module keys (marked secret) never go back to the browser in full; saving the mask keeps the key."""
    c, sid = cms
    from pydantic import BaseModel, Field
    from markupsafe import Markup

    class S(BaseModel):
        api_key: str = Field("", json_schema_extra={"secret": True})
        name: str = ""
    w = widgets.register(widgets.Widget(name="secret_probe", label="Probe", about="", config=BaseModel, settings=S,
                                        render=lambda b, x: Markup(""), hidden=True))
    try:
        r = c.put(f"/api/sites/{sid}/widgets/secret_probe/settings", json={"api_key": "sk-live-123456789", "name": "a"}, headers=H)
        assert r.json()["settings"]["api_key"] == widgets.MASK + "6789"
        assert "sk-live" not in c.get(f"/api/sites/{sid}/widgets/secret_probe/settings").text
        assert "sk-live" not in c.get(f"/sites/{sid}/widgets/secret_probe").text
        c.put(f"/api/sites/{sid}/widgets/secret_probe/settings", json={"api_key": widgets.MASK + "6789", "name": "b"}, headers=H)
        assert widgets.load_settings(sid, "secret_probe").api_key == "sk-live-123456789"
        c.put(f"/api/sites/{sid}/widgets/secret_probe/settings", json={"api_key": "", "name": "b"}, headers=H)
        assert widgets.load_settings(sid, "secret_probe").api_key == ""
    finally:
        widgets.REGISTRY.pop("secret_probe", None)
