/**
 * tests/colour-signals.test.mjs, les couleurs qui SIGNALENT, et ce qu'elles valent en daltonisme.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * POURQUOI CE FICHIER EXISTE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Le chantier #409 a mesuré les couleurs de l'application sous trois déficiences de la vision des
 * couleurs. Ces chiffres vivaient dans une conversation et dans une note. Ils vivent maintenant
 * ici, exécutables : une teinte modifiée à l'aveugle, un jour, tombera au rouge plutôt que de
 * dégrader en silence quelque chose que personne ne rejouera.
 *
 * ⚠️ CE FICHIER NE MESURE QUE CE QUI SIGNALE. La distinction gouverne tout le chantier
 * (cf. docs/en/colour-accessibility.md) : « sélectionné », « en recadrage », « porteur d'un rôle »
 * sont des ÉTATS, qu'un thème a le droit de repeindre ; la peau d'un Personnage ou la teinte d'une
 * haie REPRÉSENTENT quelque chose, et les repeindre rendrait le dessin faux. Mesurer une palette
 * dans l'abstrait ne prouve rien : la première mesure de ce chantier a porté sur `PALETTE`, six
 * couleurs dont cinq n'avaient aucun lecteur, et a produit une page de chiffres alarmants sur du
 * code qui ne s'exécute pour personne.
 *
 * ⚠️ ET IL NE PRÉTEND PAS QUE L'APPLICATION EST ACCESSIBLE. Deux paires mesurées ici sont
 * INSUFFISANTES et le restent : elles sont épinglées telles quelles, avec leur valeur réelle, parce
 * qu'elles se corrigent en ajoutant un second indice (#409b) et non en changeant une teinte. Un
 * test qui les masquerait derrière un seuil complaisant serait pire que pas de test.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  SIGNAL_SELECTION, SIGNAL_SELECTION_LISERE, SIGNAL_SELECTION_3D, SIGNAL_BATIMENT,
  SIGNAL_RECADRAGE, SIGNAL_MESURE, SIGNAL_CONSTRUIRE, SIGNAL_CONSTRUIRE_DETACHE,
  SIGNAL_AIMANTATION, SIGNAL_POSE_ACTIVE, SIGNAL_POSE_ROLE, SIGNAL_POSE_SANS_ROLE,
  SIGNAL_APERCU_PERSO, SIGNAL_APERCU_ELEMENT, SIGNAL_IMAGE_ABSENTE_TEXTE,
  SIGNAL_IMAGE_ATTENDUE_TEXTE, FIXED_COLOR,
} from '../src/constants.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const DRAW = readFileSync(join(RACINE, 'src', 'draw.js'), 'utf8');

// ── L'instrument de mesure ─────────────────────────────────────────────────────────────────────
//
// Simulation Brettel/Viénot 1999. sRVB vers linéaire, vers LMS par la matrice de Viénot,
// application de la matrice de déficience, retour. Aucune dépendance : trente lignes valent mieux
// qu'un paquet npm pour un calcul qu'on doit pouvoir relire.

const versLineaire = (c) => (c /= 255, c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const versSRVB = (c) => {
  c = Math.max(0, Math.min(1, c));
  return 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
};
function versRVB(hex) {
  let h = hex.replace('#', '');
  const rgba = /rgba?\(([^)]+)\)/.exec(hex);
  if (rgba) return rgba[1].split(',').slice(0, 3).map(n => Number(n.trim()));
  if (h.length === 3) h = [...h].map(c => c + c).join('');
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
}
const M = [[0.31399, 0.63951, 0.04649], [0.15537, 0.75789, 0.08670], [0.01775, 0.10945, 0.87259]];
const MI = [[5.47221, -4.64196, 0.16963], [-1.12524, 2.29317, -0.16789], [0.02980, -0.19318, 1.16364]];
const DEFICIENCES = {
  deuteranopie: [[1, 0, 0], [0.9513092, 0, 0.04302975], [0, 0, 1]],
  protanopie: [[0, 1.05118294, -0.05116099], [0, 1, 0], [0, 0, 1]],
  tritanopie: [[1, 0, 0], [0, 1, 0], [-0.86744736, 1.86727089, 0]],
};
const produit = (m, v) => m.map(l => l.reduce((s, x, j) => s + x * v[j], 0));

export function simulerDeficience3D(couleur, type) {
  const lin = versRVB(couleur).map(versLineaire);
  return produit(MI, produit(DEFICIENCES[type], produit(M, lin))).map(versSRVB);
}
const ecart = (a, b) => Math.hypot(...a.map((x, i) => x - b[i]));
function pireEcart3D(a, b) {
  return Math.min(...Object.keys(DEFICIENCES)
    .map(t => ecart(simulerDeficience3D(a, t), simulerDeficience3D(b, t))));
}

describe('L\'instrument avant les mesures', () => {
  test('le garde-fou : la simulation transforme vraiment', () => {
    // Une simulation qui rendrait sa couleur d'entrée ferait passer TOUTES les mesures ci-dessous,
    // en ne mesurant rien. C'est la forme d'échec silencieux qui est revenue quatre fois ici.
    const vert = versRVB('#00FF00');
    const simule = simulerDeficience3D('#00FF00', 'deuteranopie');
    assert.ok(ecart(vert, simule) > 60, 'le vert pur doit bouger en deutéranopie');
  });

  test('… et elle laisse les gris tranquilles', () => {
    // L'autre face : une simulation qui bougerait TOUT serait aussi fausse, dans l'autre sens. Un
    // gris n'a pas de teinte à perdre.
    ['deuteranopie', 'protanopie', 'tritanopie'].forEach(t =>
      assert.ok(ecart(versRVB('#808080'), simulerDeficience3D('#808080', t)) < 5,
        `un gris ne devrait pas bouger en ${t}`));
  });

  test('elle lit aussi bien #abc, #aabbcc que rgba()', () => {
    assert.deepEqual(versRVB('#fff'), [255, 255, 255]);
    assert.deepEqual(versRVB('#B5482A'), [181, 72, 42]);
    assert.deepEqual(versRVB('rgba(255,120,0,0.85)'), [255, 120, 0]);
  });
});

describe('Les paires que l\'utilisateur doit distinguer', () => {
  /**
   * Le seuil : sous 60, deux couleurs ne se séparent plus d'un coup d'œil. Ce n'est pas une norme,
   * c'est une valeur calibrée sur les paires de CE dépôt, et le journal de la note dit sur quoi.
   */
  const SEUIL = 60;
  const PAIRES = [
    ['sélection / outil Construire', SIGNAL_SELECTION, SIGNAL_CONSTRUIRE],
    ['sélection / poignée (liseré)', SIGNAL_SELECTION, SIGNAL_SELECTION_LISERE],
    ['sélection 2D / sélection 3D', SIGNAL_SELECTION, SIGNAL_SELECTION_3D],
    ['Bâtiment / outil Construire', SIGNAL_BATIMENT, SIGNAL_CONSTRUIRE],
    ['outil Construire / point détaché', SIGNAL_CONSTRUIRE, SIGNAL_CONSTRUIRE_DETACHE],
    ['outil Mesure / sélection', SIGNAL_MESURE, SIGNAL_SELECTION],
    ['pose active / pose avec rôle', SIGNAL_POSE_ACTIVE, SIGNAL_POSE_ROLE],
    ['image absente / image attendue (texte)', SIGNAL_IMAGE_ABSENTE_TEXTE, SIGNAL_IMAGE_ATTENDUE_TEXTE],
  ];

  PAIRES.forEach(([nom, a, b]) => {
    test(`${nom} reste séparable dans les trois déficiences`, () => {
      const d = pireEcart3D(a, b);
      assert.ok(d >= SEUIL, `${nom} : écart ${d.toFixed(0)}, sous le seuil de ${SEUIL}`);
    });
  });

  test('le garde-fou : la liste n\'a pas fondu', () => {
    // Huit paires. Si quelqu'un en retirait sept pour faire passer une teinte, la suite resterait
    // verte sans que personne ne le voie.
    assert.ok(PAIRES.length >= 8, `seulement ${PAIRES.length} paires surveillées`);
  });
});

