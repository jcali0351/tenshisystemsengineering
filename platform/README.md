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
| Pages & builder | Visual page builder: blocks (hero, text, services, gallery, portfolio, before/after, team, testimonials, call to action, form, contact, image, video, custom HTML, spacer) and widgets (Store), drag to reorder, click text in the preview and type, desktop/tablet/phone preview, page SEO |
| Business data | The business profile, as a form built automatically from the template's fields plus the standard schema; earlier versions can be restored |
| Media Center | Folders, categories, tags, search, bulk upload by drag and drop, compression and resized copies, crop/resize/rotate, video, PDF, SVG (cleaned), alt text, "used on", bulk move/tag/delete |
| Portfolio | Projects with categories, tags, cover, before/after pictures and an album |
| Galleries | Albums of pictures (masonry, grid or carousel) with captions, drag to reorder |
| Online store | The site's Shopify connection for Store blocks (store address, PUBLIC Storefront token, default collection, demo/live, button text) and a "Connect your Shopify store" guide. Admins only |
| Leads | Messages from the sites' forms, with status and CSV download |
| Deployments | Deploy, history with "make live" (rollback), pause, health, clone website, backups with restore and download |
| Export | One ZIP with any of: website, media, database (JSON + SQLite), theme, configuration |
| Settings & theme | Template switch, colours, fonts, shape, language, address, delete site |

The public website's Launch page can create sites here too: set `LAUNCH_ENDPOINT` in `launch.js` to
`<CMS address>/api/launch` once the CMS runs on a public server (allowed origins: `TENSHI_LAUNCH_ORIGINS`, see `cms/config.py`).

Run the tests (they use a throw-away data folder):

```powershell
platform\.venv\Scripts\python -m pytest platform\tests -q
```

### Where things are

| Folder / file | What |
|---|---|
| `cms/app.py` | The web server: every screen, the JSON API (`/api/docs` lists it), serving client sites |
| `cms/sites.py` | Create, deploy, rollback, clone, backup/restore, health, export, leads, visits |
| `cms/media.py` | Upload checks, compression, resizing, cropping, SVG cleaning |
| `cms/render.py` | Turns business data + pages + template into HTML (preview, hosted and export versions) |
| `cms/blocks.py` | The page builder's block types and their settings |
| `cms/widgets/` | The widget registry (`__init__.py`: blocks that draw themselves, with a Pydantic settings model, their own CSS/JS loaded only where used, per-site settings and per-page CSP sources) and the widgets: `store.py` (Shopify). Their files: `cms/static/widgets/<name>/` |
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
- **Client pages' Content-Security-Policy:** set by the CMS on every published page (`widgets.BASE_CSP`: scripts,
  connections, frames and form posts stay on the site; pictures from any https address). A page with a widget gets that
  widget's extra sources too (the Store adds `*.myshopify.com`, `cdn.shopify.com`, `checkout.shopify.com`), read from
  the deployment's `.tenshi-widgets.json` (never served). No Caddy change needed: client sites are proxied to the CMS.
  Google Maps and OpenStreetMap frames are allowed only on pages with a Map block (or a Google Maps iframe in Custom
  HTML); with the site's Maps API key the page also allows `maps.googleapis.com` / `maps.gstatic.com`.
- **Dark mode and fonts (`cms/theme.py`, `cms/templates.py`):** Settings & theme / builder Theme panel: colour mode
  light, dark or auto (`prefers-color-scheme`), an optional light/dark/auto switch on the site (remembered per visitor,
  applied before paint), dark colours worked out from the light ones so they pass AA (each can be overridden), and AA
  checks for both modes. Ten self-hosted fonts (`cms/static/fonts/`, SIL OFL, Latin subset WOFF2, built by
  `tools/fonts/build_fonts.py`) are copied into deployments that use them; no page requests Google Fonts.
- **Map widget (`cms/widgets/map.py`):** one or more places, Google Maps without a key (embed iframe) or OpenStreetMap;
  "Get directions" button; lazy-loaded. Optional per-site Google Maps API key and style at `/sites/<id>/widgets/map`
  (owners and admins; stored in `site_settings`, never in git). The key is a browser key, so restrict it in Google
  Cloud to the site's addresses (HTTP referrers) and to the Maps JavaScript + Geocoding APIs.
