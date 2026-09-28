// Scroll-film engine: pre-extracted frames drawn to a <canvas>, never <video> seeking.
//
//   initial frames → coarse coverage (every 8th) → finer passes → the rest, idle-paced
//   ImageBitmap sliding window around the playhead so draws are GPU blits, not decodes
//   nearest-loaded fallback so a missing frame never blanks the canvas
//
// The engine knows nothing about scroll. main.js feeds it progress (0–1) from
// ScrollTrigger; it only redraws when the frame index or the canvas size changes.
import { FILM } from './film-config.js';

export function createFilm({ canvas, backdrop, stage, onLoadProgress }) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const bctx = backdrop.getContext('2d', { alpha: false });
  const mq = window.matchMedia(FILM.mobileQuery);

  const chapters = FILM.chapters;
  const total = chapters.reduce((n, c) => n + c.frames, 0);
  const lookup = [];
  chapters.forEach((c) => { for (let i = 0; i < c.frames; i++) lookup.push([c.id, i]); });

  let mobile = mq.matches;
  let gen = 0;
  let images = new Array(total);
  let queued = new Uint8Array(total);
  let queue = [];
  let inflight = 0;
  const bitmaps = new Map();
  const decoding = new Set();
  let displayed = -1;
  let drawnSrc = null;
  let progress = 0;
  let destroyed = false;

  const cfg = () => mobile
    ? { set: 'm', srcW: 720, initial: 12, concurrency: 4, ahead: 28, behind: 14 }
    : { set: 'd', srcW: 1080, initial: 24, concurrency: 6, ahead: 48, behind: 30 };

  const url = (i) => {
    const [id, local] = lookup[i];
    return `${FILM.base}/${id}/${cfg().set}/${String(local).padStart(4, '0')}.${FILM.ext}`;
  };

  // ---------- loading ----------
  let resolveReady;
  const ready = new Promise((r) => { resolveReady = r; });
  let initialLoaded = 0;

  function buildQueue() {
    const order = [];
    const push = (i) => { if (i >= 0 && i < total && !queued[i]) { queued[i] = 1; order.push(i); } };
    for (let i = 0; i < cfg().initial; i++) push(i);
    for (const stride of [8, 4, 2, 1]) for (let i = 0; i < total; i += stride) push(i);
    queue = order;
  }

  // Pull the frames just ahead of the playhead to the front of the queue.
  function prioritize(center) {
    const want = [];
    for (let i = center; i <= Math.min(total - 1, center + cfg().ahead); i++) {
      if (!images[i]) want.push(i);
    }
    if (!want.length) return;
    const set = new Set(want);
    queue = want.concat(queue.filter((i) => !set.has(i)));
  }

  function pump() {
    const { concurrency } = cfg();
    while (inflight < concurrency && queue.length) {
      const i = queue.shift();
      if (images[i]) continue;
      load(i);
    }
  }

  function load(i) {
    inflight++;
    const g = gen;
    const img = new Image();
    img.decoding = 'async';
    img.src = url(i);
    const done = () => {
      if (g !== gen || destroyed) return;
      inflight--;
      // After the opening run, pace the rest so first interaction stays smooth.
      if (initialLoaded >= cfg().initial && 'requestIdleCallback' in window) {
        requestIdleCallback(pump, { timeout: 250 });
      } else pump();
    };
    img.decode().then(() => {
      if (g !== gen || destroyed) return;
      images[i] = img;
      if (i < cfg().initial) {
        initialLoaded++;
        onLoadProgress && onLoadProgress(Math.min(1, initialLoaded / cfg().initial));
        if (initialLoaded === cfg().initial) resolveReady();
      }
      if (i === 0 || i === displayed || (!drawnSrc && displayed >= 0)) draw(displayed < 0 ? 0 : displayed, true);
      else if (displayed >= 0 && !bitmaps.has(displayed) && Math.abs(i - displayed) < 4) draw(displayed, true);
    }).catch(() => {
      if (g !== gen) return;
      // Count a failed opening frame so a single 404 can never hang the loader.
      if (i < cfg().initial) {
        initialLoaded++;
        if (initialLoaded === cfg().initial) resolveReady();
      }
    }).finally(done);
  }

  // ---------- decode window ----------
  let bmpCenter = -999;
  function ensureBitmaps(center) {
    if (!('createImageBitmap' in window)) return;
    if (Math.abs(center - bmpCenter) < 3) return;
    bmpCenter = center;
    const { ahead, behind } = cfg();
    const lo = Math.max(0, center - behind);
    const hi = Math.min(total - 1, center + ahead);
    const g = gen;
    for (let i = lo; i <= hi; i++) {
      if (bitmaps.has(i) || decoding.has(i) || !images[i]) continue;
      decoding.add(i);
      createImageBitmap(images[i]).then((b) => {
        decoding.delete(i);
        if (g !== gen || destroyed || i < bmpCenter - behind - 4 || i > bmpCenter + ahead + 4) { b.close(); return; }
        bitmaps.set(i, b);
        if (i === displayed) draw(i, true);
      }).catch(() => decoding.delete(i));
    }
    for (const k of Array.from(bitmaps.keys())) {
      if (k < center - behind - 4 || k > center + ahead + 4) { bitmaps.get(k).close(); bitmaps.delete(k); }
    }
  }

  function nearest(i) {
    if (bitmaps.has(i)) return bitmaps.get(i);
    if (images[i]) return images[i];
    for (let d = 1; d < total; d++) {
      const a = i - d, b = i + d;
      if (a >= 0 && (bitmaps.get(a) || images[a])) return bitmaps.get(a) || images[a];
      if (b < total && (bitmaps.get(b) || images[b])) return bitmaps.get(b) || images[b];
    }
    return null;
  }

  // ---------- drawing ----------
  function draw(i, force) {
    const src = nearest(i);
    if (!src) return;
    if (!force && src === drawnSrc) return;
    drawnSrc = src;
    ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
    bctx.drawImage(src, 0, 0, backdrop.width, backdrop.height);
  }

  // The footage is near-square. Cover-cropping it would cut the logo on a laptop and
  // half of every frame on a phone, so it plays in a feathered "portal" sized to the
  // viewport, over a blurred copy of itself that fills the rest of the stage.
  function layout() {
    const vw = stage.clientWidth || window.innerWidth;
    const vh = stage.clientHeight || window.innerHeight;
    const a = FILM.aspect;
    let w, h, x, y;
    if (mobile) {
      w = Math.min(vw * 1.08, vh * 0.6 * a);
      h = w / a;
      x = (vw - w) / 2;
      y = Math.max(40, vh * 0.045);
    } else {
      h = vh * 1.04;
      w = h * a;
      if (w > vw * 0.7) { w = vw * 0.7; h = w / a; }
      x = Math.min(vw * 0.63 - w / 2, vw - w * 0.96);
      y = (vh - h) / 2;
    }
    Object.assign(canvas.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
    stage.style.setProperty('--portal-x', `${x}px`);
    stage.style.setProperty('--portal-w', `${w}px`);
    stage.style.setProperty('--portal-bottom', `${y + h}px`);
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const bw = Math.round(Math.min(w * dpr, cfg().srcW * 1.2));
    canvas.width = bw;
    canvas.height = Math.round(bw / a);
    // A 16px copy, upscaled by the compositor, is a free blur (no CSS filter cost).
    backdrop.width = 16;
    backdrop.height = Math.round(16 / a);
    drawnSrc = null;
    draw(displayed < 0 ? 0 : displayed, true);
  }

  function setProgress(p) {
    progress = Math.max(0, Math.min(1, p));
    const i = Math.round(progress * (total - 1));
    if (i === displayed) return;
    const jumped = Math.abs(i - displayed) > 6;
    displayed = i;
    ensureBitmaps(i);
    if (jumped || !images[i]) { prioritize(i); pump(); }
    draw(i);
  }

  function onBreakpoint() {
    const next = mq.matches;
    if (next === mobile) return;
    mobile = next;
    gen++;
    for (const b of bitmaps.values()) b.close();
    bitmaps.clear(); decoding.clear();
    images = new Array(total);
    queued = new Uint8Array(total);
    inflight = 0; bmpCenter = -999; drawnSrc = null;
    buildQueue();
    prioritize(Math.max(0, displayed));
    layout();
    pump();
  }

  let resizeRaf = 0;
  const onResize = () => {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(layout);
  };

  mq.addEventListener('change', onBreakpoint);
  window.addEventListener('resize', onResize);
  layout();
  buildQueue();
  pump();
  displayed = 0;

  return {
    ready,
    total,
    setProgress,
    layout,
    get progress() { return progress; },
    get loadedCount() { return images.filter(Boolean).length; },
    destroy() {
      destroyed = true;
      mq.removeEventListener('change', onBreakpoint);
      window.removeEventListener('resize', onResize);
      for (const b of bitmaps.values()) b.close();
      bitmaps.clear();
    },
  };
}
