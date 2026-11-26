"""
demo_faith.py: the four faith-community demo sites (demo-church, demo-mosque, demo-temple, demo-mandir).

Built like the business demos in demo_sites.py, from Content Bot's faith copy (demo_content/faith/copy-*.json, used for
these demos only: the CMS's own starter categories are untouched) and pictures made for them (demo_content/faith/images:
buildings, landscapes, food, festival lamps, geometric tiles; no worship scenes, no sacred figures, and nothing with a
human or animal figure on the mosque site). Each has times with an open-now badge, events with RSVP, recorded talks
(placeholder video and audio files), a newsletter (saved to Leads only), volunteer sign-up, a donations page that is
clearly not live, a gallery and a map.

Placeholders the congregation must supply stay visible on purpose, highlighted (.demo-ph) and editable as normal text:
the mosque's prayer times (they change daily and depend on the mosque's own timetable), the temple's Buddhist school
and the mandir's presiding deity.
"""

from __future__ import annotations

from datetime import date

from .demo_sites import FAITH_DIR, WEEK, B, Pics, _next

MEDIA = FAITH_DIR / "media"
ORDER = ["index", "about", "worship-times", "prayer-times", "meditation-schedule", "puja-schedule", "events", "sermons", "khutbahs",
         "dharma-talks", "satsang", "get-involved", "give", "dana", "donate", "gallery", "contact"]
TIMES = "⟦Time⟧"


def _vol_form(roles: str, heading="Volunteer with us") -> dict:
    f = lambda label, type="text", required=False, options="", width="full": {   # noqa: E731
        "label": label, "type": type, "required": required, "placeholder": "", "options": options, "width": width, "help": "", "accept": "both", "max_mb": 5}
    return B("contact_form", heading=heading, preset="contact", consent=True, button_text="Sign me up",
             intro="Tell us how you'd like to help and we'll be in touch. (Demo: sign-ups are saved to Leads; nothing is emailed.)",
             success_message="Thank you for offering to help! (This is a demo: nothing was sent.)",
             fields=[f("Your name", required=True, width="half"), f("Email", "email", True, "", "half"), f("Phone", "phone", width="half"),
                     f("I'd like to help with", "select", True, roles, "half"), f("When are you free?", "radio", options="Weekdays\nEvenings\nWeekends\nIt varies"),
                     f("Anything else we should know?", "textarea")])


def _newsletter(what: str) -> dict:
    return B("newsletter", heading="Get our weekly newsletter", text=f"{what} (Demo: sign-ups are saved to Leads; nothing is sent.)", ask_name=True, look="card")


def _give(heading: str, label: str, examples: list[str]) -> list[dict]:
    return [B("text", heading=f"{heading} (demo: online giving is not live)",
              body="<p><strong>This is a demo site. Nothing here takes payments and no money changes hands.</strong></p>"
                   "<p>On a real site this page links to the congregation's own secure giving page once they set one up. "
                   "Bank details are never published on the site.</p><ul>" + "".join(f"<li>{e}</li>" for e in examples) + "</ul>"),
            B("cta", heading="Online giving is switched off on this demo", text="Nothing will be charged. On a live site this button opens the congregation's giving page.",
              button_text=f"{label} (demo, not live)", button_link="contact")]


def _talks(p: Pics, kind: str, intro_heading: str, recent: list[tuple[str, str, str]], slug: str) -> list[dict]:
    video = p.file(MEDIA / f"{slug}-video.mp4", f"{kind} (placeholder video)")
    audio = p.file(MEDIA / f"{slug}-audio.m4a", f"{kind} (placeholder audio)")
    return [B("video", heading=f"Latest {kind.lower()}: watch", video=video, caption="Placeholder video for this demo: no real recording."),
            B("video", heading=f"Latest {kind.lower()}: listen", video=audio, caption="Placeholder audio for this demo: no real recording."),
            B("text", heading=intro_heading, body="<ul>" + "".join(f"<li><strong>{t}</strong>, {who}, {when}</li>" for t, who, when in recent) + "</ul>"
                                                 "<p><em>Sample titles for this demo.</em></p>")]


