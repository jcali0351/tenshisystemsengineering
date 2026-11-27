// World Pulse globe: the day's move for the biggest companies on each major stock exchange (the "Markets today" board).
// Writes data/globe/stocks.json. Runs from .github/workflows/globe-data.yml with the market prices, or by hand:
//   node tools/globe-stocks.mjs
// Prices come from Yahoo Finance's public chart data (delayed). The day's change is the last price against the previous
// session's close. A symbol that fails is left out of this run; an exchange with too few answers keeps its last saved list.
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";

const sfx = (list, s) => list.split(/\s+/).filter(Boolean).map((x) => x + s);
export const EXCHANGES = [
  { id: "nyse", name: "New York Stock Exchange", city: "New York", lon: -74.01, lat: 40.71, syms: sfx("JPM V MA WMT XOM UNH JNJ PG HD BAC KO CVX MRK ABBV LLY ORCL CRM DIS MCD NKE BA CAT GE GS MS WFC C IBM T VZ PFE TMO ABT DHR UPS RTX LMT HON MMM DE NEE SO DUK BLK AXP SPGI LOW TGT F GM UBER PM MO CL BMY CVS COP SLB BRK-B ACN NOW SHW", "") },
  { id: "nasdaq", name: "Nasdaq", city: "New York", lon: -73.99, lat: 40.76, syms: sfx("AAPL MSFT NVDA AMZN GOOGL META TSLA AVGO COST NFLX AMD ADBE PEP CSCO TMUS INTC QCOM TXN AMGN INTU AMAT ISRG BKNG HON SBUX GILD MDLZ ADP VRTX REGN LRCX MU PANW ADI KLAC SNPS CDNS MELI PYPL MAR ABNB ORLY CTAS CRWD FTNT MRVL NXPI ASML PDD WDAY ROST DXCM IDXX EA TTWO CSX PCAR MNST KDP LULU", "") },
  { id: "tsx", name: "Toronto Stock Exchange", city: "Toronto", lon: -79.38, lat: 43.65, syms: sfx("RY TD SHOP ENB CNR CP BN BMO BNS CNQ TRI CM MFC SU ATD TRP CSU NTR WCN IMO L BCE T FTS SLF GIB-A NA QSR CVE ABX AEM FNV WPM TECK-B RCI-B DOL MG IFC POW EMA H PPL K CCO WSP TFII CAE GWO MRU SAP", ".TO") },
  { id: "b3", name: "B3", city: "São Paulo", lon: -46.63, lat: -23.55, syms: sfx("PETR4 VALE3 ITUB4 BBDC4 ABEV3 BBAS3 WEGE3 B3SA3 RENT3 SUZB3 ITSA4 GGBR4 JBSS3 EQTL3 RADL3 LREN3 PRIO3 RAIL3 VIVT3 ELET3 SBSP3 CSAN3 HAPV3 BBSE3 EMBR3 TOTS3 CMIG4 KLBN11 UGPA3 CPLE6 ENEV3 BRFS3 CSNA3 MGLU3 TIMS3 CCRO3 HYPE3 MULT3 EGIE3 NTCO3", ".SA") },
  { id: "bmv", name: "Bolsa Mexicana de Valores", city: "Mexico City", lon: -99.13, lat: 19.43, syms: ["AMXB.MX", "WALMEX.MX", "FEMSAUBD.MX", "GFNORTEO.MX", "GMEXICOB.MX", "CEMEXCPO.MX", "BIMBOA.MX", "TLEVISACPO.MX", "KOFUBL.MX", "ASURB.MX", "GAPB.MX", "OMAB.MX", "AC.MX", "ALFAA.MX", "GRUMAB.MX", "KIMBERA.MX", "PE&OLES.MX", "ELEKTRA.MX", "GCARSOA1.MX", "ORBIA.MX", "PINFRA.MX", "BBAJIOO.MX", "LIVEPOLC-1.MX", "MEGACPO.MX", "Q.MX", "ALSEA.MX", "GENTERA.MX", "CUERVO.MX", "VESTA.MX", "RA.MX"] },
  { id: "lse", name: "London Stock Exchange", city: "London", lon: -0.1, lat: 51.51, syms: sfx("SHEL AZN HSBA ULVR BP GSK RIO DGE REL BATS LSEG NG GLEN BARC LLOY CPG RR BA AAL EXPN HLN PRU TSCO VOD NWG STAN III AHT SSE IMB RKT ANTO BT-A AV LGEN SGE SN INF WPP NXT IAG MNG ABF CRH JD KGF SBRY WTB BNZL ITRK SMIN HLMA PSON RTO ADM", ".L") },
  { id: "xetra", name: "Deutsche Börse Xetra", city: "Frankfurt", lon: 8.68, lat: 50.11, syms: sfx("SAP SIE ALV DTE AIR MBG BMW VOW3 BAS BAYN MUV2 DHL IFX ADS DB1 DBK EOAN RWE HEN3 MRK BEI FRE HEI CON MTX SY1 VNA P911 QIA RHM SHL ZAL BNR CBK ENR HNR1 SRT3 DTG PAH3 FME LHA TKA PUM EVK LEG G1A KGX NEM TLX HOT", ".DE") },
  { id: "paris", name: "Euronext Paris", city: "Paris", lon: 2.35, lat: 48.86, syms: sfx("MC OR RMS TTE SAN AIR SU AI BNP CS EL SAF KER DG CAP BN STLAPA ENGI ACA GLE ORA SGO ML HO DSY LR VIE RI PUB CA STMPA WLN RNO EN ERF TEP AC URW VIV ALO BVI FGR EDEN GET AMUN SW AKE BIM", ".PA") },
  { id: "six", name: "SIX Swiss Exchange", city: "Zurich", lon: 8.54, lat: 47.37, syms: sfx("NESN ROG NOVN UBSG ZURN ABBN CFR SIKA LONN ALC GIVN HOLN SREN PGHN GEBN SLHN KNIN SCMN SOON LOGN STMN SGSN UHR BAER LISN SCHP VACN EMSN BALN TEMN", ".SW") },
  { id: "ams", name: "Euronext Amsterdam", city: "Amsterdam", lon: 4.9, lat: 52.37, syms: sfx("ASML SHELL UNA INGA PRX ADYEN HEIA WKL AD ASM DSFIR PHIA KPN NN AKZA ABN MT RAND IMCD AGN BESI UMG EXO ASRNL HEIO", ".AS") },
  { id: "tse", name: "Tokyo Stock Exchange", city: "Tokyo", lon: 139.77, lat: 35.68, syms: sfx("7203 6758 9984 8306 6861 9432 6501 8035 9983 4063 7974 6098 8316 4502 7267 6367 8058 8001 6902 4568 9433 7741 6954 8411 6273 4519 8031 6981 7751 6594 2914 4661 6702 6752 7011 8766 9020 9022 4503 3382 6503 6301 5108 4901 8002 8053 6723 6857 7182 4543 4689 6178 8801 8802 2802 4452 7269 7270 9101 9104", ".T") },
  { id: "hkex", name: "Hong Kong Stock Exchange", city: "Hong Kong", lon: 114.16, lat: 22.28, syms: sfx("0700 9988 0005 1299 0939 3690 0941 1398 0388 2318 1810 9618 0883 3988 0001 0016 0002 0003 0011 0027 0066 0175 0267 0288 0386 0669 0688 0762 0823 0857 0960 0968 1038 1093 1109 1113 1177 1211 1928 2020 2269 2313 2319 2331 2382 2388 2628 9999 9888 0981 1024 2015 9868 6690 0992", ".HK") },
  { id: "sse", name: "Shanghai Stock Exchange", city: "Shanghai", lon: 121.47, lat: 31.23, syms: sfx("600519 601398 601288 601939 601988 600036 601318 601857 600028 600900 601628 600276 601166 600030 601088 600309 600887 601012 603259 600104 601668 600000 601328 600016 601601 600048 600690 601899 600585 600031 600406 601888 603288 600438 601919 600809 601225 600050 601390 601186 601766 600019 600150 601138 688981 600436 601633 600905 601728 601816", ".SS") },
  { id: "szse", name: "Shenzhen Stock Exchange", city: "Shenzhen", lon: 114.06, lat: 22.54, syms: sfx("300750 000858 000333 002594 000651 002415 300059 000001 002475 300760 000568 002714 300015 002352 000725 002304 000002 300124 002142 000063 300014 002230 000100 002460 300274 002027 000792 002466 300122 000538 002049 300498 000625 002129 300408 002371 000338 002241 300308 002812", ".SZ") },
  { id: "nse", name: "National Stock Exchange of India", city: "Mumbai", lon: 72.83, lat: 18.93, syms: sfx("RELIANCE TCS HDFCBANK INFY ICICIBANK HINDUNILVR ITC SBIN BHARTIARTL KOTAKBANK LT AXISBANK BAJFINANCE ASIANPAINT MARUTI HCLTECH SUNPHARMA TITAN ULTRACEMCO WIPRO NESTLEIND ONGC NTPC POWERGRID TATAMOTORS TATASTEEL JSWSTEEL ADANIENT ADANIPORTS M&M BAJAJFINSV TECHM INDUSINDBK GRASIM HINDALCO DRREDDY CIPLA COALINDIA BPCL EICHERMOT BRITANNIA HEROMOTOCO DIVISLAB APOLLOHOSP SBILIFE HDFCLIFE BAJAJ-AUTO TATACONSUM UPL LTIM", ".NS") },
  { id: "krx", name: "Korea Exchange", city: "Seoul", lon: 126.98, lat: 37.57, syms: sfx("005930 000660 373220 207940 005380 000270 068270 005490 035420 051910 006400 035720 105560 055550 012330 028260 066570 003550 096770 034730 015760 032830 086790 017670 033780 009150 010130 018260 011200 010950 316140 003670 000810 024110 009540 030200 034020 329180 259960 036570", ".KS") },
  { id: "twse", name: "Taiwan Stock Exchange", city: "Taipei", lon: 121.56, lat: 25.03, syms: sfx("2330 2317 2454 2308 2412 2881 2882 2303 1301 1303 2891 2886 3711 2002 1216 2884 2892 5880 2885 3008 2357 2382 2207 1326 2912 2395 3045 2880 2887 2603 2609 2615 3034 2379 2327 6505 1101 2890 2883 5871", ".TW") },
  { id: "sgx", name: "Singapore Exchange", city: "Singapore", lon: 103.85, lat: 1.28, syms: sfx("D05 O39 U11 Z74 C6L S68 C38U A17U BN4 F34 9CI C09 U96 S63 G13 Y92 H78 J36 C07 BS6 N2IU M44U ME8U V03 U14 S58 D01 C52 BUOU AJBU", ".SI") },
  { id: "asx", name: "Australian Securities Exchange", city: "Sydney", lon: 151.21, lat: -33.87, syms: sfx("BHP CBA CSL NAB WBC ANZ WES MQG FMG WDS TLS RIO WOW GMG TCL ALL STO COL QBE NCM S32 REA BXB SUN IAG ORG XRO JHX CPU RMD SHL ASX AMC COH MIN PLS NST EVN SCG SGP MPL TLC APA QAN WTC CAR SEK DXS LLC ORI", ".AX") },
  { id: "jse", name: "Johannesburg Stock Exchange", city: "Johannesburg", lon: 28.05, lat: -26.2, syms: sfx("NPN FSR SBK CPI ABG MTN SOL AGL ANG GFI SHP BID BVT REM NED SLM DSY VOD IMP SSW AMS WHL MRP CLS OMU INL TFG PPH APN EXX", ".JO") },
];

