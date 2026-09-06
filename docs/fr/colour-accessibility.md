# Couleur, sens et accessibilité visuelle

*[English version](../en/colour-accessibility.md)*

> Ouverte sur demande utilisateur : « ajoute un thème daltonien, et dis-moi ce qui vaudrait la peine
> pour les autres handicaps visuels ». Mesurer d'abord a changé la réponse, donc les mesures
> viennent en premier ici.

## La distinction que le mot « couleur » cache

Deux choses s'écrivent `#RRVVBB` dans ce dépôt, et elles demandent des traitements opposés.

**La couleur qui DÉPEINT.** La peau d'un Personnage, la coque d'un téléphone, la texture d'herbe, la
teinte par défaut d'une haie ou d'un muret. `rig3d.js` (93 lignes), `scene3d.js` (18) et
`constants.js` (23) ne contiennent presque que ça. Elles ne signalent rien, elles **représentent**.
Les repeindre pour un thème daltonien rendrait le dessin **faux** : personne n'est aidé par un gazon
violet.

**La couleur qui SIGNALE.** Sélectionné, en recadrage, aimanté, détaché, porteur d'un rôle. C'est de
l'interface posée par-dessus le dessin, et elle ne vit que dans `draw.js`.

Toutes les recommandations ci-dessous découlent de ce partage. Un thème peut repeindre ce qui
signale. Il ne doit pas toucher à ce qui dépeint.

## Ce qui a été mesuré

Simulation Brettel/Viénot 1999, appliquée aux couleurs réelles de l'application, sur chaque paire de
chaque jeu. Le chiffre donné est une distance euclidienne en sRVB : grossière, mais suffisante pour
repérer un télescopage. Sous 60 les deux couleurs ne se séparent plus d'un coup d'œil ; sous 90
c'est juste.

Pour peser les résultats : les déficiences rouge-vert (deutéranomalie, protanomalie) touchent
environ 8 % des hommes et 0,5 % des femmes. La tritanopie est mille fois plus rare. Une palette
réglée sur l'axe rouge-vert couvre donc l'écrasante majorité des cas, et trois thèmes en feraient
deux de trop.

### La collision mesurée, et pourquoi elle a été close sans correction

`draw.js` distingue un Personnage de tout autre Élément dans le plan en vue de dessus **par la seule
couleur** : `#f4a340` contre `#6fbf73`, à deux endroits.

| Vision | Écart |
|---|---|
| normale | 145 |
| deutéranopie | 73 |
| **protanopie** | **54** |

Ç'a d'abord été écrit comme « la seule vraie trouvaille de la campagne », et une tâche a été ouverte
pour la corriger. **C'était faux, et le raisonnement qui l'a tuée vaut mieux que le chiffre.**

Lire le code autour, plutôt que la couleur, a montré trois choses. Les deux marques sont des disques
de 4 px dans l'aperçu des modales Pièce et Bâtiment. **Rien nulle part ne dit ce que les deux
couleurs signifient** : pas de légende, pas de libellé. Et la distinction tracée est
`type === 'perso'` contre tout le reste, ce qui met mobilier, véhicules, végétation et modèles
importés dans le même sac.

En vision normale, la distinction est donc *visible* mais pas *signifiante* : il faut deviner.
Corriger le cas daltonien aurait rendu un peu plus lisible un signal qui ne communique rien à
personne. Puis l'utilisateur, interrogé directement sur son usage de ces points, a répondu qu'il
ignorait l'existence de la fonctionnalité.

**Une collision dans un signal que personne ne lit n'est pas un défaut d'accessibilité.** Elle est
mesurée, elle est réelle, et elle est sans portée. La paire reste épinglée dans
`tests/colour-signals.test.mjs` pour qu'elle ne se dégrade pas en silence, et elle sera reprise si
cet aperçu est un jour retravaillé pour ses propres raisons.

### Le cas limite qui n'en était pas un

Dans l'éditeur de modèle, un point de rôle contre un point sans rôle, `#3AA0FF` contre `#9FC9EE` :
110 en vision normale, **67 en protanopie**. C'était classé « cas limite », or 67 est **au-dessus**
du seuil que cette note fixe elle-même à 60. Ça passe. L'appeler limite était de la rhétorique, pas
de la mesure.

Les deux entrées sont corrigées ici plutôt que réécrites, parce que l'erreur est la partie
instructive : un chiffre sous un seuil n'est pas un défaut à lui seul, et un seuil calibré sur un
dépôt n'est pas une falaise.

### Deux paires de plus, trouvées par le test et non par la campagne

