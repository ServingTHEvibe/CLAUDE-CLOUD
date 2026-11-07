"""Step 4 variant: +/-40 deg swing loop (6 s, 180 frames) so the front stays on camera."""
import math, sys, bpy
out = sys.argv[1]; mode = sys.argv[2]
bpy.ops.wm.open_mainfile(filepath=out + "/vending_machine.blend")
sc = bpy.context.scene
p = bpy.data.objects["Product"]
p.animation_data_clear()
FR, AMP = 180, math.radians(40)
for f in range(1, FR + 2):              # f181 == f1 -> seamless loop
    p.rotation_euler.z = AMP * math.sin(2 * math.pi * (f - 1) / FR)
    p.keyframe_insert("rotation_euler", index=2, frame=f)
for layer in p.animation_data.action.layers:
    for strip in layer.strips:
        for bag in strip.channelbags:
            for fc in bag.fcurves:
                for k in fc.keyframe_points: k.interpolation = "LINEAR"
sc.frame_start, sc.frame_end = 1, FR
bpy.ops.wm.save_as_mainfile(filepath=out + "/vending_machine_swing.blend")
sc.render.engine = "CYCLES"; sc.cycles.device = "CPU"; sc.cycles.use_denoising = True
sc.cycles.seed = 0; sc.cycles.use_animated_seed = False; sc.render.use_persistent_data = True
s = sc.render.image_settings
if mode == "stills":
    sc.cycles.samples = 40; s.media_type = "IMAGE"; s.file_format = "PNG"
    for f in (46, 136):
        sc.frame_set(f); print("frame", f, "rot", round(math.degrees(p.rotation_euler.z), 1))
        sc.render.filepath = f"{out}/vending_swing_f{f:04d}.png"; bpy.ops.render.render(write_still=True)
else:
    sc.cycles.samples = 14; s.media_type = "VIDEO"; s.file_format = "FFMPEG"
    ff = sc.render.ffmpeg; ff.format = "MPEG4"; ff.codec = "H264"
    ff.constant_rate_factor = "HIGH"; ff.ffmpeg_preset = "GOOD"; ff.audio_codec = "NONE"
    sc.render.filepath = "/tmp/claude-0/-home-user-CLAUDE-CLOUD/df25ba7a-eaec-5b16-8ec6-a17d50cbb0e1/scratchpad/vending_swing_v01.mp4"; bpy.ops.render.render(animation=True)
    print("DONE")
