// neon-game.js: the arcade game played with the mouse, on top of the neon hero (neon preview only).
//
// HOW TO PLAY
//   Click (or tap) the sky to fire twin lasers. Shoot the flying targets; don't shoot the flying cars.
//   Drones drop bombs: shoot them before they hit the floor, or your CITY SHIELD (the hearts) takes damage.
//   Lose all your shields and it's GAME OVER: put your initials on the TOP 10 board and play again.
//
// WHAT'S IN HERE
//   - targets: drones, saucers, cubes (split in two when hit) and rare golden stars. Each one carries a Tenshi
//     service, and hitting it shows what that service is: the game is a sneaky tour of the business.
//   - power-ups (glowing rings with a letter): R rapid fire (hold the mouse), S spread shot, T slow time, N nuke
//   - a BOSS mothership every BOSS_EVERY points: it rises from behind the city, sweeps beams across the floor,
//     and has a health bar. Beat it for a huge bonus.
//   - combos, levels, screen shake and "hit-stop" (a tiny freeze on big hits), score pop-ups
//   - achievements, a local TOP 10 board, Tanaka cheering in a speech bubble, and INSANE MODE
//     (type the Konami code: up up down down left right left right B A)
// Links, buttons, the menu and the chat keep working normally: clicks on them never fire.
// People who turn on "reduce motion" don't get the game.
(function () {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  // ================================================ SETTINGS ================================================
  // Your settings from game_settings.py (sandbox/game-settings.js) replace the values below.
  const CFG = (window.TENSHI_GAMES || {}).arcade || {}; const TUNE = window.TENSHI_TUNE || (t => t);
  const GAME = {
    hitRadius: 1.4,        // how forgiving aiming is (1 = must hit the body exactly)
    comboWindow: 1600,     // ms you have to land the next hit to keep a combo going
    baseSpawnEvery: 1200,  // ms between new targets at level 1 (gets shorter each level)
    pointsPerLevel: 300,   // score needed to go up a level
    targetOpacity: 0.6,    // how see-through the flying targets are (1 = solid)
    shields: 5,            // city shield hearts
    bossEvery: 800,        // a boss appears every this many points
    powerEvery: [14000, 24000],   // ms between power-ups (random within this range)
    powerSeconds: 7,       // how long rapid / spread / slow last
  };
  const TYPES = {
    drone:  { points: 10,  size: 16, speed: [1.2, 2.2], color: ["#ff2bd6"], weight: 5 },
    saucer: { points: 25,  size: 22, speed: [2.2, 3.4], color: ["#b04dff"], weight: 3 },
    cube:   { points: 15,  size: 18, speed: [1.0, 1.8], color: ["#ff8a2b", "#b04dff"], weight: 3 },
    star:   { points: 100, size: 14, speed: [3.6, 4.8], color: ["#ffb347"], weight: 0.5 },
  };
  TUNE(GAME, CFG.game); TUNE(TYPES, CFG.targets);
  // What each hit teaches (shown now and then in a little tip at the bottom).
  const SERVICES = [
    ["WEB DESIGN", "Clean, fast websites that look great on every screen."],
    ["WEB DEVELOPMENT", "Solid, secure sites and web apps built to last."],
    ["HOSTING", "Domains, SSL, backups and uptime, handled for you."],
    ["CMS", "Edit your own site: click any text and type."],
    ["BRANDING", "Logos, colours and type that make you memorable."],
    ["AI", "Smart helpers like Tanaka that answer customers 24/7."],
    ["CONSULTING", "Plain-English advice on what your business needs online."],
    ["SOFTWARE", "Custom tools that save you hours every week."],
  ];
  const POWERS = {
    R: { name: "RAPID FIRE", color: "#ff2bd6", tip: "Hold the mouse down to keep firing" },
    S: { name: "SPREAD SHOT", color: "#ffb347", tip: "Every shot fires five beams" },
    T: { name: "SLOW TIME", color: "#b04dff", tip: "Everything moves in slow motion" },
    N: { name: "NUKE", color: "#ffffff", tip: "Clears the whole sky" },
  };
  const ACHIEVEMENTS = {
    first: "FIRST BLOOD", combo: "COMBO KING (x9)", star: "STAR HUNTER", boss: "BOSS SLAYER", power: "POWERED UP",
    untouch: "UNTOUCHABLE (level 3, full shields)", city: "SAVED THE CITY (2,000 points)", insane: "INSANE MODE", bomb: "BOMB SQUAD (10 bombs)",
    dragon: "DRAGON SLAYER", phoenix: "PHOENIX DOWN", kaiju: "KAIJU HUNTER", robot: "SCRAP METAL", slogan: "SLOGAN SMASHER (the whole headline)",
  };
  const LETTER = { points: 10, wordBonus: 50, sloganBonus: 250, backAfter: [7000, 11000] };   // shooting the headline's letters
  TUNE(LETTER, CFG.letters);
  const BEAST_POINTS = CFG.beast_points ?? 100;      // for blowing up the dragon or the phoenix
  // ==========================================================================================================

  const store = {
    get(k, d) { try { const v = localStorage.getItem("tenshi-neon-" + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("tenshi-neon-" + k, JSON.stringify(v)); } catch (e) { /* storage blocked: fine */ } },
  };
  const sfx = name => window.neonAudio && window.neonAudio.sfx(name);
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = list => list[Math.floor(Math.random() * list.length)];

  // ---- Canvas (above the floor, behind the page text, never catches clicks itself) ----
  const canvas = document.createElement("canvas");
  canvas.id = "neon-game";
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;z-index:1;pointer-events:none";
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  let W = 0, H = 0;
  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * ratio); canvas.height = Math.round(H * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  resize();
  window.addEventListener("resize", resize);

  // ---- Panels: score, boss bar, banner, tip, achievement toast, Tanaka bubble, game over ----
  const ui = document.createElement("div");
  ui.innerHTML = `
    <div class="neon-hud">
      <div class="neon-hud-row"><span>SCORE</span><b data-k="score">0</b></div>
      <div class="neon-hud-row"><span>COMBO</span><b data-k="combo">x1</b></div>
      <div class="neon-hud-row"><span>LEVEL</span><b data-k="level">1</b></div>
      <div class="neon-hud-row best"><span>BEST</span><b data-k="best">0</b></div>
      <div class="neon-hud-row shields"><span>SHIELD</span><b data-k="shields"></b></div>
      <div class="neon-hud-row power" hidden><span data-k="powername"></span><b data-k="powertime"></b></div>
      <button type="button" data-k="pause" aria-pressed="false">PAUSE</button>
      <p class="neon-hud-tip">Click the sky to shoot</p>
    </div>
    <div class="neon-bossbar" hidden><span>MOTHERSHIP</span><i><b></b></i></div>
    <div class="neon-banner" aria-live="polite"></div>
    <div class="neon-tip" aria-live="polite"></div>
    <div class="neon-toast" aria-live="polite"></div>
    <div class="neon-bubble" aria-live="polite"></div>
    <div class="neon-over" hidden role="dialog" aria-label="Game over">
      <div class="neon-over-box">
        <h2>GAME OVER</h2>
        <p class="neon-over-score">SCORE <b data-k="final">0</b></p>
        <form data-k="form"><label>YOUR INITIALS <input data-k="initials" maxlength="3" autocomplete="off" required></label><button type="submit">SAVE</button></form>
        <ol data-k="board"></ol>
        <button type="button" data-k="again">PLAY AGAIN</button>
      </div>
    </div>`;
  document.body.appendChild(ui);
  const $ = k => ui.querySelector(`[data-k="${k}"]`);
  const hud = ui.querySelector(".neon-hud"), bossbar = ui.querySelector(".neon-bossbar"), banner = ui.querySelector(".neon-banner");
  const tipEl = ui.querySelector(".neon-tip"), toast = ui.querySelector(".neon-toast"), bubble = ui.querySelector(".neon-bubble"), over = ui.querySelector(".neon-over");

  // ---- Game state ----
  let score, combo, lastHit, level, shields, nextSpawn, nextPower, nextBossAt, boss, power, bombsShot, hits, over_;
  let best = store.get("best", 0), unlocked = new Set(store.get("achievements", []));
  const objects = [], shards = [], beams = [], popups = [], bombs = [], cars = [], bossBeams = [];
  let started = false;        // nothing attacks until the visitor fires their first shot ("attract mode")
  let paused = false, slowUntil = 0, hitStopUntil = 0, shake = 0, insane = false, lastTime = performance.now();
  const hero = document.querySelector(".hero");
  window.neonShake = { x: 0, y: 0 };

  function reset() {
    score = 0; combo = 1; lastHit = 0; level = 1; shields = GAME.shields; nextSpawn = 0; boss = null; power = null;
    bombsShot = 0; hits = 0; over_ = false; nextBossAt = GAME.bossEvery;
    nextPower = performance.now() + rand(...GAME.powerEvery) * 0.5;
    objects.length = shards.length = beams.length = popups.length = bombs.length = cars.length = bossBeams.length = 0;
    if (typeof projectiles !== "undefined") projectiles.length = rails.length = bolts.length = 0;
    over.hidden = true; bossbar.hidden = true; started = false;
    recharges = 0; awaySince = 0; runEnded = false;
    if (window.neonMonstersReset) window.neonMonstersReset();
    hud.querySelector(".neon-hud-tip").textContent = "Click the sky to start";
    updateHud();
  }

  function heroOnScreen() { const r = hero ? hero.getBoundingClientRect() : { bottom: H }; return r.bottom > H * 0.35; }
  const floorY = () => H * 0.82;
  const timeScale = now => (now < hitStopUntil ? 0 : now < slowUntil ? 0.35 : 1) * (insane ? 1.5 : 1);

  // ---- Messages ----
  let bannerTimer, tipTimer, toastTimer, bubbleTimer;
  function showBanner(text, ms = 1800) { if (!heroOnScreen()) return; banner.textContent = text; banner.classList.add("on"); clearTimeout(bannerTimer); bannerTimer = setTimeout(() => banner.classList.remove("on"), ms); }
  function showTip(title, text) { tipEl.innerHTML = `<b>${title}</b> ${text}`; tipEl.classList.add("on"); clearTimeout(tipTimer); tipTimer = setTimeout(() => tipEl.classList.remove("on"), 3200); }
  function cheer(text) {
    // Tanaka's speech bubble, next to his chat button.
    bubble.textContent = text; bubble.classList.add("on"); clearTimeout(bubbleTimer); bubbleTimer = setTimeout(() => bubble.classList.remove("on"), 2600);
  }
  function achieve(key) {
    if (unlocked.has(key)) return;
    unlocked.add(key); store.set("achievements", [...unlocked]);
    toast.innerHTML = `<small>ACHIEVEMENT UNLOCKED</small>🏆 ${ACHIEVEMENTS[key]}`;
    toast.classList.add("on"); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove("on"), 3200);
    sfx("achievement");
    cheer(pick(["Achievement! You're a natural. 🏆", "Look at you go! 🏆", "Unlocked! Keep it up! 🏆"]));
  }

  function updateHud(bump) {
    $("score").textContent = score; $("combo").textContent = "x" + combo; $("level").textContent = level; $("best").textContent = best;
    $("shields").textContent = "♥".repeat(Math.max(0, shields)) + "♡".repeat(Math.max(0, GAME.shields - shields));
    const p = power && power.until > performance.now();
    $("powername").parentElement.hidden = !p;
    if (p) { $("powername").textContent = POWERS[power.type].name; $("powertime").textContent = Math.ceil((power.until - performance.now()) / 1000) + "s"; }
    if (bump) { hud.classList.remove("bump"); void hud.offsetWidth; hud.classList.add("bump"); }
  }

  // ---- Pause ----
  $("pause").addEventListener("click", () => {
    paused = !paused;
    $("pause").textContent = paused ? "PLAY" : "PAUSE";
    $("pause").setAttribute("aria-pressed", String(paused));
    hud.classList.toggle("is-paused", paused);
  });

  // ================================================ SPAWNING ================================================
  function spawnTarget(now) {
    const pool = Object.entries(TYPES).flatMap(([name, t]) => Array(Math.ceil(t.weight * 2)).fill(name));
    const kind = pick(pool), t = TYPES[kind], fromLeft = Math.random() < 0.5;
    const speed = rand(...t.speed) * (1 + (level - 1) * 0.12);
    const y = rand(H * 0.12, H * 0.6);
    objects.push({ kind, size: t.size, color: pick(t.color), points: t.points, service: pick(SERVICES),
      x: fromLeft ? -40 : W + 40, y, baseY: y, vx: fromLeft ? speed : -speed, wobble: rand(10, 40), freq: rand(0.01, 0.025),
      phase: Math.random() * 6.28, spin: Math.random() * 6.28, nextBomb: now + rand(5000, 10000) });
  }
  function spawnPower() {
    const type = pick(Object.keys(POWERS)), fromLeft = Math.random() < 0.5, y = rand(H * 0.18, H * 0.5);
    objects.push({ kind: "power", type, size: 18, color: POWERS[type].color, points: 0, x: fromLeft ? -40 : W + 40, y, baseY: y,
      vx: fromLeft ? 1.6 : -1.6, wobble: 20, freq: 0.02, phase: 0, spin: 0 });
  }
  function spawnCar() {
    const fromLeft = Math.random() < 0.5, y = H * 0.4 * (0.55 + Math.random() * 0.35);
    cars.push({ x: fromLeft ? -60 : W + 60, y, vx: (fromLeft ? 1 : -1) * rand(5, 8), trail: [] });
  }
  function spawnBoss() {
    const hp = 30 + level * 8;
    boss = { x: W / 2, y: H * 0.42 + 120, targetY: H * 0.2, hp, maxHp: hp, t: 0, nextBeam: performance.now() + 2500, hitFlash: 0 };
    bossbar.hidden = false;
    showBanner("⚠ MOTHERSHIP INCOMING ⚠", 2400);
    cheer("Big one coming! Aim for the middle! 🛸");
    sfx("bomb");
  }

  // ================================================ WEAPONS ================================================
  // Pick one with the number keys 1–6 or the weapon bar at the bottom. Each has its own feel, sound and boss damage.
  //   cooldown: ms between shots   auto: keeps firing while you hold the mouse   boss: damage per hit on the mothership
  const WEAPONS = [
    { id: "laser",   key: "1", name: "LASER",       icon: "⚡", color: "#ff6ec7", cooldown: 0,   auto: false, boss: 1,   tip: "Twin beams, instant hits. Click fast!" },
    { id: "mg",      key: "2", name: "MACHINE GUN", icon: "⁘", color: "#ffb347", cooldown: 70,  auto: true,  boss: 0.4, tip: "Hold the mouse to spray tracer bullets." },
    { id: "rocket",  key: "3", name: "ROCKET",      icon: "➶", color: "#ff8a2b", cooldown: 650, auto: false, boss: 6,   tip: "Slow, but the blast wipes out everything nearby." },
    { id: "shotgun", key: "4", name: "SHOTGUN",     icon: "✶", color: "#ffe08a", cooldown: 420, auto: false, boss: 0.7, tip: "Seven pellets in a wide spread. Great up close." },
    { id: "rail",    key: "5", name: "RAILGUN",     icon: "═", color: "#c48bff", cooldown: 900, auto: false, boss: 5,   tip: "Pierces everything in a line across the screen." },
    { id: "chain",   key: "6", name: "LIGHTNING",   icon: "ϟ", color: "#efe0ff", cooldown: 480, auto: false, boss: 3,   tip: "Zaps a target, then jumps to four more nearby." },
  ];
  for (const w of WEAPONS) TUNE(w, (CFG.weapons || {})[w.id]);
  let weapon = WEAPONS[store.get("weapon", 0)] || WEAPONS[0], lastShot = 0;
  const projectiles = [], rails = [], bolts = [];

  // The weapon bar.
  const bar = document.createElement("div");
  bar.className = "neon-weapons";
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", "Choose a weapon");
  bar.innerHTML = WEAPONS.map((w, i) => `<button type="button" data-w="${i}" style="--wc:${w.color}" title="${w.name} (key ${w.key})"><kbd>${w.key}</kbd><span class="ico" aria-hidden="true">${w.icon}</span><span class="nm">${w.name}</span></button>`).join("");
  ui.appendChild(bar);
  function selectWeapon(i) {
    weapon = WEAPONS[i];
    store.set("weapon", i);
    bar.querySelectorAll("button").forEach((b, k) => { b.classList.toggle("on", k === i); b.setAttribute("aria-pressed", String(k === i)); });
    showTip(weapon.name, weapon.tip);
    sfx("select");
    clearInterval(rapidTimer);
  }
  bar.addEventListener("click", e => { const b = e.target.closest("button[data-w]"); if (b) selectWeapon(Number(b.dataset.w)); });
  window.addEventListener("keydown", e => {
    if (e.target.closest && e.target.closest("input, textarea, select")) return;
    const i = WEAPONS.findIndex(w => w.key === e.key);
    if (i >= 0) selectWeapon(i);
  });
  bar.querySelectorAll("button").forEach((b, k) => { b.classList.toggle("on", WEAPONS[k] === weapon); b.setAttribute("aria-pressed", String(WEAPONS[k] === weapon)); });

  // ================================================ FIRING ================================================
  let holding = false, holdX = 0, holdY = 0, rapidTimer = null;
  function blocked(target) { return target.closest("a, button, input, textarea, select, label, form, .site-header, .tk-root, .neon-hud, .neon-over, .neon-sound, .neon-weapons, .chaos-sticker"); }
  const rapidOn = () => power && power.type === "R" && power.until > performance.now();

  window.addEventListener("pointerdown", e => {
    if (paused || over_ || e.button !== 0 || !heroOnScreen() || blocked(e.target)) return;
    holding = true; holdX = e.clientX; holdY = e.clientY;
    tryFire();
    clearInterval(rapidTimer);
    // Machine gun (or any weapon with RAPID FIRE) keeps shooting while the mouse is held.
    if (weapon.auto || rapidOn()) {
      const every = Math.max(55, (weapon.cooldown || 95) * (rapidOn() ? 0.5 : 1));
      rapidTimer = setInterval(() => { if (holding && !paused && !over_) tryFire(); else clearInterval(rapidTimer); }, every);
    }
  });
  window.addEventListener("pointermove", e => { holdX = e.clientX; holdY = e.clientY; });
  window.addEventListener("pointerup", () => { holding = false; clearInterval(rapidTimer); });

  function tryFire() {
    const now = performance.now();
    const cooldown = weapon.cooldown * (rapidOn() ? 0.4 : 1);
    if (now - lastShot < cooldown) return;
    lastShot = now;
    fire(holdX, holdY, now);
  }

  function fire(x, y, now) {
    if (!started) {                                   // the first shot starts the game for real
      started = true;
      showBanner("GAME ON!", 1100);
      hud.querySelector(".neon-hud-tip").textContent = "Shoot the bombs before they land!";
      for (const o of objects) o.nextBomb = now + rand(5000, 9000);
    }
    const spread = power && power.type === "S" && power.until > now;
    const fan = spread ? [[0, 0], [-70, -20], [70, -20], [-140, -40], [140, -40]] : [[0, 0]];
    let hit = false, instant = true;
    const turretX = W / 2, turretY = H;

    if (weapon.id === "laser") {
      sfx("laser");
      for (const [dx, dy] of fan) { beams.push({ x: x + dx, y: y + dy, life: 1, kind: "laser" }); if (hitSomething(x + dx, y + dy, now, weapon.boss)) hit = true; }
    } else if (weapon.id === "mg") {
      sfx("mg"); instant = false;
      for (const [dx, dy] of fan) launch("bullet", turretX + rand(-8, 8), turretY, x + dx + rand(-16, 16), y + dy + rand(-16, 16), 30, weapon.boss);
    } else if (weapon.id === "rocket") {
      sfx("rocket"); instant = false;
      for (const [dx, dy] of fan) launch("rocket", turretX, turretY, x + dx, y + dy, 5, weapon.boss);
    } else if (weapon.id === "shotgun") {
      sfx("shotgun"); shakeIt(3);
      for (const [dx, dy] of fan) for (let k = 0; k < 7; k++) {
        const a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * 80;
        const px = x + dx + Math.cos(a) * r, py = y + dy + Math.sin(a) * r * 0.7;
        beams.push({ x: px, y: py, life: 0.8, kind: "pellet" });
        if (hitSomething(px, py, now, weapon.boss)) hit = true;
      }
    } else if (weapon.id === "rail") {
      sfx("rail"); shakeIt(6); hitStop(40);
      // From the turret, through the click, all the way to the edge of the screen.
      const dx = x - turretX, dy = y - turretY, len = Math.hypot(dx, dy) || 1, far = Math.hypot(W, H);
      const x2 = turretX + (dx / len) * far, y2 = turretY + (dy / len) * far;
      rails.push({ x1: turretX, y1: turretY, x2, y2, life: 1 });
      hit = pierce(turretX, turretY, x2, y2, now, weapon.boss);
    } else if (weapon.id === "chain") {
      sfx("zap");
      hit = chain(x, y, now, weapon.boss);
    }
    if (instant && !hit) { combo = 1; burst(x, y, "#ffffff", 6, 2); sfx("miss"); }
    updateHud(hit);
  }

  // A travelling shot: bullets fly straight and fast; rockets start slow and speed up.
  function launch(type, x, y, tx, ty, speed, bossDmg) {
    const d = Math.hypot(tx - x, ty - y) || 1;
    projectiles.push({ type, x, y, tx, ty, ux: (tx - x) / d, uy: (ty - y) / d, speed, bossDmg, age: 0 });
  }

  // Is the point (px, py) within `reach` of the line from (x1, y1) to (x2, y2)?
  function nearLine(px, py, x1, y1, x2, y2, reach) {
    const dx = x2 - x1, dy = y2 - y1, t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy)) < reach;
  }

  // Railgun: everything along the line is hit.
  function pierce(x1, y1, x2, y2, now, bossDmg) {
    let hit = false;
    for (const o of [...objects]) if (nearLine(o.x, o.y, x1, y1, x2, y2, o.size + 10)) { killTarget(o, now); hit = true; }
    for (const b of [...bombs]) if (nearLine(b.x, b.y, x1, y1, x2, y2, 16)) { defuse(b); hit = true; }
    for (const c of [...cars]) if (nearLine(c.x, c.y, x1, y1, x2, y2, 14)) hitCar(c);
    if (boss && nearLine(boss.x, boss.y, x1, y1, x2, y2, 50)) { damageBoss(boss.x, boss.y, now, bossDmg); hit = true; }
    if (window.neonBeasts) for (const r of window.neonBeasts.hitLine(x1, y1, x2, y2, 14, bossDmg)) { beastHit(r); hit = true; }
    for (const l of liveLetters()) { const c = centre(l); if (nearLine(c.x, c.y, x1, y1, x2, y2, 22)) { shootLetter(l); hit = true; } }
    for (const mo of monstersOnLine(x1, y1, x2, y2)) { hitMonster(mo, bossDmg, mo.x, mo.circles[0].y); hit = true; }
    return hit;
  }

  // Lightning: hit the nearest thing to the click, then jump to up to four more nearby.
  function chain(x, y, now, bossDmg) {
    const candidates = () => [...objects.map(o => ({ o, x: o.x, y: o.y, kind: "target" })), ...bombs.map(b => ({ o: b, x: b.x, y: b.y, kind: "bomb" }))];
    let from = [x, y], reach = 150, jumps = 0, hit = false;
    if (boss && Math.abs(x - boss.x) < 130 && Math.abs(y - boss.y) < 55) {
      bolts.push({ pts: jag(W / 2, H, boss.x, boss.y), life: 1 }); damageBoss(boss.x, boss.y, now, bossDmg); from = [boss.x, boss.y]; hit = true; reach = 230;
    }
    while (jumps < 5) {
      let best = null, bestD = Infinity;
      for (const c of candidates()) { const d = Math.hypot(c.x - from[0], c.y - from[1]); if (d < reach && d < bestD) { best = c; bestD = d; } }
      if (!best) break;
      bolts.push({ pts: jag(jumps === 0 && !hit ? W / 2 : from[0], jumps === 0 && !hit ? H : from[1], best.x, best.y), life: 1 });
      if (best.kind === "bomb") defuse(best.o); else killTarget(best.o, now);
      from = [best.x, best.y]; reach = 230; jumps++; hit = true;
    }
    if (!hit) {                                        // a letter? the bolt jumps along to up to four more
      let letter = letterAt(x, y, 10), from = [W / 2, H];
      for (let k = 0; letter && k < 5; k++) {
        const c = centre(letter);
        bolts.push({ pts: jag(from[0], from[1], c.x, c.y), life: 1 });
        shootLetter(letter); hit = true; from = [c.x, c.y];
        letter = null; let bestD = 160;
        for (const l of liveLetters()) { const d = Math.hypot(centre(l).x - c.x, centre(l).y - c.y); if (d < bestD) { bestD = d; letter = l; } }
      }
    }
    if (!hit) { const mo = monsterAt(x, y, 40); if (mo) { bolts.push({ pts: jag(W / 2, H, x, y), life: 1 }); hitMonster(mo, bossDmg, x, y); hit = true; } }
    if (!hit && window.neonBeasts) {                   // nothing else near: strike the dragon or phoenix
      const r = window.neonBeasts.hitAt(x, y, 70, bossDmg);
      if (r) { bolts.push({ pts: jag(W / 2, H, r.hitX, r.hitY), life: 1 }); beastHit(r); hit = true; }
    }
    if (!hit) bolts.push({ pts: jag(W / 2, H, x, y), life: 0.7 });
    return hit;
  }
  // A jagged lightning path between two points.
  function jag(x1, y1, x2, y2) {
    const pts = [[x1, y1]], steps = 9;
    for (let i = 1; i < steps; i++) { const t = i / steps; pts.push([x1 + (x2 - x1) * t + rand(-18, 18), y1 + (y2 - y1) * t + rand(-18, 18)]); }
    pts.push([x2, y2]);
    return pts;
  }

  // Rocket blast: everything within the radius is destroyed.
  function blast(x, y, radius, now, bossDmg) {
    explode({ x, y, size: radius / 2.2, color: "#ffb347" }, 2);
    burst(x, y, "#ff8a2b", 30, 2.2);
    shards.push({ x, y, flash: true, life: 1, size: radius * 1.6, color: "#ff8a2b" });
    sfx("boom"); shakeIt(10); hitStop(50);
    for (const o of [...objects]) if (Math.hypot(o.x - x, o.y - y) < radius + o.size) killTarget(o, now);
    for (const b of [...bombs]) if (Math.hypot(b.x - x, b.y - y) < radius) defuse(b);
    for (const c of [...cars]) if (Math.hypot(c.x - x, c.y - y) < radius * 0.8) hitCar(c);
    if (boss && Math.abs(boss.x - x) < 120 + radius * 0.6 && Math.abs(boss.y - y) < 45 + radius * 0.6) damageBoss(x, y, now, bossDmg);
    if (window.neonBeasts) for (const r of window.neonBeasts.hitArea(x, y, radius, bossDmg)) beastHit(r);
    for (const l of liveLetters()) { const c = centre(l); if (Math.hypot(c.x - x, c.y - y) < radius) shootLetter(l); }
    for (const mo of monstersInRadius(x, y, radius)) hitMonster(mo, bossDmg, x, y);
  }

  function defuse(b) {
    const i = bombs.indexOf(b); if (i < 0) return;
    bombs.splice(i, 1); bombsShot++; addScore(5, b.x, b.y, "#ffb347", "BOMB DEFUSED");
    burst(b.x, b.y, "#ffb347", 18, 1.4); sfx("hit"); if (bombsShot >= 10) achieve("bomb");
  }
  function hitCar(c) {
    const i = cars.indexOf(c); if (i < 0) return;
    cars.splice(i, 1); combo = 1; score = Math.max(0, score - 50);
    popups.push({ x: c.x, y: c.y - 12, text: "CIVILIAN! -50", life: 1, color: "#ff8a2b" });
    burst(c.x, c.y, "#ffffff", 16, 1.2); sfx("car"); cheer("Hey! That was somebody's car! 🚗");
  }

  // One shot at one point: the boss, a bomb, a car, or the nearest target within reach.
  function hitSomething(x, y, now, bossDmg = 1, extraReach = 0) {
    if (boss && Math.abs(x - boss.x) < 120 && Math.abs(y - boss.y) < 45) { damageBoss(x, y, now, bossDmg); return true; }
    for (const b of bombs) if (Math.hypot(b.x - x, b.y - y) < 18 + extraReach) { defuse(b); return true; }
    for (const c of cars) if (Math.hypot(c.x - x, c.y - y) < 22) { hitCar(c); return true; }
    let target = null, bestD = Infinity;
    for (const o of objects) { const d = Math.hypot(o.x - x, o.y - y); if (d < o.size * GAME.hitRadius + 6 + extraReach && d < bestD) { target = o; bestD = d; } }
    if (!target) {
      const letter = letterAt(x, y, 4 + extraReach);   // a letter of the headline?
      if (letter) { shootLetter(letter); return true; }
      const mo = monsterAt(x, y, extraReach);            // the robot or the kaiju?
      if (mo) { hitMonster(mo, bossDmg, x, y); return true; }
      // nothing else there: maybe the dragon or phoenix
      const r = window.neonBeasts && window.neonBeasts.hitAt(x, y, 24 + extraReach, bossDmg);
      if (!r) return false;
      beastHit(r);
      return true;
    }
    killTarget(target, now);
    return true;
  }

  // ---- The headline's letters (neon-fx.js wraps each one in <span class="kx-letter">) ----
  // Letters that are on screen and can be hit (not already spinning away, and not faded out by the headline animation).
  function liveLetters() {
    return [...document.querySelectorAll(".hero-card .kx-letter")].filter(l =>
      !l.classList.contains("kx-shot") && !l.classList.contains("kx-gone") && l.textContent.trim() &&
      !l.closest(".kx-away, .kx-hidden, .kx-fizzle"));
  }
  function centre(l) { const r = l.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, r }; }
  function letterAt(x, y, reach) {
    for (const l of liveLetters()) {
      const { r } = centre(l);
      if (x > r.left - reach && x < r.right + reach && y > r.top - reach && y < r.bottom + reach) return l;
    }
    return null;
  }
  // Hit: the letter spins off and shrinks, explodes when it's done, and spins back in a few seconds later.
  function shootLetter(l) {
    if (l.classList.contains("kx-shot") || l.classList.contains("kx-gone")) return;
    const { x, y } = centre(l), color = pick(["#ff2bd6", "#b04dff", "#ffb347", "#ffffff"]);
    l.classList.remove("kx-back");
    l.style.setProperty("--dir", Math.random() < 0.5 ? -1 : 1);
    l.style.setProperty("--dx", Math.round(rand(-90, 90)));
    l.style.setProperty("--dy", Math.round(rand(-110, -20)));
    l.classList.add("kx-shot");
    burst(x, y, color, 8, 1); sfx("hit");
    addScore(LETTER.points, x, y, color, l.textContent.toUpperCase());
    setTimeout(() => {
      const r = l.getBoundingClientRect();
      explode({ x: r.left + r.width / 2, y: r.top + r.height / 2, size: 12, color }, 0.9);
      sfx("boom"); shakeIt(3);
      l.classList.remove("kx-shot"); l.classList.add("kx-gone");
    }, 450);
    setTimeout(() => { l.classList.remove("kx-gone"); void l.offsetWidth; l.classList.add("kx-back"); }, rand(...LETTER.backAfter));
    // Bonuses: every letter of a word, then every letter of the headline.
    const down = el => [...el.querySelectorAll(".kx-letter")].every(k => !k.textContent.trim() || k.classList.contains("kx-shot") || k.classList.contains("kx-gone"));
    const word = l.closest(".kx-word");
    if (word && down(word)) addScore(LETTER.wordBonus, x, y - 24, "#ffb347", "WORD DOWN: " + word.textContent.toUpperCase());
    const headline = l.closest("h1");
    if (headline && down(headline)) {
      addScore(LETTER.sloganBonus, W / 2, y - 50, "#ffffff", "SLOGAN SMASHED");
      showBanner("SLOGAN SMASHED!", 1800); achieve("slogan"); sfx("bigboom"); shakeIt(12); hitStop(100);
      cheer("Hey, I need that headline! 😅");
    }
  }

  // The dragon or phoenix was hit: sparks and a crunch; if that blew it up, 100 points and a big moment.
  function beastHit(r) {
    burst(r.hitX, r.hitY, r.color, 8, 1.2);
    if (!r.killed) { sfx("hit"); shakeIt(2); return; }
    addScore(BEAST_POINTS, r.x, r.y, r.color, r.name + " DESTROYED");
    explode({ x: r.x, y: r.y, size: 40, color: r.color }, 2.2);
    sfx("bigboom"); shakeIt(14); hitStop(120);
    showBanner(r.name + " DESTROYED!", 1800);
    achieve(r.name === "DRAGON" ? "dragon" : "phoenix");
    cheer(r.name === "DRAGON" ? "You took down the dragon! 🐉💥" : "The phoenix is ash... for now! 🔥");
  }

  // A target (or power-up) is destroyed: score, combo, effects, achievements, tips; cubes split in two.
  function killTarget(target, now) {
    const i = objects.indexOf(target); if (i < 0) return;
    objects.splice(i, 1);
    if (target.kind === "power") { activatePower(target.type, now); explode(target, 1.4); return; }
    combo = now - lastHit < GAME.comboWindow ? Math.min(combo + 1, 9) : 1;
    lastHit = now; hits++;
    if (combo > 1) sfx("combo");
    addScore(target.points * combo, target.x, target.y, target.color, target.service[0] + (combo > 1 ? "  x" + combo : ""));
    explode(target, 1); sfx("hit");
    if (hits === 1) achieve("first");
    if (combo === 9) achieve("combo");
    if (combo === 5) cheer(pick(["Nice shot! 🎯", "Combo x5! You're on fire! 🔥", "Sharp shooting! 🎯"]));
    if (target.kind === "star") { achieve("star"); hitStop(70); shakeIt(6); }
    if (hits % 6 === 1) showTip(target.service[0], target.service[1]);   // teach a service now and then
    if (target.kind === "cube" && target.size > 10)                       // cubes split in two
      for (const dir of [-1, 1]) objects.push({ ...target, size: target.size * 0.62, points: target.points + 5, vx: target.vx * 1.4, baseY: target.y + dir * 14, y: target.y, phase: target.phase + dir });
  }

  function addScore(points, x, y, color, label) {
    score += points;
    if (label) popups.push({ x, y: y - 10, text: "+" + points + "  " + label, life: 1, color });
    const newLevel = 1 + Math.floor(score / GAME.pointsPerLevel);
    if (newLevel > level) { level = newLevel; showBanner("LEVEL " + level, 1400); if (level >= 3 && shields === GAME.shields) achieve("untouch"); }
    if (score >= 2000) achieve("city");
    if (score > best) { best = score; store.set("best", best); }
    if (!boss && score >= nextBossAt) { nextBossAt += GAME.bossEvery; spawnBoss(); }
  }

  function activatePower(type, now) {
    sfx("power"); achieve("power");
    showBanner(POWERS[type].name + "!", 1400);
    showTip(POWERS[type].name, POWERS[type].tip);
    if (type === "N") {                                                       // nuke: clear the sky
      document.documentElement.classList.add("neon-nuke"); setTimeout(() => document.documentElement.classList.remove("neon-nuke"), 450);
      for (const o of [...objects]) { if (o.kind !== "power") { addScore(o.points, o.x, o.y, o.color, ""); explode(o, 1); } }
      objects.length = 0; bombs.length = 0;
      if (boss) { boss.hp -= 8; boss.hitFlash = 1; }
      if (window.neonBeasts) for (const r of window.neonBeasts.hitArea(W / 2, H / 2, Math.hypot(W, H), 8)) beastHit(r);
      liveLetters().forEach((l, k) => setTimeout(() => shootLetter(l), k * 25));
      for (const mo of liveMonsters()) hitMonster(mo, 8, mo.x, mo.circles.length ? mo.circles[0].y : H * 0.3);
      sfx("bigboom"); shakeIt(14); hitStop(120);
      return;
    }
    power = { type, until: now + GAME.powerSeconds * 1000 };
    if (type === "T") slowUntil = power.until;
  }

  function damageBoss(x, y, now, dmg = 1) {
    if (!boss) return;
    boss.hp -= dmg; boss.hitFlash = 1;
    burst(x, y, "#ff2bd6", 10, 1.2); sfx("hit"); shakeIt(3); hitStop(35);
    bossbar.querySelector("b").style.width = Math.max(0, boss.hp / boss.maxHp) * 100 + "%";
    if (boss.hp > 0) return;
    // Defeated: a chain of explosions, a big bonus, a banner.
    const bx = boss.x, by = boss.y;
    for (let k = 0; k < 8; k++) setTimeout(() => { explode({ x: bx + rand(-110, 110), y: by + rand(-35, 35), size: 26, color: pick(["#ff2bd6", "#b04dff", "#ffb347", "#ffffff"]) }, 1.6); sfx("boom"); shakeIt(8); }, k * 140);
    setTimeout(() => sfx("bigboom"), 1100);
    addScore(500 * level, bx, by, "#ffffff", "MOTHERSHIP DOWN");
    boss = null; bossBeams.length = 0; bossbar.hidden = true;
    showBanner("BOSS DEFEATED · LEVEL CLEAR", 2600);
    achieve("boss"); cheer("YOU DID IT! The city is safe! 🎉"); hitStop(160); shakeIt(16);
  }

  function hitCity(x, how) {
    shields--; combo = 1;
    window.neonCrackAt && window.neonCrackAt(x, floorY() + 30, 120);
    burst(x, floorY(), "#ffb347", 24, 1.8); sfx("bomb"); shakeIt(12); hitStop(60);
    popups.push({ x, y: floorY() - 20, text: how, life: 1, color: "#ff8a2b" });
    if (shields === 1) cheer("Shields almost gone! Shoot the bombs! 💣");
    updateHud(true);
    if (shields <= 0) {                                 // endless: the shields recharge and the run carries on
      shields = GAME.shields; recharges++;
      showBanner("SHIELDS RECHARGED", 1600); sfx("power");
      cheer("Shields back up! Keep the city safe! 🛡️");
      updateHud(true);
    }
  }

  // ================================================ GAME OVER & TOP 10 ================================================
  // The run only ends when the player scrolls away from the hero (see frame()); the score panel then shows when they
  // come back up, so it never pops up over the rest of the page.
  var recharges = 0, awaySince = 0, runEnded = false;   // var: reset() runs before this line on load
  function gameOver() {
    over_ = true; boss = null; bossbar.hidden = true;
    $("final").textContent = score;
    $("form").hidden = score <= 0;
    renderBoard();
    over.hidden = false;
    setTimeout(() => { if (!$("form").hidden) $("initials").focus(); }, 50);
    sfx("bigboom");
  }
  function renderBoard() {
    const board = store.get("top10", []);
    $("board").innerHTML = board.length ? board.map(r => `<li><b>${r.n}</b><span>${r.s}</span></li>`).join("") : "<li><span>No scores yet. Be the first!</span></li>";
  }
  $("form").addEventListener("submit", e => {
    e.preventDefault();
    const n = ($("initials").value || "???").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3) || "???";
    const board = store.get("top10", []);
    board.push({ n, s: score }); board.sort((a, b) => b.s - a.s);
    store.set("top10", board.slice(0, 10));
    $("form").hidden = true; renderBoard();
  });
  $("again").addEventListener("click", () => { reset(); started = true; showBanner("GO!", 900); });

  // ================================================ INSANE MODE (Konami code) ================================================
  const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
  let konami = 0;
  window.addEventListener("keydown", e => {
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    konami = key === KONAMI[konami] ? konami + 1 : key === KONAMI[0] ? 1 : 0;
    if (konami < KONAMI.length) return;
    konami = 0; insane = !insane; window.neonInsane = insane;
    document.documentElement.classList.toggle("neon-insane", insane);
    showBanner(insane ? "☢ INSANE MODE ☢" : "NORMAL MODE", 2000);
    if (insane) { achieve("insane"); cheer("Oh no. Oh YES. 😈"); }
  });

  // ================================================ EFFECTS ================================================
  function hitStop(ms) { hitStopUntil = Math.max(hitStopUntil, performance.now() + ms); }
  function shakeIt(amount) { shake = Math.max(shake, amount); }
  function burst(x, y, color, n, speed) {
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, v = rand(1, 4) * speed; shards.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, size: rand(1.5, 3.5), color }); }
  }
  function explode(o, scale) {
    burst(o.x, o.y, o.color, Math.round(26 * scale), 1.6 * scale);
    burst(o.x, o.y, "#ffffff", Math.round(10 * scale), 1.1);
    for (let i = 0; i < 10 * scale; i++) { const a = Math.random() * 6.28, v = rand(2, 6) * scale; shards.push({ x: o.x, y: o.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, size: rand(6, 14), color: o.color, spin: rand(-0.3, 0.3), angle: a, line: true }); }
    shards.push({ x: o.x, y: o.y, flash: true, life: 1, size: (o.size || 16) * 3 * scale, color: o.color });
  }
  function glow(color, blur) { ctx.shadowColor = color; ctx.shadowBlur = blur; }

  // ================================================ DRAWING ================================================
  // ---- 3D targets: little see-through glass models, lit from the top left, tumbling as they fly ----
  // Each model is a list of corners (x, y, z) and faces (lists of corner numbers, going round the face).
  function lathe(profile, n) {            // spin a side profile [[radius, y], ...] round the vertical axis
    const v = [], f = [];
    for (const [r, y] of profile) for (let i = 0; i < n; i++) v.push([Math.cos(i / n * 6.283) * r, y, Math.sin(i / n * 6.283) * r]);
    for (let k = 0; k < profile.length - 1; k++) for (let i = 0; i < n; i++) {
      const a = k * n + i, b = k * n + (i + 1) % n;
      f.push([a, b, b + n, a + n]);
    }
    return { v, f };
  }
  const MODELS = {
    // A long diamond body with two swept fins.
    drone: { v: [[0, -1, 0], [0.7, 0, 0], [0, 1, 0], [-0.7, 0, 0], [0, 0, 0.4], [0, 0, -0.4], [1.45, -0.35, 0], [-1.45, -0.35, 0], [1.0, 0.25, 0], [-1.0, 0.25, 0]],
             f: [[0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4], [0, 5, 1], [1, 5, 2], [2, 5, 3], [3, 5, 0], [1, 6, 8], [3, 9, 7]] },
    // A flying saucer: flat disc with a dome on top.
    saucer: lathe([[0, -0.8], [0.4, -0.7], [0.55, -0.25], [1.4, 0], [0.95, 0.3], [0.001, 0.36]], 14),
    cube: { v: [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]].map(p => p.map(c => c * 0.62)),
            f: [[0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [4, 5, 1, 0], [3, 2, 6, 7]] },
    // A chunky five-pointed star with a raised point on both sides.
    star: (() => {
      const v = [];
      for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.45 : 1; v.push([Math.cos(i * Math.PI / 5 - Math.PI / 2) * r, Math.sin(i * Math.PI / 5 - Math.PI / 2) * r, 0]); }
      v.push([0, 0, -0.45], [0, 0, 0.45]);
      const f = [];
      for (let i = 0; i < 10; i++) { f.push([10, i, (i + 1) % 10]); f.push([11, (i + 1) % 10, i]); }
      return { v, f };
    })(),
  };
  // ---- The lighting engine ----
  // Every model is lit by the scene, worked out once per frame:
  //   - the SUN on the horizon: a warm orange-pink key light from behind and below
  //   - your MOUSE: a cool lilac light that follows the cursor (things near it light up)
  //   - EXPLOSIONS: every blast flashes light onto anything nearby, fading as the flash fades
  //   - a dim purple ambient fill, so the dark sides never go fully black
  // Each face gets diffuse light from each source, a shiny highlight (specular), and a pink glow on edges that
  // face sideways (rim light).
  const LIGHTS = {
    ambient: [70, 30, 110],                      // the fill colour (0-255)
    sun:   { color: [255, 140, 90],  strength: 0.9, height: 0.36, depth: 260 },
    mouse: { color: [200, 160, 255], strength: 1.3, reach: 420, depth: -160 },
    blast: { color: [255, 170, 80],  strength: 2.2, reach: 300, depth: -120 },
    shine: 28,                                   // specular sharpness: bigger = smaller, sharper highlight
    rim:   [255, 60, 200],                       // rim-light colour
  };
  const rgbOf = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  let sceneAt = -1, scene = [];
  function sceneLights(now) {
    if (now === sceneAt) return scene;
    sceneAt = now; scene = [];
    scene.push({ x: W / 2, y: H * LIGHTS.sun.height, z: LIGHTS.sun.depth, color: LIGHTS.sun.color, strength: LIGHTS.sun.strength, reach: 0 });
    if (holdX || holdY) scene.push({ x: holdX, y: holdY, z: LIGHTS.mouse.depth, color: LIGHTS.mouse.color, strength: LIGHTS.mouse.strength, reach: LIGHTS.mouse.reach });
    for (const sh of shards) if (sh.flash && sh.life > 0.05) scene.push({ x: sh.x, y: sh.y, z: LIGHTS.blast.depth, color: LIGHTS.blast.color, strength: LIGHTS.blast.strength * sh.life, reach: LIGHTS.blast.reach });
    return scene;
  }
  // The colour of one face: base colour x (ambient + each light's diffuse) + specular highlights + rim glow.
  function shadeFace(base, n, ox, oy, lights) {
    let r = base[0] * LIGHTS.ambient[0] / 255, g = base[1] * LIGHTS.ambient[1] / 255, b = base[2] * LIGHTS.ambient[2] / 255;
    let spec = 0;
    for (const L of lights) {
      let lx = L.x - ox, ly = L.y - oy, lz = L.z;
      const dist = Math.hypot(lx, ly, lz) || 1; lx /= dist; ly /= dist; lz /= dist;
      const fall = L.reach ? Math.max(0, 1 - Math.hypot(L.x - ox, L.y - oy) / L.reach) ** 2 : 1;   // point lights fade with distance
      if (!fall) continue;
      const diff = Math.max(0, n[0] * lx + n[1] * ly + n[2] * lz) * L.strength * fall;
      r += base[0] * diff * L.color[0] / 255; g += base[1] * diff * L.color[1] / 255; b += base[2] * diff * L.color[2] / 255;
      // Shiny highlight (Blinn-Phong): halfway between the light and the viewer (who looks along +z, from -z).
      let hx = lx, hy = ly, hz = lz - 1; const hl = Math.hypot(hx, hy, hz) || 1;
      spec += Math.pow(Math.max(0, (n[0] * hx + n[1] * hy + n[2] * hz) / hl), LIGHTS.shine) * L.strength * fall;
    }
    const rim = Math.pow(1 - Math.min(1, Math.abs(n[2])), 3) * 0.8;   // faces turned side-on glow pink
    r += spec * 255 + LIGHTS.rim[0] * rim; g += spec * 255 + LIGHTS.rim[1] * rim; b += spec * 255 + LIGHTS.rim[2] * rim;
    return { color: `rgb(${Math.min(255, r | 0)},${Math.min(255, g | 0)},${Math.min(255, b | 0)})`, bright: Math.min(1, (r + g + b) / 600), spec: Math.min(1, spec) };
  }

  // Turn, light and draw one model. Returns the corners on screen (for extras like the saucer's lights).
  // ---- Blender models (models/models.json) for the targets and the two giants ----
  const BLENDER = {};
  function blender(slot, conv) {
    if (!(slot in BLENDER)) {
      const m = window.TenshiModels && window.TenshiModels.get(slot);
      if (!m) BLENDER[slot] = null;
      else {
        const mm = window.TenshiModels.axes(m, conv(m));
        // The targets use plain index lists plus one colour per face.
        BLENDER[slot] = { v: mm.v, f: mm.f.map(f => f.i), rgb: mm.f.map(f => f.rgb), glow: mm.f.map(f => f.glow), wind: true, faces: mm.f };
      }
    }
    return BLENDER[slot];
  }
  if (window.TenshiModels) window.TenshiModels.whenReady(() => { for (const k in BLENDER) delete BLENDER[k]; });
  const targetAxes = () => ([x, y, z]) => [z, -y, x];          // glTF (x left, y up, z forward) -> the targets' axes (y down)

  function drawModel(o, model, s, alpha, now) {
    if (o.rx === undefined) { o.rx = rand(0, 6.28); o.ry = rand(0, 6.28); o.rz = rand(0, 6.28); o.vrx = rand(0.008, 0.025); o.vry = rand(0.015, 0.04); o.vrz = rand(-0.01, 0.01); }
    o.rx += o.vrx; o.ry += o.vry; o.rz += o.vrz;
    const tilt = o.kind === "saucer" ? 0.35 : 1;                  // saucers stay mostly level and spin flat
    const [cx, sx] = [Math.cos(o.rx * tilt), Math.sin(o.rx * tilt)], [cy, sy] = [Math.cos(o.ry), Math.sin(o.ry)], [cz, sz] = [Math.cos(o.rz * tilt), Math.sin(o.rz * tilt)];
    const P = model.v.map(([x, y, z]) => {
      let x1 = x * cy + z * sy, z1 = -x * sy + z * cy;           // turn round the vertical axis
      let y1 = y * cx - z1 * sx; z1 = y * sx + z1 * cx;           // tip forwards and back
      const x2 = x1 * cz - y1 * sz, y2 = x1 * sz + y1 * cz;       // roll
      const f = 3.2 / (3.2 + z1);                                 // perspective: nearer corners look bigger
      return { x: x2, y: y2, z: z1, sx: x2 * f * s, sy: y2 * f * s };
    });
    const base = rgbOf(o.color), lights = sceneLights(now);
    // Faces: back to front. Each face's normal is made to point outwards, then lit by the scene.
    const faces = model.f.map((idx, k) => {
      const a = P[idx[0]], b = P[idx[1]], c = P[idx[2]];
      const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z, vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      const mx = idx.reduce((t, i) => t + P[i].x, 0) / idx.length, my = idx.reduce((t, i) => t + P[i].y, 0) / idx.length, mz = idx.reduce((t, i) => t + P[i].z, 0) / idx.length;
      if (!model.wind && nx * mx + ny * my + nz * mz < 0) { nx = -nx; ny = -ny; nz = -nz; }   // point away from the middle (Blender faces already do)
      return { idx, depth: mz, facing: -nz, n: [nx, ny, nz], rgb: model.rgb && model.rgb[k] };
    }).sort((p, q) => q.depth - p.depth);
    ctx.shadowBlur = 0;
    for (const f of faces) {
      const front = f.facing > 0;
      const lit = shadeFace(f.rgb || base, f.n, o.x, o.y, lights);
      ctx.globalAlpha = alpha * (front ? 0.25 + 0.55 * lit.bright : 0.07);
      ctx.fillStyle = lit.color;
      ctx.beginPath(); f.idx.forEach((i, k) => k ? ctx.lineTo(P[i].sx, P[i].sy) : ctx.moveTo(P[i].sx, P[i].sy)); ctx.closePath(); ctx.fill();
      // Edges: lit and glowing at the front (hotter where the highlight is), faint at the back.
      ctx.globalAlpha = alpha * (front ? 0.7 + 0.3 * lit.bright : 0.22);
      ctx.strokeStyle = front ? lit.color : o.color;
      ctx.lineWidth = front ? 1.4 + lit.spec * 1.2 : 1;
      if (front) glow(lit.spec > 0.3 ? "#ffffff" : o.color, 8 + 10 * lit.bright); else ctx.shadowBlur = 0;
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    return P;
  }

  function drawTarget(o, now) {
    ctx.save();
    ctx.translate(o.x, o.y);
    // Dynamic opacity: each target swells nearer and drifts further away, brightening and fading as it goes,
    // with a slow shimmer on top, so the sky never looks flat.
    const near = Math.sin(now / 900 + o.phase * 1.7);                       // -1 far ... 1 near
    const shimmer = 0.5 + 0.5 * Math.sin(now / 340 + o.phase * 3);
    const A = Math.min(1, GAME.targetOpacity * (0.55 + 0.35 * (near + 1) / 2 + 0.25 * shimmer));
    ctx.globalAlpha = A; ctx.strokeStyle = o.color; ctx.fillStyle = o.color; ctx.lineWidth = 2; glow(o.color, 14);
    const s = o.size * (1 + 0.18 * near);
    if (o.kind === "drone") {
      drawModel(o, blender("arcade.drone", targetAxes) || MODELS.drone, s * (blender("arcade.drone", targetAxes) ? 1.3 : 1), A, now);
      ctx.globalAlpha = A * (0.5 + 0.5 * Math.sin(now / 120 + o.phase)); glow(o.color, 16); ctx.fillStyle = "#ffffff";
      ctx.beginPath(); ctx.arc(0, 0, s * 0.18, 0, 6.28); ctx.fill();                                  // pulsing core
    } else if (o.kind === "saucer") {
      drawModel(o, blender("arcade.saucer", targetAxes) || MODELS.saucer, s * (blender("arcade.saucer", targetAxes) ? 1.4 : 1), A, now);
      // Lights round the rim: bright on the near side, dim behind.
      const t = now / 500 + o.phase, tiltY = Math.sin(o.rx * 0.35);
      for (let i = 0; i < 8; i++) {
        const a = t + i * 0.785, z = Math.sin(a), f = 3.2 / (3.2 + z * 1.4);
        ctx.globalAlpha = A * (z < 0 ? (((Math.floor(now / 120) + i) % 4 === 0) ? 1 : 0.6) : 0.15);
        ctx.fillStyle = i % 2 ? "#ffb347" : "#ffffff"; glow(ctx.fillStyle, 8);
        ctx.beginPath(); ctx.arc(Math.cos(a) * 1.4 * s * f, z * tiltY * 1.4 * s * f, 2.2, 0, 6.28); ctx.fill();
      }
    } else if (o.kind === "cube") {
      drawModel(o, blender("arcade.cube", targetAxes) || MODELS.cube, s, A, now);
    } else if (o.kind === "star") {
      drawModel(o, blender("arcade.star", targetAxes) || MODELS.star, s * (blender("arcade.star", targetAxes) ? 1.2 : 1), Math.min(1, A * 1.3), now);
    } else if (o.kind === "power") {                       // power-up: a pulsing double ring with its letter (drawn fully solid)
      ctx.globalAlpha = 1;
      const pulse = 1 + 0.15 * Math.sin(now / 150);
      ctx.beginPath(); ctx.arc(0, 0, s * pulse, 0, 6.28); ctx.stroke();
      ctx.rotate(now / 400); ctx.setLineDash([4, 6]); ctx.beginPath(); ctx.arc(0, 0, s * 1.45, 0, 6.28); ctx.stroke(); ctx.setLineDash([]);
      ctx.rotate(-now / 400); ctx.font = "900 15px Oswald, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#fff"; ctx.fillText(o.type, 0, 1);
    }
    ctx.restore();
  }

  function drawBoss(now) {
    const b = boss;
    ctx.save(); ctx.translate(b.x, b.y);
    const flash = b.hitFlash; b.hitFlash *= 0.85;
    glow("#ff2bd6", 30);
    // Body: a wide saucer with a dome, a ring of lights and a glowing core.
    ctx.fillStyle = `rgba(46, 11, 87, ${0.85})`; ctx.strokeStyle = flash > 0.2 ? "#ffffff" : "#ff2bd6"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(0, 0, 120, 34, 0, 0, 6.28); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, -18, 54, 30, 0, Math.PI, 0); ctx.fillStyle = "rgba(176, 77, 255, .45)"; ctx.fill(); ctx.stroke();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * 6.28 + now / 600, lx = Math.cos(a) * 100, ly = Math.sin(a) * 22;
      if (ly < -2) continue;
      ctx.beginPath(); ctx.arc(lx, ly, 4, 0, 6.28); ctx.fillStyle = i % 3 ? "#ffb347" : "#ffffff"; ctx.fill();
    }
    const core = 10 + 4 * Math.sin(now / 90);
    ctx.beginPath(); ctx.arc(0, 8, core, 0, 6.28); ctx.fillStyle = "#ff2bd6"; ctx.fill();
    ctx.restore();
  }

  // ================================================ THE LOOP ================================================
  // ================================================ GIANT MONSTERS ================================================
  // Two giants stomp into the skyline behind the headline and wreck the city a chunk at a time:
  //   IRON RONIN  a giant mech-beast robot: armoured body, a long snout with a toothed steel jaw. It leans down,
