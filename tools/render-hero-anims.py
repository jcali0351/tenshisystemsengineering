# tools/render-hero-anims.py: render a rigged Meshy .glb (textures inside) with several animations as Undercity
# sprite frames: 8 directions x N frames per animation, at the game's 2:1 isometric camera, kept in place, all at the
# same scale. Run with Blender:
#   blender --background --factory-startup --python tools/render-hero-anims.py -- <model.glb> <out_dir> <px> <samples>
#       Walking:8 Running:8 Attack:12 x-Attack:12 [--extra other.glb]   (part of the animation's name : frames to sample)
# --extra loads the animations from another .glb of the same rig (e.g. a separate attack download); an x- prefix
# picks the animation from that file.
# Output: out_dir/<name>/d<dir>_f<frame>.png and out_dir/meta.json (anchor, height in px). Pack each animation into a
# sheet (rows = directions, columns = frames) and set HERO_ANIMS in sandbox/neon-arpg.js.
import bpy, sys, math, os, json
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
args = sys.argv[sys.argv.index("--") + 1:]
extra = None
if "--extra" in args:
    i = args.index("--extra"); extra = args[i + 1]; args = args[:i] + args[i + 2:]
src, out, px, samples = args[0], args[1], int(args[2]), int(args[3])
wanted = [(a.split(":")[0], int(a.split(":")[1])) for a in args[4:]]
GLOW = 0.2                                                 # how much the texture glows by itself (Meshy exports 1.0)
front_offset = 90.0                                        # Meshy fronts face -Y; turn them to face +X (map angle 0)
os.makedirs(out, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
scene = bpy.context.scene
arm = next(o for o in scene.objects if o.type == "ARMATURE")
mesh = next(o for o in scene.objects if o.type == "MESH")
own = set(bpy.data.actions.keys())
if extra:                                                  # bring in the other file's animations, drop its objects
    before = set(scene.objects)
    bpy.ops.import_scene.gltf(filepath=extra)
    for o in set(scene.objects) - before: bpy.data.objects.remove(o)
if arm.animation_data is None: arm.animation_data_create()
for t in list(arm.animation_data.nla_tracks): arm.animation_data.nla_tracks.remove(t)
print("[hero] actions:", list(bpy.data.actions.keys()))

def use_action(key, from_extra):
    pool = [a for a in bpy.data.actions if (a.name not in own) == from_extra and key.lower() in a.name.lower()]
    act = pool[0]
    arm.animation_data.action = act
    try:
        if getattr(arm.animation_data, "action_slot", None) is None and len(act.slots): arm.animation_data.action_slot = act.slots[0]
    except Exception: pass
    return act

# Materials: Meshy often exports the colour texture as full-strength emission with doubled specular, which renders flat
# and washed-out white. Tone that down so the lights shape the character: a hint of glow, normal shine, soft satin.
for m in mesh.data.materials:
    if not m or not m.use_nodes: continue
    for n in m.node_tree.nodes:
        if n.type != "BSDF_PRINCIPLED": continue
        def setin(name, v):
            if name in n.inputs: n.inputs[name].default_value = v
        setin("Emission Strength", GLOW); setin("Specular IOR Level", 0.5); setin("Roughness", 0.5)
        setin("Coat Weight", 0.08); setin("Sheen Weight", 0.15)

pivot = bpy.data.objects.new("pivot", None); scene.collection.objects.link(pivot)
arm.parent = pivot

def world_pts(frame):
    scene.frame_set(int(frame), subframe=frame - int(frame)); dg = bpy.context.evaluated_depsgraph_get()
    ev = mesh.evaluated_get(dg); m = ev.matrix_world
    pts = [m @ v.co for v in ev.to_mesh().vertices]; ev.to_mesh_clear()
    return pts

# Measure every animation first (facing +X) so one camera size fits all of them.
pivot.rotation_euler = (0, 0, math.radians(front_offset))
plans = []
for key, n in wanted:
    from_extra = False
    name = key
    if key.lower().startswith("x-"): from_extra, key = True, key[2:]
    act = use_action(key, from_extra)
    f0, f1 = act.frame_range
    # Looping moves (walk/run): skip the last frame, it repeats the first.
    loop = "walk" in key.lower() or "run" in key.lower()
    frames = [f0 + (f1 - f0) * i / (n if loop else max(1, n - 1)) for i in range(n)]
    data = {f: world_pts(f) for f in frames}
    centres = {f: (sum(p.x for p in data[f]) / len(data[f]), sum(p.y for p in data[f]) / len(data[f])) for f in frames}
    plans.append(dict(name=name, key=key, extra=from_extra, act=act, frames=frames, data=data, centres=centres))
ground = min(p.z for p in plans[0]["data"][plans[0]["frames"][0]])
H = max(p.z for p in plans[0]["data"][plans[0]["frames"][0]]) - ground
top = max(p.z for pl in plans for f in pl["frames"] for p in pl["data"][f]) - ground
reach = max(math.hypot(p.x - pl["centres"][f][0], p.y - pl["centres"][f][1]) for pl in plans for f in pl["frames"] for p in pl["data"][f])
span = max(top * 1.12, reach * 2.25)
print("[hero] height", round(H, 3), "top", round(top, 3), "reach", round(reach, 3), "span", round(span, 3))

cam_d = bpy.data.cameras.new("cam"); cam_d.type = "ORTHO"; cam_d.ortho_scale = span
cam = bpy.data.objects.new("cam", cam_d); scene.collection.objects.link(cam); scene.camera = cam
el = math.radians(30); D = 30
def light(energy, color, frm, angle):
    d = bpy.data.lights.new("sun" + str(energy), "SUN"); d.energy = energy; d.color = color; d.angle = angle
    o = bpy.data.objects.new(d.name, d); o.rotation_euler = (-Vector(frm)).to_track_quat("-Z", "Y").to_euler(); scene.collection.objects.link(o)
light(4.2, (1.0, 0.93, 0.86), (0.25, 1.0, 1.3), 0.2)        # warm key from the camera side, above
light(0.9, (0.55, 0.6, 1.0), (1.0, 0.1, 0.35), 0.9)          # cool fill from the right
light(5.0, (1.0, 0.35, 0.85), (-1.0, -0.6, 0.55), 0.15)      # neon pink rim from behind-left
light(4.0, (0.55, 0.45, 1.0), (-0.5, -1.0, 0.6), 0.15)       # violet rim from behind-right
world = bpy.data.worlds.new("w"); scene.world = world; world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.03, 0.02, 0.06, 1); world.node_tree.nodes["Background"].inputs[1].default_value = 0.6
scene.render.engine = "CYCLES"; scene.cycles.device = "CPU"; scene.cycles.samples = samples; scene.cycles.use_denoising = True
scene.render.film_transparent = True; scene.render.resolution_x = px; scene.render.resolution_y = px
scene.render.image_settings.file_format = "PNG"; scene.render.image_settings.color_mode = "RGBA"
try:                                                       # a punchier tone curve than the default
    scene.view_settings.view_transform = "AgX"
    for look in ("AgX - Medium High Contrast", "AgX - Punchy", "Medium High Contrast"):
        try: scene.view_settings.look = look; break
        except Exception: pass
