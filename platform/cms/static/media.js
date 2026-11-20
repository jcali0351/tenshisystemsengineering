/* =====================================================================================================================
   MEDIA CENTER (ui/media.html)
     1. Loading and showing files (folders, kind, category, tag and search filters)
     2. Uploading (button, or drop files anywhere), several at a time
     3. Choosing files: one opens its details; ticks select several for bulk actions
     4. The details panel: title, alt text, caption, category, tags, folder, where it's used, delete
     5. Bulk actions: move, tag, category, delete
     6. Folders: new, rename, delete
     7. Crop, resize and rotate
   ===================================================================================================================== */
(function () {
  "use strict";
  var T = window.Tenshi, $ = T.$, $$ = T.$$, esc = T.esc;
  var app = $("#media-app");
  if (!app) return;
  var siteId = app.dataset.site;
  var state = { folder: "", items: [], selected: [], open: null };

  /* ---------- 1. Loading and showing files ---------- */
  function load() {
    var q = new URLSearchParams({ folder: state.folder, kind: $("#f-kind").value, q: $("#f-q").value, tag: $("#f-tag").value, category: $("#f-cat").value });
    return T.api("GET", "/api/sites/" + siteId + "/media?" + q).then(function (data) {
      state.items = data.items;
      fillSelect($("#f-tag"), data.tags, "Every tag");
      fillSelect($("#f-cat"), data.categories, "Every category");
      draw();
    });
  }
  function fillSelect(select, values, first) {
    var keep = select.value;
    select.innerHTML = '<option value="">' + first + "</option>" + values.map(function (v) { return "<option>" + esc(v) + "</option>"; }).join("");
    select.value = keep;
  }
  function draw() {
    $("#m-count").textContent = state.items.length + (state.items.length === 1 ? " file" : " files");
    $("#grid").innerHTML = state.items.length ? state.items.map(function (m) {
      var pic = (m.kind === "image" || m.kind === "svg") ? '<img src="' + esc(m.thumb) + '" alt="" loading="lazy">'
        : '<span class="kind">' + esc(m.kind === "pdf" ? "PDF" : m.kind === "video" ? "▶ VIDEO" : m.kind.toUpperCase()) + "</span>";
      var warn = (m.kind === "image" || m.kind === "svg") && !m.alt ? '<span class="warn" title="Needs a description (alt text)">ALT</span>' : "";
      return '<div class="mitem' + (state.open === m.id ? " on" : "") + '" data-id="' + m.id + '" tabindex="0">' +
        '<input type="checkbox" class="pick" aria-label="Select ' + esc(m.filename) + '"' + (state.selected.indexOf(m.id) >= 0 ? " checked" : "") + ">" +
        warn + '<div class="thumb">' + pic + '</div><div class="name" title="' + esc(m.filename) + '">' + esc(m.title || m.filename) + "</div></div>";
    }).join("") : '<div class="empty" style="grid-column:1/-1">No files here. Drop files on this page or press Upload files.</div>';
    updateBulk();
  }
  ["#f-kind", "#f-tag", "#f-cat"].forEach(function (s) { $(s).addEventListener("change", load); });
  $("#f-q").addEventListener("input", function () { clearTimeout(this.t); this.t = setTimeout(load, 250); });
  $$(".folders a").forEach(function (a) {
    a.addEventListener("click", function (e) {
      e.preventDefault();
      state.folder = a.dataset.folder;
      $$(".folders a").forEach(function (x) { x.classList.toggle("on", x === a); });
      $("#rename-folder").hidden = $("#delete-folder").hidden = !/^\d+$/.test(state.folder);
      load();
    });
  });

  /* ---------- 2. Uploading ---------- */
  function upload(files) {
    files = Array.prototype.slice.call(files);
    if (!files.length) return;
    var list = $("#upload-list");
    var max = +app.dataset.max * 1024 * 1024;
    var ok = files.filter(function (f) {
      if (f.size > max) { T.toast(f.name + " is over " + app.dataset.max + " MB", true); return false; }
      return true;
    });
    // Send in small groups so a big batch shows progress and one bad file doesn't stop the rest
    var groups = [];
    for (var i = 0; i < ok.length; i += 4) groups.push(ok.slice(i, i + 4));
    var done = 0;
    list.innerHTML = "<li>Uploading " + ok.length + " file(s)…</li>";
    return groups.reduce(function (chain, group) {
      return chain.then(function () {
        var fd = new FormData();
        group.forEach(function (f) { fd.append("files", f); });
        if (/^\d+$/.test(state.folder)) fd.append("folder_id", state.folder);
        return T.api("POST", "/api/sites/" + siteId + "/media", fd).then(function (res) {
          done += res.items.length;
          res.errors.forEach(function (msg) { list.insertAdjacentHTML("beforeend", '<li style="color:var(--bad)">' + esc(msg) + "</li>"); });
          list.firstChild.textContent = "Uploaded " + done + " of " + ok.length;
        }).catch(function () { /* the error was already shown */ });
      });
    }, Promise.resolve()).then(function () {
      T.toast(done + " file(s) uploaded");
      setTimeout(function () { if (!$("#upload-list li[style]")) list.innerHTML = ""; }, 2500);
      load();
    });
  }
  $("#upload-input").addEventListener("change", function (e) { upload(e.target.files); e.target.value = ""; });
  var dz = $("#dropzone"), depth = 0;
  document.addEventListener("dragenter", function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types, "Files") >= 0) { depth++; dz.hidden = false; } });
  document.addEventListener("dragleave", function () { if (--depth <= 0) { depth = 0; dz.hidden = true; } });
  document.addEventListener("dragover", function (e) { e.preventDefault(); });
  document.addEventListener("drop", function (e) { e.preventDefault(); depth = 0; dz.hidden = true; if (e.dataTransfer.files.length) upload(e.dataTransfer.files); });

  /* ---------- 3. Choosing files ---------- */
  $("#grid").addEventListener("click", function (e) {
    var el = e.target.closest(".mitem"); if (!el) return;
    var id = +el.dataset.id;
    if (e.target.classList.contains("pick") || e.shiftKey || e.ctrlKey || e.metaKey) {
      var i = state.selected.indexOf(id);
      if (i >= 0) state.selected.splice(i, 1); else state.selected.push(id);
      draw();
      return;
    }
    openDetails(id);
  });
  $("#grid").addEventListener("keydown", function (e) { if (e.key === "Enter" && e.target.classList.contains("mitem")) openDetails(+e.target.dataset.id); });
  $("#select-all").addEventListener("click", function () {
    state.selected = state.selected.length === state.items.length ? [] : state.items.map(function (m) { return m.id; });
    draw();
  });

  /* ---------- 4. The details panel ---------- */
  function openDetails(id) {
    state.open = id;
    draw();
    T.api("GET", "/api/media/" + id).then(function (m) {
      var preview = m.kind === "image" || m.kind === "svg" ? '<img src="' + esc(m.variants["800"] || m.url) + '" alt="">'
        : m.kind === "video" ? '<video src="' + esc(m.url) + '" controls preload="metadata"></video>'
        : m.kind === "audio" ? '<audio src="' + esc(m.url) + '" controls style="width:100%"></audio>'
        : '<p class="empty">' + esc(m.kind.toUpperCase()) + "</p>";
      var folders = $$(".folders a[data-name]").map(function (a) { return '<option value="' + a.dataset.folder + '"' + (+a.dataset.folder === m.folder_id ? " selected" : "") + ">" + esc(a.dataset.name) + "</option>"; }).join("");
      $("#details").innerHTML = preview +
        '<p class="small muted" style="margin:8px 0">' + esc(m.filename) + " · " + esc(m.size) + (m.width ? " · " + m.width + " × " + m.height + " px" : "") + "</p>" +
        '<div class="row" style="margin-bottom:12px">' +
        (m.kind === "image" && !/\.gif$/.test(m.url) ? '<button class="btn btn-small" data-crop>Crop / resize</button>' : "") +
        '<a class="btn btn-small" href="' + esc(m.url) + '" target="_blank" rel="noopener" download>Download</a>' +
        '<button class="btn btn-small" data-copy="' + esc(location.origin + m.url) + '">Copy link</button></div>' +
        field("title", "Title", m.title) +
        (m.kind === "image" || m.kind === "svg" ? field("alt", "Description for blind visitors and Google (alt text)", m.alt, "Describe what's in the picture, e.g. “New oak kitchen with white tiles”.") : "") +
        field("caption", "Caption", m.caption) + field("category", "Category", m.category) +
        field("tags", "Tags", m.tags, "Separate with commas.") +
        '<label class="field"><span>Folder</span><select data-field="folder_id"><option value="">Not in a folder</option>' + folders + "</select></label>" +
        '<p class="small"><b>Used on:</b> ' + (m.used.length ? m.used.map(esc).join(", ") : '<span class="muted">nowhere yet</span>') + "</p>" +
        '<button class="btn btn-small btn-danger" data-delete>Delete file</button>';
      $$("[data-field]", $("#details")).forEach(function (input) {
        input.addEventListener("change", function () {
          var body = {}; body[input.dataset.field] = input.value;
          T.api("PATCH", "/api/media/" + id, body).then(function () { T.toast("Saved"); load(); });
        });
      });
      var del = $("[data-delete]", $("#details"));
      del.onclick = function () {
        if (!confirm("Delete " + m.filename + "?" + (m.used.length ? "\n\nIt is used on: " + m.used.join(", ") + "." : "") + "\n\nThis can't be undone.")) return;
        T.api("DELETE", "/api/media/" + id).then(function () { state.open = null; $("#details").innerHTML = '<p class="muted">File deleted.</p>'; load(); });
      };
      var copy = $("[data-copy]", $("#details"));
      copy.onclick = function () { navigator.clipboard.writeText(copy.dataset.copy).then(function () { T.toast("Link copied"); }); };
      var crop = $("[data-crop]", $("#details"));
      if (crop) crop.onclick = function () { openCropper(m); };
    });
  }
  function field(name, label, value, hint) {
    var box = name === "caption" ? '<textarea data-field="caption" rows="2">' + esc(value) + "</textarea>"
      : '<input type="text" data-field="' + name + '" value="' + esc(value) + '">';
    return '<label class="field"><span>' + label + "</span>" + box + (hint ? "<small>" + hint + "</small>" : "") + "</label>";
  }

  /* ---------- 5. Bulk actions ---------- */
  function updateBulk() {
    $("#bulkbar").hidden = !state.selected.length;
    $("#bulk-n").textContent = state.selected.length + " selected";
  }
  function bulk(action, extra) {
    return T.api("POST", "/api/sites/" + siteId + "/media/bulk", Object.assign({ ids: state.selected, action: action }, extra || {}))
      .then(function (res) { T.toast(res.count + " file(s) updated"); if (action === "delete") state.selected = []; load(); });
  }
  $("#bulk-folder").addEventListener("change", function () { if (this.value) bulk("move", { folder_id: this.value === "none" ? "" : this.value }); this.value = ""; });
  $("#bulk-tag-go").addEventListener("click", function () { if ($("#bulk-tag").value) bulk("tag", { value: $("#bulk-tag").value }); $("#bulk-tag").value = ""; });
  $("#bulk-cat-go").addEventListener("click", function () { bulk("category", { value: $("#bulk-cat").value }); });
  $("#bulk-delete").addEventListener("click", function () {
    if (confirm("Delete " + state.selected.length + " file(s)? This can't be undone.")) bulk("delete");
  });
  $("#bulk-clear").addEventListener("click", function () { state.selected = []; draw(); });

  /* ---------- 6. Folders ---------- */
  $("#new-folder").addEventListener("click", function () {
    var name = prompt("Name of the new folder:");
    if (name) T.api("POST", "/api/sites/" + siteId + "/folders", { name: name }).then(function () { location.reload(); });
  });
  $("#rename-folder").addEventListener("click", function () {
    var a = $('.folders a[data-folder="' + state.folder + '"]');
    var name = prompt("New name:", a.dataset.name);
    if (name) T.api("PATCH", "/api/folders/" + state.folder, { name: name }).then(function () { location.reload(); });
  });
  $("#delete-folder").addEventListener("click", function () {
    if (confirm("Delete this folder? The files in it are kept (they move to “Not in a folder”).")) {
      T.api("DELETE", "/api/folders/" + state.folder).then(function () { location.reload(); });
    }
  });

  /* ---------- 7. Crop, resize and rotate ----------
     The picture is shown smaller than it really is, so the box's position is converted back to real pixels on Save. */
  var dlg = $("#crop-dlg"), img = $("#crop-img"), box = $("#crop-box"), crop = null, current = null, rotation = 0;
  function openCropper(m) {
    current = m; rotation = 0;
    img.onload = function () {
      crop = { x: 0, y: 0, w: img.clientWidth, h: img.clientHeight };
      placeBox();
      $("#crop-width").value = m.width;
      $("#crop-info").textContent = "Now " + m.width + " × " + m.height + " px";
    };
    img.src = m.url + "?t=" + Date.now();
    img.style.transform = "";
    dlg.showModal();
  }
  function placeBox() {
    box.style.left = crop.x + "px"; box.style.top = crop.y + "px"; box.style.width = crop.w + "px"; box.style.height = crop.h + "px";
  }
  function startDrag(e, resize) {
    e.preventDefault();
    var sx = e.clientX, sy = e.clientY, start = Object.assign({}, crop), W = img.clientWidth, H = img.clientHeight, ratio = +$("#crop-ratio").value;
    function move(ev) {
      var dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (resize) {
        crop.w = Math.max(20, Math.min(W - start.x, start.w + dx));
        crop.h = ratio ? crop.w / ratio : Math.max(20, Math.min(H - start.y, start.h + dy));
        if (crop.y + crop.h > H) { crop.h = H - crop.y; if (ratio) crop.w = crop.h * ratio; }
      } else {
        crop.x = Math.max(0, Math.min(W - crop.w, start.x + dx));
        crop.y = Math.max(0, Math.min(H - crop.h, start.y + dy));
      }
      placeBox();
    }
    function up() { document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up); }
    document.addEventListener("pointermove", move); document.addEventListener("pointerup", up);
  }
  box.addEventListener("pointerdown", function (e) { startDrag(e, e.target.tagName === "I"); });
  $("#crop-ratio").addEventListener("change", function () {
    var r = +this.value, W = img.clientWidth, H = img.clientHeight;
    if (!r) return;
    crop.w = Math.min(W, H * r); crop.h = crop.w / r; crop.x = (W - crop.w) / 2; crop.y = (H - crop.h) / 2; placeBox();
  });
  $("#rotate").addEventListener("click", function () { rotation = (rotation + 90) % 360; img.style.transform = "rotate(" + rotation + "deg)"; box.hidden = rotation !== 0; });
  $("[data-close]", dlg).onclick = function () { dlg.close(); };
  $("#crop-save").addEventListener("click", function () {
    var scale = current.width / img.clientWidth;
    var full = crop.x < 2 && crop.y < 2 && crop.w > img.clientWidth - 3 && crop.h > img.clientHeight - 3;
    var body = { rotate: rotation };
    if (!rotation && !full) body.crop = [crop.x * scale, crop.y * scale, (crop.x + crop.w) * scale, (crop.y + crop.h) * scale];
    var width = +$("#crop-width").value;
    if (width && width < current.width) body.width = width;
    T.busy(this, T.api("POST", "/api/media/" + current.id + "/edit", body).then(function (m) {
      T.toast("Saved: now " + m.width + " × " + m.height + " px");
      dlg.close(); load(); openDetails(current.id);
    }));
  });

  load();
})();
