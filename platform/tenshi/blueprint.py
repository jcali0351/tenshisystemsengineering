"""
blueprint.py: what a design needs, apart from how it looks.

Every design has a blueprint file (platform/blueprints/<design>.json) saying:
    required_fields  what must be filled in before the site can launch, e.g. "company.name", "services"
    pages            which output page is made from which template file
    labels, help     friendlier words for the CMS form (optional: forms.py makes up good ones otherwise)
    onboarding       which questions to ask in which Launch step
    ai               prompts the Tenshi AI assistant can use to suggest text for a field

This file reads blueprints and checks a profile against them.
"""

import json
from pathlib import Path

from . import profile as prof

PLATFORM_DIR = Path(__file__).resolve().parent.parent      # the "platform" folder
BLUEPRINTS = PLATFORM_DIR / "blueprints"
TEMPLATES = PLATFORM_DIR / "templates"
GALLERY_FILE = PLATFORM_DIR.parent / "data" / "templates.json"   # the website's design list (shared with the site)


def load(design_id):
    """Read the blueprint for one design. Designs without a blueprint file get a sensible default one."""
    file = BLUEPRINTS / f"{design_id}.json"
    if file.exists():
        data = json.loads(file.read_text(encoding="utf-8"))
    else:
        data = {"template": design_id, "required_fields": ["company.name", "company.email", "company.description"]}
    data.setdefault("pages", {"index.html": "index.html.j2"})
    data.setdefault("labels", {})
    data.setdefault("help", {})
    data.setdefault("onboarding", [])
    data.setdefault("ai", {})
    return data


def design(design_id):
    """The design's entry in data/templates.json (name, colours, style …), or a plain one if it isn't listed."""
    plain = {"id": design_id, "name": design_id.title(),
             "colors": {"primary": "#c8102e", "accent": "#3d4249", "surface": "#ffffff", "ink": "#222222"}}
    if not GALLERY_FILE.exists():
        return plain
    gallery = json.loads(GALLERY_FILE.read_text(encoding="utf-8"))
    return next((t for t in gallery.get("templates", []) if t["id"] == design_id), plain)


def missing_fields(business, blueprint):
    """
    List the required fields that are still empty. An empty list means: ready to launch.
        missing_fields(profile, blueprint)  ->  ["company.phone", "services"]
    """
    missing = []
    for path in blueprint.get("required_fields", []):
        value = prof.get(business, path)
        if isinstance(value, list) and path.count("[]"):         # e.g. "services[].name": every item needs one
            if not value or not all(prof.is_filled(v) for v in value):
                missing.append(path)
        elif not prof.is_filled(value):
            missing.append(path)
    return missing
