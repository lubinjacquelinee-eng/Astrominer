// ============================================================
//  MONDE : Terre, Lune, QG, colonie, gisements, ciel
// ============================================================
import * as THREE from 'three';

export function rng(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export const SUN_DIR = new THREE.Vector3(0.3, 0.5, 0.85).normalize();

export const ORES = {
  regolith: { name: 'Régolithe', tier: 1, color: 0xb9a68a, base: 3 },
  iron:     { name: 'Fer', tier: 1, color: 0xc0573a, base: 8 },
  titanium: { name: 'Titane', tier: 2, color: 0x9fd8ff, base: 55 },
  cuprum:   { name: 'Cuprum', tier: 2, color: 0xff9a3c, base: 95 },
  quantium: { name: 'Quantium', tier: 3, color: 0xb36bff, base: 1400 },
  helium3:  { name: 'Hélium-3', tier: 3, color: 0x6dffb0, base: 3200 },
};
export const ORE_KEYS = Object.keys(ORES);

// ---------------- Corps célestes ----------------
const EARTH_R = 2000, MOON_R = 460;
export const EARTH = { name: 'Terre', c: new THREE.Vector3(0, -EARTH_R, 0), R: EARTH_R, g0: 10, atmo: 420 };
export const MOON = { name: 'Lune', c: new THREE.Vector3(0, 5200, -7400), R: MOON_R, g0: 2.8, atmo: 0 };
export const BASE_DIR = new THREE.Vector3(0, 1, 0);
export const PAD_DIR = new THREE.Vector3().subVectors(new THREE.Vector3(0, 0, 0), MOON.c).normalize();

// --- hauteur Terre
function earthField(d) {
  return 0.55 * Math.sin(3.1 * d.x + 1.2) * Math.cos(2.3 * d.z - 0.7)
    + 0.35 * Math.sin(4.7 * d.z + 2.1 * d.y + 0.3)
    + 0.22 * Math.sin(9.3 * d.x - 7.1 * d.y + 1.7)
    + 0.12 * Math.sin(17.0 * d.z + 13.0 * d.x);
}
EARTH.height = function (d) {
  const ang = Math.acos(THREE.MathUtils.clamp(d.dot(BASE_DIR), -1, 1));
  const flat = THREE.MathUtils.smoothstep(ang, 0.4, 0.55);
  let c = earthField(d);
  c = THREE.MathUtils.lerp(0.25, c, flat);
  const land = Math.max(0, c - 0.05);
  return land * 140 * flat;
};
EARTH.colorAt = function (d, h) {
  const ang = Math.acos(THREE.MathUtils.clamp(d.dot(BASE_DIR), -1, 1));
  let c = earthField(d); const flat = THREE.MathUtils.smoothstep(ang, 0.4, 0.55);
  c = THREE.MathUtils.lerp(0.25, c, flat);
  const lat = Math.abs(d.y);
  if (c <= 0.05) return c < -0.25 ? 0x1b4f8a : 0x2a6db0;
  if (lat > 0.93 && ang > 0.3) return 0xe8f0f5;
  if (h < 4 && flat > 0.5) return 0xd8c48a;
  if (h > 55) return 0xe6e9ec;
  if (h > 30) return 0x7b6a55;
  return ang < 0.3 ? 0x6f9a4a : (Math.sin(d.x * 40 + d.z * 30) > 0.3 ? 0x5a8a3c : 0x4f7d36);
};

// --- hauteur Lune (cratères)
const craters = [];
{
  const r = rng(77);
  for (let i = 0; i < 70; i++) {
    const d = new THREE.Vector3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1).normalize();
    if (d.angleTo(PAD_DIR) < 0.18) continue;
    const rad = 0.04 + r() * r() * 0.28;
    craters.push({ d, rad, depth: rad * 120 * (0.5 + r() * 0.5) });
  }
}
MOON.height = function (d) {
  let h = 2.2 * Math.sin(d.x * 23 + 1) * Math.sin(d.y * 19 + 2) + 1.4 * Math.sin(d.z * 41 + d.x * 17);
  for (const c of craters) {
    const a = Math.acos(THREE.MathUtils.clamp(d.dot(c.d), -1, 1));
    const t = a / c.rad;
    if (t < 1.5) {
      if (t < 1) h -= c.depth * (1 - t * t) * 0.6;
      const rim = Math.exp(-Math.pow((t - 1) / 0.2, 2));
      h += c.depth * 0.22 * rim;
    }
  }
  const ap = Math.acos(THREE.MathUtils.clamp(d.dot(PAD_DIR), -1, 1));
  const f = THREE.MathUtils.smoothstep(ap, 0.07, 0.15);
  return h * f;
};
MOON.colorAt = function (d, h) {
  const v = THREE.MathUtils.clamp(0.55 + h * 0.012 + 0.05 * Math.sin(d.x * 60 + d.y * 40), 0.25, 0.85);
  const c = new THREE.Color().setRGB(v * 0.95, v * 0.94, v * 0.92);
  return c.getHex();
};

