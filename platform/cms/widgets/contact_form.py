"""
widgets/contact_form.py: the Form block, a form builder. Fields of any kind (text, email, phone, long text, list,
tick boxes, choices, date, file upload), in the order set in the builder (drag or the arrows), required or not,
half or full width; presets for a contact form, a quote request, an appointment request and a newsletter signup.
Sends go to Leads (and an email to the form's recipient: mail.py). How a send is checked and stored: forms.py.

The recipient address and limits are never written into the page: the server reads them from the deployment's
snapshot (.tenshi-forms.json). The classic Form block (blocks.py "form") still works as before.
"""

from __future__ import annotations

import re
from typing import Literal

from markupsafe import Markup, escape
from pydantic import BaseModel, ConfigDict, Field, field_validator

from .. import forms
from . import Widget, WidgetContext, block_uid, clean_link, register

TYPE_OPTIONS = [["text", "Short text"], ["email", "Email"], ["phone", "Phone"], ["textarea", "Long text"], ["select", "Drop-down list"],
                ["radio", "Choose one (buttons)"], ["checkbox", "Tick box(es)"], ["date", "Date"], ["file", "File upload"]]


class FormField(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
    label: str = Field("Your name", min_length=1, max_length=80, json_schema_extra={"label": "Label"})
    type: Literal["text", "email", "phone", "textarea", "select", "checkbox", "radio", "date", "file"] = Field(
        "text", json_schema_extra={"label": "Type", "options": TYPE_OPTIONS})
    required: bool = Field(False, json_schema_extra={"label": "Required"})
    width: Literal["full", "half"] = Field("full", json_schema_extra={"label": "Width", "options": [["full", "Full width"], ["half", "Half (side by side)"]]})
    placeholder: str = Field("", max_length=120, json_schema_extra={"label": "Placeholder (grey example text)"})
    options: str = Field("", max_length=1500, json_schema_extra={"label": "Choices (lists, buttons, tick boxes): one per line or comma-separated", "type": "textarea"})
    help: str = Field("", max_length=200, json_schema_extra={"label": "Help text under the box"})
    accept: Literal["both", "images", "documents"] = Field("both", json_schema_extra={
        "label": "File upload: allowed files", "options": [["both", "Pictures and documents"], ["images", "Pictures (JPG, PNG, WebP, GIF)"], ["documents", "Documents (PDF, Word, Excel, text)"]]})
    max_mb: int = Field(5, ge=1, le=10, json_schema_extra={"label": "File upload: largest file (MB)", "type": "select",
                                                          "options": [[1, "1 MB"], [2, "2 MB"], [5, "5 MB"], [10, "10 MB"]]})

    @field_validator("max_mb", mode="before")
    @classmethod
    def _mb(cls, v):
        try:
            return int(v or 5)
        except (TypeError, ValueError):
            return 5

    @field_validator("options")
    @classmethod
    def _opts(cls, v, info):
        return "\n".join(forms.options_of(v))


class FormConfig(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
    preset: Literal["contact", "quote", "appointment", "newsletter", "custom"] = Field("contact", json_schema_extra={
        "label": "Start from", "options": [["contact", "Contact form"], ["quote", "Quote request"], ["appointment", "Appointment request"],
                                           ["newsletter", "Newsletter signup"], ["custom", "My own (keep my fields)"]]})
    heading: str = Field("Send us a message", max_length=120, json_schema_extra={"label": "Heading"})
    intro: str = Field("We answer within one working day.", max_length=400, json_schema_extra={"label": "Intro", "type": "textarea"})
    fields: list[FormField] = Field(default_factory=lambda: [FormField(**f) for f in forms.PRESETS["contact"]["fields"]],
                                    min_length=1, max_length=25, json_schema_extra={"label": "Fields (drag to reorder)", "item_label": "Field"})
    button_text: str = Field("Send message", min_length=1, max_length=40, json_schema_extra={"label": "Button text"})
    success_message: str = Field("Thank you! Your message is on its way. We'll be in touch soon.", max_length=300,
                                 json_schema_extra={"label": "Thank-you message", "type": "textarea"})
    redirect: str = Field("", max_length=500, json_schema_extra={"label": "…or after sending, go to (a page or https:// address; empty = show the message)", "type": "link"})
    recipient_email: str = Field("", max_length=200, json_schema_extra={"label": "Email new messages to (empty = Leads only)"})
    consent: bool = Field(False, json_schema_extra={"label": "Ask for consent (a tick box visitors must tick)"})
    consent_text: str = Field("I agree that you may store my details to answer my message.", max_length=300,
                              json_schema_extra={"label": "Consent text", "type": "textarea"})

    @field_validator("redirect")
    @classmethod
    def _redirect(cls, v):
        v = clean_link(v)
        if v and not (re.fullmatch(r"[a-z0-9][a-z0-9-]{0,80}", v) or v.startswith("https://")):
            raise ValueError("after sending, go to one of your pages or an https:// address")
        return v

    @field_validator("recipient_email")
    @classmethod
    def _email(cls, v):
        if v and not forms.EMAIL_RE.match(v):
            raise ValueError("the recipient is one email address, like hello@example.com")
        return v


def _field_html(f: FormField, key: str, uid: str, ctx_mode: str) -> str:
    fid = f"{uid}-{key}"
    req = " required" if f.required else ""
    star = '<span class="tw-req" aria-hidden="true">*</span>' if f.required else ""
    ph = f' placeholder="{escape(f.placeholder)}"' if f.placeholder else ""
    help_id = f"{fid}-help"
    described = f' aria-describedby="{help_id}"' if f.help else ""
    help_html = f'<small class="tw-help" id="{help_id}">{escape(f.help)}</small>' if f.help else ""
    cls = "tw-field" + (" tw-half" if f.width == "half" else "")
    label = escape(f.label)
    opts = forms.options_of(f.options)
    if f.type in ("radio",) or (f.type == "checkbox" and opts):
        kind = "radio" if f.type == "radio" else "checkbox"
        boxes = "".join(f'<label class="tw-choice"><input type="{kind}" name="{key}" value="{escape(o)}"'
                        f'{req if kind == "radio" and i == 0 else ""}> <span>{escape(o)}</span></label>' for i, o in enumerate(opts))
        data_req = ' data-required="1"' if f.required and kind == "checkbox" else ""
        return (f'<fieldset class="{cls} tw-group"{described}{data_req}><legend>{label}{star}</legend>'
                f'<div class="tw-choices">{boxes}</div>{help_html}</fieldset>')
    if f.type == "checkbox":
        return (f'<div class="{cls}"><label class="tw-choice tw-single"><input type="checkbox" name="{key}" value="yes"{req}{described}> '
                f'<span>{label}{star}</span></label>{help_html}</div>')
    if f.type == "select":
        options = '<option value="">Choose…</option>' + "".join(f"<option>{escape(o)}</option>" for o in opts)
        control = f'<select id="{fid}" name="{key}"{req}{described}>{options}</select>'
    elif f.type == "textarea":
        control = f'<textarea id="{fid}" name="{key}" rows="5" maxlength="5000"{req}{ph}{described}></textarea>'
    elif f.type == "file":
        if ctx_mode == "export":
            return ""                                     # an exported site sends by email: no uploads
        control = (f'<input id="{fid}" type="file" name="{key}" accept="{forms.accept_attr(f.accept)}" data-max-mb="{f.max_mb}"{req}{described}>')
        if not f.help:
            help_html = f'<small class="tw-help" id="{help_id}">Up to {f.max_mb} MB.</small>'
            control = control.replace(">", f' aria-describedby="{help_id}">', 1) if not described else control
    else:
        itype, extra = {"email": ("email", ' autocomplete="email"'), "phone": ("tel", ' autocomplete="tel"'),
                        "date": ("date", ""), "text": ("text", "")}[f.type]
        if f.type == "text" and "name" in f.label.lower():
            extra = ' autocomplete="name"'
        control = f'<input id="{fid}" type="{itype}" name="{key}" maxlength="300"{extra}{req}{ph}{described}>'
    return f'<div class="{cls}"><label for="{fid}">{label}{star}</label>{control}{help_html}</div>'


def render(block: dict, ctx: WidgetContext) -> Markup:
    from . import get
    cfg: FormConfig = get("contact_form").config_for(block.get("data"))
    uid = "tf" + block_uid(block)
    fields = [f.model_dump() for f in cfg.fields]
    keys = forms.keys_for(fields)
    email = ((ctx.profile or {}).get("company") or {}).get("email", "")
    if ctx.mode == "hosted":
        action, enctype = "__form", ' enctype="multipart/form-data"'
    elif ctx.mode == "export":
        action, enctype = (f"mailto:{email}" if email else "#"), ' enctype="text/plain"'
    else:
        action, enctype = "#", ""
    redirect = ""
    if cfg.redirect:
        redirect = cfg.redirect if cfg.redirect.startswith("https://") else ctx.link(cfg.redirect)
    body = "".join(_field_html(f, k, uid, ctx.mode) for f, k in zip(cfg.fields, keys))
    consent = (f'<div class="tw-field"><label class="tw-choice tw-single tw-consent"><input type="checkbox" name="_consent" value="yes" required> '
               f'<span>{escape(cfg.consent_text)}<span class="tw-req" aria-hidden="true">*</span></span></label></div>' if cfg.consent else "")
    head = f'<h2 id="{uid}-h" data-edit="heading">{escape(cfg.heading)}</h2>' if cfg.heading else ""
    intro = f'<p class="intro" data-edit="intro">{escape(cfg.intro)}</p>' if cfg.intro else ""
    labelled = f' aria-labelledby="{uid}-h"' if head else ""
    preview = ' data-preview="1"' if ctx.mode == "preview" else ""
    return Markup(
        f'<section class="band tw-form-block"{labelled}><div class="wrap narrow">{head}{intro}'
        f'<form class="tw-form" method="post" action="{escape(action)}"{enctype} novalidate data-success="{escape(cfg.success_message)}"'
        f'{f" data-redirect={chr(34)}{escape(redirect)}{chr(34)}" if redirect else ""}{preview}>'
        f'<input type="hidden" name="_page" value="{escape(block.get("_page", ""))}"><input type="hidden" name="_form" value="{escape(block_uid(block))}">'
        f'<p class="hp" aria-hidden="true" style="position:absolute;left:-9999px"><label>Leave this empty <input name="_hp" tabindex="-1" autocomplete="off"></label></p>'
        f'<div class="tw-fields">{body}{consent}</div>'
        f'<p class="tw-form-error" role="alert" hidden></p>'
        f'<button class="btn tw-submit" type="submit" data-edit="button_text">{escape(cfg.button_text)}</button>'
        f'<p class="tw-form-note" role="status" aria-live="polite"></p></form></div></section>')


register(Widget(
    name="contact_form", label="Form", about="A form you build: contact, quote request, appointment or newsletter, or your own fields. Messages arrive under Leads.",
    config=FormConfig, render=render, assets=["form.css", "form.js"],
    presets={"preset": {k: {kk: vv for kk, vv in v.items()} for k, v in forms.PRESETS.items()}},
    hint="Messages arrive under <b>Leads</b>, with any uploaded files (only signed-in team members can open them). "
         "Choosing a preset under “Start from” replaces the fields; pick “My own” to keep editing yours.",
))
