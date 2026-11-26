/* Module kit (cms/widgets/modkit.py): filter chips + search, carousels, and forms sent to the site's /__w/ endpoints. */
(function () {
  "use strict";
  if (window.TwMod) return;
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* Filters: chips [data-tw-filter] and a [data-tw-search] box over items [data-tw-tags] (keys separated by |)
     with optional data-tw-text, all inside one [data-tw-filterable]. */
  function wireFilters(root) {
    if (root._tw) return; root._tw = true;
    var key = "", text = "";
    var apply = function (announce) {
      var items = $$("[data-tw-tags]", root), shown = 0;
      items.forEach(function (it) {
        var tags = (it.dataset.twTags || "").split("|"), hay = (it.dataset.twText || it.textContent || "").toLowerCase();
        var ok = (!key || tags.indexOf(key) >= 0) && (!text || hay.indexOf(text) >= 0);
        it.hidden = !ok; if (ok) shown++;
      });
      var out = root.querySelector("[data-tw-shown]");
      if (out && announce) out.textContent = shown === items.length ? "Showing all " + items.length : "Showing " + shown + " of " + items.length;
    };
    root.addEventListener("click", function (e) {
      var chip = e.target.closest("[data-tw-filter]");
      if (!chip || !root.contains(chip)) return;
      key = chip.dataset.twFilter;
      $$("[data-tw-filter]", root).forEach(function (c) { c.setAttribute("aria-pressed", String(c === chip)); });
      apply(true);
    });
    root.addEventListener("input", function (e) {
      if (!e.target.matches("[data-tw-search]")) return;
      text = e.target.value.trim().toLowerCase(); apply(true);
    });
  }

  /* Carousels: [data-tw-carousel] with a .tw-track and [data-tw-prev] / [data-tw-next] buttons */
  function wireCarousel(root) {
    if (root._tw) return; root._tw = true;
    var track = root.querySelector(".tw-track"), prev = root.querySelector("[data-tw-prev]"), next = root.querySelector("[data-tw-next]");
    if (!track) return;
    var update = function () {
      var max = track.scrollWidth - track.clientWidth - 2;
      if (prev) prev.disabled = track.scrollLeft <= 2;
      if (next) next.disabled = track.scrollLeft >= max;
    };
    var step = function (dir) { track.scrollBy({ left: dir * track.clientWidth * 0.9, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); };
    if (prev) prev.addEventListener("click", function () { step(-1); });
    if (next) next.addEventListener("click", function () { step(1); });
    track.addEventListener("scroll", function () { window.requestAnimationFrame(update); }, { passive: true });
    track.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight") { e.preventDefault(); step(1); } else if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
    });
    if (!track.hasAttribute("tabindex")) track.setAttribute("tabindex", "0");
    window.addEventListener("resize", update);
    update();
  }

  /* Forms: form[data-tw-form] posts to its action; the reply {ok, error, field, message} goes to [data-tw-status] */
  function send(form) {
    var status = form.querySelector("[data-tw-status]"), btn = form.querySelector("[type=submit]");
    var say = function (msg, ok) { if (status) { status.textContent = msg; status.className = "tw-status " + (ok ? "tw-ok" : "tw-bad"); } };
    $$("[aria-invalid]", form).forEach(function (x) { x.removeAttribute("aria-invalid"); });
    var bad = $$("[required]", form).filter(function (x) { return x.type === "checkbox" ? !x.checked : !String(x.value || "").trim(); })[0] ||
              $$("input[type=email]", form).filter(function (x) { return x.value && !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(x.value); })[0];
    if (bad) { bad.setAttribute("aria-invalid", "true"); bad.focus(); say("Please check this: " + ((bad.closest("label") || {}).textContent || bad.name).replace("*", "").trim(), false); return; }
    if (form.closest("[data-tw-demo]")) { say(form.dataset.ok || "Thank you!", true); return; }   // the CMS template preview
    if (btn) btn.disabled = true;
    say("Sending…", true);
    fetch(form.getAttribute("action"), { method: "POST", body: new URLSearchParams(new FormData(form)), headers: { Accept: "application/json" } })
      .then(function (r) { return r.json().catch(function () { return { ok: false }; }); })
      .then(function (res) {
        if (res.ok) {
          say(res.message || form.dataset.ok || "Thank you!", true);
          form.dispatchEvent(new CustomEvent("tw:sent", { detail: res, bubbles: true }));
          if (!form.hasAttribute("data-tw-keep")) form.reset();
        } else {
          say(res.error || "That didn't send. Please try again.", false);
          var f = res.field && form.elements[res.field];
          if (f && f.focus) { f.setAttribute("aria-invalid", "true"); f.focus(); }
        }
      })
      .catch(function () { say("That didn't send. Check your connection and try again.", false); })
      .then(function () { if (btn) btn.disabled = false; });
  }
  document.addEventListener("submit", function (e) {
    var form = e.target.closest && e.target.closest("form[data-tw-form]");
    if (!form) return;
    e.preventDefault(); send(form);
  });

  function init(root) {
    $$("[data-tw-filterable]", root).forEach(wireFilters);
    $$("[data-tw-carousel]", root).forEach(wireCarousel);
  }
  init(document);
  window.TwMod = { init: init, send: send };
})();
