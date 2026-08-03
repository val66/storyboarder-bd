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
  wallChildShapeKey3D,
  disposeGroupGeometries3D,
  buildWindowRig3D,
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

// ── wallChildShapeKey3D (Fix 25) ──────────────────────────────────────────────────────────────
// Cœur du correctif de fluidité : cette clé décide si le rig 3D d'une Parois peut être RÉUTILISÉ
// d'une frame à l'autre. Elle doit donc ignorer tout ce qui n'est que du placement (sinon on
// reconstruit la géométrie à chaque pixel de glisser) et réagir à tout ce qui change la forme
// (sinon on affiche un rig périmé).
describe('wallChildShapeKey3D — clé de forme d\'une Parois (Fix 25)', () => {
  const base = () => ({ id: 'c1', objType: 'porte_ouverte', color: '#888', w: 40, h: 90,
                        doorState: 'gauche', doorAngle: 76,
                        x: 100, y: 200, wallAlongFrac: 0.25, wallYFrac: 0.1 });

  test('INVARIANTE au placement : glisser la Parois ne change pas la clé', () => {
    const a = base();
    const b = { ...base(), x: 731, y: 654, wallAlongFrac: 0.92, wallYFrac: 0.77 };
    assert.equal(wallChildShapeKey3D(a), wallChildShapeKey3D(b),
      'x/y/wallAlongFrac/wallYFrac ne doivent PAS entrer dans la clé');
  });

  test('l\'id n\'entre pas dans la clé (deux Parois identiques partagent la même forme)', () => {
    assert.equal(wallChildShapeKey3D(base()), wallChildShapeKey3D({ ...base(), id: 'c2' }));
  });

  for (const [champ, valeur] of [
    ['objType',     'fenetre_ouverte'],
    ['color',       '#123456'],
    ['w',           41],
    ['h',           91],
    ['doorState',   'droite'],
    ['doorAngle',   30],
    ['windowState', 'droite'],
    ['windowAngle', 45],
  ]) {
    test(`SENSIBLE à un changement de forme : ${champ}`, () => {
      assert.notEqual(wallChildShapeKey3D(base()), wallChildShapeKey3D({ ...base(), [champ]: valeur }),
        `${champ} doit invalider la clé, sinon un rig périmé serait réutilisé`);
    });
  }

  test('champs absents : pas de plantage, clé stable entre deux appels', () => {
    const minimal = { objType: 'escalier' };
    assert.equal(wallChildShapeKey3D(minimal), wallChildShapeKey3D({ objType: 'escalier' }));
  });
});