describe('Faibles en couleur, mais portées par le motif de tirets', () => {
  /**
   * ⚠️ CES DEUX PAIRES ONT ÉTÉ TROUVÉES PAR CE FICHIER, pas par la campagne de mesure. Je n'avais
   * mesuré que les paires auxquelles j'avais pensé ; le test, lui, a interrogé la liste entière.
   * C'est l'argument le plus net pour écrire la mesure plutôt que de la raconter.
   *
   * Elles sont faibles en teinte mais ne sont PAS le même défaut que la vue de dessus : chacune
   * porte déjà un second indice, un motif de tirets distinct. C'est exactement le remède que #409b
   * doit appliquer ailleurs, et il existe déjà ici. On épingle donc les deux choses ensemble : la
   * teinte à sa valeur mesurée, pour qu'elle ne se dégrade pas, et le tiret, parce que c'est LUI
   * qui fait le travail.
   */
  const FAIBLES = [
    ['sélection / recadrage d\'image', SIGNAL_SELECTION, SIGNAL_RECADRAGE, 43, ['[4, 3]', '[6, 4]']],
    ['outil Construire / aimantation', SIGNAL_CONSTRUIRE, SIGNAL_AIMANTATION, 30, ['[4, 4]', '[2, 4]']],
  ];

  FAIBLES.forEach(([nom, a, b, mesure, tirets]) => {
    test(`${nom} : la teinte ne se dégrade pas (mesurée à ${mesure})`, () => {
      const d = pireEcart3D(a, b);
      assert.ok(d >= mesure - 3,
        `${nom} : écart tombé à ${d.toFixed(0)}, il valait ${mesure} à la mesure`);
    });

    test(`${nom} : le motif de tirets les sépare vraiment`, () => {
      // La partie qui compte. Si les deux motifs devenaient identiques, la distinction ne
      // reposerait plus que sur une teinte insuffisante, sans que rien ne le signale.
      const [t1, t2] = tirets;
      assert.notEqual(t1, t2, 'les deux motifs sont identiques dans la table du test');
      [t1, t2].forEach(t => assert.ok(DRAW.includes(`setLineDash(${t})`),
        `le motif ${t} a disparu de draw.js : le second indice n'existe plus`));
    });
  });
});

