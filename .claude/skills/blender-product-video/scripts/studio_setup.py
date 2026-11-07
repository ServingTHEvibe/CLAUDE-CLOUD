"""Step 1 - Set up the studio (Blender 5.1+).

Run through the Blender MCP code tool, or paste into Blender > Scripting > Run Script.
Lists the scene, clears it, and builds a product-video studio:
cm units, 1080x1350 @ 30 fps, curved white cyc, soft key from the left,
thin rim from behind, 85 mm camera at product height.

Set CLEAR_SCENE = False to only list what's there.
"""
import math

import bmesh
import bpy

CLEAR_SCENE = True
PRODUCT_HEIGHT_CM = 10.0  # camera aims at mid-height; updated once the product exists


def list_scene():
    rows = [f"{o.name} ({o.type})" for o in bpy.context.scene.objects]
    print("SCENE CONTENTS:", ", ".join(rows) if rows else "(empty)")
    return rows


def clear_scene():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.lights, bpy.data.cameras,
                 bpy.data.materials, bpy.data.curves):
        for block in list(coll):
            if block.users == 0:
                coll.remove(block)


def set_eevee(scene):
    for engine in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
        try:
            scene.render.engine = engine
            return engine
        except TypeError:
            continue
    return scene.render.engine


def setup_scene(scene):
    us = scene.unit_settings
    us.system = "METRIC"
    us.scale_length = 0.01  # 1 Blender unit = 1 cm
    us.length_unit = "CENTIMETERS"

    r = scene.render
    r.resolution_x, r.resolution_y, r.resolution_percentage = 1080, 1350, 100
    r.fps, r.fps_base = 30, 1.0
    scene.frame_start, scene.frame_end = 1, 180
    engine = set_eevee(scene)

    world = scene.world or bpy.data.worlds.new("World")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = (0.8, 0.8, 0.8, 1)
        bg.inputs["Strength"].default_value = 0.08
    return engine


def build_cyc(width=300.0, depth=250.0, height=200.0, radius=60.0, segments=16):
    """Floor that curves up into the back wall (wall at +Y, camera looks toward +Y)."""
    wall_y = depth / 2
    profile = [(-depth / 2, 0.0)]
    cy, cz = wall_y - radius, radius
    for i in range(segments + 1):
        a = math.radians(-90 + 90 * i / segments)
        profile.append((cy + radius * math.cos(a), cz + radius * math.sin(a)))
    profile.append((wall_y, height))

    mesh = bpy.data.meshes.new("Cyc")
    bm = bmesh.new()
    left = [bm.verts.new((-width / 2, y, z)) for y, z in profile]
    right = [bm.verts.new((width / 2, y, z)) for y, z in profile]
    for i in range(len(profile) - 1):
        bm.faces.new((left[i], right[i], right[i + 1], left[i + 1]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    for p in mesh.polygons:
        p.use_smooth = True

    obj = bpy.data.objects.new("Cyc_Backdrop", mesh)
    bpy.context.scene.collection.objects.link(obj)

    mat = bpy.data.materials.new("Cyc_White")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (0.9, 0.9, 0.9, 1)
    bsdf.inputs["Roughness"].default_value = 0.6
    obj.data.materials.append(mat)
    return obj


def add_target(z):
    target = bpy.data.objects.new("Product_Target", None)
    target.empty_display_type = "SPHERE"
    target.empty_display_size = 2
    target.location = (0, 0, z)
    bpy.context.scene.collection.objects.link(target)
    return target


def track(obj, target):
    c = obj.constraints.new("TRACK_TO")
    c.target = target
    c.track_axis = "TRACK_NEGATIVE_Z"
    c.up_axis = "UP_Y"


def add_area_light(name, location, energy, size, size_y=None, target=None):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    if size_y:
        data.shape = "RECTANGLE"
        data.size, data.size_y = size, size_y
    else:
        data.shape = "DISK"
        data.size = size
    obj = bpy.data.objects.new(name, data)
    obj.location = location
    bpy.context.scene.collection.objects.link(obj)
    if target:
        track(obj, target)
    return obj


def add_camera(target, z):
    data = bpy.data.cameras.new("Camera")
    data.lens = 85
    data.clip_start, data.clip_end = 1, 2000
    cam = bpy.data.objects.new("Camera", data)
    cam.location = (0, -85, z)
    bpy.context.scene.collection.objects.link(cam)
    track(cam, target)
    bpy.context.scene.camera = cam
    return cam


def main():
    scene = bpy.context.scene
    before = list_scene()
    if not CLEAR_SCENE:
        return
    clear_scene()
    engine = setup_scene(scene)
    mid = PRODUCT_HEIGHT_CM / 2
    build_cyc()
    target = add_target(mid)
    add_area_light("Key_Left", (-60, -45, mid + 35), energy=60000, size=120, target=target)
    add_area_light("Rim_Back", (25, 45, mid + 15), energy=20000, size=8, size_y=110, target=target)
    add_camera(target, mid)

    summary = [
        f"Listed and removed {len(before)} objects",
        "Units: metric, centimeters (1 BU = 1 cm)",
        "Frame: 1080 x 1350, 30 fps, frames 1-180",
        f"Engine: {engine}",
        "Backdrop: white cyc, 300 x 250 cm, 60 cm floor-to-wall curve",
        "Key: 120 cm soft area light, front-left, 60 kW (cm scale needs high wattage)",
        "Rim: 8 x 110 cm strip light behind-right, 20 kW",
        f"Camera: 85 mm at {mid:.0f} cm height, 85 cm back, tracking Product_Target",
    ]
    print("STUDIO SET:\n- " + "\n- ".join(summary))
    return summary


main()
