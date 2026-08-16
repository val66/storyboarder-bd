/**
 * tests/skeleton-store.test.mjs — ranger une correspondance de squelette, et la retrouver.
 *
 * TROIS DÉCISIONS SONT GARDÉES ICI, et aucune ne se voit à l'usage tant que rien ne casse :
 *
 *   — ON MÉMORISE DES NOMS D'OS, PAS DES INDICES. Un indice de nœud glTF n'a de sens que pour un
 *     fichier donné : réexporter le même personnage depuis Blender renumérote tout, et une
 *     correspondance par indices désignerait alors des os arbitraires. Sans bruit ;
 *   — ON N'ENREGISTRE QUE LES DÉCISIONS HUMAINES. Recopier aussi les propositions automatiques
 *     figerait la reconnaissance d'aujourd'hui : une version ultérieure qui saurait mieux faire ne
 *     s'appliquerait plus jamais, puisqu'elle trouverait une correspondance « enregistrée » partout ;
 *   — UN FICHIER ABÎMÉ NE FAIT JAMAIS ÉCHOUER L'OUVERTURE D'UN PROJET. Au pire on repart d'une
 *     correspondance vide. Une correspondance perdue se refait en trente secondes ; un Projet qui
 *     refuse de s'ouvrir, non.
 *
 * CE QU'ON N'AFFIRME PAS : que l'écriture sur le disque fonctionne. Elle est dans main.js, hors de
 * portée des tests (cf. docs/architecture.md, l'unique exception). Ce qui est testé, c'est tout ce
 * qui décide de CE QU'ON ÉCRIT et de comment on relit.
 */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  normaliserFichier, entreePourFichier, fusionner, setSkeletonBridge,
  lireCorrespondances, enregistrerCorrespondance, oublierCorrespondance, SKELETON_MAP_FORMAT,
  doitOuvrirCorrespondance,
} from '../src/skeleton-store.js';
import { SLOTS } from '../src/skeleton-map.js';

const OS = [
  { id: 3, name: 'mixamorig:LeftUpLeg' },
  { id: 4, name: 'mixamorig:LeftLeg' },
  { id: 5, name: 'mixamorig:Hips' },
];

describe('normaliserFichier — relire sans jamais faire échouer une ouverture', () => {
  test('un contenu valide traverse intact', () => {
    const r = normaliserFichier({ version: 1, entrees: { 'a.glb': { os: { bassin: 'Hips' }, valide: true } } });
    assert.deepEqual(r.entrees['a.glb'], { os: { bassin: 'Hips' }, valide: true });
  });

  test('n\'importe quelle absurdité rend une forme vide, sans lever', () => {
    [null, undefined, 42, 'texte', [], { entrees: 'pas un objet' }, { entrees: { 'a.glb': 7 } }]
      .forEach(x => {
        let r;
        assert.doesNotThrow(() => { r = normaliserFichier(x); }, JSON.stringify(x));
        assert.deepEqual(r, { version: SKELETON_MAP_FORMAT, entrees: {} });
      });
  });

  test('RÉGRESSION : une version FUTURE est ignorée, pas réinterprétée', () => {
    // On ne sait pas ce que contient un format plus récent. Le lire de travers puis le RÉÉCRIRE
    // écraserait le travail fait par une version plus récente de l'application — sur un fichier
    // partagé par tous les Projets, donc sans recours.
    const r = normaliserFichier({ version: 99, entrees: { 'a.glb': { os: { bassin: 'Hips' } } } });
    assert.deepEqual(r.entrees, {});
  });

  test('les emplacements inconnus sont écartés, les connus gardés', () => {
    const r = normaliserFichier({ version: 1, entrees: { 'a.glb': {
      os: { bassin: 'Hips', inventé: 'Truc', tete: 'Head' } } } });
    assert.deepEqual(Object.keys(r.entrees['a.glb'].os).sort(), ['bassin', 'tete']);
  });

  test('RÉGRESSION : une entrée VALIDÉE sans aucun os est conservée', () => {
    // Signalé à l'usage. J'écrivais qu'une entrée sans os « n'apprend rien » — c'était faux : elle
    // apprend que l'utilisateur a VU cet écran et l'a tranché. Sans elle, valider sans rien
    // corriger — le cas le plus fréquent — n'écrivait rien, et la modale se rouvrait à chaque
    // import. Ce qui revient exactement à ne pas avoir enregistré.
    const r = normaliserFichier({ version: 1, entrees: {
      'valide.glb': { os: {}, valide: true },
      'rien.glb': { os: {} },
      'corrige.glb': { os: { tete: 'H' } },
    } });
    assert.deepEqual(Object.keys(r.entrees).sort(), ['corrige.glb', 'valide.glb']);
  });

  test('un nom d\'os qui n\'est pas une chaîne est écarté', () => {
    const r = normaliserFichier({ version: 1, entrees: { 'a.glb': { os: { bassin: 12, tete: 'Head' } } } });
    assert.deepEqual(r.entrees['a.glb'].os, { tete: 'Head' });
  });
});

