// game-loader.js: keeps the homepage's two big games (Station Defense, Undercity) off the first page load.
// Their scripts (~240 KB) and sprite sheets (~3.5 MB) are only fetched when their photo strip is about to scroll into
// view (or right away if the page opens scrolled down to it). Their 3D models wait until someone presses PLAY
// (TenshiModels.need in each game's start()).
// The scripts to load are listed on this script's tag in index.html (data-px1 / data-px2), so bump their ?v= tags there.
(function () {
  const me = document.currentScript;
  if (!me || !("IntersectionObserver" in window)) return fallback();
  const loaded = {};
  function add(list) {
    for (const src of (list || "").split(/\s+/).filter(Boolean)) {
      const path = src.split("?")[0];
      if (loaded[path]) continue;
      loaded[path] = true;
      const s = document.createElement("script");
      s.src = src; s.async = false;          // keep their order (models + scores before the game)
      document.body.appendChild(s);
    }
  }
  function fallback() { if (me) { add(me.dataset.px1); add(me.dataset.px2); } }
  for (const [id, key] of [["parallax-px1-title", "px1"], ["parallax-px2-title", "px2"]]) {
    const title = document.getElementById(id);
    const band = title && title.closest(".parallax");
    if (!band) continue;
    const io = new IntersectionObserver(es => {
      if (es.some(e => e.isIntersecting)) { io.disconnect(); add(me.dataset[key]); }
    }, { rootMargin: "900px 0px 900px 0px" });
    io.observe(band);
  }
})();
