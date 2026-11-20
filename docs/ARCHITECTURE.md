# Tenshi Systems: platform architecture

*The business launch platform. Version 1 of this plan, November 2026.*

Tenshi (天使) means angel. The platform exists to take the technical weight off small businesses: a business owner
describes their business, picks a look, presses **Deploy**, and gets a working website with hosting, a content
manager, lead forms and analytics at `theirname.tenshisystems.com`. They can export all of it and leave at any time.

Every decision below is tested against one question: **does this help a small business succeed?**

What exists today, in this repository:

| Piece | Where | State |
|---|---|---|
| Menu with Portfolio and Launch | `index.html` header, copied to every page by `tools/build-pages.mjs` | Live |
| "Launch Your Business" hero button | `index.html` | Live |
| The Launch Sequence (welcome, 3 steps, deploy) | `launch.html` (built), `launch.js`, `launch.css` | Live. Without a server it prepares a launch request the visitor emails to the team |
| The Design Gallery (16 designs, filters, preview) | `portfolio.html` (built), `portfolio.js`, `portfolio.css` | Live |
| One list of designs for everything | `data/templates.json` | Live |
| Business profile schema | `platform/schema/business.schema.json` | Prototype |
| Blueprints, template scanner, auto CMS forms, builder, ZIP export | `platform/tenshi/` (Python + Jinja2) | Working prototype, see `platform/README.md` |
| **The Tenshi CMS** (dashboard, sites, page builder, Media Center, portfolio, galleries, templates with versions, deployments with rollback, backups, clone, leads, export, users) | `platform/cms/` (FastAPI + SQLite + Jinja2) | Working, runs on one computer or server; see `platform/README.md` |

**How the CMS maps onto this plan.** It already follows the architecture below on a small scale: one database
(SQLite instead of PostgreSQL), sites served by host name (`<address>.localhost`, later `*.tenshisystems.com`),
deployments as static builds kept for rollback, and media stored per site (a folder instead of object storage).
Moving to production means swapping those three pieces (`cms/db.py`, the build folder, the media folder) for
PostgreSQL, object storage and the CDN edge, without changing the screens or the templates.
AI assistance (descriptions, alt text, SEO suggestions), custom domains, invoices and the CRM pipeline are next.

The rest of this document is the plan for the full platform.

---

## 1. System architecture

The core idea: **the business is the data; the website is just one way of showing it.**

```
          ┌──────────────────────────┐
 Visitor ─▶  tenshisystems.com           │  Marketing site + Launch Sequence (static, this repo)
          └────────────┬─────────────┘
                       │ POST /deployments  (the business profile, JSON)
          ┌────────────▼─────────────┐       ┌───────────────────┐
          │  Tenshi API  (FastAPI)    │──────▶│  PostgreSQL        │  accounts, sites, profiles,
          │  auth · profiles · media  │       │  (one database,    │  pages, media, leads, CRM …
          │  forms · CRM · deploys    │       │  row-level security)│
          └──┬──────────────┬────────┘       └───────────────────┘
             │ jobs          │ uploads
   ┌─────────▼─────┐   ┌────▼──────────────┐
   │ Build workers │   │ Object storage     │  media originals + resized copies,
   │ (Python,      │──▶│ (S3 / Cloudflare R2)│  and every site's built HTML
   │  Jinja2)      │   └────┬──────────────┘
   └───────────────┘        │
                     ┌──────▼───────────────────────────┐
  Site visitor ─────▶│ Edge (CDN + a small router)       │  *.tenshisystems.com and custom domains:
                     │ reads the Host, serves that site  │  looks up the site, serves its files
                     └──────────────────────────────────┘
          ┌──────────────────────────┐
 Owner ──▶│  Control Center  /admin   │  the CMS (a web app that talks to the API)
          └──────────────────────────┘
```

**The six building blocks**

1. **Business Data Engine.** One JSON business profile per business (`company`, `services`, `products`, `staff`,
   `gallery`, `portfolio`, `testimonials`, `social`, `seo`), stored in PostgreSQL as `jsonb` with a version history.
2. **Design (template) engine.** A design is a folder of Jinja2 templates plus a blueprint. Designs never hold
   business data. Switching design = rendering the same profile through different templates.
3. **Build workers.** Turn profile + design into static HTML, CSS and images, and upload them to object storage.
   Static output is fast, cheap to host, secure (nothing to hack at request time) and easy to export.
