/**
 * tests/menu-timing.test.mjs — quand un sous-menu disparaît, et pourquoi le délai a une seule
 * raison d'être.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * CE QUI EST TENU ICI, ET CE QUI NE PEUT PAS L'ÊTRE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Tenu : la politique de délai, la liste des menus à fermer, et le câblage qui les relie.
 *
 * ⚠️ PAS TENU : le RESSENTI. Que 250 ms soit la bonne grâce pour traverser 2 px, qu'un menu ne
 * clignote pas, qu'un survol rapide ne fasse pas défiler quatre sous-menus — cela se juge à la
 * souris. Ce fichier tient la règle, pas son confort, et la distinction est le genre de chose
 * qu'un test de ce dépôt doit avouer plutôt que masquer.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  DELAI_FERMETURE_MS, DELAIS_PAR_RAISON, delaiFermetureSousMenu3D, sousMenusAFermer3D,
} from '../src/menu-timing.js';

const EVENTS = readFileSync(new URL('../src/events.js', import.meta.url), 'utf8');

describe('Le délai ne s\'applique qu\'au DÉPART', () => {
  test('quitter le menu laisse la grâce, changer d\'entrée non', () => {
    // ⚠️ LA RÈGLE DE #418 EN UNE ASSERTION. Le délai existe pour traverser les 2 px entre une
    // entrée et son sous-menu ; il n'a rien à faire dans un changement d'entrée, qui est une
    // décision et pas une hésitation. C'est ce mélange qui laissait deux sous-menus superposés.
    assert.equal(delaiFermetureSousMenu3D('sortie'), DELAI_FERMETURE_MS);
    assert.equal(delaiFermetureSousMenu3D('frere'), 0);
    assert.equal(delaiFermetureSousMenu3D('autre-entree'), 0);
  });

  test('la grâce est réelle : elle n\'a pas été ramenée à zéro pour tout le monde', () => {
    // Le remède facile aurait été de raccourcir le délai partout. Il aurait cassé ce pour quoi le
    // délai existe, et laissé les menus superposés pendant ce qu'il en reste.
    assert.ok(DELAI_FERMETURE_MS >= 150,
      `${DELAI_FERMETURE_MS} ms : trop court pour traverser l'interstice`);
  });

  test('une raison inconnue rend le DÉLAI, jamais zéro', () => {
    // Fermer trop tard fait clignoter, fermer trop tôt rend le menu inatteignable. Entre deux
    // erreurs on garde celle qui laisse l'interface utilisable.
    for (const r of ['immediat', '', null, undefined, 0, {}, 'SORTIE']) {
      assert.equal(delaiFermetureSousMenu3D(r), DELAI_FERMETURE_MS, `raison ${String(r)}`);
    }
  });

  test('la table EST la logique : aucune raison n\'est traitée en dehors d\'elle', () => {
    // ⚠️ CE TEST VIENT D'UN REFUS DU DÉTECTEUR DE CODE MORT, et le refus était juste. La liste des
    // raisons était d'abord exportée à côté d'un `if` qui redisait la même règle : deux écritures
    // d'une même décision, donc deux occasions de diverger. Le détecteur l'a vue comme un export
    // sans appelant, ce qu'elle était.
    for (const [raison, attendu] of Object.entries(DELAIS_PAR_RAISON)) {
      assert.equal(delaiFermetureSousMenu3D(raison), attendu, `« ${raison} » ne suit plus la table`);
    }
    assert.deepEqual(Object.keys(DELAIS_PAR_RAISON).sort(), ['autre-entree', 'frere', 'sortie']);
  });
});

describe('Ouvrir un sous-menu ferme les autres, DESCENDANTS COMPRIS', () => {
  const GROUPES = [
    { cle: 'a', descendants: ['a1', 'a2'] },
    { cle: 'b', descendants: [] },
    { cle: 'c', descendants: ['c1'] },
  ];

  test('les frères se ferment, celui qui s\'ouvre reste', () => {
    const f = sousMenusAFermer3D('b', GROUPES);
    assert.ok(!f.includes('b'), 'le sous-menu qui s\'ouvre est dans la liste à fermer');
    assert.ok(f.includes('a') && f.includes('c'));
  });

  test('RÉGRESSION : les descendants d\'un frère fermé se ferment AUSSI', () => {
    // ⚠️ LE DÉTAIL QU'ON OUBLIE. Masquer « Ajouter » ne masque pas « Véhicules » : dans le
    // document, le sous-sous-menu est un FRÈRE, pas un enfant. Un sous-sous-menu resté seul à
    // l'écran, sans le menu qui l'a ouvert, est pire que deux menus superposés.
    const f = sousMenusAFermer3D('b', GROUPES);
    assert.ok(f.includes('a1') && f.includes('a2') && f.includes('c1'),
      `descendants oubliés : ${f.join(', ')}`);
  });

  test('les descendants de celui qui s\'ouvre sont ÉPARGNÉS', () => {
    // Sinon, revenir sur « Ajouter » refermerait la catégorie qu'on venait d'ouvrir.
    const f = sousMenusAFermer3D('a', GROUPES);
    assert.ok(!f.includes('a1') && !f.includes('a2'), 'ses propres descendants sont fermés');
  });

  test('sans sous-menu ouvert, tout se ferme', () => {
    // Le cas d'une entrée SANS sous-menu, survolée dans le même menu.
    const f = sousMenusAFermer3D(null, GROUPES);
    assert.deepEqual(f.sort(), ['a', 'a1', 'a2', 'b', 'c', 'c1']);
  });

  test('des entrées absurdes ne font pas tomber la fermeture', () => {
    assert.deepEqual(sousMenusAFermer3D('a', null), []);
    assert.deepEqual(sousMenusAFermer3D('a', undefined), []);
    assert.deepEqual(sousMenusAFermer3D('a', [null, { cle: 'b' }]), ['b']);
  });
});

describe('#418 : le câblage dans events.js', () => {
  /**
   * ⚠️ ÉPINGLÉ SUR LA SOURCE, ET C'EST ASSUMÉ. Ces gestionnaires vivent dans events.js, dépendent
   * du DOM réel et de vrais survols ; on ne peut pas les exécuter sous Node. La leçon de #417 est
   * toutefois retenue : la couche pure ne suffit pas, il faut au moins vérifier que le câblage
   * l'appelle, sinon une règle parfaite reste débranchée sans que rien ne le dise.
   */
  test('les QUATRE entrées à sous-menu ferment les autres en s\'ouvrant', () => {
    const attendu = {
      openAddSubmenu: 'addSubmenu',
      openLoadSceneSubmenu: 'loadSceneSubmenu',
      openTracerSubmenu: 'tracerSubmenu',
      openZoneSubmenu: 'zoneSubmenu',
    };
    for (const [fonction, cle] of Object.entries(attendu)) {
      const i = EVENTS.indexOf(`function ${fonction}(`);
      assert.ok(i > 0, `${fonction} est introuvable`);
      const corps = EVENTS.slice(i, EVENTS.indexOf('\n}', i));
      assert.match(corps, new RegExp(`fermerSousMenusDeCaseSauf3D\\('${cle}'\\)`),
        `${fonction} n'écarte pas ses frères : son sous-menu se superposera au précédent`);
    }
  });

  test('le registre couvre les quatre, et déclare les descendants d\'Ajouter et de Tracer', () => {
    const i = EVENTS.indexOf('const GROUPES_SOUS_MENUS_CASE_3D');
    assert.ok(i > 0, 'le registre a disparu');
    const bloc = EVENTS.slice(i, EVENTS.indexOf('];', i));
    ['addSubmenu', 'loadSceneSubmenu', 'tracerSubmenu', 'zoneSubmenu'].forEach(cle =>
      assert.ok(bloc.includes(`'${cle}'`), `« ${cle} » manque au registre`));
    // Les deux seuls qui ont des descendants. Les déclarer vides ferait revenir le sous-sous-menu
    // orphelin, et aucun test de la couche pure ne le verrait.
    assert.match(bloc, /addSubmenuL2Groups\.map/, 'les catégories d\'Ajouter ne sont plus suivies');
    assert.match(bloc, /cheminsTracéSubmenu/, 'les chemins de Tracer ne sont plus suivis');
    assert.match(bloc, /mursTracéSubmenu/, 'les murs de Tracer ne sont plus suivis');
  });

  test('survoler une entrée SANS sous-menu ferme tout', () => {
    // Le second geste qui laissait un menu ouvert : passer de « Ajouter » à « Caméra ». Rien ne le
    // fermait avant la fin de la minuterie.
    const i = EVENTS.indexOf("panelContextMenu.addEventListener('mouseover'");
    assert.ok(i > 0, 'l\'écouteur délégué du menu de Case a disparu');
    const corps = EVENTS.slice(i, EVENTS.indexOf('});', i));
    assert.match(corps, /fermerSousMenusDeCaseSauf3D\(null\)/,
      'survoler une entrée ordinaire ne ferme plus les sous-menus');
    assert.match(corps, /DECLENCHEURS_CASE_3D/,
      'les entrées à sous-menu ne sont plus exemptées : le menu se fermerait en s\'ouvrant');
  });

  test('RÉGRESSION : plus aucun délai de fermeture écrit en dur', () => {
    // Sept minuteries portaient le littéral 250. Une valeur répétée sept fois est une valeur qui
    // ne changera jamais partout à la fois.
    const enDur = [...EVENTS.matchAll(/setTimeout\([^;]*?,\s*250\s*\)/g)];
    assert.deepEqual(enDur.map(m => m[0].slice(0, 60)), []);
    assert.ok((EVENTS.match(/delaiFermetureSousMenu3D\('sortie'\)/g) || []).length >= 7,
      'les minuteries ne passent plus toutes par la politique');
  });
});

