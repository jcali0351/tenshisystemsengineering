/* =====================================================================================================================
   cms.js: helpers every CMS screen uses. Loaded on every page as window.Tenshi.
     Tenshi.api(method, url, body)   talk to the CMS API (adds the X-Tenshi safety header; shows errors)
     Tenshi.toast(text, isError)     a short message in the corner
     Tenshi.pickMedia(siteId, opts)  the Media Picker: choose (or upload) pictures from the Media Center, or from stock
     Tenshi.esc(text)                make text safe to put in HTML
   ===================================================================================================================== */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  /* A short message in the bottom-right corner */
  var timer;
  function toast(text, isError) {
    var t = $("#toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
    t.textContent = text; t.classList.toggle("err", !!isError); t.classList.add("show");
    clearTimeout(timer); timer = setTimeout(function () { t.classList.remove("show"); }, isError ? 7000 : 3000);
  }

  /* Call the API. body may be an object (sent as JSON) or FormData (for uploads). Returns the answer as an object. */
  function api(method, url, body) {
    var opts = { method: method, headers: { "X-Tenshi": "1" }, credentials: "same-origin" };
    if (body instanceof FormData) opts.body = body;
    else if (body !== undefined) { opts.body = JSON.stringify(body); opts.headers["Content-Type"] = "application/json"; }
    return fetch(url, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (r.status === 401) { location.href = "/login?next=" + encodeURIComponent(location.pathname); throw new Error("Signed out"); }
        if (!r.ok) { var msg = data.error || data.detail || ("Something went wrong (" + r.status + ")"); toast(msg, true); throw new Error(msg); }
        return data;
      });
    });
  }

  /* Run an async action from a button, showing it's busy */
  function busy(button, promise) {
    if (button) button.classList.add("busy");
    return Promise.resolve(promise).finally(function () { if (button) button.classList.remove("busy"); });
  }

  /* ---------- The Media Picker ----------
     Tenshi.pickMedia(siteId, { kind: "image" | "video" | "", multiple: false }).then(function (items) { … })
     Shows the site's Media Center files, lets you search and upload, and returns the chosen files ([] if cancelled). */
  function pickMedia(siteId, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var dlg = document.createElement("dialog");
      dlg.className = "wide";
      dlg.innerHTML =
        '<div class="dlg"><div class="row" style="margin-bottom:12px"><h2 style="margin:0">Choose ' + (opts.multiple ? "files" : "a file") + '</h2>' +
        '<input type="search" placeholder="Search" style="max-width:240px;margin-left:auto">' +
        (opts.kind === "image" || !opts.kind ? '<button type="button" class="btn" data-stock>Choose from stock</button>' : "") +
        '<label class="btn btn-primary">Upload<input type="file" multiple hidden></label></div>' +
        '<div class="mgrid" style="max-height:60vh;overflow:auto"></div></div>' +
        '<div class="dlg-foot"><span class="muted small picked"></span><span style="flex:1"></span>' +
        '<button class="btn" data-close>Cancel</button><button class="btn btn-primary" data-ok disabled>Choose</button></div>';
      document.body.appendChild(dlg);
      var grid = $(".mgrid", dlg), search = $("input[type=search]", dlg), chosen = [], items = [];
      function load() {
        api("GET", "/api/sites/" + siteId + "/media?kind=" + encodeURIComponent(opts.kind || "") + "&q=" + encodeURIComponent(search.value)).then(function (data) {
          items = data.items;
          grid.innerHTML = items.length ? items.map(function (m) {
            var pic = (m.kind === "image" || m.kind === "svg") ? '<img src="' + esc(m.thumb) + '" alt="" loading="lazy">' : '<span class="kind">' + esc(m.kind.toUpperCase()) + "</span>";
            return '<div class="mitem' + (chosen.indexOf(m.id) >= 0 ? " on" : "") + '" data-id="' + m.id + '"><div class="thumb">' + pic + '</div><div class="name">' + esc(m.title || m.filename) + "</div></div>";
          }).join("") : '<p class="empty">No files yet. Upload some with the button above.</p>';
        });
      }
      grid.addEventListener("click", function (e) {
        var el = e.target.closest(".mitem"); if (!el) return;
        var id = +el.dataset.id;
        if (opts.multiple) { var i = chosen.indexOf(id); if (i >= 0) chosen.splice(i, 1); else chosen.push(id); }
        else chosen = [id];
        $$(".mitem", grid).forEach(function (x) { x.classList.toggle("on", chosen.indexOf(+x.dataset.id) >= 0); });
        $("[data-ok]", dlg).disabled = !chosen.length;
        $(".picked", dlg).textContent = chosen.length ? chosen.length + " chosen" : "";
      });
      grid.addEventListener("dblclick", function (e) { if (!opts.multiple && e.target.closest(".mitem")) $("[data-ok]", dlg).click(); });
      search.addEventListener("input", function () { clearTimeout(search.t); search.t = setTimeout(load, 250); });
      $("input[type=file]", dlg).addEventListener("change", function (e) {
        var fd = new FormData(); Array.prototype.forEach.call(e.target.files, function (f) { fd.append("files", f); });
        toast("Uploading…");
        api("POST", "/api/sites/" + siteId + "/media", fd).then(function (res) {
          res.errors.forEach(function (msg) { toast(msg, true); });
          res.items.forEach(function (m) { if (opts.multiple || !chosen.length) chosen.push(m.id); });
          if (!opts.multiple) chosen = chosen.slice(-1);
          $("[data-ok]", dlg).disabled = !chosen.length;
          load();
        });
      });
      function finish(result) { dlg.close(); dlg.remove(); resolve(result); }
      var stockBtn = $("[data-stock]", dlg);          /* the shared Stock Photo Library (static/stock-picker.js) */
      if (stockBtn) stockBtn.onclick = function () {
        if (!window.TenshiStock) return;
        window.TenshiStock.pick(siteId).then(function (m) {
          if (!m) return;
          if (!opts.multiple) { finish([m]); return; }
          chosen.push(m.id); $("[data-ok]", dlg).disabled = false; load();
        });
      };
      $("[data-close]", dlg).onclick = function () { finish([]); };
      $("[data-ok]", dlg).onclick = function () { finish(items.filter(function (m) { return chosen.indexOf(m.id) >= 0; })); };
      dlg.addEventListener("cancel", function (e) { e.preventDefault(); finish([]); });
      dlg.showModal();
      load();
    });
  }

  /* A media field: a small picture, plus Choose / Remove. <div class="media-field" data-site="1" data-kind="image"><input type="hidden" …></div> */
  function mediaField(box, onChange) {
    var input = $("input", box), siteId = box.dataset.site, kind = box.dataset.kind || "image";
    function draw(url) {
      $$(".mf-ui", box).forEach(function (x) { x.remove(); });
      var ui = document.createElement("span"); ui.className = "mf-ui row";
      ui.innerHTML = (url ? '<img src="' + esc(url) + '" alt="">' : '<span class="none">' + (input.value ? "File #" + esc(input.value) : "None") + "</span>") +
        '<button type="button" class="btn btn-small" data-choose>Choose</button>' +
        (kind === "image" && window.TenshiStock ? '<button type="button" class="btn btn-small" data-stock>From stock</button>' : "") + (input.value ? '<button type="button" class="btn btn-small" data-clear>Remove</button>' : "");
      box.appendChild(ui);
      $("[data-choose]", ui).onclick = function () {
        pickMedia(siteId, { kind: kind }).then(function (items) {
          if (!items.length) return;
          input.value = items[0].id; draw(items[0].kind === "image" || items[0].kind === "svg" ? items[0].thumb : ""); if (onChange) onChange(input.value);
        });
      };
      var stock = $("[data-stock]", ui);
      if (stock) stock.onclick = function () {
        window.TenshiStock.pick(siteId).then(function (m) {
          if (!m) return;
          input.value = m.id; draw(m.thumb); if (onChange) onChange(input.value);
        });
      };
      var clear = $("[data-clear]", ui);
      if (clear) clear.onclick = function () { input.value = ""; draw(""); if (onChange) onChange(""); };
    }
    if (input.value) api("GET", "/api/media/" + input.value).then(function (m) { draw(m.kind === "image" || m.kind === "svg" ? m.thumb : ""); }).catch(function () { draw(""); });
    else draw("");
  }

  /* Phone menu, site switcher */
  document.addEventListener("click", function (e) {
    if (e.target.closest(".menu-toggle")) $(".side").classList.toggle("open");
  });
  var switcher = $("#site-switch");
  if (switcher) switcher.addEventListener("change", function () {
    location.href = switcher.value ? "/sites/" + switcher.value : "/sites";
  });

  /* Buttons with data-action="deploy|backup" work on any page that has them */
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-deploy]");
    if (!b) return;
    busy(b, api("POST", "/api/sites/" + b.dataset.deploy + "/deploy", { note: b.dataset.note || "" }).then(function (res) {
      toast("Live in " + res.build.seconds.toFixed(2) + " s: " + res.url);
      setTimeout(function () { location.reload(); }, 900);
    }));
  });

  window.Tenshi = { api: api, toast: toast, busy: busy, esc: esc, pickMedia: pickMedia, mediaField: mediaField, $: $, $$: $$ };
})();