4. **Edge router.** One wildcard route for all sites. It looks at the requested host name, finds the site's current
   build, and serves its files from storage through the CDN.
5. **API.** Everything the Control Center and the Launch Sequence do goes through one API: accounts, profiles,
   media, forms (leads), CRM, invoices, deployments, export.
6. **Control Center (CMS).** A web app at `<site>/admin` for the owner and their staff.

**Why static sites plus an API (and not one WordPress per customer):** a WordPress-style install per customer means a
server, a database and security updates per customer: slow to create, costly at a million sites, and a constant
security burden. Here a "site" is a few database rows plus a folder of files, created in milliseconds. The
dynamic parts a small business really needs (forms, bookings, search) are small API calls from the page.

---

## 2. Database design

PostgreSQL 16. Every table that holds customer data has an `account_id`, and **row-level security** makes the
database itself refuse to show one account's rows to another, even if the application has a bug.

```
accounts            id, name, plan, created_at                       ← a business (the customer)
users               id, email, name, password_hash | sso, created_at
memberships         account_id, user_id, role                        ← owner, admin, editor, author, viewer
sites               id, account_id, subdomain (unique), custom_domain, template_id,
                    status (draft|building|live|paused), current_build_id, created_at
business_profiles   site_id, version, data jsonb, created_by, created_at   ← the Business Data Engine
                    (newest version = current; old versions = undo history)

templates           id, name, group, version, colors jsonb, style, preview_url   ← data/templates.json
blueprints          template_id, version, data jsonb                  ← platform/blueprints/*.json

pages               id, site_id, slug, title, blocks jsonb, seo jsonb, status, published_at
posts               id, site_id, slug, title, body, author_id, status, published_at
categories / tags   id, site_id, name, slug     + post_categories, post_tags (links)
menus               id, site_id, location, items jsonb

media_folders       id, site_id, parent_id, name
media_assets        id, site_id, folder_id, kind (image|video|pdf|audio), filename, bytes,
                    width, height, duration, alt, caption, metadata jsonb, storage_key, created_at
media_variants      asset_id, label (thumb|640|1280|1920|webp|avif), storage_key, bytes

forms               id, site_id, name, fields jsonb, notify_emails
form_submissions    id, form_id, site_id, data jsonb, ip_hash, spam_score, created_at   ← leads

contacts            id, account_id, name, email, phone, source, tags, created_at        ← CRM
deals               id, account_id, contact_id, stage, value, next_follow_up
activities          id, account_id, contact_id, kind (call|email|note), body, created_at
quotes / invoices   id, account_id, contact_id, number, lines jsonb, total, status, due_at
payments            id, invoice_id, provider (stripe), provider_ref, amount, paid_at

deployments         id, site_id, profile_version, template_version, status, started_at,
                    finished_at, log, build_key                       ← every build, for rollback
domains             id, site_id, host, verified_at, tls_status
backups             id, site_id, storage_key, created_at
audit_log           id, account_id, user_id, action, target, details jsonb, created_at
```

Why `jsonb` for the profile: every design reads a different subset of the same shape, and new industries add
fields. `jsonb` lets the schema grow without migrations, while PostgreSQL can still index and query inside it
(e.g. "all sites in Osaka"). The JSON Schema in `platform/schema/` is checked on every save.

---

## 3. CMS architecture (the Control Center)

**Modules:** Dashboard · Pages · Posts · Media · Portfolio · Gallery · Forms & Leads · SEO · Analytics · Design
Gallery · Users · Settings · Export · Deployments · CRM · Invoices · AI Assistant · Help · Backups.

**How editing works**

* **Business details** (name, phone, services, team …) are edited in forms that are *generated from the design*
  (section 4). Change the phone number once and every page shows it.
* **Pages** are lists of blocks (`hero`, `text`, `gallery`, `services`, `form`, `testimonials` …) stored as JSON.
  The visual editor is a live preview of the real templates: click any text to edit it in place, drag blocks to
  reorder, pick colours and fonts from the design's allowed set. Advanced users can open the HTML/CSS of a block.
* **Every save** writes a new profile or page version, then queues a build of only the pages that changed.
  The preview updates in about a second; Publish switches the live site to the new build.
* **Roles:** owner (everything, billing, export), admin (everything but billing), editor (all content), author
  (own posts), viewer (read only).

**Dashboard (the command centre):** visits this week, new leads, site health (broken links, missing alt text, slow
images), storage used, last deployment, SEO checklist, a performance score from the last build, and update notes.