export function surfacePoint(body, dir, out = new THREE.Vector3(), lift = 0) {
  return out.copy(dir).multiplyScalar(body.R + body.height(dir) + lift).add(body.c);
}

// ---------------- Maillage planète low-poly ----------------
function planetMesh(body, detail) {
  const geo = new THREE.IcosahedronGeometry(1, detail);
  const pos = geo.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  const d = new THREE.Vector3(), col = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    d.fromBufferAttribute(pos, i).normalize();
    const h = body.height(d);
    pos.setXYZ(i, d.x * (body.R + h), d.y * (body.R + h), d.z * (body.R + h));
  }
  // couleur par face (look low-poly)
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
    const m = a.add(b).add(c).divideScalar(3);
    const len = m.length(); m.normalize();
    col.setHex(body.colorAt(m, len - body.R));
    for (let k = 0; k < 3; k++) { cols[(i + k) * 3] = col.r; cols[(i + k) * 3 + 1] = col.g; cols[(i + k) * 3 + 2] = col.b; }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(body.c); mesh.receiveShadow = true;
  return mesh;
}

// frame local tangent autour d'une direction
export function localFrame(up) {
  const ref = Math.abs(up.y) > 0.9 ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(ref, up).normalize();
  const fwd = new THREE.Vector3().crossVectors(up, right).normalize(); // "nord"
  return { up, right, fwd };
}
export function localDir(frame, R, x, z) {
  return new THREE.Vector3().copy(frame.up).multiplyScalar(R).addScaledVector(frame.right, x).addScaledVector(frame.fwd, z).normalize();
}
function placeOn(body, obj, dir, lift = 0, yaw = 0) {
  surfacePoint(body, dir, obj.position, lift);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  obj.quaternion.copy(q);
  if (yaw) obj.rotateY(yaw);
  return obj;
}

const M = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.7, metalness: 0.2, ...opts });
function bx(w, h, d, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m; }

