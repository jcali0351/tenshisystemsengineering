/* Testimonials (cms/widgets/testimonials.py): on the live site, add reviews approved since the page was published. */
(function () {
  "use strict";
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return "&#" + c.charCodeAt(0) + ";"; }); }
  function initials(n) { return ((n || "").split(/\s+/).filter(Boolean).slice(0, 2).map(function (p) { return p[0]; }).join("") || "★").toUpperCase(); }
  Array.prototype.forEach.call(document.querySelectorAll("[data-tw-reviews]"), function (root) {
    var list = root.querySelector("[data-tw-tm-list]");
    if (!list) return;
    fetch(root.dataset.twReviews, { headers: { Accept: "application/json" } }).then(function (r) { return r.json(); }).then(function (res) {
      var stars = root.dataset.stars === "1", added = 0;
      (res.reviews || []).forEach(function (r) {
        if (root.querySelector('[data-review-id="' + r.id + '"]')) return;
        var li = document.createElement("li");
        li.className = "tw-tm"; li.dataset.reviewId = r.id;
        li.innerHTML = "<figure>" + (stars && r.rating ? '<span class="tw-stars" role="img" aria-label="' + r.rating + ' out of 5 stars"><span aria-hidden="true">' +
          "★★★★★".slice(0, r.rating) + "☆☆☆☆☆".slice(0, 5 - r.rating) + "</span></span>" : "") +
          "<blockquote><p>" + esc(r.quote) + '</p></blockquote><figcaption><span class="tw-tm-face tw-tm-init" aria-hidden="true">' + esc(initials(r.author)) +
          "</span><span><b>" + esc(r.author || "A customer") + "</b>" + (r.role ? '<span class="tw-tm-role">' + esc(r.role) + "</span>" : "") + "</span></figcaption></figure>";
        list.insertBefore(li, list.firstChild); added++;
      });
      if (added) list.dispatchEvent(new Event("scroll"));          // carousel buttons re-check their state
    }).catch(function () {});
  });
})();
