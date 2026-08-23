// tests/scene3d.test.mjs — Tests unitaires de src/scene3d.js (Caméra 3D de Case + helpers monde).
// Priorité explicite demandée : couvrir en premier tout ce qui touche à la Caméra.
//
// NON couvert ici, volontairement : toute fonction qui appelle ensurePersonaScene3D() en interne
// (projectElementCenterToCanvas3D, getElementProjectedHalfExtents3D, getRoomScreenBBoxFrom2DProjections,
// getBuildingJunctionCorners, panelDragRayOnPlane, renderPanelScene3D...) — ensurePersonaScene3D()
// tente de construire un vrai THREE.WebGLRenderer, qui échoue sous Node (pas de WebGL réel, et le
// canvas factice de dom-stub.mjs n'implémente pas document.createElementNS). Vérifié empiriquement :
// `ensurePersonaScene3D()` seule lève déjà "document.createElementNS is not a function" — hors de
// portée d'un test unitaire sans un vrai environnement navigateur/headless-gl.
import './helpers/dom-stub.mjs';
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  panelDepthToDistance3D,
  distanceCameraPourPremierElement3D,
  estPremierElement3DdeLaCase,
  clampPanelDepth3D,
  panelApparentPx3D,
  ensureElementUnits3D,
  groundMagnetEligible,
  applyGroundMagnetY,
  clampWorldYAboveGround,
  storeElementWorldCoords,
  storeElementWxFloor,
  findOwningPanel,
  panelCamBasis3D,
  getCamOrbitWorld,
  worldFloorToScreen,
  worldToPageXY,
  framePanelCamera3D,
  ensureElementWorldPos3D,
  setElementWorldPos3D,
  panelAutoDepthPivot3D,
  worldPointToPageXY3D,
  smoothTracéPath3D,
  tracéPointAtFrac3D,
  tracéWallHostOf3D,
  wallOpeningWorldPosOnTracé3D,
  tracéOpeningSize3D,
  tracéWallThickness3D,
  tracéOpeningRigScale3D,
  tracéOpeningFlushOffset3D,
  tracéFrameAtFrac3D,
  buildOpeningRevealGroup3D,
  tracéOpeningHole3D,
  tracéOpeningWorldCenter3D,
  buildTracéWallGeometry3D,
  buildMuretGroup3D,
  buildWallJunctions3D,
  isJunctionWall3D,
  tracéWallHeight3D,
} from '../src/scene3d.js';
import { S } from '../src/state.js';
import {
  PANEL_CAM_DEFAULT_DIST_3D, PANEL_DEPTH_MAX_3D, GROUND_Y_DEFAULT_3D, WALL_PX_PER_UNIT_3D,
  PERSONA_REAL_HEIGHT_M,
  TRACÉ_DEFAULTS,
} from '../src/constants.js';

function assertClose(actual, expected, msg, eps = 1e-9) {
  assert.ok(Math.abs(actual - expected) < eps,
    `${msg} — attendu ≈ ${expected}, obtenu ${actual}`);
}

function assertVecClose(actual, expected, msg, eps = 1e-9) {
  assertClose(actual.x, expected.x, `${msg} (x)`, eps);
  assertClose(actual.y, expected.y, `${msg} (y)`, eps);
  assertClose(actual.z, expected.z, `${msg} (z)`, eps);
}

// Réinitialise les champs de S lus par framePanelCamera3D avant chaque test, pour qu'aucun
// test ne pollue le suivant (S est un singleton mutable partagé par tout le module state.js).
beforeEach(() => {
  S.selectedId = null;
  S.selectedRoomId = null;
  S.dragMode = null;
  S.editingSceneId = null;
});

describe('panelDepthToDistance3D / clampPanelDepth3D / panelApparentPx3D', () => {
  test('profondeur nulle → distance par défaut de la caméra', () => {
    assertClose(panelDepthToDistance3D(0), PANEL_CAM_DEFAULT_DIST_3D, 'z=0');
  });

  test('profondeur positive (élément plus proche de la caméra) → distance réduite', () => {
    const d = panelDepthToDistance3D(5);
    assertClose(d, PANEL_CAM_DEFAULT_DIST_3D - 5, 'z=5');
    assert.ok(d < PANEL_CAM_DEFAULT_DIST_3D);
  });

  test('profondeur au-delà de la distance par défaut → plancher à 0.1 (jamais négatif/nul)', () => {
    assertClose(panelDepthToDistance3D(PANEL_CAM_DEFAULT_DIST_3D - 0.05), 0.1, 'presque à la caméra');
    assertClose(panelDepthToDistance3D(PANEL_CAM_DEFAULT_DIST_3D + 500), 0.1, 'très au-delà');
  });

  test('clampPanelDepth3D laisse passer les valeurs sous le plafond', () => {
    assertClose(clampPanelDepth3D(3), 3, 'valeur normale');
    assertClose(clampPanelDepth3D(-50), -50, 'valeur négative (pas de plancher)');
  });

  test('clampPanelDepth3D plafonne à PANEL_DEPTH_MAX_3D', () => {
    assertClose(clampPanelDepth3D(PANEL_DEPTH_MAX_3D + 1000), PANEL_DEPTH_MAX_3D, 'valeur excessive');
  });

  test('panelApparentPx3D à profondeur nulle : taille apparente = unitsSize × WALL_PX_PER_UNIT_3D', () => {
    assertClose(panelApparentPx3D(2, 0), 2 * WALL_PX_PER_UNIT_3D, 'z=0, facteur neutre');
  });

  test('panelApparentPx3D : plus proche de la caméra (z>0) → apparaît plus grand', () => {
    assertClose(panelApparentPx3D(2, 5), 96, 'agrandi (facteur 30/25=1.2)');
    assert.ok(panelApparentPx3D(2, 5) > panelApparentPx3D(2, 0));
  });
});

describe('ensureElementUnits3D — décodage de la taille apparente (o.w/o.h) en unités monde réelles', () => {
  test('profondeur nulle : conversion directe par WALL_PX_PER_UNIT_3D', () => {
    const units = ensureElementUnits3D({ w: 80, h: 120, z: 0 });
    assertClose(units.w, 2, 'w');
    assertClose(units.h, 3, 'h');
  });

  test('profondeur non nulle : le facteur d\'échelle en tient compte (round-trip avec panelApparentPx3D)', () => {
    const units = ensureElementUnits3D({ w: 96, h: 48, z: 5 });
    assertClose(units.w, 2, 'w');
    assertClose(units.h, 1, 'h');
  });

  test('o.w/o.h absents : replis sur WALL_PX_PER_UNIT_3D (taille par défaut 1 unité)', () => {
    const units = ensureElementUnits3D({ z: 0 });
    assertClose(units.w, 1, 'w par défaut');
    assertClose(units.h, 1, 'h par défaut');
  });
});

describe('groundMagnetEligible / applyGroundMagnetY / clampWorldYAboveGround', () => {
  test('un Personnage est toujours éligible à l\'aimantation au sol', () => {
    assert.equal(groundMagnetEligible({ type: 'perso' }), true);
  });

  test('un Mur (objet3d/mur) n\'est jamais éligible (type structurel)', () => {
    assert.equal(groundMagnetEligible({ type: 'objet3d', objType: 'mur' }), false);
  });

  test('une Parois magnétique (fenêtre/porte/escalier) n\'est pas éligible', () => {
    assert.equal(groundMagnetEligible({ type: 'objet3d', objType: 'porte_ouverte' }), false);
  });

  test('un objet 3D générique (mobilier) est éligible', () => {
    assert.equal(groundMagnetEligible({ type: 'objet3d', objType: 'chaise' }), true);
  });

  test('applyGroundMagnetY sans panel : no-op (o.y inchangé)', () => {
    const o = { y: 42, h: 80 };
    applyGroundMagnetY(o, null);
    assertClose(o.y, 42, 'inchangé');
  });

  test('applyGroundMagnetY avec realHeightFloor défini : pose les pieds au niveau du sol (+epsilon)', () => {
    const panel = { y: 0, h: 600 };
    const o = { h: 80, realHeightFloor: 2, z: 0, y: 0 };
    applyGroundMagnetY(o, panel);
    assertClose(o.y, 339.6, 'calculé à la main (cf. commentaire du test scene3dcheck)');
  });

  test('élément aimanté (magnetGround!==false) : clampWorldYAboveGround ne touche pas à worldY (applyGroundMagnetY s\'en charge ailleurs)', () => {
    const o = { type: 'perso' };
    assertClose(clampWorldYAboveGround(o, -999, 1.8), -999, 'aimanté, valeur laissée telle quelle');
  });

  test('élément désaimanté (magnetGround:false) sans autorisation de traverser le sol : clampé au-dessus du sol', () => {
    const o = { type: 'perso', magnetGround: false };
    const realH = 1.8;
    const clamped = clampWorldYAboveGround(o, -999, realH);
    assertClose(clamped, GROUND_Y_DEFAULT_3D + realH / 2, 'plancher appliqué');
  });

  test('élément désaimanté mais déjà au-dessus du sol : valeur inchangée (Math.max ne redescend jamais)', () => {
    const o = { type: 'perso', magnetGround: false };
    const above = GROUND_Y_DEFAULT_3D + 50;
    assertClose(clampWorldYAboveGround(o, above, 1.8), above, 'déjà au-dessus, pas de clamp visible');
  });

  test('élément avec traverseGround:true : jamais clampé, même désaimanté', () => {
    const o = { type: 'perso', magnetGround: false, traverseGround: true };
    assertClose(clampWorldYAboveGround(o, -999, 1.8), -999, 'traverse le sol librement');
  });

  test('élément non-éligible (Mur) : jamais clampé quels que soient magnetGround/traverseGround', () => {
    const o = { type: 'objet3d', objType: 'mur', magnetGround: false };
    assertClose(clampWorldYAboveGround(o, -999, 3), -999, 'mur non concerné par le clamp de sol');
  });
});

describe('findOwningPanel — appartenance d\'un Élément à une Case', () => {
  const page = {
    objects: [
      { type: 'panel', id: 'p1', x: 0, y: 0, w: 400, h: 400 },
      { type: 'panel', id: 'p2', x: 500, y: 0, w: 400, h: 400 },
    ],
  };

  test('priorité à homePanelId si la Case référencée existe encore', () => {
    const owner = findOwningPanel({ homePanelId: 'p2', x: 0, y: 0, w: 10, h: 10 }, page);
    assert.equal(owner.id, 'p2', 'homePanelId gagne même si géométriquement dans p1');
  });

  test('sans homePanelId valide : repli sur le chevauchement géométrique', () => {
    const owner = findOwningPanel({ x: 10, y: 10, w: 10, h: 10 }, page);
    assert.equal(owner.id, 'p1');
  });

  test('aucun chevauchement, aucun homePanelId valide : orphelin (null)', () => {
    const owner = findOwningPanel({ x: 9999, y: 9999, w: 10, h: 10 }, page);
    assert.equal(owner, null);
  });
});

describe('ensureElementWorldPos3D / setElementWorldPos3D / storeElementWorldCoords — conversions pixel↔monde', () => {
  // Zone historiquement fragile (Phases 1 à 3 de l'historique du projet : synchronisation
  // wxFloor/wzFloor, suppression du scaling des coordonnées monde) — un test de round-trip est la
  // meilleure protection contre une régression silencieuse de ces fonctions inverses.
  test('round-trip pixel → monde → pixel : retombe exactement sur la position d\'origine', () => {
    const panel = { x: 100, y: 50, w: 800, h: 600 };
    const o = { x: 320, y: 210, w: 40, h: 60, z: 0 };
    const world = ensureElementWorldPos3D(o, panel);
    const o2 = { x: 0, y: 0, w: o.w, h: o.h, z: o.z }; // même w/h/z, position à retrouver
    setElementWorldPos3D(o2, panel, world.x, world.y);
    assertClose(o2.x, o.x, 'x retrouvé après round-trip');
    assertClose(o2.y, o.y, 'y retrouvé après round-trip');
  });

  test('round-trip avec profondeur (z) non nulle : reste exact malgré le facteur d\'échelle dépendant de z', () => {
    const panel = { x: 0, y: 0, w: 800, h: 600 };
    const o = { x: 150, y: 90, w: 40, h: 40, z: 5 };
    const world = ensureElementWorldPos3D(o, panel);
    const o2 = { x: 0, y: 0, w: o.w, h: o.h, z: o.z };
    setElementWorldPos3D(o2, panel, world.x, world.y);
    assertClose(o2.x, o.x, 'x retrouvé malgré z≠0');
    assertClose(o2.y, o.y, 'y retrouvé malgré z≠0');
  });

  test('élément centré sur le panel → position monde (0,0)', () => {
    const panel = { x: 0, y: 0, w: 800, h: 600 };
    const o = { x: 400 - 20, y: 300 - 20, w: 40, h: 40, z: 0 }; // centre de o = centre du panel
    const world = ensureElementWorldPos3D(o, panel);
    assertClose(world.x, 0, 'x monde nul au centre');
    assertClose(world.y, 0, 'y monde nul au centre');
  });

  test('setElementWorldPos3D mémorise wxFloor', () => {
    const panel = { x: 0, y: 0, w: 800, h: 600 };
    const o = { x: 0, y: 0, w: 40, h: 40, z: 0 };
    setElementWorldPos3D(o, panel, 3.5, -2);
    assertClose(o.wxFloor, 3.5, 'wxFloor mémorisé');
  });

  test('storeElementWorldCoords : dérive wxFloor depuis la position 2D et wzFloor depuis o.z', () => {
    const panel = { x: 0, y: 0, w: 800, h: 600 };
    const o = { x: 380, y: 280, w: 40, h: 40, z: 3 }; // centré sur le panel → wxFloor attendu = 0
    storeElementWorldCoords(o, panel);
    assertClose(o.wxFloor, 0, 'wxFloor');
    assertClose(o.wzFloor, 3, 'wzFloor = o.z');
  });

  test('storeElementWorldCoords sans panel : no-op', () => {
    const o = { x: 0, y: 0, w: 40, h: 40, z: 3 };
    storeElementWorldCoords(o, null);
    assert.equal(o.wxFloor, undefined);
  });

  test('storeElementWxFloor est un alias de storeElementWorldCoords', () => {
    const panel = { x: 0, y: 0, w: 800, h: 600 };
    const o = { x: 380, y: 280, w: 40, h: 40, z: 3 };
    storeElementWxFloor(o, panel);
    assertClose(o.wxFloor, 0, 'wxFloor');
    assertClose(o.wzFloor, 3, 'wzFloor');
  });
});

