/**
 * tests/trace-textures-3d.test.mjs, les textures des Traces (#437).
 *
 * Le GLSL du plaquage monde ne s'exécute pas sous Node ; il a été compilé et rendu dans un vrai
 * WebGL. Ce qui est tenu ici : le registre, la règle de teinte, l'insertion dans le VRAI shader de
 * three.js, le repli en aplat tant que le grain manque, et le branchement de chaque Trace.
 */
import './helpers/dom-stub.mjs';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { TRACÉ_DEFAULTS, TRACÉ_TEXTURES, grainsDesTraces3D, couleurDeTrace3D } from '../src/constants.js';
import {
  installerPlaquageMonde3D, materiauDeTrace3D, textureDeTrace3D, grainDeTracePret3D,
  GLSL_PLAQUAGE_FRAGMENT, GLSL_PLAQUAGE_TRACE, _viderTexturesDesTraces3D, libererMateriauDeTrace3D,
} from '../src/trace-textures-3d.js';
import { _setGrain3D, _viderGrains3D } from '../src/bubble-grain.js';

const THREE = globalThis.THREE;
const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('Traces : le registre des textures', () => {
  test('⚠️ CHAQUE TRACE A SA TEXTURE, SAUF LE TERRAIN QUI EMPRUNTE CELLES DU SOL', () => {
    const attendus = Object.keys(TRACÉ_DEFAULTS).filter(t => t !== 'terrain').sort();
    assert.deepEqual(Object.keys(TRACÉ_TEXTURES).sort(), attendus);
    assert.equal(couleurDeTrace3D('terrain', '#123456'), null);
  });

  test('⚠️ CHAQUE GRAIN DÉCLARÉ EST LIVRÉ', () => {
    // Un grain absent laisserait la Trace en aplat, sans un mot : le préchargement l'avertirait
    // dans la console, que personne ne lit.
    for (const g of grainsDesTraces3D()) {
      assert.ok(existsSync(join(RACINE, 'assets', 'textures', g + '.png')), `${g}.png manque`);
    }
    assert.equal(grainsDesTraces3D().length, 6);
  });

  test('les tuiles ont une taille réelle, et celle du muret garde le 2:1 de sa source', () => {
    for (const [t, def] of Object.entries(TRACÉ_TEXTURES)) {
      assert.ok(def.tuile[0] > 0 && def.tuile[1] > 0, t);
      assert.match(def.teinte, /^#[0-9A-Fa-f]{6}$/, t);
    }
    const [l, h] = TRACÉ_TEXTURES.muret.tuile;
    assert.equal(l / h, 2, 'le cuiseur a étiré la source 2048 × 1024 au carré : la tuile doit la rendre');
  });
});

describe('Traces : la couleur de la fiche', () => {
  test('⚠️ LA COULEUR PAR DÉFAUT AFFICHE LA TEXTURE AU NATUREL', () => {
    for (const [t, def] of Object.entries(TRACÉ_TEXTURES)) {
      assert.equal(couleurDeTrace3D(t, TRACÉ_DEFAULTS[t].color), def.teinte, t);
      assert.equal(couleurDeTrace3D(t, TRACÉ_DEFAULTS[t].color.toLowerCase()), def.teinte, `${t}, casse`);
      assert.equal(couleurDeTrace3D(t, undefined), def.teinte, `${t}, sans couleur`);
      assert.equal(couleurDeTrace3D(t, ''), def.teinte, `${t}, vide`);
    }
  });

  test('toute autre couleur teinte la texture', () => {
    assert.equal(couleurDeTrace3D('cloture', '#FFFFFF'), '#FFFFFF');
    assert.equal(couleurDeTrace3D('haie', '#1E3A1E'), '#1E3A1E');
  });
});

describe('Traces : le matériau', () => {
  test('⚠️ TANT QUE LE GRAIN MANQUE, LA TRACE GARDE SON APLAT', () => {
    _viderGrains3D(); _viderTexturesDesTraces3D();
    assert.equal(grainDeTracePret3D('route'), false);
    assert.equal(textureDeTrace3D('route', '#888888'), null);
    const m = materiauDeTrace3D('route', '#888888', { couleurAplat: '#888888', roughness: 0.85 });
    assert.equal(m.map, null);
    assert.equal(m.color.getHex(), 0x888888);
    assert.equal(m.roughness, 0.85);
  });

  test('avec son grain, la Trace est texturée et plaquée en monde', () => {
    _viderGrains3D(); _viderTexturesDesTraces3D();
    _setGrain3D('cloture.couleur', { width: 4, height: 4 });
    assert.equal(grainDeTracePret3D('cloture'), true);
    const m = materiauDeTrace3D('cloture', '#7A5230', { couleurAplat: '#7A5230', ombre: 0.7 });
    assert.ok(m.map, 'pas de texture');
    assert.equal(m.color.r, 0.7, 'l’ombre d’une couche multiplie la texture');
    assert.equal(m.customProgramCacheKey(), 'trace-plaquage-1-monde');
    // Même grain, même couleur : une seule texture.
    assert.equal(textureDeTrace3D('cloture', '#7A5230'), textureDeTrace3D('cloture', '#7A5230'));
    assert.notEqual(textureDeTrace3D('cloture', '#7A5230'), textureDeTrace3D('cloture', '#FFFFFF'));
    _viderGrains3D(); _viderTexturesDesTraces3D();
  });
});

describe('Traces : le plaquage s’insère dans le VRAI shader de three.js', () => {
  const installe = (tuile = [2.4, 1.2]) => {
    const m = new THREE.MeshStandardMaterial();
    installerPlaquageMonde3D(m, tuile);
    const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader,
      fragmentShader: THREE.ShaderLib.standard.fragmentShader };
    m.onBeforeCompile(shader);
    return { m, shader };
  };

  test('⚠️ LES ANCRES EXISTENT ET CHAQUE INSERTION A LIEU', () => {
    const v = THREE.ShaderLib.standard.vertexShader, f = THREE.ShaderLib.standard.fragmentShader;
    for (const a of ['#include <common>', '#include <begin_vertex>']) assert.equal(v.split(a).length, 2, a);
    for (const a of ['#include <map_pars_fragment>', '#include <map_fragment>']) assert.equal(f.split(a).length, 2, a);
    const { shader } = installe();
    assert.ok(shader.vertexShader.includes('vTraceMonde = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;'));
    assert.ok(shader.vertexShader.includes('vTraceNormale = mat3( modelMatrix ) * objectNormal;'));
    assert.ok(shader.fragmentShader.includes('traceEchantillon'));
    assert.ok(!shader.fragmentShader.includes('#include <map_fragment>'), 'l’échantillonnage d’origine est resté');
    // `objectNormal` est déclaré AVANT `begin_vertex` : sinon le sommet ne compilerait pas.
    assert.ok(v.indexOf('#include <beginnormal_vertex>') < v.indexOf('#include <begin_vertex>'));
  });

  test('la tuile atteint le shader, largeur et hauteur', () => {
    const { shader } = installe([2.4, 1.2]);
    assert.equal(shader.uniforms.uTuile.value.x, 2.4);
    assert.equal(shader.uniforms.uTuile.value.y, 1.2);
  });

  test('⚠️ UNE FACE VERTICALE SE LIT EN (HORIZONTALE, y), UN SOL EN (x, z)', () => {
    // Le muret doit montrer ses pierres debout, et la route ne doit pas s'étirer en hauteur.
    assert.ok(GLSL_PLAQUAGE_FRAGMENT.includes('wT.x * traceEchantillon( vec2( vTraceMonde.z / uTuile.x, vTraceMonde.y / uTuile.y ) )'));
    assert.ok(GLSL_PLAQUAGE_FRAGMENT.includes('wT.z * traceEchantillon( vec2( vTraceMonde.x / uTuile.x, vTraceMonde.y / uTuile.y ) )'));
    assert.ok(GLSL_PLAQUAGE_FRAGMENT.includes('wT.y * traceEchantillon( vec2( vTraceMonde.x / uTuile.x, vTraceMonde.z / uTuile.x ) )'));
    assert.ok(GLSL_PLAQUAGE_FRAGMENT.includes('wT /= ( wT.x + wT.y + wT.z );'), 'les poids ne somment pas à 1');
  });
});

