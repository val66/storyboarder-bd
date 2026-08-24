/**
 * tests/vendor-skeleton-utils.test.mjs, cloneSkinned() répare le lien SkinnedMesh↔Skeleton perdu
 * par Object3D.clone().
 *
 * LE BUG QUE CE FICHIER GARDE. `SkinnedMesh.copy()` (appelé par `.clone(true)`) fait
 * `this.skeleton = source.skeleton`, une copie de RÉFÉRENCE. Le maillage cloné garde donc le
 * squelette de l'ORIGINAL, dont les os ne font pas partie de la hiérarchie clonée : leur
 * `matrixWorld` ne bouge jamais quand on transforme le clone (échelle/position appliquées par
 * `placeRigCentered3D`, cf. rig3d.js). Le GPU déforme alors le maillage avec des matrices d'os
 * figées à leur pose brute du fichier, le rendu ignore totalement la taille demandée.
 *
 * Symptôme observé en conditions réelles : `realHeightFloor` corrigé (confirmé en clair dans la
 * modale), aperçu de la modale correctement petit (lui ne dépend pas du squelette, cf. plus bas),
 * mais rendu dans la Scène resté gigantesque quel que soit le redimensionnement demandé.
 *
 * CE QUE CE FICHIER VÉRIFIE : après cloneSkinned(), le SkinnedMesh cloné pointe vers un Skeleton
 * DISTINCT dont les os sont ceux du CLONE (pas de l'original), la propriété qui manque à
 * `.clone(true)`.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { cloneSkinned } from '../src/vendor/SkeletonUtils.js';

/** Un Group minimal : un SkinnedMesh à deux os, comme en produirait GLTFLoader. */
function personnageArticuléMinimal(){
  const racine = new THREE.Bone(); racine.name = 'racine';
  const enfant = new THREE.Bone(); enfant.name = 'enfant'; enfant.position.y = 1;
  racine.add(enfant);

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
  return { scène, maillage, squelette, racine, enfant };
}

describe('cloneSkinned : le clone a son PROPRE squelette', () => {
  test('RÉGRESSION : .clone(true) partage le squelette de l\'original (le bug)', () => {
    // Documente le défaut qui justifie ce fichier : sans lui, on ne saurait pas dire si
    // cloneSkinned répare quelque chose de réel ou résout un problème imaginaire.
    const { scène, maillage } = personnageArticuléMinimal();
    const cloneNaïf = scène.clone(true);
    const maillageCloné = cloneNaïf.children[0];
    assert.equal(maillageCloné.skeleton, maillage.skeleton,
      'ce test doit constater le partage — si .clone(true) le corrige un jour dans three, ' +
      'cloneSkinned devient un correctif obsolète, pas un bug');
  });

  test('cloneSkinned donne un Skeleton distinct de celui de l\'original', () => {
    const { scène, squelette } = personnageArticuléMinimal();
    const clone = cloneSkinned(scène);
    const maillageCloné = clone.children[0];
    assert.notEqual(maillageCloné.skeleton, squelette, 'le squelette est toujours partagé');
  });

  test('RÉGRESSION : les os du squelette cloné appartiennent au CLONE, pas à l\'original', () => {
    // La propriété qui manque à .clone(true), et la cause directe du rendu figé à l'échelle du
    // fichier : sans elle, transformer le clone (placeRigCentered3D) ne bouge aucun os que le GPU
    // utilise réellement pour déformer le maillage.
    const { scène, racine, enfant } = personnageArticuléMinimal();
    const clone = cloneSkinned(scène);
    const maillageCloné = clone.children[0];
    const osClonés = new Set();
    clone.traverse(n => { if (n.isBone) osClonés.add(n); });

    maillageCloné.skeleton.bones.forEach(os => {
      assert.ok(osClonés.has(os), `un os du squelette cloné (${os.name}) n'appartient pas au clone`);
    });
    assert.equal(maillageCloné.skeleton.bones.includes(racine), false,
      'le squelette cloné référence encore l\'os RACINE de l\'original');
    assert.equal(maillageCloné.skeleton.bones.includes(enfant), false,
      'le squelette cloné référence encore l\'os ENFANT de l\'original');
  });

  test('transformer le clone ne touche pas l\'original (deux instances indépendantes)', () => {
    // C'est le comportement attendu de dix chaises du même fichier (cf. buildImportedModelRig3D) :
    // chaque instance doit pouvoir être posée/mise à l'échelle sans répercussion sur les autres.
    const { scène, racine } = personnageArticuléMinimal();
    const clone = cloneSkinned(scène);
    const racineClonée = clone.children[0].skeleton.bones[0];
    racineClonée.position.set(10, 20, 30);
    racineClonée.updateMatrixWorld(true);
    assert.deepEqual([racine.position.x, racine.position.y, racine.position.z], [0, 0, 0],
      'déplacer un os du clone a déplacé celui de l\'original');
  });

  test('un noeud non-squelette (mesh simple) est cloné normalement, sans erreur', () => {
    // buildImportedModelRig3D appelle cloneSkinned() pour TOUT modèle importé, articulé ou non
    // (une chaise .glb n'a pas de SkinnedMesh) : la fonction doit rester un no-op sûr dans ce cas.
    const boîte = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    const scène = new THREE.Group(); scène.add(boîte);
    const clone = cloneSkinned(scène);
    assert.equal(clone.children.length, 1);
    assert.notEqual(clone.children[0], boîte, 'le mesh n\'a pas été cloné du tout');
  });
});
