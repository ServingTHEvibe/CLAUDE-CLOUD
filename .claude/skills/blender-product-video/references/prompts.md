# The 7 prompts

Copy-paste versions. Replace anything in `[brackets]`. Run them one at a time in a chat with the
Blender connector on, and check the result before sending the next.

---

## 1/7 · The setup — SET UP THE STUDIO
*Claude desktop app: Settings → Connectors → Blender. Free Blender 5.1+ with the MCP add-on switched on.*

```
List everything in my open Blender scene. Then clear it and set it up for product
videos: units in centimeters, frame size 1080 by 1350, 30 fps. Build a simple
studio: a white backdrop that curves from the floor up into the wall, a soft main
light from the left, a thin light from behind for the edges, and a camera at
product height. Tell me what you set, in one short list.
```

## 2/7 · The product — ONE PHOTO IN, A 3D MODEL OUT
*Simple shapes work best: bottles, jars, candles, boxes, mugs, cans.*

```
Here's a photo of [product: a candle jar / a perfume bottle / a coffee bag]: [upload].
It's [height] cm tall. Build it in Blender at real size: match the outline, the
proportions, the lid and where the label sits. Keep it clean, no details I didn't
show you. Then render a front view and a three-quarter view and tell me what still
looks different from my photo.
```

## 3/7 · The materials — MAKE IT LOOK REAL
*Real is in the small stuff: soft edges, a shadow under it, a little texture.*

```
Make it look like a real product: [glass / matte ceramic / brushed metal / frosted
plastic] for the body, [material] for the lid. Put my label on the label area:
[upload label image], no stretching. Round every sharp edge a little, add a soft
shadow where it touches the floor, and a touch of roughness so it isn't
plastic-perfect. Render one frame and tell me what still looks fake.
```

## 4/7 · The spin — THE 6-SECOND SPIN
*Renders in minutes on a normal laptop. The video every brand needs first.*

```
Animate a 6-second loop: the product turns a full circle on a slow turntable while
the camera moves in a little. The last frame matches the first so it loops. Render
as MP4, 1080 by 1350, 30 fps, with the Eevee engine, into [folder]. Before the full
render, render frames 1, 90 and 180 as stills so I can check them first.
```

## 5/7 · The ad scene — PUT IT WHERE IT SELLS
*The shot brands actually pay for. Same product, a real-looking place.*

```
Now put the product in a scene that sells it: [a marble bathroom shelf in morning
light / a wooden kitchen counter / a rock in shallow water]. Build the scene around
it at real scale. The product stays sharp and in the middle, the background a
little blurry. 8-second shot: a slow push in, with the light moving across the
label at the end. Same render settings as before.
```

## 6/7 · The pitch — THE MESSAGE THAT GETS THE YES
*$500 a month for 4 videos. 6 brands is $3,000 a month.*

```
Write a short DM to [brand name], a small brand on Instagram, with their product
video attached. Say I made it from one photo of their product, where they'd use it
(ads, product page, reels), and the offer: this one is free, then 4 new videos every
month for $500. Friendly, under 70 words, no pressure. Then my reply for when they
ask how much for just one.
```

## 7/7 · Fix it — FIX WHAT LOOKS FAKE
*Check every video before a client sees it. One bad frame costs the deal.*

```
This part looks fake: [too shiny / it floats above the floor / the label is
stretched / too dark] at frame [number]. Fix only that and keep everything else the
same. Then give me a 5-point checklist I run before I send any video to a client:
real size, shadows, label edges, a smooth loop, and the file under 100 MB so
Instagram takes it.
```
