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
import { readFileSync } from 'node:fs';

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
  openPersonaEditor, closePersonaEditor, isPersonaEditorOpen, personaEditorTarget,
  personaEditorInitialJoints, resetPersonaEditorDraft, setPersonaEditorJointDeg,
  togglePersonaEditorHandle, applyPersonaEditorPose, personaEditorPoseLabel,
  savePersonaEditorPose, renamePersonaEditorPose, deletePersonaEditorPose,
  personaEditorPoseUsage, applyPersonaEditorToModal, poseKeyStillInLibrary,
  personaEditorHasChanges, personaEditorTitle3D,
  setPersonaEditorOrbit, resetPersonaEditorCamera,
  PERSONA_EDITOR_FRONT_ROT_Y,
  beginPersonaEditorJointDrag, applyPersonaEditorJointDrag,
  focusPersonaEditorHandle, cyclePersonaEditorSpec, personaEditorActiveSpec,
  personaEditorDragHint,
  PERSONA_EDITOR_ROT_X_MAX,
} from '../src/events.js';
import { smoothTracéPath3D, worldPointToPageXY3D, wallOpeningWorldPosOnTracé3D } from '../src/scene3d.js';
import { S } from '../src/state.js';
import { normalizePoses3D, resyncIdCounter } from '../src/io.js';
import { GROUND_Y_DEFAULT_3D, POSE_3D, POSE_HANDLES } from '../src/constants.js';
import { readPoseSliderDeg3D, poseSliderSpecs3D } from '../src/utils.js';

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

