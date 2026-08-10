/**
 * tests/save-path.test.mjs — le chemin d'enregistrement et ses deux silences.
 *
 * Suite de tests/persisted-format.test.mjs, qui gardait le FORMAT. Celui-ci garde le MOMENT :
 * qu'un enregistrement raté se dise raté, et qu'une question posée à l'utilisateur reçoive
 * toujours une réponse.
 *
 * Les deux défauts épinglés ici ont été trouvés en écrivant ce fichier. Ils partagent une forme :
 * l'application continue comme si tout allait bien. Personne ne peut les voir en s'en servant —
 * c'est précisément pour cela qu'ils méritent des tests plutôt qu'un essai à la main.
 *
 * Hors de portée : l'écriture réelle sur disque (elle passe par window.storyboarderAPI, côté
 * Electron, cf. la règle n°1 d'architecture.md). On simule ce pont, et on vérifie ce que le code du
 * renderer FAIT du résultat — ce qui est justement là où les deux défauts se trouvaient.
 */
import './helpers/dom-stub.mjs';
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  writeProjectToPath, saveProjectFlow, confirmAction, alertAction, settleConfirmAction,
  startAutosave, stopAutosave,
} from '../src/io.js';
import { S } from '../src/state.js';

// Pont Electron simulé. `resultat` décide de ce que renvoie l'écriture ; `ecrits` garde la trace de
// ce qui est passé, pour vérifier qu'on n'écrit pas quand on ne devrait pas.
function pontElectron({ ok = true, erreur = null, canceled = false, filePath = '/tmp/p.json' } = {}) {
  const ecrits = [];
  globalThis.window = globalThis.window || {};
  window.storyboarderAPI = {
    writeProjectFile: async (chemin, contenu) => {
      ecrits.push({ chemin, taille: contenu.length });
      return ok ? { ok: true } : { ok: false, error: erreur || 'échec simulé' };
    },
    saveProjectAs: async () => ({ canceled, filePath }),
  };
  return ecrits;
}

beforeEach(() => {
  S.tomes = []; S.scenes = []; S.projectName = 'Projet';
  S.projectFilePath = null; S.projectFileHandle = null;
  S.projectDirty = true; S.confirmActionResolve = null;
  S.autosaveIntervalMs = 0; stopAutosave();
});
afterEach(() => { stopAutosave(); delete window.storyboarderAPI; });

