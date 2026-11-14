// Stamps index.html's links to styles.css, translations.js and app.js with a short hash of each file's contents
// (e.g. styles.css?v=1a2b3c4d), so visitors' browsers fetch the new copy as soon as a file changes.
// Run from the repository folder after changing any of those files: node tools/stamp-assets.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const files = ["styles.css", "translations.js", "app.js"];
let html = readFileSync("index.html", "utf8");
for (const f of files) {
  const v = createHash("sha256").update(readFileSync(f)).digest("hex").slice(0, 8);
  const re = new RegExp(`(["'])${f.replace(".", "\\.")}(\\?v=[0-9a-f]+)?\\1`, "g");
  html = html.replace(re, `$1${f}?v=${v}$1`);
  console.log(`${f} v=${v}`);
}
writeFileSync("index.html", html);
