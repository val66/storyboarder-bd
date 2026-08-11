/**
 * tests/model-import.test.mjs — les trois gestes d'import, et ce qu'ils créent.
 *
 * Ce qui se joue ici n'est pas le décodage — c'est l'ENCHAÎNEMENT : ranger le fichier, le décoder,
 * en tirer une taille, créer le bon objet au bon endroit. Chaque maillon a déjà ses tests ; celui-ci
 * garde la chaîne, et surtout ce qu'elle fait quand un maillon cède.
 *
 * DEUX PROPRIÉTÉS QUI NE SE VOIENT PAS À L'USAGE :
 *
 *   — la HAUTEUR vient du fichier. glTF impose le mètre : un modèle décodé connaît sa vraie taille,
 *     et l'Élément doit naître à cette taille. Un mètre par défaut serait un réglage à refaire à
 *     chaque import, sur une information qu'on avait déjà.
 *   — un fichier illisible ne fait PAS perdre le geste. L'Élément est créé quand même, en boîte de
 *     remplacement, et l'utilisateur est prévenu. Le contraire — annuler l'import — lui ferait
 *     refaire le choix de fichier sans lui dire ce qui a échoué.
 *
 * CE QU'ON N'AFFIRME PAS : que le sélecteur de fichiers s'ouvre, ni que GLTFLoader décode un vrai
 * `.glb`. Les deux passent par des couches simulées ici (pont Electron, cache).
 */
import './helpers/dom-stub.mjs';
import './helpers/render-stub.mjs';
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  nomLisible, choisirEtPreparerModele, importModelIntoPanel, importSceneFromModel,
  setModelImportCallbacks,
} from '../src/model-import.js';
import { setModelBridge } from '../src/model-store.js';
import { clearModelCache, _setModelCacheEntry } from '../src/model-cache.js';
import { setScenesCallbacks } from '../src/scenes.js';
import { getPanelPoints } from '../src/draw.js';
import { S } from '../src/state.js';

let snapshots = 0;
let alertes = [];
setScenesCallbacks({ snapshot: () => {} });

function caseCible(){
  const p = { id: 'c1', type: 'panel', x: 100, y: 50, w: 400, h: 300, shape: 'rect' };
  p.pts = getPanelPoints(p);
  return p;
}

/** Pont simulé : le sélecteur rend toujours le même fichier, et l'écriture réussit. */
function pontQuiChoisit(nom, octets = new Uint8Array([1, 2, 3])){
  const store = {};
  setModelBridge({
    pickModelFile: async () => ({ canceled: false, name: nom, data: octets }),
    listModelFiles: async () => Object.keys(store),
    readModelFile: async (n) => (store[n] ? { ok: true, data: store[n] } : { ok: false }),
    writeModelFile: async (n, d) => { store[n] = d; return { ok: true, name: n }; },
  });
  return store;
}

let cible;
beforeEach(() => {
  snapshots = 0; alertes = [];
  clearModelCache(); setModelBridge(null);
  setModelImportCallbacks({
    snapshot: () => { snapshots++; },
    renderAll: () => {},
    alerter: (m) => alertes.push(m),
  });
  cible = caseCible();
  S.editingSceneId = null; S.currentTomeIndex = 0; S.currentPageIndex = 0;
  S.tomes = [{ id: 't1', w: 1240, h: 1754, scale: 1, pages: [{ id: 'p1', objects: [cible] }] }];
  S.scenes = []; S.selectedId = null; S.projectDirty = false;
});

const objets = () => S.tomes[0].pages[0].objects;
const modelesDeLaPage = () => objets().filter(o => o.objType === 'modele');

// ─────────────────────────────────────────────────────────────────────────────
// 1. Le nom
// ─────────────────────────────────────────────────────────────────────────────

