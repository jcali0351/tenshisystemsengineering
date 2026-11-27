// World Pulse globe: orbits of every active satellite, from CelesTrak's public element sets.
// Writes data/globe/sats.json: [name, revolutions per day, eccentricity, inclination, node, perigee, anomaly (degrees), epoch ms].
// The page moves each satellite along its orbit itself. Runs from .github/workflows/globe-data.yml; skips when the saved
// file is under 5.5 hours old (CelesTrak asks not to be polled more often than its data changes).
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";

const OUT = "data/globe/sats.json";
if (existsSync(OUT)) {
  const age = (Date.now() - Date.parse(JSON.parse(readFileSync(OUT, "utf8")).updatedAt)) / 3600000;
  if (age < 5.5 && !process.argv.includes("--force")) { console.log(`sats.json is ${age.toFixed(1)} h old; skipping.`); process.exit(0); }
}
const r = await fetch("https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json", { headers: { "User-Agent": "TenshiWorldPulse/1.0 (https://tenshisystems.com)" }, signal: AbortSignal.timeout(120000) });
if (!r.ok) { console.log("CelesTrak HTTP " + r.status + "; keeping the last saved copy."); process.exit(0); }
const list = await r.json();
const f = (n, d) => +(+n).toFixed(d);
const sats = list.filter((s) => s.MEAN_MOTION > 0 && s.EPOCH).map((s) => [String(s.OBJECT_NAME || "").slice(0, 24), f(s.MEAN_MOTION, 6), f(s.ECCENTRICITY, 5), f(s.INCLINATION, 3), f(s.RA_OF_ASC_NODE, 3), f(s.ARG_OF_PERICENTER, 3), f(s.MEAN_ANOMALY, 3), Date.parse(s.EPOCH + "Z")]);
if (sats.length < 1000) { console.log("satellite list looks too short; keeping the last saved copy."); process.exit(0); }
mkdirSync("data/globe", { recursive: true });
writeFileSync(OUT, JSON.stringify({ updatedAt: new Date().toISOString(), source: "CelesTrak", sats }) + "\n");
console.log(`${OUT} written: ${sats.length} satellites`);
