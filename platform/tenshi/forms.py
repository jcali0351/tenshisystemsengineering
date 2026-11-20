"""
forms.py: turn the variables a design uses into the CMS's editing form.

Input:  the paths from scanner.py, e.g. ["company.name", "company.phone", "services[].name", "services[].price"]
Output: a form description the CMS can draw, grouped into sections:

    [
      {"section": "company", "title": "Company", "repeat": False, "fields": [
          {"path": "company.name", "label": "Business name", "type": "text", "required": True}, …]},
      {"section": "services", "title": "Services", "repeat": True, "fields": [
          {"path": "services[].name", "label": "Service name", "type": "text", …}, …]},
    ]

"repeat": True means the CMS shows an "Add another" button (one service, two services, …).
Labels come from the blueprint when it has one; otherwise we make one up from the name ("service_areas" -> "Service areas").
"""

import html

# Guess the kind of box from the field's name. First match wins, so put the more specific words first.
TYPE_HINTS = [
    (("email",), "email"),
    (("phone", "tel", "fax"), "tel"),
    (("logo", "photo", "image", "picture", "src", "before", "after", "avatar"), "image"),
    (("description", "about", "bio", "summary", "quote", "body", "message"), "textarea"),
    (("url", "link", "website", "facebook", "instagram", "linkedin", "youtube", "x", "tiktok"), "url"),
    (("rating",), "rating"),
    (("price", "cost"), "text"),
    (("service_areas", "tags", "keywords"), "list"),
    (("date", "created_at"), "date"),
]

SECTION_TITLES = {
    "company": "Your business", "site": "Website settings", "services": "Services", "products": "Products",
    "staff": "Team", "gallery": "Photo gallery", "portfolio": "Portfolio", "testimonials": "Customer reviews",
    "social": "Social media", "seo": "Search engines (SEO)",
}


# Groups that hold named entries rather than a list, and the entries the CMS offers for them
NAMED_GROUPS = {"social": ["facebook", "instagram", "x", "linkedin", "youtube", "tiktok"]}
NAMED_LABELS = {"x": "X (Twitter)", "linkedin": "LinkedIn", "youtube": "YouTube", "tiktok": "TikTok"}


def guess_type(path):
    """Pick a box type for a path, using its last word, e.g. 'company.email' -> 'email'."""
    last = path.split(".")[-1].replace("[]", "")
    for words, kind in TYPE_HINTS:
        if last in words or any(last.endswith("_" + w) for w in words):
            return kind
    return "text"


def make_label(path):
    """'services[].price' -> 'Price', 'company.service_areas' -> 'Service areas', 'company.logo.src' -> 'Logo'."""
    parts = [p.replace("[]", "") for p in path.split(".")]
    last = parts[-1]
    if last in ("src", "url") and len(parts) > 1:      # "logo.src" is really "the logo"
        last = parts[-2]
    if last == "alt":                                  # the hidden text that describes a picture
        return "Picture description"
    words = last.replace("_", " ").strip()
    return words[:1].upper() + words[1:]


def build_form(paths, blueprint):
    """Group the paths into CMS sections, with labels, help text, box types and required marks."""
    required = set(blueprint.get("required_fields", []))
    labels, helps = blueprint.get("labels", {}), blueprint.get("help", {})
    sections = {}
    for path in paths:
        top = path.split(".")[0]
        repeat = top.endswith("[]")
        name = top.replace("[]", "")
        section = sections.setdefault(name, {
            "section": name,
            "title": SECTION_TITLES.get(name, make_label(name)),
            "repeat": repeat,
            "help": helps.get(name, ""),
            "required": name in required,
            "fields": [],
        })
        section["repeat"] = section["repeat"] or repeat
        if path == top:
            # A group used only as a whole, e.g. `for network, link in social.items()`.
            # For the groups we know (NAMED_GROUPS), give each named entry its own box; otherwise there is nothing to add.
            for key in NAMED_GROUPS.get(name, []):
                section["fields"].append({"path": f"{name}.{key}", "label": NAMED_LABELS.get(key, make_label(key)),
                                          "type": "url", "required": False, "help": "", "ai": False})
            continue
        section["fields"].append({
            "path": path,
            "label": labels.get(path, make_label(path)),
            "type": guess_type(path),
            "required": path in required,
            "help": helps.get(path, ""),
            "ai": path in blueprint.get("ai", {}),     # the Tenshi AI can suggest text for this box
        })
    # Business first, then lists, then settings, in a fixed friendly order
    order = list(SECTION_TITLES)
    return sorted(sections.values(), key=lambda s: order.index(s["section"]) if s["section"] in order else 99)


def form_to_html(form, title="CMS form"):
    """
    Draw the form as a simple HTML page, so you can SEE what the CMS would show for a design.
    (The real CMS draws the same description with its own components.)
    """
    e = html.escape
    inputs = {
        "textarea": '<textarea name="{p}" rows="3"></textarea>',
        "image": '<input name="{p}" type="file" accept="image/*">',
        "rating": '<select name="{p}"><option>5</option><option>4</option><option>3</option><option>2</option><option>1</option></select>',
        "list": '<input name="{p}" placeholder="Separate with commas">',
    }
    out = [f"<!DOCTYPE html><html lang=en><meta charset=utf-8><title>{e(title)}</title>",
           "<style>body{font:16px/1.5 system-ui;max-width:760px;margin:40px auto;padding:0 16px;color:#222}"
           "fieldset{border:1px solid #ddd;border-top:3px solid #c8102e;margin:0 0 24px;padding:16px 18px}"
           "legend{font-weight:800;padding:0 6px}label{display:grid;gap:4px;margin:0 0 12px;font-weight:600}"
           "input,textarea,select{font:inherit;padding:8px;border:1px solid #bbb}small{color:#777;font-weight:400}"
           ".req{color:#c8102e}.ai{font-size:.75rem;background:#fde8eb;color:#c8102e;padding:1px 6px;margin-left:6px}"
           "button{font:inherit;padding:6px 12px}</style>",
           f"<h1>{e(title)}</h1><p>Built automatically from the design's templates. Nobody wrote this form by hand.</p>"]
    for section in form:
        out.append(f"<fieldset><legend>{e(section['title'])}{' <span class=req>*</span>' if section['required'] else ''}</legend>")
        if section["help"]:
            out.append(f"<p><small>{e(section['help'])}</small></p>")
        for field in section["fields"]:
            box = inputs.get(field["type"], '<input name="{p}" type="' + field["type"] + '">').format(p=e(field["path"]))
            star = " <span class=req>*</span>" if field["required"] else ""
            ai = " <span class=ai>AI can suggest</span>" if field["ai"] else ""
            hint = f"<small>{e(field['help'])}</small>" if field["help"] else ""
            out.append(f"<label><span>{e(field['label'])}{star}{ai}</span>{box}{hint}</label>")
        if section["repeat"]:
            out.append("<button type=button>+ Add another</button>")
        out.append("</fieldset>")
    return "\n".join(out)
