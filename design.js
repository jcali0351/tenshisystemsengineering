/* 墨と朱 · Ink and vermilion: the motion and ornaments of the Tenshi design layer.
   Kanji section numbers, a scroll-progress line, a header that settles as you scroll,
   quiet reveals and a hanko seal on page banners. Purely decorative: everything it adds is hidden from screen readers. */
(function () {
  "use strict";
  var doc = document.documentElement;
  // No black-and-white opening inside the Tenshi Editor's Pages preview (the Design preview, ?motion=1, keeps it)
  if (window.frameElement && !/[?&]motion=1/.test(location.search)) doc.classList.add("no-intro");
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

  /* Page banners: a hanko seal beside the title */
  var bannerTitle = document.querySelector(".svc-hero h1");
  if (bannerTitle && !bannerTitle.parentNode.querySelector(".page-seal")) {
    var seal = document.createElement("span");
    seal.className = "page-seal"; seal.setAttribute("aria-hidden", "true"); seal.lang = "ja";
    seal.innerHTML = "天<br>使";
    bannerTitle.insertAdjacentElement("afterend", seal);   // beside the title, not inside it: the language switcher rewrites the title text
  }

  /* ---------- Motion: everything arrives as it scrolls into view ----------
     Headings appear character by character (word by word in Arabic and Farsi, whose letters join), text slides in
     from alternating sides, pictures fade and rise, cards rise one after another. Only opacity and transform move,
     with shorter distances on phones. Nothing moves for visitors who ask for reduced motion, and nothing moves inside
     the Tenshi Editor's preview. */
  if (still || !("IntersectionObserver" in window) || (window.frameElement && !/[?&]motion=1/.test(location.search))) return;
  // Settings from site-theme.css (Tenshi Editor › Design): on/off for each kind of motion and the character pace
  // In the Tenshi Editor's Design preview, use the unsaved settings
  try {
    if (window.frameElement && window.parent.__tseLiveCss) {
      var live = document.createElement("style"); live.id = "tse-live-theme"; live.textContent = window.parent.__tseLiveCss;
      document.head.appendChild(live);
    }
  } catch (e) { /* not the editor */ }
  var css = getComputedStyle(doc);
  var on = function (name) { return css.getPropertyValue(name).trim() !== "0"; };
  if (!on("--anim")) return;
  var CS_BASE = parseFloat(css.getPropertyValue("--cs-base")) || 26;

  var CARDS = [".service-card", ".offer-card", ".benefit-card", ".svc-tech", ".tech-card", ".value-card", ".ab-step", ".ab-std-card",
    ".ab-focus", ".ab-mv-card", ".svc-detail", ".prj-card", ".prj-ed", ".svc-step", ".contact-pitch", ".svc-for", ".team-card", ".name-card",
    ".pat-card", ".pat-search", ".news-item", ".blog-card", ".portal-card", ".fw", ".contact-form", ".minimap", ".faq details", ".svc-other", ".prj-shot-fig", ".tk-item-card"].join(",");
  var HEADS = "h1, h2";
  var PICS = "figure, picture, .logo-dazzle--hero, img, svg.page-art";   // the hero logo is revealed with its wrapper, so its glow comes in with it
  var TEXT = "p, li, blockquote, h3, h4, h5, dl, table, .btn, .eyebrow, .crumbs, .news-tabs, .tech-filter, label";
  // Parts that animate on their own, sit in the fixed header, or must stay put
  var SKIP = ".site-header, .ticker, dialog, .svc-set, .hero-slides, .band, .chev-flight, .lang-menu, .sr-only, .skip-link, [data-still], .svc-rain";
  var scope = Array.prototype.slice.call(document.querySelectorAll("main, .site-footer"));
  var rtl = function () { return /^(ar|fa)\b/.test(doc.lang || ""); };
  var CJK = /[　-鿿가-힯＀-￯]/;

  /* Split a heading's text into spans: words stay together so lines still wrap between words. */
  function splitHeading(h) {
    if (h.querySelector(".ch")) return;
    var label = h.textContent.replace(/\s+/g, " ").trim();
    var walker = document.createTreeWalker(h, NodeFilter.SHOW_TEXT, null), nodes = [], n, i = 0, byWord = rtl();
    while ((n = walker.nextNode())) if (n.nodeValue.trim()) nodes.push(n);
    var count = nodes.reduce(function (t, x) { return t + x.nodeValue.replace(/\s/g, "").length; }, 0);
    h.style.setProperty("--cs", Math.max(CS_BASE * 0.45, Math.min(CS_BASE * 1.3, CS_BASE * 35 / Math.max(count, 1))) + "ms");
    nodes.forEach(function (node) {
      var frag = document.createDocumentFragment();
      node.nodeValue.split(/(\s+)/).forEach(function (tok) {
        if (!tok) return;
        if (/^\s+$/.test(tok)) { frag.appendChild(document.createTextNode(tok)); return; }
        var add = function (parent, text) { var c = document.createElement("span"); c.className = "ch"; c.textContent = text; c.style.setProperty("--i", Math.min(i++, 60)); parent.appendChild(c); };
        if (byWord) { add(frag, tok); return; }
        if (CJK.test(tok)) { Array.from(tok).forEach(function (ch) { add(frag, ch); }); return; }   // CJK: may break between any characters
        var w = document.createElement("span"); w.className = "ch-w";
        Array.from(tok).forEach(function (ch) { add(w, ch); });
        frag.appendChild(w);
      });
      node.parentNode.replaceChild(frag, node);
    });
    h.classList.add("ch-split");
    // The homepage headline gets its own entrance: each letter's distance from the centre of the line (-1 to 1)
    if (h.closest(".hero-card") && on("--anim-hero")) {
      var chars = h.querySelectorAll(".ch"), mid = (chars.length - 1) / 2 || 1;
      Array.prototype.forEach.call(chars, function (c, n) { c.style.setProperty("--o", ((n - mid) / mid).toFixed(3)); c.style.setProperty("--i", n); });
      h.classList.add("ch-hero");
    }
    if (!h.querySelector("a, button") && label) { h.setAttribute("aria-label", label); Array.prototype.forEach.call(h.querySelectorAll(".ch-w, .ch"), function (c) { c.setAttribute("aria-hidden", "true"); }); }
  }

  var picked = [];
  var taken = function (el) { for (var p = el.parentElement; p; p = p.parentElement) if (p.hasAttribute && p.hasAttribute("data-a")) return true; return false; };
  function take(list, kind) {
    list.forEach(function (el) {
      if (el.hasAttribute("data-a") || el.closest(SKIP) || taken(el)) return;
      if (kind === "pic" && el.matches("img, picture") && el.closest("figure, picture") !== el && el.closest("figure, picture")) return;
      el.setAttribute("data-a", kind); picked.push(el);
    });
  }
  var all = function (sel) { var out = []; scope.forEach(function (s) { out = out.concat(Array.prototype.slice.call(s.querySelectorAll(sel))); }); return out; };
  // Each kind can be switched off in the Design tab; a switched-off kind still claims its elements so nothing else animates them.
  var mark = function (kind, ok) { return function (el) { if (!ok) el.setAttribute("data-still", ""); }; };
  if (!on("--anim-cards")) all(CARDS).forEach(mark("card", false));
  if (!on("--anim-chars")) all(HEADS).forEach(mark("head", false));
  if (!on("--anim-images")) all(PICS).forEach(mark("pic", false));
  if (!on("--anim-text")) all(TEXT).forEach(mark("text", false));
  take(all(CARDS), "card");
  take(all(HEADS), "head");
  take(all(PICS), "pic");
  take(all(TEXT), "text");

  // Document order, then: alternate sides for text within each section, stagger cards within their row.
  picked.sort(function (a, b) { return a.compareDocumentPosition(b) & 4 ? -1 : 1; });
  var side = 0, lastSection = null;
  picked.forEach(function (el) {
    var kind = el.getAttribute("data-a");
    var section = el.closest("section, footer, main");
    if (section !== lastSection) { side = 0; lastSection = section; }
    if (kind === "text") { el.classList.add(side++ % 2 ? "a-r" : "a-l"); }
    else if (kind === "head") { splitHeading(el); side++; }
    else if (kind === "pic") { el.classList.add("a-img"); }
    else { el.classList.add("a-up"); var idx = el.parentElement ? Array.prototype.indexOf.call(el.parentElement.children, el) : 0; el.style.setProperty("--d", (idx % 4) * 0.09 + "s"); }
  });
  doc.classList.add("anim-on");

  // Reveal on entering the viewport; afterwards hand the element back its own transitions (hover colours etc.).
  var batch = 0, batchTimer = null;
  var reveal = function (el) {
    if (el.getAttribute("data-a") !== "card") {
      el.style.setProperty("--d", Math.min(batch++, 5) * 0.07 + "s");
      clearTimeout(batchTimer); batchTimer = setTimeout(function () { batch = 0; }, 120);
    }
    el.classList.add("is-in");
    if (el.getAttribute("data-a") !== "head") setTimeout(function () { el.classList.remove("a-l", "a-r", "a-up", "a-img"); el.style.removeProperty("--d"); }, 1800);
  };
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { if (e.isIntersecting) { reveal(e.target); io.unobserve(e.target); } });
  }, { rootMargin: "0px 0px -6% 0px", threshold: 0.06 });
  picked.forEach(function (el) { io.observe(el); });
  // At the very bottom of the page the last lines can't scroll any higher: show whatever is on screen.
  var atEnd = function () {
    if (window.innerHeight + window.scrollY < doc.scrollHeight - 4) return;
    picked.forEach(function (el) { if (!el.classList.contains("is-in") && el.getBoundingClientRect().top < window.innerHeight) { reveal(el); io.unobserve(el); } });
  };
  window.addEventListener("scroll", atEnd, { passive: true });

  // The language switcher rewrites heading text: split it again (headings already shown stay shown).
  document.addEventListener("tse:lang", function () {
    picked.forEach(function (el) { if (el.getAttribute("data-a") === "head") { el.removeAttribute("aria-label"); splitHeading(el); } });
  });
  // Every picture starts black and white and turns to full color as it comes into view
  var grays = [];
  if (on("--anim-color")) {
    // The hero logo stays a plain picture (its glow is a separate layer); the page-wide opening still grays it
    grays = all("img").filter(function (img) { return !img.closest(".site-header, .ticker, dialog, .logo-dazzle--hero, [data-still-color]"); });
    var gsMs = (parseFloat(css.getPropertyValue("--gs-dur")) || 1.8) * 1000;
    var gio = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var img = e.target; gio.unobserve(img);
        setTimeout(function () { img.classList.add("gs-in"); }, 250);
        setTimeout(function () { img.classList.remove("gs", "gs-in"); }, gsMs + 600);   // hand back the picture's own filters (hover effects)
      });
    }, { rootMargin: "0px 0px -10% 0px", threshold: 0.2 });
    grays.forEach(function (img) { img.classList.add("gs"); gio.observe(img); });
  }
  window.addEventListener("beforeprint", function () { picked.forEach(function (el) { el.classList.add("is-in"); }); grays.forEach(function (img) { img.classList.add("gs-in"); }); });
})();
