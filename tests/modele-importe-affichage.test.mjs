/**
 * tests/modele-importe-affichage.test.mjs, ce qu'un modèle importé doit subir pour s'afficher juste.
 *
 * Audit demandé après le canard orange (#445) : le problème des couleurs datait de toujours, d'autres
 * pouvaient l'accompagner. Ici, un VRAI .glb est construit (gltf-glb.js), décodé par le VRAI
 * GLTFLoader de l'application, puis préparé (preparerModeleImporte3D) : on lit ce qui en sort.
 *
 * Relevé sur les 23 modèles du dossier de développement : métaux nombreux (21 matériaux métalliques
 * sur la Porsche), KHR_materials_emissive_strength (dragon, Porsche), un .gltf importé dont les
 * fichiers voisins n'avaient pas été copiés.
 */
import './helpers/dom-stub.mjs';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { empaqueterGlb, ressourcesExternes, extensionsNonPrisesEnCharge, jsonDuModele } = require('../gltf-glb.js');
const { GLTFLoader } = await import('../src/vendor/GLTFLoader.js');
const { preparerModeleImporte3D } = await import('../src/model-cache.js');
const T = globalThis.THREE;

/** Un triangle peint par sommets, un matériau métallique émissif, une lumière, une caméra. */
function glbDeTest({ emission = 4, couleurSommet = 0.5 } = {}){
  const pos = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const col = new Float32Array([couleurSommet, couleurSommet, couleurSommet, 1, 1, 1, 0, 0, 0]);
  const bin = Buffer.concat([Buffer.from(pos.buffer), Buffer.from(col.buffer)]);
  const gltf = {
    asset: { version: '2.0' },
    extensionsUsed: ['KHR_materials_emissive_strength', 'KHR_lights_punctual'],
    extensions: { KHR_lights_punctual: { lights: [{ type: 'point', color: [1, 1, 1], intensity: 50 }] } },
    scene: 0,
    scenes: [{ nodes: [0, 1, 2] }],
    nodes: [{ mesh: 0 }, { extensions: { KHR_lights_punctual: { light: 0 } } }, { camera: 0 }],
    cameras: [{ type: 'perspective', perspective: { yfov: 1, znear: 0.1 } }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, COLOR_0: 1 }, material: 0 }] }],
    materials: [{
      pbrMetallicRoughness: { baseColorFactor: [0.5, 0.5, 0.5, 1], metallicFactor: 1, roughnessFactor: 0.3 },
      emissiveFactor: [0.2, 0.2, 0.2],
      extensions: { KHR_materials_emissive_strength: { emissiveStrength: emission } },
    }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] },
      { bufferView: 1, componentType: 5126, count: 3, type: 'VEC3' },
    ],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: 36 }],
    buffers: [{ uri: 'triangle.bin', byteLength: 72 }],
  };
  return empaqueterGlb(gltf, new Map([['triangle.bin', bin]]));
}

function decoder(glb){
  const brut = glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength);
  return new Promise((ok, ko) => new GLTFLoader().parse(brut, '', ok, ko));
}
const maillage = (scene) => { let m = null; scene.traverse(n => { if (n.isMesh && !m) m = n; }); return m; };

