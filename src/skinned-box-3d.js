/**
 * @file skinned-box-3d.js
 * Boîte englobante d'un objet Three.js qui tient compte du SKINNING.
 *
 * POURQUOI CE FICHIER EXISTE. `THREE.Box3.setFromObject()`, utilisé partout ailleurs pour cadrer
 * une caméra ou mesurer une taille, ignore le squelette d'un `SkinnedMesh` : il ne lit que
 * `geometry.boundingBox`, la géométrie BRUTE telle que stockée dans le fichier (position de bind),
 * transformée par la seule matrice DU MAILLAGE, jamais par les os. Pour un modèle articulé, cette
 * géométrie brute n'a souvent aucun rapport avec la pose réellement affichée : le GPU la déforme au
 * moment du rendu, via les matrices d'os, dans le shader, un calcul que la CPU ne voit jamais.
 *
 * CE QUE ÇA CASSAIT, CONCRÈTEMENT (retours utilisateur, personnages articulés .glb importés) :
 *   — model-cache.js : la hauteur mesurée à l'import (`hauteurM`) pouvait n'avoir aucun rapport
 *     avec la silhouette réellement affichée ;
 *   — rig3d.js (aperçu de la modale, frameCameraToFigure) : la caméra se cadrait sur cette boîte
 *     fausse, un modèle entier réduit à ses pieds, hors champ, dans un aperçu presque blanc;
 *   — scene3d.js (placeRigCentered3D) : la boîte de sélection 2D, dérivée de la même mesure,
 *     apparaissait décalée vers le bas par rapport au modèle réellement affiché.
 *   Les trois symptômes, en apparence disjoints, avaient la même unique cause.
 *
 * LA RÉPARATION. Pour un `SkinnedMesh`, on ne lit pas `geometry.boundingBox` : on calcule la
 * position RÉELLEMENT posée de chaque sommet via `SkinnedMesh.boneTransform()`, la même méthode
 * que Three.js utilise en interne pour son propre raycasting CPU d'un maillage skinné (donc déjà
 * exercée et correcte, pas une réinvention), puis on étend la boîte par ces points. Pour tout le
 * reste (maillage rigide, meuble, véhicule…), comportement strictement inchangé : ce module ne
 * remplace `Box3.setFromObject` que là où elle est effectivement fausse.
 *
 * COÛT. Un parcours par sommet, une fois par appel, appelé au décodage (une fois par fichier),
 * à l'ouverture de chaque modale (rare), et à chaque reconstruction de rig dans la Scène (cf.
 * `heightChanged`/`modelChanged` dans rig3d.js : un redimensionnement ou une arrivée de fichier,
 * pas chaque image).
 */

/**
 * Étend `box` (THREE.Box3) par `object` et ses descendants, en tenant compte du skinning.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * UN MAILLAGE MASQUÉ NE COMPTE PAS. C'est la boîte de ce qui est DESSINÉ.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Signalé à l'usage : un modèle importé posé dans une Case atterrit partiellement, voire
 * complètement, en dehors d'elle, alors qu'un Personnage n'a jamais ce défaut.
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
 * groupe invisible n'interrompt pas le parcours, c'est délibéré : masquer un Élément entier
 * (`hidden3d`) pose `figureGroup.visible = false` sur le GROUPE, et si cela vidait la boîte, son
 * placement deviendrait absurde au moment de le réafficher. Ici seul compte ce qu'un maillage dit
 * de lui-même, ce qui est exactement ce que règle le masquage des maillages égarés.
 */
