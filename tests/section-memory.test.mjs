/**
 * tests/section-memory.test.mjs, la mémoire de ce qui est plié dans les menus (#441).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PREFIXE_GAUCHE, PREFIXE_TOME, PREFIXE_DROITE, PREFIXE_GROUPE,
  menuGaucheOuvert, memoriserMenuGauche, tomeOuvert, memoriserTome, tomesOuverts,
  sectionDroitePliee, memoriserSectionDroite, groupeReplie, memoriserGroupe,
} from '../src/section-memory.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = (f) => readFileSync(join(RACINE, 'src', f), 'utf8');
const events = source('events.js');

/** Un localStorage en mémoire. */
function stockage(initial = {}){
  const m = new Map(Object.entries(initial));
  return {
    m,
    getItem(c){ return m.has(c) ? m.get(c) : null; },
    setItem(c, v){ m.set(c, String(v)); },
  };
}

/** Un stockage qui refuse tout, comme un quota plein. */
const casse = { getItem(){ throw new Error('x'); }, setItem(){ throw new Error('x'); } };

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
  test('une valeur inconnue rend le défaut', () => {
    const s = stockage({ [PREFIXE_GAUCHE + 'treePanel']: 'oui' });
    assert.equal(menuGaucheOuvert(s, 'treePanel', true), true);
    assert.equal(menuGaucheOuvert(s, 'treePanel', false), false);
  });
});

describe('Tomes de l\'arborescence', () => {
  test('aller-retour', () => {
    const s = stockage();
    memoriserTome(s, 't1', true);
    memoriserTome(s, 't2', false);
    assert.equal(s.getItem(PREFIXE_TOME + 't1'), '1');
    assert.equal(s.getItem(PREFIXE_TOME + 't2'), '0');
    assert.equal(tomeOuvert(s, 't1', false), true);
    assert.equal(tomeOuvert(s, 't2', true), false);
    assert.equal(tomeOuvert(s, 't3', true), true);
  });
  test('à l\'ouverture d\'un Projet : le premier Tome par défaut, puis ce qui est mémorisé', () => {
    const tomes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    assert.deepEqual([...tomesOuverts(stockage(), tomes)], ['a']);
    const s = stockage();
    memoriserTome(s, 'a', false);
    memoriserTome(s, 'c', true);
    assert.deepEqual([...tomesOuverts(s, tomes)], ['c']);
    assert.deepEqual([...tomesOuverts(s, [])], []);
  });
});

describe('sections de droite, par entité', () => {
  test('sans mémoire, une section est dépliée', () => {
    assert.equal(sectionDroitePliee(stockage(), 'p1', 'sideBorderSection'), false);
  });
  test('chaque entité garde son état, sous la clé d\'avant #441', () => {
    const s = stockage();
    memoriserSectionDroite(s, 'p1', 'sideBorderSection', true);
    assert.equal(s.getItem(PREFIXE_DROITE + 'p1:sideBorderSection'), '1');
    assert.equal(PREFIXE_DROITE, 'sc:');
    assert.equal(sectionDroitePliee(s, 'p1', 'sideBorderSection'), true);
    assert.equal(sectionDroitePliee(s, 'p2', 'sideBorderSection'), false);
    memoriserSectionDroite(s, 'p1', 'sideBorderSection', false);
    assert.equal(s.getItem(PREFIXE_DROITE + 'p1:sideBorderSection'), '0');
    assert.equal(sectionDroitePliee(s, 'p1', 'sideBorderSection'), false);
  });
});

describe('groupes Pièce et Bâtiment', () => {
  test('aller-retour, déplié par défaut', () => {
    const s = stockage();
    assert.equal(groupeReplie(s, 'piece1'), false);
    memoriserGroupe(s, 'piece1', true);
    assert.equal(s.getItem(PREFIXE_GROUPE + 'piece1'), '1');
    assert.equal(groupeReplie(s, 'piece1'), true);
    assert.equal(groupeReplie(s, 'piece1,piece2'), false);
    memoriserGroupe(s, 'piece1', false);
    assert.equal(s.getItem(PREFIXE_GROUPE + 'piece1'), '0');
    assert.equal(groupeReplie(s, 'piece1'), false);
  });
});

test('les familles de clés ne se mêlent pas', () => {
  const s = stockage();
  memoriserMenuGauche(s, 'x', false);
  memoriserTome(s, 'x', false);
  memoriserSectionDroite(s, 'x', 'x', false);
  memoriserGroupe(s, 'x', false);
  assert.equal(s.m.size, 4);
});

describe('un stockage qui échoue ou manque', () => {
  test('rend les défauts sans lever', () => {
    for (const st of [casse, null, undefined]) {
      assert.equal(menuGaucheOuvert(st, 'a', true), true);
      assert.equal(tomeOuvert(st, 'a', false), false);
      assert.deepEqual([...tomesOuverts(st, [{ id: 'a' }, { id: 'b' }])], ['a']);
      assert.equal(sectionDroitePliee(st, 'e', 'a'), false);
      assert.equal(groupeReplie(st, 'a'), false);
      assert.doesNotThrow(() => {
        memoriserMenuGauche(st, 'a', true); memoriserTome(st, 'a', true);
        memoriserSectionDroite(st, 'e', 'a', true); memoriserGroupe(st, 'a', true);
      });
    }
  });
});

describe('le câblage', () => {
  test('les menus de gauche lisent et écrivent leur mémoire', () => {
    const corps = events.slice(events.indexOf('function setupDropdown('), events.indexOf("setupDropdown('treeTrigger'"));
    assert.match(corps, /menuGaucheOuvert\(localStorage, panelId,/);
    assert.match(corps, /memoriserMenuGauche\(localStorage, panelId,/);
  });
  test('le panneau de droite range par entité', () => {
    assert.match(events, /sectionDroitePliee\(localStorage, entityId, sec\.id\)/);
    assert.match(events, /memoriserSectionDroite\(localStorage, scEntityId\(\), sec\.id,/);
  });
  test('les Tomes : mémorisés au clic et à la création, relus à l\'ouverture', () => {
    const arbre = source('project-tree.js');
    assert.equal((arbre.match(/memoriserTome\(/g) || []).length, 2);
    assert.match(source('io.js'), /S\.expandedVolumes = tomesOuverts\(globalThis\.localStorage, S\.tomes\)/);
  });
  test('les groupes de la liste des Éléments ne vivent plus dans un objet oublié au lancement', () => {
    const barre = source('sidebar.js');
    assert.doesNotMatch(barre, /sideGroupCollapsed\[/);
    assert.equal((barre.match(/basculerGroupe\(/g) || []).length, 3);
    assert.equal((barre.match(/groupeReplie\(globalThis\.localStorage/g) || []).length, 3);
  });
});
