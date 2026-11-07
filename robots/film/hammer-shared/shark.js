// Robotic hammerhead, built entirely in code.
// Units: total length L = 10 (nose x = +5, tail tip ~ x = -5). Y up. Shark's right side = +z.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const L = 10;
const X0 = L / 2;
const sx = (s) => X0 - s * L;
const TAU = Math.PI * 2;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const sg = Math.sign;

let seed = 11;
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const rr = (a, b) => a + (b - a) * rand();

export const stats = { big: 0, small: 0, meshes: 0 };

// ------------------------------------------------------------------ materials
export const M = {};
function makeMaterials() {
  M.shell = new THREE.MeshPhysicalMaterial({
    color: 0xf4f4f2, roughness: 0.28, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05,
    side: THREE.DoubleSide,
  });
  M.trim = new THREE.MeshPhysicalMaterial({ color: 0xd4d6d8, roughness: 0.3, metalness: 0.35, clearcoat: 0.8 });
  M.dark = new THREE.MeshStandardMaterial({ color: 0x1c1f22, roughness: 0.42, metalness: 0.65, envMapIntensity: 0.55, side: THREE.DoubleSide });
  M.gear = new THREE.MeshStandardMaterial({ color: 0x686e74, roughness: 0.28, metalness: 0.9, envMapIntensity: 1.1 });
  M.gearHi = new THREE.MeshStandardMaterial({ color: 0xa9afb4, roughness: 0.22, metalness: 0.95, envMapIntensity: 1.15 });
  M.steel = new THREE.MeshStandardMaterial({ color: 0xa4a9ad, roughness: 0.22, metalness: 1, envMapIntensity: 0.85 });
  M.rubber = new THREE.MeshStandardMaterial({ color: 0x101113, roughness: 0.6, metalness: 0.1, envMapIntensity: 0.5 });
  M.green = new THREE.MeshPhysicalMaterial({
    color: 0x66cf1f, emissive: 0x2c7404, emissiveIntensity: 0.4, roughness: 0.3, clearcoat: 1,
  });
  M.lens = new THREE.MeshPhysicalMaterial({
    color: 0x020202, roughness: 0.03, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.01, envMapIntensity: 1.6,
  });
  M.iris = new THREE.MeshPhysicalMaterial({ color: 0x3a463a, roughness: 0.15, clearcoat: 1, side: THREE.DoubleSide });
  M.tooth = new THREE.MeshPhysicalMaterial({ color: 0xe9e9e4, roughness: 0.25, metalness: 0.2, clearcoat: 1 });
}

function mesh(geo, mat, parent) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  stats.meshes++;
  if (parent) parent.add(m);
  return m;
}

// ------------------------------------------------------------------ geometry helpers
// Shell slab from a parametric surface f(u,v) -> Vector3, with thickness t inward.
// sign flips the computed normal so that it points outward.
function paramSlab(f, nu, nv, t, sign = 1) {
  const P = [], N = [];
  const e = 1e-3;
  let lastN = V(0, 1, 0);
  for (let i = 0; i <= nu; i++) {
    for (let j = 0; j <= nv; j++) {
      const u = i / nu, v = j / nv;
      const p = f(u, v);
      const du = f(Math.min(u + e, 1), v).sub(f(Math.max(u - e, 0), v));
      const dv = f(u, Math.min(v + e, 1)).sub(f(u, Math.max(v - e, 0)));
      const n = V().crossVectors(du, dv);
      if (n.lengthSq() < 1e-14) n.copy(lastN); else n.normalize().multiplyScalar(sign);
      lastN = n;
      P.push(p); N.push(n);
    }
  }
  const idx = (i, j) => i * (nv + 1) + j;
  const grid = (pts, flip) => {
    const pos = new Float32Array(pts.length * 3);
    pts.forEach((p, k) => p.toArray(pos, k * 3));
    const ind = [];
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const a = idx(i, j), b = idx(i + 1, j), c = idx(i + 1, j + 1), d = idx(i, j + 1);
      if (flip) ind.push(a, c, b, a, d, c); else ind.push(a, b, c, a, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(ind);
    g.computeVertexNormals();
    return g.toNonIndexed();
  };
  const geos = [grid(P, sign < 0)];
  if (t > 0) {
    const Q = P.map((p, k) => p.clone().addScaledVector(N[k], -t));
    geos.push(grid(Q, sign > 0));
    const pos = [];
    const edge = (list) => {
      for (let k = 0; k < list.length - 1; k++) {
        const a = list[k], b = list[k + 1];
        const o0 = P[a], o1 = P[b], q0 = Q[a], q1 = Q[b];
        pos.push(...o0.toArray(), ...o1.toArray(), ...q1.toArray(), ...o0.toArray(), ...q1.toArray(), ...q0.toArray());
      }
    };
    const e0 = [], e1 = [], e2 = [], e3 = [];
    for (let j = 0; j <= nv; j++) { e0.push(idx(0, j)); e1.push(idx(nu, j)); }
    for (let i = 0; i <= nu; i++) { e2.push(idx(i, 0)); e3.push(idx(i, nv)); }
    [e0, e1, e2, e3].forEach(edge);
    const b = new THREE.BufferGeometry();
    b.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    b.computeVertexNormals();
    geos.push(b);
  }
  return mergeGeometries(geos);
}

function orient(obj, axis) {
  obj.quaternion.setFromUnitVectors(V(0, 0, 1), axis.clone().normalize());
  return obj;
}

const cylCache = new Map();
function cylGeo(r0, r1, h, seg = 10) {
  const k = `${r0.toFixed(3)}|${r1.toFixed(3)}|${seg}`;
  if (!cylCache.has(k)) {
    const g = new THREE.CylinderGeometry(r0, r1, 1, seg, 1);
    g.rotateX(Math.PI / 2); // axis z, length 1 centred
    cylCache.set(k, g);
  }
  return cylCache.get(k);
}
// cylinder from a to b
function rod(a, b, r, mat, parent, r1 = r, seg = 10) {
  const d = b.clone().sub(a);
  const m = mesh(cylGeo(r, r1, 1, seg), mat, parent);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.scale.set(1, 1, d.length());
  orient(m, d);
  return m;
}

const gearCache = new Map();
function gearGeo(r, teeth, th) {
  const k = `${r.toFixed(3)}|${teeth}|${th.toFixed(3)}`;
  if (gearCache.has(k)) return gearCache.get(k);
  const sh = new THREE.Shape();
  const depth = Math.min(0.06, r * 0.16);
  const ro = r, ri = r - depth;
  for (let i = 0; i < teeth; i++) {
    const a0 = (i / teeth) * TAU, st = TAU / teeth;
    const pts = [[a0, ri], [a0 + st * 0.2, ro], [a0 + st * 0.48, ro], [a0 + st * 0.68, ri]];
    pts.forEach(([a, rad], q) => {
      const x = Math.cos(a) * rad, y = Math.sin(a) * rad;
      if (i === 0 && q === 0) sh.moveTo(x, y); else sh.lineTo(x, y);
    });
  }
  sh.closePath();
  if (r > 0.09) {
    const hub = new THREE.Path(); hub.absarc(0, 0, r * 0.13, 0, TAU, true); sh.holes.push(hub);
    const nh = r > 0.22 ? 6 : 5;
    for (let i = 0; i < nh; i++) {
      const a = (i / nh) * TAU, h = new THREE.Path();
      h.absarc(Math.cos(a) * r * 0.52, Math.sin(a) * r * 0.52, r * 0.17, 0, TAU, true);
      sh.holes.push(h);
    }
  }
  const g = new THREE.ExtrudeGeometry(sh, { depth: th, bevelEnabled: false, curveSegments: 8 });
  g.translate(0, 0, -th / 2);
  gearCache.set(k, g);
  return g;
}
function gear(pos, axis, r, parent, { th = 0.05, mat = M.gear, big = true, teeth } = {}) {
  teeth = teeth || Math.max(10, Math.round(r * 70));
  const m = mesh(gearGeo(r, teeth, th), mat, parent);
  m.position.copy(pos); orient(m, axis);
  m.rotateZ(rand() * TAU);
  // hub with bolts
  const hub = mesh(cylGeo(r * 0.2, r * 0.2, 1, 12), M.gearHi, parent);
  hub.position.copy(pos); hub.scale.z = th * 1.8; orient(hub, axis);
  m.userData.hub = hub;
  if (big) stats.big++; else stats.small++;
  return m;
}

function hose(points, r, parent, mat = M.rubber) {
  const c = new THREE.CatmullRomCurve3(points);
  const m = mesh(new THREE.TubeGeometry(c, 20, r, 7, false), mat, parent);
  // ferrules
  [0, 1].forEach((t) => {
    const p = c.getPointAt(t), d = c.getTangentAt(t);
    rod(p.clone().addScaledVector(d, -0.04), p.clone().addScaledVector(d, 0.04), r * 1.45, M.steel, parent);
  });
  stats.small++;
  return m;
}
function wires(points, parent, n = 3, r = 0.011) {
  const c = new THREE.CatmullRomCurve3(points);
  for (let k = 0; k < n; k++) {
    const off = V(rr(-1, 1), rr(-1, 1), rr(-1, 1)).multiplyScalar(r * 2.6);
    const pts = c.getPoints(10).map((p, i) => p.clone().add(off.clone().multiplyScalar(Math.sin((i / 10) * Math.PI) + 0.4)));
    mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, r, 5, false), k === 1 ? M.gearHi : M.rubber, parent);
    stats.small++;
  }
}
function piston(a, b, r, parent) {
  const m = a.clone().lerp(b, 0.55);
  rod(a, m, r, M.dark, parent, r, 12);
  rod(m.clone().lerp(a, 0.06), b, r * 0.45, M.steel, parent, r * 0.45, 8);
  [a, b].forEach((p) => {
    const e = mesh(new THREE.SphereGeometry(r * 1.15, 10, 8), M.gearHi, parent);
    e.position.copy(p);
  });
  stats.small++;
}
function screw(p, n, parent) {
  const m = mesh(cylGeo(0.017, 0.017, 1, 8), M.steel, parent);
  m.position.copy(p); m.scale.z = 0.016; orient(m, n);
  stats.small++;
}

