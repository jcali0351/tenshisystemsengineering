# tools/fbx-to-glb.py: turn a Meshy/Mixamo .fbx download (model + separate texture PNGs) into one .glb with the textures
# wired in and its animation named, ready for tools/render-hero-anims.py. Run with Blender:
#   blender --background --factory-startup --python tools/fbx-to-glb.py -- <in.fbx> <out.glb> <anim_name> <color.png> [normal.png] [roughness.png] [metallic.png]
import bpy, sys, os
args = sys.argv[sys.argv.index("--") + 1:]
src, out, anim_name, color = args[0], args[1], args[2], args[3]
normal = args[4] if len(args) > 4 else None
rough = args[5] if len(args) > 5 else None
metal = args[6] if len(args) > 6 else None

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=src)
arm = next(o for o in bpy.context.scene.objects if o.type == "ARMATURE")
meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
if arm.animation_data and arm.animation_data.action:
    arm.animation_data.action.name = anim_name

mat = bpy.data.materials.new("Body"); mat.use_nodes = True; nt = mat.node_tree
bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
def tex(path, noncolor=False):
    n = nt.nodes.new("ShaderNodeTexImage"); n.image = bpy.data.images.load(path)
    if noncolor: n.image.colorspace_settings.name = "Non-Color"
    return n
nt.links.new(tex(color).outputs["Color"], bsdf.inputs["Base Color"])
if rough and os.path.exists(rough): nt.links.new(tex(rough, True).outputs["Color"], bsdf.inputs["Roughness"])
if metal and os.path.exists(metal): nt.links.new(tex(metal, True).outputs["Color"], bsdf.inputs["Metallic"])
if normal and os.path.exists(normal):
    nm = nt.nodes.new("ShaderNodeNormalMap"); nt.links.new(tex(normal, True).outputs["Color"], nm.inputs["Color"]); nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
for m in meshes:
    m.data.materials.clear(); m.data.materials.append(mat)

bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", export_animations=True, export_image_format="JPEG", export_jpeg_quality=92)
print("[fbx2glb] wrote", out)
