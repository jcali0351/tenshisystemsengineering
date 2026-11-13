# Tenshi Systems Engineering

Bilingual (English / 日本語) corporate website for Tenshi Systems Engineering, Osaka, Japan.
A plain static site for GitHub Pages: no build step.

- `index.html` – the page
- `styles.css` – all styling
- `translations.js` – every piece of text in English and Japanese (edit wording here)
- `app.js` – language switch, skyline slideshow, consultation form. The form's email address is `CONTACT_EMAIL` at the top.
- `img/skylines/` – the five hero skylines (Osaka, Tokyo, Kyoto, Yokohama, Kobe), original SVG illustrations
- `img/blueprint.svg`, `img/chevrons.svg`, `img/mech.svg` – background line art and patterns
- `favicon.svg`, `logo.png` – tab icon
- `tools/make-skylines.mjs` – redraws the skylines and line art (`node tools/make-skylines.mjs img`)

The consultation form opens the visitor's own email app with their message filled in (GitHub Pages has no server to send mail).
Add `?lang=ja` or `?lang=en` to the address to open the site in a given language.
