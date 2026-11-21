// Tells Bing, Yandex, Seznam, Naver and the other IndexNow search engines about every page in sitemap.xml.
// The key file (<key>.txt at the site root) proves the site is ours. Run after a deploy: node tools/indexnow.mjs
import { readFileSync, readdirSync } from "node:fs";
const key = readdirSync(".").find((f) => /^[0-9a-f]{32}\.txt$/.test(f))?.slice(0, 32);
if (!key) throw new Error("no IndexNow key file at the site root");
const urlList = [...readFileSync("sitemap.xml", "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const r = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST", headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host: "tenshisystems.com", key, keyLocation: `https://tenshisystems.com/${key}.txt`, urlList }),
});
console.log(`IndexNow: ${urlList.length} URLs, HTTP ${r.status} ${r.statusText}`, (await r.text()).slice(0, 200));
