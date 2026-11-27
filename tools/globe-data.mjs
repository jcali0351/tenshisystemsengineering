// World Pulse globe (viz/world-pulse.html): the world's infrastructure, from open data that allows business use.
// Writes data/globe/world.json. Runs weekly from .github/workflows/globe-data.yml, or by hand:
//   node tools/globe-data.mjs
// Sources (credit them on the page):
//   Natural Earth (public domain): land, coastline, ports, railways, major roads
//   OurAirports (public domain): airports
//   OpenFlights (ODbL): airline routes (a snapshot from 2014, no longer updated)
//   World Bank Open Data (CC BY 4.0): population, birth rate and death rate per country (births and deaths layer)
//   WRI Global Power Plant Database (CC BY 4.0): power stations by fuel (energy layer)
//   GeoNames (CC BY 4.0): every town and city of 15,000 people or more (population layer)
//   OpenStreetMap contributors (ODbL), through the Overpass API: data centres, submarine and long-haul telecom cables,
//     military sites (bases, airfields, naval bases, barracks, ranges and training areas, as far as volunteers have mapped them)
// A source that fails keeps what the last run saved, so one bad download never empties a layer.
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const OUT = "data/globe/world.json";
const UA = { "User-Agent": "TenshiWorldPulse/1.0 (https://tenshisystems.com)" };
const NE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/";
const old = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};
const out = { updatedAt: new Date().toISOString(), status: {} };

const getText = async (url, ms = 120000) => {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return r.text();
};
const getJson = async (url, ms) => JSON.parse(await getText(url, ms));
const r2 = (n) => Math.round(n * 100); // coordinates are stored as whole hundredths of a degree

// Thin a line: keep a point only when it is at least `tol` degrees from the last one kept.
function thin(coords, tol) {
  const o = [];
  let lx = null, ly = null;
  coords.forEach(([x, y], i) => {
    if (lx == null || i === coords.length - 1 || Math.hypot(x - lx, y - ly) >= tol) { o.push(r2(x), r2(y)); lx = x; ly = y; }
  });
  return o;
}
const lines = (geo) => geo.features.flatMap((f) => {
  const g = f.geometry;
  if (!g) return [];
  if (g.type === "LineString") return [g.coordinates];
  if (g.type === "MultiLineString") return g.coordinates;
  if (g.type === "Polygon") return g.coordinates;
  if (g.type === "MultiPolygon") return g.coordinates.flat();
  return [];
});

async function step(key, fn) {
  try {
    const v = await fn();
    Object.assign(out, v);
    out.status[key] = { ok: true, at: out.updatedAt };
    console.log(`${key}: ok`);
  } catch (e) {
    console.log(`${key}: ${e.message}; keeping the last saved copy`);
    for (const k of KEYS[key]) if (old[k] != null) out[k] = old[k];
    out.status[key] = old.status?.[key] ? { ...old.status[key], stale: true } : { ok: false };
  }
}
const KEYS = { land: ["land"], coast: ["coast"], ports: ["ports"], rails: ["rails"], roads: ["roads"], air: ["airports", "routes"], dcs: ["dcs"], bases: ["bases"], cables: ["cables"], vital: ["vital"], pop: ["pop"], power: ["power"] };

// Land as a 1440 x 720 bitmap (a quarter of a degree per cell); the page scatters fine particles over it.
await step("land", async () => {
  const rings = lines(await getJson(NE + "ne_50m_land.geojson"));
  const W = 1440, H = 720, bits = new Uint8Array((W * H) / 8);
  for (let j = 0; j < H; j++) {
    const lat = 90 - (j + 0.5) * (180 / H), xs = [];
    for (const ring of rings) for (let i = 0; i < ring.length - 1; i++) {
      const [x1, y1] = ring[i], [x2, y2] = ring[i + 1];
      if ((y1 > lat) !== (y2 > lat)) xs.push(x1 + ((lat - y1) / (y2 - y1)) * (x2 - x1));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const a = Math.max(0, Math.ceil((xs[k] + 180) / (360 / W) - 0.5)), b = Math.min(W - 1, Math.floor((xs[k + 1] + 180) / (360 / W) - 0.5));
      for (let i = a; i <= b; i++) { const n = j * W + i; bits[n >> 3] |= 128 >> (n & 7); }
    }
  }
  return { land: { w: W, h: H, b64: Buffer.from(bits).toString("base64") } };
});

