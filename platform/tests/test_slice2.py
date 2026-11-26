"""
Slice 2 of the client widget work: per-site security settings (extra allowed hosts, report-only) and the audit of
what pages load; theme tokens; the faq, pricing, map and booking widgets; HTML cleaning on save; page revisions;
the public form's rate limit. Throw-away data folder, like the other tests.
"""

import os
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
os.environ.setdefault("TENSHI_DATA", tempfile.mkdtemp(prefix="tenshi-test-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from cms import auth, db, security, sites, templates  # noqa: E402
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
