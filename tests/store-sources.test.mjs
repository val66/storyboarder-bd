/**
 * tests/store-sources.test.mjs, le contrat commun des sources du store et la source Sketchfab (#444a).
 *
 * La page de résultats de tests/fixtures/sketchfab-recherche.json est une VRAIE réponse de l'API,
 * relevée le 5 octobre 2026 (recherche « bench »), réduite à deux modèles et aux champs utiles.
 * Si Sketchfab change le format, c'est ce fichier qu'il faudra relever à nouveau.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import sources from '../store-sources.js';
import sketchfab from '../store-sketchfab.js';

const { LICENCES, SOURCES, TRIS, PAR_PAGE, licence, rechercheNormalisee, resultatValide, pageAffichable, ligneDeCredit } = sources;
const { CODES_PAR_LIBELLE, CATEGORIES, urlRecherche, urlDemandeTelechargement, vignette, modeleNormalise, pageNormalisee } = sketchfab;

const PAGE = JSON.parse(readFileSync(new URL('./fixtures/sketchfab-recherche.json', import.meta.url), 'utf8'));
const BANC = PAGE.results[0];

describe('les licences', () => {
  test('connues : les sept Creative Commons, avec ce qu\'elles permettent', () => {
    assert.deepEqual(Object.keys(LICENCES).sort(), ['by', 'by-nc', 'by-nc-nd', 'by-nc-sa', 'by-nd', 'by-sa', 'cc0']);
    assert.deepEqual(licence('cc0'), { code: 'cc0', ...LICENCES.cc0 });
    assert.equal(licence('cc0').attribution, false);
    assert.equal(licence('by-nc').commercial, false);
    assert.equal(licence('by-nd').modification, false);
    assert.equal(licence('by').commercial, true);
  });
  test('inconnue : lue au plus prudent, et son libellé gardé', () => {
    const l = licence(undefined, 'Free Standard');
    assert.deepEqual(l, { code: 'inconnue', libelle: 'Free Standard', url: null, attribution: true, commercial: false, modification: false });
    assert.equal(licence('st').libelle, 'Licence inconnue');
  });
  test('chaque libellé Sketchfab retrouve son code', () => {
    for (const [libelle, code] of Object.entries(CODES_PAR_LIBELLE)) {
      assert.ok(LICENCES[code], code);
      assert.equal(LICENCES[code].libelle, libelle);
    }
  });
});

describe('les paramètres de recherche', () => {
  test('nettoyés : texte coupé, tri par défaut selon qu\'on cherche ou qu\'on parcourt', () => {
    assert.deepEqual(rechercheNormalisee({ texte: '  banc  ' }),
      { texte: 'banc', categorie: null, licence: null, commercialSeulement: false, facesMax: null, tri: 'pertinence', curseur: null });
    assert.equal(rechercheNormalisee({}).tri, 'populaires');
    assert.equal(rechercheNormalisee({ texte: 'x'.repeat(500) }).texte.length, 200);
    assert.equal(rechercheNormalisee({ tri: 'recents' }).tri, 'recents');
  });
  test('ce qui ne se reconnaît pas est retiré, jamais transmis', () => {
    const r = rechercheNormalisee({ categorie: 'a&b=c', licence: 'st', tri: 'n-importe', facesMax: -4, curseur: '../x', commercialSeulement: 'oui', autre: 1 });
    assert.deepEqual(r, { texte: '', categorie: null, licence: null, commercialSeulement: false, facesMax: null, tri: 'populaires', curseur: null });
    assert.equal(rechercheNormalisee({ facesMax: 19999.6 }).facesMax, 20000);
    assert.equal(rechercheNormalisee({ facesMax: 0 }).facesMax, null);
    assert.equal(rechercheNormalisee({ curseur: '24' }).curseur, '24');
    assert.equal(rechercheNormalisee({ commercialSeulement: true }).commercialSeulement, true);
  });
  test('trois tris, communs à toutes les sources', () => {
    assert.deepEqual(TRIS, ['pertinence', 'populaires', 'recents']);
  });
});

describe('Sketchfab : l\'adresse de recherche', () => {
  const url = (p) => new URL(urlRecherche(rechercheNormalisee(p)));
  test('toujours : modèles téléchargeables, archives résumées, une page de PAR_PAGE', () => {
    const u = url({});
    assert.equal(u.origin + u.pathname, 'https://api.sketchfab.com/v3/search');
    assert.equal(u.searchParams.get('type'), 'models');
    assert.equal(u.searchParams.get('downloadable'), 'true');
    assert.equal(u.searchParams.get('archives_flavours'), 'false');
    assert.equal(u.searchParams.get('count'), String(PAR_PAGE));
    assert.equal(u.searchParams.get('sort_by'), '-likeCount');
  });
  test('chaque filtre trouve son paramètre', () => {
    const u = url({ texte: 'banc & chaise', categorie: 'furniture-home', licence: 'cc0', facesMax: 20000, tri: 'recents', curseur: '24' });
    assert.equal(u.searchParams.get('q'), 'banc & chaise');
    assert.equal(u.searchParams.get('categories'), 'furniture-home');
    assert.equal(u.searchParams.get('license'), 'cc0');
    assert.equal(u.searchParams.get('max_face_count'), '20000');
    assert.equal(u.searchParams.get('sort_by'), '-publishedAt');
    assert.equal(u.searchParams.get('cursor'), '24');
  });
  test('la pertinence n\'envoie pas de tri ; une catégorie inconnue de Sketchfab n\'est pas envoyée', () => {
    assert.equal(url({ texte: 'banc' }).searchParams.has('sort_by'), false);
    assert.equal(url({ categorie: 'jardin' }).searchParams.has('categories'), false);
  });
  test('les 18 catégories, nommées dans les deux langues', () => {
    assert.equal(CATEGORIES.length, 18);
    assert.ok(CATEGORIES.every(c => /^[a-z-]+$/.test(c.slug) && c.fr && c.en));
  });
  test('la demande de téléchargement : seulement pour un identifiant Sketchfab', () => {
    assert.equal(urlDemandeTelechargement(BANC.uid), `https://api.sketchfab.com/v3/models/${BANC.uid}/download`);
    assert.equal(urlDemandeTelechargement('../me'), null);
    assert.equal(urlDemandeTelechargement(undefined), null);
  });
});

describe('Sketchfab : les résultats', () => {
  test('une vraie réponse, traduite dans le format commun', () => {
    const r = modeleNormalise(BANC);
    assert.deepEqual(r, {
      source: 'sketchfab', id: BANC.uid, type: 'modele', nom: 'The Kungsåra Bench',
      auteur: { nom: 'Historiska', url: 'https://sketchfab.com/historiska' },
      url: BANC.viewerUrl,
      vignettes: { petite: BANC.thumbnails.images[3].url, grande: BANC.thumbnails.images[1].url },
      licence: { code: 'by', ...LICENCES.by },
      poids: 23795824,
      details: { faces: 49980, textures: 1, textureMax: 8192, anime: false },
      apercu3D: BANC.embedUrl,
    });
    assert.ok(resultatValide(r));
  });
  test('la page : résultats et curseur de la suite', () => {
    const p = pageNormalisee(PAGE);
    assert.equal(p.resultats.length, 2);
    assert.equal(p.suivant, '24');
    assert.deepEqual(pageNormalisee({ cursors: { next: null }, results: [] }), { resultats: [], suivant: null });
    assert.deepEqual(pageNormalisee(null), { resultats: [], suivant: null });
  });
  test('écartés : réservés aux adultes, non téléchargeables, sans identifiant', () => {
    assert.equal(modeleNormalise({ ...BANC, isAgeRestricted: true }), null);
    assert.equal(modeleNormalise({ ...BANC, isDownloadable: false }), null);
    assert.equal(modeleNormalise({ ...BANC, uid: '' }), null);
    assert.equal(modeleNormalise(null), null);
  });
  test('des champs manquants donnent des valeurs prudentes, pas une panne', () => {
    const r = modeleNormalise({ uid: BANC.uid, name: '  ', license: { label: 'Editorial' } });
    assert.equal(r.nom, 'Sans titre');
    assert.deepEqual(r.auteur, { nom: 'Auteur inconnu', url: null });
    assert.equal(r.url, `https://sketchfab.com/models/${BANC.uid}`);
    assert.deepEqual(r.vignettes, { petite: null, grande: null });
    assert.equal(r.licence.code, 'inconnue');
    assert.equal(r.licence.attribution, true);
    assert.equal(r.poids, null);
    assert.deepEqual(r.details, { faces: null, textures: null, textureMax: null, anime: false });
    assert.equal(r.apercu3D, null);
  });
  test('un poids nul ou absent ne s\'affiche pas comme « 0 octet »', () => {
    assert.equal(modeleNormalise({ ...BANC, archives: { glb: { size: 0 } } }).poids, null);
  });
  test('un modèle animé se signale', () => {
    assert.equal(modeleNormalise({ ...BANC, animationCount: 2 }).details.anime, true);
  });
  test('une adresse qui ne mène pas chez Sketchfab n\'est pas reprise', () => {
    const r = modeleNormalise({ ...BANC, viewerUrl: 'https://ailleurs.example/x', embedUrl: 'javascript:alert(1)' });
    assert.equal(r.url, `https://sketchfab.com/models/${BANC.uid}`);
    assert.equal(r.apercu3D, null);
  });
  test('la vignette : la plus petite assez large, sinon la plus grande', () => {
    const imgs = BANC.thumbnails.images;
    assert.equal(vignette(imgs, 256), imgs[3].url);
    assert.equal(vignette(imgs, 300), imgs[2].url);
    assert.equal(vignette(imgs, 5000), imgs[0].url);
    assert.equal(vignette([], 256), null);
    assert.equal(vignette([{ url: 'x' }], 256), null);
  });
});

describe('ce que l\'interface reçoit', () => {
  const page = pageNormalisee(PAGE);
  test('les résultats malformés sont écartés et comptés', () => {
    const p = pageAffichable({ resultats: [...page.resultats, { source: 'ailleurs' }, null], suivant: '24' }, rechercheNormalisee({}));
    assert.equal(p.resultats.length, 2);
    assert.equal(p.ecartes, 2);
    assert.equal(p.suivant, '24');
  });
  test('« usage commercial seulement » filtre ce que la source ne filtre pas', () => {
    const nc = { ...page.resultats[0], id: 'nc', licence: licence('by-nc') };
    const p = pageAffichable({ resultats: [...page.resultats, nc], suivant: null }, rechercheNormalisee({ commercialSeulement: true }));
    assert.deepEqual(p.resultats.map(r => r.id), page.resultats.map(r => r.id));
    assert.equal(pageAffichable({ resultats: [nc], suivant: null }, rechercheNormalisee({})).resultats.length, 1);
  });
  test('la forme attendue, champ par champ', () => {
    const ok = page.resultats[0];
    assert.ok(resultatValide(ok));
    for (const casse of [
      { ...ok, source: 'inconnue' }, { ...ok, id: '' }, { ...ok, type: 'son' }, { ...ok, nom: 3 },
      { ...ok, auteur: null }, { ...ok, url: 'http://x' }, { ...ok, licence: { code: 'by' } },
    ]) assert.equal(resultatValide(casse), false);
  });
  test('la ligne de crédit : titre, auteur, licence, source et lien', () => {
    const r = page.resultats[0];
    assert.equal(ligneDeCredit(r), `« The Kungsåra Bench » par Historiska, CC Attribution, Sketchfab (${r.url})`);
    assert.equal(ligneDeCredit(r, 'en'), `"The Kungsåra Bench" by Historiska, CC Attribution, Sketchfab (${r.url})`);
  });
  test('Sketchfab exige la connexion pour télécharger, pas pour chercher, et sa mention', () => {
    assert.deepEqual(SOURCES.sketchfab.connexion, { recherche: false, telechargement: true });
    assert.match(SOURCES.sketchfab.credit.fr, /Sketchfab/);
    assert.match(SOURCES.sketchfab.credit.en, /Sketchfab/);
  });
});
