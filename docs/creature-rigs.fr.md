# Rigs de créatures : plan du chantier

> **Fil directeur d'un chantier en cours**, pas une description de l'existant. Ce qui fonctionne
> aujourd'hui est décrit dans [imported-skeletons.fr.md](imported-skeletons.fr.md).
>
> À jour de la v1.4.33. Les étapes 1 à 3 sont livrées ; 363 à 367 sont ouvertes.

## Où l'on en est

La reconnaissance d'un squelette importé ([skeleton-map.js](../src/skeleton-map.js)) a été écrite
pour des humanoïdes, et le dit. Elle repose sur une règle qui tient : la **paire latérale**, un
couple gauche/droite au même niveau. Cette règle ne se déclenche que deux fois, au bassin pour les
jambes et à la poitrine pour les bras.

Face à une créature, elle ne se contente pas d'échouer, elle **se trompe** : elle remplit ses
dix-huit emplacements avec ce qu'elle trouve. Sur un cerbère, `tete` reçoit une patte avant et les
bras reçoivent les deux têtes latérales.

## Le corpus

Douze créatures riggées, réduites à leur hiérarchie d'os dans `tests/fixtures` et épinglées par
`tests/skeleton-creatures.test.mjs` :

| fixture | os | ce qu'elle apporte |
|---|---|---|
| cerbère | 49 | trois têtes, quadrupède, queue. Le pire cas mesuré |
| araignée | 113 | quatre paires de pattes sur quatre segments de corps |
| kraken | 47 | symétrie radiale, huit tentacules, aucun bassin |
| serpent | 91 | chaîne pure, aucune paire latérale nulle part |
| dragon | 127 | **wyverne**, deux pattes et deux ailes, chaînes IK |
| oiseau | 554 | ailes, pattes digitigrades, l'essentiel des os en plumes |
| chien | 53 | quadrupède ordinaire, pattes avant nommées `FrontUpperLeg` |
| raptor | 96 | bipède à tronc HORIZONTAL, queue de 14 os |
| centaure | 66 | riggé en bipède Mixamo malgré le corps de cheval |
| centaur1 | 130 | **colonne bifurquée**, trois paires, tronc explicite |
| centaur2 | 74 | arrière-train NON riggé, une seule paire dans le fichier |
| centaur3 | 79 | rig CAT 3ds Max, **deux `Hub`**, côté illisible sans la 6e convention |

Les six squelettes humanoïdes de `tests/skeleton-map.test.mjs` sont la contrainte de
non-régression : ils ne doivent bouger d'aucune étape.

**Trois fichiers fournis ne contiennent AUCUN rig** et ne comptent donc pas : `bison.glb`,
`gecko.glb`, `bed_bug.glb`. Pas de `skin`, pas d'os, rien à reconnaître. Le quadrupède ne repose en
réalité que sur le chien et le cerbère.

## Étape 1 : fixtures et mesure (faite)

Le filet, posé en v1.4.30. Chaque créature a son instantané, fautes comprises, avec en commentaire
ce qui est juste et ce qui ne l'est pas.

Une seule correction de code y a été faite, parce qu'elle relevait du nom seul : `coteDuNom` lit
désormais `l101` / `r301`, la convention du kraken.

## Étape 2 : N chaînes au lieu de deux paires (faite)

Tâche #358, livrée en v1.4.32. `membresDuSquelette3D` décompose un squelette en un **tronc** et des
**membres** `{ ancre, côté, rang, segments }`, sans présupposé de morphologie.

La règle est l'ancienne retournée. Le fichier savait que le nom est fiable pour le côté et pour lui
seul ; on en tirait « deux branches de côtés opposés forment une paire ». On en tire son complément,
qui vaut partout : **une branche qui porte un côté est un membre, une branche qui n'en porte pas
continue le tronc**.

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

## Étape 3 : trier les chaînes, et par qui (faite)

Tâche #359, livrée en v1.4.33, **sans une ligne de code de production**. Le problème est réel, 185
chaînes sur le rig Unreal et 27 sur l'oiseau, mais la mesure a dit que le code ne pouvait pas le
résoudre seul.

Un seul sous-ensemble s'identifie sans ambiguïté : les **échafaudages de rig**, `IK`, `Pole`,
`Target`, `neutral_bone`, `FX_`, `Socket`. 62 chaînes sur le corpus, aucune anatomique.

Le reste du bruit n'est pas du bruit : ce sont des cils, des lèvres, des mèches, des plumes. De
l'anatomie mineure, qu'aucune règle ne distingue d'une queue ou d'une oreille. **Ce n'est donc pas
au code de trancher, c'est à l'écran de correspondance.** Il propose les chaînes classées,
l'utilisateur coche celles qui l'intéressent.

