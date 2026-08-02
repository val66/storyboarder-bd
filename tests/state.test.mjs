// tests/state.test.mjs — Tests unitaires de src/state.js (état applicatif partagé S, accesseurs de
// page/Tome courants, création de Tomes/Pages, numérotation des Cases, traduction).
import './helpers/dom-stub.mjs';
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  S,
  currentVolume,
  currentPageData,
  currentPage,
  newId,
  nextDefaultVolumeName,
  createVolume,
  addPageToVolume,
  tr,
  isLockedScenePanel,
  panelsInPage,
  renumberPanels,
  ensurePanelNumbers,
} from '../src/state.js';

beforeEach(() => {
  S.tomes = [];
  S.scenes = [];
  S.editingSceneId = null;
  S.currentTomeIndex = 0;
  S.currentPageIndex = 0;
  S.idCounter = 0;
});

// ── newId ─────────────────────────────────────────────────────────────────────────────────────
describe('newId — générateur d\'identifiant unique', () => {
  test('préfixe par défaut "o", incrémente S.idCounter à chaque appel', () => {
    assert.equal(newId(), 'o1');
    assert.equal(newId(), 'o2');
    assert.equal(S.idCounter, 2);
  });

  test('préfixe explicite', () => {
    assert.equal(newId('w'), 'o1'.replace('o', 'w'));
  });
});

// ── tr ────────────────────────────────────────────────────────────────────────────────────────
describe('tr — sélection de chaîne EN/FR selon S.appLang', () => {
  test('S.appLang === "en" : renvoie la chaîne anglaise', () => {
    S.appLang = 'en';
    assert.equal(tr('Hello', 'Bonjour'), 'Hello');
  });

  test('S.appLang !== "en" (ex. "fr") : renvoie la chaîne française', () => {
    S.appLang = 'fr';
    assert.equal(tr('Hello', 'Bonjour'), 'Bonjour');
  });
});

// ── nextDefaultVolumeName / createVolume / addPageToVolume ────────────────────────────────────────────
describe('nextDefaultVolumeName — nom par défaut du prochain Tome', () => {
  test('aucun Tome existant : "Tome 1"', () => {
    assert.equal(nextDefaultVolumeName(), 'Tome 1');
  });

  test('Tomes existants "Tome 1"/"Tome 3"/"Autre" : "Tome 4" (max + 1, ignore les noms non standards)', () => {
    S.tomes = [{ name: 'Tome 1' }, { name: 'Tome 3' }, { name: 'Autre' }];
    assert.equal(nextDefaultVolumeName(), 'Tome 4');
  });
});

describe('createVolume / addPageToVolume — création d\'un Tome et de ses Pages', () => {
  test('createVolume("fb") : Tome au format Franco-Belge, poussé dans S.tomes, sans Page', () => {
    const t = createVolume('fb');
    assert.equal(S.tomes.length, 1);
    assert.equal(S.tomes[0], t);
    assert.equal(t.format, 'fb');
    assert.equal(t.w, 550);
    assert.equal(t.h, 725);
    assert.equal(t.scale, 4);
    assert.equal(t.name, 'Tome 1');
    assert.deepEqual(t.pages, []);
  });

  test('addPageToVolume : pousse une Page vide (id unique + objects:[]) dans tome.pages', () => {
    const t = createVolume('fb');
    addPageToVolume(t);
    addPageToVolume(t);
    assert.equal(t.pages.length, 2);
    assert.notEqual(t.pages[0].id, t.pages[1].id, 'ids uniques');
    assert.deepEqual(t.pages[0].objects, []);
  });
});

