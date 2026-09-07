# Pixels d'écran et pixels zoomés — la règle que #417 a coûtée

*[English version](../en/ui-scale-coordinates.md)*

## La règle, en une ligne

**Une coordonnée d'écran ne s'écrit jamais telle quelle dans un élément zoomé.** Soit on la
convertit une fois, à un seul endroit, soit on ne zoome pas l'élément.

## Pourquoi il existe deux repères

La taille de l'interface (#410) est appliquée avec `zoom: var(--echelle-ui)` sur les conteneurs :
`header`, `.sidebar`, `.right-panel`, `.modal-box`, `.context-menu`, et les deux panneaux de
l'Éditeur de Personnage. `zoom` a été préféré à la conversion de 577 valeurs en pixels vers des
`calc()`, et cette décision tient toujours — mais elle coupe l'application en deux repères, et rien
dans le langage ne dit auquel un nombre appartient.

| d'où vient le nombre | ce que c'est |
|---|---|
| `e.clientX` / `e.clientY` d'un événement souris | pixels d'écran |
| `getBoundingClientRect()`, n'importe quel champ | pixels d'écran, zoom déjà compris |
| `window.innerWidth` / `innerHeight` | pixels d'écran |
| `style.left` / `style.top` sur un élément zoomé | **pixels zoomés**, multipliés par le facteur |

La dernière ligne est le piège. Toutes les sources de coordonnées d'un navigateur donnent des pixels
d'écran ; le seul endroit où on les écrit n'en est pas.

## Ce que ça a coûté, mesuré

Mesuré dans un vrai Chromium, sur le CSS réel de ce dépôt, au cran « Très grande » (facteur 1,3) :

- un `.context-menu` avec `left:200px` se rend à **260 px**. Rapport 1,3000, exactement le facteur ;
- un sous-menu ancré à 2 px de son déclencheur, à 448,19, s'ouvrait à **585,23** : 137 px trop loin
  horizontalement, 72 px trop bas.

⚠️ **ET LE RECADRAGE EMPIRAIT LES CHOSES AU LIEU DE LES RATTRAPER.** `clampFloatingMenu` *lisait* la
position du menu à l'écran et la *réécrivait* dans `style.left`, inconditionnellement, même quand le
menu tenait déjà. Chaque appel remultipliait donc la position par le facteur :

| passage | position écran | dans une fenêtre de 1600 px ? |
|---|---|---|
| après écriture | 585,23 | oui |
| clamp 1 | 760,80 | oui |
| clamp 2 | 989,03 | oui |
| clamp 3 | 1285,73 | oui |
| clamp 4 | 1671,45 | **non** |

La fonction chargée de garder le menu à l'écran était ce qui l'en expulsait. Dix-sept sites
portaient le défaut, menus racine compris : à ce réglage, un clic droit ouvrait déjà son menu à
côté du curseur, et pas seulement son sous-menu à côté du menu.

## La correction n'est pas une division, c'est la suppression d'une relecture

Diviser par le facteur aurait corrigé le décalage initial en laissant la composition intacte : deux
appels et la dérive repartait. `placerMenuFlottant3D` (src/ui-scale.js) prend l'**ancre**, jamais la
position courante du menu. Ce qu'on ne relit pas ne peut pas se composer. Le test qui compte
l'appelle dix fois avec la même ancre et exige dix réponses identiques.

⚠️ **Le recadrage se fait AVANT la conversion**, et cet ordre n'est pas décoratif : la fenêtre n'est
pas zoomée, les bornes doivent donc être comparées en pixels d'écran. Recadrer après avoir divisé
ramènerait le menu trop tôt et laisserait un blanc à droite, d'autant plus large que l'interface est
grande. Un test épingle la valeur exacte attendue du bon ordre.

## Les deux sorties, et laquelle choisir

**Convertir une fois** — pour tout ce qui est positionné à partir d'une coordonnée mesurée : les
menus flottants passent par là, via `src/ui-scale.js`.

**Ne pas zoomer l'élément** — pour tout ce qui doit se poser exactement sur autre chose.
L'infobulle maison (#412) a pris cette voie : elle est `position:fixed` hors des conteneurs zoomés,
sa taille suit le réglage par des `calc(… * var(--echelle-ui))`, et sa position reste en pixels
d'écran. Le commentaire à côté de `.infobulle` dans style.css énonçait ce piège avant #417, pour
l'infobulle seule, et personne n'avait aligné les menus dessus.

## Ce que les tests tiennent, et ce qu'ils ne tiennent pas

Tenu sous Node : l'arithmétique, la conversion de repère, le recadrage, et l'indépendance à tout
état courant.

⚠️ **Pas tenu : que `zoom` se comporte comme on le croit.** C'est du navigateur, pas du calcul, et
aucun test Node ne l'observe. Ça a donc été mesuré dans un vrai Chromium avant d'écrire une ligne,
et les chiffres sont recopiés dans le fichier de test comme points d'ancrage. Si un moteur change ce
comportement, la suite restera verte et les menus bougeront — c'est la mesure, pas la suite, qui
soutient cette note.

⚠️ **Une honnêteté au sous-pixel.** Sous recadrages répétés, la version corrigée mesurait 450,17
puis 450,16, 450,14, 450,13 : un centième de pixel perdu par passage, dû à l'aller-retour d'arrondi
des pixels CSS. Ce n'est pas une idempotence exacte *à l'écran*. La fonction pure, elle, l'est
exactement, parce qu'elle ne relit rien, et c'est ce que les tests affirment.