## Deux hypothèses énoncées avec assurance, et démenties

Cette section existe pour qu'on ne les réessaie pas. Les deux ont été affirmées dans un message ou
dans un commit avant d'être mesurées.

**1. « La longueur sépare les vrais membres du bruit. »** Écrit dans le commit de l'étape 2, mesuré
sur un seul rig. Sur les treize squelettes, le recouvrement est total :

| | longueur |
|---|---|
| plus longue chaîne NON anatomique | 7 segments (une mèche de cheveux, rig VRM) |
| plus courte chaîne anatomique | 1 segment (chélicère d'araignée, brin musculaire du cou d'oiseau) |

**2. « L'angle tronc/membre postérieur sépare le bipède du quadrupède. »** Deux bandes semblaient
nettes, bipèdes 149 à 164°, quadrupèdes 87 à 102°. Puis le raptor est arrivé : **112° et 122°**,
pile dans le trou. C'est un bipède à tronc horizontal, et le critère ne mesurait pas « bipède », il
mesurait « tronc vertical ». Le repli sur le rapport de longueur postérieur/antérieur échoue aussi :
worker_j 2,51 et labrador 3,42, un bipède et un quadrupède dans le même ordre, pendant que Hulk sort
à 0,90.

**Conclusion : il n'existe, dans ce corpus, aucun critère géométrique qui sépare bipède de
quadrupède.** Ne pas le rechercher.

**Un effet de bord instructif :** le dragon sortait d'abord à 161°, donc bipède, ce qui est faux. La
chaîne mesurée était `Wing IK.L`, un échafaudage. Une fois les IK exclus, ses pattes donnent 48° et
89°. **Le filtre nommé de l'étape 3 est donc un prérequis au classement, pas un confort.**

## Ce que la mesure établit

**Par la topologie, quatre familles, et elles sont sûres :**

| famille | signature | corpus |
|---|---|---|
| serpentin | zéro paire latérale, le tronc est presque tout le squelette (86 os sur 91) | serpent |
| radial | plusieurs rangs de paires sur UNE SEULE ancre | kraken, 4 rangs |
| segmenté | quatre ancres consécutives ou plus, une paire chacune | araignée |
| tétrapode | deux ancres portant une paire | tout le reste |

**Humanoïde, quadrupède, oiseau et dragon ont exactement le même graphe.** Ce qui les sépare n'est
ni la structure ni la géométrie. C'est pour cela que ces archétypes-là sont *proposés* et non
*détectés*.

**Par le nom, deux acquis mesurés :**

*La 6e convention de côté.* Le rig CAT de 3ds Max écrit `CATRigLLeg1`, `CATRigRArmCollarbone` :
majuscule L ou R collée devant un mot de membre. Éprouvée sur les 21 modèles, soit 2866 os,
**+57 côtés lus, 0 conflit**. Sans elle, centaur3 rend zéro membre latéral sur 79 os ; avec elle, il
se décompose entièrement.

*Le vocabulaire anatomique.* Une table de mots avec **priorité** : le mot qui identifie le membre
l'emporte sur celui qui nomme l'articulation à sa racine. `L_NECK_1 > L_NECK_2 > L_HEAD > L_JAW`
donne « Tête », pas « Cou ». Couverture mesurée, 54 % des chaînes, mais ce n'est pas un dégradé,
c'est un interrupteur :

| donne des noms | ne donne rien |
|---|---|
| cerbère 7/7, centaure 4/4, oiseau 21/27, dragon 15/18, chien 10/17 | araignée 0/16, kraken 0/9, raptor 0/6, serpent 0/1, centaur2 0/3 |

Soit le modeleur a écrit `Thigh` et `Tail`, soit il a écrit `Bone.004_L.001` et `l101`. Aucune
astuce ne fera parler `Bone.004_L.001`.

## Les archétypes

**Les tables d'emplacements ne sont pas à inventer : elles existent déjà** dans `ANIMAL_JOINT_DEFS`,
écrites pour les cinq animaux intégrés bien avant qu'on sache en avoir besoin.

```
lezard    Tête | Patte AV-G | Patte AV-D | Patte AR-G | Patte AR-D | Queue
loup      Tête / Cou | Patte AV-G | Patte AV-D | Patte AR-G | Patte AR-D | Queue
griffon   Tête / Cou | 4 pattes | Aile gauche | Aile droite | Queue
oiseau    Tête | Aile gauche | Aile droite | Queue
singe     Tête / Cou | Jambe G | Jambe D | Bras gauche | Bras droit | Queue
```

Le loup EST la table du quadrupède. Le singe EST celle du bipède à queue, donc du raptor.

