// ============================================================
//  ASTRO-MINEUR — service de sauvegarde en ligne (Cloudflare Worker)
//  Écrit les parties dans un dépôt GitHub privé : saves/<identifiant>.json
//  Guide de déploiement : voir cloud/README.md
// ============================================================
//  À configurer dans Cloudflare (Workers → Settings → Variables) :
//    GITHUB_TOKEN   (secret) : jeton GitHub fine-grained, accès au seul dépôt
//                              de sauvegardes, permission Contents: Read & write
//    GH_REPO        (texte) : "pseudo/astro-mineur-saves"
//    GH_BRANCH      (texte) : "main"
//    PEPPER         (secret): chaîne aléatoire longue (hachage des codes)
//    ALLOWED_ORIGIN (texte) : optionnel, ex. "https://pseudo.github.io"
//                             (défaut "*" — le service ne renvoie que du JSON)

const GH = 'https://api.github.com';
const MAX_SAVE_BYTES = 512 * 1024;   // une partie pèse quelques dizaines de Ko
const LOGIN_WINDOW = 5 * 60 * 1000;  // fenêtre anti-force brute
const LOGIN_MAX = 12;                // essais par identifiant et par fenêtre
const SAVE_MAX = 60;                 // sauvegardes par identifiant / 5 min
                                     // (l'autosauvegarde toutes les 20 s ≈ 15/5 min)

// limitation d'effort en mémoire (best effort, par isolate)
const buckets = new Map();

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}
function json(obj, status = 200, env = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(env) },
  });
}

function rateLimited(key, max = LOGIN_MAX) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now > b.reset) { b = { count: 0, reset: now + LOGIN_WINDOW }; buckets.set(key, b); }
  b.count++;
  if (buckets.size > 5000) { // purge paresseuse
    for (const [k, v] of buckets) if (now > v.reset) buckets.delete(k);
  }
  return b.count > max;
}

async function sha256(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function b64(s) { return btoa(String.fromCharCode(...new TextEncoder().encode(s))); }

function makeGH(env) {
  const branch = env.GH_BRANCH || 'main';
  async function ghFetch(path, init = {}) {
    return fetch(GH + path, {
      ...init,
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'astro-mineur-save-service',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers || {}),
      },
    });
  }
  return {
    branch,
    filePath(id) { return `/repos/${env.GH_REPO}/contents/saves/${id}.json`; },
    // Lit le fichier : { data, sha } | null (absent)
    async read(id) {
      const res = await ghFetch(`${this.filePath(id)}?ref=${encodeURIComponent(branch)}&t=${Date.now()}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('lecture GitHub impossible');
      const j = await res.json();
      let data = null;
      try { data = JSON.parse(atob(j.content.replace(/\s/g, ''))); } catch (e) { throw new Error('sauvegarde corrompue'); }
      return { data, sha: j.sha };
    },
    // Écrit le fichier (création ou mise à jour via sha, une révision en cas de conflit)
    async write(id, obj) {
      const existing = await this.read(id);
      const body = {
        message: `save ${id} · ${new Date(obj.t || Date.now()).toISOString()}`,
        content: b64(JSON.stringify(obj)),
        branch,
      };
      if (existing) body.sha = existing.sha;
      let res = await ghFetch(this.filePath(id), { method: 'PUT', body: JSON.stringify(body) });
      if (res.status === 409 && existing) {
        const fresh = await this.read(id);
        if (fresh) body.sha = fresh.sha;
        res = await ghFetch(this.filePath(id), { method: 'PUT', body: JSON.stringify(body) });
      }
      if (!res.ok) throw new Error('écriture GitHub impossible');
    },
  };
}

function validId(id) { return typeof id === 'string' && /^[a-zA-Z0-9_-]{3,16}$/.test(id); }
function validPin(pin) { return typeof pin === 'string' && /^[0-9]{4}$/.test(pin); }
function saveSize(s) { try { return s === null ? 0 : JSON.stringify(s).length; } catch (e) { return Infinity; } }

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(env) });
    if (request.method !== 'POST') return json({ error: 'méthode non autorisée' }, 405, env);
    if (!env.GITHUB_TOKEN || !env.GH_REPO) return json({ error: 'service mal configuré (GITHUB_TOKEN / GH_REPO)' }, 500, env);

    const url = new URL(request.url);
    let payload = {};
    try { payload = await request.json(); } catch (e) { return json({ error: 'requête invalide' }, 400, env); }

    const gh = makeGH(env);
    try {
      // ---- inscription ----
      if (url.pathname === '/register') {
        const { id, pin, save } = payload;
        if (!validId(id)) return json({ error: 'Identifiant invalide (3-16 caractères, lettres/chiffres/-/_)' }, 400, env);
        if (!validPin(pin)) return json({ error: 'Le code doit contenir exactement 4 chiffres' }, 400, env);
        if (save !== null && save !== undefined && saveSize(save) > MAX_SAVE_BYTES) return json({ error: 'sauvegarde trop volumineuse' }, 400, env);
        if (rateLimited('reg:' + id)) return json({ error: 'Trop de tentatives, réessaie dans quelques minutes' }, 429, env);
        if (await gh.read(id)) return json({ error: 'Identifiant déjà pris' }, 409, env);
        const hash = await sha256(id + ':' + pin + ':' + (env.PEPPER || ''));
        await gh.write(id, { pin: hash, t: Date.now(), save: save || null });
        return json({ ok: true, t: Date.now() });
      }

      // ---- connexion ----
      if (url.pathname === '/login') {
        const { id, pin } = payload;
        if (!validId(id) || !validPin(pin)) return json({ error: 'identifiant ou code invalide' }, 400, env);
        if (rateLimited(id)) return json({ error: 'Trop de tentatives, réessaie dans quelques minutes' }, 429, env);
        const file = await gh.read(id);
        if (!file) return json({ error: 'Compte inconnu' }, 404, env);
        const hash = await sha256(id + ':' + pin + ':' + (env.PEPPER || ''));
        if (file.data.pin !== hash) return json({ error: 'Code incorrect' }, 401, env);
        return json({ save: file.data.save || null, t: file.data.t || null });
      }

      // ---- sauvegarde ----
      if (url.pathname === '/save') {
        const { id, pin, save } = payload;
        if (!validId(id) || !validPin(pin)) return json({ error: 'identifiant ou code invalide' }, 400, env);
        if (typeof save !== 'object' || save === null || saveSize(save) > MAX_SAVE_BYTES) return json({ error: 'sauvegarde invalide' }, 400, env);
        if (rateLimited('save:' + id, SAVE_MAX)) return json({ error: 'Trop d’envois, réessaie dans une minute' }, 429, env);
        const file = await gh.read(id);
        if (!file) return json({ error: 'Compte inconnu' }, 404, env);
        const hash = await sha256(id + ':' + pin + ':' + (env.PEPPER || ''));
        if (file.data.pin !== hash) return json({ error: 'Code incorrect' }, 401, env);
        // Politique « la version la plus récente gagne » : on refuse d'écraser
        // une partie distante plus récente, sauf demande explicite (force).
        const remoteT = file.data.t || 0;
        const incomingT = (typeof save.t === 'number') ? save.t : Date.now();
        if (!payload.force && remoteT >= incomingT) return json({ error: 'conflit', remoteT, incomingT }, 409, env);
        const t = Date.now();
        await gh.write(id, { pin: hash, t, save });
        return json({ ok: true, t });
      }

      return json({ error: 'route inconnue' }, 404, env);
    } catch (e) {
      return json({ error: 'service indisponible : ' + (e && e.message) }, 502, env);
    }
  },
};
