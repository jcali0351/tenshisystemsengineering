// Stock ticker data: delayed prices for Japan's main indexes, the yen and well-known Tokyo-listed companies.
// Writes data/ticker.json, which app.js reads to fill the scrolling ticker at the top of every page.
// Runs on GitHub every 30 minutes while the Tokyo market is open (.github/workflows/stock-ticker.yml), or by hand:
//   node tools/ticker.mjs
// Prices come from Yahoo Finance's public chart data, with Stooq as a fallback. They are delayed, not live.
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";

export const SYMBOLS = [
  { name: "Nikkei 225", yahoo: "^N225", stooq: "^nkx", kind: "index" },
  { name: "TOPIX", yahoo: "^TOPX", stooq: "^tpx", kind: "index" },
  { name: "USD/JPY", yahoo: "JPY=X", stooq: "usdjpy", kind: "fx" },
  { name: "Toyota", code: "7203", yahoo: "7203.T", stooq: "7203.jp" },
  { name: "Sony", code: "6758", yahoo: "6758.T", stooq: "6758.jp" },
  { name: "SoftBank Group", code: "9984", yahoo: "9984.T", stooq: "9984.jp" },
  { name: "Tokyo Electron", code: "8035", yahoo: "8035.T", stooq: "8035.jp" },
  { name: "Advantest", code: "6857", yahoo: "6857.T", stooq: "6857.jp" },
  { name: "Nintendo", code: "7974", yahoo: "7974.T", stooq: "7974.jp" },
  { name: "Mitsubishi UFJ", code: "8306", yahoo: "8306.T", stooq: "8306.jp" },
  { name: "Fast Retailing", code: "9983", yahoo: "9983.T", stooq: "9983.jp" },
  { name: "Hitachi", code: "6501", yahoo: "6501.T", stooq: "6501.jp" },
  { name: "Keyence", code: "6861", yahoo: "6861.T", stooq: "6861.jp" },
  { name: "Recruit", code: "6098", yahoo: "6098.T", stooq: "6098.jp" },
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
