"""
The premium designs (platform/designs/aurora, meridian, maison): they join the Template Gallery at start-up, draw every
starting page of a site with a full business profile, and publish.
"""

import os
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
os.environ.setdefault("TENSHI_DATA", tempfile.mkdtemp(prefix="tenshi-test-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from cms import auth, db, sites, templates  # noqa: E402
from cms.app import app  # noqa: E402

H = {"X-Tenshi": "1"}
PREMIUM = ("aurora", "meridian", "maison")
PROFILE = {"company": {"name": "Prairie Tractor Co", "tagline": "Built for the field", "description": "Tractors and repairs.",
                       "phone": "+1 608 555 0100", "email": "hi@example.com", "service_areas": ["Dane County"],
                       "hours": [{"days": "Mon–Fri", "time": "7–6"}]},
           "services": [{"name": "Sales", "description": "New and used."}, {"name": "Repairs", "description": "Fast."}],
           "staff": [{"name": "Dale", "role": "Owner"}], "testimonials": [{"quote": "Great!", "author": "Kim", "rating": 5}],
           "social": {"facebook": "https://facebook.com/x"}}


@pytest.fixture(scope="module")
def cms():
    with TestClient(app) as c:
        if not db.one("SELECT id FROM users WHERE email = ?", "designs@example.com"):
            auth.create_user("designs@example.com", "Designs", "correct-horse-9", "admin")
        c.post("/login", data={"email": "designs@example.com", "password": "correct-horse-9", "next": "/"}, follow_redirects=False)
        yield c


def test_premium_designs_join_the_gallery(cms):
    ids = {t["id"]: t for t in templates.all_templates()}
    for tid in PREMIUM:
        assert tid in ids and ids[tid].get("premium"), tid
        assert not (templates.current_dir(tid) / "design.json").exists()
    assert [t["id"] for t in templates.all_templates()][:3] == sorted(PREMIUM)       # first in the gallery
    assert templates.seed_premium() == []                                             # only once
    html = cms.get("/templates").text
    assert "Premium" in html and "In the spirit of Astra, Kadence" in html


@pytest.mark.parametrize("tid", PREMIUM)
def test_premium_design_draws_and_publishes(cms, tid):
    site = sites.create_site(f"Prairie {tid}", tid, f"prairie-{tid}", PROFILE)
    sid = site["id"]
    assert cms.get(f"/templates/{tid}/preview").status_code == 200
    for page in db.all("SELECT slug FROM pages WHERE site_id = ?", sid):
        r = cms.get(f"/sites/{sid}/preview/{page['slug']}")
        assert r.status_code == 200 and "Prairie Tractor Co" in r.text, (tid, page["slug"])
    home = cms.get(f"/sites/{sid}/preview/index").text
    marker = {"aurora": "au-hero", "meridian": "me-hero", "maison": "ma-hero"}[tid]
    assert marker in home
    if tid == "meridian":
        assert "me-bar" in home and "Sales" in home              # contact bar and service ticks
    if tid == "maison":
        assert "ma-menu" in home
    build = cms.post(f"/api/sites/{sid}/deploy", json={"note": "design test"}, headers=H).json()["build"]
    assert build["status"] == "ready", build
    folder, _ = sites.live_folder(sites.get(sid)["subdomain"])
    css = next(folder.glob("style*.css")).read_text(encoding="utf-8")
    assert {"aurora": "AURORA", "meridian": "MERIDIAN", "maison": "MAISON"}[tid] in css