except Exception: pass

dirs = 8; meta = {"dirs": dirs, "cell": px, "modelHeight": H, "anims": {}}
for pl in plans:
    use_action(pl["key"], pl["extra"])
    od = os.path.join(out, pl["name"].replace(":", "_")); os.makedirs(od, exist_ok=True)
    for d in range(dirs):
        ang = math.radians(front_offset + d * 360 / dirs); pivot.rotation_euler = (0, 0, ang)
        for i, f in enumerate(pl["frames"]):
            scene.frame_set(int(f), subframe=f - int(f))
            cx, cy = pl["centres"][f]; r = ang - math.radians(front_offset)
            tx, ty = cx * math.cos(r) - cy * math.sin(r), cx * math.sin(r) + cy * math.cos(r)
            cam.location = (tx + math.cos(el) / math.sqrt(2) * D, ty + math.cos(el) / math.sqrt(2) * D, ground + span * 0.42 + math.sin(el) * D)
            cam.rotation_euler = (Vector((tx, ty, ground + span * 0.42)) - cam.location).to_track_quat("-Z", "Y").to_euler()
            bpy.context.view_layer.update()
            if "anchorX" not in meta:
                foot = world_to_camera_view(scene, cam, Vector((tx, ty, ground))); head = world_to_camera_view(scene, cam, Vector((tx, ty, ground + H)))
                meta.update(anchorX=foot.x, anchorY=1 - foot.y, heightPx=(head.y - foot.y) * px)
            scene.render.filepath = os.path.join(od, f"d{d}_f{i:02d}.png")
            bpy.ops.render.render(write_still=True)
        print("[hero]", pl["name"], "direction", d, flush=True)
    meta["anims"][pl["name"]] = {"frames": len(pl["frames"]), "seconds": (pl["act"].frame_range[1] - pl["act"].frame_range[0]) / scene.render.fps}
json.dump(meta, open(os.path.join(out, "meta.json"), "w"), indent=1)
print("[hero] meta", meta)
