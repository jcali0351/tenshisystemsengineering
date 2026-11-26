/* Tenshi lightbox: pictures and videos full screen, for the gallery modules (cms/widgets/gallery.py, video_gallery.py).
   A modal <dialog>: the page behind can't be reached, Escape closes it, focus goes back where it was.
   Keys: ← → (previous / next), Home, End, Esc. Swipe on touch screens. "3 of 12" is read out as it changes.
   Videos load only when opened (youtube-nocookie / Vimeo with dnt=1) and stop when the lightbox closes.

   Markup it binds: a container [data-tw-lb] with links a[data-tw-lb-item] (href = the big picture, or
   data-embed = a video's player address; data-caption; the link's img alt). Hidden links (filters) are skipped. */
(function () {
  "use strict";
  if (window.TwLightbox) return;
  var dlg, items = [], index = 0, opener = null, startX = null;

  function el(tag, cls, attrs) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    return e;
  }
  function build() {
    dlg = el("dialog", "tw-lb", { "aria-label": "Picture viewer", "aria-roledescription": "lightbox" });
    dlg.innerHTML = '<div class="tw-lb-stage"></div><p class="tw-lb-cap"></p>' +
      '<p class="tw-lb-count" aria-live="polite"></p>' +
      '<button type="button" class="tw-lb-btn tw-lb-close" aria-label="Close (Esc)">✕</button>' +
      '<button type="button" class="tw-lb-btn tw-lb-prev" aria-label="Previous">‹</button>' +
      '<button type="button" class="tw-lb-btn tw-lb-next" aria-label="Next">›</button>';
    document.body.appendChild(dlg);
    dlg.querySelector(".tw-lb-close").onclick = close;
    dlg.querySelector(".tw-lb-prev").onclick = function () { go(index - 1); };
    dlg.querySelector(".tw-lb-next").onclick = function () { go(index + 1); };
    dlg.addEventListener("click", function (e) { if (e.target === dlg || e.target.classList.contains("tw-lb-stage")) close(); });
    dlg.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft") { e.preventDefault(); go(index - 1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); go(index + 1); }
      else if (e.key === "Home") { e.preventDefault(); go(0); }
      else if (e.key === "End") { e.preventDefault(); go(items.length - 1); }
    });
    dlg.addEventListener("close", function () {
      dlg.querySelector(".tw-lb-stage").innerHTML = "";                // stops a playing video
      if (opener && opener.isConnected) opener.focus();
    });
    dlg.addEventListener("touchstart", function (e) { startX = e.touches[0].clientX; }, { passive: true });
    dlg.addEventListener("touchend", function (e) {
      if (startX === null) return;
      var dx = e.changedTouches[0].clientX - startX; startX = null;
      if (Math.abs(dx) > 50) go(index + (dx < 0 ? 1 : -1));
    });
  }
  function draw() {
    var it = items[index], stage = dlg.querySelector(".tw-lb-stage");
    stage.innerHTML = "";
    if (it.embed) {
      var f = el("iframe", "tw-lb-video", { src: it.embed, title: it.title || "Video", allow: "autoplay; fullscreen; picture-in-picture", allowfullscreen: "" });
      stage.appendChild(f);
    } else {
      var img = el("img", "tw-lb-img", { src: it.src, alt: it.alt || "" });
      stage.appendChild(img);
    }
    dlg.querySelector(".tw-lb-cap").textContent = it.caption || "";
    dlg.querySelector(".tw-lb-count").textContent = items.length > 1 ? (index + 1) + " of " + items.length : "";
    dlg.querySelector(".tw-lb-prev").hidden = dlg.querySelector(".tw-lb-next").hidden = items.length < 2;
    dlg.setAttribute("aria-label", it.embed ? "Video player" : "Picture viewer");
    var next = items[index + 1];                                         // preload the next picture
    if (next && next.src && !next.embed) { var pre = new Image(); pre.src = next.src; }
  }
  function go(i) { if (!items.length) return; index = (i + items.length) % items.length; draw(); }
  function open(list, i, from) {
    if (!dlg) build();
    items = list; index = i || 0; opener = from || document.activeElement;
    draw();
    if (!dlg.open) dlg.showModal();
    dlg.querySelector(".tw-lb-close").focus();
  }
  function close() { if (dlg && dlg.open) dlg.close(); }

  function itemOf(a) {
    var img = a.querySelector("img");
    return { src: a.getAttribute("href"), embed: a.dataset.embed || "", alt: img ? img.alt : "", caption: a.dataset.caption || "", title: a.dataset.title || "" };
  }
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("[data-tw-lb] a[data-tw-lb-item]");
    if (!a || e.ctrlKey || e.metaKey || e.shiftKey || e.button) return;
    var group = a.closest("[data-tw-lb]");
    var links = Array.prototype.filter.call(group.querySelectorAll("a[data-tw-lb-item]"), function (x) { return !x.closest("[hidden]"); });
    e.preventDefault();
    open(links.map(itemOf), Math.max(0, links.indexOf(a)), a);
  });
  window.TwLightbox = { open: open, close: close };
})();
