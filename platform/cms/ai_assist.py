"""
ai_assist.py: optional AI writing help in the page builder ("✨ Help me write" under text boxes).

Only there when a key exists: the site's own (Modules & inbox › AI writing assist; owners and admins; masked) or the
server's TENSHI_AI_KEY. Any OpenAI-compatible chat API (base address + model). The server makes the call, so the key
never reaches the browser. A suggestion is only shown: the editor chooses "Use this" to put it in the box, and
nothing is published until they Publish. Limited to 40 requests per person per hour.
"""

from __future__ import annotations

import os
import time
from collections import defaultdict, deque

from markupsafe import Markup
from pydantic import BaseModel, ConfigDict, Field, field_validator

from . import modcache, widgets

ACTIONS = {
    "improve": "Improve this text: clearer and more engaging, same meaning and roughly the same length.",
    "shorter": "Make this text shorter and punchier, keeping the key points.",
    "longer": "Expand this text a little with helpful, concrete detail. Don't invent facts, prices or claims.",
    "friendlier": "Rewrite this text in a warmer, friendlier tone.",
    "formal": "Rewrite this text in a more professional tone.",
    "fix": "Fix spelling, grammar and punctuation only. Change nothing else.",
    "draft": "Write the text for this field from the notes given. Don't invent facts, prices or claims.",
}
LIMIT, WINDOW = 40, 3600
_calls: dict[tuple, deque] = defaultdict(deque)


class AISettings(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
    api_key: str = Field("", max_length=300, json_schema_extra={"label": "API key", "secret": True,
                         "help": "Optional. An API key for an OpenAI-compatible chat service. Without it (and without a server key) the assist is hidden."})
    base_url: str = Field("https://api.openai.com/v1", max_length=200, json_schema_extra={"label": "API address (OpenAI-compatible)"})
    model: str = Field("gpt-4o-mini", max_length=80, json_schema_extra={"label": "Model"})

    @field_validator("base_url")
    @classmethod
    def _b(cls, v):
        if v and not v.startswith("https://"):
            raise ValueError("the API address starts with https://")
        return v.rstrip("/")


def config(site_id) -> dict | None:
    from . import demo_sites
    if site_id and demo_sites.is_demo(site_id):         # never on demo sites or the public sandbox (no spend)
        return None
    st = widgets.load_settings(site_id, "ai_assist") if site_id else None
    if st and st.api_key:
        return {"key": st.api_key, "base": st.base_url or "https://api.openai.com/v1", "model": st.model or "gpt-4o-mini"}
    if os.environ.get("TENSHI_AI_KEY"):
        return {"key": os.environ["TENSHI_AI_KEY"], "base": (os.environ.get("TENSHI_AI_BASE_URL") or "https://api.openai.com/v1").rstrip("/"),
                "model": os.environ.get("TENSHI_AI_MODEL") or "gpt-4o-mini"}
    return None


def available(site_id) -> bool:
    return config(site_id) is not None


def allow(user_id, site_id) -> bool:
    q, now = _calls[(user_id, site_id)], time.monotonic()
    while q and now - q[0] > WINDOW:
        q.popleft()
    if len(q) >= LIMIT:
        return False
    q.append(now)
    return True


def write(site: dict, profile: dict, text: str, action: str, field: str = "", notes: str = "") -> str:
    cfg = config(site["id"])
    if not cfg:
        raise LookupError("AI writing help isn't set up for this site.")
    if action not in ACTIONS:
        raise ValueError("Choose what to do with the text.")
    text, notes = (text or "")[:4000], (notes or "")[:1000]
    if action != "draft" and not text.strip():
        raise ValueError("Type something first, or choose “Write it from my notes”.")
    if action == "draft" and not (notes.strip() or text.strip()):
        raise ValueError("Add a few notes about what this text should say.")
    if not modcache.public_https(cfg["base"] + "/chat/completions"):
        raise ValueError("The AI service address isn't allowed.")
    company = (profile or {}).get("company") or {}
    about = f'Business: {company.get("name") or site.get("name", "")}. {company.get("description", "")}'.strip()[:600]
    system = ("You help a small business write website copy. Reply with the new text only: no quotes, no preamble, no markdown "
              "headings. Keep the language of the original. " + about)
    user = f'{ACTIONS[action]}\nField: {field[:60] or "text"}\n' + (f"Notes: {notes}\n" if notes else "") + (f"Text:\n{text}" if text else "")
    res = modcache.http_json(cfg["base"] + "/chat/completions", headers={"Authorization": f'Bearer {cfg["key"]}'}, timeout=30,
                             data={"model": cfg["model"], "temperature": 0.6, "max_tokens": 700,
                                   "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]})
    out = (((res or {}).get("choices") or [{}])[0].get("message") or {}).get("content") or ""
    out = out.strip().strip('"“”').strip()
    if not out:
        raise RuntimeError("The AI service sent nothing back. Try again.")
    return out[:6000]


widgets.register(widgets.Widget(
    name="ai_assist", label="AI writing assist", about="“Help me write” in the page builder, with your own key. Hidden without one.",
    config=BaseModel, render=lambda b, c: Markup(""), settings=AISettings, hidden=True, settings_page=True,
    connected=lambda st: bool(st and st.api_key) or bool(os.environ.get("TENSHI_AI_KEY")),
))
