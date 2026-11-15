// Tenshi Scraper: gathers recent news about Japan from public RSS feeds, ten stories per category, and writes
// data/news.json. tools/build-pages.mjs turns that file into news.html.
//
// Every story keeps its publisher's name, the publisher's link and the original headline. The short excerpt is the
// publisher's own feed teaser (cut to about 30 words) and is shown as a quote credited to them. If the repository has
// an ANTHROPIC_API_KEY secret, each story also gets a one-sentence summary written by Claude from the headline and
// teaser only (never from text the publisher didn't put in its feed).
//
// Runs on GitHub (.github/workflows/news-scraper.yml), started by the Tenshi Scraper button in admin.html or by hand:
//   node tools/news-scraper.mjs
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";

const PER_CATEGORY = 10;
const MAX_AGE_DAYS = 21;
const EXCERPT_WORDS = 30;
const gnews = (q) => `https://news.google.com/rss/search?q=${encodeURIComponent(q + " when:7d")}&hl=en-US&gl=US&ceid=US:en`;

// Feeds per category, best first. A feed that fails is skipped; Google News searches fill any gaps.
export const CATEGORIES = [
  { id: "tech", key: "newsCatTech", feeds: [
    "https://japantoday.com/category/tech/feed",
    gnews("Japan technology OR semiconductor OR robotics"),
  ] },
  { id: "business", key: "newsCatBusiness", feeds: [
    "https://japantoday.com/category/business/feed",
    "https://www.japantimes.co.jp/business/feed/",
    gnews("Japan business OR economy OR company"),
  ] },
  { id: "stocks", key: "newsCatStocks", feeds: [
    gnews("Nikkei OR TOPIX OR \"Tokyo Stock Exchange\" stocks"),
    gnews("Japan stocks yen market"),
  ] },
  { id: "weather", key: "newsCatWeather", feeds: [
    gnews("Japan weather OR typhoon OR snow OR \"Japan Meteorological Agency\""),
    gnews("Japan earthquake OR rain OR temperature forecast"),
  ] },
  { id: "sports", key: "newsCatSports", feeds: [
    "https://japantoday.com/category/sports/feed",
    "https://www.japantimes.co.jp/sports/feed/",
    gnews("Japan sports OR sumo OR \"J.League\" OR baseball"),
  ] },
  { id: "health", key: "newsCatHealth", feeds: [
    gnews("Japan health OR medical OR hospital OR drug"),
    gnews("Japan health ministry"),
  ] },
];

/* ---------- tiny RSS / Atom reader (no dependencies) ---------- */
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“" };
const decode = (s) => s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
  if (e[0] === "#") { const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
  return ENT[e.toLowerCase()] ?? m;
});
const unwrap = (s) => (s || "").replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1").trim();
const strip = (html) => decode(decode(html).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const tag = (xml, name) => { const m = xml.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, "i")); return m ? unwrap(m[1]) : ""; };
const attr = (xml, name, a) => { const m = xml.match(new RegExp(`<${name}\\b[^>]*\\s${a}="([^"]*)"`, "i")); return m ? decode(m[1]) : ""; };
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const NAMES = { "japantoday.com": "Japan Today", "japantimes.co.jp": "The Japan Times" };

