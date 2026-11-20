# The Tenshi CMS: a friendly guide

This guide explains what the Tenshi CMS is, how to use it step by step, and how to test that everything works.
No coding knowledge needed.

---

## 1. What was built, in plain words

Think of Tenshi as **a factory for small-business websites**.

| Piece | What it is | Where it lives |
|---|---|---|
| **The public website** | tenshi.systems's own marketing site. It now has **Portfolio** and **Launch** in its menu, and the hero button "Deploy Your Future" opens the Launch page. | The main project folder (live on GitHub Pages) |
| **The Launch page** | A 3-step questionnaire where a business owner describes their business and presses **Deploy now**. | `launch.html` |
| **The Tenshi CMS** | The control centre. It creates, edits, publishes and exports many client websites. **This is the product.** | `platform/cms/` |
| **Client websites** | The finished websites the CMS makes, one per business, each at its own address. | Made by the CMS |

The big idea: **a business is described once** (name, phone, services, team, reviews…). A **template** is just the
look. Change the template and the website looks different, but none of the business details are lost.

---

## 2. Opening the CMS

### On this computer

1. Open **PowerShell** in the project folder (`Documents\GitHub\tenshisystemsengineering`).
2. Start the CMS:

   ```powershell
   platform\.venv\Scripts\python platform\run_cms.py
   ```

3. Open **http://localhost:8000** in your browser.
4. Sign in. The email is `admin@tenshi.test`; the password is in
   `platform\cms_data\dev-login.txt` (open it with Notepad). Change it under **Users** after signing in.

Leave the PowerShell window open: closing it stops the CMS.

> First time on a new computer? See "Installing from scratch" at the end.

### The temporary review link

A Cloudflare "quick tunnel" can give the CMS a public address (like `https://something.trycloudflare.com`) so
others can look at it. It only works **while this computer is on and the CMS is running**, and the address changes
each time the tunnel restarts. Client sites are reached at `<link>/s/<site-address>/`, for example
`<link>/s/ridgeline-builders/`.

---

## 3. A tour of the screen

The **dark menu on the left** has two parts:

- **Top (everything):** Dashboard, All sites, Templates, Users.
- **Website (one site at a time):** pick a site from the drop-down, and its own sections appear below it:
  Overview, Pages & builder, Business data, Media Center, Portfolio, Galleries, Leads, Deployments, Export,
  Settings & theme.

The **top bar** shows which site you're in, a link to its live address, and the main buttons for that screen.

---

## 4. Step-by-step: your first website

### Step 1: Create the site (about 10 seconds)

1. Click **Dashboard** → **+ New site** (or go to **Templates** and press **Deploy** on a design you like).
2. Type the business name, e.g. *Sakura Bakery*. The web address fills itself in (`sakura-bakery`).
3. Pick a template, add a phone and email if you have them, keep **Deploy it straight away** ticked.
4. Press **Create site**. You land on the site's **Overview**, and it's already live at
   **http://sakura-bakery.localhost:8000**.

### Step 2: Fill in the business details

1. Open **Business data**.
2. Fill in the description, tagline, opening hours, services (press **+ Add service** for each), team members,
   customer reviews, locations and social links.
3. Press **Save** (top right).

These details appear automatically wherever the design uses them: the services block, the team block, the
footer, the contact block, and so on. You type them **once**.

### Step 3: Upload photos (Media Center)

1. Open **Media Center**.
2. **Drag photos from your computer onto the page** (or press **Upload files**). You can drop many at once.
3. Click a photo to open its details on the right:
   - **Description (alt text):** describe what's in the picture. Blind visitors' screen readers read it aloud, and
     Google uses it. Photos without one show a small **ALT** badge.
   - **Title, caption, category, tags, folder.**
   - **Crop / resize:** drag the box, pick a shape (square, 4:3, 16:9…), rotate, or set a smaller width.
   - **Used on:** shows every page, gallery and project using this file.