const UA = { "User-Agent": "Mozilla/5.0 (TenshiWorldPulse/1.0)" };
async function quote(sym) {
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=5d&interval=1d`, { headers: UA, signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const res = (await r.json())?.chart?.result?.[0], m = res?.meta;
  if (!m || typeof m.regularMarketPrice !== "number") throw new Error("no price");
  const closes = (res.indicators?.quote?.[0]?.close || []).filter((c) => typeof c === "number");
  const prev = closes.length >= 2 ? closes[closes.length - 2] : null;       // the session before the latest one
  if (!prev) throw new Error("no previous close");
  return [sym, String(m.shortName || m.longName || sym).slice(0, 28), +m.regularMarketPrice.toFixed(2), +(((m.regularMarketPrice - prev) / prev) * 100).toFixed(2), m.currency || ""];
}
// A few requests at a time, so Yahoo is not hammered.
async function pool(items, n, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; try { out[k] = await fn(items[k]); } catch { out[k] = null; } await new Promise((r) => setTimeout(r, 120)); } }));
  return out.filter(Boolean);
}

const OUT = "data/globe/stocks.json";
const old = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : { exchanges: [] };
const exchanges = [];
for (const x of EXCHANGES) {
  const stocks = (await pool(x.syms, 5, quote)).filter((s) => Math.abs(s[3]) < 60);
  const kept = old.exchanges.find((o) => o.id === x.id);
  const { syms, ...info } = x;
  if (stocks.length >= Math.min(12, syms.length / 3)) exchanges.push({ ...info, at: new Date().toISOString(), stocks });
  else if (kept) exchanges.push({ ...kept, stale: true });
  console.log(`${x.name}: ${stocks.length} of ${syms.length}`);
}
if (!exchanges.some((x) => !x.stale)) { console.log(`No prices this time; ${OUT} left as it was.`); process.exit(0); }
mkdirSync("data/globe", { recursive: true });
writeFileSync(OUT, JSON.stringify({ updatedAt: new Date().toISOString(), delayed: true, source: "Yahoo Finance", exchanges }) + "\n");
console.log(`${OUT} written: ${exchanges.reduce((n, x) => n + x.stocks.length, 0)} companies on ${exchanges.length} exchanges`);
