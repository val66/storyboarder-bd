# Performance du rendu — mesurée, août 2026

*[English version](rendering-performance.md)*

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
