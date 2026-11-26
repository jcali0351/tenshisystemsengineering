"""
widgets/faq.py: questions and answers as an accordion (<details>, no script needed), with FAQPage structured data
(JSON-LD) so search engines can show the answers. Answers are plain text: blank lines make paragraphs.
"""

from __future__ import annotations

import json

from markupsafe import Markup, escape
from pydantic import BaseModel, ConfigDict, Field

from . import Widget, WidgetContext, block_uid, paragraphs, register


class Question(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
    question: str = Field("A question customers ask", max_length=300, json_schema_extra={"label": "Question"})
    answer: str = Field("The answer, in a sentence or two.", max_length=4000, json_schema_extra={"label": "Answer", "type": "textarea"})


SAMPLE = [
    Question(question="How soon can you start?", answer="Most jobs start within a week of saying yes. Urgent work can often be done the same day."),
    Question(question="Do you give free quotes?", answer="Yes. Tell us what you need and we'll send a fixed price, with no obligation."),
    Question(question="Which areas do you cover?", answer="The whole city and the surrounding towns. Ask if you're further out."),
]


class FaqConfig(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
    heading: str = Field("Questions and answers", max_length=120, json_schema_extra={"label": "Heading"})
    intro: str = Field("", max_length=400, json_schema_extra={"label": "Intro", "type": "textarea"})
    items: list[Question] = Field(default_factory=lambda: [q.model_copy() for q in SAMPLE], max_length=40,
                                  json_schema_extra={"label": "Questions", "item_label": "Question"})
    open_first: bool = Field(False, json_schema_extra={"label": "Open the first answer"})
    structured_data: bool = Field(True, json_schema_extra={"label": "Tell search engines (FAQPage structured data)"})


def json_ld(items: list[Question]) -> str:
    data = {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [
        {"@type": "Question", "name": q.question, "acceptedAnswer": {"@type": "Answer", "text": q.answer}}
        for q in items if q.question and q.answer]}
    return json.dumps(data, ensure_ascii=False).replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")


def render(block: dict, ctx: WidgetContext) -> Markup:
    from . import get
    cfg: FaqConfig = get("faq").config_for(block.get("data"))
    uid = block_uid(block)
    items = [q for q in cfg.items if q.question]
    rows = "".join(
        f'<details class="tw-faq-item"{" open" if cfg.open_first and i == 0 else ""}>'
        f'<summary><span>{escape(q.question)}</span><i aria-hidden="true"></i></summary>'
        f'<div class="tw-faq-a">{paragraphs(q.answer)}</div></details>' for i, q in enumerate(items))
    if not rows and ctx.mode == "preview":
        rows = '<p class="empty-note">Add questions in the block\'s settings.</p>'
    ld = (f'<script type="application/ld+json">{json_ld(items)}</script>' if cfg.structured_data and items else "")
    return Markup(
        f'<section class="band tw-faq" aria-labelledby="faq-{uid}-h"><div class="wrap tw-faq-in">'
        f'<h2 id="faq-{uid}-h" data-edit="heading">{escape(cfg.heading)}</h2>'
        + (f'<p class="intro">{escape(cfg.intro)}</p>' if cfg.intro else "")
        + f'<div class="tw-faq-list">{rows}</div></div>{ld}</section>')


register(Widget(
    name="faq", label="FAQ", about="Questions and answers that open on a click. Search engines can show them too.",
    config=FaqConfig, render=render, assets=["faq.css"],
    hint="Answers are plain text: leave a blank line to start a new paragraph.",
))
