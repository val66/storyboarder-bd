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
  wallScreenAxes3D,
  fracDeltaAlongAxis2D,
  tracéScreenAxisAtFrac3D,
  integrateTracéFrac3D,
  tracéUpScreenAxis3D,
  discardJustAddedElement,
  dismissModal,
} from '../src/events.js';
import { smoothTracéPath3D, worldPointToPageXY3D, wallOpeningWorldPosOnTracé3D } from '../src/scene3d.js';
import { S } from '../src/state.js';
import { GROUND_Y_DEFAULT_3D } from '../src/constants.js';

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

// ── wallScreenAxes3D / fracDeltaAlongAxis2D (Fix 26) ──────────────────────────────────────────
// Cœur du correctif de glisser des Parois : la fraction parcourue doit se mesurer sur l'étendue
// RÉELLE du Mur à l'écran, pas sur sa boîte 2D fine.
describe('wallScreenAxes3D / fracDeltaAlongAxis2D — mapping souris → Mur (Fix 26)', () => {
  const page = { w: 800, h: 600 };
  const panel = () => ({ x: 0, y: 0, w: 800, h: 600,
                         camRotX: 0, camRotY: 0, camDist: 12, camWx: 0, camWy: 1.15, camWz: 0 });
  // Mur de 6 m centré sur l'origine. rotY = π/2 → il fuit dans la profondeur (axe Z).
  const murFuyant = () => ({ id: 'w1', type: 'objet3d', objType: 'mur', rotY: Math.PI / 2,
                             wxFloor: 0, wzFloor: 0, realLenFloor: 6, realHeightFloor: 2.5,
                             x: 400, y: 300, w: 5, h: 5 });   // boîte fine : 5×5 px

  test('fracDeltaAlongAxis2D : parcourir tout l\'axe rend exactement 1', () => {
    assertClose(fracDeltaAlongAxis2D(100, 0, { x: 100, y: 0 }), 1, 'axe horizontal');
    assertClose(fracDeltaAlongAxis2D(0, -60, { x: 0, y: -60 }), 1, 'axe vertical');
    assertClose(fracDeltaAlongAxis2D(30, 40, { x: 30, y: 40 }), 1, 'axe oblique');
  });

  test('fracDeltaAlongAxis2D : un mouvement perpendiculaire à l\'axe ne fait rien avancer', () => {
    assertClose(fracDeltaAlongAxis2D(0, 50, { x: 100, y: 0 }), 0, 'perpendiculaire');
  });

  test('fracDeltaAlongAxis2D : le sens est porté par l\'axe (plus besoin de perspSign)', () => {
    assert.ok(fracDeltaAlongAxis2D(10, 0, { x: -100, y: 0 }) < 0,
      'axe pointant à gauche → glisser à droite doit faire reculer la fraction');
  });

  test('fracDeltaAlongAxis2D : axe absent ou dégénéré → null (le caller garde son repli)', () => {
    assert.equal(fracDeltaAlongAxis2D(10, 10, null), null, 'axe absent');
    assert.equal(fracDeltaAlongAxis2D(10, 10, { x: 0, y: 0 }), null, 'axe nul (Mur vu de bout)');
    assert.equal(fracDeltaAlongAxis2D(10, 10, { x: 0.5, y: 0.5 }), null, 'axe sous le seuil de 1 px');
  });

  test('RÉGRESSION : sur un Mur fuyant, l\'axe écran est bien plus long que la boîte 2D', () => {
    const wall = murFuyant();
    const axes = wallScreenAxes3D(wall, panel(), page, 2);
    const lgAxe = Math.hypot(axes.along.x, axes.along.y);
    assert.ok(lgAxe > 100, `axe écran réel ≈ ${lgAxe.toFixed(0)} px`);
    assert.ok(lgAxe / Math.max(1, wall.w) > 20,
      'l\'ancien dénominateur (wall.w = 5 px) était plus de 20× trop petit');
  });

  test('RÉGRESSION : le glisser devient ainsi des dizaines de fois moins sensible', () => {
    const wall = murFuyant();
    const axes = wallScreenAxes3D(wall, panel(), page, 2);
    const dx = 10;
    const nouveau = Math.abs(fracDeltaAlongAxis2D(dx, 0, axes.along));
    const ancien  = Math.abs(dx / Math.max(1, wall.w));   // ancienne formule
    assert.ok(ancien > 1, 'l\'ancienne formule saturait la fraction dès 10 px de souris');
    assert.ok(nouveau < 0.2, `la nouvelle avance de ${(nouveau * 100).toFixed(1)} % seulement`);
  });

  test('l\'axe vertical pointe vers le HAUT de l\'écran (y canvas décroissant)', () => {
    const axes = wallScreenAxes3D(murFuyant(), panel(), page, 2);
    assert.ok(axes.up.y < 0, 'monter sur le Mur = remonter à l\'écran');
    // Donc glisser la souris vers le haut (dy < 0) augmente bien wallYFrac.
    assert.ok(fracDeltaAlongAxis2D(0, -10, axes.up) > 0, 'souris vers le haut → fraction croissante');
  });

  test('renvoie null pour un Tracé ou un Mur sans position monde (repli sur l\'ancienne formule)', () => {
    assert.equal(wallScreenAxes3D({ type: 'tracé', wxFloor: 0, wzFloor: 0 }, panel(), page, 2), null);
    assert.equal(wallScreenAxes3D({ type: 'objet3d', objType: 'mur' }, panel(), page, 2), null,
      'wxFloor/wzFloor absents');
    assert.equal(wallScreenAxes3D(murFuyant(), null, page, 2), null, 'panel absent');
  });

  test('spanY nul ou négatif : pas d\'axe vertical, mais l\'axe le long du Mur reste fourni', () => {
    const axes = wallScreenAxes3D(murFuyant(), panel(), page, 0);
    assert.equal(axes.up, null, 'pas de hauteur exploitable');
    assert.ok(axes.along, 'l\'axe le long du Mur reste calculé');
  });
});

