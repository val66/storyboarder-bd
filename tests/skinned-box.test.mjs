/**
 * tests/skinned-box.test.mjs — la boîte d'un modèle articulé dont le FICHIER mélange deux échelles.
 *
 * POURQUOI CE FICHIER EXISTE. Signalé à l'usage : `worker_j.glb` n'affiche que ses points
 * d'articulation, ni dans sa fiche ni dans l'éditeur. Quatre hypothèses ont été réfutées par la
 * mesure avant d'arriver ici. Ce que deux sondes ont fini par établir, sur les fichiers réels :
 *
 *                       échelle du groupe   échelle de chaque maillage   tête (os)
 *   hulk_-_sm_bnd.glb          1                      1                  y = 2,15
 *   worker_j.glb               1                    0,1297               y = 33,0
 *
 * worker_j mélange DEUX ÉCHELLES : ses maillages en portent une, ses os non. C'est la seule
 * différence structurelle entre le fichier qui s'affiche et celui qui ne s'affiche pas.
 *
 * Second fait mesuré : la MÊME fonction rend des tailles de l'ordre de 33 au rendu et de 9,4 au
 * décodage, pour les mêmes maillages. Or c'est la mesure du décodage qui devient `realHeightFloor`,
 * et celle du rendu qui cadre la caméra. Deux réponses pour une seule question — le défaut qui
 * revient le plus souvent dans ce dépôt.
 *
 * Ce fichier reproduit la structure en cause SANS aucun `.glb` : deux os, un maillage lié, et une
 * échelle portée par le maillage seul.
 */
import './helpers/dom-stub.mjs';
import { test, describe } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { box3FromObjectSkinAware3D } from '../src/skinned-box-3d.js';
import { boiteDesOsMappes3D, frameCameraToBox } from '../src/rig3d.js';
import { hauteurNaturelleModele3D, ratioLargeurModele3D } from '../src/model-cache.js';
import { boiteDeCadrageModele3D } from '../src/scene3d.js';

const ECHELLE = 0.1297;   // celle mesurée sur worker_j.glb
const HAUTEUR_OS = 33;    // la tête y est à y = 33,006

/**
 * Un maillage articulé minimal : deux os alignés sur Y, deux sommets liés chacun à un os.
 * `echelleMaillage` s'applique au MAILLAGE seul — les os restent à 1, comme dans worker_j.
 */
function figureArticulee(echelleMaillage){
  const racine = new THREE.Group();

  const osRacine = new THREE.Bone();
  const osTete = new THREE.Bone();
  osTete.position.y = HAUTEUR_OS;
  osRacine.add(osTete);
  racine.add(osRacine);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, HAUTEUR_OS, 0], 3));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([0, 0, 0, 0, 1, 0, 0, 0], 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0], 4));

  const maillage = new THREE.SkinnedMesh(geo, new THREE.MeshBasicMaterial());
  maillage.scale.setScalar(echelleMaillage);
  racine.add(maillage);
  racine.updateMatrixWorld(true);
  maillage.bind(new THREE.Skeleton([osRacine, osTete]));
  racine.updateMatrixWorld(true);
  return racine;
}

/** La boîte des os en monde — la référence : c'est là qu'est le corps. */
function boiteDesOs(racine){
  const b = new THREE.Box3();
  const p = new THREE.Vector3();
  racine.traverse(n => { if (n.isBone) { n.getWorldPosition(p); b.expandByPoint(p.clone()); } });
  return b;
}