// ── disposeGroupGeometries3D (Fix 25) ─────────────────────────────────────────────────────────
describe('disposeGroupGeometries3D — libération des géométries d\'un rig jeté (Fix 25)', () => {
  test('libère les géométries de tout le sous-arbre', () => {
    const group = new THREE.Group();
    const g1 = new THREE.BoxGeometry(1, 1, 1), g2 = new THREE.BoxGeometry(2, 2, 2);
    const m = new THREE.MeshBasicMaterial();
    const child = new THREE.Mesh(g1, m);
    const petitEnfant = new THREE.Mesh(g2, m);
    child.add(petitEnfant);
    group.add(child);
    let n1 = 0, n2 = 0;
    g1.dispose = () => { n1++; }; g2.dispose = () => { n2++; };
    disposeGroupGeometries3D(group);
    assert.equal(n1, 1, 'géométrie de l\'enfant libérée');
    assert.equal(n2, 1, 'géométrie du petit-enfant libérée (traversée récursive)');
  });

  test('NE libère PAS les matériaux (ils sont partagés entre tous les rigs)', () => {
    const group = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial();
    let disposed = 0;
    mat.dispose = () => { disposed++; };
    group.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat));
    disposeGroupGeometries3D(group);
    assert.equal(disposed, 0, 'libérer un matériau partagé effacerait des Éléments sans rapport');
  });

  test('une géométrie partagée par plusieurs meshes n\'est libérée qu\'une fois', () => {
    // Cas réel : buildWallRig3D réutilise une même BoxGeometry pour toutes les rangées de joints.
    const group = new THREE.Group();
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshBasicMaterial();
    let n = 0;
    geo.dispose = () => { n++; };
    for (let i = 0; i < 4; i++) group.add(new THREE.Mesh(geo, mat));
    disposeGroupGeometries3D(group);
    assert.equal(n, 1, 'une seule libération malgré 4 meshes partageant la géométrie');
  });

  test('racine absente : no-op (ne plante pas)', () => {
    disposeGroupGeometries3D(null);
    disposeGroupGeometries3D(undefined);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 31d — encombrement du dormant de Fenêtre.
//
// Le Fix 31 avait épaissi le dormant pour le rendre plus présent sur un Muret, mais en
// jouant sur la PROFONDEUR : 0.16 pour le cadre et 0.24 pour le chambranle, contre une
// épaisseur de Mur de référence de 0.12 (buildWallRig3D : thick = h × 0.06, h = 2.0).
// La caisse débordait donc de 0.06 par face à l'intérieur de la pièce. La présence vient
// désormais de l'épaisseur DANS LE PLAN du mur ; la profondeur est calée sur le mur.
// ─────────────────────────────────────────────────────────────────────────────
describe('buildWindowRig3D — encombrement du dormant (Fix 31d)', () => {
  const MUR_REF = 0.12; // profondeur de reference du dormant, pas l epaisseur d un Mur
  // Profondeur du dormant SEUL : l'ouvrant (le pivot) sort du mur par construction quand
  // la Fenêtre est ouverte, ce n'est pas lui qui était en cause.
  const profondeurDormant = g => {
    g.updateMatrixWorld(true);
    const box = new THREE.Box3();
    g.children.filter(c => c.isMesh).forEach(m => box.expandByObject(m));
    return box.max.z - box.min.z;
  };

  test('le dormant ne déborde que très légèrement du Mur, des deux côtés', () => {
    for (const ouvert of [false, true]) {
      const d = profondeurDormant(buildWindowRig3D('#3355aa', ouvert, 'gauche', 58));
      const debord = (d - MUR_REF) / 2;
      assert.ok(debord >= 0, `affleurant, pas enfoncé (${debord.toFixed(4)})`);
      // Seuil mesuré, pas posé : la valeur réelle est 0.0100. Les deux régressions plausibles
      // (chambranle rendu proportionnel au cadre → 0.0147, cadre remis à 0.16 → 0.0200)
      // doivent tomber au-dessus, d'où 0.012 — 20 % de marge sur le réel, sous la 1re fautive.
      assert.ok(debord <= 0.012,
        `débord ≤ 1.2 cm par face — obtenu ${debord.toFixed(4)} (ouvert : ${ouvert})`);
    }
  });

  test('RÉGRESSION : le dormant reste plus fin que 1.5 × l\'épaisseur du Mur', () => {
    // La version fautive atteignait 0.24, soit 2× le mur.
    const d = profondeurDormant(buildWindowRig3D('#3355aa', false, 'gauche'));
    assert.ok(d < MUR_REF * 1.25, `profondeur ${d.toFixed(3)} < ${(MUR_REF * 1.25).toFixed(3)}`);
  });

  test('la présence du dormant vient de son épaisseur dans le plan, pas de sa profondeur', () => {
    // Le cadre occupe une bande visible de face : au moins 8 % de la largeur de la Fenêtre.
    const g = buildWindowRig3D('#3355aa', false, 'gauche');
    const barres = g.children.filter(c => c.isMesh && c.geometry.parameters);
    const montant = barres
      .map(m => m.geometry.parameters.width)
      .filter(w => w < 0.5)          // les montants verticaux, pas les traverses
      .sort((a, b) => b - a)[0];
    assert.ok(montant >= 0.08, `montant large de ${montant} (≥ 0.08 de la largeur 1.0)`);
  });

  test('le dormant tient dans la largeur et la hauteur nominales du type', () => {
    // Sinon il ne rentrerait plus dans le trou découpé pour lui (cf. CHILD_DESIGN_SIZE_3D).
    const g = buildWindowRig3D('#3355aa', false, 'gauche');
    g.updateMatrixWorld(true);
    const box = new THREE.Box3();
    g.children.filter(c => c.isMesh).forEach(m => box.expandByObject(m));
    assert.ok(box.max.x - box.min.x <= 1.0 + 1e-6, 'largeur ≤ 1.0');
    assert.ok(box.max.y - box.min.y <= 1.1 + 1e-6, 'hauteur ≤ 1.1');
    assert.ok(box.min.y >= -1e-6, 'base à y = 0');
  });
});
