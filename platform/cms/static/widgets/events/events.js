/* Events calendar (cms/widgets/events.py): list / month / week views from the block's JSON, and live places left. */
(function () {
  "use strict";
  var DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  function iso(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function parse(s) { var p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return "&#" + c.charCodeAt(0) + ";"; }); }
  function time(t) { if (!t) return ""; var h = +t.slice(0, 2), m = t.slice(3); return (h % 12 || 12) + (m === "00" ? "" : ":" + m) + (h < 12 ? " am" : " pm"); }
  function link(e) { return '<a href="' + esc(e.u) + '">' + (e.s ? '<span class="tw-cal-t">' + time(e.s) + "</span> " : "") + esc(e.t) + "</a>"; }

  function wire(root) {
    var dataEl = root.querySelector("[data-tw-cal-data]");
    var cal = root.querySelector("[data-tw-cal]"), list = root.querySelector("[data-tw-listview]"), views = root.querySelector("[data-tw-views]");
    if (dataEl && cal && views) {
      var data = JSON.parse(dataEl.textContent), today = parse(data.today), cursor = new Date(today), view = root.dataset.view || "list";
      var byDay = {};
      data.events.forEach(function (e) { (byDay[e.d] = byDay[e.d] || []).push(e); });
      var monday = function (d) { var x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
      var nav = function (label) {
        return '<div class="tw-cal-nav"><button type="button" class="tw-cbtn" data-cal="-1" aria-label="Previous ' + (view === "month" ? "month" : "week") + '">‹</button>' +
          '<h3 class="tw-cal-title" aria-live="polite">' + label + '</h3><button type="button" class="tw-cbtn" data-cal="1" aria-label="Next ' + (view === "month" ? "month" : "week") + '">›</button>' +
          '<button type="button" class="tw-chip" data-cal="0">Today</button></div>';
      };
      var drawMonth = function () {
        var first = new Date(cursor.getFullYear(), cursor.getMonth(), 1), start = monday(first), rows = "";
        for (var w = 0; w < 6; w++) {
          var cells = "";
          for (var i = 0; i < 7; i++) {
            var d = new Date(start); d.setDate(start.getDate() + w * 7 + i);
            var k = iso(d), evs = byDay[k] || [], out = d.getMonth() !== first.getMonth();
            cells += '<td class="' + (out ? "tw-cal-out " : "") + (k === data.today ? "tw-cal-today" : "") + '"' + (k === data.today ? ' aria-current="date"' : "") + '>' +
              '<span class="tw-cal-n">' + d.getDate() + '</span>' + (evs.length ? '<ul>' + evs.map(function (e) { return "<li>" + link(e) + "</li>"; }).join("") + "</ul>" : "") + "</td>";
          }
          rows += "<tr>" + cells + "</tr>";
          if (w >= 4 && new Date(start.getTime() + (w + 1) * 7 * 864e5).getMonth() !== first.getMonth()) break;
        }
        cal.innerHTML = nav(MONTHS[first.getMonth()] + " " + first.getFullYear()) +
          '<div class="tw-cal-wrap"><table class="tw-cal-month"><caption class="tw-sr">Events in ' + MONTHS[first.getMonth()] + " " + first.getFullYear() + "</caption><thead><tr>" +
          DAYS.map(function (x) { return '<th scope="col">' + x + "</th>"; }).join("") + "</tr></thead><tbody>" + rows + "</tbody></table></div>";
      };
      var drawWeek = function () {
        var start = monday(cursor), end = new Date(start); end.setDate(start.getDate() + 6), html = "";
        for (var i = 0; i < 7; i++) {
          var d = new Date(start); d.setDate(start.getDate() + i);
          var k = iso(d), evs = byDay[k] || [];
          html += '<li class="tw-cal-day' + (k === data.today ? " tw-cal-today" : "") + '"><h4>' + DAYS[i] + " " + d.getDate() + " " + MONTHS[d.getMonth()].slice(0, 3) + "</h4>" +
            (evs.length ? "<ul>" + evs.map(function (e) { return "<li>" + link(e) + (e.l ? '<span class="tw-note"> · ' + esc(e.l) + "</span>" : "") + "</li>"; }).join("") + "</ul>" : '<p class="tw-note">No events</p>') + "</li>";
        }
        cal.innerHTML = nav(start.getDate() + " " + MONTHS[start.getMonth()].slice(0, 3) + " – " + end.getDate() + " " + MONTHS[end.getMonth()].slice(0, 3) + " " + end.getFullYear()) +
          '<ol class="tw-cal-week">' + html + "</ol>";
      };
      var draw = function () {
        list.hidden = view !== "list"; cal.hidden = view === "list";
        if (view === "month") drawMonth(); else if (view === "week") drawWeek();
        Array.prototype.forEach.call(views.querySelectorAll("[data-tw-view]"), function (b) { b.setAttribute("aria-pressed", String(b.dataset.twView === view)); });
      };
      // open on the month/week of the next event if there's nothing this month
      var next = data.events.filter(function (e) { return e.d >= data.today; })[0];
      if (next && view !== "list") cursor = parse(next.d);
      views.hidden = false;
      views.addEventListener("click", function (e) { var b = e.target.closest("[data-tw-view]"); if (b) { view = b.dataset.twView; draw(); } });
      cal.addEventListener("click", function (e) {
        var b = e.target.closest("[data-cal]"); if (!b) return;
        var dir = +b.dataset.cal;
        if (!dir) cursor = new Date(today);
        else if (view === "month") cursor = new Date(cursor.getFullYear(), cursor.getMonth() + dir, 1);
        else cursor.setDate(cursor.getDate() + 7 * dir);
        draw();
        var focus = cal.querySelector('[data-cal="' + b.dataset.cal + '"]'); if (focus) focus.focus();
      });
      draw();
    }
    // places left (live site only: the server counts RSVPs)
    var spots = root.querySelectorAll("[data-tw-spots]");
    if (spots.length && root.dataset.status && !/\/preview\//.test(location.pathname) && location.protocol !== "file:") {
      fetch(root.dataset.status, { headers: { Accept: "application/json" } }).then(function (r) { return r.json(); }).then(function (res) {
        Array.prototype.forEach.call(spots, function (el) {
          var s = res.events && res.events[el.dataset.twSpots];
          if (!s || s.left === null) return;
          el.textContent = s.full ? "Full: RSVP to join the waitlist" : s.left + " place" + (s.left === 1 ? "" : "s") + " left";
          el.classList.toggle("tw-ev-full", s.full);
        });
      }).catch(function () {});
    }
  }
  Array.prototype.forEach.call(document.querySelectorAll("[data-tw-events]"), wire);
})();
