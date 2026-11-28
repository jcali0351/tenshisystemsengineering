// World Pulse globe: a snapshot of the aircraft in the air, for the page to draw. Writes <out>/planes.json.
// adsb.lol (community receivers, open data) answers ordinary programs but not web pages (it sends no cross-origin
// header), so a browser cannot ask it directly. This asks on the page's behalf every few minutes from GitHub Actions
// (.github/workflows/globe-live.yml), which publishes the file on the history-free `globe-live` branch; the page reads
// it from raw.githubusercontent.com and carries each aircraft forward along its course.
// Each request covers 250 nautical miles around a point; POINTS are the world's busy airspaces, so the result is a
// large sample of air traffic, not every flight. One row per aircraft:
//   [longitude, latitude, course in degrees, ground speed in knots, altitude in feet, flight or registration, type, seconds before `at` it was seen]
import { writeFileSync, mkdirSync } from "node:fs";

const out = process.argv[2] || "/tmp/live";
const POINTS = [[40.7, -74], [41.9, -87.6], [33.7, -84.4], [32.9, -97], [39.8, -104.7], [34, -118.3], [37.6, -122.3], [47.5, -122.3], [25.8, -80.3], [43.7, -79.6], [19.4, -99.1], [-23.5, -46.6], [4.7, -74.1], [51.5, -0.3], [49, 2.5], [50, 8.6], [40.5, -3.6], [41.8, 12.3], [41.2, 28.8], [25.2, 55.4], [25.3, 51.6], [28.6, 77.1], [19.1, 72.9], [1.4, 104], [13.7, 100.7], [22.3, 113.9], [31.1, 121.8], [40.1, 116.6], [35.6, 139.8], [37.5, 126.4], [-33.9, 151.2], [-26.1, 28.2], [30.1, 31.4], [52.3, 4.8], [55.6, 12.6], [59.6, 17.9],
  [29.9, -95.3], [33.4, -112], [44.9, -93.2], [45.5, -73.7], [49.2, -123.2], [61.2, -150], [21.3, -157.9], [9, -79.4], [-12, -77.1], [-33.4, -70.8], [-34.8, -58.5], [53.4, -6.3], [38.8, -9.1], [48.1, 16.6], [52.2, 21], [37.9, 23.9], [24.9, 46.7], [6.6, 3.3], [-1.3, 36.9], [9, 38.8], [13, 80.2], [3.1, 101.6], [-6.1, 106.7], [14.5, 121], [25.1, 121.2], [-37.7, 144.8], [-37, 174.8],
  // the ocean crossings and gaps between the hubs
  [52, -30], [48, -45], [56, -18], [36, -40], [45, -150], [30, -140], [50, 170], [20, 140], [10, 60], [-10, 80], [-20, -30], [60, 60], [55, 90], [45, 60], [35, 45], [20, -70], [0, -50], [65, -20], [-30, 115], [15, -20]];
const seen = new Map(); let ok = 0, i = 0;
const worker = async () => {
  while (i < POINTS.length) {
    const [lat, lon] = POINTS[i++];
    try {
      const r = await fetch(`https://api.adsb.lol/v2/lat/${lat}/lon/${lon}/dist/250`, { headers: { "User-Agent": "TenshiWorldPulse/1.0 (https://tenshisystems.com)" }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) { console.log(`${lat},${lon}: HTTP ${r.status}`); continue; }
      const j = await r.json(), t = Date.now(); ok++;
      for (const a of j.ac || []) {
        if (a.lat == null || a.lon == null || typeof a.alt_baro !== "number" || !(a.gs > 40) || (a.seen_pos || 0) > 40) continue;   // on the ground or stale
        seen.set(a.hex, { t: t - (a.seen_pos || 0) * 1000, row: [Math.round(a.lon * 1000) / 1000, Math.round(a.lat * 1000) / 1000, Math.round(a.track || 0), Math.round(a.gs), Math.round(a.alt_baro / 25) * 25, (a.flight || "").trim() || a.r || "", a.t || ""] });
      }
    } catch (e) { console.log(`${lat},${lon}: ${e.message}`); }
    await new Promise((res) => setTimeout(res, 250));
  }
};
await Promise.all([worker(), worker(), worker()]);
if (ok < POINTS.length / 2 || seen.size < 500) { console.log(`only ${ok} of ${POINTS.length} requests answered, ${seen.size} aircraft: not publishing`); process.exit(1); }
const at = Date.now();
mkdirSync(out, { recursive: true });
writeFileSync(`${out}/planes.json`, JSON.stringify({ at: new Date(at).toISOString(), source: "adsb.lol", points: POINTS.length, ac: [...seen.values()].map((x) => [...x.row, Math.round((at - x.t) / 1000)]) }));
console.log(`planes.json: ${seen.size} aircraft from ${ok} of ${POINTS.length} requests`);
