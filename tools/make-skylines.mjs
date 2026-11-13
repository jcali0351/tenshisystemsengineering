// Draws the five skyline slides, the blueprint overlay and the mechanical line art as SVG.
// Usage (from the repository folder): node tools/make-skylines.mjs img
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const OUT = process.argv[2];
mkdirSync(join(OUT, "skylines"), { recursive: true });

const W = 1600, H = 800;
const f = (n) => Math.round(n * 10) / 10;

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const C = {
  far: "#dbe3ec", mid1: "#d3dde8", mid2: "#bfcddb", near1: "#c6d3e0", near2: "#9fb2c6",
  line: "#9aabbd", white: "#f6f8fa", red: "#d9817c", roof: "#7f8d9b", green: "#94aaa4",
};

const DEFS = `<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eef3f8"/><stop offset=".65" stop-color="#f7f9fb"/><stop offset="1" stop-color="#ffffff"/></linearGradient>
<linearGradient id="gMid" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${C.mid1}"/><stop offset="1" stop-color="${C.mid2}"/></linearGradient>
<linearGradient id="gNear" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${C.near1}"/><stop offset=".55" stop-color="#b3c4d5"/><stop offset="1" stop-color="${C.near2}"/></linearGradient>
<linearGradient id="gSheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".25"/></linearGradient>
<linearGradient id="gWater" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d4dfe9"/><stop offset="1" stop-color="#eef3f7"/></linearGradient>
<radialGradient id="gCloud"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
<pattern id="win" width="12" height="9" patternUnits="userSpaceOnUse"><path d="M0 8.5H12M11.5 0V9" stroke="#fff" stroke-opacity=".45" stroke-width="1"/></pattern>
<pattern id="winD" width="16" height="10" patternUnits="userSpaceOnUse"><path d="M0 9.5H16M15.5 0V10" stroke="#7d91a6" stroke-opacity=".28" stroke-width="1"/></pattern>
</defs>`;

