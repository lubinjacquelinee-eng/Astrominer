// ============================================================
//  ASTRO-MINEUR — boucle principale, vol, minage, économie, HUD
// ============================================================
import * as THREE from 'three';
import { EARTH, MOON, BASE_DIR, PAD_DIR, ORES, ORE_KEYS, SUN_DIR, buildWorld, surfacePoint, localFrame, rng } from './world.js';
import { PARTS, SHIP_SCALE, makeMaterials, buildPartMesh, computeStats } from './parts.js';
import { createHangar } from './hangar.js';

// ---------------- utilitaires ----------------
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp, smooth = THREE.MathUtils.smoothstep;
const $ = s => document.querySelector(s);
const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const fmt = n => nf.format(Math.round(n));
const fmtBig = n => n >= 1e9 ? (n / 1e9).toFixed(2).replace('.', ',') + ' Md' : n >= 1e6 ? (n / 1e6).toFixed(2).replace('.', ',') + ' M' : fmt(n);
const approach = (v, t, d) => v < t ? Math.min(t, v + d) : Math.max(t, v - d);

// ---------------- état global ----------------
const state = {
  credits: 1500, prestige: 0, chrome: false, lux: {},
  cargo: Object.fromEntries(ORE_KEYS.map(k => [k, 0])),
  fuel: 0, heat: 0, hull: 100,
  upg: { laser: 1, tier: 1, pack: 0, boots: 0, range: 0, drones: 0, rovers: 0, goldsuits: false },
  colony: { lvl: 0, xp: 0 },
  obj: 0, firstLaunch: true, cravacheUsed: false, mined3: false, sold: false, earned: 0,
};
const game = {
  state, fmt, toast, sfx, refreshTop,
  launchFromHangar: list => launchFromHangar(list),
};

// ---------------- rendu ----------------
const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const SKY = new THREE.Color(0x86b9ec), SPACE = new THREE.Color(0x02040a);
scene.background = SKY.clone();
scene.fog = new THREE.Fog(SKY.clone(), 400, 4000);
const camera = new THREE.PerspectiveCamera(68, 1, 0.5, 220000);

const hemi = new THREE.HemisphereLight(0xa8c8ff, 0x3a2e24, 0.55); scene.add(hemi);
const amb = new THREE.AmbientLight(0x404a60, 0.35); scene.add(amb);
const sun = new THREE.DirectionalLight(0xfff1dc, 2.6); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 900 });
sun.shadow.bias = -0.0005; scene.add(sun); scene.add(sun.target);

const W = buildWorld(scene);
const hangar = createHangar(renderer, game);

// ---------------- particules ----------------
let _dotTex = null;
function dotTexture() {
  if (_dotTex) return _dotTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'); const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  _dotTex = new THREE.CanvasTexture(c); return _dotTex;
}
function makeParticles(n, size, blending = THREE.AdditiveBlending) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({ size, vertexColors: true, transparent: true, depthWrite: false, blending, sizeAttenuation: true, map: dotTexture(), alphaTest: 0.01 });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; scene.add(pts);
  const vel = new Float32Array(n * 3), life = new Float32Array(n), max = new Float32Array(n), base = new Float32Array(n * 3);
  let head = 0;
  return {
    emit(p, v, color, lifeT) {
      const i = head; head = (head + 1) % n;
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
      vel[i * 3] = v.x; vel[i * 3 + 1] = v.y; vel[i * 3 + 2] = v.z;
      life[i] = lifeT; max[i] = lifeT; base[i * 3] = color.r; base[i * 3 + 1] = color.g; base[i * 3 + 2] = color.b;
    },
    update(dt, drag = 0) {
      const k = Math.exp(-drag * dt);
      for (let i = 0; i < n; i++) {
        if (life[i] <= 0) { col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0; continue; }
        life[i] -= dt; const f = Math.max(0, life[i] / max[i]);
        vel[i * 3] *= k; vel[i * 3 + 1] *= k; vel[i * 3 + 2] *= k;
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        col[i * 3] = base[i * 3] * f; col[i * 3 + 1] = base[i * 3 + 1] * f; col[i * 3 + 2] = base[i * 3 + 2] * f;
      }
      geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
    },
  };
}
const fire = makeParticles(2500, 1.6);
const dust = makeParticles(1500, 2.4);
const sparks = makeParticles(800, 0.7);

// traînées de vitesse stellaire
const STREAKS = 260;
const streakGeo = new THREE.BufferGeometry();
const streakPos = new Float32Array(STREAKS * 6);
streakGeo.setAttribute('position', new THREE.BufferAttribute(streakPos, 3));
const streakMat = new THREE.LineBasicMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
const streaks = new THREE.LineSegments(streakGeo, streakMat); streaks.frustumCulled = false; scene.add(streaks);
const streakSeeds = []; { const r = rng(42); for (let i = 0; i < STREAKS; i++) streakSeeds.push(V((r() - 0.5) * 2, (r() - 0.5) * 2, (r() - 0.5) * 2)); }

// ---------------- vaisseau ----------------
const ship = {
  group: null, design: null, stats: null, mats: null,
  pos: V(), vel: V(), quat: new THREE.Quaternion(), ang: V(),
  throttle: 0, landed: true, onGround: false, gear: 1, braking: false, overheat: false,
  engines: [], legs: [], gearFeet: [], hullPts: [], bottom: 2, size: 4,
  airlockLocal: V(), cockpitLocal: V(), headlight: null, alive: true, landedAt: null,
};

function buildShipMesh(design) {
  if (ship.group) scene.remove(ship.group);
  const st = computeStats(design);
  const mats = makeMaterials(state.chrome);
  const g = new THREE.Group(); const inner = new THREE.Group(); inner.scale.setScalar(SHIP_SCALE); g.add(inner);
  ship.engines = []; ship.legs = []; ship.gearFeet = [];
  let minX = 0, maxX = 0, minZ = 0, maxZ = 0, minY = 0, maxY = 0;
  for (const p of design) {
    const m = buildPartMesh(p.type, mats, p.x);
    m.position.set(p.x - st.com.x, p.y - st.com.y, p.z - st.com.z);
    m.traverse(o => { if (o.isMesh) o.castShadow = true; });
    inner.add(m);
    const lx = p.x - st.com.x, ly = p.y - st.com.y, lz = p.z - st.com.z;
    if (PARTS[p.type].thrust) ship.engines.push({ mesh: m, local: V(lx, ly, lz + 0.9).multiplyScalar(SHIP_SCALE), color: new THREE.Color(PARTS[p.type].color), type: p.type });
    if (m.userData.leg) { ship.legs.push(m.userData.leg); ship.gearFeet.push(V(lx, ly, lz)); }
    if (PARTS[p.type].gear) { /* foot computed dynamically */ } else { minY = Math.min(minY, ly - 0.5); }
    minX = Math.min(minX, lx - 0.5); maxX = Math.max(maxX, lx + 0.5); minZ = Math.min(minZ, lz - 0.5); maxZ = Math.max(maxZ, lz + 0.5); maxY = Math.max(maxY, ly + 0.5);
  }
  ship.hullPts = [V(minX, minY, minZ), V(maxX, minY, minZ), V(minX, minY, maxZ), V(maxX, minY, maxZ), V(0, minY, 0), V(0, maxY, 0), V(minX, 0, 0), V(maxX, 0, 0), V(0, 0, minZ), V(0, 0, maxZ)].map(v => v.multiplyScalar(SHIP_SCALE));
  ship.size = Math.max(maxX - minX, maxZ - minZ, maxY - minY) * SHIP_SCALE;
  ship.airlockLocal.copy(st.airlockPos).sub(st.com).multiplyScalar(SHIP_SCALE);
  ship.cockpitLocal.copy(st.cockpitPos).sub(st.com).multiplyScalar(SHIP_SCALE);
  // phare
  const hl = new THREE.SpotLight(0xdfefff, 900, 260, 0.5, 0.5, 1.6);
  hl.position.copy(ship.cockpitLocal); hl.target.position.copy(ship.cockpitLocal).add(V(0, -8, -40));
  g.add(hl); g.add(hl.target); ship.headlight = hl;
  const glow = new THREE.PointLight(0xffc080, 60, 40, 2); glow.position.set(0, -ship.size * 0.4, 0); g.add(glow); ship.glow = glow;
  scene.add(g);
  ship.group = g; ship.design = design; ship.stats = st; ship.mats = mats;
  ship.bottom = computeBottom(1);
}
function footLocal(i, dep, out) {
  const f = ship.gearFeet[i];
  return out.set(f.x, f.y - 0.25 - 1.1 * dep, f.z).multiplyScalar(SHIP_SCALE);
}
function computeBottom(dep) {
  let m = Infinity; const t = V();
  for (const p of ship.hullPts) m = Math.min(m, p.y);
  for (let i = 0; i < ship.gearFeet.length; i++) m = Math.min(m, footLocal(i, dep, t).y);
  return -m;
}
function shipAxes() {
  return {
    fwd: V(0, 0, -1).applyQuaternion(ship.quat), up: V(0, 1, 0).applyQuaternion(ship.quat), right: V(1, 0, 0).applyQuaternion(ship.quat),
  };
}
function bodyInfo(p, body) {
  const r = V().subVectors(p, body.c); const dist = r.length(); const up = r.divideScalar(dist);
  return { body, dist, up, alt: dist - (body.R + body.height(up)) };
}
function nearestBody(p) {
  const e = bodyInfo(p, EARTH), m = bodyInfo(p, MOON);
  return e.alt < m.alt ? e : m;
}
function orientOnSurface(up, fwdHint) {
  const f = fwdHint.clone().addScaledVector(up, -fwdHint.dot(up)).normalize();
  const z = f.clone().negate(); const x = V().crossVectors(up, z).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, up, z));
}
function placeOnRunway() {
  const dir = V(0, EARTH.R, 160).normalize();
  const ground = surfacePoint(EARTH, dir, V());
  ship.quat.copy(orientOnSurface(dir, V(0, 0, -1)));
  ship.gear = 1; ship.bottom = computeBottom(1);
  ship.pos.copy(ground).addScaledVector(dir, ship.bottom + 0.3);
  ship.vel.set(0, 0, 0); ship.ang.set(0, 0, 0); ship.throttle = 0;
  ship.landed = true; ship.onGround = true; ship.alive = true; ship.landedAt = 'qg';
}

// ---------------- entrées clavier ----------------
const keys = {};
const FLIGHT_KEYS = ['a', 'e', 'q', 'd', 'z', 's', ' ', 'x'];
addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (FLIGHT_KEYS.includes(k) || k === 'spacebar') e.preventDefault();
  if (k === 'escape') { closeModal(); $('#wiki').classList.add('hidden'); }
  if (e.repeat) { keys[k] = true; return; }
  keys[k] = true;
  initAudio();
  if (mode !== 'flight') return;
  if (k === 'h') toggleWiki();
  if (k === 'c') { camMode = camMode === 'chase' ? 'cockpit' : 'chase'; toast(camMode === 'cockpit' ? 'Vue cockpit' : 'Vue poursuite'); }
  if (k === 'm') toggleSound();
  if (k === 'f') cravache();
  if (k === 'r') recallCrew();
});
addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

// souris : orbite caméra
let camYaw = 0, camPitch = 0.12, camZoom = 1, dragging = false, lastDrag = 0, dragPos = null;
canvas.addEventListener('pointerdown', e => { if (mode !== 'flight' && mode !== 'title') return; dragging = true; dragPos = { x: e.clientX, y: e.clientY }; });
addEventListener('pointerup', () => { dragging = false; });
addEventListener('pointermove', e => {
  if (!dragging || mode !== 'flight') return;
  camYaw -= (e.clientX - dragPos.x) * 0.006; camPitch = clamp(camPitch + (e.clientY - dragPos.y) * 0.005, -0.6, 1.3);
  dragPos = { x: e.clientX, y: e.clientY }; lastDrag = performance.now();
});
canvas.addEventListener('wheel', e => { if (mode === 'flight') camZoom = clamp(camZoom * (e.deltaY > 0 ? 1.1 : 0.9), 0.5, 3.5); }, { passive: true });

