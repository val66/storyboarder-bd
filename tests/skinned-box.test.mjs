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
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { box3FromObjectSkinAware3D } from '../src/skinned-box-3d.js';
import { boiteDesOsMappes3D } from '../src/rig3d.js';
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
