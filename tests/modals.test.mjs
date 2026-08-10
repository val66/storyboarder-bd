// tests/modals.test.mjs — Tests unitaires de src/modals.js (calculs purs utilisés par les modales
// Personnage/Objet : conversion rotation↔slider, pourcentage de taille, détection de poignée
// d'articulation la plus proche).
//
// NON couvert ici, volontairement : le reste de modals.js est presque entièrement de la construction/
// manipulation DOM (openXModal/closeXModal/build...UI/draw...Overlay), impossible à vérifier de façon
// significative avec le dom-stub (pas de vrai rendu, querySelectorAll renvoie [] par défaut) — cf.
// même limite documentée dans l'en-tête de tests/i18n.test.mjs. getObjectPreviewCanvasCoords/
// getPersonaPreviewCanvasCoords dépendent de getBoundingClientRect() sur un canvas dont le stub
// renvoie des dimensions nulles (division par zéro → NaN), donc non plus assertables ici.
import './helpers/dom-stub.mjs';
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { getPersonaScalePercent, rotYToSliderDeg, sliderDegToRotY, pickAnimalHandleAt, animalHandleScreenPos } from '../src/modals.js';

function assertClose(actual, expected, msg, eps = 1e-9) {
  assert.ok(Math.abs(actual - expected) < eps,
    `${msg} — attendu ≈ ${expected}, obtenu ${actual}`);
}

// ── rotYToSliderDeg / sliderDegToRotY ────────────────────────────────────────────────────────
describe('rotYToSliderDeg / sliderDegToRotY — conversion entre rotY (radians) et le slider "0..360°"', () => {
  test('rotYToSliderDeg : rotY=0 (face caméra par défaut) → -180° (le slider représente 0=dos, 180/-180=face)', () => {
    assert.equal(rotYToSliderDeg(0), -180);
  });

  test('rotYToSliderDeg : rotY=PI ou -PI → 0°', () => {
    assert.equal(rotYToSliderDeg(Math.PI), 0);
    assert.equal(rotYToSliderDeg(-Math.PI), 0);
  });

  test('sliderDegToRotY : 0° → PI ; 180°/-180° → 0 ; 90° → -PI/2', () => {
    assertClose(sliderDegToRotY(0), Math.PI);
    assertClose(sliderDegToRotY(180), 0);
    assertClose(sliderDegToRotY(-180), 0);
    assertClose(sliderDegToRotY(90), -Math.PI / 2);
  });

  test('round-trip sliderDegToRotY → rotYToSliderDeg redonne le degré d\'origine (sauf à la coupure ±180°)', () => {
    for (const deg of [0, 45, -45, 90, -90, 179, -179]) {
      const rot = sliderDegToRotY(deg);
      assert.equal(rotYToSliderDeg(rot), deg, `deg=${deg}`);
    }
  });

  test('180° est sur la coupure : round-trip renvoie -180° (équivalent, mais pas la même représentation)', () => {
    const rot = sliderDegToRotY(180);
    assert.equal(rotYToSliderDeg(rot), -180);
  });
});

// ── getPersonaScalePercent ────────────────────────────────────────────────────────────────────
describe('getPersonaScalePercent — pourcentage de taille affiché dans la modale', () => {
  test('realHeightFloor défini : pourcentage = realHeightFloor / (baseH en unités réelles) * 100', () => {
    // WALL_PX_PER_UNIT_3D=40 → baseRealH = baseH/40 = 70/40 = 1.75 ; realHeightFloor = 3.5 → 200%
    const o = { w: 40, h: 70, baseW: 40, baseH: 70, realHeightFloor: 3.5 };
    assert.equal(getPersonaScalePercent(o), 200);
  });

  test('baseW/baseH absents : initialisés depuis w/h avant tout calcul (100% à la création)', () => {
    const o = { w: 40, h: 70 };
    assert.equal(getPersonaScalePercent(o), 100);
    assert.equal(o.baseW, 40);
    assert.equal(o.baseH, 70);
  });
});

