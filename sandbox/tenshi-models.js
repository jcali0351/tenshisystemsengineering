// tenshi-models.js: swap any game character for your own 3D model made in Blender.
//
// How to use it (full guide: models/README.md):
//   1. In Blender, model the character (low-poly looks best: up to ~1,500 triangles), give it coloured materials.
//   2. File > Export > glTF 2.0, format "glTF Binary (.glb)". Save it into the models/ folder.
//   3. Open models/models.json and put the file name next to the character it replaces, e.g.
//        "rts.interceptor": "my-fighter.glb"
//   4. Push. Every game picks it up; characters without a model keep their built-in look.
//
// The games ask this file for a model by its slot name (window.TenshiModels.get("rts.interceptor")). What comes back is
// a mesh in glTF's own axes, centred and scaled to fit inside a ball of radius 1:
//   { v: [[x, y, z], ...], f: [{ i: [a, b, c], rgb: [r, g, b], c: [cx, cy, cz] }, ...], tris }
//   x = the model's left, y = up, z = forward (Blender's front view faces this way after export).
// Each game turns that into its own axes with TenshiModels.axes(mesh, fn). Animations and rigs aren't used yet:
// a model moves, turns, bobs and leans as one piece.
(function () {
  const here = (document.currentScript && document.currentScript.src) || "";
  const BASE = here ? here.replace(/sandbox\/tenshi-models\.js.*$/, "") : "";
  const DIR = BASE + "models/";
  const meshes = {};          // slot -> mesh
  const waiting = [];         // callbacks for when loading finishes
  let manifest = {}, done = false;

  // ---------------------------------------------------------------- reading a .glb file
  const TYPE_SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
  const COMP = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
  function parseGLB(buffer) {
    const dv = new DataView(buffer);
    if (dv.getUint32(0, true) !== 0x46546c67) throw new Error("not a .glb file (export as glTF Binary)");
    let offset = 12, json = null, bin = null;
    while (offset < buffer.byteLength) {
      const len = dv.getUint32(offset, true), type = dv.getUint32(offset + 4, true);
      const chunk = buffer.slice(offset + 8, offset + 8 + len);
      if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(chunk));
      else if (type === 0x004e4942) bin = chunk;
      offset += 8 + len;
    }
    if (!json || !bin) throw new Error("the .glb has no mesh data");
    return { json, bin };
  }
  function accessor(gltf, bin, index) {
    const a = gltf.accessors[index], view = gltf.bufferViews[a.bufferView];
    const size = TYPE_SIZE[a.type], Arr = COMP[a.componentType];
    const start = (view.byteOffset || 0) + (a.byteOffset || 0), stride = view.byteStride || 0;
    const out = [];
    if (!stride || stride === size * Arr.BYTES_PER_ELEMENT) {
      const arr = new Arr(bin, start, a.count * size);
      for (let k = 0; k < a.count; k++) out.push(size === 1 ? arr[k] : Array.from(arr.subarray(k * size, k * size + size)));
    } else {
      for (let k = 0; k < a.count; k++) out.push(Array.from(new Arr(bin, start + k * stride, size)));
    }
    if (a.normalized && Arr !== Float32Array) { const max = Arr === Uint8Array ? 255 : Arr === Uint16Array ? 65535 : 1; return out.map(v => Array.isArray(v) ? v.map(c => c / max) : v / max); }
    return out;
  }
  // 4x4 matrices (column-major, like glTF)
  const ident = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  function mul(a, b) { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; }
  function trs(n) {
    if (n.matrix) return n.matrix.slice();
    const [tx, ty, tz] = n.translation || [0, 0, 0], [qx, qy, qz, qw] = n.rotation || [0, 0, 0, 1], [sx, sy, sz] = n.scale || [1, 1, 1];
    const xx = qx * qx, yy = qy * qy, zz = qz * qz, xy = qx * qy, xz = qx * qz, yz = qy * qz, wx = qw * qx, wy = qw * qy, wz = qw * qz;
    return [(1 - 2 * (yy + zz)) * sx, 2 * (xy + wz) * sx, 2 * (xz - wy) * sx, 0,
            2 * (xy - wz) * sy, (1 - 2 * (xx + zz)) * sy, 2 * (yz + wx) * sy, 0,
            2 * (xz + wy) * sz, 2 * (yz - wx) * sz, (1 - 2 * (xx + yy)) * sz, 0, tx, ty, tz, 1];
  }
  const apply = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];

  // Turn a whole .glb scene into one flat, coloured triangle mesh.
  function toMesh(buffer) {
    const { json: g, bin } = parseGLB(buffer);
    const v = [], f = [];
    const colourOf = prim => {
      const m = prim.material != null && g.materials ? g.materials[prim.material] : null;
      const c = (m && m.pbrMetallicRoughness && m.pbrMetallicRoughness.baseColorFactor) || [0.75, 0.72, 0.85, 1];
      const lin = x => x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;   // glTF colours are linear
      return { rgb: [0, 1, 2].map(k => Math.round(lin(c[k]) * 255)), glow: !!(m && m.emissiveFactor && Math.max(...m.emissiveFactor) > 0.5) };
    };
    function visit(nodeIndex, parent) {
      const node = g.nodes[nodeIndex], m = mul(parent, trs(node));
      if (node.mesh != null) for (const prim of g.meshes[node.mesh].primitives) {
        if (prim.mode != null && prim.mode !== 4) continue;            // triangles only
        const pos = accessor(g, bin, prim.attributes.POSITION).map(p => apply(m, p));
        const idx = prim.indices != null ? accessor(g, bin, prim.indices) : pos.map((_, k) => k);
        const base = v.length, col = colourOf(prim);
        v.push(...pos);
        for (let k = 0; k + 2 < idx.length; k += 3) f.push({ i: [base + idx[k], base + idx[k + 1], base + idx[k + 2]], rgb: col.rgb, glow: col.glow });
      }
      for (const child of node.children || []) visit(child, m);
    }
    const scene = g.scenes ? g.scenes[g.scene || 0] : { nodes: g.nodes.map((_, k) => k) };
    for (const n of scene.nodes) visit(n, ident());
    if (!f.length) throw new Error("no triangles found");
    // Centre it and scale it to fit inside a ball of radius 1; every face remembers its centre (for outward normals).
    let min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
    for (const p of v) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p[k]); max[k] = Math.max(max[k], p[k]); }
    const mid = [0, 1, 2].map(k => (min[k] + max[k]) / 2);
    let r = 1e-9; for (const p of v) r = Math.max(r, Math.hypot(p[0] - mid[0], p[1] - mid[1], p[2] - mid[2]));
    const vv = v.map(p => [(p[0] - mid[0]) / r, (p[1] - mid[1]) / r, (p[2] - mid[2]) / r]);
    for (const face of f) face.c = [0, 0, 0];    // the model's centre: normals point away from it (fine for solid models)
    return { v: vv, f, tris: f.length, height: (max[1] - min[1]) / r };
  }

  // ---------------------------------------------------------------- loading what models.json asks for
  async function load() {
    try {
      const r = await fetch(DIR + "models.json", { cache: "no-cache" });
      manifest = r.ok ? await r.json() : {};
    } catch (e) { manifest = {}; }
    const jobs = Object.entries(manifest).filter(([k, file]) => !k.startsWith("_") && typeof file === "string" && file.trim()).map(async ([slot, file]) => {
      try {
        const res = await fetch(DIR + file.trim(), { cache: "no-cache" });
        if (!res.ok) throw new Error("file not found: models/" + file);
        meshes[slot] = toMesh(await res.arrayBuffer());
        if (meshes[slot].tris > 1500) console.warn(`[models] ${slot}: ${meshes[slot].tris} triangles. Fewer than 1,500 keeps the games smooth (Blender: Decimate modifier).`);
      } catch (e) { console.warn(`[models] ${slot} (${file}) couldn't be loaded: ${e.message}. Using the built-in look.`); }
    });
    await Promise.all(jobs);
    done = true;
    waiting.splice(0).forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
  }

  window.TenshiModels = {
    /** The mesh for a slot (or null when that character has no Blender model). */
    get: slot => meshes[slot] || null,
    /** Run fn once loading has finished (straight away if it already has). */
    whenReady(fn) { if (done) fn(); else waiting.push(fn); },
    /** A copy of a mesh with its corners moved into a game's own axes: fn([x, y, z]) -> [x', y', z']. */
    axes(mesh, fn, scale = 1) {
      const v = mesh.v.map(p => fn(p).map(c => c * scale));
      let f = mesh.f.map(face => ({ i: face.i.slice(), rgb: face.rgb, glow: face.glow, c: [0, 0, 0], mat: face.glow ? "glow" : "model", wind: true }));
      // Faces keep the direction Blender gave them ("wind": the games use it as is instead of guessing from the centre).
      // A game's axes may be mirrored compared with glTF's, which turns every face inside out: check which way most
      // faces point (outwards = away from the middle) and turn them all round if needed.
      let out = 0;
      for (const face of f) {
        const [a, b, c] = face.i.map(k => v[k]);
        const n = [(b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])];
        const m = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
        out += Math.sign(n[0] * m[0] + n[1] * m[1] + n[2] * m[2]);
      }
      if (out < 0) f = f.map(face => ({ ...face, i: [face.i[0], face.i[2], face.i[1]] }));
      return { v, f, tris: mesh.tris };
    },
    slots: () => Object.keys(manifest).filter(k => !k.startsWith("_")),
    loaded: () => Object.keys(meshes),
    parse: toMesh,     // used by the model checker page
  };
  load();
})();
