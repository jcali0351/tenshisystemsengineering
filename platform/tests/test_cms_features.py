"""
WordPress/Joomla/Drupal-style features: Trash, Redirects, two-step sign-in and password reset, Author/Contributor roles
and per-site access, custom content types and the Collection block, the WordPress import, Site search, comments,
languages and scheduled publishing. Throw-away data folder, like the other tests.
"""

import os
import sys
import tempfile
from datetime import datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
os.environ.setdefault("TENSHI_DATA", tempfile.mkdtemp(prefix="tenshi-test-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from cms import account, auth, config, db, mail, scheduler, sites, templates, trash  # noqa: E402
from cms.app import app  # noqa: E402

H = {"X-Tenshi": "1"}
PW = "correct-horse-9"


def _user(email, role="editor"):
    row = db.one("SELECT id FROM users WHERE email = ?", email)
    return row["id"] if row else auth.create_user(email, email.split("@")[0], PW, role)


def _login(c, email, pw=PW):
    return c.post("/login", data={"email": email, "password": pw, "next": "/"}, follow_redirects=False)


def _site(c, name):
    tpl = templates.all_templates()[0]["id"]
    return c.post("/api/sites", json={"name": name, "template": tpl}, headers=H).json()["site"]


def _deploy(c, sid):
    build = c.post(f"/api/sites/{sid}/deploy", json={"note": "test"}, headers=H).json()["build"]
    assert build["status"] == "ready", build
    folder, _ = sites.live_folder(sites.get(sid)["subdomain"])
    return folder


def _ago(minutes):
    return (datetime.now(timezone.utc) - timedelta(minutes=minutes)).strftime("%Y-%m-%dT%H:%M:%SZ")


@pytest.fixture(scope="module")
def admin():
    with TestClient(app) as c:
        _user("feat-admin@example.com", "admin")
        assert _login(c, "feat-admin@example.com").status_code == 303
        site = _site(c, "Feature Farm")
        yield c, site


# ---------------------------------------------------------------------------------------------- 1. Trash

def test_trash_pages_posts_media(admin):
    c, site = admin
    sid = site["id"]
    page = c.post(f"/api/sites/{sid}/pages", json={"title": "Old Barn"}, headers=H).json()
    r = c.delete(f"/api/pages/{page['id']}", headers=H).json()
    assert r["trash_id"] and not db.one("SELECT 1 AS x FROM pages WHERE id = ?", page["id"])
    post = c.post(f"/api/sites/{sid}/posts", json={"title": "Harvest news"}, headers=H).json()
    c.delete(f"/api/sites/{sid}/posts/{post['id']}", headers=H)
    from PIL import Image
    import io
    buf = io.BytesIO()
    Image.new("RGB", (40, 30), "green").save(buf, "PNG")
    up = c.post(f"/api/sites/{sid}/media", files={"files": ("field.png", buf.getvalue(), "image/png")}, headers=H).json()["items"][0]
    c.delete(f"/api/media/{up['id']}", headers=H)
    items = trash.items(sid)
    assert {i["kind"] for i in items} >= {"page", "post", "media"}
    html = c.get(f"/sites/{sid}/trash").text
    assert "Old Barn" in html and "Harvest news" in html and "field.png" in html
    for i in items:
        assert c.post(f"/api/sites/{sid}/trash/{i['id']}/restore", headers=H).status_code == 200
    assert db.one("SELECT 1 AS x FROM pages WHERE site_id = ? AND title = 'Old Barn'", sid)
    assert db.one("SELECT 1 AS x FROM posts WHERE site_id = ? AND title = 'Harvest news'", sid)
    m = db.one("SELECT * FROM media WHERE site_id = ? AND filename = 'field.png'", sid)
    assert m and c.get(f"/m/{sid}/{m['stored']}").status_code == 200
    # purge for good, and old entries purge themselves
    c.delete(f"/api/media/{m['id']}", headers=H)
    t = trash.items(sid)[0]
    db.run("UPDATE trash SET created_at = ? WHERE id = ?", _ago(60 * 24 * 40), t["id"])
    assert trash.purge_old() == 1 and not trash.items(sid)
    p2 = c.post(f"/api/sites/{sid}/pages", json={"title": "Silo"}, headers=H).json()
    c.delete(f"/api/pages/{p2['id']}", headers=H)
    assert c.delete(f"/api/sites/{sid}/trash", headers=H).json()["count"] == 1


# ---------------------------------------------------------------------------------------------- 2. Redirects

def test_redirects_and_not_found(admin):
    c, site = admin
    sid, host = site["id"], {"host": f"{site['subdomain']}.localhost"}
    assert c.post(f"/api/sites/{sid}/redirects", json={"from_path": "/old-tractors.html", "to_url": "about"}, headers=H).status_code == 200
    assert c.post(f"/api/sites/{sid}/redirects", json={"from_path": "/blog/*", "to_url": "/news/*", "code": 302}, headers=H).status_code == 200
    assert c.post(f"/api/sites/{sid}/redirects", json={"from_path": "/x", "to_url": "javascript:alert(1)"}, headers=H).status_code == 400
    assert c.post(f"/api/sites/{sid}/redirects", json={"from_path": "/", "to_url": "about"}, headers=H).status_code == 400
    _deploy(c, sid)
    r = c.get("/Old-Tractors/", headers=host, follow_redirects=False)
    assert r.status_code == 301 and r.headers["location"] == "/about.html"
    r = c.get("/blog/2019/spring", headers=host, follow_redirects=False)
    assert r.status_code == 302 and r.headers["location"] == "/news/2019/spring"
    r = c.get(f"/s/{site['subdomain']}/old-tractors", follow_redirects=False)
    assert r.headers["location"] == f"/s/{site['subdomain']}/about.html"
    assert c.get("/no-such-page", headers=host).status_code == 404
    c.get("/wp-login.php", headers=host)
    rows = c.get(f"/api/sites/{sid}/redirects").json()
    assert any(m["path"] == "/no-such-page" for m in rows["not_found"]) and not any("wp-login" in m["path"] for m in rows["not_found"])
    assert "Not found" in c.get(f"/sites/{sid}/redirects").text
    # renaming a page adds a redirect from its old address
    about = db.one("SELECT * FROM pages WHERE site_id = ? AND slug = 'about'", sid)
    c.patch(f"/api/pages/{about['id']}", json={"slug": "our-story"}, headers=H)
    assert db.one("SELECT to_url FROM redirects WHERE site_id = ? AND from_path = '/about'", sid)["to_url"] == "our-story"


# ---------------------------------------------------------------------------------------------- 3. two-step sign-in, passwords

def test_totp_codes():
    s = account.new_secret()
    assert account.check_code(s, account.code_now(s)) and not account.check_code(s, "000000" if account.code_now(s) != "000000" else "111111")
    # RFC 6238 test vector (SHA-1, 59 s): 94287082 → last 6 digits
    import base64
    secret = base64.b32encode(b"12345678901234567890").decode().rstrip("=")
    assert account.code_now(secret, at=59) == "287082"


def test_two_step_sign_in_and_backup_codes():
    email = "two-step@example.com"
    uid = _user(email)
    secret = account.new_secret()
    codes = account.turn_on(uid, secret, account.code_now(secret))
    assert len(codes) == 8
    with TestClient(app) as c:
        r = _login(c, email)
        assert r.status_code == 303 and r.headers["location"] == "/login/code"
        assert c.get("/", follow_redirects=False).status_code == 303           # not signed in yet
        assert c.post("/login/code", data={"code": "123456" if account.code_now(secret) != "123456" else "654321"}, follow_redirects=False).status_code == 401
        r = c.post("/login/code", data={"code": account.code_now(secret)}, follow_redirects=False)
        assert r.status_code == 303 and r.headers["location"] == "/"
        assert c.get("/account").status_code == 200
    with TestClient(app) as c:
        _login(c, email)
        assert c.post("/login/code", data={"code": codes[0]}, follow_redirects=False).status_code == 303
    with TestClient(app) as c:
        _login(c, email)
        assert c.post("/login/code", data={"code": codes[0]}, follow_redirects=False).status_code == 401   # used up
    account.turn_off(uid)


def test_account_setup_and_password_reset(monkeypatch):
    email = "forgetful@example.com"
    _user(email)
    sent = []
    monkeypatch.setattr(mail, "configured", lambda: True)
    monkeypatch.setattr(mail, "send_later", lambda msg: sent.append(msg) or True)
    with TestClient(app) as c:
        assert "Forgot your password?" in c.get("/login").text
        r = c.post("/forgot", data={"email": "nobody@example.com"})
        assert r.status_code == 200 and "If" in r.text and not sent
        c.post("/forgot", data={"email": email})
        assert sent and sent[0]["To"] == email
        token = sent[0].get_content().split("token=")[1].split()[0]
        assert c.get(f"/reset?token={token}").status_code == 200
        assert c.post("/reset", data={"token": token, "password": "short"}).status_code == 400
        assert c.post("/reset", data={"token": token, "password": "new-pass-1234"}, follow_redirects=False).status_code == 303
        assert c.post("/reset", data={"token": token, "password": "again-1234"}).status_code == 400      # one use
        assert _login(c, email, "new-pass-1234").status_code == 303
        start = c.post("/api/account/2fa/start", headers=H).json()
        assert start["secret"] and start["uri"].startswith("otpauth://totp/")
        r = c.post("/api/account/2fa/confirm", json={"secret": start["secret"], "code": account.code_now(start["secret"])}, headers=H)
        assert len(r.json()["backup_codes"]) == 8
        assert c.post("/api/account/2fa/off", json={"password": "wrong"}, headers=H).status_code == 400
        assert c.post("/api/account/2fa/off", json={"password": "new-pass-1234"}, headers=H).status_code == 200
        assert c.post("/api/account/password", json={"current": "new-pass-1234", "new": PW}, headers=H).status_code == 200


# ---------------------------------------------------------------------------------------------- 4. roles and site access

def test_roles_author_contributor_and_site_access(admin):
    c, site = admin
    sid = site["id"]
    other = _site(c, "Someone Else's Shop")
    au, co = _user("author@example.com"), _user("contrib@example.com")
    c.put(f"/api/sites/{sid}/members/{au}", json={"role": "author"}, headers=H)
    c.put(f"/api/sites/{sid}/members/{co}", json={"role": "contributor"}, headers=H)
    with TestClient(app) as a:
        _login(a, "author@example.com")
        r = a.get(f"/sites/{sid}/pages", follow_redirects=False)
        assert r.status_code == 303 and r.headers["location"] == f"/sites/{sid}/posts"
        assert a.get(f"/sites/{sid}/posts").status_code == 200 and a.get(f"/sites/{sid}/media").status_code == 200
        home = db.one("SELECT id FROM pages WHERE site_id = ? AND slug = 'index'", sid)
        assert a.patch(f"/api/pages/{home['id']}", json={"title": "Hacked"}, headers=H).status_code == 403
        assert a.get(f"/sites/{other['id']}").status_code == 403                      # not their site
        assert a.get(f"/api/sites/{other['id']}/posts").status_code == 403
        mine = a.post(f"/api/sites/{sid}/posts", json={"title": "Author post", "status": "published"}, headers=H).json()
        assert mine["status"] == "published" and mine["user_id"] == au
        assert 'value="%d"' % other["id"] not in a.get("/").text                # not in their site switcher
    with TestClient(app) as k:
        _login(k, "contrib@example.com")
        p = k.post(f"/api/sites/{sid}/posts", json={"title": "Contributor post", "status": "published"}, headers=H).json()
        assert p["status"] == "review"
        assert k.patch(f"/api/sites/{sid}/posts/{mine['id']}", json={"title": "Mine now"}, headers=H).status_code == 400
        assert k.post(f"/api/sites/{sid}/deploy", json={}, headers=H).status_code == 403
        assert "Waiting for review" in c.get(f"/sites/{sid}/posts").text
    approved = c.patch(f"/api/sites/{sid}/posts/{p['id']}", json={"title": "Contributor post", "status": "published"}, headers=H).json()
    assert approved["status"] == "published"


# ---------------------------------------------------------------------------------------------- 5. content types, collection, search

def test_content_types_collection_and_search(admin):
    c, site = admin
    sid = site["id"]
    t = c.post(f"/api/sites/{sid}/content-types", json={"name": "Tractors for sale", "singular": "Tractor", "fields": [
        {"label": "Make", "type": "select", "options": "John Deere, Kubota", "filter": True}, {"label": "Year", "type": "number"},
        {"label": "Price", "type": "price"}, {"label": "Notes", "type": "rich", "show": False}]}, headers=H).json()
    assert t["slug"] == "tractors-for-sale" and [f["name"] for f in t["fields"]] == ["make", "year", "price", "notes"]
    e1 = c.post(f"/api/content-types/{t['id']}/entries", json={"title": "JD 4020", "data": {"make": "John Deere", "year": "1967", "price": "$18,500",
                                                                                         "notes": "<p>Runs <b>great</b><script>x()</script></p>"}}, headers=H).json()
    assert e1["data"]["notes"] == "<p>Runs <b>great</b></p>"
    assert c.post(f"/api/content-types/{t['id']}/entries", json={"title": "Bad", "data": {"year": "old"}}, headers=H).status_code == 400
    assert c.post(f"/api/content-types/{t['id']}/entries", json={"title": "Bad", "data": {"make": "Ferrari"}}, headers=H).status_code == 400
    c.post(f"/api/content-types/{t['id']}/entries", json={"title": "Secret draft", "status": "draft", "data": {}}, headers=H)
    assert "JD 4020" in c.get(f"/sites/{sid}/content/{t['id']}").text and "Tractors for sale" in c.get(f"/sites/{sid}/content").text
    page = c.post(f"/api/sites/{sid}/pages", json={"title": "For sale"}, headers=H).json()
    blocks = [{"id": "cl1", "type": "collection", "data": {"type_id": str(t["id"]), "layout": "cards", "search": True}},
              {"id": "se1", "type": "search", "data": {"heading": "Find it"}}]
    assert c.patch(f"/api/pages/{page['id']}", json={"blocks": blocks}, headers=H).status_code == 200
    slug = db.one("SELECT slug FROM pages WHERE id = ?", page["id"])["slug"]
    html = c.get(f"/sites/{sid}/preview/{slug}").text
    assert "JD 4020" in html and "tractors-for-sale-jd-4020" in html and 'data-tw-filter="John Deere"' in html and "Secret draft" not in html
    assert c.get(f"/sites/{sid}/preview/tractors-for-sale-jd-4020").status_code == 200
    assert '"t":"JD 4020"' in c.get(f"/sites/{sid}/preview/search.json").text.replace(": ", ":")
    folder = _deploy(c, sid)
    detail = (folder / "tractors-for-sale-jd-4020.html").read_text(encoding="utf-8")
    assert "Runs <b>great</b>" in detail and "$18,500" in detail
    assert not (folder / "tractors-for-sale-secret-draft.html").exists()
    import json
    idx = json.loads((folder / "search.json").read_text(encoding="utf-8"))
    assert any(i["t"] == "JD 4020" for i in idx) and all(i["t"] != "Secret draft" for i in idx)
    assert (folder / "widgets" / "search" / "search.js").is_file()
    # deleting an entry goes to the Trash; deleting the type removes it
    c.delete(f"/api/entries/{e1['id']}", headers=H)
    assert any(i["kind"] == "entry" for i in trash.items(sid))


# ---------------------------------------------------------------------------------------------- 6. WordPress import

WXR = b"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/" xmlns:content="http://purl.org/rss/1.0/modules/content/"
 xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:wp="http://wordpress.org/export/1.2/">
<channel><title>Old Farm Blog</title><link>https://oldfarm.example.com</link><wp:base_blog_url>https://oldfarm.example.com</wp:base_blog_url>
<item><title>Spring planting</title><link>https://oldfarm.example.com/2019/04/spring-planting/</link><dc:creator>sam</dc:creator>
 <content:encoded><![CDATA[We planted corn.

<!-- wp:paragraph -->Then [gallery ids="1,2"] beans.<!-- /wp:paragraph --><script>bad()</script>]]></content:encoded>
 <excerpt:encoded><![CDATA[Corn and beans]]></excerpt:encoded><wp:post_id>10</wp:post_id><wp:post_date_gmt>2019-04-02 10:00:00</wp:post_date_gmt>
 <wp:post_name>spring-planting</wp:post_name><wp:status>publish</wp:status><wp:post_type>post</wp:post_type>
 <category domain="category" nicename="farm"><![CDATA[Farm life]]></category><category domain="post_tag" nicename="corn"><![CDATA[corn]]></category>
 <category domain="category" nicename="uncategorized"><![CDATA[Uncategorized]]></category></item>
<item><title>Draft idea</title><link>https://oldfarm.example.com/?p=11</link><content:encoded><![CDATA[Later]]></content:encoded>
 <wp:post_id>11</wp:post_id><wp:post_name></wp:post_name><wp:status>draft</wp:status><wp:post_type>post</wp:post_type></item>
<item><title>About the farm</title><link>https://oldfarm.example.com/about-the-farm/</link><content:encoded><![CDATA[<p>Since 1952.</p>]]></content:encoded>
 <wp:post_id>12</wp:post_id><wp:post_name>about-the-farm</wp:post_name><wp:status>publish</wp:status><wp:post_type>page</wp:post_type></item>
<item><title>Junk</title><content:encoded><![CDATA[x]]></content:encoded><wp:post_id>13</wp:post_id><wp:status>trash</wp:status><wp:post_type>post</wp:post_type></item>
</channel></rss>"""


def test_wordpress_import(admin):
    c, site = admin
    sid = site["id"]
    s = c.post(f"/api/sites/{sid}/import/wordpress/check", files={"file": ("export.xml", WXR, "text/xml")}, headers=H).json()
    assert s == {"title": "Old Farm Blog", "site_url": "https://oldfarm.example.com", "posts": 2, "pages": 1, "images": 0}
    bad = c.post(f"/api/sites/{sid}/import/wordpress/check", files={"file": ("x.xml", b"<html>nope</html>", "text/xml")}, headers=H)
    assert bad.status_code == 400
    evil = b'<?xml version="1.0"?><!DOCTYPE r [<!ENTITY a "aaaa">]><rss><channel></channel></rss>'
    assert c.post(f"/api/sites/{sid}/import/wordpress", files={"file": ("x.xml", evil, "text/xml")}, headers=H).status_code == 400
    r = c.post(f"/api/sites/{sid}/import/wordpress", files={"file": ("export.xml", WXR, "text/xml")}, data={"images": "0"}, headers=H).json()
    assert r["posts"] == 2 and r["pages"] == 1 and r["skipped"] == 1 and r["redirects"] >= 2
    post = db.one("SELECT * FROM posts WHERE site_id = ? AND slug = 'spring-planting'", sid)
    assert post["status"] == "published" and post["published_at"] == "2019-04-02T10:00:00Z"
    assert "<p>We planted corn.</p>" in post["body"] and "script" not in post["body"] and "gallery" not in post["body"]
    assert post["tags"] == "Farm life, corn"
    assert db.one("SELECT status FROM posts WHERE site_id = ? AND title = 'Draft idea'", sid)["status"] == "draft"
    assert db.one("SELECT to_url FROM redirects WHERE site_id = ? AND from_path = '/2019/04/spring-planting'", sid)["to_url"] == "post-spring-planting"
    page = db.one("SELECT * FROM pages WHERE site_id = ? AND slug = 'about-the-farm'", sid)
    assert page and "Since 1952." in page["blocks_json"] and page["in_menu"] == 0
    assert "Last import" in c.get(f"/sites/{sid}/import").text


def test_import_never_fetches_private_addresses():
    from cms import wp_import
    assert not wp_import.public_address("http://127.0.0.1/x.jpg")
    assert not wp_import.public_address("http://localhost/x.jpg")
    assert not wp_import.public_address("http://10.0.0.5/x.jpg")
    assert not wp_import.public_address("file:///etc/passwd")
    assert wp_import.fetch_image("http://169.254.169.254/latest/meta-data") is None


# ---------------------------------------------------------------------------------------------- 7. comments

def test_comments_moderated(admin):
    c, site = admin
    sid, host = site["id"], {"host": f"{site['subdomain']}.localhost"}
    post = c.post(f"/api/sites/{sid}/posts", json={"title": "Comment on me", "status": "published"}, headers=H).json()
    assert c.put(f"/api/sites/{sid}/comments", json={"on": True}, headers=H).json()["on"]
    folder = _deploy(c, sid)
    page = (folder / f"post-{post['slug']}.html").read_text(encoding="utf-8")
    assert "tw-comments" in page and "__w/comments/send" in page
    key = f"post-{post['slug']}/comments"
    old = str(int(__import__("time").time()) - 30)
    r = c.post("/__w/comments/send", data={"_block": key, "post": f"post-{post['slug']}", "_t": old, "name": "Ann", "body": "Lovely corn!"}, headers=host)
    assert r.status_code == 200 and r.json()["ok"], r.text
    spam = c.post("/__w/comments/send", data={"_block": key, "post": f"post-{post['slug']}", "_t": old, "name": "Bot",
                                              "body": "http://a.x http://b.x http://c.x"}, headers=host)
    assert spam.status_code == 400
    listing = c.get(f"/__w/comments/list?post=post-{post['slug']}&_block={key}", headers=host).json()
    assert listing["count"] == 0                                           # waits for approval
    row = db.one("SELECT * FROM comments WHERE site_id = ? AND name = 'Ann'", sid)
    assert row["status"] == "pending" and "Lovely corn" in c.get(f"/sites/{sid}/inbox/comments").text
    assert c.patch(f"/api/sites/{sid}/inbox/comments/{row['id']}", json={"status": "approved"}, headers=H).status_code == 200
    listing = c.get(f"/__w/comments/list?post=post-{post['slug']}&_block={key}", headers=host).json()
    assert listing["count"] == 1 and "Lovely corn!" in listing["html"]


# ---------------------------------------------------------------------------------------------- 8. languages

def test_languages_translate_and_switcher(admin):
    c, site = admin
    sid = site["id"]
    assert c.put(f"/api/sites/{sid}/languages", json={"extra": ["es", "klingon"]}, headers=H).status_code == 400
    assert c.put(f"/api/sites/{sid}/languages", json={"extra": ["es"]}, headers=H).json()["extra"] == ["es"]
    home = db.one("SELECT * FROM pages WHERE site_id = ? AND slug = 'index'", sid)
    t = c.post(f"/api/pages/{home['id']}/translate", json={"lang": "es"}, headers=H).json()
    assert t["slug"] == "es"
    again = c.post(f"/api/pages/{home['id']}/translate", json={"lang": "es"}, headers=H).json()
    assert again["id"] == t["id"]
    assert c.post(f"/api/pages/{home['id']}/translate", json={"lang": "fr"}, headers=H).status_code == 400
    es = c.get(f"/sites/{sid}/preview/es").text
    assert 'lang="es"' in es and "tw-langs" in es and "Español" in es and "English" in es
    assert "Translate" in c.get(f"/sites/{sid}/languages").text
    folder = _deploy(c, sid)
    live_es = (folder / "es.html").read_text(encoding="utf-8")
    assert 'hreflang="en"' in live_es and 'hreflang="es"' in live_es
    index = (folder / "index.html").read_text(encoding="utf-8")
    assert 'href="es.html"' in index


# ---------------------------------------------------------------------------------------------- 9. scheduled pages

def test_scheduled_page_publishes_itself(admin):
    c, site = admin
    sid = site["id"]
    page = c.post(f"/api/sites/{sid}/pages", json={"title": "Fall sale"}, headers=H).json()
    later = (datetime.now(timezone.utc) + timedelta(days=2)).strftime("%Y-%m-%dT%H:%M:%SZ")
    assert c.patch(f"/api/pages/{page['id']}", json={"publish_at": later}, headers=H).status_code == 200
    home = db.one("SELECT id FROM pages WHERE site_id = ? AND slug = 'index'", sid)
    assert c.patch(f"/api/pages/{home['id']}", json={"publish_at": later}, headers=H).status_code == 400
    slug = db.one("SELECT slug FROM pages WHERE id = ?", page["id"])["slug"]
    folder = _deploy(c, sid)
    assert not (folder / f"{slug}.html").exists()
    assert c.get(f"/sites/{sid}/preview/{slug}").status_code == 200      # the CMS preview still shows it
    assert sid not in scheduler.due()
    # time passes: the page's time is after the live build was made
    build = sites.get(sid)["current_build_id"]
    db.run("UPDATE builds SET created_at = ? WHERE id = ?", _ago(10), build)
    db.run("UPDATE pages SET publish_at = ? WHERE id = ?", _ago(5), page["id"])
    assert sid in scheduler.due()
    assert sid in scheduler.run_once()
    folder, _ = sites.live_folder(sites.get(sid)["subdomain"])
    assert (folder / f"{slug}.html").exists()
    assert sid not in scheduler.due()
