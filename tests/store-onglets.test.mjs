/**
 * tests/store-onglets.test.mjs, les onglets des sources du store (#445), exécutés sur le stub DOM.
 *
 * Ce qui compte : changer d'onglet cherche dans la NOUVELLE source, chaque source garde ses filtres,
 * et une réponse en retard de l'ancienne source ne s'affiche jamais sous l'onglet de la nouvelle.
 */
import './helpers/dom-stub.mjs';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const { ouvrirStore, choisirSource, SOURCES_STORE } = await import('../src/store-ui.js');
const { S } = await import('../src/state.js');
S.appLang = 'fr';   // les libellés d'onglets sont traduits

const LICENCES_SKETCHFAB = [{ code: 'by', libelle: 'CC Attribution', commercial: true }, { code: 'by-nc', libelle: 'CC Attribution-NonCommercial', commercial: false }];
const infos = (id) => ({
  source: { id, nom: id === 'polyhaven' ? 'Poly Haven' : 'Sketchfab', site: 'https://x', credit: { fr: 'c', en: 'c' } },
  categories: [], tris: ['pertinence', 'populaires', 'recents'],
  licences: id === 'polyhaven' ? [{ code: 'cc0', libelle: 'CC0', commercial: true }] : LICENCES_SKETCHFAB,
});
const resultat = (source, id) => ({
  source, id, type: 'modele', nom: id, auteur: { nom: 'a' }, url: 'https://x', vignettes: {},
  licence: { code: 'cc0', libelle: 'CC0', commercial: true, attribution: false }, poids: null, details: {},
});

let demandes, attentes;
function pont(){
  demandes = []; attentes = [];
  window.storyboarderAPI = {
    storeInfos: async (id) => infos(id),
    storeTelecharges: async () => [],
    modelesInfos: async () => [{ nom: 'chaise.glb', taille: 1000, modifie: 1 }],
    // Chaque recherche attend qu'on la libère : c'est ce qui permet de faire arriver une réponse EN RETARD.
    storeChercher: (id) => new Promise(res => { demandes.push(id); attentes.push(() => res({ resultats: [resultat(id, id + '-1')], suivant: null })); }),
  };
}
// Le nom affiché sur chaque carte (le stub ne retient pas les attributs, donc pas `title`).
const grille = () => document.getElementById('storeGrille').children
  .map(c => ({ title: c.children.find(x => x.className === 'store-carte-nom').textContent }));
const onglets = () => document.getElementById('storeOnglets').children;
const attendre = () => new Promise(r => setTimeout(r, 0));

describe('Les onglets des sources', () => {
  test('« Mes modèles » d\'abord, actif à l\'ouverture, avec ses propres filtres et SANS requête', async () => {
    pont();
    await ouvrirStore();
    await attendre(); await attendre();
    assert.deepEqual(onglets().map(o => o.textContent), ['Mes modèles', 'Sketchfab', 'Poly Haven']);
    assert.ok(onglets()[0].className.includes('actif'));
    assert.deepEqual(demandes, [], 'la bibliothèque locale a interrogé une source en ligne');
    assert.equal(grille()[0].title, 'chaise');
    assert.equal(document.getElementById('storeUsage').hidden, false);
    assert.equal(document.getElementById('storeFaces').hidden, true);
    assert.equal(document.getElementById('storeLicence').hidden, true);
  });

  test('vers Sketchfab : ses filtres reviennent, le filtre d\'usage s\'en va', async () => {
    const p = choisirSource('sketchfab');
    await attendre();
    assert.equal(document.getElementById('storeLicence').hidden, false);
    assert.equal(document.getElementById('storeCommercialCase').hidden, false);
    assert.equal(document.getElementById('storeUsage').hidden, true);
    attentes.shift()();
    await p;
    assert.equal(grille()[0].title, 'sketchfab-1');
  });

  test('changer d\'onglet cherche dans la nouvelle source, et cache les filtres sans objet', async () => {
    const p = choisirSource('polyhaven');
    await attendre();
    assert.equal(demandes[demandes.length - 1], 'polyhaven');
    assert.ok(onglets()[2].className.includes('actif'));   // Mes modèles, Sketchfab, Poly Haven
    assert.equal(document.getElementById('storeLicence').hidden, true, 'une seule licence : pas de filtre');
    assert.equal(document.getElementById('storeCommercialCase').hidden, true, 'tout est commercial : pas de case');
    attentes.shift()();
    await p;
    assert.equal(grille()[0].title, 'polyhaven-1');
  });

  test('RÉGRESSION : une réponse EN RETARD de l\'ancienne source ne s\'affiche pas sous la nouvelle', async () => {
    const versSketchfab = choisirSource('sketchfab');
    await attendre();
    const reponseSketchfab = attentes.shift();
    const versPolyhaven = choisirSource('polyhaven');   // on change d'avis avant la réponse
    await attendre();
    attentes.shift()();                               // Poly Haven répond d'abord…
    await versPolyhaven;
    reponseSketchfab();                               // … puis Sketchfab, trop tard
    await versSketchfab;
    assert.deepEqual(grille().map(c => c.title), ['polyhaven-1']);
  });

  test('les sources annoncées sont celles que store.js connaît', () => {
    assert.deepEqual(SOURCES_STORE, ['local', 'sketchfab', 'polyhaven']);
  });
});
