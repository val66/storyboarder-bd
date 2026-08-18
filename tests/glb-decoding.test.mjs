/**
 * tests/glb-decoding.test.mjs — le seul test qui transforme vraiment des OCTETS en modèle.
 *
 * TOUT LE RESTE DE LA CHAÎNE ÉTAIT TESTÉ SAUF ÇA. model-store, model-cache, model-import et
 * model-library ont chacun leurs tests, mais tous s'arrêtent au même endroit : `_setModelCacheEntry`
 * remet au cache un résultat déjà cuit, et le pont Electron est simulé. Aucun test ne prenait un
 * `.glb` et n'en tirait une hauteur. La copie embarquée de GLTFLoader n'était vérifiée que par
 * lecture de source (cf. vendor-gltf.test.mjs) : qu'elle ne DÉRIVE pas de l'original, pas qu'elle
 * FONCTIONNE.
 *
 * CE QUE CE FICHIER TRANCHE, et qui était jusqu'ici une affirmation dans des commentaires :
 *
 *   — « glTF garantit le mètre ». Tout le dimensionnement de l'import repose là-dessus. On écrit
 *     des coordonnées en mètres dans un fichier, on relit une hauteur : si l'unité se perdait
 *     quelque part, un modèle arriverait 100× trop grand et la seule trace serait un retour
 *     utilisateur ;
 *   — que GLTFLoader.parse s'exécute sous Node. Le doute était légitime — Three.js réclame WebGL
 *     pour beaucoup de choses. Il se trouve que le décodage de la GÉOMÉTRIE n'en a pas besoin ;
 *     seul le rendu en réclame. C'est mesuré ici, pas supposé.
 *
 * CE QUE CE FICHIER NE PROUVE PAS, et il faut le dire clairement : que le `.glb` d'un vrai
 * modélisateur se décode. Le pavé témoin n'a ni texture, ni squelette, ni matériau, ni extension.
 * Un fichier Blender en a. L'essai avec un vrai fichier reste MANUEL, et c'est lui qui a trouvé les
 * trois derniers défauts de cette fonctionnalité (boîte englobante ignorant le skinning, squelette
 * cassé au clonage, modèles démesurés).
 */
import './helpers/dom-stub.mjs';
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  construireGlb, DIMENSIONS_M, CHEMIN_FIXTURE,
  construireGlbSquelette, CHEMIN_FIXTURE_SQUELETTE, MAILLAGES_SQUELETTE,
} from '../tools/make-test-glb.mjs';
import { setModelBridge } from '../src/model-store.js';
import { preloadModels, getLoadedModel, modelState, clearModelCache } from '../src/model-cache.js';
import { MODEL_HEIGHT_WARN_MAX_M, OBJECT_REAL_HEIGHT_M } from '../src/constants.js';

const OCTETS = readFileSync(CHEMIN_FIXTURE);
const OCTETS_SQUELETTE = readFileSync(CHEMIN_FIXTURE_SQUELETTE);

/** Pont simulé rendant de VRAIS octets — c'est tout ce qui reste de simulé ici. */
function pontAvec(fichiers){
  setModelBridge({
    readModelFile: async (n) => (fichiers[n] ? { ok: true, data: new Uint8Array(fichiers[n]) } : { ok: false }),
    listModelFiles: async () => Object.keys(fichiers),
  });
}

beforeEach(() => { clearModelCache(); setModelBridge(null); });

