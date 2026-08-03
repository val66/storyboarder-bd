# Audit nomenclature & lisibilité — src/

Passe sur les 11 fichiers de `src/` (state, utils, i18n, io, modals, draw, sidebar, events, scene3d,
rig3d, constants — soit ~15 000 lignes et plus de 420 fonctions top-level). Méthode : inventaire complet
de tous les noms de fonctions exportées/privées de chaque fichier, comparaison croisée entre fichiers,
puis lecture ciblée des zones les plus denses (constructions 3D, bonhomme-bâton) pour vérifier la
présence de commentaires.

Aucun renommage n'a été appliqué — ce document liste des propositions à valider. Des commentaires ont
en revanche déjà été ajoutés directement (purement additifs, syntaxe revérifiée, suite de tests toujours
au vert à 237/237) : ils sont listés en section 3.

## 1. Conventions déjà en place (à ne pas "corriger")

Le codebase suit un mélange volontaire et globalement cohérent :
- **Vocabulaire métier en français**, capitalisé dans les commentaires (Case, Planche, Tome, Scène,
  Bâtiment, Pièce, Mur, Parois, Bulle, Dalle, Élément…), y compris dans certains noms d'identifiants
  (`pieceId`, `batimentModalTargetKey`, `drawBulle`…).
- **Mécanique/verbes en anglais** (`get`, `build`, `apply`, `ensure`, `render`, `draw`, `compute`,
  `store`, `update`, `refresh`, `populate`, `pick`, `hit`, `open`, `close`, `start`, `stop`, `dispose`,
  `clamp`, `snap`…), utilisés de façon très régulière.
- **Constantes** en `SCREAMING_SNAKE_CASE`, sans exception trouvée.
- Suffixe **`3D`** systématique sur tout ce qui touche au rendu Three.js/scène 3D, ce qui aide beaucoup à
  distinguer d'un coup d'œil le code 3D du code 2D/DOM.
- Fonctions **`XToY`** pour les conversions de repère (`caseDepthToDistance3D`, `worldFloorToScreen`,
  `worldToPageXY`, `panelPixelToGroundXZ3D`, `screenToWorldFloor`, `rotYToSliderDeg`/`sliderDegToRotY`) —
  pattern reconnaissable et bien tenu.
- Préfixe **`ensure`** pour "construire paresseusement si absent, sinon réutiliser le cache"
  (`ensurePersonaScene3D`, `ensurePropMats3D`, `ensureElementUnits3D`, `ensureToonGradientMap3D`…).

Rien à changer ici — c'est le socle sur lequel s'appuient les remarques ci-dessous.

## 2. Incohérences trouvées + propositions de renommage

### 2.1 « Persona » vs « Perso » (impact : élevé — ~30 occurrences)

La donnée elle-même utilise la forme courte : `o.type === 'perso'`. Mais les noms de fonctions se
répartissent en deux familles selon le fichier :

| Forme longue (« Persona ») | Forme courte (« Perso ») |
|---|---|
| `openPersonaModal`, `closeDescModal`, `getPersonaScalePercent`, `updatePersonaSizeDisplay`, `refreshPersonaPreview`, `getPersonaPreviewCanvasCoords` (modals.js) | `addPersoToPanel`, `personasInPanel`, `applyPersonaSizePercent` (events.js) |
| `ensurePersonaScene3D`, `getPersonaRigEntry3D`, `disposePersonaRig3D`, `renderPersonaToCanvas3D`, `drawPersona3D`, `updatePersonaFaceTexture3D`, `buildPersonaRig3D`, `drawPersonaPoseHandlesOverlay`, `drawPersonaPreview` (rig3d.js/draw.js) | `renderSidePersos`, `getPieceConnectedComponents` (variables internes `perso`) (sidebar.js) |
| Constantes : `PERSONA_REAL_HEIGHT_M`, `PERSONA_3D_W/H`, `PERSONA_PREVIEW_BASE_W/H`, `PREVIEW_PERSONA_ID`, `S.personaPreviewZoom` (constants.js/state.js) | — |

**Proposition** : choisir un seul terme et l'appliquer partout. Vu que les constantes (le socle le plus
stable) utilisent déjà massivement « Persona », le plus économique est de renommer les ~6 fonctions
courtes (`addPersoToPanel`, `personasInPanel`, `applyPersonaSizePercent`, `renderSidePersos`) vers la
forme longue, plutôt que l'inverse (~25 fonctions à toucher). Ne surtout pas toucher à `o.type === 'perso'`
elle-même : c'est une valeur stockée dans les fichiers `.json` de Projets existants, la renommer casserait
la compatibilité de tous les Projets déjà sauvegardés.

