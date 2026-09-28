import { createFilm } from './film.js';
import { FILM } from './film-config.js';
import { createConcierge } from './concierge.js';
import { getSiteConfig } from './lib/orders.js';

const { gsap, ScrollTrigger, Lenis } = window;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const params = new URLSearchParams(location.search);
const JUMP = params.get('jump');
const DEBUG = params.has('debug');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const mobileMQ = window.matchMedia(FILM.mobileQuery);
const clamp01 = (v) => Math.max(0, Math.min(1, v));

if (JUMP !== null) history.scrollRestoration = 'manual';
$('[data-year]').textContent = new Date().getFullYear();

// Concierge first: it must work even if the motion layer fails to start.
const concierge = createConcierge();
$$('[data-open-concierge]').forEach((btn) => btn.addEventListener('click', () => {
  closeMenu();
  concierge.open({ preset: btn.dataset.preset });
}));

// ---------------------------------------------------------------------------
// Scroll: one loop. Lenis is driven by GSAP's ticker, ScrollTrigger listens to Lenis.
// ---------------------------------------------------------------------------
let lenis = null;
const canAnimate = !!(gsap && ScrollTrigger) && !reducedMotion;
if (canAnimate) {
  gsap.registerPlugin(ScrollTrigger);
  if (Lenis && JUMP === null) {
    lenis = new Lenis({ lerp: 0.1, smoothWheel: true, syncTouch: false });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }
}
concierge.onToggle((open) => { if (lenis) (open ? lenis.stop() : lenis.start()); });

// In-page anchors go through Lenis so they glide instead of jumping.
$$('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
  const id = a.getAttribute('href');
  if (id.length < 2 && id !== '#top') return;
  const target = id === '#top' ? document.body : $(id);
  if (!target) return;
  e.preventDefault();
  closeMenu();
  if (lenis) lenis.scrollTo(target, { offset: 0, duration: 1.4 });
  else target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
  if (id !== '#top') {
    target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  }
}));

