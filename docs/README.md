# Notes internes

Documentation de contributeur. Ce qui s'adresse à l'utilisateur est dans le
[README](../README.fr.md) et dans le manuel intégré (`src/help-content.js`).

## À lire avant de toucher au code

| Document | Ce qu'il évite |
|---|---|
| [**donnees-persistees.md**](donnees-persistees.md) | Rendre illisibles tous les fichiers projet existants, sans que rien ne le signale. |
| [**rendu-3d-sources-uniques.md**](rendu-3d-sources-uniques.md) | Réintroduire la duplication qui a produit cinq bugs successifs dans le rendu 3D. |

Ces deux-là ne sont pas des recommandations de style : une infraction coûte des données ou une
régression difficile à retrouver.

## Pour comprendre le code

| Document | Sujet |
|---|---|
| [reperes-3d.md](reperes-3d.md) | Constantes du monde, coordonnées canvas vs monde, orientation, échelles des rigs. |
| [architecture.md](architecture.md) | Règles de modules, imports circulaires, état partagé, nomenclature. |
| [methode-de-test.md](methode-de-test.md) | Test par mutation, extraction pour rendre testable, ce qui est hors de portée. |

## Procédures

| Document | Sujet |
|---|---|
| [versionnage.md](versionnage.md) | Politique `major.minor.correctif`, hooks git, tags. |

## Conception en cours

| Document | Sujet |
|---|---|
| [editeur-personnage.md](editeur-personnage.md) | Éditeur de Personnage : décisions arrêtées et découpage (tâches #229 à #237). |

---

Ces notes sont en français : c'est la langue dans laquelle les décisions ont été prises. Le code et
ses commentaires sont en anglais — voir [architecture.md](architecture.md#langue).
