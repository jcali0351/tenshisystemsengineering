"""
sitetime.py: a site's time zone (Settings › Address › Time zone), for opening hours, events and bookings.
Kept in site_settings under "site:timezone". Default: TENSHI_TIMEZONE, else America/Chicago.
"""

from __future__ import annotations

import os
from datetime import datetime
from zoneinfo import ZoneInfo, available_timezones

from . import db

KEY = "site:timezone"
DEFAULT = os.environ.get("TENSHI_TIMEZONE") or "America/Chicago"
COMMON = ["America/Chicago", "America/New_York", "America/Denver", "America/Phoenix", "America/Los_Angeles", "America/Anchorage",
          "Pacific/Honolulu", "America/Toronto", "America/Vancouver", "America/Mexico_City", "America/Sao_Paulo", "Europe/London",
          "Europe/Dublin", "Europe/Paris", "Europe/Berlin", "Europe/Madrid", "Africa/Johannesburg", "Asia/Dubai", "Asia/Kolkata",
          "Asia/Singapore", "Asia/Kuala_Lumpur", "Asia/Manila", "Asia/Hong_Kong", "Asia/Shanghai", "Asia/Seoul", "Asia/Tokyo",
          "Australia/Perth", "Australia/Sydney", "Pacific/Auckland", "UTC"]


def get(site_id) -> str:
    row = db.one("SELECT value_json FROM site_settings WHERE site_id = ? AND key = ?", site_id, KEY) if site_id else None
    tz = db.j(row["value_json"]) if row else None
    return tz if isinstance(tz, str) and tz in available_timezones() else DEFAULT


def zone(site_id) -> ZoneInfo:
    return ZoneInfo(get(site_id))


def now(site_id) -> datetime:
    return datetime.now(zone(site_id))


def save(site_id: int, tz: str) -> str:
    if tz not in available_timezones():
        raise ValueError("That isn't a time zone.")
    db.run("INSERT INTO site_settings (site_id, key, value_json, updated_at) VALUES (?, ?, ?, ?) "
           "ON CONFLICT (site_id, key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at",
           site_id, KEY, db.dumps(tz), db.now())
    return tz
