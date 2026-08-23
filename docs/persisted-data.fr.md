# Données persistées — ce qu'on ne renomme jamais

> **La règle la plus importante du dépôt.** Une infraction ne casse pas la compilation, ne fait pas
> échouer un test et ne se voit pas à l'écran : elle rend illisibles tous les fichiers projet déjà
> enregistrés. Le symptôme apparaît des semaines plus tard, chez quelqu'un qui rouvre un vieux
> fichier et retrouve ses Personnages debout au milieu de nulle part.

Un projet est sérialisé en JSON par `serializeProject()` (`src/io.js`). Tout ce qui finit dans ce
JSON fait partie du **format de fichier**, pas du code : c'est un contrat avec le passé.

## 1. Les noms de champs JSON

Jamais renommés, jamais supprimés. Ajouter est permis ; retirer ou renommer ne l'est pas.

**Niveau projet** : `projectName`, `tomes`, `scenes`, `currentTomeIndex`, `currentPageIndex`,
`poses` (bibliothèque de poses : `[{ id, name, skeleton, joints }]`).

⚠️ **La portée de `poses` a changé (Fix 57)** sans que son nom ni sa forme bougent : la
bibliothèque appartient désormais à l'**Application** (`settings.json`, clé `poseLibrary`). Ce que
le fichier projet porte n'est plus la bibliothèque entière mais une **copie des poses qu'il
utilise**, pour rester lisible sur une machine qui ne les a pas. À l'ouverture, ces poses sont
**fusionnées** dans la bibliothèque (ids inconnus seulement, un vieux projet ne peut donc pas
annuler un renommage). Un fichier écrit avant ce changement reste lu à l'identique, et un fichier
écrit après reste lisible par une version antérieure.

Les 6 poses proposées sont **semées** dans la bibliothèque au premier lancement, avec la clé
intégrée comme `id` (`'assis'`, `'debout'`…), ce qui évite toute migration des fichiers
existants. `POSE_3D` reste consulté **après** la bibliothèque, comme filet pour un fichier citant
une pose intégrée que l'utilisateur a supprimée.

Sur `poses` : aucun Personnage n'en **dépend**. Appliquer une pose copie ses angles dans `joints3d`
et n'y laisse qu'une référence d'affichage. Supprimer la bibliothèque, ou ouvrir le projet sur une
machine qui ne l'a pas, ne change l'allure d'aucun Personnage : seule l'étiquette devient
« inconnue ». C'est délibéré, et `normalizePoses3D` (`io.js`) lit le champ avec la même tolérance :
absent, nul ou malformé donne une liste vide, jamais une erreur.

**Éléments** : `pieceId`, `pieceLabel`, `altPieceId`, `pieceFloorType`, `objType`, `caseNumber`,
`batimentNames`, `batimentRotY`, `wallSide`, `modelFile`, `afficherMaillagesEgares`.

**Coordonnées monde** : `wxFloor`, `wyFloor`, `wzFloor`, `realHeightFloor`, `realLenFloor`.

⚠️ `realHeightFloor` est la taille **enregistrée**. Le pourcentage qu'affiche le curseur « Taille
réelle » n'est stocké nulle part : il est recalculé à l'ouverture de chaque fiche
(`getPersonaScalePercent`). La fiche propose les deux, et c'est la HAUTEUR qu'elle applique, car le
curseur avance par crans de 5 %, ce qui corrigerait une hauteur saisie au centimètre.

**Parois sur un support** : `wallYFrac`, `wallAlongFrac`, `magnetWallId`, `wallHeight`.

**Caméra d'une Case** : `camWx`, `camWy`, `camWz`, `camDist`, `camRotX`, `camRotY`.

Certains de ces noms sont en français, d'autres en anglais, quelques-uns sont maladroits
(`batimentNames` a survécu au renommage Bâtiment → Building). **C'est sans importance.** Un nom de
champ persisté n'est pas de la nomenclature, c'est un identifiant de format.

## 2. Les valeurs discriminantes de type

Les chaînes qui servent à reconnaître la nature d'un objet sont aussi figées que les noms de champs.

```
type      : 'perso' | 'objet3d' | 'panel' | 'tracé' | 'terrain' | 'bulle'
objType   : 'mur' | 'mur_coin' | 'dalle' | 'fenetre_ouverte' | 'porte_ouverte' | 'modele' | …
tracéType : 'muret' | 'cloture' | 'haie' | 'barriere' | 'route' | 'chemin' | 'terrain'
wallSide  : 'avant' | 'arriere'
état porte/fenêtre : 'gauche' | 'droite' | 'fermee'
```

