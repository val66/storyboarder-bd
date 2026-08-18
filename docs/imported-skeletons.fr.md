# Squelettes importés — ce qui est mesuré, et ce qui reste à faire

*[English version](imported-skeletons.md)*

Ce document rassemble les MESURES faites sur les six fichiers `.glb` réels qui ont servi de banc
d'essai. Il existe parce que ce chantier est celui où j'ai le plus souvent supposé au lieu de
mesurer — et où deux de mes suppositions se sont révélées fausses.

Les fichiers eux-mêmes ne sont pas versionnés (22 Mo d'assets appartenant à l'utilisateur). Les
chiffres ci-dessous sont donc la seule trace de ce qu'ils contiennent.

---

## 1. Cinq conventions de nommage, aucune commune

| Fichier | Convention | Os |
|---|---|---|
| `worker_j.glb` | maison, nommée d'après l'ARTICULATION (`Left_leg` = la cuisse) | 109 |
| `hulk_-_sm_bnd.glb` | Unreal (`pelvis`, `clavicle_l`, `upperarm_l`, `thigh_l`, `calf_l`) | 1126 |
| `capoera.glb`, `female_pose.glb` | Mixamo (`mixamorig:`) | 65 |
| `anime_girl1.glb` | VRM (`J_Bip_C_Hips`) | — |
| `anime_girl2.glb` | maison, proche de VRoid | — |

**Le mot « leg » est irrémédiablement ambigu** : `mixamorig:LeftLeg` désigne le TIBIA, `Left_leg`
de `worker_j` désigne la CUISSE. C'est ce qui a imposé le partage des rôles de `skeleton-map.js` —
le nom pour le CÔTÉ, la structure pour le SEGMENT.

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
et jambes. **Aucune convention ne peut donc être supposée** — mais la direction se MESURE, os par
os, en lisant la position de l'enfant (qui est déjà exprimée dans le repère du parent).

> ⚠️ **Correction d'une note antérieure.** J'avais écrit, à l'étape Rigs A, que sur `anime_girl1`
> « les membres pointent selon +Y et la colonne selon −Z ». C'est faux : la colonne pointe elle
> aussi vers +Y. Cette affirmation confondait la ROTATION de repos d'un os avec sa DIRECTION vers
> son enfant — deux choses différentes. Elle a été recopiée telle quelle dans plusieurs
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

`anime_girl1` est le seul écart notable — environ 6°. Le modèle n'est pas dans une pose neutre
(bras dissymétriques), ce qui incline la ligne d'épaules. Utilisable, mais c'est le cas à
surveiller si une correction d'axes s'appuie sur ce repère.

---

## 5. Ce que cela permet, et ce qui reste ouvert

Les deux inconnues de l'étape « appliquer une pose à un squelette importé » sont donc **toutes
deux dérivables de la géométrie** :

1. l'axe le long de l'os — mesuré par la direction vers l'enfant ;
2. l'orientation du corps — mesurée par le repère ci-dessus.

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
celui d'un fichier importé. Aucun signe n'est donc écrit à la main — et c'est délibéré, chaque
signe écrit à la main étant un endroit où l'on peut se tromper sans que rien ne le signale. Un test
refuse d'ailleurs que le module mentionne le rig intégré par son nom.

### 6.1 Une mesure qui a changé le code : les clavicules confondues

Le repère du corps était d'abord dérivé de **quatre** os — bassin, tête et les deux clavicules.
Appliqué au Personnage intégré de l'application, il ne rendait rien du tout.

Raison, mesurée sur le rig réellement construit :

| Articulation | Position monde au repos |
|---|---|
| `hipGroup` | `(0, 0, 0)` |
| `headGroup` | `(0, 0,660, 0)` |
| `lClavicle` | `(0, 0,564, 0)` |
| `rClavicle` | `(0, 0,564, 0)` |

Les deux clavicules **pivotent au sternum** — ce qui est anatomiquement juste, une clavicule tournant
au niveau du sternum et ne portant l'épaule qu'à son extrémité. Leur différence est le vecteur nul,
et aucune direction latérale n'en sort.

`repereDuCorps` retombe donc sur les **bras**, latéralement séparés sur tout humanoïde. Les deux
paires pointent dans le même sens anatomique — de la droite du corps vers sa gauche —, donc le repère
obtenu est le même quelle que soit celle qui a servi. Tout fichier importé bâti de la même façon
profite du même repli.

### 6.2 La taille d'un modèle se mesure sur son corps

Deux fichiers sur six sortaient une taille absurde à l'import — `hulk_-_sm_bnd.glb` à **0,845 m**,
`worker_j.glb` à **9,433 m** — sans qu'aucun avertissement ne se déclenche.

La mesure prenait l'extension en **Y** de la boîte englobante, et se trompait deux fois :

