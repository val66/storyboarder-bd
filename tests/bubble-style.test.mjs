/**
 * tests/bubble-style.test.mjs — l'apparence d'une Bulle, avant tout dessin.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * CE QUI EST TENU ICI, ET CE QUI NE PEUT PAS L'ÊTRE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Tenu : la résolution des trois champs de #425a, leurs bornes, leurs défauts, et la garantie que
 * les Bulles déjà dessinées traversent le module sans rien changer. C'est du calcul sur des
 * valeurs, et cela se vérifie exactement.
 *
 * ⚠️ PAS TENU, ET IL FAUT LE DIRE : qu'un pointillé RESSEMBLE à un pointillé, qu'un tremblé ait
 * l'air tremblé, qu'une bulle à demi transparente reste lisible sur un décor chargé. Ce sont des
 * questions d'aspect, et docs/en/testing-method.md, § « Ce qui est hors de portée », dit comment on
 * y répond : en rendant l'image et en la regardant. Sur le chantier précédent, onze dessins avaient
 * du texte qui débordait sans qu'aucun test ne bronche.
 *
 * ⚠️ PAS TENU NON PLUS À CE STADE : que draw.js emploie réellement ces valeurs. La couche pure peut
 * être parfaite pendant que le réglage reste inerte — c'est exactement ce qui est arrivé en #420c
 * (mutation M19). Le test de câblage vit dans tests/draw.test.mjs et arrive avec #425b.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  BULLE_OPACITE_DEFAUT,
  TRAIT_PLEIN, TRAIT_POINTILLE, TRAIT_TIRETS, TRAIT_NET, TRAIT_TREMBLE,
  champsApparenceBulle, opaciteRemplissageBulle, motifTraitBulle, regulariteTraitBulle,
  tiretsTraitBulle, amplitudeTrembleBulle, apparenceBulle,
} from '../src/bubble-style.js';

/**
 * ⚠️ ASSERTION ÉCRITE ICI, ET PAS EXPORTÉE DEPUIS LE MODULE. Une première version publiait un
 * prédicat `apparenceBulleEstCelleDOrigine` dans src/. Deux choses l'ont condamné : le détecteur de
 * code mort l'a trouvé sans appelant dans l'application — il n'en aurait jamais eu, il n'existait
 * que pour les tests — et il redisait, en un second endroit, ce que les assertions ci-dessous
 * disent déjà. Il a d'ailleurs fallu un test SUPPLÉMENTAIRE pour l'empêcher de répondre toujours
 * vrai. Un garde-fou qui demande son propre garde-fou est une copie de trop.
 */
function estLApparenceDOrigine(o, largeur){
  const a = apparenceBulle(o, largeur);
  return a.opacite === 1 && a.tirets.length === 0 && a.tremble === 0;
}

/** Une Bulle telle qu'en produit un Projet enregistré avant ce chantier : aucun des trois champs. */
const bulleExistante = () => ({
  id: 'e1', type: 'bulle', x: 10, y: 20, w: 120, h: 60,
  description: 'Bonjour', bulleShape: 'ovale', bullePadding: 0.2, bulleFont: 'Comic Neue',
  tailAngle: 1.85, tailLen: 0.45,
});

describe('LA GARANTIE : une Bulle existante ne change pas d’aspect', () => {
  test('RÉGRESSION : sans aucun des trois champs, le rendu demandé est celui d’avant', () => {
    // ⚠️ LE TEST QUI PROTÈGE LES PROJETS DÉJÀ DESSINÉS, sur le modèle de #414b. Opaque, trait plein,
    // aucun tremblement : c'est exactement ce que drawBubble faisait avant #425a. Si un défaut est
    // modifié par inadvertance un jour, c'est ici que ça tombe, et le message dira lequel.
    for (const largeur of [1, 2.25, 3.5, 6]) {
      const a = apparenceBulle(bulleExistante(), largeur);
      assert.equal(a.opacite, 1, `opacité ${a.opacite} pour une largeur de ${largeur}`);
      assert.deepEqual(a.tirets, [], `tirets ${JSON.stringify(a.tirets)} pour ${largeur}`);
      assert.equal(a.tremble, 0, `tremblement ${a.tremble} pour ${largeur}`);
      assert.ok(estLApparenceDOrigine(bulleExistante(), largeur));
    }
  });

  test('un objet vide, et même null, traversent sans rien demander', () => {
    // Le dessin ne doit pas dépendre de la complétude de l'objet reçu : une Bulle en cours de
    // création n'a pas encore tous ses champs.
    for (const o of [null, undefined, {}, { bulleShape: 'rect' }]) {
      assert.ok(estLApparenceDOrigine(o, 2.25), `objet ${JSON.stringify(o)}`);
    }
  });

  test('les valeurs de départ annoncées SONT les défauts appliqués', () => {
    // Deux copies d'une même décision ne concordent que le jour où on les écrit. champsApparenceBulle
    // sert la fiche et les styles enregistrés ; si elle s'écartait des résolveurs, une Bulle neuve
    // n'aurait pas l'aspect d'une Bulle ancienne, pour des champs pourtant « par défaut ».
    const champs = champsApparenceBulle();
    assert.ok(estLApparenceDOrigine(champs, 2.25));
    assert.equal(champs.bulleFillOpacity, BULLE_OPACITE_DEFAUT);
  });
});

