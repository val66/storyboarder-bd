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

import {
  panelDepthToDistance3D,
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
} from '../src/scene3d.js';
import { S } from '../src/state.js';
import {
  PANEL_CAM_DEFAULT_DIST_3D, PANEL_DEPTH_MAX_3D, GROUND_Y_DEFAULT_3D, WALL_PX_PER_UNIT_3D,
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
