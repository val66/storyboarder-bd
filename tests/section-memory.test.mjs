/**
 * tests/section-memory.test.mjs, la mémoire des sections pliées des menus (#441).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PREFIXE_GAUCHE, PREFIXE_DROITE, PREFIXE_ANCIEN,
  menuGaucheOuvert, memoriserMenuGauche, sectionDroitePliee, memoriserSectionDroite, oublierAnciennesCles,
} from '../src/section-memory.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const events = readFileSync(join(RACINE, 'src', 'events.js'), 'utf8');

/** Un localStorage en mémoire, avec l'interface que la mémoire utilise. */
function stockage(initial = {}){
  const m = new Map(Object.entries(initial));
  return {
    m,
    get length(){ return m.size; },
    key(i){ return [...m.keys()][i] ?? null; },
    getItem(c){ return m.has(c) ? m.get(c) : null; },
    setItem(c, v){ m.set(c, String(v)); },
    removeItem(c){ m.delete(c); },
  };
}

/** Un stockage qui refuse tout, comme un quota plein ou un contexte sans stockage. */
const casse = {
  get length(){ throw new Error('x'); }, key(){ throw new Error('x'); },
  getItem(){ throw new Error('x'); }, setItem(){ throw new Error('x'); }, removeItem(){ throw new Error('x'); },
};

describe('menus de gauche', () => {
  test('sans mémoire, l\'état par défaut est rendu tel quel', () => {
    assert.equal(menuGaucheOuvert(stockage(), 'treePanel', true), true);
    assert.equal(menuGaucheOuvert(stockage(), 'treePanel', false), false);
  });
  test('un menu fermé reste fermé, un menu ouvert reste ouvert, quel que soit le défaut', () => {
    const s = stockage();
    memoriserMenuGauche(s, 'treePanel', false);
    memoriserMenuGauche(s, 'imagePanel', true);
    assert.equal(s.getItem(PREFIXE_GAUCHE + 'treePanel'), '0');
    assert.equal(s.getItem(PREFIXE_GAUCHE + 'imagePanel'), '1');
    assert.equal(menuGaucheOuvert(s, 'treePanel', true), false);
    assert.equal(menuGaucheOuvert(s, 'imagePanel', false), true);
  });
  test('chaque menu a sa clé : en fermer un ne ferme pas l\'autre', () => {
    const s = stockage();
    memoriserMenuGauche(s, 'scenePanel', false);
    assert.equal(menuGaucheOuvert(s, 'modelPanel', true), true);
  });
  test('une valeur inconnue rend le défaut', () => {
    const s = stockage({ [PREFIXE_GAUCHE + 'treePanel']: 'oui' });
    assert.equal(menuGaucheOuvert(s, 'treePanel', true), true);
    assert.equal(menuGaucheOuvert(s, 'treePanel', false), false);
  });
});

describe('sections de droite', () => {
  test('sans mémoire, une section est dépliée', () => {
    assert.equal(sectionDroitePliee(stockage(), 'sideBorderSection'), false);
  });
  test('pliée puis dépliée, la section suit', () => {
    const s = stockage();
    memoriserSectionDroite(s, 'sideBorderSection', true);
    assert.equal(s.getItem(PREFIXE_DROITE + 'sideBorderSection'), '1');
    assert.equal(sectionDroitePliee(s, 'sideBorderSection'), true);
    memoriserSectionDroite(s, 'sideBorderSection', false);
    assert.equal(s.getItem(PREFIXE_DROITE + 'sideBorderSection'), '0');
    assert.equal(sectionDroitePliee(s, 'sideBorderSection'), false);
  });
  test('les clés de gauche et de droite ne se mêlent pas', () => {
    const s = stockage();
    memoriserMenuGauche(s, 'x', false);
    memoriserSectionDroite(s, 'x', false);
    assert.equal(s.m.size, 2);
  });
});

describe('les anciennes clés par entité', () => {
  test('sont effacées, et elles seules', () => {
    const s = stockage({
      [PREFIXE_ANCIEN + 'p1:sideBorderSection']: '1',
      [PREFIXE_ANCIEN + 'page:p2:sideDescSection']: '0',
      [PREFIXE_DROITE + 'sideDescSection']: '1',
      autre: 'z',
      [PREFIXE_ANCIEN + 'p3:sideLightSection']: '1',
    });
    assert.equal(oublierAnciennesCles(s), 3);
    assert.deepEqual([...s.m.keys()].sort(), [PREFIXE_DROITE + 'sideDescSection', 'autre'].sort());
    assert.equal(oublierAnciennesCles(s), 0);
  });
});

describe('un stockage qui échoue', () => {
  test('rend les défauts sans lever', () => {
    assert.equal(menuGaucheOuvert(casse, 'treePanel', true), true);
    assert.equal(sectionDroitePliee(casse, 'a'), false);
    assert.doesNotThrow(() => memoriserMenuGauche(casse, 'a', true));
    assert.doesNotThrow(() => memoriserSectionDroite(casse, 'a', true));
    assert.equal(oublierAnciennesCles(casse), 0);
  });
  test('un stockage absent aussi', () => {
    assert.equal(menuGaucheOuvert(null, 'treePanel', false), false);
    assert.equal(sectionDroitePliee(undefined, 'a'), false);
    assert.doesNotThrow(() => memoriserSectionDroite(null, 'a', true));
    assert.equal(oublierAnciennesCles(null), 0);
  });
});

describe('le câblage', () => {
  test('les menus de gauche lisent et écrivent leur mémoire', () => {
    const corps = events.slice(events.indexOf('function setupDropdown('), events.indexOf("setupDropdown('treeTrigger'"));
    assert.match(corps, /menuGaucheOuvert\(localStorage, panelId,/);
    assert.match(corps, /memoriserMenuGauche\(localStorage, panelId,/);
  });
  test('le panneau de droite ne range plus par entité', () => {
    assert.doesNotMatch(events, /'sc:' \+/);
    assert.doesNotMatch(events, /scEntityId/);
    assert.match(events, /sectionDroitePliee\(localStorage, sec\.id\)/);
    assert.match(events, /memoriserSectionDroite\(localStorage, sec\.id,/);
  });
});
