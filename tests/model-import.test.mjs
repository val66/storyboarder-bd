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
  setModelImportCallbacks, messageMaillagesEgares,
} from '../src/model-import.js';
import { setModelBridge } from '../src/model-store.js';
import { clearModelCache, _setModelCacheEntry } from '../src/model-cache.js';
import { setScenesCallbacks } from '../src/scenes.js';
import { getPanelPoints } from '../src/draw.js';
import { S } from '../src/state.js';
import { OBJECT_REAL_HEIGHT_M, PANEL_CAM_DEFAULT_DIST_3D } from '../src/constants.js';

let snapshots = 0;
let alertes = [];
// Les appels au GESTE FINAL de création — figer les coordonnées monde, puis s'assurer que
// l'Élément est dans le champ. Les trois chemins de création doivent le partager (cf. le bloc de
// tests dédié plus bas).
let visibilites = [];
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
let confirmations;
beforeEach(() => {
  snapshots = 0; alertes = []; confirmations = []; visibilites = [];
  clearModelCache(); setModelBridge(null);
  setModelImportCallbacks({
    snapshot: () => { snapshots++; },
    renderAll: () => {},
    alerter: (m) => alertes.push(m),
    confirmer: async (m) => { confirmations.push(m); return false; },
    finaliserCreation: (el, panel, page) => visibilites.push({ el, panel, page }),
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
// 2b. L'avertissement de taille — un fichier mesuré démesuré
// ─────────────────────────────────────────────────────────────────────────────

describe('choisirEtPreparerModele — hauteur mesurée > MODEL_HEIGHT_WARN_MAX_M', () => {
  test('sous le seuil, aucune confirmation n\'est demandée', async () => {
    pontQuiChoisit('table.glb');
    _setModelCacheEntry('table.glb', { scene: { traverse(){} }, hauteurM: 9.9 });
    const r = await choisirEtPreparerModele();
    assert.equal(confirmations.length, 0, 'une confirmation a été demandée sous le seuil');
    assert.equal(r.hauteurM, 9.9);
  });

  test('au-dessus du seuil, une confirmation est demandée', async () => {
    pontQuiChoisit('geant.glb');
    _setModelCacheEntry('geant.glb', { scene: { traverse(){} }, hauteurM: 175 });
    await choisirEtPreparerModele();
    assert.equal(confirmations.length, 1, 'aucune confirmation demandée pour un modèle démesuré');
    assert.match(confirmations[0], /175/, 'le message ne dit pas la hauteur mesurée');
  });

  test('RÉGRESSION : un refus garde la hauteur du fichier, inchangée', async () => {
    // Le comportement par défaut (pas de confirmateur câblé, ou utilisateur qui refuse) doit rester
    // celui déjà testé plus haut : la hauteur vient du fichier, jamais d'une valeur inventée.
    setModelImportCallbacks({
      snapshot: () => { snapshots++; }, renderAll: () => {}, alerter: (m) => alertes.push(m),
      confirmer: async () => false,
    });
    pontQuiChoisit('geant.glb');
    _setModelCacheEntry('geant.glb', { scene: { traverse(){} }, hauteurM: 175 });
    const r = await choisirEtPreparerModele();
    assert.equal(r.hauteurM, 175, 'un refus a quand même changé la hauteur');
  });

  test('une acceptation redimensionne à la hauteur neutre (OBJECT_REAL_HEIGHT_M.modele)', async () => {
    setModelImportCallbacks({
      snapshot: () => { snapshots++; }, renderAll: () => {}, alerter: (m) => alertes.push(m),
      confirmer: async () => true,
    });
    pontQuiChoisit('geant.glb');
    _setModelCacheEntry('geant.glb', { scene: { traverse(){} }, hauteurM: 175 });
    const r = await choisirEtPreparerModele();
    assert.equal(r.hauteurM, OBJECT_REAL_HEIGHT_M.modele, 'l\'acceptation n\'a pas redimensionné');
    assert.equal(r.redimensionné, true);
  });

  test('sans confirmateur câblé (ex. un appelant qui oublie), on ne redimensionne pas en silence', async () => {
    // Pas de setModelImportCallbacks ici : le défaut du module doit rester sûr.
    setModelImportCallbacks({});
    pontQuiChoisit('geant.glb');
    _setModelCacheEntry('geant.glb', { scene: { traverse(){} }, hauteurM: 175 });
    const r = await choisirEtPreparerModele();
    assert.equal(r.hauteurM, 175, 'un défaut non câblé a redimensionné sans demander');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2 ter. Les morceaux que le fichier place hors du corps
//
// Mesuré sur worker_j.glb : le fourreau du katana occupe y 91→131 quand le personnage entier tient
// dans y −0,3→41,8. Le CRITÈRE est testé dans tests/stray-meshes.test.mjs ; ce qui se joue ici est
// la DÉCISION D'EN PARLER — et surtout celle de se taire.
// ─────────────────────────────────────────────────────────────────────────────

describe('messageMaillagesEgares', () => {
  test('se tait quand rien n\'est égaré', () => {
    assert.equal(messageMaillagesEgares([]), null);
    assert.equal(messageMaillagesEgares(undefined), null);
    assert.equal(messageMaillagesEgares(null), null);
  });

  test('nomme le maillage et dit qu\'il est masqué', () => {
    const m = messageMaillagesEgares(['Sheath_1_Outfit_0']);
    assert.ok(m.includes('Sheath_1_Outfit_0'), `le nom du maillage manque : ${m}`);
    assert.ok(/hidden|masqu/i.test(m), `le message ne dit pas qu'ils sont masqués : ${m}`);
  });

  test('promet que le FICHIER n\'est pas modifié, et dit où revenir dessus — DANS LES DEUX LANGUES', () => {
    // Les deux inquiétudes légitimes de quelqu'un à qui on annonce qu'on lui cache un morceau de
    // son modèle. Sans ces deux phrases, l'avertissement inquiète plus qu'il n'informe.
    //
    // CHAQUE LANGUE EST VÉRIFIÉE SÉPARÉMENT, et c'est le fond du test : une première version
    // écrite en alternance (`/not modified|pas modifié/`) était satisfaite par la branche anglaise
    // seule. La campagne de mutation l'a montré — vider la phrase française ne la faisait pas
    // rougir. Deux textes, deux assertions.
    const langue = S.appLang;
    try {
      S.appLang = 'en';
      const en = messageMaillagesEgares(['fourreau']);
      assert.match(en, /not modified/, `EN : rien ne rassure sur le fichier — ${en}`);
      assert.match(en, /Show detached parts/, `EN : on ne dit pas comment les revoir — ${en}`);
      S.appLang = 'fr';
      const fr = messageMaillagesEgares(['fourreau']);
      assert.match(fr, /pas modifié/, `FR : rien ne rassure sur le fichier — ${fr}`);
      assert.match(fr, /Afficher les morceaux détachés/, `FR : on ne dit pas comment les revoir — ${fr}`);
    } finally { S.appLang = langue; }
  });

  test('abrège au-delà de trois noms, sans mentir sur le total', () => {
    // Noms qu'aucune phrase de l'avertissement ne peut contenir par accident.
    const m = messageMaillagesEgares(['Zx1', 'Zx2', 'Zx3', 'Zx4', 'Zx5']);
    assert.ok(m.includes('Zx1, Zx2, Zx3'), `les trois premiers manquent : ${m}`);
    assert.ok(!m.includes('Zx4'), `la liste n'a pas été abrégée : ${m}`);
    assert.ok(m.includes('5'), `le total réel manque : ${m}`);
  });

  test('un seul nom en trop se dit au singulier — EN FRANÇAIS', () => {
    // La langue est forcée, et c'est le fond du test : l'anglais dit « 1 more » comme « 2 more »,
    // donc un pluriel systématique y passerait inaperçu.
    const langue = S.appLang;
    try {
      S.appLang = 'fr';
      assert.ok(/1 autre[^s]/.test(messageMaillagesEgares(['a', 'b', 'c', 'd'])),
        'un seul nom en trop est annoncé au pluriel');
      assert.ok(/2 autres/.test(messageMaillagesEgares(['a', 'b', 'c', 'd', 'e'])),
        'deux noms en trop sont annoncés au singulier');
    } finally { S.appLang = langue; }
  });
});

describe('choisirEtPreparerModele — avertissement sur les morceaux détachés', () => {
  test('prévient, et n\'empêche pas l\'import', async () => {
    pontQuiChoisit('worker.glb');
    _setModelCacheEntry('worker.glb', {
      scene: { traverse(){} }, hauteurM: 1.8, egares: ['Sheath_1_Outfit_0'],
    });
    const r = await choisirEtPreparerModele();
    assert.equal(r.ok, true, 'un morceau détaché ne doit pas faire échouer l\'import');
    assert.equal(r.hauteurM, 1.8, 'la hauteur ne doit pas bouger');
    assert.equal(alertes.length, 1, `avertissements : ${JSON.stringify(alertes)}`);
    assert.ok(String(alertes[0]).includes('Sheath_1_Outfit_0'));
  });

  test('ne dit rien quand le fichier est sain', async () => {
    pontQuiChoisit('table.glb');
    _setModelCacheEntry('table.glb', { scene: { traverse(){} }, hauteurM: 0.74, egares: [] });
    await choisirEtPreparerModele();
    assert.deepEqual(alertes, []);
  });

  test('ne dit rien quand le décodage a échoué (rien à mesurer)', async () => {
    pontQuiChoisit('casse.glb');
    _setModelCacheEntry('casse.glb', 'introuvable');
    await choisirEtPreparerModele();
    assert.deepEqual(alertes, [], 'un fichier illisible a déclenché un avertissement de maillages');
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

  describe('recadrage caméra après un redimensionnement accepté', () => {
    test('un modèle démesuré, redimensionné, dans le canevas d\'une Scène : la caméra se réinitialise', async () => {
      setModelImportCallbacks({
        snapshot: () => { snapshots++; }, renderAll: () => {}, alerter: (m) => alertes.push(m),
        confirmer: async () => true,
      });
      // simule le canevas d'une Scène en édition (cf. isLockedScenePanel) : S.editingSceneId doit
      // pointer vers une Scène qui existe réellement, sinon currentVolume() le remet à null.
      S.scenes = [{ id: 'sc1', w: 480, h: 360, pages: [{ id: 'ps1', objects: [cible] }] }];
      S.editingSceneId = 'sc1';
      cible.camDist = 999; cible.camDistTarget = 999;
      cible.camPanX = 50; cible.camPanXTarget = 50;
      cible.camPanY = -30; cible.camPanYTarget = -30;
      pontQuiChoisit('geant.glb');
      _setModelCacheEntry('geant.glb', { scene: { traverse(){} }, hauteurM: 175 });
      await importModelIntoPanel(cible, { w: 480, h: 360 });
      assert.equal(cible.camDist, PANEL_CAM_DEFAULT_DIST_3D, 'le zoom laissé par un essai précédent masque le modèle recorrigé');
      assert.equal(cible.camPanX, 0);
      assert.equal(cible.camPanY, 0);
    });

    test('une taille normale ne touche pas à la caméra', async () => {
      S.scenes = [{ id: 'sc1', w: 480, h: 360, pages: [{ id: 'ps1', objects: [cible] }] }];
      S.editingSceneId = 'sc1';
      cible.camDist = 999; cible.camDistTarget = 999;
      pontQuiChoisit('table.glb');
      _setModelCacheEntry('table.glb', { scene: { traverse(){} }, hauteurM: 0.74 });
      await importModelIntoPanel(cible, { w: 480, h: 360 });
      assert.equal(cible.camDist, 999, 'la caméra a été touchée sans raison');
    });

    test('hors édition de Scène (Case normale), même redimensionné, la caméra n\'est pas touchée', async () => {
      setModelImportCallbacks({
        snapshot: () => { snapshots++; }, renderAll: () => {}, alerter: (m) => alertes.push(m),
        confirmer: async () => true,
      });
      S.editingSceneId = null;
      cible.camDist = 999;
      pontQuiChoisit('geant.glb');
      _setModelCacheEntry('geant.glb', { scene: { traverse(){} }, hauteurM: 175 });
      await importModelIntoPanel(cible, { w: 1240, h: 1754 });
      assert.equal(cible.camDist, 999, 'une Case normale n\'a pas de canevas de Scène à recadrer');
    });
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

// ─────────────────────────────────────────────────────────────────────────────
// 5. Le câblage — ce que les tests unitaires ne voient pas
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const HTML = readFileSync(join(RACINE, 'index.html'), 'utf8');
const EVENTS = readFileSync(join(RACINE, 'src/events.js'), 'utf8');
const MODALS = readFileSync(join(RACINE, 'src/modals.js'), 'utf8');
const SIDEBAR = readFileSync(join(RACINE, 'src/sidebar.js'), 'utf8');

describe('Le câblage de l\'import', () => {
  test('les trois points d\'entrée existent dans index.html', () => {
    ['ctxImportTrigger', 'ctxImportModel', 'ctxImportScene', 'ctxImportModelOnly', 'importSceneBtn']
      .forEach(id => assert.match(HTML, new RegExp(`id="${id}"`), `point d'entrée absent : ${id}`));
  });

  test('RÉGRESSION : les deux entrées d\'import s\'EXCLUENT', () => {
    // Dans une Case, le sous-menu Modèle/Scène ; sur un canevas de Scène, l'entrée directe. Les
    // afficher ensemble proposerait « comme Scène » à l'intérieur d'une Scène — une imbrication qui
    // n'a pas de sens et que rien n'implémente.
    const bloc = EVENTS.slice(EVENTS.indexOf('ctxImportTrigger\').style.display'));
    assert.match(bloc.slice(0, 300), /!isSceneCanvas/, 'le sous-menu s\'affiche aussi dans une Scène');
    assert.match(bloc.slice(0, 300), /ctxImportModelOnly'\)\.style\.display\s*=\s*\(_surCase && isSceneCanvas\)/,
      'l\'entrée directe ne se limite pas au canevas de Scène');
  });

  test('RÉGRESSION : la Case visée est lue AVANT de masquer le menu', () => {
    // hideContextMenu efface S.ctxTarget, et l'import est asynchrone : lire la cible après aurait
    // donné null au retour du sélecteur de fichiers, donc un import qui ne crée rien, en silence.
    const bloc = EVENTS.slice(EVENTS.indexOf("document.getElementById('ctxImportModel').onclick"));
    const corps = bloc.slice(0, bloc.indexOf('};'));
    assert.ok(corps.indexOf('_cibleDuMenu()') < corps.indexOf('hideContextMenu()'),
      'la cible est lue après hideContextMenu : elle sera perdue');
  });

  test('le bouton du menu de gauche n\'envoie AUCUNE Case', () => {
    // C'est ce qui distingue « créer un décor » de « charger un décor ici ». Un panel passé par
    // erreur écraserait le contenu d'une Case au hasard.
    assert.match(EVENTS, /importSceneBtn'\)\.onclick = \(\) => \{ importSceneFromModel\(null, null\); \}/);
  });

  test('la modale montre le fichier et masque le sélecteur de Type', () => {
    // On ne transforme pas une chaise en modèle importé : il n'y aurait aucun fichier à lui donner.
    assert.match(HTML, /id="objectModelFileField"/);
    assert.match(MODALS, /objectModelFileField/);
    assert.match(MODALS, /objectTypeSelect\.style\.display = _estModele \? 'none'/,
      'le sélecteur de Type reste proposé sur un modèle importé');
  });

  test('le panneau latéral dit l\'état d\'un modèle qui manque', () => {
    assert.match(SIDEBAR, /isImportedModel\(p\)/);
    assert.match(SIDEBAR, /file not found|fichier introuvable/,
      'un modèle introuvable ne se distingue pas dans la liste');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Le geste final : rendre visible dans sa Case
// ─────────────────────────────────────────────────────────────────────────────

describe('Un Élément importé est rendu VISIBLE dans sa Case', () => {
  // LE DÉFAUT GARDÉ ICI, et la façon dont il s'est manifesté. Un modèle importé dans une Case VIDE
  // apparaissait en dehors d'elle ; le même import dans une Case contenant déjà un Personnage
  // tombait bien centré. D'où l'impression d'un défaut dépendant de l'ORDRE DES GESTES — ce qui a
  // fait chercher longtemps du côté du placement, où tout était juste.
  //
  // La cause : `addPersonaToPanel` et `addObjectToPanel` finissent tous deux par le même geste —
  // figer les coordonnées monde, puis recentrer la caméra si l'Élément est hors champ. L'import,
  // troisième chemin de création, n'en faisait AUCUNE des deux moitiés. Une Case vide n'avait donc
  // jamais vu sa caméra recadrée ; dès qu'un Personnage y était passé, elle l'avait été pour lui,
  // et le modèle en profitait.
  //
  // LE SECOND SYMPTÔME, signalé après la première correction : un modèle bien centré à l'import
  // mais « un peu loin ». C'était l'autre moitié — les coordonnées monde non figées. La conversion
  // « position sur la page → position dans le monde » dépend de la CAMÉRA ; sans coordonnées
  // figées, elle est refaite à chaque rendu, avec la caméra qu'on vient justement de déplacer.
  // Deux symptômes, une seule omission, réparée en deux fois faute d'avoir nommé le geste.
  //
  // Trois chemins pour un même geste : c'est l'énumération tenue à la main, encore. Le geste porte
  // maintenant un NOM (`finaliserCreationDansCase3D`, events.js) et les trois chemins l'appellent —
  // un geste nommé se transmet, une paire de lignes recopiées se perd. Le test porte sur le CHEMIN
  // D'IMPORT, seul testable ici sans DOM 3D ; les deux autres sont dans events.js.

  test('RÉGRESSION : importer un modèle dans une Case appelle le geste final de création', async () => {
    pontQuiChoisit('table.glb');
    _setModelCacheEntry('table.glb', { scene: { traverse(){} }, hauteurM: 0.74 });
    const el = await importModelIntoPanel(cible, S.tomes[0].pages[0]);
    assert.ok(el, 'l\'Élément doit être créé');
    assert.equal(visibilites.length, 1, 'le geste final de création n\'a pas été appelé');
  });

  test('et il porte l\'Élément, sa Case et sa Planche — pas autre chose', async () => {
    // Sans ces trois arguments, la fonction ne peut ni aimanter au sol ni recentrer : un appel
    // « présent mais mal nourri » passerait le test précédent sans rien faire de plus qu'avant.
    pontQuiChoisit('table.glb');
    _setModelCacheEntry('table.glb', { scene: { traverse(){} }, hauteurM: 0.74 });
    const page = S.tomes[0].pages[0];
    const el = await importModelIntoPanel(cible, page);
    assert.equal(visibilites[0].el, el, 'l\'Élément passé n\'est pas celui qui vient d\'être créé');
    assert.equal(visibilites[0].panel, cible);
    assert.equal(visibilites[0].page, page);
  });

  test('un import annulé ne demande aucune mise en vue', async () => {
    setModelBridge({ pickModelFile: async () => ({ canceled: true }) });
    await importModelIntoPanel(cible, S.tomes[0].pages[0]);
    assert.deepEqual(visibilites, [], 'une annulation a déclenché un recentrage de caméra');
  });

  test('un défaut non câblé ne fait pas échouer l\'import', async () => {
    // Le module doit rester utilisable sans ce crochet — c'est la règle de tous les autres.
    setModelImportCallbacks({});
    pontQuiChoisit('table.glb');
    _setModelCacheEntry('table.glb', { scene: { traverse(){} }, hauteurM: 0.74 });
    await assert.doesNotReject(() => importModelIntoPanel(cible, S.tomes[0].pages[0]));
  });
});
