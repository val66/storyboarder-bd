# Squelettes importés — ce qui est mesuré, et ce qui reste à faire

*[English version](imported-skeletons.md)*

Ce document rassemble les MESURES faites sur les six fichiers `.glb` réels qui ont servi de banc
d'essai. Il existe parce que ce chantier est celui où j'ai le plus souvent supposé au lieu de
mesurer, et où deux de mes suppositions se sont révélées fausses.

Les fichiers eux-mêmes ne sont pas versionnés (22 Mo d'assets appartenant à l'utilisateur). Les
chiffres ci-dessous sont donc la seule trace de ce qu'ils contiennent.

---

## 1. Sept conventions de nommage, aucune commune

| Fichier | Convention | Os |
|---|---|---|
| `worker_j.glb` | maison, nommée d'après l'ARTICULATION (`Left_leg` = la cuisse) | 109 |
| `hulk_-_sm_bnd.glb` | Unreal (`pelvis`, `clavicle_l`, `upperarm_l`, `thigh_l`, `calf_l`) | 1126 |
| `capoera.glb`, `female_pose.glb` | Mixamo (`mixamorig:`) | 65 |
| `anime_girl1.glb` | VRM (`J_Bip_C_Hips`) | — |
| `anime_girl2.glb` | maison, proche de VRoid | — |
| `kraken.glb` | Maya, lettre puis chiffre (`l101`, `r301`) | 47 |
| `centaur3.glb` | CAT de 3ds Max, majuscule collée (`CATRigLLeg1`) | 79 |

Les deux dernières lignes sont venues du chantier créatures
([creature-rigs.fr.md](creature-rigs.fr.md)) : elles ne changent que la lecture du CÔTÉ, jamais
celle du segment. Sans elles, ces deux fichiers rendaient **zéro membre latéral**.

**Le mot « leg » est irrémédiablement ambigu** : `mixamorig:LeftLeg` désigne le TIBIA, `Left_leg`
de `worker_j` désigne la CUISSE. C'est ce qui a imposé le partage des rôles de `skeleton-map.js` :
le nom pour le CÔTÉ, la structure pour le SEGMENT.

### 1.1 La boîte d'un modèle articulé, et les os périmés (#372)

**Signalé à l'usage : des modèles importés apparaissaient sous le sol.** Ce n'était ni le placement
ni l'aplomb, c'était l'ÉCHELLE, que `placeRigCentered3D` déduit de la boîte englobante.

`box3FromObjectSkinAware3D` interroge `bone.matrixWorld` pour chaque sommet. Or **un squelette n'est
pas un descendant du maillage qu'il déforme** : dans un glTF, c'est un frère sous la même racine. La
fonction ne faisait qu'un `updateWorldMatrix(true, false)` par nœud, qui met à jour les ancêtres et
le nœud lui-même ; un maillage visité avant les os les lisait donc périmés.

| fichier | boîte mesurée | boîte réelle | facteur |
|---|---|---|---|
| `cerberus.glb` | 0,05 × 0,05 × 0,09 | 4,52 × 4,66 × 8,53 | **90** |
| `snake.glb` | 2,14 × 0,11 × 0,09 | 7,36 × 0,37 × 0,32 | 3,4 |
| `spider.glb` | 1,84 × 2,11 × 0,48 | 2,28 × 0,59 × 2,61 | 1,3 |
| `labrador_dog.glb` | 1,35 × 2,78 × 5,44 | identique | 1 |

Le cerbère était donc agrandi **cent seize fois**. Le chien, seul modèle sain du lot, l'était parce
qu'il porte un maillage NON articulé dont le parcours mettait les matrices à jour au passage.

**DEUX FORMES DE MISE À JOUR NE RÉPARENT PAS, et toutes deux ont été essayées :**

