// World Pulse globe (viz/world-pulse.html): delayed prices for world stock indexes, commodities, currencies and rates.
// Writes data/globe/markets.json. Runs every 15 minutes on weekdays from .github/workflows/globe-data.yml, or by hand:
//   node tools/globe-markets.mjs
// Prices come from Yahoo Finance's public chart data. They are delayed, not live. A symbol that fails keeps its last
// good value (marked stale), so one bad request never blanks a marker on the globe.
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";

export const SYMBOLS = [
  // World stock indexes (pinned on the globe at their exchange)
  "^GSPC", "^NDX", "^DJI", "^GSPTSE", "^BVSP", "^MXX", "^FTSE", "^GDAXI", "^FCHI", "^STOXX50E",
  "^N225", "^HSI", "000001.SS", "^BSESN", "^AXJO", "^KS11", "^TWII", "^STI",
  // Commodities (pinned at their benchmark hub)
  "CL=F", "BZ=F", "NG=F", "GC=F", "SI=F", "HG=F", "PL=F", "ZW=F", "ZC=F", "ZS=F",
  // Rates, volatility, the dollar and currencies (shown in the ticker strip)
  "^TNX", "^VIX", "DX-Y.NYB", "EURUSD=X", "GBPUSD=X", "JPY=X", "CNY=X", "BTC-USD", "ETH-USD", "SOL-USD",
];

const UA = { "User-Agent": "Mozilla/5.0 (TenshiWorldPulse/1.0)" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function yahoo(sym) {
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=5d&interval=1d`, { headers: UA, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error("Yahoo HTTP " + r.status);
  const res = (await r.json())?.chart?.result?.[0];
  const m = res?.meta;
  if (!m || typeof m.regularMarketPrice !== "number") throw new Error("Yahoo: no price");
  const prev = m.chartPreviousClose ?? m.previousClose;
  const closes = (res.indicators?.quote?.[0]?.close || []).filter((c) => typeof c === "number").map((c) => +c.toFixed(4));
  return { name: m.shortName || m.longName || sym, currency: m.currency || null, price: m.regularMarketPrice, prev: typeof prev === "number" ? prev : null, closes,
    time: m.regularMarketTime ? new Date(m.regularMarketTime * 1000).toISOString() : null };
}

const OUT = "data/globe/markets.json";
const old = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : { quotes: [] };
const quotes = [];
let fresh = 0;
for (const sym of SYMBOLS) {
  try {
    const q = await yahoo(sym);
    const change = q.prev ? q.price - q.prev : null;
    const dp = Math.abs(q.price) < 20 ? 4 : 2;
    quotes.push({ sym, name: q.name, currency: q.currency, price: +q.price.toFixed(dp),
      change: change == null ? null : +change.toFixed(dp), pct: change == null ? null : +((change / q.prev) * 100).toFixed(2),
      closes: q.closes, time: q.time });
    fresh++;
    console.log(`${sym}: ${q.price}`);
  } catch (e) {
    console.log(`${sym}: ${e.message}`);
    const kept = old.quotes.find((o) => o.sym === sym);
    if (kept) quotes.push({ ...kept, stale: true });
  }
  await sleep(150); // be gentle with Yahoo
}
if (!fresh) { console.log(`No prices this time; ${OUT} left as it was.`); process.exit(0); }
mkdirSync("data/globe", { recursive: true });
writeFileSync(OUT, JSON.stringify({ updatedAt: new Date().toISOString(), delayed: true, source: "Yahoo Finance", quotes }) + "\n");
console.log(`${OUT} written: ${fresh} fresh, ${quotes.length - fresh} kept from last time`);
