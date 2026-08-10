/**
 * tests/model-store.test.mjs — le magasin de modèles importés.
 *
 * Deux choses s'y jouent, et une seule se voit :
 *
 *   LE NOMMAGE. Un modèle mal nommé écrase un autre modèle, ou sort du dossier prévu. Le second cas
 *   n'est pas théorique : le nom vient d'un fichier choisi par l'utilisateur, et un chemin relatif
 *   glissé dedans écrirait ailleurs sur le disque.
 *
 *   LE REFUS DE SUPPRIMER. Un modèle introuvable rend `null`, jamais une instruction de suppression.
 *   Ce fichier épingle cette différence, parce qu'elle est invisible à la lecture et coûteuse à
 *   l'usage : un disque non monté effacerait un placement patiemment réglé.
 *
 * CE QU'ON N'AFFIRME PAS : que l'écriture sur disque fonctionne. Elle passe par le process Electron
 * (cf. main.js), simulé ici. On vérifie ce que le renderer DÉCIDE — ce qui est justement la part
 * qu'on lui a laissée.
 */
import './helpers/dom-stub.mjs';
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  sanitizeModelName, resolveModelName, memeContenu,
  setModelBridge, importModel, readModel, listModels,
} from '../src/model-store.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const MAIN = readFileSync(join(RACINE, 'main.js'), 'utf8');
const PRELOAD = readFileSync(join(RACINE, 'preload.js'), 'utf8');

const octets = (...v) => new Uint8Array(v);

/** Pont simulé : un dossier de modèles en mémoire, plus la trace de ce qui a été écrit. */
function pontSimulé({ choisi = null, fichiers = {} } = {}){
  const écrits = [];
  const store = { ...fichiers };
  setModelBridge({
    pickModelFile: async () => choisi,
    listModelFiles: async () => Object.keys(store),
    readModelFile: async (name) => (store[name]
      ? { ok: true, data: store[name] }
      : { ok: false, error: 'ENOENT' }),
    writeModelFile: async (name, data) => { écrits.push({ name, data }); store[name] = data; return { ok: true, name }; },
  });
  return { écrits, store };
}

beforeEach(() => setModelBridge(null));

// ─────────────────────────────────────────────────────────────────────────────
// 1. Le nommage
// ─────────────────────────────────────────────────────────────────────────────

describe('sanitizeModelName — un nom de fichier, et rien d\'autre', () => {
  test('RÉGRESSION : un chemin relatif ne peut pas sortir du dossier', () => {
    // La garde la plus importante du fichier. Le nom vient d'un fichier choisi par l'utilisateur ;
    // s'il portait un chemin, l'écriture atterrirait ailleurs sur le disque.
    assert.equal(sanitizeModelName('../../../Bureau/chaise.glb'), 'chaise.glb');
    assert.equal(sanitizeModelName('C:\\Windows\\System32\\truc.glb'), 'truc.glb');
    assert.equal(sanitizeModelName('dossier/sous-dossier/table.glb'), 'table.glb');
    assert.equal(sanitizeModelName('..'), 'modele.glb', 'un nom qui ne serait QUE des points');
  });

  test('les caractères interdits par Windows sont neutralisés', () => {
    assert.equal(sanitizeModelName('cha:ise?.glb'), 'cha_ise_.glb');
    assert.doesNotMatch(sanitizeModelName('a<b>c|d.glb'), /[<>|]/);
  });

  test('l\'extension est imposée une seule fois', () => {
    assert.equal(sanitizeModelName('chaise'), 'chaise.glb');
    assert.equal(sanitizeModelName('chaise.glb'), 'chaise.glb');
    assert.equal(sanitizeModelName('chaise.GLB'), 'chaise.glb', 'la casse ne doit pas doubler l\'extension');
    assert.equal(sanitizeModelName('chaise.gltf'), 'chaise.glb');
  });

  test('un nom vide ou absurde donne quand même un nom utilisable', () => {
    // Un nom vide ferait écrire un fichier sans nom, ou lever plus loin. Mieux vaut un nom neutre.
    ['', '   ', null, undefined, '///'].forEach(v =>
      assert.equal(sanitizeModelName(v), 'modele.glb', `entrée : ${JSON.stringify(v)}`));
  });
});