describe('panelCamBasis3D — repère orthonormé de la caméra', () => {
  test('caméra par défaut (rotX=0, rotY=0) : backward=+Z, right=+X, up=+Y (repère monde standard)', () => {
    const basis = panelCamBasis3D({ camRotX: 0, camRotY: 0 });
    assertVecClose(basis.backward, { x: 0, y: 0, z: 1 }, 'backward');
    assertVecClose(basis.right,    { x: 1, y: 0, z: 0 }, 'right');
    assertVecClose(basis.up,       { x: 0, y: 1, z: 0 }, 'up');
  });

  test('le repère reste orthonormé pour une orientation quelconque (rotX/rotY arbitraires)', () => {
    for (const [rotX, rotY] of [[0.4, 1.1], [-0.7, -2.3], [1.2, 0.05], [-1.4, 3.0]]) {
      const b = panelCamBasis3D({ camRotX: rotX, camRotY: rotY });
      const dot = (u, v) => u.x * v.x + u.y * v.y + u.z * v.z;
      const len = (u) => Math.hypot(u.x, u.y, u.z);
      assertClose(len(b.right), 1, `|right| rotX=${rotX} rotY=${rotY}`, 1e-9);
      assertClose(len(b.up), 1, `|up| rotX=${rotX} rotY=${rotY}`, 1e-9);
      assertClose(len(b.backward), 1, `|backward| rotX=${rotX} rotY=${rotY}`, 1e-9);
      assertClose(dot(b.right, b.up), 0, `right·up rotX=${rotX} rotY=${rotY}`, 1e-9);
      assertClose(dot(b.right, b.backward), 0, `right·backward rotX=${rotX} rotY=${rotY}`, 1e-9);
      assertClose(dot(b.up, b.backward), 0, `up·backward rotX=${rotX} rotY=${rotY}`, 1e-9);
    }
  });

  test('cas dégénéré vue de dessus (rotX=π/2) : right suit rotY via la formule limite (fix historique, cf. commentaire du code)', () => {
    const rotY = 0.3;
    const basis = panelCamBasis3D({ camRotX: Math.PI / 2, camRotY: rotY });
    assertVecClose(basis.right, { x: Math.cos(rotY), y: 0, z: -Math.sin(rotY) }, 'right en vue de dessus', 1e-6);
  });
});

describe('getCamOrbitWorld — centre d\'orbite en coordonnées monde (Fix 13)', () => {
  test('panel.camWx déjà défini : renvoyé directement, sans recalcul (stable à la rotation)', () => {
    const panel = { camWx: 5, camWy: 2, camWz: -3 };
    const basis = panelCamBasis3D({ camRotX: 0.5, camRotY: 0.7 }); // orientation quelconque, ignorée dans ce cas
    const orb = getCamOrbitWorld(panel, basis);
    assert.deepEqual(orb, { x: 5, y: 2, z: -3 });
  });

  test('panel.camWx absent : migration depuis camPanX/camPanY (ancien format) via la base caméra', () => {
    const panel = { camPanX: 5, camPanY: 3 };
    const basis = panelCamBasis3D({ camRotX: 0, camRotY: 0 }); // right={1,0,0}, up={0,1,0}
    const orb = getCamOrbitWorld(panel, basis);
    assertVecClose(orb, { x: 5, y: 3, z: 0 }, 'monde = right*panX + up*panY');
    // Effet de bord documenté : la migration doit se figer dans panel.camWx/y/z (et les Target
    // associés) pour ne s'exécuter qu'une seule fois.
    assertClose(panel.camWx, 5, 'camWx mémorisé');
    assertClose(panel.camWy, 3, 'camWy mémorisé');
    assertClose(panel.camWz, 0, 'camWz mémorisé');
    assertClose(panel.camWxTarget, 5, 'camWxTarget mémorisé');
  });

  test('panel neuf (aucun champ caméra) : orbite à l\'origine du monde', () => {
    const panel = {};
    const basis = panelCamBasis3D({});
    const orb = getCamOrbitWorld(panel, basis);
    assertVecClose(orb, { x: 0, y: 0, z: 0 }, 'origine par défaut');
  });
});

describe('worldFloorToScreen / worldToPageXY — projection écran du plan du sol', () => {
  // Caméra par défaut, alignée sur les axes du monde (cf. test panelCamBasis3D ci-dessus) : permet
  // de vérifier la projection par un calcul indépendant, à la main.
  function defaultPanel(extra = {}) {
    return { camRotX: 0, camRotY: 0, camDist: PANEL_CAM_DEFAULT_DIST_3D, camWx: 0, camWy: 0, camWz: 0, ...extra };
  }

  test('origine du monde (0,0) projetée avec la caméra par défaut : valeur calculée à la main', () => {
    const panel = defaultPanel();
    const page = { w: 800, h: 600 };
    // basis = {right:(1,0,0), up:(0,1,0), backward:(0,0,1)} ; camDist=30 ; orbite=(0,0,0)
    // camY=0 (pas de clamp car 0 >= GROUND_Y_DEFAULT_3D+0.15) ; camX=0 ; camZ=30
    // vx=0, vy=GROUND_Y_DEFAULT_3D-0=-3, vz=-30
    // vright=0, vup=-3, vdepth=30 ; scale=PANEL_CAM_DEFAULT_DIST_3D*WALL_PX_PER_UNIT_3D=1200
    // x = 400 + 0 = 400 ; y = 300 - (-3*1200/30) = 300 + 120 = 420
    const s = worldFloorToScreen(0, 0, panel, page);
    assert.ok(s, 'point devant la caméra');
    assertClose(s.x, 400, 'x');
    assertClose(s.y, 420, 'y');
  });

  test('point derrière la caméra (vdepth<=0) : renvoie null', () => {
    const panel = defaultPanel();
    const page = { w: 800, h: 600 };
    const s = worldFloorToScreen(0, 1000, panel, page);
    assert.equal(s, null);
  });

  test('déplacer le point le long de +X (right) déplace l\'écran vers +x, monotone', () => {
    const panel = defaultPanel();
    const page = { w: 800, h: 600 };
    const s0 = worldFloorToScreen(0, 0, panel, page);
    const s1 = worldFloorToScreen(2, 0, panel, page);
    const s2 = worldFloorToScreen(4, 0, panel, page);
    assert.ok(s1.x > s0.x && s2.x > s1.x, 'progression monotone vers la droite écran');
  });

  test('worldToPageXY : quand la Case occupe exactement toute la Planche, équivaut à worldFloorToScreen', () => {
    const panel = defaultPanel({ x: 0, y: 0, w: 800, h: 600 });
    const page = { w: 800, h: 600 };
    const a = worldFloorToScreen(1.5, -2, panel, page);
    const b = worldToPageXY(1.5, -2, panel, page);
    assertClose(b.x, a.x, 'x identique (offset nul)');
    assertClose(b.y, a.y, 'y identique (offset nul)');
  });

  test('worldToPageXY : quand la Case est décalée sur la Planche, applique l\'offset panel.x/y', () => {
    const panel = defaultPanel({ x: 100, y: 50, w: 800, h: 600 });
    const page = { w: 800, h: 600 };
    const ws = worldFloorToScreen(0, 0, panel, page);
    const wp = worldToPageXY(0, 0, panel, page);
    // panel.x + panel.w/2 + (ws.x - page.w/2) = 100 + 400 + (ws.x - 400) = 100 + ws.x
    assertClose(wp.x, 100 + ws.x, 'offset x appliqué');
    assertClose(wp.y, 50 + ws.y, 'offset y appliqué');
  });
});

describe('framePanelCamera3D — configuration complète de la caméra THREE.js', () => {
  test('sans sélection ni cible d\'orbite : fov/aspect/near/far/position calculés à partir de la planche et de l\'orbite libre', () => {
    const panel = { camRotX: 0, camRotY: 0, camDist: PANEL_CAM_DEFAULT_DIST_3D, camWx: 0, camWy: 0, camWz: 0 };
    const page = { w: 800, h: 600, objects: [] };
    const camera = new (globalThis.THREE.PerspectiveCamera)();
    framePanelCamera3D(camera, panel, page);

    const halfHUnits = (page.h / WALL_PX_PER_UNIT_3D) / 2; // 7.5
    const expectedFov = 2 * Math.atan(halfHUnits / PANEL_CAM_DEFAULT_DIST_3D) * 180 / Math.PI;
    assertClose(camera.fov, expectedFov, 'fov dérivé de page.h, pas de panel.h', 1e-9);
    assertClose(camera.aspect, page.w / page.h, 'aspect = page.w/page.h');
    assertClose(camera.near, Math.min(0.01, PANEL_CAM_DEFAULT_DIST_3D * 0.1), 'near plane');
    assertClose(camera.far, Math.max(PANEL_CAM_DEFAULT_DIST_3D + 80, PANEL_CAM_DEFAULT_DIST_3D * 1.2), 'far plane');

    // basis par défaut : backward=(0,0,1) ; orbite libre = (camWx,camWy,camWz) = (0,0,0)
    // position = orbite + backward*dist = (0,0,PANEL_CAM_DEFAULT_DIST_3D)
    assertClose(camera.position.x, 0, 'position.x');
    assertClose(camera.position.y, 0, 'position.y (pas de plancher ici, cf. commentaire du code)');
    assertClose(camera.position.z, PANEL_CAM_DEFAULT_DIST_3D, 'position.z');
  });

  test('le centre d\'orbite calculé est mémorisé dans panel._orbitCx/Cy/Cz (utilisé par le gizmo)', () => {
    const panel = { camRotX: 0, camRotY: 0, camDist: 10, camWx: 1, camWy: 2, camWz: 3 };
    const page = { w: 800, h: 600, objects: [] };
    const camera = new (globalThis.THREE.PerspectiveCamera)();
    framePanelCamera3D(camera, panel, page);
    assertClose(panel._orbitCx, 1, '_orbitCx');
    assertClose(panel._orbitCy, 2, '_orbitCy');
    assertClose(panel._orbitCz, 3, '_orbitCz');
  });

  test('changer panel.camDist déplace la caméra le long de backward sans changer le fov (vrai dolly, pas un recadrage)', () => {
    const page = { w: 800, h: 600, objects: [] };
    const camera1 = new (globalThis.THREE.PerspectiveCamera)();
    const panel1 = { camRotX: 0, camRotY: 0, camDist: 10, camWx: 0, camWy: 0, camWz: 0 };
    framePanelCamera3D(camera1, panel1, page);

    const camera2 = new (globalThis.THREE.PerspectiveCamera)();
    const panel2 = { camRotX: 0, camRotY: 0, camDist: 20, camWx: 0, camWy: 0, camWz: 0 };
    framePanelCamera3D(camera2, panel2, page);

    assertClose(camera1.fov, camera2.fov, 'fov identique quel que soit camDist (fixe, basé sur la planche)');
    assertClose(camera2.position.z - camera1.position.z, 10, 'la caméra recule de exactement le delta de camDist');
  });
});

