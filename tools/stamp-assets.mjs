// Stamps every page's links to styles.css, translations.js, app.js and rain.js with a short hash of each file's
// contents (e.g. styles.css?v=1a2b3c4d), so visitors' browsers fetch the new copy as soon as a file changes.
// Covers index.html and the service pages in services/ (whose links start with ../).
// Run from the repository folder after changing any of those files: node tools/stamp-assets.mjs
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";

const files = ["styles.css", "translations.js", "app.js", "rain.js"].filter((f) => existsSync(f));
const pages = ["index.html", ...(existsSync("services") ? readdirSync("services").filter((f) => f.endsWith(".html")).map((f) => "services/" + f) : [])];
const versions = Object.fromEntries(files.map((f) => [f, createHash("sha256").update(readFileSync(f)).digest("hex").slice(0, 8)]));

for (const p of pages) {
  let html = readFileSync(p, "utf8");
  for (const f of files) {
    const re = new RegExp(`(["'])((?:\\.\\./)?)${f.replace(".", "\\.")}(\\?v=[0-9a-f]+)?\\1`, "g");
    html = html.replace(re, `$1$2${f}?v=${versions[f]}$1`);
  }
  writeFileSync(p, html);
}
for (const [f, v] of Object.entries(versions)) console.log(`${f} v=${v}`);
console.log(`${pages.length} pages stamped`);
