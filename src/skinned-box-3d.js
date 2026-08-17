/**
 * @file skinned-box-3d.js
 * Boîte englobante d'un objet Three.js qui tient compte du SKINNING.
 *
 * POURQUOI CE FICHIER EXISTE. `THREE.Box3.setFromObject()` — utilisé partout ailleurs pour cadrer
 * une caméra ou mesurer une taille — ignore le squelette d'un `SkinnedMesh` : il ne lit que
 * `geometry.boundingBox`, la géométrie BRUTE telle que stockée dans le fichier (position de bind),
 * transformée par la seule matrice DU MAILLAGE — jamais par les os. Pour un modèle articulé, cette
 * géométrie brute n'a souvent aucun rapport avec la pose réellement affichée : le GPU la déforme au
 * moment du rendu, via les matrices d'os, dans le shader — un calcul que la CPU ne voit jamais.
 *
 * CE QUE ÇA CASSAIT, CONCRÈTEMENT (retours utilisateur, personnages articulés .glb importés) :
 *   — model-cache.js : la hauteur mesurée à l'import (`hauteurM`) pouvait n'avoir aucun rapport
 *     avec la silhouette réellement affichée ;
 *   — rig3d.js (aperçu de la modale, frameCameraToFigure) : la caméra se cadrait sur cette boîte
 *     fausse — un modèle entier réduit à ses pieds, hors champ, dans un aperçu presque blanc ;
 *   — scene3d.js (placeRigCentered3D) : la boîte de sélection 2D, dérivée de la même mesure,
 *     apparaissait décalée vers le bas par rapport au modèle réellement affiché.
 *   Les trois symptômes, en apparence disjoints, avaient la même unique cause.
 *
 * LA RÉPARATION. Pour un `SkinnedMesh`, on ne lit pas `geometry.boundingBox` : on calcule la
 * position RÉELLEMENT posée de chaque sommet via `SkinnedMesh.boneTransform()` — la même méthode
 * que Three.js utilise en interne pour son propre raycasting CPU d'un maillage skinné (donc déjà
 * exercée et correcte, pas une réinvention) — puis on étend la boîte par ces points. Pour tout le
 * reste (maillage rigide, meuble, véhicule…), comportement strictement inchangé : ce module ne
 * remplace `Box3.setFromObject` que là où elle est effectivement fausse.
 *
 * COÛT. Un parcours par sommet, une fois par appel — appelé au décodage (une fois par fichier),
 * à l'ouverture de chaque modale (rare), et à chaque reconstruction de rig dans la Scène (cf.
 * `heightChanged`/`modelChanged` dans rig3d.js : un redimensionnement ou une arrivée de fichier,
 * pas chaque image).
 */

/* eslint-disable */

/** Étend `box` (THREE.Box3) par `object` et ses descendants, en tenant compte du skinning. */
export function expandBoxSkinAware3D(box, object) {
  object.updateWorldMatrix(true, false);
  if (object.isMesh && object.geometry) {
    const géométrie = object.geometry;
    const attrs = géométrie.attributes;
    if (object.isSkinnedMesh && attrs && attrs.position && attrs.skinIndex && attrs.skinWeight) {
      // ⚠️ LES MATRICES D'OS D'ABORD. `boneTransform` ne calcule rien : il LIT
      // `skeleton.boneMatrices`, que seul un rendu met à jour. Or cette boîte est mesurée au
      // DÉCODAGE (cf. model-cache.js), sur une scène qui n'a jamais été rendue — on obtenait donc la
      // pose de LIAISON et non la pose réelle. `updateWorldMatrix(true, false)` juste au-dessus n'y
      // change rien : il remonte vers les parents, alors que les os sont ailleurs dans la hiérarchie.
      //
      // MESURÉ, pas supposé. Sur worker_j.glb la boîte des os fait 34,7 × 39,6 × 8,4 tandis que
      // celle-ci rendait 6,4 × 9,4 × 17,1 — deux objets différents, l'un debout selon Y, l'autre
      // couché selon Z. Comme cette boîte sert À LA FOIS à mesurer la taille réelle et à cadrer la
      // caméra, le personnage était mesuré à 9,43 m et la caméra visait un volume où il n'était pas :
      // seules ses poignées d'articulation, projetées depuis les vrais os, restaient visibles.
      // Sur hulk les deux boîtes concordaient déjà, ce qui explique qu'il s'affichait correctement.
      if (object.skeleton) {
        object.skeleton.bones.forEach(os => os && os.updateWorldMatrix(true, false));
        object.skeleton.update();
      }
      const v = new THREE.Vector3();
      for (let i = 0; i < attrs.position.count; i++) {
        object.boneTransform(i, v);
        v.applyMatrix4(object.matrixWorld);
        box.expandByPoint(v);
      }
    } else {
      if (!géométrie.boundingBox) géométrie.computeBoundingBox();
      if (géométrie.boundingBox && !géométrie.boundingBox.isEmpty()) {
        box.union(géométrie.boundingBox.clone().applyMatrix4(object.matrixWorld));
      }
    }
  }
  (object.children || []).forEach(enfant => expandBoxSkinAware3D(box, enfant));
}

/**
 * La boîte englobante complète d'un objet, sensible au skinning — à utiliser à la place de
 * `new THREE.Box3().setFromObject(object)` pour tout ce qui peut contenir un modèle importé
 * articulé (un modèle importé n'ayant aucune garantie de ne pas l'être).
 */
export function box3FromObjectSkinAware3D(object) {
  const box = new THREE.Box3();
  expandBoxSkinAware3D(box, object);
  return box;
}