function clouds(r) {
  let s = "";
  for (let i = 0; i < 7; i++) {
    const x = r() * W, y = 60 + r() * 220, rx = 140 + r() * 260, ry = 26 + r() * 40;
    s += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="url(#gCloud)"/>`;
  }
  return s;
}

function ridge(base, amp, color, seed, peak = 0) {
  const r = rng(seed);
  const a = [r() * 6, r() * 6, r() * 6];
  let d = `M0 ${base}`;
  for (let x = 0; x <= W; x += 20) {
    const y = base - amp * (0.55 + 0.25 * Math.sin(x / 210 + a[0]) + 0.15 * Math.sin(x / 90 + a[1]) + 0.08 * Math.sin(x / 37 + a[2]));
    d += ` L${x} ${f(y)}`;
  }
  return `<path d="${d} L${W} ${H} L0 ${H}Z" fill="${color}"/>`;
}

function tower(x, w, h, base, layer, r) {
  const y = base - h;
  const fill = layer === "far" ? C.far : layer === "mid" ? "url(#gMid)" : "url(#gNear)";
  let s = `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${fill}"/>`;
  if (layer !== "far") {
    s += `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="url(#${r() < 0.5 ? "win" : "winD"})"/>`;
    if (layer === "near") s += `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="url(#gSheen)"/>`;
  }
  const roof = r();
  const col = layer === "far" ? C.far : layer === "mid" ? C.mid2 : C.near2;
  if (roof < 0.25) s += `<rect x="${f(x + w * 0.2)}" y="${f(y - 14)}" width="${f(w * 0.6)}" height="14" fill="${col}"/>`;
  else if (roof < 0.4) s += `<path d="M${f(x)} ${f(y)} L${f(x + w)} ${f(y - w * 0.35)} L${f(x + w)} ${f(y)}Z" fill="${col}"/>`;
  else if (roof < 0.55) s += `<rect x="${f(x + w / 2 - 1)}" y="${f(y - 40)}" width="2" height="40" fill="${col}"/>`;
  else if (roof < 0.65) s += `<rect x="${f(x + w * 0.1)}" y="${f(y - 22)}" width="${f(w * 0.8)}" height="8" fill="${col}"/><rect x="${f(x + w * 0.2)}" y="${f(y - 14)}" width="${f(w * 0.6)}" height="14" fill="${col}"/>`;
  return s;
}

function row(layer, base, hMin, hMax, wMin, wMax, seed, avoid = []) {
  const r = rng(seed);
  let s = "", x = -20;
  while (x < W + 20) {
    const w = wMin + r() * (wMax - wMin);
    const h = hMin + r() * (hMax - hMin);
    const blocked = avoid.some(([a, b]) => x + w > a && x < b);
    if (!blocked && r() > (layer === "near" ? 0.35 : 0.08)) s += tower(x, w, h, base, layer, r);
    x += w + (layer === "far" ? 2 : 6 + r() * 14);
  }
  return s;
}

// ---------- landmarks ----------
function fuji(cx, base, w, h) {
  const top = base - h;
  return `<path d="M${cx - w / 2} ${base} C${cx - w * 0.3} ${base - h * 0.25} ${cx - w * 0.12} ${top + h * 0.12} ${cx - w * 0.07} ${top} L${cx + w * 0.07} ${top} C${cx + w * 0.12} ${top + h * 0.12} ${cx + w * 0.3} ${base - h * 0.25} ${cx + w / 2} ${base}Z" fill="#cfd9e4"/>
<path d="M${f(cx - w * 0.07)} ${top} L${f(cx + w * 0.07)} ${top} L${f(cx + w * 0.155)} ${f(top + h * 0.3)} L${f(cx + w * 0.1)} ${f(top + h * 0.24)} L${f(cx + w * 0.06)} ${f(top + h * 0.33)} L${f(cx + w * 0.01)} ${f(top + h * 0.25)} L${f(cx - w * 0.04)} ${f(top + h * 0.34)} L${f(cx - w * 0.09)} ${f(top + h * 0.24)} L${f(cx - w * 0.155)} ${f(top + h * 0.3)}Z" fill="#fbfcfd"/>`;
}

function castle(cx, base) {
  let s = `<path d="M${cx - 150} ${base} L${cx - 120} ${base - 70} L${cx + 120} ${base - 70} L${cx + 150} ${base}Z" fill="#c5ced7"/>`;
  for (let i = 1; i < 5; i++) s += `<path d="M${cx - 150 + i * 7} ${base - i * 14} H${cx + 150 - i * 7}" stroke="#aebac6" stroke-width="1.2"/>`;
  let y = base - 70;
  for (let i = 0; i < 5; i++) {
    const ww = 170 - i * 28, wh = 26 - i * 1.5;
    s += `<rect x="${cx - ww / 2}" y="${f(y - wh)}" width="${ww}" height="${f(wh)}" fill="${C.white}"/>`;
    for (let k = 0; k < ww / 18 - 1; k++) s += `<rect x="${f(cx - ww / 2 + 10 + k * 18)}" y="${f(y - wh + 8)}" width="6" height="8" fill="#b9c4cf"/>`;
    y -= wh;
    const rw = ww + 34;
    s += `<path d="M${f(cx - rw / 2)} ${f(y + 2)} Q${f(cx - rw / 2 + 10)} ${f(y - 2)} ${f(cx - ww / 2 + 6)} ${f(y - 16)} L${f(cx + ww / 2 - 6)} ${f(y - 16)} Q${f(cx + rw / 2 - 10)} ${f(y - 2)} ${f(cx + rw / 2)} ${f(y + 2)}Z" fill="${C.green}"/>`;
    if (i % 2 === 0 && i < 4) s += `<path d="M${cx - 22} ${f(y - 12)} L${cx} ${f(y - 32)} L${cx + 22} ${f(y - 12)}Z" fill="${C.green}"/><path d="M${cx - 12} ${f(y - 14)} L${cx} ${f(y - 25)} L${cx + 12} ${f(y - 14)}Z" fill="${C.white}"/>`;
    y -= 16;
  }
  s += `<circle cx="${cx - 26}" cy="${f(y - 2)}" r="3" fill="#d8c48c"/><circle cx="${cx + 26}" cy="${f(y - 2)}" r="3" fill="#d8c48c"/>`;
  return s;
}

function umeda(x, base) {
  const h = 370, tw = 64, gap = 58, tot = tw * 2 + gap, top = base - h;
  let s = "";
  for (const tx of [x, x + tw + gap]) s += `<rect x="${tx}" y="${top}" width="${tw}" height="${h}" fill="url(#gNear)"/><rect x="${tx}" y="${top}" width="${tw}" height="${h}" fill="url(#win)"/><rect x="${tx}" y="${top}" width="${tw}" height="${h}" fill="url(#gSheen)"/>`;
  for (const t of [0.38, 0.62]) s += `<rect x="${x + tw}" y="${f(top + h * t)}" width="${gap}" height="7" fill="${C.near2}"/>`;
  s += `<path fill-rule="evenodd" d="M${x - 4} ${top - 8} H${x + tot + 4} V${top + 44} H${x - 4}Z M${x + tot / 2 + 30} ${top + 18} A30 30 0 1 0 ${x + tot / 2 - 30} ${top + 18} A30 30 0 1 0 ${x + tot / 2 + 30} ${top + 18}Z" fill="#a9bacb"/>`;
  return s;
}

function harukas(x, base) {
  const segs = [[0, 140, 270], [36, 104, 150], [62, 78, 110]];
  let y = base, s = "";
  for (const [dx, w, h] of segs) {
    s += `<rect x="${x + dx}" y="${y - h}" width="${w}" height="${h}" fill="url(#gNear)"/><rect x="${x + dx}" y="${y - h}" width="${w}" height="${h}" fill="url(#win)"/><rect x="${x + dx}" y="${y - h}" width="${w}" height="${h}" fill="url(#gSheen)"/>`;
    y -= h;
  }
  return s + `<rect x="${x + 98}" y="${y - 24}" width="3" height="24" fill="${C.near2}"/>`;
}

function tsutenkaku(cx, base) {
  return `<path d="M${cx - 44} ${base} Q${cx - 18} ${base - 30} ${cx - 15} ${base - 70} H${cx + 15} Q${cx + 18} ${base - 30} ${cx + 44} ${base} H${cx + 28} Q${cx} ${base - 40} ${cx - 28} ${base}Z" fill="${C.line}"/>
<rect x="${cx - 13}" y="${base - 190}" width="26" height="122" fill="#aebccb"/><rect x="${cx - 13}" y="${base - 190}" width="26" height="122" fill="url(#winD)"/>
<rect x="${cx - 26}" y="${base - 222}" width="52" height="34" fill="${C.line}"/><rect x="${cx - 22}" y="${base - 214}" width="44" height="10" fill="${C.white}"/>
<rect x="${cx - 2}" y="${base - 262}" width="4" height="40" fill="${C.line}"/>`;
}

function latticeTower(cx, base, h, hwFn, color, decks) {
  const L = [], R = [];
  for (let i = 0; i <= 40; i++) { const t = i / 40; const y = base - h * t; const hw = hwFn(t); L.push([cx - hw, y]); R.push([cx + hw, y]); }
  let s = `<path d="M${L.map((p) => p.map(f).join(" ")).join(" L")}" fill="none" stroke="${color}" stroke-width="4"/>`;
  s += `<path d="M${R.map((p) => p.map(f).join(" ")).join(" L")}" fill="none" stroke="${color}" stroke-width="4"/>`;
  for (let i = 0; i < 40; i += 2) s += `<path d="M${f(L[i][0])} ${f(L[i][1])} L${f(R[i + 2][0])} ${f(R[i + 2][1])} M${f(R[i][0])} ${f(R[i][1])} L${f(L[i + 2][0])} ${f(L[i + 2][1])}" stroke="${color}" stroke-width="1.4" opacity=".8"/>`;
  for (const [t, extra, dh] of decks) { const hw = hwFn(t) + extra; s += `<rect x="${f(cx - hw)}" y="${f(base - h * t - dh)}" width="${f(hw * 2)}" height="${dh}" fill="${color}"/>`; }
  return s;
}

function tokyoTower(cx, base) {
  const h = 400;
  let s = latticeTower(cx, base, h, (t) => 4 + 90 * Math.pow(1 - t, 2.4), C.red, [[0.36, 12, 20], [0.66, 8, 12]]);
  s += `<path d="M${cx - 64} ${base} Q${cx} ${base - 70} ${cx + 64} ${base}" fill="none" stroke="${C.red}" stroke-width="5"/>`;
  return s + `<rect x="${cx - 1.5}" y="${base - h - 50}" width="3" height="50" fill="${C.red}"/>`;
}

function skytree(cx, base) {
  const h = 600;
  let s = latticeTower(cx, base, h * 0.82, (t) => 5 + 38 * Math.pow(1 - t, 1.4), "#a9b8c8", [[0.6, 18, 26], [0.92, 10, 14]]);
  s += `<path d="M${cx - 4} ${f(base - h * 0.82)} L${cx - 1} ${base - h} H${cx + 1} L${cx + 4} ${f(base - h * 0.82)}Z" fill="#a9b8c8"/>`;
  return s;
}

function pagoda(cx, base, h = 310) {
  let s = `<rect x="${cx - 58}" y="${base - 12}" width="116" height="12" fill="#b3bdc7"/>`;
  let y = base - 12;
  const th = (h * 0.7) / 5;
  for (let i = 0; i < 5; i++) {
    const bw = 58 - i * 6, rw = 128 - i * 14;
    s += `<rect x="${cx - bw / 2}" y="${f(y - th + 8)}" width="${bw}" height="${f(th - 8)}" fill="#c9d1d9"/>`;
    y -= th - 8;
    s += `<path d="M${f(cx - rw / 2)} ${f(y - 6)} Q${f(cx - rw / 2 + 14)} ${f(y + 2)} ${f(cx - bw / 2 - 4)} ${f(y + 2)} H${f(cx + bw / 2 + 4)} Q${f(cx + rw / 2 - 14)} ${f(y + 2)} ${f(cx + rw / 2)} ${f(y - 6)} Q${f(cx + rw / 2 - 26)} ${f(y - 14)} ${cx} ${f(y - 16)} Q${f(cx - rw / 2 + 26)} ${f(y - 14)} ${f(cx - rw / 2)} ${f(y - 6)}Z" fill="${C.roof}"/>`;
    y -= 16;
  }
  s += `<rect x="${cx - 1.5}" y="${f(y - h * 0.24)}" width="3" height="${f(h * 0.24)}" fill="${C.roof}"/>`;
  for (let k = 0; k < 6; k++) s += `<rect x="${cx - 6}" y="${f(y - 10 - k * 9)}" width="12" height="2.5" fill="${C.roof}"/>`;
  return s;
}

function templeHall(cx, base, w) {
  return `<rect x="${cx - w * 0.4}" y="${base - 46}" width="${w * 0.8}" height="46" fill="#cdd5dc"/>
<path d="M${cx - w / 2} ${base - 40} Q${cx - w * 0.38} ${base - 46} ${cx - w * 0.3} ${base - 84} H${cx + w * 0.3} Q${cx + w * 0.38} ${base - 46} ${cx + w / 2} ${base - 40}Z" fill="${C.roof}"/>
<path d="M${cx - w * 0.3} ${base - 84} L${cx} ${base - 104} L${cx + w * 0.3} ${base - 84}Z" fill="#6f7d8b"/>`;
}

function kyotoTower(cx, base) {
  return `<rect x="${cx - 110}" y="${base - 62}" width="220" height="62" fill="${C.white}"/><rect x="${cx - 110}" y="${base - 62}" width="220" height="62" fill="url(#winD)"/>
<path d="M${cx - 16} ${base - 62} L${cx - 11} ${base - 214} H${cx + 11} L${cx + 16} ${base - 62}Z" fill="#fbfcfd" stroke="#c4ced8"/>
<path d="M${cx - 13} ${base - 214} Q${cx - 26} ${base - 224} ${cx - 15} ${base - 240} H${cx + 15} Q${cx + 26} ${base - 224} ${cx + 13} ${base - 214}Z" fill="#fbfcfd" stroke="#c4ced8"/>
<rect x="${cx - 13}" y="${base - 232}" width="26" height="6" fill="#d98b86" opacity=".7"/>
<path d="M${cx - 4} ${base - 240} L${cx} ${base - 290} L${cx + 4} ${base - 240}Z" fill="#c4ced8"/>`;
}

function torii(cx, base) {
  const col = "#d9817c";
  return `<rect x="${cx - 52}" y="${base - 190}" width="14" height="190" fill="${col}"/><rect x="${cx + 38}" y="${base - 190}" width="14" height="190" fill="${col}"/>
<rect x="${cx - 70}" y="${base - 160}" width="140" height="11" fill="${col}"/><rect x="${cx - 5}" y="${base - 182}" width="10" height="24" fill="${col}"/>
<path d="M${cx - 96} ${base - 196} Q${cx - 60} ${base - 186} ${cx} ${base - 188} Q${cx + 60} ${base - 186} ${cx + 96} ${base - 196} L${cx + 88} ${base - 210} Q${cx} ${base - 202} ${cx - 88} ${base - 210}Z" fill="#6f7d8b"/>
<rect x="${cx - 80}" y="${base - 190}" width="160" height="8" fill="${col}"/>`;
}

function machiya(base, seed, from, to) {
  const r = rng(seed);
  let s = "", x = from;
  while (x < to) {
    const w = 36 + r() * 46, h = 24 + r() * 26;
    s += `<rect x="${f(x)}" y="${f(base - h)}" width="${f(w)}" height="${f(h)}" fill="#d5dce3"/>`;
    s += `<path d="M${f(x - 5)} ${f(base - h + 3)} L${f(x + w * 0.5)} ${f(base - h - 14)} L${f(x + w + 5)} ${f(base - h + 3)}Z" fill="#8f9ca9"/>`;
    x += w + 2;
  }
  return s;
}

function landmarkTower(x, base) {
  return `<path d="M${x} ${base} L${x + 14} ${base - 470} H${x + 104} L${x + 118} ${base}Z" fill="url(#gNear)"/><path d="M${x} ${base} L${x + 14} ${base - 470} H${x + 104} L${x + 118} ${base}Z" fill="url(#win)"/><path d="M${x} ${base} L${x + 14} ${base - 470} H${x + 104} L${x + 118} ${base}Z" fill="url(#gSheen)"/>
<rect x="${x + 10}" y="${base - 492}" width="98" height="22" fill="${C.near2}"/><rect x="${x + 40}" y="${base - 492}" width="38" height="22" fill="#e9eff5"/>`;
}

function ferris(cx, base, r) {
  const cy = base - r - 30;
  let s = `<path d="M${cx - r * 0.55} ${base} L${cx} ${cy} L${cx + r * 0.55} ${base}" fill="none" stroke="${C.line}" stroke-width="6"/>`;
  s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${C.line}" stroke-width="4"/><circle cx="${cx}" cy="${cy}" r="${r - 10}" fill="none" stroke="${C.line}" stroke-width="1.5"/>`;
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * Math.PI * 2;
    s += `<path d="M${cx} ${cy} L${f(cx + Math.cos(a) * r)} ${f(cy + Math.sin(a) * r)}" stroke="${C.line}" stroke-width=".8"/>`;
    s += `<circle cx="${f(cx + Math.cos(a) * (r + 7))}" cy="${f(cy + Math.sin(a) * (r + 7))}" r="5" fill="${i % 5 ? "#c3cfdb" : C.red}"/>`;
  }
  return s + `<circle cx="${cx}" cy="${cy}" r="${r * 0.22}" fill="${C.white}" stroke="${C.line}" stroke-width="2"/>`;
}

