// ============================================================
//  COMPTE PILOTE : sauvegarde en ligne via un petit service
//  (voir cloud/README.md) qui écrit les parties dans un dépôt GitHub.
//  Identifiant + code à 4 chiffres. Tant que l'API n'est pas configurée
//  (js/cloud-config.js), tout est désactivé et le jeu reste 100 % jouable.
// ============================================================
//  Toutes les requêtes capturent la « génération de session » (cloud.gen)
//  au départ : si l'identité change pendant un échange (déconnexion, autre
//  compte), la réponse est périmée et ne doit RIEN modifier — ni l'état
//  (conflit, hold, session), ni le propriétaire de la partie en cours.

const C = window.ASTRO_CLOUD || {};
const REPO = C.repo || '', BRANCH = C.branch || 'main';
const TOKEN = C.tk ? String(C.tk).split('').reverse().join('') : ''; // jeton écrit à l'envers (voir README)
const API = (REPO && TOKEN) ? 'github' : '';
const SESSION_KEY = 'am2-cloud-session';
export const cloud = {
  enabled: !!API,
  account: null,   // identifiant connecté
  busy: false,     // au moins une requête en cours
  syncing: false,  // un envoi cloud en cours
  conflict: false, // une version plus récente existe côté cloud
  hold: false,     // partie en cours ≠ compte connecté : attends le choix du joueur
  lastSync: null,  // timestamp (ms) de la dernière synchro cloud
  lastError: '',   // dernier message d'erreur réseau
  offset: 0,       // décalage horloge serveur (évite les faux conflits)
  gen: 0,          // génération de session : incrémentée à chaque changement d'identité
};

// suivi d'activité : compteurs (chaque requête ne termine que la sienne)
let busyN = 0, syncN = 0;
function trackStart(isPush) { busyN++; if (isPush) syncN++; cloud.busy = true; if (isPush) cloud.syncing = true; }
function trackEnd(isPush) {
  busyN = Math.max(0, busyN - 1); if (isPush) syncN = Math.max(0, syncN - 1);
  cloud.busy = busyN > 0; cloud.syncing = syncN > 0;
}

function restoreSession() {
  if (!cloud.enabled) return null;
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    return (s && typeof s.id === 'string' && typeof s.pin === 'string') ? s : null;
  } catch (e) { return null; }
}
function saveSession(id, pin) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify({ id, pin })); } catch (e) {}
}
function clearSession() { try { localStorage.removeItem(SESSION_KEY); } catch (e) {} }

