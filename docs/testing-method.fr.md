# Méthode de test

> Le dépôt compte plus de 840 tests, exécutés à chaque commit par le hook `pre-commit`. Ce document
> explique **comment** on les écrit, parce que la façon de faire compte davantage que le nombre.

## L'outillage

Le test runner natif de Node, sans dépendance :

```bash
npm test                          # toute la suite
node --test tests/scene3d.test.mjs   # un seul fichier
```

Un fichier de test par module de `src/`. `tests/helpers/dom-stub.mjs` importe le vrai `three` et
bouchonne le DOM — les tests travaillent donc sur de la **vraie** géométrie Three.js, pas sur des
imitations.

## Le test par mutation — la règle centrale

Écrire un test qui passe ne prouve rien. Après chaque correction :

1. Casser volontairement le code corrigé, de plusieurs façons distinctes.
2. Vérifier que la suite tombe à **chaque** fois.
3. **Si une mutation passe, le test est décoratif.**

Une mutation qui s'échappe signale presque toujours la même chose : la logique est enfermée dans un
endroit non observable — un écouteur d'événement, une boucle de rendu. La réponse n'est pas d'écrire
un test plus malin, c'est d'**extraire la logique en fonction pure exportée**.

La plupart des fonctions de `docs/3d-rendering-single-sources.fr.md` sont nées ainsi. Deux exemples :

- Les formules de glissement vivaient dans le `mousemove` : impossible à muter utilement.
  → `wallScreenAxes3D`, `fracDeltaAlongAxis2D`, `integrateTracéFrac3D`.
- L'épaisseur avec laquelle un Muret était **bâti** n'était assertée nulle part : remettre l'ancienne
  valeur en dur ne faisait tomber aucun test. → `buildMuretGroup3D`.

Deux pièges rencontrés en pratiquant cette méthode :

**Muter le bon endroit.** Une substitution textuelle peut toucher une ligne identique ailleurs dans
le fichier. Une mutation qui « s'échappe » alors qu'elle devrait mordre mérite qu'on vérifie *où*
elle a été appliquée.

**Vérifier que la substitution a eu lieu.** Une insertion de test qui ne correspond pas au motif ne
fait rien, en silence — le compte de tests inchangé est le seul indice.

**Une correction en profondeur demande un test par couche.** `loadSceneIntoPanel` écrivait des
coordonnées monde NaN dans les Éléments enregistrés. La réparation avait deux étages : la cause (la
Planche de la Scène était donnée à la projection au Sol sans ses dimensions) et le filet (une
projection non finie se déclare désormais `clamped`). Réintroduire *l'une ou l'autre moitié seule*
laissait la suite au vert — l'autre moitié rattrapait. Deux défauts réels, zéro rouge. Rien n'était
cassé, mais aucune des deux lignes n'était retenue par quoi que ce soit, et un lecteur ultérieur
aurait pu en supprimer une comme inutile. La réponse n'est pas une assertion plus fine : c'est un
test visant chaque étage. Deux protections et aucun test, cela fait deux protections et aucune
garantie.

## Les seuils se mesurent, ils ne se posent pas

Un seuil inventé produit soit un test qui ne mord pas, soit un test qui casse pour rien. Deux fois
dans l'histoire du dépôt un seuil « raisonnable » s'est révélé faux à la première exécution.

La marche à suivre : mesurer la valeur réelle **et** celle que produiraient les régressions
plausibles, puis choisir un seuil entre les deux, et écrire les trois chiffres dans le test.

```js
// Seuil mesuré, pas posé : la valeur réelle est 0.0100. Les deux régressions plausibles
// (0.0147 et 0.0200) doivent tomber au-dessus, d'où 0.012.
assert.ok(debord <= 0.012, …);
```

## Ce qui est hors de portée, et pourquoi

- **Tout ce qui construit un `THREE.WebGLRenderer`.** Échoue sous Node. Concerne toute fonction
  passant par `ensurePersonaScene3D()` : `renderPanelScene3D`,
  `projectElementCenterToCanvas3D`, `panelDragRayOnPlane`…
- **Le câblage des événements.** Les écouteurs eux-mêmes ne sont pas testés ; leur logique l'est,
  une fois extraite.

L'en-tête de chaque fichier de test détaille ses propres exclusions. Les tenir à jour : une exclusion
périmée fait croire à une couverture qui n'existe pas.

## Les tests d'invariants

Au-delà des tests unitaires, `tests/scene3d.test.mjs` contient une suite qui vérifie les **relations
entre fonctions** — que le trou, le rig, la boîte de rendu et la caméra désignent le même endroit, sur
toute la plage des paramètres et sur plusieurs formes de support.

C'est le seul type de test qui attrape la classe de bug qui a le plus coûté ici. Un test unitaire
valide une fonction isolée ; il ne voit jamais deux fonctions correctes qui ne parlent pas de la même
chose.

## Analyse statique — et ce qu'elle ne couvre volontairement pas

```bash
npm i -D eslint     # une fois
npm run lint
```

ESLint prend en charge la couche **grammaticale** : variable déclarée et jamais lue, variable
utilisée sans être déclarée, clé dupliquée dans un objet littéral, code inatteignable. Le hook
`pre-commit` le lance avant les tests — il coûte une fraction de seconde là où la suite en prend
quatre, et une erreur de lint explique souvent l'échec de test qui suivrait.

Il est **tolérant à l'absence d'ESLint** : un clone frais sans `npm install`, ou un poste hors
ligne, doit pouvoir commiter. Le hook dit qu'il saute plutôt que de bloquer. Les tests, eux,
bloquent.

Tout ce qui est **spécifique à ce projet** reste dans `tests/`, et ce partage est délibéré :

| Contrôle | Où | Pourquoi pas ESLint |
|---|---|---|
| Un `getElementById` vise un id réel d'index.html | `tests/dom-ids.test.mjs` | Il faudrait lire le HTML |
| Imbrication des balises d'index.html | `tests/html.test.mjs` | Idem |
| Règles CSS qui interagissent | `tests/style.test.mjs` | Il faudrait lire le CSS |
| Parité `docs/` entre les deux langues | `tests/docs.test.mjs` | Il faudrait lire du Markdown |
| Noms de champs persistés, jamais renommés | `tests/io.test.mjs` | Règle métier, pas grammaire |
| Les chemins chauds passent par l'ordonnanceur | `tests/events.test.mjs` | Convention du projet |

En résumé : ESLint connaît JavaScript, les tests connaissent *cette* application. Vouloir exprimer
l'un dans l'autre donne une règle fragile d'un côté, et un compilateur réécrit de l'autre.

Les règles ont été choisies avec prudence, chacune parce qu'elle vise un défaut réellement constaté
ici — `no-unused-vars` aurait trouvé `roomSizeDisplay`, déclaré et jamais utilisé, sans qu'on le
cherche. Une configuration copiée d'ailleurs produit du bruit sur 22 000 lignes existantes, et
c'est le bruit qui fait désactiver un outil.

## Contourner le hook

`git commit --no-verify` saute les tests — pour un commit en cours de travail uniquement. Voir
`docs/versioning.fr.md`.