// ------------------------------------------------------------------ body profile
// s, vertical radius, lateral radius, centre y
const KN = [
  [-0.035, 0.08, 0.12, -0.32],
  [-0.015, 0.24, 0.34, -0.3],
  [0.0, 0.33, 0.44, -0.27],
  [0.03, 0.43, 0.54, -0.22],
  [0.08, 0.58, 0.65, -0.12],
  [0.15, 0.82, 0.8, 0.02],
  [0.25, 1.02, 0.9, 0.04],
  [0.36, 1.1, 0.92, 0.05],
  [0.47, 1.0, 0.82, 0.07],
  [0.56, 0.78, 0.62, 0.1],
  [0.64, 0.52, 0.43, 0.14],
  [0.73, 0.4, 0.31, 0.18],
  [0.82, 0.3, 0.23, 0.22],
  [0.90, 0.23, 0.17, 0.26],
];
function prof(s) {
  let i = 0;
  while (i < KN.length - 2 && s > KN[i + 1][0]) i++;
  const p0 = KN[Math.max(i - 1, 0)], p1 = KN[i], p2 = KN[i + 1], p3 = KN[Math.min(i + 2, KN.length - 1)];
  const t = THREE.MathUtils.clamp((s - p1[0]) / (p2[0] - p1[0]), 0, 1);
  const cr = (k) => {
    const a = p0[k], b = p1[k], c = p2[k], d = p3[k];
    return 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
  };
  return { ry: cr(1), rz: cr(2), cy: cr(3) };
}
const E = 2 / 2.4;
function bodyPt(s, a, k = 1, xoff = 0) {
  const p = prof(s), c = Math.cos(a), sn = Math.sin(a);
  return V(sx(s) - xoff, p.cy + k * p.ry * sg(c) * Math.abs(c) ** E, k * p.rz * sg(sn) * Math.abs(sn) ** E);
}
function bodyNormal(s, a) {
  const p = prof(s), c = Math.cos(a), sn = Math.sin(a);
  return V(0, c / p.ry, sn / p.rz).normalize();
}
function bodyPatch(s0, s1, a0, a1, { k = 1, t = 0.045, xoff = 0 } = {}) {
  const nu = Math.max(3, Math.ceil((s1 - s0) * L * 9));
  const nv = Math.max(4, Math.ceil(Math.abs(a1 - a0) * 9));
  return paramSlab((u, v) => bodyPt(s0 + (s1 - s0) * u, a0 + (a1 - a0) * v, k, xoff), nu, nv, t, 1);
}

