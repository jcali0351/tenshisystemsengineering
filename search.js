// Header search: on desktop the finder bar sits in the header; on phones the round button opens it; results come from data/search/<lang>.json, which
// tools/build-pages.mjs writes from every page and blog post (data-search-v, stamped by tools/stamp-assets.mjs,
// is its version). Combobox pattern: arrow keys move through the results, Enter opens one, Esc closes.
(function () {
  "use strict";
  const root = document.querySelector(".tse-finder[data-search]");
  if (!root) return;
  const $ = (s) => root.querySelector(s);
  const toggle = $(".tse-finder__toggle"), panel = $(".tse-finder__panel"), form = $(".tse-finder__form");
  const input = $(".tse-finder__input"), list = $(".tse-finder__list"), empty = $(".tse-finder__empty"), status = $("[data-search-status]");
  if (!toggle || !panel || !form || !input || !list) return;
  const BASE = new URL("./", (document.currentScript && document.currentScript.src) || location.href);
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const T = window.TRANSLATIONS || {};
  const lang = () => (T[document.documentElement.lang] ? document.documentElement.lang : "en");
  const t = (key) => { const L = T[lang()] || {}; return L[key] !== undefined ? L[key] : (T.en && T.en[key]) || ""; };
  const MAX = 8;
  const inline = window.matchMedia("(min-width: 861px)");   // the bar is always shown there (search.css)

  /* ---------- The index: one file per language, fetched the first time the finder opens ---------- */
  const cache = {};
  const load = (L) => cache[L] || (cache[L] = fetch(new URL(`data/search/${L}.json?v=${root.dataset.searchV || ""}`, BASE))
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((data) => data.pages.map((p) => ({ ...p, lt: p.t.toLowerCase(), lh: p.h.toLowerCase(), ld: p.d.toLowerCase(), lx: p.x.toLowerCase() })))
    .catch(() => { delete cache[L]; return []; }));

  const tokens = (q) => q.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6);
  const wordStart = (hay, i) => i === 0 || /[\s\-–—·|/(「『“"'.,:;]/.test(hay[i - 1]);
  function search(pages, q) {
    const tk = tokens(q);
    if (!tk.length) return [];
    const out = [];
    for (const p of pages) {
      let score = 0, ok = true;
      for (const w of tk) {
        let s = 0, i;
        if ((i = p.lt.indexOf(w)) >= 0) s += wordStart(p.lt, i) ? 16 : 10;
        if ((i = p.lh.indexOf(w)) >= 0) s += wordStart(p.lh, i) ? 6 : 4;
        if ((i = p.ld.indexOf(w)) >= 0) s += 3;
        if ((i = p.lx.indexOf(w)) >= 0) s += wordStart(p.lx, i) ? 2 : 1;
        if (!s) { ok = false; break; }
        score += s;
      }
      if (ok) out.push({ p, score: score + (p.lt === q.toLowerCase() ? 20 : 0) - p.u.split("/").length * 0.1 });
    }
    return out.sort((a, b) => b.score - a.score || a.p.t.length - b.p.t.length).slice(0, MAX).map((r) => r.p);
  }
  // A slice of text around the first word found, or the description.
  function snippet(p, tk) {
    for (const w of tk) {
      if (p.ld.includes(w)) return p.d;
      const i = p.lx.indexOf(w);
      if (i >= 0) {
        let a = Math.max(0, i - 60);
        if (a > 0) { const sp = p.x.indexOf(" ", a); if (sp > 0 && sp < i) a = sp + 1; }
        const s = p.x.slice(a, a + 170);
        return (a > 0 ? "…" : "") + s + (a + 170 < p.x.length ? "…" : "");
      }
    }
    return p.d || p.x.slice(0, 160);
  }
  // Text with the searched words in <mark>, built from text nodes (never innerHTML).
  function marked(text, tk) {
    const frag = document.createDocumentFragment();
    const words = tk.filter((w) => w.length > 0).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    if (!words.length) { frag.append(text); return frag; }
    const re = new RegExp(`(${words.join("|")})`, "gi");
    let last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) frag.append(text.slice(last, m.index));
      const mk = document.createElement("mark"); mk.textContent = m[0]; frag.append(mk);
      last = m.index + m[0].length;
      if (!m[0].length) re.lastIndex++;
    }
    if (last < text.length) frag.append(text.slice(last));
    return frag;
  }

  /* ---------- Showing the results ---------- */
  let results = [], active = -1, seq = 0;
  const href = (p) => new URL(p.u, BASE).href;
  function setActive(i) {
    const opts = list.querySelectorAll("[role=option]");
    active = opts.length ? (i + opts.length) % opts.length : -1;
    opts.forEach((o, n) => o.setAttribute("aria-selected", String(n === active)));
    if (active >= 0) { input.setAttribute("aria-activedescendant", opts[active].id); opts[active].scrollIntoView({ block: "nearest" }); }
    else input.removeAttribute("aria-activedescendant");
  }
  function render(items, q, { showEmpty = false } = {}) {
    results = items; active = -1;
    input.removeAttribute("aria-activedescendant");
    list.textContent = "";
    const tk = tokens(q);
    items.forEach((p, n) => {
      const li = document.createElement("li"); li.setAttribute("role", "presentation");
      const a = document.createElement("a");
      a.className = "tse-finder__opt"; a.id = `tse-finder-opt-${n}`; a.href = href(p); a.tabIndex = -1;
      a.setAttribute("role", "option"); a.setAttribute("aria-selected", "false");
      const ti = document.createElement("span"); ti.className = "tse-finder__opt-title"; ti.append(marked(p.t, tk));
      const pa = document.createElement("span"); pa.className = "tse-finder__opt-path";
      pa.textContent = p.u === "index.html" ? "/" : "/" + p.u.replace(/\.html$/, "");
      const sn = document.createElement("span"); sn.className = "tse-finder__opt-snip"; sn.append(marked(snippet(p, tk), tk));
      a.append(ti, pa, sn); li.append(a); list.append(li);
      a.addEventListener("mousemove", () => { if (active !== n) setActive(n); });
    });
    const open = items.length > 0;
    list.hidden = !open;
    input.setAttribute("aria-expanded", String(open));
    if (empty) { empty.textContent = t("searchNoResults"); empty.hidden = !(showEmpty || (q.trim() && !open)); }
    if (status) status.textContent = q.trim() ? (open ? t("searchCount").replace("{n}", items.length) : t("searchNoResults")) : "";
  }
  async function update() {
    const q = input.value, my = ++seq;
    if (!q.trim()) { render([], ""); return; }
    const pages = await load(lang());
    if (my !== seq) return;   // a newer keystroke already answered
    render(search(pages, q), q);
  }
  let timer = 0;
  input.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(update, 60); form.classList.toggle("is-active", !!input.value || document.activeElement === input); });

  /* ---------- Opening and closing ---------- */
  const isOpen = () => inline.matches || !panel.hidden;
  function openPanel() {
    if (isOpen()) { input.focus(); load(lang()); return; }
    panel.hidden = false; toggle.setAttribute("aria-expanded", "true"); root.classList.add("is-open");
    input.focus();
    load(lang());
    if (input.value.trim()) update();
  }
  function hideResults() {
    list.hidden = true; input.setAttribute("aria-expanded", "false"); if (empty) empty.hidden = true;
    active = -1; input.removeAttribute("aria-activedescendant");
  }
  function closePanel(returnFocus) {
    hideResults();
    if (inline.matches || panel.hidden) return;   // the desktop bar stays; only its results close
    panel.hidden = true; toggle.setAttribute("aria-expanded", "false"); root.classList.remove("is-open");
    if (returnFocus) toggle.focus();
  }
  toggle.addEventListener("click", () => (isOpen() ? closePanel(true) : openPanel()));
  ["pointerenter", "focus"].forEach((e) => toggle.addEventListener(e, () => load(lang()), { once: true }));
  input.addEventListener("focus", () => { form.classList.add("is-active"); load(lang()); if (input.value.trim() && list.hidden) update(); });
  input.addEventListener("blur", () => { if (!input.value) form.classList.remove("is-active"); });
  document.addEventListener("pointerdown", (e) => { if (isOpen() && !root.contains(e.target)) closePanel(false); });
  root.addEventListener("focusout", (e) => { if (isOpen() && e.relatedTarget && !root.contains(e.relatedTarget)) closePanel(false); });
  // "/" opens the search from anywhere except a text field
  document.addEventListener("keydown", (e) => {
    if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
    const el = document.activeElement;
    if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
    e.preventDefault(); openPanel();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (list.hidden) { if (results.length) { list.hidden = false; input.setAttribute("aria-expanded", "true"); } else return; }
      e.preventDefault();
      setActive(active < 0 ? (e.key === "ArrowDown" ? 0 : -1) : active + (e.key === "ArrowDown" ? 1 : -1));
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (!list.hidden || (empty && !empty.hidden)) hideResults();
      else if (inline.matches) input.blur();
      else closePanel(true);
    }
  });
  panel.addEventListener("keydown", (e) => { if (e.key === "Escape" && e.target !== input) { e.preventDefault(); closePanel(true); } });

  /* ---------- Enter: the highlighted result, or the top one; the icon spins while it looks ---------- */
  let busy = false;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (busy || !q) return;
    if (active >= 0 && results[active]) { location.href = href(results[active]); return; }
    busy = true;
    form.classList.add("is-processing"); form.classList.remove("is-active"); input.readOnly = true;
    const [pages] = await Promise.all([load(lang()), new Promise((r) => setTimeout(r, reduceMotion.matches ? 0 : 450))]);
    const found = search(pages, q);
    form.classList.remove("is-processing"); input.readOnly = false; busy = false;
    form.classList.add("is-active");
    if (found.length) { location.href = href(found[0]); return; }
    render([], q, { showEmpty: true });
  });

  inline.addEventListener("change", () => { hideResults(); if (!inline.matches) { panel.hidden = true; toggle.setAttribute("aria-expanded", "false"); root.classList.remove("is-open"); } });

  // A new language: new index, new words in the results
  document.addEventListener("tse:lang", () => { if (empty) empty.textContent = t("searchNoResults"); if (isOpen() && input.value.trim()) update(); else render([], ""); });
})();
