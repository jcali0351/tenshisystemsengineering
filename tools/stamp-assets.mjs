// Stamps every page's links to tailwind.css, styles.css, search.css, translations.js, app.js, search.js and rain.js with a short hash of each file's
// contents (e.g. styles.css?v=1a2b3c4d), so visitors' browsers fetch the new copy as soon as a file changes.
// Covers every page in the main folder and the pages in services/, projects/ and blog/ (whose links start with ../).
// Run from the repository folder after changing any of those files: node tools/stamp-assets.mjs
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";

const files = ["tailwind.css", "styles.css", "design.css", "chat.css", "site-theme.css", "slogan.css", "hero-cta.css", "search.css", "buttons.css", "custom.css", "admin/admin.css", "admin/tr.js", "admin/slogan-style.js", "admin/buttons-style.js", "admin/theme.js", "admin/admin.js", "translations.js", "app.js", "search.js", "rain.js", "chat.js", "design.js"].filter((f) => existsSync(f));
const pages = [...readdirSync(".").filter((f) => f.endsWith(".html")), ...["services", "projects", "blog"].flatMap((d) => existsSync(d) ? readdirSync(d).filter((f) => f.endsWith(".html")).map((f) => d + "/" + f) : [])];
// The header search's index (data/search/<lang>.json, written by build-pages.mjs): one version for all languages,
// stamped into each page's data-search-v, which search.js adds to the index's address.
const searchFiles = existsSync("data/search") ? readdirSync("data/search").filter((f) => f.endsWith(".json")).sort() : [];
const searchV = createHash("sha256").update(searchFiles.map((f) => f + readFileSync("data/search/" + f, "utf8")).join("\n")).digest("hex").slice(0, 8);
const versions = Object.fromEntries(files.map((f) => [f, createHash("sha256").update(readFileSync(f)).digest("hex").slice(0, 8)]));

for (const p of pages) {
  let html = readFileSync(p, "utf8");
  for (const f of files) {
    const re = new RegExp(`(["'])((?:\\.\\./)?)${f.replace(".", "\\.")}(\\?v=[0-9a-f]+)?\\1`, "g");
    html = html.replace(re, `$1$2${f}?v=${versions[f]}$1`);
  }
  html = html.replace(/data-search-v="[^"]*"/g, `data-search-v="${searchV}"`);
  writeFileSync(p, html);
}
for (const [f, v] of Object.entries(versions)) console.log(`${f} v=${v}`);
console.log(`data/search v=${searchV}`);
console.log(`${pages.length} pages stamped`);
