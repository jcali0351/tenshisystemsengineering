// neon-arpg.js: "UNDERCITY", an isometric action-RPG dungeon crawler in the "Built, then made better" photo strip.
//
// Descend through neon crypts under Osaka: click to walk and to attack, right-click to throw a Fireball, 2 for Frost
// Nova, Q / W for health and mana potions, C for your character sheet. Monsters drop gold, potions and gear in four
// rarities (common, magic, rare, legendary) with random bonuses; better gear is equipped automatically, the rest is
// sold for gold. Find the stairs to go deeper; every third floor a Warden guards them. Your hero is saved in this browser.
//
// Like Station Defense, pressing PLAY turns the strip into a game window that fills the whole browser (FULLSCREEN too).
// Every character can be swapped for a Blender model through models/models.json (slots "arpg.hero", "arpg.hollow"...).
// It only runs while you're playing, so it never slows the page.
(function () {
  const title = document.getElementById("parallax-px2-title");
  const section = title && title.closest(".parallax");
  if (!section) return;

  // ================================================ SETTINGS ================================================
  const TW = 64, TH = 32, WALL = 44;                 // tile width / height on screen, wall height (pixels)
  const MAPW = 56, MAPH = 56;
  const CFG = (window.TENSHI_GAMES || {}).arpg || {}; const TUNE = window.TENSHI_TUNE || (t => t);   // your values from game_settings.py
  const LIGHT = CFG.light ?? 6.5;                                 // how far the hero's light reaches (tiles)
  const HERO = { speed: 4.2, reach: 1.25, attackEvery: 520 };
  const SKILLS = {
    fireball: { name: "Fireball", key: "1", mana: 8, cd: 350, color: "#ff8a2b" },
    nova: { name: "Frost Nova", key: "2", mana: 16, cd: 1600, color: "#8fd8ff" },
  };
  const MONSTERS = {
    hollow:  { name: "Hollow",  hp: 30, dmg: 4,  speed: 1.9, reach: 1.1, every: 1000, xp: 12, color: "#9fd6a8", r: 0.34, h: 1.0, weight: 5 },
    skitter: { name: "Skitter", hp: 16, dmg: 3,  speed: 3.4, reach: 1.0, every: 650,  xp: 8,  color: "#ff6ec7", r: 0.28, h: 0.5, weight: 4 },
    wisp:    { name: "Wisp",    hp: 22, dmg: 5,  speed: 2.4, reach: 5.5, every: 1500, xp: 14, color: "#8fd8ff", r: 0.26, h: 1.1, weight: 3, ranged: true },
    golem:   { name: "Golem",   hp: 110, dmg: 12, speed: 1.4, reach: 1.3, every: 1500, xp: 40, color: "#c9a6ff", r: 0.5, h: 1.5, weight: 1 },
    warden:  { name: "The Warden", hp: 700, dmg: 24, speed: 1.9, reach: 1.6, every: 1300, xp: 300, color: "#ff2bd6", r: 0.7, h: 2.2, weight: 0, boss: true },
  };
  const RARITY = [
    { id: "common", name: "Common", color: "#e8e6f0", chance: 0.58, mult: 1, affixes: 0 },
    { id: "magic", name: "Magic", color: "#6ea8ff", chance: 0.28, mult: 1.35, affixes: 1 },
    { id: "rare", name: "Rare", color: "#ffd84a", chance: 0.115, mult: 1.8, affixes: 2 },
    { id: "legendary", name: "Legendary", color: "#ff8a2b", chance: 0.025, mult: 2.6, affixes: 3 },
  ];
  TUNE(HERO, CFG.hero); TUNE(SKILLS, CFG.skills); TUNE(MONSTERS, CFG.monsters);
  for (const r of RARITY) TUNE(r, (CFG.rarity || {})[r.id]);
  // How many monsters: per room (more every 2 floors, up to a limit), and how often a Warden boss floor comes.
  const ENEMIES = { perRoomMin: 2, perRoomMax: 3, extraEveryTwoFloors: 1, extraMax: 4, bossEvery: 3 };
  TUNE(ENEMIES, CFG.enemies);
  const bossFloor = n => ENEMIES.bossEvery > 0 && n % ENEMIES.bossEvery === 0;
  const BASES = {
    weapon: ["Katana", "Neon Blade", "Rune Staff", "War Axe", "Glaive"],
    armor: ["Coat", "Lamellar", "Robe", "Plate", "Jacket"],
    ring: ["Ring", "Band", "Loop"],
    amulet: ["Amulet", "Talisman", "Charm"],
  };
  const AFFIXES = [
    { id: "dmg", label: "+{n} damage", pre: "Cruel", suf: "of Edges" },
    { id: "life", label: "+{n} life", pre: "Sturdy", suf: "of the Ox" },
    { id: "mana", label: "+{n} mana", pre: "Lucid", suf: "of Stars" },
    { id: "armor", label: "+{n} armour", pre: "Warded", suf: "of Stone" },
    { id: "crit", label: "+{n}% critical hits", pre: "Keen", suf: "of the Fox" },
    { id: "fire", label: "+{n} fire damage", pre: "Burning", suf: "of Embers" },
    { id: "speed", label: "+{n}% move speed", pre: "Swift", suf: "of Wind" },
  ];
  // ==========================================================================================================

  const sfx = n => window.neonAudio && window.neonAudio.sfx(n);
  const rand = (a, b) => a + Math.random() * (b - a);
  const irand = (a, b) => Math.floor(rand(a, b + 1));
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const store = {
    get() { try { return JSON.parse(localStorage.getItem("tenshi-arpg")); } catch (e) { return null; } },
    set(v) { try { localStorage.setItem("tenshi-arpg", JSON.stringify(v)); } catch (e) { /* storage blocked: no save */ } },
  };

  // ================================================ THE PAGE ================================================
  section.classList.add("arpg-zone");
  const root = document.createElement("div");
  root.className = "arpg";
  root.innerHTML = `
    <canvas class="arpg-canvas" aria-label="Undercity dungeon crawler game"></canvas>
    <div class="arpg-art" aria-hidden="true"><div class="arpg-art-img"></div></div>
    <div class="arpg-top">
      <button type="button" class="arpg-exit" hidden>✕ EXIT</button>
      <button type="button" class="arpg-full" hidden>⛶ FULLSCREEN</button>
      <div class="arpg-info" hidden><span class="arpg-floor"></span><span class="arpg-gold"></span><span class="arpg-lvl"></span></div>
    </div>
    <canvas class="arpg-mini" width="150" height="150" hidden></canvas>
    <div class="arpg-hud" hidden>
      <div class="arpg-gauge arpg-hp"><b></b><span></span></div>
      <div class="arpg-bar">
        <button type="button" data-act="fireball" title="Fireball (right-click or 1)"><i>1</i>🔥<small>Fireball</small></button>
        <button type="button" data-act="nova" title="Frost Nova (2)"><i>2</i>❄<small>Nova</small></button>
        <button type="button" data-act="hpot" title="Health potion (Q)"><i>Q</i>❤<small class="arpg-hpn">0</small></button>
        <button type="button" data-act="mpot" title="Mana potion (W)"><i>W</i>✦<small class="arpg-mpn">0</small></button>
        <button type="button" data-act="sheet" title="Character (C)"><i>C</i>☰<small>Hero</small></button>
      </div>
      <div class="arpg-gauge arpg-mp"><b></b><span></span></div>
      <div class="arpg-xp"><b></b></div>
    </div>
    <div class="arpg-sheet" hidden></div>
    <div class="arpg-tip" hidden></div>
    <div class="arpg-msg" aria-live="polite"></div>
    <div class="arpg-intro arpg-intro-cover">
      <p class="arpg-kicker">UNDERCITY · A NEON DUNGEON CRAWLER</p>
      <h3>Descend. Loot. Survive.</h3>
      <p>Fight your way down through the neon crypts beneath Osaka. Grab gold and gear, level up, find the stairs.</p>
      <div class="arpg-buttons"></div>
      <p class="arpg-help">Click to move &amp; attack · Right-click Fireball · 2 Frost Nova · Q/W potions · C hero</p>
    </div>`;
  section.appendChild(root);
  const canvas = root.querySelector(".arpg-canvas"), ctx = canvas.getContext("2d");
  const mini = root.querySelector(".arpg-mini"), mctx = mini.getContext("2d");
  const $ = s => root.querySelector(s);
  const intro = $(".arpg-intro"), hud = $(".arpg-hud"), sheet = $(".arpg-sheet"), msgEl = $(".arpg-msg"), tipEl = $(".arpg-tip");
  const exitBtn = $(".arpg-exit"), fullBtn = $(".arpg-full"), infoEl = $(".arpg-info");
  const light = document.createElement("canvas"), lctx = light.getContext("2d");

  let W = 0, H = 0, zoom = 1, ratio = 1;
  function resize() {
    const r = root.getBoundingClientRect();
    ratio = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * ratio); canvas.height = Math.round(H * ratio);
    light.width = Math.round(W / 2); light.height = Math.round(H / 2);      // half-size light map: soft and cheap
    zoom = W < 760 ? 0.8 : clamp(W / 1400, 0.85, 1.3);
  }
  window.addEventListener("resize", resize);

  // ================================================ STATE ================================================
  let grid, explored, rooms, torches, stairs, startPos, floorNo = 1;
  let monsters = [], loot = [], urns = [], shots = [], fx = [], nums = [];
  let hero = null, state = "intro", onScreen = false, bossAlive = false;
  const cam = { x: 0, y: 0 };
  const idx = (x, y) => y * MAPW + x;
  const isFloor = (x, y) => x >= 0 && y >= 0 && x < MAPW && y < MAPH && grid[idx(x | 0, y | 0)] === 1;

  // ---- Items ----
  function pickRarity(boost = 0) {           // simple weighted roll; boost pushes towards better items
    const roll = Math.random();
    let acc = 0;
    const list = RARITY.map((r, k) => ({ r, w: r.chance * (k === 0 ? 1 - boost : 1 + boost * 4) }));
    const total = list.reduce((t, x) => t + x.w, 0);
    for (const x of list) { acc += x.w / total; if (roll <= acc) return x.r; }
    return RARITY[0];
  }
  function makeItem(level, boost = 0) {
    const slot = pick(Object.keys(BASES)), rar = pickRarity(boost), base = pick(BASES[slot]);
    const stats = {};
    const main = slot === "weapon" ? "dmg" : slot === "armor" ? "armor" : slot === "ring" ? pick(["crit", "mana", "fire"]) : pick(["life", "mana"]);
    stats[main] = Math.round((slot === "weapon" ? 4 + level * 1.6 : slot === "armor" ? 5 + level * 2 : 3 + level) * rar.mult * rand(0.85, 1.15));
    const extra = AFFIXES.filter(a => a.id !== main).sort(() => Math.random() - 0.5).slice(0, rar.affixes);
    for (const a of extra) stats[a.id] = Math.round((a.id === "crit" || a.id === "speed" ? rand(3, 8) : rand(3, 7) + level * 1.2) * rar.mult);
    let name = base;
    if (extra[0]) name = extra[0].pre + " " + name;
    if (extra[1]) name = name + " " + extra[1].suf;
    if (rar.id === "legendary") name = pick(["Tenshi's", "Ryujin's", "The Ronin's", "Kitsune's", "Raijin's"]) + " " + base;
    return { slot, base, name, rarity: rar.id, color: rar.color, stats, level, power: Object.entries(stats).reduce((t, [k, v]) => t + v * (k === "dmg" || k === "fire" ? 2 : k === "crit" || k === "speed" ? 1.5 : 1), 0) };
  }
  const describe = it => Object.entries(it.stats).map(([k, v]) => AFFIXES.find(a => a.id === k).label.replace("{n}", v)).join(" · ");

  // ---- The hero ----
  function newHero() {
    return { x: 0, y: 0, lvl: 1, xp: 0, gold: 0, hp: 80, mp: 40, gear: {}, potions: { hp: 3, mp: 2 }, path: [], target: null, atkCd: 0, cds: { fireball: 0, nova: 0 }, face: 0, walk: 0, swing: 0, flash: 0, best: 1 };
  }
  function stats() {
    const g = Object.values(hero.gear), sum = k => g.reduce((t, it) => t + (it.stats[k] || 0), 0);
    return {
      maxHp: 70 + hero.lvl * 12 + sum("life"), maxMp: 34 + hero.lvl * 6 + sum("mana"),
      dmg: 6 + hero.lvl * 2 + sum("dmg"), fire: sum("fire"), armor: sum("armor"), crit: 5 + sum("crit"),
      speed: HERO.speed * (1 + sum("speed") / 100),
    };
  }
  const xpNeed = lvl => Math.round(60 * Math.pow(lvl, 1.55));
  function save() { store.set({ lvl: hero.lvl, xp: hero.xp, gold: hero.gold, gear: hero.gear, potions: hero.potions, floor: floorNo, best: Math.max(hero.best || 1, floorNo) }); }

  // ================================================ MAP ================================================
  function genFloor(n) {
    grid = new Uint8Array(MAPW * MAPH); explored = new Uint8Array(MAPW * MAPH);
    rooms = []; torches = []; monsters = []; loot = []; urns = []; shots = []; fx = []; nums = [];
    for (let tries = 0; tries < 300 && rooms.length < 13; tries++) {
      const w = irand(5, 10), h = irand(5, 10), x = irand(2, MAPW - w - 3), y = irand(2, MAPH - h - 3);
      if (rooms.some(r => x < r.x + r.w + 2 && x + w + 2 > r.x && y < r.y + r.h + 2 && y + h + 2 > r.y)) continue;
      rooms.push({ x, y, w, h, cx: Math.floor(x + w / 2), cy: Math.floor(y + h / 2) });
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) grid[idx(xx, yy)] = 1;
    }
    rooms.sort((a, b) => (a.cx + a.cy) - (b.cx + b.cy));
    const carve = (x1, y1, x2, y2) => {
      let x = x1, y = y1;
      const wide = Math.random() < 0.4;
      while (x !== x2) { grid[idx(x, y)] = 1; if (wide) grid[idx(x, y + 1)] = 1; x += Math.sign(x2 - x); }
      while (y !== y2) { grid[idx(x, y)] = 1; if (wide) grid[idx(x + 1, y)] = 1; y += Math.sign(y2 - y); }
      grid[idx(x, y)] = 1;
    };
    for (let k = 1; k < rooms.length; k++) {
      const a = rooms[k - 1], b = rooms[k];
      if (Math.random() < 0.5) carve(a.cx, a.cy, b.cx, b.cy); else carve(b.cx, b.cy, a.cx, a.cy);
      if (k > 2 && Math.random() < 0.25) { const c = rooms[k - 2]; carve(c.cx, c.cy, b.cx, b.cy); }     // a few loops
    }
    const first = rooms[0], last = rooms.reduce((best, r) => (Math.hypot(r.cx - first.cx, r.cy - first.cy) > Math.hypot(best.cx - first.cx, best.cy - first.cy) ? r : best), rooms[0]);
    startPos = { x: first.cx + 0.5, y: first.cy + 0.5 };
    stairs = { x: last.cx, y: last.cy };
    // Torches on walls next to the floor; urns in rooms.
    for (let y = 1; y < MAPH - 1; y++) for (let x = 1; x < MAPW - 1; x++) {
      if (grid[idx(x, y)] !== 0) continue;
      const nearFloor = (grid[idx(x + 1, y)] || grid[idx(x, y + 1)]);
      if (nearFloor && Math.random() < 0.035) torches.push({ x: x + 0.5, y: y + 0.5, phase: rand(0, 6.28) });
    }
    for (const r of rooms) {
      if (r === first) continue;
      for (let k = 0; k < irand(0, 2); k++) urns.push({ x: r.x + rand(0.7, r.w - 0.7), y: r.y + rand(0.7, r.h - 0.7), hp: 1 });
      if (r === last && bossFloor(n)) continue;
      const count = irand(ENEMIES.perRoomMin, Math.max(ENEMIES.perRoomMin, ENEMIES.perRoomMax + Math.min(ENEMIES.extraMax, Math.floor(n / 2) * ENEMIES.extraEveryTwoFloors)));
      for (let k = 0; k < count; k++) spawnMonster(pickMonster(n), r.x + rand(0.6, r.w - 0.6), r.y + rand(0.6, r.h - 0.6), n);
    }
    bossAlive = false;
    if (bossFloor(n)) { spawnMonster("warden", last.cx + 0.5, last.cy - 1.5, n); bossAlive = true; }
  }
  function pickMonster(n) {
    const list = Object.entries(MONSTERS).filter(([k, m]) => m.weight && (k !== "golem" || n >= 2) && (k !== "wisp" || n >= 1));
    const total = list.reduce((t, [, m]) => t + m.weight, 0);
    let r = Math.random() * total;
    for (const [k, m] of list) { r -= m.weight; if (r <= 0) return k; }
    return "hollow";
  }
  function spawnMonster(type, x, y, n) {
    const T = MONSTERS[type], scale = 1 + (n - 1) * 0.32;
    const champion = !T.boss && Math.random() < 0.08 + n * 0.01;
    monsters.push({ type, T, x, y, hp: Math.round(T.hp * scale * (champion ? 2.2 : 1)), max: Math.round(T.hp * scale * (champion ? 2.2 : 1)), dmg: Math.round(T.dmg * (1 + (n - 1) * 0.2) * (champion ? 1.4 : 1)), champion, cd: rand(0, 800), face: 0, walk: rand(0, 6), flash: 0, slow: 0, aggro: false, path: [], repath: 0, home: { x, y } });
  }

  // ---- Pathfinding (A*, 8 directions, no corner cutting) ----
  function findPath(sx, sy, tx, ty, limit = 2500) {
    sx |= 0; sy |= 0; tx |= 0; ty |= 0;
    if (!isFloor(tx, ty)) return null;
    const open = [[0, sx, sy]], came = new Map(), g = new Map([[idx(sx, sy), 0]]);
    let n = 0;
    while (open.length && n++ < limit) {
      let bi = 0; for (let k = 1; k < open.length; k++) if (open[k][0] < open[bi][0]) bi = k;
      const [, x, y] = open.splice(bi, 1)[0];
      if (x === tx && y === ty) {
        const path = [[tx + 0.5, ty + 0.5]]; let key = idx(x, y);
        while (came.has(key)) { key = came.get(key); path.unshift([(key % MAPW) + 0.5, Math.floor(key / MAPW) + 0.5]); }
        path.shift(); return path;
      }
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (!isFloor(nx, ny) || (dx && dy && (!isFloor(x + dx, y) || !isFloor(x, y + dy)))) continue;
        const cost = g.get(idx(x, y)) + (dx && dy ? 1.414 : 1), key = idx(nx, ny);
        if (g.has(key) && g.get(key) <= cost) continue;
        g.set(key, cost); came.set(key, idx(x, y));
        open.push([cost + Math.hypot(tx - nx, ty - ny), nx, ny]);
      }
    }
    return null;
  }
  function lineOfSight(a, b) {
    const steps = Math.ceil(dist(a, b) * 3);
    for (let k = 1; k < steps; k++) { const t = k / steps; if (!isFloor(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)) return false; }
    return true;
  }
  function moveToward(e, tx, ty, speed, dt) {
    const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy);
    if (d < 0.05) return true;
    const step = Math.min(d, speed * dt / 1000), nx = e.x + dx / d * step, ny = e.y + dy / d * step;
    if (isFloor(nx, ny)) { e.x = nx; e.y = ny; } else if (isFloor(nx, e.y)) e.x = nx; else if (isFloor(e.x, ny)) e.y = ny;
    e.face = Math.atan2(dy, dx); e.walk += step * 6;
    return d <= step + 0.02;
  }

  // ================================================ GAME LOGIC ================================================
  function say(text, ms = 1800, color) { msgEl.textContent = text; msgEl.style.color = color || ""; msgEl.classList.add("on"); clearTimeout(say.t); say.t = setTimeout(() => msgEl.classList.remove("on"), ms); }
  function num(x, y, text, color, big) { nums.push({ x, y, text: String(text), color, life: 1, big }); }
  function burst(x, y, color, n = 14, speed = 3, z = 0.6) { for (let k = 0; k < n; k++) { const a = rand(0, 6.28), v = rand(0.5, 1) * speed; fx.push({ x, y, z, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: rand(1, 4), life: 1, color, size: rand(2, 4) }); } }

  function hurtMonster(m, amount, color = "#ffffff", crit = false) {
    if (m.hp <= 0) return;
    m.hp -= amount; m.flash = 1; m.aggro = true;
    num(m.x, m.y, Math.round(amount) + (crit ? "!" : ""), crit ? "#ffd84a" : color, crit);
    burst(m.x, m.y, m.T.color, crit ? 14 : 7, 2.5);
    if (m.hp <= 0) killMonster(m);
  }
  function killMonster(m) {
    monsters = monsters.filter(x => x !== m);
    burst(m.x, m.y, m.T.color, m.T.boss ? 60 : 22, m.T.boss ? 6 : 3.5);
    sfx(m.T.boss ? "bigboom" : "hit");
    gainXp(Math.round(m.T.xp * (1 + (floorNo - 1) * 0.25) * (m.champion ? 2.5 : 1)));
    // Drops
    if (Math.random() < 0.6 || m.T.boss) loot.push({ kind: "gold", x: m.x + rand(-0.3, 0.3), y: m.y + rand(-0.3, 0.3), amount: Math.round(rand(3, 12) * floorNo * (m.T.boss ? 12 : m.champion ? 3 : 1)), bob: rand(0, 6) });
    if (Math.random() < 0.13) loot.push({ kind: Math.random() < 0.6 ? "hpot" : "mpot", x: m.x + rand(-0.4, 0.4), y: m.y + rand(-0.4, 0.4), bob: rand(0, 6) });
    const itemChance = m.T.boss ? 3 : m.champion ? 1 : 0.17;
    for (let k = 0; k < Math.floor(itemChance) + (Math.random() < itemChance % 1 ? 1 : 0); k++)
      loot.push({ kind: "item", item: makeItem(floorNo + hero.lvl / 2, m.T.boss ? 0.6 : m.champion ? 0.3 : 0), x: m.x + rand(-0.6, 0.6), y: m.y + rand(-0.6, 0.6), bob: rand(0, 6) });
    if (m.T.boss) { bossAlive = false; say("THE WARDEN FALLS · THE STAIRS ARE OPEN", 3200, "#ff8af0"); }
  }
  function gainXp(n) {
    hero.xp += n;
    while (hero.xp >= xpNeed(hero.lvl)) {
      hero.xp -= xpNeed(hero.lvl); hero.lvl++;
      const s = stats(); hero.hp = s.maxHp; hero.mp = s.maxMp;
      say("LEVEL UP · LEVEL " + hero.lvl, 2400, "#ffd84a"); sfx("achievement");
      for (let k = 0; k < 3; k++) fx.push({ ring: true, x: hero.x, y: hero.y, r: 0.2 + k * 0.4, life: 1, color: "#ffd84a" });
    }
    save();
  }
  function hurtHero(amount, from) {
    if (state !== "play") return;
    const s = stats(), taken = Math.max(1, Math.round(amount * (1 - s.armor / (s.armor + 60))));
    hero.hp -= taken; hero.flash = 1;
    num(hero.x, hero.y, "-" + taken, "#ff6e8a");
    if (hero.hp <= 0) die();
  }
  function die() {
    state = "dead";
    const lost = Math.round(hero.gold * 0.2); hero.gold -= lost;
    sfx("bigboom");
    setTimeout(() => {
      showIntro(`<p class="arpg-kicker">YOU HAVE FALLEN · FLOOR ${floorNo}</p><h3>The crypt claims you.</h3><p>You dropped ${lost} gold. Your level and gear are kept.</p><div class="arpg-buttons"><button type="button" class="arpg-play" data-go="retry">↺ TRY THIS FLOOR AGAIN</button><button type="button" class="arpg-play arpg-alt" data-go="new">✦ NEW HERO</button></div>`);
    }, 900);
    save();
  }
  function enterFloor(n) {
    floorNo = n; genFloor(n);
    hero.x = startPos.x; hero.y = startPos.y; hero.path = []; hero.target = null;
    reveal(); save();
    say(bossFloor(n) ? `FLOOR ${n} · A WARDEN GUARDS THE STAIRS` : `FLOOR ${n}`, 2400, bossFloor(n) ? "#ff8af0" : undefined);
  }
  function reveal() {
    const r = Math.ceil(LIGHT);
    for (let y = Math.max(0, (hero.y | 0) - r); y <= Math.min(MAPH - 1, (hero.y | 0) + r); y++) for (let x = Math.max(0, (hero.x | 0) - r); x <= Math.min(MAPW - 1, (hero.x | 0) + r); x++)
      if (Math.hypot(x + 0.5 - hero.x, y + 0.5 - hero.y) < LIGHT) explored[idx(x, y)] = 1;
  }

  function castFireball(tx, ty) {
    const S = SKILLS.fireball;
    if (hero.cds.fireball > 0) return;
    if (hero.mp < S.mana) return say("Not enough mana", 900, "#8fd8ff");
    hero.mp -= S.mana; hero.cds.fireball = S.cd;
    const a = Math.atan2(ty - hero.y, tx - hero.x); hero.face = a;
    shots.push({ kind: "fire", x: hero.x + Math.cos(a) * 0.4, y: hero.y + Math.sin(a) * 0.4, vx: Math.cos(a) * 9, vy: Math.sin(a) * 9, life: 1400, from: "hero" });
    sfx("rocket");
  }
  function castNova() {
    const S = SKILLS.nova;
    if (hero.cds.nova > 0) return;
    if (hero.mp < S.mana) return say("Not enough mana", 900, "#8fd8ff");
    hero.mp -= S.mana; hero.cds.nova = S.cd;
    fx.push({ ring: true, x: hero.x, y: hero.y, r: 0.3, grow: 3.4, life: 1, color: "#8fd8ff", nova: true });
    const s = stats();
    for (const m of [...monsters]) if (dist(m, hero) < 3.4) { m.slow = 2500; hurtMonster(m, Math.round((s.dmg * 0.8 + s.fire * 0.5) * rand(0.9, 1.1)), "#8fd8ff"); }
    sfx("zap");
  }
  function drink(kind) {
    const s = stats();
    if (kind === "hp" && hero.potions.hp > 0 && hero.hp < s.maxHp) { hero.potions.hp--; hero.hp = Math.min(s.maxHp, hero.hp + s.maxHp * 0.55); burst(hero.x, hero.y, "#ff6e8a", 12, 1.5); sfx("power"); }
    else if (kind === "mp" && hero.potions.mp > 0 && hero.mp < s.maxMp) { hero.potions.mp--; hero.mp = Math.min(s.maxMp, hero.mp + s.maxMp * 0.7); burst(hero.x, hero.y, "#6ea8ff", 12, 1.5); sfx("power"); }
  }
  function pickUp(l) {
    loot = loot.filter(x => x !== l);
    if (l.kind === "gold") { hero.gold += l.amount; num(l.x, l.y, "+" + l.amount + "g", "#ffd84a"); sfx("combo"); }
    else if (l.kind === "hpot") { hero.potions.hp++; num(l.x, l.y, "+ health potion", "#ff6e8a"); sfx("combo"); }
    else if (l.kind === "mpot") { hero.potions.mp++; num(l.x, l.y, "+ mana potion", "#6ea8ff"); sfx("combo"); }
    else if (l.kind === "item") {
      const it = l.item, cur = hero.gear[it.slot];
      if (!cur || it.power > cur.power) {
        hero.gear[it.slot] = it;
        const s = stats(); hero.hp = Math.min(hero.hp, s.maxHp); hero.mp = Math.min(hero.mp, s.maxMp);
        say("EQUIPPED · " + it.name.toUpperCase(), 2600, it.color);
        showTip(it, cur);
        sfx(it.rarity === "legendary" || it.rarity === "rare" ? "achievement" : "power");
        if (sheetOpen) renderSheet();
      } else {
        const g = Math.round(it.power * 2 * (RARITY.findIndex(r => r.id === it.rarity) + 1));
        hero.gold += g; num(l.x, l.y, "sold " + it.name + " +" + g + "g", it.color);
        sfx("combo");
      }
    }
    save();
  }
  function showTip(it, old) {
    tipEl.innerHTML = `<b style="color:${it.color}">${it.name}</b><small>${RARITY.find(r => r.id === it.rarity).name} ${it.slot}</small><p>${describe(it)}</p>${old ? `<em>replaces ${old.name}</em>` : ""}`;
    tipEl.hidden = false; clearTimeout(showTip.t); showTip.t = setTimeout(() => { tipEl.hidden = true; }, 3800);
  }

  // ---- One step of the game ----
  let holdMove = null, mouseWorld = { x: 0, y: 0 };
  function update(dt) {
    const s = stats();
    hero.mp = Math.min(s.maxMp, hero.mp + dt / 1000 * (1.6 + hero.lvl * 0.15));
    hero.hp = Math.min(s.maxHp, hero.hp + dt / 1000 * 0.5);
    hero.atkCd = Math.max(0, hero.atkCd - dt);
    for (const k in hero.cds) hero.cds[k] = Math.max(0, hero.cds[k] - dt);
    hero.flash = Math.max(0, hero.flash - dt / 250); hero.swing = Math.max(0, hero.swing - dt / 250);
    // Holding the mouse on the ground keeps walking towards it.
    if (holdMove && (!holdMove.next || performance.now() > holdMove.next)) { setMove(mouseWorld.x, mouseWorld.y); holdMove.next = performance.now() + 220; }
    // Attacking a target (monster or urn).
    const t = hero.target;
    if (t && (t.hp <= 0 || (t.T && !monsters.includes(t)) || (!t.T && !urns.includes(t)))) hero.target = null;
    if (hero.target) {
      const d = dist(hero, hero.target), reach = HERO.reach + (hero.target.T ? hero.target.T.r : 0.2);
      if (d <= reach) {
        hero.path = []; hero.face = Math.atan2(hero.target.y - hero.y, hero.target.x - hero.x);
        if (!hero.atkCd) {
          hero.atkCd = HERO.attackEvery; hero.swing = 1;
          if (hero.target.T) {
            const crit = Math.random() * 100 < s.crit;
            hurtMonster(hero.target, (s.dmg * rand(0.85, 1.15) + s.fire) * (crit ? 2 : 1), s.fire ? "#ffb36b" : "#ffffff", crit);
            sfx("hit");
          } else { smashUrn(hero.target); hero.target = null; }
        }
      } else if (!hero.path.length || (hero.repath || 0) < performance.now()) { hero.path = findPath(hero.x, hero.y, hero.target.x, hero.target.y, 1200) || []; hero.repath = performance.now() + 300; }
    }
    if (hero.path.length) { const [px, py] = hero.path[0]; if (moveToward(hero, px, py, s.speed, dt)) hero.path.shift(); reveal(); }
    // Pick up anything you walk over.
    for (const l of [...loot]) if (dist(l, hero) < 0.6) pickUp(l);
    // Stairs
    if (Math.hypot(hero.x - (stairs.x + 0.5), hero.y - (stairs.y + 0.5)) < 0.6) {
      if (bossAlive) { if (!update.warned) { say("THE WARDEN STILL GUARDS THESE STAIRS", 1600, "#ff8af0"); update.warned = true; setTimeout(() => { update.warned = false; }, 3000); } }
      else { sfx("power"); enterFloor(floorNo + 1); }
    }
    // Monsters
    for (const m of monsters) {
      m.cd = Math.max(0, m.cd - dt); m.flash = Math.max(0, m.flash - dt / 200); m.slow = Math.max(0, m.slow - dt);
      const d = dist(m, hero), speed = m.T.speed * (m.slow ? 0.45 : 1) * (m.champion ? 1.15 : 1);
      if (!m.aggro && d < 7.5 && lineOfSight(m, hero)) { m.aggro = true; if (m.T.boss) { say("THE WARDEN AWAKENS", 2200, "#ff2bd6"); sfx("bomb"); } }
      if (!m.aggro) { if (Math.random() < dt / 3000) m.wander = { x: m.home.x + rand(-1.5, 1.5), y: m.home.y + rand(-1.5, 1.5) }; if (m.wander && isFloor(m.wander.x, m.wander.y)) moveToward(m, m.wander.x, m.wander.y, speed * 0.4, dt); continue; }
      if (m.T.ranged) {
        const see = lineOfSight(m, hero);
        if (see && d < m.T.reach && !m.cd) { m.cd = m.T.every; const a = Math.atan2(hero.y - m.y, hero.x - m.x); shots.push({ kind: "bolt", x: m.x, y: m.y, vx: Math.cos(a) * 6, vy: Math.sin(a) * 6, life: 1600, dmg: m.dmg, from: "monster" }); m.face = a; }
        if (see && d < 3) moveToward(m, m.x - (hero.x - m.x), m.y - (hero.y - m.y), speed, dt);      // keep its distance
        else if (!see || d > m.T.reach) chase(m, speed, dt);
        continue;
      }
      if (d <= m.T.reach + m.T.r * 0.5) {
        m.face = Math.atan2(hero.y - m.y, hero.x - m.x);
        if (!m.cd) {
          m.cd = m.T.every * (m.slow ? 1.5 : 1); m.swing = 1;
          if (m.T.boss && Math.random() < 0.35) {                               // the Warden's ground slam
            fx.push({ ring: true, x: m.x, y: m.y, r: 0.3, grow: 2.8, life: 1, color: "#ff2bd6" });
            if (d < 2.8) hurtHero(m.dmg * 1.3);
            sfx("boom");
          } else hurtHero(m.dmg);
        }
      } else chase(m, speed, dt);
      if (m.swing) m.swing = Math.max(0, m.swing - dt / 300);
    }
    // Shots
    for (const sh of [...shots]) {
      sh.life -= dt; const nx = sh.x + sh.vx * dt / 1000, ny = sh.y + sh.vy * dt / 1000;
      if (sh.kind === "fire" && Math.random() < 0.7) fx.push({ x: sh.x, y: sh.y, z: 0.7, vx: rand(-0.4, 0.4), vy: rand(-0.4, 0.4), vz: rand(0.3, 1.2), life: 0.7, color: Math.random() < 0.5 ? "#ffd84a" : "#ff8a2b", size: rand(2, 4) });
      let hit = !isFloor(nx, ny) || sh.life <= 0;
      if (!hit && sh.from === "hero") for (const m of monsters) if (Math.hypot(m.x - nx, m.y - ny) < m.T.r + 0.3) { hit = true; break; }
      if (!hit && sh.from === "monster" && Math.hypot(hero.x - nx, hero.y - ny) < 0.45) { hit = true; hurtHero(sh.dmg); }
      if (hit) {
        shots = shots.filter(x => x !== sh);
        if (sh.kind === "fire") {
          fx.push({ ring: true, x: sh.x, y: sh.y, r: 0.2, grow: 1.5, life: 1, color: "#ff8a2b" });
          burst(sh.x, sh.y, "#ff8a2b", 18, 3);
          for (const m of [...monsters]) if (Math.hypot(m.x - sh.x, m.y - sh.y) < 1.5 + m.T.r) hurtMonster(m, Math.round((s.dmg * 1.1 + s.fire * 1.5 + hero.lvl * 2) * rand(0.9, 1.1)), "#ffb36b");
          sfx("boom");
        } else burst(sh.x, sh.y, "#8fd8ff", 8, 2);
      } else { sh.x = nx; sh.y = ny; }
    }
    // Effects
    for (const f of [...fx]) {
      if (f.ring) { f.life -= dt / 450; f.r += (f.grow || 1) * dt / 450; }
      else { f.x += f.vx * dt / 1000; f.y += f.vy * dt / 1000; f.z += f.vz * dt / 1000; f.vz -= 9 * dt / 1000; if (f.z < 0) { f.z = 0; f.vz *= -0.3; f.vx *= 0.6; f.vy *= 0.6; } f.life -= dt / 900; }
      if (f.life <= 0) fx.splice(fx.indexOf(f), 1);
    }
    for (const n of [...nums]) { n.life -= dt / 1100; if (n.life <= 0) nums.splice(nums.indexOf(n), 1); }
  }
  function chase(m, speed, dt) {
    if (lineOfSight(m, hero)) { moveToward(m, hero.x, hero.y, speed, dt); m.path = []; return; }
    if (!m.path.length || m.repath < performance.now()) { m.path = findPath(m.x, m.y, hero.x, hero.y, 500) || []; m.repath = performance.now() + 700; }
    if (m.path.length && moveToward(m, m.path[0][0], m.path[0][1], speed, dt)) m.path.shift();
  }
  function smashUrn(u) {
    urns = urns.filter(x => x !== u);
    burst(u.x, u.y, "#c9a6ff", 16, 2.5); sfx("hit");
    if (Math.random() < 0.7) loot.push({ kind: "gold", x: u.x, y: u.y, amount: Math.round(rand(2, 8) * floorNo), bob: 0 });
    else loot.push({ kind: Math.random() < 0.5 ? "hpot" : "mpot", x: u.x, y: u.y, bob: 0 });
  }
  function setMove(wx, wy) {
    hero.target = null;
    const tx = clamp(wx, 0, MAPW - 1), ty = clamp(wy, 0, MAPH - 1);
    const p = findPath(hero.x, hero.y, tx, ty, 2500);
    if (p) { hero.path = p; if (p.length) hero.path[p.length - 1] = [tx, ty].map((v, k) => isFloor(tx, ty) ? v : p[p.length - 1][k]); }
  }

  // ================================================ DRAWING ================================================
  // World (tiles) -> screen. z is height in tiles.
  const isoX = (x, y) => (x - y) * TW / 2, isoY = (x, y, z = 0) => (x + y) * TH / 2 - z * TH * 1.15;
  const sx = (x, y) => (isoX(x, y) - cam.x) * zoom + W / 2, sy = (x, y, z) => (isoY(x, y, z) - cam.y) * zoom + H / 2;
  function toWorld(px, py) {
    const ix = (px - W / 2) / zoom + cam.x, iy = (py - H / 2) / zoom + cam.y;
    return { x: (iy / (TH / 2) + ix / (TW / 2)) / 2, y: (iy / (TH / 2) - ix / (TW / 2)) / 2 };
  }
  const shade = (rgb, k) => `rgb(${rgb.map(c => clamp(Math.round(c * k), 0, 255)).join(",")})`;
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));

  function diamond(x, y, z = 0) {
    ctx.beginPath();
    ctx.moveTo(sx(x, y), sy(x, y, z)); ctx.lineTo(sx(x + 1, y), sy(x + 1, y, z)); ctx.lineTo(sx(x + 1, y + 1), sy(x + 1, y + 1, z)); ctx.lineTo(sx(x, y + 1), sy(x, y + 1, z)); ctx.closePath();
  }
  function drawFloorTile(x, y, now) {
    const v = ((x * 7 + y * 13) % 5) / 40;
    diamond(x, y);
    const isStairs = x === stairs.x && y === stairs.y;
    ctx.fillStyle = isStairs ? (bossAlive ? "#3a1030" : "#2a1450") : `rgb(${Math.round(42 + v * 120)},${Math.round(30 + v * 80)},${Math.round(62 + v * 140)})`;
    ctx.fill();
    ctx.strokeStyle = "rgba(176,77,255,0.18)"; ctx.lineWidth = 1; ctx.stroke();
    if (isStairs) {
      for (let k = 0; k < 4; k++) { diamond(x + 0.12 + k * 0.08, y + 0.12 + k * 0.08, -k * 0.12); ctx.fillStyle = `rgba(${bossAlive ? "120,20,60" : "60,30,120"},${0.5 + k * 0.12})`; ctx.fill(); }
      ctx.globalCompositeOperation = "lighter";
      glowAt(x + 0.5, y + 0.5, 0, 46, bossAlive ? "255,43,214" : "176,120,255", 0.5 + 0.2 * Math.sin(now / 300));
      ctx.globalCompositeOperation = "source-over";
    }
  }
  function drawWall(x, y, fade) {
    const top = [42, 26, 70], left = [30, 18, 52], right = [22, 12, 40];
    ctx.globalAlpha = fade;
    // Right face (towards +x... the face you see on the lower right)
    ctx.beginPath();
    ctx.moveTo(sx(x + 1, y), sy(x + 1, y, 0)); ctx.lineTo(sx(x + 1, y + 1), sy(x + 1, y + 1, 0));
    ctx.lineTo(sx(x + 1, y + 1), sy(x + 1, y + 1, 0) - WALL * zoom); ctx.lineTo(sx(x + 1, y), sy(x + 1, y, 0) - WALL * zoom); ctx.closePath();
    ctx.fillStyle = shade(right, 1); ctx.fill();
    // Left face (lower left)
    ctx.beginPath();
    ctx.moveTo(sx(x, y + 1), sy(x, y + 1, 0)); ctx.lineTo(sx(x + 1, y + 1), sy(x + 1, y + 1, 0));
    ctx.lineTo(sx(x + 1, y + 1), sy(x + 1, y + 1, 0) - WALL * zoom); ctx.lineTo(sx(x, y + 1), sy(x, y + 1, 0) - WALL * zoom); ctx.closePath();
    ctx.fillStyle = shade(left, 1); ctx.fill();
    // Top
    ctx.beginPath();
    ctx.moveTo(sx(x, y), sy(x, y, 0) - WALL * zoom); ctx.lineTo(sx(x + 1, y), sy(x + 1, y, 0) - WALL * zoom);
    ctx.lineTo(sx(x + 1, y + 1), sy(x + 1, y + 1, 0) - WALL * zoom); ctx.lineTo(sx(x, y + 1), sy(x, y + 1, 0) - WALL * zoom); ctx.closePath();
    ctx.fillStyle = shade(top, 1); ctx.fill();
    ctx.strokeStyle = "rgba(255,43,214,0.22)"; ctx.lineWidth = 1; ctx.stroke();
    ctx.globalAlpha = 1;
  }
  function glowAt(x, y, z, r, rgb, a) {
    const px = sx(x, y), py = sy(x, y, z), rr = r * zoom;
    const g = ctx.createRadialGradient(px, py, 0, px, py, rr);
    g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, rr, 0, 6.28); ctx.fill();
  }
  function shadow(x, y, r) { ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.beginPath(); ctx.ellipse(sx(x, y), sy(x, y, 0), r * TW * 0.55 * zoom, r * TH * 0.55 * zoom, 0, 0, 6.28); ctx.fill(); }

  // ---- Characters: a Blender model when one is set, otherwise the built-in figure ----
  const MODEL_CACHE = {};
  function modelFor(slot) {
    if (!(slot in MODEL_CACHE)) {
      const m = window.TenshiModels && window.TenshiModels.get(slot);
      // glTF: x = left, y = up, z = forward. Here: x = forward, y = left, z = up (then turned to face its way).
      MODEL_CACHE[slot] = m ? window.TenshiModels.axes(m, ([x, y, z]) => [z, x, y + m.height / 2]) : null;
    }
    return MODEL_CACHE[slot];
  }
  if (window.TenshiModels) window.TenshiModels.whenReady(() => { for (const k in MODEL_CACHE) delete MODEL_CACHE[k]; });
  const VIEW = (() => { const v = [-1, -1, 1.25], l = Math.hypot(...v); return v.map(c => c / l); })();
  const KEY = (() => { const v = [-0.4, -0.9, 1.4], l = Math.hypot(...v); return v.map(c => c / l); })();
  function drawMesh(mesh, x, y, face, height, flash, tint) {
    const c = Math.cos(face), s = Math.sin(face), k = height / 2;
    const P = mesh.v.map(([fx_, ly, uz]) => { const wx = x + (fx_ * c - ly * s) * k, wy = y + (fx_ * s + ly * c) * k, wz = uz * k; return [wx, wy, wz, sx(wx, wy), sy(wx, wy, wz)]; });
    const faces = [];
    for (const f of mesh.f) {
      const [a, b, d] = f.i.map(i => P[i]);
      let n = [(b[1] - a[1]) * (d[2] - a[2]) - (b[2] - a[2]) * (d[1] - a[1]), (b[2] - a[2]) * (d[0] - a[0]) - (b[0] - a[0]) * (d[2] - a[2]), (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0])];
      const nl = Math.hypot(...n); if (nl < 1e-12) continue; n = n.map(v => v / nl);
      if (n[0] * VIEW[0] + n[1] * VIEW[1] + n[2] * VIEW[2] < 0) continue;
      faces.push({ f, n, depth: (a[0] + b[0] + d[0] + a[1] + b[1] + d[1]) / 3 + (a[2] + b[2] + d[2]) / 3 * 1.2 });
    }
    faces.sort((p, q) => p.depth - q.depth);
    for (const { f, n } of faces) {
      const lit = f.glow ? 1.2 : 0.35 + 0.85 * Math.max(0, n[0] * KEY[0] + n[1] * KEY[1] + n[2] * KEY[2]);
      let rgb = f.rgb.map(v => v * lit);
      if (tint) rgb = rgb.map((v, i) => v * 0.6 + tint[i] * 0.4);
      if (flash > 0.4) rgb = [255, 255, 255];
      const col = `rgb(${rgb.map(v => clamp(Math.round(v), 0, 255)).join(",")})`;
      ctx.beginPath(); f.i.forEach((i, j) => j ? ctx.lineTo(P[i][3], P[i][4]) : ctx.moveTo(P[i][3], P[i][4])); ctx.closePath();
      ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 0.6; ctx.stroke();
    }
  }
  // Built-in figures: shaded, lit shapes with a bit of animation.
  function figure(x, y, opts) {
    const { h = 1, r = 0.3, body = "#9a8cc0", head = "#e8d9ff", eye = null, flash = 0, bob = 0, face = 0, kind = "humanoid" } = opts;
    const px = sx(x, y), base = sy(x, y, 0), u = TH * 1.15 * zoom, w = r * TW * 0.9 * zoom;
    const col = flash > 0.4 ? "#ffffff" : body;
    ctx.save(); ctx.translate(px, base - bob * u);
    const g = ctx.createLinearGradient(-w, 0, w, 0); g.addColorStop(0, shadeHex(col, 1.25)); g.addColorStop(0.55, col); g.addColorStop(1, shadeHex(col, 0.55));
    if (kind === "humanoid") {
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-w * 0.7, 0); ctx.quadraticCurveTo(-w, -h * u * 0.5, -w * 0.55, -h * u * 0.78); ctx.lineTo(w * 0.55, -h * u * 0.78); ctx.quadraticCurveTo(w, -h * u * 0.5, w * 0.7, 0); ctx.closePath(); ctx.fill();
      const hg = ctx.createRadialGradient(-w * 0.15, -h * u * 0.93, 1, 0, -h * u * 0.88, w * 0.6); hg.addColorStop(0, flash > 0.4 ? "#fff" : head); hg.addColorStop(1, shadeHex(flash > 0.4 ? "#ffffff" : head, 0.5));
      ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(0, -h * u * 0.9, w * 0.5, 0, 6.28); ctx.fill();
      if (eye) { ctx.fillStyle = eye; ctx.shadowColor = eye; ctx.shadowBlur = 8; const ex = Math.cos(face) * w * 0.18; ctx.fillRect(ex - w * 0.22, -h * u * 0.93, w * 0.14, w * 0.1); ctx.fillRect(ex + w * 0.08, -h * u * 0.93, w * 0.14, w * 0.1); ctx.shadowBlur = 0; }
    } else if (kind === "blob") {
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, -h * u * 0.4, w, h * u * 0.45, 0, 0, 6.28); ctx.fill();
      if (eye) { ctx.fillStyle = eye; ctx.shadowColor = eye; ctx.shadowBlur = 10; ctx.beginPath(); ctx.arc(-w * 0.3, -h * u * 0.5, w * 0.12, 0, 6.28); ctx.arc(w * 0.3, -h * u * 0.5, w * 0.12, 0, 6.28); ctx.fill(); ctx.shadowBlur = 0; }
    } else if (kind === "golem") {
      ctx.fillStyle = g; ctx.fillRect(-w, -h * u * 0.8, w * 2, h * u * 0.8);
      ctx.fillStyle = shadeHex(col, 1.3); ctx.fillRect(-w * 0.55, -h * u, w * 1.1, h * u * 0.25);
      ctx.fillStyle = "#ffd84a"; ctx.shadowColor = "#ffd84a"; ctx.shadowBlur = 10; ctx.fillRect(-w * 0.35, -h * u * 0.92, w * 0.7, w * 0.12); ctx.shadowBlur = 0;
    }
    ctx.restore();
  }
  const shadeHex = (h, k) => shade(hex(h), k);

  function drawHero(now) {
    const s = stats(), bob = hero.path.length ? Math.abs(Math.sin(hero.walk)) * 0.06 : Math.sin(now / 500) * 0.02;
    shadow(hero.x, hero.y, 0.35);
    const model = modelFor("arpg.hero");
    if (model) drawMesh(model, hero.x, hero.y, hero.face, 1.5, hero.flash);
    else {
      const armor = hero.gear.armor ? hero.gear.armor.color : "#7a6aa8";
      // Cape behind
      const px = sx(hero.x, hero.y), py = sy(hero.x, hero.y, 0), u = TH * 1.15 * zoom;
      ctx.fillStyle = "rgba(255,43,214,0.75)"; ctx.beginPath(); ctx.moveTo(px - 10 * zoom, py - (1.15 + bob) * u); ctx.lineTo(px + 10 * zoom, py - (1.15 + bob) * u); ctx.lineTo(px + 14 * zoom + Math.sin(now / 200) * 2, py - bob * u); ctx.lineTo(px - 14 * zoom, py - bob * u); ctx.closePath(); ctx.fill();
      figure(hero.x, hero.y, { h: 1.45, r: 0.3, body: armor, head: "#f2e4ff", eye: "#8fd8ff", flash: hero.flash, bob, face: hero.face });
    }
    // The weapon: a glowing blade that swings when attacking.
    const wcol = hero.gear.weapon ? hero.gear.weapon.color : "#e8e6f0";
    const px = sx(hero.x, hero.y), py = sy(hero.x, hero.y, 0.85 + bob), a = hero.face + (hero.swing ? (hero.swing - 0.5) * 2.4 : 0.6);
    const ex = px + Math.cos(a - Math.PI / 4) * 30 * zoom, ey = py + Math.sin(a - Math.PI / 4) * 16 * zoom;
    ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.strokeStyle = wcol; ctx.lineWidth = 3 * zoom; ctx.shadowColor = wcol; ctx.shadowBlur = 14;
    if (!model) { ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(ex, ey); ctx.stroke(); }
    ctx.restore();
    if (hero.swing > 0.3) { ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.strokeStyle = `rgba(255,255,255,${hero.swing * 0.6})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, 30 * zoom, hero.face - 1.6, hero.face + 0.4); ctx.stroke(); ctx.restore(); }
  }
  function drawMonster(m, now) {
    const T = m.T, model = modelFor("arpg." + m.type);
    shadow(m.x, m.y, T.r);
    if (m.champion) { ctx.save(); ctx.globalCompositeOperation = "lighter"; glowAt(m.x, m.y, 0.2, 40 * T.r * 3, "255,216,74", 0.35); ctx.restore(); }
    if (m.slow) { ctx.save(); ctx.globalCompositeOperation = "lighter"; glowAt(m.x, m.y, 0.3, 30, "143,216,255", 0.35); ctx.restore(); }
    if (model) drawMesh(model, m.x, m.y, m.face, T.h * 1.1, m.flash);
    else if (m.type === "hollow") figure(m.x, m.y, { h: 1.15, r: 0.3, body: "#5f7a68", head: "#9fd6a8", eye: "#ff6e3a", flash: m.flash, bob: Math.abs(Math.sin(m.walk)) * 0.05, face: m.face });
    else if (m.type === "skitter") {
      const px = sx(m.x, m.y), py = sy(m.x, m.y, 0.25);
      ctx.strokeStyle = m.flash > 0.4 ? "#fff" : "#a03a8a"; ctx.lineWidth = 2 * zoom;
      for (let k = 0; k < 4; k++) for (const sd of [-1, 1]) { const a = m.face + sd * (0.6 + k * 0.45), st = Math.sin(m.walk * 2 + k) * 4; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(a) * 16 * zoom, py + Math.sin(a) * 8 * zoom - 6 * zoom + st); ctx.lineTo(px + Math.cos(a) * 24 * zoom, py + Math.sin(a) * 12 * zoom + 4 * zoom); ctx.stroke(); }
      figure(m.x, m.y, { h: 0.45, r: 0.3, body: "#c2408f", eye: "#ffd84a", flash: m.flash, kind: "blob", bob: 0.12 });
    } else if (m.type === "wisp") {
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      const fl = Math.sin(now / 120 + m.walk);
      glowAt(m.x, m.y, 1 + fl * 0.05, 34, "143,216,255", 0.7);
      glowAt(m.x, m.y, 1 + fl * 0.05, 14, "255,255,255", m.flash > 0.4 ? 1 : 0.8);
      for (let k = 0; k < 4; k++) glowAt(m.x - Math.cos(m.face) * k * 0.12, m.y - Math.sin(m.face) * k * 0.12, 0.85 - k * 0.12, 10 - k * 2, "110,168,255", 0.4);
      ctx.restore();
    } else if (m.type === "golem") figure(m.x, m.y, { h: 1.55, r: 0.48, body: "#6a5a94", kind: "golem", flash: m.flash, bob: Math.abs(Math.sin(m.walk)) * 0.03 });
    else if (m.type === "warden") {
      ctx.save(); ctx.globalCompositeOperation = "lighter"; glowAt(m.x, m.y, 1, 90, "255,43,214", 0.3 + 0.1 * Math.sin(now / 250)); ctx.restore();
      figure(m.x, m.y, { h: 2.2, r: 0.55, body: "#5a1e6e", head: "#2a0c3a", eye: "#ff2bd6", flash: m.flash, bob: Math.sin(now / 400) * 0.03, face: m.face });
      const px = sx(m.x, m.y), py = sy(m.x, m.y, 2.1);
      ctx.strokeStyle = "#ffb36b"; ctx.lineWidth = 3 * zoom;
      for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(px + sd * 8 * zoom, py); ctx.quadraticCurveTo(px + sd * 26 * zoom, py - 10 * zoom, px + sd * 22 * zoom, py - 30 * zoom); ctx.stroke(); }
    }
    // Health bar once hurt; boss bar is in the HUD.
    if (m.hp < m.max && !T.boss) {
      const px = sx(m.x, m.y), py = sy(m.x, m.y, T.h + 0.35), w = 34 * zoom;
      ctx.fillStyle = "rgba(0,0,0,.6)"; ctx.fillRect(px - w / 2, py, w, 4);
      ctx.fillStyle = m.champion ? "#ffd84a" : "#ff4f7a"; ctx.fillRect(px - w / 2, py, w * Math.max(0, m.hp / m.max), 4);
    }
  }
  function drawLoot(l, now) {
    const bob = Math.sin(now / 300 + l.bob) * 0.05;
    if (l.kind === "item") {
      const rgb = hex(l.item.color).join(",");
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      if (l.item.rarity !== "common") {                                     // a beam of light for better loot
        const px = sx(l.x, l.y), py = sy(l.x, l.y, 0), g = ctx.createLinearGradient(px, py, px, py - 120 * zoom);
        g.addColorStop(0, `rgba(${rgb},0.55)`); g.addColorStop(1, `rgba(${rgb},0)`);
        ctx.fillStyle = g; ctx.fillRect(px - 5 * zoom, py - 120 * zoom, 10 * zoom, 120 * zoom);
      }
      glowAt(l.x, l.y, 0.15 + bob, 18, rgb, 0.8); ctx.restore();
      const px = sx(l.x, l.y), py = sy(l.x, l.y, 0.15 + bob);
      ctx.fillStyle = l.item.color; ctx.beginPath(); ctx.moveTo(px, py - 8 * zoom); ctx.lineTo(px + 6 * zoom, py); ctx.lineTo(px, py + 8 * zoom); ctx.lineTo(px - 6 * zoom, py); ctx.closePath(); ctx.fill();
      ctx.font = `700 ${Math.round(11 * zoom)}px Oswald, sans-serif`; ctx.textAlign = "center"; ctx.fillStyle = l.item.color; ctx.fillText(l.item.name, px, py - 14 * zoom); ctx.textAlign = "start";
    } else {
      const col = l.kind === "gold" ? "255,216,74" : l.kind === "hpot" ? "255,110,138" : "110,168,255";
      ctx.save(); ctx.globalCompositeOperation = "lighter"; glowAt(l.x, l.y, 0.1 + bob, 12, col, 0.9); ctx.restore();
      const px = sx(l.x, l.y), py = sy(l.x, l.y, 0.1 + bob);
      ctx.fillStyle = `rgb(${col})`; ctx.beginPath(); ctx.arc(px, py, (l.kind === "gold" ? 4 : 5) * zoom, 0, 6.28); ctx.fill();
    }
  }
  function drawUrn(u) {
    shadow(u.x, u.y, 0.22);
    const px = sx(u.x, u.y), py = sy(u.x, u.y, 0), w = 9 * zoom, h = 18 * zoom;
    const g = ctx.createLinearGradient(px - w, 0, px + w, 0); g.addColorStop(0, "#9b86c8"); g.addColorStop(1, "#3a2a5a");
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(px - w * 0.6, py); ctx.quadraticCurveTo(px - w * 1.3, py - h * 0.6, px - w * 0.5, py - h); ctx.lineTo(px + w * 0.5, py - h); ctx.quadraticCurveTo(px + w * 1.3, py - h * 0.6, px + w * 0.6, py); ctx.closePath(); ctx.fill();
  }
  function drawTorch(t, now) {
    const px = sx(t.x, t.y), py = sy(t.x, t.y, 0) - WALL * zoom * 0.6, fl = Math.sin(now / 90 + t.phase) * 0.5 + Math.sin(now / 37 + t.phase) * 0.3;
    ctx.fillStyle = "#3a2a20"; ctx.fillRect(px - 2, py, 4, 10 * zoom);
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    const g = ctx.createRadialGradient(px, py - 4, 0, px, py - 4, (16 + fl * 3) * zoom); g.addColorStop(0, "rgba(255,230,160,1)"); g.addColorStop(0.4, "rgba(255,140,50,0.7)"); g.addColorStop(1, "rgba(255,80,20,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py - 4, (16 + fl * 3) * zoom, 0, 6.28); ctx.fill(); ctx.restore();
  }

  function draw(now) {
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = "#05020c"; ctx.fillRect(0, 0, W, H);
    if (!grid) return;
    cam.x += (isoX(hero.x, hero.y) - cam.x) * 0.2; cam.y += (isoY(hero.x, hero.y) - cam.y) * 0.2;
    // Which tiles are on screen (a generous box around the hero).
    const span = Math.ceil(Math.max(W, H) / (TH * zoom)) + 4, hx = hero.x | 0, hy = hero.y | 0;
    const x0 = Math.max(0, hx - span), x1 = Math.min(MAPW - 1, hx + span), y0 = Math.max(0, hy - span), y1 = Math.min(MAPH - 1, hy + span);
    // 1. Floors you've seen.
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (grid[idx(x, y)] === 1 && explored[idx(x, y)]) drawFloorTile(x, y, now);
    // 2. Walls, torches, loot, urns, monsters, the hero and shots: sorted back to front.
    const items = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (grid[idx(x, y)] !== 0) continue;
      const near = (xx, yy) => xx >= 0 && yy >= 0 && xx < MAPW && yy < MAPH && grid[idx(xx, yy)] === 1 && explored[idx(xx, yy)];
      if (near(x + 1, y) || near(x - 1, y) || near(x, y + 1) || near(x, y - 1) || near(x + 1, y + 1) || near(x - 1, y - 1) || near(x + 1, y - 1) || near(x - 1, y + 1)) items.push({ d: x + y + 1, draw: () => {
        // Walls between you and the camera turn see-through so you never lose sight of your hero.
        const inFront = (x + y) > (hero.x + hero.y) && Math.abs((x - y) - (hero.x - hero.y)) < 2.5 && (x + y) - (hero.x + hero.y) < 3.5;
        drawWall(x, y, inFront ? 0.3 : 1);
      } });
    }
    const visible = e => Math.hypot(e.x - hero.x, e.y - hero.y) < LIGHT + 0.5 || torches.some(t => Math.hypot(t.x - e.x, t.y - e.y) < 3);
    for (const t of torches) if (explored[idx(t.x | 0, t.y | 0)] || explored[idx((t.x | 0) + 1, t.y | 0)] || explored[idx(t.x | 0, (t.y | 0) + 1)]) items.push({ d: t.x + t.y + 0.9, draw: () => drawTorch(t, now) });
    for (const l of loot) if (explored[idx(l.x | 0, l.y | 0)]) items.push({ d: l.x + l.y, draw: () => drawLoot(l, now) });
    for (const u of urns) if (explored[idx(u.x | 0, u.y | 0)]) items.push({ d: u.x + u.y, draw: () => drawUrn(u) });
    for (const m of monsters) if (visible(m) && explored[idx(m.x | 0, m.y | 0)]) items.push({ d: m.x + m.y, draw: () => drawMonster(m, now) });
    items.push({ d: hero.x + hero.y, draw: () => drawHero(now) });
    for (const s of shots) items.push({ d: s.x + s.y, draw: () => {
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      if (s.kind === "fire") { glowAt(s.x, s.y, 0.7, 26, "255,138,43", 0.9); glowAt(s.x, s.y, 0.7, 9, "255,240,200", 1); }
      else { glowAt(s.x, s.y, 0.8, 18, "143,216,255", 0.9); glowAt(s.x, s.y, 0.8, 6, "255,255,255", 1); }
      ctx.restore();
    } });
    items.sort((a, b) => a.d - b.d).forEach(i => i.draw());
    // 3. Effects: sparks, rings.
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    for (const f of fx) {
      ctx.globalAlpha = Math.max(0, f.life);
      if (f.ring) { ctx.strokeStyle = f.color; ctx.lineWidth = 3 * zoom; ctx.beginPath(); ctx.ellipse(sx(f.x, f.y), sy(f.x, f.y, 0.05), f.r * TW * 0.7 * zoom, f.r * TH * 0.7 * zoom, 0, 0, 6.28); ctx.stroke(); }
      else { ctx.fillStyle = f.color; ctx.fillRect(sx(f.x, f.y), sy(f.x, f.y, f.z), f.size * zoom, f.size * zoom); }
    }
    ctx.restore(); ctx.globalAlpha = 1;
    // 4. Darkness: a light map with holes cut out for the hero's light, the torches and fire.
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.globalCompositeOperation = "source-over"; lctx.fillStyle = state === "play" || state === "dead" || state === "paused" ? "rgba(4,1,12,0.93)" : "rgba(4,1,12,0.6)"; lctx.fillRect(0, 0, light.width, light.height);
    lctx.globalCompositeOperation = "destination-out";
    const hole = (x, y, r, a = 1) => { const px = sx(x, y) / 2, py = sy(x, y, 0.4) / 2, rr = r * TW * 0.8 * zoom / 2; const g = lctx.createRadialGradient(px, py, 0, px, py, rr); g.addColorStop(0, `rgba(0,0,0,${a})`); g.addColorStop(0.6, `rgba(0,0,0,${a * 0.7})`); g.addColorStop(1, "rgba(0,0,0,0)"); lctx.fillStyle = g; lctx.beginPath(); lctx.arc(px, py, rr, 0, 6.28); lctx.fill(); };
    hole(hero.x, hero.y, LIGHT * 1.15);
    for (const t of torches) hole(t.x + 0.6, t.y + 0.6, 3.3 + Math.sin(now / 90 + t.phase) * 0.2, 0.85);
    for (const s of shots) hole(s.x, s.y, s.kind === "fire" ? 2.2 : 1.4, 0.9);
    for (const f of fx) if (f.ring) hole(f.x, f.y, f.r * 2, f.life * 0.8);
    for (const l of loot) if (l.kind === "item" && l.item.rarity !== "common") hole(l.x, l.y, 1.2, 0.6);
    hole(stairs.x + 0.5, stairs.y + 0.5, 2, 0.6);
    ctx.drawImage(light, 0, 0, W, H);
    // 5. Warm torch light and the hero's faint glow on top.
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    for (const t of torches) if (Math.hypot(t.x - hero.x, t.y - hero.y) < 14) glowAt(t.x + 0.6, t.y + 0.6, 0, 130 + Math.sin(now / 90 + t.phase) * 8, "255,120,40", 0.12);
    glowAt(hero.x, hero.y, 0.5, 200, "176,77,255", 0.08);
    ctx.restore();
    // 6. Floating numbers (not darkened).
    for (const n of nums) {
      ctx.globalAlpha = Math.min(1, n.life * 1.5);
      ctx.font = `800 ${Math.round((n.big ? 20 : 14) * zoom)}px Oswald, sans-serif`; ctx.textAlign = "center";
      ctx.fillStyle = "#000"; ctx.fillText(n.text, sx(n.x, n.y) + 1, sy(n.x, n.y, 1.4 + (1 - n.life) * 1.3) + 1);
      ctx.fillStyle = n.color; ctx.fillText(n.text, sx(n.x, n.y), sy(n.x, n.y, 1.4 + (1 - n.life) * 1.3));
    }
    ctx.globalAlpha = 1; ctx.textAlign = "start";
    // Hovered monster / item name at the top.
    drawHoverLabel();
    drawMini();
  }
  function hoverTarget() {
    let best = null, bd = 0.9;
    for (const m of monsters) { const d = Math.hypot(m.x - mouseWorld.x, m.y - mouseWorld.y) - m.T.r * 0.5; if (d < bd && Math.hypot(m.x - hero.x, m.y - hero.y) < LIGHT + 0.5) { bd = d; best = m; } }
    if (!best) for (const u of urns) { const d = Math.hypot(u.x - mouseWorld.x, u.y - mouseWorld.y); if (d < 0.6 && explored[idx(u.x | 0, u.y | 0)]) { best = u; break; } }
    return best;
  }
  function drawHoverLabel() {
    const boss = monsters.find(m => m.T.boss && m.aggro);
    const t = boss || (mouseIn ? hoverTarget() : null);
    if (!t || !t.T) return;
    const w = Math.min(420, W * 0.5), x = (W - w) / 2, y = 64;
    ctx.fillStyle = "rgba(10,4,24,.85)"; ctx.fillRect(x, y, w, 26);
    ctx.fillStyle = t.T.boss ? "#ff2bd6" : t.champion ? "#ffd84a" : "#ff4f7a"; ctx.fillRect(x + 2, y + 2, (w - 4) * Math.max(0, t.hp / t.max), 22);
    ctx.font = "700 13px Oswald, sans-serif"; ctx.textAlign = "center"; ctx.fillStyle = "#fff";
    ctx.fillText((t.champion ? "Champion " : "") + t.T.name.toUpperCase() + " · " + Math.max(0, Math.ceil(t.hp)) + " / " + t.max, W / 2, y + 18); ctx.textAlign = "start";
  }
  function drawMini() {
    const k = mini.width / MAPW;
    mctx.clearRect(0, 0, mini.width, mini.height);
    mctx.fillStyle = "rgba(10,4,24,.6)"; mctx.fillRect(0, 0, mini.width, mini.height);
    for (let y = 0; y < MAPH; y++) for (let x = 0; x < MAPW; x++) if (grid[idx(x, y)] === 1 && explored[idx(x, y)]) { mctx.fillStyle = "rgba(176,120,255,.55)"; mctx.fillRect(x * k, y * k, k + 0.4, k + 0.4); }
    if (explored[idx(stairs.x, stairs.y)]) { mctx.fillStyle = bossAlive ? "#ff2bd6" : "#ffd84a"; mctx.fillRect(stairs.x * k - 2, stairs.y * k - 2, 5, 5); }
    for (const m of monsters) if (Math.hypot(m.x - hero.x, m.y - hero.y) < LIGHT) { mctx.fillStyle = "#ff4f7a"; mctx.fillRect(m.x * k - 1, m.y * k - 1, 3, 3); }
    mctx.fillStyle = "#fff"; mctx.fillRect(hero.x * k - 2, hero.y * k - 2, 4, 4);
  }

  // ================================================ HUD ================================================
  let sheetOpen = false;
  function renderHud() {
    const s = stats();
    const g = (el, v, max) => { el.querySelector("b").style.height = clamp(v / max, 0, 1) * 100 + "%"; el.querySelector("span").textContent = Math.ceil(v) + "/" + max; };
    g($(".arpg-hp"), Math.max(0, hero.hp), s.maxHp); g($(".arpg-mp"), hero.mp, s.maxMp);
    $(".arpg-xp b").style.width = (hero.xp / xpNeed(hero.lvl)) * 100 + "%";
    $(".arpg-floor").textContent = "FLOOR " + floorNo; $(".arpg-gold").textContent = "◆ " + hero.gold; $(".arpg-lvl").textContent = "LV " + hero.lvl;
    $(".arpg-hpn").textContent = hero.potions.hp; $(".arpg-mpn").textContent = hero.potions.mp;
    for (const k of ["fireball", "nova"]) { const b = root.querySelector(`[data-act="${k}"]`); b.style.setProperty("--cd", hero.cds[k] / SKILLS[k].cd); b.classList.toggle("low", hero.mp < SKILLS[k].mana); }
  }
  function renderSheet() {
    const s = stats();
    const slot = k => { const it = hero.gear[k]; return `<div class="arpg-slot"><small>${k}</small>${it ? `<b style="color:${it.color}">${it.name}</b><span>${describe(it)}</span>` : "<span>empty</span>"}</div>`; };
    sheet.innerHTML = `<h4>HERO · LEVEL ${hero.lvl}</h4>
      <div class="arpg-stats"><span>Life <b>${s.maxHp}</b></span><span>Mana <b>${s.maxMp}</b></span><span>Damage <b>${s.dmg}${s.fire ? " +" + s.fire + " fire" : ""}</b></span><span>Armour <b>${s.armor}</b></span><span>Crit <b>${s.crit}%</b></span><span>Speed <b>${Math.round(s.speed / HERO.speed * 100)}%</b></span></div>
      ${["weapon", "armor", "ring", "amulet"].map(slot).join("")}
      <p class="arpg-note">Better gear is equipped as you pick it up; the rest is sold. Deepest floor: ${Math.max(hero.best || 1, floorNo)}.</p>
      <button type="button" class="arpg-close">CLOSE (C)</button>`;
  }
  function toggleSheet(on) { sheetOpen = on === undefined ? !sheetOpen : on; sheet.hidden = !sheetOpen; if (sheetOpen) renderSheet(); }
  sheet.addEventListener("click", e => { if (e.target.closest(".arpg-close")) toggleSheet(false); });
  root.querySelector(".arpg-bar").addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b || state !== "play") return;
    const a = b.dataset.act;
    if (a === "fireball") { const t = nearestVisible(); if (t) castFireball(t.x, t.y); else castFireball(hero.x + Math.cos(hero.face) * 3, hero.y + Math.sin(hero.face) * 3); }
    if (a === "nova") castNova();
    if (a === "hpot") drink("hp");
    if (a === "mpot") drink("mp");
    if (a === "sheet") toggleSheet();
  });
  function nearestVisible() { let best = null, bd = LIGHT; for (const m of monsters) { const d = dist(m, hero); if (d < bd && lineOfSight(hero, m)) { bd = d; best = m; } } return best; }

  // ================================================ INPUT ================================================
  let mouseIn = false;
  function local(e) { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  canvas.addEventListener("contextmenu", e => e.preventDefault());
  canvas.addEventListener("pointermove", e => { const p = local(e); mouseWorld = toWorld(p.x, p.y); mouseIn = true; });
  canvas.addEventListener("pointerleave", () => { mouseIn = false; holdMove = null; });
  canvas.addEventListener("pointerdown", e => {
    if (state !== "play") return;
    const p = local(e); mouseWorld = toWorld(p.x, p.y);
    if (e.button === 2) { castFireball(mouseWorld.x, mouseWorld.y); return; }
    if (e.button !== 0) return;
    canvas.setPointerCapture(e.pointerId);
    const t = hoverTarget();
    if (t) { hero.target = t; hero.path = []; holdMove = null; }
    else { setMove(mouseWorld.x, mouseWorld.y); holdMove = { next: performance.now() + 220 }; }
  });
  canvas.addEventListener("pointerup", () => { holdMove = null; });
  window.addEventListener("keydown", e => {
    if (state !== "play" || !takeover || (e.target.closest && e.target.closest("input, textarea, select"))) return;
    const k = e.key.toLowerCase(), handled = { "1": 1, "2": 1, q: 1, w: 1, c: 1, escape: 1 };
    if (!handled[k]) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (k === "1") castFireball(mouseWorld.x, mouseWorld.y);
    if (k === "2") castNova();
    if (k === "q") drink("hp");
    if (k === "w") drink("mp");
    if (k === "c") toggleSheet();
    if (k === "escape") toggleSheet(false);
  }, true);

  // ================================================ THE GAME WINDOW ================================================
  let takeover = false, scrollBack = 0;
  const canFull = !!(section.requestFullscreen || section.webkitRequestFullscreen);
  function enterWindow() {
    if (takeover) return;
    takeover = true; scrollBack = window.scrollY;
    document.documentElement.classList.add("arpg-takeover");
    fullBtn.hidden = !canFull; exitBtn.hidden = false;
    requestAnimationFrame(resize); setTimeout(resize, 150);
  }
  function leaveWindow() {
    if (!takeover) return;
    takeover = false; fullBtn.hidden = true;
    if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    document.documentElement.classList.remove("arpg-takeover");
    window.scrollTo({ top: scrollBack, behavior: "instant" });
    requestAnimationFrame(resize); setTimeout(resize, 150);
  }
  fullBtn.addEventListener("click", () => {
    if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else { const r = (section.requestFullscreen || section.webkitRequestFullscreen).call(section); if (r && r.catch) r.catch(() => {}); }
  });
  for (const ev of ["fullscreenchange", "webkitfullscreenchange"]) document.addEventListener(ev, () => { fullBtn.textContent = document.fullscreenElement || document.webkitFullscreenElement ? "⤢ EXIT FULLSCREEN" : "⛶ FULLSCREEN"; setTimeout(resize, 80); });
  function showUI(on) { for (const el of [hud, infoEl, mini]) el.hidden = !on; exitBtn.hidden = !(on || takeover); section.classList.toggle("arpg-on", on); if (!on) { toggleSheet(false); tipEl.hidden = true; } }
  function showIntro(html) { if (html) intro.innerHTML = html; intro.hidden = false; showUI(false); }
  function introButtons() {
    const saved = store.get();
    intro.querySelector(".arpg-buttons").innerHTML = saved
      ? `<button type="button" class="arpg-play" data-go="continue">▶ CONTINUE · LV ${saved.lvl} · FLOOR ${saved.floor}</button><button type="button" class="arpg-play arpg-alt" data-go="new">✦ NEW HERO</button>`
      : `<button type="button" class="arpg-play" data-go="new">▶ PLAY UNDERCITY</button>`;
  }
  function start(mode) {
    if (!artGone) { clearTimeout(artTimer); fadeArt(); }
    intro.classList.remove("arpg-intro-cover");
    enterWindow(); resize();
    const saved = store.get();
    if (mode === "continue" && saved) { hero = Object.assign(newHero(), saved, { potions: saved.potions || { hp: 3, mp: 2 } }); floorNo = saved.floor || 1; }
    else if (mode === "retry" && hero) { /* keep the hero, same floor */ }
    else { hero = newHero(); floorNo = 1; }
    const s = stats(); hero.hp = s.maxHp; hero.mp = s.maxMp; hero.cds = { fireball: 0, nova: 0 };
    enterFloor(floorNo);
    cam.x = isoX(hero.x, hero.y); cam.y = isoY(hero.x, hero.y);
    state = "play"; intro.hidden = true; showUI(true); renderHud();
  }
  root.addEventListener("click", e => { const b = e.target.closest(".arpg-play"); if (b) start(b.dataset.go); });
  exitBtn.addEventListener("click", () => {
    if (state === "play") { state = "paused"; save(); }
    leaveWindow();
    showIntro(`<p class="arpg-kicker">PAUSED · FLOOR ${floorNo}</p><h3>Undercity</h3><p>Your hero is saved.</p><div class="arpg-buttons"><button type="button" class="arpg-play" data-go="resume">▶ RESUME</button></div>`);
  });
  intro.addEventListener("click", e => { if (e.target.closest('[data-go="resume"]')) { e.stopPropagation(); enterWindow(); state = "play"; intro.hidden = true; showUI(true); } }, true);

  // The cover art shows for 5 seconds after the section comes into view, then fades to the live game behind the Play button.
  let artGone = false, artTimer = 0;
  const fadeArt = () => { artGone = true; root.querySelector(".arpg-art").classList.add("is-faded"); };
  new IntersectionObserver(es => { onScreen = es[0].isIntersecting; if (onScreen && !artGone && !artTimer) artTimer = setTimeout(fadeArt, 5000); }, { threshold: 0.3 }).observe(section);
  let last = performance.now(), hudAt = 0, attract = null, artReady = false;
  { const probe = new Image(); probe.onload = () => { artReady = true; }; probe.src = (document.querySelector('script[src*="neon-arpg.js"]')?.src || "").replace(/neon-arpg\.js.*$/, "art/undercity-small.webp"); }
  function loop(now) {
    const dt = Math.min(50, now - last); last = now;
    if (onScreen && W) {
      if (state === "play" && hero) { update(dt); if (now > hudAt) { renderHud(); hudAt = now + 100; } draw(now); }
      else if (artReady && !artGone) { /* the cover art is showing */ }
      else if (hero && grid) draw(now);
      else drawAttract(now);
    }
    requestAnimationFrame(loop);
  }
  // Before playing: a quiet, slowly drifting view of a crypt behind the title card.
  function drawAttract(now) {
    if (!attract) { hero = newHero(); genFloor(1); hero.x = startPos.x; hero.y = startPos.y; explored.fill(1); attract = true; cam.x = isoX(hero.x, hero.y); cam.y = isoY(hero.x, hero.y); }
    hero.x = startPos.x + Math.sin(now / 6000) * 4; hero.y = startPos.y + Math.cos(now / 7000) * 4;
    if (!isFloor(hero.x, hero.y)) { hero.x = startPos.x; hero.y = startPos.y; }
    draw(now);
  }
  resize(); introButtons();
  requestAnimationFrame(loop);
  // Test hook.
  window.neonARPG = { render: () => draw(performance.now()), state: () => ({ state, floor: floorNo, lvl: hero && hero.lvl, hp: hero && Math.round(hero.hp), gold: hero && hero.gold, monsters: monsters.length, loot: loot.length, gear: hero && Object.values(hero.gear).map(i => i.name) }),
    start, step: ms => { for (let t = 0; t < ms && state === "play"; t += 16) update(16); renderHud(); }, give: n => { hero.gold += n; }, item: () => { const it = makeItem(5, 0.5); loot.push({ kind: "item", item: it, x: hero.x + 0.3, y: hero.y, bob: 0 }); return it.name; }, stairs: () => { bossAlive = false; hero.x = stairs.x + 0.5; hero.y = stairs.y + 0.5; }, nearest: () => { const m = nearestVisible(); return m && { type: m.type, x: m.x, y: m.y }; }, attack: () => { const m = monsters.reduce((b, m) => !b || dist(m, hero) < dist(b, hero) ? m : b, null); if (m) { hero.target = m; } return m && m.type; } };
})();
