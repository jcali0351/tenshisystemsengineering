/* =====================================================================================================================
   PORTFOLIO (portfolio.html): the filter buttons and the Preview window of the Tenshi Design Gallery.
   The cards themselves are written by tools/build-pages.mjs from data/templates.json; the look is in portfolio.css.
   ===================================================================================================================== */
(function () {
  "use strict";
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var grid = $(".tpl-grid");
  if (!grid) return;                       // not the Portfolio page

  // The designs, as data (written into the page by the builder)
  var DATA = { groups: [], templates: [] };
  try { DATA = JSON.parse($("#tpl-data").textContent); } catch (e) { /* the cards still work without it */ }
  var byId = function (id) { return DATA.templates.filter(function (t) { return t.id === id; })[0]; };
  var groupName = function (id) { return (DATA.groups.filter(function (g) { return g.id === id; })[0] || {}).name || ""; };

  /* ---------- Filters: show only the designs for one kind of business ---------- */
  var chips = $$(".tpl-chip");
  var count = $(".tpl-count-n");
  function filter(group) {
    var shown = 0;
    $$(".tpl-card", grid).forEach(function (card) {
      var show = group === "all" || card.getAttribute("data-group") === group;
      card.hidden = !show;
      if (show) shown++;
    });
    chips.forEach(function (c) { c.setAttribute("aria-pressed", String(c.getAttribute("data-filter") === group)); });
    count.textContent = shown;
    count.parentNode.lastChild.textContent = shown === 1 ? " design" : " designs";
    // Remember the filter in the address, so it can be shared: portfolio.html#trades
    if (history.replaceState) history.replaceState(null, "", group === "all" ? location.pathname : "#" + group);
  }
  chips.forEach(function (c) { c.addEventListener("click", function () { filter(c.getAttribute("data-filter")); }); });
  // Arriving with a filter in the address (portfolio.html#food)
  var fromHash = location.hash.slice(1);
  if (fromHash && DATA.groups.some(function (g) { return g.id === fromHash; })) filter(fromHash);

  /* ---------- The Preview window ---------- */
  var dialog = $(".tpl-dialog");
  var stage = $(".tpl-dialog-stage", dialog);
  var opener = null;                       // the button that opened it, to give focus back on close

  function openPreview(id) {
    var t = byId(id);
    var card = $('.tpl-card[data-id="' + id + '"]', grid);
    if (!t || !card || !dialog.showModal) return;
    // The big picture is a copy of the card's little one
    stage.innerHTML = "";
    stage.appendChild($(".tpl-mock", card).cloneNode(true));
    $(".tpl-kicker", dialog).textContent = groupName(t.group);
    $("#tpl-dialog-title").textContent = t.name;
    $(".tpl-for", dialog).textContent = "For " + t.for.charAt(0).toLowerCase() + t.for.slice(1);
    $(".tpl-dialog-pages", dialog).innerHTML = "";
    t.pages.forEach(function (p) { var li = document.createElement("li"); li.textContent = p; $(".tpl-dialog-pages", dialog).appendChild(li); });
    $(".tpl-special", dialog).innerHTML = "";
    t.features.forEach(function (f) { var li = document.createElement("li"); li.textContent = f; $(".tpl-special", dialog).appendChild(li); });
    $(".tpl-dialog-launch", dialog).href = "launch.html?template=" + encodeURIComponent(t.id);
    setDevice("desktop");
    document.documentElement.classList.add("tpl-locked");
    dialog.showModal();
  }
  function setDevice(which) {
    stage.classList.toggle("is-mobile", which === "mobile");
    $$(".tpl-device button", dialog).forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-device") === which)); });
  }

  $$(".tpl-preview", grid).forEach(function (b) {
    b.addEventListener("click", function () { opener = b; openPreview(b.getAttribute("data-preview")); });
  });
  // Clicking the little picture opens the preview too
  $$(".tpl-card-media", grid).forEach(function (m) {
    m.style.cursor = "zoom-in";
    m.addEventListener("click", function () { var b = $(".tpl-preview", m.parentNode); opener = b; openPreview(b.getAttribute("data-preview")); });
  });
  $$(".tpl-device button", dialog).forEach(function (b) { b.addEventListener("click", function () { setDevice(b.getAttribute("data-device")); }); });
  $(".tpl-dialog-close", dialog).addEventListener("click", function () { dialog.close(); });
  dialog.addEventListener("click", function (e) { if (e.target === dialog) dialog.close(); });   // click outside closes
  dialog.addEventListener("close", function () {
    document.documentElement.classList.remove("tpl-locked");
    if (opener) opener.focus();
  });
})();
