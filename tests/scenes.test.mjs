/**
 * tests/scenes.test.mjs, le domaine Scène, extrait d'events.js.
 *
 * Une Scène a la MÊME FORME qu'un Tome à une seule Planche portant une Case plein cadre. Ce n'est
 * pas un détail d'implémentation : c'est ce qui permet à tout le moteur de rendu et d'édition de
 * travailler sur une Scène sans savoir qu'elle existe. Si cette forme change, des pans entiers de
 * l'application cessent de fonctionner sur les Scènes, sans qu'aucun d'eux ne le signale.
 */
import './helpers/dom-stub.mjs';
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { S } from '../src/state.js';
import { createScene } from '../src/scenes.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(join(RACINE, f), 'utf8');

describe('scenes.js : la forme d\'une Scène', () => {
  beforeEach(() => { S.scenes = []; });

  test('une Scène est un Tome à une Planche portant une Case plein cadre', () => {
    // La propriété dont dépend toute la réutilisation du moteur. Elle n'était vérifiée nulle part.
    const s = createScene();
    assert.equal(s.pages.length, 1, 'une seule Planche');
    const objets = s.pages[0].objects;
    const cases = objets.filter(o => o.type === 'panel');
    assert.equal(cases.length, 1, 'une seule Case');
    const c = cases[0];
    assert.equal(c.x, 0); assert.equal(c.y, 0);
    // Le format est porté par la SCÈNE, pas par sa Planche : `pages[0]` ne contient qu'`objects`.
    // Vérifié en écrivant ce test, ma première version comparait à `pages[0].w`, undefined.
    assert.equal(c.w, s.w, 'la Case couvre toute la largeur de la Scène');
    assert.equal(c.h, s.h, 'et toute sa hauteur');
    assert.ok(Array.isArray(c.pts) && c.pts.length > 0, 'ses points sont calculés');
  });

  test('createScene inscrit la Scène dans S.scenes et lui donne un id unique', () => {
    const a = createScene(), b = createScene();
    assert.equal(S.scenes.length, 2);
    assert.notEqual(a.id, b.id);
    assert.notEqual(a.pages[0].objects[0].id, b.pages[0].objects[0].id);
  });

  test('deux Scènes créées d\'affilée ne portent pas le même nom', () => {
    const noms = [createScene().name, createScene().name, createScene().name];
    assert.equal(new Set(noms).size, 3, `noms en double : ${noms.join(', ')}`);
  });
});

describe('scenes.js : la couture avec events.js', () => {
  const evt = lire('src/events.js');
  const sc = lire('src/scenes.js');

  test('RÉGRESSION : events.js injecte snapshot', () => {
    assert.match(evt, /setScenesCallbacks\(\{\s*snapshot\s*\}\)/,
      'sans injection, charger une Scène dans une Case ne pose plus de point d\'annulation — '
      + 'et remplacer le contenu d\'une Case est irréversible');
  });

  test('RÉGRESSION : scenes.js n\'importe RIEN d\'events.js', () => {
    assert.doesNotMatch(sc, /from '\.\/events\.js'/, 'cycle réintroduit');
  });

  test('le domaine Scène n\'est plus éparpillé dans events.js', () => {
    // \b obligatoire : sans lui, « function openScene » matche openSceneContextMenu, qui reste
    // légitimement dans events.js. Constaté en écrivant ce test, il échouait pour rien.
    ['createScene', 'openScene', 'loadSceneIntoPanel'].forEach(n =>
      assert.ok(!new RegExp(`^(async )?function ${n}\\b`, 'm').test(evt),
        `${n} est revenu dans events.js`));
  });

  test('la liste des Scènes reste au menu de gauche, pas ici', () => {
    // Frontière assumée : scenes.js dit ce qu'EST une Scène, project-tree.js l'affiche.
    assert.doesNotMatch(sc, /renderSceneList/, 'le rendu de la liste a migré ici par erreur');
    assert.match(lire('src/project-tree.js'), /function renderSceneList/);
  });
});
