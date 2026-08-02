// tests/events.test.mjs — Tests unitaires de src/events.js (logique métier pure : empilement des
// Cases/Éléments, magnétisme au tracé/mur pendant l'outil Construire, aimantation des Parois à un
// Mur, géométrie 2D des Bâtiments).
//
// NON couvert ici, volontairement : tout ce qui dépend de ensurePersonaScene3D (getWallPanAnchor2D
// pour un Mur en coin, et donc wallLockedAxis*/positionWallOpeningOnWall/wallChildFraction pour un Mur en
// coin spécifiquement — cf. en-tête de scene3d.test.mjs pour la vérification empirique de cette
// limite) ; les tests ci-dessous se limitent donc aux Murs simples pour ces fonctions. Le câblage des
// event listeners lui-même (mousedown/mousemove/mouseup, menus contextuels) n'est pas non plus
// testable unitairement (pas de vrai DOM sous Node) — cf. en-tête de dom-stub.mjs.
import './helpers/dom-stub.mjs';
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildApplyAngleSnap,
  buildApplyAlignSnap,
  getStackGroup,
  moveStackGroup,
  tracéBBox,
  wallLockedAxis,
  wallChildUnits3D,
  wallLockedAxisRange,
  wallChildFraction,
  applyWallChildFraction,
  wallOpeningRotationForWall,
  positionWallOpeningOnWall,
  recomputeBuildWallBox2D,
  storeRoomGeometry,
  getRoomOrBuildingScreenBBox,
} from '../src/events.js';
import { S } from '../src/state.js';

function assertClose(actual, expected, msg, eps = 1e-6) {
  assert.ok(Math.abs(actual - expected) < eps,
    `${msg} — attendu ≈ ${expected}, obtenu ${actual}`);
}

beforeEach(() => {
  S.selectedId = null;
  S.selectedRoomId = null;
  S.buildTool = null;
});

// ── buildApplyAngleSnap / buildApplyAlignSnap (outil Construire) ───────────────────────────────
describe('buildApplyAngleSnap — magnétisme à 90°/180° pendant le tracé au clavier/souris', () => {
  test('aucun point posé : pas de snap possible (renvoie la position brute)', () => {
    S.buildTool = { points: [] };
    assert.deepEqual(buildApplyAngleSnap(4, 0.3), { x: 4, z: 0.3 });
  });

  test('curseur proche de l\'horizontale (0°) depuis le dernier point : accroché exactement à 0°', () => {
    S.buildTool = { points: [{ x: 0, z: 0 }] };
    const snapped = buildApplyAngleSnap(4, 0.3);
    assertClose(snapped.z, 0, 'z ramené à 0 (accroché à l\'axe horizontal)');
    assertClose(snapped.x, 4, 'x = projection le long de l\'axe accroché');
  });

  test('curseur à 45° (hors seuil de tolérance) : pas de snap, direction brute conservée', () => {
    S.buildTool = { points: [{ x: 0, z: 0 }] };
    const snapped = buildApplyAngleSnap(4, 4);
    assertClose(snapped.x, 4, 'x inchangé (pas de snap)');
    assertClose(snapped.z, 4, 'z inchangé (pas de snap)');
  });

  test('deuxième segment : les références incluent aussi l\'angle relatif au segment précédent (pas seulement les axes du monde)', () => {
    S.buildTool = { points: [{ x: 0, z: 0 }, { x: 4, z: 0 }] };
    const snapped = buildApplyAngleSnap(4.2, 3);
    assertClose(snapped.x, 4, 'x ramené sur l\'axe vertical passant par le dernier point');
  });
});