// ── tracéScreenAxisAtFrac3D (Fix 27) ──────────────────────────────────────────────────────────
describe('tracéScreenAxisAtFrac3D — échelle écran locale d\'un Tracé (Fix 27)', () => {
  const page = { w: 800, h: 600 };
  const panel = { x: 0, y: 0, w: 800, h: 600,
                  camRotX: 0, camRotY: 0, camDist: 12, camWx: 0, camWy: 1.15, camWz: 0 };
  const droitFace   = [{ x: -5, z: 0 }, { x: 5, z: 0 }];
  const droitFuyant = [{ x: 0, z: 5 }, { x: 0, z: -5 }];

  test('l\'axe est bien à l\'échelle d\'UNE unité de fraction (division par ε)', () => {
    // Tracé de 10 u vu de face : il occupe ~1000 px, donc l'axe doit valoir ~1000 px, pas ~20
    // (ce que donnerait l'écart brut entre les deux points échantillonnés sans diviser par ε).
    const A = tracéScreenAxisAtFrac3D(droitFace, 0.5, panel, page);
    const lg = Math.hypot(A.x, A.y);
    assert.ok(lg > 500, `échelle ≈ ${lg.toFixed(0)} px/fraction — sans la division par ε on aurait ~${(lg*0.02).toFixed(0)} px`);
  });

  test('parcourir cet axe fait avancer la fraction de exactement 1', () => {
    const A = tracéScreenAxisAtFrac3D(droitFace, 0.5, panel, page);
    assertClose(fracDeltaAlongAxis2D(A.x, A.y, A), 1, 'traversée complète du tracé');
  });

  test('RÉGRESSION : sur un tracé fuyant, l\'axe est vertical et bien plus grand que la bbox 2D', () => {
    const A = tracéScreenAxisAtFrac3D(droitFuyant, 0.5, panel, page);
    assert.ok(Math.abs(A.x) < 1, 'projection quasi verticale : composante horizontale négligeable');
    assert.ok(Math.abs(A.y) > 300, `échelle réelle ≈ ${Math.abs(A.y).toFixed(0)} px, contre ~1 px pour la bbox`);
    // Avec l'ancienne formule, 10 px de souris horizontaux saturaient la fraction ; désormais ils
    // ne font quasiment rien, ce qui est correct : il faut glisser verticalement.
    assert.ok(Math.abs(fracDeltaAlongAxis2D(10, 0, A)) < 0.01, 'glisser horizontal ≈ sans effet');
    assert.ok(Math.abs(fracDeltaAlongAxis2D(0, 10, A)) > 0.02, 'glisser vertical : effet réel');
  });

  test('l\'échelle suit la courbure : différente au début et à la fin d\'un tracé en L', () => {
    const enL = [{ x: -5, z: 0 }, { x: 0, z: 0 }, { x: 0, z: -5 }];
    const a1 = tracéScreenAxisAtFrac3D(enL, 0.15, panel, page);
    const a2 = tracéScreenAxisAtFrac3D(enL, 0.85, panel, page);
    assert.ok(Math.abs(a1.x) > Math.abs(a1.y), 'début du L : dominante horizontale');
    assert.ok(Math.abs(a2.y) > Math.abs(a2.x), 'fin du L : dominante verticale');
  });

  test('frac = 1 : échantillonne vers l\'arrière, l\'axe reste défini', () => {
    const A = tracéScreenAxisAtFrac3D(droitFace, 1, panel, page);
    assert.ok(A && Math.hypot(A.x, A.y) > 100, 'pas d\'axe nul à l\'extrémité du tracé');
  });

  test('entrées invalides → null (le caller garde son repli)', () => {
    assert.equal(tracéScreenAxisAtFrac3D(null, 0.5, panel, page), null);
    assert.equal(tracéScreenAxisAtFrac3D([{ x: 0, z: 0 }], 0.5, panel, page), null, 'un seul point');
    assert.equal(tracéScreenAxisAtFrac3D(droitFace, 0.5, null, page), null, 'panel absent');
  });
});