describe('Décodage d\'un vrai .glb — de l\'octet à la hauteur', () => {
  test('RÉGRESSION : la hauteur relue est celle écrite dans le fichier, en mètres', async () => {
    // L'affirmation sur laquelle repose tout le dimensionnement de l'import. Elle n'était écrite
    // que dans des commentaires.
    pontAvec({ 'pave.glb': OCTETS });
    await preloadModels(['pave.glb']);
    assert.equal(modelState('pave.glb'), 'prêt', 'le fichier n\'a pas été décodé');
    const { hauteurM } = getLoadedModel('pave.glb');
    assert.ok(Math.abs(hauteurM - DIMENSIONS_M.y) < 1e-4,
      `hauteur relue ${hauteurM} m, écrite ${DIMENSIONS_M.y} m — l'unité s'est perdue`);
  });

  test('RÉGRESSION : c\'est bien la hauteur, pas une autre dimension', async () => {
    // Le pavé a trois côtés différents exprès. Un cube aurait laissé passer une confusion d'axes :
    // lire X ou Z au lieu de Y aurait donné la même réponse, et le test aurait été vrai pour la
    // mauvaise raison.
    pontAvec({ 'pave.glb': OCTETS });
    await preloadModels(['pave.glb']);
    const { hauteurM } = getLoadedModel('pave.glb');
    [DIMENSIONS_M.x, DIMENSIONS_M.z].forEach(autre =>
      assert.ok(Math.abs(hauteurM - autre) > 1e-3, `${hauteurM} m : un autre axe que Y a été lu`));
  });

  test('RÉGRESSION : le rapport largeur/hauteur arrive jusqu\'au CACHE', async () => {
    // Le pavé témoin fait 0,6 de large pour 1,75 de haut : son rapport vaut 0,343. C'est lui qui
    // donne son empreinte 2D à l'Élément créé (cf. createModelElement) — sans ce relevé, l'empreinte
    // redeviendrait carrée en silence, la mesure étant juste mais jamais rangée.
    pontAvec({ 'pave.glb': OCTETS });
    await preloadModels(['pave.glb']);
    const { ratioLargeur } = getLoadedModel('pave.glb');
    const attendu = DIMENSIONS_M.x / DIMENSIONS_M.y;
    assert.ok(Math.abs(ratioLargeur - attendu) < 1e-4,
      `rapport relu ${ratioLargeur}, écrit ${attendu} — la mesure n'arrive pas au cache`);
  });

  test('la scène décodée est bien une scène Three parcourable', async () => {
    pontAvec({ 'pave.glb': OCTETS });
    await preloadModels(['pave.glb']);
    const { scene } = getLoadedModel('pave.glb');
    let maillages = 0;
    scene.traverse(n => { if (n.isMesh) maillages++; });
    assert.equal(maillages, 1, 'le maillage du pavé n\'a pas été reconstruit');
  });

  test('RÉGRESSION : un fichier TRONQUÉ passe à « introuvable » sans lever', async () => {
    // Jusqu'ici ce chemin n'était éprouvé qu'avec des octets inventés. Un vrai en-tête GLB suivi
    // d'un corps coupé est le cas réel — une copie interrompue, un disque plein. Le décodage doit
    // échouer proprement : un Projet dont un modèle est abîmé doit s'ouvrir entièrement.
    pontAvec({ 'coupe.glb': OCTETS.subarray(0, 60) });
    await assert.doesNotReject(() => preloadModels(['coupe.glb']));
    assert.equal(modelState('coupe.glb'), 'introuvable');
  });

  test('un fichier vide aussi', async () => {
    pontAvec({ 'vide.glb': Buffer.alloc(0) });
    await preloadModels(['vide.glb']);
    assert.equal(modelState('vide.glb'), 'introuvable');
  });

  test('un modèle abîmé n\'empêche pas les autres de se charger', async () => {
    // Le comportement qui compte à l'ouverture d'un Projet : on ne s'arrête pas au premier trou.
    pontAvec({ 'bon.glb': OCTETS, 'casse.glb': OCTETS.subarray(0, 60) });
    await preloadModels(['bon.glb', 'casse.glb']);
    assert.equal(modelState('bon.glb'), 'prêt');
    assert.equal(modelState('casse.glb'), 'introuvable');
  });
});

describe('Le pavé témoin — le fichier versionné et son générateur', () => {
  test('RÉGRESSION : le .glb du dépôt est bien celui que produit le générateur', () => {
    // Le fichier est versionné (les tests doivent tourner sans étape de génération), le générateur
    // aussi. Deux copies de la même chose : sans ce test, modifier les dimensions dans le script
    // laisserait le fichier inchangé, et les tests continueraient de valider un ancien pavé en
    // affichant les nouvelles valeurs. Exactement le défaut n°1 du dépôt.
    assert.deepEqual(Buffer.from(OCTETS), construireGlb(),
      'tests/fixtures/pave-1m75.glb est périmé — relancer `node tools/make-test-glb.mjs`');
  });

  test('il commence par la signature GLB, en version 2', () => {
    assert.equal(OCTETS.toString('ascii', 0, 4), 'glTF');
    assert.equal(OCTETS.readUInt32LE(4), 2);
    assert.equal(OCTETS.readUInt32LE(8), OCTETS.length, 'la longueur annoncée ment sur le fichier');
  });

  test('il n\'est PAS embarqué dans l\'installeur', () => {
    // Un fichier d'essai n'a rien à faire chez l'utilisateur. `build.files` n'inclut que src/ et
    // quelques fichiers nommés ; ce test épingle le fait que tests/ n'y figure pas.
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    assert.ok(!pkg.build.files.some(f => String(f).startsWith('tests')),
      'les fixtures de test partiraient dans l\'installeur');
  });
});

