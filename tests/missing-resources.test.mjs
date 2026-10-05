/**
 * tests/missing-resources.test.mjs, les ressources introuvables d'un Projet (#443).
 *
 * Les fonctions pures sont exécutées. Le câblage (appel après l'ouverture d'un Projet, relance après
 * un changement de dossier) est inspecté dans les sources, en visant l'ORDRE des appels.
 */
import './helpers/dom-stub.mjs';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  NOMS_MONTRES, objetsDuProjet, ressourcesManquantes, dossierDe, joindre, memeDossier, listeTronquee,
  contenuRessources, simulationRessources, manquantesSimulees,
} from '../src/missing-resources.js';
import { oublierModelesIntrouvables, modelState, _setModelCacheEntry } from '../src/model-cache.js';
import { oublierImagesIntrouvables, imageState, _setImageCacheEntry } from '../src/image-cache.js';
import { CHAMP_IMAGE_CASE } from '../src/image-store.js';

const lire = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const fr = (en, frTxt) => frTxt;
const en = (enTxt) => enTxt;

const modele = (f) => ({ type: 'objet3d', objType: 'modele', modelFile: f });
const caseImage = (f) => ({ type: 'panel', [CHAMP_IMAGE_CASE]: f });

describe('ce que le Projet cite', () => {
  test('toutes les Planches de tous les Tomes, et toutes les pages des Scènes', () => {
    const o = objetsDuProjet({
      tomes: [{ pages: [{ objects: [1, 2] }, { objects: [3] }] }, { pages: [] }, {}],
      scenes: [{ pages: [{ objects: [4] }, {}] }],
    });
    assert.deepEqual(o, [1, 2, 3, 4]);
    assert.deepEqual(objetsDuProjet(), []);
  });
  test('manquants = cités moins présents, sans doublon, triés', () => {
    const objets = [modele('b.glb'), modele('a.glb'), modele('b.glb'), modele('ok.glb')];
    const r = ressourcesManquantes({ objets, modelesPresents: ['ok.glb'], imagesPresentes: [] });
    assert.deepEqual(r.modeles, ['a.glb', 'b.glb']);
    assert.deepEqual(r.images, []);
    assert.deepEqual(ressourcesManquantes({ objets, modelesPresents: ['a.glb', 'b.glb', 'ok.glb'] }).modeles, []);
  });
  test('les images de Case aussi', () => {
    const objets = [caseImage('x.png'), caseImage('ok.png'), caseImage('x.png'), { type: 'panel' }];
    const r = ressourcesManquantes({ objets, modelesPresents: [], imagesPresentes: ['ok.png'] });
    assert.deepEqual(r.images, ['x.png']);
    assert.deepEqual(r.modeles, []);
  });
});

describe('chemins', () => {
  test('le dossier d\'un fichier, quel que soit le séparateur', () => {
    assert.equal(dossierDe('C:\\Projets\\BD\\a.json'), 'C:\\Projets\\BD');
    assert.equal(dossierDe('/home/v/a.json'), '/home/v');
    assert.equal(dossierDe('a.json'), null);
    assert.equal(dossierDe(null), null);
  });
  test('joindre garde le séparateur du dossier', () => {
    assert.equal(joindre('C:\\Projets\\', 'Modeles'), 'C:\\Projets\\Modeles');
    assert.equal(joindre('/home/v/Projets', 'Images'), '/home/v/Projets/Images');
  });
  test('même dossier : sans casse ni séparateur final, comme Windows', () => {
    assert.ok(memeDossier('C:\\Projets\\', 'c:/projets'));
    assert.ok(!memeDossier('C:\\Projets', 'C:\\Projets\\BD'));
    assert.ok(!memeDossier(null, 'C:\\Projets'));
  });
  test('une longue liste se tronque, et le dit', () => {
    const noms = Array.from({ length: NOMS_MONTRES + 3 }, (_, i) => `f${i}`);
    const l = listeTronquee(noms, fr);
    assert.equal(l.length, NOMS_MONTRES + 1);
    assert.equal(l.at(-1), 'et 3 autre(s)');
    assert.deepEqual(listeTronquee(['a'], fr), ['a']);
    assert.deepEqual(listeTronquee(noms.slice(0, NOMS_MONTRES), fr).length, NOMS_MONTRES);
  });
});