await step("coast", async () => ({ coast: lines(await getJson(NE + "ne_110m_coastline.geojson")).map((l) => thin(l, 0.3)).filter((l) => l.length >= 4) }));

await step("ports", async () => ({
  ports: (await getJson(NE + "ne_10m_ports.geojson")).features.filter((f) => f.geometry)
    .map((f) => [r2(f.geometry.coordinates[0]), r2(f.geometry.coordinates[1]), String(f.properties.name || "Port").slice(0, 40)]),
}));

await step("rails", async () => {
  const rails = lines(await getJson(NE + "ne_10m_railroads.geojson", 240000)).map((l) => thin(l, 0.12)).filter((l) => l.length >= 4);
  if (!rails.length) throw new Error("no railway lines");
  return { rails };
});

// Major roads (motorways and main highways). Live traffic counts come separately, in the page, where an open feed exists.
await step("roads", async () => {
  const geo = await getJson(NE + "ne_10m_roads.geojson", 300000);
  geo.features = geo.features.filter((f) => /Major Highway|Beltway|Bypass/.test(f.properties.type || "") && (f.properties.scalerank ?? 9) <= 5);
  const roads = lines(geo).map((l) => thin(l, 0.14)).filter((l) => l.length >= 4);
  if (!roads.length) throw new Error("no roads");
  return { roads };
});