// ---------------------------------------------------------------------------
// Nav + mobile menu
// ---------------------------------------------------------------------------
const nav = $('[data-nav]');
const burger = $('[data-burger]');
const menu = $('[data-menu]');
function closeMenu() {
  if (menu.hidden) return;
  menu.hidden = true;
  burger.setAttribute('aria-expanded', 'false');
  lenis && lenis.start();
}
burger.addEventListener('click', () => {
  const open = menu.hidden;
  menu.hidden = !open;
  burger.setAttribute('aria-expanded', String(open));
  if (open) { lenis && lenis.stop(); $('a', menu).focus(); } else lenis && lenis.start();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
mobileMQ.addEventListener('change', closeMenu);

const filmEl = $('[data-film]');
const updateNav = () => {
  const glassAt = filmEl.offsetTop + filmEl.offsetHeight - window.innerHeight * 0.6;
  nav.classList.toggle('is-glass', window.scrollY > glassAt || window.scrollY > window.innerHeight * 0.5 && mobileMQ.matches);
};
window.addEventListener('scroll', updateNav, { passive: true });

// ---------------------------------------------------------------------------
// 01 — the film
// ---------------------------------------------------------------------------
const stage = $('[data-stage]');
const canvas = $('[data-canvas]');
const backdrop = $('[data-backdrop]');
const loader = $('[data-loader]');
const loaderBar = $('[data-loader-bar]');
const beats = $$('[data-beat]').map((el) => ({
  el, in: +el.dataset.in, peak: +el.dataset.peak, out: +el.dataset.out, shown: null,
}));
const readoutLabel = $('[data-readout]');
const readoutBar = $('[data-readout-bar]');
const scrollcue = $('[data-scrollcue]');

let film = null;
let filmReady = Promise.resolve();
const useFilm = canAnimate && !!canvas.getContext && 'Promise' in window;
if (useFilm) {
  film = createFilm({
    canvas, backdrop, stage,
    onLoadProgress: (p) => { loaderBar.style.transform = `scaleX(${p})`; },
  });
  // Never hold the page hostage to a slow network: reveal after 6s regardless.
  filmReady = Promise.race([film.ready, new Promise((r) => setTimeout(r, 6000))]);
} else {
  document.documentElement.classList.add('is-static');
}

function beatAlpha(b, p) {
  if (p < b.in || p > b.out) return 0;
  if (p < b.peak) return (p - b.in) / Math.max(1e-4, b.peak - b.in);
  if (b.out > 1.5) return 1;
  return 1 - (p - b.peak) / Math.max(1e-4, b.out - b.peak);
}

let lastReadout = '';
let settleFilm = () => {};
function renderFilm(p) {
  film.setProgress(p);
  const m = mobileMQ.matches;
  // Depth planes. Background drifts least, the footage (product plane) pushes in,
  // foreground dust travels fastest.
  canvas.style.transform = `translate3d(0, ${(-p * (m ? 1.5 : 2.5)).toFixed(2)}%, 0) scale(${(1 + p * (m ? 0.05 : 0.09)).toFixed(4)})`;
  backdrop.style.transform = `scale(${(1.15 + p * 0.04).toFixed(4)})`;
  dust.el.style.transform = `translate3d(0, ${(-p * (m ? 10 : 22)).toFixed(2)}vh, 0)`;

  for (const b of beats) {
    const a = beatAlpha(b, p);
    const dir = p < b.peak ? 1 : -1;
    const y = (1 - a) * 34 * dir;
    b.el.style.opacity = a.toFixed(3);
    b.el.style.setProperty('--by', `${y.toFixed(1)}px`);
    const shown = a > 0.02;
    if (shown !== b.shown) {
      b.shown = shown;
      b.el.style.visibility = shown ? 'visible' : 'hidden';
      b.el.toggleAttribute('inert', !shown);
    }
  }
  let label = FILM.readout[0].label;
  for (const r of FILM.readout) if (p >= r.at) label = r.label;
  if (label !== lastReadout) { readoutLabel.textContent = label; lastReadout = label; }
  readoutBar.style.transform = `scaleX(${p.toFixed(4)})`;
  scrollcue.style.opacity = String(clamp01(1 - p * 14));
  stage.style.setProperty('--seam', clamp01((p - 0.93) / 0.07).toFixed(3));
}

// Ambient gold dust (foreground FX plane). Stops drawing when the film is off screen.
const dust = (() => {
  const el = $('[data-dust]');
  const c = el.getContext('2d');
  const sprite = document.createElement('canvas');
  sprite.width = sprite.height = 32;
  const sg = sprite.getContext('2d');
  const grad = sg.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,214,130,1)');
  grad.addColorStop(0.35, 'rgba(240,180,90,.5)');
  grad.addColorStop(1, 'rgba(240,180,90,0)');
  sg.fillStyle = grad; sg.fillRect(0, 0, 32, 32);
  let parts = [], w = 0, h = 0, visible = true;
  function size() {
    w = el.width = stage.clientWidth;
    h = el.height = stage.clientHeight;
    const n = mobileMQ.matches ? 16 : 38;
    parts = Array.from({ length: n }, () => ({
      x: Math.random() * w, y: Math.random() * h, z: 0.3 + Math.random() * 0.9,
      ph: Math.random() * Math.PI * 2,
    }));
  }
  function tick(t) {
    if (!visible) return;
    c.clearRect(0, 0, w, h);
    for (const q of parts) {
      q.y -= 0.18 * q.z; q.x += Math.sin(t * 0.6 + q.ph) * 0.12 * q.z;
      if (q.y < -20) { q.y = h + 20; q.x = Math.random() * w; }
      const s = 3 + q.z * 7;
      c.globalAlpha = (0.25 + 0.35 * Math.sin(t * 1.4 + q.ph) ** 2) * q.z;
      c.drawImage(sprite, q.x - s / 2, q.y - s / 2, s, s);
    }
  }
  if (useFilm) {
    size();
    window.addEventListener('resize', size);
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (!visible) c.clearRect(0, 0, w, h); }).observe(stage);
  }
  return { el, tick };
})();

// ---------------------------------------------------------------------------
// Motion system below the film
// ---------------------------------------------------------------------------
function splitLines(el) {
  const lines = el.innerHTML.split(/<br\s*\/?>/i);
  el.innerHTML = lines.map((l) => `<span class="split-line"><span>${l}</span></span>`).join('');
  return $$('.split-line > span', el);
}

