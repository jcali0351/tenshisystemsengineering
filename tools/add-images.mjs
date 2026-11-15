// Gives every news story and blog post a feature image (see images.mjs), then deletes saved photos that no story
// uses any more. Run by the Tenshi Scraper and Tenshi Blog Writer jobs after they gather content, or by hand:
//   node tools/add-images.mjs [news|blog]     (no argument: both)
// A story that only has a generated cover is tried again for a photo on the next run.
import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync } from "node:fs";
import { imageFor, guessQuery, saveCache, DIR } from "./images.mjs";

const only = process.argv[2];   // "news" from the Scraper job, "blog" from the Blog Writer job
const load = (f) => (existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null);
const news = load("data/news.json"), blog = load("data/blog.json");
const taken = new Set();
const fileGone = (img) => !img || (!img.generated && !existsSync(img.src));
let found = 0, covers = 0;

async function fill(item, cat, text) {
  if (item.image && !fileGone(item.image) && !item.image.generated) { if (item.image.file) taken.add(item.image.file); return; }
  item.image = await imageFor(item.imageQuery || guessQuery(text, cat), cat, taken);
  item.image.generated ? covers++ : found++;
}

if (news && only !== "blog") for (const c of news.categories) for (const s of c.items) await fill(s, c.id, `${s.title} ${s.excerpt || ""} ${s.summary || ""}`);
if (blog && only !== "news") for (const p of blog.posts) await fill(p, "blog", `${p.title} ${p.intro}`);

if (news && only !== "blog") writeFileSync("data/news.json", JSON.stringify(news, null, 2) + "\n");
if (blog && only !== "news") writeFileSync("data/blog.json", JSON.stringify(blog, null, 2) + "\n");
saveCache();

// Remove saved photos nothing points to any more.
const keep = new Set([...(news?.categories || []).flatMap((c) => c.items), ...(blog?.posts || [])].map((x) => x.image?.src).filter(Boolean));
let removed = 0;
if (existsSync(DIR)) for (const f of readdirSync(DIR)) if (!keep.has(`${DIR}/${f}`)) { unlinkSync(`${DIR}/${f}`); removed++; }
console.log(`Images: ${found} new photos, ${covers} generated covers, ${removed} unused photos removed.`);
