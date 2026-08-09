// tests/draw.test.mjs — Tests unitaires de src/draw.js (dessin des Cases, construction de
// Bâtiments, géométrie des Bulles, wrap de texte).
import './helpers/dom-stub.mjs';
// events.js déclenche à son chargement initStartupProject() (async, via loadAppSettings().then(...))
// qui peuple S.tomes avec un Tome/Page de démarrage — sans cet import, S.tomes reste [] et
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
  buildTryExtendWall,
  buildToolClose,
  uniqueDefaultName,
  getRoomBoundingBoxXZ,
  getBuildingBoundingBoxXZ,
  getPanelPoints,
  bubbleTailVisible,
  bubbleShapeOf,
  bubbleEdgePoint,
  getBubbleTailTip,
  distToSegmentSq,
  wrapText,
  wrapTextLines,
} from '../src/draw.js';
import { S, currentPage } from '../src/state.js';
import { buildWallJunctions3D, isJunctionWall3D } from '../src/scene3d.js';
import { GROUND_Y_DEFAULT_3D, BUILD_WALL_DEFAULT_HEIGHT, PANEL_CAM_DEFAULT_DIST_3D } from '../src/constants.js';

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
describe('detectBuildFaces — détection des faces planaires du graphe de murs', () => {
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
describe('addRoomWallElement / uniqueDefaultName — création d\'un Mur', () => {
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

describe('buildToolCreateWallSegment — création d\'un mur entre deux points sol', () => {
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
describe('getRoomBoundingBoxXZ / getBuildingBoundingBoxXZ — boîtes englobantes XZ', () => {
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

// ── buildTryExtendWall ───────────────────────────────────────────────────────────────────────
// NOTE : cette fonction n'est actuellement appelée nulle part ailleurs dans le codebase (recherche
// exhaustive faite lors de l'écriture de ces tests) — code mort à ce jour. On la teste quand même
// (comportement figé, prête à être branchée), mais le second test ci-dessous documente une
// asymétrie réelle du code actuel plutôt qu'un comportement idéalisé : la vérification "au-delà de
// l'extrémité opposée" est TOUJOURS mesurée depuis A=(seg.x1,seg.z1) vers B=(seg.x2,seg.z2), même
// quand c'est l'extrémité A qui a été détectée comme point de départ (atA) — prolonger un mur ancien
// dans le sens INVERSE (au-delà de A, en s'éloignant de B) ne fonctionne donc pas avec ce code, alors
// que le prolonger dans le sens direct (au-delà de B) fonctionne correctement.
describe('buildTryExtendWall — prolongement d\'un mur colinéaire existant', () => {
  beforeEach(() => {
    S.buildTool = { wallSegs: [{ id: 'w1', x1: 0, z1: 0, x2: 4, z2: 0 }], snapWallSegsCount: 1 };
  });

  test('prolongement dans le sens direct (au-delà de B) : détecté', () => {
    const result = buildTryExtendWall(4, 0, 8, 0);
    assert.ok(result, 'extension détectée');
    assert.equal(result.seg.id, 'w1');
  });

  test('prolongement dans le sens inverse (au-delà de A, en s\'éloignant de B) : NON détecté (asymétrie du code actuel)', () => {
    assert.equal(buildTryExtendWall(0, 0, -4, 0), null);
  });

  test('direction non colinéaire (perpendiculaire) : pas d\'extension', () => {
    assert.equal(buildTryExtendWall(4, 0, 4, 4), null);
  });

  test('aucune extrémité de mur existant ne correspond au point de départ : pas d\'extension', () => {
    assert.equal(buildTryExtendWall(10, 10, 14, 10), null);
  });

  test('segment dégénéré (quasi nul) : pas d\'extension', () => {
    assert.equal(buildTryExtendWall(4, 0, 4.001, 0), null);
  });

  test('aucun S.buildTool actif : renvoie null sans planter', () => {
    S.buildTool = null;
    assert.equal(buildTryExtendWall(0, 0, 1, 0), null);
  });
});

// ── buildToolClose (test d'intégration) ──────────────────────────────────────────────────────
describe('buildToolClose — fermeture de la boucle de murs (intégration)', () => {
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

  test('moins de 3 points : annule (revert) au lieu de fermer — les murs déjà tracés sont supprimés', () => {
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

// ── getPanelPoints — géométrie des formes de Case ────────────────────────────────────────────
describe('getPanelPoints — sommets d\'une Case selon sa forme', () => {
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
describe('bubbleTailVisible / bubbleShapeOf — propriétés simples d\'une Bulle', () => {
  test('bubbleTailVisible : true par défaut, false si tailVisible === false explicitement', () => {
    assert.equal(bubbleTailVisible({}), true);
    assert.equal(bubbleTailVisible({ tailVisible: false }), false);
  });

  test('bubbleShapeOf : "ovale" par défaut, sinon la forme explicite', () => {
    assert.equal(bubbleShapeOf({}), 'ovale');
    assert.equal(bubbleShapeOf({ bulleShape: 'rect' }), 'rect');
  });
});

describe('bubbleEdgePoint — point sur le contour d\'une Bulle selon un angle', () => {
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

describe('getBubbleTailTip — pointe de la queue de Bulle', () => {
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

// ── distToSegmentSq — distance point/segment (au carré) ─────────────────────────────────────
describe('distToSegmentSq — distance au carré d\'un point à un segment', () => {
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

// ── wrapText / wrapTextLines — retour à la ligne du texte de Bulle ──────────────────────────
describe('wrapTextLines / wrapText — découpage du texte en lignes selon une largeur max', () => {
  // Utilise le vrai faux contexte 2D du dom-stub (measureText : width = nbCaractères * 6px), via un
  // canvas factice de document.createElement — un simple objet littéral n'a pas de measureText.
  function makeCtx() {
    return document.createElement('canvas').getContext('2d');
  }

  test('wrapTextLines : coupe le texte en lignes qui tiennent dans maxWidth (mesure factice 6px/caractère)', () => {
    const lines = wrapTextLines(makeCtx(), 'Bonjour le monde', 50);
    assert.deepEqual(lines, ['Bonjour', 'le monde']);
  });

  test('wrapText : dessine chaque ligne via fillText, à x fixe et y incrémenté de lineHeight', () => {
    const calls = [];
    const c = makeCtx();
    c.fillText = (text, x, y) => calls.push({ text, x, y });
    wrapText(c, 'Bonjour le monde', 10, 20, 50, 15);
    assert.deepEqual(calls, [
      { text: 'Bonjour', x: 10, y: 20 },
      { text: 'le monde', x: 10, y: 35 },
    ]);
  });
});

// ── Fix 34 : angles pleins, sur de VRAIS Murs produits par l'outil Construire ────────────────
// Les tests unitaires de buildWallJunctions3D travaillent sur un carré écrit à la main. Ici on
// passe par buildToolCreateWallSegment/buildToolClose, donc par les vraies coordonnées monde,
// les vrais rotY et le vrai mur de fermeture — c'est ce chemin-là que l'utilisateur emprunte.
describe('buildWallJunctions3D — angles d\'une Pièce réellement construite (Fix 34)', () => {
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
// Fix 85 — le repère de glisser est effectivement DESSINÉ.
//
// Par inspection de source : le contexte 2D du stub est un Proxy qui accepte tout appel en no-op
// (cf. tests/helpers/dom-stub.mjs), donc aucune assertion sur le tracé n'est possible. Ce qu'on
// vérifie est le CÂBLAGE — que la fonction de dessin soit appelée, et qu'on lui passe le repère —
// c'est-à-dire précisément ce qu'une mutation « on ne dessine plus rien » casse.
// ─────────────────────────────────────────────────────────────────────────────
describe('Fix 85 — câblage du repère de glisser', () => {
  const src = readFileSync(new URL('../src/draw.js', import.meta.url), 'utf8');
  const evt = readFileSync(new URL('../src/events.js', import.meta.url), 'utf8');

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
// Fix 86 — une articulation sélectionnée masque les autres, dans l'ÉDITEUR seulement.
//
// Par inspection de source : dessiner exige WebGL. Ce qu'on épingle, c'est l'endroit exact où le
// masquage opère — la carte de positions — parce que c'est de là que vient l'inertie au clic.
// ─────────────────────────────────────────────────────────────────────────────
describe('Fix 86 — masquage des poignées non sélectionnées', () => {
  const src = readFileSync(new URL('../src/draw.js', import.meta.url), 'utf8');
  const evt = readFileSync(new URL('../src/events.js', import.meta.url), 'utf8');
  const overlay = (() => {
    const i = src.indexOf('export function drawPersonaPoseHandlesOverlay(');
    return src.slice(i, src.indexOf('\n}', i));
  })();

  test('RÉGRESSION : la poignée masquée voit sa position mise à NULL', () => {
    // Et non simplement « non dessinée » : c'est la carte de positions que consultent
    // pickNearestHandle3D et pickLimbSegmentAt. Se contenter de sauter le tracé laisserait une
    // poignée invisible mais toujours cliquable — le pire des deux mondes.
    assert.match(overlay, /positions\[def\.id\] = null;/,
      'sans cette ligne, la poignée reste sensible au clic');
  });

  test('RÉGRESSION : `null` et non `delete`, pour ne pas garder une position périmée', () => {
    // La carte survit d'une image à l'autre. Supprimer la clé y laisserait la valeur précédente
    // si un autre chemin la réécrivait, et la poignée redeviendrait cliquable là où elle ÉTAIT.
    assert.ok(!/delete positions\[def\.id\]/.test(overlay));
  });

  test('le masquage exige une sélection ET le drapeau', () => {
    // Sans sélection, tout doit rester visible : c'est ainsi qu'on choisit une articulation.
    assert.match(overlay, /const solo = !!soloActive && !!selectedId;/);
  });

  test('RÉGRESSION : seul l\'ÉDITEUR demande ce masquage', () => {
    // L'aperçu de la modale garde toutes ses poignées : on y choisit une articulation, on ne l'y
    // manipule pas au glisser. Un masquage global y rendrait la sélection impossible à changer.
    const appelsEditeur = evt.match(/drawPersonaPoseHandlesOverlay\([^;]*\);/gs) || [];
    assert.equal(appelsEditeur.length, 1, 'un seul appel côté éditeur');
    assert.match(appelsEditeur[0], /,\s*true\s*\)/, 'et il passe le drapeau');
    const mod = readFileSync(new URL('../src/modals.js', import.meta.url), 'utf8');
    (mod.match(/drawPersonaPoseHandlesOverlay\([^;]*\);/gs) || []).forEach(appel => {
      assert.ok(!/,\s*true\s*\)/.test(appel), `la modale ne doit pas masquer : ${appel}`);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 88 — la zone de prise est DESSINÉE telle qu'elle est TESTÉE.
//
// L'enjeu n'est pas le tracé (hors de portée : le contexte 2D du stub est un no-op) mais le fait
// que le dessin et le test de clic lisent les mêmes valeurs et la même géométrie. Un dessin qui
// promettrait une prise là où le clic ne mord pas serait pire que pas de dessin du tout.
// ─────────────────────────────────────────────────────────────────────────────
describe('Fix 88 — le dessin de la zone de prise ne peut pas mentir', () => {
  const src = readFileSync(new URL('../src/draw.js', import.meta.url), 'utf8');
  const corpsDe = (nom) => {
    const i = src.indexOf(`export function ${nom}(`);
    assert.ok(i > 0, `${nom} introuvable`);
    return src.slice(i, src.indexOf('\n}', i));
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
    // exactement le mensonge que ce Fix cherche à rendre impossible — et il a échappé au premier
    // jet des mutations, faute d'un test sur cet argument précis.
    assert.match(corpsDe('pickPoseHandleAt'), /pickLimbSegmentAt\([^)]*r\.limb\)/,
      'le rayon du membre doit être transmis au repli');
  });

  test('RÉGRESSION : clic et dessin partagent le MÊME segment de membre', () => {
    // Deux calculs séparés du segment auraient fini par diverger — c'est la famille de bugs la
    // plus fréquente de ce dépôt.
    assert.match(corpsDe('pickLimbSegmentAt'), /personaLimbSegmentScreen3D/);
    assert.match(corpsDe('drawPersonaPoseHandlesOverlay'), /personaLimbSegmentScreen3D/);
  });

  test('RÉGRESSION : la zone est tracée AVANT les poignées', () => {
    // C'est un fond : dessinée après, elle voilerait la poignée et le repère de glisser, les deux
    // choses qu'il faut justement voir.
    const overlay = corpsDe('drawPersonaPoseHandlesOverlay');
    assert.ok(overlay.indexOf('drawPersonaPickZone(') < overlay.indexOf('POSE_HANDLES.forEach'),
      'la zone doit précéder la boucle des poignées');
    assert.ok(overlay.indexOf('drawPersonaPickZone(') < overlay.indexOf('drawPersonaDragHint('),
      'et précéder le repère de glisser');
  });

  test('la zone n\'est dessinée QUE lorsqu\'une articulation est isolée', () => {
    // Sans sélection, toutes les poignées sont prenables : dessiner une zone n'aurait aucun sens.
    assert.match(corpsDe('drawPersonaPoseHandlesOverlay'), /if \(solo && positions\[selectedId\]\)/);
  });
});