// ── panelAutoDepthPivot3D (Fix 24) ────────────────────────────────────────────────────────────
// Fonction de maths pures (aucun appel à ensurePersonaScene3D) → testable ici, contrairement au
// reste du pipeline de rendu 3D (cf. en-tête de fichier).
describe('panelAutoDepthPivot3D — réancrage du pivot d\'orbite sur le sujet visé (Fix 24)', () => {
  // Caméra en (0, 1.15, 10) regardant vers -Z : rotX=0, rotY=0 → backward = (0,0,1),
  // donc camPos = pivot + (0,0,1)*camDist et l'axe de visée est -Z.
  function makePanel(camDist) {
    return { id: 'p1', type: 'panel', x: 0, y: 0, w: 800, h: 600,
             camRotX: 0, camRotY: 0, camDist, camWx: 0, camWy: 1.15, camWz: 0 };
  }
  // Élément pile sur l'axe de visée, 6 unités devant le pivot (donc à camDist+6 de la caméra).
  function elemOnAxis() {
    return { id: 'e1', type: 'perso', x: 380, y: 280, w: 40, h: 40,
             wxFloor: 0, wyFloor: 1.15, wzFloor: -6 };
  }

  test('LA CAMÉRA NE BOUGE PAS : le pivot ne glisse que le long de l\'axe de visée', () => {
    const panel = makePanel(0.3);
    const page = { w: 800, h: 600, objects: [panel, elemOnAxis()] };
    // Position caméra avant = pivot + backward*camDist
    const camBefore = { x: panel.camWx, y: panel.camWy, z: panel.camWz + panel.camDist };
    assert.equal(panelAutoDepthPivot3D(panel, page), true, 'un sujet doit être trouvé');
    const camAfter = { x: panel.camWx, y: panel.camWy, z: panel.camWz + panel.camDist };
    assertClose(camAfter.x, camBefore.x, 'caméra X inchangée', 1e-9);
    assertClose(camAfter.y, camBefore.y, 'caméra Y inchangée', 1e-9);
    assertClose(camAfter.z, camBefore.z, 'caméra Z inchangée', 1e-9);
  });

  test('le pivot atterrit sur l\'Élément visé et camDist devient sa distance réelle', () => {
    const panel = makePanel(0.3);
    const page = { w: 800, h: 600, objects: [panel, elemOnAxis()] };
    panelAutoDepthPivot3D(panel, page);
    assertClose(panel.camWz, -6, 'pivot posé sur l\'Élément (z=-6)', 1e-9);
    assertClose(panel.camDist, 6.3, 'camDist = distance caméra→Élément (0.3 + 6)', 1e-9);
    assertClose(panel.camWxTarget, panel.camWx, 'cible X synchronisée (pas d\'animation résiduelle)');
    assertClose(panel.camDistTarget, panel.camDist, 'cible camDist synchronisée');
  });

  test('un Élément hors du cône central est ignoré (on ne s\'accroche pas à ce qu\'on ne regarde pas)', () => {
    const panel = makePanel(0.3);
    // Même profondeur, mais très décalé latéralement → hors du tiers central du cadre.
    const far = { id: 'e2', type: 'perso', x: 0, y: 0, w: 40, h: 40,
                  wxFloor: 500, wyFloor: 1.15, wzFloor: -6 };
    const page = { w: 800, h: 600, objects: [panel, far] };
    panelAutoDepthPivot3D(panel, page);
    // Aucun Élément retenu → repli sur le Sol ; la caméra regarde à l'horizontale (backward.y = 0)
    // donc pas d'intersection sol non plus → pivot inchangé.
    assertClose(panel.camWz, 0, 'pivot inchangé quand rien n\'est visé');
    assertClose(panel.camDist, 0.3, 'camDist inchangé quand rien n\'est visé');
  });

  test('sans aucun Élément et caméra à l\'horizontale, renvoie false et ne touche à rien', () => {
    const panel = makePanel(0.3);
    const page = { w: 800, h: 600, objects: [panel] };
    assert.equal(panelAutoDepthPivot3D(panel, page), false, 'aucun sujet → false');
    assertClose(panel.camWz, 0, 'pivot intact');
    assertClose(panel.camDist, 0.3, 'camDist intact');
  });

  test('caméra plongeante sans Élément : repli sur le plan du Sol', () => {
    // rotX = +PI/2 → vue de dessus : backward = (0,1,0), donc l'axe de visée est -Y (vers le sol).
    const panel = { id: 'p1', type: 'panel', x: 0, y: 0, w: 800, h: 600,
                    camRotX: Math.PI / 2, camRotY: 0, camDist: 4,
                    camWx: 0, camWy: GROUND_Y_DEFAULT_3D + 10, camWz: 0 };
    const page = { w: 800, h: 600, objects: [panel] };
    assert.equal(panelAutoDepthPivot3D(panel, page), true, 'le Sol doit servir de repli');
    assertClose(panel.camWy, GROUND_Y_DEFAULT_3D, 'pivot posé sur le Sol', 1e-9);
    // Caméra était à y = 10 + 4 au-dessus du sol → distance au sol = 14.
    assertClose(panel.camDist, 14, 'camDist = distance caméra→Sol', 1e-9);
  });

  // ── Cas limites ───────────────────────────────────────────────────────────────────────────────

  test('l\'invariant « la caméra ne bouge pas » tient aussi pour une caméra quelconque (pitch + lacet)', () => {
    // Cas le plus discriminant : hors des axes, une erreur de signe dans la base passerait
    // inaperçue avec rotX=rotY=0 mais décalerait la caméra ici.
    const panel = { id: 'p1', type: 'panel', x: 0, y: 0, w: 800, h: 600,
                    camRotX: 0.42, camRotY: -1.13, camDist: 5,
                    camWx: 3, camWy: 2.4, camWz: -7 };
    const basis = panelCamBasis3D(panel);
    const camBefore = {
      x: panel.camWx + basis.backward.x * panel.camDist,
      y: panel.camWy + basis.backward.y * panel.camDist,
      z: panel.camWz + basis.backward.z * panel.camDist,
    };
    // Élément posé exactement sur l'axe de visée, 8 unités devant la caméra.
    const onAxis = { id: 'e1', type: 'perso', x: 380, y: 280, w: 40, h: 40,
                     wxFloor: camBefore.x - basis.backward.x * 8,
                     wyFloor: camBefore.y - basis.backward.y * 8,
                     wzFloor: camBefore.z - basis.backward.z * 8 };
    const page = { w: 800, h: 600, objects: [panel, onAxis] };
    assert.equal(panelAutoDepthPivot3D(panel, page), true, 'l\'Élément sur l\'axe doit être trouvé');
    assertClose(panel.camDist, 8, 'camDist = distance réelle caméra→Élément', 1e-9);
    assertClose(panel.camWx, onAxis.wxFloor, 'pivot posé sur l\'Élément (X)', 1e-9);
    assertClose(panel.camWy, onAxis.wyFloor, 'pivot posé sur l\'Élément (Y)', 1e-9);
    assertClose(panel.camWz, onAxis.wzFloor, 'pivot posé sur l\'Élément (Z)', 1e-9);
    const basisAfter = panelCamBasis3D(panel); // la rotation n'a pas changé → base identique
    assertClose(panel.camWx + basisAfter.backward.x * panel.camDist, camBefore.x, 'caméra X inchangée', 1e-9);
    assertClose(panel.camWy + basisAfter.backward.y * panel.camDist, camBefore.y, 'caméra Y inchangée', 1e-9);
    assertClose(panel.camWz + basisAfter.backward.z * panel.camDist, camBefore.z, 'caméra Z inchangée', 1e-9);
  });

  test('PAS DE DÉRIVE : deux rotations successives ne déplacent pas le pivot (idempotence)', () => {
    // Le bug d'origine était une impression de dérive du centre de rotation. Auto Depth étant
    // rejoué à CHAQUE glisser, il ne doit rien bouger une fois le pivot déjà posé sur le sujet.
    const panel = makePanel(0.3);
    const page = { w: 800, h: 600, objects: [panel, elemOnAxis()] };
    panelAutoDepthPivot3D(panel, page);
    const after1 = { x: panel.camWx, y: panel.camWy, z: panel.camWz, d: panel.camDist };
    panelAutoDepthPivot3D(panel, page);
    assertClose(panel.camWx, after1.x, 'pivot X stable au 2e appel', 1e-9);
    assertClose(panel.camWy, after1.y, 'pivot Y stable au 2e appel', 1e-9);
    assertClose(panel.camWz, after1.z, 'pivot Z stable au 2e appel', 1e-9);
    assertClose(panel.camDist, after1.d, 'camDist stable au 2e appel', 1e-9);
  });

  test('parmi plusieurs Éléments alignés, c\'est le plus proche devant la caméra qui gagne', () => {
    const panel = makePanel(0.3);
    const near = { id: 'near', type: 'perso', x: 380, y: 280, w: 40, h: 40,
                   wxFloor: 0, wyFloor: 1.15, wzFloor: -3 };
    const far  = { id: 'far',  type: 'perso', x: 380, y: 280, w: 40, h: 40,
                   wxFloor: 0, wyFloor: 1.15, wzFloor: -6 };
    // Ordre volontairement « loin d'abord » : le résultat ne doit pas dépendre de l'ordre du tableau.
    const page = { w: 800, h: 600, objects: [panel, far, near] };
    panelAutoDepthPivot3D(panel, page);
    assertClose(panel.camWz, -3, 'pivot posé sur le plus proche', 1e-9);
    assertClose(panel.camDist, 3.3, 'camDist = distance au plus proche', 1e-9);
  });

  test('un Élément situé DERRIÈRE la caméra est ignoré', () => {
    // NOTE (constatée par test de mutation) : ce rejet est assuré DEUX fois dans
    // panelAutoDepthPivot3D — par le garde-fou `along <= 0`, et incidemment par le filtre du cône
    // central, dont le seuil (proportionnel à `along`) devient négatif dès que l'Élément est dans
    // le dos. Supprimer le garde-fou ne fait donc pas tomber ce test : il verrouille le
    // COMPORTEMENT (rien derrière ne peut devenir pivot), pas cette ligne précise.
    const panel = makePanel(0.3);
    // Caméra en z=+0.3 regardant vers -Z ; cet Élément est encore plus loin en +Z, donc dans le dos.
    const behind = { id: 'b', type: 'perso', x: 380, y: 280, w: 40, h: 40,
                     wxFloor: 0, wyFloor: 1.15, wzFloor: 10 };
    const page = { w: 800, h: 600, objects: [panel, behind] };
    assert.equal(panelAutoDepthPivot3D(panel, page), false, 'rien devant → false');
    assertClose(panel.camDist, 0.3, 'camDist intact');
  });

  test('camDist reste borné au minimum de la molette (0.3) pour un sujet collé à la caméra', () => {
    const panel = makePanel(0.3);
    // Élément à 0.1 unité devant la caméra → sous le plancher autorisé.
    const glued = { id: 'g', type: 'perso', x: 380, y: 280, w: 40, h: 40,
                    wxFloor: 0, wyFloor: 1.15, wzFloor: 0.2 };
    const page = { w: 800, h: 600, objects: [panel, glued] };
    assert.equal(panelAutoDepthPivot3D(panel, page), true, 'sujet trouvé');
    assertClose(panel.camDist, 0.3, 'camDist clampé au minimum molette', 1e-9);
    // Le clamp ne doit PAS casser l'invariant : pivot = camPos + axe × camDist par construction.
    assertClose(panel.camWz + panel.camDist, 0.3, 'caméra toujours au même endroit malgré le clamp', 1e-9);
  });

  test('les Éléments masqués (hidden3d) ou sans coordonnées monde sont ignorés', () => {
    const panel = makePanel(0.3);
    const hidden  = { id: 'h', type: 'perso', x: 380, y: 280, w: 40, h: 40,
                      hidden3d: true, wxFloor: 0, wyFloor: 1.15, wzFloor: -6 };
    const noWorld = { id: 'n', type: 'perso', x: 380, y: 280, w: 40, h: 40 }; // wxFloor absent
    const page = { w: 800, h: 600, objects: [panel, hidden, noWorld] };
    assert.equal(panelAutoDepthPivot3D(panel, page), false, 'aucun candidat exploitable → false');
    assertClose(panel.camDist, 0.3, 'camDist intact');
  });
});

// ── worldPointToPageXY3D (Fix 26) ─────────────────────────────────────────────────────────────
describe('worldPointToPageXY3D — projection d\'un point monde quelconque (Fix 26)', () => {
  const page = { w: 800, h: 600 };
  const panelFace = () => ({ x: 0, y: 0, w: 800, h: 600,
                             camRotX: 0, camRotY: 0, camDist: 12, camWx: 0, camWy: 1.15, camWz: 0 });

  test('au niveau du Sol, donne exactement le même résultat que worldToPageXY', () => {
    // Garde-fou de refactorisation : worldFloorToScreen délègue désormais au même cœur.
    const panel = panelFace();
    const a = worldToPageXY(2.5, -4, panel, page);
    const b = worldPointToPageXY3D(2.5, GROUND_Y_DEFAULT_3D, -4, panel, page);
    assertClose(b.x, a.x, 'x identique', 1e-9);
    assertClose(b.y, a.y, 'y identique', 1e-9);
  });

  test('monter en Y dans le monde fait REMONTER le point à l\'écran (y canvas décroît)', () => {
    const panel = panelFace();
    const bas  = worldPointToPageXY3D(0, GROUND_Y_DEFAULT_3D,     -4, panel, page);
    const haut = worldPointToPageXY3D(0, GROUND_Y_DEFAULT_3D + 2, -4, panel, page);
    assert.ok(haut.y < bas.y, 'le haut du Mur doit se projeter plus haut que sa base');
    assertClose(haut.x, bas.x, 'pas de dérive horizontale sur un déplacement purement vertical', 1e-9);
  });

  test('point derrière la caméra : renvoie null', () => {
    const panel = panelFace();
    // Caméra en z = camWz + camDist = 12, regardant vers -Z : un point en z = 50 est dans le dos.
    assert.equal(worldPointToPageXY3D(0, GROUND_Y_DEFAULT_3D, 50, panel, page), null);
  });

  // LE bug corrigé par le Fix 26, capturé numériquement.
  test('RÉGRESSION : la largeur de la boîte 2D n\'est PAS une mesure valide de la longueur écran d\'un Mur', () => {
    const panel = panelFace();
    const len = 6, hl = len / 2;
    // Mur fuyant en profondeur : rotY = π/2 → son axe local est l'axe Z.
    const ca = Math.cos(Math.PI / 2), sa = Math.sin(Math.PI / 2);
    const e1 = worldPointToPageXY3D(-hl * ca, GROUND_Y_DEFAULT_3D,  hl * sa, panel, page);
    const e2 = worldPointToPageXY3D( hl * ca, GROUND_Y_DEFAULT_3D, -hl * sa, panel, page);
    const etendueH = Math.abs(e2.x - e1.x);            // ce que mesurait wall.w (boîte fine)
    const longueurEcran = Math.hypot(e2.x - e1.x, e2.y - e1.y);  // ce qu'utilise le Fix 26
    assert.ok(etendueH < 1,
      `un Mur fuyant se projette quasi verticalement : étendue horizontale ${etendueH.toFixed(2)} px`);
    assert.ok(longueurEcran > 100,
      `mais il occupe bien ${longueurEcran.toFixed(0)} px à l'écran`);
    // C'est ce rapport qui rendait le glisser ingérable : la fraction avançait ~200× trop vite.
    assert.ok(longueurEcran / Math.max(5, etendueH + 5) > 20,
      'l\'ancien dénominateur était plus de 20× trop petit dans cette configuration');
  });

  test('Mur DE FACE : les deux mesures coïncident (le cas courant n\'est pas modifié)', () => {
    const panel = panelFace();
    const hl = 3;
    const e1 = worldPointToPageXY3D(-hl, GROUND_Y_DEFAULT_3D, 0, panel, page);
    const e2 = worldPointToPageXY3D( hl, GROUND_Y_DEFAULT_3D, 0, panel, page);
    const etendueH = Math.abs(e2.x - e1.x);
    const longueurEcran = Math.hypot(e2.x - e1.x, e2.y - e1.y);
    assertClose(longueurEcran, etendueH, 'segment horizontal : longueur = étendue horizontale', 1e-6);
  });
});