| | ce qui était mesuré | pourquoi c'est faux |
|---|---|---|
| `hulk` | 0,845 m | mesure au décodage, **avant** la remise debout : c'est son épaisseur, sa taille est 2,374 m |
| `worker_j` | 9,433 m | la boîte englobe **tout le fichier**, katana compris |

La taille se mesure désormais sur les **os mappés**, projetés sur la verticale du corps — celle que
`repereDuCorps` dérive du squelette lui-même. Aucun axe n'est supposé, et un accessoire posé à côté
ne compte plus. Repli sur la boîte du maillage quand aucun squelette n'est reconnu : la même règle
que le cadrage, deux chemins qui ne se recouvrent jamais.

### 6.3 D'une pose du Personnage aux angles des os

`src/pose-bridge.js` est le seul endroit où les deux vocabulaires de pose se rencontrent : les
*champs* du Personnage (`lElbow`, `lClavicleRotZ`) et les *emplacements* de la correspondance
(`avantbras_g`, `clavicule_g`).

Appliquer une pose de la bibliothèque **remplace** les réglages manuels — le comportement du
Personnage, conservé à l'identique volontairement. Le résultat est réécrit en trois angles par
emplacement, c'est-à-dire exactement `skeletonPose3d` : la pose appliquée apparaît donc dans les
curseurs, reste retouchable, et n'ajoute aucun champ persisté, donc aucune migration.

### 6.4 Un maillage que le fichier place hors du corps

Signalé à l'usage sur `worker_j.glb` : un gros objet noir flotte très au-dessus du personnage dans
la Case, et paraît « se décrocher » quand on redimensionne l'Élément.

**Ce qui a été mesuré**, directement dans le glTF, avant d'écrire une ligne de code :

| | boîte en monde, sur Y |
|---|---|
| corps, cheveux, chapeau, épées, armure | −0,3 → 41,8 |
| `Sheath_1_Outfit_0` (le fourreau) | **91,4 → 131,4** |

Le personnage mesure 33 unités : le fourreau flotte à trois fois sa hauteur.

**Deux hypothèses ont été réfutées avant celle-ci**, et les écrire évite de les reprendre :

1. *« aucun os ne le pilote »* — faux. Il est pesé à 100 % sur `Sheath_080`, enfant régulier de
   `Spine_010`. Et cette piste était de toute façon sans issue : GLTFLoader appelle
   `normalizeSkinWeights()`, qui remplace un vecteur de poids nul par `(1, 0, 0, 0)`. Après
   décodage, un maillage sans poids est indiscernable d'un maillage attaché au premier os — une
   détection lisant `skinWeight` ne peut jamais se déclencher (test « MESURE » dans
   `tests/glb-decoding.test.mjs`).
2. *« c'est le redimensionnement »* — faux, le symptôme est là sans redimensionner. Rien ne se
   décroche : le fourreau a toujours été là-haut. L'illusion vient d'un effet de **levier** — la
   mise à l'échelle est uniforme autour d'un centre calculé sur les os, donc un point trois fois
   plus loin se déplace trois fois plus à l'écran.

**Le critère retenu n'a pas de seuil** : un maillage est égaré s'il ne recoupe la boîte d'aucun
autre. Pas de distance maximale, pas de multiple de la hauteur du corps — « ne touche rien » est une
propriété du fichier, pas un réglage. Vérifié par lecture directe des six fichiers réels :

| fichier | maillages | égarés |
|---|---|---|
| `anime_girl1` | 20 | aucun |
| `anime_girl2` | 15 | aucun |
| `hulk_-_sm_bnd` | 12 | aucun |
| `worker_j` | 12 | `Sheath_1_Outfit_0` |
| `capoera`, `female_pose` | 1 | hors critère |

Ce masquage vaut aussi pour les BOÎTES : `expandBoxSkinAware3D` ignore un maillage dont la
visibilité propre est `false`. Ce n'est pas cosmétique — `placeRigCentered3D` déduit de cette boîte
l'échelle et le centre du rig posé dans une Case. Sur `worker_j` décodé, le fourreau la faisait
passer de z −18,5..6,1 à z −28,4..52,4 : un facteur 4,6 sur l'échelle, et un modèle qui atterrissait
à côté de sa Case. La visibilité du GROUPE n'est volontairement pas consultée — masquer un Élément
entier (« Invisible dans la scène 3D ») ne doit pas vider sa boîte, sous peine de le faire
réapparaître n'importe où.

Ces maillages sont **masqués**, jamais supprimés : la géométrie reste dans le clone, le fichier sur
le disque n'est pas touché, et la case « Afficher les morceaux détachés » de la fiche les rend. Le
champ persisté `afficherMaillagesEgares` n'est écrit que lorsqu'il vaut `true` — son absence
signifie « masqués », qui est le défaut.