def _events(heading: str, items: list[dict]) -> dict:
    return B("events", heading=heading, view="list", items=items)


def _map(heading, address, lat, lng) -> dict:
    return B("map", heading=heading, address=address, latitude=lat, longitude=lng)


def _hours(heading, days, note) -> dict:
    return B("hours", heading=heading, days=days, note=note, badge=True)


def _when(y, m, d):
    t = date(y, m, d)
    return (t if t > date.today() else date(y + 1, m, d)).isoformat()


# ---------------------------------------------------------------------------------------------- church

def _church(p: Pics, name: str) -> dict:
    hours = _hours("Worship times", WEEK({"sun": "09:30", "wed": "18:30"}, {"sun": "12:15", "wed": "20:00"}, ("mon", "tue", "thu", "fri", "sat")),
                   "Sunday services at 9:30 and 11:00 AM; small groups on Wednesday evenings.")
    return {"category": "faith/copy-church", "template": "nonprofit",
            "theme": {"preset": "elegant", "colors": {"primary": "#5b3a29", "accent": "#9a6b1f", "surface": "#fbf8f3", "ink": "#2a1d15"},
                      "fonts": {"heading": "newsreader", "body": "nunito"}, "style": "clean", "radius": 10, "space": "airy", "mode": "light", "toggle": True},
            "fills": {"[Church Name]": name, "[Street Address]": "2310 Atwood Ave", "[ZIP Code]": "53704", "[Phone, e.g. (608) XXX-XXXX]": "(608) 555-0161",
                      "[Email address]": "hello@example.org", "[Pastor Name]": "Rev. Dana Whitfield", "worship at [Time]": "worship at 9:30 or 11:00 AM",
                      "[X]": "75", "[Sunday]": "Sunday", "[Speaker Name]": "Rev. Dana Whitfield", "[Name]": "our team"},
            "staff": [{"name": "Rev. Dana Whitfield", "role": "Pastor", "bio": "Dana has led the congregation since 2019 and loves a long conversation over coffee."},
                      {"name": "Marcus Bell", "role": "Children and youth leader", "bio": "Marcus runs Sunday kids' church and the Wednesday youth night."},
                      {"name": "Ellen Sorensen", "role": "Church administrator", "bio": "Ellen looks after the office and is happy to answer your questions."}],
            "company": {"tagline": "A warm welcome, whoever you are", "hours": [{"days": "Sunday worship", "time": "9:30 AM and 11:00 AM"}, {"days": "Small groups", "time": "Wednesday, 6:30 PM"}, {"days": "Office", "time": "Tue–Thu, 9:00 AM–1:00 PM"}], "email": "hello@example.org",
                        "description": f"{name} is a fictional non-denominational church on Madison's east side (a demo site by Tenshi Systems)."},
            "hero": p.get("church-exterior"), "about_img": p.get("church-potluck"),
            "album": p.album("Life at Lakeview", ["church-exterior", "church-potluck", "volunteer-boxes", "madison/c-chen", "temple-lake"]),
            "keep": ["index", "about", "get-involved", "give", "gallery", "contact"], "drop_headings": ("This week",), "drop_blocks": {"get-involved": ("form",)}, "order": ORDER,
            "pages": {
                "index": ("Home", None, [hours, _newsletter("Sunday news, small groups and ways to serve, once a week.")]),
                "worship-times": ("Worship", [hours, B("text", heading="During the week", body="<ul><li>Prayer meeting: Tuesday, 7:00 AM</li><li>Small groups: Wednesday, 6:30 PM, in the fellowship hall</li><li>Youth group: Wednesday, 6:30 PM</li></ul><p>Holiday services are posted on the events page.</p>")], None),
                "events": ("Events", [_events("Events and gatherings", [
                    {"title": "Community meal", "date": _next(3), "start": "17:30", "end": "19:00", "location": "Fellowship hall", "category": "Community",
                     "description": "A free hot meal for anyone who'd like one. Volunteers welcome.", "capacity": 80, "max_guests": 6, "image": p.get("church-potluck")},
                    {"title": "Newcomers' lunch", "date": _next(6, 1), "start": "12:30", "end": "13:30", "location": "Fellowship hall", "category": "Welcome",
                     "description": "Meet the pastor and a few friendly faces after the 11:00 service.", "capacity": 30},
                    {"title": "Christmas Eve service", "date": _when(2026, 12, 24), "start": "17:00", "end": "18:00", "location": "Sanctuary", "category": "Service",
                     "description": "Carols and candlelight. Everyone is welcome.", "rsvp": False},
                    {"title": "Easter Sunday", "date": _when(2027, 3, 28), "start": "09:30", "end": "12:15", "location": "Sanctuary", "category": "Service",
                     "description": "Two services, with breakfast in between.", "rsvp": False}])], None),
                "sermons": ("Sermons", _talks(p, "Sermon", "Recent sermons", [("Neighbors, not strangers", "Rev. Dana Whitfield", "last Sunday"),
                                                                          ("Bread for the journey", "Marcus Bell", "two weeks ago"),
                                                                          ("Small faithful steps", "Rev. Dana Whitfield", "three weeks ago")], "church"), None),
                "get-involved": ("Volunteer", None, [_vol_form("Welcome team, Kids' church, Community meal, Music, Tech and livestream, Something else")]),
                "give": ("Give", _give("Give", "Give online", ["Offerings support the community meal and youth programs", "Gifts by check can be left at the office"]), None),
                "gallery": ("Gallery", [B("gallery", heading="Life at Lakeview", layout="masonry", lightbox=True)], None),
                "contact": ("Contact", [_map("Find us", "2310 Atwood Ave, Madison, WI 53704", "43.0921", "-89.3505"),
                                         B("contact_form", heading="Send us a message", preset="contact")], "replace")},
            }


