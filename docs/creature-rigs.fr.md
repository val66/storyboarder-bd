# Rigs de créatures : plan du chantier

> **Fil directeur d'un chantier en cours**, pas une description de l'existant. Ce qui fonctionne
> aujourd'hui est décrit dans [imported-skeletons.fr.md](imported-skeletons.fr.md).
>
> À jour de la v1.4.48. Les étapes 1 à 3 et les tâches #363 à #373 et #376 sont livrées ; #374 et
> #375 restent à faire.

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
| centaur2 | 74 | un MEMBRE qui est lui-même un corps portant 4 pattes. A imposé la descente récursive (#368) |
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

## Trois hypothèses énoncées avec assurance, et démenties

Cette section existe pour qu'on ne les réessaie pas. Les trois ont été affirmées dans un message, un
commit ou ce document même, avant d'être mesurées.

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

**3. « L'humanoïde se détecte par les noms normalisés. »** Écrit dans ce document même, à la
section des archétypes. Mesuré emplacement par emplacement sur les dix-sept squelettes, les
emplacements clés corroborés par le NOM donnent : `maison` 5/7, `vroid-alt` 5/7, **oiseau 5/7**,
dragon 5/7. Le compte ne sépare pas un humanoïde d'un oiseau. Ce qui classe le mieux, ce sont les
NOMS DE CHAÎNES, et ils se trompent quatre fois sur dix-sept, cf. la section #366.

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

*La 6e convention de côté.* **Livrée, tâche #363.** Le rig CAT de 3ds Max écrit `CATRigLLeg1`,
`CATRigRArmCollarbone` : majuscule L ou R collée devant un mot de membre. Éprouvée sur les 21
modèles, soit 2866 os, **+57 côtés lus, 0 conflit**. Sans elle, centaur3 rend zéro membre latéral
sur 79 os ; avec elle, il se décompose entièrement, deux `Hub`, trois paires et la queue.

Trois choix de ce motif méritent d'être retenus, parce que deux d'entre eux sont contre-intuitifs :

- **une liste de mots, et non `[LR][A-Z][a-z]`.** Le motif générique mesure exactement pareil sur le
  corpus, +57 et 0 conflit. Il a été écarté parce qu'il ne doit ce score qu'à l'absence de
  contre-exemples : il lit `ARMature` comme une droite, `CTRLRoot` comme une gauche. Un critère qui
  ne tient que parce que ses contre-exemples manquent du corpus n'est pas un critère ;
- **aucune ancre de début**, alors que le motif en avait une au premier jet. La campagne de mutation
  a montré qu'elle ne faisait échouer aucun test ; en cherchant pourquoi, elle s'est révélée
  NUISIBLE et pas seulement inutile, refusant `SPRLArm`, `FLLeg`, `RigLWing`. Le fait qu'elle ait
  eu besoin d'une exception pour `CATRig` le disait déjà ;
- **consultée en dernier**, après les cinq autres, parce que c'est la moins sûre. Elle ne doit
  jamais contredire un `Left` explicite. C'est aussi le seul motif du fichier qui se lit sur le nom
  BRUT : les autres survivent au passage en minuscules, celui-ci n'a que la casse.

*Le vocabulaire anatomique.* **Livré, tâche #365**, `nomSuggereDeChaine3D`. Une table de mots avec
**priorité** : le mot qui identifie le membre l'emporte sur celui qui nomme l'articulation à sa
racine. `L_NECK_1 > L_NECK_2 > L_HEAD > L_JAW` donne « Tête », pas « Cou ». Couverture mesurée,
**198 chaînes sur 392, soit 51 %**, mais ce n'est pas un dégradé, c'est un interrupteur :

| donne des noms | ne donne rien |
|---|---|
| cerbère 7/7, centaure 4/4, centaure3 7/7, dragon 17/18, chien 12/17, oiseau 18/27 | araignée 0/16, kraken 0/9, raptor 0/6, serpent 0/1 |

Soit le modeleur a écrit `Thigh` et `Tail`, soit il a écrit `Bone.004_L.001` et `l101`. Aucune
astuce ne fera parler `Bone.004_L.001`, et l'écran de correspondance doit rester utilisable **sans
aucun nom proposé**.

Deux corrections mesurées y ont été faites, et la seconde a révélé autre chose :

- **le découpage en mots précède la recherche.** Chercher `\bleg\b` dans le nom brut ne voit rien
  dans `L_HEAD` (le souligné est un caractère de mot) ni dans `IKBackLeg` (la casse chameau n'a pas
  de séparateur). Deux causes opposées pour un même angle mort, qui coûtait les têtes du cerbère et
  les quatre pattes du chien. `motsDuNomDOs3D` normalise d'abord ;
- **les mots de patte sont des mots d'IDENTITÉ, pas de région.** Rangés d'abord dans les régions,
  lues à partir de la racine, ils perdaient contre `BackShoulder` chez le chien : quatre pattes
  proposées comme des bras. Un membre se nomme par ce qu'il est, jamais par son attache.

⚠️ **Et c'est ce test qui a démenti une affirmation de #364.** J'avais écrit que l'arrière-train de
centaure2 « n'est pas riggé ». Le vocabulaire proposait « Patte » là où j'attendais rien, parce que
la chaîne contient `UpperBackRightLeg`. Voir la limite ci-dessous.

## Descendre dans un membre (#368, faite)

`membresDuSquelette3D` **ne descendait jamais dans un membre**. Elle suivait le tronc depuis la
racine, et tout ce qui s'en détachait devenait une chaîne terminale, examinée par une seconde
fonction qui, elle, ignorait ses propres branches.

Sur centaure2, `LowerBody1` est une branche de `RootBone`, donc un membre. Elle porte pourtant les
quatre pattes du cheval, sabots compris et correctement latéralisées :

```
LowerBody1 > LowerBody2 > LowerBody3 > UpperBackRightLeg > … > LowerBackRightHoof
                                     > UpperBackLeftLeg  > …
           > UpperForeLeftLeg  > …
           > UpperForeRightLeg > …
```

Résultat avant correction : une chaîne de 7 os, et **neuf os de patte sur douze atteints par rien**.
Ce n'était pas un cas particulier : **un membre qui est lui-même un corps portant des membres était
invisible**, et c'est exactement ce qu'est un centaure.

**LA RÈGLE, ENCORE ÉLARGIE D'UN CRAN, ET C'EST TOUJOURS LA MÊME.** Est un membre une branche qui
porte **un côté que SA CHAÎNE n'a pas**.

- sur le tronc, qui n'a pas de côté, toute branche latéralisée en est un : c'est l'ancienne règle,
  mot pour mot, d'où l'absence de régression sur les humanoïdes ;
- dans un bras GAUCHE, une branche gauche de plus n'est qu'un doigt, elle continue la chaîne ;
- dans le corps du cheval, qui n'a pas de côté, une branche gauche est une patte.

Une seule fonction parcourt désormais le tronc et chaque membre, et la file se vide en largeur
d'abord.

**Ce que la mesure donne, et le rayon d'action est petit :**

| | avant | après |
|---|---|---|
| centaure2 | 3 membres, 9 os de patte perdus | 7 membres, **0 perdu**, les 4 pattes ancrées sur le corps |
| araignée | 16 | 30, les petites paires terminales de chaque segment apparaissent |
| oiseau | 27 | 31 | 
| unreal | 185 | 222, sous-chaînes faciales (mâchoire, nez, dents) |
| maison | 21 | 27 |
| **cerbère, kraken, serpent, dragon, chien, centaure, raptor, centaure3, mixamo, vrm, vroid** | | **inchangés** |

**Ce qui n'est PAS fait, et c'est délibéré.** Dans un membre, les branches délaissées restent
abandonnées, comme avant. Les rendre toutes ferait de chaque doigt d'un humanoïde un membre à part
et passerait le rig Unreal de 222 chaînes à 464. Question distincte, à trancher séparément si elle
se pose.

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
| **Serpentin** | `origine: 'topologie'`, sûre | serpent |
| **Radial** | `origine: 'topologie'`, sûre | kraken |
| **Arachnide** | `origine: 'topologie'`, sûre | araignée |
| **Humanoïde** | `origine: 'nom'`, PROPOSÉE | les 6 humanoïdes |
| **Quadrupède** | `origine: 'nom'`, proposée | loup, lézard, chien |
| **Quadrupède ailé** | `origine: 'nom'`, proposée | griffon. Aucun modèle importé |
| **Bipède ailé** | `origine: 'nom'`, proposée | oiseau intégré, wyverne (`desert_dragon.glb`) |
| **Bipède à queue** | `origine: 'nom'`, proposée | singe, raptor |
| **Centaure** | `origine: 'nom'`, proposée | centaur2, centaur3 |
| **Complexe** | refuge | tout rig inconnu |

⚠️ **L'HUMANOÏDE N'EST PAS DÉTECTÉ, contrairement à ce que ce document affirmait.** Mesuré
emplacement par emplacement, l'oiseau corrobore par le nom autant de slots clés que `maison` et
`vroid-alt`, et plus que le dragon : 5 sur 7 pour les trois. Le compte ne sépare pas. C'est la
troisième hypothèse de ce chantier démentie par la mesure, et elle est rangée avec les autres.

## Ce que `archetypeSuggere3D` donne, et où elle se trompe (#366, faite)

**13 fichiers sur 17 correctement proposés.** Les trois archétypes topologiques sont sûrs ; le reste
s'appuie sur les NOMS DE CHAÎNES, qui classent mieux que les emplacements : `Patte:2 Bras:2` pour
les six humanoïdes, `Patte:4` pour le chien, `Patte:2 Aile:2` pour la wyverne, `Patte:4 Bras:2`
pour deux centaures sur trois.

**Les quatre erreurs, avec leur cause, parce qu'elles justifient le mot « proposé » :**

| fichier | proposé | juste | cause |
|---|---|---|---|
| cerbère | humanoïde | quadrupède | pattes AVANT nommées `L Clavicle > L UpperArm > L Forearm` |
| oiseau | humanoïde | bipède ailé | ailes nommées comme des bras, même cause |
| raptor | humanoïde | bipède à queue | os nommés `Bone.034.L`, AUCUN nom ne dit rien |
| centaure1 | humanoïde | centaure | pattes avant de cheval nommées `lower_L_shoulder` |

Aucune de ces quatre ne porte `origine: 'topologie'`, et un test le garantit. C'est ce qui rend
l'erreur acceptable : l'écran affiche « à confirmer » sur tout ce qui n'est pas topologique.

Rattraper centaure1 par `bras >= 4` casserait le rig Unreal, qui en compte quatre aussi. **Pas de
règle sans contre-exemple, donc pas de règle.**

Un détail mesuré : le compte de noms ne retient que les chaînes d'au moins trois os. Sans ce filtre
le rig Unreal noie tout sous vingt « Visage » et seize « Œil ». Ce n'est pas un seuil d'importance
déguisé, c'est la longueur en dessous de laquelle le corpus ne contient plus que des cils et des
paupières.

**Trois branches ne sont couvertes par AUCUN fichier** et s'éprouvent sur des squelettes montés à la
main, ce que la campagne de mutation a révélé : le quadrupède ailé (le griffon n'a pas d'équivalent
importé), un squelette à une seule paire (qui ne doit pas passer pour un serpent), et une ancre
dissymétrique (trois chaînes à gauche, une à droite, ce qui fait UN rang et non trois).

**Les archétypes sont nommés par leur FORME, pas par l'espèce.** Un griffon et un dragon classique
ont la même forme, quatre pattes et deux ailes ; une wyverne n'en a que deux, et ne peut pas les
rejoindre. Les noms d'espèces vont dans l'aide, pas dans la taxonomie.

Note : le griffon a trois paires, comme le centaure. Topologiquement indiscernables, donc tous deux
dans le groupe « proposé ».

## Le filet mesurait une fiction (#370)

**Défaut signalé à l'usage, et le plus coûteux du chantier.** `labrador_dog.glb` sortait
« quadrupède » dans les tests et **« serpentin » dans l'application**.

**LA CAUSE.** Three NETTOIE les noms de nœuds au décodage
(`PropertyBinding.sanitizeNodeName`, appelé par `GLTFLoader.createUniqueName`) : les espaces
deviennent des soulignés, et `. : / [ ]` **disparaissent**. Les fixtures, elles, étaient extraites du
JSON BRUT du `.glb`. Elles décrivaient donc des noms que l'application ne voit jamais.

`Ear1.L_5` arrive sous la forme `Ear1L_5`, où plus aucun séparateur ne précède le `L` : `coteDuNom`
n'y lisait plus aucun côté.

| fichier | dans les tests | dans l'application |
|---|---|---|
| chien | quadrupède, 14 membres latéraux | **serpentin, 0** |
| dragon | bipède ailé, 14 | **serpentin, 0** |
| raptor | 4 | **serpentin, 0** |
| araignée | 28 | arachnide, mais **14** |

**DEUX CORRECTIONS, ET LA PREMIÈRE EST LA PLUS IMPORTANTE.**

*Les fixtures portent désormais le nom que l'application voit.* Le générateur nettoie comme Three,
et un test refuse toute fixture contenant encore un caractère réservé. Sans ça, la seconde
correction aurait été mesurée contre la même fiction.

*`coteDuNom` apprend deux formes de plus*, ce qui la porte à huit conventions : le `.L` de Blender
nettoyé (`Ear1L_5`, `IKBackLegL_45`) et la forme séparateur-lettre-chiffre (`Bone_L001`). Mesuré sur
les 3032 os du corpus nettoyé : **+408 côtés lus, 0 conflit**.

La garde du motif Blender est double, et les deux moitiés comptent : la lettre doit **suivre** une
minuscule ou un chiffre, ce qui écarte `MODEL_root` et `CTRL_x`, et **précéder** un souligné, un
chiffre ou la fin, ce qui écarte `PELVIS` et `SpineLower`.

**Le classement reste à 13 sur 17**, avec les mêmes quatre erreurs. Mais cette fois, il est mesuré
sur ce que le code voit.

**CE QUE ÇA APPREND, au-delà de ce fichier.** Une fixture est une réduction de la réalité, et la
question « réduction de QUOI » n'est pas rhétorique. Ces douze squelettes réduisaient le fichier sur
le disque, alors que le code, lui, lit une scène décodée. Deux réalités voisines, un seul caractère
d'écart, et trois créatures sur douze classées faux sans que 2000 tests ne bronchent.

## Les animaux intégrés se plient aux archétypes (#367, faite)

Décision de l'utilisateur : **les anciens rigs s'alignent sur les nouveaux archétypes, pas
l'inverse.**

**L'OISEAU A GAGNÉ SES PATTES.** Il n'avait qu'une tête, deux ailes et une queue, ce qui ne
correspond à aucun oiseau importé : `bird.glb` et la wyverne ont deux pattes ET deux ailes. Ses
pattes existaient à l'écran, mais comme deux cylindres statiques. Elles sont désormais articulées,
hanche et genou, avec la même emprise qu'avant (du bas du corps au sol) : un Projet d'avant rend
exactement pareil tant qu'aucun angle n'est réglé.

**LES IDENTIFIANTS SONT CEUX DU SINGE**, `hipFL`, `kneeFL`. Le `F` y veut dire « avant » et ne
signifie rien pour un bipède, mais ce sont des identifiants PERSISTÉS dans `animalJoints3d` : en
inventer un quatrième style coûterait plus que cette bizarrerie, qui ne s'affiche nulle part.
Ajouter est permis, renommer non.

**UN SEUL SENS EST ÉCRIT.** `ANIMAL_ARCHETYPES_3D` va de l'animal vers l'archétype, et
`animauxDeLArchetype3D` dérive l'inverse. Le champ `animal` que portait `ARCHETYPES_3D` a disparu :
il ne pouvait désigner qu'UN animal alors que le loup ET le lézard sont des quadrupèdes, et les deux
tables auraient fini par se contredire.

Cette fonction rend d'ailleurs une **liste**, pas un favori. Ma première version rendait « le
premier », ce qui désignait le lézard par le seul hasard de l'ordre d'`ANIMAL_TYPES`, alors que la
table de référence du quadrupède est celle du loup, la seule à porter un cou. **Laquelle sert de
modèle d'emplacements est une vraie question, qui se posera à l'étape des curseurs** ; la trancher
au détour d'un `find` l'aurait enterrée.

**UN TROU DE FILET COMBLÉ, ET IL DÉPASSAIT L'OISEAU.** `ANIMAL_JOINT_DEFS` et les constructeurs de
rig sont deux descriptions du même objet, et rien ne les tenait d'accord : un curseur déclaré sans
pivot correspondant s'affiche et ne fait rien, en silence. Un test croise désormais les deux listes
dans les deux sens, pour les cinq animaux.

## L'écran généré (#373, faite)

**Le rendu, en une phrase :** sous les dix-huit emplacements, une section « Membres » liste chaque
chaîne du squelette, repliée par os d'attache, avec sa case à cocher, son nom modifiable, l'origine
de ce nom et les os traversés. Les têtes du cerbère et les pattes de l'araignée y sont enfin.

Trois détails d'interface qui portent une décision :

- **le nom se retient à chaque frappe**, pas au `change`. Sans quoi taper un nom puis cliquer
  « Enregistrer » sans quitter le champ perdrait la saisie, et c'est le dernier champ qu'on touche ;
- **un nom effacé efface le CHOIX**, il n'enregistre pas une chaîne vide. Qui efface tout demande à
  revenir au nom proposé ; c'est la seule façon de revenir en arrière, aucun bouton ne ferait mieux ;
- **une chaîne décochée reste visible, estompée.** La faire disparaître empêcherait de la retrouver
  pour la recocher, ce qui est le geste le plus probable après une erreur.

La section a sa PROPRE hauteur maximale, séparée de celle des emplacements : les trente chaînes de
l'araignée ne doivent pas repousser le bassin hors de vue. Deux ascenseurs valent mieux qu'un seul
qui mélange deux sujets.

Le manuel a dû être SCINDÉ : « Modèles articulés » dépassait le plafond de 2000 caractères par
section, et une huitième tentative de raboter aurait produit des phrases creuses. « Tableau de
correspondance » est désormais sa propre section.

### Le modèle, sous le rendu (#373a)

**Signalé à l'usage :** l'écran de correspondance affiche dix-huit lignes humanoïdes et rien d'autre.
Sur un cerbère on ne voit pas ses deux têtes latérales, sur une araignée pas ses pattes
surnuméraires. La reconnaissance les trouve toutes ; c'est l'ÉCRAN qui n'a pas de case pour elles.

`lignesDeCorrespondance3D` rend ce que l'écran doit montrer, sans toucher au DOM :
`{ tronc, groupes }`, chaque groupe rassemblant les chaînes qui partent du MÊME os.

| fichier | ce que l'écran montrera |
|---|---|
| cerbère | `Patte G`, `Patte D`, `Queue`, **`Tête G`, `Tête D`**, `Bras G`, `Bras D` |
| centaure2 | les **quatre pattes du cheval**, ancrées sur le corps et non sur le tronc |
| araignée | 30 chaînes sur **9 ancres**, toutes décochables |
| mixamo | 2 ancres, 4 membres, rien d'inventé |

**ELLE NE REMPLACE PAS LES DIX-HUIT EMPLACEMENTS**, elle s'y ajoute. Ce sont eux qui pilotent le rig
aujourd'hui, et les remplacer d'un coup casserait tout modèle déjà posé. Les deux vivront côte à
côte tant que les poignées (#374) n'auront pas appris à venir d'ici.

**Trois sources pour le nom, la première qui répond gagne :** `manuel` ce que l'utilisateur a tapé,
`nom` ce que le vocabulaire tire des os, `structure` le descripteur neutre « gauche, 7 os » pour les
quatre fichiers qui ne nomment rien.

**Le côté est COLLÉ au nom**, pas seulement rangé dans un champ : sans lui le cerbère afficherait
deux lignes « Patte » identiques, et le champ qu'on édite doit se distinguer seul.

**`retenu` vaut vrai par défaut**, seul un `false` enregistré retire une chaîne. C'est le contrat de
tout cet écran, proposer sans décider.

Les choix vont dans le fichier de correspondances sous la clé `membres`, troisième AJOUT après `os`
et `morphologie`, mêmes règles : la version du format ne bouge pas, et **seul le choix humain est
écrit**. Une ligne sans nom tapé ni décochage n'apprend rien et n'est pas enregistrée.

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

**#364, les fixtures. FAITE.** Raptor et les trois centaures épinglés, et chaque os porte désormais
sa **position de repos** en monde, `t: [x, y, z]`, à précision relative. Une position est une donnée
de test, pas une donnée persistée : elle n'entre dans aucun fichier de Projet.

L'extraction est devenue un outil, `tools/make-skeleton-fixture.mjs`, parce que reprendre douze
fichiers à la main finit toujours par en faire diverger un. Il **préserve** le champ `origine`,
écrit à la main et absent du `.glb`, et il **refuse** de réécrire une fixture dont il ne retrouve
pas la source exacte, os par os : les `.glb` ne sont pas versionnés, donc un fichier du même nom
n'est pas forcément le même fichier.

⚠️ **Deux fixtures n'ont pas de positions**, `mixamo` et `vroid-alt`, dont les `.glb` ne sont plus
dans le dossier de l'utilisateur. Le refus ci-dessus a joué, et c'est le bon comportement. Sans
conséquence pour l'instant : ce sont deux humanoïdes, reconnus par le nom.

**#365, le vocabulaire de nommage. FAITE.** Table de priorité, découpage en mots, 51 % de
couverture mesurée. Le défaut connu est corrigé : `CATRigLLeg1` sort « Patte ».

**#368, descendre dans un membre. FAITE.** Cf. la section dédiée ci-dessus.

**#366, les tables d'archétypes. FAITE**, `ARCHETYPES_3D`, `signatureDuSquelette3D` et
`archetypeSuggere3D`.

**#369, le sélecteur de morphologie. FAITE.** Une ligne en haut de l'écran de correspondance, avec
son étiquette d'origine : `forme` quand la topologie tranche, `à confirmer` sinon, `votre choix`
quand vous avez tranché. NON BLOQUANTE, décision de l'utilisateur : l'import ne s'interrompt jamais,
et l'étiquette reste visible à chaque réouverture.

Le choix se range à côté de `os` dans le fichier de correspondances, sous la clé `morphologie`. Deux
règles reprises telles quelles de l'existant : c'est un **AJOUT**, donc `SKELETON_MAP_FORMAT` ne
bouge pas (le passer à 2 ferait rejeter le fichier entier par une version antérieure) ; et **seul le
choix HUMAIN est écrit**, jamais la proposition, sans quoi toute amélioration future du classement
trouverait une morphologie « enregistrée » sur chaque fichier jamais touché.

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
