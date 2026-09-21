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
import { sourceSansCommentaires } from './helpers/source.mjs';

import {
  champVisibleDeCase3D, boiteOmbreSoleil3D, cameraOmbreSource3D, ombreSoleilSeraVisible3D,
  MARGE_BOITE_OMBRE, RESOLUTION_OMBRE_SOLEIL, RESOLUTION_OMBRE_SOURCE, NEAR_OMBRE_SOURCE,
  TAILLE_TEXEL_MAX, estUnDessinAuSol3D, EPAISSEUR_MIN_PROJETEUR,
} from '../src/shadows-3d.js';
import {
  PANEL_CAM_DEFAULT_DIST_3D, PERSONA_REAL_HEIGHT_M, WALL_PX_PER_UNIT_3D, GROUND_PLANE_SIZE_3D,
  GROUND_Y_DEFAULT_3D,
} from '../src/constants.js';
import { CHAMPS_FICHE_LUMIERE } from '../src/light-source-3d.js';

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
    // ⚠️ L'INTERDICTION PORTE SUR LES DEUX FONCTIONS DE CADRAGE, ET NON SUR TOUT LE MODULE (#422f).
    // La version précédente refusait la sous-chaîne `GROUND` n'importe où : elle confondait
    // l'ÉTENDUE du Sol — les 12 000 unités, la faute mesurée — avec son ALTITUDE, qui est une tout
    // autre grandeur et que #422f a dû importer pour dire ce qui affleure le sol. Interdire un
    // préfixe plutôt qu'une propriété, c'est bloquer les usages légitimes qu'on n'avait pas prévus ;
    // c'est la faute de forme que le test de `sideLightToggle` venait de payer en #422e.
    ['champVisibleDeCase3D', 'boiteOmbreSoleil3D'].forEach(nom => {
      const i = corps.indexOf(`export function ${nom}(`);
      assert.ok(i > 0, `${nom} est introuvable`);
      const fn = corps.slice(i, corps.indexOf('\n}', i));
      assert.ok(!/GROUND/.test(fn), `une grandeur du Sol est entrée dans ${nom}`);
    });
    // ⚠️ ET LE NOMBRE LUI-MÊME EST BANNI DE TOUT LE MODULE, écrit en toutes lettres comme en
    // séparateurs : recopier 12000 plutôt que d'importer la constante contournerait tout ce qui
    // précède, et c'est précisément ce qu'un remaniement pressé ferait.
    assert.ok(!/12[_\s]?000\b/.test(corps), 'la taille du Sol est recopiée à la main');
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

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * LE RENDU : CE QUI S'ALLUME, CE QUI PROJETTE, CE QUI REÇOIT (#422c)
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ ÉPINGLÉ SUR LA SOURCE, ET C'EST ASSUMÉ. `appliquerOmbresDeCase3D` touche un `WebGLRenderer`,
 * qui n'existe pas sous Node — c'est la moitié que #422a a séparée exprès. Ce qui se vérifie ici est
 * donc le CÂBLAGE : que la décision soit consultée, que l'ordre soit le bon, et que les règles
 * écrites dans les commentaires soient bien celles que le code applique.
 *
 * ⚠️ PAS TENU : que l'ombre apparaisse. Ça se mesure dans un vrai navigateur — et ça l'a été, en
 * #422 puis ici même pour le Sol. Les chiffres sont dans docs/en/cast-shadows.md.
 */