Écrire les mesures sous forme de test exécutable (`tests/colour-signals.test.mjs`) a immédiatement
fait apparaître deux paires que la campagne avait manquées, pour la raison la plus simple qui soit :
**la campagne a mesuré les paires auxquelles j'ai pensé, le test a interrogé la liste entière.**
C'est l'argument le plus net pour inscrire une mesure plutôt que de la raconter.

| Paire | Pire écart |
|---|---|
| Sélection contre contour de recadrage d'image | 43 |
| Outil Construire contre repère d'aimantation | 30 |

Les deux sont faibles en teinte. Aucune n'est le même défaut que la vue de dessus, car chacune porte
déjà un **second indice** : des motifs de tirets distincts (`[4,3]` contre `[6,4]`, `[4,4]` contre
`[2,4]`). La distinction survit sans la teinte. Elles sont épinglées dans le test aux deux niveaux :
la teinte, pour qu'elle ne se dégrade pas, et le motif, parce que c'est lui qui fait le travail.

### Deux fausses alertes, et elles sont instructives

**La sélection contre l'outil Construire** (`#B5482A` / `#3E5FA8`) tient partout, sans jamais
descendre sous 129.

Une version antérieure de cette note appelait `#B5482A` « hors-champ » et `#FFD700` « poignée
verrouillée ». Les deux étaient faux : `#B5482A` est la sélection, `#FFD700` est l'outil Mesure, et
la distinction figé/en cours qu'il porte passe par plein-contre-creux, pas par or-contre-blanc. Les
mesures étaient justes, les noms étaient des suppositions, et ils ont été corrigés au moment
d'extraire les jetons, quand il a fallu donner à chaque couleur son sens réel. Consigné parce qu'une
étiquette fausse survit plus longtemps qu'un chiffre faux.

**Les types de terrain** se télescopent beaucoup entre eux (gazon contre terre tombe à 16 en
deutéranopie). Mais leur sélecteur porte une icône et un libellé, donc le choix reste possible ; et
sur la Planche, herbe et gazon se ressemblent parce que dans la réalité ils se ressemblent. C'est de
la couleur qui dépeint. Pas un défaut.

**La vignette d'image manquante** a deux variantes de fond séparées par un écart de 15 **en vision
normale**. Ce fond n'a jamais été un signal. Le contour l'est (`#8A3B2E` / `#8A867E`, qui tient à
104), et il fait son travail.

### Et une trouvaille de code mort

`PALETTE`, dans `constants.js`, contient six couleurs. Seul l'indice 0 sert, via `FIXED_COLOR`. Les
premières mesures de cette campagne ont porté sur les six et trouvé des collisions sévères : elles
décrivaient cinq couleurs que personne n'emploie. Consigné ici plutôt que discrètement abandonné,
parce que les premiers chiffres ont été montrés avant que la vérification soit faite.

## Ce qui en découle

Par ordre de valeur, et non par ordre de ce qui a été demandé.

**1. Cesser de faire porter le sens par la couleur seule** (WCAG 1.4.1). Le principe reste juste,
et cette campagne n'a trouvé dans l'application aucun endroit où l'appliquer aiderait quelqu'un :
l'unique candidat s'est révélé être un signal sans légende. Gardé en tête de liste pour que la
prochaine fonctionnalité qui encode un état dans une teinte ne recommence pas. C'est la seule mesure qui
aide *tous* les types de daltonisme à la fois, dans *tous* les thèmes, sans que l'utilisateur ait
quoi que ce soit à choisir. Elle aide aussi qui regarde un écran en plein soleil, ou une planche
imprimée en noir et blanc. Un feu tricolore est utilisable parce que le rouge est toujours en haut,
pas grâce à sa nuance.

**2. Un thème contraste renforcé.** ✅ Fait, #409c. Il touche bien plus de monde que le daltonisme :
basse vision, presbytie, cataracte débutante, écrans médiocres, lumière ambiante forte.

Livré comme un **modificateur, pas un thème de plus** : une case à cocher qui se combine à Sombre et
à Clair, plutôt que deux entrées de plus dans la liste déroulante. Quatre entrées auraient suffi
aujourd'hui, et en auraient demandé quatre autres le jour où la palette daltonienne arrive. Deux
réglages qui se combinent donnent quatre rendus, et chacun se nomme par ce qu'il fait.

Côté données persistées, la règle du dépôt est respectée sans effort : `theme` garde `dark` et
`light`, **rien n'est renommé**, et un champ `contrast` est *ajouté*. Un `settings.json` antérieur se
relit tel quel, simplement sans contraste.

