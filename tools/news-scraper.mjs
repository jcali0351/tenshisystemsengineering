// Tenshi Scraper (news bot): gathers recent web, gaming, AI and technology news from public RSS feeds, ten stories per category, and
// writes data/news.json. tools/build-pages.mjs turns that file into news.html.
//
// Every story keeps its publisher's name and link and the original headline. The short excerpt is the publisher's
// own feed teaser (cut to about 30 words), shown as a quote credited to them. If the repository has an
// ANTHROPIC_API_KEY secret, each story also gets a one-sentence summary written by Claude from the headline and teaser
// only. Started by the Tenshi Scraper button in admin.html (.github/workflows/news-scraper.yml), or by hand:
//   node tools/news-scraper.mjs
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { gnews, gather, norm, askClaude, jsonIn } from "./feeds.mjs";

const PER_CATEGORY = 10;

// Feeds per category, best first. A feed that fails is skipped; the Google News searches fill any gaps.
export const CATEGORIES = [
  { id: "web", key: "newsCatWeb", feeds: [
    "https://www.smashingmagazine.com/feed/",
    "https://css-tricks.com/feed/",
    gnews("web development OR web design OR CSS OR JavaScript OR browser"),
  ] },
  { id: "gaming", key: "newsCatGaming", feeds: [
    "https://www.gamesindustry.biz/feed",
    "https://www.polygon.com/rss/index.xml",
    gnews("video games OR game release OR game studio OR game engine"),
  ] },
  { id: "ai", key: "newsCatAI", feeds: [
    "https://techcrunch.com/category/artificial-intelligence/feed/",
    gnews("artificial intelligence OR \"AI model\" OR machine learning"),
  ] },
  { id: "tech", key: "newsCatTech", feeds: [
    "https://www.theverge.com/rss/index.xml",
    "https://techcrunch.com/feed/",
    gnews("technology OR software OR gadgets"),
  ] },
  { id: "security", key: "newsCatSecurity", feeds: [
    "https://krebsonsecurity.com/feed/",
    "https://feeds.feedburner.com/TheHackersNews",
    gnews("cybersecurity OR data breach OR ransomware OR vulnerability"),
  ] },
  { id: "business", key: "newsCatBusiness", feeds: [
    gnews("tech startup OR funding round OR tech company earnings"),
    gnews("small business website OR ecommerce OR digital marketing"),
  ] },
];

async function summarise(items) {
  if (!process.env.ANTHROPIC_API_KEY || !items.length) return;
  const list = items.map((s, i) => `${i + 1}. Headline: ${s.title}\n   Teaser: ${s.excerpt || "(none)"}`).join("\n");
  try {
    const arr = jsonIn(await askClaude("For each news item below, write (a) one neutral sentence of at most 30 words that says what the story is about, in your own words, using only facts in the headline and teaser, and (b) a 2-4 word search phrase for a free stock photo of a generic scene or object that fits the story. The photo phrase must not name any person, team, brand or company. Answer with only a JSON array of objects {\"summary\": \"...\", \"image\": \"...\"}, one per item, in order.\n\n" + list,
      { model: process.env.NEWS_AI_MODEL || "claude-haiku-5-5", maxTokens: 3000 }));
    items.forEach((s, i) => {
      const a = arr[i] || {};
      if (typeof a.summary === "string" && a.summary.trim()) s.summary = a.summary.trim().slice(0, 300);
      if (typeof a.image === "string" && a.image.trim()) s.imageQuery = a.image.trim().slice(0, 60);
    });
  } catch (e) { console.log("  summaries skipped:", e.message); }
}

const old = existsSync("data/news.json") ? JSON.parse(readFileSync("data/news.json", "utf8")) : { categories: [] };
const out = { generatedAt: new Date().toISOString(), generator: "Tenshi Scraper", categories: [], lastRun: {} };
const used = new Set();
let fresh = 0;

for (const cat of CATEGORIES) {
  const picked = [];
  for (const s of await gather(cat.feeds, { label: cat.id + ": " })) {
    if (used.has(norm(s.title))) continue;      // a story shows in one category only
    used.add(norm(s.title)); picked.push(s);
    if (picked.length === PER_CATEGORY) break;
  }
  fresh += picked.length;
  // Never leave a category short: top it up with the previous run's stories.
  const prev = (old.categories.find((c) => c.id === cat.id) || {}).items || [];
  for (const s of prev) { if (picked.length >= PER_CATEGORY) break; if (!used.has(norm(s.title))) { used.add(norm(s.title)); picked.push(s); } }
  await summarise(picked.filter((s) => !s.summary));
  console.log(`${cat.id}: kept ${picked.length}`);
  out.categories.push({ id: cat.id, key: cat.key, items: picked });
}

out.lastRun = { at: out.generatedAt, ok: fresh > 0, newStories: fresh,
  message: fresh > 0 ? `Found ${fresh} new stories.` : "No feed could be read this time, so the previous stories were kept." };
mkdirSync("data", { recursive: true });
writeFileSync("data/news.json", JSON.stringify(out, null, 2) + "\n");
console.log("data/news.json written:", out.categories.map((c) => `${c.id} ${c.items.length}`).join(", "));
