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

const CFG = (window.ASTRO_CLOUD && window.ASTRO_CLOUD.api) || '';
const API = String(CFG).replace(/\/+$/, '');
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

async function request(path, body, opts = {}) {
  if (!API) throw new Error('cloud désactivé');
  const res = await fetch(API + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
    keepalive: !!opts.keepalive,
  });
  let data = null;
  try { data = await res.json(); } catch (e) { data = null; }
  if (!res.ok) {
    const err = new Error((data && data.error) || `erreur ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
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