// ── integrateTracéFrac3D (Fix 29) ─────────────────────────────────────────────────────────────
// Bug rapporté : sur un Muret qui BOUCLE sur lui-même, en maintenant le clic pour faire glisser
// une Parois le long du mur, la direction finissait par s'inverser. Cause : l'axe écran était
// évalué une seule fois, à la fraction de départ ; la tangente d'une boucle tournant de 360°, la
// projection sur cet axe périmé changeait de signe après environ un quart de tour.
describe('integrateTracéFrac3D — suivi d\'un Tracé qui tourne (Fix 29)', () => {
  const page = { w: 800, h: 600 };
  const panel = { x: 0, y: 0, w: 800, h: 600,
                  camRotX: 0.9, camRotY: 0, camDist: 25, camWx: 0, camWy: 1, camWz: 0 };
  // Boucle ovale fermée, comme le Muret de la capture d'écran.
  function boucleOvale() {
    const raw = [];
    const N = 16;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      raw.push({ x: Math.cos(a) * 8, z: Math.sin(a) * 5 });
    }
    raw.push({ ...raw[0] });
    return smoothTracéPath3D(raw, 4);
  }
  // Souris qui SUIT le mur : à chaque pas, on se déplace de `px` pixels le long de la tangente
  // écran locale — exactement ce que fait l'utilisateur.
  function pasEnSuivantLeMur(pts, frac, px) {
    const A = tracéScreenAxisAtFrac3D(pts, frac, panel, page);
    const n = Math.hypot(A.x, A.y) || 1;
    return { dx: A.x / n * px, dy: A.y / n * px };
  }

  test('RÉGRESSION : l\'axe FIGÉ au départ finit par faire reculer la Parois', () => {
    // Reproduit l'ancien comportement pour documenter le bug corrigé.
    const pts = boucleOvale();
    const A0 = tracéScreenAxisAtFrac3D(pts, 0, panel, page);
    const versLaMoitie = pasEnSuivantLeMur(pts, 0.5, 10);
    const avanceFigee = fracDeltaAlongAxis2D(versLaMoitie.dx, versLaMoitie.dy, A0);
    assert.ok(avanceFigee < 0,
      `avec l'axe de départ, à mi-parcours la Parois RECULE (${(avanceFigee*100).toFixed(2)} %)`);
  });

  test('l\'axe réévalué à la position courante avance toujours dans le bon sens', () => {
    const pts = boucleOvale();
    for (const f of [0, 0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9]) {
      const pas = pasEnSuivantLeMur(pts, f, 10);
      const suivant = integrateTracéFrac3D(pts, f, pas.dx, pas.dy, panel, page);
      assert.ok(suivant > f, `à frac ${f} la Parois doit avancer (obtenu ${suivant.toFixed(4)})`);
    }
  });

  test('un glisser complet en suivant le mur parcourt la boucle sans jamais repartir en arrière', () => {
    const pts = boucleOvale();
    let frac = 0, precedent = -1, reculs = 0;
    for (let i = 0; i < 400; i++) {
      const pas = pasEnSuivantLeMur(pts, frac, 8);
      const suivant = integrateTracéFrac3D(pts, frac, pas.dx, pas.dy, panel, page);
      if (suivant === null) break;
      if (suivant < precedent) reculs++;
      precedent = frac; frac = suivant;
      if (frac >= 1) break;
    }
    assert.equal(reculs, 0, 'aucun recul pendant tout le parcours');
    assert.ok(frac >= 1, `la Parois doit atteindre le bout de la boucle (arrivée à ${frac.toFixed(3)})`);
  });

  test('inverser le sens de la souris fait bien reculer la Parois', () => {
    const pts = boucleOvale();
    const pas = pasEnSuivantLeMur(pts, 0.5, 10);
    const arriere = integrateTracéFrac3D(pts, 0.5, -pas.dx, -pas.dy, panel, page);
    assert.ok(arriere < 0.5, 'glisser à contresens doit décrémenter la fraction');
  });

  test('la fraction reste bornée à [0, 1]', () => {
    const pts = boucleOvale();
    const pas = pasEnSuivantLeMur(pts, 0.99, 5000);
    assert.equal(integrateTracéFrac3D(pts, 0.99, pas.dx, pas.dy, panel, page), 1, 'plafonnée à 1');
    const pasArr = pasEnSuivantLeMur(pts, 0.01, 5000);
    assert.equal(integrateTracéFrac3D(pts, 0.01, -pasArr.dx, -pasArr.dy, panel, page), 0, 'plancher à 0');
  });

  test('axe dégénéré ou entrées invalides → null (la Parois ne bouge pas)', () => {
    assert.equal(integrateTracéFrac3D(null, 0.5, 10, 10, panel, page), null);
    assert.equal(integrateTracéFrac3D(boucleOvale(), 0.5, 10, 10, null, page), null, 'panel absent');
    assert.equal(integrateTracéFrac3D(boucleOvale(), 0.5, 0, 0, panel, page), 0.5,
      'souris immobile : fraction inchangée');
  });
});