// ---------------- QG terrestre ----------------
function buildQG(scene) {
  const g = new THREE.Group(); scene.add(g);
  const frame = { up: BASE_DIR, right: new THREE.Vector3(1, 0, 0), fwd: new THREE.Vector3(0, 0, -1) };
  // piste courbée qui épouse la planète
  const L = 900, W = 46, segL = 60, segW = 4;
  const geo = new THREE.PlaneGeometry(W, L, segW, segL); geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position; const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i) - 250; // la piste s'étend vers -Z
    const dir = new THREE.Vector3(x, EARTH.R, z).normalize();
    surfacePoint(EARTH, dir, v, 0.25); p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 1024;
  const cx = cv.getContext('2d'); cx.fillStyle = '#2b2e33'; cx.fillRect(0, 0, 64, 1024);
  cx.fillStyle = '#e8e8e8'; for (let y = 0; y < 1024; y += 48) cx.fillRect(30, y, 4, 24);
  cx.fillStyle = '#ffb347'; cx.fillRect(2, 0, 3, 1024); cx.fillRect(59, 0, 3, 1024);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(1, 4);
  const runway = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
  runway.receiveShadow = true; g.add(runway);
  // balises lumineuses
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xffb347 });
  const runwayLights = [];
  for (let z = 190; z > -690; z -= 40) for (const x of [-W / 2 - 2, W / 2 + 2]) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.9, 6, 4), lightMat);
    placeOn(EARTH, m, new THREE.Vector3(x, EARTH.R, z).normalize(), 0.8); g.add(m); runwayLights.push(m);
  }
  // Hangar (demi-cylindre)
  const hangar = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(28, 28, 60, 10, 1, false, 0, Math.PI), M(0x9aa3ad, { metalness: 0.5 }));
  shell.rotation.z = Math.PI / 2; shell.rotation.y = Math.PI / 2; shell.castShadow = true; hangar.add(shell);
  hangar.add(bx(40, 22, 1, M(0x1a1d22), 0, 10, -30.5));
  hangar.add(bx(56, 3, 1.2, M(0xff8a1f), 0, 24, -30.6));
  placeOn(EARTH, hangar, new THREE.Vector3(95, EARTH.R, 20).normalize(), 0, 0); g.add(hangar);
  // Tour de contrôle
  const tower = new THREE.Group();
  tower.add(bx(8, 50, 8, M(0xd5d9de), 0, 25, 0));
  const cab = new THREE.Mesh(new THREE.CylinderGeometry(9, 7, 8, 8), M(0x3fd2ff, { emissive: 0x0f5d80, emissiveIntensity: 0.6, metalness: 0.9, roughness: 0.1 }));
  cab.position.y = 54; tower.add(cab);
  tower.add(bx(1, 14, 1, M(0xff3030, { emissive: 0xff0000 }), 0, 64, 0));
  placeOn(EARTH, tower, new THREE.Vector3(70, EARTH.R, -60).normalize()); g.add(tower);
  // Bourse (tour de verre)
  const bourse = new THREE.Group();
  for (let i = 0; i < 6; i++) { const f = bx(30 - i * 3, 9, 22 - i * 2, M(i % 2 ? 0x2b7db8 : 0x3fa0e0, { metalness: 0.8, roughness: 0.15, emissive: 0x0a2a44 }), 0, 4.5 + i * 9, 0); bourse.add(f); }
  bourse.add(bx(32, 2, 1, M(0x6dffb0, { emissive: 0x2aa86a }), 0, 20, 12));
  placeOn(EARTH, bourse, new THREE.Vector3(-100, EARTH.R, 10).normalize(), 0, 0.3); g.add(bourse);
  // Réservoirs carburant
  for (let i = 0; i < 3; i++) {
    const t = new THREE.Mesh(new THREE.SphereGeometry(9, 10, 8), M(0xeeeeee, { metalness: 0.4 }));
    t.castShadow = true; placeOn(EARTH, t, new THREE.Vector3(-70 - i * 22, EARTH.R, -90).normalize(), 9); g.add(t);
  }
  // Luxe (cachés)
  const lux = {};
  const statue = new THREE.Group();
  statue.add(bx(10, 6, 10, M(0x222222), 0, 3, 0));
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(3, 12, 4, 8), M(0xffc94a, { metalness: 1, roughness: 0.15 })); body.position.y = 14; statue.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(3, 8, 6), M(0xffc94a, { metalness: 1, roughness: 0.15 })); head.position.y = 25; statue.add(head);
  const arm = bx(2, 11, 2, M(0xffc94a, { metalness: 1, roughness: 0.15 }), 4, 22, 0); arm.rotation.z = -0.5; statue.add(arm);
  placeOn(EARTH, statue, new THREE.Vector3(-45, EARTH.R, 110).normalize()); statue.visible = false; g.add(statue); lux.statue = statue;
  const penthouse = new THREE.Group();
  for (let i = 0; i < 9; i++) penthouse.add(bx(14 - i * 0.6, 12, 14 - i * 0.6, M(i % 2 ? 0x111111 : 0xffc94a, { metalness: 0.9, roughness: 0.2, emissive: i % 2 ? 0 : 0x332200 }), 0, 6 + i * 12, 0));
  const spire = new THREE.Mesh(new THREE.ConeGeometry(4, 30, 6), M(0xffc94a, { metalness: 1, roughness: 0.1 })); spire.position.y = 125; penthouse.add(spire);
  placeOn(EARTH, penthouse, new THREE.Vector3(-150, EARTH.R, -40).normalize()); penthouse.visible = false; g.add(penthouse); lux.penthouse = penthouse;
  const fountain = new THREE.Group();
  fountain.add(new THREE.Mesh(new THREE.CylinderGeometry(12, 13, 2, 12), M(0xf0f0f0)));
  const fw = new THREE.Mesh(new THREE.ConeGeometry(4, 14, 8), M(0xffe9a8, { emissive: 0x806020, transparent: true, opacity: 0.8 })); fw.position.y = 8; fountain.add(fw);
  placeOn(EARTH, fountain, new THREE.Vector3(40, EARTH.R, 120).normalize()); fountain.visible = false; g.add(fountain); lux.fountain = fountain;
  // nuages
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x9aa8b8, flatShading: true, transparent: true, opacity: 0.82, depthWrite: false });
  const r = rng(5);
  for (let i = 0; i < 70; i++) {
    const cl = new THREE.Group(); cl.scale.set(1.6, 0.45, 1.6);
    const n = 3 + Math.floor(r() * 4);
    for (let k = 0; k < n; k++) { const s = new THREE.Mesh(new THREE.IcosahedronGeometry(10 + r() * 14, 0), cloudMat); s.position.set((r() - 0.5) * 50, (r() - 0.5) * 8, (r() - 0.5) * 30); cl.add(s); }
    const ang = 0.14 + r() * 0.5, az = r() * Math.PI * 2;
    const dir = new THREE.Vector3(Math.sin(ang) * Math.cos(az), Math.cos(ang), Math.sin(ang) * Math.sin(az));
    placeOn(EARTH, cl, dir, 320 + r() * 120, r() * 6); g.add(cl);
  }
  return { group: g, lux, runwayLights };
}