function sail(x, base) {
  return `<path d="M${x} ${base} L${x + 6} ${base - 290} Q${x + 150} ${base - 200} ${x + 160} ${base}Z" fill="url(#gNear)"/><path d="M${x} ${base} L${x + 6} ${base - 290} Q${x + 150} ${base - 200} ${x + 160} ${base}Z" fill="url(#winD)"/><path d="M${x} ${base} L${x + 6} ${base - 290} Q${x + 150} ${base - 200} ${x + 160} ${base}Z" fill="url(#gSheen)"/>`;
}

function portTower(cx, base) {
  const h = 290, rb = 40, rt = 34;
  let s = "";
  for (let k = 0; k < 22; k++) {
    const a = (k / 22) * Math.PI * 2;
    s += `<path d="M${f(cx + rb * Math.cos(a))} ${base} L${f(cx + rt * Math.cos(a + 2.3))} ${base - h}" stroke="${C.red}" stroke-width="2.2"/>`;
  }
  s += `<rect x="${cx - 38}" y="${base - h - 34}" width="76" height="34" fill="${C.red}"/><rect x="${cx - 34}" y="${base - h - 26}" width="68" height="10" fill="${C.white}" opacity=".8"/>`;
  s += `<rect x="${cx - 28}" y="${base - h - 52}" width="56" height="18" fill="${C.red}"/><rect x="${cx - 2}" y="${base - h - 80}" width="4" height="28" fill="${C.red}"/>`;
  return s;
}

