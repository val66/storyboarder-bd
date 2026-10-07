/**
 * tests/export-credits.test.mjs, #444f : les crédits des modèles 3D dans une Planche exportée.
 * Fonctions pures, exécutées ; puis le branchement dans `exportPage`, lu dans la source.
 */
import './helpers/dom-stub.mjs';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { modelesDeLaPage, creditsDeLaPage, lignesCredit, replierLigne, titreCredits } = await import('../src/export-credits.js');

const modele = (modelFile) => ({ id: 'e' + Math.random(), type: 'objet3d', objType: 'modele', modelFile });
const canard = {
  source: 'polyhaven', id: 'rubber_duck_toy', fichier: 'Rubber Duck Toy.glb', nom: 'Rubber Duck Toy',
  auteur: { nom: 'Rico Cilliers' }, licence: { libelle: 'CC0 1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/' },
  url: 'https://polyhaven.com/a/rubber_duck_toy',
};
const araignee = {
  source: 'sketchfab', id: 'abc', fichier: 'spider.glb', nom: 'Araignée',
  auteur: { nom: 'Quelqu’un' }, licence: { libelle: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' },
  url: 'https://sketchfab.com/3d-models/abc',
};
const page = { objects: [
  { id: 'c1', type: 'panel' }, modele('spider.glb'), modele('Rubber Duck Toy.glb'), modele('SPIDER.glb'),
  modele('importe-a-la-main.glb'), { id: 'b', type: 'bulle' },
] };

describe('Quels modèles créditer', () => {
  test('les modèles importés de la Page, sans doublon même par la casse', () => {
    assert.deepEqual(modelesDeLaPage(page), ['importe-a-la-main.glb', 'Rubber Duck Toy.glb', 'spider.glb']);
    assert.deepEqual(modelesDeLaPage({}), []);
  });
  test('seuls les modèles VISIBLES : la décision vient de l\'appelant, qui a la caméra', () => {
    const horsCadre = (o) => o.modelFile !== 'spider.glb' && o.modelFile !== 'SPIDER.glb';
    assert.deepEqual(modelesDeLaPage(page, horsCadre), ['importe-a-la-main.glb', 'Rubber Duck Toy.glb']);
    assert.deepEqual(creditsDeLaPage(page, [canard, araignee], horsCadre).map(a => a.nom), ['Rubber Duck Toy']);
    assert.deepEqual(creditsDeLaPage(page, [canard, araignee], () => false), []);
  });
  test('seuls ceux qui ont une attribution, une fois chacun, triés par titre', () => {
    const c = creditsDeLaPage(page, [canard, araignee, { fichier: 'absent.glb', nom: 'Absent' }]);
    assert.deepEqual(c.map(a => a.nom), ['Araignée', 'Rubber Duck Toy']);
    assert.deepEqual(creditsDeLaPage(page, []), []);
    assert.deepEqual(creditsDeLaPage(page, null), []);
  });
});

describe('Le texte d’un crédit', () => {
  test('titre, auteur, licence et source, puis l’adresse du modèle et celle de la licence', () => {
    assert.deepEqual(lignesCredit(araignee, 'fr'), [
      '« Araignée », par Quelqu’un, CC BY 4.0, via Sketchfab',
      'https://sketchfab.com/3d-models/abc',
      'https://creativecommons.org/licenses/by/4.0/',
    ]);
    assert.equal(lignesCredit(canard, 'en')[0], '"Rubber Duck Toy", by Rico Cilliers, CC0 1.0, via Poly Haven');
    assert.equal(titreCredits('fr'), 'Crédits des modèles 3D');
  });
  test('une adresse trop longue est coupée entre ses caractères, sans rien perdre', () => {
    const mesurer = (t) => t.length * 10;
    const url = 'https://sketchfab.com/3d-models/un-modele-au-nom-tres-long-0123456789';
    const lignes = replierLigne(mesurer, url, 200);
    assert.ok(lignes.length > 1);
    assert.ok(lignes.every(l => mesurer(l) <= 200));
    assert.equal(lignes.join(''), url);
    assert.deepEqual(replierLigne(mesurer, 'un deux trois', 80), ['un deux', 'trois']);
  });
});

describe('Le branchement dans l’export', () => {
  const DRAW = readFileSync(new URL('../src/draw.js', import.meta.url), 'utf8');
  const corps = DRAW.slice(DRAW.indexOf('export async function exportPage'), DRAW.indexOf('export function exportVolume'));
  test('les attributions sont lues avant de dessiner, et un échec n’empêche pas l’export', () => {
    assert.match(corps, /const attributions = await attributionsPourExport\(\);/);
    assert.match(DRAW, /async function attributionsPourExport\(\)\{\n  try \{[\s\S]*?\} catch \{ return \[\]; \}/);
  });
  test('les crédits sont TOUJOURS dessinés, quel que soit le réglage des descriptions', () => {
    assert.match(corps, /const credits = creditsDeLaPage\(page, attributions, visibleDansSaCase\);/);
    assert.match(corps, /off\.height = pageH \+ infoHeight \+ creditsHeight;/);
    assert.match(corps, /if \(credits\.length\) \{\n    const y0 = pageH \+ infoHeight;/);
    assert.doesNotMatch(corps.slice(corps.indexOf('const credits')), /exportShowPanelDescriptions/);
  });
  test('#449 : la Planche est dessinée AVANT les crédits, toutes ses Cases mesurées, et la mesure s\'éteint ensuite', () => {
    const i = corps.indexOf('mesurerToutesLesCases3D(true);');
    assert.ok(i > 0 && i < corps.indexOf('const credits'), 'la mesure doit précéder les crédits');
    assert.match(corps, /mesurerToutesLesCases3D\(true\);\n  try \{\n    drawContent\(planche\.getContext\('2d'\)[^\n]*\n  \} finally \{\n    mesurerToutesLesCases3D\(false\);\n  \}/);
    assert.match(corps, /octx\.drawImage\(planche, 0, 0\);/);
    assert.equal((corps.match(/drawContent\(/g) || []).length, 1, 'la Planche n\'est dessinée qu\'une fois');
  });
  test('visible = dans une Case ET ni hors du cadre ni caché ; une mesure qui échoue crédite quand même', () => {
    const f = corps.slice(corps.indexOf('const visibleDansSaCase'), corps.indexOf('const credits'));
    assert.match(f, /const panel = findOwningPanel\(o, page\);\n      return !!panel && !elementNonVisible3D\(o, panel, page, false\);/);
    assert.match(f, /\} catch \{ return true; \}/);
  });
});
