"""
The visual editor: the Columns block (content areas side by side, edited in place) and the builder screen's
Photos tab, undo/redo and drag-and-drop helpers. Throw-away data folder, like the other tests.
"""

import os
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
os.environ.setdefault("TENSHI_DATA", tempfile.mkdtemp(prefix="tenshi-test-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from cms import auth, db, sites, templates, widgets  # noqa: E402
from cms.app import app  # noqa: E402

H = {"X-Tenshi": "1"}


@pytest.fixture(scope="module")
def cms():
    with TestClient(app) as c:
        if not db.one("SELECT id FROM users WHERE email = ?", "ed-admin@example.com"):
            auth.create_user("ed-admin@example.com", "Ed", "correct-horse-9", "admin")
        r = c.post("/login", data={"email": "ed-admin@example.com", "password": "correct-horse-9", "next": "/"}, follow_redirects=False)
        assert r.status_code == 303
        tpl = templates.all_templates()[0]["id"]
        sid = c.post("/api/sites", json={"name": "Editor Test Farm", "template": tpl}, headers=H).json()["site"]["id"]
        yield c, sid


def _page(sid, slug="about"):
    return db.one("SELECT * FROM pages WHERE site_id = ? AND slug = ?", sid, slug)


def test_columns_is_offered_first_among_widgets():
    types = widgets.block_types()
    assert "columns" in types
    f = {x["name"]: x for x in types["columns"]["fields"]}
    assert f["areas"]["type"] == "items" and {s["name"] for s in f["areas"]["fields"]} >= {"image", "heading", "text", "button_text"}


def test_columns_saves_clean_and_draws_editable(cms):
    c, sid = cms
    page = _page(sid)
    blocks = [{"id": "col1", "type": "columns", "data": {"heading": "Why us", "areas": [
        {"heading": "Fast", "text": '<p onclick="x()">Quick <b>work</b><script>alert(1)</script></p>', "button_text": "Call", "button_link": "contact"},
        {"heading": "Fair", "text": "<p>Fair prices</p>"}]}}]
    r = c.patch(f"/api/pages/{page['id']}", json={"blocks": blocks}, headers=H)
    assert r.status_code == 200, r.text
    saved = db.j(_page(sid)["blocks_json"])[0]["data"]
    assert saved["areas"][0]["text"] == "<p>Quick <b>work</b></p>"
    assert len(saved["areas"]) == 2
    bad = [{"id": "col2", "type": "columns", "data": {"areas": [{"button_link": "javascript:alert(1)"}]}}]
    assert c.patch(f"/api/pages/{page['id']}", json={"blocks": bad}, headers=H).status_code == 400
    too_many = [{"id": "col3", "type": "columns", "data": {"areas": [{}] * 5}}]
    assert c.patch(f"/api/pages/{page['id']}", json={"blocks": too_many}, headers=H).status_code == 400
    c.patch(f"/api/pages/{page['id']}", json={"blocks": blocks}, headers=H)
    html = c.get(f"/sites/{sid}/preview/about?edit=1").text
    assert 'data-edit="areas.0.heading"' in html and 'data-edit="areas.1.text" data-rich' in html
    assert 'data-media="areas.0.image"' in html and "Drop a photo here" in html
    assert "tw-cols-2" in html and "/static/widgets/columns/columns.css" in html and "bridge.js" in html
    plain = c.get(f"/sites/{sid}/preview/about").text
    assert "Drop a photo here" not in plain and "Quick <b>work</b>" in plain


def test_columns_publishes(cms):
    c, sid = cms
    build = c.post(f"/api/sites/{sid}/deploy", json={"note": "editor test"}, headers=H).json()["build"]
    assert build["status"] == "ready", build
    folder, _ = sites.live_folder(sites.get(sid)["subdomain"])
    about = (folder / "about.html").read_text(encoding="utf-8")
    assert "tw-columns" in about and "widgets/columns/columns.css" in about and "data-edit" in about  # harmless markers
    assert (folder / "widgets" / "columns" / "columns.css").is_file()
    assert "Drop a photo here" not in about and "contenteditable" not in about


def test_builder_has_photos_tab_undo_and_drag_text(cms):
    c, sid = cms
    html = c.get(f"/sites/{sid}/builder/{_page(sid)['id']}").text
    assert 'id="photo-grid"' in html and 'id="undo"' in html and 'id="redo"' in html and 'data-tab="photos"' in html
    assert 'data-kind="columns"' in html
    js = c.get("/static/builder.js").text
    assert "application/x-tenshi-block" in js and "applyMedia" in js and "setPath" in js
    bridge = c.get("/static/bridge.js").text
    assert "tb-fmt" in bridge and "application/x-tenshi-media" in bridge and "tb-tools" in bridge
