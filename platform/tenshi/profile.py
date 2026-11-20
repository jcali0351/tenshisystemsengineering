"""
profile.py: the business profile, the heart of the Business Data Engine.

A profile is plain JSON (see platform/schema/business.schema.json and examples/johnsons-plumbing.json).
This file has three jobs:
    1. load a profile from a file and fill in anything missing with safe empty values
    2. read a value by its "dotted path", e.g. get(profile, "company.name")
    3. tell whether a value counts as "filled in"
"""

import copy
import json
from pathlib import Path

# The empty profile. Every key a design might ask for exists here, so a template can always write
# {{ company.phone }} without crashing, even before the owner has typed a phone number.
EMPTY_PROFILE = {
    "schema": "tenshi.business/1",
    "company": {
        "name": "", "category": "", "category_label": "", "type": "", "tagline": "",
        "phone": "", "email": "", "address": "", "city": "", "state": "",
        "service_areas": [], "hours": [], "description": "", "logo": None,
    },
    "site": {"goal": "", "template": "", "subdomain": "", "domain": ""},
    "services": [],
    "products": [],
    "staff": [],
    "gallery": [],
    "portfolio": [],
    "testimonials": [],
    "social": {},
    "seo": {"title": "", "description": ""},
}


def load(path):
    """Read a business profile from a JSON file and fill any gaps from EMPTY_PROFILE."""
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    return with_defaults(data)


def with_defaults(data):
    """Return a copy of `data` where every key from EMPTY_PROFILE exists (the owner's values always win)."""
    def merge(base, extra):
        result = copy.deepcopy(base)
        for key, value in (extra or {}).items():
            if isinstance(value, dict) and isinstance(result.get(key), dict):
                result[key] = merge(result[key], value)   # go one level deeper, e.g. into "company"
            else:
                result[key] = value
        return result
    return merge(EMPTY_PROFILE, data)


def get(profile, path, default=None):
    """
    Read one value by its dotted path.
        get(p, "company.name")      -> "Johnson's Plumbing & Heating"
        get(p, "services")          -> the whole list of services
        get(p, "services[].name")   -> a list with every service's name
    """
    value = profile
    parts = path.split(".")
    for i, part in enumerate(parts):
        if part.endswith("[]"):                         # a list: collect the rest of the path from every item
            items = value.get(part[:-2], []) if isinstance(value, dict) else []
            rest = ".".join(parts[i + 1:])
            return [get(item, rest, default) if rest else item for item in items]
        if not isinstance(value, dict) or part not in value:
            return default
        value = value[part]
    return value


def is_filled(value):
    """True when a value has real content: not None, not an empty string, list or dict."""
    if value is None:
        return False
    if isinstance(value, str):
        return value.strip() != ""
    if isinstance(value, (list, dict)):
        return len(value) > 0
    return True


def save(profile, path):
    """Write a profile back to a JSON file, nicely indented so people can read it."""
    Path(path).write_text(json.dumps(profile, ensure_ascii=False, indent=2), encoding="utf-8")