// ── currentVolume / currentPageData / currentPage ─────────────────────────────────────────────────
describe('currentVolume / currentPageData / currentPage — accesseurs de la Planche courante', () => {
  test('hors édition de Scène : lit S.tomes[S.currentTomeIndex] / .pages[S.currentPageIndex]', () => {
    const t = createVolume('fb');
    addPageToVolume(t);
    addPageToVolume(t);
    S.currentPageIndex = 1;
    assert.equal(currentVolume(), t);
    assert.equal(currentPageData(), t.pages[1]);
  });

  test('currentPage() fusionne dimensions du Tome et objects de la Page courante', () => {
    const t = createVolume('fb');
    addPageToVolume(t);
    t.pages[0].objects.push({ id: 'x1' });
    const page = currentPage();
    assert.equal(page.w, t.w);
    assert.equal(page.h, t.h);
    assert.equal(page.format, t.format);
    assert.deepEqual(page.objects, [{ id: 'x1' }]);
  });

  test('en édition de Scène (S.editingSceneId défini) : bascule sur S.scenes et sa page unique (pages[0])', () => {
    const t = createVolume('fb');
    S.scenes = [{ id: 'sceneA', w: 10, h: 20, pages: [{ objects: ['sceneObj'] }] }];
    S.editingSceneId = 'sceneA';
    assert.equal(currentVolume(), S.scenes[0]);
    assert.deepEqual(currentPageData(), { objects: ['sceneObj'] });
  });

  test('S.editingSceneId pointant vers une Scène disparue : repli silencieux sur le Tome courant (et remet editingSceneId à null)', () => {
    const t = createVolume('fb');
    addPageToVolume(t);
    S.scenes = [];
    S.editingSceneId = 'sceneDisparue';
    assert.equal(currentVolume(), t);
    assert.equal(S.editingSceneId, null, 'nettoyé automatiquement');
  });
});

// ── isLockedScenePanel ────────────────────────────────────────────────────────────────────────
describe('isLockedScenePanel — Case verrouillée = canevas plein-cadre d\'une Scène en édition', () => {
  test('aucune Scène en édition : toujours false, même pour un panel', () => {
    S.editingSceneId = null;
    assert.equal(isLockedScenePanel({ type: 'panel' }), false);
  });

  test('Scène en édition + objet de type panel : true', () => {
    S.editingSceneId = 'sceneA';
    assert.equal(isLockedScenePanel({ type: 'panel' }), true);
  });

  test('Scène en édition mais objet non-panel : false', () => {
    S.editingSceneId = 'sceneA';
    assert.equal(isLockedScenePanel({ type: 'perso' }), false);
  });

  test('objet absent : false, ne plante pas', () => {
    S.editingSceneId = 'sceneA';
    assert.equal(isLockedScenePanel(null), false);
  });
});

// ── panelsInPage / renumberPanels / ensurePanelNumbers ─────────────────────────────────────────────
describe('panelsInPage / renumberPanels / ensurePanelNumbers — numérotation des Cases d\'une Planche', () => {
  test('panelsInPage : ne garde que les objets type:"panel" (exclut Personas/Objets)', () => {
    const page = { objects: [
      { type: 'panel', id: 'p1', caseNumber: 3 },
      { type: 'panel', id: 'p2', caseNumber: 1 },
      { type: 'perso', id: 'x1' },
    ] };
    assert.deepEqual(panelsInPage(page).map(o => o.id), ['p1', 'p2']);
  });

  test('renumberPanels : réassigne 1..N dans l\'ordre des numéros actuels (ne préserve pas l\'ordre du tableau)', () => {
    const page = { objects: [
      { type: 'panel', id: 'p1', caseNumber: 3 },
      { type: 'panel', id: 'p2', caseNumber: 1 },
    ] };
    renumberPanels(page);
    assert.deepEqual(page.objects.map(o => [o.id, o.caseNumber]), [['p1', 2], ['p2', 1]]);
  });

  test('ensurePanelNumbers : renumérote uniquement si au moins une Case n\'a pas encore de numéro', () => {
    const page = { objects: [
      { type: 'panel', id: 'p1' },              // pas de caseNumber
      { type: 'panel', id: 'p2', caseNumber: 1 },
    ] };
    ensurePanelNumbers(page);
    assert.ok(page.objects.every(o => o.caseNumber), 'toutes les Cases ont désormais un numéro');
  });

  test('ensurePanelNumbers : ne touche à rien si toutes les Cases ont déjà un numéro', () => {
    const page = { objects: [
      { type: 'panel', id: 'p1', caseNumber: 1 },
      { type: 'panel', id: 'p2', caseNumber: 2 },
    ] };
    ensurePanelNumbers(page);
    assert.deepEqual(page.objects.map(o => o.caseNumber), [1, 2], 'inchangé');
  });
});
