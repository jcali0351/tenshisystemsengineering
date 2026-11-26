/* map.js: the Map widget (cms/widgets/map.py).
   - Several places: the buttons beside the map move the map there and update "Get directions" / "Open in maps".
   - With the site's Google Maps API key: loads the Maps JavaScript API when the map scrolls into view and shows every
     place as a marker in the theme's colour. If Google refuses the key, the plain iframe stays. */
(function () {
  "use strict";
  var STYLES = {
    muted: [{ stylers: [{ saturation: -80 }] }, { featureType: "poi", stylers: [{ visibility: "off" }] }],
    dark: [{ elementType: "geometry", stylers: [{ color: "#1f2430" }] }, { elementType: "labels.text.fill", stylers: [{ color: "#c9ccd6" }] },
      { elementType: "labels.text.stroke", stylers: [{ color: "#1f2430" }] }, { featureType: "road", elementType: "geometry", stylers: [{ color: "#3a4050" }] },
      { featureType: "water", elementType: "geometry", stylers: [{ color: "#11151d" }] }, { featureType: "poi", stylers: [{ visibility: "off" }] }]
  };
  function themeStyle(color) {
    return [{ stylers: [{ saturation: -60 }] }, { featureType: "water", elementType: "geometry", stylers: [{ color: color }, { lightness: 70 }] },
      { featureType: "poi", stylers: [{ visibility: "off" }] }, { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#ffffff" }] }];
  }
  function cssColor(el) {
    var c = getComputedStyle(el).getPropertyValue("--p").trim();
    return /^#[0-9a-f]{3,8}$/i.test(c) ? c : "#5b21b6";
  }
  function esc(s) { var d = document.createElement("div"); d.textContent = s || ""; return d.innerHTML; }

  function wireList(section) {
    var buttons = section.querySelectorAll(".tw-map-place");
    if (!buttons.length) return;
    var frame = section.querySelector("[data-tw-map-frame]"), dir = section.querySelector("[data-tw-dir]"), open = section.querySelector("[data-tw-open]");
    Array.prototype.forEach.call(buttons, function (b) {
      b.addEventListener("click", function () {
        Array.prototype.forEach.call(buttons, function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
        if (section._twFocus) section._twFocus(+b.getAttribute("data-i"));
        else if (frame) frame.src = b.getAttribute("data-embed");
        if (dir) dir.href = b.getAttribute("data-dir");
        if (open) open.href = b.getAttribute("data-open");
      });
    });
  }

  var loading = null;
  function loadGoogle(key) {
    if (window.google && window.google.maps) return Promise.resolve();
    if (loading) return loading;
    loading = new Promise(function (resolve, reject) {
      window.__twMapReady = resolve;
      window.gm_authFailure = function () { document.querySelectorAll(".tw-map-js").forEach(function (n) { n.remove(); }); };
      var s = document.createElement("script");
      s.src = "https://maps.googleapis.com/maps/api/js?key=" + encodeURIComponent(key) + "&callback=__twMapReady&loading=async";
      s.async = true; s.onerror = reject;
      document.head.appendChild(s);
    });
    return loading;
  }

  function jsMap(section, holder, cfg) {
    loadGoogle(cfg.key).then(function () {
      var g = window.google.maps, color = cssColor(section);
      var div = document.createElement("div");
      div.className = "tw-map-js";
      holder.appendChild(div);
      var map = new g.Map(div, { zoom: cfg.zoom, center: { lat: 0, lng: 0 }, mapTypeControl: false, streetViewControl: false,
        styles: cfg.style === "theme" ? themeStyle(color) : (STYLES[cfg.style] || null) });
      var info = new g.InfoWindow(), bounds = new g.LatLngBounds(), markers = [], geocoder = null, pending = cfg.places.length;
      var icon = { path: "M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z", fillColor: color, fillOpacity: 1,
        strokeColor: "#ffffff", strokeWeight: 2, scale: 1.1, anchor: new g.Point(12, 36) };
      function done() {
        if (--pending > 0 || !markers.length) return;
        if (markers.length === 1) { map.setCenter(markers[0].getPosition()); map.setZoom(cfg.zoom); } else map.fitBounds(bounds, 48);
      }
      function place(p, i, pos) {
        var m = new g.Marker({ map: map, position: pos, title: p.name || p.address, icon: icon });
        markers[i] = m; bounds.extend(pos);
        m.addListener("click", function () {
          info.setContent('<div class="tw-map-info"><b>' + esc(p.name || p.address) + "</b>" + (p.name && p.address ? "<br>" + esc(p.address) : "") +
            '<br><a href="' + esc(p.dir) + '" target="_blank" rel="noopener">Get directions</a></div>');
          info.open({ map: map, anchor: m });
        });
      }
      cfg.places.forEach(function (p, i) {
        if (p.lat && p.lon) { place(p, i, new g.LatLng(+p.lat, +p.lon)); done(); return; }
        geocoder = geocoder || new g.Geocoder();
        geocoder.geocode({ address: p.address }, function (res, status) {
          if (status === "OK" && res[0]) place(p, i, res[0].geometry.location);
          done();
        });
      });
      section._twFocus = function (i) {
        var m = markers[i];
        if (m) { map.panTo(m.getPosition()); map.setZoom(cfg.zoom); g.event.trigger(m, "click"); }
      };
    }).catch(function () { /* keep the iframe */ });
  }

  function init() {
    document.querySelectorAll(".tw-map").forEach(function (section) {
      wireList(section);
      var holder = section.querySelector("[data-tw-map]"), conf = holder && holder.querySelector("[data-tw-map-config]");
      if (!conf) return;
      var cfg;
      try { cfg = JSON.parse(conf.textContent); } catch (e) { return; }
      if (!cfg.key || !cfg.places || !cfg.places.length) return;
      if (!("IntersectionObserver" in window)) { jsMap(section, holder, cfg); return; }
      var io = new IntersectionObserver(function (entries) {
        if (entries.some(function (e) { return e.isIntersecting; })) { io.disconnect(); jsMap(section, holder, cfg); }
      }, { rootMargin: "200px" });
      io.observe(holder);
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
