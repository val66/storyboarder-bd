# Performance du rendu — mesurée, août 2026

*[English version](../en/rendering-performance.md)*

Cette note consigne une campagne de mesure pour que la prochaine personne qui se demande « le
chemin de dessin est-il lent ? » lise des chiffres au lieu de refaire des suppositions. La sonde qui
les a produits (`src/perf-probe.js`) a été retirée à la clôture de la campagne : le tableau est
l'actif durable, l'outil n'était que du code de diagnostic qui aurait traîné, comme
l'instrumentation du glisser d'articulation jusqu'au Fix 89.

## Pourquoi ces chiffres existent

Un audit d'architecture désignait quatre postes coûteux dans `drawCurrentPage`. Chacun d'eux était
une **inférence** : l'audit a été écrit en lisant le code, et lire du code ne dit pas ce qui coûte
des millisecondes. Deux de ces quatre soupçons se sont révélés faux d'un ordre de grandeur, et une
optimisation proposée n'absorbait rien du tout. C'est la raison d'être de cette note : *mesurer
avant de corriger* est une règle de ce dépôt, et voici la preuve qu'elle a produite.

## Ce qui a été mesuré

| | |
|---|---|
| Planche | 207 Éléments, dont 8 Cases |
| Résolution de rendu | 2,78 |
| Images échantillonnées | 1071 |
| Manipulation | glisser des Éléments, tourner la caméra, zoomer |

La sonde était éteinte par défaut (coût éteinte : ~13 ns par appel), agrégeait au lieu de
journaliser, et rapportait la médiane à côté de la moyenne, car la première image d'une session
construit tous les rigs et est plusieurs fois plus lente que les suivantes ; une moyenne seule
raconte le contraire de ce que vit l'utilisateur.

## Où passe le temps

`drawCurrentPage`, par image :

| | ms |
|---|---|
| médiane | **8,30** |
| p95 | 13,80 |
| max | 35,60 |

À 60 Hz le budget par image est de 16,7 ms : l'image médiane en consomme donc la **moitié**.

Répartition du total :

| Poste | Part | Remarques |
|---|---|---|
| Rendu WebGL d'une Case | **64 %** | ~0,69 rendu par image, le cache 3D absorbant le reste |
| Signature de Case | **16 %** | 8568 appels, soit 8 par image, un par Case, succès ou manque |
| Autre dessin 2D | 11 % | |
| Reconstruction du panneau latéral | 7,6 % | |
| Réallocation du canevas + zoom | 0,6 % | |

Le taux de succès du cache 3D était de **91,4 %**. La signature est calculée à chaque appel, succès
compris : c'est le coût incompressible du chemin, et s'il arrive en deuxième position c'est
précisément parce qu'il s'exécute huit fois par image quand le rendu qu'il protège s'exécute moins
d'une fois.

## Ce que l'audit avait faux

| Affirmation | Mesure |
|---|---|
| « La réallocation du canevas (`_canvas.width = …`) coûte autant que le dessin » | 0,6 % |
| « Le panneau latéral est reconstruit entièrement à chaque image, et ça se voit » | 7,6 %, réel mais pas prioritaire |
| « Le rendu 3D est recalculé à chaque appel » | Faux ; `panelSceneCache3D` existait déjà et réussit 91,4 % du temps |
| « Coalescer les demandes de dessin absorbera une bonne part du travail » | 1018 demandes ont produit 1018 images, elle n'a donc rien absorbé pendant cette campagne |

Le planificateur de coalescence a été conservé malgré tout : il ne coûte rien quand il ne se
déclenche jamais, et il borne le pire cas sur une souris plus rapide que celle utilisée ici. Mais il
ne faut pas lui attribuer un gain qui n'a pas été observé.

## Est-ce que ça passe à l'échelle ?

Le poste dominant, le rendu WebGL, ne croît **pas** avec le nombre de Cases : seule la Case dont la
signature a changé est re-rendue, et un geste n'en touche qu'une à la fois. Ce qui croît
linéairement, c'est la signature, à environ 0,17 ms par Case et par image.

| Cases | Médiane projetée |
|---|---|
| 8 (mesuré) | 8,30 ms |
| 16 | ~9,7 ms |
| 32 | ~12,6 ms |

Même à 32 Cases (quatre fois la Planche mesurée), l'image reste dans le budget des 60 Hz.

## Verdict : pas critique

Consigné pour que la décision ne soit pas discrètement renversée plus tard. L'argument le plus fort
n'est pas dans le tableau ci-dessus : sur une journée entière de retours détaillés et précis, la
lenteur n'a jamais été signalée une seule fois. Les chiffres ont confirmé l'absence de plainte
plutôt qu'ils n'y ont répondu.

Si le tableau change, la première chose à attaquer est la signature : huit `JSON.stringify` par
image pour protéger un cache qui réussit neuf fois sur dix, et non le rendu WebGL, déjà protégé.

## Refaire la mesure