// ------------------------------------------------------------------ head (cephalofoil)
const HW = 2.75;
const HE = 2 / 2.7;
function headPt(U, th, k = 1) {
  const c = 0.78 * (1 - 0.4 * U * U);
  const t = 0.34 * (1 - 0.25 * U * U);
  const xc = X0 + 0.42 - 0.78 - 0.55 * U * U;
  const yc = 0.26 - 0.06 * U * U;
  const cs = Math.cos(th), sn = Math.sin(th);
  const sy = sn < 0 ? 0.82 : 1;
  return V(xc + k * c * sg(cs) * Math.abs(cs) ** HE, yc + k * t * sy * sg(sn) * Math.abs(sn) ** HE, U * HW * (k < 1 ? 0.99 : 1));
}
function headPatch(U0, U1, th0, th1, { k = 1, t = 0.04 } = {}) {
  const nu = Math.max(4, Math.ceil(Math.abs(U1 - U0) * 14));
  const nv = Math.max(4, Math.ceil(Math.abs(th1 - th0) * 8));
  return paramSlab((u, v) => headPt(U0 + (U1 - U0) * u, th0 + (th1 - th0) * v, k), nu, nv, t, -1);
}

// ------------------------------------------------------------------ fins
function resample(pts, n) {
  const seg = [];
  let tot = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    seg.push(l); tot += l;
  }
  const out = [];
  for (let k = 0; k < n; k++) {
    let d = (k / n) * tot, i = 0;
    while (d > seg[i]) { d -= seg[i]; i++; }
    const a = pts[i], b = pts[(i + 1) % pts.length], t = d / seg[i];
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}
function finTexture(o, root, tip, bb) {
  const S = 512, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const map = (p) => [((p[0] - bb.minx) / bb.w) * S, (1 - (p[1] - bb.miny) / bb.h) * S];
  ctx.beginPath();
  o.forEach((p, i) => { const q = map(p); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); });
  ctx.closePath();
  ctx.save();
  ctx.clip();
  const R = map(root), T = map(tip);
  const g = ctx.createRadialGradient(R[0], R[1], 0, R[0], R[1], S * 1.0);
  g.addColorStop(0, 'rgba(200,206,205,0.95)');
  g.addColorStop(1, 'rgba(232,236,235,0.78)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 3000; i++) { // frost
    ctx.fillStyle = rand() < 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(150,158,156,0.05)';
    ctx.fillRect(rand() * S, rand() * S, 2, 2);
  }
  ctx.lineCap = 'round';
  const dir = [T[0] - R[0], T[1] - R[1]], dl = Math.hypot(...dir);
  const per = [-dir[1] / dl, dir[0] / dl];
  // main vein
  ctx.strokeStyle = 'rgba(118,128,125,0.6)';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(R[0], R[1]);
  ctx.quadraticCurveTo(R[0] + dir[0] * 0.5 + per[0] * 12, R[1] + dir[1] * 0.5 + per[1] * 12, T[0], T[1]);
  ctx.stroke();
  const samples = resample(o, 46).map(map);
  samples.forEach((P, k) => {
    const dx = P[0] - R[0], dy = P[1] - R[1];
    if (Math.hypot(dx, dy) < S * 0.18) return;
    const tt = THREE.MathUtils.clamp((dx * dir[0] + dy * dir[1]) / (dl * dl), 0.04, 0.85);
    const B = [R[0] + dir[0] * tt * 0.85, R[1] + dir[1] * tt * 0.85];
    const C = [(B[0] + P[0]) / 2 + (dir[0] / dl) * 22, (B[1] + P[1]) / 2 + (dir[1] / dl) * 22];
    ctx.strokeStyle = 'rgba(110,120,117,0.62)';
    ctx.lineWidth = 1.7;
    ctx.beginPath(); ctx.moveTo(B[0], B[1]); ctx.quadraticCurveTo(C[0], C[1], P[0], P[1]); ctx.stroke();
    // fork near the edge
    const Q = samples[(k + 1) % samples.length];
    const F = [(C[0] + P[0]) / 2, (C[1] + P[1]) / 2];
    ctx.lineWidth = 0.9;
    ctx.strokeStyle = 'rgba(130,140,137,0.42)';
    ctx.beginPath(); ctx.moveTo(F[0], F[1]); ctx.lineTo((P[0] + Q[0]) / 2, (P[1] + Q[1]) / 2); ctx.stroke();
  });
  ctx.restore();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// outline: [[x,y]...] local x = chord (forward), y = span. Closed polygon.
function makeFin(outline, { scale = 1, tip, lead, rims, sparW = 0.13, joint = true }) {
  const o = outline.map(([x, y]) => [x * scale, y * scale]);
  const grp = new THREE.Group();
  const xs = o.map((p) => p[0]), ys = o.map((p) => p[1]);
  const bb = { minx: Math.min(...xs), miny: Math.min(...ys) };
  bb.w = Math.max(...xs) - bb.minx; bb.h = Math.max(...ys) - bb.miny;
  const root = [(o[0][0] + o[o.length - 1][0]) / 2, (o[0][1] + o[o.length - 1][1]) / 2];
  const shape = new THREE.Shape(o.map((p) => new THREE.Vector2(p[0], p[1])));
  const geo = new THREE.ShapeGeometry(shape, 16);
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) - bb.minx) / bb.w, (pos.getY(i) - bb.miny) / bb.h);
  const mat = new THREE.MeshPhysicalMaterial({
    map: finTexture(o, root, o[tip], bb), transparent: true, roughness: 0.55, metalness: 0,
    clearcoat: 0.35, clearcoatRoughness: 0.35, side: THREE.DoubleSide, depthWrite: false,
  });
  const mem = mesh(geo, mat, grp);
  mem.renderOrder = 2;

  // white leading-edge spar
  const cen = [xs.reduce((a, b) => a + b) / xs.length, ys.reduce((a, b) => a + b) / ys.length];
  const lp = o.slice(lead[0], lead[1] + 1);
  const inner = lp.map((p, k) => {
    const a = lp[Math.max(k - 1, 0)], b = lp[Math.min(k + 1, lp.length - 1)];
    let n = [-(b[1] - a[1]), b[0] - a[0]];
    const nl = Math.hypot(...n); n = [n[0] / nl, n[1] / nl];
    if ((cen[0] - p[0]) * n[0] + (cen[1] - p[1]) * n[1] < 0) n = [-n[0], -n[1]];
    const w = (sparW * scale) * (1 - k / lp.length) ** 0.8 + 0.025;
    return [p[0] + n[0] * w, p[1] + n[1] * w];
  });
  const sp = new THREE.Shape([...lp, ...inner.reverse()].map((p) => new THREE.Vector2(p[0], p[1])));
  const sg2 = new THREE.ExtrudeGeometry(sp, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.01, bevelSegments: 2, curveSegments: 4 });
  sg2.translate(0, 0, -0.025);
  mesh(sg2, M.shell, grp);

  // green rim along the tips
  rims.forEach(([i0, i1]) => {
    const pts = [];
    for (let i = i0; i <= i1; i++) pts.push(V(o[i][0], o[i][1], 0));
    const c = new THREE.CatmullRomCurve3(pts);
    mesh(new THREE.TubeGeometry(c, 24, 0.011, 6, false), M.green, grp);
  });

  if (joint) {
    const ch = Math.abs(o[0][0] - o[o.length - 1][0]);
    const hx = root[0];
    rod(V(hx + ch * 0.35, 0, 0), V(hx - ch * 0.35, 0, 0), 0.075, M.dark, grp, 0.075, 14);
    gear(V(hx + ch * 0.18, 0.02, 0), V(0, 0, 1), 0.12, grp, { th: 0.04 });
    const ring = mesh(new THREE.TorusGeometry(0.085, 0.012, 8, 28), M.green, grp);
    ring.position.set(hx + ch * 0.36, 0, 0);
    ring.rotation.y = Math.PI / 2;
    stats.big++;
  }
  return grp;
}
function finBasis(C, D) {
  C = C.clone().normalize();
  D = D.clone().sub(C.clone().multiplyScalar(D.dot(C))).normalize();
  const N = V().crossVectors(C, D);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(C, D, N));
}

