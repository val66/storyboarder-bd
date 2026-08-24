# Rigs de créatures : plan du chantier

> **Fil directeur d'un chantier en cours**, pas une description de l'existant. Ce qui fonctionne
> aujourd'hui est décrit dans [imported-skeletons.fr.md](imported-skeletons.fr.md).
>
> À jour de la v1.4.33.

## Où l'on en est

La reconnaissance d'un squelette importé ([skeleton-map.js](../src/skeleton-map.js)) a été écrite
pour des humanoïdes, et le dit. Elle repose sur une règle qui tient : la **paire latérale**, un
couple gauche/droite au même niveau. Cette règle ne se déclenche que deux fois, au bassin pour les
jambes et à la poitrine pour les bras.

Face à une créature, elle ne se contente pas d'échouer, elle **se trompe** : elle remplit ses
dix-huit emplacements avec ce qu'elle trouve. Sur un cerbère, `tete` reçoit une patte avant et les
bras reçoivent les deux têtes latérales.

Les étapes 1 et 2 sont faites. Les quatre suivantes sont ouvertes, dans l'ordre où elles se
conditionnent.

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

## Étape 2 : N chaînes au lieu de deux paires (faite)

Tâche #358, livrée en v1.4.32. `membresDuSquelette3D` décompose un squelette en un **tronc** et des
**membres** `{ ancre, côté, rang, segments }`, sans présupposé de morphologie.

La règle est l'ancienne retournée. Le fichier savait que le nom est fiable pour le côté et pour lui
seul ; on en tirait « deux branches de côtés opposés forment une paire ». On en tire son complément,
qui vaut partout : **une branche qui porte un côté est un membre, une branche qui n'en porte pas
continue le tronc**.

Ce que la mesure donne sur le corpus :

| | avant | après |
|---|---|---|
| cerbère | `tete` = une patte avant | tronc jusqu'à `Head`, 7 membres dont la queue et les 3 têtes |
| araignée | 2 pattes sur 8 | 8 pattes sur 4 ancres, plus 3 paires d'appendices buccaux |
| kraken | 0, puis 2 tentacules | 8 tentacules, 4 rangs sur une seule ancre |
| serpent | rien | un tronc de 86 os |
| dragon | patte tronquée à 3 os | patte 9, aile 7, queue 8 |
| mixamo, centaure | 18 emplacements | exactement 4 membres, rien d'inventé |

Elle NE FILTRE RIEN, et c'est délibéré. Sur le rig Unreal elle rend 185 membres, dont 131 de deux
os. Ce bruit est consigné plutôt qu'écarté par un seuil inventé.

⚠️ Ce commit concluait que « la longueur sépare nettement les vrais membres du bruit ». **C'était
faux**, et l'étape 3 l'a mesuré, cf. plus bas.

## Étape 3 : trier les chaînes, et par qui

Tâche #359. Le problème est réel : `membresDuSquelette3D` rend 185 chaînes sur le rig Unreal et 27
sur l'oiseau. Neuf curseurs par patte fois quatre pattes est inutilisable.

**L'HYPOTHÈSE DE DÉPART ÉTAIT FAUSSE, ET LA MESURE L'A DIT.** L'étape 2 concluait que la longueur
séparait les vrais membres du bruit. Mesuré sur les treize squelettes, le recouvrement est total :

| | longueur |
|---|---|
| plus longue chaîne NON anatomique | 7 segments (une mèche de cheveux, rig VRM) |
| plus courte chaîne anatomique | 1 segment (chélicère d'araignée, brin musculaire du cou d'oiseau) |

Aucun seuil ne peut trancher. En chercher un reviendrait à inventer un nombre, ce que ce dépôt
s'interdit.

**CE QUI SE NOMME, EN REVANCHE.** Un seul sous-ensemble s'identifie sans ambiguïté par le nom : les
**échafaudages de rig**, `IK`, `Pole`, `Target`, `neutral_bone`, `FX_`, `Socket`. 62 chaînes sur le
corpus, aucune anatomique. C'est le point de départ raisonnable, et le seul.

Le reste du bruit n'est pas du bruit : ce sont des cils, des lèvres, des mèches, des plumes. De
l'anatomie mineure, qu'aucune règle ne distingue d'une queue ou d'une oreille.

**D'OÙ LA CONSÉQUENCE, qui déplace l'étape 4 plutôt qu'elle ne la précède** : ce n'est pas au code de
trancher, c'est à l'écran de correspondance. Il propose les chaînes classées, l'utilisateur coche
celles qui l'intéressent. C'est exactement le contrat que la reconnaissance s'était fixé dès le
début, proposer sans décider, et il vaut ici plus qu'ailleurs.

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
