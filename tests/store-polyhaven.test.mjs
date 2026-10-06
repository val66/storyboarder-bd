/**
 * tests/store-polyhaven.test.mjs, la source Poly Haven (#445) : adresses, normalisation, et la
 * pagination faite chez nous (l'API rend tout le catalogue d'un coup).
 *
 * Les fixtures sont de VRAIES réponses, relevées le 6 octobre 2026 : une partie de
 * /assets?type=models&category=furniture/seating, et /search?q=chair&type=models. Si Poly Haven
 * change de format, ce sont elles qu'il faut relever à nouveau.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ph = require('../store-polyhaven.js');
const sources = require('../store-sources.js');

const lire = (n) => JSON.parse(readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8'));
const CATALOGUE = lire('polyhaven-catalogue.json');
const RECHERCHE = lire('polyhaven-recherche.json');
const MAINTENANT = Date.UTC(2026, 9, 6);
const cat = () => ph.catalogueNormalise(CATALOGUE, MAINTENANT);
const recherche = (p) => sources.rechercheNormalisee(p);

describe('Poly Haven : adresses', () => {
  test('le catalogue des modèles, et une recherche en minuscules', () => {
    assert.equal(ph.urlCatalogue(), 'https://api.polyhaven.com/assets?type=models');
    assert.equal(ph.urlRecherche('  Chaise Bois '), 'https://api.polyhaven.com/search?q=chaise+bois&type=models');
  });
  test('un identifiant hors format n\'est jamais accepté', () => {
    assert.ok(ph.idValide('ArmChair_01'));
    assert.ok(!ph.idValide('../etc'));
    assert.ok(!ph.idValide(''));
  });
  test('slug de catégorie, comme Poly Haven', () => {
    assert.equal(ph.slugCategorie('Decor & Art'), 'decor-art');
    assert.equal(ph.slugCategorie('Furniture'), 'furniture');
    ph.CATEGORIES.forEach(c => assert.equal(ph.slugCategorie(c.en), c.slug, c.en));
  });
});

describe('Poly Haven : normalisation', () => {
  test('un modèle réel, dans le format commun', () => {
    const r = ph.modeleNormalise('ArmChair_01', CATALOGUE.ArmChair_01, MAINTENANT);
    assert.ok(sources.resultatValide(r));
    assert.equal(r.nom, 'Arm Chair 01');
    assert.equal(r.auteur.nom, 'Kirill Sannikov');
    assert.equal(r.url, 'https://polyhaven.com/a/ArmChair_01');
    assert.equal(r.licence.code, 'cc0');
    assert.equal(r.licence.attribution, false);
    assert.equal(r.details.faces, 5626);
    assert.deepEqual(r.details.dimensions, [0.848, 0.766, 1.065]);
    assert.match(r.vignettes.grande, /width=1024&height=1024/);
    assert.match(r.vignettes.petite, /width=256&height=256/);
    assert.equal(r.apercu3D, null);
  });
  test('un modèle en accès anticipé (publié dans le futur) est écarté', () => {
    const futur = { ...CATALOGUE.ArmChair_01, date_published: MAINTENANT / 1000 + 86400 };
    assert.equal(ph.modeleNormalise('ArmChair_01', futur, MAINTENANT), null);
  });
  test('une texture ou un HDRI glissé dans la réponse est écarté', () => {
    assert.equal(ph.modeleNormalise('x', { ...CATALOGUE.ArmChair_01, type: 1 }, MAINTENANT), null);
  });
  test('une vignette hors du CDN de Poly Haven n\'est pas reprise', () => {
    assert.equal(ph.vignetteDeTaille('https://ailleurs.example/x.png?width=256', 1024), null);
  });
  test('tout le catalogue enregistré passe la validation', () => {
    const c = cat();
    assert.equal(c.length, Object.keys(CATALOGUE).length);
    c.forEach(e => assert.ok(sources.resultatValide(e.r), e.r.id));
    assert.ok(c.every(e => e.categorie === 'furniture'));
  });
});

describe('Poly Haven : la page, faite chez nous', () => {
  test('sans texte : les plus téléchargés d\'abord', () => {
    const p = ph.pageLocale(cat(), recherche({}), null);
    assert.equal(p.resultats[0].id, 'sofa_02');   // 85 037 téléchargements, le plus haut
    assert.equal(p.suivant, null);
  });
  test('avec du texte, « Pertinence » suit le rang rendu par la recherche', () => {
    const ids = ph.idsRecherche(RECHERCHE);
    const p = ph.pageLocale(cat(), recherche({ texte: 'chair' }), ids);
    assert.deepEqual(p.resultats.map(r => r.id), ids);
  });
  test('avec du texte, « Récents » trie les trouvés par date', () => {
    const p = ph.pageLocale(cat(), recherche({ texte: 'chair', tri: 'recents' }), ph.idsRecherche(RECHERCHE));
    assert.equal(p.resultats[0].id, 'dining_chair_02');
  });
  test('filtres : catégorie, faces, licence', () => {
    assert.equal(ph.pageLocale(cat(), recherche({ categorie: 'nature' }), null).resultats.length, 0);
    const legers = ph.pageLocale(cat(), recherche({ facesMax: 5000 }), null).resultats;
    assert.ok(legers.length > 0 && legers.every(r => r.details.faces <= 5000));
    assert.equal(ph.pageLocale(cat(), recherche({ licence: 'by' }), null).resultats.length, 0, 'tout est en CC0');
  });
  test('pages de 24, et le curseur est un rang', () => {
    const grand = Array.from({ length: 30 }, (_, i) => ({ r: { id: 'm' + i, details: { faces: 1 } }, categorie: 'furniture', telechargements: 100 - i, date: 0 }));
    const p1 = ph.pageLocale(grand, recherche({}), null);
    assert.equal(p1.resultats.length, sources.PAR_PAGE);
    assert.equal(p1.suivant, '24');
    const p2 = ph.pageLocale(grand, recherche({ curseur: p1.suivant }), null);
    assert.deepEqual(p2.resultats.map(r => r.id), ['m24', 'm25', 'm26', 'm27', 'm28', 'm29']);
    assert.equal(p2.suivant, null);
  });
});