const DORSAL = [[0.55, 0], [0.42, 0.45], [0.2, 0.95], [-0.08, 1.42], [-0.45, 1.84], [-0.5, 1.7], [-0.52, 1.3], [-0.6, 0.8], [-0.74, 0.36], [-0.92, 0.1], [-0.8, 0]];
const PECT = [[0.42, 0], [0.3, 0.55], [0.07, 1.15], [-0.26, 1.75], [-0.64, 2.32], [-0.74, 2.22], [-0.68, 1.75], [-0.6, 1.15], [-0.52, 0.55], [-0.44, 0]];
const CAUDAL = [[0.15, 0.22], [-0.25, 0.85], [-0.8, 1.65], [-1.35, 2.35], [-1.8, 2.88], [-1.84, 2.64], [-1.64, 1.86], [-1.42, 1.05], [-1.24, 0.45], [-1.2, 0.1], [-1.4, -0.45], [-1.64, -1.26], [-1.42, -1.16], [-0.96, -0.79], [-0.46, -0.42], [0.15, -0.18]];
const SMALL = [[0.26, 0], [0.13, 0.3], [-0.12, 0.56], [-0.22, 0.49], [-0.23, 0.25], [-0.34, 0.05], [-0.26, 0]];

// ------------------------------------------------------------------ eye
function eye(parent, pos, dir) {
  const g = new THREE.Group();
  g.position.copy(pos); orient(g, dir);
  parent.add(g);
  const lens = mesh(new THREE.SphereGeometry(0.19, 40, 28), M.lens, g);
  lens.scale.z = 0.62;
  const bez = mesh(new THREE.TorusGeometry(0.193, 0.014, 10, 56), M.green, g);
  bez.position.z = 0.012;
  const house = mesh(new THREE.TorusGeometry(0.215, 0.035, 10, 56), M.dark, g);
  house.position.z = -0.02;
  const iris = mesh(new THREE.RingGeometry(0.02, 0.042, 32), M.iris, g);
  iris.position.z = 0.19 * 0.62 + 0.002;
  stats.big++;
  return { g, lens, bez, house, iris };
}