- `updateWorldMatrix(true, true)` laisse le cerbère à 0,047. Ma première explication était fausse,
  je l'avais attribuée au parcours ; elle descend bel et bien dans tous les enfants. **La vraie
  cause est dans Three** : `SkinnedMesh` REDÉFINIT `updateMatrixWorld` pour recalculer
  `bindMatrixInverse` depuis `matrixWorld`, et ne redéfinit PAS `updateWorldMatrix`. Comme
  `boneTransform` termine par `applyMatrix4(this.bindMatrixInverse)`, cette matrice périmée fausse
  chaque sommet ;
- mettre à jour les OS seuls ne suffit pas non plus, pour une raison différente :
  `bone.updateMatrixWorld(true)` compose avec la matrice de son parent, elle-même périmée, et ne
  touche pas au `bindMatrixInverse` du maillage. Cerbère toujours à 0,05.

Seul `updateMatrixWorld(true)` depuis la racine du sous-arbre répare : 4,661.

⚠️ **CE QUI EST GARDÉ, ET CE QUI NE L'EST PAS.** Aucun montage ne sépare les trois formes, et
**quatre** ont été essayés : os frères du maillage, nœuds donnés par matrice, transformation
appliquée après le `bind`, et jusqu'à un `.glb` FABRIQUÉ décodé par le vrai chargeur. Ce qui les
sépare tient à la valeur de `bindMatrixInverse`, qu'un montage rend difficilement significative.

Le test épingle donc le **mécanisme** plutôt que le symptôme : il vérifie que `SkinnedMesh` redéfinit
`updateMatrixWorld` et pas `updateWorldMatrix`. Si une version de Three change cela, le test tombe,
et c'est ce qu'on veut, la raison d'écrire l'une plutôt que l'autre aura disparu.

---

## 2. Rotations de repos : 106 os sur 108 sont déjà tournés

Relevé des quaternions de repos des os mappés :

| Fichier | Os mappés | Repos = identité | Repos déjà tourné |
|---|---|---|---|
| `anime_girl1` | 18 | 0 | 18 |
| `anime_girl2` | 18 | 0 | 18 |
| `capoera` | 18 | 1 | 17 |
| `female_pose` | 18 | 1 | 17 |
| `hulk_-_sm_bnd` | 18 | 0 | 18 |
| `worker_j` | 18 | 0 | 18 |
| **total** | **108** | **2** | **106** |

C'est ce chiffre qui interdit d'écrire `bone.rotation.set(...)` comme pour les Animaux, et qui
impose la composition `repos ⊗ delta` de `src/skeleton-pose.js`.

---

## 3. Direction d'un os : dérivable, jamais universelle

Direction de chaque os mappé vers son enfant, exprimée dans SON repère local :

| Fichier | Axes dominants |
|---|---|
| `worker_j`, `capoera`, `female_pose`, `anime_girl1`, `anime_girl2` | `+Y` × 12 |
| `hulk_-_sm_bnd` | `+X` × 7, `−X` × 5 |

Le rig Unreal aligne ses os sur X, avec un signe qui s'inverse entre les deux côtés et entre bras
et jambes. **Aucune convention ne peut donc être supposée**, mais la direction se MESURE, os par
os, en lisant la position de l'enfant (qui est déjà exprimée dans le repère du parent).

> ⚠️ **Correction d'une note antérieure.** J'avais écrit, à l'étape Rigs A, que sur `anime_girl1`
> « les membres pointent selon +Y et la colonne selon −Z ». C'est faux : la colonne pointe elle
> aussi vers +Y. Cette affirmation confondait la ROTATION de repos d'un os avec sa DIRECTION vers
> son enfant, deux choses différentes. Elle a été recopiée telle quelle dans plusieurs
> commentaires avant d'être vérifiée.

---

## 4. Le repère du corps est dérivable, sans lire un seul nom

- **haut** = bassin → tête
- **droite** = clavicule droite → clavicule gauche
- **avant** = haut ∧ droite

| Fichier | haut | non-orthogonalité `haut·droite` |
|---|---|---|
| `anime_girl2` | `+Y` | 0,0000 |
| `capoera` | `+Y` | 0,0108 |
| `female_pose` | `+Y` | 0,0108 |
| `hulk_-_sm_bnd` | `+Z` | 0,0000 |
| `worker_j` | `+Z` | 0,0000 |
| `anime_girl1` | `+Y` | **0,1052** |