describe('buildApplyAlignSnap — alignement sur les points déjà posés (guides)', () => {
  test('aucun S.buildTool actif : renvoie la position brute sans guide', () => {
    S.buildTool = null;
    assert.deepEqual(buildApplyAlignSnap(1, 1), { x: 1, z: 1, guideX: [], guideZ: [] });
  });

  test('curseur proche en X d\'un point déjà posé : accroché à ce X, avec un guide', () => {
    S.buildTool = { points: [{ x: 0, z: 0 }, { x: 4, z: 0 }] };
    const result = buildApplyAlignSnap(0.05, 5);
    assertClose(result.x, 0, 'x accroché au point posé');
    assert.deepEqual(result.guideX, [0]);
    assert.deepEqual(result.guideZ, []);
  });

  test('curseur quasi confondu avec le dernier point posé : aucun snap ni guide (évite un mur fantôme pleine-largeur)', () => {
    S.buildTool = { points: [{ x: 0, z: 0 }, { x: 4, z: 0 }] };
    const result = buildApplyAlignSnap(4.001, 0.001);
    assertClose(result.x, 4.001, 'pas de snap (trop proche du dernier point)');
    assert.deepEqual(result.guideX, []);
    assert.deepEqual(result.guideZ, []);
  });
});

// ── getStackGroup / moveStackGroup (empilement Case + Éléments) ────────────────────────────────
describe('getStackGroup — groupe d\'empilement (une Case + ses Éléments propres)', () => {
  function makePage() {
    return {
      objects: [
        { id: 'panelA', type: 'panel', x: 0, y: 0, w: 800, h: 600 },
        { id: 'perso1', type: 'perso', homePanelId: 'panelA' },
        { id: 'obj1', type: 'objet3d', homePanelId: 'panelA' },
        { id: 'panelB', type: 'panel', x: 1000, y: 0, w: 800, h: 600 },
      ],
    };
  }

  test('id d\'une Case : renvoie la Case suivie de tous ses Éléments propres', () => {
    const page = makePage();
    const group = getStackGroup('panelA', page);
    assert.deepEqual(group.map(o => o.id), ['panelA', 'perso1', 'obj1']);
  });

  test('id d\'un Élément (non-Case) : groupe réduit à lui seul', () => {
    const page = makePage();
    assert.deepEqual(getStackGroup('obj1', page).map(o => o.id), ['obj1']);
  });

  test('id introuvable : groupe vide', () => {
    const page = makePage();
    assert.deepEqual(getStackGroup('inexistant', page), []);
  });
});

describe('moveStackGroup — déplacement d\'un cran du groupe dans l\'ordre d\'empilement', () => {
  test('avance le groupe par-dessus son voisin immédiat, en préservant l\'ordre interne', () => {
    const panelA = { id: 'panelA' }, perso1 = { id: 'perso1' }, obj1 = { id: 'obj1' }, panelB = { id: 'panelB' };
    const page = { objects: [panelA, perso1, obj1, panelB] };
    const moved = moveStackGroup([panelA, perso1, obj1], page, 1, undefined);
    assert.equal(moved, true);
    assert.deepEqual(page.objects.map(o => o.id), ['panelB', 'panelA', 'perso1', 'obj1']);
  });

  test('aucun voisin disponible (déjà au bord) : renvoie false sans modifier page.objects', () => {
    const a = { id: 'a' }, b = { id: 'b' };
    const page = { objects: [a, b] };
    const moved = moveStackGroup([a, b], page, 1, undefined);
    assert.equal(moved, false);
    assert.deepEqual(page.objects.map(o => o.id), ['a', 'b']);
  });

  test('blockedIds empêche de sauter par-dessus un voisin protégé', () => {
    const a = { id: 'a' }, blocked = { id: 'blocked' }, c = { id: 'c' };
    const page = { objects: [blocked, a, c] };
    const moved = moveStackGroup([a], page, -1, new Set(['blocked']));
    assert.equal(moved, false);
    assert.deepEqual(page.objects.map(o => o.id), ['blocked', 'a', 'c']);
  });
});

// ── tracéBBox ─────────────────────────────────────────────────────────────────────────────────
describe('tracéBBox — boîte englobante d\'un tracé (points canvas)', () => {
  test('tableau vide ou absent : boîte par défaut 1×1 à l\'origine', () => {
    assert.deepEqual(tracéBBox([]), { x: 0, y: 0, w: 1, h: 1 });
    assert.deepEqual(tracéBBox(null), { x: 0, y: 0, w: 1, h: 1 });
  });

  test('plusieurs points : min/max exacts sur chaque axe', () => {
    assert.deepEqual(tracéBBox([{ x: 1, y: 2 }, { x: 5, y: 8 }, { x: -1, y: 0 }]), { x: -1, y: 0, w: 6, h: 8 });
  });
});

