/* Knowledge Base: instant search, section filters, and jump links that scroll to and highlight a term. */
(function () {
  const root = document.querySelector(".kb-page") || document.body;
  const search = root.querySelector("#kb-q");
  const chips = [...root.querySelectorAll(".kb-chip[data-kb-sec]")];
  const terms = [...root.querySelectorAll(".kb-term[data-kb-id]")];
  const sections = [...root.querySelectorAll(".kb-sec[data-kb-sec]")];
  const status = root.querySelector("[data-kb-status]");
  const clearBtn = root.querySelector("[data-kb-clear]");
  const empty = root.querySelector("[data-kb-empty]");
  if (!search || !terms.length) return;

  const tr = (key, fallback) => {
    try {
      const lang = (document.documentElement.lang || "en").slice(0, 3);
      const pack = (window.TRANSLATIONS && (window.TRANSLATIONS[lang] || window.TRANSLATIONS.en)) || {};
      if (pack[key] != null && String(pack[key])) return String(pack[key]);
    } catch (e) {}
    return fallback;
  };

  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const index = terms.map((el) => {
    const term = (el.getAttribute("data-kb-term") || "").toLowerCase();
    const def = ((el.querySelector(".kb-term-def") || {}).textContent || "").toLowerCase();
    const why = ((el.querySelector(".kb-term-why") || {}).textContent || "").toLowerCase();
    return { el, term, text: term + " " + def + " " + why, sec: el.getAttribute("data-kb-sec") || "" };
  });

  let sec = "all";
  let query = "";

  const setChip = (value) => {
    chips.forEach((btn) => {
      const on = btn.getAttribute("data-kb-sec") === value;
      btn.setAttribute("aria-checked", on ? "true" : "false");
    });
  };

  const apply = () => {
    const q = query.trim().toLowerCase();
    let shown = 0;
    const secCount = {};
    index.forEach((item) => {
      const secOk = sec === "all" || item.sec === sec;
      let hit = !q;
      if (q) hit = item.term === q || item.term.includes(q) || item.text.includes(q);
      const on = secOk && hit;
      item.el.classList.toggle("kb-is-hidden", !on);
      if (on) {
        shown += 1;
        secCount[item.sec] = (secCount[item.sec] || 0) + 1;
      }
    });
    sections.forEach((s) => {
      const key = s.getAttribute("data-kb-sec");
      const n = secCount[key] || 0;
      s.classList.toggle("kb-is-hidden", n === 0);
      const count = s.querySelector(".kb-sec-n");
      if (count) count.textContent = String(n);
    });
    if (empty) empty.hidden = shown !== 0;
    if (clearBtn) clearBtn.hidden = !(q || sec !== "all");
    if (status) {
      const qText = q ? ` ${tr("kbMatching", "matching")} “${query.trim()}”` : "";
      const secBtn = chips.find((c) => c.getAttribute("data-kb-sec") === sec);
      const secName = sec !== "all" && secBtn ? " " + tr("kbInSection", "in") + " " + (secBtn.querySelector("[data-i18n]") || secBtn).textContent.replace(/\d+/g, "").trim() : "";
      const word = shown === 1 ? tr("kbCountOne", "1 term") : String(shown) + " " + tr("kbTermsWord", "terms");
      status.textContent = word + secName + qText;
    }
  };

  const scrollToTerm = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const item = index.find((x) => x.el.id === id);
    if (item && el.classList.contains("kb-is-hidden")) {
      query = "";
      sec = "all";
      search.value = "";
      setChip("all");
      apply();
    }
    terms.forEach((t) => t.classList.remove("kb-is-target"));
    el.classList.add("kb-is-target");
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    const name = el.querySelector(".kb-term-name");
    if (name && typeof name.focus === "function") {
      if (!name.hasAttribute("tabindex")) name.setAttribute("tabindex", "-1");
      try { name.focus({ preventScroll: true }); } catch (e) { name.focus(); }
    }
    window.setTimeout(() => el.classList.remove("kb-is-target"), reduce ? 2500 : 2200);
  };

  const jump = (id) => {
    if (!id) return;
    if (history && history.replaceState) {
      try { history.replaceState(null, "", "#" + id); } catch (e) {}
    } else {
      location.hash = id;
    }
    scrollToTerm(id);
  };

  search.addEventListener("input", () => {
    query = search.value;
    apply();
  });
  search.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      search.value = "";
      query = "";
      apply();
    }
  });

  chips.forEach((btn, i) => {
    btn.addEventListener("click", () => {
      sec = btn.getAttribute("data-kb-sec") || "all";
      setChip(sec);
      apply();
    });
    btn.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "Home" && e.key !== "End") return;
      e.preventDefault();
      let next = i;
      if (e.key === "ArrowRight") next = (i + 1) % chips.length;
      if (e.key === "ArrowLeft") next = (i - 1 + chips.length) % chips.length;
      if (e.key === "Home") next = 0;
      if (e.key === "End") next = chips.length - 1;
      chips[next].focus();
      chips[next].click();
    });
  });

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      query = "";
      sec = "all";
      search.value = "";
      setChip("all");
      apply();
      search.focus();
    });
  }

  document.addEventListener("click", (e) => {
    const a = e.target.closest("[data-kb-jump]");
    if (!a) return;
    const id = a.getAttribute("data-kb-jump");
    if (!id || !document.getElementById(id)) return;
    e.preventDefault();
    jump(id);
  });

  const fromHash = () => {
    const id = (location.hash || "").replace(/^#/, "");
    if (id && document.getElementById(id)) scrollToTerm(id);
  };

  apply();
  fromHash();
  window.addEventListener("hashchange", fromHash);
})();