| archétype | reconnaissance | corpus |
|---|---|---|
| **Humanoïde** | automatique, par les noms normalisés | les 6 humanoïdes |
| **Serpentin** | automatique, topologie | serpent |
| **Radial** | automatique, topologie | kraken |
| **Arachnide** | automatique, topologie | araignée |
| **Quadrupède** | proposé | loup, lézard, chien, cerbère |
| **Quadrupède ailé** | proposé | griffon, dragon classique. Aucun modèle importé |
| **Bipède ailé** | proposé | oiseau, wyverne (`desert_dragon.glb`) |
| **Bipède à queue** | proposé | singe, raptor |
| **Centaure** | proposé | centaur1, centaur3 |
| **Complexe** | refuge | centaur2, `maison.glb`, tout rig inconnu |

**Les archétypes sont nommés par leur FORME, pas par l'espèce.** Un griffon et un dragon classique
ont la même forme, quatre pattes et deux ailes ; une wyverne n'en a que deux, et ne peut pas les
rejoindre. Les noms d'espèces vont dans l'aide, pas dans la taxonomie.

Note : le griffon a trois paires, comme le centaure. Topologiquement indiscernables, donc tous deux
dans le groupe « proposé ».

## Décisions prises avec l'utilisateur

Consignées pour n'être ni rediscutées ni oubliées.

1. **Repli par ancre** dans l'écran générique, pas de regroupement des paires gauche/droite : on
   préfère une liste plus longue et plus souple, quitte à corriger à l'usage.
2. **Chaque ligne se déplie** et rend un menu déroulant de TOUS les os du fichier, par segment,
   comme l'écran actuel. Le tronc garde ses quatre rôles nommés ; les segments d'un membre
   s'appellent « Segment 1 » à « Segment N », parce que le code ne peut pas savoir qu'un os est un
   tibia.
3. **L'étiquette « à confirmer » n'est PAS bloquante.** Elle reste visible dans la section Modèles
   et à la réouverture de la modale. Un import n'est jamais interrompu.
4. **Les animaux intégrés se plient aux archétypes, pas l'inverse.** L'oiseau intégré gagne des
   pattes.
5. **Les poses sont filtrées par archétype.** Elles restent à écrire ; `ANIMAL_JOINT_DEFS` fournit
   les butées d'articulation, mais **aucune pose nommée**.

## Ce qui reste à faire

**#363, la convention CAT.** Mesurée, indépendante de tout le reste. Point de départ.

**#364, les fixtures.** Épingler raptor et les trois centaures, et ajouter à toutes les fixtures la
**position de repos** de chaque os. Elles ne portent aujourd'hui que `{i, name, children}`,
délibérément, pour tester sans Three ; une position est une donnée de test, pas une donnée
persistée.

**#365, le vocabulaire de nommage.** Avec sa table de priorité. Défaut connu à corriger : sur
centaur3, les mots de doigt l'emportent sur les mots de patte, et `CATRigLLeg1` est proposé comme
« Bras ».

**#366, les tables d'archétypes**, extraites d'`ANIMAL_JOINT_DEFS`, et le sélecteur qui propose sans
décider.

**#367, l'alignement des animaux intégrés.** CONTRAINTE DURE : les `id` d'articulation (`wingL`,
`tail0`, `head`) sont persistés dans `animalJoints3d`, et les valeurs d'`ANIMAL_TYPES` sont
persistées comme type de l'Élément. **Les libellés sont libres, les identifiants ne le sont pas.**
Ajouter est permis, renommer est interdit (cf. [persisted-data.fr.md](persisted-data.fr.md)).

Puis l'écran généré, les poignées des membres surnuméraires, et les poses par morphologie
(anciennes #360 à #362), qui deviennent des conséquences une fois les archétypes en place.

## Ce qui n'est pas au programme

La **cinématique inverse**. Poser une patte au sol en tirant le pied demanderait un solveur ; les
curseurs par articulation restent le moyen, comme pour le Personnage.

## Ce que le corpus ne couvre pas

**La colonne bifurquée est désormais couverte**, par centaur1 et par centaur3, dont le tronc porte
littéralement deux `Hub` et deux colonnes. La ligne qui l'annonçait manquante a sauté.

Reste non couvert : aucun **quadrupède ailé** importé, le griffon n'a pas d'équivalent. Aucun
**insecte** riggé, `bed_bug.glb` étant sans os. Aucune convention **Unity** native éprouvée sur une
créature.

Et un cas qu'aucune reconnaissance ne rattrapera : **centaur2**, dont l'arrière-train n'est pas
riggé du tout. Ce n'est pas un défaut de la reconnaissance, c'est une absence dans le fichier.