// ── wallLockedAxis / wallChildUnits3D / wallLockedAxisRange (Mur simple uniquement) ─────────────
describe('wallLockedAxis — axe/valeur d\'ancrage d\'une Parois sur un Mur simple', () => {
  test('Mur plus large que haut (w>=h) : ancrage sur l\'axe Y (centré verticalement)', () => {
    const wall = { x: 0, y: 0, w: 400, h: 100, objType: 'mur' };
    const obj = { w: 40, h: 60 };
    assert.deepEqual(wallLockedAxis(obj, wall), { axis: 'y', value: 20 });
  });

  test('Mur plus haut que large (w<h) : ancrage sur l\'axe X (centré horizontalement)', () => {
    const wall = { x: 0, y: 0, w: 100, h: 400, objType: 'mur' };
    const obj = { w: 40, h: 60 };
    assert.deepEqual(wallLockedAxis(obj, wall), { axis: 'x', value: 30 });
  });
});

describe('wallChildUnits3D — unités 3D (longueur/hauteur du Mur, taille de l\'Élément embarqué)', () => {
  test('type connu (fenetre_ouverte) : taille dérivée de CHILD_DESIGN_SIZE_3D et de obj.w/h', () => {
    const wall = { w: 400, h: 300 };
    const obj = { w: 40, h: 44, objType: 'fenetre_ouverte' };
    const units = wallChildUnits3D(obj, wall);
    assertClose(units.lenUnits, 10, 'longueur du Mur en unités monde (400/40)');
    assertClose(units.heightUnits, 7.5, 'hauteur du Mur en unités monde (300/40)');
    assertClose(units.childWUnits, 1, 'largeur embarquée = design.w * scaleX');
    assertClose(units.childHUnits, 1.1, 'hauteur embarquée = design.h * scaleY');
  });

  test('type inconnu : repli sur le design par défaut {w:1, h:1.5}', () => {
    const wall = { w: 400, h: 300 };
    const obj = { w: 40, h: 60, objType: 'inconnu' };
    const units = wallChildUnits3D(obj, wall);
    assertClose(units.childWUnits, 1);
    assertClose(units.childHUnits, 1.5);
  });
});

describe('wallLockedAxisRange — plage de positions autorisées pour une Parois (Mur simple)', () => {
  test('axe Y : hauteur complète du Mur + demi-hauteur de marge de chaque côté', () => {
    const wall = { x: 0, y: 0, w: 400, h: 100, objType: 'mur' };
    const obj = { w: 40, h: 60 };
    assert.deepEqual(wallLockedAxisRange(obj, wall, 'y'), [-30, 70]);
  });

  test('axe X : longueur complète du Mur + demi-largeur de marge de chaque côté', () => {
    const wall = { x: 0, y: 0, w: 400, h: 100, objType: 'mur' };
    const obj = { w: 40, h: 60 };
    assert.deepEqual(wallLockedAxisRange(obj, wall, 'x'), [-20, 380]);
  });
});

// ── wallChildFraction / applyWallChildFraction — round-trip ────────────────────────────────────
describe('wallChildFraction / applyWallChildFraction — capture puis réapplication de la position relative', () => {
  test('round-trip : réappliquer la fraction capturée sur le même rectangle redonne la même position', () => {
    const wall = { x: 0, y: 0, w: 400, h: 100, objType: 'mur' };
    const obj = { x: 50, y: 20, w: 40, h: 60 };
    const frac = wallChildFraction(obj, wall);
    const obj2 = { x: -999, y: -999, w: 40, h: 60 };
    applyWallChildFraction(obj2, wall, frac);
    assertClose(obj2.x, obj.x, 'x round-trip');
    assertClose(obj2.y, obj.y, 'y round-trip');
  });
});

