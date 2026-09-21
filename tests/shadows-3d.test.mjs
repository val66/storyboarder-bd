/**
 * tests/shadows-3d.test.mjs — la décision pure des ombres portées (#422a).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * CE QUI EST TENU ICI, ET CE QUI NE PEUT PAS L'ÊTRE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Tenu : que la boîte d'ombre se dérive de ce que la CASE REGARDE et jamais du Sol, qu'elle couvre
 * le champ visible quelle que soit l'orientation du soleil, que le demi-champ s'accorde AU CHIFFRE
 * PRÈS avec la caméra de `framePanelCamera3D`, et qu'une source sans portée reçoive quand même un
 * plan éloigné fini.
 *
 * ⚠️ PAS TENU : que l'ombre soit BELLE, ni que la marge de 1,5 soit la bonne. Ces deux-là se jugent
 * à l'écran (#422z), et #420c a déjà montré qu'une valeur correctement dérivée peut être franchement
 * mauvaise à l'œil.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  champVisibleDeCase3D, boiteOmbreSoleil3D, cameraOmbreSource3D, ombreSoleilSeraVisible3D,
  MARGE_BOITE_OMBRE, RESOLUTION_OMBRE_SOLEIL, RESOLUTION_OMBRE_SOURCE, NEAR_OMBRE_SOURCE,
  TAILLE_TEXEL_MAX,
} from '../src/shadows-3d.js';
import {
  PANEL_CAM_DEFAULT_DIST_3D, PERSONA_REAL_HEIGHT_M, WALL_PX_PER_UNIT_3D, GROUND_PLANE_SIZE_3D,
} from '../src/constants.js';

/** Une Planche au format Franco-Belge, à l'échelle de rendu habituelle. */
const PAGE = { w: 1240, h: 1754 };