*Risque : faible à moyen — renommages internes à un fichier ou avec peu de call-sites, aucun id DOM
concerné (à vérifier au cas par cas pour `renderSidePersos`, potentiellement lié à un id HTML).*

### 2.2 « trace » (l'outil) vs « tracé » (l'objet résultant) (impact : élevé — piège de lecture)

`S.traceTool`, `startTraceTool`, `stopTraceTool` désignent l'état de l'outil interactif de dessin à la
souris (utilisé aussi bien pour Route/Chemin que pour la Zone Terrain). `tracéBBox`, `TRACÉ_DEFAULTS`,
`TRACÉ_EMOJI`, `drawTracé`, `computeTracéWorld3D`, `type: 'tracé'` désignent le type d'objet persistant
qui en résulte (Route/Chemin/muret/clôture/haie/barrière — pas la Zone Terrain, qui est `type:'terrain'`).
Les deux mots ne diffèrent que par un accent — un piège classique en lecture rapide ou en recherche
plein-texte (chercher "trace" ne remonte pas "tracé" et vice-versa).

**Déjà fait cette passe** : un commentaire a été ajouté à la déclaration de `S.traceTool` (state.js) pour
clarifier la distinction. Aucun renommage proposé ici — les deux noms sont corrects individuellement, le
risque est purement une confusion de lecture, pas une incohérence à corriger par un renommage.

### 2.3 `get*` utilisé pour deux sémantiques différentes (impact : moyen)

`getPersonaRigEntry3D`, `getObjectRigEntry3D`, `getWallRenderEntry3D` (rig3d.js) ne sont **pas** de
simples lecteurs : elles construisent et mettent en cache le rig 3D s'il est absent ou périmé — exactement
le même patron que les fonctions `ensureXxx` du même fichier (`ensurePersonaScene3D`,
`ensurePropMats3D`…). Un lecteur qui voit `get` s'attend en général à une lecture sans effet de bord.

**Proposition** : renommer ces 3 fonctions en `ensurePersonaRigEntry3D`, `ensureObjectRigEntry3D`,
`ensureWallRenderEntry3D`, pour aligner sur la convention `ensure` déjà établie.

*Risque : moyen — une dizaine d'appels chacune, réparties dans rig3d.js/scene3d.js/events.js ; renommage
purement interne au code JS, aucun id DOM ni donnée sérialisée concernée.*

### 2.4 Préfixe `_` (underscore) appliqué sans règle constante (impact : faible, mais trompeur)

Seules 3 fonctions exportées portent un underscore de tête : `_buildPieceFloorTypeGrid`,
`_buildTerrainTypeGrid` (modals.js), `_scEntityId` (events.js) — a priori pour signaler "exportée
seulement pour le câblage interne, pas une API publique du module". Mais des dizaines d'autres fonctions
tout aussi internes (`updateWallFaceFieldForSelectedWall`, `resetModalSections`…) n'ont pas cet
underscore, et l'inverse aussi : certains champs de `S` l'ont (`S._tracéModalTarget`,
`S._terrainModalTarget`, `S._terrainModalType`, `S._drawCurrentPageLastRef`) alors que des champs tout
aussi internes ne l'ont pas (`S.modalTarget`, `S.pieceModalTargetId`…).

**Proposition** : soit documenter clairement la règle en un commentaire (« `_` = jamais appelé depuis un
autre module que celui qui l'a écrit, juste exporté pour un besoin ponctuel »), soit l'abandonner partout
(retirer les 3 underscores de fonctions + les 4 de `S`). Le second choix est probablement le plus simple à
tenir dans la durée.

*Risque : très faible — retirer un underscore ne casse rien tant que tous les call-sites sont mis à jour
ensemble (peu nombreux ici).*

### 2.5 « render » à trois sens différents (impact : faible, à documenter plutôt qu'à renommer)

- Rendu WebGL/Three.js vers une texture ou un canvas : `renderCaseScene3D`, `renderObjectToCanvas3D`,
  `renderPersonaToCanvas3D`.
- Construction/mise à jour du DOM (sidebar, menus) : `renderSideElementRow`, `renderSidePersos`,
  `renderSidePlancheCases`, `renderTree`, `renderSceneList`, `renderLoadSceneSubmenu`.
- `renderAll()` (draw.js) : orchestrateur haut niveau qui déclenche les deux à la fois.

C'est un usage très répandu en dev web (React appelle aussi "render" la construction du DOM), donc pas
une vraie incohérence à corriger — mais ça vaut un commentaire d'en-tête à l'endroit où les deux familles
sont les plus proches dans le code (scene3d.js), pour qu'un nouveau lecteur ne suppose pas à tort qu'une
fonction `render*` de sidebar.js touche à Three.js.

### 2.6 Abréviations « Bat »/« Batiment » cohérentes mais jamais expliquées

`S.selectedBatKey`, `S.batimentModalTargetKey`, `batPieceIds` (paramètres) utilisent l'abréviation
« Bat », alors que les fonctions utilisent la forme complète (`openBatimentModal`,
`getBatimentBoundingBoxXZ`…). C'est un choix cohérent (abréviation pour des noms de champs courts,
forme complète pour les fonctions) mais non documenté — un commentaire au premier `batKey` rencontré
(composition de `pieceIds` triés joints par virgule) aiderait un nouveau lecteur. Pas de renommage
proposé ici, juste une piste de commentaire.

