/**
 * tests/skinned-box-3d.test.mjs — la boîte englobante d'un modèle articulé doit suivre sa pose, pas
 * sa géométrie brute.
 *
 * LE BUG QUE CE FICHIER GARDE. `THREE.Box3.setFromObject()` lit `geometry.boundingBox` — la
 * géométrie de BIND, telle que stockée dans le fichier — transformée par la seule matrice DU
 * MAILLAGE. Le skinning (déformation par les os) est un calcul GPU, dans le vertex shader : la CPU
 * ne le voit jamais avec cette méthode. Résultat observé : un modèle importé articulé mesuré/cadré
 * sur sa géométrie de bind, sans rapport avec ce qui s'affiche réellement une fois posé — aperçu de
 * la modale cadré sur les pieds seuls, boîte de sélection 2D décalée vers le bas.
 *
 * CE QUE CE FICHIER VÉRIFIE : `box3FromObjectSkinAware3D` reflète la position RÉELLEMENT POSÉE des
 * sommets (via `SkinnedMesh.boneTransform`), pas leur position de bind — là où
 * `Box3.setFromObject` reste aveugle à la pose.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { box3FromObjectSkinAware3D, expandBoxSkinAware3D } from '../src/skinned-box-3d.js';

// Rend THREE accessible en global : skinned-box-3d.js (comme rig3d.js/scene3d.js dans
// l'application) lit `THREE` en global plutôt que de l'importer, cf. leurs en-têtes respectifs.
globalThis.THREE = THREE;

/**
 * Un SkinnedMesh minimal à deux sommets, un par os, en pose de BIND toute petite (0 → 1 en Y) —
 * puis un deuxième os DÉPLACÉ loin de sa position de bind, pour simuler une pose réelle très
 * différente de la géométrie brute (le cas d'un modèle importé articulé quelconque).
 */
function maillageArticuléPosé(){
  const racine = new THREE.Bone(); racine.name = 'racine'; racine.position.set(0, 0, 0);
  const enfant = new THREE.Bone(); enfant.name = 'enfant'; enfant.position.set(0, 1, 0);
  racine.add(enfant);
  racine.updateMatrixWorld(true);

  const géométrie = new THREE.BufferGeometry();
  géométrie.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 0, 1, 0]), 3));
  géométrie.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint16Array([0, 0, 0, 0, 1, 0, 0, 0]), 4));
  géométrie.setAttribute('skinWeight', new THREE.BufferAttribute(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0]), 4));

  const maillage = new THREE.SkinnedMesh(géométrie, new THREE.MeshBasicMaterial());
  const squelette = new THREE.Skeleton([racine, enfant]);
  maillage.add(racine);
  maillage.bind(squelette);

  const scène = new THREE.Group();
  scène.add(maillage);
  scène.updateMatrixWorld(true);

  // POSE : on éloigne l'os enfant très loin de sa position de bind (0,1,0) → (0,50,0). Un modèle
  // dont le squelette a été posé/animé par son outil d'export produit exactement cette situation :
  // la géométrie stockée reste celle du bind, la pose réelle est ailleurs.
  enfant.position.set(0, 50, 0);
  enfant.updateMatrixWorld(true);

  return { scène, maillage, racine, enfant };
}

