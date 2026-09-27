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
  tiretsTraitBulle, amplitudeTrembleBulle, apparenceBulle, decalagesTrembleBulle,
  graineTrembleBulle,
  pointesDeLEpine3D, EPINE_PAS, EPINE_LONGUEUR, EPINE_VARIATION, EPINE_DEDANS, TRAIT_EPINE,
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

describe('Les décalages du tremblé : une main, pas du bruit blanc', () => {
  const tremblee = { id: 'b1', bulleBorderRegularity: TRAIT_TREMBLE };
  const N = 72;

  test('nette : aucun décalage, donc l’appelant garde son tracé d’origine', () => {
    assert.deepEqual(decalagesTrembleBulle({ id: 'b1' }, 2.25, N), []);
    assert.deepEqual(decalagesTrembleBulle(tremblee, 2.25, 0), []);
  });

  test('⚠️ RÉGRESSION #425g : LE TREMBLÉ N’A PAS BOUGÉ D’UN MILLIÈME EN DÉMÉNAGEANT', () => {
    // ⚠️ LE BRUIT A QUITTÉ CE MODULE POUR src/cyclic-noise.js, parce que la tache d'encre de #425g
    // en avait besoin elle aussi. Un déménagement n'est jamais neutre par décret : le nombre de
    // points de contrôle est devenu un PARAMÈTRE, et il suffisait de le passer une fois de travers
    // — 8 au lieu de 9, ou l'ordre des arguments inversé — pour que tous les tremblés du corpus
    // changent de forme sans qu'aucune assertion qualitative ne s'en aperçoive : elles vérifient
    // que le bruit est lisse, borné et cyclique, ce qu'un AUTRE bruit serait tout autant.
    //
    // Les huit couples ci-dessous ont été relevés AVANT le déménagement. Ils ne prouvent rien sur
    // la qualité du tremblé — les autres tests s'en chargent — et tout sur son identité.
    const attendu = [
      [-1.137543, -0.695093], [-2.004750, 0.515443], [-1.714377, 1.978070], [-0.669186, 0.201269],
      [0.659971, -0.401270], [-0.997301, -0.141044], [-1.695149, -0.138338], [-1.226474, -0.999005],
    ];
    const d = decalagesTrembleBulle({ id: 'b1', bulleBorderRegularity: 'tremble' }, 2.25, 8);
    assert.equal(d.length, attendu.length);
    d.forEach((p, i) => {
      assert.ok(Math.abs(p.dx - attendu[i][0]) < 1e-6 && Math.abs(p.dy - attendu[i][1]) < 1e-6,
        `point ${i} : ${p.dx.toFixed(6)},${p.dy.toFixed(6)} au lieu de ${attendu[i].join(',')}`);
    });
  });

  test('⚠️ LE BRUIT EST LISSE, et c’est le rendu qui l’a exigé', () => {
    // ⚠️ MUTATION N13, ÉCHAPPÉE PUIS RATTRAPÉE. La première version tirait un décalage INDÉPENDANT
    // par point. Tous les tests passaient — le contour changeait, restait stable, différait d'une
    // Bulle à l'autre — et le rendu montrait une pomme de terre. Une main qui tremble fait des
    // ondulations larges ; du bruit blanc fait des bosses. Ce qui distingue les deux se mesure :
    // l'écart entre deux points VOISINS doit rester petit devant l'amplitude.
    const d = decalagesTrembleBulle(tremblee, 2.25, N);
    const amplitude = amplitudeTrembleBulle(tremblee, 2.25);
    let pire = 0;
    for (let i = 1; i < d.length; i++) {
      pire = Math.max(pire, Math.abs(d[i].dx - d[i - 1].dx), Math.abs(d[i].dy - d[i - 1].dy));
    }
    assert.ok(pire < amplitude * 0.35,
      `écart maximal entre voisins ${pire.toFixed(3)}, pour une amplitude de ${amplitude.toFixed(3)}`);
  });

  test('⚠️ ET IL SE REFERME : le contour est une boucle', () => {
    // ⚠️ MUTATION N14, ÉCHAPPÉE PUIS RATTRAPÉE. Un bruit qui ne boucle pas laisse une MARCHE à
    // l'endroit exact où le tracé se referme — un défaut visible, sur toutes les Bulles tremblées,
    // toujours au même endroit, et qu'aucune assertion de stabilité ou d'amplitude ne voit.
    const d = decalagesTrembleBulle(tremblee, 2.25, N);
    const amplitude = amplitudeTrembleBulle(tremblee, 2.25);
    const saut = Math.max(Math.abs(d[d.length - 1].dx - d[0].dx), Math.abs(d[d.length - 1].dy - d[0].dy));
    assert.ok(saut < amplitude * 0.35, `marche de ${saut.toFixed(3)} à la fermeture`);
  });

  test('l’amplitude demandée est réellement atteinte, sinon le tremblé serait cosmétique', () => {
    // L'autre bord du même intervalle : un bruit tellement lisse qu'il ne s'écarte jamais ne
    // tremblerait pas non plus. Les deux assertions se tiennent par les deux bouts.
    const d = decalagesTrembleBulle(tremblee, 2.25, N);
    const amplitude = amplitudeTrembleBulle(tremblee, 2.25);
    const max = Math.max(...d.map(p => Math.max(Math.abs(p.dx), Math.abs(p.dy))));
    assert.ok(max > amplitude * 0.5, `écart maximal ${max.toFixed(3)} pour ${amplitude.toFixed(3)}`);
    assert.ok(max <= amplitude + 1e-9, 'aucun point ne doit dépasser l’amplitude annoncée');
  });

  test('la graine ne dépend que de l’identifiant, et deux identifiants diffèrent', () => {
    assert.equal(graineTrembleBulle({ id: 'b1', x: 0 }), graineTrembleBulle({ id: 'b1', x: 999 }));
    assert.notEqual(graineTrembleBulle({ id: 'b1' }), graineTrembleBulle({ id: 'b2' }));
    // Une Bulle sans id ne doit pas faire tomber le dessin : elle tremble, faute de mieux, comme
    // toutes les autres sans id.
    assert.equal(typeof graineTrembleBulle({}), 'number');
    assert.ok(Number.isFinite(graineTrembleBulle(null)));
  });
});