// ---------------- audio ----------------
let AC = null, master = null, engGain = null, engFilter = null, soundOn = true, noiseBuf = null;
function initAudio() {
  if (AC) return;
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    master = AC.createGain(); master.gain.value = 0.5; master.connect(AC.destination);
    noiseBuf = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate);
    const d = noiseBuf.getChannelData(0); let last = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    const src = AC.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    engFilter = AC.createBiquadFilter(); engFilter.type = 'lowpass'; engFilter.frequency.value = 300;
    engGain = AC.createGain(); engGain.gain.value = 0;
    src.connect(engFilter); engFilter.connect(engGain); engGain.connect(master); src.start();
    const osc = AC.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 48;
    const og = AC.createGain(); og.gain.value = 0.04; const of = AC.createBiquadFilter(); of.type = 'lowpass'; of.frequency.value = 180;
    osc.connect(of); of.connect(og); og.connect(engGain); osc.start();
    ship.osc = osc;
  } catch (e) { AC = null; }
}
function tone(freq, dur, type = 'sine', vol = 0.15, slide = 0) {
  if (!AC || !soundOn) return;
  const o = AC.createOscillator(), g = AC.createGain(); o.type = type; o.frequency.value = freq;
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), AC.currentTime + dur);
  g.gain.setValueAtTime(vol, AC.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + dur);
  o.connect(g); g.connect(master); o.start(); o.stop(AC.currentTime + dur);
}
function noise(dur, freq, vol = 0.4, type = 'lowpass') {
  if (!AC || !soundOn) return;
  const s = AC.createBufferSource(); s.buffer = noiseBuf; const f = AC.createBiquadFilter(); f.type = type; f.frequency.value = freq;
  const g = AC.createGain(); g.gain.setValueAtTime(vol, AC.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(); s.stop(AC.currentTime + dur);
}
function sfx(name) {
  if (name === 'click') tone(660, 0.06, 'square', 0.05);
  else if (name === 'place') { tone(220, 0.08, 'square', 0.08); tone(440, 0.1, 'triangle', 0.06); }
  else if (name === 'remove') tone(300, 0.12, 'sawtooth', 0.06, -200);
  else if (name === 'coin') { tone(988, 0.08, 'square', 0.06); setTimeout(() => tone(1318, 0.18, 'square', 0.06), 70); }
  else if (name === 'whip') { noise(0.12, 4000, 0.7, 'highpass'); tone(1800, 0.05, 'square', 0.1, -1200); }
  else if (name === 'boom') { noise(1.2, 400, 1.0); tone(60, 0.8, 'sine', 0.4, -40); }
  else if (name === 'thud') { noise(0.3, 200, 0.6); tone(80, 0.25, 'sine', 0.25, -40); }
  else if (name === 'gear') tone(140, 0.4, 'sawtooth', 0.04, 60);
  else if (name === 'alarm') { tone(880, 0.12, 'square', 0.06); setTimeout(() => tone(660, 0.12, 'square', 0.06), 140); }
  else if (name === 'neutral') { tone(500, 0.2, 'sine', 0.1, 400); }
}
function toggleSound() { soundOn = !soundOn; if (master) master.gain.value = soundOn ? 0.5 : 0; $('#btn-sound').classList.toggle('off', !soundOn); toast(soundOn ? 'Son activé' : 'Son coupé'); }

// ---------------- UI de base ----------------
function toast(msg, kind = '') {
  const el = document.createElement('div'); el.className = 'toast ' + kind; el.textContent = msg;
  const box = $('#toasts'); box.appendChild(el);
  while (box.children.length > 4) box.firstChild.remove();
  setTimeout(() => { el.style.transition = 'opacity .4s'; el.style.opacity = 0; setTimeout(() => el.remove(), 400); }, 2800);
}
function refreshTop() {
  $('#credits').textContent = fmtBig(state.credits) + ' cr';
  $('#prestige').textContent = fmt(state.prestige);
  const hc = $('#h-credits'); if (hc) hc.textContent = fmtBig(state.credits) + ' cr';
}
function floater(text, worldPos, color = '#ffb347') {
  const p = worldPos.clone().project(camera); if (p.z > 1) return;
  const el = document.createElement('div'); el.className = 'floater'; el.textContent = text; el.style.color = color;
  el.style.left = ((p.x + 1) / 2 * innerWidth) + 'px'; el.style.top = ((1 - p.y) / 2 * innerHeight) + 'px';
  $('#markers').appendChild(el);
  requestAnimationFrame(() => { el.style.transform = 'translate(-50%,-180%)'; el.style.opacity = 0; });
  setTimeout(() => el.remove(), 1000);
}
function toggleWiki() { $('#wiki').classList.toggle('hidden'); }
$('#btn-wiki').addEventListener('click', toggleWiki);
$('#wiki-close').addEventListener('click', () => $('#wiki').classList.add('hidden'));
$('#btn-sound').addEventListener('click', toggleSound);
$('#modal-close').addEventListener('click', closeModal);
$('#modal').addEventListener('pointerdown', e => { if (e.target.id === 'modal') closeModal(); });
$('#wiki').addEventListener('pointerdown', e => { if (e.target.id === 'wiki') $('#wiki').classList.add('hidden'); });
$('#btn-whip').addEventListener('click', () => cravache());
$('#btn-recall').addEventListener('click', () => recallCrew());

let modalRender = null;
function openModal(title, render) { $('#modal-title').textContent = title; modalRender = render; $('#modal').classList.remove('hidden'); render($('#modal-body')); sfx('click'); }
function closeModal() { $('#modal').classList.add('hidden'); modalRender = null; }
function rerenderModal() { if (modalRender) modalRender($('#modal-body')); }

// ---------------- modes ----------------
let mode = 'title', camMode = 'chase';
function fadeTo(fn) { const f = $('#fade'); f.classList.add('on'); setTimeout(() => { fn(); f.classList.remove('on'); }, 350); }
$('#btn-start').addEventListener('click', () => { initAudio(); sfx('click'); fadeTo(() => { $('#title').classList.add('hidden'); openHangar(); }); });

function openHangar() {
  mode = 'hangar'; $('#hud').classList.add('hidden'); closeModal();
  if (ship.design) hangar.loadDesign(ship.design);
  if (ship.group) ship.group.visible = false;
  despawnWorkers(true);
  hangar.open(); onResize();
}
function launchFromHangar(design) {
  fadeTo(() => {
    hangar.close();
    buildShipMesh(design);
    const st = ship.stats;
    if (state.firstLaunch) { state.fuel = st.fuelCap; state.firstLaunch = false; toast('Plein offert pour le vol inaugural', 'ok'); }
    state.fuel = Math.min(state.fuel, st.fuelCap);
    placeOnRunway(); state.heat = 0;
    mode = 'flight'; $('#hud').classList.remove('hidden');
    camYaw = 0; camPitch = 0.12; camSmooth = null;
    if (state.obj === 0) state.obj = 1;
    onResize(); updateDock(); refreshTop();
    toast('Sur la piste. Espace pour accélérer, S pour cabrer.', 'ok');
  });
}

// ---------------- physique de vol ----------------
let shake = 0, wasOnGround = false, gearSoundState = 1;
const acc = V(), tmp = V(), tmp2 = V();
function cargoTotal() { let s = 0; for (const k of ORE_KEYS) s += state.cargo[k]; return s; }

function physics(dt) {
  const st = ship.stats; const ax = shipAxes();
  const workersOut = workers.some(w => w.state !== 'inside');
  const mass = st.mass + state.fuel * 0.004 + cargoTotal() * 0.02;
  const accel = st.thrust / mass;
  const near = nearestBody(ship.pos);
  const eInfo = bodyInfo(ship.pos, EARTH);
  const dens = eInfo.alt < EARTH.atmo ? Math.pow(1 - Math.max(0, eInfo.alt) / EARTH.atmo, 2) : 0;

  // --- commandes
  let wantThrust = !!keys[' '];
  if (wantThrust && ship.landed && workersOut) { wantThrust = false; if (!recalling) { recallCrew(); } }
  if (wantThrust && ship.landed) { ship.landed = false; ship.landedAt = null; ship.vel.addScaledVector(near.up, 2.5); onTakeoff(); }
  ship.throttle = approach(ship.throttle, wantThrust ? 1 : 0, dt * (wantThrust ? 1.4 : 3.2));
  const inP = (keys['s'] ? 1 : 0) - (keys['z'] ? 1 : 0);
  const inY = (keys['q'] ? 1 : 0) - (keys['d'] ? 1 : 0);
  const inR = (keys['a'] ? 1 : 0) - (keys['e'] ? 1 : 0);

  // --- chaleur / carburant
  let eff = ship.throttle;
  if (state.heat >= 100) ship.overheat = true;
  if (ship.overheat && state.heat < 60) ship.overheat = false;
  if (ship.overheat) eff *= 0.35;
  if (state.fuel <= 0) { state.fuel = 0; eff *= 0.22; }
  else state.fuel = Math.max(0, state.fuel - st.fuelUse * ship.throttle * dt);
  const speed0 = ship.vel.length();
  const reentry = dens > 0 && speed0 > 260 ? (speed0 - 260) * 0.03 * dens : 0;
  state.heat += (st.heatGen * ship.throttle + reentry - st.cool * (ship.throttle > 0.1 ? 0.75 : 1.3)) * dt;
  state.heat = clamp(state.heat, 0, 100);

  if (ship.landed) {
    ship.vel.set(0, 0, 0);
    if (inY) ship.quat.multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), inY * 0.8 * dt));
    ship.ang.set(0, 0, 0); ship.braking = false;
    return { near, dens, accel };
  }

  // --- forces
  acc.set(0, 0, 0);
  for (const b of [EARTH, MOON]) {
    tmp.subVectors(ship.pos, b.c); const d = tmp.length();
    const g = b.g0 * (b.R / d) * (b.R / d);
    acc.addScaledVector(tmp, -g / d);
  }
  acc.addScaledVector(ax.fwd, accel * eff);
  if (dens > 0) {
    acc.addScaledVector(ship.vel, -0.22 * dens);
    const vf = ship.vel.dot(ax.fwd);
    if (vf > 0 && st.lift > 0) acc.addScaledVector(ax.up, Math.min(vf * 0.03 * st.lift * dens, 9) * Math.max(0, ax.up.dot(eInfo.up)));
  }
  ship.braking = !!keys['x'];
  ship.vel.addScaledVector(acc, dt);
  if (ship.braking) {
    const sp = ship.vel.length();
    if (sp > 0.01) {
      const dec = Math.max(accel * 1.6, 45) * dt * (state.fuel > 0 ? 1 : 0.3);
      ship.vel.multiplyScalar(Math.max(0, sp - dec) / sp);
    }
    state.fuel = Math.max(0, state.fuel - st.fuelUse * 0.6 * dt);
    state.heat = Math.min(100, state.heat + st.heatGen * 0.35 * dt);
  }
  // --- dérive / accroche (assistance de trajectoire)
  const speed = ship.vel.length();
  const gripK = st.grip * (dens > 0.05 ? 1.7 : 0.65) * (0.35 + 0.65 * ship.throttle) * smooth(speed, 18, 70);
  if (gripK > 0 && !ship.onGround) {
    const vf = ship.vel.dot(ax.fwd);
    tmp.copy(ship.vel).addScaledVector(ax.fwd, -vf);
    const latLen = tmp.length(); const keep = Math.exp(-gripK * dt);
    const lost = latLen * (1 - keep);
    tmp.multiplyScalar(keep);
    ship.vel.copy(ax.fwd).multiplyScalar(vf > 0 ? vf + lost * 0.8 : vf).add(tmp);
  }
  // vitesse max (limiteur des moteurs)
  const sp2 = ship.vel.length();
  if (sp2 > st.vmax) ship.vel.multiplyScalar(1 - (1 - st.vmax / sp2) * Math.min(1, dt * 1.5));
  ship.pos.addScaledVector(ship.vel, dt);

  // --- rotation avec assistance de stabilisation
  const ag = st.agility * (dens > 0.05 ? 1 + 0.1 * st.wings : 1);
  const target = V(inP * 1.7 * ag, inY * 1.15 * ag, inR * 2.8 * ag);
  if (!ship.onGround) {
    const rdu = ax.right.dot(near.up);
    if (dens > 0.02) target.y += rdu * 0.9 * Math.min(1, dens * 3) * (0.5 + 0.1 * st.wings);
    if (!inR && near.alt < 600) target.z += -rdu * 1.4;
  }
  if (eff > 0.05) {
    target.x += -(st.thrustCenter.y - st.com.y) * 0.35 * eff;
    target.y += (st.thrustCenter.x - st.com.x) * 0.35 * eff;
  }
  const resp = (inP || inY || inR ? 4.2 : 5.5) * Math.sqrt(ag);
  ship.ang.lerp(target, 1 - Math.exp(-resp * dt));
  ship.quat.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(ship.ang.x * dt, ship.ang.y * dt, ship.ang.z * dt, 'YXZ'))).normalize();

  // --- train d'atterrissage automatique
  const hAlt = near.alt - ship.bottom;
  const gt = (hAlt < 90 || ship.onGround) ? 1 : (hAlt > 130 ? 0 : (ship.gear > 0.5 ? 1 : 0));
  const prevGear = ship.gear;
  ship.gear = approach(ship.gear, gt, dt * 1.1);
  if ((prevGear < 1 && ship.gear === 1) || (prevGear > 0 && ship.gear === 0)) { sfx('gear'); }
  if (prevGear === 1 && ship.gear < 1) toast('Train rentré');
  if (prevGear === 0 && ship.gear > 0) toast('Train d’atterrissage : déploiement automatique');

  // --- contact sol
  const body = near.body;
  let minAlt = Infinity;
  const gearDown = ship.gear > 0.9 && st.gearCount > 0;
  const pts = [];
  for (const p of ship.hullPts) pts.push(p);
  for (let i = 0; i < ship.gearFeet.length; i++) pts.push(footLocal(i, ship.gear, V()));
  for (const p of pts) {
    tmp.copy(p).applyQuaternion(ship.quat).add(ship.pos);
    tmp2.subVectors(tmp, body.c); const d = tmp2.length(); tmp2.divideScalar(d);
    const a = d - (body.R + body.height(tmp2));
    if (a < minAlt) minAlt = a;
  }
  ship.onGround = false;
  if (minAlt < 0) {
    const up = near.up;
    ship.pos.addScaledVector(up, -minAlt);
    const vr = ship.vel.dot(up);
    const limit = gearDown ? (st.gearCount >= 3 ? 14 : 9) : 6;
    if (vr < 0) {
      const impact = -vr;
      if (!wasOnGround && impact > 3) {
        if (impact > limit) { damage((impact - limit) * 4.5, 'Atterrissage brutal'); shake = Math.min(2.5, impact * 0.08); sfx('thud'); burst(ship.pos, 0xb0a090, 40, 12, dust); }
        else { sfx('thud'); shake = 0.3; burst(ship.pos.clone().addScaledVector(up, -ship.bottom), body === MOON ? 0xbdb6aa : 0xa89070, 30, 8, dust); }
      }
      ship.vel.addScaledVector(up, -vr * (gearDown ? 1.05 : 1.25));
    }
    tmp.copy(ship.vel).addScaledVector(up, -ship.vel.dot(up));
    const tl = tmp.length();
    if (!gearDown && tl > 35) damage(tl * 0.04 * dt * 10, 'Raclement de coque');
    const fr = (gearDown ? 0.35 : 2.2) + (ship.braking ? 2 : 0) + (ship.throttle < 0.05 ? 0.6 : 0);
    ship.vel.addScaledVector(tmp, -(1 - Math.exp(-fr * dt)));
    if (!(inP > 0 && ship.throttle > 0.15)) {
      const tq = orientOnSurface(up, ax.fwd);
      ship.quat.slerp(tq, 1 - Math.exp(-3.5 * dt));
    }
    ship.ang.multiplyScalar(0.9);
    ship.onGround = true;
    if (ship.throttle < 0.05 && ship.vel.length() < 2.2 && !ship.braking) land(near);
  }
  wasOnGround = ship.onGround;
  return { near, dens, accel };
}

