// ============================================================
//  PIÈCES DE VAISSEAU : définitions, maillages low-poly, stats
// ============================================================
import * as THREE from 'three';

export const CELL = 1;          // taille d'une case de la grille du hangar
export const SHIP_SCALE = 2.4;  // échelle du vaisseau dans le monde

export const PARTS = {
  core:        { name: 'Châssis central', cat: 'Structure', cost: 0, mass: 1.2, desc: 'Noyau structurel fixe. Tout se clipse autour.', fixed: true },
  chassis:     { name: 'Châssis', cat: 'Structure', cost: 40, mass: 0.7, desc: 'Poutre de liaison légère.' },
  cockpit:     { name: 'Cockpit', cat: 'Structure', cost: 150, mass: 1.0, desc: 'Poste de pilotage. Obligatoire.', cockpit: true },
  wing:        { name: 'Aile aérodynamique', cat: 'Structure', cost: 70, mass: 0.45, desc: 'Accroche les virages (moins de dérive) et portance en atmosphère.', grip: 0.55, agility: 0.06, lift: 1 },
  tank:        { name: 'Réservoir', cat: 'Énergie', cost: 80, mass: 0.9, fuel: 120, desc: '+120 unités de carburant.' },
  tank_xl:     { name: 'Réservoir lourd', cat: 'Énergie', cost: 9000, mass: 2.2, fuel: 520, desc: '+520 unités de carburant.' },
  radiator:    { name: 'Radiateur thermique', cat: 'Énergie', cost: 60, mass: 0.3, cool: 9, desc: 'Évacue la chaleur moteur. Rougit en surchauffe.' },
  crew:        { name: "Quartiers d'équipage", cat: 'Équipage', cost: 120, mass: 1.2, crew: 2, desc: 'Héberge 2 mineurs en scaphandre.' },
  airlock:     { name: 'Sas', cat: 'Équipage', cost: 100, mass: 0.6, airlock: true, desc: 'Sortie des mineurs sur le sol lunaire.' },
  gear:        { name: "Train d'atterrissage", cat: 'Équipage', cost: 60, mass: 0.35, gear: true, desc: 'Pattes articulées : repli en vol, déploiement auto près du sol.' },
  cargo:       { name: 'Soute à minerais', cat: 'Industrie', cost: 90, mass: 0.8, cargo: 40, desc: '+40 unités de minerai.' },
  cargo_xl:    { name: 'Méga-soute', cat: 'Industrie', cost: 18000, mass: 2.0, cargo: 300, desc: '+300 unités de minerai.' },
  eng_plasma:  { name: 'Moteur Plasma', cat: 'Propulsion', cost: 200, mass: 1.3, thrust: 680, vmax: 540, heat: 7, fuelUse: 1.3, color: 0x5ab8ff, desc: 'Moteur de base. Transit ~20 s.' },
  eng_ion:     { name: 'Moteur Ionique', cat: 'Propulsion', cost: 4200, mass: 1.6, thrust: 1500, vmax: 800, heat: 8, fuelUse: 1.9, color: 0x6fffe0, desc: 'Plus nerveux. Transit ~14 s.' },
  eng_fusion:  { name: 'Réacteur à Fusion', cat: 'Propulsion', cost: 75000, mass: 2.4, thrust: 3900, vmax: 1200, heat: 11, fuelUse: 2.8, color: 0xffa040, desc: 'Puissance brute. Transit ~9 s.' },
  eng_quantum: { name: 'Distorsion Quantique', cat: 'Propulsion', cost: 1800000, mass: 3.0, thrust: 9500, vmax: 2400, heat: 15, fuelUse: 4, color: 0xc77dff, desc: 'Plie l’espace : transit ~5 s.' },
  spa:         { name: 'Spa orbital de luxe', cat: 'Luxe', cost: 2500000, mass: 1.5, crew: 2, spa: true, desc: '+2 mineurs, récupération de fatigue x3.' },
  cockpit_gold:{ name: 'Cockpit plaqué or', cat: 'Luxe', cost: 900000, mass: 1.0, cockpit: true, agilityBonus: 0.25, desc: 'Or 24 carats. +25 % d’agilité. Prestige.' },
};

export const PART_ORDER = ['core','chassis','cockpit','wing','tank','tank_xl','radiator','crew','airlock','gear','cargo','cargo_xl','eng_plasma','eng_ion','eng_fusion','eng_quantum','spa','cockpit_gold'];

