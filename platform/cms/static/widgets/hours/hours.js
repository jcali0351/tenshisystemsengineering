/* Opening hours (cms/widgets/hours.py): "Open now · closes 5 pm" in the SITE's time zone, whatever the visitor's. */
(function () {
  "use strict";
  var KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"], NAMES = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
  function fmt(t) { var h = +t.slice(0, 2), m = t.slice(3); return (h % 12 || 12) + (m === "00" ? "" : ":" + m) + " " + (h < 12 ? "am" : "pm"); }
  function mins(t) { return +t.slice(0, 2) * 60 + +t.slice(3); }
  function local(tz) {          // the site's date and minutes past midnight, now
    var parts = {};
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" })
      .formatToParts(new Date()).forEach(function (p) { parts[p.type] = p.value; });
    return { date: parts.year + "-" + parts.month + "-" + parts.day, min: +parts.hour * 60 + +parts.minute, dow: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday) };
  }
  function addDays(iso, n) { var d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function spans(data, iso, dow) { return data.holidays.hasOwnProperty(iso) ? data.holidays[iso] : (data.week[KEYS[dow]] || []); }
  function state(data) {
    var now = local(data.tz);
    // still open from yesterday's late span?
    var y = spans(data, addDays(now.date, -1), (now.dow + 6) % 7);
    for (var i = 0; i < y.length; i++) if (mins(y[i][1]) < mins(y[i][0]) && now.min < mins(y[i][1])) return { open: true, until: y[i][1] };
    var t = spans(data, now.date, now.dow);
    for (i = 0; i < t.length; i++) {
      var o = mins(t[i][0]), c = mins(t[i][1]);
      if (c <= o ? now.min >= o : now.min >= o && now.min < c) return { open: true, until: t[i][1] };
    }
    for (var d = 0; d < 8; d++) {         // next opening
      var iso = addDays(now.date, d), dow = (now.dow + d) % 7, s = spans(data, iso, dow);
      for (i = 0; i < s.length; i++) if (d > 0 || mins(s[i][0]) > now.min) return { open: false, next: s[i][0], day: d === 0 ? "today" : d === 1 ? "tomorrow" : NAMES[KEYS[dow]] };
    }
    return { open: false };
  }
  Array.prototype.forEach.call(document.querySelectorAll("[data-tw-hours]"), function (root) {
    var el = root.querySelector("[data-tw-hours-data]");
    if (!el) return;
    var data = JSON.parse(el.textContent), badge = root.querySelector("[data-tw-open]");
    var draw = function () {
      var s = state(data), now = local(data.tz);
      if (badge) {
        badge.hidden = false;
        badge.className = "tw-open " + (s.open ? "tw-open-yes" : "tw-open-no");
        badge.innerHTML = s.open ? "<b>Open now</b> · closes " + fmt(s.until) : "<b>Closed</b>" + (s.next ? " · opens " + s.day + " " + fmt(s.next) : "");
      }
      Array.prototype.forEach.call(root.querySelectorAll("tr[data-day]"), function (tr) {
        var today = tr.dataset.day === KEYS[now.dow];
        tr.classList.toggle("tw-today", today);
        if (today) tr.setAttribute("aria-current", "date"); else tr.removeAttribute("aria-current");
      });
    };
    draw();
    setInterval(draw, 60000);
  });
})();