describe('Le seuil d\'alerte de taille, confronté à un vrai décodage', () => {
  test('un modèle de taille humaine ne déclenche AUCUN avertissement', async () => {
    pontAvec({ 'pave.glb': OCTETS });
    await preloadModels(['pave.glb']);
    const { hauteurM } = getLoadedModel('pave.glb');
    assert.ok(hauteurM < MODEL_HEIGHT_WARN_MAX_M,
      `1,75 m dépasse le seuil de ${MODEL_HEIGHT_WARN_MAX_M} m : tout import normal serait signalé`);
  });

  test('le seuil laisse de la marge au-dessus des types intégrés les plus grands', () => {
    // Le seuil de 10 m est un CHOIX, pas une mesure — c'est écrit tel quel dans constants.js. Ce
    // qu'on peut vérifier, c'est qu'il reste cohérent avec les hauteurs réelles du dépôt : s'il
    // passait sous le plus grand type intégré, l'avertissement se déclencherait sur des tailles
    // parfaitement légitimes.
    const plusGrand = Math.max(...Object.values(OBJECT_REAL_HEIGHT_M).filter(Number.isFinite));
    assert.ok(MODEL_HEIGHT_WARN_MAX_M > plusGrand * 1.5,
      `seuil ${MODEL_HEIGHT_WARN_MAX_M} m contre ${plusGrand} m pour le plus grand type intégré`);
  });
});