describe('⚠️ LES OMBRES SE REPOSENT À CHAQUE RENDU : la scène est PARTAGÉE (#422c)', () => {
  const RIG = sourceSansCommentaires(
    readFileSync(new URL('../src/rig3d.js', import.meta.url), 'utf8'));
  const SCENE = sourceSansCommentaires(
    readFileSync(new URL('../src/scene3d.js', import.meta.url), 'utf8'));

  test('⚠️ LE RENDU D’UNE CASE LES APPLIQUE, APRÈS L’ÉCLAIRAGE', () => {
    // ⚠️ MÊME PIÈGE QUE L'ÉCLAIRAGE ET QUE LES SOURCES POSÉES, TROISIÈME FOIS. Les Cases se
    // dessinent l'une après l'autre dans la MÊME scène : une ombre laissée allumée s'appliquerait à
    // la suivante, qui n'en veut pas, et le défaut serait attribué à n'importe quoi sauf à sa cause.
    const i = SCENE.indexOf('function renderPanelSceneUncached3D');
    assert.ok(i > 0, 'le rendu de Case est introuvable');
    const corps = SCENE.slice(i, SCENE.indexOf('\n}', i + 2000));
    const posEclairage = corps.indexOf('appliquerEclairageDeCase3D(');
    const posOmbres = corps.indexOf('appliquerOmbresDeCase3D(');
    assert.ok(posOmbres > 0, 'les ombres ne sont plus appliquées au rendu d’une Case');
    assert.ok(posOmbres > posEclairage,
      'les ombres passent avant l’éclairage : elles liraient des valeurs qui vont changer');
  });

  test('⚠️ ET ELLES SE POSENT DANS LES DEUX SENS : `enabled` est écrit sans condition', () => {
    // ⚠️ LE DÉFAUT SYMÉTRIQUE, ET C'EST EXACTEMENT CELUI DE #421h, UN ÉTAGE PLUS BAS. Écrire
    // `if (voulues) renderer.shadowMap.enabled = true;` allumerait sans jamais éteindre : la
    // première Case ombrée contaminerait toutes les suivantes de la Planche. Un état que personne
    // d'autre ne réécrit doit être posé dans les deux branches.
    const i = RIG.indexOf('export function appliquerOmbresDeCase3D');
    assert.ok(i > 0);
    const corps = RIG.slice(i, RIG.indexOf('\n}\n', i));
    assert.match(corps, /shadowMap\.enabled = rendues;/,
      'le drapeau n’est plus posé inconditionnellement : une Case ombrée contaminerait la suivante');
    assert.match(corps, /castShadow = soleil;/,
      'le soleil garde son ombre d’une Case à l’autre');
  });

  test('⚠️ ET LES DEUX DRAPEAUX NE SONT PAS LE MÊME : un soleil invisible n’éteint pas les sources', () => {
    // ⚠️ LE DÉFAUT QUE #422d A FAILLI LAISSER PASSER. #422c écrivait la MÊME valeur dans les deux,
    // ce qui se tenait tant que le soleil était seul à projeter. Depuis qu'une source posée peut
    // projeter, un soleil jugé invisible — caméra assez reculée pour qu'un texel dépasse ce qui
    // projette — aurait éteint le renderer, donc TOUTES les ombres, y compris celles que
    // l'utilisateur venait de cocher source par source. Un réglage sans effet et sans message.
    const i = RIG.indexOf('export function appliquerOmbresDeCase3D');
    const corps = RIG.slice(i, RIG.indexOf('\n}\n', i));
    assert.ok(!/shadowMap\.enabled = soleil/.test(corps),
      'le renderer suit le soleil : une Case éclairée par la seule source cochée n’aurait aucune ombre');
    assert.match(corps, /const rendues = soleil \|\| sources;/,
      'le drapeau du renderer ne consulte plus les deux projeteurs');
    // ⚠️ ET LE COMPTE DES SOURCES SORT DU PLAN, PAS D'UN SECOND FILTRAGE. Refiltrer `elements` ici
    // serait la deuxième copie d'une décision, la famille de défauts que #415 puis #420a ont chacune
    // payée d'une mutation échappée. Le plan est celui que `appliquerLumieresPosees3D` exécute.
    assert.match(corps, /plan\.aAllumer[\s\S]*?\.some\(p => p && p\.projetteOmbre\)/,
      'le compte des sources qui projettent ne vient plus du plan : une seconde copie de la décision');
    assert.ok(!/estUneLumiere3D|hidden3d/.test(corps),
      'la fonction refiltre les Éléments : deux copies d’un même raisonnement, qui s’accordent aujourd’hui');
  });

  test('⚠️ ON NE PAIE PAS SIX PASSES POUR UNE IMAGE INCHANGÉE', () => {
    // L'échéance de #422a, tenue ici. Reculer assez la caméra étale la carte d'ombre jusqu'à ce
    // qu'un texte dépasse ce qui projette : l'ombre disparaît, exactement comme la version étirée
    // au Sol mesurée à 0,00 % de pixels changés. Autant ne pas l'allumer.
    const i = RIG.indexOf('export function appliquerOmbresDeCase3D');
    const corps = RIG.slice(i, RIG.indexOf('\n}\n', i));
    assert.match(corps, /ombreSoleilSeraVisible3D\(panel, page\)/,
      'les ombres s’allument sans vérifier qu’on les verra');
  });

  test('⚠️ LA CARTE CHANGE VRAIMENT DE TAILLE : `mapSize` seul ne suffit pas', () => {
    // ⚠️ PIÈGE DE THREE.JS, ET IL EST SILENCIEUX. Modifier `mapSize` après qu'une cible de rendu a
    // été allouée ne réalloue rien : la résolution demandée est ignorée, et le réglage a l'air posé
    // sans l'être. Il faut libérer la carte pour que Three.js en refasse une.
    const i = RIG.indexOf('export function appliquerOmbresDeCase3D');
    const corps = RIG.slice(i, RIG.indexOf('\n}\n', i));
    assert.match(corps, /shadow\.map\.dispose\(\)/,
      'la carte d’ombre n’est pas libérée : la résolution demandée sera ignorée en silence');
    assert.match(corps, /shadow\.map = null/);
  });
});

describe('⚠️ QUI PROJETTE EST UNE RÈGLE, PAS UNE LISTE DE SITES (#422c)', () => {
  const RIG = sourceSansCommentaires(
    readFileSync(new URL('../src/rig3d.js', import.meta.url), 'utf8'));

  test('⚠️ UN MATÉRIAU QUI NE REÇOIT PAS LA LUMIÈRE NE PROJETTE PAS D’OMBRE', () => {
    // ⚠️ POURQUOI UNE RÈGLE. Poser ces drapeaux à la construction aurait voulu dire les poser à une
    // dizaine d'endroits — Personnages, Objets, Murs, Murs fusionnés, dalles, jonctions, tracés — et
    // en oublier un. C'est l'énumération tenue à la main, la deuxième famille de défauts de ce
    // dépôt, que `buildPropRig3D` documente déjà quelques lignes plus haut.
    //
    // La règle couvre les trois `MeshBasicMaterial` du dépôt sans les nommer : le visage d'un
    // Personnage — un autocollant plat sur la sphère de la tête, qui projette déjà — et les deux
    // sphères d'une Lumière. Faire jeter une ombre à la bille d'une source ferait apparaître dans le
    // dessin la trace d'une chose qui n'existe pas dans la fiction.
    const i = RIG.indexOf('export function marquerProjectionDOmbre3D');
    assert.ok(i > 0, 'la règle de projection est introuvable');
    const corps = RIG.slice(i, RIG.indexOf('\n}\n', i));
    assert.match(corps, /isMeshBasicMaterial/,
      'la règle ne s’appuie plus sur le matériau : il faudra une liste, et elle sera incomplète');
    assert.match(corps, /personaScene3D\.traverse/,
      'la règle ne parcourt plus la scène : un rig neuf ne sera pas couvert');
    // Et aucune énumération de types ne doit être revenue par la fenêtre.
    assert.ok(!/objType|WALL_TYPES|estUneLumiere3D/.test(corps),
      'la règle énumère à nouveau des types : le prochain rig sera oublié');
  });

  test('⚠️ LE SOL EST ÉPARGNÉ PAR LA RÈGLE, et il reçoit par sa propre construction', () => {
    // Il reçoit parce que c'est lui qui rend une ombre LISIBLE. Il ne projette pas parce qu'un plan
    // de 12 000 unités n'occuperait que de la place dans la carte d'ombre.
    const i = RIG.indexOf('export function marquerProjectionDOmbre3D');
    const corps = RIG.slice(i, RIG.indexOf('\n}\n', i));
    assert.match(corps, /ch === groundMesh3D/, 'le Sol n’est plus épargné par le parcours');
    assert.match(RIG, /groundMesh3D\.receiveShadow = true/,
      'le Sol ne reçoit plus : une ombre portée n’aurait nulle part où se poser');
    assert.ok(!/groundMesh3D\.castShadow = true/.test(RIG),
      'le Sol projette : 12 000 unités de plan dans la carte d’ombre');
  });

  test('⚠️ ET LE MARQUAGE NE TOURNE QUE QUAND LES OMBRES SONT ALLUMÉES', () => {
    // Un parcours de la scène par rendu est négligeable devant les 13 ms d'une Case — mais il n'a
    // aucune raison de tourner sur une Case sans ombre, c'est-à-dire sur toutes celles d'un Projet
    // qui n'a jamais touché au réglage.
    const i = RIG.indexOf('export function appliquerOmbresDeCase3D');
    const corps = RIG.slice(i, RIG.indexOf('\n}\n', i));
    //
    // ⚠️ ET IL SUIT LE RENDERER, PAS LE SOLEIL (#422d). Une Case où seule une source posée projette
    // a tout autant besoin de savoir qui jette une ombre : le brancher sur `soleil` aurait laissé
    // les `castShadow` de la scène dans l'état où la Case PRÉCÉDENTE les avait mis.
    assert.match(corps, /if \(rendues\) marquerProjectionDOmbre3D\(\);/,
      'le marquage tourne même sans ombre, ou ne tourne pas quand seule une source projette');
  });
});

