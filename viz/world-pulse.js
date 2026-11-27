/* World Pulse: a live 3D globe of the world's networks, drawn in fine particles (plain WebGL2, no libraries).
   Static layers come from data/globe/world.json (tools/globe-data.mjs), markets from data/globe/markets.json
   (tools/globe-markets.mjs); aircraft, ships, trains and road counts are fetched live in the visitor's browser. */
(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const EMBED = /[?&]embed/.test(location.search);
  if (EMBED) { document.body.classList.add("embed"); $("#panel").open = false; }
  const SMALL = Math.min(innerWidth, innerHeight) < 620;
  if (SMALL) $("#panel").open = false;
  const canvas = $("#gl");
  const gl = canvas.getContext("webgl2", { antialias: true, alpha: false, powerPreference: "high-performance" });
  if (!gl) { const m = $("#msg"); m.style.display = "grid"; m.textContent = "This visualization needs WebGL 2, which this browser doesn't offer."; return; }

  /* ---------- maths ---------- */
  const DEG = Math.PI / 180, EARTH = 6371000;
  const ll = (lon, lat, r = 1) => { const a = lat * DEG, b = lon * DEG, c = Math.cos(a); return [r * c * Math.sin(b), r * Math.sin(a), r * c * Math.cos(b)]; };
  const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const persp = (fovy, asp, n, f) => { const t = 1 / Math.tan(fovy / 2); return [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, (2 * f * n) / (n - f), 0]; };
  const lookAt = (eye) => { const z = norm(eye), x = norm(cross([0, 1, 0], z)), y = cross(z, x); return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1]; };
  const mul = (a, b) => { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]; return o; };
  // East and north unit vectors at a place, to turn a compass heading into a direction on the sphere.
  const heading = (lon, lat, trk) => { const a = lat * DEG, b = lon * DEG, t = trk * DEG, e = [Math.cos(b), 0, -Math.sin(b)], n = [-Math.sin(a) * Math.sin(b), Math.cos(a), -Math.sin(a) * Math.cos(b)]; return [n[0] * Math.cos(t) + e[0] * Math.sin(t), n[1] * Math.cos(t) + e[1] * Math.sin(t), n[2] * Math.cos(t) + e[2] * Math.sin(t)]; };
  const rnd = Math.random;

  /* ---------- WebGL helpers ---------- */
  function program(vs, fs) {
    const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, "#version 300 es\nprecision highp float;\n" + src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error("shader:", gl.getShaderInfoLog(s), src); return s; };
    const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) console.error("link:", gl.getProgramInfoLog(p));
    const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const name = gl.getActiveUniform(p, i).name; u[name] = gl.getUniformLocation(p, name); }
    return { p, u };
  }
  // A drawable: one interleaved float buffer; layout = [[attribute name, floats], ...].
  function mesh(prog, layout, data, mode, dynamic) {
    const vao = gl.createVertexArray(), buf = gl.createBuffer(), stride = layout.reduce((n, l) => n + l[1], 0);
    gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    let off = 0;
    for (const [name, size] of layout) { const loc = gl.getAttribLocation(prog.p, name); if (loc >= 0) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride * 4, off * 4); } off += size; }
    const m = { vao, buf, stride, mode, count: 0, prog,
      set(arr) { const f = arr instanceof Float32Array ? arr : new Float32Array(arr); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, f, dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW); m.count = f.length / stride; } };
    if (data) m.set(data);
    gl.bindVertexArray(null);
    return m;
  }

  // Shared: how visible a place on the globe is from the camera (the far side shows through very faintly).
  const VIS = `uniform vec3 uCam; float vis(vec3 n){ return mix(0.05, 1.0, smoothstep(-0.03, 0.05, dot(n, uCam) - 1.0)); }`;
  const DOT_FS = `in vec4 vColor; out vec4 o; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.12, d); o = vec4(vColor.rgb, vColor.a * a); }`;

  const P_POINT = program(`in vec3 aPos; in vec4 aColor; in float aSize; in float aSeed;
    uniform mat4 uMVP; uniform float uTime, uPx, uLift, uReveal, uSunMix, uTwinkle; uniform vec3 uSun; ${VIS}
    out vec4 vColor;
    void main(){ vec3 n = normalize(aPos); gl_Position = uMVP * vec4(aPos * (1.0 + uLift), 1.0);
      float tw = 1.0 - uTwinkle * (0.5 + 0.5 * sin(uTime * (1.0 + aSeed * 2.0) + aSeed * 60.0));
      float day = smoothstep(-0.12, 0.2, dot(n, uSun));
      vec3 c = mix(aColor.rgb, mix(aColor.rgb * vec3(0.42, 0.34, 0.75), aColor.rgb * vec3(1.0, 1.08, 1.25) + 0.08, day), uSunMix);
      float show = step(aSeed, uReveal * 1.02);
      vColor = vec4(c, aColor.a * vis(n) * tw * show); gl_PointSize = max(1.0, aSize * uPx); }`, DOT_FS);

  const P_LINE = program(`in vec3 aPos; in vec4 aColor; in float aDist;
    uniform mat4 uMVP; uniform float uLift; ${VIS}
    out vec4 vColor; out float vDist;
    void main(){ vec3 n = normalize(aPos); gl_Position = uMVP * vec4(aPos * (1.0 + uLift), 1.0); vColor = vec4(aColor.rgb, aColor.a * vis(n)); vDist = aDist; }`,
    `in vec4 vColor; in float vDist; uniform float uTime, uPulse, uFreq, uSpeed; uniform vec3 uHot; out vec4 o;
    void main(){ float w = pow(0.5 + 0.5 * sin(vDist * uFreq - uTime * uSpeed), 14.0) * uPulse; o = vec4(mix(vColor.rgb, uHot, clamp(w, 0.0, 1.0)), vColor.a * (1.0 + w * 3.0)); }`);

  // Particles that travel along a great-circle arc from A to B (airline routes).
  const P_FLOW = program(`in vec3 aA; in vec3 aB; in float aPhase; in float aSpeed; in vec4 aColor; in float aSize;
    uniform mat4 uMVP; uniform float uTime, uPx; ${VIS}
    out vec4 vColor;
    void main(){ float t = fract(aPhase + uTime * aSpeed); float w = acos(clamp(dot(aA, aB), -1.0, 1.0)); float s = max(sin(w), 1e-4);
      vec3 p = (sin((1.0 - t) * w) * aA + sin(t * w) * aB) / s; float lift = 1.0 + (0.012 + w * 0.07) * sin(3.14159 * t);
      gl_Position = uMVP * vec4(p * lift, 1.0); vColor = vec4(aColor.rgb, aColor.a * vis(p) * sin(3.14159 * t)); gl_PointSize = max(1.0, aSize * uPx); }`, DOT_FS);

  // Things that move (aircraft, ships, trains): last known place + velocity, carried forward in the shader, with a fading trail.
  const P_MOVER = program(`in vec3 aPos; in vec3 aVel; in float aT0; in float aLag; in vec4 aColor; in float aSize; in float aAlt;
    uniform mat4 uMVP; uniform float uNow, uPx; ${VIS}
    out vec4 vColor;
    void main(){ float dt = clamp(uNow - aT0, 0.0, 600.0) - aLag; vec3 p = normalize(aPos + aVel * dt);
      gl_Position = uMVP * vec4(p * (1.0 + aAlt), 1.0); vColor = vec4(aColor.rgb, aColor.a * vis(p)); gl_PointSize = max(1.0, aSize * uPx); }`, DOT_FS);

  // Births rise as a bright spark; deaths fall away as a dim one.
  const P_EVENT = program(`in vec3 aPos; in float aT0; in float aKind;
    uniform mat4 uMVP; uniform float uNow, uPx; ${VIS}
    out vec4 vColor;
    void main(){ float age = (uNow - aT0) / 2.6; float live = step(0.0, age) * step(age, 1.0);
      float r = 1.0 + (aKind > 0.5 ? 1.0 : -0.25) * 0.035 * age + 0.003;
      gl_Position = uMVP * vec4(aPos * r, 1.0);
      vec3 c = aKind > 0.5 ? mix(vec3(1.0, 0.95, 0.7), vec3(1.0, 0.72, 0.2), age) : mix(vec3(0.75, 0.6, 1.0), vec3(0.35, 0.2, 0.6), age);
      vColor = vec4(c, live * (1.0 - age) * (aKind > 0.5 ? 1.0 : 0.8) * vis(aPos)); gl_PointSize = max(1.0, (aKind > 0.5 ? 2.6 - age : 2.0) * uPx); }`, DOT_FS);

  // Precipitation: fine streaks that fall toward the surface wherever the satellites see rain or snow.
  const P_RAIN = program(`in vec3 aPos; in vec4 aColor; in float aSeed;
    uniform mat4 uMVP; uniform float uTime, uPx; ${VIS}
    out vec4 vColor;
    void main(){ float f = fract(uTime * (0.28 + aSeed * 0.2) + aSeed * 7.0);
      gl_Position = uMVP * vec4(aPos * (1.0 + 0.034 * (1.0 - f) + 0.002), 1.0);
      vColor = vec4(aColor.rgb, aColor.a * vis(aPos) * smoothstep(0.0, 0.2, f) * (0.35 + 0.65 * f)); gl_PointSize = max(1.0, (0.9 + aSeed * 0.5) * uPx); }`, DOT_FS);

  const P_ATMO = program(`in vec2 aUV; uniform mat4 uProj; uniform float uD, uS; out vec2 vUV;
    void main(){ vUV = aUV; gl_Position = uProj * vec4(aUV * uS * 1.6, -uD, 1.0); }`,
    `in vec2 vUV; out vec4 o;
    void main(){ float q = length(vUV) * 1.6;
      if (q < 1.0) { float rim = pow(q, 7.0); o = vec4(mix(vec3(0.02, 0.012, 0.055), vec3(0.34, 0.2, 0.85), rim * 0.55), 0.94); }
      else { float g = exp(-(q - 1.0) * 11.0); o = vec4(mix(vec3(0.75, 0.3, 1.0), vec3(0.4, 0.5, 1.0), g), g * 0.6); } }`);

  /* ---------- camera ---------- */
  const cam = { lon: -30, lat: 22, dist: 3.9, tLon: -30, tLat: 22, tDist: 3.9, vLon: 0, vLat: 0, idle: 0 };
  let MVP = null, PROJ = null, EYE = [0, 0, 1], W = 1, H = 1, DPR = 1, viewD = 3.9;
  function resize() {
    DPR = Math.min(devicePixelRatio || 1, 2); W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR); gl.viewport(0, 0, canvas.width, canvas.height);
  }
  addEventListener("resize", resize); resize();
  function updateCamera(dt) {
    if (!drag.on) {
      cam.idle += dt;
      if (cam.idle > (EMBED ? 0 : 4)) cam.tLon += dt * 2.2;                    // drift when left alone
      cam.tLon += cam.vLon * dt; cam.tLat += cam.vLat * dt; cam.vLon *= Math.pow(0.04, dt); cam.vLat *= Math.pow(0.04, dt);
    }
    cam.tLat = Math.max(-78, Math.min(78, cam.tLat)); cam.tDist = Math.max(1.22, Math.min(6, cam.tDist));
    const k = Math.min(1, dt * 7);
    cam.lon += (cam.tLon - cam.lon) * k; cam.lat += (cam.tLat - cam.lat) * k; cam.dist += (cam.tDist - cam.dist) * k;
    const asp = W / H; viewD = 1 + (cam.dist - 1) * (asp < 1 ? Math.min(2.9, 1.12 / asp) : 1);
    EYE = ll(cam.lon, cam.lat, viewD); PROJ = persp(34 * DEG, asp, 0.05, 30); MVP = mul(PROJ, lookAt(EYE));
  }
  const project = (p) => { const x = MVP[0] * p[0] + MVP[4] * p[1] + MVP[8] * p[2] + MVP[12], y = MVP[1] * p[0] + MVP[5] * p[1] + MVP[9] * p[2] + MVP[13], w = MVP[3] * p[0] + MVP[7] * p[1] + MVP[11] * p[2] + MVP[15]; return [(x / w * 0.5 + 0.5) * W, (0.5 - y / w * 0.5) * H]; };
  const facing = (p) => dot(norm(p), EYE) > 1.02;

  const drag = { on: false, x: 0, y: 0, moved: 0, pts: new Map(), pinch: 0 };
  if (!EMBED) {
    canvas.addEventListener("pointerdown", (e) => { canvas.setPointerCapture(e.pointerId); drag.pts.set(e.pointerId, [e.clientX, e.clientY]); drag.on = true; drag.x = e.clientX; drag.y = e.clientY; drag.moved = 0; drag.pinch = 0; cam.idle = 0; cam.vLon = cam.vLat = 0; canvas.classList.add("drag"); hideHint(); });
    canvas.addEventListener("pointermove", (e) => {
      if (!drag.on) { hover(e.clientX, e.clientY); return; }
      drag.pts.set(e.pointerId, [e.clientX, e.clientY]); cam.idle = 0;
      if (drag.pts.size >= 2) { const [a, b] = [...drag.pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (drag.pinch) cam.tDist = 1 + (cam.tDist - 1) * (drag.pinch / d); drag.pinch = d; return; }
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y, s = 0.3 * (cam.dist - 0.85) / 3 * (900 / Math.max(500, H));
      drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
      cam.tLon -= dx * s; cam.tLat += dy * s; cam.vLon = -dx * s * 30; cam.vLat = dy * s * 30;
    });
    const up = (e) => { drag.pts.delete(e.pointerId); drag.pinch = 0; if (!drag.pts.size) { drag.on = false; canvas.classList.remove("drag"); if (drag.moved < 6) hover(e.clientX, e.clientY); } else { const [p] = [...drag.pts.values()]; drag.x = p[0]; drag.y = p[1]; } };
    canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("pointerleave", () => { if (!drag.on) tip.style.display = "none"; });
    canvas.addEventListener("wheel", (e) => { e.preventDefault(); cam.tDist = 1 + (cam.tDist - 1) * Math.exp(e.deltaY * 0.0012); cam.idle = 0; hideHint(); }, { passive: false });
  }
  const hideHint = () => { $("#hint").style.opacity = "0"; };
  setTimeout(hideHint, 9000);

  /* ---------- layers ---------- */
  const C = { land: [0.56, 0.5, 1.0], coast: [0.62, 0.48, 1.0], cable: [0.25, 0.85, 1.0], dc: [1.0, 0.31, 0.85], air: [1.0, 0.86, 0.45], route: [0.72, 0.56, 1.0], ship: [0.37, 0.92, 0.83], rail: [0.64, 0.9, 0.3], road: [1.0, 0.6, 0.25], up: [0.29, 0.87, 0.5], down: [0.98, 0.44, 0.52] };
  const css = (c) => `rgb(${c.map((x) => Math.round(x * 255)).join(",")})`;
  const LAYERS = [
    { id: "markets", name: "Markets & commodities", color: C.up, unit: "prices" },
    { id: "planes", name: "Air traffic", color: C.air, unit: "aircraft" },
    { id: "routes", name: "Air routes & airports", color: C.route, unit: "airports" },
    { id: "ships", name: "Shipping", color: C.ship, unit: "ports" },
    { id: "rail", name: "Rail", color: C.rail, unit: "lines" },
    { id: "roads", name: "Road traffic", color: C.road, unit: "roads" },
    { id: "net", name: "Internet: cables & data centres", color: C.cable, unit: "data centres" },
    { id: "rain", name: "Weather: precipitation", color: [0.45, 0.75, 1], unit: "" },
    { id: "pop", name: "Population", color: [1, 0.45, 0.75], unit: "people" },
    { id: "vital", name: "Births & deaths", color: [1, 0.85, 0.5], unit: "today" },
  ];
  const L = {};
  for (const l of LAYERS) {
    const b = document.createElement("button"); b.className = "layer"; b.type = "button"; b.style.color = css(l.color); b.setAttribute("aria-pressed", "true");
    b.innerHTML = `<span class="sw"></span><span class="nm">${l.name}</span><span class="ct mono">&ndash;</span><span class="st"><span class="dot off"></span><span class="tx">waiting for data</span></span>`;
    b.onclick = () => { l.on = !l.on; b.setAttribute("aria-pressed", l.on); };
    $("#layers").appendChild(b);
    L[l.id] = Object.assign(l, { on: true, el: b, count(n) { b.querySelector(".ct").textContent = typeof n === "number" ? n.toLocaleString("en-US") : n; }, status(kind, text) { b.querySelector(".dot").className = "dot " + kind; b.querySelector(".tx").textContent = text; } });
  }

  const M = {};           // meshes
  const picks = [];       // things a visitor can point at: { p, kind, title, sub }
  const quad = mesh(P_ATMO, [["aUV", 2]], [-1, -1, 1, -1, -1, 1, 1, 1], gl.TRIANGLE_STRIP);

  // Stars and the graticule need no data.
  { const a = []; for (let i = 0; i < 2600; i++) { const p = norm([rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1]), r = 14; a.push(p[0] * r, p[1] * r, p[2] * r, 0.75, 0.72, 1, (0.25 + rnd() * 0.5) * 20, 1 + rnd() * 0.9, rnd()); }   // x20: stars sit outside the globe, where vis() is 0.05
    M.stars = mesh(P_POINT, [["aPos", 3], ["aColor", 4], ["aSize", 1], ["aSeed", 1]], a, gl.POINTS); }
  { const a = [], put = (lon, lat) => a.push(...ll(lon, lat), 0.45, 0.36, 0.9, 0.11, 0);
    for (let lon = -180; lon < 180; lon += 30) for (let lat = -88; lat < 88; lat += 2) { put(lon, lat); put(lon, lat + 2); }
    for (let lat = -60; lat <= 60; lat += 30) for (let lon = -180; lon < 180; lon += 2) { put(lon, lat); put(lon + 2, lat); }
    M.grid = mesh(P_LINE, [["aPos", 3], ["aColor", 4], ["aDist", 1]], a, gl.LINES); }

  // Polylines stored as [lon*100, lat*100, ...] -> GL_LINES on the sphere, split so long hops follow the curve.
  function lineVerts(list, color, alpha, out = []) {
    for (const flat of list) {
      let d = 0, prev = null;
      for (let i = 0; i + 1 < flat.length; i += 2) {
        const p = ll(flat[i] / 100, flat[i + 1] / 100);
        if (prev) {
          const w = Math.acos(Math.max(-1, Math.min(1, dot(prev, p)))), n = Math.max(1, Math.ceil(w / (2.5 * DEG)));
          let a = prev;
          for (let k = 1; k <= n; k++) { const b = k === n ? p : norm([prev[0] + (p[0] - prev[0]) * k / n, prev[1] + (p[1] - prev[1]) * k / n, prev[2] + (p[2] - prev[2]) * k / n]);
            out.push(a[0], a[1], a[2], color[0], color[1], color[2], alpha, d, b[0], b[1], b[2], color[0], color[1], color[2], alpha, d + w / n); d += w / n; a = b; }
        }
        prev = p;
      }
    }
    return out;
  }
  const LINE = [["aPos", 3], ["aColor", 4], ["aDist", 1]], POINT = [["aPos", 3], ["aColor", 4], ["aSize", 1], ["aSeed", 1]];
  const pts = (rows, color, alpha, size, jitter = 0.4) => { const a = []; for (const r of rows) { const p = ll(r[0], r[1]); a.push(p[0], p[1], p[2], color[0], color[1], color[2], alpha, size * (1 - jitter / 2 + rnd() * jitter), rnd()); } return a; };

  let reveal = 0, world = null;
  function buildWorld(w) {
    world = w;
    if (w.land) {
      const bits = Uint8Array.from(atob(w.land.b64), (c) => c.charCodeAt(0)), LW = w.land.w, LH = w.land.h;
      const N = SMALL ? 150000 : 330000, a = [], g = Math.PI * (3 - Math.sqrt(5));
      for (let i = 0; i < N; i++) {                               // evenly spread points; keep the ones on land
        const y = 1 - (i + 0.5) / N * 2, r = Math.sqrt(1 - y * y), th = i * g, x = Math.sin(th) * r, z = Math.cos(th) * r;
        const lat = Math.asin(y) / DEG, lon = Math.atan2(x, z) / DEG;
        const n = Math.min(LH - 1, Math.floor((90 - lat) / 180 * LH)) * LW + Math.min(LW - 1, Math.floor((lon + 180) / 360 * LW));
        if (bits[n >> 3] & (128 >> (n & 7))) a.push(x, y, z, C.land[0], C.land[1], C.land[2], 0.34 + rnd() * 0.3, 1.0 + rnd() * 0.55, rnd());
      }
      M.land = mesh(P_POINT, POINT, a, gl.POINTS);
    }
    if (w.coast) M.coast = mesh(P_LINE, LINE, lineVerts(w.coast, C.coast, 0.42), gl.LINES);
    if (w.rails) { M.rails = mesh(P_LINE, LINE, lineVerts(w.rails, C.rail, 0.2), gl.LINES); L.rail.count(w.rails.length); L.rail.status("static", "network: Natural Earth · live trains: connecting"); }
    if (w.roads) { M.roads = mesh(P_LINE, LINE, lineVerts(w.roads, C.road, 0.16), gl.LINES); L.roads.count(w.roads.length); L.roads.status("static", "major highways: Natural Earth · live counts: connecting"); }
    if (w.cables) { M.cables = mesh(P_LINE, LINE, lineVerts(w.cables.map((c) => c.p), C.cable, 0.34), gl.LINES); }
    if (w.dcs) { M.dcs = mesh(P_POINT, POINT, pts(w.dcs, C.dc, 0.85, 1.7), gl.POINTS); L.net.count(w.dcs.length);
      for (const d of w.dcs) picks.push({ p: ll(d[0], d[1]), layer: "net", kind: "Data centre", title: d[2] || "Data centre", sub: d[3] || "OpenStreetMap" }); }
    if (w.dcs || w.cables) L.net.status("static", `${(w.cables || []).length.toLocaleString("en-US")} cables · OpenStreetMap, weekly`);
    if (w.ports) { M.ports = mesh(P_POINT, POINT, pts(w.ports.map((p) => [p[0] / 100, p[1] / 100]), C.ship, 0.7, 1.5), gl.POINTS); L.ships.count(w.ports.length); L.ships.status("static", "ports: Natural Earth · live ships: connecting");
      for (const p of w.ports) picks.push({ p: ll(p[0] / 100, p[1] / 100), layer: "ships", kind: "Port", title: p[2], sub: "" }); }
    if (w.airports) {
      const ap = w.airports.map((a) => ll(a[0] / 100, a[1] / 100));
      M.airports = mesh(P_POINT, POINT, pts(w.airports.map((a) => [a[0] / 100, a[1] / 100]), [1, 1, 1], 0.9, 1.9, 0.2), gl.POINTS); L.routes.count(w.airports.length);
      w.airports.forEach((a, i) => picks.push({ p: ap[i], layer: "routes", kind: "Airport · " + a[2], title: a[3], sub: a[4] }));
      const arcs = [], flow = [];
      for (const [i, j, wt] of w.routes || []) {
        const A = ap[i], B = ap[j]; if (!A || !B) continue;
        const om = Math.acos(Math.max(-1, Math.min(1, dot(A, B)))); if (om < 0.02) continue;
        const so = Math.sin(om), n = Math.max(6, Math.ceil(om / (4 * DEG))), al = 0.035 + Math.min(wt, 8) * 0.006; let prev = null;
        for (let k = 0; k <= n; k++) { const t = k / n, s1 = Math.sin((1 - t) * om) / so, s2 = Math.sin(t * om) / so, r = 1 + (0.012 + om * 0.07) * Math.sin(Math.PI * t);
          const p = [(A[0] * s1 + B[0] * s2) * r, (A[1] * s1 + B[1] * s2) * r, (A[2] * s1 + B[2] * s2) * r];
          if (prev) arcs.push(prev[0], prev[1], prev[2], C.route[0], C.route[1], C.route[2], al, 0, p[0], p[1], p[2], C.route[0], C.route[1], C.route[2], al, 0); prev = p; }
        const count = Math.min(4, 1 + Math.floor(wt / 3));
        for (let k = 0; k < count; k++) { const fwd = rnd() < 0.5, a = fwd ? A : B, b = fwd ? B : A; flow.push(a[0], a[1], a[2], b[0], b[1], b[2], rnd(), (0.012 + rnd() * 0.006) / om, 0.9, 0.8, 1, 0.9, 1.5 + rnd() * 0.5); }
      }
      M.arcs = mesh(P_LINE, LINE, arcs, gl.LINES);
      M.flow = mesh(P_FLOW, [["aA", 3], ["aB", 3], ["aPhase", 1], ["aSpeed", 1], ["aColor", 4], ["aSize", 1]], flow, gl.POINTS);
      L.routes.status("static", `${(w.routes || []).length.toLocaleString("en-US")} routes · OurAirports, OpenFlights (2014)`);
    }
    if (w.pop) {   // a fine vertical filament per half-degree cell: the taller and whiter, the more people live there
      const ln = [], hd = []; let total = 0;
      for (const [x, y, k] of w.pop) {
        total += k; const q = Math.min(1, Math.sqrt(k / 22000)), h = 0.003 + q * 0.17, a = ll(x / 100, y / 100), b = ll(x / 100, y / 100, 1 + h);
        const c = [1, 0.4 + q * 0.6, 0.72 + q * 0.28];
        ln.push(a[0], a[1], a[2], 1, 0.3, 0.7, 0.1 + q * 0.2, 0, b[0], b[1], b[2], c[0], c[1], c[2], 0.35 + q * 0.65, 1);
        const n = 1 + Math.floor(q * 9);
        for (let i = 1; i <= n; i++) { const t = i / n, p = ll(x / 100, y / 100, 1 + h * t); hd.push(p[0], p[1], p[2], c[0], c[1], c[2], 0.3 + t * 0.6, i === n ? 1.5 : 1.05, rnd()); }
        if (k >= 1500) picks.push({ p: b, layer: "pop", kind: "Population", title: `${(k / 1000).toFixed(1)} million people`, sub: "in towns and cities of 15,000+ within this half-degree cell" });
      }
      M.popLines = mesh(P_LINE, LINE, ln, gl.LINES); M.popDots = mesh(P_POINT, POINT, hd, gl.POINTS);
      L.pop.count(`${(total / 1e6).toFixed(2)} bn`); L.pop.status("static", "people in towns and cities of 15,000+ · GeoNames");
    }
    if (w.vital) setupVital(w.vital);
    if (MK) buildMarkets(MK);
  }

  /* ---------- births and deaths (modelled from real country rates) ---------- */
  const EV_N = 900, evData = new Float32Array(EV_N * 5).fill(-99); let evI = 0, vital = null, evDirty = false;
  M.events = mesh(P_EVENT, [["aPos", 3], ["aT0", 1], ["aKind", 1]], evData, gl.POINTS, true);
  function setupVital(rows) {
    const cum = (k) => { let s = 0; const c = new Float64Array(rows.length); rows.forEach((r, i) => { s += r[k]; c[i] = s; }); return { c, total: s }; };
    vital = { rows, pos: rows.map((r) => ll(r[0] / 100, r[1] / 100)), b: cum(2), d: cum(3) };
    L.vital.status("delay", "born / died today (UTC) · modelled from World Bank rates");
  }
  const poisson = (m) => { let k = 0, p = Math.exp(-m), s = p; const u = rnd(); while (u > s && k < 40) { k++; p *= m / k; s += p; } return k; };
  function spawnVital(dt, now) {
    if (!vital || !L.vital.on) return;
    for (const [set, kind] of [[vital.b, 1], [vital.d, 0]]) {
      for (let n = poisson(set.total / 86400 * dt); n > 0; n--) {
        const x = rnd() * set.total; let lo = 0, hi = set.c.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (set.c[m] < x) lo = m + 1; else hi = m; }
        const p = norm([vital.pos[lo][0] + (rnd() - 0.5) * 0.02, vital.pos[lo][1] + (rnd() - 0.5) * 0.02, vital.pos[lo][2] + (rnd() - 0.5) * 0.02]);
        evData.set([p[0], p[1], p[2], now, kind], evI * 5); evI = (evI + 1) % EV_N; evDirty = true;
      }
    }
    const day = (Date.now() % 86400000) / 86400000;   // since midnight UTC
    L.vital.count(`${Math.round(vital.b.total * day).toLocaleString("en-US")} / ${Math.round(vital.d.total * day).toLocaleString("en-US")}`);
  }

  /* ---------- markets ---------- */
  const PIN = { "^GSPC": [-74.01, 40.71, "S&P 500"], "^NDX": [-74.01, 40.71, "Nasdaq-100"], "^DJI": [-74.01, 40.71, "Dow"], "^GSPTSE": [-79.38, 43.65, "TSX"], "^BVSP": [-46.63, -23.55, "Bovespa"], "^MXX": [-99.13, 19.43, "IPC"],
    "^FTSE": [-0.1, 51.51, "FTSE 100"], "^GDAXI": [8.68, 50.11, "DAX"], "^FCHI": [2.35, 48.86, "CAC 40"], "^STOXX50E": [8.54, 47.37, "Euro Stoxx 50"], "^N225": [139.77, 35.68, "Nikkei 225"], "^HSI": [114.16, 22.28, "Hang Seng"],
    "000001.SS": [121.47, 31.23, "Shanghai"], "^BSESN": [72.83, 18.93, "Sensex"], "^AXJO": [151.21, -33.87, "ASX 200"], "^KS11": [126.98, 37.57, "KOSPI"], "^TWII": [121.56, 25.03, "Taiex"], "^STI": [103.85, 1.28, "Straits Times"],
    "CL=F": [-96.77, 35.98, "WTI crude"], "BZ=F": [-1.3, 60.45, "Brent crude"], "NG=F": [-92.03, 29.9, "Natural gas"], "GC=F": [-74.01, 40.71, "Gold"], "SI=F": [-74.01, 40.71, "Silver"], "HG=F": [-74.01, 40.71, "Copper"], "PL=F": [-74.01, 40.71, "Platinum"],
    "ZW=F": [-87.63, 41.88, "Wheat"], "ZC=F": [-87.63, 41.88, "Corn"], "ZS=F": [-87.63, 41.88, "Soybeans"] };
  const NAMES = { "^TNX": "US 10Y yield", "^VIX": "VIX", "DX-Y.NYB": "Dollar index", "EURUSD=X": "EUR/USD", "GBPUSD=X": "GBP/USD", "JPY=X": "USD/JPY", "CNY=X": "USD/CNY" };
  const fmt = (n) => n == null ? "–" : Math.abs(n) >= 1000 ? n.toLocaleString("en-US", { maximumFractionDigits: 0 }) : n.toLocaleString("en-US", { maximumFractionDigits: Math.abs(n) < 20 ? 4 : 2 });
  const pct = (p) => p == null ? "" : `${p >= 0 ? "+" : ""}${p.toFixed(2)}%`;
  let MK = null, marketLabels = [];
  function buildMarkets(mk) {
    MK = mk;
    const lines = [], heads = [], groups = {};
    for (const k of picks.keys()) if (picks[k].layer === "markets") picks[k] = null;
    for (let i = picks.length - 1; i >= 0; i--) if (!picks[i]) picks.splice(i, 1);
    for (const el of marketLabels) el.el.remove(); marketLabels = [];
    for (const q of mk.quotes) { const pin = PIN[q.sym]; if (pin) (groups[pin[0] + "," + pin[1]] ||= []).push([q, pin]); }
    for (const g of Object.values(groups)) g.forEach(([q, pin], i) => {
      const fan = g.length > 1 ? 1.5 : 0, ang = (i / g.length) * Math.PI * 2, lon = pin[0] + Math.cos(ang) * fan / Math.cos(pin[1] * DEG), lat = pin[1] + Math.sin(ang) * fan;
      const up = (q.pct ?? 0) >= 0, c = up ? C.up : C.down, h = 0.025 + Math.min(Math.abs(q.pct ?? 0), 4) / 4 * 0.13, a = ll(lon, lat), b = ll(lon, lat, 1 + h);
      lines.push(a[0], a[1], a[2], c[0], c[1], c[2], 0.25, 0, b[0], b[1], b[2], c[0], c[1], c[2], 1, 1);
      for (let k = 0; k < 9; k++) { const t = k / 8, p = ll(lon, lat, 1 + h * t); heads.push(p[0], p[1], p[2], c[0], c[1], c[2], 0.35 + t * 0.65, k === 8 ? 3.4 : 1.3, rnd()); }
      picks.push({ p: b, layer: "markets", kind: q.sym.endsWith("=F") ? "Commodity" : "Stock index", title: pin[2], sub: `${fmt(q.price)} ${q.currency || ""} · ${pct(q.pct)}${q.stale ? " · last known" : ""}` });
      const el = document.createElement("div"); el.className = "lab mono"; el.innerHTML = `${pin[2]}<b class="${up ? "up" : "down"}">${pct(q.pct)}</b>`; $("#labels").appendChild(el);
      marketLabels.push({ el, p: b, w: Math.abs(q.pct ?? 0) });
    });
    marketLabels.sort((x, y) => y.w - x.w);
    M.spikes = mesh(P_LINE, LINE, lines, gl.LINES); M.heads = mesh(P_POINT, POINT, heads, gl.POINTS);
    const age = Math.round((Date.now() - Date.parse(mk.updatedAt)) / 60000);
    L.markets.count(mk.quotes.length); L.markets.status("delay", `delayed · updated ${age < 90 ? age + " min" : Math.round(age / 60) + " h"} ago · Yahoo Finance`);
    const tape = mk.quotes.map((q) => `<span><i>${(PIN[q.sym] || [])[2] || NAMES[q.sym] || q.sym}</i>${fmt(q.price)} <b class="${(q.pct ?? 0) >= 0 ? "up" : "down"}">${pct(q.pct)}</b></span>`).join("");
    $("#tape").innerHTML = tape + tape;
  }
  function layoutLabels() {
    const used = [], show = L.markets.on;
    for (const m of marketLabels) {
      let ok = show && facing(m.p), x = 0, y = 0;
      if (ok) { [x, y] = project(m.p); ok = x > 40 && x < W - 40 && y > 30 && y < H - 50 && !used.some((u) => Math.abs(u[0] - x) < 84 && Math.abs(u[1] - y) < 17); }
      if (ok) { used.push([x, y]); m.el.style.display = "block"; m.el.style.left = x.toFixed(1) + "px"; m.el.style.top = (y - 5).toFixed(1) + "px"; } else m.el.style.display = "none";
    }
  }

  /* ---------- live movers ---------- */
  const MOVER = [["aPos", 3], ["aVel", 3], ["aT0", 1], ["aLag", 1], ["aColor", 4], ["aSize", 1], ["aAlt", 1]];
  const now = () => performance.now() / 1000;
  function moverSet(color, lags, lagStep, size) {
    const s = { map: new Map(), mesh: mesh(P_MOVER, MOVER, null, gl.POINTS, true), dirty: false,
      rebuild() { const a = []; for (const m of s.map.values()) for (let k = 0; k < lags; k++) a.push(m.p[0], m.p[1], m.p[2], m.v[0], m.v[1], m.v[2], m.t0, k * lagStep, color[0], color[1], color[2], (k ? 0.5 : 1) * (1 - k / lags), k ? size * 0.62 : size, m.alt || 0.002); s.mesh.set(a); s.dirty = false; } };
    return s;
  }
  const planes = moverSet(C.air, 6, 22, 2.1), ships = moverSet(C.ship, 5, 150, 1.9), trains = moverSet(C.rail, 3, 12, 2.1);
  const moverPos = (m, t) => { const dt = Math.max(0, Math.min(600, t - m.t0)); return norm([m.p[0] + m.v[0] * dt, m.p[1] + m.v[1] * dt, m.p[2] + m.v[2] * dt]); };

  const HUBS = [[40.7, -74], [41.9, -87.6], [33.7, -84.4], [32.9, -97], [39.8, -104.7], [34, -118.3], [37.6, -122.3], [47.5, -122.3], [25.8, -80.3], [43.7, -79.6], [19.4, -99.1], [-23.5, -46.6], [4.7, -74.1], [51.5, -0.3], [49, 2.5], [50, 8.6], [40.5, -3.6], [41.8, 12.3], [41.2, 28.8], [25.2, 55.4], [25.3, 51.6], [28.6, 77.1], [19.1, 72.9], [1.4, 104], [13.7, 100.7], [22.3, 113.9], [31.1, 121.8], [40.1, 116.6], [35.6, 139.8], [37.5, 126.4], [-33.9, 151.2], [-26.1, 28.2], [30.1, 31.4], [52.3, 4.8], [55.6, 12.6], [59.6, 17.9]];
  let hubI = 0, planeFails = 0, planeOk = false, flip = false;
  async function pollPlanes() {
    if (!L.planes.on || document.hidden) return setTimeout(pollPlanes, 3000);
    flip = !flip; const [lat, lon] = flip && !EMBED ? [cam.lat, ((cam.lon + 540) % 360) - 180] : HUBS[hubI++ % HUBS.length];
    try {
      const r = await fetch(`https://api.adsb.lol/v2/lat/${lat.toFixed(2)}/lon/${lon.toFixed(2)}/dist/250`, { signal: AbortSignal.timeout(12000) });
      if (!r.ok) throw new Error(r.status);
      const j = await r.json(), t = now();
      for (const a of j.ac || []) {
        if (a.lat == null || a.lon == null || typeof a.alt_baro !== "number") continue;
        const sp = (a.gs || 0) * 0.5144 / EARTH, d = heading(a.lon, a.lat, a.track || 0);
        planes.map.set(a.hex, { p: ll(a.lon, a.lat), v: [d[0] * sp, d[1] * sp, d[2] * sp], t0: t - Math.min(a.seen_pos || 0, 60), alt: 0.003 + Math.min(a.alt_baro, 45000) / 45000 * 0.011, seen: t,
          title: (a.flight || "").trim() || a.r || a.hex, sub: `${a.t || "Aircraft"} · ${Math.round(a.alt_baro).toLocaleString("en-US")} ft · ${Math.round(a.gs || 0)} kt` });
      }
      planeOk = true; planeFails = 0; planes.dirty = true;
    } catch (e) { planeFails++; }
    const t = now(); for (const [k, m] of planes.map) if (t - m.seen > 240) { planes.map.delete(k); planes.dirty = true; }
    L.planes.count(planes.map.size);
    if (planeOk && planeFails < 4) L.planes.status("live", "live · adsb.lol · sweeping the major air hubs");
    else if (planeFails >= 3) L.planes.status("off", "live feed not reachable from this browser right now");
    setTimeout(pollPlanes, planeFails >= 3 ? 30000 : EMBED ? 5000 : 2200);
  }

  async function pollShips() {
    if (L.ships.on && !document.hidden) try {
      const j = await (await fetch("https://meri.digitraffic.fi/api/ais/v1/locations", { signal: AbortSignal.timeout(30000) })).json(), t = now(), wall = Date.now();
      ships.map.clear();
      for (const f of j.features || []) {
        const pr = f.properties || {}, c = f.geometry?.coordinates, age = (wall - (pr.timestampExternal || 0)) / 1000;
        if (!c || age > 900 || !(pr.sog > 0.5) || pr.sog > 60) continue;
        const sp = pr.sog * 0.5144 / EARTH, d = heading(c[0], c[1], pr.cog || 0);
        ships.map.set(pr.mmsi, { p: ll(c[0], c[1]), v: [d[0] * sp, d[1] * sp, d[2] * sp], t0: t - Math.max(0, age), alt: 0.0015, title: "Vessel MMSI " + pr.mmsi, sub: `${pr.sog.toFixed(1)} kt · course ${Math.round(pr.cog || 0)}°` });
      }
      ships.dirty = true;
      L.ships.status("live", `${ships.map.size.toLocaleString("en-US")} ships under way, live (Baltic · Fintraffic) · ports worldwide`);
    } catch (e) { if (!ships.map.size) L.ships.status("static", "ports: Natural Earth · live ships not reachable right now"); }
    setTimeout(pollShips, 60000);
  }

  async function pollTrains() {
    if (L.rail.on && !document.hidden) try {
      const j = await (await fetch("https://rata.digitraffic.fi/api/v1/train-locations/latest", { signal: AbortSignal.timeout(20000) })).json(), t = now(), seen = new Set();
      for (const tr of j) {
        const c = tr.location?.coordinates; if (!c) continue;
        const p = ll(c[0], c[1]), old = trains.map.get(tr.trainNumber); let v = [0, 0, 0];
        if (old && t - old.seen > 3 && t - old.seen < 90) { const dt = t - old.seen; v = [(p[0] - old.p0[0]) / dt, (p[1] - old.p0[1]) / dt, (p[2] - old.p0[2]) / dt]; if (Math.hypot(...v) * EARTH > 90) v = [0, 0, 0]; }
        trains.map.set(tr.trainNumber, { p, p0: p, v, t0: t, seen: t, alt: 0.0015, title: "Train " + tr.trainNumber, sub: `${tr.speed ?? 0} km/h · Finland` }); seen.add(tr.trainNumber);
      }
      for (const k of trains.map.keys()) if (!seen.has(k)) trains.map.delete(k);
      trains.dirty = true;
      L.rail.status("live", `${trains.map.size.toLocaleString("en-US")} trains live (Finland · Fintraffic) · network worldwide`);
    } catch (e) { if (!trains.map.size && world?.rails) L.rail.status("static", "network: Natural Earth · live trains not reachable right now"); }
    setTimeout(pollTrains, 15000);
  }

  // Road traffic: live counting stations where an open feed exists (Finland): brighter and larger = more vehicles per hour.
  let roadStations = null;
  async function pollRoads() {
    if (L.roads.on && !document.hidden) try {
      if (!roadStations) { const g = await (await fetch("https://tie.digitraffic.fi/api/tms/v1/stations", { signal: AbortSignal.timeout(30000) })).json(); roadStations = new Map(g.features.map((f) => [f.id ?? f.properties.id, { c: f.geometry.coordinates, name: f.properties.name }])); }
      const j = await (await fetch("https://tie.digitraffic.fi/api/tms/v1/stations/data", { signal: AbortSignal.timeout(30000) })).json(), a = [];
      for (let i = picks.length - 1; i >= 0; i--) if (picks[i].live === "road") picks.splice(i, 1);
      let total = 0;
      for (const s of j.stations || []) {
        const st = roadStations.get(s.id); if (!st) continue;
        let flow = 0, speed = 0, n = 0;
        for (const v of s.sensorValues || []) { if (/^OHITUKSET_60MIN_KIINTEA_SUUNTA[12]$/.test(v.name)) flow += v.value; if (/^KESKINOPEUS_5MIN_LIUKUVA_SUUNTA[12]$/.test(v.name) && v.value > 0) { speed += v.value; n++; } }
        if (!flow) continue; total += flow;
        const p = ll(st.c[0], st.c[1]), k = Math.min(1, flow / 3000);
        a.push(p[0], p[1], p[2], 1, 0.62 + 0.3 * k, 0.25 + 0.5 * k, 0.55 + 0.45 * k, 1.3 + k * 2.2, rnd());
        picks.push({ p, layer: "roads", live: "road", kind: "Traffic counter", title: (st.name || "Station").replace(/_/g, " "), sub: `${Math.round(flow).toLocaleString("en-US")} vehicles/h${n ? ` · ${Math.round(speed / n)} km/h` : ""}` });
      }
      M.roadLive = M.roadLive || mesh(P_POINT, POINT, null, gl.POINTS, true); M.roadLive.set(a);
      L.roads.status("live", `${(a.length / 9).toLocaleString("en-US")} live counters (Finland): ${Math.round(total).toLocaleString("en-US")} vehicles/h · highways worldwide`);
    } catch (e) { if (!M.roadLive && world?.roads) L.roads.status("static", "major highways: Natural Earth · live counts not reachable right now"); }
    setTimeout(pollRoads, 120000);
  }

  /* ---------- weather: precipitation from NASA's GPM IMERG satellites (one world image, read pixel by pixel) ---------- */
  function pollRain() {
    const img = new Image(); img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const RW = 1440, RH = 720, cv = document.createElement("canvas"); cv.width = RW; cv.height = RH;
        const cx = cv.getContext("2d", { willReadFrequently: true }); cx.drawImage(img, 0, 0, RW, RH);
        const px = cx.getImageData(0, 0, RW, RH).data, wet = [];
        let area = 0, all = 0;
        for (let j = 0; j < RH; j++) { const wgt = Math.cos((90 - (j + 0.5) / 4) * DEG); for (let i = 0; i < RW; i++) { all += wgt; if (px[(j * RW + i) * 4 + 3] > 60) { wet.push(j * RW + i); area += wgt; } } }
        if (!wet.length) throw new Error("empty image");
        const N = Math.min(SMALL ? 45000 : 110000, wet.length * 2), a = [];
        for (let k = 0; k < N; k++) {
          const n = wet[(rnd() * wet.length) | 0], i = n % RW, j = (n / RW) | 0, p = ll(-180 + (i + rnd()) / 4, 90 - (j + rnd()) / 4);
          const r = px[n * 4] / 255, g = px[n * 4 + 1] / 255, b = px[n * 4 + 2] / 255, m = Math.max(r, g, b, 0.01);
          a.push(p[0], p[1], p[2], 0.35 + 0.65 * r / m, 0.35 + 0.65 * g / m, 0.35 + 0.65 * b / m, 0.5, rnd());
        }
        M.rain = M.rain || mesh(P_RAIN, [["aPos", 3], ["aColor", 4], ["aSeed", 1]], null, gl.POINTS, true); M.rain.set(a);
        L.rain.count(`${(area / all * 100).toFixed(1)}%`);
        L.rain.status("delay", "of the globe has rain or snow · satellite estimate, a few hours behind · NASA GPM IMERG");
      } catch (e) { if (!M.rain) L.rain.status("off", "satellite image could not be read in this browser"); }
    };
    img.onerror = () => { if (!M.rain) L.rain.status("off", "satellite feed not reachable right now"); };
    img.src = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=IMERG_Precipitation_Rate&STYLES=&FORMAT=image/png&TRANSPARENT=true&CRS=EPSG:4326&BBOX=-90,-180,90,180&WIDTH=1440&HEIGHT=720&_=" + Math.floor(Date.now() / 1800000);
    setTimeout(pollRain, 30 * 60000);
  }

  /* ---------- pointing at things ---------- */
  const tip = $("#tip");
  function hover(mx, my) {
    let best = null, bd = 15 * 15; const t = now();
    const test = (p, o) => { if (!L[o.layer].on || !facing(p)) return; const s = project(p), d = (s[0] - mx) ** 2 + (s[1] - my) ** 2; if (d < bd) { bd = d; best = o; } };
    for (const o of picks) test(o.p, o);
    for (const [set, layer, kind] of [[planes, "planes", "Aircraft · live"], [ships, "ships", "Ship · live"], [trains, "rail", "Train · live"]]) for (const m of set.map.values()) test(moverPos(m, t), { layer, kind, title: m.title, sub: m.sub });
    if (!best) { tip.style.display = "none"; return; }
    tip.innerHTML = `<div class="k"></div><div class="t"></div><div class="s"></div>`; tip.children[0].textContent = best.kind; tip.children[1].textContent = best.title; tip.children[2].textContent = best.sub || "";
    tip.style.display = "block"; tip.style.left = Math.min(W - 260, mx + 14) + "px"; tip.style.top = Math.max(8, my - 10) + "px";
  }

  /* ---------- the sun ---------- */
  function sunDir() {
    const d = new Date(), start = Date.UTC(d.getUTCFullYear(), 0, 0), doy = (d - start) / 86400000, h = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
    const B = (2 * Math.PI * (doy - 81)) / 364, eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
    return ll(-15 * (h - 12 + eot / 60), -23.44 * Math.cos((2 * Math.PI * (doy + 10)) / 365));
  }

  /* ---------- drawing ---------- */
  function use(prog, t) {
    gl.useProgram(prog.p); const u = prog.u;
    if (u.uMVP) gl.uniformMatrix4fv(u.uMVP, false, MVP);
    if (u.uCam) gl.uniform3fv(u.uCam, EYE);
    if (u.uTime) gl.uniform1f(u.uTime, t);
    if (u.uNow) gl.uniform1f(u.uNow, t);
    if (u.uPx) gl.uniform1f(u.uPx, DPR * Math.max(0.85, Math.min(2.4, 3.2 / viewD)) * (H < 420 ? 0.8 : 1));
    return u;
  }
  function drawPoints(m, t, o = {}) {
    if (!m || !m.count) return; const u = use(P_POINT, t);
    gl.uniform1f(u.uLift, o.lift || 0); gl.uniform1f(u.uReveal, o.reveal ?? 1); gl.uniform1f(u.uSunMix, o.sun || 0); gl.uniform1f(u.uTwinkle, o.twinkle ?? 0.25); gl.uniform3fv(u.uSun, SUN);
    gl.bindVertexArray(m.vao); gl.drawArrays(gl.POINTS, 0, m.count);
  }
  function drawLines(m, t, o = {}) {
    if (!m || !m.count) return; const u = use(P_LINE, t);
    gl.uniform1f(u.uLift, o.lift || 0); gl.uniform1f(u.uPulse, o.pulse || 0); gl.uniform1f(u.uFreq, o.freq || 60); gl.uniform1f(u.uSpeed, o.speed || 1); gl.uniform3fv(u.uHot, o.hot || [1, 1, 1]);
    gl.bindVertexArray(m.vao); gl.drawArrays(gl.LINES, 0, m.count);
  }
  function drawOther(m, prog, t) { if (!m || !m.count) return; use(prog, t); gl.bindVertexArray(m.vao); gl.drawArrays(gl.POINTS, 0, m.count); }

  let SUN = sunDir(), last = now(), frame = 0;
  gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.clearColor(0.02, 0.012, 0.05, 1);
  function tick() {
    requestAnimationFrame(tick);
    if (document.hidden) { last = now(); return; }
    const t = now(), dt = Math.min(0.1, t - last); last = t; frame++;
    if (canvas.clientWidth !== W || canvas.clientHeight !== H) resize();
    updateCamera(dt);
    if (world) reveal = Math.min(1, reveal + dt / 2.4);
    if (frame % 120 === 1) { SUN = sunDir(); $("#utc").textContent = new Date().toISOString().slice(11, 19) + " UTC"; }
    else if (frame % 20 === 0) $("#utc").textContent = new Date().toISOString().slice(11, 19) + " UTC";
    spawnVital(dt, t);
    if (evDirty) { M.events.set(evData); evDirty = false; }
    for (const s of [planes, ships, trains]) if (s.dirty && frame % 20 === 0) s.rebuild();

    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    { const u = use(P_POINT, t); gl.uniformMatrix4fv(u.uMVP, false, MVP); gl.uniform3fv(u.uCam, [0, 0, 0]); gl.uniform1f(u.uLift, 0); gl.uniform1f(u.uReveal, 1); gl.uniform1f(u.uSunMix, 0); gl.uniform1f(u.uTwinkle, 0.5); gl.uniform1f(u.uPx, DPR); gl.bindVertexArray(M.stars.vao); gl.drawArrays(gl.POINTS, 0, M.stars.count); }
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(P_ATMO.p); gl.uniformMatrix4fv(P_ATMO.u.uProj, false, PROJ); gl.uniform1f(P_ATMO.u.uD, viewD); gl.uniform1f(P_ATMO.u.uS, viewD / Math.sqrt(viewD * viewD - 1)); gl.bindVertexArray(quad.vao); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

    drawLines(M.grid, t);
    drawPoints(M.land, t, { reveal, sun: 1, twinkle: 0.3 });
    drawLines(M.coast, t, { lift: 0.0005 });
    if (L.roads.on) { drawLines(M.roads, t, { lift: 0.001, pulse: 0.5, freq: 260, speed: 2.2, hot: [1, 0.85, 0.5] }); drawPoints(M.roadLive, t, { lift: 0.002, twinkle: 0.6 }); }
    if (L.rail.on) drawLines(M.rails, t, { lift: 0.0012, pulse: 0.35, freq: 200, speed: 1.2, hot: [0.85, 1, 0.55] });
    if (L.net.on) { drawLines(M.cables, t, { lift: 0.0016, pulse: 1, freq: 90, speed: 2.6, hot: [0.9, 1, 1] }); drawPoints(M.dcs, t, { lift: 0.0022, twinkle: 0.55 }); }
    if (L.ships.on) { drawPoints(M.ports, t, { lift: 0.0018, twinkle: 0.3 }); drawOther(ships.mesh, P_MOVER, t); }
    if (L.rail.on) drawOther(trains.mesh, P_MOVER, t);
    if (L.routes.on) { drawLines(M.arcs, t); drawOther(M.flow, P_FLOW, t); drawPoints(M.airports, t, { lift: 0.0025, twinkle: 0.2 }); }
    if (L.planes.on) drawOther(planes.mesh, P_MOVER, t);
    if (L.rain.on) drawOther(M.rain, P_RAIN, t);
    if (L.pop.on) { drawLines(M.popLines, t); drawPoints(M.popDots, t, { twinkle: 0.55 }); }
    if (L.vital.on) drawOther(M.events, P_EVENT, t);
    if (L.markets.on) { drawLines(M.spikes, t); drawPoints(M.heads, t, { twinkle: 0.5 }); }
    gl.bindVertexArray(null);
    if (frame % 2 === 0) layoutLabels();
  }

  /* ---------- data ---------- */
  const getJson = async (url) => { const r = await fetch(url, { cache: "no-cache" }); if (!r.ok) throw new Error(r.status); return r.json(); };
  getJson("../data/globe/world.json").then(buildWorld).catch(() => { reveal = 1; for (const id of ["routes", "ships", "rail", "roads", "net", "pop", "vital"]) L[id].status("off", "first data sync in progress, check back in a few minutes"); });
  const loadMarkets = () => getJson("../data/globe/markets.json").then(buildMarkets).catch(() => { if (!MK) L.markets.status("off", "first data sync in progress"); });
  loadMarkets(); setInterval(loadMarkets, 5 * 60000);
  L.planes.status("off", "connecting to live feed"); L.rain.status("off", "loading the latest satellite image");
  setTimeout(pollPlanes, 1200); setTimeout(pollShips, 2500); setTimeout(pollTrains, 3500); setTimeout(pollRoads, 4500); setTimeout(pollRain, 800);
  tick();
})();
