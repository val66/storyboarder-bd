# Éclairage d'une Case et d'une Scène — décisions arrêtées

*[English version](../en/lighting.md)*

Chantier #414. Cette note est écrite **avant** le code, et son objet est de fixer ce qui se décide
une fois : le modèle de données, ce que « désactivé » veut dire, et ce qui n'entre pas dans le
chantier.

## Ce que la fonctionnalité promet

Une section **Lumière** dans le menu de droite d'une Case et d'une Scène, qui règle un soleil : sa
direction, sa couleur, son intensité. Trois modes, Jour, Nuit et Personnalisé, et un dôme qui montre
d'où vient la lumière au lieu de la décrire par deux nombres.

## Ce que le code fait aujourd'hui, vérifié et non supposé

Trois lumières vivent dans la scène Three.js partagée, posées par `applyStyle3DLighting` (rig3d.js)
à partir du seul style graphique :

| lumière | couleur | intensité | position |
|---|---|---|---|
| ambiante | blanc | 0,75 | sans objet |
| clé (directionnelle) | blanc | 0,55 | (1, 2, 2) |
| remplissage | bleu | 0 (éteinte) | (-1,6 ; 0,4 ; 0,8) |

Trois faits qui gouvernent le chantier :

- **la scène Three.js est PARTAGÉE** entre toutes les Cases, et chaque Case est rendue à son tour.
  Un éclairage par Case se pose donc avant chaque rendu, ce qui ne coûte rien, et non à la
  construction ;
- **un seul style existe**, `simplifie`. Les branches `comics_numerique` de rig3d.js sont
  inatteignables, aucun `STYLES_3D` ne porte cette clé et aucun Projet ne la référence. Elles ne
  sont donc pas un obstacle ici, et leur retrait est la tâche #415 ;
- **rien ne projette d'ombre** aujourd'hui.

## La décision qui gouverne tout : « pas de réglage » vaut l'existant, à l'identique

Par défaut, dans **toute** Case et **toute** Scène, le mode est **Jour**, et Jour vaut exactement ce
que pose `applyStyle3DLighting` : clé blanche à 0,55 en (1, 2, 2), ambiante blanche à 0,75.

⚠️ **Ce n'est pas une valeur par défaut de confort, c'est la garantie qui protège les Projets
existants.** Aucune Case déjà dessinée ne porte de champ d'éclairage ; le jour où la fonctionnalité
sort, aucune ne doit changer d'aspect. Un test recharge un Projet d'avant la fonctionnalité et
vérifie qu'il ressort identique.

⚠️ **UNE CASE À COCHER A EXISTÉ, PUIS S'EST RÉVÉLÉE SANS OBJET (#414h).** Tant que Jour différait de
l'existant, il fallait un interrupteur pour garantir qu'une Case jamais réglée ne bouge pas. Depuis
que Jour EST cet éclairage au bit près, décocher et rester sur Jour donnaient la même image :
signalé à l'usage sous la forme « en décochant on devrait avoir un rendu différent, non ? ». Une
case dont les deux états sont indiscernables ressemble à une case qui ne marche pas. Le mode dit
tout à lui seul, et le noir complet s'obtient en Personnalisé à intensité nulle.

⚠️ **Le prix de cette simplification, et il est assumé :** l'éclairage d'une Case s'applique
toujours, donc un futur style graphique ne pourra plus définir son propre ÉCLAIRAGE, seulement ses
matières. C'est une source unique de vérité pour la lumière, contre une possibilité qu'aucun style
existant n'exerce.

## Le modèle de données

Le champ vit sur l'objet `panel`. **La Planche verrouillée d'une Scène EST un panel**
(`isLockedScenePanel`), donc un seul champ couvre la Case et la Scène, sans deuxième chemin de code
ni deuxième format.

```js
lumiere: {
  mode: 'jour',           // 'jour' | 'nuit' | 'perso'
  azimut: -63.43,         // degrés, direction d'où vient le soleil
  elevation: 41.81,       // degrés au-dessus de l'horizon
  couleur: '#FFFFFF',
  intensite: 1,           // 0 à 1
}
```

