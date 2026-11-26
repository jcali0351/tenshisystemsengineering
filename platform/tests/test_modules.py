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
