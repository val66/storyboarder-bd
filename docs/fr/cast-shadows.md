# Les ombres portées — mesuré avant d'être décidé, septembre 2026

*[English version](../en/cast-shadows.md)*

Chantier #422. Rien ne projette d'ombre aujourd'hui : `renderer.shadowMap` n'est touché nulle part,
et il vaut `false` par défaut. Les deux notes d'éclairage citaient les ombres comme hors périmètre,
avec la même raison — « c'est une question de performance à part entière, à traiter avec des mesures
et non en passant ». #420f a levé le blocage ; cette note écrit ce que les mesures ont donné, et les
deux décisions qu'elles ne pouvaient pas prendre.

## Ce qui a été mesuré, et avec quel instrument

Même instrument que la septième campagne de performance, et pour la même raison : le rendu d'une
Case est du WebGL, que ni Node ni une sonde 2D ne peuvent approcher. Vrai navigateur, vrai GPU, le
three.js r128 du dépôt, scène reproduisant une Case — 52 maillages, 14 matériaux, le Sol —, cible de
rendu hors écran, `readPixels` pour synchroniser, et un témoin vérifié avant de croire le moindre
chiffre. Le détail du dispositif et des trois instruments qui ont menti avant lui est dans
[la note de performance](rendering-performance.md), § « Refaire la mesure ».

### Le coût par image

| configuration | ms |
|---|---|
| aucune ombre, 0 source — **l'application d'aujourd'hui** | 0,7 |
| aucune ombre, 8 sources | 0,9 |
| **le soleil seul**, carte 1024 cadrée sur la Case | **1,0** |
| le soleil seul, carte 2048 | 0,9 |
| 1 source à ombre, cube 512 | 1,2 |
| 3 sources à ombre | 2,0 |
| **8 sources à ombre**, cube 512 | **3,9** |
| 8 sources à ombre, cube 1024 | 4,4 |
| 8 sources + le soleil, tous à ombre | 4,4 |

**L'ombre du soleil est quasi gratuite, et sa résolution l'est tout à fait.** 1024 et 2048 donnent le
même temps : doubler la finesse d'une carte d'ombre ne se paie pas ici. C'est un résultat utile, et
contre-intuitif — on s'attend à choisir entre qualité et vitesse, et il n'y a pas de choix à faire.

**Une source qui projette coûte en revanche cher, et c'est de la géométrie, pas du hasard.** Une
ombre de source ponctuelle est une carte CUBIQUE : six passes de profondeur par lumière et par image.
Huit sources font quarante-huit passes, et les 3,9 ms qui en résultent sont un quart des 13 ms que
coûte une Case.

### Le coût unique, à la première rencontre

Chaque configuration rencontrée pour la première fois fait compiler les programmes GLSL de la Case.
`shadowMapEnabled` et `numPointLightShadows` entrent dans la clé de programme **à côté** de
`numPointLights` : les ombres n'augmentent pas ce coût d'un facteur, elles ouvrent un SECOND AXE.

| configuration | ms |
|---|---|
| 0 lumière, aucune ombre | 20 |
| **le soleil seul** | **153** |
| 3 sources + 3 ombres | 674 |
| **8 sources + 8 ombres** | **2 004** |

