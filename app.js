// The address the consultation form writes to. Change it here if the company email changes.
const CONTACT_EMAIL = "tenshisystemsengineering@gmail.com";

// Used by the homepage and the service pages; each part below only runs if its section is on the page.
(function () {
  "use strict";
  const T = window.TRANSLATIONS;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked: fine */ } }
  };
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const SCRIPT_BASE = (document.currentScript && document.currentScript.src) || location.href;
  const onLanguage = [];   // parts that need to redo their text when the language changes

  let lang = "en";
  const t = (key) => (T[lang] && T[lang][key] !== undefined ? T[lang][key] : T.en[key]);

  /* ---------- Language switch ---------- */
  function setLanguage(next) {
    lang = T[next] ? next : "en";
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" || lang === "fa" ? "rtl" : "ltr";   // Arabic and Farsi read right to left
    // Service pages name themselves (data-title-key); the homepage uses pageTitle.
    // Blog post pages set data-fixed-title so a language change does not replace the English title or description.
    const titleKey = document.body.dataset.titleKey;
    const fixedTitle = document.body.hasAttribute("data-fixed-title");
    if (titleKey) document.title = `${t(titleKey)} | ${t("brandName")}`;
    else if (!fixedTitle) document.title = t("pageTitle");
    const meta = $('meta[name="description"]');
    const descKey = document.body.dataset.descKey;
    if (meta && descKey) meta.setAttribute("content", t(descKey));
    else if (meta && !fixedTitle) meta.setAttribute("content", t("metaDescription"));

    $$("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
    $$("[data-i18n-attr]").forEach((el) => {
      el.dataset.i18nAttr.split(";").forEach((pair) => {
        const [attr, key] = pair.split(":");
        el.setAttribute(attr, t(key));
      });
    });
    $$(".lang-picker [data-lang]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === lang)));
    const current = $(".lang-current");
    if (current) {
      $("use", current).setAttribute("href", "#flag-" + lang);
      $(".lang-code", current).textContent = lang === "pcm" ? "NG" : lang.toUpperCase();
    }
    onLanguage.forEach((fn) => fn());
    document.dispatchEvent(new CustomEvent("tse:lang", { detail: lang }));   // chat.js listens
    store.set("tse-lang", lang);
  }

  /* ---------- Language picker: a flag button that opens the list of languages ---------- */
  const picker = $(".lang-picker");
  if (picker) {
    const toggle = $(".lang-current", picker);
    const menu = $(".lang-menu", picker);
    const options = $$("[data-lang]", menu);
    const open = (focusFirst) => {
      menu.hidden = false;
      toggle.setAttribute("aria-expanded", "true");
      requestAnimationFrame(() => picker.classList.add("is-open"));
      if (focusFirst) (options.find((o) => o.dataset.lang === lang) || options[0]).focus();
    };
    const close = (returnFocus) => {
      picker.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
      menu.hidden = true;
      if (returnFocus) toggle.focus();
    };
    toggle.addEventListener("click", () => (menu.hidden ? open(false) : close(false)));
    toggle.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); open(true); }
    });
    options.forEach((o, i) => {
      o.addEventListener("click", () => { setLanguage(o.dataset.lang); close(true); });
      o.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown") { e.preventDefault(); options[(i + 1) % options.length].focus(); }
        if (e.key === "ArrowUp") { e.preventDefault(); options[(i - 1 + options.length) % options.length].focus(); }
        if (e.key === "Home") { e.preventDefault(); options[0].focus(); }
        if (e.key === "End") { e.preventDefault(); options[options.length - 1].focus(); }
      });
    });
    picker.addEventListener("keydown", (e) => { if (e.key === "Escape" && !menu.hidden) close(true); });
    document.addEventListener("click", (e) => { if (!menu.hidden && !picker.contains(e.target)) close(false); });
    picker.addEventListener("focusout", (e) => { if (!menu.hidden && e.relatedTarget && !picker.contains(e.relatedTarget)) close(false); });
  }

  /* ---------- Header fit: the menu moves to its own row whenever the name and menu don't fit side by side ----------
     Ten languages have very different word lengths, so this measures instead of guessing a screen width. */
  const headerInner = $(".header-inner");
  const fitHeader = () => {
    if (!headerInner) return;
    const header = headerInner.closest(".site-header");
    const nav = $(".main-nav", headerInner), brand = $(".brand-text", headerInner), picker = $(".lang-picker", headerInner);
    if (!nav || !brand || !picker) return;
    const fits = () => {
      const b = brand.getBoundingClientRect(), n = nav.getBoundingClientRect(), p = picker.getBoundingClientRect();
      const links = $$(":scope > ul > li > a", nav).map((a) => a.getBoundingClientRect());   // top-level items only
      if (Math.abs(n.top - b.top) >= b.height) return false;   // the menu has already wrapped below
      const rtl = document.documentElement.dir === "rtl";
      const L = Math.min(...links.map((r) => r.left)), R = Math.max(...links.map((r) => r.right));
      const roomy = rtl ? (b.left - R >= 20 && L - p.right >= 14) : (L - b.right >= 20 && p.left - R >= 14);
      return roomy && headerInner.scrollWidth <= headerInner.clientWidth + 1 && !links.some((r) => r.height > 60);
    };
    // Try the full size first, then two tighter sizes, and only then give the menu its own row.
    const steps = [[], ["is-compact"], ["is-compact", "is-tight"], ["is-compact", "is-tight", "is-stacked"]];
    for (const step of steps) {
      header.classList.remove("is-compact", "is-tight", "is-stacked");
      if (step.length) header.classList.add(...step);
      if (step.includes("is-stacked") || fits()) break;
    }
  };
  if (headerInner) {
    onLanguage.push(() => { fitHeader(); requestAnimationFrame(fitHeader); });
    window.addEventListener("load", fitHeader);
    window.addEventListener("resize", () => requestAnimationFrame(fitHeader));
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitHeader);
  }

  /* ---------- Menu row on phones: one straight line that scrolls sideways (styles.css), current page in view, fades on
     the side that has more ---------- */
  const navRow = $(".site-header .main-nav");
  if (navRow) {
    const edges = () => {
      const max = navRow.scrollWidth - navRow.clientWidth;
      const x = Math.abs(navRow.scrollLeft);   // right-to-left pages scroll with negative values
      const rtl = document.documentElement.dir === "rtl";
      const before = max > 2 && x > 2, after = max > 2 && x < max - 2;
      // has-more-start / has-more-end fade the left / right edge
      navRow.classList.toggle("has-more-start", rtl ? after : before);
      navRow.classList.toggle("has-more-end", rtl ? before : after);
    };
    const showCurrent = () => {
      const cur = $(':scope > ul > li > a[aria-current="page"]', navRow);
      if (cur && navRow.scrollWidth > navRow.clientWidth + 2) {
        const n = navRow.getBoundingClientRect(), c = cur.getBoundingClientRect();
        navRow.scrollLeft += (c.left + c.width / 2) - (n.left + n.width / 2);
      }
      edges();
    };
    navRow.addEventListener("scroll", edges, { passive: true });
    window.addEventListener("resize", () => requestAnimationFrame(edges));
    window.addEventListener("load", showCurrent);
    onLanguage.push(() => requestAnimationFrame(showCurrent));
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(showCurrent);
    showCurrent();
  }

  /* ---------- Red band: the slogan, then the taglines, written in word by word ---------- */
  const band = $(".band");
  let setupBand = () => {};
  if (band) {
    // Lines, order and timing come from data/slogan.json via the band's data attributes (Tenshi Editor › Slogan)
    const BAND_LINES = (band.dataset.lines || "motto,tag1,tag2,tag3,tag4").split(",").filter(Boolean);
    const BAND_HOLD = (parseFloat(band.dataset.hold) || 7) * 1000;   // how long each line stays, in milliseconds
    const JA_FIRST = band.dataset.jaFirst !== "0";                     // show each line in Japanese first
    const PACE = parseFloat(band.dataset.pace) || 90;                  // milliseconds between words
    const stage = $(".band-stage");
    const bandLine = $(".band-line");
    const sheen = $(".band-sheen");
    let bandIndex = 0, bandTimer = null, bandHeld = false, bandReady = false;

    const restart = (el) => { el.classList.remove("is-on"); void el.offsetWidth; el.classList.add("is-on"); };

    // Writes one line into the band in the given language.
    // English, Korean and German go in word by word. Japanese has no spaces, so the browser finds the words (whole
    // words never break across lines); browsers without that go character by character.
    const writeLine = (text, inLang) => {
      const noSpaces = inLang === "ja" || inLang === "zh";   // Japanese and Chinese are written without spaces
      const units = !noSpaces ? text.split(" ")
        : window.Intl && Intl.Segmenter ? Array.from(new Intl.Segmenter(inLang, { granularity: "word" }).segment(text), (s) => s.segment)
        : Array.from(text);
      stage.setAttribute("lang", inLang);
      stage.style.setProperty("--step", (noSpaces ? PACE * 0.45 : PACE) + "ms");
      stage.setAttribute("dir", inLang === "ar" || inLang === "fa" ? "rtl" : "ltr");
      stage.classList.remove("is-out");
      stage.replaceChildren(...units.map((u, k) => {
        const s = document.createElement("span");
        s.className = "band-unit";
        s.style.setProperty("--i", k);
        s.textContent = u;
        return s;
      }));
    };

    // Each line appears in Japanese first; for visitors in another language it then dissolves and rewrites itself
    // in their language.
    const JA_HOLD = (parseFloat(band.dataset.jaHold) || 1.9) * 1000;   // how long the Japanese stays before switching
    let switchTimer = null;
    const showBandLine = (i) => {
      clearTimeout(switchTimer);
      bandIndex = i % BAND_LINES.length;
      const key = BAND_LINES[bandIndex];
      stage.classList.toggle("is-tag", bandIndex > 0);
      const ja = (T.ja && T.ja[key]) || t(key);
      writeLine(JA_FIRST ? ja : t(key), JA_FIRST ? "ja" : lang);
      restart(bandLine);
      restart(sheen);
      if (lang === "ja" || !JA_FIRST) return;
      const shownIndex = bandIndex;
      switchTimer = setTimeout(() => {
        stage.classList.add("is-out");
        switchTimer = setTimeout(() => {
          if (bandIndex !== shownIndex) return;
          writeLine(t(key), lang);
          restart(sheen);
        }, 520);
      }, JA_HOLD);
    };

    const nextBandLine = () => { stage.classList.add("is-out"); setTimeout(() => showBandLine(bandIndex + 1), 650); };

    const runBand = () => {
      clearInterval(bandTimer);
      bandTimer = null;
      if (!bandReady || bandHeld || document.hidden) return;
      bandTimer = setInterval(nextBandLine, BAND_HOLD);
    };

    setupBand = () => {
      bandReady = !reduceMotion.matches;
      document.documentElement.classList.toggle("band-anim", bandReady);
      if (bandReady) showBandLine(bandIndex);
      runBand();
    };

    onLanguage.push(() => { if (bandReady) showBandLine(bandIndex); });
    band.addEventListener("mouseenter", () => { bandHeld = true; runBand(); });
    band.addEventListener("mouseleave", () => { bandHeld = false; runBand(); });
    document.addEventListener("visibilitychange", runBand);
    reduceMotion.addEventListener("change", setupBand);
  }

  /* ---------- Skyline slideshow ---------- */
  const slides = $$(".hero-slides .slide");
  let startSlides = () => {};
  if (slides.length) {
    const dots = $$(".slide-dots .dot");
    const pauseBtn = $(".slide-pause");
    const INTERVAL = 7000;
    let current = 0, timer = null, userPaused = reduceMotion.matches;

    const load = (slide) => {
      if (slide.dataset.loaded) return Promise.resolve();
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = img.onerror = () => {
          slide.style.backgroundImage = `url("${slide.dataset.src}")`;
          slide.dataset.loaded = "1";
          resolve();
        };
        img.src = slide.dataset.src;
      });
    };

    const updateCaption = () => { const city = $("#slide-city"); if (city) city.textContent = t("city" + current); };

    const updatePauseLabel = () => {
      if (!pauseBtn) return;
      pauseBtn.setAttribute("aria-pressed", String(userPaused));
      pauseBtn.classList.toggle("is-paused", userPaused);
      $(".sr-only", pauseBtn).textContent = t(userPaused ? "play" : "pause");
    };

    const show = (i) => {
      const next = (i + slides.length) % slides.length;
      load(slides[next]).then(() => {
        slides.forEach((s, k) => s.classList.toggle("is-active", k === next));
        dots.forEach((d, k) => (k === next ? d.setAttribute("aria-current", "true") : d.removeAttribute("aria-current")));
        current = next;
        updateCaption();
        load(slides[(next + 1) % slides.length]); // get the next one ready
      });
    };

    startSlides = () => {
      clearInterval(timer);
      timer = null;
      if (userPaused || document.hidden) return;
      timer = setInterval(() => show(current + 1), INTERVAL);
    };

    onLanguage.push(updateCaption, updatePauseLabel);
    dots.forEach((d) => d.addEventListener("click", () => { show(+d.dataset.slide); startSlides(); }));
    if (pauseBtn) pauseBtn.addEventListener("click", () => { userPaused = !userPaused; updatePauseLabel(); startSlides(); });
    document.addEventListener("visibilitychange", startSlides);
    load(slides[0]).then(() => load(slides[1]));
  }

  /* ---------- Service cards: three at a time, new sets slide in from the right ---------- */
  // No buttons: the sets change on their own and hold still while someone hovers over or tabs into them.
  // For reduced motion all nine cards simply show, three per row.
  const carousel = $(".svc-carousel");
  let startCards = () => {};
  if (carousel && !reduceMotion.matches) {
    const sets = $$(".svc-set", carousel);
    const HOLD = 8000;   // how long each set of three stays, in milliseconds
    let current = 0, timer = null, held = false;

    carousel.classList.add("svc-js");

    const label = () => sets.forEach((s, n) => s.setAttribute("aria-label", t("svcGroup").replace("{n}", n + 1)));

    const go = (to) => {
      const target = (to + sets.length) % sets.length;
      if (target === current) return;
      const leaving = sets[current];
      carousel.classList.add("has-moved");
      leaving.classList.remove("is-active");
      leaving.classList.add("is-leaving");
      leaving.inert = true;
      setTimeout(() => leaving.classList.remove("is-leaving"), 600);
      sets[target].classList.add("is-active");
      sets[target].inert = false;
      current = target;
    };

    startCards = () => {
      clearInterval(timer);
      timer = null;
      if (held || document.hidden) return;
      timer = setInterval(() => go(current + 1), HOLD);
    };

    sets.forEach((s, n) => { s.inert = n !== 0; });
    carousel.addEventListener("mouseenter", () => { held = true; startCards(); });
    carousel.addEventListener("mouseleave", () => { held = false; startCards(); });
    carousel.addEventListener("focusin", () => { held = true; startCards(); });
    carousel.addEventListener("focusout", (e) => { if (!carousel.contains(e.relatedTarget)) { held = false; startCards(); } });
    document.addEventListener("visibilitychange", startCards);
    onLanguage.push(label);
  }

  /* ---------- Team page: cards tilt toward the pointer; a click opens the full profile ---------- */
  const teamCards = $$(".team-card");
  if (teamCards.length) {
    if (!reduceMotion.matches) teamCards.forEach((card) => {
      card.addEventListener("pointermove", (e) => {
        const r = card.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
        card.style.setProperty("--ry", (x * 12).toFixed(2) + "deg");
        card.style.setProperty("--rx", (-y * 12).toFixed(2) + "deg");
        card.style.setProperty("--gx", ((x + 0.5) * 100).toFixed(1) + "%");
        card.style.setProperty("--gy", ((y + 0.5) * 100).toFixed(1) + "%");
      });
      card.addEventListener("pointerleave", () => { card.style.setProperty("--rx", "0deg"); card.style.setProperty("--ry", "0deg"); });
    });

    const dlg = document.createElement("dialog");
    dlg.className = "team-dialog";
    dlg.innerHTML = `
      <button type="button" class="td-close"><span class="sr-only" data-i18n="teamClose"></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
      <div class="td-body"></div>
      <div class="td-nav">
        <button type="button" class="td-prev"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5"/></svg><span class="sr-only" data-i18n="teamPrev"></span></button>
        <span class="td-count" aria-hidden="true"></span>
        <button type="button" class="td-next"><span class="sr-only" data-i18n="teamNext"></span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5"/></svg></button>
      </div>`;
    document.body.appendChild(dlg);
    $$("[data-i18n]", dlg).forEach((el) => { el.textContent = t(el.dataset.i18n); });
    let shown = 0, opener = null;

    const show = (i) => {
      shown = (i + teamCards.length) % teamCards.length;
      const detail = document.getElementById("member-" + teamCards[shown].dataset.member);
      const body = $(".td-body", dlg);
      body.innerHTML = detail.innerHTML;
      body.classList.remove("is-in"); void body.offsetWidth; body.classList.add("is-in");
      const name = $(".td-name", body);
      name.id = "team-dialog-name";
      dlg.setAttribute("aria-labelledby", "team-dialog-name");
      $(".td-count", dlg).textContent = (shown + 1) + " / " + teamCards.length;
    };
    const close = () => {
      dlg.classList.add("is-closing");
      setTimeout(() => { dlg.classList.remove("is-closing"); if (dlg.open) dlg.close(); if (opener) opener.focus(); }, reduceMotion.matches ? 0 : 180);
    };

    teamCards.forEach((card, i) => card.addEventListener("click", () => {
      opener = card;
      show(i);
      if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
      $(".td-close", dlg).focus();
    }));
    $(".td-close", dlg).addEventListener("click", close);
    $(".td-prev", dlg).addEventListener("click", () => show(shown - 1));
    $(".td-next", dlg).addEventListener("click", () => show(shown + 1));
    dlg.addEventListener("cancel", (e) => { e.preventDefault(); close(); });
    dlg.addEventListener("click", (e) => { if (e.target === dlg) close(); });
    dlg.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") show(shown + 1);
      if (e.key === "ArrowLeft") show(shown - 1);
    });
  }

  /* ---------- Technology page: show one category or all ---------- */
  const techFilter = $(".tech-filter");
  if (techFilter) {
    const buttons = $$("button", techFilter);
    const groups = $$(".tech-group");
    buttons.forEach((b) => b.addEventListener("click", () => {
      const pick = b.dataset.filter;
      buttons.forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      groups.forEach((g) => {
        const show = pick === "all" || g.dataset.group === pick;
        g.hidden = !show;
        if (show && !reduceMotion.matches) { g.classList.remove("is-in"); void g.offsetWidth; g.classList.add("is-in"); }
      });
    }));
  }

  /* ---------- Consultation form ---------- */
  const form = $(".contact-form");
  if (form) {
    const status = $(".form-status");
    const emailLink = $(".contact-email");
    if (emailLink) {
      emailLink.href = "mailto:" + CONTACT_EMAIL;
      emailLink.textContent = CONTACT_EMAIL;
    }

    const rules = {
      name: (v) => v.trim() !== "" || "errName",
      email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) || "errEmail",
      message: (v) => v.trim().length >= 5 || "errMessage"
    };

    const validateField = (input) => {
      const rule = rules[input.name];
      if (!rule) return true;
      const result = rule(input.value);
      const field = input.closest(".field");
      const msg = $(".error", field);
      const ok = result === true;
      field.classList.toggle("has-error", !ok);
      input.setAttribute("aria-invalid", String(!ok));
      msg.textContent = ok ? "" : t(result);
      return ok;
    };

    // Re-show any visible error messages in the new language.
    onLanguage.push(() => $$(".field.has-error", form).forEach((f) => validateField($("input, textarea", f))));

    $$("input, textarea", form).forEach((el) => {
      el.addEventListener("blur", () => { if (el.value) validateField(el); });
      el.addEventListener("input", () => { if (el.closest(".field").classList.contains("has-error")) validateField(el); });
    });

    // A service page's "Request Consultation" link carries ?topic=…: choose that service in the list.
    const topic = new URLSearchParams(location.search).get("topic");
    const select = $("#f-topic");
    if (topic && select && [...select.options].some((o) => o.value === topic)) select.value = topic;

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const inputs = $$("input[required], textarea[required]", form);
      const results = inputs.map(validateField);
      if (results.includes(false)) {
        status.textContent = t("errSummary");
        status.className = "form-status field-wide is-error";
        inputs[results.indexOf(false)].focus();
        return;
      }
      const data = Object.fromEntries(new FormData(form));
      const topicName = t(data.topic);
      const lines = [
        `${t("mailName")}: ${data.name}`,
        data.company ? `${t("mailCompany")}: ${data.company}` : "",
        `${t("mailEmail")}: ${data.email}`,
        data.phone ? `${t("mailPhone")}: ${data.phone}` : "",
        `${t("mailTopic")}: ${topicName}`,
        "",
        data.message
      ].filter((l, i) => l !== "" || i === 5);
      const url = "mailto:" + CONTACT_EMAIL +
        "?subject=" + encodeURIComponent(t("mailSubject").replace("{topic}", topicName)) +
        "&body=" + encodeURIComponent(lines.join("\n"));
      status.textContent = t("sent").replace("{email}", CONTACT_EMAIL);
      status.className = "form-status field-wide is-ok";
      window.location.href = url;
    });

    // The consultation button: move focus to the form section for keyboard and screen reader users.
    $$('a[href="#contact"]').forEach((a) => a.addEventListener("click", () => {
      setTimeout(() => $("#contact").focus({ preventScroll: true }), 400);
    }));
  }

  /* ---------- Start ---------- */
  const year = $("#year");
  if (year) year.textContent = new Date().getFullYear();
  const params = new URLSearchParams(location.search);
  // The site opens in Japanese. On a first visit (no saved choice, no ?lang= in the address) a pop-up asks which
  // language to use; the choice is remembered, so it only appears once.
  const saved = store.get("tse-lang");
  setLanguage(params.get("lang") || saved || "ja");
  if (!saved && !params.get("lang")) {
    try { localStorage.removeItem("tse-lang"); } catch (e) { /* storage blocked: fine */ }   // not chosen yet
    askLanguage();
  }

  function askLanguage() {
    const LANGS = [
      ["ja", "日本語", "Japanese"], ["en", "English", "English"],
      ["ko", "한국어", "Korean"], ["zh", "中文", "Chinese"],
      ["es", "Español", "Spanish"], ["de", "Deutsch", "German"],
      ["pl", "Polski", "Polish"], ["pcm", "Naijá", "Nigerian Pidgin"],
      ["ar", "العربية", "Arabic"], ["fa", "فارسی", "Farsi"]
    ];
    const logo = $(".brand-logo");
    const dlg = document.createElement("dialog");
    dlg.className = "lang-dialog";
    dlg.setAttribute("aria-labelledby", "lang-dialog-title");
    dlg.innerHTML = `
      <div class="ld-top">
        <img class="ld-logo" src="${logo ? logo.getAttribute("src") : "brand/tenshi-mark.svg"}" alt="" width="240" height="240">
        <p class="ld-brand">Tenshi Systems Engineering<span lang="ja">天使システムズエンジニアリング</span></p>
        <button type="button" class="ld-close" aria-label="閉じる / Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
      </div>
      <div class="ld-body">
        <h2 id="lang-dialog-title" class="ld-title">
          <span lang="ja">言語を選択してください</span>
          <span lang="en">Choose your language</span>
          <span lang="ko">언어를 선택하세요</span>
          <span lang="de">Sprache wählen</span>
        </h2>
        <ul class="ld-options">
          ${LANGS.map(([code, native, english]) => `<li><button type="button" class="ld-option" data-pick="${code}" lang="${code}"${code === "ar" || code === "fa" ? " dir=\"rtl\"" : ""}>
            <svg class="ld-flag" viewBox="0 0 30 20" aria-hidden="true"><use href="#flag-${code}"/></svg>
            <span class="ld-native">${native}</span>
            ${native !== english ? `<span class="ld-english" lang="en">${english}</span>` : ""}
          </button></li>`).join("")}
        </ul>
        <p class="ld-note"><span lang="ja">あとから画面上部の国旗ボタンでいつでも変更できます。</span> <span lang="en">You can change it any time with the flag button at the top.</span></p>
      </div>`;
    document.body.appendChild(dlg);
    const finish = (code) => {
      setLanguage(code);   // also saves the choice, so the pop-up won't come back
      dlg.classList.add("is-closing");
      setTimeout(() => { if (dlg.open) dlg.close(); dlg.remove(); }, reduceMotion.matches ? 0 : 200);
    };
    $$(".ld-option", dlg).forEach((b) => b.addEventListener("click", () => finish(b.dataset.pick)));
    $(".ld-close", dlg).addEventListener("click", () => finish(lang));
    dlg.addEventListener("cancel", (e) => { e.preventDefault(); finish(lang); });   // Escape keeps Japanese
    dlg.addEventListener("click", (e) => { if (e.target === dlg) finish(lang); });  // a click outside the card
    // Wait a moment so the page shows behind the pop-up.
    setTimeout(() => {
      if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
      const first = $(".ld-option", dlg);
      if (first) first.focus();
    }, 500);
  }
  setupBand();
  startSlides();
  startCards();
  setupNewsTabs();
  setupTicker();
  setupParallax();
  setupParallaxFx();


  /* ---------- Homepage parallax bands and interior page headers (.px-hero): shift the inner image layer as the band crosses the viewport.
     Disabled when the visitor prefers reduced motion. Avoids background-attachment: fixed (broken on iOS). ---------- */
  function setupParallax() {
    const bands = $$("[data-parallax]");
    if (!bands.length) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const layers = bands.map((band) => ({
      band,
      layer: $(".parallax-layer", band),
      speed: Number(band.dataset.speed)
    })).filter((x) => x.layer && Number.isFinite(x.speed));
    if (!layers.length) return;

    let ticking = false;
    const update = () => {
      ticking = false;
      if (reduce.matches) {
        layers.forEach(({ layer }) => { layer.style.transform = "translate3d(0,0,0)"; });
        return;
      }
      const vh = window.innerHeight || document.documentElement.clientHeight;
      layers.forEach(({ band, layer, speed }) => {
        const rect = band.getBoundingClientRect();
        if (rect.bottom < -80 || rect.top > vh + 80) return;
        const y = -((rect.top + rect.height / 2) - vh / 2) * speed;
        layer.style.transform = "translate3d(0," + y.toFixed(1) + "px,0)";
      });
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    if (reduce.addEventListener) reduce.addEventListener("change", onScroll);
    else if (reduce.addListener) reduce.addListener(onScroll);
    update();
  }

  /* ---------- Homepage parallax band effects (Tenshi Editor › Parallax › Effects; settings arrive as data-fx-* attributes
     and --pxl-* / --pxg-* custom properties written by tools/build-pages.mjs):
     letters  - the band heading arrives letter by letter (word by word in Arabic and Farsi, whose letters join)
     gray     - the photo starts black and white and turns to color on entering view, or in step with scrolling
     rain     - rain drawn on a canvas inside the band, behind the words; it only runs while the band is on screen
     Visitors who prefer reduced motion get the finished state: plain heading, full color, no rain. ---------- */
  function setupParallaxFx() {
    const bands = $$("[data-parallax]").filter((b) => b.dataset.fxLetters || b.dataset.fxGray || b.dataset.fxRain || b.dataset.fxFireflies);
    if (!bands.length) return;
    const still = () => reduceMotion.matches;
    const CJK = /[\u3000-\u9fff\uac00-\ud7af\uff00-\uffef]/;

    // Letters: split the heading into spans; a word's letters stay together so lines still wrap between words.
    const split = (h) => {
      const label = h.textContent.replace(/\s+/g, " ").trim();
      const byWord = /^(ar|fa)\b/.test(document.documentElement.lang || "");
      const frag = document.createDocumentFragment();
      let i = 0;
      const add = (parent, text) => {
        const c = document.createElement("span");
        c.className = "pxl-c"; c.textContent = text; c.style.setProperty("--i", Math.min(i++, 80));
        c.setAttribute("aria-hidden", "true"); parent.appendChild(c);
      };
      label.split(/(\s+)/).forEach((tok) => {
        if (!tok) return;
        if (/^\s+$/.test(tok)) { frag.appendChild(document.createTextNode(" ")); return; }
        if (byWord) { add(frag, tok); return; }
        if (CJK.test(tok)) { Array.from(tok).forEach((ch) => add(frag, ch)); return; }
        const w = document.createElement("span");
        w.className = "pxl-w"; w.setAttribute("aria-hidden", "true");
        Array.from(tok).forEach((ch) => add(w, ch));
        frag.appendChild(w);
      });
      h.textContent = "";
      h.appendChild(frag);
      if (label) h.setAttribute("aria-label", label);
      h.classList.add("pxl-split");
    };

    const enterIO = "IntersectionObserver" in window ? new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        enterIO.unobserve(e.target);
        e.target.classList.add("pxfx-in");
      });
    }, { rootMargin: "0px 0px -12% 0px", threshold: 0.15 }) : null;

    const scrollGray = [];
    bands.forEach((band) => {
      band.classList.add("pxfx-on");
      const title = $(".parallax-title, [data-px-title]", band);   // band heading, or the H1 of an interior page header
      if (band.dataset.fxLetters && title) {
        split(title);
        document.addEventListener("tse:lang", () => split(title));   // the language switcher rewrites the heading text
      }
      if (band.dataset.fxGray === "scroll") scrollGray.push(band);
      if (band.dataset.fxRain) startBandRain(band);
      if (band.dataset.fxFireflies) startFireflies(band);
      if (enterIO && !still()) enterIO.observe(band); else band.classList.add("pxfx-in");
    });

    // Gray tied to scrolling: full gray as the band's top meets the bottom of the screen, full color once its middle
    // reaches the middle of the screen.
    if (scrollGray.length) {
      let ticking = false;
      const update = () => {
        ticking = false;
        const vh = window.innerHeight || document.documentElement.clientHeight;
        scrollGray.forEach((band) => {
          const r = band.getBoundingClientRect();
          if (r.bottom < -80 || r.top > vh + 80) return;
          const start = vh, end = vh / 2 - r.height / 2;
          const p = still() ? 1 : Math.min(1, Math.max(0, (start - r.top) / Math.max(1, start - end)));
          band.style.setProperty("--pxg-p", p.toFixed(3));
        });
      };
      const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onScroll, { passive: true });
      update();
    }
  }

  // Rain inside one band. "streaks" draws slanted lines; "glyphs" is the falling-characters look of rain.js (in the
  // band's own colour, on a see-through canvas so the photo shows through).
  // Fireflies inside one band: glowing dots that wander and pulse. The motion is plain CSS (styles.css, .pxff);
  // this only places the dots with random paths and timings, and pauses them while the band is off screen.
  // Settings: data-ff-count / -size / -size-var / -speed attributes, --ff-color / --ff-glow / --ff-pulse / --ff-op.
  function startFireflies(band) {
    const box = $(".parallax-fireflies", band);
    if (!box || reduceMotion.matches) return;
    const ds = band.dataset;
    const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
    const count = Math.max(1, Math.min(120, Math.round(num(ds.ffCount, 30))));
    const size = num(ds.ffSize, 4), sizeVar = Math.max(0, Math.min(1, num(ds.ffSizeVar, 0.5))), speed = Math.max(0.1, num(ds.ffSpeed, 1));
    const lower = ds.fxFireflies === "lower";
    const r = (a, b) => a + Math.random() * (b - a);
    const amp = () => (Math.random() < 0.5 ? -1 : 1) * r(18, 90);
    const frag = document.createDocumentFragment();
    for (let i = 0; i < count; i++) {
      const f = document.createElement("span");
      f.className = "pxff";
      const d = r(14, 30) / speed, s = size * (1 - sizeVar * Math.random());
      f.style.cssText = `left:${r(2, 98).toFixed(2)}%;top:${(lower ? r(52, 96) : r(4, 96)).toFixed(2)}%;` +
        `--x1:${amp().toFixed(0)}px;--y1:${amp().toFixed(0)}px;--x2:${amp().toFixed(0)}px;--y2:${amp().toFixed(0)}px;--x3:${amp().toFixed(0)}px;--y3:${amp().toFixed(0)}px;` +
        `--ffs:${Math.max(1, s).toFixed(2)}px;--ffd:${d.toFixed(2)}s;--ffdl:${(-r(0, d)).toFixed(2)}s;--ffp:${r(0.7, 1.4).toFixed(2)};--ffpl:${(-r(0, 6)).toFixed(2)}s`;
      f.appendChild(document.createElement("i"));
      frag.appendChild(f);
    }
    box.appendChild(frag);
    box.classList.add("is-paused");
    if ("IntersectionObserver" in window) new IntersectionObserver((e) => { box.classList.toggle("is-paused", !e[0].isIntersecting); }, { rootMargin: "80px" }).observe(band);
    else box.classList.remove("is-paused");
  }

  function startBandRain(band) {
    const canvas = $(".parallax-rain", band);
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext("2d");
    const ds = band.dataset;
    const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
    const style = ds.fxRain === "glyphs" ? "glyphs" : "streaks";
    const density = num(ds.rainDensity, 18), speed = num(ds.rainSpeed, 1), angle = num(ds.rainAngle, 10) * Math.PI / 180;
    const color = /^#[0-9a-f]{3,6}$/i.test(ds.rainColor || "") ? ds.rainColor : "#d6dde8";
    canvas.style.opacity = String(num(ds.rainOpacity, 0.45));
    const GLYPHS = Array.from("アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン天使技術設計開発未来信頼大阪日本0123456789");
    let w = 0, h = 0, dpr = 1, drops = [], cols = [], size = 18;
    let running = false, visible = false, raf = 0, last = 0;
    const tan = Math.tan(angle);
    const newDrop = (top) => {
      const z = 0.45 + Math.random() * 0.55;   // nearer drops are longer, faster and brighter
      return { x: Math.random() * (w + Math.abs(tan) * h) - (tan > 0 ? tan * h : 0), y: top ? Math.random() * h : -Math.random() * h * 0.3 - 20,
        len: (12 + Math.random() * 16) * z, v: (650 + Math.random() * 350) * z * speed, a: 0.35 + z * 0.65, wdt: z > 0.8 ? 1.4 : 1 };
    };
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = band.clientWidth; h = band.clientHeight;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (style === "streaks") {
        const n = Math.min(1200, Math.round(w / 100 * density * (h / 400)));
        drops = Array.from({ length: n }, (_, i) => drops[i] || newDrop(true));
      } else {
        size = w < 600 ? 15 : 18;
        const n = Math.ceil(w / size), share = Math.min(1, density / 30);
        cols = Array.from({ length: n }, (_, i) => cols[i] || { on: Math.random() < share, y: Math.random() * -h / size, v: 0.45 + Math.random() * 0.75 });
      }
    };
    const pick = () => GLYPHS[(Math.random() * GLYPHS.length) | 0];
    const frame = (dt) => {
      if (style === "streaks") {
        ctx.clearRect(0, 0, w, h);
        ctx.strokeStyle = color; ctx.lineCap = "round";
        drops.forEach((d, i) => {
          const dy = d.v * dt;
          d.y += dy; d.x += dy * tan;
          if (d.y - d.len > h) { drops[i] = newDrop(false); return; }
          ctx.globalAlpha = d.a; ctx.lineWidth = d.wdt;
          ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - d.len * tan, d.y - d.len); ctx.stroke();
        });
        ctx.globalAlpha = 1;
      } else {
        // Fade what is already drawn so older characters leave a trail, then draw the new heads.
        ctx.globalCompositeOperation = "destination-out";
        ctx.fillStyle = "rgba(0,0,0,0.16)"; ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = "source-over";
        ctx.font = `700 ${size}px "Hiragino Sans", "Yu Gothic UI", "Yu Gothic", Meiryo, "Noto Sans JP", sans-serif`;
        ctx.textAlign = "center"; ctx.fillStyle = color;
        const step = dt * 22 * speed;
        cols.forEach((c, i) => {
          if (!c.on) return;
          const y = c.y * size;
          if (y > 0) { ctx.globalAlpha = 0.5; ctx.fillText(pick(), i * size + size / 2, y - size); ctx.globalAlpha = 1; ctx.fillText(pick(), i * size + size / 2, y); }
          c.y += c.v * step;
          if (y > h + size * 4 && Math.random() > 0.975) { c.y = Math.random() * -20; c.v = 0.45 + Math.random() * 0.75; }
        });
        ctx.globalAlpha = 1;
      }
    };
    const loop = (t) => {
      if (!running) return;
      raf = requestAnimationFrame(loop);
      const dt = last ? Math.min(0.05, (t - last) / 1000) : 0.016;
      if (style === "glyphs" && last && t - last < 1000 / 30) return;
      last = t;
      frame(dt);
    };
    const update = () => {
      const should = visible && !document.hidden && !reduceMotion.matches;
      if (should && !running) { running = true; last = 0; raf = requestAnimationFrame(loop); }
      if (!should && running) { running = false; cancelAnimationFrame(raf); }
      if (reduceMotion.matches) ctx.clearRect(0, 0, w, h);
    };
    resize();
    if ("ResizeObserver" in window) new ResizeObserver(resize).observe(band); else window.addEventListener("resize", resize);
    if ("IntersectionObserver" in window) new IntersectionObserver((e) => { visible = e[0].isIntersecting; update(); }, { rootMargin: "100px" }).observe(band);
    else { visible = true; update(); }
    document.addEventListener("visibilitychange", update);
    if (reduceMotion.addEventListener) reduceMotion.addEventListener("change", update);
  }

  /* ---------- News page: one tab per category (Technology, Business, Stock Exchange, Weather, Sports, Health) ---------- */
  function setupNewsTabs() {
    const list = $(".news-tabs");
    if (!list) return;
    const tabs = $$("[role=tab]", list);
    const show = (tab, focus) => {
      tabs.forEach((t) => {
        const on = t === tab;
        t.setAttribute("aria-selected", String(on));
        t.tabIndex = on ? 0 : -1;
        const panel = document.getElementById(t.getAttribute("aria-controls"));
        if (panel) panel.hidden = !on;
      });
      if (focus) tab.focus();
      if (history.replaceState) history.replaceState(null, "", "#" + tab.dataset.cat);
    };
    tabs.forEach((t, i) => {
      t.addEventListener("click", () => show(t));
      t.addEventListener("keydown", (e) => {
        const step = { ArrowRight: 1, ArrowLeft: -1, Home: -i, End: tabs.length - 1 - i }[e.key];
        if (step === undefined) return;
        e.preventDefault();
        show(tabs[(i + step + tabs.length) % tabs.length], true);
      });
    });
    const fromHash = tabs.find((t) => "#" + t.dataset.cat === location.hash);
    if (fromHash) { show(fromHash); const s = document.getElementById("stories"); if (s) s.scrollIntoView(); }
  }

  /* ---------- Stock ticker: delayed Japan market prices from data/ticker.json (refreshed by a GitHub job) ---------- */
  function setupTicker() {
    const box = $("[data-ticker]");
    if (!box) return;
    const url = new URL("data/ticker.json", SCRIPT_BASE).href;
    const fmt = (n, d) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
    const load = () => fetch(url, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).then((data) => {
      if (!data || !data.quotes || !data.quotes.length) return;
      const items = data.quotes.map((q) => {
        const up = q.change > 0, down = q.change < 0;
        const cls = up ? "up" : down ? "down" : "flat";
        const sign = up ? "▲" : down ? "▼" : "";
        const change = q.change == null ? "" : `<span class="tk-chg ${cls}">${sign} ${fmt(Math.abs(q.change), 2)} (${q.pct > 0 ? "+" : ""}${fmt(q.pct, 2)}%)</span>`;
        const label = q.code ? `${q.name} <span class="tk-code">${q.code}</span>` : q.name;
        return `<li class="tk-item"><span class="tk-name">${label}</span> <span class="tk-price">${q.kind === "fx" ? fmt(q.price, 2) : (q.kind === "index" ? "" : "¥") + fmt(q.price, q.price < 1000 ? 1 : 0)}</span> ${change}</li>`;
      }).join("");
      const track = $(".ticker-track", box);
      // Two copies side by side make the loop seamless; the copy is hidden from screen readers.
      track.innerHTML = items + items.replace(/<li /g, '<li aria-hidden="true" ');
      const latest = data.quotes.map((q) => q.time).filter(Boolean).sort().pop() || data.updatedAt;
      const when = new Date(latest);
      $(".ticker-time", box).textContent = isNaN(when) ? "" : when.toLocaleString(document.documentElement.lang || "en", { timeZone: "Asia/Tokyo", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) + " JST";
      box.hidden = false;
      track.style.setProperty("--tk-duration", Math.max(30, data.quotes.length * 4.5) + "s");
    }).catch(() => {});
    load();
    setInterval(load, 10 * 60 * 1000);   // pick up new prices without a reload
  }
})();
