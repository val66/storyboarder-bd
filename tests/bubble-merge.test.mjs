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
  CHAMPS_PROPRES_AU_LOBE, fusionner3D, separer3D, clePaire3D, candidateDeFusion3D, refusPerimes3D,
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

describe('fusionner3D — ce que le groupe devient', () => {
  const a = () => bulle({ id: 'a', bulleColor: '#AAAAAA', bulleShape: 'ovale', description: 'un' });
  const b = () => bulle({ id: 'b', bulleColor: '#BBBBBB', bulleShape: 'etoile', description: 'deux' });

  test('les deux lobes prennent l’apparence de la source et le même groupe', () => {
    const [x, y] = fusionner3D([a(), b()], a(), 'g1');
    assert.equal(x.bulleColor, '#AAAAAA');
    assert.equal(y.bulleColor, '#AAAAAA', 'le second lobe n’a pas pris la couleur de la source');
    assert.equal(y.bulleShape, 'ovale');
    assert.equal(x.bulleGroupe, 'g1');
    assert.equal(y.bulleGroupe, 'g1');
  });

  /**
   * ⚠️ DEUX ZONES DE TEXTE, PAS UNE : c'est tout le sens de la fusion telle qu'elle a été demandée.
   * Une fusion unifie l'apparence, jamais la parole.
   */
  test('chaque lobe garde son texte', () => {
    const [x, y] = fusionner3D([a(), b()], a(), 'g1');
    assert.equal(x.description, 'un');
    assert.equal(y.description, 'deux');
  });

  test('et sa géométrie', () => {
    const grand = bulle({ id: 'b', x: 300, y: 40, w: 90, h: 55 });
    const [, y] = fusionner3D([a(), grand], a(), 'g1');
    assert.deepEqual([y.x, y.y, y.w, y.h], [300, 40, 90, 55]);
  });

  /**
   * ⚠️ LA MÉMOIRE EST PRISE AVANT L'ÉCRASEMENT, sans quoi elle enregistrerait l'apparence de la
   * source — et « séparer » rendrait à chaque lobe le style de l'autre, ce qui ne défait rien.
   */
  test('chaque lobe mémorise ce qu’il était AVANT', () => {
    const [x, y] = fusionner3D([a(), b()], a(), 'g1');
    assert.equal(x.bulleAvantFusion.bulleColor, '#AAAAAA');
    assert.equal(y.bulleAvantFusion.bulleColor, '#BBBBBB',
      'la mémoire a été prise après l’écrasement : elle ne défait rien');
    assert.equal(y.bulleAvantFusion.bulleShape, 'etoile');
  });

  /**
   * ⚠️ ET LA PLUS ANCIENNE MÉMOIRE GAGNE. Un lobe déjà fusionné porte l'instantané de SA première
   * fusion : le garder fait que « séparer » ramène à l'état d'origine. Autrement, une chaîne de
   * trois fusions demanderait trois séparations pour revenir au point de départ — ce qu'aucune
   * interface n'annonce, et que personne n'attend d'un bouton unique.
   */
  test('une seconde fusion ne remplace pas la mémoire de la première', () => {
    const premiers = fusionner3D([a(), b()], a(), 'g1');
    const seconds = fusionner3D(premiers, bulle({ id: 'c', bulleColor: '#CCCCCC' }), 'g2');
    assert.equal(seconds[1].bulleColor, '#CCCCCC', 'la seconde fusion doit bien imposer son style');
    assert.equal(seconds[1].bulleAvantFusion.bulleColor, '#BBBBBB',
      'la mémoire d’origine a été écrasée : on ne peut plus revenir au point de départ');
  });

  test('la source peut être extérieure au groupe', () => {
    const dehors = bulle({ id: 'z', bulleColor: '#0F0F0F' });
    const [x, y] = fusionner3D([a(), b()], dehors, 'g1');
    assert.equal(x.bulleColor, '#0F0F0F');
    assert.equal(y.bulleColor, '#0F0F0F');
  });

  /**
   * ⚠️ PURE : LES OBJETS D'ORIGINE NE BOUGENT PAS. Le dessin garde des références sur les Bulles ;
   * les muter en place ferait changer la planche avant que l'utilisateur ait confirmé quoi que ce
   * soit, et un refus n'aurait plus rien à annuler.
   */
  test('elle ne modifie pas les lobes qu’on lui donne', () => {
    const original = a();
    fusionner3D([original, b()], b(), 'g1');
    assert.equal(original.bulleColor, '#AAAAAA');
    assert.equal(original.bulleGroupe, undefined);
    assert.equal(original.bulleAvantFusion, undefined);
  });
});

