# Sauvegarde en ligne — configuration (une seule fois, ~3 minutes)

Les joueurs n'ont rien à faire : identifiant + code à 4 chiffres dans le jeu
(le compte se crée tout seul), puis tout est enregistré automatiquement dans
ton dépôt GitHub (`saves/<id>.json`) et le classement dans `leaderboard.json`.

1. Crée un dépôt **privé** `astro-mineur-saves` avec un fichier `README.md`
   (pour que la branche `main` existe).
2. GitHub → Settings → Developer settings → **Fine-grained tokens** → nouveau jeton :
   *Only select repositories* → `astro-mineur-saves` · Permissions → **Contents : Read and write**.
3. Écris le jeton **à l'envers** (console du navigateur, F12) :
   `'github_pat_XXXX'.split('').reverse().join('')`
4. Dans `js/cloud-config.js` :
   `window.ASTRO_CLOUD = { repo: 'TON-PSEUDO/astro-mineur-saves', branch: 'main', tk: 'jeton-à-l-envers' };`
5. Publie le jeu (GitHub Pages) : c'est fini.

## À savoir
- Le jeton est lisible par quiconque lit le code du jeu (inévitable sans serveur) :
  il ne donne accès qu'au dépôt de sauvegardes, et chaque écriture est un commit récupérable.
  L'écrire à l'envers évite que GitHub le révoque automatiquement.
- Garde le dépôt de sauvegardes **privé** (il contient les empreintes des codes).
- Le classement repose sur la partie envoyée par le navigateur : un joueur motivé peut tricher.
- GitHub limite les écritures (~500/heure pour un jeton) : autosauvegarde cloud toutes les 90 s,
  classement mis à jour au plus toutes les 3 min. Pour beaucoup de joueurs simultanés, il faudrait un vrai serveur.