**Les quatre derniers champs existent quel que soit le mode**, et Jour ou Nuit ne les écrasent pas :
passer en Personnalisé retrouve ce qu'on y avait réglé. Un mode qui détruirait les valeurs de
l'autre transformerait la liste en piège.

⚠️ **UN OBJET, PAS UNE LISTE, ET C'EST UN CHANGEMENT D'AVIS ASSUMÉ.** Une liste avait d'abord été
proposée pour préparer les sources multiples à venir. Elle était fondée sur une erreur : ces sources
seront **positionnées et déplaçables comme des Éléments**, pas orientées comme un soleil. Leur place
naturelle est donc `page.objects`, avec un type à elles, où elles héritent gratuitement de la
sélection, du glisser, de l'appartenance à une Case par `homePanelId`, de l'entrée dans la signature
de cache et de l'annulation. Deux natures, deux rangements, et aucun renommage à craindre : la règle
du dépôt interdit de renommer une donnée persistée (cf. persisted-data.md).

## Les trois états de la section

| état | ce qui est visible |
|---|---|
| Jour | la liste |
| Nuit | la liste |
| Personnalisé | la liste, le dôme, la couleur, l'intensité |

Le dôme, la couleur et l'intensité n'apparaissent qu'en Personnalisé : en Jour ou en Nuit ils
afficheraient des valeurs qu'on ne peut pas changer, ce qui se lit comme une panne.

## L'option 2 : le soleil ET l'ambiance

L'intensité pilote le soleil **et** l'ambiance, cette dernière étant dérivée de la couleur du soleil
à une fraction fixe. C'était le point à trancher, et il l'a été sur un rendu comparatif des deux
options (calcul de Lambert sur les valeurs réelles ci-dessus).

**Ce que la comparaison a montré.** À pleine intensité, les deux options sont indiscernables. En
descendant, l'option 1 (soleil seul) ne fait pas la nuit : l'ambiante blanche à 0,75 domine et ne
bouge jamais, si bien qu'une scène à 15 % est **plus claire** sur sa face non éclairée qu'à 45 %,
juste plus plate. L'option 2 traverse réellement le crépuscule et la nuit, et rend le noir complet
atteignable à 0 %.

⚠️ **RÉGLÉ À L'USAGE, ET LA PREMIÈRE VERSION ÉTAIT FAUSSE.** L'illustration liait l'ambiance au
soleil par une fraction de 0,6 ; livrée telle quelle, elle a produit un défaut signalé
immédiatement : « en mode Jour les ombres sont trop sombres ». Le calcul le confirme, l'ambiante
tombait à 0,45 au lieu des 0,75 d'aujourd'hui, soit 40 % perdus sur les faces non éclairées, pendant
que le soleil montait de 0,55 à 1,0. J'avais dérivé la DIRECTION du soleil de l'éclairage existant,
et pas ses intensités.

Les deux lois sont désormais **ancrées aux deux bouts** :

```
soleil   = 0,55 × intensité
ambiante = 0,75 × intensité²
```

À intensité 1 on retrouve exactement l'éclairage d'aujourd'hui, et un test l'exige — ce qui
manquait. L'exposant 2 n'est pas choisi mais **résolu** : la nuit validée à l'écran vaut un soleil à
0,18 et une ambiante à 0,081, et l'exposant qui fait passer la courbe par ce point vaut 1,993. Il se
lit aussi physiquement, la lumière du ciel décroissant plus vite que le soleil direct.

**Conséquence voulue :** activer l'éclairage en mode Jour ne bouleverse pas la Case. C'est le point
de départ, à partir duquel on déplace le soleil ou l'on passe en Nuit, pas un saut visuel.

## Le dôme, en 2D

Une demi-sphère portant un point est la **projection d'une direction** sur un disque. Le tourner au
clic droit, c'est changer l'azimut de projection. Tout cela est du calcul.

Le dôme est donc dessiné sur un **canevas 2D**, et non dans un second contexte WebGL. Deux raisons,
et la première suffit : la projection et le test de clic deviennent des **fonctions pures**, donc
réellement testables sous Node, ce qu'un widget WebGL n'est jamais. La seconde est qu'on n'ajoute
pas un second renderer à côté de celui que #411 vient de mesurer.

Ce qui reste hors de portée des tests est à écrire dans le fichier de test : le rendu et le ressenti
du glisser demandent un navigateur.