**Media Center:** drag-and-drop batch upload straight to storage (signed upload URLs), folders, a metadata editor,
and automatic processing on upload: resize to 640/1280/1920, WebP and AVIF copies, compression, optional watermark,
crop and resize tools, and AI-suggested alt text that the owner approves. Videos get a poster frame and are served
by the CDN; PDFs and audio are stored as they are.

**Portfolio and galleries:** a gallery is a media folder plus a layout (grid, masonry, before/after slider, lightbox,
filters by category or tag). "New gallery" asks for a name and a folder of photos and is done in under a minute.

---

## 4. Template engine architecture

Designs are written in **Jinja2** (Python), the modern version of the old PHP `$company_name` style:

```jinja
<h1>{{ company.name }}</h1>
<a href="tel:{{ company.phone | tel }}">{{ company.phone }}</a>
{% for service in services %}
  <h3>{{ service.name }}</h3>
  <p>{{ service.description }}</p>
{% endfor %}
```

**A design is a folder:** `platform/templates/<id>/` with `base.html.j2` (shared frame), one `.j2` file per page, and
its CSS and images. Its colours and name live in `data/templates.json`, shared with the website's Design Gallery.

**Automatic CMS generation** (`platform/tenshi/scanner.py`, working now). Jinja2 can turn a template into a syntax
tree. The scanner walks that tree and writes down every variable path it finds. Inside a `for` loop it remembers that
`service` means "one item of `services`", so `{{ service.name }}` becomes `services[].name`. Running it on the
Contractor design gives:

```
company.name  company.phone  company.email  company.description  company.logo.src  company.service_areas …
services[].name  services[].description  services[].price  services[].image.src …
testimonials[].quote  testimonials[].author  testimonials[].rating  gallery[].src  gallery[].alt  social …
```

`forms.py` turns that list into form sections: `company.*` becomes a "Your business" section, and `services[].*`
becomes a repeating "Services" section with an "Add another" button. Box types come from the names (`email` → email
box, `description` → large text box, `logo`/`src` → picture upload, `rating` → stars), and the blueprint can override
any label or help text. **Nobody writes a CMS form by hand**: a designer adds `{{ company.hours }}` to a template and
the box appears in the Control Center.

**Safety:** templates run in Jinja2's `SandboxedEnvironment` with autoescaping, so a design (or a customer editing
one) can't run Python code, and text like `<script>` in a business name is shown as text.

---

## 5. Blueprint system

Every design has a blueprint (`platform/blueprints/<id>.json`):

```json
{
  "template": "contractor",
  "industry": "Contractor",
  "required_fields": ["company.name", "company.phone", "company.email", "company.description", "services"],
  "pages": { "index.html": "index.html.j2", "services.html": "services.html.j2", "contact.html": "contact.html.j2" },
  "labels": { "services[].price": "Starting price (optional)" },
  "help":   { "services": "Add each job you want customers to find." },
  "onboarding": [ { "step": "Business", "fields": ["company.name", "company.category", "site.goal"] } ],
  "ai": { "company.description": "Write a warm, plain-English description of {company.name} …" }
}
```

What it drives:

* **Validation:** `missing_fields()` lists what still needs filling in before launch (`python -m tenshi check`).
* **Forms:** labels, help text and required marks for the generated CMS form.
* **Onboarding:** which questions the Launch Sequence asks, in which step, for this industry.
* **AI setup:** a prompt per field, so the assistant can draft a description or suggest services from what the owner
  already entered. The owner always reviews before anything is published.
* **Standardisation:** every design reads the same profile shape, so any design can be swapped for any other.

---

## 6. Client onboarding (the Launch Sequence)

Today, on `launch.html`:

1. **Welcome** (full screen): "Launch your business into the digital marketplace" → *Let's get started*.
2. **Step 1, Business:** name, category, website goal, business type.
3. **Step 2, Profile:** phone, email, address, service areas, description, logo (drag and drop), social links.
4. **Step 3, Launch preview:** the recommended design drawn with their name, the web address
   (`johnsons-plumbing-heating.tenshisystems.com`, editable), the included features, **Deploy now**.

The answers become a business profile in exactly the schema above (`buildProfile()` in `launch.js`). Answers are
kept in the visitor's own browser until they finish, so a refresh loses nothing.

When the API exists, set `LAUNCH_ENDPOINT` in `launch.js`. Deploy now then POSTs the profile, the API answers with
`{ "admin_url": "https://<name>.tenshisystems.com/admin" }`, and the visitor lands in their Control Center. Until
then, Deploy now prepares the same profile as a launch request the visitor emails to the team (and can download as
JSON), and the done screen says so plainly: nothing claims a site exists before it does.

