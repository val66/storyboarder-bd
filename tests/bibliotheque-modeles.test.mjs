/**
 * tests/bibliotheque-modeles.test.mjs, la catégorie CHOISIE et les TAGS des modèles (demandé) :
 * le module pur (bibliotheque-modeles.js), son effet sur « Mes modèles » (local-library.js), et le
 * câblage du processus principal.
 */
import './helpers/dom-stub.mjs';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const b = require('../bibliotheque-modeles.js');
const { entreesLocales, filtrerEntrees, NON_CLASSE } = await import('../src/local-library.js');

describe('Les tags', () => {
  test('créer, puis créer le même nom : le tag EXISTANT, pas un doublon (casse et accents ignorés)', () => {
    const { bibliotheque: s1, id: a } = b.creerTag(null, '  Médiéval ');
    assert.equal(a, 't1');
    assert.deepEqual(s1.tags, [{ id: 't1', nom: 'Médiéval' }]);
    const { bibliotheque: s2, id: a2 } = b.creerTag(s1, 'medieval');
    assert.equal(a2, 't1');
    assert.equal(s2.tags.length, 1);
    assert.equal(b.creerTag(s2, '   ').id, null);
  });
  test('les identifiants ne se réutilisent pas après une suppression', () => {
    let s = b.creerTag(null, 'A').bibliotheque;
    s = b.creerTag(s, 'B').bibliotheque;
    s = b.supprimerTag(s, 't1');
    assert.equal(b.creerTag(s, 'C').id, 't3');
  });
  test('renommer : refusé si le nom est pris par un AUTRE tag, permis pour changer sa propre casse', () => {
    let s = b.creerTag(null, 'Ville').bibliotheque;
    s = b.creerTag(s, 'Forêt').bibliotheque;
    assert.equal(b.renommerTag(s, 't2', 'ville').erreur, 'pris');
    assert.equal(b.renommerTag(s, 't1', 'VILLE').erreur, undefined);
    assert.equal(b.renommerTag(s, 't1', 'VILLE').bibliotheque.tags[0].nom, 'VILLE');
    assert.equal(b.renommerTag(s, 't9', 'x').erreur, 'inconnu');
  });
  test('plusieurs tags par modèle ; supprimer un tag le retire de tous les modèles', () => {
    let s = b.creerTag(null, 'A').bibliotheque;
    s = b.creerTag(s, 'B').bibliotheque;
    s = b.tagModele(s, 'chaise.glb', 't1', true);
    s = b.tagModele(s, 'chaise.glb', 't2', true);
    s = b.tagModele(s, 'table.glb', 't1', true);
    assert.deepEqual(s.tagsParModele['chaise.glb'], ['t1', 't2']);
    assert.equal(b.modelesAvecTag(s, 't1'), 2);
    s = b.supprimerTag(s, 't1');
    assert.deepEqual(s.tagsParModele, { 'chaise.glb': ['t2'] });
  });
  test('un tag inconnu ne se pose pas', () => {
    assert.deepEqual(b.tagModele(null, 'a.glb', 't7', true).tagsParModele, {});
  });
});