describe('⚠️ L’EXPORT SUIT, ET CE N’EST PLUS UNE INFÉRENCE (#422c)', () => {
  test('il passe par le même `drawContent` que l’écran', () => {
    // ⚠️ LA NOTE DE #422 REFUSAIT DE L'INFÉRER, et elle avait raison de s'en méfier : « l'export
    // passe par le même chemin » est exactement le genre de raisonnement que #425k a démenti sur
    // les Bulles. Vérifié plutôt que cru — et cette fois l'inférence était juste.
    const DRAW = sourceSansCommentaires(
      readFileSync(new URL('../src/draw.js', import.meta.url), 'utf8'));
    const i = DRAW.indexOf('export function exportPage');
    assert.ok(i > 0, '`exportPage` est introuvable');
    const corps = DRAW.slice(i, DRAW.indexOf('\nexport ', i + 10));
    assert.match(corps, /drawContent\(/,
      'l’export ne passe plus par drawContent : les ombres pourraient ne pas y être');
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * L'OMBRE D'UNE SOURCE POSÉE : DEUX INTERRUPTEURS HIÉRARCHIQUES (#422d)
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * La Case décide qu'il Y A des ombres ; la source décide si ELLE y participe. C'est le choix de
 * l'utilisateur devant les chiffres de #422 : une carte d'ombre de source est CUBIQUE — six passes
 * de profondeur par lumière et par image, 3,9 ms à huit sources, 2 004 ms de compilation à la
 * première rencontre. Personne ne paie ça sans l'avoir demandé.
 *
 * ⚠️ ÉPINGLÉ SUR LA SOURCE ici encore : `appliquerOmbreSourcePosee3D` touche une `PointLight`, qui
 * n'existe pas sous Node. Ce qui se vérifie est le CÂBLAGE — que la décision pure soit consultée,
 * que les deux interrupteurs soient bien en série, et que l'état soit écrit dans les deux sens.
 */
describe('⚠️ UNE SOURCE NE PROJETTE QUE SI LA CASE ET ELLE LE VEULENT (#422d)', () => {
  const RIG = sourceSansCommentaires(
    readFileSync(new URL('../src/rig3d.js', import.meta.url), 'utf8'));
  const SCENE = sourceSansCommentaires(
    readFileSync(new URL('../src/scene3d.js', import.meta.url), 'utf8'));
  const corpsSource = (() => {
    const i = RIG.indexOf('export function appliquerOmbreSourcePosee3D');
    assert.ok(i > 0, 'l’ombre d’une source posée est introuvable');
    return RIG.slice(i, RIG.indexOf('\n}\n', i));
  })();

  test('⚠️ LES DEUX INTERRUPTEURS SONT EN SÉRIE, ET AUCUN NE SUFFIT SEUL', () => {
    // Cocher la case d'une source sur une Case dont les ombres sont éteintes ne doit RIEN allumer :
    // c'est l'exigence qui justifie l'indice affiché sous la case dans la fiche. Et réciproquement,
    // allumer les ombres d'une Case ne doit pas faire projeter les sources qui n'ont rien demandé —
    // ce serait les 2 004 ms de compilation imposées à qui a seulement voulu l'ombre du soleil.
    assert.match(corpsSource, /ombresDeLaCase && !!projette/,
      'un seul des deux interrupteurs commande : le second réglage est sans effet ou sans garde');
  });

  test('⚠️ ET `castShadow` EST ÉCRIT DANS LES DEUX SENS : le cache de sources est PARTAGÉ', () => {
    // ⚠️ QUATRIÈME FOIS QUE CE DÉFAUT EST REJOUÉ DANS CE DÉPÔT, et la troisième dans ce seul
    // chantier — #421h sur la disposition de la fiche, #422c sur le drapeau du renderer, ici sur
    // une `PointLight`. Le cache `lumierePoseeCache3D` sert toutes les Cases l'une après l'autre :
    // une lumière laissée à `castShadow` vrai projetterait dans la Case suivante, qui ne l'a pas
    // demandé, et l'ombre y apparaîtrait sans cause lisible.
    //
    // ⚠️ ET CE QUI SE VÉRIFIE EST LA NATURE DU RETOUR, PAS SON ABSENCE — la leçon de #421h, où
    // quatre mutations sur six ont échappé parce que l'assertion regardait des POSITIONS RELATIVES
    // qu'un `return` ajouté ne dérange pas. Un garde de NULLITÉ peut précéder l'écriture : sans
    // lumière il n'y a rien à éteindre. Un garde qui consulte les RÉGLAGES, lui, la saute.
    const i = corpsSource.indexOf('lumiere.castShadow =');
    assert.ok(i > 0, 'le drapeau de la source n’est plus posé');
    const avant = corpsSource.slice(corpsSource.indexOf('{'), i);
    const retours = avant.split('\n').filter(l => /\breturn\b/.test(l)).map(l => l.trim());
    retours.forEach(l => {
      assert.ok(!/projette|ombresDeLaCase|portee|champ/.test(l),
        `un retour conditionné aux réglages précède l’écriture (${l}) : la source garderait `
        + 'l’ombre de la Case précédente');
    });
  });

  test('⚠️ LA CAMÉRA VIENT DE LA DÉCISION PURE, PAS D’UN CALCUL REFAIT ICI', () => {
    // C'est la dette de #422a, et la dernière : `cameraOmbreSource3D` existait sans appelant, avec
    // une échéance écrite en NUMÉRO DE TÂCHE. Elle est payée ici.
    assert.match(corpsSource, /cameraOmbreSource3D\(portee, champ\)/,
      'la caméra d’ombre d’une source est recalculée sur place : la décision pure ne sert plus');
    assert.ok(!/Math\.(hypot|max|min)/.test(corpsSource),
      'un calcul de cadrage est revenu dans la couche Three.js, où il ne se teste pas');
  });

  test('⚠️ `near` ET `far` SONT TOUS DEUX POSÉS, et `far` est un filet assumé', () => {
    // ⚠️ CE QUE THREE.JS FAIT DANS NOTRE DOS, vérifié dans node_modules/three/build/three.js :
    // `PointLightShadow.updateMatrices` fait `const far = light.distance || camera.far`. Quand la
    // portée est finie, Three.js l'impose de toute façon ; notre `far` ne sert que dans l'autre
    // cas — la portée nulle, « sans limite », où `cameraOmbreSource3D` en dérive un du champ
    // visible de la Case. Les deux moitiés tombent donc sur la même valeur : ce n'est pas une
    // redondance, c'est la seule prise qu'on ait sur le cas « sans limite ».
    assert.match(corpsSource, /cam\.near = c\.near/, 'le plan proche n’est plus posé');
    assert.match(corpsSource, /cam\.far = c\.far/,
      'le plan éloigné n’est plus posé : une source SANS portée n’aurait aucune caméra d’ombre valide');
    assert.match(corpsSource, /cam\.updateProjectionMatrix\(\)/,
      'la projection n’est pas recalculée : les plans posés sont ignorés en silence');
  });

  test('⚠️ ET LA CARTE CHANGE VRAIMENT DE TAILLE, même piège muet que pour le soleil', () => {
    assert.match(corpsSource, /shadow\.map\.dispose\(\)/,
      'la carte d’ombre n’est pas libérée : la résolution demandée sera ignorée en silence');
    assert.match(corpsSource, /shadow\.map = null/);
  });

  test('⚠️ LE RENDU LA BRANCHE, et sur le MÊME plan que celui qu’il exécute', () => {
    // ⚠️ LA COPIE QUI S'ACCORDE AUJOURD'HUI, refusée une fois de plus. Le drapeau du renderer a
    // besoin de savoir si une source projette AVANT que les lumières soient posées ; refiltrer
    // `elements` une seconde fois aurait donné deux listes qui divergeraient au premier changement.
    // Un plan est PUR : le construire tôt ne coûte rien et ne décide de rien.
    const i = SCENE.indexOf('function renderPanelSceneUncached3D');
    const corps = SCENE.slice(i, SCENE.indexOf('\n}\n', i));
    const posPlan = corps.indexOf('const _planLumieres = planLumieresPosees3D(');
    const posOmbres = corps.indexOf('appliquerOmbresDeCase3D(panel, page, _eclairage, _planLumieres)');
    assert.ok(posPlan > 0, 'le plan des sources n’est plus construit une seule fois');
    assert.ok(posOmbres > posPlan,
      'les ombres se posent avant le plan : elles ne peuvent pas savoir si une source projette');
    assert.equal(corps.split('planLumieresPosees3D(').length - 1, 1,
      'le plan est construit deux fois : deux listes qui divergeront au premier changement');
    assert.match(corps, /appliquerLumieresPosees3D\(_planLumieres, _posLumieres3D, _ombresDeLaCase,/,
      'l’exécution ne reçoit plus le verdict de la Case : les sources projetteraient toujours, ou jamais');
    assert.match(corps, /champVisibleDeCase3D\(panel, page\)/,
      'le champ visible n’est plus transmis : une source SANS portée perdrait son plan éloigné');
  });

  test('⚠️ ET L’EXÉCUTION S’EN SERT : recevoir un argument n’est pas l’employer (M118)', () => {
    // ═══════════════════════════════════════════════════════════════════════════════════════════
    // ⚠️ LA MUTATION QUI A ÉCHAPPÉ, ET C'ÉTAIT LA PLUS GROSSE DE LA CAMPAGNE
    // ═══════════════════════════════════════════════════════════════════════════════════════════
    //
    // Retirer PUREMENT ET SIMPLEMENT l'appel à `appliquerOmbreSourcePosee3D` — donc rendre la case
    // « projette une ombre » entièrement décorative — laissait la suite VERTE. Douze autres
    // mutations rougissaient, y compris des déplacements d'une ligne ; celle qui supprimait la
    // fonctionnalité passait.
    //
    // La raison est la famille de défauts que ce dépôt nomme déjà : **un test qui vérifie qu'un
    // identifiant APPARAÎT et non qu'il GOUVERNE**. J'avais vérifié que le plan arrive, que le
    // verdict de la Case arrive, que le champ visible arrive — trois arrivées, et pas une seule
    // consommation. Un argument reçu et jeté satisfait toutes ces assertions.
    //
    // La parade tient en une règle, et elle a des dents au-delà de cette mutation : **aucun
    // paramètre de l'exécution ne reste inemployé**. Elle attrape l'appel supprimé (deux paramètres
    // deviennent orphelins) comme l'argument oublié dans l'appel.
    const j = SCENE.indexOf('function appliquerLumieresPosees3D(');
    assert.ok(j > 0, 'l’exécution du plan des sources est introuvable');
    const sig = SCENE.slice(SCENE.indexOf('(', j) + 1, SCENE.indexOf(')', j));
    const params = sig.split(',').map(t => t.trim()).filter(Boolean);
    assert.ok(params.length >= 4,
      'l’exécution a perdu des paramètres : le verdict de la Case ou le champ visible ne lui parvient plus');
    const corpsExec = SCENE.slice(SCENE.indexOf('{', j), SCENE.indexOf('\n}\n', j));
    params.forEach(nom => {
      // Le premier emploi d'un paramètre est dans le corps, pas dans sa propre déclaration.
      assert.ok(new RegExp('\\b' + nom + '\\b').test(corpsExec),
        `le paramètre « ${nom} » est reçu et jamais employé : quelque chose a cessé d’être branché`);
    });
    assert.match(corpsExec, /appliquerOmbreSourcePosee3D\(l, p\.portee, p\.projetteOmbre, ombresDeLaCase, champVisible\)/,
      'les sources ne reçoivent plus leur ombre : la case « projette une ombre » est décorative');
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * LA CASE DANS LA FICHE (#422d)
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('⚠️ « PROJETTE UNE OMBRE » SE RÈGLE DANS LA FICHE D’UNE LUMIÈRE (#422d)', () => {
  const HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const MODALS = sourceSansCommentaires(
    readFileSync(new URL('../src/modals.js', import.meta.url), 'utf8'));
  const EVENTS = sourceSansCommentaires(
    readFileSync(new URL('../src/events.js', import.meta.url), 'utf8'));

  test('⚠️ ELLE VIT DANS « LUMINOSITÉ », SOUS LA PORTÉE DONT ELLE DÉPEND', () => {
    // Sous la portée, et ce n'est pas un hasard de mise en page : c'est elle qui donne le plan
    // éloigné de la caméra d'ombre quand elle est finie. Les lire dans l'ordre inverse ferait
    // découvrir la contrainte après coup.
    const iSection = HTML.indexOf('data-section="luminosite"');
    assert.ok(iSection > 0, 'la section Luminosité est introuvable');
    const iPortee = HTML.indexOf('objectLightRangeInput', iSection);
    const iOmbre = HTML.indexOf('objectLightShadowCheckbox', iSection);
    assert.ok(iOmbre > iPortee, 'la case précède la portée dont elle dépend');
  });

  test('⚠️ ET SON INDICE DIT POURQUOI ELLE PEUT NE RIEN FAIRE', () => {
    // ⚠️ SANS CE MOT, COCHER SANS RIEN VOIR SE LIT COMME UNE PANNE. Le premier interrupteur est
    // ailleurs — dans la section Lumière de la Case —, et rien dans la fiche ne le laisse deviner.
    // Le dépôt a déjà payé ce genre de silence : #420f a mesuré qu'une portée de 0 signifie « sans
    // limite » et non « éteinte », ce qu'aucune étiquette ne disait.
    assert.match(HTML, /id="objectLightShadowHint"/,
      'la case n’a plus d’indice : un réglage sans effet visible et sans explication');
    const I18N = readFileSync(new URL('../src/i18n.js', import.meta.url), 'utf8');
    assert.match(I18N, /#objectLightShadowHint/,
      'l’indice n’est plus traduit : il resterait en français dans l’interface anglaise');
    assert.match(I18N, /'Casts a shadow', 'Projette une ombre'/,
      'le libellé de la case n’est plus traduit');
  });

  test('⚠️ LUE À L’OUVERTURE, ÉCRITE À L’ENREGISTREMENT, ET SOUS LA GARDE DE TYPE', () => {
    // ⚠️ LA GARDE EST CELLE DE #421b, ET #421g A MONTRÉ CE QU'ELLE COÛTE QUAND ELLE MANQUE : hors
    // d'elle, un champ MASQUÉ serait relu pour TOUS les Éléments et écraserait leur donnée. Ici ce
    // serait `projetteOmbre: false` posé sur chaque voiture au premier Enregistrer — invisible,
    // puisque rien ne lit ce champ sur une voiture, jusqu'au jour où quelque chose le lirait.
    assert.match(MODALS, /objectLightShadowCheckbox\.checked = !!r\.projetteOmbre/,
      'la case ne montre plus l’état enregistré : elle s’ouvrirait toujours décochée');
    const i = EVENTS.indexOf('objectModalSave.onclick');
    const corps = EVENTS.slice(i, EVENTS.indexOf('\n};', i));
    const iGarde = corps.indexOf('if (estUneLumiere3D(S.modalTarget)) {');
    const iEcriture = corps.indexOf('S.modalTarget.projetteOmbre =');
    assert.ok(iGarde > 0 && iEcriture > iGarde,
      'la case est enregistrée hors de la garde de type : elle écrirait sur tous les Éléments');
    assert.ok(iEcriture < corps.indexOf('\n    }', iGarde),
      'l’écriture est sortie du bloc de la garde');
  });

  test('⚠️ ET SON CHAMP SORT DE LA TABLE DE DISPOSITION, comme tout champ à bascule', () => {
    // La propriété de #421a : tout élément à bascule de la modale sort de la table EXACTEMENT une
    // fois. Un champ absent est précisément celui qui restera visible par accident sur une voiture.
    // Le test de coïncidence de light-source-3d.test.mjs le tient mécaniquement ; on vérifie ici
    // que l'entrée existe et qu'elle est bien MONTRÉE.
    assert.equal(CHAMPS_FICHE_LUMIERE.objectLightShadowField, true,
      'la case « projette une ombre » est masquée sur la fiche d’une Lumière');
  });
});

/**
 * JOURNAL DE MUTATION (#422c, le rendu des ombres) : huit fautes rejouées.
 *
 *   M102 les ombres s'allument sans jamais s'éteindre                       ROUGE
 *   M103 six passes payées pour une image inchangée                         ROUGE
 *   M104 la résolution demandée est ignorée en silence                      ROUGE
 *   M105 la bille d'une Lumière projette une ombre                          ROUGE
 *   M106 le Sol entre dans la carte d'ombre                                 ROUGE
 *   M107 le Sol ne reçoit plus : une ombre sans support                     ROUGE
 *   M108 le marquage tourne même sans ombre                                 ROUGE
 *   M109 le rendu n'applique plus les ombres                                ROUGE
 *
 * ⚠️ M102 EST LA FAUTE DE #421h, REJOUÉE UN ÉTAGE PLUS BAS. Écrire
 * `if (voulues) shadowMap.enabled = true;` allume sans jamais éteindre : la première Case ombrée
 * d'une Planche contaminerait toutes les suivantes, et le défaut se lirait comme « les ombres
 * apparaissent au hasard ». Un état que personne d'autre ne réécrit doit être posé DANS LES DEUX
 * BRANCHES — c'est la troisième fois que cette règle sert dans ce dépôt.
 *
 * ⚠️ M104 EST UN PIÈGE DE THREE.JS, ET IL EST MUET. Modifier `mapSize` après qu'une cible de rendu a
 * été allouée ne réalloue rien : la résolution demandée est ignorée, et le réglage a l'air posé sans
 * l'être. On ne peut pas le lire dans le code de l'appelant, seulement le savoir.
 *
 * ⚠️ M105 DIT CE QUE LA RÈGLE PROTÈGE. Elle ne parle pas de types mais de MATÉRIAUX : un
 * `MeshBasicMaterial` ignore l'éclairage, donc décrit un repère ou un dessin, pas un corps posé dans
 * la scène. Sans elle il aurait fallu énumérer les sites de création — dix endroits, et le prochain
 * rig oublié. La mutation fait projeter la bille d'une source : la trace, dans le dessin, d'une
 * chose qui n'existe pas dans la fiction.
 *
 * ⚠️ ET DEUX INFÉRENCES QUE LA NOTE DE #422 REFUSAIT DE CROIRE ONT ÉTÉ VÉRIFIÉES ICI, avec deux
 * issues opposées en nature mais une seule leçon. Le Sol de 12 000 unités reçoit PROPREMENT —
 * 1,49 % de pixels changés, 0,000 % loin du projeteur, aucune acné — et l'export suit bien, puisque
 * `exportPage` appelle le même `drawContent`. Les deux inférences tombaient juste. #425k avait
 * démenti exactement le même raisonnement sur les Bulles : c'est pour cela qu'on vérifie, et le fait
 * qu'elles aient eu raison cette fois ne rend pas la vérification inutile.
 */

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * UN DESSIN POSÉ SUR LE SOL N'EST PAS UN CORPS (#422f)
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ SIGNALÉ À L'USAGE, et le défaut était dans ma règle de #422c. Les chemins étaient rayés de
 * bandes : un Tracé est un ruban PLAT posé sept millimètres au-dessus du Sol avec un matériau
 * éclairé, donc un projeteur sous la seule règle du matériau — et la carte d'ombre ne sépare pas
 * deux surfaces distantes de sept millimètres quand son texel en couvre trente-neuf.
 */
describe('⚠️ CE QUI AFFLEURE LE SOL REÇOIT MAIS NE PROJETTE PAS (#422f)', () => {
  const RIG = sourceSansCommentaires(
    readFileSync(new URL('../src/rig3d.js', import.meta.url), 'utf8'));
  const SCENE = readFileSync(new URL('../src/scene3d.js', import.meta.url), 'utf8');

  test('⚠️ LE SEUIL COUVRE TOUS LES RUBANS QUE L’APPLICATION CONSTRUIT VRAIMENT', () => {
    // ═══════════════════════════════════════════════════════════════════════════════════════════
    // ⚠️ LE SEUIL EST CONFRONTÉ AU CODE, PAS RECOPIÉ À CÔTÉ DE LUI
    // ═══════════════════════════════════════════════════════════════════════════════════════════
    //
    // Écrire `assert.equal(EPAISSEUR_MIN_PROJETEUR, 0.02)` n'aurait rien vérifié du tout : ç'aurait
    // été la constante comparée à elle-même. Ce qui doit être vrai, c'est que le seuil COUVRE les
    // hauteurs auxquelles l'application pose réellement ses rubans plats — et ces hauteurs sont
    // lues dans scene3d.js, aux sites d'appel des deux constructeurs qui produisent du plat.
    //
    // Conséquence voulue : poser demain un nouveau ruban plus haut que le seuil fait rougir ce
    // test, et le moiré est signalé AVANT d'apparaître à l'écran plutôt qu'après.
    const hauteurs = [];
    for (const m of SCENE.matchAll(/buildTrac.(?:Route|Dash)Geometry3D\s*\(([\s\S]{0,300}?)\)/g)) {
      for (const y of m[1].matchAll(/GROUND_Y_DEFAULT_3D\s*\+\s*([0-9.]+)/g)) {
        hauteurs.push(Number(y[1]));
      }
    }
    // Les deux constructeurs portent aussi un défaut interne, quand l'appelant ne donne pas de Y.
    for (const m of SCENE.matchAll(/yOff[\s\S]{0,60}?GROUND_Y_DEFAULT_3D\s*\+\s*([0-9.]+)/g)) {
      hauteurs.push(Number(m[1]));
    }
    // TÉMOIN : le relevé voit quelque chose. Sans lui, un motif devenu faux déclarerait la
    // conformité pour la pire des raisons — n'avoir rien trouvé à vérifier. C'est nommément l'une
    // des familles de défauts de ce dépôt : mesurer une absence sans vérifier que l'instrument
    // sait voir une présence.
    assert.ok(hauteurs.length >= 3,
      `le relevé des rubans plats ne trouve que ${hauteurs.length} hauteur(s) : le motif ne lit plus le code`);
    hauteurs.forEach(h => {
      assert.ok(estUnDessinAuSol3D(GROUND_Y_DEFAULT_3D + h),
        `un ruban plat posé à ${h * 1000} mm du Sol projette encore : c’est le moiré signalé à l’usage`);
    });
  });

  test('⚠️ ET LE SEUIL NE MANGE PAS LES CORPS : il lit le SOMMET, pas la base', () => {
    // ⚠️ LA DISTINCTION QUI SAUVE LA RÈGLE. Une haie est posée à `GROUND_Y + 0,02` — pile sur le
    // seuil — mais c'est sa BASE. Son sommet est un mètre plus haut, et elle projette. Tester la
    // position de l'objet, ou sa base, aurait supprimé l'ombre de tout ce qui est posé par terre,
    // c'est à dire de presque tout.
    assert.ok(!estUnDessinAuSol3D(GROUND_Y_DEFAULT_3D + 0.02 + 1.0), 'une haie a cessé de projeter');
    assert.ok(!estUnDessinAuSol3D(GROUND_Y_DEFAULT_3D + 0.15),
      'une dalle funéraire de 15 cm a cessé de projeter');
    assert.ok(!estUnDessinAuSol3D(GROUND_Y_DEFAULT_3D + PERSONA_REAL_HEIGHT_M),
      'un Personnage a cessé de projeter');
    // Et la frontière est franche des deux côtés.
    assert.ok(estUnDessinAuSol3D(GROUND_Y_DEFAULT_3D),
      'une surface exactement au niveau du Sol projette encore');
    assert.ok(!estUnDessinAuSol3D(GROUND_Y_DEFAULT_3D + EPAISSEUR_MIN_PROJETEUR * 2),
      'le seuil déborde : le double de l’épaisseur retenue est encore pris pour un dessin');
    // Une valeur qui n'est pas un nombre ne doit pas éteindre une ombre en silence.
    assert.equal(estUnDessinAuSol3D(undefined), false);
    assert.equal(estUnDessinAuSol3D(NaN), false);
  });

  test('⚠️ RECEVOIR ET PROJETER NE SONT PLUS LE MÊME DRAPEAU', () => {
    // ⚠️ UN DESSIN AU SOL DOIT RECEVOIR. Une ombre d'arbre qui s'arrêterait net au bord d'une allée
    // serait pire que pas d'ombre du tout — elle se lirait comme un trou dans le dessin. Les deux
    // drapeaux s'écrivaient ensemble tant que rien n'était plat ; ils se séparent ici.
    const i = RIG.indexOf('export function marquerProjectionDOmbre3D');
    const corps = RIG.slice(i, RIG.indexOf('\n}\n', i));
    assert.match(corps, /receiveShadow = recoitLaLumiere;/,
      'un dessin au sol ne reçoit plus : les ombres s’arrêteraient net au bord des allées');
    assert.match(corps, /castShadow = recoitLaLumiere && !auSol;/,
      'la seconde règle n’est plus appliquée, ou les deux drapeaux ont été recollés');
    assert.match(corps, /estUnDessinAuSol3D\(/,
      'le critère est recalculé sur place au lieu de venir de la décision pure');
    // ⚠️ ET C'EST LE SOMMET DANS LE MONDE QUI EST LU, pas la position de l'objet : un ruban est posé
    // à l'origine de son groupe, et seule sa géométrie transformée dit où il est réellement.
    assert.match(corps, /setFromObject\(ch\)[\s\S]{0,120}?\.max\.y/,
      'la règle lit autre chose que le sommet réel : la position d’un groupe ne dit pas où est le ruban');
    // La règle reste géométrique : aucune énumération de types n'est revenue par la fenêtre.
    assert.ok(!/objType|WALL_TYPES|trac|terrain/i.test(corps),
      'la règle énumère à nouveau des types : le prochain ruban plat sera oublié');
  });
});

/**
 * JOURNAL DE MUTATION (#422d, l'ombre d'une source posée) : quatorze fautes rejouées.
 *
 *   M110 la case de la source suffit : la Case ne commande plus rien       ROUGE
 *   M111 toute source projette dès que la Case a des ombres                ROUGE
 *   M112 la source garde son ombre de la Case précédente                   ROUGE
 *   M113 une source SANS portée perd son plan éloigné                      ROUGE
 *   M114 les plans posés sont ignorés en silence                           ROUGE
 *   M115 la résolution demandée est ignorée en silence                     ROUGE
 *   M116 un soleil invisible éteint les ombres des sources cochées         ROUGE
 *   M117 le marquage ignore une Case où seule une source projette          ROUGE
 *   M118 les sources ne projettent JAMAIS : la case est décorative    ⚠️ ÉCHAPPÉE, puis ROUGE
 *   M119 le verdict de la Case est ignoré : les sources projettent toujours ROUGE
 *   M120 la fiche s'ouvre toujours décochée                                ROUGE
 *   M121 l'enregistrement perd la case : cocher ne sert à rien             ROUGE
 *   M122 la case est masquée sur la fiche : réglage introuvable            ROUGE
 *   M123 le champ visible est jeté dans l'appel                            ROUGE
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * ⚠️ M118 A ÉCHAPPÉ, ET C'ÉTAIT LA PLUS GROSSE MUTATION DE LA CAMPAGNE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Retirer purement et simplement l'appel à `appliquerOmbreSourcePosee3D` — donc rendre la case
 * « projette une ombre » entièrement DÉCORATIVE, la fonctionnalité de cette tâche supprimée —
 * laissait la suite verte. Treize autres mutations rougissaient, y compris des déplacements d'une
 * seule ligne. Celle qui enlevait tout passait.
 *
 * ⚠️ LA RAISON EST UNE FAMILLE DE DÉFAUTS QUE CE DÉPÔT NOMME DÉJÀ : un test qui vérifie qu'un
 * identifiant APPARAÎT et non qu'il GOUVERNE. J'avais vérifié que le plan ARRIVE à
 * `appliquerOmbresDeCase3D`, que le verdict de la Case ARRIVE à `appliquerLumieresPosees3D`, que le
 * champ visible ARRIVE aussi. Trois arrivées, pas une seule consommation — et un argument reçu puis
 * jeté satisfait les trois.
 *
 * ⚠️ ET LA PARADE N'EST PAS « UNE ASSERTION DE PLUS », c'est une RÈGLE : aucun paramètre de
 * l'exécution ne reste inemployé. Elle a des dents au-delà de la mutation qui l'a provoquée —
 * M123, ajoutée après coup, remplace le champ visible par `null` dans l'appel, et rougit aussi.
 * Une assertion écrite pour UNE mutation ne protège que d'elle ; une règle couvre ce qu'on n'a pas
 * pensé à muter. C'est la leçon de #421h, où quatre mutations sur six avaient échappé pour avoir
 * vérifié des POSITIONS RELATIVES plutôt que des propriétés.
 *
 * ⚠️ M110 ET M111 TIENNENT LES DEUX INTERRUPTEURS SÉPARÉMENT, et il fallait les deux. M110 laisse
 * la source décider seule : une Case sans ombres en aurait, au prix mesuré de six passes cubiques.
 * M111 laisse la Case décider seule : cocher « ombres portées » imposerait 2 004 ms de compilation
 * à qui ne voulait que l'ombre du soleil. Une seule des deux mutations aurait laissé croire que la
 * hiérarchie tient.
 *
 * ⚠️ M116 EST LE DÉFAUT QUE LA REFONTE DE #422c A ÉVITÉ DE JUSTESSE. `shadowMap.enabled` et
 * `castShadow` recevaient la même valeur tant que le soleil était seul à projeter. Un soleil jugé
 * invisible — caméra assez reculée pour qu'un texel dépasse ce qui projette — aurait alors éteint
 * le renderer, donc TOUTES les ombres, y compris celles cochées source par source. Le réglage
 * aurait été sans effet, sans le moindre message. Deux drapeaux de portées différentes ne peuvent
 * pas partager une valeur « parce qu'aujourd'hui elle coïncide ».
 *
 * ⚠️ CE QUE LA CAMPAGNE NE PEUT PAS MUTER : que l'ombre d'une source soit BELLE, ni que la portée
 * dérivée du champ visible soit la bonne quand la portée vaut « sans limite ». #422z regarde.
 */

/**
 * JOURNAL DE MUTATION (#422f, ce qui affleure le sol) : huit fautes rejouées.
 *
 *   M131 le moiré revient : un ruban plat projette sur le Sol              ROUGE
 *   M132 les ombres s'arrêtent net au bord des allées                      ROUGE
 *   M133 la position du groupe lue au lieu du sommet réel                  ROUGE
 *   M134 la base lue au lieu du sommet                                     ROUGE
 *   M135 le seuil passe sous les rubans                                    ROUGE
 *   M136 le seuil déborde : une marche de 30 cm cesse de projeter          ROUGE
 *   M137 une surface pile au niveau du Sol projette encore                 ROUGE
 *   M138 une hauteur illisible éteint l'ombre en silence                   ROUGE
 *
 * ⚠️ CE CHANTIER EST NÉ D'UN DÉFAUT SIGNALÉ À L'USAGE, et la cause était dans ma propre règle de
 * #422c : « un matériau qui reçoit la lumière projette une ombre ». Elle était bonne contre
 * l'énumération de types — elle l'est toujours — et aveugle à une seconde question qu'elle ne
 * posait pas : un matériau éclairé peut décrire un DESSIN plutôt qu'un corps, s'il est plat et
 * posé par terre. Une règle juste peut être incomplète, et c'est l'écran qui l'a dit.
 *
 * ⚠️ M133 ET M134 SONT LA MÊME ERREUR À DEUX PROFONDEURS, et il fallait les deux. Lire
 * `ch.position.y` semble naturel : c'est faux, un ruban est posé à l'origine de son groupe et sa
 * géométrie porte seule sa vraie hauteur. Lire `min.y` semble prudent : c'est pire, tout ce qui
 * REPOSE sur le sol — Personnages, arbres, pierres tombales — a sa base au sol et cesserait de
 * projeter. Seul le SOMMET distingue un corps d'un dessin.
 *
 * ⚠️ M135 ET M136 ENCADRENT LE SEUIL PAR LE HAUT ET PAR LE BAS, et c'est ce qui le rend autre chose
 * qu'un nombre écrit au hasard. En dessous il laisse repasser les rubans — le moiré revient ; au
 * dessus il mange les corps bas. Entre les deux, il n'y a rien à régler.
 *
 * ⚠️ ET LE SEUIL EST CONFRONTÉ AU CODE PLUTÔT QUE RECOPIÉ. Le test relève dans scene3d.js les
 * hauteurs auxquelles l'application pose RÉELLEMENT ses rubans plats, aux sites d'appel des deux
 * constructeurs qui en produisent, et exige que le seuil les couvre toutes. `assert.equal(seuil,
 * 0.02)` aurait comparé la constante à elle-même. Conséquence voulue : poser demain un ruban plus
 * haut que le seuil fait rougir la suite, et le moiré est signalé AVANT d'apparaître à l'écran.
 *
 * ⚠️ UN TEST DE #422a A DÛ ÊTRE RESSERRÉ, troisième faute de forme de la même famille en trois
 * tâches. Il refusait la sous-chaîne `GROUND` dans TOUT le module, pour garder fermée l'erreur des
 * 12 000 unités du Sol — et confondait ainsi l'ÉTENDUE du Sol, la faute mesurée, avec son
 * ALTITUDE, qu'il a bien fallu importer ici. L'interdiction porte désormais sur les deux fonctions
 * de CADRAGE, où elle a un sens, plus un bannissement du nombre lui-même dans tout le module.
 * Interdire un préfixe plutôt qu'une propriété bloque les usages légitimes qu'on n'avait pas
 * prévus : c'est exactement ce que le test de `sideLightToggle` avait payé une tâche plus tôt.
 */