function damage(n, why) {
  if (n <= 0) return;
  state.hull = Math.max(0, state.hull - n);
  if (n > 3) { toast(`${why} : -${Math.round(n)} % coque`, 'bad'); sfx('alarm'); }
  if (state.hull <= 0 && ship.alive) destroyShip();
}
function burst(p, color, n, spd, sys = fire) {
  const c = new THREE.Color(color);
  for (let i = 0; i < n; i++) sys.emit(p, V((Math.random() - 0.5) * 2, Math.random(), (Math.random() - 0.5) * 2).multiplyScalar(spd), c, 0.6 + Math.random() * 0.9);
}
function destroyShip() {
  ship.alive = false; sfx('boom'); shake = 3;
  for (let i = 0; i < 4; i++) burst(ship.pos, [0xff8a1f, 0xffd23f, 0xff3b1f, 0x888888][i], 120, 40);
  ship.group.visible = false;
  for (const k of ORE_KEYS) state.cargo[k] = 0;
  despawnWorkers(true);
  const el = document.createElement('div'); el.className = 'crashscreen';
  const fee = Math.round(state.credits * 0.1);
  el.innerHTML = `<h2>VAISSEAU DÉTRUIT</h2><p>Cargaison perdue. L'assurance rapatrie l'épave au hangar du QG (franchise : ${fmt(fee)} cr).</p><button class="btn-primary">Retour au hangar</button>`;
  document.body.appendChild(el);
  el.querySelector('button').onclick = () => { el.remove(); state.credits -= fee; state.hull = 100; ship.alive = true; openHangar(); };
}

function land(near) {
  ship.landed = true; ship.vel.set(0, 0, 0); ship.throttle = 0;
  const atQG = near.body === EARTH && near.up.angleTo(BASE_DIR) < 0.28;
  const atCol = near.body === MOON && near.up.angleTo(PAD_DIR) < 0.2;
  ship.landedAt = atQG ? 'qg' : atCol ? 'colony' : (near.body === MOON ? 'moon' : 'earth');
  ship.landedBody = near.body;
  toast(atQG ? 'Posé au QG terrestre' : atCol ? 'Posé sur le pad de la colonie lunaire' : near.body === MOON ? 'Posé sur la Lune' : 'Posé sur Terre (hors QG)', 'ok');
  if (near.body === MOON) { if (state.obj === 3) state.obj = 4; deployWorkers(); }
  if (atQG && state.obj === 5 && cargoTotal() > 0) { /* vente à faire */ }
  updateDock();
}
function onTakeoff() { updateDock(); $('#mining').classList.add('hidden'); }

// ---------------- MINAGE : mineurs, drones, rovers ----------------
const workers = [];
let recalling = false;
const NAMES = ['Gégé', 'Momo', 'Lulu', 'Titi', 'Bébert', 'Jojo', 'Nanard', 'Dédé', 'Fanfan', 'Riri', 'Zézette', 'Pépé'];
const suitMat = new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.6, flatShading: true });
const goldSuit = new THREE.MeshStandardMaterial({ color: 0xffc94a, metalness: 1, roughness: 0.2, flatShading: true });
const visorMat = new THREE.MeshStandardMaterial({ color: 0xffb347, metalness: 1, roughness: 0.1, emissive: 0x552800 });
const packMat = new THREE.MeshStandardMaterial({ color: 0xff8a1f, flatShading: true });
const darkMat = new THREE.MeshStandardMaterial({ color: 0x2a2f38, flatShading: true });
const laserCol = 0x5ee6ff;
function makeMiner(gold) {
  const g = new THREE.Group();
  const s = gold ? goldSuit : suitMat;
  const heatMat = s.clone(); heatMat.emissive = new THREE.Color(0xff2000); heatMat.emissiveIntensity = 0;
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 0.8, 3, 6), heatMat); body.position.y = 1.35; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), heatMat); head.position.y = 2.45; g.add(head);
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6, 0, Math.PI * 2, 0, 1.2), visorMat); visor.position.set(0, 2.47, -0.22); visor.rotation.x = -Math.PI / 2; g.add(visor);
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1, 0.5), packMat); pack.position.set(0, 1.55, 0.55); g.add(pack);
  const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.7, 6), darkMat); gun.rotation.x = Math.PI / 2; gun.position.set(0.5, 1.4, -0.35); g.add(gun);
  const legs = [];
  for (const sx of [-0.25, 0.25]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.8, 0.3), heatMat); l.geometry.translate(0, -0.4, 0); l.position.set(sx, 0.85, 0); g.add(l); legs.push(l); }
  const sack = new THREE.Mesh(new THREE.DodecahedronGeometry(0.4, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x333333, flatShading: true }));
  sack.position.set(0, 2.2, 0.75); sack.visible = false; g.add(sack);
  g.scale.setScalar(1.15);
  return { obj: g, legs, sack, heatMat, gunTip: V(0.5, 1.4, -0.8) };
}
function makeDrone() {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.OctahedronGeometry(0.9, 0), new THREE.MeshStandardMaterial({ color: 0x5c6878, metalness: 0.7, roughness: 0.3, flatShading: true })); b.scale.y = 0.6; g.add(b);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.3, 6, 4), new THREE.MeshBasicMaterial({ color: laserCol })); eye.position.z = -0.7; g.add(eye);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.06, 4, 10), packMat); r.rotation.x = Math.PI / 2; r.position.set(x * 0.9, 0.2, z * 0.9); g.add(r); }
  const sack = new THREE.Mesh(new THREE.DodecahedronGeometry(0.35, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true })); sack.position.y = -0.7; sack.visible = false; g.add(sack);
  return { obj: g, legs: [], sack, gunTip: V(0, 0, -0.8) };
}
function makeRover() {
  const g = new THREE.Group();
  g.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(2.6, 1, 4), new THREE.MeshStandardMaterial({ color: 0xe8e8e8, flatShading: true })), { position: V(0, 1.4, 0) }));
  g.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.3, 4.1), packMat), { position: V(0, 1.95, 0) }));
  const wheels = [];
  for (const [x, z] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.5, 8), darkMat); w.rotation.z = Math.PI / 2; w.position.set(x, 0.7, z); g.add(w); wheels.push(w); }
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 2), darkMat); arm.position.set(0, 2.2, -2); g.add(arm);
  const sack = new THREE.Mesh(new THREE.BoxGeometry(2, 0.9, 2.4), new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true })); sack.position.set(0, 2.4, 0.4); sack.visible = false; g.add(sack);
  return { obj: g, legs: [], wheels, sack, gunTip: V(0, 2.2, -3) };
}