describe('Mesuré, réel, et sans portée : épinglé quand même', () => {
  /**
   * ⚠️ CETTE SECTION A CHANGÉ DE SENS, ET C'EST LA PARTIE INSTRUCTIVE.
   *
   * Elle s'appelait « les deux paires INSUFFISANTES », la première était présentée comme LE défaut
   * du chantier, et une tâche #409b était ouverte pour les corriger. Les deux classements étaient
   * faux, pour deux raisons différentes.
   *
   * La vue de dessus : ce sont deux disques de 4 px dans l'aperçu des modales Pièce et Bâtiment, et
   * RIEN NULLE PART ne dit ce que les couleurs signifient. Pas de légende, pas de libellé. La
   * distinction est donc visible mais pas signifiante, même en vision normale. Interrogé sur son
   * usage, l'utilisateur ignorait l'existence de la fonctionnalité. Une collision dans un signal
   * que personne ne lit n'est pas un défaut d'accessibilité.
   *
   * Le point de rôle : 67, alors que le seuil de ce fichier est à 60. Ça PASSE. L'appeler « cas
   * limite » était de la rhétorique, pas de la mesure.
   *
   * On garde les deux tests. Ils ne dénoncent plus rien, ils VERROUILLENT : ces teintes ne doivent
   * pas se dégrader en silence, et si l'aperçu est un jour retravaillé pour ses propres raisons, la
   * question se reposera avec les chiffres sous la main.
   */
  test('vue de dessus : la teinte ne se dégrade pas (mesurée à 54)', () => {
    const normal = ecart(versRVB(SIGNAL_APERCU_PERSO), versRVB(SIGNAL_APERCU_ELEMENT));
    const pire = pireEcart3D(SIGNAL_APERCU_PERSO, SIGNAL_APERCU_ELEMENT);
    assert.ok(normal > 140, `en vision normale l'écart devrait rester large, mesuré ${normal.toFixed(0)}`);
    assert.ok(pire > 45, `l'écart s'est DÉGRADÉ : ${pire.toFixed(0)}, il valait 54 à la mesure`);
  });

  test('point avec rôle contre sans rôle : au-dessus du seuil, et ça doit le rester', () => {
    const pire = pireEcart3D(SIGNAL_POSE_ROLE, SIGNAL_POSE_SANS_ROLE);
    assert.ok(pire >= 60,
      `${pire.toFixed(0)} : cette paire passait le seuil à 67, elle est passée en dessous`);
  });
});

