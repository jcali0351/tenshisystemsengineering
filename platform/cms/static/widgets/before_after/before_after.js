/* Before & after (cms/widgets/before_after.py): the range input is the control (keyboard, screen readers); dragging
   the picture moves it too, also for top-to-bottom sliders where a sideways range wouldn't match the finger. */
(function () {
  "use strict";
  function wire(fig) {
    if (fig._tw) return; fig._tw = true;
    var range = fig.querySelector(".tw-ba-range"), frame = fig.querySelector(".tw-ba-frame"), vertical = fig.dataset.dir === "v";
    var labels = (range.getAttribute("aria-valuetext") || "").match(/% ([^,]+), \d+% (.+)$/) || [null, "before", "after"];
    var set = function (v) {
      v = Math.max(0, Math.min(100, Math.round(v)));
      range.value = v; fig.style.setProperty("--pos", v + "%");
      range.setAttribute("aria-valuetext", v + "% " + labels[1] + ", " + (100 - v) + "% " + labels[2]);
    };
    range.addEventListener("input", function () { set(+range.value); });
    if (vertical) {          // a sideways range can't follow an up-down drag: map the pointer ourselves
      range.style.pointerEvents = "none";
      var drag = false;
      var at = function (e) { var r = frame.getBoundingClientRect(); set((e.clientY - r.top) / r.height * 100); };
      frame.addEventListener("pointerdown", function (e) { drag = true; frame.setPointerCapture(e.pointerId); at(e); range.focus({ preventScroll: true }); });
      frame.addEventListener("pointermove", function (e) { if (drag) at(e); });
      frame.addEventListener("pointerup", function () { drag = false; });
      range.addEventListener("keydown", function (e) {   // up/down feel natural here
        if (e.key === "ArrowDown") { e.preventDefault(); set(+range.value + 5); } else if (e.key === "ArrowUp") { e.preventDefault(); set(+range.value - 5); }
      });
    }
  }
  Array.prototype.forEach.call(document.querySelectorAll("[data-tw-ba]"), wire);
})();