- **Form builder (`cms/widgets/contact_form.py`, `cms/forms.py`):** the "Form" block. Field types text, email, phone,
  long text, list, choose-one, tick boxes, date and file upload (pictures and/or documents, 1–10 MB, checked by their
  first bytes); drag to reorder; required, half/full width, help text; thank-you message or redirect (own page or
  https); per-form recipient email; optional consent box; presets Contact, Quote request, Appointment request,
  Newsletter. Sends are checked against a snapshot of the published form (`.tenshi-forms.json` in the deployment,
  never served), rate-limited and honeypotted like before, and land in Leads (list, detail page, CSV with formula
  cells neutralised). Uploaded files live in `DATA_DIR/form-uploads/<site id>/`, outside every web folder, and only
  signed-in CMS users can download them. The classic Form block still works (hidden from the Add block list).
- **Lead emails (`cms/mail.py`):** SMTP_HOST, SMTP_PORT (465 SSL / 587 STARTTLS), SMTP_USER, SMTP_PASS and optional
  CONTACT_FROM in `/etc/tenshi-cms.env` (`tools/server/cms-mail-setup.sh` copies them from the contact form's
  `/etc/tenshi-contact.env`). Without them nothing is sent and the Leads screen says email is off.
- **Per-site lead emails (`cms/notify.py`, Leads screen › Lead emails, owners and admins):** an on/off switch (off
  stops every lead email for the site, even a form's own recipient), up to 3 addresses for the classic contact forms
  and Form blocks without a recipient, and a cap of 1–60 emails per site per rolling hour (default 10). Leads over the
  cap are still saved; the next email says how many were held. Every send/hold is logged in the `lead_emails` table.
- **Custom domains (`cms/domains.py`, Settings › Address › Custom domains, owners and admins):** up to 5 per site
  (`site_domains` table); the CMS serves the site for those names. **`GET /__tls/ask?domain=`** is Caddy's on-demand
  TLS question: 200 only for `<subdomain>.<SITES_DOMAIN>` of an existing site or a custom domain attached to an
  existing site, otherwise 404; only answered for direct loopback requests (anything through Caddy's proxy gets a
  plain 404). Switch Caddy over with `tools/server/tenshi-tls-ask.sh` (validate, backup, rollback, `--rollback`).
- **Store tokens:** only the PUBLIC Storefront token is accepted; anything shaped like a secret Shopify token
  (`shpat_`, `shpca_`, `shppa_`, `shpss_` …) is refused. Settings live in the `site_settings` table, never in git.
- **API docs:** `/api/docs`, `/redoc` and `/openapi.json` are off. For local development only: `TENSHI_API_DOCS=1`.

## Client module library (DB-36)

Modules are widgets (`cms/widgets/`) on the shared **module kit** (`widgets/modkit.py`: theme-token CSS, filter chips,
carousels, forms that post to the site's own `/__w/<widget>/<action>`). Infrastructure:

- **Endpoints (`cms/actions.py`):** `Widget.actions = {"name": handler}`; requests name their block (`_block`), and the
  handler gets that block's *published* settings (`.tenshi-blocks.json` in the deployment) or, in the CMS preview,
  the current ones. POSTs share the contact forms' rate limits and honeypot.
- **Keys (`site_settings`):** settings fields marked `{"secret": True}` are masked (`••••••` + last 4) in every
  response and kept when the mask is saved back. Owners and admins only. Generic settings page
  `/sites/<id>/widgets/<name>`; all of them on **Modules & inbox** (`/sites/<id>/modules`).
- **Outside data (`cms/modcache.py`):** fetched by the server only, cached in `widget_cache`; keys never reach pages.
- **Extra pages and files:** `Widget.extra_pages` / `extra_files` (event pages, `.ics` calendars) are built with the
  site and previewable at `/sites/<id>/preview/<name>`.
- **CSP:** YouTube/Vimeo/Maps frames are no longer in the base policy; a page allows only the frame hosts of its own
  iframes (`widgets.frame_sources`) and of its blocks (`block_csp`).

**Galleries:** `gallery` (replaces the template block, same settings: one album, several albums with album filters,
or Media Center pictures by tag; masonry, grid or carousel; accessible lightbox `widgets/lightbox.py`),
`video_gallery` (YouTube via youtube-nocookie, Vimeo with dnt=1; nothing loads before play), `before_after`
(replaces the template block: horizontal/vertical, start position, labels, several pairs, keyboard and screen-reader
friendly range control).

**Calendars and booking:** each site has a **time zone** (Settings › Address; `cms/sitetime.py`, default
`TENSHI_TIMEZONE` or America/Chicago).
- `events`: list / month / week views, past events hidden or shown, a page per event (`event-<title>-<date>.html`,
  JSON-LD Event) and calendar files (`events.ics`, `event-….ics`). RSVPs with places, guests per RSVP and an optional
  waitlist; saved in `rsvps` and as leads, rate-limited, honeypot, confirmation via `mail.simple` (nothing sent when mail
  is off). Inbox: **Modules & inbox › RSVPs** (moving someone to "going" can't overbook).
- `hours`: week, holidays and special days (they override the week), overnight spans, an "Open now · closes 5 pm" badge
  worked out in the browser in the *site's* time zone, openingHoursSpecification JSON-LD.
- `appointments`: services (length, buffer after, price), staff (their services, days, hours), start-time step, buffer
  before, minimum notice, days ahead, closed dates, optional "I confirm each booking". Free times are computed on the
  server; booking re-checks under a lock, so a time can't be taken twice. Saved in `bookings` and as a lead; inbox
  **Bookings**. Deposits: a greyed-out placeholder setting (always off).
- Inbox kinds (`cms/inbox.py`) list what visitors send at `/sites/<id>/inbox/<kind>` with a status per row.

**Testimonials and trust:**
- `testimonials` (replaces the template block; old blocks keep their heading): carousel, wall, or one featured quote
  with the rest below; stars and an average. Sources: Business data, quotes typed in the block, approved reviews, and
  Google reviews. Google needs the site's own **Places API (New) key + place ID** (block settings, owners/admins
  only, the key masked); fetched by the server, cached 12 h, last good copy kept; no key means nothing is fetched or
  shown (the builder shows a hint). The live site adds newly approved reviews without republishing
  (`GET __w/testimonials/reviews`, approved only, no emails).
- `review_form`: stars, review, name, role, optional email, permission box; honeypot and rate limits. Reviews wait in
  **Modules & inbox › Reviews**; only owners and CMS admins can approve (`manage_only`), and nothing shows until then.
- `trust_badges`: built-in inline-SVG icons (secure, guarantee, licensed, insured, award …) or your own logos; row,
  cards or a greyscale logo strip.
- `case_studies`: cards or alternating rows, tag filters, up to 4 metrics (`value | label`), the full story
  (challenge / what we did / results / quote) opening in place.

**Social:** no third-party scripts anywhere.
- `social_feed`: the latest Instagram, X, YouTube or Bluesky posts, fetched by the server with the site's own accounts
  and keys (Modules & inbox › Social feed, owners/admins, keys masked), cached 1 h, last good copy kept. Without an
  account/key for the chosen network the block is **not drawn on the published site**, and the builder shows a
  hint. The network's image host is added to `img-src` only on pages with a connected feed. Live pages refresh from
  `GET __w/social_feed/items`. (X's API needs a paid X plan; Bluesky needs only a handle.)
- `share_buttons` (X, Facebook, LinkedIn, WhatsApp, Bluesky, Reddit, email, copy link) and `click_to_tweet`
  ("Click to post"): plain links to each network's share page; on the live site the visitor's real address
  (custom domains) is swapped in.
- `link_in_bio`: picture, name, line, big buttons, social profiles; "Just this block" hides the header and footer.
- `autopost` (Modules & inbox › Auto-post on publish, off by default): after a deployment, each blog post that went
  live in the last 14 days becomes a **pending** item in **Social posts**. Nothing posts until an owner or admin
  approves it (confirmed in a dialog); only then is it POSTed to the site's webhook (e.g. Postiz), JSON signed with
  `X-Tenshi-Signature: sha256=<HMAC>` if a secret is set; it becomes "sent" or "failed". Without a webhook,
  "approved" only marks it for posting by hand. Hooks: `widgets.ON_PUBLISH` (never breaks a deployment).
- Business data social links are filtered to http(s) addresses before they reach any template.

**Extras:**
- `popup`: an offer or the newsletter sign-up in a `<dialog>`; opens after N seconds, at N% scrolled or on exit
  intent (desktop); frequency once per visit / every N days / once, kept in `localStorage` (no cookies); "Version"
  shows a changed popup to everyone again. Shown in place, with a note, while editing.
- `newsletter`: sign-ups go to **Mailchimp** (key + audience ID; double opt-in on by default) or **Resend** (key +
  audience) with the client's own keys (Modules & inbox › Newsletter sign-up, owners/admins, masked). With no key,
  or if the provider fails, the sign-up is saved as a **lead** (Form "Newsletter") and the usual lead email goes out.
  Optional first name and consent checkbox. Only ever at the visitor's request.
- `news`: the latest blog posts (optionally one tag) as headlines, a one-line strip or small cards, with the
  "All news" and RSS (`feed.xml`) links. Reuses `cms/posts.py`.
- `price_list`: food menu or price list; sections of lines `Name | price | description | labels` (v, vg, gf, df,
  spicy, new, popular…), jump links, dotted leaders, a labels key, small print, schema.org `Menu` for food.
- `team` (replaces the template block): Business data › Team plus more people, with departments, filter chips,
  search, email/phone and profile links (http(s) only).
- `jobs`: openings with type, place/remote, pay, details, Apply by email or link, type filters, schema.org
  `JobPosting`; an opening past its "Closes" date disappears on the next build.
- `locations`: all locations on one map (reuses the Map block and its settings, `show_list: false`), cards with
  address, phone, hours, directions and "Show on map". Empty = Business data. CSP: only that map's frame host.
- **Analytics card** (site Overview): 30-day page views vs the 30 days before, daily bars, busiest day, top pages
  and submissions (leads, RSVPs, bookings, reviews). Counted on the server from live page requests (`visits`):
  no cookies, no outside trackers.
- **AI writing assist** (`cms/ai_assist.py`, Modules & inbox › AI writing assist): "✨ Help me write" under the
  builder's text boxes (improve, shorter, longer, friendlier, more professional, fix spelling, write from notes).
  Hidden unless the site has a key or the server sets `TENSHI_AI_KEY` (optional `TENSHI_AI_BASE_URL`,
  `TENSHI_AI_MODEL`; any OpenAI-compatible chat API, https only). The server calls the API (the key never reaches
  the browser), the suggestion is only shown until the editor clicks "Use this", and each person gets 40 requests
  per site per hour (`POST /api/sites/{id}/ai/write`).

## Demo sites and "Try the CMS" (DB-39)

- **Nine public demo sites**, fictional Madison, WI organisations at `demo-<type>.<SITES_DOMAIN>`: five businesses
  (`cms/demo_sites.py`: demo-cafe, demo-salon, demo-contractor, demo-retail, demo-law) and four faith communities
  (`cms/demo_faith.py`: demo-church, demo-mosque, demo-temple, demo-mandir, from Content Bot's faith copy in
  `cms/demo_content/faith/`, used for these demos only; times with an open-now badge, events + RSVP, talks as placeholder
  video + audio, newsletter, volunteer sign-up, a not-live donations page, gallery, map). Placeholders the congregation
  must supply (mosque prayer times, the temple's tradition, the mandir's deity) stay visible, highlighted (`.demo-ph`).
  Faith pictures are AI-generated buildings, landscapes, food and festival lamps: no worship scenes or sacred figures,
  and no human or animal figures on the mosque site. A retired demo (e.g. demo-nonprofit) is deleted on start-up.
  Each has its own template, theme
  (preset + accent + fonts, light or dark, visitor dark-mode switch), 5+ pages, Content Bot's starter copy
  (`cms/demo_content/`, placeholders filled in) and clear-origin stock photos only (CC0, public domain or AI, read from
  `cms/stock_seed/`). Every page has the "Demo site by Tenshi Systems" ribbon and `noindex`.
- They're built on start-up when missing (background thread; `TENSHI_DEMO_SITES=0` turns it off), and **rebuilt every
  night at 3 AM** (Madison time) inside the app, plus admins' **Reset demo sites** button (All sites). No cron.
- On demo sites nothing leaves the server: no email (`mail.simple`, `notify.lead_received`), no auto-post, newsletter
  sign-ups always go to Leads, no AI assist. Sample reviews say "Sample review"; the donate page says it isn't live.
- **Try the CMS:** `GET /demo/start` signs the visitor in (no password, 2 hours, 6 per IP per hour) as the shared
  `demo` user and opens the builder of **demo-sandbox** (a copy of demo-cafe). `cms/sandbox.py` checks every request:
  an allow-list of content routes, and every id in the address must belong to the sandbox. No Users, other sites,
  Settings, module/store settings (keys), export, domains, stock uploads or AI. Writes, uploads (6 MB) and publishes are
  rate-limited. Publishing works, but the sandbox is never served publicly (its address shows a note), and its uploads
  need a session. The demo user can't sign in with a password.

## WordPress / Joomla / Drupal-style features (2026-11-28)

- **Visual editor** (`static/builder.js`, `static/bridge.js`): edit on the page itself. Each block has a bar on the page
  (drag, up, down, copy, delete); formatted text gets a formatting bar (bold, italic, underline, H2/H3, lists, quote,
  links; pasting keeps only the words); drag blocks from the list, photos from the **Photos** tab, or photos from the
  computer onto the page (a line shows where they land; dropping on a picture replaces it); click a picture to choose
  another; undo and redo (Ctrl+Z / Ctrl+Shift+Z). Inline edits may use dotted field paths (`areas.1.heading`).
- **Columns** block (`widgets/columns.py`): 1-4 content areas side by side (picture, heading, formatted text, button).
- **Trash** (`trash.py`, Trash screen): deleted pages, posts, files and content entries are kept 30 days; Restore.
- **Redirects** (`redirects.py`): old address → page, path or URL (301/302, `/blog/*` wildcards), applied in
  `serve_site` before the file lookup; a page whose address changes gets one automatically; "Not found" list (robots
  probing for WordPress files left out). The WordPress import adds one per old post/page address.
- **Two-step sign-in and passwords** (`account.py`, My account): TOTP codes (RFC 6238) + 8 one-use backup codes; QR code
  when `segno` is installed; `/login/code` is the second step; `/forgot` emails a one-use link valid an hour (needs the
  SMTP settings); admins can reset someone's two-step sign-in on Users.
- **Roles and access** (`members.py`, `access.py`): site roles owner, editor, **author** (own posts, publish, Media
  Center), **contributor** (own posts, "Ready for review"; an editor publishes). A middleware checks every CMS request:
  people who belong to sites only open those sites; editors who belong to no site keep the old all-sites access.
- **Custom content types** (`content_types.py`, `widgets/collection.py`, Content types screen): your own types with
  fields (text, long text, formatted text, number, price, date, picture, link, email, one of a list, yes/no), entries,
  the **Collection** block (cards, list or table, filter chips, search) and a page per entry (`<type>-<entry>.html`).
- **WordPress import** (`wp_import.py`, Import screen): a WXR export → posts, pages, tags, redirects, and (background)
  featured pictures downloaded as covers, only from public internet addresses.
- **Site search** (`widgets/search.py`): `search.json` in deployments that have a Search block; searched in the browser.
- **Comments** (`widgets/comments.py`): switched on under Blog posts; moderated in Modules & inbox › Comments; approved
  comments appear live without publishing.
- **Languages** (`languages.py`, Languages screen, builder Page settings › Translations): extra languages per site;
  translated pages `es-<page>.html` (home: `es.html`), per-language menus, a switcher, `<html lang>` and hreflang.
- **Publish on time** (`scheduler.py`): scheduled posts and pages ("Go live at" in Page settings) go live by themselves;
  a background thread checks every minute (`TENSHI_SCHEDULER=0` turns it off; the tests do).
- New tables and columns are created by `db.setup()` (`SCHEMA_EXTRA`, `COLUMNS`), so existing databases upgrade on start.
- Tests: `tests/test_editor.py`, `tests/test_cms_features.py`; CI: `.github/workflows/cms-tests.yml` on every push that
  touches `platform/`; browser screenshots: `.github/workflows/cms-screens.yml` (`tools/cms_screens.py`).

## Premium designs (2026-11-28)

`platform/designs/aurora`, `meridian`, `maison` (and since the same day `nova`, `harbor`, `summit`, `bloom`, `atlas`, `verde`): original designs in the spirit of leading WordPress themes (Aurora: Astra
and Kadence; Meridian: Divi and Avada; Maison: Blocksy and Kadence's boutique sites; Nova: Salient and Jupiter; Harbor: OceanWP and Neve; Summit: GeneratePress and
Twenty Twenty-Four; Bloom: Hestia and Sydney; Atlas: Enfold and The7; Verde: Flatsome and Botiga's organic shops). Each is the starter design plus its
own `layout.html.j2`, `blocks/hero.html.j2` and a skin at the end of `style.css`; same block settings, so sites can switch
freely. `design.json` describes each; `templates.seed_premium()` adds any design not yet in the gallery at start-up,
first in the list and marked Premium. Sample sites for screenshots: `tools/premium_demo.py`; tests: `tests/test_designs.py`.
