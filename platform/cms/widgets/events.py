"""
widgets/events.py: an events calendar (list, month and week views), each event on its own page (event-<slug>.html)
with RSVP, capacity and a waitlist, and calendar files: events.ics for the whole site and event-<slug>.ics for each.

RSVPs (POST __w/events/rsvp) are checked against the PUBLISHED block (actions.py), rate-limited like the contact
forms, with a honeypot. Each one is kept in the rsvps table and as a lead (Leads screen), the site's lead email goes
out (notify.py), and the guest gets a confirmation if the server has mail settings. When an event is full, RSVPs go
on the waitlist (if the event has one); the RSVPs inbox moves people from the waitlist to "going".
Times are in the site's time zone (sitetime.py).
"""

from __future__ import annotations

import json
import re
import threading
from datetime import date, datetime, timedelta, timezone
from typing import Literal

from markupsafe import Markup, escape
from pydantic import BaseModel, ConfigDict, Field, field_validator

from . import Widget, WidgetContext, block_uid, paragraphs, register
from . import modkit
from .modkit import block_key

# plain strings: these pages are built by joining strings, and Markup + str would escape the str
field = lambda *a, **k: str(modkit.field(*a, **k))          # noqa: E731
form_open = lambda *a, **k: str(modkit.form_open(*a, **k))  # noqa: E731
status_line = lambda: str(modkit.status_line())             # noqa: E731
from .. import db, inbox, sitetime

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
EMAIL_RE = re.compile(r"^[^@\s<>\"']{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$")
PREFIX = "event-"
_LOCK = threading.Lock()   # counting places and saving an RSVP happen together


def slugify(text: str) -> str:
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", (text or "").lower())).strip("-")[:60] or "event"


