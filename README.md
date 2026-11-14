# Tenshi Systems Engineering

Bilingual (English / 日本語) corporate website for Tenshi Systems Engineering, Osaka, Japan.
A plain static site for GitHub Pages: no build step.

- `index.html` – the page
- `styles.css` – all styling
- `translations.js` – every piece of text in English and Japanese (edit wording here)
- `app.js` – language switch, skyline slideshow, consultation form. The form's email address is `CONTACT_EMAIL` at the top.
- `img/photos/` – the five hero skyline photos (Osaka, Tokyo, Kyoto, Yokohama, Kobe) from Wikimedia Commons, 1920px; their credits are in the footer of index.html and must stay there
- `img/services/` – the three service-card photos (Wikimedia Commons, Unsplash imports, CC0: no credit required)
- `img/chevrons.svg` – the red band's chevron pattern
- `logo.png` – the company logo (header, hero, footer and tab icon)
- `tools/make-skylines.mjs` – the script that drew the earlier skyline, blueprint and machine drawings (no longer used on the page)

The consultation form opens the visitor's own email app with their message filled in (GitHub Pages has no server to send mail).
Add `?lang=ja` or `?lang=en` to the address to open the site in a given language.
- `tools/stamp-assets.mjs` – after changing styles.css, translations.js or app.js, run `node tools/stamp-assets.mjs` so visitors get the new copy at once
