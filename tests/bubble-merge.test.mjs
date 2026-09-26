/**
 * tests/bubble-merge.test.mjs — la FUSION de deux Bulles, moitié décision.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * CE QUI EST TENU ICI, ET CE QUI NE PEUT PAS L'ÊTRE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Tenu : qu'un contact se mesure sur les CONTOURS et non sur les boîtes, que les trois conditions
 * soient cumulatives, et surtout que la fusion transporte TOUT axe graphique — y compris ceux qui
 * n'existent pas encore.
 *
 * ⚠️ PAS TENU : qu'une Bulle fusionnée RESSEMBLE à une seule Bulle. L'effacement de la frontière
 * interne est une affaire de canevas, et #426c le jugera à l'écran. Voir docs/en/testing-method.md.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  FUSIONNABLE_DEFAUT, ECHANTILLONS_CONTACT,
  bulleEstFusionnable3D, pointDansLaBulle3D, bullesEnContact3D, groupeDeLaBulle3D,
  fusionPossible3D, champsTransportesParLaFusion3D, instantaneDeFusion3D,
  CHAMPS_PROPRES_AU_LOBE,
} from '../src/bubble-merge.js';
import { formesConnues } from '../src/bubble-shape.js';

/** Une Bulle fusionnable, posée où on veut. */
const bulle = (o) => Object.assign({
  id: 'b1', type: 'bulle', x: 0, y: 0, w: 200, h: 100,
  description: '', bulleShape: 'ovale', bulleFusionnable: true,
}, o);

describe('LA GARANTIE : aucune Bulle enregistrée ne fusionne toute seule', () => {
  /**
   * ⚠️ DES BULLES SE CHEVAUCHENT DANS PRESQUE TOUTES LES PLANCHES — c'est la façon ordinaire de
   * serrer un dialogue. Une fusion automatique les aurait toutes soudées à la première ouverture
   * d'un Projet. Le réglage doit donc être demandé DEUX fois, une par Bulle.
   */
  test('le défaut est DÉCOCHÉ, et un champ absent vaut décoché', () => {
    assert.equal(FUSIONNABLE_DEFAUT, false);
    assert.equal(bulleEstFusionnable3D({}), false);
    assert.equal(bulleEstFusionnable3D({ bulleFusionnable: undefined }), false);
    assert.equal(bulleEstFusionnable3D(null), false);
  });

  /**
   * ⚠️ TROIS MUTANTS ÉQUIVALENTS CONSIGNÉS ICI, ET ILS N'EN FONT QU'UN. Remplacer
   * `return FUSIONNABLE_DEFAUT` par `return false`, écrire `FUSIONNABLE_DEFAUT || !!v`, ou lire
   * `!!sel.bulleFusionnable` dans la fiche au lieu de l'accesseur : les trois laissent la suite
   * verte, et c'est JUSTE. La constante vaut `false`, exactement ce que l'alternative codée en dur
   * produit — aucune observation extérieure ne peut distinguer les deux.
   *
   * C'est la même impossibilité que `GRIS_NEUTRE` en #431b1, résolue là-bas en comparant DEUX
   * sources. Ici il n'y en a qu'une : rien à comparer. Ajouter un paramètre de défaut à
   * `bulleEstFusionnable3D` les tuerait, au prix d'une API que personne n'appellerait autrement —
   * un test qui protège une contorsion écrite pour lui.
   *
   * L'indirection reste la bonne écriture : le jour où le défaut changerait, un seul endroit
   * bougerait. Ce que la campagne dit, c'est qu'on ne peut pas le PROUVER tant qu'il ne change pas.
   * Le test ci-dessous fige donc la valeur, ce qui attrape le seul changement observable.
   */

  /**
   * ⚠️ ET C'EST LA CONSTANTE QUI GOUVERNE, pas une valeur réécrite dans l'accesseur. Sans ce test,
   * `FUSIONNABLE_DEFAUT` pourrait valoir n'importe quoi sans qu'aucune assertion ne bronche : le
   * défaut serait dit à deux endroits et fait à un seul. On vérifie donc que le champ ABSENT rend
   * exactement la constante, quelle qu'elle soit.
   */
  test('un champ absent rend la constante elle-même', () => {
    assert.equal(bulleEstFusionnable3D({}), FUSIONNABLE_DEFAUT);
    // Et une valeur EXPLICITE l'emporte sur le défaut, dans les deux sens.
    assert.equal(bulleEstFusionnable3D({ bulleFusionnable: true }), true);
    assert.equal(bulleEstFusionnable3D({ bulleFusionnable: false }), false);
  });

  test('deux Bulles superposées ne fusionnent pas si l’une ne le demande pas', () => {
    const a = bulle({ id: 'a' });
    const b = bulle({ id: 'b', x: 10 });
    assert.equal(fusionPossible3D(a, b).possible, true, 'la fixture doit être en contact');
    for (const champs of [{ bulleFusionnable: false }, {}]) {
      const muette = Object.assign({}, b, champs);
      delete muette.bulleFusionnable;
      if (champs.bulleFusionnable === false) muette.bulleFusionnable = false;
      const r = fusionPossible3D(a, muette);
      assert.equal(r.possible, false);
      assert.equal(r.raison, 'non-fusionnable');
    }
  });
});

