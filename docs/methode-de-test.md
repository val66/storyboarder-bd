# Méthode de test

> Le dépôt compte plus de 440 tests, exécutés à chaque commit par le hook `pre-commit`. Ce document
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

La plupart des fonctions de `docs/rendu-3d-sources-uniques.md` sont nées ainsi. Deux exemples :

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

## Contourner le hook

`git commit --no-verify` saute les tests — pour un commit en cours de travail uniquement. Voir
`docs/versionnage.md`.