// ── tracéPointAtFrac3D (Fix 27) ───────────────────────────────────────────────────────────────
describe('tracéPointAtFrac3D — point à une fraction d\'abscisse curviligne (Fix 27)', () => {
  // Chemin en L : 4 unités vers +x, puis 4 vers -z. Longueur totale 8.
  const L = [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: -4 }];

  test('les bornes rendent les extrémités exactes', () => {
    assert.deepEqual(tracéPointAtFrac3D(L, 0), { x: 0, z: 0 });
    assert.deepEqual(tracéPointAtFrac3D(L, 1), { x: 4, z: -4 });
  });

  test('progression par LONGUEUR d\'arc, pas par index de point', () => {
    // 0.5 → 4 unités parcourues → pile le coude, et non le milieu du 1er segment.
    const m = tracéPointAtFrac3D(L, 0.5);
    assertClose(m.x, 4, 'x au coude'); assertClose(m.z, 0, 'z au coude');
    // 0.25 → 2 unités → milieu du premier segment.
    const q = tracéPointAtFrac3D(L, 0.25);
    assertClose(q.x, 2, 'x au quart'); assertClose(q.z, 0, 'z au quart');
    // 0.75 → 6 unités → milieu du second segment.
    const t = tracéPointAtFrac3D(L, 0.75);
    assertClose(t.x, 4, 'x aux trois quarts'); assertClose(t.z, -2, 'z aux trois quarts');
  });

  test('segments de longueurs inégales : l\'avancée reste proportionnelle à la distance', () => {
    // 1 unité puis 9 : la moitié du parcours tombe à 5 unités, donc dans le second segment.
    const P = [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 10, z: 0 }];
    assertClose(tracéPointAtFrac3D(P, 0.5).x, 5, 'moitié de la LONGUEUR, pas du nombre de segments');
  });

  test('fraction hors bornes : clampée (pas d\'extrapolation au-delà du tracé)', () => {
    assert.deepEqual(tracéPointAtFrac3D(L, -3), { x: 0, z: 0 });
    assert.deepEqual(tracéPointAtFrac3D(L, 42), { x: 4, z: -4 });
  });

  test('cas dégénérés : liste vide, point unique, points tous superposés', () => {
    assert.equal(tracéPointAtFrac3D([], 0.5), null);
    assert.equal(tracéPointAtFrac3D(null, 0.5), null);
    assert.deepEqual(tracéPointAtFrac3D([{ x: 7, z: 9 }], 0.5), { x: 7, z: 9 });
    assert.deepEqual(tracéPointAtFrac3D([{ x: 2, z: 2 }, { x: 2, z: 2 }], 0.5), { x: 2, z: 2 },
      'longueur totale nulle : pas de division par zéro');
  });
});

// ── Mapping du glisser sur un Tracé (Fix 27) ──────────────────────────────────────────────────
describe('Tracé : échelle écran locale du chemin (Fix 27)', () => {
  const page = { w: 800, h: 600 };
  const panel = { x: 0, y: 0, w: 800, h: 600,
                  camRotX: 0, camRotY: 0, camDist: 12, camWx: 0, camWy: 1.15, camWz: 0 };
  const EPS = 0.02;
  // Reproduit le calcul du mousemove : axe écran pour une unité entière de fraction.
  function axeLocal(rawPts, frac) {
    const pts = smoothTracéPath3D(rawPts, 4);
    const f0 = Math.min(frac, 1 - EPS);
    const a = tracéPointAtFrac3D(pts, f0), b = tracéPointAtFrac3D(pts, f0 + EPS);
    const sa = worldPointToPageXY3D(a.x, GROUND_Y_DEFAULT_3D, a.z, panel, page);
    const sb = worldPointToPageXY3D(b.x, GROUND_Y_DEFAULT_3D, b.z, panel, page);
    return { x: (sb.x - sa.x) / EPS, y: (sb.y - sa.y) / EPS };
  }
  const droitFace   = [{ x: -5, z: 0 }, { x: 5, z: 0 }];
  const droitFuyant = [{ x: 0, z: 5 }, { x: 0, z: -5 }];

  test('RÉGRESSION : sur un tracé fuyant, la bbox 2D est ridicule face à l\'étendue écran réelle', () => {
    const A = axeLocal(droitFuyant, 0.5);
    const lg = Math.hypot(A.x, A.y);
    // La bbox 2D projetée de ce tracé est large de ~1 px (tous les points ont le même x écran).
    assert.ok(lg > 300, `échelle écran locale ≈ ${lg.toFixed(0)} px/fraction`);
    assert.ok(Math.abs(A.x) < 1, 'le tracé se projette quasi verticalement');
  });

  test('tracé fuyant : l\'axe est vertical, donc c\'est bien dy qui doit piloter le déplacement', () => {
    const A = axeLocal(droitFuyant, 0.5);
    assert.ok(Math.abs(A.y) > 100 * Math.abs(A.x) || Math.abs(A.x) < 1e-6,
      'composante verticale dominante');
  });

  test('tracé de face : l\'échelle locale retombe sur la longueur écran habituelle', () => {
    const A = axeLocal(droitFace, 0.5);
    assertClose(Math.abs(A.y), 0, 'axe horizontal', 1e-6);
    assert.ok(Math.abs(A.x) > 500, `échelle ≈ ${Math.abs(A.x).toFixed(0)} px — cas courant inchangé`);
  });

  test('l\'échelle locale suit la courbure : elle varie le long d\'un tracé en L', () => {
    const enL = [{ x: -5, z: 0 }, { x: 0, z: 0 }, { x: 0, z: -5 }];
    const a1 = axeLocal(enL, 0.15), a2 = axeLocal(enL, 0.85);
    // Première moitié quasi horizontale à l'écran, seconde quasi verticale : c'est précisément ce
    // qu'une mesure globale (ancienne bbox) ne pouvait pas capturer.
    assert.ok(Math.abs(a1.x) > Math.abs(a1.y), 'début : dominante horizontale');
    assert.ok(Math.abs(a2.y) > Math.abs(a2.x), 'fin : dominante verticale');
  });
});

// ── tracéWallHostOf3D / wallOpeningWorldPosOnTracé3D (Fix 28) ─────────────────────────────────
// Une Parois posée sur un Tracé mur (muret, clôture, haie, barrière) n'a PAS de position monde
// propre : elle est placée en parcourant le chemin de son hôte. Ces deux fonctions sont la source
// unique de cette position, partagée par le rendu ET la caméra — c'est leur divergence qui faisait
// que la caméra ne se centrait pas au bon endroit.
describe('tracéWallHostOf3D — hôte Tracé d\'une Parois (Fix 28)', () => {
  const muret = { id: 'm1', type: 'tracé', tracéType: 'muret',
                  world: { pts: [{ x: 0, z: 0 }, { x: 10, z: 0 }] } };
  const porte = { id: 'p1', type: 'objet3d', objType: 'porte_ouverte', magnetWallId: 'm1' };
  const pageOf = (...objs) => ({ w: 800, h: 600, objects: objs });

  test('trouve un hôte muret / clôture / haie / barrière', () => {
    for (const t of ['muret', 'cloture', 'haie', 'barriere']) {
      const h = { ...muret, tracéType: t };
      assert.equal(tracéWallHostOf3D(porte, pageOf(h, porte)), h, `hôte ${t}`);
    }
  });

  test('ne matche PAS un Tracé qui n\'est pas un mur (route, chemin)', () => {
    for (const t of ['route', 'chemin', 'terrain']) {
      assert.equal(tracéWallHostOf3D(porte, pageOf({ ...muret, tracéType: t }, porte)), null, t);
    }
  });

  test('ne matche PAS un Mur classique : c\'est l\'autre chemin (WALL_TYPES)', () => {
    const mur = { id: 'm1', type: 'objet3d', objType: 'mur' };
    assert.equal(tracéWallHostOf3D(porte, pageOf(mur, porte)), null);
  });

  test('ignore un Élément non aimanté ou d\'un type non-Parois', () => {
    assert.equal(tracéWallHostOf3D({ ...porte, magnetWallId: null }, pageOf(muret)), null);
    assert.equal(tracéWallHostOf3D({ ...porte, objType: 'chaise' }, pageOf(muret, porte)), null);
    assert.equal(tracéWallHostOf3D({ ...porte, type: 'perso' }, pageOf(muret, porte)), null);
    assert.equal(tracéWallHostOf3D(null, pageOf(muret)), null);
  });
});

