/* "Choose from stock": pick a photo from the shared Stock Photo Library and copy it into a site's Media Center.
     TenshiStock.pick(siteId).then(function (mediaItem) { … })   mediaItem is null if cancelled.
   Used by every picture field (Tenshi.mediaField) and inside the Media Picker (Tenshi.pickMedia), both in cms.js. */
(function () {
  "use strict";
  function T() { return window.Tenshi; }
  function pick(siteId) {
    var esc = T().esc;
    return new Promise(function (resolve) {
      var dlg = document.createElement("dialog"), items = [], chosen = null, page = 1, total = 0;
      dlg.className = "wide";
      dlg.setAttribute("aria-label", "Choose from stock photos");
      dlg.innerHTML =
        '<div class="dlg"><div class="row" style="margin-bottom:10px"><h2 style="margin:0">Choose from stock</h2><span style="flex:1"></span>' +
        '<a class="small" href="/stock" target="_blank" rel="noopener">Open the full library ↗</a></div>' +
        '<div class="skp-bar"><input type="search" placeholder="Search stock photos" aria-label="Search stock photos">' +
        '<select aria-label="Category"><option value="">Every category</option></select>' +
        '<select aria-label="Licence" data-lic><option value="">Any licence</option><option value="free">No credit needed</option><option value="credit">Credit required</option></select></div>' +
        '<div class="sk-chips" data-chips></div><div class="skp-grid"></div>' +
        '<div style="text-align:center;margin-top:8px"><button type="button" class="btn btn-small" data-more hidden>Show more</button></div></div>' +
        '<div class="dlg-foot"><span class="muted skp-note" data-note style="margin-right:auto">The photo is copied into this site\'s Media Center (folder: Stock photos).</span>' +
        '<button type="button" class="btn" data-close>Cancel</button><button type="button" class="btn btn-primary" data-ok disabled>Use photo</button></div>';
      document.body.appendChild(dlg);
      var q = dlg.querySelector("input[type=search]"), cat = dlg.querySelector("select"), lic = dlg.querySelector("[data-lic]"),
          grid = dlg.querySelector(".skp-grid"), chipsEl = dlg.querySelector("[data-chips]"), tag = "", ok = dlg.querySelector("[data-ok]");
      function tile(m) {
        var flag = m.needs_credit ? '<span class="flag">Credit</span>' : "";
        return '<button type="button" class="sk-tile' + (chosen === m.id ? " on" : "") + '" data-id="' + m.id + '" title="' + esc(m.title + (m.credit ? " · " + m.credit : "")) + '">' +
          '<img src="' + esc(m.thumb) + '" alt="' + esc(m.alt || m.title) + '" loading="lazy" width="' + m.width + '" height="' + m.height + '">' + flag + '<span class="cap">' + esc(m.title) + "</span></button>";
      }
      function load(more) {
        page = more ? page + 1 : 1;
        T().api("GET", "/api/stock?per=48&page=" + page + "&q=" + encodeURIComponent(q.value.trim()) + "&category=" + encodeURIComponent(cat.value) +
                "&tag=" + encodeURIComponent(tag) + "&license=" + encodeURIComponent(lic.value)).then(function (d) {
          items = more ? items.concat(d.items) : d.items; total = d.total;
          if (cat.options.length === 1) d.categories.forEach(function (c) { var o = document.createElement("option"); o.value = c.category; o.textContent = (c.category || "Uncategorised") + " (" + c.n + ")"; cat.appendChild(o); });
          var html = d.items.map(tile).join("");
          if (more) grid.insertAdjacentHTML("beforeend", html);
          else grid.innerHTML = html || '<p class="empty">No stock photos match.</p>';
          chipsEl.innerHTML = d.tags.slice(0, 18).map(function (t) { return '<button type="button" class="sk-chip" data-tag="' + esc(t.tag) + '" aria-pressed="' + (tag === t.tag) + '">' + esc(t.tag) + "</button>"; }).join("");
          dlg.querySelector("[data-more]").hidden = items.length >= total;
        });
      }
      grid.addEventListener("click", function (e) {
        var t = e.target.closest(".sk-tile"); if (!t) return;
        chosen = +t.dataset.id;
        Array.prototype.forEach.call(grid.querySelectorAll(".sk-tile"), function (x) { x.classList.toggle("on", +x.dataset.id === chosen); });
        ok.disabled = false;
        var m = items.filter(function (x) { return x.id === chosen; })[0];
        dlg.querySelector("[data-note]").textContent = m && m.credit ? "Credit line (added as the caption): " + m.credit : "No credit needed for this photo.";
      });
      grid.addEventListener("dblclick", function (e) { if (e.target.closest(".sk-tile")) ok.click(); });
      chipsEl.addEventListener("click", function (e) { var b = e.target.closest(".sk-chip"); if (!b) return; tag = tag === b.dataset.tag ? "" : b.dataset.tag; load(); });
      q.addEventListener("input", function () { clearTimeout(q.t); q.t = setTimeout(function () { load(); }, 250); });
      cat.addEventListener("change", function () { tag = ""; load(); });
      lic.addEventListener("change", function () { load(); });
      dlg.querySelector("[data-more]").addEventListener("click", function () { load(true); });
      function finish(result) { dlg.close(); dlg.remove(); resolve(result); }
      dlg.querySelector("[data-close]").onclick = function () { finish(null); };
      dlg.addEventListener("cancel", function (e) { e.preventDefault(); finish(null); });
      ok.onclick = function () {
        if (!chosen) return;
        T().busy(ok, T().api("POST", "/api/sites/" + siteId + "/stock/" + chosen).then(function (m) {
          T().toast("Added to this site's Media Center"); finish(m);
        }));
      };
      dlg.showModal();
      load();
    });
  }
  window.TenshiStock = { pick: pick };
})();
