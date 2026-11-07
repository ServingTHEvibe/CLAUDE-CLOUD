// The robot hammerhead as a film body: the approved still (shark.js, round 4) wrapped to the piranha film's contract,
// so its tour (tour_bee.js), stage, page and score port 1:1. Scaled to the piranha's size (nose to tail ~4.4 units,
// nose toward +x, near side +z). The five teardowns on the piranha's slots:
//   optics  (eye)    the near eye's rings unscrew out along its axis, 3 hidden rings follow, the iris opens 4x
//   wing    (fin)    the near pectoral leaves its root and turns over (not in this cut's script; used by the explode)
//   leg     (hammer) the near wing of the hammer telescopes out segment by segment, a servo spinning in every gap
//   thorax  (flank)  the near flank plates swing up on their top hinges one after another, the drive gears slide out
//   abdomen (jaw)    the lower jaw drops off its hinge, the teeth fly out along the lip and snap back
// explode: everything apart (head up, jaw down, plates off along their normals, fins out, tail segments apart).
import * as THREE from 'three';
import { buildShark, M as SM, bodyPt, headPt } from './shark.js';

export const FLOOR_Y = -1.28;
export const GAPE_LO = 18; // the jaw at rest, degrees
const SCALE = 0.44;
const OFFX = -0.78;
const V3 = THREE.Vector3;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const ssw = (x, a, b) => {
  const u = clamp((x - a) / (b - a), 0, 1);
  return u * u * u * (u * (u * 6 - 15) + 10);
};
const deg = (d) => (d * Math.PI) / 180;

