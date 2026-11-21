# tools/spider-walk.py: give a rigged spider (no animations, e.g. the owner's Meshy lava spider) a looping 8-leg walk,
# then save it as a .glb with an animation named "Walking", ready for tools/render-hero-anims.py. Run with Blender:
#   blender --background --factory-startup --python tools/spider-walk.py -- <in.glb> <out.glb> [frames]
# Gait: alternating tetrapod (legs L1 R2 L3 R4 move together, then R1 L2 R3 L4). Each leg's first bone swings forward
# while lifting, then pushes back on the ground; the body bobs twice per cycle. Leg roots are found automatically:
# chains from the body whose tip reaches out sideways (the 8 longest side chains).
import bpy, sys, math
from mathutils import Vector, Quaternion, Matrix
args = sys.argv[sys.argv.index("--") + 1:]
src, out = args[0], args[1]
N = int(args[2]) if len(args) > 2 else 8
SWING, LIFT, BOB = math.radians(24), math.radians(22), 0.045

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
arm = next(o for o in bpy.context.scene.objects if o.type == "ARMATURE")
bones = arm.data.bones

def chain_tip(b):
    while b.children: b = max(b.children, key=lambda c: len(c.children_recursive))
    return b
# The body = the bone with the most direct children; legs = its children whose chain ends far out to the side.
body = max(bones, key=lambda b: len(b.children))
cands = []
for c in body.children:
    tip = chain_tip(c); h = c.head_local; t = tip.tail_local
    side = math.hypot(t.x - h.x, t.y - h.y)
    if abs(t.x) > 0.2: cands.append((side, c, t))           # legs reach out sideways (not the abdomen or fangs)
legs = [c for side, c, t in sorted(cands, key=lambda x: -x[0])[:8]]
print("[spider] body", body.name, "legs", [l.name for l in legs])
# Front = the direction the head/fangs point (-Y for Meshy). Order each side front to back.
def tip_of(l): return chain_tip(l).tail_local
left = sorted([l for l in legs if tip_of(l).x < 0], key=lambda l: tip_of(l).y)
right = sorted([l for l in legs if tip_of(l).x >= 0], key=lambda l: tip_of(l).y)
groupA = set(b.name for b in left[0::2] + right[1::2])     # L1 L3 R2 R4
print("[spider] left", [b.name for b in left], "right", [b.name for b in right], "group A", sorted(groupA))

bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode="POSE")
act = bpy.data.actions.new("Walking")
arm.animation_data_create(); arm.animation_data.action = act
scene = bpy.context.scene; scene.frame_start = 1; scene.frame_end = N + 1

def to_local(bone, q_arm):
    """A rotation given in armature space, as the bone's own pose rotation (parents unposed)."""
    B = bone.matrix_local.to_3x3().to_quaternion()
    return B.inverted() @ q_arm @ B

for f in range(N + 1):
    ph = f / N
    for l in legs:
        pb = arm.pose.bones[l.name]; pb.rotation_mode = "QUATERNION"
        p = ph if l.name in groupA else (ph + 0.5) % 1.0
        h, t = l.head_local, tip_of(l)
        d = Vector((t.x - h.x, t.y - h.y, 0)).normalized()
        sign = -1 if t.x >= 0 else 1                            # turning the tip toward -Y (forward)
        swing = sign * SWING * math.sin(2 * math.pi * p)
        lift = LIFT * max(0.0, math.cos(2 * math.pi * p))       # lifted while it swings forward
        axis_lift = Vector((0, 0, 1)).cross(d).normalized()
        q = Quaternion(Vector((0, 0, 1)), swing) @ Quaternion(axis_lift, -lift)
        pb.rotation_quaternion = to_local(l, q)
        pb.keyframe_insert("rotation_quaternion", frame=f + 1)
    # Body bob (two dips per cycle) on the root bone.
    root = next(b for b in bones if b.parent is None); pr = arm.pose.bones[root.name]
    dz = BOB * (0.5 - 0.5 * math.cos(4 * math.pi * ph))
    pr.location = root.matrix_local.to_3x3().inverted() @ Vector((0, 0, dz))
    pr.keyframe_insert("location", frame=f + 1)
bpy.ops.object.mode_set(mode="OBJECT")
bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", export_animations=True, export_image_format="AUTO")
print("[spider] wrote", out)
