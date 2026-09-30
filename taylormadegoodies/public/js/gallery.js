// Inertia ring gallery: drag / swipe to spin, let go and it keeps its momentum.
(() => {
  const stage = document.querySelector('[data-ring]');
  if (!stage) return;
  const ring = stage.querySelector('.ring');
  const items = [...ring.children];
  const n = items.length;
  const step = 360 / n;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let rot = 0, vel = 0, dragging = false, lastX = 0, lastT = 0, inView = false, idleAt = 0;

  function layout() {
    const w = items[0].offsetWidth;
    const r = Math.round((w / 2) / Math.tan(Math.PI / n) * 1.2);
    items.forEach((el, i) => { el.style.transform = `rotateY(${i * step}deg) translateZ(${r}px)`; });
    stage.style.setProperty('--r', r + 'px');
  }
  function paint() {
    ring.style.transform = `translateZ(calc(var(--r) * -1)) rotateX(var(--tilt)) rotateY(${rot}deg)`;
    items.forEach((el, i) => {
      const a = ((i * step + rot) % 360 + 360) % 360;             // 0 = facing viewer
      const f = (Math.cos(a * Math.PI / 180) + 1) / 2;             // 1 front … 0 back
      el.style.opacity = (0.35 + f * 0.65).toFixed(3);
      el.style.filter = `brightness(${(0.3 + f * 0.7).toFixed(3)})`;
    });
  }
  function tick(t) {
    if (!dragging) {
      if (Math.abs(vel) > 0.01) { rot += vel; vel *= 0.955; idleAt = t; }
      else if (!reduce && inView && t - idleAt > 1200) rot -= 0.08;   // gentle auto-spin when idle
    }
    paint();
    requestAnimationFrame(tick);
  }
  const x = (e) => (e.touches ? e.touches[0].clientX : e.clientX);
  stage.addEventListener('pointerdown', (e) => {
    dragging = true; vel = 0; lastX = e.clientX; lastT = performance.now();
    stage.setPointerCapture(e.pointerId); stage.classList.add('is-grabbing');
  });
  stage.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const now = performance.now(), dx = e.clientX - lastX;
    const d = dx * 0.28; rot += d;
    vel = d * (16 / Math.max(8, now - lastT));
    lastX = e.clientX; lastT = now;
  });
  const end = () => { if (!dragging) return; dragging = false; idleAt = performance.now(); stage.classList.remove('is-grabbing'); vel = Math.max(-18, Math.min(18, vel)); };
  stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end);
  stage.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { vel = 4; e.preventDefault(); }
    if (e.key === 'ArrowRight') { vel = -4; e.preventDefault(); }
  });
  new IntersectionObserver(([en]) => { inView = en.isIntersecting; }, { threshold: 0.15 }).observe(stage);
  addEventListener('resize', layout);
  layout(); paint(); requestAnimationFrame(tick);
})();
