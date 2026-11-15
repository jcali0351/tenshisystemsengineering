// Feature images for the Tenshi bots: finds a free-to-use photo for each news story and blog post, saves a copy in
// img/stories/ and records who made it and under which license, so the site can credit it.
//
// Where the photos come from, in order:
//   1. Openverse (openverse.org): openly licensed images, filtered to licenses that allow commercial use
//      (CC0, public domain, CC BY, CC BY-SA).
//   2. Wikimedia Commons: every file there is free to reuse with credit.
//   3. If neither has a match, a generated cover in the site's style (img/covers/<category>.svg), so no card is empty.
// Searches describe scenes and objects, never named people, so no one's photo is put on the site.
import { createHash } from "node:crypto";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";

const UA = { "User-Agent": "TenshiBots/1.0 (+https://jcali0351.github.io/tenshisystemsengineering/; feature images with credit)" };
export const DIR = "img/stories";
const CACHE = "data/image-cache.json";
const CACHE_DAYS = 30;

// Topic words -> a photo search. First match wins; the category default is the last resort.
const KEYWORDS = [
  [/semiconductor|chip|wafer|rapidus|euv|photomask|memory/i, "semiconductor wafer"],
  [/robot/i, "industrial robot arm"],
  [/\bai\b|artificial intelligence|data cent(er|re)|server/i, "server room"],
  [/satellite|space|rocket|spaceport/i, "rocket launch"],
  [/robotaxi|self-driving|autonomous/i, "city street traffic"],
  [/car|vehicle|truck|automaker|\bev\b|toyota|nissan|honda|mazda|subaru/i, "car assembly line"],
  [/nuclear|reactor/i, "power plant"],
  [/oil|gas|energy|turbine|power|electric/i, "power lines sunset"],
  [/copper|foil|materials|chemical|rare earth/i, "factory industrial"],
  [/nikkei|topix|stock|shares|index|bear market|rally|ipo/i, "stock market board"],
  [/yen|currency|bank|bond|rate hike|boj|finance/i, "japanese yen"],
  [/typhoon/i, "typhoon satellite"],
  [/snow|blizzard/i, "snow japan"],
  [/rain|storm|thunder|downpour|umbrella/i, "rain umbrella street"],
  [/autumn|leaves|maple|foliage/i, "autumn leaves kyoto"],
  [/earthquake|quake|tsunami/i, "seismograph"],
  [/temperature|warm|heat|climate|record high/i, "sunny sky clouds"],
  [/forecast|weather|cloud|sunny/i, "sky clouds"],
  [/sumo/i, "sumo dohyo"],
  [/baseball|mvp|japan series|npb/i, "baseball stadium"],
  [/soccer|football|j\.?league|\bj1\b|world cup|friendly/i, "soccer ball grass"],
  [/rugby/i, "rugby ball"],
  [/golf/i, "golf course"],
  [/skat/i, "ice rink"],
  [/mma|rizin|boxing|fight/i, "boxing ring"],
  [/drug|pharma|medicine|tablet|biosimilar|vaccine/i, "medicine pills"],
  [/hospital|medical|patient|doctor|nurs|health/i, "stethoscope"],
  [/sushi|food|meal|restaurant/i, "sushi"],
  [/web ?site|web design|\bux\b|landing page/i, "web design laptop"],
  [/software|code|developer|programming|app\b/i, "programming code screen"],
  [/cyber|security|hack|vulnerab/i, "cyber security"],
  [/cloud|hosting/i, "data center"],
  [/brand|logo|marketing/i, "design studio desk"],
  [/accessib/i, "keyboard laptop"],
  [/osaka/i, "osaka skyline"],
  [/kyoto/i, "kyoto temple"],
  [/tokyo/i, "tokyo skyline night"],
];
export const CATEGORY_QUERY = {
  tech: "circuit board", business: "tokyo office buildings", stocks: "stock market chart", weather: "japan sky clouds",
  sports: "stadium lights", health: "stethoscope", blog: "laptop desk workspace",
};
export const guessQuery = (text, cat) => (KEYWORDS.find(([re]) => re.test(text)) || [, CATEGORY_QUERY[cat] || "japan city"])[1];

const LICENSES = { cc0: "CC0", pdm: "Public domain", by: "CC BY", "by-sa": "CC BY-SA" };