La sonde n'est plus là ; la recréer est volontairement un petit travail. Ce dont elle a besoin, et
pourquoi :

- **éteinte par défaut**, allumée depuis la console, car une sonde toujours active mesure une partie de
  son propre coût ;
- **agréger, ne pas journaliser** : un `console.log` par image coûte plus cher que ce qu'on cherche
  à mesurer et déforme précisément le chemin observé ;
- **compte et total exacts tenus à part de l'échantillon borné** : les quantiles ont besoin d'un
  échantillon plafonné, la somme n'en a aucun besoin. La première version plafonnait à 2000 et
  rapportait la somme sur cet échantillon : « signature » avait été appelée 8568 fois, et sa part
  était sous-estimée d'un facteur quatre ;
- **dire ce que veut dire un tableau vide.** Un rapport qui n'affiche rien ressemble à « mesuré,
  rien à signaler » alors qu'il veut dire « jamais démarré » : le même silence trompeur qu'une garde
  qui avale un échec.

---

# Deuxième campagne — ce que coûte une grande image, septembre 2026

Ouverte par #403 et laissée sans réponse, expressément : « une photographie 6000×4000 redessinée à
chaque rafraîchissement n'est pas gratuite, et le chiffre est inconnu ». Le remède évident était
nommé en même temps — redimensionner à l'import — et délibérément pas appliqué, parce qu'*un remède
choisi avant la mesure est une supposition*. **La mesure a disqualifié ce remède.**

## Méthode

Un A/B plutôt qu'un chiffre isolé, parce que `drawImage` peut être asynchrone côté GPU : l'appel
rend la main avant que le travail soit fait, donc une valeur absolue peut sous-estimer d'un facteur
inconnu. Quoi que le chronomètre capture, il le capture à l'identique des deux côtés, donc l'**écart**
reste interprétable là où la valeur ne l'est pas.

Même Planche, mêmes gestes, même Case (325×347 unités), une image échangée contre la même image à
une autre définition.

## Ce qui a été mesuré

| | 6000×4000 | 2000×1333 |
|---|---|---|
| appels à `drawImage` | 782 | 622 |
| appels atteignant un tick de 0,1 ms | 59 (**7,5 %**) | 46 (**7,4 %**) |
| `drawCurrentPage` médiane | **0,9 ms** | **0,9 ms** |
| `drawCurrentPage` p95 | 1,1 ms | 1,0 ms |
| `drawCurrentPage` max | **32,2 ms** | 1,7 ms |
| bitmap décodé (arithmétique) | **91,6 Mo** | **10,2 Mo** |

`performance.now()` est bridé à ~0,1 ms dans Chromium : les temps individuels de `drawImage` sont
donc au plancher de résolution, et la lecture honnête est « sous 0,1 ms », pas « 0,008 ms ». La
grandeur comparable est la *proportion* d'appels ayant atteint un tick, et elle est la même des deux
côtés à neuf fois plus de pixels.

## Trois constats

**1. Dessiner une grande image ne coûte rien de mesurable, et neuf fois plus de pixels n'y change
rien.** 7,5 % contre 7,4 %. Redimensionner à l'import ne gagnerait strictement rien sur le chemin de
dessin.

**2. Une Planche d'images est un ordre de grandeur moins chère qu'une Planche de 3D.** Frame médiane
de 0,9 ms ici contre 8,30 ms lors de la campagne d'août. Une Case à image ne fait aucun rendu WebGL,
qui pesait là-bas 64 % du coût. Les images sont le cas bon marché, pas le cas cher.

**3. Le seul coût réel est la mémoire, et c'est de l'arithmétique, pas une mesure.** 91,6 Mo par
image 6000×4000 décodée. Le cache retient toutes les images du Projet ouvert et ne se vide qu'au
changement de Projet : le chiffre croît donc avec le nombre d'images *distinctes*, jamais avec le
dessin.

Le maximum de 32,2 ms n'est apparu que sur la grande image, sur 391 frames, et c'est plausiblement
le transfert unique de la texture. **C'est un échantillon unique et il n'est pas attribué** : un
à-coup dans une passe n'est pas une preuve, et le dire coûte moins cher qu'une explication qui
sonnerait convaincante.

## Pourquoi le redimensionnement à l'import est écarté

