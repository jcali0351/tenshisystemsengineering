// neon-quest.js: turns the page below the hero into a game (neon preview only).
//
//   - Every content section becomes a numbered STAGE, with a tag at its top ("STAGE 02 · DESIGN · LOCKED").
//   - Scrolling a stage into view clears it: "+100 XP" toast, the tag turns CLEARED, a sound plays (if on).
//   - A quest HUD (top right, once you're past the hero) shows XP, the level and which stages are cleared.
//   - Clear every stage: an EXPLORER bonus. Send the contact form: QUEST COMPLETE.
// The look of the panels, buttons and inputs comes from neon-theme.css ("GAMIFIED CONTENT").
(function () {
  const STAGES = [
    { sel: "#services", name: "Services" },
    { sel: "#feature", name: null },          // null = use the section's own heading
    { sel: "#feature-2", name: null },
    { sel: "#feature-3", name: null },
    { sel: "#contact", name: "Contact" },
    { sel: ".site-footer", name: "News" },
  ];
  const XP = { stage: 100, explorer: 250, quest: 500, perLevel: 300 };

  const sfx = n => window.neonAudio && window.neonAudio.sfx(n);
  const hero = document.querySelector(".hero");
  const stages = STAGES.map((s, i) => {
    const el = document.querySelector(s.sel);
    if (!el) return null;
    const heading = el.querySelector("h2");
    const name = s.name || (heading ? heading.textContent.trim() : "Stage");
    const tag = document.createElement("div");
    tag.className = "gx-stage";
    tag.setAttribute("aria-hidden", "true");
    tag.innerHTML = `<span>STAGE ${String(i + 1).padStart(2, "0")}</span><b>${name}</b><i>LOCKED</i>`;
    el.insertBefore(tag, el.firstElementChild && el.firstElementChild.matches("canvas, .chev-flight") ? el.firstElementChild.nextSibling : el.firstChild);
    return { el, name, tag, cleared: false };
  }).filter(Boolean);
  if (!stages.length) return;

  // ---- HUD and toast ----
  const hud = document.createElement("div");
  hud.className = "gx-hud";
  hud.setAttribute("aria-hidden", "true");
  hud.innerHTML = `<div class="gx-row"><span>QUEST</span><b class="gx-lv">LV 1</b></div>
    <div class="gx-bar"><i></i></div>
    <div class="gx-row"><span class="gx-xp">0 XP</span><span class="gx-count">0 / ${stages.length}</span></div>
    <div class="gx-dots">${stages.map(() => "<i></i>").join("")}</div>`;
  document.body.appendChild(hud);
  const toast = document.createElement("div");
  toast.className = "gx-toast";
  toast.setAttribute("role", "status");
  document.body.appendChild(toast);

  let xp = 0, toastTimer = 0, queue = [], showing = false;
  function render() {
    const level = 1 + Math.floor(xp / XP.perLevel), into = (xp % XP.perLevel) / XP.perLevel;
    hud.querySelector(".gx-lv").textContent = "LV " + level;
    hud.querySelector(".gx-xp").textContent = xp + " XP";
    hud.querySelector(".gx-bar i").style.width = into * 100 + "%";
    const done = stages.filter(s => s.cleared).length;
    hud.querySelector(".gx-count").textContent = done + " / " + stages.length;
    hud.querySelectorAll(".gx-dots i").forEach((d, i) => d.classList.toggle("on", stages[i].cleared));
  }
  // Toasts queue up so two quick clears don't overwrite each other.
  function say(title, sub, points) { queue.push({ title, sub, points }); if (!showing) next(); }
  function next() {
    const t = queue.shift();
    if (!t) { showing = false; return; }
    showing = true;
    toast.innerHTML = `${t.sub}<b>${t.title}</b><em>+${t.points} XP</em>`;
    toast.classList.add("on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.classList.remove("on"); setTimeout(next, 350); }, 1900);
  }
  function gain(points) {
    const before = 1 + Math.floor(xp / XP.perLevel);
    xp += points; render();
    if (1 + Math.floor(xp / XP.perLevel) > before) setTimeout(() => sfx("power"), 300);
  }

  // ---- Clearing stages as they scroll into view ----
  const seen = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const s = stages.find(st => st.el === e.target);
      if (!s || s.cleared) continue;
      s.cleared = true;
      s.tag.classList.add("is-cleared");
      s.tag.querySelector("i").textContent = "CLEARED";
      gain(XP.stage); sfx("combo");
      say(s.name, "STAGE CLEARED", XP.stage);
      if (stages.every(st => st.cleared)) {
        setTimeout(() => { gain(XP.explorer); sfx("achievement"); say("EXPLORER", "ACHIEVEMENT UNLOCKED", XP.explorer); }, 400);
      }
    }
  }, { threshold: 0.35 });
  stages.forEach(s => seen.observe(s.el));

  // The quest: sending the contact form.
  const form = document.querySelector(".contact-form");
  let questDone = false;
  if (form) form.addEventListener("submit", () => {
    if (questDone || !form.checkValidity()) return;
    questDone = true; gain(XP.quest); sfx("achievement");
    say("QUEST COMPLETE", "MESSAGE SENT", XP.quest);
  });

  // The HUD shows once you've scrolled past the hero (the arcade game's own HUD lives up there).
  function checkHud() {
    const past = !hero || hero.getBoundingClientRect().bottom < window.innerHeight * 0.35;
    hud.classList.toggle("on", past);
  }
  setInterval(checkHud, 200);   // the site handles its own scrolling, so poll instead of listening for scroll
  render();
  window.neonQuest = { state: () => ({ xp, cleared: stages.filter(s => s.cleared).map(s => s.name) }) };
})();
