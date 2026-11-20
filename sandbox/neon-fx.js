// neon-fx.js: the two "music video" effects for the neon preview (sandbox/neon-home.html).
//
//   1. PARTICLES: glowing sparks drifting up over the hero, light streaks that shoot across now and then, and bursts
//      of sparks whenever a headline word lands. Sparks move away from the mouse.
//   2. KINETIC HEADLINE: the headline's words punch in one at a time in strobing colours, run a colour wave, then
//      settle to white with an RGB-split glow and the odd glitch, and start again.
//
// Safety: colours change at most about 3 times a second (the accessibility limit for flashing). People who turn on
// "reduce motion" in their system settings get a plain white headline and no particles.
// Everything is inside one function, so its names never clash with the site's own scripts.

(function () {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) return;

  // The business messages that flash in where the headline is, one after another. Change these freely.
  const MESSAGES = [
    "Free to use.",
    "Open source.",
    "Your site. Your code.",
    "Deploy in seconds.",
    "No lock-in.",
    "Export everything.",
    "Launch today.",
  ];
  const MESSAGES_PER_CYCLE = 4;   // how many messages play before the headline comes back

  // The neon colours both effects use.
  const PALETTE = ["#ffffff", "#ff2bd6", "#ff6ec7", "#b04dff", "#8a3ffc", "#ff8a2b"];   // white, pinks, purples, a little orange
  const pick = list => list[Math.floor(Math.random() * list.length)];
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

  // ===============================================================================================================
  // 1. PARTICLES
  // ===============================================================================================================
  const canvas = document.getElementById("neon-particles");
  const ctx = canvas.getContext("2d");
  const hero = document.querySelector(".hero");
  let W = 0, H = 0;
  const sparks = [];      // burst sparks thrown out when a headline word lands
  const streaks = [];     // light streaks shooting across the screen
  const mouse = { x: -9999, y: -9999 };

  // A soft glowing dot for each colour, drawn once and reused (much faster than drawing a glow every frame).
  const sprites = {};
  function sprite(color) {
    if (sprites[color]) return sprites[color];
    const size = 64, c = document.createElement("canvas");
    c.width = c.height = size;
    const g = c.getContext("2d");
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(0.18, color);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    return (sprites[color] = c);
  }

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * ratio);
    canvas.height = Math.round(H * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  window.addEventListener("resize", resize);
  window.addEventListener("pointermove", e => { mouse.x = e.clientX; mouse.y = e.clientY; });
  window.addEventListener("pointerleave", () => { mouse.x = mouse.y = -9999; });

  // ---- Depth dots: tiny points that appear in the foreground and fly away into the distance ----
  // Each dot has a position measured from the vanishing point (the middle of the horizon, where the floor's lines
  // meet) and a depth z. As z grows, the dot slides towards the vanishing point and shrinks: on screen it sits at
  // vanishingPoint + position / z and is DOT_SIZE / z pixels wide. It disappears when it's too small to see.
  const DOTS = {
    density: 1500,     // one dot per this many square pixels of screen (smaller number = more dots)
    max: 380,          // never more than this many
    size: 2.2,         // size in pixels when a dot first appears in the foreground
    speed: 0.0065,     // how fast they fly away (each frame z grows by this fraction)
    farthest: 14,      // depth at which a dot is gone
    horizon: 0.40,     // the vanishing point's height (matches the floor's horizon in neon-bg.js)
  };
  const DOT_COLORS = ["#ffffff", "#ffffff", "#ffd1f0", "#ff6ec7", "#ff2bd6", "#c48bff", "#b04dff", "#ff8a2b"];
  const dots = [];

  function newDot(anyDepth) {
    const vx = W / 2, vy = H * DOTS.horizon;
    return {
      // Where it appears: anywhere on screen (a little beyond the edges too), relative to the vanishing point.
      x: Math.random() * W * 1.2 - W * 0.1 - vx,
      y: Math.random() * H * 1.2 - H * 0.1 - vy,
      // New dots start right in front (z = 1). At the very start, dots are spread through all depths.
      z: anyDepth ? 1 + Math.random() * (DOTS.farthest - 1) : 1,
      size: DOTS.size * (0.7 + Math.random() * 0.6),
      speed: DOTS.speed * (0.6 + Math.random() * 0.8),
      color: pick(DOT_COLORS),
      age: anyDepth ? 1 : 0,   // fades in over its first moments, so dots don't pop into view
    };
  }

  // ---- Reacting to the mouse ----
  const HOVER_RADIUS = 150;     // dots closer than this to the pointer get pushed aside and light up
  const THREAD_RADIUS = 120;    // dots closer than this get a faint thread to the pointer
  const shockwaves = [];        // rings spreading out from clicks
  let warp = 0;                 // 0 = normal speed; jumps to 1 on a click, then eases back down

  // Click anywhere on the hero: a shockwave, a spray of dots into the distance, sparks, and a burst of warp speed.
  window.addEventListener("pointerdown", e => {
    if (canvas.style.opacity === "0" || e.button !== 0) return;
    const x = e.clientX, y = e.clientY;
    shockwaves.push({ x, y, r: 0, life: 1 });
    warp = 1;
    burst(x, y, pick(["#ff2bd6", "#b04dff", "#ff8a2b"]), 18);
    const vx = W / 2, vy = H * DOTS.horizon;
    for (let i = 0; i < 24; i++) {
      // New dots that start exactly at the click (z = 1) and race away towards the vanishing point.
      const spread = 90;
      dots.push({
        x: x - vx + (Math.random() - 0.5) * spread, y: y - vy + (Math.random() - 0.5) * spread,
        z: 1, size: DOTS.size * (0.8 + Math.random()), speed: DOTS.speed * (1.5 + Math.random() * 2),
        color: pick(DOT_COLORS), age: 1, ox: (Math.random() - 0.5) * 40, oy: (Math.random() - 0.5) * 40, hot: 0.25, extra: true,
      });
    }
  });

  function drawDots() {
    const vx = W / 2, vy = H * DOTS.horizon;
    const wanted = Math.min(DOTS.max, Math.round((W * H) / DOTS.density));
    const firstFill = dots.length === 0;   // on the very first frame, spread dots through every depth
    while (dots.length < wanted) dots.push(newDot(firstFill));
    warp *= 0.965;                         // warp speed fades away over about a second
    const speedBoost = 1 + warp * 7;

    // Shockwave rings: grow, fade, and push any dot they pass over.
    for (let i = shockwaves.length - 1; i >= 0; i--) {
      const w = shockwaves[i];
      w.r += 16;
      w.life -= 0.022;
      if (w.life <= 0) { shockwaves.splice(i, 1); continue; }
      ctx.globalAlpha = w.life * 0.8;
      ctx.strokeStyle = w.life > 0.5 ? "#ff6ec7" : "#ff8a2b";
      ctx.lineWidth = 1 + w.life * 2;
      ctx.beginPath();
      ctx.arc(w.x, w.y, w.r, 0, Math.PI * 2);
      ctx.stroke();
    }

    const threads = [];
    for (let i = dots.length - 1; i >= 0; i--) {
      const d = dots[i];
      d.ox = d.ox || 0; d.oy = d.oy || 0; d.hot = d.hot || 0;
      const prevX = vx + d.x / d.z + d.ox, prevY = vy + d.y / d.z + d.oy;

      d.z *= 1 + d.speed * speedBoost;    // fly away (multiplying keeps the motion smooth at every depth)
      d.age = Math.min(1, d.age + 0.04);
      d.ox *= 0.93; d.oy *= 0.93;         // a pushed dot drifts back onto its path
      d.hot *= 0.95;                      // and cools down
      const size = d.size / d.z;
      if (d.z > DOTS.farthest || size < 0.15) {
        if (d.extra) dots.splice(i, 1); else dots[i] = newDot(false);
        continue;
      }

      let sx = vx + d.x / d.z + d.ox;
      let sy = vy + d.y / d.z + d.oy;

      // Hover: push the dot away from the pointer and light it up.
      const mx = sx - mouse.x, my = sy - mouse.y, dist = Math.sqrt(mx * mx + my * my);
      if (dist < HOVER_RADIUS) {
        const push = (1 - dist / HOVER_RADIUS) * 6;
        d.ox += (mx / (dist + 0.01)) * push;
        d.oy += (my / (dist + 0.01)) * push;
        d.hot = Math.max(d.hot, 1 - dist / HOVER_RADIUS);
        if (dist < THREAD_RADIUS) threads.push([sx, sy, 1 - dist / THREAD_RADIUS, d.color]);
      }
      // Shockwave: a ring passing over the dot kicks it outwards.
      for (const w of shockwaves) {
        const wx = sx - w.x, wy = sy - w.y, wd = Math.sqrt(wx * wx + wy * wy);
        if (Math.abs(wd - w.r) < 26) {
          d.ox += (wx / (wd + 0.01)) * 9 * w.life;
          d.oy += (wy / (wd + 0.01)) * 9 * w.life;
          d.hot = 1;
        }
      }

      // Fade with distance as well as shrinking, so they melt into the haze. Hot dots glow brighter and bigger.
      const alpha = Math.min(1, d.age * Math.min(1, 1.4 / Math.sqrt(d.z)) + d.hot * 0.6);
      const drawSize = size * (1 + d.hot * 1.8);

      // At warp speed, draw each dot as a streak from where it was to where it is.
      if (warp > 0.08) {
        ctx.globalAlpha = alpha * Math.min(1, warp * 1.5);
        ctx.strokeStyle = d.color;
        ctx.lineWidth = Math.max(0.5, drawSize);
        ctx.beginPath();
        ctx.moveTo(prevX, prevY);
        ctx.lineTo(sx, sy);
        ctx.stroke();
      }
      // A faint glow around the dot, then the bright dot itself.
      ctx.globalAlpha = alpha * (0.35 + d.hot * 0.4);
      const glow = drawSize * 5;
      ctx.drawImage(sprite(d.color), sx - glow, sy - glow, glow * 2, glow * 2);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = d.color;
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(0.3, drawSize / 2), 0, Math.PI * 2);
      ctx.fill();
    }

    // Threads from the pointer to the nearby dots, like a little constellation following the mouse.
    ctx.lineWidth = 0.7;
    for (const [tx, ty, strength, color] of threads) {
      ctx.globalAlpha = strength * 0.5;
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(mouse.x, mouse.y);
      ctx.lineTo(tx, ty);
      ctx.stroke();
    }
  }

  // A burst: sparks fly out in a ring from (x, y) and fade away. The headline calls this when a word lands.
  function burst(x, y, color, count = 26) {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.3;
      const speed = 2 + Math.random() * 5;
      sparks.push({
        x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        size: 6 + Math.random() * 12, color: Math.random() < 0.7 ? color : "#ffffff",
        twinkle: 0, life: 1, fade: 0.012 + Math.random() * 0.02,
      });
    }
  }

  // A fizzle: tiny embers come off a word from all over its letters, float up, flicker and die out.
  function fizzle(rect, count = 34) {
    for (let i = 0; i < count; i++) {
      sparks.push({
        x: rect.left + Math.random() * rect.width,
        y: rect.top + rect.height * (0.2 + Math.random() * 0.7),
        vx: (Math.random() - 0.5) * 1.2,
        vy: -(0.4 + Math.random() * 1.6),
        size: 2 + Math.random() * 4,
        color: pick(["#ffffff", "#ff8a2b", "#ff6ec7", "#ff2bd6", "#ffb36b"]),
        life: 1, fade: 0.018 + Math.random() * 0.025,
        ember: true,   // embers float upwards and flicker, instead of falling like burst sparks
      });
    }
  }

  // The floor (neon-bg.js) calls this when a hovered tile starts to fizzle away.
  window.neonFizzleAt = (left, top, width, height, count) => fizzle({ left, top, width, height }, count);

  // A light streak: a bright line that races across the screen, like a light trail in a long-exposure photo.
  function newStreak() {
    const leftToRight = Math.random() < 0.5;
    streaks.push({
      x: leftToRight ? -300 : W + 300,
      y: Math.random() * H * 0.9,
      speed: (leftToRight ? 1 : -1) * (18 + Math.random() * 20),
      length: 180 + Math.random() * 320,
      color: pick(PALETTE.slice(1)),
      width: 1 + Math.random() * 2.5,
    });
  }

  function tick() {
    // Fade the overlay out as the hero scrolls away, so the sparks don't sit over the rest of the page.
    const heroBottom = hero ? hero.getBoundingClientRect().bottom : H;
    const visible = Math.max(0, Math.min(1, heroBottom / H));
    canvas.style.opacity = visible;

    ctx.clearRect(0, 0, W, H);
    if (visible > 0.01) {
      ctx.globalCompositeOperation = "lighter";   // overlapping light adds up, like real glow

      // The depth dots flying away into the distance.
      drawDots();

      // Burst sparks from the headline.
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];

        // Push away from the mouse.
        const dx = s.x - mouse.x, dy = s.y - mouse.y, dist2 = dx * dx + dy * dy;
        if (dist2 < 14000) {
          const push = (14000 - dist2) / 14000;
          s.vx += (dx / Math.sqrt(dist2 + 1)) * push * 0.9;
          s.vy += (dy / Math.sqrt(dist2 + 1)) * push * 0.9;
        }

        // Burst sparks fly out, slow down and fall a little. Embers drift upwards and wobble. Both fade out.
        s.x += s.vx;
        s.y += s.vy;
        if (s.ember) { s.vx = s.vx * 0.97 + (Math.random() - 0.5) * 0.15; s.vy = s.vy * 0.98 - 0.02; }
        else { s.vx *= 0.95; s.vy = s.vy * 0.95 + 0.05; }
        s.life -= s.fade;
        if (s.life <= 0) { sparks.splice(i, 1); continue; }

        // Embers flicker as they die, like the last bits of a sparkler.
        ctx.globalAlpha = Math.max(0, s.life) * (s.ember ? 0.55 + Math.random() * 0.45 : 1);
        const size = s.size * (0.6 + s.life * 0.6);
        ctx.drawImage(sprite(s.color), s.x - size, s.y - size, size * 2, size * 2);
      }

      // Light streaks: now and then a new one, each a fading line with a bright head.
      if (Math.random() < 0.012) newStreak();
      for (let i = streaks.length - 1; i >= 0; i--) {
        const k = streaks[i];
        k.x += k.speed;
        if (k.x < -800 || k.x > W + 800) { streaks.splice(i, 1); continue; }
        const tail = k.x - Math.sign(k.speed) * k.length;
        const grad = ctx.createLinearGradient(tail, k.y, k.x, k.y);
        grad.addColorStop(0, "rgba(0,0,0,0)");
        grad.addColorStop(1, k.color);
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = grad;
        ctx.lineWidth = k.width;
        ctx.beginPath();
        ctx.moveTo(tail, k.y);
        ctx.lineTo(k.x, k.y);
        ctx.stroke();
        ctx.drawImage(sprite(k.color), k.x - 14, k.y - 14, 28, 28);
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }
    requestAnimationFrame(tick);
  }

  resize();
  requestAnimationFrame(tick);

  // ===============================================================================================================
  // 2. KINETIC HEADLINE
  // ===============================================================================================================
  const h1 = document.querySelector(".hero-card h1");
  if (!h1) return;
  h1.classList.add("kx");

  let words = [];
  let lastText = "";

  // Each word is made of one <span class="kx-letter"> per letter, so the game can shoot letters one at a time.
  function fillLetters(span, word) {
    for (const ch of word) {
      const letter = document.createElement("span");
      letter.className = "kx-letter";
      letter.textContent = ch;
      span.appendChild(letter);
    }
  }

  // Split the headline into one <span> per word. Done again whenever the text changes (e.g. a language switch).
  function split() {
    const text = h1.textContent.trim();
    if (text === lastText && words.length && words[0].isConnected) return;
    lastText = text;
    h1.textContent = "";
    words = text.split(/\s+/).map((word, i) => {
      const span = document.createElement("span");
      span.className = "kx-word";
      fillLetters(span, word);
      h1.appendChild(span);
      if (i < text.split(/\s+/).length - 1) h1.appendChild(document.createTextNode(" "));
      return span;
    });
    h1.setAttribute("aria-label", text);   // screen readers read the sentence, not the separate pieces
  }

  // Burst sparks from the middle of a word.
  function burstFrom(span, color) {
    const r = span.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height / 2, color);
  }

  // Fizzle a word out: it flickers like a dying neon tube while embers float off its letters.
  function fizzleOut(span, embers = 34) {
    span.classList.remove("kx-glitch");
    replay(span, "kx-fizzle");
    fizzle(span.getBoundingClientRect(), embers);
  }

  // Set a word's colour (the site uses text-fill-color, so the colour goes through a CSS variable).
  const paint = (span, color) => span.style.setProperty("--kx-color", color);

  // Restart a CSS animation on an element by removing and re-adding its class.
  function replay(span, cls) {
    span.classList.remove(cls);
    void span.offsetWidth;   // makes the browser notice the class was removed
    span.classList.add(cls);
  }

  // The message reel: a layer exactly on top of the headline. Screen readers skip it (it repeats on a loop).
  const reel = document.createElement("div");
  reel.className = "kx-reel";
  reel.setAttribute("aria-hidden", "true");
  h1.insertAdjacentElement("afterend", reel);
  let nextMessage = 0;

  // Put the reel exactly over the headline (the headline keeps its space, so nothing on the page jumps).
  function placeReel() {
    reel.style.top = h1.offsetTop + "px";
    reel.style.height = h1.offsetHeight + "px";
    // Use the same lettering as the headline.
    const look = getComputedStyle(h1);
    reel.style.fontFamily = look.fontFamily;
    reel.style.fontWeight = look.fontWeight;
    reel.style.letterSpacing = look.letterSpacing;
    reel.style.fontSize = look.fontSize;
  }

  // Play a few messages: each one's words punch in, it holds, then glitches away.
  async function playMessages() {
    // The headline fizzles out first, then the reel takes its place.
    words.forEach(w => fizzleOut(w, 18));
    await wait(560);
    placeReel();
    h1.classList.add("kx-away");
    for (let m = 0; m < MESSAGES_PER_CYCLE; m++) {
      const message = MESSAGES[nextMessage++ % MESSAGES.length];
      reel.textContent = "";
      const color = pick(PALETTE.slice(1));
      const spans = message.split(/\s+/).map(word => {
        const span = document.createElement("span");
        span.className = "kx-word kx-hidden";
        fillLetters(span, word);
        reel.appendChild(span);
        reel.appendChild(document.createTextNode(" "));
        return span;
      });
      for (const s of spans) {
        paint(s, "#ffffff");
        s.classList.remove("kx-hidden");
        replay(s, "kx-punch");
        burstFrom(s, color);
        await wait(340);
      }
      await wait(900);
      spans.forEach(s => fizzleOut(s));   // flicker and fizzle away into embers
      await wait(600);
    }
    reel.textContent = "";
    h1.classList.remove("kx-away");
  }

  async function cycle() {
    split();

    // Step 1: hide every word, then punch them in one at a time, each in a strobe colour with a burst of sparks.
    words.forEach(w => { w.classList.add("kx-hidden"); w.classList.remove("kx-glow", "kx-fizzle", "kx-glitch"); });
    await wait(500);
    for (const w of words) {
      paint(w, "#ffffff");                          // the words stay white; only the sparks are coloured
      w.classList.remove("kx-hidden");
      replay(w, "kx-punch");
      burstFrom(w, pick(PALETTE.slice(1)));
      await wait(360);   // about 3 words a second at most
    }

    // Step 2: a short pause with the words in place (the text stays white: no colour changes).
    await wait(900);

    // Step 3: settle to white with the RGB-split glow, and glitch a random word now and then.
    words.forEach(w => { paint(w, "#ffffff"); w.classList.add("kx-glow"); });
    for (let g = 0; g < 2; g++) {
      await wait(1400 + Math.random() * 900);
      const w = pick(words);
      replay(w, "kx-glitch");
      fizzle(w.getBoundingClientRect(), 10);   // a few embers spit off the glitching word
    }
    await wait(1200);

    // Step 4: the business messages take over for a moment, then the next cycle brings the headline back.
    await playMessages();
  }

  (async function loop() {
    // Wait for the site's own load animations and translations to finish before starting.
    await wait(1200);
    for (;;) await cycle();
  })();
})();
