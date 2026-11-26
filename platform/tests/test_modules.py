"""
The client module library (DB-36): galleries, calendars and booking, testimonials and trust, social, extras.
Throw-away data folder, like the other tests. Outside services are never called: modcache.http_json is replaced.
"""

import os
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
os.environ.setdefault("TENSHI_DATA", tempfile.mkdtemp(prefix="tenshi-test-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from cms import auth, config, db, render, sites, templates, widgets  # noqa: E402
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
        _user("mod-admin@example.com", "correct-horse-9", "admin")
        _login(c, "mod-admin@example.com", "correct-horse-9")
        tpl = templates.all_templates()[0]["id"]
        sid = c.post("/api/sites", json={"name": "Module Bakery", "template": tpl}, headers=H).json()["site"]["id"]
        yield c, sid


def _put(c, sid, slug, blocks):
    page = db.one("SELECT * FROM pages WHERE site_id = ? AND slug = ?", sid, slug)
    r = c.patch(f"/api/pages/{page['id']}", json={"blocks": blocks}, headers=H)
    return r


def _deploy(c, sid):
    build = c.post(f"/api/sites/{sid}/deploy", json={"note": "modules test"}, headers=H).json()["build"]
    assert build["status"] == "ready", build
    folder, _ = sites.live_folder(sites.get(sid)["subdomain"])
    return folder


def _media(sid, name, tags="", alt="", w=1200, h=800):
    return db.run("INSERT INTO media (site_id, kind, filename, stored, mime, bytes, width, height, alt, tags, created_at) "
                  "VALUES (?, 'image', ?, ?, 'image/webp', 1000, ?, ?, ?, ?, ?)", sid, name, name, w, h, alt, tags, db.now())


def _csp(c, sub, file):
    return c.get(f"/s/{sub}/{file}").headers["content-security-policy"]


# ---------------------------------------------------------------------------------------------- 1. galleries

def test_gallery_layouts_filters_and_lightbox(cms):
    c, sid = cms
    a = _media(sid, "cake.webp", tags="cakes, weddings", alt="A three-tier cake")
    b = _media(sid, "bread.webp", tags="bread", alt="Sourdough loaves")
    d = _media(sid, "tart.webp", tags="cakes", alt="Lemon tart")
    album = db.run("INSERT INTO albums (site_id, name, category, layout, created_at) VALUES (?, 'Weddings', 'events, cakes', 'grid', ?)", sid, db.now())
    album2 = db.run("INSERT INTO albums (site_id, name, category, layout, created_at) VALUES (?, 'Shop', 'shop', 'masonry', ?)", sid, db.now())
    for i, m in enumerate([a, d]):
        db.run("INSERT INTO album_items (album_id, media_id, caption, position) VALUES (?, ?, ?, ?)", album, m, f"Pic {i}", i)
    db.run("INSERT INTO album_items (album_id, media_id, caption, position) VALUES (?, ?, '', 0)", album2, b)
    # an old gallery block (album as a number, the template's settings) still works, in the album's own layout
    assert _put(c, sid, "index", [{"id": "g1", "type": "gallery", "data": {"heading": "Our cakes", "album": album, "lightbox": True}}]).status_code == 200
    html = c.get(f"/sites/{sid}/preview/index").text
    assert "tw-gal-grid" in html and "data-tw-lb" in html and 'alt="A three-tier cake"' in html and "Pic 0" in html
    assert "widgets/lightbox/lightbox.js" in html and "widgets/modkit/modkit.js" in html
    # several albums with filters by album; carousel
    _put(c, sid, "index", [{"id": "g1", "type": "gallery", "data": {"source": "albums", "filters": True, "layout": "carousel"}}])
    html = c.get(f"/sites/{sid}/preview/index").text
    assert 'data-tw-filter="Weddings"' in html and 'data-tw-filter="Shop"' in html and "data-tw-carousel" in html and "data-tw-prev" in html
    _put(c, sid, "index", [{"id": "g1", "type": "gallery", "data": {"source": "albums", "album_tag": "cakes"}}])
    assert "Sourdough" not in c.get(f"/sites/{sid}/preview/index").text
    # by Media Center tag; the chips are the other tags
    _put(c, sid, "index", [{"id": "g1", "type": "gallery", "data": {"source": "tag", "tag": "Cakes", "filters": True}}])
    html = c.get(f"/sites/{sid}/preview/index").text
    assert "Lemon tart" in html and "Sourdough" not in html and 'data-tw-filter="weddings"' in html
    # nothing to show: a hint in the CMS, nothing on the live site
    _put(c, sid, "index", [{"id": "g1", "type": "gallery", "data": {"source": "tag", "tag": "nope"}}])
    assert "Tag pictures in the Media Center" in c.get(f"/sites/{sid}/preview/index").text
    folder = _deploy(c, sid)
    assert "tw-gal" not in (folder / "index.html").read_text()


def test_video_gallery_parses_links_and_csp_is_per_page(cms):
    c, sid = cms
    from cms.widgets.video_gallery import parse
    assert parse("https://youtu.be/dQw4w9WgXcQ") == ("youtube", "dQw4w9WgXcQ")
    assert parse("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3") == ("youtube", "dQw4w9WgXcQ")
    assert parse("https://vimeo.com/76979871") == ("vimeo", "76979871")
    bad = _put(c, sid, "index", [{"id": "v1", "type": "video_gallery", "data": {"items": [{"title": "x", "url": "https://evil.example/v"}]}}])
    assert bad.status_code == 400
    r = _put(c, sid, "index", [{"id": "v1", "type": "video_gallery", "data": {"heading": "Watch", "youtube_thumbs": False, "items": [
        {"title": "Proofing dough", "url": "https://youtu.be/dQw4w9WgXcQ"}, {"title": "Decorating", "url": "https://vimeo.com/76979871"}]}}])
    assert r.status_code == 200, r.text
    html = c.get(f"/sites/{sid}/preview/index").text
    assert "youtube-nocookie.com/embed/dQw4w9WgXcQ" in html and "player.vimeo.com/video/76979871?autoplay=1&amp;dnt=1" in html
    assert "i.ytimg.com" not in html and "<iframe" not in html                       # nothing loads before play
    assert 'aria-label="Play video: Proofing dough"' in html
    _put(c, sid, "about", [{"id": "t1", "type": "text", "data": {"heading": "Hi", "body": "<p>Plain</p>"}}])
    folder = _deploy(c, sid)
    sub = sites.get(sid)["subdomain"]
    frames = next(d for d in _csp(c, sub, "index.html").split("; ") if d.startswith("frame-src"))
    assert "https://www.youtube-nocookie.com" in frames and "https://player.vimeo.com" in frames
    about = next(d for d in _csp(c, sub, "about.html").split("; ") if d.startswith("frame-src"))
    assert about == "frame-src 'self'"                                            # no video players where there are no videos
    # a YouTube iframe pasted in Custom HTML allows that host on its page only
    _put(c, sid, "about", [{"id": "h1", "type": "html", "data": {"html": '<iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"></iframe>'}}])
    _deploy(c, sid)
    assert "https://www.youtube-nocookie.com" in _csp(c, sub, "about.html")


def test_before_after_upgrade_keeps_old_blocks_and_adds_pairs(cms):
    c, sid = cms
    b1, a1 = _media(sid, "kitchen-before.webp", alt="Old kitchen"), _media(sid, "kitchen-after.webp", alt="New kitchen")
    b2, a2 = _media(sid, "bath-before.webp"), _media(sid, "bath-after.webp")
    _put(c, sid, "index", [{"id": "b1", "type": "before_after", "data": {"heading": "Kitchen", "before": b1, "after": a1, "caption": "Kitchen refit"}}])
    html = c.get(f"/sites/{sid}/preview/index").text
    assert 'type="range"' in html and 'aria-valuetext="50% before, 50% after"' in html and "Before: Old kitchen" in html
    _put(c, sid, "index", [{"id": "b1", "type": "before_after", "data": {"before": b1, "after": a1, "direction": "vertical", "start": 30,
                                                                        "before_label": "Then", "after_label": "Now",
                                                                        "more": [{"before": b2, "after": a2, "caption": "Bathroom"}]}}])
    html = c.get(f"/sites/{sid}/preview/index").text
    assert html.count("data-tw-ba") == 2 and "tw-ba-v" in html and "--pos:30%" in html and "30% then, 70% now" in html
    assert 'aria-orientation="vertical"' in html and "Bathroom" in html
    assert _put(c, sid, "index", [{"id": "b1", "type": "before_after", "data": {"start": 150}}]).status_code == 400


def test_secret_settings_are_masked_and_kept(cms):
    """Module keys (marked secret) never go back to the browser in full; saving the mask keeps the key."""
    c, sid = cms
    from pydantic import BaseModel, Field
    from markupsafe import Markup

    class S(BaseModel):
        api_key: str = Field("", json_schema_extra={"secret": True})
        name: str = ""
    w = widgets.register(widgets.Widget(name="secret_probe", label="Probe", about="", config=BaseModel, settings=S,
                                        render=lambda b, x: Markup(""), hidden=True))
    try:
        r = c.put(f"/api/sites/{sid}/widgets/secret_probe/settings", json={"api_key": "sk-live-123456789", "name": "a"}, headers=H)
        assert r.json()["settings"]["api_key"] == widgets.MASK + "6789"
        assert "sk-live" not in c.get(f"/api/sites/{sid}/widgets/secret_probe/settings").text
        assert "sk-live" not in c.get(f"/sites/{sid}/widgets/secret_probe").text
        c.put(f"/api/sites/{sid}/widgets/secret_probe/settings", json={"api_key": widgets.MASK + "6789", "name": "b"}, headers=H)
        assert widgets.load_settings(sid, "secret_probe").api_key == "sk-live-123456789"
        c.put(f"/api/sites/{sid}/widgets/secret_probe/settings", json={"api_key": "", "name": "b"}, headers=H)
        assert widgets.load_settings(sid, "secret_probe").api_key == ""
    finally:
        widgets.REGISTRY.pop("secret_probe", None)


# ---------------------------------------------------------------------------------------------- 2. calendars and booking

def _host(sid):
    return {"host": f"{sites.get(sid)['subdomain']}.{config.SITES_DOMAIN}", "accept": "application/json"}


def _days_ahead(n, tzname="America/Chicago"):
    from datetime import datetime, timedelta
    from zoneinfo import ZoneInfo
    return (datetime.now(ZoneInfo(tzname)).date() + timedelta(days=n))


def test_timezone_setting(cms):
    from cms import sitetime
    c, sid = cms
    assert c.post(f"/api/sites/{sid}/settings", json={"timezone": "Mars/Olympus"}, headers=H).status_code == 400
    assert c.post(f"/api/sites/{sid}/settings", json={"timezone": "Europe/London"}, headers=H).status_code == 200
    assert sitetime.get(sid) == "Europe/London" and 'value="Europe/London" selected' in c.get(f"/sites/{sid}/settings").text
    c.post(f"/api/sites/{sid}/settings", json={"timezone": "America/Chicago"}, headers=H)


def test_events_views_pages_ics_rsvp_capacity_waitlist(cms, monkeypatch):
    from cms import mail, ratelimit
    c, sid = cms
    monkeypatch.setattr(ratelimit, "PER_IP", 1000)                 # checked on its own at the end
    monkeypatch.setenv("TENSHI_MAIL_TEST", "1")
    mail.sent.clear()
    soon, later = _days_ahead(10).isoformat(), _days_ahead(40).isoformat()
    evs = [{"title": "Bread class", "date": soon, "start": "18:00", "end": "20:00", "location": "The bakery, 1 Main St", "capacity": 3,
            "waitlist": True, "max_guests": 2, "category": "Classes", "description": "Learn sourdough."},
           {"title": "Pie night", "date": later, "all_day": True, "capacity": 2, "waitlist": False},
           {"title": "Old fair", "date": "2020-05-01", "rsvp": True},
           {"title": "Gala", "date": later, "tickets_link": "https://tickets.example.com/gala"}]
    assert _put(c, sid, "about", [{"id": "ev1", "type": "events", "data": {"heading": "What's on", "view": "month", "items": evs}}]).status_code == 200
    assert _put(c, sid, "about", [{"id": "ev1", "type": "events", "data": {"items": [{"title": "x", "date": "2026-13-01"}]}}]).status_code == 400
    _put(c, sid, "about", [{"id": "ev1", "type": "events", "data": {"heading": "What's on", "view": "month", "items": evs}}])
    html = c.get(f"/sites/{sid}/preview/about").text
    assert "Bread class" in html and "data-tw-cal-data" in html and 'data-view="month"' in html and "events.ics" in html
    assert "Old fair</a></h3>" not in html                          # past events not listed by default (the month grid still shows them)
    slug = f"bread-class-{soon}"
    page = c.get(f"/sites/{sid}/preview/event-{slug}")
    assert page.status_code == 200 and "Learn sourdough." in page.text and '"@type": "Event"' in page.text and 'name="_block"' in page.text
    assert "&lt;" not in page.text.split("<main")[-1].split("</main>")[0] and '<input type="email" name="email"' in page.text
    assert "tickets.example.com/gala" in c.get(f"/sites/{sid}/preview/event-gala-{later}").text
    ics = c.get(f"/sites/{sid}/preview/events.ics")
    assert ics.status_code == 200 and "BEGIN:VCALENDAR" in ics.text and ics.text.count("BEGIN:VEVENT") >= 3 and "SUMMARY:Bread class" in ics.text
    assert "\r\n" in ics.text and "DTSTART;VALUE=DATE:" in ics.text     # Pie night is all day
    # preview RSVP: checked, never saved
    r = c.post(f"/sites/{sid}/preview/__w/events/rsvp", data={"_block": "about/ev1", "event": slug, "name": "Pat", "email": "pat@example.com"})
    assert r.status_code == 200 and "Preview" in r.json()["message"] and not db.one("SELECT 1 FROM rsvps WHERE site_id = ?", sid)
    folder = _deploy(c, sid)
    assert (folder / f"event-{slug}.html").exists() and (folder / "events.ics").exists() and (folder / f"event-{slug}.ics").exists()
    h = _host(sid)
    db.run("DELETE FROM form_posts")
    post = lambda **d: c.post("/__w/events/rsvp", data={"_block": "about/ev1", "event": slug, **d}, headers=h)
    assert post(name="", email="a@example.com").json()["field"] == "name"
    assert post(name="A", email="nope").json()["field"] == "email"
    assert post(name="A", email="a@example.com", guests="3").json()["field"] == "guests"     # max 2 per RSVP
    r = post(name="Ann", email="ann@example.com", guests="2")
    assert r.json()["ok"] and r.json()["status"] == "going"
    assert post(name="Ann", email="ANN@example.com").json()["message"].startswith("You're already")
    assert post(name="Bo", email="bo@example.com", guests="1").json()["status"] == "going"      # 3 of 3
    r = post(name="Cy", email="cy@example.com")
    assert r.json()["status"] == "waitlist" and "number 1" in r.json()["message"]
    assert post(name="Bot", email="bot@example.com", _hp="spam").json()["ok"]
    assert not db.one("SELECT 1 FROM rsvps WHERE email = 'bot@example.com'")
    rows = db.all("SELECT * FROM rsvps WHERE site_id = ? ORDER BY id", sid)
    assert [r["status"] for r in rows] == ["going", "going", "waitlist"]
    assert db.one("SELECT COUNT(*) AS n FROM leads WHERE site_id = ? AND page = ?", sid, f"event-{slug}")["n"] == 3
    assert len(mail.sent) == 3 and "Bread class" in mail.sent[0]["Subject"]
    # a full event without a waitlist refuses
    r = c.post("/__w/events/rsvp", data={"_block": "about/ev1", "event": f"pie-night-{later}", "name": "D", "email": "d@example.com", "guests": "3"}, headers=h)
    assert r.status_code == 409 and "Only 2 places left" in r.json()["error"]     # no waitlist: 3 people > 2 places
    r = c.post("/__w/events/rsvp", data={"_block": "about/ev1", "event": f"pie-night-{later}", "name": "D", "email": "d@example.com", "guests": "2"}, headers=h)
    assert r.json()["status"] == "going"
    r = c.post("/__w/events/rsvp", data={"_block": "about/ev1", "event": f"pie-night-{later}", "name": "E", "email": "e@example.com"}, headers=h)
    assert r.status_code == 409 and "full" in r.json()["error"]
    # past events and unknown blocks / ticketed events
    assert c.post("/__w/events/rsvp", data={"_block": "about/ev1", "event": "old-fair-2020-05-01", "name": "F", "email": "f@example.com"}, headers=h).status_code == 400
    assert c.post("/__w/events/rsvp", data={"_block": "about/nope", "event": slug, "name": "F", "email": "f@example.com"}, headers=h).status_code == 404
    # places left
    st = c.get(f"/__w/events/status?_block=about/ev1", headers=h).json()["events"]
    assert st[slug]["left"] == 0 and st[slug]["full"] and st[f"pie-night-{later}"]["full"]
    # the inbox: moving the waitlisted person to going would overbook
    page = c.get(f"/sites/{sid}/inbox/rsvps")
    assert page.status_code == 200 and "Cy" in page.text
    cy = rows[2]["id"]
    assert c.patch(f"/api/sites/{sid}/inbox/rsvps/{cy}", json={"status": "going"}, headers=H).status_code == 400
    assert c.patch(f"/api/sites/{sid}/inbox/rsvps/{rows[1]['id']}", json={"status": "cancelled"}, headers=H).status_code == 200
    assert c.patch(f"/api/sites/{sid}/inbox/rsvps/{cy}", json={"status": "going"}, headers=H).status_code == 200
    assert c.patch(f"/api/sites/{sid}/inbox/rsvps/{cy}", json={"status": "nonsense"}, headers=H).status_code == 400
    # mail off: RSVPs still work, nothing is sent
    monkeypatch.delenv("TENSHI_MAIL_TEST")
    mail.sent.clear()
    db.run("DELETE FROM form_posts")
    assert c.post("/__w/events/rsvp", data={"_block": "about/ev1", "event": slug, "name": "G", "email": "g@example.com"}, headers=h).json()["ok"]
    assert mail.sent == []
    # rate-limited like the contact forms
    monkeypatch.setattr(ratelimit, "PER_IP", 5)
    db.run("DELETE FROM form_posts")
    codes = [c.post("/__w/events/rsvp", data={"_block": "about/ev1", "event": slug, "name": "H", "email": f"h{i}@example.com"}, headers=h).status_code
             for i in range(6)]
    assert codes[-1] == 429


def test_hours_badge_data_holidays_and_schema(cms):
    import json
    c, sid = cms
    hol = _days_ahead(5).isoformat()
    days = [{"day": "mon", "opens": "09:00", "closes": "17:00"}, {"day": "fri", "opens": "18:00", "closes": "02:00"}, {"day": "sun", "closed": True}]
    assert _put(c, sid, "services", [{"id": "h1", "type": "hours", "data": {"days": [{"day": "mon", "opens": "9am"}]}}]).status_code == 400
    assert _put(c, sid, "services", [{"id": "h1", "type": "hours", "data": {"days": days, "holidays": [{"date": hol, "label": "Founders' day"}],
                                                                             "note": "Late on Fridays"}}]).status_code == 200
    html = c.get(f"/sites/{sid}/preview/services").text
    assert "data-tw-open" in html and "Founders&#39; day" in html and "6 pm – 2 am" in html and "Closed" in html and "Late on Fridays" in html
    data = json.loads(html.split("data-tw-hours-data>")[1].split("</script>")[0])
    assert data["tz"] == "America/Chicago" and data["week"]["fri"] == [["18:00", "02:00"]] and data["holidays"][hol] == []
    assert "OpeningHoursSpecification" in html and "widgets/hours/hours.js" in html


def test_appointments_slots_buffers_staff_and_double_booking(cms, monkeypatch):
    from cms import mail, ratelimit
    monkeypatch.setattr(ratelimit, "PER_IP", 1000)
    from cms.widgets import appointments as ap
    c, sid = cms
    monkeypatch.delenv("TENSHI_MAIL_TEST", raising=False)
    day = _days_ahead(3)
    while day.weekday() > 3:                                        # a Mon–Thu, a few days ahead
        day = day.fromordinal(day.toordinal() + 1)
    cfg = {"services": [{"name": "Cut", "minutes": 30, "buffer_after": 15, "price": "$30"}, {"name": "Colour", "minutes": 90}],
           "staff": [{"name": "Alex", "services": "Cut"}, {"name": "Sam", "services": "cut, colour", "opens": "12:00", "closes": "14:00"}],
           "opens": "09:00", "closes": "12:00", "step": 30, "buffer_before": 0, "notice_hours": 1, "closed_dates": ""}
    assert _put(c, sid, "contact", [{"id": "ap1", "type": "appointments", "data": {**cfg, "days": "mon, funday"}}]).status_code == 400
    assert _put(c, sid, "contact", [{"id": "ap1", "type": "appointments", "data": cfg}]).status_code == 200
    html = c.get(f"/sites/{sid}/preview/contact").text
    assert "data-tw-appt" in html and "Anyone available" in html and "$30" in html and "appointments.js" in html
    assert "&lt;select" not in html and '<select name="service"' in html
    slots = lambda **q: c.get(f"/sites/{sid}/preview/__w/appointments/slots", params={"_block": "contact/ap1", "date": day.isoformat(), **q}).json()
    t = [x["t"] for x in slots(service="0", staff="any")["times"]]
    assert t[0] == "09:00" and "11:30" in t and "12:00" in t and "13:30" in t and "14:00" not in t     # Alex 9–12, Sam 12–14
    assert [x["t"] for x in slots(service="1", staff="any")["times"]] == ["12:00", "12:30"]          # only Sam colours; 90 min
    assert slots(service="1", staff="0")["ok"] is False                                             # Alex doesn't colour
    folder = _deploy(c, sid)
    h = _host(sid)
    db.run("DELETE FROM form_posts")
    book = lambda **d: c.post("/__w/appointments/book", data={"_block": "contact/ap1", "service": "0", "staff": "0", "date": day.isoformat(),
                                                             "name": "Kim", "email": "kim@example.com", **d}, headers=h)
    r = book(time="10:00")
    assert r.json()["ok"] and r.json()["status"] == "confirmed" and "confirmation" not in r.json()["message"]   # mail off: no promise
    assert book(time="10:00").status_code == 409                    # taken
    assert book(time="09:30").status_code == 409                    # 09:30–10:00 runs into the 10:00 booking
    assert book(time="10:30").status_code == 409                    # inside 10:00's 15-minute buffer after
    assert book(time="11:00").json()["ok"]
    assert book(time="10:15").status_code == 409                    # not a start time / overlaps
    live = lambda **q: c.get("/__w/appointments/slots", params={"_block": "contact/ap1", "date": day.isoformat(), "service": "0", **q}, headers=h).json()
    alex = [x["t"] for x in live(staff="0")["times"]]
    assert "10:00" not in alex and "10:30" not in alex and "09:00" in alex
    anyone = [x["t"] for x in live(staff="any")["times"]]
    assert "10:00" not in anyone and "12:00" in anyone
    # past / too far / closed dates give nothing
    assert live(staff="any", date=_days_ahead(-1).isoformat())["times"] == []
    assert live(staff="any", date=_days_ahead(400).isoformat())["times"] == []
    assert book(time="09:00", email="bad").json()["field"] == "email"
    assert book(time="09:00", _hp="x").json()["ok"] and db.one("SELECT COUNT(*) AS n FROM bookings WHERE site_id = ?", sid)["n"] == 2
    # inbox + not double-booking when un-cancelling
    rows = db.all("SELECT * FROM bookings WHERE site_id = ? ORDER BY id", sid)
    assert c.get(f"/sites/{sid}/inbox/bookings").status_code == 200
    assert c.patch(f"/api/sites/{sid}/inbox/bookings/{rows[0]['id']}", json={"status": "cancelled"}, headers=H).status_code == 200
    assert book(time="10:00", name="Lee", email="lee@example.com").json()["ok"]
    assert c.patch(f"/api/sites/{sid}/inbox/bookings/{rows[0]['id']}", json={"status": "confirmed"}, headers=H).status_code == 400
    # with mail on, the customer gets a confirmation; approval mode books as "requested"
    monkeypatch.setenv("TENSHI_MAIL_TEST", "1")
    mail.sent.clear()
    r = book(time="09:00", name="Mo", email="mo@example.com")
    assert r.json()["ok"] and "confirmation" in r.json()["message"] and mail.sent and "Booking confirmed" in mail.sent[-1]["Subject"]
    # deposits stay off whatever is sent
    r = c.put(f"/api/sites/{sid}/widgets/appointments/settings", json={"deposits_enabled": True, "deposit_percent": 20}, headers=H)
    assert r.status_code == 200 and r.json()["settings"]["deposits_enabled"] is False
    assert "Coming later" in c.get(f"/sites/{sid}/widgets/appointments").text


# ---------------------------------------------------------------------------------------------- 3. testimonials and trust

def test_testimonials_layouts_sources_and_no_google_without_key(cms, monkeypatch):
    from cms import modcache
    c, sid = cms
    called = []
    monkeypatch.setattr(modcache, "http_json", lambda *a, **k: called.append(a) or {})
    prof = db.j(sites.get(sid)["profile_json"])
    prof["testimonials"] = [{"quote": "Best croissants in town.", "author": "Rita M.", "rating": 5}, {"quote": "Fine bread.", "author": "Lou", "rating": 3}]
    sites.save_profile(sid, prof)
    # an old block (just a heading) keeps working, from Business data
    assert _put(c, sid, "index", [{"id": "t1", "type": "testimonials", "data": {"heading": "Kind words"}}]).status_code == 200
    html = c.get(f"/sites/{sid}/preview/index").text
    assert "Kind words" in html and "Best croissants in town." in html and "data-tw-carousel" in html and "4 out of 5 stars" in html  # average 4.0
    assert "Places API key" in html                                  # builder hint, preview only
    assert not called                                                # no key: Google is never asked
    _put(c, sid, "index", [{"id": "t1", "type": "testimonials", "data": {"layout": "featured", "min_rating": 4, "items": [
        {"quote": "They made our wedding cake perfect.", "author": "Jo & Sam", "role": "Newlyweds", "rating": 5, "featured": True}]}}])
    html = c.get(f"/sites/{sid}/preview/index").text
    assert "tw-tm-big" in html and html.index("wedding cake perfect") < html.index("Best croissants") and "Fine bread." not in html
    _put(c, sid, "index", [{"id": "t1", "type": "testimonials", "data": {"layout": "wall", "from_google": False}}])
    html = c.get(f"/sites/{sid}/preview/index").text
    assert "tw-tm-wall" in html and "Places API key" not in html
    folder = _deploy(c, sid)
    live = (folder / "index.html").read_text()
    assert "Places API key" not in live and "tw-builder-hint" not in live


def test_google_reviews_with_a_key_are_cached_and_the_key_stays_private(cms, monkeypatch):
    from cms import modcache
    c, sid = cms
    calls = []

    def fake(url, headers=None, **k):
        calls.append((url, headers))
        return {"rating": 4.7, "userRatingCount": 128, "googleMapsUri": "https://maps.google.com/?cid=1",
                "reviews": [{"rating": 5, "text": {"text": "Lovely staff <b>and</b> coffee"}, "authorAttribution": {"displayName": "G. Reviewer"},
                             "relativePublishTimeDescription": "a week ago"}]}
    monkeypatch.setattr(modcache, "http_json", fake)
    modcache.clear(sid)
    assert c.put(f"/api/sites/{sid}/widgets/testimonials/settings", json={"places_key": "AIzaSECRET123456", "place_id": "bad id!"}, headers=H).status_code == 400
    assert c.put(f"/api/sites/{sid}/widgets/testimonials/settings", json={"places_key": "AIzaSECRET123456", "place_id": "ChIJN1t_tDeuEmsRUsoyG83frY4"},
                 headers=H).status_code == 200
    _put(c, sid, "index", [{"id": "t1", "type": "testimonials", "data": {"layout": "wall"}}])
    html = c.get(f"/sites/{sid}/preview/index").text
    assert "Lovely staff &lt;b&gt;and&lt;/b&gt; coffee" in html and "on Google" in html and "128 Google reviews" in html and "4.7" in html
    assert "AIzaSECRET" not in html and calls[0][1]["X-Goog-Api-Key"] == "AIzaSECRET123456" and "ChIJN1t_tDeuEmsRUsoyG83frY4" in calls[0][0]
    c.get(f"/sites/{sid}/preview/index")
    assert len(calls) == 1                                           # cached
    db.run("UPDATE widget_cache SET fetched_at = '2000-01-01T00:00:00Z' WHERE site_id = ?", sid)
    monkeypatch.setattr(modcache, "http_json", lambda *a, **k: (_ for _ in ()).throw(OSError("down")))
    assert "Lovely staff" in c.get(f"/sites/{sid}/preview/index").text     # Google down: the last good copy
    c.put(f"/api/sites/{sid}/widgets/testimonials/settings", json={"places_key": "", "place_id": ""}, headers=H)
    assert "Lovely staff" not in c.get(f"/sites/{sid}/preview/index").text  # key removed: hidden


def test_review_form_waits_for_approval_by_an_owner(cms, monkeypatch):
    from cms import ratelimit
    c, sid = cms
    monkeypatch.setattr(ratelimit, "PER_IP", 1000)
    _put(c, sid, "contact", [{"id": "rv1", "type": "review_form", "data": {}}])
    _put(c, sid, "index", [{"id": "t1", "type": "testimonials", "data": {"layout": "wall", "from_business": False, "from_google": False}}])
    html = c.get(f"/sites/{sid}/preview/contact").text
    assert 'name="rating"' in html and 'name="consent"' in html and "&lt;" not in html.split("tw-rv-form")[1].split("</form>")[0]
    good = {"_block": "contact/rv1", "rating": "5", "quote": "Wonderful sourdough, friendly team.", "name": "Ola", "role": "Regular", "consent": "yes"}
    r = c.post(f"/sites/{sid}/preview/__w/review_form/send", data=good)
    assert r.json()["ok"] and "Preview" in r.json()["message"] and not db.one("SELECT 1 FROM reviews WHERE site_id = ?", sid)
    _deploy(c, sid)
    h = _host(sid)
    send = lambda **d: c.post("/__w/review_form/send", data={**good, **d}, headers=h)
    assert send(rating="9").json()["field"] == "rating"
    assert send(quote="ok").json()["field"] == "quote"
    assert send(consent="").json()["field"] == "consent"
    assert send(email="nope").json()["field"] == "email"
    assert send(_hp="bot").json()["ok"] and not db.one("SELECT 1 FROM reviews WHERE site_id = ?", sid)
    assert send().json()["ok"]
    row = db.one("SELECT * FROM reviews WHERE site_id = ?", sid)
    assert row["status"] == "pending"
    # nothing shows until approved: not in the preview, not from the live endpoint
    assert "Wonderful sourdough" not in c.get(f"/sites/{sid}/preview/index").text
    assert c.get("/__w/testimonials/reviews?_block=index/t1", headers=h).json()["reviews"] == []
    # an editor can't approve
    _user("mod-editor@example.com", "correct-horse-9")
    uid = db.one("SELECT id FROM users WHERE email = ?", "mod-editor@example.com")["id"]
    db.run("INSERT OR IGNORE INTO site_members (site_id, user_id, role, created_at) VALUES (?, ?, 'editor', ?)", sid, uid, db.now())
    with TestClient(app) as ed:
        _login(ed, "mod-editor@example.com", "correct-horse-9")
        assert ed.patch(f"/api/sites/{sid}/inbox/reviews/{row['id']}", json={"status": "approved"}, headers=H).status_code == 403
    assert "Wonderful sourdough" in c.get(f"/sites/{sid}/inbox/reviews").text
    assert c.patch(f"/api/sites/{sid}/inbox/reviews/{row['id']}", json={"status": "approved"}, headers=H).status_code == 200
    got = c.get("/__w/testimonials/reviews?_block=index/t1", headers=h).json()["reviews"]
    assert got[0]["quote"].startswith("Wonderful") and "email" not in got[0]          # live site picks it up without republishing
    html = c.get(f"/sites/{sid}/preview/index").text
    assert "Wonderful sourdough" in html and f'data-review-id="{row["id"]}"' in html
    c.patch(f"/api/sites/{sid}/inbox/reviews/{row['id']}", json={"status": "hidden"}, headers=H)
    assert c.get("/__w/testimonials/reviews?_block=index/t1", headers=h).json()["reviews"] == []


def test_trust_badges_and_case_studies(cms):
    c, sid = cms
    logo = _media(sid, "bbb.webp", alt="Better Business Bureau")
    assert _put(c, sid, "about", [{"id": "tb1", "type": "trust_badges", "data": {"items": [{"icon": "secure", "link": "javascript:alert(1)"}]}}]).status_code == 400
    assert _put(c, sid, "about", [
        {"id": "tb1", "type": "trust_badges", "data": {"heading": "Why bake with us", "style": "cards", "items": [
            {"icon": "licensed", "detail": "Food licence #4821"}, {"icon": "", "image": logo, "link": "https://www.bbb.org/x"}, {"icon": "", "label": "Nothing"}]}},
        {"id": "cs1", "type": "case_studies", "data": {"filters": True, "items": [
            {"title": "Café chain rollout", "client": "Brew & Co", "tags": "Wholesale", "metrics": "+38% | more orders\n2× | faster delivery",
             "challenge": "Twelve sites, one oven.", "quote": "Never late.", "quote_by": "Ops lead"},
            {"title": "Wedding season", "tags": "Events", "metrics": "120 | cakes"}]}}]).status_code == 200
    html = c.get(f"/sites/{sid}/preview/about").text
    assert "Food licence #4821" in html and "<svg" in html and 'href="https://www.bbb.org/x"' in html and "Nothing</b>" not in html
    assert "+38%" in html and "more orders" in html and "Read the full story" in html and "Twelve sites, one oven." in html
    assert 'data-tw-filter="Wholesale"' in html and 'data-tw-filter="Events"' in html
    bad = {"id": "cs1", "type": "case_studies", "data": {"items": [{"title": "x", "metrics": "just a number"}]}}
    assert _put(c, sid, "about", [bad]).status_code == 400


# ---------------------------------------------------------------------------------------------- 4. social

def test_social_feed_hidden_without_key_and_cached_with_one(cms, monkeypatch):
    from cms import modcache
    c, sid = cms
    calls = []
    monkeypatch.setattr(modcache, "http_json", lambda url, headers=None, **k: calls.append((url, headers)) or {})
    assert _put(c, sid, "services", [{"id": "sf1", "type": "social_feed", "data": {"network": "x", "heading": "On X"}}]).status_code == 200
    html = c.get(f"/sites/{sid}/preview/services").text
    assert "tw-builder-hint" in html and "hidden on the published site" in html and not calls
    folder = _deploy(c, sid)
    assert "tw-sfs" not in (folder / "services.html").read_text()            # nothing on the live page
    assert "pbs.twimg.com" not in _csp(c, sites.get(sid)["subdomain"], "services.html")

    def fake(url, headers=None, **k):
        calls.append((url, headers))
        if "/users/by/username/" in url:
            return {"data": {"id": "42"}}
        return {"data": [{"id": "1001", "text": "Fresh <bread> today", "created_at": "2026-11-20T10:00:00Z", "attachments": {"media_keys": ["m1"]}},
                         {"id": "1002", "text": "Closed Monday", "created_at": "2026-11-18T10:00:00Z"}],
                "includes": {"media": [{"media_key": "m1", "type": "photo", "url": "https://pbs.twimg.com/media/a.jpg"}]}}
    monkeypatch.setattr(modcache, "http_json", fake)
    assert c.put(f"/api/sites/{sid}/widgets/social_feed/settings", json={"x_bearer": "BEARER-SECRET-1", "x_username": "bad name!"}, headers=H).status_code == 400
    assert c.put(f"/api/sites/{sid}/widgets/social_feed/settings", json={"x_bearer": "BEARER-SECRET-1", "x_username": "@modbakery"}, headers=H).status_code == 200
    calls.clear()
    html = c.get(f"/sites/{sid}/preview/services").text
    assert "Fresh &lt;bread&gt; today" in html and "https://x.com/modbakery/status/1001" in html and "pbs.twimg.com/media/a.jpg" in html
    assert "BEARER-SECRET" not in html and calls[0][1]["Authorization"] == "Bearer BEARER-SECRET-1" and 'href="https://x.com/modbakery"' in html
    c.get(f"/sites/{sid}/preview/services")
    assert len(calls) == 2                                                   # user + posts once; then cached
    folder = _deploy(c, sid)
    sub = sites.get(sid)["subdomain"]
    assert "Fresh &lt;bread&gt;" in (folder / "services.html").read_text() and "https://pbs.twimg.com" in _csp(c, sub, "services.html")
    assert "pbs.twimg.com" not in _csp(c, sub, "index.html")
    items = c.get("/__w/social_feed/items?_block=services/sf1", headers=_host(sid)).json()["items"]
    assert items[0]["url"] == "https://x.com/modbakery/status/1001" and "BEARER" not in str(items)
    c.put(f"/api/sites/{sid}/widgets/social_feed/settings", json={"x_bearer": "", "x_username": ""}, headers=H)


def test_share_buttons_and_click_to_post_are_plain_links(cms):
    c, sid = cms
    assert _put(c, sid, "about", [{"id": "sh1", "type": "share_buttons", "data": {"networks": "x, myspace"}}]).status_code == 400
    assert _put(c, sid, "about", [{"id": "sh1", "type": "share_buttons", "data": {"networks": "x, linkedin, email", "text": "Fresh bread & more"}},
                                  {"id": "ct1", "type": "click_to_tweet", "data": {"quote": "Bread is love.", "via": "@modbakery", "hashtags": "bread, #sourdough"}}]).status_code == 200
    html = c.get(f"/sites/{sid}/preview/about").text
    sub = sites.get(sid)["subdomain"]
    assert "https://x.com/intent/post?text=Fresh%20bread%20%26%20more&amp;url=http" in html and f"{sub}.{config.SITES_DOMAIN}" in html and "about.html" in html
    assert "https://www.linkedin.com/sharing/share-offsite/?url=" in html and "mailto:?subject=" in html and "facebook" not in html.split("tw-shs")[1].split("</section>")[0]
    assert "via=modbakery" in html and "hashtags=bread%2Csourdough" in html and "Bread is love." in html
    assert "<script src=\"https://" not in html and "platform.twitter.com" not in html and "connect.facebook.net" not in html
    assert _put(c, sid, "about", [{"id": "ct1", "type": "click_to_tweet", "data": {"quote": "x" * 241}}]).status_code == 400


def test_link_in_bio_page(cms):
    c, sid = cms
    prof = db.j(sites.get(sid)["profile_json"])
    prof["social"] = {"instagram": "https://instagram.com/modbakery", "tiktok": "javascript:alert(1)"}
    sites.save_profile(sid, prof)
    assert _put(c, sid, "about", [{"id": "lb1", "type": "link_in_bio", "data": {"links": [{"label": "Bad", "url": "javascript:alert(1)"}]}}]).status_code == 400
    assert _put(c, sid, "about", [{"id": "lb1", "type": "link_in_bio", "data": {"bio": "Sourdough every morning.", "links": [
        {"label": "Order a cake", "url": "contact", "highlight": True, "emoji": "🎂"}, {"label": "Our Etsy", "url": "https://etsy.com/shop/x", "note": "Gift boxes"}]}}]).status_code == 200
    html = c.get(f"/sites/{sid}/preview/about").text
    assert "data-tw-solo" in html and "Order a cake" in html and "tw-lib-hi" in html and 'href="https://etsy.com/shop/x"' in html
    assert 'href="https://instagram.com/modbakery"' in html and "javascript:" not in html and "link_in_bio.css" in html


def test_autopost_only_suggests_and_posts_after_approval(cms, monkeypatch):
    from cms import modcache
    c, sid = cms
    sent = []
    monkeypatch.setattr(modcache, "post_webhook", lambda url, payload, secret="", timeout=10: sent.append((url, payload, secret)) or 200)
    pid = db.run("INSERT INTO posts (site_id, title, slug, excerpt, body, status, published_at, created_at, updated_at) "
                 "VALUES (?, 'Winter menu', 'winter-menu', 'Soups and stollen.', 'Body', 'published', ?, ?, ?)", sid, db.now(), db.now(), db.now())
    _deploy(c, sid)
    assert not db.one("SELECT 1 FROM social_posts WHERE site_id = ?", sid)       # off by default: nothing suggested
    assert "Suggestions are off" in c.get(f"/sites/{sid}/inbox/social").text
    assert c.put(f"/api/sites/{sid}/widgets/autopost/settings", json={"enabled": True, "webhook_url": "http://127.0.0.1/hook"}, headers=H).status_code == 400
    assert c.put(f"/api/sites/{sid}/widgets/autopost/settings", json={"enabled": True}, headers=H).status_code == 200
    assert "Auto-post on publish" in c.get(f"/sites/{sid}/modules").text
    _deploy(c, sid)
    _deploy(c, sid)                                                               # publishing again doesn't duplicate
    rows = db.all("SELECT * FROM social_posts WHERE site_id = ?", sid)
    assert len(rows) == 1 and rows[0]["status"] == "pending" and "Winter menu" in rows[0]["text"] and "post-winter-menu.html" in rows[0]["text"]
    assert sent == []                                                             # nothing posts by itself
    # an editor can't approve
    with TestClient(app) as ed:
        _login(ed, "mod-editor@example.com", "correct-horse-9")
        assert ed.patch(f"/api/sites/{sid}/inbox/social/{rows[0]['id']}", json={"status": "approved"}, headers=H).status_code == 403
    # no webhook: approved, nothing sent
    r = c.patch(f"/api/sites/{sid}/inbox/social/{rows[0]['id']}", json={"status": "approved"}, headers=H).json()
    assert r["status"] == "approved" and "post it yourself" in r["message"] and sent == []
    # with a webhook: approving sends once, signed, and marks it sent
    c.put(f"/api/sites/{sid}/widgets/autopost/settings", json={"enabled": True, "webhook_url": "https://postiz.example.com/hook/abc",
                                                               "webhook_secret": "whsec-1", "channels": "x, linkedin"}, headers=H)
    assert "postiz.example.com" not in c.get(f"/api/sites/{sid}/widgets/autopost/settings").text
    c.patch(f"/api/sites/{sid}/inbox/social/{rows[0]['id']}", json={"status": "pending"}, headers=H)
    r = c.patch(f"/api/sites/{sid}/inbox/social/{rows[0]['id']}", json={"status": "approved"}, headers=H).json()
    assert r["status"] == "sent" and r["reload"] and len(sent) == 1
    url, payload, secret = sent[0]
    assert url == "https://postiz.example.com/hook/abc" and secret == "whsec-1" and payload["channels"] == ["x", "linkedin"] and payload["text"] == rows[0]["text"]
    assert c.patch(f"/api/sites/{sid}/inbox/social/{rows[0]['id']}", json={"status": "approved"}, headers=H).status_code == 400   # already sent
    # a failing webhook is reported, not retried by itself
    db.run("INSERT INTO posts (site_id, title, slug, status, published_at, created_at, updated_at) VALUES (?, 'Stollen', 'stollen', 'published', ?, ?, ?)",
           sid, db.now(), db.now(), db.now())
    _deploy(c, sid)
    row = db.one("SELECT * FROM social_posts WHERE site_id = ? AND title = 'Stollen'", sid)
    monkeypatch.setattr(modcache, "post_webhook", lambda *a, **k: (_ for _ in ()).throw(OSError("down")))
    r = c.patch(f"/api/sites/{sid}/inbox/social/{row['id']}", json={"status": "approved"}, headers=H).json()
    assert r["status"] == "failed" and "couldn't be reached" in r["message"]
    c.put(f"/api/sites/{sid}/widgets/autopost/settings", json={"enabled": False, "webhook_url": "", "webhook_secret": ""}, headers=H)


def test_signed_webhook_body(monkeypatch):
    import hashlib
    import hmac
    import json
    from cms import modcache
    seen = {}

    class Res:
        status = 202
        def __enter__(self): return self
        def __exit__(self, *a): return False

    def fake_open(req, timeout=10):
        seen["body"], seen["sig"], seen["url"] = req.data, req.headers.get("X-tenshi-signature"), req.full_url
        return Res()
    monkeypatch.setattr(modcache, "public_https", lambda u: True)
    monkeypatch.setattr(modcache.urllib.request, "urlopen", fake_open)
    assert modcache.post_webhook("https://hooks.example.com/x", {"text": "hé"}, "s3cret") == 202
    assert seen["sig"] == "sha256=" + hmac.new(b"s3cret", seen["body"], hashlib.sha256).hexdigest() and json.loads(seen["body"])["text"] == "hé"


# ---------------------------------------------------------------------------------------------- 5. extras

def test_popup_frequency_and_triggers(cms):
    c, sid = cms
    assert _put(c, sid, "about", [{"id": "pp1", "type": "popup", "data": {"button_link": "javascript:alert(1)"}}]).status_code == 400
    assert _put(c, sid, "about", [{"id": "pp1", "type": "popup", "data": {
        "heading": "Fresh bread Fridays", "trigger": "scroll", "scroll": 40, "frequency": "days", "days": 3, "version": 2}}]).status_code == 200
    folder = _deploy(c, sid)
    html = open(os.path.join(folder, "about.html")).read()
    assert "<dialog" in html and 'data-trigger="scroll"' in html and 'data-scroll="40"' in html and 'data-days="3"' in html
    assert 'data-key="tw-pop:about:pp1:2"' in html and "popup.js" in html and "Fresh bread Fridays" in html
    js = open(os.path.join(folder, "_w", "popup", "popup.js")).read() if os.path.exists(os.path.join(folder, "_w", "popup", "popup.js")) else ""
    assert not js or "localStorage" in js
    # newsletter variant shows the sign-up form (posts with no block, so it uses the site's settings)
    _put(c, sid, "about", [{"id": "pp1", "type": "popup", "data": {"newsletter": True}}])
    html = c.get(f"/sites/{sid}/preview/about").text
    assert 'name="email"' in html and "tw-nl-form" in html and "&lt;" not in html.split("tw-pop")[1].split("</form>")[0]


FAKE_MC_KEY = "0123456789abcdef" * 2 + "-" + "us21"   # built at runtime: a made-up key, not a real one


def test_newsletter_without_key_saves_leads_and_with_key_goes_to_the_provider(cms, monkeypatch):
    from cms import modcache, ratelimit
    c, sid = cms
    monkeypatch.setattr(ratelimit, "PER_IP", 1000)
    _put(c, sid, "contact", [{"id": "nl1", "type": "newsletter", "data": {"ask_name": True, "consent": "Yes, email me news"}}])
    _deploy(c, sid)
    h = _host(sid)
    send = lambda **d: c.post("/__w/newsletter/subscribe", data={"_block": "contact/nl1", "email": "ola@example.com", "name": "Ola", "consent": "yes", **d}, headers=h)
    assert send(email="nope").json()["field"] == "email"
    assert send(consent="").json()["field"] == "consent"
    before = db.one("SELECT COUNT(*) AS n FROM leads WHERE site_id = ?", sid)["n"]
    assert send().json()["ok"]
    lead = db.one("SELECT * FROM leads WHERE site_id = ? ORDER BY id DESC", sid)
    assert db.one("SELECT COUNT(*) AS n FROM leads WHERE site_id = ?", sid)["n"] == before + 1 and '"Newsletter"' in lead["data_json"]
    # bad key formats are refused; good ones are masked
    assert c.put(f"/api/sites/{sid}/widgets/newsletter/settings", json={"provider": "mailchimp", "mailchimp_key": "nodc", "mailchimp_list": "abc123"}, headers=H).status_code == 400
    assert c.put(f"/api/sites/{sid}/widgets/newsletter/settings", json={"provider": "mailchimp", "mailchimp_key": FAKE_MC_KEY, "mailchimp_list": "abc123"}, headers=H).status_code == 200
    got = c.get(f"/api/sites/{sid}/widgets/newsletter/settings", headers=H).json()["settings"]
    assert "0123456789abcdef0123" not in str(got)
    calls = []
    monkeypatch.setattr(modcache, "http_json", lambda url, headers=None, data=None, method=None, timeout=10: calls.append((url, headers, data, method)) or {})
    r = send().json()
    assert r["ok"] and "confirm" in r["message"]
    url, headers, data, method = calls[0]
    assert url.startswith("https://us21.api.mailchimp.com/3.0/lists/abc123/members/") and method == "PUT"
    assert data["status_if_new"] == "pending" and data["merge_fields"]["FNAME"] == "Ola" and headers["Authorization"].startswith("Basic ")
    assert db.one("SELECT COUNT(*) AS n FROM leads WHERE site_id = ?", sid)["n"] == before + 1
    # provider down: the sign-up is kept as a lead
    monkeypatch.setattr(modcache, "http_json", lambda *a, **k: (_ for _ in ()).throw(OSError("down")))
    assert send().json()["ok"] and db.one("SELECT COUNT(*) AS n FROM leads WHERE site_id = ?", sid)["n"] == before + 2
    # Resend
    c.put(f"/api/sites/{sid}/widgets/newsletter/settings", json={"provider": "resend", "resend_key": "re_test_123", "resend_audience": "aud-1"}, headers=H)
    calls.clear()
    monkeypatch.setattr(modcache, "http_json", lambda url, headers=None, data=None, method=None, timeout=10: calls.append((url, headers, data)) or {})
    assert send().json()["ok"] and calls[0][0] == "https://api.resend.com/audiences/aud-1/contacts" and calls[0][1]["Authorization"] == "Bearer re_test_123"
    # the popup's compact form posts without a block and uses the same settings
    assert c.post("/__w/newsletter/subscribe", data={"_block": "", "email": "pop@example.com"}, headers=h).json()["ok"] and calls[-1][2]["email"] == "pop@example.com"
    # editors can't see or change the keys
    _user("mod-editor@example.com", "correct-horse-9")
    with TestClient(app) as ed:
        _login(ed, "mod-editor@example.com", "correct-horse-9")
        assert ed.put(f"/api/sites/{sid}/widgets/newsletter/settings", json={"provider": ""}, headers=H).status_code == 403
    c.put(f"/api/sites/{sid}/widgets/newsletter/settings", json={"provider": "", "mailchimp_key": "", "resend_key": ""}, headers=H)


def test_news_price_list_team_and_jobs(cms):
    from datetime import date, timedelta
    c, sid = cms
    db.run("INSERT INTO posts (site_id, title, slug, excerpt, status, published_at, created_at, updated_at) VALUES (?, 'Rye is back', 'rye-is-back', 'Our dark rye returns.', 'published', ?, ?, ?)",
           sid, db.now(), db.now(), db.now())
    yesterday, later = (date.today() - timedelta(days=1)).isoformat(), (date.today() + timedelta(days=30)).isoformat()
    assert _put(c, sid, "index", [
        {"id": "nw1", "type": "news", "data": {"layout": "headlines"}},
        {"id": "pl1", "type": "price_list", "data": {"heading": "Menu", "sections": [
            {"name": "Breads", "items": "Sourdough | $7 | 48-hour ferment | v, popular\nRye | $6"}, {"name": "Cakes", "items": "Carrot cake | $5 | | gf"}]}},
        {"id": "tm1", "type": "team", "data": {"from_business": False, "search": True, "people": [
            {"name": "Ana Baker", "role": "Head baker", "department": "Kitchen", "email": "ana@example.com"},
            {"name": "Ben Till", "role": "Manager", "department": "Front of house"}]}},
        {"id": "jb1", "type": "jobs", "data": {"jobs": [
            {"title": "Night baker", "type": "full_time", "pay": "$22/hour", "closes": later, "apply_email": "jobs@example.com", "description": "Bake."},
            {"title": "Summer helper", "type": "temporary", "closes": yesterday}]}},
    ]).status_code == 200
    assert _put(c, sid, "index", [{"id": "jb1", "type": "jobs", "data": {"jobs": [{"title": "X", "closes": "soon"}]}}]).status_code == 400
    assert _put(c, sid, "index", [{"id": "tm1", "type": "team", "data": {"people": [{"name": "X", "link": "javascript:alert(1)"}]}}]).status_code == 400
    _put(c, sid, "index", [
        {"id": "nw1", "type": "news", "data": {"layout": "headlines"}},
        {"id": "pl1", "type": "price_list", "data": {"sections": [
            {"name": "Breads", "items": "Sourdough | $7 | 48-hour ferment | v, popular\nRye | $6"}, {"name": "Cakes", "items": "Carrot cake | $5 | | gf"}]}},
        {"id": "tm1", "type": "team", "data": {"from_business": False, "search": True, "people": [
            {"name": "Ana Baker", "role": "Head baker", "department": "Kitchen", "email": "ana@example.com"},
            {"name": "Ben Till", "role": "Manager", "department": "Front of house"}]}},
        {"id": "jb1", "type": "jobs", "data": {"jobs": [
            {"title": "Night baker", "type": "full_time", "pay": "$22/hour", "closes": later, "apply_email": "jobs@example.com", "description": "Bake."},
            {"title": "Summer helper", "type": "temporary", "closes": yesterday}]}},
    ])
    folder = _deploy(c, sid)
    html = open(os.path.join(folder, "index.html")).read()
    assert "Rye is back" in html and "Our dark rye returns." in html and 'href="feed.xml"' in html
    assert "Sourdough" in html and "$7" in html and "48-hour ferment" in html and "tw-pl-jump" in html and '"Menu"' in html and "GF" in html
    assert "Ana Baker" in html and "Kitchen" in html and "Front of house" in html and "mailto:ana@example.com" in html
    assert "Night baker" in html and "$22/hour" in html and "JobPosting" in html and "mailto:jobs@example.com" in html
    assert "Summer helper" not in html                                       # closed yesterday


def test_locations_reuse_the_map_and_its_csp(cms):
    c, sid = cms
    _put(c, sid, "about", [{"id": "lc1", "type": "locations", "data": {"provider": "openstreetmap", "places": [
        {"name": "Downtown", "address": "1 Main St", "phone": "555-0100", "latitude": "41.88", "longitude": "-87.63", "hours": "Mon–Fri 7–3"},
        {"name": "Northside", "address": "9 Oak Ave", "latitude": "41.95", "longitude": "-87.65"}]}}])
    _deploy(c, sid)
    sub = sites.get(sid)["subdomain"]
    html = c.get(f"/s/{sub}/about.html").text
    assert html.count("data-tw-loc=") == 2 and "Downtown" in html and "Northside" in html and "tel:5550100" in html
    assert "openstreetmap.org" in html and "tw-map-frame" in html and "tw-map-list" not in html
    assert "https://www.openstreetmap.org" in _csp(c, sub, "about.html")
    # nothing typed and no address in Business data: nothing on the live page
    _put(c, sid, "about", [{"id": "lc1", "type": "locations", "data": {}}])
    _deploy(c, sid)
    assert "tw-locs" not in c.get(f"/s/{sub}/about.html").text


def test_analytics_card_counts_server_side_visits(cms):
    from datetime import date, timedelta
    c, sid = cms
    today = date.today()
    for i, (page, n) in enumerate([("index", 12), ("about", 5), ("index", 7)]):
        db.run("INSERT OR REPLACE INTO visits (site_id, page, day, count) VALUES (?, ?, ?, ?)", sid, page, (today - timedelta(days=i)).isoformat(), n)
    db.run("INSERT OR REPLACE INTO visits (site_id, page, day, count) VALUES (?, 'index', ?, 4)", sid, (today - timedelta(days=40)).isoformat())
    html = c.get(f"/sites/{sid}").text
    assert "Analytics" in html and "No cookies" in html and "an-chart" in html
    from cms.app import site_analytics
    a = site_analytics(sid)
    assert a["total"] >= 24 and a["prev"] >= 4 and a["pages"][0]["page"] == "index" and len(a["bars"]) == 30


def test_ai_assist_hidden_without_a_key_and_only_suggests_with_one(cms, monkeypatch):
    from cms import ai_assist, modcache
    c, sid = cms
    monkeypatch.delenv("TENSHI_AI_KEY", raising=False)
    page = db.one("SELECT id FROM pages WHERE site_id = ? AND slug = 'index'", sid)
    assert "ai-assist.js" not in c.get(f"/sites/{sid}/builder/{page['id']}").text
    assert c.post(f"/api/sites/{sid}/ai/write", json={"text": "hi", "action": "improve"}, headers=H).status_code == 404
    assert c.put(f"/api/sites/{sid}/widgets/ai_assist/settings", json={"api_key": "sk-test-secret-1", "base_url": "http://insecure"}, headers=H).status_code == 400
    assert c.put(f"/api/sites/{sid}/widgets/ai_assist/settings", json={"api_key": "sk-test-secret-1", "model": "small-model"}, headers=H).status_code == 200
    builder = c.get(f"/sites/{sid}/builder/{page['id']}").text
    assert "ai-assist.js" in builder and "sk-test-secret-1" not in builder
    assert "sk-test-secret-1" not in str(c.get(f"/api/sites/{sid}/widgets/ai_assist/settings", headers=H).json())
    seen = {}

    def fake(url, headers=None, data=None, method=None, timeout=10):
        seen.update(url=url, headers=headers, data=data)
        return {"choices": [{"message": {"content": '"Warm, crusty sourdough, baked daily."'}}]}
    monkeypatch.setattr(modcache, "http_json", fake)
    monkeypatch.setattr(modcache, "public_https", lambda u: True)
    r = c.post(f"/api/sites/{sid}/ai/write", json={"text": "we bake bread", "action": "improve", "field": "Text"}, headers=H)
    assert r.status_code == 200 and r.json()["text"] == "Warm, crusty sourdough, baked daily."
    assert seen["url"] == "https://api.openai.com/v1/chat/completions" and seen["headers"]["Authorization"] == "Bearer sk-test-secret-1"
    assert seen["data"]["model"] == "small-model" and "Module Bakery" in seen["data"]["messages"][0]["content"]
    # nothing was saved to the page
    assert "Warm, crusty" not in db.one("SELECT blocks_json FROM pages WHERE id = ?", page["id"])["blocks_json"]
    assert c.post(f"/api/sites/{sid}/ai/write", json={"text": "", "action": "draft"}, headers=H).status_code == 400
    assert c.post(f"/api/sites/{sid}/ai/write", json={"text": "x", "action": "rm -rf"}, headers=H).status_code == 400
    assert c.post(f"/api/sites/{sid}/ai/write", json={"text": "x", "action": "improve"}).status_code == 403   # no X-Tenshi header
    monkeypatch.setattr(modcache, "http_json", lambda *a, **k: (_ for _ in ()).throw(OSError("down")))
    assert c.post(f"/api/sites/{sid}/ai/write", json={"text": "x", "action": "improve"}, headers=H).status_code == 502
    # rate limit per person per site
    monkeypatch.setattr(ai_assist, "LIMIT", 0)
    assert c.post(f"/api/sites/{sid}/ai/write", json={"text": "x", "action": "improve"}, headers=H).status_code == 429
    monkeypatch.setattr(ai_assist, "LIMIT", 40)
    # a server-wide key works when the site has none
    c.put(f"/api/sites/{sid}/widgets/ai_assist/settings", json={"api_key": ""}, headers=H)
    assert not ai_assist.available(sid)
    monkeypatch.setenv("TENSHI_AI_KEY", "env-key")
    assert ai_assist.available(sid) and ai_assist.config(sid)["key"] == "env-key"