// ── wallOpeningRotationForWall ────────────────────────────────────────────────────────────────────
describe('wallOpeningRotationForWall — rotation à appliquer à une Parois selon son support', () => {
  test('Mur simple : reprend directement la rotation du Mur, sans écart', () => {
    const wall = { objType: 'mur', rotX: 0.1, rotY: 0.5, rotZ: 0 };
    assert.deepEqual(wallOpeningRotationForWall(wall, 'A'), { rotX: 0.1, rotY: 0.5, rotZ: 0 });
  });

  test('Mur en coin, Second Pan (face B) : ajoute un écart de PI/2 en Y', () => {
    const wall = { objType: 'mur_coin', rotX: 0, rotY: 0.5, rotZ: 0 };
    const result = wallOpeningRotationForWall(wall, 'B');
    assertClose(result.rotY, 0.5 + Math.PI / 2, 'écart de 90° appliqué au Second Pan');
  });

  test('Mur en coin, Premier Pan (face A) : aucun écart', () => {
    const wall = { objType: 'mur_coin', rotX: 0, rotY: 0.5, rotZ: 0 };
    assert.deepEqual(wallOpeningRotationForWall(wall, 'A'), { rotX: 0, rotY: 0.5, rotZ: 0 });
  });

  test('Tracé mur : orientation dérivée du premier segment du tracé (atan2)', () => {
    const wall = { type: 'tracé', world: { pts: [{ x: 0, z: 0 }, { x: 4, z: 0 }] } };
    const result = wallOpeningRotationForWall(wall, 'A');
    assertClose(result.rotY, 0, 'segment horizontal → rotY = atan2(-0,4) = 0');
  });
});

// ── positionWallOpeningOnWall ─────────────────────────────────────────────────────────────────────
describe('positionWallOpeningOnWall — placement d\'une Parois dans la boîte 2D de son support', () => {
  test('Mur simple : centré le long du Mur, ancré selon wallLockedAxis sur l\'axe perpendiculaire', () => {
    const wall = { x: 0, y: 0, w: 400, h: 100, objType: 'mur' };
    const obj = { w: 40, h: 60 };
    positionWallOpeningOnWall(obj, wall, 'A');
    assertClose(obj.x, 180, 'centré horizontalement (wall.w>=h → axe Y ancré, X centré)');
    assertClose(obj.y, 20, 'ancré verticalement via wallLockedAxis');
    assert.equal(obj.wallFace, 'A');
    assertClose(obj.wallYFrac, 0);
    assertClose(obj.wallAlongFrac, 0.5);
  });

  test('Tracé mur : placé au milieu du tracé par longueur d\'arc (canvas pts)', () => {
    const wall = { type: 'tracé', pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] };
    const obj = { w: 4, h: 6 };
    positionWallOpeningOnWall(obj, wall, 'A');
    assertClose(obj.x, 8, 'centre du tracé (longueur totale 20, milieu = point (10,0)) - w/2');
    assertClose(obj.y, -3, 'milieu du tracé - h/2');
  });
});

// ── recomputeBuildWallBox2D ───────────────────────────────────────────────────────────────────
describe('recomputeBuildWallBox2D — thin-box 2D d\'un Mur projetée depuis ses coordonnées monde', () => {
  test('Mur horizontal centré dans une Case à la caméra par défaut : boîte projetée cohérente', () => {
    const panel = { id: 'panel1', x: 0, y: 0, w: 800, h: 600, camRotX: 0, camRotY: 0, camDist: 30, camWx: 0, camWy: 0, camWz: 0 };
    const wall = { id: 'w1', wxFloor: 2, wzFloor: 0, rotY: 0, realLenFloor: 4 };
    recomputeBuildWallBox2D(wall, panel);
    assertClose(wall.x, 397.5, 'x de la boîte projetée');
    assertClose(wall.y, 417.5, 'y de la boîte projetée');
    assertClose(wall.w, 165, 'largeur (longueur du Mur projetée + marge fixe)');
    assertClose(wall.h, 5, 'hauteur = épaisseur fixe (mur vu de dessus, thin-box)');
    assertClose(wall.baseW, wall.w, 'baseW synchronisé');
    assertClose(wall.baseH, wall.h, 'baseH synchronisé');
  });

  test('obj.wxFloor/wzFloor/realLenFloor absents : no-op (ne plante pas, ne modifie rien)', () => {
    const panel = { id: 'panel1', x: 0, y: 0, w: 800, h: 600, camRotX: 0, camRotY: 0, camDist: 30, camWx: 0, camWy: 0, camWz: 0 };
    const wall = { id: 'w2', rotY: 0 };
    recomputeBuildWallBox2D(wall, panel);
    assert.equal(wall.x, undefined);
  });
});