Outre qu'il ne gagne rien (constat 1), il **casserait une fonctionnalité livrée trois jours plus
tôt**. Le zoom du cadrage (#403f) monte à 4× ; à 4×, le dessin prélève le quart de la largeur de
l'image pour la même Case :

| pixels source / pixels écran | zoom 1× | zoom 4× |
|---|---|---|
| original 6000 px | 3,65 | **0,91** |
| redimensionné 2000 px | 1,22 | **0,30** |

Sous 1,0 l'image est *agrandie*, donc visiblement molle. L'original est à la limite à 4× ; le
redimensionné est étiré plus de trois fois. Redimensionner à 2000 échangerait une économie de dessin
non mesurable contre une perte de netteté visible, dans une fonctionnalité dont tout l'objet est de
regarder de près.

## Ce qui n'a PAS été mesuré, et qui compte

**Le temps de décodage.** La sonde a été allumée *après* l'insertion de l'image : le décodage et la
lecture disque avaient déjà eu lieu et n'ont jamais été échantillonnés. Décoder un JPEG de 2,4 Mo
prend plausiblement de quelques dizaines à quelques centaines de millisecondes, une fois, à
l'ouverture d'un Projet. C'est hors du chemin critique par construction — `preloadImages` est lancé
sans être attendu et la Case affiche « Chargement… » — mais le chiffre est inconnu, et c'est le seul
endroit où le redimensionnement *aiderait*. Si un Projet à vingt grandes images paraît un jour lent
à ouvrir, c'est cela qu'il faudra mesurer, et seulement alors.

## Verdict : on garde les pixels d'origine

Consigné pour que la décision ne soit pas renversée en silence. Si la mémoire devient un jour le
problème, le remède est de **borner le cache** — évincer les images des Planches qui ne sont pas à
l'écran — ce qui ne coûte aucun pixel. Détruire de la donnée à l'import pour économiser un coût
mesuré à zéro serait le mauvais échange, et il est désormais écrit qu'il a été mesuré plutôt que
supposé.

---

# Troisième campagne — pourquoi une Planche légère met plus d'une seconde, septembre 2026

Signalé à l'usage : « ouvrir le projet et charger une Planche met plus d'une seconde alors qu'en
vrai il y a assez peu de choses sur la planche en question ». Deux hypothèses concurrentes, et la
mesure était là pour les départager, pas pour confirmer celle qu'on préférait.

| | |
|---|---|
| H1, les fichiers | Le préchargement reçoit les objets de TOUS les Tomes et de TOUTES les Scènes d'un bloc ; l'analyse GLB s'exécute sur le fil principal, donc une Planche légère attend derrière des fichiers dont elle n'a pas besoin. |
| H2, les rigs | Changer de Planche vide le cache 3D, donc chaque Case se reconstruit. La note d'août dit déjà que la première frame d'une session construit tous les rigs et coûte plusieurs fois le reste. |

**H2 l'emporte, et largement.** La frame de 986 ms *commence à 1 411 ms* ; le dernier modèle était
prêt à 1 403 ms. Elle ne l'attendait pas, elle était déclenchée par son arrivée : `preloadModels`
appelle `_onChange()` une fois après le `Promise.all`, et ce redessin reconstruisait les sept rigs
de la Planche dans une seule frame bloquante — 329 + 60 + 57 + 68 + 111 + 117 + 242.

## Ce que la chronologie a montré et que les agrégats ne pouvaient pas dire

Des durées disent ce que coûte chaque chose. Elles ne disent pas si la Planche ATTENDAIT. Des
jalons — des instants, pas des durées — ont répondu directement. Un second ajout a fait nommer aux
ratés de cache **quel segment de la signature avait changé**, ce qui a séparé le légitime du
gaspillage :

| cause du raté | verdict |
|---|---|
| « état du cache des modèles » | légitime : les modèles sont vraiment arrivés, les rigs doivent vraiment être reconstruits |
| « échelle de rendu » | gaspillage : aucun contenu n'a changé, seul `S.pageRenderScale` a bougé |

## Trois corrections, et ce que chacune rapporte

**#405c — `fitZoomToWrap` passait par le délai de 150 ms prévu pour la molette.** Toute la Planche
était rendue à l'ancienne échelle, puis DE NOUVEAU à la nouvelle, l'échelle faisant partie de la
signature du cache 3D. Ajuster la vue n'est pas un geste : il n'y a rien à regrouper. Poser
l'échelle sans délai a supprimé une passe complète (35 rendus → 28). Le délai reste là où il gagne
quelque chose : pendant un zoom à la molette, rendre en pleine résolution à chaque cran coûterait
cher pour des images que personne ne regarde.

**#405d — un rig reconstruit par frame au lieu des sept.** Le travail est irréductible ; le faire
d'un bloc était un choix. Une Case au-delà du budget garde son image précédente (périmée d'une
frame, donc invisible) ou reste à son fond si elle est froide.

| | avant | après |
|---|---|---|
| frame la plus longue | **986 ms** | **315 ms** |
| rendus de Case | 28 | **15** |
| total du dessin | 1 685 ms | 1 287 ms |

Les rendus ont presque diminué de moitié, ce qui n'était pas prévu : une Case reportée est
redemandée plus tard avec une signature déjà à jour, donc les états intermédiaires ne sont jamais
rendus.

**#406b — précharger en trois vagues**, sur demande de l'utilisateur : la Planche affichée, puis le
reste de son Tome, puis tout le reste. Mesuré sur un Projet synthétique (4 Tomes, 32 Planches, 22
modèles distincts dont 4 seulement sur la première Planche), contre une passe témoin cascade
désactivée :