describe('Enregistrement — un échec ne doit jamais passer pour un succès', () => {
  test('RÉGRESSION : une écriture ratée ne marque PAS le Projet comme enregistré', () => {
    // La garde la plus importante du lot. Si `projectDirty` retombait à faux sur un échec, la
    // sauvegarde automatique cesserait de réessayer (elle sort tôt quand rien n'est modifié) et la
    // confirmation à la fermeture ne s'afficherait plus. Le travail serait perdu à la fermeture,
    // sans un mot.
    pontElectron({ ok: false, erreur: 'disque plein' });
    S.projectFilePath = '/tmp/p.json';
    return writeProjectToPath('/tmp/p.json').then(ok => {
      assert.equal(ok, false, 'writeProjectToPath doit signaler l\'échec à son appelant');
      assert.equal(S.projectDirty, true, 'le Projet doit rester « modifié » après un échec');
    });
  });

  test('une écriture réussie, elle, marque bien le Projet comme enregistré', () => {
    // Le pendant : sans lui, le test précédent resterait vert en câblant `projectDirty = true` en
    // dur. Une garantie n'est démontrée que par sa paire.
    const ecrits = pontElectron({ ok: true });
    return writeProjectToPath('/tmp/p.json').then(ok => {
      assert.equal(ok, true);
      assert.equal(S.projectDirty, false);
      assert.equal(ecrits.length, 1, 'le contenu a bien été transmis au pont');
      assert.ok(ecrits[0].taille > 0, 'et il n\'est pas vide');
    });
  });

  test('RÉGRESSION : « Enregistrer sous » qui échoue n\'annonce pas « Projet enregistré »', async () => {
    // Défaut trouvé en écrivant ce fichier, et corrigé. Le message de succès était INCONDITIONNEL :
    // il s'affichait par-dessus le message d'échec que writeProjectToPath venait de poser. Sur un
    // disque plein ou un fichier en lecture seule, l'utilisateur lisait « Projet enregistré. » et
    // refermait la modale, satisfait.
    //
    // Ce défaut était invisible jusqu'à cette semaine : ces messages n'atteignaient l'écran par
    // aucun chemin (l'élément cible n'existait pas). Les rendre visibles a rendu celui-ci nuisible.
    // CE QU'ON OBSERVE, et pourquoi ce n'est pas le message. Ma première version lisait le
    // textContent de #projectModalStatus : le stub DOM ne le conserve pas, il rend toujours "".
    // L'assertion « le message ne dit pas succès » était donc vraie quoi qu'il arrive, et la
    // mutation qui réintroduit le défaut passait au vert. Un test qui n'observe rien est pire
    // qu'un test absent : il rassure.
    //
    // Ce qu'on observe à la place est la CONSÉQUENCE du défaut : sur un échec, le code annonçait
    // le succès ET démarrait la sauvegarde automatique sur un fichier qui n'existe pas.
    pontElectron({ ok: false, erreur: 'lecture seule' });
    S.autosaveIntervalMs = 60000;
    stopAutosave();
    const ok = await saveProjectFlow();
    assert.equal(ok, false, 'saveProjectFlow doit propager l\'échec');
    assert.equal(S.autosaveIntervalId, null,
      'la sauvegarde automatique a démarré sur un enregistrement qui a échoué');
  });

  test('un « Enregistrer sous » annulé n\'écrit rien et ne prétend rien', async () => {
    const ecrits = pontElectron({ canceled: true });
    const ok = await saveProjectFlow();
    assert.equal(ok, false);
    assert.deepEqual(ecrits, [], 'aucune écriture ne doit partir sur une annulation');
    assert.equal(S.projectDirty, true);
  });
});

describe('Confirmations — une question posée reçoit toujours une réponse', () => {
  test('RÉGRESSION : une confirmation en attente est réglée avant qu\'une autre s\'ouvre', async () => {
    // Défaut trouvé en écrivant ce fichier, et corrigé. S.confirmActionResolve était simplement
    // ÉCRASÉ : la première promesse ne se résolvait jamais. Le `await confirmAction(...)` qui la
    // portait ne rendait pas la main, et toute la suite — charger un projet, en créer un — était
    // abandonnée en silence. Rien ne levait, rien ne s'affichait ; l'application avait l'air de ne
    // pas avoir entendu.
    //
    // Atteignable en deux clics : « Nouveau projet » puis « Charger un projet », sur un Projet
    // modifié. Les deux demandent confirmation, et la modale est unique.
    let premiere = 'jamais réglée';
    const a = confirmAction('première').then(r => { premiere = r; });
    const b = confirmAction('seconde');
    settleConfirmAction(true);
    await Promise.all([a, b]);
    assert.notEqual(premiere, 'jamais réglée', 'la première promesse est restée pendante');
    assert.equal(premiere, false,
      'une confirmation qu\'on n\'a pas vue ne vaut pas accord : elle doit être réglée à « non »');
    assert.equal(await b, true, 'la seconde, elle, reçoit la réponse de l\'utilisateur');
  });

  test('alertAction règle aussi une confirmation en attente', async () => {
    // Même modale, même variable : le trou existait des deux côtés.
    let premiere = 'jamais réglée';
    const a = confirmAction('question').then(r => { premiere = r; });
    const b = alertAction('information');
    settleConfirmAction(true);
    await Promise.all([a, b]);
    assert.equal(premiere, false);
  });

  test('régler sans question en attente ne lève pas', () => {
    // Le bouton « Confirmer » reste cliquable si la modale est rouverte par un autre chemin.
    S.confirmActionResolve = null;
    assert.doesNotThrow(() => settleConfirmAction(true));
  });

  test('une confirmation isolée se comporte normalement', () => {
    // Le pendant : la correction ne doit pas régler prématurément la question EN COURS.
    const p = confirmAction('seule');
    settleConfirmAction(true);
    return p.then(r => assert.equal(r, true));
  });
});