async function openverse(q) {
  const u = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&license=cc0,pdm,by,by-sa&page_size=20&mature=false&aspect_ratio=wide&category=photograph&size=large`;
  const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error("Openverse HTTP " + r.status);
  return ((await r.json()).results || []).filter((x) => x.thumbnail && LICENSES[x.license]).map((x) => ({
    file: x.thumbnail, page: x.foreign_landing_url || x.url, creator: x.creator || "Unknown", creatorUrl: x.creator_url || null,
    license: (LICENSES[x.license] + (x.license_version && !["cc0", "pdm"].includes(x.license) ? " " + x.license_version : "")).trim(),
    licenseUrl: x.license_url || null, provider: x.source || x.provider || "Openverse", via: "Openverse",
  }));
}
const strip = (s) => String(s || "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/\s+/g, " ").trim();
async function commons(q) {
  const u = `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=20&gsrsearch=${encodeURIComponent(q + " filetype:bitmap")}&prop=imageinfo&iiprop=url|extmetadata|size|mime&iiurlwidth=900`;
  const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error("Commons HTTP " + r.status);
  const pages = Object.values((await r.json()).query?.pages || {});
  return pages.map((p) => p.imageinfo?.[0]).filter((i) => i && /jpeg|png/.test(i.mime) && i.width > i.height && i.thumburl).map((i) => {
    const m = i.extmetadata || {};
    return { file: i.thumburl, page: i.descriptionurl, creator: strip(m.Artist?.value) || "Unknown", creatorUrl: null,
      license: strip(m.LicenseShortName?.value) || "See source", licenseUrl: m.LicenseUrl?.value || null, provider: "Wikimedia Commons", via: "Wikimedia Commons" };
  }).filter((x) => !/non-?commercial|\bnc\b/i.test(x.license));
}

let cache = {};
try { cache = JSON.parse(readFileSync(CACHE, "utf8")); } catch {}
const used = new Map(); // query -> how many times used this run, so stories with the same topic get different photos

async function candidates(q) {
  const c = cache[q];
  if (c && c.list.length && Date.now() - Date.parse(c.at) < CACHE_DAYS * 864e5) return c.list;
  let list = [];
  try { list = await openverse(q); } catch (e) { console.log(`  images: ${e.message}`); }
  if (list.length < 3) { try { list = list.concat(await commons(q)); } catch (e) { console.log(`  images: ${e.message}`); } }
  if (list.length) cache[q] = { at: new Date().toISOString(), list };
  await new Promise((r) => setTimeout(r, 400)); // be gentle with the free APIs
  return list;
}

async function download(c) {
  const name = createHash("sha1").update(c.file).digest("hex").slice(0, 16);
  for (const ext of ["jpg", "png", "webp"]) if (existsSync(`${DIR}/${name}.${ext}`)) return `${DIR}/${name}.${ext}`;
  const r = await fetch(c.file, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(20000) });
  const type = r.headers.get("content-type") || "";
  if (!r.ok || !/^image\/(jpeg|png|webp)/.test(type)) throw new Error("not an image (" + r.status + " " + type + ")");
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 4000 || buf.length > 2.5e6) throw new Error("unusable size " + buf.length);
  mkdirSync(DIR, { recursive: true });
  const path = `${DIR}/${name}.${type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg"}`;
  writeFileSync(path, buf);
  return path;
}

/* An image record for one story or post: a free photo with its credit, or a generated cover. */
export async function imageFor(query, cat, taken = new Set()) {
  const q = (query || CATEGORY_QUERY[cat] || "japan city").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").trim().slice(0, 60);
  const list = await candidates(q);
  const start = used.get(q) || 0;
  for (let i = 0; i < list.length; i++) {
    const c = list[(start + i) % list.length];
    if (taken.has(c.file)) continue;
    try {
      const src = await download(c);
      used.set(q, start + i + 1); taken.add(c.file);
      return { src, query: q, creator: c.creator, creatorUrl: c.creatorUrl, license: c.license, licenseUrl: c.licenseUrl, page: c.page, provider: c.provider, via: c.via, file: c.file };
    } catch (e) { console.log(`  image skipped (${e.message})`); }
  }
  return { src: `img/covers/${cat in CATEGORY_QUERY ? cat : "blog"}.svg`, generated: true, query: q };
}
export function saveCache() { mkdirSync("data", { recursive: true }); writeFileSync(CACHE, JSON.stringify(cache) + "\n"); }
