# Tenshi Systems Engineering

Corporate website for Tenshi Systems Engineering, Osaka, Japan, in ten languages: English, Japanese, Korean, Chinese (Simplified), Spanish, German, Polish, Nigerian Pidgin, Arabic and Farsi. Arabic and Farsi switch the layout to right to left.
A plain static site for GitHub Pages.

- `index.html` – the homepage (its header and footer, including the Home / About / Services / Contact menu, are copied to every other page)
- `about.html`, `services.html`, `contact.html` and `services/*.html` – generated pages, see below
- `styles.css` – all styling
- `translations.js` – every piece of text in all ten languages (en, ja, ko, de, es, zh, ar, pl, pcm, fa). Edit wording here,
  in every language; every language must have the same keys. Tanaka's own chat wording is in chat.js (UI and FUN).
- `app.js` – language picker (flags), skyline slideshow, red band animation, service card carousel, consultation form.
  The form's email address is `CONTACT_EMAIL` at the top.
- `rain.js` – the falling Japanese characters behind the service cards
- `chat.js`, `chat.css` – Tanaka Matsumoto, the AI chat assistant (bottom right on every page). He answers from the site's own
  text in all four languages; with `endpoint` set in chat.js he answers with Claude through the Cloudflare Worker in
  `tools/chat-worker/` (setup in its README; the API key is a Worker secret, never in the repository). "Talk to a person"
  opens the visitor's email app addressed to CONTACT_EMAIL.
- `img/photos/` – the five hero skyline photos (Osaka, Tokyo, Kyoto, Yokohama, Kobe) from Wikimedia Commons, 1920px;
  their credits are in the footer of index.html and must stay there