/**
 * JOURNAL DE MUTATION : six fautes réintroduites une à une. Résultats RÉELS :
 *
 *   M1 une seule des quatre ouvertures oublie de fermer ses frères (le défaut signalé)   ROUGE
 *   M2 les descendants ne sont plus fermés (le sous-sous-menu orphelin, couche pure)     ROUGE
 *   M3 le délai est appliqué au changement d'entrée (l'état d'avant #418)                ROUGE
 *   M4 le délai tombe à zéro partout (le remède facile, qui casse la traversée)          ROUGE
 *   M5 l'écouteur délégué ne ferme plus rien (« Ajouter » puis « Caméra »)               ROUGE
 *   M6 les descendants de Tracer disparaissent du registre (même faute, côté câblage)    ROUGE
 *
 * Six sur six, et M2 et M6 méritent d'être lues ensemble : c'est LA MÊME faute, une fois dans la
 * décision pure et une fois dans la table qu'on lui passe. La campagne de #417 avait laissé la
 * règle « un test par couche » après deux échappées ; elle a été appliquée d'emblée ici, et les
 * deux mutations tombent chacune sur son test.
 *
 * ⚠️ CE QUE LA CAMPAGNE NE DIT PAS : si le résultat est agréable à la souris. Aucune de ces six
 * mutations n'aurait été rattrapée par un test de ressenti, parce qu'il n'y en a pas et qu'il ne
 * peut pas y en avoir sous Node.
 */
