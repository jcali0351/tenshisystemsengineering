# SEO and social previews

- **Where it's edited:** Tenshi Editor (`admin.html`) > **SEO** tab. It saves `data/seo.json`.
- **How it's used:** `tools/seo.mjs` reads `data/seo.json` when `tools/build-pages.mjs` runs (the editor's rebuild
  Action, `.github/workflows/cms-rebuild.yml`, does this after every save). Per page: `title`, `desc`, `ogImage`,
  `canonical`, `noindex`. Empty fields fall back to the defaults written in `tools/seo.mjs`.
- **Cards:** every page has `twitter:card = summary_large_image`, `og:image`, `twitter:image` and `og:image:alt`.

## Site-wide social picture (Open Graph default)

- Path: **`img/og/default-1200x630.jpg`** (1200 x 630, JPG; set in `data/seo.json` > `defaults.ogImage`).
- **The current file is a PLACEHOLDER** (logo, name and tagline on the neon background) until Img Bot supplies the
  final art. `defaults.ogImagePlaceholder: true` makes the editor show a "Placeholder" notice.
- To swap it: replace the file with the same name and size (Images tab or a commit), or upload a new picture and enter
  its path in the SEO tab's "Site-wide social preview picture"; then untick "still a placeholder".
- JPG or PNG, not WebP: LinkedIn and some messengers don't show WebP link previews.

## Sitemap and robots.txt

- **`sitemap.xml`** is generated at the end of `tools/build-pages.mjs` from the public HTML that was just written. Each URL is an absolute `https://tenshisystems.com/...` address. `lastmod` is the file's latest git commit date (`git log --format=%cs`). Pages marked `noindex` in `data/seo.json` or in a robots meta tag, plus redirects, admin, portal, drafts and tools, are left out. Main photographs are listed as `image:image` entries (`loc` + `title`). Adding a public page and rebuilding updates the sitemap automatically.
- There are **no hreflang tags**. The site is client-side i18n: one URL per page, and the visitor picks a language in the menu. There are no separate language addresses to advertise.
- **`robots.txt`** allows all crawlers, points them at the sitemap, and disallows `/admin.html`, `/admin/`, `/portal.html`, `/client-portal.html`, `/classic.html`, `/arcade-embed.html`, `/tools/`, `/platform/`, `/data/`, `/sandbox/` and `/*.mjs$`. The IndexNow key file at the site root (a 32-character hex `.txt`) stays allowed.
