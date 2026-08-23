# Bibliothèque de poses — comment ça marche

> **État actuel du fonctionnement**, pas l'historique des décisions. Le raisonnement qui a mené là,
> avec ses revirements, est dans [character-editor.fr.md](character-editor.fr.md).
>
> À jour du Fix 62.

## Où vivent les poses

**Une seule bibliothèque**, au niveau **Application** : `settings.json` (userData), clé
`poseLibrary`. C'est la seule que l'utilisateur voit et modifie, et elle est partagée par tous ses
Projets. En mémoire : `S.poses`, lu partout de façon **synchrone** ; la persistance est asynchrone et
silencieuse (`setPoseLibrary`, io.js).

Au premier lancement, les 6 poses de `POSITIONS` y sont **semées** (`seedPoseLibrary3D`) avec la clé
intégrée comme `id` : `'assis'`, `'debout'`… C'est ce qui fait que les fichiers déjà enregistrés,
qui contiennent `position: 'assis'`, résolvent sans migration. Elles deviennent des entrées
ordinaires, sans statut particulier.

⚠️ Le semis se déclenche sur l'**absence de la clé**, jamais sur une liste vide : une bibliothèque
vidée est une décision de l'utilisateur, la resemer l'annulerait à chaque redémarrage.

⚠️ Semer APRÈS le chargement de `draw.js`, qui complète `POSE_3D` à l'exécution avec `'allonge'` et
`'vaincu'`. Semer avant priverait définitivement l'utilisateur des deux poses couchées.

**Un fichier projet** porte en plus une **copie de secours** des poses que ses Personnages citent
(`posesUsedByProject3D`, champ `poses`). Recalculée à **chaque** enregistrement, jamais modifiable
directement. Elle sert à ce qu'un projet ouvert ailleurs garde le nom de ses poses.

| | Bibliothèque | Copie dans le fichier |
|---|---|---|
| Où | `settings.json`, clé `poseLibrary` | champ `poses` du `.json` de Projet |
| Portée | toute l'Application | ce Projet seul |
| Modifiable | oui, c'est l'interface | non, recalculée à l'enregistrement |
| Rôle | ce qui fait autorité | secours, pour qu'un fichier reste lisible ailleurs |

## Enregistrer

`savePersonaEditorPose` (events.js) → `makePose3D` → `setPoseLibrary`.

- Les angles sont **copiés**, donc figés au moment du clic. Continuer à bouger les curseurs ne
  modifie plus la pose enregistrée.
- `id` vient de `newId('pose')` : « pose1 », « pose2 »… Aucune collision possible avec les clés
  intégrées. ⚠️ Dépend de `resyncIdCounter` (io.js), qui visite `poses` : sans lui, une pose créée
  après chargement réutiliserait un id pris, et un Personnage se retrouverait avec la mauvaise pose.
- Sans nom fourni : `nextDefaultPoseName3D` comble le premier « Pose N » libre, plutôt que de
  compter les entrées : après des suppressions, « Pose 12 » dans une liste de trois n'aiderait
  personne.
- `skeleton` est tagué dès l'enregistrement, alors que seuls les humains ont des poses : le
  rattraper plus tard sur des fichiers déjà écrits serait impossible.

**Renommer** (`renamePose3D`) conserve l'`id`. L'appariement se faisant par id, tous les Personnages
qui citent la pose affichent aussitôt le nouveau nom.

## Supprimer

`deletePersonaEditorPose` → `deletePose3D` + `setDismissedPoses`.

**Toujours une confirmation**, y compris pour une pose que personne n'utilise. Le message est
différencié : court sans usage, détaillé avec le compte sinon, en précisant que ce compte ne couvre
que le Projet ouvert. Uniformiser le message mettrait du bruit là où il n'y a rien à signaler, et
c'est le bruit qui finit par faire cliquer sans lire.

Effets :

- La pose quitte la bibliothèque → elle disparaît de **tous** les Projets.
- **Aucun Personnage n'est modifié.** Ses angles sont dans `joints3d` ; il garde son allure. Seule
  son étiquette devient « inconnue » (`resolvePoseLabel3D`).
- L'id est **mémorisé** dans `S.dismissedPoses` (clé `poseLibraryDismissed`). `mergePoseLibrary3D`
  ne le réintroduit plus jamais.

