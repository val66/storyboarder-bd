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
  noeudsDuBruitEpine3D, EPINE_NOEUDS_MINIMUM,
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
    //
    // ⚠️ LA TOLÉRANCE EST RELATIVE, ET ELLE L'EST DEVENUE PAR NÉCESSITÉ. Elle valait 0,5 px absolu,
    // ce qui ne tenait que tant que le bruit était à grain grossier : les deux relevés ne comptent
    // pas le même nombre de pointes et n'échantillonnent donc pas le bruit aux mêmes abscisses,
    // si bien que leurs moyennes s'écartent d'autant plus que le grain est fin. Un seuil en pixels
    // mesurait le pas d'échantillonnage du bruit autant que le rapport qu'il prétend figer.
    const moyenne = (pts) => longueurs(pts).reduce((a, b) => a + b, 0) / (pts.length / 2);
    const rapport = moyenne(gras) / moyenne(fin);
    assert.ok(Math.abs(rapport - 2) < 0.25,
      `longueur moyenne dans un rapport de ${rapport.toFixed(2)} au lieu de 2 : elle ne suit pas l’épaisseur`);
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
    // ⚠️ L'ÉCART SE MESURE SUR LE POINT DU CONTOUR, PAS SUR LA BASE DE L'ÉPINE. Ce relevé prenait
    // la base interne, ce qui ne vaut qu'à longueurs presque égales : la base recule le long de la
    // normale à proportion de la longueur, si bien qu'une longue et une courte voisines s'écartent
    // RADIALEMENT sans que l'espacement ait bougé. Le jour où la variation est passée de 0,45 à 1,
    // le test est devenu rouge sur un code juste — un instrument qui mesurait deux choses à la
    // fois. Le point du contour se reconstruit exactement : la base est à EPINE_DEDANS du départ.
    const surLeContour = [];
    for (let i = 0; i < pts.length; i += 2) {
      const a = pts[i], b = pts[i + 1];
      surLeContour.push({ x: a.x + (b.x - a.x) * EPINE_DEDANS, y: a.y + (b.y - a.y) * EPINE_DEDANS });
    }
    const bases = surLeContour;
    const ecarts = bases.slice(1).map((p, i) =>
      Math.hypot(p.x - bases[i].x, p.y - bases[i].y));
    const dedans = ecarts.filter(e => e < 3 * EPINE_PAS * 2.5);
    assert.ok(dedans.length > ecarts.length * 0.95,
      'les épines se tassent par endroits : l’espacement suit l’angle et non la longueur');
  });

  /**
   * ⚠️ UNE ÉPINE EST PERPENDICULAIRE AU CONTOUR, ET AUCUN DES TESTS CI-DESSUS NE POUVAIT LE DIRE :
   * ils travaillent tous sur un CERCLE, où la direction du centre et la normale se confondent. La
   * première écriture partait du centre, au motif — juste — que sur un contour dentelé la normale
   * bascule d'un segment à l'autre. Sur une ellipse deux fois plus large que haute, les deux
   * directions s'écartent de SOIXANTE DEGRÉS à mi-chemin des axes : les épines s'y couchaient le
   * long du contour et la frange semblait s'effacer sur les flancs. Rapporté à l'usage, reproduit
   * en image, et figé ici sur le seul contour qui sépare les deux politiques.
   */
  test('⚠️ SUR UN OVALE, LES ÉPINES SORTENT À LA PERPENDICULAIRE ET NON DEPUIS LE CENTRE', () => {
    const n = 720, a = 200, b = 100, allonge = [];
    for (let i = 0; i < n; i++) {
      const t = (Math.PI * 2 * i) / n;
      allonge.push({ x: a * Math.cos(t), y: b * Math.sin(t) });
    }
    const pts = pointesDeLEpine3D(CENTRE, allonge, 3, 7);
    assert.ok(pts.length >= 4, 'aucune pointe produite');
    let ecartMax = 0, ecartRadialMax = 0;
    for (let i = 0; i < pts.length; i += 2) {
      const mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2;
      const dx = pts[i + 1].x - pts[i].x, dy = pts[i + 1].y - pts[i].y;
      const len = Math.hypot(dx, dy) || 1;
      // La normale exacte de l'ellipse au point le plus proche du milieu de l'épine.
      const t = Math.atan2(my / b, mx / a);
      const nx = Math.cos(t) / a, ny = Math.sin(t) / b;
      const nl = Math.hypot(nx, ny) || 1;
      const cos = (dx / len) * (nx / nl) + (dy / len) * (ny / nl);
      ecartMax = Math.max(ecartMax, Math.acos(Math.min(1, Math.max(-1, cos))));
      // Le témoin : l'écart qu'aurait donné la direction radiale sur ce même point.
      const rl = Math.hypot(mx, my) || 1;
      const cosR = (mx / rl) * (nx / nl) + (my / rl) * (ny / nl);
      ecartRadialMax = Math.max(ecartRadialMax, Math.acos(Math.min(1, Math.max(-1, cosR))));
    }
    const deg = (r) => (r * 180) / Math.PI;
    // ⚠️ LE TÉMOIN D'ABORD : sans lui, ce test serait « une absence mesurée sans vérifier que
    // l'instrument sait voir une présence ». Sur un cercle il resterait vert quoi qu'on code.
    assert.ok(deg(ecartRadialMax) > 30,
      `la fixture ne sépare pas les deux politiques : la radiale n’y dévie que de ${deg(ecartRadialMax).toFixed(0)}°`);
    assert.ok(deg(ecartMax) < 5,
      `une épine s’écarte de ${deg(ecartMax).toFixed(0)}° de la normale : elle se couche sur le contour`);
  });

  /**
   * ⚠️ ET LE CONTOUR PARCOURU À L'ENVERS DONNE LA MÊME FRANGE, VERS LE DEHORS. Des deux normales
   * d'un segment, laquelle est « dehors » ne se lit PAS dans le segment : elle se lit dans le sens
   * de parcours du contour. Le registre les produit tous dans le même sens (#425e), si bien que
   * retirer la correction de signe ne change rien aujourd'hui — une mutation avait échappé pour
   * cette raison exacte. Ce test refuse ce genre de garde muette : il fabrique le contour à
   * l'envers et exige que les épines sortent quand même.
   */
  test('⚠️ UN CONTOUR PARCOURU DANS L’AUTRE SENS HÉRISSE TOUJOURS VERS LE DEHORS', () => {
    const endroit = carre();
    const envers = endroit.slice().reverse();
    for (const contour of [endroit, envers]) {
      const pts = pointesDeLEpine3D(CENTRE, contour, 3, 7);
      assert.ok(pts.length >= 4, 'aucune pointe produite');
      for (let i = 0; i < pts.length; i += 2) {
        assert.ok(Math.hypot(pts[i + 1].x, pts[i + 1].y) > Math.hypot(pts[i].x, pts[i].y),
          'une épine pointe vers l’intérieur : la correction de signe ne tient pas');
      }
    }
  });

  /**
   * ⚠️ LA LONGUEUR ET L'ÉCART SONT DEUX TIRAGES DISTINCTS DU MÊME BRUIT. Les faire lire le même
   * tirage — un seul caractère de différence — les rend rigoureusement proportionnels : les longues
   * épines seraient toutes largement espacées et les courtes toutes serrées, ce qui produit des
   * touffes régulières au lieu d'une frange. C'est la famille « deux copies d'une décision qui ne
   * s'accordent qu'aujourd'hui », prise à l'envers : ici les deux valeurs doivent DIVERGER.
   */
  test('⚠️ LONGUEUR ET ÉCART NE SONT PAS LE MÊME TIRAGE', () => {
    const pts = pointesDeLEpine3D(CENTRE, carre(), 3, 7);
    const l = [], e = [];
    for (let i = 0; i + 3 < pts.length; i += 2) {
      l.push(Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y));
      e.push(Math.hypot(pts[i + 2].x - pts[i].x, pts[i + 2].y - pts[i].y));
    }
    assert.ok(l.length > 20, 'relevé trop court pour conclure');
    const moy = (v) => v.reduce((a, b) => a + b, 0) / v.length;
    const ml = moy(l), me = moy(e);
    let cov = 0, vl = 0, ve = 0;
    for (let i = 0; i < l.length; i++) {
      cov += (l[i] - ml) * (e[i] - me); vl += (l[i] - ml) ** 2; ve += (e[i] - me) ** 2;
    }
    const r = cov / (Math.sqrt(vl * ve) || 1);
    assert.ok(Math.abs(r) < 0.6,
      `corrélation de ${r.toFixed(2)} entre longueur et écart : la frange se fera par touffes`);
  });

  /**
   * ⚠️ LA VARIATION EST À GRAIN FIN, ET NON UNE ONDE LONGUE. Le test voisin exige seulement que les
   * longueurs varient : un bruit à vingt-trois nœuds répartis sur tout le périmètre le satisfait,
   * et pourtant il produit des ARCS ENTIERS d'épines courtes alternant avec des arcs d'épines
   * longues — des festons réguliers, c'est-à-dire précisément la régularité que la variation devait
   * casser. Vu sur planche de contact avant d'être corrigé.
   *
   * On le mesure par le nombre d'ALTERNANCES autour de la longueur moyenne : une onde longue en
   * donne une poignée, un grain fin en donne une fraction notable du nombre d'épines.
   */
  test('⚠️ LES LONGUEURS ALTERNENT VITE : LA VARIATION N’EST PAS UNE ONDE LONGUE', () => {
    const l = longueurs(pointesDeLEpine3D(CENTRE, carre(), 3, 7));
    assert.ok(l.length > 50, 'relevé trop court pour conclure');
    const moy = l.reduce((a, b) => a + b, 0) / l.length;
    let alternances = 0;
    for (let i = 1; i < l.length; i++) {
      if ((l[i] > moy) !== (l[i - 1] > moy)) alternances++;
    }
    assert.ok(alternances > l.length * 0.2,
      `${alternances} alternances sur ${l.length} pointes : la frange ondule au lieu de varier`);
  });

  /**
   * ⚠️ UN CONTOUR D'AIRE NULLE N'A NI DEDANS NI DEHORS, ET LE CODE TRANCHE QUAND MÊME. Un aller-
   * retour sur un segment décrit une aire nulle : le sens de parcours n'y veut rien dire. Le
   * commentaire du module annonce qu'on prend alors le sens direct ; sans ce test, l'annonce serait
   * invérifiable et la borne `aire < 0` interchangeable avec `aire <= 0` — mutation échappée.
   */
  test('⚠️ UN CONTOUR APLATI PREND LE SENS DIRECT, ET NE LÈVE PAS', () => {
    // Aller-retour le long de l'axe des x : périmètre non nul, aire rigoureusement nulle.
    const aplati = [];
    for (let i = 0; i <= 40; i++) aplati.push({ x: -50 + (i * 100) / 40, y: 0 });
    for (let i = 39; i > 0; i--) aplati.push({ x: -50 + (i * 100) / 40, y: 0 });
    const pts = pointesDeLEpine3D(CENTRE, aplati, 3, 7);
    assert.ok(pts.length >= 4, 'aucune pointe sur un contour aplati');
    // Sens direct : la normale du brin ALLER (dx > 0) est (dy, -dx) / len, soit (0, -1).
    const [base, pointe] = pts;
    assert.ok(pointe.y < base.y,
      'le contour aplati ne prend pas le sens direct : la borne de l’aire a changé de camp');
  });

  /**
   * ⚠️ LE GRAIN DU BRUIT SUIT LE NOMBRE D'ÉPINES. Le test voisin exige que les longueurs alternent
   * vite ; il ne dit pas d'où vient cette vitesse. Elle venait d'un nombre de nœuds FIXE, juste
   * pour un espacement et un seul : le jour où l'espacement a été divisé par deux, chaque nœud a
   * couvert deux fois plus d'épines et l'onde longue est revenue — sur un code par ailleurs
   * inchangé. C'est la famille « un réglage qui n'est juste que pour la valeur d'un autre ».
   *
   * On fige donc le RAPPORT, seul invariant qui survive à un changement de densité.
   */
  test('⚠️ LE NOMBRE DE NŒUDS DU BRUIT SUIT LA DENSITÉ, IL N’EST PAS FIXE', () => {
    assert.equal(noeudsDuBruitEpine3D(1000, 1), 500, 'un nœud pour deux épines');
    assert.equal(noeudsDuBruitEpine3D(1000, 0.5), 1000,
      'l’espacement divisé par deux ne double pas les nœuds : l’onde longue reviendra');
    // Le plancher protège les très petites Bulles, où le calcul donnerait une poignée de nœuds.
    assert.equal(noeudsDuBruitEpine3D(10, 1), EPINE_NOEUDS_MINIMUM);
    // Et un pas absurde ne fait pas tomber le calcul.
    assert.equal(noeudsDuBruitEpine3D(1000, 0), EPINE_NOEUDS_MINIMUM);
  });

  /**
   * ⚠️ PAR DÉFAUT LE CONTOUR SE REFERME, ET LE DERNIER SEGMENT EST HÉRISSÉ COMME LES AUTRES. Le
   * drapeau `ferme` existe pour l'ouverture de la queue ; son DÉFAUT engage tous les autres
   * appelants. Basculer ce défaut ne retirait qu'une épine sur deux mille sur un contour finement
   * échantillonné — invisible à tout seuil de densité, et mutation échappée. Sur un carré, le
   * segment de fermeture vaut un quart du périmètre : la différence devient franche.
   */
  test('⚠️ LE DERNIER SEGMENT D’UN CONTOUR FERMÉ PORTE DES ÉPINES', () => {
    const carre4 = [{ x: -50, y: -50 }, { x: 50, y: -50 }, { x: 50, y: 50 }, { x: -50, y: 50 }];
    const ferme = pointesDeLEpine3D(CENTRE, carre4, 3, 7);
    const ouvert = pointesDeLEpine3D(CENTRE, carre4, 3, 7, false);
    assert.ok(ferme.length > 0 && ouvert.length > 0, 'aucune pointe produite');
    // Trois côtés sur quatre : l'ouvert doit porter environ trois quarts des épines du fermé.
    const part = ouvert.length / ferme.length;
    assert.ok(part > 0.6 && part < 0.85,
      `l’ouvert porte ${(part * 100).toFixed(0)} % des épines du fermé, attendu environ 75 %`);
  });

  test('un contour vide ou absent ne produit rien, sans lever', () => {
    assert.deepEqual(pointesDeLEpine3D(CENTRE, [], 3), []);
    assert.deepEqual(pointesDeLEpine3D(CENTRE, null, 3), []);
    assert.deepEqual(pointesDeLEpine3D(null, carre(), 3), []);
  });
});
