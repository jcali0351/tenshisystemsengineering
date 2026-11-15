/* Tenshi Editor: read and change translations.js as text, one entry at a time.
   The file keeps its layout (several keys on one line, comments): only the edited values change.
   Works in the browser (window.TenshiTR) and in Node (require), so tools can use it too. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.TenshiTR = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var LANGS = ["en", "ja", "ko", "de", "es", "zh", "ar", "pl", "pcm", "fa"];
  var STR = /(^|[\s,{])([A-Za-z_][A-Za-z0-9_]*): ("(?:[^"\\]|\\.)*")/g;

  /* Where each language's block starts and ends: { en: [start, end], ... } (end = index of the closing "\n  }") */
  function blocks(src) {
    var out = {}, re = /\n  ([a-z]{2,3}): \{\r?\n/g, m, starts = [];   // \r?: also reads a copy with Windows line endings
    while ((m = re.exec(src))) starts.push({ lang: m[1], at: m.index + m[0].length });
    starts.forEach(function (s) {
      var end = src.indexOf("\n  }", s.at);
      if (end < 0) throw new Error("translations.js: the " + s.lang + " block has no end.");
      out[s.lang] = [s.at, end];
    });
    return out;
  }

  /* All text as { en: { key: "text" }, ... } */
  function parse(src) {
    var b = blocks(src), out = {};
    Object.keys(b).forEach(function (lang) {
      var part = src.slice(b[lang][0], b[lang][1]), o = {}, m;
      STR.lastIndex = 0;
      while ((m = STR.exec(part))) o[m[2]] = JSON.parse(m[3]);
      out[lang] = o;
    });
    return out;
  }

  /* Escape like the rest of the file: JSON, but leave non-ASCII letters as they are. */
  function quote(value) { return JSON.stringify(String(value)); }

  /* Set one value. Changes it in place if the key exists, otherwise adds it at the end of that language's block. */
  function set(src, lang, key, value) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) throw new Error("Bad text key: " + key);
    var b = blocks(src)[lang];
    if (!b) throw new Error("translations.js has no " + lang + " block.");
    var part = src.slice(b[0], b[1]), m, re = new RegExp("(^|[\\s,{])" + key + ": (\"(?:[^\"\\\\]|\\\\.)*\")", "g");
    if ((m = re.exec(part))) {
      var at = b[0] + m.index + m[1].length + key.length + 2;
      return src.slice(0, at) + quote(value) + src.slice(at + m[2].length);
    }
    // new key: after the block's last entry (which has no trailing comma)
    var tail = src.slice(b[0], b[1]).replace(/\s+$/, "");
    var insertAt = b[0] + tail.length;
    var comma = /,$/.test(tail) ? "" : ",";
    return src.slice(0, insertAt) + comma + "\n    " + key + ": " + quote(value) + src.slice(insertAt);
  }

  return { LANGS: LANGS, parse: parse, set: set };
});