Deux axes verticaux différents cohabitent (`+Y` et `+Z`) : là encore, rien ne peut être supposé,
mais tout se mesure.

`anime_girl1` est le seul écart notable, environ 6°. Le modèle n'est pas dans une pose neutre
(bras dissymétriques), ce qui incline la ligne d'épaules. Utilisable, mais c'est le cas à
surveiller si une correction d'axes s'appuie sur ce repère.

---

## 5. Ce que cela permet, et ce qui reste ouvert

Les deux inconnues de l'étape « appliquer une pose à un squelette importé » sont donc **toutes
deux dérivables de la géométrie** :

1. l'axe le long de l'os, mesuré par la direction vers l'enfant ;
2. l'orientation du corps, mesurée par le repère ci-dessus.

Traduire « plier le coude vers l'avant » revient alors à exprimer l'axe de rotation voulu (celui du
corps) dans le repère LOCAL de l'os, via l'inverse de sa rotation de repos en monde.

**Ce qui reste ouvert** : une chaîne quasi rectiligne au repos (bras tendu) ne définit pas de plan
de flexion, donc rien ne dit de quel côté un coude « devrait » plier. Le repère du corps contourne
le problème pour les axes principaux, mais pas pour le sens de flexion d'une articulation dont le
fichier ne donne aucun indice. Ce point n'est pas résolu et ne doit pas être présenté comme tel.

---

## 6. Ce qui a été construit sur ces chiffres

`src/skeleton-retarget.js` traduit un geste d'un corps à l'autre en passant par le repère mesuré
ci-dessus, jamais par les axes bruts des os.

**Le rig intégré n'y est pas un cas particulier** : son repère est mesuré par la même fonction que
celui d'un fichier importé. Aucun signe n'est donc écrit à la main, et c'est délibéré, chaque
signe écrit à la main étant un endroit où l'on peut se tromper sans que rien ne le signale. Un test
refuse d'ailleurs que le module mentionne le rig intégré par son nom.

### 6.1 Une mesure qui a changé le code : les clavicules confondues

Le repère du corps était d'abord dérivé de **quatre** os : bassin, tête et les deux clavicules.
Appliqué au Personnage intégré de l'application, il ne rendait rien du tout.

Raison, mesurée sur le rig réellement construit :

| Articulation | Position monde au repos |
|---|---|
| `hipGroup` | `(0, 0, 0)` |
| `headGroup` | `(0, 0,660, 0)` |
| `lClavicle` | `(0, 0,564, 0)` |
| `rClavicle` | `(0, 0,564, 0)` |

Les deux clavicules **pivotent au sternum**, ce qui est anatomiquement juste, une clavicule tournant
au niveau du sternum et ne portant l'épaule qu'à son extrémité. Leur différence est le vecteur nul,
et aucune direction latérale n'en sort.

`repereDuCorps` retombe donc sur les **bras**, latéralement séparés sur tout humanoïde. Les deux
paires pointent dans le même sens anatomique (de la droite du corps vers sa gauche), donc le repère
obtenu est le même quelle que soit celle qui a servi. Tout fichier importé bâti de la même façon
profite du même repli.

### 6.2 La taille d'un modèle se mesure sur son corps

Deux fichiers sur six sortaient une taille absurde à l'import : `hulk_-_sm_bnd.glb` à **0,845 m**,
`worker_j.glb` à **9,433 m**, sans qu'aucun avertissement ne se déclenche.

La mesure prenait l'extension en **Y** de la boîte englobante, et se trompait deux fois :

| | ce qui était mesuré | pourquoi c'est faux |
|---|---|---|
| `hulk` | 0,845 m | mesure au décodage, **avant** la remise debout : c'est son épaisseur, sa taille est 2,374 m |
| `worker_j` | 9,433 m | la boîte englobe **tout le fichier**, katana compris |

