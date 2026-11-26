"""
categories.py: business categories that were renamed or merged, and the one place that maps old names to new ones.

"church" was merged into "faith" (place of worship) with five variants (owner's decision, 26 Nov 2026). Anything still
saying "church" (a site's profile, a stock photo's category, older starter metadata) reads as faith / variant church:
  * normalize("church") -> ("faith", "church"); normalize("faith", "mosque") -> ("faith", "mosque").
  * migrate() runs at start-up: stock photos in "church" move to "faith" (tagged "church"), and site profiles with
    company.category "church" become category "faith" + variant "church". Safe to run any number of times.
The Launch form (launch.html, built by tools/build-pages.mjs) shows "Place of worship" with the same five variants.
Faith starter content is NOT seeded into client starter templates (still a draft).
"""

from __future__ import annotations

import json

from . import db

FAITH = "faith"
FAITH_LABEL = "Place of worship"
FAITH_VARIANTS = {"church": "Church", "mosque": "Mosque / Islamic center", "buddhist-temple": "Buddhist temple",
                  "hindu-temple": "Hindu mandir", "synagogue": "Synagogue"}
ALIASES = {"church": (FAITH, "church")}           # old category -> (category, variant)


def normalize(category: str, variant: str = "") -> tuple[str, str]:
    category = (category or "").strip().lower()
    if category in ALIASES:
        return ALIASES[category]
    if category == FAITH:
        return FAITH, variant if variant in FAITH_VARIANTS else ""
    return category, ""


def migrate_profile(profile: dict) -> bool:
    """Rewrite a business profile in place; True when it changed."""
    company = (profile or {}).get("company") or {}
    cat, var = normalize(company.get("category", ""), company.get("variant", ""))
    if cat == company.get("category", "") and (cat != FAITH or var == company.get("variant", "")):
        return False
    company["category"] = cat
    if cat == FAITH:
        company["variant"] = var
        company["category_label"] = FAITH_LABEL
    return True


def migrate() -> int:
    """Move old "church" references to faith/church. Returns how many rows changed."""
    changed = 0
    for row in db.all("SELECT id, tags FROM stock_photos WHERE category = 'church'"):
        tags = [t for t in (row["tags"] or "").split(",") if t.strip()]
        if "church" not in [t.strip() for t in tags]:
            tags.append("church")
        db.run("UPDATE stock_photos SET category = ?, tags = ?, updated_at = ? WHERE id = ?", FAITH, ",".join(t.strip() for t in tags), db.now(), row["id"])
        changed += 1
    for row in db.all("SELECT id, profile_json FROM sites WHERE profile_json LIKE '%church%'"):
        try:
            profile = json.loads(row["profile_json"] or "{}")
        except ValueError:
            continue
        if migrate_profile(profile):
            db.run("UPDATE sites SET profile_json = ? WHERE id = ?", db.dumps(profile), row["id"])
            changed += 1
    if changed:
        db.log("Categories updated", f"church -> faith/church on {changed} item(s)")
    return changed
