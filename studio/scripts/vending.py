"""Step 2-3: glass-front drink vending machine at real size (183 x 120 x 89 cm).
Measured from the user's photo: px -> cm via X=(px-440)*0.15, Z=(1250-py)*0.148."""
import math, sys, bpy, bmesh
OUT, STUDIO = sys.argv[1], sys.argv[2]
STAGE = sys.argv[3] if len(sys.argv) > 3 else "all"
bpy.ops.wm.open_mainfile(filepath=STUDIO)
sc = bpy.context.scene; col = sc.collection
X = lambda px: (px - 440) * 0.15
Z = lambda py: (1250 - py) * 0.148

# ---------- rescale the studio for a 183 cm product ----------
cyc = bpy.data.objects["Cyc_Backdrop"]; cyc.scale = (3, 3, 3)
tgt = bpy.data.objects["Product_Target"]; tgt.location = (0, 0, 92)
key, rim = bpy.data.objects["Key_Left"], bpy.data.objects["Rim_Back"]
key.location = (-330, -280, 300); key.data.size = 450; key.data.energy = 2.4e6
rim.location = (170, 300, 230); rim.data.size, rim.data.size_y = 30, 450; rim.data.energy = 9e5
fd = bpy.data.lights.new("Fill_Right", "AREA"); fd.size = 400; fd.energy = 6e5
fill = bpy.data.objects.new("Fill_Right", fd); col.objects.link(fill); fill.location = (330, -320, 140)
c = fill.constraints.new("TRACK_TO"); c.target = tgt; c.track_axis = "TRACK_NEGATIVE_Z"; c.up_axis = "UP_Y"
cam = sc.camera; cam.data.lens = 85; cam.data.clip_end = 5000

product = bpy.data.objects.new("Product", None); col.objects.link(product)
product.empty_display_size = 60

