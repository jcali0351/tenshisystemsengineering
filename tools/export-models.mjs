// tools/export-models.mjs: exports every built-in 3D game model as a .glb file Blender can open and edit.
//
//   node tools/export-models.mjs
//
// Writes models/source/<slot>.glb (one per character, named after its models.json slot) and models/source/ALL-MODELS.glb
// (all of them side by side in one scene). The models are rebuilt from the game code itself, so they're exactly what
// the games draw. Each one is already turned the way the games expect (front facing Blender's -Y after import), split
// into parts where the game builds it from parts, and coloured with named materials (glowing parts are emissive).
// Edit, export as glTF Binary (.glb), put it in models/, name it in models.json: done.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import vm from "node:vm";

const read = f => readFileSync(f, "utf8").replace(/\r\n/g, "\n");
const between = (src, a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i + 1); if (i < 0 || j < 0) throw new Error("marker not found: " + a + " / " + b); return src.slice(i, j); };
const run = (code, names) => vm.runInNewContext(`(function(){ ${code}\n return { ${names.join(", ")} }; })()`, { Math, Array, Object, Set, Map, JSON, Number });

// ------------------------------------------------------------------ Station Defense
const rtsSrc = read("sandbox/neon-rts.js");
const RTS = run(between(rtsSrc, "  function Mesh() {", "  // ---- Lighting: a white-gold star") , ["MODELS", "ROCKS", "PAINT"]);
// ------------------------------------------------------------------ Hero arcade
const gameSrc = read("sandbox/neon-game.js");
const ARC = run(between(gameSrc, "  function lathe(profile, n) {", "  // ---- The lighting engine ----"), ["MODELS"]);
const GIANT = run(between(gameSrc, "  const kMesh = () =>", "  const GLOWY =") + between(gameSrc, "  function poseMonster(mo, now) {", "  function drawMonster(mo, now) {"),
  ["KAIJU", "ROBOT", "KPAINT", "poseMonster", "mApp", "rY"]);

// ------------------------------------------------------------------ geometry helpers
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));

/** Build one object: faces (with corner positions already in glTF axes) grouped by material. */
function objectFrom(name, polys) {
  // polys: [{ pts: [[x,y,z], ...] (glTF axes), centre: [x,y,z] (part centre, for outward faces), mat: { name, rgb, glow } }]
  const byMat = new Map();
  for (const p of polys) {
    if (!byMat.has(p.mat.name)) byMat.set(p.mat.name, { mat: p.mat, pos: [], idx: [] });
    const g = byMat.get(p.mat.name);
    for (let k = 1; k + 1 < p.pts.length; k++) {                 // fan-split quads into triangles
      let tri = [p.pts[0], p.pts[k], p.pts[k + 1]];
      const n = cross(sub(tri[1], tri[0]), sub(tri[2], tri[0]));
      const mid = [0, 1, 2].map(j => (tri[0][j] + tri[1][j] + tri[2][j]) / 3);
      if (dot(n, sub(mid, p.centre)) < 0) tri = [tri[0], tri[2], tri[1]];   // counter-clockwise = facing out (glTF rule)
      if (Math.hypot(...n) < 1e-12) continue;
      const base = g.pos.length;
      g.pos.push(...tri); g.idx.push(base, base + 1, base + 2);    // flat shading: each face its own corners
    }
  }
  return { name, groups: [...byMat.values()] };
}