4. To do something to many files at once, tick them (or Ctrl-click) and use the dark bar: move to a folder,
   add tags, set a category or delete.

Photos are automatically compressed and resized, so websites stay fast. Videos, PDFs, audio and SVG drawings
work too (SVGs are cleaned of anything unsafe).

### Step 4: Build pages visually (the page builder)

1. Open **Pages & builder**. Every site starts with Home, About, Services, Our Work and Contact.
   - Drag pages up and down to change the menu order. **Duplicate** copies a page. **+ New page** adds one.
2. Press **Edit visually** on a page. The builder has three columns:
   - **Left: the page's blocks.** Drag them to reorder, or use ↑ ↓, ⧉ (duplicate) and ✕ (delete).
     **+ Add block** shows every block type; click one to add it, or drag it into the list.
   - **Middle: the real page.** **Click any text and type** to change it. Click a block to select it.
     Desktop / Tablet / Phone buttons show how it looks on each.
   - **Right: settings** for the selected block (pictures, layout, buttons…). With nothing selected, it shows the
     page's title, address, menu setting and Google title/description.
3. Changes **save automatically** ("All changes saved" at the top).
4. Press **Publish** when you're happy.

The block types: **Hero** (big opening), **Text**, **Services**, **Gallery**, **Portfolio**, **Before & after**,
**Team**, **Testimonials**, **Call to action**, **Form**, **Contact details**, **Image**, **Video** (upload or
YouTube), **Custom HTML** (for advanced users) and **Spacer**.

### Step 5: Show your work (Portfolio and Galleries)

- **Portfolio:** press **+ New project**. Give it a title, category (e.g. *Kitchens*), summary, and pictures.
  Add both a **Before** and an **After** picture and the website shows a slider to compare them.
  Visitors can filter projects by category. Drag cards to reorder.
- **Galleries:** press **+ New album**, then **+ Add pictures** from the Media Center. Choose masonry, grid or
  carousel. Add captions. Put the album on a page with a **Gallery** block. Visitors can click any picture to see it
  full screen.

### Step 6: Choose the look (Settings & theme)

Change the **template**, the **colours**, the **fonts**, the **shape** (clean, bold or elegant), the site
language, or the web address. Press **Save**. Business details and pages stay exactly as they are.

### Step 7: Publish (Deployments)

- **Deploy now** publishes everything. It takes about a second. The live site updates at its address.
- **History** lists every deployment. **Make live** on an older one rolls the website back to it.
- **Pause site** takes it offline; **Go live again** brings it back.
- **Health** is a checklist with a score (missing descriptions, empty pages, changes not yet live…), each with a
  **Fix** link.
- **Clone website** copies the whole site (pages, photos, galleries, portfolio, theme) under a new name.
- **Back up now** saves everything. **Restore** puts a backup back (the current version is backed up first, so
  nothing is lost).

### Step 8: Messages from customers (Leads)

When a visitor fills in a **Form** block on the website, the message appears under **Leads** (and on the
Dashboard). Mark each one *new*, *contacted*, *won* or *lost*, or press **Download CSV** to open them in Excel.

### Step 9: Take everything away (Export)

**Export** makes one ZIP file containing any of:
- **Website:** the finished site, which runs on any web host with nothing from Tenshi behind it
- **Media:** every original file, plus a list of their descriptions and tags
- **Database:** all the site's content as JSON and as a SQLite database file
- **Theme:** the template's source code
- **Configuration:** the business profile and settings

The customer owns everything. No lock-in.

---

## 5. For admins

