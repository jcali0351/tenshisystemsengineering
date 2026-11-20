// neon-game.js: a little shooting game played with the mouse, on top of the neon hero (neon preview only).
//
//   - Neon objects fly across the sky: drones, saucers, spinning cubes, and now and then a rare golden star.
//   - Click (or tap) anywhere on the hero that isn't a link or button: twin lasers fire from the bottom corners
//     to that spot. Hit something and it explodes into shards with a score pop-up.
//   - Hits in quick succession build a COMBO that multiplies the points. Cubes split in two when hit.
//   - The more you score, the faster and busier it gets (LEVEL). Your best score is remembered on this device.
//   - The little panel at the top right shows the score; its button pauses or resumes the game.
// Links, buttons, the menu and the chat keep working normally: clicks on them never fire.
// People who turn on "reduce motion" don't get the game.
(function () {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  // ---- Settings you can play with ----
  const GAME = {
    hitRadius: 1.35,       // how forgiving aiming is (1 = must hit the object's body exactly)
    comboWindow: 1600,     // ms you have to land the next hit to keep a combo going
    baseSpawnEvery: 1300,  // ms between new objects at level 1 (gets shorter each level)
    pointsPerLevel: 250,   // score needed to go up a level
  };
  const TYPES = {
    drone:  { points: 10,  size: 16, speed: [1.2, 2.2], color: "#ff2bd6", weight: 5 },
    saucer: { points: 25,  size: 22, speed: [2.2, 3.4], color: "#b04dff", weight: 3 },
    cube:   { points: 15,  size: 18, speed: [1.0, 1.8], color: ["#ff8a2b", "#b04dff"], weight: 3 },   // each cube is orange or purple
    star:   { points: 100, size: 14, speed: [3.6, 4.8], color: "#ff8a2b", weight: 0.5 },
  };

  // ---- The canvas the game draws on (above the page, never catches clicks itself) ----
  const canvas = document.createElement("canvas");
  canvas.id = "neon-game";
  canvas.setAttribute("aria-hidden", "true");
  // z-index 1: above the neon floor but BEHIND the page content, so the flying objects never cover the headline.
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

  // ---- The score panel ----
  const hud = document.createElement("div");
  hud.className = "neon-hud";
  hud.innerHTML = `<div class="neon-hud-row"><span>SCORE</span><b id="ng-score">0</b></div>
    <div class="neon-hud-row"><span>COMBO</span><b id="ng-combo">x1</b></div>
    <div class="neon-hud-row"><span>LEVEL</span><b id="ng-level">1</b></div>
    <div class="neon-hud-row best"><span>BEST</span><b id="ng-best">0</b></div>
    <button type="button" id="ng-pause" aria-pressed="false">PAUSE</button>
    <p class="neon-hud-tip">Click the sky to shoot</p>`;
  document.body.appendChild(hud);
  const $ = id => document.getElementById(id);
  let best = 0;
  try { best = Number(localStorage.getItem("tenshi-neon-best")) || 0; } catch (e) { /* storage can be blocked: no best score then */ }
  $("ng-best").textContent = best;

  let paused = false;
  $("ng-pause").addEventListener("click", () => {
    paused = !paused;
    $("ng-pause").textContent = paused ? "PLAY" : "PAUSE";
    $("ng-pause").setAttribute("aria-pressed", String(paused));
    hud.classList.toggle("is-paused", paused);
  });

  // ---- Game state ----
  const objects = [], shards = [], beams = [], popups = [];
  let score = 0, combo = 1, lastHit = 0, level = 1, nextSpawn = 0;
  const hero = document.querySelector(".hero");
  const rand = (a, b) => a + Math.random() * (b - a);

  function heroOnScreen() {
    const r = hero ? hero.getBoundingClientRect() : { bottom: H };
    return r.bottom > H * 0.35;
  }

  // A new object enters from the left or right edge, somewhere in the sky, weaving up and down as it flies.
  function spawn() {
    const pool = Object.entries(TYPES).flatMap(([name, t]) => Array(Math.ceil(t.weight * 2)).fill(name));
    const kind = pool[Math.floor(Math.random() * pool.length)];
    const t = TYPES[kind];
    const fromLeft = Math.random() < 0.5;
    const speed = rand(...t.speed) * (1 + (level - 1) * 0.15);
    objects.push({
      kind, size: t.size, points: t.points,
      color: Array.isArray(t.color) ? t.color[Math.floor(Math.random() * t.color.length)] : t.color,   // a list = pick one
      x: fromLeft ? -40 : W + 40, y: rand(H * 0.12, H * 0.62), baseY: 0,
      vx: fromLeft ? speed : -speed, wobble: rand(10, 40), freq: rand(0.01, 0.025), phase: Math.random() * 6.28,
      spin: Math.random() * 6.28, born: performance.now(),
    });
    objects[objects.length - 1].baseY = objects[objects.length - 1].y;
  }

  // ---- Shooting ----
  window.addEventListener("pointerdown", e => {
    if (paused || e.button !== 0 || !heroOnScreen()) return;
    // Never shoot when the click is meant for something: links, buttons, form fields, the menu, the chat, the HUD.
    if (e.target.closest("a, button, input, textarea, select, label, .site-header, .tk-root, .neon-hud, .chaos-sticker")) return;
    const x = e.clientX, y = e.clientY, now = performance.now();
    beams.push({ x, y, life: 1 });

    // Did it hit anything? Nearest object within reach wins.
    let target = null, bestD = Infinity;
    for (const o of objects) {
      const d = Math.hypot(o.x - x, o.y - y);
      if (d < o.size * GAME.hitRadius + 6 && d < bestD) { target = o; bestD = d; }
    }
    if (!target) { combo = 1; burst(x, y, "#ffffff", 6, 2); updateHud(); return; }

    combo = now - lastHit < GAME.comboWindow ? Math.min(combo + 1, 9) : 1;
    lastHit = now;
    const points = target.points * combo;
    score += points;
    level = 1 + Math.floor(score / GAME.pointsPerLevel);
    popups.push({ x: target.x, y: target.y - 10, text: "+" + points + (combo > 1 ? "  x" + combo : ""), life: 1, color: target.color });
    explode(target);
    objects.splice(objects.indexOf(target), 1);
    // Cubes split into two smaller, faster cubes.
    if (target.kind === "cube" && target.size > 10) {
      for (const dir of [-1, 1]) objects.push({ ...target, size: target.size * 0.62, points: target.points + 5, vx: target.vx * 1.4, baseY: target.y + dir * 14, y: target.y, phase: target.phase + dir });
    }
    if (score > best) {
      best = score;
      try { localStorage.setItem("tenshi-neon-best", String(best)); } catch (err) { /* fine without it */ }
    }
    updateHud(true);
  });

  function updateHud(bump) {
    $("ng-score").textContent = score;
    $("ng-combo").textContent = "x" + combo;
    $("ng-level").textContent = level;
    $("ng-best").textContent = best;
    if (bump) { hud.classList.remove("bump"); void hud.offsetWidth; hud.classList.add("bump"); }
  }

  // ---- Explosions ----
  function burst(x, y, color, n, speed) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, v = rand(1, 4) * speed;
      shards.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, size: rand(1.5, 3.5), color, spin: 0, line: false });
    }
  }
  function explode(o) {
    // A ring of glowing dots, some spinning line shards, and a flash.
    burst(o.x, o.y, o.color, 26, 1.6);
    burst(o.x, o.y, "#ffffff", 10, 1.1);
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * 6.28, v = rand(2, 6);
      shards.push({ x: o.x, y: o.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, size: rand(6, 14), color: o.color, spin: rand(-0.3, 0.3), angle: a, line: true });
    }
    shards.push({ x: o.x, y: o.y, flash: true, life: 1, size: o.size * 3, color: o.color });
  }

  // ---- Drawing each kind of object ----
  function glow(color, blur) { ctx.shadowColor = color; ctx.shadowBlur = blur; }
  function drawObject(o, now) {
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.strokeStyle = o.color; ctx.fillStyle = o.color; ctx.lineWidth = 2;
    glow(o.color, 14);
    const s = o.size;
    if (o.kind === "drone") {                         // a diamond with a blinking core and little side wings
      ctx.rotate(Math.sin(now / 300 + o.phase) * 0.3);
      ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.7, 0); ctx.lineTo(0, s); ctx.lineTo(-s * 0.7, 0); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-s * 0.7, 0); ctx.lineTo(-s * 1.4, -s * 0.3); ctx.moveTo(s * 0.7, 0); ctx.lineTo(s * 1.4, -s * 0.3); ctx.stroke();
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(now / 120 + o.phase);
      ctx.beginPath(); ctx.arc(0, 0, s * 0.25, 0, 6.28); ctx.fill();
    } else if (o.kind === "saucer") {                 // a flying saucer: dome, body, a row of chasing lights
      ctx.beginPath(); ctx.ellipse(0, 0, s * 1.4, s * 0.45, 0, 0, 6.28); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -s * 0.2, s * 0.55, Math.PI, 0); ctx.stroke();
      for (let i = 0; i < 5; i++) {
        ctx.globalAlpha = ((Math.floor(now / 120) + i) % 5 === 0) ? 1 : 0.3;
        ctx.beginPath(); ctx.arc(-s + i * s * 0.5, s * 0.05, 2.2, 0, 6.28); ctx.fillStyle = i % 2 ? "#ff8a2b" : "#ffffff"; ctx.fill();
      }
    } else if (o.kind === "cube") {                   // a spinning wireframe cube
      o.spin += 0.04;
      const pts = [];
      for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
        const c1 = Math.cos(o.spin), s1 = Math.sin(o.spin), c2 = Math.cos(o.spin * 0.7), s2 = Math.sin(o.spin * 0.7);
        const x1 = x * c1 - z * s1, z1 = x * s1 + z * c1, y1 = y * c2 - z1 * s2;
        pts.push([x1 * s * 0.6, y1 * s * 0.6]);
      }
      ctx.beginPath();
      for (const [a, b] of [[0,1],[0,2],[0,4],[1,3],[1,5],[2,3],[2,6],[3,7],[4,5],[4,6],[5,7],[6,7]]) { ctx.moveTo(...pts[a]); ctx.lineTo(...pts[b]); }
      ctx.stroke();
    } else {                                          // the rare golden star, spinning and sparkling
      ctx.rotate(now / 250);
      ctx.beginPath();
      for (let i = 0; i < 10; i++) { const r = i % 2 ? s * 0.45 : s; ctx.lineTo(Math.cos(i * Math.PI / 5) * r, Math.sin(i * Math.PI / 5) * r); }
      ctx.closePath(); ctx.globalAlpha = 0.35; ctx.fill(); ctx.globalAlpha = 1; ctx.stroke();
    }
    ctx.restore();
  }

  // ---- The game loop ----
  function frame(now) {
    ctx.clearRect(0, 0, W, H);
    const live = heroOnScreen() && !paused;
    hud.classList.toggle("is-hidden", !heroOnScreen());

    if (live && now > nextSpawn && objects.length < 6 + level * 2) {
      spawn();
      nextSpawn = now + GAME.baseSpawnEvery / (1 + (level - 1) * 0.25) * rand(0.6, 1.3);
    }
    if (combo > 1 && now - lastHit > GAME.comboWindow) { combo = 1; updateHud(); }

    ctx.globalCompositeOperation = "lighter";
    // Objects
    for (let i = objects.length - 1; i >= 0; i--) {
      const o = objects[i];
      if (!paused) { o.x += o.vx; o.y = o.baseY + Math.sin(o.x * o.freq + o.phase) * o.wobble; }
      if (o.x < -80 || o.x > W + 80) { objects.splice(i, 1); continue; }
      if (heroOnScreen()) drawObject(o, now);
    }
    ctx.shadowBlur = 0;

    // Laser beams: twin lines from the bottom corners to where you clicked, fading fast.
    for (let i = beams.length - 1; i >= 0; i--) {
      const b = beams[i];
      b.life -= 0.09;
      if (b.life <= 0) { beams.splice(i, 1); continue; }
      for (const sx of [W * 0.06, W * 0.94]) {
        ctx.globalAlpha = b.life;
        ctx.strokeStyle = "#ff6ec7"; ctx.lineWidth = 6 * b.life; glow("#ff2bd6", 18);
        ctx.beginPath(); ctx.moveTo(sx, H); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(sx, H); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(b.x, b.y, 10 * b.life + 2, 0, 6.28); ctx.fillStyle = "#ffffff"; ctx.fill();
    }
    ctx.shadowBlur = 0;

    // Explosion pieces
    for (let i = shards.length - 1; i >= 0; i--) {
      const p = shards[i];
      p.life -= p.flash ? 0.08 : 0.022;
      if (p.life <= 0) { shards.splice(i, 1); continue; }
      ctx.globalAlpha = Math.max(0, p.life);
      if (p.flash) {
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
        g.addColorStop(0, "rgba(255,255,255,.9)"); g.addColorStop(0.4, p.color); g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.4 - p.life * 0.4), 0, 6.28); ctx.fill();
        continue;
      }
      p.x += p.vx; p.y += p.vy; p.vx *= 0.96; p.vy = p.vy * 0.96 + 0.06;
      if (p.line) {
        p.angle += p.spin;
        ctx.strokeStyle = p.color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(p.x - Math.cos(p.angle) * p.size / 2, p.y - Math.sin(p.angle) * p.size / 2);
        ctx.lineTo(p.x + Math.cos(p.angle) * p.size / 2, p.y + Math.sin(p.angle) * p.size / 2); ctx.stroke();
      } else {
        ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * p.life, 0, 6.28); ctx.fill();
      }
    }

    // Score pop-ups float up and fade.
    ctx.globalCompositeOperation = "source-over";
    ctx.font = "800 18px Oswald, 'Arial Narrow', sans-serif";
    ctx.textAlign = "center";
    for (let i = popups.length - 1; i >= 0; i--) {
      const p = popups[i];
      p.life -= 0.018; p.y -= 0.8;
      if (p.life <= 0) { popups.splice(i, 1); continue; }
      ctx.globalAlpha = p.life;
      glow(p.color, 12); ctx.fillStyle = "#ffffff"; ctx.fillText(p.text, p.x, p.y);
    }
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