MATS = {}
def mat(name, color, rough=0.5, metal=0.0, trans=0.0, emit=None, estr=0.0, ior=1.45, coat=0.0):
    if name in MATS: return MATS[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough; b.inputs["Metallic"].default_value = metal
    b.inputs["Transmission Weight"].default_value = trans; b.inputs["IOR"].default_value = ior
    b.inputs["Coat Weight"].default_value = coat
    if emit:
        b.inputs["Emission Color"].default_value = (*emit, 1); b.inputs["Emission Strength"].default_value = estr
    if trans:
        try: m.surface_render_method = "BLENDED"
        except Exception: pass
    MATS[name] = m; return m

def box(name, x0, x1, y0, y1, z0, z1, m, bev=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=((x0+x1)/2, (y0+y1)/2, (z0+z1)/2))
    o = bpy.context.active_object; o.name = name; o.scale = (x1-x0, y1-y0, z1-z0)
    bpy.ops.object.transform_apply(scale=True)
    if bev:
        b = o.modifiers.new("Bevel", "BEVEL"); b.width = bev; b.segments = 3
        b.limit_method = "ANGLE"
    o.data.materials.append(m); o.parent = product; return o

BLACK = mat("Powder_Black", (0.012, 0.012, 0.014), 0.38, coat=0.2)
SILVER = mat("Brushed_Silver", (0.86, 0.87, 0.89), 0.28, 0.75)
FRAME = mat("Door_Frame_Grey", (0.62, 0.63, 0.65), 0.35, 0.6)
WHITE = mat("Interior_White", (0.9, 0.92, 0.95), 0.45, emit=(0.9, 0.95, 1.0), estr=0.35)
SHELF = mat("Shelf_Plastic", (0.9, 0.92, 0.95), 0.15, trans=0.6)
GLASS = mat("Front_Glass", (1, 1, 1), 0.01, trans=1.0, ior=1.5)
DARK = mat("Recess_Dark", (0.01, 0.01, 0.012), 0.6)

FRONT = -44.5            # cabinet front face
LEFT, RIGHT = X(40), X(835)
DOOR_L, DOOR_R = X(65), X(660)
WIN_L, WIN_R, WIN_B, WIN_T = X(95), X(630), Z(920), Z(130)
TOP, FOOT = Z(15), Z(1180)
BACKWALL = -14.0          # display cavity is 30 cm deep

# cabinet shell (leaves a lit cavity behind the glass)
box("Cabinet_Back", LEFT, RIGHT, BACKWALL, 44.5, FOOT, TOP, BLACK, 0.6)
box("Cabinet_RightBlock", DOOR_R, RIGHT, FRONT, BACKWALL, FOOT, TOP, BLACK, 0.6)
box("Cabinet_LeftWall", LEFT, DOOR_L, FRONT, BACKWALL, FOOT, TOP, BLACK, 0.6)
box("Cabinet_Top", DOOR_L, DOOR_R, FRONT, BACKWALL, Z(45), TOP, BLACK)
box("Cabinet_Bottom", DOOR_L, DOOR_R, FRONT, BACKWALL, FOOT, WIN_B, BLACK)
# feet
for n, (a, b) in (("L", (X(50), X(130))), ("R", (X(745), X(830)))):
    box(f"Foot_{n}", a, b, -40, 40, 0, FOOT, BLACK, 0.4)

# door frame around the window (grey) + graphic panels
F0, F1 = FRONT - 1.2, FRONT
box("Door_Frame_L", DOOR_L, WIN_L, F0, F1, Z(1150), Z(45), FRAME, 0.3)
box("Door_Frame_R", WIN_R, DOOR_R, F0, F1, Z(1150), Z(45), FRAME, 0.3)
box("Door_Frame_Top", WIN_L, WIN_R, F0, F1, WIN_T, Z(45), FRAME)
box("Door_Frame_Bot", WIN_L, WIN_R, F0, F1, Z(1150), WIN_B, FRAME)

def graphic(name, z0, z1, deep, light, center_z):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree
    b = nt.nodes["Principled BSDF"]; b.inputs["Roughness"].default_value = 0.2
    tc = nt.nodes.new("ShaderNodeTexCoord"); mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (1/42, 1, 1/22)
    gr = nt.nodes.new("ShaderNodeTexGradient"); gr.gradient_type = "SPHERICAL"
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (*deep, 1); ramp.color_ramp.elements[1].color = (*light, 1)
    noise = nt.nodes.new("ShaderNodeTexNoise"); noise.inputs["Scale"].default_value = 0.4
    mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"; mix.inputs["Factor"].default_value = 0.15
    L = nt.links.new
    L(tc.outputs["Object"], mp.inputs["Vector"]); L(mp.outputs["Vector"], gr.inputs["Vector"])
    L(gr.outputs["Fac"], ramp.inputs["Fac"]); L(ramp.outputs["Color"], mix.inputs["A"])
    L(noise.outputs["Color"], mix.inputs["B"]); L(mix.outputs["Result"], b.inputs["Base Color"])
    L(mix.outputs["Result"], b.inputs["Emission Color"]); b.inputs["Emission Strength"].default_value = 0.35
    o = box(name, X(105), X(620), F0 - 0.15, F0 + 0.05, z0, z1, m)
    o.matrix_parent_inverse.identity(); return o
graphic("Graphic_Bottom", Z(1145), Z(920), (0.01, 0.05, 0.3), (0.35, 0.7, 1.0), (Z(1145)+Z(920))/2)
graphic("Graphic_Top", Z(125), Z(45), (0.25, 0.45, 0.75), (0.85, 0.93, 1.0), (Z(125)+Z(45))/2)

# glass + interior
box("Front_Glass", WIN_L, WIN_R, F0 + 0.2, F0 + 0.8, WIN_B, WIN_T, GLASS)
box("Interior_Back", DOOR_L, DOOR_R, BACKWALL - 0.5, BACKWALL, WIN_B, WIN_T, WHITE)
box("Interior_SideL", DOOR_L, DOOR_L + 0.5, FRONT, BACKWALL, WIN_B, WIN_T, WHITE)
box("Interior_SideR", DOOR_R - 0.5, DOOR_R, FRONT, BACKWALL, WIN_B, WIN_T, WHITE)
box("Interior_Ceiling", DOOR_L, DOOR_R, FRONT, BACKWALL, WIN_T - 0.5, WIN_T, WHITE)
box("Center_Post", X(313), X(330), FRONT + 0.5, BACKWALL, WIN_B, WIN_T, WHITE)
box("Delivery_Cup", X(332), X(402), FRONT + 1, FRONT + 9, Z(590), Z(485), WHITE, 0.4)
SHELVES = [Z(285), Z(455), Z(625), Z(795), WIN_B]
for i, z in enumerate(SHELVES):
    box(f"Shelf_{i}", DOOR_L, DOOR_R, FRONT + 0.5, BACKWALL, z - 1.0, z, SHELF, 0.2)
    box(f"Shelf_Lip_{i}", DOOR_L, DOOR_R, FRONT + 0.5, FRONT + 1.2, z, z + 3.0, SHELF)
# interior lighting: a strip under each shelf/ceiling, like a real machine
for i, z in enumerate([WIN_T - 1] + SHELVES[:4]):
    ld = bpy.data.lights.new(f"Shelf_Light_{i}", "AREA"); ld.shape = "RECTANGLE"
    ld.size, ld.size_y = 85, 6; ld.energy = 9000; ld.color = (0.92, 0.97, 1.0)
    lo = bpy.data.objects.new(f"Shelf_Light_{i}", ld); col.objects.link(lo)
    lo.location = ((DOOR_L + DOOR_R) / 2, FRONT + 4, z - 1.6); lo.parent = product

# ---------- bottles & cans (generic: colours from the photo, no brand logos) ----------
def lathe(name, prof):
    mesh = bpy.data.meshes.new(name); bm = bmesh.new()
    vs = [bm.verts.new((r, 0, z)) for r, z in prof]
    for a, b in zip(vs, vs[1:]): bm.edges.new((a, b))
    bmesh.ops.spin(bm, geom=bm.verts[:] + bm.edges[:], axis=(0, 0, 1), cent=(0, 0, 0),
                   angle=2 * math.pi, steps=40, use_duplicate=False)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.001)
    bm.to_mesh(mesh); bm.free()
    for p in mesh.polygons: p.use_smooth = True
    return mesh
