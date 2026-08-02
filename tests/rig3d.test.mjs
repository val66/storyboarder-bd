// tests/rig3d.test.mjs — Tests unitaires de src/rig3d.js (rigs 3D Persona/Objet/Mur + caméra
// des aperçus 3D). Priorité explicite demandée : couvrir en premier tout ce qui touche à la Caméra
// (frameCameraToBox/frameOrthoCameraToBox/frameCameraToFigure sont la caméra des aperçus
// Personnage/Objet des modales, cf. personaCamera3D/personaCameraOrtho3D).
//
// NON couvert ici, volontairement : buildPersonaRig3D/buildObjectRig3D/buildWallRig3D et consorts
// (construction de graphes de scène THREE.js complets — testables uniquement par comparaison
// visuelle, pas par assertion de valeurs), ensurePersonaScene3D et tout ce qui en dépend (essaie de
// construire un vrai THREE.WebGLRenderer, qui échoue sous Node — cf. en-tête de scene3d.test.mjs
// pour la vérification empirique), drawFace/drawPersona3D (peinture canvas 2D, pas de valeur de
// retour assertable).
import './helpers/dom-stub.mjs';
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  frameCameraToBox,
  frameOrthoCameraToBox,
  frameCameraToFigure,
  getEffectiveJoints,
  cloneJoints,
  getBodyProportions3D,
  resolveStyle3D,
  applyStyleCanvasFilter3D,
  expandBoxByMeshOnly3D,
} from '../src/rig3d.js';
import { S } from '../src/state.js';
import { POSE_3D } from '../src/constants.js';

function assertClose(actual, expected, msg, eps = 1e-9) {
  assert.ok(Math.abs(actual - expected) < eps,
    `${msg} — attendu ≈ ${expected}, obtenu ${actual}`);
}

const THREE = globalThis.THREE;

beforeEach(() => {
  S.editingSceneId = null;
});

describe('frameCameraToBox / frameOrthoCameraToBox / frameCameraToFigure — caméra des aperçus 3D (Personnage/Objet)', () => {
  test('frameCameraToBox : distance calculée pour que la boîte tienne dans le champ de vision, caméra centrée', () => {
    const camera = new THREE.PerspectiveCamera(90, 1, 0.1, 1000);
    // box 2×4×1 centrée à l'origine ; fov=90°/aspect=1 → tan(halfFov)=1 des deux côtés
    const box = new THREE.Box3(new THREE.Vector3(-1, -2, -0.5), new THREE.Vector3(1, 2, 0.5));
    frameCameraToBox(camera, box, 1, null);
    // distForHeight = (4/2*1.22)/tan(45°) = 2.44 ; distForWidth = (2/2*1.22)/tan(45°) = 1.22
    // dist = max(2.44, 1.22, 0.8) = 2.44 ; position.z = center.z + dist + size.z/2 = 0 + 2.44 + 0.5
    assertClose(camera.position.x, 0, 'position.x centrée');
    assertClose(camera.position.y, 0, 'position.y centrée');
    assertClose(camera.position.z, 2.94, 'position.z = dist dominé par la hauteur + demi-profondeur');

    camera.updateMatrixWorld();
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    assertClose(dir.x, 0, 'regarde bien vers le centre de la boîte (x)');
    assertClose(dir.y, 0, 'regarde bien vers le centre de la boîte (y)');
    assertClose(dir.z, -1, 'regarde bien vers le centre de la boîte (z, vers -Z)');
  });

  test('frameCameraToBox : le pan décale la cible ET la caméra d\'autant, sans changer la distance', () => {
    const camera = new THREE.PerspectiveCamera(90, 1, 0.1, 1000);
    const box = new THREE.Box3(new THREE.Vector3(-1, -2, -0.5), new THREE.Vector3(1, 2, 0.5));
    frameCameraToBox(camera, box, 1, { x: 0.3, y: -0.2 });
    assertClose(camera.position.x, 0.3, 'pan.x appliqué');
    assertClose(camera.position.y, -0.2, 'pan.y appliqué');
    assertClose(camera.position.z, 2.94, 'distance (z) inchangée par le pan');
  });

  test('frameCameraToBox : un zoom×2 divise la distance par 2 (rapproche la caméra)', () => {
    const camera = new THREE.PerspectiveCamera(90, 1, 0.1, 1000);
    const box = new THREE.Box3(new THREE.Vector3(-1, -2, -0.5), new THREE.Vector3(1, 2, 0.5));
    frameCameraToBox(camera, box, 2, null);
    assertClose(camera.position.z, 1.72, 'dist=2.44/2=1.22, +size.z/2=0.5 → 1.72');
  });

  test('frameOrthoCameraToBox : left/right/top/bottom dérivés de la taille de la boîte (marge incluse)', () => {
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    const box = new THREE.Box3(new THREE.Vector3(-1, -2, -0.25), new THREE.Vector3(1, 2, 0.25));
    frameOrthoCameraToBox(camera, box, 1, null);
    assertClose(camera.left, -1.22, 'left = -halfW');
    assertClose(camera.right, 1.22, 'right = halfW');
    assertClose(camera.top, 2.44, 'top = halfH');
    assertClose(camera.bottom, -2.44, 'bottom = -halfH');
    assertClose(camera.near, 0.01, 'near plane fixe');
    assertClose(camera.far, 22, 'far = dist*2+10, dist = max(size.z,0.1)*2+5 = 6');
    assertClose(camera.position.z, 6, 'position.z = dist (vue orthographique, la distance ne change pas l\'échelle)');
  });

  test('frameCameraToFigure : calcule lui-même la boîte englobante du groupe et cadre dessus (délègue à frameCameraToBox)', () => {
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 1), new THREE.MeshBasicMaterial());
    group.add(mesh);
    const camera = new THREE.PerspectiveCamera(90, 1, 0.1, 1000);
    frameCameraToFigure(camera, group, 1, null);
    // Même géométrie (2×4×1 centrée à l'origine) que le test frameCameraToBox ci-dessus → même résultat.
    assertClose(camera.position.z, 2.94, 'même distance que le calcul direct sur la boîte équivalente');
  });
});