# ---------------------------------------------------------------------------------------------- mosque

def _mosque(p: Pics, name: str) -> dict:
    hours = _hours("Center open", WEEK({"*": "05:00", "fri": "05:00"}, {"*": "22:00"}),
                   "Open for all five daily prayers. Prayer times change daily: see the Prayer times page.")
    return {"category": "faith/copy-mosque", "template": "corporate",
            "theme": {"preset": "ocean", "colors": {"primary": "#0f4c5c", "accent": "#a07c3b", "surface": "#f6f8f7", "ink": "#122a30"},
                      "fonts": {"heading": "dm-sans", "body": "inter"}, "style": "clean", "radius": 8, "space": "airy", "mode": "light", "toggle": True},
            "keep_ph": ["[time from timetable]", "[shortly after adhan]", "[Time]"],
            "fills": {"[Islamic Center Name]": name, "[Street Address]": "4502 Regent St", "[ZIP Code]": "53705", "[Phone, e.g. (608) XXX-XXXX]": "(608) 555-0172",
                      "[Email address]": "office@example.org", "[Imam Name / Speaker Name]": "Imam Yusuf Haddad", "[Imam Name]": "Imam Yusuf Haddad",
                      "[taraweeh prayers / community iftars]": "taraweeh prayers and community iftars", "[email / social media / this website]": "email and this website",
                      "[Name]": "our team", "[Day]": "Saturday", "[days]": "Saturdays and Sundays"},
            "staff": [{"name": "Imam Yusuf Haddad", "role": "Imam", "bio": "Leads prayers, gives the Friday khutbah and is available for counseling by appointment."},
                      {"name": "Amina Rahman", "role": "Board president", "bio": "Coordinates the board and the center's community programs."},
                      {"name": "Omar Siddiqui", "role": "Education coordinator", "bio": "Runs weekend school and adult classes."}],
            "company": {"tagline": "A place of prayer, learning and community", "hours": [{"days": "Daily", "time": "Open 5:00 AM–10:00 PM for the five prayers"}, {"days": "Jumu'ah (Friday)", "time": "See the Prayer times page"}], "email": "office@example.org",
                        "description": f"{name} is a fictional mosque and Islamic center in Madison, WI (a demo site by Tenshi Systems)."},
            "hero": p.get("mosque-exterior"), "about_img": p.get("mosque-geometric"),
            "album": p.album("Our center", ["mosque-exterior", "mosque-geometric", "mosque-dinner", "madison/b-chen", "temple-lake"]),
            "keep": ["index", "about", "prayer-times", "get-involved", "give", "gallery", "contact"], "drop_headings": ("This week",), "drop_blocks": {"get-involved": ("form",)}, "order": ORDER,
            "pages": {
                "index": ("Home", None, [hours, _newsletter("Jumu'ah reminders, classes and community news, once a week.")]),
                "prayer-times": ("Prayer times", None, [hours]),
                "events": ("Events", [_events("Events and classes", [
                    {"title": "Open mosque day", "date": _next(5, 1), "start": "13:00", "end": "16:00", "location": name, "category": "Open day",
                     "description": "Neighbors are invited to tour the center, ask questions and share tea and sweets.", "capacity": 60, "max_guests": 4, "image": p.get("mosque-exterior")},
                    {"title": "Weekly halaqa (study circle)", "date": _next(3), "start": "19:30", "end": "20:30", "location": "Library", "category": "Class",
                     "description": "An informal study circle. Everyone is welcome.", "capacity": 30},
                    {"title": "Ramadan community iftar", "date": _when(2027, 2, 20), "start": "17:30", "end": "19:30", "location": "Community hall", "category": "Ramadan",
                     "description": "Break the fast together with a shared meal (at Maghrib). Everyone is welcome.", "capacity": 150, "max_guests": 6, "image": p.get("mosque-dinner")},
                    {"title": "Eid prayer and celebration", "date": _when(2027, 3, 10), "start": "09:00", "end": "12:00", "location": name, "category": "Eid",
                     "description": "Eid prayer followed by a community gathering. Exact time announced nearer the day.", "rsvp": False}])], None),
                "khutbahs": ("Khutbahs", _talks(p, "Khutbah", "Recent khutbahs and talks", [("Patience and gratitude", "Imam Yusuf Haddad", "last Friday"),
                                                                                             ("Caring for neighbors", "Imam Yusuf Haddad", "two weeks ago"),
                                                                                             ("Youth and community", "Guest speaker", "three weeks ago")], "mosque"), None),
                "get-involved": ("Volunteer", None, [_vol_form("Iftar team, Weekend school, Food pantry, Open day guides, Facilities, Something else")]),
                "give": ("Give", _give("Sadaqah and zakat", "Donate online", ["Sadaqah supports the food pantry and weekend school", "Zakat is distributed by the center's zakat committee"]), None),
                "gallery": ("Gallery", [B("gallery", heading="Our center", layout="masonry", lightbox=True)], None),
                "contact": ("Contact", [_map("Find us", "4502 Regent St, Madison, WI 53705", "43.0685", "-89.4547"),
                                         B("contact_form", heading="Send us a message", preset="contact")], "replace")},
            }


