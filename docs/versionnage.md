# Versionnage de l'application

> Document de contributeur. Il vivait dans les README, où il n'avait pas sa place : c'est du
> fonctionnement interne, pas de l'information d'utilisateur. Seule la ligne `**Version x.y.z**`
> reste en tête des README, réécrite automatiquement.

Format `major.minor.correctif`, affiché à côté du nom de l'application (en haut à gauche).

## Les trois niveaux

| Niveau | Quand | Comment |
|---|---|---|
| **major** | Sur demande explicite | `npm run bump major` |
| **minor** | À la validation d'une fonctionnalité, après tests fonctionnels | `npm run bump minor` |
| **correctif** | À chaque commit | Automatique (hook `pre-commit`) |

Passer une mineure remet le correctif à 0 ; passer une majeure remet les deux à 0.

## Les quatre fichiers qui portent la version

`package.json` fait foi — c'est aussi ce dont electron-builder tamponne l'installeur. Les trois
autres en sont dérivés par `tools/bump-version.mjs` :

- **`src/version.js`** — généré, importé par le renderer pour l'affichage. Il existe parce que lire
  `package.json` depuis le renderer imposerait un IPC, donc de toucher `main.js`/`preload.js`,
  interdit pour une fonctionnalité applicative.
- **`README.md`** et **`README.fr.md`** — la ligne `**Version x.y.z**`.

`tests/version.test.mjs` interdit à ces quatre fichiers de diverger.

## Ce qui se passe à chaque commit

```
git commit
   │
   ├─ fusion / rebase / cherry-pick ?  →  on ne touche à rien
   │
   ├─ node absent du PATH ?  →  commit annulé, message explicite
   │
   ├─ suite de tests (~3 s)
   │     └─ échec  →  commit annulé, AUCUN fichier modifié
   │
   ├─ incrément du correctif  →  les 4 fichiers ensemble
   │     ├─ version déjà changée à la main  →  pas de 2e incrément
   │     └─ un fichier invalide  →  aucune écriture du tout
   │
   ├─ les 4 fichiers rejoignent le commit en cours
   │
   └─ post-commit : mineure ou majeure ?  →  tag `vX.Y.Z` + rappel `--follow-tags`
```

## Deux ordres qui ne sont pas anodins

**Les tests avant l'incrément.** Incrémenter d'abord laisserait, à chaque test en échec, une version
montée dans l'arbre de travail sans commit correspondant.

**Dans le script, toutes les vérifications avant toutes les écritures.** La première version écrivait
`package.json` puis vérifiait les README : une ligne de version absente d'un README laissait
`package.json` déjà incrémenté et les README en arrière — soit exactement l'incohérence que ce script
existe pour empêcher. Constaté en éprouvant le cas d'échec, pas déduit.

**Le tag après coup.** Au moment du `pre-commit`, le commit qui portera la version n'existe pas
encore ; un tag y pointerait sur le commit précédent, celui qui ne contient pas le changement de
version. D'où un hook `post-commit`.

## Commandes

```bash
npm run setup-hooks      # après un clone : réinstalle les hooks (git ne versionne pas .git/hooks)
npm run bump sync        # régénère les fichiers dérivés depuis package.json
npm run bump minor       # ou major — jamais correctif, le hook s'en charge
git push --follow-tags   # ⚠ git push SEUL n'envoie pas les tags
```

## Deux limites connues

**`git commit --amend` réincrémente.** Amender trois fois consomme trois numéros de correctif. Git ne
donne à un hook `pre-commit` aucun moyen fiable et portable de distinguer un amend d'un commit
ordinaire : le seul hook informé, `prepare-commit-msg`, s'exécute *après* `pre-commit` et ne peut
donc pas le renseigner. Il resterait l'inspection de la ligne de commande du processus parent, qui ne
survit pas à Windows. Une détection qui se tromperait en silence coûterait plus cher qu'un drapeau à
taper : **`git commit --amend --no-verify`** quand tu amendes.

**Les tags ne partent pas tout seuls.** `git push` n'envoie que les commits : une version marquée
localement mais absente du dépôt distant ne sert à rien. Le hook `post-commit` rappelle
`git push --follow-tags` à l'écran chaque fois qu'il vient de poser un tag — c'est le seul endroit
qui sache, à coup sûr et au bon moment, qu'un tag vient d'être créé.

## Échappatoires

`git commit --no-verify` saute les tests et l'incrément — pour un commit en cours de travail. Le hook
`post-commit`, lui, continue de tourner : un tag sera quand même posé si la version a changé.
