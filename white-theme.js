/* Tenshi white theme switch. Loaded in <head> on every page, before the neon scripts.
   The white corporate look and the neon look share the same pages: this picks which one a visitor sees.
     tenshisystems.com/white/  (or any page with ?theme=white)  -> white, remembered on this device
     tenshisystems.com/neon/   (or any page with ?theme=neon)   -> back to neon
   To make white the default for everyone, change DEFAULT below to "white".
   In white mode <html> gets class "white" and loses "neon", so every neon rule (html.neon ...) switches off, and the
   neon scripts in sandbox/ return straight away (each starts with a check for the "white" class). */
(function () {
  var DEFAULT = "neon", KEY = "tenshi-theme", pick = null;
  try {
    var m = /[?&]theme=(white|neon)\b/.exec(location.search);
    if (m) localStorage.setItem(KEY, m[1]);
    pick = (m && m[1]) || localStorage.getItem(KEY);
  } catch (e) { var q = /[?&]theme=(white|neon)\b/.exec(location.search); pick = q && q[1]; }
  if ((pick || DEFAULT) !== "white") return;
  var c = document.documentElement.classList;
  c.remove("neon", "gx-page"); c.add("white");
  var meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = "#ffffff";
})();