describe('resolveModelName — ne jamais écraser un modèle existant', () => {
  test('un nom libre est rendu tel quel', () => {
    assert.equal(resolveModelName('chaise.glb', ['table.glb']), 'chaise.glb');
  });

  test('un nom pris reçoit un suffixe, comme pour les Projets', () => {
    assert.equal(resolveModelName('chaise.glb', ['chaise.glb']), 'chaise (2).glb');
    assert.equal(resolveModelName('chaise.glb', ['chaise.glb', 'chaise (2).glb']), 'chaise (3).glb');
  });

  test('RÉGRESSION : la comparaison ignore la casse', () => {
    // Windows ne distingue pas Chaise.glb de chaise.glb. Rendre ce nom « libre » écraserait le
    // fichier existant — le contraire exact de ce que cette fonction promet.
    assert.equal(resolveModelName('chaise.glb', ['CHAISE.GLB']), 'chaise (2).glb');
  });

  test('le trou dans la numérotation est comblé', () => {
    // (2) supprimé à la main : on doit le reprendre plutôt que sauter à (4).
    assert.equal(resolveModelName('chaise.glb', ['chaise.glb', 'chaise (3).glb']), 'chaise (2).glb');
  });

  test('le nom souhaité est assaini avant d\'être comparé', () => {
    assert.equal(resolveModelName('../chaise', ['chaise.glb']), 'chaise (2).glb');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. L'import
// ─────────────────────────────────────────────────────────────────────────────

describe('importModel — ce qui est écrit, et ce qui ne l\'est pas', () => {
  test('un fichier choisi est rangé sous un nom propre', async () => {
    const { écrits } = pontSimulé({ choisi: { name: 'chaise.glb', data: octets(1, 2, 3) } });
    const r = await importModel();
    assert.deepEqual({ ok: r.ok, name: r.name, déjà: r.déjàPrésent }, { ok: true, name: 'chaise.glb', déjà: false });
    assert.equal(écrits.length, 1);
  });

  test('une annulation n\'écrit rien et ne prétend rien', async () => {
    const { écrits } = pontSimulé({ choisi: { canceled: true } });
    const r = await importModel();
    assert.equal(r.canceled, true);
    assert.equal(r.ok, undefined, 'une annulation ne doit pas passer pour un succès');
    assert.deepEqual(écrits, []);
  });

  test('RÉGRESSION : un fichier vide est refusé plutôt qu\'écrit', async () => {
    // Un .glb de zéro octet s'écrirait sans erreur et ne se chargerait jamais — l'utilisateur
    // verrait un Élément de remplacement sans comprendre, alors que le problème est à l'import.
    const { écrits } = pontSimulé({ choisi: { name: 'vide.glb', data: octets() } });
    const r = await importModel();
    assert.equal(r.ok, false);
    assert.match(r.error, /vide/);
    assert.deepEqual(écrits, [], 'un fichier vide a été rangé');
  });

  test('réimporter le MÊME fichier ne crée pas de doublon', async () => {
    // Sinon trois imports du même modèle donnent chaise.glb, chaise (2).glb, chaise (3).glb — trois
    // fois le même contenu sur le disque, et trois entrées indiscernables dans la liste.
    const contenu = octets(9, 8, 7);
    const { écrits } = pontSimulé({
      choisi: { name: 'chaise.glb', data: contenu },
      fichiers: { 'chaise.glb': contenu },
    });
    const r = await importModel();
    assert.deepEqual({ ok: r.ok, name: r.name, déjà: r.déjàPrésent },
      { ok: true, name: 'chaise.glb', déjà: true });
    assert.deepEqual(écrits, [], 'un contenu identique a été réécrit');
  });

  test('… mais un contenu DIFFÉRENT sous le même nom en crée bien un second', async () => {
    // Le pendant obligatoire : sans lui, le test précédent resterait vert avec une fonction qui
    // refuse tout réimport, et deux chaises différentes se confondraient.
    const { écrits } = pontSimulé({
      choisi: { name: 'chaise.glb', data: octets(1, 1, 1) },
      fichiers: { 'chaise.glb': octets(2, 2, 2) },
    });
    const r = await importModel();
    assert.equal(r.name, 'chaise (2).glb');
    assert.equal(écrits.length, 1);
  });

  test('une écriture refusée est rapportée, pas avalée', async () => {
    setModelBridge({
      pickModelFile: async () => ({ name: 'x.glb', data: octets(1) }),
      listModelFiles: async () => [],
      readModelFile: async () => ({ ok: false }),
      writeModelFile: async () => ({ ok: false, error: 'disque plein' }),
    });
    const r = await importModel();
    assert.equal(r.ok, false);
    assert.match(r.error, /disque plein/);
  });

  test('hors de l\'application, l\'import se dit indisponible', async () => {
    setModelBridge(null);
    delete globalThis.window.storyboarderAPI;
    const r = await importModel();
    assert.equal(r.ok, false);
    assert.match(r.error, /indisponible/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. La lecture — et le refus de supprimer
// ─────────────────────────────────────────────────────────────────────────────

describe('readModel — un modèle introuvable n\'est pas une raison de détruire', () => {
  test('un modèle présent rend ses octets', async () => {
    pontSimulé({ fichiers: { 'chaise.glb': octets(4, 5, 6) } });
    assert.deepEqual(await readModel('chaise.glb'), octets(4, 5, 6));
  });

  test('RÉGRESSION : un modèle absent rend null, et rien d\'autre', async () => {
    // `null` veut dire « affiche une boîte de remplacement ». Tout autre contrat — lever, ou rendre
    // un drapeau de suppression — mettrait l'appelant en position de détruire l'Élément sur une
    // panne passagère : disque externe non monté, fichier verrouillé par un antivirus.
    // Cf. docs/persisted-data.md § 5.
    pontSimulé({ fichiers: {} });
    assert.equal(await readModel('disparue.glb'), null);
  });

  test('un pont qui lève ne fait pas tomber l\'appelant', async () => {
    setModelBridge({ readModelFile: async () => { throw new Error('IPC coupé'); } });
    assert.equal(await readModel('chaise.glb'), null);
  });

  test('sans pont, la liste est vide plutôt qu\'absente', async () => {
    setModelBridge(null);
    delete globalThis.window.storyboarderAPI;
    assert.deepEqual(await listModels(), []);
  });
});

describe('memeContenu', () => {
  test('distingue vraiment', () => {
    assert.equal(memeContenu(octets(1, 2), octets(1, 2)), true);
    assert.equal(memeContenu(octets(1, 2), octets(1, 3)), false, 'même longueur, contenu différent');
    assert.equal(memeContenu(octets(1, 2), octets(1, 2, 3)), false);
    assert.equal(memeContenu(null, octets(1)), false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Le pont Electron — ce que le renderer ne peut pas garantir seul
// ─────────────────────────────────────────────────────────────────────────────

describe('Le pont : main.js se défend, il ne fait pas confiance', () => {
  test('RÉGRESSION : main.js refuse tout nom qui n\'est pas un nom de fichier nu', () => {
    // L'assainissement de src/ est une commodité pour l'utilisateur ; c'est CETTE garde qui protège
    // le disque. Un process principal ne fait jamais confiance à son renderer, même quand c'est le
    // nôtre : un défaut dans src/ ne doit pas pouvoir écrire hors du dossier des modèles.
    assert.match(MAIN, /function nomDeModeleAcceptable/,
      'la garde de nom a disparu de main.js');
    assert.match(MAIN, /name !== path\.basename\(name\)/,
      'la garde n\'exclut plus les séparateurs de chemin');
    assert.match(MAIN, /name\.startsWith\('\.'\)/, 'la garde n\'exclut plus « .. »');
  });

  test('les trois canaux d\'écriture et de lecture passent tous par cette garde', () => {
    ['models:write', 'models:read'].forEach(canal => {
      const bloc = MAIN.slice(MAIN.indexOf(`'${canal}'`));
      const corps = bloc.slice(0, bloc.indexOf('});'));
      assert.match(corps, /nomDeModeleAcceptable\(name\)/, `${canal} n'appelle pas la garde`);
    });
  });

  test('les modèles vivent dans le dossier de Projets, pas dans les données d\'application', () => {
    // La décision de l'étape 0. Les ranger ailleurs les ferait rester sur place au premier
    // changement de machine, alors que les Projets, eux, suivent.
    assert.match(MAIN, /path\.join\(getProjectsDir\(\), 'Modeles'\)/,
      'le dossier des modèles n\'est plus adossé au dossier de Projets');
  });

  test('preload expose exactement les quatre méthodes, et le pont les déclare', () => {
    // tests/electron-bridge.test.mjs garde déjà l'accord preload ↔ types/globals.d.ts ; ici on
    // vérifie que les nouvelles y sont bien entrées.
    ['pickModelFile', 'writeModelFile', 'readModelFile', 'listModelFiles'].forEach(m =>
      assert.match(PRELOAD, new RegExp(`\\b${m}:`), `${m} absente de preload.js`));
  });

  test('l\'exception à la règle n°1 est écrite, pas seulement commise', () => {
    // Toucher main.js pour une fonctionnalité contredit la règle n°1. Le faire est défendable ; le
    // faire en silence ne l'est pas — la prochaine personne y verrait un précédent sans raison.
    // Les deux noms sont COMPOSÉS plutôt qu'écrits : docs.test.mjs exige que le code ne renvoie
    // qu'à la version anglaise, et citer la française en toutes lettres — même dans un test qui
    // vérifie sa présence — fait tomber cette règle. Constaté au premier lancement.
    ['', '.fr'].map(suffixe => `docs/architecture${suffixe}.md`).forEach(f => {
      const doc = readFileSync(join(RACINE, f), 'utf8');
      assert.match(doc, /models:|Modeles|model-store/,
        `${f} ne mentionne pas l'exception des modèles importés`);
    });
  });
});

/**
 * JOURNAL DE MUTATION — dix fautes réintroduites, dans src/, dans main.js et dans preload.js.
 *
 *   S1  le retrait du chemin supprimé de sanitizeModelName (traversée de dossier)   ROUGE (5)
 *   S2  les points de tête conservés (« .. » passe)                                 ROUGE
 *   S3  collision de noms redevenue sensible à la casse                             ROUGE
 *   S4  un fichier vide accepté et rangé                                            ROUGE
 *   S5  doublon décidé sur le nom seul, sans comparer le contenu                    ROUGE
 *   S6  readModel rendant `r.data` sans vérifier `ok`                               ROUGE
 *   S7  la garde de main.js n'exclut plus les séparateurs de chemin                 ROUGE
 *   S8  models:write n'appelle plus la garde                                        ROUGE
 *   S9  les modèles rangés dans les données d'application, hors dossier de Projets  ROUGE
 *   S10 une méthode retirée de preload.js                                           ROUGE
 *
 * S1 ET S7 SONT LA MÊME FAUTE, vue des deux côtés — et c'est voulu. L'assainissement de src/ est
 * une commodité pour l'utilisateur ; la garde de main.js est ce qui protège le disque. Chacune est
 * épinglée séparément, parce qu'un défaut dans src/ ne doit pas pouvoir écrire hors du dossier des
 * modèles, et parce que la leçon de la campagne précédente est qu'une correction en profondeur
 * demande un test par couche.
 *
 * S9 mérite d'être notée : elle ne casse rien de visible en local. Elle ne se manifesterait qu'au
 * premier changement de machine, quand les Projets synchronisés arriveraient sans leurs modèles.
 * C'est exactement le genre de défaut qu'un essai à la main ne trouve jamais.
 */
