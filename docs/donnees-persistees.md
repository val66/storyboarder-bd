# Données persistées — ce qu'on ne renomme jamais

> **La règle la plus importante du dépôt.** Une infraction ne casse pas la compilation, ne fait pas
> échouer un test et ne se voit pas à l'écran : elle rend illisibles tous les fichiers projet déjà
> enregistrés. Le symptôme apparaît des semaines plus tard, chez quelqu'un qui rouvre un vieux
> fichier et retrouve ses Personnages debout au milieu de nulle part.

Un projet est sérialisé en JSON par `serializeProject()` (`src/io.js`). Tout ce qui finit dans ce
JSON fait partie du **format de fichier**, pas du code : c'est un contrat avec le passé.

## 1. Les noms de champs JSON

Jamais renommés, jamais supprimés. Ajouter est permis ; retirer ou renommer ne l'est pas.

**Niveau projet** — `projectName`, `tomes`, `scenes`, `currentTomeIndex`, `currentPageIndex`,
`poses` (bibliothèque de poses : `[{ id, name, skeleton, joints }]`).

Sur `poses` : aucun Personnage n'en **dépend**. Appliquer une pose copie ses angles dans `joints3d`
et n'y laisse qu'une référence d'affichage. Supprimer la bibliothèque, ou ouvrir le projet sur une
machine qui ne l'a pas, ne change l'allure d'aucun Personnage — seule l'étiquette devient
« inconnue ». C'est délibéré, et `normalizePoses3D` (`io.js`) lit le champ avec la même tolérance :
absent, nul ou malformé donne une liste vide, jamais une erreur.

**Éléments** — `pieceId`, `pieceLabel`, `altPieceId`, `pieceFloorType`, `objType`, `caseNumber`,
`batimentNames`, `batimentRotY`, `wallSide`.

**Coordonnées monde** — `wxFloor`, `wyFloor`, `wzFloor`, `realHeightFloor`, `realLenFloor`.

**Parois sur un support** — `wallYFrac`, `wallAlongFrac`, `magnetWallId`, `wallHeight`.

**Caméra d'une Case** — `camWx`, `camWy`, `camWz`, `camDist`, `camRotX`, `camRotY`.

Certains de ces noms sont en français, d'autres en anglais, quelques-uns sont maladroits
(`batimentNames` a survécu au renommage Bâtiment → Building). **C'est sans importance.** Un nom de
champ persisté n'est pas de la nomenclature, c'est un identifiant de format.

## 2. Les valeurs discriminantes de type

Les chaînes qui servent à reconnaître la nature d'un objet sont aussi figées que les noms de champs.

```
type      : 'perso' | 'objet3d' | 'panel' | 'tracé' | 'terrain' | 'bulle'
objType   : 'mur' | 'mur_coin' | 'dalle' | 'fenetre_ouverte' | 'porte_ouverte' | …
tracéType : 'muret' | 'cloture' | 'haie' | 'barriere' | 'route' | 'chemin' | 'terrain'
wallSide  : 'avant' | 'arriere'
état porte/fenêtre : 'gauche' | 'droite' | 'fermee'
```

Noter `'tracé'` avec son accent, `'cloture'` et `'barriere'` sans les leurs, `'fermee'` sans accent :
ces irrégularités sont dans les fichiers enregistrés. Les « corriger » les casserait.

## 3. Les ids DOM

Moins évident, et pourtant vécu : lors du renommage Case/Tome/Pièce/Bâtiment →
Panel/Volume/Room/Building, six ids d'`index.html` n'ont pas été renommés en même temps que le code
qui les cherche. `document.getElementById(...).onclick` a levé une exception sur `null`, ce qui a
interrompu le chargement d'`events.js` **en entier** : plus aucun bouton ne répondait et aucun projet
ne se chargeait. Rien dans le message d'erreur ne pointait vers la cause.

Un id DOM peut être renommé, mais alors **dans le même commit** :
- `index.html`
- tous les `getElementById` / `querySelector` de `src/`
- les tables de sélecteurs d'`src/i18n.js`

## 4. Les classes CSS et les textes affichés

Même logique : une classe CSS lie `style.css` au JS qui la pose ou la teste. Les libellés visibles
passent par `src/i18n.js` — les modifier au bon endroit, pas en dur dans le code.

## 5. Le terme protégé `tracé`

`tracé` / `Tracé` / `TRACÉ` n'est **pas** traduit, y compris dans les commentaires anglais. C'est le
nom du concept métier, présent dans les données (`type: 'tracé'`), dans les identifiants de fonctions
(`tracéWallHeight3D`, `smoothTracéPath3D`) et dans l'interface. Le traduire par « path » ou « stroke »
ne ferait qu'ajouter un troisième vocabulaire.

## Et si un renommage est vraiment nécessaire ?

Il faut une **migration**, pas un renommage. Le dépôt en contient déjà :
`migratePanelWorldCoords`, `ensureElementWorldCoords` (`src/io.js`) lisent l'ancien format et
écrivent le nouveau au chargement. Le schéma :

1. Le nouveau champ est écrit à la sauvegarde.
2. Au chargement, si l'ancien est présent et le nouveau absent, on convertit.
3. L'ancien champ reste **lu** aussi longtemps que des fichiers peuvent le contenir — c'est-à-dire
   indéfiniment, pour un logiciel dont les fichiers vivent chez les gens.

C'est plus coûteux qu'un rechercher-remplacer. C'est précisément pourquoi la règle par défaut est de
ne pas renommer.
