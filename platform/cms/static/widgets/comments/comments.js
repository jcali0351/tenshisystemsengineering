/* Comments (widgets/comments.py): on the live site, newly approved comments appear without publishing again. */
(function () {
  "use strict";
  Array.prototype.forEach.call(document.querySelectorAll("[data-tw-comments]"), function (box) {
    if (/\/preview\//.test(location.pathname)) return;
    var form = box.querySelector("form[data-tw-form]") || box.querySelector("form");
    var key = form ? (form.querySelector("[name=_block]") || {}).value : "";
    fetch("__w/comments/list?post=" + encodeURIComponent(box.dataset.twComments) + (key ? "&_block=" + encodeURIComponent(key) : ""), { credentials: "same-origin" })
      .then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
        if (!d || !d.ok || !d.count) return;
        box.querySelector(".tw-cm-list").innerHTML = d.html;
        var none = box.querySelector(".tw-cm-none"); if (none) none.remove();
        box.querySelector(".tw-cm-n").textContent = d.count;
      }).catch(function () {});
  });
})();
