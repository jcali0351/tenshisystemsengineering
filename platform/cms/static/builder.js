/* =====================================================================================================================
   THE PAGE BUILDER (ui/builder.html)

   The page is a list of blocks: [{ id, type: "hero", data: { heading: "…", … } }, …]. This file keeps that list,
   draws it on the left, shows the selected block's settings on the right, and saves to the CMS.
   The middle is the real page (an iframe of /sites/<id>/preview/<page>?edit=1). bridge.js runs inside it and talks to
   this file with messages:
       preview → builder   { tenshi: "select", block }               a block was clicked
                           { tenshi: "edit", block, field, value }   words were typed over in the preview
       builder → preview   { tenshi: "highlight", block }            show which block is selected
                           { tenshi: "tokens", css, style }          show an unsaved theme (the Theme panel)

     1. State and saving      3. The settings panel (block or page)   5. Adding blocks
     2. The block list        4. The preview                          6. Start
   ===================================================================================================================== */
(function () {
  "use strict";
  var T = window.Tenshi, $ = T.$, $$ = T.$$, esc = T.esc;
  var root = $("#builder");
  if (!root) return;
  var siteId = root.dataset.site, pageId = root.dataset.page;
  var DATA = JSON.parse($("#builder-data").textContent);
  var blocks = DATA.blocks, TYPES = DATA.types, page = DATA.page;
  var selected = null;                // the selected block's id (null = page settings)

  /* ---------- 1. State and saving ----------
     Every change marks the page "unsaved" and saves 0.6 s after the last change, so typing doesn't send a request per key. */
  var saveTimer, saving = Promise.resolve();
  /* Undo and redo (Ctrl+Z, Ctrl+Shift+Z or Ctrl+Y, and the ↶ ↷ buttons): a copy of the blocks before each change,
     typing grouped into one step per pause. */
  var past = [], future = [], lastSnap = JSON.stringify(blocks), typingAt = 0;
  function remember(typing) {
    var now = Date.now();
    if (typing && now - typingAt < 1500) { typingAt = now; return; }
    typingAt = typing ? now : 0;
    past.push(lastSnap); if (past.length > 100) past.shift();
    future.length = 0; drawUndo();
  }
  function restore(snap) {
    blocks.length = 0; Array.prototype.push.apply(blocks, JSON.parse(snap));
    lastSnap = snap; if (indexOf(selected) < 0) selected = null;
    changed({ history: false }); drawPanel();
  }
  function undo() { if (!past.length) return; future.push(JSON.stringify(blocks)); restore(past.pop()); drawUndo(); T.toast("Undone"); }
  function redo() { if (!future.length) return; past.push(JSON.stringify(blocks)); restore(future.pop()); drawUndo(); T.toast("Redone"); }
  function drawUndo() { var u = $("#undo"), r = $("#redo"); if (u) u.disabled = !past.length; if (r) r.disabled = !future.length; }
  document.addEventListener("keydown", function (e) {
    if (!(e.ctrlKey || e.metaKey) || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return;
    if (e.key.toLowerCase() === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
    else if (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey)) { e.preventDefault(); redo(); }
  });
  function getPath(obj, path) { return String(path).split(".").reduce(function (o, k) { return o == null ? undefined : o[k]; }, obj); }
  function setPath(obj, path, value) {      // "areas.1.heading" writes into nested lists and objects
    var keys = String(path).split("."), o = obj;
    for (var i = 0; i < keys.length - 1; i++) {
      if (o[keys[i]] == null || typeof o[keys[i]] !== "object") o[keys[i]] = /^\d+$/.test(keys[i + 1]) ? [] : {};
      o = o[keys[i]];
    }
    o[keys[keys.length - 1]] = value;
  }
  function changed(opts) {
    opts = opts || {};
    if (opts.history !== false) remember(opts.typing);
    lastSnap = JSON.stringify(blocks);
    $("#save-state").textContent = "Saving…";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saving = T.api("PATCH", "/api/pages/" + pageId, { blocks: blocks }).then(function () {
        $("#save-state").textContent = "All changes saved";
        if (!opts.noReload) reloadPreview();
      }).catch(function () { $("#save-state").textContent = "Not saved: check the message"; });
    }, opts.now ? 0 : 600);
    drawList();
  }
  function savePage(changes) {
    return T.api("PATCH", "/api/pages/" + pageId, changes).then(function (res) {
      Object.assign(page, changes);
      if (res.slug && res.slug !== page.slug) { page.slug = res.slug; root.dataset.slug = res.slug; }
      T.toast("Page settings saved");
      reloadPreview();
    });
  }
  window.addEventListener("beforeunload", function (e) { if (/Saving/.test($("#save-state").textContent)) { e.preventDefault(); e.returnValue = ""; } });

  /* ---------- 2. The block list (drag to reorder) ---------- */
  function summary(b) {
    var d = b.data || {};
    return d.heading || d.caption || (d.body ? String(d.body).replace(/<[^>]+>/g, " ").trim().slice(0, 40) : "") || TYPES[b.type].about;
  }
  function drawList() {
    var list = $("#blocks");
    list.innerHTML = blocks.length ? blocks.map(function (b, i) {
      return '<li draggable="true" data-id="' + esc(b.id) + '" class="' + (b.id === selected ? "on" : "") + '">' +
        '<span class="grip" aria-hidden="true">⋮⋮</span><span class="bname"><b>' + esc(TYPES[b.type].label) + "</b><small>" + esc(summary(b)) + "</small></span>" +
        '<span class="tools"><button class="icon-btn" data-up title="Move up" aria-label="Move up"' + (i === 0 ? " disabled" : "") + ">↑</button>" +
        '<button class="icon-btn" data-down title="Move down" aria-label="Move down"' + (i === blocks.length - 1 ? " disabled" : "") + ">↓</button>" +
        '<button class="icon-btn" data-dup title="Duplicate" aria-label="Duplicate">⧉</button>' +
        '<button class="icon-btn" data-del title="Delete" aria-label="Delete">✕</button></span></li>';
    }).join("") : '<li class="muted" style="cursor:default">No blocks yet. Add one below.</li>';
  }
  function indexOf(id) { for (var i = 0; i < blocks.length; i++) if (blocks[i].id === id) return i; return -1; }
  function newId() { return Math.random().toString(16).slice(2, 10); }

  /* Move, copy or delete a block: from the list here or from the bar on the block in the preview. Deleting can be undone. */
  function blockAction(act, id) {
    var i = indexOf(id); if (i < 0) return;
    if (act === "up" && i > 0) { blocks.splice(i - 1, 0, blocks.splice(i, 1)[0]); changed(); }
    else if (act === "down" && i < blocks.length - 1) { blocks.splice(i + 1, 0, blocks.splice(i, 1)[0]); changed(); }
    else if (act === "dup") { var copy = JSON.parse(JSON.stringify(blocks[i])); copy.id = newId(); blocks.splice(i + 1, 0, copy); selected = copy.id; changed(); drawPanel(); }
    else if (act === "del") {
      var name = TYPES[blocks[i].type].label;
      blocks.splice(i, 1); if (selected === id) selected = null; changed(); drawPanel();
      T.toast(name + " block deleted. Press Ctrl+Z (or ↶) to bring it back.");
    }
  }
  $("#blocks").addEventListener("click", function (e) {
    var li = e.target.closest("li[data-id]"); if (!li) return;
    var act = e.target.closest("[data-up]") ? "up" : e.target.closest("[data-down]") ? "down" : e.target.closest("[data-dup]") ? "dup" : e.target.closest("[data-del]") ? "del" : "";
    if (act) { blockAction(act, li.dataset.id); return; }
    select(li.dataset.id);
  });
  var dragId = null, dragKind = null;
  $("#blocks").addEventListener("dragstart", function (e) { var li = e.target.closest("li[data-id]"); if (li) { dragId = li.dataset.id; e.dataTransfer.effectAllowed = "move"; } });
  $("#blocks").addEventListener("dragover", function (e) {
    e.preventDefault();
    var over = e.target.closest("li");
    $$("#blocks li").forEach(function (li) { li.classList.toggle("drag-over", li === over); });
  });
  $("#blocks").addEventListener("dragleave", function (e) { if (!e.relatedTarget || !$("#blocks").contains(e.relatedTarget)) $$("#blocks li").forEach(function (li) { li.classList.remove("drag-over"); }); });
  $("#blocks").addEventListener("drop", function (e) {
    e.preventDefault();
    $$("#blocks li").forEach(function (li) { li.classList.remove("drag-over"); });
    var over = e.target.closest("li[data-id]");
    var to = over ? indexOf(over.dataset.id) : blocks.length;
    if (dragKind) { insertBlock(dragKind, to); dragKind = null; return; }        // dragged in from the palette
    var from = indexOf(dragId);
    if (from < 0 || from === to) return;
    var moved = blocks.splice(from, 1)[0];
    blocks.splice(from < to ? to - 1 : to, 0, moved);
    dragId = null; changed();
  });

  /* ---------- 3. The settings panel ---------- */
  function select(id) {
    selected = id;
    drawList();
    drawPanel();
    var frame = $("#frame").contentWindow;
    if (frame) frame.postMessage({ tenshi: "highlight", block: id }, location.origin);
  }

  /* The Theme panel: presets, colours, fonts, corners, spacing and the contrast check, shown live in the preview */
  var themeOpen = false, themeEditor = null, lastTokens = null;
  function drawThemePanel(panel) {
    var data = JSON.parse($("#theme-data").textContent);
    panel.innerHTML = '<div class="row" style="margin-bottom:6px"><h2 style="margin:0">Theme</h2><span style="flex:1"></span>' +
      '<button class="btn btn-small" data-back>Page settings</button></div>' +
      '<p class="small muted">Changes show in the preview straight away. Save to keep them; Publish to put them live.</p><div id="theme-editor"></div>' +
      (data.can_edit ? '<button class="btn btn-primary" id="theme-save" style="width:100%;margin-top:10px">Save theme</button>' : "");
    $("[data-back]", panel).onclick = function () { setThemeOpen(false); };
    themeEditor = TenshiTheme.mount($("#theme-editor", panel), data, { onPreview: function (res) { lastTokens = res; sendTokens(); },
      onScheme: function (v) { var f = $("#frame").contentWindow; if (f) f.postMessage({ tenshi: "scheme", value: v }, location.origin); } });
    if ($("#theme-save")) $("#theme-save").onclick = function () {
      var v = themeEditor.value(); v.lang = data.theme.lang;
      T.busy(this, T.api("POST", "/api/sites/" + siteId + "/settings", { theme: v }).then(function () {
        data.theme = v; $("#theme-data").textContent = JSON.stringify(data);
        T.toast("Theme saved. Publish to put it live."); lastTokens = null; reloadPreview();
      }));
    };
  }
  function sendTokens() {
    var frame = $("#frame").contentWindow;
    if (frame && lastTokens) frame.postMessage({ tenshi: "tokens", css: lastTokens.css, style: lastTokens.style }, location.origin);
  }
  function setThemeOpen(on) {
    themeOpen = on; $("#theme-btn").setAttribute("aria-pressed", String(on));
    if (on) { selected = null; drawList(); drawThemePanel($("#panel")); }
    else { if (lastTokens) { lastTokens = null; reloadPreview(); } drawPanel(); }
  }
  $("#theme-btn").addEventListener("click", function () { setThemeOpen(!themeOpen); });

  function drawPanel() {
    var panel = $("#panel");
    if (themeOpen && !selected) { drawThemePanel(panel); return; }
    if (themeOpen) { themeOpen = false; $("#theme-btn").setAttribute("aria-pressed", "false"); if (lastTokens) { lastTokens = null; reloadPreview(); } }
    var b = blocks[indexOf(selected)];
    if (!b) { drawPageSettings(panel); return; }
    var type = TYPES[b.type];
    panel.innerHTML = '<div class="row" style="margin-bottom:10px"><h2 style="margin:0">' + esc(type.label) + '</h2><span style="flex:1"></span>' +
      '<button class="btn btn-small" data-back>Page settings</button></div><p class="small muted">' + esc(type.about) + "</p>" +
      type.fields.map(function (f) { return fieldHtml(f, (b.data || {})[f.name]); }).join("") + hintFor(b.type);
    $("[data-back]", panel).onclick = function () { select(null); };
    $$("[data-f]", panel).forEach(function (input) {
      var update = function () {
        b.data = b.data || {};
        b.data[input.dataset.f] = input.type === "checkbox" ? input.checked : input.value;
        var preset = type.presets && type.presets[input.dataset.f] && type.presets[input.dataset.f][input.value];
        if (preset) {                       // a preset (e.g. the Form's "Start from"): fill in its settings and redraw
          Object.keys(preset).forEach(function (k) { b.data[k] = JSON.parse(JSON.stringify(preset[k])); });
          changed(); drawPanel(); return;
        }
        changed();
      };
      input.addEventListener(input.tagName === "SELECT" || input.type === "checkbox" ? "change" : "input", update);
    });
    $$(".media-field", panel).forEach(function (box) {
      if (box.closest(".items-field")) return;     // pictures inside a list item are wired by itemsField()
      T.mediaField(box, function (value) { b.data[box.dataset.name] = value ? +value : ""; changed(); });
    });
    $$(".items-field", panel).forEach(function (box) {
      var f = type.fields.filter(function (x) { return x.name === box.dataset.items; })[0];
      if (f) itemsField(box, b, f);
    });
  }

  /* An "items" field: a list of small forms (FAQ questions, pricing tiers) to add, remove and reorder.
     Each item is a <details>; its fields use data-sub (not data-f) and write into b.data[field][i]. */
  function itemsField(box, b, f) {
    b.data = b.data || {};
    if (!Array.isArray(b.data[f.name])) b.data[f.name] = [];
    var list = b.data[f.name], label = f.item_label || "Item";
    function sum(item) { var first = f.fields[0] && item[f.fields[0].name]; return first ? String(first).slice(0, 48) : ""; }
    function draw(openIndex) {
      $(".items", box).innerHTML = list.map(function (item, i) {
        return '<details class="item" data-i="' + i + '"' + (i === openIndex ? " open" : "") + '><summary draggable="true"><span class="grip" aria-hidden="true" title="Drag to reorder">⠿</span><b>' + esc(label) + " " + (i + 1) + '</b><span class="item-sum">' + esc(sum(item)) + "</span>" +
          '<span class="tools"><button type="button" class="icon-btn" data-item="up" aria-label="Move up"' + (i === 0 ? " disabled" : "") + ">↑</button>" +
          '<button type="button" class="icon-btn" data-item="down" aria-label="Move down"' + (i === list.length - 1 ? " disabled" : "") + ">↓</button>" +
          '<button type="button" class="icon-btn" data-item="del" aria-label="Remove">✕</button></span></summary><div class="item-body">' +
          f.fields.map(function (sf) {
            return fieldHtml(sf, item[sf.name]).replace(/data-f="/g, 'data-sub="').replace(/id="f-/g, 'id="f-' + f.name + i + "-");
          }).join("") + "</div></details>";
      }).join("") || '<p class="small muted">None yet.</p>';
      $("[data-add-item]", box).disabled = list.length >= (f.max || 50);
      $$(".item .media-field", box).forEach(function (mf) {     // a picture inside an item (team photo, logo …)
        var i = +mf.closest("[data-i]").dataset.i;
        T.mediaField(mf, function (value) { list[i][mf.dataset.name] = value ? +value : ""; changed(); });
      });
    }
    function update(e) {
      var input = e.target.closest("[data-sub]"), item = e.target.closest("[data-i]");
      if (!input || !item) return;
      var i = +item.dataset.i;
      list[i][input.dataset.sub] = input.type === "checkbox" ? input.checked : input.value;
      $(".item-sum", item).textContent = sum(list[i]);
      changed();
    }
    // Drag an item by its title to reorder (the arrows do the same from the keyboard)
    var dragFrom = null;
    box.addEventListener("dragstart", function (e) {
      var it = e.target.closest && e.target.closest(".item");
      if (!it || !box.contains(it) || e.target.tagName !== "SUMMARY") return;
      dragFrom = +it.dataset.i; e.dataTransfer.effectAllowed = "move"; e.stopPropagation();
      try { e.dataTransfer.setData("text/plain", "item"); } catch (err) {}
    });
    box.addEventListener("dragover", function (e) {
      if (dragFrom === null) return;
      e.preventDefault(); e.stopPropagation();
      var over = e.target.closest(".item");
      $$(".item", box).forEach(function (x) { x.classList.toggle("drag-over", x === over); });
    });
    box.addEventListener("drop", function (e) {
      if (dragFrom === null) return;
      e.preventDefault(); e.stopPropagation();
      var over = e.target.closest(".item"), to = over ? +over.dataset.i : list.length - 1;
      $$(".item", box).forEach(function (x) { x.classList.remove("drag-over"); });
      if (to !== dragFrom) { list.splice(to, 0, list.splice(dragFrom, 1)[0]); draw(to); changed(); }
      dragFrom = null;
    });
    box.addEventListener("dragend", function () { dragFrom = null; $$(".item", box).forEach(function (x) { x.classList.remove("drag-over"); }); });
    box.addEventListener("input", update);
    box.addEventListener("change", function (e) { if (e.target.tagName === "SELECT" || e.target.type === "checkbox") update(e); });
    box.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-item]");
      if (btn) {
        e.preventDefault();
        var i = +btn.closest("[data-i]").dataset.i, act = btn.dataset.item;
        if (act === "up" && i > 0) { list.splice(i - 1, 0, list.splice(i, 1)[0]); draw(i - 1); }
        else if (act === "down" && i < list.length - 1) { list.splice(i + 1, 0, list.splice(i, 1)[0]); draw(i + 1); }
        else if (act === "del" && confirm("Remove " + label.toLowerCase() + " " + (i + 1) + "?")) { list.splice(i, 1); draw(-1); }
        else return;
        changed(); return;
      }
      if (e.target.closest("[data-add-item]")) {
        list.push(JSON.parse(JSON.stringify(f.item || {}))); draw(list.length - 1); changed();
        var last = $(".item:last-child input, .item:last-child textarea", box); if (last) last.focus();
      }
    });
    draw(-1);
  }

  function fieldHtml(f, value) {
    var id = "f-" + f.name, v = value == null ? "" : value;
    switch (f.type) {
      case "textarea": return wrap(f, '<textarea id="' + id + '" data-f="' + f.name + '" rows="3">' + esc(v) + "</textarea>");
      case "rich": return wrap(f, '<textarea id="' + id + '" data-f="' + f.name + '" rows="7">' + esc(v) + '</textarea><small>Simple HTML is fine: &lt;p&gt;, &lt;b&gt;, &lt;a href=…&gt;, lists. Or click the text in the preview and type.</small>');
      case "html": return wrap(f, '<textarea id="' + id + '" data-f="' + f.name + '" class="code" rows="12" spellcheck="false" style="min-height:220px">' + esc(v) + "</textarea><small>Scripts and on…= attributes are removed when the page is drawn.</small>");
      case "number": return wrap(f, '<input type="number" min="1" id="' + id + '" data-f="' + f.name + '" value="' + esc(v) + '">');
      case "checkbox": return '<label class="check field"><input type="checkbox" data-f="' + f.name + '"' + (v ? " checked" : "") + "> " + esc(f.label) + "</label>";
      case "select": return wrap(f, select_(id, f.name, f.options, v));
      case "link": return wrap(f, select_(id, f.name, [["", "Choose a page…"]].concat(DATA.pages.map(function (p) { return [p.slug, p.title]; })), v)
                                + '<input type="text" data-f="' + f.name + '" value="' + esc(/^(https?:|mailto:|#)/.test(v) ? v : "") + '" placeholder="…or a web address (https://…)" style="margin-top:6px">');
      case "album": return wrap(f, select_(id, f.name, [["", "Choose an album…"]].concat(DATA.albums.map(function (a) { return [String(a.id), a.name]; })), String(v)) +
                                '<small><a href="/sites/' + siteId + '/galleries" target="_blank">Make or fill albums under Galleries</a></small>');
      case "category": return wrap(f, select_(id, f.name, [["", "All categories"]].concat(DATA.categories.map(function (c) { return [c, c]; })), v));
      case "collection": return wrap(f, select_(id, f.name, [["0", "Choose a content type…"]].concat((DATA.collections || []).map(function (c) { return [String(c.id), c.name]; })), String(v)) +
                                     '<small><a href="/sites/' + siteId + '/content" target="_blank">Make content types and add entries under Content types</a></small>');
      case "items": return '<div class="field items-field" data-items="' + f.name + '"><span>' + esc(f.label) + '</span><div class="items"></div>' +
                             '<button type="button" class="btn btn-small" data-add-item>+ Add ' + esc((f.item_label || "item").toLowerCase()) + "</button></div>";
      case "media": case "video":
        return '<div class="field"><span>' + esc(f.label) + '</span><div class="media-field" data-site="' + siteId + '" data-kind="' + (f.type === "video" ? "video" : "image") + '" data-name="' + f.name + '"><input type="hidden" value="' + esc(v) + '"></div></div>';
      default: return wrap(f, '<input type="text" id="' + id + '" data-f="' + f.name + '" value="' + esc(v) + '">');
    }
  }
  function wrap(f, inner) { return '<label class="field"><span>' + esc(f.label) + "</span>" + inner + "</label>"; }
  function select_(id, name, options, value) {
    return '<select id="' + id + '" data-f="' + name + '">' + options.map(function (o) {
      return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(value) ? " selected" : "") + ">" + esc(o[1]) + "</option>";
    }).join("") + "</select>";
  }
  function hintFor(type) {
    if (TYPES[type] && TYPES[type].hint) {     // widgets (cms/widgets/) bring their own line; {settings} = their settings page
      return '<p class="small muted" style="margin-top:14px">' + TYPES[type].hint.replace(/\{settings\}/g, "/sites/" + siteId + "/widgets/" + type) + "</p>";
    }
    var where = { services: "business", team: "business", testimonials: "business", contact: "business", portfolio: "portfolio", gallery: "galleries" }[type];
    if (!where) return "";
    var names = { business: "Business data", portfolio: "Portfolio", galleries: "Galleries" };
    return '<p class="small muted" style="margin-top:14px">This block fills itself from <a href="/sites/' + siteId + "/" + where + '" target="_blank">' + names[where] + "</a>. Change the content there and every page using it updates.</p>";
  }

  function drawPageSettings(panel) {
    panel.innerHTML = '<h2>Page settings</h2><p class="small muted">Select a block in the list or the preview to change it.</p>' +
      '<label class="field"><span>Title (in the menu)</span><input type="text" id="p-title" value="' + esc(page.title) + '"></label>' +
      (page.slug === "index" ? '<p class="small muted">This is the home page.</p>' :
        '<label class="field"><span>Address</span><input type="text" id="p-slug" value="' + esc(page.slug) + '"><small>Becomes ' + esc(page.slug) + '.html</small></label>') +
      '<label class="check field"><input type="checkbox" id="p-menu"' + (page.in_menu ? " checked" : "") + "> Show in the menu</label>" +
      '<h2 style="margin-top:16px">Search engines</h2>' +
      '<label class="field"><span>Title in Google</span><input type="text" id="p-seo-title" value="' + esc(page.seo_title) + '" placeholder="' + esc(page.title) + '"></label>' +
      '<label class="field"><span>Description in Google</span><textarea id="p-seo-desc" rows="3" maxlength="300">' + esc(page.seo_description) + '</textarea><small id="p-seo-n"></small></label>' +
      (page.slug === "index" ? "" : '<label class="field"><span>Go live at (optional)</span><input type="datetime-local" id="p-pub"><small>Leave empty to go live on the next Publish. With a time, the page goes live by itself then.</small></label>') +
      '<button class="btn btn-primary" id="p-save">Save page settings</button>' + langHtml() +
      '<h2 style="margin-top:22px">Earlier versions</h2><p class="small muted">A copy is kept each time you start editing (at most every 5 minutes; the newest 50).</p>' +
      '<div id="p-revs"><button class="btn btn-small" id="p-revs-load" type="button">Show earlier versions</button></div>';
    var count = function () { var n = $("#p-seo-desc").value.length; $("#p-seo-n").textContent = n + " characters" + (n > 160 ? " (Google shows about 155)" : ""); };
    $("#p-seo-desc").addEventListener("input", count); count();
    $("#p-revs-load").onclick = function () { loadRevisions(); };
    var pub = $("#p-pub");
    if (pub && page.publish_at) { var d = new Date(page.publish_at); pub.value = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
    $$("[data-translate]", panel).forEach(function (b) {
      b.onclick = function () {
        T.busy(b, T.api("POST", "/api/pages/" + pageId + "/translate", { lang: b.dataset.translate }).then(function (r) { location.href = r.url; }));
      };
    });
    $("#p-save").onclick = function () {
      var changes = { title: $("#p-title").value, in_menu: $("#p-menu").checked, seo_title: $("#p-seo-title").value, seo_description: $("#p-seo-desc").value };
      if ($("#p-slug")) changes.slug = $("#p-slug").value;
      if (pub) changes.publish_at = pub.value ? new Date(pub.value).toISOString() : "";
      T.busy(this, savePage(changes));
    };
  }

  function langHtml() {      // Languages (languages.py): this page in other languages
    var L = DATA.langs || {}; if (!L.extra || !L.extra.length) return "";
    var have = {}; (L.versions || []).forEach(function (v) { have[v.lang] = v; });
    var all = [L.main].concat(L.extra);
    return '<h2 style="margin-top:22px">Translations</h2><p class="small muted">This page in other languages. Visitors get a language switcher.</p><ul class="revs">' +
      all.map(function (code) {
        var v = have[code], name = (L.names || {})[code] || code;
        if (v && String(v.id) === String(pageId)) return "<li><span><b>" + esc(name) + "</b><small>this page</small></span></li>";
        if (v) return '<li><span><b>' + esc(name) + '</b><small>' + esc(v.title) + '</small></span><a class="btn btn-small" href="/sites/' + siteId + "/builder/" + v.id + '">Edit</a></li>';
        return '<li><span><b>' + esc(name) + '</b><small>not translated yet</small></span><button class="btn btn-small" type="button" data-translate="' + esc(code) + '">Translate</button></li>';
      }).join("") + "</ul>";
  }

  function loadRevisions() {
    var box = $("#p-revs");
    if (!box) return;
    T.api("GET", "/api/pages/" + pageId + "/revisions").then(function (res) {
      box.innerHTML = res.revisions.length ? '<ul class="revs">' + res.revisions.map(function (r) {
        var when = new Date(r.created_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
        return '<li><span><b>' + esc(when) + "</b><small>" + esc(r.user_name || "someone") + " · " + r.blocks + " block" + (r.blocks === 1 ? "" : "s") + "</small></span>" +
          '<button class="btn btn-small" type="button" data-restore="' + r.id + '">Restore</button></li>';
      }).join("") + "</ul>" : '<p class="small muted">No earlier versions yet. One is kept when you next change this page.</p>';
    });
    box.onclick = function (e) {
      var btn = e.target.closest("[data-restore]"); if (!btn) return;
      if (!confirm("Put this version back? The page as it is now is kept as a version too, so you can undo this.")) return;
      clearTimeout(saveTimer);
      T.busy(btn, saving.then(function () { return T.api("POST", "/api/pages/" + pageId + "/revisions/" + btn.dataset.restore + "/restore"); }).then(function (res) {
        blocks.length = 0; Array.prototype.push.apply(blocks, res.blocks);
        page.title = res.title; page.seo_title = res.seo_title; page.seo_description = res.seo_description;
        selected = null; drawList(); drawPanel(); reloadPreview(); loadRevisions();
        $("#save-state").textContent = "All changes saved";
        T.toast("Earlier version restored. Publish to put it live.");
      }));
    };
  }

  /* ---------- 4. The preview ---------- */
  function reloadPreview() {
    var frame = $("#frame");
    var y = 0;
    try { y = frame.contentWindow.scrollY; } catch (e) { /* not loaded yet */ }
    frame.onload = function () {
      try { frame.contentWindow.scrollTo(0, y); } catch (e) { /* ignore */ }
      if (selected) frame.contentWindow.postMessage({ tenshi: "highlight", block: selected }, location.origin);
      sendTokens();
    };
    frame.src = "/sites/" + siteId + "/preview/" + page.slug + "?edit=1&t=" + Date.now();
    $("#open-preview").href = "/sites/" + siteId + "/preview/" + page.slug;
  }
  window.addEventListener("message", function (e) {
    if (e.origin !== location.origin || !e.data || !e.data.tenshi) return;
    var msg = e.data;
    if (msg.tenshi === "select") select(msg.block);
    if (msg.tenshi === "edit") {
      var b = blocks[indexOf(msg.block)];
      if (!b) return;
      b.data = b.data || {};
      if (getPath(b.data, msg.field) === msg.value) return;
      setPath(b.data, msg.field, msg.value);
      if (selected === b.id) { var input = $('#panel [data-f="' + msg.field + '"]'); if (input && document.activeElement !== input) input.value = msg.value; }
      changed({ noReload: true, typing: true });            // the preview already shows the new words
    }
    if (msg.tenshi === "ready") {
      var labels = {}; Object.keys(TYPES).forEach(function (k) { labels[k] = TYPES[k].label; });
      e.source.postMessage({ tenshi: "labels", labels: labels }, location.origin);
      if (selected) e.source.postMessage({ tenshi: "highlight", block: selected, scroll: false }, location.origin);
    }
    if (msg.tenshi === "block") blockAction(msg.act, msg.block);
    if (msg.tenshi === "drop") onDrop(msg);
    if (msg.tenshi === "pick-media") {
      T.pickMedia(siteId, { kind: "image" }).then(function (items) { if (items.length) applyMedia(msg, items[0].id); });
    }
  });
  $$("[data-device]").forEach(function (b) {
    b.addEventListener("click", function () {
      $("#stage").className = "b-stage " + b.dataset.device;
      $$("[data-device]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
    });
  });
  $("#page-jump").addEventListener("change", function () { location.href = "/sites/" + siteId + "/builder/" + this.value; });

  /* ---------- 5. Adding blocks ---------- */
  function insertBlock(kind, at, data) {
    var block = { id: newId(), type: kind, data: Object.assign(JSON.parse(JSON.stringify(TYPES[kind].data || {})), data || {}) };
    if (at == null) { var i = indexOf(selected); at = i >= 0 ? i + 1 : blocks.length; }
    blocks.splice(at, 0, block);
    select(block.id);
    changed({ now: true });
  }
  $("#add-block").addEventListener("click", function () { $("#palette").hidden = !$("#palette").hidden; });
  $$("#palette [data-kind]").forEach(function (b) {
    b.addEventListener("click", function () { insertBlock(b.dataset.kind); });
    b.addEventListener("dragstart", function (e) {
      dragKind = b.dataset.kind; e.dataTransfer.effectAllowed = "copy";
      try { e.dataTransfer.setData("application/x-tenshi-block", b.dataset.kind); } catch (err) { /* old browsers: the list still works */ }
    });
    b.addEventListener("dragend", function () { setTimeout(function () { dragKind = null; }, 50); });
  });

  /* ---------- 6. Pictures and drag and drop onto the page ----------
     A photo dropped (or chosen) on a block goes into that block's picture: the exact slot when the design marks it
     (data-media="areas.0.image"), else the Nth picture field for the Nth picture in the block, else its first one.
     A block with no picture field gets a new Image block under it. */
  function mediaFields(type) { return (TYPES[type] && TYPES[type].fields || []).filter(function (f) { return f.type === "media"; }).map(function (f) { return f.name; }); }
  function applyMedia(where, mediaId, at) {
    var b = where.block ? blocks[indexOf(where.block)] : null;
    if (b) {
      var field = where.field, names = mediaFields(b.type);
      if (!field && names.length) field = names[Math.min(Math.max(where.index || 0, 0), names.length - 1)];
      if (field) {
        b.data = b.data || {};
        setPath(b.data, field, TYPES[b.type].widget ? String(mediaId) : +mediaId);
        selected = b.id; changed({ now: true }); drawPanel(); T.toast("Picture changed"); return;
      }
      at = indexOf(b.id) + 1;
    }
    insertBlock("image", at == null ? undefined : at, { image: +mediaId });
    T.toast("Image block added");
  }
  function uploadFiles(files) {
    var fd = new FormData(); files.forEach(function (f) { fd.append("files", f, f.name || "photo.jpg"); });
    T.toast("Uploading " + files.length + " photo" + (files.length === 1 ? "" : "s") + "…");
    return T.api("POST", "/api/sites/" + siteId + "/media", fd).then(function (res) {
      (res.errors || []).forEach(function (m) { T.toast(m, true); });
      loadPhotos(); return res.items || [];
    });
  }
  function onDrop(msg) {
    if (msg.what === "block" && TYPES[msg.value]) { insertBlock(msg.value, msg.at); return; }
    if (msg.what === "move") {
      var from = indexOf(msg.value); if (from < 0) return;
      var to = msg.at > from ? msg.at - 1 : msg.at; if (to === from) return;
      blocks.splice(to, 0, blocks.splice(from, 1)[0]); changed(); return;
    }
    if (msg.what === "media" && msg.value) { applyMedia(msg, msg.value, msg.at); return; }
    if (msg.what === "files" && msg.files && msg.files.length) {
      uploadFiles(msg.files).then(function (items) {
        if (!items.length) return;
        if (msg.block) { applyMedia(msg, items[0].id); items = items.slice(1); }
        var at = msg.block ? indexOf(msg.block) + 1 : msg.at;
        items.forEach(function (m, k) { insertBlock("image", at + k, { image: m.id }); });
      });
    }
  }

  /* The Photos tab: this site's pictures, to drag onto the page (or click to put in the selected block) */
  var photos = [];
  function loadPhotos() {
    var q = $("#photo-q") ? $("#photo-q").value : "";
    return T.api("GET", "/api/sites/" + siteId + "/media?kind=image&q=" + encodeURIComponent(q)).then(function (res) {
      photos = res.items || [];
      $("#photo-grid").innerHTML = photos.length ? photos.map(function (m) {
        return '<button type="button" class="ph" draggable="true" data-media="' + m.id + '" title="' + esc(m.title || m.filename) + '"><img src="' + esc(m.thumb) + '" alt="' + esc(m.alt || "") + '" loading="lazy"></button>';
      }).join("") : '<p class="small muted">No photos yet. Upload some, pick from stock, or drag photos from your computer onto the page.</p>';
    });
  }
  function setTab(name) {
    $$("[data-tab]").forEach(function (t) { t.setAttribute("aria-selected", String(t.dataset.tab === name)); });
    $("#tab-blocks").hidden = name !== "blocks"; $("#tab-photos").hidden = name !== "photos";
    if (name === "photos" && !photos.length) loadPhotos();
  }
  if ($("#photo-grid")) {
    $$("[data-tab]").forEach(function (t) { t.addEventListener("click", function () { setTab(t.dataset.tab); }); });
    $("#photo-q").addEventListener("input", function () { clearTimeout(this.t); this.t = setTimeout(loadPhotos, 250); });
    $("#photo-up").addEventListener("change", function () { if (this.files.length) uploadFiles(Array.prototype.slice.call(this.files)); this.value = ""; });
    $("#photo-stock").addEventListener("click", function () { if (window.TenshiStock) window.TenshiStock.pick(siteId).then(function (m) { if (m) loadPhotos(); }); });
    $("#photo-grid").addEventListener("dragstart", function (e) {
      var p = e.target.closest("[data-media]"); if (!p) return;
      e.dataTransfer.setData("application/x-tenshi-media", p.dataset.media); e.dataTransfer.effectAllowed = "copy";
    });
    $("#photo-grid").addEventListener("click", function (e) {
      var p = e.target.closest("[data-media]"); if (!p) return;
      if (selected) applyMedia({ block: selected }, p.dataset.media);
      else applyMedia({}, p.dataset.media);
    });
  }
  if ($("#undo")) { $("#undo").addEventListener("click", undo); $("#redo").addEventListener("click", redo); drawUndo(); }

  /* ---------- 7. Start ---------- */
  drawList();
  drawPanel();
})();
