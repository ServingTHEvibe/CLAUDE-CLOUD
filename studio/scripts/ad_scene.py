"""Step 5: put the vending machine in an office break room, morning light, 8 s push-in + light sweep."""
import math, sys, bpy
out, mode = sys.argv[1], sys.argv[2]
bpy.ops.wm.open_mainfile(filepath=out + "/vending_machine_swing.blend")
sc = bpy.context.scene; col = sc.collection
P = bpy.data.objects["Product"]; P.animation_data_clear(); P.rotation_euler = (0, 0, 0)
cam = sc.camera; cam.animation_data_clear()
for n in ("Cyc_Backdrop", "Key_Left", "Rim_Back", "Fill_Right"):
    bpy.data.objects[n].hide_render = True; bpy.data.objects[n].hide_viewport = True

def M(name, color, rough=0.5, metal=0.0, trans=0.0, emit=None, estr=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1); b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal; b.inputs["Transmission Weight"].default_value = trans
    if emit: b.inputs["Emission Color"].default_value = (*emit, 1); b.inputs["Emission Strength"].default_value = estr
    return m
def box(name, x0, x1, y0, y1, z0, z1, m, bev=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=((x0+x1)/2, (y0+y1)/2, (z0+z1)/2))
    o = bpy.context.active_object; o.name = name; o.scale = (x1-x0, y1-y0, z1-z0)
    bpy.ops.object.transform_apply(scale=True)
    if bev:
        b = o.modifiers.new("Bevel", "BEVEL"); b.width = bev; b.segments = 3; b.limit_method = "ANGLE"
    o.data.materials.append(m); return o
def cyl(name, r, z0, z1, x, y, m, verts=48, bev=0.0):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=z1-z0, location=(x, y, (z0+z1)/2))
    o = bpy.context.active_object; o.name = name; o.data.materials.append(m)
    if bev:
        b = o.modifiers.new("Bevel", "BEVEL"); b.width = bev; b.segments = 3; b.limit_method = "ANGLE"
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(40)); return o

# ---- floor: light oak planks ----
floor = box("Floor", -500, 500, -700, 60, -1, 0, M("tmp", (1, 1, 1)))
fm = bpy.data.materials.new("Oak_Planks"); fm.use_nodes = True; nt = fm.node_tree
b = nt.nodes["Principled BSDF"]; b.inputs["Roughness"].default_value = 0.38
br = nt.nodes.new("ShaderNodeTexBrick"); br.inputs["Scale"].default_value = 1.0
br.inputs["Brick Width"].default_value = 120; br.inputs["Row Height"].default_value = 18
br.inputs["Mortar Size"].default_value = 0.25; br.offset = 0.37
br.inputs["Color1"].default_value = (0.62, 0.45, 0.28, 1); br.inputs["Color2"].default_value = (0.55, 0.38, 0.22, 1)
br.inputs["Mortar"].default_value = (0.3, 0.2, 0.12, 1)
tc = nt.nodes.new("ShaderNodeTexCoord"); mp = nt.nodes.new("ShaderNodeMapping")
mp.inputs["Rotation"].default_value = (0, 0, math.radians(90))
wave = nt.nodes.new("ShaderNodeTexWave"); wave.inputs["Scale"].default_value = 0.08
wave.inputs["Distortion"].default_value = 6; wave.inputs["Detail"].default_value = 4
mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"; mix.blend_type = "MULTIPLY"
mix.inputs["Factor"].default_value = 0.18
L = nt.links.new
L(tc.outputs["Object"], mp.inputs["Vector"]); L(mp.outputs["Vector"], br.inputs["Vector"])
L(mp.outputs["Vector"], wave.inputs["Vector"])
L(br.outputs["Color"], mix.inputs["A"]); L(wave.outputs["Color"], mix.inputs["B"])
L(mix.outputs["Result"], b.inputs["Base Color"])
floor.data.materials[0] = fm

