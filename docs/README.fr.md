# Notes internes

*[English version](README.md)*

Documentation de contributeur. Ce qui s'adresse à l'utilisateur est dans le
[README](../README.fr.md) et dans le manuel intégré (`src/help-content.js`).

## À lire avant de toucher au code

| Document | Ce qu'il évite |
|---|---|
| [**persisted-data.fr.md**](persisted-data.fr.md) | Rendre illisibles tous les fichiers projet existants, sans que rien ne le signale. |
| [**3d-rendering-single-sources.fr.md**](3d-rendering-single-sources.fr.md) | Réintroduire la duplication qui a produit cinq bugs successifs dans le rendu 3D. |

Ces deux-là ne sont pas des recommandations de style : une infraction coûte des données ou une
régression difficile à retrouver.

## Pour comprendre le code

| Document | Sujet |
|---|---|
| [3d-reference-frames.fr.md](3d-reference-frames.fr.md) | Constantes du monde, coordonnées canvas vs monde, orientation, échelles des rigs. |
| [architecture.fr.md](architecture.fr.md) | Règles de modules, imports circulaires, état partagé, nomenclature. |
| [testing-method.fr.md](testing-method.fr.md) | Test par mutation, extraction pour rendre testable, ce qui est hors de portée. |
| [pose-library.fr.md](pose-library.fr.md) | Poses : où elles vivent, enregistrer, supprimer, restaurer, fusion à l'ouverture. |

## Procédures

| Document | Sujet |
|---|---|
| [versioning.fr.md](versioning.fr.md) | Politique `major.minor.correctif`, hooks git, tags. |

## Conception en cours

| Document | Sujet |
|---|---|
| [character-editor.fr.md](character-editor.fr.md) | Éditeur de Personnage : décisions arrêtées et découpage (tâches #229 à #237). |

---

Chaque document existe en deux langues : `nom.md` en anglais, `nom.fr.md` en français, sur le modèle
de `README.md` / `README.fr.md` à la racine. La version française est celle dans laquelle les
décisions ont été prises ; les deux sont tenues d'accord, et `tests/docs.test.mjs` refuse un
document sans sa contrepartie.

Le code et ses commentaires sont en anglais — voir [architecture.fr.md](architecture.fr.md#langue).
