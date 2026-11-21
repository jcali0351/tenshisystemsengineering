// tenshi-gl.js: the GPU renderer for Station Defense (three.js r160, served from sandbox/vendor/three).
//
// The game keeps its rules, interface, effects and fog on its 2D canvas. When this module loads, the game hands every
// 3D model (ships, buildings, aliens, asteroids, crystals) to this renderer instead of drawing faces by hand:
//   - physically based materials: painted hulls with a clear coat, bare metal, glossy glass, wet alien chitin, rock
//   - smooth shading on curved parts with crisp edges on hard corners (crease angle), procedural panel bump maps
//   - an environment map (the nebula) for reflections, filmic tone mapping, bloom on everything that glows
//   - real shadow maps from the drifting star: ships shadow the "floor" of space and each other
//   - up to 12 moving point lights from lasers, shells, explosions, engines, crystals, the station and the hive
// If WebGL isn't available the game simply keeps its own 2D renderer.
import * as THREE from "./vendor/three/three.module.min.js";
import { EffectComposer } from "./vendor/three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "./vendor/three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "./vendor/three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "./vendor/three/addons/postprocessing/OutputPass.js";

// The camera looks down at the same tilt as the 2D game: screen-down = 0.62 * south - 0.78 * up.
const TC = 0.62, TS = Math.sqrt(1 - TC * TC), LIFT = 0.8;
const CREASE = Math.cos(38 * Math.PI / 180);   // faces meeting at less than this angle are shaded smoothly
const MAX_LIGHTS = 12;