// ── pickAnimalHandleAt ────────────────────────────────────────────────────────────────────────
describe('pickAnimalHandleAt — détecte la poignée d\'articulation animale la plus proche (rayon 17px)', () => {
  beforeEach(() => {
    Object.keys(animalHandleScreenPos).forEach(k => delete animalHandleScreenPos[k]);
  });

  test('point proche d\'une poignée : renvoie son id', () => {
    animalHandleScreenPos.j1 = { x: 10, y: 10 };
    animalHandleScreenPos.j2 = { x: 100, y: 100 };
    assert.deepEqual(pickAnimalHandleAt(12, 11), { id: 'j1' });
  });

  test('point exactement sur une poignée : renvoie son id', () => {
    animalHandleScreenPos.j2 = { x: 100, y: 100 };
    assert.deepEqual(pickAnimalHandleAt(100, 100), { id: 'j2' });
  });

  test('point hors du rayon de détection de toutes les poignées : null', () => {
    animalHandleScreenPos.j1 = { x: 10, y: 10 };
    animalHandleScreenPos.j2 = { x: 100, y: 100 };
    assert.equal(pickAnimalHandleAt(50, 50), null);
  });

  test('aucune poignée enregistrée : null', () => {
    assert.equal(pickAnimalHandleAt(0, 0), null);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Rapatriement des gestionnaires des modales Pièce/Bâtiment.
//
// Ils vivaient dans events.js, sous une bannière « BUILD TOOL » qui décrivait autre chose — l'outil
// Construire, lui, est dans draw.js depuis une extraction précédente. Le prix de cette dérive était
// concret : SEIZE getElementById en double, events.js et modals.js allant chercher les mêmes nœuds.
// C'est exactement ce qu'attrape tests/dom-ids.test.mjs pour l'absence d'un id ; pour un id présent
// mais cherché deux fois, rien ne signale que le renommage n'a corrigé qu'une moitié.
//
// Par inspection de source : le câblage manipule le DOM, hors de portée du stub.
// ─────────────────────────────────────────────────────────────────────────────
describe('Rapatriement des modales Pièce/Bâtiment — la couture tient', () => {
  const lireSrc = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
  const evt = lireSrc('../src/events.js');
  const mod = lireSrc('../src/modals.js');

  test('RÉGRESSION : events.js injecte snapshot dans modals.js', () => {
    // Sans injection, enregistrer une modale Pièce ou Bâtiment ne pose plus de point d'annulation.
    // Rien ne lève : l'undo saute simplement une étape, et on ne s'en aperçoit qu'en l'utilisant.
    assert.match(evt, /setModalsCallbacks\(\{\s*snapshot\s*\}\)/,
      'l\'appel d\'injection a disparu d\'events.js');
    assert.match(mod, /export function setModalsCallbacks/,
      'modals.js n\'expose plus de point d\'injection');
  });

  test('RÉGRESSION : modals.js n\'importe RIEN d\'events.js', () => {
    assert.doesNotMatch(mod, /from '\.\/events\.js'/,
      'import remontant vers events.js : cycle réintroduit');
  });

  test('RÉGRESSION : un seul module cherche les nœuds des modales Pièce/Bâtiment', () => {
    // Le vrai gain du rapatriement, et le seul qui se vérifie sans exécuter l'interface.
    const ids = [
      'roomModal', 'roomModalSave', 'roomModalCancel', 'roomNameInput', 'roomPosXInput',
      'roomPosYInput', 'roomPosZInput', 'roomRotYInput', 'roomCeilingVisibleCheckbox',
      'roomMagnetGroundCheckbox', 'buildingModal', 'buildingModalSave', 'buildingModalCancel',
      'buildingNameInput', 'buildingPosXInput', 'buildingPosZInput', 'buildingRotYInput',
    ];
    const enTrop = ids.filter(id => evt.includes(`getElementById('${id}')`));
    assert.deepEqual(enTrop, [],
      'events.js va rechercher des nœuds que modals.js déclare déjà');
    ids.forEach(id => assert.ok(mod.includes(`getElementById('${id}')`),
      `modals.js ne déclare plus ${id}`));
  });

  test('la géométrie Pièce/Bâtiment a suivi ses gestionnaires', () => {
    // Les quatre fonctions que les gestionnaires appellent pour déplacer, redimensionner et
    // ré-ancrer une Pièce. Les laisser derrière aurait fait de modals.js un importateur d'events.js.
    ['recomputeBuildWallBox2D', 'storeRoomGeometry', 'applyRoomScaleFixed', 'moveJunctionToWorld']
      .forEach(n => assert.match(mod, new RegExp(`export function ${n}\\b`), `${n} manquant`));
  });
});