# ---------------------------------------------------------------------------------------------- Buddhist temple

def _temple(p: Pics, name: str) -> dict:
    hours = _hours("Meditation hall open", WEEK({"tue": "18:30", "thu": "18:30", "sat": "08:00", "sun": "09:00"},
                                               {"tue": "20:30", "thu": "20:30", "sat": "11:00", "sun": "12:00"}, ("mon", "wed", "fri")),
                   "Beginners are welcome at every session; instruction is offered before the first sitting.")
    return {"category": "faith/copy-buddhist-temple", "template": "portfolio",
            "theme": {"preset": "forest", "colors": {"primary": "#4d5b3a", "accent": "#9c6b2f", "surface": "#f6f4ee", "ink": "#23281d"},
                      "fonts": {"heading": "elegant", "body": "humanist"}, "style": "elegant", "radius": 6, "space": "airy", "mode": "light", "toggle": True},
            "keep_ph": ["[Tradition, e.g. Theravada / Zen / Tibetan / Pure Land]", "[Tradition]"],
            "fills": {"[Temple Name]": name, "[Street Address]": "1820 Monroe St", "[ZIP Code]": "53711", "[Phone, e.g. (608) XXX-XXXX]": "(608) 555-0183",
                      "[Email address]": "sangha@example.org", "[Teacher Name / Venerable Name]": "our resident teacher", "[Teacher Name / our teachers]": "our teachers",
                      "[Teacher Name]": "our resident teacher", "[Resident teacher / Abbot / Abbess]": "Resident teacher",
                      "[Vesak / Buddha Day celebration]": "Vesak celebration", "[freely / by donation]": "freely", "[X]": "40", "[Name]": "our team", "[Day]": "Thursday"},
            "staff": [{"name": "Resident teacher", "role": "Resident teacher", "bio": "Leads the weekly sittings and gives dharma talks. (Name and title to be added by the temple.)"},
                      {"name": "Lena Park", "role": "Temple coordinator", "bio": "Looks after the schedule, retreats and visitors."},
                      {"name": "Sam Ortiz", "role": "Volunteer coordinator", "bio": "Organizes the garden, kitchen and building volunteers."}],
            "company": {"tagline": "A quiet place to sit, learn and practice together", "hours": [{"days": "Tue & Thu", "time": "6:30–8:30 PM"}, {"days": "Saturday", "time": "8:00–11:00 AM"}, {"days": "Sunday", "time": "9:00 AM–noon"}], "email": "sangha@example.org",
                        "description": f"{name} is a fictional Buddhist temple and meditation center in Madison, WI (a demo site by Tenshi Systems)."},
            "hero": p.get("temple-exterior"), "about_img": p.get("temple-lake"),
            "album": p.album("The temple and garden", ["temple-exterior", "temple-lake", "temple-lunch", "landscaping-hero-1", "landscaping-gallery-2", "madison/a-wikideas1"]),
            "keep": ["index", "about", "get-involved", "dana", "gallery", "contact"], "drop_headings": ("This week",), "drop_blocks": {"get-involved": ("form",)}, "order": ORDER,
            "pages": {
                "index": ("Home", None, [hours, _newsletter("The week's sittings, talks and retreat dates, once a week.")]),
                "meditation-schedule": ("Schedule", [hours, B("text", heading="Weekly schedule", body="<ul><li>Evening meditation and dharma talk: Tuesday and Thursday, 6:30–8:30 PM</li><li>Morning meditation: Saturday, 8:00–9:30 AM</li><li>Introduction to meditation (for beginners): Saturday, 10:00–11:00 AM</li><li>Sunday practice: Sunday, 9:00 AM–noon, followed by tea</li></ul><p>Retreats and festival days are posted on the events page.</p>")], None),
                "events": ("Events", [_events("Retreats and special days", [
                    {"title": "Introduction to meditation course", "date": _next(5, 1), "start": "10:00", "end": "11:00", "location": "Meditation hall", "category": "Course",
                     "description": "Four Saturday mornings for complete beginners. Offered freely.", "capacity": 20, "image": p.get("temple-lake")},
                    {"title": "Day of practice", "date": _next(6, 2), "start": "09:00", "end": "16:00", "location": "Meditation hall", "category": "Retreat",
                     "description": "Sitting and walking meditation with a simple shared lunch.", "capacity": 30, "image": p.get("temple-lunch")},
                    {"title": "Vesak celebration", "date": _when(2027, 5, 20), "start": "10:00", "end": "13:00", "location": "Temple garden", "category": "Festival",
                     "description": "A community celebration with a shared meal. Details depend on the temple's tradition.", "capacity": 120, "max_guests": 6}])], None),
                "dharma-talks": ("Talks", _talks(p, "Dharma talk", "Recent talks", [("Beginning again", "Resident teacher", "last Thursday"),
                                                                                  ("Walking meditation", "Visiting teacher", "two weeks ago"),
                                                                                  ("Kindness in daily life", "Resident teacher", "three weeks ago")], "temple"), None),
                "get-involved": ("Volunteer", None, [_vol_form("Kitchen, Garden, Greeting newcomers, Building care, Retreat support, Something else")]),
                "dana": ("Dana", _give("Dana", "Offer dana online", ["Dana keeps teachings freely offered", "Food and practical help can be arranged with the coordinator"]), None),
                "gallery": ("Gallery", [B("gallery", heading="The temple and garden", layout="masonry", lightbox=True)], None),
                "contact": ("Contact", [_map("Find us", "1820 Monroe St, Madison, WI 53711", "43.0592", "-89.4164"),
                                         B("contact_form", heading="Send us a message", preset="contact")], "replace")},
            }