describe('La catégorie choisie, et le suivi des fichiers', () => {
  test('choisir, puis revenir à l\'automatique', () => {
    const s = b.choisirCategorie(null, 'a.glb', 'mobilier');
    assert.equal(s.categories['a.glb'], 'mobilier');
    assert.deepEqual(b.choisirCategorie(s, 'a.glb', null).categories, {});
  });
  test('un modèle renommé garde sa catégorie et ses tags ; supprimé, il les perd (pas les tags eux-mêmes)', () => {
    let s = b.creerTag(null, 'A').bibliotheque;
    s = b.tagModele(b.choisirCategorie(s, 'Chaise.glb', 'mobilier'), 'Chaise.glb', 't1', true);
    s = b.renommerModele(s, 'chaise.glb', 'Fauteuil.glb');
    assert.equal(s.categories['Fauteuil.glb'], 'mobilier');
    assert.deepEqual(s.tagsParModele['Fauteuil.glb'], ['t1']);
    s = b.oublierModele(s, 'fauteuil.glb');
    assert.deepEqual(s.categories, {});
    assert.deepEqual(s.tagsParModele, {});
    assert.equal(s.tags.length, 1);
  });
  test('un fichier abîmé ou trafiqué est nettoyé, pas cru', () => {
    const s = b.normaliser({ categories: { 'a.glb': 'Mobilier!', 'b.glb': 'nature' }, tags: [{ id: 'x', nom: 'A' }, { id: 't1', nom: '' }, { id: 't2', nom: 'B' }, { id: 't2', nom: 'C' }], tagsParModele: { 'a.glb': ['t2', 't9', 't2'] } });
    assert.deepEqual(s.categories, { 'b.glb': 'nature' });
    assert.deepEqual(s.tags, [{ id: 't2', nom: 'B' }]);
    assert.deepEqual(s.tagsParModele, { 'a.glb': ['t2'] });
  });
  test('une opération inconnue ne change rien', () => {
    assert.equal(b.appliquer(null, 'effacerTout', {}).erreur, 'operation');
  });
});

describe('« Mes modèles » : catégorie choisie et filtre par tags', () => {
  let s = b.creerTag(null, 'Médiéval').bibliotheque;
  s = b.creerTag(s, 'Intérieur').bibliotheque;
  s = b.tagModele(s, 'chaise.glb', 't1', true);
  s = b.tagModele(s, 'chaise.glb', 't2', true);
  s = b.tagModele(s, 'table.glb', 't1', true);
  s = b.choisirCategorie(s, 'chaise.glb', 'patrimoine');
  const entrees = entreesLocales({ fichiers: [{ nom: 'chaise.glb' }, { nom: 'table.glb' }, { nom: 'scene.glb' }], bibliotheque: s });
  const par = (f) => entrees.find(e => e.fichier === f);
  test('la catégorie CHOISIE l\'emporte sur la devinette, et ne se dit pas devinée', () => {
    assert.equal(par('chaise.glb').categorie, 'patrimoine');
    assert.equal(par('chaise.glb').categorieChoisie, true);
    assert.equal(par('chaise.glb').categorieDevinee, false);
    assert.equal(par('table.glb').categorie, 'mobilier', 'sans choix, la devinette reste');
    assert.equal(par('scene.glb').categorie, NON_CLASSE);
  });
  test('les tags d\'un modèle, par nom, triés', () => {
    assert.deepEqual(par('chaise.glb').nomsTags, ['Intérieur', 'Médiéval']);
  });
  test('plusieurs tags : le modèle doit les porter TOUS (chaque tag resserre)', () => {
    assert.deepEqual(filtrerEntrees(entrees, { tags: ['t1'] }).map(e => e.fichier).sort(), ['chaise.glb', 'table.glb']);
    assert.deepEqual(filtrerEntrees(entrees, { tags: ['t1', 't2'] }).map(e => e.fichier), ['chaise.glb']);
  });
  test('la recherche trouve aussi par nom de tag', () => {
    assert.deepEqual(filtrerEntrees(entrees, { texte: 'medieval' }).map(e => e.fichier).sort(), ['chaise.glb', 'table.glb']);
  });
});

describe('Le câblage', () => {
  const MAIN = readFileSync(new URL('../main.js', import.meta.url), 'utf8');
  test('un nom de modèle venu de l\'interface est vérifié ; les opérations passent l\'une après l\'autre', () => {
    assert.match(MAIN, /if \(args && args\.fichier !== undefined && !nomDeModeleAcceptable\(args\.fichier\)\) return \{ refus: 'nom' \};/);
    assert.match(MAIN, /_fileBiblio = suite\.catch/);
  });
  test('renommer ou supprimer un modèle fait suivre sa catégorie et ses tags', () => {
    assert.match(MAIN, /biblio\.renommerModele\(b, ancien, nouveau\)/);
    assert.match(MAIN, /biblio\.oublierModele\(b, name\)/);
  });
  test('le module voyage avec l\'application', () => {
    assert.ok(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).build.files.includes('bibliotheque-modeles.js'));
  });
});