// ---------------- Colonie lunaire ----------------
function buildColony(scene) {
  const g = new THREE.Group(); scene.add(g);
  const frame = localFrame(PAD_DIR);
  // pad d'atterrissage
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(26, 28, 1.4, 16), M(0x3a3f47, { metalness: 0.4 }));
  placeOn(MOON, pad, PAD_DIR, 0.3); pad.receiveShadow = true; g.add(pad);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(22, 0.6, 4, 32), new THREE.MeshBasicMaterial({ color: 0x5ee6ff }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.8; pad.add(ring);
  const H = new THREE.Group(); H.add(bx(2, 0.2, 14, new THREE.MeshBasicMaterial({ color: 0xffb347 }), -4, 0.8, 0)); H.add(bx(2, 0.2, 14, new THREE.MeshBasicMaterial({ color: 0xffb347 }), 4, 0.8, 0)); H.add(bx(8, 0.2, 2, new THREE.MeshBasicMaterial({ color: 0xffb347 }), 0, 0.8, 0)); pad.add(H);

  const stages = [];
  const domeMat = M(0xdfe7ee, { metalness: 0.3, roughness: 0.4 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x7fd8ff, emissive: 0x1a5a7a, emissiveIntensity: 0.7, transparent: true, opacity: 0.6, roughness: 0.1, metalness: 0.5 });
  const greenMat = new THREE.MeshStandardMaterial({ color: 0x7dff9a, emissive: 0x1f7a3a, emissiveIntensity: 0.8, transparent: true, opacity: 0.65 });
  const solarMat = M(0x1b2f6b, { metalness: 0.8, roughness: 0.25, emissive: 0x050a20 });
  const winMat = new THREE.MeshBasicMaterial({ color: 0xffd27a });
  const mk = {
    dome(r, mat = domeMat) { const o = new THREE.Group(); const d = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat); d.castShadow = true; o.add(d); o.add(bx(r * 0.5, r * 0.3, r * 0.4, domeMat, 0, r * 0.15, r)); for (let i = 0; i < 6; i++) { const w = bx(r * 0.12, r * 0.08, 0.3, winMat); const a = i / 6 * Math.PI * 2; w.position.set(Math.cos(a) * r * 0.82, r * 0.35, Math.sin(a) * r * 0.82); w.lookAt(0, r * 0.35, 0); o.add(w); } return o; },
    solar(n) { const o = new THREE.Group(); for (let i = 0; i < n; i++) { const p = bx(10, 0.3, 5, solarMat, (i - n / 2) * 11, 4, 0); p.rotation.x = -0.5; o.add(p); o.add(bx(0.5, 4, 0.5, domeMat, (i - n / 2) * 11, 2, 0)); } return o; },
    antenna() { const o = new THREE.Group(); o.add(bx(1, 24, 1, domeMat, 0, 12, 0)); const dish = new THREE.Mesh(new THREE.SphereGeometry(6, 10, 4, 0, Math.PI * 2, 0, 1.0), domeMat); dish.position.y = 22; dish.rotation.x = 2.3; o.add(dish); o.add(bx(0.6, 0.6, 0.6, new THREE.MeshBasicMaterial({ color: 0xff3030 }), 0, 25, 0)); return o; },
    tower() { const o = new THREE.Group(); o.add(new THREE.Mesh(new THREE.CylinderGeometry(4, 6, 30, 8), M(0x8a8f99, { metalness: 0.6 }))); o.children[0].position.y = 15; o.add(bx(14, 3, 14, M(0xff8a1f), 0, 20, 0)); const fl = new THREE.Mesh(new THREE.ConeGeometry(2, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffa040 })); fl.position.y = 33; o.add(fl); return o; },
    garage() { const o = new THREE.Group(); o.add(bx(26, 10, 16, M(0xb8bec6), 0, 5, 0)); o.add(bx(18, 7, 0.4, M(0x1a1d22), 0, 3.5, 8.1)); o.add(bx(27, 1, 17, M(0xff8a1f), 0, 10.5, 0)); return o; },
  };
  const defs = [
    ['dome', 12, -48, 30], ['solar', 3, 50, 25], ['antenna', 0, -40, -45], ['dome', 9, -75, 0],
    ['green', 11, 30, -55], ['tower', 0, 78, -20], ['solar', 4, 70, 60], ['dome', 18, -20, 80],
    ['garage', 0, -90, 55], ['antenna', 0, 95, 40], ['green', 14, 10, -95], ['dome', 24, -110, -50],
  ];
  for (const [type, s, x, z] of defs) {
    let o;
    if (type === 'dome') o = mk.dome(s, s > 15 ? glassMat : domeMat);
    else if (type === 'green') o = mk.dome(s, greenMat);
    else if (type === 'solar') o = mk.solar(s);
    else o = mk[type]();
    placeOn(MOON, o, localDir(frame, MOON.R, x, z), -0.5, Math.atan2(x, z));
    o.visible = false; o.userData.grow = 0; g.add(o); stages.push(o);
  }
  // techniciens
  const techs = [];
  const suit = M(0xf2f2f2), visor = M(0xffb347, { metalness: 1, roughness: 0.1, emissive: 0x442200 });
  for (let i = 0; i < 24; i++) {
    const t = new THREE.Group();
    const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.7, 1.2, 3, 6), suit); b.position.y = 1.4; t.add(b);
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.65, 8, 6), suit); h.position.y = 2.9; t.add(h);
    const v = bx(0.8, 0.4, 0.3, visor, 0, 2.95, -0.5); t.add(v);
    t.add(bx(0.9, 1.1, 0.5, M(0x2a6db0), 0, 1.7, 0.6));
    t.visible = false; g.add(t);
    techs.push({ obj: t, dir: localDir(frame, MOON.R, (Math.random() - 0.5) * 120, (Math.random() - 0.5) * 120), target: null, wait: Math.random() * 3 });
  }
  return { group: g, stages, techs, frame };
}