Later steps (after launch, inside the Control Center): services, photos, team, testimonials, each pre-filled by AI
suggestions the owner can accept or change.

---

## 7. Deployment architecture (Deploy now in under 30 seconds)

The trick is to **create nothing slow per customer.** No server, no database, no DNS record and no certificate is
created for a new site:

| Step | How | Time |
|---|---|---|
| Create account, user, site, profile rows | One database transaction | ~50 ms |
| Reserve the subdomain | `UNIQUE` constraint on `sites.subdomain` | included |
| "Create database" | Nothing to create: the shared database with row-level security | 0 |
| "Create storage" | A key prefix `sites/<site_id>/` in object storage | 0 |
| "Configure DNS" | One wildcard record `*.tenshisystems.com` made once, years ago | 0 |
| "Create SSL certificate" | One wildcard certificate for `*.tenshisystems.com`, renewed automatically | 0 |
| Build the site | Render ~5-10 pages with Jinja2 and upload them | 1-3 s |
| Process the logo | Resize and convert | ~1 s |
| Switch the site live | Set `sites.current_build_id`; the edge router now serves it | ~10 ms |
| Sign the owner in | Session cookie, redirect to `/admin` | instant |

**Total: about 3-5 seconds**, well under the 30-second target. The build runs on a job queue (Redis + RQ or Celery,
or PostgreSQL `SKIP LOCKED` queues to start with); the Launch screen shows the real steps as they finish.