function initReveals() {
  const els = $$('[data-rise]');
  if (!('IntersectionObserver' in window) || reducedMotion) { els.forEach((e) => e.classList.add('is-in')); return; }
  const io = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
  }), { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });
  els.forEach((e) => io.observe(e));
}

function initMotion() {
  // Film playhead: ScrollTrigger reports raw progress, the ticker eases toward it and
  // redraws only when something changed.
  if (film) {
    let target = 0, current = 0, rendered = -1;
    const st = ScrollTrigger.create({
      trigger: filmEl, start: 'top top', end: 'bottom bottom',
      onUpdate: (s) => { target = s.progress; },
    });
    target = current = st.progress;
    settleFilm = () => { target = current = rendered = st.progress; renderFilm(current); };
    gsap.ticker.add((time) => {
      const k = mobileMQ.matches ? 0.28 : 0.16;
      current += (target - current) * k;
      if (Math.abs(target - current) < 0.0002) current = target;
      if (current !== rendered) { rendered = current; renderFilm(current); }
      dust.tick(time);
    });
    renderFilm(current);
    // Hero line reveal once the opening frames are in.
    if (JUMP === null) filmReady.then(() => {
      const h1 = $('.beat--hero .display');
      gsap.from(splitLines(h1), { yPercent: 110, duration: 1.1, ease: 'power4.out', stagger: 0.09, delay: 0.15 });
      gsap.from($$('.beat--hero .eyebrow, .beat--hero .lede, .beat--hero .beat__ctas'), { y: 20, opacity: 0, duration: 0.8, ease: 'power3.out', stagger: 0.08, delay: 0.45 });
    });
  }

  const mm = gsap.matchMedia();
  mm.add({ desktop: '(min-width: 900px)', mobile: '(max-width: 899px)' }, (ctx) => {
    const { desktop } = ctx.conditions;
    const amt = desktop ? 1 : 0.45;

    // Section headline: line mask reveal.
    $$('[data-split]').forEach((el) => {
      if (!el.dataset.splitDone) { el.dataset.splitDone = '1'; el._lines = splitLines(el); }
      gsap.from(el._lines, {
        yPercent: 110, duration: 1, ease: 'power4.out', stagger: 0.1,
        scrollTrigger: { trigger: el, start: 'top 82%', once: true },
      });
    });

    // Image depth planes inside frames (product plane ≈ 0.8x, float plane ≈ 1.2x).
    $$('[data-depth]').forEach((img) => {
      const d = parseFloat(img.dataset.depth) * amt;
      gsap.fromTo(img, { yPercent: -d * 50 }, {
        yPercent: d * 50, ease: 'none',
        scrollTrigger: { trigger: img.closest('.feature') || img, start: 'top bottom', end: 'bottom top', scrub: true },
      });
    });

    // Full-bleed: the frame opens from an inset window to edge-to-edge.
    const bleed = $('[data-bleed]');
    gsap.fromTo($('.bleed__media', bleed), { clipPath: desktop ? 'inset(12% 8% 12% 8% round 8px)' : 'inset(6% 4% 6% 4% round 6px)' }, {
      clipPath: 'inset(0% 0% 0% 0% round 0px)', ease: 'none',
      scrollTrigger: { trigger: bleed, start: 'top 85%', end: 'top 10%', scrub: true },
    });
    gsap.fromTo($('.bleed__media img', bleed), { scale: 1.18 }, {
      scale: 1, ease: 'none',
      scrollTrigger: { trigger: bleed, start: 'top bottom', end: 'bottom top', scrub: true },
    });

    // Custom-order steps: rail fills, the step in focus comes forward.
    const steps = $('[data-steps]');
    gsap.fromTo('[data-steps-rail]', { scaleY: 0 }, {
      scaleY: 1, ease: 'none',
      scrollTrigger: { trigger: steps, start: 'top 65%', end: 'bottom 65%', scrub: true },
    });
    $$('.step', steps).forEach((s) => ScrollTrigger.create({
      trigger: s, start: 'top 68%', end: 'bottom 40%', toggleClass: 'is-active',
    }));

    // Story: background type 0.2x, portrait 0.6x.
    $$('[data-depth-y]').forEach((el) => {
      const d = parseFloat(el.dataset.depthY) * amt;
      gsap.fromTo(el, { yPercent: -d }, {
        yPercent: d, ease: 'none',
        scrollTrigger: { trigger: '.story', start: 'top bottom', end: 'bottom top', scrub: true },
      });
    });

    gsap.fromTo('.cta__media img', { scale: 1.25 }, {
      scale: 1.02, ease: 'none',
      scrollTrigger: { trigger: '.cta', start: 'top bottom', end: 'bottom bottom', scrub: true },
    });
  });

  // Pointer effects are desktop + fine pointer only.
  if (finePointer) {
    $$('[data-card3d]').forEach((el) => {
      const rx = gsap.quickTo(el, 'rotationX', { duration: 0.6, ease: 'power3.out' });
      const ry = gsap.quickTo(el, 'rotationY', { duration: 0.6, ease: 'power3.out' });
      gsap.set(el, { transformPerspective: 1100 });
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
        const ny = ((e.clientY - r.top) / r.height) * 2 - 1;
        rx(-ny * 5); ry(nx * 7);
      });
      el.addEventListener('pointerleave', () => { rx(0); ry(0); });
    });
    $$('[data-magnetic]').forEach((el) => {
      const x = gsap.quickTo(el, 'x', { duration: 0.5, ease: 'power3.out' });
      const y = gsap.quickTo(el, 'y', { duration: 0.5, ease: 'power3.out' });
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        x((e.clientX - r.left - r.width / 2) * 0.25);
        y((e.clientY - r.top - r.height / 2) * 0.35);
      });
      el.addEventListener('pointerleave', () => { x(0); y(0); });
    });
  }
}