describe('⚠️ LE SOL N’ENTRE DANS AUCUN CALCUL, et c’est la mesure qui l’exige', () => {
  test('⚠️ AUCUNE DIMENSION DE SOL NE FIGURE DANS LE MODULE', () => {
    // ⚠️ C'EST LE TEST CENTRAL DE CE FICHIER, et il garde fermée l'erreur que #422 a mesurée. Une
    // boîte d'ombre étirée aux 12 000 unités du Sol change 0,00 % des pixels : l'ombre DISPARAÎT,
    // pour le prix complet des six passes de profondeur. La tentation est pourtant naturelle — on
    // cadre la boîte sur ce qu'elle éclaire, et ce qu'elle éclaire, c'est le Sol.
    //
    // ⚠️ ET LA MESURE DE TEMPS N'AURAIT RIEN DIT : la version étirée coûte exactement le même prix,
    // puisque le travail a bien lieu. Seul le témoin « l'image change-t-elle ? » l'a démasquée.
    const src = readFileSync(new URL('../src/shadows-3d.js', import.meta.url), 'utf8');
    const corps = src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n')
      .filter(l => !/^\s*\/\//.test(l)).join('\n');
    assert.ok(!/GROUND_PLANE_SIZE_3D/.test(corps),
      'la taille du Sol est entrée dans la décision : l’ombre redeviendra invisible');
    assert.ok(!/GROUND/.test(corps), 'une grandeur du Sol est entrée dans la décision');
    // Le témoin : la constante existe bien et vaut bien ce qu'on croit, sinon l'assertion ci-dessus
    // serait vraie pour la pire des raisons — un nom qui ne désigne plus rien.
    assert.equal(GROUND_PLANE_SIZE_3D, 12000,
      'le Sol a changé de taille : les chiffres de docs/en/cast-shadows.md sont à remesurer');
  });

  test('⚠️ ET LA BOÎTE RESTE MINUSCULE DEVANT LUI : deux ordres de grandeur', () => {
    // La preuve par la conséquence, et non par l'absence d'un identifiant : au cadrage par défaut,
    // la boîte doit être SANS COMMUNE MESURE avec le Sol. Une régression qui la ferait grossir
    // jusqu'à lui échouerait ici même si elle n'écrivait jamais son nom.
    const b = boiteOmbreSoleil3D({ camDist: PANEL_CAM_DEFAULT_DIST_3D }, PAGE);
    assert.ok(2 * b.rayon < GROUND_PLANE_SIZE_3D / 100,
      `la boîte fait ${(2 * b.rayon).toFixed(0)} unités pour un Sol de ${GROUND_PLANE_SIZE_3D}`);
  });
});

describe('⚠️ LE DEMI-CHAMP S’ACCORDE AVEC LA CAMÉRA DE LA CASE, au chiffre près', () => {
  test('⚠️ IL N’EST PAS RECALCULÉ À CÔTÉ : la même distance donne le même champ', () => {
    // ⚠️ DEUX COPIES D'UNE MÊME FORMULE S'ACCORDENT LE JOUR OÙ ON LES ÉCRIT. `framePanelCamera3D`
    // calibre le champ sur la hauteur de la PLANCHE à la distance PAR DÉFAUT — c'est ce qui fait
    // qu'avancer la caméra zoome vraiment au lieu de se recadrer. Si la boîte d'ombre reprenait une
    // formule à elle, les ombres cesseraient de couvrir le cadre dès qu'on touche au cadrage, et
    // rien ne dirait laquelle des deux a raison.
    //
    // On reproduit donc ICI le calcul de la caméra, tel qu'il est écrit dans scene3d.js, et on exige
    // que les deux tombent sur la même valeur. Le jour où le cadrage change, ce test rougit — c'est
    // exactement ce qu'on veut de lui.
    const demiHauteurRef = (PAGE.h / WALL_PX_PER_UNIT_3D) / 2;
    const fov = 2 * Math.atan(demiHauteurRef / PANEL_CAM_DEFAULT_DIST_3D);
    for (const camDist of [12, 30, 75, 200]) {
      const attendu = camDist * Math.tan(fov / 2);
      const obtenu = champVisibleDeCase3D({ camDist }, PAGE).demiHauteur;
      assert.ok(Math.abs(obtenu - attendu) < 1e-9,
        `à camDist ${camDist} : ${obtenu} au lieu de ${attendu} — le champ ne suit plus la caméra`);
    }
  });

  test('le rapport largeur/hauteur est celui de la Planche', () => {
    const c = champVisibleDeCase3D({ camDist: 30 }, PAGE);
    assert.ok(Math.abs(c.demiLargeur / c.demiHauteur - PAGE.w / PAGE.h) < 1e-12);
  });

  test('⚠️ UNE CASE SANS `camDist` PREND LA DISTANCE PAR DÉFAUT, pas zéro', () => {
    // Une Case qui n'a jamais bougé n'a pas ce champ. Le lire comme 0 donnerait un champ nul, donc
    // une boîte nulle, donc une ombre sans surface — et personne ne relierait l'absence d'ombre à
    // l'absence d'un champ jamais écrit.
    const sans = champVisibleDeCase3D({}, PAGE);
    const avec = champVisibleDeCase3D({ camDist: PANEL_CAM_DEFAULT_DIST_3D }, PAGE);
    assert.equal(sans.demiHauteur, avec.demiHauteur);
    assert.ok(sans.demiHauteur > 0);
  });
});

describe('⚠️ LA BOÎTE COUVRE LE CHAMP QUEL QUE SOIT L’AZIMUT DU SOLEIL', () => {
  test('⚠️ SON RAYON CONTIENT LA DIAGONALE, pas seulement la largeur et la hauteur', () => {
    // ⚠️ LA BOÎTE EST ALIGNÉE SUR LE REPÈRE DU SOLEIL, PAS SUR CELUI DE LA CAMÉRA. Déplacer le
    // soleil sur son dôme la fait pivoter au-dessus de la Case : une boîte ajustée à la largeur et
    // à la hauteur visibles laisserait des coins découverts à certains azimuts seulement, et les
    // ombres y seraient tronquées. Un défaut qui n'apparaît que sous certains réglages est le pire
    // genre — on le prend pour un hasard.
    //
    // Le rayon du disque qui contient le rectangle ne dépend, lui, d'aucune orientation.
    // ⚠️ ET ON VÉRIFIE LA RÈGLE, PAS UNE DE SES CONSÉQUENCES CHIFFRÉES. Première version : « le
    // rayon est au moins la demi-diagonale ». La mutation M90 — remplacer la diagonale par le plus
    // grand des deux demi-côtés — y a ÉCHAPPÉ, parce que la marge de 1,5 suffisait à couvrir
    // l'écart sur une Planche de ce format. Le défaut existait bel et bien ; il ne se serait
    // manifesté que sur une Planche plus carrée, ou après qu'on ait resserré la marge.
    //
    // Une assertion qui ne mesure qu'un SEUIL laisse passer tout ce qu'un réglage voisin suffit à
    // compenser. On exige donc l'égalité : le rayon EST la demi-diagonale, à la marge près.
    for (const camDist of [12, 30, 120]) {
      const c = champVisibleDeCase3D({ camDist }, PAGE);
      const b = boiteOmbreSoleil3D({ camDist }, PAGE);
      const attendu = Math.hypot(c.demiLargeur, c.demiHauteur) * MARGE_BOITE_OMBRE;
      assert.ok(Math.abs(b.rayon - attendu) < 1e-9,
        `à camDist ${camDist}, le rayon vaut ${b.rayon} au lieu de ${attendu} : ` +
        'il ne se dérive plus de la diagonale, donc des coins sortiront de la boîte à certains azimuts');
    }
    // Et le témoin de la formule elle-même, sur une Planche volontairement DÉSÉQUILIBRÉE : c'est là
    // que « la diagonale » et « le plus grand côté » cessent de se ressembler.
    const large = { w: 3000, h: 1000 };
    const cl = champVisibleDeCase3D({ camDist: 30 }, large);
    const bl = boiteOmbreSoleil3D({ camDist: 30 }, large);
    assert.ok(bl.rayon > Math.max(cl.demiLargeur, cl.demiHauteur) * MARGE_BOITE_OMBRE,
      'sur une Planche très large, la boîte se contente du plus grand côté et coupe les coins');
  });

  test('⚠️ ET LA MARGE EST SUPÉRIEURE À 1 : un Élément hors champ projette DANS le champ', () => {
    // Un Mur posé à gauche jette son ombre vers la droite. Une boîte collée au champ visible le
    // laisserait dehors, et son ombre disparaîtrait alors qu'on la verrait dans la réalité.
    assert.ok(MARGE_BOITE_OMBRE > 1,
      'la boîte ne dépasse plus le champ : les projeteurs hors cadre seront ignorés');
    const c = champVisibleDeCase3D({ camDist: 30 }, PAGE);
    const b = boiteOmbreSoleil3D({ camDist: 30 }, PAGE);
    assert.ok(b.rayon > Math.hypot(c.demiLargeur, c.demiHauteur));
  });

  test('la boîte grandit avec la distance de caméra', () => {
    // Reculer montre plus de monde ; la boîte doit suivre, sinon les ombres se couperaient au bord
    // d'un cadre qui n'existe plus.
    let precedent = 0;
    for (const camDist of [12, 30, 60, 120]) {
      const r = boiteOmbreSoleil3D({ camDist }, PAGE).rayon;
      assert.ok(r > precedent, `à camDist ${camDist}, la boîte ne grandit plus`);
      precedent = r;
    }
  });

  test('⚠️ LA PROFONDEUR COUVRE L’ALLER, LE RETOUR, ET CE QUI PROJETTE', () => {
    // Une caméra d'ombre directionnelle est posée à `rayon` du centre, le long de la lumière : son
    // plan éloigné doit donc atteindre l'autre bord. Et un Personnage debout au bord dépasse encore.
    const b = boiteOmbreSoleil3D({ camDist: 30 }, PAGE);
    assert.ok(b.far >= 2 * b.rayon + PERSONA_REAL_HEIGHT_M,
      'la profondeur ne couvre plus la boîte : les projeteurs lointains seront coupés');
    assert.equal(b.near, 0, 'une lumière directionnelle n’a pas de plan proche à respecter');
  });
});

describe('⚠️ UNE OMBRE QUI NE SE VOIT PAS NE DOIT PAS SE PAYER', () => {
  test('⚠️ LE SEUIL DE TEXEL EXISTE, ET IL VIENT DE LA MESURE', () => {
    // #422 a mesuré une ombre à douze unités par texel : 0,00 % des pixels changés. Le seuil dit
    // qu'un texel doit rester petit devant ce qui projette, et la plus petite chose qui projette est
    // un Personnage. Sans lui, rien n'empêcherait un futur cadrage d'étirer la boîte jusqu'à
    // reproduire la version mesurée — invisible, et au prix complet.
    assert.ok(TAILLE_TEXEL_MAX > 0 && TAILLE_TEXEL_MAX < PERSONA_REAL_HEIGHT_M,
      'le seuil doit être plus petit que ce qui projette, sinon il n’interdit rien');
    // Et il refuse bien la version mesurée : douze unités par texel.
    assert.ok(12 > TAILLE_TEXEL_MAX, 'le seuil accepterait l’ombre invisible mesurée en #422');
  });

  test('⚠️ AU CADRAGE PAR DÉFAUT L’OMBRE EST LARGEMENT VISIBLE, et de loin', () => {
    // Le témoin du seuil : s'il refusait le cas normal, il serait retiré au premier essai plutôt
    // que respecté. Une assertion de marge, pas seulement de passage.
    const b = boiteOmbreSoleil3D({ camDist: PANEL_CAM_DEFAULT_DIST_3D }, PAGE);
    assert.ok(ombreSoleilSeraVisible3D({ camDist: PANEL_CAM_DEFAULT_DIST_3D }, PAGE));
    assert.ok(b.tailleTexel < TAILLE_TEXEL_MAX / 4,
      `au cadrage par défaut le texel vaut ${b.tailleTexel.toFixed(3)}, trop près du seuil ` +
      `${TAILLE_TEXEL_MAX.toFixed(3)} : la moindre marge en plus ferait disparaître l’ombre`);
  });

  test('⚠️ ET ELLE CESSE DE L’ÊTRE EN RECULANT ASSEZ : la limite est nommée, pas subie', () => {
    // C'est la même disparition que celle mesurée sur le Sol, atteinte progressivement. La nommer
    // permet à #422c de ne pas payer six passes pour une image inchangée ; l'ignorer la ferait
    // découvrir comme un défaut.
    assert.equal(ombreSoleilSeraVisible3D({ camDist: 100000 }, PAGE), false,
      'une Case vue de très loin prétend encore projeter une ombre visible');
  });
});

describe('⚠️ UNE SOURCE QUI PROJETTE REÇOIT TOUJOURS UN PLAN ÉLOIGNÉ FINI', () => {
  const champ = { rayon: boiteOmbreSoleil3D({ camDist: 30 }, PAGE).rayon };

  test('une portée finie fait autorité', () => {
    // Au-delà de sa portée, la lumière ne porte plus du tout (mesuré en #420f) : rien n'y est à
    // ombrer, et étendre la caméra plus loin ne ferait que diluer sa précision.
    const c = cameraOmbreSource3D(4, champ);
    assert.equal(c.far, 4);
    assert.equal(c.source, 'portee');
  });

  test('⚠️ UNE PORTÉE NULLE N’EST PAS UNE PORTÉE DE ZÉRO, et la caméra ne peut pas être nulle', () => {
    // `portee: 0` est le défaut de #420a et signifie « SANS LIMITE » — mesuré en #420f, Three.js
    // rend alors un facteur d'atténuation de 1,0 à toute distance. Le lire comme un far de 0
    // donnerait une caméra dégénérée, et l'ombre disparaîtrait sans qu'aucune erreur ne soit levée.
    const c = cameraOmbreSource3D(0, champ);
    assert.ok(c.far > 0, 'une source sans portée reçoit un plan éloigné nul');
    assert.equal(c.far, champ.rayon, 'le repli n’est plus le champ visible de la Case');
    assert.equal(c.source, 'champ');
  });

  test('⚠️ ET `source` DIT LAQUELLE DES DEUX RÈGLES A JOUÉ', () => {
    // Sans ce champ, un test ne pourrait que constater un nombre — et deux règles qui rendent la
    // même valeur un jour donné passeraient pour une seule. C'est aussi ce qui permettra à l'écran
    // d'expliquer pourquoi une ombre s'arrête là.
    assert.notEqual(cameraOmbreSource3D(4, champ).source, cameraOmbreSource3D(0, champ).source);
  });

  test('rien d’absurde ne produit une caméra dégénérée', () => {
    for (const mauvaise of [undefined, null, NaN, -3, 'abc', {}, Infinity]) {
      const c = cameraOmbreSource3D(mauvaise, champ);
      assert.ok(Number.isFinite(c.far) && c.far > 0,
        `« ${String(mauvaise)} » donne un plan éloigné de ${c.far}`);
      assert.ok(Number.isFinite(c.near) && c.near > 0 && c.near < c.far,
        `« ${String(mauvaise)} » donne un plan proche de ${c.near}`);
    }
    // Et sans champ du tout — l'appelant qui oublie son second argument.
    const sansChamp = cameraOmbreSource3D(0, null);
    assert.ok(Number.isFinite(sansChamp.far) && sansChamp.far > 0);
  });

  test('⚠️ LE PLAN PROCHE N’EST JAMAIS ZÉRO : une caméra d’ombre y perd sa précision', () => {
    assert.ok(NEAR_OMBRE_SOURCE > 0 && NEAR_OMBRE_SOURCE < 1);
    const c = cameraOmbreSource3D(10, champ);
    assert.ok(c.near > 0 && c.near < c.far);
  });
});

describe('Les résolutions sont des puissances de deux, et la source est la moins chère', () => {
  test('⚠️ LE SOLEIL PREND LA MEILLEURE, PARCE QU’ELLE EST GRATUITE — mesuré', () => {
    // 1024 et 2048 donnent le même temps de rendu (0,9 contre 1,0 ms, dans le bruit). On s'attend à
    // arbitrer entre qualité et vitesse, et il n'y a rien à arbitrer : on prend la meilleure.
    const puissanceDeDeux = (n) => Number.isInteger(Math.log2(n));
    assert.ok(puissanceDeDeux(RESOLUTION_OMBRE_SOLEIL));
    assert.ok(puissanceDeDeux(RESOLUTION_OMBRE_SOURCE));
    assert.ok(RESOLUTION_OMBRE_SOLEIL >= 2048,
      'la carte du soleil a été réduite alors que sa finesse ne coûte rien');
  });

  test('⚠️ CELLE D’UNE SOURCE EST PLUS PETITE, ET C’EST UNE CARTE CUBIQUE', () => {
    // Six faces par source et par image : c'est la géométrie qui rend une source coûteuse, pas le
    // hasard. 8 sources font 48 passes de profondeur, mesurées à 3,9 ms contre 0,9 sans ombre.
    assert.ok(RESOLUTION_OMBRE_SOURCE < RESOLUTION_OMBRE_SOLEIL,
      'une source ombre six faces là où le soleil n’en ombre qu’une : sa carte ne peut pas être aussi fine');
  });
});

/**
 * JOURNAL DE MUTATION (#422a, la décision pure des ombres) : neuf fautes, UNE ÉCHAPPÉE CORRIGÉE.
 *
 *   M89 la boîte est cadrée sur le SOL — le défaut mesuré                   ROUGE (×4)
 *   M90 le rayon ne contient plus la diagonale                              VERT → ROUGE
 *   M91 la marge disparaît, les projeteurs hors cadre sont ignorés          ROUGE
 *   M92 le champ cesse de suivre la caméra                                  ROUGE (×3)
 *   M93 une Case sans `camDist` reçoit un champ nul                         ROUGE
 *   M94 une portée nulle donne un plan éloigné nul                          ROUGE (×2)
 *   M95 `source` ne distingue plus les deux règles                          ROUGE (×2)
 *   M96 le seuil accepte l'ombre invisible mesurée                          ROUGE (×2)
 *   M97 la carte du soleil est réduite alors qu'elle est gratuite           ROUGE (×3)
 *
 * ⚠️ M90 A ÉCHAPPÉ, ET C'EST LA MUTATION LA PLUS INSTRUCTIVE DE CE FICHIER. Elle remplace la
 * diagonale par le plus grand des deux demi-côtés — le défaut d'orientation exact que la boîte
 * existe pour éviter. Mon assertion disait « le rayon est AU MOINS la demi-diagonale », et sur une
 * Planche au format Franco-Belge la marge de 1,5 suffisait à couvrir l'écart : le seuil restait
 * franchi, le défaut passait.
 *
 * Il aurait fallu une Planche plus carrée, ou une marge resserrée un jour, pour que des coins
 * d'ombre commencent à manquer — à certains azimuts du soleil seulement, ce qui est le pire genre de
 * symptôme. **Une assertion qui ne mesure qu'un SEUIL laisse passer tout ce qu'un réglage voisin
 * suffit à compenser.** Le test exige maintenant l'ÉGALITÉ — le rayon EST la demi-diagonale, à la
 * marge près — et porte en plus un témoin sur une Planche volontairement déséquilibrée, là où les
 * deux formules cessent de se ressembler.
 *
 * ⚠️ M89 EST LE DÉFAUT MESURÉ EN #422, REJOUÉ À L'IDENTIQUE. Il fait tomber quatre tests, dont celui
 * qui relit le module pour refuser jusqu'au NOM du Sol, et celui qui compare les deux ordres de
 * grandeur — la seconde assertion attrape une régression qui grossirait la boîte sans jamais écrire
 * ce nom.
 *
 * ⚠️ M92 MÉRITE D'ÊTRE GARDÉE POUR CE QU'ELLE VÉRIFIE VRAIMENT. Le test qui la tue ne compare pas la
 * fonction à elle-même : il REPRODUIT le calcul de `framePanelCamera3D` et exige que les deux
 * tombent sur la même valeur. C'est ce qui fera rougir ce fichier le jour où quelqu'un touchera au
 * cadrage d'une Case sans penser aux ombres.
 *
 * ⚠️ CE QUE LA CAMPAGNE NE PEUT PAS MUTER : que la marge de 1,5 soit la bonne, ni que l'ombre soit
 * belle. #422z regarde — et #420c a déjà montré qu'une valeur correctement dérivée peut être
 * franchement mauvaise à l'œil.
 */
