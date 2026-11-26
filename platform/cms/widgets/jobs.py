"""
widgets/jobs.py: a job board. Each opening has its type, place (or remote), pay, a description that opens in place,
and an Apply button (an email with the job title filled in, or a link to an application form). Openings past their
closing date (site time zone) are hidden at the next Publish. Google for Jobs gets JobPosting data.
"""

from __future__ import annotations

import json
import re
from datetime import date
from typing import Literal
from urllib.parse import quote

from markupsafe import Markup, escape
from pydantic import BaseModel, ConfigDict, Field, field_validator

from . import Widget, WidgetContext, block_uid, clean_link, paragraphs, register
from .modkit import chip_bar
from .. import sitetime

EMAIL_RE = re.compile(r"^[^@\s<>\"']{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$")
TYPES = {"full_time": "Full-time", "part_time": "Part-time", "contract": "Contract", "temporary": "Temporary", "internship": "Internship", "volunteer": "Volunteer"}
SCHEMA_TYPES = {"full_time": "FULL_TIME", "part_time": "PART_TIME", "contract": "CONTRACTOR", "temporary": "TEMPORARY", "internship": "INTERN", "volunteer": "VOLUNTEER"}

def _d(v):
    if v:
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", v):
            raise ValueError("a date is written like 2026-12-31")
        date.fromisoformat(v)
    return v

