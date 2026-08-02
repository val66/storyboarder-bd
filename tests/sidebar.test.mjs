// tests/sidebar.test.mjs — Tests unitaires de src/sidebar.js (panneau latéral droit : arborescence
// Pièces/Bâtiments, liste des Éléments d'une Case, vue Scène).
import './helpers/dom-stub.mjs';
// sidebar.js dépend transitivement de draw.js/events.js pour son bon fonctionnement au chargement
// (mêmes raisons que dans draw.test.mjs) — importer events.js par effet de bord garantit que
// S.tomes/S.editingSceneId sont dans un état cohérent avant les tests.
import '../src/events.js';
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  getRoomConnectedComponents,
  isSceneTopDownView,
  getLinkedElementName,
  edgeLengths,
  homeOwningPanel,
  elementsInPanel,
} from '../src/sidebar.js';
import { S } from '../src/state.js';

function assertClose(actual, expected, msg, eps = 1e-6) {
  assert.ok(Math.abs(actual - expected) < eps,
    `${msg} — attendu ≈ ${expected}, obtenu ${actual}`);
}

beforeEach(() => {
  S.selectedId = null;
  S.selectedRoomId = null;
  S.editingSceneId = null;
});

// ── getRoomConnectedComponents (Union-Find) ─────────────────────────────────────────────────
describe('getRoomConnectedComponents — composantes connexes de Pièces (Union-Find)', () => {
  const panel = { id: 'panel1' };

  function wall(id, pieceId, cx, cz, len, rotY = 0) {
    return {
      id, pieceId, homePanelId: panel.id, objType: 'mur', type: 'objet3d',
      wxFloor: cx, wzFloor: cz, realLenFloor: len, rotY,
    };
  }

  test('aucune Pièce : liste vide', () => {
    const page = { objects: [] };
    assert.deepEqual(getRoomConnectedComponents(panel, page), []);
  });

  test('une seule Pièce isolée : une seule composante', () => {
    const page = { objects: [wall('w1', 'p1', 0, 0, 2)] };
    const comps = getRoomConnectedComponents(panel, page);
    assert.equal(comps.length, 1);
    assert.deepEqual(comps[0], ['p1']);
  });

  test('deux Pièces sans mur en commun (éloignées) : deux composantes distinctes', () => {
    const page = {
      objects: [
        wall('w1', 'p1', 0, 0, 2),
        wall('w2', 'p2', 10, 10, 2),
      ],
    };
    const comps = getRoomConnectedComponents(panel, page);
    assert.equal(comps.length, 2, 'deux composantes séparées');
    const flat = comps.map(c => c.slice().sort());
    assert.ok(flat.some(c => c.length === 1 && c[0] === 'p1'));
    assert.ok(flat.some(c => c.length === 1 && c[0] === 'p2'));
  });

  test('deux Pièces partageant un coin (mur contigu) : fusionnées en une seule composante', () => {
    const page = {
      objects: [
        wall('w1', 'p1', 0, 0, 2),
        wall('w3', 'p3', 2, 0, 2),
      ],
    };
    const comps = getRoomConnectedComponents(panel, page);
    assert.equal(comps.length, 1, 'une seule composante fusionnée');
    assert.deepEqual(comps[0].slice().sort(), ['p1', 'p3']);
  });

  test('trois Pièces : deux connectées, une isolée → deux composantes (une de taille 2, une de taille 1)', () => {
    const page = {
      objects: [
        wall('w1', 'p1', 0, 0, 2),
        wall('w3', 'p3', 2, 0, 2),
        wall('w2', 'p2', 10, 10, 2),
      ],
    };
    const comps = getRoomConnectedComponents(panel, page).map(c => c.slice().sort());
    assert.equal(comps.length, 2);
    assert.ok(comps.some(c => c.length === 2 && c[0] === 'p1' && c[1] === 'p3'));
    assert.ok(comps.some(c => c.length === 1 && c[0] === 'p2'));
  });

  test('murs d\'un autre panel (homePanelId différent) ignorés', () => {
    const page = {
      objects: [
        wall('w1', 'p1', 0, 0, 2),
        { ...wall('w2', 'p2', 0, 0, 2), homePanelId: 'panelAutre' },
      ],
    };
    const comps = getRoomConnectedComponents(panel, page);
    assert.equal(comps.length, 1);
    assert.deepEqual(comps[0], ['p1']);
  });
});

// ── isSceneTopDownView ────────────────────────────────────────────────────────────────────────
describe('isSceneTopDownView — détection de la vue "de dessus" d\'une Scène en édition', () => {
  test('panel non-Scène (S.editingSceneId non défini) : toujours false', () => {
    S.editingSceneId = null;
    assert.equal(isSceneTopDownView({ type: 'panel', camRotX: Math.PI / 2 }), false);
  });

  test('panel absent ou non-panel : false', () => {
    S.editingSceneId = 'sceneA';
    assert.equal(isSceneTopDownView(null), false);
    assert.equal(isSceneTopDownView({ type: 'objet3d', camRotX: Math.PI / 2 }), false);
  });

  test('Scène en édition avec camRotX proche de PI/2 : true', () => {
    S.editingSceneId = 'sceneA';
    assert.equal(isSceneTopDownView({ type: 'panel', camRotX: Math.PI / 2 }), true);
  });

  test('camRotXTarget prioritaire sur camRotX quand défini', () => {
    S.editingSceneId = 'sceneA';
    assert.equal(isSceneTopDownView({ type: 'panel', camRotX: 0, camRotXTarget: Math.PI / 2 }), true);
  });

  test('camRotX hors tolérance (0.05 rad) : false', () => {
    S.editingSceneId = 'sceneA';
    assert.equal(isSceneTopDownView({ type: 'panel', camRotX: Math.PI / 2 - 0.2 }), false);
  });
});