describe('nomLisible — reprendre le nom que l\'utilisateur a donné à son fichier', () => {
  test('l\'extension tombe, le reste est gardé tel quel', () => {
    assert.equal(nomLisible('salon.glb'), 'salon');
    assert.equal(nomLisible('Chaise Louis XV.glb'), 'Chaise Louis XV');
    assert.equal(nomLisible('decor.GLTF'), 'decor');
  });

  test('un nom vide donne quand même quelque chose d\'affichable', () => {
    // Un Élément sans nom serait une ligne vide dans le panneau latéral, impossible à désigner.
    ['', '   ', '.glb', null, undefined].forEach(v =>
      assert.equal(nomLisible(v), 'Modèle', `entrée : ${JSON.stringify(v)}`));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. La préparation — d'où vient la taille
// ─────────────────────────────────────────────────────────────────────────────

describe('choisirEtPreparerModele', () => {
  test('RÉGRESSION : la hauteur vient du FICHIER, pas d\'une valeur par défaut', async () => {
    // glTF impose le mètre. Le fichier connaît donc sa vraie taille, et s'en servir est la seule
    // raison pour laquelle on décode PENDANT l'import plutôt qu'après.
    pontQuiChoisit('table.glb');
    _setModelCacheEntry('table.glb', { scene: { traverse(){} }, hauteurM: 0.74 });
    const r = await choisirEtPreparerModele();
    assert.equal(r.hauteurM, 0.74, 'la hauteur naturelle du modèle a été perdue');
  });

  test('une annulation reste une annulation', async () => {
    setModelBridge({ pickModelFile: async () => ({ canceled: true }) });
    const r = await choisirEtPreparerModele();
    assert.equal(r.canceled, true);
    assert.equal(r.ok, undefined);
  });

  test('un fichier illisible est signalé, pas caché', async () => {
    pontQuiChoisit('casse.glb');
    _setModelCacheEntry('casse.glb', 'introuvable');
    const r = await choisirEtPreparerModele();
    assert.equal(r.ok, true, 'le fichier a bien été rangé');
    assert.equal(r.introuvable, true);
    assert.equal(r.hauteurM, undefined, 'aucune hauteur ne peut être inventée');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Import dans une Case
// ─────────────────────────────────────────────────────────────────────────────

describe('importModelIntoPanel', () => {
  test('crée un Élément dans la Case, à la taille du fichier', async () => {
    pontQuiChoisit('table.glb');
    _setModelCacheEntry('table.glb', { scene: { traverse(){} }, hauteurM: 0.74 });
    const el = await importModelIntoPanel(cible, { w: 1240, h: 1754 });
    assert.equal(modelesDeLaPage().length, 1);
    assert.equal(el.modelFile, 'table.glb');
    assert.equal(el.name, 'table');
    assert.equal(el.realHeightFloor, 0.74, 'l\'Élément n\'a pas la taille du modèle');
    assert.equal(el.homePanelId, 'c1');
    assert.equal(S.selectedId, el.id, 'l\'Élément créé doit être sélectionné');
  });

  test('pose un point d\'annulation, et marque le Projet modifié', async () => {
    pontQuiChoisit('x.glb');
    _setModelCacheEntry('x.glb', { scene: { traverse(){} }, hauteurM: 1 });
    await importModelIntoPanel(cible, { w: 1240, h: 1754 });
    assert.equal(snapshots, 1, 'un import doit pouvoir s\'annuler');
    assert.equal(S.projectDirty, true);
  });

  test('RÉGRESSION : une annulation ne touche à RIEN', async () => {
    setModelBridge({ pickModelFile: async () => ({ canceled: true }) });
    const avant = JSON.stringify(objets());
    const el = await importModelIntoPanel(cible, { w: 1240, h: 1754 });
    assert.equal(el, null);
    assert.equal(JSON.stringify(objets()), avant, 'la Page a changé sur une annulation');
    assert.equal(snapshots, 0, 'un point d\'annulation posé pour rien');
    assert.equal(S.projectDirty, false);
  });

  test('RÉGRESSION : un fichier illisible crée quand même l\'Élément, ET prévient', async () => {
    // Annuler l'import obligerait l'utilisateur à refaire le choix de fichier sans savoir ce qui a
    // échoué. L'Élément existe, en boîte de remplacement, et le message dit lequel pose problème.
    pontQuiChoisit('casse.glb');
    _setModelCacheEntry('casse.glb', 'introuvable');
    const el = await importModelIntoPanel(cible, { w: 1240, h: 1754 });
    assert.ok(el, 'le geste d\'import a été perdu');
    assert.equal(el.modelFile, 'casse.glb');
    assert.ok(el.realHeightFloor > 0, 'une hauteur utilisable doit rester, même par défaut');
    assert.equal(alertes.length, 1);
    assert.match(alertes[0], /casse\.glb/, 'le message ne dit pas quel fichier a échoué');
  });

  test('une écriture refusée prévient et ne crée rien', async () => {
    setModelBridge({
      pickModelFile: async () => ({ canceled: false, name: 'x.glb', data: new Uint8Array([1]) }),
      listModelFiles: async () => [],
      readModelFile: async () => ({ ok: false }),
      writeModelFile: async () => ({ ok: false, error: 'disque plein' }),
    });
    const el = await importModelIntoPanel(cible, { w: 1240, h: 1754 });
    assert.equal(el, null);
    assert.equal(modelesDeLaPage().length, 0);
    assert.match(alertes[0], /disque plein/);
    assert.equal(snapshots, 0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Import en Scène
// ─────────────────────────────────────────────────────────────────────────────

describe('importSceneFromModel', () => {
  test('crée une Scène nommée d\'après le fichier, contenant le modèle', async () => {
    pontQuiChoisit('salon.glb');
    _setModelCacheEntry('salon.glb', { scene: { traverse(){} }, hauteurM: 2.4 });
    const sc = await importSceneFromModel(null, null);
    assert.equal(S.scenes.length, 1);
    assert.equal(sc.name, 'salon', 'la Scène doit reprendre le nom du fichier');
    const dedans = sc.pages[0].objects.filter(o => o.objType === 'modele');
    assert.equal(dedans.length, 1);
    assert.equal(dedans[0].modelFile, 'salon.glb');
    assert.equal(dedans[0].realHeightFloor, 2.4);
  });

  test('RÉGRESSION : appelée depuis une Case, elle charge AUSSI la Scène dedans', async () => {
    // C'est le comportement attendu du clic droit : on a cliqué LÀ, on veut voir le décor LÀ. Sans
    // ce chargement, la Scène serait créée et l'utilisateur ne verrait rien changer.
    pontQuiChoisit('salon.glb');
    _setModelCacheEntry('salon.glb', { scene: { traverse(){} }, hauteurM: 2.4 });
    await importSceneFromModel(cible, { w: 1240, h: 1754 });
    assert.equal(modelesDeLaPage().length, 1, 'la Scène n\'a pas été chargée dans la Case');
    assert.equal(modelesDeLaPage()[0].homePanelId, 'c1');
  });

  test('… et depuis le menu de gauche, elle ne touche à aucune Case', async () => {
    // Le pendant : sans lui, le test précédent resterait vert avec une fonction qui charge toujours,
    // et créer un décor depuis le menu écraserait le contenu d'une Case au hasard.
    pontQuiChoisit('salon.glb');
    _setModelCacheEntry('salon.glb', { scene: { traverse(){} }, hauteurM: 2.4 });
    await importSceneFromModel(null, null);
    assert.equal(modelesDeLaPage().length, 0, 'une Case a été modifiée sans qu\'on le demande');
    assert.equal(S.scenes.length, 1);
  });

  test('une annulation ne crée pas de Scène fantôme', async () => {
    setModelBridge({ pickModelFile: async () => ({ canceled: true }) });
    const sc = await importSceneFromModel(null, null);
    assert.equal(sc, null);
    assert.deepEqual(S.scenes, [], 'une Scène vide est restée dans le Projet');
    assert.equal(snapshots, 0);
  });
});

/**
 * JOURNAL DE MUTATION — huit fautes, toutes rouges.
 *
 *   V1 la hauteur du fichier ignorée au profit du défaut                        ROUGE (6)
 *   V2 un échec d'écriture avalé au lieu d'être signalé                         ROUGE
 *   V3 la Scène n'est plus chargée dans la Case d'où vient le clic              ROUGE
 *   V4 la Scène est TOUJOURS chargée, même depuis le menu de gauche             ROUGE
 *   V5 le nom du fichier n'est plus repris par la Scène                         ROUGE
 *   V6 l'import ne pose plus de point d'annulation                              ROUGE
 *   V7 un fichier illisible n'est plus signalé                                  ROUGE
 *   V8 l'extension reste dans le nom affiché                                    ROUGE
 *
 * V3 ET V4 SONT LA PAIRE, et elle mérite d'être notée : « charger dans la Case » et « ne pas
 * toucher aux Cases » sont deux exigences opposées du MÊME code, selon d'où vient l'appel. Ne
 * garder que la première laisserait passer une version qui écrase une Case au hasard quand on crée
 * un décor depuis le menu de gauche. Une garantie ne se démontre que par sa paire.
 */
