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

### Deux interrupteurs, et ils sont hiérarchiques (#422d)

La Case décide qu'il Y A des ombres ; la source décide si ELLE y participe. La case « projette une
ombre » vit dans la section « Luminosité » de la fiche d'une Lumière, **sous la portée**, dont elle
dépend techniquement.

⚠️ **COCHÉE SUR UNE CASE SANS OMBRES, ELLE NE FAIT RIEN**, et un indice sous elle le dit. Un réglage
qui ne produit aucun effet visible et n'explique pas pourquoi se lit comme une panne : c'est la
leçon de #420f, où une portée de 0 signifiait « sans limite » et non « éteinte » sans qu'aucune
étiquette ne le dise.

⚠️ **ET LES DEUX DRAPEAUX DU RENDU NE SONT PAS LE MÊME.** `shadowMap.enabled` appartient au
renderer — il y a des ombres dans cette Case —, `castShadow` à chaque lumière — elle y participe.
#422c leur écrivait la même valeur, ce qui se tenait tant que le soleil était seul à projeter. Un
soleil jugé invisible — caméra assez reculée pour qu'un texel dépasse ce qui projette — aurait alors
éteint le renderer, donc TOUTES les ombres, y compris celles cochées source par source. Le drapeau
du renderer suit désormais les DEUX projeteurs.

### Par défaut : éteintes, et réglées par Case

Tranché par l'utilisateur, et c'est la règle du dépôt appliquée telle quelle : **« pas de réglage »
vaut l'existant**. Une Case dessinée avant ce chantier garde son aspect au pixel près, comme le mode
Jour de #414 rend exactement l'éclairage d'avant #414, et comme le halo de #421f rend exactement
l'opacité d'avant #421f.

Allumer les ombres est donc un geste explicite, dans la section Lumière du menu de droite — la case
« Ombres portées », posée en #422e. Le coût assumé est que la fonctionnalité ne se voit que si on la
cherche ; le coût refusé était que toutes les Planches finies de l'utilisateur changent sans qu'il
l'ait demandé.

