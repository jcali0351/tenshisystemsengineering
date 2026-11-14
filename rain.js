// Falling Japanese characters behind the service cards, in shades of red.
// Draws on <canvas class="svc-rain"> inside .services. Runs only while the section is on screen and the tab is visible;
// visitors who prefer reduced motion get one still frame.
(function () {
  "use strict";
  const canvas = document.querySelector(".svc-rain");
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext("2d");
  const section = canvas.parentElement;
  const still = window.matchMedia("(prefers-reduced-motion: reduce)");

  // Katakana, a few hiragana and kanji (many from the company name and its work), and digits.
  const GLYPHS = Array.from(
    "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン" +
    "ガギグゲゴザジズゼゾダヂヅデドバビブベボパピプペポ" +
    "あいうえおかきくけこさしすせそ" +
    "天使技術設計開発未来信頼協力大阪日本網情報電算光速力" +
    "0123456789"
  );
  const BG = "200, 16, 46";          // the section's red (#c8102e), used for the fading trail
  const FPS = 22;
  let size = 18, cols = 0, drops = [], speeds = [], w = 0, h = 0, dpr = 1;
  let running = false, visible = false, raf = 0, last = 0;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = section.clientWidth;
    h = section.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    size = w < 600 ? 15 : 18;
    const n = Math.ceil(w / size);
    // Keep existing columns where possible so a resize doesn't restart the rain.
    drops = Array.from({ length: n }, (_, i) => drops[i] ?? Math.random() * -h / size);
    speeds = Array.from({ length: n }, (_, i) => speeds[i] ?? 0.45 + Math.random() * 0.75);
    cols = n;
    ctx.fillStyle = `rgb(${BG})`;
    ctx.fillRect(0, 0, w, h);
  }

  const pick = () => GLYPHS[(Math.random() * GLYPHS.length) | 0];

  function frame() {
    // Paint a see-through layer of the background red: older characters fade into a trail.
    ctx.fillStyle = `rgba(${BG}, 0.16)`;
    ctx.fillRect(0, 0, w, h);
    ctx.font = `700 ${size}px "Hiragino Sans", "Yu Gothic UI", "Yu Gothic", Meiryo, "Noto Sans JP", sans-serif`;
    ctx.textAlign = "center";
    for (let i = 0; i < cols; i++) {
      const y = drops[i] * size;
      if (y > 0) {
        const x = i * size + size / 2;
        // A pale head with a soft glow, then a deeper red character just behind it.
        ctx.fillStyle = "rgba(122, 6, 24, 0.85)";
        ctx.fillText(pick(), x, y - size);
        ctx.shadowColor = "rgba(255, 210, 218, 0.9)";
        ctx.shadowBlur = 8;
        ctx.fillStyle = "rgba(255, 196, 206, 0.95)";
        ctx.fillText(pick(), x, y);
        ctx.shadowBlur = 0;
      }
      drops[i] += speeds[i];
      if (y > h + size * 4 && Math.random() > 0.975) {
        drops[i] = Math.random() * -20;
        speeds[i] = 0.45 + Math.random() * 0.75;
      }
    }
  }

  function loop(t) {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    if (t - last < 1000 / FPS) return;
    last = t;
    frame();
  }

  function update() {
    const should = visible && !document.hidden && !still.matches;
    if (should && !running) { running = true; last = 0; raf = requestAnimationFrame(loop); }
    if (!should && running) { running = false; cancelAnimationFrame(raf); }
  }

  function drawStill() {
    // One calm frame for reduced motion: scattered characters, no movement.
    resize();
    for (let k = 0; k < 40; k++) frame();
  }

  resize();
  if (still.matches) drawStill();
  new ResizeObserver(() => { resize(); if (still.matches) drawStill(); }).observe(section);
  new IntersectionObserver((e) => { visible = e[0].isIntersecting; update(); }, { rootMargin: "100px" }).observe(section);
  document.addEventListener("visibilitychange", update);
  still.addEventListener("change", () => { if (still.matches) drawStill(); update(); });
})();