La taille se mesure désormais sur les **os mappés**, projetés sur la verticale du corps, celle que
`repereDuCorps` dérive du squelette lui-même. Aucun axe n'est supposé, et un accessoire posé à côté
ne compte plus. Repli sur la boîte du maillage quand aucun squelette n'est reconnu : la même règle
que le cadrage, deux chemins qui ne se recouvrent jamais.

### 6.3 D'une pose du Personnage aux angles des os

`src/pose-bridge.js` est le seul endroit où les deux vocabulaires de pose se rencontrent : les
*champs* du Personnage (`lElbow`, `lClavicleRotZ`) et les *emplacements* de la correspondance
(`avantbras_g`, `clavicule_g`).

Appliquer une pose de la bibliothèque **remplace** les réglages manuels : le comportement du
Personnage, conservé à l'identique volontairement. Le résultat est réécrit en trois angles par
emplacement, c'est-à-dire exactement `skeletonPose3d` : la pose appliquée apparaît donc dans les
curseurs, reste retouchable, et n'ajoute aucun champ persisté, donc aucune migration.

⚠️ **Depuis #374, seuls les HUMANOÏDES la reçoivent.** Une créature ne récolte plus les dix-huit
emplacements mais ses chaînes ; « assis » ne trouverait donc aucun os. Rétablir les emplacements
pour que le geste « marche » n'aurait rien réparé : plier le « bras gauche » d'une araignée pliait
une de ses huit pattes. Les poses par morphologie sont la tâche #375.

### 6.3 bis La morphologie décide d'où viennent les curseurs (#374)

Elle décide aussi de ce que MONTRE l'écran de correspondance (#377) : un humanoïde y voit ses
dix-huit emplacements, une créature son tronc et ses chaînes, jamais les deux. Cet écran montre ce
qui pilote le rig, et rien d'autre ; changer le sélecteur échange les deux listes aussitôt.

Un fichier articulé a **deux jeux d'os pilotables possibles**, et un seul est actif à la fois :

