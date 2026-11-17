/* Share button settings (data/share.json): the list of networks the Tenshi Editor and tools/build-pages.mjs both use.
   Shareon 2.8.1 supplies most buttons; LINE and Hatena Bookmark are added here because Japan is a main audience and
   Shareon does not include them. Works in the browser (window.TenshiShare) and in Node (require). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.TenshiShare = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var DEFAULT_SITE = "https://jcali0351.github.io/tenshisystemsengineering";
  var DEFAULT_NETWORKS = ["twitter", "facebook", "linkedin", "line", "hatena", "reddit", "telegram", "whatsapp", "pocket", "copy-url", "web-share"];

  /* Official Shareon class names first (the defaults at the top), then LINE and Hatena, then the rest. */
  var NETWORKS = [
    { id: "twitter", label: "X (Twitter)", shareon: true },
    { id: "facebook", label: "Facebook", shareon: true },
    { id: "linkedin", label: "LinkedIn", shareon: true },
    { id: "line", label: "LINE", shareon: false },
    { id: "hatena", label: "Hatena Bookmark", shareon: false },
    { id: "reddit", label: "Reddit", shareon: true },
    { id: "telegram", label: "Telegram", shareon: true },
    { id: "whatsapp", label: "WhatsApp", shareon: true },
    { id: "pocket", label: "Pocket", shareon: true },
    { id: "copy-url", label: "Copy link", shareon: true },
    { id: "web-share", label: "Device share sheet", shareon: true, note: "Uses the browser's own share sheet. Hidden when the browser does not support it." },
    { id: "bluesky", label: "Bluesky", shareon: true },
    { id: "threads", label: "Threads", shareon: true },
    { id: "mastodon", label: "Mastodon", shareon: true },
    { id: "pinterest", label: "Pinterest", shareon: true },
    { id: "tumblr", label: "Tumblr", shareon: true },
    { id: "hackernews", label: "Hacker News", shareon: true },
    { id: "lobsters", label: "Lobsters", shareon: true },
    { id: "teams", label: "Microsoft Teams", shareon: true },
    { id: "viber", label: "Viber", shareon: true },
    { id: "vkontakte", label: "VK", shareon: true },
    { id: "odnoklassniki", label: "Odnoklassniki", shareon: true },
    { id: "fediverse", label: "Fediverse", shareon: true },
    { id: "messenger", label: "Messenger", shareon: true, note: "Needs a Facebook App ID to work." },
    { id: "email", label: "Email", shareon: true },
    { id: "print", label: "Print", shareon: true }
  ];

  var BY_ID = {};
  NETWORKS.forEach(function (n) { BY_ID[n.id] = n; });

  function customHref(id, url, title) {
    var u = encodeURIComponent(url || "");
    var t = encodeURIComponent(title || "");
    if (id === "line") return "https://social-plugins.line.me/lineit/share?url=" + u;
    if (id === "hatena") return "https://b.hatena.ne.jp/entry/panel/?url=" + u + "&btitle=" + t;
    return "";
  }

  function clean(d) {
    d = d || {};
    var seen = Object.create(null);
    var nets = Array.isArray(d.networks) ? d.networks : DEFAULT_NETWORKS.slice();
    nets = nets.filter(function (id) {
      if (!BY_ID[id] || seen[id]) return false;
      seen[id] = true;
      return true;
    });
    if (!nets.length) nets = DEFAULT_NETWORKS.slice();
    var disabled = Array.isArray(d.disabledPosts)
      ? d.disabledPosts.map(function (x) { return String(x || "").trim(); }).filter(Boolean)
      : [];
    var site = typeof d.siteUrl === "string" ? d.siteUrl.trim() : "";
    if (site) site = site.replace(/\/+$/, "");
    else site = DEFAULT_SITE;
    return {
      enabled: d.enabled !== false,
      siteUrl: site,
      heading: d.heading !== false,
      networks: nets,
      disabledPosts: disabled,
      fbAppId: typeof d.fbAppId === "string" ? d.fbAppId.trim() : ""
    };
  }

  function isDisabledOn(cfg, post) {
    if (!post) return false;
    var list = (cfg && cfg.disabledPosts) || [];
    var slug = post.slug || "";
    var id = post.id || "";
    return list.indexOf(slug) >= 0 || (id && list.indexOf(id) >= 0);
  }

  function canonicalUrl(cfg, post) {
    var base = (cfg && cfg.siteUrl) || DEFAULT_SITE;
    if (post && post.slug) return base + "/blog/" + post.slug + ".html";
    if (post && post.id) return base + "/blog.html#post-" + post.id;
    return base + "/blog.html";
  }

  return {
    DEFAULT_SITE: DEFAULT_SITE,
    DEFAULT_NETWORKS: DEFAULT_NETWORKS,
    NETWORKS: NETWORKS,
    BY_ID: BY_ID,
    customHref: customHref,
    clean: clean,
    isDisabledOn: isDisabledOn,
    canonicalUrl: canonicalUrl
  };
});