- **Users:** add people as **admin** (everything) or **editor** (content, media, pages, portfolio and galleries; editors
  can't delete sites, export, clone, manage users or edit template code). Use **New password** to reset one.
- **Templates:** the Template Gallery.
  - **Preview** shows a template with sample content. **Deploy** makes a new site from it in one click.
  - **Clone** copies a template to customise. **+ New template** starts from the basic starter design.
  - **Edit** opens the template's source files (HTML, CSS). A typo is caught before saving, so it can't break a site.
    **Save as version** keeps a copy; **Restore** puts an older version back.
  - Any new field a template uses (e.g. `{{ company.hours }}`) automatically appears in every site's
    **Business data** form.

---

## 6. How to test it

### The quick automatic test

From the project folder:

```powershell
platform\.venv\Scripts\python platform\tests\test_cms.py
```

It should end with **All CMS checks passed.** It walks through everything (setup, sign-in, every screen, uploads,
the builder, deploying, the live site, a lead, backup and restore, clone, rollback, export, templates, users and
permissions) in a throw-away data folder, so your real sites are never touched.

### A 15-minute hands-on checklist

Tick each one as you go.

1. ☐ Sign in. The **Dashboard** shows sites, deployments, leads, visits and storage.
2. ☐ **+ New site** → create a test business. It opens at `http://<address>.localhost:8000`.
3. ☐ **Business data:** add two services and a review → **Save**.
4. ☐ **Media Center:** drag in three photos at once. Give one a description. Crop another to a square.
5. ☐ **Pages & builder → Home → Edit visually:** click the headline in the preview and type a new one.
   "All changes saved" appears.
6. ☐ Add a **Before & after** block, choose two pictures with **Choose**. The slider appears in the preview.
7. ☐ Drag a block to a new position. Switch to **Phone** view.
8. ☐ **Galleries:** make an album, add the photos. Put it on the *Our Work* page with a **Gallery** block.
9. ☐ **Portfolio:** add a project with a category.
10. ☐ Press **Publish**. Open the live site: the new headline, services, gallery (click a photo → full screen) and
    portfolio filters all work.
11. ☐ On the live site's **Contact** page, send the form. The message appears under **Leads**.
12. ☐ **Settings & theme:** change the colours or the template → **Save** → **Deploy**. The look changes, the
    content stays.
13. ☐ **Deployments → History → Make live** on the first deployment: the site goes back. Then deploy again.
14. ☐ **Back up now**, then **Restore** it.
15. ☐ **Export** → download the ZIP. Open `website/index.html` from it: the site works straight from your computer.
16. ☐ **Users:** add an editor, sign in as them in a private window, and check they can't open Users or Export.

If something doesn't work, note the screen, what you clicked and what happened, and send it over.

### The sample site

`platform\run_cms.py --demo` (once) adds **Ridgeline Builders**, a sample contractor site with generated pictures,
a gallery, projects (one with before/after), services, team and reviews: handy for exploring. Delete it any time
under **Settings & theme → Delete site**.

---

## 7. Good to know

- **Everything the CMS stores is in `platform\cms_data\`** (the database, media, deployments, backups, exports).
  It isn't saved to GitHub. Back up that folder to keep your sites. Deleting it starts completely fresh.
- **Client addresses:** on this computer they're `<address>.localhost:8000`. On a real server they become
  `<address>.tenshi.systems`.
- **Not built yet:** the AI assistant (writing descriptions, alt text and SEO suggestions), custom domains
  (www.example.com), invoices and the sales pipeline, and running on a permanent public server.

### Installing from scratch (a new computer)

You need Python 3.12 (from python.org). Then, in the project folder:

```powershell
py -m venv platform\.venv
platform\.venv\Scripts\python -m pip install -r platform\requirements.txt
platform\.venv\Scripts\python platform\run_cms.py --demo
```

Open http://localhost:8000 and create the admin account on the welcome screen.

### Where the code is (for whoever changes it)

| What | File |
|---|---|
| Every screen and the API | `platform/cms/app.py` (screens in `platform/cms/ui/`) |
| Create, deploy, clone, backup, export | `platform/cms/sites.py` |
| Photo handling | `platform/cms/media.py` |
| The page builder | `platform/cms/static/builder.js` and `platform/cms/blocks.py` |
| How client websites look | `platform/designs/starter/` |
| The overall plan | `docs/ARCHITECTURE.md` |

Every file starts with a plain-English explanation of what it does.