⚠️ **LES REPÈRES DE LA BASE SONT VENUS D'UN RETOUR D'USAGE, PAS DU PLAN.** Un dôme nu est
parfaitement symétrique : le tourner ne déplaçait visiblement que le soleil, et quand celui-ci est
haut, presque rien ne bougeait. Le geste paraissait sans effet. Huit repères puis les quatre lettres
cardinales, posés à des azimuts fixes du MONDE, rendent la rotation lisible ; les azimuts sont
**dérivés** de la caméra par défaut d'une Case, pas choisis, sinon le dôme et la Case se
contrediraient.

⚠️ **LE NORD EST ROUGE PAR UN JETON DE THÈME, ET C'EST LA MESURE QUI L'A IMPOSÉ (#414k).** Aucun
rouge unique ne tient sur les deux papiers : `#E8604A` vaut 4,69 sur le fond sombre et 2,49 sur le
clair, `#B8321F` l'exact inverse. Encore une valeur pour deux rôles opposés, le défaut qui revient
dans tout ce dépôt. `--nord-boussole` est donc défini dans les quatre palettes, à des valeurs
**résolues** et non choisies : teinte et saturation fixées, la clarté la plus proche du milieu qui
atteint 4,5 en thème normal et 7 en contraste renforcé. Ce rouge n'est acceptable sur l'axe
rouge-vert du daltonisme que parce que le point cardinal est déjà **écrit** (cf.
[colour-accessibility](colour-accessibility.md)).

Les autres lettres portent `--ink` et non `--ink-soft` : demandées « plus foncées », elles ont changé
de **rôle** plutôt que de valeur, car en thème Sombre assombrir rapproche du fond.

⚠️ **ET J'AI MESURÉ CONTRE LE MAUVAIS FOND, DEUX FOIS DE SUITE (#414l).** C'est la faute la plus
instructive de tout ce chantier, et elle mérite d'être lue avant la prochaine.

**Premier fond faux.** J'ai mesuré les lettres contre `--paper-dark`, le papier du menu de droite,
alors que `style.css` contient une règle globale `canvas{ background:var(--fond-3d) }` dont le dôme
héritait. `--fond-3d` est **clair dans les quatre palettes**, et c'est voulu : les Éléments 3D sont
souvent sombres. Les lettres, elles, portent un jeton qui **suit le thème**. En thème Sombre, encre
#EDEDEF sur fond #CFCBC2, soit **1,38**. Le réglage censé les rendre plus lisibles les avait rendues
pires que l'ancien, qui valait 1,73.

**Second fond faux, dans la correction elle-même.** J'ai alors mesuré contre `--paper-dark` en
croyant que c'était le fond de la section. C'est `--paper` : `.side-section` a sa propre règle. Cette
fois l'écart jouait en ma faveur et toutes les valeurs tenaient, mais elles tenaient par chance, pas
par méthode.

**Le même défaut avait une seconde victime, invisible en thème Sombre.** Le corps du dôme, peint
avec `--paper-dark` sur ce fond clair, valait **1,14** en Clair et **1,02** en contraste clair : le
dôme y était un contour vide. Personne ne l'avait signalé parce que le défaut ne se produit pas dans
le thème où l'on travaille.

**La carte ne pouvait pas être sauvée.** Mesurée contre le papier de la section, telle quelle elle
vaut 9,82 en Sombre et 14,85 en contraste sombre, d'où le rectangle clair qu'on voyait ; avec un
jeton de thème elle serait tombée entre 1,02 et 1,36, donc invisible dans les quatre palettes. Une
carte n'existe qu'en **ne suivant pas** le thème, ce qui est exactement le défaut. Elle a donc été
retirée, après un rendu comparatif des trois variantes dans les quatre palettes.

Ce que ça donne, mesuré sur `--paper` :

| thème | lettres | Nord | contour | corps |
|---|---|---|---|---|
| Sombre | 14,57 | 4,88 | 6,10 | 1,07 |
| Clair | 12,09 | 5,27 | 3,82 | 1,19 |
| Contraste sombre | 21,00 | 7,60 | 13,55 | 1,12 |
| Contraste clair | 21,00 | 8,21 | 11,37 | 1,19 |

Le contour passe de `--line-strong` à `--ink-soft` : sur ce fond, le premier tombait à 2,09 en
Sombre, sous le seuil de 3 que WCAG 1.4.11 demande au contour d'un composant qu'on manipule, et le
dôme se manipule. Le corps passe de `--paper-dark` à `--creux` et reste **délibérément discret**,
entre 1,07 et 1,19 : c'est le contour qui porte la forme, le remplissage ne sert qu'à voiler un
soleil passé derrière la coupole, ce qui se joue en composant sur le disque du soleil et non contre
le papier. Un test **interdit** à ce remplissage de monter, sans quoi la carte reviendrait.

⚠️ **ET LE TEST, LUI, NE DOIT PLUS ÉCRIRE LE FOND EN DUR.** Il le **déduit** de la feuille de style :
il vérifie que le dôme déroge bien à la règle globale, puis lit le jeton de fond dans la règle de
`.side-section`. Un fond posé en dur est précisément ce qui a laissé passer les deux erreurs
ci-dessus, avec des tests verts qui mesuraient autre chose que ce que l'œil voit.

## L'héritage Scène vers Case

Charger une Scène dans une Case **copie** son éclairage, exactement comme elle copie ses modèles.
Ensuite les deux sont indépendants **dans les deux sens** : modifier la lumière de la Case ne touche
pas la Scène, et modifier celle de la Scène ne rattrape pas les Cases déjà chargées.

⚠️ La copie doit être faite **par valeur**. Une affectation laisserait les deux objets partager la
même référence, et le premier réglage se propagerait à l'autre sans que rien ne le demande. Un test
refuse ce cas précis.

⚠️ **ET UNE SCÈNE SANS RÉGLAGE EFFACE CELUI DE LA CASE (#414f).** C'est la moitié de la promesse
qu'on oublie en l'écrivant. Une Scène sans champ `lumiere` s'affiche en Jour ; si la Case visée était
en Nuit et qu'on ne touchait à rien, elle resterait en Nuit alors que la Scène d'où vient tout son
contenu est en plein jour. Le contenu aurait changé, l'ambiance non. « Copier l'éclairage de la
Scène » veut aussi dire copier son **absence** de réglage.

D'où l'ordre retenu, effacer **puis** poser : quand la Scène porte un réglage, effacer d'abord
garantit un REMPLACEMENT et non une fusion, car `definirLumiereDeCase3D` applique son argument
par-dessus l'existant et il suffirait qu'un jour la copie devienne partielle pour que la Case garde
des restes de son ancienne lumière ; quand la Scène n'en porte pas, effacer est la totalité du
travail. Un test par branche.

## Ce qui n'entre PAS dans ce chantier

**Les ombres portées.** Rien n'en projette aujourd'hui. Les activer est une question de performance
à part entière, et #411 vient de mesurer ce que coûte le rendu d'une Case : 13 ms de médiane, 296 au
pire. À traiter avec des mesures, pas en passant.

**Les sources positionnées.** Elles viendront, comme objets de `page.objects` (cf. le modèle de
données ci-dessus). Ce chantier pose le soleil, et rien d'autre.

## Le piège que #411 vient d'apprendre

⚠️ **L'ÉCLAIRAGE DOIT ENTRER DANS `computePanelSceneSignature3D`.** Une Case garde son image tant
que sa signature ne change pas ; un réglage absent de la signature ne redessine donc rien, et le
curseur paraîtra sans effet. Le même oubli a déjà coûté un relevé entier dans la campagne #411.

Et le chemin d'**export** doit passer par la même fonction d'éclairage que l'écran, sans quoi une
Planche exportée n'aurait pas l'aspect qu'on lui a réglé.

## Découpage

| tâche | objet |
|---|---|
| #414a | les décisions pures : direction, projection du dôme, test de clic, résolution d'un mode |
| #414b | le champ persisté, et la garantie que l'existant ne bouge pas |
| #414c | le rendu par Case, la signature de cache, l'export |
| #414d | la section du menu de droite, sans le dôme |
| #414e | le dôme 2D et ses deux gestes |
| #414f | l'héritage Scène vers Case |
| #414g | README, aide intégrée, vérification à l'écran |