class Job(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
    title: str = Field("Barista", min_length=1, max_length=100, json_schema_extra={"label": "Job title"})
    type: Literal["full_time", "part_time", "contract", "temporary", "internship", "volunteer"] = Field("part_time", json_schema_extra={
        "label": "Type", "options": [[k, v] for k, v in TYPES.items()]})
    location: str = Field("", max_length=120, json_schema_extra={"label": "Where (empty = the business address)"})
    remote: bool = Field(False, json_schema_extra={"label": "Remote"})
    pay: str = Field("", max_length=60, json_schema_extra={"label": "Pay (shown as written, e.g. $18–22/hour)"})
    summary: str = Field("", max_length=300, json_schema_extra={"label": "One-line summary"})
    description: str = Field("", max_length=6000, json_schema_extra={"label": "Description (responsibilities, requirements …)", "type": "textarea"})
    posted: str = Field("", max_length=10, json_schema_extra={"label": "Posted (YYYY-MM-DD)"})
    closes: str = Field("", max_length=10, json_schema_extra={"label": "Closes (YYYY-MM-DD, optional)"})
    apply_email: str = Field("", max_length=200, json_schema_extra={"label": "Apply by email to (or…)"})
    apply_link: str = Field("", max_length=400, json_schema_extra={"label": "…apply at this link", "type": "link"})

    @field_validator("posted", "closes")
    @classmethod
    def _dates_ok(cls, v):
        return _d(v)

    @field_validator("apply_email")
    @classmethod
    def _e(cls, v):
        if v and not EMAIL_RE.match(v):
            raise ValueError("that email address doesn't look right")
        return v

    @field_validator("apply_link")
    @classmethod
    def _l(cls, v):
        return clean_link(v)

class JobsConfig(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
    heading: str = Field("Join the team", max_length=120, json_schema_extra={"label": "Heading"})
    intro: str = Field("", max_length=600, json_schema_extra={"label": "Intro", "type": "textarea"})
    jobs: list[Job] = Field(default_factory=lambda: [Job()], max_length=50, json_schema_extra={"label": "Openings", "item_label": "Opening"})
    filters: bool = Field(True, json_schema_extra={"label": "Filter by type (when there are several)"})
    empty: str = Field("No openings right now. We're always happy to hear from great people: send us a note.", max_length=300,
                       json_schema_extra={"label": "Text when there are no openings"})
    default_email: str = Field("", max_length=200, json_schema_extra={"label": "Apply email when an opening has none (empty = the business email)"})

def open_jobs(cfg: JobsConfig, today: str) -> list[Job]:
    return [j for j in cfg.jobs if not j.closes or j.closes >= today]

def render(block: dict, ctx: WidgetContext) -> Markup:
    from . import get
    cfg: JobsConfig = get("jobs").config_for(block.get("data"))
    uid = block_uid(block)
    today = sitetime.now(ctx.site.get("id")).date().isoformat()
    jobs = open_jobs(cfg, today)
    company = (ctx.profile or {}).get("company") or {}
    fallback = cfg.default_email or company.get("email") or ""
    items, ld = [], []
    for n, j in enumerate(jobs):
        where = "Remote" if j.remote and not j.location else (j.location + (" or remote" if j.remote else "")) if j.location else (company.get("address") or "")
        email = j.apply_email or fallback
        if j.apply_link:
            href = ctx.link(j.apply_link)
        elif email:
            href = f"mailto:{email}?subject={quote('Application: ' + j.title)}"
        else:
            href = ""
        meta = " · ".join(escape(x) for x in (TYPES[j.type], where, j.pay) if x)
        items.append(f'<li class="tw-jb" data-tw-tags="{escape(TYPES[j.type])}"><div class="tw-jb-top"><div><h3 id="jb-{uid}-{n}">{escape(j.title)}</h3>'
                     f'<p class="tw-jb-meta">{meta}</p>' + (f'<p class="tw-jb-sum">{escape(j.summary)}</p>' if j.summary else "") + "</div>"
                     + (f'<a class="tw-btn" href="{escape(href)}" aria-describedby="jb-{uid}-{n}"{" rel=" + chr(34) + "noopener" + chr(34) if href.startswith("http") else ""}>Apply</a>' if href else "")
                     + "</div>"
                     + (f'<details class="tw-jb-more"><summary>About the role<span class="tw-sr">: {escape(j.title)}</span></summary>{paragraphs(j.description)}</details>' if j.description else "")
                     + (f'<p class="tw-note">Apply by {date.fromisoformat(j.closes):%B} {int(j.closes[8:])}, {j.closes[:4]}</p>' if j.closes else "") + "</li>")
        posting = {"@context": "https://schema.org", "@type": "JobPosting", "title": j.title, "description": j.description or j.summary or j.title,
                   "datePosted": j.posted or today, "employmentType": SCHEMA_TYPES[j.type],
                   "hiringOrganization": {"@type": "Organization", "name": company.get("name") or ctx.site.get("name", "")}}
        if j.closes:
            posting["validThrough"] = j.closes
        if j.remote:
            posting["jobLocationType"] = "TELECOMMUTE"
        if j.location or company.get("address"):
            posting["jobLocation"] = {"@type": "Place", "address": j.location or company.get("address")}
        ld.append(posting)
    types = list(dict.fromkeys(TYPES[j.type] for j in jobs))
    bar = chip_bar([(t, t) for t in types], "Filter openings") if cfg.filters and len(types) > 1 else ""
    script = "".join('<script type="application/ld+json">' + json.dumps(p, ensure_ascii=False).replace("<", "\\u003c") + "</script>" for p in ld)
    body = f'<ul class="tw-jb-list">{"".join(items)}</ul>' if items else f'<p class="tw-jb-empty">{escape(cfg.empty)}</p>'
    return Markup(f'<section class="band tw-mod tw-jbs" aria-labelledby="jb-{uid}-h"><div class="wrap" data-tw-filterable>'
                  f'<div class="tw-head"><h2 id="jb-{uid}-h" data-edit="heading">{escape(cfg.heading)}</h2></div>'
                  + (f'<div class="tw-intro">{paragraphs(cfg.intro)}</div>' if cfg.intro else "") + f"{bar}{body}{script}</div></section>")

register(Widget(
    name="jobs", label="Job board", about="Openings with type, place, pay, details and an Apply button; closed ones hide themselves.",
    config=JobsConfig, render=render, assets=["jobs.css"], requires=["modkit"],
    hint="Openings past their closing date disappear at the next Publish.",
))