// ── getLinkedElementName ─────────────────────────────────────────────────────────────────────
describe('getLinkedElementName — nom du Mur/Tracé auquel une Parois est aimantée', () => {
  test('objet non aimanté (pas de magnetWallId) : null', () => {
    const page = { objects: [] };
    assert.equal(getLinkedElementName({ type: 'objet3d' }, page), null);
  });

  test('mur cible introuvable dans page.objects : null', () => {
    const page = { objects: [] };
    assert.equal(getLinkedElementName({ type: 'objet3d', magnetWallId: 'wX' }, page), null);
  });

  test('Mur simple (nommé) : renvoie son nom', () => {
    const page = { objects: [{ id: 'w1', type: 'objet3d', objType: 'mur', name: 'Mur Nord' }] };
    assert.equal(getLinkedElementName({ type: 'objet3d', magnetWallId: 'w1' }, page), 'Mur Nord');
  });

  test('Mur en coin : précise la face (Face 1 / Face 2) selon wallFace', () => {
    const page = { objects: [{ id: 'w1', type: 'objet3d', objType: 'mur_coin', name: 'Coin A' }] };
    assert.equal(getLinkedElementName({ type: 'objet3d', magnetWallId: 'w1', wallFace: 'A' }, page), 'Coin A — Face 1');
    assert.equal(getLinkedElementName({ type: 'objet3d', magnetWallId: 'w1', wallFace: 'B' }, page), 'Coin A — Face 2');
  });

  test('Tracé mur (muret) sans nom personnalisé : label généré depuis tracéType', () => {
    const page = { objects: [{ id: 't1', type: 'tracé', tracéType: 'muret' }] };
    const name = getLinkedElementName({ type: 'objet3d', magnetWallId: 't1' }, page);
    assert.ok(name.includes('Muret'), `attendu un nom contenant "Muret", obtenu "${name}"`);
  });
});

// ── edgeLengths ───────────────────────────────────────────────────────────────────────────────
describe('edgeLengths — longueurs des 4 côtés d\'une Case/Bulle', () => {
  test('rectangle 100×50 : deux côtés de longueur 100, deux de longueur 50', () => {
    const lens = edgeLengths({ x: 0, y: 0, w: 100, h: 50 });
    assert.equal(lens.length, 4);
    assertClose(lens[0].len, 100, 'Haut');
    assertClose(lens[1].len, 50, 'Droite');
    assertClose(lens[2].len, 100, 'Bas');
    assertClose(lens[3].len, 50, 'Gauche');
  });

  test('utilise directement o.pts si déjà fourni (ne recalcule pas via getPanelPoints)', () => {
    const pts = [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 4 }, { x: 0, y: 4 }];
    const lens = edgeLengths({ pts });
    assertClose(lens[0].len, 3);
    assertClose(lens[1].len, 4);
  });
});

// ── homeOwningPanel / elementsInPanel ────────────────────────────────────────────────────────
describe('homeOwningPanel — Case propriétaire (priorité à homePanelId)', () => {
  test('homePanelId valide : renvoie directement cette Case, sans recours au repli géométrique', () => {
    const panelA = { id: 'panelA', type: 'panel', x: 0, y: 0, w: 100, h: 100 };
    const panelB = { id: 'panelB', type: 'panel', x: 1000, y: 1000, w: 100, h: 100 };
    const page = { objects: [panelA, panelB] };
    const el = { homePanelId: 'panelA', x: 5000, y: 5000 }; // très loin de panelA géométriquement
    assert.equal(homeOwningPanel(el, page), panelA);
  });

  test('homePanelId pointant vers une Case supprimée : repli sur findOwningPanel (recherche géométrique)', () => {
    const panelA = { id: 'panelA', type: 'panel', x: 0, y: 0, w: 100, h: 100 };
    const page = { objects: [panelA] };
    const el = { homePanelId: 'panelDisparue', x: 50, y: 50, w: 10, h: 10 };
    assert.equal(homeOwningPanel(el, page), panelA);
  });
});

describe('elementsInPanel — Éléments (Personas/Objets, hors Dalles) appartenant à une Case', () => {
  test('filtre par Case propriétaire, exclut les Dalles et les autres types', () => {
    const panel = { id: 'panel1', type: 'panel', x: 0, y: 0, w: 100, h: 100 };
    const perso = { id: 'e1', type: 'perso', homePanelId: 'panel1' };
    const objet = { id: 'e2', type: 'objet3d', objType: 'chaise', homePanelId: 'panel1' };
    const dalle = { id: 'e3', type: 'objet3d', objType: 'dalle', homePanelId: 'panel1' };
    const ailleurs = { id: 'e4', type: 'perso', homePanelId: 'panelAutre' };
    const page = { objects: [panel, perso, objet, dalle, ailleurs] };
    const els = elementsInPanel(panel, page);
    assert.deepEqual(els.map(e => e.id).sort(), ['e1', 'e2']);
  });
});
