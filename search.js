// Footer search: the finder bar sits in the site footer (always visible, no header toggle). Results come from
// data/search/<lang>.json, which tools/build-pages.mjs writes from every page and blog post (data-search-v, stamped
// by tools/stamp-assets.mjs, is its version). Combobox pattern: arrow keys move through the results, Enter opens
// one, Esc closes them. The results list is position:fixed and opens upward when the bar is near the bottom of the
// viewport so it is not clipped by the footer or the page end. The script stays usable if a leftover toggle or
// panel is absent (or present but unused).
(function () {
  "use strict";
  const root = document.querySelector(".tse-finder[data-search]");
  if (!root) return;
  const $ = (s) => root.querySelector(s);
  const toggle = $(".tse-finder__toggle"), panel = $(".tse-finder__panel"), form = $(".tse-finder__form");
  const input = $(".tse-finder__input"), list = $(".tse-finder__list"), empty = $(".tse-finder__empty"), status = $("[data-search-status]");
  if (!form || !input || !list) return;
  const BASE = new URL("./", (document.currentScript && document.currentScript.src) || location.href);
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const T = window.TRANSLATIONS || {};
  const lang = () => (T[document.documentElement.lang] ? document.documentElement.lang : "en");
  const t = (key) => { const L = T[lang()] || {}; return L[key] !== undefined ? L[key] : (T.en && T.en[key]) || ""; };
  const MAX = 8;

  /* ---------- The index: one file per language, fetched the first time the finder is used ---------- */
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

  /* ---------- Showing the results, pinned to the bar and flipped up near the bottom of the viewport ---------- */
  let results = [], active = -1, seq = 0;
  const href = (p) => new URL(p.u, BASE).href;
  function popover() {
    if (list && !list.hidden) return list;
    if (empty && !empty.hidden) return empty;
    return null;
  }
  function placeResults() {
    const pop = popover();
    if (!pop) return;
    const anchor = form.querySelector(".tse-finder__outer") || form;
    const r = anchor.getBoundingClientRect();
    const gap = 12, gutter = 16, vw = window.innerWidth, vh = window.innerHeight;
    const narrow = window.matchMedia("(max-width: 860px)").matches;
    const width = narrow ? Math.max(0, Math.min(r.width, vw - gutter * 2)) : Math.min(460, vw - gutter * 2, Math.max(r.width, 320));
    const rtl = document.documentElement.dir === "rtl";
    let left = rtl ? r.left : r.right - width;
    left = Math.max(gutter, Math.min(left, vw - width - gutter));
    pop.style.position = "fixed";
    pop.style.width = width + "px";
    pop.style.left = left + "px";
    pop.style.right = "auto";
    pop.style.maxHeight = "none";
    pop.style.bottom = "auto";
    const h = pop.getBoundingClientRect().height;
    const spaceAbove = r.top - gap - gutter;
    const spaceBelow = vh - r.bottom - gap - gutter;
    const openUp = spaceAbove >= Math.min(h, 160) || spaceAbove >= spaceBelow;
    const maxH = Math.max(120, Math.min(openUp ? spaceAbove : spaceBelow, vh * 0.6, 440));
    pop.style.maxHeight = maxH + "px";
    const usedH = Math.min(h > 0 ? h : maxH, maxH);
    if (openUp) {
      pop.style.top = Math.max(gutter, r.top - gap - usedH) + "px";
      root.classList.add("is-up");
      root.classList.remove("is-down");
    } else {
      pop.style.top = (r.bottom + gap) + "px";
      root.classList.add("is-down");
      root.classList.remove("is-up");
    }
  }
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
    if (popover()) placeResults();
    else { root.classList.remove("is-up", "is-down"); }
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

  /* ---------- Opening and closing the results (the bar itself stays visible) ---------- */
  function hideResults() {
    list.hidden = true; input.setAttribute("aria-expanded", "false"); if (empty) empty.hidden = true;
    active = -1; input.removeAttribute("aria-activedescendant");
    root.classList.remove("is-up", "is-down");
  }
  function focusFinder() {
    input.focus();
    load(lang());
    if (input.value.trim() && list.hidden) update();
  }
  if (toggle) {
    toggle.addEventListener("click", () => { focusFinder(); });
    ["pointerenter", "focus"].forEach((e) => toggle.addEventListener(e, () => load(lang()), { once: true }));
  }
  input.addEventListener("focus", () => { form.classList.add("is-active"); load(lang()); if (input.value.trim() && list.hidden) update(); });
  input.addEventListener("blur", () => { if (!input.value) form.classList.remove("is-active"); });
  document.addEventListener("pointerdown", (e) => { if (!root.contains(e.target) && popover()) hideResults(); });
  root.addEventListener("focusout", (e) => { if (e.relatedTarget && !root.contains(e.relatedTarget) && popover()) hideResults(); });
  // "/" opens the search from anywhere except a text field
  document.addEventListener("keydown", (e) => {
    if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
    const el = document.activeElement;
    if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
    e.preventDefault(); focusFinder();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (list.hidden) { if (results.length) { list.hidden = false; input.setAttribute("aria-expanded", "true"); placeResults(); } else return; }
      e.preventDefault();
      setActive(active < 0 ? (e.key === "ArrowDown" ? 0 : -1) : active + (e.key === "ArrowDown" ? 1 : -1));
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (!list.hidden || (empty && !empty.hidden)) hideResults();
      else input.blur();
    }
  });
  if (panel) panel.addEventListener("keydown", (e) => { if (e.key === "Escape" && e.target !== input) { e.preventDefault(); hideResults(); input.blur(); } });

  window.addEventListener("resize", () => { if (popover()) placeResults(); });
  window.addEventListener("scroll", () => { if (popover()) placeResults(); }, { passive: true, capture: true });

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

  // A new language: new index, new words in the results
  document.addEventListener("tse:lang", () => { if (empty) empty.textContent = t("searchNoResults"); if (input.value.trim()) update(); else render([], ""); });
})();