# ---- walls ----
WALL = M("Wall_Sage", (0.48, 0.53, 0.46), 0.85)
TRIM = M("Trim_White", (0.85, 0.85, 0.82), 0.4)
box("Back_Wall", -500, 500, 50, 60, 0, 300, WALL)
box("Baseboard_Back", -500, 500, 47, 50, 0, 10, TRIM)
# left wall with a window (opening y -230..-60, z 90..235)
WX = -280
for n, y0, y1, z0, z1 in (("A", -700, -230, 0, 300), ("B", -60, 60, 0, 300),
                          ("C", -230, -60, 0, 90), ("D", -230, -60, 235, 300)):
    box(f"Left_Wall_{n}", WX - 10, WX, y0, y1, z0, z1, WALL)
box("Baseboard_Left", WX, WX + 3, -700, 50, 0, 10, TRIM)
for n, a in (("Sill", (WX, WX + 14, -236, -54, 84, 90)), ("Head", (WX, WX + 4, -236, -54, 235, 241)),
             ("JambA", (WX, WX + 4, -236, -230, 90, 235)), ("JambB", (WX, WX + 4, -60, -54, 90, 235)),
             ("Mullion", (WX - 6, WX - 3, -147, -143, 90, 235))):
    box(f"Window_{n}", *a, TRIM)

# ---- right: counter with coffee maker + mugs ----
CAB = M("Cabinet_White", (0.82, 0.83, 0.82), 0.35)
TOPM = M("Counter_Quartz", (0.2, 0.2, 0.21), 0.2)
box("Counter_Base", 105, 330, -12, 47, 10, 88, CAB, 0.4)
box("Counter_Kick", 107, 328, -6, 47, 0, 10, M("Kick", (0.05, 0.05, 0.05), 0.6))
box("Counter_Top", 102, 335, -16, 50, 88, 92, TOPM, 0.3)
for i, x in enumerate((106, 180, 255)):
    box(f"Door_Gap_{i}", x + 72, x + 73, -12.3, -12, 12, 86, M("Gap", (0.3, 0.3, 0.3), 0.6))
box("Coffee_Maker", 200, 232, 10, 38, 92, 132, M("Coffee_Black", (0.02, 0.02, 0.02), 0.3, 0.3), 1.5)
cyl("Coffee_Pot", 7, 92, 108, 216, 4, M("Pot_Glass", (0.25, 0.12, 0.05), 0.05, trans=0.8))
MUG = M("Mug_White", (0.9, 0.9, 0.88), 0.2)
cyl("Mug_A", 4.2, 92, 102, 160, 0, MUG, bev=0.3); cyl("Mug_B", 4.2, 92, 102, 172, 8, M("Mug_Teal", (0.1, 0.45, 0.45), 0.25), bev=0.3)

# ---- left: plant between machine and window ----
cyl("Planter", 18, 0, 38, -110, 20, M("Planter_Terracotta", (0.55, 0.27, 0.16), 0.7), bev=0.8)
LEAF = M("Snake_Leaf", (0.06, 0.24, 0.07), 0.35)
import random; random.seed(7)
for i in range(16):
    h = random.uniform(55, 95)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0))
    lf = bpy.context.active_object; lf.name = f"Snake_Leaf_{i}"
    me = lf.data
    for v in me.vertices:                      # blade: 7 cm wide at base, pointed tip
        v.co.x *= 7 * (1 - (v.co.z + 0.5) * 0.85); v.co.y *= 0.6; v.co.z = (v.co.z + 0.5) * h
    sub = lf.modifiers.new("Sub", "SUBSURF"); sub.levels = 2; sub.render_levels = 2
    lf.location = (-110 + random.uniform(-9, 9), 20 + random.uniform(-9, 9), 34)
    lf.rotation_euler = (random.uniform(-0.25, 0.25), random.uniform(-0.25, 0.25), random.uniform(0, 3.14))
    lf.data.materials.append(LEAF); bpy.ops.object.shade_smooth()
cyl("Soil", 16.5, 34, 36, -110, 20, M("Soil", (0.06, 0.04, 0.03), 0.9))

