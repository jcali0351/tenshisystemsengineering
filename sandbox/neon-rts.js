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
//   Mouse wheel, + / - keys, the + - buttons or a two-finger pinch = zoom in and out.
//   Q / W / E = train Spark / Blade / Lancer. With a miner selected, 1 2 3 4 = build a Turret / Supply Depot /
//   Outpost / Shipyard (then click where). Outposts are forward bases: you can only build near the station or an
//   outpost; outposts themselves go anywhere you have explored, so plant one by new crystals to expand. Arrow keys or the screen edges move the camera; click the minimap to jump.
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
  const CFG = (window.TENSHI_GAMES || {}).rts || {}; const TUNE = window.TENSHI_TUNE || (t => t);   // your values from game_settings.py
  const MAP = { w: 2600, h: 1500 };
  const START = { credits: 150, sparks: 4, blades: 2 };
  const SUPPLY_CAP = CFG.supply_cap ?? 30;
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
    // Buildings your miners construct (cost in crystals, time = seconds to build)
    tower:   { name: "DEFENSE TURRET", team: "p", hp: 420,  r: 18, building: true, sight: 300, dmg: 12, range: 240, cd: 650, cost: 100, time: 16, key: "1", color: "#ff5ae0", tip: "Shoots aliens in range. Guards miners and outposts." },
    depot:   { name: "SUPPLY DEPOT",   team: "p", hp: 380,  r: 20, building: true, sight: 200, cost: 75,  time: 14, key: "2", color: "#d7aaff", supply: 8, tip: "Lets you have 8 more ships." },
    outpost: { name: "OUTPOST",        team: "p", hp: 1000, r: 32, building: true, sight: 380, cost: 250, time: 30, key: "3", color: "#b04dff", tip: "Forward base: build it anywhere you have explored, next to new crystals. Miners drop crystals here, it trains miners, and you can build around it." },
    yard:    { name: "SHIPYARD",       team: "p", hp: 750,  r: 28, building: true, sight: 280, cost: 200, time: 26, key: "4", color: "#ff2bd6", tip: "Builds Interceptors and Gunships near the front." },
  };
  const TRAINS = { core: ["spark", "blade", "lancer"], outpost: ["spark"], yard: ["blade", "lancer"] };   // who builds which ships
  const BUILDS = ["tower", "depot", "outpost", "yard"];                                                    // what miners can build
  const ZOOM = { start: 1.4, max: 5 };
  const GFX = { gpu: true, textures: 1, metal: 1, dynamicLights: true, movingSun: true, shadows: true };   // gpu: draw the 3D models with WebGL (sandbox/tenshi-gl.js) when it can   // graphics: texture strength, metal shine, lights from weapons/engines, drifting sun   // camera: how close it starts (1 = the old view) and the closest you can zoom in
  const BUILD = { radius: 420, supplyMax: 80 };   // build within this distance of the station or an outpost; most ships depots can allow
  const CRYSTAL = { amount: 1200, carry: 8, mineTime: 1100 };
  // How many aliens: guarding the hive at the start, and in each wave (base + growth x wave number, rounded down).
  const ENEMIES = {
    start: { mite: 6, brute: 2, spitter: 2 },
    waveBase: { mite: 3, brute: 0, spitter: 0.5 },
    waveGrowth: { mite: 2, brute: 0.5, spitter: 0.5 },
    maxAlive: 150,              // a wave stops adding aliens once this many are alive
  };
  TUNE(MAP, CFG.map); TUNE(START, CFG.start); TUNE(WAVES, CFG.waves); TUNE(UNITS, CFG.units); TUNE(CRYSTAL, CFG.crystal); TUNE(ENEMIES, CFG.enemies); TUNE(BUILD, CFG.build); TUNE(ZOOM, CFG.zoom); TUNE(GFX, CFG.graphics);
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
      <button type="button" class="rts-full" hidden>⛶ FULLSCREEN</button>
      <div class="rts-res" hidden><span class="rts-credits">◆ 0</span><span class="rts-supply">0 / ${SUPPLY_CAP}</span><span class="rts-wave"></span></div>
    </div>
    <div class="rts-zoom" hidden><button type="button" data-zoom="in" aria-label="Zoom in">+</button><button type="button" data-zoom="out" aria-label="Zoom out">−</button></div>
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
      <p class="rts-help">Drag to select · Right-click to command · A attack-move · Q W E train · Miners: 1 2 3 4 build · Wheel / + − zoom · Space whole fleet</p>
    </div>`;
  section.appendChild(root);   // on the section itself (the site moves things inside the viewport for its parallax effect)
  const canvas = root.querySelector(".rts-canvas"), mainCtx = canvas.getContext("2d");
  let ctx = mainCtx;   // the 2D layer being drawn on (with the GPU renderer: the background layer, or the top layer)
  // ---- GPU renderer (sandbox/tenshi-gl.js): models go to a WebGL canvas under this one; space and anything under the
  // models are painted on bgCanvas, which becomes the WebGL background. Falls back to the 2D renderer. ----
  const glCanvas = document.createElement("canvas"); glCanvas.className = "rts-gl"; glCanvas.style.display = "none"; root.insertBefore(glCanvas, canvas);
  const bgCanvas = document.createElement("canvas"), bgx = bgCanvas.getContext("2d");
  let GL3 = null, glTried = false, glOn = false;
  function glReady() {
    if (!GFX.gpu) return null;
    if (!GL3 && !glTried && window.TenshiGL) { glTried = true; try { GL3 = window.TenshiGL.create(glCanvas); } catch (err) { console.warn("[rts] GPU renderer failed, using 2D", err); GL3 = null; } if (GL3 && W) GL3.resize(W, H); }
    return GL3;
  }
  const layer = top => { ctx = glOn && !top ? bgx : mainCtx; };
  const mini = root.querySelector(".rts-mini"), mctx = mini.getContext("2d");
  const panel = root.querySelector(".rts-panel"), msgEl = root.querySelector(".rts-msg"), intro = root.querySelector(".rts-intro");
  const resEl = root.querySelector(".rts-res"), creditsEl = root.querySelector(".rts-credits"), supplyEl = root.querySelector(".rts-supply"), waveEl = root.querySelector(".rts-wave");
  const zoomBar = root.querySelector(".rts-zoom");
  zoomBar.addEventListener("click", e => { const b = e.target.closest("button"); if (b) zoomBy(b.dataset.zoom === "in" ? 1.25 : 0.8); });
  const exitBtn = root.querySelector(".rts-exit"), fullBtn = root.querySelector(".rts-full"), touchBar = root.querySelector(".rts-touch");

  let W = 0, H = 0, zoom = 1, baseZoom = 1, fitZoom = 0.1, userZoom = ZOOM.start;
  function resize() {
    const r = root.getBoundingClientRect(), ratio = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * ratio); canvas.height = Math.round(H * ratio);
    mainCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const bgRatio = Math.min(ratio, 1.5); bgCanvas.width = Math.round(W * bgRatio); bgCanvas.height = Math.round(H * bgRatio); bgx.setTransform(bgRatio, 0, 0, bgRatio, 0, 0);
    if (GL3) GL3.resize(W, H);
    fitZoom = Math.max(W / MAP.w, H / MAP.h);             // the furthest out: the map still covers the whole window
    baseZoom = Math.max(W < 760 ? 0.75 : clamp(W / 1300, 0.55, 1), fitZoom);   // phones: a little closer, so units are big enough to tap
    applyZoom();
    clampCamera();
  }
  function applyZoom() {
    userZoom = clamp(userZoom, fitZoom / baseZoom, ZOOM.max);
    zoom = clamp(baseZoom * userZoom, fitZoom, baseZoom * ZOOM.max);
  }
  // Zoom by a factor, keeping the point under (px, py) (screen pixels; default the middle) in the same place.
  function zoomBy(f, px = W / 2, py = H / 2) {
    const wx = px / zoom + cam.x, wy = py / zoom + cam.y;
    userZoom *= f; applyZoom();
    cam.x = wx - px / zoom; cam.y = wy - py / zoom; clampCamera();
  }
  window.addEventListener("resize", resize);

  // ================================================ THE GAME STATE ================================================
  let ents = [], crystals = [], shots = [], fx = [], selected = [], credits = 0, nextId = 1;
  let placing = null, state = "intro", clock = 0, waveAt = 0, waveNo = 0, onScreen = false, amoveMode = false, kills = 0;
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
    const e = { id: nextId++, type, T, team: T.team, x, y, hp: T.hp, r: T.r, built: 1, cd: 0, order: null, carry: 0, queue: [], rally: null, flash: 0, face: 0, bob: rand(0, 6.28) };
    ents.push(e);
    return e;
  }
  function newGame() {
    ents = []; crystals = []; shots = []; fx = []; selected = []; kills = 0;
    explored.fill(0); placing = null; credits = START.credits; clock = 0; waveNo = 0; waveAt = WAVES.first; amoveMode = false;
    const core = spawn("core", 300, MAP.h - 330);
    core.rally = { x: 470, y: MAP.h - 470 };
    // Crystals: a field round the base, a richer one in the middle of the map.
    for (let i = 0; i < 8; i++) { const a = -2.6 + i * 0.27; crystals.push({ x: core.x + Math.cos(a) * 250, y: core.y + Math.sin(a) * 250, left: CRYSTAL.amount, r: 18 }); }
    for (let i = 0; i < 7; i++) { const a = i * 0.9; crystals.push({ x: 1320 + Math.cos(a) * 130, y: 760 + Math.sin(a) * 90, left: CRYSTAL.amount * 1.5, r: 20 }); }
    for (let i = 0; i < START.sparks; i++) { const s = spawn("spark", core.x + 60 + i * 18, core.y - 70); harvest(s, crystals[2 + i]); }
    for (let i = 0; i < START.blades; i++) spawn("blade", core.x + 110 + i * 26, core.y - 10);
    // The Hive and its guards.
    const hive = spawn("hive", MAP.w - 300, 330);
    for (let i = 0; i < (ENEMIES.start.mite || 0); i++) spawn("mite", hive.x - 120 + rand(-60, 60), hive.y + 120 + rand(-60, 60));
    for (let i = 0; i < (ENEMIES.start.brute || 0); i++) spawn("brute", hive.x - 170 + (i >> 1) * -40, hive.y + 40 + (i % 2) * 60);
    for (let i = 0; i < (ENEMIES.start.spitter || 0); i++) spawn("spitter", hive.x - 60 + (i >> 1) * -40, hive.y + 160 + (i % 2) * 40);
    cam.x = core.x - W / zoom * 0.3; cam.y = core.y - H / zoom * (W < 760 ? 0.32 : 0.55); clampCamera();
    updateFog();
  }
  const core = () => ents.find(e => e.type === "core");
  const hive = () => ents.find(e => e.type === "hive");
  const done = e => e.built >= 1;
  const hqs = () => ents.filter(e => e.team === "p" && (e.type === "core" || e.type === "outpost") && done(e));   // drop-off points and build zones
  const supply = () => ents.reduce((t, e) => t + (e.team === "p" && !e.T.building ? 1 : 0) + e.queue.length, 0);
  const supplyCap = () => Math.max(SUPPLY_CAP, Math.min(BUILD.supplyMax, SUPPLY_CAP + ents.reduce((t, e) => t + (e.type === "depot" && done(e) ? UNITS.depot.supply : 0), 0)));
  const target = () => core() || ents.find(e => e.team === "p" && e.T.building) || null;   // where the waves head
  function nearestHQ(e) { let best = null, bd = 1e9; for (const h of hqs()) { const d = dist(e, h); if (d < bd) { bd = d; best = h; } } return best; }

  // ================================================ ORDERS ================================================
  function harvest(e, c) { e.order = { type: "harvest", crystal: c, phase: e.carry ? "return" : "go", t: 0 }; }
  function command(x, y, attackMove) {
    const units = selected.filter(e => !e.T.building && e.hp > 0);
    const makers = selected.filter(e => TRAINS[e.type]);
    if (!units.length) { if (makers.length) { for (const m of makers) m.rally = { x, y }; ping(x, y, "#d7aaff"); } return; }
    const site = ents.find(e => e.team === "p" && e.T.building && !done(e) && Math.hypot(e.x - x, e.y - y) < e.r + 10);
    // Did they click an enemy or a crystal?
    const enemy = ents.find(e => e.team === "e" && isSeen(e) && Math.hypot(e.x - x, e.y - y) < e.r + 10);
    const crystal = crystals.find(k => k.left > 0 && Math.hypot(k.x - x, k.y - y) < k.r + 12);
    const cx = units.reduce((t, u) => t + u.x, 0) / units.length, cy = units.reduce((t, u) => t + u.y, 0) / units.length;
    for (const u of units) {
      if (enemy) u.order = { type: "attack", target: enemy };
      else if (site && u.type === "spark") u.order = { type: "build", site };
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
  function train(type, from) {
    const T = UNITS[type];
    if (state !== "play") return;
    const able = ents.filter(e => e.team === "p" && done(e) && TRAINS[e.type] && TRAINS[e.type].includes(type));
    const c = from && able.includes(from) ? from : able.find(e => selected.includes(e)) || able.sort((a, b) => a.queue.length - b.queue.length)[0];
    if (!c) return say(type === "spark" ? "Needs the station or an outpost" : "Needs the station or a shipyard");
    if (credits < T.cost) return say("Not enough crystals ◆");
    if (supply() >= supplyCap()) return say("Fleet is full (" + supplyCap() + ") · build a Supply Depot");
    if (c.queue.length >= 5) return say("Training queue is full");
    credits -= T.cost; c.queue.push({ type, left: T.time * 1000 });
    sfx("select"); renderPanel();
  }

  // ================================================ CONSTRUCTION ================================================
  // Select miners, pick a building (panel or keys 1-4), click where. The nearest selected miner flies there and builds
  // it; more miners (right-click the site) build faster. You can only build near the station or a finished outpost.
  function canPlace(type, x, y) {
    const r = UNITS[type].r;
    if (x < r + 10 || y < r + 10 || x > MAP.w - r - 10 || y > MAP.h - r - 10) return "Too close to the edge";
    if (!explored[cellOf(x, y)]) return "Explore there first";
    // Outposts go anywhere you have explored (that is how you claim new crystal fields); everything else near the station or an outpost.
    if (type !== "outpost" && !hqs().some(h => Math.hypot(h.x - x, h.y - y) < BUILD.radius)) return "Too far: build near the station or an outpost";
    if (ents.some(e => e.T.building && Math.hypot(e.x - x, e.y - y) < e.r + r + 8)) return "Something is in the way";
    if (crystals.some(k => k.left > 0 && Math.hypot(k.x - x, k.y - y) < k.r + r * 0.5 + 6)) return "Too close to the crystals";
    if (ents.some(e => e.team === "e" && isSeen(e) && Math.hypot(e.x - x, e.y - y) < e.r + r + 30)) return "Aliens are in the way";
    return "";
  }
  function startPlacing(type) {
    if (state !== "play") return;
    if (!selected.some(e => e.type === "spark")) return say("Select a miner to build");
    if (credits < UNITS[type].cost) return say("Not enough crystals ◆");
    placing = { type }; amoveMode = false;
    say(type === "outpost" ? "Click anywhere you have explored: right next to new crystals is best · Esc to cancel" : "Click where to build the " + UNITS[type].name + " · right-click or Esc to cancel", 2600);
  }
  function place(x, y) {
    const type = placing.type, why = canPlace(type, x, y);
    if (why) { say(why); sfx("miss"); return false; }
    const miners = selected.filter(e => e.type === "spark");
    if (!miners.length || credits < UNITS[type].cost) { say(miners.length ? "Not enough crystals ◆" : "Select a miner to build"); placing = null; return false; }
    credits -= UNITS[type].cost;
    const site = spawn(type, x, y); site.built = 0; site.hp = Math.max(1, Math.round(UNITS[type].hp * 0.1));
    if (TRAINS[type]) site.rally = { x: x + 90, y: y - 90 };
    const builder = miners.reduce((b, m) => dist(m, site) < dist(b, site) ? m : b);
    builder.order = { type: "build", site, then: builder.order && builder.order.type === "harvest" ? builder.order : null };
    placing = null; ping(x, y, "#7dffb2"); sfx("select"); renderPanel();
    return true;
  }
  function doBuild(e, o, dt) {
    const s = o.site;
    if (!s || !ents.includes(s) || done(s)) {                        // finished (or lost): back to mining
      const k = o.then && o.then.crystal && o.then.crystal.left > 0 ? o.then.crystal : nearestCrystal(e);
      e.order = null; if (k) harvest(e, k); return;
    }
    if (dist(e, s) > s.r + e.r + 12) { moveTo(e, s.x, s.y, dt); return; }
    const step = dt / (s.T.time * 1000);
    s.built = Math.min(1, s.built + step); s.hp = Math.min(s.T.hp, s.hp + s.T.hp * 0.9 * step);
    e.face = Math.atan2(s.y - e.y, s.x - e.x);
    if (Math.random() < dt / 70) fx.push({ beam: true, x: e.x, y: e.y, tx: s.x + rand(-0.6, 0.6) * s.r, ty: s.y + rand(-0.4, 0.4) * s.r, life: 1, color: "#7dffb2", h: 16 });
    if (done(s)) { s.hp = s.T.hp; say(s.T.name + " complete"); sfx("power"); }
    if (selected.includes(s)) renderPanel(true);
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
    if (t.team === "p" && t.T.building && !hqs().length) end(false);                       // lost when no station or outpost is left
    else if (t.type === "core") say("The station has fallen! Hold your outposts!", 3000);
    renderPanel();
  }
  function boom(x, y, color, size) {
    for (let i = 0; i < 18 * size; i++) { const a = rand(0, 6.28), v = rand(0.5, 3.5) * Math.sqrt(size); fx.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, color: Math.random() < 0.3 ? "#ffffff" : color, size: rand(1.5, 3.5) }); }
    fx.push({ ring: true, x, y, life: 1, r: 10 * size, color });
  }
  function sendWave() {
    const h = hive(); if (!h) return;
    waveNo++;
    const n = {};
    for (const type of ["mite", "brute", "spitter"]) n[type] = Math.max(0, Math.floor((ENEMIES.waveBase[type] || 0) + (ENEMIES.waveGrowth[type] || 0) * waveNo + 1e-9));
    let alive = ents.filter(e => e.team === "e" && !e.T.building).length;
    for (const [type, count] of Object.entries(n)) for (let i = 0; i < count && alive < ENEMIES.maxAlive; i++, alive++) {
      const u = spawn(type, h.x - 80 + rand(-70, 70), h.y + 90 + rand(-70, 70));
      const c = target(); if (c) u.order = { type: "amove", x: c.x, y: c.y };
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
    for (const c of ents) {
      if (!c.queue.length || !done(c)) continue;
      const q = c.queue[0]; q.left -= dt;
      if (q.left <= 0) {
        c.queue.shift();
        const u = spawn(q.type, c.x + rand(0.8, 1.4) * c.r, c.y - rand(0.8, 1.4) * c.r);
        if (u.type === "spark") { const k = nearestCrystal(u); if (k) harvest(u, k); }
        else if (c.rally) u.order = { type: "move", x: c.rally.x + rand(-30, 30), y: c.rally.y + rand(-30, 30) };
        say(UNITS[q.type].name + " ready"); sfx("power");
      }
      if (selected.includes(c)) renderPanel(true);
    }
    for (const e of ents) {
      // Engine exhaust behind your moving ships.
      if (e.moving && e.team === "p" && Math.random() < dt / 40) fx.push({ flame: true, x: e.x - Math.cos(e.face) * e.r * 1.1, y: e.y - Math.sin(e.face) * e.r * 1.1, h: 18, life: 1, size: e.r * 0.5, rgb: ENGINE[e.type] || (Math.random() < 0.5 ? "255,90,230" : "180,120,255") });
      e.moving = false;
      e.cd = Math.max(0, e.cd - dt); e.flash = Math.max(0, e.flash - dt / 200);
      // The station defends itself with a point-defence laser.
      if (e.type === "core" && !e.cd) { const foe = nearestFoe(e, 280); if (foe) { damage(foe, 14, e); e.cd = 800; fx.push({ beam: true, x: e.x, y: e.y, tx: foe.x, ty: foe.y, life: 1, color: "#ff5ae0", h: 30 }); sfx("laser"); } }
      // Defense turrets shoot the nearest alien in range.
      if (e.T.dmg && e.T.building && e.team === "p" && done(e) && !e.cd) {
        const foe = nearestFoe(e, e.T.range);
        if (foe) { e.aim = Math.atan2(foe.y - e.y, foe.x - e.x); damage(foe, e.T.dmg, e); e.cd = e.T.cd; fx.push({ beam: true, x: e.x, y: e.y, tx: foe.x, ty: foe.y, life: 1, color: e.T.color, h: 30 }); if (Math.random() < 0.5) sfx("laser"); }
      }
      if (e.T.building) continue;
      const o = e.order;
      if (o && o.type === "harvest") { doHarvest(e, o, dt); continue; }
      if (o && o.type === "build") { doBuild(e, o, dt); continue; }
      if (o && o.type === "attack") {
        const t = o.target;
        if (!t || t.hp <= 0 || !ents.includes(t)) { e.order = o.then || (e.team === "e" && target() && waveNo ? { type: "amove", x: target().x, y: target().y } : null); continue; }
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
    const c = nearestHQ(e);                                         // drop crystals at the nearest station or outpost
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
  // The same, standing upright (tail fins): pts are [x, z], centred on side position y.
  function fin(m, pts, y, thick, mat, edgeMat) {
    const base = m.v.length, n = pts.length;
    for (const [x, z] of pts) m.v.push([x, y + thick / 2, z]);
    for (const [x, z] of pts) m.v.push([x, y - thick / 2, z]);
    const c = [pts.reduce((t, q) => t + q[0], 0) / n, y, pts.reduce((t, q) => t + q[1], 0) / n];
    face(m, pts.map((_, i) => base + i), mat, c);
    face(m, pts.map((_, i) => base + n + (n - 1 - i)), mat, c);
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; face(m, [base + i, base + n + i, base + n + j, base + j], edgeMat || mat, c); }
  }
  const mirrorY = pts => pts.map(([x, y]) => [x, -y]).reverse();
  const sphere = (r, n = 8) => Array.from({ length: n + 1 }, (_, i) => { const a = -Math.PI / 2 + i / n * Math.PI; return [Math.cos(a) * r + 0.0001, Math.sin(a) * r]; });

  const MODELS = {};
  // ---- Your fleet ----
  // Mirror a flat outline to the other side (s = 1 right, -1 left).
  const side = (pts, sd) => pts.map(([x, y]) => [x, y * sd]);
  { // INTERCEPTOR (from your reference art): a cream arrowhead strike fighter with orange trim. Wide blended body,
    // long segmented blue canopy, cranked wings with orange leading edges and vents, wingtip cannons, side gun pods,
    // twin engines and a long rear sensor rod.
    const m = Mesh();
    slab(m, [[1.55, 0], [1.2, 0.12], [0.7, 0.28], [0.2, 0.36], [-0.4, 0.36], [-0.85, 0.3], [-0.95, 0.18], [-0.95, -0.18], [-0.85, -0.3], [-0.4, -0.36], [0.2, -0.36], [0.7, -0.28], [1.2, -0.12]], 0, 0.2, "hull", "dark");
    slab(m, [[1.3, 0], [0.6, 0.2], [0.1, 0.25], [0.1, -0.25], [0.6, -0.2]], -0.13, 0.06, "dark");                       // chin
    lathe(m, [[0.001, 1.15], [0.1, 0.95], [0.17, 0.6], [0.21, 0.15], [0.22, -0.4], [0.2, -0.8], [0.15, -0.95]], 10, "hull", { at: [0, 0, 0.1], sz: 0.7 });   // spine
    lathe(m, [[0.001, 0.8], [0.07, 0.7], [0.11, 0.45], [0.125, 0.1], [0.12, -0.3], [0.1, -0.55], [0.001, -0.65]], 10, "glass", { at: [0.15, 0, 0.2], sz: 0.65 });   // canopy
    for (const x of [0.62, 0.38, 0.14, -0.1, -0.32]) box(m, [x, 0, 0.276], [0.025, 0.2, 0.025], "dark");                // canopy frame
    box(m, [0.86, 0, 0.17], [0.07, 0.16, 0.05], "trim");                                                                  // orange canopy rim
    box(m, [-0.7, 0.1, 0.27], [0.5, 0.05, 0.07], "trim");                                                                 // dorsal ridge
    for (const sd of [-1, 1]) {
      slab(m, side([[0.45, 0.33], [0.0, 0.8], [-0.25, 1.18], [-0.45, 1.3], [-0.62, 1.22], [-0.58, 0.95], [-0.75, 0.6], [-0.85, 0.33]], sd), -0.03, 0.07, "hull", "dark");   // wing
      slab(m, side([[0.42, 0.37], [0.0, 0.83], [-0.24, 1.2], [-0.3, 1.16], [-0.04, 0.79], [0.36, 0.38]], sd), 0.012, 0.015, "trim");   // orange leading edge
      slab(m, side([[-0.35, 0.4], [-0.5, 0.75], [-0.7, 0.72], [-0.78, 0.4]], sd), 0.012, 0.015, "dark");                // vent
      for (let k = 0; k < 4; k++) box(m, [-0.45 - k * 0.08, sd * (0.5 + k * 0.04), 0.022], [0.025, 0.2, 0.01], "trim");   // vent slits
      box(m, [-0.1, sd * 0.62, 0.008], [0.5, 0.012, 0.01], "dark"); box(m, [-0.32, sd * 0.85, 0.008], [0.012, 0.3, 0.01], "dark");   // panel lines
      box(m, [0.1, sd * 0.5, 0.008], [0.012, 0.24, 0.01], "dark");
      box(m, [-0.38, sd * 1.0, 0.012], [0.14, 0.1, 0.02], "glass"); box(m, [0.35, sd * 0.24, 0.105], [0.1, 0.07, 0.02], "glass");   // blue panels
      box(m, [0.95, sd * 0.15, 0.07], [0.16, 0.04, 0.03], "trim");                                                       // nose accents
      box(m, [-0.55, sd * 0.21, 0.13], [0.6, 0.03, 0.06], "trim");                                                       // spine stripes
      lathe(m, [[0.001, 0.75], [0.02, 0.7], [0.03, 0.2], [0.05, 0.15], [0.05, -0.25], [0.035, -0.3]], 8, (q) => q === 3 ? "trim" : "dark", { at: [-0.35, sd * 1.27, -0.02] });   // wingtip cannon
      lathe(m, sphere(0.025, 3), 4, "glow", { at: [0.41, sd * 1.27, -0.02] });
      lathe(m, [[0.001, 0.42], [0.06, 0.36], [0.07, 0.0], [0.07, -0.3], [0.05, -0.36]], 8, (q) => q === 2 ? "trim" : "hull", { at: [0.15, sd * 0.4, 0.04] });   // side gun pod
      lathe(m, [[0.12, 0.45], [0.14, 0.3], [0.155, 0.0], [0.15, -0.25], [0.13, -0.32], [0.11, -0.36], [0.09, -0.34]], 12, (q) => q === 2 ? "dark" : q === 5 ? "dark" : "hull", { at: [-0.85, sd * 0.2, 0.06] });   // engine
      lathe(m, [[0.09, -0.34], [0.001, -0.33]], 12, "glow", { at: [-0.85, sd * 0.2, 0.06] });
    }
    box(m, [-0.5, -0.12, 0.25], [0.2, 0.05, 0.12], "dark");                                                               // sensor rod mount
    lathe(m, [[0.03, 0.2], [0.03, -1.05], [0.05, -1.1], [0.001, -1.16]], 6, "dark", { at: [-0.4, -0.12, 0.31] });        // long sensor rod
    lathe(m, sphere(0.025, 3), 4, "glow", { at: [-1.57, -0.12, 0.31] });
    MODELS.blade = m;
  }
  { // MINER (from your reference art): a chunky white hauler with an orange nose cone, teal side panels, a navy belly
    // with orange stripes, a big cockpit, two large engine pods trailing orange flames, a swept tail fin and, for the
    // mining, a laser boom with claws under the nose.
    const m = Mesh();
    lathe(m, [[0.001, 1.28], [0.08, 1.18], [0.17, 1.02], [0.27, 0.78], [0.37, 0.45], [0.42, 0.1], [0.43, -0.3], [0.4, -0.6], [0.33, -0.8], [0.22, -0.9]], 12,
      (q) => q <= 2 ? "nose" : q === 3 ? "dark" : "hull", { sz: 0.68 });
    slab(m, [[0.9, 0], [0.4, 0.3], [-0.6, 0.36], [-0.85, 0.25], [-0.85, -0.25], [-0.6, -0.36], [0.4, -0.3]], -0.2, 0.12, "dark");   // belly
    lathe(m, [[0.001, 0.55], [0.1, 0.45], [0.15, 0.25], [0.16, 0.0], [0.13, -0.18], [0.001, -0.28]], 10, "glass", { at: [0.35, 0, 0.21], sz: 0.55 });   // cockpit
    for (const x of [0.5, 0.33, 0.18]) box(m, [x, 0, 0.29], [0.02, 0.24, 0.025], "dark");                               // cockpit frame
    lathe(m, [[0.001, 0.35], [0.18, 0.25], [0.24, 0.0], [0.24, -0.45], [0.2, -0.6], [0.001, -0.65]], 10, "hull", { at: [-0.3, 0, 0.17], sz: 0.55 });   // roof
    for (const x of [-0.12, -0.3, -0.48]) box(m, [x, 0, 0.305], [0.07, 0.1, 0.02], "glass");                             // roof windows
    lathe(m, [[0.25, 0], [0.27, -0.15], [0.22, -0.25], [0.001, -0.26]], 8, (q) => q === 2 ? "glow" : "dark", { at: [-0.82, 0, 0], sz: 0.7 });   // tail engine
    fin(m, [[-0.4, 0.22], [-0.55, 0.45], [-0.8, 0.85], [-0.95, 0.88], [-0.92, 0.6], [-0.85, 0.22]], 0, 0.07, "pod", "hull");   // tail fin
    box(m, [-0.86, 0, 0.84], [0.14, 0.075, 0.03], "nose");
    lathe(m, [[0.012, 0], [0.012, 0.25], [0.001, 0.27]], 5, "dark", { axis: "z", at: [-0.55, 0.12, 0.28] });            // antenna
    lathe(m, sphere(0.022, 3), 4, "glow", { at: [-0.55, 0.12, 0.55] });
    box(m, [0.8, 0, -0.27], [0.45, 0.08, 0.08], "dark");                                                                  // mining boom
    lathe(m, sphere(0.06, 4), 6, "glow", { at: [1.05, 0, -0.27] });
    for (const sd of [-1, 1]) {
      slab(m, side([[0.75, 0.3], [0.1, 0.5], [-0.6, 0.52], [-0.8, 0.32], [0.0, 0.3]], sd), -0.05, 0.1, "trim", "dark");   // teal side panel
      box(m, [0.05, sd * 0.47, 0.01], [0.1, 0.05, 0.02], "glass"); box(m, [-0.2, sd * 0.49, 0.01], [0.1, 0.05, 0.02], "glass");
      box(m, [-0.1, sd * 0.37, -0.13], [1.0, 0.02, 0.03], "nose");                                                       // orange belly stripe
      box(m, [0.95, sd * 0.12, -0.27], [0.15, 0.04, 0.12], "pod");                                                       // claws
      slab(m, side([[-0.1, 0.38], [-0.3, 0.62], [-0.6, 0.62], [-0.55, 0.38]], sd), 0.02, 0.08, "trim", "dark");          // pod strut
      const at = [-0.35, sd * 0.78, 0.04];
      lathe(m, [[0.001, 0.62], [0.08, 0.56], [0.16, 0.45], [0.21, 0.25], [0.23, 0.0], [0.23, -0.35], [0.21, -0.48], [0.18, -0.55], [0.15, -0.5]], 12,
        (q) => q <= 3 ? "hull" : q === 4 ? "trim" : q === 7 ? "dark" : "pod", { at });                                    // engine pod
      lathe(m, [[0.15, -0.5], [0.001, -0.48]], 12, "glow", { at });
      lathe(m, [[0.14, -0.56], [0.08, -0.75], [0.001, -0.98]], 8, "glow", { at });                                       // flame
      lathe(m, [[0.07, -0.57], [0.001, -0.8]], 6, "flame", { at });
    }
    MODELS.spark = m;
  }
  { // GUNSHIP: an armoured patrol shuttle (our own design, loosely inspired by boxy sci-fi runabouts). A chamfered
    // box hull with a wide wrap-around windscreen, a flat top deck with a sensor spine, two long engine pods slung low on
    // swept pylons with blue drive strips and red intake caps, side hatches, running lights and a twin-cannon turret.
    const m = Mesh();
    lathe(m, [[0.001, 1.32], [0.2, 1.24], [0.4, 1.04], [0.5, 0.74], [0.53, 0.25], [0.53, -0.7], [0.49, -1.0], [0.38, -1.1]], 8,
      (q) => q === 1 ? "dark" : q === 5 ? "dark" : "hull", { sz: 0.6, rot: Math.PI / 8 });                               // chamfered hull
    slab(m, [[0.72, 0], [0.5, 0.36], [-0.98, 0.4], [-1.04, 0], [-0.98, -0.4], [0.5, -0.36]], 0.3, 0.05, "hull", "dark");   // top deck
    box(m, [-0.25, 0, 0.36], [0.95, 0.15, 0.06], "dark");                                                                 // sensor spine
    box(m, [-0.25, 0, 0.395], [0.8, 0.04, 0.015], "glow");
    box(m, [0.92, 0, 0.2], [0.16, 0.66, 0.1], "glass");                                                                   // windscreen
    box(m, [1.04, 0, 0.12], [0.1, 0.4, 0.07], "glass");
    for (const y of [-0.17, 0.17]) box(m, [0.94, y, 0.255], [0.18, 0.025, 0.02], "dark");                                // windscreen frame
    slab(m, [[0.9, 0], [0.3, 0.36], [-0.95, 0.38], [-0.95, -0.38], [0.3, -0.36]], -0.33, 0.06, "dark");                  // belly plate
    box(m, [-1.1, 0, 0.02], [0.1, 0.82, 0.42], "dark");                                                                   // rear drive housing
    for (const sd of [-1, 1]) {
      box(m, [0.72, sd * 0.47, 0.12], [0.26, 0.04, 0.08], "glass");                                                      // side window
      box(m, [-0.1, sd * 0.53, 0.02], [0.42, 0.02, 0.26], "dark");                                                       // side hatch
      box(m, [-0.1, sd * 0.545, 0.17], [0.3, 0.01, 0.02], "nose");
      box(m, [-0.65, sd * 0.53, 0.05], [0.25, 0.02, 0.12], "dark");                                                      // vents
      for (let k = 0; k < 3; k++) box(m, [-0.6 - k * 0.07, sd * 0.545, 0.05], [0.02, 0.01, 0.1], "trim");
      box(m, [0.5, sd * 0.535, -0.12], [0.08, 0.02, 0.03], "glow"); box(m, [-0.95, sd * 0.5, 0.25], [0.06, 0.03, 0.03], "nose");   // running lights
      box(m, [-1.16, sd * 0.22, 0.04], [0.02, 0.3, 0.14], "glow");                                                       // rear drives
      // Engine pod on a swept pylon, slung low beside the hull.
      slab(m, side([[0.3, 0.4], [0.1, 0.62], [-0.55, 0.62], [-0.65, 0.4]], sd), -0.17, 0.06, "hull", "dark");
      const at = [-0.15, sd * 0.66, -0.24];
      lathe(m, [[0.001, 0.98], [0.07, 0.92], [0.115, 0.8], [0.13, 0.62], [0.13, -0.55], [0.12, -0.72], [0.09, -0.8], [0.06, -0.78]], 10,
        (q) => q <= 1 ? "nose" : q === 3 ? "trim" : q >= 5 ? "dark" : "hull", { at });
      lathe(m, [[0.06, -0.78], [0.001, -0.76]], 10, "glow", { at });
      box(m, [-0.15, sd * 0.79, -0.24], [0.95, 0.015, 0.05], "glow");                                                    // drive strip (outer side)
      box(m, [-0.15, sd * 0.66, -0.11], [0.9, 0.04, 0.012], "glow");                                                     // drive strip (top)
      box(m, [0.35, sd * 0.66, -0.11], [0.12, 0.08, 0.02], "dark");
    }
    MODELS.lancer = m;
    const t = Mesh();   // turret: a faceted base, an armoured gun housing with a red stripe and twin long cannons
    lathe(t, [[0.3, 0], [0.3, 0.08], [0.22, 0.18], [0.001, 0.2]], 6, (q) => q === 1 ? "dark" : "hull", { axis: "z" });
    box(t, [0.12, 0, 0.15], [0.36, 0.3, 0.14], "hull");
    box(t, [0.12, 0, 0.225], [0.3, 0.06, 0.02], "trim");
    box(t, [-0.1, 0, 0.17], [0.12, 0.34, 0.1], "dark");
    for (const y of [-0.08, 0.08]) {
      lathe(t, [[0.04, 0.25], [0.04, 1.0], [0.055, 1.02], [0.055, 1.12]], 6, "dark", { at: [0, y, 0.15] });
      lathe(t, [[0.055, 1.12], [0.001, 1.13]], 6, "glow", { at: [0, y, 0.15] });
    }
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
  // ---- Buildings your miners construct ----
  { // DEFENSE TURRET: an armoured pylon with a glowing band (its gun is the gunship turret, aiming on top).
    const m = Mesh();
    lathe(m, [[0.001, 0], [0.9, 0], [0.95, 0.15], [0.62, 0.32], [0.46, 0.85], [0.58, 0.95], [0.001, 1.0]], 8, (p) => p === 1 || p === 4 ? "trim" : "hull", { axis: "z", rot: Math.PI / 8 });
    lathe(m, [[0.5, 0.55], [0.5, 0.66]], 8, "glow", { axis: "z", rot: Math.PI / 8 });
    MODELS.tower = m;
  }
  { // SUPPLY DEPOT: a hexagonal stack of cargo bays with glowing seams and three loading pods.
    const m = Mesh();
    lathe(m, [[0.001, 0], [0.9, 0], [0.9, 0.32], [0.74, 0.38], [0.74, 0.7], [0.001, 0.72]], 6, (p) => p === 2 ? "trim" : p === 4 ? "dark" : "hull", { axis: "z" });
    lathe(m, [[0.76, 0.48], [0.76, 0.55]], 6, "glow", { axis: "z" });
    for (let k = 0; k < 3; k++) { const a = k / 3 * 6.2832 + 0.5; box(m, [Math.cos(a) * 1.0, Math.sin(a) * 1.0, 0.18], [0.36, 0.36, 0.36], "trim"); box(m, [Math.cos(a) * 1.0, Math.sin(a) * 1.0, 0.38], [0.2, 0.2, 0.05], "glow"); }
    MODELS.depot = m;
  }
  { // OUTPOST: a smaller station hub with a glowing beacon spire and four landing pads.
    const m = Mesh();
    lathe(m, [[0.001, -0.1], [0.78, -0.05], [0.9, 0.18], [0.62, 0.45], [0.001, 0.5]], 6, (p) => p === 1 ? "trim" : "hull", { axis: "z", rot: Math.PI / 6 });
    lathe(m, [[0.16, 0.5], [0.08, 1.1], [0.001, 1.16]], 6, "glow", { axis: "z" });
    for (let k = 0; k < 4; k++) { const a = k / 4 * 6.2832 + 0.4; box(m, [Math.cos(a) * 0.62, Math.sin(a) * 0.62, 0.05], [0.7, 0.14, 0.1], "dark"); box(m, [Math.cos(a) * 1.08, Math.sin(a) * 1.08, 0.05], [0.34, 0.34, 0.08], "trim"); box(m, [Math.cos(a) * 1.08, Math.sin(a) * 1.08, 0.11], [0.12, 0.12, 0.03], "glow"); }
    MODELS.outpost = m;
  }
  { // SHIPYARD: an open dock frame with rails, cross-beams and glowing guide strips.
    const m = Mesh();
    box(m, [0, 0, 0], [2.1, 1.4, 0.12], "dark");
    for (const s of [-1, 1]) { box(m, [0, s * 0.56, 0.3], [2.0, 0.18, 0.5], "hull"); box(m, [0, s * 0.56, 0.57], [1.8, 0.06, 0.04], "glow"); }
    for (const x of [-0.85, 0, 0.85]) box(m, [x, 0, 0.6], [0.16, 1.3, 0.14], "trim");
    box(m, [-0.85, 0.56, 0.95], [0.18, 0.18, 0.6], "trim"); box(m, [-0.55, 0.3, 1.2], [0.8, 0.12, 0.12], "dark");
    MODELS.yard = m;
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
    blade:  { hull: [232, 226, 212], trim: [255, 118, 48], dark: [42, 46, 72], glass: [60, 150, 210], glow: [120, 215, 255], rim: [255, 160, 90] },
    spark:  { hull: [226, 228, 236], trim: [64, 158, 196], dark: [34, 36, 70], glass: [70, 120, 180], glow: [255, 140, 50], nose: [255, 128, 46], pod: [150, 154, 168], flame: [255, 214, 80], rim: [255, 170, 100] },
    lancer: { hull: [196, 200, 212], trim: [70, 130, 210], dark: [48, 52, 66], glass: [40, 70, 115], glow: [110, 200, 255], nose: [226, 82, 58], rim: [140, 190, 255] },
    p: { hull: [200, 190, 225], trim: [150, 70, 255], dark: [45, 30, 75], glass: [120, 210, 255], glow: [255, 90, 230], rim: [255, 60, 210] },
    e: { organic: true, hull: [210, 110, 40], trim: [255, 170, 60], dark: [70, 25, 10], glass: [255, 200, 120], glow: [180, 255, 90], rim: [255, 140, 40] },
    rock: { stone: true, hull: [95, 80, 120], trim: [120, 100, 150], dark: [40, 30, 55], glass: [0, 0, 0], glow: [0, 0, 0], rim: [140, 80, 220] },
    crystal: { crystal: true, hull: [0, 0, 0], trim: [0, 0, 0], dark: [0, 0, 0], glass: [255, 110, 235], glow: [255, 160, 250], rim: [255, 120, 255] },
  };
  // ---- Lighting: a white-gold star (drifting slowly across the sky), a faint pink bounce from the planet below and a
  // purple ambient, plus moving point lights: lasers, shells, explosions, engines, crystals, the station and the hive.
  const norm = v => { const l = Math.hypot(...v) || 1; return v.map(c => c / l); };
  const VIEW = norm([0, 0.62, 0.78]), LIGHT_FILL = norm([0.5, 0.6, -0.3]), SUN = [255, 240, 225];
  let LIGHT_KEY = norm([-0.55, -0.45, 0.7]), HALF = norm(LIGHT_KEY.map((c, i) => c + VIEW[i]));
  const TILT = { y: 0.62, z: 0.8 };   // how the camera looks down: depth squashes y, height lifts things up the screen
  function moveSun(now) {
    if (!GFX.movingSun) return;
    const az = -2.46 + Math.sin(now / 52000) * 0.55, el = 0.78 + Math.sin(now / 37000) * 0.14;
    LIGHT_KEY = [Math.cos(az) * Math.cos(el), Math.sin(az) * Math.cos(el), Math.sin(el)];
    HALF = norm(LIGHT_KEY.map((c, i) => c + VIEW[i]));
  }
  // Materials. metal: how much it mirrors its surroundings (tinted by its colour); shine: how tight the highlights are;
  // tex: how strongly the metal panel texture shows.
  const MAT = {
    hull: { metal: 0.55, shine: 24, tex: 1 },   trim: { metal: 0.45, shine: 30, tex: 0.7 }, dark: { metal: 0.7, shine: 16, tex: 1 },
    pod:  { metal: 0.65, shine: 26, tex: 1 },   nose: { metal: 0.35, shine: 34, tex: 0.5 },
    glass: { metal: 0, mirror: 0.8, shine: 70, tex: 0 },
  };
  const ORGANIC = { metal: 0, shine: 40, tex: 0, wet: 0.7 };          // alien chitin: no metal, wet highlights
  const STONE = { metal: 0.04, shine: 8, tex: 1, rock: true };          // asteroids
  // What a mirror pointing in direction (rx, ry, rz) sees: bright nebula above, purple at the horizon, the dark pink
  // planet below, with a pink streak that slides round as ships turn.
  const ENV_TOP = [215, 195, 255], ENV_MID = [110, 64, 185], ENV_LOW = [60, 18, 52];
  function env(rx, ry, rz) {
    const t = Math.max(-1, Math.min(1, rz)), A = t >= 0 ? ENV_TOP : ENV_LOW, k = Math.abs(t);
    const streak = Math.max(0, Math.sin(Math.atan2(ry, rx) * 2 + 0.8)) ** 4 * 0.5;
    return [ENV_MID[0] + (A[0] - ENV_MID[0]) * k + 255 * streak, ENV_MID[1] + (A[1] - ENV_MID[1]) * k + 80 * streak, ENV_MID[2] + (A[2] - ENV_MID[2]) * k + 210 * streak];
  }
  // ---- Metal textures (drawn once): brushed streaks, staggered panel seams with lit edges, rivets and grime, on a mid
  // grey so they can be laid over any colour ("overlay": darker = seams and grime, lighter = highlights). Tileable. ----
  function makeTexture(rock) {
    const N = 128, c = document.createElement("canvas"); c.width = c.height = N;
    const g = c.getContext("2d"); let seed = rock ? 7 : 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    g.fillStyle = "rgb(128,128,128)"; g.fillRect(0, 0, N, N);
    const wrap = (fn) => { for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) fn(ox, oy); };
    if (rock) {
      for (let i = 0; i < 160; i++) { const x = rnd() * N, y = rnd() * N, r = 2 + rnd() * 10, v = 90 + rnd() * 80; wrap((ox, oy) => { g.fillStyle = `rgba(${v},${v},${v},0.35)`; g.beginPath(); g.arc(x + ox, y + oy, r, 0, 6.28); g.fill(); }); }
      for (let i = 0; i < 40; i++) { const x = rnd() * N, y = rnd() * N, r = 2 + rnd() * 5; wrap((ox, oy) => { g.strokeStyle = "rgba(50,50,50,0.5)"; g.lineWidth = 1; g.beginPath(); g.arc(x + ox, y + oy, r, 0, 6.28); g.stroke(); g.strokeStyle = "rgba(200,200,200,0.35)"; g.beginPath(); g.arc(x + ox + 0.8, y + oy + 0.8, r, 3.4, 5.6); g.stroke(); }); }
      return c;
    }
    for (let i = 0; i < 420; i++) { const x = rnd() * N, y = rnd() * N, l = 10 + rnd() * 70, v = 128 + (rnd() - 0.5) * 70; wrap((ox, oy) => { g.fillStyle = `rgba(${v | 0},${v | 0},${v | 0},0.4)`; g.fillRect(x + ox, y + oy, l, 1); }); }   // brushed
    const rows = [0, 40, 82], cols = [[0, 64], [30, 96], [12, 76]];                                                   // staggered panels
    for (let r = 0; r < rows.length; r++) {
      const y0 = rows[r], y1 = rows[r + 1] ?? N;
      for (const x of cols[r]) { g.fillStyle = "rgba(30,30,34,0.85)"; g.fillRect(x, y0, 1.5, y1 - y0); g.fillStyle = "rgba(215,215,220,0.45)"; g.fillRect(x + 1.5, y0, 1, y1 - y0); }
      g.fillStyle = "rgba(30,30,34,0.85)"; g.fillRect(0, y0, N, 1.5); g.fillStyle = "rgba(215,215,220,0.45)"; g.fillRect(0, y0 + 1.5, N, 1);
      for (let x = 4; x < N; x += 9) { g.fillStyle = "rgba(40,40,44,0.7)"; g.fillRect(x, y0 + 4, 1.5, 1.5); g.fillStyle = "rgba(230,230,235,0.5)"; g.fillRect(x + 0.6, y0 + 4, 0.8, 0.8); }   // rivets
    }
    for (let i = 0; i < 26; i++) { const x = rnd() * N, y = rnd() * N, w = 6 + rnd() * 22; g.fillStyle = `rgba(60,55,60,${0.08 + rnd() * 0.12})`; g.beginPath(); g.ellipse(x, y, w, w * 0.4, rnd() * 3, 0, 6.28); g.fill(); }   // grime
    for (let i = 0; i < 18; i++) { const x = rnd() * N, y = rnd() * N; g.strokeStyle = "rgba(225,225,230,0.35)"; g.lineWidth = 0.6; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 24, y + (rnd() - 0.5) * 8); g.stroke(); }   // scratches
    return c;
  }
  const TEX = { metal: ctx.createPattern(makeTexture(false), "repeat"), rock: ctx.createPattern(makeTexture(true), "repeat") };
  // ---- Point lights for this frame (built in draw()) ----
  let lights = [];
  const rgbOf = (() => { const cache = {}; return c => cache[c] || (cache[c] = c[0] === "#" ? [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)) : c.split(",").map(Number)); })();
  function collectLights() {
    const out = [], x0 = cam.x - 200, y0 = cam.y - 200, x1 = cam.x + W / zoom + 200, y1 = cam.y + H / zoom + 200;
    const add = (x, y, z, rgb, range, power) => { if (x > x0 && x < x1 && y > y0 && y < y1 && power > 0.02) out.push({ x, y, z, rgb, range, power }); };
    for (const f of fx) {
      if (f.beam) { const c = rgbOf(f.color); add(f.tx, f.ty, f.h || 12, c, 95, 1.3 * f.life); add((f.x + f.tx) / 2, (f.y + f.ty) / 2, f.h || 12, c, 70, 0.6 * f.life); }
      else if (f.ring) add(f.x, f.y, 22, rgbOf(f.color), 70 + f.r * 7, 2.2 * f.life);
    }
    for (const sh of shots) { const t = sh.t / sh.dur; add(sh.x + (sh.tx - sh.x) * t, sh.y + (sh.ty - sh.y) * t, 14 + (sh.arc ? Math.sin(t * Math.PI) * 50 : 0), sh.team === "p" ? [220, 150, 255] : [180, 255, 90], 90, 1); }
    for (const e of ents) {
      if (e.type === "core") add(e.x, e.y, 90, [176, 77, 255], 260, 0.22);
      else if (e.type === "hive") add(e.x, e.y, 80, [180, 255, 90], 260, 0.25);
      else if (e.team === "p" && !e.T.building && e.moving) add(e.x - Math.cos(e.face) * e.r * 1.6, e.y - Math.sin(e.face) * e.r * 1.6, 18, rgbOf(ENGINE[e.type] || "255,90,230"), 34, 0.3);
    }
    for (const k of crystals) if (k.left > 0) add(k.x, k.y, 14, [255, 90, 230], 110, 0.3);
    return out.length > 48 ? out.sort((a, b) => b.power - a.power).slice(0, 48) : out;
  }

  // ---- Blender models (models/models.json): a slot's model in this game's axes, or null for the built-in one ----
  const SLOT = { tower: "rts.turret", depot: "rts.depot", outpost: "rts.outpost", yard: "rts.shipyard", core: "rts.station", spark: "rts.miner", blade: "rts.interceptor", lancer: "rts.gunship", mite: "rts.swarmling", brute: "rts.behemoth", spitter: "rts.spitter", hive: "rts.hive", crystal: "rts.crystal", rock: "rts.asteroid" };
  const BLENDER = {};
  function blender(kind) {
    const slot = SLOT[kind];
    if (!(slot in BLENDER)) {
      const m = window.TenshiModels && window.TenshiModels.get(slot);
      // glTF: x = left, y = up, z = forward. Here: x = forward, y = right, z = up.
      BLENDER[slot] = m ? window.TenshiModels.axes(m, ([x, y, z]) => [z, -x, y]) : null;
    }
    return BLENDER[slot];
  }
  if (window.TenshiModels) window.TenshiModels.whenReady(() => { for (const k in BLENDER) delete BLENDER[k]; });

  // A model's shadow: every face pushed along the star's light down to the floor, filled as one soft dark shape.
  function drawShadow(m, x, y, z, yaw, size) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), L = LIGHT_KEY, kx = L[0] / L[2], ky = L[1] / L[2];
    const S = m.v.map(([mx, my, mz]) => {
      const X = (mx * cy - my * sy) * size + x, Y = (mx * sy + my * cy) * size + y, Z = mz * size + z;
      return [sx(X - kx * Z), sy_(Y - ky * Z)];
    });
    ctx.beginPath();
    for (const f of m.f) {
      // Every face the same way round, so overlapping faces add up to one solid outline (no holes).
      let ar = 0; for (let k = 0, L2 = f.i.length; k < L2; k++) { const p1 = S[f.i[k]], p2 = S[f.i[(k + 1) % L2]]; ar += p1[0] * p2[1] - p2[0] * p1[1]; }
      if (Math.abs(ar) < 6) continue;   // tiny faces add nothing to the outline
      const idx = ar > 0 ? f.i : f.i.slice().reverse();
      ctx.moveTo(S[idx[0]][0], S[idx[0]][1]); for (let k = 1; k < idx.length; k++) ctx.lineTo(S[idx[k]][0], S[idx[k]][1]); ctx.closePath();
    }
    ctx.fillStyle = "rgba(4,0,12,0.42)"; ctx.fill("nonzero");
  }
  // Draw one model at map position (x, y), height z, facing `yaw`, banked by `roll`, `size` = unit radius.
  function drawModel(m, x, y, z, yaw, roll, size, paint, flash = 0, alpha = 1) {
    if (glOn) { GL3.draw(m, paint, x, y, z, yaw, roll, size, flash, alpha); return; }
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
      if (!f.wind && (mid[0] - pc[0]) * n[0] + (mid[1] - pc[1]) * n[1] + (mid[2] - pc[2]) * n[2] < 0) n = n.map(v => -v);   // Blender faces ("wind") already point the right way
      const facing = n[0] * VIEW[0] + n[1] * VIEW[1] + n[2] * VIEW[2];
      if (facing <= 0.02) continue;                                            // back faces are hidden
      // Size on screen: faces too small to see are skipped (keeps detailed ships fast when zoomed out).
      let area = 0; for (let k = 0, L = f.i.length; k < L; k++) { const p1 = P[f.i[k]], p2 = P[f.i[(k + 1) % L]]; area += p1[3] * p2[4] - p2[3] * p1[4]; }
      area = Math.abs(area) / 2; if (area < 0.5) continue;
      faces.push({ f, n, facing, area, mid, depth: mid[1] * TILT.y + mid[2] * TILT.z });
    }
    faces.sort((p, q) => p.depth - q.depth);
    // The lights close enough to touch this model.
    const reach = size * 1.6, near = GFX.dynamicLights ? lights.filter(L => (L.x - x) ** 2 + (L.y - y) ** 2 < (L.range + reach) ** 2) : [];
    // The texture follows the model: centred on it, turned with it, squashed by the camera tilt, scaled to its size.
    let texMatrix = null;
    const metalK = GFX.metal;
    ctx.globalAlpha = alpha;
    for (const { f, n, facing, area, mid } of faces) {
      const base = f.rgb || paint[f.mat] || paint.hull;      // Blender faces carry their own material colour
      let col;
      const M = paint.organic ? ORGANIC : paint.stone ? STONE : (paint === PAINT.crystal ? MAT.glass : MAT[f.mat] || MAT.hull);
      if (f.mat === "glow" || f.mat === "flame") col = base;
      else {
        const key = Math.max(0, n[0] * LIGHT_KEY[0] + n[1] * LIGHT_KEY[1] + n[2] * LIGHT_KEY[2]);
        const fill = Math.max(0, n[0] * LIGHT_FILL[0] + n[1] * LIGHT_FILL[1] + n[2] * LIGHT_FILL[2]) * 0.35;
        const nh = Math.max(0, n[0] * HALF[0] + n[1] * HALF[1] + n[2] * HALF[2]);
        const fres = Math.pow(1 - facing, 3);
        const metal = (M.metal || 0) * metalK, mirror = (M.mirror || 0) * metalK;
        const spec = Math.pow(nh, M.shine) * (M.mirror ? 1.6 : M.wet ? 1.2 : 0.9) * key ** 0.3;
        // Reflection: the view direction bounced off the face, looked up in the surroundings.
        const r0 = 2 * facing * n[0] - VIEW[0], r1 = 2 * facing * n[1] - VIEW[1], r2 = 2 * facing * n[2] - VIEW[2];
        const E = metal || mirror ? env(r0, r1, r2) : null, refl = metal * (0.4 + 0.6 * fres) + mirror * (0.2 + 0.8 * fres);
        const diffuse = (0.2 + key * 0.95 + fill) * (1 - metal * 0.55);
        col = [0, 1, 2].map(k => {
          const tint = metal ? 0.35 + 0.65 * base[k] / 255 : 1;                 // metal reflections take on the metal's colour
          return base[k] * diffuse + (E ? E[k] * tint * refl : 0) + SUN[k] * spec * (metal ? 0.55 + 0.45 * base[k] / 255 : 1) + paint.rim[k] * fres * 0.45;
        });
        // Point lights: each lights the faces turned towards it, fading with distance, with a little highlight.
        if (near.length) {
          const wx = x + mid[0] * size, wy = y + mid[1] * size, wz = z + mid[2] * size;
          for (const L of near) {
            const dx = L.x - wx, dy = L.y - wy, dz = L.z - wz, d = Math.hypot(dx, dy, dz) || 1;
            if (d > L.range) continue;
            const nd = (n[0] * dx + n[1] * dy + n[2] * dz) / d;
            if (nd <= 0) continue;
            const att = (1 - d / L.range) ** 2 * L.power, glint = nd ** 10 * (0.4 + metal);
            for (let k = 0; k < 3; k++) col[k] += (base[k] * nd * 1.1 + 255 * glint) * L.rgb[k] / 255 * att;
          }
        }
      }
      if (flash) col = col.map(v => v + (255 - v) * flash);
      const css = `rgb(${Math.min(255, col[0] | 0)},${Math.min(255, col[1] | 0)},${Math.min(255, col[2] | 0)})`;
      ctx.beginPath();
      f.i.forEach((i, k) => k ? ctx.lineTo(P[i][3], P[i][4]) : ctx.moveTo(P[i][3], P[i][4]));
      ctx.closePath();
      ctx.fillStyle = css; ctx.fill();
      if (area > 40) { ctx.strokeStyle = css; ctx.lineWidth = 0.6; ctx.stroke(); }   // seals hairline gaps between faces (only visible on big ones)
      // Metal panel texture over the bigger faces.
      if (GFX.textures > 0 && M.tex && area > 70 && f.mat !== "glow") {
        const pat = M.rock ? TEX.rock : TEX.metal;
        if (!texMatrix) { const k = size * zoom / 60; texMatrix = new DOMMatrix().translateSelf(sx(x), sy_(y) - z * zoom * TILT.z).scaleSelf(1, TILT.y).rotateSelf(yaw * 57.2958).scaleSelf(k, k); }
        pat.setTransform(texMatrix);
        ctx.globalCompositeOperation = "overlay"; ctx.globalAlpha = alpha * Math.min(1, M.tex * GFX.textures * Math.min(1, (area - 70) / 200 + 0.5));
        ctx.fillStyle = pat; ctx.fill();
        ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = alpha;
      }
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
    const px = Math.max(0, cam.x / MAP.w), py = Math.max(0, cam.y / MAP.h);
    ctx.fillStyle = "#04020a"; ctx.fillRect(0, 0, W, H);   // solid space underneath, so no gap ever shows at the edges
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
    moveSun(now); lights = GFX.dynamicLights ? collectLights() : [];
    glOn = !!glReady();
    glCanvas.style.display = glOn ? "" : "none";
    mainCtx.clearRect(0, 0, W, H);
    if (glOn) { bgx.clearRect(0, 0, W, H); GL3.begin({ W, H, zoom, camx: cam.x, camy: cam.y, key: LIGHT_KEY, lights: lights.slice().sort((a, b) => b.power - a.power), bg: bgCanvas }); }
    layer(false);
    drawSpace(now);
    // A faint tactical grid and the map edge.
    ctx.save(); ctx.scale(zoom, zoom); ctx.translate(-cam.x, -cam.y);
    ctx.strokeStyle = "rgba(176, 77, 255, 0.06)"; ctx.lineWidth = 1 / zoom; ctx.beginPath();
    for (let x = 0; x <= MAP.w; x += 200) { ctx.moveTo(x, 0); ctx.lineTo(x, MAP.h); }
    for (let y = 0; y <= MAP.h; y += 200) { ctx.moveTo(0, y); ctx.lineTo(MAP.w, y); }
    ctx.stroke();
    ctx.restore();
    // Asteroids, slowly tumbling.
    for (const k of rocks) {
      if (sx(k.x) < -80 || sx(k.x) > W + 80 || sy(k.y) < -80 || sy(k.y) > H + 80) continue;
      drawModel(blender("rock") || ROCKS[k.k % 4], k.x, k.y, -10, k.a + now * k.spin, Math.sin(now * k.spin * 0.7 + k.a) * 0.6, k.r, PAINT.rock);
    }
    // Crystals: floating, turning, glowing.
    for (const k of crystals) {
      if (k.left <= 0) continue;
      const left = Math.max(0.35, k.left / (CRYSTAL.amount * 1.5)), bob = Math.sin(now / 700 + k.x) * 3;
      bloom(sx(k.x), sy(k.y) - (6 + bob) * zoom, 34 * zoom, "255,90,230", 0.25 + 0.1 * Math.sin(now / 400 + k.y));
      drawModel(blender("crystal") || MODELS.crystal, k.x, k.y, 6 + bob, now / 1800 + k.x, 0, 15 * left + 6, PAINT.crystal);
    }
    // Selection rings, under the units.
    for (const e of selected) {
      ctx.strokeStyle = "#7dffb2"; ctx.lineWidth = 1.5; glow("#7dffb2", 8);
      ctx.beginPath(); ctx.ellipse(sx(e.x), sy(e.y), (e.r + 7) * zoom, (e.r + 7) * zoom * TILT.y, 0, 0, 6.28); ctx.stroke();
    }
    ctx.shadowBlur = 0;
    // Units, back to front.
    for (const e of [...ents].sort((a, b) => a.y - b.y)) { if (isSeen(e)) drawEnt(e, now); }
    layer(true);                                                  // everything from here on goes on top of the models
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
    if (placing) drawPlacing();
    if (drag && drag.box) {
      ctx.strokeStyle = "#7dffb2"; ctx.lineWidth = 1; ctx.fillStyle = "rgba(125,255,178,0.08)";
      const x = Math.min(drag.x0, drag.x1), y = Math.min(drag.y0, drag.y1), w = Math.abs(drag.x1 - drag.x0), h = Math.abs(drag.y1 - drag.y0);
      ctx.fillRect(x, y, w, h); ctx.strokeRect(x, y, w, h);
    }
    if (amoveMode) { ctx.fillStyle = "#ff8a2b"; ctx.font = "700 12px Oswald, sans-serif"; ctx.fillText("ATTACK-MOVE: click where to go", 16, H - 200); }
    drawMinimap();
    if (glOn) GL3.end();
  }

  // Height each kind floats at, and how big its model is compared with its hit circle.
  const ENGINE = { spark: "255,150,60", blade: "120,210,255", lancer: "110,200,255" };   // engine glow colour per ship
  const HOVER = { spark: 16, blade: 22, lancer: 18, core: 10, mite: 10, brute: 6, spitter: 26, hive: 4, tower: 2, depot: 2, outpost: 6, yard: 4 };
  const SIZE = { spark: 1.35, blade: 1.45, lancer: 1.3, core: 0.95, mite: 1.0, brute: 0.95, spitter: 1.0, hive: 0.95, tower: 1.3, depot: 1.15, outpost: 1.0, yard: 1.0 };
  function drawEnt(e, now) {
    const T = e.T, paint = PAINT[e.type] || PAINT[e.team], flash = Math.min(1, e.flash);
    const h = HOVER[e.type] + (T.building ? 0 : Math.sin(now / 420 + e.bob) * 3), size = e.r * SIZE[e.type];
    // Shadow: the model's real outline, cast by the star onto the "floor" of space (moves as the star drifts).
    const own0 = blender(e.type), shadowModel = own0 || (e.type === "core" ? MODELS.ring : MODELS[e.type]);
    layer(false);
    if (glOn) {} else if (shadowModel && GFX.shadows) drawShadow(shadowModel, e.x, e.y, h, T.building ? (e.type === "outpost" ? now / 8000 : YAW[e.type] || 0) : e.face, size * (own0 ? 1.15 : 1) * (e.type === "core" ? 1 : 1));
    else { ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.beginPath(); ctx.ellipse(sx(e.x + h * 0.35), sy(e.y + h * 0.25), size * zoom, size * zoom * TILT.y * 0.8, 0, 0, 6.28); ctx.fill(); }
    const X = sx(e.x), Y = sy(e.y) - h * zoom * TILT.z;
    if (e.type === "core") {
      bloom(X, Y - size * 0.6 * zoom, size * 2.2 * zoom, "176,77,255", 0.35);
      if (blender("core")) drawModel(blender("core"), e.x, e.y, h, now / 9000, 0, size * 1.3, paint, flash);
      else { drawModel(MODELS.ring, e.x, e.y, h, now / 2600, 0.25, size, paint, flash); drawModel(MODELS.core, e.x, e.y, h, 0, 0, size, paint, flash); }
      layer(true);
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
      drawModel(blender("hive") || MODELS.hive, e.x, e.y, h, now / 6000, 0, size * pulse, paint, flash);
      layer(true);
    } else if (T.building) {
      drawBuilding(e, now, X, Y, h, size, paint, flash);
      layer(true);
    } else {
      // Ships bank into turns; aliens wobble.
      const turn = Math.atan2(Math.sin(e.face - (e.lastFace ?? e.face)), Math.cos(e.face - (e.lastFace ?? e.face)));
      e.lastFace = e.face; e.bank = (e.bank || 0) * 0.9 + clamp(turn * 6, -0.8, 0.8) * 0.1;
      const roll = e.team === "p" ? e.bank : Math.sin(now / 160 + e.bob) * 0.12;
      const builtIn = !blender(e.type);
      if (builtIn && e.type === "mite") drawLegs(e, now, X, Y, size, 3, 0.9);
      if (builtIn && e.type === "brute") drawLegs(e, now, X, Y, size, 3, 1.1);
      if (builtIn && e.type === "spitter") drawTentacles(e, now, X, Y, size);
      const own = blender(e.type);
      drawModel(own || MODELS[e.type], e.x, e.y, h, e.face, roll, size * (own ? 1.15 : 1), paint, flash);
      if (e.type === "lancer" && !own) drawModel(MODELS.turret, e.x, e.y, h + size * 0.35, e.aim ?? e.face, 0, size, paint, flash);
      layer(true);
      if (builtIn && e.type === "mite") drawWings(e, now, X, Y, size);
      // Engine glow at the back of your ships (brighter when moving).
      if (e.team === "p") {
        const back = -size * (e.type === "lancer" ? 1.15 : 0.95), moving = e.moving ? 1 : 0.45;
        const bx = X + Math.cos(e.face) * back * zoom, by = Y + Math.sin(e.face) * back * zoom * TILT.y;
        bloom(bx, by, size * (0.7 + 0.5 * moving) * zoom, ENGINE[e.type] || "255,90,230", 0.55 * moving + 0.2);
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
  // Your buildings: see-through while under construction, with a green ring that fills as the miners build.
  const YAW = { tower: 0, depot: 0.3, outpost: 0, yard: 0.55 };
  function drawBuilding(e, now, X, Y, h, size, paint, flash) {
    const k = e.built, alpha = k < 1 ? 0.3 + k * 0.5 : 1, own = blender(e.type);
    if (k >= 1) bloom(X, Y - size * 0.4 * zoom, size * 1.9 * zoom, e.type === "tower" ? "255,90,230" : "176,77,255", 0.22);
    const yaw = e.type === "outpost" ? now / 8000 : YAW[e.type] || 0;
    drawModel(own || MODELS[e.type], e.x, e.y, h, yaw, 0, size * (own ? 1.2 : 1), paint, flash, alpha);
    if (e.type === "tower" && !own) drawModel(MODELS.turret, e.x, e.y, h + size * 1.0, e.aim ?? -0.8, 0, size * 0.8, paint, flash, alpha);
    const GX = sx(e.x), GY = sy(e.y);
    if (k < 1) {
      ctx.strokeStyle = "rgba(125,255,178,0.35)"; ctx.lineWidth = 2; ctx.setLineDash([5, 5]);
      ctx.beginPath(); ctx.ellipse(GX, GY, size * 1.45 * zoom, size * 1.45 * zoom * TILT.y, 0, 0, 6.28); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = "#7dffb2"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(GX, GY, size * 1.45 * zoom, size * 1.45 * zoom * TILT.y, 0, -1.57, -1.57 + k * 6.28); ctx.stroke();
    } else if (e.queue.length) {
      const q = e.queue[0], p = 1 - q.left / (UNITS[q.type].time * 1000);
      ctx.strokeStyle = "#7dffb2"; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(GX, GY, size * 1.5 * zoom, size * 1.5 * zoom * TILT.y, 0, -1.57, -1.57 + p * 6.28); ctx.stroke();
    }
    layer(true);
    if (e.rally && selected.includes(e) && done(e)) { ctx.setLineDash([6, 6]); ctx.strokeStyle = "rgba(215,170,255,.6)"; ctx.beginPath(); ctx.moveTo(GX, GY); ctx.lineTo(sx(e.rally.x), sy(e.rally.y)); ctx.stroke(); ctx.setLineDash([]); }
  }
  // Choosing where to build: the build zones (dashed) and a ghost of the building, green where it fits, red where not.
  function drawPlacing() {
    ctx.save(); ctx.setLineDash([8, 8]); ctx.lineWidth = 1.5; ctx.strokeStyle = "rgba(125,255,178,0.5)";
    for (const hq of hqs()) { ctx.beginPath(); ctx.ellipse(sx(hq.x), sy(hq.y), BUILD.radius * zoom, BUILD.radius * zoom * TILT.y, 0, 0, 6.28); ctx.stroke(); }
    ctx.restore();
    if (!mouse.in) return;
    const w = toWorld(mouse.x, mouse.y), T = UNITS[placing.type], ok = !canPlace(placing.type, w.x, w.y);
    ctx.fillStyle = ok ? "rgba(125,255,178,0.16)" : "rgba(255,80,80,0.22)"; ctx.strokeStyle = ok ? "#7dffb2" : "#ff5050"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(sx(w.x), sy(w.y), T.r * 1.3 * zoom, T.r * 1.3 * zoom * TILT.y, 0, 0, 6.28); ctx.fill(); ctx.stroke();
    if (T.range) { ctx.strokeStyle = "rgba(255,90,224,0.35)"; ctx.setLineDash([4, 6]); ctx.beginPath(); ctx.ellipse(sx(w.x), sy(w.y), T.range * zoom, T.range * zoom * TILT.y, 0, 0, 6.28); ctx.stroke(); ctx.setLineDash([]); }
    drawModel(blender(placing.type) || MODELS[placing.type], w.x, w.y, HOVER[placing.type], YAW[placing.type] || 0, 0, T.r * SIZE[placing.type], PAINT.p, 0, 0.45);
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
    const one = selected.length === 1 ? selected[0] : null;
    if (one && one.team === "p" && one.T.building) {             // one of your buildings
      const T = one.T, makes = done(one) ? TRAINS[one.type] : null;
      const key = one.id + ":" + one.queue.length + ":" + credits + ":" + (done(one) ? "done" : Math.floor(one.built * 20));
      if (progressOnly && key === panelKey) { const bar = panel.querySelector(".rts-prog b"); if (bar) bar.style.width = progressOf(one) * 100 + "%"; return; }
      panelKey = key;
      const info = !done(one) ? `Under construction · ${Math.floor(one.built * 100)}% · right-click it with miners to build faster`
        : makes ? (one.type === "core" ? "Builds ships" : T.tip) + " · right-click to set the rally point" : T.tip;
      const btn = t => `<button type="button" data-train="${t}" ${credits < UNITS[t].cost ? "disabled" : ""} title="${UNITS[t].tip}"><b>${UNITS[t].key}</b> ${UNITS[t].name}<i>◆ ${UNITS[t].cost}</i></button>`;
      panel.innerHTML = `<div class="rts-sel"><b>${T.name}</b><span>${info}</span></div>` +
        (makes ? `<div class="rts-btns">${makes.map(btn).join("")}</div><div class="rts-queue">${one.queue.map(item => `<span class="rts-q">${UNITS[item.type].name[0]}</span>`).join("") || "<span class='rts-dim'>Queue empty</span>"}</div>` : "") +
        (makes || !done(one) ? `<div class="rts-prog"><b style="width:${progressOf(one) * 100}%"></b></div>` : "");
      return;
    }
    if (progressOnly) return;
    panelKey = "";
    if (!selected.length) { panel.innerHTML = `<div class="rts-sel"><b>NOTHING SELECTED</b><span>Click a ship or drag a box. Click the station to build ships; select a miner to build turrets and outposts.</span></div>`; return; }
    const counts = {};
    for (const e of selected) counts[e.T.name] = (counts[e.T.name] || 0) + 1;
    panel.innerHTML = `<div class="rts-sel"><b>${selected.length} SELECTED</b><span>${Object.entries(counts).map(([n, k]) => k + " " + n).join(" · ")}</span></div>
      <div class="rts-btns"><button type="button" data-act="amove"><b>A</b> ATTACK-MOVE</button><button type="button" data-act="stop"><b>S</b> STOP</button>${selected.some(e => e.type === "spark") ? BUILDS.map(t => `<button type="button" data-build="${t}" ${credits < UNITS[t].cost ? "disabled" : ""} title="${UNITS[t].tip}"><b>${UNITS[t].key}</b> ${UNITS[t].name}<i>◆ ${UNITS[t].cost}</i></button>`).join("") : ""}</div>`;
  }
  const progressOf = e => !done(e) ? e.built : e.queue[0] ? 1 - e.queue[0].left / (UNITS[e.queue[0].type].time * 1000) : 0;
  panel.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.train) train(b.dataset.train, selected.length === 1 ? selected[0] : null);
    if (b.dataset.build) startPlacing(b.dataset.build);
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
    supplyEl.textContent = "▲ " + supply() + " / " + supplyCap();
    for (const b of panel.querySelectorAll("[data-build], [data-train]")) b.disabled = credits < UNITS[b.dataset.build || b.dataset.train].cost;
    const t = Math.max(0, Math.ceil(waveAt - clock));
    waveEl.textContent = hive() ? `WAVE ${waveNo + 1} IN ${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}` : "";
  }

  // ================================================ INPUT ================================================
  let drag = null, keys = {}, mouse = { x: -1, y: -1, in: false };
  const toWorld = (x, y) => ({ x: x / zoom + cam.x, y: y / zoom + cam.y });
  function local(e) { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  canvas.addEventListener("contextmenu", e => e.preventDefault());
  canvas.addEventListener("wheel", e => { if (state !== "play") return; e.preventDefault(); const p = local(e); zoomBy(Math.exp(-clamp(e.deltaY, -120, 120) * 0.0018), p.x, p.y); }, { passive: false });
  // Two fingers: pinch to zoom (and the selection drag is cancelled).
  const touches = new Map(); let pinch = 0;
  const pinchGap = () => { const [a, b] = [...touches.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  canvas.addEventListener("pointerdown", e => { if (e.pointerType === "mouse") return; touches.set(e.pointerId, local(e)); if (touches.size === 2) { drag = null; pinch = pinchGap(); } });
  canvas.addEventListener("pointermove", e => {
    if (!touches.has(e.pointerId)) return; touches.set(e.pointerId, local(e));
    if (touches.size === 2 && pinch) { const g = pinchGap(), [a, b] = [...touches.values()]; zoomBy(g / pinch, (a.x + b.x) / 2, (a.y + b.y) / 2); pinch = g; }
  });
  for (const ev of ["pointerup", "pointercancel"]) canvas.addEventListener(ev, e => { touches.delete(e.pointerId); if (touches.size < 2) pinch = 0; });
  canvas.addEventListener("pointerdown", e => {
    if (state !== "play" || pinch) return;
    const p = local(e);
    if (e.button === 2) { if (placing) { placing = null; say("Cancelled"); return; } const w = toWorld(p.x, p.y); command(w.x, w.y, false); return; }
    if (e.button !== 0) return;
    canvas.setPointerCapture(e.pointerId);
    drag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y, box: false, shift: e.shiftKey, touch: e.pointerType !== "mouse" };
  });
  canvas.addEventListener("pointermove", e => {
    const p = local(e); mouse = { x: p.x, y: p.y, in: true };
    if (drag && !pinch) { drag.x1 = p.x; drag.y1 = p.y; if (Math.hypot(drag.x1 - drag.x0, drag.y1 - drag.y0) > 8) drag.box = true; }
  });
  canvas.addEventListener("pointerleave", () => { mouse.in = false; });
  canvas.addEventListener("pointerup", e => {
    if (!drag) return;
    const d = drag; drag = null;
    if (placing) { const w = toWorld(d.x1, d.y1); place(w.x, w.y); return; }
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
    const handled = { arrowleft: 1, arrowright: 1, arrowup: 1, arrowdown: 1, " ": 1, a: 1, s: 1, q: 1, w: 1, e: 1, escape: 1, 1: 1, 2: 1, 3: 1, 4: 1, "+": 1, "=": 1, "-": 1, "_": 1 };
    if (!handled[k]) return;
    e.preventDefault(); keys[k] = true;
    if (k === "a") act("amove");
    if (k === "s") act("stop");
    if (k === " ") act("army");
    if (k === "q") train("spark");
    if (k === "w") train("blade");
    if (k === "e") train("lancer");
    if ("1234".includes(k)) startPlacing(BUILDS[+k - 1]);
    if (k === "+" || k === "=") zoomBy(1.25);
    if (k === "-" || k === "_") zoomBy(0.8);
    if (k === "escape") { if (placing) { placing = null; say("Cancelled"); return; } amoveMode = false; selected = []; renderPanel(); }
  });
  window.addEventListener("keyup", e => { keys[e.key.toLowerCase()] = false; });
  function clampCamera() {
    const under = W < 760 ? 300 / zoom : 0;   // on phones the panels cover the bottom, so let the camera go a bit past the map's edge
    cam.x = clamp(cam.x, 0, Math.max(0, MAP.w - W / zoom)); cam.y = clamp(cam.y, 0, Math.max(0, MAP.h - H / zoom) + under);   // never past the map's edge
  }
  function scrollCamera(dt) {
    const speed = 0.7 * dt / zoom, edge = 26;
    let dx = (keys.arrowright ? 1 : 0) - (keys.arrowleft ? 1 : 0), dy = (keys.arrowdown ? 1 : 0) - (keys.arrowup ? 1 : 0);
    if (mouse.in && !drag) { if (mouse.x < edge) dx = -1; if (mouse.x > W - edge) dx = 1; if (mouse.y < edge) dy = -1; if (mouse.y > H - edge) dy = 1; }
    cam.x += dx * speed; cam.y += dy * speed; clampCamera();
  }

  // ================================================ START, END, LOOP ================================================
  function showUI(on) {
    for (const el of [resEl, mini, panel, zoomBar]) el.hidden = !on;
    exitBtn.hidden = !(on || takeover);                     // while the game fills the window you can always get out
    touchBar.hidden = !on || !matchMedia("(pointer: coarse)").matches; section.classList.toggle("rts-on", on);
  }
  // ---- The game window: while you play, the game fills the whole browser window edge to edge (the site's header,
  // chat button and HUDs step aside and the page stops scrolling). FULLSCREEN goes further: real fullscreen. ----
  let takeover = false, scrollBack = 0;
  const canFull = !!(section.requestFullscreen || section.webkitRequestFullscreen);
  function enterWindow() {
    if (takeover) return;
    takeover = true; scrollBack = window.scrollY;
    document.documentElement.classList.add("rts-takeover");
    fullBtn.hidden = !canFull;
    requestAnimationFrame(resize); setTimeout(resize, 150);
  }
  function leaveWindow() {
    if (!takeover) return;
    takeover = false; fullBtn.hidden = true;
    if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    document.documentElement.classList.remove("rts-takeover");
    window.scrollTo({ top: scrollBack, behavior: "instant" });
    requestAnimationFrame(resize); setTimeout(resize, 150);
  }
  fullBtn.addEventListener("click", () => {
    if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else { const r = (section.requestFullscreen || section.webkitRequestFullscreen).call(section); if (r && r.catch) r.catch(() => {}); }
  });
  for (const ev of ["fullscreenchange", "webkitfullscreenchange"]) document.addEventListener(ev, () => {
    fullBtn.textContent = document.fullscreenElement || document.webkitFullscreenElement ? "⤢ EXIT FULLSCREEN" : "⛶ FULLSCREEN";
    setTimeout(resize, 80);
  });
  function start() {
    enterWindow();
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
    if (state === "play") {
      state = "paused";
      intro.innerHTML = `<p class="rts-kicker">PAUSED</p><h3>Station Defense</h3><button type="button" class="rts-play rts-resume">▶ RESUME</button> <button type="button" class="rts-play">↺ NEW GAME</button>`;
    }
    leaveWindow(); showUI(false); intro.hidden = false;
  });
  intro.addEventListener("click", e => {
    if (e.target.closest(".rts-resume")) { e.stopPropagation(); enterWindow(); state = "play"; intro.hidden = true; showUI(true); renderPanel(); }
  }, true);

  new IntersectionObserver(es => { onScreen = es[0].isIntersecting; }, { threshold: 0.35 }).observe(section);
  let last = performance.now(), frameMs = 0;
  function loop(now) {
    const dt = Math.min(50, now - last); last = now;
    if (onScreen && W) {
      const t0 = performance.now();
      if (state === "play") { scrollCamera(dt); update(dt); hud(); }
      draw(now);
      frameMs = frameMs * 0.9 + (performance.now() - t0) * 0.1;   // how long a frame's work takes (test hook)
    }
    requestAnimationFrame(loop);
  }
  resize(); newGame();
  if (reduce) intro.querySelector(".rts-help").textContent += " · (Reduced motion: effects are toned down.)";
  requestAnimationFrame(loop);
  window.neonRTS = { state: () => ({ state, credits, clock: Math.round(clock), wave: waveNo, units: ents.filter(e => e.team === "p" && !e.T.building).length, enemies: ents.filter(e => e.team === "e").length, hive: hive() && hive().hp, core: core() && core().hp, selected: selected.length }),
                     start, give: n => { credits += n; }, army: () => act("army"), seeAll: on => { seeAll = on; if (on) explored.fill(1); }, count: () => ents.reduce((m, e) => (m[e.type] = (m[e.type] || 0) + 1, m), {}), step: ms => { for (let t = 0; t < ms && state === "play"; t += 16) update(16); hud(); }, train, wave: sendWave, select: type => { selected = ents.filter(e => e.type === type); renderPanel(); }, command, killHive: () => { const h = hive(); if (h) damage(h, 1e6, null); }, build: (type, x, y) => { selected = ents.filter(e => e.type === "spark" && !(e.order && e.order.type === "build")).slice(0, 1); placing = { type }; return place(x, y); }, buildings: () => ents.filter(e => e.team === "p" && e.T.building).map(e => ({ type: e.type, built: +e.built.toFixed(2), hp: Math.round(e.hp), queue: e.queue.length })), canPlace, cap: () => supplyCap(), gfx: o => Object.assign(GFX, o || {}), gpu: () => ({ on: glOn, info: GL3 && GL3.info() }), frameMs: () => +frameMs.toFixed(2), drawOnce: () => { const t = performance.now(); draw(performance.now()); return +(performance.now() - t).toFixed(2); }, zoom: f => { if (f) zoomBy(f); return +zoom.toFixed(3); }, camTo: (x, y) => { cam.x = x - W / zoom / 2; cam.y = y - H / zoom / 2; clampCamera(); } };
})();
