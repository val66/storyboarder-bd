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

import { getPersonaScalePercent, rotYToSliderDeg, sliderDegToRotY, pickAnimalHandleAt, animalHandleScreenPos,
  pickHandleAt, pickSkeletonHandleAt, skeletonHandleScreenPos } from '../src/modals.js';

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


describe('Poignées d\'articulation — une seule prise pour tous les types d\'Élément', () => {
  // CE BLOC EXISTE PARCE QUE LE CODE ÉTAIT SUR LE POINT D'ÊTRE RECOPIÉ. Les Animaux avaient leur
  // fonction de sélection, les Modèles importés allaient avoir la leur : deux fois la même
  // arithmétique, donc deux occasions de dériver — un rayon de prise ajusté d'un côté et pas de
  // l'autre, et le même geste ne répondrait plus pareil selon l'Élément. `pickHandleAt` est
  // désormais commune ; les deux entrées publiques ne font que lui passer leur carte de positions.
  beforeEach(() => {
    Object.keys(animalHandleScreenPos).forEach(k => delete animalHandleScreenPos[k]);
    Object.keys(skeletonHandleScreenPos).forEach(k => delete skeletonHandleScreenPos[k]);
  });

  test('la poignée la PLUS PROCHE gagne, pas la première rencontrée', () => {
    // Les points se chevauchent souvent (poignet et main d'un rig dense) : prendre la première de
    // l'énumération donnerait une sélection qui dépend de l'ordre du squelette, pas du clic.
    const pos = { loin: { x: 100, y: 100 }, pres: { x: 104, y: 100 } };
    assert.deepEqual(pickHandleAt(pos, 106, 100), { id: 'pres' });
    assert.deepEqual(pickHandleAt(pos, 97, 100), { id: 'loin' });
  });

  test('au-delà du rayon de prise, on ne saisit rien', () => {
    // Cliquer dans le vide doit DÉSÉLECTIONNER, pas attraper le point le moins lointain.
    const pos = { a: { x: 100, y: 100 } };
    assert.equal(pickHandleAt(pos, 130, 100), null);
    assert.deepEqual(pickHandleAt(pos, 110, 100), { id: 'a' });
  });

  test('une carte vide, absente ou trouée ne lève pas', () => {
    assert.equal(pickHandleAt({}, 0, 0), null);
    assert.equal(pickHandleAt(null, 0, 0), null);
    assert.equal(pickHandleAt({ a: null }, 0, 0), null);
  });

  test('Animaux et Modèles importés partagent la MÊME prise', () => {
    // Le test qui casserait si quelqu'un redonnait à l'un des deux sa propre arithmétique.
    animalHandleScreenPos.patte = { x: 50, y: 50 };
    skeletonHandleScreenPos.bras_g = { x: 50, y: 50 };
    const limite = 17;
    assert.deepEqual(pickAnimalHandleAt(50 + limite - 1, 50), { id: 'patte' });
    assert.deepEqual(pickSkeletonHandleAt(50 + limite - 1, 50), { id: 'bras_g' });
    assert.equal(pickAnimalHandleAt(50 + limite + 1, 50), null);
    assert.equal(pickSkeletonHandleAt(50 + limite + 1, 50), null);
  });

  test('les deux cartes sont INDÉPENDANTES', () => {
    // Un Élément est soit un Animal soit un modèle importé, jamais les deux ; mais les cartes
    // survivent d'une modale à l'autre. Les confondre ferait cliquer sur le fantôme du précédent.
    animalHandleScreenPos.patte = { x: 10, y: 10 };
    assert.equal(pickSkeletonHandleAt(10, 10), null);
  });
});

describe('Les poignées d\'un Modèle importé suivent les curseurs, exactement', () => {
  const MODALS = readFileSync(new URL('../src/modals.js', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');

  test('RÉGRESSION : on ne dessine QUE les emplacements qui ont des curseurs', () => {
    // Un point qu'on peut attraper mais qui ne mène à aucun curseur serait le même mensonge qu'un
    // curseur ne pilotant aucun os. Le bassin, notamment, n'a plus de curseurs : il ne doit pas non
    // plus avoir de poignée.
    const debut = MODALS.indexOf('export function drawSkeletonJointHandlesOverlay');
    const corps = MODALS.slice(debut, MODALS.indexOf('\n}', debut));
    assert.ok(debut > 0, 'le dessin des poignées a disparu');
    assert.match(corps, /Object\.keys\(skeletonJointGroupDetailsById\)/,
      'les poignées ne suivent plus la liste des groupes de curseurs');
  });

  test('RÉGRESSION : déplier un groupe sélectionne son point, et réciproquement', () => {
    // Le dialogue doit aller dans les deux sens, comme pour le Personnage et les Animaux.
    const debut = MODALS.indexOf('export function buildSkeletonJointSlidersUI');
    const corps = MODALS.slice(debut, MODALS.indexOf('\n}\n', debut));
    assert.match(corps, /addEventListener\('toggle'/, 'déplier un groupe ne sélectionne plus rien');
    assert.match(corps, /S\.selectedSkeletonHandle = \{ id: premier \}/);
    assert.match(MODALS, /export function openSkeletonJointGroupForHandle/,
      'cliquer un point ne déplie plus son groupe');
  });

  test('RÉGRESSION : la carte des poignées est vidée quand la fiche change de modèle', () => {
    // Sans cela, les points du modèle précédent resteraient cliquables sur le nouvel aperçu.
    const debut = MODALS.indexOf('export function buildSkeletonJointSlidersUI');
    const corps = MODALS.slice(debut, debut + 700);
    assert.match(corps, /delete skeletonHandleScreenPos\[k\]/,
      'les positions du modèle précédent survivent');
  });
});
