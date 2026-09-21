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
  RESOLUTION_OMBRE_SOLEIL, RESOLUTION_OMBRE_SOURCE, NEAR_OMBRE_SOURCE,
  sphereTroncDeVision3D, PROFONDEUR_OMBRE_CAMDIST,
  TAILLE_TEXEL_MAX, estUnDessinAuSol3D, EPAISSEUR_MIN_PROJETEUR,
  PALIER_RAYON_OMBRE, repereOmbreSoleil3D, centreAccrocheOmbre3D,
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
    // ⚠️ LA GRANDEUR JUGÉE EST LE RAYON BRUT, celui que la dérivation produit. Depuis #422g le rayon
    // effectif est ARRONDI au palier supérieur pour stabiliser la grille de texels : c'est une
    // décision d'affichage posée par-dessus, qui peut le doubler, et la confondre avec la dérivation
    // rendrait ce test sensible à un réglage qui n'a rien à voir avec le Sol.
    assert.ok(2 * b.rayonBrut < GROUND_PLANE_SIZE_3D / 20,
      `la boîte dérivée fait ${(2 * b.rayonBrut).toFixed(0)} unités pour un Sol de ${GROUND_PLANE_SIZE_3D}`);
    // ⚠️ ET LA PREUVE QUI NE DÉPEND D'AUCUN SEUIL CHOISI : le rayon est proportionnel à `camDist`,
    // donc à la CAMÉRA, et pas à une grandeur du décor. Une boîte reprise sur le Sol serait
    // CONSTANTE — c'est la signature que ce test attrape, et aucune fraction arbitraire ne la
    // remplace. La borne ci-dessus ne garde plus que l'ordre de grandeur.
    const r1 = boiteOmbreSoleil3D({ camDist: 20 }, PAGE).rayonBrut;
    const r2 = boiteOmbreSoleil3D({ camDist: 40 }, PAGE).rayonBrut;
    assert.ok(Math.abs(r2 / r1 - 2) < 1e-9,
      `doubler camDist change le rayon d’un facteur ${(r2 / r1).toFixed(3)} : il ne suit plus la caméra`);
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
    // ⚠️ DEPUIS #422h C'EST UNE SPHÈRE, ET L'EXIGENCE S'ÉNONCE MIEUX : elle doit CONTENIR les huit
    // coins du tronc de vision. C'est la propriété dont l'ancienne « demi-diagonale × marge » était
    // une approximation à une seule profondeur — celle qui a coûté le défaut du mur du fond.
    //
    // ⚠️ ET ON VÉRIFIE LA RÈGLE, PAS UNE DE SES CONSÉQUENCES CHIFFRÉES. Première version : « le
    // rayon est au moins la demi-diagonale ». La mutation M90 — remplacer la diagonale par le plus
    // grand des deux demi-côtés — y a ÉCHAPPÉ, parce que la marge de 1,5 suffisait à couvrir
    // l'écart sur une Planche de ce format. Une assertion qui ne mesure qu'un SEUIL laisse passer
    // tout ce qu'un réglage voisin suffit à compenser. On énumère donc les coins.
    for (const camDist of [12, 30, 120]) {
      const c = champVisibleDeCase3D({ camDist }, PAGE);
      const b = boiteOmbreSoleil3D({ camDist }, PAGE);
      const t = sphereTroncDeVision3D({ camDist }, PAGE);
      const tl = c.demiLargeur / camDist, th = c.demiHauteur / camDist;
      // Les coins, en repère caméra : profondeur 0 (la caméra) et profondeur F (le fond).
      for (const prof of [0, t.profondeur]) {
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
          const d3 = Math.hypot(prof * tl * sx, prof * th * sy, prof - t.decalage);
          assert.ok(d3 <= b.rayonBrut + 1e-9,
            `à camDist ${camDist}, un coin du tronc à la profondeur ${prof.toFixed(0)} est HORS de ` +
            `la sphère (${d3.toFixed(2)} > ${b.rayonBrut.toFixed(2)}) : son ombre sera coupée`);
        }
      }
      // ⚠️ ET ELLE N'EST PAS PLUS GRANDE QUE NÉCESSAIRE : le rayon touche le coin du fond. Sans
      // cette égalité, une sphère démesurée passerait le test ci-dessus en brouillant toutes les
      // ombres — c'est la même faute que M90, dans l'autre sens.
      const coinFond = Math.hypot(t.profondeur * tl, t.profondeur * th, t.profondeur - t.decalage);
      assert.ok(Math.abs(b.rayonBrut - Math.max(coinFond, t.decalage)) < 1e-9,
        `à camDist ${camDist}, la sphère est plus grande que le tronc : les texels grossissent pour rien`);
      // ⚠️ ET L'ARRONDI DE #422g NE RÉTRÉCIT JAMAIS LA BOÎTE. Arrondir vers le bas la ferait passer
      // SOUS le champ visible, et les ombres seraient coupées près des bords — un défaut pire que
      // le rampement qu'on corrige, et qui ne se verrait que sur certaines Cases.
      assert.ok(b.rayon >= b.rayonBrut,
        `à camDist ${camDist}, l’arrondi rétrécit la boîte : les ombres seront coupées aux bords`);
      // Et son coût est BORNÉ : au plus un palier, donc au plus un doublement du texel.
      assert.ok(b.rayon < b.rayonBrut * PALIER_RAYON_OMBRE,
        `à camDist ${camDist}, l’arrondi coûte plus d’un palier : la finesse chute pour rien`);
    }
    // Et le témoin de la formule elle-même, sur une Planche volontairement DÉSÉQUILIBRÉE : c'est là
    // que « la diagonale » et « le plus grand côté » cessent de se ressembler.
    const large = { w: 3000, h: 1000 };
    const cl = champVisibleDeCase3D({ camDist: 30 }, large);
    const bl = boiteOmbreSoleil3D({ camDist: 30 }, large);
    assert.ok(bl.rayonBrut > Math.max(cl.demiLargeur, cl.demiHauteur),
      'sur une Planche très large, la sphère se contente du plus grand côté et coupe les coins');
  });

  test('⚠️ UN ÉLÉMENT HORS CHAMP PROJETTE DANS LE CHAMP, et la sphère le contient', () => {
    // Un Mur posé à gauche jette son ombre vers la droite. Une boîte collée au champ visible le
    // laisserait dehors, et son ombre disparaîtrait alors qu'on la verrait dans la réalité.
    //
    // ⚠️ `MARGE_BOITE_OMBRE` A DISPARU EN #422h, ET CE TEST DIT POURQUOI IL N'EN FAUT PLUS. La marge
    // de 1,5 couvrait ce besoin à la main ; la sphère du tronc le couvre par construction, puisqu'un
    // tronc contient tout ce qui est visible jusqu'à quatre fois la profondeur d'orbite — donc
    // largement de quoi loger un projeteur hors cadre.
    const c = champVisibleDeCase3D({ camDist: 30 }, PAGE);
    const b = boiteOmbreSoleil3D({ camDist: 30 }, PAGE);
    assert.ok(b.rayonBrut > Math.hypot(c.demiLargeur, c.demiHauteur) * 1.5,
      'la sphère ne dépasse plus le champ d’orbite : les projeteurs hors cadre seront ignorés');
    const SRC = readFileSync(new URL('../src/shadows-3d.js', import.meta.url), 'utf8');
    const corps = SRC.replace(/\/\*[\s\S]*?\*\//g, '').split('\n')
      .filter(l => !/^\s*\/\//.test(l)).join('\n');
    assert.ok(!/MARGE_BOITE_OMBRE/.test(corps),
      'la marge choisie à la main est revenue : la sphère la rend inutile');
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
    // ⚠️ LA MARGE EST EXPRIMÉE EN PALIERS, PAS EN QUART ARBITRAIRE (#422g). Ce qui la consomme
    // désormais, c'est l'arrondi du rayon, qui se compte en doublements : la dire « en quarts »
    // laissait croire à un réglage continu.
    //
    // ⚠️ ET ELLE A BEL ET BIEN DIMINUÉ. Elle valait plus de quatre avant #422g, elle vaut 3,5 —
    // l'arrondi a mangé la différence, et c'est le prix ANNONCÉ de la stabilité. L'exigence tenue
    // est qu'un palier de plus ne ferait toujours pas disparaître l'ombre : c'est la marge utile,
    // celle qui dit ce qui arriverait si le cadrage bougeait d'un cran.
    assert.ok(b.tailleTexel * PALIER_RAYON_OMBRE < TAILLE_TEXEL_MAX,
      `au cadrage par défaut le texel vaut ${b.tailleTexel.toFixed(3)}, à moins d’un palier du seuil ` +
      `${TAILLE_TEXEL_MAX.toFixed(3)} : le cadran suivant ferait disparaître l’ombre`);
    assert.ok(TAILLE_TEXEL_MAX / b.tailleTexel > 3,
      `il ne reste que ${(TAILLE_TEXEL_MAX / b.tailleTexel).toFixed(1)} fois de marge au cadrage par défaut`);
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

  test('⚠️ LE MARQUAGE TOURNE QUAND LA SCÈNE EST COMPLÈTE, PAS AVANT (#422i)', () => {
    // ═══════════════════════════════════════════════════════════════════════════════════════════
    // ⚠️ LE DÉFAUT SIGNALÉ À L'USAGE : « AU REDÉMARRAGE, LA CASE S'AFFICHE SANS OMBRE »
    // ═══════════════════════════════════════════════════════════════════════════════════════════
    //
    // Le réglage était enregistré, relu et appliqué ; l'image n'avait pas d'ombre. La cause est un
    // ORDRE. Le parcours qui pose `castShadow` vivait dans `appliquerOmbresDeCase3D`, appelée en
    // TÊTE du rendu ; les rigs de la Case sont construits à la demande, trois cents lignes plus
    // bas. Tout rig créé pendant CE rendu arrivait après le parcours, avec le `castShadow` faux par
    // défaut de Three.js.
    //
    // ⚠️ ET LE CACHE FIGEAIT LE RÉSULTAT. En session, cocher la case redessine une Case dont les
    // rigs existent déjà : tout marche. À froid, la PREMIÈRE image d'une Case construit ses rigs,
    // donc les manque tous — et cette image sans ombre part dans le cache, où rien ne la remet en
    // cause puisque la signature n'a pas bougé. Un défaut d'ordre doublé d'un cache qui le fige.
    //
    // ⚠️ L'ANCIEN TEST NE POUVAIT PAS L'ATTRAPER : il vérifiait que le marquage suit une GARDE, ce
    // qui était vrai et restait vrai. La propriété qui manquait est une propriété d'ORDRE, et elle
    // ne se lit pas dans la fonction — elle se lit chez l'appelant. C'est la même leçon que M118 et
    // que M158 : ce qui compte n'est pas qu'un appel existe, mais QUAND et COMMENT il gouverne.
    assert.ok(!/marquerProjectionDOmbre3D\(\)/.test(RIG.slice(
      RIG.indexOf('export function appliquerOmbresDeCase3D'),
      RIG.indexOf('\n}\n', RIG.indexOf('export function appliquerOmbresDeCase3D')))),
    'le marquage est revenu en tête du rendu : il manquera les rigs construits pendant ce rendu');

    const SCENE = sourceSansCommentaires(
      readFileSync(new URL('../src/scene3d.js', import.meta.url), 'utf8'));
    const i = SCENE.indexOf('function renderPanelSceneUncached3D');
    const corps = SCENE.slice(i, SCENE.indexOf('\n}\n', i));
    const posMarquage = corps.indexOf('marquerProjectionDOmbre3D()');
    const posRendu = corps.indexOf('personaRenderer3D.render(');
    assert.ok(posMarquage > 0, 'le marquage n’est plus appelé : plus rien ne projette');
    assert.ok(posRendu > posMarquage, 'le marquage tourne APRÈS le rendu : sans effet sur l’image');
    // ⚠️ LA PROPRIÉTÉ QUI AURAIT ATTRAPÉ LE DÉFAUT : le marquage est APRÈS la dernière construction
    // de rig. C'est elle, et pas la présence de l'appel, qui garantit une scène complète.
    for (const bat of ['ensurePersonaRigEntry3D(', 'ensureObjectRigEntry3D(']) {
      const dernier = corps.lastIndexOf(bat);
      assert.ok(dernier > 0, `${bat} est introuvable dans le rendu d’une Case`);
      assert.ok(posMarquage > dernier,
        `le marquage précède le dernier \`${bat}\` : les rigs construits pendant ce rendu ne ` +
        'projetteront pas, et l’image sans ombre partira dans le cache');
    }
    // Et il ne tourne toujours QUE sur une Case ombrée : un parcours de scène n'a aucune raison de
    // s'exécuter sur toutes les Cases d'un Projet qui n'a jamais touché au réglage.
    assert.match(corps, /if \(_ombresDeLaCase\) marquerProjectionDOmbre3D\(\);/,
      'le marquage tourne même sans ombre : un parcours de scène pour rien, à chaque Case');
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
    const posOmbres = corps.indexOf('appliquerOmbresDeCase3D(panel, page, _eclairage, _planLumieres');
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
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * LES OMBRES REPARTENT ÉTEINTES APRÈS LE RENDU D'UNE CASE (#422k)
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Cinquième occurrence du piège de la scène partagée dans ce chantier. Les aperçus partagent le
 * renderer et la scène avec le rendu des Cases mais n'appellent jamais `appliquerOmbresDeCase3D` :
 * après une Case ombrée, ils héritaient de tout son état d'ombre, caméra cadrée sur CETTE Case
 * comprise. Mesuré : 1,83 % des pixels d'un aperçu, contre 0,635 % pour une ombre correctement
 * cadrée — ce n'était pas une ombre de trop, c'était du bruit.
 */
describe('⚠️ LES OMBRES REPARTENT ÉTEINTES APRÈS UNE CASE (#422k)', () => {
  const RIG = sourceSansCommentaires(
    readFileSync(new URL('../src/rig3d.js', import.meta.url), 'utf8'));
  const SCENE = sourceSansCommentaires(
    readFileSync(new URL('../src/scene3d.js', import.meta.url), 'utf8'));

  test('⚠️ CELUI QUI ALLUME EST CELUI QUI ÉTEINT, et aucun aperçu n’a rien à savoir', () => {
    // ═══════════════════════════════════════════════════════════════════════════════════════════
    // ⚠️ UNE MUTATION A IMPOSÉ D'INVERSER LA GARANTIE, ET C'EST LA LEÇON DE CETTE TÂCHE
    // ═══════════════════════════════════════════════════════════════════════════════════════════
    //
    // Première version : chaque aperçu éteignait les ombres, via `showOnlyFigure3D`, le point par
    // lequel les quatre chemins connus passent. C'était correct et FRAGILE. La mutation M171
    // retirait UN des deux `showOnlyFigure3D` d'une fonction qui en contient deux — une branche
    // Mur, une branche Objet — et a ÉCHAPPÉ : mon test voyait l'autre appel et concluait que tout
    // allait bien. Encore la PRÉSENCE vérifiée à la place de la GOUVERNANCE, quatrième fois dans ce
    // chantier après M118, M158 et M160.
    //
    // La parade n'est pas un test plus fin : c'est une garantie qui ne repose pas sur « tous les
    // chemins pensent à appeler ». L'état de repos des ombres est ÉTEINT ; le rendu d'une Case,
    // seul à les vouloir, les allume pour lui puis les repose en partant. Un cinquième chemin
    // d'aperçu écrit demain sera correct sans qu'on y pense.
    const i = SCENE.indexOf('function renderPanelSceneUncached3D');
    const corps = SCENE.slice(i, SCENE.indexOf('\n}\n', i));
    const posRendu = corps.indexOf('personaRenderer3D.render(');
    const posRepos = corps.indexOf('reposerOmbresPartagees3D()');
    assert.ok(posRepos > 0, 'le rendu d’une Case ne repose plus les ombres : elles fuiront sur les aperçus');
    assert.ok(posRepos > posRendu,
      'les ombres sont reposées AVANT le rendu de la Case : elle n’aurait aucune ombre');
    // ⚠️ ET C'EST L'IDIOME DU FOND, qui règle le même problème deux lignes plus haut : une valeur
    // forcée pour ce rendu seulement, puis remise, « so as not to affect other uses of the
    // renderer ». Les deux doivent rester voisines, sinon la raison de l'une se perd.
    const posFond = corps.indexOf('personaScene3D.background = null');
    assert.ok(posFond > 0 && Math.abs(posRepos - posFond) < 400,
      'la remise à zéro des ombres s’est éloignée de celle du fond : même raison, même endroit');
  });

  test('⚠️ ET L’ÉTAT DE REPOS ÉTEINT LES DEUX DRAPEAUX', () => {
    // Le renderer ET le soleil, comme partout dans ce chantier : `shadowMap.enabled` dit qu'il y a
    // des ombres, `castShadow` qu'une lumière y participe. N'en éteindre qu'un laisserait l'autre
    // parler pour la Case précédente.
    const j = RIG.indexOf('export function reposerOmbresPartagees3D');
    assert.ok(j > 0, 'l’état de repos des ombres est introuvable');
    const corps = RIG.slice(j, RIG.indexOf('\n}\n', j));
    assert.match(corps, /shadowMap\.enabled = false/, 'le renderer garde ses ombres allumées');
    assert.match(corps, /personaKeyLight3D\.castShadow = false/, 'le soleil garde son ombre');
  });

  test('⚠️ ET UNE CASE OMBRÉE LES RALLUME : le repos ne doit pas être définitif', () => {
    // ⚠️ LE DÉFAUT SYMÉTRIQUE, celui que ce chantier a rencontré quatre fois. Éteindre sans que
    // personne ne rallume ferait disparaître les ombres de TOUTES les Cases — et se lirait comme
    // « les ombres partent au hasard ». La garantie vient d'`appliquerOmbresDeCase3D`, qui écrit
    // les deux drapeaux SANS CONDITION à chaque rendu de Case.
    const i = RIG.indexOf('export function appliquerOmbresDeCase3D');
    const corps = RIG.slice(i, RIG.indexOf('\n}\n', i));
    assert.match(corps, /shadowMap\.enabled = rendues;/,
      'plus rien ne rallume les ombres : les reposer les éteindrait pour toujours');
    assert.match(corps, /castShadow = soleil;/,
      'plus rien ne rallume l’ombre du soleil après un aperçu');
  });

  test('⚠️ ET AUCUN APERÇU N’A BESOIN DE CONNAÎTRE LES OMBRES', () => {
    // La propriété qui dit que l'inversion a bien eu lieu : hors du rendu d'une Case, plus aucun
    // chemin ne touche aux drapeaux d'ombre. S'il fallait de nouveau y penser quelque part, c'est
    // que la garantie serait redevenue « tous les chemins pensent à appeler ».
    const i = RIG.indexOf('export function showOnlyFigure3D');
    const corps = RIG.slice(i, RIG.indexOf('\n}\n', i));
    assert.ok(!/shadowMap|castShadow|OmbresPartagees/.test(corps),
      'un aperçu manipule à nouveau les ombres : la garantie repose de nouveau sur chaque chemin');
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
 * « LE MUR DU FOND PERD SON OMBRE SELON LE ZOOM » (#422h, signalé à l'usage)
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ LA FAUTE : UN CHAMP MESURÉ À UNE SEULE PROFONDEUR. `champVisibleDeCase3D` donne la section du
 * tronc de vision au centre d'orbite ; le tronc, lui, s'ÉLARGIT derrière. Un Élément deux fois plus
 * loin est vu dans une section deux fois plus large et tombait hors d'une boîte taillée sur la
 * section du milieu. Couverture réelle relevée : environ deux fois la profondeur d'orbite — et
 * comme le rayon saute par paliers, cette limite se déplaçait au zoom.
 *
 * ⚠️ ET PERSONNE N'AVAIT DÉCIDÉ DE CETTE COUVERTURE. Elle tombait de `MARGE_BOITE_OMBRE`, qui
 * servait à tout autre chose. Une grandeur qui gouverne ce qu'on voit ne doit pas être le résidu
 * d'un calcul voisin : elle s'appelle désormais `PROFONDEUR_OMBRE_CAMDIST` et vaut 4, choisi par
 * l'utilisateur devant les mesures.
 */
const SOLEIL_H = { x: 0.4, y: 0.8, z: 0.45 };

describe('⚠️ L’OMBRE PORTE JUSQU’AU FOND DU TRONC DE VISION (#422h)', () => {
  const PAGE_H = { w: 1240, h: 1754 };

  test('⚠️ LA SPHÈRE CONTIENT LE TRONC JUSQU’À LA PROFONDEUR DÉCIDÉE', () => {
    // C'est l'exigence entière, et elle s'énonce sans aucun nombre choisi : tout point VISIBLE
    // jusqu'à `PROFONDEUR_OMBRE_CAMDIST × camDist` est dans la sphère, donc projette.
    for (const camDist of [5, 30, 90]) {
      const c = champVisibleDeCase3D({ camDist }, PAGE_H);
      const t = sphereTroncDeVision3D({ camDist }, PAGE_H);
      assert.ok(Math.abs(t.profondeur - camDist * PROFONDEUR_OMBRE_CAMDIST) < 1e-9,
        `à camDist ${camDist}, la portée en profondeur n’est plus celle qui a été décidée`);
      const tl = c.demiLargeur / camDist, th = c.demiHauteur / camDist;
      // Un balayage de profondeurs, pas seulement les deux extrémités : une sphère mal centrée
      // peut contenir les deux bouts et laisser sortir le milieu.
      for (let f = 0; f <= 1.0001; f += 0.1) {
        const prof = t.profondeur * f;
        const d = Math.hypot(prof * tl, prof * th, prof - t.decalage);
        assert.ok(d <= t.rayon + 1e-9,
          `à camDist ${camDist}, un coin visible à la profondeur ${prof.toFixed(1)} sort de la sphère`);
      }
    }
  });

  test('⚠️ LA CAMÉRA EST DANS LA SPHÈRE SANS QU’ON AIT À LE DEMANDER (mutation équivalente)', () => {
    // ═══════════════════════════════════════════════════════════════════════════════════════════
    // ⚠️ UNE MUTATION A ÉCHAPPÉ, ET LA BONNE RÉPONSE A ÉTÉ DE SUPPRIMER DU CODE
    // ═══════════════════════════════════════════════════════════════════════════════════════════
    //
    // M152 retirait le `Math.max(decalage, …)` qui garantissait que la caméra elle-même — à
    // distance `decalage` du centre — reste dans la sphère. Aucun test ne rougissait. Le réflexe
    // aurait été d'écrire une assertion de plus ; c'était le mauvais réflexe, parce que la mutation
    // était ÉQUIVALENTE : le premier argument du `max` ne pouvait jamais être choisi (la preuve est
    // dans `sphereTroncDeVision3D`). Un garde-fou qui ne peut pas se déclencher fait croire à un
    // danger et coûte au lecteur le temps de chercher quand il sert. Il est parti.
    //
    // Ce test tient l'IDENTITÉ qui le rend inutile, sur des formats de Planche des deux côtés de la
    // frontière k² = 1 : si quelqu'un change `decalage`, c'est ici que ça se verra, et le garde-fou
    // redeviendra peut-être nécessaire. C'est la deuxième fois que ce fichier écarte du code plutôt
    // que de l'exempter — cf. `apparenceBulleEstCelleDOrigine` dans code-mort.test.mjs.
    for (const page of [{ w: 1240, h: 1754 }, { w: 1754, h: 1240 }, { w: 3000, h: 1000 },
      { w: 1000, h: 1000 }]) {
      const camDist = 30;
      const c = champVisibleDeCase3D({ camDist }, page);
      const t = sphereTroncDeVision3D({ camDist }, page);
      // La caméra, à la profondeur 0, est à `decalage` du centre.
      assert.ok(t.decalage <= t.rayon + 1e-9,
        `sur ${page.w}×${page.h}, la caméra SORT de la sphère : le garde-fou retiré redevient nécessaire`);
      // Et le témoin : le rayon EST bien le coin du fond, pas autre chose.
      const tl = c.demiLargeur / camDist, th = c.demiHauteur / camDist;
      const coin = Math.hypot(t.profondeur * Math.hypot(tl, th), t.profondeur - t.decalage);
      assert.ok(Math.abs(t.rayon - coin) < 1e-9,
        `sur ${page.w}×${page.h}, le rayon n’est plus celui du coin du fond`);
    }
  });

  test('⚠️ ET LA COUVERTURE A VRAIMENT AUGMENTÉ : le mur du fond rentre', () => {
    // ⚠️ LE TÉMOIN DU DÉFAUT SIGNALÉ, chiffré. Un mur à trois fois la profondeur d'orbite sortait
    // de l'ancienne boîte — dérivée de la demi-diagonale × 1,5, soit un rayon de 40,3 au cadrage
    // par défaut. Il doit désormais rentrer. Sans cette assertion, la correction pourrait être
    // annulée par un réglage voisin sans que rien ne le dise.
    const camDist = 30;
    const c = champVisibleDeCase3D({ camDist }, PAGE_H);
    const t = sphereTroncDeVision3D({ camDist }, PAGE_H);
    const profMur = camDist * 3;
    // L'ANCIENNE boîte : centrée au centre d'orbite, donc à la profondeur `camDist`, rayon
    // demi-diagonale × 1,5. La NOUVELLE : centrée à `decalage`, rayon de la sphère du tronc.
    const ancienRayon = Math.hypot(c.demiLargeur, c.demiHauteur) * 1.5;
    const ancienneDistance = Math.abs(profMur - camDist);
    const nouvelleDistance = Math.abs(profMur - t.decalage);
    assert.ok(ancienneDistance > ancienRayon,
      'le témoin ne reproduit plus le défaut : ce mur rentrait déjà dans l’ancienne boîte');
    assert.ok(nouvelleDistance <= t.rayon,
      `un mur à trois fois la profondeur d’orbite sort encore de la sphère ` +
      `(${nouvelleDistance.toFixed(1)} > ${t.rayon.toFixed(1)})`);
  });

  test('⚠️ LE CENTRE EST PLUS LOIN QUE LE CENTRE D’ORBITE, et il suit l’axe de vue', () => {
    // ⚠️ UN TRONC S'ÉLARGIT VERS LE FOND, donc son centre de gravité géométrique n'est pas au
    // milieu. Le placer au centre d'orbite — ce que faisait #422g — exigeait un rayon bien plus
    // grand pour la même couverture, donc des texels plus gros pour rien.
    const t = sphereTroncDeVision3D({ camDist: 30 }, PAGE_H);
    assert.ok(t.decalage > 30, 'le centre de la sphère est resté au centre d’orbite');
    assert.ok(t.decalage <= t.profondeur, 'le centre est passé derrière le fond du tronc');
    // ═══════════════════════════════════════════════════════════════════════════════════════════
    // ⚠️ DEUX MUTATIONS ONT ÉCHAPPÉ ICI, ET C'ÉTAIT LA MÊME FAUTE DE TEST
    // ═══════════════════════════════════════════════════════════════════════════════════════════
    //
    // Première version : deux axes OPPOSÉS donnent deux centres distincts. Elle vérifiait que l'axe
    // est EMPLOYÉ, pas qu'il l'est CORRECTEMENT — c'est la famille de défauts que ce dépôt nomme
    // « un test qui assure qu'un identifiant apparaît plutôt qu'il gouverne », et elle a laissé
    // passer deux mutations :
    //
    //   M156 ignorer la composante X de l'axe — mon axe témoin valait (0, 0, ±1), donc sa
    //        composante X était nulle et la mutation ne changeait rien. Le témoin n'exerçait pas
    //        ce qu'il prétendait couvrir ;
    //   M158 INVERSER l'axe — deux centres restent distincts quand l'un part en arrière. La sphère
    //        se serait posée DERRIÈRE la caméra, et plus rien n'aurait eu d'ombre.
    //
    // La propriété juste s'énonce en une phrase : le centre est en AVANT du centre d'orbite, le
    // long de l'axe, exactement de `decalage − camDist`. Elle fixe le signe, la direction et la
    // grandeur d'un coup — et l'axe témoin a désormais ses trois composantes non nulles.
    const avant = (() => { const n = Math.hypot(0.3, -0.5, -0.81);
      return { x: 0.3 / n, y: -0.5 / n, z: -0.81 / n }; })();
    const p = { camDist: 30, _orbitCx: 4, _orbitCy: -2, _orbitCz: 11 };
    const b = boiteOmbreSoleil3D(p, PAGE_H, SOLEIL_H, avant);
    const attendu = b.decalage - p.camDist;
    assert.ok(attendu > 0, 'le témoin est nul : la sphère ne se déplace pas, ce test ne prouve rien');
    // Le déplacement réel, projeté sur l'axe. L'accrochage au texel le brouille de moins d'un texel.
    const dx = b.centre.x - p._orbitCx, dy = b.centre.y - p._orbitCy, dz = b.centre.z - p._orbitCz;
    const leLong = dx * avant.x + dy * avant.y + dz * avant.z;
    assert.ok(Math.abs(leLong - attendu) <= b.tailleTexel * 2,
      `le centre avance de ${leLong.toFixed(2)} au lieu de ${attendu.toFixed(2)} : ` +
      'l’axe est ignoré, inversé, ou amputé d’une composante');
    // Et il ne dérive PAS perpendiculairement à l'axe, au-delà de l'accrochage.
    const perp = Math.hypot(dx - leLong * avant.x, dy - leLong * avant.y, dz - leLong * avant.z);
    assert.ok(perp <= b.tailleTexel * 2,
      `le centre dérive de ${perp.toFixed(2)} hors de l’axe de vue`);
    // ⚠️ ET CHAQUE COMPOSANTE DE L'AXE COMPTE : en amputer une déplace le centre. Le test
    // ci-dessus le tient déjà, celui-ci le dit à la mutation qui avait échappé.
    for (const mort of ['x', 'y', 'z']) {
      const ampute = { ...avant, [mort]: 0 };
      const bm = boiteOmbreSoleil3D(p, PAGE_H, SOLEIL_H, ampute);
      assert.ok(Math.abs(bm.centre[mort] - b.centre[mort]) > b.tailleTexel,
        `amputer la composante ${mort} de l’axe ne change rien : elle n’est pas employée`);
    }
    // ⚠️ ET L'AXE VIENT DE LA COUCHE QUI CONNAÎT LA CAMÉRA, transmis et non recalculé : une seconde
    // copie d'une formule de cadrage est la faute la plus fréquente de ce dépôt.
    const SCENE = sourceSansCommentaires(
      readFileSync(new URL('../src/scene3d.js', import.meta.url), 'utf8'));
    const i = SCENE.indexOf('function renderPanelSceneUncached3D');
    const corps = SCENE.slice(i, SCENE.indexOf('\n}\n', i));
    assert.match(corps, /panelCamBasis3D\(panel\)/,
      'l’axe de vue n’est plus pris sur la base de caméra');
    assert.match(corps, /appliquerOmbresDeCase3D\([^)]*_avantCam\)/,
      'l’axe de vue n’est plus transmis aux ombres');
    // ⚠️ ET LE SENS EST TENU ICI, PARCE QU'IL NE PEUT L'ÊTRE NULLE PART AILLEURS (M158). La
    // mutation qui INVERSE l'axe a échappé à tous les tests de fonction pure : ceux-ci reçoivent
    // l'axe déjà construit, et un axe inversé leur paraît aussi valide qu'un autre. Le signe naît
    // dans scene3d.js et n'existe que là.
    //
    // ⚠️ `backward` VA DU CENTRE D'ORBITE VERS LA CAMÉRA — la caméra est à `orbite + backward·dist`.
    // L'axe de vue est donc son OPPOSÉ. Sans les trois signes, la sphère d'ombre se poserait
    // DERRIÈRE la caméra et plus rien n'aurait d'ombre : un défaut total, pas une dégradation.
    const mAvant = corps.match(/_avantCam\s*=\s*\{([^}]*)\}/);
    assert.ok(mAvant, 'l’axe de vue n’est plus construit');
    ['x', 'y', 'z'].forEach(c => {
      assert.match(mAvant[1], new RegExp(`${c}:\\s*-\\s*_baseCam\\.backward\\.${c}`),
        `la composante ${c} de l’axe de vue n’est plus l’opposé de \`backward\` : ` +
        'la sphère d’ombre se pose derrière la caméra');
    });
    const SRC = sourceSansCommentaires(
      readFileSync(new URL('../src/shadows-3d.js', import.meta.url), 'utf8'));
    assert.ok(!/camRotX|camRotY/.test(SRC),
      'la décision pure recalcule la base de caméra : deux copies d’une formule de cadrage');
  });

  test('⚠️ LA CARTE EST À 4096, ET LA MESURE DIT QUE C’EST GRATUIT EN TEMPS', () => {
    // ⚠️ MESURÉ SUR LE VRAI GPU (#422h) : 2,88 / 2,80 / 2,76 / 2,80 ms à 1024, 2048, 4096, 8192 —
    // les quatre dans le bruit, l'ombre elle-même ne coûtant que 0,65 ms. Le prix d'une carte
    // d'ombre directionnelle est UNE PASSE DE PROFONDEUR SUR LA GÉOMÉTRIE, pas du remplissage.
    //
    // ⚠️ CE QUI ARRÊTE LA MONTÉE, C'EST LA MÉMOIRE : 4 / 16 / 64 / 256 Mo. 8192 donnait deux fois
    // plus de netteté pour le même temps et 256 Mo de mémoire vidéo — le rapport s'y retourne.
    assert.equal(RESOLUTION_OMBRE_SOLEIL, 4096);
    assert.ok((RESOLUTION_OMBRE_SOLEIL ** 2 * 4) / 1048576 <= 64,
      'la carte dépasse 64 Mo : le coût cesse d’être du temps pour devenir de la mémoire');
    // Et la netteté au cadrage par défaut est au moins celle d'avant #422h, malgré une couverture
    // quadruplée : c'est exactement ce que la montée à 4096 a acheté.
    const b = boiteOmbreSoleil3D({ camDist: 30 }, PAGE_H, SOLEIL_H, { x: 0, y: 0, z: -1 });
    assert.ok(b.tailleTexel <= 0.0625 + 1e-9,
      `le texel vaut ${(b.tailleTexel * 1000).toFixed(1)} mm : la couverture a été payée en netteté`);
  });
});


/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * « LES OMBRES BOUGENT QUAND JE ZOOME » (#422g, signalé à l'usage)
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Deux fautes distinctes, et la seconde était invisible tant que la première durait.
 */
describe('⚠️ LA BOÎTE SE POSE SUR CE QUE LA CASE REGARDE (#422g)', () => {
  const PAGE_G = { w: 1240, h: 1754 };
  const SOLEIL = { x: 0.4, y: 0.8, z: 0.45 };

  test('⚠️ LE CENTRE SUIT L’ORBITE DE LA CASE, ET PAS L’ORIGINE DU MONDE', () => {
    // ⚠️ LA FAUTE SIGNALÉE. `DirectionalLight.target` vaut l'ORIGINE par défaut chez Three.js, et
    // n'était jamais déplacé : la boîte couvrait un disque autour de (0, 0, 0) pendant que la Case
    // regardait ailleurs. La note de #422 disait pourtant « cadrée sur ce que la Case regarde » —
    // la TAILLE avait été implémentée, la POSITION oubliée.
    const loin = boiteOmbreSoleil3D(
      { camDist: 30, _orbitCx: 120, _orbitCy: 0, _orbitCz: -80 }, PAGE_G, SOLEIL);
    assert.ok(Math.hypot(loin.centre.x, loin.centre.z) > 100,
      'le centre est resté près de l’origine : une Case qui regarde ailleurs n’aura aucune ombre');
    // TÉMOIN : deux Cases qui regardent des points DIFFÉRENTS ont des centres différents. Sans lui,
    // une constante quelconque satisferait l'assertion ci-dessus.
    const ailleurs = boiteOmbreSoleil3D(
      { camDist: 30, _orbitCx: -60, _orbitCy: 0, _orbitCz: 200 }, PAGE_G, SOLEIL);
    assert.notEqual(loin.centre.x, ailleurs.centre.x, 'le centre ne dépend pas de la Case');
  });

  test('⚠️ ET LE CENTRE EST UN MULTIPLE ENTIER DE TEXEL, DANS LE REPÈRE DE LA LUMIÈRE', () => {
    // ⚠️ C'EST L'ACCROCHAGE QUI STABILISE, et il doit se faire dans le repère de la CARTE. Arrondir
    // sur les axes du monde laisserait la grille glisser en biais dès que le soleil n'est pas dans
    // un plan d'axe, et l'accrochage ne servirait à rien.
    const b = boiteOmbreSoleil3D(
      { camDist: 30, _orbitCx: 12.3456, _orbitCy: 1.2345, _orbitCz: -7.7777 }, PAGE_G, SOLEIL);
    const r = repereOmbreSoleil3D(SOLEIL);
    const c = b.centre;
    for (const [nom, axe] of [['u', r.x], ['v', r.y]]) {
      const proj = c.x * axe.x + c.y * axe.y + c.z * axe.z;
      const reste = Math.abs(proj / b.tailleTexel - Math.round(proj / b.tailleTexel));
      assert.ok(reste < 1e-6,
        `le centre n’est pas accroché sur l’axe ${nom} (reste ${reste}) : la grille glissera`);
    }
    // TÉMOIN : le centre brut, lui, ne tombait PAS sur la grille — sinon l'accrochage serait
    // vérifié par une coïncidence et non par son effet.
    const brut = 12.3456 * r.x.x + 1.2345 * r.x.y + (-7.7777) * r.x.z;
    assert.ok(Math.abs(brut / b.tailleTexel - Math.round(brut / b.tailleTexel)) > 1e-6,
      'le témoin tombait déjà sur la grille : ce test ne prouve rien');
  });

  test('⚠️ LE REPÈRE EST ORTHONORMÉ, ET SON AXE Z EST LA DIRECTION DU SOLEIL', () => {
    // Il reproduit ce que fait `DirectionalLightShadow` : caméra en `light.position`, regardant
    // `light.target`, `up` valant (0, 1, 0). Un repère qui dériverait de celui-là accrocherait sur
    // une grille différente de celle où la carte est réellement rendue.
    for (const d of [SOLEIL, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: -0.3, y: 0.2, z: -0.9 }]) {
      const r = repereOmbreSoleil3D(d);
      [r.x, r.y, r.z].forEach((a, i) => {
        assert.ok(Math.abs(Math.hypot(a.x, a.y, a.z) - 1) < 1e-9, `l’axe ${i} n’est pas unitaire`);
      });
      const dot = (p, q) => p.x * q.x + p.y * q.y + p.z * q.z;
      assert.ok(Math.abs(dot(r.x, r.y)) < 1e-9, 'x et y ne sont pas orthogonaux');
      assert.ok(Math.abs(dot(r.x, r.z)) < 1e-9, 'x et z ne sont pas orthogonaux');
      assert.ok(Math.abs(dot(r.y, r.z)) < 1e-9, 'y et z ne sont pas orthogonaux');
    }
    // ⚠️ LE CAS DÉGÉNÉRÉ : soleil au zénith, la direction est colinéaire à `up` et le produit
    // vectoriel est nul. Sans repli, tous les axes deviendraient NaN et le centre partirait avec.
    const zenith = repereOmbreSoleil3D({ x: 0, y: 1, z: 0 });
    assert.ok(Number.isFinite(zenith.x.x) && Number.isFinite(zenith.y.y),
      'le soleil au zénith produit un repère illisible');
    const cz = centreAccrocheOmbre3D({ _orbitCx: 5, _orbitCy: 0, _orbitCz: 5 }, { x: 0, y: 1, z: 0 }, 0.5);
    assert.ok(Number.isFinite(cz.x) && Number.isFinite(cz.z),
      'le soleil au zénith envoie le centre de la boîte à NaN');
  });

  test('⚠️ ZOOMER DANS UN MÊME PALIER NE CHANGE RIEN DU TOUT', () => {
    // ═══════════════════════════════════════════════════════════════════════════════════════════
    // ⚠️ C'EST LA PROPRIÉTÉ QUE L'UTILISATEUR A DEMANDÉE, ET ELLE SE VÉRIFIE EN UNE LIGNE
    // ═══════════════════════════════════════════════════════════════════════════════════════════
    //
    // La taille du texel valait `2 × rayon / résolution` avec un rayon CONTINU : elle changeait à
    // chaque cran de molette, de 3,9 mm tout près à 105 mm très reculé. Une ombre étant quantifiée
    // sur cette grille, changer le pas de la grille redessine tous les contours — c'est cela qui
    // rampait, sans qu'aucune lumière ait bougé.
    // ⚠️ LES BORNES DU PALIER ONT CHANGÉ AVEC LA COUVERTURE (#422h) : le rayon a quadruplé de
    // profondeur, donc le doublement tombe ailleurs sur l'échelle de `camDist`. Ce qui est tenu
    // reste le même — dans un palier, RIEN ne bouge — et les bornes sont recalculées plutôt que
    // recopiées : le témoin plus bas exige que le rayon dérivé, lui, bouge sur la plage choisie.
    const panel = (camDist) => ({ camDist, _orbitCx: 12.34, _orbitCy: 0, _orbitCz: -7.77 });
    const ref = boiteOmbreSoleil3D(panel(20), PAGE_G, SOLEIL);
    for (const d of [21, 24, 28, 30, 34]) {
      const b = boiteOmbreSoleil3D(panel(d), PAGE_G, SOLEIL);
      assert.equal(b.rayon, ref.rayon, `le rayon bouge entre camDist 20 et ${d}`);
      assert.equal(b.tailleTexel, ref.tailleTexel, `le texel bouge entre camDist 20 et ${d}`);
    }
    // TÉMOIN : le rayon DÉRIVÉ, lui, bouge bel et bien sur cette plage. Sans lui, un rayon devenu
    // constant par erreur — une boîte qui ne suivrait plus du tout le cadrage — passerait ce test
    // avec les félicitations. C'est nommément l'une des familles de défauts de ce dépôt : mesurer
    // une absence sans vérifier que l'instrument sait voir une présence.
    assert.ok(boiteOmbreSoleil3D(panel(34), PAGE_G, SOLEIL).rayonBrut
      > ref.rayonBrut * 1.5, 'le témoin ne bouge plus : le test ne prouve plus rien');
    // Et au palier SUIVANT, la boîte change bien — sinon elle aurait cessé de suivre le cadrage.
    assert.ok(boiteOmbreSoleil3D(panel(120), PAGE_G, SOLEIL).rayon > ref.rayon,
      'la boîte ne suit plus le cadrage : très dézoomé, l’ombre ne couvrirait qu’un coin');
  });

  test('⚠️ LA CAMÉRA D’OMBRE EST HORS DU VOLUME QU’ELLE REGARDE', () => {
    // ⚠️ TROISIÈME FAUTE, TROUVÉE EN CORRIGEANT LES DEUX AUTRES. La lumière était posée à 3 unités
    // du centre quand le rayon peut valoir 64 : la caméra se trouvait DANS la boîte, et tout ce
    // qui était derrière elle tombait au-delà du plan proche — donc ne projetait pas. Le défaut
    // était masqué tant que la boîte restait petite.
    for (const camDist of [3, 30, 120]) {
      const b = boiteOmbreSoleil3D({ camDist, _orbitCx: 0, _orbitCy: 0, _orbitCz: 0 }, PAGE_G, SOLEIL);
      assert.ok(b.distanceCamera >= b.rayon,
        `à camDist ${camDist}, la caméra est DANS la boîte : la moitié des projeteurs est derrière le plan proche`);
      assert.ok(b.distanceCamera + b.rayon <= b.far,
        `à camDist ${camDist}, le fond de la boîte dépasse le plan éloigné : les projeteurs lointains sont coupés`);
    }
  });

  test('⚠️ ET LE RENDU POSE LES DEUX, POSITION ET CIBLE, EN BLOC', () => {
    const RIG = sourceSansCommentaires(
      readFileSync(new URL('../src/rig3d.js', import.meta.url), 'utf8'));
    const i = RIG.indexOf('export function appliquerOmbresDeCase3D');
    const corps = RIG.slice(i, RIG.indexOf('\n}\n', i));
    assert.match(corps, /target\.position\.set\(b\.centre\.x, b\.centre\.y, b\.centre\.z\)/,
      'la cible du soleil n’est plus déplacée : la boîte retourne à l’origine du monde');
    // ⚠️ ET LA CIBLE DOIT ÊTRE REMISE À JOUR À LA MAIN : elle n'est PAS dans le graphe de la scène,
    // donc personne ne recalcule sa matrice monde. Sans cet appel, Three.js lit celle de la Case
    // précédente et la boîte traîne d'une Case à l'autre.
    assert.match(corps, /target\.updateMatrixWorld\(\)/,
      'la cible n’est pas remise à jour : Three.js lira celle de la Case précédente');
    assert.match(corps, /position\.set\(\s*b\.centre\.x \+ d\.x \* b\.distanceCamera/,
      'la lumière n’est plus replacée avec sa cible : la direction du soleil deviendrait fausse');
    // ⚠️ ET LA REMISE À ZÉRO VIT DANS L'ÉCLAIRAGE, QUI PASSE SUR TOUTE CASE. Une Case SANS ombre
    // n'exécute pas le bloc ci-dessus : si personne ne reposait la cible, elle hériterait de celle
    // de la Case ombrée d'avant et sa LUMIÈRE pointerait ailleurs — pas seulement son ombre.
    const j = RIG.indexOf('export function appliquerEclairageDeCase3D');
    const corpsEcl = RIG.slice(j, RIG.indexOf('\n}\n', j));
    assert.match(corpsEcl, /target\.position\.set\(0, 0, 0\)/,
      'la cible du soleil n’est pas reposée à chaque Case : une Case sans ombre héritera de la précédente');
  });

  test('⚠️ ET LA CAMÉRA EST CADRÉE AVANT QUE LES OMBRES LA LISENT', () => {
    // `framePanelCamera3D` est le SEUL endroit qui résout le centre d'orbite — cible explicite du
    // menu Caméra, Élément sélectionné, orbite libre — et il l'écrit dans `_orbitCx/Cy/Cz`. Il
    // avait lieu sept cents lignes plus bas que les ombres : elles auraient lu le centre du rendu
    // PRÉCÉDENT, ou rien du tout sur une Case neuve.
    const SCENE = sourceSansCommentaires(
      readFileSync(new URL('../src/scene3d.js', import.meta.url), 'utf8'));
    const i = SCENE.indexOf('function renderPanelSceneUncached3D');
    const corps = SCENE.slice(i, SCENE.indexOf('\n}\n', i));
    const posCadrage = corps.indexOf('framePanelCamera3D(');
    const posOmbres = corps.indexOf('appliquerOmbresDeCase3D(');
    assert.ok(posCadrage > 0 && posOmbres > posCadrage,
      'les ombres lisent le centre d’orbite avant qu’il soit résolu : elles suivront le rendu précédent');
  });
});

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

/**
 * JOURNAL DE MUTATION (#422g, la boîte posée et accrochée) : dix fautes rejouées.
 *
 *   M139 la boîte retourne à l'origine du monde                           ROUGE
 *   M140 la cible traîne d'une Case à l'autre                             ROUGE
 *   M141 une Case sans ombre hérite de la cible de la précédente          ROUGE
 *   M142 arrondi vers le bas : les ombres sont coupées aux bords          ROUGE
 *   M143 pas d'accrochage : les ombres rampent au zoom                    ROUGE
 *   M144 le centre n'est plus accroché : la grille glisse                 ROUGE
 *   M145 le repère ignore la direction du soleil                          ROUGE
 *   M146 soleil au zénith : le centre part à NaN                          ROUGE
 *   M147 la caméra est DANS la boîte                                      ROUGE
 *   M148 les ombres lisent le centre d'orbite du rendu précédent          ROUGE
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * ⚠️ M139 EST LA MOITIÉ DE CONSIGNE QUE J'AVAIS LUE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * La note de #422 disait, en toutes lettres et en gras : « la boîte devra être CADRÉE SUR CE QUE LA
 * CASE REGARDE ». J'ai implémenté la TAILLE et oublié la POSITION — et `DirectionalLight.target`
 * valant l'origine par défaut, la boîte est restée autour de (0, 0, 0) pendant deux tâches. Une
 * consigne écrite ne protège de rien si on n'en relit que la moitié ; ce qui l'aurait attrapée,
 * c'est un test sur la POSITION, et il n'y en avait aucun.
 *
 * ⚠️ M141 EST LE PIÈGE DE LA SCÈNE PARTAGÉE, QUATRIÈME FOIS DANS CE SEUL CHANTIER — après le
 * drapeau du renderer (#422c), la disposition de la fiche (#421h) et le `castShadow` d'une source
 * (#422d). Et c'est la plus grave des quatre : une Case SANS ombre n'exécute pas le bloc qui pose
 * la cible, donc elle hériterait de celle de la Case ombrée d'avant — et sa LUMIÈRE pointerait
 * ailleurs, pas seulement son ombre. Un état que personne ne repose doit être reposé par quelqu'un
 * qui passe TOUJOURS.
 *
 * ⚠️ M142 ET M143 TIENNENT L'ACCROCHAGE PAR SES DEUX RISQUES OPPOSÉS. Sans accrochage, les ombres
 * rampent — le défaut signalé. Avec un accrochage vers le BAS, la boîte passe sous le champ visible
 * et les ombres sont COUPÉES près des bords : un défaut pire, et qui ne se verrait que sur
 * certaines Cases. Une seule des deux mutations aurait laissé croire que l'arrondi est bon.
 *
 * ⚠️ M145 EST CELLE QU'ON N'ÉCRIT QUE SI ON A COMPRIS POURQUOI. Accrocher sur les axes du MONDE
 * paraît équivalent et ne l'est pas : la grille de texels est celle de la CARTE, orientée par la
 * direction du soleil. Arrondir ailleurs laisse la grille glisser en biais, et l'accrochage ne sert
 * plus à rien dès que le soleil n'est pas dans un plan d'axe — c'est à dire presque toujours.
 *
 * ⚠️ M147 EST UNE TROISIÈME FAUTE, TROUVÉE EN CORRIGEANT LES DEUX AUTRES. La lumière était posée à
 * trois unités du centre quand le rayon peut valoir 64 : la caméra d'ombre se trouvait DANS le
 * volume qu'elle regarde, et tout ce qui était derrière elle tombait au-delà du plan proche — donc
 * ne projetait pas. Le défaut était masqué par le premier : une boîte plantée à l'origine ne
 * contenait de toute façon presque rien.
 *
 * ⚠️ ET TROIS TESTS DE #422a ONT DÛ ÊTRE RÉÉCRITS, sans qu'aucun ne soit faux. Ils mesuraient le
 * rayon DÉRIVÉ à une époque où c'était le seul ; depuis, une décision d'affichage — l'arrondi — se
 * pose par-dessus. Ils portent désormais sur `rayonBrut`, ce qui rend la dérivation testée pour
 * elle-même, et l'arrondi est tenu séparément par ses deux bornes : jamais plus petit que la
 * dérivation, jamais plus d'un palier au-dessus.
 *
 * ⚠️ ET LA MARGE DE VISIBILITÉ A BAISSÉ, ce qui est écrit plutôt que masqué : elle valait plus de
 * quatre avant #422g, elle vaut 3,5. L'arrondi a mangé la différence, et c'est le prix ANNONCÉ de
 * la stabilité. L'exigence tenue est devenue « un palier de plus ne ferait toujours pas disparaître
 * l'ombre », ce qui se dit dans l'unité où la marge se consomme désormais.
 *
 * ⚠️ CE QUE LA CAMPAGNE NE PEUT PAS MUTER : que l'échange finesse contre stabilité soit le bon à
 * l'œil. #422z regarde — et il reste une option non mesurée, relever la résolution du soleil de
 * 2048 à 4096 pour rendre ce que l'arrondi a pris.
 */

/**
 * JOURNAL DE MUTATION (#422h, le tronc de vision et la carte à 4096) : dix fautes rejouées.
 *
 *   M149 la couverture retombe : le mur du fond reperd son ombre         ROUGE
 *   M150 le centre au milieu du tronc : le fond sort                     ROUGE
 *   M151 le centre reste au centre d'orbite                              ROUGE
 *   M152 le garde-fou du coin de tête retiré             ⚠️ ÉQUIVALENTE — code supprimé
 *   M153 la largeur oubliée : les coins latéraux sortent                 ROUGE
 *   M154 retour à 2048 : la couverture payée en netteté                  ROUGE
 *   M155 montée à 8192 : 256 Mo pour la seule ombre du soleil            ROUGE
 *   M156 la composante X de l'axe ignorée                  ⚠️ ÉCHAPPÉE, puis ROUGE
 *   M157 l'axe de vue n'est plus transmis                                ROUGE
 *   M158 l'axe INVERSÉ : la sphère part derrière la caméra ⚠️ ÉCHAPPÉE, puis ROUGE
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * ⚠️ M152 ÉTAIT ÉQUIVALENTE, ET LA BONNE RÉPONSE A ÉTÉ DE SUPPRIMER DU CODE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Elle retirait un `Math.max` censé garantir que la caméra elle-même reste dans la sphère. Aucun
 * test ne rougissait, et le réflexe aurait été d'écrire une assertion de plus. C'était le mauvais
 * réflexe : la démonstration (dans `sphereTroncDeVision3D`) montre que le premier argument du `max`
 * ne pouvait JAMAIS être choisi, dans aucune des deux branches. Un garde-fou qui ne peut pas se
 * déclencher n'est pas une sécurité — il fait croire à un danger et coûte au prochain lecteur le
 * temps de chercher quand il sert.
 *
 * Le code est parti, et l'IDENTITÉ qui le rend inutile est tenue par un test, sur quatre formats de
 * Planche répartis des deux côtés de la frontière k² = 1. Deuxième fois que ce dépôt écarte du code
 * plutôt que de l'exempter — cf. `apparenceBulleEstCelleDOrigine`.
 *
 * ⚠️ M156 ET M158 ONT ÉCHAPPÉ POUR LA MÊME FAUTE DE TEST, et c'est la famille que ce dépôt nomme :
 * une assertion qui vérifie qu'un identifiant APPARAÎT plutôt qu'il GOUVERNE. Mon témoin comparait
 * deux axes OPPOSÉS et exigeait des centres distincts — ce qui vérifie que l'axe est EMPLOYÉ, pas
 * qu'il l'est correctement.
 *
 *   M156 amputait la composante X. Mon axe témoin valait (0, 0, ±1) : sa composante X était nulle,
 *        donc la mutation ne changeait rien. Le témoin n'exerçait pas ce qu'il prétendait couvrir ;
 *   M158 INVERSAIT l'axe. Deux centres restent distincts quand l'un part en arrière — la sphère se
 *        serait posée DERRIÈRE la caméra, et plus RIEN n'aurait eu d'ombre. Un défaut total.
 *
 * La parade est une propriété et non une assertion de plus : le centre est en AVANT du centre
 * d'orbite, le long de l'axe, exactement de `decalage − camDist`. Elle fixe le signe, la direction
 * et la grandeur d'un coup. Plus un test par composante, et — pour M158, dont le signe NAÎT dans
 * scene3d.js et n'existe nulle part ailleurs — un contrôle sur les trois signes à l'endroit où ils
 * sont écrits. C'est la troisième fois de ce chantier qu'une mutation échappe faute d'avoir vérifié
 * la GOUVERNANCE plutôt que la présence ; après M118 (#422d), la leçon commence à se voir.
 *
 * ⚠️ M154 ET M155 ENCADRENT LA RÉSOLUTION PAR SES DEUX COÛTS OPPOSÉS. En dessous, la couverture
 * quadruplée se paierait en netteté — exactement le flou signalé à l'usage. Au dessus, le temps ne
 * bouge toujours pas (mesuré : 2,80 ms à 8192) mais la mémoire passe à 256 Mo pour la seule ombre
 * du soleil. Une seule des deux mutations aurait laissé croire que 4096 est arbitraire.
 *
 * ⚠️ ET `MARGE_BOITE_OMBRE` A DISPARU, ce qui ferme une dette de #422a. Elle valait 1,5, elle était
 * choisie à la main, et #422z devait la juger à l'écran. La sphère du tronc répond à ses deux
 * besoins par construction — une sphère n'a pas d'orientation, et elle contient tout le visible.
 * Une constante « à régler plus tard » remplacée par une grandeur dérivée d'une exigence énonçable
 * est la meilleure issue possible ; c'est aussi un rappel qu'un nombre qu'on n'arrive pas à
 * justifier signale souvent une forme mal choisie, pas un réglage manquant.
 */

/**
 * JOURNAL DE MUTATION (#422i, le marquage et la scène complète) : quatre fautes rejouées.
 *
 *   M159 plus aucun marquage : rien ne projette jamais                    ROUGE
 *   M160 le marquage remis en tête du rendu — LE DÉFAUT SIGNALÉ           ROUGE
 *   M161 le parcours tourne sur toutes les Cases, même sans ombre         ROUGE
 *   M162 le marquage tourne APRÈS le rendu : sans effet sur l'image       ROUGE
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * ⚠️ M160 EST LE DÉFAUT LUI-MÊME, ET C'EST LA MUTATION QUI COMPTE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Elle remet l'appel exactement où il était : en tête du rendu, sous la même garde, correctement
 * écrit. Rien n'y paraît faux à la lecture — et les ombres disparaissent au premier affichage de
 * chaque Case. C'est ce qui rend ce défaut instructif : il n'y avait AUCUNE erreur dans la
 * fonction, seulement dans le moment où on l'appelait.
 *
 * ⚠️ L'ANCIEN TEST NE POUVAIT PAS L'ATTRAPER, et il faut comprendre pourquoi plutôt que s'en
 * excuser. Il vérifiait `if (rendues) marquerProjectionDOmbre3D();` — que le marquage suit bien une
 * garde. C'était vrai, ça l'est resté, et ça ne dit rien du moment. La propriété manquante était
 * une propriété d'ORDRE, et elle ne se lit pas DANS la fonction : elle se lit chez l'appelant,
 * relativement à des constructions qui vivent trois cents lignes plus loin.
 *
 * C'est la troisième fois de ce chantier — après M118 (#422d) et M158 (#422h) — qu'une mutation
 * passe parce qu'un test vérifiait la PRÉSENCE d'un appel plutôt que sa GOUVERNANCE. Les trois
 * avaient l'air couvertes. Le test porte désormais sur la seule chose qui compte : **le marquage
 * est après le dernier `ensure…RigEntry3D` et avant le rendu.**
 *
 * ⚠️ ET LE CACHE A DOUBLÉ LE DÉFAUT, ce qui explique la forme du signalement (« au redémarrage »,
 * pas « toujours »). En session, cocher la case redessine une Case dont les rigs existent déjà du
 * rendu précédent : tout marche, et on conclut que le réglage fonctionne. À froid, la première
 * image d'une Case CONSTRUIT ses rigs, donc les manque tous — et cette image sans ombre entre dans
 * le cache d'images de Case, où rien ne la remet en cause puisque la signature n'a pas bougé.
 * Un défaut d'ordre que le cache rend permanent se lit comme « le réglage ne tient pas au
 * redémarrage », c'est à dire comme un défaut de PERSISTANCE — à l'autre bout de l'application.
 *
 * ⚠️ LA RÈGLE GÉNÉRALE, et elle dépasse les ombres : **un parcours de scène doit s'exécuter quand
 * la scène est complète, pas quand on pense à l'écrire.** Ce dépôt construit ses rigs
 * paresseusement (#405d) ; toute passe globale posée avant ces constructions travaille sur une
 * scène partielle, en silence et sans erreur.
 */

/**
 * JOURNAL DE MUTATION (#422k, les ombres reposées après une Case) : six fautes rejouées.
 *
 *   M167 le rendu d'une Case ne repose plus les ombres — LE DÉFAUT      ROUGE
 *   M168 le renderer garde ses ombres allumées                          ROUGE
 *   M169 le soleil garde son ombre d'une Case à l'aperçu                ROUGE
 *   M170 le repos ALLUME au lieu d'éteindre                             ROUGE
 *   M171 le repos AVANT le rendu : la Case perd ses ombres              ROUGE
 *   M172 une branche d'aperçu sans `showOnlyFigure3D`     HORS SUJET depuis l'inversion → #428
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * ⚠️ M172 A ÉCHAPPÉ À LA PREMIÈRE VERSION, ET C'EST ELLE QUI A CHANGÉ LA CONCEPTION
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * La première version faisait éteindre les ombres par `showOnlyFigure3D`, le point par lequel les
 * quatre chemins d'aperçu passent. C'était correct et FRAGILE. M172 retirait UN des deux
 * `showOnlyFigure3D` d'une fonction qui en contient deux — une branche Mur, une branche Objet — et
 * passait : mon test voyait l'autre appel et concluait que tout allait bien.
 *
 * Encore la PRÉSENCE vérifiée à la place de la GOUVERNANCE, quatrième fois dans ce chantier après
 * M118 (#422d), M158 (#422h) et M160 (#422i). À la quatrième, la leçon n'est plus « écrire un test
 * plus fin » : c'est que **la garantie elle-même était mauvaise**. Elle reposait sur « tous les
 * chemins pensent à appeler », ce qu'aucun test ne peut tenir sans énumérer les chemins — et
 * l'énumération tenue à la main est la deuxième famille de défauts de ce dépôt.
 *
 * LA GARANTIE A DONC ÉTÉ INVERSÉE : l'état de repos des ombres est ÉTEINT, et le rendu d'une Case —
 * seul à les vouloir — les allume pour lui puis les repose en partant. Un aperçu n'a plus rien à
 * savoir des ombres, et un CINQUIÈME chemin d'aperçu écrit demain sera correct sans qu'on y pense.
 * C'est l'idiome que le rendu d'une Case emploie déjà pour son fond, deux lignes plus loin.
 *
 * ⚠️ ET M172 EST DEVENUE HORS SUJET, ce qui est le signe que l'inversion a fonctionné : retirer ce
 * `showOnlyFigure3D` ne touche plus aux ombres du tout. Ce qu'elle casse encore est l'ISOLATION de
 * l'aperçu — le décor apparaîtrait derrière l'Élément, le défaut que « Fix 63 » a corrigé —, et
 * rien ne la tient. Consigné en #428 plutôt que couvert ici par un test faible : la propriété juste
 * est « tout rendu hors Case est DOMINÉ par un `showOnlyFigure3D` », c'est-à-dire que toutes les
 * branches y mènent, ce qu'une recherche de sous-chaîne ne sait pas dire.
 *
 * ⚠️ ET M171 TIENT L'ORDRE, qui est la moitié facile à casser en déplaçant une ligne : reposer les
 * ombres AVANT le rendu les retire de la Case elle-même. Le défaut serait « les ombres ne marchent
 * jamais », donc immédiatement visible — mais il ne coûte qu'un copier-coller malheureux.
 */
