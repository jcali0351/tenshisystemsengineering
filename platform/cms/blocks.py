"""
blocks.py: the kinds of block the page builder offers, and the settings each one has.

Each block type has:
    label, about    what the builder shows in its "Add block" list
    fields          the settings form on the right of the builder. Field types:
                      text, textarea, rich (simple formatted text), html (source code), number, checkbox,
                      select (with options), link (another page), media (a picture), video (a video),
                      album (a gallery album), category (a portfolio category)
    data            the settings a brand-new block starts with

The look of each block lives in the template: designs/starter/blocks/<type>.html.j2.
To add a block type: add it here AND add blocks/<type>.html.j2 to the starter design (and existing templates).

Widgets (cms/widgets/: Store …) are blocks that draw themselves and work in every template without template files.
They are added to BLOCKS at the bottom of this file from the widget registry.
"""

import secrets

BLOCKS = {
    "hero": {
        "label": "Hero", "about": "The big opening: headline, text, buttons and a picture.",
        "fields": [
            {"name": "kicker", "label": "Small line above the headline", "type": "text"},
            {"name": "heading", "label": "Headline", "type": "text"},
            {"name": "text", "label": "Text", "type": "textarea"},
            {"name": "button_text", "label": "Button text", "type": "text"},
            {"name": "button_link", "label": "Button goes to", "type": "link"},
            {"name": "call_button", "label": "Show a Call button", "type": "checkbox"},
            {"name": "image", "label": "Picture", "type": "media"},
            {"name": "layout", "label": "Layout", "type": "select",
             "options": [["split", "Text and picture side by side"], ["centered", "Centred text"], ["background", "Picture behind the text"]]},
        ],
        "data": {"heading": "", "text": "", "button_text": "Get a free quote", "button_link": "contact", "call_button": True, "layout": "split"},
    },
    "text": {
        "label": "Text", "about": "A heading and paragraphs.",
        "fields": [{"name": "heading", "label": "Heading", "type": "text"}, {"name": "body", "label": "Text", "type": "rich"},
                   {"name": "center", "label": "Centre it", "type": "checkbox"}],
        "data": {"heading": "About us", "body": "<p>Tell your story here: how you started, what you care about, and why customers choose you.</p>"},
    },
    "services": {
        "label": "Services", "about": "Cards from your services list (Business data).",
        "fields": [{"name": "heading", "label": "Heading", "type": "text"}, {"name": "intro", "label": "Intro", "type": "textarea"},
                   {"name": "columns", "label": "Columns", "type": "select", "options": [["2", "2"], ["3", "3"], ["4", "4"]]},
                   {"name": "limit", "label": "Show at most (empty = all)", "type": "number"},
                   {"name": "show_prices", "label": "Show prices", "type": "checkbox"}],
        "data": {"heading": "What we do", "columns": "3", "show_prices": True},
    },
    "gallery": {
        "label": "Gallery", "about": "An album of pictures with a lightbox.",
        "fields": [{"name": "heading", "label": "Heading", "type": "text"}, {"name": "album", "label": "Album", "type": "album"},
                   {"name": "layout", "label": "Layout", "type": "select",
                    "options": [["", "As set on the album"], ["masonry", "Masonry"], ["grid", "Grid"], ["carousel", "Carousel"]]},
                   {"name": "lightbox", "label": "Open pictures full screen", "type": "checkbox"}],
        "data": {"heading": "Gallery", "lightbox": True},
    },
    "portfolio": {
        "label": "Portfolio", "about": "Projects with filters and before/after sliders.",
        "fields": [{"name": "heading", "label": "Heading", "type": "text"}, {"name": "intro", "label": "Intro", "type": "textarea"},
                   {"name": "category", "label": "Only this category", "type": "category"},
                   {"name": "layout", "label": "Layout", "type": "select", "options": [["grid", "Grid"], ["masonry", "Masonry"]]},
                   {"name": "filters", "label": "Show category filters", "type": "checkbox"},
                   {"name": "limit", "label": "Show at most (empty = all)", "type": "number"}],
        "data": {"heading": "Our work", "layout": "grid", "filters": True},
    },
    "before_after": {
        "label": "Before & after", "about": "A slider comparing two pictures.",
        "fields": [{"name": "heading", "label": "Heading", "type": "text"}, {"name": "before", "label": "Before picture", "type": "media"},
                   {"name": "after", "label": "After picture", "type": "media"}, {"name": "caption", "label": "Caption", "type": "text"}],
        "data": {"heading": "Before & after"},
    },
    "team": {
        "label": "Team", "about": "Your people, from Business data › Team.",
        "fields": [{"name": "heading", "label": "Heading", "type": "text"}, {"name": "intro", "label": "Intro", "type": "textarea"}],
        "data": {"heading": "Meet the team"},
    },
    "testimonials": {
        "label": "Testimonials", "about": "Customer reviews, from Business data.",
        "fields": [{"name": "heading", "label": "Heading", "type": "text"}],
        "data": {"heading": "What customers say"},
    },
    "cta": {
        "label": "Call to action", "about": "A coloured band with one button.",
        "fields": [{"name": "heading", "label": "Heading", "type": "text"}, {"name": "text", "label": "Text", "type": "textarea"},
                   {"name": "button_text", "label": "Button text", "type": "text"}, {"name": "button_link", "label": "Button goes to", "type": "link"}],
        "data": {"heading": "Ready to get started?", "text": "Tell us what you need. We answer within one working day.",
                 "button_text": "Contact us", "button_link": "contact"},
    },
    "form": {
        "label": "Form", "about": "A contact form. Messages arrive under Leads.",
        "fields": [{"name": "heading", "label": "Heading", "type": "text"}, {"name": "intro", "label": "Intro", "type": "textarea"},
                   {"name": "fields", "label": "Boxes to show", "type": "select",
                    "options": [["name,email,phone,message", "Name, email, phone, message"], ["name,email,message", "Name, email, message"],
                                ["name,email,phone,service,message", "Name, email, phone, service, message"]]},
                   {"name": "button_text", "label": "Button text", "type": "text"}],
        "data": {"heading": "Send us a message", "fields": "name,email,phone,message", "button_text": "Send"},
    },
    "contact": {
        "label": "Contact details", "about": "Phone, email, address, hours and locations.",
        "fields": [{"name": "heading", "label": "Heading", "type": "text"}],
        "data": {"heading": "Contact us"},
    },
    "image": {
        "label": "Image", "about": "One picture with a caption.",
        "fields": [{"name": "image", "label": "Picture", "type": "media"}, {"name": "caption", "label": "Caption", "type": "text"},
                   {"name": "width", "label": "Width", "type": "select", "options": [["wide", "Wide"], ["full", "Full width"], ["narrow", "Narrow"]]}],
        "data": {"width": "wide"},
    },
    "video": {
        "label": "Video", "about": "An uploaded video or a YouTube link.",
        "fields": [{"name": "heading", "label": "Heading", "type": "text"}, {"name": "video", "label": "Video from the Media Center", "type": "video"},
                   {"name": "youtube", "label": "…or a YouTube link", "type": "text"}, {"name": "caption", "label": "Caption", "type": "text"}],
        "data": {},
    },
    "html": {
        "label": "Custom HTML", "about": "For advanced users: your own HTML.",
        "fields": [{"name": "html", "label": "HTML", "type": "html"}],
        "data": {"html": "<p>Your own HTML here.</p>"},
    },
    "spacer": {
        "label": "Spacer", "about": "Empty space between blocks.",
        "fields": [{"name": "size", "label": "Size", "type": "select", "options": [["small", "Small"], ["medium", "Medium"], ["large", "Large"]]}],
        "data": {"size": "medium"},
    },
}


