/**
 * tests/bake-textures.test.mjs, la cuisson d'un grain de texture.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * CE QUI EST TENU ICI, ET CE QUI NE PEUT PAS L'ÊTRE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * `tools/bake-textures.mjs` fait deux choses de nature différente. Il DÉCODE des JPEG et ÉCRIT des
 * PNG, ce qui exige Electron, et il DÉCIDE : quelle carte sert de relief, quel gain atteint la
 * cible, si un motif survivra au carrelage, quelle teinte par défaut. La seconde moitié est pure,
 * et c'est elle qu'on tient — exactement le partage de `fetch-fonts.mjs`.
 *
 * ⚠️ L'IMPORT D'ELECTRON EST DYNAMIQUE DANS LE SCRIPT, et ce fichier est la raison. Un `import` en
 * tête y ferait échouer `node --test` à la ligne d'import ci-dessous, avant le premier test. La
 * garde `import.meta.url === argv[1]` complète le dispositif : importer le module ne cuit rien.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * ⚠️ LES FIXTURES SONT SYNTHÉTIQUES, ET C'EST UN CHOIX, PAS UN PIS-ALLER
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * On pourrait embarquer un morceau de Paper005. Ce serait une mauvaise fixture : une photographie
 * ne permet pas de dire ce qu'on ATTEND, seulement de constater ce qu'on obtient — et un test qui
 * fige le nombre d'aujourd'hui ne tient rien du tout. Une rampe, un damier, une tache : chacune
 * isole UNE propriété, dont la valeur attendue se déduit à la main.
 *
 * Les quatre matières réelles servent ailleurs, et elles sont citées comme telles dans le script.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * JOURNAL DE MUTATION — 21 mutations, 2 échappées, 2 réparées
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Tuées du premier coup (19) : contraste local réduit à un seul axe, sans valeur absolue, ou avec
 * un dénominateur figé ; couture rendue en valeur brute ou sur un seul bord ; damier amputé d'une
 * rangée, échantillonné à un pixel par bloc, ou rendu sans rapport ; ombrage en convention
 * DirectX, sans amplification, sans direction ; grain sans recentrage du relief, à cible ignorée,
 * privé de sa branche relief ou de sa branche normale, part d'ombrage à zéro ; classement
 * acceptant DirectX ou prenant la rugosité pour du relief ; teinte aux canaux échangés ; nom de
 * fichier sans élagage des tirets.
 *
 * ⚠️ M6 A SURVÉCU — le seuil relâché de 0,18 à 0,9. Mon test vérifiait que le verdict BASCULE de
 * part et d'autre du seuil, avec deux fixtures situées à 0,9 et à 0,08 : elles restaient du bon
 * côté quelle que soit la valeur placée entre les deux. Je tenais le SENS de la comparaison, pas
 * la VALEUR qui la rend utile. Réparé en figeant l'écart mesuré qui a fixé ce nombre : au-dessus
 * de la toile de jean (0,126), sous le carton taché (0,241).
 *
 * ⚠️ M18 A SURVÉCU, ET C'EST LA SIXIÈME FOIS QUE CE DÉPÔT MESURE UNE ABSENCE AVEC UN INSTRUMENT
 * AVEUGLE. Mon test parcourait le grain en vérifiant `0 <= v <= 255`. Mais `grain` est un
 * `Uint8Array` : l'écriture y BOUCLE, 260 devient 4. L'assertion était vraie par construction du
 * type, bornage ou pas — elle n'avait aucun moyen d'échouer. Retirer `Math.max`/`Math.min`
 * laissait la suite verte, alors que le défaut masqué est plus grave qu'un simple débordement :
 * un pli très clair ne sature pas en blanc, il BASCULE EN NOIR.
 *
 * Réparé en changeant ce qu'on mesure. Plus la borne, que l'instrument ne voit pas franchir, mais
 * la propriété : un relief plus clair ne doit jamais donner un grain plus sombre. Et le test
 * vérifie EN PLUS que les deux bornes sont réellement atteintes, faute de quoi il ne prouverait
 * rien — c'est la contre-mesure que cette famille de défauts a fini par mériter.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  TAILLE_GRAIN, CONTRASTE_CIBLE, PART_OMBRAGE, AMPLI_NORMALE, DIRECTION_LUMIERE,
  PART_TUILE_SUSPECTE, BLOCS_ECHELLE_TUILE,
  contrasteLocal3D, coutureCarrelage3D, partAEchelleDeTuile3D,
  ombrageDepuisNormale3D, grainNormalise3D, teinteDominante3D,
  classerCartes3D, regimeDeCuisson3D, nomDuGrain3D,
  natureDeLaTexture3D, natureDuNom3D, MARGE_NATURE,
} from '../tools/bake-textures.mjs';

const T = 64;

/** Une carte grise construite pixel par pixel. */
const carte = (taille, f) => {
  const g = new Float64Array(taille * taille);
  for (let y = 0; y < taille; y++) for (let x = 0; x < taille; x++) g[y * taille + x] = f(x, y);
  return g;
};

/** Une carte de normales RGBA, à partir d'une pente exprimée en octets. */
const normale = (taille, f) => {
  const a = new Uint8Array(taille * taille * 4);
  for (let y = 0; y < taille; y++) {
    for (let x = 0; x < taille; x++) {
      const { r, v, b } = f(x, y);
      const i = (y * taille + x) * 4;
      a[i] = r; a[i + 1] = v; a[i + 2] = b; a[i + 3] = 255;
    }
  }
  return a;
};

/** Une normale strictement plate : elle pointe droit vers le haut, donc n'apporte aucun relief. */
const NORMALE_PLATE = normale(T, () => ({ r: 128, v: 128, b: 255 }));