// ── tracéUpScreenAxis3D (Fix 30) ──────────────────────────────────────────────────────────────
// Bug rapporté : impossible de déplacer verticalement une Parois posée sur un Muret, alors que ça
// marche sur un Mur. Le glisser vertical retombait sur `dy / wall.h`, et pour un Tracé wall.h est
// la hauteur de la boîte englobante 2D du chemin ENTIER — des centaines de pixels sur une boucle.
describe('tracéUpScreenAxis3D — axe vertical d\'un Muret (Fix 30)', () => {
  const panel = { x: 0, y: 0, w: 800, h: 600,
                  camRotX: 0.5, camRotY: 0, camDist: 20, camWx: 0, camWy: 1, camWz: 0 };
  function scene({ wallHeight = 1.2, alongFrac = 0.3 } = {}) {
    const raw = [];
    const N = 16;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      raw.push({ x: Math.cos(a) * 8, z: Math.sin(a) * 5 });
    }
    raw.push({ ...raw[0] });
    const muret = { id: 'm1', type: 'tracé', tracéType: 'muret', wallHeight, world: { pts: raw } };
    const porte = { id: 'p1', type: 'objet3d', objType: 'porte_ouverte', magnetWallId: 'm1',
                    wallAlongFrac: alongFrac, wallYFrac: 0, w: 20, h: 16 };
    return { page: { w: 800, h: 600, objects: [muret, porte] }, muret, porte, raw };
  }

  test('RÉGRESSION : wall.h (bbox du muret entier) est sans rapport avec sa hauteur à l\'écran', () => {
    const { page, porte, raw } = scene();
    const sp = raw.map(p => worldPointToPageXY3D(p.x, GROUND_Y_DEFAULT_3D, p.z, panel, page)).filter(Boolean);
    const ys = sp.map(p => p.y);
    const bboxH = Math.max(...ys) - Math.min(...ys);   // ce que valait wall.h
    const A = tracéUpScreenAxis3D(porte, page, panel, 0.4);
    const vraie = Math.hypot(A.x, A.y);
    assert.ok(bboxH > 200, `la boucle occupe ${bboxH.toFixed(0)} px de haut à l'écran`);
    assert.ok(vraie < 100, `mais le muret ne fait que ${vraie.toFixed(0)} px de haut`);
    assert.ok(bboxH / vraie > 5, 'l\'ancien dénominateur était plus de 5× trop grand');
  });

  test('un glisser vertical raisonnable produit un déplacement utile', () => {
    const { page, porte } = scene();
    const A = tracéUpScreenAxis3D(porte, page, panel, 0.4);
    const avance = Math.abs(fracDeltaAlongAxis2D(0, -10, A));
    assert.ok(avance > 0.05, `10 px doivent monter d'au moins 5 % (obtenu ${(avance*100).toFixed(1)} %)`);
  });

  test('l\'axe pointe vers le HAUT de l\'écran : souris vers le haut → fraction croissante', () => {
    const { page, porte } = scene();
    const A = tracéUpScreenAxis3D(porte, page, panel, 0.4);
    assert.ok(A.y < 0, 'monter sur le muret = remonter à l\'écran');
    assert.ok(fracDeltaAlongAxis2D(0, -10, A) > 0, 'souris vers le haut → wallYFrac augmente');
  });

  test('un muret plus haut donne un axe plus long (donc un glisser moins sensible)', () => {
    const bas  = scene({ wallHeight: 0.5 });
    const haut = scene({ wallHeight: 2.0 });
    const aBas  = tracéUpScreenAxis3D(bas.porte,  bas.page,  panel, 0);
    const aHaut = tracéUpScreenAxis3D(haut.porte, haut.page, panel, 0);
    assert.ok(Math.hypot(aHaut.x, aHaut.y) > Math.hypot(aBas.x, aBas.y),
      'la hauteur réelle du muret pilote bien l\'échelle');
  });

  test('l\'axe suit la Parois le long du chemin (il change avec wallAlongFrac)', () => {
    const a = scene({ alongFrac: 0.1 }), b = scene({ alongFrac: 0.6 });
    const A = tracéUpScreenAxis3D(a.porte, a.page, panel, 0);
    const B = tracéUpScreenAxis3D(b.porte, b.page, panel, 0);
    // Les deux points sont à des profondeurs différentes → échelle perspective différente.
    assert.ok(Math.abs(Math.hypot(A.x, A.y) - Math.hypot(B.x, B.y)) > 1e-6,
      'l\'axe est évalué à la position courante, pas une fois pour toutes');
  });

  test('la Parois ne dépasse pas du muret : fraction 1 aligne son sommet sur celui du muret', () => {
    const { page, porte } = scene({ wallHeight: 2 });
    const hautDeLaParois = 0.5;   // childHUnits
    const enHaut = { ...porte, wallYFrac: 1 };
    const pos = wallOpeningWorldPosOnTracé3D(enHaut, page, hautDeLaParois);
    // base + hauteur de la Parois doit retomber sur le sommet du muret.
    assertClose(pos.y + hautDeLaParois, GROUND_Y_DEFAULT_3D + 2, 'sommet aligné', 1e-9);
  });

  test('Parois plus haute que le muret : posée au sol, pas de span négatif', () => {
    const { page, porte } = scene({ wallHeight: 0.5 });
    const pos = wallOpeningWorldPosOnTracé3D({ ...porte, wallYFrac: 1 }, page, 3);
    assertClose(pos.y, GROUND_Y_DEFAULT_3D + 0.01, 'span plancher, la Parois reste au sol', 1e-9);
  });

  test('entrées invalides → null (repli sur la formule historique)', () => {
    const { page, porte } = scene();
    assert.equal(tracéUpScreenAxis3D(porte, page, null, 0), null, 'panel absent');
    assert.equal(tracéUpScreenAxis3D({ ...porte, magnetWallId: null }, page, panel, 0), null,
      'pas d\'hôte Tracé');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 35 — Annuler la PREMIÈRE modale d'un Élément qu'on vient d'ajouter le supprime.
//
// Le menu Ajouter crée l'Élément puis ouvre sa modale (isNew=true). Annuler à ce
// moment-là veut dire « finalement je n'en veux pas » : fermer sans rien faire laissait
// l'Élément posé dans la Case alors que l'utilisateur n'avait jamais pu l'accepter.
// ─────────────────────────────────────────────────────────────────────────────
describe('discardJustAddedElement — retrait de l\'Élément à peine ajouté (Fix 35)', () => {
  const faire = () => {
    const panel = { id: 'panel1', type: 'panel', x: 0, y: 0, w: 400, h: 300 };
    const obj = { id: 'o1', type: 'objet3d', objType: 'voiture', homePanelId: 'panel1',
                  x: 50, y: 50, w: 40, h: 30 };
    return { panel, obj, page: { objects: [panel, obj] } };
  };
  beforeEach(() => { S.selectedId = null; S.selectedRoomId = null; });

  test('l\'Élément est retiré de la Page', () => {
    const { obj, page } = faire();
    assert.equal(discardJustAddedElement(obj, page), true);
    assert.equal(page.objects.some(o => o.id === 'o1'), false, 'plus présent');
  });

  test('la Case d\'accueil est resélectionnée, pas « rien »', () => {
    const { obj, page } = faire();
    S.selectedId = 'o1';
    discardJustAddedElement(obj, page);
    assert.equal(S.selectedId, 'panel1', 'on reste dans la Case où on travaillait');
    assert.equal(S.selectedRoomId, null);
  });

  test('les autres Éléments de la Page ne sont pas touchés', () => {
    const { obj, page } = faire();
    const autre = { id: 'o2', type: 'objet3d', objType: 'velo', homePanelId: 'panel1' };
    page.objects.push(autre);
    discardJustAddedElement(obj, page);
    assert.equal(page.objects.length, 2, 'la Case et l\'autre Élément restent');
    assert.ok(page.objects.includes(autre));
  });

  test('Élément absent, Page absente, entrée nulle : ne fait rien et le signale', () => {
    const { page } = faire();
    assert.equal(discardJustAddedElement({ id: 'inconnu' }, page), false, 'id absent');
    assert.equal(discardJustAddedElement(null, page), false);
    assert.equal(discardJustAddedElement({ id: 'o1' }, null), false);
    assert.equal(discardJustAddedElement({ id: 'o1' }, {}), false, 'page sans objects');
    assert.equal(page.objects.length, 2, 'la Page est intacte');
  });
});

describe('dismissModal — Annuler / Échap / clic hors modale (Fix 35)', () => {
  const faire = () => {
    const panel = { id: 'panel1', type: 'panel', x: 0, y: 0, w: 400, h: 300 };
    const obj = { id: 'o1', type: 'objet3d', objType: 'voiture', homePanelId: 'panel1' };
    return { obj, page: { objects: [panel, obj] } };
  };
  beforeEach(() => { S.selectedId = null; S.selectedRoomId = null; S.modalTarget = null; S.modalIsNew = false; });

  test('Élément neuf : la modale se ferme ET l\'Élément est supprimé', () => {
    const { obj, page } = faire();
    S.modalTarget = obj; S.modalIsNew = true;
    let ferme = 0;
    assert.equal(dismissModal(() => { ferme++; }, page), true, 'suppression signalée');
    assert.equal(ferme, 1, 'la modale a bien été fermée');
    assert.equal(page.objects.some(o => o.id === 'o1'), false, 'Élément supprimé');
  });

  test('Élément existant rouvert : la modale se ferme, l\'Élément reste', () => {
    const { obj, page } = faire();
    S.modalTarget = obj; S.modalIsNew = false;
    let ferme = 0;
    assert.equal(dismissModal(() => { ferme++; }, page), false);
    assert.equal(ferme, 1, 'la modale a bien été fermée');
    assert.equal(page.objects.some(o => o.id === 'o1'), true, 'Élément conservé');
  });

  test('RÉGRESSION : annuler deux fois de suite ne supprime pas un 2e Élément', () => {
    // Le drapeau est désarmé dès la 1re fermeture ; sans ça, une modale rouverte puis
    // annulée aurait hérité du « neuf » de la précédente.
    const { obj, page } = faire();
    S.modalTarget = obj; S.modalIsNew = true;
    dismissModal(() => {}, page);
    const autre = { id: 'o2', type: 'objet3d', objType: 'velo', homePanelId: 'panel1' };
    page.objects.push(autre);
    S.modalTarget = autre;                     // rouverte SANS isNew
    assert.equal(dismissModal(() => {}, page), false);
    assert.equal(page.objects.some(o => o.id === 'o2'), true, 'le 2e Élément survit');
  });

  test('la modale est toujours fermée, même sans cible', () => {
    S.modalTarget = null; S.modalIsNew = true;
    let ferme = 0;
    assert.equal(dismissModal(() => { ferme++; }, { objects: [] }), false);
    assert.equal(ferme, 1, 'fermeture inconditionnelle');
  });
});
