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

// ⚠️ SONDE TEMPORAIRE v2 — À RETIRER avec la v1 de model-cache.js.
//
// La v1 mesurait au DÉCODAGE, donc avant toute mise à l'échelle : elle ne pouvait pas voir l'effet
// du redimensionnement. Celle-ci mesure APRÈS placement, au moment du rendu, et sépare ce que la v1
// mélangeait :
//   — la boîte skinnée de CHAQUE maillage prise isolément (la v1 n'en donnait que la somme, et pour
//     les maillages individuels elle affichait une boîte de pose de LIAISON, donc trompeuse) ;
//   — la position monde de trois os repères, pour dire où est vraiment le corps ;
//   — l'échelle réellement appliquée au groupe.
// Si un maillage a une boîte qui ne suit pas l'échelle des autres, c'est lui qui se détache — le
// katana qui bouge au redimensionnement, signalé à l'usage.
const _sondeVues = new Set();
export function sondeRigPlace3D(nom, racine) {
  if (!nom || !racine || _sondeVues.has(nom)) return;
  _sondeVues.add(nom);
  try {
    racine.updateMatrixWorld(true);
    const ech = new THREE.Vector3();
    racine.getWorldScale(ech);
    const maillages = [];
    racine.traverse(n => {
      if (!n.isMesh) return;
      const b = new THREE.Box3();
      expandBoxSkinAware3D(b, n);
      const t = new THREE.Vector3(); b.getSize(t);
      const c = new THREE.Vector3(); b.getCenter(c);
      const se = new THREE.Vector3(); n.getWorldScale(se);
      maillages.push({
        nom: n.name || '(sans nom)',
        articulé: !!n.isSkinnedMesh,
        tailleSkinnee: [t.x, t.y, t.z].map(v => +v.toFixed(3)),
        centreSkinne: [c.x, c.y, c.z].map(v => +v.toFixed(3)),
        echellePropre: [se.x, se.y, se.z].map(v => +v.toFixed(4)),
      });
    });
    const os = {};
    racine.traverse(n => {
      if (!n.isBone) return;
      const bas = (n.name || '').toLowerCase();
      const cle = /hip|pelvis|bassin|root/.test(bas) ? 'bassin'
        : /head|tete|tête/.test(bas) ? 'tete'
          : /hand|main|wrist/.test(bas) ? 'main' : null;
      if (cle && !os[cle]) {
        const p = new THREE.Vector3(); n.getWorldPosition(p);
        os[cle] = { nom: n.name, pos: [p.x, p.y, p.z].map(v => +v.toFixed(3)) };
      }
    });
    /* eslint-disable no-console */
    console.log('[SONDE2 après placement]', nom, {
      echelleDuGroupe: [ech.x, ech.y, ech.z].map(v => +v.toFixed(4)),
      osReperes: os,
      maillages,
    });
    /* eslint-enable no-console */
  } catch (e) {
    /* eslint-disable-next-line no-console */
    console.log('[SONDE2] échec sur', nom, e && e.message);
  }
}
