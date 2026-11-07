import sys
from PIL import Image, ImageDraw, ImageFont
# label arc = 60% of circumference at r=4.23cm -> 15.95 x 3.5 cm -> aspect 4.556
W, H = 1823, 400
im = Image.new("RGB", (W, H), (236, 228, 212))
d = ImageDraw.Draw(im)
f = lambda n, s: ImageFont.truetype(f"/usr/share/fonts/opentype/inter/Inter-{n}.otf", s)
cx = W // 2
d.rectangle([24, 24, W - 25, H - 25], outline=(40, 34, 28), width=3)
for txt, font, y in (("SAMPLE CO.", f("SemiBold", 118), 70),
                     ("AMBER  &  CEDAR", f("Medium", 46), 225),
                     ("HAND-POURED SOY CANDLE  ·  8 OZ", f("Regular", 30), 305)):
    w = d.textlength(txt, font=font)
    d.text((cx - w / 2, y), txt, font=font, fill=(40, 34, 28))
im.save(sys.argv[1])
