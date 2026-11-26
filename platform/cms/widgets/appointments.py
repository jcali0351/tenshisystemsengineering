"""
widgets/appointments.py: appointment booking on the site itself (no outside service): services, staff, free times,
buffers, and a confirmation email.

  • Services have a length and an optional "buffer after" (clean-up time); the block has a "buffer before".
  • Staff have their own days and hours and the services they do; with no staff, the business days/hours are used.
  • Free times (GET __w/appointments/slots?_block=…&service=…&staff=…&date=YYYY-MM-DD) are worked out on the server in
    the site's time zone (sitetime.py), skipping closed dates, times inside the minimum notice, and anything that
    overlaps a pending or confirmed booking including both buffers. "Anyone" offers a time if any staff member is free.
  • POST __w/appointments/book checks it all again under a lock (two people can't take the same time), saves the
    booking (Modules & inbox › Bookings) and a lead, notifies the team and emails the customer via mail.simple: a
    no-op when the site has no mail set up, and the page says so honestly.
  • Deposits are a placeholder setting, switched off and greyed out until payments for bookings exist.
"""

from __future__ import annotations

import re
import threading
from datetime import date, datetime, timedelta
from typing import Literal

from markupsafe import Markup, escape
from pydantic import BaseModel, ConfigDict, Field, field_validator

from . import Widget, WidgetContext, block_uid, register
from . import modkit
from .modkit import block_key

# plain strings: these pages are built by joining strings, and Markup + str would escape the str
field = lambda *a, **k: str(modkit.field(*a, **k))          # noqa: E731
form_open = lambda *a, **k: str(modkit.form_open(*a, **k))  # noqa: E731
status_line = lambda: str(modkit.status_line())             # noqa: E731
from .. import db, inbox, sitetime

TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
EMAIL_RE = re.compile(r"^[^@\s<>\"']{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$")
DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
LIVE = ("pending", "confirmed")
_LOCK = threading.Lock()


def _time(v):
    if v and not TIME_RE.match(v):
        raise ValueError("a time is written like 09:00 or 17:30")
    return v


def _days(v):
    keys = [d.strip().lower()[:3] for d in re.split(r"[,\s]+", v or "") if d.strip()]
    bad = [k for k in keys if k not in DAY_KEYS]
    if bad:
        raise ValueError("days are written like: mon, tue, wed")
    return ", ".join(k for k in DAY_KEYS if k in keys)


