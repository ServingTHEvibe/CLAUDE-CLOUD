"""Measure an object on a near-white studio background.
usage: python3 measure.py image.png [--json]
Reports bbox, object mask coverage, dark-pixel share inside the object's frame,
and the vertical extent of the mask in 10 slices along the length."""
import sys, json
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

def measure(path):
    im = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    lum = im @ np.array([0.299, 0.587, 0.114])
    bg = np.median(np.concatenate([lum[:8].ravel(), lum[:, :8].ravel(), lum[:, -8:].ravel()]))
    sat = im.max(2) - im.min(2)
    # object = anything clearly different from the paper (shadows are soft and low-contrast)
    raw = (np.abs(lum - bg) > 22) | (sat > 40)
    raw = ndi.binary_closing(raw, iterations=3)
    lab, n = ndi.label(raw)
    sizes = ndi.sum(raw, lab, range(1, n + 1))
    keep = np.isin(lab, np.where(sizes > 0.002 * raw.size)[0] + 1)
    mask = ndi.binary_fill_holes(keep)
    ys, xs = np.where(mask)
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    L, H = x1 - x0, y1 - y0
    frame = lum[y0:y1 + 1, x0:x1 + 1]
    fmask = mask[y0:y1 + 1, x0:x1 + 1]
    dark = frame < 90
    green = ((im[..., 1] - np.maximum(im[..., 0], im[..., 2])) > 35)[y0:y1 + 1, x0:x1 + 1]
    slices = []
    for i in range(10):
        a, b = int(L * i / 10), int(L * (i + 1) / 10)
        col = fmask[:, a:b].any(1)
        r = np.where(col)[0]
        slices.append(round((r.max() - r.min()) / L, 3) if len(r) else 0)
    return dict(
        size=[int(L), int(H)], height_over_length=round(H / L, 3),
        object_fill=round(fmask.mean(), 3),
        dark_share_frame=round(dark.mean(), 4),
        dark_share_object=round(dark[fmask].mean(), 4),
        green_share_object=round(green[fmask].mean(), 4),
        slice_heights_over_length=slices,
    )

if __name__ == '__main__':
    print(json.dumps(measure(sys.argv[1]), indent=1))
