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

import {
  clicDeselectionne3D, ZONES_SANS_DESELECTION, ZONES_QUI_DESELECTIONNENT_MALGRE_TOUT,
} from '../src/deselection.js';

const EVENTS = readFileSync(new URL('../src/events.js', import.meta.url), 'utf8');

describe('#419 : la barre d\'outils AGIT sur le document, elle ne le quitte pas', () => {
  test('RÉGRESSION : Annuler, Enregistrer et Configuration ne désélectionnent plus une Case', () => {
    // ⚠️ LE DÉFAUT SIGNALÉ. Ces trois boutons agissent sur ce qui est sélectionné, ou sur le
    // Projet ; appuyer sur Annuler n'est pas « aller voir ailleurs ». L'entête est une barre
    // d'outils, pas une zone de dessin, et elle ne figurait dans aucune des trois listes.
    assert.equal(clicDeselectionne3D('entete', 'panel'), false);
  });

  test('RÉGRESSION : l\'ÉLÉMENT et la Case répondent enfin pareil', () => {
    // ⚠️ L'INCOHÉRENCE QUI A RÉVÉLÉ LE DÉFAUT. Avec un Élément sélectionné, les mêmes boutons ne
    // désélectionnaient rien — non par décision, mais parce que le gestionnaire des Cases sortait
    // d'emblée quand la sélection n'en était pas une. Deux comportements opposés pour le même
    // geste, l'un voulu et l'autre accidentel, et rien pour dire lequel était lequel.
    assert.equal(clicDeselectionne3D('entete', 'perso'), clicDeselectionne3D('entete', 'panel'));
    assert.equal(clicDeselectionne3D('entete', 'objet3d'), false);
    assert.equal(clicDeselectionne3D('entete', 'scene'), false);
  });

  test('les zones qui AGISSENT sur la sélection ne la retirent pas', () => {
    for (const zone of ['canevas', 'panneau-droit', 'menu-contextuel', 'modale-ouverte', 'entete']) {
      assert.equal(clicDeselectionne3D(zone, 'panel'), false, `« ${zone} » désélectionne`);
    }
  });

  test('cliquer VRAIMENT ailleurs désélectionne toujours', () => {
    // La promesse d'origine, celle qui est dans le manuel : cliquer en dehors de la Planche, dans
    // une zone sans Case ni Bulle, désélectionne. Elle ne doit pas avoir été perdue en chemin.
    assert.equal(clicDeselectionne3D('ailleurs', 'panel'), true);
    assert.equal(clicDeselectionne3D('ailleurs', 'bulle'), true);
    assert.equal(clicDeselectionne3D('ailleurs', 'scene'), true);
  });

  test('une zone inconnue désélectionne, plutôt que de retenir la sélection', () => {
    // Entre deux erreurs : une zone oubliée fait perdre une sélection, ce qui se voit et se
    // signale ; une zone exemptée par erreur donne une sélection qui refuse de partir, ce qui
    // ressemble à une panne.
    for (const z of ['menu-de-gauche', '', null, undefined, 42]) {
      assert.equal(clicDeselectionne3D(z, 'panel'), true, `zone ${String(z)}`);
    }
  });
});

describe('L\'exception de la Bulle est DÉCLARÉE, pas dispersée', () => {
  test('la Bulle continue de se désélectionner depuis l\'entête', () => {
    // ⚠️ ELLE REPOSE SUR UNE DEMANDE PASSÉE EXPLICITE, citée dans le commentaire d'origine :
    // « cliquer en dehors la désélectionne, même si le clic tombe hors du canevas (menu de gauche,
    // entête, etc.) ». On ne défait pas une demande sans qu'elle soit reposée. La divergence est
    // donc écrite à un seul endroit au lieu d'être enfouie dans trois gestionnaires.
    assert.equal(clicDeselectionne3D('entete', 'bulle'), true);
  });

  test('et elle ne déborde PAS sur les autres zones', () => {
    // Une exception qui s'élargirait en silence serait pire que pas d'exception du tout.
    for (const zone of ['canevas', 'panneau-droit', 'menu-contextuel', 'modale-ouverte']) {
      assert.equal(clicDeselectionne3D(zone, 'bulle'), false, `« ${zone} » pour une Bulle`);
    }
  });

  test('le garde-fou : l\'exception ne concerne QUE la Bulle, et QUE l\'entête', () => {
    // Le jour où la réponse tombe, il suffit de vider la table. Ce test dit son état actuel, pour
    // qu'un élargissement ne passe pas inaperçu.
    assert.deepEqual(Object.keys(ZONES_QUI_DESELECTIONNENT_MALGRE_TOUT), ['bulle']);
    assert.deepEqual(ZONES_QUI_DESELECTIONNENT_MALGRE_TOUT.bulle, ['entete']);
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
    const appels = [...EVENTS.matchAll(/clicDeselectionne3D\(zoneDuClic3D\(e\.target\), '(\w+)'\)/g)]
      .map(m => m[1]);
    assert.deepEqual(appels.sort(), ['bulle', 'panel', 'scene']);
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
 * JOURNAL DE MUTATION : six fautes réintroduites une à une. Résultats RÉELS :
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
