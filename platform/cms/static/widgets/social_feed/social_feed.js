/* Social feed (cms/widgets/social_feed.py): on the live site, refresh the cards from the server's cached copy. */
(function () {
  "use strict";
  var NAMES = { instagram: "Instagram", x: "X", youtube: "YouTube", bluesky: "Bluesky" };
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return "&#" + c.charCodeAt(0) + ";"; }); }
  function date(d) { return /^\d{4}-\d{2}-\d{2}$/.test(d || "") ? MONTHS[+d.slice(5, 7) - 1] + " " + (+d.slice(8)) + ", " + d.slice(0, 4) : ""; }
  Array.prototype.forEach.call(document.querySelectorAll("[data-tw-sf]"), function (root) {
    var list = root.querySelector("[data-tw-sf-list]");
    if (!list) return;
    fetch(root.dataset.twSf, { headers: { Accept: "application/json" } }).then(function (r) { return r.json(); }).then(function (res) {
      var items = (res.items || []).filter(function (i) { return /^https:\/\//.test(i.url || ""); });
      var first = list.querySelector("a");
      if (!items.length || (first && first.getAttribute("href") === items[0].url)) return;     // nothing new
      var showText = root.dataset.text === "1", net = NAMES[root.dataset.network] || "";
      list.innerHTML = items.map(function (i) {
        var img = /^https:\/\//.test(i.image || "") ? '<span class="tw-sf-pic"><img src="' + esc(i.image) + '" alt="" loading="lazy">' + (i.video ? '<span class="tw-sf-play" aria-hidden="true">▶</span>' : "") + "</span>" : "";
        var label = net + " post" + (i.date ? " from " + date(i.date) : "") + (i.text ? ": " + i.text.slice(0, 80) : "");
        return '<li class="tw-sf"><a href="' + esc(i.url) + '" target="_blank" rel="noopener noreferrer" aria-label="' + esc(label) + '">' + img +
          (showText && i.text ? '<span class="tw-sf-text">' + esc(i.text.slice(0, 280)) + "</span>" : "") + (i.date ? '<span class="tw-sf-date">' + date(i.date) + "</span>" : "") + "</a></li>";
      }).join("");
    }).catch(function () {});
  });
})();
