/**
 * tests/make-skeleton-fixture.test.mjs, l'extracteur de fixtures de squelette.
 *
 * POURQUOI TESTER UN OUTIL QUI N'ENTRE DANS AUCUN GATE. `tools/make-skeleton-fixture.mjs` fabrique
 * les quinze instantanés dont TOUTE la suite créatures se sert comme référence. Une erreur dedans
 * ne casse rien : elle produit des fixtures fausses, sur lesquelles les tests passeront très bien.
 * C'est le pire mode de défaillance possible, un filet qui ment.
 *
 * LE MORCEAU RISQUÉ EST L'ACCUMULATION DES MATRICES. Une position de repos en monde s'obtient en
 * composant les transformations de tous les parents. glTF les donne au choix en TRS (translation,
 * quaternion, échelle) ou en matrice, et l'ordre de multiplication est la faute classique. Les cas
 * ci-dessous sont calculables de tête, ce qui est le seul moyen d'être sûr du résultat attendu.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { osDuGlb } from '../tools/make-skeleton-fixture.mjs';

/** Un glTF minimal : une chaîne de nœuds, tous déclarés comme os d'un même `skin`. */
const gltf = (nodes) => ({ nodes, skins: [{ joints: nodes.map((_, i) => i) }] });
const proche = (a, b, msg) => a.forEach((v, k) =>
  assert.ok(Math.abs(v - b[k]) < 1e-6, `${msg} : ${a} attendu ${b}`));

describe('osDuGlb : la position de repos en monde', () => {
  test('les translations s\'accumulent le long de la chaîne', () => {
    const os = osDuGlb(gltf([
      { name: 'racine', translation: [1, 0, 0], children: [1] },
      { name: 'milieu', translation: [0, 2, 0], children: [2] },
      { name: 'bout', translation: [0, 0, 3] },
    ]));
    proche(os[0].t, [1, 0, 0], 'racine');
    proche(os[1].t, [1, 2, 0], 'milieu');
    proche(os[2].t, [1, 2, 3], 'bout');
  });

  test('la ROTATION du parent oriente la translation de l\'enfant', () => {
    // C'est le test qui distingue une composition juste d'une simple addition. Le parent tourne de
    // 90° autour de Z ; l'enfant avance de 1 sur SON axe X, ce qui le place en (0, 1, 0) en monde.
    // Une implémentation qui additionnerait les translations le placerait en (1, 0, 0).
    const c = Math.SQRT1_2;
    const os = osDuGlb(gltf([
      { name: 'racine', rotation: [0, 0, c, c], children: [1] },
      { name: 'enfant', translation: [1, 0, 0] },
    ]));
    proche(os[0].t, [0, 0, 0], 'racine');
    proche(os[1].t, [0, 1, 0], 'enfant tourné');
  });

  test('l\'ÉCHELLE du parent multiplie la translation de l\'enfant', () => {
    const os = osDuGlb(gltf([
      { name: 'racine', scale: [2, 2, 2], children: [1] },
      { name: 'enfant', translation: [3, 0, 0] },
    ]));
    proche(os[1].t, [6, 0, 0], 'enfant mis à l\'échelle');
  });

  test('un nœud donné en MATRICE est traité comme un nœud donné en TRS', () => {
    // glTF autorise les deux formes, et un exportateur peut mélanger. Ignorer `matrix` rendrait
    // une position de zéro, silencieusement : le nœud paraîtrait à l'origine.
    const enTRS = osDuGlb(gltf([
      { name: 'r', translation: [5, 6, 7], children: [1] }, { name: 'e', translation: [1, 1, 1] },
    ]));
    const enMatrice = osDuGlb(gltf([
      { name: 'r', matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, 6, 7, 1], children: [1] },
      { name: 'e', translation: [1, 1, 1] },
    ]));
    assert.deepEqual(enMatrice.map(o => o.t), enTRS.map(o => o.t));
  });
});

describe('osDuGlb : ce qu\'il retient, et ce qu\'il refuse', () => {
  test('un fichier SANS `skin` ne contient aucun squelette', () => {
    // Trois des modèles fournis sont dans ce cas (`bison`, `gecko`, `bed_bug`). Rendre une liste
    // vide plutôt que `null` produirait une fixture vide, donc un test vert sur rien.
    assert.equal(osDuGlb({ nodes: [{ name: 'maillage' }] }), null);
    assert.equal(osDuGlb({ nodes: [{ name: 'x' }], skins: [{ joints: [] }] }), null);
  });

  test('seuls les nœuds cités par le `skin` sont retenus, enfants compris', () => {
    // Un os peut avoir pour enfant un nœud de maillage ou un accessoire qui n'est PAS un os. Le
    // garder dans `children` ferait croire à une branche de squelette là où il n'y en a pas.
    const os = osDuGlb({
      nodes: [
        { name: 'os', translation: [0, 0, 0], children: [1, 2] },
        { name: 'osFils', translation: [0, 1, 0] },
        { name: 'maillage', translation: [0, 0, 1] },
      ],
      skins: [{ joints: [0, 1] }],
    });
    assert.deepEqual(os.map(o => o.name), ['os', 'osFils']);
    assert.deepEqual(os[0].children, [1], 'le maillage ne doit pas passer pour un os');
  });

  test('un os sans nom reçoit son indice, jamais une chaîne vide', () => {
    // Un nom vide casserait `coteDuNom` et la lecture de la fixture sans rien signaler.
    const os = osDuGlb(gltf([{ translation: [0, 0, 0] }]));
    assert.equal(os[0].name, '0');
  });

  test('la précision est RELATIVE, pas décimale', () => {
    // `toPrecision(6)` et non `toFixed(4)` : les échelles vont du centième au millier selon
    // l'exportateur. Un arrondi décimal écraserait à zéro tout un rig modélisé en petites unités,
    // et la fixture décrirait un squelette effondré sur un point.
    const os = osDuGlb(gltf([{ name: 'minuscule', translation: [0.000123456789, 0, 0] }]));
    assert.equal(os[0].t[0], 0.000123457);
    assert.ok(os[0].t[0] !== 0, 'la petite valeur ne doit pas être écrasée');
  });
});
