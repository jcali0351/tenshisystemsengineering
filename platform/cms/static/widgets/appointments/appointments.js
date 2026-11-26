/* Appointments (cms/widgets/appointments.py): staff list follows the service; free times load for the chosen day. */
(function () {
  "use strict";
  Array.prototype.forEach.call(document.querySelectorAll("[data-tw-appt]"), function (root) {
    var form = root.querySelector("form"), svc = root.querySelector("[data-tw-service]"), staff = root.querySelector("[data-tw-staff]");
    var day = root.querySelector("[data-tw-date]"), box = root.querySelector("[data-tw-slots]");
    if (!form || !svc || !day || !box) return;
    var url = box.dataset.url, seq = 0;
    box.innerHTML = '<div class="tw-slots" role="radiogroup" aria-label="Free times"></div><p class="tw-note" data-tw-slots-msg aria-live="polite">Choose a day to see free times.</p>';
    var list = box.querySelector(".tw-slots"), msg = box.querySelector("[data-tw-slots-msg]");
    function filterStaff() {
      if (!staff) return;
      var name = (svc.options[svc.selectedIndex].text.split(" · ")[0] || "").toLowerCase();
      Array.prototype.forEach.call(staff.options, function (o) {
        if (!o.dataset.hasOwnProperty("does")) return;
        var does = o.dataset.does.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
        o.hidden = o.disabled = does.length > 0 && does.indexOf(name) < 0;
      });
      if (staff.selectedOptions[0] && staff.selectedOptions[0].disabled) staff.value = "any";
    }
    function load() {
      list.innerHTML = "";
      if (!day.value) { msg.textContent = "Choose a day to see free times."; return; }
      msg.textContent = "Looking for free times…";
      var mine = ++seq;
      var q = url + "&service=" + encodeURIComponent(svc.value) + "&date=" + encodeURIComponent(day.value) + (staff ? "&staff=" + encodeURIComponent(staff.value) : "");
      fetch(q, { headers: { Accept: "application/json" } }).then(function (r) { return r.json(); }).then(function (res) {
        if (mine !== seq) return;
        if (!res.ok) { msg.textContent = res.error || "Couldn't load times."; return; }
        if (!res.times.length) { msg.textContent = "No free times that day. Please try another day."; return; }
        msg.textContent = res.times.length + " free time" + (res.times.length === 1 ? "" : "s") + ".";
        list.innerHTML = res.times.map(function (t, i) {
          return '<label class="tw-slot"><input type="radio" name="time" value="' + t.t + '"' + (i === 0 ? " required" : "") + "><span>" + t.label + "</span></label>";
        }).join("");
      }).catch(function () { if (mine === seq) msg.textContent = "Couldn't load times. Check your connection and try again."; });
    }
    svc.addEventListener("change", function () { filterStaff(); load(); });
    if (staff) staff.addEventListener("change", load);
    day.addEventListener("change", load);
    form.addEventListener("tw:sent", function (e) { if (e.detail && e.detail.ok) load(); else if (e.detail && e.detail.field === "time") load(); });
    filterStaff();
    if (day.value) load();
  });
})();
