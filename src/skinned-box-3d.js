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

/**
 * Étend `box` (THREE.Box3) par `object` et ses descendants, en tenant compte du skinning.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * UN MAILLAGE MASQUÉ NE COMPTE PAS. C'est la boîte de ce qui est DESSINÉ.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Signalé à l'usage : un modèle importé posé dans une Case atterrit partiellement, voire
 * complètement, en dehors d'elle — alors qu'un Personnage n'a jamais ce défaut.
 *
 * LA MESURE, sur `worker_j.glb` décodé, dont un maillage est masqué parce que le fichier le place
 * hors du corps (cf. src/stray-meshes-3d.js) :
 *
 *   avec le fourreau     z de −28,4 à 52,4
 *   sans lui             z de −18,5 à 6,1
 *
 * Or `placeRigCentered3D` (scene3d.js) DÉDUIT DE CETTE BOÎTE l'échelle et le centre du rig. Un
 * facteur 4,6 sur l'étendue, c'est un modèle réduit d'autant et recentré sur un point qui n'est
 * pas lui. Un Personnage n'a pas de maillage égaré : sa boîte a toujours été honnête, d'où
 * l'asymétrie observée.
 *
 * LA VISIBILITÉ PROPRE DU MAILLAGE, ET ELLE SEULE. On ne remonte pas la chaîne des parents, et un
 * groupe invisible n'interrompt pas le parcours — c'est délibéré : masquer un Élément entier
 * (`hidden3d`) pose `figureGroup.visible = false` sur le GROUPE, et si cela vidait la boîte, son
 * placement deviendrait absurde au moment de le réafficher. Ici seul compte ce qu'un maillage dit
 * de lui-même, ce qui est exactement ce que règle le masquage des maillages égarés.
 */
export function expandBoxSkinAware3D(box, object) {
  object.updateWorldMatrix(true, false);
  if (object.isMesh && object.visible === false) return;
  if (object.isMesh && object.geometry) {
    const géométrie = object.geometry;
    const attrs = géométrie.attributes;
    if (object.isSkinnedMesh && attrs && attrs.position && attrs.skinIndex && attrs.skinWeight) {
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