| | témoin (une vague) | cascade |
|---|---|---|
| modèles de la Planche prêts | 2 540 ms | **947 ms** |
| Planche entièrement rendue | 3 193 ms | **1 568 ms** |
| tous les modèles du Projet | **2 600 ms** | 3 242 ms |

**C'est un ÉCHANGE, pas un gain net**, et la note le dit : le Projet complet finit 642 ms plus tard.
On obtient ce qu'on regarde deux fois plus tôt, et ce qu'on ne regarde pas une demi-seconde plus
tard.

Un effet secondaire à consigner : l'analyse GLB est PLUS LENTE en témoin (médiane 1 409 ms contre
917), et la lecture disque aussi (536 contre 300). Vingt-deux analyses concurrentes se gênent plus
que quatre puis dix-huit. La cascade ne fait donc pas que réordonner, elle réduit la contention.

## Méthode : trois pièges où cette campagne est tombée

**`perfTempsAsync` mesure le temps ÉCOULÉ autour d'un `await`.** Six analyses qui se chevauchent
gonflent mutuellement leur durée : un total de 3 875 ms sur six appels n'est pas 3 875 ms de
travail, tout était fini à 1 308 ms. Ne jamais additionner ces lignes.

**La sonde doit S'ARMER AVANT LE DÉMARRAGE.** Le Projet se charge pendant l'initialisation, bien
avant qu'on puisse taper dans la console ; une sonde allumée à la main manque précisément ce
qu'elle doit mesurer. C'est ainsi que la campagne #404 a perdu le temps de décodage. Elle s'arme
par `localStorage`, et reste éteinte par défaut.

**Un lot de mutations tué par le délai laisse le dépôt muté.** C'est arrivé de nouveau, sur la
mutation qui fait s'appeler la boucle de dessin elle-même — précisément celle qui bloque la suite.
Rejouer les mutations une par une quand l'une d'elles peut boucler.

## Campagne 4 — le second changement d'échelle, enfin nommé

Trois campagnes durant, cette note a porté une ligne non tranchée : l'échelle de rendu change
**deux fois** pendant le chargement (`1,5 → 2,571`), le second changement tombe après le rendu
coûteux, et il coûte une passe complète de plus. Le déclencheur était décrit comme « une mise en
page qui se stabilise tard », ce qui était une supposition habillée en observation.

**C'est l'arithmétique qui l'a nommé, et aucune sonde n'a été nécessaire.** `canvasWrap.clientHeight`
vaut au plus 791 px à la première passe, et 1316 px à la seconde. `main.js` créait la fenêtre à
1280 × 860 en dur, et rien dans le code ne la maximise ni ne restaure une taille précédente. Une
zone de dessin ne peut pas faire 1316 px de haut dans une fenêtre de 860. Quelque chose avait fait
grandir la fenêtre de 500 px, et le seul candidat restant était l'utilisateur.

C'en était un. La fenêtre s'ouvrait petite, et elle était maximisée à la main une seconde plus
tard. **Il n'y avait aucun défaut.** L'écart entre les passes (1 501, 2 306, 3 132 ms jusqu'à une
Planche entièrement rendue) en découle aussi : plus la maximisation arrive tôt, plus la seconde
passe de rendu percute de travail de chargement.

Deux choses méritent d'être gardées.

**Le remède n'était pas dans le renderer.** `fitZoomToWrap` faisait correctement son travail les
deux fois. #407b a fait en sorte que la fenêtre **retienne sa géométrie** entre deux lancements
(`window-state.js`, plus un champ `windowState` dans `settings.json`) et qu'elle se maximise
**avant** `loadFile`, pour que le renderer mesure sa zone de dessin une seule fois, à la taille
finale. La seconde passe disparaît parce que la cause disparaît, pas parce que le symptôme a été
étouffé.

**Deux campagnes ont été passées à chercher dans l'application ce qui était en dehors.** Les
chiffres étaient justes depuis le début ; ce qui manquait, c'était une question à l'utilisateur.
Avant de modéliser un mécanisme pour expliquer une mesure, vérifier que la mesure ne décrit pas
simplement ce que la personne a fait.

---

# Cinquième campagne — pourquoi une Planche se redessine quand on y revient, septembre 2026

Signalé à l'usage : *« Quand je passe d'une Planche à l'autre, les Cases avec des Éléments se
rechargent visiblement, alors que la Planche a déjà été chargée avant. Le contenu ne peut pas avoir
changé. »*

Il ne pouvait pas, et l'application n'a jamais cru le contraire. `drawCurrentPage` **vidait**
`panelSceneCache3D` à chaque changement de Planche, puis #405d en reconstruisait une par frame. Le
mécanisme était lisible dans le code ; ce que personne ne savait, c'est ce qu'il **coûte**, et sans
ce chiffre aucun remède ne pouvait être jugé.

## Ce que coûte une Case en cache, mesuré hors application

Une entrée est un canevas à la résolution de la Planche entière, plafonné par
`PANEL_SCENE_RENDER_MAX_PX`. Calculé sur les formats réels et les Projets réels de l'utilisateur :