// ------------------------------------------------------------------ the .glb writer
function glb(objects, layoutInRow = false) {
  const json = { asset: { version: "2.0", generator: "Tenshi export-models.mjs" }, scene: 0, scenes: [{ nodes: [] }], nodes: [], meshes: [], materials: [], accessors: [], bufferViews: [], buffers: [] };
  const mats = new Map(), chunks = []; let offset = 0;
  const view = (buf, target) => { while (offset % 4) { chunks.push(Buffer.alloc(1)); offset++; } json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: buf.length, target }); chunks.push(buf); offset += buf.length; return json.bufferViews.length - 1; };
  const matIndex = m => {
    if (!mats.has(m.name)) {
      const c = m.rgb.map(lin);
      json.materials.push({ name: m.name, pbrMetallicRoughness: { baseColorFactor: [...c, 1], metallicFactor: 0.1, roughnessFactor: 0.6 }, ...(m.glow ? { emissiveFactor: c } : {}) });
      mats.set(m.name, json.materials.length - 1);
    }
    return mats.get(m.name);
  };
  let x = 0;
  for (const obj of objects) {
    const prims = [];
    for (const g of obj.groups) {
      const pos = Buffer.alloc(g.pos.length * 12); g.pos.forEach((p, k) => { pos.writeFloatLE(p[0], k * 12); pos.writeFloatLE(p[1], k * 12 + 4); pos.writeFloatLE(p[2], k * 12 + 8); });
      const idx = Buffer.alloc(g.idx.length * 4); g.idx.forEach((v, k) => idx.writeUInt32LE(v, k * 4));
      const mn = [0, 1, 2].map(j => Math.min(...g.pos.map(p => p[j]))), mx = [0, 1, 2].map(j => Math.max(...g.pos.map(p => p[j])));
      json.accessors.push({ bufferView: view(pos, 34962), componentType: 5126, count: g.pos.length, type: "VEC3", min: mn, max: mx });
      json.accessors.push({ bufferView: view(idx, 34963), componentType: 5125, count: g.idx.length, type: "SCALAR" });
      prims.push({ attributes: { POSITION: json.accessors.length - 2 }, indices: json.accessors.length - 1, material: matIndex(g.mat) });
    }
    json.meshes.push({ name: obj.name, primitives: prims });
    const width = obj.width || 3;
    json.nodes.push({ name: obj.name, mesh: json.meshes.length - 1, ...(layoutInRow ? { translation: [x + width / 2, 0, 0] } : {}) });
    json.scenes[0].nodes.push(json.nodes.length - 1);
    x += width + 1;
  }
  while (offset % 4) { chunks.push(Buffer.alloc(1)); offset++; }
  const bin = Buffer.concat(chunks);
  json.buffers.push({ byteLength: bin.length });
  let js = Buffer.from(JSON.stringify(json)); while (js.length % 4) js = Buffer.concat([js, Buffer.from(" ")]);
  const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
  const c1 = Buffer.alloc(8); c1.writeUInt32LE(js.length, 0); c1.writeUInt32LE(0x4e4f534a, 4);
  const c2 = Buffer.alloc(8); c2.writeUInt32LE(bin.length, 0); c2.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([head, c1, js, c2, bin]);
}

// ------------------------------------------------------------------ turning game models into glTF objects
// Station Defense model space: x forward, y right, z up  ->  glTF: x left, y up, z forward.
const fromRts = ([x, y, z]) => [-y, z, x];
function rtsObject(slot, models, paint) {
  const polys = [];
  for (const { m, offset = [0, 0, 0], scale = 1 } of models) for (const f of m.f) {
    const pts = f.i.map(k => fromRts(m.v[k].map((c, j) => c * scale + offset[j])));
    polys.push({ pts, centre: fromRts((f.c || [0, 0, 0]).map((c, j) => c * scale + offset[j])), mat: { name: slot.split(".")[1] + "_" + f.mat, rgb: (paint[f.mat] || paint.hull), glow: f.mat === "glow" } });
  }
  return objectFrom(slot, polys);
}
// Arcade targets: model axes (forward x, y down, z side) -> glTF.
const fromTarget = ([x, y, z]) => [z, -y, x];
function targetObject(slot, m, colour) {
  return objectFrom(slot, m.f.map(idx => ({ pts: idx.map(k => fromTarget(m.v[k])), centre: [0, 0, 0], mat: { name: slot.split(".")[1], rgb: hex(colour), glow: false } })));
}
// The giants: posed at rest, turned to face front (the game shows them three-quarter on).
function giantObject(slot, type) {
  const parts = GIANT.poseMonster({ type, t: 0, state: "idle", walk: 0, dir: 1, fall: 0, attackAt: 0 }, 0);
  const unturn = GIANT.rY(0.55);                                     // undo the game's three-quarter view
  const fromGiant = p => { const q = GIANT.mApp(unturn, p); return [q[2], q[1], q[0]]; };   // monster x forward, y up, z side -> glTF
  const objects = [];
  const names = type === "kaiju" ? ["body", "head", "jaw", "leg_thigh_R", "leg_shin_R", "arm_upper_R", "arm_fore_R", "leg_thigh_L", "leg_shin_L", "arm_upper_L", "arm_fore_L"] : ["pelvis", "torso", "head", "jaw", "arm_upper_R", "arm_lower_R", "leg_thigh_R", "leg_shin_R", "arm_upper_L", "arm_lower_L", "leg_thigh_L", "leg_shin_L"];
  const polys = [];
  parts.forEach((p, k) => {
    const world = p.mesh.v.map(v => GIANT.mApp(p.R, v).map((c, j) => c + p.at[j]));
    const centreOf = c => fromGiant(GIANT.mApp(p.R, c).map((v, j) => v + p.at[j]));
    for (const f of p.mesh.f) polys.push({ part: names[k] || (k < names.length ? names[k] : "tail_" + (k - names.length + 1)), pts: f.i.map(i => fromGiant(world[i])), centre: centreOf(f.c), mat: { name: type + "_" + f.mat, rgb: GIANT.KPAINT[type][f.mat] || [180, 170, 200], glow: f.mat === "glow" || f.mat === "spine" } });
  });
  return polys;
}

