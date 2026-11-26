"""church was merged into faith (five variants): old references keep working (cms/categories.py)."""
import json
import os
import tempfile

os.environ.setdefault("TENSHI_DATA", tempfile.mkdtemp(prefix="tenshi-test-"))

from cms import categories, config, db, sites, stock, templates  # noqa: E402


def test_normalize():
    assert categories.normalize("church") == ("faith", "church")
    assert categories.normalize("Church") == ("faith", "church")
    assert categories.normalize("faith", "synagogue") == ("faith", "synagogue")
    assert categories.normalize("faith", "made-up") == ("faith", "")
    assert categories.normalize("restaurant") == ("restaurant", "")
    assert set(categories.FAITH_VARIANTS) == {"church", "mosque", "buddhist-temple", "hindu-temple", "synagogue"}


def test_migrate_old_church_site_and_stock():
    config.ensure_folders()
    db.setup()
    templates.seed()
    stock.setup()
    site = sites.create_site("Old Church Site", "corporate", "old-church-site", {"company": {"name": "Old Church Site", "category": "church", "category_label": "Church"}})
    # a site saved before the merge (create_site would already normalise it, so write the old profile directly)
    db.run("UPDATE sites SET profile_json = ? WHERE id = ?", json.dumps({"company": {"name": "Old Church Site", "category": "church", "category_label": "Church"}}), site["id"])
    other = sites.create_site("Cafe", "corporate", "plain-cafe", {"company": {"name": "Cafe", "category": "restaurant"}})
    now = db.now()
    pid = db.run("INSERT INTO stock_photos (key, stored, thumb, title, alt, category, tags, license, origin, created_at, updated_at) "
                 "VALUES ('t-church', 'x.webp', 'x.webp', 'Steeple', 'A steeple', 'church', 'building', 'CC0 1.0', 'seed', ?, ?)", now, now)
    assert categories.migrate() >= 2
    company = json.loads(sites.get(site["id"])["profile_json"])["company"]
    assert (company["category"], company["variant"], company["category_label"]) == ("faith", "church", "Place of worship")
    assert json.loads(sites.get(other["id"])["profile_json"])["company"]["category"] == "restaurant"
    photo = db.one("SELECT category, tags FROM stock_photos WHERE id = ?", pid)
    assert photo["category"] == "faith" and "church" in photo["tags"] and "building" in photo["tags"]
    assert categories.migrate() == 0                      # idempotent
    assert not db.one("SELECT 1 FROM stock_photos WHERE category = 'church'")
    # tidy up: the fake photo has no file, and other tests share this data folder and may pick it
    db.run("DELETE FROM stock_photos WHERE id = ?", pid)


def test_new_and_saved_profiles_say_faith():
    config.ensure_folders()
    db.setup()
    templates.seed()
    site = sites.create_site("New Church", "corporate", "new-church-x", {"company": {"name": "New Church", "category": "church"}})
    company = json.loads(sites.get(site["id"])["profile_json"])["company"]
    assert (company["category"], company["variant"]) == ("faith", "church")
    profile = json.loads(sites.get(site["id"])["profile_json"])
    profile["company"]["category"] = "church"
    sites.save_profile(site["id"], profile)
    assert json.loads(sites.get(site["id"])["profile_json"])["company"]["category"] == "faith"
    mosque = sites.create_site("Mosque", "corporate", "new-mosque-x", {"company": {"name": "Mosque", "category": "faith", "variant": "mosque"}})
    assert json.loads(sites.get(mosque["id"])["profile_json"])["company"]["variant"] == "mosque"
