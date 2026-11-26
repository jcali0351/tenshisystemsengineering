/* The Stock Photo Library screen (ui/stock.html). Browse, search, filter by category/tag/licence, open a photo in the
   lightbox, add it to a site; admins also upload (drag and drop), edit, bulk-tag and delete. */
(function () {
  "use strict";
  var T = window.Tenshi, $ = T.$, $$ = T.$$, esc = T.esc;
  var app = $("#stock-app"), manage = app.dataset.manage === "1";
  var grid = $("#sk-grid"), state = { q: "", category: "", tag: "", license: "", page: 1, items: [], total: 0, selecting: false, selected: [] };
  var box = $("#sk-box"), current = -1;
  var toggle = function () {};               /* selecting photos (admins only; set below) */

  function query() {
    return "/api/stock?q=" + encodeURIComponent(state.q) + "&category=" + encodeURIComponent(state.category) + "&tag=" + encodeURIComponent(state.tag) +
      "&license=" + encodeURIComponent(state.license) + "&page=" + state.page + "&per=60";
  }
  function tile(m, i) {
    var flag = m.license_missing ? '<span class="flag warn">Licence?</span>' : (m.needs_credit ? '<span class="flag">Credit</span>' : "");
    var ratio = m.width && m.height ? ' width="' + m.width + '" height="' + m.height + '"' : "";
    return '<button type="button" class="sk-tile' + (state.selected.indexOf(m.id) >= 0 ? " on" : "") + '" data-i="' + i + '" data-id="' + m.id + '" aria-label="' + esc(m.title || "Photo") + '">' +
      '<img src="' + esc(m.thumb) + '" alt="' + esc(m.alt || m.title) + '" loading="lazy"' + ratio + '><span class="tick"></span>' + flag +
      '<span class="cap">' + esc(m.title) + "</span></button>";
  }
  function load(more) {
    if (!more) state.page = 1;
    return T.api("GET", query()).then(function (data) {
      state.items = more ? state.items.concat(data.items) : data.items;
      state.total = data.total;
      if (more) grid.insertAdjacentHTML("beforeend", data.items.map(function (m, k) { return tile(m, state.items.length - data.items.length + k); }).join(""));
      else grid.innerHTML = data.items.length ? data.items.map(tile).join("") : '<p class="empty">No photos match. Try another word, category or tag.</p>';
      $("#sk-count").textContent = data.total + (data.total === 1 ? " photo" : " photos");
      $("#sk-more").hidden = state.items.length >= data.total;
      chips(data.tags);
      cats(data.categories);
      seedNote(data.seed);
    });
  }
  function chips(tags) {
    var html = tags.map(function (t) {
      return '<button type="button" class="sk-chip" data-tag="' + esc(t.tag) + '" aria-pressed="' + (state.tag === t.tag) + '">' + esc(t.tag) + "<small>" + t.n + "</small></button>";
    });
    if (state.tag && !tags.some(function (t) { return t.tag === state.tag; })) html.unshift('<button type="button" class="sk-chip" data-tag="' + esc(state.tag) + '" aria-pressed="true">' + esc(state.tag) + "</button>");
    $("#sk-chips").innerHTML = html.join("");
  }
  function cats(list) {
    var all = 0, html = list.map(function (c) { all += c.n; return '<a href="#" role="listitem" data-cat="' + esc(c.category) + '"' + (state.category === c.category ? ' class="on"' : "") + ">" + esc(c.category || "Uncategorised") + " <span>" + c.n + "</span></a>"; });
    $("#sk-cats").innerHTML = '<a href="#" role="listitem" data-cat=""' + (state.category ? "" : ' class="on"') + ">All photos <span>" + all + "</span></a>" + html.join("");
    $("#sk-total").textContent = all + " photos in " + list.length + " categories";
  }
  function seedNote(seed) {
    var el = $("#sk-seed");
    el.hidden = !(seed && seed.running);
    if (seed && seed.running) { el.textContent = "Adding the starter photos to the library: " + seed.done + " of " + seed.total + "…"; clearTimeout(seedNote.t); seedNote.t = setTimeout(function () { load(); }, 4000); }
  }

  /* filters */
  $("#sk-q").addEventListener("input", function () { clearTimeout(this.t); var v = this.value; this.t = setTimeout(function () { state.q = v.trim(); load(); }, 250); });
  $("#sk-license").addEventListener("change", function () { state.license = this.value; load(); });
  $("#sk-cats").addEventListener("click", function (e) { var a = e.target.closest("a"); if (!a) return; e.preventDefault(); state.category = a.dataset.cat; state.tag = ""; load(); });
  $("#sk-chips").addEventListener("click", function (e) { var b = e.target.closest(".sk-chip"); if (!b) return; state.tag = state.tag === b.dataset.tag ? "" : b.dataset.tag; load(); });
  $("#sk-more").addEventListener("click", function () { state.page += 1; T.busy(this, load(true)); });

  /* grid: open the lightbox, or select when selecting */
  grid.addEventListener("click", function (e) {
    var t = e.target.closest(".sk-tile"); if (!t) return;
    if (state.selecting) { toggle(+t.dataset.id, t); return; }
    open(+t.dataset.i);
  });

  /* ---------- lightbox ---------- */
  function row(label, value) { return value ? "<dt>" + label + "</dt><dd>" + value + "</dd>" : ""; }
  function link(text, url) { return url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(text || url) + "</a>" : esc(text); }
  function open(i) {
    current = i; var m = state.items[i]; if (!m) return;
    $("#sk-box-img").src = m.url; $("#sk-box-img").alt = m.alt || m.title;
    $("#sk-box-title").textContent = m.title || "Photo";
    $("#sk-meta").innerHTML = row("Alt text", esc(m.alt)) + row("Category", esc(m.category)) +
      row("Tags", m.tags ? '<span class="tags">' + m.tags.split(", ").map(function (t) { return "<span>" + esc(t) + "</span>"; }).join("") + "</span>" : "") +
      row("Size", m.width + " × " + m.height + " px · " + esc(m.size)) + row("Creator", esc(m.creator)) + row("Source", link(m.source || "Source", m.source_url)) +
      row("Licence", m.license ? link(m.license, m.license_url) : '<b style="color:var(--warn)">Not set</b>') + row("Added", esc((m.created_at || "").slice(0, 10)) + (m.origin === "seed" ? " · starter set" : " · uploaded"));
    var cr = $("#sk-credit"); cr.hidden = !m.credit; $("span", cr).textContent = m.credit || "";
    $("#sk-download").href = m.download;
    $(".sk-prev", box).hidden = i <= 0; $(".sk-next", box).hidden = i >= state.items.length - 1;
    var form = $("#sk-edit");
    if (form) ["title", "alt", "category", "tags", "creator", "source", "source_url", "license", "license_url"].forEach(function (k) { form.elements[k].value = m[k] || ""; });
    if (!box.open) box.showModal();
  }
  function step(d) {
    var n = current + d;
    if (n >= state.items.length && state.items.length < state.total) { state.page += 1; load(true).then(function () { open(n); }); return; }
    if (n >= 0 && n < state.items.length) open(n);
  }
  $(".sk-prev", box).addEventListener("click", function () { step(-1); });
  $(".sk-next", box).addEventListener("click", function () { step(1); });
  box.addEventListener("keydown", function (e) {
    if (e.target.closest("input, textarea, select")) return;
    if (e.key === "ArrowLeft") step(-1); else if (e.key === "ArrowRight") step(1);
  });
  $("[data-close]", box).addEventListener("click", function () { box.close(); });
  box.addEventListener("click", function (e) { if (e.target === box) box.close(); });
  $("#sk-copy-credit").addEventListener("click", function () {
    navigator.clipboard.writeText(state.items[current].credit).then(function () { T.toast("Credit copied"); });
  });
  $("#sk-use").addEventListener("click", function () {
    var site = $("#sk-site").value, m = state.items[current]; if (!site) return;
    T.busy(this, T.api("POST", "/api/sites/" + site + "/stock/" + m.id).then(function (item) {
      T.toast("Added to " + $("#sk-site").selectedOptions[0].textContent + "'s Media Center (folder: Stock photos)");
    }));
  });

  /* ---------- admin: edit, delete, select, bulk, upload ---------- */
  if (manage) {
    $("#sk-edit").addEventListener("submit", function (e) {
      e.preventDefault();
      var f = this, body = {};
      ["title", "alt", "category", "tags", "creator", "source", "source_url", "license", "license_url"].forEach(function (k) { body[k] = f.elements[k].value; });
      T.busy($("button[type=submit]", f), T.api("PATCH", "/api/stock/" + state.items[current].id, body).then(function (m) {
        state.items[current] = m; open(current); T.toast("Saved");
        var t = grid.querySelector('[data-i="' + current + '"]'); if (t) t.outerHTML = tile(m, current);
      }));
    });
    $("#sk-delete").addEventListener("click", function () {
      var m = state.items[current];
      if (!confirm("Delete \"" + (m.title || "this photo") + "\" from the library? Copies already added to sites stay in their Media Centers.")) return;
      T.api("DELETE", "/api/stock/" + m.id).then(function () { box.close(); T.toast("Deleted"); load(); });
    });

    toggle = function (id, el) {
      var k = state.selected.indexOf(id);
      if (k >= 0) state.selected.splice(k, 1); else state.selected.push(id);
      if (el) el.classList.toggle("on", k < 0);
      $("#sk-bulk-n").textContent = state.selected.length + " selected";
    };
    function selecting(on) {
      state.selecting = on; state.selected = [];
      app.classList.toggle("sk-selecting", on); $("#sk-bulk").hidden = !on;
      $("#sk-select").setAttribute("aria-pressed", String(on));
      $$(".sk-tile.on", grid).forEach(function (t) { t.classList.remove("on"); });
      $("#sk-bulk-n").textContent = "0 selected";
    }
    $("#sk-select").addEventListener("click", function () { selecting(!state.selecting); });
    $("#sk-bulk-done").addEventListener("click", function () { selecting(false); });
    $("#sk-all").addEventListener("click", function () {
      state.items.forEach(function (m) { if (state.selected.indexOf(m.id) < 0) state.selected.push(m.id); });
      $$(".sk-tile", grid).forEach(function (t) { t.classList.add("on"); });
      $("#sk-bulk-n").textContent = state.selected.length + " selected";
    });
    $$("[data-bulk]").forEach(function (b) {
      b.addEventListener("click", function () {
        var action = b.dataset.bulk, value = "";
        if (!state.selected.length) { T.toast("Select some photos first", true); return; }
        if (action === "tag" || action === "untag") value = $("#sk-bulk-tag").value;
        if (action === "category") value = $("#sk-bulk-cat").value;
        if (action === "license") value = $("#sk-bulk-lic").value;
        if (action !== "delete" && action !== "category" && !value.trim()) { T.toast("Type a value first", true); return; }
        if (action === "delete" && !confirm("Delete " + state.selected.length + " photo(s) from the library?")) return;
        T.busy(b, T.api("POST", "/api/stock/bulk", { ids: state.selected, action: action, value: value }).then(function (r) {
          T.toast(r.count + " photo(s) updated"); selecting(true); load();
        }));
      });
    });

    /* upload */
    var up = $("#sk-up"), files = [];
    function addFiles(list) {
      Array.prototype.forEach.call(list, function (f) { files.push(f); });
      $("#sk-up-list").innerHTML = files.map(function (f, i) { return '<li data-f="' + i + '">' + esc(f.name) + ' <span class="muted">' + Math.round(f.size / 1024) + " KB</span></li>"; }).join("");
      $("#sk-up-go").disabled = !files.length;
      $("#sk-up-status").textContent = files.length + " file(s) ready";
    }
    $("#sk-upload-open").addEventListener("click", function () { files = []; addFiles([]); up.showModal(); });
    $("[data-close]", up).addEventListener("click", function () { up.close(); });
    $("#sk-files").addEventListener("change", function () { addFiles(this.files); this.value = ""; });
    var drop = $("#sk-drop");
    ["dragenter", "dragover"].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add("over"); }); });
    ["dragleave", "drop"].forEach(function (ev) { drop.addEventListener(ev, function () { drop.classList.remove("over"); }); });
    drop.addEventListener("drop", function (e) { e.preventDefault(); addFiles(e.dataTransfer.files); });
    /* dropping anywhere on the page opens the upload dialog with those files */
    var dz = $("#sk-dropzone"), depth = 0;
    document.addEventListener("dragenter", function (e) { if (up.open || !e.dataTransfer || Array.prototype.indexOf.call(e.dataTransfer.types, "Files") < 0) return; depth++; dz.hidden = false; });
    document.addEventListener("dragleave", function () { if (--depth <= 0) { depth = 0; dz.hidden = true; } });
    document.addEventListener("dragover", function (e) { if (!up.open) e.preventDefault(); });
    document.addEventListener("drop", function (e) {
      if (up.open) return; e.preventDefault(); depth = 0; dz.hidden = true;
      if (e.dataTransfer.files.length) { files = []; addFiles(e.dataTransfer.files); up.showModal(); }
    });
    $("#sk-up-go").addEventListener("click", function () {
      var go = this, i = 0, ok = 0;
      go.disabled = true;
      function next() {
        if (i >= files.length) { $("#sk-up-status").textContent = ok + " of " + files.length + " added"; files = []; load(); return; }
        var li = $('#sk-up-list [data-f="' + i + '"]'), fd = new FormData();
        fd.append("files", files[i]);
        [["category", "#up-category"], ["tags", "#up-tags"], ["license", "#up-license"], ["creator", "#up-creator"], ["source", "#up-source"], ["source_url", "#up-source-url"]]
          .forEach(function (p) { fd.append(p[0], $(p[1]).value); });
        $("#sk-up-status").textContent = "Uploading " + (i + 1) + " of " + files.length + "…";
        fetch("/api/stock", { method: "POST", body: fd, headers: { "X-Tenshi": "1" }, credentials: "same-origin" })
          .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || d.detail || "Upload failed (" + r.status + ")"); return d; }); })
          .then(function (d) {
            if (d.errors.length) { li.className = "err"; li.textContent = d.errors[0]; }
            else if (d.items[0].duplicate) { li.className = "dup"; li.textContent = files[i].name + ": already in the library"; }
            else { li.className = "ok"; ok++; }
          })
          .catch(function (err) { li.className = "err"; li.textContent = files[i].name + ": " + err.message; })
          .then(function () { i++; next(); });
      }
      next();
    });
  }

  load();
})();
