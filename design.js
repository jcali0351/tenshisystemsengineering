/* 墨と朱 · Ink and vermilion: the motion and ornaments of the Tenshi design layer.
   Kanji section numbers, a scroll-progress line, a header that settles as you scroll,
   quiet reveals, the hero's vertical tagline, ensō and scroll cue, and a hanko seal on
   page banners. Purely decorative: everything it adds is hidden from screen readers. */
(function () {
  "use strict";
  var doc = document.documentElement;
  var still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Kanji numbers on each visible section title: 一 二 三 … */
  var KAN = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
  var kan = function (n) { return n <= 10 ? KAN[n - 1] : "十" + KAN[n - 11]; };
  Array.prototype.forEach.call(document.querySelectorAll("main h2.section-title:not(.sr-only)"), function (h, i) {
    h.setAttribute("data-kan", kan(i + 1));
  });

  /* Scroll-progress line and a header that settles once you scroll */
  var line = document.createElement("div");
  line.className = "scroll-line"; line.setAttribute("aria-hidden", "true");
  document.body.appendChild(line);
  var header = document.querySelector(".site-header");
  var ticking = false;
  var onScroll = function () {
    if (ticking) return; ticking = true;
    requestAnimationFrame(function () {
      var max = doc.scrollHeight - window.innerHeight;
      line.style.setProperty("--p", max > 0 ? Math.min(1, window.scrollY / max).toFixed(4) : 0);
      if (header) header.classList.toggle("is-scrolled", window.scrollY > 12);
      ticking = false;
    });
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  onScroll();

  /* Homepage hero: vertical tagline with a hanko seal, a scroll cue and an ensō around the logo */
  var hero = document.querySelector(".hero");
  if (hero) {
    var tate = document.createElement("div");
    tate.className = "hero-tate"; tate.setAttribute("aria-hidden", "true"); tate.lang = "ja";
    tate.innerHTML = "<b>信頼の技術を、未来へ。</b><span class=\"hero-seal\">天使</span>";
    hero.appendChild(tate);
    var cue = document.createElement("div");
    cue.className = "hero-scroll"; cue.setAttribute("aria-hidden", "true");
    cue.innerHTML = "SCROLL<i></i>";
    hero.appendChild(cue);
    var dazzle = hero.querySelector(".logo-dazzle--hero");
    if (dazzle) {
      dazzle.insertAdjacentHTML("afterbegin",
        '<svg class="enso" viewBox="0 0 200 200" aria-hidden="true"><path d="M150 46C128 26 92 22 64 38 34 56 24 96 38 128c14 32 52 50 86 42 34-8 56-40 52-74-2-18-10-34-22-46"/></svg>');
    }
  }

  /* Page banners: a hanko seal beside the title */
  var bannerTitle = document.querySelector(".svc-hero h1");
  if (bannerTitle && !bannerTitle.parentNode.querySelector(".page-seal")) {
    var seal = document.createElement("span");
    seal.className = "page-seal"; seal.setAttribute("aria-hidden", "true"); seal.lang = "ja";
    seal.innerHTML = "天<br>使";
    bannerTitle.insertAdjacentElement("afterend", seal);   // beside the title, not inside it: the language switcher rewrites the title text
  }

  /* Quiet reveals: blocks rise softly into place as they scroll into view */
  if (still || !("IntersectionObserver" in window)) return;
  var SEL = [
    "main .section-title:not(.sr-only)", "main .section-intro", "main .page-lead",
    ".offer-card", ".benefit-card", ".svc-tech", ".tech-card", ".value-card", ".ab-step", ".ab-std-card", ".ab-focus",
    ".ab-mv-card", ".svc-detail", ".prj-card", ".prj-ed", ".svc-step", ".contact-pitch", ".minimap", ".page-photo",
    ".svc-figure", ".faq details", ".svc-grid .service-card", ".prj-shot-fig", ".svc-other", ".team-card", ".name-card", ".pat-card", ".pat-search"
  ].join(",");
  var items = Array.prototype.filter.call(document.querySelectorAll(SEL), function (el) {
    return !el.closest(".hero, .site-header, .site-footer, .svc-set, .contact-form");
  });
  doc.classList.add("rv-on");
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      e.target.classList.add("rv-in");
      io.unobserve(e.target);
    });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
  items.forEach(function (el) {
    var sibs = el.parentElement ? Array.prototype.indexOf.call(el.parentElement.children, el) : 0;
    el.classList.add("rv");
    el.style.setProperty("--rv-d", Math.min(sibs, 6) * 0.08 + "s");
    io.observe(el);
  });
  // Never leave anything hidden: reveal whatever is still waiting after a few seconds of being on screen or on print.
  window.addEventListener("beforeprint", function () { items.forEach(function (el) { el.classList.add("rv-in"); }); });
})();