describe('le contenu de la modale', () => {
  const manquantes = { modeles: ['a.glb', 'b.glb'], images: ['x.png'] };
  test('combien, où l\'on a cherché, et comment corriger', () => {
    const c = contenuRessources({ manquantes, dossierProjets: 'C:\\Programmes\\Storyboard BD\\Projets', cheminProjet: null, t: fr });
    assert.equal(c.titre, 'Ressources introuvables');
    assert.match(c.intro, /2 modèle\(s\) 3D et 1 image\(s\)/);
    assert.deepEqual(c.cherche, [
      { libelle: 'Modèles', chemin: 'C:\\Programmes\\Storyboard BD\\Projets\\Modeles' },
      { libelle: 'Images', chemin: 'C:\\Programmes\\Storyboard BD\\Projets\\Images' },
    ]);
    assert.deepEqual(c.manquants.map(m => m.noms), [['a.glb', 'b.glb'], ['x.png']]);
    assert.equal(c.correctifs.length, 2);
    assert.match(c.correctifs[0], /Configuration.*Choisir/);
    assert.equal(c.indice, null);
  });
  test('une seule catégorie manquante : on ne parle que d\'elle', () => {
    const c = contenuRessources({ manquantes: { modeles: [], images: ['x.png'] }, dossierProjets: '/p', cheminProjet: null, t: fr });
    assert.deepEqual(c.cherche.map(x => x.libelle), ['Images']);
    assert.ok(!/modèle/.test(c.intro));
  });
  test('l\'indice quand le Projet est ailleurs que dans le dossier des Projets', () => {
    const c = contenuRessources({ manquantes, dossierProjets: 'C:\\Programmes\\Projets', cheminProjet: 'C:\\WebProjects\\Storyboarder\\Projets\\Cimetiere.json', t: fr });
    assert.match(c.indice, /C:\\WebProjects\\Storyboarder\\Projets/);
    const meme = contenuRessources({ manquantes, dossierProjets: 'C:\\WebProjects\\Storyboarder\\Projets', cheminProjet: 'C:\\WebProjects\\Storyboarder\\Projets\\Cimetiere.json', t: fr });
    assert.equal(meme.indice, null);
  });
  test('en anglais aussi', () => {
    const c = contenuRessources({ manquantes, dossierProjets: '/p', cheminProjet: '/q/a.json', t: en });
    assert.equal(c.titre, 'Missing resources');
    assert.match(c.intro, /2 3D model\(s\) and 1 image\(s\)/);
    assert.match(c.indice, /\/q/);
  });
});

describe('la simulation', () => {
  test('déclenchée par ?simulerRessources, et seulement par lui', () => {
    assert.ok(simulationRessources('?simulerRessources=1'));
    assert.ok(!simulationRessources(''));
    assert.ok(!simulationRessources('?autre=1'));
    assert.ok(!simulationRessources(undefined));
  });
  test('des manques qui montrent la liste tronquée', () => {
    const m = manquantesSimulees();
    assert.equal(m.modeles.length, 3);
    assert.ok(m.images.length > NOMS_MONTRES);
  });
  test('main.js ne la transmet qu\'en développement', () => {
    const main = lire('main.js');
    assert.match(main, /const simulerRessources = !app\.isPackaged && process\.env\.STORYBOARD_SIMULER_RESSOURCES;/);
    assert.match(main, /simulerRessources \? \{ query: \{ simulerRessources: '1' \} \} : undefined/);
  });
});

describe('oublier les introuvables', () => {
  test('modèles : seuls les introuvables redeviennent « absents »', () => {
    _setModelCacheEntry('perdu.glb', 'introuvable');
    _setModelCacheEntry('charge.glb', { scene: {}, hauteurM: 1 });
    assert.equal(oublierModelesIntrouvables(), 1);
    assert.equal(modelState('perdu.glb'), 'absent');
    assert.notEqual(modelState('charge.glb'), 'absent');
  });
  test('images : idem', () => {
    _setImageCacheEntry('perdue.png', 'introuvable');
    _setImageCacheEntry('en-cours.png', 'chargement');
    assert.equal(oublierImagesIntrouvables(), 1);
    assert.equal(imageState('perdue.png'), 'absent');
    assert.equal(imageState('en-cours.png'), 'chargement');
  });
});

describe('le câblage', () => {
  const sans = (s) => s.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
  const IO = sans(lire('src/io.js'));
  const EV = sans(lire('src/events.js'));
  test('à l\'ouverture d\'un Projet, APRÈS le repointage des modèles renommés', () => {
    const o = IO.slice(IO.indexOf('export async function loadExistingProjectFlow'));
    assert.ok(o.indexOf('await proposerRepointageModeles()') < o.indexOf('verifierRessources()'));
    const d = EV.slice(EV.indexOf('async function initStartupProject'));
    assert.ok(d.indexOf('await proposerRepointageModeles()') < d.indexOf('verifierRessources()'));
    assert.ok(d.indexOf('verifierRessources()') < d.indexOf('startDefaultProject()'));
  });
  test('après un changement de dossier, par « Choisir » comme par « Dossier par défaut »', () => {
    for (const id of ['projectsDirBrowse', 'projectsDirReset']) {
      const h = EV.slice(EV.indexOf(`getElementById('${id}').onclick`));
      const fin = h.indexOf('};');
      assert.ok(h.indexOf("setSetting('projectsDir'") < h.indexOf('rafraichirApresChangementDeDossier(prechargerEnCascade3D)'), id);
      assert.ok(h.indexOf('rafraichirApresChangementDeDossier') < fin, id);
    }
  });
});