describe('Un modèle ARTICULÉ décodé — et ce que GLTFLoader fait aux poids en chemin', () => {
  // Le second témoin porte un os et deux maillages : l'un pesé sur l'os, l'autre écrit dans le
  // fichier avec des poids TOUS NULS. Il ferme le trou annoncé en tête de ce fichier — « ce pavé
  // n'a ni texture, ni squelette » — et il a servi à trancher une question qu'on ne pouvait pas
  // poser autrement.
  test('le fichier articulé se décode, avec son squelette et ses trois maillages', async () => {
    pontAvec({ 'rig.glb': OCTETS_SQUELETTE });
    await preloadModels(['rig.glb']);
    assert.equal(modelState('rig.glb'), 'prêt', 'le .glb articulé n\'a pas été décodé');
    const { scene } = getLoadedModel('rig.glb');
    let skinnés = 0, os = 0;
    scene.traverse(nœud => { if (nœud.isSkinnedMesh) skinnés++; if (nœud.isBone) os++; });
    assert.equal(skinnés, 3, 'les maillages articulés n\'ont pas été reconstruits');
    assert.ok(os >= 2, 'les deux os du témoin n\'ont pas été reconstruits');
  });

  test('MESURE : des poids nuls dans le fichier ressortent à (1, 0, 0, 0) après décodage', async () => {
    // ═════════════════════════════════════════════════════════════════════════════════════════
    // LE FAIT LE PLUS UTILE DE CE FICHIER, et il est contre-intuitif.
    //
    // GLTFLoader appelle `SkinnedMesh.normalizeSkinWeights()` sur tout maillage articulé dont les
    // poids ne sont pas déjà normalisés (cf. src/vendor/GLTFLoader.js, « normalizeSkinWeights »).
    // Or Three, face à un vecteur de poids de longueur NULLE, ne peut pas le normaliser : il pose
    // (1, 0, 0, 0) « pour faire quelque chose de raisonnable ».
    //
    // CONSÉQUENCE : après décodage, un maillage sans aucun poids est INDISCERNABLE d'un maillage
    // rigidement attaché au premier os. Toute détection écrite sur `geometry.attributes.skinWeight`
    // est donc AVEUGLE à ce défaut — elle ne peut pas se déclencher, jamais. Une tentative d'avertir
    // à l'import a été écrite puis retirée sur la foi de cette mesure.
    //
    // Ce test épingle le comportement du décodeur, pas une intention de ce dépôt : si une mise à
    // jour de GLTFLoader cessait de normaliser, il deviendrait rouge — et la détection redeviendrait
    // possible.
    // ═════════════════════════════════════════════════════════════════════════════════════════
    pontAvec({ 'rig.glb': OCTETS_SQUELETTE });
    await preloadModels(['rig.glb']);
    const { scene } = getLoadedModel('rig.glb');
    let orphelin = null;
    scene.traverse(nœud => { if (nœud.name === MAILLAGES_SQUELETTE.orphelin) orphelin = nœud; });
    assert.ok(orphelin, `le maillage « ${MAILLAGES_SQUELETTE.orphelin} » a disparu du décodage`);
    const poids = orphelin.geometry.attributes.skinWeight;
    assert.equal(poids.getX(0), 1, 'les poids nuls ne sont plus rattrapés par le décodeur');
    assert.equal(poids.getY(0), 0);
  });

  test('l\'entrée de cache PORTE la liste des maillages égarés', async () => {
    // Le témoin place « FourreauEgare » à y = 100 alors que le reste tient dans 0→1,75. C'est la
    // reproduction minimale du fourreau de worker_j (y 91→131 pour un personnage de 33 unités).
    //
    // Ce test garde le CHEMIN, pas le critère (celui-là est dans tests/stray-meshes.test.mjs) :
    // décoder de vrais octets, relever, ranger dans le cache. Sans lui, une détection parfaitement
    // juste pourrait n'être appelée par personne — le défaut « annoncé fait, sans effet ».
    pontAvec({ 'rig.glb': OCTETS_SQUELETTE });
    await preloadModels(['rig.glb']);
    assert.deepEqual(getLoadedModel('rig.glb').egares, [MAILLAGES_SQUELETTE.égaré]);
  });

  test('un modèle sain rend une liste VIDE, pas une absence', async () => {
    pontAvec({ 'pave.glb': OCTETS });
    await preloadModels(['pave.glb']);
    assert.deepEqual(getLoadedModel('pave.glb').egares, []);
  });

  test('le maillage égaré est bien celui que la MESURE désigne, pas un autre', async () => {
    // Le témoin du témoin : « Corps » et « Fourreau » se superposent exactement, et ni l'un ni
    // l'autre ne doit être signalé. Sans cette assertion, une détection qui nommerait tout le monde
    // passerait le test précédent.
    pontAvec({ 'rig.glb': OCTETS_SQUELETTE });
    await preloadModels(['rig.glb']);
    const { egares } = getLoadedModel('rig.glb');
    assert.ok(!egares.includes(MAILLAGES_SQUELETTE.pesé));
    assert.ok(!egares.includes(MAILLAGES_SQUELETTE.orphelin));
  });

  test('la fixture articulée est bien celle que le générateur produit AUJOURD\'HUI', () => {
    // Même garde que pour le pavé : une fixture versionnée se désynchronise en silence de l'outil
    // qui l'a écrite.
    assert.deepEqual(new Uint8Array(construireGlbSquelette()), new Uint8Array(OCTETS_SQUELETTE),
      'tests/fixtures/squelette-fourreau.glb est périmée — relancer node tools/make-test-glb.mjs');
  });
});

/**
 * JOURNAL DE MUTATION.
 *
 *   G1 hauteur lue sur X au lieu de Y                                            ROUGE
 *   G2 hauteur multipliée par 100 (unité perdue)                                 ROUGE
 *   G3 le fichier tronqué rend une scène vide au lieu de « introuvable »         ROUGE
 *   G4 dimensions changées dans le générateur sans régénérer la fixture          ROUGE
 *   G5 tests/ ajouté à build.files                                               ROUGE
 *
 * CE QUE LA CAMPAGNE NE COUVRE PAS, et qui reste le vrai risque : ce pavé n'a ni texture, ni
 * squelette, ni matériau. Les trois défauts trouvés jusqu'ici sur cette fonctionnalité venaient
 * TOUS de fichiers réels, et aucun n'aurait été attrapé ici. Ce test ferme le trou « rien ne décode
 * jamais rien » ; il ne remplace pas l'essai avec un fichier de modélisateur.
 */