| format | 1× | 2× | 3× | 4× |
|---|---|---|---|---|
| Franco-Belge | 1,5 Mo | 6,1 Mo | 13,7 Mo | 16,7 Mo |
| Comics US | 1,3 Mo | 5,4 Mo | 12,1 Mo | 14,3 Mo |
| Webtoon | 1,0 Mo | 3,9 Mo | 8,8 Mo | 13,7 Mo |

L'échelle vaut `zoom × devicePixelRatio`, plafonnée à 4, et **l'octet varie comme son carré**.
« Projet 2 » porte jusqu'à 9 Cases 3D sur une Planche : 48 Mo à l'échelle 2, et 312 Mo pour le
Projet entier. Le vidage complet avait donc une vraie raison ; il était seulement bien trop brutal.

## Ce que coûte réellement le retour

| mesure | valeur |
|---|---|
| remplissage après un changement de Planche | 245 ms de médiane, 8 frames |
| une Case, premier rendu | 12,5 ms de médiane, 145 ms au pire |
| une Case, au retour | 13,1 ms de médiane, **33 ms de moyenne**, 296 ms au pire |
| rigs reconstruits sur 112 retours | 0, sauf 14 « modèle arrivé » |

Les rigs survivent bien au changement de Planche : ils vivent dans `personaRigCache3D`, indexés par
id d'Élément. Les 14 reconstructions ont toutes l'unique cause légitime, un `.glb` qui a fini de se
décoder, et n'arrivent qu'une fois.

## Deux remèdes ont été construits, mesurés, et retirés

**Un budget en TEMPS par frame au lieu d'« une Case par frame » (#411e/g).** Le raisonnement : 332 ms
de remplissage pour 8 frames contre un rendu médian de 13 ms, donc les deux tiers de l'attente
seraient *entre* les frames. Grouper les Cases bon marché devait diviser la durée. Le mécanisme a
parfaitement joué — frames par remplissage de 7 à 3, Cases par frame de 1 à 3 — et **la durée n'a
pas bougé** : 245 ms avant, 289 après, dans le bruit d'un relevé à quinze échantillons dont les
médianes successives donnaient 332, 284, 245.

Le raisonnement comparait une **médiane à une moyenne**. Une Case coûte 13 ms en médiane mais 33 en
moyenne, la queue allant jusqu'à 296. Huit Cases à 33 ms font 264 ms, soit le remplissage observé.
Il a toujours été la **somme du travail** ; l'attente entre frames était un artefact de deux
statistiques mal appariées. La même faute avait déjà produit un fantôme de « 34 ms de frais par
frame » là où la mesure a ensuite trouvé 2,1 ms.

**Et le budget était mesuré sur la mauvaise chose.** Il échantillonnait la période d'affichage à
partir des écarts de `requestAnimationFrame`, à la première frame limitée donc en plein chargement,
et obtenait `103,7 / 111,2 / 136,1 / 3,5 / 2,9`. Aucune statistique ne sauve cet échantillon :
minimum 2,9, médiane 103,7, moyenne 71,5, vérité 16,7. C'est la fenêtre qui était fausse, pas
l'estimateur. Il retombait sur le plancher de 4 ms, qu'une Case de 13 ms dépasse toujours, et le
code reproduisait « une Case par frame » sous un autre nom.

L'erreur de fond était le repère. Pendant un remplissage l'application n'anime rien ; ce qui compte
est de **rendre la main assez souvent pour qu'un clic soit pris**, et ce seuil-là est publié (50 ms,
la définition d'une tâche longue) plutôt que mesurable depuis le code. La période de l'écran avait
l'air mesurable, ce qui n'est pas la même chose qu'être la bonne question.

## Ce que les mesures soutenaient : garder les Planches récentes

Vider le cache n'a jamais été requis pour la justesse — les identifiants sont uniques dans tout le
Projet, et la signature de Case refuse déjà une image périmée. C'était une politique de mémoire.
Garder **une** Planche d'historique ne suffisait pas : sur une rotation A → B → C → A, celle qu'on
rouvre est toujours celle qu'on vient d'évincer. Le relevé le dit sans appel — **87 Cases évincées,
87 Cases re-rendues, les mêmes**. C'est le cas d'école du cache plus petit que le cycle, et il donne
exactement zéro succès.

Une liste de récence sous un **plafond en octets** l'a remplacée. En octets plutôt qu'en nombre de
Planches, parce qu'une Planche coûte 36 à 67 Mo selon sa charge et environ le triple à la plus
grande taille d'interface : un nombre de Planches serait prudent sur un écran et ruineux sur un
autre.

| plafond | remplissage (moy.) | frames (moy.) | Cases re-rendues | retenu |
|---|---|---|---|---|
| tout vider (avant) | 223 ms | 8 | 87 | 0 |
| 1 Planche d'historique | 229 ms | 8 | 87 | 71 Mo |
| 200 Mo | 107 ms | 3,2 | 34 | **195,7 Mo, saturé** |
| 300 Mo (livré) | voir ci-dessous | | | |

