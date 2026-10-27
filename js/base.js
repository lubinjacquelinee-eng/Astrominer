// =========================================================
// BASE LUNAIRE : modules, énergie, production, entrepôt, fret, contrats
// =========================================================
import * as THREE from 'three';
import { MOON, PAD_DIR, ORES, ORE_KEYS, surfacePoint, localFrame, localDir } from './world.js';

export const GOODS = {
  terreau: { name: 'Terre fertile', buy: 6, color: 0x8a5a32, desc: 'Sol terrestre riche, indispensable aux serres.' },
  eau: { name: 'Eau potable', buy: 4, color: 0x4fb4ff, desc: 'Irrigation des serres, vie des colons.' },
  semences: { name: 'Semences', buy: 30, color: 0x9cff6a, desc: 'Graines sélectionnées pour la faible gravité.' },
  elec: { name: 'Composants électroniques', buy: 85, color: 0x5ee6ff, desc: 'Circuits pour les modules avancés.' },
  legumes: { name: 'Légumes lunaires', sell: 70, color: 0x7dff9a, desc: 'Produit de luxe très prisé sur Terre.' },
  alliage: { name: 'Alliage lunaire', sell: 260, color: 0xc8d3e0, desc: 'Métal forgé en basse gravité.' },
  cellule: { name: 'Cellules He-3', sell: 9500, color: 0xd59bff, desc: 'Énergie de fusion en barre.' },
  fuel: { name: 'Carburant lunaire', local: true, color: 0xffb000, desc: 'Produit par la raffinerie. Plein gratuit à la colonie.' },
};
export const IMPORTS = ['terreau', 'eau', 'semences', 'elec'];
export const EXPORTS = ['legumes', 'alliage', 'cellule'];
const NAME = k => (ORES[k] ? ORES[k].name : GOODS[k] ? GOODS[k].name : k);
const MAXLV = 5;

// x/z = position locale autour du pad (m)
export const MODS = [
  { id: 'solar', name: 'Champ solaire', slot: [150, 30], energy: 14, desc: 'Produit l’énergie de toute la base.',
    cost: l => ({ cr: 900 * Math.pow(2, l), res: { iron: 12 * (l + 1) } }), fx: l => `+${14 * l} énergie` },
  { id: 'hab', name: 'Habitat pressurisé', slot: [95, 120], energy: -3, desc: 'Loge des colons qui versent des dividendes. Ils mangent des légumes lunaires.',
    cost: l => ({ cr: 1800 * Math.pow(2.1, l), res: { regolith: 40 * (l + 1), elec: 4 * (l + 1) } }), fx: l => `${4 * l} colons` },
  { id: 'serre', name: 'Serre hydroponique', slot: [-30, 150], energy: -4, io: { in: { eau: 0.1, terreau: 0.04 }, out: { legumes: 0.16 } }, desc: 'Fait pousser des légumes avec la terre et l’eau apportées de la Terre.',
    cost: l => ({ cr: 2400 * Math.pow(2.1, l), res: { terreau: 30 * (l + 1), semences: 10 * (l + 1), eau: 20 * (l + 1) } }), fx: l => `${(0.16 * l * 60).toFixed(0)} légumes/min` },
  { id: 'raffinerie', name: 'Raffinerie de régolithe', slot: [-130, 85], energy: -6, io: { in: { regolith: 0.4 }, out: { eau: 0.12, fuel: 0.3 } }, desc: 'Extrait l’eau et le carburant du régolithe. Plein gratuit à la colonie.',
    cost: l => ({ cr: 3500 * Math.pow(2.2, l), res: { iron: 40 * (l + 1), elec: 6 * (l + 1) } }), fx: l => `${(0.3 * l * 60).toFixed(0)} carburant/min` },
  { id: 'infirmerie', name: 'Infirmerie & dortoir', slot: [-155, -20], energy: -2, desc: 'Les mineurs récupèrent bien plus vite de la Cravache.',
    cost: l => ({ cr: 2200 * Math.pow(2.1, l), res: { regolith: 30 * (l + 1), eau: 15 * (l + 1) } }), fx: l => `récupération +${50 * l} %` },
  { id: 'drones', name: 'Station de drones', slot: [-110, -115], energy: -5, desc: 'Des drones minent en continu autour de la base, même en ton absence.',
    cost: l => ({ cr: 7000 * Math.pow(2.3, l), res: { iron: 50 * (l + 1), elec: 12 * (l + 1) } }), fx: l => `${l} drone(s) automatique(s)` },
  { id: 'fonderie', name: 'Fonderie basse gravité', slot: [-10, -155], energy: -8, tier: 2, io: { in: { iron: 0.25, titanium: 0.06 }, out: { alliage: 0.1 } }, desc: 'Fond fer et titane en alliage lunaire exportable.',
    cost: l => ({ cr: 12000 * Math.pow(2.3, l), res: { titanium: 30 * (l + 1), elec: 15 * (l + 1) } }), fx: l => `${(0.1 * l * 60).toFixed(0)} alliage/min` },
  { id: 'labo', name: 'Laboratoire de recherche', slot: [100, -115], energy: -6, tier: 2, desc: 'Optimise tout : extraction des mineurs et prix des exports.',
    cost: l => ({ cr: 25000 * Math.pow(2.4, l), res: { cuprum: 30 * (l + 1), elec: 25 * (l + 1) } }), fx: l => `extraction +${8 * l} % · exports +${6 * l} %` },
  { id: 'reacteur', name: 'Réacteur à fusion He-3', slot: [160, -50], energy: 60, tier: 3, io: { in: { helium3: 0.02 }, out: { cellule: 0.01 } }, desc: 'Énergie massive et cellules He-3 à très haute valeur.',
    cost: l => ({ cr: 300000 * Math.pow(2.6, l), res: { quantium: 15 * (l + 1), elec: 60 * (l + 1) } }), fx: l => `+${60 * l} énergie · ${(0.01 * l * 60).toFixed(1)} cellules/min` },
];
const MOD = Object.fromEntries(MODS.map(m => [m.id, m]));