// ── storeRoomGeometry ────────────────────────────────────────────────────────────────────────
describe('storeRoomGeometry — instantané des Murs/Dalles d\'un ensemble de Pièces', () => {
  test('sépare Murs et Dalles, filtre par roomIds, ne garde que les champs pertinents', () => {
    const page = {
      objects: [
        { id: 'w1', pieceId: 'p1', objType: 'mur', wxFloor: 1, wzFloor: 2, rotY: 0.3, realLenFloor: 4, realHeightFloor: 2.5 },
        { id: 'd1', pieceId: 'p1', objType: 'dalle', polygon: [{ x: 0, z: 0, extra: 1 }, { x: 4, z: 0 }] },
        { id: 'w2', pieceId: 'p2', objType: 'mur', wxFloor: 9, wzFloor: 9, rotY: 0, realLenFloor: 2 },
      ],
    };
    const geo = storeRoomGeometry(['p1'], page);
    assert.equal(geo.walls.length, 1);
    assert.deepEqual(geo.walls[0], { id: 'w1', wxFloor: 1, wzFloor: 2, rotY: 0.3, realLenFloor: 4, realHeightFloor: 2.5 });
    assert.equal(geo.dalles.length, 1);
    assert.deepEqual(geo.dalles[0], { id: 'd1', polygon: [{ x: 0, z: 0 }, { x: 4, z: 0 }] }, 'polygon copié sans champs superflus (extra)');
  });
});

// ── getRoomOrBuildingScreenBBox ───────────────────────────────────────────────────────────────────
describe('getRoomOrBuildingScreenBBox — projection écran des 4 coins de la bbox XZ d\'une/plusieurs Pièces', () => {
  function makePanel() {
    return { id: 'panel1', x: 0, y: 0, w: 800, h: 600, camRotX: 0, camRotY: 0, camDist: 30, camWx: 0, camWy: 0, camWz: 0 };
  }

  test('une Pièce rectangulaire : 4 coins projetés dans l\'ordre TL/TR/BR/BL', () => {
    const panel = makePanel();
    const page = { w: 800, h: 600, objects: [panel, { pieceId: 'p1', objType: 'dalle', polygon: [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }, { x: 0, z: 3 }] }] };
    const bbox = getRoomOrBuildingScreenBBox(['p1'], page, panel);
    assert.ok(bbox, 'bbox trouvée');
    assert.equal(bbox.corners.length, 4);
    assertClose(bbox.corners[0].sx, 400, 'coin (minX,minZ) projeté (sx)');
    assertClose(bbox.corners[0].sy, 420, 'coin (minX,minZ) projeté (sy)');
    assert.deepEqual(bbox.bb, { minX: 0, maxX: 4, minZ: 0, maxZ: 3, w: 4, d: 3, cx: 2, cz: 1.5 });
  });

  test('aucune Pièce correspondante : null', () => {
    const panel = makePanel();
    const page = { w: 800, h: 600, objects: [panel] };
    assert.equal(getRoomOrBuildingScreenBBox(['pX'], page, panel), null);
  });

  test('bbox dégénérée (largeur/profondeur quasi nulle) : null', () => {
    const panel = makePanel();
    const page = { w: 800, h: 600, objects: [panel, { pieceId: 'p2', objType: 'dalle', polygon: [{ x: 0, z: 0 }, { x: 0, z: 0 }] }] };
    assert.equal(getRoomOrBuildingScreenBBox(['p2'], page, panel), null);
  });
});
