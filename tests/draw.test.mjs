// tests/draw.test.mjs. Tests unitaires de src/draw.js (dessin des Cases, construction de
// Bâtiments, géométrie des Bulles, wrap de texte).
import './helpers/dom-stub.mjs';
// events.js déclenche à son chargement initStartupProject() (async, via loadAppSettings().then(...))
// qui peuple S.tomes avec un Tome/Page de démarrage, sans cet import, S.tomes reste [] et
// currentPage()/currentPageData() plantent (utilisés en interne par stopBuildMode → drawCurrentPage,
// appelé depuis buildToolClose). draw.js ne déclenche pas cette initialisation lui-même (c'est
// events.js qui orchestre le démarrage de l'appli), d'où cet import par effet de bord uniquement.
import '../src/events.js';
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  detectBuildFaces,
  addRoomWallElement,
  buildToolCreateWallSegment,
  buildToolClose,
  getRoomBoundingBoxXZ,
  getBuildingBoundingBoxXZ,
  getPanelPoints,
  bubbleTailVisible,
  bubbleShapeOf,
  bubbleEdgePoint,
  getBubbleTailTip,
  distToSegmentSq,
  wrapTextLines,
  projectJointToCanvas,
  projectPoseHandlePositions3D,
  personaLimbSegmentScreen3D,
  cadreDeRecouvrement3D,
  ancrageApresGlissement3D,
} from '../src/draw.js';
import { S, currentPage } from '../src/state.js';
import { buildWallJunctions3D, isJunctionWall3D } from '../src/scene3d.js';
import { GROUND_Y_DEFAULT_3D, BUILD_WALL_DEFAULT_HEIGHT, PANEL_CAM_DEFAULT_DIST_3D,
         POSE_HANDLES } from '../src/constants.js';

// Fix 92 : les extracteurs de source RETIRENT les commentaires avant de chercher.
//
// Découvert en mutant : remplacer l'appel à personaLimbSegmentScreen3D par `null` dans l'overlay
// n'a fait échouer AUCUN test, parce qu'un commentaire voisin citait le nom de la fonction. Le
// test croyait vérifier un appel, il vérifiait une phrase. C'est le pire état pour un test : vert,
// et vide. Tous les tests d'inspection de ce fichier passent désormais par ici.
import { sourceSansCommentaires } from './helpers/source.mjs';
export { sourceSansCommentaires };

function assertClose(actual, expected, msg, eps = 1e-6) {
  assert.ok(Math.abs(actual - expected) < eps,
    `${msg} — attendu ≈ ${expected}, obtenu ${actual}`);
}

beforeEach(() => {
  S.selectedId = null;
  S.selectedRoomId = null;
  S.buildTool = null;
});

// ── detectBuildFaces ──────────────────────────────────────────────────────────────────────────
describe('detectBuildFaces : détection des faces planaires du graphe de murs', () => {
  test('moins de 3 segments : pas assez pour fermer une face, renvoie null', () => {
    assert.equal(detectBuildFaces([]), null);
    assert.equal(detectBuildFaces([{ id: 'w1', x1: 0, z1: 0, x2: 1, z2: 0 }]), null);
  });

  test('une seule Pièce fermée (triangle) : comportement standard, renvoie null (pas de scission nécessaire)', () => {
    const wallSegs = [
      { id: 'w1', x1: 0, z1: 0, x2: 4, z2: 0 },
      { id: 'w2', x1: 4, z1: 0, x2: 2, z2: 3 },
      { id: 'w3', x1: 2, z1: 3, x2: 0, z2: 0 },
    ];
    assert.equal(detectBuildFaces(wallSegs), null);
  });

  test('un carré fermé (4 murs) : une seule face intérieure, renvoie null', () => {
    const wallSegs = [
      { id: 'w1', x1: 0, z1: 0, x2: 2, z2: 0 },
      { id: 'w2', x1: 2, z1: 0, x2: 2, z2: 2 },
      { id: 'w3', x1: 2, z1: 2, x2: 0, z2: 2 },
      { id: 'w4', x1: 0, z1: 2, x2: 0, z2: 0 },
    ];
    assert.equal(detectBuildFaces(wallSegs), null);
  });

  test('deux carrés unitaires adjacents partageant une cloison : 2 faces intérieures détectées', () => {
    const wallSegs = [
      { id: 'w1', x1: 0, z1: 0, x2: 1, z2: 0 },
      { id: 'w2', x1: 1, z1: 0, x2: 1, z2: 1 }, // cloison partagée A/B
      { id: 'w3', x1: 1, z1: 1, x2: 0, z2: 1 },
      { id: 'w4', x1: 0, z1: 1, x2: 0, z2: 0 },
      { id: 'w5', x1: 1, z1: 0, x2: 2, z2: 0 },
      { id: 'w6', x1: 2, z1: 0, x2: 2, z2: 1 },
      { id: 'w7', x1: 2, z1: 1, x2: 1, z2: 1 },
    ];
    const result = detectBuildFaces(wallSegs);
    assert.ok(result, 'devrait détecter 2 pièces');
    assert.equal(result.interiorFaces.length, 2, 'deux faces intérieures');
    const shoelaceAbsArea = (poly) => {
      let a = 0;
      for (let i = 0; i < poly.length; i++) {
        const p = poly[i], q = poly[(i + 1) % poly.length];
        a += p.x * q.z - q.x * p.z;
      }
      return Math.abs(a / 2);
    };
    result.interiorFaces.forEach((f, i) => {
      assertClose(shoelaceAbsArea(f.polygon), 1, `aire de la face ${i} ≈ 1`);
    });
    assert.equal(result.wallFaceIdx.size, 7, 'les 7 murs sont attribués à une face');
    assert.ok(result.wallFaceIdxAlt.has('w2'), 'w2 (cloison) a une face alternative');
    const faceA = result.wallFaceIdx.get('w2');
    const faceB = result.wallFaceIdxAlt.get('w2');
    assert.notEqual(faceA, faceB, 'les deux faces de la cloison sont bien différentes');
    assert.ok(!result.wallFaceIdxAlt.has('w1'));
    assert.ok(!result.wallFaceIdxAlt.has('w4'));
  });

  test('sommets quasi-identiques (bruit flottant < EPS) sont dédupliqués comme un seul sommet', () => {
    const wallSegs = [
      { id: 'w1', x1: 0, z1: 0, x2: 4, z2: 0 },
      { id: 'w2', x1: 4, z1: 0, x2: 2, z2: 3 },
      { id: 'w3', x1: 2, z1: 3, x2: 0.005, z2: 0.004 },
    ];
    assert.equal(detectBuildFaces(wallSegs), null);
  });
});

// ── addRoomWallElement / uniqueDefaultName / buildToolCreateWallSegment ─────────────────────────
describe('addRoomWallElement / uniqueDefaultName : création d\'un Mur', () => {
  test('crée un objet Mur poussé dans page.objects, avec le bon pieceId/pieceLabel', () => {
    const panel = { id: 'panel1', x: 0, y: 0, w: 800, h: 600 };
    const page = { objects: [] };
    const obj = addRoomWallElement(panel, page, 'Mur', 0, GROUND_Y_DEFAULT_3D + 1.5, 0, 4, 3, 0, 0, 'p1', 'Pièce');
    assert.equal(page.objects.length, 1);
    assert.equal(page.objects[0], obj);
    assert.equal(obj.type, 'objet3d');
    assert.equal(obj.objType, 'mur');
    assert.equal(obj.pieceId, 'p1');
    assert.equal(obj.pieceLabel, 'Pièce');
    assert.equal(obj.name, 'Mur');
    assert.equal(obj.homePanelId, panel.id);
  });

  test('uniqueDefaultName : deux Murs par défaut dans la même Case ne partagent jamais le même nom', () => {
    const panel = { id: 'panel1', type: 'panel', x: 0, y: 0, w: 800, h: 600 };
    const page = { objects: [panel] };
    const obj1 = addRoomWallElement(panel, page, 'Mur', 0, GROUND_Y_DEFAULT_3D + 1.5, 0, 4, 3, 0, 0, 'p1', 'Pièce');
    const obj2 = addRoomWallElement(panel, page, 'Mur', 5, GROUND_Y_DEFAULT_3D + 1.5, 0, 4, 3, 0, 0, 'p1', 'Pièce');
    assert.equal(obj1.name, 'Mur');
    assert.equal(obj2.name, 'Mur 2', 'renommage automatique à la 2e création');
  });

  test('uniqueDefaultName ignore les Murs d\'une autre Case (findOwningPanel via homePanelId)', () => {
    const panelA = { id: 'panelA', type: 'panel', x: 0, y: 0, w: 800, h: 600 };
    const panelB = { id: 'panelB', type: 'panel', x: 1000, y: 0, w: 800, h: 600 };
    const page = { objects: [panelA, panelB] };
    addRoomWallElement(panelA, page, 'Mur', 0, GROUND_Y_DEFAULT_3D + 1.5, 0, 4, 3, 0, 0, 'p1', 'Pièce');
    const objB = addRoomWallElement(panelB, page, 'Mur', 0, GROUND_Y_DEFAULT_3D + 1.5, 0, 4, 3, 0, 0, 'p2', 'Pièce');
    assert.equal(objB.name, 'Mur', 'pas de conflit entre Cases différentes');
  });
});

describe('buildToolCreateWallSegment : création d\'un mur entre deux points sol', () => {
  function makePanel() {
    return { id: 'panel1', x: 0, y: 0, w: 800, h: 600, camRotX: 0, camRotY: 0, camDist: PANEL_CAM_DEFAULT_DIST_3D, camWx: 0, camWy: 0, camWz: 0 };
  }

  test('segment dégénéré (longueur quasi nulle) : ne crée rien, renvoie null', () => {
    const panel = makePanel();
    const page = { objects: [] };
    S.buildTool = { pieceId: 'p1', pieceLabel: 'Pièce', wallSegs: [] };
    const id = buildToolCreateWallSegment(panel, page, 1, 1, 1.001, 1.001);
    assert.equal(id, null);
    assert.equal(page.objects.length, 0);
  });

  test('segment horizontal (0,0)→(4,0) : mur créé avec la bonne position/longueur/orientation monde', () => {
    const panel = makePanel();
    const page = { objects: [] };
    S.buildTool = { pieceId: 'p1', pieceLabel: 'Pièce', wallSegs: [] };
    const id = buildToolCreateWallSegment(panel, page, 0, 0, 4, 0);
    assert.ok(id, 'un id de mur est renvoyé');
    const obj = page.objects.find(o => o.id === id);
    assert.ok(obj, 'le mur existe dans page.objects');
    assertClose(obj.wxFloor, 2, 'centre X = milieu du segment');
    assertClose(obj.wzFloor, 0, 'centre Z = milieu du segment');
    assertClose(obj.wyFloor, GROUND_Y_DEFAULT_3D + BUILD_WALL_DEFAULT_HEIGHT / 2, 'centré entre sol et plafond');
    assertClose(obj.realLenFloor, 4, 'longueur réelle = distance entre les deux points');
    assertClose(obj.realHeightFloor, BUILD_WALL_DEFAULT_HEIGHT, 'hauteur par défaut');
    assertClose(obj.rotY, 0, 'mur aligné sur +X → rotY = atan2(-0,4) = 0');
    assert.equal(obj.pieceId, 'p1');
    assert.equal(S.buildTool.wallSegs.length, 1);
    assertClose(S.buildTool.wallSegs[0].x1, 0);
    assertClose(S.buildTool.wallSegs[0].x2, 4);
  });

  test('segment vertical (0,0)→(0,4) : rotY = atan2(-4,0) = -π/2', () => {
    const panel = makePanel();
    const page = { objects: [] };
    S.buildTool = { pieceId: 'p1', pieceLabel: 'Pièce', wallSegs: [] };
    const id = buildToolCreateWallSegment(panel, page, 0, 0, 0, 4);
    const obj = page.objects.find(o => o.id === id);
    assertClose(obj.rotY, Math.atan2(-4, 0), 'rotY dérivé de atan2(-dz,dx)');
  });
});

// ── getRoomBoundingBoxXZ / getBuildingBoundingBoxXZ ────────────────────────────────────────────
describe('getRoomBoundingBoxXZ / getBuildingBoundingBoxXZ : boîtes englobantes XZ', () => {
  function floorDalle(pieceId, polygon) {
    return { pieceId, objType: 'dalle', polygon, worldY: GROUND_Y_DEFAULT_3D + 0.01 };
  }

  test('aucune Dalle de plancher pour cette Pièce : renvoie null', () => {
    const page = { objects: [] };
    assert.equal(getRoomBoundingBoxXZ('p1', page), null);
  });

  test('boîte englobante d\'un plancher rectangulaire simple', () => {
    const page = { objects: [floorDalle('p1', [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }, { x: 0, z: 3 }])] };
    const bbox = getRoomBoundingBoxXZ('p1', page);
    assert.deepEqual(bbox, { minX: 0, maxX: 4, minZ: 0, maxZ: 3, w: 4, d: 3, cx: 2, cz: 1.5 });
  });

  test('getBuildingBoundingBoxXZ : union des boîtes de plusieurs Pièces du même Bâtiment', () => {
    const page = {
      objects: [
        floorDalle('p1', [{ x: 0, z: 0 }, { x: 2, z: 0 }, { x: 2, z: 2 }, { x: 0, z: 2 }]),
        floorDalle('p2', [{ x: 2, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 2 }, { x: 2, z: 2 }]),
      ],
    };
    const bbox = getBuildingBoundingBoxXZ(['p1', 'p2'], page);
    assert.deepEqual(bbox, { minX: 0, maxX: 4, minZ: 0, maxZ: 2, w: 4, d: 2, cx: 2, cz: 1 });
  });

  test('getBuildingBoundingBoxXZ : aucune Pièce correspondante → null', () => {
    const page = { objects: [floorDalle('p1', [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 1, z: 1 }])] };
    assert.equal(getBuildingBoundingBoxXZ(['pAutre'], page), null);
  });
});