Les repères du dépôt : une Case coûte 13 ms de médiane à rendre, le pire à-coup jamais observé est
de 296 ms (#411), et le plafond de huit sources de #420f a été fixé pour rester dessous.

**Deux secondes d'application figée**, c'est sept fois ce pire cas. C'est le chiffre qui a écarté
l'idée d'allumer les ombres sur toutes les sources.

## ⚠️ LA DÉCOUVERTE QUI GOUVERNE TOUT LE RESTE : le Sol fait 12 000 unités

`GROUND_PLANE_SIZE_3D` vaut 12000, avec son commentaire d'origine — « très grand par rapport à la
distance de caméra, pour qu'il paraisse infini ». Une ombre directionnelle est rendue depuis une
caméra ORTHOGRAPHIQUE dont il faut donner la boîte, et la tentation est de la faire couvrir ce
qu'elle éclaire.

Mesuré, en comptant les pixels qui changent entre une image sans ombre et la même avec :

| | pixels changés |
|---|---|
| ombre du soleil, boîte cadrée sur la Case (±6 unités) | **1,54 %** |
| ombre du soleil, boîte étirée au Sol (±6 000 unités) | **0,00 %** |
| ombre d'une source posée | 3,98 % |

**L'ombre disparaît entièrement.** 1024 texels étalés sur 12 000 unités font douze unités par texel ;
un Personnage d'1,75 m n'y projette pas même un texel. Ce n'est pas une perte de qualité, c'est une
absence totale d'effet — pour le prix complet des passes de profondeur.

La boîte d'ombre devra donc être **cadrée sur ce que la Case regarde**, pas sur le Sol. Ce n'est pas
un réglage de finesse à ajuster plus tard : c'est la différence entre une ombre et rien.

⚠️ **ET C'EST LE TÉMOIN QUI L'A TROUVÉ, PAS LE RAISONNEMENT.** La mesure de temps, seule, aurait
validé la version étirée : elle coûte exactement le même prix, puisque les passes ont bien lieu. Une
campagne qui ne mesure que la durée d'un travail ne dit jamais si ce travail SERT à quelque chose.

## Les deux décisions, et qui les a prises

### Qui projette : le soleil, et les sources sur demande

Tranché par l'utilisateur, devant les chiffres. Le soleil projette ; une source posée ne projette
que si on le lui demande, source par source, par une case décochée par défaut dans sa fiche.

Le coût n'est ainsi payé que par qui le réclame. ⚠️ **Mais l'à-coup revient, et il faut l'écrire
plutôt que de le découvrir** : chaque combinaison (nombre de sources, nombre d'ombres) rencontrée
pour la première fois ouvre sa propre compilation. Cocher la case d'une quatrième source peut donc
figer l'application une seconde, déclenché par une case à cocher plutôt que par un ajout d'Élément —
moins prévisible que l'à-coup de #420f, et à ce titre plus surprenant.

Le remède, s'il gêne, est celui que #420f nommait déjà : **précompiler au repos** plutôt que de
découvrir une configuration au moment où l'utilisateur clique.

### Par défaut : éteintes, et réglées par Case

Tranché par l'utilisateur, et c'est la règle du dépôt appliquée telle quelle : **« pas de réglage »
vaut l'existant**. Une Case dessinée avant ce chantier garde son aspect au pixel près, comme le mode
Jour de #414 rend exactement l'éclairage d'avant #414, et comme le halo de #421f rend exactement
l'opacité d'avant #421f.

Allumer les ombres est donc un geste explicite, dans la section Lumière du menu de droite. Le coût
assumé est que la fonctionnalité ne se voit que si on la cherche ; le coût refusé était que toutes
les Planches finies de l'utilisateur changent sans qu'il l'ait demandé.

⚠️ **L'OPTION « ALLUMÉES SUR LES CASES NEUVES SEULEMENT » A ÉTÉ ÉCARTÉE**, et la raison mérite
d'être gardée : le défaut aurait alors dépendu de la DATE de création. Deux Cases identiques à
l'écran n'auraient pas eu le même réglage, et rien dans l'interface ne l'aurait expliqué. Le dépôt a
déjà refusé ce genre d'état à deux vitesses.

## Ce qui reste à trancher en construisant

**Le cadrage exact de la boîte d'ombre.** On sait qu'elle doit suivre la Case et non le Sol ; sa
taille précise se jugera à l'écran, comme l'intensité de départ d'une source en #420c. Une boîte trop
serrée coupe les ombres des Éléments proches du bord ; trop large, elle les rend floues. La caméra
d'une Case a une distance (`camDist`) et un cadrage connus : ils donneront le point de départ.

**La portée d'une source qui projette.** Une caméra d'ombre a besoin d'un plan éloigné fini. Une
source à portée nulle — « sans limite », le défaut de #420a — n'en a pas. Cocher « projette une
ombre » devra donc soit exiger une portée finie, soit en dériver une. C'est le point où la portée
exposée en #421 cesse d'être un confort pour devenir une nécessité technique, comme #420f l'avait
prévu.

**Le Sol reçoit-il ?** Il est `DoubleSide` et couvre tout : c'est lui qui rend une ombre lisible. Mais
`receiveShadow` sur un plan de 12 000 unités à 100 × 100 segments mérite d'être vérifié plutôt que
supposé.

**Ce que l'export en fait.** L'export passe par le même `drawContent`, donc par le même rendu : les
ombres devraient y être sans travail supplémentaire. « Devraient » est une inférence, et #425k a
montré ce qu'elles valent — à vérifier.

## Ce qui n'est PAS dans ce chantier

**Les ombres douces réglables.** `PCFSoftShadowMap` est le type retenu pour la mesure ; comparer les
trois types de Three.js à l'écran est un chantier d'aspect, pas de fonctionnalité.

**L'ombre d'une Bulle, ou de quoi que ce soit en 2D.** Les ombres portées ici sont celles de la scène
3D d'une Case. Le vocabulaire graphique des Bulles a ses propres axes (#425).

**Un réglage de résolution.** La mesure dit que 1024 et 2048 coûtent le même temps : exposer un
réglage qui ne change rien au prix et peu à l'œil ajouterait une commande sans décision derrière.