// ------------------------------------------------------------------ export
mkdirSync("models/source", { recursive: true });
const out = [];
const P = RTS.PAINT;
const rts = {
  "rts.station": rtsObject("rts.station", [{ m: RTS.MODELS.core }, { m: RTS.MODELS.ring }], P.p),
  "rts.miner": rtsObject("rts.miner", [{ m: RTS.MODELS.spark }], P.spark),
  "rts.interceptor": rtsObject("rts.interceptor", [{ m: RTS.MODELS.blade }], P.blade),
  "rts.gunship": rtsObject("rts.gunship", [{ m: RTS.MODELS.lancer }, { m: RTS.MODELS.turret, offset: [0, 0, 0.35] }], P.lancer),
  "rts.swarmling": rtsObject("rts.swarmling", [{ m: RTS.MODELS.mite }], P.e),
  "rts.behemoth": rtsObject("rts.behemoth", [{ m: RTS.MODELS.brute }], P.e),
  "rts.spitter": rtsObject("rts.spitter", [{ m: RTS.MODELS.spitter }], P.e),
  "rts.hive": rtsObject("rts.hive", [{ m: RTS.MODELS.hive }], P.e),
  "rts.asteroid": rtsObject("rts.asteroid", [{ m: RTS.ROCKS[0] }], P.rock),
  "rts.crystal": rtsObject("rts.crystal", [{ m: RTS.MODELS.crystal }], P.crystal),
  "rts.turret": rtsObject("rts.turret", [{ m: RTS.MODELS.tower }, { m: RTS.MODELS.turret, offset: [0, 0, 1.0], scale: 0.8 }], P.p),
  "rts.depot": rtsObject("rts.depot", [{ m: RTS.MODELS.depot }], P.p),
  "rts.outpost": rtsObject("rts.outpost", [{ m: RTS.MODELS.outpost }], P.p),
  "rts.shipyard": rtsObject("rts.shipyard", [{ m: RTS.MODELS.yard }], P.p),
};
const arcade = {
  "arcade.drone": targetObject("arcade.drone", ARC.MODELS.drone, "#ff2bd6"),
  "arcade.saucer": targetObject("arcade.saucer", ARC.MODELS.saucer, "#b04dff"),
  "arcade.cube": targetObject("arcade.cube", ARC.MODELS.cube, "#ff8a2b"),
  "arcade.star": targetObject("arcade.star", ARC.MODELS.star, "#ffb347"),
};
// Giants: one file each, with every body part as its own object so you can pose or rebuild them piece by piece.
const giants = {};
for (const [slot, type] of [["arcade.kaiju", "kaiju"], ["arcade.robot", "robot"]]) {
  const polys = giantObject(slot, type), byPart = new Map();
  for (const p of polys) { if (!byPart.has(p.part)) byPart.set(p.part, []); byPart.get(p.part).push(p); }
  giants[slot] = [...byPart.entries()].map(([part, ps]) => objectFrom(type + "_" + part, ps));
}
// ------------------------------------------------------------------ Undercity: new 3D characters
// The dungeon crawler draws its characters as flat figures, so these are new low-poly models (glTF axes: x left,
// y up, z forward; feet on the ground). Put one in models.json (e.g. "arpg.hero": "source/arpg.hero.glb") to use it.
const M = (name, rgb, glow = false) => ({ name, rgb: typeof rgb === "string" ? hex(rgb) : rgb, glow });
function box(c, s, mat, rot = 0) {
  const [hx, hy, hz] = s.map(v => v / 2), cs = Math.cos(rot), sn = Math.sin(rot);
  const P = [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz], [-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]]
    .map(([x, y, z]) => [c[0] + x * cs - y * sn, c[1] + x * sn + y * cs, c[2] + z]);      // optional tilt (round z)
  return [[0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [3, 2, 6, 7], [4, 5, 1, 0]].map(q => ({ pts: q.map(i => P[i]), centre: c, mat }));
}
function ellipsoid(c, r, mat, seg = 10, rings = 7) {
  const P = [];
  for (let i = 0; i <= rings; i++) { const a = Math.PI * i / rings; for (let j = 0; j < seg; j++) { const b = 2 * Math.PI * j / seg; P.push([c[0] + Math.sin(a) * Math.cos(b) * r[0], c[1] + Math.cos(a) * r[1], c[2] + Math.sin(a) * Math.sin(b) * r[2]]); } }
  const polys = [];
  for (let i = 0; i < rings; i++) for (let j = 0; j < seg; j++) {
    const a = i * seg + j, b = i * seg + (j + 1) % seg;
    polys.push({ pts: i === 0 ? [P[a], P[b + seg], P[a + seg]] : i === rings - 1 ? [P[a], P[b], P[a + seg]] : [P[a], P[b], P[b + seg], P[a + seg]], centre: c, mat });
  }
  return polys;
}
function cone(base, tip, r, mat, seg = 6) {
  const d = sub(tip, base), len = Math.hypot(...d), u = d.map(v => v / len);
  const t1 = Math.abs(u[1]) < 0.9 ? [u[2], 0, -u[0]] : [0, -u[2], u[1]], l1 = Math.hypot(...t1), a1 = t1.map(v => v / l1), a2 = cross(u, a1);
  const ring = []; for (let k = 0; k < seg; k++) { const a = 2 * Math.PI * k / seg; ring.push(base.map((v, i) => v + (a1[i] * Math.cos(a) + a2[i] * Math.sin(a)) * r)); }
  const centre = base.map((v, i) => v + d[i] * 0.3), polys = [];
  for (let k = 0; k < seg; k++) polys.push({ pts: [ring[k], ring[(k + 1) % seg], tip], centre, mat });
  polys.push({ pts: [...ring].reverse(), centre, mat });
  return polys;
}
const part = (name, polys) => objectFrom(name, polys);
// Tonal texture: a face's material is swapped for a darker or lighter tone of it (tones are rounded so they share materials).
const TONES = new Map();
function tone(mat, f) {
  const lv = Math.round(Math.max(0.45, Math.min(1.7, f)) * 20) / 20, key = mat.name + "_t" + Math.round(lv * 100);
  if (!TONES.has(key)) TONES.set(key, M(key, mat.rgb.map(c => Math.min(255, Math.round(c * lv))), mat.glow));
  return TONES.get(key);
}
function texturize(polys, only, f, seed = 7) {
  let r0 = seed; const rnd = () => (r0 = (r0 * 9301 + 49297) % 233280) / 233280;
  for (const q of polys) {
    if (!only.includes(q.mat)) continue;
    const c = [0, 1, 2].map(i => q.pts.reduce((t, pt) => t + pt[i], 0) / q.pts.length);
    q.mat = tone(q.mat, f(c, rnd));
  }
}
// A turned shape from a side profile [[radius, height], ...]; `rag` makes the bottom ring ragged (tattered hems).
function lathe(c, prof, mat, seg = 12, rag = 0, seed = 1) {
  let r0 = seed * 9301 + 49297; const rnd = () => (r0 = (r0 * 9301 + 49297) % 233280) / 233280;
  const rings = prof.map(([r, y], i) => Array.from({ length: seg }, (_, k) => {
    const a = 2 * Math.PI * k / seg, jag = i === 0 && rag ? 1 + (rnd() - 0.3) * rag : 1, dy = i === 0 && rag ? (rnd() - 0.5) * rag * 0.5 : 0;
    return [c[0] + Math.cos(a) * r * jag, c[1] + y + dy, c[2] + Math.sin(a) * r * jag];
  }));
  const polys = [], centre = [c[0], c[1] + prof.reduce((t, q) => t + q[1], 0) / prof.length, c[2]];
  for (let i = 0; i + 1 < rings.length; i++) for (let k = 0; k < seg; k++) polys.push({ pts: [rings[i][k], rings[i][(k + 1) % seg], rings[i + 1][(k + 1) % seg], rings[i + 1][k]], centre, mat });
  return polys;
}
// A flat strip from a to b, `w` wide at a tapering to `wt` at b, `t` thick, lying flat to the plane with normal n.
function slat(a, b, w, wt, t, n, mat) {
  const u = sub(b, a), len = Math.hypot(...u), uu = u.map(v => v / len);
  let v = cross(uu, n); const lv = Math.hypot(...v) || 1; v = v.map(x => x / lv);
  const nn = cross(v, uu);
  const P = [];
  for (const [o, ww] of [[a, w], [b, wt]]) for (const sv of [-1, 1]) for (const sn of [-1, 1]) P.push(o.map((x, i) => x + v[i] * sv * ww / 2 + nn[i] * sn * t / 2));
  const centre = a.map((x, i) => (x + b[i]) / 2);
  return [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]].map(q => ({ pts: q.map(i => P[i]), centre, mat }));
}
const ARPG = {
  "arpg.hero": (() => {
    // THE WRAITH (from your reference renders): a faceless hooded spectre in deep violet robes, arms held open, with two
    // great feathered wings rising from its back and the robe's hem and sleeves dissolving into tattered streamers.
    const robe = M("wraith_robe", "#3a1d6b"), fold = M("wraith_fold", "#5b34a3"), hood = M("wraith_hood", "#2a1450"), voidM = M("wraith_void", "#07040d"),
      eyes = M("wraith_eyes", "#c79bff", true), hands = M("wraith_hands", "#a993dd"), wing = M("wraith_wing", "#4e2b98"), tip = M("wraith_feather_tip", "#8a64d6"),
      tatter = M("wraith_tatter", "#4a2786");
    const polys = { robe: [], hood: [], arms: [], wings: [], tatters: [] };
    // Robe: flared at the floor, narrowing to the shoulders, with a ragged hem; folds down the front.
    polys.robe.push(...lathe([0, 0.02, 0], [[0.46, 0], [0.42, 0.22], [0.34, 0.55], [0.27, 0.9], [0.24, 1.12], [0.2, 1.26]], robe, 14, 0.35, 3));
    for (let k = -2; k <= 2; k++) polys.robe.push(...slat([k * 0.09, 1.1, 0.23 - Math.abs(k) * 0.02], [k * 0.15, 0.08, 0.43 - Math.abs(k) * 0.04], 0.05, 0.08, 0.02, [0, 0, 1], fold));
    polys.robe.push(...ellipsoid([0, 1.27, -0.01], [0.33, 0.11, 0.23], fold, 12, 6));                    // mantle
    for (let k = 0; k < 9; k++) { const a = Math.PI * (0.1 + 0.8 * k / 8); polys.robe.push(...cone([Math.cos(a) * 0.3, 1.25, -Math.sin(a) * 0.12 + 0.02], [Math.cos(a) * 0.42, 1.06, -Math.sin(a) * 0.2], 0.04, fold, 4)); }   // mantle spikes
    // Hood: a tall peaked cowl with a dark void for a face and two faint eyes.
    polys.hood.push(...ellipsoid([0, 1.47, -0.02], [0.17, 0.2, 0.18], hood, 12, 8));
    polys.hood.push(...cone([0, 1.58, -0.06], [0, 1.82, -0.2], 0.1, hood, 6));
    polys.hood.push(...ellipsoid([0, 1.44, 0.09], [0.11, 0.14, 0.08], voidM, 10, 6));
    polys.hood.push(...ellipsoid([-0.045, 1.47, 0.165], [0.018, 0.012, 0.01], eyes, 6, 4), ...ellipsoid([0.045, 1.47, 0.165], [0.018, 0.012, 0.01], eyes, 6, 4));
    // Arms held open: wide sleeves from the shoulders, clawed hands, streamers falling from the cuffs.
    for (const sd of [-1, 1]) {
      const sh = [sd * 0.26, 1.22, 0.02], wr = [sd * 0.62, 1.02, 0.24];
      polys.arms.push(...cone(wr, sh, 0.12, robe, 8));                                                   // sleeve (wide at the wrist)
      polys.arms.push(...ellipsoid([sd * 0.68, 1.0, 0.27], [0.06, 0.05, 0.07], hands, 8, 5));
      for (let f = 0; f < 4; f++) polys.arms.push(...cone([sd * 0.7, 1.0, 0.27 + (f - 1.5) * 0.025], [sd * (0.8 + f * 0.01), 1.04 - f * 0.02, 0.3 + (f - 1.5) * 0.05], 0.012, hands, 3));   // fingers
      for (let t = 0; t < 4; t++) polys.tatters.push(...slat([sd * (0.56 + t * 0.03), 0.96, 0.2 + t * 0.03], [sd * (0.6 + t * 0.06), 0.5 - t * 0.08, 0.16 + t * 0.06], 0.07, 0.01, 0.015, [0, 0, 1], tatter));
    }
    // Tattered streamers flowing off the hem.
    for (let k = 0; k < 22; k++) {
      // hanging from the lower robe and falling to the floor, flaring a little and trailing behind
      const a = 2 * Math.PI * k / 22 + 0.2, top = 0.34 + (k % 3) * 0.08, r1 = 0.4 - top * 0.12, r2 = 0.5 + (k % 3) * 0.04, back = Math.sin(a) < 0 ? 0.16 : 0.02;
      polys.tatters.push(...slat([Math.cos(a) * r1, top, Math.sin(a) * r1], [Math.cos(a) * r2, 0.0, Math.sin(a) * r2 - back], 0.08, 0.01, 0.01, [Math.cos(a), 0.15, Math.sin(a)], tatter));
    }
    // Wings: a curved bone from the shoulder blades up and out, covered in layered flat feathers that rise like flames.
    for (const sd of [-1, 1]) {
      const bone = t => { const sh = [sd * 0.14, 1.36, -0.18], el = [sd * 0.62, 1.82, -0.36], tp = [sd * 1.0, 2.15, -0.42];
        return t < 0.5 ? sh.map((v, i) => v + (el[i] - v) * t * 2) : el.map((v, i) => v + (tp[i] - v) * (t - 0.5) * 2); };
      const n = [0, 0.18, 1];
      for (let i = 0; i < 13; i++) {                                                                     // flight feathers, long
        const t = i / 12, base = bone(t), ang = -0.35 + t * 1.25, len = 0.45 + Math.sin(t * Math.PI) * 0.4 + t * 0.2;
        const dir = [sd * Math.sin(ang), -Math.cos(ang) * 0.55 + 0.25 * t, -0.04];
        const end = base.map((v, j) => v + dir[j] * len);
        polys.wings.push(...slat(base, end, 0.11, 0.025, 0.02, n, i % 3 === 2 ? tip : wing));
      }
      for (let i = 0; i < 9; i++) {                                                                      // coverts, short, over the bone
        const t = 0.05 + i / 10, base = bone(t), end = base.map((v, j) => v + [sd * 0.14, -0.22, 0.02][j]);
        polys.wings.push(...slat(base.map((v, j) => v + [0, 0.02, 0.025][j]), end, 0.12, 0.04, 0.02, n, wing));
      }
      for (let i = 0; i < 4; i++) {                                                                      // primaries flaring up off the tip
        const base = bone(0.92 + i * 0.02), end = base.map((v, j) => v + [sd * (0.18 + i * 0.05), 0.3 - i * 0.05, -0.02][j]);
        polys.wings.push(...slat(base, end, 0.08, 0.015, 0.02, n, tip));
      }
      polys.wings.push(...cone(bone(0), bone(0.5), 0.04, robe, 5), ...cone(bone(0.5), bone(1), 0.03, robe, 5));   // wing bones
    }
    // Worn, uneven cloth: darker toward the hem and in the folds, lighter over the shoulders; feathers dark at the root and
    // pale at the tip; streamers fading lighter as they trail off; a little grain everywhere.
    const clamp01 = v => Math.max(0, Math.min(1, v));
    texturize(polys.robe, [robe, fold], (c, r) => 0.62 + 0.5 * clamp01(c[1] / 1.3) + (r() - 0.5) * 0.24, 11);
    texturize(polys.arms, [robe], (c, r) => 0.8 + 0.25 * clamp01((c[1] - 0.9) / 0.4) + (r() - 0.5) * 0.2, 13);
    texturize(polys.hood, [hood], (c, r) => 0.85 + 0.35 * clamp01((c[1] - 1.35) / 0.45) + (r() - 0.5) * 0.15, 17);
    texturize(polys.wings, [wing, tip, robe], (c, r) => 0.62 + 0.75 * clamp01((Math.abs(c[0]) - 0.15) / 0.95 + (c[1] - 1.4) * 0.35) + (r() - 0.5) * 0.18, 19);
    texturize(polys.tatters, [tatter], (c, r) => 1.35 - 0.6 * clamp01(c[1] / 0.9) + (r() - 0.5) * 0.2, 23);
    return [part("wraith_robe", polys.robe), part("wraith_hood", polys.hood), part("wraith_arms", polys.arms), part("wraith_wings", polys.wings), part("wraith_tatters", polys.tatters)];
  })(),
  "arpg.hollow": (() => {
    const skin = M("hollow_skin", "#5f7a68"), rags = M("hollow_rags", "#3a3048"), eye = M("hollow_eyes", "#ff6e3a", true), bone = M("hollow_bone", "#c9c2b0");
    return [
      part("hollow_legs", [...box([-0.1, 0.28, 0], [0.13, 0.56, 0.15], rags), ...box([0.1, 0.28, 0], [0.13, 0.56, 0.15], rags)]),
      part("hollow_body", box([0, 0.78, 0.08], [0.42, 0.5, 0.28], rags, 0)),
      part("hollow_head", [...ellipsoid([0, 1.1, 0.2], [0.15, 0.17, 0.16], skin, 9, 6), ...box([-0.06, 1.12, 0.34], [0.05, 0.03, 0.03], eye), ...box([0.06, 1.12, 0.34], [0.05, 0.03, 0.03], eye)]),
      part("hollow_arms", [...box([-0.28, 0.72, 0.22], [0.09, 0.6, 0.1], skin, 0.25), ...box([0.28, 0.72, 0.22], [0.09, 0.6, 0.1], skin, -0.25)]),
      part("hollow_ribs", [...box([0, 0.85, 0.23], [0.3, 0.04, 0.03], bone), ...box([0, 0.75, 0.23], [0.28, 0.04, 0.03], bone), ...box([0, 0.65, 0.23], [0.24, 0.04, 0.03], bone)]),
    ];
  })(),
  "arpg.skitter": (() => {
    const shell = M("skitter_shell", "#c2408f"), leg = M("skitter_legs", "#a03a8a"), eye = M("skitter_eyes", "#ffd84a", true);
    const legs = [];
    for (let k = 0; k < 4; k++) for (const s of [-1, 1]) { const z = 0.18 - k * 0.14; legs.push(...cone([s * 0.15, 0.22, z], [s * 0.55, 0.32, z + 0.05], 0.035, leg, 4), ...cone([s * 0.55, 0.32, z + 0.05], [s * 0.72, 0, z + 0.08], 0.03, leg, 4)); }
    return [part("skitter_body", ellipsoid([0, 0.25, -0.1], [0.24, 0.16, 0.3], shell)), part("skitter_head", [...ellipsoid([0, 0.24, 0.24], [0.13, 0.1, 0.12], shell, 8, 5), ...box([-0.05, 0.28, 0.35], [0.04, 0.04, 0.03], eye), ...box([0.05, 0.28, 0.35], [0.04, 0.04, 0.03], eye)]), part("skitter_legs", legs)];
  })(),
  "arpg.wisp": (() => {
    const core = M("wisp_core", "#ffffff", true), glow = M("wisp_glow", "#8fd8ff", true), shard = M("wisp_shards", "#6ea8ff", true);
    const shards = []; for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; shards.push(...cone([Math.cos(a) * 0.32, 1.0, Math.sin(a) * 0.32], [Math.cos(a) * 0.4, 1.18, Math.sin(a) * 0.4], 0.05, shard, 4)); }
    return [part("wisp_core", ellipsoid([0, 1.0, 0], [0.12, 0.12, 0.12], core, 8, 6)), part("wisp_flame", [...ellipsoid([0, 1.0, 0], [0.22, 0.2, 0.22], glow, 10, 6), ...cone([0, 1.12, 0], [0, 1.5, -0.12], 0.14, glow, 6), ...cone([0, 0.9, 0], [0, 0.55, -0.2], 0.1, glow, 6)]), part("wisp_shards", shards)];
  })(),
  "arpg.golem": (() => {
    const stone = M("golem_stone", "#6a5a94"), dark = M("golem_dark", "#3a2e5a"), crack = M("golem_runes", "#ffd84a", true);
    return [
      part("golem_legs", [...box([-0.22, 0.32, 0], [0.3, 0.64, 0.34], dark), ...box([0.22, 0.32, 0], [0.3, 0.64, 0.34], dark)]),
      part("golem_body", [...box([0, 1.0, 0], [0.9, 0.75, 0.55], stone), ...box([0, 1.05, 0.28], [0.4, 0.08, 0.02], crack), ...box([0, 0.92, 0.28], [0.08, 0.3, 0.02], crack)]),
      part("golem_head", [...box([0, 1.5, 0.05], [0.36, 0.3, 0.34], stone), ...box([0, 1.52, 0.23], [0.24, 0.05, 0.02], crack)]),
      part("golem_arms", [...box([-0.6, 0.9, 0.05], [0.28, 0.85, 0.3], stone), ...box([0.6, 0.9, 0.05], [0.28, 0.85, 0.3], stone), ...box([-0.6, 0.42, 0.08], [0.34, 0.3, 0.36], dark), ...box([0.6, 0.42, 0.08], [0.34, 0.3, 0.36], dark)]),
    ];
  })(),
  "arpg.warden": (() => {
    const robe = M("warden_robe", "#5a1e6e"), dark = M("warden_dark", "#2a0c3a"), horn = M("warden_horns", "#ffb36b"), eye = M("warden_eyes", "#ff2bd6", true), staff = M("warden_staff", "#c9a6ff"), orb = M("warden_orb", "#ff2bd6", true);
    return [
      part("warden_robe", [...cone([0, 0, 0], [0, 1.7, 0], 0.55, robe, 10), ...box([0, 1.45, 0], [0.75, 0.5, 0.42], robe)]),
      part("warden_shoulders", [...cone([-0.42, 1.65, 0], [-0.75, 2.0, -0.05], 0.13, horn, 5), ...cone([0.42, 1.65, 0], [0.75, 2.0, -0.05], 0.13, horn, 5)]),
      part("warden_head", [...ellipsoid([0, 1.95, 0.02], [0.2, 0.24, 0.2], dark, 10, 7), ...box([-0.08, 1.97, 0.2], [0.08, 0.04, 0.03], eye), ...box([0.08, 1.97, 0.2], [0.08, 0.04, 0.03], eye)]),
      part("warden_horns", [...cone([-0.12, 2.12, 0], [-0.35, 2.55, -0.1], 0.07, horn, 5), ...cone([0.12, 2.12, 0], [0.35, 2.55, -0.1], 0.07, horn, 5)]),
      part("warden_staff", [...box([0.62, 1.1, 0.25], [0.06, 2.2, 0.06], staff), ...ellipsoid([0.62, 2.28, 0.25], [0.12, 0.12, 0.12], orb, 8, 6)]),
    ];
  })(),
};