- `img/services/` – the nine service photos (Wikimedia Commons Unsplash imports and rawpixel, all CC0: no credit required)
- `img/chevrons.svg` – the red band's chevron pattern
- `img/team/` – placeholder team photos; `img/tech/` – technology logos from Simple Icons (CC0; the logos are their owners' trademarks)
- `fonts/lato/` – the Lato font (Google Fonts, SIL Open Font License), hosted with the site
- `fonts/roboto/` – the Roboto font for all headings (Google Fonts via Fontsource, SIL Open Font License), hosted with the site
- `logo.png` – the company logo (header, hero, footer and tab icon)
- `img/tanaka.svg` – Tanaka Matsumoto's illustrated portrait (an original drawing, not a photo of a real person)

## After changing things

- Service text, photos or the list of services: edit `translations.js` (and the SERVICES list at the top of
  `tools/build-pages.mjs` for photos or new services), then run `node tools/build-pages.mjs`.
  It rewrites the nine cards, the form's topic list and the current menu item in index.html, about.html, services.html,
  contact.html and every page in `services/`. Change the header or footer in index.html, then run it to copy them everywhere.
  Don't edit the generated parts by hand.
- After changing styles.css, translations.js, app.js or rain.js (or rebuilding), run `node tools/stamp-assets.mjs`
  so visitors get the new copy at once.

The consultation form opens the visitor's own email app with their message filled in (GitHub Pages has no server to send mail).
The site opens in Japanese; first-time visitors choose a language in a pop-up, and the choice is remembered.
Add `?lang=` and a code (en, ja, ko, de, es, zh, ar, pl, pcm, fa) to an address to open it in that language.
`tools/make-skylines.mjs` is the script that drew the earlier skyline, blueprint and machine drawings (no longer used).

## Editing the site without code: the Tenshi Editor

Open `admin.html` on the live site (https://jcali0351.github.io/tenshisystemsengineering/admin.html) and sign in with a
GitHub fine-grained key (only this repository, Contents: read and write; the sign-in page explains how to make one).

- **Pages**: the real page; click any text or picture to change it.
- **All text**: every piece of text, searchable and filterable by page, in all ten languages.
- **Images**: every picture; click one to replace it (resized and compressed in the browser).
- **Save** commits the changes to `main`. When English text changes, desktop Chrome's built-in translator fills in the
  other languages (Nigerian Pidgin, and any language Chrome can't do, gets the English to fix by hand). Text typed by
  hand in another language is kept.
- After a save, `.github/workflows/cms-rebuild.yml` runs `tools/build-pages.mjs` and `tools/stamp-assets.mjs` and commits
  the rebuilt pages. The site updates about a minute later.

Files: `admin.html`, `admin/admin.js`, `admin/admin.css`, and `admin/tr.js` (reads and edits `translations.js` one entry
at a time, keeping its layout; also usable from Node).

## Tailwind CSS

Tailwind CSS (v4, through the Tailwind CLI, no Vite) is available on every page next to the site's own styles.

- Setup: `src/tailwind.css` (brand colours such as `bg-tenshi-red`, `text-tenshi-ink`, and which files are scanned).
  It's built into `tailwind.css`, which every page links before `styles.css`.
- No Preflight reset, and Tailwind sits in CSS layers, so the site's own styles win where both set the same thing.
  Tailwind classes work fully on new content; to beat an older rule add `!` (e.g. `!mt-8`).
- The site's root font size is 18.4px, so Tailwind spacing and text sizes come out about 15% larger than Tailwind's docs show.
- First time on a computer: `npm install`. After changing pages or classes: `npm run build`
  (page builder, Tailwind and asset stamps), or `npm run css` for Tailwind alone. The rebuild Action runs the same
  build on GitHub after every push that touches pages, text, pictures or styles.

## Content bots: Tenshi Scraper (News), Tenshi Blog Writer (Blog) and the stock ticker

All three run on GitHub Actions, because a static site can't fetch other websites from the browser.

- **Tenshi Scraper** (`tools/news-scraper.mjs`, `.github/workflows/news-scraper.yml`): the "Run Tenshi Scraper" button
  in the Tenshi Editor's **Content bots** tab saves `data/scrape-request.json`, which starts the job. It reads public
  news feeds (Japan Today, The Japan Times, Google News searches; list at the top of the script) and keeps 10 stories
  for each category (Technology, Business, Stock Exchange, Weather, Sports, Health) in `data/news.json`. Each story keeps
  its headline, publisher, link and the publisher's own short teaser, shown as a credited quote.
- **Tenshi Blog Writer** (`tools/blog-writer.mjs`, `.github/workflows/blog-writer.yml`): the "Run Tenshi Blog Writer"
  button saves `data/blog-request.json`. It reads the week's tech news and has Claude write 1 to 5 new posts in its own
  words into `data/blog.json`, each listing and linking its sources and marked as written with AI help.
  Needs the repository secret `ANTHROPIC_API_KEY` (Settings › Secrets and variables › Actions). With the key, the
  Scraper also writes a one-line summary for each story. Models: `NEWS_AI_MODEL`, `BLOG_AI_MODEL` (optional env).
- **Feature images** (`tools/images.mjs`, `tools/add-images.mjs`): every story and post gets a free-to-use photo from
  Openverse (CC0, public domain, CC BY, CC BY-SA) or Wikimedia Commons, saved in `img/stories/` with its creator,
  license and source shown on the card. Searches name scenes and objects, never people. If no photo fits, the card
  uses a generated Tenshi cover from `img/covers/`. Unused photos are deleted on the next run.
- **Stock ticker** (`tools/ticker.mjs`, `.github/workflows/stock-ticker.yml`): every 30 minutes while the Tokyo market is
  open, delayed prices for the Nikkei 225, TOPIX, USD/JPY and well-known Tokyo stocks (Yahoo Finance, Stooq as a
  fallback) go into `data/ticker.json`; `app.js` shows them in the scrolling bar at the top of every page.

`tools/build-pages.mjs` builds news.html and blog.html from the two data files.

## Design tab: fonts, typography, colors and motion

The Tenshi Editor's **Design** tab sets the site's fonts (63 families stored in `fonts/`, catalog in `fonts/fonts.json`,
the same library as the Xal'Reth site), heading and body weights, sizes, line heights, letter spacing for each heading
level and for body text, colors, and every motion setting, with a live preview. Saving writes `site-theme.css`
(built by `admin/theme.js`; the settings ride along in its first line). Every page loads it last.

**Heading styles** (in the same tab) fine-tune each heading level on its own (Main titles H1, Section headings H2,
Card headings H3, Small headings H4–H6): font, weight, italic, line height, word spacing, letter case, small capitals,
alignment, text color, outline width and color, shadow and underline. Each control starts at "Site default" (it follows
the rest of the tab) and has its own Reset; "Reset this level" clears a level. The settings are `headingStyles` in the
theme JSON (`HS_LEVELS` / `HS_FIELDS` in admin/theme.js) and are written as raised-specificity rules near the end of
site-theme.css, so they win over the general heading settings; dark panels keep their white headings.

Motion (`design.js`, styles at the end of `design.css`): headings appear character by character (word by word in
Arabic and Farsi), text slides in from alternating sides, pictures fade and rise, cards rise one after another, and
every picture starts black and white and turns to full color as it comes into view. Each can be switched off or
re-timed in the Design tab. Visitors who ask their device for reduced motion get a still site.

## Slogan tab: the animated strip on the homepage

The Tenshi Editor's **Slogan** tab manages the strip under the homepage headline: which lines show and in what order
(add, remove, reorder), each line's words (English, translated on Save; "All languages" to write any language by hand),
how long each line stays, whether it shows in Japanese first and for how long, the pace of the words, and whether the
strip shows at all. The list and timing are in `data/slogan.json`; the words are translation keys in `translations.js`.
`tools/build-pages.mjs` writes the strip into index.html, and `app.js` animates it.