describe('box3FromObjectSkinAware3D face à un fichier à deux échelles', () => {
  test('témoin : à échelle unique, la boîte suit les os', () => {
    // Sans ce témoin, l'échec du test suivant ne prouverait rien : il pourrait venir de la façon
    // dont ce fichier fabrique un SkinnedMesh, et non de la double échelle.
    const racine = figureArticulee(1);
    const boite = box3FromObjectSkinAware3D(racine);
    const os = boiteDesOs(racine);
    const t = new THREE.Vector3(); boite.getSize(t);
    const tOs = new THREE.Vector3(); os.getSize(tOs);
    assert.ok(Math.abs(t.y - tOs.y) < 1e-3,
      `boîte ${t.y} contre os ${tOs.y} — le montage du test est déjà faux`);
  });

  test('LA CORRECTION : le cadrage suit les OS malgré la double échelle', () => {
    // worker_j.glb. La boîte du maillage et celle des os diffèrent ici d'un facteur 0,1297 — le
    // garde-fou en fin de test le vérifie. Ce qui compte, c'est que le CADRAGE ne s'appuie plus sur
    // la première : `boiteDesOsMappes3D` rend la boîte des os, donc celle du corps réellement pointé
    // par les poignées d'articulation. Une seule origine pour les deux, donc plus de divergence.
    const racine = figureArticulee(ECHELLE);
    const osMappes = {};
    let i = 0;
    racine.traverse(n => { if (n.isBone) osMappes['os' + (i++)] = { os: n }; });

    const boite = boiteDesOsMappes3D(osMappes);
    assert.ok(boite, 'deux os suffisent à définir une boîte');
    const t = new THREE.Vector3(); boite.getSize(t);
    const tOs = new THREE.Vector3(); boiteDesOs(racine).getSize(tOs);
    assert.ok(Math.abs(t.y - tOs.y) < 1e-6,
      `cadrage ${t.y.toFixed(3)} contre os ${tOs.y.toFixed(3)} : le cadrage ne suit pas le corps`);

    // Et le garde-fou : sans lui, l'assertion précédente serait vraie même si les deux boîtes
    // coïncidaient déjà — le test ne prouverait alors rien sur le cas à double échelle.
    const tMaillage = new THREE.Vector3();
    box3FromObjectSkinAware3D(racine).getSize(tMaillage);
    assert.ok(Math.abs(tMaillage.y - tOs.y) > 1,
      'les deux repères coïncident : ce fichier ne reproduit plus la double échelle');
  });

  test('moins de deux os : aucune boîte, l\'appelant se replie sur le maillage', () => {
    // Une chaise importée, ou un squelette non reconnu. Une boîte réduite à un point ne cadre rien ;
    // rendre `null` laisse l'appelant choisir l'autre chemin plutôt que de cadrer sur du vide.
    assert.equal(boiteDesOsMappes3D({}), null);
    assert.equal(boiteDesOsMappes3D(null), null);
    assert.equal(boiteDesOsMappes3D({ tete: { os: new THREE.Bone() } }), null, 'un seul os ne suffit pas');
    assert.equal(boiteDesOsMappes3D({ tete: {}, bras_g: {} }), null, 'des entrées sans os ne comptent pas');
  });

});

describe('boiteDeCadrageModele3D — LA décision, écrite une fois pour les trois cadrages', () => {
  test('squelette reconnu : on cadre sur les OS', () => {
    // C'est ici que la correction vit. Le test précédent vérifie que la boîte des os décrit le
    // corps ; celui-ci vérifie que le cadrage la CHOISIT — sans quoi on pourrait revenir à la boîte
    // du maillage sans que rien ne bronche.
    const racine = figureArticulee(ECHELLE);
    const skeletonBones = {};
    let i = 0;
    racine.traverse(n => { if (n.isBone) skeletonBones['os' + (i++)] = { os: n }; });

    const t = new THREE.Vector3();
    boiteDeCadrageModele3D({ figureGroup: racine, skeletonBones }).getSize(t);
    const tOs = new THREE.Vector3(); boiteDesOs(racine).getSize(tOs);
    assert.ok(Math.abs(t.y - tOs.y) < 1e-6,
      `le cadrage rend ${t.y.toFixed(3)}, les os ${tOs.y.toFixed(3)} — il est reparti sur le maillage`);
  });

  test('aucun squelette reconnu : repli sur le maillage', () => {
    // Une chaise importée. Les deux chemins ne se recouvrent jamais : un modèle a un squelette
    // reconnu, ou il n'en a pas.
    const racine = figureArticulee(ECHELLE);
    const t = new THREE.Vector3();
    boiteDeCadrageModele3D({ figureGroup: racine, skeletonBones: {} }).getSize(t);
    const tMaillage = new THREE.Vector3();
    box3FromObjectSkinAware3D(racine).getSize(tMaillage);
    assert.ok(Math.abs(t.y - tMaillage.y) < 1e-9, 'le repli doit rendre la boîte du maillage');
  });
});

