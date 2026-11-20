// neon-beasts.js: a DRAGON and a PHOENIX made of thousands of tiny fizzing particles, chasing each other round the
// sky behind the headline (neon preview only).
//
//   Dragon  (~2,700 specks): a long Eastern-style serpent, purple fading to pink. Shimmering scales, a ridge of spikes
//           along its back, a horned head with a glowing eye, long rippling whiskers and four little claws.
//           It sheds drifting violet sparks.
//   Phoenix (~1,900 specks): gold, orange and pink. Flapping feathered wings, a crested head and five long tail
//           plumes that curl and end in glowing "eyes". It sheds rising fire embers.
//
// "Fizzy": every speck is tiny (1–2 px), flickers every frame and jitters a fraction of a pixel, so the creatures
// look like they're made of crackling static light. They loop round each other like yin and yang, and drift
// towards the mouse when it's over the sky. They pulse with the music's beat. "Reduce motion" turns them off.
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
  };
  // ==========================================================================================================

  const canvas = document.createElement("canvas");
  canvas.id = "neon-beasts";
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
  const bodySpecks = [];
  for (let s = 0; s < BEASTS.dragonSegments; s++) {
    const t = s / BEASTS.dragonSegments;
    const color = mixColor(PURPLE, PINK, Math.min(1, t * 1.4));
    for (let k = 0; k < 40; k++) bodySpecks.push({ s, across: rand(-1, 1), along: rand(-0.6, 0.6), size: rand(0.8, 1.8), color: css(k % 7 === 0 ? LILAC : color), phase: Math.random() * 6.28 });
    for (let k = 0; k < 5; k++) bodySpecks.push({ s, ridge: k / 5, size: rand(1, 1.8), color: css(mixColor(PINK, LILAC, t)), phase: Math.random() * 6.28 });   // back spikes
  }
  // The body's thickness along its length: a neck, thickest at the shoulders, tapering to a fine tail.
  const thickness = t => BEASTS.dragonThickness * (t < 0.06 ? 0.6 + t * 6 : Math.pow(1 - (t - 0.06) / 0.94, 0.85)) + 1.5;

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
  const skull = [[-0.2, -0.35], [0.4, -0.45], [0.9, -0.32], [1.45, -0.18], [1.7, 0], [1.45, 0.12], [0.9, 0.18], [1.3, 0.34], [0.7, 0.42], [0.1, 0.35], [-0.25, 0.15]];
  addFill(headSpecks, skull, 650, PINK);
  addLine(headSpecks, skull.concat([skull[0]]), 280, LILAC, [1, 1.9]);                              // glowing outline
  addLine(headSpecks, [[0.2, -0.4], [-0.3, -0.85], [-0.75, -1.05], [-1.05, -0.95]], 50, LILAC, [1, 2]);   // horns
  addLine(headSpecks, [[0.45, -0.42], [0.1, -0.95], [-0.25, -1.2]], 40, LILAC, [1, 2]);
  addLine(headSpecks, [[-0.25, -0.2], [-0.7, -0.45], [-0.6, 0.0], [-0.95, 0.15], [-0.55, 0.35]], 70, PURPLE, [0.9, 1.7], 0.06);   // mane
  for (let k = 0; k < 30; k++) headSpecks.push({ x: 0.85 + rand(-0.07, 0.07), y: -0.12 + rand(-0.05, 0.05), size: rand(1.2, 2.4), color: css(k % 3 ? ORANGE : WHITE), phase: 0, eye: true });   // the eye
  const HEAD_SCALE = 44;

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

  // ================================================ LOOSE SPARKS ================================================
  const sparks = [];
  function shed(x, y, color, rise) {
    sparks.push({ x, y, vx: rand(-0.4, 0.4), vy: rise ? rand(-1.2, -0.3) : rand(-0.3, 0.4), life: 1, fade: rand(0.012, 0.03), size: rand(0.7, 1.6), color });
  }

  // ================================================ DRAWING HELPERS ================================================
  let beat = 0;
  // One fizzy speck: it flickers and jitters every frame.
  function speck(x, y, size, color, phase, strength = 1) {
    ctx.globalAlpha = BEASTS.opacity * strength * (0.45 + Math.random() * 0.55) * (0.85 + beat * 0.3);
    ctx.fillStyle = color;
    const s = size * (1 + beat * 0.3);
    ctx.fillRect(x + rand(-0.5, 0.5) - s / 2, y + rand(-0.5, 0.5) - s / 2, s, s);
  }
  // Turn a point from a creature's little map into screen pixels (and mirror it when flying left, so it's never upside down).
  function place(cx, cy, angle, scale, lx, ly, mirror) {
    const y = mirror ? -ly : ly, c = Math.cos(angle), s = Math.sin(angle);
    return [cx + (lx * c - y * s) * scale, cy + (lx * s + y * c) * scale];
  }

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
    trail.unshift([dragon.x, dragon.y]); if (trail.length > 2400) trail.length = 2400;
    phoenixTrail.unshift([phoenix.x, phoenix.y]); if (phoenixTrail.length > 300) phoenixTrail.length = 300;

    ctx.globalCompositeOperation = "lighter";

    // ---- Dragon body: walk back along the trail, placing a body piece every few pixels ----
    const spine = [];
    let dist = 0, next = 0;
    for (let i = 1; i < trail.length && spine.length < BEASTS.dragonSegments; i++) {
      const [ax, ay] = trail[i - 1], [bx, by] = trail[i];
      const step = Math.hypot(bx - ax, by - ay);
      dist += step;
      while (dist >= next && spine.length < BEASTS.dragonSegments) {
        const f = step ? 1 - (dist - next) / step : 0;
        const x = lerp(ax, bx, f), y = lerp(ay, by, f);
        const tx = ax - bx || 0.001, ty = ay - by;
        const len = Math.hypot(tx, ty) || 1;
        let nx = -ty / len, ny = tx / len;
        if (ny > 0) { nx = -nx; ny = -ny; }                // "up" side of the body, so the spikes stay on its back
        spine.push({ x, y, nx, ny, wave: Math.sin(spine.length * 0.35 - now * 0.004) * 3 });
        next += BEASTS.dragonSpacing;
      }
    }
    if (spine.length > 4) {
      for (const p of bodySpecks) {
        const seg = spine[p.s]; if (!seg) continue;
        const tt = p.s / BEASTS.dragonSegments, r = thickness(tt);
        if (p.ridge !== undefined) {                         // spikes along the back, flicking up and down
          const spike = r + 4 + 7 * Math.abs(Math.sin(p.s * 0.9 + now * 0.003)) * (1 - tt) + p.ridge * 4;
          speck(seg.x + seg.nx * spike, seg.y + seg.ny * spike + seg.wave, p.size, p.color, p.phase);
          continue;
        }
        // Scales: a shimmer that ripples down the body.
        const shimmer = 0.55 + 0.45 * Math.sin(p.s * 1.3 + p.across * 3 - now * 0.006);
        // Spread each speck a little along the body too (towards the next piece), so the body is one continuous mass.
        const along = p.along * BEASTS.dragonSpacing;
        speck(seg.x + seg.nx * p.across * r + seg.ny * along, seg.y + seg.ny * p.across * r - seg.nx * along + seg.wave, p.size, p.color, p.phase, shimmer);
      }
      for (const c of clawSpecks) {                          // claws reach down and curl
        const seg = spine[c.s]; if (!seg) continue;
        const r = thickness(c.s / BEASTS.dragonSegments), reach = r + 16 * c.along;
        const curl = (c.toe - 1) * 5 * c.along + Math.sin(now * 0.005 + c.s) * 3;
        speck(seg.x - seg.nx * reach + curl, seg.y - seg.ny * reach + seg.wave, c.size, c.color, c.phase);
      }
      // ---- Dragon head ----
      const mirror = Math.cos(dragon.angle) < 0;
      const jaw = Math.max(0, Math.sin(now * 0.002)) * 0.15;   // the mouth opens now and then
      for (const h of headSpecks) {
        const ly = h.y > 0.2 && h.x > 0.6 ? h.y + jaw : h.y;
        const [x, y] = place(dragon.x, dragon.y, dragon.angle, HEAD_SCALE, h.x, ly, mirror);
        speck(x, y, h.size * (h.eye ? 1 + beat : 1), h.color, h.phase, h.eye ? 1.4 : 1);
      }
      // Whiskers ripple back from the snout.
      for (const w of whiskerSpecks) {
        const lx = 1.4 - w.s * 4.2, ly = w.side * (0.2 + w.s * 0.6) + Math.sin(w.s * 7 - now * 0.006 + w.side) * 0.35 * w.s;
        const [x, y] = place(dragon.x, dragon.y, dragon.angle, HEAD_SCALE, lx, ly, mirror);
        speck(x, y, w.size, w.color, w.phase, 1 - w.s * 0.6);
      }
      // Violet sparks shed from the body.
      for (let k = 0; k < BEASTS.sparksPerFrame / 2; k++) {
        const seg = spine[Math.floor(Math.random() * spine.length)];
        shed(seg.x + rand(-6, 6), seg.y + rand(-6, 6), Math.random() < 0.5 ? "rgb(200,140,255)" : "rgb(255,110,210)", false);
      }
    }

    // ---- Phoenix ----
    phoenix.flap += 0.11 * speed * (1 + beat * 0.5);
    const pm = Math.cos(phoenix.angle) < 0, pa = phoenix.angle;
    // Tail plumes: follow the phoenix's own trail, fanning out and curling.
    for (const tp of tailSpecks) {
      const idx = Math.min(phoenixTrail.length - 1, Math.floor(tp.s * 160));
      const [bx, by] = phoenixTrail[idx] || [phoenix.x, phoenix.y];
      const fan = (tp.plume - 2) * (12 + tp.s * 40) + Math.sin(tp.s * 9 - now * 0.005 + tp.plume) * 10 * tp.s;
      let x = bx - Math.sin(pa) * fan, y = by + Math.cos(pa) * fan * (pm ? -1 : 1);
      if (tp.eyeAngle !== undefined) { x += Math.cos(tp.eyeAngle) * 6 * tp.eyeR; y += Math.sin(tp.eyeAngle) * 6 * tp.eyeR; }
      speck(x, y, tp.size, tp.color, tp.phase, tp.s === 1 ? 1.3 : 1 - tp.s * 0.4);
    }
    // Wings: two wings beating up and down around the shoulders; feathers fan backwards from the wing bone.
    const beatAngle = Math.sin(phoenix.flap);
    for (const w of wingSpecks) {
      const lift = (w.side < 0 ? -1 : 0.55) * (0.9 + 0.75 * beatAngle);   // far wing above, near wing below
      const bone = (w.f / 13) * 2.6;                                       // how far out along the wing bone
      const featherLen = 1.1 * (1 - w.f / 13 * 0.35);
      const lx = 0.2 - bone * 0.35 - w.along * featherLen;                 // swept back
      const ly = -bone * lift - w.along * 0.25 * Math.sign(lift || 1);
      const [x, y] = place(phoenix.x, phoenix.y, pa, P, lx, ly, pm);
      speck(x, y, w.size, w.color, w.phase);
    }
    for (const b of birdSpecks) {
      const [x, y] = place(phoenix.x, phoenix.y, pa, P, b.x, b.y, pm);
      speck(x, y, b.size * (b.eye ? 1 + beat : 1), b.color, b.phase, b.eye ? 1.5 : 1);
    }
    // Fire embers rise from the phoenix and its tail.
    for (let k = 0; k < BEASTS.sparksPerFrame; k++) {
      const [bx, by] = phoenixTrail[Math.floor(Math.random() * Math.min(80, phoenixTrail.length))] || [phoenix.x, phoenix.y];
      shed(bx + rand(-12, 12), by + rand(-10, 10), Math.random() < 0.6 ? "rgb(255,170,70)" : "rgb(255,100,160)", true);
    }

    // ---- Loose sparks drift, flicker and die ----
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.x += s.vx; s.y += s.vy; s.vx += rand(-0.08, 0.08); s.life -= s.fade;
      if (s.life <= 0) { sparks.splice(i, 1); continue; }
      ctx.globalAlpha = BEASTS.opacity * s.life * (0.4 + Math.random() * 0.6);
      ctx.fillStyle = s.color;
      ctx.fillRect(s.x, s.y, s.size, s.size);
    }
    if (sparks.length > 1500) sparks.splice(0, sparks.length - 1500);

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
