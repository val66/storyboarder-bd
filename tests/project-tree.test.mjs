/**
 * tests/project-tree.test.mjs, le menu de gauche, extrait d'events.js.
 *
 * Ce qui EST testable ici : que le module s'importe seul (donc qu'il ne dépend pas d'un ordre
 * d'évaluation particulier), et que la couture qui le relie à events.js tient. Le rendu lui-même
 * écrit dans le DOM et n'est pas vérifiable sous le stub, cf. l'en-tête de dom-stub.mjs.
 */
import './helpers/dom-stub.mjs';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sourceSansCommentaires } from './helpers/source.mjs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(join(RACINE, f), 'utf8');
const evt = lire('src/events.js');
const arbre = lire('src/project-tree.js');

describe('project-tree.js : la couture avec events.js', () => {
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

describe('#406b : changer de Planche remet en tête ce qu\'on regarde', () => {
  /**
   * ⚠️ C'EST LE COÛT QUE LA CASCADE CRÉE, et c'est ici qu'il se paie. Servir les vagues dans
   * l'ordre veut dire qu'arriver sur une Planche d'un autre Tome ferait attendre derrière la vague
   * en cours — c'est-à-dire derrière des fichiers dont cette Planche n'a que faire. Sans cette
   * ligne, la cascade AMÉLIORE l'ouverture et DÉGRADE la navigation, ce qui serait le mauvais
   * échange qu'on a déjà écarté deux fois (#404, et la priorité elle-même).
   *
   * L'appel est idempotent : `preloadModels`/`preloadImages` ignorent ce qui est déjà chargé ou en
   * cours. Changer de Planche ne recharge donc rien, il réordonne ce qui reste.
   */
  const SRC = sourceSansCommentaires(
    readFileSync(new URL('../src/project-tree.js', import.meta.url), 'utf8'));

  test('RÉGRESSION : allerALaPlanche réordonne le préchargement', () => {
    const i = SRC.indexOf('export function allerALaPlanche');
    assert.ok(i > 0, 'allerALaPlanche a disparu');
    const corps = SRC.slice(i, SRC.indexOf('\n}', i));
    assert.match(corps, /prechargerEnCascade3D\(\)/,
      'arriver sur une Planche ne remet plus ses fichiers en tête : ils attendront la vague en cours');
    // AVANT le rendu : réordonner après aurait laissé passer une frame à demander des fichiers
    // encore en queue de file.
    assert.ok(corps.indexOf('prechargerEnCascade3D()') < corps.indexOf('renderAll()'),
      'le réordonnancement arrive après le dessin, donc trop tard pour lui servir');
  });
});