describe('Un modèle importé, décodé puis préparé', () => {
  test('les lumières et caméras du fichier sont RETIRÉES : l\'éclairage appartient à la Case', async () => {
    const gltf = await decoder(glbDeTest());
    let avant = 0; gltf.scene.traverse(n => { if (n.isLight || n.isCamera) avant++; });
    assert.ok(avant >= 2, 'le montage ne contient pas de lumière ni de caméra : le test ne prouverait rien');
    preparerModeleImporte3D(gltf);
    let apres = 0; gltf.scene.traverse(n => { if (n.isLight || n.isCamera) apres++; });
    assert.equal(apres, 0);
    assert.ok(maillage(gltf.scene), 'le maillage, lui, doit rester');
  });

  test('l\'intensité d\'émission du fichier est appliquée (ignorée par three 0.128)', async () => {
    const gltf = await decoder(glbDeTest({ emission: 4 }));
    preparerModeleImporte3D(gltf);
    assert.equal(maillage(gltf.scene).material.emissiveIntensity, 4);
  });

  test('les couleurs de sommets passent à l\'écran, comme les textures : 0,5 linéaire → ~0,735', async () => {
    const gltf = await decoder(glbDeTest({ couleurSommet: 0.5 }));
    preparerModeleImporte3D(gltf);
    const c = maillage(gltf.scene).geometry.attributes.color;
    assert.ok(Math.abs(c.array[0] - 0.735) < 0.01, `vaut ${c.array[0]}`);
    assert.equal(c.array[3], 1, 'le blanc reste blanc');
    assert.equal(c.array[6], 0, 'le noir reste noir');
  });

  test('⚠️ préparé DEUX fois (géométrie et matériau partagés), rien n\'est converti deux fois', async () => {
    const gltf = await decoder(glbDeTest({ couleurSommet: 0.5 }));
    preparerModeleImporte3D(gltf);
    preparerModeleImporte3D(gltf);
    const m = maillage(gltf.scene);
    assert.ok(Math.abs(m.geometry.attributes.color.array[0] - 0.735) < 0.01);
    assert.ok(Math.abs(m.material.color.r - 0.735) < 0.01);
  });

  test('un métal reflète l\'ambiante de la Case : la ligne est injectée dans son shader, et nommée', async () => {
    const gltf = await decoder(glbDeTest());
    preparerModeleImporte3D(gltf);
    const mat = maillage(gltf.scene).material;
    const shader = { fragmentShader: 'a\n#include <lights_fragment_maps>\nb' };
    mat.onBeforeCompile(shader);
    assert.match(shader.fragmentShader, /#include <lights_fragment_maps>\n#if defined\( RE_IndirectSpecular \) && !defined\( USE_ENVMAP \)\n\tradiance \+= ambientLightColor;\n#endif\nb/);
    assert.match(mat.customProgramCacheKey(), /ambiante-metaux/, 'sans clé, three réutiliserait un shader compilé sans la ligne');
  });

  test('l\'ambiante des métaux s\'enchaîne à un onBeforeCompile existant, sans l\'écraser', async () => {
    const gltf = await decoder(glbDeTest());
    const mat = maillage(gltf.scene).material;
    let appele = false;
    mat.onBeforeCompile = () => { appele = true; };
    preparerModeleImporte3D(gltf);
    mat.onBeforeCompile({ fragmentShader: '#include <lights_fragment_maps>' });
    assert.ok(appele);
  });

  test('la ligne utilise des noms que three 0.128 définit vraiment', () => {
    const { readFileSync } = require('node:fs');
    const chunk = (n) => readFileSync(require.resolve(`three/src/renderers/shaders/ShaderChunk/${n}.glsl.js`), 'utf8');
    assert.match(chunk('lights_fragment_begin'), /vec3 radiance = vec3\( 0\.0 \);/);
    assert.match(chunk('lights_fragment_end'), /RE_IndirectSpecular\( radiance,/);
    assert.match(chunk('lights_pars_begin'), /uniform vec3 ambientLightColor;/);
    assert.match(readFileSync(require.resolve('three/src/renderers/shaders/ShaderLib/meshphysical_frag.glsl.js'), 'utf8'), /#include <lights_fragment_maps>/);
  });

  test('l\'aperçu 3D du store passe par la même préparation que les Cases', () => {
    const { readFileSync } = require('node:fs');
    assert.match(readFileSync(new URL('../src/store-apercu-3d.js', import.meta.url), 'utf8'), /const modele = preparerModeleImporte3D\(gltf\);/);
  });
});

describe('L\'import d\'un .gltf et des fichiers qu\'on ne sait pas lire', () => {
  test('les voisins d\'un .gltf sont relevés : buffers et images externes, une fois chacun', () => {
    const g = { buffers: [{ uri: 'a.bin' }, { uri: 'data:application/octet-stream;base64,AAAA' }],
      images: [{ uri: 'textures/x.png' }, { uri: 'textures/x.png' }, { bufferView: 0 }] };
    assert.deepEqual(ressourcesExternes(g), ['a.bin', 'textures/x.png']);
  });
  test('Draco, Meshopt et KTX2 OBLIGATOIRES sont refusés ; simplement utilisés, non', () => {
    assert.deepEqual(extensionsNonPrisesEnCharge({ extensionsRequired: ['KHR_draco_mesh_compression', 'KHR_texture_transform'] }),
      ['KHR_draco_mesh_compression']);
    assert.deepEqual(extensionsNonPrisesEnCharge({ extensionsUsed: ['KHR_draco_mesh_compression'] }), []);
    assert.deepEqual(extensionsNonPrisesEnCharge(null), []);
  });
  test('le JSON se lit d\'un .glb comme d\'un .gltf texte', () => {
    assert.equal(jsonDuModele(glbDeTest()).asset.version, '2.0');
    assert.equal(jsonDuModele(Buffer.from('{"asset":{"version":"2.0"}}')).asset.version, '2.0');
    assert.equal(jsonDuModele(Buffer.from('pas du json')), null);
  });
  test('main.js : un .gltf est empaqueté avec ses voisins, sans lire hors de son dossier, et la compression est vérifiée', () => {
    const { readFileSync } = require('node:fs');
    const m = readFileSync(new URL('../main.js', import.meta.url), 'utf8');
    const f = m.slice(m.indexOf('async function modeleAImporter('));
    assert.match(f, /if \(!voisin\.startsWith\(dossier \+ path\.sep\)\) return \{ error:/);
    assert.match(f, /data = gltfGlb\.empaqueterGlb\(json, ressources\);/);
    assert.match(f, /const refus = gltfGlb\.extensionsNonPrisesEnCharge\(gltfGlb\.jsonDuModele\(data\)\);/);
    assert.match(m, /return \{ canceled: false, \.\.\.\(await modeleAImporter\(filePaths\[0\]\)\) \};/);
  });
});

// Garde l'objet T utilisé (lint) et vérifie que le global est bien celui du chargeur.
test('THREE global présent', () => { assert.ok(T && T.Mesh); });
