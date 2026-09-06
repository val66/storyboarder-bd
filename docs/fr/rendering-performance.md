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

## Ce qui N'A PAS été tranché

L'échelle de rendu change **deux fois** pendant le chargement (`1,5 → 2,571`), et le second
changement survient après le rendu coûteux, au prix d'une passe complète de plus. Le déclencheur
est une mise en page qui se stabilise tard — la largeur disponible grandit, donc l'ajustement
grandit. Il n'a pas été identifié, et #405d l'a rendu non bloquant, ce qui a fait tomber l'intérêt
de le poursuivre. Écrit tel quel plutôt qu'habillé.