// ------------------------------------------------------------------ build
export function buildShark() {
  makeMaterials();
  stats.big = stats.small = stats.meshes = 0;
  seed = 11;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const parts = { root, body, tail: [], fins: {}, head: null, eyes: [], hammerSegs: [], plates: [], mech: [], teeth: [], kit: [] };

  // ---- torso plates (round 3): 3 sizes, gaps of ~0.09 over the mechanism, every plate bulged
  const GAP = 0.045;
  const plateP = (s0, s1, a0, a1, { bulge = 0.035, parent = body, xoff = 0, t = 0.045, gap = GAP, rv = true } = {}) => {
    const pr = prof((s0 + s1) / 2);
    const ds = gap / L, da = gap / Math.max(0.2, (pr.ry + pr.rz) / 2);
    const S0 = s0 + ds, S1 = s1 - ds, A0 = a0 + da, A1 = a1 - da;
    if (S1 <= S0 || A1 <= A0) return null;
    const bl = (u, v) => bulge * Math.pow(Math.max(0, Math.sin(Math.PI * u) * Math.sin(Math.PI * v)), 0.6);
    const f = (u, v) => {
      const ss = S0 + (S1 - S0) * u, aa = A0 + (A1 - A0) * v;
      return bodyPt(ss, aa, 1, xoff).addScaledVector(bodyNormal(ss, aa), bl(u, v));
    };
    const nu = Math.max(3, Math.ceil((S1 - S0) * L * 9)), nv = Math.max(4, Math.ceil((A1 - A0) * 9));
    const m = mesh(paramSlab(f, nu, nv, t, 1), M.shell, parent);
    { const sc = (S0 + S1) / 2, ac = (A0 + A1) / 2; m.userData.plate = { s: sc, a: ac, a0: A0, a1: A1, s0: S0, s1: S1, n: bodyNormal(sc, ac) }; if (parent === body) parts.plates.push(m); }
    const big = (S1 - S0) * L > 0.5 && (A1 - A0) > 0.4;
    if (rv && big) for (const [u, v] of [[0.08, 0.12], [0.92, 0.12], [0.92, 0.88], [0.08, 0.88]]) {
      const ss = S0 + (S1 - S0) * u, aa = A0 + (A1 - A0) * v;
      screw(f(u, v).addScaledVector(bodyNormal(ss, aa), 0.004), bodyNormal(ss, aa), parent);
    }
    return m;
  };
  const sym = (s0, s1, a0, a1, o) => { plateP(s0, s1, a0, a1, o); plateP(s0, s1, -a1, -a0, o); };
  const rowS = (cuts, a0, a1, o) => { for (let i = 0; i < cuts.length - 1; i++) sym(cuts[i], cuts[i + 1], a0, a1, o); };
  // dorsal row across the spine: big, medium and small plates in turn
  const dCuts = [-0.03, 0.09, 0.2, 0.25, 0.33, 0.41, 0.46, 0.53, 0.6];
  for (let i = 0; i < dCuts.length - 1; i++) plateP(dCuts[i], dCuts[i + 1], -0.55, 0.55, { bulge: 0.05 });
  // belly row
  [0.13, 0.25, 0.32, 0.43, 0.6].reduce((a0, a1) => (plateP(a0, a1, 2.3, TAU - 2.3, { bulge: 0.04 }), a1));
  // shoulder: upper, middle and lower rows, each cut differently
  rowS([-0.03, 0.07, 0.15], 0.55, 1.2, { bulge: 0.05 });
  sym(0.2, 0.25, 0.55, 1.0, {});
  rowS([-0.03, 0.03, 0.08, 0.13, 0.2], 1.2, 1.75, { bulge: 0.04 });
  sym(-0.03, 0.13, 1.75, 1.95, { bulge: 0.02, rv: false }); // the lip the upper teeth hang from
  sym(0.13, 0.17, 1.75, 2.3, { bulge: 0.03 });
  // ribs wrapping the flank, and a few cover plates inside the bays
  sym(0.326, 0.355, 0.55, 2.3, { gap: 0.02, bulge: 0.02 });
  sym(0.458, 0.487, 0.55, 2.3, { gap: 0.02, bulge: 0.02 });
  sym(0.5, 0.6, 0.55, 1.05, { bulge: 0.05 });
  sym(0.25, 0.3, 1.85, 2.3, {});
  sym(0.38, 0.43, 1.95, 2.3, {});
  sym(0.2, 0.25, 1.85, 2.3, {});
  sym(0.2, 0.262, 1.2, 1.85, { bulge: 0.04 });
  const wins = [
    [0.17, 0.25, 1.78, 2.28],
    [0.15, 0.2, 0.6, 1.2],
    [0.25, 0.326, 0.6, 1.2], [0.262, 0.326, 1.2, 1.85],
    [0.355, 0.458, 0.6, 1.2], [0.355, 0.458, 1.2, 2.25],
    [0.487, 0.6, 1.05, 1.75], [0.487, 0.6, 1.75, 2.25],
  ];
  // dark inner mass
  mesh(bodyPatch(-0.03, 0.605, 0, TAU, { k: 0.8, t: 0 }), M.dark, body);

  // kitbash layer between the core and the plates, so every gap shows machine (merged per material)
  const kitShop = () => {
    const bins = new Map();
    let place = new THREE.Matrix4();
    const add = (geo, mat, local) => {
      const g = geo.clone();
      if (local) g.applyMatrix4(local);
      g.applyMatrix4(place);
      if (g.index) { const n = g.toNonIndexed(); g.dispose(); bins.has(mat) || bins.set(mat, []); bins.get(mat).push(n); return; }
      bins.has(mat) || bins.set(mat, []);
      bins.get(mat).push(g);
    };
    const T = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
    const cyl = (r, h) => new THREE.CylinderGeometry(r, r, h, 10).rotateZ(Math.PI / 2);
    const types = [
      (k) => { add(cyl(0.05 * k, 0.22 * k), M.dark, T(0, 0.05 * k, 0)); add(cyl(0.02 * k, 0.2 * k), M.steel, T(0.2 * k, 0.05 * k, 0)); },
      (k) => add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(-0.2 * k, 0, 0), V(-0.06 * k, 0.12 * k, 0.05 * k), V(0.1 * k, 0.13 * k, 0.1 * k), V(0.22 * k, 0, 0.12 * k)]), 10, 0.024 * k, 6), M.rubber),
      (k) => { add(new THREE.BoxGeometry(0.3 * k, 0.03 * k, 0.2 * k), M.gear, T(0, 0.015 * k, 0)); for (let i = 0; i < 4; i++) add(new THREE.BoxGeometry(0.05 * k, 0.03 * k, 0.05 * k), M.dark, T((-0.08 + (i % 2) * 0.12) * k, 0.04 * k, (i < 2 ? -0.05 : 0.05) * k)); },
      (k) => { add(gearGeo(0.1 * k, 12 + Math.floor(rand() * 6), 0.035 * k).clone().rotateX(Math.PI / 2), rand() < 0.3 ? M.gearHi : M.gear, T(0, 0.03 * k, 0)); },
      (k) => { add(new THREE.BoxGeometry(0.12 * k, 0.09 * k, 0.1 * k), rand() < 0.5 ? M.dark : M.gear, T(0, 0.045 * k, 0)); add(new THREE.CylinderGeometry(0.02 * k, 0.02 * k, 0.04 * k, 6), M.steel, T(0.02 * k, 0.1 * k, 0)); },
      (k) => { add(cyl(0.06 * k, 0.15 * k), M.gearHi, T(0, 0.06 * k, 0)); add(cyl(0.07 * k, 0.035 * k), M.dark, T(0.09 * k, 0.06 * k, 0)); },
    ];
    let n = 0;
    return {
      drop(p, nrm, k) {
        const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), nrm.clone().normalize());
        q.multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), rand() * TAU));
        place = new THREE.Matrix4().compose(p, q, V(1, 1, 1));
        types[Math.floor(rand() * types.length)](k);
        n++;
      },
      into(parent) {
        for (const [mat, list] of bins) {
          const clean = list.map((g) => { for (const key of Object.keys(g.attributes)) if (key !== 'position' && key !== 'normal') g.deleteAttribute(key); return g; });
          mesh(mergeGeometries(clean), mat, parent);
        }
        stats.small += n;
      },
    };
  };
  {
    const k = kitShop();
    for (let i = 0; i < 520; i++) {
      const ss = rr(-0.02, 0.6), aa = rr(0, TAU);
      if (ss < 0.15 && Math.abs(Math.abs(aa - Math.PI) - 0) < 1.35) continue; // keep the mouth clean
      k.drop(bodyPt(ss, aa, rr(0.8, 0.84)), bodyNormal(ss, aa), rr(0.6, 1.05));
    }
    k.into(body);
  }

  // ---- window mechanism (both sides)
  const fillWindow = (s0, s1, a0, a1, parent, xoff = 0) => {
    const sm = (s0 + s1) / 2, am = (a0 + a1) / 2;
    const span = (s1 - s0) * L;
    // gear train on a shaft along x
    const shaftA = bodyPt(s0 - 0.005, am, 0.6, xoff), shaftB = bodyPt(s1 + 0.005, am, 0.6, xoff);
    rod(shaftA, shaftB, 0.035, M.gearHi, parent);
    const ng = Math.max(3, Math.round(span / 0.13));
    for (let i = 0; i < ng; i++) {
      const t = (i + 0.5) / ng;
      const s = s0 + (s1 - s0) * t;
      const pr = prof(s);
      const p = bodyPt(s, am, 0.6, xoff);
      const r = Math.min(pr.ry, pr.rz) * rr(0.2, 0.33);
      gear(p, V(1, 0, 0), r, parent, { th: rr(0.035, 0.06), mat: i % 3 === 1 ? M.gearHi : M.gear, big: r > 0.12 });
    }
    // big face gear facing outward
    const ab = am + (a1 - a0) * rr(-0.15, 0.15);
    const pr = prof(sm);
    const R = Math.min(span * 0.36, 0.42 * Math.min(pr.ry, pr.rz));
    { const fg = gear(bodyPt(sm, ab, 0.9, xoff), bodyNormal(sm, ab), R, parent, { th: 0.05, mat: M.gearHi }); parts.mech.push({ o: fg, hub: fg.userData.hub, n: bodyNormal(sm, ab), s: sm, side: Math.sign(am), home: fg.position.clone(), hubHome: fg.userData.hub.position.clone(), q0: fg.quaternion.clone() }); }
    // small meshing gears around it
    for (let q = 0; q < 2; q++) {
      const s = sm + (q ? 1 : -1) * (s1 - s0) * 0.33;
      const a = ab + (q ? -1 : 1) * (a1 - a0) * 0.28;
      gear(bodyPt(s, a, 0.9, xoff), bodyNormal(s, a), R * rr(0.35, 0.5), parent, { th: 0.04, mat: M.gearHi, big: false });
    }
    // pistons along the window edges
    for (const a of [a0 + 0.08, a1 - 0.08]) {
      piston(bodyPt(s0 + 0.004, a, 0.93, xoff), bodyPt(s1 - 0.004, a, 0.93, xoff), 0.038, parent);
    }
    // a diagonal actuator
    piston(bodyPt(s0 + 0.01, a1 - 0.15, 0.86, xoff), bodyPt(s1 - 0.01, a0 + 0.2, 0.9, xoff), 0.03, parent);
    // hoses
    hose([bodyPt(s0, a0 + 0.2, 0.9, xoff), bodyPt(sm, am + 0.1, 0.97, xoff), bodyPt(s1, a1 - 0.25, 0.88, xoff)], 0.03, parent);
    hose([bodyPt(s0, a1 - 0.1, 0.85, xoff), bodyPt(sm - 0.01, am - 0.15, 0.95, xoff), bodyPt(s1, a0 + 0.1, 0.86, xoff)], 0.024, parent);
    // wiring
    wires([bodyPt(s0, am - 0.25, 0.92, xoff), bodyPt(sm, am - 0.3, 0.96, xoff), bodyPt(s1, am - 0.2, 0.92, xoff)], parent, 3);
    stats.big++; // actuator assembly
  };
  for (const side of [1, -1]) {
    wins.forEach(([s0, s1, a0, a1]) => fillWindow(s0, s1, ...(side > 0 ? [a0, a1] : [-a1, -a0]), body));
  }

  // ---- head
  // neck pivot at the back of the hammer; content stays in body coordinates
  const neck = new THREE.Group();
  neck.position.set(X0 - 1.0, 0.1, 0);
  body.add(neck);
  const head = new THREE.Group();
  head.position.set(-(X0 - 1.0), -0.1, 0);
  neck.add(head);
  parts.head = neck;
  const hs = (geo) => mesh(geo, M.shell, head);
  const P = Math.PI;
  // round 3: hammer in plates of 3 sizes with gaps (~0.09) over the head's machine
  const cutsU = [-1, -0.7, -0.46, -0.22, 0, 0.22, 0.46, 0.7, 1];
  const gU = 0.016, gT = 0.07;
  const bands = [[-0.5 * P, 0.06 * P], [0.06 * P, 0.36 * P], [0.36 * P, 0.74 * P], [0.74 * P, 1.1 * P], [1.1 * P, 1.5 * P]];
  for (let i = 0; i < cutsU.length - 1; i++) { const sg = new THREE.Group(); head.add(sg); parts.hammerSegs.push({ g: sg, u0: cutsU[i], u1: cutsU[i + 1] }); }
  for (let i = 0; i < cutsU.length - 1; i++) {
    const u0 = cutsU[i], u1 = cutsU[i + 1];
    const g0 = u0 + (i ? gU : 0), g1 = u1 - (i < cutsU.length - 2 ? gU : 0);
    bands.forEach(([t0, t1], bi) => {
      const win = bi === 2 && Math.abs(u0) <= 0.7 && Math.abs(u1) <= 0.7 && Math.max(Math.abs(u0), Math.abs(u1)) > 0.22;
      if (win) return;
      // merge pairs on the underside so plates come in different sizes
      if (bi === 4 && i % 2 === 1) return;
      const g1b = bi === 4 && i < cutsU.length - 2 ? cutsU[Math.min(i + 2, cutsU.length - 1)] - (i + 2 < cutsU.length - 1 ? gU : 0) : g1;
      mesh(headPatch(g0, g1b, t0 + gT / 2, t1 - gT / 2), M.shell, parts.hammerSegs[i].g);
    });
  }
  {
    const k = kitShop();
    for (let i = 0; i < 160; i++) {
      const U = rr(-0.97, 0.97), th = rr(0, TAU);
      const p = headPt(U, th, 0.8);
      k.drop(p, p.clone().sub(headPt(U, th, 0.4)), rr(0.3, 0.5));
    }
    k.into(head);
  }
  // head interior + window mechanism
  mesh(paramSlab((u, v) => headPt(-1 + 2 * u, v * TAU, 0.82), 40, 24, 0, -1), M.dark, head);
  for (const side of [1, -1]) {
    const Um = side * 0.42;
    const top = headPt(Um, 0.55 * P, 0.86);
    gear(top, V(0, 1, 0.08 * side), 0.17, head, { th: 0.05 });
    gear(headPt(Um + 0.13, 0.5 * P, 0.88), V(0, 1, 0), 0.09, head, { th: 0.04, mat: M.gearHi, big: false });
    gear(headPt(Um - 0.12, 0.62 * P, 0.88), V(0, 1, 0), 0.075, head, { th: 0.04, mat: M.gearHi, big: false });
    rod(headPt(side * 0.24, 0.55 * P, 0.7), headPt(side * 0.6, 0.55 * P, 0.7), 0.04, M.gearHi, head);
    for (let q = 0; q < 4; q++) gear(headPt(side * (0.28 + q * 0.09), 0.55 * P, 0.7), V(0, 0, 1), rr(0.07, 0.11), head, { th: 0.03, big: false });
    piston(headPt(side * 0.25, 0.42 * P, 0.9), headPt(side * 0.6, 0.45 * P, 0.9), 0.025, head);
    piston(headPt(side * 0.26, 0.68 * P, 0.9), headPt(side * 0.58, 0.66 * P, 0.9), 0.022, head);
    hose([headPt(side * 0.25, 0.6 * P, 0.88), headPt(side * 0.42, 0.48 * P, 0.95), headPt(side * 0.6, 0.6 * P, 0.88)], 0.022, head);
    wires([headPt(side * 0.24, 0.45 * P, 0.9), headPt(side * 0.42, 0.66 * P, 0.94), headPt(side * 0.6, 0.5 * P, 0.9)], head, 2, 0.009);
    // window frame screws
    for (const U of [0.24, 0.6]) for (const th of [0.4, 0.55, 0.7]) {
      const p = headPt(side * U, th * P, 1.004);
      screw(p, p.clone().sub(headPt(side * U, th * P, 0.5)), head);
    }
    // eye pod dome + eye
    const tip = side;
    const tipG = parts.hammerSegs[side > 0 ? parts.hammerSegs.length - 1 : 0].g;
    mesh(paramSlab((r, v) => {
      const p = headPt(tip, v * TAU, r);
      p.z = tip * (HW + 0.1 * (1 - r * r));
      return p;
    }, 6, 28, 0), M.shell, tipG);
    const ec = headPt(tip, 0, 0.45); ec.z = tip * (HW + 0.13);
    const ed = V(0.99, 0.06, tip * 0.08).normalize();
    rod(ec.clone().addScaledVector(ed, -0.2), ec.clone().addScaledVector(ed, -0.02), 0.2, M.shell, tipG, 0.215, 28);
    parts.eyes.push({ side, dir: ed.clone(), ...eye(tipG, ec, ed) });
  }
  // jaw: hinged lower shell under the chin, teeth along both lip edges
  const jaw = new THREE.Group();
  const hingeS = 0.135, hinge = bodyPt(hingeS, Math.PI, 0.7);
  jaw.position.copy(hinge);
  body.add(jaw);
  parts.jaw = jaw;
  const JA = 0.98; // half-angle of the lower jaw shell around the belly
  mesh(bodyPatch(-0.028, hingeS, Math.PI - JA, Math.PI + JA, { xoff: hinge.x }), M.shell, jaw).position.y = -hinge.y;
  mesh(bodyPatch(-0.02, hingeS, Math.PI - JA + 0.05, Math.PI + JA - 0.05, { xoff: hinge.x, k: 0.84, t: 0 }), M.dark, jaw).position.y = -hinge.y;
  jaw.rotation.z = 0.16; // open
  const toothG = new THREE.ConeGeometry(0.034, 0.088, 6);
  toothG.translate(0, 0.044, 0);
  const lipTeeth = (parent, a, k, sign, yoff, n, sA, sB, xoff) => {
    for (let i = 0; i < n; i++) {
      const s = sA + ((i + 0.5) / n) * (sB - sA);
      const p = bodyPt(s, a, k, xoff); p.y += yoff;
      const t = bodyPt(s, a + sign * 0.02, k, xoff).sub(bodyPt(s, a, k, xoff)).normalize(); // along the surface toward the gap
      const m = mesh(toothG, M.tooth, parent);
      m.position.copy(p);
      m.quaternion.setFromUnitVectors(V(0, 1, 0), t);
      m.rotateX(rr(-0.12, 0.12));
      parts.teeth.push({ o: m, home: m.position.clone(), q0: m.quaternion.clone(), out: bodyNormal(s, a), down: t.clone(), along: i / n, side: Math.sign(a), row: parent === body ? 'up' : 'lo', spin: rr(-2, 2) });
    }
  };
  for (const side of [1, -1]) {
    // upper row hangs from the cheek panel edge (a = 1.93), lower row rises from the jaw edge
    lipTeeth(body, side * 1.93, 0.985, side, 0, 11, -0.026, 0.13, 0);
    lipTeeth(jaw, side * (Math.PI - JA), 0.985, -side, -hinge.y, 10, -0.022, 0.125, hinge.x);
  }
  // front teeth across the chin
  for (let i = 0; i < 5; i++) {
    const a = Math.PI - 0.8 + i * 0.4;
    const pu = bodyPt(-0.024, (a > Math.PI ? -1 : 1) * 1.93 + (a - Math.PI) * 0.15, 0.95);
  }
  for (const side of [1, -1]) {
    const hp = bodyPt(hingeS - 0.005, side * 2.0, 0.9);
    gear(hp, bodyNormal(hingeS, side * 2.0), 0.15, body, { th: 0.05 });
    // green gill marks (edge lines on the cheek)
    for (let q = 0; q < 3; q++) {
      const s = 0.15 + q * 0.016, a = side * 1.86;
      const b = mesh(new THREE.BoxGeometry(0.018, 0.2, 0.012), M.green, body);
      b.position.copy(bodyPt(s, a, 1.004));
      b.lookAt(b.position.clone().add(bodyNormal(s, a)));
      b.rotateZ(side * 0.45);
    }
  }

  // ---- fins on the torso
  const addFin = (outline, opts, pos, C, D, parent, name) => {
    const f = makeFin(outline, opts);
    f.position.copy(pos);
    f.quaternion.copy(finBasis(C, D));
    parent.add(f);
    parts.fins[name] = f;
    f.userData.q0 = f.quaternion.clone();
    return f;
  };
  addFin(DORSAL, { tip: 4, lead: [0, 4], rims: [[3, 5]], sparW: 0.16, scale: 0.7 }, bodyPt(0.37, 0, 0.97), V(1, 0, 0), V(-0.08, 1, 0.04), body, 'dorsal');
  addFin(PECT, { tip: 4, lead: [0, 4], rims: [[3, 5]], sparW: 0.15, scale: 0.78 }, bodyPt(0.205, 1.98, 0.95), V(1, 0.05, 0.1), V(0.55, -0.7, 0.45), body, 'pectR');
  addFin(PECT, { tip: 4, lead: [0, 4], rims: [[3, 5]], sparW: 0.14, scale: 0.68 }, bodyPt(0.215, -1.95, 0.95), V(1, 0.1, -0.16), V(-0.5, -0.5, -0.7), body, 'pectL');
  addFin(SMALL, { tip: 2, lead: [0, 2], rims: [[2, 3]], scale: 0.95, sparW: 0.08 }, bodyPt(0.55, Math.PI - 0.55, 0.95), V(1, 0, 0), V(-0.35, -0.8, 0.45), body, 'pelvR');
  addFin(SMALL, { tip: 2, lead: [0, 2], rims: [[2, 3]], scale: 0.85, sparW: 0.08 }, bodyPt(0.56, -(Math.PI - 0.55), 0.95), V(1, 0, 0), V(-0.25, -0.85, -0.5), body, 'pelvL');

  // ---- tail: articulated segments, each its own length
  const segLens = [0.058, 0.052, 0.046, 0.041, 0.035, 0.031];
  let parent = body, parentX = 0, s = 0.6;
  segLens.forEach((len, i) => {
    const s0 = s, s1 = s + len;
    const g = new THREE.Group();
    const xoff = sx(s0);
    g.position.set(xoff - parentX, 0, 0);
    parent.add(g);
    parts.tail.push(g);
    const pr = prof(s0);
    // vertebra core
    mesh(bodyPatch(s0, s1, 0, TAU, { k: 0.66, t: 0, xoff }), M.dark, g);
    // joint ring at the front of each segment
    const jr = gear(V(0, pr.cy, 0), V(1, 0, 0), Math.min(pr.ry, pr.rz) * 0.84, g, { th: 0.06, mat: i % 2 ? M.gearHi : M.gear });
    jr.scale.y = pr.ry / pr.rz;
    // plates: dorsal + ventral, widths vary per segment
    const dw = 0.5 - i * 0.02, vw = 0.36 + (i % 3) * 0.06;
    mesh(bodyPatch(s0 + 0.004, s1 - 0.003, -dw, dw, { xoff, t: 0.035 }), M.shell, g);
    mesh(bodyPatch(s0 + 0.006, s1 - 0.003, Math.PI - vw, Math.PI + vw, { xoff, t: 0.035 }), M.shell, g);
    const mr = gear(V(-len * L * 0.5, prof(s0 + len / 2).cy, 0), V(1, 0, 0), Math.min(pr.ry, pr.rz) * 0.92, g, { th: 0.08, mat: M.gearHi });
    mr.scale.y = pr.ry / pr.rz;
    // lateral pistons + hoses in the exposed flanks
    for (const side of [1, -1]) {
      const a1 = side * (1.1 + 0.15 * (i % 2)), a2 = side * 1.95;
      piston(bodyPt(s0 + 0.003, a1, 0.98, xoff), bodyPt(s1 + 0.006, a1 + side * 0.1, 0.95, xoff), 0.03 - i * 0.002, g);
      piston(bodyPt(s0 + 0.004, a2, 0.96, xoff), bodyPt(s1 + 0.004, a2 - side * 0.12, 0.95, xoff), 0.026 - i * 0.002, g);
      hose([bodyPt(s0, side * 1.5, 0.9, xoff), bodyPt(s0 + len * 0.5, side * 1.45, 1.02, xoff), bodyPt(s1, side * 1.55, 0.9, xoff)], 0.022 - i * 0.0015, g);
      const sg3 = (s0 + s1) / 2;
      gear(bodyPt(sg3, side * 1.5, 0.82, xoff), bodyNormal(sg3, side * 1.5), Math.min(pr.ry, pr.rz) * 0.32, g, { th: 0.03, mat: M.gearHi, big: false });
      screw(bodyPt(s0 + 0.01, side * dw * 0.6, 1.003, xoff), bodyNormal(s0 + 0.01, side * dw * 0.6), g);
      screw(bodyPt(s1 - 0.01, side * dw * 0.6, 1.003, xoff), bodyNormal(s1 - 0.01, side * dw * 0.6), g);
    }
    if (i === 1) addFin(SMALL, { tip: 2, lead: [0, 2], rims: [[2, 3]], scale: 1.05, sparW: 0.08 }, bodyPt(s0 + len * 0.4, 0, 0.98, xoff), V(1, 0, 0), V(-0.15, 1, 0.03), g, 'dorsal2');
    if (i === 2) addFin(SMALL, { tip: 2, lead: [0, 2], rims: [[2, 3]], scale: 0.8, sparW: 0.07 }, bodyPt(s0 + len * 0.3, Math.PI, 0.98, xoff), V(1, 0, 0), V(-0.2, -1, 0.06), g, 'anal');
    parent = g; parentX = xoff; s = s1;
  });
  // caudal
  const last = parts.tail[parts.tail.length - 1];
  const cg = new THREE.Group();
  const cx = sx(s);
  cg.position.set(cx - parentX, 0, 0);
  last.add(cg);
  parts.caudalJoint = cg;
  const pr = prof(s);
  mesh(new THREE.SphereGeometry(Math.min(pr.ry, pr.rz) * 1.05, 20, 14), M.dark, cg).position.y = pr.cy;
  const ring = mesh(new THREE.TorusGeometry(Math.min(pr.ry, pr.rz) * 0.9, 0.016, 8, 32), M.green, cg);
  ring.position.set(0.06, pr.cy, 0); ring.rotation.y = Math.PI / 2;
  const cf = makeFin(CAUDAL, { tip: 4, lead: [0, 4], rims: [[4, 5], [10, 11]], sparW: 0.22, scale: 0.68 });
  cf.position.set(0.05, pr.cy, 0);
  cf.quaternion.copy(finBasis(V(1, 0, 0.04), V(0, 1, 0)));
  cg.add(cf);
  parts.fins.caudal = cf;

  return parts;
}