// ---------- « buildTryExtendWall » : SES TESTS SONT PARTIS AVEC ELLE (#402d) ----------
//
// Ils décrivaient le prolongement d'un mur colinéaire dans l'outil Construire. La fonction n'avait
// plus d'appelant, alors que son propre commentaire en nommait un : « seul buildToolClose l'appelle
// en interne ». Un commentaire qui nomme un appelant vieillit comme n'importe quel code.

// ⚠️ ET LES DEUX COMMENTAIRES SE CONTREDISAIENT. Celui de la fonction, dans draw.js, affirmait
// « seul buildToolClose l'appelle en interne » ; celui qui vivait ICI disait l'inverse, « appelée
// nulle part ailleurs, code mort à ce jour, on la teste quand même, prête à être branchée ». Deux
// notes voisines, deux verdicts opposés, et personne pour trancher pendant tout ce temps.
//
// Elle est retirée : « prête à être branchée » n'était plus vrai depuis longtemps, et git la garde.
// Ce que ces tests avaient de précieux — une asymétrie mesurée, le prolongement ne marchait que
// dans un sens — était la description d'un défaut de code mort.

// ── buildToolClose (test d'intégration) ──────────────────────────────────────────────────────
describe('buildToolClose : fermeture de la boucle de murs (intégration)', () => {
  beforeEach(() => {
    S.selectedId = null;
    S.selectedRoomId = null;
  });

  function makePanel() {
    const panel = {
      id: 'panel1', type: 'panel', x: 0, y: 0, w: 800, h: 600,
      pts: [{ x: 0, y: 0 }, { x: 800, y: 0 }, { x: 800, y: 600 }, { x: 0, y: 600 }],
      camRotX: 0, camRotY: 0, camDist: PANEL_CAM_DEFAULT_DIST_3D, camWx: 0, camWy: 0, camWz: 0,
    };
    return panel;
  }

  test('Pièce simple (triangle) : une Dalle Plancher + une Plafond, sélection sur la Pièce créée', () => {
    const panel = makePanel();
    const page = { objects: [panel] };
    S.buildTool = { panelId: panel.id, pieceId: 'p1', pieceLabel: 'Pièce', points: [{ x: 0, z: 0 }], wallSegs: [], wallIds: [] };

    const w1 = buildToolCreateWallSegment(panel, page, 0, 0, 4, 0);
    S.buildTool.wallIds.push(w1); S.buildTool.points.push({ x: 4, z: 0 });
    const w2 = buildToolCreateWallSegment(panel, page, 4, 0, 2, 3);
    S.buildTool.wallIds.push(w2); S.buildTool.points.push({ x: 2, z: 3 });

    buildToolClose(panel, page);

    const dalles = page.objects.filter(o => o.objType === 'dalle');
    assert.equal(dalles.length, 2, 'une Dalle Plancher + une Plafond');
    assert.ok(dalles.every(d => d.pieceId === 'p1'));
    assert.ok(dalles.some(d => d.name === 'Plancher'));
    assert.ok(dalles.some(d => d.name === 'Plafond'));

    const walls = page.objects.filter(o => o.objType === 'mur');
    assert.equal(walls.length, 3, '2 murs tracés + 1 mur de fermeture');
    assert.ok(walls.every(w => w.pieceId === 'p1'), 'tous les murs appartiennent à la même Pièce');

    assert.equal(S.selectedRoomId, 'p1');
    assert.equal(S.selectedId, panel.id);
    assert.equal(S.buildTool, null, 'outil Build désactivé après fermeture');
  });

  test('moins de 3 points : annule (revert) au lieu de fermer : les murs déjà tracés sont supprimés', () => {
    const page = currentPage();
    page.objects.length = 0;
    const panel = makePanel();
    page.objects.push(panel);
    S.buildTool = { panelId: panel.id, pieceId: 'p1', pieceLabel: 'Pièce', points: [{ x: 0, z: 0 }], wallSegs: [], wallIds: [] };
    const w1 = buildToolCreateWallSegment(panel, page, 0, 0, 4, 0);
    S.buildTool.wallIds.push(w1); S.buildTool.points.push({ x: 4, z: 0 });

    assert.equal(page.objects.some(o => o.id === w1), true, 'le mur existe avant fermeture');
    buildToolClose(panel, page);
    assert.equal(page.objects.some(o => o.id === w1), false, 'le mur est retiré (revert)');
    assert.equal(S.buildTool, null);
  });

  test('Bâtiment multi-Pièces (deux carrés adjacents partageant une cloison) : 2 Pièces distinctes créées', () => {
    const panel = makePanel();
    const page = { objects: [panel] };
    S.buildTool = { panelId: panel.id, pieceId: 'p1', pieceLabel: 'Pièce', points: [{ x: 0, z: 0 }], wallSegs: [], wallIds: [] };

    const outer = [{ x: 1, z: 0 }, { x: 2, z: 0 }, { x: 2, z: 1 }, { x: 1, z: 1 }, { x: 0, z: 1 }];
    let prev = { x: 0, z: 0 };
    for (const pt of outer) {
      const id = buildToolCreateWallSegment(panel, page, prev.x, prev.z, pt.x, pt.z);
      S.buildTool.wallIds.push(id);
      S.buildTool.points.push(pt);
      prev = pt;
    }
    const midId = buildToolCreateWallSegment(panel, page, 1, 0, 1, 1);
    S.buildTool.wallIds.push(midId);

    buildToolClose(panel, page);

    const dalles = page.objects.filter(o => o.objType === 'dalle');
    assert.equal(dalles.length, 4, '2 Pièces × (Plancher + Plafond)');
    const roomIds = [...new Set(dalles.map(d => d.pieceId))];
    assert.equal(roomIds.length, 2, 'deux Pièces distinctes');
    assert.ok(roomIds.includes('p1'), 'la 1re Pièce garde le pieceId initial du buildTool');

    const walls = page.objects.filter(o => o.objType === 'mur');
    assert.equal(walls.length, 7, '5 murs extérieurs + 1 cloison + 1 mur de fermeture');
    assert.ok(walls.every(w => roomIds.includes(w.pieceId)), 'chaque mur est attribué à l\'une des 2 Pièces');

    const midWall = walls.find(w => w.id === midId);
    assert.ok(midWall.altPieceId, 'la cloison partagée a une Pièce alternative mémorisée (surlignage)');
    assert.notEqual(midWall.pieceId, midWall.altPieceId, 'les deux faces de la cloison sont bien différentes');

    assert.ok(roomIds.includes(S.selectedRoomId), 'la Pièce sélectionnée est l\'une des 2 créées');
    assert.equal(S.buildTool, null);
  });
});

// ── getPanelPoints : géométrie des formes de Case ────────────────────────────────────────────
describe('getPanelPoints : sommets d\'une Case selon sa forme', () => {
  test('rectangle (par défaut) : 4 coins', () => {
    const pts = getPanelPoints({ x: 0, y: 0, w: 100, h: 50 });
    assert.deepEqual(pts, [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }]);
  });

  test('diamond : losange inscrit dans le rectangle', () => {
    const pts = getPanelPoints({ x: 0, y: 0, w: 100, h: 50, shape: 'diamond' });
    assert.deepEqual(pts, [{ x: 50, y: 0 }, { x: 100, y: 25 }, { x: 50, y: 50 }, { x: 0, y: 25 }]);
  });
});

// ── Bulles (bubbleTailVisible / bubbleShapeOf / bubbleEdgePoint / getBubbleTailTip) ─────────────────
describe('bubbleTailVisible / bubbleShapeOf : propriétés simples d\'une Bulle', () => {
  test('bubbleTailVisible : true par défaut, false si tailVisible === false explicitement', () => {
    assert.equal(bubbleTailVisible({}), true);
    assert.equal(bubbleTailVisible({ tailVisible: false }), false);
  });

  test('bubbleShapeOf : "ovale" par défaut, sinon la forme explicite', () => {
    assert.equal(bubbleShapeOf({}), 'ovale');
    assert.equal(bubbleShapeOf({ bulleShape: 'rect' }), 'rect');
  });
});

describe('bubbleEdgePoint : point sur le contour d\'une Bulle selon un angle', () => {
  const o = { x: 0, y: 0, w: 100, h: 50 };

  test('forme ovale : ellipse paramétrique (theta=0 → bord droit, theta=PI/2 → bord bas)', () => {
    assertClose(bubbleEdgePoint(o, 0).x, 100, 'theta=0, x');
    assertClose(bubbleEdgePoint(o, 0).y, 25, 'theta=0, y');
    assertClose(bubbleEdgePoint(o, Math.PI / 2).x, 50, 'theta=PI/2, x');
    assertClose(bubbleEdgePoint(o, Math.PI / 2).y, 50, 'theta=PI/2, y');
  });

  test('forme rect : intersection rayon/rectangle', () => {
    const oRect = { ...o, bulleShape: 'rect' };
    assertClose(bubbleEdgePoint(oRect, 0).x, 100, 'theta=0, x');
    assertClose(bubbleEdgePoint(oRect, 0).y, 25, 'theta=0, y');
    assertClose(bubbleEdgePoint(oRect, Math.PI / 4).x, 75, 'theta=PI/4, x');
    assertClose(bubbleEdgePoint(oRect, Math.PI / 4).y, 50, 'theta=PI/4, y');
  });
});

describe('getBubbleTailTip : pointe de la queue de Bulle', () => {
  test('valeurs par défaut (BUBBLE_TAIL_ANGLE_DEFAULT / BUBBLE_TAIL_LEN_DEFAULT)', () => {
    const tip = getBubbleTailTip({ x: 0, y: 0, w: 100, h: 50 });
    assertClose(tip.x, 30.01970710522281, 'x (angle/longueur par défaut)');
    assertClose(tip.y, 59.846226107854626, 'y (angle/longueur par défaut)');
  });

  test('angle/longueur explicites : tip = centre + (edge - centre) * (1 + tailLen)', () => {
    const tip = getBubbleTailTip({ x: 0, y: 0, w: 100, h: 50, tailAngle: 0, tailLen: 1 });
    assertClose(tip.x, 150, 'edge=(100,25), cx=50 → tip.x = 50+(100-50)*2 = 150');
    assertClose(tip.y, 25, 'edge.y=cy=25 → inchangé');
  });
});

// ── distToSegmentSq : distance point/segment (au carré) ─────────────────────────────────────
describe('distToSegmentSq : distance au carré d\'un point à un segment', () => {
  test('point projeté sur le segment : distance nulle', () => {
    assertClose(distToSegmentSq(3, 0, 0, 0, 4, 0), 0);
  });

  test('point au-delà de l\'extrémité B : clampé à B', () => {
    assertClose(distToSegmentSq(5, 0, 0, 0, 4, 0), 1);
  });

  test('segment dégénéré (A === B) : distance au point A', () => {
    assertClose(distToSegmentSq(0, 3, 0, 0, 0, 0), 9);
  });
});

// ── wrapTextLines : retour à la ligne du texte de Bulle ──────────────────────────────────────
// ⚠️ SA JUMELLE `wrapText` A ÉTÉ RETIRÉE (#402d), avec le test qui la suivait : elle DESSINAIT les
// lignes, celle-ci les MESURE, et seule la seconde avait des appelants.
describe('wrapTextLines : découpage du texte en lignes selon une largeur max', () => {
  // Utilise le vrai faux contexte 2D du dom-stub (measureText : width = nbCaractères * 6px), via un
  // canvas factice de document.createElement, un simple objet littéral n'a pas de measureText.
  function makeCtx() {
    return document.createElement('canvas').getContext('2d');
  }

  test('wrapTextLines : coupe le texte en lignes qui tiennent dans maxWidth (mesure factice 6px/caractère)', () => {
    const lines = wrapTextLines(makeCtx(), 'Bonjour le monde', 50);
    assert.deepEqual(lines, ['Bonjour', 'le monde']);
  });
});