// A small CSV reader (quoted fields, doubled quotes).
function csv(text) {
  const rows = [];
  let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else if (c !== "\r") cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

await step("air", async () => {
  const rows = csv(await getText("https://davidmegginson.github.io/ourairports-data/airports.csv"));
  const h = rows[0], col = (n) => h.indexOf(n);
  const [T, N, LA, LO, C, M, S, I] = ["type", "name", "latitude_deg", "longitude_deg", "iso_country", "municipality", "scheduled_service", "iata_code"].map(col);
  const big = rows.slice(1).filter((r) => r[T] === "large_airport" && r[I] && r[S] === "yes");
  if (big.length < 100) throw new Error("airport list looks wrong");
  const airports = big.map((r) => [r2(+r[LO]), r2(+r[LA]), r[I], r[N].slice(0, 48), `${r[M] || ""}${r[M] ? ", " : ""}${r[C]}`.slice(0, 40)]);
  const idx = new Map(airports.map((a, i) => [a[2], i]));
  // Routes between those airports; the weight is how many airlines flew the pair.
  let routes = [];
  try {
    const pair = new Map();
    for (const line of (await getText("https://raw.githubusercontent.com/jpatokal/openflights/master/data/routes.dat")).split("\n")) {
      const f = line.split(","), a = idx.get(f[2]), b = idx.get(f[4]);
      if (a == null || b == null || a === b) continue;
      const k = a < b ? `${a},${b}` : `${b},${a}`;
      pair.set(k, (pair.get(k) || 0) + 1);
    }
    routes = [...pair].sort((x, y) => y[1] - x[1]).slice(0, 1600).map(([k, w]) => [...k.split(",").map(Number), w]);
  } catch (e) { console.log("routes: " + e.message); routes = old.routes || []; }
  return { airports, routes };
});

const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"];
async function overpass(query) {
  let last;
  for (const url of OVERPASS) {
    try {
      const r = await fetch(url, { method: "POST", headers: { ...UA, "Content-Type": "application/x-www-form-urlencoded" }, body: "data=" + encodeURIComponent(query), signal: AbortSignal.timeout(300000) });
      if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
      const j = await r.json();
      if (!j.elements?.length) throw new Error("no results from " + url);
      return j.elements;
    } catch (e) { last = e; console.log("overpass: " + e.message); }
  }
  throw last;
}

await step("dcs", async () => {
  const els = await overpass('[out:json][timeout:240];nwr["telecom"="data_center"];out center tags;');
  const dcs = els.map((e) => {
    const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon;
    return lat == null ? null : [Math.round(lon * 1000) / 1000, Math.round(lat * 1000) / 1000, String(e.tags?.name || "").slice(0, 48), String(e.tags?.operator || "").slice(0, 32)];
  }).filter(Boolean);
  if (dcs.length < 200) throw new Error("data centre list looks too short");
  return { dcs };
});

// Military sites as OpenStreetMap has them: [lon*100, lat*100, kind, name]; kind 0 base, 1 airfield, 2 naval base,
// 3 barracks, 4 range or training area. One site is often mapped as several nested pieces, so only one entry is kept
// per 0.05-degree cell (about 5 km), the most important kind first. It is what volunteers have mapped, not a full list.
await step("bases", async () => {
  const KIND = { base: 0, airfield: 1, naval_base: 2, barracks: 3, range: 4, training_area: 4 }, RANK = [0, 0, 0, 1, 2];
  const els = await overpass('[out:json][timeout:280];nwr["military"~"^(base|airfield|naval_base|barracks|range|training_area)$"];out center tags;');
  const cells = new Map();
  for (const e of els) {
    const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon, kind = KIND[e.tags?.military]; if (lat == null || kind == null) continue;
    const name = String(e.tags["name:en"] || e.tags.name || "").slice(0, 44), key = Math.round(lon * 20) + "," + Math.round(lat * 20), had = cells.get(key);
    if (!had || RANK[kind] < RANK[had[2]] || (RANK[kind] === RANK[had[2]] && name && !had[3])) cells.set(key, [Math.round(lon * 100), Math.round(lat * 100), kind, name]);
  }
  const bases = [...cells.values()];
  if (bases.length < 2000) throw new Error("military site list looks too short");
  console.log(`bases: ${bases.length} sites from ${els.length} mapped pieces`);
  return { bases };
});

await step("cables", async () => {
  const els = await overpass('[out:json][timeout:280];(way["communication"="line"];way["telecom"="cable"]["location"="underwater"];way["seamark:type"="cable_submarine"]["seamark:cable_submarine:category"~"fibre|telephone"];);out geom tags;');
  const cables = els.filter((e) => e.geometry?.length > 1 && e.tags?.power == null)
    .map((e) => ({ n: String(e.tags?.name || e.tags?.ref || "").slice(0, 48), p: thin(e.geometry.map((g) => [g.lon, g.lat]), 0.06) }))
    .filter((c) => c.p.length >= 4);
  if (cables.length < 50) throw new Error("cable list looks too short");
  return { cables };
});

// Births and deaths: nobody publishes these one by one, so the page models them from real rates. For every country:
// population x birth (death) rate per 1,000 per year (World Bank, newest year), spread over its cities by size
// (Natural Earth populated places). Saved per place as births and deaths per day.
await step("vital", async () => {
  const wb = async (ind) => {
    const j = await getJson(`https://api.worldbank.org/v2/country/all/indicator/${ind}?format=json&mrnev=1&per_page=400`);
    return new Map(j[1].filter((r) => r.value != null && r.countryiso3code).map((r) => [r.countryiso3code, r.value]));
  };
  const [pop, cbr, cdr] = [await wb("SP.POP.TOTL"), await wb("SP.DYN.CBRT.IN"), await wb("SP.DYN.CDRT.IN")];
  const meta = (await getJson("https://api.worldbank.org/v2/country?format=json&per_page=400"))[1].filter((c) => c.region?.id !== "NA" && c.longitude);
  const places = (await getJson(NE + "ne_10m_populated_places_simple.geojson")).features
    .map((f) => ({ iso: f.properties.adm0_a3, pop: f.properties.pop_max || 0, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }))
    .filter((c) => c.pop >= 100000);
  const vital = [];
  for (const c of meta) {
    const p = pop.get(c.id), b = cbr.get(c.id), d = cdr.get(c.id);
    if (!p || b == null || d == null) continue;
    let cities = places.filter((x) => x.iso === c.id).sort((x, y) => y.pop - x.pop).slice(0, 40);
    if (!cities.length) cities = [{ lon: +c.longitude, lat: +c.latitude, pop: 1 }];
    const sum = cities.reduce((n, x) => n + x.pop, 0);
    for (const x of cities) vital.push([r2(x.lon), r2(x.lat), Math.round((p * b / 1000 / 365.25) * (x.pop / sum)), Math.round((p * d / 1000 / 365.25) * (x.pop / sum))]);
  }
  if (vital.length < 150) throw new Error("births and deaths list looks too short");
  return { vital };
});

// Population: every town and city of 15,000+ people (GeoNames), added up in half-degree cells.
// Saved per cell as [lon, lat (people-weighted centre), people in thousands].
await step("pop", async () => {
  const r = await fetch("https://download.geonames.org/export/dump/cities15000.zip", { headers: UA, signal: AbortSignal.timeout(120000) });
  if (!r.ok) throw new Error("GeoNames HTTP " + r.status);
  writeFileSync("/tmp/cities15000.zip", Buffer.from(await r.arrayBuffer()));
  const text = execSync("unzip -p /tmp/cities15000.zip cities15000.txt", { maxBuffer: 64 << 20 }).toString("utf8");
  const cells = new Map();
  for (const line of text.split("\n")) {
    const f = line.split("\t"), lat = +f[4], lon = +f[5], n = +f[14];
    if (!(n > 0) || !Number.isFinite(lat)) continue;
    const k = Math.floor(lon * 2) + "," + Math.floor(lat * 2), c = cells.get(k) || { n: 0, x: 0, y: 0 };
    c.n += n; c.x += lon * n; c.y += lat * n; cells.set(k, c);
  }
  const pop = [...cells.values()].map((c) => [r2(c.x / c.n), r2(c.y / c.n), Math.round(c.n / 1000)]).filter((c) => c[2] >= 15);
  if (pop.length < 2000) throw new Error("population list looks too short");
  return { pop };
});

// Power stations of 30 MW and more: [lon, lat, MW, fuel number, name (only for 1,000 MW and more)].
export const FUELS = ["Solar", "Wind", "Hydro", "Nuclear", "Gas", "Coal", "Oil", "Biomass", "Geothermal", "Other"];
await step("power", async () => {
  const rows = csv(await getText("https://raw.githubusercontent.com/wri/global-power-plant-database/master/output_database/global_power_plant_database.csv", 240000));
  const h = rows[0], [N, MW, LA, LO, F] = ["name", "capacity_mw", "latitude", "longitude", "primary_fuel"].map((n) => h.indexOf(n));
  const power = rows.slice(1).filter((r) => +r[MW] >= 30 && Number.isFinite(+r[LA]) && r[LA] !== "")
    .map((r) => { const f = FUELS.indexOf(r[F] === "Waste" ? "Biomass" : r[F]); return [r2(+r[LO]), r2(+r[LA]), Math.round(+r[MW]), f < 0 ? 9 : f, +r[MW] >= 1000 ? r[N].slice(0, 40) : ""]; });
  if (power.length < 3000) throw new Error("power station list looks too short");
  return { power };
});

mkdirSync("data/globe", { recursive: true });
const json = JSON.stringify(out);
writeFileSync(OUT, json + "\n");
console.log(`${OUT} written (${(json.length / 1e6).toFixed(2)} MB): ` + Object.entries(out).filter(([, v]) => Array.isArray(v)).map(([k, v]) => `${k} ${v.length}`).join(", "));