describe('pointDansLaBulle3D — exacte, parce que toute forme est étoilée', () => {
  test('le centre est toujours dedans, quelle que soit la forme', () => {
    for (const forme of formesConnues()) {
      const o = bulle({ bulleShape: forme });
      assert.equal(pointDansLaBulle3D(o, o.x + o.w / 2, o.y + o.h / 2), true, forme);
    }
  });

  test('un point très lointain est toujours dehors', () => {
    for (const forme of formesConnues()) {
      assert.equal(pointDansLaBulle3D(bulle({ bulleShape: forme }), 9000, 9000), false, forme);
    }
  });

  /**
   * ⚠️ LE TEST QUI DISTINGUE LE CONTOUR DE LA BOÎTE. Pour une forme creuse — l'étoile, l'écu, la
   * couronne d'épines —, un COIN de la boîte englobante est hors de la forme. Si cette fonction
   * répondait « dedans » sur un coin, elle mesurerait la boîte et tout le reste serait faux.
   */
  test('les coins de la boîte sont DEHORS pour les formes creuses', () => {
    const creuses = ['etoile', 'epines', 'ecu'].filter(f => formesConnues().includes(f));
    assert.ok(creuses.length, 'la fixture suppose au moins une forme creuse au registre');
    for (const forme of creuses) {
      const o = bulle({ bulleShape: forme });
      const coins = [[o.x, o.y], [o.x + o.w, o.y], [o.x, o.y + o.h], [o.x + o.w, o.y + o.h]];
      const dedans = coins.filter(([x, y]) => pointDansLaBulle3D(o, x, y));
      assert.equal(dedans.length, 0, `« ${forme} » : ${dedans.length} coin(s) déclarés dedans`);
    }
  });
});

describe('bullesEnContact3D — sur les contours, dans les deux sens', () => {
  test('deux Bulles éloignées ne se touchent pas', () => {
    assert.equal(bullesEnContact3D(bulle({ id: 'a' }), bulle({ id: 'b', x: 900 })), false);
  });

  test('deux Bulles qui se chevauchent se touchent', () => {
    assert.equal(bullesEnContact3D(bulle({ id: 'a' }), bulle({ id: 'b', x: 150 })), true);
  });

  /**
   * ⚠️ LES DEUX SENS, PLUS LES CENTRES. Les échantillons d'un contour peuvent tous être hors de
   * l'autre dans deux cas opposés : une petite Bulle entièrement CONTENUE dans une grande, et
   * l'inverse. N'éprouver qu'un sens laisserait passer une Bulle posée au milieu d'une autre — et
   * c'est le cas le plus évident à l'œil.
   */
  test('une Bulle entièrement contenue dans une autre se touche, dans les deux sens', () => {
    const grande = bulle({ id: 'g', x: 0, y: 0, w: 400, h: 400 });
    const petite = bulle({ id: 'p', x: 180, y: 180, w: 40, h: 40 });
    assert.equal(bullesEnContact3D(grande, petite), true, 'grande puis petite');
    assert.equal(bullesEnContact3D(petite, grande), true, 'petite puis grande');
  });

  /**
   * ⚠️ LE TEST QUI JUSTIFIE DE NE PAS PRENDRE LES BOÎTES. Deux étoiles posées en diagonale ont des
   * boîtes qui se croisent franchement, alors qu'un vide sépare leurs branches. Fusionner là serait
   * incompréhensible — et c'est le piège exact que #425e avait rencontré avec les encarts.
   */
  test('deux formes creuses aux boîtes croisées mais aux branches disjointes NE se touchent pas', () => {
    if (!formesConnues().includes('etoile')) return;
    const a = bulle({ id: 'a', bulleShape: 'etoile', x: 0, y: 0, w: 200, h: 200 });
    const b = bulle({ id: 'b', bulleShape: 'etoile', x: 185, y: 185, w: 200, h: 200 });
    // Les boîtes se croisent : la fixture ne prouverait rien sinon.
    const croisent = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    assert.ok(croisent, 'la fixture suppose des boîtes qui se croisent');
    assert.equal(bullesEnContact3D(a, b), false,
      'le contact est mesuré sur les boîtes : deux étoiles fusionneraient par le vide');
  });

  test('l’échantillonnage est le même pour les deux contours', () => {
    assert.ok(ECHANTILLONS_CONTACT >= 32, `${ECHANTILLONS_CONTACT} points : trop grossier`);
    // Un contact franc reste vu même avec très peu d'échantillons : c'est le cas facile.
    assert.equal(bullesEnContact3D(bulle({ id: 'a' }), bulle({ id: 'b', x: 150 }), 8), true);
  });
});

