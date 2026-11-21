// tenshi-models.js: swap any game character for your own 3D model made in Blender.
//
// How to use it (full guide: models/README.md):
//   1. In Blender (or Tripo, Meshy...), make the character. Coloured materials, textures or vertex colours all work;
//      heavy models are simplified automatically to about 1,500 triangles.
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

  // ---- Textures: decode the images packed inside the .glb so faces can take their colour from them ----
  async function decodeImages(g, bin) {
    const out = [];
    for (const img of g.images || []) {
      try {
        if (img.bufferView == null) { out.push(null); continue; }              // external image files aren't supported (export as .glb)
        const view = g.bufferViews[img.bufferView];
        const bytes = new Uint8Array(bin, view.byteOffset || 0, view.byteLength);
        const bmp = await createImageBitmap(new Blob([bytes], { type: img.mimeType || "image/png" }));
        // Shrink big textures: one colour per face doesn't need more than 256 px.
        const w = Math.min(256, bmp.width), h = Math.min(256, bmp.height);
        const c = document.createElement("canvas"); c.width = w; c.height = h;
        const cx = c.getContext("2d", { willReadFrequently: true }); cx.drawImage(bmp, 0, 0, w, h);
        out.push({ w, h, data: cx.getImageData(0, 0, w, h).data });
      } catch (e) { out.push(null); }
    }
    return out;
  }
  function sample(tex, u, v) {                                    // the texture's colour at (u, v), wrapping round
    u -= Math.floor(u); v -= Math.floor(v);
    const x = Math.min(tex.w - 1, Math.floor(u * tex.w)), y = Math.min(tex.h - 1, Math.floor(v * tex.h)), k = (y * tex.w + x) * 4;
    return [tex.data[k], tex.data[k + 1], tex.data[k + 2]];
  }

  // Turn a whole .glb scene into one flat, coloured triangle mesh. Colours come from (in order): the material's texture,
  // the model's vertex colours, the material's base colour. Heavy models are simplified to about MAX_TRIS triangles.
  const MAX_TRIS = 2400;
  async function toMesh(buffer) {
    const { json: g, bin } = parseGLB(buffer);
    const needs = g.extensionsRequired || [];
    if (needs.includes("KHR_draco_mesh_compression") || needs.includes("EXT_meshopt_compression"))
      throw new Error("the model is compressed (Draco / meshopt). Export it again with compression turned off");
    const images = await decodeImages(g, bin);
    const lin = x => x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;   // glTF factors are linear
    const v = [], f = [];
    function materialOf(prim) {
      const m = prim.material != null && g.materials ? g.materials[prim.material] : null;
      const pbr = (m && m.pbrMetallicRoughness) || {};
      const factor = pbr.baseColorFactor || [0.75, 0.72, 0.85, 1];
      let tex = null, texCoord = 0;
      if (pbr.baseColorTexture && g.textures) {
        const t = g.textures[pbr.baseColorTexture.index];
        if (t && t.source != null) tex = images[t.source] || null;
        texCoord = pbr.baseColorTexture.texCoord || 0;
      }
      const emissive = m && m.emissiveFactor && Math.max(...m.emissiveFactor) > 0.5;
      return { rgb: [0, 1, 2].map(k => Math.round(lin(factor[k]) * 255)), mult: factor.slice(0, 3).map(lin), tex, texCoord, glow: !!emissive };
    }
    function visit(nodeIndex, parent) {
      const node = g.nodes[nodeIndex], m = mul(parent, trs(node));
      if (node.mesh != null) for (const prim of g.meshes[node.mesh].primitives) {
        if (prim.mode != null && prim.mode !== 4) continue;            // triangles only
        const pos = accessor(g, bin, prim.attributes.POSITION).map(p => apply(m, p));
        const idx = prim.indices != null ? accessor(g, bin, prim.indices) : pos.map((_, k) => k);
        const mat = materialOf(prim), base = v.length;
        const uvKey = "TEXCOORD_" + mat.texCoord;
        const uv = mat.tex && prim.attributes[uvKey] != null ? accessor(g, bin, prim.attributes[uvKey]) : null;
        const vc = prim.attributes.COLOR_0 != null ? accessor(g, bin, prim.attributes.COLOR_0) : null;
        v.push(...pos);
        for (let k = 0; k + 2 < idx.length; k += 3) {
          const a = idx[k], b = idx[k + 1], c = idx[k + 2];
          let rgb = mat.rgb;
          if (uv) {
            // Average a few points on the face (its middle and towards each corner), tinted by the base colour.
            const pts = [[1 / 3, 1 / 3, 1 / 3], [0.6, 0.2, 0.2], [0.2, 0.6, 0.2], [0.2, 0.2, 0.6]];
            const sum = [0, 0, 0];
            for (const [wa, wb, wc] of pts) {
              const s = sample(mat.tex, uv[a][0] * wa + uv[b][0] * wb + uv[c][0] * wc, uv[a][1] * wa + uv[b][1] * wb + uv[c][1] * wc);
              for (let j = 0; j < 3; j++) sum[j] += s[j];
            }
            rgb = sum.map((s, j) => Math.round(s / pts.length * mat.mult[j]));
          } else if (vc) {
            rgb = [0, 1, 2].map(j => Math.round(lin((vc[a][j] + vc[b][j] + vc[c][j]) / 3) * 255));
          }
          f.push({ i: [base + a, base + b, base + c], rgb, glow: mat.glow });
        }
      }
      for (const child of node.children || []) visit(child, m);
    }
    const scene = g.scenes ? g.scenes[g.scene || 0] : { nodes: g.nodes.map((_, k) => k) };
    for (const n of scene.nodes) visit(n, ident());
    if (!f.length) throw new Error("no triangles found");
    // Centre it and scale it to fit inside a ball of radius 1.
    let min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
    for (const p of v) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p[k]); max[k] = Math.max(max[k], p[k]); }
    const mid = [0, 1, 2].map(k => (min[k] + max[k]) / 2);
    let r = 1e-9; for (const p of v) r = Math.max(r, Math.hypot(p[0] - mid[0], p[1] - mid[1], p[2] - mid[2]));
    let mesh = { v: v.map(p => [(p[0] - mid[0]) / r, (p[1] - mid[1]) / r, (p[2] - mid[2]) / r]), f, original: f.length };
    if (f.length > MAX_TRIS) mesh = simplify(mesh, MAX_TRIS);
    for (const face of mesh.f) face.c = [0, 0, 0];
    return { v: mesh.v, f: mesh.f, tris: mesh.f.length, original: f.length, height: (max[1] - min[1]) / r };
  }

  // Simplify a heavy mesh (vertex clustering): snap the corners to a grid, merge corners in the same cell, drop the
  // triangles that collapse, and give the merged faces the average colour of the faces they replace. The grid gets coarser
  // until the model is under the limit. Good enough for game characters seen at a distance.
  function simplify(mesh, limit) {
    for (let res = 64; res >= 6; res = Math.floor(res * 0.8)) {
      const cellOf = p => p.map(c => Math.floor((c + 1) / 2 * res)).join(",");
      const cells = new Map(), vv = [], remap = mesh.v.map(p => {
        const key = cellOf(p);
        let cell = cells.get(key);
        if (!cell) { cell = { i: vv.length, sum: [0, 0, 0], n: 0 }; cells.set(key, cell); vv.push(null); }
        cell.sum[0] += p[0]; cell.sum[1] += p[1]; cell.sum[2] += p[2]; cell.n++;
        return cell.i;
      });
      for (const cell of cells.values()) vv[cell.i] = cell.sum.map(s => s / cell.n);
      const merged = new Map();
      for (const face of mesh.f) {
        const i = face.i.map(k => remap[k]);
        if (i[0] === i[1] || i[1] === i[2] || i[0] === i[2]) continue;
        const key = [...i].sort((a, b) => a - b).join(",") + (face.glow ? "g" : "");
        const m = merged.get(key);
        if (m) { m.sum[0] += face.rgb[0]; m.sum[1] += face.rgb[1]; m.sum[2] += face.rgb[2]; m.n++; }
        else merged.set(key, { i, sum: face.rgb.slice(), n: 1, glow: face.glow });
      }
      if (merged.size <= limit || res <= 6) {
        const ff = [...merged.values()].map(m => ({ i: m.i, rgb: m.sum.map(s => Math.round(s / m.n)), glow: m.glow }));
        return { v: vv, f: ff };
      }
    }
    return mesh;
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
        meshes[slot] = await toMesh(await res.arrayBuffer());
        if (meshes[slot].original > meshes[slot].tris) console.info(`[models] ${slot}: simplified from ${meshes[slot].original} to ${meshes[slot].tris} triangles to keep the game smooth.`);
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
