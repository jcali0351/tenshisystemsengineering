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


# ---------------------------------------------------------------------------------------------- B. the form builder

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
QUOTE = {"preset": "custom", "heading": "Request a quote", "recipient_email": "owner@example.com", "redirect": "",
         "success_message": "Thanks, quote coming!", "consent": True, "consent_text": "You may store my details.",
         "fields": [{"label": "Your name", "type": "text", "required": True},
                    {"label": "Email", "type": "email", "required": True},
                    {"label": "Phone", "type": "phone"},
                    {"label": "Service", "type": "select", "required": True, "options": "Repair, Install"},
                    {"label": "Budget", "type": "radio", "options": "Small\nLarge"},
                    {"label": "Extras", "type": "checkbox", "options": "Parking, Weekend"},
                    {"label": "Newsletter", "type": "checkbox"},
                    {"label": "Start date", "type": "date"},
                    {"label": "Details", "type": "textarea", "required": True},
                    {"label": "Photos", "type": "file", "accept": "images", "max_mb": "1"}]}


def _publish(c, sid):
    build = c.post(f"/api/sites/{sid}/deploy", json={"note": "forms test"}, headers=H).json()["build"]
    assert build["status"] == "ready", build
    return {"host": f"{sites.get(sid)['subdomain']}.localhost", "accept": "application/json"}


def _send(c, host, data, files=None):
    from cms import config
    db.run("DELETE FROM form_posts")
    h = {**host, "host": f"{host['host'].split('.')[0]}.{config.SITES_DOMAIN}"}
    return c.post("/__form", data=data, files=files, headers=h)


def test_form_builder_renders_every_type(cms):
    c, sid = cms
    assert _put_blocks(c, sid, "contact", [{"id": "qf1", "type": "contact_form", "data": QUOTE}]).status_code == 200
    html = c.get(f"/sites/{sid}/preview/contact").text
    for bit in ('type="email"', 'type="tel"', "<select", 'type="radio"', 'type="checkbox"', 'type="date"', "<textarea",
                'type="file"', 'accept=".jpg,.jpeg,.png,.gif,.webp"', 'data-max-mb="1"', 'name="_consent"', 'name="_hp"', "form.js", "form.css"):
        assert bit in html, bit
    assert "owner@example.com" not in html                       # the recipient never reaches the page
    assert 'data-preview="1"' in html
    # bad settings are refused
    for bad in ({"redirect": "javascript:alert(1)"}, {"redirect": "http://evil.example"}, {"recipient_email": "not an email"},
                {"fields": []}, {"fields": [{"label": "", "type": "text"}]}, {"fields": [{"label": "x", "type": "script"}]}):
        assert _put_blocks(c, sid, "contact", [{"id": "qf1", "type": "contact_form", "data": {**QUOTE, **bad}}]).status_code == 400, bad
    assert _put_blocks(c, sid, "contact", [{"id": "qf1", "type": "contact_form", "data": {**QUOTE, "redirect": "about"}}]).status_code == 200
    assert 'data-redirect="/sites/' in c.get(f"/sites/{sid}/preview/contact").text


def test_presets_and_classic_form(cms):
    c, sid = cms
    from cms import blocks, forms
    t = blocks.BLOCKS["contact_form"]
    assert set(t["presets"]["preset"]) == {"contact", "quote", "appointment", "newsletter"}
    assert blocks.BLOCKS["form"].get("hidden")                   # the classic form isn't offered for new blocks …
    for name, p in forms.PRESETS.items():
        assert _put_blocks(c, sid, "contact", [{"id": "p1", "type": "contact_form", "data": {**p, "preset": name}}]).status_code == 200, name
    _put_blocks(c, sid, "contact", [{"id": "old", "type": "form", "data": {"heading": "Old form", "fields": "name,email,message"}}])
    html = c.get(f"/sites/{sid}/preview/contact").text           # … but still draws
    assert "Old form" in html and 'class="lead"' in html
    assert 'data-kind="form"' not in c.get(f"/sites/{sid}/builder/" + str(db.one("SELECT id FROM pages WHERE site_id = ? AND slug = 'contact'", sid)["id"])).text


