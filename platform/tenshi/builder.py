"""
builder.py: make the website, and pack it up for export.

build(profile, out_dir)   renders the profile's design into plain HTML files in out_dir.
export_zip(profile, zip)  does the same and packs everything into one ZIP the owner can take anywhere:
                          the website, their business profile (JSON), the design's templates and a README.
                          No Tenshi server is needed to open or host it. That's the "no lock-in" promise.

Safety: designs may one day be edited by customers, so templates run in Jinja2's *sandbox*, which stops a template
from reaching into Python and doing anything it shouldn't. Autoescape is on, so a business called
"<script>…" shows up as text, never as code.
"""

import datetime
import re
import shutil
import tempfile
import zipfile
from pathlib import Path

from jinja2 import FileSystemLoader, select_autoescape
from jinja2.sandbox import SandboxedEnvironment

from . import blueprint as bp
from . import profile as prof


def make_env(design_id):
    """A Jinja2 environment that reads one design's folder, safely."""
    folder = bp.TEMPLATES / design_id
    if not folder.is_dir():
        raise FileNotFoundError(f"There is no design folder called {folder}")
    env = SandboxedEnvironment(
        loader=FileSystemLoader(str(folder)),
        autoescape=select_autoescape(["html", "j2"]),   # make text safe inside HTML automatically
        trim_blocks=True, lstrip_blocks=True,          # tidier output
    )
    # Our own filter: "+81 6 1234 5678" | tel  ->  "+81612345678", for tel: links
    env.filters["tel"] = lambda phone: re.sub(r"[^\d+]", "", str(phone or ""))
    return env


def context_for(business, design_id, form_action=""):
    """
    Everything a template can use: the whole profile (company, services, …) plus a few platform values.
    The platform values are listed in scanner.PLATFORM_NAMES so the CMS doesn't show boxes for them.
    """
    ctx = dict(business)
    ctx["design"] = bp.design(design_id)
    ctx["year"] = datetime.date.today().year
    # On Tenshi hosting, forms post to the platform (and become leads in the CRM).
    # In an export there is no server, so they fall back to the owner's email.
    ctx["form_action"] = form_action or ("mailto:" + business["company"]["email"] if business["company"]["email"] else "#")
    return ctx


def build(business, out_dir, form_action=""):
    """Render every page of the profile's design into out_dir. Returns the list of files written."""
    design_id = business["site"]["template"] or "contractor"
    blueprint = bp.load(design_id)
    env = make_env(design_id)
    ctx = context_for(business, design_id, form_action)

    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    written = []
    for page, template_file in blueprint["pages"].items():
        html = env.get_template(template_file).render(ctx)
        (out / page).write_text(html, encoding="utf-8")
        written.append(page)

    # Copy the design's own files (CSS, pictures …): everything in its folder that isn't a template
    for file in (bp.TEMPLATES / design_id).iterdir():
        if file.is_file() and file.suffix != ".j2":
            shutil.copy2(file, out / file.name)
            written.append(file.name)

    # A logo uploaded in the Launch Sequence arrives as a data: URL; save it as a real file
    logo = business["company"].get("logo") or {}
    if logo.get("data_url") and not logo.get("src"):
        written.append(_save_data_url(logo, out))
    return written


def _save_data_url(logo, out):
    """Turn 'data:image/png;base64,....' into out/logo.png."""
    import base64
    header, _, data = logo["data_url"].partition(",")
    ext = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/svg+xml": "svg"}.get(header[5:].split(";")[0], "png")
    name = f"logo.{ext}"
    (out / name).write_bytes(base64.b64decode(data))
    return name


def export_zip(business, zip_path):
    """
    Build the site and pack the complete export:
        site/                 the finished website: open site/index.html, or upload the folder to any web host
        business-profile.json the owner's data, in the open Tenshi format
        design/               the design's templates, so the site can be rebuilt or changed later
        README.txt            what everything is, in plain words
    """
    zip_path = Path(zip_path)
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        build(business, tmp / "site")
        prof.save(business, tmp / "business-profile.json")
        shutil.copytree(bp.TEMPLATES / business["site"]["template"], tmp / "design")
        (tmp / "README.txt").write_text(EXPORT_README.format(name=business["company"]["name"],
                                                              date=datetime.date.today().isoformat()), encoding="utf-8")
        zip_path.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
            for file in sorted(tmp.rglob("*")):
                if file.is_file():
                    z.write(file, file.relative_to(tmp))
    return zip_path


EXPORT_README = """{name}: your complete website export ({date})

This package is yours. It works without Tenshi Systems.

  site/                  Your finished website. Double-click site/index.html to see it, or upload the
                         whole folder to any web host (GitHub Pages, Netlify, your own server).
  business-profile.json  Everything about your business, in the open Tenshi format (plain JSON).
  design/                The design's templates (Jinja2). Change them and rebuild with the open-source
                         Tenshi tools:  python -m tenshi build business-profile.json out/

Contact forms in the exported site send email (mailto:) because there is no server behind them.
"""
