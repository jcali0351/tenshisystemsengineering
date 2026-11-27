// World Pulse globe: the sea. Writes data/globe/ocean.json with four independent parts; a part that fails keeps what the
// last run saved. All four sources are US government data (public domain).
//   waves    NOAA GFS-Wave model: significant wave height, primary wave period and direction, on the 1-degree grid the
//            weather file uses (360 x 181, north to south, from longitude 0). Bytes: hs = metres * 10 (255 = land),
//            tp = seconds * 10, dir = degrees / 2 (the direction the waves come FROM). Every 5.5 hours.
//   currents NOAA CoastWatch near-real-time geostrophic surface currents (from satellite sea-level measurements),
//            same grid, signed bytes in steps of 0.02 m/s (0 on land and where there is no data). Every 5.5 hours.
//   tides    NOAA CO-OPS tide predictions (times and heights of high and low water) for every US water-level station,
//            four days from yesterday; the page works out the level at any moment between them. Every 5.5 hours.
//   buoys    NOAA NDBC latest observations: wave height, period, direction and water temperature. Every run.
// Runs from .github/workflows/globe-data.yml. `--force` refreshes every part.
import { writeFileSync, mkdirSync, existsSync, readFileSync, rmSync } from "node:fs";
import { execFileSync, execSync } from "node:child_process";