describe('L’opacité ne vaut que pour le remplissage', () => {
  test('0 est une valeur, pas une absence', () => {
    // ⚠️ LE PIÈGE DU TEST DE VÉRITÉ. `o.bulleFillOpacity || 1` rendrait 1 pour un fond volontairement
    // invisible — le cas de Jungle Juice sur fond sombre, relevé dans le corpus. Le champ absent et
    // le champ à zéro sont deux demandes différentes.
    assert.equal(opaciteRemplissageBulle({ bulleFillOpacity: 0 }), 0);
    assert.equal(opaciteRemplissageBulle({}), 1);
    assert.equal(opaciteRemplissageBulle({ bulleFillOpacity: null }), 1);
  });

  test('les valeurs hors bornes sont ramenées, les valeurs absurdes ignorées', () => {
    assert.equal(opaciteRemplissageBulle({ bulleFillOpacity: 1.8 }), 1);
    assert.equal(opaciteRemplissageBulle({ bulleFillOpacity: -3 }), 0);
    assert.equal(opaciteRemplissageBulle({ bulleFillOpacity: 0.42 }), 0.42);
    assert.equal(opaciteRemplissageBulle({ bulleFillOpacity: 'beaucoup' }), 1);
    assert.equal(opaciteRemplissageBulle({ bulleFillOpacity: NaN }), 1);
  });

  test('⚠️ UNE VALEUR, UN RÔLE : l’opacité ne touche ni le trait ni le tremblement', () => {
    // Faire porter une même valeur sur le fond ET sur le contour serait le défaut d'une valeur qui
    // sert deux rôles opposés : « poser une voix sur l'image » et « effacer la bulle » sont deux
    // demandes, et la seconde a déjà son réglage (« Afficher la bordure »).
    const transparente = { bulleFillOpacity: 0 };
    assert.deepEqual(tiretsTraitBulle(transparente, 2.25), []);
    assert.equal(amplitudeTrembleBulle(transparente, 2.25), 0);
  });
});

describe('Le motif du trait se mesure en épaisseurs, jamais en pixels fixes', () => {
  test('le trait plein ne pose aucun motif', () => {
    assert.deepEqual(tiretsTraitBulle({ bulleBorderDash: TRAIT_PLEIN }, 2.25), []);
    assert.deepEqual(tiretsTraitBulle({}, 2.25), []);
  });

  test('un motif inconnu retombe sur le trait plein, sans inventer', () => {
    assert.equal(motifTraitBulle({ bulleBorderDash: 'zigzag' }), TRAIT_PLEIN);
    assert.equal(regulariteTraitBulle({ bulleBorderRegularity: 'ondulé' }), TRAIT_NET);
  });

  test('⚠️ LE MOTIF S’AGRANDIT AVEC L’ÉPAISSEUR, il n’est pas en pixels fixes', () => {
    // ⚠️ MUTATION M6, ÉCHAPPÉE PUIS RATTRAPÉE. Ce test vérifiait d'abord que le RAPPORT plein/vide
    // restait constant d'une épaisseur à l'autre. Un motif en pixels fixes — [0.5, 4] quelle que
    // soit la largeur — a exactement ce rapport constant : la mutation passait au vert. Le rapport
    // était le MOYEN, pas l'intention. Ce qui compte est que les longueurs suivent l'épaisseur,
    // sinon le pointillé disparaît précisément sous le trait que l'utilisateur voulait plus visible.
    for (const motif of [TRAIT_POINTILLE, TRAIT_TIRETS]) {
      const fin = tiretsTraitBulle({ bulleBorderDash: motif }, 1);
      const epais = tiretsTraitBulle({ bulleBorderDash: motif }, 6);
      fin.forEach((v, i) => assert.ok(Math.abs(epais[i] / v - 6) < 1e-9,
        `${motif}, segment ${i} : ${v} → ${epais[i]}, soit ×${epais[i] / v} au lieu de ×6`));
    }
  });

  test('et le rapport plein/vide, lui, ne bouge pas d’une épaisseur à l’autre', () => {
    // L'autre moitié de l'intention : le motif garde le même ASPECT. Les deux assertions sont
    // nécessaires, et aucune ne suffit — la première laisse passer un motif fixe, la seconde
    // laisserait passer un motif qui grossirait en changeant de dessin.
    const rapport = (t) => t[0] / t[1];
    for (const motif of [TRAIT_POINTILLE, TRAIT_TIRETS]) {
      const r = [1, 2.25, 3.5, 6].map(w => rapport(tiretsTraitBulle({ bulleBorderDash: motif }, w)));
      r.forEach((v, i) => assert.ok(Math.abs(v - r[0]) < 1e-9,
        `${motif} : rapport ${v} à l'indice ${i}, contre ${r[0]} au premier`));
    }
  });

  test('le pointillé est plus court et plus espacé que les tirets', () => {
    // Sinon les deux valeurs donneraient la même image, et le choix n'en serait pas un.
    const p = tiretsTraitBulle({ bulleBorderDash: TRAIT_POINTILLE }, 2.25);
    const t = tiretsTraitBulle({ bulleBorderDash: TRAIT_TIRETS }, 2.25);
    assert.ok(p[0] < t[0], `plein du pointillé ${p[0]} contre ${t[0]} pour les tirets`);
    assert.ok(p[1] / p[0] > t[1] / t[0], 'le pointillé doit être proportionnellement plus espacé');
  });

  test('une largeur absente ou absurde ne produit pas de NaN dans le motif', () => {
    // Un NaN dans setLineDash fait disparaître le trait en silence, sur toutes les Bulles à la fois.
    for (const w of [undefined, null, 0, -4, NaN, 'épais']) {
      const t = tiretsTraitBulle({ bulleBorderDash: TRAIT_TIRETS }, w);
      t.forEach(v => assert.ok(Number.isFinite(v) && v > 0, `largeur ${w} → ${JSON.stringify(t)}`));
    }
  });
});

