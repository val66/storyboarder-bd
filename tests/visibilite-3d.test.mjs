/**
 * tests/visibilite-3d.test.mjs, #449 : « Non visible ». Les fonctions pures du rendu d'identifiants
 * (couleurs, comptage, cadre, décision), exécutées ; puis les branchements dans scene3d.js et la
 * liste latérale, lus dans la source (la passe WebGL elle-même ne tourne pas sous Node).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  couleurIdentifiant, identifiantDeCouleur, compterPixels, cadreDeMesure, estNonVisible,
  SEUIL_PIXELS_VISIBLE, TAILLE_MESURE_PX,
} from '../src/visibilite-3d.js';

const lire = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

describe('Les couleurs d\'identifiants', () => {
  test('aller et retour, et le noir n\'est personne', () => {
    for (const n of [1, 2, 255, 256, 65535, 65536, 0xabcdef]) {
      const c = couleurIdentifiant(n);
      assert.equal(identifiantDeCouleur((c >> 16) & 255, (c >> 8) & 255, c & 255), n);
    }
    assert.equal(identifiantDeCouleur(0, 0, 0), 0);
    assert.throws(() => couleurIdentifiant(0));
    assert.throws(() => couleurIdentifiant(0x1000000));
  });
  test('le comptage ignore le noir et l\'alpha', () => {
    const t = new Uint8Array([0, 0, 1, 255, 0, 0, 1, 0, 0, 0, 0, 255, 0, 1, 0, 255]);
    assert.deepEqual([...compterPixels(t)], [[1, 2], [256, 1]]);
  });
});

describe('Le cadre de mesure', () => {
  const page = { w: 1000, h: 1400 };
  test('le rectangle de la Case est centré, proportionnel, et ne dépasse pas la cible', () => {
    const c = cadreDeMesure(1000, 1400, { w: 500, h: 350 }, page);
    assert.ok(Math.max(c.cw, c.ch) <= TAILLE_MESURE_PX);
    assert.equal(c.cw, Math.round(c.w / 2));
    assert.equal(c.ch, Math.round(c.h / 4));
    assert.equal(c.x, Math.floor((c.w - c.cw) / 2));
    assert.equal(c.y, Math.floor((c.h - c.ch) / 2));
  });
  test('une petite Case n\'est jamais agrandie au-delà du rendu', () => {
    const c = cadreDeMesure(100, 140, { w: 100, h: 70 }, page);
    assert.equal(c.w, 100);
    assert.equal(c.h, 140);
  });
});

describe('La décision', () => {
  test('hors du cadre : non visible, quelle que soit la mesure', () => {
    assert.equal(estNonVisible({ horsChamp: true, mesure: 500 }), true);
  });
  test('dans le cadre : la mesure tranche ; sans mesure, VISIBLE', () => {
    assert.equal(estNonVisible({ mesure: 0 }), true, 'caché derrière autre chose');
    assert.equal(estNonVisible({ mesure: SEUIL_PIXELS_VISIBLE }), false);
    assert.equal(estNonVisible({ mesure: null }), false, 'dans le doute, visible');
    assert.equal(estNonVisible(), false);
  });
});

describe('Les branchements', () => {
  const SC = lire('src/scene3d.js');
  test('la passe suit le rendu de la Case, sur la même scène, et un échec est noté sans réessai', () => {
    const f = SC.slice(SC.indexOf('function renderPanelSceneUncached3D'), SC.indexOf('// #449 : « NON VISIBLE »'));
    assert.match(f, /entryCache\.visibilites = null;\n  if \(_mesurerCase3D\(panel\.id\)\) \{/);
    assert.match(f, /groupes: _groupesVisibilite, cadre: cadreDeMesure\(rw, rh, panel, page\),/);
    assert.match(f, /entryCache\.visibilites = \{ sig, echec: true \};/);
    assert.match(f, /_groupesVisibilite\.set\(o\.id, entry\.figureGroup\)/);
  });
  test('le cache n\'est pas servi tant que la mesure attendue manque', () => {
    assert.match(SC, /const _mesureManquante = _mesurerCase3D\(panel\.id\) && !\(cached && cached\.visibilites && cached\.visibilites\.sig === sig\);/);
    assert.match(SC, /if \(cached && cached\.sig === sig && !_mesureManquante\)/);
  });
  test('non visible = hors champ géométrique, sinon la mesure ; sans mesure, on la demande', () => {
    const f = SC.slice(SC.indexOf('export function elementNonVisible3D'));
    assert.match(f, /if \(elementHorsChamp3D\(o, panel, page\)\) return true;\n  return estNonVisible\(\{ horsChamp: false, mesure: pixelsVisibles3D\(o, panel, demander\) \}\);/);
    const p = SC.slice(SC.indexOf('export function pixelsVisibles3D'), SC.indexOf('export function elementNonVisible3D'));
    assert.match(p, /if \(!v \|\| v\.sig !== entree\.sig\) \{ if \(demander\) _demanderMesure3D\(panel\); return null; \}/);
    assert.match(p, /if \(v\.echec \|\| !v\.mesurables\.has\(o\.id\)\) return null;/);
  });
  test('les demandes sont bornées et ne redessinent qu\'une fois', () => {
    const f = SC.slice(SC.indexOf('function _demanderMesure3D'), SC.indexOf('export function pixelsVisibles3D'));
    assert.match(f, /if \(_casesAMesurer\.has\(panel\.id\)\) return;/);
    assert.match(f, /while \(_casesAMesurer\.size > CASES_A_MESURER_MAX\)/);
    assert.match(f, /if \(!_redessinDemande && _drawCurrentPage\)/);
  });
  test('la liste latérale dit « Non visible » et s\'appuie sur la nouvelle décision', () => {
    const SB = lire('src/sidebar.js');
    assert.match(SB, /export function renderSidePersonas\(panel, page, horsChampFn = elementNonVisible3D\)\{/);
    assert.match(SB, /tr\(`Not visible \(\$\{horsChamp\.length\}\)`, `Non visible \(\$\{horsChamp\.length\}\)`\)/);
    assert.doesNotMatch(SB, /Hors champ \(/);
  });
});