describe('entreePourFichier — n\'enregistrer que ce que l\'utilisateur a décidé', () => {
  test('RÉGRESSION : les propositions automatiques ne sont PAS enregistrées', () => {
    // Les figer condamnerait toute amélioration future de la reconnaissance : elle ne s'appliquerait
    // plus jamais, puisqu'elle trouverait une correspondance « enregistrée » partout. La validation
    // est une information SÉPARÉE, qui n'entraîne aucune recopie des propositions.
    const carte = {
      bassin: { bone: 5, name: 'Hips', origine: 'nom' },
      tete: { bone: 6, name: 'Head', origine: 'structure' },
    };
    assert.equal(entreePourFichier(carte), null);
    assert.deepEqual(entreePourFichier(carte, { valide: true }), { os: {}, valide: true });
  });

  test('seules les entrées « manuel » sont retenues', () => {
    const carte = {
      bassin: { bone: 5, name: 'Hips', origine: 'nom' },
      cuisse_g: { bone: 3, name: 'mixamorig:LeftUpLeg', origine: 'manuel' },
    };
    assert.deepEqual(entreePourFichier(carte), { os: { cuisse_g: 'mixamorig:LeftUpLeg' }, valide: false });
  });

  test('RÉGRESSION : c\'est le NOM de l\'os qui est enregistré, jamais son indice', () => {
    // Un indice de nœud glTF n'a de sens que pour un fichier donné. Réexporter le personnage
    // renumérote tout, et la correspondance désignerait des os arbitraires, sans bruit.
    const e = entreePourFichier({ bassin: { bone: 5, name: 'Hips', origine: 'manuel' } });
    assert.equal(e.os.bassin, 'Hips');
    assert.deepEqual(Object.values(e.os).filter(v => typeof v !== 'string'), []);
  });

  test('une carte vide ou absurde rend null', () => {
    [null, undefined, {}, { bassin: null }].forEach(c => assert.equal(entreePourFichier(c), null));
  });
});