describe('Le tremblé est une perturbation de TRACÉ, pas de contour', () => {
  test('net rend zéro, tremblé rend une amplitude proportionnelle', () => {
    assert.equal(amplitudeTrembleBulle({ bulleBorderRegularity: TRAIT_NET }, 2.25), 0);
    assert.ok(amplitudeTrembleBulle({ bulleBorderRegularity: TRAIT_TREMBLE }, 2.25) > 0);
  });

  test('⚠️ IL NE REND QU’UN NOMBRE, JAMAIS UN POINT', () => {
    // Le test qui dit la contrainte d'architecture. bubbleEdgePoint porte à lui seul l'ancrage de la
    // queue, le hit-test de son glisser et le tracé continu qui saute l'arc sous la queue. Si le
    // tremblé se mettait à rendre des coordonnées, il finirait par déplacer le contour, et les trois
    // décrocheraient ensemble sans qu'aucun test de géométrie ne le voie.
    const v = amplitudeTrembleBulle({ bulleBorderRegularity: TRAIT_TREMBLE }, 3.5);
    assert.equal(typeof v, 'number');
    assert.ok(Number.isFinite(v));
  });

  test('l’amplitude suit l’épaisseur, pour rester visible sans déformer un filet fin', () => {
    const fin = amplitudeTrembleBulle({ bulleBorderRegularity: TRAIT_TREMBLE }, 1);
    const epais = amplitudeTrembleBulle({ bulleBorderRegularity: TRAIT_TREMBLE }, 6);
    assert.ok(epais > fin, `${epais} devrait dépasser ${fin}`);
  });
});

describe('Le regroupement compose, il ne recalcule pas', () => {
  test('apparenceBulle rend exactement ce que rendent les trois fonctions séparées', () => {
    // ⚠️ MUTATION M12, ÉCHAPPÉE PUIS RATTRAPÉE. Les cas d'abord retenus n'avaient QUE des valeurs
    // déjà valides : 0,3, 0, et le champ absent. Sur celles-là, lire le champ brut donne le même
    // résultat que le résoudre, et un regroupement qui recalculait à sa façon passait au vert. Il
    // faut donc des valeurs où la résolution CHANGE quelque chose — hors bornes, non numériques —
    // sinon le test ne compare que deux chemins qui ne peuvent pas différer.
    const cas = [
      { bulleFillOpacity: 0.3, bulleBorderDash: TRAIT_POINTILLE, bulleBorderRegularity: TRAIT_TREMBLE },
      { bulleFillOpacity: 0 },
      { bulleFillOpacity: 1.8 },
      { bulleFillOpacity: -3 },
      { bulleFillOpacity: 'beaucoup' },
      { bulleFillOpacity: NaN },
      { bulleBorderDash: TRAIT_TIRETS },
      { bulleBorderDash: 'zigzag', bulleBorderRegularity: 'ondulé' },
      {},
    ];
    for (const o of cas) {
      for (const w of [1, 2.25, 6]) {
        const a = apparenceBulle(o, w);
        assert.equal(a.opacite, opaciteRemplissageBulle(o));
        assert.deepEqual(a.tirets, tiretsTraitBulle(o, w));
        assert.equal(a.tremble, amplitudeTrembleBulle(o, w));
      }
    }
  });
});
