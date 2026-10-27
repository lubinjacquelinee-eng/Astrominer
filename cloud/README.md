# Sauvegarde en ligne — guide de déploiement (gratuit, ~10 minutes)

Ce dossier contient le petit service qui stocke les parties des joueurs
**dans un dépôt GitHub privé**. Le jeu (déployé sur GitHub Pages) lui parle
seulement via 3 routes : inscription, connexion, sauvegarde.

```
Joueur (navigateur) ──▶ Worker Cloudflare (ce dossier) ──▶ Dépôt GitHub privé "saves"
```

Le jeton GitHub reste **côté serveur** (secret Cloudflare) : rien de
sensible n'est exposé dans les fichiers publics du jeu.

## 1. Dépôt GitHub du jeu (GitHub Pages)

1. Crée un dépôt public (ex. `astro-mineur`), mets-y le contenu du jeu
   (index.html, style.css, js/, cloud/ — tu peux tout envoyer).
2. Ouvre **Settings → Pages**, choisis *Deploy from a branch* → `main` → `/root`.
3. Le jeu est en ligne sur `https://TON-PSEUDO.github.io/astro-mineur/`.

## 2. Dépôt GitHub des sauvegardes (privé)

1. Crée un dépôt **privé** `astro-mineur-saves` (vierge, sans README).
2. Crée un dossier `saves` : le service écrira dedans un fichier
   `saves/<identifiant>.json` par compte pilote.
   (Astuce : commite un fichier `saves/.keep` pour créer le dossier.)
3. GitHub → Settings → Developer settings → Fine-grained tokens →
   *Generate new token* :
   - **Repository access** : *Only select repositories* → `astro-mineur-saves`
   - **Permissions → Contents** : *Read and write* (rien d'autre)
4. Copie la valeur du jeton (elle commence par `github_pat_`).

## 3. Service Cloudflare (gratuit, sans carte bancaire)

1. Crée un compte sur [dash.cloudflare.com](https://dash.cloudflare.com).
2. **Workers & Pages → Create application → Worker → Create worker →
   Edit code**, puis copie-colle le contenu de `cloud/worker.js`.
   Nomme-le par ex. `astro-mineur-saves`, puis **Deploy**.
3. Dans **Settings → Variables and Secrets → Add**, ajoute :

| Type | Nom | Valeur |
|---|---|---|
| Secret | `GITHUB_TOKEN` | ton jeton `github_pat_...` |
| Texte | `GH_REPO` | `TON-PSEUDO/astro-mineur-saves` |
| Texte | `GH_BRANCH` | `main` |
| Secret | `PEPPER` | n'importe quelle longue chaîne aléatoire (ex. 30+ caractères) |
| Texte | `ALLOWED_ORIGIN` | `https://TON-PSEUDO.github.io` *(optionnel mais conseillé)* |

> ⚠️ Garde la même valeur `PEPPER` pour toujours : elle protège les codes
> 4 chiffres. Si tu la changes, tous les comptes devront être recréés.

4. Récupère l'adresse du worker, du style
   `https://astro-mineur-saves.TON-PSEUDO.workers.dev`.

## 4. Côté jeu

Ouvre `js/cloud-config.js` et colle l'adresse du worker :

```js
window.ASTRO_CLOUD = { api: 'https://astro-mineur-saves.TON-PSEUDO.workers.dev' };
```

Commit + push → c'est en ligne. Le bouton **Compte pilote** du menu
principal ouvre l'écran de connexion (identifiant + code à 4 chiffres),
et la sauvegarde automatique GitHub démarre (toutes les 20 s en jeu,
plus à la fermeture de l'onglet).

## 5. Test rapide

- Crée un compte (`test` / `1234`), joue 30 s → un commit `save test · ...`
  apparaît dans le dépôt `astro-mineur-saves`.
- Rouvre le jeu dans un navigateur vierge → Compte pilote → même
  identifiant/code → « Reprendre ma partie ».
- Mauvais code 3 fois → « Trop de tentatives » (anti-force brute, 5 min).

## Limites connues (honnêteté technique)

- **Un code à 4 chiffres protège peu** : c'est une protection "voisin
  curieux", pas une vraie sécurité. Le service limite les essais, mais
  le stockage reste un simple dépôt GitHub.
- L'anti-force brute et la limitation d'envois sont en mémoire du worker
  (best effort) : suffisant pour un jeu entre amis.
- GitHub limite le contenu API à ~100 Mo par fichier — largement assez
  (une partie ≈ 30 Ko).
- Sans configuration (cloud-config.js vide), le jeu reste 100 % jouable :
  la sauvegarde automatique **locale** (navigateur) fonctionne déjà,
  ainsi que l'export/import fichier et code.