describe('fusionner — l\'enregistré prime, tant qu\'il désigne un os qui existe', () => {
  const auto = {
    cuisse_g: { bone: 3, name: 'mixamorig:LeftUpLeg', origine: 'structure' },
    bassin: { bone: 5, name: 'mixamorig:Hips', origine: 'nom' },
  };

  test('une correction enregistrée remplace la proposition, et se déclare « manuel »', () => {
    const r = fusionner(auto, { os: { cuisse_g: 'mixamorig:LeftLeg' } }, OS);
    assert.deepEqual(r.cuisse_g, { bone: 4, name: 'mixamorig:LeftLeg', origine: 'manuel' });
  });

  test('les emplacements non corrigés gardent la proposition automatique', () => {
    const r = fusionner(auto, { os: { cuisse_g: 'mixamorig:LeftLeg' } }, OS);
    assert.deepEqual(r.bassin, auto.bassin);
  });

  test('RÉGRESSION : un os enregistré qui a DISPARU du fichier ne pointe pas dans le vide', () => {
    // Le `.glb` a été remplacé par une autre version, et l'os retenu n'existe plus. On retombe sur
    // la reconnaissance pour CET emplacement — pointer vers un os absent tordrait le personnage
    // ou ne ferait rien, selon les cas, sans jamais le dire.
    const r = fusionner(auto, { os: { cuisse_g: 'os_qui_nexiste_plus' } }, OS);
    assert.deepEqual(r.cuisse_g, auto.cuisse_g);
  });

  test('… et le RESTE de la correspondance enregistrée survit', () => {
    // On ne jette pas tout le travail de l'utilisateur parce qu'un seul os a changé de nom.
    const r = fusionner(auto, { os: { cuisse_g: 'disparu', bassin: 'mixamorig:Hips' } }, OS);
    assert.equal(r.bassin.origine, 'manuel');
    assert.equal(r.cuisse_g.origine, 'structure');
  });

  test('tous les emplacements sont présents, même vides', () => {
    // L'écran de correspondance affiche 18 lignes quoi qu'il arrive ; une clé absente y ferait un
    // trou, et un trou ne se distingue pas d'un oubli.
    const r = fusionner({}, null, OS);
    assert.deepEqual(Object.keys(r).sort(), SLOTS.slice().sort());
    SLOTS.forEach(s => assert.equal(r[s], null));
  });

  test('entrées absurdes : on ne lève pas', () => {
    [null, undefined].forEach(x =>
      assert.doesNotThrow(() => fusionner(x, x, x)));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Le disque, à travers un pont simulé
// ─────────────────────────────────────────────────────────────────────────────

let ecrit, pontRepond;
beforeEach(() => {
  ecrit = [];
  pontRepond = { ok: true, data: { version: 1, entrees: {} } };
  setSkeletonBridge({
    readSkeletonMaps: async () => pontRepond,
    writeSkeletonMaps: async (c) => { ecrit.push(JSON.parse(JSON.stringify(c))); return { ok: true }; },
  });
});

describe('lireCorrespondances / enregistrerCorrespondance', () => {
  test('sans pont, on rend une correspondance vide plutôt que d\'échouer', async () => {
    setSkeletonBridge(null);
    assert.deepEqual(await lireCorrespondances(), { version: SKELETON_MAP_FORMAT, entrees: {} });
  });

  test('un pont qui lève ne fait pas échouer la lecture', async () => {
    setSkeletonBridge({ readSkeletonMaps: async () => { throw new Error('disque en vrac'); } });
    assert.deepEqual((await lireCorrespondances()).entrees, {});
  });

  test('RÉGRESSION : on RELIT avant d\'écrire, pour ne pas écraser une autre fenêtre', async () => {
    // Le fichier est partagé par tous les Projets. Entre le chargement et l'enregistrement, une
    // autre fenêtre de l'application a pu ajouter la correspondance d'un autre modèle. Réécrire ce
    // qu'on avait en mémoire l'effacerait — et personne ne s'en apercevrait avant de rouvrir.
    pontRepond = { ok: true, data: { version: 1, entrees: { 'autre.glb': { os: { tete: 'Head' } } } } };
    await enregistrerCorrespondance('a.glb', { bassin: { bone: 5, name: 'Hips', origine: 'manuel' } });
    assert.deepEqual(Object.keys(ecrit[0].entrees).sort(), ['a.glb', 'autre.glb']);
  });

  test('RÉGRESSION : valider sans rien corriger écrit quand même une entrée', async () => {
    // LE défaut signalé à l'usage. Sans cela, la modale se rouvrait à chaque import d'un fichier
    // dont la reconnaissance était juste — c'est-à-dire la plupart.
    pontRepond = { ok: true, data: { version: 1, entrees: {} } };
    await enregistrerCorrespondance('a.glb', { bassin: { bone: 5, name: 'Hips', origine: 'nom' } });
    assert.deepEqual(ecrit[0].entrees['a.glb'], { os: {}, valide: true });
  });

  test('« Tout remettre en automatique » efface l\'entrée, validation comprise', async () => {
    // L'utilisateur renonce à ses corrections ET à sa validation : la modale doit pouvoir se
    // reproposer. C'est la seule façon de revenir en arrière complètement.
    pontRepond = { ok: true, data: { version: 1, entrees: { 'a.glb': { os: { bassin: 'Hips' }, valide: true } } } };
    await enregistrerCorrespondance('a.glb', {}, { valide: false });
    assert.deepEqual(ecrit[0].entrees, {});
  });

  test('RÉGRESSION : oublierCorrespondance n\'écrit pas une coquille VALIDÉE', async () => {
    // Un `.glb` supprimé du disque. Sans `valide: false`, on réécrirait une entrée validée pour un
    // fichier qui n'existe plus — et un homonyme réimporté plus tard n'ouvrirait jamais l'écran.
    pontRepond = { ok: true, data: { version: 1, entrees: {
      'a.glb': { os: { bassin: 'H' }, valide: true }, 'b.glb': { os: { tete: 'T' }, valide: true } } } };
    await oublierCorrespondance('a.glb');
    assert.deepEqual(Object.keys(ecrit[0].entrees), ['b.glb']);
  });

  test('un échec d\'écriture est RAPPORTÉ, pas avalé', async () => {
    // La faute la plus coûteuse de ce dépôt reste « un succès annoncé pour un travail sans effet ».
    setSkeletonBridge({
      readSkeletonMaps: async () => ({ ok: true, data: { version: 1, entrees: {} } }),
      writeSkeletonMaps: async () => ({ ok: false, error: 'disque plein' }),
    });
    const r = await enregistrerCorrespondance('a.glb', { bassin: { bone: 5, name: 'H', origine: 'manuel' } });
    assert.equal(r.ok, false);
    assert.match(r.error, /disque plein/);
  });

  test('sans pont d\'écriture, on refuse plutôt que de prétendre avoir enregistré', async () => {
    setSkeletonBridge({ readSkeletonMaps: async () => ({ ok: false }) });
    assert.equal((await enregistrerCorrespondance('a.glb', {})).ok, false);
  });
});

/**
 * JOURNAL DE MUTATION.
 *
 *   P1 les propositions automatiques sont enregistrées comme les manuelles     ROUGE
 *   P2 on enregistre l'indice de l'os au lieu de son nom                       ROUGE
 *   P3 un os enregistré disparu écrase quand même la proposition               ROUGE
 *   P4 on écrit sans relire (une autre fenêtre est écrasée)                    ROUGE
 *   P5 une version future est relue comme la version courante                  ROUGE
 *   P6 un échec d'écriture est rendu comme un succès                           ROUGE
 *
 * P4 EST CELLE QU'ON NE VERRAIT JAMAIS EN DÉVELOPPANT. Elle demande deux fenêtres ouvertes, et son
 * effet — la correspondance d'un autre modèle effacée — ne se découvre qu'en rouvrant le fichier
 * bien plus tard. C'est exactement la forme des défauts que ce dépôt collectionne : rien ne lève,
 * rien ne s'affiche, et le problème se manifeste ailleurs, plus tard.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Le câblage vers le disque — par lecture de source, faute de pouvoir l'exécuter
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync as _lire } from 'node:fs';
import { fileURLToPath as _chemin } from 'node:url';
import { dirname as _dossier, join as _joindre } from 'node:path';

const _RACINE = _joindre(_dossier(_chemin(import.meta.url)), '..');
const MAIN = _lire(_joindre(_RACINE, 'main.js'), 'utf8');
const PRELOAD = _lire(_joindre(_RACINE, 'preload.js'), 'utf8');
const TYPES = _lire(_joindre(_RACINE, 'types/globals.d.ts'), 'utf8');

describe('Câblage des correspondances vers le processus principal', () => {
  test('les deux canaux existent des DEUX côtés du pont', () => {
    // Un canal déclaré d'un seul côté ne lève pas : `invoke` reste en attente, ou le handler n'est
    // jamais appelé. C'est la panne silencieuse type de l'IPC.
    ['skeletons:read', 'skeletons:write'].forEach(canal => {
      assert.match(MAIN, new RegExp(`ipcMain\\.handle\\('${canal}'`), `main.js : ${canal}`);
      assert.match(PRELOAD, new RegExp(`invoke\\('${canal}'`), `preload.js : ${canal}`);
    });
  });

  test('les méthodes exposées sont décrites dans les types', () => {
    // Un test existant refuse déjà toute méthode de preload absente de globals.d.ts. On épingle
    // ici les deux nouvelles nommément, parce qu'elles portent la seule persistance partagée
    // entre Projets.
    ['readSkeletonMaps', 'writeSkeletonMaps'].forEach(m => {
      assert.match(PRELOAD, new RegExp(`${m}:`), `preload.js : ${m}`);
      assert.match(TYPES, new RegExp(`${m}\\(`), `globals.d.ts : ${m}`);
    });
  });

  test('RÉGRESSION : le fichier est écrit par un TEMPORAIRE puis renommé', () => {
    // Une coupure en pleine écriture laisserait sinon un JSON tronqué, donc illisible, donc TOUTES
    // les correspondances perdues d'un coup — pas seulement celle qu'on enregistrait. Le renommage
    // est atomique sur les systèmes de fichiers visés.
    const bloc = MAIN.slice(MAIN.indexOf("ipcMain.handle('skeletons:write'"));
    const corps = bloc.slice(0, bloc.indexOf('\n});'));
    assert.match(corps, /\.tmp/, 'écriture directe sur le fichier final');
    assert.ok(corps.indexOf('writeFile') < corps.indexOf('rename'),
      'le renommage doit venir APRÈS l\'écriture du temporaire');
  });

  test('RÉGRESSION : le fichier est à CÔTÉ du dossier Modeles, pas dedans', () => {
    // Ce dossier ne contient que des .glb, et models:list y refuse déjà tout le reste. Y glisser un
    // .json obligerait à percer cette garde pour un cas particulier.
    const bloc = MAIN.slice(MAIN.indexOf('function getSkeletonMapsPath'));
    assert.match(bloc.slice(0, 200), /getProjectsDir\(\)/);
    assert.doesNotMatch(bloc.slice(0, 200), /getModelsDir\(\)/);
  });

  test('une lecture impossible n\'est pas une panne', () => {
    // Absent au premier usage, ou illisible : les deux se traitent pareil côté renderer.
    const bloc = MAIN.slice(MAIN.indexOf("ipcMain.handle('skeletons:read'"));
    assert.match(bloc.slice(0, 600), /catch/);
    assert.match(bloc.slice(0, 600), /ok: false/);
  });
});

describe('doitOuvrirCorrespondance — n\'ouvrir que quand il y a quelque chose à montrer', () => {
  const os = [{ id: 1, name: 'Hips' }];

  test('RÉGRESSION : un modèle SANS squelette n\'ouvre jamais l\'écran', () => {
    // Une chaise, un bâtiment, un décor — probablement la majorité des imports. L'écran n'aurait
    // littéralement aucune ligne à afficher.
    assert.equal(doitOuvrirCorrespondance({ osDuFichier: [], dejaEnregistree: false }), false);
    assert.equal(doitOuvrirCorrespondance({ osDuFichier: null, dejaEnregistree: false }), false);
    assert.equal(doitOuvrirCorrespondance({}), false);
  });

  test('RÉGRESSION : une correspondance déjà VALIDÉE n\'est pas redemandée', () => {
    // Même s'il reste des lignes « structure » : l'utilisateur les a vues, signalées, et a tranché.
    // Les lui remontrer à chaque import reviendrait à ne pas avoir enregistré (signalé à l'usage).
    assert.equal(doitOuvrirCorrespondance({ osDuFichier: os, dejaEnregistree: true }), false);
  });

  test('un squelette jamais vu ouvre l\'écran, MÊME si tout est reconnu', () => {
    // Décision de l'utilisateur, contre mon avis initial : un écran qui ne se montre jamais quand
    // tout va bien est un écran dont on ignore l'existence le jour où ça va mal.
    assert.equal(doitOuvrirCorrespondance({ osDuFichier: os, dejaEnregistree: false }), true);
  });
});

describe('Câblage de l\'écran de correspondance', () => {
  const EVENTS = _lire(_joindre(_RACINE, 'src/events.js'), 'utf8');
  const HTML = _lire(_joindre(_RACINE, 'index.html'), 'utf8');
  const IMPORT = _lire(_joindre(_RACINE, 'src/model-import.js'), 'utf8');

  test('la modale et ses commandes existent', () => {
    ['skeletonMapModal', 'skeletonMapList', 'skeletonMapSave', 'skeletonMapCancel', 'skeletonMapReset']
      .forEach(id => assert.match(HTML, new RegExp(`id="${id}"`), `absent : ${id}`));
  });

  test('RÉGRESSION : l\'entrée du clic droit vise le FICHIER, pas un Élément', () => {
    // Le seul point d'entrée atteignable pour un .glb importé comme Scène, qui n'a aucun Élément
    // dans une Case d'où on pourrait ouvrir l'écran.
    assert.match(HTML, /id="ctxSkeletonMap"/);
    const bloc = EVENTS.slice(EVENTS.indexOf("ctxSkeletonMap').onclick"));
    assert.match(bloc.slice(0, 300), /_modelCtxFichier/);
  });

  test('RÉGRESSION : les DEUX fonctions d\'import annoncent le fichier entré', () => {
    // Trois points d'entrée dans l'interface, mais DEUX fonctions : « Modèle » et « Scène depuis
    // une Case » d'un côté, « Importer un décor… » du menu de gauche partageant la seconde. Ma
    // première version de ce test comptait trois appels et échouait — l'erreur était dans le test,
    // pas dans le code. Compter des occurrences était de toute façon fragile : on vérifie
    // maintenant que CHAQUE fonction exportée porte le crochet.
    ['importModelIntoPanel', 'importSceneFromModel'].forEach(fn => {
      const debut = IMPORT.indexOf(`export async function ${fn}`);
      assert.ok(debut > 0, `fonction introuvable : ${fn}`);
      const corps = IMPORT.slice(debut, IMPORT.indexOf('\n}', debut));
      assert.match(corps, /_apresImport\(/, `${fn} n'annonce pas le fichier importé`);
    });
  });

  test('RÉGRESSION : supprimer un modèle oublie sa correspondance', () => {
    // Sans cela, une entrée orpheline resterait dans un fichier partagé par tous les Projets, et
    // ressusciterait au réimport d'un homonyme — avec les os de l'ANCIEN squelette.
    const bloc = EVENTS.slice(EVENTS.indexOf("ctxDeleteModel').onclick"));
    assert.match(bloc.slice(0, bloc.indexOf('\n};')), /oublierCorrespondance\(/);
  });

  test('un échec d\'enregistrement est rapporté', () => {
    const bloc = EVENTS.slice(EVENTS.indexOf("skeletonMapSave').onclick"));
    assert.match(bloc.slice(0, bloc.indexOf('\n};')), /alertAction/);
  });

  test('les classes d\'origine existent dans style.css', () => {
    const CSS = _lire(_joindre(_RACINE, 'style.css'), 'utf8');
    ['origine-nom', 'origine-structure', 'origine-manuel', 'origine-vide']
      .forEach(c => assert.match(CSS, new RegExp(`\\.${c}`), `classe absente : .${c}`));
  });
});
