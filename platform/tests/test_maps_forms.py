"""
The Google Maps widget (several places, the site's optional API key, Google's hosts only on map pages) and the form
builder (field types, file uploads kept out of the web root, presets, leads detail and CSV, notifications).
Throw-away data folder, like the other tests.
"""

import os
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
os.environ.setdefault("TENSHI_DATA", tempfile.mkdtemp(prefix="tenshi-test-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from cms import auth, db, render, sites, templates, widgets  # noqa: E402
from cms.app import app  # noqa: E402

H = {"X-Tenshi": "1"}
FAKE_KEY = "AIza" + "x" * 30 + "Test5"          # built here so no key-shaped string sits in git


def _login(c, email, password):
    r = c.post("/login", data={"email": email, "password": password, "next": "/"}, follow_redirects=False)
    assert r.status_code == 303, r.text


def _user(email, pw, role="editor"):
    row = db.one("SELECT id FROM users WHERE email = ?", email)
    return row["id"] if row else auth.create_user(email, email.split("@")[0], pw, role)


@pytest.fixture(scope="module")
def cms():
    with TestClient(app) as c:
        _user("mf-admin@example.com", "correct-horse-9", "admin")
        _login(c, "mf-admin@example.com", "correct-horse-9")
        tpl = templates.all_templates()[0]["id"]
        sid = c.post("/api/sites", json={"name": "Maps Forms Bakery", "template": tpl}, headers=H).json()["site"]["id"]
        yield c, sid


def _put_blocks(c, sid, slug, blocks):
    page = db.one("SELECT * FROM pages WHERE site_id = ? AND slug = ?", sid, slug)
    return c.patch(f"/api/pages/{page['id']}", json={"blocks": blocks}, headers=H)


def _frame_src(csp):
    return csp.split("frame-src")[1].split(";")[0]


# ---------------------------------------------------------------------------------------------- A. maps

def test_map_several_places_directions_and_lazy(cms):
    c, sid = cms
    r = _put_blocks(c, sid, "about", [{"id": "m1", "type": "map", "data": {"address": "1 Main St, Austin TX", "places": [
        {"name": "North shop", "address": "9 Oak Ave, Austin TX"}, {"name": "", "address": ""}]}}])
    assert r.status_code == 200, r.text
    html = c.get(f"/sites/{sid}/preview/about").text
    assert 'loading="lazy"' in html and "data-tw-map-frame" in html
    assert html.count('class="tw-map-place"') == 2                         # the empty place is skipped
    assert "https://www.google.com/maps/dir/?api=1&amp;destination=9+Oak+Ave%2C+Austin+TX" in html
    assert ">Get directions</a>" in html and "map.js" in html
    assert "maps.googleapis.com" not in html                               # no key, no JS API
    _put_blocks(c, sid, "about", [{"id": "m1", "type": "map", "data": {"address": "1 Main St", "directions_button": False, "directions_link": False}}])
    html = c.get(f"/sites/{sid}/preview/about").text
    assert "Get directions" not in html and "Open in maps" not in html
    assert _put_blocks(c, sid, "about", [{"id": "m1", "type": "map", "data": {"places": [{"latitude": "99"}]}}]).status_code == 400
    assert _put_blocks(c, sid, "about", [{"id": "m1", "type": "map", "data": {"places": [{"address": "x"}] * 13}}]).status_code == 400


def test_map_key_admin_only_and_js_api(cms):
    c, sid = cms
    assert c.put(f"/api/sites/{sid}/widgets/map/settings", json={"api_key": "not-a-key"}, headers=H).status_code == 400
    r = c.put(f"/api/sites/{sid}/widgets/map/settings", json={"api_key": FAKE_KEY, "style": "dark"}, headers=H)
    assert r.status_code == 200, r.text
    _put_blocks(c, sid, "about", [{"id": "m1", "type": "map", "data": {"address": "1 Main St</script><b>", "places": [{"name": "B", "latitude": "30.1", "longitude": "-97.7"}]}}])
    html = c.get(f"/sites/{sid}/preview/about").text
    assert "data-tw-map-config" in html and FAKE_KEY in html and '"style": "dark"' in html
    assert "1 Main St</script>" not in html.split("data-tw-map-config")[1].split("</script>")[0]  # escaped inside the JSON
    # an editor (not an owner) can't change it
    _user("mf-editor@example.com", "correct-horse-9")
    uid = db.one("SELECT id FROM users WHERE email = ?", "mf-editor@example.com")["id"]
    db.run("INSERT OR IGNORE INTO site_members (site_id, user_id, role) VALUES (?, ?, 'editor')", sid, uid)
    with TestClient(app) as ed:
        _login(ed, "mf-editor@example.com", "correct-horse-9")
        assert ed.put(f"/api/sites/{sid}/widgets/map/settings", json={"api_key": ""}, headers=H).status_code == 403
        assert "Only this site's owners" in ed.get(f"/sites/{sid}/widgets/map").text
    assert c.get(f"/sites/{sid}/widgets/map").status_code == 200


def test_google_hosts_only_on_map_pages(cms, tmp_path):
    c, sid = cms
    assert "www.google.com" not in _frame_src(widgets.csp_for([]))         # not in the base policy any more
    _put_blocks(c, sid, "index", [{"id": "h1", "type": "text", "data": {"heading": "Hi", "body": "Hello"}}])
    _put_blocks(c, sid, "about", [{"id": "m1", "type": "map", "data": {"address": "1 Main St"}}])
    _put_blocks(c, sid, "services", [{"id": "x1", "type": "html", "data": {
        "html": '<iframe src="https://www.google.com/maps/embed?pb=abc" loading="lazy"></iframe>'}}])
    c.put(f"/api/sites/{sid}/widgets/map/settings", json={"api_key": FAKE_KEY}, headers=H)
    render.build_to(sites.get(sid), tmp_path)
    home, about, services = (widgets.csp_for_file(tmp_path, f) for f in ("index.html", "about.html", "services.html"))
    assert "google" not in home and "openstreetmap" not in home
    assert "https://www.google.com" in _frame_src(about)
    assert "https://maps.googleapis.com" in about.split("script-src")[1].split(";")[0]
    assert "https://www.google.com" in _frame_src(services) and "maps.googleapis.com" not in services
    # no key: just the frame host
    c.put(f"/api/sites/{sid}/widgets/map/settings", json={"api_key": ""}, headers=H)
    out2 = tmp_path / "nokey"
    render.build_to(sites.get(sid), out2)
    about = widgets.csp_for_file(out2, "about.html")
    assert "https://www.google.com" in _frame_src(about) and "maps.googleapis.com" not in about
    # OpenStreetMap
    _put_blocks(c, sid, "about", [{"id": "m1", "type": "map", "data": {"provider": "openstreetmap", "latitude": "51.5", "longitude": "-0.12"}}])
    out3 = tmp_path / "osm"
    render.build_to(sites.get(sid), out3)
    assert "https://www.openstreetmap.org" in _frame_src(widgets.csp_for_file(out3, "about.html"))