| morphologie | curseurs et poignées | clé de pose |
|---|---|---|
| `humanoide` | les dix-huit emplacements, comme avant | `tete`, `avantbras_g`, … |
| tout le reste | le tronc et les chaînes cochées (#373) | `os:<nom de l'os>` |

C'est `groupesDeCurseurs3D` (`src/rig3d.js`) qui tranche, **une seule fois**, et la fiche, le rig et
les poignées l'appellent tous. Trois lecteurs qui trancheraient chacun de leur côté finiraient par
diverger, et la fiche montrerait les curseurs d'une morphologie pendant que le rig récolterait ceux
d'une autre.

⚠️ **Un os n'est récolté que sous une seule clé.** `applySkeletonPose` réécrit le quaternion de
chaque entrée récoltée ; deux entrées visant le même os se termineraient par « la dernière parcourue
gagne ». D'où une branche, jamais une union. Seule exception, le bassin d'un humanoïde : récolté
sans curseur, parce que `repereDuModeleImporte` a besoin de sa position.

Les os de tête de tronc, ceux qui portent la totalité des membres, n'ont pas de curseur. Critère
STRUCTUREL et non un pourcentage : la fraction du squelette entraînée décroît sans aucun trou où
couper (araignée 100, 99, 90, 67 % ; serpent 100, 99, 92, 91, 90 %), et n'importe quel seuil aurait
coupé le serpent en plein tronc. Cf. [creature-rigs.fr.md](creature-rigs.fr.md).

### 6.4 Le cadrage : ce qui est peint ET chaque poignée

Le cadrage de la fiche et de l'éditeur s'est fait sur les **os seuls** pendant une dizaine de
versions, pour une bonne raison : la boîte du maillage de `worker_j` était polluée par le fourreau
de son katana. Cette raison a disparu : ce maillage est détecté et masqué (§ 6.4 ci-dessous), et la
boîte l'ignore.

Or les os seuls ne suffisaient pas, et c'était mesurable. Le cadrage laisse 22 % de marge ; voici de
combien le maillage dépasse les os sur les fichiers réels :

| fichier | dépassement max | rogné ? |
|---|---|---|
| `hulk_-_sm_bnd` | 13 % | non, seul des trois sous la marge |
| `anime_girl1` | 24 % (en haut) | cheveux tout juste coupés |
| `worker_j` | 28 % (en haut) | sommet du crâne coupé |

Le cadre est désormais l'**union** des deux boîtes, et cette union n'est pas un compromis : elle est
la somme de deux exigences distinctes. Le maillage visible, parce qu'un modèle dont les cheveux
sortent du cadre est mal cadré. Les os mappés, parce que les poignées d'articulation sont dessinées
à leur position, et qu'une poignée hors champ ne se clique pas.

La **taille** de l'Élément, elle, continue de se mesurer sur les os seuls (§ 6.2). Cadrer et
dimensionner sont deux questions distinctes ; c'est leur confusion qui avait produit les défauts
des tâches #333 et #334.

### 6.5 Un maillage que le fichier place hors du corps

Signalé à l'usage sur `worker_j.glb` : un gros objet noir flotte très au-dessus du personnage dans
la Case, et paraît « se décrocher » quand on redimensionne l'Élément.

**Ce qui a été mesuré**, directement dans le glTF, avant d'écrire une ligne de code :

| | boîte en monde, sur Y |
|---|---|
| corps, cheveux, chapeau, épées, armure | −0,3 → 41,8 |
| `Sheath_1_Outfit_0` (le fourreau) | **91,4 → 131,4** |

Le personnage mesure 33 unités : le fourreau flotte à trois fois sa hauteur.

**Deux hypothèses ont été réfutées avant celle-ci**, et les écrire évite de les reprendre :

1. *« aucun os ne le pilote »* : faux. Il est pesé à 100 % sur `Sheath_080`, enfant régulier de
   `Spine_010`. Et cette piste était de toute façon sans issue : GLTFLoader appelle
   `normalizeSkinWeights()`, qui remplace un vecteur de poids nul par `(1, 0, 0, 0)`. Après
   décodage, un maillage sans poids est indiscernable d'un maillage attaché au premier os, et une
   détection lisant `skinWeight` ne peut jamais se déclencher (test « MESURE » dans
   `tests/glb-decoding.test.mjs`).
2. *« c'est le redimensionnement »* : faux, le symptôme est là sans redimensionner. Rien ne se
   décroche : le fourreau a toujours été là-haut. L'illusion vient d'un effet de **levier** : la
   mise à l'échelle est uniforme autour d'un centre calculé sur les os, donc un point trois fois
   plus loin se déplace trois fois plus à l'écran.

**Le critère retenu n'a pas de seuil** : un maillage est égaré s'il ne recoupe la boîte d'aucun
autre. Pas de distance maximale, pas de multiple de la hauteur du corps ; « ne touche rien » est une
propriété du fichier, pas un réglage. Vérifié par lecture directe des six fichiers réels :

| fichier | maillages | égarés |
|---|---|---|
| `anime_girl1` | 20 | aucun |
| `anime_girl2` | 15 | aucun |
| `hulk_-_sm_bnd` | 12 | aucun |
| `worker_j` | 12 | `Sheath_1_Outfit_0` |
| `capoera`, `female_pose` | 1 | hors critère |

Ce masquage vaut aussi pour les BOÎTES : `expandBoxSkinAware3D` ignore un maillage dont la
visibilité propre est `false`. Ce n'est pas cosmétique : `placeRigCentered3D` déduit de cette boîte
l'échelle et le centre du rig posé dans une Case. Sur `worker_j` décodé, le fourreau la faisait
passer de z −18,5..6,1 à z −28,4..52,4 : un facteur 4,6 sur l'échelle, et un modèle qui atterrissait
à côté de sa Case. La visibilité du GROUPE n'est volontairement pas consultée : masquer un Élément
entier (« Invisible dans la scène 3D ») ne doit pas vider sa boîte, sous peine de le faire
réapparaître n'importe où.

Ces maillages sont **masqués**, jamais supprimés : la géométrie reste dans le clone, le fichier sur
le disque n'est pas touché, et la case « Afficher les morceaux détachés » de la fiche les rend. Le
champ persisté `afficherMaillagesEgares` n'est écrit que lorsqu'il vaut `true`, et son absence
signifie « masqués », qui est le défaut.


## 7. Ce qui est vérifié, et ce qui ne peut l'être que manuellement

### 7.1 L'audit (tâche #310)

Onze modules composent ce chantier. Deux mesures ont été faites plutôt que supposées :

- **surface publique couverte** : sur l'ensemble de leurs exports, un seul n'est jamais nommé dans
  les tests : `loadedModelNames`, exercé indirectement par `figuresPosables` (rig3d.js). Un
  deuxième, `produitVectoriel`, n'était exporté que par inadvertance : il ne servait qu'à son
  propre fichier, et l'export a été retiré. Une surface publique que rien n'appelle est une surface
  que rien ne vérifie ;
- **campagnes de mutation** : chaque module en porte désormais le journal, dans son fichier de test.
  Les trois modules du cœur (`skeleton-pose`, `skeleton-retarget`, `pose-bridge`) n'en avaient
  aucun ; douze mutations y ont été jouées, onze rouges. La douzième était une garde REDONDANTE,
  corrigée dans le code et non dans les tests.

### 7.2 Ce que les tests ne peuvent pas dire

Aucun test de ce dépôt ne décode un vrai `.glb` de modélisateur. Le témoin versionné n'a ni texture,
ni matériau, ni extension, et les six fichiers d'essai pèsent 22 Mo qui appartiennent à
l'utilisateur. Surtout, **GLTFLoader ne décode pas ces fichiers sous Node** : leurs textures
réclament un environnement navigateur.

C'est une limite structurelle, pas un manque de zèle, et elle explique que TOUS les défauts sérieux
de ce chantier aient été trouvés à l'usage, jamais par la suite de tests :

| trouvé à l'usage | cause réelle |
|---|---|
| worker_j n'affiche que ses articulations | trois causes chaînées (repères mixtes, élimination par le tronc de vue, plans de coupe) |
| taille aberrante à l'import | la mesure, pas le seuil |
| un accessoire flotte au-dessus du personnage | géométrie de liaison incohérente dans le fichier |
| un modèle atterrit hors de sa Case | un geste de création oublié sur le troisième chemin |
| boîte de sélection trop large | rapport mesuré dans le repère du fichier, pas du corps |
| aperçu rogné en haut | cadrage sur les os seuls, marge insuffisante |

### 7.3 L'essai manuel, et ce qu'il doit couvrir

Sur chacun des six fichiers, en partant d'une Case VIDE :

1. importer le modèle : il doit apparaître centré, à une taille comparable à celle d'un Personnage ;
2. ouvrir sa fiche : l'aperçu doit le montrer en entier, cheveux et accessoires compris ;
3. lui appliquer une pose de la bibliothèque, puis retoucher un curseur : les deux doivent se voir ;
4. changer sa taille, le déplacer, le faire tourner ;
5. enregistrer, fermer, rouvrir le Projet : tout doit être exactement dans le même état.

Le point 5 est le plus important : c'est le seul qui exerce la forme persistée de bout en bout.

### 7.4 Deux conventions de « devant », et ce qu'elles imposent

Le Personnage intégré et un modèle importé ne regardent pas du même côté, et l'écart n'est écrit
nulle part dans les fichiers :

| | devant | conséquence |
|---|---|---|
| Personnage intégré | −Z | `rotY: Math.PI` à sa création dans une Case (events.js) |
| Modèle importé | +Z (les six fichiers d'essai) | `rotY: 0` à sa création (model-store.js) |

L'Éditeur de Personnage ouvrait sa caméra sur un demi-tour **fixe**. C'est ce qu'il faut au premier,
et c'est exactement ce qui retourne le second : tous les modèles importés s'ouvraient de dos.

**La règle est désormais mesurée** (`orbiteDeFace3D`, utils.js) : l'azimut d'ouverture est celui qui
place la caméra du côté du devant, lui-même dérivé du repère de corps du fichier
(`repereDuCorpsPourFichier3D`). Coder `0` en dur aurait suffi pour les six fichiers d'essai, et
laissé de dos le premier fichier exporté autrement.

⚠️ **La règle porte sur la CAUSE, pas sur le moment.** L'azimut se reprend **quand la figure
change**, ce qui arrive à deux endroits : l'ouverture de l'Éditeur, et le sélecteur « Modèle » de son
panneau droit. La première version ne traitait que l'ouverture : entrer sur le Personnage puis
choisir un modèle importé le montrait encore de dos. Une règle formulée sur le moment plutôt que sur
la cause laisse toujours un moment dehors.

Seul l'azimut est repris : l'élévation, le zoom et le déplacement ne dépendent pas de la figure, et
les remettre à neuf annulerait un cadrage que l'utilisateur vient de composer.

⚠️ **Deux pièges y sont consignés**, tous deux constatés et non supposés :

- `repereDuCorps().avant` pointe vers l'**arrière visuel**. C'est une dérivée géométrique
  (`avant = haut ∧ droite`), pas une lecture de ce qui est dessiné. Mesuré sur le Personnage, dont
  le devant est connu par construction ;
- `wrapAngle` ramène dans **[−π, π)** et non dans ]−π, π] comme l'annonce le commentaire qui
  l'accompagne : il envoie π sur −π. S'en servir pour normaliser cet azimut renverrait −π pour le
  Personnage, qui ne se compare plus à la constante existante.