// ---------------- Gisements ----------------
function buildDeposits(scene) {
  const list = [];
  const r = rng(1234);
  const frame = localFrame(PAD_DIR);
  const rock = new THREE.MeshStandardMaterial({ color: 0x5c5650, flatShading: true, roughness: 1 });
  function add(type, ang0, ang1) {
    const ore = ORES[type];
    const ang = ang0 + r() * (ang1 - ang0), az = r() * Math.PI * 2;
    const dir = new THREE.Vector3().copy(PAD_DIR).multiplyScalar(Math.cos(ang))
      .addScaledVector(frame.right, Math.sin(ang) * Math.cos(az)).addScaledVector(frame.fwd, Math.sin(ang) * Math.sin(az)).normalize();
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: ore.color, emissive: ore.color, emissiveIntensity: ore.tier === 1 ? 0.15 : ore.tier === 2 ? 0.45 : 0.9, flatShading: true, metalness: 0.4, roughness: 0.3 });
    const base = new THREE.Mesh(new THREE.DodecahedronGeometry(3.2, 0), rock); base.scale.y = 0.5; base.castShadow = true; g.add(base);
    const n = 3 + Math.floor(r() * 4);
    for (let i = 0; i < n; i++) {
      const c = new THREE.Mesh(new THREE.OctahedronGeometry(1 + r() * 1.4, 0), mat);
      c.scale.y = 1.6 + r() * 1.5; c.position.set((r() - 0.5) * 4, 1.5 + r(), (r() - 0.5) * 4);
      c.rotation.set(r() * 0.6, r() * 3, r() * 0.6); c.castShadow = true; g.add(c);
    }
    placeOn(MOON, g, dir, 0, r() * 6); scene.add(g);
    const amount = (ore.tier === 3 ? 90 : 140) + r() * 120;
    list.push({ type, dir, obj: g, amount, max: amount, tier: ore.tier, crystals: g.children.slice(1) });
  }
  for (let i = 0; i < 40; i++) add(r() < 0.6 ? 'regolith' : 'iron', 0.07, 0.34);
  for (let i = 0; i < 28; i++) add(r() < 0.55 ? 'titanium' : 'cuprum', 0.5, 1.15);
  for (let i = 0; i < 22; i++) add(r() < 0.55 ? 'quantium' : 'helium3', 2.2, 3.0);
  return list;
}

