"""Review stack: reference | still | approved at equal height, plus a 900 px wide thumbnail of the same stack.
usage: python3 sheet.py out_prefix reference.png still.png [approved.png|-] [title]
writes <out_prefix>_stack.png and <out_prefix>_thumb900.png, prints measurements as JSON."""
import sys, os, json
from PIL import Image, ImageDraw, ImageFont
sys.path.insert(0, os.path.dirname(__file__))
from measure import measure

out, ref, still = sys.argv[1:4]
appr = sys.argv[4] if len(sys.argv) > 4 and sys.argv[4] != '-' else None
title = sys.argv[5] if len(sys.argv) > 5 else ''
H, PAD = 450, 12
F = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
font, small = ImageFont.truetype(F, 18), ImageFont.truetype(F, 14)

def fit(path):
    im = Image.open(path).convert('RGB')
    return im.resize((round(im.width * H / im.height), H), Image.LANCZOS)

cols = [('reference', ref), ('still', still), ('approved', appr)]
ims = [fit(p) if p else None for _, p in cols]
w = max(i.width for i in ims if i)
mr, ms = measure(ref), measure(still)
ma = measure(appr) if appr else None
stack = Image.new('RGB', (PAD + 3 * (w + PAD), 36 + H + 30), (255, 255, 255))
d = ImageDraw.Draw(stack)
d.text((PAD, 8), title, fill=(0, 0, 0), font=font)
for k, ((name, p), im, m) in enumerate(zip(cols, ims, [mr, ms, ma])):
    x = PAD + k * (w + PAD)
    if im:
        stack.paste(im, (x, 36))
    else:
        d.rectangle([x, 36, x + w, 36 + H], outline=(180, 180, 180))
        d.text((x + 20, 36 + H // 2), 'no approved still on file', fill=(120, 120, 120), font=font)
    lab = name if not m else f"{name}  dark {m['dark_share_frame']:.3f}  h/L {m['height_over_length']:.3f}  green {m['green_share_object']*100:.2f}%"
    d.text((x, 36 + H + 6), lab, fill=(0, 0, 0), font=small)
stack.save(out + '_stack.png')
th = stack.resize((900, round(stack.height * 900 / stack.width)), Image.LANCZOS)
th.save(out + '_thumb900.png')
ratio = ms['dark_share_frame'] / mr['dark_share_frame']
print(json.dumps({'reference': mr, 'still': ms, 'dark_ratio': round(ratio, 3)}))