describe('⚠️ UN REFUS SE MÉMORISE, PUIS S’OUBLIE', () => {
  /**
   * ⚠️ LES DEUX MOITIÉS SONT INDISPENSABLES, ET ELLES S'OPPOSENT. Sans la mémoire, la question
   * reviendrait à chaque mouvement de souris — la façon la plus sûre de rendre une confirmation
   * haïssable. Sans l'oubli, deux Bulles refusées une fois ne pourraient PLUS JAMAIS fusionner, et
   * rien à l'écran ne l'expliquerait : la case resterait cochée des deux côtés, les contours se
   * toucheraient, et il ne se passerait rien.
   */
  test('la clé d’une paire ne dépend pas de l’ordre', () => {
    const a = bulle({ id: 'a' }), b = bulle({ id: 'b' });
    assert.equal(clePaire3D(a, b), clePaire3D(b, a),
      'refuser en glissant A sur B puis B sur A poserait deux fois la question');
  });

  test('une paire refusée n’est plus proposée', () => {
    const a = bulle({ id: 'a' }), b = bulle({ id: 'b', x: 10 });
    assert.equal(candidateDeFusion3D(a, [a, b], new Set()), b);
    assert.equal(candidateDeFusion3D(a, [a, b], new Set([clePaire3D(a, b)])), null);
  });

  test('et le refus s’oublie dès que le contact cesse', () => {
    const a = bulle({ id: 'a' }), colle = bulle({ id: 'b', x: 10 }), loin = bulle({ id: 'b', x: 900 });
    const refus = new Set([clePaire3D(a, colle)]);
    assert.deepEqual(refusPerimes3D(refus, [a, colle]), [],
      'un refus s’oublie alors que les Bulles se touchent encore : la question reviendra aussitôt');
    assert.deepEqual(refusPerimes3D(refus, [a, loin]), [clePaire3D(a, colle)]);
  });

  test('un refus portant sur une Bulle supprimée s’oublie aussi', () => {
    const a = bulle({ id: 'a' }), b = bulle({ id: 'b', x: 10 });
    assert.deepEqual(refusPerimes3D(new Set([clePaire3D(a, b)]), [a]), [clePaire3D(a, b)]);
  });
});

describe('candidateDeFusion3D — qui l’on s’apprête à rejoindre', () => {
  test('aucune candidate si rien ne se touche', () => {
    const a = bulle({ id: 'a' });
    assert.equal(candidateDeFusion3D(a, [a, bulle({ id: 'b', x: 900 })], new Set()), null);
  });

  test('ni si l’autre n’est pas fusionnable', () => {
    const a = bulle({ id: 'a' });
    const b = bulle({ id: 'b', x: 10, bulleFusionnable: false });
    assert.equal(candidateDeFusion3D(a, [a, b], new Set()), null);
  });

  /**
   * ⚠️ ON NE SE PROPOSE PAS SOI-MÊME, et l'oubli de ce cas est classique : la Bulle qu'on déplace
   * est DANS la liste qu'on parcourt. Sans la garde, elle se fusionnerait avec elle-même au premier
   * mouvement.
   */
  test('et jamais avec soi-même', () => {
    const a = bulle({ id: 'a' });
    assert.equal(candidateDeFusion3D(a, [a], new Set()), null);
  });

  /**
   * ⚠️ UN OBJET QUI N'EST PAS UNE BULLE EST ÉCARTÉ PAR SON TYPE, ET NON PAR CHANCE. Sans la
   * garde, un Personnage irait jusqu'à `fusionPossible3D`, qui le refuserait — mais parce qu'il
   * ne porte pas la case, ce qui n'est pas la raison. La géométrie des Bulles serait pourtant
   * interrogée au passage sur un objet qui n'en a pas.
   *
   * La fixture porte donc le champ, ce qu'un fichier de Projet abîmé peut très bien contenir :
   * c'est le seul moyen de distinguer les deux refus.
   */
  test('les objets qui ne sont pas des Bulles sont écartés par leur TYPE', () => {
    const a = bulle({ id: 'a' });
    const perso = { id: 'p', type: 'perso', x: 10, y: 0, w: 200, h: 100,
      bulleFusionnable: true };
    assert.equal(candidateDeFusion3D(a, [a, perso], new Set()), null,
      'un Personnage portant le champ a été proposé à la fusion');
  });

  /**
   * ⚠️ UN MUTANT ÉQUIVALENT CONSIGNÉ : prendre la mémoire APRÈS le transport, au lieu d'avant,
   * laisse la suite verte — et c'est juste. `transport` ne contient JAMAIS `bulleAvantFusion`,
   * qui est propre au lobe : l'ordre des deux `Object.assign` ne peut donc rien changer, et
   * `instantaneDeFusion3D` lit de toute façon le lobe d'origine, pas le résultat.
   *
   * Tordre une assertion pour distinguer deux écritures indiscernables fabriquerait un test qui
   * protège une coïncidence de mise en page. Même verdict que M152 en #422g.
   */

  test('une liste absente ne lève pas', () => {
    assert.equal(candidateDeFusion3D(bulle({}), null, new Set()), null);
    assert.equal(candidateDeFusion3D(null, [], new Set()), null);
  });
});