def test_form_send_checks_files_leads_and_email(cms, monkeypatch):
    from cms import forms, mail
    c, sid = cms
    monkeypatch.setenv("TENSHI_MAIL_TEST", "1")
    mail.sent.clear()
    _put_blocks(c, sid, "contact", [{"id": "qf1", "type": "contact_form", "data": QUOTE}])
    host = _publish(c, sid)
    base = {"_page": "contact", "_form": "qf1", "f_your_name": "Ana", "f_email": "ana@example.com", "f_service": "Repair",
            "f_details": "Fix the sink", "_consent": "yes"}
    # problems are named
    for patch, field in (({"f_email": "nope"}, "f_email"), ({"f_service": "Hack"}, "f_service"), ({"f_details": ""}, "f_details"),
                         ({"f_start_date": "31/12/2026"}, "f_start_date"), ({"f_phone": "<script>"}, "f_phone"),
                         ({"_consent": ""}, "_consent"), ({"f_budget": "Huge"}, "f_budget")):
        r = _send(c, host, {**base, **patch})
        assert r.status_code == 400 and r.json()["field"] == field, (patch, r.text)
    # a file that isn't a picture, and one that's too big
    r = _send(c, host, base, files={"f_photos": ("x.png", b"MZ not a png", "image/png")})
    assert r.status_code == 400 and "real PNG" in r.json()["error"]
    r = _send(c, host, base, files={"f_photos": ("x.pdf", b"%PDF-1.4", "application/pdf")})
    assert r.status_code == 400 and "pictures" in r.json()["error"]
    r = _send(c, host, base, files={"f_photos": ("big.png", PNG + b"\x00" * (1024 * 1024 + 1), "image/png")})
    assert r.status_code == 400 and "larger than 1 MB" in r.json()["error"]
    assert db.one("SELECT COUNT(*) AS n FROM leads WHERE site_id = ?", sid)["n"] == 0
    # a good send
    data = {**base, "f_extras": ["Parking", "Weekend"], "f_newsletter": "yes", "f_budget": "Large", "f_start_date": "2026-12-24",
            "f_phone": "+1 (512) 555-0100"}
    r = _send(c, host, data, files={"f_photos": ("../../kitchen.png", PNG, "image/png")})
    assert r.status_code == 200 and r.json()["ok"], r.text
    lead = db.one("SELECT * FROM leads WHERE site_id = ? ORDER BY id DESC", sid)
    d = db.j(lead["data_json"])
    assert list(d)[:4] == ["Your name", "Email", "Phone", "Service"]
    assert d["Extras"] == "Parking, Weekend" and d["Newsletter"] == "Yes" and d["Photos"] == "kitchen.png" and d["Consent"].startswith("Yes")
    f = db.one("SELECT * FROM lead_files WHERE lead_id = ?", lead["id"])
    path = forms.file_path(f)
    assert path.read_bytes() == PNG and str(path).startswith(str(forms.UPLOADS_DIR)) and "builds" not in str(path)
    # the email
    assert len(mail.sent) == 1 and mail.sent[0]["To"] == "owner@example.com" and mail.sent[0]["Reply-To"] == "ana@example.com"
    assert "Fix the sink" in mail.sent[0].get_content() and "kitchen.png" in mail.sent[0].get_content()
    # the file isn't on the website, only in the dashboard for signed-in users
    from cms import config
    site_host = {"host": f"{sites.get(sid)['subdomain']}.{config.SITES_DOMAIN}"}
    assert c.get(f"/form-uploads/{sid}/{f['stored']}", headers=site_host).status_code == 404
    assert c.get("/.tenshi-forms.json", headers=site_host).status_code == 404
    url = f"/sites/{sid}/leads/{lead['id']}/files/{f['id']}"
    r = c.get(url)
    assert r.status_code == 200 and r.content == PNG and r.headers["content-disposition"].startswith("attachment")
    assert r.headers["x-content-type-options"] == "nosniff" and "sandbox" in r.headers["content-security-policy"]
    with TestClient(app) as anon:
        assert anon.get(url, follow_redirects=False).status_code in (302, 303, 401)
    assert c.get(f"/sites/{sid}/leads/{lead['id']}/files/{f['id'] + 999}").status_code == 404
    # the dashboard
    page = c.get(f"/sites/{sid}/leads/{lead['id']}").text
    assert "Fix the sink" in page and "kitchen.png" in page and "Download" in page
    assert "Ana" in c.get(f"/sites/{sid}/leads").text and "1 file" in c.get(f"/sites/{sid}/leads").text
    csv_text = c.get(f"/sites/{sid}/leads.csv").text
    assert "Your name" in csv_text and "kitchen.png" in csv_text
    # deleting the lead deletes its file
    assert c.delete(f"/api/leads/{lead['id']}", headers=H).json()["ok"]
    assert not path.exists() and not db.one("SELECT * FROM lead_files WHERE id = ?", f["id"])


def test_form_send_without_js_honeypot_ratelimit_and_csv_formulas(cms, monkeypatch):
    from cms import config, mail, ratelimit
    c, sid = cms
    monkeypatch.delenv("TENSHI_MAIL_TEST", raising=False)
    for k in ("SMTP_HOST", "SMTP_USER", "SMTP_PASS"):
        monkeypatch.delenv(k, raising=False)
    assert not mail.configured()
    _put_blocks(c, sid, "contact", [{"id": "nf1", "type": "contact_form", "data": {"preset": "newsletter", **__import__("cms.forms", fromlist=["x"]).PRESETS["newsletter"]}}])
    host = _publish(c, sid)
    site_host = {"host": f"{sites.get(sid)['subdomain']}.{config.SITES_DOMAIN}"}
    db.run("DELETE FROM form_posts")
    r = c.post("/__form", data={"_page": "contact", "_form": "nf1", "f_email": "=HYPERLINK(1)@x.co", "f_first_name": "=cmd", "_consent": "yes"}, headers=site_host)
    assert r.status_code == 200 and "<h1>Thank you</h1>" in r.text and "on the list" in r.text
    assert "=cmd" in db.one("SELECT data_json FROM leads WHERE site_id = ? ORDER BY id DESC", sid)["data_json"]
    assert "'=cmd" in c.get(f"/sites/{sid}/leads.csv").text            # no spreadsheet formulas
    assert "Email notifications are off" in c.get(f"/sites/{sid}/leads").text
    before = db.one("SELECT COUNT(*) AS n FROM leads")["n"]
    db.run("DELETE FROM form_posts")
    assert c.post("/__form", data={"_page": "contact", "_form": "nf1", "f_email": "bot@x.co", "_hp": "spam"}, headers={**site_host, **{"accept": "application/json"}}).json()["ok"]
    assert db.one("SELECT COUNT(*) AS n FROM leads")["n"] == before
    db.run("DELETE FROM form_posts")
    codes = [c.post("/__form", data={"_page": "contact", "_form": "nf1", "f_email": f"v{i}@x.co", "_consent": "yes"},
                    headers={**site_host, "accept": "application/json"}).status_code for i in range(ratelimit.PER_IP + 1)]
    assert codes[-1] == 429
    # too large a request is refused before it's read
    db.run("DELETE FROM form_posts")
    r = c.post("/__form", content=b"x", headers={**site_host, "content-length": str(30 * 1024 * 1024), "content-type": "application/x-www-form-urlencoded"})
    assert r.status_code == 413