⚠️ La mémorisation ne garde **que l'id**, jamais les angles ni le nom. Conserver le contenu pour
pouvoir le ressusciter contredirait ce qu'annonce la confirmation.

Conséquence : irréversible pour les poses personnelles.

## Restaurer

Modale **Configuration** → « ↺ Restaurer les poses de base » (`restoreBuiltinPoses`, io.js). Le
bouton affiche le nombre manquant et se désactive à zéro.

Les poses de base sont récupérables parce que l'application les connaît en dur, pas parce qu'on en
aurait gardé une copie cachée.

- Réajoute **uniquement les manquantes** (`missingBuiltinPoses3D`).
- Lève leur mémorisation (`forgetDismissedPoses3D`), sans quoi elles seraient réécartées à la
  première fusion : restaurées à l'écran, puis disparues au prochain Projet ouvert.
- ⚠️ Comblement de trous, **pas** remise à zéro d'usine. Une pose de base renommée est *présente*,
  donc pas manquante : cliquer ne peut jamais faire perdre un renommage.
- Ne touche pas aux poses personnelles.

## À l'ouverture d'un Projet

`applyProjectData` → `mergePoseLibrary3D(S.poses, poses du fichier, S.dismissedPoses)`.

La fusion **ajoute**, elle ne remplace jamais :

- une pose inconnue du fichier rejoint la bibliothèque : c'est l'intérêt d'un Projet reçu d'un tiers ;
- une pose **déjà connue** garde le nom de la bibliothèque, pas celui du fichier : ouvrir un vieux
  Projet ne peut pas annuler un renommage ;
- une pose **mémorisée comme supprimée** n'est jamais réintroduite.

## Résolution d'une pose

Ordre, dans `poseJointsByKey3D` et `resolvePoseLabel3D` :

1. **la bibliothèque** : elle fait autorité, sinon un renommage de « Assis » serait annulé par la
   table figée ;
2. **`POSE_3D` / `POSITIONS`** : filet pour un fichier citant une pose intégrée supprimée. Résout,
   mais n'apparaît **jamais** dans la liste : supprimer fait bien disparaître la pose de l'interface.

Introuvable dans les deux : étiquette « inconnue », et `position` **reste intact** dans le fichier.
Écrire « inconnu » détruirait le nom ; en l'état, le Projet se répare seul s'il retrouve la pose.

## Appliquer depuis l'éditeur

`applyPersonaEditorToModal` (events.js) écrit dans **`S.modalDraftJoints`**, jamais dans
`S.modalTarget`. C'est `descModalSave` qui recopie le brouillon dans l'Élément, et lui seul décide du
moment ; sans quoi « Annuler » n'annulerait plus (le défaut corrigé par le Fix 35 ailleurs).

Ne fait rien sans `S.personaEditorFromModal` : sans modale derrière, il n'y a rien à alimenter. C'est
aussi la condition d'affichage du bouton, **masqué** et non grisé en mode autonome.

La clé de pose n'est reportée sur le `<select>` que si la bibliothèque la connaît encore
(`poseKeyStillInLibrary`) : le piège du Fix 44 par une autre porte : une valeur absente des options
laisse le `<select>` VIDE, et la sauvegarde suivante écrirait une chaîne vide dans `position`.

## `positionLabel` — dernier nom connu

Écrit par `descModalSave`, et **nulle part ailleurs** : c'est le seul moment où l'on touche
l'Élément, et ça vaut donc aussi pour une pose choisie directement dans le `<select>`.

`resolvePoseLabel3D` ne le lit **que** si la pose est introuvable. Une valeur périmée n'est donc
jamais affichée tant que le nom faisant autorité existe, et quand il a disparu, un nom périmé vaut
mieux qu'un id opaque. `nameOfPose3D` renvoie `null` si la pose est introuvable : y écrire un nom
inventé rendrait le champ mensonger précisément dans le cas où il sert.

## « Y a-t-il quelque chose à faire ? » — deux boutons, deux portées, une granularité

Deux endroits répondent à une question voisine :

