// Scroll-film engine: pre-extracted frames drawn to <canvas>, never <video> seeking.
//
//   initial frames → coarse coverage (every 8th) → finer passes → the rest, idle-paced
//   ImageBitmap sliding window around the playhead so draws are GPU blits, not decodes
//   nearest-loaded fallback (within the same chapter) so a missing frame never blanks
//
// A film is a list of chapters played back to back as one frame index. Each chapter has a
// layout and its own canvas:
//   'cover'  — full-bleed footage (the 16:9 Atlanta mural)
//   'portal' — near-square footage in a feathered window over a blurred copy of itself
// Each canvas keeps its boundary frame drawn while the other chapter plays, so main.js
// can run the portal transition between them with both images on screen.
//
// The engine knows nothing about scroll: main.js feeds it progress (0–1).
import { FILM } from './film-config.js';

export function createFilm({ canvases, backdrop, stage, onLoadProgress }) {
  const bctx = backdrop.getContext('2d', { alpha: false });
  const mq = window.matchMedia(FILM.mobileQuery);

  let start = 0;
  const chapters = FILM.chapters.map((c) => {
    const ch = { ...c, start, end: start + c.frames - 1, canvas: canvases[c.layout] };
    ch.ctx = ch.canvas.getContext('2d', { alpha: false });
    start += c.frames;
    return ch;
  });
  const total = start;
  const lookup = new Array(total);
  chapters.forEach((ch) => { for (let i = ch.start; i <= ch.end; i++) lookup[i] = ch; });
  // Frames each canvas shows while the other chapter is playing.
  const anchorFor = (ch, active) => (ch.start > active.end ? ch.start : ch.end);

  let mobile = mq.matches;
  let gen = 0;
  let images = new Array(total);
  let queued = new Uint8Array(total);
  let queue = [];
  let inflight = 0;
  const bitmaps = new Map();
  const decoding = new Set();
  const drawn = new Map(); // canvas → { src, index }
  let displayed = 0;
  let progress = 0;
  let destroyed = false;

  const cfg = () => mobile
    ? { set: 'm', initial: 12, concurrency: 4, ahead: 28, behind: 14 }
    : { set: 'd', initial: 24, concurrency: 6, ahead: 48, behind: 30 };

  const url = (i) => {
    const ch = lookup[i];
    return `${FILM.base}/${ch.id}/${cfg().set}/${String(i - ch.start).padStart(4, '0')}.${FILM.ext}`;
  };

  // ---------- loading ----------
  let resolveReady;
  const ready = new Promise((r) => { resolveReady = r; });
  let initialLoaded = 0;
  let initialSet = new Set();

  function buildQueue() {
    const order = [];
    const push = (i) => { if (i >= 0 && i < total && !queued[i]) { queued[i] = 1; order.push(i); } };
    initialSet = new Set();
    for (let i = 0; i < cfg().initial; i++) { push(i); initialSet.add(i); }
    // Every chapter's first frame early, so a portal is never empty.
    chapters.forEach((ch) => push(ch.start));
    for (const stride of [8, 4, 2, 1]) for (let i = 0; i < total; i += stride) push(i);
    queue = order;
  }

  function prioritize(center) {
    const want = [];
    for (let i = center; i <= Math.min(total - 1, center + cfg().ahead); i++) if (!images[i]) want.push(i);
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

  function countInitial(i) {
    if (!initialSet.has(i)) return;
    initialSet.delete(i);
    initialLoaded++;
    onLoadProgress && onLoadProgress(Math.min(1, initialLoaded / cfg().initial));
    if (initialLoaded === cfg().initial) resolveReady();
  }

  function load(i) {
    inflight++;
    const g = gen;
    const img = new Image();
    img.decoding = 'async';
    img.src = url(i);
    img.decode().then(() => {
      if (g !== gen || destroyed) return;
      images[i] = img;
      countInitial(i);
      refreshIfUseful(i);
    }).catch(() => {
      // A failed frame still counts toward the opening run so one 404 can't hang the loader.
      if (g === gen) countInitial(i);
    }).finally(() => {
      if (g !== gen || destroyed) return;
      inflight--;
      if (initialLoaded >= cfg().initial && 'requestIdleCallback' in window) requestIdleCallback(pump, { timeout: 250 });
      else pump();
    });
  }

  // Repaint a canvas when a frame closer to what it should show arrives.
  function refreshIfUseful(i) {
    const active = lookup[displayed];
    const ch = lookup[i];
    const want = ch === active ? displayed : anchorFor(ch, active);
    const d = drawn.get(ch.canvas);
    if (!d || Math.abs(i - want) < Math.abs(d.index - want)) paint(ch, want);
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
        if (i === displayed) paint(lookup[i], i, true);
      }).catch(() => decoding.delete(i));
    }
    for (const k of Array.from(bitmaps.keys())) {
      if (k < center - behind - 4 || k > center + ahead + 4) { bitmaps.get(k).close(); bitmaps.delete(k); }
    }
  }

  const srcAt = (i) => bitmaps.get(i) || images[i];
  function nearest(ch, i) {
    if (srcAt(i)) return [srcAt(i), i];
    for (let d = 1; d <= ch.frames; d++) {
      const a = i - d, b = i + d;
      if (a >= ch.start && srcAt(a)) return [srcAt(a), a];
      if (b <= ch.end && srcAt(b)) return [srcAt(b), b];
    }
    return [null, -1];
  }

  // ---------- drawing ----------
  function paint(ch, i, force) {
    const [src, at] = nearest(ch, i);
    if (!src) return;
    const d = drawn.get(ch.canvas);
    if (!force && d && d.src === src) return;
    drawn.set(ch.canvas, { src, index: at });
    const c = ch.canvas;
    const sw = src.width, sh = src.height;
    const s = Math.max(c.width / sw, c.height / sh);
    const w = sw * s, h = sh * s;
    ch.ctx.drawImage(src, (c.width - w) / 2, (c.height - h) / 2, w, h);
    if (ch === lookup[displayed]) bctx.drawImage(src, 0, 0, backdrop.width, backdrop.height);
  }

  function paintAll(force) {
    const active = lookup[displayed];
    chapters.forEach((ch) => paint(ch, ch === active ? displayed : anchorFor(ch, active), force));
  }

  function box(ch, vw, vh) {
    const a = ch.aspect;
    if (ch.layout === 'cover') {
      // Full-bleed on desktop; on a phone, the top ~64% so the lettering stays legible
      // instead of cropping a 16:9 frame down to a sliver.
      return mobile ? { x: 0, y: 0, w: vw, h: Math.round(vh * 0.64) } : { x: 0, y: 0, w: vw, h: vh };
    }
    let w, h, x, y;
    if (mobile) {
      w = Math.min(vw * 1.08, vh * 0.6 * a);
      h = w / a; x = (vw - w) / 2; y = Math.max(40, vh * 0.045);
    } else {
      h = vh * 1.04; w = h * a;
      if (w > vw * 0.7) { w = vw * 0.7; h = w / a; }
      x = Math.min(vw * 0.63 - w / 2, vw - w * 0.96);
      y = (vh - h) / 2;
    }
    return { x, y, w, h };
  }

  function layout() {
    const vw = stage.clientWidth || window.innerWidth;
    const vh = stage.clientHeight || window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    chapters.forEach((ch) => {
      const b = box(ch, vw, vh);
      Object.assign(ch.canvas.style, { left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px` });
      const srcW = ch.srcW[cfg().set];
      const bw = Math.round(Math.min(b.w * dpr, srcW * 1.25));
      ch.canvas.width = bw;
      ch.canvas.height = Math.round(bw * (b.h / b.w));
      if (ch.layout === 'portal') {
        stage.style.setProperty('--portal-x', `${b.x}px`);
        stage.style.setProperty('--portal-w', `${b.w}px`);
        stage.style.setProperty('--portal-cy', `${b.y + b.h * 0.5}px`);
      }
    });
    // A 16px copy, upscaled by the compositor, is a free blur (no CSS filter cost).
    backdrop.width = 16;
    backdrop.height = 10;
    drawn.clear();
    paintAll(true);
  }

  function setProgress(p) {
    progress = Math.max(0, Math.min(1, p));
    const i = Math.round(progress * (total - 1));
    if (i === displayed) return;
    const jumped = Math.abs(i - displayed) > 6;
    const switched = lookup[i] !== lookup[displayed];
    displayed = i;
    ensureBitmaps(i);
    if (jumped || !images[i]) { prioritize(i); pump(); }
    if (switched) paintAll(); else paint(lookup[i], i);
  }

  function onBreakpoint() {
    const next = mq.matches;
    if (next === mobile) return;
    mobile = next;
    gen++;
    for (const b of bitmaps.values()) b.close();
    bitmaps.clear(); decoding.clear(); drawn.clear();
    images = new Array(total);
    queued = new Uint8Array(total);
    inflight = 0; bmpCenter = -999; initialLoaded = cfg().initial; // already revealed
    buildQueue();
    prioritize(displayed);
    layout();
    pump();
  }

  let resizeRaf = 0;
  const onResize = () => { cancelAnimationFrame(resizeRaf); resizeRaf = requestAnimationFrame(layout); };

  mq.addEventListener('change', onBreakpoint);
  window.addEventListener('resize', onResize);
  layout();
  buildQueue();
  pump();

  return {
    ready,
    total,
    setProgress,
    layout,
    /** Progress (0–1) at which chapter `id` begins. */
    startOf(id) { const ch = chapters.find((c) => c.id === id); return ch ? ch.start / (total - 1) : 0; },
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
