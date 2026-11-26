/* Share buttons / click to post (cms/widgets/share_buttons.py): use the address the visitor is on; "Copy link". */
(function () {
  "use strict";
  if (/\/preview\//.test(location.pathname)) return;           // in the CMS preview, keep the site's own address
  var here = location.href.split("#")[0];
  Array.prototype.forEach.call(document.querySelectorAll("[data-tw-share]"), function (root) {
    Array.prototype.forEach.call(root.querySelectorAll("a[data-share]"), function (a) {
      try {
        if (a.protocol === "mailto:") {
          a.href = a.href.replace(/(body=)([^&]*)/, function (m, k, v) { var t = decodeURIComponent(v).split("\n\n")[0]; return k + encodeURIComponent(t + "\n\n" + here); });
          return;
        }
        var u = new URL(a.href);
        ["u", "url"].forEach(function (k) { if (u.searchParams.has(k)) u.searchParams.set(k, here); });
        if (u.searchParams.has("text") && /wa\.me|bsky\.app/.test(u.hostname)) u.searchParams.set("text", (root.dataset.text ? root.dataset.text + " " : "") + here);
        a.href = u.toString();
      } catch (e) { /* keep the server's link */ }
    });
    var li = root.querySelector("[data-tw-copy-li]"), btn = root.querySelector("[data-tw-copy]");
    if (li && btn && navigator.clipboard) {
      li.hidden = false;
      btn.addEventListener("click", function () {
        navigator.clipboard.writeText(here).then(function () {
          var label = root.querySelector("[data-tw-copy-label]"), status = root.querySelector("[data-tw-copy-status]");
          if (label) { label.textContent = "Link copied"; setTimeout(function () { label.textContent = "Copy link"; }, 2000); }
          if (status) status.textContent = "Link copied";
        });
      });
    }
  });
})();
