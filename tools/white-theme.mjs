// tools/white-theme.mjs: puts the white corporate theme on every page next to the neon look.
// On each page it adds, in <head>:
//   - white-theme.js before the first stylesheet (decides white or neon before anything is drawn)
//   - white-theme.css as the very last stylesheet (its rules only apply under <html class="white">)
// Safe to run again and again. tools/build-pages.mjs runs it after neon-pages.mjs; tools/stamp-assets.mjs stamps the ?v= tags.
// Run from the repository folder: node tools/white-theme.mjs
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";

const SKIP = ["admin.html", "client-portal.html", "404.html", "arcade-embed.html", "classic.html"];
const pages = [
  ...readdirSync(".").filter((f) => f.endsWith(".html") && !SKIP.includes(f)),
  ...["services", "projects", "blog"].flatMap((d) => existsSync(d) ? readdirSync(d).filter((f) => f.endsWith(".html")).map((f) => d + "/" + f) : []),
];
let done = 0;
for (const p of pages) {
  let html = readFileSync(p, "utf8");
  const before = html, pre = p.includes("/") ? "../" : "";
  html = html.replace(/\n?[ \t]*<script src="(?:\.\.\/)?white-theme\.js[^"]*"><\/script>/g, "").replace(/\n?[ \t]*<link rel="stylesheet" href="(?:\.\.\/)?white-theme\.css[^"]*">/g, "");
  if (!/<link rel="stylesheet"/.test(html) || !html.includes("</head>")) continue;
  html = html.replace(/([ \t]*)<link rel="stylesheet"/, (m, sp) => `${sp}<script src="${pre}white-theme.js"></script>\n${m}`);
  html = html.replace("</head>", `  <link rel="stylesheet" href="${pre}white-theme.css">\n</head>`);
  if (html !== before) writeFileSync(p, html);
  done++;
}
console.log(`white theme linked on ${done} pages`);