// ---- Procedural textures (grey height maps for bump, and a grime map for roughness) ----
function makeCanvas(n) { const c = document.createElement("canvas"); c.width = c.height = n; return c; }
function panelHeight() {
  const N = 256, c = makeCanvas(N), g = c.getContext("2d");
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  g.fillStyle = "rgb(150,150,150)"; g.fillRect(0, 0, N, N);
  for (let i = 0; i < 900; i++) { const x = rnd() * N, y = rnd() * N, l = 10 + rnd() * 90, v = 150 + (rnd() - 0.5) * 30; g.fillStyle = `rgba(${v | 0},${v | 0},${v | 0},0.5)`; g.fillRect(x, y, l, 1); g.fillRect(x - N, y, l, 1); }   // brushed
  const rows = [0, 70, 150, 205], cols = [[0, 128], [52, 180], [20, 150], [90, 220]];
  for (let r = 0; r < rows.length; r++) {
    const y0 = rows[r], y1 = rows[r + 1] ?? N;
    g.fillStyle = "rgb(40,40,40)"; g.fillRect(0, y0, N, 2.5);                                   // seams (grooves)
    for (const x of cols[r]) g.fillRect(x, y0, 2.5, y1 - y0);
    g.fillStyle = "rgb(205,205,205)";
    for (let x = 6; x < N; x += 12) { g.beginPath(); g.arc(x, y0 + 7, 1.6, 0, 6.28); g.fill(); }   // rivets (bumps)
    if (r % 2 === 0) { g.fillStyle = "rgb(178,178,178)"; g.fillRect(cols[r][0] + 14, y0 + 16, 46, 22); }   // raised plate
    if (r === 1) { g.fillStyle = "rgb(110,110,110)"; for (let k = 0; k < 5; k++) g.fillRect(150 + k * 9, y0 + 20, 4, 30); }   // vents
  }
  return c;
}
function grimeMap() {
  const N = 256, c = makeCanvas(N), g = c.getContext("2d");
  let seed = 5; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  g.fillStyle = "rgb(150,150,150)"; g.fillRect(0, 0, N, N);                                     // roughness ~0.6 of the material's own
  for (let i = 0; i < 60; i++) { const x = rnd() * N, y = rnd() * N, r = 8 + rnd() * 40; const gr = g.createRadialGradient(x, y, 0, x, y, r); const v = rnd() < 0.5 ? 220 : 90; gr.addColorStop(0, `rgba(${v},${v},${v},0.5)`); gr.addColorStop(1, `rgba(${v},${v},${v},0)`); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
  for (let i = 0; i < 40; i++) { const x = rnd() * N, y = rnd() * N; g.strokeStyle = "rgba(70,70,70,0.6)"; g.lineWidth = 0.8; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 50, y + (rnd() - 0.5) * 14); g.stroke(); }   // polished scratches
  return c;
}
function rockHeight() {
  const N = 256, c = makeCanvas(N), g = c.getContext("2d");
  let seed = 23; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  g.fillStyle = "rgb(128,128,128)"; g.fillRect(0, 0, N, N);
  for (let i = 0; i < 500; i++) { const x = rnd() * N, y = rnd() * N, r = 2 + rnd() * 16, v = 70 + rnd() * 120; g.fillStyle = `rgba(${v | 0},${v | 0},${v | 0},0.35)`; g.beginPath(); g.arc(x, y, r, 0, 6.28); g.fill(); }
  for (let i = 0; i < 50; i++) { const x = rnd() * N, y = rnd() * N, r = 3 + rnd() * 10; g.fillStyle = "rgba(40,40,40,0.6)"; g.beginPath(); g.arc(x, y, r, 0, 6.28); g.fill(); g.strokeStyle = "rgba(220,220,220,0.5)"; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, r + 1, 0, 6.28); g.stroke(); }   // craters
  return c;
}
function texture(canvas, srgb) {
  const t = new THREE.CanvasTexture(canvas); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// The surroundings for reflections: a bright lavender sky, a warm star, purple nebula at the horizon, dark pink below.
function environmentCanvas() {
  const W = 1024, H = 512, c = document.createElement("canvas"); c.width = W; c.height = H; const g = c.getContext("2d");
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#f4f0ff"); sky.addColorStop(0.22, "#b9b0d6"); sky.addColorStop(0.42, "#5a3f93"); sky.addColorStop(0.5, "#33205f"); sky.addColorStop(0.62, "#24103f"); sky.addColorStop(1, "#14061c");
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  const blob = (x, y, r, col) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, col); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); };
  blob(260, 120, 150, "rgba(255,240,220,0.95)"); blob(260, 120, 40, "rgba(255,255,255,1)");   // the star
  blob(700, 300, 260, "rgba(255,60,190,0.35)"); blob(900, 200, 200, "rgba(255,140,60,0.18)"); blob(120, 330, 220, "rgba(120,80,255,0.35)");
  blob(560, 470, 300, "rgba(255,70,180,0.25)");                                                 // planet glow below
  for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.8})`; g.fillRect(Math.random() * W, Math.random() * H * 0.6, 1.2, 1.2); }
  return c;
}

// ---- Materials ----
function srgbColor(rgb, k = 1) { return new THREE.Color().setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, THREE.SRGBColorSpace).multiplyScalar(k); }

function create(canvas) {
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" }); }
  catch (e) { console.warn("[tenshi-gl] WebGL unavailable, keeping the 2D renderer", e); return null; }
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(0, 100, 0, -100, 1, 400000);
  camera.position.set(0, 0, 200000); camera.lookAt(0, 0, 0);

  // Reflections.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = texture(environmentCanvas(), true); envTex.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = pmrem.fromEquirectangular(envTex).texture;
  envTex.dispose();

  // Lights: purple sky / pink ground fill, the star (with shadows), and a pool of point lights.
  const hemi = new THREE.HemisphereLight(0xc8bcff, 0x40122e, 0.35); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2e4, 4.2);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.6;
  scene.add(sun); scene.add(sun.target);
  const points = [];
  for (let i = 0; i < MAX_LIGHTS; i++) { const L = new THREE.PointLight(0xffffff, 0, 100, 2); scene.add(L); points.push(L); }

  // The "floor" of space that catches shadows (invisible except for the shadows).
  const floorGeo = new THREE.BufferGeometry(); floorGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(12), 3)); floorGeo.setIndex([0, 1, 2, 0, 2, 3]);
  const floor = new THREE.Mesh(floorGeo, new THREE.ShadowMaterial({ color: 0x07000f, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }));
  floor.receiveShadow = true; floor.frustumCulled = false; floor.renderOrder = -1; scene.add(floor);

  // Background: the game's own space painting (stars, nebula, planet, plus things drawn under the models).
  let bgTex = null;

  // Post: render, bloom on bright parts, then tone mapping and colour output.
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.45, 1.05);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const TEX = { panel: texture(panelHeight()), grime: texture(grimeMap()), rock: texture(rockHeight()) };
  const materials = new Map();
  let paintIds = new WeakMap(), nextPaint = 1;
  const paintId = p => { let id = paintIds.get(p); if (!id) { id = nextPaint++; paintIds.set(p, id); } return id; };
  function material(rgb, mat, paint) {
    const key = paintId(paint) + "|" + mat + "|" + rgb.join(",");
    let m = materials.get(key);
    if (m) return m;
    const color = srgbColor(rgb);
    const panel = { bumpMap: TEX.panel, bumpScale: 1.6, roughnessMap: TEX.grime };
    if (mat === "glow" || mat === "flame") m = new THREE.MeshBasicMaterial({ color: srgbColor(rgb, mat === "flame" ? 2.6 : 2.8) });
    else if (paint.crystal) m = new THREE.MeshPhysicalMaterial({ color, emissive: srgbColor(rgb, 0.55), metalness: 0, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.6 });
    else if (paint.stone) m = new THREE.MeshStandardMaterial({ color, metalness: 0.05, roughness: 0.92, bumpMap: TEX.rock, bumpScale: 3 });
    else if (paint.organic) m = new THREE.MeshPhysicalMaterial({ color, metalness: 0, roughness: 0.42, clearcoat: 0.9, clearcoatRoughness: 0.18, sheen: 0.6, sheenColor: srgbColor(rgb, 0.8), envMapIntensity: 0.8 });
    else if (mat === "glass") m = new THREE.MeshPhysicalMaterial({ color, metalness: 0.15, roughness: 0.03, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.8 });
    else if (mat === "dark") m = new THREE.MeshPhysicalMaterial({ color, metalness: 0.9, roughness: 0.42, envMapIntensity: 0.85, ...panel });
    else if (mat === "pod") m = new THREE.MeshPhysicalMaterial({ color, metalness: 0.88, roughness: 0.26, clearcoat: 0.3, envMapIntensity: 0.9, ...panel });
    else if (mat === "trim" || mat === "nose") m = new THREE.MeshPhysicalMaterial({ color, metalness: 0.3, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 0.7, bumpMap: TEX.panel, bumpScale: 0.6 });
    else m = new THREE.MeshPhysicalMaterial({ color, metalness: 0.5, roughness: 0.34, clearcoat: 0.8, clearcoatRoughness: 0.1, envMapIntensity: 0.7, ...panel });   // painted hull
    m.shadowSide = THREE.DoubleSide;                              // models are mirrored into this camera's space, so cast from both sides
    materials.set(key, m);
    return m;
  }
  // Variants for hit flashes (glowing white) and see-through ghosts / buildings under construction.
  const variants = new Map();
  function variant(base, flash, alpha) {
    if (!flash && alpha === 10) return base;
    const key = base.uuid + "|" + flash + "|" + alpha;
    let v = variants.get(key);
    if (v) return v;
    v = base.clone();
    if (flash && v.emissive) { v.emissive = new THREE.Color(1, 1, 1); v.emissiveIntensity = flash * 0.6; }
    else if (flash && v.color) v.color = v.color.clone().lerp(new THREE.Color(4, 4, 4), flash / 5);
    if (alpha < 10) { v.transparent = true; v.opacity = alpha / 10; v.depthWrite = false; }
    variants.set(key, v);
    return v;
  }

  // ---- Turning a game model ({ v: corners, f: faces }) into GPU meshes: one per material ----
  const models = new WeakMap();
  function build(model, paint) {
    let byPaint = models.get(model);
    if (!byPaint) { byPaint = new Map(); models.set(model, byPaint); }
    const pid = paintId(paint);
    let entry = byPaint.get(pid);
    if (entry) return entry;
    const V = model.v, tris = [];
    for (const f of model.f) {
      const idx = f.i; if (!idx || idx.length < 3) continue;
      let nx = 0, ny = 0, nz = 0;
      for (let k = 0; k < idx.length; k++) { const p = V[idx[k]], q = V[idx[(k + 1) % idx.length]]; nx += (p[1] - q[1]) * (p[2] + q[2]); ny += (p[2] - q[2]) * (p[0] + q[0]); nz += (p[0] - q[0]) * (p[1] + q[1]); }
      const len = Math.hypot(nx, ny, nz); if (len < 1e-10) continue;
      let n = [nx / len, ny / len, nz / len], order = idx;
      if (!f.wind && f.c) {                                       // point it away from the part's centre (outwards)
        const mid = [0, 1, 2].map(k => idx.reduce((t, i) => t + V[i][k], 0) / idx.length);
        if ((mid[0] - f.c[0]) * n[0] + (mid[1] - f.c[1]) * n[1] + (mid[2] - f.c[2]) * n[2] < 0) { order = idx.slice().reverse(); n = n.map(v => -v); }
      }
      const mat = f.glow ? "glow" : (f.mat || "hull"), rgb = f.rgb || paint[mat] || paint.hull;
      for (let k = 1; k + 1 < order.length; k++) {
        const a = V[order[0]], b = V[order[k]], c = V[order[k + 1]];
        const area = Math.hypot((b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
        if (area < 1e-9) continue;
        tris.push({ p: [a, b, c], n, area, mat, rgb });
      }
    }
    // Smooth normals across gentle angles, sharp across hard edges.
    const corners = new Map(), keyOf = p => Math.round(p[0] * 1e4) + "," + Math.round(p[1] * 1e4) + "," + Math.round(p[2] * 1e4);
    for (const t of tris) for (const p of t.p) { const k = keyOf(p); let l = corners.get(k); if (!l) corners.set(k, l = []); l.push(t); }
    const groups = new Map();
    for (const t of tris) {
      const gk = t.mat + "|" + t.rgb.join(",");
      let g = groups.get(gk); if (!g) groups.set(gk, g = { mat: t.mat, rgb: t.rgb, pos: [], nor: [], uv: [] });
      const ax = Math.abs(t.n[0]), ay = Math.abs(t.n[1]), az = Math.abs(t.n[2]);
      for (const p of t.p) {
        let sx = 0, sy = 0, sz = 0;
        for (const o of corners.get(keyOf(p))) if (o.n[0] * t.n[0] + o.n[1] * t.n[1] + o.n[2] * t.n[2] > CREASE) { sx += o.n[0] * o.area; sy += o.n[1] * o.area; sz += o.n[2] * o.area; }
        const l = Math.hypot(sx, sy, sz) || 1;
        g.pos.push(p[0], p[1], p[2]); g.nor.push(sx / l, sy / l, sz / l);
        const S = 0.9;                                            // box-projected texture coordinates (about one panel set per radius)
        if (ax >= ay && ax >= az) g.uv.push(p[1] * S, p[2] * S); else if (ay >= az) g.uv.push(p[0] * S, p[2] * S); else g.uv.push(p[0] * S, p[1] * S);
      }
    }
    const parts = [];
    for (const g of groups.values()) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(g.pos, 3));
      geo.setAttribute("normal", new THREE.Float32BufferAttribute(g.nor, 3));
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(g.uv, 2));
      geo.computeBoundingSphere();
      parts.push({ geo, mat: material(g.rgb, g.mat, paint), glow: g.mat === "glow" || g.mat === "flame" });
    }
    entry = { parts, pool: [], used: 0 };
    byPaint.set(pid, entry);
    entries.push(entry);
    return entry;
  }
  const entries = [];

  // ---- One frame ----
  let F = null;
  const M = new THREE.Matrix4();
  function toScene(x, y, z) { return [(x - F.camx) * F.zoom, -((y - F.camy) * F.zoom - z * F.zoom * LIFT), (TS * y + TC * z) * F.zoom]; }
  const api = {
    renderer, scene,
    resize(W, H) {
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      renderer.setPixelRatio(ratio); renderer.setSize(W, H, false);
      composer.setPixelRatio(ratio); composer.setSize(W, H);
      camera.left = 0; camera.right = W; camera.top = 0; camera.bottom = -H; camera.updateProjectionMatrix();
    },
    begin(frame) {
      F = frame;
      for (const e of entries) e.used = 0;
      // The star: same direction as the 2D lighting, turned into this camera's space.
      // (raised a little so shadows stay a sensible length on the tilted floor)
      const k0 = frame.key, kl = Math.hypot(k0[0], k0[1], k0[2] * 2.2), k = [k0[0] / kl, k0[1] / kl, k0[2] * 2.2 / kl];
      const d = [k[0], -TC * k[1] + TS * k[2], TS * k[1] + TC * k[2]];
      const cx = frame.W / 2, cy = -frame.H / 2, cz = TS * (frame.camy + frame.H / frame.zoom / 2) * frame.zoom;
      const R = Math.hypot(frame.W, frame.H) * 0.62;
      sun.target.position.set(cx, cy, cz); sun.position.set(cx + d[0] * 30000, cy + d[1] * 30000, cz + d[2] * 30000);
      const sc = sun.shadow.camera; sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.near = 20000; sc.far = 40000; sc.updateProjectionMatrix();
      // The floor of space under the visible area.
      const m = 300 / frame.zoom, x0 = frame.camx - m, x1 = frame.camx + frame.W / frame.zoom + m, y0 = frame.camy - m, y1 = frame.camy + frame.H / frame.zoom + m;
      const pos = floorGeo.attributes.position.array, q = [toScene(x0, y0, 0), toScene(x1, y0, 0), toScene(x1, y1, 0), toScene(x0, y1, 0)];
      for (let i = 0; i < 4; i++) pos.set(q[i], i * 3);
      floorGeo.attributes.position.needsUpdate = true; floorGeo.computeVertexNormals(); floorGeo.computeBoundingSphere();   // (the shadow lookup needs normals)
      // Point lights: the strongest ones on screen.
      const ls = frame.lights || [];
      for (let i = 0; i < MAX_LIGHTS; i++) {
        const P = points[i], L = ls[i];
        if (!L) { P.intensity = 0; continue; }                   // (lights stay "on" so the shaders never need rebuilding)
        const [px, py, pz] = toScene(L.x, L.y, L.z), r = L.range * frame.zoom * 1.3;
        P.position.set(px, py, pz); P.color.setRGB(L.rgb[0] / 255, L.rgb[1] / 255, L.rgb[2] / 255, THREE.SRGBColorSpace);
        P.distance = r; P.decay = 2; P.intensity = L.power * 0.55 * Math.min(0.3 * r, 160) ** 2;
      }
      if (frame.bg && (!bgTex || bgTex.image !== frame.bg)) { bgTex = new THREE.CanvasTexture(frame.bg); bgTex.colorSpace = THREE.SRGBColorSpace; scene.background = bgTex; }
    },
    draw(model, paint, x, y, z, yaw, roll, size, flash = 0, alpha = 1) {
      const entry = build(model, paint);
      let inst = entry.pool[entry.used];
      if (!inst) {
        inst = new THREE.Group(); inst.matrixAutoUpdate = false;
        for (const part of entry.parts) { const mesh = new THREE.Mesh(part.geo, part.mat); mesh.castShadow = !part.glow; mesh.receiveShadow = !part.glow; inst.add(mesh); }
        scene.add(inst); entry.pool.push(inst);
      }
      entry.used++;
      inst.visible = true;
      const fb = flash > 0.05 ? Math.min(5, Math.ceil(flash * 5)) : 0, ab = alpha < 0.98 ? Math.max(1, Math.round(alpha * 10)) : 10;
      if (inst.userData.mode !== fb * 100 + ab) {
        inst.userData.mode = fb * 100 + ab;
        inst.children.forEach((mesh, k) => { mesh.material = variant(entry.parts[k].mat, fb, ab); mesh.castShadow = ab === 10 && !entry.parts[k].glow; });
      }
      // Model space (x forward, y right, z up) -> turn (yaw, roll) -> tilt for the camera -> scale -> place.
      const s = size * F.zoom, cyw = Math.cos(yaw), syw = Math.sin(yaw), cr = Math.cos(roll), sr = Math.sin(roll);
      const r0 = [cyw, -syw * cr, syw * sr], r1 = [syw, cyw * cr, -cyw * sr], r2 = [0, sr, cr];
      const g1 = [0, 1, 2].map(i => -TC * r1[i] + TS * r2[i]), g2 = [0, 1, 2].map(i => TS * r1[i] + TC * r2[i]);
      const t = toScene(x, y, z);
      M.set(r0[0] * s, r0[1] * s, r0[2] * s, t[0], g1[0] * s, g1[1] * s, g1[2] * s, t[1], g2[0] * s, g2[1] * s, g2[2] * s, t[2], 0, 0, 0, 1);
      inst.matrix.copy(M); inst.matrixWorldNeedsUpdate = true;
    },
    end() {
      for (const e of entries) for (let i = e.used; i < e.pool.length; i++) e.pool[i].visible = false;
      if (bgTex) bgTex.needsUpdate = true;
      composer.render();
    },
    debug: { sun, floor, camera, points },
    info: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, models: entries.length, materials: materials.size }),
  };
  window.TenshiGL.last = api;   // for testing in the console
  return api;
}

window.TenshiGL = { create, version: THREE.REVISION };
window.dispatchEvent(new Event("tenshi-gl-ready"));
