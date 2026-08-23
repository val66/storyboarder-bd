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

`package.json` fait foi, et c'est aussi ce dont electron-builder tamponne l'installeur. Les trois
autres en sont dérivés par `tools/bump-version.mjs` :

- **`src/version.js`** : généré, importé par le renderer pour l'affichage. Il existe parce que lire
  `package.json` depuis le renderer imposerait un IPC, donc de toucher `main.js`/`preload.js`,
  interdit pour une fonctionnalité applicative.
- **`README.md`** et **`README.fr.md`** : la ligne `**Version x.y.z**`.

`tests/version.test.mjs` interdit à ces quatre fichiers de diverger.

## Ce qui se passe à chaque commit

```
git commit
   │
   ├─ fusion / rebase / cherry-pick ?  →  on ne touche à rien
   │
   ├─ node absent du PATH ?  →  commit annulé, message explicite
   │
   ├─ ESLint (sauté, avec un message, s'il n'est pas installé)
   │     └─ erreurs  →  commit annulé, AUCUN fichier modifié
   │
   ├─ suite de tests (~4 s)
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
`package.json` déjà incrémenté et les README en arrière, soit exactement l'incohérence que ce script
existe pour empêcher. Constaté en éprouvant le cas d'échec, pas déduit.

**Le tag après coup.** Au moment du `pre-commit`, le commit qui portera la version n'existe pas
encore ; un tag y pointerait sur le commit précédent, celui qui ne contient pas le changement de
version. D'où un hook `post-commit`.

## Commandes

```bash
npm i -D eslint          # active l'étape de lint du hook (facultatif, mais recommandé)
npm run setup-hooks      # après un clone : réinstalle les hooks (git ne versionne pas .git/hooks)
npm run bump sync        # régénère les fichiers dérivés depuis package.json
npm run bump minor       # ou major, jamais correctif : le hook s'en charge
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
`git push --follow-tags` à l'écran chaque fois qu'il vient de poser un tag : c'est le seul endroit
qui sache, à coup sûr et au bon moment, qu'un tag vient d'être créé.

## Intégration continue

`.github/workflows/ci.yml` lance lint + tests sur une machine Linux neuve, à chaque push et chaque
pull request, sur les deux lignes LTS de Node maintenues.

**Ce n'est pas un doublon du hook.** Le hook `pre-commit` s'exécute sur *votre* machine, avec vos
paquets installés, sous Windows. La CI couvre exactement ce qui lui échappe :

- **un contributeur externe** : les hooks git ne sont pas versionnés (`npm run setup-hooks` les
  installe) : un clone frais n'en a aucun. C'est la raison principale, et elle est sociale plus que
  technique : la CI dit à quelqu'un que sa contribution passe sans qu'il ait à le demander ;
- **un autre système** : le développement se fait sous Windows, la CI tourne sous Linux. Toute
  hypothèse de chemin qui ne tient que d'un côté devient visible ;
- **`npm ci` plutôt que `npm install`** : il installe exactement `package-lock.json` et échoue si
  celui-ci diverge de `package.json`. C'est le seul contrôle qui attrape une dépendance utilisée mais
  non déclarée : le cas « ça marche chez moi » parce que le paquet traîne dans `node_modules` ;
- **`git commit --no-verify`**, que ce document recommande lui-même pour un amend.

Volontairement absents : la vérification de types (402 diagnostics, zéro défaut réel, cf.
architecture.fr.md règle n°5) et la construction de l'installeur (demande Windows et plusieurs
minutes, pour une chaîne qui ne change presque jamais).

`tests/ci-setup.test.mjs` garde le câblage : que la CI lance **les deux** vérifications, qu'elle
utilise `npm ci`, et que les versions de Node testées concordent avec `engines` de `package.json`
**et** avec ce que promettent les README. Trois descriptions d'une même contrainte, exactement le
genre qui dérive.

## Ce qu'un tag publié dit de lui-même

Pousser un tag avec `git push --follow-tags` fait afficher « v1.2.0 » par GitHub, et rien d'autre.
Le workflow `release.yml` remplit cette page. Sur tout tag `v*`, il publie, par ordre de préférence :

1. la section de `CHANGELOG.md` titrée exactement `## <tag>`, qui sépare **ce qui change pour vous**
   de **sous le capot**, une distinction qu'aucun outil ne peut faire à notre place, faute de
   convention de préfixe dans les commits. Sur la v1.2.0, six commits sur trente-trois concernaient
   l'utilisateur ;
2. à défaut, la liste des **sujets** de commit depuis le tag précédent. Repli honnête : il ne dit
   rien de faux, il dit seulement tout à plat.

Quand une section rédigée existe, la liste des sujets part dans un bloc `<details>` replié sous elle :
la traçabilité survit à la lisibilité. Les deux formes portent un lien de comparaison.

Un titre doit valoir exactement `## vX.Y.Z`, et un test l'exige. Aucune section « À paraître » n'est
reprise par défaut : faute d'être renommée, elle republierait mot pour mot le texte de la version
précédente, et une note fausse est pire qu'une note générée.

Seules les versions mineures et majeures y arrivent, puisque seules elles sont taguées (cf.
plus haut). Trente releases pour trente correctifs n'informeraient personne.

La mise en forme vit dans `tools/release-notes.mjs`, pas dans le YAML, pour une raison : un workflow
ne s'exécute que sur le serveur au push d'un tag, le pire moment pour découvrir qu'il produit une
note vide, puisque le tag est déjà public. En fonction pure, elle est éprouvée à chaque commit.

Ce qu'il ne publie jamais : les CORPS de messages. Ils font vingt lignes chacun ici, et trente
d'affilée noieraient ce qu'on venait lire. Et il ne regroupe jamais les changements de lui-même : une
machine qui lit ces sujets ne distingue pas un correctif visible d'un rangement interne, donc le tri
se fait à la main, dans `CHANGELOG.md`, ou pas du tout.

Le piège, gardé par un test : `fetch-depth: 0` sur le checkout. Sans lui, le runner ne récupère
qu'un commit, `git describe` ne voit aucun tag antérieur, et chaque release s'annonce comme la
première. Rien n'échoue : la note est simplement fausse, à chaque fois.

## L'installeur embarque une liste blanche, pas le dossier

`build.files`, dans `package.json`, est **exclusive** : ce qui n'y figure pas n'atteint pas
l'application installée. Rien ne le signale. Le développement continue de fonctionner (il lit le
dossier du dépôt), donc le manque n'existe que dans le `.exe`, et l'utilisateur qui le rencontre ne
peut le décrire autrement que « c'est cassé ».

Ce n'est pas une hypothèse. `style.css` est né le 28/07/2026, quand `index.html` a été scindé en
coquille + feuille de style + `src/`. `build.files` n'a jamais suivi. Le seul build du dépôt précède
cette scission de deux jours : rien ne l'a révélé. Pendant deux semaines, `npm run dist` aurait
produit une application en HTML brut, 795 lignes de style absentes.

**Ajouter un fichier que l'application charge à l'exécution, c'est aussi l'ajouter ici.**
`tests/packaging.test.mjs` garde désormais la règle générale : tout asset local référencé par
`index.html` doit être couvert par un motif, et tout motif doit encore viser quelque chose qui
existe, plutôt que le seul fichier qui manquait.

## Échappatoires

`git commit --no-verify` saute les tests et l'incrément, pour un commit en cours de travail. Le hook
`post-commit`, lui, continue de tourner : un tag sera quand même posé si la version a changé.