BOTTLE = lathe("Bottle20oz", [(0, 0), (3.0, 0), (3.25, 0.6), (3.3, 2), (3.1, 3.5), (3.3, 5), (3.3, 13),
                              (3.0, 15.2), (1.7, 18.6), (1.35, 19.6), (1.35, 20.8), (0, 20.8)])
CAN = lathe("Can12oz", [(0, 0.4), (2.6, 0), (3.3, 0.9), (3.3, 11.2), (2.8, 12.1), (2.75, 12.3), (0, 12.2)])
def cyl(name, r, h):
    bpy.ops.mesh.primitive_cylinder_add(vertices=40, radius=r, depth=h, location=(0, 0, h / 2))
    o = bpy.context.active_object; me = o.data; bpy.data.objects.remove(o); me.name = name; return me
CAP, BAND = cyl("Cap", 1.55, 1.4), cyl("LabelBand", 3.36, 6.0)
for p in BAND.polygons: p.use_smooth = True

def liquid(c):  # translucent coloured plastic
    return mat(f"Liquid_{c}", c, 0.08, trans=0.85, ior=1.4)
COLS = [140, 198, 255, 303, 375, 432, 490, 548, 606]
C = {  # (liquid, label band, cap)
 "cola": ((0.08, 0.03, 0.01), (0.05, 0.25, 0.75), (0.1, 0.3, 0.8)),
 "colaR": ((0.08, 0.03, 0.01), (0.8, 0.05, 0.05), (0.85, 0.05, 0.05)),
 "pepper": ((0.12, 0.02, 0.02), (0.45, 0.05, 0.1), (0.95, 0.85, 0.2)),
 "citrus": ((0.25, 0.75, 0.05), (0.05, 0.4, 0.1), (0.95, 0.85, 0.15)),
 "lemlime": ((0.3, 0.85, 0.35), (0.1, 0.5, 0.15), (0.1, 0.6, 0.2)),
 "red": ((0.75, 0.05, 0.05), (0.9, 0.15, 0.1), (0.9, 0.9, 0.9)),
 "root": ((0.1, 0.04, 0.01), (0.55, 0.1, 0.05), (0.6, 0.1, 0.05)),
 "pink": ((0.85, 0.2, 0.3), (0.9, 0.5, 0.6), (0.9, 0.9, 0.9)),
 "milk": ((0.9, 0.88, 0.85), (0.2, 0.25, 0.6), (0.25, 0.3, 0.7)),
 "water": ((0.85, 0.92, 1.0), (0.1, 0.35, 0.8), (0.1, 0.35, 0.85)),
 "cafe": ((0.75, 0.65, 0.5), (0.95, 0.93, 0.88), (0.15, 0.1, 0.05)),
 "orange": ((0.95, 0.45, 0.05), (0.9, 0.3, 0.05), (0.95, 0.95, 0.95)),
 "yellow": ((0.95, 0.75, 0.05), (0.95, 0.6, 0.05), (0.2, 0.4, 0.85)),
 "lemon": ((0.9, 0.9, 0.5), (0.95, 0.95, 0.7), (0.2, 0.4, 0.85)),
 "grape": ((0.2, 0.03, 0.15), (0.4, 0.1, 0.4), (0.2, 0.4, 0.85)),
 "blue": ((0.1, 0.35, 0.95), (0.05, 0.1, 0.4), (0.05, 0.05, 0.05)),
 "white": ((0.9, 0.9, 0.85), (0.3, 0.6, 0.2), (0.9, 0.9, 0.9)),
 "tea": ((0.75, 0.55, 0.1), (0.95, 0.85, 0.2), (0.2, 0.5, 0.2)),
 "tea2": ((0.6, 0.35, 0.05), (0.9, 0.9, 0.3), (0.95, 0.85, 0.2)),
 "choc": ((0.25, 0.12, 0.05), (0.85, 0.75, 0.1), (0.1, 0.3, 0.8)),
}
ROWS = [  # A..E, 9 columns each (None = empty / hidden)
 ["cola", "cola", "cola", "colaR", "pepper", "citrus", "colaR", "colaR", "colaR"],
 ["citrus", "red", "root", "pink", "milk", "milk", "water", "root", "lemlime"],
 ["water", "water", "cafe", "cafe", None, "orange", "yellow", "lemon", "grape"],
 ["orange", "red", "yellow", "cola", "white", "can:blue", "orange", "lemlime", "blue"],
 ["tea", "tea2", "cola", "can:red", "can:silver", "can:green", "can:silver", "choc", "tea2"],
]
CANCOL = {"blue": (0.1, 0.25, 0.8), "red": (0.75, 0.05, 0.05), "silver": (0.75, 0.75, 0.78), "green": (0.2, 0.6, 0.15)}
count = 0
for r, row in enumerate(ROWS):
    base = SHELVES[r]
    for ci, kind in enumerate(row):
        if not kind: continue
        x = X(COLS[ci])
        for depth, y in enumerate((FRONT + 5.5, FRONT + 13.5, FRONT + 21.5)):
            if kind.startswith("can:"):
                o = bpy.data.objects.new(f"Can_{r}{ci}{depth}", CAN); col.objects.link(o)
                o.data.materials.clear() if False else None
                o.location = (x, y, base); o.parent = product
                o.material_slots  # noqa
                if not o.data.materials: o.data.materials.append(SILVER)
                o.material_slots[0].link = "OBJECT"
                o.material_slots[0].material = mat(f"Can_{kind[4:]}", CANCOL[kind[4:]], 0.25, 0.9)
                count += 1; continue
            liq, band, cap = C[kind]
            sz = 0.78 if kind == "cafe" else 1.0
            ob = bpy.data.objects.new(f"Bottle_{r}{ci}{depth}", BOTTLE); col.objects.link(ob)
            ob.location = (x, y, base); ob.scale = (1, 1, sz); ob.parent = product
            if not BOTTLE.materials: BOTTLE.materials.append(WHITE)
            ob.material_slots[0].link = "OBJECT"
            ob.material_slots[0].material = mat(f"Milk", liq, 0.3) if kind == "milk" else (
                mat("Cafe_Glass", liq, 0.1, trans=0.3) if kind == "cafe" else liquid(liq))
            cp = bpy.data.objects.new(f"Cap_{r}{ci}{depth}", CAP); col.objects.link(cp)
            cp.location = (x, y, base + 20.8 * sz + 0.7); cp.parent = product
            if not CAP.materials: CAP.materials.append(WHITE)
            cp.material_slots[0].link = "OBJECT"; cp.material_slots[0].material = mat(f"Cap_{cap}", cap, 0.4)
            if depth == 0 or True:
                bd = bpy.data.objects.new(f"Label_{r}{ci}{depth}", BAND); col.objects.link(bd)
                bd.location = (x, y, base + 9.5 * sz); bd.scale = (1, 1, sz); bd.parent = product
                if not BAND.materials: BAND.materials.append(WHITE)
                bd.material_slots[0].link = "OBJECT"; bd.material_slots[0].material = mat(f"Band_{band}", band, 0.35)
            count += 1