⚠️ **La correction reste côté caméra.** Faire pivoter la figure de 180° remettrait ses axes de
travers vis-à-vis du monde, et le calcul de direction du glisser d'une poignée
(`projectModelAxisToScreen3D`) redeviendrait faux, c'est ce que le Fix 76 avait supprimé.

### 7.5 « Allongé » — un geste du corps entier, pas une articulation

`POSE_3D.allonge` est `debout` plus un drapeau `lieFlat`. Le Personnage intégré le consomme en
tournant son groupe RACINE (`J.root.rotation.z = π/2`). Le pont vers les os importés traduit des
angles **os par os** : un drapeau qui fait tourner le corps entier n'est pas un angle d'os, et il
tombait : le modèle restait debout.

**Le geste, mesuré** sur le rig intégré (repère du corps avant/après application de la pose) :

|  | droite | haut | avant |
|---|---|---|---|
| debout | (−1, 0, 0) | (0, 1, 0) | (0, 0, 1) |
| allongé | (0, −1, 0) | (−1, 0, 0) | (0, 0, 1) |

soit, dans le repère du corps : **droite → −haut, haut → droite, avant inchangé**. Un quart de tour
autour de l'axe *avant*, donc, exprimable dans n'importe quel corps, comme les angles le sont déjà.

