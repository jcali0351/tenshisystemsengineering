// Shared by the Tenshi bots (news-scraper.mjs, blog-writer.mjs): read public RSS/Atom feeds without any packages,
// keeping each story's publisher, link, date and the publisher's own short teaser.
export const EXCERPT_WORDS = 30;
export const gnews = (q) => `https://news.google.com/rss/search?q=${encodeURIComponent(q + " when:7d")}&hl=en-US&gl=US&ceid=US:en`;

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“" };
const decode = (s) => s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
  if (e[0] === "#") { const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
  return ENT[e.toLowerCase()] ?? m;
});
const unwrap = (s) => (s || "").replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1").trim();
const strip = (html) => decode(decode(html).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const tag = (xml, name) => { const m = xml.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, "i")); return m ? unwrap(m[1]) : ""; };
const attr = (xml, name, a) => { const m = xml.match(new RegExp(`<${name}\\b[^>]*\\s${a}="([^"]*)"`, "i")); return m ? decode(m[1]) : ""; };
export const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const NAMES = { "smashingmagazine.com": "Smashing Magazine", "css-tricks.com": "CSS-Tricks", "gamesindustry.biz": "GamesIndustry.biz", "polygon.com": "Polygon", "techcrunch.com": "TechCrunch", "theverge.com": "The Verge", "krebsonsecurity.com": "Krebs on Security", "feeds.feedburner.com": "The Hacker News" };

export function parseFeed(xml, feedUrl) {
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

export async function fetchFeed(url) {
  const r = await fetch(url, { headers: { "User-Agent": "TenshiBots/1.0 (+https://jcali0351.github.io/tenshisystemsengineering/)", Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return parseFeed(await r.text(), url);
}

/* Read a list of feeds; skip any that fail. Newest first, duplicates removed, older than maxAgeDays dropped. */
export async function gather(feeds, { maxAgeDays = 21, label = "" } = {}) {
  const found = [];
  for (const url of feeds) {
    try { const items = await fetchFeed(url); console.log(`${label}${items.length} from ${url}`); found.push(...items); }
    catch (e) { console.log(`${label}skipped ${url} (${e.message})`); }
  }
  const cutoff = Date.now() - maxAgeDays * 864e5, seen = new Set();
  return found.filter((s) => !s.date || Date.parse(s.date) >= cutoff)
    .sort((a, b) => Date.parse(b.date || 0) - Date.parse(a.date || 0))
    .filter((s) => { const k = norm(s.title); if (seen.has(k)) return false; seen.add(k); return true; });
}
export const norm = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/* Ask Claude (needs the ANTHROPIC_API_KEY secret). Returns the reply text, or throws. */
export async function askClaude(prompt, { model, maxTokens = 4000 } = {}) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("no ANTHROPIC_API_KEY secret");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }),
    signal: AbortSignal.timeout(180000),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message || "Anthropic API HTTP " + r.status);
  return (j.content || []).map((c) => c.text || "").join("");
}
/* The first JSON value in a reply. */
export function jsonIn(text) {
  const start = text.search(/[[{]/);
  if (start < 0) throw new Error("no JSON in the reply");
  const open = text[start], close = open === "[" ? "]" : "}";
  return JSON.parse(text.slice(start, text.lastIndexOf(close) + 1));
}
