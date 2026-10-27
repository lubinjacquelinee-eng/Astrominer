// ============================================================
//  HANGAR : construction modulaire libre sur grille 3D
// ============================================================
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PARTS, PART_ORDER, makeMaterials, buildPartMesh, computeStats, validate } from './parts.js';

const BOUNDS = { x: [-5, 5], y: [-3, 3], z: [-7, 7] };
const key = (x, y, z) => `${x},${y},${z}`;

export const STARTER = [
  ['cockpit', 0, 0, -1], ['chassis', 0, 0, 1], ['eng_plasma', 0, 0, 2], ['tank', 0, 1, 0], ['tank', 0, 1, 1],
  ['crew', 0, -1, 0], ['airlock', 0, -1, 1], ['cargo', 1, 0, 0], ['cargo', -1, 0, 0],
  ['wing', 2, 0, 0], ['wing', -2, 0, 0], ['gear', 0, -1, -1], ['gear', 1, -1, 0], ['gear', -1, -1, 0], ['radiator', 0, 1, 2],
];

export function createHangar(renderer, game) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b1220);
  scene.fog = new THREE.Fog(0x0b1220, 30, 70);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  camera.position.set(11, 8, 12);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.target.set(0, 0, 0); controls.minDistance = 5; controls.maxDistance = 30;
  controls.enabled = false;

  scene.add(new THREE.HemisphereLight(0xbcd4ff, 0x302820, 0.9));
  const key1 = new THREE.DirectionalLight(0xffffff, 2.2); key1.position.set(8, 14, 6); key1.castShadow = true;
  key1.shadow.mapSize.set(1024, 1024); Object.assign(key1.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12 }); scene.add(key1);
  const rim = new THREE.DirectionalLight(0xffa040, 1.2); rim.position.set(-10, 4, -8); scene.add(rim);

  // sol + structure du hangar
  const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 48), new THREE.MeshStandardMaterial({ color: 0x1a2232, roughness: 0.8, metalness: 0.3 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -4.4; floor.receiveShadow = true; scene.add(floor);
  const grid = new THREE.GridHelper(40, 40, 0xff8a1f, 0x2b3a55); grid.position.y = -4.38; scene.add(grid);
  // grille de construction 3D (wireframe)
  const box = new THREE.Box3Helper(new THREE.Box3(new THREE.Vector3(BOUNDS.x[0] - 0.5, BOUNDS.y[0] - 0.5, BOUNDS.z[0] - 0.5), new THREE.Vector3(BOUNDS.x[1] + 0.5, BOUNDS.y[1] + 0.5, BOUNDS.z[1] + 0.5)), 0x2f4a70);
  scene.add(box);
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(1, 16, 1), new THREE.MeshStandardMaterial({ color: 0x2a3446, metalness: 0.6, roughness: 0.4 }));
    pillar.position.set(Math.cos(a) * 24, 3, Math.sin(a) * 24); scene.add(pillar);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.3, 1.4), new THREE.MeshBasicMaterial({ color: 0xffd9a0 }));
    lamp.position.set(Math.cos(a) * 23, 10, Math.sin(a) * 23); scene.add(lamp);
  }
  // flèche du nez
  const arrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, -4.3, -8.5), 3, 0x5ee6ff, 1, 0.6); scene.add(arrow);

  const shipGroup = new THREE.Group(); scene.add(shipGroup);
  let mats = makeMaterials(game.state.chrome);
  const parts = new Map(); // key -> {type,x,y,z,mesh,hit}
  const hitMeshes = [];
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });

  const comMarker = new THREE.Group();
  comMarker.add(new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffd23f, depthTest: false })));
  comMarker.add(new THREE.AxesHelper(0.8)); comMarker.renderOrder = 10; scene.add(comMarker);
  const thrMarker = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 6), new THREE.MeshBasicMaterial({ color: 0x5ab8ff, depthTest: false }));
  thrMarker.renderOrder = 10; scene.add(thrMarker);

  // fantôme de placement
  let ghost = null, ghostCell = null, hoverPart = null;
  const ghostMatOk = new THREE.MeshBasicMaterial({ color: 0x5ee6ff, transparent: true, opacity: 0.4, depthWrite: false });
  const ghostMatBad = new THREE.MeshBasicMaterial({ color: 0xff4d4d, transparent: true, opacity: 0.4, depthWrite: false });
  const ghostBox = new THREE.Mesh(new THREE.BoxGeometry(1.02, 1.02, 1.02), ghostMatOk); ghostBox.visible = false; scene.add(ghostBox);
  const delBox = new THREE.Mesh(new THREE.BoxGeometry(1.08, 1.08, 1.08), new THREE.MeshBasicMaterial({ color: 0xff4d4d, transparent: true, opacity: 0.35, depthWrite: false })); delBox.visible = false; scene.add(delBox);

  let selected = 'chassis', mode = 'place', symmetry = true;

  function addPart(type, x, y, z, free = false) {
    const k = key(x, y, z);
    if (parts.has(k)) return false;
    const def = PARTS[type];
    if (!free) { if (game.state.credits < def.cost) return false; game.state.credits -= def.cost; }
    const mesh = buildPartMesh(type, mats, x);
    mesh.position.set(x, y, z); shipGroup.add(mesh);
    mesh.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
    const hit = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), hitMat); hit.position.set(x, y, z); hit.userData.cell = k; scene.add(hit); hitMeshes.push(hit);
    parts.set(k, { type, x, y, z, mesh, hit });
    // animation pop
    mesh.scale.setScalar(0.3); mesh.userData.pop = 0;
    return true;
  }
  function removePart(k, refund = true) {
    const p = parts.get(k); if (!p || p.type === 'core') return false;
    shipGroup.remove(p.mesh); scene.remove(p.hit); hitMeshes.splice(hitMeshes.indexOf(p.hit), 1);
    parts.delete(k);
    if (refund) game.state.credits += PARTS[p.type].cost;
    return true;
  }
  function connectedWithout(k) {
    // vérifie que toutes les pièces restent reliées au noyau si on enlève k
    const seen = new Set([key(0, 0, 0)]); const stack = [[0, 0, 0]];
    while (stack.length) {
      const [x, y, z] = stack.pop();
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        const nk = key(x + dx, y + dy, z + dz);
        if (nk === k || seen.has(nk) || !parts.has(nk)) continue;
        seen.add(nk); stack.push([x + dx, y + dy, z + dz]);
      }
    }
    return seen.size === parts.size - 1;
  }
  function inBounds(x, y, z) { return x >= BOUNDS.x[0] && x <= BOUNDS.x[1] && y >= BOUNDS.y[0] && y <= BOUNDS.y[1] && z >= BOUNDS.z[0] && z <= BOUNDS.z[1]; }

  function loadDesign(list) {
    for (const k of [...parts.keys()]) { const p = parts.get(k); if (p.type !== 'core') { shipGroup.remove(p.mesh); scene.remove(p.hit); hitMeshes.splice(hitMeshes.indexOf(p.hit), 1); parts.delete(k); } }
    if (!parts.has(key(0, 0, 0))) addPart('core', 0, 0, 0, true);
    for (const p of list) if (p.type !== 'core') addPart(p.type, p.x, p.y, p.z, true);
  }
  function rebuildMaterials() {
    mats = makeMaterials(game.state.chrome);
    const list = getDesign(); loadDesign(list);
  }
  function getDesign() { return [...parts.values()].map(p => ({ type: p.type, x: p.x, y: p.y, z: p.z })); }

  addPart('core', 0, 0, 0, true);

  // ---------- Interaction souris ----------
  const ray = new THREE.Raycaster(); const mouse = new THREE.Vector2();
  let downPos = null;
  function pick(ev) {
    const r = renderer.domElement.getBoundingClientRect();
    mouse.x = ((ev.clientX - r.left) / r.width) * 2 - 1; mouse.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(mouse, camera);
    const hits = ray.intersectObjects(hitMeshes, false);
    return hits[0] || null;
  }
  function updateHover(ev) {
    const h = pick(ev);
    ghostCell = null; hoverPart = null; ghostBox.visible = false; delBox.visible = false;
    if (ghost) ghost.visible = false;
    if (!h) return;
    const p = parts.get(h.object.userData.cell);
    if (mode === 'delete') {
      if (p && p.type !== 'core') { hoverPart = p; delBox.position.set(p.x, p.y, p.z); delBox.visible = true; }
      return;
    }
    const n = h.face.normal;
    const c = { x: p.x + Math.round(n.x), y: p.y + Math.round(n.y), z: p.z + Math.round(n.z) };
    const ok = inBounds(c.x, c.y, c.z) && !parts.has(key(c.x, c.y, c.z)) && game.state.credits >= PARTS[selected].cost;
    ghostCell = { ...c, ok };
    ghostBox.material = ok ? ghostMatOk : ghostMatBad; ghostBox.position.set(c.x, c.y, c.z); ghostBox.visible = true;
    if (!ghost || ghost.userData.type !== selected || ghost.userData.side !== Math.sign(c.x)) {
      if (ghost) scene.remove(ghost);
      ghost = buildPartMesh(selected, mats, c.x); ghost.userData.type = selected; ghost.userData.side = Math.sign(c.x);
      ghost.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.55; o.material.depthWrite = false; } });
      scene.add(ghost);
    }
    ghost.position.set(c.x, c.y, c.z); ghost.visible = ok;
  }
  function onDown(ev) { if (!active) return; downPos = { x: ev.clientX, y: ev.clientY, b: ev.button }; }
  function onUp(ev) {
    if (!active || !downPos) return;
    const moved = Math.hypot(ev.clientX - downPos.x, ev.clientY - downPos.y) > 6;
    const btn = downPos.b; downPos = null;
    if (moved) return;
    updateHover(ev);
    if (btn === 2 || mode === 'delete') {
      const h = pick(ev); if (!h) return;
      const k = h.object.userData.cell; const p = parts.get(k);
      if (!p || p.type === 'core') return;
      if (!connectedWithout(k)) { game.toast('Pièce porteuse : retire d’abord ce qui y est accroché', 'warn'); return; }
      removePart(k); game.sfx('remove');
      if (symmetry && p.x !== 0) { const mk = key(-p.x, p.y, p.z); const m = parts.get(mk); if (m && m.type === p.type && connectedWithout(mk)) removePart(mk); }
    } else if (ghostCell) {
      if (!ghostCell.ok) { game.toast(game.state.credits < PARTS[selected].cost ? 'Crédits insuffisants' : 'Emplacement invalide', 'warn'); return; }
      addPart(selected, ghostCell.x, ghostCell.y, ghostCell.z); game.sfx('place');
      if (symmetry && ghostCell.x !== 0) {
        const mx = -ghostCell.x;
        if (inBounds(mx, ghostCell.y, ghostCell.z) && !parts.has(key(mx, ghostCell.y, ghostCell.z))) {
          // il faut un voisin pour le miroir
          const hasN = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].some(([a, b, c]) => parts.has(key(mx + a, ghostCell.y + b, ghostCell.z + c)));
          if (hasN) addPart(selected, mx, ghostCell.y, ghostCell.z);
        }
      }
    }
    refreshUI(); updateHover(ev);
  }
  renderer.domElement.addEventListener('pointerdown', onDown);
  renderer.domElement.addEventListener('pointerup', onUp);
  renderer.domElement.addEventListener('pointermove', ev => { if (active) updateHover(ev); });
  renderer.domElement.addEventListener('contextmenu', ev => { if (active) ev.preventDefault(); });

  // ---------- UI DOM ----------
  const ui = document.getElementById('hangar-ui');
  const palette = ui.querySelector('.palette-list');
  const statsEl = ui.querySelector('.hangar-stats');
  function buildPalette() {
    palette.innerHTML = '';
    let cat = '';
    for (const t of PART_ORDER) {
      if (t === 'core') continue;
      const d = PARTS[t];
      if (d.cat !== cat) { cat = d.cat; const h = document.createElement('div'); h.className = 'pal-cat'; h.textContent = cat; palette.appendChild(h); }
      const b = document.createElement('button');
      b.className = 'pal-item'; b.dataset.type = t;
      b.innerHTML = `<span class="pal-name">${d.name}</span><span class="pal-cost num">${game.fmt(d.cost)} cr</span><span class="pal-desc">${d.desc}</span>`;
      b.addEventListener('click', () => { selected = t; mode = 'place'; game.sfx('click'); refreshUI(); });
      palette.appendChild(b);
    }
  }
  function refreshUI() {
    for (const b of palette.querySelectorAll('.pal-item')) {
      const d = PARTS[b.dataset.type];
      b.classList.toggle('active', b.dataset.type === selected && mode === 'place');
      b.classList.toggle('locked', game.state.credits < d.cost);
    }
    ui.querySelector('[data-act=delete]').classList.toggle('active', mode === 'delete');
    ui.querySelector('[data-act=place]').classList.toggle('active', mode === 'place');
    ui.querySelector('[data-act=sym]').textContent = `Symétrie : ${symmetry ? 'ON' : 'OFF'}`;
    const list = getDesign();
    const st = computeStats(list);
    const v = validate(st, list);
    comMarker.position.copy(st.com);
    thrMarker.visible = st.engines > 0; thrMarker.position.copy(st.thrustCenter);
    const off = st.engines ? Math.hypot(st.thrustCenter.x - st.com.x, st.thrustCenter.y - st.com.y) : 0;
    const vmax = st.vmax || 0;
    const tTransit = vmax ? Math.round(8540 / vmax + vmax / Math.max(st.accel, 1) * 0.9) : 0;
    statsEl.innerHTML = `
      <div class="stat-grid">
        <div><span>Masse</span><b class="num">${st.mass.toFixed(1)} t</b></div>
        <div><span>Poussée</span><b class="num">${game.fmt(st.thrust)} kN</b></div>
        <div><span>Accélération</span><b class="num">${st.accel.toFixed(0)} m/s²</b></div>
        <div><span>Vitesse max</span><b class="num">${vmax} m/s</b></div>
        <div><span>Transit Lune</span><b class="num">${tTransit ? '~' + tTransit + ' s' : '—'}</b></div>
        <div><span>Agilité</span><b class="num">${(st.agility * 100).toFixed(0)} %</b></div>
        <div><span>Carburant</span><b class="num">${st.fuelCap} u</b></div>
        <div><span>Refroid.</span><b class="num">${st.cool.toFixed(0)} / ${st.heatGen.toFixed(0)}</b></div>
        <div><span>Soute</span><b class="num">${st.cargoCap} u</b></div>
        <div><span>Mineurs</span><b class="num">${st.crew}</b></div>
        <div><span>Sas</span><b class="num">${st.airlocks}${st.airlocks > 1 ? ' (sortie x' + st.airlocks + ')' : ''}</b></div>
        <div><span>Déséquilibre</span><b class="num ${off > 0.6 ? 'bad' : ''}">${off.toFixed(2)}</b></div>
        <div><span>Valeur</span><b class="num">${game.fmt(st.cost)} cr</b></div>
      </div>
      <ul class="checklist">${v.issues.map(i => `<li class="${i.ok ? 'ok' : (i.warn ? 'warn' : 'bad')}">${i.t}</li>`).join('')}</ul>
      <p class="hint">Point jaune : centre de masse. Point bleu : centre de poussée. S'ils sont décalés, le vaisseau tire d'un côté en accélérant.</p>`;
    const launch = ui.querySelector('[data-act=launch]');
    launch.disabled = !v.canFly;
    game.refreshTop();
  }
  ui.querySelector('[data-act=place]').addEventListener('click', () => { mode = 'place'; refreshUI(); });
  ui.querySelector('[data-act=delete]').addEventListener('click', () => { mode = 'delete'; refreshUI(); });
  ui.querySelector('[data-act=sym]').addEventListener('click', () => { symmetry = !symmetry; refreshUI(); });
  ui.querySelector('[data-act=clear]').addEventListener('click', () => {
    for (const k of [...parts.keys()]) if (k !== key(0, 0, 0)) { game.state.credits += PARTS[parts.get(k).type].cost; const p = parts.get(k); shipGroup.remove(p.mesh); scene.remove(p.hit); hitMeshes.splice(hitMeshes.indexOf(p.hit), 1); parts.delete(k); }
    game.sfx('remove'); refreshUI();
  });
  ui.querySelector('[data-act=starter]').addEventListener('click', () => {
    let placed = 0;
    for (let pass = 0; pass < 3; pass++) for (const [t, x, y, z] of STARTER) {
      if (parts.has(key(x, y, z))) continue;
      const hasN = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].some(([a, b, c]) => parts.has(key(x + a, y + b, z + c)));
      if (hasN && addPart(t, x, y, z)) placed++;
    }
    game.toast(placed ? `Modèle de départ assemblé (${placed} pièces)` : 'Rien à ajouter (ou crédits insuffisants)', placed ? 'ok' : 'warn');
    game.sfx('place'); refreshUI();
  });
  ui.querySelector('[data-act=launch]').addEventListener('click', () => {
    const list = getDesign(); const st = computeStats(list); const v = validate(st, list);
    if (!v.canFly) { game.toast('Vaisseau non conforme', 'warn'); return; }
    game.launchFromHangar(list);
  });

  buildPalette();

  let active = false;
  function open() { active = true; controls.enabled = true; ui.classList.remove('hidden'); buildPalette(); refreshUI(); }
  function close() { active = false; controls.enabled = false; ui.classList.add('hidden'); ghostBox.visible = false; delBox.visible = false; if (ghost) ghost.visible = false; }
  let t = 0;
  function update(dt) {
    t += dt; controls.update();
    for (const p of parts.values()) {
      const m = p.mesh;
      if (m.userData.pop !== undefined && m.userData.pop < 1) { m.userData.pop = Math.min(1, m.userData.pop + dt * 5); const k = m.userData.pop; m.scale.setScalar(0.3 + 0.7 * (1 - Math.pow(1 - k, 3)) + Math.sin(k * Math.PI) * 0.12); }
      if (m.userData.spin) m.userData.spin.rotation.z += dt * 3;
      if (m.userData.leg) { m.userData.leg.hip.rotation.x = 0; }
    }
    comMarker.rotation.y += dt;
  }
  function resize(w, h) { camera.aspect = w / h; camera.updateProjectionMatrix(); }
  return { scene, camera, open, close, update, resize, getDesign, loadDesign, rebuildMaterials, refreshUI, get active() { return active; } };
}