// ---------------- Ciel ----------------
function buildStars() {
  const n = 4000, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  const r = rng(9);
  for (let i = 0; i < n; i++) {
    const v = new THREE.Vector3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1).normalize().multiplyScalar(90000);
    pos.set([v.x, v.y, v.z], i * 3);
    const t = r(); const c = new THREE.Color().setHSL(0.55 + t * 0.15, 0.4, 0.75 + r() * 0.25);
    col.set([c.r, c.g, c.b], i * 3);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 1, depthWrite: false, fog: false });
  return new THREE.Points(g, m);
}

function buildAtmosphere() {
  const geo = new THREE.SphereGeometry(EARTH.R + EARTH.atmo * 1.1, 64, 32);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { sun: { value: SUN_DIR } },
    vertexShader: `varying vec3 vN; varying vec3 vW; void main(){ vN = normalize(normalMatrix*normal); vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `varying vec3 vN; varying vec3 vW; uniform vec3 sun; void main(){ vec3 v = normalize(cameraPosition - vW); float f = pow(1.0 - abs(dot(v, normalize(vN))), 2.5); gl_FragColor = vec4(vec3(0.35,0.62,1.0)*f*1.4, f); }`,
  });
  const m = new THREE.Mesh(geo, mat); m.position.copy(EARTH.c); return m;
}

function buildSun() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const c = cv.getContext('2d'); const gr = c.createRadialGradient(64, 64, 4, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,240,1)'); gr.addColorStop(0.2, 'rgba(255,230,170,0.9)'); gr.addColorStop(1, 'rgba(255,180,80,0)');
  c.fillStyle = gr; c.fillRect(0, 0, 128, 128);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  s.scale.set(9000, 9000, 1); return s;
}

export function buildWorld(scene) {
  const earthMesh = planetMesh(EARTH, 72); scene.add(earthMesh);
  const moonMesh = planetMesh(MOON, 64); scene.add(moonMesh);
  const atmo = buildAtmosphere(); scene.add(atmo);
  const stars = buildStars(); scene.add(stars);
  const sun = buildSun(); scene.add(sun);
  const qg = buildQG(scene);
  const colony = buildColony(scene);
  const deposits = buildDeposits(scene);
  return { earthMesh, moonMesh, atmo, stars, sun, qg, colony, deposits };
}