function exitPoint() {
  const w = ship.airlockLocal.clone().applyQuaternion(ship.quat).add(ship.pos);
  return w.sub(MOON.c).normalize();
}
function deployWorkers() {
  if (ship.landedBody !== MOON) return;
  const st = ship.stats;
  if (!(st.airlock && (st.crew > 0 || state.upg.drones || state.upg.rovers))) { toast(st.airlock ? 'Aucun mineur à bord (ajoute des quartiers d’équipage)' : 'Pas de sas : les mineurs ne peuvent pas sortir', 'warn'); $('#mining').classList.remove('hidden'); updateMiningUI(); return; }
  if (st.cargoCap <= 0) { toast('Aucune soute : impossible de stocker le minerai', 'warn'); }
  despawnWorkers(true); recalling = false;
  const ex = exitPoint();
  const list = [];
  for (let i = 0; i < st.crew; i++) list.push('miner');
  for (let i = 0; i < state.upg.drones; i++) list.push('drone');
  for (let i = 0; i < state.upg.rovers; i++) list.push('rover');
  list.forEach((kind, i) => {
    const m = kind === 'miner' ? makeMiner(state.upg.goldsuits) : kind === 'drone' ? makeDrone() : makeRover();
    m.obj.visible = false; scene.add(m.obj);
    const laser = new THREE.Line(new THREE.BufferGeometry().setFromPoints([V(), V()]), new THREE.LineBasicMaterial({ color: kind === 'drone' ? 0xff5ee6 : laserCol, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending }));
    laser.frustumCulled = false; laser.visible = false; scene.add(laser);
    workers.push({
      kind, ...m, laser, dir: ex.clone(), state: 'wait', delay: i * 0.45, target: null, carry: 0, carryType: null, fatigue: 0, boost: 0, stun: 0, phase: Math.random() * 6,
      name: kind === 'miner' ? NAMES[i % NAMES.length] : kind === 'drone' ? `Drone-${i}` : `Rover-${i}`, home: ex.clone(), heading: V(0, 0, -1), idleT: 0,
    });
  });
  $('#mining').classList.remove('hidden');
  toast(`${list.length} unité(s) sortent du sas`, 'ok');
  updateMiningUI(true);
}
function despawnWorkers(immediate) {
  for (const w of workers) { scene.remove(w.obj); scene.remove(w.laser); }
  workers.length = 0;
  for (const g of gasPockets) { scene.remove(g.obj); g.el.remove(); }
  gasPockets.length = 0;
}
function recallCrew() {
  if (!workers.length || !workers.some(w => w.state !== 'inside')) return;
  recalling = true;
  for (const w of workers) if (w.state !== 'inside') { w.state = 'board'; w.laser.visible = false; }
  toast('Rappel de l’équipage : décollage dès que tout le monde est à bord', 'warn');
}
function cravache() {
  const active = workers.filter(w => w.kind === 'miner' && w.state !== 'inside' && w.state !== 'stunned' && w.state !== 'wait');
  if (!active.length) return;
  sfx('whip'); shake = Math.max(shake, 0.25);
  state.cravacheUsed = true;
  const btn = $('#btn-whip'); btn.classList.add('hit'); setTimeout(() => btn.classList.remove('hit'), 90);
  for (const w of active) {
    w.boost = 0.5; w.fatigue += 14;
    const p = w.obj.position.clone().addScaledVector(w.dir, 4);
    floater('x5', p, '#ff6a3d');
    burst(w.obj.position, 0xffd23f, 6, 4, sparks);
  }
}
const workerParams = {
  miner: { speed: 5.5, rate: 1, cap: 5, hover: 0 },
  drone: { speed: 14, rate: 1.3, cap: 7, hover: 4.5 },
  rover: { speed: 7.5, rate: 0.9, cap: 28, hover: 0 },
};
function availableDeposit(w) {
  const range = 110 + state.upg.range * 40;
  const shipDir = w.home;
  let best = null, bestScore = -Infinity;
  for (const d of W.deposits) {
    if (d.amount < 1 || d.tier > state.upg.tier) continue;
    const dist = d.dir.angleTo(shipDir) * MOON.R;
    if (dist > range) continue;
    const claimed = workers.filter(o => o !== w && o.target === d).length;
    const score = ORES[d.type].base * 10 - dist - claimed * 25 - w.dir.angleTo(d.dir) * MOON.R * 0.5;
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}
function moveOnSphere(w, target, speed, dt) {
  const ang = w.dir.angleTo(target);
  const distLeft = ang * MOON.R;
  if (ang < 1e-6) return 0;
  const step = speed * dt / MOON.R;
  tmp.copy(target).addScaledVector(w.dir, -w.dir.dot(target)).normalize();
  w.heading.lerp(tmp, 1 - Math.exp(-8 * dt)).normalize();
  w.dir.lerp(target, Math.min(1, step / ang)).normalize();
  return Math.max(0, distLeft - speed * dt);
}
function placeWorker(w, dt, moving) {
  const P = workerParams[w.kind];
  w.phase += dt * (moving ? 12 * (w.boost > 0 ? 3 : 1) : 2);
  const bob = w.kind === 'drone' ? Math.sin(w.phase * 0.4) * 0.5 : (moving && w.kind === 'miner' ? Math.abs(Math.sin(w.phase)) * 0.35 : 0);
  surfacePoint(MOON, w.dir, w.obj.position, P.hover + bob);
  const up = w.dir; const f = w.heading.clone().addScaledVector(up, -w.heading.dot(up)).normalize();
  if (f.lengthSq() < 0.5) f.copy(localFrame(up).fwd);
  const z = f.clone().negate(); const x = V().crossVectors(up, z).normalize();
  w.obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, up, z));
  if (w.legs.length) { w.legs[0].rotation.x = moving ? Math.sin(w.phase) * 0.7 : 0; w.legs[1].rotation.x = moving ? -Math.sin(w.phase) * 0.7 : 0; }
  if (w.wheels) for (const wh of w.wheels) wh.rotation.x += moving ? dt * 6 : 0;
  if (w.kind === 'miner' && w.state === 'stunned') { w.obj.rotateX(1.3); }
}
let gasTimer = 12;
const gasPockets = [];
function updateWorkers(dt) {
  if (!workers.length) return;
  const st = ship.stats;
  const cap = st.cargoCap;
  let anyMining = false;
  for (const w of workers) {
    const P = workerParams[w.kind];
    if (w.boost > 0) w.boost -= dt;
    const boostMul = w.boost > 0 ? 5 : 1;
    if (w.kind === 'miner') {
      if (w.boost <= 0) w.fatigue = Math.max(0, w.fatigue - dt * 3.2 * (st.spa ? 3 : 1));
      if (w.fatigue >= 100 && w.state !== 'stunned') { w.state = 'stunned'; w.stun = 6; w.fatigue = 60; w.laser.visible = false; toast(`${w.name} s’effondre d’épuisement`, 'bad'); sfx('thud'); }
      w.heatMat.emissiveIntensity = clamp((w.fatigue - 40) / 60, 0, 1) * 1.2;
    }
    const fatMul = w.fatigue > 70 ? 0.6 : 1;
    const goldMul = w.kind === 'miner' && state.upg.goldsuits ? 1.25 : 1;
    const speed = P.speed * (1 + 0.18 * state.upg.boots) * boostMul * fatMul * goldMul * (recalling ? 2 : 1);
    let moving = false;
    w.laser.visible = false;
    switch (w.state) {
      case 'wait': w.delay -= dt; if (w.delay <= 0) { w.state = 'seek'; w.obj.visible = true; burst(w.obj.position, 0xdddddd, 8, 3, dust); } break;
      case 'seek': {
        if (cargoTotal() >= cap) { w.state = 'board'; break; }
        const d = availableDeposit(w);
        if (d) { w.target = d; w.state = 'toOre'; }
        else { w.idleT -= dt; if (w.idleT <= 0) { w.idleT = 2; } }
        break;
      }
      case 'toOre': {
        if (!w.target || w.target.amount < 1) { w.state = 'seek'; break; }
        const left = moveOnSphere(w, w.target.dir, speed, dt); moving = true;
        if (left < 4.5) w.state = 'mine';
        break;
      }
      case 'mine': {
        const d = w.target;
        if (!d || d.amount < 1) { w.state = w.carry > 0 ? 'toShip' : 'seek'; break; }
        if (w.carryType && w.carryType !== d.type && w.carry > 0) { w.state = 'toShip'; break; }
        anyMining = true;
        const capW = P.cap + state.upg.pack * (w.kind === 'rover' ? 8 : 2);
        const rate = P.rate * (0.6 + 0.4 * state.upg.laser) * boostMul * fatMul;
        const amt = Math.min(rate * dt, d.amount, capW - w.carry);
        w.carry += amt; d.amount -= amt; w.carryType = d.type;
        state.colony.xp += amt * d.tier;
        if (d.tier === 3 && amt > 0) state.mined3 = true;
        // laser
        const from = w.gunTip.clone().applyMatrix4(w.obj.matrixWorld);
        const to = surfacePoint(MOON, d.dir, V(), 2.5 + Math.sin(performance.now() * 0.02) * 0.5);
        w.laser.geometry.attributes.position.setXYZ(0, from.x, from.y, from.z);
        w.laser.geometry.attributes.position.setXYZ(1, to.x, to.y, to.z);
        w.laser.geometry.attributes.position.needsUpdate = true; w.laser.visible = true;
        w.laser.material.opacity = 0.6 + Math.random() * 0.4;
        if (Math.random() < dt * 25 * boostMul) sparks.emit(to, V((Math.random() - 0.5) * 6, Math.random() * 6, (Math.random() - 0.5) * 6).addScaledVector(d.dir, 3), new THREE.Color(ORES[d.type].color), 0.5);
        // orienter vers le gisement
        tmp.copy(d.dir).addScaledVector(w.dir, -w.dir.dot(d.dir)); if (tmp.lengthSq() > 1e-10) w.heading.copy(tmp.normalize());
        if (w.carry >= capW - 0.01) w.state = 'toShip';
        break;
      }
      case 'toShip': case 'board': {
        const left = moveOnSphere(w, w.home, speed * (w.state === 'board' ? 1.3 : 1), dt); moving = true;
        if (left < 3) {
          if (w.carry > 0) {
            const space = Math.max(0, cap - cargoTotal());
            const put = Math.min(space, w.carry);
            state.cargo[w.carryType] += put; w.carry = 0;
            if (put > 0.5) floater(`+${Math.floor(put)} ${ORES[w.carryType].name}`, w.obj.position.clone().addScaledVector(w.dir, 3), '#' + new THREE.Color(ORES[w.carryType].color).getHexString());
            w.carryType = null;
          }
          if (w.state === 'board' || recalling) { w.state = 'inside'; w.obj.visible = false; }
          else w.state = cargoTotal() >= cap ? 'inside' : 'seek';
          if (w.state === 'inside') w.obj.visible = false;
        }
        break;
      }
      case 'stunned': w.stun -= dt; if (w.stun <= 0) w.state = w.carry > 0 ? 'toShip' : 'seek'; break;
      case 'inside': break;
    }
    if (w.sack) { w.sack.visible = w.carry > 0.5; if (w.carryType) { w.sack.material.color.setHex(ORES[w.carryType].color); w.sack.material.emissive.setHex(ORES[w.carryType].color); w.sack.material.emissiveIntensity = 0.3; } }
    if (w.state !== 'inside' && w.state !== 'wait') placeWorker(w, dt, moving);
    if (moving && w.kind !== 'drone' && Math.random() < dt * 6 * boostMul) dust.emit(w.obj.position, V((Math.random() - 0.5) * 2, 1.5, (Math.random() - 0.5) * 2), new THREE.Color(0x6a655c), 0.8);
  }
  if (recalling && workers.every(w => w.state === 'inside')) { recalling = false; toast('Équipage à bord. Prêt au décollage.', 'ok'); }
  // poches de gaz
  if (anyMining) {
    gasTimer -= dt;
    if (gasTimer <= 0) { gasTimer = 9 + Math.random() * 9; spawnGas(); }
  }
}
function spawnGas() {
  const mining = workers.filter(w => w.state === 'mine' && w.target);
  if (!mining.length) return;
  const w = mining[Math.floor(Math.random() * mining.length)];
  const f = localFrame(w.target.dir);
  const a = Math.random() * Math.PI * 2, r = 5 + Math.random() * 4;
  const dir = w.target.dir.clone().multiplyScalar(MOON.R).addScaledVector(f.right, Math.cos(a) * r).addScaledVector(f.fwd, Math.sin(a) * r).normalize();
  const obj = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x9dff5c, emissive: 0x5aff20, emissiveIntensity: 1, transparent: true, opacity: 0.6, flatShading: true });
  for (let i = 0; i < 4; i++) { const s = new THREE.Mesh(new THREE.IcosahedronGeometry(1 + Math.random(), 0), mat); s.position.set((Math.random() - 0.5) * 2, Math.random() * 1.5, (Math.random() - 0.5) * 2); obj.add(s); }
  surfacePoint(MOON, dir, obj.position, 0.8); scene.add(obj);
  const el = document.createElement('button'); el.className = 'gas'; el.textContent = 'GAZ';
  const g = { dir, obj, mat, t: 8, max: 8, el, tier: w.target.tier };
  el.addEventListener('pointerdown', e => { e.stopPropagation(); neutralize(g); });
  $('#markers').appendChild(el);
  gasPockets.push(g);
  toast('Poche de gaz instable ! Clique dessus pour la neutraliser', 'warn'); sfx('alarm');
}
function neutralize(g) {
  const i = gasPockets.indexOf(g); if (i < 0) return;
  gasPockets.splice(i, 1); scene.remove(g.obj); g.el.remove();
  const bonus = 20 * Math.pow(6, g.tier - 1);
  state.credits += bonus; refreshTop();
  floater(`Neutralisée +${fmt(bonus)} cr`, g.obj.position, '#b5ff6d'); sfx('neutral');
  burst(g.obj.position, 0x9dff5c, 30, 5, dust);
}
function updateGas(dt) {
  for (let i = gasPockets.length - 1; i >= 0; i--) {
    const g = gasPockets[i];
    g.t -= dt; const k = 1 - g.t / g.max;
    g.obj.scale.setScalar(1 + k * 1.8 + Math.sin(performance.now() * 0.01 * (1 + k * 3)) * 0.12);
    g.mat.color.setRGB(0.6 + k * 0.4, 1 - k * 0.7, 0.36 - k * 0.3); g.mat.emissive.setRGB(0.35 + k * 0.65, 1 - k * 0.8, 0.12);
    g.el.classList.toggle('crit', g.t < 3);
    g.el.textContent = g.t < 3 ? g.t.toFixed(1) : 'GAZ';
    if (g.t <= 0) {
      gasPockets.splice(i, 1); scene.remove(g.obj); g.el.remove();
      const near = workers.filter(w => (w.state === 'mine') && w.dir.angleTo(g.dir) * MOON.R < 14);
      if (near.length) {
        sfx('boom'); shake = 1.5;
        burst(g.obj.position, 0xb5ff6d, 80, 22); burst(g.obj.position, 0xff8a1f, 60, 16);
        for (const w of workers) if (w.state !== 'inside' && w.dir.angleTo(g.dir) * MOON.R < 18) { w.state = 'stunned'; w.stun = 4; w.carry = 0; w.fatigue = Math.min(99, w.fatigue + 30); w.laser.visible = false; }
        if (ship.pos.distanceTo(g.obj.position) < 30) damage(8, 'Explosion de gaz');
        toast('Explosion de gaz ! Mineurs sonnés, minerai perdu', 'bad');
      } else { burst(g.obj.position, 0x9dff5c, 20, 4, dust); }
    }
  }
}
let miningUIt = 0;
function updateMiningUI(force) {
  const list = $('#crew-list');
  if (force || list.children.length !== workers.length) {
    list.innerHTML = workers.map((w, i) => `<div class="crew" data-i="${i}"><span class="nm">${w.name}</span><div class="fb"><i></i></div><span class="st"></span></div>`).join('') || '<div class="crew"><span class="nm">Aucune unité</span></div>';
  }
  const labels = { wait: 'sortie', seek: 'cherche', toOre: '→ filon', mine: 'extrait', toShip: '→ soute', board: 'rentre', stunned: 'K.O.', inside: 'à bord' };
  [...list.querySelectorAll('.crew[data-i]')].forEach(el => {
    const w = workers[+el.dataset.i]; if (!w) return;
    el.querySelector('.fb i').style.width = (w.kind === 'miner' ? w.fatigue : 0) + '%';
    el.querySelector('.st').textContent = (w.boost > 0 ? 'x5 ' : '') + labels[w.state];
    el.classList.toggle('hot', w.fatigue > 70);
  });
  const cap = ship.stats ? ship.stats.cargoCap : 0;
  const status = !workers.length ? '—' : cargoTotal() >= cap ? 'SOUTE PLEINE' : (workers.some(w => w.state === 'seek' || w.state === 'idle') && !workers.some(w => w.state === 'mine' || w.state === 'toOre')) ? 'Aucun filon accessible à portée' : `${Math.floor(cargoTotal())} / ${cap} u`;
  $('#mine-status').textContent = status;
  $('#btn-whip').disabled = !workers.some(w => w.kind === 'miner' && w.state !== 'inside' && w.state !== 'stunned');
}

