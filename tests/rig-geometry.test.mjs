/**
 * tests/rig-geometry.test.mjs, les rigs 3D sont-ils mesurables, et complets ?
 *
 * CE QUI REND CE FICHIER POSSIBLE : `THREE.WebGLRenderer` échoue sous Node, mais `THREE.Group`,
 * `Mesh`, `BoxGeometry` et `Box3` fonctionnent parfaitement. On ne peut pas RENDRE un rig, on peut
 * le CONSTRUIRE et le MESURER. Les quatre-vingt-dix exports de rig3d.js n'étaient pas hors de
 * portée, ils n'avaient simplement jamais été essayés.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UNE HYPOTHÈSE FAUSSE, GARDÉE ICI PARCE QU'ELLE SE REPRÉSENTERA.
 *
 * En mesurant, j'ai trouvé que 17 des 28 constructeurs produisent une boîte englobante dont la
 * hauteur s'écarte de plus de 15 % de la valeur déclarée dans OBJECT_REAL_HEIGHT_M, l'arbre de
 * −54 %, le lézard de +187 %. Cela ressemblait exactement à la classe de bug de ce dépôt : deux
 * calculs de la même grandeur qui divergent.
 *
 * Ce n'en est pas un. Le rig est NORMALISÉ à la hauteur déclarée au moment du rendu
 * (scene3d.js : `figureGroup.scale.set(s, s, s)`, la position compensant via le centre de la
 * boîte). Les unités internes d'un rig ne sont donc que des PROPORTIONS ; OBJECT_REAL_HEIGHT_M est
 * la seule autorité sur la taille à l'écran. Comparer les deux n'a aucun sens.
 *
 * Ce qu'il fallait retenir n'est pas l'écart mais la DIVISION : puisque l'échelle se calcule à
 * partir de la boîte du rig, une boîte dégénérée, hauteur nulle, NaN, Infini, donne un facteur
 * d'échelle infini ou indéfini. L'Élément disparaît, ou explose à travers la Case. C'est ce que ce
 * fichier garde.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import './helpers/dom-stub.mjs';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import * as R from '../src/rig3d.js';
import {
  OBJECT_REAL_HEIGHT_M, ANIMAL_TYPES, ANIMAL_JOINT_DEFS, OBJECT_TYPE_LABELS, OBJECT_TYPE_EMOJI,
} from '../src/constants.js';

// Le constructeur de chaque type d'Objet. Cette table est elle-même l'objet d'un test : une entrée
// manquante des deux côtés passerait inaperçue, et c'est la deuxième classe de bug récurrente de ce
// dépôt, l'énumération incomplète.
const CONSTRUCTEURS = {
  voiture: 'buildCarRig3D', velo: 'buildBikeRig3D',
  table: 'buildTableRig3D', chaise: 'buildChairRig3D', etagere: 'buildShelfRig3D',
  armoire: 'buildWardrobeRig3D', canape: 'buildSofaRig3D', bureau: 'buildDeskRig3D',
  lit: 'buildBedRig3D', escalier: 'buildStairsRig3D',
  buisson: 'buildBuissonRig3D', arbre: 'buildArbreRig3D', arbuste: 'buildArbusteRig3D',
  fleur: 'buildFleurRig3D', pot_fleur: 'buildPotFleurRig3D',
  oiseau: 'buildOiseauRig3D', lezard: 'buildLezardRig3D', loup: 'buildLoupRig3D',
  griffon: 'buildGriffonRig3D', singe: 'buildSingeRig3D',
  piscine: 'buildPiscineRig3D', barbecue: 'buildBarbecueRig3D',
  lampadaire: 'buildLampadaireRig3D', panneau_signalisation: 'buildPanneauSignalisationRig3D',
  tombe: 'buildTombeRig3D', pierre_tombale: 'buildPierreTombaleRig3D', caveau: 'buildCaveauRig3D',
  banc_eglise: 'buildBancEgliseRig3D',
};

const groupeDe = (r) => (r && r.isObject3D) ? r : (r && (r.group || r.figureGroup));
const boiteDe = (g) => new THREE.Box3().setFromObject(g);

describe('Rigs 3D : aucune boîte englobante dégénérée', () => {
  Object.entries(CONSTRUCTEURS).forEach(([type, fn]) => {
    test(`${type} : dimensions finies et non nulles`, () => {
      // L'échelle de rendu DIVISE par ces dimensions (cf. scene3d.js ~1720). Une hauteur nulle
      // donne un facteur infini : l'Élément explose à travers la Case. Un NaN le fait simplement
      // disparaître, sans erreur, le pire des deux, parce qu'on cherche ailleurs.
      const g = groupeDe(R[fn]('#8844aa'));
      assert.ok(g, `${fn} ne renvoie pas d'Object3D exploitable`);
      const b = boiteDe(g);
      const d = { l: b.max.x - b.min.x, h: b.max.y - b.min.y, p: b.max.z - b.min.z };
      Object.entries(d).forEach(([axe, v]) => {
        assert.ok(Number.isFinite(v), `${axe} n'est pas fini : ${v}`);
        assert.ok(v > 0.001, `${axe} est dégénéré : ${v}`);
        assert.ok(v < 100, `${axe} est aberrant : ${v} (unités monde)`);
      });
    });
  });

  test('le garde-fou : la table de constructeurs n\'est pas vide', () => {
    // Sans lui, vider CONSTRUCTEURS rendrait tous les tests ci-dessus verts par absence.
    assert.ok(Object.keys(CONSTRUCTEURS).length >= 25);
  });
});

describe('Rigs 3D : l\'énumération est complète des deux côtés', () => {
  test('RÉGRESSION : chaque type déclaré a AUSSI un libellé et une émoji', () => {
    // Trou trouvé par mutation en ajoutant « modele » : retirer son libellé ne faisait tomber aucun
    // test. La conséquence est cosmétique, le repli `|| 'Objet'` prend la main, et le panneau
    // latéral comme le titre de modale affichent « Objet », mais c'est la deuxième classe de bug
    // récurrente du dépôt : trois tables parallèles, et rien qui exige qu'elles s'accordent.
    //
    // Ce contrôle couvre les trente-cinq types, pas seulement le dernier ajouté.
    const types = Object.keys(OBJECT_REAL_HEIGHT_M);
    assert.deepEqual(types.filter(t => !OBJECT_TYPE_LABELS[t]), [],
      'type(s) sans libellé : ils s\'afficheraient « Objet »');
    assert.deepEqual(types.filter(t => !OBJECT_TYPE_EMOJI[t]), [],
      'type(s) sans émoji dans le panneau latéral');
  });

  test('RÉGRESSION : chaque type déclaré dans OBJECT_REAL_HEIGHT_M a un constructeur', () => {
    // L'énumération incomplète est la deuxième classe de bug récurrente du dépôt (la garde Échap
    // d'io.js, l'appariement positionnel du manuel). Ici, un type déclaré sans constructeur donne
    // un Élément ajoutable depuis le menu et invisible dans la Case.
    //
    // Les Murs sont exclus : ils ne sont pas construits par un rig fixe mais par
    // buildWallRig3D(couleur, longueur, hauteur, ouvertures), dont la géométrie dépend de
    // l'instance. Même chose pour les Parois, dont la taille vient de CHILD_DESIGN_SIZE_3D.
    // « modele » rejoint cette liste pour EXACTEMENT la même raison que les Murs : sa géométrie ne
    // vient pas d'un constructeur fixe mais de l'instance, ici du fichier .glb qu'elle porte. Ce
    // n'est pas une dérogation de complaisance ; un constructeur codé en dur pour un modèle importé
    // n'aurait aucun sens.
    const aPart = ['mur', 'mur_coin', 'fenetre_ouverte', 'porte_ouverte', 'baie_vitree', 'autel',
      'modele'];
    const sansConstructeur = Object.keys(OBJECT_REAL_HEIGHT_M)
      .filter(t => !aPart.includes(t) && !CONSTRUCTEURS[t]);
    assert.deepEqual(sansConstructeur, [],
      `type(s) déclaré(s) sans constructeur : ${sansConstructeur.join(', ')}`);
  });

  test('RÉGRESSION : chaque constructeur listé existe vraiment dans rig3d.js', () => {
    // Le sens inverse : un renommage laisserait une entrée morte dans la table, et tous les tests
    // de dimension du type concerné passeraient sur `undefined` sans rien dire.
    const absents = Object.entries(CONSTRUCTEURS)
      .filter(([, fn]) => typeof R[fn] !== 'function')
      .map(([t, fn]) => `${t} → ${fn}`);
    assert.deepEqual(absents, [], `constructeur(s) introuvable(s) : ${absents.join(', ')}`);
  });

  test('chaque type d\'Animal a une hauteur réelle déclarée', () => {
    // ANIMAL_TYPES pilote le menu ; OBJECT_REAL_HEIGHT_M pilote la taille par défaut à l'ajout.
    // Un animal absent de la seconde table retombe sur 60 % d'un Personnage, un lézard d'un
    // mètre.
    const cles = Array.isArray(ANIMAL_TYPES)
      ? ANIMAL_TYPES.map(a => (typeof a === 'string' ? a : a.key || a.type))
      : Object.keys(ANIMAL_TYPES);
    const sansHauteur = cles.filter(k => k && OBJECT_REAL_HEIGHT_M[k] === undefined);
    assert.deepEqual(sansHauteur, [],
      `Animal(aux) sans hauteur réelle déclarée : ${sansHauteur.join(', ')}`);
  });
});

describe('Rigs 3D : reproductibilité', () => {
  test('deux constructions du même type donnent la même géométrie', () => {
    // Un rig qui varie d'un appel à l'autre (aléatoire non semé dans le feuillage, par exemple)
    // rendrait le cache de Case inutile : la signature serait stable mais l'image changerait,
    // et le défaut serait attribué au cache.
    Object.entries(CONSTRUCTEURS).forEach(([type, fn]) => {
      const mesure = () => {
        const b = boiteDe(groupeDe(R[fn]('#8844aa')));
        return [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z].map(v => v.toFixed(4)).join(',');
      };
      assert.equal(mesure(), mesure(), `${type} : géométrie non reproductible`);
    });
  });

  test('la couleur demandée n\'altère pas la géométrie', () => {
    // Séparation des responsabilités : la couleur est un matériau, pas une dimension. Le vérifier
    // empêche qu'un constructeur se mette à dériver une taille d'une teinte.
    const dims = (couleur) => {
      const b = boiteDe(groupeDe(R.buildCarRig3D(couleur)));
      return `${(b.max.x - b.min.x).toFixed(4)}/${(b.max.y - b.min.y).toFixed(4)}`;
    };
    assert.equal(dims('#ff0000'), dims('#00ff00'));
  });
});

describe('Animaux : chaque articulation DÉCLARÉE existe dans la géométrie', () => {
  // TROU TROUVÉ PAR MUTATION (#367). Retirer les deux lignes qui déclarent les pivots de patte de
  // l'oiseau, ou détacher le genou de la hanche, ne faisait échouer AUCUN test : `ANIMAL_JOINT_DEFS`
  // et les constructeurs de rig étaient deux descriptions du même objet, sans rien pour les tenir
  // d'accord. C'est la classe de bug numéro un de ce dépôt.
  //
  // Le symptôme aurait été silencieux et déroutant : un curseur affiché dans la fiche, qui ne fait
  // rien du tout parce que le pivot correspondant n'existe pas dans la scène.

  ANIMAL_TYPES.forEach(type => {
    test(`${type} : les pivots répondent aux identifiants déclarés`, () => {
      const { joints } = R[CONSTRUCTEURS[type]](0x888888);
      const declares = (ANIMAL_JOINT_DEFS[type] || []).flatMap(g => g.joints.map(j => j.id));
      const manquants = declares.filter(id => !joints[id]);
      assert.deepEqual(manquants, [], `${type} : curseurs sans pivot, ils ne feraient rien`);
      // Et l'inverse : un pivot construit mais jamais déclaré est une articulation inatteignable.
      const orphelins = Object.keys(joints).filter(id => !declares.includes(id));
      assert.deepEqual(orphelins, [], `${type} : pivots sans curseur, personne ne peut les bouger`);
    });
  });

  test('oiseau : le genou est ENFANT de la hanche, pas son voisin', () => {
    // Sans cette hiérarchie, plier la hanche laisse le tarse en place et la patte se disloque.
    // Détacher le genou ne changeait rien aux tests ci-dessus, qui ne regardent que les clés.
    //
    // ⚠️ ON COMPARE DES `uuid`, PAS LES OBJETS. Comparer deux `Object3D` qui DIFFÈRENT fait
    // construire à node un diff de deux graphes Three circulaires : le processus meurt en SIGKILL,
    // faute de mémoire, sans jamais dire ce qui n'allait pas. Éprouvé pour de vrai, ce test ayant
    // attrapé une mutation restée par accident dans le dépôt et n'ayant su le dire qu'en mourant.
    const { joints } = R.buildOiseauRig3D(0x888888);
    assert.equal(joints.kneeFL.parent && joints.kneeFL.parent.uuid, joints.hipFL.uuid);
    assert.equal(joints.kneeFR.parent && joints.kneeFR.parent.uuid, joints.hipFR.uuid);
  });

  test('oiseau : les pattes touchent le sol, comme avant leur articulation', () => {
    // Elles étaient deux cylindres statiques allant de y = 0 à y = 0,12. Articulées, elles vont de
    // la hanche (0,13) au bout du tarse (0,13 − 0,065 − 0,065 = 0). Un Projet d'avant rend donc
    // pareil tant qu'aucun angle n'est réglé, ce qui est la contrainte de cette tâche.
    const { joints } = R.buildOiseauRig3D(0x888888);
    const bout = new THREE.Vector3();
    joints.kneeFL.updateMatrixWorld(true);
    joints.kneeFL.getWorldPosition(bout);
    assert.ok(Math.abs(bout.y - 0.065) < 1e-6, `le genou est à mi-patte, mesuré ${bout.y}`);
  });
});
