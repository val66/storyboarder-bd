/**
 * tests/local-library.test.mjs, la bibliothèque « Mes modèles » : les entrées (fichier, titre,
 * catégorie, source, usages), le filtre et le tri. Fonctions pures, exécutées.
 */
import './helpers/dom-stub.mjs';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const { entreesLocales, filtrerEntrees, NON_CLASSE } = await import('../src/local-library.js');

const modele = (modelFile, homePanelId) => ({ id: 'e' + Math.random(), type: 'objet3d', objType: 'modele', modelFile, homePanelId });
const panel = (id, caseNumber) => ({ id, type: 'panel', caseNumber });
const projet = {
  scenes: [{ id: 's1', name: 'Salon de nuit', pages: [{ objects: [modele('canape.glb')] }] }],
  tomes: [{ name: 'Tome 1', pages: [{ objects: [panel('c1', 1), modele('chaise.glb', 'c1'), modele('disparu.glb', 'c1')] }] }],
};
const fichiers = [
  { nom: 'canape.glb', taille: 2000, modifie: 10 },
  { nom: 'chaise.glb', taille: 1000, modifie: 30 },
  { nom: 'Arm Chair 01.glb', taille: 800000, modifie: 20 },
];
const attributions = [{
  source: 'polyhaven', id: 'ArmChair_01', fichier: 'Arm Chair 01.glb', nom: 'Arm Chair 01', categorie: 'mobilier',
  auteur: { nom: 'Kirill Sannikov', url: null }, licence: { code: 'cc0', libelle: 'CC0', attribution: false }, resolution: '2k',
}];
const entrees = () => entreesLocales({ fichiers, attributions, projet });
const par = (liste, f) => liste.find(e => e.fichier === f);

describe('Les entrées', () => {
  test('un modèle du store garde son titre, sa catégorie et sa source ; un importé arrive en Non classé', () => {
    const e = entrees();
    const fauteuil = par(e, 'Arm Chair 01.glb');
    assert.equal(fauteuil.titre, 'Arm Chair 01');
    assert.equal(fauteuil.categorie, 'mobilier');
    assert.equal(fauteuil.attribution.source, 'polyhaven');
    const chaise = par(e, 'chaise.glb');
    assert.equal(chaise.titre, 'chaise');
    // Plus de devinette (retour de Valentin) : « chaise » ne suffit pas à dire Mobilier.
    assert.equal(chaise.categorie, NON_CLASSE);
    assert.equal('categorieDevinee' in chaise, false);
    assert.equal(par(e, 'disparu.glb').categorie, NON_CLASSE);
    assert.equal(chaise.attribution, null);
  });
  test('où il sert : par des Scènes, dans des Cases, ou nulle part', () => {
    const e = entrees();
    assert.deepEqual(par(e, 'canape.glb').scenes.map(s => s.sceneName), ['Salon de nuit']);
    assert.equal(par(e, 'chaise.glb').cases.length, 1);
    assert.equal(par(e, 'Arm Chair 01.glb').scenes.length + par(e, 'Arm Chair 01.glb').cases.length, 0);
  });
  test('un fichier CITÉ mais absent du disque apparaît, marqué introuvable', () => {
    const disparu = par(entrees(), 'disparu.glb');
    assert.ok(disparu, 'le fichier qu\'on cherche après une boîte orangée n\'est pas listé');
    assert.equal(disparu.introuvable, true);
    assert.equal(par(entrees(), 'chaise.glb').introuvable, false);
  });
  test('l\'attribution se retrouve même si la casse du nom a changé (Windows)', () => {
    const e = entreesLocales({ fichiers: [{ nom: 'arm chair 01.GLB' }], attributions, projet: {} });
    assert.equal(e[0].categorie, 'mobilier');
  });
});

describe('Le filtre et le tri', () => {
  test('le texte cherche dans le titre, le fichier, l\'auteur ET les Scènes, sans accents', () => {
    assert.deepEqual(filtrerEntrees(entrees(), { texte: 'nuit' }).map(e => e.fichier), ['canape.glb']);
    assert.deepEqual(filtrerEntrees(entrees(), { texte: 'sannikov' }).map(e => e.fichier), ['Arm Chair 01.glb']);
    assert.deepEqual(filtrerEntrees(entrees(), { texte: 'SALON NUIT' }).map(e => e.fichier), ['canape.glb']);
  });
  test('la catégorie, « Non classé » comprise', () => {
    assert.deepEqual(filtrerEntrees(entrees(), { categorie: NON_CLASSE }).map(e => e.fichier).sort(), ['canape.glb', 'chaise.glb', 'disparu.glb']);
    assert.deepEqual(filtrerEntrees(entrees(), { categorie: 'mobilier' }).map(e => e.fichier), ['Arm Chair 01.glb'], 'celui de la source, seul');
  });
  test('l\'usage : Scènes, Cases, non utilisés', () => {
    assert.deepEqual(filtrerEntrees(entrees(), { usage: 'scenes' }).map(e => e.fichier), ['canape.glb']);
    assert.deepEqual(filtrerEntrees(entrees(), { usage: 'cases' }).map(e => e.fichier).sort(), ['chaise.glb', 'disparu.glb']);
    assert.deepEqual(filtrerEntrees(entrees(), { usage: 'inutilises' }).map(e => e.fichier), ['Arm Chair 01.glb']);
  });
  test('tri par nom (sans la casse), ou les plus récents d\'abord, les absents à la fin', () => {
    assert.deepEqual(filtrerEntrees(entrees(), { tri: 'nom' }).map(e => e.titre), ['Arm Chair 01', 'canape', 'chaise', 'disparu']);
    assert.deepEqual(filtrerEntrees(entrees(), { tri: 'recents' }).map(e => e.fichier), ['chaise.glb', 'Arm Chair 01.glb', 'canape.glb', 'disparu.glb']);
  });
});

describe('Plus de catégorie devinée (retour de Valentin)', () => {
  test('ni le nom du fichier ni ses nœuds ne choisissent une catégorie : Non classé', () => {
    const e = entreesLocales({ fichiers: [{ nom: 'labrador_dog.glb' }, { nom: 'scene.glb' }], metas: { 'scene.glb': { noms: ['Tree_01', 'Leaves'], dimensions: [1, 2, 3] } } });
    assert.ok(e.every(x => x.categorie === NON_CLASSE));
    assert.deepEqual(e.find(x => x.fichier === 'scene.glb').dimensions, [1, 2, 3], 'les mesures du rendu, elles, servent toujours');
  });
  test('le module n\'exporte plus de devinette', async () => {
    const m = await import('../src/local-library.js');
    assert.equal(m.devinerCategorie, undefined);
  });
});