const count = o => o.groups.reduce((t, g) => t + g.idx.length / 3, 0);
for (const [slot, objs] of Object.entries(ARPG)) { writeFileSync(`models/source/${slot}.glb`, glb(objs)); out.push(`${slot}.glb  (${objs.length} parts, ${objs.reduce((t, o) => t + count(o), 0)} triangles, NEW)`); }
for (const [slot, obj] of Object.entries({ ...rts, ...arcade })) { writeFileSync(`models/source/${slot}.glb`, glb([obj])); out.push(`${slot}.glb  (${count(obj)} triangles)`); }
for (const [slot, objs] of Object.entries(giants)) { writeFileSync(`models/source/${slot}.glb`, glb(objs)); out.push(`${slot}.glb  (${objs.length} parts, ${objs.reduce((t, o) => t + count(o), 0)} triangles)`); }
// Everything in one scene, side by side (giants scaled down to sit with the rest).
const mergeAll = (name, objs, scale = 1) => ({ name, groups: objs.flatMap(o => o.groups.map(g => ({ ...g, pos: g.pos.map(p => p.map(c => c * scale)) }))) });
const all = [...Object.values(rts), ...Object.values(arcade),
  ...Object.entries(giants).map(([slot, objs]) => mergeAll(slot, objs, 1 / 4.2)),
  ...Object.entries(ARPG).map(([slot, objs]) => mergeAll(slot, objs, 1.2))];
writeFileSync("models/source/ALL-MODELS.glb", glb(all, true));
console.log("Exported to models/source/:\n  " + out.join("\n  ") + "\n  ALL-MODELS.glb  (everything side by side)");
