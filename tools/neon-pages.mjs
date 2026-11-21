// tools/neon-pages.mjs: gives every page except the homepage the neon game look.
//
// On each page it:
//   - adds class="neon gx-page" to <html>
//   - links sandbox/neon-recolor.css, neon-theme.css and neon-pages.css right after custom.css (plus the small
//     neon-recolor-live.js that turns any leftover red purple)
//   - loads sandbox/neon-quest.js (stages, XP, the quest HUD) at the end of <body>
// Safe to run again and again: old links are removed and re-added, with a ?v= tag made from the files' contents so
// browsers fetch new copies when they change. tools/build-pages.mjs runs it after writing the pages.
// Run from the repository folder: node tools/neon-pages.mjs
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";

const SKIP = ["index.html", "classic.html", "admin.html", "client-portal.html", "404.html", "projects.html"];
const FILES = ["sandbox/neon-recolor.css", "sandbox/neon-theme.css", "sandbox/neon-pages.css", "sandbox/neon-recolor-live.js", "sandbox/neon-quest.js", "sandbox/game-settings.js"];
const v = createHash("sha256").update(FILES.map((f) => readFileSync(f)).join("\n")).digest("hex").slice(0, 8);
const pages = [
  ...readdirSync(".").filter((f) => f.endsWith(".html") && !SKIP.includes(f)),
  ...["services", "projects", "blog"].flatMap((d) => existsSync(d) ? readdirSync(d).filter((f) => f.endsWith(".html")).map((f) => d + "/" + f) : []),
];

let done = 0;
const skipped = [];
for (const p of pages) {
  let html = readFileSync(p, "utf8");
  const before = html;
  const pre = p.includes("/") ? "../" : "";
  if (!/<link rel="stylesheet" href="(?:\.\.\/)?custom\.css[^"]*">/.test(html)) { skipped.push(p); continue; }
  // 1. <html class="neon gx-page">
  html = html.replace(/<html([^>]*)>/, (m, attrs) => {
    if (/class="[^"]*\bgx-page\b/.test(attrs)) return m;
    if (/class="/.test(attrs)) return `<html${attrs.replace(/class="([^"]*)"/, (mm, c) => `class="${(c + " neon gx-page").trim()}"`)}>`;
    return `<html${attrs} class="neon gx-page">`;
  });
  // 2. Take out any earlier copies of the links and scripts.
  html = html
    .replace(/\n?[ \t]*<link rel="stylesheet" href="(?:\.\.\/)?sandbox\/neon-(?:recolor|theme|pages)\.css[^"]*">/g, "")
    .replace(/\n?[ \t]*<script src="(?:\.\.\/)?sandbox\/(?:neon-recolor-live|neon-quest|game-settings)\.js[^"]*"><\/script>/g, "");
  // 3. The stylesheets right after custom.css (so they win), and the recolouring script.
  html = html.replace(/(<link rel="stylesheet" href="(?:\.\.\/)?custom\.css[^"]*">)/, (m) => m +
    `\n  <link rel="stylesheet" href="${pre}sandbox/neon-recolor.css?v=${v}">` +
    `\n  <link rel="stylesheet" href="${pre}sandbox/neon-theme.css?v=${v}">` +
    `\n  <link rel="stylesheet" href="${pre}sandbox/neon-pages.css?v=${v}">` +
    `\n  <script src="${pre}sandbox/neon-recolor-live.js?v=${v}"></script>`);
  // 4. The quest script at the end of the page.
  html = html.replace(/<\/body>/, `  <script src="${pre}sandbox/game-settings.js?v=${v}"></script>\n  <script src="${pre}sandbox/neon-quest.js?v=${v}"></script>\n</body>`);
  if (html !== before) writeFileSync(p, html);
  done++;
}
console.log(`neon game look on ${done} pages (v=${v})${skipped.length ? "; skipped (no custom.css link): " + skipped.join(", ") : ""}`);