// ---------- Matériaux partagés ----------
export function makeMaterials(chrome = false) {
  const hullColor = chrome ? 0xdfe6ee : 0xc9cdd3;
  const M = {
    hull: new THREE.MeshStandardMaterial({ color: hullColor, metalness: chrome ? 0.95 : 0.35, roughness: chrome ? 0.12 : 0.55, flatShading: true }),
    hullDS: null,
    dark: new THREE.MeshStandardMaterial({ color: 0x2a2f38, metalness: 0.5, roughness: 0.6, flatShading: true }),
    accent: new THREE.MeshStandardMaterial({ color: 0xff8a1f, metalness: 0.2, roughness: 0.5, flatShading: true }),
    yellow: new THREE.MeshStandardMaterial({ color: 0xf2c230, roughness: 0.6, flatShading: true }),
    glass: new THREE.MeshStandardMaterial({ color: 0x3fd2ff, emissive: 0x0f5d80, emissiveIntensity: 0.8, metalness: 0.9, roughness: 0.08, flatShading: true }),
    window: new THREE.MeshStandardMaterial({ color: 0xffe0a0, emissive: 0xffc060, emissiveIntensity: 1.2 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xffc94a, metalness: 1, roughness: 0.18, flatShading: true }),
    radiator: new THREE.MeshStandardMaterial({ color: 0x8a9099, emissive: 0xff2000, emissiveIntensity: 0, metalness: 0.6, roughness: 0.4, flatShading: true }),
    pink: new THREE.MeshStandardMaterial({ color: 0xff8fc8, emissive: 0x80305a, emissiveIntensity: 0.6, transparent: true, opacity: 0.75, roughness: 0.1 }),
  };
  M.hullDS = M.hull.clone(); M.hullDS.side = THREE.DoubleSide;
  return M;
}

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m;
}
function cyl(rt, rb, h, seg, mat) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.castShadow = true; return m;
}