**Custom domains** (`www.johnsonsplumbing.jp`): the owner adds a CNAME to `edge.tenshisystems.com`; the edge issues
a certificate on first visit (Cloudflare for SaaS custom hostnames, or Caddy's on-demand TLS) after checking the
domain is registered to a site.

**Rollback:** every build is kept (`deployments.build_key`), so "undo publish" just points the site back at the
previous build.

---

## 8. Export architecture (no lock-in)

`python -m tenshi export profile.json export.zip` works today and produces:

```
site/                  the finished website: open index.html, or upload the folder to any host
business-profile.json  all business data, in the open Tenshi format
design/                the design's Jinja2 templates, so the site can be rebuilt or changed
README.txt             what everything is, in plain words
```

The full platform adds: `media/` (originals, not just resized copies), `content/` (pages, posts, menus, categories,
tags as JSON), `forms/` and `leads.csv`, `crm/` (contacts, deals as CSV), and `database.sql` (a PostgreSQL dump of
just that account's rows). Exported forms fall back to `mailto:` because there is no server behind them; the
README explains how to plug in any form service. The renderer is open source, so the export can be rebuilt anywhere.

---

## 9. Scalability strategy (to a million businesses)

* **Static output on a CDN.** Visitor traffic never touches our servers or database. A million mostly-quiet small
  business sites cost little more than the storage they use.
* **Stateless API servers** behind a load balancer, scaled by CPU. Sessions in signed cookies or Redis.
* **One PostgreSQL** (with read replicas) easily holds millions of sites' rows; profiles are small. When it is no
  longer enough, split by `account_id` (Citus, or several databases with a lookup table). Row-level security works
  the same either way.
* **Build workers** scale with the queue length; builds are small and independent, so they spread perfectly.
* **Incremental builds:** a phone-number change rebuilds only pages that use `company.phone` (the scanner knows which).
* **Media processing** runs in its own worker pool so a batch of 200 photos never slows a deploy.
* **Analytics** go to a column store (ClickHouse, or a privacy-friendly hosted counter at first), never to PostgreSQL.
* **Costs to watch:** storage (media), egress (video: use a video CDN), AI calls (cache suggestions, cap per plan).

---

## 10. Recommended technology stack

| Layer | Choice | Why |
|---|---|---|
| Templates and builds | **Python 3.12, Jinja2** (sandboxed) | Readable, well known, the prototype already works |
| API | **FastAPI** + Pydantic | Python like the builder; typed; automatic API docs |
| Database | **PostgreSQL 16** (`jsonb`, row-level security) | One reliable database for everything |
| Jobs | Redis + RQ (later Celery or Temporal if needed) | Simple; good enough for a long time |
| Files | **Cloudflare R2** or S3 | Cheap storage; R2 has no egress fees |
| Edge | **Cloudflare** (CDN, Workers router, wildcard TLS, Cloudflare for SaaS) | One place for DNS, TLS and serving |
| Images | Pillow / libvips (pyvips) | Fast resizing and WebP/AVIF |
| Control Center | TypeScript + React (or Svelte), talking only to the API | Rich editing, drag and drop |
| Auth | Email + password (Argon2), magic links, optional Google sign-in; passkeys later | Easy for non-technical owners |
| Payments | Stripe (Checkout, Billing, invoices) | Handles cards and tax so we never touch card numbers |
| Email | Postmark or Amazon SES | Lead notifications, logins |
| AI | Claude API (latest Claude models), called only from the server | Content, SEO, alt text, layouts |
| Marketing site (this repo) | Plain HTML/CSS/JS + Node build scripts on GitHub Pages | Already in place |

---

## 11. Security considerations

* **Tenant isolation:** `account_id` on every row plus PostgreSQL row-level security; storage keys prefixed by site;
  every API call checks membership and role.
* **Templates:** Jinja2 sandbox, autoescape always on. Rich text from owners is cleaned (bleach/nh3) to a safe set
  of tags. Custom HTML/JS blocks are allowed only on the owner's own site and served from the site's own domain,
  never from the Control Center's domain.
* **Control Center** on its own origin with a strict Content-Security-Policy, `SameSite` cookies and CSRF tokens.
* **Uploads:** type checked by content (not by name), size limits, images re-encoded (which strips hidden metadata
  and payloads), SVGs cleaned, virus scan for PDFs and other documents.
* **Forms (leads):** rate limits, a honeypot field and a spam score; no CAPTCHA unless abuse appears.
* **Accounts:** Argon2 password hashing, optional two-factor, sign-in alerts, audit log of every change.
* **Secrets** (Stripe, AI and email keys) only in the server's secret store, never in code or in pages.
  The marketing site's Launch page holds no keys.
* **Backups:** nightly database backups with point-in-time recovery, versioned storage, and tested restores.
* **Privacy:** collect only what the business needs; clear data export and deletion for owners and their
  customers; follow Japan's APPI and the EU GDPR (Tenshi is in Osaka and serves clients abroad).
* **Abuse:** check new sites for phishing or impersonation before they get a custom domain; report and takedown flow.

---

## 12. Roadmaps

### MVP (first 3 months): "a real site in under a minute"
1. FastAPI service with accounts, sites, profiles, and the `/deployments` endpoint; set `LAUNCH_ENDPOINT` in launch.js.
2. Build worker using `platform/tenshi/builder.py`; wildcard domain and certificate; edge router on Cloudflare.
3. Five designs fully built as Jinja2 folders: Contractor (done in the prototype), Restaurant, Real Estate,
   Creative Portfolio, Tenshi Corporate. The other eleven stay in the gallery as "coming soon" or are built next.
4. Control Center v1: the generated business forms, Media Library with resizing, Forms & Leads with email alerts,
   Publish, Export ZIP.
5. Owner sign-in by email link; one plan; Stripe Checkout for paid plans.

### Growth (months 4-9): "the business operating system"
Visual page editor with blocks and drag and drop · posts, categories, tags · galleries and portfolio engine ·
custom domains · AI assistant (descriptions, services, alt text, SEO suggestions) · analytics dashboard ·
CRM (contacts, pipeline, follow-ups) · quotes and invoices with Stripe · newsletters · team roles · backups and
rollback in the UI · all 16 designs.

### Enterprise (year 2)
Agencies and franchises: one account managing many sites, white-label Control Center, shared design systems,
SSO (SAML/OIDC), audit exports, uptime SLA, data residency (Japan, EU, US regions), staging sites, approval
workflows, API access and webhooks, client portal (documents, messages, project tracking).

### Open source (from the start, growing)
* **Now:** publish the renderer (`platform/tenshi`), the business profile schema and the blueprint format under a
  permissive licence (MIT or Apache-2.0), with the Contractor design as the reference.
* **Next:** a design kit so anyone can contribute a design (folder + blueprint + entry in `templates.json`), with
  automated checks (scanner output, accessibility, page weight) on every pull request.
* **Then:** a self-hosting bundle (Docker Compose: API, worker, PostgreSQL, MinIO, Caddy) so a business or a local
  web designer can run the whole platform themselves. Tenshi's hosted service earns its keep by being the easiest
  place to run it, not by locking anyone in.
* Governance: public roadmap, contribution guide, code of conduct, and a "designs from the community" gallery.