describe('getEffectiveJoints / cloneJoints — pose active d\'un Personnage', () => {
  test('sans joints3d ni position explicite : pose "debout" par défaut', () => {
    assert.equal(getEffectiveJoints({}), POSE_3D.debout);
  });

  test('avec o.position défini : pose correspondante de POSE_3D', () => {
    assert.equal(getEffectiveJoints({ position: 'assis' }), POSE_3D.assis);
  });

  test('avec o.joints3d défini (pose personnalisée) : prioritaire sur o.position', () => {
    const custom = { torsoRotX: 0.42 };
    assert.equal(getEffectiveJoints({ position: 'assis', joints3d: custom }), custom);
  });

  test('cloneJoints : copie profonde indépendante (pas la même référence)', () => {
    const cloned = cloneJoints(POSE_3D.debout);
    assert.deepEqual(cloned, POSE_3D.debout);
    assert.notEqual(cloned, POSE_3D.debout, 'référence différente');
    cloned.torsoRotX = 999;
    assertClose(POSE_3D.debout.torsoRotX, 0, 'la pose originale de POSE_3D n\'est pas mutée');
  });

  test('cloneJoints sans argument : clone la pose "debout" par défaut', () => {
    assert.deepEqual(cloneJoints(undefined), POSE_3D.debout);
  });
});

describe('getBodyProportions3D — silhouette homme/femme', () => {
  test('genre "femme" : proportions plus fines que le modèle par défaut (homme)', () => {
    const femme = getBodyProportions3D('femme');
    const homme = getBodyProportions3D('homme');
    assert.ok(femme.headR < homme.headR, 'tête légèrement plus petite');
    assert.ok(femme.shoulderR < homme.shoulderR, 'épaules plus fines');
    assert.ok(femme.hipR > homme.hipR, 'hanches plus marquées');
    assert.ok(femme.bustR > 0 && homme.bustR === 0, 'buste uniquement pour le modèle féminin');
  });

  test('tout genre autre que "femme" retombe sur le modèle "homme"', () => {
    assert.deepEqual(getBodyProportions3D('autre'), getBodyProportions3D('homme'));
    assert.deepEqual(getBodyProportions3D(undefined), getBodyProportions3D('homme'));
  });
});

describe('resolveStyle3D / applyStyleCanvasFilter3D — style graphique 3D', () => {
  test('styleKey explicite : renvoyé tel quel (pas de repli sur le Tome courant)', () => {
    assert.equal(resolveStyle3D('un_style_quelconque'), 'un_style_quelconque');
  });

  test('sans styleKey et aucun Tome courant : repli sur le premier style de STYLES_3D', () => {
    S.tomes = [];
    S.editingSceneId = null;
    assert.equal(resolveStyle3D(), 'simplifie');
  });

  test('applyStyleCanvasFilter3D : style "comics_numerique" applique un filtre contraste/saturation', () => {
    const c = {};
    applyStyleCanvasFilter3D(c, 'comics_numerique');
    assert.equal(c.filter, 'contrast(1.12) saturate(1.25)');
  });

  test('applyStyleCanvasFilter3D : tout autre style → aucun filtre', () => {
    const c = {};
    applyStyleCanvasFilter3D(c, 'simplifie');
    assert.equal(c.filter, 'none');
  });
});

describe('expandBoxByMeshOnly3D — boîte englobante d\'un seul mesh (sans ses enfants)', () => {
  test('étend une boîte vide aux dimensions monde du mesh (géométrie + position)', () => {
    const box = new THREE.Box3();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 6), new THREE.MeshBasicMaterial());
    mesh.position.set(1, 2, 3);
    expandBoxByMeshOnly3D(box, mesh);
    assertClose(box.min.x, 0, 'min.x'); assertClose(box.max.x, 2, 'max.x');
    assertClose(box.min.y, 0, 'min.y'); assertClose(box.max.y, 4, 'max.y');
    assertClose(box.min.z, 0, 'min.z'); assertClose(box.max.z, 6, 'max.z');
  });

  test('mesh sans géométrie ou absent : no-op (ne plante pas)', () => {
    const box = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 1));
    expandBoxByMeshOnly3D(box, null);
    assertClose(box.max.x, 1, 'boîte inchangée');
    expandBoxByMeshOnly3D(box, {});
    assertClose(box.max.x, 1, 'boîte toujours inchangée (pas de .geometry)');
  });
});
