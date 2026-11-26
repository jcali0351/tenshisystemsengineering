"""
widgets/pricing.py: price tiers side by side (cards on wide screens, stacked on phones). Each tier has a name, price,
period, a short description, features (one per line), a button and an optional "Most popular" highlight.
"""

from __future__ import annotations

from markupsafe import Markup, escape
from pydantic import BaseModel, ConfigDict, Field, field_validator

from . import Widget, WidgetContext, block_uid, clean_link, register


class Tier(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
    name: str = Field("Plan", max_length=60, json_schema_extra={"label": "Name"})
    price: str = Field("$0", max_length=30, json_schema_extra={"label": "Price (as shown, like $49 or From £20)"})
    period: str = Field("/month", max_length=30, json_schema_extra={"label": "Per (like /month, /job; optional)"})
    description: str = Field("", max_length=300, json_schema_extra={"label": "Short description"})
    features: str = Field("", max_length=2000, json_schema_extra={"label": "What's included (one per line)", "type": "textarea"})
    button_text: str = Field("Get started", max_length=40, json_schema_extra={"label": "Button text"})
    button_link: str = Field("contact", max_length=500, json_schema_extra={"label": "Button goes to", "type": "link"})
    highlight: bool = Field(False, json_schema_extra={"label": "Highlight as most popular"})

    @field_validator("button_link")
    @classmethod
    def _link(cls, v):
        return clean_link(v)


SAMPLE = [
    Tier(name="Starter", price="$49", period="/month", description="For a small home or a one-off job.",
         features="One visit a month\nEmail support\nNo contract"),
    Tier(name="Standard", price="$99", period="/month", description="What most customers choose.",
         features="Two visits a month\nPhone and email support\nPriority booking\n10% off repairs", highlight=True),
    Tier(name="Premium", price="$179", period="/month", description="For larger properties and businesses.",
         features="Weekly visits\nSame-day call-outs\nA named technician\n20% off repairs"),
]


class PricingConfig(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
    heading: str = Field("Prices", max_length=120, json_schema_extra={"label": "Heading"})
    intro: str = Field("", max_length=400, json_schema_extra={"label": "Intro", "type": "textarea"})
    tiers: list[Tier] = Field(default_factory=lambda: [t.model_copy() for t in SAMPLE], max_length=6,
                              json_schema_extra={"label": "Tiers", "item_label": "Tier"})
    highlight_label: str = Field("Most popular", max_length=30, json_schema_extra={"label": "Highlight label"})
    note: str = Field("", max_length=300, json_schema_extra={"label": "Small print under the tiers"})


def render(block: dict, ctx: WidgetContext) -> Markup:
    from . import get
    cfg: PricingConfig = get("pricing").config_for(block.get("data"))
    uid = block_uid(block)
    cards = []
    for t in cfg.tiers:
        feats = [f.strip().lstrip("-•* ").strip() for f in t.features.splitlines() if f.strip()]
        cards.append(
            f'<li class="tw-tier{" tw-tier-hot" if t.highlight else ""}">'
            + (f'<p class="tw-tier-flag">{escape(cfg.highlight_label)}</p>' if t.highlight and cfg.highlight_label else "")
            + f'<h3>{escape(t.name)}</h3>'
            f'<p class="tw-tier-price"><b>{escape(t.price)}</b>' + (f'<span>{escape(t.period)}</span>' if t.period else "") + "</p>"
            + (f'<p class="tw-tier-desc">{escape(t.description)}</p>' if t.description else "")
            + ('<ul class="tw-tier-feats">' + "".join(f"<li>{escape(f)}</li>" for f in feats) + "</ul>" if feats else "")
            + (f'<a class="btn{"" if t.highlight else " btn-line"}" href="{escape(ctx.link(t.button_link or "contact"))}">{escape(t.button_text)}</a>'
               if t.button_text else "")
            + "</li>")
    n = max(1, min(len(cards), 4))
    return Markup(
        f'<section class="band tw-pricing" aria-labelledby="pr-{uid}-h"><div class="wrap">'
        f'<h2 id="pr-{uid}-h" data-edit="heading">{escape(cfg.heading)}</h2>'
        + (f'<p class="intro">{escape(cfg.intro)}</p>' if cfg.intro else "")
        + f'<ul class="tw-tiers tw-tiers-{n}">{"".join(cards)}</ul>'
        + (f'<p class="tw-pricing-note">{escape(cfg.note)}</p>' if cfg.note else "")
        + "</div></section>")


register(Widget(
    name="pricing", label="Pricing", about="Price tiers side by side, with what's included and a button.",
    config=PricingConfig, render=render, assets=["pricing.css"],
    hint="Up to 6 tiers. Put each feature on its own line.",
))