Noter `'tracé'` avec son accent, `'cloture'` et `'barriere'` sans les leurs, `'fermee'` sans accent :
ces irrégularités sont dans les fichiers enregistrés. Les « corriger » les casserait.

### `modelFile` — un nom, et le fichier qu'il désigne

Un modèle 3D importé est un `objet3d` ordinaire portant `objType: 'modele'` et un champ de plus,
`modelFile` : le **nom d'un fichier** dans `<dossier de Projets>/Modeles`, jamais un chemin absolu.
Un chemin absolu casserait dès que l'utilisateur change de machine ou de compte.

Deux conséquences qui font partie du format, pas de l'implémentation :

- **Rien ne garantit que le fichier soit là.** Il vit hors du Projet, et l'utilisateur peut le
  déplacer ou le supprimer. Un modèle introuvable s'affiche en boîte de remplacement ; l'Élément
  **n'est jamais supprimé**. Cf. § 5 : une panne passagère (disque non monté, antivirus qui
  verrouille) détruirait sinon un placement, et la sauvegarde automatique graverait la perte
  quelques secondes plus tard.
- **Les modèles suivent les Projets.** Ils sont rangés dans le dossier que l'utilisateur a choisi
  pour ses Projets : ce qu'il fait pour les synchroniser ou les sauvegarder les couvre aussi.

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
passent par `src/i18n.js` ; les modifier au bon endroit, pas en dur dans le code.

## 5. Le terme protégé `tracé`

`tracé` / `Tracé` / `TRACÉ` n'est **pas** traduit, y compris dans les commentaires anglais. C'est le
nom du concept métier, présent dans les données (`type: 'tracé'`), dans les identifiants de fonctions
(`tracéWallHeight3D`, `smoothTracéPath3D`) et dans l'interface. Le traduire par « path » ou « stroke »
ne ferait qu'ajouter un troisième vocabulaire.

## Et si un renommage est vraiment nécessaire ?

Il faut une **migration**, pas un renommage. Le dépôt en contient déjà :
`migratePanelWorldCoords`, `migrateElementWxFloor` (`src/io.js`) lisent l'ancien format et
écrivent le nouveau au chargement. Le schéma :

1. Le nouveau champ est écrit à la sauvegarde.
2. Au chargement, si l'ancien est présent et le nouveau absent, on convertit.
3. L'ancien champ reste **lu** aussi longtemps que des fichiers peuvent le contenir, c'est-à-dire
   indéfiniment, pour un logiciel dont les fichiers vivent chez les gens.

C'est plus coûteux qu'un rechercher-remplacer. C'est précisément pourquoi la règle par défaut est de
ne pas renommer.

## 5. Un fichier illisible ne doit pas détruire celui qui est lisible

`applyProjectData` valide la forme des données chargées **avant d'écrire quoi que ce soit** dans `S`
(`validateProjectShape`). Ce n'est pas de la politesse défensive, c'est la différence entre perdre
un fichier et en perdre deux.

Auparavant, la fonction assignait `S.tomes` puis atteignait plus loin le code qui levait.
L'exception laissait un projet à moitié chargé en mémoire pendant que `S.projectFilePath` désignait
encore le fichier **précédent**, à un Ctrl+S de l'écraser avec l'épave.

**Elle refuse plutôt qu'elle ne répare.** Ramener un `tomes` malformé à `[]` ouvrirait un projet
vide en silence, et la sauvegarde automatique suivante écrirait ce vide par-dessus le vrai fichier.
Refuser bruyamment conserve les deux fichiers.

Ce qui est refusé : une valeur présente et du mauvais type là où le chargement itère (`tomes`,
`scenes`, `pages`, `objects`). Ce qui est toléré : absent, `null`, ou seulement absurde (un
`currentTomeIndex` hors bornes, un nom de projet nul). La frontière est l'*ambiguïté*, pas la
propreté.

Même mode de défaillance, corrigé en même temps : un chargement refusé laissait la **sauvegarde
automatique éteinte** pour le reste de la session : `stopAutosave()` s'exécute avant la lecture,
`startAutosave()` seulement en cas de succès. En silence, et sur le projet précédent, resté ouvert.

`tests/persisted-format.test.mjs` garde tout cela, y compris ce qu'`assert.throws` seul ne peut pas
voir : que le refus a lieu *avant* la première écriture.
