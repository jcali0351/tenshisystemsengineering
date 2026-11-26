"""
forms.py: the form builder (the "Form" widget, cms/widgets/contact_form.py): field types, presets, and what happens
when a visitor sends a form on a live site.

How a send works (app.serve_site, path /__form, after the rate limit and the honeypot):
  1. The deployment has a snapshot of every form on it (.tenshi-forms.json, written by render.build_to, never served):
     its fields, limits, recipient address and success message. A send is checked against that snapshot, so what a
     visitor can send is exactly what the published form shows.
  2. Each answer is checked (required, email, phone, date, choice from the list, lengths). Uploaded files are checked
     against the field's size limit and file types (by their first bytes, not only the name) and kept per site in
     DATA_DIR/form-uploads/<site id>/ - outside every web folder. Only signed-in CMS users can download them
     (/sites/<id>/leads/<lead>/files/<file>).
  3. The lead is saved (Leads in the dashboard) and an email goes to the form's recipient through mail.py (or nothing,
     when the server has no mail settings; the Leads screen says so).
Forms without the snapshot (the classic Form block) still send through sites.save_lead as before.
"""

from __future__ import annotations

import json
import re
import secrets
from datetime import date
from pathlib import Path

from . import config, db

FORMS_FILE = ".tenshi-forms.json"
UPLOADS_DIR = config.DATA_DIR / "form-uploads"
MAX_REQUEST_MB = 25
FIELD_TYPES = ["text", "email", "phone", "textarea", "select", "checkbox", "radio", "date", "file"]
EMAIL_RE = re.compile(r"^[^@\s<>\"']{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$")
PHONE_RE = re.compile(r"^[0-9+()./ \-]{5,30}$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

# File types a file field may take: extension -> (group, test of the first bytes)
_ZIP = lambda b: b[:4] == b"PK\x03\x04"                                                     # noqa: E731
FILE_TYPES = {
    ".jpg": ("images", lambda b: b[:3] == b"\xff\xd8\xff"), ".jpeg": ("images", lambda b: b[:3] == b"\xff\xd8\xff"),
    ".png": ("images", lambda b: b[:8] == b"\x89PNG\r\n\x1a\n"), ".gif": ("images", lambda b: b[:4] == b"GIF8"),
    ".webp": ("images", lambda b: b[:4] == b"RIFF" and b[8:12] == b"WEBP"),
    ".pdf": ("documents", lambda b: b[:5] == b"%PDF-"),
    ".docx": ("documents", _ZIP), ".xlsx": ("documents", _ZIP), ".pptx": ("documents", _ZIP),
    ".doc": ("documents", lambda b: b[:8] == b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"),
    ".xls": ("documents", lambda b: b[:8] == b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"),
    ".txt": ("documents", lambda b: b"\x00" not in b[:4096]), ".csv": ("documents", lambda b: b"\x00" not in b[:4096]),
}
ACCEPT = {"images": "images", "documents": "documents", "both": "images,documents"}
MIME = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp",
        ".pdf": "application/pdf", ".txt": "text/plain", ".csv": "text/csv"}


def accept_attr(group: str) -> str:
    groups = ACCEPT.get(group, "images,documents").split(",")
    return ",".join(ext for ext, (g, _) in FILE_TYPES.items() if g in groups)


def options_of(text: str) -> list[str]:
    """Choices typed one per line, or comma-separated when on one line ("$1,000" stays whole when on its own line)."""
    text = str(text or "").replace("\r", "")
    return [o.strip() for o in (text.split("\n") if "\n" in text else text.split(",")) if o.strip()][:40]


def keys_for(fields: list[dict]) -> list[str]:
    """The input name of each field: from its label, unique within the form (f_your_name, f_email, f_email_2)."""
    seen, out = set(), []
    for i, f in enumerate(fields):
        base = "f_" + (re.sub(r"[^a-z0-9]+", "_", str(f.get("label") or "").lower()).strip("_")[:30] or str(i + 1))
        key, n = base, 2
        while key in seen:
            key, n = f"{base}_{n}", n + 1
        seen.add(key)
        out.append(key)
    return out


# ---------------------------------------------------------------------------------------------- presets

def _f(label, type="text", required=False, placeholder="", options="", width="full", help="", accept="both", max_mb=5):
    return {"label": label, "type": type, "required": required, "placeholder": placeholder, "options": options,
            "width": width, "help": help, "accept": accept, "max_mb": max_mb}


PRESETS = {
    "contact": {"heading": "Send us a message", "intro": "We answer within one working day.", "button_text": "Send message",
                "success_message": "Thank you! Your message is on its way. We'll be in touch soon.",
                "fields": [_f("Your name", required=True, width="half"), _f("Email", "email", True, width="half"),
                           _f("Phone", "phone", width="half"), _f("Subject", width="half"), _f("Message", "textarea", True)]},
    "quote": {"heading": "Request a quote", "intro": "Tell us about the job and we'll send a price.", "button_text": "Get my quote",
              "success_message": "Thanks! We've got your request and will send a quote within two working days.",
              "fields": [_f("Your name", required=True, width="half"), _f("Email", "email", True, width="half"),
                         _f("Phone", "phone", True, width="half"),
                         _f("Service", "select", True, options="Repair, Installation, Maintenance, Something else", width="half"),
                         _f("Budget", "radio", options="Under $1,000\n$1,000–$5,000\nOver $5,000"),
                         _f("Project details", "textarea", True, placeholder="What needs doing, where, and by when?"),
                         _f("Photos or plans", "file", help="Optional. JPG, PNG or PDF, up to 5 MB.")]},
    "appointment": {"heading": "Book an appointment", "intro": "Pick a day and time that suits you; we'll confirm by email.",
                    "button_text": "Request appointment",
                    "success_message": "Thank you! We'll confirm your appointment by email shortly.",
                    "fields": [_f("Your name", required=True, width="half"), _f("Email", "email", True, width="half"),
                               _f("Phone", "phone", True, width="half"), _f("Preferred date", "date", True, width="half"),
                               _f("Preferred time", "select", True, options="Morning, Afternoon, Evening", width="half"),
                               _f("Reason for visit", "select", options="First visit, Follow-up, Consultation", width="half"),
                               _f("Anything we should know?", "textarea")]},
    "newsletter": {"heading": "Join our newsletter", "intro": "News and offers about once a month. Unsubscribe any time.",
                   "button_text": "Subscribe", "success_message": "You're on the list. Thanks for subscribing!", "consent": True,
                   "consent_text": "Yes, email me news and offers. I can unsubscribe at any time.",
                   "fields": [_f("First name", width="half"), _f("Email", "email", True, width="half")]},
}


# ---------------------------------------------------------------------------------------------- the deployment snapshot

def spec(cfg, page_slug: str) -> dict:
    """What the server needs to check a send from one published form (saved in .tenshi-forms.json)."""
    fields = [f.model_dump() if hasattr(f, "model_dump") else dict(f) for f in cfg.fields]
    keys = keys_for(fields)
    return {"page": page_slug, "title": cfg.heading or "Form", "recipient": cfg.recipient_email,
            "success": cfg.success_message, "consent": cfg.consent, "consent_text": cfg.consent_text,
            "fields": [{**f, "key": k} for f, k in zip(fields, keys)]}


def write_specs(out_dir: Path, specs: dict) -> None:
    if specs:
        (Path(out_dir) / FORMS_FILE).write_text(json.dumps(specs), encoding="utf-8")


def load_spec(folder: Path | None, form_id: str) -> dict | None:
    if not folder or not re.fullmatch(r"[a-z0-9_-]{0,90}/[a-z0-9]{1,16}", form_id or ""):
        return None
    try:
        return json.loads((Path(folder) / FORMS_FILE).read_text(encoding="utf-8")).get(form_id)
    except (OSError, ValueError):
        return None


# ---------------------------------------------------------------------------------------------- checking a send

class FormProblem(ValueError):
    def __init__(self, message, field=""):
        super().__init__(message)
        self.field = field


def _is_upload(v) -> bool:
    return hasattr(v, "filename") and hasattr(v, "read")


async def check(spec_: dict, form) -> tuple[dict, list[tuple[dict, object]]]:
    """(answers by label, [(field, upload)]) from a posted form, or FormProblem naming the first thing to fix."""
    data, uploads, labels = {}, [], set()
    for f in spec_["fields"]:
        key, label, kind, required = f["key"], f["label"] or f["key"], f["type"], bool(f.get("required"))
        name = label
        n = 2
        while name in labels:
            name, n = f"{label} ({n})", n + 1
        labels.add(name)
        if kind == "file":
            up = form.get(key)
            if not _is_upload(up) or not up.filename:
                if required:
                    raise FormProblem(f"Please attach {label.lower()}.", key)
                continue
            uploads.append(({**f, "label": name}, up))
            data[name] = Path(up.filename).name[:120]
            continue
        if kind == "checkbox" and options_of(f.get("options")):
            values = [str(v).strip() for v in form.getlist(key) if not _is_upload(v)]
            allowed = options_of(f.get("options"))
            if any(v not in allowed for v in values):
                raise FormProblem(f"Please choose from the list for {label.lower()}.", key)
            if required and not values:
                raise FormProblem(f"Please tick at least one option for {label.lower()}.", key)
            if values:
                data[name] = ", ".join(values)
            continue
        raw = form.get(key)
        value = "" if raw is None or _is_upload(raw) else str(raw).strip()
        if kind == "checkbox":
            if required and not value:
                raise FormProblem(f"Please tick “{label}”.", key)
            if value:
                data[name] = "Yes"
            continue
        if not value:
            if required:
                raise FormProblem(f"Please fill in {label.lower()}.", key)
            continue
        limit = 5000 if kind == "textarea" else 300
        if len(value) > limit:
            raise FormProblem(f"{label} is too long (at most {limit} characters).", key)
        if kind == "email" and not EMAIL_RE.match(value):
            raise FormProblem("Please check the email address.", key)
        if kind == "phone" and not PHONE_RE.match(value):
            raise FormProblem("Please check the phone number.", key)
        if kind == "date":
            try:
                if not DATE_RE.match(value):
                    raise ValueError
                date.fromisoformat(value)
            except ValueError:
                raise FormProblem(f"Please choose a date for {label.lower()}.", key) from None
        if kind in ("select", "radio") and value not in options_of(f.get("options")):
            raise FormProblem(f"Please choose from the list for {label.lower()}.", key)
        data[name] = value
    if spec_.get("consent"):
        if not form.get("_consent"):
            raise FormProblem("Please tick the consent box.", "_consent")
        data["Consent"] = "Yes: " + (spec_.get("consent_text") or "I agree")[:300]
    if not any(data.values()):
        raise FormProblem("The form is empty.")
    return data, uploads


async def read_upload(field: dict, up) -> tuple[bytes, str]:
    """The file's bytes and extension, if it's within the field's limit and of an allowed type."""
    ext = Path(up.filename or "").suffix.lower()
    groups = ACCEPT.get(field.get("accept") or "both", "images,documents").split(",")
    label = field.get("label", "file")
    if ext not in FILE_TYPES or FILE_TYPES[ext][0] not in groups:
        kinds = " or ".join({"images": "pictures (JPG, PNG, WebP, GIF)", "documents": "documents (PDF, Word, Excel, text)"}[g] for g in groups)
        raise FormProblem(f"{label}: please attach {kinds}.", field.get("key", ""))
    limit = max(1, min(int(field.get("max_mb") or 5), 10)) * 1024 * 1024
    content = await up.read(limit + 1)
    if len(content) > limit:
        raise FormProblem(f"{label}: the file is larger than {limit // (1024 * 1024)} MB.", field.get("key", ""))
    if not content or not FILE_TYPES[ext][1](content):
        raise FormProblem(f"{label}: that file doesn't look like a real {ext[1:].upper()} file.", field.get("key", ""))
    return content, ext


def save(site_id: int, spec_: dict, data: dict, files: list[tuple[dict, bytes, str, str]]) -> int:
    """Store the lead and its files. files: [(field, bytes, ext, original name)]. Returns the lead id."""
    lead_id = db.run("INSERT INTO leads (site_id, page, data_json, created_at) VALUES (?, ?, ?, ?)",
                     site_id, str(spec_.get("page", ""))[:60], db.dumps(data), db.now())
    folder = UPLOADS_DIR / str(int(site_id))
    for field, content, ext, original in files:
        folder.mkdir(parents=True, exist_ok=True)
        stored = secrets.token_hex(16) + ext
        (folder / stored).write_bytes(content)
        db.run("INSERT INTO lead_files (lead_id, site_id, field, name, stored, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
               lead_id, site_id, field.get("label", "")[:120], Path(original).name[:120] or f"file{ext}", stored, len(content), db.now())
    who = next((v for k, v in data.items() if "name" in k.lower()), "") or next((v for v in data.values() if "@" in str(v)), "")
    db.log("New lead", f"{spec_.get('title', 'Form')}: {who}"[:200], None, site_id)
    return lead_id


def files_for(lead_id: int) -> list[dict]:
    return db.all("SELECT * FROM lead_files WHERE lead_id = ? ORDER BY id", lead_id)


def file_path(row: dict) -> Path:
    return UPLOADS_DIR / str(int(row["site_id"])) / Path(row["stored"]).name


def delete_files(lead_id: int) -> None:
    for row in files_for(lead_id):
        try:
            file_path(row).unlink()
        except OSError:
            pass
    db.run("DELETE FROM lead_files WHERE lead_id = ?", lead_id)


def summary(data: dict) -> dict:
    """Name, email, phone and message of a lead, whichever form it came from (the Leads list)."""
    items = list((data or {}).items())
    low = [(k.lower(), str(v)) for k, v in items]
    name = data.get("name") or next((v for k, v in low if "name" in k and "@" not in v), "")
    email = data.get("email") or next((v for k, v in low if EMAIL_RE.match(v.strip())), "")
    phone = data.get("phone") or next((v for k, v in low if "phone" in k or k in ("tel", "mobile")), "")
    message = data.get("message") or next((v for k, v in low if k in ("message", "project details", "anything we should know?")), "")
    if not message:
        rest = [f"{k}: {v}" for k, v in items if str(v) not in (name, email, phone) and k.lower() not in ("service", "consent")]
        message = " · ".join(rest)
    return {"name": name, "email": email, "phone": phone, "message": message[:600], "service": data.get("service") or data.get("Service", "")}
