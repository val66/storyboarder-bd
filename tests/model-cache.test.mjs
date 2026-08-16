/**
 * tests/model-cache.test.mjs — le décalage entre un chargeur asynchrone et un rendu synchrone.
 *
 * C'est l'endroit du projet où l'architecture pouvait résister. `GLTFLoader` est asynchrone ;
 * `renderPanelSceneUncached3D` construit ses rigs en ligne, sans jamais rendre la main. Aucun `await`
 * n'est plaçable dans ce chemin sans réécrire le moteur de rendu.
 *
 * La sortie tient en une phrase : DÉCALER le décodage avant le dessin. Ce fichier garde les quatre
 * propriétés qui font tenir ce montage, et dont trois ne se voient pas à l'usage.
 *
 *   1. La lecture depuis le rendu est SYNCHRONE et sans effet de bord.
 *   2. Un décodage en cours n'est jamais relancé — sinon N images relancent N décodages.
 *   3. Un fichier introuvable est un ÉTAT, pas une erreur qu'on réessaie à chaque image.
 *   4. L'état du cache entre dans la signature de rendu, sans quoi un modèle arrivé ne s'affiche pas.
 *
 * CE QU'ON N'AFFIRME PAS : que GLTFLoader décode un vrai `.glb`. Il lui faut un contexte WebGL pour
 * construire les textures, hors de portée sous Node. Ce contrôle-là se fait à la main (étape 7).
 */
import './helpers/dom-stub.mjs';
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  collectModelFiles, modelState, getLoadedModel, modelCacheSignature,
  preloadModels, clearModelCache, setModelCacheCallbacks, _setModelCacheEntry,
  _applyAnisotropyForTests,
} from '../src/model-cache.js';
import { setModelBridge } from '../src/model-store.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(join(RACINE, f), 'utf8');

const modele = (id, modelFile) => ({ id, type: 'objet3d', objType: 'modele', modelFile });

beforeEach(() => { clearModelCache(); setModelCacheCallbacks({}); setModelBridge(null); });

// ─────────────────────────────────────────────────────────────────────────────
// 1. Ce que le Projet réclame
// ─────────────────────────────────────────────────────────────────────────────