export function expandBoxSkinAware3D(box, object) {
  // ⚠️ `(true, false)` MET À JOUR LES ANCÊTRES ET CE NŒUD, PAS LES OS. C'est la cause du défaut
  // corrigé en #372, et il faut la comprendre pour ne pas la réintroduire : `boneTransform` lit
  // `skeleton.bones[i].matrixWorld`, et un squelette n'est PAS un descendant du maillage qu'il
  // déforme, c'est presque toujours un frère sous la même racine. Ces matrices restaient donc
  // périmées, souvent à l'identité, et le sommet déformé s'effondrait vers l'origine.
  //
  // Mesuré sur `cerberus.glb` : boîte de 0,05 × 0,05 × 0,09 là où sa géométrie fait
  // 4,52 × 4,66 × 8,53, soit un facteur QUATRE-VINGT-DIX. Comme `placeRigCentered3D` déduit
  // l'échelle du rig de cette boîte, le cerbère était agrandi d'autant.
  //
  // La mise à jour se fait donc UNE fois, en tête de `box3FromObjectSkinAware3D`, sur tout le
  // sous-arbre. Elle est gardée ici pour les appels directs sur un nœud isolé (cf.
  // stray-meshes-3d.js), où elle suffit puisqu'il n'y a pas de sous-arbre à couvrir.
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
 * La boîte englobante complète d'un objet, sensible au skinning, à utiliser à la place de
 * `new THREE.Box3().setFromObject(object)` pour tout ce qui peut contenir un modèle importé
 * articulé (un modèle importé n'ayant aucune garantie de ne pas l'être).
 */
export function box3FromObjectSkinAware3D(object) {
  const box = new THREE.Box3();
  // ═════════════════════════════════════════════════════════════════════════════════════════════
  // METTRE LES MATRICES À JOUR DEPUIS LA RACINE, ET C'EST LA CORRECTION DE #372
  // ═════════════════════════════════════════════════════════════════════════════════════════════
  //
  // `boneTransform` lit `skeleton.bones[i].matrixWorld`. Un squelette n'est PAS un descendant du
  // maillage qu'il déforme : dans un glTF, c'est un FRÈRE sous la même racine. Le parcours ne
  // faisait qu'un `updateWorldMatrix(true, false)` par nœud, qui met à jour les ancêtres et le
  // nœud lui-même ; quand un maillage était visité avant les os, il les lisait périmés, et le
  // sommet déformé s'effondrait vers l'origine.
  //
  // MESURÉ SUR LES FICHIERS RÉELS, et l'écart n'est pas une nuance :
  //
  //   cerberus.glb   boîte 0,05 × 0,05 × 0,09   au lieu de 4,52 × 4,66 × 8,53   (facteur 90)
  //   spider.glb     1,84 × 2,11 × 0,48         au lieu de 2,28 × 0,59 × 2,61
  //   snake.glb      2,14 × 0,11 × 0,09         au lieu de 7,36 × 0,37 × 0,32
  //
  // `placeRigCentered3D` déduisant l'échelle du rig de cette boîte, le cerbère était agrandi CENT
  // SEIZE fois. C'est ce que l'utilisateur voyait comme « le modèle passe sous le sol ».
  //
  // ⚠️ `updateWorldMatrix(true, true)` NE MARCHE PAS, et la raison n'est pas celle qu'on croit.
  //
  // Elle descend bien dans tous les enfants, ce n'est donc pas une question de parcours. La cause
  // est dans Three : `SkinnedMesh` REDÉFINIT `updateMatrixWorld` pour recalculer
  // `bindMatrixInverse` depuis `matrixWorld`, et ne redéfinit PAS `updateWorldMatrix`. Or
  // `boneTransform` termine par `applyMatrix4(this.bindMatrixInverse)` : cette matrice périmée
  // fausse chaque sommet. Vérifié dans la source de three r128, et épinglé par un test qui
  // interroge les prototypes.
  //
  // Mesuré sur `cerberus.glb` : `updateWorldMatrix(true, true)` laisse la boîte à 0,047,
  // `updateMatrixWorld(true)` la rend à 4,661.
  //
  // METTRE À JOUR LES OS SEULS NE SUFFIT PAS NON PLUS, pour une raison différente :
  // `bone.updateMatrixWorld(true)` compose avec la matrice de son PARENT, elle-même périmée, et ne
  // touche évidemment pas au `bindMatrixInverse` du maillage. Essayé, mesuré, cerbère à 0,05.
  if (object && object.updateMatrixWorld) object.updateMatrixWorld(true);
  // TOUT LE SOUS-ARBRE, OS COMPRIS, avant de lire quoi que ce soit. Voir l'avertissement dans
  // `expandBoxSkinAware3D` : sans cette ligne, la boîte d'un modèle articulé est celle de ses os
  // au repos vus depuis des matrices périmées, et non celle de sa géométrie déformée.
  //
  expandBoxSkinAware3D(box, object);
  return box;
}

/**
 * La même boîte, MÉMORISÉE tant que rien de ce qui la détermine n'a bougé (#438).
 *
 * ⚠️ MESURÉ CHEZ L'UTILISATEUR, ET C'ÉTAIT PRESQUE TOUT LE COÛT D'UNE CASE LOURDE. Une Scène à trois
 * modèles importés, caméra tournée pendant 26 s : 124 rendus complets à 108 ms de médiane, dont
 * 11 ms de WebGL et 95 ms de placement des Éléments ; la boîte d'un modèle, 744 appels à 15,4 ms,
 * soit 92 ms par rendu. Elle déforme chaque sommet sur le processeur, deux fois par modèle et par
 * rendu (placement et hauteur debout), alors que TOURNER LA CAMÉRA NE CHANGE NI LA POSE NI LE MODÈLE.
 *
 * La clé est ce que la boîte lit : la matrice monde de la racine, et la position, l'orientation
 * et l'échelle locales de CHAQUE nœud du sous-arbre, os compris. Parcourir les nœuds coûte une
 * fraction du parcours des sommets. Une pose, une orientation, une bascule ou une échelle qui
 * change change la clé, et la boîte est recalculée. La boîte rendue est une COPIE : l'appelant peut
 * la modifier sans corrompre la mémoire.
 */
const _boitesMemorisees = new WeakMap();
const ETATS_MEMORISES = 4;
let _calculsDeBoite = 0;

function cleDeLaBoite3D(object){
  object.updateMatrixWorld(true);
  const n = [];
  const e = object.matrixWorld.elements;
  for (let i = 0; i < 16; i++) n.push(e[i]);
  object.traverse(o => {
    n.push(o.id, o.position.x, o.position.y, o.position.z,
      o.quaternion.x, o.quaternion.y, o.quaternion.z, o.quaternion.w,
      o.scale.x, o.scale.y, o.scale.z, o.visible ? 1 : 0);
  });
  return n.join(',');
}

export function box3FromObjectSkinAwareCached3D(object){
  if (!object) return box3FromObjectSkinAware3D(object);
  const cle = cleDeLaBoite3D(object);
  // ⚠️ PLUSIEURS ÉTATS PAR OBJET, PAS UN SEUL. Chaque rendu mesure le même modèle dans DEUX états :
  // posé (placement) et au repos (hauteur debout, qui remet les os à zéro). Une seule entrée
  // aurait été écrasée à chaque appel par l'autre état, et ne servait donc jamais.
  let gardes = _boitesMemorisees.get(object);
  if (!gardes) { gardes = []; _boitesMemorisees.set(object, gardes); }
  const garde = gardes.find(g => g.cle === cle);
  if (garde) return garde.box.clone();
  _calculsDeBoite++;
  const box = box3FromObjectSkinAware3D(object);
  gardes.unshift({ cle, box: box.clone() });
  if (gardes.length > ETATS_MEMORISES) gardes.length = ETATS_MEMORISES;
  return box;
}

/** Pour les tests : combien de boîtes ont réellement été calculées. */
export function _calculsDeBoite3D(){ return _calculsDeBoite; }