Les valeurs sont mesurées, pas choisies à l'œil. Chaque jeton de texte atteint au moins 7:1 (AAA),
chaque jeton de bordure au moins 3:1 (WCAG 1.4.11). Les ratios de départ le justifiaient : en thème
Clair, `--ink-soft` était à 3,82 et `--sepia` à 3,05, **tous deux sous le seuil AA de 4,5** pour du
texte courant, et aucun des deux n'est décoratif : ils portent les légendes et les libellés de
section. `tests/theme-contrast.test.mjs` rejoue le calcul sur la feuille de style réelle.

**3. Un thème daltonien unique, réglé sur l'axe rouge-vert.** Couvre bien plus de 99 % des cas.

**4. La taille de l'interface.** Pas un thème mais un réglage, et pour beaucoup de gens il compte
plus que n'importe quelle palette. Hors périmètre ici, consigné pour ne pas l'oublier.

### Pourquoi extraire les couleurs est une autre question

Une lecture raisonnable du point 1 est « arrêter d'écrire les couleurs en dur ». C'est un problème
**différent**, réel lui aussi, mais les deux sont indépendants.

Même avec les couleurs parfaitement extraites en jetons, orange contre vert resterait illisible pour
un protanope : un thème ne peut que remplacer une couleur par une autre, il ne peut pas ajouter une
seconde information. Inversement, ajouter une forme distinctive corrige le défaut sans déplacer une
seule valeur hexadécimale.

L'extraction compte pour une autre raison : `#f4a340` et `#6fbf73` sont écrits dans `draw.js` et ne
passent par aucune variable CSS, donc **aucun thème ne peut les atteindre**. C'est le préalable
technique des points 2 et 3, pas la correction du point 1.

### Une troisième porte sur la même faute, signalée à l'usage

Après la livraison de #409c, les pavés de section du Manuel, dans l'encart de droite, se sont
révélés sans contour visible en thème Clair. La cause est de nouveau la leçon de #409a, en CSS cette
fois : le fond et la bordure étaient écrits `rgba(255,255,255,.05)` et `.07`, c'est-à-dire
« éclaircir ce qu'il y a dessous ». Ça marche sur un fond sombre, et seulement là.

Contraste de la bordure contre le papier de chaque thème :

| | Sombre | Clair | Contraste sombre | Contraste clair |
|---|---|---|---|---|
| `rgba(255,255,255,.07)` | 1,22 | **1,01** | 1,12 | **1,00** |
| `rgba(0,0,0,.14)` | **1,04** | 1,37 | **1,00** | 1,38 |

1,01 n'est pas « discret », c'est **absent**. Et la pire case est la dernière : le contraste
renforcé, dont c'est précisément le métier, n'y changeait rien du tout.

La faute existe dans les deux sens : les superpositions noires sont le miroir exact, correctes en
Clair et nulles en Contraste sombre. Les blanches sont désormais des jetons (`--white`,
`--line-strong`, `--nav-bg`). Les noires restent pour l'instant, faute d'avoir été signalées et
parce que les blocs qu'elles remplissent portent déjà une bordure en jeton, mais
`tests/style.test.mjs` les compte, pour que leur nombre ne puisse que baisser.

Un jeton suit le thème. Une valeur absolue ne le peut pas, quel que soit le soin mis à la choisir.

## Découpage

| Tâche | Sujet |
|---|---|
| #409a | Extraire les couleurs de signal de `draw.js` vers des jetons nommés. Aucun changement visible. Trancher les cinq couleurs mortes de `PALETTE`. |
| ~~#409b~~ | **Abandonnée.** Les deux paires qu'elle visait sont closes ci-dessus : l'une est un signal que personne ne lit, l'autre passe le seuil. |
| ~~#409c~~ | ✅ Fait. Contraste renforcé, en modificateur qui se combine à Sombre et Clair. |
| #409d | Thème daltonien rouge-vert. |

#409b est abandonnée, donc #409c est l'étape suivante. Elle dépend de #409a et de rien d'autre.

## Comment refaire la mesure

La simulation tient en trente lignes de Python et ne demande aucune dépendance : sRVB vers linéaire,
puis vers LMS par la matrice de Viénot, application de la matrice de déficience, retour. Les
matrices sont dans le message de commit de la campagne. Ce qui compte n'est pas l'outil mais la
discipline : **mesurer les paires que l'utilisateur doit distinguer**, pas la palette dans
l'abstrait. Mesurer `PALETTE` a produit une page de chiffres alarmants sur du code qui ne s'exécute
pour personne.
