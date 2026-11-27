// World Pulse globe: wind near the ground, the jet stream and air temperature, from NOAA's GFS weather model
// (US government work, public domain). Writes data/globe/weather.json: five 1-degree grids of the whole Earth
// (360 x 181, north to south, starting at longitude 0), each packed as base64 bytes:
//   w10u, w10v  wind 10 m above ground, east and north parts, signed bytes in steps of 0.5 m/s
//   ju, jv      wind at 250 hPa (about 10 km up, where the jet stream blows), signed bytes in steps of 1 m/s
//   t           air temperature 2 m above ground, unsigned bytes: (deg C + 80) * 2
// The page draws them itself (viz/world-pulse.js, buildWeather). Runs from .github/workflows/globe-data.yml; skips
// when the saved file is under 2.5 hours old. GFS files are in GRIB2 format, read here with ECMWF's ecCodes tools
// (grib_get_data), which this script installs on the GitHub runner if they are missing.
import { writeFileSync, mkdirSync, existsSync, readFileSync, rmSync } from "node:fs";
import { execFileSync, execSync } from "node:child_process";

const OUT = "data/globe/weather.json", TMP = "/tmp/gfs.grib2", W = 360, H = 181;
if (existsSync(OUT)) {
  const age = (Date.now() - Date.parse(JSON.parse(readFileSync(OUT, "utf8")).updatedAt)) / 3600000;
  if (age < 2.5 && !process.argv.includes("--force")) { console.log(`weather.json is ${age.toFixed(1)} h old; skipping.`); process.exit(0); }
}
const keep = (why) => { console.log(why + "; keeping the last saved copy."); process.exit(0); };

// GFS runs start at 00, 06, 12 and 18 UTC and take about four hours to publish. Take the newest run that is up, and
// from it the forecast step (every 3 hours) closest to the present moment.
const SOURCES = ["https://noaa-gfs-bdp-pds.s3.amazonaws.com", "https://nomads.ncep.noaa.gov/pub/data/nccf/com/gfs/prod"];
const pad = (n, w = 2) => String(n).padStart(w, "0");
let got = null;
search: for (let back = 0; back < 5; back++) {
  const run = new Date(Math.floor(Date.now() / 21600000) * 21600000 - back * 21600000);
  const step = Math.min(120, Math.max(0, Math.round((Date.now() - run) / 10800000) * 3));
  const ymd = run.toISOString().slice(0, 10).replace(/-/g, ""), hh = pad(run.getUTCHours());
  for (const base of SOURCES) {
    const url = `${base}/gfs.${ymd}/${hh}/atmos/gfs.t${hh}z.pgrb2.1p00.f${pad(step, 3)}`;
    try {
      const r = await fetch(url, { headers: { "User-Agent": "TenshiWorldPulse/1.0 (https://tenshisystems.com)" }, signal: AbortSignal.timeout(180000) });
      if (!r.ok) { console.log(`${url}: HTTP ${r.status}`); continue; }
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 1e6) { console.log(`${url}: only ${buf.length} bytes`); continue; }
      writeFileSync(TMP, buf); got = { run, valid: new Date(+run + step * 3600000), url }; console.log(`fetched ${url} (${(buf.length / 1e6).toFixed(1)} MB)`);
      break search;
    } catch (e) { console.log(`${url}: ${e.message}`); }
  }
}
if (!got) keep("no GFS file could be fetched");

try { execFileSync("grib_get_data", ["-V"], { stdio: "ignore" }); }
catch (e) {
  try { execSync("sudo apt-get update -qq && sudo apt-get install -y -qq libeccodes-tools", { stdio: "inherit", timeout: 300000 }); }
  catch (e2) { keep("ecCodes tools could not be installed"); }
}

// One field as a 360 x 181 grid of numbers. grib_get_data prints "latitude longitude value" lines.
function field(where) {
  const text = execFileSync("grib_get_data", ["-w", where, TMP], { encoding: "utf8", maxBuffer: 1 << 28 });
  const g = new Float32Array(W * H).fill(NaN); let n = 0;
  for (const line of text.split("\n")) {
    const p = line.trim().split(/\s+/); if (p.length < 3) continue;
    const lat = +p[0], lon = +p[1], v = +p[2]; if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(v)) continue;
    const row = Math.round(90 - lat), col = ((Math.round(lon) % 360) + 360) % 360; if (row < 0 || row >= H) continue;
    if (Number.isNaN(g[row * W + col])) n++; g[row * W + col] = v;
  }
  if (n < W * H * 0.99) throw new Error(`${where}: only ${n} of ${W * H} grid points found`);
  return g;
}
let u10, v10, uj, vj, t2;
try {
  u10 = field("shortName=10u"); v10 = field("shortName=10v"); t2 = field("shortName=2t");
  uj = field("shortName=u,typeOfLevel=isobaricInhPa,level=250"); vj = field("shortName=v,typeOfLevel=isobaricInhPa,level=250");
} catch (e) { keep("could not read the GFS file (" + e.message.split("\n")[0] + ")"); }
finally { rmSync(TMP, { force: true }); }

const b64 = (arr) => Buffer.from(arr.buffer).toString("base64");
const signed = (g, scale) => Int8Array.from(g, (v) => Math.max(-127, Math.min(127, Math.round((Number.isNaN(v) ? 0 : v) * scale))));
const temp = Uint8Array.from(t2, (k) => Math.max(0, Math.min(255, Math.round(((Number.isNaN(k) ? 288 : k) - 273.15 + 80) * 2))));
// sanity: temperatures must look like Earth's (kelvin in, roughly -90..60 deg C), or the file was not what we expected
let lo = Infinity, hi = -Infinity; for (const k of t2) { if (k < lo) lo = k; if (k > hi) hi = k; }
if (!(lo > 170 && hi < 340)) keep(`temperature range ${lo}..${hi} K looks wrong`);

mkdirSync("data/globe", { recursive: true });
writeFileSync(OUT, JSON.stringify({ updatedAt: new Date().toISOString(), source: "NOAA GFS 1.0 degree", run: got.run.toISOString(), valid: got.valid.toISOString(), w: W, h: H,
  w10u: b64(signed(u10, 2)), w10v: b64(signed(v10, 2)), ju: b64(signed(uj, 1)), jv: b64(signed(vj, 1)), t: b64(temp) }) + "\n");
console.log(`${OUT} written: GFS run ${got.run.toISOString()}, valid ${got.valid.toISOString()}, ${(lo - 273.15).toFixed(0)}..${(hi - 273.15).toFixed(0)} deg C`);