/** Un bruit reproductible : les tests ne doivent pas dépendre du tirage du jour. */
function bruit(graine){
  let s = graine >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

describe('contrasteLocal3D — le voisinage, pas la dispersion', () => {
  /**
   * ⚠️ LE TEST QUI JUSTIFIE TOUT L'OUTIL. C'est cette distinction qui a fait écarter la carte de
   * couleur : un albédo affiche un écart-type honorable (3,67) et un contraste local d'aplat
   * (2,24). Une rampe et un damier ont ici presque la même dispersion et des contrastes locaux
   * séparés par deux ordres de grandeur. Remplacer la mesure par un écart-type efface cet écart.
   */
  test('une rampe très dispersée a un contraste local quasi nul', () => {
    const rampe = carte(T, (x) => (x / (T - 1)) * 255);
    const damier = carte(T, (x, y) => ((x + y) % 2 ? 255 : 0));

    const ecartType = (g) => {
      const m = g.reduce((a, b) => a + b, 0) / g.length;
      return Math.sqrt(g.reduce((a, b) => a + (b - m) ** 2, 0) / g.length);
    };
    // Les deux sont largement étalées : la dispersion ne les distingue pas.
    assert.ok(ecartType(rampe) > 70, `rampe ${ecartType(rampe)}`);
    assert.ok(ecartType(damier) > 70, `damier ${ecartType(damier)}`);

    // Le contraste local, lui, les sépare d'un facteur supérieur à cinquante.
    const cr = contrasteLocal3D(rampe, T), cd = contrasteLocal3D(damier, T);
    assert.ok(cr < 3, `rampe ${cr}`);
    assert.ok(cd > 150, `damier ${cd}`);
    assert.ok(cd / cr > 50, `rapport ${cd / cr}`);
  });

  test('un aplat parfait rend exactement zéro', () => {
    assert.equal(contrasteLocal3D(carte(T, () => 42), T), 0);
  });

  /**
   * ⚠️ LES DEUX DIRECTIONS COMPTENT. Ne sommer que les écarts horizontaux laisserait passer une
   * texture rayée, qui est précisément ce qu'un tissage produit. Deux rayures orthogonales de même
   * pas doivent donner le même chiffre ; si une seule boucle survit, l'une des deux tombe à zéro.
   */
  test('des rayures horizontales et verticales de même pas se valent', () => {
    const debout = contrasteLocal3D(carte(T, (x) => (x % 2 ? 200 : 40)), T);
    const couche = contrasteLocal3D(carte(T, (x, y) => (y % 2 ? 200 : 40)), T);
    assert.ok(debout > 70, `debout ${debout}`);
    assert.ok(Math.abs(debout - couche) < 1, `${debout} vs ${couche}`);
  });
});

describe('coutureCarrelage3D — le raccord rapporté au reste', () => {
  test('un motif périodique se raccorde sans se voir', () => {
    // Quatre périodes entières sur la largeur : le bord droit prolonge exactement le bord gauche.
    const seamless = carte(T, (x, y) =>
      128 + 60 * Math.sin((2 * Math.PI * 4 * x) / T) * Math.cos((2 * Math.PI * 4 * y) / T));
    const r = coutureCarrelage3D(seamless, T);
    assert.ok(r < 1.3, `raccord visible : ${r}`);
  });

  test('une rampe non carrelable trahit son raccord', () => {
    const rampe = carte(T, (x) => (x / (T - 1)) * 255);
    const r = coutureCarrelage3D(rampe, T);
    assert.ok(r > 20, `raccord non détecté : ${r}`);
  });

  /**
   * ⚠️ C'EST UN RAPPORT, ET LE DÉNOMINATEUR DOIT GOUVERNER. Une texture deux fois plus contrastée
   * a un raccord deux fois plus marqué en valeur absolue, sans être plus visible pour autant.
   * Supprimer la division rendrait le chiffre incomparable d'une matière à l'autre.
   */
  test('doubler l\'amplitude ne change pas le rapport', () => {
    const f = (k) => carte(T, (x, y) => 128 + k * Math.sin((2 * Math.PI * 4 * x) / T)
      + k * 0.3 * Math.cos((2 * Math.PI * 4 * y) / T));
    const a = coutureCarrelage3D(f(30), T), b = coutureCarrelage3D(f(60), T);
    assert.ok(Math.abs(a - b) < 0.05, `${a} vs ${b}`);
  });

  test('un aplat n\'a pas de raccord mesurable, et ne divise pas par zéro', () => {
    assert.equal(coutureCarrelage3D(carte(T, () => 100), T), 0);
  });
});

describe('partAEchelleDeTuile3D — ce qui survit à l\'éloignement', () => {
  /**
   * ⚠️ LA MESURE QUE J'AVAIS D'ABORD ÉCRITE FAUSSE. Elle comptait les pixels extrêmes, et
   * signalait le papier froissé — la seule texture retenue — parce qu'un pli est aussi extrême
   * qu'une tache. Ces deux fixtures portent la même dispersion ; seule leur ÉCHELLE diffère.
   */
  test('un grain fin se moyenne, une tache large survit', () => {
    const tirage = bruit(7);
    const grain = carte(T, () => (tirage() < 0.5 ? 88 : 168));
    // Une seule tache occupant un quart de l'image, de même amplitude que le grain.
    const tache = carte(T, (x, y) => (x < T / 2 && y < T / 2 ? 168 : 88));

    const g = partAEchelleDeTuile3D(grain, T), t = partAEchelleDeTuile3D(tache, T);
    // Même dispersion d'ensemble : ce n'est pas elle qui les distingue.
    assert.ok(Math.abs(g.ecartTotal - t.ecartTotal) < 6, `${g.ecartTotal} vs ${t.ecartTotal}`);

    assert.equal(g.suspect, false, `grain signalé à tort : ${g.part}`);
    assert.equal(t.suspect, true, `tache non signalée : ${t.part}`);
    assert.ok(t.part > g.part * 5, `${t.part} vs ${g.part}`);
  });

  /**
   * ⚠️ LE SEUIL DOIT GOUVERNER, PAS SEULEMENT FIGURER. Une constante qu'aucun test ne franchit
   * dans les deux sens peut être remplacée par n'importe quoi sans rougir.
   */
  test('le verdict bascule de part et d\'autre du seuil', () => {
    // Un dégradé doux à l'échelle de la tuile : sa part est proche de 1, très au-dessus du seuil.
    const large = partAEchelleDeTuile3D(carte(T, (x) => 128 + 60 * Math.sin(Math.PI * x / T)), T);
    assert.ok(large.part > PART_TUILE_SUSPECTE, `${large.part}`);
    assert.equal(large.suspect, true);

    const tirage = bruit(11);
    const fin = partAEchelleDeTuile3D(carte(T, () => 60 + tirage() * 140), T);
    assert.ok(fin.part < PART_TUILE_SUSPECTE, `${fin.part}`);
    assert.equal(fin.suspect, false);
  });

  /**
   * ⚠️ LE SENS DU VERDICT NE SUFFIT PAS, SA VALEUR DOIT TENIR. Le test précédent laissait passer
   * un seuil relâché à 0,9 : ses deux fixtures restaient du bon côté. Or un seuil n'est utile que
   * s'il tombe dans l'écart RÉEL entre une matière utilisable et une qui ne l'est pas, et cet
   * écart a été mesuré sur les quatre matières d'essai.
   *
   * La toile de jean est le pire cas acceptable — une trame régulière porte, par nature, beaucoup
   * de structure à grande échelle — et le carton taché est le seul cas rejeté à l'œil. Entre les
   * deux, il y a presque du simple au double, et le seuil doit y rester.
   */
  test('le seuil tombe dans l\'écart mesuré entre la toile et le carton', () => {
    const TOILE_JEAN = 0.126;      // la plus structurée des matières jugées utilisables
    const CARTON_TACHE = 0.241;    // la seule jugée inutilisable, et pour ce motif exact
    assert.ok(PART_TUILE_SUSPECTE > TOILE_JEAN,
      `${PART_TUILE_SUSPECTE} signalerait la toile de jean, qui est utilisable`);
    assert.ok(PART_TUILE_SUSPECTE < CARTON_TACHE,
      `${PART_TUILE_SUSPECTE} laisserait passer le carton taché`);
  });

  test('un aplat ne divise pas par zéro', () => {
    const r = partAEchelleDeTuile3D(carte(T, () => 30), T);
    assert.deepEqual(r, { part: 0, suspect: false, ecartTotal: 0 });
  });

  /**
   * ⚠️ LE DÉCOUPAGE EN BLOCS DOIT COUVRIR L'IMAGE. Une boucle qui s'arrêterait un bloc trop tôt,
   * ou qui ne lirait qu'un pixel par bloc, passerait les tests ci-dessus : le grain resterait bas
   * et la tache haute. Ici la tache est placée dans le DERNIER bloc, et nulle part ailleurs.
   */
  test('une tache dans le tout dernier bloc est vue', () => {
    const c = Math.floor(T / BLOCS_ECHELLE_TUILE);
    const r = partAEchelleDeTuile3D(carte(T, (x, y) => (x >= T - c && y >= T - c ? 255 : 100)), T);
    assert.ok(r.part > 0.3, `dernier bloc ignoré : ${r.part}`);
  });
});

describe('ombrageDepuisNormale3D — la lumière cuite dans le grain', () => {
  test('une normale plate rend une valeur uniforme', () => {
    const o = ombrageDepuisNormale3D(NORMALE_PLATE, T);
    for (let i = 1; i < o.length; i++) assert.ok(Math.abs(o[i] - o[0]) < 1e-9);
  });

  /**
   * ⚠️ LE TEST DE LA CONVENTION OPENGL. Les banques livrent `_nor_gl` et `_nor_dx`, qui ne
   * diffèrent que par le SIGNE DU CANAL VERT. Prendre le mauvais inverse le relief : un pli se
   * lit comme une bosse, discrètement. Deux pentes opposées en vert doivent s'éclairer
   * différemment, et dans le sens que la direction de lumière impose.
   */
  test('le canal vert gouverne, et dans le bon sens', () => {
    const versLaLumiere = ombrageDepuisNormale3D(normale(T, () => ({ r: 128, v: 80, b: 255 })), T);
    const dosALaLumiere = ombrageDepuisNormale3D(normale(T, () => ({ r: 128, v: 176, b: 255 })), T);
    // La lumière vient du haut-gauche : sa composante Y est négative, donc une pente dont le vert
    // est SOUS 128 la reçoit de face et doit ressortir plus claire.
    assert.ok(DIRECTION_LUMIERE.y < 0, 'la fixture suppose une lumière venant du haut');
    assert.ok(versLaLumiere[0] > dosALaLumiere[0], `${versLaLumiere[0]} vs ${dosALaLumiere[0]}`);
  });

  test('le canal rouge gouverne aussi', () => {
    const a = ombrageDepuisNormale3D(normale(T, () => ({ r: 80, v: 128, b: 255 })), T);
    const b = ombrageDepuisNormale3D(normale(T, () => ({ r: 176, v: 128, b: 255 })), T);
    assert.ok(a[0] > b[0], `${a[0]} vs ${b[0]}`);
  });

  /**
   * ⚠️ L'AMPLIFICATION DOIT RÉVÉLER LA PENTE. Relevé sur Paper005, la pente moyenne vaut 0,029 :
   * sans redressement, l'écart entre une bosse et un creux reste sous le bruit. Ce test fige
   * qu'une pente faible produit un écart visible, ce qui échoue si le facteur tombe à 1.
   */
  test('une pente faible produit malgré tout un écart lisible', () => {
    const léger = (v) => ombrageDepuisNormale3D(normale(T, () => ({ r: 128, v, b: 255 })), T)[0];
    assert.ok(AMPLI_NORMALE > 1, 'le redressement doit amplifier');
    assert.ok(Math.abs(léger(124) - léger(132)) > 5, `${léger(124)} vs ${léger(132)}`);
  });

  test('la direction passée gouverne', () => {
    const n = normale(T, () => ({ r: 80, v: 128, b: 255 }));
    const gauche = ombrageDepuisNormale3D(n, T, AMPLI_NORMALE, { x: -1, y: 0, z: 0.4 });
    const droite = ombrageDepuisNormale3D(n, T, AMPLI_NORMALE, { x: 1, y: 0, z: 0.4 });
    assert.ok(gauche[0] > droite[0], `${gauche[0]} vs ${droite[0]}`);
  });
});

describe('grainNormalise3D — le gain déduit d\'une cible', () => {
  const tirage = bruit(3);
  const RELIEF_FIN = carte(T, () => tirage() * 255);

  /**
   * ⚠️ LE TEST QUI REMPLACE L'AMPLIFICATION FIXE, ET LA RAISON DE LA CORRECTION. Un facteur figé
   * donnait 6,43 sur le papier froissé et 33,41 sur le papier fin, parce qu'il pousse d'autant
   * plus fort que la matière porte peu de relief. Ici la même carte, divisée par quatre en
   * amplitude, doit ressortir au même contraste — avec un gain quatre fois plus grand.
   */
  test('une matière quatre fois plus douce atteint la même cible', () => {
    const doux = carte(T, (x, y) => 128 + (RELIEF_FIN[y * T + x] - 128) / 4);
    const a = grainNormalise3D(RELIEF_FIN, NORMALE_PLATE, T);
    const b = grainNormalise3D(doux, NORMALE_PLATE, T);

    assert.ok(Math.abs(a.contraste - CONTRASTE_CIBLE) < 0.6, `${a.contraste}`);
    assert.ok(Math.abs(b.contraste - CONTRASTE_CIBLE) < 0.6, `${b.contraste}`);
    // Et le gain a bien absorbé l'écart, au lieu de le laisser passer dans l'image.
    assert.ok(b.gain / a.gain > 3, `gains ${a.gain} et ${b.gain}`);
  });

  /**
   * ⚠️ LA CIBLE EST UN PARAMÈTRE, ET AUCUN PARAMÈTRE NE DOIT ÊTRE INUTILISÉ. C'est la parade
   * posée après M118, où une fonction recevait des arguments qu'elle n'employait pas : le test
   * vérifiait qu'ils ARRIVENT, jamais qu'ils GOUVERNENT.
   */
  test('doubler la cible double le contraste obtenu', () => {
    const a = grainNormalise3D(RELIEF_FIN, NORMALE_PLATE, T, 6.4);
    const b = grainNormalise3D(RELIEF_FIN, NORMALE_PLATE, T, 12.8);
    assert.ok(b.contraste / a.contraste > 1.8, `${a.contraste} puis ${b.contraste}`);
  });

  /**
   * ⚠️ LES DEUX ENTRÉES DOIVENT SERVIR. Avec une normale plate, seul le relief parle ; avec un
   * relief plat, seule la normale parle. Si une des deux branches du mélange disparaissait, l'un
   * de ces deux cas rendrait un aplat.
   */
  test('le relief seul suffit à produire du grain', () => {
    const r = grainNormalise3D(RELIEF_FIN, NORMALE_PLATE, T);
    assert.ok(r.contraste > 1, `aplat : ${r.contraste}`);
  });

  test('la normale seule suffit à produire du grain', () => {
    const tir = bruit(5);
    const nrm = normale(T, () => ({ r: 128 + Math.round(tir() * 60 - 30), v: 128, b: 255 }));
    const r = grainNormalise3D(carte(T, () => 128), nrm, T);
    assert.ok(PART_OMBRAGE > 0, 'la part directionnelle doit être non nulle');
    assert.ok(r.contraste > 1, `aplat : ${r.contraste}`);
  });

  test('le grain se centre sur le gris moyen', () => {
    const { grain } = grainNormalise3D(RELIEF_FIN, NORMALE_PLATE, T);
    assert.equal(grain.length, T * T);
    let somme = 0;
    for (const v of grain) somme += v;
    assert.ok(Math.abs(somme / grain.length - 128) < 4, `moyenne ${somme / grain.length}`);
  });

  /**
   * ⚠️ MON PREMIER TEST ICI NE POUVAIT PAS ÉCHOUER, ET C'EST LA SIXIÈME FOIS. Il parcourait le
   * grain en vérifiant `0 <= v <= 255`. Or `grain` est un `Uint8Array` : une valeur hors bornes y
   * BOUCLE à l'écriture, 260 devient 4. L'assertion était donc vraie par construction du type,
   * bornage ou pas. Retirer `Math.max`/`Math.min` laissait la suite verte.
   *
   * Et le défaut masqué est pire qu'un débordement : un pli très clair ne devient pas blanc, il
   * devient NOIR. Le grain se retourne localement.
   *
   * La parade est de ne plus mesurer la BORNE, que l'instrument ne peut pas voir franchir, mais la
   * PROPRIÉTÉ qui compte : un relief plus clair ne doit jamais rendre un grain plus sombre. Bornée,
   * la rampe monte puis forme un palier ; bouclée, elle retombe en dents de scie.
   */
  test('poussé à l\'excès, le grain plafonne au lieu de se retourner', () => {
    const rampe = carte(T, (x) => (x / (T - 1)) * 255);
    // Une cible démesurée garantit que le gain déduit fait sortir des bornes.
    const { grain } = grainNormalise3D(rampe, NORMALE_PLATE, T, 500);

    let plafonne = 0, plancher = 0;
    for (let y = 0; y < T; y++) {
      for (let x = 0; x < T - 1; x++) {
        const a = grain[y * T + x], b = grain[y * T + x + 1];
        assert.ok(b >= a, `retournement en (${x},${y}) : ${a} puis ${b}`);
      }
      if (grain[y * T + T - 1] === 255) plafonne++;
      if (grain[y * T] === 0) plancher++;
    }
    // Et l'instrument voit bien une présence : les deux bornes sont réellement atteintes, donc
    // le test ci-dessus a eu l'occasion d'échouer.
    assert.equal(plafonne, T, 'la borne haute n\'a jamais été atteinte : le test ne prouve rien');
    assert.equal(plancher, T, 'la borne basse n\'a jamais été atteinte : le test ne prouve rien');
  });

  /**
   * ⚠️ LE DÉCENTRAGE DU RELIEF DOIT ÊTRE FAIT, ET IL EST INVISIBLE AUTREMENT. Une carte claire et
   * la même carte sombre portent le même grain ; sans la soustraction de la moyenne, la seconde
   * saturerait à zéro et perdrait son relief. C'est un cas où le contraste seul ne suffit pas :
   * on compare les deux images.
   */
  test('une carte globalement sombre rend le même grain qu\'une carte claire', () => {
    const sombre = carte(T, (x, y) => RELIEF_FIN[y * T + x] * 0.25);
    const clair = carte(T, (x, y) => RELIEF_FIN[y * T + x] * 0.25 + 180);
    const a = grainNormalise3D(sombre, NORMALE_PLATE, T).grain;
    const b = grainNormalise3D(clair, NORMALE_PLATE, T).grain;
    for (let i = 0; i < a.length; i++) {
      assert.ok(Math.abs(a[i] - b[i]) <= 1, `pixel ${i} : ${a[i]} vs ${b[i]}`);
    }
  });
});

describe('teinteDominante3D — la seule chose que l\'albédo apporte', () => {
  test('la moyenne des trois canaux, en hexadécimal', () => {
    const a = new Uint8Array([0, 0, 0, 255, 200, 100, 50, 255]);
    assert.equal(teinteDominante3D(a), '#643219');
  });

  test('le canal alpha n\'entre pas dans la couleur', () => {
    const opaque = new Uint8Array([200, 100, 50, 255]);
    const translucide = new Uint8Array([200, 100, 50, 0]);
    assert.equal(teinteDominante3D(opaque), teinteDominante3D(translucide));
  });

  test('chaque canal va à sa place', () => {
    assert.equal(teinteDominante3D(new Uint8Array([255, 0, 0, 255])), '#FF0000');
    assert.equal(teinteDominante3D(new Uint8Array([0, 255, 0, 255])), '#00FF00');
    assert.equal(teinteDominante3D(new Uint8Array([0, 0, 255, 255])), '#0000FF');
  });

  test('sans pixel, du blanc plutôt qu\'une division par zéro', () => {
    assert.equal(teinteDominante3D(new Uint8Array(0)), '#FFFFFF');
  });
});

describe('classerCartes3D — deux banques, deux nommages', () => {
  test('le nommage ambientCG', () => {
    const r = classerCartes3D([
      'Paper005_4K_Color.jpg', 'Paper005_4K_Displacement.jpg', 'Paper005_4K_NormalGL.jpg']);
    assert.equal(r.relief, 'Paper005_4K_Displacement.jpg');
    assert.equal(r.normale, 'Paper005_4K_NormalGL.jpg');
    assert.equal(r.albedo, 'Paper005_4K_Color.jpg');
  });

  test('le nommage Poly Haven, où l\'occlusion ambiante tient lieu de relief', () => {
    const r = classerCartes3D([
      'denmin_fabric_02_diff_4k.jpg', 'denmin_fabric_02_ao_4k.jpg', 'denmin_fabric_02_nor_gl_4k.jpg']);
    assert.equal(r.relief, 'denmin_fabric_02_ao_4k.jpg');
    assert.equal(r.normale, 'denmin_fabric_02_nor_gl_4k.jpg');
    assert.equal(r.albedo, 'denmin_fabric_02_diff_4k.jpg');
  });

  /**
   * ⚠️ LE PIÈGE DES DEUX CONVENTIONS DE NORMALE. Un dossier complet contient les DEUX ; choisir
   * DirectX inverserait le relief sans rien casser de visible. Un test qui se contente de vérifier
   * qu'une normale a été trouvée laisse passer exactement cette erreur.
   */
  test('quand les deux normales sont là, c\'est OpenGL qui gagne', () => {
    const r = classerCartes3D([
      'Bricks075_4K_NormalDX.jpg', 'Bricks075_4K_NormalGL.jpg', 'Bricks075_4K_Displacement.jpg']);
    assert.equal(r.normale, 'Bricks075_4K_NormalGL.jpg');
  });

  test('DirectX seul ne passe pas pour une normale utilisable', () => {
    const r = classerCartes3D(['Bricks075_4K_NormalDX.jpg', 'Bricks075_4K_Displacement.jpg']);
    assert.equal(r.normale, null);
  });

  /**
   * ⚠️ RENDRE `null` PLUTÔT QUE DEVINER. Le repli silencieux est la première famille de défauts
   * nommée par ce dépôt : produire un grain depuis une carte quelconque donnerait une image
   * plausible, et personne ne saurait que la matière manquait.
   */
  test('rien de reconnaissable donne null, pas le premier fichier venu', () => {
    const r = classerCartes3D(['truc.jpg', 'machin.png', 'Paper005_4K_Roughness.jpg']);
    assert.equal(r.relief, null);
    assert.equal(r.normale, null);
    assert.equal(r.albedo, null);
  });

  test('une liste vide ne casse pas', () => {
    assert.deepEqual(classerCartes3D([]), { relief: null, normale: null, albedo: null });
  });

  /**
   * ⚠️ LA RUGOSITÉ RESSEMBLE À UN RELIEF ET N'EN EST PAS. `_Roughness` est présente dans tout
   * téléchargement ambientCG, en niveaux de gris, à côté du déplacement. Un motif trop large la
   * ramasserait, et le grain produit serait celui du brillant, pas celui de la forme.
   */
  test('la rugosité n\'est jamais prise pour du relief', () => {
    const r = classerCartes3D(['Paper005_4K_Roughness.jpg', 'Paper005_4K_Displacement.jpg']);
    assert.equal(r.relief, 'Paper005_4K_Displacement.jpg');
  });
});

describe('regimeDeCuisson3D — une MATIÈRE, une IMAGE, ou un refus', () => {
  const AMBIENTCG = ['Ice002_1K-JPG_Color.jpg', 'Ice002_1K-JPG_Displacement.jpg',
    'Ice002_1K-JPG_NormalGL.jpg', 'Ice002_1K-JPG_Roughness.jpg'];

  test('relief et normale : une matière', () => {
    const r = regimeDeCuisson3D(AMBIENTCG);
    assert.equal(r.regime, 'matiere');
    assert.equal(r.refus, null);
    assert.equal(r.relief, 'Ice002_1K-JPG_Displacement.jpg');
    assert.equal(r.normale, 'Ice002_1K-JPG_NormalGL.jpg');
    assert.equal(r.albedo, 'Ice002_1K-JPG_Color.jpg');
  });

  /**
   * ⚠️ UNE SEULE IMAGE EST UN MOTIF, PAS UNE SURFACE. Un ciel étoilé n'a pas de relief à
   * reconstruire : il EST déjà le motif, et sa luminance en tient lieu. Elle sert aussi de source
   * pour la teinte, puisqu'il n'y a pas d'albédo distinct.
   */
  test('une seule image, sans aucune carte : un motif', () => {
    const r = regimeDeCuisson3D(['NightSkyHDRI012_1K_TONEMAPPED.jpg']);
    assert.equal(r.regime, 'image');
    assert.equal(r.refus, null);
    assert.equal(r.relief, 'NightSkyHDRI012_1K_TONEMAPPED.jpg');
    assert.equal(r.normale, null, 'une image n’a pas de normale à inventer');
    assert.equal(r.albedo, 'NightSkyHDRI012_1K_TONEMAPPED.jpg', 'la teinte vient de l’image même');
  });

  /**
   * ⚠️ LE TEST QUI EMPÊCHE LE RÉGIME IMAGE D'ÊTRE UN REPLI SILENCIEUX, ET C'EST LE PLUS IMPORTANT
   * DE CE BLOC. Un déplacement dont la normale manque est un téléchargement incomplet. Se rabattre
   * sur le régime image produirait un grain plausible et appauvri de 30 % — la part du terme
   * directionnel — sans que rien ne le dise. C'est la première famille de défauts que ce dépôt
   * nomme, et la raison pour laquelle l'entrée en régime image exige l'ABSENCE des deux cartes.
   */
  test('un relief SANS sa normale est un refus, pas une image', () => {
    const r = regimeDeCuisson3D(['Ice002_Displacement.jpg']);
    assert.equal(r.regime, null, 'une matière amputée ne doit pas passer pour un motif');
    assert.ok(/normales/i.test(r.refus), `le refus doit nommer la carte manquante : ${r.refus}`);
  });

  test('une normale SANS relief est un refus, et se plaint de l’autre carte', () => {
    const r = regimeDeCuisson3D(['Ice002_NormalGL.jpg']);
    assert.equal(r.regime, null);
    assert.ok(/déplacement|occlusion/i.test(r.refus), `${r.refus}`);
  });

  /**
   * ⚠️ LES DEUX REFUS NE DOIVENT PAS DIRE LA MÊME CHOSE. Un message unique pour « il manque une
   * carte » laisserait chercher la mauvaise : on ouvrirait le dossier en quête d'un déplacement
   * qui est déjà là. Ce test tient la DISTINCTION, qu'un test par cas ne verrait pas.
   */
  test('et les deux refus ne se confondent pas', () => {
    const sansNormale = regimeDeCuisson3D(['Ice002_Displacement.jpg']).refus;
    const sansRelief = regimeDeCuisson3D(['Ice002_NormalGL.jpg']).refus;
    assert.notEqual(sansNormale, sansRelief);
  });

  /**
   * ⚠️ PLUSIEURS IMAGES NON CLASSÉES, ET RIEN NE DIT LAQUELLE EST LE MOTIF. Prendre la première
   * venue serait deviner — et l'ordre de `readdir` n'est pas une décision.
   */
  test('deux images inconnues : on refuse en les nommant', () => {
    const r = regimeDeCuisson3D(['avant.jpg', 'apres.jpg']);
    assert.equal(r.regime, null);
    assert.ok(r.refus.includes('avant.jpg') && r.refus.includes('apres.jpg'), r.refus);
  });

  test('un dossier vide le dit', () => {
    const r = regimeDeCuisson3D([]);
    assert.equal(r.regime, null);
    assert.ok(/aucune image/i.test(r.refus), r.refus);
  });

  /**
   * ⚠️ LA RUGOSITÉ NE DOIT PAS FAIRE BASCULER LE COMPTE. Elle accompagne tout téléchargement
   * ambientCG sans être une carte utile ici : si elle passait pour une image quelconque, un
   * dossier « déplacement + rugosité » paraîtrait contenir deux motifs au lieu d'une matière
   * amputée, et le refus parlerait du mauvais problème.
   */
  test('une matière amputée reste une matière amputée, rugosité comprise', () => {
    const r = regimeDeCuisson3D(['Ice002_Displacement.jpg', 'Ice002_Roughness.jpg']);
    assert.ok(/normales/i.test(r.refus), `${r.refus}`);
  });
});

describe('grainNormalise3D sans normale — le régime image', () => {
  const tirage = bruit(21);
  const RELIEF = carte(T, () => tirage() * 255);

  test('une image seule produit un grain, et il atteint la cible', () => {
    const r = grainNormalise3D(RELIEF, null, T);
    assert.ok(Math.abs(r.contraste - CONTRASTE_CIBLE) < 0.6, `${r.contraste}`);
  });

  /**
   * ⚠️ LE TERME DIRECTIONNEL DISPARAÎT, IL N'EST PAS APPROCHÉ. Le remplacer par une constante — ou
   * par une normale plate — laisserait `PART_OMBRAGE` amputer le relief de 30 % pour rien. Avec une
   * normale plate, l'ombrage est constant : il ne contribue à AUCUN contraste, mais il écrase bien
   * le relief du même facteur. Les deux grains diffèrent donc, et c'est mesurable.
   */
  test('ce n’est pas la même chose qu’une normale plate', () => {
    const sans = grainNormalise3D(RELIEF, null, T);
    const plate = grainNormalise3D(RELIEF, NORMALE_PLATE, T);
    // Les deux atteignent la cible — le gain compense —, donc le contraste ne les distingue pas…
    assert.ok(Math.abs(sans.contraste - plate.contraste) < 0.6);
    // …mais le gain, si : une normale plate dilue le relief de PART_OMBRAGE, qu'il faut rattraper.
    assert.ok(plate.gain > sans.gain * 1.2,
      `gains ${sans.gain.toFixed(3)} et ${plate.gain.toFixed(3)} : la part d’ombrage ne joue pas`);
  });

  test('le relief reste recentré, sans normale comme avec', () => {
    const sombre = carte(T, (x, y) => RELIEF[y * T + x] * 0.25);
    const clair = carte(T, (x, y) => RELIEF[y * T + x] * 0.25 + 180);
    const a = grainNormalise3D(sombre, null, T).grain;
    const b = grainNormalise3D(clair, null, T).grain;
    for (let i = 0; i < a.length; i++) assert.ok(Math.abs(a[i] - b[i]) <= 1, `pixel ${i}`);
  });
});

describe('natureDeLaTexture3D — où vit la structure', () => {
  /**
   * ⚠️ LES CHIFFRES SONT CEUX DES SEPT MATIÈRES TÉLÉCHARGÉES, mesurés avant d'écrire le seuil. Ils
   * figurent ici parce qu'une constante placée « au milieu » ne veut rien dire sans les deux bornes
   * qu'elle sépare.
   *
   *   matière          albédo  relief  rapport
   *   papier fin         2,11   18,90     0,11
   *   papier froissé     1,11    3,43     0,32
   *   carton             2,45    5,82     0,42
   *   nuit étoilée       4,45    4,45     1,00   ← même fichier des deux côtés, par construction
   *   glace              6,52    6,22     1,05
   *   lave               4,70    2,64     1,78
   *   toile de jean     26,48   14,36     1,84
   */
  test('le relief l’emporte sur les papiers et le carton', () => {
    assert.equal(natureDeLaTexture3D(1.11, 3.43), 'gris');
    assert.equal(natureDeLaTexture3D(2.11, 18.90), 'gris');
    assert.equal(natureDeLaTexture3D(2.45, 5.82), 'gris');
  });

  test('la couleur l’emporte sur la lave et la toile de jean', () => {
    assert.equal(natureDeLaTexture3D(4.70, 2.64), 'couleur');
    assert.equal(natureDeLaTexture3D(26.48, 14.36), 'couleur');
  });

  /**
   * ⚠️ J'AVAIS ANNONCÉ QUE LA GLACE BASCULERAIT, ET LA MESURE DIT NON. Son albédo et son relief
   * portent autant de structure l'un que l'autre — 6,52 contre 6,22, soit 1,05. C'est le cas
   * exactement litigieux, et c'est pour lui que la marge existe : les départager reviendrait à
   * tirer à pile ou face sur du bruit, et la nature de la texture changerait d'une version de la
   * source à l'autre.
   */
  test('une quasi-égalité reste au GRIS, le régime historique', () => {
    assert.equal(natureDeLaTexture3D(6.52, 6.22), 'gris');
    assert.equal(natureDeLaTexture3D(4.45, 4.45), 'gris', 'une IMAGE se compare à elle-même');
    assert.equal(natureDeLaTexture3D(10, 10), 'gris');
  });

  /**
   * ⚠️ LE SEUIL TOMBE DANS L'ÉCART MESURÉ, et ce test l'y tient. Sans lui, la marge pourrait valoir
   * n'importe quoi entre 1,06 et 1,77 sans qu'aucune assertion ne bronche — c'est la faute qui a
   * laissé passer M6 en #431a, où je tenais le sens d'une comparaison et pas sa valeur.
   */
  test('la marge sépare la glace de la lave', () => {
    assert.ok(MARGE_NATURE > 1.05, `${MARGE_NATURE} ferait basculer la glace`);
    assert.ok(MARGE_NATURE < 1.78, `${MARGE_NATURE} retiendrait la lave en gris`);
  });

  test('une mesure illisible retombe sur le gris, sans lever', () => {
    assert.equal(natureDeLaTexture3D(NaN, 3), 'gris');
    assert.equal(natureDeLaTexture3D(3, 0), 'gris', 'un relief nul ne doit pas diviser par zéro');
    assert.equal(natureDeLaTexture3D(0, 0), 'gris');
  });
});

describe('⚠️ LA NATURE VOYAGE DANS LE NOM DU FICHIER', () => {
  /**
   * ⚠️ POURQUOI LE NOM ET NON LE REGISTRE. Le dessin doit savoir s'il compose par ÉCART — même
   * décalage sur les trois canaux, qui préserve la teinte — ou par RAPPORT. Les deux règles sont
   * incompatibles : appliquer le rapport à un grain gris ramènerait le mélange multiplicatif que
   * #431b1 a mesuré et rejeté. Déclarer la nature dans le registre en ferait une valeur à tenir
   * d'accord avec un fichier, donc à périmer — la famille de défauts la plus fréquente ici. Portée
   * par le nom, elle a une source unique : changer de nature RENOMME, et le registre ne peut pas
   * ne pas suivre.
   */
  test('le nom porte la nature, et se relit', () => {
    assert.equal(nomDuGrain3D('lave', 'couleur'), 'lave.couleur.png');
    assert.equal(nomDuGrain3D('papier-froisse', 'gris'), 'papier-froisse.png');
    assert.equal(nomDuGrain3D('papier-froisse'), 'papier-froisse.png', 'le gris est le défaut');
  });

  test('aller-retour : ce que le cuiseur nomme, le dessin le relit', () => {
    for (const nature of ['gris', 'couleur']) {
      assert.equal(natureDuNom3D(nomDuGrain3D('essai', nature)), nature);
    }
  });

  /**
   * ⚠️ UN NOM QUI CONTIENT « couleur » AILLEURS QU'À LA FIN N'EST PAS UNE TEXTURE COULEUR. Sans
   * cette précision, une matière nommée « couleur-de-pierre » basculerait de régime par accident
   * de vocabulaire, et le mélange multiplicatif reviendrait sans que rien ne le demande.
   */
  test('seul le suffixe compte, pas le mot où qu’il soit', () => {
    assert.equal(natureDuNom3D('couleur-de-pierre.png'), 'gris');
    assert.equal(natureDuNom3D('pierre-couleur-chaude.png'), 'gris');
    assert.equal(natureDuNom3D('pierre.couleur.png'), 'couleur');
    assert.equal(natureDuNom3D('pierre.couleur'), 'couleur', 'le registre cite parfois sans .png');
  });

  test('un nom vide ou absent ne casse pas', () => {
    assert.equal(natureDuNom3D(''), 'gris');
    assert.equal(natureDuNom3D(null), 'gris');
  });
});

describe('nomDuGrain3D — un identifiant devient un fichier', () => {
  test('minuscules, tirets, extension', () => {
    assert.equal(nomDuGrain3D('Papier Froissé'), 'papier-froiss.png');
    assert.equal(nomDuGrain3D('Paper005'), 'paper005.png');
  });

  test('pas de tiret en tête ni en queue', () => {
    assert.equal(nomDuGrain3D('  toile de jean  '), 'toile-de-jean.png');
    assert.equal(nomDuGrain3D('__carton__'), 'carton.png');
  });
});

describe('⚠️ L’OUTIL DOIT RENDRE LA MAIN, et rien sous Node ne peut le prouver', () => {
  /**
   * ⚠️ CE TEST LIT LA SOURCE, ET C'EST UN AVEU AUTANT QU'UNE GARDE. Le cuiseur tourne sous
   * `electron`, qui est une APPLICATION : sa boucle d'événements attend des fenêtres et des
   * signaux, indéfiniment. Les autres outils de `tools/` tournent sous node, qui s'arrête quand il
   * n'a plus rien à faire — d'où le piège, invisible par analogie.
   *
   * Le défaut a été SIGNALÉ PAR L'USAGE, après que j'ai déclaré l'outil « validé de bout en bout »
   * sur la foi de son rapport. Il écrivait son PNG, imprimait ses six lignes de mesures, et
   * laissait le terminal pendu. J'avais vérifié qu'il IMPRIME, jamais qu'il SE TERMINE : un
   * rapport complet ressemble beaucoup à une fin normale.
   *
   * Ce qu'on tient ici est exactement ce qui a manqué — LES DEUX ISSUES de `main()`, le succès
   * comme l'échec. Un outil qui rend la main après une cuisson réussie mais reste pendu sur un
   * dossier introuvable aurait le même défaut, la moitié du temps.
   *
   * ⚠️ PAS TENU : que la sortie fonctionne. Seul un vrai lancement le dit, et c'est ce qui l'a
   * dit. Voir docs/en/testing-method.md, § « Ce qui est hors de portée ».
   */
  test('les deux issues de main() passent par la sortie explicite', () => {
    const source = readFileSync(new URL('../tools/bake-textures.mjs', import.meta.url), 'utf8');
    const garde = source.slice(source.indexOf('if (import.meta.url === pathToFileURL'));
    assert.ok(garde.length > 0, 'la garde de point d’entrée a disparu');

    const sorties = garde.match(/rendreLaMain\(/g) || [];
    assert.ok(sorties.length >= 2,
      `${sorties.length} sortie(s) dans la garde : le succès ET l’échec doivent rendre la main`);
    // Et les deux codes de retour existent : sortir 0 sur une erreur ferait passer un échec pour
    // une réussite auprès de tout ce qui enchaînerait sur cet outil.
    assert.ok(/rendreLaMain\(0\)/.test(garde), 'le succès doit sortir en 0');
    assert.ok(/rendreLaMain\(1\)/.test(garde), 'l’échec doit sortir en 1');
  });

  /**
   * ⚠️ VIDER `stdout` AVANT DE COUPER. Sous Windows, une sortie REDIRIGÉE — vers un fichier, ou
   * dans un tube — s'écrit de façon asynchrone. `app.exit()` aussitôt tronquerait les dernières
   * lignes, et le premier à s'en apercevoir serait celui qui journalise une cuisson au lieu de la
   * lire, c'est-à-dire personne, pendant longtemps.
   */
  /**
   * ⚠️ RECADRER AU CARRÉ AVANT DE RÉDUIRE, ET NON L'INVERSE. Les cartes d'une matière sont carrées,
   * donc l'ordre n'y change rien — mais une panoramique de ciel fait 2:1, et la ramener directement
   * en 512² l'écraserait du double en largeur. C'est l'erreur exacte qui avait déformé ma première
   * planche de comparaison, et qu'on m'avait signalée : `resize((300,160))` sur une image carrée.
   *
   * Le tort ne se verrait pas dans les mesures : une image écrasée garde un contraste local
   * honorable, une couture correcte, une part de tuile plausible. Il ne se voit qu'à l'œil, sur la
   * matière — et seulement sur celles qui ne sont pas carrées, donc rarement.
   */
  test('le recadrage carré précède la réduction', () => {
    const source = readFileSync(new URL('../tools/bake-textures.mjs', import.meta.url), 'utf8');
    const corps = source.slice(source.indexOf('async function chargerCarte'),
      source.indexOf('function grisDepuisRgba'));
    const recadre = corps.indexOf('.crop(');
    const reduit = corps.indexOf('.resize(');
    assert.ok(recadre >= 0, 'rien ne recadre : une panoramique serait écrasée');
    assert.ok(reduit >= 0, 'plus de réduction à 512² ?');
    assert.ok(recadre < reduit, 'on recadre APRÈS avoir réduit : l’écrasement a déjà eu lieu');
  });

  test('la sortie attend que stdout soit vidé', () => {
    const source = readFileSync(new URL('../tools/bake-textures.mjs', import.meta.url), 'utf8');
    const corps = source.slice(source.indexOf('async function rendreLaMain'));
    const vidage = corps.indexOf('process.stdout.write');
    const coupure = corps.indexOf('app.exit');
    assert.ok(vidage >= 0, 'rien ne vide stdout avant de couper');
    assert.ok(vidage < coupure, 'stdout est vidé APRÈS la coupure : trop tard');
  });
});

describe('les réglages tiennent ensemble', () => {
  test('la taille cuite est celle que l\'application attend', () => {
    assert.equal(TAILLE_GRAIN, 512);
  });

  /**
   * ⚠️ LE DAMIER DOIT DIVISER LA TUILE SANS RESTE. Huit blocs sur 512 donnent des pavés de 64
   * pixels ; un nombre qui ne tombe pas juste laisserait une bande de bord hors de la mesure, et
   * c'est exactement là qu'un raccord se voit.
   */
  test('le damier couvre la tuile exactement', () => {
    assert.equal(TAILLE_GRAIN % BLOCS_ECHELLE_TUILE, 0);
  });

  test('le mélange est une vraie moyenne pondérée', () => {
    assert.ok(PART_OMBRAGE > 0 && PART_OMBRAGE < 1, `${PART_OMBRAGE}`);
  });
});
