/**
 * tests/local-library.test.mjs, la bibliothèque « Mes modèles » : les entrées (fichier, titre,
 * catégorie, source, usages), le filtre et le tri. Fonctions pures, exécutées.
 */
import './helpers/dom-stub.mjs';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const { entreesLocales, filtrerEntrees, devinerCategorie, NON_CLASSE } = await import('../src/local-library.js');

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
  test('un modèle du store garde son titre, sa catégorie et sa source ; un importé reçoit une catégorie DEVINÉE', () => {
    const e = entrees();
    const fauteuil = par(e, 'Arm Chair 01.glb');
    assert.equal(fauteuil.titre, 'Arm Chair 01');
    assert.equal(fauteuil.categorie, 'mobilier');
    assert.equal(fauteuil.attribution.source, 'polyhaven');
    const chaise = par(e, 'chaise.glb');
    assert.equal(chaise.titre, 'chaise');
    assert.equal(chaise.categorie, 'mobilier');
    assert.equal(chaise.categorieDevinee, true);
    assert.equal(fauteuil.categorieDevinee, false, 'la catégorie de la source n\'est pas une devinette');
    assert.equal(par(e, 'disparu.glb').categorie, NON_CLASSE, 'rien à deviner : Non classé');
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
    assert.deepEqual(filtrerEntrees(entrees(), { categorie: NON_CLASSE }).map(e => e.fichier), ['disparu.glb']);
    assert.deepEqual(filtrerEntrees(entrees(), { categorie: 'mobilier' }).length, 3, 'deux devinés (canapé, chaise) et un de la source');
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

describe('Deviner la catégorie d\'un modèle importé à la main', () => {
  test('les fichiers du dossier de développement', () => {
    const attendu = {
      '2022_porsche_macan_gts': 'vehicules', anime_girl1: 'personnages', bed_bug: 'animaux', centaur3: 'personnages',
      desert_dragon: 'personnages', labrador_dog: 'animaux', office_is_old_abandoned_free: 'lieux', worker_j: 'personnages', scene: null,   // worker_j : retour de Valentin
    };
    for (const [nom, cat] of Object.entries(attendu)) assert.equal(devinerCategorie([nom]), cat, nom);
  });
  test('un mot-clé court exige le mot EXACT : « carpet » n\'est pas une voiture, « character » pas un char', () => {
    assert.equal(devinerCategorie(['carpet']), null);
    assert.equal(devinerCategorie(['character']), 'personnages');
    assert.equal(devinerCategorie(['old car']), 'vehicules');
  });
  test('les noms de nœuds par défaut ne font rien deviner (Armature, Plane, Camera, Skeleton)', () => {
    assert.equal(devinerCategorie(['Armature', 'Plane', 'Camera', 'Skeleton', 'Cube.001']), null);
  });
  test('les majuscules internes coupent les mots : « OfficeChair » parle de chaise', () => {
    assert.ok(['mobilier', 'lieux'].includes(devinerCategorie(['OfficeChair'])));
  });
  test('sans indice dans le nom, les nœuds du fichier (mesurés au rendu) prennent le relais', () => {
    const e = entreesLocales({ fichiers: [{ nom: 'scene.glb' }], metas: { 'scene.glb': { noms: ['Tree_01', 'Leaves'], dimensions: [1, 2, 3] } } });
    assert.equal(e[0].categorie, 'nature');
    assert.deepEqual(e[0].dimensions, [1, 2, 3]);
  });
});
