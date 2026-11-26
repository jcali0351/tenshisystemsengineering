"""
The Stock Photo Library (cms/stock.py, cms/stock_routes.py): upload checks, who may do what, tag and category filters,
copying a photo into a site from the builder's picker, and an idempotent seed. Run from the platform folder:

    .venv\\Scripts\\python -m pytest tests -q

Uses a throw-away data folder and a tiny throw-away seed, so real cms_data and the real seed are never touched.
"""

import io
import json
import os
import sys
import tempfile
from pathlib import Path

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
os.environ.setdefault("TENSHI_DATA", tempfile.mkdtemp(prefix="tenshi-test-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from PIL import Image  # noqa: E402

from cms import auth, db, stock  # noqa: E402
from cms.app import app  # noqa: E402

H = {"X-Tenshi": "1"}


def picture(fmt="JPEG", w=3000, h=2000, color=(40, 140, 90)):
    buf = io.BytesIO()
    Image.new("RGB", (w, h), color).save(buf, fmt)
    return buf.getvalue()


def _login(c, email, password):
    r = c.post("/login", data={"email": email, "password": password, "next": "/"}, follow_redirects=False)
    assert r.status_code == 303, r.text


def _user(email, name, pw, role):
    if not db.one("SELECT id FROM users WHERE email = ?", email):
        auth.create_user(email, name, pw, role)
    return db.one("SELECT * FROM users WHERE email = ?", email)


@pytest.fixture(scope="module")
def cms():
    with TestClient(app) as c:
        _user("stock-admin@example.com", "Stock Admin", "correct-horse-9", "admin")
        _login(c, "stock-admin@example.com", "correct-horse-9")
        sid = c.post("/api/sites", json={"name": "Stock Test Farm", "template": "farm-equipment", "email": "hi@example.com"}, headers=H).json()["site"]["id"]
        other = c.post("/api/sites", json={"name": "Someone Else", "template": "corporate", "email": "hi@example.com"}, headers=H).json()["site"]["id"]
        yield c, sid, other


def test_signed_out_redirects_and_files_are_private():
    with TestClient(app) as c:
        r = c.get("/stock", follow_redirects=False)
        assert r.status_code == 303 and ("/login" in r.headers["location"] or "/setup" in r.headers["location"])
        assert c.get("/api/stock").status_code == 401
        assert c.get("/stock/f/anything.webp").status_code == 403


def test_upload_checks_contents_converts_and_dedupes(cms):
    c, sid, _ = cms
    good = picture()
    r = c.post("/api/stock", files=[("files", ("Red Tractor.jpg", good, "image/jpeg")),
                                    ("files", ("evil.jpg", b"MZ\x90\x00 this is a program", "image/jpeg")),
                                    ("files", ("page.png", b"<html><script>alert(1)</script></html>", "image/png")),
                                    ("files", ("drawing.svg", b'<svg xmlns="http://www.w3.org/2000/svg"></svg>', "image/svg+xml")),
                                    ("files", ("empty.png", b"", "image/png"))],
               data={"category": "Tractors", "tags": "Farm, Red , farm", "license": "CC0 1.0", "creator": "Test", "source": "Here"}, headers=H)
    body = r.json()
    assert r.status_code == 200, r.text
    assert len(body["items"]) == 1 and len(body["errors"]) == 4
    item = body["items"][0]
    assert item["category"] == "tractors" and item["tags"] == "farm, red"
    assert max(item["width"], item["height"]) == stock.MAX_SIDE          # resized to 2400 on the long side
    assert item["url"].endswith(".webp") and item["thumb"].startswith("/stock/t/")
    f = c.get(item["url"])
    assert f.status_code == 200 and f.content[:4] == b"RIFF" and f.content[8:12] == b"WEBP"
    thumb = Image.open(io.BytesIO(c.get(item["thumb"]).content))
    assert max(thumb.size) == stock.THUMB_SIDE
    assert "attachment" in c.get(item["download"]).headers.get("content-disposition", "")
    # the same file again is spotted, not stored twice
    again = c.post("/api/stock", files=[("files", ("copy.jpg", good, "image/jpeg"))], headers=H).json()
    assert again["items"][0]["duplicate"] and again["items"][0]["id"] == item["id"]
    # size limit
    old = stock.MAX_MB
    stock.MAX_MB = 0
    try:
        assert "larger than" in c.post("/api/stock", files=[("files", ("big.png", picture("PNG", 50, 50), "image/png"))], headers=H).json()["errors"][0]
    finally:
        stock.MAX_MB = old
    # a picture claiming to be enormous (decompression bomb) is refused before it's opened
    old_px = stock.MAX_PIXELS
    stock.MAX_PIXELS = 100
    try:
        assert "too large" in c.post("/api/stock", files=[("files", ("bomb.png", picture("PNG", 20, 20), "image/png"))], headers=H).json()["errors"][0]
    finally:
        stock.MAX_PIXELS = old_px
    # needs the X-Tenshi header like every other change
    assert c.post("/api/stock", files=[("files", ("x.jpg", picture(color=(1, 2, 3)), "image/jpeg"))]).status_code == 403


def test_tags_category_and_licence_filters_edit_and_bulk(cms):
    c, _, _ = cms
    up = lambda name, color, cat, tags, lic: c.post("/api/stock", files=[("files", (name, picture(w=800, h=600, color=color), "image/jpeg"))],
                                                    data={"category": cat, "tags": tags, "license": lic}, headers=H).json()["items"][0]
    a = up("harbour.jpg", (10, 20, 200), "Japan", "sea, boats", "CC BY-SA 4.0")
    b = up("temple.jpg", (200, 20, 10), "Japan", "temple", "CC0 1.0")
    t = up("train.jpg", (20, 200, 10), "Trains", "steam, boats", "")
    assert {x["id"] for x in c.get("/api/stock?category=japan").json()["items"]} == {a["id"], b["id"]}
    assert [x["id"] for x in c.get("/api/stock?category=japan&tag=sea").json()["items"]] == [a["id"]]
    res = c.get("/api/stock?tag=boats").json()
    assert {x["id"] for x in res["items"]} == {a["id"], t["id"]}
    assert any(x["tag"] == "boats" and x["n"] >= 2 for x in c.get("/api/stock").json()["tags"])
    assert [x["id"] for x in c.get("/api/stock?q=temple").json()["items"]] == [b["id"]]
    assert a["needs_credit"] and "CC BY-SA 4.0" in a["credit"] and not b["needs_credit"]
    assert t["license_missing"] and t["id"] in [x["id"] for x in c.get("/api/stock?license=missing").json()["items"]]
    assert b["id"] in [x["id"] for x in c.get("/api/stock?license=free").json()["items"]]
    assert a["id"] in [x["id"] for x in c.get("/api/stock?license=credit").json()["items"]]
    cats = {x["category"]: x["n"] for x in c.get("/api/stock").json()["categories"]}
    assert cats["japan"] == 2 and cats["trains"] == 1
    # edit one, then bulk tag / untag / category / licence
    e = c.patch(f"/api/stock/{t['id']}", json={"alt": "A steam train", "license": "Public domain", "tags": "Steam, heritage"}, headers=H).json()
    assert e["alt"] == "A steam train" and e["tags"] == "steam, heritage" and not e["license_missing"]
    assert c.patch(f"/api/stock/{t['id']}", json={"source_url": "javascript:alert(1)"}, headers=H).status_code == 400
    assert c.post("/api/stock/bulk", json={"ids": [a["id"], b["id"]], "action": "tag", "value": "Asia"}, headers=H).json()["count"] == 2
    assert len(c.get("/api/stock?tag=asia").json()["items"]) == 2
    c.post("/api/stock/bulk", json={"ids": [a["id"]], "action": "untag", "value": "asia"}, headers=H)
    assert [x["id"] for x in c.get("/api/stock?tag=asia").json()["items"]] == [b["id"]]
    c.post("/api/stock/bulk", json={"ids": [a["id"], b["id"]], "action": "category", "value": "Japan Travel"}, headers=H)
    assert len(c.get("/api/stock?category=japan-travel").json()["items"]) == 2
    c.post("/api/stock/bulk", json={"ids": [b["id"]], "action": "delete"}, headers=H)
    assert c.get(f"/api/stock/{b['id']}").status_code == 400
    # the page itself, for an admin: upload button and edit form
    page = c.get("/stock").text
    assert "Upload photos" in page and 'id="sk-edit"' in page


def test_roles_editor_browses_and_uses_but_cannot_manage(cms):
    c, sid, other = cms
    any_id = c.get("/api/stock").json()["items"][0]["id"]
    ed = _user("stock-editor@example.com", "Ed Stock", "correct-horse-8", "editor")
    db.run("INSERT OR REPLACE INTO site_members (site_id, user_id, role, created_at) VALUES (?, ?, 'editor', ?)", sid, ed["id"], db.now())
    with TestClient(app) as e:
        _login(e, "stock-editor@example.com", "correct-horse-8")
        page = e.get("/stock")
        assert page.status_code == 200 and "Upload photos" not in page.text and 'id="sk-edit"' not in page.text
        assert e.get("/api/stock").json()["total"] >= 1
        assert e.post("/api/stock", files=[("files", ("x.jpg", picture(color=(9, 9, 9)), "image/jpeg"))], headers=H).status_code == 403
        assert e.patch(f"/api/stock/{any_id}", json={"title": "Nope"}, headers=H).status_code == 403
        assert e.delete(f"/api/stock/{any_id}", headers=H).status_code == 403
        assert e.post("/api/stock/bulk", json={"ids": [any_id], "action": "delete"}, headers=H).status_code == 403
        # may copy into their own site, not into someone else's
        assert e.post(f"/api/sites/{sid}/stock/{any_id}", headers=H).status_code == 200
        assert e.post(f"/api/sites/{other}/stock/{any_id}", headers=H).status_code == 403
        assert e.get(c.get(f"/api/stock/{any_id}").json()["thumb"]).status_code == 200


def test_picker_copies_into_the_site_once(cms):
    c, sid, _ = cms
    src = c.post("/api/stock", files=[("files", ("barn.jpg", picture(w=2000, h=1300, color=(120, 60, 30)), "image/jpeg"))],
                 data={"category": "farm", "tags": "barn", "license": "CC BY 4.0", "creator": "Jo Photo", "source": "Wikimedia Commons"}, headers=H).json()["items"][0]
    c.patch(f"/api/stock/{src['id']}", json={"alt": "A red barn at dusk"}, headers=H)
    m = c.post(f"/api/sites/{sid}/stock/{src['id']}", headers=H).json()
    assert m["site_id"] == sid and m["kind"] == "image" and m["alt"] == "A red barn at dusk"
    assert "stock" in m["tags"] and "barn" in m["tags"] and m["category"] == "farm"
    assert set(m["variants"]) >= {"320", "800", "1600"}                 # a normal Media Center file with its resized copies
    row = db.one("SELECT * FROM media WHERE id = ?", m["id"])
    assert row["caption"] == "Photo: Jo Photo / Wikimedia Commons, CC BY 4.0"
    folder = db.one("SELECT * FROM media_folders WHERE id = ?", row["folder_id"])
    assert folder["name"] == "Stock photos" and folder["site_id"] == sid
    assert c.get(m["url"]).status_code == 200
    # inserting it again reuses the copy; deleting the library photo leaves the site's copy alone
    assert c.post(f"/api/sites/{sid}/stock/{src['id']}", headers=H).json()["id"] == m["id"]
    c.delete(f"/api/stock/{src['id']}", headers=H)
    assert db.one("SELECT id FROM media WHERE id = ?", m["id"])
    # the copy can be put in a page block like any picture
    page = db.one("SELECT * FROM pages WHERE site_id = ? ORDER BY position", sid)
    blocks = db.j(page["blocks_json"], [])
    blocks.insert(0, {"type": "image", "data": {"image": m["id"], "alt": "barn"}})
    assert c.patch(f"/api/pages/{page['id']}", json={"blocks": blocks}, headers=H).status_code == 200
    # the builder pages load the picker on every screen
    builder = c.get(f"/sites/{sid}/builder/{page['id']}").text
    assert "/static/stock-picker.js" in builder and "Stock photos" in builder
    assert "data-stock" in c.get("/static/cms.js").text


def test_seed_is_idempotent_and_never_brings_back_deleted(cms, tmp_path):
    c, _, _ = cms
    seed = tmp_path / "seed"
    (seed / "trains").mkdir(parents=True)
    images = []
    for i, color in enumerate([(5, 5, 90), (90, 5, 5), (5, 90, 5)]):
        name = f"seed-photo-{i}-abcd{i}.webp"
        Image.new("RGB", (1600, 1000), color).save(seed / "trains" / name, "WEBP")
        images.append({"key": f"seedkey{i:09d}", "file": f"trains/{name}", "category": "trains", "title": f"Seed {i}", "alt": f"Seed photo {i}",
                       "tags": ["trains", "steam"], "role": "", "creator": "C. Reator", "source": "Wikimedia Commons",
                       "source_url": "https://commons.wikimedia.org/wiki/File:X.jpg", "license": "CC BY-SA 4.0",
                       "license_url": "https://creativecommons.org/licenses/by-sa/4.0/"})
    images.append({**images[0], "key": "seedkeymissing", "file": "trains/not-there.webp"})
    (seed / "manifest.json").write_text(json.dumps({"version": 1, "images": images}))
    assert stock.seed(seed) == 3
    assert stock.seed(seed) == 0                                          # second run: nothing new
    rows = db.all("SELECT * FROM stock_photos WHERE key LIKE 'seedkey%' ORDER BY key")
    assert len(rows) == 3 and all(r["origin"] == "seed" and r["license"] == "CC BY-SA 4.0" and r["creator"] == "C. Reator" for r in rows)
    assert (stock.folder() / "thumbs" / rows[0]["thumb"]).is_file()
    c.delete(f"/api/stock/{rows[0]['id']}", headers=H)
    assert stock.seed(seed) == 0                                          # a deleted seed photo stays deleted
    assert db.one("SELECT COUNT(*) AS n FROM stock_photos WHERE key LIKE 'seedkey%'")["n"] == 2


def test_real_seed_manifest_is_complete():
    """Every photo in the committed seed has its file, a category and a licence, and no key repeats."""
    images = stock.seed_manifest()
    if not images:
        pytest.skip("no seed committed")
    keys = [im["key"] for im in images]
    assert len(keys) == len(set(keys))
    for im in images:
        assert (stock.SEED_DIR / im["file"]).is_file(), im["file"]
        assert im["category"] and im["license"], im["file"]
        assert im["file"].endswith(".webp")
