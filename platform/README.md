# Tenshi platform (Python)

Two things live here:

1. **The Tenshi CMS** (`cms/`), the product: a web app that creates, edits, deploys and exports client websites.
2. **The Business Data Engine tools** (`tenshi/`): the business profile, the template scanner that builds CMS forms
   automatically, and a small command-line builder. The CMS uses them.

A business is described **once**, as a JSON "business profile"; every template is just a way of showing it.
The full plan is in [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md).

## Run the CMS (Windows)

From the repository folder, the first time:

```powershell
py -m venv platform\.venv
platform\.venv\Scripts\python -m pip install -r platform\requirements.txt
platform\.venv\Scripts\python platform\run_cms.py --demo
```

Then open **http://localhost:8000**. The first visit asks you to create the admin account. `--demo` adds a sample
business ("Ridgeline Builders") so there's something to look at; leave it off afterwards.
Client sites are served at **http://&lt;address&gt;.localhost:8000** (e.g. http://ridgeline-builders.localhost:8000)
once deployed. Everything the CMS stores is in `platform/cms_data/` (not in git): delete that folder to start fresh.

What's in the CMS (left menu):

| Section | What it does |
|---|---|
| Dashboard | Sites, deployments, storage, leads, visits (no cookies), recent activity, tasks from every site's health checks, updates |
| All sites, New site | Create a site from any template in about a second, deployed straight away |
| Templates | The Template Gallery: preview, deploy in one click, create, clone, delete, edit the source, save and restore versions |
| Users | Admins and editors (editors can't delete, export, clone, manage users or edit template code) |
| Overview | One site's numbers, health score and checklist, live version, most visited pages |
| Pages & builder | Visual page builder: blocks (hero, text, services, gallery, portfolio, before/after, team, testimonials, call to action, form, contact, image, video, custom HTML, spacer), drag to reorder, click text in the preview and type, desktop/tablet/phone preview, page SEO |
| Business data | The business profile, as a form built automatically from the template's fields plus the standard schema; earlier versions can be restored |
| Media Center | Folders, categories, tags, search, bulk upload by drag and drop, compression and resized copies, crop/resize/rotate, video, PDF, SVG (cleaned), alt text, "used on", bulk move/tag/delete |
| Portfolio | Projects with categories, tags, cover, before/after pictures and an album |
| Galleries | Albums of pictures (masonry, grid or carousel) with captions, drag to reorder |
| Leads | Messages from the sites' forms, with status and CSV download |
| Deployments | Deploy, history with "make live" (rollback), pause, health, clone website, backups with restore and download |
| Export | One ZIP with any of: website, media, database (JSON + SQLite), theme, configuration |
| Settings & theme | Template switch, colours, fonts, shape, language, address, delete site |

The public website's Launch page can create sites here too: set `LAUNCH_ENDPOINT` in `launch.js` to
`<CMS address>/api/launch` once the CMS runs on a public server (allowed origins: `TENSHI_LAUNCH_ORIGINS`, see `cms/config.py`).

Run the tests (they use a throw-away data folder):

```powershell
platform\.venv\Scripts\python platform\tests\test_cms.py
```

### Where things are

| Folder / file | What |
|---|---|
| `cms/app.py` | The web server: every screen, the JSON API (`/api/docs` lists it), serving client sites |
| `cms/sites.py` | Create, deploy, rollback, clone, backup/restore, health, export, leads, visits |
| `cms/media.py` | Upload checks, compression, resizing, cropping, SVG cleaning |
| `cms/render.py` | Turns business data + pages + template into HTML (preview, hosted and export versions) |
| `cms/blocks.py` | The page builder's block types and their settings |
| `cms/templates.py` | The Template Gallery store (versions, clone, restore) and font choices |
| `cms/db.py`, `cms/auth.py`, `cms/config.py` | Database tables, passwords, settings |
| `cms/ui/`, `cms/static/` | The CMS screens (Jinja2) and their CSS/JavaScript (`builder.js` is the page builder, `media.js` the Media Center) |
| `designs/starter/` | The starter design every template is copied from: `layout.html.j2`, `page.html.j2`, `blocks/*.html.j2`, `style.css`, `site.js` |

## The command-line tools (from this `platform` folder)

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

## Security settings

- **Sign-in rate limiting:** 5 wrong passwords for one email from one IP within 15 minutes locks that IP out of that
  email for 15 minutes (HTTP 429); 20 failures from one IP across any emails does the same. Behind Caddy the IP is the
  `X-Forwarded-For` Caddy sets. Tune with `TENSHI_LOGIN_MAX_FAILS`, `TENSHI_LOGIN_WINDOW`, `TENSHI_LOGIN_LOCK`,
  `TENSHI_LOGIN_IP_MAX_FAILS` (seconds for the time ones).
- **Login cookie:** `Secure` (https only) whenever `TENSHI_PUBLIC_URL` starts with `https://` (the server). Local http
  development and the tests run without it; force it with `TENSHI_SECURE_COOKIES=1` or `0`.
- **API docs:** `/api/docs`, `/redoc` and `/openapi.json` are off. For local development only: `TENSHI_API_DOCS=1`.
