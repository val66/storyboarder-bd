/**
 * tests/store-possedes.test.mjs, les modèles DÉJÀ TÉLÉCHARGÉS dans le store : la lecture du fichier
 * des attributions (store-sources.js, exécutée) et ce que la fenêtre en fait (store-ui.js, exécuté
 * sur le stub DOM : badge sur la carte, « Télécharger » désactivé avec le nom du fichier).
 */
import './helpers/dom-stub.mjs';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import sources from '../store-sources.js';

const { telechargesPresents, FICHIER_ATTRIBUTIONS } = sources;

const attributions = (...ressources) => ({ version: 1, ressources });
const entree = (id, fichier, source = 'sketchfab') => ({ source, id, fichier, nom: 'x' });

describe('telechargesPresents', () => {
  test('ne garde que les fichiers encore sur le disque', () => {
    const r = telechargesPresents(attributions(entree('a', 'banc.glb'), entree('b', 'parti.glb')), ['banc.glb']);
    assert.deepEqual(r, [{ source: 'sketchfab', id: 'a', fichier: 'banc.glb', resolution: null }]);
  });
  test('la casse du nom de fichier ne compte pas, comme sous Windows', () => {
    assert.equal(telechargesPresents(attributions(entree('a', 'Banc.GLB')), ['banc.glb']).length, 1);
  });
  test('une entrée mal formée est ignorée sans empêcher les autres', () => {
    const r = telechargesPresents(attributions(null, { id: 'z', fichier: 'banc.glb' }, entree('a', 'banc.glb')), ['banc.glb']);
    assert.deepEqual(r.map(e => e.id), ['a']);
  });
  test('un fichier absent ou illisible ne donne rien', () => {
    assert.deepEqual(telechargesPresents(null, ['banc.glb']), []);
    assert.deepEqual(telechargesPresents({}, ['banc.glb']), []);
  });
  test('le fichier vit à côté du dossier Modeles, pas dedans', () => {
    assert.equal(FICHIER_ATTRIBUTIONS, 'attributions-modeles.json');
    assert.ok(!FICHIER_ATTRIBUTIONS.includes('/'));
  });
});

const { rafraichirPossedes, fichierPossede } = await import('../src/store-ui.js');

describe('la fenêtre du store', () => {
  test('un modèle déjà téléchargé est reconnu par sa source ET son identifiant', async () => {
    window.storyboarderAPI = { storeTelecharges: async () => [{ source: 'sketchfab', id: 'abc', fichier: 'banc.glb' }] };
    await rafraichirPossedes();
    assert.equal(fichierPossede({ source: 'sketchfab', id: 'abc' }), 'banc.glb');
    assert.equal(fichierPossede({ source: 'sketchfab', id: 'autre' }), null);
    assert.equal(fichierPossede({ source: 'polyhaven', id: 'abc' }), null, 'même id, autre source : pas le même modèle');
  });
  test('la liste est RELUE : un modèle supprimé entre-temps n\'est plus marqué', async () => {
    window.storyboarderAPI = { storeTelecharges: async () => [{ source: 'sketchfab', id: 'abc', fichier: 'banc.glb' }] };
    await rafraichirPossedes();
    window.storyboarderAPI = { storeTelecharges: async () => [] };
    await rafraichirPossedes();
    assert.equal(fichierPossede({ source: 'sketchfab', id: 'abc' }), null);
  });
  test('sans pont, rien n\'est marqué et rien ne plante', async () => {
    window.storyboarderAPI = undefined;
    await rafraichirPossedes();
    assert.equal(fichierPossede({ source: 'sketchfab', id: 'abc' }), null);
  });
});
