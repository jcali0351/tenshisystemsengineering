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

  /* ---------- Red band: the slogan, then the taglines, written in word by word ---------- */
  const band = $(".band");
  let setupBand = () => {};
  if (band) {
    const BAND_LINES = ["motto", "tag1", "tag2", "tag3", "tag4"];
    const BAND_HOLD = 7000;   // how long each line stays (Japanese first, then the visitor's language), in milliseconds
    const stage = $(".band-stage");
    const bandLine = $(".band-line");
    const sheen = $(".band-sheen");
    let bandIndex = 0, bandTimer = null, bandHeld = false, bandReady = false;

    const restart = (el) => { el.classList.remove("is-on"); void el.offsetWidth; el.classList.add("is-on"); };

    // Writes one line into the band in the given language.
    // English, Korean and German go in word by word. Japanese has no spaces, so the browser finds the words (whole
    // words never break across lines); browsers without that go character by character.
    const writeLine = (text, inLang) => {
      const units = inLang !== "ja" ? text.split(" ")
        : window.Intl && Intl.Segmenter ? Array.from(new Intl.Segmenter("ja", { granularity: "word" }).segment(text), (s) => s.segment)
        : Array.from(text);
      stage.setAttribute("lang", inLang);
      stage.style.setProperty("--step", inLang === "ja" ? "40ms" : "90ms");
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
    const JA_HOLD = 1900;   // how long the Japanese stays before switching, in milliseconds
    let switchTimer = null;
    const showBandLine = (i) => {
      clearTimeout(switchTimer);
      bandIndex = i % BAND_LINES.length;
      const key = BAND_LINES[bandIndex];
      stage.classList.toggle("is-tag", bandIndex > 0);
      writeLine(T.ja[key], "ja");
      restart(bandLine);
      restart(sheen);
      if (lang === "ja") return;
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
      ["ko", "한국어", "Korean"], ["de", "Deutsch", "German"]
    ];
    const logo = $(".brand-logo");
    const dlg = document.createElement("dialog");
    dlg.className = "lang-dialog";
    dlg.setAttribute("aria-labelledby", "lang-dialog-title");
    dlg.innerHTML = `
      <div class="ld-top">
        <img class="ld-logo" src="${logo ? logo.getAttribute("src") : "logo.png"}" alt="" width="228" height="205">
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
          ${LANGS.map(([code, native, english]) => `<li><button type="button" class="ld-option" data-pick="${code}" lang="${code}">
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
})();