# ---------------------------------------------------------------------------------------------- Hindu mandir

def _mandir(p: Pics, name: str) -> dict:
    hours = _hours("Darshan hours", [{"day": d, "opens": "08:00", "closes": "11:00", "closed": False} for d in ("mon", "tue", "wed", "thu", "fri")]
                   + [{"day": d, "opens": "17:30", "closes": "20:30", "closed": False} for d in ("mon", "tue", "wed", "thu", "fri")]
                   + [{"day": d, "opens": "08:00", "closes": "20:30", "closed": False} for d in ("sat", "sun")],
                   "Morning aarti at 8:30 AM and evening aarti at 7:00 PM daily.")
    return {"category": "faith/copy-hindu-temple", "template": "community",
            "theme": {"preset": "elegant", "colors": {"primary": "#7a2e1f", "accent": "#c27c0e", "surface": "#fdf8f1", "ink": "#2b1a12"},
                      "fonts": {"heading": "fraunces", "body": "dm-sans"}, "style": "clean", "radius": 12, "space": "normal", "mode": "light", "toggle": True},
            "keep_ph": ["[Presiding Deity / Deities]"],
            "fills": {"[Mandir Name]": name, "[Street Address]": "6120 Mineral Point Rd", "[ZIP Code]": "53705", "[Phone, e.g. (608) XXX-XXXX]": "(608) 555-0194",
                      "[Email address]": "office@example.org", "[Priest Name]": "Pandit Raghav Sharma", "[Weekly puja, e.g. abhishekam]": "Weekly abhishekam",
                      "[Language / Bal Vihar classes for children]": "Bal Vihar classes for children", "[email / social media]": "email",
                      "[X]": "7", "[Name]": "our team", "[Day]": "Sunday"},
            "staff": [{"name": "Pandit Raghav Sharma", "role": "Priest (pujari)", "bio": "Performs the daily pujas and family ceremonies by appointment."},
                      {"name": "Meera Iyer", "role": "Board of trustees, chair", "bio": "Leads the trustees and the festival committee."},
                      {"name": "Arjun Patel", "role": "Volunteer coordinator", "bio": "Organizes seva teams for the kitchen, festivals and building."}],
            "company": {"tagline": "A place of worship, festivals and community", "hours": [{"days": "Mon–Fri", "time": "8:00–11:00 AM, 5:30–8:30 PM"}, {"days": "Sat–Sun", "time": "8:00 AM–8:30 PM"}], "email": "office@example.org",
                        "description": f"{name} is a fictional Hindu mandir in Madison, WI (a demo site by Tenshi Systems)."},
            "hero": p.get("mandir-exterior"), "about_img": p.get("mandir-diyas"),
            "album": p.album("Festivals and community", ["mandir-exterior", "mandir-diyas", "mandir-meal", "madison/c-chen", "community-gallery-4"]),
            "keep": ["index", "about", "get-involved", "donate", "gallery", "contact"], "drop_headings": ("This week",), "drop_blocks": {"get-involved": ("form",)}, "order": ORDER,
            "pages": {
                "index": ("Home", None, [hours, _newsletter("Puja times, festival dates and seva needs, once a week.")]),
                "puja-schedule": ("Puja times", [hours, B("text", heading="Weekly programs", body="<ul><li>Weekly abhishekam: Saturday, 9:00 AM</li><li>Satsang and bhajans: Sunday, 11:00 AM</li><li>Bal Vihar classes for children: Sunday, 1:00 PM</li></ul><p>Festival times follow the Hindu calendar and are posted on the events page.</p>")], None),
                "events": ("Events", [_events("Festivals and events", [
                    {"title": "Mandir open house", "date": _next(6, 1), "start": "11:00", "end": "14:00", "location": name, "category": "Open house",
                     "description": "Neighbors are welcome to visit, ask questions and share a vegetarian lunch.", "capacity": 80, "max_guests": 6, "image": p.get("mandir-meal")},
                    {"title": "Diwali celebration", "date": _when(2027, 10, 29), "start": "18:00", "end": "21:00", "location": "Mandir and hall", "category": "Festival",
                     "description": "Lamps, music and a community dinner.", "capacity": 300, "max_guests": 8, "image": p.get("mandir-diyas")},
                    {"title": "Navaratri garba evenings", "date": _when(2027, 9, 30), "start": "19:00", "end": "22:00", "location": "Community hall", "category": "Festival",
                     "description": "Nine evenings of garba and dandiya. All ages welcome.", "rsvp": False},
                    {"title": "Janmashtami", "date": _when(2027, 8, 25), "start": "18:00", "end": "23:59", "location": "Mandir", "category": "Festival",
                     "description": "Bhajans and celebration into the night.", "rsvp": False}])], None),
                "satsang": ("Satsang", _talks(p, "Satsang discourse", "Recent and upcoming", [("Seva and community", "Pandit Raghav Sharma", "last Sunday"),
                                                                                                   ("The meaning of Diwali", "Guest speaker", "two weeks ago"),
                                                                                                   ("Bhajan evening", "Satsang group", "three weeks ago")], "mandir"), None),
                "get-involved": ("Volunteer", None, [_vol_form("Kitchen seva, Festival team, Bal Vihar, Greeting visitors, Building care, Something else", "Offer seva")]),
                "donate": ("Donate", _give("Donate and sponsor", "Donate online", ["Sponsor a puja or festival program", "Donations support the kitchen and Bal Vihar"]), None),
                "gallery": ("Gallery", [B("gallery", heading="Festivals and community", layout="masonry", lightbox=True)], None),
                "contact": ("Contact", [_map("Find us", "6120 Mineral Point Rd, Madison, WI 53705", "43.0592", "-89.4950"),
                                         B("contact_form", heading="Send us a message", preset="contact")], "replace")},
            }