# Widgets from the registry (cms/widgets/), after the built-in blocks
from . import widgets  # noqa: E402

BLOCKS.update(widgets.block_types())


def new_block(kind, **data):
    """A fresh block of one kind, with its starting settings (plus any you pass)."""
    if kind not in BLOCKS:
        raise ValueError(f"Unknown block type: {kind}")
    return {"id": secrets.token_hex(4), "type": kind, "data": {**BLOCKS[kind]["data"], **data}}


def default_pages(profile):
    """The pages a brand-new site starts with. Each is (slug, title, blocks)."""
    name = profile.get("company", {}).get("name") or "Our business"
    return [
        ("index", "Home", [new_block("hero", heading=profile.get("company", {}).get("tagline") or name),
                           new_block("services", limit=3), new_block("portfolio", limit=6, heading="Recent work"),
                           new_block("testimonials"), new_block("cta")]),
        ("about", "About", [new_block("text", heading=f"About {name}", body=f"<p>{profile.get('company', {}).get('description', '')}</p>"),
                            new_block("team")]),
        ("services", "Services", [new_block("services", heading="Services"), new_block("cta")]),
        ("work", "Our Work", [new_block("portfolio", heading="Our work"), new_block("gallery", heading="Gallery")]),
        ("contact", "Contact", [new_block("contact"), new_block("form")]),
    ]
