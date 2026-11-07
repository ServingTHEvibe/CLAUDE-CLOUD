"""Side-by-side review sheet: reference | still | approved, with a thumbnail row.
usage: python3 sheet.py out.png reference.png still.png [approved.png|-] [title]"""
import sys, os, json
from PIL import Image, ImageDraw, ImageFont
sys.path.insert(0, os.path.dirname(__file__))
from measure import measure

out, ref, still = sys.argv[1:4]
appr = sys.argv[4] if len(sys.argv) > 4 and sys.argv[4] != '-' else None
title = sys.argv[5] if len(sys.argv) > 5 else ''
H, TH, PAD = 440, 120, 16
try:
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 18)
    small = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 14)
except OSError:
    font = small = ImageFont.load_default()

def fit(path, h):
    im = Image.open(path).convert('RGB')
    return im.resize((round(im.width * h / im.height), h), Image.LANCZOS)

cols = [('reference', ref), ('still', still), ('approved', appr)]
ims = [fit(p, H) if p else None for _, p in cols]
w = max(i.width for i in ims if i)
mr, ms = measure(ref), measure(still)
W = PAD + 3 * (w + PAD)
sheet = Image.new('RGB', (W, 40 + H + 70 + TH + 60), (255, 255, 255))
d = ImageDraw.Draw(sheet)
d.text((PAD, 10), title, fill=(0, 0, 0), font=font)
for k, ((name, p), im) in enumerate(zip(cols, ims)):
    x = PAD + k * (w + PAD)
    if im:
        sheet.paste(im, (x, 40))
    else:
        d.rectangle([x, 40, x + w, 40 + H], outline=(180, 180, 180))
        d.text((x + 20, 40 + H // 2 - 10), 'no approved still on file yet', fill=(120, 120, 120), font=font)
    m = mr if name == 'reference' else ms if name == 'still' else None
    lab = name if not m else f"{name}   dark/frame {m['dark_share_frame']:.3f}   h/L {m['height_over_length']:.3f}   green {m['green_share_object']*100:.2f}%"
    d.text((x, 40 + H + 6), lab, fill=(0, 0, 0), font=small)
ratio = ms['dark_share_frame'] / mr['dark_share_frame']
d.text((PAD, 40 + H + 30), f"dark share ratio still/reference = {ratio:.2f}  ({'pass' if ratio >= 0.8 else 'NO: below 0.8'})", fill=(0, 0, 0), font=font)
y = 40 + H + 70
d.text((PAD, y - 4), 'thumbnails (density check)', fill=(0, 0, 0), font=small)
x = PAD
for (name, p) in cols:
    if not p:
        continue
    t = fit(p, TH)
    t = t.resize((round(t.width * 0.55), round(t.height * 0.55)), Image.LANCZOS)
    sheet.paste(t, (x, y + 16)); x += t.width + PAD
sheet.save(out)
print(json.dumps({'reference': mr, 'still': ms, 'dark_ratio': round(ratio, 3)}))
