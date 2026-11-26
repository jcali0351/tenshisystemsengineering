/* Popup (cms/widgets/popup.py): trigger + frequency cap (localStorage / sessionStorage, no cookies). */
(function () {
  "use strict";
  function store(kind) { try { var s = window[kind]; s.setItem("tw-t", "1"); s.removeItem("tw-t"); return s; } catch (e) { return null; } }
  var local = store("localStorage"), session = store("sessionStorage");
  Array.prototype.forEach.call(document.querySelectorAll("dialog[data-tw-popup]"), function (d) {
    var key = d.dataset.key, freq = d.dataset.frequency, days = +d.dataset.days || 7, opened = false, back = null;
    if (d.dataset.mobile === "0" && window.matchMedia("(max-width: 640px)").matches) return;
    function seen() {
      if (freq === "session") return session && session.getItem(key);
      var t = local && +local.getItem(key);
      if (!t) return false;
      return freq === "once" || Date.now() - t < days * 864e5;
    }
    function remember() {
      if (freq === "session") { if (session) session.setItem(key, "1"); }
      else if (local) local.setItem(key, String(Date.now()));
    }
    if (seen() || typeof d.showModal !== "function") return;
    function open() {
      if (opened || seen() || document.querySelector("dialog[open]")) return;
      opened = true; back = document.activeElement; remember();
      d.showModal();
      var f = d.querySelector("input, a[href], button:not([data-tw-popup-close])") || d.querySelector("[data-tw-popup-close]");
      if (f) f.focus();
    }
    function close() { if (d.open) d.close(); }
    d.addEventListener("close", function () { if (back && back.focus) back.focus(); });
    d.addEventListener("click", function (e) { if (e.target === d || e.target.closest("[data-tw-popup-close]")) close(); });
    var trig = d.dataset.trigger;
    if (trig === "scroll") {
      var onScroll = function () {
        var h = document.documentElement, pct = (h.scrollTop + innerHeight) / h.scrollHeight * 100;
        if (pct >= +d.dataset.scroll) { removeEventListener("scroll", onScroll); open(); }
      };
      addEventListener("scroll", onScroll, { passive: true });
    } else if (trig === "exit") {
      document.addEventListener("mouseout", function (e) { if (!e.relatedTarget && e.clientY <= 0) open(); });
    } else {
      setTimeout(open, (+d.dataset.delay || 0) * 1000);
    }
  });
})();