function maritime(x, base) {
  let s = `<rect x="${x}" y="${base - 30}" width="200" height="30" fill="#d8e0e8"/>`;
  for (let i = 0; i < 5; i++) s += `<path d="M${x + 10 + i * 34} ${base - 30} Q${x + 60 + i * 30} ${base - 150 + i * 14} ${x + 190} ${base - 70 - i * 6}" fill="none" stroke="${C.white}" stroke-width="5"/><path d="M${x + 10 + i * 34} ${base - 30} Q${x + 60 + i * 30} ${base - 150 + i * 14} ${x + 190} ${base - 70 - i * 6}" fill="none" stroke="#b6c3d0" stroke-width="1"/>`;
  return s;
}

function water(top) {
  const r = rng(top);
  let s = `<rect x="0" y="${top}" width="${W}" height="${H - top}" fill="url(#gWater)"/>`;
  for (let i = 0; i < 70; i++) {
    const y = top + 8 + r() * (H - top - 12), x = r() * W, w = 20 + r() * 90;
    s += `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="1.6" fill="#fff" opacity="${f(0.4 + r() * 0.5)}"/>`;
  }
  return s;
}

function svg(title, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice" role="img" aria-label="${title}">${DEFS}<rect width="${W}" height="${H}" fill="url(#sky)"/>${body}</svg>\n`;
}

const G = H; // ground
const slides = {
  osaka: svg("Osaka skyline illustration",
    clouds(rng(1)) + ridge(560, 110, "#e2e8ef", 11) +
    row("far", G, 120, 260, 30, 70, 12) +
    row("mid", G, 150, 330, 40, 90, 13) +
    tsutenkaku(560, G) + umeda(1130, G) + harukas(1400, G) +
    row("near", G, 110, 300, 50, 110, 14, [[150, 470], [520, 600], [1110, 1340], [1380, 1560]]) +
    castle(310, G)),
  tokyo: svg("Tokyo skyline illustration",
    clouds(rng(2)) + fuji(1180, 640, 900, 330) + ridge(640, 50, "#dfe6ee", 21) +
    row("far", G, 140, 300, 30, 70, 22) +
    row("mid", G, 180, 380, 40, 90, 23) +
    tokyoTower(330, G) + skytree(1440, G) +
    row("near", G, 140, 380, 50, 110, 24, [[220, 440], [1380, 1500]])),
  kyoto: svg("Kyoto skyline illustration",
    clouds(rng(3)) + ridge(560, 150, "#dbe3e6", 31) + ridge(640, 90, "#d3dde0", 32) +
    row("far", G, 90, 190, 40, 90, 33) +
    row("mid", G, 70, 200, 40, 100, 35, [[220, 380], [1180, 1320], [1360, 1560]]) +
    templeHall(1460, G - 40, 180) + torii(110, G) +
    machiya(G, 34, -20, 1700) + pagoda(300, G - 8) + kyotoTower(1250, G)),
  yokohama: svg("Yokohama skyline illustration",
    clouds(rng(4)) + ridge(600, 60, "#e1e7ee", 41) +
    row("far", 700, 120, 260, 30, 70, 42) +
    row("mid", 700, 140, 320, 40, 90, 43) +
    landmarkTower(1150, 700) + sail(520, 700) +
    row("near", 700, 100, 260, 50, 110, 44, [[180, 720], [1130, 1290]]) +
    ferris(360, 700, 140) + water(700)),
  kobe: svg("Kobe skyline illustration",
    clouds(rng(5)) + ridge(520, 200, "#d9e2e8", 51) + ridge(600, 120, "#cfd9e1", 52) +
    row("far", 700, 100, 220, 30, 70, 53) +
    row("mid", 700, 120, 300, 40, 90, 54, [[260, 560]]) +
    portTower(320, 700) + maritime(400, 700) + ferris(1370, 700, 90) +
    row("near", 700, 90, 240, 50, 110, 55, [[240, 620], [1260, 1480]]) +
    water(700)),
};
for (const [k, v] of Object.entries(slides)) writeFileSync(join(OUT, "skylines", `${k}.svg`), v);

// ---------- blueprint overlay (faint technical drawing) ----------
let bp = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 800" preserveAspectRatio="xMidYMid slice" fill="none" stroke="#6d84a0" stroke-width="1.2">`;
bp += `<g opacity=".9"><rect x="560" y="420" width="260" height="140"/><path d="M560 470H820M640 420V560M700 420V560"/><circle cx="1000" cy="460" r="46"/><circle cx="1000" cy="460" r="22"/><path d="M940 460H1060M1000 400V520"/>`;
bp += `<path d="M610 600H1000M610 594V606M1000 594V606M620 600l-8-4v8z"/><rect x="860" y="380" width="70" height="120"/><path d="M860 410H930M860 440H930M860 470H930"/>`;
bp += `<path d="M1060 520H1150V600H1060ZM1150 560H1190M1190 540V580"/><circle cx="1105" cy="560" r="14"/><path d="M640 520h30v20h-30zM680 520h30v20h-30z"/></g>`;
bp += `<g opacity=".55"><path d="M80 120H360M80 112V128M360 112V128"/><circle cx="1400" cy="180" r="60"/><path d="M1340 180H1460M1400 120V240"/><rect x="120" y="560" width="160" height="90"/><path d="M120 605H280M200 560V650"/></g></svg>\n`;
writeFileSync(join(OUT, "blueprint.svg"), bp);

// ---------- mechanical line art (robot arm and gear) ----------
function gear(cx, cy, r, teeth) {
  let d = "";
  for (let i = 0; i < teeth; i++) {
    const a0 = (i / teeth) * Math.PI * 2, a1 = a0 + Math.PI / teeth * 0.5, a2 = a0 + Math.PI / teeth, a3 = a0 + Math.PI / teeth * 1.5;
    const p = (a, rr) => `${f(cx + Math.cos(a) * rr)} ${f(cy + Math.sin(a) * rr)}`;
    d += `${i ? "L" : "M"}${p(a0, r)} L${p(a1, r + 12)} L${p(a2, r + 12)} L${p(a3, r)} `;
  }
  return `<path d="${d}Z"/><circle cx="${cx}" cy="${cy}" r="${r * 0.4}"/><circle cx="${cx}" cy="${cy}" r="${r * 0.15}"/>`;
}
let mech = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 360" fill="none" stroke="#8a97a6" stroke-width="1.4" stroke-linejoin="round">`;
mech += `<path d="M60 330H230M80 330V300H210V330M95 300L110 268H180L195 300"/><ellipse cx="145" cy="268" rx="38" ry="10"/>`;
mech += `<path d="M128 262L150 150L178 156L160 266"/><circle cx="164" cy="150" r="22"/><circle cx="164" cy="150" r="9"/>`;
mech += `<path d="M176 132L282 84L292 106L186 160"/><circle cx="288" cy="94" r="18"/><circle cx="288" cy="94" r="7"/>`;
mech += `<path d="M300 84L330 70L338 88L310 100M330 70L350 52M338 88L362 82M350 52L364 56M362 82L370 96"/>`;
mech += `<path d="M138 200L150 202M134 220L146 222M206 136L250 116M214 150L258 130"/>`;
mech += gear(320, 250, 44, 14) + gear(250, 300, 26, 10) + `</svg>\n`;
writeFileSync(join(OUT, "mech.svg"), mech);
console.log("ok");