// ---------------- gisements & colonie ----------------
const COLONY_XP = lvl => 80 * Math.pow(1.6, lvl);
function updateDeposits(dt) {
  for (const d of W.deposits) {
    if (d.amount < d.max) d.amount = Math.min(d.max, d.amount + d.max * 0.0035 * dt);
    const k = clamp(d.amount / d.max, 0, 1);
    const s = k < 0.01 ? 0.001 : 0.25 + 0.75 * k;
    for (const c of d.crystals) c.scale.x = c.scale.z = s, c.scale.y = s * (c.userData.sy || (c.userData.sy = c.scale.y / Math.max(s, 0.001), c.userData.sy));
  }
}
function updateColony(dt) {
  const c = state.colony;
  c.xp += dt * 0.6;
  while (c.lvl < W.colony.stages.length && c.xp >= COLONY_XP(c.lvl)) {
    c.xp -= COLONY_XP(c.lvl); c.lvl++;
    W.colony.stages[c.lvl - 1].visible = true; W.colony.stages[c.lvl - 1].userData.grow = 0.001;
    if (mode === 'flight') toast(`La colonie lunaire s’agrandit : niveau ${c.lvl}`, 'ok');
  }
  for (const s of W.colony.stages) if (s.visible && s.userData.grow < 1) { s.userData.grow = Math.min(1, s.userData.grow + dt * 0.6); const k = s.userData.grow; s.scale.setScalar(Math.max(0.001, 1 - Math.pow(1 - k, 3) + Math.sin(k * Math.PI) * 0.08)); }
  // dividendes
  if (c.lvl > 0) { state.credits += c.lvl * c.lvl * 0.9 * dt; }
  // techniciens
  const n = Math.min(W.colony.techs.length, c.lvl * 2);
  W.colony.techs.forEach((t, i) => {
    t.obj.visible = i < n; if (!t.obj.visible) return;
    if (!t.target || t.wait > 0) { t.wait -= dt; if (t.wait <= 0 || !t.target) { const s = W.colony.stages[Math.floor(Math.random() * Math.max(1, c.lvl))]; const base = s && s.visible ? s.position.clone().sub(MOON.c).normalize() : PAD_DIR.clone(); const f = localFrame(base); t.target = base.multiplyScalar(MOON.R).addScaledVector(f.right, (Math.random() - 0.5) * 30).addScaledVector(f.fwd, (Math.random() - 0.5) * 30).normalize(); t.wait = 0; } }
    const ang = t.dir.angleTo(t.target);
    if (ang * MOON.R < 1) { t.wait = 1 + Math.random() * 4; }
    else {
      const step = 3 * dt / MOON.R; const head = t.target.clone().addScaledVector(t.dir, -t.dir.dot(t.target)).normalize();
      t.dir.lerp(t.target, Math.min(1, step / ang)).normalize();
      surfacePoint(MOON, t.dir, t.obj.position, Math.abs(Math.sin(performance.now() * 0.008 + i)) * 0.25);
      const up = t.dir, z = head.negate(), x = V().crossVectors(up, z).normalize();
      if (x.lengthSq() > 0.5) t.obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, up, V().crossVectors(x, up)));
    }
    if (t.wait > 0) surfacePoint(MOON, t.dir, t.obj.position, 0);
  });
}

// ---------------- BOURSE ----------------
const market = {};
for (const k of ORE_KEYS) market[k] = { mult: 1, hist: Array(80).fill(ORES[k].base) };
let marketT = 0, news = 'Ouverture de la Bourse Terre-Lune.', newsT = 30;
function price(k) { return ORES[k].base * market[k].mult; }
function updateMarket(dt) {
  marketT -= dt; newsT -= dt;
  if (newsT <= 0) {
    newsT = 35 + Math.random() * 30;
    const k = ORE_KEYS[Math.floor(Math.random() * ORE_KEYS.length)];
    const up = Math.random() < 0.55; const amp = 0.25 + Math.random() * 0.45;
    market[k].mult *= up ? 1 + amp : 1 - amp * 0.6;
    news = up ? `Pénurie de ${ORES[k].name} : le cours bondit de +${Math.round(amp * 100)} %` : `Surproduction de ${ORES[k].name} : chute de -${Math.round(amp * 60)} %`;
    if (mode === 'flight') toast('Bourse : ' + news, 'warn');
  }
  if (marketT > 0) return;
  marketT = 1.5;
  for (const k of ORE_KEYS) {
    const m = market[k];
    m.mult += (1 - m.mult) * 0.04 + (Math.random() - 0.5) * 0.07;
    m.mult = clamp(m.mult, 0.35, 2.8);
    m.hist.push(price(k)); m.hist.shift();
  }
  if (modalRender && modalRender.isBourse) rerenderModal();
}
function sell(k, qty) {
  qty = Math.floor(Math.min(qty, state.cargo[k])); if (qty <= 0) return 0;
  let total = 0;
  for (let i = 0; i < qty; i++) { total += price(k); market[k].mult *= Math.exp(-0.0025 / ORES[k].tier); }
  state.cargo[k] -= qty; if (state.cargo[k] < 1) state.cargo[k] = 0;
  state.credits += total; state.earned += total; state.sold = true;
  market[k].hist[market[k].hist.length - 1] = price(k);
  return total;
}
let bourseSel = 'regolith';
function renderBourse(body) {
  const rows = ORE_KEYS.map(k => {
    const o = ORES[k], m = market[k], p = price(k), prev = m.hist[m.hist.length - 6];
    const ch = (p / prev - 1) * 100;
    const qty = Math.floor(state.cargo[k]);
    return `<div class="row" data-k="${k}" style="cursor:pointer;${bourseSel === k ? 'border-color:rgba(255,179,71,.5)' : ''}">
      <div><div class="t">${o.name}<span class="tier t${o.tier}">T${o.tier}</span></div><div class="d">En soute : <b class="num">${fmt(qty)}</b> u · valeur ${fmtBig(qty * p)} cr</div></div>
      <div class="v"><div>${fmt(p)} cr/u</div><div class="${ch >= 0 ? 'up' : 'down'}">${ch >= 0 ? '+' : ''}${ch.toFixed(1)} %</div></div>
      <button class="btn" data-sell="${k}" ${qty ? '' : 'disabled'}>Vendre</button></div>`;
  }).join('');
  const total = ORE_KEYS.reduce((s, k) => s + Math.floor(state.cargo[k]) * price(k), 0);
  body.innerHTML = `<div class="news">FLASH · ${news}</div>
    <div class="chart-wrap"><canvas id="chart" width="700" height="150"></canvas></div>
    ${rows}
    <div class="sum"><span>Valeur totale de la soute (avant impact marché)</span><b class="num">${fmtBig(total)} cr</b></div>
    <button class="btn-primary" id="sell-all" ${total ? '' : 'disabled'}>Tout vendre</button>
    <p class="d" style="color:var(--muted);font-size:12px">Chaque unité vendue fait légèrement baisser le cours. Les prix se rétablissent avec le temps.</p>`;
  body.querySelectorAll('.row[data-k]').forEach(r => r.addEventListener('click', e => { if (e.target.closest('button')) return; bourseSel = r.dataset.k; rerenderModal(); }));
  body.querySelectorAll('[data-sell]').forEach(b => b.addEventListener('click', () => { const g = sell(b.dataset.sell, Infinity); if (g) { sfx('coin'); toast(`Vente : +${fmtBig(g)} cr`, 'ok'); afterSale(); } rerenderModal(); }));
  body.querySelector('#sell-all').addEventListener('click', () => { let g = 0; for (const k of ORE_KEYS) g += sell(k, Infinity); if (g) { sfx('coin'); toast(`Soute vendue : +${fmtBig(g)} cr`, 'ok'); afterSale(); } rerenderModal(); });
  drawChart(body.querySelector('#chart'), bourseSel);
}
renderBourse.isBourse = true;
function afterSale() { refreshTop(); if (state.obj === 5) state.obj = 6; state.prestige = Math.floor(Math.log10(1 + state.earned) * 10) + luxPrestige(); }
function drawChart(cv, k) {
  const c = cv.getContext('2d'); const h = market[k].hist; const w = cv.width, ht = cv.height;
  c.clearRect(0, 0, w, ht);
  const mn = Math.min(...h) * 0.95, mx = Math.max(...h) * 1.05;
  c.strokeStyle = 'rgba(140,170,210,.15)'; c.lineWidth = 1;
  for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(0, ht * i / 4); c.lineTo(w, ht * i / 4); c.stroke(); }
  const col = '#' + new THREE.Color(ORES[k].color).getHexString();
  const grad = c.createLinearGradient(0, 0, 0, ht); grad.addColorStop(0, col + '66'); grad.addColorStop(1, col + '00');
  c.beginPath();
  h.forEach((v, i) => { const x = i / (h.length - 1) * w, y = ht - (v - mn) / (mx - mn) * ht; i ? c.lineTo(x, y) : c.moveTo(x, y); });
  c.strokeStyle = col; c.lineWidth = 2.5; c.stroke();
  c.lineTo(w, ht); c.lineTo(0, ht); c.closePath(); c.fillStyle = grad; c.fill();
  c.fillStyle = '#e6edf6'; c.font = '600 14px JetBrains Mono, monospace';
  c.fillText(`${ORES[k].name} · ${fmt(price(k))} cr/u`, 10, 20);
}

