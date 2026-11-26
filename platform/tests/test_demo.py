"""
DB-39: the six public demo sites (cms/demo_sites.py) and the "Try the CMS" sandbox with its restricted demo role
(cms/sandbox.py). Throw-away data folder; nothing is emailed or posted (mail and webhooks are replaced).
"""

import json
import os
import re
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
os.environ.setdefault("TENSHI_DATA", tempfile.mkdtemp(prefix="tenshi-test-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from cms import ai_assist, auth, config, db, demo_sites, mail, modcache, notify, sandbox, sites, widgets  # noqa: E402
from cms.app import app  # noqa: E402

H = {"X-Tenshi": "1"}


def _login(c, email, password):
    return c.post("/login", data={"email": email, "password": password, "next": "/"}, follow_redirects=False)


@pytest.fixture(scope="module")
def demo():
    with TestClient(app) as c:
        if not db.one("SELECT id FROM users WHERE email = ?", "demo-admin@example.com"):
            auth.create_user("demo-admin@example.com", "Admin", "correct-horse-9", "admin")
        assert _login(c, "demo-admin@example.com", "correct-horse-9").status_code == 303
        other = c.post("/api/sites", json={"name": "Real Client Co", "template": "corporate"}, headers=H).json()["site"]["id"]
        made = demo_sites.seed_all()
        assert set(made) == set(demo_sites.DEMOS) | {demo_sites.SANDBOX}
        sandbox.demo_user()
        yield c, other


def _sid(sub):
    return db.one("SELECT id FROM sites WHERE subdomain = ?", sub)["id"]


def _host(sub):
    return {"host": f"{sub}.{config.SITES_DOMAIN}"}


# ---------------------------------------------------------------------------------------------- the demo sites

def test_six_demo_sites_are_full_varied_and_labelled(demo):
    c, _ = demo
    clear = {m["file"].split("/")[-1].rsplit(".", 1)[0] for m in demo_sites._manifest() if m["license"].startswith(demo_sites.CLEAR_LICENCES)}
    themes = set()
    for sub in demo_sites.DEMOS:
        sid = _sid(sub)
        site = sites.get(sid)
        assert demo_sites.is_demo(sid) and site["status"] == "live"
        pages = db.all("SELECT slug FROM pages WHERE site_id = ? AND in_menu = 1", sid)
        assert len(pages) >= 5, sub
        theme = json.loads(site["theme_json"])
        themes.add((theme["preset"], theme["colors"]["accent"], theme["fonts"]["heading"]))
        assert theme["toggle"] and theme["mode"] in ("light", "dark")
        home = c.get("/", headers=_host(sub)).text
        assert "Demo site by Tenshi Systems" in home and 'name="robots" content="noindex"' in home and "Madison" in home
        for p in pages:
            html = c.get(f"/{'' if p['slug'] == 'index' else p['slug'] + '.html'}", headers=_host(sub)).text
            text = re.sub(r"<script.*?</script>", "", html, flags=re.S)
            assert not re.findall(r"\[[A-Za-z][^\]<>\"]{0,50}\]", text), (sub, p["slug"])     # no starter placeholders left
            assert "tw-demo-ribbon" in html
        for m in db.all("SELECT filename FROM media WHERE site_id = ?", sid):           # only clear-origin stock photos
            assert m["filename"].rsplit(".", 1)[0] in clear, (sub, m["filename"])
    assert len(themes) == 6
    modes = {json.loads(sites.get(_sid(s))["theme_json"])["mode"] for s in demo_sites.DEMOS}
    assert modes == {"light", "dark"}


def test_each_demo_shows_its_modules(demo):
    c, _ = demo
    want = {"demo-cafe": ["price_list", "appointments", "events", "gallery", "map", "contact_form", "hours", "newsletter"],
            "demo-salon": ["appointments", "price_list", "testimonials"],
            "demo-contractor": ["before_after", "contact_form", "case_studies"],
            "demo-retail": ["store"],
            "demo-law": ["team", "faq", "contact_form", "locations"],
            "demo-nonprofit": ["events", "newsletter"]}
    for sub, kinds in want.items():
        used = {b["type"] for p in db.all("SELECT blocks_json FROM pages WHERE site_id = ?", _sid(sub)) for b in json.loads(p["blocks_json"])}
        assert set(kinds) <= used, (sub, set(kinds) - used)
    assert widgets.load_settings(_sid("demo-retail"), "store") is None or widgets.load_settings(_sid("demo-retail"), "store").mode == "demo"
    donate = c.get("/donate.html", headers=_host("demo-nonprofit")).text
    assert "not live" in donate and "no money" in donate.lower()
    assert "Sample review" in c.get("/", headers=_host("demo-salon")).text


def test_seed_is_idempotent_and_reset_starts_fresh(demo):
    n = db.one("SELECT COUNT(*) AS n FROM sites")["n"]
    assert demo_sites.seed_all() == [] and db.one("SELECT COUNT(*) AS n FROM sites")["n"] == n
    old = _sid("demo-salon")
    db.run("INSERT INTO leads (site_id, page, data_json, created_at) VALUES (?, 'contact', '{}', ?)", old, db.now())
    new = demo_sites.reset("demo-salon")
    assert new != old and not db.one("SELECT 1 FROM leads WHERE site_id IN (?, ?)", old, new) and demo_sites.is_demo(new)
    with pytest.raises(ValueError):
        rc = db.one("SELECT subdomain FROM sites WHERE name = 'Real Client Co'")["subdomain"]
        demo_sites.reset(rc)                              # never deletes a real client's site


def test_demo_sites_never_email_or_post(demo, monkeypatch):
    c, _ = demo
    sid = _sid("demo-cafe")
    site = sites.get(sid)
    sent = []
    monkeypatch.setattr(mail, "configured", lambda: True)
    monkeypatch.setattr(mail, "_send", lambda msg: sent.append(msg))
    monkeypatch.setenv("TENSHI_MAIL_TEST", "1")
    assert notify.lead_received(site, 1, "Contact", {"email": "a@example.com"}) == "demo"
    assert mail.simple(site, "a@example.com", "Hi", "Body") is False and sent == []
    # newsletter: even with provider keys saved, a demo site keeps sign-ups as leads and calls nobody
    widgets.save_settings(sid, "newsletter", {"provider": "resend", "resend_key": "re_x", "resend_audience": "aud-1"}, {"role": "admin", "id": 1})
    monkeypatch.setattr(modcache, "http_json", lambda *a, **k: (_ for _ in ()).throw(AssertionError("no outside calls on demos")))
    from cms import ratelimit
    monkeypatch.setattr(ratelimit, "PER_IP", 1000)
    page = next(p for p in db.all("SELECT * FROM pages WHERE site_id = ?", sid) if '"newsletter"' in p["blocks_json"])
    uid = next(b["id"] for b in json.loads(page["blocks_json"]) if b["type"] == "newsletter")
    before = db.one("SELECT COUNT(*) AS n FROM leads WHERE site_id = ?", sid)["n"]
    r = c.post("/__w/newsletter/subscribe", data={"_block": f"{page['slug']}/{uid}", "email": "fan@example.com"}, headers={**_host("demo-cafe"), "accept": "application/json"})
    assert r.json()["ok"] and db.one("SELECT COUNT(*) AS n FROM leads WHERE site_id = ?", sid)["n"] == before + 1
    # auto-post: nothing suggested, approving refuses
    widgets.save_settings(sid, "autopost", {"enabled": True, "webhook_url": "https://hooks.example.com/x"}, {"role": "admin", "id": 1})
    from cms.widgets import autopost
    assert autopost.suggest(site) == 0
    with pytest.raises(ValueError):
        autopost._on_status(site, {"status": "pending", "id": 1, "text": "", "url": "", "title": ""}, "approved", None)
    # AI assist never runs on demos, even with a server key
    monkeypatch.setenv("TENSHI_AI_KEY", "server-key")
    assert not ai_assist.available(sid) and ai_assist.available(None) is True


# ---------------------------------------------------------------------------------------------- the sandbox

@pytest.fixture()
def visitor(demo):
    sandbox._hits.clear()
    with TestClient(app) as v:
        r = v.get("/demo/start", follow_redirects=False)
        assert r.status_code == 303
        yield v, r.headers["location"]


def test_try_the_cms_lands_in_the_sandbox_builder(visitor, demo):
    v, where = visitor
    sb = demo_sites.sandbox_id()
    assert where.startswith(f"/sites/{sb}/builder/")
    page = v.get(where)
    assert page.status_code == 200 and "Sandbox" in page.text and "Publish" in page.text
    assert "Real Client Co" not in page.text and "Hartwell" not in page.text            # no other sites in the menu
    assert v.get("/", follow_redirects=False).headers["location"] == f"/sites/{sb}"
    assert v.get("/sites", follow_redirects=False).headers["location"] == f"/sites/{sb}"


def test_demo_role_cannot_reach_anything_else(visitor, demo):
    v, _ = visitor
    _, other = demo
    sb = demo_sites.sandbox_id()
    cafe = _sid("demo-cafe")
    for path in [f"/sites/{other}", f"/sites/{cafe}", f"/sites/{other}/builder/1", "/users", "/templates", f"/sites/{sb}/settings",
                 f"/sites/{sb}/widgets/store", f"/sites/{sb}/widgets/newsletter", f"/sites/{sb}/export", f"/api/sites/{sb}/widgets/store/settings",
                 f"/api/sites/{sb}/lead-email", f"/api/sites/{sb}/domains", f"/api/sites/{sb}/members", f"/api/sites/{sb}/security",
                 f"/sites/{other}/preview/index", f"/m/{other}/x.webp", f"/backups/1/download"]:
        assert v.get(path, follow_redirects=False).status_code == 403, path
    other_page = db.one("SELECT id FROM pages WHERE site_id = ?", other)["id"]
    cafe_media = db.one("SELECT id FROM media WHERE site_id = ?", cafe)["id"]
    for method, path, body in [("POST", "/api/users", {"email": "x@example.com", "name": "x", "password": "longpassword", "role": "admin"}),
                               ("POST", "/api/sites", {"name": "Spam", "template": "corporate"}), ("DELETE", f"/api/sites/{sb}", None),
                               ("PUT", f"/api/sites/{sb}/widgets/newsletter/settings", {"provider": "resend"}), ("PUT", f"/api/sites/{sb}/lead-email", {"to": "x@example.com"}),
                               ("POST", f"/api/sites/{sb}/domains", {"domain": "evil.example"}), ("PUT", f"/api/sites/{sb}/members/1", {"role": "owner"}),
                               ("POST", "/api/stock", None), ("PATCH", f"/api/pages/{other_page}", {"blocks": []}), ("DELETE", f"/api/media/{cafe_media}", None),
                               ("POST", f"/api/sites/{sb}/ai/write", {"text": "x", "action": "improve"}), ("POST", f"/api/sites/{other}/deploy", {}),
                               ("POST", f"/api/sites/{sb}/clone", {"name": "x"}), ("POST", f"/api/sites/{sb}/backup", {}), ("POST", "/api/demo/reset", {}),
                               ("POST", f"/api/sites/{sb}/status/offline", {})]:
        r = v.request(method, path, json=body, headers=H)
        assert r.status_code == 403, (method, path, r.status_code)
    assert db.one("SELECT 1 FROM sites WHERE name = 'Spam'") is None


def test_demo_role_can_edit_and_publish_the_sandbox(visitor):
    v, _ = visitor
    sb = demo_sites.sandbox_id()
    page = db.one("SELECT * FROM pages WHERE site_id = ? AND slug = 'about'", sb)
    blocks = json.loads(page["blocks_json"])
    blocks[0]["data"]["heading"] = "Edited in the sandbox"
    assert v.patch(f"/api/pages/{page['id']}", json={"blocks": blocks}, headers=H).status_code == 200
    assert "Edited in the sandbox" in v.get(f"/sites/{sb}/preview/about").text
    r = v.post(f"/api/sites/{sb}/deploy", json={"note": "demo"}, headers=H)
    assert r.status_code == 200 and r.json()["url"] == f"/sites/{sb}/preview/index"
    # ... but the sandbox is never a public website
    pub = TestClient(app).get("/about.html", headers=_host(demo_sites.SANDBOX))
    assert pub.status_code == 404 and "sandbox" in pub.text.lower() and "Edited in the sandbox" not in pub.text
    # its uploads aren't public either
    m = db.one("SELECT stored FROM media WHERE site_id = ?", sb)["stored"]
    assert TestClient(app).get(f"/m/{sb}/{m}").status_code == 404 and v.get(f"/m/{sb}/{m}").status_code == 200
    # the inbox approvals that need an owner stay closed (reviews / social posts)
    row = db.run("INSERT INTO social_posts (site_id, ref, title, url, text, status, result, created_at) VALUES (?, 'x', 't', 'u', 'x', 'pending', '', ?)", sb, db.now())
    assert v.patch(f"/api/sites/{sb}/inbox/social/{row}", json={"status": "approved"}, headers=H).status_code == 403


def test_demo_password_login_session_expiry_and_rate_limits(demo, monkeypatch):
    sandbox._hits.clear()
    with TestClient(app) as v:
        assert _login(v, sandbox.DEMO_EMAIL, "anything-at-all").status_code == 401
        monkeypatch.setattr(sandbox, "SESSION_MINUTES", -1)
        assert v.get("/demo/start", follow_redirects=False).status_code == 303
        r = v.get(f"/sites/{demo_sites.sandbox_id()}", follow_redirects=False)
        assert r.status_code == 303 and r.headers["location"] == "/demo/ended"
        assert v.get(f"/sites/{demo_sites.sandbox_id()}", follow_redirects=False).headers["location"].startswith("/login")
    monkeypatch.setattr(sandbox, "START_PER_IP", 2)
    sandbox._hits.clear()
    with TestClient(app) as v:
        codes = [v.get("/demo/start", follow_redirects=False).status_code for _ in range(3)]
    assert codes == [303, 303, 429]
    monkeypatch.setattr(sandbox, "SESSION_MINUTES", 120)
    monkeypatch.setattr(sandbox, "START_PER_IP", 6)
    monkeypatch.setattr(sandbox, "WRITES_PER_IP", 1)
    sandbox._hits.clear()
    with TestClient(app) as v:
        v.get("/demo/start")
        sb = demo_sites.sandbox_id()
        page = db.one("SELECT * FROM pages WHERE site_id = ? AND slug = 'about'", sb)
        body = {"blocks": json.loads(page["blocks_json"])}
        assert v.patch(f"/api/pages/{page['id']}", json=body, headers=H).status_code == 200
        assert v.patch(f"/api/pages/{page['id']}", json=body, headers=H).status_code == 429


def test_admin_reset_button(demo, monkeypatch):
    c, _ = demo
    called = []
    monkeypatch.setattr(sandbox, "reset_everything", lambda: called.append(1))
    assert "Reset demo sites" in c.get("/sites").text
    assert c.post("/api/demo/reset", json={}, headers=H).json()["ok"]
    time.sleep(0.2)
    assert called == [1]
