# Tenshi Systems Engineering

Corporate website for Tenshi Systems Engineering, Osaka, Japan, in English, Japanese, Korean and German.
A plain static site for GitHub Pages.

- `index.html` – the homepage
- `services/*.html` – a full page for each of the nine services (generated, see below)
- `styles.css` – all styling
- `translations.js` – every piece of text in English (en), Japanese (ja), Korean (ko) and German (de). Edit wording here,
  in all four languages; every language must have the same keys.
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
- `logo.png` – the company logo (header, hero, footer and tab icon)

## After changing things

- Service text, photos or the list of services: edit `translations.js` (and the SERVICES list at the top of
  `tools/build-services.mjs` for photos or new services), then run `node tools/build-services.mjs`.
  It rewrites the nine cards and the form's topic list in index.html and every page in `services/`.
  Don't edit the generated parts by hand.
- After changing styles.css, translations.js, app.js or rain.js (or rebuilding), run `node tools/stamp-assets.mjs`
  so visitors get the new copy at once.

The consultation form opens the visitor's own email app with their message filled in (GitHub Pages has no server to send mail).
Add `?lang=en`, `?lang=ja`, `?lang=ko` or `?lang=de` to an address to open it in that language.
`tools/make-skylines.mjs` is the script that drew the earlier skyline, blueprint and machine drawings (no longer used).