const OUT = "data/globe/ocean.json", TMP = "/tmp/gfswave.grib2", W = 360, H = 181;
const UA = { "User-Agent": "TenshiWorldPulse/1.0 (https://tenshisystems.com)" };
const force = process.argv.includes("--force");
const old = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};
const out = { ...old, updatedAt: new Date().toISOString(), source: "NOAA GFS-Wave, CoastWatch, CO-OPS, NDBC" };
const pad = (n, w = 2) => String(n).padStart(w, "0");
const b64 = (arr) => Buffer.from(arr.buffer).toString("base64");
const getText = async (url, ms = 120000) => { const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(ms) }); if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`); return r.text(); };

async function part(key, hours, fn) {
  const age = old[key]?.at ? (Date.now() - Date.parse(old[key].at)) / 3600000 : Infinity;
  if (!force && age < hours) { console.log(`${key}: ${age.toFixed(1)} h old; skipping`); return; }
  try { out[key] = { at: out.updatedAt, ...(await fn()) }; console.log(`${key}: ok`); }
  catch (e) { console.log(`${key}: ${String(e.message).split("\n")[0]}; keeping the last saved copy`); }
}

/* ---------- waves ---------- */
await part("waves", 5.5, async () => {
  // the newest GFS run that is published, and from it the 3-hourly step closest to now
  let got = null;
  search: for (let back = 0; back < 5; back++) {
    const run = new Date(Math.floor(Date.now() / 21600000) * 21600000 - back * 21600000);
    const step = Math.min(120, Math.max(0, Math.round((Date.now() - run) / 10800000) * 3));
    const ymd = run.toISOString().slice(0, 10).replace(/-/g, ""), hh = pad(run.getUTCHours());
    for (const base of ["https://noaa-gfs-bdp-pds.s3.amazonaws.com", "https://nomads.ncep.noaa.gov/pub/data/nccf/com/gfs/prod"]) {
      const url = `${base}/gfs.${ymd}/${hh}/wave/gridded/gfswave.t${hh}z.global.0p25.f${pad(step, 3)}.grib2`;
      try {
        const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(180000) });
        if (!r.ok) { console.log(`${url}: HTTP ${r.status}`); continue; }
        const buf = Buffer.from(await r.arrayBuffer()); if (buf.length < 5e5) { console.log(`${url}: only ${buf.length} bytes`); continue; }
        writeFileSync(TMP, buf); got = { run, valid: new Date(+run + step * 3600000) }; console.log(`fetched ${url} (${(buf.length / 1e6).toFixed(1)} MB)`);
        break search;
      } catch (e) { console.log(`${url}: ${e.message}`); }
    }
  }
  if (!got) throw new Error("no GFS-Wave file could be fetched");
  try { execFileSync("grib_get_data", ["-V"], { stdio: "ignore" }); }
  catch (e) { execSync("sudo apt-get update -qq && sudo apt-get install -y -qq libeccodes-tools", { stdio: "inherit", timeout: 300000 }); }
  // One field on the 1-degree grid: the file is 0.25 degree, so only whole-degree points are kept. Land has no value.
  const field = (num) => {
    const text = execFileSync("grib_get_data", ["-w", `discipline=10,parameterCategory=0,parameterNumber=${num}`, TMP], { encoding: "utf8", maxBuffer: 1 << 29 });
    const g = new Float32Array(W * H).fill(NaN); let n = 0;
    for (const line of text.split("\n")) {
      const p = line.trim().split(/\s+/); if (p.length < 3) continue;
      const lat = +p[0], lon = +p[1], v = +p[2]; if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(v) || v > 9000) continue;
      if (Math.abs(lat - Math.round(lat)) > 0.01 || Math.abs(lon - Math.round(lon)) > 0.01) continue;
      const row = Math.round(90 - lat), col = ((Math.round(lon) % 360) + 360) % 360; if (row < 0 || row >= H) continue;
      if (Number.isNaN(g[row * W + col])) n++; g[row * W + col] = v;
    }
    if (n < 20000) throw new Error(`wave field ${num}: only ${n} sea points found`);
    return g;
  };
  let hs, tp, dir;
  try { hs = field(3); tp = field(11); dir = field(10); } finally { rmSync(TMP, { force: true }); }   // HTSGW, PERPW, DIRPW
  let top = 0; for (const v of hs) if (v > top) top = v;
  if (!(top > 1 && top < 30)) throw new Error(`tallest wave ${top} m looks wrong`);
  console.log(`waves: run ${got.run.toISOString()}, valid ${got.valid.toISOString()}, tallest ${top.toFixed(1)} m`);
  return { run: got.run.toISOString(), valid: got.valid.toISOString(),
    hs: b64(Uint8Array.from(hs, (v) => Number.isNaN(v) ? 255 : Math.min(254, Math.round(v * 10)))),
    tp: b64(Uint8Array.from(tp, (v) => Number.isNaN(v) ? 0 : Math.min(250, Math.round(v * 10)))),
    dir: b64(Uint8Array.from(dir, (v) => Number.isNaN(v) ? 0 : Math.round((((v % 360) + 360) % 360) / 2) % 180)) };
});

/* ---------- currents ---------- */
await part("currents", 5.5, async () => {
  // Two NOAA ERDDAP servers carry near-real-time geostrophic currents on a 0.25-degree grid; take whichever is newer.
  const SETS = [["https://coastwatch.noaa.gov/erddap/griddap/noaacwBLENDEDNRTcurrentsDaily", "u_current", "v_current"], ["https://coastwatch.pfeg.noaa.gov/erddap/griddap/nesdisSSH1day", "ugos", "vgos"]];
  let best = null;
  for (const [base, un, vn] of SETS) {
    try {
      const sub = "%5B(last)%5D%5B0:4:719%5D%5B0:4:1439%5D", text = await getText(`${base}.csv?${un}${sub},${vn}${sub}`, 240000);
      const u = new Float32Array(W * H), v = new Float32Array(W * H); let n = 0, date = "";
      for (const line of text.split("\n").slice(2)) {
        const p = line.split(","); if (p.length < 5) continue;
        const lat = +p[1], lon = +p[2], a = +p[3], b = +p[4]; if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(a) || !Number.isFinite(b)) continue;
        const row = Math.round(90 - lat), col = ((Math.round(lon) % 360) + 360) % 360; if (row < 0 || row >= H) continue;
        u[row * W + col] = a; v[row * W + col] = b; n++; date = p[0];
      }
      console.log(`${base}: ${n} sea points, ${date}`);
      if (n < 15000) continue;
      if (!best || Date.parse(date) > Date.parse(best.date)) best = { u, v, date };
    } catch (e) { console.log(`${base}: ${String(e.message).split("\n")[0]}`); }
  }
  if (!best) throw new Error("no currents data could be fetched");
  const pack = (g) => Int8Array.from(g, (x) => Math.max(-127, Math.min(127, Math.round(x / 0.02))));
  return { date: best.date, u: b64(pack(best.u)), v: b64(pack(best.v)) };
});

/* ---------- tides ---------- */
await part("tides", 5.5, async () => {
  const list = JSON.parse(await getText("https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=waterlevels")).stations || [];
  const begin = new Date(Date.now() - 86400000).toISOString().slice(0, 10).replace(/-/g, ""), stations = [];
  let i = 0;
  const worker = async () => {
    while (i < list.length) {
      const s = list[i++];
      try {
        const j = JSON.parse(await getText(`https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?product=predictions&application=TenshiWorldPulse&begin_date=${begin}&range=96&datum=MLLW&station=${s.id}&time_zone=gmt&units=metric&interval=hilo&format=json`, 30000));
        const ev = (j.predictions || []).map((p) => [Math.round(Date.parse(p.t.replace(" ", "T") + ":00Z") / 60000), Math.round(+p.v * 100), p.type === "H" ? 1 : 0]).filter((e) => Number.isFinite(e[0]) && Number.isFinite(e[1]));
        if (ev.length >= 4) stations.push([Math.round(s.lng * 100) / 100, Math.round(s.lat * 100) / 100, String(s.name || "").slice(0, 40) + (s.state ? ", " + s.state : ""), ev.flat()]);
      } catch (e) { /* stations without tide predictions (the Great Lakes) answer with an error */ }
    }
  };
  await Promise.all([1, 2, 3, 4, 5, 6].map(worker));
  if (stations.length < 50) throw new Error(`only ${stations.length} tide stations answered`);
  console.log(`tides: ${stations.length} of ${list.length} stations`);
  return { stations };   // each: [lon, lat, name, [minutes since 1970, height in cm above low-water datum, 1 high / 0 low, ...]]
});

/* ---------- buoys ---------- */
await part("buoys", 0.3, async () => {
  const lines = (await getText("https://www.ndbc.noaa.gov/data/latest_obs/latest_obs.txt")).split("\n");
  const head = lines[0].replace(/^#/, "").trim().split(/\s+/), ix = (k) => head.indexOf(k), need = ["STN", "LAT", "LON", "YYYY", "MM", "DD", "hh", "mm", "WVHT"];
  for (const k of need) if (ix(k) < 0) throw new Error("buoy file layout changed: no " + k + " column");
  const num = (p, k) => { const i = ix(k), x = i < 0 ? NaN : +p[i]; return Number.isFinite(x) ? x : null; }, buoys = [];
  for (const line of lines.slice(1)) {
    if (!line || line[0] === "#") continue;
    const p = line.trim().split(/\s+/), h = num(p, "WVHT"), lat = num(p, "LAT"), lon = num(p, "LON"); if (h == null || lat == null || lon == null) continue;
    const t = Date.UTC(+p[ix("YYYY")], +p[ix("MM")] - 1, +p[ix("DD")], +p[ix("hh")], +p[ix("mm")]); if (!(Date.now() - t < 4 * 3600000)) continue;
    buoys.push([Math.round(lon * 100) / 100, Math.round(lat * 100) / 100, p[ix("STN")], h, num(p, "DPD"), num(p, "MWD"), num(p, "WTMP"), Math.round(t / 60000)]);
  }
  if (buoys.length < 30) throw new Error(`only ${buoys.length} buoys reported waves`);
  console.log(`buoys: ${buoys.length} reporting waves`);
  return { buoys };   // each: [lon, lat, id, wave height m, dominant period s, direction from (degrees), water temperature C, minutes since 1970]
});

mkdirSync("data/globe", { recursive: true });
writeFileSync(OUT, JSON.stringify(out) + "\n");
console.log(`${OUT} written`);