describe('fusionPossible3D — trois conditions, et la RAISON du refus', () => {
  /**
   * ⚠️ LA RAISON EST RENDUE, PAS SEULEMENT LE VERDICT. « Rien ne se passe quand je les rapproche »
   * est une question qu'on ne peut pas résoudre sans savoir LAQUELLE des trois conditions manque.
   * Un booléen suffirait au geste et laisserait l'utilisateur sans recours.
   */
  test('chaque refus dit ce qui manque, et les raisons diffèrent', () => {
    const a = bulle({ id: 'a' });
    const raisons = new Set();
    raisons.add(fusionPossible3D(a, a).raison);
    raisons.add(fusionPossible3D(a, bulle({ id: 'b', bulleFusionnable: false, x: 10 })).raison);
    raisons.add(fusionPossible3D(a, bulle({ id: 'b', x: 900 })).raison);
    raisons.add(fusionPossible3D(
      Object.assign(bulle({ id: 'a' }), { bulleGroupe: 'g1' }),
      Object.assign(bulle({ id: 'b', x: 10 }), { bulleGroupe: 'g1' })).raison);
    assert.equal(raisons.size, 4, `quatre refus mais ${raisons.size} raison(s) distincte(s)`);
    assert.ok(!raisons.has(null));
  });

  test('deux Bulles déjà dans le MÊME groupe ne refusionnent pas', () => {
    const a = Object.assign(bulle({ id: 'a' }), { bulleGroupe: 'g1' });
    const b = Object.assign(bulle({ id: 'b', x: 10 }), { bulleGroupe: 'g1' });
    assert.equal(fusionPossible3D(a, b).raison, 'deja-fusionnees');
  });

  /**
   * ⚠️ MAIS DEUX GROUPES DIFFÉRENTS, EUX, PEUVENT SE REJOINDRE. C'est la conséquence directe du
   * modèle à N lobes : refuser ici enfermerait chaque groupe à deux, et il faudrait tout reprendre
   * le jour où trois Bulles doivent n'en faire qu'une.
   */
  test('deux groupes distincts peuvent fusionner', () => {
    const a = Object.assign(bulle({ id: 'a' }), { bulleGroupe: 'g1' });
    const b = Object.assign(bulle({ id: 'b', x: 10 }), { bulleGroupe: 'g2' });
    assert.equal(fusionPossible3D(a, b).possible, true);
  });

  test('une Bulle seule n’appartient à aucun groupe', () => {
    assert.equal(groupeDeLaBulle3D(bulle({})), null);
    assert.equal(groupeDeLaBulle3D({}), null);
    assert.equal(groupeDeLaBulle3D(null), null);
    assert.equal(groupeDeLaBulle3D(bulle({ bulleGroupe: 'g7' })), 'g7');
  });

  test('une Bulle ne fusionne pas avec elle-même', () => {
    const a = bulle({ id: 'a' });
    assert.equal(fusionPossible3D(a, a).raison, 'meme');
    assert.equal(fusionPossible3D(a, bulle({ id: 'a', x: 5 })).raison, 'meme');
  });
});

