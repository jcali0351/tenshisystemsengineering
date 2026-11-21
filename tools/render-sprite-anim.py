# tools/render-sprite-anim.py: render an animated (Mixamo-rigged) character as an Undercity monster sprite sheet.
#   blender --background --factory-startup --python tools/render-sprite-anim.py -- <model.fbx> <textures_dir> <out_dir> 192 8 16
# textures_dir holds color.png, roughness.png, metallic.png, normal.png. Pack d<dir>_f<frame>.png into rows = directions,
# columns = frames (160 px cells) and add an entry to MONSTER_SPRITES in sandbox/neon-arpg.js using out_dir/meta.json.
# Blender (headless): render an animated (Mixamo-rigged) character as a sprite sheet for Undercity:
# 8 directions x N frames sampled from its animation, at the game's 2:1 isometric camera, kept in place.
#   blender --background --factory-startup --python render_anim.py -- <model.fbx> <textures_dir> <out_dir> <px> <frames> <samples>
import bpy, sys, math, os, json
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
args = sys.argv[sys.argv.index("--") + 1:]
src, texdir, out, px, nframes, samples = args[0], args[1], args[2], int(args[3]), int(args[4]), int(args[5])
front_offset = float(args[6]) if len(args) > 6 else 90.0
os.makedirs(out, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=src)
arm = next(o for o in bpy.context.scene.objects if o.type == "ARMATURE")
mesh = next(o for o in bpy.context.scene.objects if o.type == "MESH")
act = arm.animation_data.action
f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
scene = bpy.context.scene

# Material: the colour, roughness and normal textures from the zip (the FBX references may not resolve).
mat = mesh.data.materials[0]; mat.use_nodes = True; nt = mat.node_tree
bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
def tex(name, socket, noncolor=False, normal=False):
    p = os.path.join(texdir, name)
    if not os.path.exists(p): return
    n = nt.nodes.new("ShaderNodeTexImage"); n.image = bpy.data.images.load(p)
    if noncolor: n.image.colorspace_settings.name = "Non-Color"
    if normal:
        nm = nt.nodes.new("ShaderNodeNormalMap"); nt.links.new(n.outputs["Color"], nm.inputs["Color"]); nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    else: nt.links.new(n.outputs["Color"], bsdf.inputs[socket])
tex("color.png", "Base Color"); tex("roughness.png", "Roughness", True); tex("metallic.png", "Metallic", True); tex("normal.png", None, True, True)

# A pivot at the origin that turns the whole character.
pivot = bpy.data.objects.new("pivot", None); scene.collection.objects.link(pivot)
arm.parent = pivot

def world_box(frame):
    scene.frame_set(frame); dg = bpy.context.evaluated_depsgraph_get()
    ev = mesh.evaluated_get(dg); m = ev.matrix_world
    pts = [m @ v.co for v in ev.to_mesh().vertices]; ev.to_mesh_clear()
    return pts

# Sample frames, measure the whole animation (with the character turned to face +X) so nothing leaves the picture.
pivot.rotation_euler = (0, 0, math.radians(front_offset))
frames = [round(f0 + (f1 - f0) * i / max(1, nframes - 1)) for i in range(nframes)]
boxes = {}
for f in frames:
    pts = world_box(f); boxes[f] = pts
allz = [p.z for f in frames for p in boxes[f]]
ground = min(p.z for p in boxes[frames[0]])
H = max(p.z for p in boxes[frames[0]]) - ground
# Keep it in place: per frame, the centre of its footprint (horizontal), relative to the pivot.
centres = {f: (sum(p.x for p in boxes[f]) / len(boxes[f]), sum(p.y for p in boxes[f]) / len(boxes[f])) for f in frames}
reach = max(max(math.hypot(p.x - centres[f][0], p.y - centres[f][1]) for p in boxes[f]) for f in frames)
top = max(allz) - ground
print("[anim] frames", frames, "height", round(H, 3), "reach", round(reach, 3), "top", round(top, 3))

cam_d = bpy.data.cameras.new("cam"); cam_d.type = "ORTHO"
cam = bpy.data.objects.new("cam", cam_d); scene.collection.objects.link(cam); scene.camera = cam
el = math.radians(30); D = 30
span = max(top * 1.15, reach * 2.3); cam_d.ortho_scale = span
def light(energy, color, frm, angle):
    d = bpy.data.lights.new("sun" + str(energy), "SUN"); d.energy = energy; d.color = color; d.angle = angle
    o = bpy.data.objects.new(d.name, d); o.rotation_euler = (-Vector(frm)).to_track_quat("-Z", "Y").to_euler(); scene.collection.objects.link(o)
light(4.0, (0.95, 0.92, 1.0), (0.35, 1.0, 1.15), 0.35)
light(1.3, (0.6, 0.55, 1.0), (1.0, 0.15, 0.5), 0.8)
light(4.0, (0.78, 0.42, 1.0), (-1.0, -1.0, 0.7), 0.25)
world = bpy.data.worlds.new("w"); scene.world = world; world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.03, 0.02, 0.06, 1); world.node_tree.nodes["Background"].inputs[1].default_value = 0.6
scene.render.engine = "CYCLES"; scene.cycles.device = "CPU"; scene.cycles.samples = samples; scene.cycles.use_denoising = True
scene.render.film_transparent = True; scene.render.resolution_x = px; scene.render.resolution_y = px
scene.render.image_settings.file_format = "PNG"; scene.render.image_settings.color_mode = "RGBA"

dirs = 8; meta = None
for d in range(dirs):
    ang = math.radians(front_offset + d * 360 / dirs)
    pivot.rotation_euler = (0, 0, ang)
    for i, f in enumerate(frames):
        scene.frame_set(f)
        # Footprint centre for this frame, turned with the pivot (it was measured at front_offset).
        cx, cy = centres[f]; r = ang - math.radians(front_offset)
        tx, ty = cx * math.cos(r) - cy * math.sin(r), cx * math.sin(r) + cy * math.cos(r)
        cam.location = (tx + math.cos(el) / math.sqrt(2) * D, ty + math.cos(el) / math.sqrt(2) * D, ground + span * 0.42 + math.sin(el) * D)
        cam.rotation_euler = (Vector((tx, ty, ground + span * 0.42)) - cam.location).to_track_quat("-Z", "Y").to_euler()
        bpy.context.view_layer.update()
        if meta is None:
            foot = world_to_camera_view(scene, cam, Vector((tx, ty, ground))); head = world_to_camera_view(scene, cam, Vector((tx, ty, ground + H)))
            meta = { "dirs": dirs, "frames": len(frames), "cell": px, "anchorX": foot.x, "anchorY": 1 - foot.y, "heightPx": (head.y - foot.y) * px, "modelHeight": H, "frontOffsetDeg": front_offset, "sourceFrames": frames }
        scene.render.filepath = os.path.join(out, f"d{d}_f{i:02d}.png")
        bpy.ops.render.render(write_still=True)
    print("[anim] direction", d)
json.dump(meta, open(os.path.join(out, "meta.json"), "w"), indent=1)
print("[anim] meta", meta)