class Service(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
    name: str = Field("Consultation", min_length=1, max_length=80, json_schema_extra={"label": "Service"})
    minutes: int = Field(30, ge=5, le=600, json_schema_extra={"label": "Length (minutes)"})
    price: str = Field("", max_length=30, json_schema_extra={"label": "Price (shown as written, e.g. $40)"})
    buffer_after: int = Field(0, ge=0, le=240, json_schema_extra={"label": "Buffer after (minutes)"})
    about: str = Field("", max_length=300, json_schema_extra={"label": "Short description"})


class Staff(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
    name: str = Field("Alex", min_length=1, max_length=80, json_schema_extra={"label": "Name"})
    services: str = Field("", max_length=400, json_schema_extra={"label": "Services they do (comma-separated; empty = all)"})
    days: str = Field("", max_length=40, json_schema_extra={"label": "Days (e.g. mon, tue, fri; empty = business days)"})
    opens: str = Field("", max_length=5, json_schema_extra={"label": "From (HH:MM; empty = business hours)"})
    closes: str = Field("", max_length=5, json_schema_extra={"label": "Until (HH:MM)"})

    @field_validator("opens", "closes")
    @classmethod
    def _t(cls, v):
        return _time(v)

    @field_validator("days")
    @classmethod
    def _d(cls, v):
        return _days(v)

    def does(self, service: str) -> bool:
        names = [s.strip().lower() for s in self.services.split(",") if s.strip()]
        return not names or service.lower() in names


class AppointmentsConfig(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
    heading: str = Field("Book an appointment", max_length=120, json_schema_extra={"label": "Heading"})
    intro: str = Field("Choose a service and a time that suits you.", max_length=400, json_schema_extra={"label": "Intro", "type": "textarea"})
    services: list[Service] = Field(default_factory=lambda: [Service()], min_length=1, max_length=40,
                                    json_schema_extra={"label": "Services", "item_label": "Service"})
    staff: list[Staff] = Field(default_factory=list, max_length=30, json_schema_extra={"label": "Staff (optional)", "item_label": "Person"})
    days: str = Field("mon, tue, wed, thu, fri", max_length=40, json_schema_extra={"label": "Business days"})
    opens: str = Field("09:00", max_length=5, json_schema_extra={"label": "Bookable from (HH:MM)"})
    closes: str = Field("17:00", max_length=5, json_schema_extra={"label": "Bookable until (HH:MM)"})
    step: Literal[10, 15, 20, 30, 45, 60] = Field(30, json_schema_extra={"label": "Start times every", "options": [[10, "10 min"], [15, "15 min"], [20, "20 min"], [30, "30 min"], [45, "45 min"], [60, "1 hour"]]})
    buffer_before: int = Field(0, ge=0, le=240, json_schema_extra={"label": "Buffer before each booking (minutes)"})
    notice_hours: int = Field(12, ge=0, le=720, json_schema_extra={"label": "Minimum notice (hours)"})
    days_ahead: int = Field(60, ge=1, le=365, json_schema_extra={"label": "Bookable how many days ahead"})
    closed_dates: str = Field("", max_length=4000, json_schema_extra={"label": "Closed dates (one per line, YYYY-MM-DD)", "type": "textarea"})
    approval: bool = Field(False, json_schema_extra={"label": "I confirm each booking myself (customers get “requested”)"})
    phone: bool = Field(True, json_schema_extra={"label": "Ask for a phone number"})

    @field_validator("opens", "closes")
    @classmethod
    def _t(cls, v):
        return _time(v)

    @field_validator("days")
    @classmethod
    def _d(cls, v):
        return _days(v)

    @field_validator("step", mode="before")
    @classmethod
    def _step(cls, v):
        try:
            v = int(v)
        except (TypeError, ValueError):
            return 30
        return v if v in (10, 15, 20, 30, 45, 60) else 30

    @field_validator("closed_dates")
    @classmethod
    def _closed(cls, v):
        for line in (v or "").split():
            if not DATE_RE.match(line):
                raise ValueError(f"“{line[:20]}” isn't a date like 2026-12-25")
            date.fromisoformat(line)
        return v


class AppointmentsSettings(BaseModel):
    """Per-site (owners and admins). Deposits are a placeholder: always off until bookings can take payment."""
    model_config = ConfigDict(extra="ignore")
    deposits_enabled: bool = Field(False, json_schema_extra={"label": "Take a deposit when booking", "disabled": True,
                                                             "help": "Coming later: deposits need card payments for bookings, which aren't built yet."})
    deposit_percent: int = Field(0, ge=0, le=100, json_schema_extra={"label": "Deposit (%)", "disabled": True})

    @field_validator("deposits_enabled", mode="after")
    @classmethod
    def _off(cls, v):
        return False


def _m(t: str) -> int:
    return int(t[:2]) * 60 + int(t[3:])


def _hm(m: int) -> str:
    return f"{m // 60:02d}:{m % 60:02d}"


def _fmt(t: str) -> str:
    h, m = int(t[:2]), t[3:]
    return f"{h % 12 or 12}{'' if m == '00' else ':' + m} {'am' if h < 12 else 'pm'}"


def _service(cfg: AppointmentsConfig, ref: str) -> Service | None:
    try:
        i = int(ref)
        return cfg.services[i] if 0 <= i < len(cfg.services) else None
    except (TypeError, ValueError):
        return next((s for s in cfg.services if s.name.lower() == (ref or "").lower()), None)


def _people(cfg: AppointmentsConfig, svc: Service, staff_ref: str) -> list[str] | None:
    """Staff names who could do it ([""] when the block has no staff); None = a staff choice that isn't valid."""
    if not cfg.staff:
        return [""]
    able = [s for s in cfg.staff if s.does(svc.name)]
    if staff_ref in ("", "any"):
        return [s.name for s in able]
    try:
        p = cfg.staff[int(staff_ref)]
    except (TypeError, ValueError, IndexError):
        return None
    return [p.name] if p in able else None


def _hours_for(cfg: AppointmentsConfig, person: str, day: date) -> tuple[int, int] | None:
    s = next((x for x in cfg.staff if x.name == person), None) if person else None
    days = (s.days if s and s.days else cfg.days).replace(" ", "").split(",")
    if DAY_KEYS[day.weekday()] not in days:
        return None
    o, c = (s.opens, s.closes) if s and s.opens and s.closes else (cfg.opens, cfg.closes)
    return (_m(o), _m(c)) if _m(c) > _m(o) else None


def _taken(site_id: int, key: str, person: str, day: str) -> list[tuple[int, int]]:
    rows = db.all("SELECT start, minutes, buffer_before, buffer_after FROM bookings WHERE site_id = ? AND block_key = ? AND staff = ? "
                  "AND day = ? AND status IN ('pending', 'confirmed')", site_id, key, person, day)
    return [(_m(r["start"]) - r["buffer_before"], _m(r["start"]) + r["minutes"] + r["buffer_after"]) for r in rows]


def free_times(site_id: int, key: str, cfg: AppointmentsConfig, svc: Service, people: list[str], day: date) -> dict[str, list[str]]:
    """{"09:00": ["Alex", "Sam"], …}: start times on that day and who is free then."""
    tz = sitetime.zone(site_id)
    now = datetime.now(tz)
    if day < now.date() or day > now.date() + timedelta(days=cfg.days_ahead) or day.isoformat() in cfg.closed_dates.split():
        return {}
    earliest = now + timedelta(hours=cfg.notice_hours)
    out: dict[str, list[str]] = {}
    span_before, span_after = cfg.buffer_before, svc.minutes + svc.buffer_after
    for person in people:
        hrs = _hours_for(cfg, person, day)
        if not hrs:
            continue
        taken = _taken(site_id, key, person, day.isoformat())
        t = hrs[0]
        while t + svc.minutes <= hrs[1]:
            start = datetime.combine(day, datetime.min.time(), tz) + timedelta(minutes=t)
            a, b = t - span_before, t + span_after
            if start >= earliest and not any(a < y and x < b for x, y in taken):
                out.setdefault(_hm(t), []).append(person)
            t += cfg.step
    return dict(sorted(out.items()))


def _day(v: str) -> date | None:
    if not DATE_RE.match(v or ""):
        return None
    try:
        return date.fromisoformat(v)
    except ValueError:
        return None


def act_slots(req):
    cfg: AppointmentsConfig = req.cfg
    svc = _service(cfg, req.query.get("service", "0")) if cfg else None
    day = _day(req.query.get("date", ""))
    if not svc or not day:
        return 400, {"ok": False, "error": "Choose a service and a day."}
    people = _people(cfg, svc, req.query.get("staff", ""))
    if people is None:
        return 400, {"ok": False, "error": "That person doesn't do this service."}
    times = free_times(req.site["id"], req.block_key, cfg, svc, people, day)
    return 200, {"ok": True, "date": day.isoformat(), "times": [{"t": t, "label": _fmt(t)} for t in times]}


def act_book(req):
    from .. import mail, notify
    cfg: AppointmentsConfig = req.cfg
    if not cfg:
        return 400, {"ok": False, "error": "Reload the page and try again."}
    f = req.form
    svc = _service(cfg, f.get("service", ""))
    if not svc:
        return 400, {"ok": False, "error": "Choose a service.", "field": "service"}
    people = _people(cfg, svc, f.get("staff", ""))
    if people is None:
        return 400, {"ok": False, "error": "Choose who you'd like to see.", "field": "staff"}
    day = _day(f.get("date", ""))
    if not day:
        return 400, {"ok": False, "error": "Choose a day.", "field": "date"}
    t = f.get("time", "")
    if not TIME_RE.match(t):
        return 400, {"ok": False, "error": "Choose a time.", "field": "time"}
    name, email = f.get("name", "").strip()[:100], f.get("email", "").strip()[:200]
    phone, note = f.get("phone", "").strip()[:40], f.get("note", "").strip()[:1000]
    if not name:
        return 400, {"ok": False, "error": "Please give your name.", "field": "name"}
    if not EMAIL_RE.match(email):
        return 400, {"ok": False, "error": "Please give an email address for the confirmation.", "field": "email"}
    if req.mode != "hosted":
        ok = t in free_times(req.site["id"], req.block_key, cfg, svc, people, day)
        return (200, {"ok": True, "message": "Preview: this time is free and booking works on the live site. Nothing was saved here."}) if ok else \
               (409, {"ok": False, "error": "That time isn't free any more. Please choose another.", "field": "time"})
    status = "pending" if cfg.approval else "confirmed"
    with _LOCK:
        free = free_times(req.site["id"], req.block_key, cfg, svc, people, day).get(t)
        if not free:
            return 409, {"ok": False, "error": "Sorry, that time was just taken. Please choose another.", "field": "time"}
        person = free[0]
        bid = db.run("INSERT INTO bookings (site_id, block_key, service, staff, day, start, minutes, buffer_before, buffer_after, name, email, phone, "
                     "note, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", req.site["id"], req.block_key, svc.name, person,
                     day.isoformat(), t, svc.minutes, cfg.buffer_before, svc.buffer_after, name, email, phone, note, status, db.now())
    when = f"{day:%A %-d %B %Y} at {_fmt(t)}"
    data = {"Booking": f"{svc.name} · {when}", "name": name, "email": email, "phone": phone, "With": person or "", "Status": status.title(), "message": note}
    lead_id = db.run("INSERT INTO leads (site_id, page, data_json, created_at) VALUES (?, ?, ?, ?)", req.site["id"],
                     req.block_key.split("/")[0], db.dumps({k: v for k, v in data.items() if v}), db.now())
    db.log("New booking", f"{name} · {svc.name} · {day.isoformat()} {t}", None, req.site["id"])
    notify.lead_received(req.site, lead_id, f"Booking: {svc.name}", data)
    site_name = req.site.get("name", "")
    word = "requested" if status == "pending" else "confirmed"
    body = (f"Hi {name},\n\nYour {svc.name} ({svc.minutes} minutes) on {when}" + (f" with {person}" if person else "") +
            f" is {word}." + ("\nWe'll confirm it shortly." if status == "pending" else "") +
            f"\nTimes are {sitetime.get(req.site['id']).replace('_', ' ')} time.\n\nTo change or cancel, just reply to this email.\n\n{site_name}")
    sent = mail.simple(req.site, email, f"Booking {word}: {svc.name}, {day:%a %-d %b} {_fmt(t)}", body)
    msg = (f"Booked! {svc.name} on {when}" + (f" with {person}" if person else "") + "." if status == "confirmed"
           else f"Thanks! We've got your request for {svc.name} on {when} and will confirm it soon.")
    msg += " A confirmation is on its way by email." if sent else ""
    return 200, {"ok": True, "status": status, "id": bid, "message": msg}


def render(block: dict, ctx: WidgetContext) -> Markup:
    from . import get
    cfg: AppointmentsConfig = get("appointments").config_for(block.get("data"))
    uid = block_uid(block)
    sid = ctx.site.get("id")
    tz = sitetime.get(sid)
    today = sitetime.now(sid).date()
    svc_opts = "".join(f'<option value="{i}" data-min="{s.minutes}">{escape(s.name)} · {s.minutes} min{f" · {escape(s.price)}" if s.price else ""}</option>'
                       for i, s in enumerate(cfg.services))
    staff = ""
    if cfg.staff:
        opts = "".join(f'<option value="{i}" data-does="{escape(s.services.lower())}">{escape(s.name)}</option>' for i, s in enumerate(cfg.staff))
        staff = f'<label class="tw-field"><span>With</span><select name="staff" data-tw-staff><option value="any">Anyone available</option>{opts}</select></label>'
    abouts = "".join(f'<li><b>{escape(s.name)}</b> · {s.minutes} min{f" · {escape(s.price)}" if s.price else ""}'
                     + (f'<br><span class="tw-note">{escape(s.about)}</span>' if s.about else "") + "</li>" for s in cfg.services if s.about or s.price)
    key = block_key(block)
    form = (form_open("appointments", "book", key, "Booked!", "tw-appt-form", cfg.heading or "Book an appointment")
            + f'<div class="tw-appt-grid"><label class="tw-field"><span>Service</span><select name="service" data-tw-service>{svc_opts}</select></label>{staff}'
            + f'<label class="tw-field"><span>Day</span><input type="date" name="date" required data-tw-date min="{today.isoformat()}" '
              f'max="{(today + timedelta(days=cfg.days_ahead)).isoformat()}"></label></div>'
            + '<fieldset class="tw-appt-times"><legend>Time</legend><div data-tw-slots data-url="__w/appointments/slots?_block=' + str(escape(key)) + '">'
              '<label class="tw-field"><span class="tw-sr">Time</span><input type="time" name="time" step="300"></label>'
              '<p class="tw-note" data-tw-slots-msg>Choose a day to see free times.</p></div></fieldset>'
            + '<div class="tw-appt-grid">' + field("name", "Your name", required=True, attrs='autocomplete="name"')
            + field("email", "Email", "email", required=True, attrs='autocomplete="email"')
            + (field("phone", "Phone", "tel", attrs='autocomplete="tel"') if cfg.phone else "") + "</div>"
            + field("note", "Anything we should know?", "textarea")
            + f'<button class="btn" type="submit">{"Request this time" if cfg.approval else "Book now"}</button>{status_line()}</form>')
    return Markup(
        f'<section class="band tw-mod tw-appt" aria-labelledby="ap-{uid}-h" data-tw-appt><div class="wrap">'
        f'<div class="tw-head"><h2 id="ap-{uid}-h" data-edit="heading">{escape(cfg.heading)}</h2></div>'
        + (f'<p class="lede" data-edit="intro">{escape(cfg.intro)}</p>' if cfg.intro else "")
        + f'<div class="tw-appt-cols">{form}'
        + (f'<aside class="tw-appt-side"><h3>Services</h3><ul>{abouts}</ul></aside>' if abouts else "")
        + f'</div><p class="tw-note">Times are {escape(tz.replace("_", " "))} time.</p></div></section>')


def _booking_status(site: dict, row: dict, status: str, user):
    """Moving a cancelled booking back must not double-book the time."""
    if status in LIVE and row["status"] not in LIVE:
        clash = db.one("SELECT 1 FROM bookings WHERE site_id = ? AND block_key = ? AND staff = ? AND day = ? AND id != ? AND status IN ('pending', 'confirmed') "
                       "AND (? - buffer_before) < (CAST(substr(start, 1, 2) AS INTEGER) * 60 + CAST(substr(start, 4, 2) AS INTEGER) + minutes + buffer_after) "
                       "AND (CAST(substr(start, 1, 2) AS INTEGER) * 60 + CAST(substr(start, 4, 2) AS INTEGER) - buffer_before) < (? + ? + buffer_after)",
                       site["id"], row["block_key"], row["staff"], row["day"], row["id"], _m(row["start"]), _m(row["start"]), row["minutes"])
        if clash:
            raise ValueError("Another booking now has that time.")


def _booking_rows(site_id: int) -> list[dict]:
    rows = db.all("SELECT * FROM bookings WHERE site_id = ? ORDER BY day DESC, start DESC LIMIT 500", site_id)
    return [{**r, "when": f"{r['day']} {r['start']}", "length": f"{r['minutes']} min"} for r in rows]


inbox.register(
    "bookings", label="Bookings", about="Appointments booked on the site. Confirm requests, mark them done or cancel them.", table="bookings",
    columns=[("when", "When"), ("service", "Service"), ("length", "Length"), ("staff", "With"), ("name", "Name"), ("email", "Email"),
             ("phone", "Phone"), ("note", "Note")],
    statuses=["pending", "confirmed", "done", "cancelled", "no-show"], rows=_booking_rows,
    count_new=lambda sid: db.one("SELECT COUNT(*) AS n FROM bookings WHERE site_id = ? AND status = 'pending'", sid)["n"],
    on_status=_booking_status, actions_note="Changing a status here doesn't email the customer: reply to them from your inbox.",
)

register(Widget(
    name="appointments", label="Appointments", about="Bookings on your own site: services, staff, free times, buffers and email confirmations.",
    config=AppointmentsConfig, render=render, settings=AppointmentsSettings, assets=["appointments.css", "appointments.js"], requires=["modkit"],
    actions={"slots": act_slots, "book": act_book},
    hint="Bookings arrive under Modules & inbox › Bookings and in Leads. Confirmation emails need mail set up (Settings › Email); without it, bookings still work.",
))
