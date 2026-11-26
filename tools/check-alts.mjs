#!/usr/bin/env node
// Fails if any public page has an <img> without an alt attribute.
// Empty alt="" is allowed (decorative images). Run from the repository folder
// after tools/build-pages.mjs, or via `npm run build`.
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

const SKIP_DIR = new Set([".git", "node_modules", "platform", "admin", "tools", "sandbox", "i18n", "fonts", "img", "brand", "portraits", "data", "docs", "marketing", "downloads", "vendor"]);
const SKIP_FILE = new Set(["admin.html"]);

function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".")) continue;
    const p = dir === "." ? name : join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (SKIP_DIR.has(name)) continue;
      walk(p, acc);
    } else if (name.endsWith(".html") && !SKIP_FILE.has(name)) {
      acc.push(p);
    }
  }
  return acc;
}

const missing = [];
for (const file of walk(".")) {
  const html = readFileSync(file, "utf8");
  const tags = html.match(/<img\b[^>]*>/gi) || [];
  for (const tag of tags) {
    if (!/\balt\s*=/i.test(tag)) {
      const src = (tag.match(/\bsrc="([^"]*)"/i) || ["", "(no src)"])[1];
      missing.push(`${file}: ${src}  ${tag.slice(0, 180)}`);
    }
  }
}

if (missing.length) {
  console.error(`check-alts: ${missing.length} <img> tag(s) missing an alt attribute:`);
  for (const line of missing) console.error("  " + line);
  process.exit(1);
}
console.log("check-alts: every public <img> has an alt attribute");