## 3. Commentaires ajoutés cette passe (déjà appliqués)

1. **`src/state.js`**, déclaration de `S.traceTool` : clarifie la distinction "trace" (outil) / "tracé"
   (type d'objet résultant) — cf. §2.2.
2. **`src/rig3d.js`**, en-tête de la section "Géométrie des objets/props 3D" (juste avant
   `buildCarRig3D`) : documente les conventions communes à toutes les fonctions `buildXxxRig3D`
   (unités = mètres, repère local origine-au-sol, sens des axes, portée de `colorHex`) — ces ~30
   fonctions n'avaient individuellement presque aucun commentaire sur leurs nombres "magiques".
3. **`src/draw.js`**, en-tête de la section "Bonhomme-bâton" (juste avant `POSE_RENDERERS`) :
   documente les conventions communes aux `drawStickFigureXxx`, **et signale un point plus sérieux** —
   voir §4.1 ci-dessous.

Syntaxe revérifiée (`node --check`) et suite de tests relancée (237/237 verts) après ces 3 modifications.

## 4. Autres pistes identifiées (au-delà de la nomenclature)

### 4.1 Code très probablement mort : 13 fonctions `drawStickFigureXxx` (draw.js)

`drawStickFigure()` route vers la pose voulue via `window[POSE_RENDERERS[position]]` — mais rien dans le
codebase n'assigne ces fonctions sur `window` (ce sont des exports ES module, pas des globales de script
classique). Un commentaire déjà présent dans `rig3d.js` (`drawPersona3D`) le confirmait déjà :
*"drawStickFigure ne fait de toute façon qu'appeler drawStickFigureStanding en pratique (window[fnName]
ne résout jamais)"*. Autrement dit `drawStickFigureSitting/Combat/Course/Saut/Vol/Accroupi/Genoux/Sort/
Arc/EpeeLevee/Vaincu/Meditation/Recul` (13 fonctions, plusieurs centaines de lignes) sont aujourd'hui
inatteignables. Et `drawStickFigure` lui-même n'est appelé QUE comme repli d'urgence si Three.js échoue à
charger — donc l'impact utilisateur réel de ce bug est quasi nul, mais le code mort reste là. À discuter :
corriger le routage (probablement en appelant directement `window[fnName]` remplacé par un vrai import
dynamique/switch), ou supprimer les 13 fonctions si le repli "toujours debout" suffit en cas d'échec de
Three.js.

### 4.2 Fichiers de sauvegarde obsolètes dans `src/` (~2.7 Mo)

`src/app.js.bak`, `app.js.bak2`, `app.js.bak3` (939 Ko / 944 Ko / 800 Ko) sont des reliquats de la
refactorisation en modules (`app.js` est maintenant un stub d'1 ligne). Ils ne sont importés nulle part
mais restent dans le dépôt — gonflent inutilement sa taille et peuvent semer la confusion (ex. mes propres
recherches par mot-clé les ont fait remonter par erreur pendant cet audit). Proposition : les supprimer
(ou au minimum les sortir de `src/` vers un dossier `archive/` non suivi par git), une fois confirmé
qu'ils ne servent plus de filet de sécurité.

### 4.3 `buildTryExtendWall` (draw.js) : code mort + asymétrie comportementale

Déjà documenté dans les tests ajoutés précédemment (`tests/draw.test.mjs`) : cette fonction n'est appelée
nulle part dans le codebase actuel, et son comportement est asymétrique (prolonger un mur "vers l'avant"
fonctionne, "vers l'arrière" non). Remonté ici pour mémoire — décision déjà entre vos mains (garder en
l'état / brancher / supprimer).

## 5. Ce qui n'a délibérément PAS été fait

- Aucun renommage réel n'a été appliqué (cf. §2) — en attente de votre validation, vu le nombre de
  call-sites et le risque de casser des références (imports croisés, éventuels ids DOM).
- Pas de commentaire ajouté fonction par fonction dans rig3d.js/draw.js — la plupart des fonctions du
  codebase ont déjà des commentaires FR détaillés et de bonne qualité ; là où ils manquaient (constructions
  3D/bonhomme-bâton), un commentaire d'en-tête par section a été jugé plus utile qu'une répétition
  fonction par fonction.
