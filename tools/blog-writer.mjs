// Tenshi Blog Writer (blog bot): reads recent stories about web design, software, AI and technology in Japan from
// public news feeds, then has Claude write new, original blog posts that comment on them from Tenshi's point of view.
// Each post lists and links the reports it draws on. Posts go into data/blog.json; tools/build-pages.mjs turns that
// file into blog.html. The first run also removes the placeholder posts.
//
// Needs the ANTHROPIC_API_KEY repository secret (GitHub › Settings › Secrets and variables › Actions).
// Started by the Tenshi Blog Writer button in admin.html (.github/workflows/blog-writer.yml), or by hand:
//   POSTS=3 node tools/blog-writer.mjs
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { gnews, gather, askClaude, jsonIn } from "./feeds.mjs";

const FEEDS = [
  "https://japantoday.com/category/tech/feed",
  gnews("web design OR website OR UX trends"),
  gnews("artificial intelligence business Japan"),
  gnews("software development OR cloud OR cybersecurity small business"),
  gnews("Japan technology startup OR digital transformation"),
];
const CATS = ["Web design", "Web development", "Software", "AI", "Hosting", "Branding", "Content", "Accessibility", "Technology", "Japan tech", "Osaka", "Security"];
const MAX_POSTS = 60;

let req = {};
try { req = JSON.parse(readFileSync("data/blog-request.json", "utf8")); } catch {}
const want = Math.min(5, Math.max(1, parseInt(process.env.POSTS || req.posts || 3, 10) || 3));
const blog = existsSync("data/blog.json") ? JSON.parse(readFileSync("data/blog.json", "utf8")) : { posts: [] };
const finish = (ok, message) => {
  blog.lastRun = { at: new Date().toISOString(), ok, message };
  blog.generatedAt = blog.lastRun.at;
  mkdirSync("data", { recursive: true });
  writeFileSync("data/blog.json", JSON.stringify(blog, null, 2) + "\n");
  console.log(message);
};

if (!process.env.ANTHROPIC_API_KEY) {
  finish(false, "The Blog Writer needs an ANTHROPIC_API_KEY secret on GitHub before it can write posts. Nothing was changed.");
  process.exit(0);
}

const stories = (await gather(FEEDS, { maxAgeDays: 14, label: "blog: " })).slice(0, 30);
if (stories.length < 3) { finish(false, "Too few stories could be read from the news feeds this time. Nothing was changed."); process.exit(0); }

const existing = blog.posts.filter((p) => !p.placeholder).slice(0, 30).map((p) => "- " + p.title).join("\n") || "(none yet)";
const list = stories.map((s, i) => `[${i + 1}] ${s.title} (${s.source}, ${s.date ? s.date.slice(0, 10) : "recent"})\n    Teaser: ${s.excerpt || "(none)"}`).join("\n");
const prompt = `You write the blog of Tenshi Systems Engineering, a small web design, software and AI studio in Osaka, Japan, for business owners. Write ${want} new blog post(s) based on the recent news stories listed below.

Rules:
- Each post draws on 1 to 3 of the stories and says what they mean for small and mid-sized businesses: practical takeaways, not hype.
- Write everything in your own words. Do not copy sentences from the stories; quote at most a few words, in quotation marks, crediting the publisher.
- Use only facts given in the headlines and teasers. Don't invent numbers, names, quotes or details. When you mention a fact from a story, name the publisher ("according to Japan Today ...").
- Pick topics that differ from each other and from these earlier posts:
${existing}
- Friendly, clear, confident tone. No sales pitch beyond, at most, one closing sentence inviting readers to get in touch.
- Category: one of ${CATS.join(", ")}.

Answer with only a JSON array, one object per post:
{"title": "...", "category": "...", "intro": "one or two sentences, max 45 words", "body": ["paragraph", "paragraph", "paragraph"], "sources": [story numbers used, e.g. 2, 7], "image": "2-4 word search phrase for a free stock photo of a generic scene or object for this post, naming no person, team, brand or company"}
Body: 3 to 5 paragraphs of 50 to 110 words each.

Stories:
${list}`;

let posts;
try { posts = jsonIn(await askClaude(prompt, { model: process.env.BLOG_AI_MODEL || "claude-sonnet-5-5", maxTokens: 6000 })); }
catch (e) { finish(false, "The Blog Writer couldn't write posts this time: " + e.message); process.exit(0); }

const clean = (s, n) => String(s || "").replace(/\s+/g, " ").trim().slice(0, n);
const today = new Date().toISOString().slice(0, 10);
const made = (Array.isArray(posts) ? posts : []).slice(0, want).map((p, i) => {
  const src = [...new Set((p.sources || []).map(Number))].filter((n) => n >= 1 && n <= stories.length).map((n) => stories[n - 1]);
  const body = (Array.isArray(p.body) ? p.body : []).map((x) => clean(x, 1200)).filter(Boolean).slice(0, 6);
  const words = [p.intro, ...body].join(" ").split(/\s+/).length;
  return {
    id: today.replace(/-/g, "") + "-" + Date.now().toString(36).slice(-4) + i,
    date: today, cat: CATS.includes(p.category) ? p.category : "Technology", min: Math.max(2, Math.round(words / 200)),
    title: clean(p.title, 120), intro: clean(p.intro, 400), body, ai: true, imageQuery: clean(p.image, 60) || undefined,
    sources: src.map((s) => ({ title: s.title, source: s.source, url: s.url, date: s.date })),
  };
}).filter((p) => p.title && p.intro && p.body.length >= 2 && p.sources.length);

if (!made.length) { finish(false, "The reply didn't contain usable posts, so nothing was changed. Try again."); process.exit(0); }
blog.posts = [...made, ...blog.posts.filter((p) => !p.placeholder)].slice(0, MAX_POSTS);
finish(true, `Wrote ${made.length} new post${made.length > 1 ? "s" : ""}: ${made.map((p) => "“" + p.title + "”").join(", ")}.`);
