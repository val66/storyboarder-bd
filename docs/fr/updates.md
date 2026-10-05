# Mises à jour

*[English version](../en/updates.md)*

Tâche #442. Comment l'application installée apprend qu'une version existe, la télécharge, et
comment une version devient **obligatoire** sans qu'on puisse s'y soustraire en coupant le réseau.

## Ce que voit l'utilisateur

- **Une mise à jour facultative** : un bouton « Mise à jour » apparaît à côté du numéro de version,
  en haut à gauche. Il ouvre une modale : la version, les nouveautés, le poids du téléchargement, et
  l'annonce du redémarrage. Le Projet est enregistré avant l'installation ; si l'enregistrement
  échoue, l'installation est annulée.
- **Une mise à jour obligatoire** : l'application s'ouvre sur un écran plein, sans menus, qui dit ce
  que la version apporte, son poids, et propose de la télécharger. Rien d'autre n'est accessible.
- **Hors ligne depuis plus de quatorze jours** : un autre écran plein, « Connexion requise ». Il
  parle de connexion, **jamais** de mise à jour : l'utilisateur doit savoir que c'est le réseau qui
  manque, et non chercher une version qui n'existe peut-être pas. Deux variantes : la première
  vérification (jamais connecté) et une horloge reculée avant la dernière vérification.

Chaque mise à jour redémarre l'application : l'installeur remplace l'application entière. La
modale le dit toujours.

## L'attestation signée et le bail de quatorze jours

Une version est obligatoire quand la version installée est sous la `versionMinimale` d'une
**attestation** : un petit fichier daté, signé en Ed25519, republié chaque nuit par
`.github/workflows/attestation.yml` sur la branche `attestation`.

- **En ligne**, l'attestation téléchargée fait foi. Elle est gardée sur le disque, dans le dossier
  de données de l'application (`maj/attestation.json`).
- **Hors ligne**, la dernière gardée fait foi tant qu'elle a moins de quatorze jours. Au-delà,
  l'écran « Connexion requise ».
- **Modifiée**, la signature ne correspond plus. **Supprimée**, il n'y a plus de bail : l'écran de
  connexion. **Horloge reculée** avant la date d'émission (une heure de tolérance) : refusée.

La clé privée vit dans le secret `ATTESTATION_CLE_PRIVEE` du dépôt ; l'application n'embarque que la
clé publique (`attestation-cle.js`). Elle peut vérifier une attestation, pas en fabriquer une.

Pourquoi chaque nuit : le bail compte depuis la date d'**émission**. Signée une fois par release,
une attestation vieillirait entre deux versions, et quelqu'un connecté la veille serait bloqué.

La décision vit dans `update-policy.js` (testée sous Node nu), les entrées-sorties dans
`updater.js`, le branchement dans `main.js`. C'est une exception à la règle n°1
d'[architecture.md](architecture.md) : télécharger et lancer un installeur ne se fait que dans le
processus principal.

## Publier une version

Une fois pour toutes, avant la première version publiée avec ce système :

1. `npm run cles-attestation` écrit la clé publique dans `attestation-cle.js` (à committer) et la
   clé privée dans le dossier personnel, hors du dépôt.
2. Copier la clé privée dans GitHub : Settings, Secrets and variables, Actions, secret
   `ATTESTATION_CLE_PRIVEE`. Garder le fichier en lieu sûr.

Tant que la clé publique vaut `null`, la vérification obligatoire est **éteinte** : sans cette
garde, une version publiée avant la création des clés bloquerait tout le monde.

Ensuite, à chaque version :

- **Mineure ou majeure** : le hook post-commit pose le tag `vX.Y.Z`. `git push --follow-tags`
  déclenche `release.yml`, qui publie la note puis construit l'installeur sous Windows et attache
  `latest.yml`, l'installeur et son `.blockmap`.
- **Un correctif à distribuer** : poser le tag à la main (`git tag -a v1.8.5 -m v1.8.5`), puis
  pousser. Les correctifs ne sont pas publiés d'office.
