# Rendu 3D — les sources uniques

> Ce document existe parce que le **même bug est revenu cinq fois**. Pas cinq bugs qui se
> ressemblent : cinq occurrences d'une seule cause, deux bouts de code calculant la même valeur puis
> divergeant. Chaque correction a consisté à supprimer une duplication. Contourner l'une des
> fonctions listées ici, c'est en préparer une sixième.

## Le motif

Un Élément 3D est décrit à plusieurs endroits à la fois : la géométrie qui le dessine, le trou
découpé pour lui, sa boîte de sélection à l'écran, la cible de la caméra. Quand deux de ces endroits
recalculent sa position ou sa taille chacun de leur côté, ils s'accordent le jour où on les écrit —
puis l'un des deux évolue.

La divergence est particulièrement traître ici parce qu'elle est souvent **partielle** : le Fix 31b
donnait la bonne position horizontale et la mauvaise verticale, ce qui rendait le bug invisible
tant qu'on ne déplaçait pas l'Élément en hauteur.

## Les fonctions qui font autorité

| Question | Fonction | Fichier |
|---|---|---|
| Où est une Parois posée sur un Tracé mur ? | `wallOpeningWorldPosOnTracé3D` | `scene3d.js` |
| …et son **centre** (boîte, caméra) ? | `tracéOpeningWorldCenter3D` | `scene3d.js` |
| Quelle taille fait cette Parois ? | `tracéOpeningSize3D` | `scene3d.js` |
| Quelle hauteur fait un Tracé mur ? | `tracéWallHeight3D` | `scene3d.js` |
| Quelle épaisseur ? | `tracéWallThickness3D` | `scene3d.js` |
| Où est le trou à découper ? | `tracéOpeningHole3D` | `scene3d.js` |
| Point + tangente sur un Tracé | `tracéFrameAtFrac3D` | `scene3d.js` |
| Épaisseur d'un Mur de l'outil Construire | `BUILD_WALL_THICKNESS_RATIO_3D` | `constants.js` |

**Aucune de ces valeurs ne se recalcule à la main.** Si une formule est nécessaire ailleurs, on
appelle la fonction ; si elle ne convient pas, on la modifie — au seul endroit où elle vit.

## L'historique, pour que le motif soit reconnaissable

**Fix 28** — la marche le long du chemin n'existait que dans le renderer. La caméra retombait sur les
coordonnées stockées, périmées, et centrait ailleurs. → extraction de
`wallOpeningWorldPosOnTracé3D`.

**Fix 30** — la travée verticale a été réduite (hauteur du mur moins celle de la Parois) dans le
placement du rig, mais pas dans le découpage du trou. Monter la Fenêtre la désolidarisait de son
trou.

**Fix 31** — le trou était dimensionné depuis `o.w`/`o.h`, le rig par une échelle **uniforme**
calculée sur la seule hauteur : `o.w` était purement ignoré, la Fenêtre n'était jamais aussi large
que son trou. → `tracéOpeningSize3D` et `tracéOpeningRigScale3D`.

**Fix 31b** — trois copies privées de la même marche (centre de la boîte de rendu, taille de la
boîte, test de visibilité), toutes restées sur l'ancienne formule verticale. Dérive nulle en bas du
mur, une hauteur de Fenêtre entière en haut.

**Fix 33** — la hauteur par défaut d'un Tracé mur était réécrite à **sept** endroits, dont quatre
avec `0.50` en dur. Changer la valeur dans la table aurait fait découper le trou contre 1.00 pendant
que le mur était bâti contre 0.50. → `tracéWallHeight3D`.

Et un cas voisin hors 3D, même mécanique : la version de l'application vit dans quatre fichiers
(`package.json`, `src/version.js`, les deux README) ; c'est `tools/bump-version.mjs` qui les tient
d'accord, et `tests/version.test.mjs` qui l'exige.

## Comment on trouve ces bugs

Deux réflexes, éprouvés :

**Mesurer avant de corriger.** Écrire un script jetable qui importe les vrais modules (avec
`tests/helpers/dom-stub.mjs`) et affiche les chiffres. Le Fix 31b a été localisé par un tableau de
dix lignes montrant la dérive croître avec `wallYFrac` — pas par lecture du code. Plusieurs
hypothèses plausibles se sont révélées fausses à ce stade, ce qui a évité autant de corrections
inutiles.

**Le test par mutation.** Casser volontairement le code corrigé et vérifier que la suite le
rattrape. Si une mutation passe, c'est que la logique n'est pas observable : il faut l'extraire en
fonction pure exportée. C'est ainsi qu'ont été créées la plupart des fonctions du tableau ci-dessus.

## Les invariants verrouillés par les tests

`tests/scene3d.test.mjs` contient une suite d'**invariants** qui balaie les deux fractions sur trois
formes de muret (droit, coudé, boucle) et vérifie que le trou, la Parois, la boîte de rendu, la
caméra et le tableau désignent tous le même endroit. C'est cette suite qui a révélé la dernière
incohérence de tangente — les tests unitaires, pris un à un, ne la voyaient pas.

Quand on ajoute une valeur dérivée d'une autre, l'ajouter aussi à ces invariants.