// ---------------------------------------------------------------------------
// Contact links (only when the business has configured them — nothing invented)
// ---------------------------------------------------------------------------
getSiteConfig().then((cfg) => {
  const c = cfg.contact || {};
  const foot = $('[data-footer-contact]');
  const parts = [];
  if (c.email) {
    const a = $('[data-contact-email]'); a.href = `mailto:${c.email}`; a.hidden = false;
    parts.push(`<a href="mailto:${c.email}">${c.email}</a>`);
  }
  if (c.phone) {
    const a = $('[data-contact-phone]'); a.href = `sms:${c.phone}`; a.hidden = false;
    parts.push(`<a href="tel:${c.phone}">${c.phoneDisplay || c.phone}</a>`);
  }
  if (c.instagram) parts.push(`<a href="${c.instagram}" target="_blank" rel="noopener">Instagram</a>`);
  if (parts.length) { foot.innerHTML = parts.join(''); foot.hidden = false; }
});

// ---------------------------------------------------------------------------
// Boot + dev contract (?jump=<scrollY> lands pre-settled; window.__ready gates capture)
// ---------------------------------------------------------------------------
initReveals();
const fontsReady = document.fonts ? document.fonts.ready : Promise.resolve();
Promise.all([filmReady, fontsReady]).then(() => {
  loader.classList.add('is-done');
  $('[data-launcher]').classList.add('is-shown');
  if (canAnimate) initMotion();
  if (canAnimate) ScrollTrigger.refresh();
  if (JUMP !== null) {
    window.scrollTo(0, +JUMP || 0);
    if (canAnimate) {
      ScrollTrigger.update();
      $$('[data-rise]').forEach((e) => e.classList.add('is-in'));
      settleFilm();
    }
  }
  updateNav();
  requestAnimationFrame(() => requestAnimationFrame(() => { window.__ready = true; }));
});

if (DEBUG) {
  let last = performance.now(), deltas = [];
  const loop = (t) => { deltas.push(t - last); last = t; requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  setInterval(() => {
    const s = deltas.sort((a, b) => a - b); deltas = [];
    if (!s.length) return;
    console.log(`[jank] p95 ${s[Math.floor(s.length * 0.95)].toFixed(1)}ms  max ${s[s.length - 1].toFixed(1)}ms  frames loaded ${film ? film.loadedCount : 0}`);
  }, 2000);
  window.__film = film;
}
