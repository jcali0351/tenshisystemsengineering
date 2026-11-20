// neon-rts.js: "STATION DEFENSE", a little space strategy game that fills the Mt Fuji photo strip (neon preview only).
// Everything is a real 3D model (ships, aliens, asteroids, crystals), lit by a star, drawn over a parallax starfield.
//
// Your base, the TENSHI CORE, sits in the bottom-left of a big map. Crystals grow around it. Out in the top-right is
// the GLITCH HIVE, which sends bigger and bigger waves at you. Mine crystals, train an army, survive the waves and
// destroy the Hive.
//
//   Your units                         The Glitch
//   SPARK   worker: mines crystals     MITE     fast, weak, bites
//   BLADE   fast fighter, short laser  BRUTE    slow, tough, hits hard
//   LANCER  slow, long-range cannon    SPITTER  shoots from a distance
//
// Controls (mouse):  click a unit to select it (Shift adds), drag a box to select several, right-click to move /
//   attack / mine. A then click = attack-move (fight anything on the way). S = stop. Space = select your whole army.
//   Q / W / E = train Spark / Blade / Lancer. Arrow keys or the screen edges move the camera; click the minimap to jump.
// Controls (touch): tap a unit to select it, drag a box to select several, tap the ground / an enemy / a crystal to
//   command them. Buttons on screen for army, attack-move and training. Tap the minimap to move the camera.
//
// The game only runs while the section is on screen and you've pressed PLAY, so it never slows the rest of the page.
// The map has fog of war: you only see what's near your units; places you've been stay dimly remembered.
(function () {
  const title = document.getElementById("parallax-px1-title");
  const section = title && title.closest(".parallax");
  if (!section) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ================================================ SETTINGS ================================================
  const MAP = { w: 2600, h: 1500 };
  const START = { credits: 150, sparks: 4, blades: 2 };
  const SUPPLY_CAP = 30;
  const WAVES = { first: 75, every: 45 };          // seconds until the first wave, then between waves
  const UNITS = {
    // Yours
    spark:  { name: "MINER",  team: "p", hp: 40,  r: 9,  speed: 1.9, dmg: 3,  range: 18,  cd: 900,  sight: 230, cost: 50,  time: 5,  key: "Q", color: "#d7aaff", tip: "Mining ship. Right-click crystals to mine them." },
    blade:  { name: "INTERCEPTOR",  team: "p", hp: 85,  r: 11, speed: 2.6, dmg: 9,  range: 24,  cd: 550,  sight: 260, cost: 100, time: 7,  key: "W", color: "#ff2bd6", tip: "Fast fighter with twin lasers." },
    lancer: { name: "GUNSHIP", team: "p", hp: 150, r: 15, speed: 1.35, dmg: 24, range: 210, cd: 1500, sight: 300, cost: 175, time: 10, key: "E", color: "#b04dff", splash: 46, tip: "Heavy ship with a turret cannon. Hits groups." },
    core:   { name: "TENSHI STATION", team: "p", hp: 1600, r: 48, building: true, sight: 380, color: "#b04dff" },
    // The Glitch
    mite:    { name: "SWARMLING", team: "e", hp: 32,  r: 8,  speed: 2.7, dmg: 5,  range: 14,  cd: 600,  sight: 240, color: "#ffb347" },
    brute:   { name: "BEHEMOTH", team: "e", hp: 230, r: 17, speed: 1.25, dmg: 26, range: 20, cd: 1200, sight: 240, color: "#ff8a2b" },
    spitter: { name: "SPITTER", team: "e", hp: 70,  r: 11, speed: 1.8, dmg: 11, range: 170, cd: 1300, sight: 260, color: "#ffd166" },
    hive:    { name: "ALIEN HIVE", team: "e", hp: 2400, r: 56, building: true, sight: 300, color: "#ff8a2b" },
  };
  const CRYSTAL = { amount: 1200, carry: 8, mineTime: 1100 };
  // ==========================================================================================================

  const sfx = n => window.neonAudio && window.neonAudio.sfx(n);
  const rand = (a, b) => a + Math.random() * (b - a);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ================================================ THE PAGE ================================================
  section.classList.add("rts-zone");
  const root = document.createElement("div");
  root.className = "rts";
  root.innerHTML = `
    <canvas class="rts-canvas" aria-label="Station Defense space strategy game"></canvas>
    <div class="rts-top">
      <button type="button" class="rts-exit" hidden>✕ EXIT</button>
      <div class="rts-res" hidden><span class="rts-credits">◆ 0</span><span class="rts-supply">0 / ${SUPPLY_CAP}</span><span class="rts-wave"></span></div>
    </div>
    <canvas class="rts-mini" width="208" height="120" hidden></canvas>
    <div class="rts-panel" hidden></div>
    <div class="rts-touch" hidden>
      <button type="button" data-act="army">FLEET</button>
      <button type="button" data-act="amove">ATTACK</button>
    </div>
    <div class="rts-msg" aria-live="polite"></div>
    <div class="rts-intro">
      <p class="rts-kicker">STATION DEFENSE · A SPACE STRATEGY GAME</p>
      <h3>Mine. Build. Defend the Station.</h3>
      <p>An alien hive is sending swarms at your space station. Mine crystals, build a fleet and wipe out the hive.</p>
      <button type="button" class="rts-play">▶ PLAY</button>
      <p class="rts-help">Drag to select · Right-click to command · A attack-move · Q W E train · Space whole fleet</p>
    </div>`;
  section.appendChild(root);   // on the section itself (the site moves things inside the viewport for its parallax effect)
  const canvas = root.querySelector(".rts-canvas"), ctx = canvas.getContext("2d");
  const mini = root.querySelector(".rts-mini"), mctx = mini.getContext("2d");
  const panel = root.querySelector(".rts-panel"), msgEl = root.querySelector(".rts-msg"), intro = root.querySelector(".rts-intro");
  const resEl = root.querySelector(".rts-res"), creditsEl = root.querySelector(".rts-credits"), supplyEl = root.querySelector(".rts-supply"), waveEl = root.querySelector(".rts-wave");
  const exitBtn = root.querySelector(".rts-exit"), touchBar = root.querySelector(".rts-touch");

  let W = 0, H = 0, zoom = 1;
  function resize() {
    const r = root.getBoundingClientRect(), ratio = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * ratio); canvas.height = Math.round(H * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    zoom = W < 760 ? 0.75 : clamp(W / 1300, 0.55, 1);   // phones: a little closer, so units are big enough to tap
    clampCamera();
  }
  window.addEventListener("resize", resize);

  // ================================================ THE GAME STATE ================================================
  let ents = [], crystals = [], shots = [], fx = [], selected = [], credits = 0, nextId = 1;
  let state = "intro", clock = 0, waveAt = 0, waveNo = 0, onScreen = false, amoveMode = false, kills = 0;
  const cam = { x: 0, y: 0 };
  const FOG = { cell: 50 };
  FOG.cols = Math.ceil(MAP.w / FOG.cell); FOG.rows = Math.ceil(MAP.h / FOG.cell);
  let explored = new Uint8Array(FOG.cols * FOG.rows), visible = new Uint8Array(FOG.cols * FOG.rows);
  const fogCanvas = document.createElement("canvas"); fogCanvas.width = FOG.cols; fogCanvas.height = FOG.rows;
  const fctx = fogCanvas.getContext("2d");
  const fogImg = fctx.createImageData(FOG.cols, FOG.rows);
  // Little rocky ridges, just for looks.
  const rocks = Array.from({ length: 46 }, () => ({ x: rand(0, MAP.w), y: rand(0, MAP.h), r: rand(12, 40), k: Math.floor(rand(0, 4)), a: rand(0, 6.28), spin: rand(0.00005, 0.0002) }));

  function spawn(type, x, y) {
    const T = UNITS[type];
    const e = { id: nextId++, type, T, team: T.team, x, y, hp: T.hp, r: T.r, cd: 0, order: null, carry: 0, queue: [], rally: null, flash: 0, face: 0, bob: rand(0, 6.28) };
    ents.push(e);
    return e;
  }
  function newGame() {
    ents = []; crystals = []; shots = []; fx = []; selected = []; kills = 0;
    explored.fill(0); credits = START.credits; clock = 0; waveNo = 0; waveAt = WAVES.first; amoveMode = false;
    const core = spawn("core", 300, MAP.h - 330);
    core.rally = { x: 470, y: MAP.h - 470 };
    // Crystals: a field round the base, a richer one in the middle of the map.
    for (let i = 0; i < 8; i++) { const a = -2.6 + i * 0.27; crystals.push({ x: core.x + Math.cos(a) * 250, y: core.y + Math.sin(a) * 250, left: CRYSTAL.amount, r: 18 }); }
    for (let i = 0; i < 7; i++) { const a = i * 0.9; crystals.push({ x: 1320 + Math.cos(a) * 130, y: 760 + Math.sin(a) * 90, left: CRYSTAL.amount * 1.5, r: 20 }); }
    for (let i = 0; i < START.sparks; i++) { const s = spawn("spark", core.x + 60 + i * 18, core.y - 70); harvest(s, crystals[2 + i]); }
    for (let i = 0; i < START.blades; i++) spawn("blade", core.x + 110 + i * 26, core.y - 10);
    // The Hive and its guards.
    const hive = spawn("hive", MAP.w - 300, 330);
    for (let i = 0; i < 6; i++) spawn("mite", hive.x - 120 + rand(-60, 60), hive.y + 120 + rand(-60, 60));
    for (let i = 0; i < 2; i++) spawn("brute", hive.x - 170, hive.y + 40 + i * 60);
    for (let i = 0; i < 2; i++) spawn("spitter", hive.x - 60, hive.y + 160 + i * 40);
    cam.x = core.x - W / zoom * 0.3; cam.y = core.y - H / zoom * (W < 760 ? 0.32 : 0.55); clampCamera();
    updateFog();
  }
  const core = () => ents.find(e => e.type === "core");
  const hive = () => ents.find(e => e.type === "hive");
  const supply = () => ents.filter(e => e.team === "p" && !e.T.building).length + (core() ? core().queue.length : 0);

  // ================================================ ORDERS ================================================
  function harvest(e, c) { e.order = { type: "harvest", crystal: c, phase: e.carry ? "return" : "go", t: 0 }; }
  function command(x, y, attackMove) {
    const units = selected.filter(e => !e.T.building && e.hp > 0);
    const c = core();
    if (!units.length) { if (c && selected.includes(c)) { c.rally = { x, y }; ping(x, y, "#d7aaff"); } return; }
    // Did they click an enemy or a crystal?
    const enemy = ents.find(e => e.team === "e" && isSeen(e) && Math.hypot(e.x - x, e.y - y) < e.r + 10);
    const crystal = crystals.find(k => k.left > 0 && Math.hypot(k.x - x, k.y - y) < k.r + 12);
    const cx = units.reduce((t, u) => t + u.x, 0) / units.length, cy = units.reduce((t, u) => t + u.y, 0) / units.length;
    for (const u of units) {
      if (enemy) u.order = { type: "attack", target: enemy };
      else if (crystal && u.type === "spark") harvest(u, crystal);
      else {
        // Keep the group's shape, squeezed together a little, so they don't all pile onto one spot.
        const ox = clamp((u.x - cx) * 0.6, -70, 70), oy = clamp((u.y - cy) * 0.6, -70, 70);
        u.order = { type: attackMove ? "amove" : "move", x: x + ox, y: y + oy };
      }
    }
    if (enemy) ping(enemy.x, enemy.y, "#ff8a2b"); else ping(x, y, attackMove ? "#ff8a2b" : "#7dffb2");
    sfx("select");
  }
  function train(type) {
    const c = core(), T = UNITS[type];
    if (!c || state !== "play") return;
    if (credits < T.cost) return say("Not enough crystals ◆");
    if (supply() >= SUPPLY_CAP) return say("Fleet is full (" + SUPPLY_CAP + ")");
    if (c.queue.length >= 5) return say("Training queue is full");
    credits -= T.cost; c.queue.push({ type, left: T.time * 1000 });
    sfx("select"); renderPanel();
  }

  // ================================================ THE SIMULATION ================================================
  let seeAll = false;   // test hook only
  function isSeen(e) { const i = cellOf(e.x, e.y); return seeAll || e.team === "p" || visible[i] || (e.T.building && explored[i]); }
  function cellOf(x, y) { return clamp(Math.floor(y / FOG.cell), 0, FOG.rows - 1) * FOG.cols + clamp(Math.floor(x / FOG.cell), 0, FOG.cols - 1); }
  function updateFog() {
    visible.fill(0);
    for (const e of ents) {
      if (e.team !== "p") continue;
      const s = e.T.sight, c0 = Math.max(0, Math.floor((e.x - s) / FOG.cell)), c1 = Math.min(FOG.cols - 1, Math.floor((e.x + s) / FOG.cell));
      const r0 = Math.max(0, Math.floor((e.y - s) / FOG.cell)), r1 = Math.min(FOG.rows - 1, Math.floor((e.y + s) / FOG.cell));
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        if (Math.hypot((c + 0.5) * FOG.cell - e.x, (r + 0.5) * FOG.cell - e.y) < s) { visible[r * FOG.cols + c] = 1; explored[r * FOG.cols + c] = 1; }
      }
    }
  }
  function nearestFoe(e, range) {
    let best = null, bd = range;
    for (const o of ents) {
      if (o.team === e.team || o.hp <= 0) continue;
      if (e.team === "e" && o.team !== "p") continue;
      if (e.team === "p" && !isSeen(o)) continue;
      const d = dist(e, o) - o.r;
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }
  function moveTo(e, x, y, dt) {
    const dx = x - e.x, dy = y - e.y, d = Math.hypot(dx, dy);
    if (d < 4) return true;
    const step = Math.min(d, e.T.speed * dt * 0.06);
    e.x += dx / d * step; e.y += dy / d * step; e.face = Math.atan2(dy, dx); e.moving = true;
    return false;
  }
  function fire(e, t) {
    e.cd = e.T.cd; e.aim = Math.atan2(t.y - e.y, t.x - e.x); if (e.type !== "lancer") e.face = e.aim;
    if (e.type === "lancer" || e.type === "spitter") {
      shots.push({ x: e.x, y: e.y, tx: t.x, ty: t.y, t: 0, dur: Math.max(250, dist(e, t) * 2.2), dmg: e.T.dmg, splash: e.T.splash || 0, team: e.team, target: t, color: e.T.color, arc: e.type === "lancer" });
      sfx(e.type === "lancer" ? "rocket" : "miss");
    } else {
      damage(t, e.T.dmg, e);
      fx.push({ beam: true, x: e.x, y: e.y, tx: t.x, ty: t.y, life: 1, color: e.T.color });
      if (e.team === "p" && Math.random() < 0.5) sfx("laser");
    }
  }
  function damage(t, n, from) {
    if (t.hp <= 0) return;
    t.hp -= n; t.flash = 1;
    // Fight back: an idle unit (or a worker) that's hit turns on whoever hit it.
    if (from && from.hp > 0 && !t.T.building && t.type !== "spark" && (!t.order || t.order.type === "move" && t.team === "e")) t.order = { type: "attack", target: from };
    if (t.hp <= 0) die(t);
  }
  function die(t) {
    boom(t.x, t.y, t.T.color, t.T.building ? 3 : t.r / 10);
    if (t.team === "e") kills++;
    sfx(t.T.building ? "bigboom" : "boom");
    ents = ents.filter(e => e !== t); selected = selected.filter(e => e !== t);
    if (t.type === "hive") end(true);
    if (t.type === "core") end(false);
    renderPanel();
  }
  function boom(x, y, color, size) {
    for (let i = 0; i < 18 * size; i++) { const a = rand(0, 6.28), v = rand(0.5, 3.5) * Math.sqrt(size); fx.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, color: Math.random() < 0.3 ? "#ffffff" : color, size: rand(1.5, 3.5) }); }
    fx.push({ ring: true, x, y, life: 1, r: 10 * size, color });
  }
  function sendWave() {
    const h = hive(); if (!h) return;
    waveNo++;
    const n = { mite: 3 + waveNo * 2, brute: Math.floor(waveNo / 2), spitter: Math.floor((waveNo + 1) / 2) };
    for (const [type, count] of Object.entries(n)) for (let i = 0; i < count; i++) {
      const u = spawn(type, h.x - 80 + rand(-70, 70), h.y + 90 + rand(-70, 70));
      const c = core(); if (c) u.order = { type: "amove", x: c.x, y: c.y };
    }
    say("⚠ WAVE " + waveNo + " IS COMING", 2600); sfx("bomb");
    waveAt = clock + WAVES.every;
  }

  function update(dt) {
    clock += dt / 1000;
    if (clock >= waveAt) sendWave();
    // The Hive keeps topping up its guards.
    const h = hive();
    if (h && Math.random() < dt / 9000 && ents.filter(e => e.team === "e" && !e.order).length < 12) spawn("mite", h.x - 100 + rand(-50, 50), h.y + 110 + rand(-50, 50));
    // Training.
    const c = core();
    if (c && c.queue.length) {
      const q = c.queue[0]; q.left -= dt;
      if (q.left <= 0) {
        c.queue.shift();
        const u = spawn(q.type, c.x + rand(40, 70), c.y - rand(40, 70));
        if (u.type === "spark") { const k = nearestCrystal(u); if (k) harvest(u, k); }
        else if (c.rally) u.order = { type: "move", x: c.rally.x + rand(-30, 30), y: c.rally.y + rand(-30, 30) };
        say(UNITS[q.type].name + " ready"); sfx("power");
      }
      if (selected.includes(c)) renderPanel(true);
    }
    for (const e of ents) {
      // Engine exhaust behind your moving ships.
      if (e.moving && e.team === "p" && Math.random() < dt / 40) fx.push({ flame: true, x: e.x - Math.cos(e.face) * e.r * 1.1, y: e.y - Math.sin(e.face) * e.r * 1.1, h: 18, life: 1, size: e.r * 0.5, rgb: Math.random() < 0.5 ? "255,90,230" : "180,120,255" });
      e.moving = false;
      e.cd = Math.max(0, e.cd - dt); e.flash = Math.max(0, e.flash - dt / 200);
      // The station defends itself with a point-defence laser.
      if (e.type === "core" && !e.cd) { const foe = nearestFoe(e, 280); if (foe) { damage(foe, 14, e); e.cd = 800; fx.push({ beam: true, x: e.x, y: e.y, tx: foe.x, ty: foe.y, life: 1, color: "#ff5ae0", h: 30 }); sfx("laser"); } }
      if (e.T.building) continue;
      const o = e.order;
      if (o && o.type === "harvest") { doHarvest(e, o, dt); continue; }
      if (o && o.type === "attack") {
        const t = o.target;
        if (!t || t.hp <= 0 || !ents.includes(t)) { e.order = o.then || (e.team === "e" && core() && waveNo ? { type: "amove", x: core().x, y: core().y } : null); continue; }
        if (dist(e, t) > e.T.range + e.r + t.r) moveTo(e, t.x, t.y, dt);
        else if (!e.cd) fire(e, t);
        continue;
      }
      // Idle, moving or attack-moving: look for a fight (workers and plain moves don't).
      const lookFor = !o ? e.T.sight * (e.team === "e" ? 1 : 0.8) : o.type === "amove" ? e.T.sight : 0;
      const foe = lookFor && e.type !== "spark" ? nearestFoe(e, lookFor) : null;
      if (foe) { e.order = { type: "attack", target: foe, then: o }; continue; }
      if (o && (o.type === "move" || o.type === "amove") && moveTo(e, o.x, o.y, dt)) e.order = null;
    }
    // When a fight ends, carry on with what they were doing before.
    separate();
    // Shells and spit in flight.
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i]; s.t += dt;
      if (s.t < s.dur) continue;
      shots.splice(i, 1);
      if (s.splash) {
        boom(s.tx, s.ty, s.color, 0.8); sfx("hit");
        for (const o of [...ents]) if (o.team !== s.team && Math.hypot(o.x - s.tx, o.y - s.ty) < s.splash + o.r) damage(o, s.dmg, null);
      } else if (s.target && ents.includes(s.target)) { damage(s.target, s.dmg, null); fx.push({ ring: true, x: s.tx, y: s.ty, life: 1, r: 8, color: s.color }); }
    }
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i]; f.life -= dt / (f.beam ? 120 : f.ring ? 400 : f.flame ? 450 : 700);
      if (f.vx !== undefined) { f.x += f.vx * dt * 0.06; f.y += f.vy * dt * 0.06; f.vx *= 0.95; f.vy *= 0.95; }
      if (f.life <= 0) fx.splice(i, 1);
    }
    updateFog();
  }
  function nearestCrystal(e) {
    let best = null, bd = 900;
    for (const k of crystals) if (k.left > 0) { const d = dist(e, k); if (d < bd) { bd = d; best = k; } }
    return best;
  }
  function doHarvest(e, o, dt) {
    const c = core();
    if (!c) { e.order = null; return; }
    if (o.phase === "go") {
      if (!o.crystal || o.crystal.left <= 0) { o.crystal = nearestCrystal(e); if (!o.crystal) { e.order = null; return; } }
      if (dist(e, o.crystal) > o.crystal.r + e.r + 4) moveTo(e, o.crystal.x, o.crystal.y, dt);
      else { o.phase = "mine"; o.t = CRYSTAL.mineTime; }
    } else if (o.phase === "mine") {
      o.t -= dt;
      if (Math.random() < 0.08) fx.push({ x: o.crystal.x + rand(-8, 8), y: o.crystal.y + rand(-8, 8), vx: rand(-0.5, 0.5), vy: rand(-1, -0.2), life: 1, color: "#ff8af0", size: 1.6 });
      if (o.t <= 0) { const got = Math.min(CRYSTAL.carry, o.crystal.left); o.crystal.left -= got; e.carry = got; o.phase = "return"; }
    } else {
      if (dist(e, c) > c.r + e.r + 4) moveTo(e, c.x, c.y, dt);
      else { credits += e.carry; e.carry = 0; o.phase = "go"; }
    }
  }
  // Units gently push each other apart so they don't stack on one spot.
  function separate() {
    for (let i = 0; i < ents.length; i++) for (let j = i + 1; j < ents.length; j++) {
      const a = ents[i], b = ents[j];
      if (a.T.building && b.T.building) continue;
      if ((a.type === "spark" && a.order && a.order.type === "harvest") || (b.type === "spark" && b.order && b.order.type === "harvest")) { if (!(a.T.building || b.T.building)) continue; }
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01, min = a.r + b.r + 2;
      if (d >= min) continue;
      const push = (min - d) / 2, nx = dx / d, ny = dy / d;
      if (a.T.building) { b.x += nx * push * 2; b.y += ny * push * 2; }
      else if (b.T.building) { a.x -= nx * push * 2; a.y -= ny * push * 2; }
      else { a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push; }
    }
    for (const e of ents) { e.x = clamp(e.x, 10, MAP.w - 10); e.y = clamp(e.y, 10, MAP.h - 10); }
  }

  // ================================================ 3D MODELS ================================================
  // A tiny 3D kit: every ship, alien, asteroid and crystal is a real model (corners + faces), turned, lit and drawn
  // back to front. Model space: x = forward, y = right, z = up. One model unit = the unit's radius.
  // Each face has a material: "hull", "trim", "dark", "glass" (lit) or "glow" (lights itself, not shaded).
  function Mesh() { return { v: [], f: [] }; }
  function face(m, idx, mat, c) { m.f.push({ i: idx, mat, c }); }
  // Spin a side profile [[radius, along], ...] round an axis ("x" = lying along the length, "z" = standing up).
  function lathe(m, prof, n, mat, o = {}) {
    const { axis = "x", at = [0, 0, 0], sy = 1, sz = 1, rot = 0 } = o, base = m.v.length;
    for (const [r, t] of prof) for (let k = 0; k < n; k++) {
      const a = rot + k / n * 6.2832, u = Math.cos(a) * r, w = Math.sin(a) * r;
      m.v.push(axis === "x" ? [at[0] + t, at[1] + u * sy, at[2] + w * sz] : [at[0] + u, at[1] + w * sy, at[2] + t * sz]);
    }
    for (let p = 0; p < prof.length - 1; p++) for (let k = 0; k < n; k++) {
      const a = base + p * n + k, b = base + p * n + (k + 1) % n;
      face(m, [a, b, b + n, a + n], typeof mat === "function" ? mat(p, k) : mat, at);
    }
  }
  function box(m, at, size, mat) {
    const [x, y, z] = at, [a, b, c] = size.map(s => s / 2), base = m.v.length;
    for (const dx of [-a, a]) for (const dy of [-b, b]) for (const dz of [-c, c]) m.v.push([x + dx, y + dy, z + dz]);
    for (const q of [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]]) face(m, q.map(i => base + i), mat, at);
  }
  // A flat shape [[x, y], ...] given some thickness (wings, fins, claws).
  function slab(m, pts, z, thick, mat, edgeMat) {
    const base = m.v.length, n = pts.length;
    for (const [x, y] of pts) m.v.push([x, y, z + thick / 2]);
    for (const [x, y] of pts) m.v.push([x, y, z - thick / 2]);
    const c = [pts.reduce((t, p) => t + p[0], 0) / n, pts.reduce((t, p) => t + p[1], 0) / n, z];
    face(m, pts.map((_, i) => base + i), mat, c);
    face(m, pts.map((_, i) => base + n + (n - 1 - i)), mat, c);
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; face(m, [base + i, base + n + i, base + n + j, base + j], edgeMat || mat, c); }
  }
  const mirrorY = pts => pts.map(([x, y]) => [x, -y]).reverse();
  const sphere = (r, n = 8) => Array.from({ length: n + 1 }, (_, i) => { const a = -Math.PI / 2 + i / n * Math.PI; return [Math.cos(a) * r + 0.0001, Math.sin(a) * r]; });

  const MODELS = {};
  // ---- Your fleet ----
  { // INTERCEPTOR: an arrowhead fighter with swept wings and twin glowing engines.
    const m = Mesh();
    lathe(m, [[0.001, 1.35], [0.16, 1.0], [0.27, 0.35], [0.3, -0.35], [0.24, -0.8], [0.001, -0.85]], 6, "hull", { sz: 0.7 });
    lathe(m, [[0.001, 0.75], [0.11, 0.55], [0.12, 0.2], [0.001, 0.05]], 6, "glass", { at: [0, 0, 0.16], sz: 0.8 });
    slab(m, [[0.35, 0.22], [-0.55, 1.15], [-0.85, 1.12], [-0.6, 0.2]], -0.02, 0.07, "hull", "trim");
    slab(m, mirrorY([[0.35, 0.22], [-0.55, 1.15], [-0.85, 1.12], [-0.6, 0.2]]), -0.02, 0.07, "hull", "trim");
    slab(m, [[-0.2, 0.0], [-0.8, 0.0], [-0.85, 0.02], [-0.45, 0.02]].map(([x, y]) => [x, y]), 0.0, 0.0, "trim");
    for (const s of [-1, 1]) {
      lathe(m, [[0.001, -0.2], [0.13, -0.35], [0.14, -0.85], [0.1, -0.95]], 6, "dark", { at: [0, s * 0.42, -0.04] });
      lathe(m, [[0.1, -0.95], [0.001, -0.96]], 6, "glow", { at: [0, s * 0.42, -0.04] });
      slab(m, [[-0.35, s * 1.12], [-0.85, s * 1.14], [-0.95, s * 1.18], [-0.45, s * 1.17]], 0.05, 0.12, "trim");
    }
    slab(m, [[-0.3, 0], [-0.8, 0], [-0.9, 0]], 0.3, 0.05, "trim");
    MODELS.blade = m;
  }
  { // MINER: a stubby work-boat with a glass bridge, two side pods and a mining claw.
    const m = Mesh();
    box(m, [0, 0, 0], [1.3, 0.85, 0.55], "hull");
    box(m, [0.55, 0, 0.18], [0.45, 0.55, 0.3], "glass");
    for (const s of [-1, 1]) {
      lathe(m, [[0.001, 0.55], [0.2, 0.4], [0.22, -0.45], [0.16, -0.65]], 6, "trim", { at: [0, s * 0.62, -0.05] });
      lathe(m, [[0.16, -0.65], [0.001, -0.66]], 6, "glow", { at: [0, s * 0.62, -0.05] });
    }
    box(m, [0.85, 0, -0.18], [0.5, 0.12, 0.12], "dark");
    box(m, [1.1, 0.12, -0.18], [0.14, 0.08, 0.2], "trim"); box(m, [1.1, -0.12, -0.18], [0.14, 0.08, 0.2], "trim");
    MODELS.spark = m;
  }
  { // LANCER gunship: a long armoured hull with an engine block. Its turret is a separate model that aims.
    const m = Mesh();
    lathe(m, [[0.001, 1.4], [0.25, 1.1], [0.42, 0.4], [0.45, -0.7], [0.38, -1.0]], 6, "hull", { sz: 0.6, rot: Math.PI / 6 });
    box(m, [-0.95, 0, 0], [0.4, 1.1, 0.4], "dark");
    for (const s of [-0.32, 0, 0.32]) lathe(m, [[0.13, -1.15], [0.001, -1.16]], 6, "glow", { at: [0, s, 0] });
    for (const s of [-1, 1]) slab(m, [[0.2, s * 0.4], [-0.6, s * 0.95], [-0.9, s * 0.95], [-0.7, s * 0.4]], -0.05, 0.08, "trim");
    MODELS.lancer = m;
    const t = Mesh();
    lathe(t, sphere(0.32, 4).slice(4), 8, "trim", { axis: "z" });
    box(t, [0.55, 0.09, 0.08], [0.8, 0.08, 0.08], "dark"); box(t, [0.55, -0.09, 0.08], [0.8, 0.08, 0.08], "dark");
    box(t, [0.98, 0.09, 0.08], [0.06, 0.1, 0.1], "glow"); box(t, [0.98, -0.09, 0.08], [0.06, 0.1, 0.1], "glow");
    MODELS.turret = t;
  }
  { // TENSHI STATION: a hexagonal hub with a glowing core, docking arms and a separately turning ring.
    const m = Mesh();
    lathe(m, [[0.001, -0.5], [0.62, -0.45], [0.75, -0.15], [0.75, 0.2], [0.55, 0.4], [0.3, 0.48], [0.001, 0.5]], 6, (p) => p === 2 ? "trim" : "hull", { axis: "z", sy: 1, rot: Math.PI / 6 });
    lathe(m, [[0.22, 0.5], [0.22, 0.75], [0.001, 0.78]], 6, "glow", { axis: "z" });
    for (let k = 0; k < 3; k++) { const a = k / 3 * 6.2832 + 0.5; box(m, [Math.cos(a) * 0.95, Math.sin(a) * 0.95, 0], [0.5, 0.18, 0.14], "dark"); }
    MODELS.core = m;
    const r = Mesh();   // the ring: a flat band made of panels
    const N = 18;
    for (let k = 0; k < N; k++) {
      const a0 = k / N * 6.2832, a1 = (k + 1) / N * 6.2832, R0 = 1.25, R1 = 1.45, h = 0.09, base = r.v.length;
      for (const [R, z] of [[R0, h], [R1, h], [R1, -h], [R0, -h]]) { r.v.push([Math.cos(a0) * R, Math.sin(a0) * R, z]); r.v.push([Math.cos(a1) * R, Math.sin(a1) * R, z]); }
      const c = [0, 0, 0], mat = k % 3 ? "trim" : "glow";
      face(r, [base, base + 1, base + 3, base + 2], mat, c);          // top
      face(r, [base + 2, base + 3, base + 5, base + 4], "hull", c);    // outside
      face(r, [base + 4, base + 5, base + 7, base + 6], "dark", c);    // bottom
      face(r, [base + 6, base + 7, base + 1, base], "hull", c);        // inside
    }
    MODELS.ring = r;
  }
  // ---- The aliens ----
  { // SWARMLING: a beetle-bug with a ridged carapace, a small head and glowing eyes (legs and wings are animated).
    const m = Mesh();
    lathe(m, [[0.001, -1.0], [0.4, -0.75], [0.58, -0.2], [0.52, 0.3], [0.3, 0.55], [0.001, 0.6]], 7, (p) => p % 2 ? "trim" : "hull", { sz: 0.75 });
    lathe(m, sphere(0.3, 6), 6, "dark", { at: [0.75, 0, 0.02] });
    for (const s of [-1, 1]) lathe(m, sphere(0.09, 4), 5, "glow", { at: [0.98, s * 0.14, 0.1] });
    for (const s of [-1, 1]) slab(m, [[0.95, s * 0.1], [1.4, s * 0.32], [1.35, s * 0.4], [0.9, s * 0.25]], -0.05, 0.06, "trim");   // mandibles
    MODELS.mite = m;
  }
  { // BEHEMOTH: a huge armoured crab-beetle with a domed shell, back spikes and two big claws.
    const m = Mesh();
    lathe(m, [[0.001, -0.25], [0.85, -0.2], [0.95, 0.05], [0.8, 0.35], [0.45, 0.6], [0.001, 0.68]], 9, (p) => p === 3 ? "trim" : "hull", { axis: "z", sy: 0.8 });
    for (let k = 0; k < 5; k++) { const x = -0.5 + k * 0.25, z = 0.55 - Math.abs(x) * 0.3; lathe(m, [[0.12, 0], [0.001, 0.4]], 4, "trim", { axis: "z", at: [x, 0, z] }); }
    lathe(m, sphere(0.32, 5), 6, "dark", { at: [0.95, 0, 0.05] });
    for (const s of [-1, 1]) {
      lathe(m, sphere(0.08, 3), 4, "glow", { at: [1.2, s * 0.13, 0.15] });
      slab(m, [[0.6, s * 0.6], [1.5, s * 0.75], [1.7, s * 0.55], [1.45, s * 0.42], [1.1, s * 0.5], [0.7, s * 0.4]], 0, 0.22, "trim", "dark");
    }
    MODELS.brute = m;
  }
  { // SPITTER: a floating jellyfish-squid: a bell with a glowing sac (tentacles are animated).
    const m = Mesh();
    lathe(m, [[0.001, 0.75], [0.45, 0.65], [0.8, 0.35], [0.95, 0.0], [0.85, -0.12], [0.5, -0.05], [0.001, -0.1]], 9, (p) => p === 3 ? "trim" : p === 5 ? "dark" : "hull", { axis: "z" });
    lathe(m, sphere(0.32, 5), 6, "glow", { axis: "z", at: [0, 0, 0.2] });
    MODELS.spitter = m;
  }
  { // ALIEN HIVE: a cluster of lumpy pods round a glowing heart.
    const m = Mesh();
    lathe(m, sphere(0.55, 6), 8, "glow", { axis: "z", at: [0, 0, 0.25] });
    for (let k = 0; k < 7; k++) {
      const a = k / 7 * 6.2832, d = 0.72, r = 0.32 + (k % 3) * 0.08;
      lathe(m, sphere(r, 5), 7, (p) => p === 2 ? "trim" : "hull", { axis: "z", at: [Math.cos(a) * d, Math.sin(a) * d, 0.1 + (k % 2) * 0.15] });
    }
    for (let k = 0; k < 5; k++) { const a = k / 5 * 6.2832 + 0.4; lathe(m, [[0.1, 0], [0.001, 0.75]], 4, "trim", { axis: "z", at: [Math.cos(a) * 0.45, Math.sin(a) * 0.45, 0.45] }); }
    MODELS.hive = m;
  }
  // ---- Scenery: lumpy asteroids (a few shapes) and crystal clusters ----
  const ROCKS = [0, 1, 2, 3].map(seed => {
    const m = Mesh(); lathe(m, sphere(1, 6), 8, "hull", { axis: "z" });
    let s = seed * 97 + 13; const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    m.v = m.v.map(([x, y, z]) => { const k = 0.7 + rnd() * 0.5; return [x * k, y * k * 0.9, z * k * 0.75]; });
    return m;
  });
  { const m = Mesh();
    lathe(m, [[0.001, -0.5], [0.3, 0], [0.001, 1.4]], 5, "glass", { axis: "z" });
    lathe(m, [[0.001, -0.4], [0.22, 0], [0.001, 0.95]], 5, "glass", { axis: "z", at: [0.35, 0.2, -0.1] });
    lathe(m, [[0.001, -0.4], [0.2, 0], [0.001, 0.85]], 5, "glass", { axis: "z", at: [-0.3, 0.25, -0.1] });
    lathe(m, [[0.001, -0.3], [0.18, 0], [0.001, 0.7]], 5, "glass", { axis: "z", at: [0.05, -0.35, -0.1] });
    MODELS.crystal = m; }

  // Colours for each side (r, g, b).
  const PAINT = {
    p: { hull: [200, 190, 225], trim: [150, 70, 255], dark: [45, 30, 75], glass: [120, 210, 255], glow: [255, 90, 230], rim: [255, 60, 210] },
    e: { hull: [210, 110, 40], trim: [255, 170, 60], dark: [70, 25, 10], glass: [255, 200, 120], glow: [180, 255, 90], rim: [255, 140, 40] },
    rock: { hull: [95, 80, 120], trim: [120, 100, 150], dark: [40, 30, 55], glass: [0, 0, 0], glow: [0, 0, 0], rim: [140, 80, 220] },
    crystal: { hull: [0, 0, 0], trim: [0, 0, 0], dark: [0, 0, 0], glass: [255, 110, 235], glow: [255, 160, 250], rim: [255, 120, 255] },
  };
  // ---- Lighting: a white-gold star top-left, a faint pink bounce from the planet below, purple ambient ----
  const norm = v => { const l = Math.hypot(...v) || 1; return v.map(c => c / l); };
  const LIGHT_KEY = norm([-0.55, -0.45, 0.7]), LIGHT_FILL = norm([0.5, 0.6, -0.3]), VIEW = norm([0, 0.62, 0.78]);
  const HALF = norm(LIGHT_KEY.map((c, i) => c + VIEW[i]));
  const TILT = { y: 0.62, z: 0.8 };   // how the camera looks down: depth squashes y, height lifts things up the screen

  // Draw one model at map position (x, y), height z, facing `yaw`, banked by `roll`, `size` = unit radius.
  function drawModel(m, x, y, z, yaw, roll, size, paint, flash = 0, alpha = 1) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cr = Math.cos(roll), sr = Math.sin(roll);
    const P = m.v.map(([mx, my, mz]) => {
      const y1 = my * cr - mz * sr, z1 = my * sr + mz * cr;
      const X = mx * cy - y1 * sy, Y = mx * sy + y1 * cy, Z = z1;
      return [X, Y, Z, sx(x) + X * size * zoom, sy_(y) + (Y * TILT.y - Z * TILT.z) * size * zoom - z * zoom * TILT.z];
    });
    const rot = ([mx, my, mz]) => { const y1 = my * cr - mz * sr, z1 = my * sr + mz * cr; return [mx * cy - y1 * sy, mx * sy + y1 * cy, z1]; };
    const faces = [];
    for (const f of m.f) {
      const a = P[f.i[0]], b = P[f.i[1]], c = P[f.i[2]] ;
      let n = [(b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])];
      const nl = Math.hypot(...n); if (nl < 1e-9) continue; n = n.map(v => v / nl);
      // Point the normal away from the part's centre, so it always faces outwards.
      const pc = rot(f.c), mid = [0, 1, 2].map(k => f.i.reduce((t, i) => t + P[i][k], 0) / f.i.length);
      if ((mid[0] - pc[0]) * n[0] + (mid[1] - pc[1]) * n[1] + (mid[2] - pc[2]) * n[2] < 0) n = n.map(v => -v);
      const facing = n[0] * VIEW[0] + n[1] * VIEW[1] + n[2] * VIEW[2];
      if (facing <= 0.02) continue;                                            // back faces are hidden
      faces.push({ f, n, facing, depth: mid[1] * TILT.y + mid[2] * TILT.z });
    }
    faces.sort((p, q) => p.depth - q.depth);
    ctx.globalAlpha = alpha;
    for (const { f, n, facing } of faces) {
      const base = paint[f.mat] || paint.hull;
      let col;
      if (f.mat === "glow") col = base;
      else {
        const key = Math.max(0, n[0] * LIGHT_KEY[0] + n[1] * LIGHT_KEY[1] + n[2] * LIGHT_KEY[2]);
        const fill = Math.max(0, n[0] * LIGHT_FILL[0] + n[1] * LIGHT_FILL[1] + n[2] * LIGHT_FILL[2]) * 0.35;
        const spec = Math.pow(Math.max(0, n[0] * HALF[0] + n[1] * HALF[1] + n[2] * HALF[2]), f.mat === "glass" ? 40 : 18) * (f.mat === "glass" ? 1.4 : 0.8);
        const rim = Math.pow(1 - facing, 3) * 0.9;
        const light = 0.22 + key * 0.95 + fill;
        col = [0, 1, 2].map(k => base[k] * light + (k === 2 ? 255 : k === 1 ? 240 : 255) * spec + paint.rim[k] * rim * 0.5 + (k === 2 ? 0.25 : 0.1) * base[k] * fill);
      }
      if (flash) col = col.map(v => v + (255 - v) * flash);
      const css = `rgb(${Math.min(255, col[0] | 0)},${Math.min(255, col[1] | 0)},${Math.min(255, col[2] | 0)})`;
      ctx.beginPath();
      f.i.forEach((i, k) => k ? ctx.lineTo(P[i][3], P[i][4]) : ctx.moveTo(P[i][3], P[i][4]));
      ctx.closePath();
      ctx.fillStyle = css; ctx.fill();
      ctx.strokeStyle = css; ctx.lineWidth = 0.6; ctx.stroke();               // seals hairline gaps between faces
    }
    ctx.globalAlpha = 1;
  }

  // ================================================ DRAWING ================================================
  const sx = x => (x - cam.x) * zoom, sy_ = y => (y - cam.y) * zoom, sy = sy_;
  function glow(c, b) { ctx.shadowColor = c; ctx.shadowBlur = b; }
  // A soft round light (engines, eyes, muzzle flashes).
  function bloom(x, y, r, rgb, a = 1) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(0.35, `rgba(${rgb},${a * 0.45})`); g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.28); ctx.fill();
  }

  // ---- Space: stars at three depths, a nebula and a planet, all drifting with the camera at different speeds ----
  const stars = Array.from({ length: 520 }, () => ({ x: Math.random(), y: Math.random(), d: Math.random() ** 2, tw: rand(0, 6.28) }));
  const nebula = document.createElement("canvas");
  (function paintNebula() {
    nebula.width = 1024; nebula.height = 640; const n = nebula.getContext("2d");
    n.fillStyle = "#04020a"; n.fillRect(0, 0, 1024, 640);
    const blobs = [[250, 180, 320, "120,40,200", 0.35], [700, 420, 380, "255,40,180", 0.22], [520, 260, 260, "60,40,180", 0.3], [880, 140, 220, "255,140,60", 0.12], [150, 520, 260, "176,77,255", 0.2]];
    for (const [x, y, r, c, a] of blobs) { const g = n.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(${c},${a})`); g.addColorStop(1, `rgba(${c},0)`); n.fillStyle = g; n.fillRect(0, 0, 1024, 640); }
  })();
  function drawSpace(now) {
    const px = cam.x / MAP.w, py = cam.y / MAP.h;
    ctx.drawImage(nebula, -px * W * 0.25, -py * H * 0.25, W * 1.3, H * 1.3);
    // A ringed planet far away, drifting very slowly.
    const plx = W * 0.82 - px * W * 0.08, ply = H * 0.78 - py * H * 0.08, plr = Math.min(W, H) * 0.22;
    const pg = ctx.createRadialGradient(plx - plr * 0.4, ply - plr * 0.5, plr * 0.1, plx, ply, plr);
    pg.addColorStop(0, "#5a2a8f"); pg.addColorStop(0.6, "#2a1046"); pg.addColorStop(1, "#0a0414");
    ctx.save(); ctx.globalAlpha = 0.55;
    ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(plx, ply, plr, 0, 6.28); ctx.fill();
    ctx.strokeStyle = "rgba(255,120,220,0.35)"; ctx.lineWidth = plr * 0.05; ctx.beginPath(); ctx.ellipse(plx, ply, plr * 1.7, plr * 0.35, -0.3, 0, 6.28); ctx.stroke();
    ctx.restore();
    for (const s of stars) {
      const k = 0.15 + s.d * 0.5;                                  // nearer stars drift faster
      let x = (s.x * W * 1.6 - cam.x * zoom * k) % W; if (x < 0) x += W;
      let y = (s.y * H * 1.6 - cam.y * zoom * k) % H; if (y < 0) y += H;
      ctx.globalAlpha = (0.35 + 0.65 * s.d) * (0.7 + 0.3 * Math.sin(now / 600 + s.tw));
      ctx.fillStyle = s.d > 0.7 ? "#ffe9ff" : s.d > 0.4 ? "#d7c4ff" : "#9b8cc9";
      const r = 0.6 + s.d * 1.6; ctx.fillRect(x, y, r, r);
    }
    ctx.globalAlpha = 1;
  }

  function draw(now) {
    ctx.clearRect(0, 0, W, H);
    drawSpace(now);
    // A faint tactical grid and the map edge.
    ctx.save(); ctx.scale(zoom, zoom); ctx.translate(-cam.x, -cam.y);
    ctx.strokeStyle = "rgba(176, 77, 255, 0.06)"; ctx.lineWidth = 1 / zoom; ctx.beginPath();
    for (let x = 0; x <= MAP.w; x += 200) { ctx.moveTo(x, 0); ctx.lineTo(x, MAP.h); }
    for (let y = 0; y <= MAP.h; y += 200) { ctx.moveTo(0, y); ctx.lineTo(MAP.w, y); }
    ctx.stroke();
    ctx.strokeStyle = "rgba(255, 43, 214, 0.3)"; ctx.lineWidth = 2; ctx.setLineDash([12, 10]); ctx.strokeRect(0, 0, MAP.w, MAP.h); ctx.setLineDash([]);
    ctx.restore();
    // Asteroids, slowly tumbling.
    for (const k of rocks) {
      if (sx(k.x) < -80 || sx(k.x) > W + 80 || sy(k.y) < -80 || sy(k.y) > H + 80) continue;
      drawModel(ROCKS[k.k % 4], k.x, k.y, -10, k.a + now * k.spin, Math.sin(now * k.spin * 0.7 + k.a) * 0.6, k.r, PAINT.rock);
    }
    // Crystals: floating, turning, glowing.
    for (const k of crystals) {
      if (k.left <= 0) continue;
      const left = Math.max(0.35, k.left / (CRYSTAL.amount * 1.5)), bob = Math.sin(now / 700 + k.x) * 3;
      bloom(sx(k.x), sy(k.y) - (6 + bob) * zoom, 34 * zoom, "255,90,230", 0.25 + 0.1 * Math.sin(now / 400 + k.y));
      drawModel(MODELS.crystal, k.x, k.y, 6 + bob, now / 1800 + k.x, 0, 15 * left + 6, PAINT.crystal);
    }
    // Selection rings, under the units.
    for (const e of selected) {
      ctx.strokeStyle = "#7dffb2"; ctx.lineWidth = 1.5; glow("#7dffb2", 8);
      ctx.beginPath(); ctx.ellipse(sx(e.x), sy(e.y), (e.r + 7) * zoom, (e.r + 7) * zoom * TILT.y, 0, 0, 6.28); ctx.stroke();
    }
    ctx.shadowBlur = 0;
    // Units, back to front.
    for (const e of [...ents].sort((a, b) => a.y - b.y)) { if (isSeen(e)) drawEnt(e, now); }
    // Rally point.
    const c = core();
    if (c && c.rally && selected.includes(c)) { ctx.setLineDash([6, 6]); ctx.strokeStyle = "rgba(215,170,255,.6)"; ctx.beginPath(); ctx.moveTo(sx(c.x), sy(c.y)); ctx.lineTo(sx(c.rally.x), sy(c.rally.y)); ctx.stroke(); ctx.setLineDash([]); }
    // Shells and plasma.
    for (const s of shots) {
      const t = s.t / s.dur, x = s.x + (s.tx - s.x) * t, y = s.y + (s.ty - s.y) * t, h = 14 + (s.arc ? Math.sin(t * Math.PI) * 50 : 0);
      bloom(sx(x), sy(y) - h * zoom * TILT.z, (s.arc ? 12 : 9) * zoom, s.team === "p" ? "220,150,255" : "180,255,90", 1);
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(sx(x), sy(y) - h * zoom * TILT.z, 2.2 * zoom, 0, 6.28); ctx.fill();
    }
    // Effects: beams, blast rings, sparks, engine exhaust, move pings.
    for (const f of fx) {
      ctx.globalAlpha = Math.max(0, f.life);
      const lift = (f.h || 12) * zoom * TILT.z;
      if (f.beam) { ctx.strokeStyle = f.color; ctx.lineWidth = 2.2 * zoom; glow(f.color, 10); ctx.beginPath(); ctx.moveTo(sx(f.x), sy(f.y) - lift); ctx.lineTo(sx(f.tx), sy(f.ty) - lift); ctx.stroke(); ctx.shadowBlur = 0; }
      else if (f.ring) { ctx.strokeStyle = f.color; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(sx(f.x), sy(f.y) - lift, f.r * (2 - f.life) * 1.5 * zoom, f.r * (2 - f.life) * 1.5 * zoom * TILT.y, 0, 0, 6.28); ctx.stroke(); }
      else if (f.ping) { ctx.strokeStyle = f.color; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(sx(f.x), sy(f.y), 18 * f.life * zoom, 18 * f.life * zoom * TILT.y, 0, 0, 6.28); ctx.stroke(); }
      else if (f.flame) { bloom(sx(f.x), sy(f.y) - lift, f.size * zoom * (0.6 + f.life), f.rgb, f.life * 0.8); }
      else { ctx.fillStyle = f.color; ctx.fillRect(sx(f.x), sy(f.y) - lift, f.size * zoom, f.size * zoom); }
    }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    drawFog();
    if (drag && drag.box) {
      ctx.strokeStyle = "#7dffb2"; ctx.lineWidth = 1; ctx.fillStyle = "rgba(125,255,178,0.08)";
      const x = Math.min(drag.x0, drag.x1), y = Math.min(drag.y0, drag.y1), w = Math.abs(drag.x1 - drag.x0), h = Math.abs(drag.y1 - drag.y0);
      ctx.fillRect(x, y, w, h); ctx.strokeRect(x, y, w, h);
    }
    if (amoveMode) { ctx.fillStyle = "#ff8a2b"; ctx.font = "700 12px Oswald, sans-serif"; ctx.fillText("ATTACK-MOVE: click where to go", 16, H - 200); }
    drawMinimap();
  }

  // Height each kind floats at, and how big its model is compared with its hit circle.
  const HOVER = { spark: 16, blade: 22, lancer: 18, core: 10, mite: 10, brute: 6, spitter: 26, hive: 4 };
  const SIZE = { spark: 1.15, blade: 1.25, lancer: 1.1, core: 0.95, mite: 1.0, brute: 0.95, spitter: 1.0, hive: 0.95 };
  function drawEnt(e, now) {
    const T = e.T, paint = PAINT[e.team], flash = Math.min(1, e.flash);
    const h = HOVER[e.type] + (T.building ? 0 : Math.sin(now / 420 + e.bob) * 3), size = e.r * SIZE[e.type];
    // Shadow on the "floor" of space (a faint dark patch, offset away from the star).
    ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.beginPath(); ctx.ellipse(sx(e.x + h * 0.35), sy(e.y + h * 0.25), size * zoom, size * zoom * TILT.y * 0.8, 0, 0, 6.28); ctx.fill();
    const X = sx(e.x), Y = sy(e.y) - h * zoom * TILT.z;
    if (e.type === "core") {
      bloom(X, Y - size * 0.6 * zoom, size * 2.2 * zoom, "176,77,255", 0.35);
      drawModel(MODELS.ring, e.x, e.y, h, now / 2600, 0.25, size, paint, flash);
      drawModel(MODELS.core, e.x, e.y, h, 0, 0, size, paint, flash);
      ctx.fillStyle = "#fff"; ctx.font = `900 ${Math.round(22 * zoom)}px 'Noto Sans JP', sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("天", X, Y - size * 0.85 * zoom); ctx.textAlign = "start";
      for (let k = 0; k < 3; k++) { const a = k / 3 * 6.2832 + 0.5; if ((Math.floor(now / 500) + k) % 3 === 0) bloom(X + Math.cos(a) * size * 1.2 * zoom, Y + Math.sin(a) * size * 1.2 * zoom * TILT.y, 8 * zoom, "255,90,230", 1); }
      if (e.queue.length) { ctx.strokeStyle = "#7dffb2"; ctx.lineWidth = 3; const q = e.queue[0], p = 1 - q.left / (UNITS[q.type].time * 1000); ctx.beginPath(); ctx.ellipse(X, Y, (size * 1.6) * zoom, size * 1.6 * zoom * TILT.y, 0, -1.57, -1.57 + p * 6.28); ctx.stroke(); }
    } else if (e.type === "hive") {
      const pulse = 1 + Math.sin(now / 380) * 0.05;
      bloom(X, Y - size * 0.4 * zoom, size * 2.4 * zoom, "180,255,90", 0.18 + 0.08 * Math.sin(now / 380));
      // Tendrils waving out of the hive.
      ctx.strokeStyle = "rgba(255,150,60,0.7)"; ctx.lineWidth = 3 * zoom;
      for (let k = 0; k < 6; k++) {
        const a = k / 6 * 6.28 + now / 4000; ctx.beginPath(); ctx.moveTo(X, Y);
        for (let s = 1; s <= 6; s++) { const r = size * (0.5 + s * 0.22), w = Math.sin(now / 500 + s * 0.8 + k) * 0.25; ctx.lineTo(X + Math.cos(a + w) * r * zoom, Y + Math.sin(a + w) * r * zoom * TILT.y + s * 2 * zoom); }
        ctx.stroke();
      }
      drawModel(MODELS.hive, e.x, e.y, h, now / 6000, 0, size * pulse, paint, flash);
    } else {
      // Ships bank into turns; aliens wobble.
      const turn = Math.atan2(Math.sin(e.face - (e.lastFace ?? e.face)), Math.cos(e.face - (e.lastFace ?? e.face)));
      e.lastFace = e.face; e.bank = (e.bank || 0) * 0.9 + clamp(turn * 6, -0.8, 0.8) * 0.1;
      const roll = e.team === "p" ? e.bank : Math.sin(now / 160 + e.bob) * 0.12;
      if (e.type === "mite") drawLegs(e, now, X, Y, size, 3, 0.9);
      if (e.type === "brute") drawLegs(e, now, X, Y, size, 3, 1.1);
      if (e.type === "spitter") drawTentacles(e, now, X, Y, size);
      drawModel(MODELS[e.type], e.x, e.y, h, e.face, roll, size, paint, flash);
      if (e.type === "lancer") drawModel(MODELS.turret, e.x, e.y, h + size * 0.35, e.aim ?? e.face, 0, size, paint, flash);
      if (e.type === "mite") drawWings(e, now, X, Y, size);
      // Engine glow at the back of your ships (brighter when moving).
      if (e.team === "p") {
        const back = -size * (e.type === "lancer" ? 1.15 : 0.95), moving = e.moving ? 1 : 0.45;
        const bx = X + Math.cos(e.face) * back * zoom, by = Y + Math.sin(e.face) * back * zoom * TILT.y;
        bloom(bx, by, size * (0.7 + 0.5 * moving) * zoom, "255,90,230", 0.55 * moving + 0.2);
      }
      if (e.type === "spark" && e.carry) bloom(X, Y - size * 0.4 * zoom, 10 * zoom, "255,90,230", 1);
    }
    // Health bar: when hurt or selected.
    if (e.hp < T.hp || selected.includes(e)) {
      const w = Math.max(24, e.r * 2) * zoom, p = Math.max(0, e.hp / T.hp), top = Y - (size * 1.1 + 12) * zoom;
      ctx.shadowBlur = 0; ctx.fillStyle = "rgba(0,0,0,.6)"; ctx.fillRect(X - w / 2, top, w, 4);
      ctx.fillStyle = p > 0.5 ? "#7dffb2" : p > 0.25 ? "#ffd166" : "#ff8a2b"; ctx.fillRect(X - w / 2, top, w * p, 4);
    }
  }
  // Alien legs: jointed lines that scuttle while moving.
  function drawLegs(e, now, X, Y, size, pairs, reach) {
    ctx.strokeStyle = "rgba(120,45,15,0.95)"; ctx.lineWidth = Math.max(1, size * 0.12 * zoom);
    const c = Math.cos(e.face), s = Math.sin(e.face);
    for (let k = 0; k < pairs; k++) for (const side of [-1, 1]) {
      const along = (k - (pairs - 1) / 2) * 0.45 * size, step = Math.sin(now / 90 + k * 2 + side) * (e.moving ? 0.25 : 0.05) * size;
      const hipX = X + (c * along) * zoom, hipY = Y + (s * along) * zoom * TILT.y;
      const kx = along + step, ky = side * size * 0.85 * reach, fx = along + step * 1.6, fy = side * size * 1.35 * reach;
      const knee = [X + (c * kx - s * ky) * zoom, Y + (s * kx + c * ky) * zoom * TILT.y - size * 0.25 * zoom];
      const foot = [X + (c * fx - s * fy) * zoom, Y + (s * fx + c * fy) * zoom * TILT.y + size * 0.35 * zoom];
      ctx.beginPath(); ctx.moveTo(hipX, hipY); ctx.lineTo(...knee); ctx.lineTo(...foot); ctx.stroke();
    }
  }
  // Swarmling wings: two see-through blades buzzing above the back.
  function drawWings(e, now, X, Y, size) {
    const c = Math.cos(e.face), s = Math.sin(e.face), buzz = Math.sin(now / 25 + e.bob) * 0.35;
    ctx.fillStyle = "rgba(200,255,150,0.18)"; ctx.strokeStyle = "rgba(220,255,170,0.45)"; ctx.lineWidth = 1;
    for (const side of [-1, 1]) {
      const pts = [[-0.1, 0], [-0.9, side * (0.9 + buzz)], [-1.2, side * (0.55 + buzz)]].map(([x, y]) => [X + (c * x - s * y) * size * zoom, Y + (s * x + c * y) * size * zoom * TILT.y - size * 0.7 * zoom]);
      ctx.beginPath(); ctx.moveTo(...pts[0]); ctx.lineTo(...pts[1]); ctx.lineTo(...pts[2]); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  }
  // Spitter tentacles: long glowing strands drifting under the bell.
  function drawTentacles(e, now, X, Y, size) {
    ctx.lineWidth = Math.max(1, size * 0.1 * zoom);
    for (let k = 0; k < 7; k++) {
      const a = k / 7 * 6.28; ctx.strokeStyle = k % 2 ? "rgba(180,255,90,0.55)" : "rgba(255,160,60,0.6)";
      ctx.beginPath(); let px = X + Math.cos(a) * size * 0.6 * zoom, py = Y + Math.sin(a) * size * 0.6 * zoom * TILT.y; ctx.moveTo(px, py);
      for (let sgm = 1; sgm <= 6; sgm++) { px += Math.sin(now / 300 + k + sgm * 0.7) * 2.5 * zoom; py += size * 0.32 * zoom; ctx.lineTo(px, py); }
      ctx.stroke();
    }
  }

  function drawFog() {
    // One pixel per fog cell, scaled up with smoothing so the edges are soft.
    const d = fogImg.data;
    for (let i = 0; i < visible.length; i++) { d[i * 4] = 4; d[i * 4 + 1] = 2; d[i * 4 + 2] = 14; d[i * 4 + 3] = visible[i] || seeAll ? 0 : explored[i] ? 130 : 238; }
    fctx.putImageData(fogImg, 0, 0);
    ctx.save(); ctx.imageSmoothingEnabled = true;
    ctx.drawImage(fogCanvas, sx(0), sy(0), MAP.w * zoom, MAP.h * zoom);
    ctx.restore();
  }

  function drawMinimap() {
    const mw = mini.width, mh = mini.height, k = Math.min(mw / MAP.w, mh / MAP.h);
    mctx.fillStyle = "#0b0616"; mctx.fillRect(0, 0, mw, mh);
    for (const c of crystals) if (c.left > 0 && explored[cellOf(c.x, c.y)]) { mctx.fillStyle = "#ff5ae0"; mctx.fillRect(c.x * k - 1, c.y * k - 1, 2, 2); }
    for (const e of ents) {
      if (!isSeen(e)) continue;
      mctx.fillStyle = e.team === "p" ? (selected.includes(e) ? "#7dffb2" : "#c99bff") : "#ff8a2b";
      const s = e.T.building ? 6 : 2.5; mctx.fillRect(e.x * k - s / 2, e.y * k - s / 2, s, s);
    }
    // Fog on the minimap.
    mctx.globalAlpha = 0.85; mctx.imageSmoothingEnabled = true; mctx.drawImage(fogCanvas, 0, 0, MAP.w * k, MAP.h * k); mctx.globalAlpha = 1;
    mctx.strokeStyle = "#fff"; mctx.lineWidth = 1; mctx.strokeRect(cam.x * k, cam.y * k, W / zoom * k, H / zoom * k);
  }

  // ================================================ HUD ================================================
  let msgTimer = 0;
  function say(text, ms = 1500) { msgEl.textContent = text; msgEl.classList.add("on"); clearTimeout(msgTimer); msgTimer = setTimeout(() => msgEl.classList.remove("on"), ms); }
  function ping(x, y, color) { fx.push({ ping: true, x, y, life: 1, color }); }
  let panelKey = "";
  function renderPanel(progressOnly) {
    const c = core();
    if (selected.length === 1 && selected[0] === c) {
      const q = c.queue.map(item => `<span class="rts-q">${UNITS[item.type].name[0]}</span>`).join("");
      const key = "core" + c.queue.length + credits;
      if (progressOnly && key === panelKey) { const bar = panel.querySelector(".rts-prog b"); if (bar && c.queue[0]) bar.style.width = (1 - c.queue[0].left / (UNITS[c.queue[0].type].time * 1000)) * 100 + "%"; return; }
      panelKey = key;
      panel.innerHTML = `<div class="rts-sel"><b>TENSHI STATION</b><span>Build ships · right-click to set the rally point</span></div>
        <div class="rts-btns">${["spark", "blade", "lancer"].map(t => `<button type="button" data-train="${t}" ${credits < UNITS[t].cost ? "disabled" : ""} title="${UNITS[t].tip}"><b>${UNITS[t].key}</b> ${UNITS[t].name}<i>◆ ${UNITS[t].cost}</i></button>`).join("")}</div>
        <div class="rts-queue">${q || "<span class='rts-dim'>Queue empty</span>"}</div><div class="rts-prog"><b></b></div>`;
      return;
    }
    if (progressOnly) return;
    panelKey = "";
    if (!selected.length) { panel.innerHTML = `<div class="rts-sel"><b>NOTHING SELECTED</b><span>Click a ship or drag a box. Click the station to build ships.</span></div>`; return; }
    const counts = {};
    for (const e of selected) counts[e.T.name] = (counts[e.T.name] || 0) + 1;
    panel.innerHTML = `<div class="rts-sel"><b>${selected.length} SELECTED</b><span>${Object.entries(counts).map(([n, k]) => k + " " + n).join(" · ")}</span></div>
      <div class="rts-btns"><button type="button" data-act="amove"><b>A</b> ATTACK-MOVE</button><button type="button" data-act="stop"><b>S</b> STOP</button></div>`;
  }
  panel.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.train) train(b.dataset.train);
    if (b.dataset.act) act(b.dataset.act);
  });
  touchBar.addEventListener("click", e => { const b = e.target.closest("button"); if (b) act(b.dataset.act); });
  function act(a) {
    if (a === "stop") { for (const e of selected) if (!e.T.building) e.order = null; say("Stop"); }
    if (a === "amove") { amoveMode = true; say("Attack-move: click where to go"); }
    if (a === "army") { selected = ents.filter(e => e.team === "p" && !e.T.building && e.type !== "spark"); renderPanel(); say(selected.length + " warships selected"); }
  }
  function hud() {
    creditsEl.textContent = "◆ " + credits;
    supplyEl.textContent = "▲ " + supply() + " / " + SUPPLY_CAP;
    const t = Math.max(0, Math.ceil(waveAt - clock));
    waveEl.textContent = hive() ? `WAVE ${waveNo + 1} IN ${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}` : "";
  }

  // ================================================ INPUT ================================================
  let drag = null, keys = {}, mouse = { x: -1, y: -1, in: false };
  const toWorld = (x, y) => ({ x: x / zoom + cam.x, y: y / zoom + cam.y });
  function local(e) { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  canvas.addEventListener("contextmenu", e => e.preventDefault());
  canvas.addEventListener("pointerdown", e => {
    if (state !== "play") return;
    const p = local(e);
    if (e.button === 2) { const w = toWorld(p.x, p.y); command(w.x, w.y, false); return; }
    if (e.button !== 0) return;
    canvas.setPointerCapture(e.pointerId);
    drag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y, box: false, shift: e.shiftKey, touch: e.pointerType !== "mouse" };
  });
  canvas.addEventListener("pointermove", e => {
    const p = local(e); mouse = { x: p.x, y: p.y, in: true };
    if (drag) { drag.x1 = p.x; drag.y1 = p.y; if (Math.hypot(drag.x1 - drag.x0, drag.y1 - drag.y0) > 8) drag.box = true; }
  });
  canvas.addEventListener("pointerleave", () => { mouse.in = false; });
  canvas.addEventListener("pointerup", e => {
    if (!drag) return;
    const d = drag; drag = null;
    if (d.box) {                                                    // box select: your units inside it (not the Core)
      const a = toWorld(Math.min(d.x0, d.x1), Math.min(d.y0, d.y1)), b = toWorld(Math.max(d.x0, d.x1), Math.max(d.y0, d.y1));
      const inBox = ents.filter(u => u.team === "p" && !u.T.building && u.x > a.x && u.x < b.x && u.y > a.y && u.y < b.y);
      selected = d.shift ? [...new Set([...selected, ...inBox])] : inBox;
      renderPanel(); if (inBox.length) sfx("select");
      return;
    }
    const w = toWorld(d.x0, d.y0);
    if (amoveMode) { amoveMode = false; command(w.x, w.y, true); return; }
    const mine = ents.find(u => u.team === "p" && Math.hypot(u.x - w.x, u.y - w.y) < u.r + 8);
    if (mine) { selected = d.shift ? [...new Set([...selected, mine])] : [mine]; renderPanel(); sfx("select"); return; }
    // Touch has no right-click: a tap on the ground, an enemy or a crystal commands the selection.
    if (d.touch && selected.length) { command(w.x, w.y, false); return; }
    if (!d.shift) { selected = []; renderPanel(); }
  });
  mini.addEventListener("pointerdown", e => {
    const r = mini.getBoundingClientRect(), k = Math.min(mini.width / MAP.w, mini.height / MAP.h);
    const mx = (e.clientX - r.left) * (mini.width / r.width) / k, my = (e.clientY - r.top) * (mini.height / r.height) / k;
    if (e.button === 2 && selected.length) { command(mx, my, false); return; }
    cam.x = mx - W / zoom / 2; cam.y = my - H / zoom / 2; clampCamera();
  });
  mini.addEventListener("contextmenu", e => e.preventDefault());
  window.addEventListener("keydown", e => {
    if (state !== "play" || !onScreen || (e.target.closest && e.target.closest("input, textarea, select"))) return;
    const k = e.key.toLowerCase();
    const handled = { arrowleft: 1, arrowright: 1, arrowup: 1, arrowdown: 1, " ": 1, a: 1, s: 1, q: 1, w: 1, e: 1, escape: 1 };
    if (!handled[k]) return;
    e.preventDefault(); keys[k] = true;
    if (k === "a") act("amove");
    if (k === "s") act("stop");
    if (k === " ") act("army");
    if (k === "q") train("spark");
    if (k === "w") train("blade");
    if (k === "e") train("lancer");
    if (k === "escape") { amoveMode = false; selected = []; renderPanel(); }
  });
  window.addEventListener("keyup", e => { keys[e.key.toLowerCase()] = false; });
  function clampCamera() {
    const under = W < 760 ? 300 / zoom : 0;   // on phones the panels cover the bottom, so let the camera go a bit past the map's edge
    cam.x = clamp(cam.x, -40, MAP.w - W / zoom + 40); cam.y = clamp(cam.y, -40, MAP.h - H / zoom + 40 + under);
  }
  function scrollCamera(dt) {
    const speed = 0.7 * dt / zoom, edge = 26;
    let dx = (keys.arrowright ? 1 : 0) - (keys.arrowleft ? 1 : 0), dy = (keys.arrowdown ? 1 : 0) - (keys.arrowup ? 1 : 0);
    if (mouse.in && !drag) { if (mouse.x < edge) dx = -1; if (mouse.x > W - edge) dx = 1; if (mouse.y < edge) dy = -1; if (mouse.y > H - edge) dy = 1; }
    cam.x += dx * speed; cam.y += dy * speed; clampCamera();
  }

  // ================================================ START, END, LOOP ================================================
  function showUI(on) { for (const el of [exitBtn, resEl, mini, panel]) el.hidden = !on; touchBar.hidden = !on || !matchMedia("(pointer: coarse)").matches; section.classList.toggle("rts-on", on); }
  function start() {
    resize(); newGame(); state = "play";
    intro.hidden = true; showUI(true); renderPanel();
    say("Mine crystals, build a fleet, destroy the alien hive!", 2600);
  }
  function end(won) {
    state = won ? "won" : "lost";
    const t = Math.round(clock);
    intro.innerHTML = `<p class="rts-kicker">${won ? "VICTORY" : "THE STATION HAS FALLEN"}</p>
      <h3>${won ? "The alien hive is destroyed!" : "Defeat."}</h3>
      <p>${won ? "You won in" : "You lasted"} ${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")} · ${kills} aliens destroyed · ${waveNo} waves</p>
      <button type="button" class="rts-play">▶ PLAY AGAIN</button>`;
    setTimeout(() => { intro.hidden = false; showUI(false); }, won ? 1600 : 1200);
    if (won) sfx("achievement");
  }
  root.addEventListener("click", e => { if (e.target.closest(".rts-play")) start(); });
  exitBtn.addEventListener("click", () => {
    state = "paused"; showUI(false);
    intro.innerHTML = `<p class="rts-kicker">PAUSED</p><h3>Station Defense</h3><button type="button" class="rts-play rts-resume">▶ RESUME</button> <button type="button" class="rts-play">↺ NEW GAME</button>`;
    intro.hidden = false;
  });
  intro.addEventListener("click", e => {
    if (e.target.closest(".rts-resume")) { e.stopPropagation(); state = "play"; intro.hidden = true; showUI(true); renderPanel(); }
  }, true);

  new IntersectionObserver(es => { onScreen = es[0].isIntersecting; }, { threshold: 0.35 }).observe(section);
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(50, now - last); last = now;
    if (onScreen && W) {
      if (state === "play") { scrollCamera(dt); update(dt); hud(); }
      draw(now);
    }
    requestAnimationFrame(loop);
  }
  resize(); newGame();
  if (reduce) intro.querySelector(".rts-help").textContent += " · (Reduced motion: effects are toned down.)";
  requestAnimationFrame(loop);
  window.neonRTS = { state: () => ({ state, credits, clock: Math.round(clock), wave: waveNo, units: ents.filter(e => e.team === "p" && !e.T.building).length, enemies: ents.filter(e => e.team === "e").length, hive: hive() && hive().hp, core: core() && core().hp, selected: selected.length }),
                     start, give: n => { credits += n; }, army: () => act("army"), seeAll: on => { seeAll = on; if (on) explored.fill(1); }, count: () => ents.reduce((m, e) => (m[e.type] = (m[e.type] || 0) + 1, m), {}), step: ms => { for (let t = 0; t < ms && state === "play"; t += 16) update(16); hud(); }, train, wave: sendWave, select: type => { selected = ents.filter(e => e.type === type); renderPanel(); }, command, killHive: () => { const h = hive(); if (h) damage(h, 1e6, null); }, camTo: (x, y) => { cam.x = x - W / zoom / 2; cam.y = y - H / zoom / 2; clampCamera(); } };
})();
