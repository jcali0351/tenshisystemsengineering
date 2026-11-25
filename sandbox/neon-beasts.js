// neon-beasts.js: a DRAGON and a PHOENIX made of thousands of tiny fizzing particles, chasing each other round the
// sky behind the headline (neon preview only).
//
//   Dragon  (~5,000 specks): a Chinese PARADE dragon (the kind carried on poles at New Year). A big box-shaped head
//           with a wide-open mouth, teeth and a curling tongue, huge round eyes under bushy brows, branching antlers,
//           a shaggy mane and a long hanging beard. A thick, even tube of a body with gold bands, a gold fin along the
//           back and a fringe of hair swaying underneath. It moves in big up-and-down humps, as if the dancers below
//           were lifting it in turn, and ends in a fan-shaped tail tuft. It sheds drifting violet sparks.
//   Phoenix (~1,900 specks): gold, orange and pink. Flapping feathered wings, a crested head and five long tail
//           plumes that curl and end in glowing "eyes". It sheds rising fire embers.
//
// "Fizzy": every speck is tiny (1–2 px), flickers every frame and jitters a fraction of a pixel, so the creatures
// look like they're made of crackling static light. They loop round each other like yin and yang, and drift
// towards the mouse when it's over the sky. They pulse with the music's beat. "Reduce motion" turns them off.
//
// They can be SHOT (neon-game.js asks through window.neonBeasts). Every hit knocks specks off where it lands, and
// as they get weaker they fall apart piece by piece: the dragon loses its tail a chunk at a time, the phoenix its
// tail plumes and outer feathers. At zero health the whole creature bursts into a cloud of specks (100 points in
// the game), then re-forms a little later.
(function () {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  // ================================================ SETTINGS ================================================
  const BEASTS = {
    dragonSegments: 84,      // how long the dragon is (body pieces)
    dragonSpacing: 12,        // pixels between body pieces
    dragonThickness: 26,     // body radius at its thickest, in pixels
    dragonSpeed: 0.00016,    // how fast the dragon flies its loop
    phoenixSize: 1.8,          // 1 = normal; 1.5 = half as big again
    sparksPerFrame: 22,      // how many loose sparks they shed each frame
    opacity: 1,           // overall strength
    followMouse: 0.25,       // how strongly they drift towards the mouse over the sky (0 = not at all)
    dragonHealth: 14,        // how much damage the dragon takes before it explodes (a laser hit does 1, a rocket 6)
    phoenixHealth: 10,       // the same for the phoenix
    respawnSeconds: 25,      // how long until an exploded creature re-forms
    dragon: true,            // false = no dragon
    phoenix: true,           // false = no phoenix
  };
  if (window.TENSHI_TUNE) window.TENSHI_TUNE(BEASTS, (window.TENSHI_GAMES || {}).sky);   // your values from game_settings.py
  // ==========================================================================================================

  const canvas = document.createElement("canvas");
  canvas.id = "neon-beasts";
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;z-index:1;pointer-events:none";
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  let W = 0, H = 0;
  function resize() {
    const ratio = window.TenshiDisplay ? window.TenshiDisplay.pixelRatio(window.innerWidth, window.innerHeight) : Math.min(window.devicePixelRatio || 1, 2);   // fits the display (neon-display.js)
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * ratio); canvas.height = Math.round(H * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  resize();
  window.addEventListener("resize", resize);
  window.addEventListener("tenshi:display", resize);

  const rand = (a, b) => a + Math.random() * (b - a);
  const lerp = (a, b, t) => a + (b - a) * t;
  // Colours as [r, g, b]; mixed along the body.
  const PURPLE = [138, 63, 252], PINK = [255, 43, 214], LILAC = [215, 170, 255], GOLD = [255, 196, 90], ORANGE = [255, 138, 43], FIRE_PINK = [255, 90, 160], WHITE = [255, 245, 235];
  const mixColor = (a, b, t) => [lerp(a[0], b[0], t) | 0, lerp(a[1], b[1], t) | 0, lerp(a[2], b[2], t) | 0];
  const css = c => `rgb(${c[0]},${c[1]},${c[2]})`;

  const mouse = { x: -9999, y: -9999 };
  window.addEventListener("pointermove", e => { mouse.x = e.clientX; mouse.y = e.clientY; });
  const overSky = () => mouse.y > 0 && mouse.y < H * 0.55;

  // ================================================ THE DRAGON ================================================
  // Its head flies a looping path; the body follows the exact trail the head left behind, like a kite's tail.
  const trail = [];             // past head positions, newest first
  const dragon = { x: 0, y: 0, angle: 0 };

  // Body specks: each belongs to a body piece and sits somewhere across the body's width.
  // Every sixth piece is a gold band (like the hoops of a parade dragon's fabric body).
  const bodySpecks = [];
  for (let s = 0; s < BEASTS.dragonSegments; s++) {
    const t = s / BEASTS.dragonSegments, band = s % 6 === 0;
    const color = band ? GOLD : mixColor(PURPLE, PINK, Math.min(1, t * 1.3));
    for (let k = 0; k < 40; k++) bodySpecks.push({ s, across: rand(-1, 1), along: rand(-0.6, 0.6), size: rand(0.8, 1.8), color: css(k % 7 === 0 ? LILAC : color), phase: Math.random() * 6.28 });
    for (let k = 0; k < 6; k++) bodySpecks.push({ s, ridge: k / 6, size: rand(1, 1.9), color: css(k % 2 ? GOLD : ORANGE), phase: Math.random() * 6.28 });   // gold back fin
    for (let k = 0; k < 9; k++) bodySpecks.push({ s, fringe: Math.random(), sway: rand(-1, 1), size: rand(0.8, 1.5), color: css(mixColor(GOLD, WHITE, Math.random() * 0.6)), phase: Math.random() * 6.28 });   // hair underneath
  }
  // The tail tuft: a fan of long hair at the very end.
  for (let k = 0; k < 260; k++) bodySpecks.push({ s: BEASTS.dragonSegments - 1, tuft: Math.random(), fan: rand(-1, 1), size: rand(0.9, 1.8), color: css(mixColor(GOLD, PINK, Math.random())), phase: Math.random() * 6.28 });
  // The body's thickness along its length: a short neck, then an even, fat tube, narrowing only near the tail.
  const thickness = t => BEASTS.dragonThickness * (t < 0.05 ? 0.75 + t * 5 : t < 0.85 ? 1 - 0.15 * (t - 0.05) / 0.8 : 0.85 - 3 * (t - 0.85)) + 1.5;

  // The head, drawn in its own little map (x points forward, y points down), scaled up when drawn.
  const headSpecks = [];
  function addLine(list, pts, n, color, size = [0.9, 1.7], spread = 0) {
    for (let i = 0; i < n; i++) {
      const t = Math.random() * (pts.length - 1), k = Math.floor(t), f = t - k, a = pts[k], b = pts[Math.min(k + 1, pts.length - 1)];
      list.push({ x: lerp(a[0], b[0], f) + rand(-spread, spread), y: lerp(a[1], b[1], f) + rand(-spread, spread), size: rand(...size), color: css(color), phase: Math.random() * 6.28 });
    }
  }
  function addFill(list, outline, n, color) {
    // Specks scattered inside a shape (picked at random, kept if inside).
    const xs = outline.map(p => p[0]), ys = outline.map(p => p[1]);
    let made = 0, tries = 0;
    while (made < n && tries++ < n * 20) {
      const x = rand(Math.min(...xs), Math.max(...xs)), y = rand(Math.min(...ys), Math.max(...ys));
      let inside = false;
      for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
        const [xi, yi] = outline[i], [xj, yj] = outline[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) { list.push({ x, y, size: rand(0.8, 1.6), color: css(color), phase: Math.random() * 6.28 }); made++; }
    }
  }
  // Parade-dragon head (x forward, y down). Upper head and snout (the snout curls up at the tip into a big nose).
  const upper = [[-0.35, -0.55], [0.25, -0.75], [0.85, -0.68], [1.35, -0.52], [1.7, -0.62], [1.95, -0.48], [1.9, -0.25], [1.55, -0.12], [0.9, -0.1], [0.3, -0.02], [-0.35, 0.1]];
  addFill(headSpecks, upper, 900, PURPLE);
  addLine(headSpecks, upper.concat([upper[0]]), 320, GOLD, [1, 1.9]);                                    // gold trim
  for (let k = 0; k < 70; k++) { const a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * 0.17; headSpecks.push({ x: 1.82 + Math.cos(a) * r, y: -0.5 + Math.sin(a) * r, size: rand(1, 1.8), color: css(PINK), phase: Math.random() * 6.28 }); }   // nose bulb
  // Lower jaw: hinged at the back, so the whole mouth swings open (marked "jaw").
  const jawStart = headSpecks.length;
  const lower = [[0.15, 0.08], [0.9, 0.12], [1.5, 0.2], [1.6, 0.32], [1.0, 0.4], [0.2, 0.32]];
  addFill(headSpecks, lower, 320, PINK);
  addLine(headSpecks, lower.concat([lower[0]]), 130, GOLD, [1, 1.8]);
  addLine(headSpecks, [[0.4, 0.1], [0.9, 0.0], [1.3, -0.1], [1.65, -0.35], [1.9, -0.2]], 70, FIRE_PINK, [1.1, 2], 0.03);   // tongue curling out
  for (let k = 0; k < 7; k++) addLine(headSpecks, [[0.5 + k * 0.15, 0.13], [0.53 + k * 0.15, 0.03]], 6, WHITE, [1.1, 1.8]);  // bottom teeth
  // The beard: long strands hanging from the chin (move with the jaw).
  for (let k = 0; k < 9; k++) addLine(headSpecks, [[0.3 + k * 0.13, 0.36], [0.2 + k * 0.1, 0.85 + Math.random() * 0.35], [0.05 + k * 0.08, 1.2 + Math.random() * 0.3]], 26, k % 2 ? GOLD : WHITE, [0.8, 1.5], 0.025);
  for (let i = jawStart; i < headSpecks.length; i++) headSpecks[i].jaw = true;
  for (let k = 0; k < 8; k++) addLine(headSpecks, [[0.55 + k * 0.17, -0.1], [0.58 + k * 0.17, 0.0]], 6, WHITE, [1.1, 1.8]);  // top teeth
  // Huge round eyes: a white rim, an orange iris and a dark-gold pupil, under a bushy brow.
  for (let k = 0; k < 110; k++) { const a = Math.random() * 6.28, r = 0.2 + rand(-0.025, 0.025); headSpecks.push({ x: 0.75 + Math.cos(a) * r, y: -0.5 + Math.sin(a) * r, size: rand(1, 1.8), color: css(WHITE), phase: 0, eye: true }); }
  for (let k = 0; k < 60; k++) { const a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * 0.13; headSpecks.push({ x: 0.78 + Math.cos(a) * r, y: -0.5 + Math.sin(a) * r, size: rand(1.1, 2.2), color: css(r < 0.05 ? WHITE : ORANGE), phase: 0, eye: true }); }
  addLine(headSpecks, [[0.45, -0.72], [0.7, -0.88], [1.0, -0.82], [1.15, -0.7]], 110, GOLD, [1, 2], 0.06);   // bushy brow
  // Branching antlers.
  addLine(headSpecks, [[0.3, -0.72], [0.0, -1.2], [-0.35, -1.55], [-0.7, -1.7]], 70, LILAC, [1.1, 2]);
  addLine(headSpecks, [[0.0, -1.2], [0.2, -1.55]], 20, LILAC, [1.1, 2]);
  addLine(headSpecks, [[-0.35, -1.55], [-0.25, -1.9]], 20, LILAC, [1.1, 2]);
  addLine(headSpecks, [[0.55, -0.75], [0.4, -1.25], [0.15, -1.6]], 50, GOLD, [1.1, 2]);
  addLine(headSpecks, [[0.4, -1.25], [0.62, -1.48]], 16, GOLD, [1.1, 2]);
  // A big shaggy mane fanning out behind the head.
  for (let k = 0; k < 520; k++) {
    const a = rand(-2.4, 2.4), r = rand(0.45, 1.15);
    headSpecks.push({ x: -0.25 - Math.cos(a) * r * 0.75, y: -0.15 + Math.sin(a) * r, size: rand(0.8, 1.7), color: css(k % 3 ? mixColor(PINK, GOLD, Math.random()) : WHITE), phase: Math.random() * 6.28, mane: rand(0.5, 1) });
  }
  const HEAD_SCALE = 52;

  // Whiskers: two long feelers that ripple behind the head (positions worked out each frame).
  const whiskerSpecks = [];
  for (const side of [-1, 1]) for (let k = 0; k < 120; k++) whiskerSpecks.push({ side, s: Math.pow(Math.random(), 0.8), size: rand(0.8, 1.5), color: css(mixColor(LILAC, PINK, Math.random())), phase: Math.random() * 6.28 });
  // Claws: little three-toed feet on four body pieces.
  const clawSpecks = [];
  for (const s of [12, 20, 38, 46]) for (let k = 0; k < 40; k++) clawSpecks.push({ s, toe: k % 3, along: Math.random(), size: rand(0.9, 1.6), color: css(LILAC), phase: Math.random() * 6.28 });

  // ================================================ THE PHOENIX ================================================
  const phoenix = { x: 0, y: 0, angle: 0, flap: 0 };
  const phoenixTrail = [];
  const P = 30 * BEASTS.phoenixSize;            // the phoenix's size unit, in pixels
  // Body and head (same kind of little map as the dragon's head: x forward, y down).
  const birdSpecks = [];
  addFill(birdSpecks, [[-1, 0], [-0.4, -0.35], [0.5, -0.3], [1.1, -0.15], [1.3, 0], [1.1, 0.15], [0.4, 0.3], [-0.5, 0.3]], 520, GOLD);
  addFill(birdSpecks, [[1.1, -0.18], [1.5, -0.3], [1.85, -0.12], [1.55, 0.05], [1.2, 0.1]], 90, ORANGE);          // head
  addLine(birdSpecks, [[1.85, -0.12], [2.2, -0.02], [1.85, 0.02]], 26, WHITE);                                    // beak
  addLine(birdSpecks, [[1.4, -0.3], [1.1, -0.8], [0.8, -1.0]], 40, FIRE_PINK, [1, 2]);                            // crest
  addLine(birdSpecks, [[1.5, -0.28], [1.4, -0.85], [1.25, -1.15]], 40, ORANGE, [1, 2]);
  addLine(birdSpecks, [[1.6, -0.25], [1.7, -0.7], [1.65, -0.95]], 30, GOLD, [1, 2]);
  for (let k = 0; k < 16; k++) birdSpecks.push({ x: 1.55 + rand(-0.04, 0.04), y: -0.13 + rand(-0.04, 0.04), size: rand(1.2, 2.2), color: css(WHITE), phase: 0, eye: true });
  // Wings: feathers fanning out from a wing bone. Each speck remembers which feather and how far along it is.
  const wingSpecks = [];
  for (const side of [-1, 1]) for (let f = 0; f < 14; f++) for (let k = 0; k < 34; k++) {
    const along = Math.random();
    wingSpecks.push({ side, f, along, size: rand(0.8, 1.7), color: css(mixColor(GOLD, f > 9 ? FIRE_PINK : ORANGE, along)), phase: Math.random() * 6.28 });
  }
  // Tail: five long plumes trailing from the body along its flight path.
  const tailSpecks = [];
  for (let plume = 0; plume < 5; plume++) {
    for (let k = 0; k < 150; k++) { const s = Math.random(); tailSpecks.push({ plume, s, size: rand(0.8, 1.6), color: css(mixColor(ORANGE, FIRE_PINK, s)), phase: Math.random() * 6.28 }); }
    for (let k = 0; k < 22; k++) tailSpecks.push({ plume, s: 1, eyeAngle: Math.random() * 6.28, eyeR: Math.random(), size: rand(1, 1.9), color: css(k % 4 ? GOLD : WHITE), phase: 0 });   // the "eye" at the end
  }

  // ================================================ HEALTH ================================================
  // Each creature: its health, whether it's dead, and every list of specks it's made of (so hits can knock them off).
  const LIFE = {
    dragon: { name: "DRAGON", color: "#d7aaff", max: BEASTS.dragonHealth, hp: BEASTS.dragonHealth, dead: false, respawnAt: 0, alpha: 1, flash: 0,
              lists: [bodySpecks, headSpecks, whiskerSpecks, clawSpecks], at: dragon },
    phoenix: { name: "PHOENIX", color: "#ffc45a", max: BEASTS.phoenixHealth, hp: BEASTS.phoenixHealth, dead: false, respawnAt: 0, alpha: 1, flash: 0,
               lists: [birdSpecks, wingSpecks, tailSpecks], at: phoenix },
  };
  for (const k of ["dragon", "phoenix"]) if (BEASTS[k] === false) { LIFE[k].dead = true; LIFE[k].respawnAt = Infinity; }
  let cur = LIFE.dragon;          // the creature being drawn right now

  // Specks knocked off fly away, tumble a little and fade.
  const debris = [];
  function knockOff(o, fromX, fromY, power) {
    if (o.gone || o.sx === undefined) return;
    o.gone = true;
    const dx = o.sx - fromX, dy = o.sy - fromY, d = Math.hypot(dx, dy) || 1, v = rand(0.6, 1.4) * power;
    debris.push({ x: o.sx, y: o.sy, vx: (dx / d) * v + rand(-0.6, 0.6), vy: (dy / d) * v + rand(-0.6, 0.6), life: 1, fade: rand(0.008, 0.02), size: o.size * rand(1, 1.6), color: o.color });
  }
  const alive = b => !b.dead && b.alpha > 0.6;     // still re-forming = can't be hit yet
  function forEachSpeck(b, fn) { for (const list of b.lists) for (const o of list) if (!o.gone && o.sx !== undefined) fn(o); }

  // Damage a creature. `test(o)` says which specks the hit itself knocks off.
  function damage(b, dmg, test, hitX, hitY) {
    const now = performance.now();
    forEachSpeck(b, o => { if (test(o)) knockOff(o, hitX, hitY, 3); });
    b.hp -= dmg; b.flash = 1;
    const left = Math.max(0, b.hp / b.max);
    // Falling apart piece by piece as it weakens.
    if (b === LIFE.dragon) {
      const cut = BEASTS.dragonSegments * (0.3 + 0.7 * left);             // the tail drops off a chunk at a time
      for (const o of bodySpecks) if (o.s >= cut) knockOff(o, o.sx, o.sy - 1, 1.2);
      for (const o of clawSpecks) if (o.s >= cut) knockOff(o, o.sx, o.sy - 1, 1.2);
      if (left < 0.5) for (const o of whiskerSpecks) if (o.s > left * 2) knockOff(o, o.sx, o.sy - 1, 1);
    } else {
      for (const o of tailSpecks) if (o.s > 0.2 + 0.8 * left) knockOff(o, o.sx, o.sy - 1, 1.2);   // tail plumes shorten
      for (const o of wingSpecks) if (o.f > 13 * (0.35 + 0.65 * left)) knockOff(o, o.sx, o.sy - 1, 1.2);   // outer feathers go
    }
    const result = { name: b.name, color: b.color, killed: false, x: b.at.x, y: b.at.y, hitX, hitY };
    if (b.hp <= 0) {                                                        // BOOM: everything left bursts outwards
      forEachSpeck(b, o => knockOff(o, b.at.x, b.at.y, rand(3, 9)));
      for (let k = 0; k < 120; k++) { const a = Math.random() * 6.28, v = rand(2, 10); debris.push({ x: b.at.x, y: b.at.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, fade: rand(0.01, 0.025), size: rand(1.5, 3), color: k % 3 ? b.color : "#ffffff" }); }
      b.dead = true; b.respawnAt = now + BEASTS.respawnSeconds * 1000;
      result.killed = true;
    }
    return result;
  }
  // Which living creature has a speck closest to (x, y), within `reach`?
  function closest(x, y, reach) {
    let best = null, bestD = reach;
    for (const b of Object.values(LIFE)) if (alive(b)) forEachSpeck(b, o => { const d = Math.hypot(o.sx - x, o.sy - y); if (d < bestD) { bestD = d; best = { b, x: o.sx, y: o.sy }; } });
    return best;
  }
  function distToLine(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1, t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }

  // What the game calls. Each returns what was hit (or nothing): name, colour, killed, where.
  window.neonBeasts = {
    // One shot at a point (laser, shotgun pellet, bullet, lightning).
    hitAt(x, y, reach, dmg) {
      const c = closest(x, y, reach); if (!c) return null;
      const r = Math.min(60, 16 + dmg * 7);
      return damage(c.b, dmg, o => Math.hypot(o.sx - c.x, o.sy - c.y) < r, c.x, c.y);
    },
    // An explosion: every creature inside the radius is hit.
    hitArea(x, y, radius, dmg) {
      const out = [];
      for (const b of Object.values(LIFE)) {
        if (!alive(b)) continue;
        let inside = false; forEachSpeck(b, o => { if (!inside && Math.hypot(o.sx - x, o.sy - y) < radius) inside = true; });
        if (inside) out.push(damage(b, dmg, o => Math.hypot(o.sx - x, o.sy - y) < radius * 0.7, x, y));
      }
      return out;
    },
    // A beam: every creature the line passes through is hit, with a groove cut along the line.
    hitLine(x1, y1, x2, y2, reach, dmg) {
      const out = [];
      for (const b of Object.values(LIFE)) {
        if (!alive(b)) continue;
        let near = null; forEachSpeck(b, o => { if (!near && distToLine(o.sx, o.sy, x1, y1, x2, y2) < reach) near = o; });
        if (near) out.push(damage(b, dmg, o => distToLine(o.sx, o.sy, x1, y1, x2, y2) < reach * 1.6, near.sx, near.sy));
      }
      return out;
    },
    state: () => Object.fromEntries(Object.entries(LIFE).map(([k, b]) => [k, { hp: +b.hp.toFixed(1), dead: b.dead, x: Math.round(b.at.x), y: Math.round(b.at.y) }])),
  };

  // ================================================ LOOSE SPARKS ================================================
  const sparks = [];
  function shed(x, y, color, rise) {
    sparks.push({ x, y, vx: rand(-0.4, 0.4), vy: rise ? rand(-1.2, -0.3) : rand(-0.3, 0.4), life: 1, fade: rand(0.012, 0.03), size: rand(0.7, 1.6), color });
  }

  // ================================================ DRAWING HELPERS ================================================
  let beat = 0;
  // One fizzy speck: it flickers and jitters every frame. It remembers where it was drawn (so shots can find it),
  // and isn't drawn once it's been knocked off. `depth` (0 far ... 1 near) makes the far side dimmer and smaller.
  function speck(o, x, y, size, color, phase, strength = 1, depth = 1, scale = 1) {
    o.sx = x; o.sy = y;
    if (o.gone) return;
    const a = BEASTS.opacity * strength * (0.25 + 0.75 * depth) * cur.alpha * (0.45 + Math.random() * 0.55) * (0.85 + beat * 0.3);
    const c = cur.flash > 0.2 && Math.random() < cur.flash ? "#ffffff" : color;   // flashes white when hit
    const s = size * scale * (0.75 + 0.35 * depth) * (1 + beat * 0.3);
    dot(x + rand(-0.5, 0.5) - s / 2, y + rand(-0.5, 0.5) - s / 2, s, c, a);
  }
  // Performance: the two creatures are ~9,000 specks a frame. Drawing each one on its own (set colour, set opacity,
  // fillRect) was one of the arcade's biggest costs. Specks are now sorted into batches by colour and one of 10
  // opacity steps, and each batch is drawn as one shape (flushDots, at the end of the frame). With "lighter" blending
  // the order they're drawn in doesn't matter.
  const STEPS = 10, batches = new Map();
  function dot(x, y, s, color, alpha) {
    const k = Math.round(Math.min(1, alpha) * STEPS);
    if (k <= 0) return;
    let lv = batches.get(color);
    if (!lv) { lv = Array.from({ length: STEPS + 1 }, () => []); batches.set(color, lv); }
    lv[k].push(x, y, s);
  }
  function flushDots() {
    for (const [color, lv] of batches) {
      ctx.fillStyle = color;
      for (let k = 1; k <= STEPS; k++) {
        const b = lv[k]; if (!b.length) continue;
        ctx.globalAlpha = k / STEPS;
        ctx.beginPath();
        for (let i = 0; i < b.length; i += 3) ctx.rect(b[i], b[i + 1], b[i + 2], b[i + 2]);
        ctx.fill();
        b.length = 0;
      }
    }
  }
  // Remove item i from a list whose order doesn't matter, without shifting everything after it.
  function drop(list, i) { const last = list.pop(); if (i < list.length) list[i] = last; }

  // ---- 3D ----
  // Each creature is a little 3D model: x points forward, y down, z out to its right side. It's turned by
  // roll (round its own length), pitch (nose up/down) and yaw (turning towards or away from you), then laid along
  // its flight direction on screen, with perspective: nearer parts are bigger and brighter.
  const FOV = 900;
  const persp = z => FOV / (FOV + z);
  function orient(b) {
    const cr = Math.cos(b.roll), sr = Math.sin(b.roll), cp = Math.cos(b.pitch), sp = Math.sin(b.pitch);
    const cy = Math.cos(b.yaw), sy = Math.sin(b.yaw), ca = Math.cos(b.angle), sa = Math.sin(b.angle);
    return { cr, sr, cp, sp, cy, sy, ca, sa };
  }
  // Model point -> [screen x, screen y, depth 0..1, perspective scale].
  function project(b, R, scale, lx, ly, lz) {
    const y1 = ly * R.cr - lz * R.sr, z1 = ly * R.sr + lz * R.cr;                   // roll
    const x2 = lx * R.cp - y1 * R.sp, y2 = lx * R.sp + y1 * R.cp;                   // pitch
    const x3 = x2 * R.cy + z1 * R.sy, z3 = -x2 * R.sy + z1 * R.cy;                   // yaw
    const X = x3 * R.ca - y2 * R.sa, Y = x3 * R.sa + y2 * R.ca;                      // along the flight direction
    const f = persp(b.z + z3 * scale);
    return [b.x + X * scale * f, b.y + Y * scale * f, clamp01(0.5 - z3 * 0.6), f];
  }
  const clamp01 = v => Math.max(0, Math.min(1, v));
  // Every so often, a full barrel roll (smoothly, over a second and a half).
  function barrel(now, every, offset) {
    const k = ((now + offset) % every) / 1500;
    return k < 1 ? (1 - Math.cos(k * Math.PI)) * Math.PI : 0;
  }
  // Give the flat little maps some thickness: each speck gets a depth (z), once.
  function thicken(list, fn) { for (const o of list) if (o.z === undefined) o.z = fn(o); }
  thicken(headSpecks, h => h.eye ? (Math.random() < 0.5 ? -0.32 : 0.32) : h.mane ? rand(-0.9, 0.9) : Math.abs(h.y) > 0.9 ? (Math.random() < 0.5 ? -0.28 : 0.28) : rand(-0.38, 0.38));
  thicken(birdSpecks, b => b.eye ? (Math.random() < 0.5 ? -0.16 : 0.16) : b.y < -0.4 ? rand(-0.06, 0.06) : rand(-0.3, 0.3));

  // ================================================ THE LOOP ================================================
  const hero = document.querySelector(".hero");
  function frame(now) {
    ctx.clearRect(0, 0, W, H);
    const heroBottom = hero ? hero.getBoundingClientRect().bottom : H;
    const visible = Math.max(0, Math.min(1, heroBottom / H));
    canvas.style.opacity = visible;
    if (visible < 0.02) return requestAnimationFrame(frame);
    beat = window.neonBeat ? window.neonBeat() : 0;
    const speed = window.neonInsane ? 2.2 : 1;
    const t = now * BEASTS.dragonSpeed * speed;

    // ---- Where they fly: two interlocking loops round the sky, half a turn apart (yin and yang) ----
    const cx = W / 2, cy = H * 0.27, rx = Math.min(W * 0.33, 520), ry = H * 0.13;
    let dx = cx + Math.cos(t) * rx, dy = cy + Math.sin(t * 2) * ry;                         // figure-of-eight
    let px = cx + Math.cos(t + Math.PI) * rx * 0.85, py = cy + Math.sin((t + Math.PI) * 2) * ry * 0.9 - H * 0.03;
    if (overSky() && BEASTS.followMouse) {                                                    // drift towards the mouse
      dx = lerp(dx, mouse.x, BEASTS.followMouse); dy = lerp(dy, mouse.y, BEASTS.followMouse * 0.6);
      px = lerp(px, mouse.x, BEASTS.followMouse * 0.6); py = lerp(py, mouse.y, BEASTS.followMouse * 0.4);
    }
    // Ease towards the target (smooth turns), and work out which way each is heading.
    for (const [b, tx, ty] of [[dragon, dx, dy], [phoenix, px, py]]) {
      const nx = lerp(b.x || tx, tx, 0.06), ny = lerp(b.y || ty, ty, 0.06);
      if (Math.hypot(nx - b.x, ny - b.y) > 0.05) b.angle = Math.atan2(ny - b.y, nx - b.x);
      b.x = nx; b.y = ny;
    }
    // ---- 3D motion: they swoop towards you and away (one near while the other is far), bank, turn and roll ----
    dragon.z = Math.sin(t * 1.5) * 300;
    phoenix.z = Math.sin(t * 1.5 + Math.PI) * 300;
    for (const [b, k] of [[dragon, 0], [phoenix, 1]]) {
      // Flying left would put them upside down, so they roll over smoothly to stay upright (unless mid-stunt).
      const want = Math.cos(b.angle) < 0 ? Math.PI : 0;
      b.flip = b.flip === undefined ? want : b.flip + (want - b.flip) * 0.05;
      b.roll = b.flip + Math.sin(now * (k ? 0.0006 : 0.00042)) * (k ? 1.25 : 0.9) + barrel(now, k ? 11000 : 14000, k ? 4000 : 0);
      b.yaw = Math.sin(now * (k ? 0.00033 : 0.00027) + k) * (k ? 1.15 : 0.85);
      b.pitch = Math.sin(now * 0.0005 + k * 2) * 0.3;
    }
    trail.unshift([dragon.x, dragon.y, dragon.z]); if (trail.length > 2400) trail.length = 2400;
    phoenixTrail.unshift([phoenix.x, phoenix.y, phoenix.z]); if (phoenixTrail.length > 300) phoenixTrail.length = 300;

    ctx.globalCompositeOperation = "lighter";

    // ---- Health: re-form after exploding (fading back in, whole again); the white hit-flash fades ----
    for (const b of Object.values(LIFE)) {
      if (b.dead && now > b.respawnAt) { b.dead = false; b.hp = b.max; b.alpha = 0; for (const list of b.lists) for (const o of list) o.gone = false; }
      if (!b.dead && b.alpha < 1) b.alpha = Math.min(1, b.alpha + 0.008);
      b.flash = Math.max(0, b.flash - 0.08);
    }
    cur = LIFE.dragon;

    // ---- Dragon body: walk back along the trail, placing a body piece every few pixels ----
    const spine = [];
    let dist = 0, next = 0;
    for (let i = 1; i < trail.length && spine.length < BEASTS.dragonSegments; i++) {
      const [ax, ay, az] = trail[i - 1], [bx, by, bz] = trail[i];
      const step = Math.hypot(bx - ax, by - ay);
      dist += step;
      while (dist >= next && spine.length < BEASTS.dragonSegments) {
        const f = step ? 1 - (dist - next) / step : 0;
        const x = lerp(ax, bx, f), y = lerp(ay, by, f), z = lerp(az || 0, bz || 0, f);
        const tx = ax - bx || 0.001, ty = ay - by;
        const len = Math.hypot(tx, ty) || 1;
        let nx = -ty / len, ny = tx / len;
        if (ny > 0) { nx = -nx; ny = -ny; }                // "up" side of the body
        // The body is a tube. It twists round as the dragon rolls (the twist travels down the body a little late).
        const twist = (dragon.roll - dragon.flip) * Math.max(0, 1 - spine.length / 160) + Math.sin(spine.length * 0.12 - now * 0.002) * 0.5;
        spine.push({ x, y, z, nx, ny, f: persp(z), twist, wave: Math.sin(spine.length * 0.16 - now * 0.0035) * 18 * Math.min(1, spine.length / 10) });
        next += BEASTS.dragonSpacing;
      }
    }
    // A point on the tube: `around` is the angle round the body (0 = top), `out` how far from the middle.
    function tube(seg, around, out, alongX = 0, alongY = 0) {
      const a = around + seg.twist, c = Math.cos(a), sn = Math.sin(a), f = seg.f;
      return [seg.x + (seg.nx * c * out + alongX) * f, seg.y + (seg.ny * c * out + alongY) * f + seg.wave * f, clamp01(0.5 - sn * 0.6), f];
    }
    if (spine.length > 4 && !LIFE.dragon.dead) {
      for (const p of bodySpecks) {
        const seg = spine[p.s]; if (!seg) continue;
        const tt = p.s / BEASTS.dragonSegments, r = thickness(tt);
        let pt, strength = 1;
        if (p.tuft !== undefined) {                          // tail tuft: a fan of hair streaming back off the tail
          const prev = spine[p.s - 1] || seg, bx = seg.x - prev.x, by = seg.y - prev.y, bl = Math.hypot(bx, by) || 1;
          const len = 10 + p.tuft * 60, spread = p.fan * (8 + p.tuft * 30) + Math.sin(now * 0.006 + p.tuft * 5) * 6 * p.tuft;
          pt = tube(seg, p.fan > 0 ? 0 : Math.PI, Math.abs(spread), (bx / bl) * len, (by / bl) * len); strength = 1 - p.tuft * 0.5;
        } else if (p.fringe !== undefined) {                 // hair hanging under the belly, swaying
          pt = tube(seg, Math.PI + p.sway * 0.5 + Math.sin(now * 0.005 + p.s * 0.5) * 0.2 * p.fringe, r + 2 + p.fringe * 14); strength = 1 - p.fringe * 0.5;
        } else if (p.ridge !== undefined) {                  // gold fin along the back, rippling
          pt = tube(seg, (p.ridge - 0.5) * 0.25, r + 3 + 6 * Math.abs(Math.sin(p.s * 0.9 + now * 0.003)) + p.ridge * 5);
        } else {
          // Scales all the way round the tube, with a shimmer rippling down the body.
          const shimmer = 0.55 + 0.45 * Math.sin(p.s * 1.3 + p.across * 3 - now * 0.006);
          const along = p.along * BEASTS.dragonSpacing;
          pt = tube(seg, p.across * Math.PI, r, seg.ny * along, -seg.nx * along); strength = shimmer;
        }
        speck(p, pt[0], pt[1], p.size, p.color, p.phase, strength, pt[2], pt[3]);
      }
      for (const c of clawSpecks) {                          // claws reach down from the belly and curl
        const seg = spine[c.s]; if (!seg) continue;
        const r = thickness(c.s / BEASTS.dragonSegments), reach = r + 8 + 18 * c.along;
        const pt = tube(seg, Math.PI + (c.toe - 1) * 0.35 * c.along + (c.s % 2 ? 0.5 : -0.5), reach);
        speck(c, pt[0], pt[1], c.size, c.color, c.phase, 1, pt[2], pt[3]);
      }
      // ---- Dragon head (full 3D) ----
      const R = orient(dragon);
      const jaw = 0.12 + 0.32 * Math.max(0, Math.sin(now * 0.0022));   // the mouth snaps wide open and shut
      const cj = Math.cos(jaw), sj = Math.sin(jaw);
      for (const h of headSpecks) {
        let lx = h.x, ly = h.y;
        if (h.jaw) { const ox = lx - 0.15, oy = ly - 0.08; lx = 0.15 + ox * cj - oy * sj; ly = 0.08 + ox * sj + oy * cj; }   // swing round the hinge
        if (h.mane) { lx += Math.sin(now * 0.006 + h.y * 4) * 0.06 * h.mane; ly += Math.cos(now * 0.005 + h.x * 4) * 0.04 * h.mane; }
        const [x, y, d, f] = project(dragon, R, HEAD_SCALE, lx, ly, h.z);
        speck(h, x, y, h.size * (h.eye ? 1 + beat : 1), h.color, h.phase, h.eye ? 1.4 : 1, d, f);
      }
      // Whiskers ripple back from the snout, one on each side.
      for (const w of whiskerSpecks) {
        const lx = 1.75 - w.s * 3.8, ly = -0.3 + 0.2 * w.s + Math.sin(w.s * 7 - now * 0.006 + w.side) * 0.3 * w.s;
        const lz = w.side * (0.25 + w.s * 0.9) + Math.cos(w.s * 6 - now * 0.005) * 0.2 * w.s;
        const [x, y, d, f] = project(dragon, R, HEAD_SCALE, lx, ly, lz);
        speck(w, x, y, w.size, w.color, w.phase, 1 - w.s * 0.6, d, f);
      }
      // Violet sparks shed from the body.
      for (let k = 0; k < BEASTS.sparksPerFrame / 2; k++) {
        const seg = spine[Math.floor(Math.random() * spine.length * (0.3 + 0.7 * Math.max(0, LIFE.dragon.hp / LIFE.dragon.max)))];
        if (seg) shed(seg.x + rand(-6, 6), seg.y + rand(-6, 6), Math.random() < 0.5 ? "rgb(200,140,255)" : "rgb(255,110,210)", false);
      }
    }

    // ---- Phoenix (full 3D) ----
    phoenix.flap += 0.11 * speed * (1 + beat * 0.5);
    cur = LIFE.phoenix;
    if (!LIFE.phoenix.dead) {
      const R = orient(phoenix), pa = phoenix.angle;
      // Tail plumes: follow the phoenix's own trail, fanning out; the fan turns with the bird's roll.
      const rc = Math.cos(phoenix.roll - phoenix.flip), rs = Math.sin(phoenix.roll - phoenix.flip);
      for (const tp of tailSpecks) {
        const idx = Math.min(phoenixTrail.length - 1, Math.floor(tp.s * 160));
        const [bx, by, bz] = phoenixTrail[idx] || [phoenix.x, phoenix.y, phoenix.z];
        const fan = (tp.plume - 2) * (12 + tp.s * 40) + Math.sin(tp.s * 9 - now * 0.005 + tp.plume) * 10 * tp.s;
        const f = persp((bz || 0) + fan * rs);
        let x = bx - Math.sin(pa) * fan * rc * f, y = by + Math.cos(pa) * fan * rc * f;
        if (tp.eyeAngle !== undefined) { x += Math.cos(tp.eyeAngle) * 6 * tp.eyeR * f; y += Math.sin(tp.eyeAngle) * 6 * tp.eyeR * f; }
        speck(tp, x, y, tp.size, tp.color, tp.phase, tp.s === 1 ? 1.3 : 1 - tp.s * 0.4, clamp01(0.5 - (fan * rs) / 80), f);
      }
      // Wings: they stick out to the sides (z) and beat up and down; feathers sweep back from the wing bone.
      const a = 0.2 + 0.85 * Math.sin(phoenix.flap);
      for (const w of wingSpecks) {
        const bone = (w.f / 13) * 2.6, featherLen = 1.1 * (1 - w.f / 13 * 0.35);
        const lx = 0.25 - bone * 0.3 - w.along * featherLen;
        const ly = -Math.sin(a) * bone * 0.9 - w.along * 0.12;
        const lz = w.side * (0.2 + Math.cos(a) * bone);
        const [x, y, d, f] = project(phoenix, R, P, lx, ly, lz);
        speck(w, x, y, w.size, w.color, w.phase, 1, d, f);
      }
      for (const b of birdSpecks) {
        const [x, y, d, f] = project(phoenix, R, P, b.x, b.y, b.z);
        speck(b, x, y, b.size * (b.eye ? 1 + beat : 1), b.color, b.phase, b.eye ? 1.5 : 1, d, f);
      }
      // Fire embers rise from the phoenix and its tail.
      for (let k = 0; k < BEASTS.sparksPerFrame; k++) {
        const [bx, by] = phoenixTrail[Math.floor(Math.random() * Math.min(80, phoenixTrail.length))] || [phoenix.x, phoenix.y];
        shed(bx + rand(-12, 12), by + rand(-10, 10), Math.random() < 0.6 ? "rgb(255,170,70)" : "rgb(255,100,160)", true);
      }
    }

    // ---- Knocked-off specks fly apart, slow down, fall a little and fade ----
    for (let i = debris.length - 1; i >= 0; i--) {
      const d = debris[i];
      d.x += d.vx; d.y += d.vy; d.vx *= 0.96; d.vy = d.vy * 0.96 + 0.04; d.life -= d.fade;
      if (d.life <= 0) { drop(debris, i); continue; }
      dot(d.x, d.y, d.size, d.color, d.life * (0.5 + Math.random() * 0.5));
    }
    if (debris.length > 6000) debris.splice(0, debris.length - 6000);

    // ---- Loose sparks drift, flicker and die ----
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.x += s.vx; s.y += s.vy; s.vx += rand(-0.08, 0.08); s.life -= s.fade;
      if (s.life <= 0) { drop(sparks, i); continue; }
      dot(s.x, s.y, s.size, s.color, BEASTS.opacity * s.life * (0.4 + Math.random() * 0.6));
    }
    if (sparks.length > 1500) sparks.splice(0, sparks.length - 1500);

    flushDots();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
