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