// ------------------------------------------------------------------ pose
// t in seconds. Slow swim: body wave ~0.45 Hz, fins slower.
export function pose(parts, t) {
  const w = TAU * 0.45;
  parts.tail.forEach((g, i) => {
    g.rotation.y = 0.07 * Math.sin(w * t - i * 0.55) + 0.035;
    g.rotation.z = 0.012 * Math.sin(w * t - i * 0.5);
  });
  parts.caudalJoint.rotation.y = 0.12 * Math.sin(w * t - 3.6);
  parts.head.rotation.y = 0.2 + 0.03 * Math.sin(w * t + 0.6); // head swings with the stroke
  const f = parts.fins;
  const tilt = (fin, ax, amp, ph) => {
    fin.quaternion.copy(fin.userData.q0);
    fin.rotateOnAxis(ax, amp * Math.sin(w * 0.5 * t + ph));
  };
  tilt(f.pectR, V(1, 0, 0), 0.08, 0);
  tilt(f.pectL, V(1, 0, 0), 0.07, 1.4);
  tilt(f.dorsal, V(0, 1, 0), 0.03, 0.4);
  parts.jaw.rotation.z = 0.32 + 0.03 * Math.sin(w * 0.5 * t);
}

export { bodyPt, bodyNormal, headPt, prof, sx, X0, HW };
