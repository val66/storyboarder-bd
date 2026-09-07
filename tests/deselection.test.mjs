/**
 * tests/deselection.test.mjs — un clic ailleurs désélectionne-t-il ?
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * CE QUI EST TENU ICI, ET CE QUI NE PEUT PAS L'ÊTRE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Tenu : la règle elle-même, et le fait que les trois gestionnaires l'appellent au lieu de la
 * réécrire chacun de son côté.
 *
 * ⚠️ PAS TENU : que `zoneDuClic3D` nomme la bonne zone. Elle interroge le DOM réel — imbrication
 * des panneaux, présence d'une modale — et ne s'exécute pas sous Node. La leçon de #417 est
 * appliquée d'emblée : le câblage est épinglé sur la source, faute de pouvoir être exécuté, et
 * c'est écrit plutôt que passé sous silence.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { clicDeselectionne3D, ZONES_SANS_DESELECTION } from '../src/deselection.js';

const EVENTS = readFileSync(new URL('../src/events.js', import.meta.url), 'utf8');

describe('#419 : la barre d\'outils AGIT sur le document, elle ne le quitte pas', () => {
  test('RÉGRESSION : Annuler, Enregistrer et Configuration ne désélectionnent plus une Case', () => {
    // ⚠️ LE DÉFAUT SIGNALÉ. Ces trois boutons agissent sur ce qui est sélectionné, ou sur le
    // Projet ; appuyer sur Annuler n'est pas « aller voir ailleurs ». L'entête est une barre
    // d'outils, pas une zone de dessin, et elle ne figurait dans aucune des trois listes.
    assert.equal(clicDeselectionne3D('entete'), false);
  });

  test('RÉGRESSION : la règle ne connaît plus la NATURE de la sélection', () => {
    // ⚠️ L'INCOHÉRENCE QUI A RÉVÉLÉ LE DÉFAUT : avec un Élément sélectionné, les mêmes boutons ne
    // désélectionnaient rien — non par décision, mais parce que le gestionnaire des Cases sortait
    // d'emblée quand la sélection n'en était pas une. Deux comportements opposés pour le même
    // geste, l'un voulu et l'autre accidentel.
    //
    // L'uniformité est désormais STRUCTURELLE et non vérifiée : la fonction ne reçoit plus de type,
    // donc elle ne peut plus répondre différemment selon lui. Ce test épingle cette absence, qui
    // est la garantie elle-même — une signature qui reprendrait un type rouvrirait la divergence.
    assert.equal(clicDeselectionne3D.length, 1, 'la règle a repris un paramètre de type');
    const src = readFileSync(new URL('../src/deselection.js', import.meta.url), 'utf8');
    assert.ok(!/typeSelection|MALGRE_TOUT/.test(src), 'une exception par nature est revenue');
  });

  test('les zones qui AGISSENT sur la sélection ne la retirent pas', () => {
    for (const zone of ['canevas', 'panneau-droit', 'menu-contextuel', 'modale-ouverte', 'entete']) {
      assert.equal(clicDeselectionne3D(zone), false, `« ${zone} » désélectionne`);
    }
  });

  test('cliquer VRAIMENT ailleurs désélectionne toujours', () => {
    // La promesse d'origine, celle qui est dans le manuel : cliquer en dehors de la Planche, dans
    // une zone sans Case ni Bulle, désélectionne. Elle ne doit pas avoir été perdue en chemin.
    assert.equal(clicDeselectionne3D('ailleurs'), true);
  });

  test('une zone inconnue désélectionne, plutôt que de retenir la sélection', () => {
    // Entre deux erreurs : une zone oubliée fait perdre une sélection, ce qui se voit et se
    // signale ; une zone exemptée par erreur donne une sélection qui refuse de partir, ce qui
    // ressemble à une panne.
    for (const z of ['menu-de-gauche', '', null, undefined, 42]) {
      assert.equal(clicDeselectionne3D(z), true, `zone ${String(z)}`);
    }
  });
});

describe('#419a : la Bulle est alignée sur le reste', () => {
  test('RÉGRESSION : Annuler et Enregistrer ne désélectionnent plus une Bulle', () => {
    // ⚠️ UNE DEMANDE PASSÉE A ÉTÉ LEVÉE PAR UNE NOUVELLE, et c'est écrit pour que personne ne
    // « répare » vers l'ancienne. Le commentaire d'origine citait : « cliquer en dehors la
    // désélectionne, même si le clic tombe hors du canevas (menu de gauche, entête, etc.) ». La
    // question a été reposée, la réponse est d'aligner. L'ancienne formulation a été remplacée
    // dans events.js plutôt que laissée à côté de la nouvelle règle.
    assert.equal(clicDeselectionne3D('entete'), false);
  });

  test('RÉGRESSION : l\'ancien commentaire ne subsiste pas à côté de la nouvelle règle', () => {
    // Deux textes qui se contredisent dans le même fichier, c'est la prochaine « correction » vers
    // le mauvais côté. Celui-ci nommait l'entête comme une zone qui désélectionne.
    assert.ok(!/deselects it, even if the click falls outside/.test(EVENTS),
      'l\'ancien commentaire de la Bulle est resté : il contredit la règle en vigueur');
  });

  test('la liste des zones exemptées n\'a pas fondu', () => {
    // Sur une liste vide, tout désélectionnerait et la moitié des tests ci-dessus passerait en
    // n'observant rien de la règle.
    assert.ok(ZONES_SANS_DESELECTION.length >= 5, `${ZONES_SANS_DESELECTION.length} zones`);
    assert.ok(ZONES_SANS_DESELECTION.includes('entete'), 'l\'entête est ressortie de la liste');
  });
});

describe('#419 : le câblage, et la fin des trois copies', () => {
  test('les TROIS gestionnaires passent par la règle partagée', () => {
    // C'était le fond du problème : la même liste recopiée trois fois, et l'entête absente des
    // trois. Un quatrième gestionnaire écrit demain doit passer par là, pas rouvrir une copie.
    const appels = [...EVENTS.matchAll(/clicDeselectionne3D\(zoneDuClic3D\(e\.target\)\)/g)];
    assert.equal(appels.length, 3, `${appels.length} gestionnaires passent par la règle, attendu 3`);
  });

  test('RÉGRESSION : plus aucune liste de zones recopiée dans les gestionnaires', () => {
    // La forme exacte des anciennes gardes. Leur retour signifierait qu'une quatrième copie de la
    // règle est née à côté de celle qu'on vient d'extraire.
    const copies = [...EVENTS.matchAll(/if \(rightPanel && rightPanel\.contains\(e\.target\)\) return;/g)];
    assert.deepEqual(copies.map(m => m[0]), []);
  });

  test('la modale est testée AVANT l\'endroit cliqué', () => {
    // ⚠️ C'EST UN ÉTAT, PAS UN ENDROIT, et il prime. `mousedown` précède `click` : sans cette
    // priorité, la sélection serait effacée sous les pieds du gestionnaire de la modale avant
    // qu'il ait pu s'exécuter. Le défaut serait invisible en lisant la liste des zones.
    const i = EVENTS.indexOf('function zoneDuClic3D(');
    assert.ok(i > 0, 'zoneDuClic3D est introuvable');
    const corps = EVENTS.slice(i, EVENTS.indexOf('\n}', i));
    assert.ok(corps.indexOf('modale-ouverte') < corps.indexOf('canevas'),
      'la modale n\'est plus prioritaire : une sélection sera effacée sous la modale');
  });

  test('l\'entête est bien reconnue comme une zone', () => {
    const i = EVENTS.indexOf('function zoneDuClic3D(');
    const corps = EVENTS.slice(i, EVENTS.indexOf('\n}', i));
    assert.match(corps, /querySelector\('header'\)/, 'l\'entête n\'est plus nommée');
    assert.match(corps, /return 'entete'/);
  });
});

/**
 * JOURNAL DE MUTATION (#419) : six fautes réintroduites une à une. Résultats RÉELS :
 *
 *   M1 l'entête ressort de la liste (le défaut signalé, tel quel)                  ROUGE (4 tests)
 *   M2 l'exception de la Bulle s'élargit au panneau droit                          ROUGE (2 tests)
 *   M3 une zone inconnue ne désélectionne plus                                     ROUGE
 *   M4 la modale perd sa priorité sur l'endroit cliqué                             ROUGE
 *   M5 un seul des trois gestionnaires rouvre une copie de la liste                ROUGE (2 tests)
 *   M6 l'entête n'est plus reconnue comme zone (elle retombe dans « ailleurs »)    ROUGE
 *
 * Six sur six. M1 et M6 sont la même faute vue à deux étages — la zone absente de la liste, et la
 * zone jamais nommée — et chacune tombe sur son test : la règle « un test par couche » de #417
 * a servi une deuxième fois.
 *
 * ⚠️ CE QUE LA CAMPAGNE NE DIT PAS : que `zoneDuClic3D` nomme la BONNE zone pour un clic réel.
 * L'imbrication des panneaux et la présence d'une modale se lisent dans le DOM, pas sous Node. Les
 * tests de câblage ci-dessus lisent la source ; ils verraient une zone retirée, pas une zone mal
 * détectée.
 */

/**
 * JOURNAL DE MUTATION (#419a) : la Bulle alignée, trois fautes de plus.
 *
 *   M7 l'exception par nature revient (table + paramètre de type)                       ROUGE
 *   M8 l'ancien commentaire de la Bulle est remis à côté de la nouvelle règle           ROUGE
 *   M9 un seul des trois gestionnaires garde un argument de type                        ROUGE
 *
 * ⚠️ CE QUE CETTE PETITE CAMPAGNE A CHANGÉ DANS LE CODE. En vidant la table d'exceptions, il
 * restait une mécanique complète — table, paramètre, recherche — pour zéro exception. Le dépôt a
 * déjà payé ce genre de généralité spéculative (#402). Le paramètre a donc été retiré : la règle ne
 * peut PLUS répondre différemment selon la nature de la sélection, ce qui vaut mieux qu'un test qui
 * vérifierait qu'elle ne le fait pas. M7 épingle cette absence.
 */