// ── Fix 34 : angles pleins, sur de VRAIS Murs produits par l'outil Construire ────────────────
// Les tests unitaires de buildWallJunctions3D travaillent sur un carré écrit à la main. Ici on
// passe par buildToolCreateWallSegment/buildToolClose, donc par les vraies coordonnées monde,
// les vrais rotY et le vrai mur de fermeture, c'est ce chemin-là que l'utilisateur emprunte.
describe('buildWallJunctions3D : angles d\'une Pièce réellement construite (Fix 34)', () => {
  function pieceRectangulaire() {
    const panel = {
      id: 'panelJ', type: 'panel', x: 0, y: 0, w: 800, h: 600,
      pts: [{ x: 0, y: 0 }, { x: 800, y: 0 }, { x: 800, y: 600 }, { x: 0, y: 600 }],
      camRotX: 0, camRotY: 0, camDist: PANEL_CAM_DEFAULT_DIST_3D, camWx: 0, camWy: 0, camWz: 0,
    };
    const page = { objects: [panel] };
    S.buildTool = { panelId: panel.id, pieceId: 'pj', pieceLabel: 'P', points: [{ x: 0, z: 0 }], wallSegs: [], wallIds: [] };
    for (const [ax, az, bx, bz] of [[0, 0, 6, 0], [6, 0, 6, 4], [6, 4, 0, 4]]) {
      const id = buildToolCreateWallSegment(panel, page, ax, az, bx, bz);
      S.buildTool.wallIds.push(id); S.buildTool.points.push({ x: bx, z: bz });
    }
    buildToolClose(panel, page);
    return { panel, page };
  }
  const enJonctions = page => {
    const murs = page.objects.filter(isJunctionWall3D);
    return buildWallJunctions3D(murs.map(o => ({
      x: o.wxFloor, z: o.wzFloor, realLen: o.realLenFloor, rotY: o.rotY || 0,
      height: o.realHeightFloor ?? 3, color: o.color || '#888', roomFloatY: 0,
    })), w => w.height * 0.06);
  };

  test('les 4 angles sont détectés, aux 4 sommets du rectangle', () => {
    const { page } = pieceRectangulaire();
    assert.equal(page.objects.filter(o => o.objType === 'mur').length, 4, '3 murs + fermeture');
    const j = enJonctions(page);
    assert.equal(j.length, 4, `${j.length} angles détectés`);
    const coins = j.map(p => `${Math.round(p.x)},${Math.round(p.z)}`).sort();
    assert.deepEqual(coins, ['0,0', '0,4', '6,0', '6,4']);
  });

  test('RÉGRESSION : un Mur percé d\'une porte garde ses angles', () => {
    const { page } = pieceRectangulaire();
    const mur = page.objects.find(o => o.objType === 'mur');
    // Une Parois aimantée à ce Mur : c'est ce qui l'écartait de la liste des jonctions.
    page.objects.push({ id: 'porte1', type: 'objet3d', objType: 'porte_ouverte',
                        magnetWallId: mur.id, w: 30, h: 60, wallAlongFrac: 0.5, wallYFrac: 0 });
    assert.equal(enJonctions(page).length, 4, 'toujours 4 angles malgré la porte');
  });

  test('les poteaux ont l\'épaisseur et la hauteur réelles des Murs construits', () => {
    const { page } = pieceRectangulaire();
    const mur = page.objects.find(o => o.objType === 'mur');
    const h = mur.realHeightFloor ?? 3;
    for (const p of enJonctions(page)) {
      assertClose(p.height, h, 'hauteur du poteau');
      assertClose(p.thick, h * 0.06, 'épaisseur du poteau');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 85 : le repère de glisser est effectivement DESSINÉ.
//
// Par inspection de source : le contexte 2D du stub est un Proxy qui accepte tout appel en no-op
// (cf. tests/helpers/dom-stub.mjs), donc aucune assertion sur le tracé n'est possible. Ce qu'on
// vérifie est le CÂBLAGE, que la fonction de dessin soit appelée, et qu'on lui passe le repère,
// c'est-à-dire précisément ce qu'une mutation « on ne dessine plus rien » casse.
// ─────────────────────────────────────────────────────────────────────────────
describe('Fix 85 : câblage du repère de glisser', () => {
  const src = readFileSync(new URL('../src/draw.js', import.meta.url), 'utf8');
  const evt = readFileSync(new URL('../src/persona-editor.js', import.meta.url), 'utf8');

  test('l\'overlay des poignées dessine le repère qu\'on lui passe', () => {
    const i = src.indexOf('export function drawPersonaPoseHandlesOverlay(');
    assert.ok(i > 0, 'overlay introuvable');
    const corps = src.slice(i, src.indexOf('\n}', i));
    assert.match(corps, /drawPersonaDragHint\(/, 'le repère doit être tracé');
    assert.match(corps, /dragHint/, 'et provenir du paramètre, pas d\'un recalcul local');
  });

  test('RÉGRESSION : le repère est tracé APRÈS les poignées', () => {
    // Dessiné avant, il passerait sous les pastilles et deviendrait illisible au centre, là
    // précisément où il doit indiquer une direction.
    const i = src.indexOf('export function drawPersonaPoseHandlesOverlay(');
    const corps = src.slice(i, src.indexOf('\n}', i));
    assert.ok(corps.indexOf('POSE_HANDLES.forEach') < corps.indexOf('drawPersonaDragHint('),
      'l\'appel doit venir après la boucle qui dessine les poignées');
  });

  test('l\'éditeur alimente bien ce paramètre', () => {
    assert.match(evt, /drawPersonaPoseHandlesOverlay\([^)]*personaEditorDragHint\(\)/s,
      'sans cet argument, l\'overlay n\'aurait jamais rien à dessiner');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 86 : une articulation sélectionnée masque les autres, dans l'ÉDITEUR seulement.
//
// Par inspection de source : dessiner exige WebGL. Ce qu'on épingle, c'est l'endroit exact où le
// masquage opère, la carte de positions, parce que c'est de là que vient l'inertie au clic.
// ─────────────────────────────────────────────────────────────────────────────
describe('Fix 86 : masquage des poignées non sélectionnées', () => {
  const src = readFileSync(new URL('../src/draw.js', import.meta.url), 'utf8');
  const evt = readFileSync(new URL('../src/persona-editor.js', import.meta.url), 'utf8');
  const corps = (nom) => {
    const i = src.indexOf(`export function ${nom}(`);
    assert.ok(i > 0, `${nom} introuvable`);
    return sourceSansCommentaires(src.slice(i, src.indexOf('\n}', i)));
  };
  const overlay = corps('drawPersonaPoseHandlesOverlay');
  // Fix 91 : le masquage a suivi la passe de positions, qui a été extraite du dessin. C'est bien là
  // qu'il doit vivre : masquer, ici, veut dire « ne pas enregistrer de position », pas « ne pas
  // peindre », les deux effets viennent de la même ligne, et c'est tout l'intérêt.
  const passe = corps('projectPoseHandlePositions3D');

  test('RÉGRESSION : la poignée masquée voit sa position mise à NULL', () => {
    // Et non simplement « non dessinée » : c'est la carte de positions que consultent
    // pickNearestHandle3D et pickLimbSegmentAt. Se contenter de sauter le tracé laisserait une
    // poignée invisible mais toujours cliquable, le pire des deux mondes.
    assert.match(passe, /positions\[def\.id\] = null;/,
      'sans cette ligne, la poignée reste sensible au clic');
  });

  test('RÉGRESSION : `null` et non `delete`, pour ne pas garder une position périmée', () => {
    // La carte survit d'une image à l'autre. Supprimer la clé y laisserait la valeur précédente
    // si un autre chemin la réécrivait, et la poignée redeviendrait cliquable là où elle ÉTAIT.
    assert.ok(!/delete positions\[def\.id\]/.test(passe));
  });

  test('le masquage exige une sélection ET le drapeau', () => {
    // Sans sélection, tout doit rester visible : c'est ainsi qu'on choisit une articulation.
    assert.match(overlay, /const solo = !!soloActive && !!selectedId;/);
  });

  test('RÉGRESSION : seul l\'ÉDITEUR demande ce masquage', () => {
    // L'aperçu de la modale garde toutes ses poignées : on y choisit une articulation, on ne l'y
    // manipule pas au glisser. Un masquage global y rendrait la sélection impossible à changer.
    // ⚠️ On regarde l'ARGUMENT `solo`, pas la fin de l'appel. La version d'avant exigeait que
    // l'appel se termine par «, true) », vrai tant qu'il n'y avait qu'un appel et pas d'argument
    // après. L'éditeur en a désormais deux (le Personnage intégré, et un modèle importé, qui passe
    // en plus la figure sur laquelle poser les poignées), et le drapeau n'est plus le dernier. La
    // forme avait changé, l'intention non : c'est elle qu'on vérifie.
    const appelsEditeur = evt.match(/drawPersonaPoseHandlesOverlay\([^;]*\);/gs) || [];
    assert.ok(appelsEditeur.length >= 1, 'l\'éditeur doit dessiner des poignées');
    appelsEditeur.forEach(appel => {
      assert.match(appel, /personaEditorDragHint\(\),\s*true/,
        `l'éditeur doit masquer les autres poignées pendant un glisser : ${appel}`);
    });
    const mod = readFileSync(new URL('../src/modals.js', import.meta.url), 'utf8');
    (mod.match(/drawPersonaPoseHandlesOverlay\([^;]*\);/gs) || []).forEach(appel => {
      assert.ok(!/,\s*true\s*\)/.test(appel), `la modale ne doit pas masquer : ${appel}`);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 88 : la zone de prise est DESSINÉE telle qu'elle est TESTÉE.
//
// L'enjeu n'est pas le tracé (hors de portée : le contexte 2D du stub est un no-op) mais le fait
// que le dessin et le test de clic lisent les mêmes valeurs et la même géométrie. Un dessin qui
// promettrait une prise là où le clic ne mord pas serait pire que pas de dessin du tout.
// ─────────────────────────────────────────────────────────────────────────────
describe('Fix 88 : le dessin de la zone de prise ne peut pas mentir', () => {
  const src = readFileSync(new URL('../src/draw.js', import.meta.url), 'utf8');
  const corpsDe = (nom) => {
    const i = src.indexOf(`export function ${nom}(`);
    assert.ok(i > 0, `${nom} introuvable`);
    return sourceSansCommentaires(src.slice(i, src.indexOf('\n}', i)));
  };

  test('RÉGRESSION : clic et dessin partagent la MÊME source de rayons', () => {
    assert.match(corpsDe('pickPoseHandleAt'), /posePickRadii3D/);
    const overlay = corpsDe('drawPersonaPoseHandlesOverlay');
    assert.match(overlay, /posePickRadii3D\(true\)/,
      'le dessin doit lire les rayons, pas les redéclarer');
  });

  test('RÉGRESSION : le repli sur le membre reçoit AUSSI le rayon élargi', () => {
    // Sans le passer, la bande du membre resterait étroite alors qu'elle est dessinée large : le
    // tracé promettrait une prise sur toute la largeur, et le clic ne mordrait qu'au centre. C'est
    // exactement le mensonge que ce Fix cherche à rendre impossible, et il a échappé au premier
    // jet des mutations, faute d'un test sur cet argument précis.
    assert.match(corpsDe('pickPoseHandleAt'), /pickLimbSegmentAt\([^)]*r\.limb\)/,
      'le rayon du membre doit être transmis au repli');
  });

  test('RÉGRESSION : clic et dessin partagent le MÊME segment de membre', () => {
    // Deux calculs séparés du segment auraient fini par diverger, c'est la famille de bugs la
    // plus fréquente de ce dépôt.
    assert.match(corpsDe('pickLimbSegmentAt'), /personaLimbSegmentScreen3D/);
    assert.match(corpsDe('drawPersonaPoseHandlesOverlay'), /personaLimbSegmentScreen3D/);
  });

  test('RÉGRESSION : la zone est tracée AVANT les poignées', () => {
    // C'est un fond : dessinée après, elle voilerait la poignée et le repère de glisser, les deux
    // choses qu'il faut justement voir.
    const overlay = corpsDe('drawPersonaPoseHandlesOverlay');
    assert.ok(overlay.indexOf('drawPersonaPickZone(') < overlay.indexOf('points.forEach'),
      'la zone doit précéder le tracé des poignées');
    assert.ok(overlay.indexOf('drawPersonaPickZone(') < overlay.indexOf('drawPersonaDragHint('),
      'et précéder le repère de glisser');
  });

  test('la zone n\'est dessinée QUE lorsqu\'une articulation est isolée', () => {
    // Sans sélection, toutes les poignées sont prenables : dessiner une zone n'aurait aucun sens.
    assert.match(corpsDe('drawPersonaPoseHandlesOverlay'), /if \(solo && positions\[selectedId\]\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 91 : la teinte montre où l'articulation EST, pas où elle était.
//
// Signalé à l'usage : « la zone teintée supposée être la partie cliquable n'est pas bonne dans
// certains cas ; un clic dans cette zone désélectionne l'articulation ». Le fond de prise était
// peint AVANT que les positions de l'image courante ne soient calculées, il montrait donc l'état
// de l'image précédente, alors que le clic, lui, est testé contre la carte fraîche. Tant que la
// figure ne bouge pas, les deux coïncident ; pendant un glisser, elles s'écartent d'autant plus
// que le geste est rapide. D'où « dans certains cas ».
//
// La même famille que les bugs les plus coûteux de ce dépôt : une grandeur calculée deux fois,
// ici à deux INSTANTS, qui finissent par ne plus dire la même chose.
// ─────────────────────────────────────────────────────────────────────────────
describe('Fix 91 : la zone de prise lit les positions de l\'image courante', () => {
  const src = readFileSync(new URL('../src/draw.js', import.meta.url), 'utf8');
  const overlay = (() => {
    const i = src.indexOf('export function drawPersonaPoseHandlesOverlay(');
    return sourceSansCommentaires(src.slice(i, src.indexOf('\n}', i)));
  })();

  // Caméra construite à la main : personaCamera3D naît avec le renderer WebGL, hors de portée sous
  // Node, mais THREE.PerspectiveCamera, lui, se construit sans écran. C'est tout l'intérêt
  // d'avoir sorti la caméra en PARAMÈTRE de la passe de positions.
  const camera = () => {
    const c = new THREE.PerspectiveCamera(50, 4 / 3, 0.1, 100);
    c.position.set(0, 0, 5);
    c.lookAt(0, 0, 0);
    c.updateMatrixWorld(true);
    return c;
  };
  // Un rig factice : un Group par groupe d'articulation cité par POSE_HANDLES, tous à l'origine.
  const rig = () => {
    const joints = {};
    POSE_HANDLES.forEach(def => {
      if (joints[def.group]) return;
      const g = new THREE.Group();
      g.updateMatrixWorld(true);
      joints[def.group] = g;
    });
    return { joints };
  };

  test('RÉGRESSION : les positions sont calculées AVANT que la zone ne soit tracée', () => {
    // Le défaut tenait entièrement dans cet ordre. Inverser les deux lignes reproduit le bug à
    // l'identique, et aucun autre test ne s'en apercevrait : le contexte 2D du stub est un no-op,
    // le tracé lui-même est donc invérifiable. L'ordre, lui, se lit.
    const passe = overlay.indexOf('projectPoseHandlePositions3D(');
    const zone = overlay.indexOf('drawPersonaPickZone(');
    assert.ok(passe > 0, 'la passe de positions doit être appelée par l\'overlay');
    assert.ok(zone > 0, 'la zone de prise doit être tracée par l\'overlay');
    assert.ok(passe < zone,
      'la teinte montrerait la position de l\'image précédente, pas celle du clic');
  });

  test('RÉGRESSION : plus aucune projection de poignée hors de la passe', () => {
    // Une seconde projection dans le corps du dessin recréerait immédiatement deux vérités
    // concurrentes, le défaut qu'on vient de supprimer, par une autre porte.
    assert.ok(!/projectJointToCanvas\(/.test(overlay),
      'la projection appartient à projectPoseHandlePositions3D, et à elle seule');
  });

  test('la carte remplie coïncide exactement avec la projection directe', () => {
    const cam = camera();
    const entry = rig();
    entry.joints[POSE_HANDLES[0].group].position.set(0.4, 0.2, 0);
    entry.joints[POSE_HANDLES[0].group].updateMatrixWorld(true);
    const positions = {};
    const points = projectPoseHandlePositions3D(entry, cam, 800, 600, null, false, positions);
    assert.ok(points.length >= POSE_HANDLES.length - 2, 'toutes les poignées visibles sont rendues');
    points.forEach(({ def, pt }) => {
      const attendu = projectJointToCanvas(entry.joints[def.group], cam, 800, 600);
      assert.equal(positions[def.id], pt, `${def.id} : la carte et la liste divergent`);
      // `tip` (Fix 92) s'ajoute à la position : on compare le point lui-même.
      assert.deepEqual({ x: pt.x, y: pt.y }, attendu, `${def.id} : projection inattendue`);
    });
  });

  test('RÉGRESSION : bouger l\'articulation déplace la position DÈS l\'appel suivant', () => {
    // C'est la propriété qui manquait : entre deux images, l'articulation a bougé, c'est même la
    // raison du redessin. Une carte mise à jour après coup laissait la teinte en retard.
    const cam = camera();
    const entry = rig();
    const def = POSE_HANDLES[0];
    const positions = {};
    projectPoseHandlePositions3D(entry, cam, 800, 600, null, false, positions);
    const avant = { x: positions[def.id].x, y: positions[def.id].y };
    entry.joints[def.group].position.set(0.9, 0.6, 0);
    entry.joints[def.group].updateMatrixWorld(true);
    projectPoseHandlePositions3D(entry, cam, 800, 600, null, false, positions);
    const apres = { x: positions[def.id].x, y: positions[def.id].y };
    assert.notDeepEqual(apres, avant, 'la carte doit suivre le mouvement');
    assert.deepEqual(apres, projectJointToCanvas(entry.joints[def.group], cam, 800, 600));
  });

  test('en mode isolé, seule la poignée choisie garde une position', () => {
    const cam = camera();
    const entry = rig();
    const choisi = POSE_HANDLES[2].id;
    const positions = {};
    const points = projectPoseHandlePositions3D(entry, cam, 800, 600, choisi, true, positions);
    assert.deepEqual(points.map(p => p.def.id), [choisi], 'une seule poignée dessinée');
    POSE_HANDLES.forEach(d => {
      if (d.id === choisi) assert.ok(positions[d.id], 'la poignée choisie garde sa position');
      else assert.equal(positions[d.id], null, `${d.id} doit être inerte`);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 92 : la bande du membre ne se recalcule plus au moment du clic.
//
// Signalé à l'usage : ouvert depuis le menu de gauche la zone teintée est juste, ouvert depuis la
// modale d'un Personnage « la zone semble plus petite bien qu'elle soit affichée identique ». Le
// Personnage était pourtant rendu à la même taille, dans la même pose ; et c'est la BANDE le long
// du membre qui ratait, pas le disque autour du point.
//
// Cette asymétrie disque/bande désignait le coupable. Le disque ne lit que p1, mémorisé dans la
// carte de positions au dernier dessin. La bande, elle, lisait p1 dans la carte mais REPROJETAIT
// son autre extrémité au moment du clic, avec personaCamera3D, une caméra partagée par l'aperçu
// de la modale, l'éditeur et le rendu des Cases. Qu'une autre figure soit rendue entre le tracé et
// le clic, et la bande testée partait ailleurs que la bande peinte, en restant ancrée au bon
// endroit côté articulation. Mesuré sur la figure debout : 144 px d'écart au bout, pour une bande
// de 24 px de demi-largeur.
//
// Le segment est désormais entièrement lu dans la carte, et le paramètre `canvas` a disparu des
// trois fonctions de sélection : sans lui, reprojeter tardivement n'est plus seulement déconseillé,
// c'est impossible.
// ─────────────────────────────────────────────────────────────────────────────
describe('Fix 92 : le segment du membre est mémorisé, jamais reprojeté', () => {
  const src = readFileSync(new URL('../src/draw.js', import.meta.url), 'utf8');
  const corps = (nom) => {
    const i = src.indexOf(`export function ${nom}(`);
    assert.ok(i > 0, `${nom} introuvable`);
    return sourceSansCommentaires(src.slice(i, src.indexOf('\n}', i)));
  };
  const camera = (z = 5) => {
    const c = new THREE.PerspectiveCamera(50, 4 / 3, 0.1, 100);
    c.position.set(0, 0, z);
    c.lookAt(0, 0, 0);
    c.updateMatrixWorld(true);
    return c;
  };
  // Un rig factice dont les groupes portent les noms attendus par POSE_HANDLES.
  const rig = () => {
    const joints = {};
    POSE_HANDLES.forEach(def => {
      if (joints[def.group]) return;
      const g = new THREE.Group();
      g.position.set(0.1, 0.2, 0);
      g.updateMatrixWorld(true);
      joints[def.group] = g;
    });
    return { joints };
  };

  test('la passe de positions range AUSSI le bout du membre', () => {
    const positions = {};
    projectPoseHandlePositions3D(rig(), camera(), 800, 600, null, false, positions);
    // lShoulder pointe vers lElbow (toGroup), lKnee vers un décalage local (toLocal) : les deux
    // formes de LIMB_SEGMENTS doivent être couvertes, sans quoi une moitié des membres resterait
    // muette au clic.
    assert.ok(positions.lShoulder.tip, 'segment vers une autre articulation (toGroup)');
    assert.ok(positions.lKnee.tip, 'segment vers un décalage local (toLocal)');
  });

  test('RÉGRESSION : changer la caméra APRÈS le dessin ne déplace pas la bande', () => {
    // Le cœur du défaut. Avant correction, p2 était reprojeté ici et le segment se disloquait.
    const entry = rig();
    const positions = {};
    projectPoseHandlePositions3D(entry, camera(5), 800, 600, 'lShoulder', true, positions);
    const avant = personaLimbSegmentScreen3D('lShoulder', positions);
    assert.ok(avant, 'segment présent après le dessin');

    // Une autre figure est rendue entre-temps : la caméra PARTAGÉE est recadrée ailleurs.
    // Le segment, lui, ne doit pas bouger d'un pixel, il décrit l'image qu'on a peinte.
    camera(1.5);
    const apres = personaLimbSegmentScreen3D('lShoulder', positions);
    assert.deepEqual(apres.p1, avant.p1, 'le départ ne bouge pas');
    assert.deepEqual(apres.p2, avant.p2, 'le bout ne doit pas bouger non plus');
  });

  test('RÉGRESSION : plus aucune projection dans les fonctions de sélection', () => {
    // La garde structurelle : sans projection ni caméra dans ces corps, la divergence est
    // impossible à réintroduire par inadvertance.
    ['personaLimbSegmentScreen3D', 'pickLimbSegmentAt', 'pickPoseHandleAt'].forEach(nom => {
      const c = corps(nom);
      assert.ok(!/project[A-Za-z]*ToCanvas\(/.test(c), `${nom} ne doit plus projeter`);
      assert.ok(!/personaCamera3D/.test(c), `${nom} ne doit plus lire la caméra partagée`);
    });
  });

  test('RÉGRESSION : le paramètre `canvas` a bien disparu des trois signatures', () => {
    // Il n'existait que pour permettre la reprojection tardive. Le laisser en place inviterait à
    // la refaire ; les tests ci-dessus ne verraient rien tant que personne ne s'en sert.
    // `chaines` s'ajoute en #392d : une créature n'a pas de LIMB_SEGMENTS, son membre se lit dans
    // sa chaîne. Comme `defs` plus bas, c'est une liste de descripteurs, pas un canevas, et le
    // test du dessus vérifie déjà que le CORPS de la fonction ne projette rien.
    assert.match(src, /export function personaLimbSegmentScreen3D\(handleId, positions, chaines\)/);
    assert.match(src, /export function pickLimbSegmentAt\(px, py, positions, radius/);
    // `defs` s'ajoute en #392b, et il ne rouvre PAS la porte que ce test ferme : c'est une liste de
    // descripteurs, pas un canevas, et rien dans le corps ne projette quoi que ce soit — ce que le
    // test juste au-dessus vérifie, lui, sur le CORPS de la fonction.
    assert.match(src, /export function pickPoseHandleAt\(px, py, positions, radii, defs\)/);
  });

  test('un bout non mémorisé rend le membre inerte, pas approximatif', () => {
    // Même règle que les poignées masquées : on n'accepte pas un clic sur une bande qu'on n'a pas
    // dessinée. Mieux vaut un membre qui ne répond pas qu'un membre qui répond ailleurs.
    assert.equal(personaLimbSegmentScreen3D('lShoulder', { lShoulder: { x: 10, y: 10 } }), null);
    assert.equal(personaLimbSegmentScreen3D('lShoulder', {}), null);
  });
});

// ── #403b : l'image d'une Case, recadrée, centrée, découpée ───────────────────────────────────
describe('cadreDeRecouvrement3D : couvrir la Case sans déformer l\'image', () => {
  // La seule part VÉRIFIABLE de ce chantier sous Node : le reste est du dessin, hors de portée
  // (cf. docs/en/testing-method.md). Elle est aussi celle où une erreur ne se voit pas tout de
  // suite — une image légèrement étirée passe inaperçue jusqu'à ce qu'on y mette un visage.

  test('même proportion que la Case : rien n\'est rogné', () => {
    const r = cadreDeRecouvrement3D(400, 300, 800, 600);
    assert.deepEqual(r, { sx: 0, sy: 0, sw: 800, sh: 600 });
  });

  test('image trop LARGE : on rogne à gauche et à droite, à parts égales', () => {
    // 1000×500 dans une Case carrée : on garde un carré de 500 centré, donc 250 de chaque côté.
    const r = cadreDeRecouvrement3D(300, 300, 1000, 500);
    assert.deepEqual(r, { sx: 250, sy: 0, sw: 500, sh: 500 });
  });

  test('image trop HAUTE : on rogne en haut et en bas, à parts égales', () => {
    const r = cadreDeRecouvrement3D(300, 300, 500, 1000);
    assert.deepEqual(r, { sx: 0, sy: 250, sw: 500, sh: 500 });
  });

  test('le rapport du cadre prélevé est TOUJOURS celui de la Case', () => {
    // ⚠️ C'EST LA PROPRIÉTÉ QUI COMPTE, et elle vaut mieux que trois exemples : si le rapport
    // dérive, l'image est étirée. Une inversion de largeur et de hauteur, la faute la plus facile à
    // écrire ici, la casse immédiatement.
    [[400, 300], [300, 400], [1000, 100], [37, 91]].forEach(([cw, ch]) => {
      [[800, 600], [500, 1000], [123, 77], [2000, 2000]].forEach(([iw, ih]) => {
        const r = cadreDeRecouvrement3D(cw, ch, iw, ih);
        assert.ok(r, `${cw}x${ch} sur ${iw}x${ih}`);
        assert.ok(Math.abs((r.sw / r.sh) - (cw / ch)) < 1e-9,
          `${cw}x${ch} sur ${iw}x${ih} : rapport ${(r.sw / r.sh).toFixed(4)} au lieu de ${(cw / ch).toFixed(4)}`);
      });
    });
  });

  test('le cadre prélevé reste DANS l\'image, et centré', () => {
    // Sortir de l'image donnerait des bords transparents ou une exception selon le moteur, pour une
    // faute qui ne se voit qu'aux extrêmes.
    [[400, 300], [1000, 100], [37, 91]].forEach(([cw, ch]) => {
      [[800, 600], [500, 1000], [123, 77]].forEach(([iw, ih]) => {
        const r = cadreDeRecouvrement3D(cw, ch, iw, ih);
        assert.ok(r.sx >= 0 && r.sy >= 0, 'le cadre commence hors de l\'image');
        assert.ok(r.sx + r.sw <= iw + 1e-9 && r.sy + r.sh <= ih + 1e-9,
          'le cadre dépasse de l\'image');
        assert.ok(Math.abs(r.sx - (iw - r.sw) / 2) < 1e-9, 'décentré horizontalement');
        assert.ok(Math.abs(r.sy - (ih - r.sh) / 2) < 1e-9, 'décentré verticalement');
      });
    });
  });

  test('L\'ANCRAGE décide de ce qui est rogné, et son absence vaut centré (#403e)', () => {
    // 1000×500 dans une Case carrée : 500 de jeu horizontal, rien de vertical.
    assert.equal(cadreDeRecouvrement3D(300, 300, 1000, 500, { x: 0, y: 0.5 }).sx, 0);
    assert.equal(cadreDeRecouvrement3D(300, 300, 1000, 500, { x: 1, y: 0.5 }).sx, 500);
    assert.equal(cadreDeRecouvrement3D(300, 300, 1000, 500, { x: 0.5, y: 0.5 }).sx, 250);
    // ⚠️ LA COMPATIBILITÉ ASCENDANTE EST ICI, et elle vaut pour tous les Projets d'avant #403e :
    // sans quatrième argument, la fonction fait exactement ce qu'elle faisait.
    assert.deepEqual(cadreDeRecouvrement3D(300, 300, 1000, 500),
      cadreDeRecouvrement3D(300, 300, 1000, 500, { x: 0.5, y: 0.5 }));
  });

  test('RÉGRESSION : un ancrage hors bornes ne fait pas SORTIR le cadre de l\'image', () => {
    // C'est LA garantie « pas de bande blanche ». Elle tient au bornage, et le bornage est dans
    // `ancrageValide3D`, en amont : un appelant qui passerait 3 ou -1 (fichier édité à la main,
    // version future, calcul fautif) doit être ramené, pas cru sur parole.
    [-1, 0, 0.5, 1, 3, NaN, undefined, 'gauche'].forEach(v => {
      const r = cadreDeRecouvrement3D(300, 300, 1000, 500, { x: v, y: v });
      assert.ok(r.sx >= 0 && r.sx + r.sw <= 1000 + 1e-9, `x=${v} sort de l'image`);
      assert.ok(r.sy >= 0 && r.sy + r.sh <= 500 + 1e-9, `y=${v} sort de l'image`);
    });
  });

  test('ZOOMER, C\'EST PRÉLEVER MOINS (#403f)', () => {
    // 1000×500 dans une Case carrée : le cadre couvrant est un carré de 500. À 2×, on ne prélève
    // plus qu'un carré de 250, peint sur la même surface, donc agrandi deux fois.
    const un = cadreDeRecouvrement3D(300, 300, 1000, 500, null, 1);
    const deux = cadreDeRecouvrement3D(300, 300, 1000, 500, null, 2);
    assert.equal(deux.sw, un.sw / 2);
    assert.equal(deux.sh, un.sh / 2);
    // Le rapport reste celui de la Case : zoomer ne déforme pas.
    assert.ok(Math.abs((deux.sw / deux.sh) - 1) < 1e-9);
    // Sans zoom, la fonction fait ce qu'elle faisait : tous les Projets d'avant #403f sont intacts.
    assert.deepEqual(cadreDeRecouvrement3D(300, 300, 1000, 500),
      cadreDeRecouvrement3D(300, 300, 1000, 500, null, 1));
  });

  test('LE ZOOM DÉBLOQUE LE SECOND AXE, et c\'est son vrai rôle', () => {
    // ⚠️ C'EST LA PROPRIÉTÉ QUI LIE LES DEUX FONCTIONNALITÉS. À 1×, la dimension qui tombe juste n'a
    // AUCUN jeu : l'image ne se déplace que dans un sens, ce qui surprend. Dès qu'on zoome, les deux
    // axes en gagnent, et le déplacement devient libre. Le zoom n'est pas un ornement à côté du
    // recadrage, c'est ce qui le rend complet.
    const un = cadreDeRecouvrement3D(300, 300, 1000, 500, null, 1);
    assert.equal(500 - un.sh, 0, 'à 1x, l\'axe qui tombe juste doit être sans jeu');
    const deux = cadreDeRecouvrement3D(300, 300, 1000, 500, null, 2);
    assert.ok(500 - deux.sh > 0, 'zoomer doit donner du jeu à l\'axe qui n\'en avait pas');
  });

  test('le cadre prélevé reste DANS l\'image à tous les zooms et tous les ancrages', () => {
    // La garantie « pas de bande blanche » doit tenir sur les deux réglages À LA FOIS : c'est leur
    // combinaison qui est nouvelle, et chacun pris seul ne la démontre pas.
    [1, 1.5, 2, 4].forEach(z => {
      [0, 0.5, 1].forEach(a => {
        [[400, 300], [300, 400], [37, 91]].forEach(([cw, ch]) => {
          const r = cadreDeRecouvrement3D(cw, ch, 800, 600, { x: a, y: a }, z);
          assert.ok(r.sx >= -1e-9 && r.sx + r.sw <= 800 + 1e-9, `zoom ${z}, ancrage ${a} : sort en X`);
          assert.ok(r.sy >= -1e-9 && r.sy + r.sh <= 600 + 1e-9, `zoom ${z}, ancrage ${a} : sort en Y`);
        });
      });
    });
  });

  test('une dimension nulle ou absurde ne donne pas un NaN qui traverse le dessin', () => {
    // Une Case de largeur zéro arrive PENDANT un redimensionnement à la souris : c'est un état
    // transitoire normal, pas une donnée corrompue. Diviser par elle produirait un NaN qui se
    // propagerait dans drawImage sans erreur, et la Case resterait vide sans qu'on sache pourquoi.
    [[0, 300, 800, 600], [400, 0, 800, 600], [400, 300, 0, 600], [400, 300, 800, 0],
      [-400, 300, 800, 600], [400, 300, NaN, 600], [400, 300, 800, undefined]]
      .forEach(args => assert.equal(cadreDeRecouvrement3D(...args), null, JSON.stringify(args)));
  });
});

describe('#403b : ce que le chemin de dessin promet, et qu\'aucun rendu ne peut vérifier ici', () => {
  const DRAW = sourceSansCommentaires(
    readFileSync(new URL('../src/draw.js', import.meta.url), 'utf8'));

  test('une Case à image ne rend JAMAIS de 3D, même si des Éléments traînent', () => {
    // ⚠️ L'EXCLUSIVITÉ EST VÉRIFIÉE AU DESSIN, PAS SEULEMENT À L'INSERTION. L'interface interdira
    // d'ajouter un Élément à une Case qui porte une image (#403c), mais un fichier de Projet peut
    // porter les deux : édité à la main, ou écrit par une version future. Le dessin ne peut pas
    // montrer les deux, et c'est l'image qui gagne.
    const i = DRAW.indexOf('const hasElements =');
    assert.ok(i > 0, 'le calcul de hasElements a disparu');
    const ligne = DRAW.slice(i, DRAW.indexOf(';', i));
    assert.match(ligne, /!casePorteUneImage3D\(o\)/,
      'une Case à image repasse par le rendu 3D : elle montrerait les deux, ou clignoterait');
  });

  test('l\'image est découpée sur le POLYGONE de la Case, pas sur son rectangle', () => {
    // `getPanelPoints` rend encore des losanges, des trapèzes et des parallélogrammes pour
    // d'anciens Projets. Découper sur la boîte englobante laisserait l'image déborder des coins,
    // là où le rendu 3D, lui, s'arrête au polygone.
    const i = DRAW.indexOf('function dessinerImageDeCase3D');
    assert.ok(i > 0, 'le dessin de l\'image a disparu');
    const corps = DRAW.slice(i, DRAW.indexOf('\n}', i));
    assert.match(corps, /c\.clip\(\)/, 'plus de découpe : l\'image déborde de la Case');
    assert.match(corps, /pts\[i\]\.x/, 'la découpe ne suit plus les points de la Case');
    assert.ok(!/fillRect|rect\(/.test(corps), 'la découpe est redevenue un rectangle');
  });

  test('le fond reste SOUS l\'image, la bordure PAR-DESSUS', () => {
    // L'ordre est la décision : le fond donne quelque chose à voir tant que l'image n'est pas
    // décodée, et la bordure passe au-dessus, comme sur une Case en 3D.
    const i = DRAW.indexOf("case 'panel': {");
    const corps = DRAW.slice(i, DRAW.indexOf('break;', i));
    const fond = corps.indexOf("c.fillStyle = '#fff'");
    const image = corps.indexOf('casePorteUneImage3D(o)');
    const bordure = corps.indexOf('borderVisible');
    assert.ok(fond >= 0 && image > fond && bordure > image,
      `ordre attendu fond → image → bordure, obtenu ${fond}, ${image}, ${bordure}`);
  });

  test('une image absente est SIGNALÉE, et « pas encore là » ne se dit pas comme « perdue »', () => {
    // Confondre les deux ferait passer une ouverture de Projet normale pour une panne : au premier
    // affichage, TOUTES les images sont encore en cours de décodage.
    const i = DRAW.indexOf('function dessinerAbsenceDImage3D');
    assert.ok(i > 0, 'le signalement a disparu : une Case sans image ne dirait plus rien');
    const corps = DRAW.slice(i, DRAW.indexOf('\n}', i));
    assert.match(corps, /introuvable/, 'l\'état « introuvable » n\'est plus distingué');
    assert.match(corps, /Chargement|Loading/, 'l\'attente n\'est plus distinguée de l\'absence');
  });

  test('RÉGRESSION : le dessin ne lit JAMAIS le disque', () => {
    // Le chemin de dessin est synchrone et parcouru à chaque image. Une lecture disque au milieu
    // le bloquerait, et une lecture par image sur un fichier manquant recommencerait à l'infini —
    // c'est la raison d'être de l'état « introuvable » du cache.
    assert.ok(!/readImage\(/.test(DRAW), 'draw.js lit le disque : le cache est court-circuité');
    assert.ok(!/await/.test(DRAW.slice(DRAW.indexOf('function dessinerImageDeCase3D'),
      DRAW.indexOf('export function drawObject'))), 'une attente s\'est glissée dans le dessin');
  });
});

describe('ancrageApresGlissement3D : toute l\'arithmétique du recadrage (#403e)', () => {
  // Le montage de référence : une image de 1000×500 dans une Case de 300×300. Le cadre prélevé est
  // un carré de 500, donc 500 pixels d'image de jeu horizontal, et RIEN de vertical.
  const CADRE = cadreDeRecouvrement3D(300, 300, 1000, 500, { x: 0.5, y: 0.5 });
  const IMAGE = { w: 1000, h: 500 };
  const glisser = (ancrage, dx, dy) =>
    ancrageApresGlissement3D(ancrage, { x: dx, y: dy }, CADRE, IMAGE, 300, 300);

  test('tirer vers la DROITE montre ce qui était à gauche', () => {
    // ⚠️ LE SIGNE EST LE PIÈGE DE CETTE FONCTION. On déplace la FENÊTRE de prélèvement, pas
    // l'image : tirer l'image vers la droite revient à prélever plus à gauche, donc l'ancrage
    // DIMINUE. Écrit à l'envers, le recadrage part dans la direction opposée au geste, ce qui est
    // désorientant sans jamais planter.
    assert.ok(glisser({ x: 0.5, y: 0.5 }, 60, 0).x < 0.5);
    assert.ok(glisser({ x: 0.5, y: 0.5 }, -60, 0).x > 0.5);
  });

  test('l\'échelle est celle de l\'IMAGE, pas celle de l\'écran', () => {
    // 60 unités de Planche sur une Case de 300 valent un cinquième du cadre prélevé, soit 100
    // pixels d'image, sur 500 de jeu : un cinquième du jeu, donc 0,2 d'ancrage.
    assert.ok(Math.abs(glisser({ x: 0.5, y: 0.5 }, 60, 0).x - 0.3) < 1e-9);
    // Sans le facteur sw/caseW, le même glisser bougerait autant une vignette qu'une photo de six
    // mille pixels : la sensibilité changerait avec la définition du fichier.
    const grande = cadreDeRecouvrement3D(300, 300, 6000, 3000, { x: 0.5, y: 0.5 });
    const a = ancrageApresGlissement3D({ x: 0.5, y: 0.5 }, { x: 60, y: 0 }, grande,
      { w: 6000, h: 3000 }, 300, 300);
    assert.ok(Math.abs(a.x - 0.3) < 1e-9, 'la sensibilité dépend de la définition du fichier');
  });

  test('RÉGRESSION : l\'axe SANS JEU ne bouge pas, et ne rend pas NaN', () => {
    // C'est le cas NORMAL, pas un cas limite : à 1×, une des deux dimensions tombe toujours juste.
    // La division par un jeu nul donnerait un NaN, que `drawImage` avale en silence — l'image
    // disparaîtrait sans erreur, et le seul symptôme serait une Case vide.
    // ⚠️ LE DÉPART N'EST PAS 0,5, ET C'EST TOUT L'INTÉRÊT DE CE TEST. Ma première version partait du
    // centre, et laissait donc passer la suppression de la garde `jeuY > 0` : sans elle le calcul
    // rend NaN, `ancrageValide3D` ramène NaN au CENTRE, et 0,5 valait justement le départ. Le test
    // se vérifiait lui-même. Avec 0,2, les deux réponses divergent : la garde CONSERVE l'ancrage,
    // le repli le RECENTRE, et un axe qui saute au centre dès qu'on effleure l'autre se voit.
    const r = glisser({ x: 0.5, y: 0.2 }, 0, 80);
    assert.equal(r.y, 0.2, 'l\'axe sans jeu a bougé, ou a été recentré par le repli');
    assert.ok(Number.isFinite(r.y));
  });

  test('RÉGRESSION : on ne peut pas tirer l\'image au-delà de son bord', () => {
    // Le bornage EST la garantie « pas de bande blanche ». Un glisser démesuré doit s\'arrêter au
    // bord, pas continuer.
    assert.equal(glisser({ x: 0.5, y: 0.5 }, 100000, 0).x, 0);
    assert.equal(glisser({ x: 0.5, y: 0.5 }, -100000, 0).x, 1);
  });

  test('le point de départ est l\'ancrage DU DÉBUT du glisser', () => {
    // L\'appelant relit `S.dragOrig.ancrage` à chaque mousemove au lieu de cumuler des
    // incréments : cumulés, les arrondis dérivent, et revenir au point de départ ne rend pas le
    // cadrage de départ. Ici, la propriété se vérifie directement.
    const aller = glisser({ x: 0.5, y: 0.5 }, 60, 0);
    const retour = glisser({ x: 0.5, y: 0.5 }, 0, 0);
    assert.equal(retour.x, 0.5, 'un glisser nul doit rendre exactement l\'ancrage de départ');
    assert.notEqual(aller.x, retour.x);
  });

  test('une entrée absurde rend l\'ancrage de départ, jamais un NaN', () => {
    const depart = { x: 0.25, y: 0.75 };
    [[depart, null, CADRE, IMAGE, 300, 300], [depart, { x: 1, y: 1 }, null, IMAGE, 300, 300],
      [depart, { x: 1, y: 1 }, CADRE, null, 300, 300], [depart, { x: 1, y: 1 }, CADRE, IMAGE, 0, 300],
      [depart, { x: 1, y: 1 }, CADRE, IMAGE, 300, NaN]]
      .forEach(args => assert.deepEqual(ancrageApresGlissement3D(...args), depart, JSON.stringify(args.slice(1))));
    // Et un ancrage de départ illisible retombe au centre plutôt que de propager sa valeur.
    assert.deepEqual(ancrageApresGlissement3D(null, { x: 0, y: 0 }, CADRE, IMAGE, 300, 300),
      { x: 0.5, y: 0.5 });
  });
});

// Source d'events.js lue UNE fois pour les deux blocs qui suivent (#403e et #403f/#403j) : ils
// parlent du même câblage, et deux instantanés du même fichier finiraient par être lus comme deux
// choses différentes.
const EVENTS_CABLAGE = sourceSansCommentaires(
  readFileSync(new URL('../src/events.js', import.meta.url), 'utf8'));

/**
 * Le corps du `mousemove` de recadrage, sans son marqueur d'entrée.
 *
 * ⚠️ ÉCHAPPÉE W7 : ma première version tranchait `slice(0, indexOf('} else if'))` sur une chaîne
 * qui COMMENÇAIT par ce marqueur. L'index valait donc 0, le bloc était VIDE, et l'assertion
 * « aucun snapshot ici » était vraie de rien du tout. Une assertion qui porte sur une chaîne vide
 * ne peut pas échouer, et c'est le seul cas où ce fichier s'est menti à lui-même.
 */
const corpsDuMousemove = () => {
  const marqueur = "} else if (S.dragMode === 'imageAnchor')";
  const i = EVENTS_CABLAGE.indexOf(marqueur);
  assert.ok(i > 0, 'le mousemove de recadrage a disparu');
  const apres = EVENTS_CABLAGE.slice(i + marqueur.length);
  const fin = apres.indexOf('} else if (S.dragMode ===');
  assert.ok(fin > 0, 'le bloc du mousemove ne se referme pas là où on le croit');
  const corps = apres.slice(0, fin);
  assert.ok(corps.includes('ancrageApresGlissement3D'), 'le bloc lu n\'est pas celui du recadrage');
  return corps;
};

/**
 * JOURNAL DE MUTATION #403e : vingt-trois fautes, six échappées, deux assumées.
 *
 *   W1  signe du glissement inversé                                            ROUGE
 *   W2  facteur d'échelle de l'image oublié                                    ROUGE
 *   W3  axe sans jeu non protégé (NaN)                                     ÉCHAPPÉE
 *   W4  l'ancrage ignoré par le cadrage                                        ROUGE
 *   W5  bornage à [0, 1] retiré                                                ROUGE
 *   W6  `null` pris pour un ancrage à gauche                                   ROUGE
 *   W7  un instantané à chaque mousemove                                   ÉCHAPPÉE
 *   W8  le glisser cumule au lieu de repartir du départ                        ROUGE
 *   W9  Échap ne sort plus du mode                                             ROUGE
 *   W10 le clic extérieur ne sort plus                                         ROUGE
 *   W11 la branche de recadrage débranchée (`null`)                        ÉCHAPPÉE
 *   W12 détacher l'image laisse le mode actif                                  ROUGE
 *   W13 le mode survit au changement de Projet                                 ROUGE
 *   W14 la marque du mode part à l'export                                      ROUGE
 *   W15 le curseur ne dit plus le mode                                         ROUGE
 *   W16 les deux entrées ne font pas le même geste                             ROUGE
 *   W17 on entre dans le mode sur une Case SANS image             ÉCHAPPÉE, ASSUMÉE
 *   W18 seul l'axe X est écrit                                             ÉCHAPPÉE
 *   W19 le Projet n'est pas marqué modifié                                 ÉCHAPPÉE
 *   W20 le cadre du glisser ignore l'ancrage de départ            ÉCHAPPÉE, CODE CORRIGÉ
 *   W21 relâcher le bouton sort du mode                                    ÉCHAPPÉE
 *   W22 sortir ne tue pas le glisser en cours                     ÉCHAPPÉE, ASSUMÉE
 *   W23 l'entrée du menu toujours visible                                      ROUGE
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * CE QUE CETTE CAMPAGNE A APPRIS, ET QUI NE SE RÉSUME PAS À « J'AI AJOUTÉ DES TESTS »
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * W20 A CORRIGÉ LE CODE, PAS LE TEST, et c'est la plus instructive. Je passais l'ancrage de départ à
 * `cadreDeRecouvrement3D` dans le mousemove, avec un commentaire qui expliquait pourquoi c'était
 * nécessaire. Le retirer n'a rien cassé : seuls `sw` et `sh` sont lus ensuite, et ils ne dépendent
 * que des proportions. L'argument ne servait à rien, et mon commentaire le défendait quand même. Une
 * mutation ne dit pas seulement « ce test manque » ; elle dit parfois « cette ligne ne fait rien, et
 * tu as écrit trois phrases pour la justifier ».
 *
 * W3 ET W7 ÉTAIENT DES TESTS QUI SE MENTAIENT. W3 partait d'un ancrage de 0,5, exactement la valeur
 * vers laquelle le repli ramène un NaN : le test ne pouvait pas distinguer la garde de son absence.
 * W7 tranchait une chaîne au niveau de son propre marqueur, donc examinait une chaîne VIDE, et une
 * assertion « ceci n'apparaît pas ici » est toujours vraie de rien.
 *
 * W11 EST LA TROISIÈME DE SA FAMILLE DANS CE DÉPÔT (après #403c et #403d) : vérifier qu'un
 * identifiant APPARAÎT ne dit pas qu'il GOUVERNE. Le remède est le même à chaque fois, épingler la
 * liaison plutôt que la présence.
 *
 * DEUX ÉCHAPPÉES RESTENT, ET ELLES SONT ÉCRITES ICI PLUTÔT QUE MASQUÉES :
 *
 *   W17, entrer dans le mode sur une Case sans image. La garde est vraie et utile — sans elle, une
 *   bordure pointillée s'affiche sur une Case qui n'a rien à recadrer — mais son seul appelant est
 *   l'interface, et la fonction n'est pas exportée. La rendre testable demanderait d'ouvrir un
 *   accès qui n'existe que pour le test, ce qui coûte plus que ce défaut ne vaut.
 *
 *   W22, le glisser non tué en sortant du mode. Vérifié : elle ne corrige AUCUN défaut observable,
 *   le mousemove redemandant le mode à chaque passage. Elle est gardée pour la cohérence de l'état,
 *   et le code le dit désormais franchement au lieu de prétendre l'inverse.
 */
describe('#403e : le mode de recadrage, et ce que le câblage promet', () => {
  const EVENTS = sourceSansCommentaires(
    readFileSync(new URL('../src/events.js', import.meta.url), 'utf8'));
  const DRAW_NU = sourceSansCommentaires(
    readFileSync(new URL('../src/draw.js', import.meta.url), 'utf8'));
  const IO = sourceSansCommentaires(
    readFileSync(new URL('../src/io.js', import.meta.url), 'utf8'));
  const HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

  /**
   * Le bloc `mousedown` DU MODE, et pas celui du clic droit.
   *
   * ⚠️ L'ANCRE A DÛ CHANGER AVEC #403j. Elle valait `S.dragMode = 'imageAnchor'`, qui désignait
   * alors un seul endroit ; le recadrage au clic droit en a créé un second, PLUS HAUT dans le
   * fichier, et la fenêtre est allée se poser dessus. Trois tests se sont mis à parler d'un bloc
   * qu'ils ne lisaient plus. L'ancre est donc désormais ce qui n'existe qu'ici : la cible tirée de
   * `enCadrage`, c'est-à-dire du mode.
   */
  const blocSouris = () => {
    const j = EVENTS.indexOf('panelId: enCadrage.id');
    assert.ok(j > 0, 'le glisser de recadrage du MODE n\'est branché nulle part');
    const debut = EVENTS.lastIndexOf('const enCadrage = _caseEnDeplacementDImage();', j);
    assert.ok(debut > 0 && debut < j, 'le bloc du mode ne commence pas là où on le croit');
    return EVENTS.slice(debut, j + 700);
  };

  test('les deux entrées existent, et le menu contextuel les montre ensemble', () => {
    ['ctxMoveImage', 'sideImageMoveBtn'].forEach(id =>
      assert.match(HTML, new RegExp(`id="${id}"`), `absent : ${id}`));
    assert.match(EVENTS, /getElementById\('ctxMoveImage'\)\.style\.display = _img\.deplacerImage/,
      'l\'entrée du menu ne suit pas la décision de entreesImageDuMenu3D');
  });

  test('RÉGRESSION : les deux entrées appellent LE MÊME geste', () => {
    // Deux chemins vers un même acte finissent par ne plus faire la même chose : c\'est la panne la
    // plus fréquente de ce dépôt, et la section Image porte déjà la même précaution pour
    // « Changer » et « Retirer ».
    assert.equal((EVENTS.match(/_entrerModeDeplacementImage\(panel\);/g) || []).length, 2);
  });

  test('RÉGRESSION : UN SEUL instantané, pris au DÉBUT du glisser', () => {
    // Un snapshot() par mousemove remplirait la pile d\'annulation de centaines d\'états, et Ctrl+Z
    // ne reculerait que de quelques pixels à la fois. Il est donc au mousedown, avec la capture de
    // l\'ancrage de départ.
    const bloc = blocSouris();
    assert.ok(bloc.indexOf('snapshot()') < bloc.indexOf("S.dragMode = 'imageAnchor'"),
      'l\'instantané n\'est pas pris avant d\'entrer dans le glisser');
    assert.ok(!/snapshot\(\)/.test(corpsDuMousemove()),
      'un instantané est pris à chaque mouvement de souris');
  });

  test('RÉGRESSION : le mousemove repart de l\'ancrage DE DÉPART', () => {
    const corps = corpsDuMousemove();
    assert.match(corps, /ancrageApresGlissement3D\(\s*S\.dragOrig\.ancrage/,
      'le glisser cumule des incréments au lieu de repartir du départ, il dérivera');
    assert.match(corps, /x - S\.dragStart\.x/);
  });

  test('RÉGRESSION : LES DEUX axes sont écrits, et le Projet est marqué modifié', () => {
    // Deux échappées de ma campagne (W18, W19), et aucune des deux ne se voit tout de suite.
    // N'écrire que X laisse le recadrage vertical sans effet : on tire, l'image ne suit pas sur un
    // axe, et rien n'indique pourquoi. Oublier `projectDirty` est pire : le travail est fait à
    // l'écran, l'application se croit à jour, et quitter le perd sans prévenir.
    const corps = corpsDuMousemove();
    assert.match(corps, /panel\[CHAMP_ANCRAGE_X_IMAGE\] = a\.x/);
    assert.match(corps, /panel\[CHAMP_ANCRAGE_Y_IMAGE\] = a\.y/);
    assert.match(corps, /S\.projectDirty = true/);
  });

  test('RÉGRESSION : la branche est GOUVERNÉE par la décision, pas seulement voisine d\'elle', () => {
    // ⚠️ ÉCHAPPÉE W11, ET C'EST LA TROISIÈME FOIS DE CETTE FAMILLE DANS CE DÉPÔT (cf. #403c, #403d).
    // Remplacer `_caseEnDeplacementDImage()` par `null` désactive TOUT le recadrage, et laissait
    // vertes des assertions qui se contentaient de retrouver `S.dragMode = 'imageAnchor'` dans le
    // fichier : le texte était toujours là, il ne s'exécutait simplement plus jamais.
    //
    // On épingle donc la LIAISON : la variable qui commande la branche vient de la fonction de
    // décision, et de rien d'autre. La limite est assumée et vaut d'être écrite : ce test lit du
    // source, il ne simule pas un clic. Ce qui le rend suffisant, c'est que la décision elle-même
    // (`_caseEnDeplacementDImage`, et sous elle `casePorteUneImage3D`) a ses propres tests.
    assert.match(blocSouris(), /const enCadrage = _caseEnDeplacementDImage\(\);/,
      'la branche de recadrage n\'est plus alimentée par la décision');
  });

  test('RÉGRESSION : le clic HORS de la Case sort du mode, celui DEDANS recadre', () => {
    const bloc = blocSouris();
    assert.match(bloc, /dedans/, 'rien ne distingue l\'intérieur de l\'extérieur de la Case');
    assert.ok(bloc.indexOf("S.dragMode = 'imageAnchor'") < bloc.indexOf('sortirModeDeplacementImage()'),
      'un clic dans la Case sortirait du mode au lieu de recadrer');
  });

  test('RÉGRESSION : le recadrage passe AVANT les poignées de la Case', () => {
    // Sinon le geste change de sens selon l\'endroit exact du clic : recadrage au centre,
    // redimensionnement près d\'un bord. C\'est très exactement ce que le mode supprime.
    assert.ok(EVENTS.indexOf('panelId: enCadrage.id') < EVENTS.indexOf("S.dragMode = 'panelCorner'"),
      'les poignées de coin répondent avant le recadrage');
  });

  test('RÉGRESSION : RELÂCHER ne sort PAS du mode', () => {
    // ⚠️ EXIGENCE EXPLICITE DE L'UTILISATEUR : « tant que je ne clique pas en dehors de la Case ou
    // que j'appuie sur Échap, je peux déplacer l'image ». Relâcher termine UN déplacement, pas le
    // recadrage : on enchaîne les ajustements sans repasser par le menu. Ma campagne a montré
    // qu'aucun test ne le retenait (W21), et c'est pourtant la moitié de la demande.
    const i = EVENTS.indexOf("if (S.dragMode === 'imageAnchor') canvas.style.cursor");
    assert.ok(i > 0, 'la fin du glisser de recadrage a disparu');
    const bloc = EVENTS.slice(i, i + 400);
    assert.ok(!/sortirModeDeplacementImage/.test(bloc),
      'relâcher le bouton ferme le mode : il faudrait rouvrir le menu à chaque ajustement');
    // Et la main ne se rouvre QUE si le mode est encore là. Deux cas la rendraient fausse : Échap
    // pressé pendant que le bouton est enfoncé, et le recadrage au clic droit, qui n'allume aucun
    // mode. Dans les deux, un curseur « main » promettrait un geste qui ne répondra pas.
    assert.match(bloc.slice(0, 140), /S\.imageMovePanelId \? 'grab' : 'crosshair'/);
  });

  test('RÉGRESSION : Échap sort du mode', () => {
    assert.match(EVENTS, /e\.key === 'Escape' && S\.imageMovePanelId[\s\S]{0,220}sortirModeDeplacementImage\(\)/);
  });

  test('RÉGRESSION : le mode ne survit ni à l\'image détachée, ni à un autre Projet', () => {
    // Un mode qui survit à son objet reste actif et INVISIBLE : le prochain glisser fait alors
    // autre chose que ce que l\'utilisateur croit.
    const retrait = EVENTS.slice(EVENTS.indexOf('async function _retirerImageDeLaCase'));
    assert.match(retrait.slice(0, retrait.indexOf('\n}')), /sortirModeDeplacementImage\(\)/,
      'détacher l\'image laisse le mode actif');
    assert.match(IO, /S\.imageMovePanelId = null/,
      'le mode désignerait une Case du Projet précédent');
  });

  test('RÉGRESSION : la marque du mode ne part PAS à l\'export', () => {
    // `drawObject` sert aussi l\'export (cf. exportPage) : un état de l\'éditeur dessiné là-bas se
    // retrouverait sur la planche exportée. Elle vit donc derrière `withSelection`, comme la
    // sélection elle-même.
    assert.ok(!/estCaseEnRecadrage3D/.test(DRAW_NU.slice(DRAW_NU.indexOf('export function drawObject('))),
      'la marque du mode est dessinée dans drawObject, elle sortira à l\'export');
    assert.match(DRAW_NU, /withSelection && S\.imageMovePanelId/);
  });

  test('RÉGRESSION : le curseur annonce le mode avant le clic', () => {
    // Un mode invisible qui change ce que fait la souris est indiscernable d\'une panne.
    assert.match(EVENTS, /canvas\.style\.cursor = dedans \? 'grab' : 'crosshair'/);
    assert.match(EVENTS, /canvas\.style\.cursor = 'grabbing'/);
  });
});
/**
 * JOURNAL DE MUTATION #403f : seize fautes, trois échappées, une assumée.
 *
 *   T1  le zoom multiplie au lieu de diviser le cadre source            ROUGE
 *   T2  le zoom ignoré par le cadrage                                   ROUGE
 *   T3  plancher du zoom à 0 (l'image ne couvre plus)                   ROUGE
 *   T4  LE DESSIN ignore le zoom de la Case                         ÉCHAPPÉE
 *   T5  le glisser ignore le zoom pour calculer le jeu                  ROUGE
 *   T6  Recentrer écrit les défauts au lieu de supprimer                ROUGE
 *   T7  le dessin ignore l'ancrage                                      ROUGE
 *   T8  « Recentrer » affiché en permanence                             ROUGE
 *   T9  le panneau ne repose pas le curseur en changeant de Case        ROUGE
 *   T10 un instantané à chaque événement du curseur                     ROUGE
 *   T11 pas de remise à zéro au relâchement                             ROUGE
 *   T12 Recentrer sans instantané                                   ÉCHAPPÉE
 *   T13 Recentrer détache aussi l'image                                 ROUGE
 *   T14 le zoom écrit sans être borné                       ÉCHAPPÉE, ASSUMÉE
 *   T15 les bornes du curseur non posées depuis le code                 ROUGE
 *   T16 l'instantané pris APRÈS la remise à zéro                        ROUGE
 *
 * T4 EST LA PLUS GRAVE DE TOUT LE CHANTIER DES IMAGES. Retirer le zoom de l'appel au dessin
 * laissait TOUT vert : le curseur bougeait, la valeur était écrite, le Projet se marquait modifié,
 * « Recentrer » apparaissait, et l'image ne changeait pas d'un pixel. Une fonctionnalité entière
 * invisible, sans un seul test rouge. Le dessin reste hors de portée sous Node, donc c'est l'APPEL
 * qui est désormais épinglé, avec ses deux réglages.
 *
 * T12 EST LE TROISIÈME PIÈGE DE FENÊTRE DE CE CHANTIER, après une chaîne vide (W7) et une coupe
 * trop courte. Ici : `indexOf` rend -1 quand l'appel a disparu, et -1 est inférieur à tout, donc ma
 * comparaison de positions restait vraie exactement dans le cas qu'elle prétendait interdire. La
 * leçon tient en une ligne : vérifier la PRÉSENCE avant de vérifier l'ORDRE.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * SUITE #403i : la section Cadrage à part, et la molette. Dix fautes, une échappée.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 *   R1  la molette zoome sans vérifier la position du curseur              ROUGE
 *   R2  la molette zoome une Case SANS image                               ROUGE
 *   R3  un instantané à chaque cran de molette                             ROUGE
 *   R4  la molette écrit un zoom hors bornes                               ROUGE
 *   R5  le SENS de la molette inversé                                  ÉCHAPPÉE
 *   R6  pas de `return` : le zoom de Planche s'applique par-dessus         ROUGE
 *   R7  Cadrage non masquée à la désélection                               ROUGE
 *   R8  Cadrage jamais affichée                                            ROUGE
 *   R9  le minuteur de salve jamais annulé                                 ROUGE
 *   R10 le panneau droit ne suit pas la molette                            ROUGE
 *
 * R5 EST LA SEULE QUI COMPTE, et elle est instructive : rien ne disait dans quel sens la roulette
 * devait tourner. Personne ne l'aurait vu avant de poser la main sur la souris. Ce que le test
 * garde n'est PAS ma convention, c'est l'ACCORD entre les deux molettes de l'application : roulette
 * vers l'avant = zoom avant, pour le cadrage comme pour la caméra. Deux gestes identiques qui
 * tournent en sens contraire dans la même fenêtre se paient à chaque usage.
 *
 * UNE ANCRE M'A AUSSI REPRIS AU PASSAGE : j'avais visé une phrase de COMMENTAIRE pour découper le
 * bloc de la molette, alors que `EVENTS` passe par `sourceSansCommentaires`. Quatre tests
 * annonçaient « la molette n'est plus branchée », et un cinquième PASSAIT par accident, parce que
 * `indexOf(x, -1)` repart de zéro et retrouvait des occurrences sans rapport ailleurs dans le
 * fichier. Une ancre absente ne fait pas échouer proprement : elle fait dériver.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * SUITE #403j : « Déplacer » passe dans Cadrage, et le clic droit maintenu recadre. Six fautes.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 *   Q1 le clic droit recadre sans vérifier la position du curseur         ROUGE
 *   Q2 le clic droit recadre sans instantané                              ROUGE
 *   Q3 le menu contextuel s'ouvre après un recadrage à la souris          ROUGE
 *   Q4 le glisser relit le MODE au lieu de sa propre cible                ROUGE
 *   Q5 le seuil de 3 px retiré : un clic droit simple n'ouvre plus rien   ROUGE
 *   Q6 « Déplacer l'image » revient dans la section Image                 ROUGE
 *
 * AUCUNE ÉCHAPPÉE, mais le chantier a quand même repris trois de mes tests : les ancres de #403e
 * pointaient sur `S.dragMode = 'imageAnchor'`, qui ne désignait alors qu'un endroit. Le recadrage au
 * clic droit en a créé un SECOND, plus haut dans le fichier, et les fenêtres sont allées se poser
 * dessus. Trois tests se sont mis à parler d'un bloc qu'ils ne lisaient plus, et ils l'ont dit tout
 * de suite. C'est la quatrième fois de ce chantier qu'une fenêtre de lecture se déplace sous mes
 * pieds ; celle-ci a été la moins coûteuse, parce que les tests étaient assez précis pour échouer
 * au lieu de dériver en silence.
 *
 * Q5 mérite d'être lu à l'envers des autres : il ne protège pas le recadrage, il protège le MENU.
 * Sans seuil, un clic droit sans mouvement supprimerait le menu contextuel, et une Case à image
 * perdrait « Changer l'image » et « Retirer l'image ».
 *
 * T14 RESTE, ET C'EST ASSUMÉ. Écrire la valeur brute du curseur au lieu de la borner ne change
 * aucun comportement : `zoomDeLImage3D` borne à la LECTURE, donc le dessin et « Recentrer » restent
 * justes. La seule différence est le fichier de Projet, qui porterait une chaîne au lieu d'un
 * nombre. Le code garde la normalisation pour cette raison seule, et aucun test ne la retient : la
 * couvrir demanderait un montage de Projet complet qu'aucun fichier de tests ne possède
 * aujourd'hui, et j'ai préféré l'écrire ici plutôt que de gonfler la suite pour une cosmétique.
 */
describe('#403f : le zoom et le retour au cadrage d\'origine, câblage', () => {
  const EVENTS = sourceSansCommentaires(
    readFileSync(new URL('../src/events.js', import.meta.url), 'utf8'));
  const SIDEBAR = sourceSansCommentaires(
    readFileSync(new URL('../src/sidebar.js', import.meta.url), 'utf8'));
  const HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

  // ⚠️ LA COUPE SE FAIT SUR « \\n}); », EN DÉBUT DE LIGNE, ET PAS SUR « }); ». Le corps du
  // gestionnaire contient lui-même `zoomDeLImage3D({ … })` suivi d'un point-virgule : couper à la
  // première occurrence tranchait au MILIEU du corps, et le test annonçait un `S.projectDirty`
  // manquant qui se trouvait deux lignes plus bas. Une fenêtre mal fermée accuse à tort.
  /**
   * Le bloc de la molette dans le gestionnaire `wheel`.
   *
   * ⚠️ L'ANCRE EST DU CODE, PAS UN COMMENTAIRE. Ma première version visait la phrase « La molette
   * zoome le cadrage », qui n'existe pas dans `EVENTS` : `sourceSansCommentaires` l'a retirée. Quatre
   * tests annonçaient donc « la molette n'est plus branchée », et un CINQUIÈME passait par accident,
   * parce que `indexOf(x, -1)` repart de zéro et retrouvait des occurrences sans rapport ailleurs
   * dans le fichier. Une ancre absente ne fait pas échouer proprement : elle fait dériver.
   */
  const blocMolette = () => {
    const j = EVENTS.indexOf('S.imageZoomWheelSnapshotTaken');
    assert.ok(j > 0, 'la molette n\'est plus branchée sur le cadrage');
    const debut = EVENTS.lastIndexOf("if (sel && sel.type === 'panel'", j);
    assert.ok(debut > 0 && debut < j, 'le bloc de la molette ne commence pas là où on le croit');
    return EVENTS.slice(debut, j + 1200);
  };

  const corpsDuGestionnaire = (ancre) => {
    const i = EVENTS.indexOf(ancre);
    assert.ok(i > 0, `${ancre} : introuvable`);
    const fin = EVENTS.indexOf('\n});', i);
    assert.ok(fin > i, `${ancre} : le gestionnaire ne se referme pas là où on le croit`);
    return EVENTS.slice(i, fin);
  };


  test('les deux commandes vivent dans leur PROPRE section, sous Image (#403i)', () => {
    ['sideCadrageSection', 'sideImageZoomInput', 'sideImageZoomValue', 'sideImageResetBtn'].forEach(id =>
      assert.match(HTML, new RegExp(`id="${id}"`), `absent : ${id}`));
    // Demande de l'utilisateur : une section à part, et SOUS la section Image, pas au-dessus.
    assert.ok(HTML.indexOf('id="sideImageSection"') < HTML.indexOf('id="sideCadrageSection"'),
      'la section Cadrage passe avant la section Image');
    // Les deux commandes sont DEDANS, et plus dans la section Image.
    const cadrage = HTML.slice(HTML.indexOf('id="sideCadrageSection"'));
    const bloc = cadrage.slice(0, cadrage.indexOf('id="bubbleMenuHeader"'));
    assert.ok(bloc.includes('sideImageZoomInput') && bloc.includes('sideImageResetBtn'));
    const image = HTML.slice(HTML.indexOf('id="sideImageSection"'), HTML.indexOf('id="sideCadrageSection"'));
    assert.ok(!image.includes('sideImageZoomInput'), 'le zoom est resté dans la section Image');
    assert.ok(!image.includes('sideImageResetBtn'), 'Recentrer est resté dans la section Image');
  });

  test('RÉGRESSION : la section s\'appelle CADRAGE, pas « Format »', () => {
    // « Format » désigne déjà le format de papier d'un Tome, dans le menu de gauche, à deux volets
    // d'ici. Deux mots identiques pour deux choses différentes dans la même fenêtre se paient
    // longtemps, et c'est l'utilisateur qui a arbitré après que je l'ai signalé.
    const titre = HTML.slice(HTML.indexOf('id="sideCadrageTitle"'), HTML.indexOf('id="sideCadrageTitle"') + 60);
    assert.match(titre, /Cadrage/);
    assert.ok(!/Format/.test(titre));
  });

  test('RÉGRESSION : Cadrage apparaît et disparaît AVEC Image', () => {
    // Sans image, il n'y a rien à cadrer : une section de réglages sans objet est pire que pas de
    // section du tout. Le témoin est la section Image elle-même, comme sideGroundSection l'est pour
    // elle (cf. sidebar.test.mjs) : les deux doivent être masquées aux mêmes endroits.
    const compte = (id) => (SIDEBAR.match(new RegExp(`${id}\\.style\\.display = 'none'`, 'g')) || []).length;
    assert.ok(compte('sideImageSection') >= 4, 'le témoin a changé : relire ce test avant de le croire');
    assert.equal(compte('sideCadrageSection'), compte('sideImageSection'),
      'une branche cache la section Image sans cacher Cadrage : elle restera affichée seule');
    assert.match(SIDEBAR, /sideImageSection\.style\.display = 'block';\s*sideCadrageSection\.style\.display = 'block';/);
  });

  test('RÉGRESSION : les bornes du curseur viennent du CODE', () => {
    // Deux sources de vérité pour un intervalle divergent toujours, et ce jour-là le curseur promet
    // une valeur que `zoomValide3D` refuse. index.html en garde une copie pour l'affichage initial,
    // mais c'est le code qui pose les bornes réelles.
    assert.match(EVENTS, /sideImageZoomInput\.min = String\(ZOOM_IMAGE_MIN\)/);
    assert.match(EVENTS, /sideImageZoomInput\.max = String\(ZOOM_IMAGE_MAX\)/);
  });

  test('RÉGRESSION : UN SEUL instantané par glissement du curseur', () => {
    // Un instantané par événement `input` remplirait la pile d'annulation de cent états
    // intermédiaires, et Ctrl+Z ne reculerait que d'un dixième de zoom à la fois. C'est le
    // dispositif déjà en place pour les curseurs des Bulles.
    const corps = corpsDuGestionnaire("sideImageZoomInput.addEventListener('input'");
    assert.match(corps, /if \(!S\.sideImageZoomSnapshotTaken\) \{ snapshot\(\); S\.sideImageZoomSnapshotTaken = true; \}/);
    assert.match(EVENTS, /sideImageZoomInput\.addEventListener\('change', \(\) => \{ S\.sideImageZoomSnapshotTaken = false; \}\)/,
      'sans remise à zéro au relâchement, le deuxième glissement ne serait plus annulable');
  });

  test('RÉGRESSION : bouger le zoom marque le Projet modifié et rafraîchit le panneau', () => {
    const corps = corpsDuGestionnaire("sideImageZoomInput.addEventListener('input'");
    assert.match(corps, /S\.projectDirty = true/, 'le travail serait perdu en quittant');
    // `updateSidePanel` et pas seulement un redessin : « Recentrer » doit apparaître PENDANT le
    // glissement, pas au prochain clic ailleurs.
    assert.match(corps, /updateSidePanel\(\)/);
  });

  test('RÉGRESSION : « Recentrer » n\'apparaît que s\'il a quelque chose à défaire', () => {
    assert.match(SIDEBAR, /sideImageResetBtn\.style\.display = cadrageParDefaut3D\(sel\) \? 'none' : 'block'/,
      'le bouton est affiché en permanence, ou masqué en permanence');
  });

  test('RÉGRESSION : le panneau lit la CASE, jamais l\'état du curseur', () => {
    // Sans cela, rouvrir la fiche d'une autre Case montrerait le zoom de la précédente : le curseur
    // garde sa position tant que personne ne la lui repose.
    const i = SIDEBAR.indexOf('casePorteUneImage3D(sel)');
    const corps = SIDEBAR.slice(i, i + SIDEBAR.slice(i).indexOf('return;'));
    assert.match(corps, /sideImageZoomInput\.value = String\(zoom\)/);
    assert.match(corps, /zoomDeLImage3D\(sel\)/);
  });

  test('RÉGRESSION : Recentrer prend un instantané et ne détache pas l\'image', () => {
    const i = EVENTS.indexOf("getElementById('sideImageResetBtn').onclick");
    assert.ok(i > 0, 'le bouton Recentrer n\'est branché nulle part');
    const corps = EVENTS.slice(i, EVENTS.indexOf('\n};', i));
    assert.ok(corps.includes('reinitialiserCadrage3D'), 'la fenêtre lue n\'est pas celle du bouton');
    // ⚠️ LA PRÉSENCE D'ABORD, L'ORDRE ENSUITE, et l'échappée T12 dit pourquoi : `indexOf` rend -1
    // quand l'appel a disparu, et -1 est inférieur à tout. Une comparaison de positions posée seule
    // reste donc vraie précisément dans le cas qu'elle prétend interdire. C'est le troisième piège
    // de fenêtre de ce chantier, après une chaîne vide et une coupe trop courte.
    assert.ok(corps.includes('snapshot()'), 'le recentrage ne serait pas annulable');
    assert.ok(corps.indexOf('snapshot()') < corps.indexOf('reinitialiserCadrage3D'),
      'l\'instantané est pris après la remise à zéro : il capturerait l\'état déjà effacé');
    assert.ok(!/CHAMP_IMAGE_CASE|imageFile/.test(corps), 'Recentrer touche au fichier de l\'image');
    // Le marquage suit le RETOUR : recentrer un cadrage déjà d'origine ne modifie rien.
    assert.match(corps, /if \(reinitialiserCadrage3D\(panel\)\) S\.projectDirty = true/);
  });

  test('RÉGRESSION : LE DESSIN lit l\'ancrage ET le zoom de la Case', () => {
    // ⚠️ ÉCHAPPÉE T4, ET C'EST LA PIRE DE CETTE TÂCHE. Retirer `zoomDeLImage3D(o)` de l'appel au
    // dessin laissait toute la suite verte : le curseur bougeait, la valeur était écrite, le Projet
    // se marquait modifié, « Recentrer » apparaissait — et l'image ne changeait pas d'un pixel. Une
    // fonctionnalité entière invisible, sans un seul test rouge.
    //
    // Le dessin lui-même reste hors de portée sous Node (cf. docs/en/testing-method.md), donc on
    // épingle l'APPEL : les deux réglages sont transmis, et personne ne peut en oublier un.
    const DRAW = sourceSansCommentaires(
      readFileSync(new URL('../src/draw.js', import.meta.url), 'utf8'));
    const i = DRAW.indexOf('function dessinerImageDeCase3D');
    assert.ok(i > 0, 'le dessin de l\'image a disparu');
    const corps = DRAW.slice(i, DRAW.indexOf('\n}', i));
    assert.match(corps, /cadreDeRecouvrement3D\(o\.w, o\.h, image\.w, image\.h, ancrageDeLImage3D\(o\), zoomDeLImage3D\(o\)\)/,
      'le dessin n\'applique pas le cadrage choisi : le réglage serait sans effet à l\'écran');
  });

  test('LA MOLETTE zoome, et seulement sur la Case visée (#403i)', () => {
    const corps = blocMolette();
    // ⚠️ DEUX CONDITIONS, ET LA SECONDE COMPTE AUTANT. Sans le test de position, faire défiler la
    // Planche pendant qu'une Case à image est sélectionnée zoomerait cette image à l'autre bout de
    // l'écran, au lieu de faire ce qu'on demande.
    assert.match(corps, /casePorteUneImage3D\(sel\)/, 'la molette zoomerait une Case sans image');
    assert.match(corps, /_mx >= sel\.x && _mx <= sel\.x \+ sel\.w/, 'la position du curseur n\'est pas vérifiée');
    assert.match(corps, /_my >= sel\.y && _my <= sel\.y \+ sel\.h/);
  });

  test('RÉGRESSION : la molette passe AVANT le mode Caméra, et rend la main', () => {
    // Une Case à image n'a pas de scène 3D à filmer, donc les deux ne peuvent pas se disputer le
    // geste ; mais l'ordre doit rester écrit, sinon un lecteur futur y verra un oubli. Le `return`
    // est ce qui empêche le zoom de Planche de s'appliquer par-dessus.
    const j = EVENTS.indexOf('S.imageZoomWheelSnapshotTaken');
    assert.ok(j > 0, 'la molette n\'est plus branchée');
    const cam = EVENTS.indexOf('sel.cameraMode', j);
    assert.ok(cam > j, 'le mode Caméra répond avant le cadrage');
    assert.match(blocMolette(), /return;/, 'sans return, le zoom de Planche s\'appliquerait par-dessus');
  });

  test('RÉGRESSION : UN SEUL instantané par SALVE de molette', () => {
    // Une roulette envoie des dizaines d'événements pour un seul geste. Un instantané par cran
    // remplirait la pile d'annulation, et Ctrl+Z ne reculerait que d'un dixième de zoom à la fois.
    const corps = blocMolette();
    assert.match(corps, /if \(!S\.imageZoomWheelSnapshotTaken\) \{ snapshot\(\); S\.imageZoomWheelSnapshotTaken = true; \}/);
    assert.match(corps, /clearTimeout\(S\.imageZoomWheelTimer\)/,
      'sans annuler le minuteur précédent, la salve se refermerait au milieu du geste');
    // `[^)]*` échouait : la fonction passée à setTimeout contient elle-même des parenthèses.
    assert.match(corps, /S\.imageZoomWheelTimer = setTimeout\([\s\S]*?MOLETTE_FIN_DE_SALVE_MS\)/);
  });

  test('RÉGRESSION : la molette tourne dans LE MÊME SENS que celle de la Caméra', () => {
    // ⚠️ ÉCHAPPÉE R5 : inverser le sens laissait tout vert, et personne ne l'aurait vu avant de
    // poser la main sur la souris. Ce qui se garde ici n'est pas « ma » convention, c'est
    // l'ACCORD entre les deux molettes de l'application : roulette vers l'avant (`deltaY < 0`) =
    // zoom avant, des deux côtés. Deux gestes identiques qui tournent en sens contraire dans la
    // même fenêtre sont une faute que l'utilisateur paie à chaque usage.
    assert.match(blocMolette(), /e\.deltaY < 0 \? PAS_ZOOM_IMAGE : -PAS_ZOOM_IMAGE/,
      'la molette du cadrage ne zoome pas vers l\'avant quand on pousse la roulette');
    // Le témoin : la caméra RÉDUIT sa distance sur `deltaY < 0`, ce qui est aussi un zoom avant.
    assert.match(EVENTS, /clamp\(oldDist \* \(e\.deltaY < 0 \? 0\.92 : 1\.08\)/,
      'la convention de référence a changé : relire ce test avant de le croire');
  });

  test('RÉGRESSION : la molette et le curseur partagent le PAS et le bornage', () => {
    // Deux commandes pour un même réglage doivent se comporter pareil : un pas différent de chaque
    // côté ferait changer la sensation du réglage selon la manière d'y toucher.
    const corps = blocMolette();
    assert.match(corps, /PAS_ZOOM_IMAGE/);
    assert.match(corps, /zoomValide3D\(zoomDeLImage3D\(sel\) \+ pas\)/,
      'la molette écrirait un zoom hors bornes, ou dériverait de son propre état');
    assert.match(EVENTS, /sideImageZoomInput\.step = String\(PAS_ZOOM_IMAGE\)/,
      'le curseur garde son propre pas, écrit à la main dans index.html');
  });

  test('RÉGRESSION : la molette marque le Projet modifié et rafraîchit le panneau', () => {
    // Le curseur du panneau droit doit montrer la même valeur, et « Recentrer » apparaître dès que
    // le zoom quitte 1 : deux commandes qui affichent des valeurs différentes pour un même réglage,
    // c'est le défaut le plus fréquent de ce genre de doublon.
    const corps = blocMolette();
    assert.match(corps, /S\.projectDirty = true/);
    assert.match(corps, /updateSidePanel\(\)/);
  });

  test('LE CLIC DROIT MAINTENU recadre, sur la Case visée seulement (#403j)', () => {
    const i = EVENTS.indexOf('boutonDroit: true');
    assert.ok(i > 0, 'le recadrage au clic droit n\'est branché nulle part');
    const corps = EVENTS.slice(EVENTS.lastIndexOf('const { x: _rx, y: _ry }', i), i + 200);
    // Mêmes deux conditions que la molette, et pour la même raison : sans le test de position, un
    // clic droit n'importe où sur la Planche recadrerait une image à l'autre bout de l'écran.
    assert.match(corps, /casePorteUneImage3D\(_selD\)/);
    assert.match(corps, /_rx >= _selD\.x && _rx <= _selD\.x \+ _selD\.w/);
    assert.match(corps, /_ry >= _selD\.y && _ry <= _selD\.y \+ _selD\.h/);
    assert.match(corps, /snapshot\(\)/, 'le recadrage au clic droit ne serait pas annulable');
  });

  test('RÉGRESSION : le clic droit passe AVANT le panoramique', () => {
    // Le clic droit fait un panoramique partout ailleurs. Le nôtre doit répondre en premier, sinon
    // la Planche défile au lieu de recadrer.
    assert.ok(EVENTS.indexOf('boutonDroit: true') < EVENTS.indexOf('S.isPanning = true; S.panMoved = false;'),
      'le panoramique répond avant le recadrage');
  });

  test('RÉGRESSION : un clic droit qui a GLISSÉ n\'ouvre pas le menu, un clic simple oui', () => {
    // ⚠️ SANS CELA, chaque recadrage à la souris se terminerait par un menu contextuel en pleine
    // figure. `S.panMoved` est le drapeau que l'écouteur `contextmenu` consulte déjà ; on s'y
    // raccroche plutôt que d'inventer un second mécanisme de suppression.
    //
    // Et le seuil compte dans l'autre sens : un clic droit SANS mouvement doit continuer d'ouvrir
    // le menu, sinon la Case à image perdrait « Changer l'image » et « Retirer l'image ».
    const corps = corpsDuMousemove();
    assert.match(corps, /S\.dragOrig\.boutonDroit/,
      'un glisser au bouton gauche supprimerait le menu contextuel lui aussi');
    assert.match(corps, /Math\.abs\(x - S\.dragStart\.x\) > 3 \|\| Math\.abs\(y - S\.dragStart\.y\) > 3/);
    assert.match(corps, /S\.panMoved = true/);
    assert.match(EVENTS, /if \(S\.panMoved\) \{ S\.panMoved = false; hideContextMenu\(\); return; \}/,
      'le drapeau sur lequel on s\'appuie n\'est plus consulté par le menu contextuel');
  });

  test('RÉGRESSION : les DEUX entrées finissent dans le même glisser', () => {
    // Deux façons de recadrer qui divergeraient donneraient deux résultats différents pour le même
    // geste. Elles posent le même `dragMode` et la même forme de `dragOrig`, donc le mousemove ne
    // peut pas les distinguer — sauf pour le menu contextuel, qui est la seule différence assumée.
    assert.equal((EVENTS.match(/S\.dragMode = 'imageAnchor';/g) || []).length, 2);
    assert.equal((EVENTS.match(/ancrage: ancrageDeLImage3D\(/g) || []).length, 2);
    assert.equal((EVENTS.match(/panelId: (enCadrage|_selD)\.id/g) || []).length, 2);
  });

  test('RÉGRESSION : le glisser lit SA cible, plus le mode', () => {
    // Le recadrage au clic droit n'allume aucun mode : lire `_caseEnDeplacementDImage()` ici
    // l'aurait rendu sans effet. Le glisser sait ce qu'il déplace parce qu'il l'a noté en commençant.
    const corps = corpsDuMousemove();
    assert.match(corps, /S\.dragOrig\.panelId/);
    assert.ok(!/_caseEnDeplacementDImage/.test(corps),
      'le glisser dépend encore du mode : le clic droit serait sans effet');
  });

  test('RÉGRESSION : le glisser tient compte du zoom pour calculer le jeu', () => {
    // À 2×, le cadre prélevé est deux fois plus petit, donc le jeu deux fois plus grand : ignorer le
    // zoom ici ferait glisser l'image deux fois trop vite, et buter contre un bord qui n'existe plus.
    const i = EVENTS.indexOf("} else if (S.dragMode === 'imageAnchor')");
    assert.ok(i > 0, 'le mousemove de recadrage a disparu');
    const corps = EVENTS.slice(i, i + 900);
    assert.match(corps, /cadreDeRecouvrement3D\(panel\.w, panel\.h, image\.w, image\.h, null, zoomDeLImage3D\(panel\)\)/);
  });
});
