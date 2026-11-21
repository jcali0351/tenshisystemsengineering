// Stock ticker data: delayed prices for the main US indexes and well-known tech and gaming companies.
// Writes data/ticker.json, which app.js reads to fill the scrolling ticker at the top of every page.
// Runs on GitHub every 30 minutes while the US market is open (.github/workflows/stock-ticker.yml), or by hand:
//   node tools/ticker.mjs
// Prices come from Yahoo Finance's public chart data, with Stooq as a fallback. They are delayed, not live.
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";

export const SYMBOLS = [
  { name: "S&P 500", yahoo: "^GSPC", stooq: "^spx", kind: "index" },
  { name: "Nasdaq", yahoo: "^IXIC", stooq: "^ndq", kind: "index" },
  { name: "Apple", code: "AAPL", yahoo: "AAPL", stooq: "aapl.us" },
  { name: "Microsoft", code: "MSFT", yahoo: "MSFT", stooq: "msft.us" },
  { name: "Nvidia", code: "NVDA", yahoo: "NVDA", stooq: "nvda.us" },
  { name: "Alphabet", code: "GOOGL", yahoo: "GOOGL", stooq: "googl.us" },
  { name: "Amazon", code: "AMZN", yahoo: "AMZN", stooq: "amzn.us" },
  { name: "Meta", code: "META", yahoo: "META", stooq: "meta.us" },
  { name: "AMD", code: "AMD", yahoo: "AMD", stooq: "amd.us" },
  { name: "Electronic Arts", code: "EA", yahoo: "EA", stooq: "ea.us" },
  { name: "Take-Two", code: "TTWO", yahoo: "TTWO", stooq: "ttwo.us" },
  { name: "Roblox", code: "RBLX", yahoo: "RBLX", stooq: "rblx.us" },
  { name: "Unity", code: "U", yahoo: "U", stooq: "u.us" },
];
const UA = { "User-Agent": "Mozilla/5.0 (TenshiTicker/1.0)" };

async function yahoo(sym) {
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=5d&interval=1d`, { headers: UA, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error("Yahoo HTTP " + r.status);
  const m = (await r.json())?.chart?.result?.[0]?.meta;
  if (!m || typeof m.regularMarketPrice !== "number") throw new Error("Yahoo: no price");
  const prev = m.chartPreviousClose ?? m.previousClose;
  return { price: m.regularMarketPrice, prev: typeof prev === "number" ? prev : null, time: m.regularMarketTime ? new Date(m.regularMarketTime * 1000).toISOString() : null, source: "Yahoo Finance" };
}
async function stooq(sym) {
  const r = await fetch(`https://stooq.com/q/l/?s=${encodeURIComponent(sym)}&f=sd2t2ohlc&h&e=csv`, { headers: UA, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error("Stooq HTTP " + r.status);
  const [, row] = (await r.text()).trim().split(/\r?\n/);
  const [, d, t, , , , close] = (row || "").split(",");
  const price = parseFloat(close);
  if (!Number.isFinite(price)) throw new Error("Stooq: no price");
  // Stooq's quick quote has no previous close, so no change is shown for these.
  return { price, prev: null, time: d && t ? new Date(`${d}T${t}Z`).toISOString() : null, source: "Stooq" };
}

const old = existsSync("data/ticker.json") ? JSON.parse(readFileSync("data/ticker.json", "utf8")) : { quotes: [] };
const quotes = [];
for (const s of SYMBOLS) {
  let q = null;
  for (const [fn, sym] of [[yahoo, s.yahoo], [stooq, s.stooq]]) {
    try { q = await fn(sym); break; } catch (e) { console.log(`${s.name}: ${e.message}`); }
  }
  if (!q) { const kept = old.quotes.find((o) => o.name === s.name); if (kept) quotes.push(kept); continue; }
  const change = q.prev ? q.price - q.prev : null;
  quotes.push({
    name: s.name, code: s.code || null, kind: s.kind || "stock", price: +q.price.toFixed(2),
    change: change == null ? null : +change.toFixed(2), pct: change == null ? null : +((change / q.prev) * 100).toFixed(2),
    time: q.time, source: q.source,
  });
  console.log(`${s.name}: ${q.price} (${q.source})`);
}
if (!quotes.length) { console.log("No prices this time; data/ticker.json left as it was."); process.exit(0); }
mkdirSync("data", { recursive: true });
writeFileSync("data/ticker.json", JSON.stringify({ updatedAt: new Date().toISOString(), delayed: true, quotes }, null, 2) + "\n");
console.log(`data/ticker.json written with ${quotes.length} prices`);
