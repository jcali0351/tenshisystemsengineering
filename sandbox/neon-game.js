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
  };
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
    over.hidden = true; bossbar.hidden = true; started = false;
    hud.querySelector(".neon-hud-tip").textContent = "Click the sky to start";
    updateHud();
  }

  function heroOnScreen() { const r = hero ? hero.getBoundingClientRect() : { bottom: H }; return r.bottom > H * 0.35; }
  const floorY = () => H * 0.82;
  const timeScale = now => (now < hitStopUntil ? 0 : now < slowUntil ? 0.35 : 1) * (insane ? 1.5 : 1);

  // ---- Messages ----
  let bannerTimer, tipTimer, toastTimer, bubbleTimer;
  function showBanner(text, ms = 1800) { banner.textContent = text; banner.classList.add("on"); clearTimeout(bannerTimer); bannerTimer = setTimeout(() => banner.classList.remove("on"), ms); }
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

  // ================================================ SHOOTING ================================================
  let holding = false, holdX = 0, holdY = 0, rapidTimer = null;
  function blocked(target) { return target.closest("a, button, input, textarea, select, label, form, .site-header, .tk-root, .neon-hud, .neon-over, .neon-sound, .chaos-sticker"); }

  window.addEventListener("pointerdown", e => {
    if (paused || over_ || e.button !== 0 || !heroOnScreen() || blocked(e.target)) return;
    holding = true; holdX = e.clientX; holdY = e.clientY;
    fire(holdX, holdY);
    if (power && power.type === "R" && power.until > performance.now()) {
      clearInterval(rapidTimer);
      rapidTimer = setInterval(() => { if (holding && power && power.until > performance.now()) fire(holdX, holdY); else clearInterval(rapidTimer); }, 95);
    }
  });
  window.addEventListener("pointermove", e => { holdX = e.clientX; holdY = e.clientY; });
  window.addEventListener("pointerup", () => { holding = false; clearInterval(rapidTimer); });

  function fire(x, y) {
    const now = performance.now();
    if (!started) {                                   // the first shot starts the game for real
      started = true;
      showBanner("GAME ON!", 1100);
      hud.querySelector(".neon-hud-tip").textContent = "Shoot the bombs before they land!";
      for (const o of objects) o.nextBomb = now + rand(5000, 9000);
    }
    const spread = power && power.type === "S" && power.until > now;
    const shots = spread ? [[0, 0], [-70, -20], [70, -20], [-140, -40], [140, -40]] : [[0, 0]];
    let anyHit = false;
    sfx("laser");
    for (const [dx, dy] of shots) {
      const sx = x + dx, sy = y + dy;
      beams.push({ x: sx, y: sy, life: 1 });
      if (hitSomething(sx, sy, now)) anyHit = true;
    }
    if (!anyHit) { combo = 1; burst(x, y, "#ffffff", 6, 2); sfx("miss"); }
    updateHud(anyHit);
  }

  function hitSomething(x, y, now) {
    // The boss first: anywhere on its body counts.
    if (boss && Math.abs(x - boss.x) < 120 && Math.abs(y - boss.y) < 45) { damageBoss(x, y, now); return true; }
    // Bombs.
    for (const b of bombs) if (Math.hypot(b.x - x, b.y - y) < 18) {
      bombs.splice(bombs.indexOf(b), 1); bombsShot++; addScore(5, b.x, b.y, "#ffb347", "BOMB DEFUSED");
      burst(b.x, b.y, "#ffb347", 18, 1.4); sfx("hit"); if (bombsShot >= 10) achieve("bomb"); return true;
    }
    // Flying cars: you shouldn't!
    for (const c of cars) if (Math.hypot(c.x - x, c.y - y) < 22) {
      cars.splice(cars.indexOf(c), 1); combo = 1; score = Math.max(0, score - 50);
      popups.push({ x: c.x, y: c.y - 12, text: "CIVILIAN! -50", life: 1, color: "#ff8a2b" });
      burst(c.x, c.y, "#ffffff", 16, 1.2); sfx("car"); cheer("Hey! That was somebody's car! 🚗"); return true;
    }
    // Targets and power-ups: the nearest one within reach.
    let target = null, bestD = Infinity;
    for (const o of objects) { const d = Math.hypot(o.x - x, o.y - y); if (d < o.size * GAME.hitRadius + 6 && d < bestD) { target = o; bestD = d; } }
    if (!target) return false;
    objects.splice(objects.indexOf(target), 1);
    if (target.kind === "power") { activatePower(target.type, now); explode(target, 1.4); return true; }

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
    return true;
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
      sfx("bigboom"); shakeIt(14); hitStop(120);
      return;
    }
    power = { type, until: now + GAME.powerSeconds * 1000 };
    if (type === "T") slowUntil = power.until;
  }

  function damageBoss(x, y, now) {
    boss.hp--; boss.hitFlash = 1;
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
    if (shields <= 0) gameOver();
  }

  // ================================================ GAME OVER & TOP 10 ================================================
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
  function drawTarget(o, now) {
    ctx.save();
    ctx.translate(o.x, o.y);
    const A = GAME.targetOpacity;
    ctx.globalAlpha = A; ctx.strokeStyle = o.color; ctx.fillStyle = o.color; ctx.lineWidth = 2; glow(o.color, 14);
    const s = o.size;
    if (o.kind === "drone") {
      ctx.rotate(Math.sin(now / 300 + o.phase) * 0.3);
      ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.7, 0); ctx.lineTo(0, s); ctx.lineTo(-s * 0.7, 0); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-s * 0.7, 0); ctx.lineTo(-s * 1.4, -s * 0.3); ctx.moveTo(s * 0.7, 0); ctx.lineTo(s * 1.4, -s * 0.3); ctx.stroke();
      ctx.globalAlpha = A * (0.5 + 0.5 * Math.sin(now / 120 + o.phase)); ctx.beginPath(); ctx.arc(0, 0, s * 0.25, 0, 6.28); ctx.fill();
    } else if (o.kind === "saucer") {
      ctx.beginPath(); ctx.ellipse(0, 0, s * 1.4, s * 0.45, 0, 0, 6.28); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -s * 0.2, s * 0.55, Math.PI, 0); ctx.stroke();
      for (let i = 0; i < 5; i++) { ctx.globalAlpha = A * (((Math.floor(now / 120) + i) % 5 === 0) ? 1 : 0.3); ctx.beginPath(); ctx.arc(-s + i * s * 0.5, s * 0.05, 2.2, 0, 6.28); ctx.fillStyle = i % 2 ? "#ffb347" : "#ffffff"; ctx.fill(); }
    } else if (o.kind === "cube") {
      o.spin += 0.04;
      const pts = [];
      for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
        const c1 = Math.cos(o.spin), s1 = Math.sin(o.spin), c2 = Math.cos(o.spin * 0.7), s2 = Math.sin(o.spin * 0.7);
        const x1 = x * c1 - z * s1, z1 = x * s1 + z * c1; pts.push([x1 * s * 0.6, (y * c2 - z1 * s2) * s * 0.6]);
      }
      ctx.beginPath();
      for (const [a, b] of [[0,1],[0,2],[0,4],[1,3],[1,5],[2,3],[2,6],[3,7],[4,5],[4,6],[5,7],[6,7]]) { ctx.moveTo(...pts[a]); ctx.lineTo(...pts[b]); }
      ctx.stroke();
    } else if (o.kind === "star") {
      ctx.rotate(now / 250); ctx.beginPath();
      for (let i = 0; i < 10; i++) { const r = i % 2 ? s * 0.45 : s; ctx.lineTo(Math.cos(i * Math.PI / 5) * r, Math.sin(i * Math.PI / 5) * r); }
      ctx.closePath(); ctx.globalAlpha = A * 0.35; ctx.fill(); ctx.globalAlpha = A; ctx.stroke();
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
  function frame(now) {
    const realDt = Math.min(50, now - lastTime); lastTime = now;
    const visible = heroOnScreen();
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

    // Laser beams from the bottom corners.
    for (let i = beams.length - 1; i >= 0; i--) {
      const b = beams[i];
      b.life -= 0.09;
      if (b.life <= 0) { beams.splice(i, 1); continue; }
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
  window.neonGame = { boss: spawnBoss, power: spawnPower, end: gameOver, state: () => ({ score, level, shields, combo, boss: !!boss, objects: objects.length, kinds: objects.map(o => o.kind + "@" + Math.round(o.x) + "," + Math.round(o.y)).join(" "), power: power && power.type }) };
})();