// ---------- Construction du maillage d'une pièce ----------
// x : position de la case (pour savoir de quel côté orienter les ailes)
export function buildPartMesh(type, mats, x = 0) {
  const g = new THREE.Group();
  const def = PARTS[type];
  switch (type) {
    case 'core': {
      g.add(box(0.94, 0.94, 0.94, mats.hull));
      g.add(box(0.96, 0.18, 0.96, mats.accent, 0, 0.2, 0));
      g.add(box(0.6, 0.6, 0.98, mats.dark));
      break;
    }
    case 'chassis': {
      g.add(box(0.9, 0.5, 0.9, mats.hull));
      for (const sx of [-0.38, 0.38]) for (const sy of [-0.38, 0.38]) g.add(box(0.12, 0.12, 0.98, mats.dark, sx, sy, 0));
      break;
    }
    case 'cockpit':
    case 'cockpit_gold': {
      const gold = type === 'cockpit_gold';
      const body = box(0.9, 0.7, 0.9, gold ? mats.gold : mats.hull, 0, -0.05, 0.05);
      g.add(body);
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.8, 6), gold ? mats.gold : mats.hull);
      nose.rotation.x = -Math.PI / 2; nose.position.set(0, -0.08, -0.65); nose.castShadow = true; g.add(nose);
      const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), mats.glass);
      canopy.scale.set(0.9, 0.8, 1.4); canopy.position.set(0, 0.28, -0.12); g.add(canopy);
      g.add(box(0.95, 0.08, 0.6, mats.accent, 0, -0.38, 0.1));
      break;
    }
    case 'wing': {
      const s = x < 0 ? -1 : 1;
      const shape = new THREE.Shape();
      shape.moveTo(-0.5, 0.45); shape.lineTo(0.55, 0.15); shape.lineTo(0.6, -0.25); shape.lineTo(-0.5, -0.45);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.09, bevelEnabled: false });
      geo.rotateX(Math.PI / 2); geo.translate(0, 0.04, 0);
      const w = new THREE.Mesh(geo, mats.hullDS); w.castShadow = true; w.scale.x = s; g.add(w);
      g.add(box(0.12, 0.1, 0.5, mats.accent, s * 0.55, 0.02, 0.15));
      const tip = box(0.06, 0.3, 0.35, mats.dark, s * 0.6, 0.12, 0.2); g.add(tip);
      break;
    }
    case 'tank':
    case 'tank_xl': {
      const xl = type === 'tank_xl';
      const r = xl ? 0.47 : 0.38;
      const t = cyl(r, r, 0.8, 10, mats.hull); t.rotation.x = Math.PI / 2; g.add(t);
      for (const z of [-0.42, 0.42]) { const c = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 6), mats.hull); c.scale.z = 0.35; c.position.z = z; g.add(c); }
      for (const z of [-0.2, 0.2]) { const b = cyl(r + 0.03, r + 0.03, 0.08, 10, xl ? mats.yellow : mats.accent); b.rotation.x = Math.PI / 2; b.position.z = z; g.add(b); }
      break;
    }
    case 'radiator': {
      g.add(box(0.5, 0.3, 0.8, mats.dark));
      for (let i = -1; i <= 1; i++) g.add(box(0.06, 0.95, 0.9, mats.radiator, i * 0.18, 0.15, 0));
      break;
    }
    case 'crew': {
      g.add(box(0.92, 0.8, 0.92, mats.hull));
      for (const side of [-1, 1]) for (const z of [-0.25, 0.05, 0.35]) g.add(box(0.04, 0.16, 0.16, mats.window, side * 0.47, 0.1, z));
      g.add(box(0.94, 0.1, 0.94, mats.accent, 0, 0.35, 0));
      break;
    }
    case 'airlock': {
      const c = cyl(0.42, 0.42, 0.9, 8, mats.hull); g.add(c);
      const ring = cyl(0.46, 0.46, 0.12, 8, mats.accent); ring.position.y = -0.3; g.add(ring);
      g.add(box(0.36, 0.5, 0.06, mats.yellow, 0, -0.05, 0.43));
      g.add(box(0.3, 0.42, 0.07, mats.dark, 0, -0.05, 0.44));
      break;
    }
    case 'gear': {
      g.add(box(0.5, 0.25, 0.5, mats.dark, 0, 0.25, 0));
      // patte articulée : pivot haut -> cuisse -> genou -> tibia -> pied
      const hip = new THREE.Group(); hip.position.set(0, 0.15, 0); g.add(hip);
      const thigh = box(0.12, 0.7, 0.12, mats.hull, 0, -0.35, 0); hip.add(thigh);
      const knee = new THREE.Group(); knee.position.set(0, -0.7, 0); hip.add(knee);
      knee.add(new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 4), mats.accent));
      const shin = box(0.1, 0.75, 0.1, mats.dark, 0, -0.37, 0); knee.add(shin);
      const piston = box(0.05, 0.6, 0.05, mats.yellow, 0.09, -0.3, 0); knee.add(piston);
      const foot = new THREE.Group(); foot.position.set(0, -0.75, 0); knee.add(foot);
      const pad = cyl(0.22, 0.26, 0.07, 8, mats.dark); foot.add(pad);
      g.userData.leg = { hip, knee, foot };
      break;
    }
    case 'cargo':
    case 'cargo_xl': {
      const xl = type === 'cargo_xl';
      g.add(box(0.94, 0.86, 0.94, xl ? mats.dark : mats.hull));
      for (const z of [-0.3, 0, 0.3]) g.add(box(0.98, 0.9, 0.06, mats.dark, 0, 0, z));
      g.add(box(0.98, 0.12, 0.98, mats.yellow, 0, -0.38, 0));
      if (xl) g.add(box(0.98, 0.12, 0.98, mats.yellow, 0, 0.38, 0));
      break;
    }
    case 'eng_plasma':
    case 'eng_ion':
    case 'eng_fusion':
    case 'eng_quantum': {
      const col = def.color;
      const big = type === 'eng_fusion' || type === 'eng_quantum';
      const housing = cyl(0.36, 0.42, 0.55, 8, mats.dark); housing.rotation.x = Math.PI / 2; housing.position.z = -0.15; g.add(housing);
      const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.3, big ? 0.5 : 0.44, 0.45, 10, 1, true), mats.hull);
      nozzle.material = mats.hull; nozzle.rotation.x = Math.PI / 2; nozzle.position.z = 0.33; g.add(nozzle);
      const ringMat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.5 });
      const ring = cyl(0.31, 0.31, 0.05, 10, ringMat); ring.rotation.x = Math.PI / 2; ring.position.z = 0.15; g.add(ring);
      if (type === 'eng_quantum') { const tor = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 6, 16), ringMat); tor.position.z = -0.1; g.add(tor); g.userData.spin = tor; }
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.34, 12), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
      disc.position.z = 0.5; g.add(disc);
      const flameGeo = new THREE.ConeGeometry(0.3, 1, 10, 1, true); flameGeo.translate(0, 0.5, 0); flameGeo.rotateX(Math.PI / 2);
      const flame = new THREE.Mesh(flameGeo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
      flame.position.z = 0.5; flame.scale.set(1, 1, 0.01); g.add(flame);
      const core = new THREE.Mesh(flameGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
      core.position.z = 0.5; core.scale.set(0.45, 0.45, 0.01); g.add(core);
      g.userData.flame = flame; g.userData.flameCore = core; g.userData.disc = disc;
      break;
    }
    case 'spa': {
      g.add(box(0.94, 0.4, 0.94, mats.gold, 0, -0.25, 0));
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mats.pink);
      dome.position.y = -0.05; g.add(dome);
      break;
    }
  }
  return g;
}

