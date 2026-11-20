// chaos.js: the moving parts of the weird redesign (sandbox/chaos-home.html). Goes with chaos.css.
//   - splits the headline into bouncing letters
//   - sticks googly eyes on the logo that watch the mouse
//   - scatters draggable stickers and runs an "under construction" tape across the hero
//   - leaves a sparkle trail behind the mouse and throws confetti on every click
// Everything is inside one function, so its names never clash with the site's own scripts.
(function () {
  const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const COLORS = ["#ff3cac", "#784ba0", "#2b86c5", "#ffd23f", "#3bceac", "#ff7849"];
  const pick = list => list[Math.floor(Math.random() * list.length)];

  // ---- The lava-lamp blobs behind everything ----
  const blobs = document.createElement("div");
  blobs.id = "chaos-blobs";
  blobs.setAttribute("aria-hidden", "true");
  blobs.innerHTML = "<span></span><span></span><span></span><span></span>";
  document.body.prepend(blobs);

  // ---- Bouncy headline: one <span> per letter (screen readers still get the whole sentence) ----
  const h1 = document.querySelector(".hero-card h1");
  function bounce() {
    if (!h1 || h1.querySelector(".chaos-letter")) return;
    const text = h1.textContent.trim();
    h1.setAttribute("aria-label", text);
    h1.innerHTML = "";
    let i = 0;
    for (const word of text.split(" ")) {
      const w = document.createElement("span");
      w.style.whiteSpace = "nowrap";                      // keep each word's letters together on one line
      w.setAttribute("aria-hidden", "true");
      for (const ch of word) {
        const s = document.createElement("span");
        s.className = "chaos-letter";
        s.style.setProperty("--i", i++);
        s.textContent = ch;
        w.appendChild(s);
      }
      h1.appendChild(w);
      h1.appendChild(document.createTextNode(" "));
    }
  }
  bounce();
  // The site's translation script may rewrite the headline after loading; bounce it again when that happens.
  if (h1) new MutationObserver(() => bounce()).observe(h1, { childList: true });

  // ---- Googly eyes on the logo ----
  const brand = document.querySelector(".brand");
  const pupils = [];
  if (brand) {
    const eyes = document.createElement("span");
    eyes.className = "chaos-eyes";
    eyes.setAttribute("aria-hidden", "true");
    eyes.innerHTML = '<span class="chaos-eye"><i></i></span><span class="chaos-eye"><i></i></span>';
    brand.appendChild(eyes);
    pupils.push(...eyes.querySelectorAll("i"));
  }
  window.addEventListener("pointermove", e => {
    for (const p of pupils) {
      const r = p.parentElement.getBoundingClientRect();
      const angle = Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2));
      p.style.transform = `translate(${Math.cos(angle) * 3}px, ${Math.sin(angle) * 3}px)`;
    }
  });

  // ---- Stickers and the construction tape in the hero ----
  const hero = document.querySelector(".hero");
  if (hero) {
    const tape = document.createElement("div");
    tape.className = "chaos-tape";
    tape.setAttribute("aria-hidden", "true");
    tape.innerHTML = "<span>" + "⚠ UNDER CONSTRUCTION ⚠ JUST KIDDING ⚠ FREE TO USE ⚠ OPEN SOURCE ⚠ NO LOCK-IN ⚠ MADE IN OSAKA ".repeat(3) + "</span>";
    hero.appendChild(tape);

    const stickers = [["wow!", "#ffd23f", 8, 18], ["100% weird", "#ff3cac", 76, 14], ["new!!", "#3bceac", 12, 70],
                      ["drag me", "#ffffff", 82, 66], ["✿ beta ✿", "#b9a3ff", 45, 6]];
    for (const [label, bg, x, y] of stickers) {
      const s = document.createElement("div");
      s.className = "chaos-sticker";
      s.textContent = label;
      s.setAttribute("aria-hidden", "true");
      s.style.cssText = `left:${x}%; top:${y}%; background:${bg}; --r:${(Math.random() * 30 - 15).toFixed(1)}deg; animation-delay:${(-Math.random() * 5).toFixed(2)}s`;
      hero.appendChild(s);
      // Drag a sticker anywhere in the hero.
      s.addEventListener("pointerdown", e => {
        e.preventDefault();
        s.setPointerCapture(e.pointerId);
        const box = hero.getBoundingClientRect(), start = s.getBoundingClientRect();
        const dx = e.clientX - start.left, dy = e.clientY - start.top;
        const move = ev => { s.style.left = ev.clientX - box.left - dx + "px"; s.style.top = ev.clientY - box.top - dy + "px"; };
        s.addEventListener("pointermove", move);
        s.addEventListener("pointerup", () => s.removeEventListener("pointermove", move), { once: true });
      });
    }
  }

  if (calm) return;   // no trails or confetti for people who asked for less motion

  // ---- Sparkle trail behind the mouse ----
  let last = 0;
  window.addEventListener("pointermove", e => {
    const now = performance.now();
    if (now - last < 35) return;                          // one sparkle every 35 ms at most
    last = now;
    const s = document.createElement("span");
    s.className = "chaos-spark";
    s.style.left = e.clientX + "px";
    s.style.top = e.clientY + "px";
    s.style.setProperty("--c", pick(COLORS));
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 800);
  });

  // ---- Confetti on every click ----
  window.addEventListener("pointerdown", e => {
    if (e.target.closest(".chaos-sticker")) return;       // not while dragging a sticker
    for (let i = 0; i < 28; i++) {
      const c = document.createElement("span");
      c.className = "chaos-confetti";
      c.style.background = pick(COLORS);
      c.style.left = e.clientX + "px";
      c.style.top = e.clientY + "px";
      document.body.appendChild(c);
      const angle = Math.random() * Math.PI * 2, speed = 120 + Math.random() * 220;
      c.animate([
        { transform: "translate(0, 0) rotate(0deg)", opacity: 1 },
        { transform: `translate(${Math.cos(angle) * speed}px, ${Math.sin(angle) * speed + 260}px) rotate(${Math.random() * 900}deg)`, opacity: 0 },
      ], { duration: 1100 + Math.random() * 600, easing: "cubic-bezier(.2, .7, .4, 1)" }).onfinish = () => c.remove();
    }
  });
})();