print("drinks placed:", count)

# ---------- right-hand control panel ----------
P0 = FRONT - 1.0
box("Panel_Silver", X(690), X(835), P0, FRONT, Z(1170), Z(20), SILVER, 0.3)
for pz in (Z(380), Z(800)):
    box("Panel_Seam", X(690), X(835), P0 - 0.05, P0 + 0.1, pz - 0.15, pz + 0.15, DARK)
box("Temp_Display", X(740), X(800), P0 - 0.4, P0, Z(330), Z(315),
    mat("Display_Blue", (0.05, 0.2, 0.6), 0.2, emit=(0.2, 0.55, 1.0), estr=4))
box("Card_Reader", X(740), X(800), P0 - 2.0, P0, Z(480), Z(400), BLACK, 0.3)
box("Card_Screen", X(746), X(794), P0 - 2.1, P0 - 1.9, Z(445), Z(410),
    mat("Screen_Yellow", (0.6, 0.7, 0.1), 0.2, emit=(0.75, 0.9, 0.15), estr=2.5))
box("Keypad_Plate", X(718), X(825), P0 - 1.5, P0, Z(615), Z(520), BLACK, 0.3)
KEY = mat("Key_Silver", (0.8, 0.8, 0.82), 0.3, 1.0)
for rr in range(6):
    for cc in range(2):
        x0 = X(728) + cc * 3.1; z1 = Z(527) - rr * 2.25
        box(f"Key_{rr}{cc}", x0, x0 + 2.6, P0 - 2.3, P0 - 1.5, z1 - 1.8, z1, KEY, 0.2)
