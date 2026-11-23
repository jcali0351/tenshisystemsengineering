// neon-geo.js: the "shape-shifter", a cloud of glowing points that keeps rebuilding itself into 3D geometry
// in the sky behind the headline (neon preview only).
//
//   sphere → torus knot → lattice cube → double helix → galaxy → icosahedron → 3D Lissajous knot → the 天 logo → …
//
//   - Between shapes it SHATTERS: every point flies outwards, then snaps into the next shape like iron filings.
//   - It slowly turns in 3D; moving the mouse steers the spin and tilt.
//   - Points near the mouse are pushed aside; a click blasts the nearby points outwards.
//   - It swells and brightens on the beat when the music is on (window.neonBeat from neon-audio.js).
// Drawn behind the page text so the headline stays readable. "Reduce motion" turns it off.
(function () {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const COUNT = 720;                 // how many points
  const HOLD_SECONDS = 6;            // how long each shape stays before shattering
  const SHATTER_SECONDS = 0.9;       // how long the burst between shapes lasts
  const OPACITY = 0.9;               // overall strength (1 = full)
  const COLORS = ["#ff2bd6", "#ff6ec7", "#b04dff", "#8a3ffc", "#ffb347", "#ffffff"];

  const canvas = document.createElement("canvas");
  canvas.id = "neon-geo";
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

  // ================================ The shapes: each returns COUNT points [x, y, z], roughly within -1..1 ================================
  const TAU = Math.PI * 2;
  const shapes = [
    { name: "sphere", linked: false, make: i => {                         // evenly spread over a ball (Fibonacci spiral)
      const y = 1 - (i / (COUNT - 1)) * 2, r = Math.sqrt(1 - y * y), a = i * 2.39996;
      return [Math.cos(a) * r, y, Math.sin(a) * r];
    } },
    { name: "torus knot", linked: true, make: i => {                      // a (2,3) knot: the curve winds round a doughnut
      const t = (i / COUNT) * TAU, p = 2, q = 3, r = 0.55 + 0.3 * Math.cos(q * t);
      return [r * Math.cos(p * t), 0.3 * Math.sin(q * t) * 1.4, r * Math.sin(p * t)];
    } },
    { name: "lattice cube", linked: true, make: i => {                    // points running along the edges of a 3x3x3 grid
      const lines = [];
      for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) lines.push([0, a, b], [1, a, b], [2, a, b]);
      const per = COUNT / lines.length, line = lines[Math.floor(i / per)] || lines[0], t = ((i % per) / per) * 2 - 1;
      const p = [0, 0, 0]; p[line[0]] = t; p[(line[0] + 1) % 3] = line[1]; p[(line[0] + 2) % 3] = line[2];
      return p.map(v => v * 0.7);
    } },
    { name: "double helix", linked: true, make: i => {                    // two twisting strands with rungs between them
      const strand = i % 3, t = (Math.floor(i / 3) / (COUNT / 3)) * 2 - 1, a = t * TAU * 1.6;
      if (strand < 2) { const s = strand ? Math.PI : 0; return [Math.cos(a + s) * 0.45, t, Math.sin(a + s) * 0.45]; }
      const k = (i * 7919 % 100) / 100 * 2 - 1;                             // a point somewhere along a rung
      return [Math.cos(a) * 0.45 * k, t, Math.sin(a) * 0.45 * k];
    } },
    { name: "galaxy", linked: false, make: i => {                         // three spiral arms, thicker in the middle
      const arm = i % 3, d = Math.pow((i / COUNT), 0.7), a = d * 7 + arm * TAU / 3;
      const j = (Math.sin(i * 12.9898) * 43758.5453) % 1 * 0.12;
      return [Math.cos(a) * d + j, (Math.sin(i * 78.233) * 0.5) * 0.12 * (1 - d), Math.sin(a) * d + j];
    } },
    { name: "icosahedron", linked: true, make: i => {                     // points along the 30 edges of a 20-sided die
      const g = (1 + Math.sqrt(5)) / 2;
      const v = [[-1, g, 0], [1, g, 0], [-1, -g, 0], [1, -g, 0], [0, -1, g], [0, 1, g], [0, -1, -g], [0, 1, -g], [g, 0, -1], [g, 0, 1], [-g, 0, -1], [-g, 0, 1]];
      const edges = [];
      for (let a = 0; a < 12; a++) for (let b = a + 1; b < 12; b++) if (Math.abs(Math.hypot(v[a][0] - v[b][0], v[a][1] - v[b][1], v[a][2] - v[b][2]) - 2) < 0.01) edges.push([a, b]);
      const per = COUNT / edges.length, [ea, eb] = edges[Math.floor(i / per)] || edges[0], t = (i % per) / per;
      return [0, 1, 2].map(k => (v[ea][k] + (v[eb][k] - v[ea][k]) * t) / 1.9);
    } },
    { name: "lissajous", linked: true, make: i => {                       // a looping 3D Lissajous knot
      const t = (i / COUNT) * TAU;
      return [Math.sin(3 * t + 0.5) * 0.9, Math.sin(4 * t) * 0.8, Math.sin(7 * t) * 0.6];
    } },
    { name: "logo", linked: false, make: null },                          // the 天 character (worked out once, below)
  ];

  // The 天 logo: draw the character on a small hidden canvas and pick points where it's inked.
  const logoPoints = (() => {
    const c = document.createElement("canvas"); c.width = c.height = 160;
    const g = c.getContext("2d");
    g.fillStyle = "#fff"; g.font = "900 140px 'Yu Gothic', 'Hiragino Sans', 'Noto Sans JP', 'Meiryo', sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText("天", 80, 88);
    const data = g.getImageData(0, 0, 160, 160).data, inked = [];
    for (let y = 0; y < 160; y += 2) for (let x = 0; x < 160; x += 2) if (data[(y * 160 + x) * 4 + 3] > 128) inked.push([x / 80 - 1, y / 80 - 1]);
    if (!inked.length) return null;
    return Array.from({ length: COUNT }, (_, i) => { const [x, y] = inked[(i * 7919) % inked.length]; return [x * 0.95, y * 0.95, ((i * 31) % 17) / 17 * 0.12 - 0.06]; });
  })();
  shapes[shapes.length - 1].make = logoPoints ? i => logoPoints[i] : shapes[0].make;

  // ================================ The points ================================
  const pts = Array.from({ length: COUNT }, (_, i) => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, tx: 0, ty: 0, tz: 0, ox: 0, oy: 0, color: COLORS[i % COLORS.length] }));
  let shapeIndex = 0, phase = "form", phaseStart = performance.now();
  function setShape(k) {
    const s = shapes[k];
    pts.forEach((p, i) => { [p.tx, p.ty, p.tz] = s.make(i); });
  }
  setShape(0);
  pts.forEach(p => { p.x = p.tx * 3; p.y = p.ty * 3; p.z = p.tz * 3; });   // start scattered, so the first shape forms on load

  // Spin, steered by the mouse.
  let rotY = 0, rotX = -0.35, spin = 0.004, tiltTarget = -0.35;
  const mouse = { x: -9999, y: -9999 };
  window.addEventListener("pointermove", e => {
    mouse.x = e.clientX; mouse.y = e.clientY;
    spin = 0.003 + (e.clientX / W - 0.5) * 0.02;
    tiltTarget = -0.35 + (e.clientY / H - 0.5) * 0.8;
  });
  // A click blasts the nearby points outwards (in 3D, so they tumble back into place).
  window.addEventListener("pointerdown", e => {
    for (const p of pts) {
      const d = Math.hypot(p.sx - e.clientX, p.sy - e.clientY);
      if (d < 160) { const f = (1 - d / 160) * 0.12; p.vx += (p.x || 0.01) * f * 3; p.vy += (p.y || 0.01) * f * 3; p.vz += (p.z || 0.01) * f * 3; }
    }
  });

  const hero = document.querySelector(".hero");
  function frame(now) {
    ctx.clearRect(0, 0, W, H);
    const heroBottom = hero ? hero.getBoundingClientRect().bottom : H;
    const visible = Math.max(0, Math.min(1, heroBottom / H));
    canvas.style.opacity = visible;
    if (visible < 0.02) return requestAnimationFrame(frame);

    // Shape timing: hold → shatter → next shape forms.
    const elapsed = (now - phaseStart) / 1000;
    if (phase === "form" && elapsed > HOLD_SECONDS) {
      phase = "shatter"; phaseStart = now;
      for (const p of pts) { const r = 0.05 + Math.random() * 0.09; p.vx += (p.x + (Math.random() - 0.5)) * r; p.vy += (p.y + (Math.random() - 0.5)) * r; p.vz += (p.z + (Math.random() - 0.5)) * r; }
    } else if (phase === "shatter" && elapsed > SHATTER_SECONDS) {
      phase = "form"; phaseStart = now; shapeIndex = (shapeIndex + 1) % shapes.length; setShape(shapeIndex);
    }

    const beat = window.neonBeat ? window.neonBeat() : 0;
    const insane = window.neonInsane ? 2.5 : 1;
    rotY += spin * insane; rotX += (tiltTarget - rotX) * 0.03;
    const cy = Math.cos(rotY), sy = Math.sin(rotY), cx = Math.cos(rotX), sx = Math.sin(rotX);
    const R = Math.min(W, H) * 0.3 * (1 + beat * 0.06), centerX = W / 2, centerY = H * 0.36, focal = 3;
    const pull = phase === "form" ? 0.045 : 0.004;          // how hard points are drawn to their place

    // Move and project every point.
    for (const p of pts) {
      p.vx += (p.tx - p.x) * pull; p.vy += (p.ty - p.y) * pull; p.vz += (p.tz - p.z) * pull;
      p.vx *= 0.88; p.vy *= 0.88; p.vz *= 0.88;
      p.x += p.vx; p.y += p.vy; p.z += p.vz;
      // Rotate (around Y, then X) and add perspective.
      const x1 = p.x * cy - p.z * sy, z1 = p.x * sy + p.z * cy;
      const y2 = p.y * cx - z1 * sx, z2 = p.y * sx + z1 * cx;
      const scale = focal / (focal + z2);
      let px = centerX + x1 * R * scale, py = centerY + y2 * R * scale;
      // Pushed aside by the mouse, drifting back afterwards.
      const dx = px + p.ox - mouse.x, dy = py + p.oy - mouse.y, d = Math.hypot(dx, dy);
      if (d < 90) { p.ox += (dx / (d + 0.1)) * (90 - d) * 0.08; p.oy += (dy / (d + 0.1)) * (90 - d) * 0.08; }
      p.ox *= 0.92; p.oy *= 0.92;
      p.sx = px + p.ox; p.sy = py + p.oy; p.depth = z2; p.scale = scale;
    }

    ctx.globalCompositeOperation = "lighter";
    // Lines along the shape (only for shapes made of curves and edges), fading with depth.
    if (shapes[shapeIndex].linked && phase === "form") {
      ctx.lineWidth = 1;
      for (let i = 1; i < COUNT; i++) {
        const a = pts[i - 1], b = pts[i];
        if (Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) > 0.18) continue;   // don't join points from different edges
        ctx.globalAlpha = OPACITY * 0.55 * Math.min(1, (a.scale - 0.5));
        ctx.strokeStyle = a.color;
        ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
      }
    }
    // The points: nearer ones are bigger and brighter; everything flares a little on the beat.
    for (const p of pts) {
      const size = Math.max(0.8, 2.4 * p.scale * (1 + beat * 0.5));
      ctx.globalAlpha = OPACITY * Math.min(1, 0.25 + (p.scale - 0.6) * 1.1 + beat * 0.3);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.sx, p.sy, size, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
