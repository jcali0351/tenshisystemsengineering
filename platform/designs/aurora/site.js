/* The starter design's few moving parts, for visitors of the finished site:
   the phone menu, the lightbox, portfolio filters, the before/after slider and sending lead forms. */
(function () {
  "use strict";
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* Phone menu */
  var btn = document.querySelector(".menu-btn"), menu = document.getElementById("menu");
  if (btn && menu) btn.addEventListener("click", function () {
    var open = menu.classList.toggle("open");
    btn.setAttribute("aria-expanded", String(open));
  });

  /* Lightbox: any link inside [data-lightbox] that points at a picture opens it full screen */
  $$("[data-lightbox]").forEach(function (group) {
    var links = $$("a[href]", group).filter(function (a) { return /\.(jpe?g|png|webp|gif|svg)(\?|$)|\/m\//i.test(a.getAttribute("href")); });
    links.forEach(function (a, i) {
      a.addEventListener("click", function (e) { e.preventDefault(); open(i); });
    });
    function open(i) {
      var box = document.createElement("div");
      box.className = "lightbox"; box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true");
      box.innerHTML = '<figure><img alt=""><p></p></figure><button class="lb-prev" aria-label="Previous">‹</button>' +
        '<button class="lb-next" aria-label="Next">›</button><button class="lb-close" aria-label="Close">×</button>';
      var img = box.querySelector("img"), cap = box.querySelector("p");
      function show(n) {
        i = (n + links.length) % links.length;
        img.src = links[i].getAttribute("href");
        img.alt = (links[i].querySelector("img") || {}).alt || "";
        cap.textContent = links[i].getAttribute("data-caption") || "";
      }
      function close() { box.remove(); document.removeEventListener("keydown", keys); links[i].focus(); }
      function keys(e) { if (e.key === "Escape") close(); if (e.key === "ArrowRight") show(i + 1); if (e.key === "ArrowLeft") show(i - 1); }
      box.querySelector(".lb-close").onclick = close;
      box.querySelector(".lb-prev").onclick = function () { show(i - 1); };
      box.querySelector(".lb-next").onclick = function () { show(i + 1); };
      box.addEventListener("click", function (e) { if (e.target === box) close(); });
      document.addEventListener("keydown", keys);
      document.body.appendChild(box);
      show(i);
      box.querySelector(".lb-close").focus();
    }
  });

  /* Portfolio filters */
  $$(".filters").forEach(function (bar) {
    var works = $$(".work", bar.parentNode);
    $$("button", bar).forEach(function (b) {
      b.addEventListener("click", function () {
        var f = b.getAttribute("data-filter");
        works.forEach(function (w) { w.hidden = f !== "*" && w.getAttribute("data-category") !== f; });
        $$("button", bar).forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
      });
    });
  });

  /* Before / after: the invisible slider moves the dividing line */
  $$(".ba").forEach(function (ba) {
    var range = ba.querySelector(".ba-range");
    if (range) range.addEventListener("input", function () { ba.style.setProperty("--pos", range.value + "%"); });
  });

  /* Lead forms: on Tenshi hosting they send in the background and say thank you */
  $$("form.lead").forEach(function (form) {
    if (/^mailto:/.test(form.getAttribute("action") || "")) return;   // exported site: let the email app open
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var note = form.querySelector(".form-note");
      var button = form.querySelector("button[type=submit]");
      button.disabled = true;
      fetch(form.action, { method: "POST", body: new FormData(form) })
        .then(function (r) { if (!r.ok) throw new Error(); form.reset(); note.textContent = "Thank you! We'll be in touch soon."; })
        .catch(function () { note.textContent = "Sorry, that didn't send. Please call or email us instead."; })
        .then(function () { button.disabled = false; });
    });
  });
})();
