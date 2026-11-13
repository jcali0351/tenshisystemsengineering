// The address the consultation form writes to. Change it here if the company email changes.
const CONTACT_EMAIL = "jcali0351@gmail.com";

(function () {
  "use strict";
  const T = window.TRANSLATIONS;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked: fine */ } }
  };

  let lang = "en";
  const t = (key) => (T[lang] && T[lang][key] !== undefined ? T[lang][key] : T.en[key]);

  /* ---------- Language switch ---------- */
  function setLanguage(next) {
    lang = T[next] ? next : "en";
    document.documentElement.lang = lang;
    document.title = t("pageTitle");
    const meta = $('meta[name="description"]');
    if (meta) meta.setAttribute("content", t("metaDescription"));

    $$("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
    $$("[data-i18n-attr]").forEach((el) => {
      el.dataset.i18nAttr.split(";").forEach((pair) => {
        const [attr, key] = pair.split(":");
        el.setAttribute(attr, t(key));
      });
    });
    $$(".lang-switch [data-lang]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === lang)));

    updateCaption();
    updatePauseLabel();
    // Re-show any visible error messages in the new language.
    $$(".field.has-error").forEach((f) => validateField($("input, textarea", f)));
    store.set("tse-lang", lang);
  }

  $$(".lang-switch [data-lang]").forEach((b) => b.addEventListener("click", () => setLanguage(b.dataset.lang)));

  /* ---------- Skyline slideshow ---------- */
  const slides = $$(".hero-slides .slide");
  const dots = $$(".slide-dots .dot");
  const pauseBtn = $(".slide-pause");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const INTERVAL = 7000;
  let current = 0;
  let timer = null;
  let userPaused = reduceMotion.matches;

  function load(slide) {
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
  }

  function updateCaption() {
    const city = $("#slide-city");
    if (city) city.textContent = t("city" + current);
  }

  function updatePauseLabel() {
    if (!pauseBtn) return;
    pauseBtn.setAttribute("aria-pressed", String(userPaused));
    pauseBtn.classList.toggle("is-paused", userPaused);
    const label = $(".sr-only", pauseBtn);
    label.textContent = t(userPaused ? "play" : "pause");
  }

  function show(i) {
    const next = (i + slides.length) % slides.length;
    load(slides[next]).then(() => {
      slides.forEach((s, k) => s.classList.toggle("is-active", k === next));
      dots.forEach((d, k) => (k === next ? d.setAttribute("aria-current", "true") : d.removeAttribute("aria-current")));
      current = next;
      updateCaption();
      load(slides[(next + 1) % slides.length]); // get the next one ready
    });
  }

  function stop() { clearInterval(timer); timer = null; }
  function start() {
    stop();
    if (userPaused || document.hidden) return;
    timer = setInterval(() => show(current + 1), INTERVAL);
  }

  dots.forEach((d) => d.addEventListener("click", () => { show(+d.dataset.slide); start(); }));
  pauseBtn.addEventListener("click", () => { userPaused = !userPaused; updatePauseLabel(); start(); });
  document.addEventListener("visibilitychange", start);

  load(slides[0]).then(() => load(slides[1]));
  document.documentElement.classList.toggle("motion-still", reduceMotion.matches);

  /* ---------- Consultation form ---------- */
  const form = $(".contact-form");
  const status = $(".form-status");
  const emailLink = $(".contact-email");
  emailLink.href = "mailto:" + CONTACT_EMAIL;
  emailLink.textContent = CONTACT_EMAIL;

  const rules = {
    name: (v) => v.trim() !== "" || "errName",
    email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) || "errEmail",
    message: (v) => v.trim().length >= 5 || "errMessage"
  };

  function validateField(input) {
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
  }

  $$("input, textarea", form).forEach((el) => {
    el.addEventListener("blur", () => { if (el.value) validateField(el); });
    el.addEventListener("input", () => { if (el.closest(".field").classList.contains("has-error")) validateField(el); });
  });

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
    const topic = t(data.topic);
    const lines = [
      `${t("mailName")}: ${data.name}`,
      data.company ? `${t("mailCompany")}: ${data.company}` : "",
      `${t("mailEmail")}: ${data.email}`,
      data.phone ? `${t("mailPhone")}: ${data.phone}` : "",
      `${t("mailTopic")}: ${topic}`,
      "",
      data.message
    ].filter((l, i) => l !== "" || i === 5);
    const url = "mailto:" + CONTACT_EMAIL +
      "?subject=" + encodeURIComponent(t("mailSubject").replace("{topic}", topic)) +
      "&body=" + encodeURIComponent(lines.join("\n"));
    status.textContent = t("sent").replace("{email}", CONTACT_EMAIL);
    status.className = "form-status field-wide is-ok";
    window.location.href = url;
  });

  // The consultation button: move focus to the form section for keyboard and screen reader users.
  $$('a[href="#contact"]').forEach((a) => a.addEventListener("click", () => {
    setTimeout(() => $("#contact").focus({ preventScroll: true }), 400);
  }));

  /* ---------- Start ---------- */
  $("#year").textContent = new Date().getFullYear();
  const params = new URLSearchParams(location.search);
  const browserJa = (navigator.language || "").toLowerCase().startsWith("ja");
  setLanguage(params.get("lang") || store.get("tse-lang") || (browserJa ? "ja" : "en"));
  start();
})();
