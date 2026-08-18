/**
 * tests/stray-meshes.test.mjs — les maillages qui ne sont pas là où est le corps.
 *
 * CE QUI SE JOUE ICI. Le critère n'a pas de seuil : un maillage est égaré s'il ne touche AUCUN
 * autre. Ce fichier vérifie les deux moitiés de cette phrase — qu'un maillage éloigné est vu, et
 * surtout qu'un accessoire normalement collé au corps ne l'est PAS. La seconde moitié est la plus
 * importante : une détection trop large masquerait des morceaux légitimes du modèle de quelqu'un.
 *
 * LA MESURE QUI FONDE TOUT ÇA est dans l'en-tête de src/stray-meshes-3d.js : sur worker_j.glb, le
 * fourreau du katana occupe y 91→131 quand le personnage entier tient dans y −0,3→41,8.
 *
 * CE QU'ON N'AFFIRME PAS ICI : que le critère est juste sur un vrai .glb. Ça a été établi par
 * lecture directe des six fichiers du dépôt (résultat consigné dans l'en-tête du module) ; ces
 * fichiers pèsent 22 Mo et n'ont rien à faire dans le dépôt.
 */
import './helpers/dom-stub.mjs';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
  maillagesHorsCorps3D, boitesDesMaillages3D, maillagesParNom3D, appliquerVisibiliteEgares3D,
} from '../src/stray-meshes-3d.js';

/** Un maillage rigide de 1 × 1 × 1 centré sur `centre`. */
function cube(nom, centre){
  const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  m.name = nom;
  m.position.set(centre[0], centre[1], centre[2]);
  return m;
}

function scene(...maillages){
  const g = new THREE.Group();
  maillages.forEach(m => g.add(m));
  g.updateMatrixWorld(true);
  return g;
}

describe('maillagesHorsCorps3D — le critère sans seuil', () => {
  test('un maillage très loin des autres est signalé', () => {
    // La reproduction de worker_j : trois morceaux de corps groupés, un accessoire à 100 unités.
    const s = scene(cube('torse', [0, 1, 0]), cube('tete', [0, 2, 0]), cube('jambes', [0, 0, 0]),
      cube('fourreau', [0, 100, 0]));
    assert.deepEqual(maillagesHorsCorps3D(s), ['fourreau']);
  });

  test('un accessoire collé au corps n\'est PAS signalé', () => {
    // LE témoin qui compte. Une épée à la ceinture touche le corps ; la masquer serait mutiler le
    // modèle. Sans ce test, une détection qui signale tout sauf le plus gros passerait le précédent.
    const s = scene(cube('torse', [0, 1, 0]), cube('tete', [0, 2, 0]), cube('epee', [0.6, 1, 0]));
    assert.deepEqual(maillagesHorsCorps3D(s), []);
  });

  test('un accessoire qui touche à peine reste dans le corps', () => {
    // La frontière exacte du critère : les boîtes se touchent sans se chevaucher. « Ne touche rien »
    // veut dire rien du tout — c'est ce qui rend le critère lisible et non réglable.
    const s = scene(cube('torse', [0, 1, 0]), cube('tete', [0, 2, 0]), cube('cape', [1, 1, 0]));
    assert.deepEqual(maillagesHorsCorps3D(s), []);
  });

  test('deux maillages égarés sont tous les deux nommés', () => {
    const s = scene(cube('torse', [0, 1, 0]), cube('tete', [0, 2, 0]),
      cube('fourreau', [0, 100, 0]), cube('lance', [0, -100, 0]));
    assert.deepEqual(maillagesHorsCorps3D(s).sort(), ['fourreau', 'lance']);
  });

  test('un seul maillage : jamais signalé', () => {
    // « Loin des autres » n'a pas de sens sans autres — et un modèle d'un seul tenant est le cas
    // le plus courant (deux des six fichiers réels du dépôt).
    assert.deepEqual(maillagesHorsCorps3D(scene(cube('tout', [0, 0, 0]))), []);
    assert.deepEqual(maillagesHorsCorps3D(scene()), []);
    assert.deepEqual(maillagesHorsCorps3D(null), []);
  });

  test('DEUX maillages éloignés l\'un de l\'autre se signalent mutuellement', () => {
    // Cas limite assumé : sans corps majoritaire, « le corps » n'est pas défini. On le consigne
    // plutôt que de le corriger par une règle de majorité, qui demanderait un seuil.
    const s = scene(cube('a', [0, 0, 0]), cube('b', [0, 100, 0]));
    assert.deepEqual(maillagesHorsCorps3D(s).sort(), ['a', 'b']);
  });

  test('un maillage sans nom reste désignable', () => {
    const anonyme = cube('', [0, 100, 0]);
    const s = scene(cube('torse', [0, 1, 0]), cube('tete', [0, 2, 0]), anonyme);
    assert.deepEqual(maillagesHorsCorps3D(s), ['(sans nom)']);
  });

  test('la boîte est mesurée en MONDE, pas en local', () => {
    // Un maillage à l'origine de son parent, mais dont le parent est loin, est loin. Sans passage
    // en monde, il paraîtrait au centre du corps.
    const branche = new THREE.Group();
    branche.position.set(0, 100, 0);
    branche.add(cube('fourreau', [0, 0, 0]));
    const s = scene(cube('torse', [0, 1, 0]), cube('tete', [0, 2, 0]));
    s.add(branche);
    s.updateMatrixWorld(true);
    assert.deepEqual(maillagesHorsCorps3D(s), ['fourreau']);
  });
});