⚠️ **On ne recopie pas `rotation.z = π/2`** : hulk est debout selon +Z, ce quart de tour le
coucherait de travers.

⚠️ **Une matrice, pas un axe-angle.** Le SIGNE de l'angle dépendrait de l'orientation du trièdre, et
`repereDuCorps` n'en garantit aucune : mesuré, celui du Personnage est **gaucher** (déterminant −1).
Construire la rotation depuis la correspondance ne demande aucun pari. Elle reste propre
(déterminant +1) dans les deux cas : la permutation signée est la même des deux côtés.

⚠️ **Le repère est lu sur la scène du CACHE, jamais sur le clone affiché.** Le clone porte déjà la
bascule quand elle est active : y relire le repère composerait la rotation une seconde fois à chaque
appel, et le modèle tournerait sur lui-même image après image.

**Un groupe de pose** (`poseGroup`) s'intercale entre `figureGroup` (qui porte l'orientation de
l'Élément) et le clone. Les écrire au même endroit ferait que l'une écraserait l'autre.

#### L'ÉCHELLE

`placeRigCentered3D` déduit le facteur de la hauteur de la boîte (`s = hauteurCible / size.y`).
Couché, un corps est bas et large : le facteur s'emballe. Le Personnage s'en protège par
`entry.deboutNaturalH`, mesuré **une fois à la construction** du rig ; un modèle importé ne peut pas
faire pareil : sa pose change sans que le rig soit reconstruit.