- **Obligatoire** : `npm run obligatoire` pose `vX.Y.Z` (s'il manque) et `obligatoire/vX.Y.Z` sur le
  commit courant. Il refuse sans section `## vX.Y.Z` dans `CHANGELOG.md` : l'écran obligatoire
  affiche ce que la version apporte. Pour rendre obligatoire une version déjà publiée :
  `npm run obligatoire -- 1.9.0`.

Un tag obligatoire n'est retenu par l'attestation qu'une fois l'installeur de sa version publié :
sinon, tout le monde serait bloqué devant un écran sans rien à télécharger.

## Pièges connus

- **Ne jamais régénérer la paire de clés** une fois une version publiée avec elle. Chaque
  installation ne connaît que sa clé publique ; signées autrement, les attestations seraient
  refusées et ces installations finiraient sur l'écran de connexion. `npm run cles-attestation`
  refuse d'écraser une clé sans `--forcer`.
- **GitHub désactive les tâches planifiées** d'un dépôt public sans activité depuis 60 jours.
  L'attestation vieillirait : les utilisateurs en ligne ne sont pas touchés, ceux qui restent hors
  ligne verraient l'écran de connexion plus tôt. Réactiver le workflow dans l'onglet Actions.
- **Le premier lancement demande une connexion** : sans attestation gardée, il n'y a pas de bail.
- **Les notes sont en français** : elles viennent de `CHANGELOG.md`, écrit en français seulement.
- **Le téléchargement est complet** (environ 125 Mo), pas différentiel.

## Voir les écrans sans publier

`npm start` n'est pas une application installée : il ne vérifie rien et ne propose rien. La
variable `STORYBOARD_SIMULER_MAJ` montre chaque écran avec des données factices, en développement
seulement :

| Valeur | Ce qu'on voit |
|---|---|
| `disponible` | le bouton « Mise à jour » et sa modale |
| `obligatoire` | l'écran plein de mise à jour obligatoire |
| `obligatoireLong` | le même, avec six versions aux notes longues (défilement, marges) |
| `obligatoireHorsLigne` | la mise à jour obligatoire alors qu'on est hors ligne |
| `expire` | « Connexion requise », hors ligne depuis plus de quatorze jours |
| `jamais` | « Première vérification nécessaire » |
| `horloge` | « Date de l'ordinateur incorrecte » |

Sous PowerShell :

```
[Console]::OutputEncoding=[Text.Encoding]::UTF8; cd C:\WebProjects\Storyboarder; $env:STORYBOARD_SIMULER_MAJ='obligatoire'; npm start
```

⚠️ **La variable reste posée dans ce terminal** tant qu'il est ouvert : chaque `npm start` suivant y
relance la simulation. Un bandeau jaune la signale et dit comment en sortir. Pour revenir à la
normale, fermer le terminal, ou :

```
[Console]::OutputEncoding=[Text.Encoding]::UTF8; Remove-Item Env:STORYBOARD_SIMULER_MAJ; cd C:\WebProjects\Storyboarder; npm start
```

Le téléchargement y est simulé (une barre de progression factice), rien n'est installé.

## Tester une vraie mise à jour

La simulation ne prouve pas que la chaîne marche. Pour cela :

1. Installer une version qui contient déjà ce système (`npm run dist`, puis l'installeur de `dist/`).
2. Publier une version plus récente : `git push --follow-tags` sur un tag `vX.Y.Z`.
3. Attendre dans l'onglet Actions la fin de **Release** (la note, puis l'installeur Windows) puis
   d'**Attestation**. La release doit porter trois fichiers : l'installeur `.exe`, son `.blockmap` et
   `latest.yml`.
4. Lancer la version installée : le bouton « Mise à jour » apparaît. Elle ne vérifie qu'au
   démarrage.

### Si l'installeur d'une release échoue

Corriger, committer **sans le hook** (`git commit --no-verify`, lint et tests lancés à la main) :
sinon la version passerait au correctif suivant, et l'installeur du tag annoncerait une autre version
que la sienne. Puis reposer le tag sur ce commit et le repousser :

```
git tag -f -a v1.9.0 -m v1.9.0 HEAD
git push; git push --force origin v1.9.0
```

La note d'une release qui existe déjà est mise à jour, pas recréée : le circuit se relance en entier.

⚠️ **`latest.yml` n'est produit que si `build.publish` désigne le dépôt GitHub.** Avec
`publish: null`, l'installeur se construit mais pas ce fichier, et l'application installée n'a rien
à lire. C'est ce qui a fait échouer la première release (v1.9.0). Un test le garde.