describe('Traces : le plaquage le long du tracé, pour les murs', () => {
  test('⚠️ LES MURS PORTENT (ABSCISSE, HAUTEUR) EN MÈTRES, et le shader les lit tels quels', async () => {
    const { buildTracéWallGeometry3D } = await import('../src/scene3d.js');
    // Un mur en BIAIS, de 0 à (3, 4) : 5 m de long. La projection sur les axes y dédoublait le motif.
    const geo = buildTracéWallGeometry3D([{ x: 0, z: 0 }, { x: 3, z: 4 }], 1.0, 0.2, 0, null);
    const uv = geo.attributes.uv, pos = geo.attributes.position;
    assert.equal(uv.count, pos.count, 'chaque sommet a ses coordonnées de texture');
    let maxU = 0, maxV = 0;
    for (let i = 0; i < uv.count; i++) { maxU = Math.max(maxU, uv.getX(i)); maxV = Math.max(maxV, uv.getY(i)); }
    assert.ok(Math.abs(maxU - 5) < 0.05, `u va jusqu'à ${maxU}, la longueur du mur vaut 5`);
    // Sur les faces, v est la hauteur réelle du sommet.
    for (let i = 0; i < 8; i++) assert.ok(Math.abs(uv.getY(i) - pos.getY(i)) < 1e-6, `sommet ${i}`);
    assert.ok(maxV >= 1.0 - 1e-6);
    assert.ok(GLSL_PLAQUAGE_TRACE.includes('traceEchantillon( vUv / uTuile )'));
  });

  test('les murs, la haie et la barrière demandent ce plaquage, pas la route', () => {
    const scene = readFileSync(join(RACINE, 'src', 'scene3d.js'), 'utf8');
    assert.equal(scene.split("plaquage: 'trace'").length - 1, 5, 'muret, deux couches de haie, deux de barrière');
    _viderGrains3D(); _viderTexturesDesTraces3D();
    _setGrain3D('muret.couleur', { width: 4, height: 4 });
    const m = materiauDeTrace3D('muret', '#606060', { plaquage: 'trace' });
    assert.equal(m.customProgramCacheKey(), 'trace-plaquage-1-trace');
    const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
    m.onBeforeCompile(shader);
    assert.ok(shader.fragmentShader.includes('traceEchantillon( vUv / uTuile )'));
    _viderGrains3D(); _viderTexturesDesTraces3D();
  });
});

