# tools/render-sprite.py: pre-render a detailed character (e.g. a Meshy .glb) from 16 directions at Undercity's camera
# angle, for the hero sprite (sandbox/art/hero-wraith.webp). Run with Blender:
#   blender --background --factory-startup --python tools/render-sprite.py -- <model.glb> <out_dir> 320 24
# then pack the 16 frames (f00-f15.png) into a 4 x 4 sheet of 224 px cells and update HERO_SPRITE in sandbox/neon-arpg.js
# with anchorY / heightPx from out_dir/meta.json (heightPx scaled by 224 / 320).
# Blender (headless): pre-render a high-detail character from 16 directions at the dungeon crawler's camera angle.
#   blender --background --factory-startup --python render_wraith.py -- <in.glb> <out_dir> <frame_px> <samples> [front_offset_deg]
import bpy, sys, math, os, json
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
args = sys.argv[sys.argv.index("--") + 1:]
src, out, px, samples = args[0], args[1], int(args[2]), int(args[3])
front_offset = float(args[4]) if len(args) > 4 else 90.0      # turn the model so its front faces +X (Meshy fronts face -Y)
os.makedirs(out, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
obj = [o for o in bpy.context.scene.objects if o.type == "MESH"][0]
bpy.context.view_layer.objects.active = obj
for o in bpy.context.scene.objects: o.select_set(o == obj)
# Weld, then reduce to a still-detailed mesh (plenty for a 300 px render, much faster to render).
bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT"); bpy.ops.mesh.remove_doubles(threshold=0.0004); bpy.ops.object.mode_set(mode="OBJECT")
mod = obj.modifiers.new("Decimate", "DECIMATE"); mod.decimate_type = "COLLAPSE"; mod.ratio = 0.08
bpy.ops.object.modifier_apply(modifier=mod.name)
bpy.ops.object.shade_smooth()
print("[render] triangles:", sum(len(p.vertices) - 2 for p in obj.data.polygons))
# Feet on the ground at the origin.
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
vs = [v.co for v in obj.data.vertices]
minz, maxz = min(v.z for v in vs), max(v.z for v in vs)
cx, cy = (min(v.x for v in vs) + max(v.x for v in vs)) / 2, (min(v.y for v in vs) + max(v.y for v in vs)) / 2
obj.location = (-cx, -cy, -minz); bpy.ops.object.transform_apply(location=True)
H = maxz - minz
pivot = bpy.data.objects.new("pivot", None); bpy.context.scene.collection.objects.link(pivot)
obj.parent = pivot

scene = bpy.context.scene
# The game's camera: 2:1 isometric (dimetric), looking from map direction (+x, +y), 30 degrees above the floor.
cam_d = bpy.data.cameras.new("cam"); cam_d.type = "ORTHO"; cam_d.ortho_scale = H * 1.55
cam = bpy.data.objects.new("cam", cam_d); scene.collection.objects.link(cam); scene.camera = cam
el = math.radians(30); D = 20
cam.location = (math.cos(el) / math.sqrt(2) * D, math.cos(el) / math.sqrt(2) * D, H * 0.48 + math.sin(el) * D)
tgt = bpy.data.objects.new("tgt", None); tgt.location = (0, 0, H * 0.48); scene.collection.objects.link(tgt)
c = cam.constraints.new("TRACK_TO"); c.target = tgt; c.track_axis = "TRACK_NEGATIVE_Z"; c.up_axis = "UP_Y"
# Lighting: a cool key from above-left, a soft fill, and a strong violet rim from behind (spectral glow).
def light(energy, color, frm, angle):
    d = bpy.data.lights.new("sun" + str(energy), "SUN"); d.energy = energy; d.color = color; d.angle = angle
    o = bpy.data.objects.new(d.name, d); o.rotation_euler = (-Vector(frm)).to_track_quat("-Z", "Y").to_euler(); scene.collection.objects.link(o); return o
light(4.2, (0.95, 0.92, 1.0), (0.35, 1.0, 1.15), 0.35)      # key: from the camera's side, above and a little left
light(1.3, (0.6, 0.55, 1.0), (1.0, 0.15, 0.5), 0.8)          # fill: from the right
light(4.5, (0.78, 0.42, 1.0), (-1.0, -1.0, 0.7), 0.25)       # violet rim: from behind
world = bpy.data.worlds.new("w"); scene.world = world; world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.03, 0.02, 0.06, 1); world.node_tree.nodes["Background"].inputs[1].default_value = 0.6
scene.render.engine = "CYCLES"; scene.cycles.device = "CPU"; scene.cycles.samples = samples; scene.cycles.use_denoising = True
scene.render.film_transparent = True; scene.render.resolution_x = px; scene.render.resolution_y = px
scene.render.image_settings.file_format = "PNG"; scene.render.image_settings.color_mode = "RGBA"
scene.view_settings.view_transform = "AgX" if "AgX" in [v.identifier for v in type(scene.view_settings).bl_rna.properties["view_transform"].enum_items] else "Filmic"

# Where the feet and the top of the hood land in the picture (so the game can place and size the sprite).
bpy.context.view_layer.update()
foot = world_to_camera_view(scene, cam, Vector((0, 0, 0))); top = world_to_camera_view(scene, cam, Vector((0, 0, H)))
meta = { "frames": 16, "cell": px, "anchorX": foot.x, "anchorY": 1 - foot.y, "heightPx": (top.y - foot.y) * px, "modelHeight": H, "frontOffsetDeg": front_offset }
for k in range(16):
    pivot.rotation_euler = (0, 0, math.radians(front_offset + k * 22.5))     # frame k: the hero faces map angle k * 22.5 degrees
    scene.render.filepath = os.path.join(out, f"f{k:02d}.png")
    bpy.ops.render.render(write_still=True)
    print("[render] frame", k)
json.dump(meta, open(os.path.join(out, "meta.json"), "w"), indent=1)
print("[render] meta", meta)
