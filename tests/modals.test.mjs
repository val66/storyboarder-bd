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
