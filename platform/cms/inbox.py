"""
inbox.py: what visitors send through module blocks (RSVPs, bookings, reviews, social posts waiting for approval …),
listed on /sites/<id>/inbox/<kind> with a status each. Modules register a kind:

    register("rsvps", label=..., about=..., table=..., columns=[(key, heading)], statuses=[...],
             rows=fn(site_id) -> [dict with id, status, and the columns], count_new=fn(site_id) -> int,
             manage_only=False, on_status=fn(site, row, status, user) (optional; may raise ValueError, or return the status to store),
             extra={"confirm": {status: "Question asked before choosing it"}})

Statuses are changed with PATCH /api/sites/<id>/inbox/<kind>/<row id> {"status": ...}. manage_only kinds (approving
reviews, social posts) need the site's owners or admins (members.can_manage).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

from . import db, members

KINDS: dict[str, "Kind"] = {}


@dataclass
class Kind:
    name: str
    label: str
    about: str
    table: str
    columns: list
    statuses: list
    rows: Callable
    count_new: Callable
    manage_only: bool = False
    on_status: Callable | None = None
    actions_note: str = ""
    extra: dict = field(default_factory=dict)


def register(name, **kw) -> Kind:
    from . import widgets
    k = Kind(name=name, **kw)
    KINDS[name] = k
    if not any(i.get("path") == f"inbox/{name}" for i in widgets.INBOX):
        widgets.INBOX.append({"label": k.label, "about": k.about, "path": f"inbox/{name}", "count": k.count_new})
    return k


def set_status(site: dict, kind: str, row_id: int, status: str, user) -> dict:
    k = KINDS.get(kind)
    if not k:
        raise KeyError(kind)
    if status not in k.statuses:
        raise ValueError("That isn't one of the choices.")
    if k.manage_only and not members.can_manage(user, site["id"]):
        raise PermissionError("Only this site's owners and CMS admins can do this.")
    row = db.one(f"SELECT * FROM {k.table} WHERE id = ? AND site_id = ?", row_id, site["id"])
    if not row:
        raise KeyError(row_id)
    if k.on_status:
        final = k.on_status(site, row, status, user)          # may return the status to store instead (e.g. "sent")
        status = final if isinstance(final, str) and final else status
    db.run(f"UPDATE {k.table} SET status = ? WHERE id = ? AND site_id = ?", status, row_id, site["id"])
    db.log(f"{k.label}: {status}", str(row_id), user, site["id"])
    return db.one(f"SELECT * FROM {k.table} WHERE id = ?", row_id)
