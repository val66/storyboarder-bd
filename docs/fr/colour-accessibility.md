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

**3. Un thème daltonien unique, réglé sur l'axe rouge-vert.** ❌ **Écarté**, et le raisonnement
compte plus que la conclusion, puisque c'était la demande d'origine.

Le mécanisme est réel et il a été mesuré pendant #409f : `--accent`, `--danger` et `--warn`
appartiennent toutes à la famille rouge-orange-jaune, exactement l'axe que le daltonisme rouge-vert
supprime. Un balayage de la teinte de 0° à 60° les fait converger vers le même jaune-brun ; en thème
Sombre, `accent` contre `warn` tombe à **33**. Corriger demande d'en sortir une *de la famille* :
`--accent` passant au bleu ou au violet, pour que le trio se sépare sur l'axe bleu-jaune, qui
survit.

Deux choses l'ont écarté.

**Les couleurs ne portent pas le sens.** `tests/style.test.mjs` (#398) établit que c'est le
*libellé* d'un bouton qui dit ce qu'il fait, et « Supprimer le projet » demande en plus d'écrire un
mot. Un daltonien perd l'**emphase**, pas l'information. C'est donc un confort, pas la correction
d'un défaut.

**Et `--accent` est l'orange de marque de l'application.** Il est partout : lignes actives, survols,
badges, bague de focus. Le passer au bleu dans un mode change l'identité visuelle entière, pas trois
boutons. Le coût est grand, très visible, et relève d'un jugement qui appartient à l'utilisateur ;
il a écarté la tâche une fois l'échange posé franchement.

Consigné plutôt qu'abandonné. Le mécanisme est écrit : si la question revient, le travail repartira
d'une mesure et non d'une intuition.

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

### Ce que #409c a raté, et la forme de l'erreur

Deux défauts ont été introduits par les palettes de contraste elles-mêmes, et les deux viennent de
la même erreur de méthode : **chaque jeton a été mesuré contre le fond, jamais contre les autres.**

**Les jetons sémantiques ont convergé.** `--accent`, `--danger` et `--warn` sont tombés à 36 d'écart
en vision normale, contre 55 dans le thème Sombre. Poussés vers le sombre pour gagner du contraste
sur blanc, ils sont devenus presque la même couleur.

**Et les libellés de boutons sont devenus illisibles.** Ces trois jetons servent **deux rôles
opposés** : texte posé SUR le papier, et fond de bouton SOUS un libellé. #409c n'a honoré que le
premier. Mesuré, dans un mode nommé « contraste renforcé » : libellé blanc sur le bouton d'action à
**1,98**, libellé sombre sur le bouton d'avertissement à **2,11**. Sous le seuil AA, donc *moins*
lisibles que dans les thèmes normaux.

Une valeur ne peut pas satisfaire deux contraintes opposées : il en faut deux. D'où `--sur-accent`,
`--sur-danger`, `--sur-warn` : le libellé suit le thème lui aussi. Tout est désormais à 7:1 ou
mieux, et la séparation mutuelle est remontée à 69 et 58.

**Ce qui reste hors d'atteinte, et il faut le nommer.** Ces trois teintes appartiennent à la famille
rouge-orange-jaune, qui est exactement l'axe que le daltonisme rouge-vert supprime. Un balayage de
la teinte de 0° à 60° les fait toutes converger vers le même jaune-brun. Seule la *luminosité* les
sépare encore, et c'est ce qui a guidé les nouvelles valeurs : elles sont étagées en clarté, pas en
teinte. Les séparer vraiment demanderait d'en sortir une de la famille, ce qui est une décision
d'identité visuelle et non un réglage.

**Un dernier écho de la même faute.** Les huit superpositions noires employées comme surfaces
(`rgba(0,0,0,.14)` et voisines) sont devenues un jeton `--creux`. La démonstration la plus nette est
le contraste sombre : le papier y est `#000000`, donc l'assombrir rend exactement `#000000`, un écart
de 1,00, parce qu'**aucune valeur négative n'existe**. Le jeton, lui, peut aller dans l'autre sens,
et il le fait : 1,30. Le voile des modales reste noir, et c'est une décision et non un oubli : un
voile simule une lumière éteinte, il n'est pas une surface.

### Deux de plus, signalées à l'usage (#409h)

**Une ombre là où rien ne flotte.** La règle disait `canvas { box-shadow: 0 8px 28px rgba(0,0,0,.55) }`
— `canvas` tout court, donc elle atteignait aussi les quatre aperçus 3D des modales. Une ombre
décolle un objet de son plan de travail ; un aperçu est *posé dans* un panneau et n'a rien à
survoler. `0 8px 28px` déborde d'une vingtaine de pixels en haut et d'une trentaine en bas :
invisible sur fond sombre, deux bandes sales sur du beige. Limitée désormais à `#board`, la Planche
elle-même.

Le noir absolu y **reste**, et c'est une décision : une ombre simule une lumière occultée, comme le
voile des modales. Ce n'est pas une surface, elle n'a donc pas à suivre le thème. La règle qui se
dégage de cette campagne : *les surfaces prennent des jetons, les effets de lumière restent
absolus.*

**Un bouton sans contour propre.** `.nav-btn` portait `border: 1px solid var(--nav-bg)`, c'est-à-dire
la couleur de son propre remplissage. Il n'avait donc aucun contour, et se dissolvait dès que son
fond s'approchait du papier : 1,17 en thème Clair, signalé sur le bouton « Annuler » d'une modale.
La bordure emploie maintenant `--line-strong`, indépendante du remplissage, et `--nav-bg` a été
soutenu (1,17 → 1,59 en Clair, 1,30 → 1,45 en contraste clair).

### Trois jetons de filet, et pourquoi le troisième mérite sa place (#409l)

Mesuré avant de trancher, contre le papier de chaque thème normal :

| | Sombre | Clair |
|---|---|---|
| `--line` | **1,39** | **1,33** |
| `--line-strong` | **2,09** | **1,88** |

Les quatre échouent au 3:1 que WCAG 1.4.11 demande pour la frontière d'un composant, et le pire est
`--line`, qui porte la bordure de **tous les champs de saisie**. Un champ dont le contour est à 1,33
est un champ dont on ne voit pas où il commence.

Mais la règle ne couvre pas tout. Elle vise ce qui se **clique ou se saisit** ; un cadre de panneau
ou un séparateur de section n'en relève pas. Or `--line` servait indistinctement aux deux : sur ses
57 emplois, 33 étaient interactifs et 24 décoratifs. Le monter pour tous aurait satisfait la règle et
raidi toute l'application là où rien n'était demandé.

La valeur a donc été **séparée** plutôt qu'arbitrée, ce qui est la leçon de tout ce chantier
appliquée une fois de plus. `--bord-actif` porte les frontières interactives à 3:1 ou mieux ;
`--line` et `--line-strong` gardent le travail décoratif, inchangé.

**Ce qui est mesuré est le voisin EXTÉRIEUR, pas le remplissage.** Un champ est délimité par son
contour contre la *page*, pas contre son propre fond blanc : c'est l'extérieur qui dit où le
composant s'arrête. Mesurer contre le remplissage aurait donné un contour bien plus sombre que
nécessaire, et une interface hérissée.

### L'indicateur de focus, qui n'était défini nulle part (#409m)

Signalé à l'usage : « le contour de sélection n'épouse pas le contour du champ, ce n'est ni le même
angle ni la même taille ». Exact, et la raison est que **la feuille ne contenait aucune règle de
focus** — une seule règle `:focus` existait, et elle *supprimait* l'indicateur (`outline:none`). Ce
qui s'affichait était la bague du navigateur, dessinée par `outline-style: auto`, dont la forme ne
suit pas le `border-radius` déclaré. Un `outline` explicite, si.

**Elle n'emploie pas `--accent`, et c'est mesuré.** WCAG 2.4.11 demande 3:1 entre l'indicateur de
focus et les couleurs voisines. `--accent` vaut 6,59 en thème Sombre mais **2,18 en Clair** contre le
papier, et 1,90 contre `--paper-dark` : la bague y aurait été *moins* visible que la bordure au
repos, soit l'exact contraire de son rôle. `--focus` est un jeton à part, à 4,11 au minimum dans les
quatre thèmes.

`:focus-visible` plutôt que `:focus`, pour qu'un clic à la souris ne bague pas tout ce qu'il touche.

### Et la section qui découpait ses propres champs

Le second signalement avait la même racine. `.modal-section-body` portait un `overflow:hidden` qui ne
servait plus à rien — le repli se fait par `display:none`, et aucune animation de hauteur n'existe —
tout en **découpant** ce qui dépassait du corps de la section. La ligne X/Y/Z dépasse, poussée vers
le haut par un `margin-top` de -2px : les champs paraissaient donc coupés par le titre.

Les deux n'en font qu'un : **une bague de focus se dessine en dehors de son champ, par
construction.** Tant que ce découpage existait, aucun style de focus n'aurait pu s'afficher
entièrement. Les deux sont partis : le découpage, et les dix marges négatives qui débordaient dedans.
Retirer le découpage seul aurait rendu le débordement visible au lieu de le supprimer.

## Découpage

| Tâche | Sujet |
|---|---|
| #409a | Extraire les couleurs de signal de `draw.js` vers des jetons nommés. Aucun changement visible. Trancher les cinq couleurs mortes de `PALETTE`. |
| ~~#409b~~ | **Abandonnée.** Les deux paires qu'elle visait sont closes ci-dessus : l'une est un signal que personne ne lit, l'autre passe le seuil. |
| ~~#409c~~ | ✅ Fait. Contraste renforcé, en modificateur qui se combine à Sombre et Clair. |
| ~~#409d~~ | ❌ **Écartée.** Mécanisme mesuré et consigné ci-dessus ; le coût porte sur la couleur de marque, et ces couleurs portent l'emphase, pas le sens. |

#409b est abandonnée, donc #409c est l'étape suivante. Elle dépend de #409a et de rien d'autre.

## Comment refaire la mesure

La simulation tient en trente lignes de Python et ne demande aucune dépendance : sRVB vers linéaire,
puis vers LMS par la matrice de Viénot, application de la matrice de déficience, retour. Les
matrices sont dans le message de commit de la campagne. Ce qui compte n'est pas l'outil mais la
discipline : **mesurer les paires que l'utilisateur doit distinguer**, pas la palette dans
l'abstrait. Mesurer `PALETTE` a produit une page de chiffres alarmants sur du code qui ne s'exécute
pour personne.
