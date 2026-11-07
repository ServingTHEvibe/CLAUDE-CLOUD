"""Steps 2-3 on the sample product: amber glass candle jar, 10.5 cm tall."""
import math, sys, bpy, bmesh
OUT = sys.argv[1]
bpy.ops.wm.open_mainfile(filepath=OUT + "/../product_studio.blend")
sc = bpy.context.scene
col = sc.collection

def link(o): col.objects.link(o); return o
def smooth(o):
    bpy.context.view_layer.objects.active = o; o.select_set(True)
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(40)); o.select_set(False)
def bevel(o, w):
    m = o.modifiers.new("Bevel", "BEVEL"); m.width = w; m.segments = 3
    m.limit_method = "ANGLE"; m.angle_limit = math.radians(30)

product = link(bpy.data.objects.new("Product", None))
product.empty_display_type = "PLAIN_AXES"; product.empty_display_size = 6

# --- body: open-top glass jar, r 4.2, h 8.9 ---
bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=4.2, depth=8.9, location=(0, 0, 4.45))
body = bpy.context.active_object; body.name = "Product_Body"
bm = bmesh.new(); bm.from_mesh(body.data)
top = max(bm.faces, key=lambda f: f.calc_center_median().z)
bmesh.ops.delete(bm, geom=[top], context="FACES"); bm.to_mesh(body.data); bm.free()
s = body.modifiers.new("Glass", "SOLIDIFY"); s.thickness = 0.3; s.offset = -1
bevel(body, 0.12); smooth(body)

# --- wax fill ---
bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=3.88, depth=6.6, location=(0, 0, 0.3 + 3.3))
wax = bpy.context.active_object; wax.name = "Product_Wax"; bevel(wax, 0.08); smooth(wax)

# --- lid: r 4.35, h 1.6, sits on top -> total 10.5 cm ---
bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=4.35, depth=1.6, location=(0, 0, 8.9 + 0.8))
lid = bpy.context.active_object; lid.name = "Product_Lid"; bevel(lid, 0.18); smooth(lid)

# --- label: arc strip, 60% of circumference, UVs matched to label aspect (no stretch) ---
R, COVER, Z0, Z1, N = 4.23, 0.60, 2.6, 6.1, 96
theta = math.pi * COVER
mesh = bpy.data.meshes.new("Label"); bm = bmesh.new(); uv = bm.loops.layers.uv.new()
cols = []
for i in range(N + 1):
    a = -theta + 2 * theta * i / N
    x, y = R * math.sin(a), -R * math.cos(a)
    cols.append((bm.verts.new((x, y, Z0)), bm.verts.new((x, y, Z1)), i / N))
for (b0, t0, u0), (b1, t1, u1) in zip(cols, cols[1:]):
    f = bm.faces.new((b0, b1, t1, t0))
    for loop, (u, v) in zip(f.loops, ((u0, 0), (u1, 0), (u1, 1), (u0, 1))):
        loop[uv].uv = (u, v)
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
for f in bm.faces:  # make sure normals point outward
    c = f.calc_center_median()
    if f.normal.x * c.x + f.normal.y * c.y < 0: f.normal_flip()
bm.to_mesh(mesh); bm.free()
for p in mesh.polygons: p.use_smooth = True
label = link(bpy.data.objects.new("Product_Label", mesh))
print("label arc", round(2 * theta * R, 2), "x", Z1 - Z0, "cm  aspect", round(2 * theta * R / (Z1 - Z0), 3), "(image 1823x400 = 4.558)")

for o in (body, wax, lid, label): o.parent = product
target = bpy.data.objects["Product_Target"]; target.location.z = 5.25

# --- camera to product height ---
cam = sc.camera
def place(deg, dist, z, lens):
    a = math.radians(deg); cam.location = (dist * math.sin(a), -dist * math.cos(a), z); cam.data.lens = lens

def render(name, samples=48):
    sc.render.engine = "CYCLES"; sc.cycles.device = "CPU"; sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.render.image_settings.media_type = "IMAGE"; sc.render.image_settings.file_format = "PNG"
    sc.render.filepath = f"{OUT}/{name}.png"; bpy.ops.render.render(write_still=True)

# STEP 2: clay renders (no materials yet) - front and three-quarter
place(0, 80, 5.25, 135); render("step2_front_clay", 24)
place(40, 50, 11, 85); render("step2_threequarter_clay", 24)

# STEP 3: materials
def principled(name, **v):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes["Principled BSDF"]
    for k, val in v.items(): b.inputs[k].default_value = val
    noise = nt.nodes.new("ShaderNodeTexNoise"); noise.inputs["Scale"].default_value = 180
    bump = nt.nodes.new("ShaderNodeBump"); bump.inputs["Strength"].default_value = 0.03
    nt.links.new(noise.outputs["Fac"], bump.inputs["Height"]); nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    return m, nt, b

glass, _, _ = principled("Amber_Glass", **{"Base Color": (0.85, 0.42, 0.12, 1), "Transmission Weight": 1.0,
                                          "Roughness": 0.06, "IOR": 1.5})
try: glass.surface_render_method = "BLENDED"
except Exception: pass
waxm, _, _ = principled("Soy_Wax", **{"Base Color": (0.93, 0.88, 0.78, 1), "Roughness": 0.55,
                                      "Subsurface Weight": 0.25, "Subsurface Radius": (0.4, 0.3, 0.2)})
lidm, _, _ = principled("Matte_Black_Lid", **{"Base Color": (0.025, 0.025, 0.025, 1), "Roughness": 0.45,
                                              "Metallic": 0.3})
labm, nt, b = principled("Label_Paper", **{"Roughness": 0.6})
tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = bpy.data.images.load(OUT + "/label.png")
tex.extension = "CLIP"; nt.links.new(tex.outputs["Color"], b.inputs["Base Color"])
for o, m in ((body, glass), (wax, waxm), (lid, lidm), (label, labm)): o.data.materials.append(m)

try:
    sc.eevee.use_raytracing = True; sc.eevee.use_shadows = True
except Exception: pass

place(25, 48, 9, 85); render("step3_materials_hero", 64)

# leave camera in spin position and Eevee as the scene engine for the user's machine
place(0, 48, 8, 85)
for e in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
    try: sc.render.engine = e; break
    except TypeError: pass
bpy.ops.wm.save_as_mainfile(filepath=OUT + "/sample_candle.blend")
print("dims", [tuple(round(v, 2) for v in o.dimensions) for o in (body, lid)],
      "lid top z", round(lid.location.z + 0.8, 2))
