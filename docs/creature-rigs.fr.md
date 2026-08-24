# Rigs de créatures : plan du chantier

> **Fil directeur d'un chantier en cours**, pas une description de l'existant. Ce qui fonctionne
> aujourd'hui est décrit dans [imported-skeletons.fr.md](imported-skeletons.fr.md).
>
> À jour de la v1.4.30.

## Où l'on en est

La reconnaissance d'un squelette importé ([skeleton-map.js](../src/skeleton-map.js)) a été écrite
pour des humanoïdes, et le dit. Elle repose sur une règle qui tient : la **paire latérale**, un
couple gauche/droite au même niveau. Cette règle ne se déclenche que deux fois, au bassin pour les
jambes et à la poitrine pour les bras.

Face à une créature, elle ne se contente pas d'échouer, elle **se trompe** : elle remplit ses
dix-huit emplacements avec ce qu'elle trouve. Sur un cerbère, `tete` reçoit une patte avant et les
bras reçoivent les deux têtes latérales.

L'étape 1 est faite. Les cinq suivantes sont ouvertes, dans l'ordre où elles se conditionnent.

## Le corpus

Huit créatures réelles, réduites à leur hiérarchie d'os dans `tests/fixtures`, et épinglées par
`tests/skeleton-creatures.test.mjs` :

| fixture | os | ce qu'elle apporte |
|---|---|---|
| cerbère | 49 | trois têtes, quadrupède, queue. Le pire cas mesuré |
| araignée | 113 | quatre paires de pattes sur quatre segments de corps |
| kraken | 47 | symétrie radiale, huit tentacules, aucun bassin |
| serpent | 91 | chaîne pure, aucune paire latérale nulle part |
| dragon | 127 | wyverne, chaînes longues (patte : 9 segments), chaînes IK |
| centaure | 66 | riggé en bipède Mixamo malgré le corps de cheval |
| oiseau | 554 | ailes, pattes digitigrades, l'essentiel des os en plumes |
| chien | 53 | quadrupède ordinaire, pattes avant nommées `FrontUpperLeg` |

Les six squelettes humanoïdes de `tests/skeleton-map.test.mjs` sont la contrainte de
non-régression : ils ne doivent bouger d'aucune étape.

## Étape 1 : fixtures et mesure (faite)

Le filet, posé en v1.4.30. Chaque créature a son instantané, fautes comprises, avec en commentaire
ce qui est juste et ce qui ne l'est pas. Toute évolution se mesure contre ces huit fichiers.

Une seule correction de code y a été faite, parce qu'elle relevait du nom seul : `coteDuNom` lit
désormais `l101` / `r301`, la convention du kraken.

## Étape 2 : N chaînes au lieu de deux paires

Tâche #358. La reconnaissance rend une **liste de membres** au lieu d'une carte de dix-huit cases :
`{ ancre, côté, rang, segments }`. Toutes les paires latérales de chaque ancre, ordonnées le long
de l'axe de l'ancre pour que « patte 1 » soit l'avant. Puis les chaînes sans côté qui ne sont pas la
colonne : queue, têtes supplémentaires.

L'humanoïde devient un cas particulier, reconnu quand la forme correspond. C'est ce qui garantit la
non-régression.

Deux défauts mesurés relèvent de cette étape : la mauvaise tête chez le cerbère et le chien, causée
par la descente « branche la plus profonde », et `poitrine` qui reçoit un tentacule chez le kraken,
causée par « la colonne est la plus grosse branche restante ».

## Étape 3 : chaînes de longueur variable

Tâche #359. Un membre n'est plus trois emplacements mais N segments. Mesuré sur le dragon : patte
arrière 9 segments, queue 8, cou 7 en comptant mâchoire et langue.

Il faudra distinguer la **chaîne principale** de ses extrémités. Neuf curseurs par patte fois quatre
pattes est inutilisable, et un orteil ne mérite pas le même statut qu'un fémur.

## Étape 4 : écran de correspondance généré

Tâche #360. `SLOT_GROUPS` et `slotLabel` sont deux tables écrites à la main, et l'écran affiche
dix-huit lignes fixes. Les dériver de la liste de membres, avec des libellés engendrés.

## Étape 5 : curseurs et poignées

Tâche #361. `jointsDepuisOsMappes` fabrique les poignées cliquables depuis `POSE_HANDLES`, table
humanoïde. Pour qu'une cinquième patte soit atteignable sur l'aperçu, il faut les engendrer depuis
la correspondance.

## Étape 6 : poses par morphologie

Tâche #362. Une pose d'humanoïde n'a pas de sens sur une araignée. Le mécanisme existe déjà : les
poses portent un champ `skeleton`, et `personaEditorPoseList3D` filtre dessus. Ce qui manque est la
décision : **comment une morphologie est-elle identifiée**, pour qu'une pose de dragon ne soit pas
proposée à un kraken.

## Ce qui n'est pas au programme

Les **Animaux intégrés** (`ANIMAL_JOINT_DEFS`, cinq rigs procéduraux) et les modèles importés sont
aujourd'hui deux mondes séparés. Le modèle de chaînes génériques les réunirait naturellement, mais
c'est un choix à prendre, pas une conséquence. À trancher après l'étape 3.

La **cinématique inverse** n'est pas envisagée. Poser une patte au sol en tirant le pied demanderait
un solveur ; les curseurs par articulation restent le moyen, comme pour le Personnage.

## Ce que le corpus ne couvre pas

Aucune créature à **colonne bifurquée**, c'est-à-dire dont le tronc porterait deux torses. Le
centaure était censé l'apporter, son fichier est riggé en bipède. Un test le consigne pour qu'on
n'affirme jamais que le cas est couvert.

Aucun rig hors Sketchfab et VRM. La diversité de nommage est correcte (biped 3ds Max, Blender, Maya,
Mixamo), mais aucune convention Unity ou Unreal native n'est éprouvée sur une créature.
