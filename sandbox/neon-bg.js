// neon-bg.js: the neon grid animation as the background of neon-home.html (a copy of the script in neon-grid.html).
// Wrapped in a function so its names (canvas, draw, SETTINGS...) never clash with the site's own scripts.
(function () {
// ============================== SETTINGS (try changing these) ==============================
const SETTINGS = {
  columns: 16,          // tiles to the left and to the right of the middle
  rows: 46,             // how far into the distance the floor goes
  glideSpeed: -0.35,    // tiles per second. Negative = the floor slides away from you into the horizon; positive = towards you; 0 = still
  pulseSpeed: 1.6,      // how fast tiles grow and shrink
  smallest: 0.15,       // smallest tile size (1 = touching its neighbours)
  largest: 0.95,        // largest tile size
  horizon: 0.40,        // where the horizon sits, from the top (0.40 = 40% down the screen)
  // Colours by distance: near tiles, middle tiles, far tiles (hue numbers on the colour wheel, 0-360).
  hueNear: 270,         // purple
  hueMiddle: 320,       // pink
  hueFar: 385,          // orange (385 = 25 on the colour wheel; going past 360 blends through red, not blue)
};
// ==========================================================================================

const canvas = document.getElementById("neon-bg");
const ctx = canvas.getContext("2d");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let W = 0, H = 0;   // the screen size in CSS pixels

// Make the canvas match the window (and stay sharp on high-resolution screens).
function resize() {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.round(W * ratio);
  canvas.height = Math.round(H * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  city = null;                 // the skyline is rebuilt for the new size
  if (reduceMotion) draw(0);   // nothing is animating, so redraw once at the new size
}
window.addEventListener("resize", resize);

// A repeatable "random" number between 0 and 1 for each tile, so every tile keeps its own personality.
function tileRandom(col, row, salt) {
  const n = Math.sin(col * 127.1 + row * 311.7 + salt * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

// Blend between two numbers: t = 0 gives a, t = 1 gives b.
const mix = (a, b, t) => a + (b - a) * t;
const clamp01 = t => Math.max(0, Math.min(1, t));

// ---------------------------------------------------------------------------------------------
// Perspective: turn a point on the floor (x across, z into the distance) into a point on the screen.
// The camera floats above the floor; the further away (bigger z), the closer to the horizon it lands.
// ---------------------------------------------------------------------------------------------
const CAMERA_HEIGHT = 1.1;
const NEAREST = 0.6;          // don't draw anything closer than this (it would be huge)

function project(x, z) {
  const focal = H * 0.85;                  // a bit like a camera lens: bigger = more zoomed in
  const horizonY = H * SETTINGS.horizon;
  return [W / 2 + (x * focal) / z, horizonY + (CAMERA_HEIGHT * focal) / z];
}

// ---------------------------------------------------------------------------------------------
// The background: dark sky, the faint "ceiling" lines above the horizon, and a glowing horizon band.
// ---------------------------------------------------------------------------------------------
function drawBackground(time) {
  const horizonY = H * SETTINGS.horizon;

  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#05041a");
  sky.addColorStop(SETTINGS.horizon * 0.8, "#1a0b3d");
  sky.addColorStop(SETTINGS.horizon, "#3a0d4f");
  sky.addColorStop(1, "#0a0624");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // Ceiling lines: like the floor's lines but upside down, very faint, running to the same vanishing point.
  ctx.lineWidth = 1;
  for (let i = -40; i <= 40; i++) {
    const x = i * 0.9;
    const [x1, y1] = [W / 2 + x * 2, horizonY - 2];
    const [x2, y2] = [W / 2 + x * H * 0.9, horizonY - H * 1.2];
    ctx.strokeStyle = `hsla(${i % 2 === 0 ? 315 : 270}, 95%, 68%, ${0.14 + 0.08 * tileRandom(i, 0, 3)})`;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  // Horizontal ceiling lines that drift slowly upwards, for a feeling of depth above as well.
  for (let k = 0; k < 18; k++) {
    const depth = ((((k + time * SETTINGS.glideSpeed) % 18) + 18) % 18) + 0.6;   // the "+ 18) % 18" keeps it positive when moving away
    const y = horizonY - (CAMERA_HEIGHT * 1.6 * H * 0.85) / (depth * 2.2);
    ctx.strokeStyle = `rgba(200, 110, 255, ${0.34 * (1 - depth / 18)})`;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  // The striped sun setting behind the city, in the distance.
  drawSun(time);
  drawCity(time);

  // The glowing band along the horizon.
  const glow = ctx.createLinearGradient(0, horizonY - H * 0.12, 0, horizonY + H * 0.12);
  glow.addColorStop(0, "rgba(255, 40, 140, 0)");
  glow.addColorStop(0.5, `rgba(255, 40, 140, ${0.15 + 0.3 * sunrise(time)})`);
  glow.addColorStop(1, "rgba(255, 40, 140, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, horizonY - H * 0.12, W, H * 0.24);
}

// ---------------------------------------------------------------------------------------------
// The sun: a big disc sitting on the horizon, orange at the top fading to pink, with dark stripes across its lower
// half that slowly slide downwards. It's drawn on its own small canvas first, so the stripes can be cut out of it.
// ---------------------------------------------------------------------------------------------
// Sunrise: 0 when the page opens (sun hidden below the horizon), easing up to 1 over SUNRISE_SECONDS.
const SUNRISE_SECONDS = 5;
function sunrise(time) {
  const t = Math.min(1, time / SUNRISE_SECONDS);
  return 1 - Math.pow(1 - t, 3);   // fast at first, slowing gently as it settles
}

const sunCanvas = document.createElement("canvas");
const sunCtx = sunCanvas.getContext("2d");

function drawSun(time) {
  const horizonY = H * SETTINGS.horizon;
  const R = Math.min(W * 0.19, H * 0.25);       // the sun's radius
  const rise = sunrise(time);
  // It starts fully below the horizon and rises until it sits sunk just a little into it.
  const cx = W / 2, cy = horizonY + R * 1.05 - R * 0.93 * rise;

  // A soft pink halo around it.
  const halo = ctx.createRadialGradient(cx, cy, R * 0.6, cx, cy, R * 2.2);
  halo.addColorStop(0, `rgba(255, 70, 170, ${0.15 + 0.4 * rise})`);   // the halo swells as it rises
  halo.addColorStop(1, "rgba(255, 70, 170, 0)");
  ctx.fillStyle = halo;
  ctx.fillRect(cx - R * 2.2, horizonY - R * 2.2, R * 4.4, R * 2.2);

  // The disc, on its own canvas (only the part above the horizon matters).
  const size = Math.ceil(R * 2);
  if (sunCanvas.width !== size) { sunCanvas.width = size; sunCanvas.height = size; }
  sunCtx.globalCompositeOperation = "source-over";
  sunCtx.clearRect(0, 0, size, size);
  const fill = sunCtx.createLinearGradient(0, 0, 0, size);
  fill.addColorStop(0, "#ffc46b");     // warm orange at the top
  fill.addColorStop(0.45, "#ff7a3d");
  fill.addColorStop(0.8, "#ff2f9a");   // hot pink at the bottom
  sunCtx.fillStyle = fill;
  sunCtx.beginPath();
  sunCtx.arc(R, R, R, 0, Math.PI * 2);
  sunCtx.fill();

  // Cut the stripes out: they start thin near the middle and get thicker towards the bottom, sliding down slowly.
  sunCtx.globalCompositeOperation = "destination-out";
  const top = R * 0.9, bottom = R * 2, count = 7;
  const phase = (time * 0.12) % 1;
  for (let k = -1; k < count; k++) {
    const f = (k + phase) / count;                 // 0 at the top of the striped area, 1 at the bottom
    if (f < 0) continue;
    const y = top + f * (bottom - top);
    const thickness = 1 + f * R * 0.09;
    sunCtx.fillRect(0, y, size, thickness);
  }

  // Put it on the screen, cut off at the horizon.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, horizonY);
  ctx.clip();
  ctx.globalAlpha = 0.95;
  ctx.drawImage(sunCanvas, cx - R, cy - R);
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------
// The city: an Osaka-inspired skyline silhouette standing on the horizon in front of the sun.
// Two rows of buildings (a hazy one further back, a darker one in front) plus three landmarks:
// a lattice tower with an observation deck, two towers joined by a deck at the top, and a castle.
// It's drawn once onto its own canvas (and again when the window changes size); only the blinking
// lights on the antennas are drawn fresh each frame.
// ---------------------------------------------------------------------------------------------
let city = null;   // { canvas, top, lights: [[x, y], ...] }

// A "random" number generator that gives the same numbers every time, so the skyline never changes shape.
function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildCity() {
  const height = Math.round(H * 0.2);           // the tallest the city can be
  const scale = Math.max(0.6, W / 1280);        // building widths grow with the screen
  const c = document.createElement("canvas");
  c.width = W; c.height = height;
  const g = c.getContext("2d");
  const rand = seeded(1945);
  const lights = [];
  // Buildings are taller near the middle of the screen, like a downtown.
  const downtown = x => 0.35 + 0.65 * Math.exp(-(((x - W / 2) / (W * 0.28)) ** 2));

  // Row 1: hazy buildings further back.
  g.fillStyle = "rgba(92, 28, 110, 0.85)";
  for (let x = -10; x < W; ) {
    const w = (16 + rand() * 34) * scale;
    const h = height * (0.15 + rand() * 0.4) * downtown(x);
    g.fillRect(x, height - h, w - 2 * scale, h);
    x += w;
  }

  // Row 2: darker buildings in front, with a pink rim along their tops and a few lit windows.
  const front = g.createLinearGradient(0, 0, 0, height);
  front.addColorStop(0, "#2b0f4a");
  front.addColorStop(1, "#0d0622");
  for (let x = -10; x < W; ) {
    const w = (14 + rand() * 40) * scale;
    const h = height * (0.12 + rand() * 0.55) * downtown(x);
    const y = height - h;
    g.fillStyle = front;
    g.fillRect(x, y, w - 3 * scale, h);
    // Some buildings get a stepped top or an antenna.
    if (rand() < 0.3) g.fillRect(x + w * 0.2, y - h * 0.08, w * 0.5, h * 0.08);
    if (rand() < 0.25 && h > height * 0.3) {
      g.fillRect(x + w / 2 - 1, y - h * 0.18, 2, h * 0.18);
      lights.push([x + w / 2, y - h * 0.18]);
    }
    g.fillStyle = "rgba(255, 90, 200, 0.55)";   // rim light from the sun
    g.fillRect(x, y, w - 3 * scale, 1);
    // Windows: tiny dots, mostly dark, a few lit pink, orange or white.
    for (let wy = y + 6; wy < height - 4; wy += 6 * scale) {
      for (let wx = x + 3; wx < x + w - 6; wx += 5 * scale) {
        if (rand() < 0.12) {
          g.fillStyle = pickColor(rand(), ["rgba(255,110,199,.8)", "rgba(255,160,90,.8)", "rgba(255,255,255,.7)"]);
          g.fillRect(wx, wy, 1.5 * scale, 1.5 * scale);
        }
      }
    }
    x += w;
  }

  g.fillStyle = "#0f0626";

  // Landmark 1: a lattice tower with an observation deck and a spire (left of centre).
  {
    const tx = W * 0.37, base = height, th = height * 0.95, bw = 34 * scale;
    g.beginPath();
    g.moveTo(tx - bw / 2, base); g.lineTo(tx - bw * 0.14, base - th * 0.62);
    g.lineTo(tx + bw * 0.14, base - th * 0.62); g.lineTo(tx + bw / 2, base);
    g.closePath(); g.fill();
    g.fillRect(tx - bw * 0.32, base - th * 0.74, bw * 0.64, th * 0.12);      // the observation deck
    g.fillRect(tx - bw * 0.1, base - th * 0.86, bw * 0.2, th * 0.12);        // the top section
    g.fillRect(tx - 1, base - th, 2, th * 0.14);                              // the spire
    g.strokeStyle = "rgba(255, 110, 199, 0.35)";                              // lattice cross-bracing
    g.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const y1 = base - (th * 0.62 * i) / 5, y2 = base - (th * 0.62 * (i + 1)) / 5;
      const half = yy => bw / 2 - ((base - yy) / (th * 0.62)) * (bw / 2 - bw * 0.14);
      g.beginPath();
      g.moveTo(tx - half(y1), y1); g.lineTo(tx + half(y2), y2);
      g.moveTo(tx + half(y1), y1); g.lineTo(tx - half(y2), y2);
      g.stroke();
    }
    g.fillStyle = "rgba(255, 150, 80, 0.9)";                                  // the deck's lit windows
    g.fillRect(tx - bw * 0.28, base - th * 0.69, bw * 0.56, 2);
    g.fillStyle = "#0f0626";
    lights.push([tx, base - th]);
  }

  // Landmark 2: two towers joined by a deck at the top, with a round opening in the deck (right of centre).
  {
    const cx = W * 0.6, base = height, th = height * 0.82, tw = 22 * scale, gap = 26 * scale;
    g.fillRect(cx - gap / 2 - tw, base - th, tw, th);
    g.fillRect(cx + gap / 2, base - th, tw, th);
    const deckH = 18 * scale;
    g.fillRect(cx - gap / 2 - tw, base - th - deckH * 0.2, gap + tw * 2, deckH);
    g.globalCompositeOperation = "destination-out";                         // the round opening
    g.beginPath(); g.arc(cx, base - th + deckH * 0.3, deckH * 0.38, 0, Math.PI * 2); g.fill();
    g.globalCompositeOperation = "source-over";
    g.fillStyle = "rgba(255, 90, 200, 0.6)";
    g.fillRect(cx - gap / 2 - tw, base - th - deckH * 0.2, gap + tw * 2, 1);
    g.fillStyle = "#0f0626";
    lights.push([cx - gap / 2 - tw / 2, base - th - deckH * 0.2], [cx + gap / 2 + tw / 2, base - th - deckH * 0.2]);
  }

  // Landmark 3: a castle on a stone base, with stacked roofs that curve up at the ends (far left).
  {
    const kx = W * 0.2, base = height;
    const stoneW = 70 * scale, stoneH = height * 0.16;
    g.beginPath();
    g.moveTo(kx - stoneW / 2, base); g.lineTo(kx - stoneW * 0.38, base - stoneH);
    g.lineTo(kx + stoneW * 0.38, base - stoneH); g.lineTo(kx + stoneW / 2, base);
    g.closePath(); g.fill();
    let y = base - stoneH, w = stoneW * 0.62;
    for (let level = 0; level < 5; level++) {
      const wallH = height * 0.06, roofH = height * 0.035;
      g.fillRect(kx - w / 2, y - wallH, w, wallH);                           // the wall of this level
      y -= wallH;
      g.beginPath();                                                         // its roof, with upturned ends
      g.moveTo(kx - w / 2 - 8 * scale, y + 2 * scale);
      g.quadraticCurveTo(kx - w / 2, y - roofH * 0.2, kx - w * 0.3, y - roofH);
      g.lineTo(kx + w * 0.3, y - roofH);
      g.quadraticCurveTo(kx + w / 2, y - roofH * 0.2, kx + w / 2 + 8 * scale, y + 2 * scale);
      g.closePath(); g.fill();
      g.fillStyle = "rgba(255, 90, 200, 0.5)";
      g.fillRect(kx - w * 0.3, y - roofH, w * 0.6, 1);
      g.fillStyle = "#0f0626";
      y -= roofH;
      w *= 0.78;
    }
    g.fillRect(kx - 1, y - height * 0.04, 2, height * 0.04);                 // the ornament on top
  }

  city = { canvas: c, top: Math.round(H * SETTINGS.horizon) - height, lights };
}

function pickColor(r, list) { return list[Math.floor(r * list.length) % list.length]; }

function drawCity(time) {
  if (!city || city.canvas.width !== W) buildCity();
  ctx.drawImage(city.canvas, 0, city.top);
  // Blinking aircraft-warning lights on the antennas and towers.
  city.lights.forEach(([x, y], i) => {
    const on = Math.sin(time * 2.2 + i * 1.7) > 0.4;
    if (!on) return;
    ctx.fillStyle = i % 3 === 0 ? "#ff8a2b" : "#ff2bd6";
    ctx.beginPath();
    ctx.arc(x, city.top + y, 1.6, 0, Math.PI * 2);
    ctx.fill();
  });
}

// ---------------------------------------------------------------------------------------------
// The floor: thin grid lines, then the pulsing tiles on top.
// ---------------------------------------------------------------------------------------------
// ---------------------------------------------------------------------------------------------
// Hover: tiles near the pointer flicker, shrink and fizzle away into embers, then slowly rebuild once the
// pointer moves on. dissolve remembers, for each tile, how far gone it is (0 = whole, 1 = vanished).
// ---------------------------------------------------------------------------------------------
const HOVER = {
  radius: 70,        // pixels around the pointer where tiles fizzle away
  vanish: 0.1,       // how quickly a hovered tile disappears (bigger = faster)
  rebuild: 0.012,    // how quickly it comes back afterwards (smaller = slower)
};
const pointer = { x: -9999, y: -9999 };
window.addEventListener("pointermove", e => { pointer.x = e.clientX; pointer.y = e.clientY; });
document.documentElement.addEventListener("pointerleave", () => { pointer.x = pointer.y = -9999; });
const dissolve = new Map();

function drawFloor(time) {
  const { columns, rows } = SETTINGS;
  const glide = time * SETTINGS.glideSpeed;   // how far the floor has moved, in tiles
  const shift = glide % 1;                    // the part of a tile it has moved (0 .. 1)
  const passed = Math.floor(glide);           // whole tiles that have gone past the camera


  // "lighter" adds colours together where they overlap, which is what makes neon look like it glows.
  ctx.globalCompositeOperation = "lighter";

  // Draw from far to near, so near tiles are painted on top of far ones.
  for (let r = rows; r >= 0; r--) {
    const zFront = r - shift + NEAREST;        // the tile row's near edge
    if (zFront < NEAREST * 0.9) continue;
    const zMid = zFront + 0.5;
    const rowId = r + passed;                  // stays the same for a tile as it glides towards you

    const distance = clamp01((zMid - NEAREST) / rows);        // 0 = right in front, 1 = horizon
    const fade = Math.pow(1 - distance, 1.4);                 // far tiles fade into the haze
    // Near rows rise in brightness gradually instead of popping in at the bottom edge.
    const enter = clamp01((zFront - NEAREST * 0.9) / 0.6);

    // Colour by distance: near (cyan) -> middle (magenta) -> far (red).
    const d2 = clamp01(distance * 4);
    const baseHue = d2 < 0.5 ? mix(SETTINGS.hueNear, SETTINGS.hueMiddle, d2 * 2)
                             : mix(SETTINGS.hueMiddle, SETTINGS.hueFar, (d2 - 0.5) * 2);

    for (let c = -columns; c <= columns; c++) {
      // Each tile has its own beat (phase) and its own "hotness" (some tiles glow much brighter).
      const phase = tileRandom(c, rowId, 1) * Math.PI * 2;
      const hot = tileRandom(c, rowId, 2);
      const pulse = 0.5 + 0.5 * Math.sin(time * SETTINGS.pulseSpeed + phase);   // 0 .. 1, forever

      // Hover: is the pointer near this tile's middle (on screen)?
      const key = c + "," + rowId;
      let gone = dissolve.get(key) || 0;
      const [tx, ty] = project(c, zMid);
      const tileWidth = Math.abs(project(c + 0.5, zMid)[0] - project(c - 0.5, zMid)[0]);
      if (Math.hypot(tx - pointer.x, ty - pointer.y) < HOVER.radius + tileWidth * 0.4) {
        const before = gone;
        gone = Math.min(1, gone + HOVER.vanish);
        // The moment it starts to go, embers spit off it (the embers live in neon-fx.js).
        if (before < 0.05 && gone >= 0.05 && window.neonFizzleAt) {
          const tileHeight = Math.max(4, tileWidth * 0.35);
          window.neonFizzleAt(tx - tileWidth / 2, ty - tileHeight / 2, tileWidth, tileHeight, Math.round(6 + tileWidth / 8));
        }
      } else {
        gone = Math.max(0, gone - HOVER.rebuild);
      }
      if (gone > 0) dissolve.set(key, gone); else dissolve.delete(key);
      if (gone >= 1) continue;   // fully fizzled away

      // A dissolving tile shrinks and flickers.
      const size = mix(SETTINGS.smallest, SETTINGS.largest, pulse) * (1 - 0.6 * gone);
      const half = size / 2;
      const flicker = gone > 0 ? (1 - gone) * (0.45 + Math.random() * 0.55) : 1;

      // The tile's four corners on the floor, then on the screen.
      const cx = c, cz = zMid;
      const p1 = project(cx - half, cz - half);
      const p2 = project(cx + half, cz - half);
      const p3 = project(cx + half, cz + half);
      const p4 = project(cx - half, cz + half);

      // Tiles away from the middle are dimmer, like the photo's bright centre patch.
      const centre = Math.exp(-((c / (columns * 0.45)) ** 2));
      const hue = baseHue + (hot - 0.5) * 40;
      const isHot = hot > 0.72;
      const glowAmount = (0.1 + 0.75 * pulse * (isHot ? 1 : 0.3)) * fade * enter * (0.35 + 0.65 * centre) * flicker;

      if (glowAmount < 0.01) continue;   // too faint to see: skip it and save time

      ctx.beginPath();
      ctx.moveTo(p1[0], p1[1]);
      ctx.lineTo(p2[0], p2[1]);
      ctx.lineTo(p3[0], p3[1]);
      ctx.lineTo(p4[0], p4[1]);
      ctx.closePath();

      ctx.fillStyle = `hsla(${hue}, 95%, ${45 + 25 * pulse}%, ${glowAmount})`;
      ctx.fill();
      ctx.strokeStyle = `hsla(${hue}, 100%, 75%, ${Math.min(1, glowAmount * 1.8)})`;
      ctx.lineWidth = 1;
      ctx.stroke();

      // Hot tiles near their biggest get a halo: a wide, faint outline (much faster than a real blur).
      if (isHot && pulse > 0.5) {
        ctx.strokeStyle = `hsla(${hue}, 100%, 65%, ${glowAmount * 0.35})`;
        ctx.lineWidth = 8 * fade;
        ctx.stroke();
      }
    }
  }

  ctx.globalCompositeOperation = "source-over";

  // The grid on top of the tiles: crisp pink lines, running into the distance and across, fading towards the
  // horizon. The cross lines slide along with the tiles.
  const horizonY = H * SETTINGS.horizon;
  // Each line is drawn twice: wide and faint (the glow), then thin and bright (the line itself).
  const passes = [[4, 0.22], [1.2, 0.9]];
  for (const [width, strength] of passes) {
    ctx.lineWidth = width;
    const line = ctx.createLinearGradient(0, H, 0, horizonY);
    line.addColorStop(0, `rgba(255, 80, 210, ${strength})`);
    line.addColorStop(0.7, `rgba(255, 80, 210, ${strength * 0.35})`);
    line.addColorStop(1, "rgba(255, 80, 210, 0)");
    ctx.strokeStyle = line;
    ctx.beginPath();
    for (let c = -columns; c <= columns + 1; c++) {
      const [x1, y1] = project(c - 0.5, NEAREST);
      const [x2, y2] = project(c - 0.5, rows);
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    }
    ctx.stroke();
    for (let r = 0; r <= rows; r++) {
      const z = r - shift + NEAREST;
      if (z < NEAREST) continue;
      const [xl, y] = project(-columns - 0.5, z);
      const [xr] = project(columns + 0.5, z);
      if (y - horizonY < 1) break;                       // too close to the horizon to see
      const fade = Math.pow(1 - clamp01((z - NEAREST) / rows), 2.2);
      ctx.strokeStyle = `rgba(255, 80, 210, ${strength * fade})`;
      ctx.beginPath();
      ctx.moveTo(xl, y);
      ctx.lineTo(xr, y);
      ctx.stroke();
    }
  }
}

// ---------------------------------------------------------------------------------------------
// One frame = background + floor. requestAnimationFrame calls it again and again, forever.
// ---------------------------------------------------------------------------------------------
function draw(time) {
  drawBackground(time);
  drawFloor(time);
}

function loop(now) {
  draw(now / 1000);                // now is in milliseconds; the drawing works in seconds
  requestAnimationFrame(loop);
}

resize();
if (reduceMotion) draw(0);         // people who asked for less motion get a still picture
else requestAnimationFrame(loop);
})();