⚠️ **ET ELLE A LA FORME D'UNE BASCULE, pas celle d'un champ à valeur** (#422j, signalé à l'usage).
La première version employait l'enveloppe des champs à valeur — libellé en capitales au-dessus,
commande encadrée en dessous —, ce qui est juste pour un menu ou une couleur et donnait ici un cadre
presque vide avec une petite case perdue dedans. Elle emploie désormais la même enveloppe que
« Afficher la bordure » : case d'abord, texte à sa suite, sur une ligne. Rien n'était cassé, et
pourtant la commande ne se lisait pas comme ce qu'elle est.

⚠️ **ELLE EST HORS DU BLOC « PERSONNALISÉ », et c'est un choix.** Le mode gouverne la LUMIÈRE —
direction, couleur, intensité ; les ombres sont un axe indépendant, qu'on doit pouvoir allumer sur
une Case en Jour comme en Nuit. La réserver au Personnalisé aurait obligé à quitter un préset pour
obtenir une ombre.

⚠️ **ET CE N'EST PAS LE RETOUR DE LA CASE QUE #414h A RETIRÉE**, bien que les deux se ressemblent.
Celle-là avait deux états INDISCERNABLES — « Jour » EST l'éclairage que le style pose depuis
toujours, donc décocher ne changeait pas un pixel —, et une case dont on ne voit pas l'effet
ressemble à une case qui ne marche pas. Celle-ci change 1,54 % des pixels pour la seule ombre du
soleil, mesuré plus haut. Un test de régression garde l'ancien nom interdit pour que les deux ne se
confondent jamais.

Le réglage suit l'héritage d'une Scène vers ses Cases comme les quatre autres, sans code
supplémentaire : `copierLumiere3D` transmet le réglage entier, et un test le parcourt clé par clé
plutôt que de le recopier.

⚠️ **L'OPTION « ALLUMÉES SUR LES CASES NEUVES SEULEMENT » A ÉTÉ ÉCARTÉE**, et la raison mérite
d'être gardée : le défaut aurait alors dépendu de la DATE de création. Deux Cases identiques à
l'écran n'auraient pas eu le même réglage, et rien dans l'interface ne l'aurait expliqué. Le dépôt a
déjà refusé ce genre d'état à deux vitesses.

## Ce qui reste à trancher en construisant

**Le cadrage exact de la boîte d'ombre.** On sait qu'elle doit suivre la Case et non le Sol ; sa
taille précise se jugera à l'écran, comme l'intensité de départ d'une source en #420c. Une boîte trop
serrée coupe les ombres des Éléments proches du bord ; trop large, elle les rend floues. La caméra
d'une Case a une distance (`camDist`) et un cadrage connus : ils donneront le point de départ.

**~~La portée d'une source qui projette.~~ TRANCHÉ EN #422d : DÉRIVER, PAS EXIGER.** Une caméra
d'ombre a besoin d'un plan éloigné fini, et une source à portée nulle — « sans limite », le défaut
de #420a — n'en a pas. Les deux issues étaient ouvertes ; c'est la dérivation qui a été retenue.
Exiger une portée finie aurait fait d'une case à cocher un réglage qui en IMPOSE un autre, et
refuser de cocher tant qu'un champ n'est pas rempli est une porte close dont la raison ne se lit
pas. Une source sans portée n'ombre donc que ce qui est DANS le champ de la Case.

⚠️ **ET THREE.JS ALLAIT DANS LE MÊME SENS SANS QU'ON LE SACHE**, vérifié dans son code :
`PointLightShadow.updateMatrices` fait `const far = light.distance || camera.far`. Quand la portée
est finie, il l'impose de toute façon ; notre plan éloigné ne sert que dans le cas « sans limite »,
exactement celui que la dérivation couvre. Les deux moitiés tombent sur la même valeur — ce n'est
pas une redondance, c'est la seule prise qu'on ait sur ce cas.

**Ce que la dérivation coûte, et il faut le dire** : un Élément plus loin que le champ ne projettera
pas. C'est cohérent — on ne voit pas non plus son ombre — mais ça cesserait de l'être si la caméra
reculait sans que la Case soit re-rendue. `camDist` entre donc dans la signature de Case ; elle y
était déjà depuis #414c.

### ⚠️ Les ombres fuyaient sur les aperçus (#422k, trouvé en lisant)

Cinquième occurrence du piège de la scène partagée dans ce chantier, après le drapeau du renderer
(#422c), la disposition d'une fiche (#421h), le `castShadow` d'une source (#422d) et la cible du
soleil (#422g). Les aperçus — fiche d'un Personnage, d'un Objet, d'un Mur, et l'Éditeur de modèle —
partagent le renderer et la scène avec le rendu des Cases, mais n'appellent jamais
`appliquerOmbresDeCase3D`. Après une Case ombrée, ils héritaient de tout son état d'ombre, caméra
cadrée sur CETTE Case comprise, à cent unités de là.

**Et ce n'était pas qu'un coût.** Mesuré sur un aperçu réaliste, à plusieurs maillages :

| | valeur |
|---|---|
| pixels changés par la fuite | **1,83 %** |
| pixels changés par une ombre correctement cadrée (témoin) | 0,635 % |
| surcoût en temps | +0,374 ms par aperçu |

La fuite change **trois fois plus** de pixels qu'une ombre légitime, ce qui en dit la nature : une
carte d'ombre cadrée ailleurs ne donne pas une ombre décalée, elle donne du BRUIT — la comparaison
de profondeur porte sur des valeurs sans rapport. C'étaient des salissures sur l'Élément examiné.

⚠️ **ET UNE PREMIÈRE SONDE A CONCLU « 0 % », À TORT.** Elle ne montrait qu'UN maillage isolé, cas
dégénéré où rien ne reçoit l'ombre de rien. Le témoin — une seconde surface — a tout changé. Cinquième
instrument à valider avant de croire un chiffre.

**La garantie a été inversée, et c'est une mutation qui l'a exigé.** La première correction faisait
éteindre les ombres par chaque aperçu, via leur point de passage commun. Une mutation retirant UN
des deux appels d'une fonction qui en contient deux — une branche Mur, une branche Objet — est
passée : le test voyait l'autre et concluait que tout allait bien. À la quatrième occurrence de
« présence vérifiée à la place de gouvernance » dans ce chantier, la leçon n'est plus d'écrire un
test plus fin : **la garantie elle-même était mauvaise**, puisqu'elle reposait sur « tous les
chemins pensent à appeler ».

L'état de repos des ombres est donc ÉTEINT, et le rendu d'une Case — seul à les vouloir — les
allume pour lui puis les repose en partant. Un aperçu n'a plus rien à savoir des ombres, et un
cinquième chemin d'aperçu écrit demain sera correct sans qu'on y pense. C'est exactement l'idiome
que le rendu d'une Case emploie déjà pour son fond, deux lignes plus loin.

### ⚠️ « Au redémarrage, la Case s'affiche sans ombre » (#422i, signalé à l'usage)

Le réglage était enregistré, relu et appliqué — et l'image n'avait pas d'ombre. **La cause est un
ordre, pas une erreur de calcul.**

`marquerProjectionDOmbre3D`, qui pose `castShadow` sur toute la scène, était appelé en TÊTE du
rendu, depuis `appliquerOmbresDeCase3D`. Or les rigs d'une Case sont construits À LA DEMANDE, trois
cents lignes plus bas. Tout rig créé pendant CE rendu arrivait donc après le parcours, avec le
`castShadow` faux par défaut de Three.js. Il ne projetait pas.

⚠️ **ET LE CACHE A DOUBLÉ LE DÉFAUT**, ce qui explique pourquoi il ne se voyait qu'à froid :

- **en session**, cocher la case redessine une Case dont les rigs existent déjà du rendu
  précédent : le parcours les trouve, tout marche, et on conclut que le réglage fonctionne ;
- **au démarrage**, la PREMIÈRE image d'une Case construit ses rigs, donc les manque tous — et cette
  image sans ombre entre dans le cache d'images de Case, où rien ne la remet en cause puisque la
  signature n'a pas bougé.

Un défaut d'ordre que le cache rend permanent se lit comme « le réglage ne tient pas au
redémarrage », c'est à dire comme un défaut de PERSISTANCE, à l'autre bout de l'application.

**La règle qui en sort dépasse les ombres** : *un parcours de scène doit s'exécuter quand la scène
est complète, pas quand on pense à l'écrire*. Ce dépôt construit ses rigs paresseusement (#405d) ;
toute passe globale posée avant ces constructions travaille sur une scène partielle, en silence et
sans lever la moindre erreur.

### ⚠️ « Le mur du fond perd son ombre selon le zoom » (#422h, signalé à l'usage)

**Un champ mesuré à une seule profondeur.** `champVisibleDeCase3D` donne la section du tronc de
vision au centre d'orbite ; le tronc, lui, s'élargit derrière. Un Élément deux fois plus loin est vu
dans une section deux fois plus large et tombait hors d'une boîte taillée sur la section du milieu.
Couverture réelle relevée : **environ deux fois** la profondeur d'orbite — et comme le rayon saute
par paliers, cette limite se déplaçait au zoom.

⚠️ **Et personne n'avait décidé de cette couverture** : elle tombait de `MARGE_BOITE_OMBRE`, qui
servait à tout autre chose. Une grandeur qui gouverne ce qu'on voit ne doit pas être le résidu d'un
calcul voisin. Elle s'appelle désormais `PROFONDEUR_OMBRE_CAMDIST` et vaut **4**, choisi devant les
mesures.

La boîte se cadre sur la **sphère englobante du tronc de vision**, centrée non pas au centre d'orbite
mais au centre de gravité géométrique du tronc — plus loin, puisqu'un tronc s'élargit vers le fond.
Le placer au centre d'orbite exigeait un rayon bien plus grand pour la même couverture.

#### La résolution est gratuite en temps — huitième campagne

Mesuré sur le vrai GPU, même dispositif que #422 : scène de 52 maillages, cible de rendu hors écran,
`readPixels`, témoin vérifié.

| | ms | texel | mémoire |
|---|---|---|---|
| ombre éteinte | 2,14 | — | — |
| carte 1024 | 2,88 | 125 mm | 4 Mo |
| carte 2048 | 2,80 | 62 mm | 16 Mo |
| **carte 4096** | **2,76** | **31 mm** | **64 Mo** |
| carte 8192 | 2,80 | 16 mm | 256 Mo |

**Les quatre sont dans le bruit.** Le prix d'une carte d'ombre directionnelle est UNE PASSE DE
PROFONDEUR SUR LA GÉOMÉTRIE, pas du remplissage : le nombre de texels n'y entre pas. Cela étend le
résultat de #422 (1024 = 2048) et explique pourquoi. Ce qui arrête la montée, c'est la **mémoire**.

La couverture quadruplée est donc payée par la résolution, pas par la netteté : au cadrage par
défaut le texel reste à 62 mm, comme avant #422h.

⚠️ **ET L'INSTRUMENT A MENTI UNE QUATRIÈME FOIS.** Le premier relevé annonçait 92,57 % de pixels
changés, **identiques à toutes les résolutions** — ce qui était le signe. Basculer
`renderer.shadowMap.enabled` change le SHADER : ce n'est pas un A/B neutre, et l'image entière se
déplace de quelques niveaux. Le bon A/B est `light.castShadow`, carte activée des deux côtés :
2,33 % de pixels, décroissant avec la résolution (2,33 → 1,86 → 1,65 → 1,57 %), ce qui est l'ombre
qui se resserre. Quatrième instrument à valider avant de croire un chiffre, après `gl.finish()`,
`readPixels` sur le tampon d'affichage et la boîte étirée au Sol.

⚠️ **`MARGE_BOITE_OMBRE` A DISPARU**, et c'est une dette de #422a qui se ferme. Elle valait 1,5,
choisie à la main, et #422z devait la juger à l'écran. La sphère répond à ses deux besoins par
construction : **une sphère n'a pas d'orientation**, et elle contient tout le visible. Un nombre
qu'on n'arrive pas à justifier signale souvent une forme mal choisie, pas un réglage manquant.

### ⚠️ « Les ombres bougent quand je zoome » (#422g, signalé à l'usage)

Trois fautes, dont deux se masquaient l'une l'autre.

**1. La boîte était centrée sur l'origine du monde.** Une `DirectionalLightShadow` place sa caméra
en `light.position` et la fait regarder `light.target` — dont le défaut, chez Three.js, est
l'origine. `target` n'était jamais déplacé : la boîte couvrait donc un disque autour de (0, 0, 0)
pendant que la Case regarde `_orbitCx/Cy/Cz`, que les flèches, la molette et le ré-ancrage
automatique déplacent librement.

⚠️ **Et cette note le disait déjà**, en toutes lettres : « la boîte devra être CADRÉE SUR CE QUE LA
CASE REGARDE ». La TAILLE avait été implémentée, la POSITION oubliée. Une consigne écrite ne protège
de rien si on n'en relit que la moitié.

**2. Le rayon suivait `camDist` en continu**, donc la taille du texte changeait à chaque cran de
molette. Une ombre étant QUANTIFIÉE sur cette grille, changer le pas de la grille redessine tous les
contours : c'est cela qui rampait, sans qu'aucune lumière ait bougé.

La parade est celle des moteurs temps réel : **accrocher la grille au lieu de la laisser glisser.**
Le rayon est arrondi au palier supérieur par doublements, et le centre à un multiple entier de
texel — dans le repère de la LUMIÈRE, pas selon les axes du monde, sans quoi la grille glisserait en
biais dès que le soleil n'est pas dans un plan d'axe.

| camDist | rayon dérivé | rayon accroché | texel |
|---|---|---|---|
| 28 | 37,59 | **64** | 62,5 mm |
| 30 | 40,28 | **64** | 62,5 mm |
| 45 | 60,41 | **64** | 62,5 mm |
| 60 | 80,55 | **128** | 125 mm |

Zoomer de 28 à 45 ne change donc **plus rien du tout** : même rayon, même texel, même centre.

⚠️ **Ce que l'accrochage coûte, et il faut le dire** : arrondir au doublement supérieur peut doubler
la taille du texel. On échange de la finesse, au plus d'un facteur deux, contre de la stabilité. Une
ombre un peu plus grossière se regarde ; une ombre qui rampe se remarque. La marge de visibilité est
passée de plus de 4 à 3,5 — c'est le prix annoncé. Relever la résolution du soleil de 2048 à 4096
rendrait ce qui a été pris, mais **4096 n'a pas été mesuré**, et étendre une mesure au-delà de ce
qu'elle couvre est précisément ce que ce dépôt refuse. À juger en #422z.

**3. La caméra d'ombre était DANS le volume qu'elle regarde.** Troisième faute, trouvée en corrigeant
les deux autres : la lumière était posée à trois unités du centre quand le rayon peut valoir 64. Tout
ce qui se trouvait derrière elle tombait au-delà du plan proche, donc ne projetait pas. Le défaut
était masqué par le premier — une boîte plantée à l'origine ne contenait de toute façon presque rien.

### ⚠️ Ce qui affleure le sol ne projette pas (#422f, signalé à l'usage)

Les chemins sont revenus rayés de bandes. La cause était dans la règle de #422c — « un matériau qui
reçoit la lumière projette une ombre » — et elle était juste mais INCOMPLÈTE. Un Tracé est un ruban
plat posé **sept millimètres** au-dessus du Sol, avec un matériau éclairé : il projetait donc sur le
Sol situé sept millimètres dessous.

**Et la carte d'ombre ne peut pas séparer deux surfaces distantes de sept millimètres.** Au cadrage
par défaut, un texel couvre **39 mm** — cinq fois l'écart à résoudre :

| camDist | rayon de la boîte | taille d'un texel |
|---|---|---|
| 3 | 4,03 | 3,9 mm |
| 6 | 8,06 | 7,9 mm |
| **30 (défaut)** | **40,28** | **39,3 mm** |
| 80 | 107,40 | 104,9 mm |

Ce n'est pas un biais à ajuster : c'est une mesure demandée à un instrument dont la graduation est
plus grosse que la grandeur mesurée.

**La seconde règle, et elle reste géométrique** : *ce qui n'a rien au-dessus du sol n'a rien pour
porter une ombre ailleurs*. Un objet dont le point le plus haut affleure le sol ne pourrait projeter
que sous lui-même, sur la surface dont il est indiscernable. Il ne perd donc aucune ombre — il n'en
avait aucune à donner.

⚠️ **ET LES DEUX DRAPEAUX SE SÉPARENT ICI.** Un dessin au sol doit RECEVOIR — une ombre d'arbre qui
s'arrêterait net au bord d'une allée serait pire que pas d'ombre du tout — et ne doit pas PROJETER.
Les écrire ensemble était commode tant que rien n'était plat.

⚠️ **ET LE CRITÈRE LIT LE SOMMET, PAS LA BASE.** Une haie est posée à 2 cm du sol, comme un ruban,
mais son sommet est un mètre plus haut. Lire la base aurait supprimé l'ombre de tout ce qui REPOSE
par terre, c'est à dire de presque tout.

**~~Le Sol reçoit-il ?~~ VÉRIFIÉ EN #422c, ET IL REÇOIT PROPREMENT.** La crainte était fondée : une
surface de 12 000 unités est le terrain classique de l'acné d'ombre, ces mouchetures qu'une précision
de profondeur insuffisante sème partout. Relevé, en comptant les pixels changés et surtout OÙ :
**1,49 %** de l'image, dont **0,000 %** loin du projeteur. Aucune acné. Et le nombre de segments du
plan n'y change rien — 4 × 4 et 100 × 100 donnent le même chiffre au centième près, recevoir se
décidant par fragment.

**~~Ce que l'export en fait.~~ VÉRIFIÉ EN #422c, ET L'INFÉRENCE ÉTAIT JUSTE.** `exportPage` appelle
bien `drawContent`, le même que l'écran : les ombres y seront sans travail supplémentaire. Cette fois
l'inférence tombait juste — mais #425k avait démenti exactement le même raisonnement sur les Bulles,
et c'est pour cela qu'elle a été vérifiée plutôt que crue. Un test la tient désormais.

## Ce qui n'est PAS dans ce chantier

**Les ombres douces réglables.** `PCFSoftShadowMap` est le type retenu pour la mesure ; comparer les
trois types de Three.js à l'écran est un chantier d'aspect, pas de fonctionnalité.

**L'ombre d'une Bulle, ou de quoi que ce soit en 2D.** Les ombres portées ici sont celles de la scène
3D d'une Case. Le vocabulaire graphique des Bulles a ses propres axes (#425).

**Un réglage de résolution.** La mesure dit que 1024 et 2048 coûtent le même temps : exposer un
réglage qui ne change rien au prix et peu à l'œil ajouterait une commande sans décision derrière.