describe('wallOpeningWorldPosOnTracé3D — position réelle d\'une Parois sur un Tracé (Fix 28)', () => {
  // Muret en L : 10 u vers +x puis 10 u vers -z. Longueur totale 20.
  const muretL = { id: 'm1', type: 'tracé', tracéType: 'muret', wallHeight: 2,
                   world: { pts: [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: -10 }] } };
  const porteAt = (frac, yFrac) => ({ id: 'p1', type: 'objet3d', objType: 'porte_ouverte',
                                      magnetWallId: 'm1', wallAlongFrac: frac, wallYFrac: yFrac });
  const pageOf = (...o) => ({ w: 800, h: 600, objects: o });

  test('la position suit wallAlongFrac le long du chemin', () => {
    const p0 = wallOpeningWorldPosOnTracé3D(porteAt(0, 0), pageOf(muretL, porteAt(0, 0)));
    assertClose(p0.x, 0, 'début x'); assertClose(p0.z, 0, 'début z');
    const p1 = wallOpeningWorldPosOnTracé3D(porteAt(1, 0), pageOf(muretL, porteAt(1, 0)));
    assertClose(p1.x, 10, 'fin x'); assertClose(p1.z, -10, 'fin z');
  });

  test('la hauteur suit wallYFrac × hauteur du muret, depuis le Sol', () => {
    // childHUnits explicitement 0 : la fraction couvre toute la hauteur du muret.
    const bas  = wallOpeningWorldPosOnTracé3D(porteAt(0.5, 0), pageOf(muretL, porteAt(0.5, 0)), 0);
    const haut = wallOpeningWorldPosOnTracé3D(porteAt(0.5, 1), pageOf(muretL, porteAt(0.5, 1)), 0);
    assertClose(bas.y,  GROUND_Y_DEFAULT_3D,     'yFrac 0 → au Sol');
    assertClose(haut.y, GROUND_Y_DEFAULT_3D + 2, 'yFrac 1 → sommet du muret (wallHeight 2)');
  });

  test('hauteur par défaut du type quand le muret n\'en définit pas', () => {
    const sansH = { ...muretL, wallHeight: undefined };
    const p = wallOpeningWorldPosOnTracé3D(porteAt(0.5, 1), pageOf(sansH, porteAt(0.5, 1)), 0);
    assertClose(p.y, GROUND_Y_DEFAULT_3D + TRACÉ_DEFAULTS.muret.wallHeight,
      'valeur par défaut TRACÉ_DEFAULTS.muret');
  });

  // Fix 31 — childHUnits omis : la valeur par défaut est la hauteur RÉELLE de la Parois (o.h),
  // celle-là même avec laquelle le trou est découpé. Avant, l'omission valait 0, donc la caméra et
  // le trou n'utilisaient pas la même travée que le rig et se décalaient verticalement.
  test('childHUnits omis → travée réduite de la hauteur propre de la Parois (o.h)', () => {
    const porte = { ...porteAt(0.5, 1), h: 40 }; // 40 px / WALL_PX_PER_UNIT_3D = 1 unité
    const p = wallOpeningWorldPosOnTracé3D(porte, pageOf(muretL, porte));
    assertClose(p.spanY, 1, 'travée = wallHeight 2 − hauteur 1');
    assertClose(p.y, GROUND_Y_DEFAULT_3D + 1, 'yFrac 1 → sommet de la Parois affleurant le muret');
  });

  test('childHUnits omis, sans o.h : retombe sur la taille par défaut (0.5)', () => {
    const p = wallOpeningWorldPosOnTracé3D(porteAt(0.5, 1), pageOf(muretL, porteAt(0.5, 1)));
    assertClose(p.spanY, 1.5, 'travée = wallHeight 2 − défaut 0.5');
  });

  test('Parois plus haute que son muret : travée plancher à 0.01, jamais négative', () => {
    const porte = { ...porteAt(0.5, 1), h: 400 }; // 10 unités contre un muret de 2
    const p = wallOpeningWorldPosOnTracé3D(porte, pageOf(muretL, porte));
    assertClose(p.spanY, 0.01, 'plancher');
  });

  test('la tangente suit la direction locale du chemin (elle tourne dans le L)', () => {
    const debut = wallOpeningWorldPosOnTracé3D(porteAt(0.1, 0), pageOf(muretL, porteAt(0.1, 0)));
    const fin   = wallOpeningWorldPosOnTracé3D(porteAt(0.9, 0), pageOf(muretL, porteAt(0.9, 0)));
    assert.ok(Math.abs(debut.tangent.x) > Math.abs(debut.tangent.z), 'début : le long de +x');
    assert.ok(Math.abs(fin.tangent.z)   > Math.abs(fin.tangent.x),   'fin : le long de -z');
  });

  test('RÉGRESSION : la position ignore les wxFloor/wzFloor périmés de la Parois', () => {
    // C'est exactement ce sur quoi la caméra se rabattait, d'où le mauvais centrage.
    const perimee = { ...porteAt(0.5, 0), wxFloor: -999, wzFloor: 999, wyFloor: 42 };
    const p = wallOpeningWorldPosOnTracé3D(perimee, pageOf(muretL, perimee));
    assert.ok(Math.abs(p.x - (-999)) > 100 && Math.abs(p.z - 999) > 100,
      'la position vient du chemin, pas des coordonnées stockées');
    assertClose(p.x, 10, 'milieu du L : bout du 1er segment (x)');
    assertClose(p.z, 0,  'milieu du L : bout du 1er segment (z)');
  });

  test('wallAlongFrac absent : par défaut au milieu du tracé', () => {
    const sansFrac = { id: 'p1', type: 'objet3d', objType: 'porte_ouverte', magnetWallId: 'm1' };
    const p = wallOpeningWorldPosOnTracé3D(sansFrac, pageOf(muretL, sansFrac));
    assertClose(p.x, 10, 'milieu x'); assertClose(p.z, 0, 'milieu z');
  });

  test('renvoie null si l\'hôte n\'est pas un Tracé mur, ou n\'a pas de chemin monde', () => {
    const p = porteAt(0.5, 0);
    assert.equal(wallOpeningWorldPosOnTracé3D(p, pageOf({ ...muretL, world: null }, p)), null);
    assert.equal(wallOpeningWorldPosOnTracé3D(p, pageOf({ ...muretL, world: { pts: [{ x: 1, z: 1 }] } }, p)), null,
      'un seul point : pas de chemin');
    assert.equal(wallOpeningWorldPosOnTracé3D(p, pageOf({ id: 'm1', type: 'objet3d', objType: 'mur' }, p)), null);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 31 — rendu d'une Parois sur un Tracé mur : taille du trou = taille du rig,
// pose plaquée sur une face, et tableau (jambages/linteau/appui) autour de l'ouverture.
// ─────────────────────────────────────────────────────────────────────────────

describe('tracéOpeningSize3D — taille monde d\'une Parois sur un Tracé (Fix 31)', () => {
  test('convertit o.w/o.h en unités monde via WALL_PX_PER_UNIT_3D', () => {
    const s = tracéOpeningSize3D({ w: 80, h: 44 });
    assertClose(s.w, 80 / WALL_PX_PER_UNIT_3D, 'largeur');
    assertClose(s.h, 44 / WALL_PX_PER_UNIT_3D, 'hauteur');
  });

  test('retombe sur 0.5 quand la dimension est absente ou nulle', () => {
    assert.deepEqual(tracéOpeningSize3D({}), { w: 0.5, h: 0.5 });
    assert.deepEqual(tracéOpeningSize3D({ w: 0, h: 0 }), { w: 0.5, h: 0.5 });
  });
});

describe('tracéWallThickness3D — épaisseur du Tracé mur (Fix 31)', () => {
  test('suit le ratio du type appliqué à wallHeight', () => {
    assertClose(tracéWallThickness3D({ tracéType: 'muret', wallHeight: 2 }), 2 * 0.12, 'muret');
    assertClose(tracéWallThickness3D({ tracéType: 'haie', wallHeight: 2 }), 2 * 0.611, 'haie');
  });

  test('utilise la hauteur par défaut du type quand wallHeight est absent', () => {
    // Lit la table plutôt que de recopier le nombre : ce qui est vérifié ici, c'est que le repli
    // passe bien par TRACÉ_DEFAULTS. La valeur elle-même est verrouillée par le test dédié ci-dessous.
    assertClose(tracéWallThickness3D({ tracéType: 'muret' }),
      TRACÉ_DEFAULTS.muret.wallHeight * 0.12, 'défaut muret');
    assertClose(tracéWallThickness3D({ tracéType: 'barriere' }), 0.55 * (0.55 * 0.529), 'défaut barrière');
  });

  test('la Barrière prend la partie HAUTE (étroite), pas la base évasée', () => {
    // Sinon la Parois, plaquée sur une base de 0.545 d'épaisseur, flotterait devant
    // la partie supérieure, bien plus fine (topH × 0.529).
    const b = { tracéType: 'barriere', wallHeight: 0.55 };
    const baseH = 0.55 * 0.45, topH = 0.55 - baseH;
    assert.ok(tracéWallThickness3D(b) < baseH * 1.212, 'plus fin que la base');
    assertClose(tracéWallThickness3D(b), topH * 0.529, 'égal à la partie haute', 1e-6);
  });

  test('hôte absent → 0 (pas de décalage de plaquage)', () => {
    assert.equal(tracéWallThickness3D(null), 0);
  });
});

describe('tracéOpeningRigScale3D — échelle NON uniforme du rig (Fix 31)', () => {
  test('largeur et hauteur suivent indépendamment la taille demandée', () => {
    // fenetre_ouverte : design 1.0 × 1.1
    const sc = tracéOpeningRigScale3D('fenetre_ouverte', 2.0, 0.55);
    assertClose(sc.sx, 2.0, 'sx = 2.0 / 1.0');
    assertClose(sc.sy, 0.5, 'sy = 0.55 / 1.1');
  });

  test('RÉGRESSION : sx ≠ sy — l\'échelle uniforme de placeRigCentered3D ignorait o.w', () => {
    // C'est la cause du symptôme « la Fenêtre a l\'air enfoncée » : elle était mise à
    // l\'échelle sur sa seule hauteur, donc jamais aussi large que le trou découpé pour elle.
    const sc = tracéOpeningRigScale3D('fenetre_ouverte', 2.0, 0.55);
    assert.ok(Math.abs(sc.sx - sc.sy) > 1e-6, 'les deux axes doivent pouvoir diverger');
  });

  test('sz suit sy, comme pour une Parois portée par un vrai Mur', () => {
    const sc = tracéOpeningRigScale3D('porte_ouverte', 1.5, 2.5);
    assertClose(sc.sz, sc.sy, 'profondeur indexée sur la hauteur');
  });

  test('type inconnu → design de repli 1 × 1.5, sans division par zéro', () => {
    const sc = tracéOpeningRigScale3D('type_inexistant', 3, 3);
    assertClose(sc.sx, 3, 'sx');
    assertClose(sc.sy, 2, 'sy');
    assert.ok(Number.isFinite(tracéOpeningRigScale3D('fenetre_ouverte', 1, 1).sx));
  });
});

describe('tracéOpeningFlushOffset3D — plaquage sur une face (Fix 31)', () => {
  test('décale d\'une demi-épaisseur moins une demi-profondeur de rig', () => {
    assertClose(tracéOpeningFlushOffset3D(0.72, 0.20), 0.26, 'face avant');
  });

  test('wallSide arrière inverse le côté', () => {
    assertClose(tracéOpeningFlushOffset3D(0.72, 0.20, 'arriere'), -0.26, 'face arrière');
    assertClose(tracéOpeningFlushOffset3D(0.72, 0.20, 'avant'), 0.26, 'face avant explicite');
  });

  test('Parois plus épaisse que le mur → 0, elle reste centrée', () => {
    assertClose(tracéOpeningFlushOffset3D(0.2, 0.9), 0, 'jamais poussée hors du mur');
    assertClose(tracéOpeningFlushOffset3D(0.2, 0.9, 'arriere'), 0, 'idem côté arrière');
  });

  test('épaisseur ou profondeur manquante : pas de NaN', () => {
    assert.ok(Number.isFinite(tracéOpeningFlushOffset3D(undefined, undefined)));
    assertClose(tracéOpeningFlushOffset3D(0.4, undefined), 0.2, 'profondeur nulle');
  });
});

describe('tracéFrameAtFrac3D — point + tangente unitaire sur un Tracé (Fix 31)', () => {
  const L = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: -10 }];

  test('la tangente est unitaire et suit la direction locale', () => {
    const a = tracéFrameAtFrac3D(L, 0.1);
    assertClose(Math.hypot(a.tx, a.tz), 1, 'norme');
    assertClose(a.tx, 1, 'première branche : tx', 1e-6);
    assertClose(a.tz, 0, 'première branche : tz', 1e-6);
    const b = tracéFrameAtFrac3D(L, 0.9);
    assertClose(b.tx, 0, 'deuxième branche : tx', 1e-6);
    assertClose(b.tz, -1, 'deuxième branche : tz', 1e-6);
  });

  test('le point coïncide avec tracéPointAtFrac3D (une seule marche sur le chemin)', () => {
    for (const f of [0, 0.25, 0.5, 0.75, 1]) {
      const p = tracéPointAtFrac3D(L, f), q = tracéFrameAtFrac3D(L, f);
      assertClose(q.x, p.x, `x @${f}`); assertClose(q.z, p.z, `z @${f}`);
    }
  });

  test('frac 1 reste défini : l\'échantillonnage recule avant le bout du chemin', () => {
    const e = tracéFrameAtFrac3D(L, 1);
    assert.ok(e && Math.abs(Math.hypot(e.tx, e.tz) - 1) < 1e-6, 'tangente encore utilisable en fin');
  });

  test('chemin dégénéré (points superposés) → null plutôt qu\'une direction inventée', () => {
    assert.equal(tracéFrameAtFrac3D([{ x: 3, z: 3 }, { x: 3, z: 3 }], 0.5), null);
    assert.equal(tracéFrameAtFrac3D([], 0.5), null);
  });
});

describe('buildOpeningRevealGroup3D — tableau autour de l\'ouverture (Fix 31)', () => {
  const at = { x: 4, z: -2, tx: 1, tz: 0 };
  const hole = { cW: 1, cH: 0.6, yMin: -2.5, yMax: -1.9, at };

  test('jambages + linteau + appui quand l\'ouverture ne touche ni le sol ni le sommet', () => {
    const g = buildOpeningRevealGroup3D(hole, 0.72, '#606060', -3, -1);
    assert.equal(g.children.length, 4, '2 jambages + linteau + appui');
  });

  test('pas de linteau flottant au-dessus de la crête du muret', () => {
    const g = buildOpeningRevealGroup3D({ ...hole, yMax: -1.0 }, 0.72, '#606060', -3, -1);
    assert.equal(g.children.length, 3, 'linteau supprimé');
  });

  test('pas d\'appui enterré quand l\'ouverture part du sol', () => {
    const g = buildOpeningRevealGroup3D({ ...hole, yMin: -3 }, 0.72, '#606060', -3, -1);
    assert.equal(g.children.length, 3, 'appui supprimé');
  });

  test('posé au point du trou et orienté sur la tangente (même convention que le rig)', () => {
    const g = buildOpeningRevealGroup3D(hole, 0.72, '#606060', -3, -1);
    assertClose(g.position.x, 4, 'x'); assertClose(g.position.z, -2, 'z');
    assertClose(g.rotation.y, Math.atan2(-at.tz, at.tx), 'lacet');
    const tourne = buildOpeningRevealGroup3D({ ...hole, at: { x: 0, z: 0, tx: 0, tz: -1 } }, 0.72, '#606060', -3, -1);
    assertClose(tourne.rotation.y, Math.atan2(1, 0), 'lacet sur la branche en -z');
  });

  test('plus profond que le mur : le relief déborde des DEUX faces', () => {
    const g = buildOpeningRevealGroup3D(hole, 0.72, '#606060', -3, -1);
    const d = g.children[0].geometry.parameters.depth;
    assert.ok(d > 0.72, `profondeur ${d} > épaisseur du mur 0.72`);
  });

  test('descripteur inutilisable → null, jamais un groupe vide dans la scène', () => {
    assert.equal(buildOpeningRevealGroup3D(null, 0.72, '#606060'), null);
    assert.equal(buildOpeningRevealGroup3D({ ...hole, at: null }, 0.72, '#606060'), null);
    assert.equal(buildOpeningRevealGroup3D({ ...hole, cW: 0 }, 0.72, '#606060'), null);
    assert.equal(buildOpeningRevealGroup3D(hole, 0, '#606060'), null, 'mur sans épaisseur');
  });
});

describe('tracéOpeningHole3D — trou découpé dans le Tracé mur (Fix 31)', () => {
  const droit = [{ x: 0, z: 0 }, { x: 20, z: 0 }];
  const muret = { id: 'm1', type: 'tracé', tracéType: 'muret', wallHeight: 2,
                  world: { pts: droit } };
  // 40 px = 1 unité monde ; travée verticale = 2 − 1 = 1.
  const fenetre = { id: 'f1', type: 'objet3d', objType: 'fenetre_ouverte', magnetWallId: 'm1',
                    w: 60, h: 40, wallAlongFrac: 0.25, wallYFrac: 0.5 };

  test('le trou est centré sur wallAlongFrac et large de o.w', () => {
    const h = tracéOpeningHole3D(fenetre, droit, 20, GROUND_Y_DEFAULT_3D, 2);
    assertClose((h.arcStart + h.arcEnd) / 2, 5, 'centre = 0.25 × 20');
    assertClose(h.arcEnd - h.arcStart, 1.5, 'largeur = 60 / 40');
  });

  test('la bande verticale fait exactement la hauteur de la Parois', () => {
    const h = tracéOpeningHole3D(fenetre, droit, 20, GROUND_Y_DEFAULT_3D, 2);
    assertClose(h.yMax - h.yMin, 1, 'hauteur = 40 / 40');
  });

  // LE test de non-régression du Fix 31 : c'est cette divergence qui faisait grimper le trou
  // plus vite que la Fenêtre dès qu'on la montait le long du muret.
  test('RÉGRESSION : le bas du trou suit la MÊME travée que la pose du rig', () => {
    for (const yFrac of [0, 0.25, 0.5, 0.75, 1]) {
      const f = { ...fenetre, wallYFrac: yFrac };
      const page = { w: 800, h: 600, objects: [muret, f] };
      const pos = wallOpeningWorldPosOnTracé3D(f, page);
      const h = tracéOpeningHole3D(f, droit, 20, GROUND_Y_DEFAULT_3D, 2);
      assertClose(h.yMin, pos.y, `bas du trou = base du rig @yFrac ${yFrac}`, 1e-9);
    }
  });

  test('yFrac 1 : le HAUT du trou affleure la crête du muret, il ne la dépasse pas', () => {
    const h = tracéOpeningHole3D({ ...fenetre, wallYFrac: 1 }, droit, 20, GROUND_Y_DEFAULT_3D, 2);
    assertClose(h.yMax, GROUND_Y_DEFAULT_3D + 2, 'sommet affleurant');
  });

  test('wallAlongFrac est bornée à [0, 1] et vaut 0.5 par défaut', () => {
    const hors = tracéOpeningHole3D({ ...fenetre, wallAlongFrac: 4 }, droit, 20, GROUND_Y_DEFAULT_3D, 2);
    assertClose((hors.arcStart + hors.arcEnd) / 2, 20, 'bornée à la fin du chemin');
    const sans = tracéOpeningHole3D({ ...fenetre, wallAlongFrac: undefined }, droit, 20, GROUND_Y_DEFAULT_3D, 2);
    assertClose((sans.arcStart + sans.arcEnd) / 2, 10, 'milieu par défaut');
  });

  test('expose le point + la tangente, pour que le tableau colle au trou', () => {
    const h = tracéOpeningHole3D(fenetre, droit, 20, GROUND_Y_DEFAULT_3D, 2);
    assertClose(h.at.x, 5, 'x du trou'); assertClose(h.at.z, 0, 'z du trou');
    assertClose(Math.hypot(h.at.tx, h.at.tz), 1, 'tangente unitaire');
  });
});

describe('tracéOpeningWorldCenter3D — centre d\'une Parois sur un Tracé (Fix 31)', () => {
  const droit = [{ x: 0, z: 0 }, { x: 6, z: 0 }];
  const muret = { id: 'm1', type: 'tracé', tracéType: 'muret', wallHeight: 0.5,
                  world: { pts: droit } };
  // 12 px = 0.3 u de haut contre un muret de 0.5 → travée verticale de 0.2.
  const fenetre = y => ({ id: 'f1', type: 'objet3d', objType: 'fenetre_ouverte',
                          magnetWallId: 'm1', w: 14, h: 12, wallAlongFrac: 0.5, wallYFrac: y });

  test('renvoie le CENTRE, une demi-hauteur au-dessus de la base renvoyée par le Fix 28', () => {
    const o = fenetre(0), page = { w: 800, h: 600, objects: [muret, o] };
    const base = wallOpeningWorldPosOnTracé3D(o, page);
    const c = tracéOpeningWorldCenter3D(o, page);
    assertClose(c.y - base.y, 0.15, 'demi-hauteur de la Parois');
    assertClose(c.x, base.x, 'x inchangé'); assertClose(c.z, base.z, 'z inchangé');
  });

  // LE test de non-régression de la render-box décalée : le centre doit tomber pile au milieu
  // du trou, sur TOUTE la plage de wallYFrac. L'ancienne formule mappait wallYFrac sur la
  // hauteur TOTALE du muret et dérivait vers le haut, jusqu'à une hauteur de Fenêtre entière.
  test('RÉGRESSION : le centre reste au milieu du trou quel que soit wallYFrac', () => {
    for (const y of [0, 0.25, 0.5, 0.75, 1]) {
      const o = fenetre(y), page = { w: 800, h: 600, objects: [muret, o] };
      const c = tracéOpeningWorldCenter3D(o, page);
      const h = tracéOpeningHole3D(o, droit, 6, GROUND_Y_DEFAULT_3D, 0.5);
      assertClose(c.y, (h.yMin + h.yMax) / 2, `centre du trou @yFrac ${y}`);
    }
  });

  test('la dérive de l\'ancienne formule croît avec wallYFrac (0 en bas, pleine hauteur en haut)', () => {
    // Vérifie que le bug ÉTAIT bien invisible en déplacement horizontal (yFrac constant à 0)
    // et maximal en haut du muret — ce qui correspond au symptôme rapporté.
    const ancienne = y => GROUND_Y_DEFAULT_3D + y * 0.5 + 0.3 / 2;
    const derive = y => {
      const o = fenetre(y);
      return ancienne(y) - tracéOpeningWorldCenter3D(o, { w: 800, h: 600, objects: [muret, o] }).y;
    };
    assertClose(derive(0), 0, 'aucune dérive au pied du muret');
    assertClose(derive(1), 0.3, 'une hauteur de Fenêtre entière au sommet');
    assert.ok(derive(0.5) > derive(0.25), 'croissante');
  });

  test('Élément qui n\'est pas sur un Tracé mur → null', () => {
    const o = fenetre(0);
    assert.equal(tracéOpeningWorldCenter3D(o, { w: 800, h: 600, objects: [o] }), null);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 31 — INVARIANTS Muret ↔ Parois.
//
// Quatre bugs successifs (Fix 28, 30, 31, 31b) ont eu la même cause : deux bouts de
// code calculant indépendamment le même point, puis divergeant. Les tests unitaires
// ci-dessus valident chaque fonction isolément ; cette suite-ci verrouille les
// RELATIONS entre elles, balayées sur toute la plage des deux fractions.
// ─────────────────────────────────────────────────────────────────────────────

describe('INVARIANTS Muret ↔ Parois — cohérence trou / rig / boîte / caméra (Fix 31)', () => {
  const FRACS = [0, 0.13, 0.25, 0.5, 0.75, 0.87, 1];
  const cas = {
    droit:  [{ x: 0, z: 0 }, { x: 8, z: 0 }],
    enL:    [{ x: 0, z: 0 }, { x: 6, z: 0 }, { x: 6, z: -6 }],
    // Boucle ovale : le cas qui avait fait s'inverser la direction du glisser (Fix 29).
    boucle: Array.from({ length: 13 }, (_, i) => {
      const a = (i / 12) * Math.PI * 2;
      return { x: 4 * Math.cos(a), z: 2.5 * Math.sin(a) };
    }),
  };
  const muret = pts => ({ id: 'm1', type: 'tracé', tracéType: 'muret', wallHeight: 0.5,
                          world: { pts } });
  const fen = (a, y) => ({ id: 'f1', type: 'objet3d', objType: 'fenetre_ouverte',
                           magnetWallId: 'm1', w: 14, h: 12,
                           wallAlongFrac: a, wallYFrac: y });
  const ctx = (pts, a, y) => {
    const o = fen(a, y), w = muret(pts);
    return { o, w, page: { w: 800, h: 600, objects: [w, o] },
             smooth: smoothTracéPath3D(pts, 4) };
  };
  const longueur = pts => {
    let t = 0;
    for (let i = 1; i < pts.length; i++) t += Math.hypot(pts[i].x - pts[i-1].x, pts[i].z - pts[i-1].z);
    return t;
  };

  for (const [nom, pts] of Object.entries(cas)) {
    describe(`muret « ${nom} »`, () => {
      test('le trou est découpé exactement là où la Parois est posée (le long du chemin)', () => {
        for (const a of FRACS) {
          const { o, page, smooth } = ctx(pts, a, 0.5);
          const pos = wallOpeningWorldPosOnTracé3D(o, page);
          const h = tracéOpeningHole3D(o, smooth, longueur(smooth), GROUND_Y_DEFAULT_3D, 0.5);
          assertClose(h.at.x, pos.x, `x @along ${a}`, 1e-9);
          assertClose(h.at.z, pos.z, `z @along ${a}`, 1e-9);
        }
      });

      test('la Parois remplit son trou : base sur base, sommet sur sommet', () => {
        for (const y of FRACS) {
          const { o, page, smooth } = ctx(pts, 0.4, y);
          const pos = wallOpeningWorldPosOnTracé3D(o, page);
          const h = tracéOpeningHole3D(o, smooth, longueur(smooth), GROUND_Y_DEFAULT_3D, 0.5);
          const { h: cH } = tracéOpeningSize3D(o);
          assertClose(h.yMin, pos.y, `base @yFrac ${y}`, 1e-9);
          assertClose(h.yMax, pos.y + cH, `sommet @yFrac ${y}`, 1e-9);
        }
      });

      test('la boîte de rendu ET la caméra visent le milieu du trou', () => {
        for (const a of FRACS) for (const y of FRACS) {
          const { o, page, smooth } = ctx(pts, a, y);
          const c = tracéOpeningWorldCenter3D(o, page);
          const h = tracéOpeningHole3D(o, smooth, longueur(smooth), GROUND_Y_DEFAULT_3D, 0.5);
          assertClose(c.y, (h.yMin + h.yMax) / 2, `milieu @${a}/${y}`, 1e-9);
          assertClose(c.x, h.at.x, `x @${a}/${y}`, 1e-9);
          assertClose(c.z, h.at.z, `z @${a}/${y}`, 1e-9);
        }
      });

      test('la Parois ne sort JAMAIS du muret, quelles que soient les deux fractions', () => {
        for (const a of FRACS) for (const y of FRACS) {
          const { o, page } = ctx(pts, a, y);
          const pos = wallOpeningWorldPosOnTracé3D(o, page);
          const { h: cH } = tracéOpeningSize3D(o);
          assert.ok(pos.y >= GROUND_Y_DEFAULT_3D - 1e-9, `sous le sol @${a}/${y}`);
          assert.ok(pos.y + cH <= GROUND_Y_DEFAULT_3D + 0.5 + 1e-9, `au-dessus de la crête @${a}/${y}`);
        }
      });

      test('le tableau est posé sur le trou et orienté comme la Parois', () => {
        for (const a of FRACS) {
          const { o, page, smooth } = ctx(pts, a, 0.5);
          const h = tracéOpeningHole3D(o, smooth, longueur(smooth), GROUND_Y_DEFAULT_3D, 0.5);
          const rev = buildOpeningRevealGroup3D(h, 0.18, '#606060',
            GROUND_Y_DEFAULT_3D, GROUND_Y_DEFAULT_3D + 0.5);
          const pos = wallOpeningWorldPosOnTracé3D(o, page);
          assertClose(rev.position.x, pos.x, `x @${a}`, 1e-9);
          assertClose(rev.position.z, pos.z, `z @${a}`, 1e-9);
          // Le rig et le tableau échantillonnent DÉSORMAIS la même tangente : l'égalité doit être
          // exacte, pas approchée. Avec l'ancienne tangente « segment brut » du rig, l'écart
          // atteignait ~0.83 rad dans un coude et les deux se croisaient visiblement.
          const yawRig = Math.atan2(-pos.tangent.z, pos.tangent.x);
          const d = Math.abs(((rev.rotation.y - yawRig + Math.PI) % (2 * Math.PI)) - Math.PI);
          assert.ok(d < 1e-9, `lacet identique @${a} (écart ${d.toFixed(6)} rad)`);
        }
      });
    });
  }

  test('agrandir la Parois agrandit le trou d\'autant, et la met à l\'échelle d\'autant', () => {
    const smooth = smoothTracéPath3D(cas.droit, 4), L = longueur(smooth);
    const petite = { ...fen(0.5, 0), w: 14, h: 12 };
    const grande = { ...fen(0.5, 0), w: 28, h: 24 };
    const hp = tracéOpeningHole3D(petite, smooth, L, GROUND_Y_DEFAULT_3D, 0.5);
    const hg = tracéOpeningHole3D(grande, smooth, L, GROUND_Y_DEFAULT_3D, 0.5);
    assertClose((hg.arcEnd - hg.arcStart) / (hp.arcEnd - hp.arcStart), 2, 'trou 2× plus large');
    const sp = tracéOpeningRigScale3D('fenetre_ouverte', ...Object.values(tracéOpeningSize3D(petite)));
    const sg = tracéOpeningRigScale3D('fenetre_ouverte', ...Object.values(tracéOpeningSize3D(grande)));
    assertClose(sg.sx / sp.sx, 2, 'rig 2× plus large');
    assertClose(sg.sy / sp.sy, 2, 'rig 2× plus haut');
  });

  test('changer la hauteur du muret redistribue la travée sans faire sortir la Parois', () => {
    for (const wallH of [0.35, 0.5, 1.2, 3]) {
      const w = { ...muret(cas.droit), wallHeight: wallH };
      const o = fen(0.5, 1);
      const pos = wallOpeningWorldPosOnTracé3D(o, { w: 800, h: 600, objects: [w, o] });
      const { h: cH } = tracéOpeningSize3D(o);
      assertClose(pos.y + cH, GROUND_Y_DEFAULT_3D + wallH, `sommet affleurant @wallHeight ${wallH}`);
    }
  });

  test('les 4 types de Tracé mur portent une Parois ; les autres Tracés la refusent', () => {
    const o = fen(0.5, 0.5);
    for (const t of ['muret', 'cloture', 'haie', 'barriere']) {
      const w = { ...muret(cas.droit), tracéType: t, wallHeight: undefined };
      const page = { w: 800, h: 600, objects: [w, o] };
      assert.ok(wallOpeningWorldPosOnTracé3D(o, page), `porté par ${t}`);
      assert.ok(tracéWallThickness3D(w) > 0, `épaisseur définie pour ${t}`);
    }
    for (const t of ['route', 'chemin', 'terrain']) {
      const w = { ...muret(cas.droit), tracéType: t };
      assert.equal(wallOpeningWorldPosOnTracé3D(o, { w: 800, h: 600, objects: [w, o] }), null, t);
      assert.equal(tracéOpeningWorldCenter3D(o, { w: 800, h: 600, objects: [w, o] }), null, t);
    }
  });

  test('deux Parois sur le même muret ne partagent aucun état', () => {
    const w = muret(cas.enL);
    const a = { ...fen(0.2, 0), id: 'f1' };
    const b = { ...fen(0.8, 1), id: 'f2', w: 28, h: 16 };
    const page = { w: 800, h: 600, objects: [w, a, b] };
    const pa = wallOpeningWorldPosOnTracé3D(a, page), pb = wallOpeningWorldPosOnTracé3D(b, page);
    assert.ok(Math.hypot(pa.x - pb.x, pa.z - pb.z) > 1, 'positions distinctes le long du chemin');
    assert.ok(pb.y > pa.y, 'hauteurs distinctes');
    // Travées différentes, car les deux Parois n'ont pas la même hauteur propre.
    assert.ok(Math.abs(pa.spanY - pb.spanY) > 1e-6, 'travées propres à chaque Parois');
  });
});

describe('tangente d\'une Parois sur un Tracé — cohérence avec la courbe lissée (Fix 31)', () => {
  const enL = [{ x: 0, z: 0 }, { x: 6, z: 0 }, { x: 6, z: -6 }];
  const muret = { id: 'm1', type: 'tracé', tracéType: 'muret', wallHeight: 0.5,
                  world: { pts: enL } };
  const fen = a => ({ id: 'f1', type: 'objet3d', objType: 'fenetre_ouverte', magnetWallId: 'm1',
                      w: 14, h: 12, wallAlongFrac: a, wallYFrac: 0 });

  test('la tangente est unitaire partout', () => {
    for (const a of [0, 0.2, 0.5, 0.8, 1]) {
      const o = fen(a);
      const t = wallOpeningWorldPosOnTracé3D(o, { w: 800, h: 600, objects: [muret, o] }).tangent;
      assertClose(Math.hypot(t.x, t.z), 1, `norme @${a}`, 1e-9);
    }
  });

  test('elle coïncide avec celle de la courbe lissée, y compris dans le coude', () => {
    const pts = smoothTracéPath3D(enL, 4);
    for (const a of [0, 0.1, 0.45, 0.5, 0.55, 0.9, 1]) {
      const o = fen(a);
      const t = wallOpeningWorldPosOnTracé3D(o, { w: 800, h: 600, objects: [muret, o] }).tangent;
      const f = tracéFrameAtFrac3D(pts, a);
      assertClose(t.x, f.tx, `tx @${a}`, 1e-9);
      assertClose(t.z, f.tz, `tz @${a}`, 1e-9);
    }
  });

  // Mesuré sur ce L (angle réel 90°) : chemin brut → un saut unique de 1.571 rad ; lissé x4 →
  // réparti sur ~2 pas, plus gros saut 0.825 rad ; lissé x8 → 0.460 rad. Le lissage ADOUCIT le
  // virage sans l'effacer — le seuil ci-dessous encadre ce comportement mesuré, il n'est pas
  // arbitraire.
  test('le lissage répartit le virage au lieu de le faire d\'un bloc', () => {
    const yaws = [];
    for (let a = 0.30; a <= 0.70; a += 0.005) {
      const o = fen(a);
      const t = wallOpeningWorldPosOnTracé3D(o, { w: 800, h: 600, objects: [muret, o] }).tangent;
      yaws.push(Math.atan2(-t.z, t.x));
    }
    let max = 0, total = 0;
    for (let i = 1; i < yaws.length; i++) {
      const d = ((yaws[i] - yaws[i-1] + Math.PI) % (2 * Math.PI)) - Math.PI;
      max = Math.max(max, Math.abs(d)); total += d;
    }
    assert.ok(max < 1.0, `virage réparti, pas d'un bloc (plus gros saut ${max.toFixed(3)} rad)`);
    assert.ok(Math.abs(Math.abs(total) - Math.PI / 2) < 0.2,
      `virage total ≈ 90° (obtenu ${(total * 180 / Math.PI).toFixed(1)}°)`);
  });

  // RÉGRESSION du Fix 29 (« la direction finit par s'inverser »). L'invariant qui compte n'est pas
  // que la tangente tourne parfaitement — sur une ellipse échantillonnée à 13 points, le lissage
  // produit 2 micro-contre-sens de 0.045 rad sur 100 pas, mesurés — mais qu'augmenter
  // wallAlongFrac fasse TOUJOURS avancer la Parois vers l'avant du muret, jamais reculer.
  test('sur un muret qui boucle, augmenter wallAlongFrac avance toujours vers l\'avant', () => {
    const ovale = Array.from({ length: 13 }, (_, i) => {
      const t = (i / 12) * Math.PI * 2;
      return { x: 4 * Math.cos(t), z: 2.5 * Math.sin(t) };
    });
    const boucle = { ...muret, world: { pts: ovale } };
    const at = a => {
      const o = fen(a);
      return wallOpeningWorldPosOnTracé3D(o, { w: 800, h: 600, objects: [boucle, o] });
    };
    let reculs = 0;
    for (let a = 0; a < 0.99; a += 0.01) {
      const p0 = at(a), p1 = at(a + 0.01);
      // Produit scalaire du déplacement avec la tangente locale : négatif = la Parois recule.
      const d = (p1.x - p0.x) * p0.tangent.x + (p1.z - p0.z) * p0.tangent.z;
      if (d < 0) reculs++;
    }
    assert.equal(reculs, 0, `aucun recul le long du muret (${reculs} détectés)`);
  });

  test('la tangente fait un tour complet le long d\'une boucle fermée', () => {
    const ovale = Array.from({ length: 13 }, (_, i) => {
      const t = (i / 12) * Math.PI * 2;
      return { x: 4 * Math.cos(t), z: 2.5 * Math.sin(t) };
    });
    const boucle = { ...muret, world: { pts: ovale } };
    let prev = null, total = 0;
    for (let a = 0; a <= 1.0001; a += 0.01) {
      const o = fen(a);
      const t = wallOpeningWorldPosOnTracé3D(o, { w: 800, h: 600, objects: [boucle, o] }).tangent;
      const yaw = Math.atan2(-t.z, t.x);
      if (prev !== null) total += ((yaw - prev + Math.PI) % (2 * Math.PI)) - Math.PI;
      prev = yaw;
    }
    // Mesuré : -321° sur cette ellipse à 13 points (le lissage n'atteint pas exactement 360°).
    assert.ok(Math.abs(Math.abs(total) - 2 * Math.PI) < 0.9,
      `≈ un tour complet (obtenu ${(total * 180 / Math.PI).toFixed(1)}°)`);
  });

  test('chemin totalement dégénéré : tangente de repli, jamais NaN', () => {
    const degen = { ...muret, world: { pts: [{ x: 2, z: 2 }, { x: 2, z: 2 }] } };
    const o = fen(0.5);
    const t = wallOpeningWorldPosOnTracé3D(o, { w: 800, h: 600, objects: [degen, o] }).tangent;
    assert.ok(Number.isFinite(t.x) && Number.isFinite(t.z), 'pas de NaN');
    assert.ok(Math.hypot(t.x, t.z) > 0, 'direction utilisable');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 32 — arêtes du Tracé mur.
//
// emitStrip réutilisait les mêmes 8 sommets pour les faces verticales ET les faces
// horizontales. computeVertexNormals moyennait donc, à chaque coin haut, la normale de la
// face verticale avec le +Y du dessus : la crête était ombrée comme un congé et le Muret
// avait l'air d'un tube. Les faces horizontales ont désormais leurs propres sommets.
// ─────────────────────────────────────────────────────────────────────────────
describe('buildTracéWallGeometry3D — arêtes franches du Tracé mur (Fix 32)', () => {
  const droit = [{ x: 0, z: 0 }, { x: 8, z: 0 }];
  const classe = geo => {
    const N = geo.getAttribute('normal');
    let laterale = 0, horizontale = 0, diagonale = 0;
    for (let i = 0; i < N.count; i++) {
      const ny = Math.abs(N.getY(i));
      if (ny < 0.01) laterale++; else if (ny > 0.99) horizontale++; else diagonale++;
    }
    return { laterale, horizontale, diagonale, total: N.count };
  };

  test('RÉGRESSION : aucune normale diagonale — la crête est une arête, pas un congé', () => {
    const c = classe(buildTracéWallGeometry3D(droit, 0.5, 0.18, GROUND_Y_DEFAULT_3D, null));
    assert.equal(c.diagonale, 0, `${c.diagonale} sommets à normale diagonale sur ${c.total}`);
    assert.ok(c.laterale > 0 && c.horizontale > 0, 'les deux familles de faces sont présentes');
  });

  test('les faces latérales restent strictement verticales', () => {
    const geo = buildTracéWallGeometry3D(droit, 0.5, 0.18, GROUND_Y_DEFAULT_3D, null);
    const N = geo.getAttribute('normal');
    for (let i = 0; i < N.count; i++) {
      const ny = Math.abs(N.getY(i));
      assert.ok(ny < 0.01 || ny > 0.99, `normale ni verticale ni horizontale au sommet ${i} (ny=${ny})`);
    }
  });

  test('arêtes franches aussi sur un tracé courbe et autour d\'une ouverture', () => {
    const courbe = Array.from({ length: 9 }, (_, i) => ({ x: i, z: Math.sin(i / 2) * 2 }));
    const trou = [{ arcStart: 3, arcEnd: 4.5, yMin: GROUND_Y_DEFAULT_3D + 0.1,
                    yMax: GROUND_Y_DEFAULT_3D + 0.35 }];
    for (const [nom, geo] of [
      ['courbe sans trou', buildTracéWallGeometry3D(courbe, 0.5, 0.18, GROUND_Y_DEFAULT_3D, null)],
      ['courbe avec trou', buildTracéWallGeometry3D(courbe, 0.5, 0.18, GROUND_Y_DEFAULT_3D, trou)],
      ['droit avec trou',  buildTracéWallGeometry3D(droit,  0.5, 0.18, GROUND_Y_DEFAULT_3D, trou)],
    ]) {
      assert.equal(classe(geo).diagonale, 0, nom);
    }
  });

  test('l\'appui et le linteau du trou sont eux aussi des faces franches', () => {
    // Un trou à mi-hauteur produit un appui (dessus de la bande basse) ET un linteau
    // (dessous de la bande haute) : les deux doivent avoir des normales pures.
    const trou = [{ arcStart: 3, arcEnd: 4.5, yMin: GROUND_Y_DEFAULT_3D + 0.15,
                    yMax: GROUND_Y_DEFAULT_3D + 0.35 }];
    const c = classe(buildTracéWallGeometry3D(droit, 0.5, 0.18, GROUND_Y_DEFAULT_3D, trou));
    assert.equal(c.diagonale, 0, 'aucune normale moyennée');
    // 4 sommets par face horizontale : au moins appui + linteau + crêtes.
    assert.ok(c.horizontale >= 12, `${c.horizontale} sommets horizontaux (appui + linteau + crêtes)`);
  });

  test('chemin inexploitable → null, pas une géométrie vide', () => {
    assert.equal(buildTracéWallGeometry3D([{ x: 0, z: 0 }], 0.5, 0.18, GROUND_Y_DEFAULT_3D, null), null);
    assert.equal(buildTracéWallGeometry3D([], 0.5, 0.18, GROUND_Y_DEFAULT_3D, null), null);
  });
});

// Fix 33 — les deux valeurs choisies avec l'utilisateur, verrouillées explicitement : les tests
// ci-dessus lisent la table (ils vérifient le CHEMIN de repli), celui-ci vérifie son CONTENU.
describe('Muret par défaut — hauteur et épaisseur retenues (Fix 33)', () => {
  test('1.00 de haut pour 0.12 d\'épaisseur', () => {
    assertClose(TRACÉ_DEFAULTS.muret.wallHeight, 1.00, 'hauteur par défaut');
    assertClose(tracéWallThickness3D({ tracéType: 'muret' }), 0.12, 'épaisseur par défaut');
  });

  test('l\'épaisseur reste proportionnelle si on redimensionne le Muret dans la modale', () => {
    // Une épaisseur fixe donnerait une saucisse sur un Muret rabaissé, et une planche sur un
    // Muret très haut : c'est la raison d'être du ratio.
    for (const h of [0.3, 1.0, 2.5]) {
      assertClose(tracéWallThickness3D({ tracéType: 'muret', wallHeight: h }), h * 0.12, `h=${h}`);
    }
  });

  test('les trois autres Tracés mur gardent leurs proportions', () => {
    assertClose(tracéWallThickness3D({ tracéType: 'haie', wallHeight: 1 }), 0.611, 'haie');
    assertClose(tracéWallThickness3D({ tracéType: 'barriere', wallHeight: 1 }), 0.55 * 0.529, 'barrière');
    assertClose(tracéWallThickness3D({ tracéType: 'cloture', wallHeight: 1 }), 0.06, 'clôture');
  });

  test('un Muret est désormais nettement plus fin qu\'il n\'est haut, comme un Mur', () => {
    const h = TRACÉ_DEFAULTS.muret.wallHeight;
    const e = tracéWallThickness3D({ tracéType: 'muret' });
    assert.ok(e / h < 0.15, `épaisseur ${(e / h * 100).toFixed(0)} % de la hauteur (< 15 %)`);
  });
});

// Fix 33 — le Muret est CONSTRUIT avec l'épaisseur contre laquelle les Parois sont plaquées.
// Ces deux valeurs étaient deux expressions indépendantes ; c'est ce couplage-là qu'on verrouille.
describe('buildMuretGroup3D — le Muret bâti et les Parois plaquées partagent une épaisseur (Fix 33)', () => {
  const droit = [{ x: 0, z: 0 }, { x: 8, z: 0 }];
  const muret = extra => ({ id: 'm1', type: 'tracé', tracéType: 'muret',
                            world: { pts: droit }, ...extra });
  // Muret droit le long de X : l'étendue en Z de la géométrie EST son épaisseur.
  const epaisseurBatie = g => {
    const mesh = g.children.find(c => c.isMesh);
    const P = mesh.geometry.getAttribute('position');
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < P.count; i++) { const z = P.getZ(i); if (z < min) min = z; if (z > max) max = z; }
    return max - min;
  };

  test('RÉGRESSION : l\'épaisseur bâtie est exactement tracéWallThickness3D', () => {
    for (const h of [undefined, 0.4, 1.0, 2.2]) {
      const o = muret({ wallHeight: h });
      assertClose(epaisseurBatie(buildMuretGroup3D(o, null)), tracéWallThickness3D(o),
        `wallHeight ${h}`, 1e-6);
    }
  });

  test('la hauteur bâtie est exactement tracéWallHeight3D, depuis le Sol', () => {
    for (const h of [undefined, 0.4, 2.2]) {
      const o = muret({ wallHeight: h });
      const mesh = buildMuretGroup3D(o, null).children.find(c => c.isMesh);
      const P = mesh.geometry.getAttribute('position');
      let min = Infinity, max = -Infinity;
      for (let i = 0; i < P.count; i++) { const y = P.getY(i); if (y < min) min = y; if (y > max) max = y; }
      assertClose(max - min, tracéWallHeight3D(o), `hauteur wallHeight ${h}`, 1e-6);
      assertClose(min, GROUND_Y_DEFAULT_3D + 0.005, `pied au Sol wallHeight ${h}`, 1e-6);
    }
  });

  test('un Muret sans wallHeight prend la valeur de la table, pas un littéral oublié', () => {
    // Quatre sites du renderer avaient gardé 0.50 en dur : le trou était découpé contre la table
    // pendant que le mur était bâti contre le littéral.
    assertClose(tracéWallHeight3D(muret({})), TRACÉ_DEFAULTS.muret.wallHeight, 'repli sur la table');
    // tolérance Float32 : la géométrie stocke ses positions en simple précision.
    assertClose(epaisseurBatie(buildMuretGroup3D(muret({}), null)), 0.12, 'épaisseur par défaut', 1e-6);
  });

  test('le tableau de chaque ouverture est ajouté au groupe', () => {
    const o = muret({ wallHeight: 1 });
    const trou = [{ arcStart: 3, arcEnd: 4.5, cW: 1.5, cH: 0.3,
                    yMin: GROUND_Y_DEFAULT_3D + 0.2, yMax: GROUND_Y_DEFAULT_3D + 0.5,
                    at: { x: 3.75, z: 0, tx: 1, tz: 0 } }];
    const sans = buildMuretGroup3D(o, null);
    const avec = buildMuretGroup3D(o, trou);
    assert.ok(avec.children.length > sans.children.length, 'le tableau apparaît dans le groupe');
  });

  test('objet inutilisable → null, jamais un groupe vide dans la scène', () => {
    assert.equal(buildMuretGroup3D(null, null), null);
    assert.equal(buildMuretGroup3D({ tracéType: 'muret' }, null), null);
    assert.equal(buildMuretGroup3D(muret({ world: { pts: [{ x: 1, z: 1 }] } }), null), null);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 34 — angles pleins des Pièces et Bâtiments.
//
// Chaque Mur est une boîte qui s'arrête pile à son extrémité. À un angle, les deux
// boîtes couvrent trois quarts du carré balayé par les deux épaisseurs et laissent le
// quadrant extérieur vide — le creux visible à chaque coin. On y pose un poteau.
// ─────────────────────────────────────────────────────────────────────────────
describe('buildWallJunctions3D — poteaux d\'angle (Fix 34)', () => {
  const RATIO = 0.06;
  const ep = w => w.height * RATIO;
  // Pièce carrée de 4×4, murs de 3 de haut. rotY = atan2(-dz, dx).
  const mur = (x, z, len, rotY) => ({ x, z, realLen: len, rotY, height: 3, color: '#3355aa' });
  const carre = [
    mur(0, -2, 4, 0),               // sud, le long de +x
    mur(2, 0, 4, Math.PI / 2),      // est,  le long de -z
    mur(0, 2, 4, 0),                // nord
    mur(-2, 0, 4, Math.PI / 2),     // ouest
  ];

  test('une Pièce carrée produit exactement 4 poteaux, un par coin', () => {
    const j = buildWallJunctions3D(carre, ep);
    assert.equal(j.length, 4, `${j.length} poteaux`);
    const coins = j.map(p => `${p.x.toFixed(2)},${p.z.toFixed(2)}`).sort();
    assert.deepEqual(coins, ['-2.00,-2.00', '-2.00,2.00', '2.00,-2.00', '2.00,2.00']);
  });

  test('le poteau fait exactement l\'épaisseur du Mur, et toute sa hauteur', () => {
    const j = buildWallJunctions3D(carre, ep)[0];
    assertClose(j.thick, 3 * RATIO, 'côté du poteau = épaisseur du Mur');
    assertClose(j.height, 3, 'hauteur pleine');
  });

  test('RÉGRESSION : deux Murs COLINÉAIRES ne reçoivent pas de poteau', () => {
    // Bout à bout dans le même axe, les deux boîtes s'alignent déjà : un poteau y serait
    // une bosse inutile au milieu d'un mur droit.
    const alignes = [mur(-2, 0, 4, 0), mur(2, 0, 4, 0)];
    assert.deepEqual(buildWallJunctions3D(alignes, ep), []);
  });

  test('des Murs qui ne se touchent pas ne produisent rien', () => {
    const separes = [mur(0, 0, 2, 0), mur(10, 10, 2, Math.PI / 2)];
    assert.deepEqual(buildWallJunctions3D(separes, ep), []);
  });

  test('un seul poteau là où trois Murs se rejoignent (une cloison en T)', () => {
    const T = [mur(0, -2, 4, 0), mur(2, 0, 4, Math.PI / 2), mur(2, -4, 4, Math.PI / 2)];
    const j = buildWallJunctions3D(T, ep);
    const enCoin = j.filter(p => Math.abs(p.x - 2) < 0.01 && Math.abs(p.z + 2) < 0.01);
    assert.equal(enCoin.length, 1, 'pas de poteaux empilés au même endroit');
  });

  test('le poteau est aligné sur un des deux Murs, pas sur la bissectrice', () => {
    // À 90° — ce sur quoi l'outil Construire magnétise — un carré aligné sur l'un des deux
    // couvre exactement le quadrant manquant ; tourné à 45° il ne le couvrirait pas.
    const j = buildWallJunctions3D(carre, ep);
    for (const p of j) {
      const alignes = carre.some(w => Math.abs(((w.rotY - p.rotY) % Math.PI)) < 0.01);
      assert.ok(alignes, `lacet ${p.rotY} aligné sur un Mur`);
    }
  });

  test('l\'épaisseur retenue est la plus grande des deux Murs', () => {
    const bas = { ...mur(0, -2, 4, 0), height: 2 };
    const haut = { ...mur(2, 0, 4, Math.PI / 2), height: 5 };
    const j = buildWallJunctions3D([bas, haut], ep);
    assertClose(j[0].thick, 5 * RATIO, 'aucun des deux Murs ne dépasse du poteau');
  });

  test('entrées inexploitables → liste vide', () => {
    assert.deepEqual(buildWallJunctions3D(null, ep), []);
    assert.deepEqual(buildWallJunctions3D([mur(0, 0, 4, 0)], ep), []);
  });
});

describe('isJunctionWall3D — quels Murs reçoivent un poteau d\'angle (Fix 34b)', () => {
  const mur = extra => ({ objType: 'mur', pieceId: 'p1', ...extra });

  test('RÉGRESSION : un Mur qui porte une Parois compte quand même', () => {
    // La 1re version réutilisait le prédicat de la FUSION des murs colinéaires, qui écarte
    // volontairement les Murs percés (les trous sont découpés mur par mur). Résultat : tout
    // angle touchant un Mur à porte ou à fenêtre restait creux — la moitié des cas.
    assert.equal(isJunctionWall3D(mur({ id: 'm1' })), true, 'Mur nu');
    // Le prédicat ne regarde que le Mur lui-même : porter une Parois ne le disqualifie pas.
    assert.equal(isJunctionWall3D(mur({ id: 'm2', hasOpening: true })), true, 'Mur percé');
  });

  test('écarte ce qui n\'est pas un Mur de Pièce ou de Bâtiment', () => {
    assert.equal(isJunctionWall3D(mur({ objType: 'mur_coin' })), false, 'Mur d\'angle');
    assert.equal(isJunctionWall3D(mur({ pieceId: null })), false, 'Mur libre, hors Pièce');
    assert.equal(isJunctionWall3D(mur({ hidden3d: true })), false, 'Mur masqué');
    assert.equal(isJunctionWall3D({ objType: 'dalle', pieceId: 'p1' }), false, 'Dalle');
    assert.equal(isJunctionWall3D(null), false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// La distance de caméra d'une Case qui reçoit son premier Élément
// ─────────────────────────────────────────────────────────────────────────────

describe('distanceCameraPourPremierElement3D — compenser la taille de l\'Élément', () => {
  // Signalé à l'usage : « pour un Personnage de taille standard c'est nickel car sa hauteur est
  // fixe, mais des modèles de taille différente paraissent plus éloignés lorsqu'ils sont plus
  // petits ». C'est arithmétique : la distance par défaut est fixe et calibrée sur 1,75 m.

  test('un Élément de la taille de référence garde la distance par défaut', () => {
    assert.equal(distanceCameraPourPremierElement3D(PERSONA_REAL_HEIGHT_M), PANEL_CAM_DEFAULT_DIST_3D);
  });

  test('deux fois plus grand, deux fois plus loin — et réciproquement', () => {
    // C'est LA propriété : la taille apparente ne dépend plus de la hauteur du modèle.
    assert.equal(distanceCameraPourPremierElement3D(PERSONA_REAL_HEIGHT_M * 2), PANEL_CAM_DEFAULT_DIST_3D * 2);
    assert.equal(distanceCameraPourPremierElement3D(PERSONA_REAL_HEIGHT_M / 2), PANEL_CAM_DEFAULT_DIST_3D / 2);
  });

  test('une hauteur inconnue ou absurde retombe sur le défaut', () => {
    // Un fichier illisible n'a pas de hauteur : mieux vaut la distance d'avant qu'une caméra
    // envoyée à zéro ou à l'infini.
    [undefined, null, NaN, 0, -1, Infinity].forEach(v =>
      assert.equal(distanceCameraPourPremierElement3D(v), PANEL_CAM_DEFAULT_DIST_3D,
        `hauteur ${String(v)}`));
  });

  test('les bornes sont celles de la molette, pas des valeurs inventées ici', () => {
    assert.equal(distanceCameraPourPremierElement3D(1e-9), 0.3);
    assert.equal(distanceCameraPourPremierElement3D(1e9), PANEL_CAM_DEFAULT_DIST_3D * 200);
  });
});

describe('estPremierElement3DdeLaCase — qui a le droit de recadrer', () => {
  // Une Case déjà peuplée porte une composition. La recadrer sous les yeux de quelqu'un qui vient
  // seulement d'ajouter un Élément serait une surprise — c'est la règle que le rendu s'est déjà
  // donnée pour la rotation, étendue ici au zoom.
  const panel = { id: 'c1', type: 'panel', x: 0, y: 0, w: 400, h: 300, shape: 'rect' };
  const el = (id, x, y) => ({ id, type: 'objet3d', objType: 'modele', x, y, w: 40, h: 40, homePanelId: 'c1' });

  test('seul dans sa Case : oui', () => {
    const a = el('a', 180, 130);
    assert.equal(estPremierElement3DdeLaCase(a, panel, { objects: [panel, a] }), true);
  });

  test('un autre Élément 3D déjà là : non', () => {
    const a = el('a', 180, 130), b = el('b', 100, 100);
    assert.equal(estPremierElement3DdeLaCase(a, panel, { objects: [panel, b, a] }), false);
  });

  test('les arguments manquants ne donnent jamais le droit de recadrer', () => {
    const a = el('a', 180, 130);
    assert.equal(estPremierElement3DdeLaCase(null, panel, { objects: [] }), false);
    assert.equal(estPremierElement3DdeLaCase(a, null, { objects: [] }), false);
    assert.equal(estPremierElement3DdeLaCase(a, panel, null), false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Projeter un Élément qui n'est plus devant la caméra
//
// DEUX DÉFAUTS, DONT UN PRÉEXISTANT, tous deux révélés par la liste latérale « hors champ » —
// révélés, pas créés : elle est la première à projeter TOUS les Éléments d'une Case, y compris
// ceux passés derrière la caméra. Les boîtes de sélection, elles, ne se dessinent que pour un
// Élément déjà à l'écran.
//
// Ces deux gardes vivent dans du code qui demande WebGL, injoignable sous Node. La lecture de
// source est le seul moyen honnête de dire qu'elles sont là — et il vaut mieux que rien, comme
// l'a montré la mutation qui retirait la première sans faire échouer un seul test.
// ─────────────────────────────────────────────────────────────────────────────
describe('scene3d — projections derrière la caméra', () => {
  const SCENE = readFileSync(new URL('../src/scene3d.js', import.meta.url), 'utf8');

  test('RÉGRESSION : les quatre points d\'étendue sont gardés avant d\'être lus', () => {
    // `projectPt` rend `null` dès qu'un point passe derrière le plan proche. Les branches Mur et
    // Tracé le testaient ; la branche générale l'avait oublié, et lisait `pRight.x` sur un `null`.
    // La TypeError interrompait alors la construction de la liste : des Cases entières se
    // retrouvaient sans aucun Élément.
    const i = SCENE.indexOf('const pRight = projectPt(');
    assert.ok(i > 0, 'la branche générale de getElementProjectedHalfExtents3D est introuvable');
    const suite = SCENE.slice(i, i + 1400);
    const garde = suite.indexOf('!pRight || !pLeft || !pUp || !pDown');
    const lecture = suite.indexOf('pRight.x - pLeft.x');
    assert.ok(garde > 0, 'la garde des quatre points a disparu');
    assert.ok(garde < lecture, 'la garde doit précéder la lecture des points');
  });

  test('RÉGRESSION : le centre projeté dit s\'il est DEVANT la caméra', () => {
    // `project()` divise par `w` ; derrière, `w` est négatif et le point ressort en miroir, à des
    // coordonnées finies qui peuvent retomber dans le cadre. Sans cette information, un Élément
    // passé derrière était déclaré visible — la sous-détection signalée à l'usage.
    const i = SCENE.indexOf('export function projectElementCenterToCanvas3D');
    const bloc = SCENE.slice(i, SCENE.indexOf('\nexport function ', i + 10));
    assert.match(bloc, /matrixWorldInverse/, 'la position en repère CAMÉRA n\'est plus calculée');
    assert.match(bloc, /devant\s*=\s*camPt\.z\s*<\s*-\s*personaCamera3D\.near/,
      'le test « devant la caméra » a changé de forme — vérifier qu\'il dit toujours la même chose');
    assert.match(bloc, /return \{\s*\n?\s*devant,/, 'le champ `devant` n\'est plus rendu');
  });
});

/**
 * JOURNAL DE MUTATION — les projections derrière la caméra.
 *
 *   Z1 le test « derrière la caméra » retiré d'estHorsChamp3D       ROUGE
 *   Z2 « devant » absent vaut derrière (change tous les appels)     ROUGE
 *   Z3 la garde des quatre points retirée                           ÉCHAPPÉE → puis ROUGE
 *   Z4 « devant » toujours vrai                                     ROUGE
 *   Z5 le champ `devant` n'est plus rendu                           ROUGE
 *
 * Z2 MÉRITE D'ÊTRE LU. Écrire `if (!centre.devant)` au lieu de `if (centre.devant === false)` a
 * l'air équivalent, et ne l'est pas : un appelant qui ne renseigne pas le champ verrait alors tous
 * ses Éléments déclarés hors champ. Cinq tests tombent — c'est la mesure de ce que coûte la
 * nuance entre « absent » et « faux » quand on ajoute un champ à une valeur déjà partagée.
 *
 * Z3 était l'ancien : la garde ne se traverse pas sous Node, faute de caméra. La mutation l'a
 * montré en ne faisant échouer AUCUN test — d'où la lecture de source, qui vaut mieux que rien.
 */