describe('collectModelFiles — les fichiers à décoder, sans doublon', () => {
  test('dix Éléments du même modèle ne demandent qu\'un décodage', () => {
    // La propriété qui rend le montage viable. Un décor peuplé de vingt chaises identiques doit
    // décoder un fichier, pas vingt — et les vingt instances partageront ensuite les mêmes tampons.
    const objets = Array.from({ length: 10 }, (_, i) => modele(`e${i}`, 'chaise.glb'));
    assert.deepEqual(collectModelFiles(objets), ['chaise.glb']);
  });

  test('seuls les modèles importés comptent', () => {
    const objets = [
      modele('e1', 'chaise.glb'),
      { id: 'e2', type: 'objet3d', objType: 'table' },
      { id: 'e3', type: 'perso' },
      { id: 'e4', type: 'objet3d', objType: 'modele' },          // sans fichier
      { id: 'e5', type: 'objet3d', objType: 'modele', modelFile: '' },
    ];
    assert.deepEqual(collectModelFiles(objets), ['chaise.glb']);
  });

  test('une liste absente ou vide ne lève pas', () => {
    [null, undefined, []].forEach(v => assert.deepEqual(collectModelFiles(v), []));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Les quatre états, et ce qu'ils empêchent
// ─────────────────────────────────────────────────────────────────────────────

describe('Les états du cache', () => {
  test('un modèle jamais demandé est « absent », pas « introuvable »', () => {
    // La distinction porte tout le reste : « absent » déclenche un chargement, « introuvable »
    // l'interdit. Les confondre donnerait soit un modèle qui ne charge jamais, soit une lecture
    // disque relancée à chaque image.
    assert.equal(modelState('jamais-vu.glb'), 'absent');
  });

  test('getLoadedModel est synchrone et ne rend rien tant que ce n\'est pas prêt', () => {
    // Appelé depuis le constructeur de rig, donc depuis le chemin de dessin. Il doit répondre
    // immédiatement, et null veut dire « boîte de remplacement ».
    _setModelCacheEntry('x.glb', 'chargement');
    assert.equal(getLoadedModel('x.glb'), null);
    _setModelCacheEntry('y.glb', 'introuvable');
    assert.equal(getLoadedModel('y.glb'), null);
    _setModelCacheEntry('z.glb', { scene: { nom: 'faux' }, hauteurM: 2 });
    assert.deepEqual(getLoadedModel('z.glb'), { scene: { nom: 'faux' }, hauteurM: 2 });
  });

  test('RÉGRESSION : un décodage en cours n\'est jamais relancé', async () => {
    // Sans ce filtre, chaque appel de préchargement relancerait la lecture des fichiers déjà en
    // cours — et le préchargement est appelé à chaque ouverture de Projet.
    let lectures = 0;
    setModelBridge({ readModelFile: async () => { lectures++; return { ok: false }; } });
    _setModelCacheEntry('encours.glb', 'chargement');
    await preloadModels(['encours.glb']);
    assert.equal(lectures, 0, 'un fichier déjà en cours de chargement a été relu');
  });

  test('RÉGRESSION : un fichier introuvable n\'est pas réessayé', async () => {
    // L'état « introuvable » existe pour ça. Sans lui, un modèle supprimé du disque provoquerait
    // une lecture ratée par image — soixante par seconde, indéfiniment.
    let lectures = 0;
    setModelBridge({ readModelFile: async () => { lectures++; return { ok: false }; } });
    await preloadModels(['perdu.glb']);
    assert.equal(modelState('perdu.glb'), 'introuvable');
    assert.equal(lectures, 1);
    await preloadModels(['perdu.glb']);
    assert.equal(lectures, 1, 'un fichier introuvable a été relu');
  });

  test('un fichier vide compte comme introuvable, sans passer par le décodeur', async () => {
    setModelBridge({ readModelFile: async () => ({ ok: true, data: new Uint8Array() }) });
    await preloadModels(['vide.glb']);
    assert.equal(modelState('vide.glb'), 'introuvable');
  });

  test('un fichier illisible ne fait pas échouer le chargement du Projet', async () => {
    // Un Projet dont UN modèle manque doit s'ouvrir entièrement. preloadModels ne rejette jamais.
    setModelBridge({ readModelFile: async () => { throw new Error('disque en carafe'); } });
    await assert.doesNotReject(() => preloadModels(['a.glb', 'b.glb']));
    assert.equal(modelState('a.glb'), 'introuvable');
    assert.equal(modelState('b.glb'), 'introuvable');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. La signature — le piège de cette étape
// ─────────────────────────────────────────────────────────────────────────────

describe('modelCacheSignature — sans elle, un modèle chargé ne s\'affiche jamais', () => {
  test('RÉGRESSION : la signature CHANGE quand un modèle passe de chargement à prêt', () => {
    // LE piège de l'étape 4. La signature de Case est calculée à partir des Éléments — or un Élément
    // ne change pas quand son modèle finit d'arriver. Sans cette part, la Case resterait en cache
    // avec sa boîte de remplacement, et le modèle n'apparaîtrait qu'au prochain déplacement.
    _setModelCacheEntry('a.glb', 'chargement');
    const avant = modelCacheSignature(['a.glb']);
    _setModelCacheEntry('a.glb', { scene: {}, hauteurM: 1 });
    assert.notEqual(modelCacheSignature(['a.glb']), avant,
      'la signature ne bouge pas : la Case gardera sa boîte de remplacement');
  });

  test('… et ne change PAS quand rien ne bouge', () => {
    // Le pendant : une signature qui change à chaque appel invaliderait le cache en permanence et
    // relancerait un rendu 3D complet à chaque image.
    _setModelCacheEntry('a.glb', { scene: {}, hauteurM: 1 });
    assert.equal(modelCacheSignature(['a.glb']), modelCacheSignature(['a.glb']));
  });

  test('deux fichiers d\'états différents ne donnent pas la même signature', () => {
    _setModelCacheEntry('a.glb', 'introuvable');
    _setModelCacheEntry('b.glb', { scene: {}, hauteurM: 1 });
    assert.notEqual(modelCacheSignature(['a.glb']), modelCacheSignature(['b.glb']));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. La libération
// ─────────────────────────────────────────────────────────────────────────────

describe('clearModelCache — la mémoire de la carte graphique', () => {
  test('RÉGRESSION : géométries, matériaux ET textures sont libérés', () => {
    // Les textures sont portées par le matériau et ne se libèrent PAS avec lui. Les oublier laisse
    // la mémoire monter à chaque ouverture de Projet, sans rien de visible avant l'effondrement.
    const libérés = [];
    const faireTexture = (nom) => ({ dispose: () => libérés.push(nom) });
    const maille = {
      isMesh: true,
      geometry: { dispose: () => libérés.push('geometrie') },
      material: {
        map: faireTexture('map'), normalMap: faireTexture('normalMap'),
        dispose: () => libérés.push('materiau'),
      },
    };
    _setModelCacheEntry('a.glb', { scene: { traverse: (f) => f(maille) }, hauteurM: 1 });
    clearModelCache();
    ['geometrie', 'materiau', 'map', 'normalMap'].forEach(x =>
      assert.ok(libérés.includes(x), `non libéré : ${x}`));
    assert.equal(modelState('a.glb'), 'absent', 'le cache doit être vidé');
  });

  test('une entrée en cours de chargement ne fait pas planter la libération', () => {
    _setModelCacheEntry('a.glb', 'chargement');
    _setModelCacheEntry('b.glb', 'introuvable');
    assert.doesNotThrow(clearModelCache);
  });

  test('un matériau en tableau est libéré aussi', () => {
    // Un modèle multi-matériaux porte un tableau. Ne traiter que le cas simple laisserait fuir la
    // majorité des modèles réels, qui en ont plusieurs.
    const libérés = [];
    const maille = { isMesh: true, geometry: { dispose(){} },
      material: [{ dispose: () => libérés.push('m1') }, { dispose: () => libérés.push('m2') }] };
    _setModelCacheEntry('a.glb', { scene: { traverse: (f) => f(maille) }, hauteurM: 1 });
    clearModelCache();
    assert.deepEqual(libérés, ['m1', 'm2']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4bis. L'anisotropie — le moiré au dézoom sur un modèle importé
// ─────────────────────────────────────────────────────────────────────────────

describe('applyAnisotropy — le scintillement des textures au dézoom', () => {
  // RETOUR UTILISATEUR : « quand je dezoom la Scène, les Modèles importés ont leur textures qui
  // bug un peu [...] quand je les regarde de près [...] je n'ai pas le soucis. » — signature exacte
  // d'un moiré de minification (cf. l'en-tête d'applyAnisotropy, model-cache.js) : GLTFLoader ne
  // règle jamais l'anisotropie d'une texture, qui reste à 1 (son défaut Three.js).
  const texture = () => ({});
  const mailleAvecTextures = () => ({
    isMesh: true,
    material: { map: texture(), normalMap: texture(), roughnessMap: null },
  });

  test('les textures reçoivent le niveau d\'anisotropie fourni par le renderer', () => {
    setModelCacheCallbacks({ getMaxAnisotropy: () => 8 });
    const maille = mailleAvecTextures();
    _applyAnisotropyForTests({ traverse: (f) => f(maille) });
    assert.equal(maille.material.map.anisotropy, 8);
    assert.equal(maille.material.normalMap.anisotropy, 8);
  });

  test('un matériau en tableau (modèle multi-matériaux) est traité aussi', () => {
    setModelCacheCallbacks({ getMaxAnisotropy: () => 16 });
    const maille = { isMesh: true, material: [{ map: texture() }, { map: texture() }] };
    _applyAnisotropyForTests({ traverse: (f) => f(maille) });
    assert.equal(maille.material[0].map.anisotropy, 16);
    assert.equal(maille.material[1].map.anisotropy, 16);
  });

  test('RÉGRESSION : sans callback injecté (niveau 1 par défaut), rien n\'est touché', () => {
    // Pas de renderer câblé (ex. environnement de test) : le défaut Three.js (1) ne doit rien
    // écrire — sinon un aller-retour GPU inutile à chaque modèle décodé, pour rien.
    setModelCacheCallbacks({});
    const maille = mailleAvecTextures();
    _applyAnisotropyForTests({ traverse: (f) => f(maille) });
    assert.equal(maille.material.map.anisotropy, undefined);
  });

  test('un maillage sans matériau, ou une texture absente, ne fait pas lever', () => {
    setModelCacheCallbacks({ getMaxAnisotropy: () => 8 });
    assert.doesNotThrow(() => _applyAnisotropyForTests({
      traverse: (f) => { f({ isMesh: true, material: null }); f({ isMesh: false }); },
    }));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Le câblage — ce que les tests unitaires ne peuvent pas voir
// ─────────────────────────────────────────────────────────────────────────────

describe('Le câblage du décalage', () => {
  const SCENE3D = lire('src/scene3d.js');
  const RIG3D = lire('src/rig3d.js');
  const IO = lire('src/io.js');
  const EVENTS = lire('src/events.js');

  test('RÉGRESSION : la signature de Case inclut l\'état du cache', () => {
    assert.match(SCENE3D, /modelCacheSignature\(collectModelFiles\(/,
      'sans cela, un modèle qui finit d\'arriver ne redéclenche aucun rendu');
    assert.match(SCENE3D, /\|\|m:' \+ modelPart|modelPart/,
      'la part calculée n\'entre pas dans la signature retournée');
  });

  test('RÉGRESSION : le changement de Projet vide le cache des modèles', () => {
    const bloc = SCENE3D.slice(SCENE3D.indexOf('export function disposeAllRigs3D'));
    assert.match(bloc.slice(0, 400), /clearModelCache\(\)/,
      'les géométries du Projet précédent resteraient sur la carte graphique');
  });

  test('RÉGRESSION : le constructeur de rig LIT le cache, il n\'attend jamais', () => {
    // Un `await` dans ce chemin serait une faute d'architecture, pas un détail : le rendu est
    // synchrone de bout en bout.
    const début = RIG3D.indexOf('function buildImportedModelRig3D');
    const corps = RIG3D.slice(début, RIG3D.indexOf('\n}', début));
    assert.ok(début > 0, 'le constructeur de modèle a disparu');
    assert.match(corps, /getLoadedModel\(/);
    assert.doesNotMatch(corps, /await|async/, 'le chemin de dessin ne peut pas attendre');
  });

  test('le rig se reconstruit quand le modèle arrive', () => {
    // Sans cette invalidation, le rig resterait la boîte de remplacement pour toujours, même une
    // fois le fichier décodé.
    assert.match(RIG3D, /modelChanged/, 'l\'invalidation par état de chargement a disparu');
    assert.match(RIG3D, /entry\.modelState !==/, 'seul le nom de fichier est comparé');
  });

  test('RÉGRESSION : le rig d\'un modèle importé se reconstruit quand la hauteur cible change', () => {
    // placeRigCentered3D remet figureGroup.scale à 1 puis réapplique le facteur voulu à CHAQUE
    // rendu — en théorie, ça suffirait sans reclonage. Mais pour un modèle importé ARTICULÉ
    // (SkinnedMesh), redimensionner depuis la modale APRÈS l'import laissait le rendu 3D figé à sa
    // taille de création (seule la Case 2D suivait) — cf. retours utilisateur. Le remède sûr : un
    // reclonage (cloneSkinned) à chaque changement de realHeightFloor, exactement le chemin déjà
    // vérifié correct à l'import (cf. tests/vendor-skeleton-utils.test.mjs).
    assert.match(RIG3D, /heightChanged/, 'l\'invalidation par hauteur cible a disparu');
    assert.match(RIG3D, /entry\.realHeightFloor !==/, 'la comparaison ne porte plus sur realHeightFloor');
    const début = RIG3D.indexOf('export function ensureObjectRigEntry3D');
    const corps = RIG3D.slice(début, RIG3D.indexOf('\nexport function', début + 1));
    assert.ok(début > 0, 'ensureObjectRigEntry3D a disparu');
    assert.match(corps, /\|\|\s*heightChanged\)/, 'heightChanged n\'entre pas dans la condition de reconstruction');
  });

  test('le chargement de Projet lance le préchargement, sans l\'attendre', () => {
    assert.match(IO, /preloadModelsFor\(/, 'les modèles du Projet ne sont jamais demandés');
    assert.doesNotMatch(IO, /await preloadModelsFor/,
      'attendre ici bloquerait l\'ouverture du Projet sur une lecture disque');
  });

  test('l\'arrivée d\'un modèle déclenche un redessin', () => {
    assert.match(EVENTS, /setModelCacheCallbacks\(\{\s*onChange/,
      'sans ce rappel, le modèle décodé attendrait le prochain geste de l\'utilisateur');
  });

  test('RÉGRESSION : l\'anisotropie du renderer est câblée jusqu\'au cache de modèles', () => {
    // Sans ce fil, applyAnisotropy() ne voit jamais que sa valeur par défaut (1) : le moiré au
    // dézoom reviendrait silencieusement, sans qu'aucun test ci-dessus ne le détecte — ces tests
    // vérifient applyAnisotropy en isolation, pas qu'elle reçoit la vraie capacité du GPU.
    assert.match(EVENTS, /getMaxAnisotropy:\s*getMaxAnisotropy3D/,
      'setModelCacheCallbacks n\'injecte plus getMaxAnisotropy — le module retombe sur son défaut (1)');
    const MODEL_CACHE = lire('src/model-cache.js');
    assert.match(MODEL_CACHE, /applyAnisotropy\(scene\)/,
      'preloadModels n\'appelle plus applyAnisotropy sur le modèle décodé');
  });
});

/**
 * JOURNAL DE MUTATION — huit fautes, sur le module et sur son câblage.
 *
 *   U1 le filtre « absent » retiré : rechargement de ce qui charge déjà        ROUGE (3)
 *   U3 l'état retiré de la signature de cache                                  ROUGE
 *   U4 les matériaux en tableau ignorés                                        ROUGE (9)
 *   U5 les textures non libérées                                               ROUGE
 *   U6 le rig ne se reconstruit plus quand le modèle arrive                    ROUGE
 *   U7 le préchargement retiré du chargement de Projet                         ROUGE
 *   U8 le cache non vidé au changement de Projet                               ROUGE
 *
 * U3 ET U6 SONT LES DEUX MOITIÉS DU MÊME PIÈGE, et c'est celui qui rendait cette étape risquée :
 * un modèle qui finit d'être décodé ne change RIEN dans l'Élément qui le porte. Sans la signature
 * (U3), la Case reste en cache ; sans l'invalidation du rig (U6), le rig reste la boîte de
 * remplacement. Les deux ensemble donnent un modèle qui apparaît « au prochain déplacement », sans
 * rapport visible avec l'import. Chaque moitié est épinglée séparément.
 *
 * MUTANT ÉQUIVALENT ASSUMÉ. Retirer `|| !octets.length` du refus d'un fichier vide ne change pas
 * l'état final : le décodeur reçoit alors zéro octet, échoue, et l'entrée passe quand même à
 * « introuvable ». La garde est gardée quand même — elle ne fait pas DÉPENDRE le résultat du
 * comportement de GLTFLoader sur une entrée vide, comportement qu'on ne contrôle pas.
 */
