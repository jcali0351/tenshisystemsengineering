"""
Slice 2 of the client widget work: per-site security settings (extra allowed hosts, report-only) and the audit of
what pages load; theme tokens; the faq, pricing, map and booking widgets; HTML cleaning on save; page revisions;
the public form's rate limit. Throw-away data folder, like the other tests.
"""

import os
import sys
import tempfile
from pathlib import Path

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
os.environ.setdefault("TENSHI_DATA", tempfile.mkdtemp(prefix="tenshi-test-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from cms import auth, db, security, sites, templates, theme  # noqa: E402
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
        _user("s2-admin@example.com", "correct-horse-9", "admin")
        _login(c, "s2-admin@example.com", "correct-horse-9")
        tpl = templates.all_templates()[-1]["id"]          # a template no other test edits
        sid = c.post("/api/sites", json={"name": "Slice Two Bakery", "template": tpl}, headers=H).json()["site"]["id"]
        yield c, sid, tpl


# ---------------------------------------------------------------------------------------------- security

@pytest.mark.parametrize("typed, stored", [
    ("booking.example.com", ["booking.example.com"]),
    ("https://Widgets.Example.com/path?x=1\n*.cdn.example.net", ["widgets.example.com", "*.cdn.example.net"]),
    ("a.example.com, a.example.com", ["a.example.com"]),
])
def test_extra_hosts_accepted(typed, stored):
    assert security.SecuritySettings(extra_hosts=typed).extra_hosts == stored


@pytest.mark.parametrize("bad", ["*", "*.com", "not a host", "javascript:alert(1)", "exa_mple.com", "'unsafe-inline'", "localhost"])
def test_extra_hosts_refused(bad):
    with pytest.raises(ValueError):
        security.SecuritySettings(extra_hosts=bad)


def test_policy_matching():
    p = security.parse_policy("default-src 'self'; script-src 'self' https://*.example.com https://a.test; img-src https:")
    assert security.allows(p, "script-src", "https://x.example.com/a.js")
    assert not security.allows(p, "script-src", "https://example.com/a.js")
    assert security.allows(p, "script-src", "https://a.test/x")
    assert security.allows(p, "img-src", "https://anything.org/p.png")
    assert not security.allows(p, "frame-src", "https://evil.test/")       # falls back to default-src 'self'


def test_audit_extra_hosts_and_report_only(cms):
    c, sid, tpl = cms
    # an edited template that loads an outside script and stylesheet
    layout = templates.current_dir(tpl) / "layout.html.j2"
    original = layout.read_text(encoding="utf-8")
    layout.write_text(original.replace("</head>", '<script src="https://widgets.bakerytools.example/w.js"></script>'
                                                  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter"></head>'), encoding="utf-8")
    try:
        res = c.get(f"/api/sites/{sid}/security").json()
        assert "widgets.bakerytools.example" in res["blocked_hosts"] and "fonts.googleapis.com" in res["blocked_hosts"]
        assert any(f["tag"] == "script" and f["directive"] == "script-src" and not f["allowed"] for f in res["findings"])
        # bad host refused, good ones saved
        r = c.put(f"/api/sites/{sid}/security", json={"extra_hosts": "*.com"}, headers=H)
        assert r.status_code == 400 and "too broad" in r.json()["error"]
        r = c.put(f"/api/sites/{sid}/security", json={"extra_hosts": "widgets.bakerytools.example\nfonts.googleapis.com"}, headers=H)
        assert r.status_code == 200
        assert c.get(f"/api/sites/{sid}/security").json()["blocked_hosts"] == []
        # the live page's header carries them; report-only switches the header name
        c.post(f"/api/sites/{sid}/deploy", headers=H)
        sub = sites.get(sid)["subdomain"]
        h = c.get(f"/s/{sub}/").headers
        assert "https://widgets.bakerytools.example" in [d for d in h["content-security-policy"].split("; ") if d.startswith("script-src")][0]
        c.put(f"/api/sites/{sid}/security", json={"extra_hosts": [], "report_only": True}, headers=H)
        h = c.get(f"/s/{sub}/").headers
        assert "content-security-policy" not in h and "content-security-policy-report-only" in h
        assert "bakerytools" not in h["content-security-policy-report-only"]
        c.put(f"/api/sites/{sid}/security", json={"extra_hosts": [], "report_only": False}, headers=H)
        assert "content-security-policy" in c.get(f"/s/{sub}/").headers
    finally:
        layout.write_text(original, encoding="utf-8")


def test_security_permissions(cms):
    c, sid, _ = cms
    owner = _user("s2-owner@example.com", "correct-horse-8")
    _user("s2-editor@example.com", "correct-horse-7")
    with TestClient(app) as ed:
        _login(ed, "s2-editor@example.com", "correct-horse-7")
        assert ed.get(f"/api/sites/{sid}/security").status_code == 200            # anyone signed in can see the check
        assert ed.put(f"/api/sites/{sid}/security", json={"report_only": True}, headers=H).status_code == 403
    c.put(f"/api/sites/{sid}/members/{owner}", json={"role": "owner"}, headers=H)
    with TestClient(app) as ow:
        _login(ow, "s2-owner@example.com", "correct-horse-8")
        assert ow.put(f"/api/sites/{sid}/security", json={"extra_hosts": "cal.example.com"}, headers=H).status_code == 200
        assert 'id="extra-hosts"' in ow.get(f"/sites/{sid}/settings").text
    c.put(f"/api/sites/{sid}/security", json={}, headers=H)


def test_custom_html_cannot_load_outside_scripts(cms):
    """The reason existing Custom HTML blocks are safe under the policy: scripts and forms never reach the page."""
    c, sid, _ = cms
    page = db.one("SELECT * FROM pages WHERE site_id = ? AND slug = 'about'", sid)
    c.patch(f"/api/pages/{page['id']}", json={"blocks": [{"id": "h1", "type": "html", "data": {"html":
        '<script src="https://evil.example/x.js"></script><form action="https://evil.example/f"><input></form>'
        '<iframe src="https://evil.example/frame"></iframe><iframe src="https://www.youtube-nocookie.com/embed/abc"></iframe>'}}]}, headers=H)
    html = c.get(f"/sites/{sid}/preview/about").text
    assert "evil.example" not in html and "youtube-nocookie.com/embed/abc" in html
    blocked = c.get(f"/api/sites/{sid}/security").json()["blocked_hosts"]
    assert blocked == []


# ---------------------------------------------------------------------------------------------- theme tokens

def test_contrast_maths():
    assert theme.contrast("#000000", "#ffffff") == 21.0
    assert theme.contrast("#ffffff", "#ffffff") == 1.0
    assert theme.contrast("#777777", "#ffffff") < 4.5 < theme.contrast("#767676", "#ffffff")     # the classic AA edge


@pytest.mark.parametrize("pid", list(theme.PRESETS))
def test_presets_are_valid_and_pass_aa(pid):
    p = theme.PRESETS[pid]
    clean = theme.clean(p)
    assert clean["radius"] == p["radius"] and clean["space"] == p["space"]
    assert all(c["ok"] for c in theme.contrast_checks(p["colors"])), theme.contrast_checks(p["colors"])
    assert 4 <= len(theme.PRESETS) <= 6


@pytest.mark.parametrize("bad", [{"colors": {"primary": "red"}}, {"colors": {"ink": "#12345"}}, {"radius": 99},
                                 {"space": "huge"}, {"fonts": {"heading": "comic"}}, {"style": "grunge"}])
def test_theme_refuses_bad_values(cms, bad):
    c, sid, _ = cms
    r = c.post(f"/api/sites/{sid}/settings", json={"theme": bad}, headers=H)
    assert r.status_code == 400, r.text


def test_tokens_reach_pages_and_store(cms):
    c, sid, _ = cms
    assert c.post(f"/api/sites/{sid}/settings", json={"theme": {}}, headers=H).status_code == 200
    html = c.get(f"/sites/{sid}/preview/index").text
    assert '<style id="tenshi-tokens">' in html and "--radius" not in html          # template's own corners by default
    assert html.index('id="tenshi-tokens"') < html.lower().index("</head>")
    p = theme.PRESETS["forest"]
    assert c.post(f"/api/sites/{sid}/settings", json={"theme": {**p, "preset": "forest"}}, headers=H).status_code == 200
    html = c.get(f"/sites/{sid}/preview/index").text
    assert "--p: #1f5135;" in html and "--radius: 6px;" in html and "--space: 1.25;" in html
    assert "html:root .card" in html and "Georgia" in html
    css = (Path(__file__).parents[1] / "cms/static/widgets/store/store.css").read_text()
    assert "var(--radius, 14px)" in css                                                # the store follows the corners
    c.post(f"/api/sites/{sid}/settings", json={"theme": {}}, headers=H)


def test_live_preview_and_contrast_warning(cms):
    c, sid, _ = cms
    res = c.post(f"/api/sites/{sid}/theme/preview", json={"theme": {"colors": {"primary": "#fde68a"}, "radius": 20}}, headers=H).json()
    assert "--radius: 20px;" in res["css"] and "--p: #fde68a;" in res["css"]
    bad = {x["pair"] for x in res["checks"] if not x["ok"]}
    assert "#ffffff/primary" in bad and "primary/surface" in bad and "ink/surface" not in bad
    # unsaved: the page still has the template's colour
    assert "#fde68a" not in c.get(f"/sites/{sid}/preview/index").text


def test_brand_lock(cms):
    c, sid, _ = cms
    owner = _user("s2-brand-owner@example.com", "correct-horse-6")
    _user("s2-brand-editor@example.com", "correct-horse-5")
    c.put(f"/api/sites/{sid}/members/{owner}", json={"role": "owner"}, headers=H)
    with TestClient(app) as ow, TestClient(app) as ed:
        _login(ow, "s2-brand-owner@example.com", "correct-horse-6")
        _login(ed, "s2-brand-editor@example.com", "correct-horse-5")
        assert ed.put(f"/api/sites/{sid}/brand", json={"locked": True}, headers=H).status_code == 403
        assert ed.post(f"/api/sites/{sid}/settings", json={"theme": {"radius": 4}}, headers=H).status_code == 200   # not locked yet
        assert ow.put(f"/api/sites/{sid}/brand", json={"locked": True}, headers=H).json() == {"locked": True}
        r = ed.post(f"/api/sites/{sid}/settings", json={"theme": {"radius": 8}}, headers=H)
        assert r.status_code == 403 and "locked" in r.text
        assert ed.post(f"/api/sites/{sid}/settings", json={"theme": {"radius": 4, "lang": "ja"}}, headers=H).status_code == 200  # language isn't brand
        assert ow.post(f"/api/sites/{sid}/settings", json={"theme": {"radius": 8}}, headers=H).status_code == 200
        assert c.post(f"/api/sites/{sid}/settings", json={"theme": {}}, headers=H).status_code == 200             # admins too
        page = ed.get(f"/sites/{sid}/settings").text
        assert '"locked": true' in page and '"can_edit": false' in page
    c.put(f"/api/sites/{sid}/brand", json={"locked": False}, headers=H)


# ---------------------------------------------------------------------------------------------- faq, pricing, map, booking

def _put_blocks(c, sid, slug, blocks):
    page = db.one("SELECT * FROM pages WHERE site_id = ? AND slug = ?", sid, slug)
    return c.patch(f"/api/pages/{page['id']}", json={"blocks": blocks}, headers=H)


def test_new_widgets_in_builder():
    from cms import widgets
    types = widgets.block_types()
    for name in ("faq", "pricing", "map", "booking"):
        assert name in types and types[name]["widget"]
    tiers = next(f for f in types["pricing"]["fields"] if f["name"] == "tiers")
    assert tiers["type"] == "items" and tiers["max"] == 6 and tiers["item_label"] == "Tier"
    assert [f["name"] for f in tiers["fields"]][:3] == ["name", "price", "period"]
    assert next(f for f in tiers["fields"] if f["name"] == "button_link")["type"] == "link"
    faq_items = next(f for f in types["faq"]["fields"] if f["name"] == "items")
    assert faq_items["type"] == "items" and {"question", "answer"} == set(faq_items["item"])


def test_faq_accordion_and_json_ld(cms):
    import json as _json
    import re as _re
    c, sid, _ = cms
    r = _put_blocks(c, sid, "about", [{"id": "f1", "type": "faq", "data": {"heading": "FAQ", "items": [
        {"question": "Do you work weekends?", "answer": "Yes.\n\nSaturdays 9-1."},
        {"question": "Is </script><b>x</b> safe?", "answer": "It is & stays text."}]}}])
    assert r.status_code == 200, r.text
    html = c.get(f"/sites/{sid}/preview/about").text
    assert html.count('<details class="tw-faq-item"') == 2 and "<p>Saturdays 9-1.</p>" in html
    assert "<b>x</b>" not in html and "&lt;/script&gt;&lt;b&gt;x&lt;/b&gt;" in html
    ld = _re.search(r'<script type="application/ld\+json">(.*?)</script>', html, _re.S).group(1)
    data = _json.loads(ld)
    assert data["@type"] == "FAQPage" and data["mainEntity"][1]["name"] == "Is </script><b>x</b> safe?"
    assert "faq/faq.css" in html


def test_pricing_tiers_and_links(cms):
    c, sid, _ = cms
    r = _put_blocks(c, sid, "about", [{"id": "p1", "type": "pricing", "data": {"tiers": [
        {"name": "Basic", "price": "$10", "features": "- One\n- Two", "button_link": "contact"},
        {"name": "Pro", "price": "$20", "highlight": True, "button_link": "https://example.com/buy"}]}}])
    assert r.status_code == 200, r.text
    html = c.get(f"/sites/{sid}/preview/about").text
    assert html.count('<li class="tw-tier') == 2 and "tw-tier-hot" in html and "Most popular" in html
    assert "<li>One</li><li>Two</li>" in html and f"/sites/{sid}/preview/contact" in html and "https://example.com/buy" in html
    bad = _put_blocks(c, sid, "about", [{"id": "p1", "type": "pricing", "data": {"tiers": [{"button_link": "javascript:alert(1)"}]}}])
    assert bad.status_code == 400
    too_many = _put_blocks(c, sid, "about", [{"id": "p1", "type": "pricing", "data": {"tiers": [{}] * 7}}])
    assert too_many.status_code == 400


def test_map_google_osm_and_business_address(cms):
    c, sid, _ = cms
    _put_blocks(c, sid, "about", [{"id": "m1", "type": "map", "data": {"address": "10 Downing St, London"}}])
    html = c.get(f"/sites/{sid}/preview/about").text
    assert "https://www.google.com/maps?q=10+Downing+St%2C+London&amp;z=15&amp;output=embed" in html
    _put_blocks(c, sid, "about", [{"id": "m1", "type": "map", "data": {"provider": "openstreetmap", "latitude": "51.5034", "longitude": "-0.1276", "zoom": 16}}])
    html = c.get(f"/sites/{sid}/preview/about").text
    assert "https://www.openstreetmap.org/export/embed.html?bbox=" in html and "marker=51.5034,-0.1276" in html
    assert _put_blocks(c, sid, "about", [{"id": "m1", "type": "map", "data": {"latitude": "123"}}]).status_code == 400
    # no address typed: the business address
    prof = db.j(sites.get(sid)["profile_json"]) or {}
    prof.setdefault("company", {})["address"] = "1 Baker Street, Springfield"
    db.run("UPDATE sites SET profile_json = ? WHERE id = ?", db.dumps(prof), sid)
    _put_blocks(c, sid, "about", [{"id": "m1", "type": "map", "data": {}}])
    assert "q=1+Baker+Street%2C+Springfield" in c.get(f"/sites/{sid}/preview/about").text


def test_booking_host_only_on_its_page(cms, tmp_path):
    from cms import render, widgets
    c, sid, _ = cms
    assert _put_blocks(c, sid, "about", [{"id": "b1", "type": "booking", "data": {"url": "http://calendly.com/x"}}]).status_code == 400
    assert _put_blocks(c, sid, "about", [{"id": "b1", "type": "booking", "data": {"url": "javascript:alert(1)"}}]).status_code == 400
    assert _put_blocks(c, sid, "about", [{"id": "b1", "type": "booking", "data": {
        "url": "https://calendly.com/neon/30min", "display": "embed"}}]).status_code == 200
    html = c.get(f"/sites/{sid}/preview/about").text
    assert '<iframe src="https://calendly.com/neon/30min"' in html
    render.build_to(sites.get(sid), tmp_path)
    about = widgets.csp_for_file(tmp_path, "about.html")
    home = widgets.csp_for_file(tmp_path, "index.html")
    assert "https://calendly.com" in about.split("frame-src")[1].split(";")[0]
    assert "calendly.com" not in home
    # a button needs no policy change
    _put_blocks(c, sid, "about", [{"id": "b1", "type": "booking", "data": {"url": "https://calendly.com/neon/30min"}}])
    out2 = tmp_path / "again"
    render.build_to(sites.get(sid), out2)
    assert "calendly.com" not in widgets.csp_for_file(out2, "about.html")
    assert 'class="btn" href="https://calendly.com/neon/30min"' in (out2 / "about.html").read_text()
    _put_blocks(c, sid, "about", [])
