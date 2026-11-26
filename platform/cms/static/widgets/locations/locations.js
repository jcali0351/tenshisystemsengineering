/* Locations (cms/widgets/locations.py): "Show on map" moves the plain (iframe) map to that location. */
(function () {
  "use strict";
  Array.prototype.forEach.call(document.querySelectorAll("[data-tw-locs]"), function (root) {
    var frame = root.querySelector("iframe[data-tw-map-frame]"), btns = root.querySelectorAll("[data-tw-loc]");
    if (!frame || !btns.length) return;
    Array.prototype.forEach.call(btns, function (b) {
      b.hidden = false;
      b.addEventListener("click", function () {
        var f = root.querySelector("iframe[data-tw-map-frame]");
        if (f) f.src = b.dataset.twLoc;
        Array.prototype.forEach.call(btns, function (x) { x.setAttribute("aria-pressed", String(x === b)); });
      });
    });
  });
})();