function parseFeed(xml, feedUrl) {
  const channel = strip(tag(xml, "title")) || hostOf(feedUrl);
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) || xml.match(/<entry\b[\s\S]*?<\/entry>/gi) || [];
  const isGoogle = hostOf(feedUrl) === "news.google.com";
  return blocks.map((b) => {
    let title = strip(tag(b, "title"));
    const link = unwrap(tag(b, "link")) || attr(b, "link", "href");
    const date = new Date(tag(b, "pubDate") || tag(b, "published") || tag(b, "updated") || tag(b, "dc:date"));
    let source = strip(tag(b, "source")), sourceUrl = attr(b, "source", "url");
    if (!source) { source = NAMES[hostOf(feedUrl)] || channel; sourceUrl = "https://" + hostOf(link || feedUrl); }
    if (isGoogle && source && title.endsWith(" - " + source)) title = title.slice(0, -(source.length + 3));
    let excerpt = isGoogle ? "" : strip(tag(b, "description") || tag(b, "summary") || tag(b, "content"));
    if (excerpt.toLowerCase().startsWith(title.toLowerCase())) excerpt = excerpt.slice(title.length).trim();
    const words = excerpt.split(" ").filter(Boolean);
    excerpt = words.length > EXCERPT_WORDS ? words.slice(0, EXCERPT_WORDS).join(" ").replace(/[,;:.]$/, "") + "…" : words.join(" ");
    return { title, url: link, source, sourceUrl, date: isNaN(date) ? null : date.toISOString(), excerpt };
  }).filter((s) => s.title && /^https?:\/\//.test(s.url));
}

async function fetchFeed(url) {
  const r = await fetch(url, { headers: { "User-Agent": "TenshiScraper/1.0 (+https://jcali0351.github.io/tenshisystemsengineering/news.html)", Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return parseFeed(await r.text(), url);
}

/* ---------- optional one-sentence summaries ---------- */
async function summarise(items) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || !items.length) return;
  const list = items.map((s, i) => `${i + 1}. Headline: ${s.title}\n   Teaser: ${s.excerpt || "(none)"}`).join("\n");
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.NEWS_AI_MODEL || "claude-haiku-5-5", max_tokens: 2000,
        messages: [{ role: "user", content: "For each news item below, write one neutral sentence of at most 30 words that says what the story is about, in your own words. Use only facts in the headline and teaser; add nothing else. Answer with a JSON array of strings, one per item, in order, and nothing else.\n\n" + list }],
      }),
      signal: AbortSignal.timeout(60000),
    });
    const j = await r.json();
    const arr = JSON.parse((j.content?.[0]?.text || "").replace(/^[^[]*/, "").replace(/[^\]]*$/, ""));
    items.forEach((s, i) => { if (typeof arr[i] === "string" && arr[i].trim()) s.summary = arr[i].trim(); });
  } catch (e) { console.log("  summaries skipped:", e.message); }
}

/* ---------- run ---------- */
const norm = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const old = existsSync("data/news.json") ? JSON.parse(readFileSync("data/news.json", "utf8")) : { categories: [] };
const out = { generatedAt: new Date().toISOString(), generator: "Tenshi Scraper", categories: [] };
const seen = new Set();
const cutoff = Date.now() - MAX_AGE_DAYS * 864e5;

for (const cat of CATEGORIES) {
  const found = [];
  for (const url of cat.feeds) {
    try {
      const items = await fetchFeed(url);
      console.log(`${cat.id}: ${items.length} from ${url}`);
      found.push(...items);
    } catch (e) { console.log(`${cat.id}: skipped ${url} (${e.message})`); }
  }
  const fresh = found
    .filter((s) => !s.date || Date.parse(s.date) >= cutoff)
    .sort((a, b) => Date.parse(b.date || 0) - Date.parse(a.date || 0));
  const picked = [];
  for (const s of fresh) {
    const k = norm(s.title);
    if (seen.has(k)) continue;
    seen.add(k); picked.push(s);
    if (picked.length === PER_CATEGORY) break;
  }
  // Never leave a category short: top it up with the previous run's stories.
  const prev = (old.categories.find((c) => c.id === cat.id) || {}).items || [];
  for (const s of prev) { if (picked.length >= PER_CATEGORY) break; if (!seen.has(norm(s.title))) { seen.add(norm(s.title)); picked.push(s); } }
  await summarise(picked.filter((s) => !s.summary));
  console.log(`${cat.id}: kept ${picked.length}`);
  out.categories.push({ id: cat.id, key: cat.key, items: picked });
}

mkdirSync("data", { recursive: true });
writeFileSync("data/news.json", JSON.stringify(out, null, 2) + "\n");
console.log("data/news.json written:", out.categories.map((c) => `${c.id} ${c.items.length}`).join(", "));
