// neon-quest.js: turns the whole site into a game (neon look only).
//
//   - Every content section becomes a numbered STAGE, with a tag at its top ("STAGE 02 · DESIGN · LOCKED").
//   - Scrolling a stage into view clears it: "+100 XP" toast, the tag turns CLEARED, a sound plays (if on).
//   - Opening a page for the first time: "NEW AREA DISCOVERED +50 XP". Discover 6 areas: WORLD EXPLORER.
//   - Clear every stage on a page: AREA COMPLETE bonus. Send a contact form: QUEST COMPLETE.
//   - A quest HUD (top right; on the homepage once you're past the hero) shows XP, level and this page's stages.
// Progress (XP, cleared stages, discovered pages) is kept in this browser (localStorage), so it carries across pages
// and visits. Nothing is sent anywhere. The look comes from neon-theme.css (homepage) and neon-pages.css (other pages).
(function () {
  const XP = { stage: 100, area: 50, areaComplete: 150, explorer: 300, quest: 500, perLevel: 400, explorerAreas: 6 };
  // The homepage's stages, with names. Other pages find their own: every section with a heading.
  const HOME = [
    { sel: "#services", name: "Services" }, { sel: "#feature" }, { sel: "#feature-2" }, { sel: "#feature-3" },
    { sel: "#contact", name: "Contact" }, { sel: ".site-footer", name: "News" },
  ];
  const sfx = n => window.neonAudio && window.neonAudio.sfx(n);
  const store = {
    get() { try { return JSON.parse(localStorage.getItem("tenshi-quest")) || {}; } catch (e) { return {}; } },
    set(v) { try { localStorage.setItem("tenshi-quest", JSON.stringify(v)); } catch (e) { /* storage blocked: progress just isn't saved */ } },
  };
  const save = Object.assign({ xp: 0, cleared: {}, areas: {}, quest: false, explorer: false }, store.get());
  const page = (location.pathname.replace(/\/index\.html$/, "/").replace(/\.html$/, "") || "/");
  const isHome = !!document.querySelector(".hero-card");
  const hero = document.querySelector(".hero, .svc-hero");

  // ---- Find the stages ----
  const nameOf = el => {
    const h = el.querySelector("h2, h3");
    const t = h ? h.textContent.trim().replace(/\s+/g, " ") : "";
    return t.length > 28 ? t.slice(0, 26) + "…" : t;
  };
  let picks;
  if (isHome) picks = HOME.map(s => ({ el: document.querySelector(s.sel), name: s.name })).filter(s => s.el);
  else {
    picks = [...document.querySelectorAll("main section")].filter(el =>
      !el.matches(".svc-hero, .px-hero, .hero, .parallax, .lx, .lx-panel, [hidden]") &&   // (the Launch wizard has its own steps)
      !el.parentElement.closest("main section") && el.querySelector("h2, h3") && el.offsetHeight > 120
    ).map(el => ({ el, name: null }));
    const foot = document.querySelector(".site-footer");
    if (foot) picks.push({ el: foot, name: "News" });
  }
  const stages = picks.map((s, i) => {
    const name = (s.name || nameOf(s.el) || "Stage " + (i + 1)).toUpperCase();
    const id = page + "#" + i;
    const tag = document.createElement("div");
    tag.className = "gx-stage";
    tag.setAttribute("aria-hidden", "true");
    tag.innerHTML = `<span>STAGE ${String(i + 1).padStart(2, "0")}</span><b></b><i></i>`;
    tag.querySelector("b").textContent = name;                 // headings are text, never HTML
    const first = s.el.firstElementChild;
    s.el.insertBefore(tag, first && first.matches("canvas, .chev-flight, .svc-rain") ? first.nextSibling : s.el.firstChild);
    const st = { el: s.el, name, id, tag, cleared: !!save.cleared[id] };
    mark(st);
    return st;
  });
  function mark(st) { st.tag.classList.toggle("is-cleared", st.cleared); st.tag.querySelector("i").textContent = st.cleared ? "CLEARED" : "LOCKED"; }

  // ---- HUD and toast ----
  const hud = document.createElement("div");
  hud.className = "gx-hud";
  hud.setAttribute("aria-hidden", "true");
  hud.innerHTML = `<div class="gx-row"><span>QUEST</span><b class="gx-lv">LV 1</b></div>
    <div class="gx-bar"><i></i></div>
    <div class="gx-row"><span class="gx-xp">0 XP</span><span class="gx-count"></span></div>
    <div class="gx-dots">${stages.map(() => "<i></i>").join("")}</div>`;
  document.body.appendChild(hud);
  const toast = document.createElement("div");
  toast.className = "gx-toast";
  toast.setAttribute("role", "status");
  document.body.appendChild(toast);

  function render() {
    const level = 1 + Math.floor(save.xp / XP.perLevel), into = (save.xp % XP.perLevel) / XP.perLevel;
    hud.querySelector(".gx-lv").textContent = "LV " + level;
    hud.querySelector(".gx-xp").textContent = save.xp + " XP";
    hud.querySelector(".gx-bar i").style.width = into * 100 + "%";
    hud.querySelector(".gx-count").textContent = stages.filter(s => s.cleared).length + " / " + stages.length;
    hud.querySelectorAll(".gx-dots i").forEach((d, i) => d.classList.toggle("on", stages[i].cleared));
  }
  const queue = []; let showing = false, timer = 0;
  function say(title, sub, points) { queue.push({ title, sub, points }); if (!showing) next(); }
  function next() {
    const t = queue.shift();
    if (!t) { showing = false; return; }
    showing = true;
    toast.innerHTML = "";
    toast.append(t.sub, Object.assign(document.createElement("b"), { textContent: t.title }), Object.assign(document.createElement("em"), { textContent: "+" + t.points + " XP" }));
    toast.classList.add("on");
    clearTimeout(timer);
    timer = setTimeout(() => { toast.classList.remove("on"); setTimeout(next, 350); }, 1900);
  }
  function gain(points) {
    const before = 1 + Math.floor(save.xp / XP.perLevel);
    save.xp += points; store.set(save); render();
    if (1 + Math.floor(save.xp / XP.perLevel) > before) setTimeout(() => { sfx("power"); say("LEVEL " + (before + 1), "LEVEL UP", 0); }, 500);
  }

  // ---- A new area (page) discovered ----
  if (!save.areas[page]) {
    save.areas[page] = true;
    const title = (document.querySelector(".svc-hero h1, main h1") || {}).textContent || document.title.split("|")[0];
    setTimeout(() => {
      gain(XP.area); say(title.trim().slice(0, 30).toUpperCase(), "NEW AREA DISCOVERED", XP.area);
      if (!save.explorer && Object.keys(save.areas).length >= XP.explorerAreas) {
        save.explorer = true; gain(XP.explorer); sfx("achievement"); say("WORLD EXPLORER", "ACHIEVEMENT UNLOCKED", XP.explorer);
      }
    }, 900);
  }

  // ---- Clearing stages as they scroll into view ----
  const seen = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const s = stages.find(st => st.el === e.target);
      if (!s || s.cleared) continue;
      s.cleared = true; save.cleared[s.id] = true; mark(s);
      gain(XP.stage); sfx("combo");
      say(s.name, "STAGE CLEARED", XP.stage);
      if (stages.every(st => st.cleared)) setTimeout(() => { gain(XP.areaComplete); sfx("achievement"); say("AREA COMPLETE", "ALL STAGES CLEARED", XP.areaComplete); }, 400);
    }
  }, { threshold: 0.3 });
  stages.forEach(s => { if (!s.cleared) seen.observe(s.el); });

  // ---- The quest: sending a contact form ----
  document.addEventListener("submit", e => {
    const form = e.target;
    if (save.quest || !form.matches(".contact-form, .contact form, form.contact-form") || !form.checkValidity()) return;
    save.quest = true; gain(XP.quest); sfx("achievement");
    say("QUEST COMPLETE", "MESSAGE SENT", XP.quest);
  }, true);

  // The HUD shows once the page's big banner (or the homepage hero) has scrolled away.
  function checkHud() {
    const past = !hero || hero.getBoundingClientRect().bottom < window.innerHeight * (isHome ? 0.35 : 0.6);
    hud.classList.toggle("on", past);
  }
  setInterval(checkHud, 200);   // the site handles its own scrolling, so poll instead of listening for scroll
  render();
  window.neonQuest = { state: () => ({ xp: save.xp, page, stages: stages.map(s => s.name + (s.cleared ? " ✓" : "")), areas: Object.keys(save.areas) }), reset: () => store.set({}) };
})();