class Event(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
    title: str = Field("Open evening", max_length=120, json_schema_extra={"label": "Title"})
    date: str = Field("", max_length=10, json_schema_extra={"label": "Date (YYYY-MM-DD)", "placeholder": "2026-12-12"})
    start: str = Field("18:00", max_length=5, json_schema_extra={"label": "Starts (HH:MM, 24-hour)"})
    end: str = Field("20:00", max_length=5, json_schema_extra={"label": "Ends (HH:MM)"})
    all_day: bool = Field(False, json_schema_extra={"label": "All day"})
    location: str = Field("", max_length=200, json_schema_extra={"label": "Where"})
    description: str = Field("", max_length=4000, json_schema_extra={"label": "About it", "type": "textarea"})
    image: str = Field("", max_length=12, json_schema_extra={"label": "Picture", "type": "media"})
    category: str = Field("", max_length=40, json_schema_extra={"label": "Category"})
    rsvp: bool = Field(True, json_schema_extra={"label": "Take RSVPs"})
    capacity: int = Field(0, ge=0, le=100000, json_schema_extra={"label": "Places (0 = no limit)"})
    waitlist: bool = Field(True, json_schema_extra={"label": "Waitlist when full"})
    max_guests: int = Field(4, ge=1, le=20, json_schema_extra={"label": "Most people per RSVP"})
    tickets_link: str = Field("", max_length=300, json_schema_extra={"label": "Or: tickets link (instead of RSVP)"})

    @field_validator("date")
    @classmethod
    def _date(cls, v):
        if v:
            if not DATE_RE.match(v):
                raise ValueError("a date is written like 2026-12-12")
            date.fromisoformat(v)
        return v

    @field_validator("start", "end")
    @classmethod
    def _time(cls, v):
        if v and not TIME_RE.match(v):
            raise ValueError("a time is written like 18:30")
        return v

    @field_validator("image", mode="before")
    @classmethod
    def _img(cls, v):
        return "" if v is None else str(v)

    @field_validator("tickets_link")
    @classmethod
    def _link(cls, v):
        if v and not re.match(r"^https://[^\s\"'<>]{3,290}$", v):
            raise ValueError("a tickets link starts with https://")
        return v

    @property
    def slug(self) -> str:
        return f"{slugify(self.title)}-{self.date}" if self.date else slugify(self.title)


class EventsConfig(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
    heading: str = Field("Upcoming events", max_length=120, json_schema_extra={"label": "Heading"})
    intro: str = Field("", max_length=400, json_schema_extra={"label": "Intro", "type": "textarea"})
    view: Literal["list", "month", "week"] = Field("list", json_schema_extra={"label": "Opens in", "options": [
        ["list", "List"], ["month", "Month"], ["week", "Week"]]})
    show_past: bool = Field(False, json_schema_extra={"label": "Also list past events"})
    calendar_files: bool = Field(True, json_schema_extra={"label": "Offer “Add to calendar” (.ics)"})
    items: list[Event] = Field(default_factory=list, max_length=100, json_schema_extra={"label": "Events", "item_label": "Event"})


# ---------------------------------------------------------------------------------------------- time helpers

def _dt(ev: Event, which: str, tz) -> datetime | None:
    if not ev.date:
        return None
    d = date.fromisoformat(ev.date)
    t = ev.start if which == "start" else (ev.end or ev.start)
    if ev.all_day or not t:
        return datetime(d.year, d.month, d.day, tzinfo=tz)
    h, m = map(int, t.split(":"))
    out = datetime(d.year, d.month, d.day, h, m, tzinfo=tz)
    if which == "end" and ev.start and t < ev.start:          # ends after midnight
        out += timedelta(days=1)
    return out


def when_text(ev: Event, tz) -> str:
    s = _dt(ev, "start", tz)
    if not s:
        return "Date to be announced"
    day = s.strftime("%a %-d %b %Y")
    if ev.all_day:
        return f"{day}, all day"
    e = _dt(ev, "end", tz)
    fmt = lambda x: x.strftime("%-I:%M %p").replace(":00 ", " ")  # noqa: E731
    return f"{day}, {fmt(s)}" + (f"–{fmt(e)}" if e and e != s else "") + f" {s.strftime('%Z')}"


def is_past(ev: Event, tz) -> bool:
    e = _dt(ev, "end", tz)
    return bool(e) and e < datetime.now(tz)


def sorted_events(cfg: EventsConfig) -> list[Event]:
    return sorted([e for e in cfg.items if e.title], key=lambda e: (e.date or "9999", e.start or ""))


# ---------------------------------------------------------------------------------------------- calendar files

def _ics_text(v: str) -> str:
    return (v or "").replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\r", "").replace("\n", "\\n")


def _fold(line: str) -> str:
    out, cur = [], ""
    for ch in line:
        if len((cur + ch).encode()) > 74:
            out.append(cur)
            cur = " " + ch
        else:
            cur += ch
    out.append(cur)
    return "\r\n".join(out)


def ics(site: dict, events: list[tuple[Event, str]], tz) -> str:
    """events: [(event, page url)]"""
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", f"PRODID:-//Tenshi CMS//{_ics_text(site.get('name') or 'Site')}//EN",
             "CALSCALE:GREGORIAN", "METHOD:PUBLISH", f"X-WR-CALNAME:{_ics_text(site.get('name') or 'Events')}"]
    for ev, url in events:
        if not ev.date:
            continue
        lines += ["BEGIN:VEVENT", f"UID:{ev.slug}@{site.get('subdomain') or 'site'}.tenshi", f"DTSTAMP:{stamp}"]
        if ev.all_day:
            d = date.fromisoformat(ev.date)
            lines += [f"DTSTART;VALUE=DATE:{d:%Y%m%d}", f"DTEND;VALUE=DATE:{d + timedelta(days=1):%Y%m%d}"]
        else:
            s, e = _dt(ev, "start", tz), _dt(ev, "end", tz)
            lines += [f"DTSTART:{s.astimezone(timezone.utc):%Y%m%dT%H%M%SZ}", f"DTEND:{e.astimezone(timezone.utc):%Y%m%dT%H%M%SZ}"]
        lines.append(f"SUMMARY:{_ics_text(ev.title)}")
        if ev.location:
            lines.append(f"LOCATION:{_ics_text(ev.location)}")
        if ev.description:
            lines.append(f"DESCRIPTION:{_ics_text(ev.description[:1500])}")
        if url:
            lines.append(f"URL:{url}")
        lines.append("END:VEVENT")
    lines.append("END:VCALENDAR")
    return "\r\n".join(_fold(x) for x in lines) + "\r\n"


# ---------------------------------------------------------------------------------------------- where events live

def site_events(pages) -> list[tuple[dict, dict, EventsConfig]]:
    """Every events block on the site: [(page row, block, config)]."""
    from . import get
    out = []
    for p in pages:
        for b in db.j(p.get("blocks_json"), []) if isinstance(p, dict) else []:
            if isinstance(b, dict) and b.get("type") == "events":
                b = {**b, "_page": p["slug"]}
                out.append((p, b, get("events").config_for(b.get("data"))))
    return out


def extra_pages(renderer, pages) -> list[dict]:
    if not renderer.site.get("id"):
        return []
    seen, out = set(), []
    for page, block, cfg in site_events(pages):
        for ev in cfg.items:
            if not ev.title or ev.slug in seen:
                continue
            seen.add(ev.slug)
            out.append({"slug": PREFIX + ev.slug, "title": ev.title, "in_menu": 0,
                        "seo_title": f"{ev.title} · {renderer.site.get('name', '')}", "seo_description": ev.description[:155],
                        "blocks": [{"id": "ev" + block_uid(block), "type": "event_page",
                                    "data": {"event": ev.model_dump(), "source": block_key(block), "list_page": page["slug"],
                                             "calendar_files": cfg.calendar_files}}]})
    return out


def extra_files(renderer, pages) -> dict[str, str]:
    site = renderer.site
    if not site.get("id"):
        return {}
    from .. import config
    tz = sitetime.zone(site["id"])
    base = config.site_url(site["subdomain"])
    everything, files, seen = [], {}, set()
    for _page, _block, cfg in site_events(pages):
        if not cfg.calendar_files:
            continue
        for ev in cfg.items:
            if not ev.title or not ev.date or ev.slug in seen:
                continue
            seen.add(ev.slug)
            url = f"{base}{PREFIX}{ev.slug}.html"
            everything.append((ev, url))
            files[f"{PREFIX}{ev.slug}.ics"] = ics(site, [(ev, url)], tz)
    if everything:
        files["events.ics"] = ics(site, everything, tz)
    return files


# ---------------------------------------------------------------------------------------------- RSVPs

def counts(site_id, key: str) -> dict[str, dict]:
    rows = db.all("SELECT event_slug, status, SUM(guests) AS n FROM rsvps WHERE site_id = ? AND block_key = ? GROUP BY event_slug, status", site_id, key)
    out: dict[str, dict] = {}
    for r in rows:
        out.setdefault(r["event_slug"], {"going": 0, "waitlist": 0})
        if r["status"] in ("going", "waitlist"):
            out[r["event_slug"]][r["status"]] = r["n"] or 0
    return out


def _find(cfg: EventsConfig, slug: str) -> Event | None:
    return next((e for e in cfg.items if e.title and e.slug == slug), None)


def act_status(req):
    if not req.cfg:
        return 400, {"ok": False}
    c = counts(req.site["id"], req.block_key)
    out = {}
    for ev in req.cfg.items:
        if not ev.title:
            continue
        going = c.get(ev.slug, {}).get("going", 0)
        left = max(0, ev.capacity - going) if ev.capacity else None
        out[ev.slug] = {"going": going, "left": left, "full": bool(ev.capacity and left == 0)}
    return 200, {"ok": True, "events": out}


def act_rsvp(req):
    from .. import mail, notify
    cfg: EventsConfig = req.cfg
    if not cfg:
        return 400, {"ok": False, "error": "Reload the page and try again."}
    ev = _find(cfg, req.form.get("event", ""))
    tz = sitetime.zone(req.site["id"])
    if not ev or not ev.rsvp or ev.tickets_link:
        return 400, {"ok": False, "error": "This event doesn't take RSVPs here."}
    if is_past(ev, tz):
        return 400, {"ok": False, "error": "This event has finished."}
    name = req.form.get("name", "").strip()[:100]
    email = req.form.get("email", "").strip()[:200]
    note = req.form.get("note", "").strip()[:1000]
    if not name:
        return 400, {"ok": False, "error": "Please give your name.", "field": "name"}
    if not EMAIL_RE.match(email):
        return 400, {"ok": False, "error": "Please give an email address we can reach you at.", "field": "email"}
    try:
        guests = int(req.form.get("guests") or 1)
    except ValueError:
        guests = 0
    if not 1 <= guests <= ev.max_guests:
        return 400, {"ok": False, "error": f"RSVP for 1 to {ev.max_guests} people.", "field": "guests"}
    if req.mode != "hosted":
        return 200, {"ok": True, "message": "Preview: this RSVP works on the live site. Nothing was saved here."}
    key = req.block_key
    if db.one("SELECT 1 FROM rsvps WHERE site_id = ? AND block_key = ? AND event_slug = ? AND lower(email) = lower(?) AND status IN ('going', 'waitlist')",
              req.site["id"], key, ev.slug, email):
        return 200, {"ok": True, "message": "You're already on the list for this event. See you there!"}
    with _LOCK:
        going = counts(req.site["id"], key).get(ev.slug, {}).get("going", 0)
        status = "going"
        if ev.capacity and going + guests > ev.capacity:
            if not ev.waitlist:
                left = max(0, ev.capacity - going)
                return 409, {"ok": False, "error": "Sorry, this event is full." if not left else f"Only {left} place{'s' if left != 1 else ''} left.", "field": "guests"}
            status = "waitlist"
        db.run("INSERT INTO rsvps (site_id, block_key, event_slug, event_title, event_date, name, email, guests, note, status, created_at) "
               "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", req.site["id"], key, ev.slug, ev.title, ev.date, name, email, guests, note, status, db.now())
    data = {"Event": f"{ev.title} ({ev.date})", "name": name, "email": email, "Guests": str(guests),
            "Status": "Going" if status == "going" else "Waitlist", "message": note}
    lead_id = db.run("INSERT INTO leads (site_id, page, data_json, created_at) VALUES (?, ?, ?, ?)", req.site["id"], PREFIX + ev.slug, db.dumps(data), db.now())
    db.log("New RSVP", f"{name} · {ev.title}", None, req.site["id"])
    notify.lead_received(req.site, lead_id, f"RSVP: {ev.title}", data)
    when = when_text(ev, tz)
    if status == "going":
        msg = f"You're going! We've saved {guests} place{'s' if guests != 1 else ''} for {ev.title}."
        body = f"Hi {name},\n\nYou're on the list for {ev.title}: {when}" + (f", {ev.location}" if ev.location else "") + \
               f".\nPlaces: {guests}\n\nSee you there!\n{req.site.get('name', '')}"
    else:
        pos = db.one("SELECT COUNT(*) AS n FROM rsvps WHERE site_id = ? AND block_key = ? AND event_slug = ? AND status = 'waitlist'",
                     req.site["id"], key, ev.slug)["n"]
        msg = f"This event is full, so you're on the waitlist (number {pos}). We'll email you if a place opens up."
        body = f"Hi {name},\n\n{ev.title} ({when}) is full, so you're number {pos} on the waitlist. We'll let you know if a place opens up.\n\n{req.site.get('name', '')}"
    mail.simple(req.site, email, f"{'You’re going' if status == 'going' else 'Waitlist'}: {ev.title}", body)
    return 200, {"ok": True, "status": status, "message": msg}


# ---------------------------------------------------------------------------------------------- drawing

def _cal_json(cfg: EventsConfig, ctx: WidgetContext, tz) -> str:
    data = [{"t": e.title, "d": e.date, "s": "" if e.all_day else e.start, "e": "" if e.all_day else e.end,
             "u": ctx.link(PREFIX + e.slug), "c": e.category, "l": e.location} for e in sorted_events(cfg) if e.date]
    return json.dumps({"events": data, "today": datetime.now(tz).date().isoformat()}, ensure_ascii=False).replace("<", "\\u003c")


def event_card(ev: Event, ctx: WidgetContext, tz, past: bool) -> str:
    d = date.fromisoformat(ev.date) if ev.date else None
    badge = (f'<span class="tw-ev-date" aria-hidden="true"><b>{d:%d}</b><span>{d:%b}</span></span>' if d else '<span class="tw-ev-date" aria-hidden="true"><b>?</b></span>')
    pic = (f'<img class="tw-ev-pic" src="{escape(ctx.media(ev.image, 800))}" alt="" loading="lazy">' if ev.image and ctx.media(ev.image, 800) else "")
    spots = "" if not ev.capacity or past else f'<span class="tw-ev-spots" data-tw-spots="{escape(ev.slug)}">{ev.capacity} places</span>'
    return (f'<li class="tw-ev{" tw-ev-past" if past else ""}" data-tw-tags="{escape(ev.category)}">{badge}<div class="tw-ev-body">'
            f'<h3 class="tw-ev-title"><a href="{escape(ctx.link(PREFIX + ev.slug))}">{escape(ev.title)}</a></h3>'
            f'<p class="tw-ev-when">{escape(when_text(ev, tz))}</p>' + (f'<p class="tw-ev-where">{escape(ev.location)}</p>' if ev.location else "")
            + f'<p class="tw-ev-meta">{"<span class=" + chr(34) + "tw-badge" + chr(34) + ">Finished</span>" if past else ""}{spots}</p></div>{pic}</li>')


def render(block: dict, ctx: WidgetContext) -> Markup:
    from . import get
    cfg: EventsConfig = get("events").config_for(block.get("data"))
    uid = block_uid(block)
    tz = sitetime.zone(ctx.site.get("id"))
    evs = sorted_events(cfg)
    upcoming = [e for e in evs if not is_past(e, tz)]
    past = [e for e in evs if is_past(e, tz)] if cfg.show_past else []
    head = f'<h2 id="ev-{uid}-h" data-edit="heading">{escape(cfg.heading)}</h2>' if cfg.heading else ""
    if not evs:
        if ctx.mode != "preview":
            return Markup("")
        return Markup(f'<section class="band tw-mod tw-events"><div class="wrap">{head}<p class="tw-empty">Add events in this block\'s settings.</p></div></section>')
    views = "".join(f'<button type="button" class="tw-chip" data-tw-view="{v}" aria-pressed="{str(v == cfg.view).lower()}">{l}</button>'
                    for v, l in (("list", "List"), ("month", "Month"), ("week", "Week")))
    ics_link = (f'<a class="tw-btn tw-btn-ghost tw-ev-ics" href="{escape(ctx.link("events.ics") if ctx.mode == "preview" else "events.ics")}" download>Add all to my calendar</a>'
                if cfg.calendar_files and any(e.date for e in evs) else "")
    items = "".join(event_card(e, ctx, tz, False) for e in upcoming) or '<li class="tw-empty">No upcoming events right now. Check back soon.</li>'
    past_html = (f'<h3 class="tw-ev-past-h">Past events</h3><ul class="tw-ev-list">{"".join(event_card(e, ctx, tz, True) for e in reversed(past))}</ul>' if past else "")
    status_url = f"__w/events/status?_block={escape(block_key(block))}"
    return Markup(
        f'<section class="band tw-mod tw-events" aria-labelledby="ev-{uid}-h" data-tw-events data-view="{cfg.view}" data-status="{status_url}">'
        f'<div class="wrap"><div class="tw-head">{head}<div class="tw-chips" role="group" aria-label="Calendar view" data-tw-views hidden>{views}</div></div>'
        + (f'<p class="tw-intro">{escape(cfg.intro)}</p>' if cfg.intro else "")
        + f'<div class="tw-ev-cal" data-tw-cal hidden></div><div data-tw-listview><ul class="tw-ev-list">{items}</ul>{past_html}</div>'
        f'<p class="tw-ev-foot">{ics_link}<span class="tw-note">Times are {escape(sitetime.get(ctx.site.get("id")).replace("_", " "))} time.</span></p>'
        f'<script type="application/json" data-tw-cal-data>{_cal_json(cfg, ctx, tz)}</script></div></section>')


class EventPageConfig(BaseModel):
    model_config = ConfigDict(extra="ignore")
    event: Event = Field(default_factory=Event)
    source: str = ""
    list_page: str = ""
    calendar_files: bool = True


def json_ld(ev: Event, tz, url_page: str) -> str:
    s, e = _dt(ev, "start", tz), _dt(ev, "end", tz)
    data = {"@context": "https://schema.org", "@type": "Event", "name": ev.title, "description": ev.description[:500],
            "startDate": s.date().isoformat() if ev.all_day else (s.isoformat() if s else None),
            "endDate": e.date().isoformat() if ev.all_day else (e.isoformat() if e else None),
            "eventStatus": "https://schema.org/EventScheduled", "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode"}
    if ev.location:
        data["location"] = {"@type": "Place", "name": ev.location, "address": ev.location}
    return json.dumps({k: v for k, v in data.items() if v}, ensure_ascii=False).replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")


def render_page(block: dict, ctx: WidgetContext) -> Markup:
    from . import get
    cfg: EventPageConfig = get("event_page").config_for(block.get("data"))
    ev = cfg.event
    tz = sitetime.zone(ctx.site.get("id"))
    past = is_past(ev, tz)
    pic = (f'<img class="tw-evp-pic" src="{escape(ctx.media(ev.image, 1600))}" alt="" decoding="async">' if ev.image and ctx.media(ev.image, 1600) else "")
    ics_href = (ctx.link(f"{PREFIX}{ev.slug}.ics") if ctx.mode == "preview" else f"{PREFIX}{ev.slug}.ics")
    add = f'<a class="tw-btn tw-btn-ghost" href="{escape(ics_href)}" download>Add to my calendar</a>' if cfg.calendar_files and ev.date else ""
    if past:
        action = '<p class="tw-badge">This event has finished.</p>'
    elif ev.tickets_link:
        action = f'<p><a class="tw-btn" href="{escape(ev.tickets_link)}" rel="noopener">Get tickets</a></p>'
    elif ev.rsvp:
        guests = "".join(f'<option value="{n}">{n}</option>' for n in range(1, ev.max_guests + 1))
        spots = (f'<p class="tw-ev-spots" data-tw-spots="{escape(ev.slug)}" aria-live="polite">{ev.capacity} places</p>' if ev.capacity else "")
        action = (f'<h2 id="rsvp-h">RSVP</h2>{spots}'
                  + form_open("events", "rsvp", cfg.source, "Thank you! You're on the list.", "tw-rsvp", "RSVP")
                  + f'<input type="hidden" name="event" value="{escape(ev.slug)}">'
                  + '<div class="tw-row">' + field("name", "Your name", required=True, attrs='autocomplete="name" maxlength="100"')
                  + field("email", "Email", "email", True, 'autocomplete="email" maxlength="200"') + "</div>"
                  + f'<label class="tw-field"><span>How many people?</span><select name="guests">{guests}</select></label>'
                  + field("note", "Anything we should know? (optional)", "textarea", attrs='maxlength="1000"')
                  + '<p><button class="tw-btn" type="submit">Send my RSVP</button></p>' + status_line() + "</form>")
    else:
        action = ""
    back = f'<p class="tw-evp-back"><a href="{escape(ctx.link(cfg.list_page or "index"))}">← All events</a></p>'
    status = f' data-tw-events data-status="__w/events/status?_block={escape(cfg.source)}"' if ev.capacity and not past else ""
    return Markup(
        f'<section class="band tw-mod tw-evp"{status}><div class="wrap narrow">{back}'
        f'<p class="tw-evp-kicker">{escape(ev.category or "Event")}</p><h1>{escape(ev.title)}</h1>'
        f'<p class="tw-evp-when"><b>When:</b> {escape(when_text(ev, tz))}</p>'
        + (f'<p class="tw-evp-where"><b>Where:</b> {escape(ev.location)}</p>' if ev.location else "")
        + f'{pic}<div class="tw-evp-about">{paragraphs(ev.description)}</div><p>{add}</p>{action}</div>'
        f'<script type="application/ld+json">{json_ld(ev, tz, "")}</script></section>')


def _rsvp_rows(site_id):
    return [{**r, "event": f"{r['event_title']} ({r['event_date']})", "when": sitetime.local_text(site_id, r["created_at"])}
            for r in db.all("SELECT * FROM rsvps WHERE site_id = ? ORDER BY event_date DESC, id", site_id)]


def _rsvp_status(site, row, status, user):
    """Moving someone to "going" mustn't overbook the event."""
    if status != "going" or row["status"] == "going":
        return
    from . import get
    from .. import actions, sites
    folder, _ = sites.live_folder(site["subdomain"])
    block = actions.published_block(folder, row["block_key"]) or actions.current_block(site["id"], row["block_key"])
    ev = _find(get("events").config_for((block or {}).get("data")), row["event_slug"]) if block else None
    if ev and ev.capacity:
        going = counts(site["id"], row["block_key"]).get(ev.slug, {}).get("going", 0)
        if going + row["guests"] > ev.capacity:
            raise ValueError(f"That would be more than the {ev.capacity} places. Raise the number of places first.")


inbox.register("rsvps", label="RSVPs", about="People going to your events, and the waitlists. Move someone from the waitlist to going when a place opens.",
               table="rsvps", columns=[("event", "Event"), ("name", "Name"), ("email", "Email"), ("guests", "People"), ("note", "Note"), ("when", "Sent")],
               statuses=["going", "waitlist", "cancelled"], rows=_rsvp_rows,
               count_new=lambda sid: db.one("SELECT COUNT(*) AS n FROM rsvps WHERE site_id = ? AND created_at >= ?", sid,
                                            (datetime.now(timezone.utc) - timedelta(days=7)).strftime("%Y-%m-%dT%H:%M:%SZ"))["n"],
               on_status=_rsvp_status)

register(Widget(
    name="events", label="Events calendar", about="Events as a list, month or week, each with its own page, RSVPs, places and a waitlist.",
    config=EventsConfig, render=render, assets=["events.css", "events.js"], requires=["modkit"],
    actions={"rsvp": act_rsvp, "status": act_status}, extra_pages=extra_pages, extra_files=extra_files,
    hint="Each event gets its own page (event-…html) and calendar file. RSVPs arrive under Modules & inbox › RSVPs and in Leads.",
))
register(Widget(name="event_page", label="Event", about="One event's page.", config=EventPageConfig, render=render_page,
                assets=["events.css", "events.js"], requires=["modkit"], hidden=True))