describe('Un modèle importé n\'est pas éliminé par le tronc de vue', () => {
  test('RÉGRESSION : ses maillages portent frustumCulled = false', () => {
    // Three teste la SPHÈRE ENGLOBANTE calculée sur la géométrie de LIAISON, qui pour un maillage
    // articulé ne décrit pas ce qui est affiché — même racine que la boîte englobante, et écart
    // mesuré à 7,7 sur worker_j.glb. Symptôme : en dézoomant, les morceaux disparaissent un à un.
    //
    // Test de FORME sur le source, et c'est assumé : l'élimination se décide dans le rendu WebGL,
    // hors de portée sous Node. Ce qui est épinglé, c'est que la désactivation vise les maillages
    // d'un modèle IMPORTÉ — la restreindre est aussi important que la faire, le reste du décor
    // ayant tout intérêt à rester éliminé.
    const src = readFileSync(new URL('../src/rig3d.js', import.meta.url), 'utf8');
    const sansCommentaires = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    const bloc = sansCommentaires.slice(sansCommentaires.indexOf('function buildImportedModelRig3D'));
    assert.match(bloc.slice(0, 800), /isMesh\s*\)\s*n\.frustumCulled\s*=\s*false/,
      'les maillages d\'un modèle importé doivent échapper à l\'élimination');
    assert.equal((sansCommentaires.match(/frustumCulled/g) || []).length, 1,
      'la désactivation doit rester limitée aux modèles importés');
  });
});

describe('Les plans de coupe de la caméra suivent la boîte cadrée', () => {
  const cameraFactice = () => ({
    fov: 36, aspect: 1.4, near: 0.05, far: 2000,
    position: { set(){} }, lookAt(){}, updateProjectionMatrix(){},
  });

  test('RÉGRESSION : un objet lointain n\'est plus tranché par le plan far', () => {
    // Les plans valaient 0,05 et 2000 une fois pour toutes — taillés pour le Personnage intégré,
    // haut d'environ deux unités. Les os de worker_j.glb s'étendent sur près de quarante, et
    // l'éditeur ne les normalise pas : dézoomer éloignait la caméra jusqu'à faire passer des
    // morceaux derrière le plan lointain, qui les TRANCHAIT net.
    const cam = cameraFactice();
    const grande = new THREE.Box3(new THREE.Vector3(-17, 0, -17), new THREE.Vector3(17, 40, 17));
    frameCameraToBox(cam, grande, 0.25);   // zoom minimal de l'éditeur : la caméra recule d'autant
    const rayon = grande.getSize(new THREE.Vector3()).length();
    assert.ok(cam.far > rayon, `far ${cam.far.toFixed(1)} ne couvre même pas la diagonale ${rayon.toFixed(1)}`);
    assert.ok(cam.near > 0, 'un plan proche nul ruinerait la précision de profondeur');
    assert.ok(cam.near < cam.far / 100, 'l\'écart proche/lointain doit rester exploitable');
  });

  test('une petite figure garde des plans serrés', () => {
    // Le pendant : élargir sans mesure ferait perdre en précision de profondeur sur le cas courant.
    const cam = cameraFactice();
    frameCameraToBox(cam, new THREE.Box3(new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 2, 0.5)), 1);
    assert.ok(cam.far < 100, `far ${cam.far.toFixed(1)} : inutilement large pour une figure de 2 unités`);
  });
});

