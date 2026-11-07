"""Step 4 - The 6-second spin (Blender 5.1+).

Animates a seamless 180-frame turntable loop with a small camera push-in,
renders check stills (frames 1, 90, 180), then optionally the full MP4.

Run after studio_setup.py and once the product exists. The product is the
object named PRODUCT_NAME (an empty parenting body/lid/label works best).
"""
import os

import bpy

PRODUCT_NAME = "Product"
OUTPUT_DIR = "//renders"      # "//" = next to the .blend; or an absolute folder path
BASENAME = "product_spin_v01"
SECONDS, FPS = 6, 30
PUSH_IN = 0.07                # camera moves 7 % closer at mid-loop
RENDER_STILLS = True
RENDER_VIDEO = False          # flip to True after the stills are approved


def set_eevee(scene):
    for engine in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
        try:
            scene.render.engine = engine
            return
        except TypeError:
            continue


def linear(obj):
    """Make every keyframe on obj linear (5.x layered actions and legacy actions)."""
    ad = obj.animation_data
    if not ad or not ad.action:
        return
    action = ad.action
    curves = []
    if hasattr(action, "layers") and action.layers:
        for layer in action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    curves.extend(bag.fcurves)
    elif hasattr(action, "fcurves"):
        curves = list(action.fcurves)
    for fc in curves:
        for kp in fc.keyframe_points:
            kp.interpolation = "LINEAR"


def animate(scene):
    frames = SECONDS * FPS                    # 180
    scene.render.fps = FPS
    scene.frame_start, scene.frame_end = 1, frames

    product = bpy.data.objects.get(PRODUCT_NAME) or bpy.context.active_object
    if product is None:
        raise RuntimeError(f"No object named {PRODUCT_NAME!r} and nothing selected")

    # Full turn lands on frame 181, so frame 180 flows straight into frame 1.
    product.rotation_mode = "XYZ"
    product.animation_data_clear()
    product.rotation_euler.z = 0.0
    product.keyframe_insert("rotation_euler", index=2, frame=1)
    product.rotation_euler.z = 6.283185307179586
    product.keyframe_insert("rotation_euler", index=2, frame=frames + 1)
    linear(product)

    cam = scene.camera
    target = bpy.data.objects.get("Product_Target")
    aim = target.location.copy() if target else product.location.copy()
    start = cam.location.copy()
    closer = aim + (start - aim) * (1 - PUSH_IN)
    cam.animation_data_clear()
    for frame, loc in ((1, start), (frames // 2 + 1, closer), (frames + 1, start)):
        cam.location = loc
        cam.keyframe_insert("location", frame=frame)
    cam.location = start
    return product, frames


def configure_output(scene):
    set_eevee(scene)
    r = scene.render
    r.resolution_x, r.resolution_y, r.resolution_percentage = 1080, 1350, 100
    out = bpy.path.abspath(OUTPUT_DIR)
    os.makedirs(out, exist_ok=True)
    return out


def render_stills(scene, out, frames):
    s = scene.render.image_settings
    if hasattr(s, "media_type"):
        s.media_type = "IMAGE"
    s.file_format = "PNG"
    paths = []
    for f in (1, frames // 2, frames):        # 1, 90, 180
        scene.frame_set(f)
        scene.render.filepath = os.path.join(out, f"{BASENAME}_f{f:04d}.png")
        bpy.ops.render.render(write_still=True)
        paths.append(scene.render.filepath)
    return paths


def render_video(scene, out):
    s = scene.render.image_settings
    if hasattr(s, "media_type"):
        s.media_type = "VIDEO"
    s.file_format = "FFMPEG"
    ff = scene.render.ffmpeg
    ff.format = "MPEG4"
    ff.codec = "H264"
    ff.constant_rate_factor = "HIGH"
    ff.ffmpeg_preset = "GOOD"
    ff.audio_codec = "NONE"
    scene.render.filepath = os.path.join(out, f"{BASENAME}.mp4")
    bpy.ops.render.render(animation=True)
    return scene.render.filepath


def main():
    scene = bpy.context.scene
    product, frames = animate(scene)
    out = configure_output(scene)
    print(f"Turntable: {product.name} 0-360 deg linear, frames 1-{frames}, "
          f"camera push {PUSH_IN:.0%} at frame {frames // 2 + 1}")
    if RENDER_STILLS:
        print("Stills:", render_stills(scene, out, frames))
    if RENDER_VIDEO:
        print("Video:", render_video(scene, out))


main()