describe('separer3D — chaque lobe redevient ce qu’il était', () => {
  const a = () => bulle({ id: 'a', bulleColor: '#AAAAAA', bulleShape: 'ovale', description: 'un' });
  const b = () => bulle({ id: 'b', bulleColor: '#BBBBBB', bulleShape: 'etoile', description: 'deux' });

  test('les réglages d’origine reviennent, et le groupe disparaît', () => {
    const [, y] = separer3D(fusionner3D([a(), b()], a(), 'g1'));
    assert.equal(y.bulleColor, '#BBBBBB');
    assert.equal(y.bulleShape, 'etoile');
    assert.equal(y.bulleGroupe, undefined);
    assert.equal(y.bulleAvantFusion, undefined, 'la mémoire doit partir avec le groupe');
  });

  test('et le texte de chaque lobe n’a jamais bougé', () => {
    const [x, y] = separer3D(fusionner3D([a(), b()], a(), 'g1'));
    assert.equal(x.description, 'un');
    assert.equal(y.description, 'deux');
  });

  /**
   * ⚠️ LA GÉOMÉTRIE RESTE OÙ ELLE EST. Séparer un groupe qu'on a déplacé après l'avoir fusionné ne
   * doit pas renvoyer les lobes à leur position d'il y a dix minutes. C'est pour cela que
   * l'instantané n'enregistre aucune coordonnée.
   */
  test('la position d’après la fusion est conservée', () => {
    const fusionnes = fusionner3D([a(), b()], a(), 'g1');
    fusionnes.forEach(l => { l.x += 500; l.y += 300; });
    const separes = separer3D(fusionnes);
    assert.equal(separes[0].x, 500);
    assert.equal(separes[1].y, 300);
  });

  /**
   * ⚠️ LE TEST QUI A IMPOSÉ D'EFFACER AVANT DE RENDRE. Un simple `Object.assign(lobe, memoire)`
   * laisserait en place les axes réglés APRÈS la fusion : une Bulle à qui on donne une texture une
   * fois fusionnée la garderait en se séparant, alors que la mémoire n'en dit rien. « Séparer »
   * veut dire revenir à AVANT, pas repeindre par-dessus.
   */
  test('un axe réglé APRÈS la fusion disparaît aussi', () => {
    const fusionnes = fusionner3D([a(), b()], a(), 'g1');
    fusionnes.forEach(l => { l.bulleTexture = 'lave'; });
    const separes = separer3D(fusionnes);
    assert.equal(separes[1].bulleTexture, undefined,
      'la texture posée après la fusion a survécu à la séparation');
    assert.equal(separes[1].bulleColor, '#BBBBBB');
  });

  /**
   * ⚠️ UN LOBE SANS MÉMOIRE SE CONTENTE DE QUITTER SON GROUPE. Le cas existe — un fichier édité à
   * la main. Effacer son apparence sans rien avoir à remettre le laisserait NU, ce qui serait pire
   * que de ne rien défaire.
   */
  test('un lobe sans mémoire garde son apparence et quitte le groupe', () => {
    const orphelin = bulle({ id: 'z', bulleGroupe: 'g9', bulleColor: '#123456' });
    const [out] = separer3D([orphelin]);
    assert.equal(out.bulleColor, '#123456');
    assert.equal(out.bulleGroupe, undefined);
  });

  test('elle ne modifie pas les lobes qu’on lui donne', () => {
    const fusionnes = fusionner3D([a(), b()], a(), 'g1');
    separer3D(fusionnes);
    assert.equal(fusionnes[1].bulleGroupe, 'g1');
    assert.ok(fusionnes[1].bulleAvantFusion);
  });

  test('une liste vide ou absente ne lève pas', () => {
    assert.deepEqual(separer3D([]), []);
    assert.deepEqual(separer3D(null), []);
  });

  /**
   * ⚠️ FUSIONNER PUIS SÉPARER REND L'ÉTAT DE DÉPART, aux champs de fusion près. C'est la propriété
   * que le bouton promet, et la seule façon de la tenir sans énumérer ce qui se transporte.
   */
  test('aller-retour : l’apparence revient exactement', () => {
    const avant = [a(), b()];
    const apres = separer3D(fusionner3D(avant.map(o => Object.assign({}, o)), a(), 'g1'));
    avant.forEach((o, i) => assert.deepEqual(apres[i], o,
      `le lobe ${i} n’est pas revenu à son état de départ`));
  });
});