describe('La taille naturelle d\'un modèle : le CORPS, pas la boîte du fichier', () => {
  // Un humanoïde reconnaissable, monté selon une verticale AU CHOIX. C'est le cœur du test : la
  // mesure ne doit dépendre d'aucun axe supposé.
  function humanoide({ vertical = 'y', accessoire = false } = {}) {
    const os = (nom, le, lat) => {
      const b = new THREE.Bone();
      b.name = 'mixamorig:' + nom;
      // `le` = le long du corps, `lat` = latéral. On place selon la verticale demandée.
      if (vertical === 'y') b.position.set(lat, le, 0);
      else b.position.set(lat, 0, le);
      return b;
    };
    const hips = os('Hips', 0, 0), spine = os('Spine', 0.4, 0), spine1 = os('Spine1', 0.3, 0);
    const neck = os('Neck', 0.3, 0), head = os('Head', 0.3, 0);
    hips.add(spine); spine.add(spine1); spine1.add(neck); neck.add(head);
    [['Left', 1], ['Right', -1]].forEach(([c, s]) => {
      const clav = os(c + 'Shoulder', 0.2, s * 0.1), bras = os(c + 'Arm', 0, s * 0.2);
      const avant = os(c + 'ForeArm', 0, s * 0.3), main = os(c + 'Hand', 0, s * 0.25);
      spine1.add(clav); clav.add(bras); bras.add(avant); avant.add(main);
      const cuisse = os(c + 'UpLeg', -0.1, s * 0.1), jambe = os(c + 'Leg', -0.45, 0);
      hips.add(cuisse); cuisse.add(jambe); jambe.add(os(c + 'Foot', -0.45, 0));
    });
    scene = new THREE.Group();
    scene.add(hips);
    if (accessoire) {
      // Un katana : loin du corps, et bien plus grand que lui.
      const lame = new THREE.Mesh(new THREE.BoxGeometry(0.1, 8, 0.1), new THREE.MeshBasicMaterial());
      lame.position.set(0, 0, -40);
      scene.add(lame);
    }
    scene.updateMatrixWorld(true);
    return scene;
  }
  let scene;

  test('la verticale est DÉRIVÉE : +Y et +Z donnent la même taille', () => {
    // Deux des six fichiers mesurés ont +Z pour verticale. L'ancienne mesure prenait l'extension en
    // Y de la boîte, avant remise debout de la scène : hulk sortait à 0,845 m — son épaisseur.
    const enY = hauteurNaturelleModele3D(humanoide({ vertical: 'y' }));
    const enZ = hauteurNaturelleModele3D(humanoide({ vertical: 'z' }));
    assert.ok(Math.abs(enY - enZ) < 1e-6,
      `+Y donne ${enY.toFixed(3)} et +Z ${enZ.toFixed(3)} : la verticale est encore supposée`);
    assert.ok(enY > 1.5 && enY < 2.5, `taille ${enY.toFixed(3)} : ce corps mesure environ 2 unités`);
  });

  test('un accessoire posé à côté ne compte pas dans la taille', () => {
    // worker_j.glb sortait à 9,433 m à cause de son katana, dont la boîte est centrée très loin.
    // Ce n'est pas le corps : la taille se mesure sur les os.
    const sans = hauteurNaturelleModele3D(humanoide());
    const avec = hauteurNaturelleModele3D(humanoide({ accessoire: true }));
    assert.ok(Math.abs(sans - avec) < 1e-6,
      `${sans.toFixed(3)} sans accessoire, ${avec.toFixed(3)} avec : la boîte du fichier compte encore`);
  });

  test('sans squelette reconnu : repli sur la boîte, comme avant', () => {
    // Une chaise importée. Les deux chemins ne se recouvrent jamais.
    const chaise = new THREE.Group();
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.5), new THREE.MeshBasicMaterial());
    m.position.y = 0.45;
    chaise.add(m);
    chaise.updateMatrixWorld(true);
    assert.ok(Math.abs(hauteurNaturelleModele3D(chaise) - 0.9) < 1e-6);
  });
});

describe('ratioLargeurModele3D — l\'empreinte 2D suit la silhouette', () => {
  // L'empreinte 2D d'un modèle importé était FORCÉE CARRÉE, sur un commentaire devenu faux
  // (« 1:1 tant qu'on n'a pas lu le fichier » — il EST lu). Un Personnage reçoit w = h / 1.6.
  // Mesuré sur les fichiers réels : worker_j 0,86, anime_girl1 0,49, Personnage 0,63.
  const pave = (lx, ly) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(lx, ly, 1), new THREE.MeshBasicMaterial());
    const g = new THREE.Group();
    g.add(m);
    g.updateMatrixWorld(true);
    return g;
  };

  test('une silhouette debout donne un rapport inférieur à 1', () => {
    assert.ok(Math.abs(ratioLargeurModele3D(pave(1, 2)) - 0.5) < 1e-6);
  });

  test('bras écartés : le rapport s\'approche de 1, et peut le dépasser', () => {
    // worker_j est en T-pose : sa boîte fait 8,14 de large pour 9,43 de haut. Rien n'interdit de
    // dépasser 1 — un modèle couché le ferait.
    assert.ok(Math.abs(ratioLargeurModele3D(pave(3, 1)) - 3) < 1e-6);
  });

  test('une scène illisible ou plate rend 1, jamais NaN ni l\'infini', () => {
    // 1 n'est pas un repli paresseux : sans fichier lisible, l'Élément s'affiche en boîte de
    // remplacement, qui est un CUBE. Carré est alors la bonne réponse.
    assert.equal(ratioLargeurModele3D(null), 1);
    assert.equal(ratioLargeurModele3D(new THREE.Group()), 1, 'une scène vide n\'a pas de silhouette');
    assert.equal(ratioLargeurModele3D(pave(1, 0)), 1, 'une hauteur nulle diviserait par zéro');
  });

  test('le rapport ne dépend PAS de la taille absolue du modèle', () => {
    // C'est ce qui permet de l'appliquer à une hauteur déjà décidée ailleurs (realHeightFloor).
    assert.ok(Math.abs(ratioLargeurModele3D(pave(1, 2)) - ratioLargeurModele3D(pave(50, 100))) < 1e-6);
  });
});

