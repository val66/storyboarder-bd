# Notes internes

*[English version](../en/README.md)*

Documentation de contributeur. Ce qui s'adresse à l'utilisateur est dans le
[README](../../README.fr.md) et dans le manuel intégré (`src/help-content.js`).

## À lire avant de toucher au code

| Document | Ce qu'il évite |
|---|---|
| [**persisted-data.md**](persisted-data.md) | Rendre illisibles tous les fichiers projet existants, sans que rien ne le signale. |
| [**3d-rendering-single-sources.md**](3d-rendering-single-sources.md) | Réintroduire la duplication qui a produit cinq bugs successifs dans le rendu 3D. |
| [**imported-skeletons.md**](imported-skeletons.md) | Supposer une convention d'os que les fichiers réels ne respectent pas. |

Ces deux-là ne sont pas des recommandations de style : une infraction coûte des données ou une
régression difficile à retrouver.

## Pour comprendre le code

| Document | Sujet |
|---|---|
| [3d-reference-frames.md](3d-reference-frames.md) | Constantes du monde, coordonnées canvas vs monde, orientation, échelles des rigs. |
| [architecture.md](architecture.md) | Règles de modules, imports circulaires, état partagé, nomenclature. |
| [testing-method.md](testing-method.md) | Test par mutation, extraction pour rendre testable, ce qui est hors de portée. |
| [pose-library.md](pose-library.md) | Poses : où elles vivent, enregistrer, supprimer, restaurer, fusion à l'ouverture. |
| [rendering-performance.md](rendering-performance.md) | Coût mesuré du chemin de dessin, ce que l'audit avait faux, comment refaire la mesure. |

## Procédures

| Document | Sujet |
|---|---|
| [versioning.md](versioning.md) | Politique `major.minor.correctif`, hooks git, tags. |

## Conception en cours

| Document | Sujet |
|---|---|
| [model-editor.md](model-editor.md) | Éditeur de modèle : décisions arrêtées et découpage (tâches #229 à #237). |
| [creature-rigs.md](creature-rigs.md) | Rigs non humanoïdes : corpus, défauts mesurés, hypothèses démenties, archétypes, plan (tâches #358 à #377). |
| [archetype-roles.md](archetype-roles.md) | Rôles de chaînes : ce qu'une pose peut viser, listes par archétype, décisions arrêtées (tâches #378 et #375). |
| [archetype-poses.md](archetype-poses.md) | Poses par archétype : les trois vocabulaires, ce qui a été mesuré, ce qui a été infirmé, décisions prises (tâches #375 à #402). |
| [panel-images.md](panel-images.md) | Une image dans une Case à la place d'une scène 3D : décisions arrêtées, ce que le code fournit déjà, ce qui reste à mesurer (tâches #403a à #403d). |

---

Chaque document existe en deux langues, **un dossier par langue** : `docs/en/nom.md` et
`docs/fr/nom.md`, même nom de base. La version française est celle dans laquelle les décisions ont
été prises ; les deux sont tenues d'accord, et `tests/docs.test.mjs` refuse un document sans sa
contrepartie, un lien mort, ou une section ajoutée d'un seul côté.

Le code et ses commentaires sont en anglais (voir [architecture.md](architecture.md#langue)).