200 Mo tenaient trois Planches sans la moindre marge, donc chaque changement en poussait quelques
Cases dehors. Le défaut est passé à 300 Mo, et le plafond est devenu un **réglage** (0 à 900 Mo) :
ce qu'il faut dépend de la charge des Planches, du format, de l'échelle de rendu et de la machine,
choses qu'aucune constante ne peut connaître. Zéro est une valeur valide et non une désactivation :
la Planche affichée n'est jamais évincée, donc zéro rend exactement le comportement d'avant cette
campagne.

## Deux pièges, dont un deux fois

**Un relevé qui n'observe que l'EFFET attendu ne peut pas diagnostiquer son absence.** #411e mesurait
les frames par remplissage, jamais les Cases par frame ni le budget appliqué. Quand rien n'a bougé,
les données ne pouvaient pas dire si le regroupement n'avait pas eu lieu ou s'il avait eu lieu sans
servir — deux diagnostics opposés. Le relevé suivant, mécanisme instrumenté, a répondu en une ligne.
La leçon avait déjà été payée sur les compteurs de rigs, qui comptaient les reconstructions en tout
sans dire **quand**, total également compatible avec « toutes au premier rendu » et « certaines à
chaque retour ».

**Raisonner sur une quantité qui n'existe pas encore.** Le premier plafond bornait l'historique à un
multiple du coût de la Planche *courante*, lu au moment du changement de Planche, c'est-à-dire avant
qu'elle ait rendu quoi que ce soit. Coût zéro, plafond zéro, **0 Case gardée sur 75**. L'élagage est
passé à la fin du remplissage, là où tous les octets existent et se comptent.

---

# Septième campagne — ce que coûtent une, trois et huit lumières, septembre 2026

Chantier #420f. La note des sources positionnées portait depuis le premier jour une phrase non
vérifiée : « chaque lumière ajoutée fait recompiler les shaders ». Elle est vraie, et elle ne dit
pas ce qu'il fallait savoir. Le plafond devait être **mesuré avant d'être décidé**, et c'est ce que
cette campagne a fait.

## L'instrument, et les trois fois où il a menti

Le rendu d'une Case est du WebGL : ni Node ni une sonde 2D ne peuvent en dire quoi que ce soit. La
mesure a donc tourné dans un vrai navigateur, sur le vrai GPU, avec **le three.js du dépôt** — la
copie servie par le CDN a été vérifiée identique au fichier local, même SHA-256
(`9274bbce…`), même révision r128. La scène reproduit une Case : 52 maillages et 14 matériaux, ce
que donnent deux Personnages et quatre Objets construits par les constructeurs du dépôt, plus le
Sol (`PlaneGeometry(_, _, 100, 100)`, `DoubleSide`), soit 20 624 triangles, rendus en 1400 × 1980 —
le plafond de `PANEL_SCENE_RENDER_MAX_PX`. Le renderer reçoit les mêmes options que
`personaRenderer3D` : `antialias`, `logarithmicDepthBuffer`, `preserveDrawingBuffer`.

⚠️ **TROIS INSTRUMENTS SUCCESSIFS ONT DONNÉ DES CHIFFRES FAUX, ET LE TROISIÈME A ÉTÉ DÉMASQUÉ PAR UN
TÉMOIN, PAS PAR L'INTUITION.** Le détail vaut d'être gardé, parce que les trois pièges sont
génériques et qu'aucun ne se voit dans le résultat.

| instrument | ce qu'il annonçait | pourquoi c'était faux |
|---|---|---|
| `gl.finish()` | 0,2 ms quel que soit le nombre de lumières | ne synchronise rien à travers le processus GPU de Chromium : on mesurait l'envoi des commandes, pas leur exécution |
| `readPixels` sur le tampon d'affichage | 16,7 ms quel que soit le nombre de lumières | attend la présentation à l'écran : on mesurait la période du moniteur, exactement le piège de la cinquième campagne |
| `readPixels` sur une cible hors écran | — | tient |

Le témoin qui a tranché : la même scène remplacée par **quarante plans pleine vue** empilés, et la
taille passée de 1400 × 1980 à 4000 × 4000. Seize fois plus de fragments doivent se voir. Sous
`gl.finish()` le chiffre ne bougeait pas d'un dixième de milliseconde — verdict immédiat. Sous la
cible hors écran, il passe de 16,7 à 32 ms en montant à 64 lumières, et les mesures de la Case
réelle se divisent par quatre quand on divise la surface par quatre. **Un instrument qui ne sait pas
voir une présence ne peut pas mesurer une absence**, et c'est la quatrième fois que ce dépôt le
paie.

## Le coût par image : il n'y en a pas

Rendu d'une Case, médiane sur 30 images, cible hors écran :