// ---------- Calcul des statistiques physiques ----------
export function computeStats(parts) {
  const st = {
    mass: 0, com: new THREE.Vector3(), thrust: 0, vmax: 0, heatGen: 0, fuelUse: 0, fuelCap: 0, cargoCap: 0,
    crew: 0, airlock: false, airlocks: 0, gearCount: 0, wings: 0, cool: 3, cockpit: false, agility: 1, spa: false,
    inertia: 0, thrustCenter: new THREE.Vector3(), engines: 0, cost: 0, lift: 0, grip: 1.1,
    minY: 0, cockpitPos: new THREE.Vector3(0, 0, -1), airlockPos: new THREE.Vector3(),
  };
  let tw = 0;
  for (const p of parts) {
    const d = PARTS[p.type];
    st.mass += d.mass; st.cost += d.cost;
    st.com.x += p.x * d.mass; st.com.y += p.y * d.mass; st.com.z += p.z * d.mass;
    if (d.thrust) { st.thrust += d.thrust; st.vmax = Math.max(st.vmax, d.vmax); st.heatGen += d.heat; st.fuelUse += d.fuelUse; st.engines++; st.thrustCenter.x += p.x * d.thrust; st.thrustCenter.y += p.y * d.thrust; st.thrustCenter.z += p.z * d.thrust; tw += d.thrust; }
    if (d.fuel) st.fuelCap += d.fuel;
    if (d.cargo) st.cargoCap += d.cargo;
    if (d.crew) st.crew += d.crew;
    if (d.airlock) { st.airlock = true; st.airlockPos.set(p.x, p.y, p.z); st.airlocks++; }
    if (d.gear) st.gearCount++;
    if (d.grip) { st.wings++; st.grip += d.grip; st.lift += d.lift; }
    if (d.cool) st.cool += d.cool;
    if (d.cockpit) { st.cockpit = true; st.cockpitPos.set(p.x, p.y, p.z); if (d.agilityBonus) st.agility += d.agilityBonus; }
    if (d.spa) st.spa = true;
    st.minY = Math.min(st.minY, p.y - (d.gear ? 1.35 : 0.5));
  }
  st.fuelCap += 20;
  if (st.mass > 0) st.com.divideScalar(st.mass);
  if (tw > 0) st.thrustCenter.divideScalar(tw);
  for (const p of parts) {
    const d = PARTS[p.type];
    const dx = p.x - st.com.x, dy = p.y - st.com.y, dz = p.z - st.com.z;
    st.inertia += d.mass * (dx * dx + dy * dy + dz * dz + 0.15);
  }
  st.vmax += Math.max(0, st.engines - 1) * 25;
  // agilité : plus l'inertie est grande, plus la rotation est lente
  st.agility *= THREE.MathUtils.clamp(2.6 / Math.sqrt(st.inertia + 1), 0.35, 1.25) + st.wings * 0.05;
  st.accel = st.mass > 0 ? st.thrust / st.mass : 0;
  return st;
}

export function validate(st, parts) {
  const issues = [];
  if (!st.cockpit) issues.push({ ok: false, t: 'Un cockpit est requis' });
  else issues.push({ ok: true, t: 'Cockpit installé' });
  if (st.engines < 1) issues.push({ ok: false, t: 'Au moins un moteur requis' });
  else issues.push({ ok: true, t: `${st.engines} moteur(s)` });
  if (st.fuelCap <= 20) issues.push({ ok: false, t: 'Ajoute un réservoir' });
  else issues.push({ ok: true, t: `Carburant ${st.fuelCap} u` });
  const twr = st.accel / 10;
  if (st.engines && twr < 1.15) issues.push({ ok: false, t: `Poussée/poids trop faible (${twr.toFixed(2)})` });
  else if (st.engines) issues.push({ ok: true, t: `Poussée/poids ${twr.toFixed(2)}` });
  issues.push({ ok: st.gearCount >= 3, warn: true, t: st.gearCount >= 3 ? `${st.gearCount} trains d'atterrissage` : `Trains : ${st.gearCount}/3 conseillés (atterrissage rude)` });
  issues.push({ ok: st.crew > 0 && st.airlock, warn: true, t: st.crew > 0 && st.airlock ? `${st.crew} mineurs + sas` : 'Quartiers + sas pour miner' });
  issues.push({ ok: st.cargoCap > 0, warn: true, t: st.cargoCap > 0 ? `Soute ${st.cargoCap} u` : 'Aucune soute à minerai' });
  const canFly = issues.every(i => i.ok || i.warn);
  return { issues, canFly };
}