export function buildHammer() {
  const P = buildShark();
  const root = new THREE.Group();
  const holder = new THREE.Group();
  holder.scale.setScalar(SCALE);
  holder.position.x = OFFX;
  root.add(holder);
  holder.add(P.root);
  const M = { lens: SM.lens, ...SM };
  const anchors = {};
  const anchor = (key, obj, p) => { anchors[key] = { obj, at: p.clone() }; };
  const head = P.head.children[0]; // neck -> head content group

  // ---------------------------------------------------------------- eye rig (near eye = +z)
  const nearEye = P.eyes.find((e) => e.side > 0);
  const lensAx = new THREE.Group();
  lensAx.rotation.y = -Math.PI / 2; // its +x is the eye's outward axis
  nearEye.g.add(lensAx);
  const ringGeo = new THREE.TorusGeometry(0.17, 0.03, 10, 40);
  const extra = new THREE.Group();
  nearEye.g.add(extra);
  const extraRings = [0.12, 0.26, 0.4].map((off, i) => {
    const r = new THREE.Mesh(ringGeo, i === 1 ? SM.steel : SM.dark);
    r.scale.setScalar(1 - i * 0.08);
    extra.add(r);
    return [r, off, (i % 2 ? -1 : 1) * 1.6];
  });
  const blades = [];
  const irisG = new THREE.Group();
  nearEye.g.add(irisG);
  for (let i = 0; i < 10; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.025, 0.006), SM.gearHi);
    const piv = new THREE.Group();
    piv.rotation.z = (i / 10) * Math.PI * 2;
    b.position.x = 0.07;
    piv.add(b);
    irisG.add(piv);
    blades.push(piv);
  }
  irisG.position.z = 0.02;
  const eyeParts = [
    { o: nearEye.lens, off: 0.55, s: 0.0, spin: 0 },
    { o: nearEye.bez, off: 0.42, s: 0.05, spin: 1.2 },
    { o: nearEye.iris, off: 0.5, s: 0.1, spin: -2 },
    { o: nearEye.house, off: 0.12, s: 0.12, spin: 0.6 },
  ].map((p) => ({ ...p, home: p.o.position.clone(), q0: p.o.quaternion.clone() }));
  anchor('lens', lensAx, new V3());
  anchor('eyeRing', nearEye.bez, new V3());
  anchor('barrel', nearEye.house, new V3());
  anchor('iris', nearEye.iris, new V3());
  anchor('lensRing', nearEye.lens, new V3(0, 0, 0.1));

  // ---------------------------------------------------------------- the hammer's near wing: telescoping segments
  const segsNear = P.hammerSegs.filter((h) => h.u0 >= 0); // [0,.22] root, then 3 that slide
  const segsFar = P.hammerSegs.filter((h) => h.u0 < 0);
  const servos = segsNear.slice(1).map((h) => {
    const g = new THREE.Group();
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.18, 24).rotateX(Math.PI / 2), SM.dark);
    const gr = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.05, 18).rotateX(Math.PI / 2), SM.gearHi);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.014, 8, 32), SM.green);
    g.add(drum, gr, ring);
    g.userData.gear = gr;
    g.visible = false;
    head.add(g);
    return { g, u: h.u0 };
  });
  const near = (u) => headPt(u, Math.PI / 2, 1);
  anchor('stalk', segsNear[1].g, near(0.34));
  anchor('joint', segsNear[2].g, near(0.46));
  anchor('tailHub', segsNear[3].g, near(0.85));
  anchor('tail', segsNear[3].g, nearEye.g.position.clone());
  anchor('bulb', segsNear[3].g, near(0.85));
  anchor('cage', segsNear[3].g, nearEye.g.position.clone());

  // ---------------------------------------------------------------- flank: hinged plates and the drive gears
  const body = P.body;
  const flank = [];
  for (const m of P.plates) {
    const d = m.userData.plate;
    if (d.s < 0.19 || d.s > 0.61) continue;
    const side = Math.sign(d.a);
    const aTop = side > 0 ? d.a0 : d.a1; // the edge nearer the spine
    if (Math.abs(d.a) < 0.6 || Math.abs(d.a) > 2.35) continue;
    const piv = new THREE.Group();
    piv.position.copy(bodyPt(d.s, aTop, 1));
    body.add(piv);
    piv.attach(m);
    flank.push({ piv, side, k: (d.s - 0.19) / 0.42 });
  }
  const mech = P.mech.map((m) => ({ ...m, rate: (m.side > 0 ? 1 : -1) * (0.6 + Math.abs(Math.sin(m.s * 40))) }));
  const nearGear = mech.find((m) => m.side > 0);
  anchor('flank', body, bodyPt(0.4, 1.3, 1));
  anchor('rib', flank.find((f) => f.side > 0)?.piv ?? body, new V3());
  anchor('gear', nearGear.o, new V3());
  anchor('core', body, bodyPt(0.4, 1.3, 0.75));
  anchor('spine', body, bodyPt(0.37, 0, 1.2));

  // ---------------------------------------------------------------- jaw, teeth, fins
  const jaw = P.jaw;
  anchor('jaw', jaw, bodyPt(0.0, Math.PI, 1).sub(jaw.position));
  const lo = P.teeth.filter((T) => T.row === 'lo' && T.side > 0).sort((a, b) => Math.abs(a.along - 0.3) - Math.abs(b.along - 0.3))[0];
  const up = P.teeth.filter((T) => T.row === 'up' && T.side > 0).sort((a, b) => Math.abs(a.along - 0.3) - Math.abs(b.along - 0.3))[0];
  anchor('fang', lo.o, new V3());
  anchor('upfang', up.o, new V3());
  const F = P.fins;
  anchor('finHub', F.pectR, new V3());
  anchor('fin', F.pectR, new V3(-0.3, 1.2, 0));
  for (const [alias, key] of [['shield', 'rib'], ['barrels', 'gear'], ['eyeGlass', 'eyeRing']]) anchors[alias] = anchors[key];

  // ---------------------------------------------------------------- explode directions
  const HOME = new Map();
  const keep = (o) => HOME.set(o, { p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone() });
  const home = (o) => {
    const h = HOME.get(o);
    o.position.copy(h.p); o.quaternion.copy(h.q); o.scale.copy(h.s);
    return o;
  };
  const neck = P.head;
  [jaw, neck, ...P.tail, P.caudalJoint, ...Object.values(F), ...P.eyes.map((e) => e.g), ...P.hammerSegs.map((h) => h.g), ...flank.map((f) => f.piv), ...P.plates]
    .forEach(keep);
  const plateFree = P.plates.filter((m) => m.parent === body); // plates not on a hinge
  const T0 = P.teeth.map((T) => T);

  const clear = [];
  root.traverse((o) => { if (o.isMesh && o.material && o.material.transparent) { o.castShadow = false; clear.push(o); } });
  const q = new THREE.Quaternion();
  const AZ = new V3(0, 0, 1);
  const AX = new V3(1, 0, 0);
  const tv = new V3();

  const pose = ({ t = 0, idle = 1, gape = GAPE_LO, swim = 0, eye = 0, fin = 0, finFlip = 0, lure = 0, rib = 0, drop = 0, teeth = null, explode = 0, spinT = t, bend = null } = {}) => {
    const k = idle;
    const e = clamp(explode, 0, 1);
    const kFar = ssw(e, 0.35, 1.0);
    const eyeK = Math.max(eye, ssw(e, 0.05, 0.5));
    const finK = Math.max(fin, ssw(e, 0.0, 0.45));
    const segK = Math.max(lure, ssw(e, 0.1, 0.55));
    const ribK = Math.max(rib, ssw(e, 0.0, 0.5));
    const ribFar = ssw(e, 0.0, 0.5);
    const dropK = Math.max(drop, ssw(e, 0.05, 0.5));
    const teethK = Math.max(teeth ?? drop, ssw(e, 0.1, 0.6));

    // ---- swim: the tail segments carry the stroke and the film's turn lag
    P.tail.forEach((g, i) => {
      home(g);
      const b = bend ? bend[Math.min(i, bend.length - 1)] ?? [0, 0] : [0, 0];
      g.rotation.y = 0.035 + 0.05 * k * Math.sin(t * 1.6 - i * 0.55) + 0.1 * swim * Math.sin(t * 3.1 - i * 0.55) + b[1] * 0.6;
      g.rotation.z = b[0] * 0.6;
      if (i > 0) g.position.x -= 0.5 * kFar;
    });
    home(P.caudalJoint);
    P.caudalJoint.rotation.y = 0.1 * k * Math.sin(t * 1.6 - 2) + 0.3 * swim * Math.sin(t * 3.1 - 2);
    P.caudalJoint.position.x -= 0.9 * kFar;

    // ---- head: a slow swing; in the explode it lifts and the hammer spreads
    home(neck);
    neck.rotation.y = 0.04 * k * Math.sin(t * 1.6 + 0.6) + 0.06 * swim * Math.sin(t * 3.1 + 0.6);
    neck.position.add(tv.set(0.9 * kFar, 1.6 * kFar, 0));

    // ---- jaw drops off the hinge, the teeth fly out along the lip
    home(jaw);
    jaw.rotation.z = deg(gape + 2 * k * Math.sin(t * 1.9) + 16 * dropK + 6 * dropK * Math.sin(spinT * 0.9));
    jaw.position.add(tv.set(0.35 * dropK + 1.0 * kFar, -0.75 * dropK - 1.4 * kFar, 0));
    for (const T of T0) {
      const d0 = 0.06 + 0.3 * T.along + (T.row === 'up' ? 0.05 : 0);
      const kk = ssw(teethK, d0, d0 + 0.55);
      T.o.position.copy(T.home);
      T.o.quaternion.copy(T.q0);
      if (kk <= 0) continue;
      const wave = 0.12 * kk * Math.sin(spinT * 0.95 - T.along * 7 + (T.row === 'up' ? 1.5 : 0));
      T.o.position.addScaledVector(T.out, (0.45 * kk) * (1 + 1.3 * kFar) + wave).addScaledVector(T.down, (T.row === 'up' ? -0.12 : 0.12) * kk);
      T.o.quaternion.multiply(q.setFromAxisAngle(AX, T.spin * kk + 0.5 * kk * spinT * Math.sign(T.spin)));
    }

    // ---- the eye: rings and lens unscrew out along the axis, three hidden rings follow, the iris opens
    for (const p of eyeParts) {
      const kk = ssw(eyeK, p.s, Math.min(1, p.s + 0.72));
      p.o.position.copy(p.home);
      p.o.quaternion.copy(p.q0);
      p.o.position.z += p.off * kk * (1 + 0.5 * kFar);
      if (p.spin) p.o.quaternion.multiply(q.setFromAxisAngle(AZ, p.spin * kk * (1 + 0.35 * spinT)));
    }
    extra.visible = eyeK > 0.002;
    const kr = ssw(eyeK, 0.14, 0.86);
    for (const [o, off, sp] of extraRings) {
      o.position.z = off * kr * (1 + 0.5 * kFar + 0.12 * Math.sin(spinT * 0.9 + off * 9));
      o.rotation.z = sp * kr * (1 + 0.35 * spinT);
    }
    const ki = ssw(eyeK, 0.5, 1.0);
    irisG.visible = eyeK > 0.05;
    irisG.position.z = 0.02 + 0.5 * ssw(eyeK, 0.1, 0.82);
    irisG.rotation.z = 0.7 * ki;
    blades.forEach((b, i) => { b.children[0].rotation.z = deg(12 + 70 * ki - 16 * ki * (0.5 + 0.5 * Math.sin(spinT * 1.6 + i))); b.children[0].position.x = 0.07 + 0.08 * ki; });
    for (const E of P.eyes) home(E.g).position.addScaledVector(E.dir, 1.6 * kFar);

    // ---- the hammer: the near wing telescopes out, a servo spinning in every gap; the far wing spreads in the explode
    let off = 0;
    segsNear.forEach((h, j) => {
      home(h.g);
      if (j === 0) return;
      const kk = ssw(segK, j * 0.08, j * 0.08 + 0.5);
      const gap = 0.42 * kk * (1 + 0.6 * kFar);
      const S = servos[j - 1];
      S.g.visible = kk > 0.01;
      S.g.position.copy(headPt(S.u, 0, 0)).add(tv.set(0, 0, off + gap * 0.5));
      S.g.scale.setScalar(Math.max(1e-3, Math.min(1, kk * 2)));
      S.g.userData.gear.rotation.z = spinT * (j % 2 ? 2.2 : -2.2);
      off += gap;
      h.g.position.z += off;
      h.g.position.y += 0.06 * kk * Math.sin(spinT * 0.55 + j * 1.3);
    });
    segsFar.forEach((h, j) => home(h.g).position.z -= 0.35 * kFar * (segsFar.length - j));

    // ---- fins: the near pectoral can leave its root and turn over; all fins move out in the explode
    const pect = (f, o, fl, sgn) => {
      home(f).position.add(tv.set(1.8 * o - 0.8 * kFar, -0.7 * o - 0.9 * kFar, sgn * (2.3 * o + 1.1 * kFar)));
      f.quaternion.premultiply(q.setFromAxisAngle(AX, Math.PI * 2 * fl + 0.4 * spinT * kFar));
    };
    pect(F.pectR, finK, finFlip, 1);
    pect(F.pectL, ssw(e, 0.0, 0.45), 0, -1);
    home(F.dorsal).position.y += 1.7 * kFar;
    F.dorsal.rotation.z += 0.03 * k * Math.sin(t * 1.4) + 0.06 * swim * Math.sin(t * 3.1);
    for (const n of ['pelvR', 'pelvL']) home(F[n]).position.y -= 1.0 * kFar;
    for (const n of ['dorsal2', 'anal']) home(F[n]).position.y += (n === 'anal' ? -0.9 : 0.9) * kFar;
    home(F.caudal);

    // ---- flank: the plates swing up on their top hinges one after another, the drive gears slide out spinning
    for (const f of flank) {
      const own = f.side > 0 ? ribK : ribFar;
      const kk = ssw(own, 0.1 + f.k * 0.25, 0.6 + f.k * 0.25);
      home(f.piv);
      f.piv.rotation.x = -f.side * deg(70 + 8 * Math.sin(spinT * 1.1 + f.k * 6)) * kk;
      f.piv.position.z += f.side * (0.25 * kk + 1.3 * kFar);
      f.piv.position.y += 0.5 * kFar;
    }
    for (const m of mech) {
      const own = m.side > 0 ? ribK : ribFar;
      const kk = ssw(own, 0.3 + 0.2 * ((m.s - 0.14) / 0.46), 0.8 + 0.2 * ((m.s - 0.14) / 0.46));
      const out = 0.55 * kk * (1 + 1.2 * kFar + 0.15 * Math.sin(spinT * 0.8 + m.s * 9));
      m.o.position.copy(m.home).addScaledVector(m.n, out);
      m.hub.position.copy(m.hubHome).addScaledVector(m.n, out);
      m.o.quaternion.copy(m.q0).multiply(q.setFromAxisAngle(AZ, m.rate * spinT * (1 + 4 * kk)));
    }
    for (const m of plateFree) {
      home(m).position.addScaledVector(m.userData.plate.n, 1.1 * kFar);
    }
  };
  pose({});

  const anchorAt = (key, out = new V3()) => {
    const a = anchors[key];
    a.obj.updateWorldMatrix(true, false);
    return out.copy(a.at).applyMatrix4(a.obj.matrixWorld);
  };
  const slots = { OPTICS: nearEye.g, WING: F.pectR, LEG: segsNear[2].g, THORAX: body, ABDOMEN: jaw };
  return { root, pose, clear, M, slots, anchors, anchorAt, teeth: P.teeth, stalkSegs: P.tail, ribs: flank, mech, coils: [] };
}