describe('⚠️ CE QUE LA FUSION TRANSPORTE SE DÉFINIT PAR EXCLUSION', () => {
  /**
   * ⚠️ LE TEST QUI PROTÈGE LES AXES À VENIR, ET LA RAISON D'ÊTRE DE TOUT CE BLOC. Énumérer ce que
   * la fusion transporte — forme, couleur, bordure, texture, particule, police… — donnerait une
   * liste qui s'allonge à chaque axe et se périme EN SILENCE : un axe oublié ne se transporterait
   * pas, la Bulle fusionnée garderait deux apparences par endroits, et rien ne dirait pourquoi.
   *
   * Ce chantier a ajouté sept axes en quelques tâches. Une énumération aurait déjà divergé.
   */
  test('un axe graphique INCONNU se transporte quand même', () => {
    const source = bulle({ id: 'a', bulleMarbrure: 'ondee', bulleReflet: 0.4 });
    const porte = champsTransportesParLaFusion3D(source);
    assert.equal(porte.bulleMarbrure, 'ondee',
      'un axe ajouté demain ne se transporterait pas : la liste est une énumération');
    assert.equal(porte.bulleReflet, 0.4);
  });

  test('et la géométrie, l’identité et le texte ne se transportent JAMAIS', () => {
    const source = bulle({ id: 'a', x: 7, y: 9, w: 11, h: 13, z: 3, description: 'salut' });
    const porte = champsTransportesParLaFusion3D(source);
    for (const interdit of ['id', 'type', 'x', 'y', 'w', 'h', 'z', 'description']) {
      assert.ok(!(interdit in porte), `« ${interdit} » s’est transporté`);
    }
  });

  /**
   * ⚠️ `description` EST PROPRE AU LOBE, ET C'EST TOUT LE SENS DE « DEUX ZONES DE TEXTE ». Une
   * fusion unifie l'apparence, jamais la parole : c'est la seule chose que les deux Bulles avaient
   * à dire séparément. La transporter écraserait une réplique par l'autre.
   */
  test('le texte de chaque lobe lui reste', () => {
    assert.ok(CHAMPS_PROPRES_AU_LOBE.includes('description'));
    const porte = champsTransportesParLaFusion3D(bulle({ description: 'première réplique' }));
    assert.equal(porte.description, undefined);
  });

  /**
   * ⚠️ ET LES CHAMPS DE LA FUSION ELLE-MÊME NE SE TRANSPORTENT PAS, sans quoi elle se mangerait la
   * queue : transporter `bulleGroupe` écraserait le groupe du lobe d'accueil, et transporter
   * `bulleAvantFusion` remplacerait sa mémoire par celle de l'autre — la séparation rendrait alors
   * à chaque lobe les réglages de son voisin.
   */
  test('les champs de la fusion ne se transportent pas', () => {
    const source = bulle({ bulleGroupe: 'g1', bulleAvantFusion: { bulleColor: '#fff' } });
    const porte = champsTransportesParLaFusion3D(source);
    assert.equal(porte.bulleGroupe, undefined);
    assert.equal(porte.bulleAvantFusion, undefined);
    assert.equal(porte.bulleFusionnable, undefined,
      'la case elle-même reste propre à la Bulle qui l’a cochée');
  });
});

describe('instantaneDeFusion3D — ce qu’un lobe garde pour redevenir lui-même', () => {
  /**
   * ⚠️ IL NE MÉMORISE QUE CE QUE LA FUSION VA ÉCRASER, et garder le lobe entier serait plus simple
   * et faux. La géométrie change APRÈS la fusion — on déplace le groupe — et la rendre au moment de
   * la séparation ferait sauter les lobes à leur position d'il y a dix minutes.
   */
  test('il ne contient aucune géométrie', () => {
    const memo = instantaneDeFusion3D(bulle({ x: 7, y: 9, w: 11, h: 13 }));
    for (const geo of ['x', 'y', 'w', 'h']) {
      assert.ok(!(geo in memo), `« ${geo} » mémorisé : la séparation ferait sauter le lobe`);
    }
  });

  /**
   * ⚠️ CE QU'IL MÉMORISE EST EXACTEMENT CE QUI SE TRANSPORTE, et pas « à peu près ». Les deux
   * ensembles doivent coïncider : un champ écrasé sans être mémorisé serait perdu à la séparation,
   * un champ mémorisé sans être écrasé rendrait une valeur périmée. Écrire deux listes voisines,
   * c'est la « seconde source » que ce dépôt traque — on en dérive donc une de l'autre.
   */
  test('il recouvre exactement ce que la fusion écrase', () => {
    const lobe = bulle({ bulleColor: '#123456', bulleShape: 'etoile', bulleAxeFutur: 42 });
    assert.deepEqual(
      Object.keys(instantaneDeFusion3D(lobe)).sort(),
      Object.keys(champsTransportesParLaFusion3D(lobe)).sort());
  });

  test('et il garde les valeurs, pas seulement les noms', () => {
    const memo = instantaneDeFusion3D(bulle({ bulleColor: '#123456', bulleShape: 'etoile' }));
    assert.equal(memo.bulleColor, '#123456');
    assert.equal(memo.bulleShape, 'etoile');
  });
});
