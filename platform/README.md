# Tenshi platform prototype (Python)

The Business Data Engine in a few small, well-commented Python files. A business is described **once**, as a JSON
"business profile"; every website design is a folder of Jinja2 templates that shows that profile. The full plan is in
[`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md).

## Try it (Windows, from this `platform` folder)

```powershell
py -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt

# Which business details does the Contractor design use?
.venv\Scripts\python -m tenshi scan contractor

# The CMS form for it, built automatically (open out\form.html in a browser)
.venv\Scripts\python -m tenshi form contractor --html out\form.html

# Is this business ready to launch with its design?
.venv\Scripts\python -m tenshi check examples\johnsons-plumbing.json

# Make the website (open out\site\index.html)
.venv\Scripts\python -m tenshi build examples\johnsons-plumbing.json out\site

# Make the take-it-anywhere ZIP export
.venv\Scripts\python -m tenshi export examples\johnsons-plumbing.json out\export.zip
```

(`.venv` and `out` are not saved in git.)

## What's where

| File | What it does |
|---|---|
| `schema/business.schema.json` | The shape of a business profile: company, services, products, staff, gallery, portfolio, testimonials, social, seo |
| `examples/johnsons-plumbing.json` | A sample profile, in the same format the website's Launch page (`launch.js`) creates |
| `blueprints/contractor.json` | What the Contractor design needs: required fields, pages, friendly labels, onboarding steps, AI prompts |
| `templates/contractor/` | The Contractor design: `base.html.j2` (shared frame), one `.j2` per page, `style.css` |
| `tenshi/profile.py` | Load a profile, fill gaps with empty values, read values by path (`company.name`, `services[].name`) |
| `tenshi/blueprint.py` | Load a blueprint, find the design's colours in `../data/templates.json`, list missing required fields |
| `tenshi/scanner.py` | Read a design's templates and list every business variable it uses (this is what makes forms automatic) |
| `tenshi/forms.py` | Turn that list into CMS form sections and boxes; draw them as an HTML page |
| `tenshi/builder.py` | Render a profile into a static site (safely, in Jinja2's sandbox) and pack the ZIP export |
| `tenshi/cli.py` | The commands above |

## Making a new design

1. Add it to `../data/templates.json` (name, colours, pages, features). It then appears on the website's Portfolio
   page and in the Launch Sequence after `npm run build`.
2. Make a folder `templates/<id>/` with `base.html.j2`, page templates and `style.css`. Copy the Contractor one to
   start. Use the profile's names: `{{ company.name }}`, `{% for service in services %}{{ service.name }}{% endfor %}`.
3. Add `blueprints/<id>.json` listing the required fields and which template makes which page.
4. Run `scan` and `form` to see the CMS form your design creates, and `build` with a sample profile to see the site.

Names the platform provides (not business data, so they never become CMS boxes): `design` (colours from
templates.json), `year`, `form_action`. They're listed in `PLATFORM_NAMES` in `scanner.py`.