describe('Traces : chaque Trace est branchée', () => {
  const scene = readFileSync(join(RACINE, 'src', 'scene3d.js'), 'utf8');

  test('⚠️ LES SIX TRACES PASSENT PAR LEUR MATÉRIAU TEXTURÉ', () => {
    for (const t of ['muret', 'cloture', 'haie', 'barriere']) {
      assert.ok(scene.includes(`materiauDeTrace3D('${t}', o.color`), t);
    }
    assert.ok(scene.includes("materiauDeTrace3D(isRoute ? 'route' : 'chemin', o.color"));
  });

  test('⚠️ L’ARRIVÉE DU GRAIN REFAIT LA TRACE ET LA CASE', () => {
    assert.ok(scene.includes('holes: _tmHoleSig, g: grainDeTracePret3D(o.tracéType) })'));
    assert.ok(scene.includes('world: o.world, g: grainDeTracePret3D(o.tracéType) }))'));
    const events = readFileSync(join(RACINE, 'src', 'events.js'), 'utf8');
    assert.ok(events.includes('...grainsDesTraces3D()'), 'les grains des Traces ne sont pas préchargés');
  });
});

describe('Traces : les programmes ne se recompilent pas à chaque glissé (#437c)', () => {
  test('⚠️ UN MÊME RÉGLAGE REND LE MÊME MATÉRIAU, ET IL N’EST JAMAIS LIBÉRÉ', () => {
    // Libérer le dernier matériau d'un programme libère le programme : 8,7 ms de recompilation à
    // chaque reconstruction, mesurés, au lieu de 0,7 ms de rendu.
    _viderGrains3D(); _viderTexturesDesTraces3D();
    _setGrain3D('muret.couleur', { width: 4, height: 4 });
    const opts = { couleurAplat: '#606060', plaquage: 'trace', roughness: 0.95, metalness: 0, side: THREE.DoubleSide };
    const a = materiauDeTrace3D('muret', '#606060', opts);
    const b = materiauDeTrace3D('muret', '#606060', { ...opts });
    assert.equal(a, b, 'deux reconstructions ont créé deux matériaux');
    assert.notEqual(a, materiauDeTrace3D('muret', '#FF0000', opts), 'deux couleurs partagent un matériau');
    assert.notEqual(a, materiauDeTrace3D('muret', '#606060', { ...opts, ombre: 0.7 }));
    let libere = false;
    a.addEventListener('dispose', () => { libere = true; });
    libererMateriauDeTrace3D(a);
    assert.equal(libere, false, 'le matériau partagé a été libéré');
    _viderGrains3D(); _viderTexturesDesTraces3D();
  });

  test('un aplat, lui, se libère normalement', () => {
    _viderGrains3D(); _viderTexturesDesTraces3D();
    const m = materiauDeTrace3D('route', '#888888', { couleurAplat: '#888888' });
    let libere = false;
    m.addEventListener('dispose', () => { libere = true; });
    libererMateriauDeTrace3D(m);
    assert.equal(libere, true);
  });

  test('⚠️ LES DEUX LIBÉRATIONS DE TRACES DE scene3d PASSENT PAR LA GARDE', () => {
    const scene = readFileSync(join(RACINE, 'src', 'scene3d.js'), 'utf8');
    assert.equal(scene.split('libererMateriauDeTrace3D(ch.material)').length - 1, 2);
  });
});