describe('box3FromObjectSkinAware3D — suit la pose, pas la géométrie de bind', () => {
  test('RÉGRESSION : Box3.setFromObject() reste aveugle à la pose (le bug que ce module répare)', () => {
    const { scène } = maillageArticuléPosé();
    const boîteNaïve = new THREE.Box3().setFromObject(scène);
    const taille = new THREE.Vector3(); boîteNaïve.getSize(taille);
    // La géométrie brute va de Y=0 à Y=1 : Box3.setFromObject ne peut pas voir la pose (Y=50).
    assert.ok(taille.y < 2,
      'ce test doit constater le défaut de Box3.setFromObject — si three le corrige un jour, ' +
      'ce module devient un correctif obsolète, pas un bug');
  });

  test('la boîte sensible au skinning reflète la position RÉELLEMENT posée', () => {
    const { scène } = maillageArticuléPosé();
    const boîte = box3FromObjectSkinAware3D(scène);
    const taille = new THREE.Vector3(); boîte.getSize(taille);
    // L'os enfant a été déplacé à Y=50 : la boîte posée doit s'étendre jusque-là, pas s'arrêter à Y=1.
    assert.ok(taille.y > 40, `hauteur posée attendue > 40, obtenue ${taille.y}`);
  });

  test('un maillage rigide (non skinné) donne la même boîte que Box3.setFromObject standard', () => {
    // La réparation ne doit rien changer pour tout ce qui n'est PAS skinné (meuble, véhicule…) —
    // sinon on remplace un bug par une régression sur tout le reste de l'application.
    const boîte1 = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 4), new THREE.MeshBasicMaterial());
    boîte1.position.set(5, 5, 5);
    const scène = new THREE.Group(); scène.add(boîte1); scène.updateMatrixWorld(true);

    const attendue = new THREE.Box3().setFromObject(scène);
    const obtenue = box3FromObjectSkinAware3D(scène);
    const tA = new THREE.Vector3(); attendue.getSize(tA);
    const tO = new THREE.Vector3(); obtenue.getSize(tO);
    assert.ok(Math.abs(tA.x - tO.x) < 1e-6 && Math.abs(tA.y - tO.y) < 1e-6 && Math.abs(tA.z - tO.z) < 1e-6,
      'un maillage rigide ne doit pas changer de boîte');
  });

  test('expandBoxSkinAware3D ne lève pas sur un groupe vide', () => {
    const box = new THREE.Box3();
    assert.doesNotThrow(() => expandBoxSkinAware3D(box, new THREE.Group()));
    assert.ok(box.isEmpty());
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// La boîte de ce qui est DESSINÉ
// ─────────────────────────────────────────────────────────────────────────────

describe('un maillage masqué ne compte pas dans la boîte', () => {
  // LE DÉFAUT GARDÉ ICI. Un modèle importé posé dans une Case atterrissait partiellement, voire
  // complètement, en dehors d'elle — alors qu'un Personnage n'avait jamais ce défaut.
  //
  // `placeRigCentered3D` déduit de cette boîte l'échelle ET le centre du rig. Sur worker_j.glb,
  // dont un maillage est masqué parce que le fichier le place hors du corps, la boîte passait de
  // z −18,5..6,1 à z −28,4..52,4 : un facteur 4,6 sur l'échelle, et un centre qui n'est pas le
  // modèle. Un Personnage n'a pas de maillage égaré, d'où l'asymétrie.

  const cube = (nom, centre, visible = true) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    m.name = nom;
    m.position.set(centre[0], centre[1], centre[2]);
    m.visible = visible;
    return m;
  };
  const groupe = (...enfants) => {
    const g = new THREE.Group();
    enfants.forEach(e => g.add(e));
    g.updateMatrixWorld(true);
    return g;
  };

  test('la boîte se referme sur les maillages visibles', () => {
    const g = groupe(cube('corps', [0, 0, 0]), cube('fourreau', [0, 100, 0], false));
    const b = box3FromObjectSkinAware3D(g);
    assert.ok(Math.abs(b.max.y - 0.5) < 1e-6, `la boîte monte à ${b.max.y} : le maillage masqué compte encore`);
    assert.ok(Math.abs(b.min.y + 0.5) < 1e-6);
  });

  test('le témoin : visible, le même maillage étend bien la boîte', () => {
    // Sans lui, une boîte qui ignorerait TOUT passerait le test précédent.
    const g = groupe(cube('corps', [0, 0, 0]), cube('fourreau', [0, 100, 0], true));
    assert.ok(box3FromObjectSkinAware3D(g).max.y > 99);
  });

  test('RÉGRESSION : un GROUPE invisible n\'annule pas la boîte de ses maillages', () => {
    // « Invisible dans la scène 3D » (hidden3d) pose visible = false sur le GROUPE de l'Élément.
    // Si cela vidait la boîte, son placement deviendrait absurde — et le réafficher le ferait
    // réapparaître n'importe où. Seule la visibilité PROPRE d'un maillage est consultée.
    const g = groupe(cube('corps', [0, 0, 0]), cube('tete', [0, 2, 0]));
    g.visible = false;
    const b = box3FromObjectSkinAware3D(g);
    assert.ok(Math.abs(b.max.y - 2.5) < 1e-6, `boîte ${b.max.y} : un groupe masqué a vidé la boîte`);
  });

  test('un maillage masqué PARMI d\'autres ne décale pas non plus le centre', () => {
    // C'est le centre, autant que la taille, qui envoyait le modèle hors de la Case.
    const g = groupe(cube('a', [-1, 0, 0]), cube('b', [1, 0, 0]), cube('egare', [500, 0, 0], false));
    const centre = new THREE.Vector3();
    box3FromObjectSkinAware3D(g).getCenter(centre);
    assert.ok(Math.abs(centre.x) < 1e-6, `centre en x = ${centre.x}`);
  });
});

/**
 * JOURNAL DE MUTATION — le filtre de visibilité.
 *
 *   Q1 le filtre retiré (un maillage masqué compte à nouveau)                    ROUGE
 *   Q2 le filtre appliqué à TOUT nœud, groupes compris                           ROUGE
 *   Q3 condition inversée (seuls les maillages masqués comptent)                 ROUGE
 *   Q4 `!object.visible` au lieu de `object.visible === false`                   ÉCHAPPÉE
 *
 * Q4 EST UNE MUTATION ÉQUIVALENTE, et c'est la seule raison pour laquelle elle échappe : Three
 * initialise `visible` à `true` dans le constructeur d'Object3D, si bien qu'elle ne vaut jamais
 * `undefined` sur un objet réel. Les deux écritures sont donc strictement interchangeables ici.
 *
 * On garde `=== false` — « seul un masquage EXPLICITE compte » — et on n'écrit pas de test pour
 * la distinguer : il faudrait fabriquer un faux maillage sans `visible`, c'est-à-dire un état que
 * la bibliothèque ne produit pas. Un test qui défend une fiction ne garde rien.
 */