box("Coin_Slot", X(795), X(800), P0 - 1.6, P0 - 1.4, Z(560), Z(540), DARK)
box("Pickup_Recess", X(715), X(820), P0 - 0.2, P0 + 0.1, Z(765), Z(655), DARK, 0.3)
box("Pickup_Door", X(718), X(817), P0 - 1.2, P0 - 0.8, Z(760), Z(660),
    mat("Pickup_Plastic", (0.9, 0.95, 1.0), 0.05, trans=0.9))
box("Lock_Plate", X(705), X(735), P0 - 1.2, P0, Z(925), Z(860), KEY, 0.4)
box("Lock_Key", X(714), X(726), P0 - 1.6, P0 - 1.1, Z(905), Z(880), DARK, 0.2)
box("Coin_Return", X(745), X(795), P0 - 0.1, P0 + 0.2, Z(1010), Z(975), DARK, 0.3)

# ---------- renders ----------
def place(deg, dist, z, lens):
    a = math.radians(deg); cam.location = (dist * math.sin(a), -dist * math.cos(a), z); cam.data.lens = lens
def render(name, samples):
    sc.render.engine = "CYCLES"; sc.cycles.device = "CPU"; sc.cycles.samples = samples
    sc.cycles.use_denoising = True; sc.cycles.max_bounces = 8; sc.cycles.transmission_bounces = 8
    sc.render.image_settings.media_type = "IMAGE"; sc.render.image_settings.file_format = "PNG"
    sc.render.filepath = f"{OUT}/{name}.png"; bpy.ops.render.render(write_still=True)

if STAGE in ("front", "all"):
    place(0, 590, 92, 85); render("step2_front", int(sys.argv[4]) if len(sys.argv) > 4 else 48)
if STAGE in ("tq", "all"):
    place(-35, 560, 125, 85); render("step2_threequarter", int(sys.argv[4]) if len(sys.argv) > 4 else 48)
place(0, 700, 92, 85)
for e in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
    try: sc.render.engine = e; break
    except TypeError: pass
bpy.ops.wm.save_as_mainfile(filepath=OUT + "/vending_machine.blend")
print("height", round(max((o.matrix_world @ v.co).z for o in product.children if o.type == 'MESH' for v in o.data.vertices[:1]) , 1))