// ---- accès direct à l'API GitHub (plus aucun serveur intermédiaire) ----
const GHB = 'https://api.github.com/repos/' + REPO + '/contents/';
const shas = {};
const enc = t => btoa(unescape(encodeURIComponent(t)));
const dec = t => decodeURIComponent(escape(atob(t.replace(/\s/g, ''))));
function herr(m, status) { const e = new Error(m); e.status = status; return e; }
async function sha256(t) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t));
  return [...new Uint8Array(d)].map(x => x.toString(16).padStart(2, '0')).join('');
}
function gh(path, init = {}) {
  const put = init.method === 'PUT';
  return fetch(GHB + path + (put ? '' : '?ref=' + encodeURIComponent(BRANCH) + '&t=' + Date.now()), {
    ...init, cache: 'no-store',
    headers: { Authorization: 'Bearer ' + TOKEN, Accept: 'application/vnd.github+json', ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
  });
}
async function ghRead(path) {
  const r = await gh(path);
  if (r.status === 404) { delete shas[path]; return null; }
  if (!r.ok) throw herr('GitHub inaccessible (' + r.status + ')', r.status);
  const j = await r.json(); shas[path] = j.sha;
  return JSON.parse(dec(j.content));
}
async function ghWrite(path, obj, msg, keepalive) {
  const body = { message: msg, content: enc(JSON.stringify(obj)), branch: BRANCH };
  if (shas[path]) body.sha = shas[path];
  const r = await gh(path, { method: 'PUT', body: JSON.stringify(body), keepalive: !!keepalive });
  if (r.status === 409 || r.status === 422) throw herr('conflit', 409);
  if (!r.ok) throw herr('écriture GitHub impossible (' + r.status + ')', r.status);
  const j = await r.json(); shas[path] = j.content.sha;
}
const earned = sv => Math.max(0, Math.floor((sv && sv.state && sv.state.earned) || 0));

// ---- classement : leaderboard.json { p: { id: { n, e, t } } } ----
const BOARD = 'leaderboard.json';
let boardT = 0, boardCache = null, boardCacheT = 0;
async function boardPush(id, name, total, force) {
  const now = Date.now();
  if (!force && now - boardT < 150000) return;
  boardT = now;
  for (let i = 0; i < 3; i++) {
    try {
      const b = (await ghRead(BOARD)) || { p: {} };
      if (b.p[id] && b.p[id].e >= total) return;
      b.p[id] = { n: name, e: total, t: now };
      b.p = Object.fromEntries(Object.entries(b.p).sort((x, y) => y[1].e - x[1].e).slice(0, 50));
      b.t = now;
      if (!b.p[id]) return;
      await ghWrite(BOARD, b, 'board ' + id);
      boardCache = b; boardCacheT = now; return;
    } catch (e) { if (e.status !== 409) return; }
  }
}
export async function cloudBoard() {
  if (!cloud.enabled) return [];
  if (!boardCache || Date.now() - boardCacheT > 30000) {
    try { boardCache = (await ghRead(BOARD)) || { p: {} }; boardCacheT = Date.now(); } catch (e) {}
  }
  return Object.entries((boardCache && boardCache.p) || {}).sort((x, y) => y[1].e - x[1].e).slice(0, 5)
    .map(([id, v]) => ({ id: v.n || id, e: v.e }));
}

// Émule les 3 routes de l'ancien service : /register, /login, /save
async function request(path, b, opts = {}) {
  if (!API) throw new Error('cloud désactivé');
  const id = String(b.id || '').toLowerCase(), file = 'saves/' + id + '.json';
  const h = await sha256(id + ':' + b.pin + ':astro-mineur:' + REPO);
  if (path === '/register') {
    if (await ghRead(file)) throw herr('Identifiant déjà pris', 409);
    const t = Date.now(), total = earned(b.save);
    await ghWrite(file, { h, t, total, save: b.save || null }, 'create ' + id);
    boardPush(id, b.id, total, true);
    return { ok: true, t };
  }
  if (path === '/login') {
    const f = await ghRead(file);
    if (!f) throw herr('Compte inconnu', 404);
    if (f.h !== h) throw herr('Code incorrect', 401);
    return { save: f.save || null, t: f.t || null };
  }
  if (path === '/save') {
    const inT = (typeof b.save.t === 'number') ? b.save.t : Date.now();
    const total = earned(b.save);
    const check = async () => {
      const f = await ghRead(file);
      if (!f) throw herr('Compte inconnu', 404);
      if (f.h !== h) throw herr('Code incorrect', 401);
      if (!b.force && (f.t || 0) >= inT) throw herr('conflit', 409);
    };
    if (!shas[file]) await check();
    const t = Date.now(), rec = { h, t, total, save: b.save };
    try { await ghWrite(file, rec, 'save ' + id, opts.keepalive); }
    catch (e) {
      if (e.status !== 409) throw e;
      await check(); // quelqu'un d'autre a écrit entre-temps
      await ghWrite(file, rec, 'save ' + id);
    }
    boardPush(id, b.id, total, false);
    return { ok: true, t };
  }
  throw new Error('route inconnue');
}

const RE_ID = /^[a-zA-Z0-9_-]{3,16}$/;
const RE_PIN = /^[0-9]{4}$/;
function check(id, pin) {
  if (!RE_ID.test(id)) throw new Error('Identifiant : 3 à 16 caractères (lettres, chiffres, - ou _)');
  if (!RE_PIN.test(pin)) throw new Error('Le code doit contenir exactement 4 chiffres');
}
function stale() { return new Error('Session changée, opération annulée'); }

// ---- API publique ----

// Reconnexion silencieuse au démarrage (session mémorisée).
export async function cloudResume() {
  const s = restoreSession();
  if (!s) return null;
  const gen0 = cloud.gen;
  trackStart(false);
  try {
    const d = await request('/login', { id: s.id, pin: s.pin });
    if (cloud.gen !== gen0) return null; // réponse périmée : ne rétablit pas l'ancienne session
    cloud.account = s.id; cloud.conflict = false; cloud.lastError = ''; cloud.gen++;
    cloud.lastSync = (d && typeof d.t === 'number') ? d.t : null;
    return d; // { save, t } ou { save: null }
  } catch (e) {
    clearSession();
    if (e.status === 404 || e.status === 401) return null; // compte supprimé / code changé
    cloud.lastError = e.message;
    return null;
  } finally { trackEnd(false); }
}

export async function cloudRegister(id, pin, saveObj) {
  check(id, pin);
  const gen0 = cloud.gen;
  trackStart(false);
  try {
    const d = await request('/register', { id, pin, save: saveObj });
    if (cloud.gen !== gen0) throw stale(); // l'identité a changé pendant la création
    cloud.account = id; cloud.conflict = false; cloud.hold = false; cloud.lastError = ''; cloud.gen++;
    cloud.lastSync = (d && typeof d.t === 'number') ? d.t : null;
    if (d && typeof d.t === 'number') cloud.offset = d.t - Date.now(); // synchro horloge serveur
    saveSession(id, pin);
    return true;
  } finally { trackEnd(false); }
}

// Connexion : renvoie { save, t } (save peut être null si compte neuf).
// opts.hold : une partie est en cours — on bloque les envois auto tant que le
// joueur n’a pas choisi entre « récupérer la partie du compte » et « envoyer
// la partie en cours » (évite d’écraser la sauvegarde du compte avec la
// partie jouée sous un autre compte).
export async function cloudLogin(id, pin, opts = {}) {
  check(id, pin);
  const gen0 = cloud.gen;
  trackStart(false);
  try {
    const d = await request('/login', { id, pin });
    if (cloud.gen !== gen0) throw stale(); // déconnexion/autre compte entre-temps
    cloud.account = id; cloud.conflict = false; cloud.lastError = ''; cloud.gen++;
    cloud.hold = !!opts.hold;
    cloud.lastSync = (d && typeof d.t === 'number') ? d.t : null;
    saveSession(id, pin);
    return d;
  } finally { trackEnd(false); }
}

// Envoi d'une sauvegarde. keepalive : dernier recours avant fermeture d'onglet.
export async function cloudPush(saveObj, opts = {}) {
  const s = restoreSession();
  if (!s || s.id !== cloud.account) throw new Error('non connecté');
  const gen0 = cloud.gen; // génération capturée au départ : une réponse périmée ne modifie rien
  trackStart(true);
  try {
    const d = await request('/save', { id: s.id, pin: s.pin, save: saveObj, force: !!opts.force }, { keepalive: !!opts.keepalive });
    if (cloud.gen === gen0) { // réponse toujours d'actualité
      cloud.conflict = false; cloud.hold = false; cloud.lastError = '';
      cloud.lastSync = (d && typeof d.t === 'number') ? d.t : Date.now();
      cloud.offset = cloud.lastSync - Date.now(); // synchro horloge serveur
    }
    return d;
  } catch (e) {
    if (cloud.gen === gen0) {
      if (e.status === 409) cloud.conflict = true;     // version distante plus récente
      else cloud.lastError = e.message;
    }
    throw e;
  } finally { trackEnd(true); }
}

// Récupération de la partie distante. La génération est vérifiée avant de
// rendre la sauvegarde : une réponse périmée (changement de compte pendant la
// requête) est refusée — l'appelant ne doit PAS l'appliquer via applyCloudSave().
export async function cloudPull() {
  const s = restoreSession();
  if (!s || s.id !== cloud.account) throw new Error('non connecté');
  const gen0 = cloud.gen;
  trackStart(false);
  try {
    const d = await request('/login', { id: s.id, pin: s.pin });
    if (cloud.gen !== gen0) throw stale(); // périmé : ne surtout pas charger cette partie
    cloud.lastError = '';
    // NB : conflict/hold ne sont PAS levés ici — seulement après application
    // réussie de la sauvegarde (applyCloudSave côté jeu).
    cloud.lastSync = (d && typeof d.t === 'number') ? d.t : null;
    if (d && typeof d.t === 'number') cloud.offset = d.t - Date.now();
    return d;
  } finally { trackEnd(false); }
}

export function cloudLogout() {
  cloud.account = null; cloud.conflict = false; cloud.hold = false; cloud.lastSync = null; cloud.gen++;
  clearSession();
}
