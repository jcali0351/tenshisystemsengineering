/* =====================================================================================================================
   Display mode (dark / light) and accent colour switcher.
   The <head> of every screen sets data-theme and data-accent on <html> before the first paint (no flash) from
   localStorage; this file wires the buttons and saves the choice.
     <button data-theme-toggle>                 sun / moon: flips dark <-> light (aria-pressed = light mode is on)
     <button data-set-accent="lime">             one swatch per accent (aria-pressed = the chosen one)
   With no saved choice the OS setting (prefers-color-scheme) decides, and dark is the default.
   ===================================================================================================================== */
(function () {
  "use strict";
  var root = document.documentElement;
  var KEY_T = root.getAttribute("data-theme-key") || "tenshi-ui-theme";
  var KEY_A = root.getAttribute("data-accent-key") || "tenshi-ui-accent";
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function put(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode: still switches for this page */ } }

  function sync() {
    var light = root.getAttribute("data-theme") === "light";
    var accent = root.getAttribute("data-accent");
    Array.prototype.forEach.call(document.querySelectorAll("[data-theme-toggle]"), function (b) {
      b.setAttribute("aria-pressed", light ? "true" : "false");
      var label = light ? "Switch to dark mode" : "Switch to light mode";
      b.setAttribute("title", label);
      var sr = b.querySelector(".sr-only"); if (sr) sr.textContent = label;
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-set-accent]"), function (b) {
      b.setAttribute("aria-pressed", b.getAttribute("data-set-accent") === accent ? "true" : "false");
    });
  }
  function setTheme(t, save) { root.setAttribute("data-theme", t); if (save) put(KEY_T, t); sync(); }
  function setAccent(a) { root.setAttribute("data-accent", a); put(KEY_A, a); sync(); }

  document.addEventListener("click", function (e) {
    var t = e.target.closest && e.target.closest("[data-theme-toggle]");
    if (t) { setTheme(root.getAttribute("data-theme") === "light" ? "dark" : "light", true); return; }
    var a = e.target.closest && e.target.closest("[data-set-accent]");
    if (a) setAccent(a.getAttribute("data-set-accent"));
  });
  /* Arrow keys move between accent swatches (they are one group) */
  document.addEventListener("keydown", function (e) {
    var a = e.target.closest && e.target.closest("[data-set-accent]");
    if (!a || ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].indexOf(e.key) < 0) return;
    var all = Array.prototype.slice.call(a.parentNode.querySelectorAll("[data-set-accent]"));
    var i = all.indexOf(a) + (e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1);
    var next = all[(i + all.length) % all.length];
    next.focus(); setAccent(next.getAttribute("data-set-accent")); e.preventDefault();
  });
  /* Follow the OS setting live, but only while nothing is saved */
  if (window.matchMedia) {
    var mq = window.matchMedia("(prefers-color-scheme: light)");
    var onChange = function () { if (!get(KEY_T)) setTheme(mq.matches ? "light" : "dark", false); };
    if (mq.addEventListener) mq.addEventListener("change", onChange); else if (mq.addListener) mq.addListener(onChange);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", sync); else sync();
})();