// ---------------- BOUTIQUE / LUXE / RAVITAILLEMENT ----------------
const UPGRADES = [
  { id: 'laser', name: 'Puissance laser', desc: lv => `Vitesse d'extraction x${(0.6 + 0.4 * lv).toFixed(1)}`, cost: lv => 300 * Math.pow(2.1, lv - 1), max: 14 },
  { id: 'pack', name: 'Sac à dos XL', desc: lv => `Charge par mineur : ${5 + lv * 2} u`, cost: lv => 250 * Math.pow(2, lv), max: 12 },
  { id: 'boots', name: 'Bottes magnétiques', desc: lv => `Vitesse de marche +${lv * 18} %`, cost: lv => 220 * Math.pow(2, lv), max: 10 },
  { id: 'range', name: 'Balises de rayon', desc: lv => `Rayon de minage : ${110 + lv * 40} m`, cost: lv => 500 * Math.pow(2.3, lv), max: 8 },
  { id: 'drones', name: 'Drone de minage', desc: lv => `${lv} drone(s) volant(s), sans fatigue`, cost: lv => 3500 * Math.pow(2.2, lv), max: 6 },
  { id: 'rovers', name: 'Rover de transport', desc: lv => `${lv} rover(s), charge 28 u`, cost: lv => 25000 * Math.pow(2.6, lv), max: 3 },
];
const TIERS = [
  { tier: 2, name: 'Laser Cuprum (Tier 2)', desc: 'Débloque Titane et Cuprum (anneau à ~250-500 m de la colonie).', cost: 6000 },
  { tier: 3, name: 'Laser Quantique (Tier 3)', desc: 'Débloque Quantium et Hélium-3 (face cachée de la Lune).', cost: 240000 },
];
const LUXURY = [
  { id: 'chrome', name: 'Coque chromée miroir', desc: 'Ton vaisseau brille comme un yacht. +5 prestige.', cost: 60000, p: 5 },
  { id: 'goldsuits', name: 'Scaphandres plaqués or', desc: 'Mineurs dorés, +25 % de vitesse. +10 prestige.', cost: 800000, p: 10 },
  { id: 'fountain', name: 'Fontaine à champagne du QG', desc: 'Visible depuis la piste. +15 prestige.', cost: 2500000, p: 15 },
  { id: 'statue', name: 'Statue dorée du PDG', desc: 'Douze mètres d’ego en or massif. +40 prestige.', cost: 12000000, p: 40 },
  { id: 'penthouse', name: 'Penthouse-tour du QG', desc: 'Gratte-ciel noir et or au-dessus de la base. +80 prestige.', cost: 60000000, p: 80 },
  { id: 'baron', name: 'Titre de Baron Lunaire', desc: 'La consécration. Fin de partie honorifique. +200 prestige.', cost: 250000000, p: 200 },
];
function luxPrestige() { return LUXURY.reduce((s, l) => s + (state.lux[l.id] ? l.p : 0), 0); }
function renderShop(body) {
  let h = '<div class="section-t">Lasers de palier</div>';
  for (const t of TIERS) {
    const owned = state.upg.tier >= t.tier, locked = state.upg.tier < t.tier - 1;
    h += `<div class="row"><div><div class="t">${t.name}</div><div class="d">${t.desc}</div></div><div class="v">${owned ? 'Acquis' : fmtBig(t.cost) + ' cr'}</div><button class="btn" data-tier="${t.tier}" ${owned || locked || state.credits < t.cost ? 'disabled' : ''}>${owned ? '✓' : locked ? 'Verrouillé' : 'Acheter'}</button></div>`;
  }
  h += '<div class="section-t">Équipage &amp; équipements</div>';
  for (const u of UPGRADES) {
    const lv = state.upg[u.id]; const c = u.cost(lv); const maxed = lv >= u.max;
    h += `<div class="row"><div><div class="t">${u.name} <span class="tier t1">niv. ${lv}</span></div><div class="d">${u.desc(lv)}${maxed ? '' : ' → ' + u.desc(lv + 1)}</div></div><div class="v">${maxed ? 'MAX' : fmtBig(c) + ' cr'}</div><button class="btn" data-up="${u.id}" ${maxed || state.credits < c ? 'disabled' : ''}>Acheter</button></div>`;
  }
  h += '<p class="d" style="color:var(--muted);font-size:12px">Les moteurs, réservoirs et soutes avancés s’achètent directement au Hangar.</p>';
  body.innerHTML = h;
  body.querySelectorAll('[data-up]').forEach(b => b.addEventListener('click', () => {
    const u = UPGRADES.find(x => x.id === b.dataset.up); const c = u.cost(state.upg[u.id]);
    if (state.credits < c) return; state.credits -= c; state.upg[u.id]++; sfx('coin'); refreshTop(); rerenderModal();
  }));
  body.querySelectorAll('[data-tier]').forEach(b => b.addEventListener('click', () => {
    const t = TIERS.find(x => x.tier === +b.dataset.tier); if (state.credits < t.cost) return;
    state.credits -= t.cost; state.upg.tier = t.tier; sfx('coin'); toast(`${t.name} installé`, 'ok');
    if (t.tier === 2 && state.obj === 6) state.obj = 7;
    refreshTop(); rerenderModal();
  }));
}
function renderLux(body) {
  let h = '<p class="d" style="color:var(--muted)">Équipements de prestige. Aucun intérêt rationnel. Indispensables.</p>';
  for (const l of LUXURY) {
    const own = state.lux[l.id];
    h += `<div class="row"><div><div class="t">${l.name}</div><div class="d">${l.desc}</div></div><div class="v">${own ? 'Possédé' : fmtBig(l.cost) + ' cr'}</div><button class="btn" data-lux="${l.id}" ${own || state.credits < l.cost ? 'disabled' : ''}>${own ? '✓' : 'Acheter'}</button></div>`;
  }
  body.innerHTML = h;
  body.querySelectorAll('[data-lux]').forEach(b => b.addEventListener('click', () => {
    const l = LUXURY.find(x => x.id === b.dataset.lux); if (state.credits < l.cost || state.lux[l.id]) return;
    state.credits -= l.cost; state.lux[l.id] = true; sfx('coin');
    if (l.id === 'chrome') { state.chrome = true; buildShipMesh(ship.design); hangar.rebuildMaterials(); }
    if (l.id === 'goldsuits') state.upg.goldsuits = true;
    if (W.qg.lux[l.id]) W.qg.lux[l.id].visible = true;
    state.prestige = Math.floor(Math.log10(1 + state.earned) * 10) + luxPrestige();
    toast(`${l.name} acquis`, 'ok');
    if (l.id === 'baron') { state.obj = 9; setTimeout(() => toast('Félicitations, Baron Lunaire. Le système Terre-Lune t’appartient.', 'ok'), 400); }
    refreshTop(); rerenderModal();
  }));
}
function renderRefuel(body, atMoon) {
  const st = ship.stats; const fp = atMoon ? 3 : 1.2, rp = atMoon ? 9 : 4;
  const need = Math.ceil(st.fuelCap - state.fuel), dmg = Math.ceil(100 - state.hull);
  const fc = Math.ceil(need * fp), rc = Math.ceil(dmg * rp * Math.max(1, st.mass / 10));
  body.innerHTML = `
    <div class="row"><div><div class="t">Carburant</div><div class="d">${Math.floor(state.fuel)} / ${st.fuelCap} u · ${fp} cr/u${atMoon ? ' (tarif lunaire)' : ''}</div></div><div class="v">${need > 0 ? fmt(fc) + ' cr' : 'Plein'}</div><button class="btn" id="b-fuel" ${need <= 0 ? 'disabled' : ''}>Faire le plein</button></div>
    <div class="row"><div><div class="t">Réparation de coque</div><div class="d">Intégrité ${Math.floor(state.hull)} %</div></div><div class="v">${dmg > 0 ? fmt(rc) + ' cr' : 'Intacte'}</div><button class="btn" id="b-rep" ${dmg <= 0 ? 'disabled' : ''}>Réparer</button></div>
    <div class="row"><div><div class="t">Refroidissement forcé</div><div class="d">Chaleur ${Math.floor(state.heat)} %</div></div><div class="v">Gratuit</div><button class="btn" id="b-cool" ${state.heat < 1 ? 'disabled' : ''}>Purger</button></div>`;
  body.querySelector('#b-fuel').onclick = () => { const can = Math.min(need, Math.floor(state.credits / fp)); if (can <= 0) { toast('Crédits insuffisants', 'warn'); return; } state.fuel += can; state.credits -= can * fp; sfx('coin'); refreshTop(); renderRefuel(body, atMoon); };
  body.querySelector('#b-rep').onclick = () => { const unit = rp * Math.max(1, st.mass / 10); const can = Math.min(dmg, Math.floor(state.credits / unit)); if (can <= 0) { toast('Crédits insuffisants', 'warn'); return; } state.hull = Math.min(100, state.hull + can); state.credits -= can * unit; sfx('coin'); refreshTop(); renderRefuel(body, atMoon); };
  body.querySelector('#b-cool').onclick = () => { state.heat = 0; ship.overheat = false; sfx('neutral'); renderRefuel(body, atMoon); };
}
function renderColony(body) {
  const c = state.colony; const maxed = c.lvl >= W.colony.stages.length;
  const inv = Math.round(2500 * Math.pow(2.05, c.lvl));
  body.innerHTML = `
    <div class="row"><div><div class="t">Colonie Selene-1 · niveau ${c.lvl} / ${W.colony.stages.length}</div><div class="d">${c.lvl * 2} techniciens actifs · dividendes ${fmt(c.lvl * c.lvl * 0.9 * 60)} cr/min. La colonie grandit avec le temps et chaque unité minée sur la Lune.</div></div><div class="v">${maxed ? 'MAX' : Math.floor(c.xp) + ' / ' + Math.floor(COLONY_XP(c.lvl)) + ' xp'}</div><span></span></div>
    <div class="row"><div><div class="t">Investir dans un nouveau module</div><div class="d">Construit immédiatement le prochain bâtiment.</div></div><div class="v">${maxed ? '—' : fmtBig(inv) + ' cr'}</div><button class="btn" id="b-inv" ${maxed || state.credits < inv ? 'disabled' : ''}>Investir</button></div>`;
  const b = body.querySelector('#b-inv');
  if (b) b.onclick = () => { if (state.credits < inv) return; state.credits -= inv; c.xp = COLONY_XP(c.lvl) + 0.01; sfx('coin'); refreshTop(); setTimeout(() => renderColony(body), 50); };
}