export function createBase(api) {
  const { scene, state, toast, sfx, fmt, fmtBig, refreshTop } = api;
  const frame = localFrame(PAD_DIR);
  const root = new THREE.Group(); scene.add(root);
  const meshes = {};
  let runInfo = { eff: 1, prod: 0, cons: 0, run: {}, fed: 1, colons: 0, div: 0 };

  function ensureState() {
    state.base = state.base || {};
    const B = state.base;
    B.stock = B.stock || {}; B.mods = B.mods || {}; B.build = B.build || {}; B.pm = B.pm || {};
    for (const k of ORE_KEYS.concat(Object.keys(GOODS))) if (typeof B.stock[k] !== 'number') B.stock[k] = 0;
    for (const k of EXPORTS) if (!B.pm[k]) B.pm[k] = 1;
    state.freight = state.freight || {};
    for (const k of IMPORTS.concat(EXPORTS)) if (typeof state.freight[k] !== 'number') state.freight[k] = 0;
    if (!Array.isArray(state.contracts)) state.contracts = [];
    while (state.contracts.length < 3) state.contracts.push(newContract());
  }
  const lv = id => state.base.mods[id] || 0;
  const bonus = () => ({
    recov: 1 + 0.5 * lv('infirmerie'), stun: 1 - 0.12 * lv('infirmerie'),
    extract: 1 + 0.08 * lv('labo'), sale: 1 + 0.06 * lv('labo'),
  });
  const exportPrice = k => GOODS[k].sell * state.base.pm[k] * bonus().sale;

  // ---------- matériaux & maillages ----------
  const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.6, metalness: 0.2, ...o });
  const mat = {
    hull: M(0xdfe5ec, { metalness: 0.35, roughness: 0.45 }), dark: M(0x2b3038), orange: M(0xff8a1f),
    solar: M(0x1b2f6b, { metalness: 0.85, roughness: 0.2, emissive: 0x060c26 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x9fe8ff, emissive: 0x1a5a7a, emissiveIntensity: 0.5, transparent: true, opacity: 0.45, roughness: 0.05, metalness: 0.4 }),
    plant: new THREE.MeshStandardMaterial({ color: 0x5dff7e, emissive: 0x1f9a3a, emissiveIntensity: 0.9, flatShading: true }),
    soil: M(0x5a3a20), fire: new THREE.MeshBasicMaterial({ color: 0xff7a1a }), red: new THREE.MeshBasicMaterial({ color: 0xff3030 }),
    cyan: new THREE.MeshBasicMaterial({ color: 0x5ee6ff }), violet: new THREE.MeshStandardMaterial({ color: 0xc48bff, emissive: 0x8a3dff, emissiveIntensity: 1.4, flatShading: true }),
    scaf: new THREE.LineBasicMaterial({ color: 0xffb000 }), win: new THREE.MeshBasicMaterial({ color: 0xffd27a }),
  };
  const box = (w, h, d, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; return o; };
  const cyl = (rt, rb, h, m, x = 0, y = 0, z = 0, seg = 10) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m); o.position.set(x, y, z); o.castShadow = true; return o; };

  function buildMesh(id, L) {
    const g = new THREE.Group(); g.userData.anim = [];
    const n = Math.max(1, L);
    if (id === 'solar') {
      const cnt = 2 + 2 * n;
      for (let i = 0; i < cnt; i++) {
        const x = (i % 4 - 1.5) * 12, z = Math.floor(i / 4) * 10 - 5;
        g.add(cyl(0.4, 0.4, 3, mat.hull, x, 1.5, z, 6));
        const p = box(10, 0.3, 6, mat.solar, x, 3.3, z); p.rotation.x = -0.45; g.add(p);
      }
    } else if (id === 'hab') {
      g.add(cyl(6, 6, 7, mat.hull, 0, 3.5, 0, 12)); g.add(box(3, 0.6, 3, mat.orange, 0, 7.3, 0));
      for (let i = 0; i < n; i++) {
        const a = i / Math.max(1, n) * Math.PI * 2 + 0.4;
        const x = Math.cos(a) * 15, z = Math.sin(a) * 15;
        const h = cyl(4.5, 4.5, 11, mat.hull, x, 4.5, z, 10); h.rotation.z = Math.PI / 2; h.rotation.y = -a; g.add(h);
        const t = box(9, 2.2, 2.2, mat.dark, Math.cos(a) * 8, 2, Math.sin(a) * 8); t.rotation.y = -a; g.add(t);
        for (let k = -1; k <= 1; k++) { const w = box(1.2, 0.7, 0.3, mat.win, x + Math.cos(a + Math.PI / 2) * 4.6, 4.8, z + Math.sin(a + Math.PI / 2) * 4.6); w.position.x += Math.cos(a) * k * 3; w.position.z += Math.sin(a) * k * 3; w.rotation.y = -a; g.add(w); }
      }
    } else if (id === 'serre') {
      for (let i = 0; i < n; i++) {
        const x = (i - (n - 1) / 2) * 17;
        const ring = cyl(7.6, 7.6, 1, mat.hull, x, 0.5, 0, 14); g.add(ring);
        const soil = cyl(7, 7, 0.4, mat.soil, x, 1.1, 0, 14); g.add(soil);
        const plants = new THREE.Group(); plants.position.set(x, 1.2, 0);
        for (let k = 0; k < 14; k++) { const a = k * 2.4, r = 1.5 + (k % 5) * 1.1; const c = new THREE.Mesh(new THREE.ConeGeometry(0.7, 2.4, 5), mat.plant); c.position.set(Math.cos(a) * r, 1.2, Math.sin(a) * r); plants.add(c); }
        g.add(plants); g.userData.plants = (g.userData.plants || []).concat(plants);
        const dome = new THREE.Mesh(new THREE.SphereGeometry(7.4, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2), mat.glass); dome.position.set(x, 1, 0); g.add(dome);
      }
    } else if (id === 'raffinerie') {
      g.add(box(16, 8, 10, mat.hull, 0, 4, 0)); g.add(box(16.4, 1, 10.4, mat.orange, 0, 8.4, 0));
      const ch = cyl(1.4, 1.8, 16, mat.dark, 5, 12, 2, 8); g.add(ch);
      const fl = new THREE.Mesh(new THREE.ConeGeometry(1.2, 3.5, 6), mat.fire); fl.position.set(5, 21.5, 2); g.add(fl); g.userData.flame = fl;
      for (let i = 0; i < n; i++) { const t = cyl(3, 3, 9, mat.hull, -12 - (i % 3) * 7, 4.5, (Math.floor(i / 3) - 0.5) * 8, 10); g.add(t); g.add(cyl(3.1, 3.1, 1, mat.orange, t.position.x, 7.5, t.position.z, 10)); }
    } else if (id === 'infirmerie') {
      g.add(box(18, 6, 12, mat.hull, 0, 3, 0));
      g.add(box(6, 1.6, 0.3, mat.red, 0, 4, 6.1)); g.add(box(1.6, 5, 0.3, mat.red, 0, 4, 6.15));
      for (let i = 0; i < n; i++) { const d = new THREE.Mesh(new THREE.SphereGeometry(3.6, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), mat.hull); d.position.set(-14 - i * 7.5, 0, 0); d.castShadow = true; g.add(d); g.add(box(1, 0.6, 0.3, mat.win, d.position.x, 2.2, 3.4)); }
    } else if (id === 'drones') {
      g.add(cyl(11, 12, 1.2, mat.dark, 0, 0.6, 0, 16)); g.add(new THREE.Mesh(new THREE.TorusGeometry(9, 0.35, 4, 24), mat.cyan)); g.children[1].rotation.x = Math.PI / 2; g.children[1].position.y = 1.3;
      g.add(box(4, 9, 4, mat.hull, 0, 4.5, 0)); g.add(box(4.2, 1, 4.2, mat.orange, 0, 9.4, 0));
      g.userData.drones = [];
      for (let i = 0; i < n; i++) {
        const d = new THREE.Group(); d.add(box(2.2, 0.7, 2.2, mat.orange)); for (const [x, z] of [[1.6, 1.6], [-1.6, 1.6], [1.6, -1.6], [-1.6, -1.6]]) d.add(box(1.4, 0.15, 0.3, mat.dark, x, 0.5, z));
        d.add(box(0.5, 0.5, 0.5, mat.cyan, 0, -0.5, 0)); d.userData.ph = i * 1.7; g.add(d); g.userData.drones.push(d);
      }
    } else if (id === 'fonderie') {
      g.add(box(20, 11, 14, mat.dark, 0, 5.5, 0)); g.add(box(20.4, 1.2, 14.4, mat.orange, 0, 11.4, 0));
      const mouth = box(6, 4, 0.4, mat.fire, 0, 3, 7.1); g.add(mouth); g.userData.mouth = mouth;
      for (let i = 0; i < Math.min(4, n + 1); i++) g.add(cyl(1.3, 1.6, 10, mat.hull, -7 + i * 4.5, 16, -3, 8));
    } else if (id === 'labo') {
      for (let i = 0; i < n; i++) g.add(cyl(6 - i * 0.6, 6.4 - i * 0.6, 4.6, i % 2 ? mat.hull : mat.dark, 0, 2.3 + i * 4.6, 0, 8));
      const top = n * 4.6;
      const mast = cyl(0.5, 0.5, 6, mat.hull, 0, top + 3, 0, 6); g.add(mast);
      const dish = new THREE.Mesh(new THREE.SphereGeometry(5, 12, 4, 0, Math.PI * 2, 0, 1.0), mat.hull); dish.position.y = top + 6; dish.rotation.x = 2.2; const piv = new THREE.Group(); piv.add(dish); g.add(piv); g.userData.dish = piv;
      g.add(box(0.6, 0.6, 0.6, mat.red, 0, top + 6.5, 0));
    } else if (id === 'reacteur') {
      g.add(cyl(12, 13, 3, mat.dark, 0, 1.5, 0, 16));
      const tor = new THREE.Mesh(new THREE.TorusGeometry(8, 2.4, 8, 20), mat.violet); tor.rotation.x = Math.PI / 2; tor.position.y = 7; g.add(tor); g.userData.torus = tor;
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; g.add(box(1.4, 9, 1.4, mat.hull, Math.cos(a) * 11, 6, Math.sin(a) * 11)); }
      for (let i = 0; i < n; i++) g.add(cyl(2.6, 2.6, 8, mat.hull, -18 - i * 6, 4, 8, 10));
    }
    return g;
  }
  function scaffold(id) {
    const g = new THREE.Group();
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(22, 12, 16, 2, 2, 2)), mat.scaf); e.position.y = 6; g.add(e);
    const crane = new THREE.Group(); crane.add(box(1, 20, 1, mat.orange, 0, 10, 0)); crane.add(box(16, 1, 1, mat.orange, 6, 20, 0)); crane.add(box(0.2, 8, 0.2, mat.dark, 13, 16, 0)); crane.position.set(-13, 0, -9); g.add(crane);
    g.userData.crane = crane;
    const lamp = box(1, 1, 1, new THREE.MeshBasicMaterial({ color: 0xffb000 }), -13, 21, -9); g.add(lamp); g.userData.lamp = lamp;
    return g;
  }
  function place(obj, id) {
    const [x, z] = MOD[id].slot;
    const dir = localDir(frame, MOON.R, x, z);
    surfacePoint(MOON, dir, obj.position, -0.4);
    obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    obj.rotateY(Math.atan2(x, z) + Math.PI);
  }
  function rebuild(id) {
    if (meshes[id]) { root.remove(meshes[id]); meshes[id] = null; }
    const L = lv(id), building = !!state.base.build[id];
    if (!L && !building) return;
    const g = new THREE.Group();
    if (L) { const m = buildMesh(id, L); g.add(m); g.userData.main = m; }
    if (building) { const s = scaffold(id); g.add(s); g.userData.scaf = s; }
    place(g, id); root.add(g); meshes[id] = g;
  }
  function rebuildAll() { ensureState(); for (const m of MODS) rebuild(m.id); }

  // ---------- coûts ----------
  function costOf(id) { return MOD[id].cost(lv(id)); }
  function canAfford(c) {
    if (state.credits < c.cr) return false;
    for (const k in c.res) if ((state.base.stock[k] || 0) < c.res[k]) return false;
    return true;
  }
  function startBuild(id) {
    const m = MOD[id]; if (lv(id) >= MAXLV || state.base.build[id]) return;
    if (m.tier && state.upg.tier < m.tier) return;
    const c = costOf(id); if (!canAfford(c)) { toast('Ressources insuffisantes dans l’entrepôt lunaire', 'warn'); return; }
    state.credits -= c.cr; for (const k in c.res) state.base.stock[k] -= c.res[k];
    const T = 18 + lv(id) * 14;
    state.base.build[id] = { t: T, T };
    sfx('coin'); toast(`Chantier lancé : ${m.name} niv. ${lv(id) + 1}`, 'ok');
    refreshTop(); rebuild(id);
  }

  // ---------- simulation (tourne en permanence) ----------
  let pmT = 0, uiT = 0;
  function tick(dt) {
    const B = state.base;
    for (const id in B.build) {
      B.build[id].t -= dt;
      if (B.build[id].t <= 0) { delete B.build[id]; B.mods[id] = (B.mods[id] || 0) + 1; rebuild(id); toast(`Base lunaire : ${MOD[id].name} niveau ${B.mods[id]} opérationnel`, 'ok'); sfx('neutral'); }
    }
    const S = B.stock;
    // réacteur : énergie conditionnée à l'hélium-3
    let reactRatio = 0; const rl = lv('reacteur');
    if (rl) { const need = MOD.reacteur.io.in.helium3 * rl * dt; reactRatio = need > 0 ? Math.min(1, S.helium3 / need) : 0; }
    let prod = 14 * lv('solar') + 60 * rl * reactRatio, cons = 0;
    for (const m of MODS) if (m.energy < 0 && lv(m.id)) cons += -m.energy * lv(m.id);
    const eff = cons > 0 ? Math.min(1, prod / cons) : 1;
    const run = {};
    for (const m of MODS) {
      const L = lv(m.id); if (!L) continue;
      let r = m.energy < 0 ? eff : (m.id === 'reacteur' ? reactRatio : 1);
      if (m.io) {
        for (const k in m.io.in) { const need = m.io.in[k] * L * dt; if (need > 0) r = Math.min(r, S[k] / need); }
        r = Math.max(0, r);
        for (const k in m.io.in) S[k] = Math.max(0, S[k] - m.io.in[k] * L * dt * r);
        for (const k in m.io.out) S[k] += m.io.out[k] * L * dt * r;
      }
      run[m.id] = r;
    }
    // drones automatiques
    const dl = lv('drones');
    if (dl) { const r = run.drones; S.regolith += 0.22 * dl * dt * r; S.iron += 0.1 * dl * dt * r; if (state.upg.tier >= 2) S.titanium += 0.04 * dl * dt * r; if (state.upg.tier >= 3) S.quantium += 0.004 * dl * dt * r; }
    // colons
    const colons = 4 * lv('hab');
    let fed = 1;
    if (colons) { const need = 0.006 * colons * dt; fed = need > 0 ? Math.min(1, S.legumes / need) : 1; S.legumes = Math.max(0, S.legumes - need * fed); }
    const div = colons * 1.4 * (0.3 + 0.7 * fed) * (run.hab ?? 1);
    state.credits += div * dt;
    runInfo = { eff, prod, cons, run, fed, colons, div };
    // cours des exports
    pmT -= dt; if (pmT <= 0) { pmT = 2; for (const k of EXPORTS) { B.pm[k] = Math.min(1.35, Math.max(0.7, B.pm[k] + (1 - B.pm[k]) * 0.05 + (Math.random() - 0.5) * 0.06)); } }
    uiT -= dt; if (uiT <= 0) { uiT = 1; if (api.modalOpen && api.modalOpen() && (tab === 'apercu' || (tab === 'modules' && Object.keys(B.build).length))) api.rerender(true); }
  }
  // ---------- animation ----------
  function animate(dt, t) {
    for (const id in meshes) {
      const g = meshes[id]; if (!g) continue;
      const m = g.userData.main, s = g.userData.scaf;
      const r = runInfo.run[id] ?? 0;
      if (s) { s.userData.crane.rotation.y = Math.sin(t * 0.6) * 0.8; s.userData.lamp.visible = Math.sin(t * 8) > 0; }
      if (!m) continue;
      if (m.userData.flame) { m.userData.flame.visible = r > 0.05; m.userData.flame.scale.setScalar(0.8 + Math.random() * 0.5); }
      if (m.userData.mouth) m.userData.mouth.material = r > 0.05 ? mat.fire : mat.dark;
      if (m.userData.dish) m.userData.dish.rotation.y += dt * 0.4 * (0.2 + r);
      if (m.userData.torus) { m.userData.torus.rotation.z += dt * 1.5 * r; mat.violet.emissiveIntensity = 0.3 + 1.4 * r * (0.85 + Math.sin(t * 6) * 0.15); }
      if (m.userData.plants) { const k = 0.35 + 0.65 * Math.min(1, (state.base.stock.legumes || 0) / 40 + r * 0.5); for (const p of m.userData.plants) p.scale.set(1, k + Math.sin(t * 1.3) * 0.03, 1); }
      if (m.userData.drones) m.userData.drones.forEach((d, i) => { const ph = t * 0.5 * (0.3 + r) + d.userData.ph; const rad = 16 + (i % 3) * 7; d.position.set(Math.cos(ph) * rad, 9 + Math.sin(ph * 2.1) * 2.5, Math.sin(ph) * rad); d.rotation.y = -ph; });
    }
  }

  // ---------- contrats ----------
  function newContract() {
    const tier = (state.upg && state.upg.tier) || 1;
    const r = Math.random();
    const B = state.base || { mods: {} };
    if (r < 0.45) {
      const pool = ORE_KEYS.filter(k => ORES[k].tier <= tier);
      const k = pool[Math.floor(Math.random() * pool.length)];
      const qty = Math.round((ORES[k].tier === 3 ? 6 + Math.random() * 14 : 20 + Math.random() * 60) / 5) * 5;
      return { kind: 'qg', k, qty, reward: Math.round(qty * ORES[k].base * (2 + Math.random())), title: `Commande industrielle` };
    }
    if (r < 0.8) {
      const k = IMPORTS[Math.floor(Math.random() * IMPORTS.length)];
      const qty = Math.round((k === 'elec' ? 6 + Math.random() * 14 : 20 + Math.random() * 50) / 2) * 2;
      return { kind: 'col', k, qty, reward: Math.round(qty * GOODS[k].buy * 3.5 + 350 * tier), title: `Ravitaillement de la colonie` };
    }
    const avail = EXPORTS.filter(k => (k === 'legumes' && B.mods.serre) || (k === 'alliage' && B.mods.fonderie) || (k === 'cellule' && B.mods.reacteur));
    if (!avail.length) return newContract.call(null);
    const k = avail[Math.floor(Math.random() * avail.length)];
    const qty = k === 'cellule' ? 2 + Math.floor(Math.random() * 4) : 8 + Math.floor(Math.random() * 25);
    return { kind: 'exp', k, qty, reward: Math.round(qty * GOODS[k].sell * 2.2), title: `Export de prestige` };
  }
  const held = k => (ORES[k] ? state.cargo[k] : state.freight[k]) || 0;
  function contractWhere(c) { return c.kind === 'col' ? 'colony' : 'qg'; }
  function deliver(i) {
    const c = state.contracts[i]; if (!c) return;
    if (held(c.k) < c.qty) return;
    if (ORES[c.k]) state.cargo[c.k] -= c.qty; else state.freight[c.k] -= c.qty;
    if (c.kind === 'col') state.base.stock[c.k] += c.qty; // la colonie garde la marchandise
    state.credits += c.reward; state.earned += c.reward;
    sfx('coin'); toast(`Contrat rempli : +${fmtBig(c.reward)} cr`, 'ok');
    state.contracts[i] = newContract(); refreshTop();
    if (api.onSale) api.onSale();
  }
  function contractsHTML(where) {
    return state.contracts.map((c, i) => {
      const w = contractWhere(c), here = where === w, have = held(c.k);
      const ok = here && have >= c.qty;
      const place = w === 'colony' ? 'à la colonie lunaire' : 'au QG Terre';
      return `<div class="row contract"><div><div class="t">${c.title}</div><div class="d">Livrer <b class="num">${c.qty}</b> ${NAME(c.k)} ${place} · en soute : <b class="num ${have >= c.qty ? 'okc' : ''}">${Math.floor(have)}</b></div></div><div class="v">+${fmtBig(c.reward)} cr</div><button class="btn" data-deliver="${i}" ${ok ? '' : 'disabled'}>${here ? 'Livrer' : 'À livrer ' + (w === 'colony' ? 'sur la Lune' : 'sur Terre')}</button></div>`;
    }).join('') + `<div class="row"><div><div class="t">Nouveaux contrats</div><div class="d">Remplace les trois offres actuelles.</div></div><div class="v">250 cr</div><button class="btn" id="reroll" ${state.credits < 250 ? 'disabled' : ''}>Renouveler</button></div>`;
  }
  function bindContracts(body) {
    body.querySelectorAll('[data-deliver]').forEach(b => b.onclick = () => { deliver(+b.dataset.deliver); api.rerender(); });
    const rr = body.querySelector('#reroll'); if (rr) rr.onclick = () => { if (state.credits < 250) return; state.credits -= 250; state.contracts = [newContract(), newContract(), newContract()]; sfx('click'); refreshTop(); api.rerender(); };
  }

  // ---------- UI : modal base ----------
  let tab = 'apercu';
  const resList = (res) => Object.entries(res).map(([k, q]) => { const have = state.base.stock[k] || 0; return `<span class="res ${have >= q ? 'ok' : 'no'}">${NAME(k)} <b class="num">${Math.floor(have)}/${Math.ceil(q)}</b></span>`; }).join('');
  function renderBase(body) {
    ensureState();
    const atCol = api.atColony();
    const tabs = [['apercu', 'Aperçu'], ['modules', 'Modules'], ['entrepot', 'Entrepôt'], ['contrats', 'Contrats']];
    let h = `<div class="tabs">${tabs.map(([id, n]) => `<button class="tab ${tab === id ? 'on' : ''}" data-tab="${id}">${n}</button>`).join('')}</div>`;
    if (!atCol) h += `<div class="news warn-n">Vue à distance · pose-toi sur le pad de la colonie pour décharger ou charger la soute</div>`;
    if (tab === 'apercu') {
      const R = runInfo; const pct = R.cons ? Math.min(100, R.prod / R.cons * 100) : 100;
      const built = MODS.filter(m => lv(m.id)).length;
      h += `<div class="save-summary"><div><span>Énergie</span><b class="num ${R.eff < 1 ? 'badc' : ''}">${fmt(R.prod)} / ${fmt(R.cons)}</b></div><div><span>Colons</span><b class="num">${R.colons}</b></div><div><span>Dividendes</span><b class="num">${fmt(R.div * 60)} cr/min</b></div><div><span>Modules</span><b class="num">${built} / ${MODS.length}</b></div></div>
      <div class="bar-row wide"><span class="lbl">Réseau</span><div class="bar ${R.eff < 1 ? 'heat' : 'hull'}"><i style="width:${pct}%"></i></div><b class="num">${Math.round(R.eff * 100)} %</b></div>
      ${R.colons && R.fed < 1 ? '<p class="note badc">Les colons ont faim : construis ou agrandis la serre (terre fertile + semences + eau). Dividendes réduits.</p>' : ''}
      ${R.eff < 1 ? '<p class="note badc">Déficit énergétique : agrandis le champ solaire. Tous les modules tournent au ralenti.</p>' : ''}
      <div class="section-t">Production en direct</div>`;
      const lines = MODS.filter(m => lv(m.id)).map(m => {
        const L = lv(m.id), r = R.run[m.id] ?? 0;
        let io = m.io ? Object.entries(m.io.out).map(([k, q]) => `+${(q * L * 60 * r).toFixed(1)} ${NAME(k)}/min`).join(' · ') : m.fx(L);
        if (m.id === 'drones') io = `${L} drone(s) · +${(0.22 * L * 60 * r).toFixed(0)} régolithe/min`;
        return `<div class="row"><div><div class="t">${m.name} <span class="tier t1">niv. ${L}</span></div><div class="d">${io}</div></div><div class="v ${r < 0.99 ? 'badc' : 'okc'}">${Math.round(r * 100)} %</div><span></span></div>`;
      }).join('');
      h += lines || '<p class="note">Aucun module pour l’instant. Ouvre l’onglet Modules : commence par un Champ solaire (fer) puis une Serre (terre fertile, semences et eau achetées au QG, onglet Fret).</p>';
      h += `<div class="section-t">Noyau colonial</div><div id="core-slot"></div>`;
    } else if (tab === 'modules') {
      h += MODS.map(m => {
        const L = lv(m.id), b = state.base.build[m.id], locked = m.tier && state.upg.tier < m.tier, maxed = L >= MAXLV;
        const c = costOf(m.id);
        let btn;
        if (b) btn = `<div class="buildbar"><i style="width:${(1 - b.t / b.T) * 100}%"></i><span class="num">${Math.ceil(b.t)} s</span></div>`;
        else if (maxed) btn = `<button class="btn" disabled>MAX</button>`;
        else if (locked) btn = `<button class="btn" disabled>Laser T${m.tier} requis</button>`;
        else btn = `<button class="btn" data-build="${m.id}" ${canAfford(c) ? '' : 'disabled'}>${L ? 'Améliorer' : 'Construire'}</button>`;
        const en = m.energy > 0 ? `<span class="res ok">+${m.energy} énergie/niv.</span>` : `<span class="res">${m.energy} énergie/niv.</span>`;
        return `<div class="row mod"><div><div class="t">${m.name} <span class="tier t${m.tier || 1}">niv. ${L}/${MAXLV}</span></div><div class="d">${m.desc}</div>
          ${maxed ? '' : `<div class="d">Niveau ${L + 1} : ${m.fx(L + 1)}</div><div class="reslist"><span class="res ${state.credits >= c.cr ? 'ok' : 'no'}">Crédits <b class="num">${fmtBig(c.cr)}</b></span>${resList(c.res)}${en}</div>`}</div>
          <div class="v"></div>${btn}</div>`;
      }).join('');
      h += '<p class="note">Les ressources de construction sont prises dans l’entrepôt lunaire : décharge ton minerai et ton fret à la colonie. Les chantiers continuent même quand tu repars.</p>';
    } else if (tab === 'entrepot') {
      const S = state.base.stock; const space = api.cargoSpace();
      h += `<div class="sum"><span>Place libre en soute</span><b class="num">${Math.floor(space)} u</b></div>`;
      h += atCol ? `<button class="btn-primary" id="unload-all">Tout décharger dans l’entrepôt</button>` : '';
      h += '<div class="section-t">Minerais</div>';
      for (const k of ORE_KEYS) h += stockRow(k, S[k], state.cargo[k], atCol, false);
      h += '<div class="section-t">Fret terrestre</div>';
      for (const k of IMPORTS) h += stockRow(k, S[k], state.freight[k], atCol, false);
      h += '<div class="section-t">Produits lunaires (exportables)</div>';
      for (const k of EXPORTS) h += stockRow(k, S[k], state.freight[k], atCol, true);
      h += `<div class="section-t">Carburant lunaire</div><div class="row"><div><div class="t">${GOODS.fuel.name}</div><div class="d">${GOODS.fuel.desc}</div></div><div class="v">${Math.floor(S.fuel)} u</div><button class="btn" id="free-fuel" ${atCol && S.fuel >= 1 && api.fuelNeed() > 0 ? '' : 'disabled'}>Faire le plein</button></div>`;
    } else {
      h += contractsHTML(atCol ? 'colony' : null);
    }
    body.innerHTML = h;
    body.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; sfx('click'); api.rerender(); });
    body.querySelectorAll('[data-build]').forEach(b => b.onclick = () => { startBuild(b.dataset.build); api.rerender(); });
    body.querySelectorAll('[data-unload]').forEach(b => b.onclick = () => { unload(b.dataset.unload); api.rerender(); });
    body.querySelectorAll('[data-load]').forEach(b => b.onclick = () => { loadExport(b.dataset.load); api.rerender(); });
    const ua = body.querySelector('#unload-all'); if (ua) ua.onclick = () => { let n = 0; for (const k of ORE_KEYS.concat(IMPORTS)) n += unload(k, true); if (n) { sfx('coin'); toast(`${fmt(n)} u déchargées dans l’entrepôt`, 'ok'); } api.rerender(); };
    const ff = body.querySelector('#free-fuel'); if (ff) ff.onclick = () => { const q = Math.min(api.fuelNeed(), state.base.stock.fuel); state.base.stock.fuel -= q; api.addFuel(q); sfx('neutral'); toast(`Plein lunaire gratuit : +${fmt(q)} u`, 'ok'); api.rerender(); };
    if (tab === 'contrats') bindContracts(body);
    const core = body.querySelector('#core-slot'); if (core && api.renderCore) api.renderCore(core);
  }
  function stockRow(k, inStock, inCargo, atCol, exp) {
    const c = Math.floor(inCargo || 0);
    const btn = exp ? `<button class="btn" data-load="${k}" ${atCol && inStock >= 1 && api.cargoSpace() >= 1 ? '' : 'disabled'}>Charger</button>`
      : `<button class="btn" data-unload="${k}" ${atCol && c > 0 ? '' : 'disabled'}>Décharger</button>`;
    return `<div class="row"><div><div class="t">${NAME(k)}</div><div class="d">Entrepôt <b class="num">${fmt(Math.floor(inStock))}</b> · soute <b class="num">${c}</b>${exp ? ` · cours QG ${fmt(exportPrice(k))} cr/u` : ''}</div></div><div class="v"></div>${btn}</div>`;
  }
  function unload(k, silent) {
    const src = ORES[k] ? state.cargo : state.freight; const q = Math.floor(src[k] || 0); if (q <= 0) return 0;
    src[k] -= q; if (src[k] < 1) src[k] = 0; state.base.stock[k] += q;
    if (!silent) { sfx('coin'); toast(`${q} ${NAME(k)} → entrepôt`, 'ok'); }
    return q;
  }
  function loadExport(k) {
    const q = Math.floor(Math.min(state.base.stock[k], api.cargoSpace())); if (q <= 0) return;
    state.base.stock[k] -= q; state.freight[k] += q; sfx('click'); toast(`${q} ${NAME(k)} chargés en soute`, 'ok');
  }

  // ---------- UI : fret au QG ----------
  function renderFret(body) {
    ensureState();
    const space = api.cargoSpace();
    let h = `<div class="sum"><span>Place libre en soute</span><b class="num">${Math.floor(space)} u</b></div><div class="section-t">Acheter du fret pour la Lune</div>`;
    for (const k of IMPORTS) {
      const g = GOODS[k];
      h += `<div class="row"><div><div class="t">${g.name}</div><div class="d">${g.desc} · en soute <b class="num">${Math.floor(state.freight[k])}</b></div></div><div class="v">${fmt(g.buy)} cr/u</div><div class="qty">
        <button class="btn" data-buy="${k}" data-q="10" ${space >= 1 && state.credits >= g.buy ? '' : 'disabled'}>+10</button><button class="btn" data-buy="${k}" data-q="50" ${space >= 1 && state.credits >= g.buy ? '' : 'disabled'}>+50</button><button class="btn" data-buy="${k}" data-q="max" ${space >= 1 && state.credits >= g.buy ? '' : 'disabled'}>Max</button></div></div>`;
    }
    h += '<div class="section-t">Vendre les produits lunaires</div>';
    let any = false;
    for (const k of EXPORTS) {
      const q = Math.floor(state.freight[k]); const p = exportPrice(k);
      if (q > 0) any = true;
      h += `<div class="row"><div><div class="t">${GOODS[k].name}</div><div class="d">${GOODS[k].desc} · en soute <b class="num">${q}</b></div></div><div class="v">${fmt(p)} cr/u</div><button class="btn" data-sellx="${k}" ${q > 0 ? '' : 'disabled'}>Vendre</button></div>`;
    }
    if (!any) h += '<p class="note">Produis des légumes (serre), de l’alliage (fonderie) ou des cellules He-3 (réacteur) sur la Lune, charge-les depuis l’entrepôt et rapporte-les ici.</p>';
    h += '<div class="section-t">Contrats</div>' + contractsHTML('qg');
    body.innerHTML = h;
    body.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => {
      const k = b.dataset.buy, g = GOODS[k];
      let q = b.dataset.q === 'max' ? Infinity : +b.dataset.q;
      q = Math.floor(Math.min(q, api.cargoSpace(), state.credits / g.buy)); if (q <= 0) { toast('Pas assez de place ou de crédits', 'warn'); return; }
      state.freight[k] += q; state.credits -= q * g.buy; sfx('coin'); refreshTop(); api.rerender();
    });
    body.querySelectorAll('[data-sellx]').forEach(b => b.onclick = () => {
      const k = b.dataset.sellx, q = Math.floor(state.freight[k]); if (q <= 0) return;
      const tot = q * exportPrice(k); state.freight[k] -= q; state.credits += tot; state.earned += tot; state.base.pm[k] *= 0.93;
      sfx('coin'); toast(`Vente ${GOODS[k].name} : +${fmtBig(tot)} cr`, 'ok'); refreshTop(); if (api.onSale) api.onSale(); api.rerender();
    });
    bindContracts(body);
  }

  ensureState();
  return { ensureState, rebuildAll, tick, animate, bonus, renderBase, renderFret, freightTotal: () => IMPORTS.concat(EXPORTS).reduce((s, k) => s + (state.freight[k] || 0), 0), freightMass: () => 0, info: () => runInfo };
}
