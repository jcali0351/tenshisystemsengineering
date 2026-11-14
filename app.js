// The address the consultation form writes to. Change it here if the company email changes.
const CONTACT_EMAIL = "jcali0351@gmail.com";

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
  const onLanguage = [];   // parts that need to redo their text when the language changes

  let lang = "en";
  const t = (key) => (T[lang] && T[lang][key] !== undefined ? T[lang][key] : T.en[key]);

  /* ---------- Language switch ---------- */
  function setLanguage(next) {
    lang = T[next] ? next : "en";
    document.documentElement.lang = lang;
    // Service pages name themselves (data-title-key); the homepage uses pageTitle.
    const titleKey = document.body.dataset.titleKey;
    document.title = titleKey ? `${t(titleKey)} | ${t("brandName")}` : t("pageTitle");
    const meta = $('meta[name="description"]');
    if (meta) meta.setAttribute("content", t(document.body.dataset.descKey || "metaDescription"));

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
      $(".lang-code", current).textContent = lang.toUpperCase();
    }
    onLanguage.forEach((fn) => fn());
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

  /* ---------- Red band: the slogan, then the taglines, written in word by word ---------- */
  const band = $(".band");
  let setupBand = () => {};
  if (band) {
    const BAND_LINES = ["motto", "tag1", "tag2", "tag3", "tag4"];
    const BAND_HOLD = 5200;   // how long each line stays, in milliseconds
    const stage = $(".band-stage");
    const bandLine = $(".band-line");
    const sheen = $(".band-sheen");
    let bandIndex = 0, bandTimer = null, bandHeld = false, bandReady = false;

    const restart = (el) => { el.classList.remove("is-on"); void el.offsetWidth; el.classList.add("is-on"); };

    const showBandLine = (i) => {
      bandIndex = i % BAND_LINES.length;
      const text = t(BAND_LINES[bandIndex]);
      // English goes in word by word. Japanese has no spaces, so the browser finds the words (whole words never break
      // across lines); browsers without that go character by character.
      const units = lang !== "ja" ? text.split(" ")
        : window.Intl && Intl.Segmenter ? Array.from(new Intl.Segmenter("ja", { granularity: "word" }).segment(text), (s) => s.segment)
        : Array.from(text);
      stage.style.setProperty("--step", lang === "ja" ? "40ms" : "90ms");
      stage.classList.remove("is-out");
      stage.classList.toggle("is-tag", bandIndex > 0);
      stage.replaceChildren(...units.map((u, k) => {
        const s = document.createElement("span");
        s.className = "band-unit";
        s.style.setProperty("--i", k);
        s.textContent = u;
        return s;
      }));
      restart(bandLine);
      restart(sheen);
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
  const carousel = $(".svc-carousel");
  let startCards = () => {};
  if (carousel) {
    const sets = $$(".svc-set", carousel);
    const dots = $$(".svc-dot", carousel);
    const prev = $(".svc-prev", carousel);
    const next = $(".svc-next", carousel);
    const pause = $(".svc-pause", carousel);
    const HOLD = 8000;   // how long each set of three stays, in milliseconds
    let current = 0, timer = null, held = false, userPaused = reduceMotion.matches;

    carousel.classList.add("svc-js");
    $(".svc-controls", carousel).hidden = false;

    const label = () => {
      sets.forEach((s, n) => s.setAttribute("aria-label", t("svcGroup").replace("{n}", n + 1)));
      dots.forEach((d, n) => { $(".sr-only", d).textContent = t("svcGroup").replace("{n}", n + 1); });
      $(".sr-only", pause).textContent = t(userPaused ? "svcPlay" : "svcPause");
      pause.setAttribute("aria-pressed", String(userPaused));
      pause.classList.toggle("is-paused", userPaused);
    };

    const go = (to, back = false) => {
      const target = (to + sets.length) % sets.length;
      if (target === current) return;
      const leaving = sets[current];
      carousel.classList.toggle("is-back", back);
      leaving.classList.remove("is-active");
      leaving.classList.add("is-leaving");
      leaving.inert = true;
      setTimeout(() => leaving.classList.remove("is-leaving"), reduceMotion.matches ? 0 : 600);
      sets[target].classList.add("is-active");
      sets[target].inert = false;
      dots.forEach((d, n) => (n === target ? d.setAttribute("aria-current", "true") : d.removeAttribute("aria-current")));
      current = target;
    };

    startCards = () => {
      clearInterval(timer);
      timer = null;
      if (userPaused || held || document.hidden) return;
      timer = setInterval(() => go(current + 1), HOLD);
    };

    sets.forEach((s, n) => { s.inert = n !== 0; });
    prev.addEventListener("click", () => { go(current - 1, true); startCards(); });
    next.addEventListener("click", () => { go(current + 1); startCards(); });
    dots.forEach((d, n) => d.addEventListener("click", () => { go(n, n < current); startCards(); }));
    pause.addEventListener("click", () => { userPaused = !userPaused; label(); startCards(); });
    // Hold still while someone is reading or using the cards.
    carousel.addEventListener("mouseenter", () => { held = true; startCards(); });
    carousel.addEventListener("mouseleave", () => { held = false; startCards(); });
    carousel.addEventListener("focusin", () => { held = true; startCards(); });
    carousel.addEventListener("focusout", (e) => { if (!carousel.contains(e.relatedTarget)) { held = false; startCards(); } });
    document.addEventListener("visibilitychange", startCards);
    onLanguage.push(label);
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
  // First visit: use the browser's language if the site has it (Japanese, Korean, German), otherwise English.
  const browserLang = (navigator.language || "").toLowerCase().slice(0, 2);
  setLanguage(params.get("lang") || store.get("tse-lang") || (T[browserLang] ? browserLang : "en"));
  setupBand();
  startSlides();
  startCards();
})();
