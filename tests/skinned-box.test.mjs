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

  test('LE DÉFAUT, ÉPINGLÉ : maillage et os ne vivent PAS à la même échelle', () => {
    // worker_j.glb. Le maillage porte 0,1297, les os rien : la boîte du maillage et la boîte des os
    // diffèrent d'exactement ce facteur.
    //
    // ⚠️ CE TEST N'AFFIRME PAS QUI A RAISON, et c'est délibéré. Le maillage est probablement dessiné
    // à sa propre échelle — la boîte serait alors correcte. Ce qui est CERTAIN, c'est que notre code
    // MÉLANGE les deux : la caméra se cadre sur la boîte du maillage, les points d'articulation sont
    // projetés depuis les positions des OS. Sur un fichier à échelle unique les deux coïncident et
    // rien ne se voit ; ici ils divergent d'un facteur 7,7, et l'un des deux est forcément hors du
    // cadre. C'est ce mélange qui est le défaut, pas l'une ou l'autre des deux mesures.
    //
    // Ce test fige donc l'ÉCART tant qu'il existe. Le jour où le code cessera de mélanger les deux
    // repères, il faudra le réécrire — et ce sera le bon moment pour décider lequel fait foi.
    const racine = figureArticulee(ECHELLE);
    const t = new THREE.Vector3(); box3FromObjectSkinAware3D(racine).getSize(t);
    const tOs = new THREE.Vector3(); boiteDesOs(racine).getSize(tOs);
    const rapport = t.y / tOs.y;
    assert.ok(Math.abs(rapport - ECHELLE) < 1e-3,
      `rapport ${rapport.toFixed(4)} au lieu de ${ECHELLE} — le mécanisme mesuré a changé`);
    assert.ok(Math.abs(t.y - tOs.y) > 1,
      'les deux repères coïncident : le témoin de divergence ne prouve plus rien');
  });
});