function updateDock() {
  const dock = $('#dock'); dock.innerHTML = '';
  if (mode !== 'flight' || !ship.landed) return;
  const add = (label, fn, cls = '') => { const b = document.createElement('button'); b.textContent = label; if (cls) b.className = cls; b.onclick = fn; dock.appendChild(b); };
  if (ship.landedAt === 'qg') {
    const l = document.createElement('span'); l.className = 'dock-lbl'; l.textContent = 'QG TERRE'; dock.appendChild(l);
    add('Hangar', () => fadeTo(openHangar), 'main');
    add('Bourse', () => openModal('Bourse Terre-Lune', renderBourse));
    add('Ravitaillement', () => openModal('Ravitaillement & atelier', b => renderRefuel(b, false)));
    add('Boutique', () => openModal('Boutique industrielle', renderShop));
    add('Luxe', () => openModal('Galerie du luxe', renderLux));
  } else if (ship.landedAt === 'colony' || ship.landedAt === 'moon') {
    const l = document.createElement('span'); l.className = 'dock-lbl'; l.textContent = ship.landedAt === 'colony' ? 'COLONIE LUNAIRE' : 'SURFACE LUNAIRE'; dock.appendChild(l);
    if (ship.landedAt === 'colony') {
      add('Colonie', () => openModal('Colonie lunaire', renderColony));
      add('Ravitaillement lunaire', () => openModal('Station-service lunaire', b => renderRefuel(b, true)));
    }
  }
}

// ---------------- OBJECTIFS ----------------
const OBJECTIVES = [
  'Assemble ton vaisseau au Hangar : cockpit, moteur, réservoir',
  'Décolle : maintiens Espace, puis S pour cabrer',
  'Quitte l’atmosphère et aligne le nez sur le marqueur LUNE',
  'Freine avec X, laisse sortir le train et pose-toi en douceur sur la Lune',
  'Laisse les mineurs remplir la soute. Essaie la Cravache',
  'Rentre au QG terrestre et vends ta cargaison à la Bourse',
  'Achète le Laser Cuprum (Boutique) pour miner le Tier 2',
  'Atteins le Tier 3 : Quantium & Hélium-3 sur la face cachée',
  'Deviens Baron Lunaire (Galerie du luxe)',
  'Tu es Baron Lunaire. Continue d’empiler les milliards.',
];
function updateObjectives(info) {
  if (state.obj === 1 && info && bodyInfo(ship.pos, EARTH).alt > 250) state.obj = 2;
  if (state.obj === 2 && bodyInfo(ship.pos, EARTH).alt > EARTH.atmo) { /* reste jusqu'à l'atterrissage */ }
  if (state.obj === 2 && bodyInfo(ship.pos, MOON).alt < 1500) state.obj = 3;
  if (state.obj === 4 && state.cravacheUsed && cargoTotal() >= Math.min(10, ship.stats.cargoCap)) state.obj = 5;
  if (state.obj === 6 && state.upg.tier >= 2) state.obj = 7;
  if (state.obj === 7 && state.mined3) state.obj = 8;
  $('#objective').innerHTML = `<div class="o-k">OBJECTIF ${Math.min(state.obj + 1, OBJECTIVES.length)} / ${OBJECTIVES.length}</div><div class="o-t">${OBJECTIVES[state.obj]}</div>${state.obj < OBJECTIVES.length - 1 ? `<div class="o-n">Ensuite : ${OBJECTIVES[state.obj + 1]}</div>` : ''}`;
}