//               chomps the tops off buildings and swallows the rubble.
  //   TOKAGE      a giant lizard kaiju: horned head, glowing crystal spines, a long tail. Breathes a plasma beam.
  // Each is a jointed 3D model (legs, arms, head, jaw, tail) lit by the lighting engine, walking and attacking with
  // real animation. Shoot them with any weapon. Every building they flatten costs a shield; bring one down for
  // 500 points. They only come once the game has started.
  const MONSTER = {
    firstAfter: 25000,          // ms after the first shot before the first one arrives
    attractAfter: 6000,         // before anyone plays, one still stomps in after this long (just a show: no shields lost)
    attractSmashes: 10,         // ...and leaves after this many blows
    every: 45000,               // ms between arrivals (after one is beaten)
    health: { robot: 38, kaiju: 44 },
    points: 500,
    height: 0.35,               // how tall, as a share of the screen height (tops just clear the menu bar)
    opacity: 0.94,
    smashEvery: 1500,           // ms between blows on a building
    buildingsPerShield: 2,      // every this many flattened buildings costs a shield
  };
  TUNE(MONSTER, CFG.monsters);
  // ---- A little kit for building jointed models (x right, y up, z towards you) ----
  const kMesh = () => ({ v: [], f: [] });
  function kFace(m, i, mat, c) { m.f.push({ i, mat, c }); }
  function kLathe(m, prof, n, mat, at = [0, 0, 0], sx = 1, sz = 1) {          // round shapes standing up the y axis
    const b = m.v.length;
    for (const [r, y] of prof) for (let k = 0; k < n; k++) { const a = k / n * 6.2832; m.v.push([at[0] + Math.cos(a) * r * sx, at[1] + y, at[2] + Math.sin(a) * r * sz]); }
    for (let p = 0; p < prof.length - 1; p++) for (let k = 0; k < n; k++) { const a = b + p * n + k, c2 = b + p * n + (k + 1) % n; kFace(m, [a, c2, c2 + n, a + n], typeof mat === "function" ? mat(p) : mat, [at[0], at[1] + (prof[0][1] + prof[prof.length - 1][1]) / 2, at[2]]); }
  }
  function kBox(m, at, size, mat) {
    const [x, y, z] = at, [a, b, c] = size.map(v => v / 2), base = m.v.length;
    for (const dx of [-a, a]) for (const dy of [-b, b]) for (const dz of [-c, c]) m.v.push([x + dx, y + dy, z + dz]);
    for (const q of [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]]) kFace(m, q.map(i => base + i), mat, at);
  }
  function kCone(m, base, tip, r, mat, n = 5) {                                // a spike from base to tip
    const d = tip.map((v, i) => v - base[i]), len = Math.hypot(...d), u = d.map(v => v / len);
    const t1 = Math.abs(u[1]) < 0.9 ? [u[2], 0, -u[0]] : [0, -u[2], u[1]], l1 = Math.hypot(...t1), a1 = t1.map(v => v / l1);
    const a2 = [u[1] * a1[2] - u[2] * a1[1], u[2] * a1[0] - u[0] * a1[2], u[0] * a1[1] - u[1] * a1[0]], b0 = m.v.length;
    for (let k = 0; k < n; k++) { const a = k / n * 6.2832; m.v.push(base.map((v, i) => v + (a1[i] * Math.cos(a) + a2[i] * Math.sin(a)) * r)); }
    m.v.push(tip);
    const c = base.map((v, i) => v + d[i] * 0.3);
    for (let k = 0; k < n; k++) kFace(m, [b0 + k, b0 + (k + 1) % n, b0 + n], mat, c);
  }
  const ball = (r, y0 = 0, n = 6, sy = 1) => Array.from({ length: n + 1 }, (_, i) => { const a = -Math.PI / 2 + i / n * Math.PI; return [Math.cos(a) * r + 0.001, y0 + Math.sin(a) * r * sy]; });
  // Rotation matrices and joints.
  const rX = a => { const c = Math.cos(a), s = Math.sin(a); return [[1, 0, 0], [0, c, -s], [0, s, c]]; };
  const rY = a => { const c = Math.cos(a), s = Math.sin(a); return [[c, 0, s], [0, 1, 0], [-s, 0, c]]; };
  const rZ = a => { const c = Math.cos(a), s = Math.sin(a); return [[c, -s, 0], [s, c, 0], [0, 0, 1]]; };
  const mMul = (A, B) => A.map(r => [0, 1, 2].map(j => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
  const mApp = (A, v) => [A[0][0] * v[0] + A[0][1] * v[1] + A[0][2] * v[2], A[1][0] * v[0] + A[1][1] * v[1] + A[1][2] * v[2], A[2][0] * v[0] + A[2][1] * v[1] + A[2][2] * v[2]];

  // ---- TOKAGE, the kaiju ----
  // Parts: [name, parent, pivot (in the parent's space), mesh]
  const KAIJU = (() => {
    const P = {};
    let m = kMesh();                                                             // body: a big pear leaning forward
    kLathe(m, [[0.001, -0.3], [1.15, 0.2], [1.45, 1.3], [1.25, 2.6], [0.85, 3.5], [0.5, 4.0]], 9, p => p === 2 ? "belly" : "skin", [0, 0, 0], 1, 0.9);
    for (let k = 0; k < 6; k++) { const y = 0.6 + k * 0.55, x = -1.1 - Math.sin(k * 0.5) * 0.25; kCone(m, [x + 0.15, y, 0], [x - 0.7 + k * 0.05, y + 0.55, 0], 0.28, "spine"); }   // crystal spines on the back
    for (let k = 0; k < 3; k++) kBox(m, [1.2, 1.2 + k * 0.6, 0], [0.12, 0.3, 0.9], "glow");                                      // glowing chest vents
    P.body = m;
    m = kMesh();                                                                 // head: skull, snout, brow, horns, eyes
    kBox(m, [0.5, 0.25, 0], [1.3, 0.9, 1.0], "skin"); kBox(m, [1.35, 0.1, 0], [0.9, 0.55, 0.75], "skin"); kBox(m, [0.45, 0.72, 0], [1.0, 0.18, 1.05], "dark");
    for (const s of [-1, 1]) { kCone(m, [0.15, 0.7, s * 0.35], [-0.65, 1.45, s * 0.75], 0.17, "horn"); kCone(m, [0.55, 0.75, s * 0.4], [0.25, 1.25, s * 0.85], 0.12, "horn"); kBox(m, [0.95, 0.5, s * 0.5], [0.22, 0.14, 0.06], "glow"); }
    for (let k = 0; k < 4; k++) kCone(m, [1.1 + k * 0.22, -0.15, 0.3], [1.1 + k * 0.22, -0.4, 0.3], 0.06, "horn", 3);   // teeth
    P.head = m;
    m = kMesh(); kBox(m, [0.8, -0.18, 0], [1.4, 0.3, 0.8], "belly"); for (let k = 0; k < 4; k++) kCone(m, [1.1 + k * 0.22, -0.03, 0.3], [1.1 + k * 0.22, 0.2, 0.3], 0.06, "horn", 3); P.jaw = m;
    m = kMesh(); kLathe(m, [[0.001, 0.2], [0.75, 0], [0.7, -1.3], [0.45, -1.8]], 7, "skin"); P.thigh = m;
    m = kMesh(); kLathe(m, [[0.45, 0], [0.42, -1.1], [0.5, -1.4]], 7, "skin"); kBox(m, [0.35, -1.55, 0], [1.3, 0.3, 0.8], "dark"); for (const z of [-0.25, 0, 0.25]) kCone(m, [0.95, -1.55, z], [1.3, -1.7, z], 0.1, "horn", 3); P.shin = m;
    m = kMesh(); kLathe(m, [[0.001, 0.15], [0.32, 0], [0.28, -1.0], [0.2, -1.2]], 6, "skin"); P.arm = m;
    m = kMesh(); kLathe(m, [[0.2, 0], [0.18, -0.8]], 6, "skin"); for (const z of [-0.12, 0.12]) kCone(m, [0, -0.8, z], [0.3, -1.15, z], 0.07, "horn", 3); P.forearm = m;
    const tails = [];
    for (let k = 0; k < 7; k++) {                                                // a tail of tapering segments, each with a spine
      const r = 0.85 * (1 - k / 8.5); m = kMesh();
      kLathe(m, [[0.001, 0.15], [r, 0], [r * 0.92, -1.1], [0.001, -1.25]], 7, "skin");
      kCone(m, [-0.1, -0.5, -r * 0.6], [-0.1, -0.55, -r * 0.6 - 0.45 * (1 - k / 9)], 0.16, "spine");
      tails.push(m);
    }
    P.tails = tails;
    return P;
  })();
  // ---- IRON RONIN, the robot ----
  const ROBOT = (() => {
    const P = {};
    let m = kMesh();
    kBox(m, [0, 0.3, 0], [1.5, 0.6, 1.1], "dark");                                // pelvis
    P.pelvis = m;
    m = kMesh();
    kBox(m, [0, 1.4, 0], [2.3, 1.9, 1.4], "hull"); kBox(m, [0, 2.45, 0], [1.4, 0.3, 1.1], "trim"); kBox(m, [0, 0.45, 0], [1.6, 0.35, 1.2], "dark");
    kLathe(m, [[0.001, 0.08], [0.38, 0.05], [0.38, -0.05]].map(([r, y]) => [r, y]), 10, "glow", [0, 1.5, 0.72]);   // chest reactor (facing you)
    for (const s of [-1, 1]) { kBox(m, [s * 1.45, 2.05, 0], [0.9, 0.8, 1.3], "trim"); kCone(m, [s * 1.6, 2.4, 0], [s * 1.9, 3.0, 0], 0.14, "dark", 4); }   // shoulder pads with fins
    kLathe(m, [[0.25, 0], [0.3, -0.5], [0.001, -0.55]], 6, "glow", [0, 1.6, -0.8]);                                   // back thruster
    P.torso = m;
    m = kMesh();
    // Head: a long armoured snout, glowing eyes, a crest of fins and a row of steel teeth on the upper jaw.
    kBox(m, [0.1, 0.5, 0], [1.1, 0.9, 1.0], "hull"); kBox(m, [1.0, 0.45, 0], [1.2, 0.55, 0.8], "hull"); kBox(m, [1.55, 0.6, 0], [0.3, 0.25, 0.7], "trim");
    for (const z of [-0.3, 0.3]) kBox(m, [0.55, 0.8, z], [0.3, 0.14, 0.12], "glow");                                  // eyes
    for (let k = 0; k < 3; k++) kCone(m, [-0.2 + k * 0.3, 0.95, 0], [-0.55 + k * 0.3, 1.5 - k * 0.12, 0], 0.13, "trim", 4);   // crest fins
    for (let k = 0; k < 6; k++) for (const z of [-0.3, 0.3]) kCone(m, [0.55 + k * 0.2, 0.18, z], [0.55 + k * 0.2, -0.12, z], 0.06, "horn", 3);   // top teeth
    P.head = m;
    m = kMesh();                                                                                  // the lower jaw, hinged at the back
    kBox(m, [0.75, -0.12, 0], [1.4, 0.3, 0.75], "dark"); kBox(m, [0.75, -0.3, 0], [1.3, 0.08, 0.7], "trim");
    for (let k = 0; k < 6; k++) for (const z of [-0.28, 0.28]) kCone(m, [0.25 + k * 0.2, 0.02, z], [0.25 + k * 0.2, 0.3, z], 0.06, "horn", 3);   // bottom teeth
    P.jaw = m;
    m = kMesh(); kBox(m, [0, -0.6, 0], [0.55, 1.3, 0.6], "hull"); P.upper = m;
    m = kMesh(); kBox(m, [0, -0.55, 0], [0.6, 1.1, 0.65], "trim"); kBox(m, [0, -1.35, 0], [0.8, 0.6, 0.75], "dark"); P.lower = m;   // forearm + fist
    m = kMesh(); kBox(m, [0, -0.8, 0], [0.7, 1.6, 0.75], "hull"); P.thigh = m;
    m = kMesh(); kBox(m, [0, -0.85, 0], [0.75, 1.7, 0.8], "trim"); kBox(m, [0.2, -1.8, 0], [1.3, 0.3, 0.95], "dark"); kBox(m, [0.3, -0.1, 0.0], [0.4, 0.35, 0.85], "dark"); P.shin = m;
    return P;
  })();
  const KPAINT = {
    kaiju: { skin: [125, 92, 165], belly: [195, 150, 180], dark: [40, 28, 58], horn: [235, 225, 245], spine: [255, 90, 220], glow: [255, 150, 60] },
    robot: { hull: [150, 150, 175], trim: [255, 138, 43], dark: [45, 42, 62], glow: [255, 70, 220], horn: [235, 235, 245] },
  };
  const GLOWY = new Set(["glow", "spine"]);

  const monsters = [];
  let nextMonsterAt = 0, nextMonsterType = "kaiju", buildingsLost = 0;
  function monsterScale() { return H * MONSTER.height / 8.5; }
  function spawnMonster(type) {
    const dir = Math.random() < 0.5 ? 1 : -1, s = monsterScale();
    monsters.push({ type, dir, x: dir > 0 ? -5 * s : W + 5 * s, hp: MONSTER.health[type], max: MONSTER.health[type], state: "walk", t: 0, walk: 0, flash: 0, target: null, lastSmash: 0, smashes: 0, circles: [], fall: 0, yaw: 0, beam: 0 });
    showBanner(type === "kaiju" ? "⚠ KAIJU ATTACK!" : "⚠ IRON RONIN IS EATING THE CITY!", 1800); sfx("bomb"); shakeIt(6);
    if (started) cheer(type === "kaiju" ? "A kaiju is wrecking the city! Shoot it! 🦖" : "A giant robot is EATING the city! Stop it! 🤖");
  }
  // Pick the next building to wreck: the nearest one still standing ahead (or anywhere if none ahead).
  function pickTarget(mo) {
    const city = window.neonCity, ground = city ? city.ground() : H * 0.4;
    if (!city) return null;
    let best = null, bd = Infinity;
    for (let x = W * 0.14; x < W * 0.86; x += 26) {                             // away from the edges, so they stay in view
      const roof = city.roofAt(x);
      if (roof === null || roof > ground - 34) continue;                       // only buildings worth wrecking
      const ahead = (x - mo.x) * mo.dir, d = ahead > 0 ? ahead : Math.abs(ahead) + W;
      if (d < bd) { bd = d; best = x; }
    }
    return best;
  }
  function updateMonsters(now, dt) {
    if (over_) return;
    if (!nextMonsterAt) nextMonsterAt = now + (started ? MONSTER.firstAfter : MONSTER.attractAfter);
    const alive = monsters.filter(m => m.state !== "dying").length;
    if (now > nextMonsterAt && (alive === 0 || (alive < 2 && level >= 3))) {
      spawnMonster(nextMonsterType); nextMonsterType = nextMonsterType === "kaiju" ? "robot" : "kaiju"; nextMonsterAt = now + MONSTER.every;
    }
    const s = monsterScale(), city = window.neonCity;
    for (let i = monsters.length - 1; i >= 0; i--) {
      const mo = monsters[i];
      mo.t += dt * 16.7; mo.flash = Math.max(0, mo.flash - dt * 0.08);
      if (mo.state === "dying") { mo.fall = Math.min(1, mo.fall + dt * 0.012); if (mo.fall >= 1 && mo.t > 2200) monsters.splice(i, 1); continue; }
      // Before anyone plays it is just a show: after a few blows it stomps off the edge of the screen.
      if (!started && mo.smashes >= MONSTER.attractSmashes) mo.leaving = true;
      if (mo.leaving) { mo.state = "walk"; mo.walk += dt * 0.09; mo.x += mo.dir * dt * 0.9; if (mo.x < -8 * s || mo.x > W + 8 * s) monsters.splice(i, 1); continue; }
      if (mo.target === null || mo.target === undefined) { mo.target = pickTarget(mo); if (mo.target === null) { mo.state = "walk"; mo.x += mo.dir * dt * 0.6; continue; } }
      const reach = (mo.type === "kaiju" ? 3.4 : 2.6) * s;
      // Stand beside the building on whichever side keeps the monster on screen (and is closer), facing it.
      const margin = 2.2 * s, left = mo.target - reach, right = mo.target + reach;
      const leftOk = left > margin, rightOk = right < W - margin;
      const side = leftOk && rightOk ? (Math.abs(mo.x - left) < Math.abs(mo.x - right) ? -1 : 1) : leftOk ? -1 : 1;
      const standAt = side < 0 ? left : right;
      if (Math.abs(mo.x - standAt) > 6) mo.dir = Math.sign(standAt - mo.x) || mo.dir; else mo.dir = side < 0 ? 1 : -1;
      if (Math.abs(mo.x - standAt) > 6) { mo.state = "walk"; mo.x += Math.sign(standAt - mo.x) * dt * 0.7; mo.walk += dt * 0.09; continue; }
      mo.state = "attack";
      if (now - mo.lastSmash > MONSTER.smashEvery) {
        mo.lastSmash = now; mo.attackAt = now;
        const roof = city.roofAt(mo.target);
        if (roof === null || roof > city.ground() - 10) {                      // that building is gone: costs a shield
          popups.push({ x: mo.target, y: city.ground() - 30, text: "BUILDING DESTROYED!", life: 1, color: "#ff8a2b" });
          if (started && ++buildingsLost % MONSTER.buildingsPerShield === 0) hitCity(mo.target, "CITY HIT!");
          mo.target = null; continue;
        }
        setTimeout(() => {                                                       // the blow lands a moment into the swing
          if (mo.state === "dying" || !city) return;
          const r = city.roofAt(mo.target); if (r === null) return;
          city.smash(mo.target + rand(-5, 5), r + 4, rand(9, 13) * Math.max(0.8, W / 1280));   // one bite at a time, from the roof down
          burst(mo.target, r, "#ffb347", 14, 1.2); sfx("boom"); shakeIt(5);
          mo.smashes++;
        }, 380);
      }
    }
  }
  // Pose the joints for this frame, then gather every face of every part, lit and sorted back to front.
  function poseMonster(mo, now) {
    const t = mo.t / 1000, walking = mo.state === "walk", attack = mo.state === "attack" ? Math.max(0, 1 - (now - (mo.attackAt || 0)) / 900) : 0;
    const swing = walking ? Math.sin(mo.walk) : 0, lift = walking ? Math.abs(Math.cos(mo.walk)) * 0.15 : 0;
    const parts = [];
    // Root: turned three-quarters towards you, facing its walking direction; topples when dying.
    const yaw = (mo.dir > 0 ? -0.55 : Math.PI + 0.55) + Math.sin(t * 0.7) * 0.12;
    let root = mMul(rY(yaw), rZ(-mo.fall * 1.45 * (mo.dir > 0 ? 1 : 1)));
    const add = (mesh, R, at, mat) => parts.push({ mesh, R, at, mat });
    const joint = (parentR, parentAt, pivot, R) => ({ R: mMul(parentR, R), at: mApp(parentR, pivot).map((v, i) => v + parentAt[i]) });
    if (mo.type === "kaiju") {
      const hip = [0, 3.0 + lift, 0];
      const body = joint(root, [0, 0, 0], hip, rZ(-0.38 + Math.sin(t * 2) * 0.03 - attack * 0.15));
      add(KAIJU.body, body.R, body.at, "kaiju");
      const head = joint(body.R, body.at, [0.55, 3.85, 0], rZ(0.35 - attack * 0.5 + Math.sin(t * 2.4) * 0.05));
      add(KAIJU.head, head.R, head.at, "kaiju");
      const jaw = joint(head.R, head.at, [0.3, 0, 0], rZ(-0.12 - attack * 0.55));
      add(KAIJU.jaw, jaw.R, jaw.at, "kaiju");
      mo.mouth = { at: mApp(head.R, [1.8, -0.1, 0]).map((v, i) => v + head.at[i]) };
      for (const side of [-1, 1]) {
        const th = joint(root, [0, 0, 0], [0.1, 3.0 + lift, side * 0.8], rZ(swing * 0.55 * side));
        add(KAIJU.thigh, th.R, th.at, "kaiju");
        const sh = joint(th.R, th.at, [0, -1.7, 0], rZ(-0.3 - Math.max(0, swing * side) * 0.5));
        add(KAIJU.shin, sh.R, sh.at, "kaiju");
        const ar = joint(body.R, body.at, [0.9, 2.6, side * 1.0], rZ(0.4 - swing * 0.4 * side + attack * 0.6));
        add(KAIJU.arm, ar.R, ar.at, "kaiju");
        const fa = joint(ar.R, ar.at, [0, -1.05, 0], rZ(0.9));
        add(KAIJU.forearm, fa.R, fa.at, "kaiju");
      }
      // The tail: each segment hangs off the last, swaying in a wave.
      let seg = joint(body.R, body.at, [-0.9, 0.4, 0], rZ(-1.05));             // sweeps out backwards
      for (let k = 0; k < KAIJU.tails.length; k++) {
        add(KAIJU.tails[k], seg.R, seg.at, "kaiju");
        seg = joint(seg.R, seg.at, [0, -1.15, 0], mMul(rZ(0.07 + Math.sin(t * 2.2 - k * 0.6) * 0.07), rX(Math.sin(t * 1.8 - k * 0.7) * 0.22)));   // droops to the ground, swishing
      }
    } else {
      const hip = [0, 3.4 + lift, 0];
      const pel = joint(root, [0, 0, 0], hip, rZ(0));
      add(ROBOT.pelvis, pel.R, pel.at, "robot");
      // Munching: it leans right down over the building, the jaw gapes open, then SNAPS shut on the roof.
      const ph = mo.state === "attack" ? Math.min(1, (now - (mo.attackAt || 0)) / 900) : 1;
      const lean = Math.sin(ph * Math.PI), gape = ph < 0.42 ? ph / 0.42 : Math.max(0, 1 - (ph - 0.42) * 7);
      const chew = mo.state === "attack" ? Math.max(0, Math.sin(t * 14)) * 0.15 : 0;                      // chewing between bites
      const torso = joint(pel.R, pel.at, [0, 0.4, 0], mMul(rY(Math.sin(t * 1.2) * 0.1), rZ(-lean * 0.75)));
      add(ROBOT.torso, torso.R, torso.at, "robot");
      const head = joint(torso.R, torso.at, [0.2, 2.6, 0], rZ(-0.05 + Math.sin(t * 1.7) * 0.05 - lean * 0.55));
      add(ROBOT.head, head.R, head.at, "robot");
      const jaw = joint(head.R, head.at, [0.1, 0.15, 0], rZ(-0.08 - gape * 0.75 - chew));
      add(ROBOT.jaw, jaw.R, jaw.at, "robot");
      mo.mouth = { at: mApp(head.R, [1.2, 0.05, 0]).map((v, i) => v + head.at[i]) };
      for (const side of [-1, 1]) {
        const grab = lean;                                                                                 // both claws reach down and grab
        const up = joint(torso.R, torso.at, [0.1, 2.05, side * 1.45], rZ(-swing * 0.45 * side + grab * 1.3));
        add(ROBOT.upper, up.R, up.at, "robot");
        const lo = joint(up.R, up.at, [0, -1.25, 0], rZ(0.5 + grab * 0.5));
        add(ROBOT.lower, lo.R, lo.at, "robot");
        const th = joint(pel.R, pel.at, [0, 0, side * 0.55], rZ(swing * 0.5 * side));
        add(ROBOT.thigh, th.R, th.at, "robot");
        const sh = joint(th.R, th.at, [0, -1.6, 0], rZ(-Math.max(0, swing * side) * 0.6));
        add(ROBOT.shin, sh.R, sh.at, "robot");
      }
    }
    return parts;
  }
  function drawMonster(mo, now) {
    const s = monsterScale(), ground = window.neonCity ? window.neonCity.ground() : H * 0.4, lights = sceneLights(now);
    const own = blender("arcade." + mo.type, m => ([x, y, z]) => [z * 4.2, (y + m.height / 2) * 4.2, x * 4.2]);
    let parts;
    if (own) {
      const t = mo.t / 1000, walking = mo.state === "walk", attack = mo.state === "attack" ? Math.max(0, 1 - (now - (mo.attackAt || 0)) / 900) : 0;
      const yaw = (mo.dir > 0 ? -0.55 : Math.PI + 0.55) + Math.sin(t * 0.7) * 0.12;
      const R = mMul(mMul(rY(yaw), rZ(-mo.fall * 1.45 - attack * 0.35)), rX(walking ? Math.sin(mo.walk) * 0.06 : 0));
      parts = [{ mesh: { v: own.v, f: own.faces }, R, at: [0, walking ? Math.abs(Math.cos(mo.walk)) * 0.15 : 0, 0], mat: mo.type }];
      mo.mouth = { at: mApp(R, [3.2, 7, 0]) };
    } else parts = poseMonster(mo, now);
    const faces = [], circles = [];
    const toScreen = w => [mo.x + w[0] * s, ground - w[1] * s];
    for (const p of parts) {
      const W3 = p.mesh.v.map(v => mApp(p.R, v).map((c, i) => c + p.at[i]));
      const S = W3.map(toScreen);
      // Hit circle for this part (centre and size on screen).
      let cx = 0, cy = 0; for (const q of S) { cx += q[0]; cy += q[1]; } cx /= S.length; cy /= S.length;
      let rr = 0; for (const q of S) rr = Math.max(rr, Math.hypot(q[0] - cx, q[1] - cy));
      circles.push({ x: cx, y: cy, r: rr * 0.8 });
      for (const f of p.mesh.f) {
        const a = W3[f.i[0]], b = W3[f.i[1]], c = W3[f.i[2]];
        let n = [(b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])];
        const nl = Math.hypot(...n); if (nl < 1e-9) continue; n = n.map(v => v / nl);
        const pc = mApp(p.R, f.c).map((v, i) => v + p.at[i]), mid = [0, 1, 2].map(k => f.i.reduce((tt, i) => tt + W3[i][k], 0) / f.i.length);
        if (!f.wind && (mid[0] - pc[0]) * n[0] + (mid[1] - pc[1]) * n[1] + (mid[2] - pc[2]) * n[2] < 0) n = n.map(v => -v);
        if (n[2] <= 0.03) continue;                                             // facing away from you
        faces.push({ pts: f.i.map(i => S[i]), z: mid[2], n, mat: f.mat, paint: KPAINT[p.mat], rgb: f.rgb });
      }
    }
    mo.circles = circles;
    faces.sort((p, q) => p.z - q.z);
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = MONSTER.opacity * (mo.state === "dying" ? Math.max(0, 1 - Math.max(0, mo.fall - 0.7) * 3) : 1);
    for (const f of faces) {
      const base = f.rgb || f.paint[f.mat] || f.paint.skin || f.paint.hull;
      let col;
      if (GLOWY.has(f.mat)) col = `rgb(${base.join(",")})`;
      else col = shadeFace(base, [f.n[0], -f.n[1], -f.n[2]], f.pts[0][0], f.pts[0][1], lights).color;
      if (mo.flash > 0.05) col = mo.flash > 0.5 ? "#ffffff" : col;
      ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = 0.7;
      ctx.beginPath(); f.pts.forEach((q, k) => k ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
    // Breath / eye-laser beam while attacking.
    const attack = mo.state === "attack" ? Math.max(0, 1 - (now - (mo.attackAt || 0)) / 900) : 0;
    if (attack > 0.15 && mo.mouth && mo.target !== null && window.neonCity) {
      const [mx, my] = toScreen(mo.mouth.at), roof = window.neonCity.roofAt(mo.target) ?? ground;
      if (mo.type === "robot") {                                                // rubble torn off the roof flies into its jaws
        const ph = Math.min(1, (now - (mo.attackAt || 0)) / 900);
        if (ph > 0.35) for (let k = 0; k < 10; k++) {
          const q = Math.min(1, (ph - 0.35) / 0.4 + k * 0.04), wob = Math.sin(k * 2.3) * 14 * (1 - q);
          const bx = mo.target + (mx - mo.target) * q + wob, by = roof + (my - roof) * q - Math.sin(q * Math.PI) * 30;
          if (q < 1) { ctx.fillStyle = k % 3 ? "#2b0f4a" : "#ff8a5a"; ctx.fillRect(bx - 3, by - 3, 4 + (k % 3) * 2, 4 + (k % 2) * 2); }
        }
      } else {
        const color = "#ff9a3c";
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = color; glow(color, 24); ctx.lineWidth = 10 * attack;
        ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mo.target, roof); ctx.stroke();
        ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 4 * attack; ctx.stroke();
        ctx.restore(); ctx.shadowBlur = 0;
      }
    }
    // Health bar over its head.
    if (mo.state !== "dying") {
      const top = Math.min(...circles.map(c => c.y - c.r)) - 14, w = 90;
      ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillRect(mo.x - w / 2, top, w, 5);
      ctx.fillStyle = mo.type === "kaiju" ? "#ff9a3c" : "#ff2bd6"; ctx.fillRect(mo.x - w / 2, top, w * Math.max(0, mo.hp / mo.max), 5);
    }
  }
  // Hitting them.
  const liveMonsters = () => monsters.filter(m => m.state !== "dying");
  function monsterAt(x, y, reach = 0) { for (const mo of liveMonsters()) for (const c of mo.circles) if (Math.hypot(c.x - x, c.y - y) < c.r + reach) return mo; return null; }
  function hitMonster(mo, dmg, x, y) {
    if (mo.state === "dying") return;
    mo.hp -= dmg; mo.flash = 1;
    burst(x, y, mo.type === "kaiju" ? "#ff9a3c" : "#ffd28a", 8, 1.1); sfx("hit");
    if (mo.hp > 0) return;
    mo.state = "dying"; mo.t = 0; mo.fall = 0;
    const s = monsterScale(), ground = window.neonCity ? window.neonCity.ground() : H * 0.4;
    for (let k = 0; k < 9; k++) setTimeout(() => { explode({ x: mo.x + rand(-2.5, 2.5) * s, y: ground - rand(0.5, 7) * s, size: 26, color: pick(["#ff2bd6", "#ff8a2b", "#ffb347", "#ffffff"]) }, 1.8); sfx("boom"); shakeIt(9); }, k * 160);
    setTimeout(() => sfx("bigboom"), 900);
    addScore(MONSTER.points, mo.x, ground - 6 * s, "#ffffff", mo.type === "kaiju" ? "KAIJU DOWN" : "ROBOT DOWN");
    showBanner(mo.type === "kaiju" ? "TOKAGE DEFEATED!" : "IRON RONIN DESTROYED!", 2200);
    achieve(mo.type === "kaiju" ? "kaiju" : "robot"); hitStop(140); shakeIt(16);
    cheer(mo.type === "kaiju" ? "The kaiju is down! Osaka is saved! 🎉" : "Robot scrapped! Nice shooting! 🔧");
    nextMonsterAt = performance.now() + MONSTER.every;
  }
  function monstersInRadius(x, y, r) { return liveMonsters().filter(mo => mo.circles.some(c => Math.hypot(c.x - x, c.y - y) < c.r + r)); }
  function monstersOnLine(x1, y1, x2, y2) { return liveMonsters().filter(mo => mo.circles.some(c => nearLine(c.x, c.y, x1, y1, x2, y2, c.r))); }

  window.neonMonstersReset = () => { monsters.length = 0; nextMonsterAt = 0; buildingsLost = 0; nextMonsterType = "kaiju"; if (window.neonCity) window.neonCity.rebuild(); };

  function frame(now) {
    const realDt = Math.min(50, now - lastTime); lastTime = now;
    const visible = heroOnScreen();
    if (started && !over_ && score > 0) {
      if (!visible) { if (!awaySince) awaySince = now; else if (now - awaySince > 1500) runEnded = true; }
      else { awaySince = 0; if (runEnded) { runEnded = false; gameOver(); } }
    }
    const ts = paused || over_ || !visible ? 0 : timeScale(now), dt = (realDt / 16.7) * ts;   // frozen while scrolled away
    ctx.clearRect(0, 0, W, H);
    hud.classList.toggle("is-hidden", !visible);
    bossbar.classList.toggle("is-hidden", !visible);

    // Screen shake: the game canvas, the floor (neon-bg.js reads window.neonShake) and the hero all jolt together.
    shake *= 0.86;
    const sx = (Math.random() - 0.5) * shake, sy = (Math.random() - 0.5) * shake;
    window.neonShake.x = sx; window.neonShake.y = sy;
    if (hero) hero.style.transform = shake > 0.5 ? `translate(${sx * 0.6}px, ${sy * 0.6}px)` : "";
    ctx.save(); ctx.translate(sx, sy);

    if (visible && !paused && !over_) {
      const busy = insane ? 2 : 1;
      if (now > nextSpawn && objects.length < (6 + level * 2) * busy && !boss) { spawnTarget(now); nextSpawn = now + GAME.baseSpawnEvery / (1 + (level - 1) * 0.25) / busy * rand(0.6, 1.3); }
      if (boss && now > nextSpawn && objects.length < 4) { spawnTarget(now); nextSpawn = now + 2500; }
      if (now > nextPower) { spawnPower(); nextPower = now + rand(...GAME.powerEvery); }
      if (Math.random() < 0.004 * busy && cars.length < 2) spawnCar();
    }
    if (combo > 1 && now - lastHit > GAME.comboWindow) { combo = 1; updateHud(); }
    if (power && now > power.until) { power = null; updateHud(); } else if (power && Math.random() < 0.05) updateHud();

    // Giant monsters wrecking the skyline (drawn solid, behind everything else in the game).
    if (visible && !paused && !over_) updateMonsters(now, dt);
    if (visible) for (const mo of monsters) drawMonster(mo, now);

    ctx.globalCompositeOperation = "lighter";

    // Targets (and drones dropping bombs)
    for (let i = objects.length - 1; i >= 0; i--) {
      const o = objects[i];
      o.x += o.vx * dt; o.y = o.baseY + Math.sin(o.x * o.freq + o.phase) * o.wobble;
      if (started && o.kind === "drone" && dt > 0 && now > o.nextBomb && o.x > 40 && o.x < W - 40) {
        bombs.push({ x: o.x, y: o.y + 14, vy: 0.6 }); o.nextBomb = now + rand(4000, 8000) / (1 + level * 0.15);
      }
      if (o.x < -80 || o.x > W + 80) { objects.splice(i, 1); continue; }
      if (visible) drawTarget(o, now);
    }
    ctx.shadowBlur = 0;

    // Bombs fall; reaching the floor damages the city.
    for (let i = bombs.length - 1; i >= 0; i--) {
      const b = bombs[i];
      b.vy += 0.035 * dt; b.y += b.vy * dt;
      if (b.y > floorY()) { bombs.splice(i, 1); if (!over_) hitCity(b.x, "BOMB HIT! -1 SHIELD"); continue; }
      if (!visible) continue;
      const blink = Math.floor(now / 140) % 2;
      ctx.beginPath(); ctx.arc(b.x, b.y, 7, 0, 6.28); ctx.fillStyle = blink ? "#ffb347" : "#ff2bd6"; glow("#ffb347", 16); ctx.fill();
      ctx.beginPath(); ctx.moveTo(b.x, b.y - 7); ctx.lineTo(b.x + 3, b.y - 13); ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.stroke();
    }
    ctx.shadowBlur = 0;

    // Flying cars weave between the buildings, leaving light trails. Don't shoot them!
    for (let i = cars.length - 1; i >= 0; i--) {
      const c = cars[i];
      c.x += c.vx * dt; c.trail.push([c.x, c.y]); if (c.trail.length > 18) c.trail.shift();
      if (c.x < -100 || c.x > W + 100) { cars.splice(i, 1); continue; }
      if (!visible) continue;
      ctx.beginPath(); c.trail.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.strokeStyle = "rgba(255, 179, 71, .55)"; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = "#e9e3ff"; ctx.fillRect(c.x - 9, c.y - 3, 18, 6);
      ctx.fillStyle = "#ffffff"; glow("#ffffff", 10); ctx.beginPath(); ctx.arc(c.x + Math.sign(c.vx) * 10, c.y, 2.2, 0, 6.28); ctx.fill();
      ctx.shadowBlur = 0;
    }

    // The boss: rises from behind the city, drifts side to side, sweeps beams across the floor.
    if (boss) {
      boss.t += dt;
      boss.y += (boss.targetY - boss.y) * 0.02 * Math.max(dt, 0.2);
      boss.x = W / 2 + Math.sin(boss.t / 90) * W * 0.3;
      if (!over_ && !paused && now > boss.nextBeam && boss.y < boss.targetY + 20) {
        bossBeams.push({ x: boss.x, sweep: rand(-1, 1) > 0 ? 1 : -1, life: 1, hitDone: false });
        if (started) for (const dx of [-60, 60]) bombs.push({ x: boss.x + dx, y: boss.y + 30, vy: 0.4 });   // two bombs per attack
        boss.nextBeam = now + Math.max(1800, 3600 - level * 200);
      }
      for (let i = bossBeams.length - 1; i >= 0; i--) {
        const bm = bossBeams[i];
        bm.life -= 0.012 * dt; bm.x += bm.sweep * 3 * dt;
        if (bm.life <= 0) { bossBeams.splice(i, 1); continue; }
        // Beams only smash the floor (for show). The boss's real threat is the bombs it drops, which you can shoot.
        if (!bm.hitDone && bm.life < 0.55) { bm.hitDone = true; shakeIt(5); }
        window.neonCrackAt && Math.random() < 0.3 && window.neonCrackAt(bm.x, floorY() + 20, 60);
        if (!visible) continue;
        const grad = ctx.createLinearGradient(0, boss.y, 0, floorY() + 40);
        grad.addColorStop(0, `rgba(255, 43, 214, ${bm.life})`); grad.addColorStop(1, `rgba(255, 179, 71, ${bm.life * 0.6})`);
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.moveTo(boss.x - 10, boss.y + 20); ctx.lineTo(boss.x + 10, boss.y + 20); ctx.lineTo(bm.x + 40, floorY() + 40); ctx.lineTo(bm.x - 40, floorY() + 40); ctx.closePath(); ctx.fill();
      }
      if (visible) drawBoss(now);
    }
    ctx.shadowBlur = 0;

    // Travelling shots: machine-gun tracers and rockets.
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      const move = dt || (paused || over_ ? 0 : 1);
      if (p.type === "rocket") p.speed = Math.min(22, p.speed + 0.55 * move);
      p.x += p.ux * p.speed * move; p.y += p.uy * p.speed * move; p.age += move;
      const arrived = Math.hypot(p.tx - p.x, p.ty - p.y) < p.speed * Math.max(move, 1) || p.y < -40 || p.x < -40 || p.x > W + 40;
      if (p.type === "bullet") {
        if (hitSomething(p.x, p.y, now, p.bossDmg, 4)) { burst(p.x, p.y, "#ffb347", 5, 1); projectiles.splice(i, 1); continue; }
        if (arrived) { burst(p.x, p.y, "#ffe0a8", 3, 0.8); projectiles.splice(i, 1); continue; }
        if (visible) { ctx.strokeStyle = "#ffd28a"; ctx.lineWidth = 2; glow("#ffb347", 10); ctx.beginPath(); ctx.moveTo(p.x - p.ux * 22, p.y - p.uy * 22); ctx.lineTo(p.x, p.y); ctx.stroke(); }
      } else {
        // A rocket explodes when it reaches the click, or early if it touches something on the way.
        const touched = objects.some(o => Math.hypot(o.x - p.x, o.y - p.y) < o.size + 8) || (boss && Math.abs(p.x - boss.x) < 120 && Math.abs(p.y - boss.y) < 40) || !!monsterAt(p.x, p.y);
        if (arrived || touched) { blast(p.x, p.y, 110, now, p.bossDmg); projectiles.splice(i, 1); continue; }
        if (Math.random() < 0.8) shards.push({ x: p.x - p.ux * 10, y: p.y - p.uy * 10, vx: rand(-0.5, 0.5), vy: rand(-0.5, 0.5), life: 0.8, size: rand(2, 4), color: Math.random() < 0.5 ? "#b9a3d9" : "#ff8a2b" });   // smoke + flame trail
        if (visible) {
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(p.uy, p.ux));
          glow("#ff8a2b", 14); ctx.fillStyle = "#ffffff"; ctx.fillRect(-9, -3, 16, 6);
          ctx.fillStyle = "#ff8a2b"; ctx.beginPath(); ctx.moveTo(-9, -3); ctx.lineTo(-18 - Math.random() * 8, 0); ctx.lineTo(-9, 3); ctx.fill();
          ctx.restore();
        }
      }
    }
    ctx.shadowBlur = 0;

    // Railgun beams: a thick violet line with a white-hot core, fading fast.
    for (let i = rails.length - 1; i >= 0; i--) {
      const r = rails[i];
      r.life -= 0.05;
      if (r.life <= 0) { rails.splice(i, 1); continue; }
      ctx.globalAlpha = r.life;
      ctx.strokeStyle = "#c48bff"; ctx.lineWidth = 16 * r.life; glow("#b04dff", 26);
      ctx.beginPath(); ctx.moveTo(r.x1, r.y1); ctx.lineTo(r.x2, r.y2); ctx.stroke();
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(r.x1, r.y1); ctx.lineTo(r.x2, r.y2); ctx.stroke();
    }
    // Lightning bolts: jagged white-violet lines that flicker as they fade.
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i];
      b.life -= 0.07;
      if (b.life <= 0) { bolts.splice(i, 1); continue; }
      ctx.globalAlpha = b.life * (0.6 + Math.random() * 0.4);
      ctx.strokeStyle = "#f3e6ff"; ctx.lineWidth = 2.5; glow("#c48bff", 20);
      ctx.beginPath(); b.pts.forEach(([x, y], k) => (k ? ctx.lineTo(x + rand(-2, 2), y + rand(-2, 2)) : ctx.moveTo(x, y))); ctx.stroke();
    }
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;

    // Laser beams from the bottom corners (and shotgun pellet streaks from the middle).
    for (let i = beams.length - 1; i >= 0; i--) {
      const b = beams[i];
      b.life -= b.kind === "pellet" ? 0.12 : 0.09;
      if (b.life <= 0) { beams.splice(i, 1); continue; }
      if (b.kind === "pellet") {
        ctx.globalAlpha = b.life; ctx.strokeStyle = "#ffe08a"; ctx.lineWidth = 1.5; glow("#ffb347", 10);
        ctx.beginPath(); ctx.moveTo(W / 2, H); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.beginPath(); ctx.arc(b.x, b.y, 4 * b.life + 1, 0, 6.28); ctx.fillStyle = "#fff4d6"; ctx.fill();
        continue;
      }
      for (const bx of [W * 0.06, W * 0.94]) {
        ctx.globalAlpha = b.life;
        ctx.strokeStyle = "#ff6ec7"; ctx.lineWidth = 6 * b.life; glow("#ff2bd6", 18);
        ctx.beginPath(); ctx.moveTo(bx, H); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(bx, H); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(b.x, b.y, 10 * b.life + 2, 0, 6.28); ctx.fillStyle = "#ffffff"; ctx.fill();
    }
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;

    // Explosion pieces.
    for (let i = shards.length - 1; i >= 0; i--) {
      const p = shards[i];
      p.life -= (p.flash ? 0.08 : 0.022) * Math.max(ts, 0.3);
      if (p.life <= 0) { shards.splice(i, 1); continue; }
      ctx.globalAlpha = Math.max(0, p.life);
      if (p.flash) {
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
        g.addColorStop(0, "rgba(255,255,255,.9)"); g.addColorStop(0.4, p.color); g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.4 - p.life * 0.4), 0, 6.28); ctx.fill(); continue;
      }
      p.x += p.vx * Math.max(ts, 0.3); p.y += p.vy * Math.max(ts, 0.3); p.vx *= 0.96; p.vy = p.vy * 0.96 + 0.06;
      if (p.line) {
        p.angle += p.spin; ctx.strokeStyle = p.color; ctx.lineWidth = 2; ctx.beginPath();
        ctx.moveTo(p.x - Math.cos(p.angle) * p.size / 2, p.y - Math.sin(p.angle) * p.size / 2); ctx.lineTo(p.x + Math.cos(p.angle) * p.size / 2, p.y + Math.sin(p.angle) * p.size / 2); ctx.stroke();
      } else { ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * p.life, 0, 6.28); ctx.fill(); }
    }

    // Score pop-ups.
    ctx.globalCompositeOperation = "source-over";
    ctx.font = "800 17px Oswald, 'Arial Narrow', sans-serif"; ctx.textAlign = "center";
    for (let i = popups.length - 1; i >= 0; i--) {
      const p = popups[i];
      p.life -= 0.016; p.y -= 0.7;
      if (p.life <= 0) { popups.splice(i, 1); continue; }
      ctx.globalAlpha = p.life; glow(p.color, 12); ctx.fillStyle = "#ffffff"; ctx.fillText(p.text, p.x, p.y);
    }
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    ctx.restore();
    requestAnimationFrame(frame);
  }

  reset();
  requestAnimationFrame(frame);

  // Handy for testing from the browser console: neonGame.boss(), neonGame.power(), neonGame.end()
  window.neonGame = { cityHit: () => hitCity(W / 2, "TEST"), monster: t => spawnMonster(t), placeMonster: (i, x) => { if (monsters[i]) monsters[i].x = x; }, monsters: () => monsters.map(m => ({ type: m.type, hp: +m.hp.toFixed(1), state: m.state, x: Math.round(m.x), target: m.target, smashes: m.smashes, parts: m.circles.length, cy: m.circles.length ? Math.round(m.circles[0].y) : 0 })), boss: spawnBoss, power: spawnPower, end: gameOver, state: () => ({ score, level, shields, combo, boss: !!boss, objects: objects.length, kinds: objects.map(o => o.kind + "@" + Math.round(o.x) + "," + Math.round(o.y)).join(" "), power: power && power.type }) };
})();
