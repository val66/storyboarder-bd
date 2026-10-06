/**
 * tests/store-categories.test.mjs, les catégories COMMUNES de la bibliothèque (demandé : une seule
 * liste pour Sketchfab, Poly Haven et les modèles locaux, sans doublon).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const cats = require('../store-categories.js');
const sketchfab = require('../store-sketchfab.js');
const ph = require('../store-polyhaven.js');
const sources = require('../store-sources.js');

describe('La liste commune', () => {
  test('chaque catégorie Sketchfab relevée a SA catégorie commune, une seule ; aucune n\'est écartée', () => {
    // Règle de Valentin : rassembler quand c'est possible, sinon ajouter. News & Politics a la sienne.
    const sansEquivalent = sketchfab.CATEGORIES.filter(c => !cats.depuisSketchfab(c.slug)).map(c => c.slug);
    assert.deepEqual(sansEquivalent, []);
    assert.equal(cats.depuisSketchfab('news-politics'), 'actualite');
    const cibles = cats.CATEGORIES.map(c => c.sketchfab);
    assert.equal(new Set(cibles).size, cibles.length, 'deux catégories communes visent la même catégorie Sketchfab : doublon');
  });
  test('chaque catégorie Poly Haven relevée tombe dans exactement UNE commune', () => {
    ph.CATEGORIES.forEach(c => {
      const n = cats.CATEGORIES.filter(x => x.polyhaven.includes(c.slug)).length;
      assert.equal(n, 1, `${c.slug} : ${n} catégorie(s) commune(s)`);
    });
  });
  test('des slugs propres, et un nom dans chaque langue', () => {
    cats.CATEGORIES.forEach(c => { assert.match(c.slug, /^[a-z-]+$/); assert.ok(c.fr && c.en); });
    assert.equal(new Set(cats.CATEGORIES.map(c => c.slug)).size, cats.CATEGORIES.length);
  });
  test('l\'interface reçoit les communes, sans le détail des sources', () => {
    assert.deepEqual(Object.keys(cats.pourInterface()[0]).sort(), ['en', 'fr', 'slug']);
  });
});

describe('Chaque source parle la langue commune', () => {
  test('Sketchfab : la recherche traduit la commune, le résultat porte sa commune', () => {
    const u = new URL(sketchfab.urlRecherche(sources.rechercheNormalisee({ categorie: 'mobilier' })));
    assert.equal(u.searchParams.get('categories'), 'furniture-home');
    const fx = JSON.parse(readFileSync(new URL('./fixtures/sketchfab-recherche.json', import.meta.url), 'utf8'));
    const r = sketchfab.modeleNormalise(fx.results[0]);
    assert.equal(r.categorie, 'patrimoine');   // cultural-heritage-history, puis furniture-home
  });
  test('Poly Haven : une commune regroupe plusieurs catégories, et le résultat porte la sienne', () => {
    assert.deepEqual(cats.versPolyhaven('mobilier'), ['furniture', 'containers-storage', 'lighting', 'office-stationery']);
    const cat = JSON.parse(readFileSync(new URL('./fixtures/polyhaven-catalogue.json', import.meta.url), 'utf8'));
    const c = ph.catalogueNormalise(cat, Date.UTC(2026, 9, 6));
    assert.ok(c.every(e => e.r.categorie === 'mobilier'));
    const p = ph.pageLocale(c, sources.rechercheNormalisee({ categorie: 'mobilier' }), null);
    assert.equal(p.resultats.length, c.length);
    assert.equal(ph.pageLocale(c, sources.rechercheNormalisee({ categorie: 'animaux' }), null).resultats.length, 0);
  });
  test('la catégorie est notée dans l\'attribution d\'un modèle téléchargé', () => {
    const r = { source: 'polyhaven', id: 'x', nom: 'X', auteur: { nom: 'a' }, url: 'https://x', licence: sources.licence('cc0'), categorie: 'mobilier' };
    assert.equal(sources.entreeAttribution(r, 'x.glb').categorie, 'mobilier');
  });
});
