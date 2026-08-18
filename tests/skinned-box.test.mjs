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