// ---------------- CAMÉRA ----------------
let camSmooth = null, camUp = V(0, 1, 0), titleT = 0;
function updateCamera(dt, info) {
  if (mode === 'title') {
    titleT += dt * 0.05;
    const p = V(Math.sin(titleT) * 260, 70 + Math.sin(titleT * 2) * 20, 120 + Math.cos(titleT) * 260);
    camera.position.copy(p); camera.up.set(0, 1, 0); camera.lookAt(0, 160, -900);
    return;
  }
  if (!ship.group) return;
  const ax = shipAxes();
  const speed = ship.vel.length();
  const vmax = ship.stats.vmax || 500;
  const sf = clamp(speed / vmax, 0, 1);
  if (!dragging && !ship.landed && performance.now() - lastDrag > 1500) { camYaw *= Math.exp(-2 * dt); camPitch = lerp(camPitch, 0.12, 1 - Math.exp(-2 * dt)); }
  const dist = (ship.size * 1.6 + 10) * camZoom * (1 + sf * 0.25);
  if (camMode === 'cockpit') {
    const p = ship.cockpitLocal.clone().add(V(0, 0.9 * SHIP_SCALE, -0.2)).applyQuaternion(ship.quat).add(ship.pos);
    camera.position.copy(p);
    camera.up.copy(ax.up);
    camera.lookAt(p.clone().addScaledVector(ax.fwd, 100));
  } else {
    const off = V(0, 0, 1).applyAxisAngle(V(1, 0, 0), -camPitch).applyAxisAngle(V(0, 1, 0), camYaw).multiplyScalar(dist).applyQuaternion(ship.quat);
    if (!camSmooth) camSmooth = off.clone();
    camSmooth.lerp(off, 1 - Math.exp(-(ship.landed ? 6 : 4.5) * dt));
    const lag = ship.vel.clone().multiplyScalar(-0.012).clampLength(0, 6);
    camera.position.copy(ship.pos).add(camSmooth).add(lag);
    camUp.lerp(ship.landed ? info.near.up : ax.up, 1 - Math.exp(-3 * dt)).normalize();
    camera.up.copy(camUp);
    camera.lookAt(ship.pos.clone().addScaledVector(ax.fwd, ship.size * 0.8).addScaledVector(camUp, ship.size * 0.15));
  }
  // vibrations & effet de vitesse
  const vib = (sf > 0.8 ? (sf - 0.8) * 1.5 : 0) * ship.throttle + (ship.throttle > 0.5 && ship.onGround ? 0.12 : 0) + (state.heat > 85 ? 0.08 : 0);
  shake = Math.max(0, shake - dt * 2.5);
  const s = (vib + shake) * (camMode === 'cockpit' ? 0.12 : 0.5);
  camera.position.add(V((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s));
  const warp = ship.stats.vmax > 2000 ? smooth(speed, 1200, 2300) : 0;
  const targetFov = 66 + sf * 14 + warp * 18;
  camera.fov = lerp(camera.fov, targetFov, 1 - Math.exp(-3 * dt)); camera.updateProjectionMatrix();
}

// ---------------- VISUELS VAISSEAU ----------------
function updateShipVisuals(dt, info) {
  if (!ship.group) return;
  ship.group.position.copy(ship.pos); ship.group.quaternion.copy(ship.quat);
  const t = performance.now() * 0.001;
  for (const e of ship.engines) {
    const fl = e.mesh.userData.flame, core = e.mesh.userData.flameCore, disc = e.mesh.userData.disc;
    const th = ship.throttle * (ship.overheat ? 0.4 : 1) * (state.fuel > 0 ? 1 : 0.3);
    const len = th * (2.4 + Math.sin(t * 40 + e.local.x) * 0.25 + (e.type === 'eng_quantum' ? 1.5 : 0));
    fl.scale.set(0.8 + th * 0.4, 0.8 + th * 0.4, Math.max(0.01, len)); core.scale.set(0.45, 0.45, Math.max(0.01, len * 0.55));
    fl.material.opacity = 0.25 + th * 0.65; disc.material.opacity = 0.3 + th * 0.7;
    if (e.mesh.userData.spin) e.mesh.userData.spin.rotation.z += dt * (2 + th * 20);
    if (th > 0.05) {
      const wp = e.local.clone().applyQuaternion(ship.quat).add(ship.pos);
      const back = V(0, 0, 1).applyQuaternion(ship.quat);
      const n = Math.ceil(th * 3);
      for (let i = 0; i < n; i++) fire.emit(wp, ship.vel.clone().multiplyScalar(0.85).addScaledVector(back, 25 + Math.random() * 25).add(V((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4)), e.color, 0.35 + Math.random() * 0.4);
    }
  }
  // poussière au sol sous les réacteurs
  if (info && ship.throttle > 0.2 && info.near.alt < 40) {
    const g = surfacePoint(info.near.body, info.near.up, V(), 0.5);
    for (let i = 0; i < 3; i++) dust.emit(g, V((Math.random() - 0.5) * 30, Math.random() * 6, (Math.random() - 0.5) * 30), new THREE.Color(info.near.body === MOON ? 0x8f8a80 : 0x9a8460), 1.2);
  }
  // rétro-frein
  if (ship.braking && !ship.landed) {
    const fwd = V(0, 0, -1).applyQuaternion(ship.quat);
    const p = ship.cockpitLocal.clone().applyQuaternion(ship.quat).add(ship.pos).addScaledVector(fwd, 2);
    for (let i = 0; i < 2; i++) fire.emit(p, ship.vel.clone().multiplyScalar(0.8).addScaledVector(fwd, 30).add(V((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10)), new THREE.Color(0x9fd8ff), 0.3);
  }
  // radiateurs qui rougissent
  const h = state.heat / 100;
  ship.mats.radiator.emissiveIntensity = Math.pow(h, 1.6) * 3.2;
  ship.mats.radiator.emissive.setRGB(1, 0.15 + h * 0.25, 0.02);
  const reentry = info && info.dens > 0 && ship.vel.length() > 260 ? clamp((ship.vel.length() - 260) / 300 * info.dens * 2, 0, 1) : 0;
  ship.mats.hull.emissive.setRGB(reentry * 0.8, reentry * 0.25, 0); ship.mats.hull.emissiveIntensity = 1;
  ship.mats.hullDS.emissive.copy(ship.mats.hull.emissive);
  // pattes articulées
  for (const leg of ship.legs) {
    const d = ship.gear;
    leg.hip.rotation.x = -(1 - d) * 1.5;
    leg.knee.rotation.x = (1 - d) * 2.4;
    leg.foot.rotation.x = -(leg.hip.rotation.x + leg.knee.rotation.x);
    // amortisseur à l'impact
    leg.knee.position.y = -0.7 + (ship.onGround ? Math.sin(t * 30) * 0.01 : 0);
  }
  ship.headlight.intensity = info && info.near.alt < 400 ? 900 : 0;
  ship.glow.intensity = ship.landed ? 50 : 0;
}

// ---------------- HUD ----------------
let hudT = 0;
const markerEls = {};
function marker(id, cls, worldPos, label, dist) {
  let el = markerEls[id];
  if (!el) { el = document.createElement('div'); el.className = 'marker ' + cls; el.innerHTML = '<div class="ring"></div><div class="lab"></div><div class="dist num"></div>'; $('#markers').appendChild(el); markerEls[id] = el; }
  if (!worldPos) { el.style.display = 'none'; return; }
  el.style.display = '';
  const p = worldPos.clone().project(camera);
  let x = (p.x + 1) / 2 * innerWidth, y = (1 - p.y) / 2 * innerHeight;
  let edge = false;
  if (p.z > 1) { x = innerWidth - x; y = innerHeight - y; edge = true; }
  const m = 40;
  if (x < m || x > innerWidth - m || y < m || y > innerHeight - m || edge) {
    const cx = innerWidth / 2, cy = innerHeight / 2; let dx = x - cx, dy = y - cy;
    if (edge && Math.abs(dx) < 1 && Math.abs(dy) < 1) dy = 1;
    const k = Math.min((cx - m) / Math.abs(dx || 1e-6), (cy - m) / Math.abs(dy || 1e-6));
    if (k < 1 || edge) { x = cx + dx * Math.min(k, edge ? k : 1); y = cy + dy * Math.min(k, edge ? k : 1); edge = true; }
  }
  el.classList.toggle('edge', edge);
  el.style.left = x + 'px'; el.style.top = y + 'px';
  el.querySelector('.lab').textContent = label;
  el.querySelector('.dist').textContent = dist < 1000 ? fmt(dist) + ' m' : (dist / 1000).toFixed(1).replace('.', ',') + ' km';
}
function updateHUD(dt, info) {
  if (!ship.stats) return;
  const st = ship.stats;
  const near = info.near;
  // marqueurs
  const mDist = ship.pos.distanceTo(MOON.c) - MOON.R;
  marker('moon', 'moon', mDist > 300 ? MOON.c : null, 'LUNE', mDist);
  const qgP = surfacePoint(EARTH, BASE_DIR, V(), 30);
  const qd = ship.pos.distanceTo(qgP);
  marker('qg', 'qg', (qd > 150 && !(ship.landedAt === 'qg')) ? qgP : null, 'QG TERRE', qd);
  const colP = surfacePoint(MOON, PAD_DIR, V(), 10);
  const cd = ship.pos.distanceTo(colP);
  marker('col', 'col', (cd > 80 && cd < 2500 && ship.landedAt !== 'colony') ? colP : null, 'COLONIE', cd);
  const t2P = surfacePoint(MOON, W.deposits.find(d => d.tier === 2).dir, V(), 10);
  marker('t2', 't2', state.upg.tier >= 2 && near.body === MOON && ship.pos.distanceTo(t2P) > 150 ? t2P : null, 'TIER 2', ship.pos.distanceTo(t2P));
  const t3P = surfacePoint(MOON, PAD_DIR.clone().negate(), V(), 10);
  marker('t3', 't3', state.upg.tier >= 3 && ship.pos.distanceTo(t3P) > 250 ? t3P : null, 'TIER 3 · FACE CACHÉE', ship.pos.distanceTo(t3P));
  // gaz
  for (const g of gasPockets) { const p = g.obj.position.clone().project(camera); g.el.style.display = p.z > 1 ? 'none' : ''; g.el.style.left = ((p.x + 1) / 2 * innerWidth) + 'px'; g.el.style.top = ((1 - p.y) / 2 * innerHeight) + 'px'; }
  // vecteur vitesse (prograde)
  const pg = $('#prograde'); const sp = ship.vel.length();
  if (sp > 5 && camMode === 'chase') {
    const p = ship.pos.clone().addScaledVector(ship.vel.clone().normalize(), 200).project(camera);
    if (p.z < 1) { pg.style.display = ''; pg.style.left = ((p.x + 1) / 2 * innerWidth) + 'px'; pg.style.top = ((1 - p.y) / 2 * innerHeight) + 'px'; } else pg.style.display = 'none';
  } else pg.style.display = 'none';
  const ch = $('#crosshair');
  { const ax = shipAxes(); const p = ship.pos.clone().addScaledVector(ax.fwd, 200).project(camera); if (p.z < 1) { ch.style.left = ((p.x + 1) / 2 * innerWidth) + 'px'; ch.style.top = ((1 - p.y) / 2 * innerHeight) + 'px'; ch.style.display = ''; } else ch.style.display = 'none'; }

  hudT -= dt; if (hudT > 0) return; hudT = 0.08;
  const ax = shipAxes();
  const vs = ship.vel.dot(near.up);
  const drift = sp > 10 ? Math.acos(clamp(ship.vel.clone().normalize().dot(ax.fwd), -1, 1)) * 180 / Math.PI : 0;
  $('#i-speed').textContent = fmt(sp);
  $('#i-alt').textContent = fmt(Math.max(0, near.alt - ship.bottom));
  const vsEl = $('#i-vs'); vsEl.textContent = (vs >= 0 ? '+' : '') + vs.toFixed(1).replace('.', ',');
  const limit = st.gearCount >= 3 ? 14 : 9;
  vsEl.style.color = (near.alt < 120 && vs < -limit) ? 'var(--red)' : (near.alt < 120 && vs < -limit * 0.6 ? 'var(--amber)' : '');
  $('#i-drift').textContent = fmt(drift);
  $('#b-thr').style.width = (ship.throttle * 100) + '%';
  $('#b-fuel').style.width = (state.fuel / st.fuelCap * 100) + '%'; $('#t-fuel').textContent = Math.floor(state.fuel) + ' u';
  $('#b-heat').style.width = state.heat + '%'; $('#t-heat').textContent = Math.floor(state.heat) + ' %';
  $('#b-hull').style.width = state.hull + '%'; $('#t-hull').textContent = Math.floor(state.hull) + ' %';
  const ct = cargoTotal(); $('#b-cargo').style.width = (st.cargoCap ? ct / st.cargoCap * 100 : 0) + '%'; $('#t-cargo').textContent = `${Math.floor(ct)}/${st.cargoCap}`;
  const tg = $('#tag-gear'); tg.className = 'tag ' + (ship.gear > 0.95 ? 'on' : ship.gear > 0.02 ? 'warn' : ''); tg.textContent = ship.gear > 0.95 ? 'TRAIN SORTI' : ship.gear > 0.02 ? 'TRAIN…' : 'TRAIN RENTRÉ';
  const gr = $('#tag-grav'); const g = near.body.g0 * Math.pow(near.body.R / near.dist, 2); gr.textContent = `G ${near.body.name.toUpperCase()} ${g.toFixed(1).replace('.', ',')}`; gr.className = 'tag ' + (g > 0.5 ? 'warn' : '');
  $('#tag-brake').className = 'tag ' + (ship.braking ? 'bad' : '');
  $('#tag-assist').className = 'tag on';
  $('#loc-label').textContent = ship.landed ? (ship.landedAt === 'qg' ? 'QG Terre' : ship.landedAt === 'colony' ? 'Colonie lunaire' : ship.landedAt === 'moon' ? 'Surface lunaire' : 'Terre') : (info.dens > 0 ? 'Atmosphère' : near.body === MOON && near.alt < 1500 ? 'Orbite lunaire' : 'Espace profond');
  // alertes
  const al = [];
  if (ship.overheat) al.push(['SURCHAUFFE — POUSSÉE RÉDUITE', '']);
  else if (state.heat > 80) al.push(['CHALEUR CRITIQUE', 'warn']);
  if (state.fuel <= 0) al.push(['RÉSERVOIR VIDE — PROPULSION DE SECOURS', '']);
  else if (state.fuel < st.fuelCap * 0.15) al.push(['CARBURANT BAS', 'warn']);
  if (state.hull < 30) al.push(['COQUE CRITIQUE', '']);
  if (!ship.landed && near.alt < 150 && vs < -limit && !ship.onGround) al.push([`VITESSE DE DESCENTE ${Math.round(-vs)} m/s — FREINE (X)`, '']);
  if (recalling) al.push(['RAPPEL DE L’ÉQUIPAGE EN COURS', 'info']);
  if (st.thrust / (st.mass + 1) < 12 && ship.landed && near.body === EARTH) al.push(['POUSSÉE FAIBLE', 'warn']);
  $('#alerts').innerHTML = al.map(([t, c]) => `<div class="alert ${c}">${t}</div>`).join('');
  refreshTop();
  updateObjectives(info);
  miningUIt -= 0.08; if (workers.length) updateMiningUI();
}

// ---------------- ciel / atmosphère ----------------
function updateSky(dt) {
  const ref = mode === 'flight' && ship.group ? ship.pos : camera.position;
  const e = bodyInfo(ref, EARTH);
  const t = clamp(e.alt / (EARTH.atmo * 1.6), 0, 1);
  const k = Math.pow(t, 0.6);
  scene.background.copy(SKY).lerp(SPACE, k);
  scene.fog.color.copy(scene.background);
  scene.fog.near = lerp(600, 60000, k); scene.fog.far = lerp(5000, 200000, k);
  W.stars.material.opacity = clamp((k - 0.25) * 1.6, 0, 1);
  W.stars.position.copy(camera.position);
  W.sun.position.copy(camera.position).addScaledVector(SUN_DIR, 80000);
  hemi.intensity = lerp(0.6, 0.18, k);
  const target = mode === 'flight' && ship.group ? ship.pos : V(0, 0, 0);
  sun.position.copy(target).addScaledVector(SUN_DIR, 400); sun.target.position.copy(target);
  // streaks
  const sp = mode === 'flight' ? ship.vel.length() : 0;
  const op = clamp((sp - 120) / 500, 0, 0.75);
  streakMat.opacity = op;
  if (op > 0) {
    const dir = ship.vel.clone().normalize(); const len = clamp(sp * 0.03, 2, 70);
    const R = 140; const cp = camera.position;
    for (let i = 0; i < STREAKS; i++) {
      const s = streakSeeds[i];
      s.addScaledVector(dir, -sp * dt / R);
      if (s.lengthSq() > 1) s.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize().multiplyScalar(0.98).addScaledVector(dir, 0.6).clampLength(0, 0.98);
      const a = cp.clone().addScaledVector(s, R);
      const b = a.clone().addScaledVector(dir, -len);
      streakPos.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6);
    }
    streakGeo.attributes.position.needsUpdate = true;
    const warp = ship.stats.vmax > 2000 ? smooth(sp, 1200, 2300) : 0;
    streakMat.color.setRGB(0.75 + warp * 0.03, 0.9 - warp * 0.45, 1);
  }
}

// ---------------- boucle ----------------
const clock = new THREE.Clock();
function onResize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); hangar.resize(w, h);
}
addEventListener('resize', onResize); onResize();

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  updateMarket(dt);
  updateColony(dt);
  updateDeposits(dt);
  if (mode === 'hangar') {
    hangar.update(dt); refreshTop();
    renderer.render(hangar.scene, hangar.camera);
    engineSound(0);
    return;
  }
  let info = null;
  if (mode === 'flight' && ship.alive) {
    const sp = ship.vel.length();
    const n = clamp(Math.ceil(sp * dt / 4), 1, 8);
    for (let i = 0; i < n; i++) info = physics(dt / n);
    updateWorkers(dt); updateGas(dt);
  }
  if (mode === 'flight' && !info) info = { near: nearestBody(ship.pos), dens: 0 };
  if (mode === 'flight') updateShipVisuals(dt, info);
  fire.update(dt, 1.5); dust.update(dt, 1.2); sparks.update(dt, 0.5);
  updateCamera(dt, info);
  updateSky(dt);
  if (mode === 'flight') updateHUD(dt, info);
  engineSound(mode === 'flight' ? ship.throttle : 0);
  renderer.render(scene, camera);
}
function engineSound(th) {
  if (!AC || !engGain) return;
  engGain.gain.setTargetAtTime(soundOn ? th * 0.35 + (ship.braking ? 0.12 : 0) : 0, AC.currentTime, 0.08);
  engFilter.frequency.setTargetAtTime(200 + th * 900 + ship.vel.length() * 0.5, AC.currentTime, 0.1);
  if (ship.osc) ship.osc.frequency.setTargetAtTime(40 + th * 40, AC.currentTime, 0.1);
}
refreshTop();
frame();

// accès debug pour tests
window.__game = { THREE, MOON, PAD_DIR, orientOnSurface, state, ship, keys, workers, W, market, openHangar, deployWorkers, get mode() { return mode; } };