describe('maillagesParNom3D — retrouver les égarés dans un clone', () => {
  test('rend exactement les maillages nommés, et rien d\'autre', () => {
    const s = scene(cube('torse', [0, 1, 0]), cube('fourreau', [0, 100, 0]), cube('lance', [0, 5, 0]));
    assert.deepEqual(maillagesParNom3D(s, ['fourreau']).map(m => m.name), ['fourreau']);
    assert.deepEqual(maillagesParNom3D(s, ['fourreau', 'lance']).map(m => m.name).sort(),
      ['fourreau', 'lance']);
  });

  test('la casse compte : les noms viennent du fichier, on ne les interprète pas', () => {
    // Deux maillages qui ne diffèrent que par la casse existent dans des fichiers réels. Rapprocher
    // « Fourreau » et « fourreau » masquerait le mauvais.
    const s = scene(cube('Fourreau', [0, 1, 0]), cube('fourreau', [0, 100, 0]));
    assert.deepEqual(maillagesParNom3D(s, ['fourreau']).map(m => m.name), ['fourreau']);
  });

  test('une liste vide ou absente ne désigne rien', () => {
    const s = scene(cube('torse', [0, 1, 0]), cube('fourreau', [0, 100, 0]));
    assert.deepEqual(maillagesParNom3D(s, []), []);
    assert.deepEqual(maillagesParNom3D(s, null), []);
    assert.deepEqual(maillagesParNom3D(null, ['fourreau']), []);
  });

  test('un maillage sans nom se retrouve par son nom de repli', () => {
    // Le même repli que dans boitesDesMaillages3D — sinon la détection nommerait « (sans nom) » et
    // le masquage ne retrouverait jamais personne.
    const s = scene(cube('torse', [0, 1, 0]), cube('', [0, 100, 0]));
    assert.equal(maillagesParNom3D(s, ['(sans nom)']).length, 1);
  });
});

describe('appliquerVisibiliteEgares3D', () => {
  test('masque par défaut, montre quand on le demande', () => {
    const a = cube('a', [0, 0, 0]), b = cube('b', [0, 0, 0]);
    appliquerVisibiliteEgares3D([a, b], false);
    assert.equal(a.visible, false); assert.equal(b.visible, false);
    appliquerVisibiliteEgares3D([a, b], true);
    assert.equal(a.visible, true); assert.equal(b.visible, true);
  });

  test('`undefined` vaut masqué — c\'est l\'état d\'un Élément qui n\'a jamais coché la case', () => {
    const a = cube('a', [0, 0, 0]);
    appliquerVisibiliteEgares3D([a], undefined);
    assert.equal(a.visible, false);
  });

  test('une liste absente ne lève pas', () => {
    assert.doesNotThrow(() => appliquerVisibiliteEgares3D(null, true));
    assert.doesNotThrow(() => appliquerVisibiliteEgares3D([null], true));
  });
});

describe('boitesDesMaillages3D', () => {
  test('une boîte par maillage, et rien pour les autres nœuds', () => {
    const s = scene(cube('a', [0, 0, 0]), cube('b', [0, 1, 0]));
    s.add(new THREE.Bone());
    s.add(new THREE.Group());
    s.updateMatrixWorld(true);
    assert.deepEqual(boitesDesMaillages3D(s).map(b => b.nom), ['a', 'b']);
  });

  test('un maillage sans géométrie exploitable est écarté, pas signalé', () => {
    // Une boîte vide ne recoupe rien : sans cette garde, tout maillage vide serait déclaré égaré.
    const vide = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
    vide.name = 'vide';
    const s = scene(cube('torse', [0, 1, 0]), cube('tete', [0, 2, 0]), vide);
    assert.deepEqual(boitesDesMaillages3D(s).map(b => b.nom), ['torse', 'tete']);
    assert.deepEqual(maillagesHorsCorps3D(s), []);
  });
});