FAITH = {
    "demo-church": ("Lakeview Commons Church", "Church", _church, ["faith", "madison"],
                    ["Worship times + open-now badge", "Events + RSVP", "Sermons (video + audio)", "Newsletter", "Volunteer sign-up", "Giving (demo)", "Gallery", "Map"]),
    "demo-mosque": ("Isthmus Islamic Center", "Mosque", _mosque, ["faith", "madison"],
                    ["Prayer times + Jumu'ah", "Open-now badge", "Events + RSVP", "Khutbahs (video + audio)", "Newsletter", "Volunteer sign-up", "Sadaqah (demo)", "Gallery", "Map"]),
    "demo-temple": ("Monona Bay Meditation Temple", "Buddhist temple", _temple, ["faith", "madison", "landscaping"],
                    ["Meditation times + open-now badge", "Events + RSVP", "Dharma talks (video + audio)", "Newsletter", "Volunteer sign-up", "Dana (demo)", "Gallery", "Map"]),
    "demo-mandir": ("Prairie Shanti Mandir", "Hindu mandir", _mandir, ["faith", "madison", "community"],
                    ["Darshan + aarti times", "Open-now badge", "Festivals + RSVP", "Satsang (video + audio)", "Newsletter", "Seva sign-up", "Donations (demo)", "Gallery", "Map"]),
}
FAITH_TEMPLATE = {"demo-church": "nonprofit", "demo-mosque": "corporate", "demo-temple": "portfolio", "demo-mandir": "community"}
