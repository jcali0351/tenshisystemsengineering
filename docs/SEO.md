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