describe('Sauvegarde automatique — un minuteur qui s\'arrête doit être voulu', () => {
  test('startAutosave remplace le minuteur précédent au lieu d\'en empiler un', () => {
    // Deux minuteurs actifs écriraient le fichier deux fois par période. startAutosave appelle
    // stopAutosave en entrée ; ce test empêche qu'on le retire en croyant l'appel redondant.
    S.autosaveIntervalMs = 60000;
    startAutosave();
    const premier = S.autosaveIntervalId;
    startAutosave();
    assert.notEqual(S.autosaveIntervalId, premier, 'le minuteur doit être remplacé');
    assert.ok(S.autosaveIntervalId, 'et un nouveau doit tourner');
  });

  test('un intervalle à 0 désactive la sauvegarde automatique, sans minuteur fantôme', () => {
    // 0 = désactivée depuis la Configuration. Le minuteur ne doit pas seulement ne rien faire : il
    // ne doit pas exister, sinon il réveille le processus pour rien toutes les minutes.
    S.autosaveIntervalMs = 60000;
    startAutosave();
    assert.ok(S.autosaveIntervalId);
    S.autosaveIntervalMs = 0;
    startAutosave();
    assert.equal(S.autosaveIntervalId, null, 'aucun minuteur ne doit subsister');
  });

  test('stopAutosave est idempotent', () => {
    S.autosaveIntervalMs = 60000;
    startAutosave();
    stopAutosave();
    assert.equal(S.autosaveIntervalId, null);
    assert.doesNotThrow(() => stopAutosave());
    assert.equal(S.autosaveIntervalId, null);
  });

  test('RÉGRESSION : le chemin d\'échec du chargement redémarre la sauvegarde automatique', () => {
    // Par inspection de source : loadExistingProjectFlow dépend d'une boîte de dialogue Electron
    // qu'on ne peut pas simuler jusqu'au bout ici. Ce qu'on épingle est la FORME — que chacun des
    // deux `catch` rallume le minuteur.
    //
    // Le défaut corrigé : stopAutosave() s'exécute AVANT la lecture, startAutosave() seulement en
    // cas de succès. Un fichier refusé laissait donc la sauvegarde automatique éteinte pour le
    // reste de la session, en silence, sur le Projet précédent resté ouvert.
    const src = readFileSync(new URL('../src/io.js', import.meta.url), 'utf8');
    const debut = src.indexOf('export async function loadExistingProjectFlow');
    const fin = src.indexOf('\nexport ', debut + 10);
    const corps = src.slice(debut, fin > 0 ? fin : src.length);

    // Ne comptent que les `catch` qui traitent un ÉCHEC DE CHARGEMENT — reconnus au message
    // qu'ils affichent. La fonction en contient un troisième, autour de requestPermission, dont ce
    // n'est pas le rôle : ma première version comptait les `catch` tout court et échouait sur
    // celui-là. Compter ce qui ressemble à la cible plutôt que la cible est une façon classique
    // d'obtenir un test qui a l'air rigoureux et ne l'est pas.
    const blocs = corps.split('} catch (').slice(1)
      .filter(b => b.includes('Could not load this project file'));
    assert.ok(blocs.length >= 2,
      `${blocs.length} chemin(s) d'échec de chargement trouvé(s) — la fonction a-t-elle changé ?`);
    blocs.forEach((b, i) => {
      const corpsDuCatch = b.slice(0, b.indexOf('setProjectModalStatus') + 200);
      assert.ok(corpsDuCatch.includes('startAutosave()'),
        `le chemin d'échec n°${i + 1} laisse la sauvegarde automatique éteinte`);
    });
  });
});
