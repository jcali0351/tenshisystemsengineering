// neon-arpg.js: "UNDERCITY", an isometric action-RPG dungeon crawler in the "Built, then made better" photo strip.
// The story: you are Tenshi, an angel sent down through the nine circles of Hell (after Dante's Inferno). Call on God,
// cast down Satan on the last floor (Cocytus, the frozen lake) and transcend. Bible verses are from the King James Version.
//
// Descend through neon crypts under Osaka: click to walk and to attack, right-click to throw a Fireball, 2 for Frost
// Nova, Q / W for health and mana potions, C for your character sheet, E for the Power of God (when Holy Power is full), R for the Archangel (when Holy Gospel is full), 3 / 4 / 5 for the Houses of Abraham, Isaac and Jacob, mouse wheel / + - keys / + - buttons / pinch to zoom. Monsters drop gold, potions and gear in four
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
    skitter: { name: "Lava Spider", hp: 16, dmg: 3,  speed: 3.4, reach: 1.0, every: 650,  xp: 8,  color: "#ff6ec7", r: 0.28, h: 1.1, weight: 4 },
    wisp:    { name: "Wisp",    hp: 22, dmg: 5,  speed: 2.4, reach: 5.5, every: 1500, xp: 14, color: "#8fd8ff", r: 0.26, h: 1.1, weight: 3, ranged: true },
    wizard:  { name: "Evil Wizard", hp: 34, dmg: 5, speed: 2.0, reach: 1.2, every: 1100, xp: 15, color: "#b06bff", r: 0.32, h: 1.1, weight: 5 },
    elf:     { name: "Green Elf", hp: 22, dmg: 4, speed: 2.9, reach: 1.0, every: 800, xp: 10, color: "#7dff7a", r: 0.28, h: 0.9, weight: 5 },
    golem:   { name: "Golem",   hp: 110, dmg: 12, speed: 1.4, reach: 1.3, every: 1500, xp: 40, color: "#c9a6ff", r: 0.5, h: 1.5, weight: 3 },
    satan:   { name: "Satan", hp: 2600, dmg: 40, speed: 2.0, reach: 1.9, every: 1200, xp: 1500, color: "#ff3b1f", r: 0.9, h: 3.0, weight: 0, boss: true },
    warden:  { name: "The Warden", hp: 700, dmg: 24, speed: 1.9, reach: 1.6, every: 1300, xp: 300, color: "#ff2bd6", r: 0.7, h: 2.2, weight: 0, boss: true },
  };
  const RARITY = [
    { id: "common", name: "Common", color: "#e8e6f0", chance: 0.58, mult: 1, affixes: 0 },
    { id: "magic", name: "Magic", color: "#6ea8ff", chance: 0.28, mult: 1.35, affixes: 1 },
    { id: "rare", name: "Rare", color: "#ffd84a", chance: 0.115, mult: 1.8, affixes: 2 },
    { id: "legendary", name: "Legendary", color: "#ff8a2b", chance: 0.025, mult: 2.6, affixes: 3 },
  ];
  TUNE(HERO, CFG.hero); TUNE(SKILLS, CFG.skills); TUNE(MONSTERS, CFG.monsters);
  // Your own enemy types from Game Studio > New enemies: each uses the 3D model in its slot "arpg.custom.<id>".
  for (const c of Array.isArray(CFG.custom) ? CFG.custom : []) {
    if (!c || !c.id || c.enabled === false) continue;
    const num0 = (v, d) => (typeof v === "number" && isFinite(v) ? v : d), size = Math.max(0.4, num0(c.size, 1.2));
    MONSTERS["custom." + c.id] = { name: String(c.name || "Monster").slice(0, 40), hp: num0(c.hp, 30), dmg: num0(c.dmg, 5), speed: num0(c.speed, 2),
      reach: num0(c.reach, c.ranged ? 5 : 1.1), every: num0(c.every, 1100), xp: num0(c.xp, 14), color: c.color || "#ff6ec7",
      r: Math.min(0.7, 0.18 + size * 0.12), h: size, weight: num0(c.weight, 3), fromFloor: num0(c.fromFloor, 1), ranged: !!c.ranged, custom: true };
  }
  // Holy Power: fills as you fight (per hit landed, per kill). At 100% a POWER OF GOD button pops up (or press E): it
  // instantly slays every enemy you can see.
  const HOLY = { perHit: 0.8, perKill: 6, perChampion: 14, perBoss: 30 };
  TUNE(HOLY, CFG.holy);
  // Holy Gospel: fills when you take damage, kill, and go deeper. At 100% the ARCHANGEL button pops up (or press R):
  // Gabriel appears for a while, shields the hero from all damage and strikes down the nearest enemies with light.
  const GOSPEL = { perDamageTaken: 0.6, perKill: 3, perFloor: 20, seconds: 10, strikeEvery: 550, radius: 7.5, bossDamage: 0.2 };
  TUNE(GOSPEL, CFG.gospel);
  // The Houses of the patriarchs (keys 3, 4, 5): unlock at a hero level, then recharge on a cooldown (seconds).
  const HOUSES = {
    abraham: { level: 3, cooldown: 20, damage: 3, goldBonus: 2 },          // Covenant of Stars: starlight on every enemy in sight
    isaac: { level: 6, cooldown: 45, ramSeconds: 30 },                      // Jehovah-Jireh: full heal + mana, a ram takes a deadly blow
    jacob: { level: 9, cooldown: 60, seconds: 15, spirits: 12, damageBoost: 2 },   // Jacob's Ladder: 12 tribe spirits, double damage
  };
  TUNE(HOUSES, CFG.houses);
  // Names and health bars over the enemies (Game Studio > Undercity > Enemy labels).
  const LABELS = { healthBars: true, onlyWhenHurt: false, names: true, nameSize: 12, barWidth: 40, barHeight: 5,
    barColor: "#ff4f7a", championColor: "#ffd84a", nameColor: "#f2e4ff", championNameColor: "#ffd84a",
    heroLabel: true, heroName: "Tenshi", heroNameColor: "#ffe9a0", heroLevelColor: "#9fd8ff" };
  TUNE(LABELS, CFG.labels);
  for (const r of RARITY) TUNE(r, (CFG.rarity || {})[r.id]);
  // How many monsters: per room (more every 2 floors, up to a limit), and how often a Warden boss floor comes.
  const ENEMIES = { perRoomMin: 2, perRoomMax: 3, extraEveryTwoFloors: 1, extraMax: 4, bossEvery: 3, golemFromFloor: 1, startEase: 0.3, easeFloors: 3 };
  TUNE(ENEMIES, CFG.enemies);
  // Hell: the nine circles (Dante), Satan on the last floor, embers and lava pools (Game Studio > Undercity > hell).
  const HELL = { finalFloor: 9, embers: true, lavaPools: 0.05, verses: true, bossIntro: { enabled: true, seconds: 2.5 } };
  TUNE(HELL, CFG.hell);
  const CIRCLES = [
    ["LIMBO", "Abandon all hope, ye who enter here. · Dante, Inferno III"],
    ["LUST", "Create in me a clean heart, O God. · Psalm 51:10"],
    ["GLUTTONY", "Man shall not live by bread alone. · Matthew 4:4"],
    ["GREED", "The love of money is the root of all evil. · 1 Timothy 6:10"],
    ["WRATH", "Be ye angry, and sin not. · Ephesians 4:26"],
    ["HERESY", "Thy word is a lamp unto my feet, and a light unto my path. · Psalm 119:105"],
    ["VIOLENCE", "Blessed are the peacemakers. · Matthew 5:9"],
    ["FRAUD", "Ye shall know the truth, and the truth shall make you free. · John 8:32"],
  ];
  const isFinal = n => n >= Math.max(1, HELL.finalFloor);
  const circleOf = n => isFinal(n) ? ["TREACHERY · COCYTUS", "How art thou fallen from heaven, O Lucifer, son of the morning! · Isaiah 14:12"] : CIRCLES[(n - 1) % CIRCLES.length];
  const ROMAN = n => ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"][n - 1] || String(n);
  const bossFloor = n => isFinal(n) || (ENEMIES.bossEvery > 0 && n % ENEMIES.bossEvery === 0);
  // Gear = holy relics and Christian artifacts (Ephesians 6: the armour of God).
  const BASES = {
    weapon: ["Flaming Sword", "Two-Edged Sword", "Holy Lance", "Shepherd's Staff", "Sling"],
    armor: ["Breastplate", "Holy Vestment", "Sackcloth Robe", "Mantle", "Chain Cassock"],
    ring: ["Signet", "Covenant Band", "Fisherman's Ring"],
    amulet: ["Crucifix", "Rosary", "Reliquary", "Ichthys Pendant", "Phylactery"],
  };
  const AFFIXES = [
    { id: "dmg", label: "+{n} damage", pre: "Righteous", suf: "of Judgment" },
    { id: "life", label: "+{n} life", pre: "Blessed", suf: "of Lazarus" },
    { id: "mana", label: "+{n} mana", pre: "Prayerful", suf: "of the Psalms" },
    { id: "armor", label: "+{n} armour", pre: "Steadfast", suf: "of Faith" },
    { id: "crit", label: "+{n}% critical hits", pre: "Smiting", suf: "of David" },
    { id: "fire", label: "+{n} holy fire damage", pre: "Pentecostal", suf: "of the Burning Bush" },
    { id: "speed", label: "+{n}% move speed", pre: "Swift", suf: "of Elijah" },
  ];
  // Legendary relics have names of their own.
  const LEGENDARY = {
    weapon: ["Michael's Flaming Sword", "The Spear of Destiny", "Rod of Moses", "Jawbone of Samson", "Sword of the Spirit"],
    armor: ["The Armour of God", "Mantle of Elijah", "Breastplate of Righteousness", "Coat of Many Colours"],
    ring: ["Seal of Solomon", "Ring of the Prodigal Son", "Signet of the Fisherman"],
    amulet: ["Crown of Thorns", "The Holy Grail", "Shard of the Ark", "Shield of Faith"],
  };
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
    <div class="arpg-zoom" hidden><button type="button" data-zoom="in" aria-label="Zoom in" title="Zoom in (+ or mouse wheel)">+</button><button type="button" data-zoom="out" aria-label="Zoom out" title="Zoom out (-)">−</button></div>
    <div class="arpg-hud" hidden>
      <div class="arpg-gauge arpg-hp"><b></b><span></span></div>
      <div class="arpg-bar">
        <button type="button" data-act="fireball" title="Fireball (right-click or 1)"><i>1</i>🔥<small>Fireball</small></button>
        <button type="button" data-act="nova" title="Frost Nova (2)"><i>2</i>❄<small>Nova</small></button>
        <button type="button" data-act="abraham" class="arpg-house" title="House of Abraham: Covenant of Stars (3)"><i>3</i>★<small>Abraham</small></button>
        <button type="button" data-act="isaac" class="arpg-house" title="House of Isaac: Jehovah-Jireh (4)"><i>4</i>♈<small>Isaac</small></button>
        <button type="button" data-act="jacob" class="arpg-house" title="House of Jacob: Jacob's Ladder (5)"><i>5</i>⇡<small>Jacob</small></button>
        <button type="button" data-act="hpot" title="Holy water (Q)"><i>Q</i>❤<small class="arpg-hpn">0</small></button>
        <button type="button" data-act="mpot" title="Manna (W)"><i>W</i>✦<small class="arpg-mpn">0</small></button>
        <button type="button" data-act="sheet" title="Character (C)"><i>C</i>☰<small>Hero</small></button>
      </div>
      <div class="arpg-gauge arpg-mp"><b></b><span></span></div>
      <div class="arpg-xp"><b></b></div>
      <div class="arpg-holy" title="Holy Power: fills as you fight. At 100% the Power of God is ready."><b></b><span>HOLY POWER 0%</span></div>
      <div class="arpg-gospel" title="Holy Gospel: fills when you take damage, kill and go deeper. At 100% the Archangel is ready."><b></b><span>HOLY GOSPEL 0%</span></div>
      <div class="arpg-pops">
        <button type="button" class="arpg-godbtn" hidden title="Power of God (E): slays every enemy you can see">✝ POWER OF GOD <i>E</i></button>
        <button type="button" class="arpg-angelbtn" hidden title="Archangel (R): Gabriel shields you and strikes down your enemies">✦ ARCHANGEL <i>R</i></button>
      </div>
    </div>
    <div class="arpg-sheet" hidden></div>
    <div class="arpg-tip" hidden></div>
    <div class="arpg-msg" aria-live="polite"></div>
    <div class="arpg-verse" aria-live="polite"></div>
    <div class="arpg-intro arpg-intro-cover">
      <p class="arpg-kicker">UNDERCITY · AN ANGEL IN HELL</p>
      <h3>Call on God. Cast down Satan. Transcend.</h3>
      <p>You are Tenshi, an angel sent through the nine circles of Hell. Fight down through fire and ice, gather holy relics, call on the Power of God and the Archangel Gabriel, and rise above it all.</p>
      <div class="arpg-buttons"></div>
      <p class="arpg-help">Click to move &amp; attack · Right-click Fireball · 2 Frost Nova · Q/W potions · C hero · E Power of God · R Archangel · 3/4/5 Houses of Abraham, Isaac, Jacob · Wheel or +/− to zoom</p>
    </div>`;
  section.appendChild(root);
  const canvas = root.querySelector(".arpg-canvas"), ctx = canvas.getContext("2d");
  const mini = root.querySelector(".arpg-mini"), mctx = mini.getContext("2d");
  const $ = s => root.querySelector(s);
  const intro = $(".arpg-intro"), hud = $(".arpg-hud"), sheet = $(".arpg-sheet"), msgEl = $(".arpg-msg"), tipEl = $(".arpg-tip");
  const exitBtn = $(".arpg-exit"), fullBtn = $(".arpg-full"), infoEl = $(".arpg-info");
  const light = document.createElement("canvas"), lctx = light.getContext("2d");

  let W = 0, H = 0, zoom = 1, ratio = 1, baseZoom = 1;
  // Zoom: the screen-size zoom times your own zoom (wheel, + / - keys, the buttons, pinch), remembered in this browser.
  const ZOOM_MIN = 0.55, ZOOM_MAX = 2.2;
  let userZoom = 1;
  try { userZoom = clamp(parseFloat(localStorage.getItem("tenshi-arpg-zoom")) || 1, ZOOM_MIN, ZOOM_MAX); } catch (e) { /* storage blocked */ }
  function zoomBy(f) {
    userZoom = clamp(userZoom * f, ZOOM_MIN, ZOOM_MAX); zoom = baseZoom * userZoom;
    try { localStorage.setItem("tenshi-arpg-zoom", String(userZoom)); } catch (e) { /* storage blocked */ }
  }
  function resize() {
    const r = root.getBoundingClientRect();
    ratio = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * ratio); canvas.height = Math.round(H * ratio);
    light.width = Math.round(W / 2); light.height = Math.round(H / 2);      // half-size light map: soft and cheap
    baseZoom = W < 760 ? 0.8 : clamp(W / 1400, 0.85, 1.3); zoom = baseZoom * userZoom;
  }
  window.addEventListener("resize", resize);

  // ================================================ STATE ================================================
  let grid, explored, rooms, torches, stairs, startPos, floorNo = 1;
  let monsters = [], loot = [], urns = [], shots = [], fx = [], nums = [];
  let hero = null, state = "intro", onScreen = false, bossAlive = false;
  const cam = { x: 0, y: 0 };
  let bossIntro = null;   // cinematic boss intro: { m, t0, dur, ice }
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
    if (rar.id === "legendary") name = pick(LEGENDARY[slot]);
    return { slot, base, name, rarity: rar.id, color: rar.color, stats, level, power: Object.entries(stats).reduce((t, [k, v]) => t + v * (k === "dmg" || k === "fire" ? 2 : k === "crit" || k === "speed" ? 1.5 : 1), 0) };
  }
  const describe = it => Object.entries(it.stats).map(([k, v]) => AFFIXES.find(a => a.id === k).label.replace("{n}", v)).join(" · ");

  // ---- The hero ----
  function newHero() {
    return { x: 0, y: 0, lvl: 1, xp: 0, gold: 0, hp: 80, mp: 40, gear: {}, potions: { hp: 3, mp: 2 }, holy: 0, gospel: 0, path: [], target: null, atkCd: 0, cds: { fireball: 0, nova: 0, abraham: 0, isaac: 0, jacob: 0 }, face: 0, walk: 0, swing: 0, flash: 0, best: 1 };
  }
  function stats() {
    const g = Object.values(hero.gear), sum = k => g.reduce((t, it) => t + (it.stats[k] || 0), 0);
    return {
      maxHp: 70 + hero.lvl * 12 + sum("life"), maxMp: 34 + hero.lvl * 6 + sum("mana"),
      dmg: Math.round((6 + hero.lvl * 2 + sum("dmg")) * (house.jacobUntil > performance.now() ? HOUSES.jacob.damageBoost : 1)), fire: sum("fire"), armor: sum("armor"), crit: 5 + sum("crit"),
      speed: HERO.speed * (1 + sum("speed") / 100),
    };
  }
  const xpNeed = lvl => Math.round(60 * Math.pow(lvl, 1.55));
  function save() { store.set({ lvl: hero.lvl, xp: hero.xp, gold: hero.gold, gear: hero.gear, potions: hero.potions, ascensions: hero.ascensions || 0, holy: Math.floor(hero.holy || 0), gospel: Math.floor(hero.gospel || 0), floor: floorNo, best: Math.max(hero.best || 1, floorNo) }); }

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
    if (bossFloor(n)) { spawnMonster(isFinal(n) ? "satan" : "warden", last.cx + 0.5, last.cy - 1.5, n); bossAlive = true; }
  }
  function pickMonster(n) {
    const list = Object.entries(MONSTERS).filter(([k, m]) => m.weight && !m.boss && (k !== "golem" || n >= (ENEMIES.golemFromFloor ?? 1)) && (!m.fromFloor || n >= m.fromFloor));
    const total = list.reduce((t, [, m]) => t + m.weight, 0);
    let r = Math.random() * total;
    for (const [k, m] of list) { r -= m.weight; if (r <= 0) return k; }
    return "hollow";
  }
  function spawnMonster(type, x, y, n) {
    // Easier start: enemies have startEase (30%) less health and damage on floor 1, back to full by floor 1 + easeFloors.
    const ease = 1 - Math.max(0, 1 - (n - 1) / Math.max(1, ENEMIES.easeFloors)) * ENEMIES.startEase;
    const T = MONSTERS[type], scale = (1 + (n - 1) * 0.32) * (1 + 0.5 * ((hero && hero.ascensions) || 0)) * ease;
    const champion = !T.boss && Math.random() < 0.08 + n * 0.01;
    monsters.push({ type, T, x, y, hp: Math.round(T.hp * scale * (champion ? 2.2 : 1)), max: Math.round(T.hp * scale * (champion ? 2.2 : 1)), dmg: Math.max(1, Math.round(T.dmg * (1 + (n - 1) * 0.2) * (champion ? 1.4 : 1) * ease)), champion, cd: rand(0, 800), face: 0, walk: rand(0, 6), flash: 0, slow: 0, aggro: false, path: [], repath: 0, home: { x, y } });
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
  // A Bible verse or Dante line under the big message (Game Studio > Undercity > hell > verses).
  function verse(text, ms = 5000) {
    const el = root.querySelector(".arpg-verse"); if (!el || !HELL.verses) return;
    el.textContent = text; el.classList.add("on"); clearTimeout(verse.t); verse.t = setTimeout(() => el.classList.remove("on"), ms);
  }
  function say(text, ms = 1800, color) { msgEl.textContent = text; msgEl.style.color = color || ""; msgEl.classList.add("on"); clearTimeout(say.t); say.t = setTimeout(() => msgEl.classList.remove("on"), ms); }
  function num(x, y, text, color, big) { nums.push({ x, y, text: String(text), color, life: 1, big }); }
  function burst(x, y, color, n = 14, speed = 3, z = 0.6) { for (let k = 0; k < n; k++) { const a = rand(0, 6.28), v = rand(0.5, 1) * speed; fx.push({ x, y, z, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: rand(1, 4), life: 1, color, size: rand(2, 4) }); } }

  function hurtMonster(m, amount, color = "#ffffff", crit = false) {
    if (m.hp <= 0) return;
    m.hp -= amount; m.flash = 1; m.aggro = true; m.hitAt = performance.now();
    gainHoly(HOLY.perHit);
    num(m.x, m.y, Math.round(amount) + (crit ? "!" : ""), crit ? "#ffd84a" : color, crit);
    burst(m.x, m.y, m.T.color, crit ? 14 : 7, 2.5);
    if (m.hp <= 0) killMonster(m);
  }
  function killMonster(m) {
    monsters = monsters.filter(x => x !== m);
    gainHoly(m.T.boss ? HOLY.perBoss : m.champion ? HOLY.perChampion : HOLY.perKill);
    if (!angelOn()) gainGospel(GOSPEL.perKill);
    burst(m.x, m.y, m.T.color, m.T.boss ? 60 : 22, m.T.boss ? 6 : 3.5);
    sfx(m.T.boss ? "bigboom" : "hit");
    gainXp(Math.round(m.T.xp * (1 + (floorNo - 1) * 0.25) * (m.champion ? 2.5 : 1)));
    // Drops
    if (m.covenant) for (let k = 0; k < HOUSES.abraham.goldBonus; k++) loot.push({ kind: "gold", x: m.x + rand(-0.5, 0.5), y: m.y + rand(-0.5, 0.5), amount: Math.round(rand(4, 14) * floorNo), bob: rand(0, 6) });   // the covenant blessing
    if (Math.random() < 0.6 || m.T.boss) loot.push({ kind: "gold", x: m.x + rand(-0.3, 0.3), y: m.y + rand(-0.3, 0.3), amount: Math.round(rand(3, 12) * floorNo * (m.T.boss ? 12 : m.champion ? 3 : 1)), bob: rand(0, 6) });
    if (Math.random() < 0.13) loot.push({ kind: Math.random() < 0.6 ? "hpot" : "mpot", x: m.x + rand(-0.4, 0.4), y: m.y + rand(-0.4, 0.4), bob: rand(0, 6) });
    const itemChance = m.T.boss ? 3 : m.champion ? 1 : 0.17;
    for (let k = 0; k < Math.floor(itemChance) + (Math.random() < itemChance % 1 ? 1 : 0); k++)
      loot.push({ kind: "item", item: makeItem(floorNo + hero.lvl / 2, m.T.boss ? 0.6 : m.champion ? 0.3 : 0), x: m.x + rand(-0.6, 0.6), y: m.y + rand(-0.6, 0.6), bob: rand(0, 6) });
    if (m.T.boss) {
      bossAlive = false;
      if (m.type === "satan") { say("SATAN IS CAST DOWN · THE GATE OF LIGHT IS OPEN", 4200, "#fff3c4"); verse("And the great dragon was cast out, that old serpent, called the Devil, and Satan. · Revelation 12:9", 7000); godAt = performance.now(); }
      else say(m.T.name.toUpperCase() + " FALLS · THE WAY DOWN IS OPEN", 3200, "#ff9a5a");
    }
  }
  // ---- Holy Power and the Power of God ----
  let godBusy = false, godAt = -1e9, beams = [];
  function gainHoly(n) {
    if (godBusy || !hero) return;
    const was = hero.holy || 0; hero.holy = Math.min(100, was + n);
    if (was < 100 && hero.holy >= 100) { say("HOLY POWER FULL · POWER OF GOD READY (E)", 3200, "#ffe9a0"); sfx("achievement"); renderHud(); }
  }
  // Enemies you can see: on screen, in your light (or a torch's) and in explored ground.
  function seenMonsters() {
    return monsters.filter(m => {
      const px = sx(m.x, m.y), py = sy(m.x, m.y, 0.5);
      const lit = Math.hypot(m.x - hero.x, m.y - hero.y) < LIGHT + 0.5 || torches.some(t => Math.hypot(t.x - m.x, t.y - m.y) < 3);
      return px > -40 && px < W + 40 && py > -60 && py < H + 60 && lit && explored[idx(m.x | 0, m.y | 0)];
    });
  }
  function powerOfGod() {
    if (state !== "play") return;
    if ((hero.holy || 0) < 100) return say("Holy Power " + Math.floor(hero.holy || 0) + "% · keep fighting to fill it", 1200, "#ffe9a0");
    const targets = seenMonsters();
    if (!targets.length) return say("No enemies in sight · save it for the fight", 1400, "#ffe9a0");
    hero.holy = 0; const now = performance.now(); godAt = now;
    say("✝ POWER OF GOD ✝", 2800, "#fff3c4"); sfx("bigboom"); verse("Be still, and know that I am God. · Psalm 46:10", 4500);
    for (let k = 0; k < 4; k++) fx.push({ ring: true, x: hero.x, y: hero.y, r: 0.3 + k * 0.5, grow: 9, life: 1, color: k % 2 ? "#ffe9a0" : "#ffffff" });
    targets.forEach((m, i) => beams.push({ x: m.x, y: m.y, t0: now + Math.min(i, 12) * 45 }));
    godBusy = true;
    for (const m of targets) { m.hp = 0; num(m.x, m.y, "✝", "#fff3c4", true); killMonster(m); }
    godBusy = false;
    save(); renderHud();
  }
  // ---- The Houses of Abraham, Isaac and Jacob ----
  let house = { ramUntil: 0, jacobUntil: 0, ladderAt: -1e9, spirits: [] };
  function houseReady(k) {
    const H = HOUSES[k], names = { abraham: "House of Abraham", isaac: "House of Isaac", jacob: "House of Jacob" };
    if (state !== "play") return false;
    if (hero.lvl < H.level) { say(names[k] + " unlocks at level " + H.level, 1500, "#ffe9a0"); return false; }
    if (hero.cds[k] > 0) { say(names[k] + " returns in " + Math.ceil(hero.cds[k] / 1000) + " s", 1000, "#ffe9a0"); return false; }
    hero.cds[k] = H.cooldown * 1000; hero.atkAt = performance.now(); return true;
  }
  function houseAbraham() {
    if (!houseReady("abraham")) return;
    const targets = seenMonsters(), now = performance.now(), dmg = stats().dmg * HOUSES.abraham.damage;
    say("★ HOUSE OF ABRAHAM · COVENANT OF STARS ★", 2600, "#fff3c4"); sfx("bigboom");
    verse("I will multiply thy seed as the stars of the heaven. · Genesis 22:17", 5000);
    targets.forEach((m, i) => { beams.push({ x: m.x, y: m.y, t0: now + i * 70 }); m.covenant = true; });
    for (const m of targets) { num(m.x, m.y, "★", "#fff3c4", true); hurtMonster(m, Math.round(dmg * rand(0.9, 1.1)), "#fff3c4", true); }
    for (let k = 0; k < 40; k++) fx.push({ x: hero.x + rand(-6, 6), y: hero.y + rand(-6, 6), z: rand(2, 6), vx: 0, vy: 0, vz: -rand(2, 5), life: rand(0.6, 1.2), color: Math.random() < 0.5 ? "#fff3c4" : "#ffd84a", size: rand(2, 4) });
    renderHud();
  }
  function houseIsaac() {
    if (!houseReady("isaac")) return;
    const s = stats(); hero.hp = s.maxHp; hero.mp = s.maxMp;
    house.ramUntil = performance.now() + HOUSES.isaac.ramSeconds * 1000;
    say("♈ HOUSE OF ISAAC · JEHOVAH-JIREH ♈", 2600, "#fff3c4"); sfx("power");
    verse("God will provide himself a lamb. · Genesis 22:8", 5000);
    burst(hero.x, hero.y, "#fff3c4", 24, 2); fx.push({ ring: true, x: hero.x, y: hero.y, r: 0.3, grow: 3, life: 1, color: "#fff3c4" });
    renderHud();
  }
  function houseJacob() {
    if (!houseReady("jacob")) return;
    const now = performance.now(), H = HOUSES.jacob;
    house.jacobUntil = now + H.seconds * 1000; house.ladderAt = now;
    house.spirits = [];
    for (let k = 0; k < H.spirits; k++) { const a = k / H.spirits * 6.283; house.spirits.push({ x: hero.x + Math.cos(a) * 1.2, y: hero.y + Math.sin(a) * 1.2, face: a, walk: 0, cd: rand(0, 600), born: now + k * 90 }); }
    say("⇡ HOUSE OF JACOB · JACOB'S LADDER ⇡", 2800, "#fff3c4"); sfx("achievement");
    verse("A ladder set up on the earth, and the top of it reached to heaven. · Genesis 28:12", 5200);
    setTimeout(() => { if (house.jacobUntil > performance.now()) verse("I will not let thee go, except thou bless me. · Genesis 32:26", 4500); }, 5600);
    renderHud();
  }
  // The twelve tribe spirits: each runs to the nearest enemy in sight and strikes it; otherwise it circles the hero.
  function updateSpirits(dt, now) {
    if (!house.spirits.length) return;
    if (now > house.jacobUntil) { for (const s of house.spirits) burst(s.x, s.y, "#fff3c4", 6, 1.5); house.spirits = []; return; }
    const seen = seenMonsters(), dmg = stats().dmg * 0.6;
    house.spirits.forEach((s, i) => {
      if (now < s.born) return;
      s.cd = Math.max(0, s.cd - dt);
      let t = null, bd = 8; for (const m of seen) { const d = Math.hypot(m.x - s.x, m.y - s.y); if (d < bd) { bd = d; t = m; } }
      if (t) {
        if (bd > 0.9) moveToward(s, t.x, t.y, 4.6, dt);
        else { s.face = Math.atan2(t.y - s.y, t.x - s.x); if (!s.cd) { s.cd = 700; s.hit = now; hurtMonster(t, Math.round(dmg * rand(0.85, 1.15)), "#fff3c4"); } }
      } else {
        const a = now / 1400 + i / house.spirits.length * 6.283; moveToward(s, hero.x + Math.cos(a) * 1.6, hero.y + Math.sin(a) * 1.6, 4.6, dt);
      }
    });
  }
  function drawHouses(now) {
    const S = HERO_SPRITE, img = HERO_ANIMS.walk.img, ok = img.complete && img.naturalWidth;
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    // Jacob's ladder: a shaft of light with rungs, from heaven down to the hero (first 2 seconds).
    const lt = (now - house.ladderAt) / 2000;
    if (lt >= 0 && lt < 1) {
      const a = lt < 0.2 ? lt / 0.2 : 1 - (lt - 0.2) / 0.8, px = sx(hero.x, hero.y), py = sy(hero.x, hero.y, 0), top = py - 900 * zoom, w = 34 * zoom;
      const g = ctx.createLinearGradient(0, top, 0, py); g.addColorStop(0, "rgba(255,245,210,0)"); g.addColorStop(1, `rgba(255,245,210,${0.5 * a})`);
      ctx.fillStyle = g; ctx.fillRect(px - w, top, w * 2, py - top);
      ctx.strokeStyle = `rgba(255,240,190,${0.8 * a})`; ctx.lineWidth = 3 * zoom;
      ctx.beginPath(); ctx.moveTo(px - w * 0.7, top); ctx.lineTo(px - w * 0.7, py); ctx.moveTo(px + w * 0.7, top); ctx.lineTo(px + w * 0.7, py);
      for (let y = py - 18 * zoom; y > top; y -= 26 * zoom) { ctx.moveTo(px - w * 0.7, y); ctx.lineTo(px + w * 0.7, y); }
      ctx.stroke();
    }
    // The tribe spirits: small glowing golden angels (the hero's own picture, faded).
    for (const s of house.spirits) {
      if (now < s.born) continue;
      const fade = Math.min(1, (now - s.born) / 400, (house.jacobUntil - now) / 600);
      glowAt(s.x, s.y, 0.7, 42, "255,230,150", 0.55 * fade);
      if (ok) {
        const step = Math.PI * 2 / S.dirs, row = ((Math.round(s.face / step) % S.dirs) + S.dirs) % S.dirs, frame = Math.floor(now / 90 + s.born) % 8;
        const scale = 1.6 * TH * 1.15 * zoom / S.heightPx, size = S.cell * scale, px = sx(s.x, s.y), py = sy(s.x, s.y, 0);
        ctx.globalAlpha = 0.85 * fade; ctx.drawImage(img, frame * S.cell, row * S.cell, S.cell, S.cell, px - S.anchorX * size, py - S.anchorY * size, size, size); ctx.globalAlpha = 1;
      }
      if (s.hit && now - s.hit < 160) glowAt(s.x + Math.cos(s.face) * 0.5, s.y + Math.sin(s.face) * 0.5, 0.7, 24, "255,255,230", 0.8);
    }
    // Isaac's ram, glowing at the hero's side while it waits to take a blow.
    if (house.ramUntil > now) {
      const rx = hero.x + 0.7, ry = hero.y + 0.25, px = sx(rx, ry), py = sy(rx, ry, 0.35 + Math.sin(now / 300) * 0.04), z = zoom;
      glowAt(rx, ry, 0.4, 34, "255,240,200", 0.35);
      ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 0.9;
      ctx.fillStyle = "#f6efe0"; ctx.beginPath(); ctx.ellipse(px, py, 13 * z, 8 * z, 0, 0, 6.28); ctx.fill();          // woolly body
      ctx.beginPath(); ctx.ellipse(px + 12 * z, py - 5 * z, 5 * z, 4 * z, 0, 0, 6.28); ctx.fill();                      // head
      ctx.strokeStyle = "#c9a26a"; ctx.lineWidth = 2.5 * z; ctx.beginPath(); ctx.arc(px + 11 * z, py - 8 * z, 4 * z, 3.4, 6.2); ctx.stroke();   // horn
      ctx.fillStyle = "#3a2a20"; ctx.fillRect(px - 8 * z, py + 6 * z, 2 * z, 6 * z); ctx.fillRect(px + 6 * z, py + 6 * z, 2 * z, 6 * z);   // legs
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
  // ---- Holy Gospel and the Archangel (Gabriel) ----
  let angel = { until: 0, next: 0, shieldHit: -1e9, strikes: [] };
  const angelOn = () => performance.now() < angel.until;
  function gainGospel(n) {
    if (!hero || !n) return;
    const was = hero.gospel || 0; hero.gospel = Math.min(100, was + n);
    if (was < 100 && hero.gospel >= 100) { say("HOLY GOSPEL FULL · ARCHANGEL READY (R)", 3200, "#bfe6ff"); sfx("achievement"); renderHud(); }
  }
  function archangel() {
    if (state !== "play") return;
    if (angelOn()) return;
    if ((hero.gospel || 0) < 100) return say("Holy Gospel " + Math.floor(hero.gospel || 0) + "% · it grows when you're hurt, kill and go deeper", 1600, "#bfe6ff");
    hero.gospel = 0; const now = performance.now();
    angel = { until: now + GOSPEL.seconds * 1000, start: now, next: now + 500, shieldHit: -1e9, strikes: [] };
    say("✦ ARCHANGEL GABRIEL DESCENDS ✦", 3000, "#dff3ff"); sfx("achievement"); verse("I am Gabriel, that stand in the presence of God. · Luke 1:19", 5000);
    for (let k = 0; k < 3; k++) fx.push({ ring: true, x: hero.x, y: hero.y, r: 0.3 + k * 0.4, grow: 5, life: 1, color: k % 2 ? "#bfe6ff" : "#ffffff" });
    save(); renderHud();
  }
  function updateAngel(now) {
    if (!angel.until) return;
    if (now >= angel.until) { angel.until = 0; say("Gabriel returns to the heavens", 2000, "#bfe6ff"); renderHud(); return; }
    if (now < angel.next) return;
    angel.next = now + GOSPEL.strikeEvery;
    // Strike the nearest enemy in sight within reach of the hero.
    let best = null, bd = GOSPEL.radius;
    for (const m of seenMonsters()) { const d = dist(m, hero); if (d < bd) { bd = d; best = m; } }
    if (!best) return;
    angel.strikes.push({ x: best.x, y: best.y, t0: now });
    beams.push({ x: best.x, y: best.y, t0: now });
    sfx("hit");
    if (best.T.boss) hurtMonster(best, Math.round(best.max * GOSPEL.bossDamage), "#bfe6ff", true);
    else { best.hp = 0; num(best.x, best.y, "✦", "#dff3ff", true); killMonster(best); }
  }
  // Gabriel: the angel's own picture, three times taller, glowing, hovering behind the hero; a shield around the hero;
  // a lance of light from Gabriel to each enemy struck.
  function drawAngel(now) {
    if (!angel.until && !angel.strikes.length) return;
    angel.strikes = angel.strikes.filter(s => now - s.t0 < 450);
    const on = angelOn(), t = on ? (now - angel.start) / 1000 : 0, fade = on ? Math.min(1, t / 0.6, (angel.until - now) / 600) : 0;
    const gx = hero.x - 0.9, gy = hero.y - 0.9, gz = 1.6 + Math.sin(now / 600) * 0.12;      // behind the hero, floating
    const S = HERO_SPRITE, img = HERO_ANIMS.walk.img;
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    if (fade > 0) {
      glowAt(gx, gy, gz + 1.6, 220, "255,236,170", 0.35 * fade);
      glowAt(gx, gy, gz + 1.6, 90, "255,255,255", 0.35 * fade);
      if (img.complete && img.naturalWidth) {
        const scale = 6 * TH * 1.15 * zoom / S.heightPx, size = S.cell * scale, px = sx(gx, gy), py = sy(gx, gy, gz);
        ctx.globalAlpha = 0.85 * fade;
        ctx.drawImage(img, 0, 1 * S.cell, S.cell, S.cell, px - S.anchorX * size, py - S.anchorY * size, size, size);   // row 1 = facing the camera
        ctx.globalAlpha = 1;
      }
      // Halo above Gabriel.
      const hx = sx(gx, gy), hy = sy(gx, gy, gz + 5.6);
      ctx.strokeStyle = `rgba(255,240,180,${0.9 * fade})`; ctx.lineWidth = 4 * zoom; ctx.beginPath(); ctx.ellipse(hx, hy, 34 * zoom, 10 * zoom, 0, 0, 6.28); ctx.stroke();
      // The shield around the hero (flares when it blocks a hit).
      const hit = Math.max(0, 1 - (now - angel.shieldHit) / 300), pulse = 0.5 + 0.5 * Math.sin(now / 160);
      const sx0 = sx(hero.x, hero.y), sy0 = sy(hero.x, hero.y, 0.9), rx = (46 + pulse * 4) * zoom, ry = (60 + pulse * 4) * zoom;
      const g = ctx.createRadialGradient(sx0, sy0, rx * 0.5, sx0, sy0, rx * 1.1);
      g.addColorStop(0, "rgba(190,230,255,0)"); g.addColorStop(0.8, `rgba(190,230,255,${(0.18 + hit * 0.4) * fade})`); g.addColorStop(1, "rgba(190,230,255,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(sx0, sy0, rx * 1.1, ry * 1.1, 0, 0, 6.28); ctx.fill();
      ctx.strokeStyle = `rgba(220,245,255,${(0.55 + hit * 0.45) * fade})`; ctx.lineWidth = 2 * zoom; ctx.beginPath(); ctx.ellipse(sx0, sy0, rx, ry, 0, 0, 6.28); ctx.stroke();
    }
    // Lances of light from Gabriel's raised hand to the enemies struck.
    for (const s of angel.strikes) {
      const a = 1 - (now - s.t0) / 450, x0 = sx(gx, gy), y0 = sy(gx, gy, gz + 4.2), x1 = sx(s.x, s.y), y1 = sy(s.x, s.y, 0.6);
      ctx.strokeStyle = `rgba(255,250,220,${a})`; ctx.lineWidth = 7 * zoom * a; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${a})`; ctx.lineWidth = 2.5 * zoom; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    }
    ctx.restore();
  }
  function drawGod(now) {
    beams = beams.filter(b => now - b.t0 < 1300);
    if (!beams.length && now - godAt > 900) return;
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    for (const b of beams) {
      const t = (now - b.t0) / 1300; if (t < 0) continue;
      const a = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85, px = sx(b.x, b.y), py = sy(b.x, b.y, 0), w = (34 - t * 18) * zoom, top = py - 700 * zoom;
      const g = ctx.createLinearGradient(0, top, 0, py);
      g.addColorStop(0, "rgba(255,240,190,0)"); g.addColorStop(0.6, `rgba(255,236,170,${0.55 * a})`); g.addColorStop(1, `rgba(255,255,255,${0.95 * a})`);
      ctx.fillStyle = g; ctx.fillRect(px - w / 2, top, w, py - top);
      ctx.fillStyle = `rgba(255,255,255,${0.9 * a})`; ctx.fillRect(px - w / 6, top, w / 3, py - top);
      glowAt(b.x, b.y, 0.1, 70 * (0.6 + t), "255,226,140", 0.7 * a);
    }
    const f = (now - godAt) / 900;
    if (f >= 0 && f < 1) { ctx.globalCompositeOperation = "source-over"; ctx.fillStyle = `rgba(255,248,225,${(1 - f) * (1 - f) * 0.85})`; ctx.fillRect(0, 0, W, H); }
    ctx.restore();
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
    if (state !== "play" || gm.god) return;
    if (angelOn()) {                                                    // Gabriel's shield takes the hit
      angel.shieldHit = performance.now();
      if (Math.random() < 0.35) num(hero.x, hero.y, "BLOCKED", "#bfe6ff");
      return;
    }
    const s = stats(), taken = Math.max(1, Math.round(amount * (1 - s.armor / (s.armor + 60))));
    if (hero.hp - taken <= 0 && house.ramUntil > performance.now()) {    // the ram is caught in the thicket in your place
      house.ramUntil = 0; burst(hero.x + 0.6, hero.y + 0.3, "#fff3c4", 26, 3); say("THE LORD HAS PROVIDED", 2600, "#fff3c4");
      verse("And Abraham called the name of that place Jehovah-jireh. · Genesis 22:14", 5000); sfx("power"); return;
    }
    hero.hp -= taken; hero.flash = 1;
    gainGospel(taken * GOSPEL.perDamageTaken);
    num(hero.x, hero.y, "-" + taken, "#ff6e8a");
    if (hero.hp <= 0) die();
  }
  function die() {
    state = "dead";
    const lost = Math.round(hero.gold * 0.2); hero.gold -= lost;
    sfx("bigboom");
    setTimeout(() => {
      showIntro(`<p class="arpg-kicker">YOU HAVE FALLEN · CIRCLE ${ROMAN(floorNo)}</p><h3>Hell claims you, for now.</h3><p class="arpg-quote">"Yea, though I walk through the valley of the shadow of death, I will fear no evil." · Psalm 23:4</p><p>You dropped ${lost} gold. Your level and gear are kept.</p><div class="arpg-buttons"><button type="button" class="arpg-play" data-go="retry">↺ TRY THIS FLOOR AGAIN</button><button type="button" class="arpg-play arpg-alt" data-go="new">✦ NEW HERO</button></div>`);
    }, 900);
    save();
  }
  // Satan is cast down and the hero steps through the gate of light: the ending. "Ascend again" starts over at the
  // first circle with the same hero (each ascension makes Hell tougher).
  function transcend() {
    state = "won"; sfx("achievement");
    hero.ascensions = (hero.ascensions || 0) + 1; floorNo = 1; save();
    setTimeout(() => {
      showIntro(`<p class="arpg-kicker">TRANSCENDED · ASCENSION ${hero.ascensions}</p><h3>You have risen above Hell.</h3>` +
        `<p class="arpg-quote">"And God shall wipe away all tears from their eyes; and there shall be no more death." · Revelation 21:4</p>` +
        `<p>Tenshi, level ${hero.lvl}, cast down Satan and carried ${hero.gold} gold into the light.</p>` +
        `<div class="arpg-buttons"><button type="button" class="arpg-play" data-go="ascend">✦ DESCEND AGAIN · HELL GROWS STRONGER</button><button type="button" class="arpg-play arpg-alt" data-go="new">✦ NEW HERO</button></div>`);
      intro.classList.add("arpg-intro-ascend");
    }, 1200);
  }
  function enterFloor(n) {
    floorNo = n; genFloor(n);
    hero.x = startPos.x; hero.y = startPos.y; hero.path = []; hero.target = null;
    reveal(); save();
    const c = circleOf(n);
    say(`CIRCLE ${ROMAN(n)} · ${c[0]}` + (isFinal(n) ? " · SATAN AWAITS" : bossFloor(n) ? " · A WARDEN GUARDS THE WAY" : ""), 3000, isFinal(n) ? "#bfe6ff" : "#ff9a5a");
    verse(c[1], 6500);
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
    hero.mp -= S.mana; hero.cds.fireball = S.cd; hero.atkAt = performance.now();
    const a = Math.atan2(ty - hero.y, tx - hero.x); hero.face = a;
    shots.push({ kind: "fire", x: hero.x + Math.cos(a) * 0.4, y: hero.y + Math.sin(a) * 0.4, vx: Math.cos(a) * 9, vy: Math.sin(a) * 9, life: 1400, from: "hero" });
    sfx("rocket");
  }
  function castNova() {
    const S = SKILLS.nova;
    if (hero.cds.nova > 0) return;
    if (hero.mp < S.mana) return say("Not enough mana", 900, "#8fd8ff");
    hero.mp -= S.mana; hero.cds.nova = S.cd; hero.atkAt = performance.now();
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
    else if (l.kind === "hpot") { hero.potions.hp++; num(l.x, l.y, "+ holy water", "#ff6e8a"); sfx("combo"); }
    else if (l.kind === "mpot") { hero.potions.mp++; num(l.x, l.y, "+ manna", "#6ea8ff"); sfx("combo"); }
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
    updateAngel(performance.now()); updateSpirits(dt, performance.now());
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
          hero.atkCd = HERO.attackEvery; hero.swing = 1; hero.atkAt = performance.now();
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
      if (bossAlive) { if (!update.warned) { say((isFinal(floorNo) ? "SATAN" : "THE WARDEN") + " STILL GUARDS THE WAY", 1600, "#ff8af0"); update.warned = true; setTimeout(() => { update.warned = false; }, 3000); } }
      else if (isFinal(floorNo)) transcend();
      else { sfx("power"); gainGospel(GOSPEL.perFloor); enterFloor(floorNo + 1); }
    }
    // Monsters
    for (const m of monsters) {
      m.cd = Math.max(0, m.cd - dt); m.flash = Math.max(0, m.flash - dt / 200); m.slow = Math.max(0, m.slow - dt);
      const d = dist(m, hero), speed = m.T.speed * (m.slow ? 0.45 : 1) * (m.champion ? 1.15 : 1);
      if (!m.aggro && d < 7.5 && lineOfSight(m, hero)) { m.aggro = true; m.spotAt = performance.now(); if (m.T.boss) { if (HELL.bossIntro && HELL.bossIntro.enabled !== false) bossIntro = { m, t0: performance.now(), dur: Math.max(0.5, +HELL.bossIntro.seconds || 2.5) * 1000, ice: isFinal(floorNo) }; say(m.T.name.toUpperCase() + " AWAKENS", 2400, m.type === "satan" ? "#ff3b1f" : "#ff2bd6"); sfx("bomb"); if (m.type === "satan") verse("Be sober, be vigilant; because your adversary the devil, as a roaring lion, walketh about. · 1 Peter 5:8", 6000); } }
      if (!m.aggro) { if (Math.random() < dt / 3000) m.wander = { x: m.home.x + rand(-1.5, 1.5), y: m.home.y + rand(-1.5, 1.5) }; if (m.wander && isFloor(m.wander.x, m.wander.y)) moveToward(m, m.wander.x, m.wander.y, speed * 0.4, dt); continue; }
      if (bossIntro && introK()) { m.face = Math.atan2(hero.y - m.y, hero.x - m.x); continue; }   // everyone holds still while the boss intro plays
      if (MONSTER_ANIMS[m.type] && performance.now() - (m.spotAt || 0) < MONSTER_ANIMS[m.type].spotMs) { m.face = Math.atan2(hero.y - m.y, hero.x - m.x); continue; }   // "come here!"
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
          m.cd = m.T.every * (m.slow ? 1.5 : 1); m.swing = 1; m.atkAt = performance.now();
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
  // Lava pools: a few floor tiles per floor (not the stairs or where you start), the same each time you see them.
  function isLava(x, y) {
    if (!HELL.lavaPools || (x === stairs.x && y === stairs.y) || Math.hypot(x + 0.5 - startPos.x, y + 0.5 - startPos.y) < 2.5) return false;
    const h = Math.imul(x * 73856093 ^ y * 19349663 ^ floorNo * 83492791, 2654435761) >>> 0;
    return (h % 1000) < HELL.lavaPools * 1000;
  }
  function drawFloorTile(x, y, now) {
    const v = ((x * 7 + y * 13) % 5) / 40;
    diamond(x, y);
    const isStairs = x === stairs.x && y === stairs.y;
    const gate = isStairs && isFinal(floorNo) && !bossAlive;
    if (isStairs) { ctx.fillStyle = gate ? "#fff3c4" : bossAlive ? "#3a0a08" : "#4a1408"; ctx.fill(); }
    else {
      const ox = sx(x, y), oy = sy(x, y, 0);
      stone(isFinal(floorNo) ? STONE.iceFloor : STONE.floor, ox, oy, sx(x + 1, y) - ox, sy(x + 1, y, 0) - oy, sx(x, y + 1) - ox, sy(x, y + 1, 0) - oy);
      if (v > 0.03) { ctx.fillStyle = `rgba(0,0,0,${(v * 0.45).toFixed(3)})`; ctx.fill(); }   // a barely-there per-tile tone (no checkerboard)
      if (isLava(x, y)) {                                              // a pool of lava (or black water under ice): just for looks
        const px = sx(x + 0.5, y + 0.5), py = sy(x + 0.5, y + 0.5, 0), pulse = 0.75 + 0.25 * Math.sin(now / 420 + x * 1.7 + y);
        const ice = isFinal(floorNo), g = ctx.createRadialGradient(px, py, 0, px, py, TW * 0.5 * zoom);
        if (ice) { g.addColorStop(0, "rgba(10,20,40,0.95)"); g.addColorStop(0.7, "rgba(40,80,120,0.85)"); g.addColorStop(1, "rgba(120,170,220,0.5)"); }
        else { g.addColorStop(0, `rgba(255,${Math.round(190 * pulse)},60,1)`); g.addColorStop(0.55, `rgba(240,${Math.round(70 * pulse)},10,0.95)`); g.addColorStop(1, "rgba(90,10,0,0.9)"); }
        ctx.fillStyle = g; ctx.fill();
        if (!ice) {                                                    // bubbles rising and bursting, and a heat glow
          ctx.save(); ctx.globalCompositeOperation = "lighter";
          for (let b = 0; b < 3; b++) {
            const ph = ((now / 1400 + b * 0.37 + (x * 0.13 + y * 0.29)) % 1), bx = px + Math.sin(b * 2.1 + x) * TW * 0.16 * zoom, by = py + Math.cos(b * 1.7 + y) * TH * 0.16 * zoom;
            ctx.fillStyle = `rgba(255,230,140,${0.55 * (1 - ph)})`; ctx.beginPath(); ctx.ellipse(bx, by, (1.5 + ph * 4) * zoom, (1 + ph * 2.5) * zoom, 0, 0, 6.28); ctx.fill();
          }
          glowAt(x + 0.5, y + 0.5, 0.1, 44, "255,90,20", 0.35 * pulse);
          ctx.restore();
        }
      }
    }
    ctx.strokeStyle = isFinal(floorNo) ? "rgba(170,220,255,0.10)" : "rgba(255,80,30,0.08)"; ctx.lineWidth = 1; ctx.stroke();
    if (isStairs) {
      for (let k = 0; k < 4; k++) { diamond(x + 0.12 + k * 0.08, y + 0.12 + k * 0.08, gate ? k * 0.12 : -k * 0.12); ctx.fillStyle = `rgba(${gate ? "255,240,200" : bossAlive ? "120,15,10" : "180,50,10"},${0.5 + k * 0.12})`; ctx.fill(); }
      ctx.globalCompositeOperation = "lighter";
      glowAt(x + 0.5, y + 0.5, 0, gate ? 120 : 46, gate ? "255,240,190" : bossAlive ? "255,40,20" : "255,120,40", (gate ? 0.8 : 0.5) + 0.2 * Math.sin(now / 300));
      if (gate) glowAt(x + 0.5, y + 0.5, 2.5, 160, "255,255,255", 0.25 + 0.1 * Math.sin(now / 500));
      ctx.globalCompositeOperation = "source-over";
    }
  }
  // ---- Stone walls: a tileable stone-block texture (made once), tinted per face and mapped onto each wall face in its
  // isometric perspective (the texture follows the face, so it lies flat on the wall). 128 px of texture = one tile. ----
  const STONE = (() => {
    const N = 128, base = document.createElement("canvas"); base.width = base.height = N;
    const g = base.getContext("2d"); let seed = 9; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const val = new Float32Array(N * N);
    for (let i = 0; i < N * N; i++) val[i] = 0.64 + (rnd() - 0.5) * 0.2;                      // speckled stone grain
    const rowH = 32, bw = 64;                                                                   // 4 courses of blocks, staggered
    for (let row = 0; row < N / rowH; row++) {
      const off = row % 2 ? bw / 2 : 0;
      for (let bI = -1; bI <= N / bw; bI++) {
        const tone = 0.82 + rnd() * 0.32, x0 = bI * bw + off;
        for (let y = row * rowH; y < (row + 1) * rowH; y++) for (let x = x0; x < x0 + bw; x++) {
          const i = y * N + ((x % N) + N) % N, ly = y - row * rowH, lx = x - x0;
          if (ly < 2 || lx < 2) val[i] = 0.26 + rnd() * 0.06;                                  // mortar
          else if (ly === 2 || lx === 2) val[i] *= tone * 1.28;                                // lit top / left edge
          else if (ly >= rowH - 2 || lx >= bw - 2) val[i] *= tone * 0.78;                      // shaded bottom / right edge
          else val[i] *= tone;
        }
      }
    }
    const img = g.createImageData(N, N);
    for (let i = 0; i < N * N; i++) { const v = Math.max(0, Math.min(1, val[i])) * 255; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
    g.putImageData(img, 0, 0);
    for (let i = 0; i < 16; i++) {                                                              // grime (wrapped so it tiles)
      const x = rnd() * N, y = rnd() * N, r = 6 + rnd() * 18, a = 0.1 + rnd() * 0.14;
      for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) { const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r); gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2); }
    }
    g.strokeStyle = "rgba(0,0,0,0.5)"; g.lineWidth = 1;                                          // cracks
    for (let i = 0; i < 7; i++) { let x = 4 + rnd() * (N - 8), y = 4 + rnd() * (N - 30); g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (rnd() - 0.5) * 12; y += 2 + rnd() * 6; g.lineTo(x, y); } g.stroke(); }
    // Tint the stone; `glow` lights the mortar from within (hellfire seeping through the cracks between the blocks).
    const tint = (rgb, glow) => {
      const c = document.createElement("canvas"); c.width = c.height = N; const t = c.getContext("2d"); t.drawImage(base, 0, 0);
      t.globalCompositeOperation = "multiply"; t.fillStyle = `rgb(${rgb.join(",")})`; t.fillRect(0, 0, N, N);
      if (glow) {
        t.globalCompositeOperation = "lighter"; t.fillStyle = glow;
        for (let row = 0; row < N / rowH; row++) {
          const off = row % 2 ? bw / 2 : 0; t.fillRect(0, row * rowH, N, 2);
          for (let bI = -1; bI <= N / bw; bI++) t.fillRect((((bI * bw + off) % N) + N) % N, row * rowH, 2, rowH);
        }
      }
      return ctx.createPattern(c, "repeat");
    };
    // Floor: big worn paving slabs, 2 x 2 per tile, with grout, chipped corners, grit and a few cracks.
    const fb = document.createElement("canvas"); fb.width = fb.height = N; const fg = fb.getContext("2d");
    const fv = new Float32Array(N * N);
    for (let i = 0; i < N * N; i++) fv[i] = 0.6 + (rnd() - 0.5) * 0.16;
    const slab = 64;
    for (let sy = 0; sy < N; sy += slab) for (let sx = 0; sx < N; sx += slab) {
      const tone = 0.8 + rnd() * 0.34, wear = rnd();
      for (let y = sy; y < sy + slab; y++) for (let x = sx; x < sx + slab; x++) {
        const lx = x - sx, ly = y - sy, i = y * N + x, edge = Math.min(lx, ly, slab - 1 - lx, slab - 1 - ly);
        const chip = (lx < 6 && ly < 6 && lx + ly < 5 + wear * 4) || (lx > slab - 7 && ly > slab - 7 && (slab - lx) + (slab - ly) < 6 + wear * 4);
        if (edge < 2 || chip) fv[i] = 0.24 + rnd() * 0.05;                       // grout and chipped corners
        else if (edge === 2) fv[i] *= tone * 1.18;                               // worn, lighter rim
        else fv[i] *= tone * (1 - 0.08 * Math.hypot(lx - slab / 2, ly - slab / 2) / slab);   // a little dished in the middle
      }
    }
    const fimg = fg.createImageData(N, N);
    for (let i = 0; i < N * N; i++) { const v = Math.max(0, Math.min(1, fv[i])) * 255; fimg.data[i * 4] = fimg.data[i * 4 + 1] = fimg.data[i * 4 + 2] = v; fimg.data[i * 4 + 3] = 255; }
    fg.putImageData(fimg, 0, 0);
    for (let i = 0; i < 18; i++) {
      const x = rnd() * N, y = rnd() * N, r = 5 + rnd() * 16, a = 0.08 + rnd() * 0.14;
      for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) { const gr = fg.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r); gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(1, "rgba(0,0,0,0)"); fg.fillStyle = gr; fg.fillRect(x + ox - r, y + oy - r, r * 2, r * 2); }
    }
    fg.strokeStyle = "rgba(0,0,0,0.45)"; fg.lineWidth = 1;
    for (let i = 0; i < 6; i++) { let x = 6 + rnd() * (N - 12), y = 6 + rnd() * (N - 12); fg.beginPath(); fg.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (rnd() - 0.5) * 14; y += (rnd() - 0.5) * 14; fg.lineTo(x, y); } fg.stroke(); }
    // Floors: scorched basalt with glowing lava veins (Hell), or frosted dark ice with pale cracks (Cocytus).
    const floorPat = (rgb, vein, veinGlow) => {
      const fc = document.createElement("canvas"); fc.width = fc.height = N; const ft = fc.getContext("2d");
      ft.drawImage(fb, 0, 0); ft.globalCompositeOperation = "multiply"; ft.fillStyle = `rgb(${rgb.join(",")})`; ft.fillRect(0, 0, N, N);
      ft.globalCompositeOperation = "lighter"; ft.strokeStyle = vein; ft.lineWidth = 1.6; ft.shadowColor = veinGlow; ft.shadowBlur = 7; ft.lineCap = "round";
      let vs = 31; const vr = () => (vs = (vs * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < 5; i++) { let x = 10 + vr() * (N - 20), y = 10 + vr() * (N - 20); ft.beginPath(); ft.moveTo(x, y); for (let k = 0; k < 6; k++) { x = Math.max(4, Math.min(N - 4, x + (vr() - 0.5) * 22)); y = Math.max(4, Math.min(N - 4, y + (vr() - 0.5) * 22)); ft.lineTo(x, y); } ft.stroke(); }
      return ctx.createPattern(fc, "repeat");
    };
    const ember = "rgba(255,80,20,0.24)", frost = "rgba(150,210,255,0.16)";
    return { N, top: tint([118, 62, 52], ember), left: tint([84, 40, 36], ember), right: tint([60, 28, 28], ember),
      floor: floorPat([86, 50, 44], "rgba(255,110,30,0.62)", "#ff5a14"),
      iceTop: tint([150, 180, 210], frost), iceLeft: tint([96, 120, 150], frost), iceRight: tint([70, 90, 118], frost),
      iceFloor: floorPat([96, 122, 150], "rgba(190,230,255,0.45)", "#9fd8ff") };
  })();
  // Fill the current path with stone: (ox, oy) = the face's top-left corner, u = along its width, v = down its height.
  function stone(pat, ox, oy, ux, uy, vx, vy) {
    const k = 1 / STONE.N;
    pat.setTransform(new DOMMatrix([ux * k, uy * k, vx * k, vy * k, ox, oy]));
    ctx.fillStyle = pat; ctx.fill();
  }
  function drawWall(x, y, fade) {
    const Wz = WALL * zoom;
    const ax = sx(x + 1, y), ay = sy(x + 1, y, 0), bx = sx(x + 1, y + 1), by = sy(x + 1, y + 1, 0), cx = sx(x, y + 1), cy = sy(x, y + 1, 0), dx = sx(x, y), dy = sy(x, y, 0);
    ctx.globalAlpha = fade;
    // Right face (towards +x: the face you see on the lower right)
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(bx, by - Wz); ctx.lineTo(ax, ay - Wz); ctx.closePath();
    const ice = isFinal(floorNo);
    stone(ice ? STONE.iceRight : STONE.right, ax, ay - Wz, bx - ax, by - ay, 0, Wz);
    // Left face (lower left)
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(bx, by); ctx.lineTo(bx, by - Wz); ctx.lineTo(cx, cy - Wz); ctx.closePath();
    stone(ice ? STONE.iceLeft : STONE.left, cx, cy - Wz, bx - cx, by - cy, 0, Wz);
    // Top
    ctx.beginPath(); ctx.moveTo(dx, dy - Wz); ctx.lineTo(ax, ay - Wz); ctx.lineTo(bx, by - Wz); ctx.lineTo(cx, cy - Wz); ctx.closePath();
    stone(ice ? STONE.iceTop : STONE.top, dx, dy - Wz, ax - dx, ay - dy, cx - dx, cy - dy);
    ctx.strokeStyle = ice ? "rgba(190,230,255,0.25)" : "rgba(255,90,30,0.28)"; ctx.lineWidth = 1; ctx.stroke();
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
  const RIM = [170, 120, 255];   // rim-light colour on the 3D models
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
      let rgb;
      if (f.glow) rgb = f.rgb.map(v => v * 1.2);
      else {
        const key = Math.max(0, n[0] * KEY[0] + n[1] * KEY[1] + n[2] * KEY[2]), facing = Math.max(0, n[0] * VIEW[0] + n[1] * VIEW[1] + n[2] * VIEW[2]);
        const amb = 0.26 + 0.16 * (n[2] * 0.5 + 0.5);                                   // brighter on faces turned up
        const hx = KEY[0] + VIEW[0], hy = KEY[1] + VIEW[1], hz = KEY[2] + VIEW[2], hl = Math.hypot(hx, hy, hz) || 1;
        const spec = Math.pow(Math.max(0, (n[0] * hx + n[1] * hy + n[2] * hz) / hl), 22) * 0.45;   // satin sheen
        const rim = Math.pow(1 - facing, 2.4) * 0.5;                                     // violet glow around the edges
        rgb = f.rgb.map((v, i) => v * (amb + 0.85 * key) + 255 * spec * (0.55 + 0.45 * v / 255) + RIM[i] * rim);
      }
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

  // ---- The hero: your Meshy "Female Angel Hero", pre-rendered in Blender (tools/render-hero-anims.py) from 8 directions
  // at this game's camera angle, with all its animations: Walking (short moves), Running (longer moves) and Attack (melee
  // swings and spells). Sheets: rows = directions (row 0 faces map angle 0, then every 45 degrees), columns = frames.
  // Standing still shows the first Walking frame. Falls back to the 3D model in the arpg.hero slot. ----
  const HERO_SPRITE = { dirs: 8, cell: 256, anchorX: 0.5, anchorY: 0.8637, heightPx: 148.36, height: 2.0 };
  const HERO_ANIMS = {
    walk: { file: "art/hero-angel-walk.webp", frames: 8, ms: 1033 },
    run: { file: "art/hero-angel-run.webp", frames: 8, ms: 633 },
    attack: { file: "art/hero-angel-attack.webp", frames: 10, ms: 2800 },
  };
  const artBase = (document.querySelector('script[src*="neon-arpg.js"]')?.src || "").replace(/neon-arpg\.js.*$/, "");
  for (const k in HERO_ANIMS) { HERO_ANIMS[k].img = new Image(); HERO_ANIMS[k].img.src = artBase + HERO_ANIMS[k].file; }
  function heroPathLeft() {
    let d = 0, x = hero.x, y = hero.y;
    for (const [px, py] of hero.path) { d += Math.hypot(px - x, py - y); x = px; y = py; if (d > 3) break; }
    return d;
  }
  function drawHeroSprite(bob, now) {
    if (CFG.heroSprite === false) return false;                     // Game Studio: "use the 3D model" for the hero
    const S = HERO_SPRITE, attackFor = Math.max(450, HERO.attackEvery), sinceAtk = hero.atkAt ? now - hero.atkAt : 1e9;
    let A, frame = 0;
    if (sinceAtk < attackFor) { A = HERO_ANIMS.attack; frame = Math.min(A.frames - 1, Math.floor(sinceAtk / attackFor * A.frames)); }
    else if (hero.path.length) { A = heroPathLeft() > 2.2 ? HERO_ANIMS.run : HERO_ANIMS.walk; frame = Math.floor(now / (A.ms / A.frames)) % A.frames; bob = 0; }
    else A = HERO_ANIMS.walk;
    if (!A.img.complete || !A.img.naturalWidth) return false;
    const step = Math.PI * 2 / S.dirs, row = ((Math.round(hero.face / step) % S.dirs) + S.dirs) % S.dirs;
    const scale = S.height * TH * 1.15 * zoom / S.heightPx, size = S.cell * scale;
    const px = sx(hero.x, hero.y), py = sy(hero.x, hero.y, bob), cx = frame * S.cell, cy = row * S.cell;
    const dx = px - S.anchorX * size, dy = py - S.anchorY * size;
    ctx.save(); ctx.globalCompositeOperation = "lighter"; glowAt(hero.x, hero.y, 1.0 + bob, 46, "255,120,230", 0.16); glowAt(hero.x, hero.y, 0.05, 30, "190,140,255", 0.22); ctx.restore();   // soft neon aura
    ctx.drawImage(A.img, cx, cy, S.cell, S.cell, dx, dy, size, size);
    if (hero.flash > 0.05) { ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = Math.min(1, hero.flash) * 0.7; ctx.drawImage(A.img, cx, cy, S.cell, S.cell, dx, dy, size, size); ctx.restore(); }
    return true;
  }
  function drawHero(now) {
    const s = stats(), bob = hero.path.length ? Math.abs(Math.sin(hero.walk)) * 0.06 : Math.sin(now / 500) * 0.02;
    shadow(hero.x, hero.y, 0.35);
    const sprite = drawHeroSprite(bob, now), model = sprite ? null : modelFor("arpg.hero");
    if (sprite) { /* the pre-rendered angel */ }
    else if (model) drawMesh(model, hero.x, hero.y, hero.face, 2.4, hero.flash);   // (the wraith's wide wings make the model fit a bigger ball, so draw it larger)
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
    if (!model && !sprite) { ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(ex, ey); ctx.stroke(); }
    ctx.restore();
    if (hero.swing > 0.3) { ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.strokeStyle = `rgba(255,255,255,${hero.swing * 0.6})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, 30 * zoom, hero.face - 1.6, hero.face + 0.4); ctx.stroke(); ctx.restore(); }
    drawHeroLabel(bob);
  }
  // ---- Monster sprites: animated characters pre-rendered in Blender (8 directions x 8 frames; rows = directions,
  // columns = frames). Frame 0 is the standing pose; when hit, the monster plays its animation (a leap back). ----
  const MONSTER_SPRITES = {
    // "Corrupted Astral Sorcerer" (Meshy, Mixamo "Back Jump"), the first enemy you meet. Its model faces the other way,
    // so its rows are turned half a circle (dirOffset 4).
    hollow: { file: "art/hollow-sorcerer.webp", setting: "hollowSprite", dirs: 8, frames: 8, cell: 160, anchorX: 0.5, anchorY: 0.8637, heightPx: 99.15, height: 1.75, dirOffset: 4, hitMs: 750 },
    // "Low Poly Green Elemental" (Meshy, Mixamo "Block"): the Golem, the tough one (from floor 1). Raises its guard when hit.
    golem: { file: "art/golem-elemental.webp", setting: "golemSprite", dirs: 8, frames: 8, cell: 160, anchorX: 0.5, anchorY: 0.8637, heightPx: 119.84, height: 1.7, dirOffset: 4, hitMs: 900 },
  };
  for (const t in MONSTER_SPRITES) { const S = MONSTER_SPRITES[t]; S.img = new Image(); S.img.src = (document.querySelector('script[src*="neon-arpg.js"]')?.src || "").replace(/neon-arpg\.js.*$/, S.file); }
  function drawMonsterSprite(m, now) {
    const S = MONSTER_SPRITES[m.type];
    if (!S || CFG[S.setting] === false || !S.img.complete || !S.img.naturalWidth) return false;
    const step = Math.PI * 2 / S.dirs, row = (((Math.round(m.face / step) + S.dirOffset) % S.dirs) + S.dirs) % S.dirs;
    const t = m.hitAt ? (now - m.hitAt) / S.hitMs : 1, col = t >= 0 && t < 1 ? 1 + Math.min(S.frames - 2, Math.floor(t * (S.frames - 1))) : 0;
    const bob = col ? 0 : Math.abs(Math.sin(m.walk)) * 0.04, scale = S.height * (m.T.h > 1.4 ? 1.25 : 1) * TH * 1.15 * zoom / S.heightPx, size = S.cell * scale;
    const px = sx(m.x, m.y), py = sy(m.x, m.y, bob), dx = px - S.anchorX * size, dy = py - S.anchorY * size;
    ctx.drawImage(S.img, col * S.cell, row * S.cell, S.cell, S.cell, dx, dy, size, size);
    if (m.flash > 0.05) { ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = Math.min(1, m.flash) * 0.7; ctx.drawImage(S.img, col * S.cell, row * S.cell, S.cell, S.cell, dx, dy, size, size); ctx.restore(); }
    return true;
  }
  // ---- Fully animated monsters: every animation of a Meshy/Mixamo character, pre-rendered in Blender
  // (tools/render-hero-anims.py) from 8 directions, one sheet per animation (rows = directions, columns = frames).
  // Sheets load only when the monster first appears. Each entry: [file, frames, seconds, loops].
  const MONSTER_ANIMS = {
    // The owner's Meshy "Evil Wizard" (Mixamo animations): a common enemy on every floor.
    wizard: { setting: "wizardSprite", dir: "art/wizard/", dirs: 8, cell: 176, anchorX: 0.5, anchorY: 0.8637, heightPx: 107.74, height: 1.8, spotMs: 1100,
      anims: {
        walk: ["walk", 8, 1.03, true], run: ["run", 8, 0.63, true], wander: ["casual-walk", 12, 4.17, true],
        breath: ["catching-breath", 12, 7, true], bubble: ["bubble-dance", 12, 8.03, true], cardio: ["cardio-dance", 12, 4.3, true],
        breakdance: ["breakdance", 6, 0.5, true], burpee: ["burpee", 12, 3.17, true], call: ["call-gesture", 12, 7.5, false],
        cannon: ["heavy-walk", 8, 0.93, true], crouch: ["crouch-forward", 8, 1.13, true], strafe: ["crouch-right", 8, 1.27, true],
        attack: ["charged-slash", 10, 2.2, false],
      },
      idles: ["breath", "breath", "bubble", "cardio", "breakdance", "burpee"] },
    // The owner's Meshy "Evil Green Elf" (Mixamo Walking): a quick, common enemy on every floor. Only a walk, so it
    // stands on the first frame when still and lunges forward to stab.
    elf: { setting: "elfSprite", dir: "art/elf/", dirs: 8, cell: 176, anchorX: 0.5, anchorY: 0.8637, heightPx: 136.09, height: 1.3, spotMs: 0,
      anims: { walk: ["walk", 8, 1.03, true] }, idles: [] },
    // The owner's lava spider (Game Studio upload, no animations of its own): an 8-leg walk made in Blender
    // (tools/spider-walk.py), 8 directions. Stands still on frame 0, lunges to bite.
    skitter: { setting: "skitterSprite", dir: "art/spider/", dirs: 8, cell: 176, anchorX: 0.5, anchorY: 0.8637, heightPx: 79.79, height: 1.15, spotMs: 0,
      anims: { walk: ["walk", 8, 0.33, true] }, idles: [] },
  };
  function animSheet(S, key) {
    const a = S.anims[key];
    if (!a.img) { a.img = new Image(); a.img.src = artBase + S.dir + a[0] + ".webp"; }
    return a.img;
  }
  for (const t in MONSTER_ANIMS) animSheet(MONSTER_ANIMS[t], "walk");   // the walk sheet up front: no placeholder when one first appears
  function drawAnimMonster(m, now) {
    const S = MONSTER_ANIMS[m.type];
    if (!S || CFG[S.setting] === false) return false;
    // Moving? (monsters' walk counter grows as they step)
    if (m.lastWalk !== undefined && m.walk !== m.lastWalk) m.movedAt = now;
    m.lastWalk = m.walk;
    const moving = now - (m.movedAt || 0) < 160, d = Math.hypot(hero.x - m.x, hero.y - m.y);
    let key, t = 0;                                                   // t = 0..1 through a one-shot animation
    const atkMs = Math.min(900, m.T.every * 0.85), sinceAtk = now - (m.atkAt || -1e9), sinceSpot = now - (m.spotAt || -1e9);
    if (sinceAtk < atkMs) { key = "attack"; t = sinceAtk / atkMs; }
    else if (m.aggro && sinceSpot < S.spotMs) { key = "call"; t = sinceSpot / S.spotMs; }
    else if (m.aggro && moving) key = m.slow ? "crouch" : m.champion ? "cannon" : d > 4 ? "run" : "walk";
    else if (m.aggro) key = "strafe";                                 // squaring up between swings
    else if (moving) key = "wander";
    else {                                                            // waiting around: a random idle every few seconds
      if (!m.idle || now > m.idleUntil) { m.idle = S.idles[Math.floor(Math.random() * S.idles.length)] || "stand"; m.idleUntil = now + rand(3500, 7000); }
      key = m.idle;
    }
    let lunge = 0, still = false;
    if (!S.anims[key]) {                         // a move this character doesn't have: walk when moving, else stand (lunge to attack)
      if (key === "attack") lunge = Math.sin(t * Math.PI) * 0.35;
      still = !(moving && key !== "attack"); key = "walk";
    }
    const a = S.anims[key], img = animSheet(S, key);
    if (!img.complete || !img.naturalWidth) {                         // still loading: the first walk frame if it's there
      const w = animSheet(S, "walk"); if (!w.complete || !w.naturalWidth) return false;
      return blitMonster(m, S, w, 0, lunge);
    }
    let frame;
    if (still) frame = 0;
    else if (!a[3]) frame = Math.min(a[1] - 1, Math.floor(t * a[1]));
    else { const per = Math.min(a[2] * 1000 / a[1], 240); frame = Math.floor((now + m.home.x * 997) / per) % a[1]; }
    return blitMonster(m, S, img, frame, lunge);
  }
  function blitMonster(m, S, img, frame, lunge = 0) {
    const step = Math.PI * 2 / S.dirs, row = ((Math.round(m.face / step) % S.dirs) + S.dirs) % S.dirs;
    const scale = S.height * (m.champion ? 1.12 : 1) * TH * 1.15 * zoom / S.heightPx, size = S.cell * scale;
    const lx = m.x + Math.cos(m.face) * lunge, ly = m.y + Math.sin(m.face) * lunge;
    const px = sx(lx, ly), py = sy(lx, ly, 0), dx = px - S.anchorX * size, dy = py - S.anchorY * size;
    ctx.drawImage(img, frame * S.cell, row * S.cell, S.cell, S.cell, dx, dy, size, size);
    if (m.flash > 0.05) { ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = Math.min(1, m.flash) * 0.7; ctx.drawImage(img, frame * S.cell, row * S.cell, S.cell, S.cell, dx, dy, size, size); ctx.restore(); }
    return true;
  }
  function drawMonster(m, now) {
    const T = m.T, model = modelFor("arpg." + m.type);
    shadow(m.x, m.y, T.r);
    if (m.champion) { ctx.save(); ctx.globalCompositeOperation = "lighter"; glowAt(m.x, m.y, 0.2, 40 * T.r * 3, "255,216,74", 0.35); ctx.restore(); }
    if (m.slow) { ctx.save(); ctx.globalCompositeOperation = "lighter"; glowAt(m.x, m.y, 0.3, 30, "143,216,255", 0.35); ctx.restore(); }
    if (drawAnimMonster(m, now) || drawMonsterSprite(m, now)) { /* pre-rendered animated character */ }
    else if (model) drawMesh(model, m.x, m.y, m.face, T.h * 1.1, m.flash);
    else if (m.T.custom) figure(m.x, m.y, { h: m.T.h, r: m.T.r, body: m.T.color, head: "#e8e6f0", eye: "#ff2bd6", flash: m.flash, bob: Math.abs(Math.sin(m.walk)) * 0.05, face: m.face });
    else if (m.type === "elf") figure(m.x, m.y, { h: 0.95, r: 0.26, body: "#2f4a2a", head: "#7dff7a", eye: "#ff2bd6", flash: m.flash, bob: Math.abs(Math.sin(m.walk)) * 0.05, face: m.face });
    else if (m.type === "wizard") figure(m.x, m.y, { h: 1.2, r: 0.3, body: "#4a2a7a", head: "#c9a6ff", eye: "#ff2bd6", flash: m.flash, bob: Math.abs(Math.sin(m.walk)) * 0.05, face: m.face });
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
    else if (m.type === "satan") {
      const pulse = 0.35 + 0.12 * Math.sin(now / 220);
      ctx.save(); ctx.globalCompositeOperation = "lighter"; glowAt(m.x, m.y, 1.4, 150, "255,50,10", pulse); glowAt(m.x, m.y, 0.2, 90, "255,140,40", 0.3); ctx.restore();
      const px = sx(m.x, m.y), py = sy(m.x, m.y, 2.4), wing = Math.sin(now / 300) * 6 * zoom;
      ctx.fillStyle = "rgba(20,4,6,0.92)";                               // great black wings
      for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(px, py); ctx.quadraticCurveTo(px + sd * 70 * zoom, py - 60 * zoom - wing, px + sd * 92 * zoom, py - 10 * zoom); ctx.lineTo(px + sd * 60 * zoom, py + 10 * zoom); ctx.lineTo(px + sd * 72 * zoom, py + 34 * zoom); ctx.lineTo(px + sd * 30 * zoom, py + 30 * zoom); ctx.closePath(); ctx.fill(); }
      figure(m.x, m.y, { h: 3.0, r: 0.8, body: "#6a0c08", head: "#2a0504", eye: "#ffcc33", flash: m.flash, bob: Math.sin(now / 400) * 0.03, face: m.face });
      const hy = sy(m.x, m.y, 2.95);
      ctx.strokeStyle = "#d8b07a"; ctx.lineWidth = 5 * zoom; ctx.lineCap = "round";
      for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(px + sd * 10 * zoom, hy); ctx.quadraticCurveTo(px + sd * 40 * zoom, hy - 12 * zoom, px + sd * 30 * zoom, hy - 46 * zoom); ctx.stroke(); }
      ctx.lineCap = "butt";
    }
    else if (m.type === "warden") {
      ctx.save(); ctx.globalCompositeOperation = "lighter"; glowAt(m.x, m.y, 1, 90, "255,43,214", 0.3 + 0.1 * Math.sin(now / 250)); ctx.restore();
      figure(m.x, m.y, { h: 2.2, r: 0.55, body: "#5a1e6e", head: "#2a0c3a", eye: "#ff2bd6", flash: m.flash, bob: Math.sin(now / 400) * 0.03, face: m.face });
      const px = sx(m.x, m.y), py = sy(m.x, m.y, 2.1);
      ctx.strokeStyle = "#ffb36b"; ctx.lineWidth = 3 * zoom;
      for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(px + sd * 8 * zoom, py); ctx.quadraticCurveTo(px + sd * 26 * zoom, py - 10 * zoom, px + sd * 22 * zoom, py - 30 * zoom); ctx.stroke(); }
    }
    drawLabel(m);
  }
  // Name and health bar over an enemy, at the top of what's drawn (sprites are taller than their hit size).
  function monsterTop(m) {
    const A = MONSTER_ANIMS[m.type], S = MONSTER_SPRITES[m.type];
    const h = A && CFG[A.setting] !== false ? A.height * (m.champion ? 1.12 : 1) : S && CFG[S.setting] !== false ? S.height * (m.T.h > 1.4 ? 1.25 : 1) : m.T.h * 1.1;
    return h + 0.25;
  }
  // The hero's name and level over her head (Game Studio > Undercity > labels: heroLabel, heroName, colours).
  function drawHeroLabel(bob) {
    if (!LABELS.heroLabel) return;
    const name = String(LABELS.heroName || "Hero").slice(0, 40), lvl = "LV " + hero.lvl, fs = Math.round((LABELS.nameSize + 2) * zoom);
    const px = sx(hero.x, hero.y), py = sy(hero.x, hero.y, HERO_SPRITE.height + 0.35 + bob);
    ctx.font = `800 ${fs}px Oswald, sans-serif`; ctx.textBaseline = "bottom";
    const gap = 6 * zoom, wn = ctx.measureText(name).width, wl = ctx.measureText(lvl).width, x0 = px - (wn + gap + wl) / 2;
    ctx.lineWidth = 3; ctx.strokeStyle = "rgba(5,2,12,.9)"; ctx.textAlign = "left";
    ctx.strokeText(name, x0, py); ctx.strokeText(lvl, x0 + wn + gap, py);
    ctx.save(); ctx.shadowColor = LABELS.heroNameColor; ctx.shadowBlur = 8;
    ctx.fillStyle = LABELS.heroNameColor; ctx.fillText(name, x0, py);
    ctx.fillStyle = LABELS.heroLevelColor; ctx.shadowColor = LABELS.heroLevelColor; ctx.fillText(lvl, x0 + wn + gap, py);
    ctx.restore(); ctx.textAlign = "start"; ctx.textBaseline = "alphabetic";
  }
  function drawLabel(m) {
    if (m.T.boss) return;                                             // the boss has its big bar in the HUD
    const showBar = LABELS.healthBars && (!LABELS.onlyWhenHurt || m.hp < m.max), showName = LABELS.names;
    if (!showBar && !showName) return;
    const px = sx(m.x, m.y), py = sy(m.x, m.y, monsterTop(m)), w = LABELS.barWidth * zoom, bh = Math.max(2, LABELS.barHeight * zoom);
    if (showBar) {
      const f = Math.max(0, m.hp / m.max);
      ctx.fillStyle = "rgba(0,0,0,.7)"; ctx.fillRect(px - w / 2 - 1, py - 1, w + 2, bh + 2);
      ctx.fillStyle = m.champion ? LABELS.championColor : LABELS.barColor; ctx.fillRect(px - w / 2, py, w * f, bh);
      ctx.fillStyle = "rgba(255,255,255,.25)"; ctx.fillRect(px - w / 2, py, w * f, Math.max(1, bh * 0.35));   // a little shine
    }
    if (showName) {
      const name = (m.champion ? "Champion " : "") + m.T.name, fs = Math.round(LABELS.nameSize * zoom);
      ctx.font = `700 ${fs}px Oswald, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
      const ny = py - (showBar ? 4 : 0);
      ctx.lineWidth = 3; ctx.strokeStyle = "rgba(5,2,12,.9)"; ctx.strokeText(name, px, ny);
      ctx.fillStyle = m.champion ? LABELS.championNameColor : LABELS.nameColor; ctx.fillText(name, px, ny);
      ctx.textAlign = "start"; ctx.textBaseline = "alphabetic";
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
    const ice = isFinal(floorNo);
    ctx.fillStyle = "#1a0c08"; ctx.fillRect(px - 2, py, 4, 10 * zoom);
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    const r = (19 + fl * 4) * zoom, g = ctx.createRadialGradient(px, py - 6, 0, px, py - 6, r);
    if (ice) { g.addColorStop(0, "rgba(230,250,255,1)"); g.addColorStop(0.4, "rgba(120,190,255,0.75)"); g.addColorStop(1, "rgba(60,120,255,0)"); }
    else { g.addColorStop(0, "rgba(255,240,170,1)"); g.addColorStop(0.35, "rgba(255,110,30,0.8)"); g.addColorStop(1, "rgba(200,20,0,0)"); }
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(px, py - 8 * zoom, r * 0.7, r * 1.15, 0, 0, 6.28); ctx.fill(); ctx.restore();
  }

  // Embers drifting up around the hero (frost motes on the frozen last floor). Cheap: about 60 small dots.
  let embers = [], emberT = 0;
  function drawEmbers(now) {
    if (!HELL.embers) return;
    const dt = Math.min(0.1, (now - (emberT || now)) / 1000); emberT = now;
    const ice = isFinal(floorNo);
    while (embers.length < 60) embers.push({ x: hero.x + rand(-10, 10), y: hero.y + rand(-10, 10), z: rand(0, 3), vz: ice ? -rand(0.2, 0.5) : rand(0.4, 1.2), vx: rand(-0.3, 0.3), life: rand(2, 5), age: 0, s: rand(1.2, 2.6) });
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    for (const e of embers) {
      e.age += dt; e.z += e.vz * dt; e.x += e.vx * dt + Math.sin(now / 700 + e.life * 9) * 0.004;
      const a = Math.max(0, Math.min(1, e.age / 0.5, (e.life - e.age) / 1));
      ctx.fillStyle = ice ? `rgba(210,235,255,${0.7 * a})` : `rgba(255,${120 + Math.round(e.life * 20)},40,${0.8 * a})`;
      ctx.fillRect(sx(e.x, e.y), sy(e.x, e.y, e.z), e.s * zoom, e.s * zoom);
    }
    ctx.restore();
    embers = embers.filter(e => e.age < e.life && e.z > -0.5 && Math.abs(e.x - hero.x) < 12 && Math.abs(e.y - hero.y) < 12);
  }
  function draw(now) {
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = isFinal(floorNo) ? "#02050c" : "#0c0203"; ctx.fillRect(0, 0, W, H);
    if (!grid) return;
    let tx = isoX(hero.x, hero.y), ty = isoY(hero.x, hero.y);
    const bi = introK();                                              // boss intro: the camera leans toward the boss
    if (bi) { const k = Math.sin(Math.PI * Math.min(1, bi.p * 1.15)) * 0.5; tx += (isoX(bi.m.x, bi.m.y) - tx) * k; ty += (isoY(bi.m.x, bi.m.y) - ty) * k; }
    cam.x += (tx - cam.x) * (bi ? 0.08 : 0.2); cam.y += (ty - cam.y) * (bi ? 0.08 : 0.2);
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
    lctx.globalCompositeOperation = "source-over"; lctx.fillStyle = (isFinal(floorNo) ? "rgba(2,4,14," : "rgba(16,2,2,") + (state === "play" || state === "dead" || state === "paused" ? "0.93)" : "0.6)"); lctx.fillRect(0, 0, light.width, light.height);
    lctx.globalCompositeOperation = "destination-out";
    const hole = (x, y, r, a = 1) => { const px = sx(x, y) / 2, py = sy(x, y, 0.4) / 2, rr = r * TW * 0.8 * zoom / 2; const g = lctx.createRadialGradient(px, py, 0, px, py, rr); g.addColorStop(0, `rgba(0,0,0,${a})`); g.addColorStop(0.6, `rgba(0,0,0,${a * 0.7})`); g.addColorStop(1, "rgba(0,0,0,0)"); lctx.fillStyle = g; lctx.beginPath(); lctx.arc(px, py, rr, 0, 6.28); lctx.fill(); };
    hole(hero.x, hero.y, LIGHT * 1.15);
    for (const t of torches) hole(t.x + 0.6, t.y + 0.6, 3.3 + Math.sin(now / 90 + t.phase) * 0.2, 0.85);
    for (const s of shots) hole(s.x, s.y, s.kind === "fire" ? 2.2 : 1.4, 0.9);
    for (const f of fx) if (f.ring) hole(f.x, f.y, f.r * 2, f.life * 0.8);
    for (const l of loot) if (l.kind === "item" && l.item.rarity !== "common") hole(l.x, l.y, 1.2, 0.6);
    hole(stairs.x + 0.5, stairs.y + 0.5, isFinal(floorNo) && !bossAlive ? 4 : 2, 0.6);
    for (let y = (hero.y | 0) - 10; y <= (hero.y | 0) + 10; y++) for (let x = (hero.x | 0) - 10; x <= (hero.x | 0) + 10; x++)   // lava glows in the dark
      if (x >= 0 && y >= 0 && x < MAPW && y < MAPH && grid[idx(x, y)] === 1 && explored[idx(x, y)] && isLava(x, y)) hole(x + 0.5, y + 0.5, 1.6, isFinal(floorNo) ? 0.25 : 0.55);
    ctx.drawImage(light, 0, 0, W, H);
    // 5. Warm torch light and the hero's faint glow on top.
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    for (const t of torches) if (Math.hypot(t.x - hero.x, t.y - hero.y) < 14) glowAt(t.x + 0.6, t.y + 0.6, 0, 140 + Math.sin(now / 90 + t.phase) * 8, isFinal(floorNo) ? "90,160,255" : "255,70,20", 0.15);
    glowAt(hero.x, hero.y, 0.5, 200, "255,228,170", 0.09);              // the angel's holy light
    ctx.restore();
    drawEmbers(now);                                                  // embers rising through Hell (snow in Cocytus)
    drawGod(now);                                                     // Power of God: light beams and the white flash
    drawAngel(now);                                                   // Archangel: Gabriel, the shield, lances of light
    drawHouses(now);                                                  // the Houses: Jacob's ladder and spirits, Isaac's ram
    // 6. Floating numbers (not darkened).
    for (const n of nums) {
      ctx.globalAlpha = Math.min(1, n.life * 1.5);
      ctx.font = `800 ${Math.round((n.big ? 20 : 14) * zoom)}px Oswald, sans-serif`; ctx.textAlign = "center";
      ctx.fillStyle = "#000"; ctx.fillText(n.text, sx(n.x, n.y) + 1, sy(n.x, n.y, 1.4 + (1 - n.life) * 1.3) + 1);
      ctx.fillStyle = n.color; ctx.fillText(n.text, sx(n.x, n.y), sy(n.x, n.y, 1.4 + (1 - n.life) * 1.3));
    }
    ctx.globalAlpha = 1; ctx.textAlign = "start";
    drawBossIntro();                                                  // cinematic boss intro: vignette and the giant name
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
  // Boss intro progress (0..1) while it plays, else null.
  function introK() {
    if (!bossIntro) return null;
    const p = (performance.now() - bossIntro.t0) / bossIntro.dur;
    if (p >= 1 || !monsters.includes(bossIntro.m) || state !== "play") { bossIntro = null; return null; }
    return { p, m: bossIntro.m, ice: bossIntro.ice };
  }
  function drawBossIntro() {
    const bi = introK(); if (!bi) return;
    const p = bi.p, a = Math.min(1, p / 0.12) * Math.min(1, (1 - p) / 0.2);
    // Darkened edges.
    const r = Math.hypot(W, H) / 2, g = ctx.createRadialGradient(W / 2, H / 2, r * 0.25, W / 2, H / 2, r);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, `rgba(0,0,0,${0.88 * a})`);
    ctx.save(); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // Cinema bars.
    const bar = H * 0.09 * a; ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, bar); ctx.fillRect(0, H - bar, W, bar);
    // The giant name: fiery orange-red, icy blue for Satan in Cocytus.
    const name = bi.m.T.name.toUpperCase(), sub = bi.m.type === "satan" ? "THE ADVERSARY" : "GUARDIAN OF THE CIRCLE";
    let size = Math.min(150, W * 0.14); ctx.font = `800 ${size}px Oswald, sans-serif`;
    const tw = ctx.measureText(name).width; if (tw > W * 0.9) { size *= W * 0.9 / tw; ctx.font = `800 ${size}px Oswald, sans-serif`; }
    const sc = 1 + 0.25 * Math.pow(1 - Math.min(1, p / 0.2), 3), cy = H * 0.42;
    ctx.translate(W / 2, cy); ctx.scale(sc, sc); ctx.globalAlpha = a; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const lg = ctx.createLinearGradient(0, -size / 2, 0, size / 2);
    if (bi.ice) { lg.addColorStop(0, "#ffffff"); lg.addColorStop(0.5, "#bfe6ff"); lg.addColorStop(1, "#3a8bff"); }
    else { lg.addColorStop(0, "#fff2a8"); lg.addColorStop(0.45, "#ff8a2b"); lg.addColorStop(1, "#d81e10"); }
    const glow = bi.ice ? "#5ab4ff" : "#ff3b1f", flick = 0.85 + Math.sin(performance.now() / 45) * 0.15;
    ctx.shadowColor = glow; ctx.shadowBlur = 40 * flick; ctx.fillStyle = lg; ctx.fillText(name, 0, 0);
    ctx.shadowBlur = 12; ctx.fillText(name, 0, 0);
    ctx.shadowBlur = 0; ctx.lineWidth = 2; ctx.strokeStyle = bi.ice ? "rgba(230,248,255,.7)" : "rgba(255,230,160,.6)"; ctx.strokeText(name, 0, 0);
    // Subtitle with lines either side.
    const ss = Math.max(14, size * 0.2); ctx.font = `600 ${ss}px Oswald, sans-serif`;
    const sw = ctx.measureText(sub.split("").join(" ")).width, y2 = size * 0.62, lw = Math.min(W * 0.3, size * 2) * Math.min(1, p / 0.35);
    ctx.fillStyle = bi.ice ? "#d8f0ff" : "#ffd0a0"; ctx.shadowColor = glow; ctx.shadowBlur = 10; ctx.fillText(sub.split("").join(" "), 0, y2);
    ctx.fillRect(-sw / 2 - 16 - lw, y2 - 1, lw, 2); ctx.fillRect(sw / 2 + 16, y2 - 1, lw, 2);
    ctx.restore(); ctx.textAlign = "start"; ctx.textBaseline = "alphabetic";
  }
  function drawHoverLabel() {
    const boss = monsters.find(m => m.T.boss && m.aggro);
    const t = boss || (mouseIn ? hoverTarget() : null);
    if (!t || !t.T) return;
    const bi = boss && t === boss ? introK() : null;                  // the boss bar slides in during the intro
    const w = Math.min(420, W * 0.5), x = (W - w) / 2, y = bi ? -30 + 94 * Math.pow(Math.min(1, Math.max(0, (bi.p - 0.3) / 0.4)), 0.5) : 64;
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
    $(".arpg-floor").textContent = "CIRCLE " + ROMAN(floorNo) + " · " + circleOf(floorNo)[0].split(" · ")[0]; $(".arpg-gold").textContent = "◆ " + hero.gold; $(".arpg-lvl").textContent = "LV " + hero.lvl;
    $(".arpg-hpn").textContent = hero.potions.hp; $(".arpg-mpn").textContent = hero.potions.mp;
    const holy = Math.floor(hero.holy || 0), full = holy >= 100;
    $(".arpg-holy b").style.width = holy + "%"; $(".arpg-holy span").textContent = full ? "✝ HOLY POWER 100%" : "HOLY POWER " + holy + "%";
    $(".arpg-holy").classList.toggle("full", full); $(".arpg-godbtn").hidden = !full;
    const gos = Math.floor(hero.gospel || 0), gfull = gos >= 100, aon = angelOn();
    $(".arpg-gospel b").style.width = (aon ? Math.max(0, (angel.until - performance.now()) / (GOSPEL.seconds * 10)) : gos) + "%";
    $(".arpg-gospel span").textContent = aon ? "✦ GABRIEL IS WITH YOU" : gfull ? "✦ HOLY GOSPEL 100%" : "HOLY GOSPEL " + gos + "%";
    $(".arpg-gospel").classList.toggle("full", gfull || aon); $(".arpg-angelbtn").hidden = !gfull || aon;
    for (const k of ["abraham", "isaac", "jacob"]) {
      const b = root.querySelector(`[data-act="${k}"]`), locked = hero.lvl < HOUSES[k].level;
      b.style.setProperty("--cd", locked ? 1 : hero.cds[k] / (HOUSES[k].cooldown * 1000)); b.classList.toggle("locked", locked);
      b.querySelector("small").textContent = locked ? "LV " + HOUSES[k].level : { abraham: "Abraham", isaac: "Isaac", jacob: "Jacob" }[k];
    }
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
  root.querySelector(".arpg-godbtn").addEventListener("click", e => { e.stopPropagation(); powerOfGod(); });
  root.querySelector(".arpg-angelbtn").addEventListener("click", e => { e.stopPropagation(); archangel(); });
  root.querySelector(".arpg-bar").addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b || state !== "play") return;
    const a = b.dataset.act;
    if (a === "fireball") { const t = nearestVisible(); if (t) castFireball(t.x, t.y); else castFireball(hero.x + Math.cos(hero.face) * 3, hero.y + Math.sin(hero.face) * 3); }
    if (a === "nova") castNova();
    if (a === "abraham") houseAbraham();
    if (a === "isaac") houseIsaac();
    if (a === "jacob") houseJacob();
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
  // Zoom: mouse wheel, the + / - buttons, and a two-finger pinch on touch screens.
  canvas.addEventListener("wheel", e => { if (state !== "play") return; e.preventDefault(); zoomBy(Math.exp(-clamp(e.deltaY, -120, 120) * 0.0018)); }, { passive: false });
  const zoomBar = root.querySelector(".arpg-zoom");
  zoomBar.addEventListener("click", e => { const b = e.target.closest("button"); if (b) zoomBy(b.dataset.zoom === "in" ? 1.2 : 1 / 1.2); });
  const touches = new Map(); let pinch = 0;
  const pinchGap = () => { const [a, b] = [...touches.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  canvas.addEventListener("pointerdown", e => { if (e.pointerType === "mouse") return; touches.set(e.pointerId, local(e)); if (touches.size === 2) { holdMove = null; pinch = pinchGap(); } });
  canvas.addEventListener("pointermove", e => {
    if (!touches.has(e.pointerId)) return;
    touches.set(e.pointerId, local(e));
    if (touches.size === 2 && pinch) { const g = pinchGap(); zoomBy(g / pinch); pinch = g; holdMove = null; }
  });
  for (const ev of ["pointerup", "pointercancel"]) canvas.addEventListener(ev, e => { touches.delete(e.pointerId); if (touches.size < 2) pinch = 0; });
  window.addEventListener("keydown", e => {
    const r = section.getBoundingClientRect(), onScreen = takeover || (r.bottom > 0 && r.top < innerHeight);
    if (onScreen && !(e.target.closest && e.target.closest("input, textarea, select"))) {   // hidden gamemaster panel: Ctrl+Shift+G, or type g then m
      const k0 = e.key.toLowerCase(), gmKey = (e.ctrlKey && e.shiftKey && k0 === "g") || (k0 === "m" && !e.ctrlKey && performance.now() - (gm.g || 0) < 1200);
      gm.g = k0 === "g" && !e.ctrlKey ? performance.now() : 0;
      if (gmKey) { e.preventDefault(); e.stopImmediatePropagation(); gmToggle(); return; }
    }
    if (state !== "play" || !takeover || (e.target.closest && e.target.closest("input, textarea, select"))) return;
    const k = e.key.toLowerCase(), handled = { "1": 1, "2": 1, "3": 1, "4": 1, "5": 1, e: 1, r: 1, q: 1, w: 1, c: 1, escape: 1, "+": 1, "=": 1, "-": 1, "_": 1 };
    if (!handled[k]) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (k === "1") castFireball(mouseWorld.x, mouseWorld.y);
    if (k === "2") castNova();
    if (k === "e") powerOfGod();
    if (k === "3") houseAbraham();
    if (k === "4") houseIsaac();
    if (k === "5") houseJacob();
    if (k === "r") archangel();
    if (k === "q") drink("hp");
    if (k === "w") drink("mp");
    if (k === "c") toggleSheet();
    if (k === "escape") toggleSheet(false);
    if (k === "+" || k === "=") zoomBy(1.2);
    if (k === "-" || k === "_") zoomBy(1 / 1.2);
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
  function showUI(on) { for (const el of [hud, infoEl, mini, zoomBar]) el.hidden = !on; exitBtn.hidden = !(on || takeover); section.classList.toggle("arpg-on", on); if (!on) { toggleSheet(false); tipEl.hidden = true; } }
  function showIntro(html) { if (html) intro.innerHTML = html; intro.hidden = false; showUI(false); }
  function introButtons() {
    const saved = store.get();
    intro.querySelector(".arpg-buttons").innerHTML = saved
      ? `<button type="button" class="arpg-play" data-go="continue">▶ CONTINUE · LV ${saved.lvl} · CIRCLE ${ROMAN(saved.floor || 1)}</button><button type="button" class="arpg-play arpg-alt" data-go="new">✦ NEW HERO</button>`
      : `<button type="button" class="arpg-play" data-go="new">▶ PLAY UNDERCITY</button>`;
  }
  function start(mode) {
    if (!artGone) { clearTimeout(artTimer); fadeArt(); }
    intro.classList.remove("arpg-intro-cover", "arpg-intro-ascend");
    enterWindow(); resize();
    const saved = store.get();
    if (mode === "continue" && saved) { hero = Object.assign(newHero(), saved, { potions: saved.potions || { hp: 3, mp: 2 } }); floorNo = saved.floor || 1; }
    else if (mode === "retry" && hero) { /* keep the hero, same floor */ }
    else if (mode === "ascend" && hero) { floorNo = 1; }
    else { hero = newHero(); floorNo = 1; }
    const s = stats(); hero.hp = s.maxHp; hero.mp = s.maxMp; hero.cds = { fireball: 0, nova: 0, abraham: 0, isaac: 0, jacob: 0 };
    enterFloor(floorNo);
    cam.x = isoX(hero.x, hero.y); cam.y = isoY(hero.x, hero.y);
    state = "play"; intro.hidden = true; showUI(true); renderHud();
  }
  root.addEventListener("click", e => { const b = e.target.closest(".arpg-play"); if (b) start(b.dataset.go); });
  exitBtn.addEventListener("click", () => {
    if (state === "play") { state = "paused"; save(); }
    leaveWindow();
    showIntro(`<p class="arpg-kicker">PAUSED · CIRCLE ${ROMAN(floorNo)}</p><h3>Undercity</h3><p>Your hero is saved.</p><div class="arpg-buttons"><button type="button" class="arpg-play" data-go="resume">▶ RESUME</button></div>`);
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
  // ================================================ GAMEMASTER (hidden: Ctrl + Shift + G) ================================================
  const gm = { god: false, el: null, g: 0 };
  if (/[?&]gm/.test(location.search)) setTimeout(gmToggle, 500);   // or open the page with ?gm
  function gmToggle() {
    if (!gm.el) {
      const st = document.createElement("style");
      st.textContent = `.arpg-gm{position:absolute;top:100px;right:16px;z-index:30;width:250px;padding:12px 12px 10px;border-radius:14px;background:rgba(14,4,30,.92);border:1px solid #b46cff;box-shadow:0 0 24px rgba(255,43,214,.45);font:600 12px Oswald,sans-serif;color:#f2e4ff;letter-spacing:.04em}
.arpg-gm h4{margin:0 0 8px;font:800 16px Oswald,sans-serif;letter-spacing:.12em;background:linear-gradient(90deg,#ff2bd6,#b46cff);-webkit-background-clip:text;background-clip:text;color:transparent}
.arpg-gm small{display:block;margin:8px 0 4px;color:#b9a3d9;font-size:10px;letter-spacing:.14em}
.arpg-gm .row{display:flex;flex-wrap:wrap;gap:4px}
.arpg-gm button{flex:1 1 auto;min-width:22px;padding:5px 6px;border-radius:7px;border:1px solid rgba(180,108,255,.6);background:rgba(60,20,110,.6);color:#fff;font:700 11px Oswald,sans-serif;cursor:pointer}
.arpg-gm button:hover{background:#ff2bd6;border-color:#ff2bd6}
.arpg-gm button.on{background:linear-gradient(90deg,#ffd84a,#ff8a2b);color:#200;border-color:#ffd84a}
.arpg-gm .x{position:absolute;top:8px;right:10px;flex:none;padding:2px 7px;background:none;border:none}`;
      document.head.appendChild(st);
      gm.el = document.createElement("div"); gm.el.className = "arpg-gm"; gm.el.hidden = true;
      gm.el.innerHTML = `<h4>GAMEMASTER</h4><button type="button" class="x" data-gm="close">✕</button>
        <small>JUMP TO CIRCLE</small><div class="row">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button type="button" data-gm="floor" data-n="${n}">${ROMAN(n)}</button>`).join("")}</div>
        <small>BOSS</small><div class="row"><button type="button" data-gm="awaken">Face the boss</button><button type="button" data-gm="slay">Slay boss</button><button type="button" data-gm="stairs">Go to stairs</button></div>
        <small>HERO</small><div class="row"><button type="button" data-gm="god">God mode</button><button type="button" data-gm="lvl">+5 levels</button><button type="button" data-gm="heal">Full heal</button></div>
        <div class="row" style="margin-top:4px"><button type="button" data-gm="holy">Holy 100%</button><button type="button" data-gm="gospel">Gospel 100%</button><button type="button" data-gm="gold">+1000 gold</button><button type="button" data-gm="loot">Drop relic</button></div>`;
      for (const ev of ["pointerdown", "mousedown", "click", "wheel", "contextmenu"]) gm.el.addEventListener(ev, e => e.stopPropagation());
      gm.el.addEventListener("click", e => { const b = e.target.closest("[data-gm]"); if (b) gmDo(b.dataset.gm, +b.dataset.n || 0, b); });
      root.appendChild(gm.el);
    }
    gm.el.hidden = !gm.el.hidden;
  }
  function gmDo(act, n, btn) {
    if (act === "close") { gm.el.hidden = true; return; }
    if (state !== "play") start(store.get() ? "continue" : "new");
    const s = stats();
    if (act === "floor") { floorNo = n; enterFloor(n); cam.x = isoX(hero.x, hero.y); cam.y = isoY(hero.x, hero.y); }
    if (act === "awaken") { const b = monsters.find(m => m.T.boss); if (!b) return say("NO BOSS ON THIS CIRCLE", 1600); b.aggro = false; b.spotAt = 0; for (let d = 2; d < 7; d++) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { const p = { x: b.x + dx * d, y: b.y + dy * d }; if (grid[idx(p.x | 0, p.y | 0)] === 1 && lineOfSight(b, p)) { hero.x = p.x; hero.y = p.y; d = 9; break; } } }
    if (act === "slay") { const b = monsters.find(m => m.T.boss); if (b) { b.hp = 0; killMonster(b); } }
    if (act === "stairs") { hero.x = stairs.x + 0.5; hero.y = stairs.y + 1.5; if (grid[idx(hero.x | 0, hero.y | 0)] !== 1) hero.y = stairs.y + 0.5; }
    if (act === "god") { gm.god = !gm.god; btn.classList.toggle("on", gm.god); say(gm.god ? "GOD MODE ON" : "GOD MODE OFF", 1400, "#ffd84a"); }
    if (act === "lvl") { hero.lvl += 5; hero.xp = 0; const t = stats(); hero.hp = t.maxHp; hero.mp = t.maxMp; }
    if (act === "heal") { hero.hp = s.maxHp; hero.mp = s.maxMp; }
    if (act === "holy") hero.holy = 100;
    if (act === "gospel") hero.gospel = 100;
    if (act === "gold") hero.gold += 1000;
    if (act === "loot") loot.push({ kind: "item", item: makeItem(floorNo + 5, 0.6), x: hero.x + 0.4, y: hero.y, bob: 0 });
    renderHud(); save();
  }
  window.neonARPG = { render: () => draw(performance.now()), state: () => ({ state, floor: floorNo, lvl: hero && hero.lvl, hp: hero && Math.round(hero.hp), gold: hero && hero.gold, monsters: monsters.length, loot: loot.length, gear: hero && Object.values(hero.gear).map(i => i.name) }),
    start, step: ms => { for (let t = 0; t < ms && state === "play"; t += 16) update(16); renderHud(); }, give: n => { hero.gold += n; }, holy: n => { hero.holy = n; renderHud(); }, gospel: n => { hero.gospel = n; renderHud(); }, level: n => { hero.lvl = n; renderHud(); }, floor: n => { enterFloor(n); renderHud(); }, boss: () => { const b = monsters.find(m => m.T.boss); return b && { name: b.T.name, x: b.x, y: b.y, hp: b.hp }; }, awaken: () => { const b = monsters.find(m => m.T.boss); if (b) { b.aggro = false; b.spotAt = 0; for (let d = 2; d < 7; d++) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { const p = { x: b.x + dx * d, y: b.y + dy * d }; if (grid[idx(p.x | 0, p.y | 0)] === 1 && lineOfSight(b, p)) { hero.x = p.x; hero.y = p.y; return true; } } } return !!b; }, slay: () => { const b = monsters.find(m => m.T.boss); if (b) { b.hp = 0; killMonster(b); } }, item: () => { const it = makeItem(5, 0.5); loot.push({ kind: "item", item: it, x: hero.x + 0.3, y: hero.y, bob: 0 }); return it.name; }, stairs: () => { bossAlive = false; hero.x = stairs.x + 0.5; hero.y = stairs.y + 0.5; }, nearest: () => { const m = nearestVisible(); return m && { type: m.type, x: m.x, y: m.y }; }, attack: () => { const m = monsters.reduce((b, m) => !b || dist(m, hero) < dist(b, hero) ? m : b, null); if (m) { hero.target = m; } return m && m.type; } };
})();