// ─────────────────────────────────────────────────────────────────────────────
// Fix 48 — machine à états de l'éditeur de Personnage.
//
// Il RECOUVRE ce qui est affiché au lieu de le remplacer : contrairement au mode Scène, ni la Page
// courante, ni S.editingSceneId, ni la sélection ne bougent. Fermer rend donc la main exactement à
// ce qui était là, sans avoir à reconstruire un état de retour.
// ─────────────────────────────────────────────────────────────────────────────
describe('éditeur de Personnage — ouverture et fermeture (Fix 48)', () => {
  const perso = () => ({ id: 'e1', type: 'perso', position: 'assis' });
  beforeEach(() => { closePersonaEditor(); S.editingSceneId = null; S.selectedId = null; });

  test('fermé par défaut, ouvert après appel, refermé ensuite', () => {
    assert.equal(isPersonaEditorOpen(), false);
    openPersonaEditor(perso());
    assert.equal(isPersonaEditorOpen(), true);
    closePersonaEditor();
    assert.equal(isPersonaEditorOpen(), false);
  });

  test('avec une cible : le brouillon part des articulations effectives de l\'Élément', () => {
    const o = perso();
    const draft = openPersonaEditor(o);
    assert.deepEqual(draft, POSE_3D.assis, 'part de la pose de l\'Élément');
    assert.equal(S.personaEditorTargetId, 'e1');
  });

  // L'invariant central : partager l'objet ferait que bouger un curseur modifierait le Personnage
  // AVANT tout « Appliquer », et la modale qui a ouvert l'éditeur n'aurait plus rien à annuler.
  test('RÉGRESSION : le brouillon n\'est jamais l\'objet d\'articulations de l\'Élément', () => {
    const o = { ...perso(), joints3d: { lElbow: 0.1, lShoulder: { x: 0, z: 0 } } };
    const draft = openPersonaEditor(o);
    assert.notEqual(draft, o.joints3d, 'pas la même référence');
    assert.notEqual(draft.lShoulder, o.joints3d.lShoulder, 'copie profonde, pas de surface');
    draft.lElbow = 0.9;
    draft.lShoulder.x = 0.5;
    assert.equal(o.joints3d.lElbow, 0.1, 'l\'Élément n\'a pas bougé');
    assert.equal(o.joints3d.lShoulder.x, 0, 'même en profondeur');
  });

  test('sans cible : Personnage par défaut, aucune cible enregistrée', () => {
    const draft = openPersonaEditor(null);
    assert.equal(isPersonaEditorOpen(), true, 'l\'absence de cible est un mode légitime');
    assert.equal(S.personaEditorTargetId, null);
    assert.deepEqual(draft, POSE_3D.debout);
  });

  test('RÉGRESSION : ouvrir ne touche ni la Scène en cours, ni la sélection', () => {
    // C'est ce qui permet de refermer sans reconstruire l'état de retour.
    S.editingSceneId = 'sc1';
    S.selectedId = 'panel9';
    openPersonaEditor(perso());
    assert.equal(S.editingSceneId, 'sc1', 'la Scène reste ouverte derrière');
    assert.equal(S.selectedId, 'panel9', 'la sélection est préservée');
    closePersonaEditor();
    assert.equal(S.editingSceneId, 'sc1', 'et après fermeture aussi');
    assert.equal(S.selectedId, 'panel9');
  });

  test('fermer efface la cible et le brouillon', () => {
    openPersonaEditor(perso());
    closePersonaEditor();
    assert.equal(S.personaEditorTargetId, null);
    assert.equal(S.personaEditorDraft, null);
  });

  test('personaEditorTarget retrouve l\'Élément dans la Page', () => {
    const o = perso();
    const page = { objects: [o] };
    openPersonaEditor(o);
    assert.equal(personaEditorTarget(page), o);
  });

  test('cible supprimée pendant l\'édition : null, pas un objet fantôme', () => {
    const o = perso();
    openPersonaEditor(o);
    assert.equal(personaEditorTarget({ objects: [] }), null, 'relu à la demande');
  });

  test('personaEditorTarget est null en mode autonome et quand l\'éditeur est fermé', () => {
    openPersonaEditor(null);
    assert.equal(personaEditorTarget({ objects: [] }), null, 'mode autonome');
    closePersonaEditor();
    assert.equal(personaEditorTarget({ objects: [perso()] }), null, 'éditeur fermé');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 50 — retour à la modale. Ouvrir l'éditeur depuis la modale Personnage la MASQUE ; la
// refermer doit la retrouver. Sans ça, on perd le contexte de travail et, à terme, le bouton
// « Appliquer » que cette modale portera.
// ─────────────────────────────────────────────────────────────────────────────
describe('éditeur de Personnage — retour à la modale (Fix 50)', () => {
  const perso = () => ({ id: 'e1', type: 'perso', position: 'assis' });
  beforeEach(() => { closePersonaEditor(); S.selectedId = null; S.editingSceneId = null; });

  test('ouvert depuis la modale : le drapeau de retour est armé', () => {
    openPersonaEditor(perso(), true);
    assert.equal(S.personaEditorFromModal, true);
  });

  test('ouvert sans modale : pas de retour à armer', () => {
    openPersonaEditor(perso(), false);
    assert.equal(S.personaEditorFromModal, false);
    openPersonaEditor(perso());
    assert.equal(S.personaEditorFromModal, false, 'argument omis = pas de retour');
  });

  test('fermer signale le retour à la modale, une seule fois', () => {
    // Sans ce désarmement, refermer un éditeur ouvert en autonome rouvrirait la modale d'un
    // Personnage édité bien plus tôt.
    openPersonaEditor(perso(), true);
    assert.equal(closePersonaEditor(), true, 'le retour est signalé');
    assert.equal(closePersonaEditor(), false, 'et une seule fois');
  });

  test('ouvert en autonome : fermer ne demande aucun retour', () => {
    openPersonaEditor(null);
    assert.equal(closePersonaEditor(), false);
  });

  test('le cadrage repart à neuf à chaque ouverture', () => {
    openPersonaEditor(perso(), true);
    S.personaEditorZoom = 4;
    S.personaEditorPan = { x: 9, y: 9 };
    closePersonaEditor();
    openPersonaEditor(perso(), true);
    assert.equal(S.personaEditorZoom, 0.8, 'zoom d\'ouverture');
    assert.deepEqual(S.personaEditorPan, { x: 0, y: 0 });
  });

  test('l\'aller-retour ne touche ni la sélection ni la Scène', () => {
    S.selectedId = 'panel9';
    S.editingSceneId = 'sc1';
    openPersonaEditor(perso(), true);
    closePersonaEditor();
    assert.equal(S.selectedId, 'panel9');
    assert.equal(S.editingSceneId, 'sc1');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 51 — brouillon d'articulations du panneau de réglage fin.
//
// La règle qui structure toute la phase : les curseurs écrivent dans S.personaEditorDraft et NULLE
// PART ailleurs. C'est ce qui rend l'édition annulable, et c'est exactement le manquement que le
// Fix 35 a dû corriger ailleurs (une modale qui modifiait son objet avant validation n'avait plus
// rien à annuler). D'où les assertions insistantes ci-dessous sur l'intégrité de l'Élément cible.
//
// Le rendu du canevas n'est pas couvert : il passe par WebGL, injoignable sous Node (cf.
// docs/methode-de-test.md). D'où la séparation entre setPersonaEditorJointDeg, qui décide, et le
// gestionnaire de curseur, qui redessine.
// ─────────────────────────────────────────────────────────────────────────────
describe('éditeur de Personnage — réglage fin des articulations (Fix 51)', () => {
  const torso = { key: 'torso', field: 'torsoRotX', axis: null, suffix: '' };
  const shoulderX = { key: 'lShoulder:x', field: 'lShoulder', axis: 'x', suffix: '' };
  const shoulderZ = { key: 'lShoulder:z', field: 'lShoulder', axis: 'z', suffix: '' };
  const perso = (joints) => ({ id: 'e1', type: 'perso', position: 'assis', joints3d: joints });
  beforeEach(() => { closePersonaEditor(); });

  test('un curseur écrit dans le brouillon', () => {
    openPersonaEditor(perso());
    setPersonaEditorJointDeg(torso, 30);
    assert.equal(Math.round(S.personaEditorDraft.torsoRotX * 180 / Math.PI), 30);
  });

  test('RÉGRESSION : bouger un curseur ne touche PAS l\'Élément', () => {
    // Le cœur de la phase. Sans cela, « Annuler » n'aurait plus rien à annuler.
    const o = perso({ torsoRotX: 0 });
    openPersonaEditor(o);
    setPersonaEditorJointDeg(torso, 75);
    assert.equal(o.joints3d.torsoRotX, 0, 'les articulations de l\'Élément sont intactes');
  });

  test('éditeur fermé : un curseur n\'écrit nulle part', () => {
    // Les gestionnaires de curseurs sont installés une fois pour toutes au chargement : rien ne les
    // débranche à la fermeture. C'est donc ici que la garde doit tenir.
    openPersonaEditor(perso());
    closePersonaEditor();
    assert.equal(setPersonaEditorJointDeg(torso, 30), null);
    assert.equal(S.personaEditorDraft, null);
  });

  test('les deux axes d\'une rotule coexistent dans le brouillon', () => {
    openPersonaEditor(perso());
    setPersonaEditorJointDeg(shoulderX, 20);
    setPersonaEditorJointDeg(shoulderZ, -40);
    assert.equal(Math.round(S.personaEditorDraft.lShoulder.x * 180 / Math.PI), 20);
    assert.equal(Math.round(S.personaEditorDraft.lShoulder.z * 180 / Math.PI), -40);
  });

  test('personaEditorInitialJoints : sans cible, la pose debout — et une COPIE', () => {
    const j = personaEditorInitialJoints(null);
    assert.deepEqual(j, POSE_3D.debout);
    assert.notEqual(j, POSE_3D.debout, 'copie : modifier le brouillon ne doit pas altérer la pose de référence');
  });

  test('COHÉRENCE : l\'ouverture part exactement de personaEditorInitialJoints', () => {
    // Deux façons de calculer « la pose de départ » finiraient par diverger, et réinitialiser ne
    // ramènerait plus là où l'ouverture avait mis les choses. C'est la classe de bug la plus
    // fréquente de ce dépôt (Fix 28/30/31/31b/33).
    const o = perso({ torsoRotX: 0.5 });
    const draft = openPersonaEditor(o);
    assert.deepEqual(draft, personaEditorInitialJoints(o));
  });

  test('réinitialiser ramène le brouillon à la pose d\'ouverture', () => {
    const o = perso({ torsoRotX: 0.5 });
    const page = { objects: [o] };
    openPersonaEditor(o);
    setPersonaEditorJointDeg(torso, 80);
    assert.notEqual(Math.round(S.personaEditorDraft.torsoRotX * 100), 50);
    resetPersonaEditorDraft(page);
    assertClose(S.personaEditorDraft.torsoRotX, 0.5, 'retour à la valeur de l\'Élément');
  });

  test('réinitialiser ne réutilise pas l\'objet de l\'Élément', () => {
    // Réinitialiser puis bouger un curseur écrirait dans l'Élément si le brouillon était partagé —
    // le bug annulé par le Fix 35, réintroduit par une porte dérobée.
    const o = perso({ torsoRotX: 0.5 });
    openPersonaEditor(o);
    resetPersonaEditorDraft({ objects: [o] });
    setPersonaEditorJointDeg(torso, 80);
    assertClose(o.joints3d.torsoRotX, 0.5, 'l\'Élément n\'a pas bougé');
  });

  test('éditeur fermé : réinitialiser ne fait rien', () => {
    assert.equal(resetPersonaEditorDraft({ objects: [] }), null);
  });

  test('mode autonome : réinitialiser ramène à la pose debout', () => {
    openPersonaEditor(null);
    setPersonaEditorJointDeg(torso, 80);
    resetPersonaEditorDraft({ objects: [] });
    assert.deepEqual(S.personaEditorDraft, POSE_3D.debout);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 52 — sélection d'une poignée d'articulation dans l'éditeur.
//
// S.personaEditorHandleId est DISTINCT de S.selectedPoseHandle, qui appartient à l'aperçu de la
// modale. La modale n'est pas fermée pendant l'édition, seulement masquée (cf. Fix 50) : partager la
// sélection ferait réapparaître, à la fermeture, une modale avec une articulation surlignée que
// l'utilisateur n'y a jamais désignée.
//
// Le dessin des poignées n'est pas couvert (WebGL), ni la projection 3D→écran. Ce qui l'est : la
// règle de bascule, et le fait que les deux sélections restent étanches.
// ─────────────────────────────────────────────────────────────────────────────
describe('éditeur de Personnage — sélection d\'une poignée (Fix 52)', () => {
  beforeEach(() => { closePersonaEditor(); S.selectedPoseHandle = null; });

  test('sélectionner, puis recliquer la même poignée la désélectionne', () => {
    openPersonaEditor(null);
    assert.equal(togglePersonaEditorHandle('lElbow'), 'lElbow');
    assert.equal(togglePersonaEditorHandle('lElbow'), null, 'second clic : on relâche');
  });

  test('cliquer une AUTRE poignée remplace la sélection au lieu de l\'annuler', () => {
    openPersonaEditor(null);
    togglePersonaEditorHandle('lElbow');
    assert.equal(togglePersonaEditorHandle('rKnee'), 'rKnee');
  });

  test('l\'ouverture ne présélectionne rien', () => {
    openPersonaEditor(null);
    togglePersonaEditorHandle('head');
    closePersonaEditor();
    openPersonaEditor(null);
    assert.equal(S.personaEditorHandleId, null,
      'hériter de la session précédente surlignerait un point non choisi');
  });

  test('fermer efface la sélection', () => {
    openPersonaEditor(null);
    togglePersonaEditorHandle('head');
    closePersonaEditor();
    assert.equal(S.personaEditorHandleId, null);
  });

  test('ÉTANCHÉITÉ : la sélection de l\'éditeur ne touche pas celle de la modale', () => {
    // La modale reste ouverte derrière l'éditeur ; sa poignée surlignée doit être exactement celle
    // qu'on y avait laissée au retour.
    S.selectedPoseHandle = { id: 'torso' };
    openPersonaEditor(null);
    togglePersonaEditorHandle('rKnee');
    assert.equal(S.selectedPoseHandle.id, 'torso', 'la modale n\'a pas bougé');
    closePersonaEditor();
    assert.equal(S.selectedPoseHandle.id, 'torso', 'et pas davantage après fermeture');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 54 — application d'une pose depuis l'éditeur.
//
// LA décision de toute la fonctionnalité : appliquer une pose COPIE ses angles dans le brouillon.
// Aucun Personnage ne dépend de la bibliothèque — supprimer une pose, ou ouvrir le projet sur une
// machine qui ne l'a pas, ne change l'allure de personne (cf. docs/donnees-persistees.md).
//
// `position` reste une ÉTIQUETTE : bouger un curseur après avoir appliqué « Assis » ne l'efface
// pas, c'est resolvePoseLabel3D qui en déduit « Assis (modifié) » en comparant les valeurs. On
// garde ainsi la provenance, qui est une information utile.
// ─────────────────────────────────────────────────────────────────────────────
describe('éditeur de Personnage — appliquer une pose (Fix 54)', () => {
  const torso = { key: 'torso', field: 'torsoRotX', axis: null, suffix: '' };
  beforeEach(() => { closePersonaEditor(); S.poses = []; });

  test('appliquer une pose intégrée copie ses angles dans le brouillon', () => {
    openPersonaEditor(null);
    assert.equal(applyPersonaEditorPose('assis'), true);
    assert.deepEqual(S.personaEditorDraft, POSE_3D.assis);
    assert.equal(S.personaEditorPoseKey, 'assis');
  });

  test('RÉGRESSION : c\'est une COPIE, pas une référence à POSE_3D', () => {
    // Sans copie, bouger un curseur après avoir appliqué « Assis » modifierait la pose intégrée
    // pour toute l'application, définitivement et pour tous les Personnages.
    openPersonaEditor(null);
    applyPersonaEditorPose('assis');
    setPersonaEditorJointDeg(torso, 77);
    assert.notEqual(Math.round((POSE_3D.assis.torsoRotX || 0) * 180 / Math.PI), 77,
      'la pose intégrée est intacte');
  });

  test('appliquer une pose du projet la trouve par son id', () => {
    S.poses = [{ id: 'pose1', name: 'Salut', skeleton: 'humain', joints: { torsoRotX: 1.1 } }];
    openPersonaEditor(null);
    assert.equal(applyPersonaEditorPose('pose1'), true);
    assertClose(S.personaEditorDraft.torsoRotX, 1.1, 'angles de la pose du projet');
  });

  test('RÉGRESSION : une pose introuvable ne touche à RIEN', () => {
    // Écrire une pose de repli écraserait le travail en cours par quelque chose que l'utilisateur
    // n'a pas demandé — le pire comportement possible ici.
    openPersonaEditor(null);
    setPersonaEditorJointDeg(torso, 42);
    const avant = JSON.stringify(S.personaEditorDraft);
    assert.equal(applyPersonaEditorPose('nexiste_pas'), false);
    assert.equal(JSON.stringify(S.personaEditorDraft), avant, 'brouillon intact');
    assert.equal(S.personaEditorPoseKey, 'debout', 'et l\'étiquette n\'a pas bougé non plus');
  });

  test('éditeur fermé : aucune pose ne s\'applique', () => {
    assert.equal(applyPersonaEditorPose('assis'), false);
  });

  test('l\'ouverture reprend la pose déclarée par l\'Élément', () => {
    openPersonaEditor({ id: 'e1', type: 'perso', position: 'combat' });
    assert.equal(S.personaEditorPoseKey, 'combat');
  });

  test('COHÉRENCE : sans cible, l\'étiquette et les angles désignent la même pose', () => {
    // personaEditorInitialJoints copie POSE_3D.debout ; l'étiquette doit dire « debout ». Deux
    // valeurs par défaut posées à deux endroits finiraient par diverger.
    openPersonaEditor(null);
    assert.equal(S.personaEditorPoseKey, 'debout');
    assert.deepEqual(S.personaEditorDraft, POSE_3D.debout);
  });

  test('l\'étiquette suit la pose appliquée, et signale une retouche', () => {
    openPersonaEditor(null);
    applyPersonaEditorPose('assis');
    assert.equal(personaEditorPoseLabel().modified, false, 'juste appliquée : conforme');
    setPersonaEditorJointDeg(torso, 88);
    const info = personaEditorPoseLabel();
    assert.equal(info.modified, true, 'retouchée');
    assert.match(info.label, /modifié/, 'et l\'utilisateur en est informé');
    assert.equal(S.personaEditorPoseKey, 'assis', 'la provenance est conservée, pas effacée');
  });

  test('réinitialiser ramène AUSSI l\'étiquette à la pose d\'ouverture', () => {
    // Sinon le panneau afficherait le nom de la dernière pose appliquée alors que les angles sont
    // revenus à ceux de l'Élément — deux affichages qui se contredisent.
    const o = { id: 'e1', type: 'perso', position: 'combat', joints3d: { torsoRotX: 0.3 } };
    openPersonaEditor(o);
    applyPersonaEditorPose('assis');
    resetPersonaEditorDraft({ objects: [o] });
    assert.equal(S.personaEditorPoseKey, 'combat');
  });

  test('fermer efface l\'étiquette', () => {
    openPersonaEditor(null);
    applyPersonaEditorPose('assis');
    closePersonaEditor();
    assert.equal(S.personaEditorPoseKey, null);
  });

  test('les deux poses allongées, ajoutées à POSE_3D par draw.js, sont applicables', () => {
    // draw.js est chargé par la chaîne d'imports de ce fichier de test (events.js en dépend). Sans
    // lui, POSE_3D n'aurait que 13 entrées et ces deux poses seraient introuvables — le genre
    // d'écart entre les tests et l'application qui passe inaperçu longtemps.
    openPersonaEditor(null);
    for (const key of ['allonge', 'vaincu']) {
      assert.equal(applyPersonaEditorPose(key), true, key);
      assert.equal(S.personaEditorDraft.lieFlat, true, `${key} : figure couchée`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 55 — bibliothèque de poses en écriture.
//
// LA propriété à ne pas casser : supprimer une pose ne déforme AUCUN Personnage. Ses angles ont été
// copiés chez lui à l'application (Fix 54) ; au pire son étiquette devient « inconnue ». C'est ce
// qui rend la suppression sans danger, et ce que le test de régression ci-dessous surveille.
// ─────────────────────────────────────────────────────────────────────────────
describe('éditeur de Personnage — bibliothèque en écriture (Fix 55)', () => {
  const torso = { key: 'torso', field: 'torsoRotX', axis: null, suffix: '' };
  beforeEach(() => { closePersonaEditor(); S.poses = []; });

  test('enregistrer ajoute une pose et la prend comme référence', () => {
    openPersonaEditor(null);
    setPersonaEditorJointDeg(torso, 40);
    const pose = savePersonaEditorPose('Salut militaire');
    assert.equal(S.poses.length, 1);
    assert.equal(pose.name, 'Salut militaire');
    assert.equal(pose.skeleton, 'humain', 'squelette tagué dès l\'enregistrement');
    assert.equal(S.personaEditorPoseKey, pose.id);
    assert.equal(personaEditorPoseLabel().modified, false,
      'à peine enregistrée, la pose correspond au brouillon');
  });

  test('RÉGRESSION : la pose enregistrée fige les angles, elle ne suit pas le brouillon', () => {
    // Sans copie, continuer à bouger les curseurs après l'enregistrement modifierait la pose
    // enregistrée en même temps : elle ne figerait rien.
    openPersonaEditor(null);
    setPersonaEditorJointDeg(torso, 40);
    const pose = savePersonaEditorPose('Fig');
    setPersonaEditorJointDeg(torso, 90);
    assert.equal(Math.round(pose.joints.torsoRotX * 180 / Math.PI), 40, 'pose figée à 40°');
    assert.equal(personaEditorPoseLabel().modified, true, 'et le brouillon est signalé modifié');
  });

  test('deux poses enregistrées ont des ids DIFFÉRENTS', () => {
    // L'appariement se fait par id : deux poses de même id rendraient l'une d'elles inatteignable,
    // et un Personnage pourrait se retrouver avec la mauvaise.
    openPersonaEditor(null);
    const a = savePersonaEditorPose('A');
    const b = savePersonaEditorPose('B');
    assert.notEqual(a.id, b.id);
  });

  test('sans nom fourni : un nom par défaut, jamais un bouton vide', () => {
    openPersonaEditor(null);
    assert.equal(savePersonaEditorPose('').name, 'Pose 1');
    assert.equal(savePersonaEditorPose(null).name, 'Pose 2');
  });

  test('éditeur fermé : rien ne s\'enregistre', () => {
    assert.equal(savePersonaEditorPose('X'), null);
    assert.equal(S.poses.length, 0);
  });

  test('renommer garde l\'id, donc l\'étiquette reste juste', () => {
    openPersonaEditor(null);
    const pose = savePersonaEditorPose('Avant');
    assert.equal(renamePersonaEditorPose(pose.id, 'Après'), true);
    assert.equal(S.poses[0].id, pose.id, 'id inchangé');
    assert.equal(personaEditorPoseLabel().label, 'Après',
      'le Personnage qui cite cette pose voit le nouveau nom');
  });

  test('renommage refusé : nom vide, ou pose inexistante', () => {
    openPersonaEditor(null);
    const pose = savePersonaEditorPose('Nom');
    assert.equal(renamePersonaEditorPose(pose.id, '  '), false);
    assert.equal(renamePersonaEditorPose('inexistante', 'X'), false);
    assert.equal(S.poses[0].name, 'Nom', 'inchangé dans les deux cas');
  });

  test('RÉGRESSION : supprimer une pose ne change AUCUN Personnage', () => {
    // Le cœur de la conception. Un Personnage porte ses angles ; la bibliothèque est un confort
    // d'auteur dont aucun projet ne dépend.
    openPersonaEditor(null);
    setPersonaEditorJointDeg(torso, 55);
    const pose = savePersonaEditorPose('Éphémère');
    const perso = { id: 'e1', type: 'perso', position: pose.id,
                    joints3d: JSON.parse(JSON.stringify(pose.joints)) };
    const anglesAvant = JSON.stringify(perso.joints3d);
    assert.equal(deletePersonaEditorPose(pose.id), true);
    assert.equal(S.poses.length, 0);
    assert.equal(JSON.stringify(perso.joints3d), anglesAvant, 'angles intacts');
    assert.equal(perso.position, pose.id, 'la référence n\'est pas réécrite non plus');
  });

  test('après suppression, l\'étiquette du Personnage devient « inconnue » sans rien détruire', () => {
    // On garde `position` tel quel : rouvrir le projet sur la machine qui possède la bibliothèque
    // doit permettre au nom de réapparaître tout seul.
    openPersonaEditor(null);
    const pose = savePersonaEditorPose('Éphémère');
    deletePersonaEditorPose(pose.id);
    const info = personaEditorPoseLabel();
    assert.equal(info.known, false);
    assert.match(info.label, /inconnue/);
    assert.equal(S.personaEditorPoseKey, pose.id, 'la provenance est conservée, pas effacée');
  });

  test('suppression refusée pour une pose inexistante', () => {
    assert.equal(deletePersonaEditorPose('inexistante'), false);
  });

  test('CYCLE COMPLET : enregistrer → sérialiser → recharger → appliquer', () => {
    // Le test qui compte pour l'utilisateur : une pose créée aujourd'hui doit être applicable après
    // avoir fermé et rouvert le projet. Il traverse les quatre champs persistés.
    openPersonaEditor(null);
    setPersonaEditorJointDeg(torso, 63);
    const pose = savePersonaEditorPose('Persistante');
    const json = JSON.parse(JSON.stringify({ poses: S.poses }));
    S.poses = normalizePoses3D(json.poses);
    assert.equal(S.poses.length, 1, 'la pose a survécu à l\'aller-retour');
    openPersonaEditor(null);
    assert.equal(applyPersonaEditorPose(pose.id), true);
    assert.equal(Math.round(S.personaEditorDraft.torsoRotX * 180 / Math.PI), 63);
  });

  test('RÉGRESSION : après rechargement, une nouvelle pose ne réutilise pas un id existant', () => {
    // resyncIdCounter (io.js) réaligne le compteur sur les ids du fichier. Sans lui, newId('pose')
    // repartirait de zéro et la nouvelle pose écraserait la référence d'un Personnage existant.
    S.idCounter = 0;
    const charge = { poses: [{ id: 'pose7', name: 'Ancienne', skeleton: 'humain', joints: { a: 1 } }] };
    S.poses = normalizePoses3D(charge.poses);
    resyncIdCounter(charge);
    openPersonaEditor(null);
    const nouvelle = savePersonaEditorPose('Nouvelle');
    assert.notEqual(nouvelle.id, 'pose7');
    assert.equal(S.poses.filter(p => p.id === 'pose7').length, 1, 'l\'ancienne est intacte');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 56 — usage d'une pose dans le Projet, pour la confirmation de suppression.
//
// Le gestionnaire de clic lui-même n'est pas testable (confirmAction manipule le DOM), d'où la
// séparation : personaEditorPoseUsage décide, le bouton se contente de demander. Un comptage faux
// ne fait rien planter — il fait taire l'avertissement là où il fallait avertir, ce qui est
// précisément ce qu'on ne verrait pas.
// ─────────────────────────────────────────────────────────────────────────────
describe('éditeur de Personnage — usage d\'une pose dans le Projet (Fix 56)', () => {
  const perso = (position) => ({ id: 'e' + Math.random(), type: 'perso', position });
  beforeEach(() => { S.tomes = []; S.scenes = []; });

  test('compte les Personnages des Tomes', () => {
    S.tomes = [{ id: 't1', pages: [{ id: 'p1', objects: [perso('pose1'), perso('debout')] }] }];
    assert.equal(personaEditorPoseUsage('pose1'), 1);
  });

  test('RÉGRESSION : compte AUSSI ceux des Scènes', () => {
    // Les Scènes sont une racine distincte de S.tomes. Les oublier ferait disparaître
    // l'avertissement pour une pose pourtant utilisée.
    S.scenes = [{ id: 'sc1', pages: [{ objects: [perso('pose1')] }] }];
    assert.equal(personaEditorPoseUsage('pose1'), 1);
  });

  test('pose inutilisée : zéro, donc aucune confirmation à demander', () => {
    // Demander confirmation à chaque suppression userait l'attention et ferait cliquer
    // « Confirmer » sans lire, y compris le jour où ça compte.
    S.tomes = [{ id: 't1', pages: [{ id: 'p1', objects: [perso('debout')] }] }];
    assert.equal(personaEditorPoseUsage('pose1'), 0);
  });

  test('projet vide : zéro', () => {
    assert.equal(personaEditorPoseUsage('pose1'), 0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 59 — supprimer mémorise, et toute suppression est confirmée.
// ─────────────────────────────────────────────────────────────────────────────
describe('éditeur de Personnage — la suppression est mémorisée (Fix 59)', () => {
  beforeEach(() => { closePersonaEditor(); S.poses = []; S.dismissedPoses = []; });

  test('RÉGRESSION : supprimer enregistre l\'id dans les suppressions', () => {
    // Constaté par mutation : sans cette assertion, retirer l'appel à setDismissedPoses passait
    // inaperçu — et la pose serait revenue au premier vieux projet ouvert.
    openPersonaEditor(null);
    const pose = savePersonaEditorPose('Éphémère');
    deletePersonaEditorPose(pose.id);
    assert.deepEqual(S.dismissedPoses, [pose.id]);
  });

  test('une suppression refusée (pose inexistante) ne mémorise rien', () => {
    openPersonaEditor(null);
    assert.equal(deletePersonaEditorPose('inexistante'), false);
    assert.deepEqual(S.dismissedPoses, []);
  });

  test('plusieurs suppressions s\'accumulent sans doublon', () => {
    openPersonaEditor(null);
    const a = savePersonaEditorPose('A');
    const b = savePersonaEditorPose('B');
    deletePersonaEditorPose(a.id);
    deletePersonaEditorPose(b.id);
    deletePersonaEditorPose(a.id); // déjà supprimée : refusée, et rien de dupliqué
    assert.deepEqual(S.dismissedPoses, [a.id, b.id]);
  });
});

describe('Fix 59 — CÂBLAGE : toute suppression passe par une confirmation', () => {
  // Le gestionnaire de clic n'est pas testable (confirmAction manipule le DOM). Constaté par
  // mutation : réintroduire le `if (used > 0)` du Fix 56 — donc un clic unique irréversible sur une
  // pose inutilisée — traverse la suite sans faire échouer un test. Inspection de source, comme pour
  // l'atomicité de bump-version.mjs et le câblage du Fix 53.
  test('la confirmation n\'est PAS conditionnée à l\'usage de la pose', () => {
    const src = readFileSync(new URL('../src/events.js', import.meta.url), 'utf8');
    const i = src.indexOf('deleteBtn.onclick');
    assert.ok(i > 0, 'gestionnaire introuvable — a-t-il été renommé ?');
    const corps = src.slice(i, src.indexOf('const resetBtn', i));
    assert.ok(corps.includes('confirmAction'), 'une confirmation est bien demandée');
    assert.doesNotMatch(corps, /if\s*\(\s*used\s*>\s*0\s*\)\s*\{[\s\S]*confirmAction/,
      'la confirmation ne doit plus être réservée aux poses utilisées');
    assert.match(corps, /used > 0[\s\S]{0,120}\?/,
      'le message reste différencié selon l\'usage, sans conditionner la confirmation');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 60 — « Appliquer » : de l'éditeur vers le BROUILLON de la modale.
//
// La règle qui structure toute la phase : jamais dans l'Élément. Écrire dans S.modalTarget donnerait
// une modale dont « Annuler » n'annule plus — le défaut exact que le Fix 35 a corrigé ailleurs.
// ─────────────────────────────────────────────────────────────────────────────
describe('éditeur de Personnage — Appliquer (Fix 60)', () => {
  const torso = { key: 'torso', field: 'torsoRotX', axis: null, suffix: '' };
  const perso = () => ({ id: 'e1', type: 'perso', position: 'debout', joints3d: { torsoRotX: 0 } });
  beforeEach(() => {
    closePersonaEditor(); S.poses = []; S.modalDraftJoints = null; S.modalTarget = null;
  });

  test('les angles de l\'éditeur arrivent dans le brouillon de la modale', () => {
    const o = perso();
    S.modalTarget = o;
    openPersonaEditor(o, true);
    setPersonaEditorJointDeg(torso, 47);
    const res = applyPersonaEditorToModal();
    assert.ok(res);
    assert.equal(Math.round(S.modalDraftJoints.torsoRotX * 180 / Math.PI), 47);
  });

  test('RÉGRESSION : Appliquer ne touche PAS l\'Élément', () => {
    // Le cœur de la phase. C'est descModalSave, et lui seul, qui recopie le brouillon dans
    // l'Élément — donc « Annuler » continue d'annuler.
    const o = perso();
    S.modalTarget = o;
    openPersonaEditor(o, true);
    setPersonaEditorJointDeg(torso, 47);
    applyPersonaEditorToModal();
    assert.equal(o.joints3d.torsoRotX, 0, 'les articulations de l\'Élément sont intactes');
  });

  test('RÉGRESSION : le brouillon est une COPIE du brouillon de l\'éditeur', () => {
    // Partager l'objet ferait que continuer à bouger les curseurs après Appliquer modifierait la
    // modale à distance, alors que l'éditeur est censé être refermé.
    S.modalTarget = perso();
    openPersonaEditor(S.modalTarget, true);
    setPersonaEditorJointDeg(torso, 47);
    applyPersonaEditorToModal();
    setPersonaEditorJointDeg(torso, 90);
    assert.equal(Math.round(S.modalDraftJoints.torsoRotX * 180 / Math.PI), 47);
  });

  test('la pose de référence est remontée avec les angles', () => {
    S.modalTarget = perso();
    openPersonaEditor(S.modalTarget, true);
    applyPersonaEditorPose('assis');
    assert.equal(applyPersonaEditorToModal().key, 'assis');
  });

  test('mode autonome : Appliquer ne fait RIEN', () => {
    // Sans modale derrière, il n'y a rien à alimenter — et c'est aussi la condition d'affichage du
    // bouton (cf. syncPersonaEditorDom).
    openPersonaEditor(null, false);
    setPersonaEditorJointDeg(torso, 47);
    assert.equal(applyPersonaEditorToModal(), null);
    assert.equal(S.modalDraftJoints, null, 'aucun brouillon de modale n\'est fabriqué');
  });

  test('éditeur fermé : Appliquer ne fait rien', () => {
    assert.equal(applyPersonaEditorToModal(), null);
  });

  test('quitter sans appliquer n\'a aucun effet (5.3)', () => {
    S.modalTarget = perso();
    S.modalDraftJoints = { torsoRotX: 0.1 };
    openPersonaEditor(S.modalTarget, true);
    setPersonaEditorJointDeg(torso, 88);
    closePersonaEditor();
    assert.deepEqual(S.modalDraftJoints, { torsoRotX: 0.1 }, 'le brouillon de la modale est intact');
  });
});

describe('poseKeyStillInLibrary — garde contre le piège du <select> (Fix 60)', () => {
  beforeEach(() => { S.poses = []; });

  test('pose présente : sa clé est reportable', () => {
    S.poses = [{ id: 'pose1', name: 'X', joints: {} }];
    assert.equal(poseKeyStillInLibrary('pose1'), 'pose1');
  });

  test('RÉGRESSION : pose supprimée depuis l\'éditeur → null', () => {
    // Le piège du Fix 44 par une autre porte : affecter à un <select> une valeur absente de ses
    // options le laisse VIDE, et la sauvegarde suivante écrirait une chaîne vide dans `position`,
    // détruisant le nom. Mieux vaut garder l'ancienne valeur du champ.
    S.poses = [];
    assert.equal(poseKeyStillInLibrary('pose1'), null);
  });

  test('clé absente : null', () => {
    assert.equal(poseKeyStillInLibrary(null), null);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 61 — « y a-t-il quelque chose à faire ? », qui pilote Réinitialiser et Appliquer.
//
// Le repère est FIGÉ à l'ouverture plutôt que relu depuis l'Élément : « depuis l'ouverture » doit
// vouloir dire exactement ça. Réinitialiser repart du même repère, sans quoi le bouton pourrait
// rester actif juste après avoir été cliqué.
// ─────────────────────────────────────────────────────────────────────────────
describe('éditeur de Personnage — détection des changements (Fix 61)', () => {
  const torso = { key: 'torso', field: 'torsoRotX', axis: null, suffix: '' };
  const perso = () => ({ id: 'e1', type: 'perso', position: 'debout', joints3d: { torsoRotX: 0.2 } });
  beforeEach(() => { closePersonaEditor(); S.poses = []; });

  test('à l\'ouverture : rien à faire', () => {
    openPersonaEditor(perso());
    assert.equal(personaEditorHasChanges(), false);
  });

  test('bouger un curseur : il y a quelque chose à faire', () => {
    openPersonaEditor(perso());
    setPersonaEditorJointDeg(torso, 40);
    assert.equal(personaEditorHasChanges(), true);
  });

  test('COHÉRENCE : réinitialiser ramène à « rien à faire »', () => {
    // Le repère de la réinitialisation et celui de la détection doivent être le MÊME point. S'ils
    // divergeaient, le bouton resterait actif juste après avoir été cliqué.
    const o = perso();
    openPersonaEditor(o);
    setPersonaEditorJointDeg(torso, 40);
    resetPersonaEditorDraft({ objects: [o] });
    assert.equal(personaEditorHasChanges(), false);
  });

  test('revenir à la main sur la valeur d\'origine : plus rien à faire', () => {
    // La détection compare des VALEURS, pas un drapeau « quelque chose a été touché ». Un drapeau
    // laisserait les boutons actifs alors qu'appliquer n'écrirait rien.
    //
    // ⚠️ Ce test a d'abord ÉCHOUÉ, et c'était le code qui avait tort. Les curseurs sont gradués au
    // degré entier alors que les poses sont stockées en radians : mesuré, l'aller-retour sur
    // 0.2 rad donne 0.459° d'écart. La comparaison se fait donc à un demi-degré près — la
    // granularité réelle de l'interface, en dessous de laquelle rien n'est atteignable à la souris.
    openPersonaEditor(perso());               // torsoRotX = 0.2 rad ≈ 11.46°
    const départ = readPoseSliderDeg3D(S.personaEditorDraft, torso);
    setPersonaEditorJointDeg(torso, 40);
    setPersonaEditorJointDeg(torso, départ);
    assert.equal(personaEditorHasChanges(), false);
  });

  test('un écart d\'UN degré compte, lui', () => {
    // La tolérance doit couvrir l'arrondi, pas avaler un vrai réglage : le plus petit mouvement
    // possible d'un curseur vaut 1°, soit le double de la tolérance.
    openPersonaEditor(perso());
    const départ = readPoseSliderDeg3D(S.personaEditorDraft, torso);
    setPersonaEditorJointDeg(torso, départ + 1);
    assert.equal(personaEditorHasChanges(), true);
  });

  test('changer de pose compte, même à angles identiques', () => {
    // Appliquer écrit AUSSI `position` et `positionLabel` : il y a bien un travail à valider.
    S.poses = [{ id: 'jumelle', name: 'Jumelle', skeleton: 'humain', joints: { torsoRotX: 0.2 } }];
    openPersonaEditor(perso());
    applyPersonaEditorPose('jumelle');
    assert.equal(personaEditorHasChanges(), true, 'la pose de référence a changé');
  });

  test('éditeur fermé : rien à faire', () => {
    assert.equal(personaEditorHasChanges(), false);
  });

  test('RÉGRESSION : réinitialiser tient même si l\'Élément a disparu entre-temps', () => {
    // Le repère figé sert ici pour de bon. Un Élément peut être supprimé pendant que l'éditeur est
    // ouvert (l'éditeur RECOUVRE la Page, il ne la verrouille pas) : relire la pose depuis lui
    // retomberait alors sur « debout » et perdrait la référence de travail, alors que le repère,
    // lui, décrit toujours ce qu'on avait à l'ouverture.
    const o = { id: 'e1', type: 'perso', position: 'combat', joints3d: { torsoRotX: 0.7 } };
    openPersonaEditor(o);
    setPersonaEditorJointDeg(torso, 40);
    resetPersonaEditorDraft({ objects: [] });   // l'Élément n'est plus dans la Page
    assertClose(S.personaEditorDraft.torsoRotX, 0.7, 'la pose d\'ouverture est restaurée');
    assert.equal(S.personaEditorPoseKey, 'combat', 'et son étiquette aussi');
    assert.equal(personaEditorHasChanges(), false);
  });

  test('fermer efface le repère', () => {
    // Hygiène d'état : un repère survivant à la fermeture n'a aucun effet visible aujourd'hui
    // (personaEditorHasChanges commence par tester personaEditorOpen), mais laisse traîner les
    // angles d'un Personnage dans S bien après qu'on ait quitté son édition.
    openPersonaEditor({ id: 'e1', type: 'perso', position: 'combat', joints3d: { torsoRotX: 0.7 } });
    closePersonaEditor();
    assert.equal(S.personaEditorBaseline, null);
    assert.equal(S.personaEditorBaselineKey, null);
  });

  test('mode autonome : le repère est la pose debout', () => {
    openPersonaEditor(null);
    assert.equal(personaEditorHasChanges(), false);
    setPersonaEditorJointDeg(torso, 40);
    assert.equal(personaEditorHasChanges(), true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 64 — entrée AUTONOME de l'éditeur (phase 6).
//
// Deux entrées, deux sémantiques : depuis une modale on retouche UN Personnage et « Appliquer »
// existe ; depuis le menu de gauche on compose une pose pour la bibliothèque, sans cible, et le
// bouton est ABSENT — masqué, pas grisé. Le titre nomme le mode, sans quoi cette disparition
// resterait inexpliquée.
// ─────────────────────────────────────────────────────────────────────────────
describe('éditeur de Personnage — titre selon le mode (Fix 64)', () => {
  test('sans cible : le titre annonce le mode pose libre', () => {
    assert.match(personaEditorTitle3D(null), /pose libre/);
    assert.match(personaEditorTitle3D(null, 'en'), /free pose/);
  });

  test('avec une cible nommée : le titre porte son nom', () => {
    assert.match(personaEditorTitle3D({ name: 'Aldo' }), /Aldo/);
    assert.match(personaEditorTitle3D({ name: 'Aldo' }, 'en'), /Aldo/);
  });

  test('cible sans nom : titre nu, pas de tiret orphelin', () => {
    // Un « Éditeur de Personnage — » suivi de rien ferait croire à un libellé tronqué.
    assert.equal(personaEditorTitle3D({ name: '' }), 'Éditeur de Personnage');
    assert.equal(personaEditorTitle3D({ name: '   ' }), 'Éditeur de Personnage');
    assert.equal(personaEditorTitle3D({}), 'Éditeur de Personnage');
  });

  test('les deux modes se distinguent bien', () => {
    // C'est le seul point qui compte vraiment : lire le titre doit suffire à savoir si
    // « Appliquer » a une raison d'exister.
    assert.notEqual(personaEditorTitle3D(null), personaEditorTitle3D({ name: 'Aldo' }));
  });
});

describe('éditeur de Personnage — mode autonome complet (Fix 64)', () => {
  const torso = { key: 'torso', field: 'torsoRotX', axis: null, suffix: '' };
  beforeEach(() => { closePersonaEditor(); S.poses = []; S.dismissedPoses = []; });

  test('ouvert sans cible : éditable, mais rien à appliquer', () => {
    openPersonaEditor(null, false);
    assert.equal(isPersonaEditorOpen(), true);
    assert.equal(personaEditorTarget({ objects: [] }), null);
    setPersonaEditorJointDeg(torso, 35);
    assert.equal(personaEditorHasChanges(), true, 'la pose se compose normalement');
    assert.equal(applyPersonaEditorToModal(), null, 'mais il n\'y a rien à alimenter');
  });

  test('la sortie utile du mode autonome : enregistrer la pose', () => {
    // Sans cible, c'est la seule action qui produit quelque chose de durable.
    openPersonaEditor(null, false);
    setPersonaEditorJointDeg(torso, 35);
    const pose = savePersonaEditorPose('Pose composée');
    assert.equal(S.poses.length, 1);
    assert.equal(Math.round(pose.joints.torsoRotX * 180 / Math.PI), 35);
  });

  test('fermer depuis le mode autonome ne rouvre aucune modale', () => {
    openPersonaEditor(null, false);
    assert.equal(closePersonaEditor(), false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 65/66 — caméra de l'éditeur : orbite au clic droit, sans déplacement ni raccourci.
// ─────────────────────────────────────────────────────────────────────────────
describe('éditeur de Personnage — orbite de la caméra (Fix 65/66)', () => {
  beforeEach(() => { closePersonaEditor(); });

  test('RÉGRESSION : la rotation verticale est bornée à ±85°', () => {
    // Même contrainte que la caméra d'une Case. À 90° pile, la direction de visée devient parallèle
    // au vecteur « haut » de la caméra et l'image bascule brutalement.
    assertClose(setPersonaEditorOrbit(Math.PI, 0).rotX, PERSONA_EDITOR_ROT_X_MAX, 'haut');
    assertClose(setPersonaEditorOrbit(-Math.PI, 0).rotX, -PERSONA_EDITOR_ROT_X_MAX, 'bas');
    assert.ok(PERSONA_EDITOR_ROT_X_MAX < Math.PI / 2, 'strictement sous 90°');
  });

  test('la rotation horizontale n\'est PAS bornée, elle est ramenée dans ]-π, π]', () => {
    // On doit pouvoir faire des tours complets sans que la valeur parte à l'infini, ni que le
    // curseur (-180..180) se retrouve hors de sa plage.
    const r = setPersonaEditorOrbit(0, 3 * Math.PI);
    assert.ok(r.rotY >= -Math.PI && r.rotY <= Math.PI, `${r.rotY} hors plage`);
    assertClose(Math.abs(r.rotY), Math.PI, 'trois demi-tours = un demi-tour', 1e-9);
  });

  test('le cadrage d\'ouverture remet l\'orbite ET le zoom', () => {
    // Le zoom en fait partie : sinon on chercherait pourquoi la figure reste minuscule après
    // avoir rouvert l'éditeur.
    openPersonaEditor(null);
    const zoomOuverture = S.personaEditorZoom;
    setPersonaEditorOrbit(0.7, 2);
    S.personaEditorZoom = 4;
    resetPersonaEditorCamera();
    assert.equal(S.personaEditorCamRotX, 0);
    assert.equal(S.personaEditorCamRotY, PERSONA_EDITOR_FRONT_ROT_Y, 'de face, pas de dos');
    assert.equal(S.personaEditorZoom, zoomOuverture, 'même valeur qu\'à l\'ouverture');
  });

  test('l\'orbite repart de face à chaque ouverture', () => {
    openPersonaEditor(null);
    setPersonaEditorOrbit(0.7, 2);
    closePersonaEditor();
    openPersonaEditor(null);
    assert.equal(S.personaEditorCamRotX, 0);
    assert.equal(S.personaEditorCamRotY, PERSONA_EDITOR_FRONT_ROT_Y);
  });

  test('RÉGRESSION : « de face » veut dire du CÔTÉ DU VISAGE, pas azimut nul', () => {
    // Le piège corrigé au Fix 80 : un azimut nul semble être « la vue par défaut », mais il place
    // la caméra en Z POSITIF (cf. orbitCameraPosition3D) alors que le rig place le visage en Z
    // NÉGATIF — l'éditeur s'ouvrait donc dans le dos du Personnage.
    //
    // Le test CALCULE de quel côté est le visage en lisant rig3d.js, au lieu d'attendre une valeur
    // écrite en dur : si un jour le rig retournait la figure, c'est ici qu'on l'apprendrait.
    const rig = readFileSync(new URL('../src/rig3d.js', import.meta.url), 'utf8');
    const m = /faceMesh\.position\.set\(0,\s*headR,\s*(-?)headR/.exec(rig);
    assert.ok(m, 'position du visage introuvable dans rig3d.js');
    const visageEnZNegatif = m[1] === '-';
    const camZ = Math.cos(PERSONA_EDITOR_FRONT_ROT_Y);
    assert.equal(camZ < 0, visageEnZNegatif,
      'la caméra d\'ouverture doit être du même côté que le visage');
  });

  // Fix 66 — la section Caméra et le raccourci C ont été retirés : le clic droit suffit. Ce test
  // garde la porte fermée, sinon rien n'empêcherait de réintroduire une touche qui vole son
  // raccourci à la Case restée derrière l'éditeur.
  test('RÉGRESSION : aucun raccourci clavier hors Échap dans l\'éditeur', () => {
    const src = readFileSync(new URL('../src/events.js', import.meta.url), 'utf8');
    const i = src.indexOf("if (!S.personaEditorOpen) return;\n    if (e.key === 'Escape')");
    assert.ok(i > 0, 'écouteur clavier de l\'éditeur introuvable');
    const bloc = src.slice(i, src.indexOf('});', i));
    const touches = [...bloc.matchAll(/e\.key === '([^']+)'/g)].map(m => m[1]);
    assert.deepEqual(touches, ['Escape'], `touches captées : ${touches.join(', ')}`);
  });

  test('RÉGRESSION : la sensibilité de l\'orbite est une constante, pas un état réglable', () => {
    // Elle n'était réglable que par le curseur retiré au Fix 66. La laisser dans S serait un état
    // que plus personne n'écrit — et que le prochain lecteur croirait vivant.
    const src = readFileSync(new URL('../src/state.js', import.meta.url), 'utf8');
    assert.ok(!/personaEditorCam(Sens|Open)/.test(src), 'état de caméra devenu inatteignable');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 71/72 (ESSAI) — glisser une poignée, et choisir lequel de ses champs on règle.
//
// Ce que le stub DOM ne permet PAS de vérifier : que les gestionnaires de souris appellent bien ces
// fonctions (aucun événement n'est distribué), ni que le surlignage `.driven` apparaît au bon
// endroit (les classes du stub sont des no-op). Ce qui est couvert, c'est la machine à états —
// sélection, champ actif, session de glisser — extraite exprès des gestionnaires.
//
// Fonctionnalité explicitement expérimentale : si elle est retirée, ce bloc part avec.
// ─────────────────────────────────────────────────────────────────────────────
describe('éditeur de Personnage — glisser d\'articulation (Fix 71/72, ESSAI)', () => {
  const specsDe = id => poseSliderSpecs3D(POSE_HANDLES.find(d => d.id === id));
  beforeEach(() => { closePersonaEditor(); });

  test('aucune session hors de l\'éditeur', () => {
    // Deux cas : après une fermeture propre le brouillon est nul de toute façon, si bien qu'un seul
    // des deux gardes suffirait à faire passer la première assertion.
    assert.equal(beginPersonaEditorJointDrag('lKnee'), null, 'éditeur jamais ouvert');
    openPersonaEditor(null);
    S.personaEditorOpen = false;
    assert.equal(beginPersonaEditorJointDrag('lKnee'), null, 'drapeau baissé, brouillon intact');
    S.personaEditorOpen = true;
  });

  test('aucune session pour une articulation inconnue', () => {
    openPersonaEditor(null);
    assert.equal(beginPersonaEditorJointDrag('coude_imaginaire'), null);
    assert.equal(beginPersonaEditorJointDrag(null), null);
  });

  test('la session capture l\'angle de DÉPART du champ actif', () => {
    openPersonaEditor(null);
    const spec = specsDe('lKnee')[0];
    setPersonaEditorJointDeg(spec, 25);
    focusPersonaEditorHandle('lKnee');
    const session = beginPersonaEditorJointDrag('lKnee');
    assert.equal(session.startDeg, 25);
    assert.equal(session.spec.key, spec.key);
  });

  test('glisser écrit dans le brouillon', () => {
    openPersonaEditor(null);
    focusPersonaEditorHandle('lKnee');
    const session = beginPersonaEditorJointDrag('lKnee');
    applyPersonaEditorJointDrag(session, 0, 40);
    // Fix 80 — signe NÉGATIF depuis que la caméra s'ouvre devant le visage et non derrière. Ce
    // n'est pas un détail de test : vérifié par le calcul, un headRotX positif fait LEVER la tête
    // (le visage, en Z négatif, monte quand on tourne autour de +X). Glisser vers le bas doit donc
    // donner un angle négatif — ce qui n'était pas le cas vu de dos.
    assert.equal(readPoseSliderDeg3D(S.personaEditorDraft, specsDe('lKnee')[0]), -20);
  });

  test('RÉGRESSION : glisser allume Réinitialiser, revenir l\'éteint', () => {
    // La dirty-detection est partagée avec les curseurs (poseSliderSignature3D) : si le glisser
    // écrivait des radians non arrondis, un aller-retour laisserait le bouton allumé sans que la
    // pose ait bougé — exactement le symptôme que le Fix 62 avait supprimé côté curseurs.
    openPersonaEditor(null);
    assert.equal(personaEditorHasChanges(), false, 'rien à faire à l\'ouverture');
    focusPersonaEditorHandle('head');
    const session = beginPersonaEditorJointDrag('head');
    applyPersonaEditorJointDrag(session, 60, -30);
    assert.equal(personaEditorHasChanges(), true);
    applyPersonaEditorJointDrag(session, 0, 0);
    assert.equal(personaEditorHasChanges(), false, 'retour au point de départ = aucun changement');
  });

  test('RÉGRESSION : le glisser ne touche QU\'AU champ actif', () => {
    // Cœur du Fix 72. Avant, un glisser diagonal bougeait les deux champs d'un coup : saisir une
    // tête pour l'incliner la faisait aussi pivoter, sans que rien ne l'annonce.
    openPersonaEditor(null);
    const [vert, horiz] = specsDe('head');
    setPersonaEditorJointDeg(horiz, 33);
    focusPersonaEditorHandle('head');
    const session = beginPersonaEditorJointDrag('head');
    // La tête tourne autour de X pour son premier champ : de face, l'axe est horizontal à l'écran,
    // donc le geste est VERTICAL et dx est ignoré. Inchangé depuis le Fix 74 — c'est justement ce
    // que le Fix 75 devait préserver dans la vue de face.
    assert.equal(session.droit, true);
    applyPersonaEditorJointDrag(session, 999, 50);
    assert.equal(readPoseSliderDeg3D(S.personaEditorDraft, vert), -25, '50 px verticaux à 0.5°/px');
    assert.equal(readPoseSliderDeg3D(S.personaEditorDraft, horiz), 33, 'champ voisin intact');
  });

  test('RÉGRESSION : une rotule garde son axe voisin en écrivant l\'actif', () => {
    // writePoseSliderDeg3D recopie l'axe voisin : sans ça, régler l'écart d'une épaule remettrait
    // son avant/arrière à plat (cf. Fix 51).
    openPersonaEditor(null);
    const [x, z] = specsDe('lShoulder');
    focusPersonaEditorHandle('lShoulder');
    const x0 = readPoseSliderDeg3D(S.personaEditorDraft, x);
    const z0 = readPoseSliderDeg3D(S.personaEditorDraft, z);
    cyclePersonaEditorSpec(1);                       // on passe sur l'écart
    // Fix 75 — l'écart tourne autour de Z, qui pointe vers l'œil dans la vue de face d'ouverture :
    // la session bascule donc en mode CIRCULAIRE, et c'est un balayage qu'il faut lui fournir.
    const session = beginPersonaEditorJointDrag('lShoulder');
    assert.equal(session.droit, false, 'de face, l\'écart d\'épaule se règle en tournant');
    applyPersonaEditorJointDrag(session, 0, 0, {
      pivot: { x: 100, y: 100 },
      depart: { x: 200, y: 100 },
      courant: { x: 100, y: 200 },              // quart de tour horaire = +90°
    });
    assert.equal(readPoseSliderDeg3D(S.personaEditorDraft, z), z0 + 90);
    assert.equal(readPoseSliderDeg3D(S.personaEditorDraft, x), x0, 'axe voisin intact');
  });

  test('RÉGRESSION : attraper deux fois la même poignée ne la désélectionne pas', () => {
    // C'est le défaut signalé : le clic passait par selectPersonaEditorHandle, qui BASCULE. Le
    // panneau droit perdait donc son surlignage au moment précis où on regardait la valeur bouger.
    openPersonaEditor(null);
    focusPersonaEditorHandle('lKnee');
    focusPersonaEditorHandle('lKnee');
    assert.equal(S.personaEditorHandleId, 'lKnee');
    // Contraste avec la bascule, qui reste le geste « cliquer pour désélectionner » : c'est bien
    // deux fonctions distinctes, pas un changement de comportement de l'ancienne.
    togglePersonaEditorHandle('lKnee');
    assert.equal(S.personaEditorHandleId, null);
  });

  test('changer d\'articulation repart de son PREMIER champ', () => {
    // Garder l'index ferait atterrir sur le second champ d'une articulation qui en a deux, ou hors
    // liste pour un genou, qui n'en a qu'un.
    openPersonaEditor(null);
    focusPersonaEditorHandle('head');
    cyclePersonaEditorSpec(1);
    assert.equal(S.personaEditorSpecIndex, 1);
    focusPersonaEditorHandle('lKnee');
    assert.equal(S.personaEditorSpecIndex, 0);
  });

  test('la molette ne change de champ que s\'il y en a plusieurs', () => {
    openPersonaEditor(null);
    assert.equal(cyclePersonaEditorSpec(1), null, 'aucune sélection');
    focusPersonaEditorHandle('lKnee');
    assert.equal(cyclePersonaEditorSpec(1), null, 'un seul champ : rien à faire défiler');
    focusPersonaEditorHandle('head');
    assert.equal(cyclePersonaEditorSpec(1), 1);
    assert.equal(cyclePersonaEditorSpec(1), 0, 'et ça boucle');
  });

  test('personaEditorActiveSpec suit la molette', () => {
    openPersonaEditor(null);
    assert.equal(personaEditorActiveSpec(), null, 'aucune sélection');
    focusPersonaEditorHandle('head');
    const [vert, horiz] = specsDe('head');
    assert.equal(personaEditorActiveSpec().key, vert.key);
    cyclePersonaEditorSpec(1);
    assert.equal(personaEditorActiveSpec().key, horiz.key);
  });

  test('RÉGRESSION : pousser une articulation à fond ne la BLOQUE pas', () => {
    // Le défaut signalé. La session porte l'origine du geste ; sans ré-ancrage, écraser la borne
    // pendant 600 px stockait ces 600 px, et il fallait les reparcourir en sens inverse avant que
    // l'angle ne bouge — l'articulation semblait figée. Testé ICI en plus de la fonction pure,
    // parce que c'est la MUTATION de la session qui rend le ré-ancrage effectif : oublier de
    // réécrire session.startDeg laisserait la fonction pure correcte et le geste toujours bloqué.
    openPersonaEditor(null);
    focusPersonaEditorHandle('lKnee');
    const session = beginPersonaEditorJointDrag('lKnee');
    assert.equal(applyPersonaEditorJointDrag(session, 0, 2000), -180, 'borne basse atteinte');
    assert.ok(applyPersonaEditorJointDrag(session, 0, 1996) > -180,
      '4 px de retour doivent déjà faire remonter l\'angle');
  });

  test('RÉGRESSION : la session GÈLE l\'orbite et le mode à l\'appui', () => {
    // On peut orbiter au clic DROIT pendant un glisser gauche. Si la session relisait la caméra à
    // chaque image, la direction du geste changerait sous la main, et le mode pourrait basculer de
    // droit à circulaire en plein mouvement — l'articulation ferait un bond.
    openPersonaEditor(null);
    focusPersonaEditorHandle('head');
    const session = beginPersonaEditorJointDrag('head');
    const orbiteFigee = { ...session.orbit };
    const modeFige = session.droit;
    setPersonaEditorOrbit(0.7, 2);
    assert.deepEqual(session.orbit, orbiteFigee, 'l\'orbite de la session ne suit pas la caméra');
    assert.equal(session.droit, modeFige, 'le mode non plus');
  });

  test('le mode suit l\'orientation AU MOMENT de l\'appui', () => {
    // Cœur du Fix 75 : l'écart d'épaule tourne autour de Z. De face, Z pointe vers l'œil — mode
    // circulaire. De profil, Z est en travers de l'écran — mode droit.
    openPersonaEditor(null);
    focusPersonaEditorHandle('lShoulder');
    cyclePersonaEditorSpec(1);                              // l'écart
    assert.equal(beginPersonaEditorJointDrag('lShoulder').droit, false, 'de face');
    setPersonaEditorOrbit(0, Math.PI / 2);
    assert.equal(beginPersonaEditorJointDrag('lShoulder').droit, true, 'de profil');
  });

  test('mode circulaire sans balayage fourni : l\'angle ne bouge pas', () => {
    // Le gestionnaire renvoie null quand la poignée n'a pas de projection connue. Mieux vaut une
    // articulation immobile qu'une qui tourne autour d'un pivot inventé.
    openPersonaEditor(null);
    focusPersonaEditorHandle('lShoulder');
    cyclePersonaEditorSpec(1);
    const [, z] = specsDe('lShoulder');
    const avant = readPoseSliderDeg3D(S.personaEditorDraft, z);
    applyPersonaEditorJointDrag(beginPersonaEditorJointDrag('lShoulder'), 50, 50, null);
    assert.equal(readPoseSliderDeg3D(S.personaEditorDraft, z), avant);
  });

  test('la session refuse d\'écrire si l\'éditeur s\'est refermé entre-temps', () => {
    openPersonaEditor(null);
    focusPersonaEditorHandle('lKnee');
    const session = beginPersonaEditorJointDrag('lKnee');
    closePersonaEditor();
    assert.equal(applyPersonaEditorJointDrag(session, 0, 40), null);
  });

  test('RÉGRESSION : « ouvert » et « brouillon présent » sont vérifiés SÉPARÉMENT', () => {
    // closePersonaEditor vide le brouillon EN PLUS de baisser le drapeau : le test ci-dessus passe
    // donc même si l'un des deux gardes disparaît — il ne distinguait rien, et une mutation lui a
    // échappé. Ici on baisse le drapeau À LA MAIN, brouillon intact, ce qui est la seule façon
    // d'exiger vraiment les deux.
    openPersonaEditor(null);
    focusPersonaEditorHandle('lKnee');
    const session = beginPersonaEditorJointDrag('lKnee');
    const brouillon = S.personaEditorDraft;
    S.personaEditorOpen = false;
    assert.equal(applyPersonaEditorJointDrag(session, 0, 40), null);
    assert.equal(S.personaEditorDraft, brouillon, 'et rien n\'a été écrit au passage');
    S.personaEditorOpen = true;   // on rend l'état cohérent pour le beforeEach suivant
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 76 (ESSAI) — les deux causes du glisser erratique.
//
// Testé par INSPECTION de la source : drawPersonaEditor exige WebGL et le stub DOM ne distribue
// aucun événement. Ce qu'on épingle est donc la FORME du code, faute de pouvoir l'exécuter — mais
// ce sont deux formes précises, chacune correspondant à un défaut observé à l'écran.
// ─────────────────────────────────────────────────────────────────────────────
describe('éditeur de Personnage — glisser erratique (Fix 76, ESSAI)', () => {
  const src = readFileSync(new URL('../src/events.js', import.meta.url), 'utf8');
  const corpsDe = (nom) => {
    const i = src.indexOf(`export function ${nom}(`);
    if (i < 0) throw new Error(`fonction introuvable : ${nom}`);
    const fin = src.indexOf('\n}', i);
    return src.slice(i, fin);
  };

  test('RÉGRESSION : l\'éditeur rend le Personnage SANS sa rotation propre', () => {
    // Deux effets d'une même ligne : il apparaît toujours de face, et les axes du modèle coïncident
    // avec ceux du monde — ce que suppose projectModelAxisToScreen3D. Réintroduire target.rotY
    // rendrait le glisser faux pour tout Personnage tourné dans sa Scène.
    const corps = corpsDe('drawPersonaEditor');
    for (const axe of ['rotY', 'rotX', 'rotZ']) {
      assert.match(corps, new RegExp(`${axe}:\\s*0,`), `${axe} doit être forcé à 0`);
    }
    assert.ok(!/rot[XYZ]:\s*\(target/.test(corps),
      'le rendu de l\'éditeur ne doit plus lire l\'orientation de l\'Élément');
  });

  test('RÉGRESSION : le pivot du geste circulaire n\'est PAS relu pendant le glisser', () => {
    // personaEditorHandlePos est réécrite par chaque drawPersonaEditor. La relire à chaque image
    // faisait bouger le pivot sous l'effet de la rotation qu'on venait d'appliquer : l'angle mesuré
    // changeait sans que la souris bouge, ce qui appliquait une rotation de plus. Boucle fermée,
    // Personnage en vibration.
    const i = src.indexOf('const gesteCirculaire =');
    assert.ok(i > 0, 'gesteCirculaire introuvable');
    const corps = src.slice(i, src.indexOf('};', i));
    assert.ok(!corps.includes('personaEditorHandlePos'),
      'le pivot doit venir de la session figée, pas de la carte redessinée à chaque image');
    assert.match(corps, /drag\.pivot/, 'il doit lire le pivot gelé dans la session');
  });

  test('RÉGRESSION : le pivot est gelé au même endroit que le reste du geste', () => {
    // Orbite, mode, champ actif et pivot : tout ce qui décide de la forme du geste est capturé à
    // l'appui. Un seul de ces quatre relu en cours de route suffit à rendre le glisser incohérent.
    const i = src.indexOf('const session = beginPersonaEditorJointDrag(def.id);');
    assert.ok(i > 0, 'ouverture de session introuvable');
    assert.match(src.slice(i, i + 400), /pivot:\s*pivotFige\(def\.id\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 79 (ESSAI) — le balayage circulaire se déroule au lieu de s'inverser.
// ─────────────────────────────────────────────────────────────────────────────
describe('éditeur de Personnage — balayage circulaire (Fix 79)', () => {
  const specsDe = id => poseSliderSpecs3D(POSE_HANDLES.find(d => d.id === id));
  const pivot = { x: 100, y: 100 };
  const surCercle = (deg, r = 100) => ({
    x: pivot.x + r * Math.cos(deg * Math.PI / 180),
    y: pivot.y + r * Math.sin(deg * Math.PI / 180),
  });
  // Rejoue un geste image par image, comme le fait le gestionnaire de souris.
  const glisser = (session, degres) => {
    let dernier = 0;
    for (const d of degres.slice(1)) {
      dernier = applyPersonaEditorJointDrag(session, 0, 0, {
        pivot, depart: surCercle(degres[0]), courant: surCercle(d),
      });
    }
    return dernier;
  };

  beforeEach(() => { closePersonaEditor(); });

  const sessionEcart = () => {
    openPersonaEditor(null);
    focusPersonaEditorHandle('lShoulder');
    cyclePersonaEditorSpec(1);                 // l'écart tourne autour de Z : mode circulaire de face
    const session = beginPersonaEditorJointDrag('lShoulder');
    assert.equal(session.droit, false, 'ce test n\'a de sens qu\'en mode circulaire');
    return session;
  };

  test('RÉGRESSION : un balayage de plus d\'un demi-tour ne s\'inverse pas', () => {
    // Le défaut signalé. Mesuré d'un bloc depuis l'appui, 200° se lisaient -160° : le sens de
    // rotation s'inversait franchement dès qu'on faisait un grand mouvement.
    const session = sessionEcart();
    const depart = session.startDeg;
    const deg = glisser(session, [0, 90, 170, 200]);
    assert.ok(deg > depart, `l'angle doit avoir AUGMENTÉ (départ ${depart}, obtenu ${deg})`);
  });

  test('RÉGRESSION : aller puis retour rend l\'angle de départ', () => {
    // « De grands mouvements dans un sens puis dans l'autre » — la formulation exacte du défaut.
    //
    // Le balayage reste SOUS la borne des 180° : au-delà, le ré-ancrage du Fix 73 décale
    // volontairement le repère et l'aller-retour ne revient plus au point de départ (cf. le test
    // suivant, qui épingle ce comportement pour qu'il ne repasse pas pour un défaut). Ma première
    // version de ce test balayait 250° et échouait pour cette raison, pas à cause du balayage.
    const session = sessionEcart();
    const depart = session.startDeg;
    glisser(session, [0, 60, 120, 150]);
    const deg = glisser(session, [0, 150, 120, 60, 0]);
    assert.equal(deg, depart, 'retour au point de départ');
  });

  test('au-delà de la borne, le repère se décale — et c\'est voulu', () => {
    // Comportement de tout défilement borné : on pousse contre la butée, le surplus est absorbé, et
    // le geste repart ensuite de l'endroit où on a quitté la butée. C'est ce qui évite l'effet
    // « articulation bloquée » du Fix 73. Épinglé ici pour qu'il soit reconnu comme un choix.
    const session = sessionEcart();
    const depart = session.startDeg;
    glisser(session, [0, 90, 180, 250]);
    assert.equal(session.startDeg !== depart, true, 'l\'origine a été recalée à la butée');
  });

  test('le cumul avance image par image, sans dépendre du nombre d\'images', () => {
    const grossier = sessionEcart();
    const fin = sessionEcart();
    const a = glisser(grossier, [0, 60, 120]);
    const b = glisser(fin, [0, 15, 30, 45, 60, 75, 90, 105, 120]);
    assert.equal(a, b, 'même geste, même angle, quelle que soit la fluidité');
  });

  test('RÉGRESSION : traverser le point d\'articulation ne fait pas sauter la rotation', () => {
    // À un pixel du pivot, deux images voisines peuvent être séparées de 127°. La session doit
    // ignorer ces images plutôt qu'encaisser le saut.
    const session = sessionEcart();
    const avant = applyPersonaEditorJointDrag(session, 0, 0, {
      pivot, depart: surCercle(0), courant: surCercle(30),
    });
    const pendant = applyPersonaEditorJointDrag(session, 0, 0, {
      pivot, depart: surCercle(0), courant: { x: 101, y: 100 },   // collé au pivot
    });
    assert.equal(pendant, avant, 'une image trop proche du pivot ne change rien');
  });

  test('RÉGRESSION : le même balayage donne des sens OPPOSÉS depuis les deux profils', () => {
    // Le défaut signalé : « Personnage de côté, mouvement avant/arrière inversé ». La session fige
    // le sens à l'appui, d'après le côté depuis lequel on regarde l'axe.
    const mesurer = (azimut) => {
      openPersonaEditor(null);
      setPersonaEditorOrbit(0, azimut);
      focusPersonaEditorHandle('lShoulder');          // avant/arr. = axe X, circulaire de profil
      const session = beginPersonaEditorJointDrag('lShoulder');
      assert.equal(session.droit, false, `de profil (${azimut}), le mode doit être circulaire`);
      const depart = session.startDeg;
      const deg = applyPersonaEditorJointDrag(session, 0, 0, {
        pivot, depart: surCercle(0), courant: surCercle(60),
      });
      closePersonaEditor();
      return deg - depart;
    };
    const gauche = mesurer(Math.PI / 2);
    const droite = mesurer(-Math.PI / 2);
    assert.equal(Math.sign(gauche), -Math.sign(droite),
      `un profil doit répondre à l'inverse de l'autre (${gauche} et ${droite})`);
    assert.equal(Math.abs(gauche), Math.abs(droite), 'même amplitude des deux côtés');
  });

  test('un geste sans balayage fourni laisse l\'angle en place', () => {
    const session = sessionEcart();
    assert.equal(applyPersonaEditorJointDrag(session, 50, 50, null), session.startDeg);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 77 — un angle de 0° ne doit pas fermer la session de glisser.
//
// L'instrumentation qui a permis de trouver ce défaut a été retirée au Fix 89 ; le défaut, lui,
// était bien réel, et ce test reste la seule chose qui empêche la garde de redevenir laxiste.
// ─────────────────────────────────────────────────────────────────────────────
describe('éditeur de Personnage — la garde de fin de glisser (Fix 77)', () => {
  const src = readFileSync(new URL('../src/events.js', import.meta.url), 'utf8');
  beforeEach(() => { closePersonaEditor(); });

  test('RÉGRESSION : un angle de 0° ne ferme PAS la session', () => {
    // Le gestionnaire testait `if (!apply(...))`. Or 0° est un cas ordinaire — toute articulation
    // au repos, et tout passage par le zéro en cours de geste. La session était donc fermée en
    // pleine manipulation, sans rien pour l'expliquer.
    openPersonaEditor(null);
    focusPersonaEditorHandle('lKnee');
    const session = beginPersonaEditorJointDrag('lKnee');
    assert.equal(applyPersonaEditorJointDrag(session, 0, 0), 0, 'un glisser nul rend bien 0');
    assert.match(src, /if \(deg === null\) \{/,
      'la garde doit comparer à null, pas tester la véracité — 0 est une valeur légitime');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 87/88 — câblage du rayon de saisie.
//
// Par inspection de source : il vit dans le câblage des événements, hors de portée du stub DOM. Ce
// qu'on épingle est le lien entre l'état de sélection et le rayon transmis — c'est-à-dire
// précisément ce qu'une mutation « on repasse au réglage fixe » efface sans que rien d'autre ne
// s'en aperçoive.
// ─────────────────────────────────────────────────────────────────────────────
describe('éditeur de Personnage — rayon de saisie (Fix 87/88)', () => {
  const src = readFileSync(new URL('../src/events.js', import.meta.url), 'utf8');

  test('RÉGRESSION : le rayon de saisie dépend de la SÉLECTION', () => {
    assert.match(src, /posePickRadii3D\(!!S\.personaEditorHandleId\)/,
      'sans cette bascule, le rayon reste étroit et un départ de geste un peu à côté désélectionne');
  });

  test('RÉGRESSION : le MÊME rayon sert au clic et au curseur « main »', () => {
    // Deux valeurs distinctes promettraient une prise là où le clic ne mordrait pas, ou l'inverse.
    const appels = src.match(/pickPoseHandleAt\([^)]*\)/g) || [];
    const dansEditeur = appels.filter(a => a.includes('personaEditorHandlePos'));
    assert.equal(dansEditeur.length, 2, 'le clic et le survol, pas un de plus');
    dansEditeur.forEach(a => assert.match(a, /rayonSaisie\(\)/, a));
  });

});
