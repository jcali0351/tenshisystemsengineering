"""
A walk through the whole Tenshi CMS, the way a person would use it. Run from the platform folder:

    .venv\\Scripts\\python -m pytest tests -q          (or simply: .venv\\Scripts\\python tests\\test_cms.py)

It uses a throw-away data folder, so your real cms_data is never touched.
"""

import io
import os
import sys
import tempfile
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
os.environ["TENSHI_DATA"] = tempfile.mkdtemp(prefix="tenshi-test-")

from fastapi.testclient import TestClient  # noqa: E402
from PIL import Image  # noqa: E402

from cms import config, db  # noqa: E402
from cms.app import app  # noqa: E402

H = {"X-Tenshi": "1"}


def photo(w=1800, h=1200, color=(30, 120, 200)):
    buf = io.BytesIO()
    Image.new("RGB", (w, h), color).save(buf, "JPEG")
    return buf.getvalue()


def test_everything():
    with TestClient(app) as c:
        # First visit: setup screen, then the admin account
        assert c.get("/", follow_redirects=False).headers["location"] == "/setup"
        r = c.post("/setup", data={"name": "Admin", "email": "admin@example.com", "password": "correct-horse"}, follow_redirects=False)
        assert r.status_code == 303
        assert "Dashboard" in c.get("/").text

        # Safety: changes without the X-Tenshi header are refused
        assert c.post("/api/sites", json={"name": "Nope"}).status_code == 403

        # Template gallery seeded from data/templates.json
        assert "Template Gallery" in c.get("/templates").text

        # New site, deployed straight away
        r = c.post("/api/sites", json={"name": "Hanami Kitchen", "template": "restaurant", "email": "hi@example.com",
                                       "description": "Seasonal plates near Namba.", "deploy": True}, headers=H)
        assert r.status_code == 200, r.text
        site = r.json()["site"]
        sid = site["id"]
        assert site["status"] == "live" and site["subdomain"] == "hanami-kitchen"

        # Every screen of the site opens
        for path in ["", "/pages", "/business", "/media", "/portfolio", "/galleries", "/leads", "/deployments", "/export", "/settings"]:
            assert c.get(f"/sites/{sid}{path}").status_code == 200, path

        # Media Center: bulk upload, a bad file is refused, details, crop, bulk tag
        r = c.post(f"/api/sites/{sid}/media", files=[("files", ("dish.jpg", photo(), "image/jpeg")), ("files", ("room.jpg", photo(color=(200, 60, 40)), "image/jpeg")),
                                                     ("files", ("virus.jpg", b"MZ not a picture", "image/jpeg"))], headers=H)
        body = r.json()
        assert len(body["items"]) == 2 and len(body["errors"]) == 1
        m1, m2 = body["items"]
        assert set(m1["variants"]) == {"320", "800", "1600"}
        assert c.patch(f"/api/media/{m1['id']}", json={"alt": "A bowl of ramen", "tags": "Food, ramen"}, headers=H).json()["tags"] == "food, ramen"
        assert c.post(f"/api/media/{m1['id']}/edit", json={"crop": [0, 0, 1200, 900], "width": 800}, headers=H).json()["width"] == 800
        assert c.post(f"/api/sites/{sid}/media/bulk", json={"ids": [m1["id"], m2["id"]], "action": "tag", "value": "menu"}, headers=H).json()["count"] == 2
        assert len(c.get(f"/api/sites/{sid}/media?tag=menu").json()["items"]) == 2

        # Gallery album and a portfolio project with before/after
        album = c.post(f"/api/sites/{sid}/albums", json={"name": "Dishes"}, headers=H).json()["id"]
        c.post(f"/api/albums/{album}/items", json={"media_ids": [m1["id"], m2["id"]]}, headers=H)
        c.post(f"/api/sites/{sid}/portfolio", json={"title": "New dining room", "category": "Rooms", "before_media_id": m2["id"],
                                                     "after_media_id": m1["id"], "cover_media_id": m1["id"]}, headers=H)

        # Page builder: put the gallery on the home page, then preview it
        pages = db.all("SELECT * FROM pages WHERE site_id = ? ORDER BY position", sid)
        home = pages[0]
        blocks = db.j(home["blocks_json"])
        blocks.append({"id": "g1", "type": "gallery", "data": {"heading": "Our dishes", "album": album}})
        blocks.append({"id": "x1", "type": "html", "data": {"html": "<p onclick='bad()'>Hi</p><script>bad()</script>"}})
        assert c.patch(f"/api/pages/{home['id']}", json={"blocks": blocks}, headers=H).status_code == 200
        assert c.get(f"/sites/{sid}/builder/{home['id']}").status_code == 200
        preview = c.get(f"/sites/{sid}/preview/index?edit=1").text
        assert "Our dishes" in preview and 'data-block="g1"' in preview and "bridge.js" in preview
        assert "<script>bad()" not in preview and "onclick" not in preview          # custom HTML is cleaned

        # Business data form and saving the profile (with a revision kept)
        profile = db.j(db.one("SELECT profile_json FROM sites WHERE id = ?", sid)["profile_json"])
        profile["services"] = [{"name": "Tasting menu", "description": "Seven courses.", "price": "¥9,000"}]
        profile["company"]["logo_media"] = m2["id"]
        assert c.post(f"/api/sites/{sid}/profile", json=profile, headers=H).status_code == 200
        assert db.one("SELECT COUNT(*) AS n FROM profile_revisions WHERE site_id = ?", sid)["n"] == 1

        # Deploy and visit the live site by its own address
        build = c.post(f"/api/sites/{sid}/deploy", json={"note": "test"}, headers=H).json()["build"]
        assert build["status"] == "ready" and build["seconds"] < 5
        live = c.get("/", headers={"host": f"hanami-kitchen.{config.SITES_DOMAIN}:8000"})
        assert live.status_code == 200 and "Tasting menu" in live.text and "Our dishes" in live.text and "media/" in live.text
        assert c.get("/style.css", headers={"host": "hanami-kitchen.localhost"}).status_code == 200
        assert c.get("/__visit?p=index", headers={"host": "hanami-kitchen.localhost"}).status_code == 200
        assert c.get("/", headers={"host": "nobody-here.localhost"}).status_code == 404

        # A visitor sends the form: it becomes a lead; the robot trap is ignored
        assert c.post("/__form", data={"name": "Ken", "email": "ken@example.com", "message": "Table for 4?"}, headers={"host": "hanami-kitchen.localhost"}).json()["ok"]
        c.post("/__form", data={"name": "Bot", "_hp": "spam"}, headers={"host": "hanami-kitchen.localhost"})
        assert db.one("SELECT COUNT(*) AS n FROM leads WHERE site_id = ?", sid)["n"] == 1
        assert "Ken" in c.get(f"/sites/{sid}/leads").text
        assert "Ken" in c.get(f"/sites/{sid}/leads.csv").text

        # Dashboard shows it all
        dash = c.get("/").text
        assert "Hanami Kitchen" in dash and "Latest leads" in dash

        # Backup, restore, clone, rollback
        backup = c.post(f"/api/sites/{sid}/backup", json={}, headers=H).json()["backup"]
        assert c.post(f"/api/backups/{backup['id']}/restore", headers=H).status_code == 200
        clone = c.post(f"/api/sites/{sid}/clone", json={"name": "Hanami Kobe"}, headers=H).json()["site"]
        assert clone["subdomain"] == "hanami-kobe"
        assert db.one("SELECT COUNT(*) AS n FROM album_items ai JOIN albums a ON a.id = ai.album_id WHERE a.site_id = ?", clone["id"])["n"] == 2
        first_build = db.one("SELECT id FROM builds WHERE site_id = ? ORDER BY id LIMIT 1", sid)["id"]
        assert c.post(f"/api/sites/{sid}/rollback/{first_build}", headers=H).status_code == 200

        # Export: every part in one ZIP; the exported site's form uses email
        r = c.post(f"/sites/{sid}/export", data={"parts": ["website", "media", "database", "theme", "config"]})
        z = zipfile.ZipFile(io.BytesIO(r.content))
        names = z.namelist()
        assert "website/index.html" in names and "database/site.sqlite" in names and "config/business-profile.json" in names
        assert "theme/page.html.j2" in names and any(n.startswith("media/") for n in names)

        # Templates: clone, edit a file (a typo is refused), save and restore a version, preview
        tpl = c.post("/api/templates", json={"name": "Hanami Special", "from": "restaurant"}, headers=H).json()["id"]
        assert c.put(f"/api/templates/{tpl}/file", json={"path": "blocks/cta.html.j2", "text": "{% if %}"}, headers=H).status_code == 400
        assert c.put(f"/api/templates/{tpl}/file", json={"path": "style.css", "text": "body{color:red}"}, headers=H).status_code == 200
        assert c.post(f"/api/templates/{tpl}/versions", json={"note": "red"}, headers=H).json()["version"] == 2
        assert c.post(f"/api/templates/{tpl}/versions/1/restore", headers=H).status_code == 200
        assert c.get(f"/templates/{tpl}").status_code == 200 and c.get(f"/templates/{tpl}/preview").status_code == 200
        assert c.put(f"/api/templates/{tpl}/file", json={"path": "../../tenshi.db", "text": "x"}, headers=H).status_code == 400

        # Users: add an editor, who can't do admin things
        assert c.post("/api/users", json={"name": "Ed", "email": "ed@example.com", "password": "editor-pass", "role": "editor"}, headers=H).status_code == 200
        c.post("/logout")
        c.post("/login", data={"email": "ed@example.com", "password": "editor-pass"})
        assert c.get("/users").status_code == 403
        assert c.delete(f"/api/sites/{sid}", headers=H).status_code == 403
        assert c.get(f"/sites/{sid}/pages").status_code == 200


if __name__ == "__main__":
    test_everything()
    print("All CMS checks passed.")