| lumières posées | 350 × 495 | 700 × 990 | 1400 × 1980 |
|---|---|---|---|
| 0 | 0,7 ms | 0,7 ms | **0,7 ms** |
| 8 | 0,7 ms | 0,7 ms | **0,9 ms** |
| 16 | 0,7 ms | 0,8 ms | 1,2 ms |
| 24 | 0,7 ms | 0,9 ms | 1,6 ms |
| 32 | 0,7 ms | 0,9 ms | 1,8 ms |
| 48 | 0,9 ms | 1,2 ms | 2,3 ms |

**Huit sources coûtent 0,2 ms de plus qu'aucune**, à pleine résolution. Le repère de la cinquième
campagne est de 13 ms de médiane pour rendre une Case : huit lumières en consomment **1,5 %**. Même
trente-deux n'ajoutent qu'une milliseconde. Le coût croît bien avec la surface, ce qui est la
signature d'un travail par fragment réel et non d'un artefact, mais il part de si bas que la
croissance ne rencontre jamais le budget.

⚠️ **UNE VALEUR À 64 LUMIÈRES A ÉTÉ ÉCARTÉE** : 16,7 ms à pleine résolution, soit exactement la
période de l'écran, alors que les deux tailles inférieures donnent 0,9 et 1,4 ms. Un point qui vaut
précisément la période du moniteur après qu'on a déjà été piégé deux fois par elle n'est pas une
mesure. Il n'est pas expliqué, et il n'est pas utilisé.

## Le vrai coût : la première rencontre d'un nombre

C'est ici que la phrase non vérifiée devient un chiffre. Chaque **nombre de lumières** rencontré
pour la première fois fait compiler les programmes GLSL de la Case. Mesuré en rendant la scène avec
des matériaux neufs à chaque essai — un `define` unique force une compilation froide, sans quoi le
cache de programmes de Chromium répond à la place du GPU :

| lumières | min | médiane | max |
|---|---|---|---|
| 0 | 15,6 ms | **17,0 ms** | 104,6 ms |
| 1 | 16,5 ms | **116,7 ms** | 166,7 ms |
| 2 | 116,6 ms | 116,8 ms | 134,7 ms |
| 3 | 133,2 ms | **150,2 ms** | 198,5 ms |
| 4 | 151,5 ms | 167,1 ms | 198,9 ms |
| 6 | 199,9 ms | 200,2 ms | 250,4 ms |
| 8 | 233,2 ms | **251,9 ms** | 283,7 ms |

Les durées sont **quantifiées par la période de l'écran** — la compilation a lieu dans le processus
GPU et le blocage ne retombe pas toujours sur le rendu qui l'a demandée. La distribution entière est
donc donnée plutôt qu'une médiane seule, et la lecture honnête porte sur la tendance : **environ
30 ms par lumière**, une compilation à vide coûtant déjà 17 ms.

## Pourquoi ce coût est payé UNE fois, et non à chaque image

Trois mécanismes de three.js r128, lus dans la source et vérifiés par la mesure :

1. `lights.state.version` ne change **que** si le nombre de lumières change (`WebGLLights.setup`,
   comparaison de hachage). Bouger une lumière, changer sa couleur ou son intensité ne recompile
   rien.
2. Seuls les matériaux **éclairés** repassent par `getProgram` (`materialNeedsLights`). Un
   `MeshBasicMaterial` garde son programme.
3. Chaque matériau retient une **table de ses programmes par clé**, et `acquireProgram` en tient une
   seconde à l'échelle du renderer. Un nombre déjà rencontré est donc gratuit, et un rig qui arrive
   en cours de session ne recompile rien.

Les trois se mesurent. Revenir sur un nombre déjà rencontré : **0,4 ms**. Un rig neuf ajouté à la
scène alors que les anciens vivent encore : **0,5 ms**, et le compte de programmes ne bouge pas.
Alterner trois Cases à 0, 3 et 8 lumières coûte 1,4 ms contre 0,8 ms pour trois Cases au même
nombre, soit **0,2 ms par changement de nombre** — le prix du `useProgram` et du renvoi des
uniformes, pas d'une compilation.

⚠️ **ET LES PROGRAMMES MEURENT AVEC LES MATÉRIAUX.** `releaseProgram` supprime un programme dès que
plus aucun matériau ne s'en sert : détruire les matériaux d'une Case puis en recréer d'identiques
coûte **66,7 ms**, mesuré. Le dépôt ne détruit les matériaux qu'au **changement de Projet**, ce qui
est exactement le bon moment ; c'est une contrainte à ne pas piétiner en croyant faire du ménage.

## Ce qui borne le coût : deux programmes, pas cinquante

La compilation ne coûte cher qu'une fois par nombre parce qu'une Case n'a que **deux programmes
distincts**, et ce chiffre ne dépend pas du nombre d'Éléments. Compté sous Node sur les
constructeurs de rig du dépôt :