describe('⚠️ LE MOTIF « ÉPINE » : de la géométrie, pas un pointillé (#425y)', () => {
  // Un carré de 100 px de côté, centré : les distances au centre s'y lisent à vue d'œil.
  const CENTRE = { x: 0, y: 0 };
  const carre = (n = 400) => {
    const p = [];
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n;
      p.push({ x: 50 * Math.cos(a), y: 50 * Math.sin(a) });
    }
    return p;
  };

  test('⚠️ IL NE POSE AUCUN TIRET : ce n’est pas un pointillé', () => {
    // Rendre un motif de tirets ici ferait en plus POINTILLER la frange, ce qui n'est demandé
    // nulle part et se verrait comme un contour rongé.
    assert.deepEqual(tiretsTraitBulle({ bulleBorderDash: TRAIT_EPINE }, 3), []);
    // Le repère : les deux autres motifs, eux, en posent.
    assert.ok(tiretsTraitBulle({ bulleBorderDash: 'tirets' }, 3).length > 0);
  });

  const longueurs = (pts) => {
    const out = [];
    for (let i = 0; i < pts.length; i += 2) {
      out.push(Math.hypot(pts[i + 1].x, pts[i + 1].y) - Math.hypot(pts[i].x, pts[i].y));
    }
    return out;
  };

  /**
   * ⚠️ CHAQUE ÉPINE TRAVERSE LE CONTOUR : elle commence EN DEÇÀ et finit AU-DELÀ. Relevé à l'usage
   * sur la source. Des pointes qui partiraient du bord laisseraient une frontière nette entre le
   * contour et la frange — deux traits distincts ; en le traversant, elles fondent les deux en une
   * seule matière hérissée.
   */
  test('⚠️ CHAQUE ÉPINE TRAVERSE LE CONTOUR, ET SA LONGUEUR RESTE DANS LA PLAGE', () => {
    const pts = pointesDeLEpine3D(CENTRE, carre(), 4, 7);
    assert.ok(pts.length >= 4, 'aucune pointe produite');
    const nominal = 4 * EPINE_LONGUEUR;
    for (let i = 0; i < pts.length; i += 2) {
      const dedans = Math.hypot(pts[i].x, pts[i].y);
      const dehors = Math.hypot(pts[i + 1].x, pts[i + 1].y);
      assert.ok(dedans < 50, `l’épine commence à ${dedans.toFixed(1)} du centre, hors du contour (50)`);
      assert.ok(dehors > 50, `l’épine finit à ${dehors.toFixed(1)} du centre, sans dépasser le contour`);
      // Et elle mord de la profondeur annoncée, à la variation de longueur près.
      const part = (50 - dedans) / (dehors - dedans);
      assert.ok(Math.abs(part - EPINE_DEDANS) < 0.02,
        `${(part * 100).toFixed(0)} % de l’épine est dedans, attendu ${EPINE_DEDANS * 100} %`);
    }
    for (const l of longueurs(pts)) {
      assert.ok(l > 0, `une pointe est retournée (${l.toFixed(1)} px)`);
      assert.ok(Math.abs(l - nominal) <= nominal * EPINE_VARIATION + 0.01,
        `pointe de ${l.toFixed(1)} px, hors de la plage ${nominal} ± ${(nominal * EPINE_VARIATION).toFixed(1)}`);
    }
  });

  /**
   * ⚠️ LES LONGUEURS VARIENT, ET C'EST DEMANDÉ. Relevé à l'usage sur la source : « les épines sont
   * beaucoup plus nombreuses, plus fines et de taille variable ». Une frange régulière se lit comme
   * un engrenage ; l'inégalité lui donne l'aspect d'un tracé à la plume.
   */
  test('⚠️ LES POINTES N’ONT PAS TOUTES LA MÊME LONGUEUR', () => {
    const l = longueurs(pointesDeLEpine3D(CENTRE, carre(), 3, 7));
    const ecart = Math.max(...l) / Math.min(...l);
    assert.ok(ecart > 1.5, `longueurs dans un rapport de ${ecart.toFixed(2)} : la frange est régulière`);
  });

  /**
   * ⚠️ MAIS LA VARIATION EST DÉTERMINISTE. La Planche se redessine des dizaines de fois par seconde
   * pendant un glissement : un `Math.random()` ici ferait frémir la frange en continu. C'est le même
   * bruit cyclique que le contour tremblé et la tache d'encre, avec la même graine tirée de
   * l'identifiant — deux Bulles diffèrent, une Bulle donnée se redessine à l'identique.
   */
  test('⚠️ ET ELLE EST DÉTERMINISTE : même graine, même frange ; graine différente, autre frange', () => {
    assert.deepEqual(pointesDeLEpine3D(CENTRE, carre(), 3, 7),
                     pointesDeLEpine3D(CENTRE, carre(), 3, 7),
      'la frange change d’une image à l’autre : elle frémirait sans fin');
    assert.notDeepEqual(pointesDeLEpine3D(CENTRE, carre(), 3, 7),
                        pointesDeLEpine3D(CENTRE, carre(), 3, 99),
      'deux Bulles différentes portent exactement la même frange');
  });

  /**
   * ⚠️ LE MOTIF SE MESURE EN ÉPAISSEURS DE TRAIT, comme les tirets et pour la même raison : à
   * valeur fixe en pixels, la frange disparaîtrait précisément là où l'utilisateur a demandé un
   * contour plus visible.
   */
  test('⚠️ UN TRAIT DEUX FOIS PLUS ÉPAIS DONNE DEUX FOIS MOINS D’ÉPINES, DEUX FOIS PLUS LONGUES', () => {
    const fin = pointesDeLEpine3D(CENTRE, carre(), 2, 7);
    const gras = pointesDeLEpine3D(CENTRE, carre(), 4, 7);
    assert.ok(fin.length > gras.length * 1.8,
      `${fin.length / 2} pointes à 2 px contre ${gras.length / 2} à 4 px : l’espacement ne suit pas`);
    // La longueur MOYENNE suit l'épaisseur : chaque pointe varie, leur moyenne non.
    const moyenne = (pts) => longueurs(pts).reduce((a, b) => a + b, 0) / (pts.length / 2);
    assert.ok(Math.abs(moyenne(gras) - 2 * moyenne(fin)) < 0.5,
      'la longueur des pointes ne suit pas l’épaisseur');
  });

  /**
   * ⚠️ L'ESPACEMENT EST UNE LONGUEUR D'ARC, PAS UN ANGLE. Un pas d'angle donnerait des épines
   * serrées sur les flancs d'un ovale et clairsemées à ses bouts : la densité changerait avec les
   * proportions de la Bulle, ce qu'on n'attend pas d'un MOTIF DE TRAIT. On le mesure sur un contour
   * très allongé, où les deux politiques divergent franchement.
   */
  test('⚠️ LA DENSITÉ EST LA MÊME PARTOUT SUR UN CONTOUR ALLONGÉ', () => {
    const allonge = [];
    const n = 720;
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n;
      allonge.push({ x: 200 * Math.cos(a), y: 40 * Math.sin(a) });
    }
    const pts = pointesDeLEpine3D(CENTRE, allonge, 3);
    const bases = pts.filter((_, i) => i % 2 === 0);
    const ecarts = bases.slice(1).map((p, i) =>
      Math.hypot(p.x - bases[i].x, p.y - bases[i].y));
    const dedans = ecarts.filter(e => e < 3 * EPINE_PAS * 2.5);
    assert.ok(dedans.length > ecarts.length * 0.95,
      'les épines se tassent par endroits : l’espacement suit l’angle et non la longueur');
  });

  test('un contour vide ou absent ne produit rien, sans lever', () => {
    assert.deepEqual(pointesDeLEpine3D(CENTRE, [], 3), []);
    assert.deepEqual(pointesDeLEpine3D(CENTRE, null, 3), []);
    assert.deepEqual(pointesDeLEpine3D(null, carre(), 3), []);
  });
});