`hauteurDeboutModele3D` (scene3d.js) mesure donc **à chaque placement**, en neutralisant la bascule
le temps de la mesure, et rien d'autre.

⚠️ **La bascule ET la pose sont neutralisées**, la même règle que le Personnage. La taille d'un
Élément décrit sa **stature**, pas son encombrement à l'instant : un modèle accroupi est plus bas, et
sans cela son facteur d'échelle enflait d'autant.

Ce n'a pas toujours été le cas : la première version ne neutralisait que le couchage, ce qui laissait
l'incohérence sur toutes les autres poses. L'étendre **change la taille** des modèles importés déjà
posés autrement que debout dans les Projets existants, arbitré avec l'utilisateur, pas glissé dans
un correctif.

⚠️ **La pose est neutralisée sur place, pas relue ailleurs.** Mesurer la scène du cache serait plus
simple et serait faux : `boneTransform` lit `skeleton.boneMatrices`, qui ne sont calculées qu'**au
rendu**. Sur une scène jamais rendue, la boîte sensible au skinning décrit donc la géométrie de
liaison dans le repère du **fichier**, l'erreur qui a produit trois correctifs faux.

⚠️ **Même boîte que le placement**, passée en paramètre, pas une seconde mesure. Et l'échelle du rig
est remise à 1 avant de mesurer : la mesure a lieu AVANT `placeRigCentered3D`, donc le rig porte
encore l'échelle de l'image précédente.

### 7.6 Trois fabricants d'Élément temporaire, trois occasions de perdre un champ

Le rig d'un modèle importé est construit par **une** fonction, mais alimenté depuis **trois** endroits :

| | l'Élément vient de |
|---|---|
| la Case | l'Élément réel du Projet |
| l'aperçu de la fiche | un Élément TEMPORAIRE (`drawObjectPreview`) |
| l'Éditeur | un autre Élément TEMPORAIRE (`dessinerModeleDansEditeur`) |

Les deux derniers recopient les champs **un à un**. Cette énumération est juste le jour où on l'écrit
et prend du retard à chaque champ ajouté ailleurs. Ont déjà été perdus :

- `maillagesEgares` (dans `buildPropRig3D`) : masquage écrit et testé, sans effet **deux versions
  durant** ;
- `afficherMaillagesEgares` : transmis par l'appelant, jamais recopié : cocher la case ne changeait
  rien à l'aperçu ;
- `joints3d` et `position` : sans l'**intention**, « allongé » restait invisible dans l'aperçu et
  dans l'Éditeur, alors que la Case couchait bien le modèle.

⚠️ **La distinction qui compte** : `skeletonPose3d` porte des angles d'**os**, le RÉSULTAT.
Ce qui se joue au niveau du **corps** (« allongé », qui bascule la figure entière) ne voyage que dans
l'INTENTION. Transmettre l'un sans l'autre donne un aperçu qui montre les bonnes articulations sur un
corps mal orienté.

Un test **dérive** désormais la liste au lieu de la réciter : il relit les champs que
`ensureObjectRigEntry3D` lit sur son Élément et exige que chacun arrive, sauf exclusions justifiées
(identifiant de rig propre à l'aperçu, taille simulée par la caméra). ⚠️ Les lectures **indirectes**
ne se dérivent pas : `getEffectiveJoints(o)` lit `joints3d` et `position` sans que le rig les nomme,
et sont donc ajoutées explicitement. C'est précisément ce trou qui avait laissé passer `joints3d`.
