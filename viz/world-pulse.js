/* World Pulse: a live 3D globe of the world's networks, drawn in fine particles (plain WebGL2, no libraries).
   Around the globe: a layer list with a freshness word per layer and a colour key, tap or click to select a point
   (a ring follows it), one rotating headline figure, a guided tour, "above me" (what is over the visitor's own spot),
   a replay of the last 24 hours, share links that reopen a view, and a render scale that drops if frames do.
   Mars: a second planet to switch to, with its real face, clock, seasons, landing sites and moons (mars.jpg).
   The sky: real stars and constellations (sky.json) and the Moon at its true place and phase (moon.json).
   The sea (ocean.json): currents, swell, a surf report for well-known breaks, wave buoys and tide stations.
   Static layers come from data/globe/world.json (tools/globe-data.mjs), markets from data/globe/markets.json
   (tools/globe-markets.mjs); aircraft, ships, trains and road counts are fetched live in the visitor's browser. */
(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const EMBED = /[?&]embed/.test(location.search), QS = new URLSearchParams(location.search);
  if (EMBED) { document.body.classList.add("embed"); $("#panel").open = false; }
  const SMALL = Math.min(innerWidth, innerHeight) < 620;
  if (SMALL) $("#panel").open = false;
  // Fewer particles on phones and on machines with little memory or few cores, so the frame rate holds.
  const LITE = SMALL || (navigator.deviceMemory || 8) <= 4 || (navigator.hardwareConcurrency || 8) <= 4;
  let PLANET = "earth";                                             // "earth" or "mars": which globe is in the middle (setPlanet)
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
    uniform mat4 uMVP; uniform float uTime, uPx, uLift, uReveal, uSunMix, uTwinkle, uWave; uniform vec3 uSun; ${VIS}
    out vec4 vColor;
    void main(){ vec3 n = normalize(aPos); gl_Position = uMVP * vec4(aPos * (1.0 + uLift), 1.0);
      float tw = 1.0 - uTwinkle * (0.5 + 0.5 * sin(uTime * (1.0 + aSeed * 2.0) + aSeed * 60.0));
      float day = smoothstep(-0.12, 0.2, dot(n, uSun));
      vec3 c = uSunMix > 1.5 ? aColor.rgb : mix(aColor.rgb, mix(aColor.rgb * vec3(0.3, 0.27, 0.62), aColor.rgb * 1.2 + vec3(0.05, 0.08, 0.1), day), uSunMix);
      float dusk = exp(-pow(dot(n, uSun) * 7.0, 2.0)) * min(uSunMix, 1.0);            // a warm band along the terminator
      c += vec3(1.0, 0.45, 0.25) * dusk * 0.35;
      float nightOnly = uSunMix > 1.5 ? 1.0 - smoothstep(-0.18, 0.06, dot(n, uSun)) : 1.0;
      float wv = pow(0.5 + 0.5 * sin(dot(n, vec3(0.6, 0.3, 0.74)) * 16.0 - uTime * 1.3 + aSeed * 0.8), 10.0) * uWave;   // light sweeping across the surface
      float show = step(aSeed, uReveal * 1.02);
      vColor = vec4(c + wv * 0.25, aColor.a * vis(n) * tw * show * nightOnly * (1.0 + wv * 2.2)); gl_PointSize = max(1.0, aSize * uPx); }`, DOT_FS);

  const P_LINE = program(`in vec3 aPos; in vec4 aColor; in float aDist;
    uniform mat4 uMVP; uniform float uLift; ${VIS}
    out vec4 vColor; out float vDist;
    void main(){ vec3 n = normalize(aPos); gl_Position = uMVP * vec4(aPos * (1.0 + uLift), 1.0); vColor = vec4(aColor.rgb, aColor.a * vis(n)); vDist = aDist; }`,
    `in vec4 vColor; in float vDist; uniform float uTime, uPulse, uFreq, uSpeed, uGradF, uGradMix; uniform vec3 uHot, uTint; out vec4 o;
    void main(){ float w = pow(fract(vDist * uFreq - uTime * uSpeed), 7.0) * uPulse;                 // a bright head with a fading tail
      vec3 base = mix(vColor.rgb, uTint, uGradMix * (0.5 + 0.5 * sin(vDist * uGradF + uTime * 0.15)));
      o = vec4(mix(base, uHot, clamp(w, 0.0, 1.0)), vColor.a * (1.0 + w * 7.0)); }`);

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
      gl_Position = uMVP * vec4(p * (1.0 + aAlt), 1.0); vColor = vec4(aColor.rgb, aColor.a * vis(p) * (0.65 + 0.35 * sin(uNow * 5.0 - aLag * 0.08))); gl_PointSize = max(1.0, aSize * uPx); }`, DOT_FS);

  // Satellites: each one is carried round its real orbit in the shader (Kepler's equation), then turned with the Earth.
  const P_SAT = program(`in vec4 aEl1; in vec4 aEl2; in float aLag;
    uniform mat4 uMVP; uniform float uNow, uPx, uGmst; ${VIS}
    out vec4 vColor;
    void main(){ float t = uNow - aLag, e = aEl1.y, M = aEl2.y + aEl2.z * t, E = M;
      for (int k = 0; k < 4; k++) E -= (E - e * sin(E) - M) / (1.0 - e * cos(E));
      float xv = aEl1.x * (cos(E) - e), yv = aEl1.x * sqrt(1.0 - e * e) * sin(E), cw = cos(aEl2.x), sw = sin(aEl2.x);
      float xp = cw * xv - sw * yv, yp = sw * xv + cw * yv, ci = cos(aEl1.z), si = sin(aEl1.z), O = aEl1.w - uGmst;
      vec3 p = vec3(sin(O) * xp + cos(O) * ci * yp, si * yp, cos(O) * xp - sin(O) * ci * yp);
      gl_Position = uMVP * vec4(p, 1.0); float h = aEl1.x - 1.0;
      vec3 c = h < 0.2 ? mix(vec3(0.55, 0.95, 1.0), vec3(0.9, 0.95, 1.0), aEl2.w) : h < 4.0 ? vec3(0.75, 0.55, 1.0) : vec3(1.0, 0.82, 0.45);
      float fade = 1.0 - aLag / 30.0;
      vColor = vec4(c, (aLag > 0.0 ? 0.4 : 0.95) * fade * mix(0.12, 1.0, smoothstep(-0.05, 0.05, dot(normalize(p), uCam) - 1.0 / length(p)))); gl_PointSize = max(1.0, (aLag > 0.0 ? 0.9 : 1.25) * uPx); }`, DOT_FS);

  // The Moon: points on a sphere, lit by the real sun direction; the half turned away from the camera is not drawn.
  const P_MOON = program(`in vec3 aPos; in float aAlb; in float aSeed;
    uniform mat4 uMVP; uniform vec3 uSunL, uEyeL; uniform float uPx, uTime;
    out vec4 vColor;
    void main(){ gl_Position = uMVP * vec4(aPos, 1.0);
      float lit = smoothstep(-0.04, 0.2, dot(aPos, uSunL)), face = smoothstep(0.0, 0.14, dot(aPos, normalize(uEyeL - aPos)));
      vec3 c = mix(vec3(0.62, 0.68, 0.95), vec3(1.0, 0.97, 0.9), aAlb) * (0.22 + 1.05 * aAlb);
      vColor = vec4(c * (0.035 + lit), face * (0.55 + 0.45 * aAlb) * (0.9 + 0.1 * sin(uTime * 1.3 + aSeed * 40.0))); gl_PointSize = max(1.0, (1.05 + aSeed * 0.5) * uPx); }`, DOT_FS);

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

  // The globe's body and atmosphere: a softly lit ocean sphere, a coloured limb and a halo that is brighter toward the sun.
  const P_ATMO = program(`in vec2 aUV; uniform mat4 uProj; uniform float uD, uS; out vec2 vUV;
    void main(){ vUV = aUV; gl_Position = uProj * vec4(aUV * uS * 1.9, -uD, 1.0); }`,
    `in vec2 vUV; uniform vec3 uSunV; uniform float uTime, uMars; out vec4 o;
    void main(){ float q = length(vUV) * 1.9; vec2 d = vUV / max(length(vUV), 1e-4);
      float side = 0.5 + 0.5 * dot(d, uSunV.xy);                                   // 1 on the sunward limb
      if (q < 1.0) {
        vec3 n = vec3(d * q, sqrt(1.0 - q * q)); float lit = dot(n, uSunV); float day = smoothstep(-0.15, 0.35, lit);
        vec3 sea = mix(mix(vec3(0.012, 0.008, 0.04), vec3(0.02, 0.07, 0.16), day), mix(vec3(0.02, 0.008, 0.012), vec3(0.13, 0.045, 0.025), day), uMars);   // Earth's sea, or Mars's bare ground
        sea += vec3(0.25, 0.5, 0.9) * pow(max(dot(reflect(-uSunV, n), vec3(0.0, 0.0, 1.0)), 0.0), 28.0) * 0.22 * (1.0 - uMars);     // sun glint
        sea += vec3(1.0, 0.4, 0.2) * exp(-pow(lit * 6.0, 2.0)) * 0.035;                                              // dusk band
        float rim = pow(q, 10.0);
        vec3 limb = mix(mix(vec3(0.55, 0.2, 1.0), vec3(0.2, 0.85, 1.0), side), mix(vec3(0.8, 0.25, 0.45), vec3(1.0, 0.6, 0.35), side), uMars);
        o = vec4(sea + limb * rim * (0.1 + 0.3 * side), 0.95);
      } else {
        float x = q - 1.0; float g = exp(-x * 20.0) * 0.5 + exp(-x * 6.0) * 0.06;
        vec3 c = mix(mix(vec3(1.0, 0.25, 0.8), vec3(0.5, 0.3, 1.0), side), vec3(0.3, 0.9, 1.0), side * exp(-x * 9.0));
        c = mix(c, mix(vec3(1.0, 0.3, 0.5), vec3(1.0, 0.62, 0.4), side), uMars);
        o = vec4(c, g * (0.45 + 0.85 * side) * (1.0 - 0.45 * uMars));                 // Mars has a thin air: a fainter halo
      } }`);

  /* ---------- post-processing: soft bloom, tone mapping, vignette, grain ---------- */
  const TRI = `out vec2 vUV; void main(){ vUV = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(vUV * 2.0 - 1.0, 0.0, 1.0); }`;
  const P_BG = program(TRI, `in vec2 vUV; uniform vec2 uOff; uniform float uAsp; out vec4 o;
    float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
    float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * n(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
    void main(){ vec2 p = (vUV - 0.5) * vec2(uAsp, 1.0) * 2.2 + uOff; float a = fbm(p), b = fbm(p * 1.7 + 11.0), c = fbm(p * 0.6 - 4.0);
      vec3 col = vec3(0.008, 0.005, 0.022) + vec3(0.42, 0.16, 0.85) * pow(a, 3.2) * 0.2 + vec3(0.05, 0.5, 0.65) * pow(b, 4.0) * 0.14 + vec3(0.9, 0.2, 0.5) * pow(c, 5.0) * 0.12;
      o = vec4(col, 1.0); }`);
  const P_DOWN = program(TRI, `in vec2 vUV; uniform sampler2D uTex; uniform float uCut; out vec4 o; void main(){ o = vec4(max(texture(uTex, vUV).rgb - uCut, 0.0), 1.0); }`);
  const P_BLUR = program(TRI, `in vec2 vUV; uniform sampler2D uTex; uniform vec2 uDir; out vec4 o;
    void main(){ vec3 c = texture(uTex, vUV).rgb * 0.227; c += (texture(uTex, vUV + uDir * 1.385).rgb + texture(uTex, vUV - uDir * 1.385).rgb) * 0.316; c += (texture(uTex, vUV + uDir * 3.231).rgb + texture(uTex, vUV - uDir * 3.231).rgb) * 0.0703; o = vec4(c, 1.0); }`);
  const P_COMP = program(TRI, `in vec2 vUV; uniform sampler2D uScene, uB1, uB2, uB3; uniform float uTime; uniform vec2 uRes; out vec4 o;
    void main(){ vec3 c = texture(uScene, vUV).rgb;
      vec3 b = texture(uB1, vUV).rgb * 0.9 + texture(uB2, vUV).rgb * 0.85 + texture(uB3, vUV).rgb * 0.8;
      c += b * 0.4;
      c = 1.0 - exp(-c * 1.08);                                                     // filmic roll-off: bright cores stay coloured
      c = mix(vec3(dot(c, vec3(0.299, 0.587, 0.114))), c, 1.22);
      c *= 1.0 - 0.42 * pow(length(vUV - 0.5) * 1.3, 2.6);
      c += (fract(sin(dot(vUV * uRes + uTime, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.016;
      o = vec4(c, 1.0); }`);
  const triVAO = gl.createVertexArray();
  let HDR = !!gl.getExtension("EXT_color_buffer_float"), RT = null;
  function makeTargets() {
    const w = canvas.width, h = canvas.height, IF = HDR ? gl.RGBA16F : gl.RGBA8, TY = HDR ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
    if (RT) { for (const t of RT.all) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); } gl.deleteRenderbuffer(RT.rb); gl.deleteFramebuffer(RT.ms); }
    const tex = (tw, th) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, IF, tw, th, 0, gl.RGBA, TY, null);
      for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
      const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0); return { tex: t, fbo: f, w: tw, h: th }; };
    const half = (n) => [Math.max(2, Math.round(w / n)), Math.max(2, Math.round(h / n))];
    const scene = tex(w, h), b1 = [tex(...half(2)), tex(...half(2))], b2 = [tex(...half(4)), tex(...half(4))], b3 = [tex(...half(8)), tex(...half(8))];
    const rb = gl.createRenderbuffer(), ms = gl.createFramebuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, rb); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, Math.min(4, gl.getParameter(gl.MAX_SAMPLES)), IF, w, h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, ms); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, rb);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    RT = { w, h, scene, b1, b2, b3, rb, ms, all: [scene, ...b1, ...b2, ...b3] };
    if (!ok && HDR) { HDR = false; makeTargets(); }
  }
  function pass(prog, target, set) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null); gl.viewport(0, 0, target ? target.w : canvas.width, target ? target.h : canvas.height);
    gl.useProgram(prog.p); set(prog.u); gl.bindVertexArray(triVAO); gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  const bindTex = (unit, t, loc) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t.tex); gl.uniform1i(loc, unit); };
  function blur(pair, src, cut) {
    pass(P_DOWN, pair[0], (u) => { bindTex(0, src, u.uTex); gl.uniform1f(u.uCut, cut); });
    for (let i = 0; i < 2; i++) {
      pass(P_BLUR, pair[1], (u) => { bindTex(0, pair[0], u.uTex); gl.uniform2f(u.uDir, 1 / pair[0].w, 0); });
      pass(P_BLUR, pair[0], (u) => { bindTex(0, pair[1], u.uTex); gl.uniform2f(u.uDir, 0, 1 / pair[0].h); });
    }
  }

  /* ---------- camera ---------- */
  const cam = { lon: -95, lat: 34, dist: 8.5, tLon: -30, tLat: 22, tDist: 3.9, vLon: 0, vLat: 0, idle: 0, intro: 0 };
  { const a = (QS.get("at") || "").split(",").map(Number);          // a shared view: ?at=longitude,latitude,distance
    if (a.length === 3 && a.every(Number.isFinite)) { cam.lon = cam.tLon = a[0]; cam.lat = cam.tLat = Math.max(-78, Math.min(78, a[1])); cam.dist = cam.tDist = Math.max(1.22, Math.min(6, a[2])); cam.intro = 1; cam.idle = -45; } }
  let MVP = null, PROJ = null, VIEW = null, EYE = [0, 0, 1], W = 1, H = 1, DPR = 1, viewD = 3.9, Q = 1, RS = 1;   // Q: render scale, lowered by watchPerf(); RS = DPR * Q
  function resize() {
    DPR = Math.min(devicePixelRatio || 1, 2); RS = DPR * Q; W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.round(W * RS); canvas.height = Math.round(H * RS); makeTargets();
  }
  addEventListener("resize", resize); resize();
  function updateCamera(dt) {
    if (!drag.on) {
      cam.idle += dt;
      if (cam.idle > (EMBED ? 0 : 2.5)) cam.tLon += dt * 3.6;                    // drift when left alone
      cam.tLon += cam.vLon * dt; cam.tLat += cam.vLat * dt; cam.vLon *= Math.pow(0.04, dt); cam.vLat *= Math.pow(0.04, dt);
    }
    cam.tLat = Math.max(-78, Math.min(78, cam.tLat)); cam.tDist = Math.max(1.22, Math.min(6, cam.tDist));
    cam.intro = Math.min(1, cam.intro + dt / 3.2);
    const k = Math.min(1, dt * (cam.intro < 1 ? 1.6 : 7));
    cam.lon += (cam.tLon - cam.lon) * k; cam.lat += (cam.tLat - cam.lat) * k; cam.dist += (cam.tDist - cam.dist) * k;
    const asp = W / H; viewD = 1 + (cam.dist - 1) * (asp < 1 ? Math.min(2.9, 1.12 / asp) : 1);
    EYE = ll(cam.lon, cam.lat, viewD); PROJ = persp(34 * DEG, asp, 0.05, 40); VIEW = lookAt(EYE); MVP = mul(PROJ, VIEW);
  }
  // Keep it smooth: if the page runs below about 40 frames a second, draw at a lower resolution, one step at a time.
  // If a step doesn't help (the browser caps the frame rate, e.g. battery saver), undo it and stop trying.
  const perf = { n: 0, sum: 0, wait: 7, prev: 0, prevQ: 1, tried: false, lock: false };
  function watchPerf(raw) {
    if (perf.lock || raw > 0.25) return;
    if (perf.wait > 0) { perf.wait -= raw; return; }
    perf.sum += raw; if (++perf.n < 90) return;
    const avg = perf.sum / perf.n; perf.n = 0; perf.sum = 0;
    if (perf.tried) { perf.tried = false; if (avg > perf.prev * 0.92) { Q = perf.prevQ; perf.lock = true; resize(); return; } }
    if (avg > 1 / 40 && Q > 0.56) { perf.prev = avg; perf.prevQ = Q; Q = Math.max(0.55, Q * 0.8); perf.tried = true; perf.wait = 1.5; resize(); }
  }
  // The sky is infinitely far away: it is drawn with the camera's turn but not its position, and turned by the
  // sidereal angle so each star stands over the right spot on Earth. SKYM is that matrix, skyDeg the angle in degrees.
  let SKYM = null, skyDeg = 0;
  function updateSky(ms) {
    const g = gmst(ms), c = Math.cos(-g), s = Math.sin(-g), V = VIEW.slice(); V[12] = V[13] = V[14] = 0; skyDeg = g / DEG;
    SKYM = mul(mul(PROJ, V), [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]);
  }
  const skyDir = (ra, dec) => ll(ra - skyDeg, dec);                 // where a star stands, as a direction from the Earth's centre
  // Screen position of a sky direction, or null when it is behind the camera or hidden by the Earth.
  function projectSky(v) {
    const V = VIEW, x = V[0] * v[0] + V[4] * v[1] + V[8] * v[2], y = V[1] * v[0] + V[5] * v[1] + V[9] * v[2], z = V[2] * v[0] + V[6] * v[1] + V[10] * v[2];
    if (z > -0.05) return null;
    const b = dot(EYE, v); if (b < 0 && dot(EYE, EYE) - b * b < 1.02) return null;
    return [(PROJ[0] * x / -z * 0.5 + 0.5) * W, (0.5 - PROJ[5] * y / -z * 0.5) * H];
  }
  const hiddenByEarth = (p) => { const d = [p[0] - EYE[0], p[1] - EYE[1], p[2] - EYE[2]], t = -dot(EYE, d) / dot(d, d); if (t <= 0 || t >= 1) return false; const q = [EYE[0] + d[0] * t, EYE[1] + d[1] * t, EYE[2] + d[2] * t]; return dot(q, q) < 1; };
  const project = (p) => { const x = MVP[0] * p[0] + MVP[4] * p[1] + MVP[8] * p[2] + MVP[12], y = MVP[1] * p[0] + MVP[5] * p[1] + MVP[9] * p[2] + MVP[13], w = MVP[3] * p[0] + MVP[7] * p[1] + MVP[11] * p[2] + MVP[15]; return [(x / w * 0.5 + 0.5) * W, (0.5 - y / w * 0.5) * H]; };
  const facing = (p) => dot(norm(p), EYE) > 1.02;

  const drag = { on: false, x: 0, y: 0, moved: 0, pts: new Map(), pinch: 0 };
  if (!EMBED) {
    canvas.addEventListener("pointerdown", (e) => { canvas.setPointerCapture(e.pointerId); drag.pts.set(e.pointerId, [e.clientX, e.clientY]); drag.on = true; drag.x = e.clientX; drag.y = e.clientY; drag.moved = 0; drag.pinch = 0; cam.idle = 0; cam.vLon = cam.vLat = 0; canvas.classList.add("drag"); hideHint(); stopTour(); });
    canvas.addEventListener("pointermove", (e) => {
      if (!drag.on) { if (e.pointerType === "mouse") hover(e.clientX, e.clientY); return; }
      drag.pts.set(e.pointerId, [e.clientX, e.clientY]); cam.idle = 0;
      if (drag.pts.size >= 2) { const [a, b] = [...drag.pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (drag.pinch) cam.tDist = 1 + (cam.tDist - 1) * (drag.pinch / d); drag.pinch = d; return; }
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y, s = 0.3 * (cam.dist - 0.85) / 3 * (900 / Math.max(500, H));
      drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
      cam.tLon -= dx * s; cam.tLat += dy * s; cam.vLon = -dx * s * 30; cam.vLat = dy * s * 30;
    });
    const up = (e) => { drag.pts.delete(e.pointerId); drag.pinch = 0; if (!drag.pts.size) { drag.on = false; canvas.classList.remove("drag"); if (drag.moved < 6) tap(e.clientX, e.clientY, e.pointerType); } else { const [p] = [...drag.pts.values()]; drag.x = p[0]; drag.y = p[1]; } };
    canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("pointerleave", () => { if (!drag.on && !sel) tip.style.display = "none"; });
    canvas.addEventListener("wheel", (e) => { e.preventDefault(); cam.tDist = 1 + (cam.tDist - 1) * Math.exp(e.deltaY * 0.0012); cam.idle = 0; hideHint(); stopTour(); }, { passive: false });
  }
  const hideHint = () => { $("#hint").style.opacity = "0"; };
  if (matchMedia("(pointer: coarse)").matches) $("#hint").textContent = "Drag to spin · pinch to zoom · tap a point for details";
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
    { id: "power", name: "Energy: power stations", color: [1, 0.85, 0.3], unit: "" },
    { id: "mil", name: "Military bases", color: [0.82, 0.92, 0.42], unit: "" },
    { id: "quakes", name: "Earthquakes (24 h)", color: [1, 0.35, 0.3], unit: "" },
    { id: "events", name: "Wildfires, storms & volcanoes", color: [1, 0.55, 0.15], unit: "" },
    { id: "aurora", name: "Aurora", color: [0.4, 1, 0.6], unit: "" },
    { id: "sats", name: "Satellites in orbit", color: [0.6, 0.95, 1], unit: "" },
    { id: "space", name: "Space station", color: [1, 1, 1], unit: "" },
    { id: "moon", name: "The Moon", color: [0.92, 0.93, 1], unit: "" },
    { id: "sky", name: "Constellations", color: [0.6, 0.66, 1], unit: "" },
    { id: "rain", name: "Weather: precipitation", color: [0.45, 0.75, 1], unit: "" },
    { id: "clouds", name: "Weather: clouds", color: [0.85, 0.92, 1], unit: "", off: true },          // off: starts switched off
    { id: "cur", name: "Ocean currents", color: [0.25, 0.7, 1], unit: "" },
    { id: "surf", name: "Waves & surf", color: [0.3, 0.95, 0.8], unit: "" },
    { id: "tide", name: "Tides", color: [0.55, 1, 0.9], unit: "" },
    { id: "wind", name: "Wind & jet stream", color: [0.5, 0.92, 1], unit: "" },
    { id: "temp", name: "Temperature", color: [1, 0.62, 0.25], unit: "", off: true },
    { id: "pop", name: "Population", color: [1, 0.45, 0.75], unit: "people" },
    { id: "vital", name: "Births & deaths", color: [1, 0.85, 0.5], unit: "today" },
  ];
  // How fresh each layer is, in a word next to its dot. "part": a worldwide static map with live data for one region.
  const WORD = { live: "Live", part: "Part live", delay: "Delayed", static: "Static", model: "Modelled", off: "" };
  const TRAMP = [[-40, [0.7, 0.3, 1]], [-20, [0.3, 0.4, 1]], [-5, [0.2, 0.8, 1]], [5, [0.3, 1, 0.7]], [15, [0.9, 1, 0.3]], [25, [1, 0.65, 0.15]], [35, [1, 0.25, 0.2]], [45, [1, 0.4, 0.8]]];   // temperature colours, °C
  const MIL = [["Military base", [0.85, 0.95, 0.4]], ["Military airfield", [0.6, 0.88, 1]], ["Naval base", [0.35, 0.6, 1]], ["Barracks", [0.75, 0.8, 0.5]], ["Range or training area", [1, 0.62, 0.35]]];
  const FUEL = [["Solar", [1, 0.85, 0.25]], ["Wind", [0.6, 1, 0.95]], ["Hydro", [0.25, 0.55, 1]], ["Nuclear", [0.6, 1, 0.4]], ["Gas", [1, 0.55, 0.2]], ["Coal", [0.95, 0.3, 0.3]], ["Oil", [0.8, 0.45, 0.25]], ["Biomass", [0.55, 0.85, 0.35]], ["Geothermal", [1, 0.4, 0.7]], ["Other", [0.7, 0.6, 1]]];
  const L = {}, QON = new Set((QS.get("on") || "").split(",")), QOFF = new Set((QS.get("off") || "").split(","));   // ?on=a,b&off=c from a shared link
  for (const l of LAYERS) {
    const start = QON.has(l.id) ? true : QOFF.has(l.id) ? false : !l.off;
    const b = document.createElement("button"); b.className = "layer"; b.type = "button"; b.style.color = css(l.color); b.setAttribute("aria-pressed", start);
    b.innerHTML = `<span class="sw"></span><span class="nm">${l.name}</span><span class="ct mono">&ndash;</span><span class="st"><span class="dot off"></span><b class="bd"></b><span class="tx">waiting for data</span></span>`;
    b.onclick = () => { l.on = !l.on; b.setAttribute("aria-pressed", l.on); };
    $("#layers").appendChild(b);
    L[l.id] = Object.assign(l, { on: start, el: b, count(n) { b.querySelector(".ct").textContent = typeof n === "number" ? n.toLocaleString("en-US") : n; }, status(kind, text) { l.kind = kind; b.querySelector(".dot").className = "dot " + (kind === "part" ? "live" : kind); const w = b.querySelector(".bd"); w.className = "bd " + kind; w.textContent = WORD[kind] || ""; b.querySelector(".tx").textContent = text; } });
  }

  // The key: what each colour and shape on the globe stands for.
  { const sw = (c) => `<i class="ks" style="background:${css(c)}"></i>`;
    const KEY = {
      markets: `${sw(C.up)} spike: up on the day · ${sw(C.down)} spike: down. Taller means a bigger move. The fine bars around each exchange are single companies.`,
      planes: `${sw(C.air)} each point with a fading trail is one real aircraft, carried forward between updates.`,
      routes: `${sw(C.route)} arcs: scheduled routes (a 2014 snapshot) · ${sw([1, 1, 1])} airports. The sparks riding the arcs show direction only; they are not real flights.`,
      ships: `${sw(C.ship)} still points: ports worldwide · moving points with a trail: real ships, Baltic only.`,
      rail: `${sw(C.rail)} lines: railways worldwide · moving points: real trains, Finland only. The pulses on the lines are decoration.`,
      roads: `${sw(C.road)} lines: major highways · bright points: live traffic counters in Finland, brighter and larger with more vehicles.`,
      net: `${sw(C.cable)} lines: communication cables · ${sw(C.dc)} points: data centres.`,
      power: FUEL.map((f) => `${sw(f[1])} ${f[0]}`).join(" · ") + `. Larger points are bigger stations.`,
      mil: MIL.map((k) => `${sw(k[1])} ${k[0].toLowerCase()}`).join(" · ") + `. Only the sites volunteers have mapped in OpenStreetMap, so it is not a complete list.`,
      quakes: `${sw([1, 0.85, 0.4])} small → ${sw([1, 0.5, 0.2])} → ${sw([1, 0.2, 0.25])} → ${sw([1, 0.3, 0.8])} strong. Rings mark magnitude 2.5 and up.`,
      events: `${sw([1, 0.5, 0.12])} wildfire · ${sw([0.6, 0.95, 1])} severe storm (rings) · ${sw([1, 0.2, 0.2])} volcano · ${sw([0.8, 0.9, 1])} iceberg or sea ice.`,
      aurora: `${sw([0.25, 1, 0.5])} to ${sw([0.85, 0.35, 1])} curtains: the denser, the higher the chance of aurora overhead.`,
      sats: `${sw([0.55, 0.95, 1])} low orbit · ${sw([0.75, 0.55, 1])} medium orbit · ${sw([1, 0.82, 0.45])} high orbit (geostationary ring).`,
      space: `${sw([1, 1, 1])} the International Space Station, with a long trail.`,
      moon: `${sw([0.92, 0.93, 1])} the Moon in fine particles: where it stands, how much of it is lit and the face it shows are real, from the Lunar Reconnaissance Orbiter's pictures. It is drawn about 15 times too big and too close, so that you can see it. The ring on the Earth marks the spot where it is straight overhead.`,
      sky: `${sw([0.6, 0.66, 1])} the real stars down to the faintest the eye can see, coloured as they are, with the 88 constellation figures. The sky turns once a day, as it does overhead.`,
      rain: `${sw([0.45, 0.75, 1])} falling streaks where satellites see rain or snow; colour follows NASA's rate scale.`,
      clouds: `${sw([0.85, 0.92, 1])} a fine white haze where yesterday's satellite pictures show bright cloud tops. Snow and ice can read as cloud.`,
      cur: `${sw([0.15, 0.35, 1])} to ${sw([1, 1, 1])} dashed lines that creep the way the surface water flows, whiter where it runs faster. Blank along the equator, where this satellite method does not work. Slow dashes, so they read apart from the wind.`,
      surf: `${sw([0.2, 0.9, 0.75])} to ${sw([1, 0.3, 0.75])} lines running the way the swell travels, drawn where waves top 2 m, redder when taller · ${sw([1, 0.55, 0.45])} ringed points: surf breaks · ${sw([1, 0.95, 0.6])} points: wave buoys.`,
      tide: `${sw([0.3, 1, 0.9])} rising · ${sw([1, 0.45, 0.8])} falling. Each station is a short filament, taller the nearer it is to high water.`,
      wind: `${sw([0.3, 0.8, 1])} to ${sw([1, 0.6, 0.9])} low streaks: wind near the ground, running the way it blows, pinker when stronger · ${sw([1, 0.85, 0.4])} to ${sw([1, 0.3, 0.6])} high streaks: the jet stream, about 10 km up, where it tops 108 km/h.`,
      temp: TRAMP.map((s) => `${sw(s[1])} ${s[0]}°`).join(" · ") + ` C, air temperature 2 m above the ground. While this layer is on, the land and sea dots take these colours.`,
      pop: `${sw([0.75, 0.25, 1])} to ${sw([1, 1, 1])} filaments: taller and whiter means more people · ${sw([1, 0.75, 0.45])} warm points on the night side: city lights.`,
      vital: `${sw([1, 0.9, 0.5])} rising sparks: births · ${sw([0.6, 0.45, 0.9])} sinking sparks: deaths. Modelled from country rates, not records of people.`,
    };
    const box = $("#keyBody");
    if (box) box.innerHTML = `<p class="kd"><span><span class="dot live"></span>Live: updates as it happens</span><span><span class="dot delay"></span>Delayed: minutes to hours behind</span><span><span class="dot static"></span>Static: a mapped snapshot</span><span><span class="dot model"></span>Modelled: calculated from real measurements</span></p>` + LAYERS.map((l) => `<p><b style="color:${css(l.color)}">${l.name}</b><br>${KEY[l.id] || ""}</p>`).join(""); }

  const S = {};           // figures the feeds leave behind for the headline number and the tour
  const M = {};           // meshes
  const picks = [];       // things a visitor can point at: { p, kind, title, sub }
  const quad = mesh(P_ATMO, [["aUV", 2]], [-1, -1, 1, -1, -1, 1, 1, 1], gl.TRIANGLE_STRIP);

  // Stars and the graticule need no data.
  const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const ramp = (stops, t) => { const x = Math.max(0, Math.min(0.9999, t)) * (stops.length - 1), i = Math.floor(x); return mix3(stops[i], stops[i + 1], x - i); };
  const STAR = [[0.6, 0.72, 1], [0.85, 0.88, 1], [1, 1, 1], [1, 0.9, 0.75], [1, 0.72, 0.6], [0.8, 0.6, 1]];
  { const a = []; for (let i = 0; i < 5200; i++) { const p = norm([rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1]), r = 14, c = STAR[(rnd() * STAR.length) | 0], big = rnd() < 0.04;
      a.push(p[0] * r, p[1] * r, p[2] * r, c[0], c[1], c[2], (big ? 0.9 : 0.12 + rnd() * rnd() * 0.6) * 20, big ? 1.9 : 0.9 + rnd() * 0.7, rnd()); }   
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

  const LANDRAMP = [[0.2, 0.95, 0.8], [0.3, 0.75, 1.0], [0.58, 0.5, 1.0], [0.85, 0.45, 1.0], [1.0, 0.55, 0.85], [0.8, 0.9, 1.0]];
  const SEARAMP = [[0.1, 0.45, 0.9], [0.2, 0.3, 0.9], [0.4, 0.3, 0.85], [0.3, 0.6, 0.9]];
  let reveal = 0, world = null;
  function buildWorld(w) {
    world = w;
    if (w.land) {
      const bits = Uint8Array.from(atob(w.land.b64), (c) => c.charCodeAt(0)), LW = w.land.w, LH = w.land.h;
      const N = LITE ? 170000 : 380000, a = [], sea = [], g = Math.PI * (3 - Math.sqrt(5));
      for (let i = 0; i < N; i++) {                               // evenly spread points; keep the ones on land
        const y = 1 - (i + 0.5) / N * 2, r = Math.sqrt(1 - y * y), th = i * g, x = Math.sin(th) * r, z = Math.cos(th) * r;
        const lat = Math.asin(y) / DEG, lon = Math.atan2(x, z) / DEG;
        const n = Math.min(LH - 1, Math.floor((90 - lat) / 180 * LH)) * LW + Math.min(LW - 1, Math.floor((lon + 180) / 360 * LW));
        if (bits[n >> 3] & (128 >> (n & 7))) {
          // colour drifts with latitude and longitude: teal tropics, violet mid-latitudes, rose and ice toward the poles
          const band = Math.abs(lat) / 90 + 0.12 * Math.sin(lon * 0.07 + lat * 0.11) + (rnd() - 0.5) * 0.12, c = ramp(LANDRAMP, band);
          a.push(x, y, z, c[0], c[1], c[2], 0.36 + rnd() * 0.34, 1.0 + rnd() * 0.55, rnd());
        } else if (i % 5 === 0) {
          const c = ramp(SEARAMP, Math.abs(lat) / 90 + (rnd() - 0.5) * 0.2);
          sea.push(x, y, z, c[0], c[1], c[2], 0.1 + rnd() * 0.12, 0.9 + rnd() * 0.3, rnd());
        }
      }
      M.land = mesh(P_POINT, POINT, a, gl.POINTS); M.sea = mesh(P_POINT, POINT, sea, gl.POINTS);
    }
    if (w.coast) M.coast = mesh(P_LINE, LINE, lineVerts(w.coast, C.coast, 0.42), gl.LINES);
    if (w.rails) { M.rails = mesh(P_LINE, LINE, lineVerts(w.rails, C.rail, 0.2), gl.LINES); L.rail.count(w.rails.length); L.rail.status("static", "network: Natural Earth · live trains: connecting"); }
    if (w.roads) { M.roads = mesh(P_LINE, LINE, lineVerts(w.roads, C.road, 0.16), gl.LINES); L.roads.count(w.roads.length); L.roads.status("static", "major highways: Natural Earth · live counts: connecting"); }
    if (w.cables) { M.cables = mesh(P_LINE, LINE, lineVerts(w.cables.map((c) => c.p), C.cable, 0.34), gl.LINES); }
    if (w.dcs) { { const a = []; for (const d of w.dcs) { const p = ll(d[0], d[1]), c = ramp([[1, 0.2, 0.75], [1, 0.4, 0.95], [1, 0.75, 0.95], [0.75, 0.6, 1]], rnd()); a.push(p[0], p[1], p[2], c[0], c[1], c[2], 0.9, 1.4 + rnd() * 0.7, rnd()); } M.dcs = mesh(P_POINT, POINT, a, gl.POINTS); } L.net.count(w.dcs.length);
      for (const d of w.dcs) picks.push({ p: ll(d[0], d[1]), layer: "net", kind: "Data centre", title: d[2] || "Data centre", sub: d[3] || "OpenStreetMap" }); }
    if (w.dcs) { const g = new Map(); let top = null;                 // the densest 4-degree cluster of data centres, for the tour
      for (const d of w.dcs) { const k = Math.floor(d[0] / 4) + "," + Math.floor(d[1] / 4), c = g.get(k) || g.set(k, { n: 0, lon: 0, lat: 0 }).get(k); c.n++; c.lon += d[0]; c.lat += d[1]; if (!top || c.n > top.n) top = c; }
      if (top) S.dc = { n: top.n, lon: top.lon / top.n, lat: top.lat / top.n }; }
    if (w.dcs || w.cables) L.net.status("static", `${(w.cables || []).length.toLocaleString("en-US")} cables · OpenStreetMap, weekly`);
    if (w.ports) { M.ports = mesh(P_POINT, POINT, pts(w.ports.map((p) => [p[0] / 100, p[1] / 100]), C.ship, 0.7, 1.5), gl.POINTS); L.ships.count(w.ports.length); L.ships.status("static", "ports: Natural Earth · live ships: connecting");
      for (const p of w.ports) picks.push({ p: ll(p[0] / 100, p[1] / 100), layer: "ships", kind: "Port", title: p[2], sub: "" }); }
    if (w.airports) {
      const ap = w.airports.map((a) => ll(a[0] / 100, a[1] / 100));
      M.airports = mesh(P_POINT, POINT, pts(w.airports.map((a) => [a[0] / 100, a[1] / 100]), [1, 1, 1], 0.9, 1.9, 0.2), gl.POINTS); L.routes.count(w.airports.length);
      w.airports.forEach((a, i) => picks.push({ p: ap[i], layer: "routes", kind: "Airport · " + a[2], title: a[3], sub: a[4] }));
      const arcs = [], flow = [], TRAIL = LITE ? 5 : 7;
      for (const [i, j, wt] of w.routes || []) {
        const A = ap[i], B = ap[j]; if (!A || !B) continue;
        const om = Math.acos(Math.max(-1, Math.min(1, dot(A, B)))); if (om < 0.02) continue;
        const so = Math.sin(om), n = Math.max(6, Math.ceil(om / (4 * DEG))), al = 0.035 + Math.min(wt, 8) * 0.006; let prev = null;
        for (let k = 0; k <= n; k++) { const t = k / n, s1 = Math.sin((1 - t) * om) / so, s2 = Math.sin(t * om) / so, r = 1 + (0.012 + om * 0.07) * Math.sin(Math.PI * t);
          const p = [(A[0] * s1 + B[0] * s2) * r, (A[1] * s1 + B[1] * s2) * r, (A[2] * s1 + B[2] * s2) * r];
          if (prev) arcs.push(prev[0], prev[1], prev[2], C.route[0], C.route[1], C.route[2], al, (k - 1) / n, p[0], p[1], p[2], C.route[0], C.route[1], C.route[2], al, t); prev = p; }
        const count = Math.min(5, 1 + Math.floor(wt / 2));
        for (let k = 0; k < count; k++) { const fwd = rnd() < 0.5, a = fwd ? A : B, b = fwd ? B : A, ph = rnd(), sp = (0.03 + rnd() * 0.02) / om; const fc = ramp([[0.7, 0.6, 1], [1, 0.7, 0.95], [1, 0.9, 0.7], [0.7, 0.95, 1]], rnd()); for (let g2 = 0; g2 < TRAIL; g2++) flow.push(a[0], a[1], a[2], b[0], b[1], b[2], ph - g2 * sp * 0.55, sp, fc[0], fc[1], fc[2], 0.95 * (1 - g2 / TRAIL), g2 ? 1.0 : 1.7); }
      }
      M.arcs = mesh(P_LINE, LINE, arcs, gl.LINES);
      M.flow = mesh(P_FLOW, [["aA", 3], ["aB", 3], ["aPhase", 1], ["aSpeed", 1], ["aColor", 4], ["aSize", 1]], flow, gl.POINTS);
      L.routes.status("static", `${(w.routes || []).length.toLocaleString("en-US")} routes · OurAirports, OpenFlights (2014)`);
    }
    if (w.pop) {   // a fine vertical filament per half-degree cell: the taller and whiter, the more people live there
      const ln = [], hd = []; let total = 0;
      for (const [x, y, k] of w.pop) {
        total += k; const q = Math.min(1, Math.sqrt(k / 22000)), h = 0.003 + q * 0.17, a = ll(x / 100, y / 100), b = ll(x / 100, y / 100, 1 + h);
        const c = ramp([[0.75, 0.25, 1], [1, 0.3, 0.75], [1, 0.6, 0.35], [1, 0.9, 0.6], [1, 1, 1]], q);
        const off = rnd(); ln.push(a[0], a[1], a[2], 0.6, 0.2, 1, 0.1 + q * 0.2, off, b[0], b[1], b[2], c[0], c[1], c[2], 0.35 + q * 0.65, off + 1);
        const n = 1 + Math.floor(q * 9);
        for (let i = 1; i <= n; i++) { const t = i / n, p = ll(x / 100, y / 100, 1 + h * t); hd.push(p[0], p[1], p[2], c[0], c[1], c[2], 0.3 + t * 0.6, i === n ? 1.5 : 1.05, rnd()); }
        if (k >= 1500) picks.push({ p: b, layer: "pop", kind: "Population", title: `${(k / 1000).toFixed(1)} million people`, sub: "in towns and cities of 15,000+ within this half-degree cell" });
      }
      { let top = null; for (const r of w.pop) if (!top || r[2] > top[2]) top = r; if (top) S.pop = { lon: top[0] / 100, lat: top[1] / 100, k: top[2] }; }
      const lights = [];                                          // city lights on the night side, scattered around each populated cell
      for (const [x, y, k] of w.pop) { const n = Math.min(26, 1 + Math.round(Math.sqrt(k / 40)));
        for (let i = 0; i < n; i++) { const r = Math.sqrt(rnd()) * 0.42, th = rnd() * 6.283, p = ll(x / 100 + Math.cos(th) * r / Math.max(0.2, Math.cos(y / 100 * DEG)), y / 100 + Math.sin(th) * r), wm = rnd();
          lights.push(p[0], p[1], p[2], 1, 0.62 + wm * 0.3, 0.25 + wm * 0.45, 0.22 + rnd() * 0.3, 0.95 + rnd() * 0.5, rnd()); } }
      M.lights = mesh(P_POINT, POINT, lights, gl.POINTS);
      M.popLines = mesh(P_LINE, LINE, ln, gl.LINES); M.popDots = mesh(P_POINT, POINT, hd, gl.POINTS);
      L.pop.count(`${(total / 1e6).toFixed(2)} bn`); L.pop.status("static", "people in towns and cities of 15,000+ · GeoNames");
    }
    if (w.power) {
      const a = []; let gw = 0;
      for (const [x, y, mw, f, name] of w.power) { const p = ll(x / 100, y / 100), c = FUEL[f][1], q = Math.min(1, Math.sqrt(mw / 6000)); gw += mw / 1000;
        a.push(p[0], p[1], p[2], c[0], c[1], c[2], 0.5 + q * 0.5, 1.0 + q * 1.5, rnd());
        if (mw >= 1000) picks.push({ p, layer: "power", kind: FUEL[f][0] + " power station", title: name || "Power station", sub: `${mw.toLocaleString("en-US")} MW` }); }
      M.power = mesh(P_POINT, POINT, a, gl.POINTS); L.power.count(w.power.length);
      L.power.status("static", `${Math.round(gw).toLocaleString("en-US")} GW mapped, coloured by fuel · WRI database`);
    }
    if (w.bases) { const a = [], n = [0, 0, 0, 0, 0];
      for (const [x, y, k, name] of w.bases) { const p = ll(x / 100, y / 100), c = MIL[k][1], big = k < 3; n[k]++;
        a.push(p[0], p[1], p[2], c[0], c[1], c[2], big ? 0.9 : 0.6, big ? 1.5 + rnd() * 0.5 : 1.1 + rnd() * 0.3, rnd());
        picks.push({ p, layer: "mil", kind: MIL[k][0], title: name || "Name not mapped", sub: "OpenStreetMap" }); }
      M.mil = mesh(P_POINT, POINT, a, gl.POINTS); L.mil.count(w.bases.length);
      L.mil.status("static", `${num(n[0])} bases, ${num(n[1])} airfields, ${num(n[2])} naval bases, ${num(n[3])} barracks, ${num(n[4])} ranges · as mapped in OpenStreetMap, weekly · not a complete list`);
    } else L.mil.status("off", "first data sync in progress, check back in a few minutes");
    if (w.vital) setupVital(w.vital);
    if (MK) buildMarkets(MK);
    buildTemp();
  }

  /* ---------- births and deaths (modelled from real country rates) ---------- */
  const EV_N = 3600, evData = new Float32Array(EV_N * 5).fill(-99); let evI = 0, vital = null, evDirty = false;
  M.events = mesh(P_EVENT, [["aPos", 3], ["aT0", 1], ["aKind", 1]], evData, gl.POINTS, true);
  function setupVital(rows) {
    const cum = (k) => { let s = 0; const c = new Float64Array(rows.length); rows.forEach((r, i) => { s += r[k]; c[i] = s; }); return { c, total: s }; };
    vital = { rows, pos: rows.map((r) => ll(r[0] / 100, r[1] / 100)), b: cum(2), d: cum(3) };
    L.vital.status("model", "born / died today (UTC) · each spark is an expected event, from World Bank rates");
  }
  const poisson = (m) => { let k = 0, p = Math.exp(-m), s = p; const u = rnd(); while (u > s && k < 40) { k++; p *= m / k; s += p; } return k; };
  function spawnVital(dt, now) {
    if (!vital || !L.vital.on) return;
    for (const [set, kind] of [[vital.b, 1], [vital.d, 0]]) {
      for (let n = poisson(set.total / 86400 * dt); n > 0; n--) {
        const x = rnd() * set.total; let lo = 0, hi = set.c.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (set.c[m] < x) lo = m + 1; else hi = m; }
        const p = norm([vital.pos[lo][0] + (rnd() - 0.5) * 0.02, vital.pos[lo][1] + (rnd() - 0.5) * 0.02, vital.pos[lo][2] + (rnd() - 0.5) * 0.02]);
        for (let s2 = kind ? 4 : 2; s2 > 0; s2--) { const q = norm([p[0] + (rnd() - 0.5) * 0.012, p[1] + (rnd() - 0.5) * 0.012, p[2] + (rnd() - 0.5) * 0.012]); evData.set([q[0], q[1], q[2], now + rnd() * 0.5, kind], evI * 5); evI = (evI + 1) % EV_N; } evDirty = true;
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
  const NAMES = { "^TNX": "US 10Y yield", "^VIX": "VIX", "DX-Y.NYB": "Dollar index", "EURUSD=X": "EUR/USD", "GBPUSD=X": "GBP/USD", "JPY=X": "USD/JPY", "CNY=X": "USD/CNY", "BTC-USD": "Bitcoin", "ETH-USD": "Ethereum", "SOL-USD": "Solana" };
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
      lines.push(a[0], a[1], a[2], c[0], c[1], c[2], 0.3, up ? 0 : 1, b[0], b[1], b[2], c[0], c[1], c[2], 1, up ? 1 : 0);   // the pulse climbs on a gain and sinks on a loss
      for (let k = 0; k < 9; k++) { const t = k / 8, p = ll(lon, lat, 1 + h * t); heads.push(p[0], p[1], p[2], c[0], c[1], c[2], 0.35 + t * 0.65, k === 8 ? 3.4 : 1.3, rnd()); }
      picks.push({ p: b, layer: "markets", kind: q.sym.endsWith("=F") ? "Commodity" : "Stock index", title: pin[2], sub: `${fmt(q.price)} ${q.currency || ""} · ${pct(q.pct)}${q.stale ? " · last known" : ""}` });
      const el = document.createElement("div"); el.className = "lab mono"; el.innerHTML = `${pin[2]}<b class="${up ? "up" : "down"}">${pct(q.pct)}</b>`; $("#labels").appendChild(el);
      marketLabels.push({ el, p: b, w: Math.abs(q.pct ?? 0) });
    });
    marketLabels.sort((x, y) => y.w - x.w);
    M.spikes = mesh(P_LINE, LINE, lines, gl.LINES); M.heads = mesh(P_POINT, POINT, heads, gl.POINTS);
    L.markets.count(mk.quotes.length); marketStatus();
    const tape = mk.quotes.map((q) => `<span><i>${(PIN[q.sym] || [])[2] || NAMES[q.sym] || q.sym}</i>${fmt(q.price)} <b class="${(q.pct ?? 0) >= 0 ? "up" : "down"}">${pct(q.pct)}</b></span>`).join("");
    $("#tape").innerHTML = tape + tape;
  }
  /* ---------- Markets today: the day's winners and losers on every major exchange ---------- */
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  let STOCKS = null, boardOpen = null, boardMode = "markets";      // the bottom-left board shows the markets or the surf report
  // Regular trading hours in each exchange's own time (minutes after midnight), Monday to Friday. Public holidays and
  // half-days are not in here, so the labels say "regular hours".
  const HOURS = { nyse: ["America/New_York", [570, 960]], nasdaq: ["America/New_York", [570, 960]], tsx: ["America/Toronto", [570, 960]], b3: ["America/Sao_Paulo", [600, 1020]], bmv: ["America/Mexico_City", [510, 900]],
    lse: ["Europe/London", [480, 990]], xetra: ["Europe/Berlin", [540, 1050]], paris: ["Europe/Paris", [540, 1050]], six: ["Europe/Zurich", [540, 1050]], ams: ["Europe/Amsterdam", [540, 1050]],
    tse: ["Asia/Tokyo", [540, 690], [750, 930]], hkex: ["Asia/Hong_Kong", [570, 720], [780, 960]], sse: ["Asia/Shanghai", [570, 690], [780, 900]], szse: ["Asia/Shanghai", [570, 690], [780, 900]], nse: ["Asia/Kolkata", [555, 930]],
    krx: ["Asia/Seoul", [540, 930]], twse: ["Asia/Taipei", [540, 810]], sgx: ["Asia/Singapore", [540, 720], [780, 1020]], asx: ["Australia/Sydney", [600, 960]], jse: ["Africa/Johannesburg", [540, 1020]] };
  const zoneFmt = {};
  function isOpen(id, ms = Date.now()) {
    const h = HOURS[id]; if (!h) return false;
    try {
      const f = zoneFmt[h[0]] || (zoneFmt[h[0]] = new Intl.DateTimeFormat("en-US", { timeZone: h[0], weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })), o = {};
      for (const p of f.formatToParts(new Date(ms))) o[p.type] = p.value;
      if (o.weekday === "Sat" || o.weekday === "Sun") return false;
      const m = +o.hour * 60 + +o.minute; return h.slice(1).some(([a, b]) => m >= a && m < b);
    } catch (e) { return false; }
  }
  function marketStatus() {
    if (!MK) return;
    const age = Math.round((Date.now() - Date.parse(MK.updatedAt)) / 60000);
    L.markets.status("delay", `${STOCKS ? `${S.open} of ${STOCKS.exchanges.length} exchanges open now (regular hours, holidays not counted) · ` : ""}prices updated ${age < 90 ? age + " min" : Math.round(age / 60) + " h"} ago · Yahoo Finance`);
  }
  function buildStocks(j) {
    STOCKS = j;
    for (const x of j.exchanges) { x.stocks.sort((a, b) => b[3] - a[3]); x.up = x.stocks.filter((q) => q[3] > 0).length; x.down = x.stocks.filter((q) => q[3] < 0).length; x.avg = x.stocks.reduce((n, q) => n + q[3], 0) / x.stocks.length; }
    drawStocks(); $("#boardBtn").hidden = false; renderBoard();
  }
  // An exchange that is trading now gets a bright ring and full-strength bars; a closed one is dimmed.
  function drawStocks() {
    const ln = [], hd = [], rg = [];
    for (let i = picks.length - 1; i >= 0; i--) if (picks[i].live === "stock") picks.splice(i, 1);
    for (const x of STOCKS.exchanges) {
      x.open = isOpen(x.id); const dim = x.open ? 1 : 0.32;
      if (x.open) { ring(rg, x.lon, x.lat, 2.95, 110, [0.45, 1, 0.75], 0.9, 1.15); ring(rg, x.lon, x.lat, 3.3, 80, [0.45, 1, 0.75], 0.4, 0.95); }
      // a spiral skyline around the exchange: one hair-thin bar per company, best performers in the middle
      x.stocks.forEach((q, i) => {
        const r = 0.3 + 2.3 * Math.sqrt((i + 0.5) / x.stocks.length), th = i * 2.39996, lat = x.lat + Math.sin(th) * r, lon = x.lon + Math.cos(th) * r / Math.max(0.2, Math.cos(x.lat * DEG));
        const m = Math.min(1, Math.abs(q[3]) / 6), h = 0.006 + m * 0.1, up = q[3] >= 0, c = up ? ramp([[0.1, 0.75, 0.55], [0.3, 1, 0.5], [0.85, 1, 0.6]], m) : ramp([[0.8, 0.25, 0.5], [1, 0.3, 0.4], [1, 0.6, 0.35]], m), a = ll(lon, lat), b = ll(lon, lat, 1 + h), off = rnd();
        ln.push(a[0], a[1], a[2], c[0], c[1], c[2], 0.3 * dim, up ? off : off + 1, b[0], b[1], b[2], c[0], c[1], c[2], dim, up ? off + 1 : off);
        hd.push(b[0], b[1], b[2], c[0], c[1], c[2], dim, 1.5 + m, rnd());
        picks.push({ p: b, layer: "markets", live: "stock", kind: x.name, title: q[1], sub: `${q[0]} · ${fmt(q[2])} ${q[4]} · ${pct(q[3])} · market ${x.open ? "open now" : "closed"}` });
      });
    }
    M.stockLines = mesh(P_LINE, LINE, ln, gl.LINES); M.stockHeads = mesh(P_POINT, POINT, hd, gl.POINTS); M.xRings = mesh(P_POINT, POINT, rg, gl.POINTS);
    S.open = STOCKS.exchanges.filter((x) => x.open).length; marketStatus();
  }
  setInterval(() => { if (STOCKS && STOCKS.exchanges.some((x) => x.open !== isOpen(x.id))) { drawStocks(); renderBoard(); } else marketStatus(); }, 30000);
  function renderBoard() {
    const box = $("#board"); if (box.hidden) return;
    if (boardMode === "surf") { if (OC && OC.spots && OC.spots.length) renderSurf(box); return; }
    if (!STOCKS) return; box.textContent = "";
    const head = el("div", "bh"); const back = el("button", "bx", boardOpen ? "← All exchanges" : "Markets today"); back.type = "button"; back.disabled = !boardOpen; back.onclick = () => { boardOpen = null; renderBoard(); };
    const close = el("button", "bx", "×"); close.type = "button"; close.setAttribute("aria-label", "Close"); close.onclick = () => { box.hidden = true; };
    head.append(back, close); box.append(head);
    const body = el("div", "bb"); box.append(body);
    const split = (up, down, flat) => { const w = el("div", "split"), a = el("i", "u"), b = el("i", "d"), t = up + down + flat || 1; w.append(a, b); requestAnimationFrame(() => requestAnimationFrame(() => { a.style.width = (up / t * 100) + "%"; b.style.width = (down / t * 100) + "%"; })); return w; };
    if (!boardOpen) {
      const all = STOCKS.exchanges.flatMap((x) => x.stocks), up = all.filter((q) => q[3] > 0).length, down = all.filter((q) => q[3] < 0).length;
      const g = el("div", "glob"); g.append(el("div", "big mono", `${up} up · ${down} down`), el("div", "sm", `${all.length} companies on ${STOCKS.exchanges.length} exchanges · ${S.open} open now · latest session · delayed`), split(up, down, all.length - up - down)); body.append(g);
      for (const x of [...STOCKS.exchanges].sort((a, b) => b.avg - a.avg)) {
        const row = el("button", "xr"); row.type = "button";
        const top = el("div", "xt"); top.append(el("b", null, x.name), el("span", "mono " + (x.avg >= 0 ? "up" : "down"), pct(x.avg)));
        row.append(top, el("div", "sm", `${x.city} · ${x.open ? "open now" : "closed"} · ${x.up} up, ${x.down} down${x.stale ? " · last known" : ""}`), split(x.up, x.down, x.stocks.length - x.up - x.down));
        row.onclick = () => { boardOpen = x.id; stopTour(); flyTo(x.lon, x.lat - (SMALL ? 8 : 0), 2.1); cam.idle = -45; renderBoard(); };
        body.append(row);
      }
    } else {
      const x = STOCKS.exchanges.find((e) => e.id === boardOpen), max = Math.max(1, ...x.stocks.map((q) => Math.abs(q[3])));
      const g = el("div", "glob"); g.append(el("div", "big", x.name), el("div", "sm mono", `${x.up} up · ${x.down} down · average ${pct(x.avg)}`), split(x.up, x.down, x.stocks.length - x.up - x.down)); body.append(g);
      x.stocks.forEach((q, i) => {
        const r = el("div", "sr"), bar = el("div", "bar"), fill = el("i", q[3] >= 0 ? "u" : "d"); bar.append(fill);
        r.append(el("span", "sy mono", q[0].replace(/\.[A-Z]+$/, "")), el("span", "nm", q[1]), bar, el("span", "pc mono " + (q[3] >= 0 ? "up" : "down"), pct(q[3])));
        body.append(r); setTimeout(() => { fill.style.width = (Math.abs(q[3]) / max * 50) + "%"; }, 30 + i * 14);
      });
    }
  }
  const openBoard = (mode) => { const b = $("#board"); b.hidden = !b.hidden && boardMode === mode; boardMode = mode; if (!b.hidden) { $("#panel").open = false; stopTour(); stopReplay(); closeMe(); select(null); renderBoard(); } };
  $("#boardBtn").onclick = () => openBoard("markets"); $("#surfBtn").onclick = () => openBoard("surf");
  const loadStocks = () => getJson("../data/globe/stocks.json").then(buildStocks).catch(() => {});

  function layoutLabels() {
    const used = [], show = L.markets.on && PLANET === "earth";
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
  const planes = moverSet(C.air, LITE ? 12 : 18, 40, 2.1), ships = moverSet(C.ship, 10, 240, 1.9), trains = moverSet(C.rail, 6, 20, 2.1);
  const moverPos = (m, t) => { const dt = Math.max(0, Math.min(600, t - m.t0)); const p = norm([m.p[0] + m.v[0] * dt, m.p[1] + m.v[1] * dt, m.p[2] + m.v[2] * dt]), r = 1 + (m.alt || 0); return [p[0] * r, p[1] * r, p[2] * r]; };

  // Where the aircraft sweep looks, in turn (each request covers about 460 km around the point).
  const HUBS = [[40.7, -74, "New York"], [41.9, -87.6, "Chicago"], [33.7, -84.4, "Atlanta"], [32.9, -97, "Dallas"], [39.8, -104.7, "Denver"], [34, -118.3, "Los Angeles"], [37.6, -122.3, "San Francisco"], [47.5, -122.3, "Seattle"], [25.8, -80.3, "Miami"], [43.7, -79.6, "Toronto"], [19.4, -99.1, "Mexico City"], [-23.5, -46.6, "São Paulo"], [4.7, -74.1, "Bogotá"], [51.5, -0.3, "London"], [49, 2.5, "Paris"], [50, 8.6, "Frankfurt"], [40.5, -3.6, "Madrid"], [41.8, 12.3, "Rome"], [41.2, 28.8, "Istanbul"], [25.2, 55.4, "Dubai"], [25.3, 51.6, "Doha"], [28.6, 77.1, "Delhi"], [19.1, 72.9, "Mumbai"], [1.4, 104, "Singapore"], [13.7, 100.7, "Bangkok"], [22.3, 113.9, "Hong Kong"], [31.1, 121.8, "Shanghai"], [40.1, 116.6, "Beijing"], [35.6, 139.8, "Tokyo"], [37.5, 126.4, "Seoul"], [-33.9, 151.2, "Sydney"], [-26.1, 28.2, "Johannesburg"], [30.1, 31.4, "Cairo"], [52.3, 4.8, "Amsterdam"], [55.6, 12.6, "Copenhagen"], [59.6, 17.9, "Stockholm"],
    [29.9, -95.3, "Houston"], [33.4, -112, "Phoenix"], [44.9, -93.2, "Minneapolis"], [45.5, -73.7, "Montreal"], [49.2, -123.2, "Vancouver"], [61.2, -150, "Anchorage"], [21.3, -157.9, "Honolulu"], [9, -79.4, "Panama City"], [-12, -77.1, "Lima"], [-33.4, -70.8, "Santiago"], [-34.8, -58.5, "Buenos Aires"], [53.4, -6.3, "Dublin"], [38.8, -9.1, "Lisbon"], [48.1, 16.6, "Vienna"], [52.2, 21, "Warsaw"], [37.9, 23.9, "Athens"], [24.9, 46.7, "Riyadh"], [6.6, 3.3, "Lagos"], [-1.3, 36.9, "Nairobi"], [9, 38.8, "Addis Ababa"], [13, 80.2, "Chennai"], [3.1, 101.6, "Kuala Lumpur"], [-6.1, 106.7, "Jakarta"], [14.5, 121, "Manila"], [25.1, 121.2, "Taipei"], [-37.7, 144.8, "Melbourne"], [-37, 174.8, "Auckland"]];
  const HUBV = HUBS.map((h) => ll(h[1], h[0]));
  let hubI = 0, planeFails = 0, planeOk = false, flip = false;
  function takePlanes(j, t) {
    for (const a of j.ac || []) {
      if (a.lat == null || a.lon == null || typeof a.alt_baro !== "number") continue;
      const sp = (a.gs || 0) * 0.5144 / EARTH, d = heading(a.lon, a.lat, a.track || 0);
      planes.map.set(a.hex, { p: ll(a.lon, a.lat), v: [d[0] * sp, d[1] * sp, d[2] * sp], t0: t - Math.min(a.seen_pos || 0, 60), alt: 0.003 + Math.min(a.alt_baro, 45000) / 45000 * 0.011, seen: t,
        title: (a.flight || "").trim() || a.r || a.hex, sub: `${a.t || "Aircraft"} · ${Math.round(a.alt_baro).toLocaleString("en-US")} ft · ${Math.round(a.gs || 0)} kt` });
    }
  }
  async function pollPlanes() {
    if (!L.planes.on || document.hidden) return setTimeout(pollPlanes, 3000);
    flip = !flip; const [lat, lon] = flip && !EMBED ? [cam.lat, ((cam.lon + 540) % 360) - 180] : HUBS[hubI++ % HUBS.length];
    try {
      const r = await fetch(`https://api.adsb.lol/v2/lat/${lat.toFixed(2)}/lon/${lon.toFixed(2)}/dist/250`, { signal: AbortSignal.timeout(12000) });
      if (!r.ok) throw new Error(r.status);
      const j = await r.json(), t = now();
      takePlanes(j, t);
      planeOk = true; planeFails = 0; planes.dirty = true;
    } catch (e) { planeFails++; }
    const t = now(); for (const [k, m] of planes.map) if (t - m.seen > 330) { planes.map.delete(k); planes.dirty = true; }
    L.planes.count(planes.map.size);
    if (planeOk && planeFails < 4) L.planes.status("live", `adsb.lol · sweeping ${HUBS.length} air hubs in turn, so this is a sample, not every flight`);
    else if (planeFails >= 3) L.planes.status("off", "live feed not reachable from this browser right now");
    setTimeout(pollPlanes, planeFails >= 3 ? 30000 : EMBED ? 5000 : 2200);
  }

  async function pollShips() {
    if (!L.ships.on || document.hidden) return setTimeout(pollShips, 3000);
    try {
      const j = await (await fetch("https://meri.digitraffic.fi/api/ais/v1/locations", { signal: AbortSignal.timeout(30000) })).json(), t = now(), wall = Date.now();
      ships.map.clear();
      for (const f of j.features || []) {
        const pr = f.properties || {}, c = f.geometry?.coordinates, age = (wall - (pr.timestampExternal || 0)) / 1000;
        if (!c || age > 900 || !(pr.sog > 0.5) || pr.sog > 60) continue;
        const sp = pr.sog * 0.5144 / EARTH, d = heading(c[0], c[1], pr.cog || 0);
        ships.map.set(pr.mmsi, { p: ll(c[0], c[1]), v: [d[0] * sp, d[1] * sp, d[2] * sp], t0: t - Math.max(0, age), alt: 0.0015, title: "Vessel MMSI " + pr.mmsi, sub: `${pr.sog.toFixed(1)} kt · course ${Math.round(pr.cog || 0)}°` });
      }
      ships.dirty = true;
      L.ships.status("part", `${ships.map.size.toLocaleString("en-US")} ships under way, live (Baltic · Fintraffic) · ports worldwide`);
    } catch (e) { if (!ships.map.size) L.ships.status("static", "ports: Natural Earth · live ships not reachable right now"); }
    setTimeout(pollShips, 60000);
  }

  async function pollTrains() {
    if (!L.rail.on || document.hidden) return setTimeout(pollTrains, 3000);
    try {
      const j = await (await fetch("https://rata.digitraffic.fi/api/v1/train-locations/latest", { signal: AbortSignal.timeout(20000) })).json(), t = now(), seen = new Set();
      for (const tr of j) {
        const c = tr.location?.coordinates; if (!c) continue;
        const p = ll(c[0], c[1]), old = trains.map.get(tr.trainNumber); let v = [0, 0, 0];
        if (old && t - old.seen > 3 && t - old.seen < 90) { const dt = t - old.seen; v = [(p[0] - old.p0[0]) / dt, (p[1] - old.p0[1]) / dt, (p[2] - old.p0[2]) / dt]; if (Math.hypot(...v) * EARTH > 90) v = [0, 0, 0]; }
        trains.map.set(tr.trainNumber, { p, p0: p, v, t0: t, seen: t, alt: 0.0015, title: "Train " + tr.trainNumber, sub: `${tr.speed ?? 0} km/h · Finland` }); seen.add(tr.trainNumber);
      }
      for (const k of trains.map.keys()) if (!seen.has(k)) trains.map.delete(k);
      trains.dirty = true;
      L.rail.status("part", `${trains.map.size.toLocaleString("en-US")} trains live (Finland · Fintraffic) · network worldwide`);
    } catch (e) { if (!trains.map.size && world?.rails) L.rail.status("static", "network: Natural Earth · live trains not reachable right now"); }
    setTimeout(pollTrains, 15000);
  }

  // Road traffic: live counting stations where an open feed exists (Finland): brighter and larger = more vehicles per hour.
  let roadStations = null;
  async function pollRoads() {
    if (!L.roads.on || document.hidden) return setTimeout(pollRoads, 3000);
    try {
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
      L.roads.status("part", `${(a.length / 9).toLocaleString("en-US")} live counters (Finland): ${Math.round(total).toLocaleString("en-US")} vehicles/h · highways worldwide`);
    } catch (e) { if (!M.roadLive && world?.roads) L.roads.status("static", "major highways: Natural Earth · live counts not reachable right now"); }
    setTimeout(pollRoads, 120000);
  }

  /* ---------- weather: precipitation from NASA's GPM IMERG satellites (one world image, read pixel by pixel) ---------- */
  function pollRain() {
    if (!L.rain.on || document.hidden) return setTimeout(pollRain, 3000);
    const img = new Image(); img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const RW = 1440, RH = 720, cv = document.createElement("canvas"); cv.width = RW; cv.height = RH;
        const cx = cv.getContext("2d", { willReadFrequently: true }); cx.drawImage(img, 0, 0, RW, RH);
        const px = cx.getImageData(0, 0, RW, RH).data, wet = [];
        let area = 0, all = 0;
        for (let j = 0; j < RH; j++) { const wgt = Math.cos((90 - (j + 0.5) / 4) * DEG); for (let i = 0; i < RW; i++) { all += wgt; if (px[(j * RW + i) * 4 + 3] > 60) { wet.push(j * RW + i); area += wgt; } } }
        if (!wet.length) throw new Error("empty image");
        const N = Math.min(LITE ? 45000 : 110000, wet.length * 2), a = [];
        for (let k = 0; k < N; k++) {
          const n = wet[(rnd() * wet.length) | 0], i = n % RW, j = (n / RW) | 0, p = ll(-180 + (i + rnd()) / 4, 90 - (j + rnd()) / 4);
          const r = px[n * 4] / 255, g = px[n * 4 + 1] / 255, b = px[n * 4 + 2] / 255, m = Math.max(r, g, b, 0.01);
          a.push(p[0], p[1], p[2], 0.35 + 0.65 * r / m, 0.35 + 0.65 * g / m, 0.35 + 0.65 * b / m, 0.5, rnd());
        }
        M.rain = M.rain || mesh(P_RAIN, [["aPos", 3], ["aColor", 4], ["aSeed", 1]], null, gl.POINTS, true); M.rain.set(a);
        S.rain = (area / all * 100).toFixed(1); L.rain.count(`${S.rain}%`);
        L.rain.status("delay", "of the globe has rain or snow · satellite estimate, a few hours behind · NASA GPM IMERG");
      } catch (e) { if (!M.rain) L.rain.status("off", "satellite image could not be read in this browser"); }
    };
    img.onerror = () => { if (!M.rain) L.rain.status("off", "satellite feed not reachable right now"); };
    img.src = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=IMERG_Precipitation_Rate&STYLES=&FORMAT=image/png&TRANSPARENT=true&CRS=EPSG:4326&BBOX=-90,-180,90,180&WIDTH=1440&HEIGHT=720&_=" + Math.floor(Date.now() / 1800000);
    setTimeout(pollRain, 30 * 60000);
  }

  /* ---------- weather: clouds, read from yesterday's true-colour satellite picture of the whole Earth (NASA GIBS) ----------
     A pixel that is bright and nearly colourless is taken as cloud. Snow and ice look the same from above, so the poles
     are left out and the label says so. Yesterday is used because today's picture is still being assembled. */
  function pollClouds() {
    if (!L.clouds.on || document.hidden) return setTimeout(pollClouds, 3000);
    const day = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const attempt = (names) => {
      if (!names.length) { if (!M.clouds) L.clouds.status("off", "satellite picture not reachable or not readable right now"); return; }
      const img = new Image(); img.crossOrigin = "anonymous";
      img.onerror = () => attempt(names.slice(1));
      img.onload = () => {
        try {
          const RW = 720, RH = 360, cv = document.createElement("canvas"); cv.width = RW; cv.height = RH;
          const cx = cv.getContext("2d", { willReadFrequently: true }); cx.drawImage(img, 0, 0, RW, RH);
          const px = cx.getImageData(0, 0, RW, RH).data, cells = []; let area = 0, all = 0;
          for (let j = 0; j < RH; j++) { const lat = 90 - (j + 0.5) / 2; if (lat > 66 || lat < -60) continue; const wgt = Math.cos(lat * DEG);
            for (let i = 0; i < RW; i++) { const o = (j * RW + i) * 4, r = px[o], g = px[o + 1], b = px[o + 2], mn = Math.min(r, g, b), mx = Math.max(r, g, b);
              if (mx < 12) continue; all += wgt;                    // black: no picture here (gaps between passes)
              if (mn > 150 && mx - mn < 46) { cells.push(j * RW + i); area += wgt; } } }
          if (cells.length < 200) throw new Error("no cloud found");
          const N = Math.min(LITE ? 45000 : 100000, cells.length * 3), a = [];
          for (let k = 0, tries = 0; k < N && tries < N * 6; tries++) {
            const n = cells[(rnd() * cells.length) | 0], i = n % RW, j = (n / RW) | 0, lat = 90 - (j + rnd()) / 2; if (rnd() > Math.cos(lat * DEG)) continue;   // even cover per square kilometre
            const p = ll(-180 + (i + rnd()) / 2, lat, 1.006 + rnd() * 0.006), w = (px[n * 4] - 150) / 105;
            a.push(p[0], p[1], p[2], 0.8 + 0.2 * w, 0.86 + 0.14 * w, 1, 0.1 + 0.2 * w * rnd(), 0.95 + rnd() * 0.5, rnd()); k++;
          }
          dyn("clouds").set(a); L.clouds.count(`${(area / all * 100).toFixed(0)}%`);
          L.clouds.status("delay", `bright cloud between 60°S and 66°N on ${day} · NASA ${names[0].split("_")[0]} · snow and ice can read as cloud`);
        } catch (e) { attempt(names.slice(1)); }
      };
      img.src = `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=${names[0]}&STYLES=&FORMAT=image/jpeg&CRS=EPSG:4326&BBOX=-90,-180,90,180&WIDTH=1440&HEIGHT=720&TIME=${day}`;
    };
    L.clouds.status("off", "loading yesterday's satellite picture");
    attempt(["VIIRS_SNPP_CorrectedReflectance_TrueColor", "MODIS_Terra_CorrectedReflectance_TrueColor"]);
    setTimeout(pollClouds, 3 * 3600000);
  }

  /* ---------- weather: wind, the jet stream and temperature from NOAA's GFS model (data/globe/weather.json) ----------
     The file holds 1-degree grids (tools/globe-weather.mjs). Wind is drawn as streamlines: short paths that follow the
     wind from random starting points, with a bright head running along each (the same pulse the cables use), so the
     motion costs nothing per frame. The jet stream is the same at 250 hPa, only where the wind tops 30 m/s. */
  let WX = null;
  const wxAt = (a, lon, lat) => {                                    // value of a grid at a place, blended between the four nearest points
    const x = (((lon % 360) + 360) % 360), y = Math.max(0, Math.min(179.999, 90 - lat)), i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, i2 = (i + 1) % 360;
    return (a[j * 360 + i] * (1 - fx) + a[j * 360 + i2] * fx) * (1 - fy) + (a[(j + 1) * 360 + i] * (1 - fx) + a[(j + 1) * 360 + i2] * fx) * fy;
  };
  const tempC = (lon, lat) => wxAt(WX.t, lon, lat) / 2 - 80;
  const tcol = (c) => { for (let i = 1; i < TRAMP.length; i++) if (c <= TRAMP[i][0]) return mix3(TRAMP[i - 1][1], TRAMP[i][1], Math.max(0, (c - TRAMP[i - 1][0]) / (TRAMP[i][0] - TRAMP[i - 1][0]))); return TRAMP[TRAMP.length - 1][1]; };
  // Paths that follow a flow from random starting points: n paths of up to `steps` hops over the grids U and V (k: real
  // units per grid unit), kept where the flow tops minSp; hop: degrees per hop at full speed. Appends line vertices to a.
  function streamlines(a, n, steps, U, V, k, minSp, vmax, hop, lift, RAMP, alpha) {
    for (let done = 0, tries = 0; done < n && tries < n * 40; tries++) {
      let la = Math.asin(rnd() * 2 - 1) / DEG, lo = rnd() * 360 - 180, prev = null, pc = null; const off = rnd();
      if (Math.hypot(wxAt(U, lo, la), wxAt(V, lo, la)) * k < minSp) continue; done++;
      for (let s = 0; s <= steps; s++) {
        const u = wxAt(U, lo, la) * k, v = wxAt(V, lo, la) * k, sp = Math.hypot(u, v); if (sp < minSp * 0.6 || Math.abs(la) > 86) break;
        const p = ll(lo, la, 1 + lift), c = ramp(RAMP, (sp - minSp) / (vmax - minSp));
        if (prev) a.push(prev[0], prev[1], prev[2], pc[0], pc[1], pc[2], alpha, off + (s - 1) / steps, p[0], p[1], p[2], c[0], c[1], c[2], alpha, off + s / steps);
        const d = hop * (0.35 + Math.min(1, sp / vmax)); la += (v / sp) * d; lo += (u / sp) * d / Math.max(0.2, Math.cos(la * DEG)); prev = p; pc = c;
      }
    }
  }
  const COMPASS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
  function buildWeather(j) {
    const dec = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
    WX = { u: new Int8Array(dec(j.w10u).buffer), v: new Int8Array(dec(j.w10v).buffer), ju: new Int8Array(dec(j.ju).buffer), jv: new Int8Array(dec(j.jv).buffer), t: dec(j.t), valid: j.valid };
    const at = new Date(j.valid).toISOString().slice(11, 16), a = [];
    // n paths of up to `steps` hops; U, V: the grids; k: metres per second per grid unit; hop: degrees per hop at full speed
    const trace = (...o) => streamlines(a, ...o);
    trace(LITE ? 2200 : 5200, 12, WX.u, WX.v, 0.5, 2, 22, 0.75, 0.0045, [[0.3, 0.8, 1], [0.6, 1, 0.9], [1, 1, 1], [1, 0.6, 0.9]], 0.085);
    M.wind = mesh(P_LINE, LINE, a, gl.LINES); a.length = 0;
    trace(LITE ? 900 : 2200, 22, WX.ju, WX.jv, 1, 30, 90, 1.5, 0.03, [[1, 0.85, 0.4], [1, 0.55, 0.25], [1, 0.3, 0.6], [1, 0.9, 1]], 0.15);
    M.jet = mesh(P_LINE, LINE, a, gl.LINES);
    let top = null, sum = 0, wsum = 0;                               // the fastest jet-stream wind, and the area-weighted average temperature
    for (let r = 0; r <= 180; r++) { const w = Math.cos((90 - r) * DEG); for (let c = 0; c < 360; c++) { const i = r * 360 + c, sp = Math.hypot(WX.ju[i], WX.jv[i]); if (!top || sp > top.sp) top = { sp, lon: c > 180 ? c - 360 : c, lat: 90 - r }; sum += (WX.t[i] / 2 - 80) * w; wsum += w; } }
    S.jet = { kmh: Math.round(top.sp * 3.6), lon: top.lon, lat: top.lat }; S.meanT = sum / wsum;
    L.wind.count(`${num(S.jet.kmh)} km/h`); L.wind.status("model", `fastest jet-stream wind · NOAA GFS weather model for ${at} UTC, refreshed every few hours`);
    buildTemp();
    L.temp.count(`${S.meanT.toFixed(1)}°C`); L.temp.status("model", `average over the whole globe · air 2 m above ground · NOAA GFS weather model for ${at} UTC`);
  }
  // Temperature takes the place of the plain land and sea dots while it is on: the same even spread of points, each
  // coloured by the air temperature there, land a little brighter than sea so the continents still read.
  function buildTemp() {
    if (!WX) return;
    const N = LITE ? 170000 : 380000, b = [], g = Math.PI * (3 - Math.sqrt(5)), ld = world && world.land, bits = ld ? Uint8Array.from(atob(ld.b64), (c) => c.charCodeAt(0)) : null;
    for (let i = 0; i < N; i++) { const y = 1 - (i + 0.5) / N * 2, r = Math.sqrt(1 - y * y), th = i * g, x = Math.sin(th) * r, z = Math.cos(th) * r, lat = Math.asin(y) / DEG, lon = Math.atan2(x, z) / DEG, c = tcol(tempC(lon, lat));
      let land = false; if (bits) { const n = Math.min(ld.h - 1, Math.floor((90 - lat) / 180 * ld.h)) * ld.w + Math.min(ld.w - 1, Math.floor((lon + 180) / 360 * ld.w)); land = !!(bits[n >> 3] & (128 >> (n & 7))); }
      b.push(x, y, z, c[0], c[1], c[2], land ? 0.75 + rnd() * 0.25 : 0.38 + rnd() * 0.2, land ? 1.7 + rnd() * 0.7 : 1.3 + rnd() * 0.5, rnd()); }
    M.temp = mesh(P_POINT, POINT, b, gl.POINTS);
  }
  const loadWeather = () => getJson("../data/globe/weather.json").then(buildWeather).catch(() => { if (!WX) for (const id of ["wind", "temp"]) L[id].status("off", "first data sync in progress, check back in a few minutes"); });

  /* ---------- the sea: currents, swell, surf breaks, wave buoys and tides (data/globe/ocean.json, tools/globe-ocean.mjs) ----------
     Currents and swell are streamlines like the wind, told apart by their pace and dashes: currents creep in three
     short dashes per line, swell runs faster in two. Tides are worked out here, minute by minute, from NOAA's predicted
     high and low waters. A "surf report" is the open-ocean swell beside each break plus the wind there: honest about
     being the model's sea state offshore, not the height of the breaking wave. */
  let OC = null;
  // Well-known surf breaks: [name, where, latitude, longitude] (positions to about a tenth of a degree).
  const BREAKS = [["Pipeline", "Oahu, Hawaii", 21.67, -158.05], ["Waimea Bay", "Oahu, Hawaii", 21.64, -158.07], ["Jaws (Pe'ahi)", "Maui, Hawaii", 20.94, -156.3], ["Mavericks", "California", 37.49, -122.51], ["Steamer Lane", "Santa Cruz, California", 36.95, -122.03], ["Rincon", "California", 34.37, -119.48], ["Malibu", "California", 34.03, -118.68], ["Huntington Beach", "California", 33.65, -118.0], ["Trestles", "California", 33.38, -117.59], ["Tofino", "British Columbia", 49.07, -125.76],
    ["Puerto Escondido", "Mexico", 15.86, -97.06], ["Chicama", "Peru", -7.7, -79.45], ["Punta de Lobos", "Chile", -34.43, -72.05], ["Joaquina", "Florianópolis, Brazil", -27.63, -48.45], ["Saquarema", "Brazil", -22.94, -42.49], ["Cape Hatteras", "Outer Banks, North Carolina", 35.25, -75.52], ["Montauk", "New York", 41.03, -71.94], ["Cocoa Beach", "Florida", 28.32, -80.6], ["Rincón", "Puerto Rico", 18.36, -67.27], ["Soup Bowl", "Barbados", 13.21, -59.52],
    ["Nazaré", "Portugal", 39.6, -9.09], ["Supertubos", "Peniche, Portugal", 39.34, -9.37], ["Ericeira", "Portugal", 38.99, -9.42], ["Hossegor", "France", 43.67, -1.45], ["Mundaka", "Spain", 43.41, -2.7], ["Fistral", "Newquay, England", 50.42, -5.1], ["Thurso East", "Scotland", 58.6, -3.51], ["Bundoran", "Ireland", 54.48, -8.28], ["Anchor Point", "Taghazout, Morocco", 30.54, -9.73], ["Skeleton Bay", "Namibia", -22.9, 14.45], ["Jeffreys Bay", "South Africa", -34.03, 24.93],
    ["Arugam Bay", "Sri Lanka", 6.84, 81.84], ["Uluwatu", "Bali", -8.82, 115.08], ["G-Land", "Java", -8.74, 114.35], ["Desert Point", "Lombok", -8.75, 115.83], ["HT's", "Mentawai Islands", -2.37, 99.86], ["Cloud 9", "Siargao, Philippines", 9.81, 126.17], ["Tsurigasaki", "Chiba, Japan", 35.37, 140.39], ["Cloudbreak", "Fiji", -17.87, 177.19], ["Teahupo'o", "Tahiti", -17.86, -149.26], ["Snapper Rocks", "Gold Coast, Australia", -28.16, 153.55], ["Bells Beach", "Victoria, Australia", -38.37, 144.28], ["Margaret River", "Western Australia", -33.98, 114.98], ["Raglan", "New Zealand", -37.82, 174.83]];
  const from8 = (deg) => COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
  // The swell at the sea point nearest a place (within about 2 degrees), or null inland: { m, s, from }.
  function waveAt(lon, lat) {
    if (!OC || !OC.hs) return null;
    const i0 = Math.round((((lon % 360) + 360) % 360)) % 360, j0 = Math.round(90 - lat); let best = null, bd = 9;
    for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) { const j = j0 + dj, i = (i0 + di + 360) % 360, d = di * di + dj * dj; if (j < 0 || j > 180 || d >= bd) continue; const n = j * 360 + i; if (OC.hs[n] < 255) { bd = d; best = n; } }
    return best == null ? null : { m: OC.hs[best] / 10, s: OC.tp[best] / 10, from: OC.dir[best] * 2 };
  }
  const swellKind = (s) => (s >= 12 ? "long-period groundswell" : s >= 8 ? "mid-period swell" : "short-period wind swell");
  // A tide station's level right now, between the predicted highs and lows on either side (a smooth cosine curve).
  function tideNow(st, min) {
    const e = st[3];
    for (let k = 0; k + 5 < e.length; k += 3) if (e[k] <= min && min < e[k + 3]) {
      const f = (min - e[k]) / (e[k + 3] - e[k]), h = e[k + 1] + (e[k + 4] - e[k + 1]) * (1 - Math.cos(Math.PI * f)) / 2, lo = Math.min(e[k + 1], e[k + 4]), hi = Math.max(e[k + 1], e[k + 4]);
      return { h: h / 100, rising: e[k + 4] > e[k + 1], frac: hi > lo ? (h - lo) / (hi - lo) : 0.5, next: { min: e[k + 3] - min, h: e[k + 4] / 100, high: !!e[k + 5] } };
    }
    return null;
  }
  const inHM = (m) => (m >= 60 ? Math.floor(m / 60) + " h " + Math.round(m % 60) + " min" : Math.max(1, Math.round(m)) + " min");
  const tideText = (t) => `${t.h.toFixed(2)} m and ${t.rising ? "rising" : "falling"} · ${t.next.high ? "high" : "low"} water (${t.next.h.toFixed(2)} m) in ${inHM(t.next.min)}`;
  function buildTides() {
    if (!OC || !OC.tides) return;
    const ln = [], hd = [], min = Date.now() / 60000; let up = 0, down = 0;
    dropPicks("tide");
    for (const st of OC.tides) {
      const t = tideNow(st, min); if (!t) continue; t.rising ? up++ : down++;
      const c = t.rising ? [0.3, 1, 0.9] : [1, 0.45, 0.8], h = 0.004 + t.frac * 0.03, a = ll(st[0], st[1]), b = ll(st[0], st[1], 1 + h);
      ln.push(a[0], a[1], a[2], c[0], c[1], c[2], 0.35, t.rising ? 0 : 1, b[0], b[1], b[2], c[0], c[1], c[2], 1, t.rising ? 1 : 0);   // the pulse climbs on a rising tide and sinks on a falling one
      hd.push(b[0], b[1], b[2], c[0], c[1], c[2], 1, 1.7, (st[0] * 0.37 + 7) % 1);
      picks.push({ p: b, layer: "tide", live: "tide", kind: "Tide station · predicted", title: st[2], sub: tideText(t) + " · NOAA" });
    }
    M.tideLines = mesh(P_LINE, LINE, ln, gl.LINES); M.tideHeads = mesh(P_POINT, POINT, hd, gl.POINTS);
    L.tide.count(up + down); L.tide.status("model", `${up} rising, ${down} falling right now · NOAA tide predictions, US coasts and islands only`);
  }
  function buildOcean(j) {
    const dec = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)), a = [];
    OC = { tides: j.tides && j.tides.stations, buoys: j.buoys && j.buoys.buoys };
    if (j.currents) {
      const U = new Int8Array(dec(j.currents.u).buffer), V = new Int8Array(dec(j.currents.v).buffer); let top = null;
      for (let r = 86; r <= 94; r++) for (let c = 0; c < 360; c++) U[r * 360 + c] = V[r * 360 + c] = 0;   // this method breaks down within 4 degrees of the equator, so that band is left empty
      streamlines(a, LITE ? 1800 : 4200, 26, U, V, 0.02, 0.12, 1.2, 0.55, 0.0012, [[0.2, 0.5, 1], [0.25, 0.8, 1], [0.55, 1, 0.95], [1, 1, 1]], 0.2);
      M.cur = mesh(P_LINE, LINE, a, gl.LINES); a.length = 0;
      for (let r = 8; r <= 172; r++) for (let c = 0; c < 360; c++) { const sp = Math.hypot(U[r * 360 + c], V[r * 360 + c]) * 0.02; if (Math.abs(90 - r) < 10 || Math.abs(U[r * 360 + c]) > 125 || Math.abs(V[r * 360 + c]) > 125) continue; if (!top || sp > top.sp) top = { sp, lon: c > 180 ? c - 360 : c, lat: 90 - r }; }
      S.cur = top; const days = Math.round((Date.now() - Date.parse(j.currents.date)) / 86400000);
      L.cur.count(`${top.sp.toFixed(1)} m/s`); L.cur.status("delay", `fastest surface current · from satellite sea-level measurements, ${days <= 1 ? "latest pass" : days + " days old"} · NOAA CoastWatch`);
    } else L.cur.status("off", "first data sync in progress, check back in a few minutes");
    if (j.waves) {
      OC.hs = dec(j.waves.hs); OC.tp = dec(j.waves.tp); OC.dir = dec(j.waves.dir);
      const U = new Float32Array(65160), V = new Float32Array(65160); let top = null;   // the way the swell travels, as long as it is tall
      for (let n = 0; n < 65160; n++) { if (OC.hs[n] === 255) continue; const m = OC.hs[n] / 10, th = OC.dir[n] * 2 * DEG; U[n] = -Math.sin(th) * m; V[n] = -Math.cos(th) * m; if (!top || m > top.m) top = { m, s: OC.tp[n] / 10, lon: (n % 360) > 180 ? (n % 360) - 360 : n % 360, lat: 90 - Math.floor(n / 360) }; }
      streamlines(a, LITE ? 1100 : 2600, 10, U, V, 1, 2, 9, 0.9, 0.0026, [[0.2, 0.9, 0.75], [0.9, 0.95, 0.4], [1, 0.5, 0.3], [1, 0.3, 0.75]], 0.1);
      M.swell = mesh(P_LINE, LINE, a, gl.LINES); S.swell = top;
    }
    { const pt = []; dropPicks("surf"); OC.spots = [];
      if (OC.hs) for (const [name, where, lat, lon] of BREAKS) { const w = waveAt(lon, lat); if (!w) continue; const p = ll(lon, lat);
        let wind = ""; if (WX) { const u = wxAt(WX.u, lon, lat) * 0.5, v = wxAt(WX.v, lon, lat) * 0.5; wind = ` · wind ${Math.round(Math.hypot(u, v) * 3.6)} km/h from the ${from8(Math.atan2(-u, -v) / DEG)}`; }
        const pick = { p, layer: "surf", live: "surf", kind: "Surf report · " + where, title: name, sub: `${w.m.toFixed(1)} m at ${Math.round(w.s)} s from the ${from8(w.from)} · ${swellKind(w.s)}${wind} · open-ocean model beside the break, not the breaking wave` };
        picks.push(pick); OC.spots.push({ name, where, lon, lat, w, wind, pick, e: w.m * w.m * w.s });
        pt.push(p[0], p[1], p[2], 1, 0.55, 0.45, 1, 2.1, rnd()); ring(pt, lon, lat, 0.55, 14, [1, 0.55, 0.45], 0.8, 1.0); }
      for (const b of OC.buoys || []) { const p = ll(b[0], b[1]); pt.push(p[0], p[1], p[2], 1, 0.95, 0.6, 0.85, 1.35, rnd());
        picks.push({ p, layer: "surf", live: "surf", kind: `Wave buoy · observed ${new Date(b[7] * 60000).toISOString().slice(11, 16)} UTC`, title: "Buoy " + b[2], sub: `${b[3].toFixed(1)} m${b[4] != null ? ` at ${Math.round(b[4])} s` : ""}${b[5] != null ? ` from the ${from8(b[5])}` : ""}${b[6] != null ? ` · water ${b[6].toFixed(1)}°C` : ""} · NOAA NDBC` }); }
      M.surfPts = mesh(P_POINT, POINT, pt, gl.POINTS); OC.spots.sort((x, y) => y.e - x.e);
      if (j.waves) { L.surf.count(`${S.swell.m.toFixed(1)} m`); L.surf.status("model", `tallest waves at sea now · NOAA wave model for ${new Date(j.waves.valid).toISOString().slice(11, 16)} UTC · ${OC.spots.length} surf breaks · ${(OC.buoys || []).length} buoys reporting`); }
      else L.surf.status(OC.buoys ? "delay" : "off", OC.buoys ? `${OC.buoys.length} wave buoys reporting · NOAA NDBC · wave model not in yet` : "first data sync in progress, check back in a few minutes");
      $("#surfBtn").hidden = !OC.spots.length; }
    if (OC.tides) buildTides(); else L.tide.status("off", "first data sync in progress, check back in a few minutes");
    renderBoard();
  }
  const loadOcean = () => getJson("../data/globe/ocean.json").then(buildOcean).catch(() => { if (!OC) for (const id of ["cur", "surf", "tide"]) L[id].status("off", "first data sync in progress, check back in a few minutes"); });
  setInterval(() => { if (L.tide.on && !document.hidden) buildTides(); }, 60000);
  // The surf report: every break, biggest swell first (wave height squared times period, a fair measure of its power).
  function renderSurf(box) {
    box.textContent = "";
    const head = el("div", "bh"), ttl = el("button", "bx", "Surf report"), close = el("button", "bx", "×"); ttl.type = "button"; ttl.disabled = true; close.type = "button"; close.setAttribute("aria-label", "Close"); close.onclick = () => { box.hidden = true; };
    head.append(ttl, close); box.append(head);
    const body = el("div", "bb"), max = Math.max(1, ...OC.spots.map((s) => s.e)), g = el("div", "glob"); box.append(body);
    g.append(el("div", "big", `${OC.spots[0].name}: ${OC.spots[0].w.m.toFixed(1)} m at ${Math.round(OC.spots[0].w.s)} s`), el("div", "sm", "Biggest swell first. Open-ocean swell beside each break from NOAA's wave model, with the wind there: a guide to what is arriving, not the height of the breaking wave.")); body.append(g);
    for (const s of OC.spots) {
      const row = el("button", "xr"), top = el("div", "xt"), bar = el("div", "split"), fill = el("i", "u"); row.type = "button";
      top.append(el("b", null, s.name), el("span", "mono", `${s.w.m.toFixed(1)} m · ${Math.round(s.w.s)} s`)); bar.append(fill);
      row.append(top, el("div", "sm", `${s.where} · from the ${from8(s.w.from)} · ${swellKind(s.w.s)}${s.wind}`), bar);
      requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = Math.max(2, s.e / max * 100) + "%"; }));
      row.onclick = () => { stopTour(); flyTo(s.lon, s.lat - (SMALL ? 6 : 0), 1.7); cam.idle = -45; if (narrow()) box.hidden = true; select(s.pick, 0, 0, true); };
      body.append(row);
    }
  }

  /* ---------- the night sky: real stars and the 88 constellations (data/globe/sky.json, tools/globe-sky.py) ---------- */
  let SKY = null; const conLabels = [];
  const BV = [[-0.3, [0.62, 0.74, 1]], [0, [0.85, 0.9, 1]], [0.6, [1, 0.96, 0.86]], [1, [1, 0.84, 0.64]], [1.7, [1, 0.62, 0.42]]];   // star colour from its colour index
  const bvCol = (b) => { for (let i = 1; i < BV.length; i++) if (b <= BV[i][0]) return mix3(BV[i - 1][1], BV[i][1], Math.max(0, (b - BV[i - 1][0]) / (BV[i][0] - BV[i - 1][0]))); return BV[BV.length - 1][1]; };
  function buildSky(j) {
    SKY = j; const a = [], s = j.stars;
    for (let i = 0; i < s.length; i += 4) { const p = ll(s[i] / 100, s[i + 1] / 100), mag = s[i + 2] / 10, c = bvCol(s[i + 3] / 100), k = Math.max(0, (6.6 - mag) / 8);    // k: 0 faint .. 1 brightest
      a.push(p[0], p[1], p[2], c[0], c[1], c[2], (0.25 + 0.75 * Math.pow(k, 1.2)) * 20, 1.0 + 3.4 * k * k, rnd()); }
    M.stars = mesh(P_POINT, POINT, a, gl.POINTS);
    M.conLines = mesh(P_LINE, LINE, lineVerts(j.cons.flatMap((c) => c[5]), [0.5, 0.58, 1], 4.4), gl.LINES);
    for (const c of j.cons) { const e = document.createElement("div"); e.className = "lab sky"; e.textContent = c[1]; $("#labels").appendChild(e); conLabels.push({ el: e, ra: c[3], dec: c[4], rank: c[2] }); }
    conLabels.sort((x, y) => x.rank - y.rank);
    L.sky.count(j.cons.length); L.sky.status("static", `${num(s.length / 4)} real stars, turning with the sky overhead · Hipparcos catalogue`);
  }
  function layoutSky() {
    const used = [], max = SMALL ? 5 : 12; let n = 0;
    for (const c of conLabels) {
      let s = L.sky.on && !EMBED && n < max ? projectSky(skyDir(c.ra, c.dec)) : null;
      if (s && (s[0] < 50 || s[0] > W - 50 || s[1] < 40 || s[1] > H - 60 || used.some((u) => Math.abs(u[0] - s[0]) < 110 && Math.abs(u[1] - s[1]) < 20))) s = null;
      if (s) { used.push(s); n++; c.el.style.display = "block"; c.el.style.left = s[0].toFixed(1) + "px"; c.el.style.top = s[1].toFixed(1) + "px"; } else c.el.style.display = "none";
    }
  }
  const conName = (id) => { const c = SKY && SKY.cons.find((x) => x[0] === id || x[0].startsWith(id)); return c ? c[1] : ""; };

  /* ---------- the Moon: where it really is, how much of it is lit, and its real face (data/globe/moon.json) ----------
     Position from the standard low-precision formulas (good to about a third of a degree). The Moon keeps one face to
     the Earth, so its map is hung with longitude 0 pointing at us and its pole square to the plane of the planets.
     It is drawn MOON_R Earth-radii wide at MOON_D Earth-radii away: about 15 times too big and too close, said on the page. */
  const MOON_D = 11, MOON_R = 0.75, moon = { p: null };
  function moonAt(ms) {
    const T = (ms / 86400000 + 2440587.5 - 2451545) / 36525, sn = (d) => Math.sin(d * DEG), cs = (d) => Math.cos(d * DEG);
    const lam = 218.32 + 481267.881 * T + 6.29 * sn(135 + 477198.87 * T) - 1.27 * sn(259.3 - 413335.36 * T) + 0.66 * sn(235.7 + 890534.22 * T) + 0.21 * sn(269.9 + 954397.74 * T) - 0.19 * sn(357.5 + 35999.05 * T) - 0.11 * sn(186.5 + 966404.03 * T);
    const bet = 5.13 * sn(93.3 + 483202.02 * T) + 0.28 * sn(228.2 + 960400.89 * T) - 0.28 * sn(318.3 + 6003.15 * T) - 0.17 * sn(217.6 - 407332.21 * T);
    const par = 0.9508 + 0.0518 * cs(135 + 477198.87 * T) + 0.0095 * cs(259.3 - 413335.36 * T) + 0.0078 * cs(235.7 + 890534.22 * T) + 0.0028 * cs(269.9 + 954397.74 * T);
    const eps = 23.439 - 0.013 * T, l = cs(bet) * cs(lam), m = cs(eps) * cs(bet) * sn(lam) - sn(eps) * sn(bet), n = sn(eps) * cs(bet) * sn(lam) + cs(eps) * sn(bet);
    const g = gmst(ms) / DEG, lon = wrapLon(Math.atan2(m, l) / DEG - g), lat = Math.asin(n) / DEG, dir = ll(lon, lat);
    const gs = 357.53 + 35999.05 * T, sun = 280.46 + 36000.77 * T + 1.915 * sn(gs) + 0.02 * sn(2 * gs), age = (((lam - sun) % 360) + 360) % 360;   // 0 new, 180 full
    const Y0 = ll(270 - g, 90 - eps), d0 = dot(Y0, dir), Zm = [-dir[0], -dir[1], -dir[2]], Ym = norm([Y0[0] - d0 * dir[0], Y0[1] - d0 * dir[1], Y0[2] - d0 * dir[2]]), Xm = cross(Ym, Zm);
    const lit = (1 - Math.cos(age * DEG)) / 2, name = lit < 0.03 ? "New Moon" : lit > 0.97 ? "Full Moon" : Math.abs(lit - 0.5) < 0.06 ? (age < 180 ? "First quarter" : "Last quarter") : (age < 180 ? "Waxing " : "Waning ") + (lit < 0.5 ? "crescent" : "gibbous");
    return { lon, lat, dir, km: 6378.14 / sn(par), lit, name, X: Xm, Y: Ym, Z: Zm, c: [dir[0] * MOON_D, dir[1] * MOON_D, dir[2] * MOON_D] };
  }
  const moonPoint = (lon, lat) => { const f = ll(lon, lat), m = moon.p; return [m.c[0] + MOON_R * (f[0] * m.X[0] + f[1] * m.Y[0] + f[2] * m.Z[0]), m.c[1] + MOON_R * (f[0] * m.X[1] + f[1] * m.Y[1] + f[2] * m.Z[1]), m.c[2] + MOON_R * (f[0] * m.X[2] + f[1] * m.Y[2] + f[2] * m.Z[2])]; };
  // Places on the Moon: [name, latitude, longitude east].
  const MOONMARKS = [["Mare Imbrium", 32.8, -15.6], ["Mare Serenitatis", 28, 17.5], ["Mare Tranquillitatis", 8.5, 31.4], ["Mare Crisium", 17, 59.1], ["Mare Fecunditatis", -7.8, 51.3], ["Mare Nectaris", -15.2, 35.5], ["Mare Nubium", -21.3, -16.6], ["Mare Humorum", -24.4, -38.6], ["Oceanus Procellarum", 18.4, -57.4], ["Mare Frigoris", 56, 1.4],
    ["Tycho", -43.3, -11.4], ["Copernicus", 9.6, -20.1], ["Kepler", 8.1, -38], ["Aristarchus", 23.7, -47.4], ["Plato", 51.6, -9.4], ["Clavius", -58.4, -14.4], ["Apollo 11", 0.67, 23.47], ["Mare Orientale", -19.4, -92.8], ["Tsiolkovskiy", -20.4, 129.1], ["South Pole-Aitken basin", -53, -169], ["Mare Moscoviense", 27.3, 147.9]];
  const moonLabels = MOONMARKS.map((m) => { const e = document.createElement("div"); e.className = "lab sky moonlab"; e.textContent = m[0]; $("#labels").appendChild(e); return { el: e, lat: m[1], lon: m[2] }; });
  function buildMoon(map) {
    const N = LITE ? 45000 : 100000, a = [], g = Math.PI * (3 - Math.sqrt(5)), px = map ? Uint8Array.from(atob(map.b64), (c) => c.charCodeAt(0)) : null;
    for (let i = 0; i < N; i++) { const y = 1 - (i + 0.5) / N * 2, r = Math.sqrt(1 - y * y), th = i * g, x = Math.sin(th) * r, z = Math.cos(th) * r;
      let alb = 0.6; if (px) { const lon = Math.atan2(x, z) / DEG, lat = Math.asin(y) / DEG; alb = px[Math.min(map.h - 1, Math.floor((90 - lat) / 180 * map.h)) * map.w + Math.min(map.w - 1, Math.floor((lon + 180) / 360 * map.w))] / 255; }
      a.push(x, y, z, alb, rnd()); }
    M.moon = mesh(P_MOON, [["aPos", 3], ["aAlb", 1], ["aSeed", 1]], a, gl.POINTS); moon.map = !!map;
  }
  buildMoon(null);                                                  // a plain grey Moon until its map arrives
  function updateMoon(ms) {
    const m = moon.p = moonAt(ms);
    if (frame % 240 === 2) {
      L.moon.count(`${Math.round(m.lit * 100)}%`); L.moon.status("model", `${m.name.toLowerCase()} · ${num(m.km)} km away · position and phase calculated${moon.map ? ", face from Lunar Reconnaissance Orbiter pictures" : ""} · drawn much too big and too close`);
      const a = [], p = ll(m.lon, m.lat); a.push(p[0], p[1], p[2], 0.92, 0.93, 1, 1, 2.2, 0.5); ring(a, m.lon, m.lat, 2.4, 70, [0.92, 0.93, 1], 0.75, 1.1, 0.2); ring(a, m.lon, m.lat, 4.2, 90, [0.92, 0.93, 1], 0.3, 0.95, 0.6);
      dyn("sublunar").set(a); dropPicks("moon");
      picks.push({ p, layer: "moon", live: "moon", kind: "Under the Moon", title: "The Moon is straight overhead here", sub: "The bulge of water it raises follows this spot round the planet, which is why the tides keep the Moon's time" });
    }
  }
  const moonCard = () => { const m = moon.p; return { layer: "moon", sat: true, kind: "The Moon · " + m.name.toLowerCase(), title: `${Math.round(m.lit * 100)}% lit · ${num(m.km)} km away`, sub: "Position, phase and face are real. Drawn about 15 times too big and too close: it is really 60 Earth-radii away and a quarter of the Earth's width.", pos: () => moon.p.c }; };
  // Screen centre and radius of the Moon, or null when it is behind the camera.
  function moonOnScreen() {
    const m = moon.p; if (!m) return null; const d = [m.c[0] - EYE[0], m.c[1] - EYE[1], m.c[2] - EYE[2]], fwd = -dot(d, norm(EYE)); if (fwd < 0.5) return null;
    return { s: project(m.c), r: MOON_R / fwd / Math.tan(17 * DEG) * (H / 2), behind: fwd > Math.hypot(EYE[0], EYE[1], EYE[2]) };
  }
  function drawMoon(t) {
    const m = moon.p, u = use(P_MOON, t), R = MOON_R;
    gl.uniformMatrix4fv(u.uMVP, false, mul(MVP, [m.X[0] * R, m.X[1] * R, m.X[2] * R, 0, m.Y[0] * R, m.Y[1] * R, m.Y[2] * R, 0, m.Z[0] * R, m.Z[1] * R, m.Z[2] * R, 0, m.c[0], m.c[1], m.c[2], 1]));
    const e = [(EYE[0] - m.c[0]) / R, (EYE[1] - m.c[1]) / R, (EYE[2] - m.c[2]) / R];
    gl.uniform3f(u.uSunL, dot(SUN, m.X), dot(SUN, m.Y), dot(SUN, m.Z)); gl.uniform3f(u.uEyeL, dot(e, m.X), dot(e, m.Y), dot(e, m.Z));
    gl.bindVertexArray(M.moon.vao); gl.drawArrays(gl.POINTS, 0, M.moon.count);
  }
  function layoutMoon() {
    const on = L.moon.on && !EMBED && moon.p && PLANET === "earth" ? moonOnScreen() : null, show = on && on.r > 38, used = [];
    for (const f of moonLabels) {
      let s = null;
      if (show && used.length < (on.r < 70 ? 3 : SMALL ? 5 : 9)) { const p = moonPoint(f.lon, f.lat), n = [p[0] - moon.p.c[0], p[1] - moon.p.c[1], p[2] - moon.p.c[2]];
        if (dot(n, [EYE[0] - p[0], EYE[1] - p[1], EYE[2] - p[2]]) > 0.25 * MOON_R * Math.hypot(EYE[0] - p[0], EYE[1] - p[1], EYE[2] - p[2]) && !hiddenByEarth(p)) s = project(p);
        if (s && used.some((q) => Math.abs(q[0] - s[0]) < 96 && Math.abs(q[1] - s[1]) < 16)) s = null; }
      if (s) { used.push(s); f.el.style.display = "block"; f.el.style.left = s[0].toFixed(1) + "px"; f.el.style.top = s[1].toFixed(1) + "px"; } else f.el.style.display = "none";
    }
  }

  /* ---------- Mars: a second planet to switch to (the Mars button; world-pulse.html?planet=mars) ----------
     The face is a real map (data/globe/mars.jpg, tools/globe-mars.py). Day and night, the season and the clock are
     worked out with the Mars24 method (Allison and McEwen, 2000); the distance from Earth from the planets' orbits.
     While Mars is up, the Earth's layers, panels and feeds are simply not drawn; nothing about them is switched off. */
  const MARS = { ready: false, reveal: 0, picks: [], labels: [], now: null, sun: [1, 0, 0] };
  function marsNow(ms) {
    const jd = ms / 86400000 + 2440587.5 + 69.184 / 86400, d = jd - 2451545, sn = (x) => Math.sin(x * DEG), cs = (x) => Math.cos(x * DEG);
    const Mn = 19.3871 + 0.52402073 * d, al = 270.3871 + 0.524038496 * d; let pbs = 0;
    for (const [A, tau, phi] of [[0.0071, 2.2353, 49.409], [0.0057, 2.7543, 168.173], [0.0039, 1.1177, 191.837], [0.0037, 15.7866, 21.736], [0.0021, 2.1354, 15.704], [0.002, 2.4694, 95.528], [0.0018, 32.8493, 49.095]]) pbs += A * cs(0.985626 * d / tau + phi);
    const vm = (10.691 + 3e-7 * d) * sn(Mn) + 0.623 * sn(2 * Mn) + 0.05 * sn(3 * Mn) + 0.005 * sn(4 * Mn) + 0.0005 * sn(5 * Mn) + pbs, ls = (((al + vm) % 360) + 360) % 360;
    const eot = 2.861 * sn(2 * ls) - 0.071 * sn(4 * ls) + 0.002 * sn(6 * ls) - vm, mtc = (((24 * ((jd - 2451549.5) / 1.0274912517 + 44796 - 0.0009626)) % 24) + 24) % 24;
    // where each planet is round the sun (mean orbits: good to about a hundredth of the Earth-sun distance)
    const T = d / 36525, at = (a, e, I, Lm, w, O) => { const M = (((Lm - w) % 360) + 540) % 360 - 180; let E = M * DEG; for (let k = 0; k < 8; k++) E -= (E - e * Math.sin(E) - M * DEG) / (1 - e * Math.cos(E));
      const x = a * (Math.cos(E) - e), y = a * Math.sqrt(1 - e * e) * Math.sin(E), ww = (w - O) * DEG, oo = O * DEG, i = I * DEG;
      return [(Math.cos(ww) * Math.cos(oo) - Math.sin(ww) * Math.sin(oo) * Math.cos(i)) * x + (-Math.sin(ww) * Math.cos(oo) - Math.cos(ww) * Math.sin(oo) * Math.cos(i)) * y, (Math.cos(ww) * Math.sin(oo) + Math.sin(ww) * Math.cos(oo) * Math.cos(i)) * x + (-Math.sin(ww) * Math.sin(oo) + Math.cos(ww) * Math.cos(oo) * Math.cos(i)) * y, Math.sin(ww) * Math.sin(i) * x + Math.cos(ww) * Math.sin(i) * y]; };
    const e = at(1.00000261 + 0.00000562 * T, 0.01671123 - 0.00004392 * T, -0.00001531 - 0.01294668 * T, 100.46457166 + 35999.37244981 * T, 102.93768193 + 0.32327364 * T, 0);
    const m = at(1.52371034 + 0.00001847 * T, 0.0933941 + 0.00007882 * T, 1.84969142 - 0.00813131 * T, -4.55343205 + 19140.30268499 * T, -23.94362959 + 0.44441088 * T, 49.55953891 - 0.29257343 * T);
    const au = Math.hypot(m[0] - e[0], m[1] - e[1], m[2] - e[2]), north = ["spring", "summer", "autumn", "winter"][Math.floor(ls / 90) % 4];
    return { ls, mtc, sol: Math.floor((jd - 2405522.0028779) / 1.0274912517), km: au * 149597870.7, lightMin: au * 8.316746, season: north,
      sunLon: wrapLon(-(mtc * 15 + eot + 180)), sunLat: Math.asin(0.42565 * sn(ls)) / DEG + 0.25 * sn(ls) };
  }
  const hhmm = (h) => { const x = ((h % 24) + 24) % 24; return String(Math.floor(x)).padStart(2, "0") + ":" + String(Math.floor((x % 1) * 60)).padStart(2, "0"); };
  // Places on Mars: [name, latitude, longitude east, kind, a line about it]; kind 0 landform, 1 landing site.
  const MARSMARKS = [
    ["Olympus Mons", 18.65, -133.8, 0, "The tallest volcano in the solar system: about 22 km high and 600 km across"],
    ["Valles Marineris", -13.9, -59.2, 0, "A canyon system about 4,000 km long and up to 7 km deep"],
    ["Ascraeus Mons", 11.9, -104.5, 0, "The northernmost of the three Tharsis volcanoes, about 18 km high"],
    ["Pavonis Mons", 1.5, -113, 0, "The middle Tharsis volcano, sitting on the equator"],
    ["Arsia Mons", -8.35, -120.1, 0, "The southernmost Tharsis volcano, with a crater 110 km wide at its top"],
    ["Elysium Mons", 25, 147.2, 0, "A volcano standing about 13 km above the plains around it"],
    ["Hellas Planitia", -42.4, 70.5, 0, "An impact basin about 2,300 km across and 7 km deep: the lowest ground on Mars"],
    ["Argyre Planitia", -49.7, -44, 0, "An impact basin about 1,800 km across"],
    ["Syrtis Major", 8.4, 69.5, 0, "A dark volcanic plain, the first marking on Mars ever drawn, in 1659"],
    ["Utopia Planitia", 46.7, 117.5, 0, "The floor of the largest known impact basin in the solar system, about 3,300 km across"],
    ["Acidalia Planitia", 49.8, -21, 0, "A dark northern plain"], ["Arabia Terra", 21, 6, 0, "Old, heavily cratered highlands"], ["Amazonis Planitia", 24.7, -164, 0, "One of the smoothest plains on Mars"], ["Isidis Planitia", 12.9, 87, 0, "An impact basin about 1,500 km across"],
    ["Planum Boreum", 87, 0, 0, "The north polar cap: water ice about 1,000 km across"], ["Planum Australe", -84, 160, 0, "The south polar cap: water ice under frozen carbon dioxide"],
    ["Jezero crater", 18.44, 77.45, 1, "Perseverance rover and the Ingenuity helicopter landed here on 18 February 2021"],
    ["Gale crater", -5.4, 137.8, 1, "Curiosity rover landed here on 6 August 2012"],
    ["Meridiani Planum", -1.95, -5.5, 1, "Opportunity rover landed here on 25 January 2004 and worked until 2018"],
    ["Gusev crater", -14.6, 175.5, 1, "Spirit rover landed here on 4 January 2004"],
    ["Elysium Planitia", 4.5, 135.6, 1, "InSight lander touched down here on 26 November 2018 to listen for marsquakes"],
    ["Chryse Planitia", 22.3, -48, 1, "Viking 1 made the first successful American landing here on 20 July 1976"],
    ["Viking 2", 47.6, 134.3, 1, "Viking 2 landed here on 3 September 1976"], ["Ares Vallis", 19.1, -33.2, 1, "Mars Pathfinder and its rover Sojourner landed here on 4 July 1997"],
    ["Phoenix", 68.2, -125.7, 1, "Phoenix lander dug into ice-rich soil here after landing on 25 May 2008"], ["Zhurong", 25.1, 109.9, 1, "China's Zhurong rover landed here on 14 May 2021"]];
  function buildMars(img) {
    const N = LITE ? 150000 : 330000, a = [], g = Math.PI * (3 - Math.sqrt(5)); let px = null, PW = 0, PH = 0;
    if (img) try { PW = 1440; PH = 720; const cv = document.createElement("canvas"); cv.width = PW; cv.height = PH; const cx = cv.getContext("2d", { willReadFrequently: true }); cx.drawImage(img, 0, 0, PW, PH); px = cx.getImageData(0, 0, PW, PH).data; } catch (e) { px = null; }
    const grey = !px || (MARS.meta && MARS.meta.colour === false);   // a grey map is tinted with Mars's own range of rust
    for (let i = 0; i < N; i++) { const y = 1 - (i + 0.5) / N * 2, r = Math.sqrt(1 - y * y), th = i * g, x = Math.sin(th) * r, z = Math.cos(th) * r; let c = [0.8, 0.42, 0.26];
      if (px) { const lon = Math.atan2(x, z) / DEG, lat = Math.asin(y) / DEG, o = (Math.min(PH - 1, Math.floor((90 - lat) / 180 * PH)) * PW + Math.min(PW - 1, Math.floor((lon + 180) / 360 * PW))) * 4;
        c = grey ? ramp([[0.2, 0.1, 0.09], [0.62, 0.3, 0.2], [0.95, 0.56, 0.36], [1, 0.82, 0.66]], (px[o] + px[o + 1] + px[o + 2]) / 765) : [Math.min(1, px[o] / 255 * 1.25 + 0.03), Math.min(1, px[o + 1] / 255 * 1.2), Math.min(1, px[o + 2] / 255 * 1.15)]; }
      a.push(x, y, z, c[0], c[1], c[2], 0.62 + rnd() * 0.3, 1.1 + rnd() * 0.55, rnd()); }
    M.mars = mesh(P_POINT, POINT, a, gl.POINTS); MARS.map = !!px; MARS.reveal = 0;
    if (MARS.ready) return; MARS.ready = true;
    const mk = [];
    for (const [name, lat, lon, kind, text] of MARSMARKS) { const p = ll(lon, lat), c = kind ? [1, 0.45, 0.85] : [0.7, 0.95, 1];
      mk.push(p[0], p[1], p[2], c[0], c[1], c[2], 1, 2.2, rnd()); ring(mk, lon, lat, kind ? 0.9 : 1.6, kind ? 16 : 26, c, 0.75, 1.0);
      const pick = { p, lon, lat, kind: kind ? "Landing site on Mars" : "Mars", title: name, get sub() { return `${text} · ${hhmm(MARS.now.mtc + lon / 15)} local time there now`; } }; MARS.picks.push(pick);
      const e = document.createElement("div"); e.className = "lab sky moonlab" + (kind ? " site" : ""); e.textContent = name; $("#labels").appendChild(e); MARS.labels.push({ el: e, p, kind }); }
    M.marsMarks = mesh(P_POINT, POINT, mk, gl.POINTS);
    for (const n of ["Phobos", "Deimos"]) { const e = document.createElement("div"); e.className = "lab sky moonlab"; e.textContent = n; $("#labels").appendChild(e); MARS.labels.push({ el: e, moon: n }); }
  }
  // Phobos laps Mars in 7 h 39 min, faster than Mars turns, so it rises in the west; Deimos takes 30 h 18 min.
  const marsMoon = (name, ms) => { const d = ms / 86400000, [r, P, off] = name === "Phobos" ? [2.766, 0.31891, 1.1] : [6.922, 1.26244, 4.2], th = 6.283185 * (d / P - d / 1.02595676) + off; return [Math.sin(th) * r, 0, Math.cos(th) * r]; };
  function loadMars() {
    if (MARS.loading) return; MARS.loading = true; buildMars(null);                       // a plain rust globe until the map is in
    getJson("../data/globe/mars.json").then((j) => { MARS.meta = j; }).catch(() => {}).then(() => { const img = new Image(); img.onload = () => buildMars(img); img.src = "../data/globe/mars.jpg"; });
  }
  function setPlanet(p) {
    PLANET = p === "mars" ? "mars" : "earth"; document.body.classList.toggle("mars", PLANET === "mars");
    stopTour(); stopReplay(); closeMe(); select(null); $("#board").hidden = true; tip.style.display = "none";
    $("#plBtn").textContent = PLANET === "mars" ? "⊕ Earth" : "♂ Mars"; $("#brand h1").textContent = PLANET === "mars" ? "World Pulse · Mars" : "World Pulse";
    if (PLANET === "mars") { loadMars(); MARS.reveal = 0; flyTo(-100, 5, 3.9); cam.idle = 0; } else { SUN = sunDir(); flyTo(cam.lon, 22, 3.9); }
    head.t = 99; head.i = -1;
  }
  function drawMars(t, dt) {
    MARS.reveal = Math.min(1, MARS.reveal + dt / 2);
    drawLines(M.grid, t, { tint: [1, 0.5, 0.3], gradF: 4, gradMix: 0.7 });
    drawPoints(M.mars, t, { reveal: MARS.reveal, sun: 1, twinkle: 0.18, wave: 0.5 });
    drawPoints(M.marsMarks, t, { lift: 0.004, twinkle: 0.7 });
    // the moons and their orbit rings, leaving out whatever is behind the planet (nothing here is depth-tested)
    const a = [], put = (p, c, al, size) => { if (!hiddenByEarth(p)) a.push(p[0], p[1], p[2], c[0], c[1], c[2], al * 20, size, (p[0] * 3.1 + p[2] * 1.7 + 9) % 1); };
    for (const [r, c] of [[2.766, [0.8, 0.7, 0.6]], [6.922, [0.6, 0.65, 0.8]]]) for (let k = 0; k < 220; k++) { const th = k / 220 * 6.2832; put([Math.sin(th) * r, 0, Math.cos(th) * r], c, 0.22, 0.9); }
    for (const n of ["Phobos", "Deimos"]) { const p = marsMoon(n, Date.now()); for (let k = 0; k < 26; k++) put([p[0] + Math.sin(k * 2.4) * 0.03 * (k / 26), p[1] + Math.cos(k * 1.7) * 0.022 * (k / 26), p[2] + Math.cos(k * 2.4) * 0.03 * (k / 26)], [1, 0.9, 0.8], 0.9, 1.3); }
    dyn("marsMoons").set(a); { const u = use(P_POINT, t); gl.uniform3fv(u.uCam, [0, 0, 0]); gl.uniform1f(u.uLift, 0); gl.uniform1f(u.uReveal, 1); gl.uniform1f(u.uSunMix, 0); gl.uniform1f(u.uWave, 0); gl.uniform1f(u.uTwinkle, 0.2); gl.bindVertexArray(M.marsMoons.vao); gl.drawArrays(gl.POINTS, 0, M.marsMoons.count); }
  }
  function layoutMars() {
    const on = PLANET === "mars" && !EMBED, used = [], max = SMALL ? 6 : 12;
    for (const f of MARS.labels) {
      let s = null;
      if (on && used.length < max) { const p = f.moon ? marsMoon(f.moon, Date.now()) : f.p; if (f.moon ? !hiddenByEarth(p) : facing(p)) s = project(p);
        if (s && (s[0] < 40 || s[0] > W - 40 || s[1] < 40 || s[1] > H - 50 || used.some((q) => Math.abs(q[0] - s[0]) < 104 && Math.abs(q[1] - s[1]) < 17))) s = null; }
      if (s) { used.push(s); f.el.style.display = "block"; f.el.style.left = s[0].toFixed(1) + "px"; f.el.style.top = (s[1] - 12).toFixed(1) + "px"; } else f.el.style.display = "none";
    }
  }
  function pickMars(mx, my, rad) { let best = null, bd = rad * rad * 1.6; for (const o of MARS.picks) { if (!facing(o.p)) continue; const s = project(o.p), d = (s[0] - mx) ** 2 + (s[1] - my) ** 2; if (d < bd) { bd = d; best = o; } } return best; }
  const HEADM = [
    () => [num(MARS.now.km / 1e6) + " million km", "from Earth to Mars right now"],
    () => [MARS.now.lightMin.toFixed(1) + " min", "for a radio signal to cross that gap"],
    () => [hhmm(MARS.now.mtc), "Coordinated Mars Time, the planet's own clock"],
    () => ["Sol " + num(MARS.now.sol), "the Mars day count; one sol is 24 h 39 min"],
    () => [`${MARS.now.season}`, `in Mars's northern half (season angle ${Math.round(MARS.now.ls)}° of 360)`],
  ];
  function marsTour() {
    const out = [], add = (k, i, text, dist) => { const m = MARSMARKS[i]; out.push({ k, title: m[0], text, at: () => [m[2], m[1]], dist: dist || 2.1, dur: 9, mark: () => ll(m[2], m[1]) }); };
    add("Mars · volcano", 0, "The tallest volcano in the solar system: about 22 km high, nearly three times Everest, and as wide as Arizona.");
    add("Mars · canyon", 1, "A canyon system about 4,000 km long: laid across the United States it would reach from coast to coast.", 2.3);
    add("Mars · landing site", 16, "Perseverance has been exploring this old river delta since February 2021, collecting rock samples.", 1.9);
    add("Mars · landing site", 17, "Curiosity landed in this crater in August 2012 and has been climbing the mountain in its middle.", 1.9);
    add("Mars · impact basin", 6, "The deepest ground on Mars: about 7 km below the plains around it, and wide enough to hold Western Europe.", 2.3);
    add("Mars · polar cap", 14, "A cap of water ice about 1,000 km across, cut by spiral canyons.", 2.4);
    out.push({ k: "World Pulse · by Tenshi Systems Engineering", title: `${num(MARS.now.km / 1e6)} million km from home`, text: `A radio signal takes ${MARS.now.lightMin.toFixed(1)} minutes to cross that gap right now. Tap any ring for more, or press Earth to go back. Tenshi builds live maps like this for your own data.`, at: () => [cam.lon, 15], dist: 3.9, dur: 11, mark: null, link: ["Talk to us →", "../contact.html"] });
    return out;
  }

  /* ---------- more live layers: earthquakes, natural events, aurora, the space station ---------- */
  const dyn = (key) => (M[key] = M[key] || mesh(P_POINT, POINT, null, gl.POINTS, true));
  const dropPicks = (tag) => { for (let i = picks.length - 1; i >= 0; i--) if (picks[i].live === tag) picks.splice(i, 1); };
  // A fine ring of particles around a place (radius in degrees).
  function ring(out, lon, lat, deg, n, c, alpha, size, seed) { for (let i = 0; i < n; i++) { const th = (i / n) * 6.283, p = ll(lon + Math.cos(th) * deg / Math.max(0.15, Math.cos(lat * DEG)), lat + Math.sin(th) * deg); out.push(p[0], p[1], p[2], c[0], c[1], c[2], alpha, size, seed == null ? rnd() : (seed + i * 0.618) % 1); } }

  const QRAMP = [[1, 0.85, 0.4], [1, 0.5, 0.2], [1, 0.2, 0.25], [1, 0.3, 0.8]];
  // Draws the day's earthquakes. In the replay only those that have happened by `until` are drawn, and the newest flare.
  function buildQuakes(until) {
    const a = []; let n = 0, i = 0;
    for (const k of S.quakeList || []) {
      i++; if (until != null && k.time > until) continue; n++;
      const q = Math.min(1, k.m / 7.5), col = ramp(QRAMP, q), p = ll(k.lon, k.lat), fresh = until == null ? 0 : Math.max(0, 1 - (until - k.time) / 2700000);   // flares for 45 replayed minutes
      const g = until == null ? 1 : 0.35 + (1 - fresh) * 0.65, sd = (i * 0.37) % 1;
      a.push(p[0], p[1], p[2], col[0], col[1], col[2], 0.95, (1.2 + q * 2.4) * (1 + fresh * 1.6), sd);
      if (k.m >= 2.5 || fresh) { ring(a, k.lon, k.lat, (0.25 + q * 1.6) * g, 10 + Math.round(q * 34), col, 0.75 + fresh * 0.25, 1.0 + fresh * 0.6, sd);
        if (k.m >= 4.5) ring(a, k.lon, k.lat, (0.6 + q * 3.2) * g, 26 + Math.round(q * 50), col, 0.45 + fresh * 0.4, 0.95, sd + 0.5); }
    }
    dyn("quakes").set(a); return n;
  }
  async function pollQuakes() {
    if (!L.quakes.on || document.hidden) return setTimeout(pollQuakes, 3000);
    try {
      const j = await (await fetch("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson", { signal: AbortSignal.timeout(30000) })).json(), list = []; let big = 0, top = null;
      dropPicks("quake");
      for (const f of j.features || []) {
        const c = f.geometry?.coordinates, m = f.properties?.mag; if (!c || !(m > 0)) continue;
        const k = { m, lon: c[0], lat: c[1], place: f.properties.place || "", time: f.properties.time }; list.push(k);
        if (m >= 4.5) big++;
        if (!top || m > top.m) top = k;
        picks.push({ p: ll(c[0], c[1]), layer: "quakes", live: "quake", time: k.time, kind: `Earthquake · magnitude ${m.toFixed(1)}`, title: k.place || "Earthquake", sub: `${new Date(k.time).toISOString().slice(11, 16)} UTC · ${Math.round(c[2])} km deep` });
      }
      list.sort((x, y) => x.time - y.time);
      S.quakeList = list; S.quake = top; S.quakes = list.length; buildQuakes(replay.on ? replayTime() : null); L.quakes.count(S.quakes); L.quakes.status("live", `${big} of magnitude 4.5+ · USGS`);
    } catch (e) { if (!M.quakes) L.quakes.status("off", "live feed not reachable right now"); }
    setTimeout(pollQuakes, 5 * 60000);
  }

  async function pollEvents() {
    if (!L.events.on || document.hidden) return setTimeout(pollEvents, 3000);
    try {
      const j = await (await fetch("https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=800", { signal: AbortSignal.timeout(40000) })).json(), a = [], n = {}; let top = null;
      const KIND = { wildfires: ["Wildfire", [1, 0.5, 0.12]], severeStorms: ["Severe storm", [0.6, 0.95, 1]], volcanoes: ["Volcano", [1, 0.2, 0.2]], seaLakeIce: ["Iceberg / sea ice", [0.8, 0.9, 1]] };
      dropPicks("eonet");
      for (const e of j.events || []) {
        const g = e.geometry?.[e.geometry.length - 1], k = KIND[e.categories?.[0]?.id] || ["Natural event", [1, 0.8, 0.5]];
        if (!g || g.type !== "Point") continue;
        const [lon, lat] = g.coordinates, p = ll(lon, lat), storm = k[0] === "Severe storm";
        a.push(p[0], p[1], p[2], k[1][0], k[1][1], k[1][2], 1, storm ? 2.6 : 1.7, rnd());
        if (storm) { ring(a, lon, lat, 1.2, 30, k[1], 0.8, 1.1); ring(a, lon, lat, 2.4, 44, k[1], 0.5, 1.0); ring(a, lon, lat, 3.8, 60, k[1], 0.3, 0.95); } else ring(a, lon, lat, 0.3, 7, k[1], 0.6, 0.95);
        n[k[0]] = (n[k[0]] || 0) + 1;
        { const rank = storm ? 3 : k[0] === "Volcano" ? 2 : k[0] === "Wildfire" ? 1 : 0; if (rank && (!top || rank > top.rank)) top = { rank, kind: k[0], lon, lat, title: e.title }; }
        picks.push({ p, layer: "events", live: "eonet", kind: k[0] + " · active", title: e.title, sub: (g.date || "").slice(0, 10) + " · NASA EONET" });
      }
      S.event = top; dyn("eonet").set(a); L.events.count(Object.values(n).reduce((x, y) => x + y, 0));
      L.events.status("live", Object.entries(n).map(([k, v]) => `${v} ${k.toLowerCase()}${v > 1 ? "s" : ""}`).join(" · ") + " · NASA EONET");
    } catch (e) { if (!M.eonet) L.events.status("off", "live feed not reachable right now"); }
    setTimeout(pollEvents, 30 * 60000);
  }

  // Aurora: NOAA's 30-minute forecast grid; each cell's chance becomes a curtain of fine particles, green low and violet high.
  async function pollAurora() {
    if (!L.aurora.on || document.hidden) return setTimeout(pollAurora, 3000);
    try {
      const j = await (await fetch("https://services.swpc.noaa.gov/json/ovation_aurora_latest.json", { signal: AbortSignal.timeout(40000) })).json(), a = [], grid = new Uint8Array(360 * 181); let peak = 0, top = null;
      for (const [lon, lat, v] of j.coordinates || []) {
        grid[(((Math.round(lon) % 360) + 360) % 360) * 181 + Math.max(0, Math.min(180, Math.round(lat) + 90))] = v;
        if (v < 6) continue; peak = Math.max(peak, v); if (!top || v > top.v) top = { v, lon: lon > 180 ? lon - 360 : lon, lat };
        for (let k = Math.min(9, Math.ceil(v / 9)); k > 0; k--) { const hgt = rnd(), c = ramp([[0.25, 1, 0.5], [0.3, 1, 0.8], [0.5, 0.6, 1], [0.85, 0.35, 1]], hgt), p = ll(lon + rnd(), lat + rnd() - 0.5, 1.012 + hgt * 0.035);
          a.push(p[0], p[1], p[2], c[0], c[1], c[2], Math.min(0.9, 0.12 + v / 70) * (1 - hgt * 0.5), 0.95 + rnd() * 0.5, rnd()); }
      }
      S.aurora = top; S.auroraGrid = grid; dyn("aurora").set(a); L.aurora.count(peak + "%"); L.aurora.status("live", "peak chance overhead in the next 30 min · NOAA SWPC");
    } catch (e) { if (!M.aurora) L.aurora.status("off", "forecast not reachable right now"); }
    setTimeout(pollAurora, 10 * 60000);
  }

  // Every active satellite, moved along its real orbit (elements from CelesTrak; a simplified two-body model with J2 drift).
  const SATS = []; const T0 = Date.now() / 1000 - now();          // the clock time when this page's timer read zero
  const gmst = (ms = Date.now()) => (((280.46061837 + 360.98564736629 * (ms / 86400000 + 2440587.5 - 2451545)) % 360) * DEG);
  function loadSats() {
    getJson("../data/globe/sats.json").then((j) => {
      const a = [], LAGS = LITE ? [0, 5, 10] : [0, 4, 8, 12, 16]; SATS.length = 0;
      for (const [name, rev, e, inc, raan, argp, M, epoch] of j.sats) {
        const age = T0 - epoch / 1000; if (age > 21 * 86400 || e > 0.8) continue;
        const n = rev * 2 * Math.PI / 86400, sma = Math.cbrt(398600.4418 / (n * n)) / 6371, i = inc * DEG, k = 1.5 * 1.08263e-3 / (sma * (1 - e * e)) ** 2 * n;
        const el = [sma, e, i, raan * DEG - k * Math.cos(i) * age, argp * DEG + k * (2.5 * Math.cos(i) ** 2 - 0.5) * age, (M * DEG + n * age) % (2 * Math.PI), n, rnd()];
        SATS.push({ el, name });
        for (const lag of LAGS) a.push(el[0], el[1], el[2], el[3], el[4], el[5], el[6], el[7], lag);
      }
      M.sats = mesh(P_SAT, [["aEl1", 4], ["aEl2", 4], ["aLag", 1]], a, gl.POINTS);
      const h = Math.round((Date.now() - Date.parse(j.updatedAt)) / 3600000);
      L.sats.count(SATS.length); L.sats.status("live", `moving on their real orbits · elements ${h} h old · CelesTrak`);
    }).catch(() => L.sats.status("off", "first data sync in progress, check back in a few minutes"));
  }
  function satPos(el, t, gm = gmst()) {
    const [a, e, i, O0, w, M0, n] = el, Mn = M0 + n * t; let E = Mn; for (let k = 0; k < 4; k++) E -= (E - e * Math.sin(E) - Mn) / (1 - e * Math.cos(E));
    const xv = a * (Math.cos(E) - e), yv = a * Math.sqrt(1 - e * e) * Math.sin(E), xp = Math.cos(w) * xv - Math.sin(w) * yv, yp = Math.sin(w) * xv + Math.cos(w) * yv, O = O0 - gm;
    return [Math.sin(O) * xp + Math.cos(O) * Math.cos(i) * yp, Math.sin(i) * yp, Math.cos(O) * xp - Math.sin(O) * Math.cos(i) * yp];
  }

  const iss = moverSet([1, 1, 1], 60, 9, 2.8); let issPrev = null;
  async function pollIss() {
    if (!L.space.on || document.hidden) return setTimeout(pollIss, 3000);
    try {
      const j = await (await fetch("https://api.wheretheiss.at/v1/satellites/25544", { signal: AbortSignal.timeout(10000) })).json(), t = now(), p = ll(j.longitude, j.latitude); let v = [0, 0, 0];
      if (issPrev && t - issPrev.t < 60) { const dt = t - issPrev.t; v = [(p[0] - issPrev.p[0]) / dt, (p[1] - issPrev.p[1]) / dt, (p[2] - issPrev.p[2]) / dt]; }
      issPrev = { p, t };
      iss.map.set("iss", { p, v, t0: t, alt: j.altitude / 6371, title: "International Space Station", sub: `${Math.round(j.altitude)} km up · ${Math.round(j.velocity).toLocaleString("en-US")} km/h` }); iss.rebuild();
      L.space.count("ISS"); L.space.status("live", `${Math.round(j.altitude)} km up, ${Math.round(j.velocity).toLocaleString("en-US")} km/h`);
    } catch (e) { if (!issPrev) L.space.status("off", "live position not reachable right now"); }
    setTimeout(pollIss, 6000);
  }

  /* ---------- pointing at things: hover with a mouse, tap or click to select ---------- */
  const tip = $("#tip"), selEl = $("#sel"), narrow = () => innerWidth <= 760;   // narrow: the Layers panel sits along the bottom
  $("#panel").addEventListener("toggle", () => { if ($("#panel").open && narrow()) { select(null); stopTour(); stopReplay(); closeMe(); } });
  let sel = null;         // the selected thing: { kind, title, sub, layer, p | pos(t) }
  // Satellites sit where their orbit puts them now, or at the replayed moment while the replay runs.
  const satNow = (el, t) => replay.on ? satPos(el, t + (replayTime() - Date.now()) / 1000, gmst(replayTime())) : satPos(el, t);
  function pickAt(mx, my, rad) {
    if (PLANET === "mars") return pickMars(mx, my, rad);
    let best = null, bd = rad * rad; const t = now(), rt = replay.on ? replayTime() : Infinity;
    const near = (p, layer) => { if (!L[layer].on || !facing(p)) return false; const s = project(p), d = (s[0] - mx) ** 2 + (s[1] - my) ** 2; if (d < bd) { bd = d; return true; } return false; };
    for (const o of picks) if (!(o.time > rt) && near(o.p, o.layer)) best = o;
    if (!replay.on) for (const [set, layer, kind] of [[iss, "space", "Space station · live"], [planes, "planes", "Aircraft · live"], [ships, "ships", "Ship · live"], [trains, "rail", "Train · live"]])
      for (const [key, m] of set.map) if (near(moverPos(m, t), layer)) best = { layer, kind, title: m.title, sub: m.sub, pos: (t2) => { const x = set.map.get(key); return x ? moverPos(x, t2) : null; } };
    if (L.sats.on && SATS.length && !best) for (const sat of SATS) { const p = satNow(sat.el, t); if (dot(norm(p), EYE) < 1 / Math.hypot(p[0], p[1], p[2])) continue; const sc = project(p), d = (sc[0] - mx) ** 2 + (sc[1] - my) ** 2;
      if (d < bd) { bd = d; best = { layer: "sats", sat: true, kind: "Satellite · live orbit", title: sat.name, sub: `${Math.round((sat.el[0] - 1) * 6371).toLocaleString("en-US")} km up`, pos: (t2) => satNow(sat.el, t2) }; } }
    if (!best && L.moon.on && moon.p) { const o = moonOnScreen(); if (o && !hiddenByEarth(moon.p.c) && (o.s[0] - mx) ** 2 + (o.s[1] - my) ** 2 < Math.max(rad, o.r) ** 2) best = moonCard(); }
    if (!best && L.sky.on && SKY) for (const s of SKY.named) { const q = projectSky(skyDir(s[0], s[1])); if (!q) continue; const d = (q[0] - mx) ** 2 + (q[1] - my) ** 2;
      if (d < bd) { bd = d; best = { layer: "sky", sky: [s[0], s[1]], kind: "Star" + (conName(s[4]) ? " · in " + conName(s[4]) : ""), title: s[3], sub: `magnitude ${s[2].toFixed(1)}${s[2] < 1.5 ? ", one of the brightest in the sky" : ""}` }; } }
    return best;
  }
  // card: a sheet in the bottom dock with a close button (touch and small screens); otherwise a tooltip beside the point.
  function showTip(o, mx, my, card) {
    tip.innerHTML = `<button class="x" type="button" aria-label="Close">&times;</button><div class="k"></div><div class="t"></div><div class="s"></div>`;
    tip.children[1].textContent = o.kind; tip.children[2].textContent = o.title; tip.children[3].textContent = o.sub || "";
    tip.children[0].onclick = () => select(null);
    tip.classList.toggle("card", !!card); tip.style.display = "block";
    if (card) { tip.style.left = tip.style.top = ""; } else placeTip(mx, my);
  }
  const placeTip = (x, y) => { tip.style.left = Math.max(8, Math.min(W - 260, x + 14)) + "px"; tip.style.top = Math.max(8, y - 10) + "px"; };
  function hover(mx, my) {
    if (sel) return;
    const o = pickAt(mx, my, 15);
    if (o) showTip(o, mx, my, false); else tip.style.display = "none";
  }
  function select(o, mx, my, card) {
    sel = o || null;
    if (!sel) { tip.style.display = "none"; tip.classList.remove("card"); selEl.style.display = "none"; return; }
    if (card && narrow()) { $("#panel").open = false; $("#board").hidden = true; }
    showTip(sel, mx, my, card);
  }
  function tap(mx, my, type) { const touch = type !== "mouse"; select(pickAt(mx, my, touch ? 30 : 16), mx, my, touch || SMALL); }
  // The ring marks the selection, or the subject of the current tour stop, and follows it as things move.
  function trackSel(t) {
    const mark = !sel && tour.on ? tour.steps[tour.i].mark : null;
    if (!sel && !mark) { if (selEl.style.display !== "none") selEl.style.display = "none"; return; }
    if (sel && sel.layer && !L[sel.layer].on) return select(null);
    let s = null;
    if (sel && sel.sky) s = projectSky(skyDir(sel.sky[0], sel.sky[1]));          // a star: a direction, not a place
    else { const p = sel ? (sel.pos ? sel.pos(t) : sel.p) : mark();
      if (sel && !p) return select(null);
      if (p && (sel && sel.sat ? !hiddenByEarth(p) : facing(p))) s = project(p); }
    if (!s) { selEl.style.display = "none"; return; }
    selEl.style.display = "block"; selEl.style.transform = `translate(${s[0].toFixed(1)}px,${s[1].toFixed(1)}px)`;
    if (sel && !tip.classList.contains("card")) placeTip(s[0], s[1]);
  }

  /* ---------- the headline number: one live figure at a time, under the clock ---------- */
  const num = (n) => Math.round(n).toLocaleString("en-US");
  const HEAD = [
    () => L.planes.on && planes.map.size > 20 ? [num(planes.map.size), "aircraft tracked live right now"] : null,
    () => L.vital.on && vital ? [num(vital.b.total * ((Date.now() % 86400000) / 86400000)), "babies born so far today (modelled)"] : null,
    () => L.sats.on && SATS.length ? [num(SATS.length), "satellites circling overhead"] : null,
    () => L.quakes.on && S.quakes != null ? [num(S.quakes), "earthquakes in the last 24 hours"] : null,
    () => L.rain.on && S.rain != null ? [S.rain + "%", "of the globe under rain or snow"] : null,
    () => L.ships.on && ships.map.size ? [num(ships.map.size), "ships under way in the Baltic, live"] : null,
    () => L.surf.on && S.swell ? [S.swell.m.toFixed(1) + " m", "tallest waves on the open ocean right now (model)"] : null,
    () => L.wind.on && S.jet ? [num(S.jet.kmh) + " km/h", "fastest jet-stream wind right now (model)"] : null,
    () => L.markets.on && STOCKS ? [`${S.open} of ${STOCKS.exchanges.length}`, "stock exchanges trading right now"] : null,
    () => { if (!L.markets.on || !MK) return null; const q = MK.quotes.filter((x) => PIN[x.sym] && x.pct != null); return q.length ? [`${q.filter((x) => x.pct >= 0).length} of ${q.length}`, "indexes and commodities up (delayed)"] : null; },
    () => L.vital.on && vital ? [num(vital.d.total * ((Date.now() % 86400000) / 86400000)), "people died so far today (modelled)"] : null,
  ];
  const head = { i: -1, t: 99, el: $("#stat") };
  const headList = () => (PLANET === "mars" ? (MARS.now ? HEADM : []) : HEAD);
  function paintHead() { const HEAD = headList(), v = HEAD[head.i] && HEAD[head.i](); if (!v) { head.t = 99; return; } $("#statN").textContent = v[0]; $("#statL").textContent = v[1]; }
  function updateHead(dt) {
    if (!head.el) return; const HEAD = headList();
    head.t += dt;
    if (head.t > 6) {                                              // move on to the next figure that has data
      for (let k = 1; k <= HEAD.length; k++) { const i = (head.i + k + HEAD.length) % HEAD.length; if (!HEAD[i]()) continue;
        head.t = 0; if (i === head.i) break;
        head.i = i; head.el.classList.remove("in"); setTimeout(() => { paintHead(); head.el.classList.add("in"); }, 260); break; }
      if (head.t > 6) head.t = 5;                                  // nothing has loaded yet: look again in a second
      return;
    }
    if (head.el.classList.contains("in")) paintHead();             // keep the figure ticking while it is on show
  }

  /* ---------- the tour: the camera flies between what is happening right now, with one line about each ----------
     Runs from the Tour button, from world-pulse.html?tour, and by itself (looping) in the embedded preview. */
  const lonlat = (p) => { const n = norm(p); return [Math.atan2(n[0], n[2]) / DEG, Math.asin(n[1]) / DEG]; };
  const wrapLon = (x) => ((((x + 180) % 360) + 360) % 360) - 180;
  function flyTo(lon, lat, dist) { cam.tLon = cam.lon + wrapLon(lon - cam.lon); cam.tLat = lat; cam.tDist = dist; cam.vLon = cam.vLat = 0; }
  const tour = { on: false, steps: [], i: 0, t: 0 };
  function tourSteps() {
    // o: dist (camera distance), dur (seconds), mark (false, or a function giving the point to ring), link ([text, address])
    const out = [], add = (k, title, text, at, o = {}) => out.push({ k, title, text, at, dist: o.dist || 2.2, dur: o.dur || 8, link: o.link, mark: o.mark === false ? null : o.mark || (() => { const a = at(); return a ? ll(a[0], a[1]) : null; }) });
    { const [sl, sd] = lonlat(SUN), H = Math.acos(Math.max(-1, Math.min(1, -Math.tan(25 * DEG) * Math.tan(sd * DEG)))) / DEG;   // where the sun is rising at 25°N
      add("Day and night", "Dawn is breaking here", "The sun is rising along this line right now. Behind it the city lights are still on; ahead of it the day has begun.", () => [sl - H, 25], { dist: 2.7, mark: false }); }
    if (L.planes.on && planes.map.size > 30) { const n = new Array(HUBS.length).fill(0), t = now();
      for (const m of planes.map.values()) { const p = norm(moverPos(m, t)); for (let i = 0; i < HUBV.length; i++) if (dot(p, HUBV[i]) > 0.99736) n[i]++; }
      const i = n.indexOf(Math.max(...n));
      if (n[i] > 5) add("Air traffic · live", `Busiest sky we're tracking: ${HUBS[i][2]}`, `${num(n[i])} aircraft within 460 km of ${HUBS[i][2]} at this moment, live from adsb.lol.`, () => [HUBS[i][1], HUBS[i][0]], { dist: 1.9, mark: false }); }
    if (L.markets.on && STOCKS) { const open = STOCKS.exchanges.filter((x) => x.open);
      if (open.length) { const x = open.reduce((a, b) => (Math.abs(b.avg) > Math.abs(a.avg) ? b : a));
        add("Markets · trading now", `${x.name} is open`, `${open.length} of ${STOCKS.exchanges.length} exchanges are trading at this moment (regular hours). Here ${x.up} companies are up and ${x.down} down, on delayed prices.`, () => [x.lon, x.lat], { dist: 2.0 }); } }
    if (L.markets.on && MK) { let q = null; for (const x of MK.quotes) if (PIN[x.sym] && x.pct != null && !x.stale && (!q || Math.abs(x.pct) > Math.abs(q.pct))) q = x;
      if (q) add("Markets · delayed", `Biggest move: ${PIN[q.sym][2]}`, `${PIN[q.sym][2]} is ${q.pct >= 0 ? "up" : "down"} ${Math.abs(q.pct).toFixed(2)}% in its latest session, the largest swing on the map.`, () => [PIN[q.sym][0], PIN[q.sym][1]], { dist: 2.1 }); }
    if (L.net.on && S.dc) add("Internet · static map", "Where the internet lives", `${num(S.dc.n)} data centres are mapped in this one cluster, the densest on the globe (OpenStreetMap).`, () => [S.dc.lon, S.dc.lat], { dist: 1.9 });
    if (L.pop.on && S.pop) add("Population · static map", "The most crowded point on the map", `About ${(S.pop.k / 1000).toFixed(1)} million people live in towns and cities inside this half-degree cell (GeoNames).`, () => [S.pop.lon, S.pop.lat], { dist: 2.0 });
    if (L.ships.on && ships.map.size > 10) add("Shipping · live in the Baltic", "Ships under way", `${num(ships.map.size)} ships are moving here right now (Fintraffic). Ports are mapped worldwide; live positions cover the Baltic only.`, () => [21, 59.3], { dist: 1.75, mark: false });
    if (L.surf.on && S.swell) add("Waves · wave model", `The biggest swell on Earth: ${S.swell.m.toFixed(1)} m`, `Waves this tall, ${Math.round(S.swell.s)} seconds apart, are running across the open ocean here. The coloured lines follow the swell on its way to the coast (NOAA).`, () => [S.swell.lon, S.swell.lat], { dist: 2.4 });
    if (L.cur.on && S.cur) add("Ocean currents · satellite altimetry", `A river in the sea: ${S.cur.sp.toFixed(1)} m/s`, `The fastest surface current mapped right now. The slow dashed lines trace the great currents and the eddies that spin off them (NOAA CoastWatch).`, () => [S.cur.lon, S.cur.lat], { dist: 2.2 });
    if (L.wind.on && S.jet) add("Jet stream · weather model", `The fastest wind on Earth: ${num(S.jet.kmh)} km/h`, `About 10 km up, where airliners cruise. The gold streaks trace the jet stream; the pale ones below are wind near the ground (NOAA GFS).`, () => [S.jet.lon, S.jet.lat], { dist: 2.6 });
    if (L.quakes.on && S.quake) add("Earthquakes · live", `Strongest in 24 hours: magnitude ${S.quake.m.toFixed(1)}`, `${S.quake.place || "Location not named"} · ${new Date(S.quake.time).toISOString().slice(11, 16)} UTC (USGS).`, () => [S.quake.lon, S.quake.lat], { dist: 2.1 });
    if (L.events.on && S.event) add(`${S.event.kind} · active`, S.event.title, `One of the natural events NASA is tracking right now (EONET).`, () => [S.event.lon, S.event.lat], { dist: 2.1 });
    if (L.aurora.on && S.aurora && S.aurora.v >= 25) add("Aurora · live forecast", "Northern and southern lights", `${S.aurora.v}% chance of aurora overhead here in the next 30 minutes (NOAA).`, () => [S.aurora.lon, S.aurora.lat], { dist: 2.5, mark: false });
    if (L.moon.on && moon.p) { const m = moon.p, tall = W / H < 1, f = tall ? Math.min(2.9, 1.12 / (W / H)) : 1;
      // Look from the far side of the Earth, a little off the line to the Moon, so it stands clear of the Earth's edge:
      // above the Earth on a wide screen, beside a smaller Earth on a tall one (a phone has little room top and bottom).
      add("The Moon · calculated", `${m.name}, ${Math.round(m.lit * 100)}% lit`, `${num(m.km)} km away right now, and straight overhead at the ring on the far side of the Earth. Its pull raises the tides. Drawn much bigger and closer than it is, with its real face and phase.`,
        () => (tall ? [moon.p.lon + 193.5, -moon.p.lat + (SMALL ? 5 : 0)] : [moon.p.lon + 180, -moon.p.lat + 20.5 + (SMALL ? 5 : 0)]), { dist: tall ? Math.min(6, 1 + 11 / f) : 1 + 5 / f, mark: false, dur: 10 }); }
    if (L.space.on && iss.map.has("iss")) add("Space station · live", "The International Space Station", `${iss.map.get("iss").sub}, with a crew on board.`, () => { const m = iss.map.get("iss"); return m ? lonlat(moverPos(m, now())) : null; }, { dist: 2.6, mark: () => { const m = iss.map.get("iss"); return m ? moverPos(m, now()) : null; } });
    add("World Pulse · by Tenshi Systems Engineering", "That's the planet right now", (EMBED ? "Open it full screen to explore." : "Drag, pinch and tap to explore.") + " Tenshi builds live maps like this for your own data.", () => [cam.lon, 20], { dist: 3.9, dur: 11, mark: false, link: ["Talk to us →", "../contact.html"] });
    return out;
  }
  function showStep() {
    const s = tour.steps[tour.i], c = $("#cap"), a = $("#capLink"); tour.t = 0;
    c.querySelector(".ck").textContent = `${s.k} · ${tour.i + 1} / ${tour.steps.length}`; c.querySelector(".ct").textContent = s.title; c.querySelector(".cs").textContent = s.text;
    if (s.link) { a.hidden = false; a.textContent = s.link[0]; a.href = s.link[1]; } else a.hidden = true;
    c.classList.remove("in"); requestAnimationFrame(() => requestAnimationFrame(() => c.classList.add("in")));
    if (tour.i === tour.steps.length - 1) { const p = s.at(); s.at = () => p; }      // the last stop holds still
  }
  function startTour() {
    stopReplay(); closeMe(); select(null); hideHint();
    tour.steps = PLANET === "mars" ? marsTour() : tourSteps(); tour.i = 0; tour.on = true;
    $("#board").hidden = true; if (narrow()) $("#panel").open = false;
    $("#cap").hidden = false; $("#tourBtn").textContent = "■ Stop"; showStep();
  }
  function stopTour() { if (!tour.on) return; tour.on = false; $("#cap").hidden = true; $("#tourBtn").textContent = "▶ Tour"; cam.idle = 0; }
  function nextStep() { if (++tour.i < tour.steps.length) return showStep(); if (!EMBED) return stopTour(); tour.steps = tourSteps(); tour.i = 0; showStep(); }   // the preview loops, with fresh figures
  function updateTour(dt) {
    if (!tour.on) return;
    const s = tour.steps[tour.i]; tour.t += dt; cam.idle = -5;      // no idle drift while touring
    const a = s.at(); if (a) flyTo(a[0], a[1] - (SMALL ? 5 : 0), s.dist);
    $("#capBar").style.width = Math.min(100, tour.t / s.dur * 100).toFixed(1) + "%";
    if (tour.t >= s.dur) nextStep();
  }

  /* ---------- what's above me: satellites, aircraft and the space station over the visitor's own spot ---------- */
  const me = { on: false, p: null, lon: 0, lat: 0, src: "", pass: null }, meEl = $("#meDot");
  function aboveMe() {
    stopTour(); stopReplay(); select(null);
    $("#me").hidden = false; $("#board").hidden = true; if (narrow()) $("#panel").open = false;
    const go = (lon, lat, src) => { Object.assign(me, { on: true, lon, lat, p: ll(lon, lat), src, pass: null }); flyTo(lon, lat - (narrow() ? 5 : 0), 1.9); cam.idle = -90; renderMe(); nearMe(); };
    const fallback = () => go(wrapLon(cam.lon), cam.lat, "the centre of your view, because your location wasn't shared");
    if (!navigator.geolocation) return fallback();
    $("#meBody").textContent = "Asking your device where you are…";
    navigator.geolocation.getCurrentPosition((g) => go(g.coords.longitude, g.coords.latitude, "your location"), fallback, { timeout: 12000, maximumAge: 600000 });
  }
  function closeMe() { me.on = false; $("#me").hidden = true; meEl.style.display = "none"; }
  // Aircraft around the spot, asked for with the position rounded to a tenth of a degree (about 10 km).
  async function nearMe() {
    if (!me.on) return; const at = me.p;
    try { const r = await fetch(`https://api.adsb.lol/v2/lat/${me.lat.toFixed(1)}/lon/${me.lon.toFixed(1)}/dist/100`, { signal: AbortSignal.timeout(12000) }); if (r.ok) { takePlanes(await r.json(), now()); planes.dirty = true; } } catch (e) {}
    if (me.on && me.p === at) setTimeout(nearMe, 20000);
  }
  // How high something stands above the horizon of a place (degrees), and how far away it is (km).
  const elev = (p, o) => { const d = [p[0] - o[0], p[1] - o[1], p[2] - o[2]], r = Math.hypot(d[0], d[1], d[2]); return [Math.asin(dot(d, o) / r) / DEG, r * 6371]; };
  // The next time the space station climbs 10° above the place: its orbit stepped forward 24 hours (simplified model, so an estimate).
  function issPass() {
    const s = SATS.find((x) => x.name === "ISS (ZARYA)"); if (!s) return null;
    const t0 = now(), w0 = Date.now(); let start = null, peak = 0;
    for (let dt = 0; dt <= 86400; dt += 20) { const el = elev(satPos(s.el, t0 + dt, gmst(w0 + dt * 1000)), me.p)[0];
      if (el >= 10) { if (start == null) start = dt; peak = Math.max(peak, el); } else if (start != null) break; }
    return { sat: s, start: start == null ? null : w0 + start * 1000, peak };
  }
  function renderMe() {
    if (!me.on) return; const t = now(), rows = [];
    if (SATS.length) { let n = 0, best = null;
      for (const s of SATS) { const [el, km] = elev(satPos(s.el, t), me.p); if (el >= 10) { n++; if (!best || el > best.el) best = { el, km, name: s.name }; } }
      rows.push([num(n), `satellites above you right now${best ? `. Highest: ${best.name}, ${Math.round(best.el)}° up, ${num(best.km)} km away` : ""}`]); }
    { let n = 0, best = null;
      for (const m of planes.map.values()) { const km = Math.acos(Math.min(1, dot(norm(moverPos(m, t)), me.p))) * 6371; if (km <= 150) { n++; if (!best || km < best.km) best = { km, m }; } }
      rows.push([num(n), best ? `aircraft within 150 km. Nearest: ${best.m.title}, ${Math.round(best.km)} km away (${best.m.sub})` : "aircraft tracked within 150 km right now"]); }
    if (SATS.length) { let ps = me.pass || (me.pass = issPass());
      if (ps) { const el = elev(satPos(ps.sat.el, t), me.p)[0];
        if (el < 10 && ps.start != null && Date.now() > ps.start) ps = me.pass = issPass();       // that pass is over: find the next
        const mins = ps.start == null ? null : Math.round((ps.start - Date.now()) / 60000);
        rows.push(["ISS", el >= 10 ? `the space station is above you now, ${Math.round(el)}° up` : mins == null ? "no space station pass over you in the next 24 hours" : `next space station pass in about ${mins >= 60 ? Math.floor(mins / 60) + " h " + (mins % 60) + " min" : Math.max(1, mins) + " min"}, climbing to ${Math.round(ps.peak)}° (estimate)`]); } }
    if (WX) { const c = tempC(me.lon, me.lat), u = wxAt(WX.u, me.lon, me.lat) * 0.5, v = wxAt(WX.v, me.lon, me.lat) * 0.5, from = COMPASS[Math.round((((Math.atan2(-u, -v) / DEG) + 360) % 360) / 45) % 8];
      rows.push([`${Math.round(c)}°C`, `(${Math.round(c * 9 / 5 + 32)}°F) air temperature, with wind at ${Math.round(Math.hypot(u, v) * 3.6)} km/h from the ${from} (weather model, about 100 km resolution)`]); }
    { const w = waveAt(me.lon, me.lat); if (w) rows.push([w.m.toFixed(1) + " m", `waves offshore, ${Math.round(w.s)} s apart, from the ${from8(w.from)} (${swellKind(w.s)}, wave model)`]); }
    if (OC && OC.tides) { let st = null, bd = 0.0188;                 // the nearest tide station within about 120 km
      for (const s of OC.tides) { const d = Math.acos(Math.min(1, dot(ll(s[0], s[1]), me.p))); if (d < bd) { bd = d; st = s; } }
      const t = st && tideNow(st, Date.now() / 60000); if (t) rows.push(["Tide", `at ${st[2]}: ${tideText(t)} (predicted)`]); }
    if (S.quakeList) { let n = 0, top = 0; for (const k of S.quakeList) if (Math.acos(Math.min(1, dot(ll(k.lon, k.lat), me.p))) * 6371 <= 500) { n++; top = Math.max(top, k.m); }
      if (n) rows.push([num(n), `earthquake${n > 1 ? "s" : ""} within 500 km in the last 24 hours, the strongest magnitude ${top.toFixed(1)}`]); }
    if (moon.p) { const el = Math.asin(Math.max(-1, Math.min(1, dot(me.p, moon.p.dir)))) / DEG;
      rows.push(["Moon", `${moon.p.name.toLowerCase()}, ${Math.round(moon.p.lit * 100)}% lit, ${el > 0 ? `${Math.round(el)}° above your horizon` : "below your horizon right now"}`]); }
    if (S.auroraGrid) { const v = S.auroraGrid[(((Math.round(me.lon) % 360) + 360) % 360) * 181 + Math.round(me.lat) + 90]; if (v >= 5) rows.push([v + "%", "chance of aurora overhead in the next 30 minutes"]); }
    const body = $("#meBody"); body.textContent = "";
    for (const [n, text] of rows) { const r = el("div", "mr"); r.append(el("b", "mono", n), el("span", null, text)); body.append(r); }
    body.append(el("p", "mn", `Using ${me.src}. Worked out on this device; only a rounded position goes to adsb.lol to find nearby aircraft.`));
  }
  function trackMe() {
    if (!me.on || !me.p) return;
    if (!facing(me.p)) { meEl.style.display = "none"; return; }
    const s = project(me.p); meEl.style.display = "block"; meEl.style.transform = `translate(${s[0].toFixed(1)}px,${s[1].toFixed(1)}px)`;
  }

  /* ---------- replay: the last 24 hours in half a minute ----------
     Only things with a time attached can replay: the day-and-night line, the earthquakes (in the order they happened)
     and the satellites (run along their orbits). Everything live-only is hidden meanwhile, and the bar says so. */
  const replay = { on: false, f: 0, play: true, base: 0, hold: 0, scrub: false };
  const replayTime = () => replay.base - 86400000 * (1 - replay.f);
  function startReplay() {
    stopTour(); closeMe(); select(null);
    Object.assign(replay, { on: true, f: 0, play: true, base: Date.now(), hold: 0 });
    $("#rp").hidden = false; $("#board").hidden = true; if (narrow()) $("#panel").open = false; $("#rpPlay").textContent = "❚❚"; $("#rpBtn").textContent = "■ Live";
  }
  function stopReplay() { if (!replay.on) return; replay.on = false; $("#rp").hidden = true; $("#rpBtn").textContent = "↺ Replay 24 h"; SUN = sunDir(); buildQuakes(null); }
  function updateReplay(dt) {
    if (!replay.on) return;
    if (replay.play && !replay.scrub) { replay.f = Math.min(1, replay.f + dt / 28); if (replay.f >= 1 && (replay.hold += dt) > 2.5) return stopReplay(); }
    const T = replayTime(); SUN = sunDir(new Date(T));
    if (frame % 5 === 0) { const n = buildQuakes(T);
      $("#rpTime").textContent = new Date(T).toUTCString().slice(5, 22) + " UTC"; $("#rpN").textContent = L.quakes.on ? `${num(n)} earthquake${n === 1 ? "" : "s"} so far` : "";
      if (!replay.scrub) $("#rpRange").value = Math.round(replay.f * 1000); }
  }

  /* ---------- share: a link that opens on this exact view (place, zoom and which layers are on) ---------- */
  function shareUrl() {
    const off = LAYERS.filter((l) => !l.on && !l.off).map((l) => l.id), on = LAYERS.filter((l) => l.on && l.off).map((l) => l.id);
    return location.origin + location.pathname + `?at=${wrapLon(cam.lon).toFixed(1)},${cam.lat.toFixed(1)},${cam.dist.toFixed(2)}` + (off.length ? "&off=" + off.join(",") : "") + (on.length ? "&on=" + on.join(",") : "") + (PLANET === "mars" ? "&planet=mars" : "");
  }
  let toastT = 0;
  function toast(text) { const e = $("#toast"); e.textContent = text; e.classList.add("in"); clearTimeout(toastT); toastT = setTimeout(() => e.classList.remove("in"), 3200); }
  async function share() {
    const url = shareUrl();
    if (navigator.share) { try { await navigator.share({ title: "World Pulse", text: "A live 3D map of the networks that run the planet", url }); return; } catch (e) { if (e && e.name === "AbortError") return; } }
    try { await navigator.clipboard.writeText(url); toast("Link to this view copied"); } catch (e) { history.replaceState(null, "", url); toast("The link to this view is now in the address bar"); }
  }

  if ($("#tourBtn")) {
    $("#tourBtn").onclick = () => (tour.on ? stopTour() : startTour()); $("#capNext").onclick = nextStep; $("#capStop").onclick = stopTour;
    $("#plBtn").onclick = () => setPlanet(PLANET === "mars" ? "earth" : "mars");
    $("#meBtn").onclick = aboveMe; $("#meX").onclick = closeMe; $("#shBtn").onclick = share;
    $("#rpBtn").onclick = () => (replay.on ? stopReplay() : startReplay()); $("#rpX").onclick = stopReplay;
    $("#rpPlay").onclick = () => { if (replay.f >= 1) { replay.f = 0; replay.hold = 0; replay.play = true; } else replay.play = !replay.play; $("#rpPlay").textContent = replay.play ? "❚❚" : "▶"; };
    const rg = $("#rpRange"); rg.oninput = () => { replay.f = rg.value / 1000; replay.hold = 0; };
    rg.addEventListener("pointerdown", () => { replay.scrub = true; }); for (const ev of ["pointerup", "pointercancel", "change"]) rg.addEventListener(ev, () => { replay.scrub = false; });
  }

  /* ---------- the sun ---------- */
  function sunDir(d = new Date()) {
    const start = Date.UTC(d.getUTCFullYear(), 0, 0), doy = (d - start) / 86400000, h = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
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
    if (u.uPx) gl.uniform1f(u.uPx, RS * Math.max(0.85, Math.min(2.4, 3.2 / viewD)) * (H < 420 ? 0.8 : 1));
    return u;
  }
  function drawPoints(m, t, o = {}) {
    if (!m || !m.count) return; const u = use(P_POINT, t);
    gl.uniform1f(u.uLift, o.lift || 0); gl.uniform1f(u.uReveal, o.reveal ?? 1); gl.uniform1f(u.uSunMix, o.sun || 0); gl.uniform1f(u.uTwinkle, o.twinkle ?? 0.25); gl.uniform1f(u.uWave, o.wave || 0); gl.uniform3fv(u.uSun, SUN);
    gl.bindVertexArray(m.vao); gl.drawArrays(gl.POINTS, 0, m.count);
  }
  function drawLines(m, t, o = {}) {
    if (!m || !m.count) return; const u = use(P_LINE, t);
    gl.uniform1f(u.uLift, o.lift || 0); gl.uniform1f(u.uPulse, o.pulse || 0); gl.uniform1f(u.uFreq, o.freq || 60); gl.uniform1f(u.uSpeed, o.speed || 1); gl.uniform3fv(u.uHot, o.hot || [1, 1, 1]); gl.uniform3fv(u.uTint, o.tint || [1, 1, 1]); gl.uniform1f(u.uGradF, o.gradF || 1); gl.uniform1f(u.uGradMix, o.tint ? (o.gradMix ?? 0.85) : 0);
    gl.bindVertexArray(m.vao); gl.drawArrays(gl.LINES, 0, m.count);
  }
  function drawOther(m, prog, t) { if (!m || !m.count) return; use(prog, t); gl.bindVertexArray(m.vao); gl.drawArrays(gl.POINTS, 0, m.count); }

  let SUN = sunDir(), last = now(), frame = 0;
  gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.clearColor(0.02, 0.012, 0.05, 1);
  function tick() {
    requestAnimationFrame(tick);
    if (document.hidden) { last = now(); return; }
    const t = now(), raw = t - last, dt = Math.min(0.1, raw); last = t; frame++; watchPerf(raw);
    if (canvas.clientWidth !== W || canvas.clientHeight !== H) resize();
    updateTour(dt); updateReplay(dt); updateCamera(dt);
    if (world) reveal = Math.min(1, reveal + dt / 2.4);
    if (frame % 120 === 1) { if (!replay.on && PLANET === "earth") SUN = sunDir(); $("#utc").textContent = new Date().toISOString().slice(11, 19) + " UTC"; }
    else if (frame % 20 === 0) $("#utc").textContent = new Date().toISOString().slice(11, 19) + " UTC";
    const live = !replay.on;                                       // live-only layers are hidden during the replay
    { const ms = live ? Date.now() : replayTime(); updateSky(ms); updateMoon(ms); }
    const moonView = L.moon.on && PLANET === "earth" ? moonOnScreen() : null;
    if (PLANET === "mars") { MARS.now = marsNow(Date.now()); SUN = ll(MARS.now.sunLon, MARS.now.sunLat); }
    if (live) spawnVital(dt, t);
    if (evDirty) { M.events.set(evData); evDirty = false; }
    for (const s of [planes, ships, trains]) if (s.dirty && frame % 20 === 0) s.rebuild();

    gl.bindFramebuffer(gl.FRAMEBUFFER, RT.ms); gl.viewport(0, 0, RT.w, RT.h);
    gl.disable(gl.BLEND);
    pass(P_BG, { fbo: RT.ms, w: RT.w, h: RT.h }, (u) => { gl.uniform2f(u.uOff, cam.lon / 50, -cam.lat / 50); gl.uniform1f(u.uAsp, W / H); });
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    { const u = use(P_POINT, t); gl.uniform3fv(u.uCam, [0, 0, 0]); gl.uniform1f(u.uLift, 0); gl.uniform1f(u.uReveal, 1); gl.uniform1f(u.uSunMix, 0); gl.uniform1f(u.uWave, 0); gl.uniform1f(u.uTwinkle, 0.55); gl.uniform1f(u.uPx, RS); gl.uniformMatrix4fv(u.uMVP, false, SKYM); gl.bindVertexArray(M.stars.vao); gl.drawArrays(gl.POINTS, 0, M.stars.count); }
    if (L.sky.on && M.conLines) { const u = use(P_LINE, t); gl.uniformMatrix4fv(u.uMVP, false, SKYM); gl.uniform3fv(u.uCam, [0, 0, 0]); gl.uniform1f(u.uLift, 0); gl.uniform1f(u.uPulse, 0.35); gl.uniform1f(u.uFreq, 6); gl.uniform1f(u.uSpeed, 0.08); gl.uniform3fv(u.uHot, [0.9, 0.95, 1]); gl.uniform3fv(u.uTint, [0.75, 0.5, 1]); gl.uniform1f(u.uGradF, 9); gl.uniform1f(u.uGradMix, 0.5); gl.bindVertexArray(M.conLines.vao); gl.drawArrays(gl.LINES, 0, M.conLines.count); }
    if (moonView && moonView.behind) drawMoon(t);                   // the Moon beyond the Earth goes down first, so the Earth covers it
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    { const u = P_ATMO.u; gl.useProgram(P_ATMO.p); gl.uniform1f(u.uMars, PLANET === "mars" ? 1 : 0); gl.uniformMatrix4fv(u.uProj, false, PROJ); gl.uniform1f(u.uD, viewD); gl.uniform1f(u.uS, viewD / Math.sqrt(viewD * viewD - 1));
      gl.uniform3f(u.uSunV, VIEW[0] * SUN[0] + VIEW[4] * SUN[1] + VIEW[8] * SUN[2], VIEW[1] * SUN[0] + VIEW[5] * SUN[1] + VIEW[9] * SUN[2], VIEW[2] * SUN[0] + VIEW[6] * SUN[1] + VIEW[10] * SUN[2]);
      gl.bindVertexArray(quad.vao); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); }
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

    if (PLANET === "mars") drawMars(t, dt); else {
    drawLines(M.grid, t, { tint: [0.2, 0.7, 1], gradF: 4, gradMix: 0.6 });
    if (L.temp.on && live && M.temp) drawPoints(M.temp, t, { reveal, twinkle: 0.2 });      // temperature recolours the land and sea dots
    else { drawPoints(M.sea, t, { reveal, sun: 1, twinkle: 0.7, wave: 1.6 }); drawPoints(M.land, t, { reveal, sun: 1, twinkle: 0.3, wave: 1 }); }
    drawLines(M.coast, t, { lift: 0.0005, tint: [0.25, 0.9, 1], gradF: 5, gradMix: 0.7, pulse: 0.5, freq: 1.5, speed: 0.12, hot: [0.8, 1, 1] });
    if (L.pop.on) drawPoints(M.lights, t, { lift: 0.0008, sun: 2, twinkle: 0.5 });
    if (L.roads.on) { drawLines(M.roads, t, { lift: 0.001, pulse: 1, freq: 28, speed: 0.55, hot: [1, 0.95, 0.7], tint: [1, 0.3, 0.45], gradF: 30 }); drawPoints(M.roadLive, t, { lift: 0.002, twinkle: 0.6 }); }
    if (L.rail.on) drawLines(M.rails, t, { lift: 0.0012, pulse: 1, freq: 20, speed: 0.4, hot: [0.95, 1, 0.7], tint: [0.2, 0.95, 0.75], gradF: 24 });
    if (L.net.on) { drawLines(M.cables, t, { lift: 0.0016, pulse: 1.3, freq: 7, speed: 0.6, hot: [1, 1, 1], tint: [0.75, 0.3, 1], gradF: 9 }); drawPoints(M.dcs, t, { lift: 0.0022, twinkle: 0.55 }); }
    if (L.ships.on) { drawPoints(M.ports, t, { lift: 0.0018, twinkle: 0.3 }); if (live) drawOther(ships.mesh, P_MOVER, t); }
    if (L.rail.on && live) drawOther(trains.mesh, P_MOVER, t);
    if (L.routes.on) { drawLines(M.arcs, t, { tint: [1, 0.55, 0.8], gradF: 3.1416, gradMix: 1 }); drawOther(M.flow, P_FLOW, t); drawPoints(M.airports, t, { lift: 0.0025, twinkle: 0.2 }); }
    if (L.planes.on && live) drawOther(planes.mesh, P_MOVER, t);
    if (L.cur.on && live) drawLines(M.cur, t, { lift: 0, pulse: 1, freq: 3, speed: 0.2, hot: [0.85, 1, 1] });
    if (L.surf.on && live) { drawLines(M.swell, t, { pulse: 1, freq: 2, speed: 0.5, hot: [1, 1, 0.9] }); drawPoints(M.surfPts, t, { lift: 0.003, twinkle: 0.5 }); }
    if (L.tide.on && live) { drawLines(M.tideLines, t, { pulse: 1.3, freq: 1, speed: 0.6, hot: [1, 1, 1] }); drawPoints(M.tideHeads, t, { twinkle: 0.4 }); }
    if (L.wind.on && live) { drawLines(M.wind, t, { pulse: 1, freq: 1, speed: 0.4, hot: [1, 1, 1] }); drawLines(M.jet, t, { pulse: 1.1, freq: 1, speed: 0.55, hot: [1, 1, 0.9] }); }
    if (L.clouds.on && live) drawPoints(M.clouds, t, { sun: 1, twinkle: 0.35 });
    if (L.rain.on && live) drawOther(M.rain, P_RAIN, t);
    if (L.power.on) drawPoints(M.power, t, { lift: 0.002, twinkle: 0.45 });
    if (L.mil.on) drawPoints(M.mil, t, { lift: 0.0024, twinkle: 0.4 });
    if (L.quakes.on) drawPoints(M.quakes, t, { lift: 0.003, twinkle: 0.95 });
    if (L.events.on) drawPoints(M.eonet, t, { lift: 0.004, twinkle: 0.8 });
    if (L.aurora.on && live) drawPoints(M.aurora, t, { twinkle: 0.95 });
    if (L.sats.on && M.sats) { const u = use(P_SAT, t), rt = live ? Date.now() : replayTime(); if (!live) gl.uniform1f(u.uNow, t + (rt - Date.now()) / 1000); gl.uniform1f(u.uGmst, gmst(rt)); gl.bindVertexArray(M.sats.vao); gl.drawArrays(gl.POINTS, 0, M.sats.count); }
    if (L.space.on && live) drawOther(iss.mesh, P_MOVER, t);
    if (L.pop.on) { drawLines(M.popLines, t, { pulse: 0.9, freq: 1, speed: 0.45, hot: [1, 1, 1] }); drawPoints(M.popDots, t, { twinkle: 0.55 }); }
    if (L.vital.on && live) drawOther(M.events, P_EVENT, t);
    if (L.moon.on) drawPoints(M.sublunar, t, { lift: 0.004, twinkle: 0.6 });
    if (L.markets.on) { drawLines(M.stockLines, t, { pulse: 1.4, freq: 1, speed: 0.7, hot: [1, 1, 1] }); drawPoints(M.stockHeads, t, { twinkle: 0.6 }); drawPoints(M.xRings, t, { lift: 0.001, twinkle: 0.9 }); drawLines(M.spikes, t, { pulse: 1.5, freq: 1, speed: 0.9, hot: [1, 1, 1] }); drawPoints(M.heads, t, { twinkle: 0.5 }); }

    if (moonView && !moonView.behind) drawMoon(t);                  // the Moon on the camera's side of the Earth goes down last
    }

    // resolve the anti-aliased picture, bloom it at three sizes, then tone-map to the screen
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, RT.ms); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, RT.scene.fbo);
    gl.blitFramebuffer(0, 0, RT.w, RT.h, 0, 0, RT.w, RT.h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.disable(gl.BLEND);
    blur(RT.b1, RT.scene, 0.11); blur(RT.b2, RT.b1[0], 0.0); blur(RT.b3, RT.b2[0], 0.0);
    pass(P_COMP, null, (u) => { bindTex(0, RT.scene, u.uScene); bindTex(1, RT.b1[0], u.uB1); bindTex(2, RT.b2[0], u.uB2); bindTex(3, RT.b3[0], u.uB3); gl.uniform1f(u.uTime, t % 100); gl.uniform2f(u.uRes, RT.w, RT.h); });
    gl.enable(gl.BLEND);
    gl.bindVertexArray(null);
    if (frame % 2 === 0) { layoutLabels(); layoutSky(); layoutMoon(); layoutMars(); }
    trackSel(t); trackMe(); if (frame % 15 === 0) updateHead(dt * 15); if (me.on && frame % 60 === 0) renderMe();
  }

  /* ---------- data ---------- */
  const getJson = async (url) => { const r = await fetch(url, { cache: "no-cache" }); if (!r.ok) throw new Error(r.status); return r.json(); };
  getJson("../data/globe/world.json").then(buildWorld).catch(() => { reveal = 1; for (const id of ["routes", "ships", "rail", "roads", "net", "pop", "vital", "power", "mil"]) L[id].status("off", "first data sync in progress, check back in a few minutes"); });
  const loadMarkets = () => getJson("../data/globe/markets.json").then(buildMarkets).catch(() => { if (!MK) L.markets.status("off", "first data sync in progress"); });
  loadMarkets(); setInterval(loadMarkets, 5 * 60000); loadStocks(); setInterval(loadStocks, 5 * 60000); loadWeather(); setInterval(loadWeather, 30 * 60000); setTimeout(loadOcean, 600); setInterval(loadOcean, 20 * 60000);
  getJson("../data/globe/sky.json").then(buildSky).catch(() => L.sky.status("off", "star catalogue could not be loaded"));
  getJson("../data/globe/moon.json").then(buildMoon).catch(() => {});
  if (QS.get("planet") === "mars" && !EMBED) setPlanet("mars");
  if (EMBED) setTimeout(startTour, 9000);                           // the embedded preview tours by itself, on a loop
  else if (QS.has("tour")) setTimeout(startTour, 7000);              // world-pulse.html?tour starts the tour by itself
  if (/[?&]board/.test(location.search)) { $("#board").hidden = false; $("#panel").open = false; }
  L.planes.status("off", "connecting to live feed"); L.rain.status("off", "loading the latest satellite image");
  setTimeout(pollPlanes, 1200); setTimeout(pollShips, 2500); setTimeout(pollTrains, 3500); setTimeout(pollRoads, 4500); setTimeout(pollRain, 800); setTimeout(pollQuakes, 1500); setTimeout(pollEvents, 2000); setTimeout(pollAurora, 3000); setTimeout(pollIss, 1000); setTimeout(pollClouds, 1800); loadSats();
  tick();
})();