describe('draw.js ne décide plus des couleurs de signal', () => {
  test('RÉGRESSION : les jetons GOUVERNENT, ils ne sont pas seulement importés', () => {
    // Le défaut de forme qui est revenu quatre fois dans ce dépôt : vérifier qu'un identifiant
    // APPARAÎT plutôt qu'il ne SERT. On compte donc les emplois réels.
    const emplois = [
      [SIGNAL_SELECTION, 'SIGNAL_SELECTION', 10],
      [SIGNAL_MESURE, 'SIGNAL_MESURE', 4],
      [SIGNAL_CONSTRUIRE, 'SIGNAL_CONSTRUIRE', 6],
      [SIGNAL_APERCU_PERSO, 'SIGNAL_APERCU_PERSO', 2],
    ];
    emplois.forEach(([, nom, attendu]) => {
      const n = (DRAW.match(new RegExp(`\\b${nom}\\b`, 'g')) || []).length - 1; // -1 : l'import
      assert.equal(n, attendu, `${nom} employé ${n} fois dans draw.js, ${attendu} attendu(s)`);
    });
  });

  test('RÉGRESSION : plus aucun littéral de signal dans draw.js', () => {
    // La moitié qui manque toujours. Importer les jetons sans retirer les littéraux laisserait
    // deux sources pour la même décision, et c'est la classe de bug numéro un d'ici.
    const bannis = ['#B5482A', '#D2691E', '#C8960C', '#FFD700', '#2BA84A', '#2E7D9A',
      '#E0A53C', '#3AA0FF', '#9FC9EE', '#f4a340', '#6fbf73', 'rgba(255,120,0,0.85)'];
    const restants = bannis.filter(c => DRAW.includes(`'${c}'`));
    assert.deepEqual(restants, [], `littéraux de signal encore écrits dans draw.js : ${restants}`);
  });

  test('… mais les couleurs qui DÉPEIGNENT sont restées', () => {
    // La face opposée, et elle compte autant. Un balayage trop large aurait emporté la teinte par
    // défaut d'une haie ou d'un muret, qui n'ont rien à faire dans un thème.
    ['#6B8E23', '#7A5230', '#3A7A3A', '#A8A8A8'].forEach(c =>
      assert.ok(DRAW.includes(c), `${c} dépeint un tracé et devait rester en dur`));
  });

  test('FIXED_COLOR partage sa valeur avec SIGNAL_CONSTRUIRE, et ce n\'est pas la même chose', () => {
    // Les deux valent #3E5FA8 depuis l'origine, par accident. C'est exactement ce que l'extraction
    // sépare : le jour où un thème repeint l'outil Construire, la couleur par défaut d'un
    // Personnage ne doit pas suivre. Le test épingle l'accident pour qu'il reste visible.
    assert.equal(FIXED_COLOR, SIGNAL_CONSTRUIRE);
    assert.ok(DRAW.includes('FIXED_COLOR'), 'FIXED_COLOR doit rester employée pour ce qu\'elle dépeint');
  });
});

/**
 * JOURNAL DE MUTATION : six fautes, six rouges.
 *
 *   S1 la simulation rendue neutre (elle renvoie sa couleur d'entrée)            ROUGE
 *   S2 la simulation rendue destructrice (elle bouge aussi les gris)             ROUGE
 *   S3 SIGNAL_CONSTRUIRE_DETACHE rapproché de SIGNAL_CONSTRUIRE                  ROUGE
 *   S4 un littéral '#B5482A' remis dans draw.js à côté du jeton                  ROUGE
 *   S5 la couleur d'une haie extraite elle aussi vers un jeton                   ROUGE
 *   S6 SIGNAL_SELECTION importé mais employé une fois de moins                   ROUGE
 *
 * S1 et S2 gardent le GARDE, et ce sont les deux qui comptent le plus. Toutes les mesures de ce
 * fichier passent par la même fonction : si elle cessait de transformer, dix tests deviendraient
 * dix tautologies vertes. C'est arrivé deux fois dans ce dépôt avec d'autres instruments.
 *
 * S5 dit la chose la moins évidente du chantier : extraire TROP est aussi une faute. Une teinte de
 * haie devenue jeton entrerait dans le périmètre d'un futur thème, et un thème daltonien la
 * repeindrait, ce qui rendrait le dessin faux au lieu de le rendre lisible.
 *
 * CE QUI N'EST PAS TENU ICI : que les couleurs soient effectivement DISTINGUÉES à l'écran par un
 * daltonien. La simulation est un modèle, la distance euclidienne en sRVB est grossière, et aucun
 * calcul ne remplace un essai par quelqu'un de concerné. Ce fichier empêche une aggravation, il ne
 * prononce pas une conformité.
 */