describe('ratioLargeurModele3D — un modèle dont la verticale est +Z', () => {
  // LE DÉFAUT GARDÉ ICI, signalé à l'usage sur `hulk` : une boîte de sélection PLUS LARGE QUE HAUTE
  // pour un personnage debout. La première version prenait le rapport x/y de la boîte, en supposant
  // que la verticale du fichier est Y. Deux des six fichiers mesurés ont +Z. La boîte de hulk fait
  // 1,0 × 0,8 × 2,5 : `t.y` est son ÉPAISSEUR, et le rapport sortait à 1,25 au lieu de 0,4.
  //
  // La justification écrite alors — « la mesure et le rendu se tromperaient ensemble » — était
  // FAUSSE : cette fonction voit la scène telle qu'elle sort du fichier, le rendu la voit REMISE
  // DEBOUT. Ils ne mesurent pas au même moment.

  /**
   * Un humanoïde Mixamo debout sur +Y, aux dimensions CHOISIES RONDES pour que le rapport attendu
   * se lise directement :
   *
   *   pieds à y = 0, tête à y = 2,0        → hauteur 2,0
   *   mains à x = ±0,5                     → envergure 1,0
   *   rapport attendu                      → 0,5
   *
   * Le nommage suit Mixamo, la convention la plus répandue des cinq mesurées : c'est ce qui rend le
   * squelette RECONNAISSABLE par inferSkeletonMap. Une hiérarchie inventée ne l'était pas, et la
   * fonction tombait alors dans son repli — le test mesurait le comportement d'avant sans le dire.
   */
  function squeletteMixamo(){
    const os = (nom, x, y, z) => {
      const b = new THREE.Bone();
      b.name = 'mixamorig:' + nom;
      b.position.set(x, y, z);
      return b;
    };
    const hips = os('Hips', 0, 1.00, 0);
    const spine = os('Spine', 0, 0.25, 0);
    const spine1 = os('Spine1', 0, 0.25, 0);
    const neck = os('Neck', 0, 0.30, 0);
    const head = os('Head', 0, 0.20, 0);          // → y = 2,00
    hips.add(spine); spine.add(spine1); spine1.add(neck); neck.add(head);
    [['Left', 1], ['Right', -1]].forEach(([cote, signe]) => {
      const clav = os(cote + 'Shoulder', signe * 0.05, 0.10, 0);
      const bras = os(cote + 'Arm', signe * 0.15, 0, 0);
      const avant = os(cote + 'ForeArm', signe * 0.15, 0, 0);
      const main = os(cote + 'Hand', signe * 0.15, 0, 0);   // → x = ±0,50
      spine1.add(clav); clav.add(bras); bras.add(avant); avant.add(main);
      const cuisse = os('Up' + cote + 'Leg', signe * 0.10, -0.05, 0);
      const jambe = os(cote + 'Leg', 0, -0.50, 0);
      const pied = os(cote + 'Foot', 0, -0.45, 0);          // → y = 0,00
      hips.add(cuisse); cuisse.add(jambe); jambe.add(pied);
    });
    return hips;
  }

  // Ce que le squelette ci-dessus impose : 1,0 d'envergure pour 2,0 de haut.
  const RAPPORT_ATTENDU = 0.5;

  /**
   * Le même corps, plus un maillage de `largeur` × `hauteur`, le tout COUCHÉ : le groupe est tourné
   * de −90° autour de X, si bien que la verticale du corps devient +Z en coordonnées monde. C'est
   * la situation de `hulk`, obtenue sans inventer une hiérarchie d'os que la reconnaissance
   * pourrait ne pas admettre — celle-ci est déjà éprouvée ailleurs.
   */
  function corpsCouche(largeur, hauteur){
    const interne = new THREE.Group();
    interne.add(squeletteMixamo());
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(largeur, hauteur, largeur * 0.4), new THREE.MeshBasicMaterial());
    m.position.y = hauteur / 2;
    interne.add(m);
    const racine = new THREE.Group();
    racine.rotation.x = -Math.PI / 2;
    racine.add(interne);
    racine.updateMatrixWorld(true);
    return racine;
  }

  /** Le même corps, debout : la référence à laquelle le corps couché doit être identique. */
  function corpsDebout(largeur, hauteur){
    const g = new THREE.Group();
    g.add(squeletteMixamo());
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(largeur, hauteur, largeur * 0.4), new THREE.MeshBasicMaterial());
    m.position.y = hauteur / 2;
    g.add(m);
    g.updateMatrixWorld(true);
    return g;
  }

  test('le garde-fou : coucher le corps CHANGE bien la boîte du maillage', () => {
    // Sans lui, le test suivant serait vert même si les deux montages étaient identiques — il ne
    // prouverait alors rien sur l'orientation.
    const tc = new THREE.Vector3(); box3FromObjectSkinAware3D(corpsCouche(0.7, 1.75)).getSize(tc);
    const td = new THREE.Vector3(); box3FromObjectSkinAware3D(corpsDebout(0.7, 1.75)).getSize(td);
    assert.ok(tc.z > tc.y, `couché : boîte ${tc.x.toFixed(2)} × ${tc.y.toFixed(2)} × ${tc.z.toFixed(2)}`);
    assert.ok(td.y > td.z, `debout : boîte ${td.x.toFixed(2)} × ${td.y.toFixed(2)} × ${td.z.toFixed(2)}`);
    assert.ok(Math.abs(tc.x / tc.y - td.x / td.y) > 1,
      'les rapports x/y naïfs des deux montages doivent différer franchement');
  });

  test('RÉGRESSION : le rapport VAUT l\'envergure sur la hauteur, debout comme couché', () => {
    // LA propriété, et elle est épinglée par sa VALEUR — pas seulement par une invariance. Une
    // première version ne vérifiait que « couché == debout » : une campagne de mutation a montré
    // qu'un rapport constant, un rapport inversé et deux projections croisées la satisfaisaient
    // tous. Une invariance seule ne dit rien de ce qui est mesuré.
    const debout = ratioLargeurModele3D(corpsDebout(0.7, 1.75));
    const couche = ratioLargeurModele3D(corpsCouche(0.7, 1.75));
    assert.ok(Math.abs(debout - RAPPORT_ATTENDU) < 1e-6,
      `debout : ${debout.toFixed(3)} au lieu de ${RAPPORT_ATTENDU}`);
    assert.ok(Math.abs(couche - RAPPORT_ATTENDU) < 1e-6,
      `couché : ${couche.toFixed(3)} — le repère du fichier a été supposé être celui du corps`);
  });

  test('et il ne dépend pas non plus du MAILLAGE, seulement des os', () => {
    // Conséquence assumée du choix : la mesure porte sur les os, pas sur la silhouette dessinée.
    // Deux maillages très différents autour du même squelette donnent donc le même rapport — ce qui
    // est le prix d'une mesure cohérente, et ce que le module documente.
    assert.ok(Math.abs(ratioLargeurModele3D(corpsDebout(0.7, 1.75))
      - ratioLargeurModele3D(corpsDebout(3.0, 1.75))) < 1e-6);
  });

  test('sans squelette reconnu, on retombe sur la convention du fichier', () => {
    // Un objet sans corps n'a pas de verticale à dériver : x/y est tout ce qu'on a.
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshBasicMaterial());
    const g = new THREE.Group();
    g.add(m);
    g.updateMatrixWorld(true);
    assert.ok(Math.abs(ratioLargeurModele3D(g) - 0.5) < 1e-6);
  });
});
