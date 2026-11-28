/* Site search (widgets/search.py): loads search.json once and searches it in the browser as the visitor types. */
(function () {
  "use strict";
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function norm(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }
  Array.prototype.forEach.call(document.querySelectorAll("[data-tw-site-search]"), function (form) {
    var box = form.querySelector("input"), wrap = form.parentNode, list = wrap.querySelector(".tw-se-results"), count = wrap.querySelector(".tw-se-count");
    var data = null, limit = +form.dataset.limit || 20, base = form.dataset.base || "", preview = form.dataset.preview === "1";
    function href(slug) {
      if (preview) return base + slug + "?edit=0";
      return slug === "index" ? "./" : slug + ".html";
    }
    function load() {
      if (data) return Promise.resolve(data);
      return fetch(form.dataset.src, { credentials: "same-origin" }).then(function (r) { return r.ok ? r.json() : []; })
        .catch(function () { return []; }).then(function (d) { data = d.map(function (x) { x.n = norm(x.t); x.m = norm(x.x); return x; }); return data; });
    }
    function snippet(text, word) {
      var i = norm(text).indexOf(word); if (i < 0) return esc(text.slice(0, 160));
      var start = Math.max(0, i - 60), part = text.slice(start, start + 180);
      return (start ? "… " : "") + esc(part).replace(new RegExp("(" + word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "ig"), "<mark>$1</mark>") + " …";
    }
    function run() {
      var q = norm(box.value).trim(), words = q.split(/\s+/).filter(Boolean);
      if (!words.length) { list.innerHTML = ""; count.textContent = ""; return; }
      load().then(function (items) {
        var hits = items.map(function (it) {
          var score = 0;
          for (var i = 0; i < words.length; i++) {
            var w = words[i], inT = it.n.indexOf(w) >= 0, inX = it.m.indexOf(w) >= 0;
            if (!inT && !inX) return null;
            score += (inT ? 5 : 0) + (inX ? 1 : 0);
          }
          return { it: it, score: score };
        }).filter(Boolean).sort(function (a, b) { return b.score - a.score; }).slice(0, limit);
        count.textContent = hits.length ? hits.length + (hits.length === 1 ? " result" : " results") : "Nothing matches “" + box.value.trim() + "”.";
        list.innerHTML = hits.map(function (h) {
          return '<li><a href="' + esc(href(h.it.s)) + '"><b>' + esc(h.it.t) + '</b></a> <span class="tw-se-kind">' + esc(h.it.k) + "</span><p>" + snippet(h.it.x, words[0]) + "</p></li>";
        }).join("");
      });
    }
    var timer; box.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(run, 120); });
    box.addEventListener("focus", load, { once: true });
    var q = new URLSearchParams(location.search).get("q"); if (q) { box.value = q; run(); }
  });
})();