| contenu | instances de matériau | programmes distincts |
|---|---|---|
| les 39 constructeurs de rig + 2 Personnages, sans le Sol | 49 | **1** |
| 2 Personnages + 4 Objets + le Sol | 14 | **2** |
| les 39 constructeurs de rig + 2 Personnages + le Sol | 50 | **2** |

**Tout le mobilier du dépôt tient donc dans UNE seule clé**, et le Sol en ajoute une seconde à lui
tout seul : il est `DoubleSide`, ce que rien d'autre n'est. Un
modèle `.glb` importé en ajoute un troisième, parce qu'il arrive en `SkinnedMesh` — `skinning` entre
dans la clé — et davantage s'il porte des textures.

C'est donc une propriété à **tenir** : un réglage par Élément qui entrerait dans la clé de programme
— un ombrage à facettes, une face double, une carte — multiplierait d'un coup le coût de chaque
nouveau nombre de lumières, et rien ne le signalerait. `tests/light-source-3d.test.mjs` la fige.

## La moitié JavaScript, pour mémoire

Mesurée sous Node, même protocole que la sixième campagne : chauffe puis médiane sur 60
échantillons.

| lumières | `planLumieresPosees3D` | part ajoutée à la signature de Case |
|---|---|---|
| 0 | 0,105 µs | — |
| 1 | 0,357 µs | +1,0 µs |
| 3 | 0,759 µs | +3,1 µs |
| 8 | 1,659 µs | +8,1 µs |
| 32 | 6,261 µs | — |

Huit lumières sur huit Cases coûtent **0,013 ms par image** au plan, et environ 0,065 ms à la
signature. Strictement linéaire, et sans commune mesure avec le reste. Une lumière pèse dans la
signature comme n'importe quel Élément, un peu plus parce que son JSON est plus long : 213
caractères contre 152 pour un Personnage.

## Verdict : le plafond est de huit, et ce n'est pas pour la vitesse d'affichage

Consigné pour que la raison ne se perde pas, car elle n'est pas celle qu'on attendait.

**Aucun plafond n'est justifié par le coût par image.** Huit sources ajoutent 0,2 ms à une Case qui
en coûte 13 ; trente-deux en ajoutent une. Si la question avait été « est-ce que ça rame », la
réponse serait « posez-en autant que vous voulez ».

**Ce qui justifie un plafond est le à-coup.** Chaque clic qui amène un nombre de lumières jamais
rencontré fige l'application de 120 à 250 ms, une fois. Les repères du dépôt sont le pire rendu de
Case déjà observé, **296 ms**, et un remplissage de Planche à 245 ms. Huit lumières tiennent sous ce
pire cas ; douze donnent 334 ms et seize 417 ms, au-dessus de tout ce que l'application produit
aujourd'hui.

**Huit est donc le plus grand nombre dont la première rencontre reste dans ce que l'application se
permet déjà.** Le chiffre du découpage de #420 était une supposition ; la mesure tombe dessus, ce
qui est une coïncidence et mérite d'être dit comme telle.

⚠️ **ET LE REMÈDE, SI CE PLAFOND GÊNE UN JOUR, N'EST PAS DE LE MONTER MAIS DE PRÉCHAUFFER.** Rien
n'oblige à découvrir un nombre de lumières au moment où l'utilisateur clique : les programmes
peuvent se compiler à l'avance, au repos, comme le dépôt étale déjà la construction des rigs
(#405d). Le plafond répond au à-coup, et le à-coup a un autre remède que l'interdiction.

## Ce que cette campagne lègue aux ombres portées

#422 était bloquée par celle-ci. Elle est débloquée, avec trois choses sues :

1. `numPointLightShadows` entre dans la clé de programme **à côté** de `numPointLights`. Activer les
   ombres ne double pas le coût de compilation, il ouvre un **second axe** de nombres à rencontrer.
2. Une ombre de source ponctuelle est une carte **cubique** : six passes de profondeur par lumière
   et par image. C'est un coût par image, celui-là, et il n'a rien à voir avec les 0,2 ms
   ci-dessus — il faudra le mesurer pour lui-même.
3. Le budget est connu : une Case coûte 13 ms de médiane et l'image 16,7 ms. C'est contre cela que
   les six passes se jugeront.

## Refaire la mesure de septembre 2026

La sonde WebGL est jetable et n'a pas été conservée, comme les précédentes. Ce dont elle a besoin,
et pourquoi :

- **une cible de rendu hors écran**, jamais le tampon d'affichage, sinon on mesure le moniteur ;
- **`readPixels` après chaque rendu**, car `gl.finish()` ne synchronise rien sous ANGLE ;
- **un `define` unique par essai**, sans quoi le cache de programmes de Chromium répond à la place
  du GPU et la deuxième mesure d'un même nombre ne mesure plus rien ;
- **des matériaux gardés en vie**, sinon `releaseProgram` détruit les programmes et l'essai suivant
  paie une compilation qu'on croyait acquise ;
- **un témoin qui doit BOUGER** — quarante plans pleine vue, quatre fois plus de pixels — vérifié
  avant de croire le moindre chiffre.