# ---- lighting: morning sun through the window + soft sky ----
sun_d = bpy.data.lights.new("Morning_Sun", "SUN"); sun_d.energy = 6.0; sun_d.angle = math.radians(2.5)
sun_d.color = (1.0, 0.86, 0.68)
sun = bpy.data.objects.new("Morning_Sun", sun_d); col.objects.link(sun)
from mathutils import Vector
sun.rotation_euler = Vector((0.8, 0.3, -0.38)).normalized().to_track_quat("-Z", "Y").to_euler()
box("Ceiling", -500, 500, -700, 60, 300, 310, TRIM)
w = sc.world.node_tree.nodes["Background"]
w.inputs["Color"].default_value = (0.72, 0.82, 1.0, 1); w.inputs["Strength"].default_value = 0.55
cl = bpy.data.lights.new("Ceiling_Panel", "AREA"); cl.shape = "RECTANGLE"; cl.size, cl.size_y = 120, 60
cl.energy = 9e5; cl.color = (1.0, 0.97, 0.92)
co = bpy.data.objects.new("Ceiling_Panel", cl); col.objects.link(co); co.location = (0, -150, 298)

# ---- camera: 50 mm, slow push-in, DoF on the machine ----
FR = 240; sc.frame_start, sc.frame_end = 1, FR
focus = bpy.data.objects.new("Focus_Front", None); col.objects.link(focus); focus.location = (0, -46, 100)
tgt = bpy.data.objects["Product_Target"]; tgt.location = (0, 0, 95)
cam.data.lens = 50; cam.data.dof.use_dof = True; cam.data.dof.focus_object = focus; cam.data.dof.aperture_fstop = 2.0 * sc.unit_settings.scale_length  # f/2 at real scale
for f, y in ((1, -540), (FR, -410)):
    cam.location = (25 * (y + 540) / 130 * 0 + 30, y, 118 - (y + 540) * 0.05)
    cam.keyframe_insert("location", frame=f)

# ---- light sweep across the glass front, last ~2 s ----
sw = bpy.data.lights.new("Sweep_Strip", "AREA"); sw.shape = "RECTANGLE"; sw.size, sw.size_y = 12, 260
sw.energy = 2.5e5; sw.color = (1, 1, 1)

so = bpy.data.objects.new("Sweep_Strip", sw); col.objects.link(so); so.visible_camera = False
so.rotation_euler = (math.radians(90), 0, 0)          # faces +Y, toward the machine
for f, x, e in ((1, -260, 0), (170, -260, 0), (180, -220, 2.5e5), (232, 200, 2.5e5), (240, 240, 0)):
    so.location = (x, -260, 120); so.keyframe_insert("location", frame=f)
    sw.energy = e; sw.keyframe_insert("energy", frame=f)

bpy.ops.wm.save_as_mainfile(filepath=out + "/vending_ad_breakroom.blend")
sc.render.engine = "CYCLES"; sc.cycles.device = "CPU"; sc.cycles.use_denoising = True
sc.cycles.seed = 0; sc.cycles.use_animated_seed = False; sc.render.use_persistent_data = True
s = sc.render.image_settings
if mode == "stills":
    sc.cycles.samples = 32; s.media_type = "IMAGE"; s.file_format = "PNG"
    for f in [int(x) for x in sys.argv[3].split(",")]:
        sc.frame_set(f); sc.render.filepath = f"{out}/ad_breakroom_f{f:04d}.png"
        bpy.ops.render.render(write_still=True)
else:
    sc.cycles.samples = 10; s.media_type = "VIDEO"; s.file_format = "FFMPEG"
    ff = sc.render.ffmpeg; ff.format = "MPEG4"; ff.codec = "H264"
    ff.constant_rate_factor = "HIGH"; ff.ffmpeg_preset = "GOOD"; ff.audio_codec = "NONE"
    sc.render.filepath = sys.argv[3]; bpy.ops.render.render(animation=True); print("DONE")
