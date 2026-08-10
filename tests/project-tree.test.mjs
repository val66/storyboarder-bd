/**
 * tests/project-tree.test.mjs — le menu de gauche, extrait d'events.js.
 *
 * Ce qui EST testable ici : que le module s'importe seul (donc qu'il ne dépend pas d'un ordre
 * d'évaluation particulier), et que la couture qui le relie à events.js tient. Le rendu lui-même
 * écrit dans le DOM et n'est pas vérifiable sous le stub — cf. l'en-tête de dom-stub.mjs.
 */
import './helpers/dom-stub.mjs';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(join(RACINE, f), 'utf8');
const evt = lire('src/events.js');
const arbre = lire('src/project-tree.js');

describe('project-tree.js — la couture avec events.js', () => {
  test('RÉGRESSION : events.js injecte les sept dépendances remontantes', () => {
    // Sans injection, cliquer une Scène, un Tome ou une Planche du menu de gauche lève un
    // TypeError sur un callback absent. Rien ne le dit avant le clic.
    const m = evt.match(/setProjectTreeCallbacks\(\{([\s\S]*?)\}\)/);
    assert.ok(m, 'l\'appel d\'injection a disparu d\'events.js');
    ['createScene', 'openScene', 'disableSceneCameraMode', 'openPageContextMenu',
     'openVolumeContextMenu', 'openSceneContextMenu', 'snapshot']
      .forEach(n => assert.ok(m[1].includes(n), `${n} n'est plus injecté`));
  });

  test('RÉGRESSION : project-tree.js n\'importe RIEN d\'events.js', () => {
    assert.doesNotMatch(arbre, /from '\.\/events\.js'/,
      'import remontant vers events.js : cycle réintroduit');
  });

  test('le module s\'importe seul, sans events.js', async () => {
    // Il s'évalue AVANT son importateur : s'il avait besoin de quoi que ce soit d'events.js au
    // moment de l'évaluation, cet import échouerait. C'est le seul test qui le prouve.
    const m = await import('../src/project-tree.js');
    ['renderTree', 'renderSceneList', 'duplicatePage', 'renameVolume', 'renameScene',
     'setProjectTreeCallbacks'].forEach(n =>
      assert.equal(typeof m[n], 'function', `${n} n'est pas exporté`));
  });

  test('aucune instruction de premier niveau n\'appelle un callback injecté', () => {
    // Le piège exact évité par wirePersonaEditor : un module importé s'évalue avant son
    // importateur, donc avant setProjectTreeCallbacks. renderSceneList() au premier niveau est
    // sûr parce qu'elle ne lit que S.scenes et écrit le DOM. Ce test ferme la porte au suivant.
    const premierNiveau = arbre.split('\n')
      .filter(l => /^[a-zA-Z_$]/.test(l) && !/^(import|export|const|let|function|async)\b/.test(l));
    premierNiveau.forEach(l => {
      ['createScene(', 'openScene(', 'snapshot(', 'disableSceneCameraMode('].forEach(c =>
        assert.ok(!l.includes(c),
          `« ${l.trim()} » appelle ${c} à l'évaluation, avant l'injection`));
    });
  });

  test('l\'arborescence n\'est plus dans events.js', () => {
    assert.doesNotMatch(evt, /^function renderTree\(/m,
      'le rendu du menu de gauche est revenu dans events.js');
  });
});
