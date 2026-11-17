/* Main menu (styles: nav.css; markup: the header in index.html, copied to every page by tools/build-pages.mjs).
   Ported from the Xal'reth site's menu (site.js "Mobile nav toggle", "About submenu" and "Menu FX").
   - Chooses the layout: the bar on wide screens, the Menu button and panel on phones or whenever the bar doesn't fit
     beside the logo and language button (ten languages have very different word lengths, so it measures).
   - Menu button: opens and closes the panel (aria-expanded); Escape or a click outside closes it.
   - Chevron buttons: open a parent's dropdown (wide) or accordion (phone); Escape, a click elsewhere or tabbing away closes it.
   - The light gray block that glides to the item under the pointer and rests on the current page. */
(function () {
  "use strict";
  var header = document.querySelector(".site-header");
  var nav = header && header.querySelector(".site-nav");
  var top = nav && nav.querySelector(":scope > ul");
  if (!top) return;
  var inner = header.querySelector(".header-inner") || header;
  var toggle = header.querySelector(".nav-toggle");
  var brand = header.querySelector(".brand");
  var picker = header.querySelector(".lang-picker");
  var subs = Array.prototype.slice.call(nav.querySelectorAll(".has-sub"));
  var phone = window.matchMedia("(max-width: 860px)");
  var calm = window.matchMedia("(prefers-reduced-motion: reduce)");
  var isMobile = function () { return header.classList.contains("nav-mobile"); };

  // stagger order for the entrance and the dropdown items
  Array.prototype.forEach.call(top.children, function (li, i) { li.style.setProperty("--i", i); });
  nav.querySelectorAll("ul.sub").forEach(function (ul) {
    Array.prototype.forEach.call(ul.children, function (li, i) { li.style.setProperty("--i", i); });
    // a faint spotlight follows the pointer inside each dropdown
    ul.addEventListener("pointermove", function (e) {
      var r = ul.getBoundingClientRect();
      ul.style.setProperty("--mx", (e.clientX - r.left) + "px"); ul.style.setProperty("--my", (e.clientY - r.top) + "px");
    });
    ul.addEventListener("pointerleave", function () { ul.style.removeProperty("--mx"); ul.style.removeProperty("--my"); });
  });

  /* ---------- dropdowns / accordions ---------- */
  var setSub = function (li, open) {
    li.classList.toggle("open", open);
    var b = li.querySelector(":scope > .sub-toggle"); if (b) b.setAttribute("aria-expanded", open ? "true" : "false");
  };
  var closeSubs = function (except) { subs.forEach(function (li) { if (li !== except) setSub(li, false); }); };
  subs.forEach(function (li) {
    var btn = li.querySelector(":scope > .sub-toggle");
    if (!btn) return;
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var open = !li.classList.contains("open");
      closeSubs(li);
      setSub(li, open);
    });
    btn.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown" && !isMobile()) {   // open and step into the dropdown
        e.preventDefault(); closeSubs(li); setSub(li, true);
        var first = li.querySelector("ul.sub a"); if (first) first.focus();
      }
    });
    li.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && li.classList.contains("open")) { e.stopPropagation(); setSub(li, false); btn.focus(); }
      if (!isMobile() && (e.key === "ArrowDown" || e.key === "ArrowUp") && e.target.closest("ul.sub")) {
        var links = Array.prototype.slice.call(li.querySelectorAll("ul.sub a")), i = links.indexOf(e.target);
        if (i < 0) return;
        e.preventDefault();
        if (e.key === "ArrowUp" && i === 0) { btn.focus(); return; }
        links[Math.min(links.length - 1, Math.max(0, i + (e.key === "ArrowDown" ? 1 : -1)))].focus();
      }
    });
    li.addEventListener("focusout", function (e) { if (!isMobile() && !li.contains(e.relatedTarget)) setSub(li, false); });
  });
  document.addEventListener("click", function (e) { if (!isMobile() && !e.target.closest(".site-nav .has-sub")) closeSubs(); });

  /* ---------- the Menu button and panel ---------- */
  var setPanel = function (open) {
    if (open) header.style.setProperty("--nav-top", Math.max(0, Math.round(header.getBoundingClientRect().bottom)) + "px");
    nav.classList.toggle("open", open);
    if (toggle) toggle.setAttribute("aria-expanded", open ? "true" : "false");
    if (!open) closeSubs();
  };
  if (toggle) {
    toggle.addEventListener("click", function (e) { e.stopPropagation(); setPanel(!nav.classList.contains("open")); });
    header.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && nav.classList.contains("open")) { setPanel(false); toggle.focus(); }
    });
    document.addEventListener("click", function (e) { if (nav.classList.contains("open") && !header.contains(e.target)) setPanel(false); });
    // tabbing out of the open panel (past its last link) closes it
    nav.addEventListener("focusout", function (e) {
      if (isMobile() && nav.classList.contains("open") && e.relatedTarget && !header.contains(e.relatedTarget)) setPanel(false);
    });
  }

  /* ---------- the gliding block (wide screens) ---------- */
  var glow = document.createElement("li");
  glow.className = "nav-glow"; glow.setAttribute("aria-hidden", "true"); glow.setAttribute("role", "presentation");
  top.appendChild(glow);
  var items = Array.prototype.filter.call(top.children, function (li) { return li !== glow; });
  var place = function (li) {
    if (isMobile() || !li) { glow.style.opacity = "0"; return; }
    var r = li.getBoundingClientRect(), p = top.getBoundingClientRect();
    glow.style.width = r.width + "px";
    glow.style.transform = "translateX(" + (r.left - p.left - top.clientLeft) + "px)";
    glow.style.opacity = "1";
  };
  var rest = function () {
    place(items.filter(function (li) { return li.querySelector(':scope > a[aria-current="page"]'); })[0] || null);
  };
  items.forEach(function (li) {
    li.addEventListener("pointerenter", function () { place(li); });
    li.addEventListener("focusin", function () { place(li); });
  });
  top.addEventListener("pointerleave", rest);
  nav.addEventListener("focusout", function (e) { if (!nav.contains(e.relatedTarget)) rest(); });

  /* ---------- layout: bar or Menu button ---------- */
  var fits = function () {
    if (!brand || !picker) return true;
    var b = brand.getBoundingClientRect(), p = picker.getBoundingClientRect(), u = top.getBoundingClientRect();
    var room = document.documentElement.dir === "rtl" ? b.left - p.right : p.left - b.right;
    return u.width + 32 <= room && inner.scrollWidth <= inner.clientWidth + 1;
  };
  var busy = false;
  var layout = function () {
    if (busy) return; busy = true;
    var was = isMobile();
    header.classList.remove("nav-mobile");
    var mobile = phone.matches || !fits();
    header.classList.toggle("nav-mobile", mobile);
    header.classList.add("nav-ready");
    if (was !== mobile) { setPanel(false); closeSubs(); }
    rest();
    busy = false;
  };

  // the entrance on every page load (skipped for reduced motion by nav.css)
  if (!calm.matches) {
    document.documentElement.classList.add("nav-intro");
    setTimeout(function () { document.documentElement.classList.remove("nav-intro"); }, 2400);
  }
  layout();
  var queued = false;
  var relayout = function () { if (queued) return; queued = true; requestAnimationFrame(function () { queued = false; layout(); }); };
  window.addEventListener("resize", relayout);
  window.addEventListener("load", relayout);
  if (phone.addEventListener) phone.addEventListener("change", relayout);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);
  // a new language changes every label's width (app.js sets lang and dir on <html>)
  new MutationObserver(relayout).observe(document.documentElement, { attributes: true, attributeFilter: ["lang", "dir"] });
  if (window.ResizeObserver) new ResizeObserver(function () { if (!isMobile()) rest(); }).observe(top);
  // the entrance stretches the bar for a moment, so measure again once it has settled
  [1000, 2500].forEach(function (ms) { setTimeout(function () { if (!top.matches(":hover")) relayout(); }, ms); });
  requestAnimationFrame(function () { requestAnimationFrame(function () { glow.classList.add("ready"); }); });
})();