| | Question | Portée | Comment |
|---|---|---|---|
| Modale Personnage, bouton **Enregistrer** | y a-t-il quelque chose à sauvegarder ? | tous les champs du formulaire (nom, genre, émotion, taille, rotations, **et les curseurs d'articulations**) | `captureModalSnapshot` : chaîne construite depuis les `input/select/textarea` de la modale |
| Éditeur, boutons **Réinitialiser** / **Appliquer** | y a-t-il quelque chose à appliquer ? | les articulations **et** la pose de référence | `poseSliderSignature3D` + comparaison de `S.personaEditorPoseKey` |

Les portées diffèrent réellement : l'éditeur n'a ni nom ni émotion, et la modale ne connaît pas la
notion de pose de référence. **Les unifier en un seul mécanisme détacherait l'éditeur de ce qu'il
écrit réellement** (`joints3d`, `position`, `positionLabel`) pour le lier à des widgets.

Ce qui EST commun, et ce qui a été mis en commun (Fix 62) : la **granularité**. Les deux comparent
désormais la pose telle que les curseurs l'affichent : degrés entiers. Côté modale par construction
(elle lit les valeurs des `input`), côté éditeur par `poseSliderSignature3D`, bâtie sur les mêmes
descripteurs `poseSliderSpecs3D`.

Cela a supprimé un seuil inventé : le Fix 61 comparait les radians avec une tolérance d'un
demi-degré, mesurée sur le pire écart d'arrondi (0.459°). Le seuil décrivait le symptôme ; comparer
les valeurs affichées supprime la cause.

⚠️ `recomputeModalDirty` se déclenche sur les événements `input`/`change`. Une écriture
**programmatique** dans `S.modalDraftJoints`, ce que fait « Appliquer », n'en émet aucun : il faut
alors appeler explicitement `syncJointSlidersFromDraft()` puis `recomputeModalDirty()`, sinon la
modale se croit inchangée.

⚠️ `captureModalSnapshot` / `recomputeModalDirty` n'ont **aucun test** à ce jour.

## Ce qui alimente les deux listes de poses

`S.poses` alimente **deux** interfaces, qui doivent rester d'accord :

- la section « Pose » de l'éditeur (`buildPersonaEditorPosesUI`) ;
- le `<select>` Position de la modale Personnage (`buildPersonaPositionOptions`), reconstruit à
  chaque ouverture de la modale via `setModalPoseOptionsBuilder`, car modals.js ne peut pas importer
  events.js sans créer un cycle.

Toute écriture dans la bibliothèque doit rafraîchir les deux, faute de quoi elles divergent.

## Poses proposées et poses de compatibilité

`POSITIONS` et `POSE_3D` ne contiennent plus la même chose, et **l'écart est délibéré**.

- `POSITIONS` : les poses **proposées**. Elle pilote le sélecteur de pose et le semis de la
  bibliothèque. Six entrées : debout, assis, allongé, course, accroupi, à genoux.
- `POSE_3D` : les **angles**. Elle en contient neuf de plus : combat, saut, vol, incantation, tir à
  l'arc, épée levée, vaincu, méditation, recul. Ces neuf ne sont plus offertes ni semées.

### Pourquoi les angles ne sont pas supprimés avec les entrées

Un Personnage créé puis jamais ouvert dans sa fiche garde `joints3d: null` : sa pose est **résolue à
l'affichage**, par `position` → bibliothèque → `POSE_3D`. Mesuré à la sonde :

| ce qu'on retire | ce qu'un Projet existant affiche |
|---|---|
| l'entrée de `POSITIONS` seule | **à l'identique**, `POSE_3D` répond encore |
| l'entrée **et** les angles | l'archer **se redresse** (rElbow 1,4 → 0,1) |

`POSE_3D` est donc le dernier recours, et il ne se vide pas. La table 2D `POSE_RENDERERS` (draw.js)
suit la même règle, pour la même raison.

### Ce que cela implique pour une bibliothèque déjà semée

Retirer une entrée de `POSITIONS` **ne la retire pas** d'un `settings.json` existant : la copie sur
disque fait autorité (cf. §« Semis »). Une bibliothèque déjà semée garde donc les poses retirées, et
c'est cohérent : ce sont devenues des entrées ordinaires, que l'utilisateur supprime lui-même s'il le
souhaite, une par une et de façon mémorisée (`dismissedPoses`). « Restaurer les poses de base » ne les
ramènera pas : il ne connaît que `POSITIONS`.
