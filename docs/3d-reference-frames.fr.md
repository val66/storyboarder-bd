# Repères et coordonnées 3D

> Le socle pour lire `scene3d.js` et `rig3d.js`. Rien ici n'est arbitraire, mais rien n'est
> devinable non plus.

## Les constantes du monde

| Constante | Valeur | Ce qu'elle veut dire |
|---|---|---|
| `GROUND_Y_DEFAULT_3D` | `-3` | Hauteur du Sol. Sous le centre de la Case, pour que les Éléments semblent y reposer. |
| `WALL_PX_PER_UNIT_3D` | `40` | Taux de change px ↔ unités monde. Une Fenêtre de 60 px fait 1.5 unité. |
| `BUILD_WALL_DEFAULT_HEIGHT` | `3.0` | Hauteur d'un Mur créé par l'outil Construire. |
| `BUILD_WALL_THICKNESS_RATIO_3D` | `0.06` | Épaisseur d'un Mur = **6 % de sa propre hauteur**. Un Mur de 3.0 fait donc 0.18 d'épaisseur. |
| `PANEL_CAM_DEFAULT_DIST_3D` | `PANEL_CAM_REF_DIST_3D × 2.5` | Distance caméra par défaut. |
| `PANEL_SCENE_RENDER_MAX_PX` | `1400` | Plafond de résolution du rendu hors écran. Tout nouveau consommateur du renderer doit le respecter. |

## Deux systèmes de coordonnées, à ne pas confondre

**Canvas 2D** : `o.x`, `o.y`, `o.w`, `o.h`. Des pixels sur la planche. C'est ce que l'utilisateur
manipule à la souris, et ce que la boîte de sélection dessine.

**Monde 3D** : `o.wxFloor`, `o.wyFloor`, `o.wzFloor`, `o.realHeightFloor`, `o.realLenFloor`. Des
unités monde. **C'est la source de vérité pour le rendu 3D.**

Le piège : `o.y` d'un Élément est une coordonnée **canvas**, pas une hauteur. Convertir naïvement
`o.y` en Y monde donne un Élément qui flotte en l'air, c'est exactement ce qui arrivait aux Parois
avant le Fix 28. Pour les Éléments vus de dessus, `o.y` correspond à une **profondeur** (Z monde),
pas à une élévation.

## Orientation

```
rotY = atan2(-dz, dx)
```

d'où la direction dans le plan du sol : `(cos(rotY), -sin(rotY))`. Le signe négatif sur `dz` revient
souvent ; l'oublier retourne l'objet de 180°.

Pour un groupe Three.js tourné de `rotY`, l'axe local `+X` pointe vers la tangente et l'axe local
`+Z` vers la normale du chemin. Les deux conventions doivent coïncider entre un rig et le relief qui
l'entoure, sans quoi ils se croisent, comme constaté à 47° d'écart dans un coude.

## Les Éléments sans position propre

Une Parois aimantée à un Mur ou à un Tracé **n'a pas** de position monde utilisable : sa boîte 2D est
en coordonnées canvas vues de dessus, et ses `wxFloor`/`wzFloor` sont périmés. Sa position se calcule
à chaque rendu en marchant le long de son support :

- `wallAlongFrac` : position **le long** du support, de 0 à 1.
- `wallYFrac` : position **en hauteur**, de 0 à 1.

`wallYFrac` ne couvre pas toute la hauteur du support mais la **travée atteignable** :
`hauteur du mur − hauteur de la Parois`. La fraction 1 amène donc le *sommet* de la Parois au niveau
de la crête, et non sa base. Voir `wallOpeningWorldPosOnTracé3D`.

## Échelles des rigs

Un rig est construit à une taille de référence puis mis à l'échelle. Deux mécanismes coexistent :

- **`placeRigCentered3D`** : échelle **uniforme** calculée sur la hauteur cible. Convient à un
  Personnage ou un meuble.
- **`CHILD_DESIGN_SIZE_3D`** : taille nominale par type d'Élément, permettant une échelle
  **indépendante** en largeur et en hauteur. Obligatoire pour une Parois, qui doit remplir exactement
  le trou découpé pour elle.

Attention : `placeRigCentered3D` mesure la boîte englobante **après** rotation, ce qui rend une
échelle non uniforme incorrecte. C'est pourquoi les Parois sur Tracé ont leur propre placement.

## Le renderer partagé

Il n'y a **qu'un** `personaRenderer3D` (`rig3d.js`), hors écran, redimensionné à la demande par
`setSize()` puis recopié dans un canvas 2D via `drawImage`. Chaque consommateur redimensionne, rend,
copie ; il n'y a donc pas de contention, mais il ne faut pas supposer que sa taille est stable entre
deux appels.

`THREE.WebGLRenderer` ne peut pas être construit sous Node : tout ce qui appelle
`ensurePersonaScene3D()` est hors de portée des tests unitaires.
