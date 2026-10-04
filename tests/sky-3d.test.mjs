/**
 * tests/sky-3d.test.mjs, le ciel d'une Case (#436) : un panorama en Jour et en Nuit, un ciel
 * calculé en Personnalisé.
 *
 * Le GLSL ne s'exécute pas sous Node ; il a été compilé et rendu dans un vrai WebGL (three r128)
 * avant d'être retenu. Ce qui est tenu ici est tout ce qui DÉCIDE : quel ciel pour quel mode, où
 * est le soleil d'un panorama, de combien le tourner, et le fil qui l'amène jusqu'au rendu.
 */
import './helpers/dom-stub.mjs';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  CIEL_PANORAMAS, panoramaDuMode3D, couleursDuCielCalcule3D, etoilesDuCiel3D,
  soleilDuPanorama3D, lacetDuPanorama3D, CIEL_SOLEIL_PLEIN, GLSL_CIEL_SOMMET, GLSL_CIEL_FRAGMENT,
  poserCiel3D, retirerCiel3D, etatDuPanorama3D, _viderCiel3D, _poserPanoramaPourTests3D,
  SOLEIL_PIXELS_MIN,
} from '../src/sky-3d.js';
import { resoudreEclairage3D, CLE_ACTUELLE, directionSoleil3D, PRESETS_LUMIERE } from '../src/lighting-3d.js';
import { dimensionsJpeg, refusDuPanorama, sourceUnique, LARGEUR_MAX } from '../tools/bake-ciel.mjs';

const THREE = globalThis.THREE;
const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('Ciel : quel ciel pour quel mode', () => {
  test('⚠️ JOUR ET NUIT ONT LEUR PANORAMA, PERSONNALISÉ LE CIEL CALCULÉ', () => {
    // C'est la décision de #436 : la photo là où le soleil ne bouge pas, le calcul là où il bouge.
    assert.equal(resoudreEclairage3D({ mode: 'jour' }).panorama, 'jour');
    assert.equal(resoudreEclairage3D({ mode: 'nuit' }).panorama, 'nuit');
    assert.equal(resoudreEclairage3D({ mode: 'perso', azimut: 10, elevation: 5, couleur: '#FF8800', intensite: 0.6 }).panorama, null);
    // Un mode inconnu retombe sur Jour partout ailleurs : le ciel doit suivre la même règle.
    assert.equal(resoudreEclairage3D({ mode: 'n’importe' }).panorama, 'jour');
    assert.equal(resoudreEclairage3D(null).panorama, 'jour');
  });

  test('le registre ne répond qu’à ses propres clés, pas à celles d’un objet JavaScript', () => {
    assert.equal(panoramaDuMode3D('toString'), null);
    assert.equal(panoramaDuMode3D(undefined), null);
    assert.deepEqual(Object.keys(CIEL_PANORAMAS).sort(), ['jour', 'nuit']);
  });

  test('l’état d’un ciel calculé est stable, celui d’un panorama suit son chargement', () => {
    _viderCiel3D();
    assert.equal(etatDuPanorama3D(null), 'calcule');
    assert.equal(etatDuPanorama3D('jour'), 'attente');
    _poserPanoramaPourTests3D('jour', new THREE.Texture(), null);
    assert.equal(etatDuPanorama3D('jour'), 'charge');
    assert.equal(etatDuPanorama3D('nuit'), 'attente', 'l’état d’un panorama ne dépend pas de l’autre');
    _viderCiel3D();
  });
});

describe('Ciel : le ciel calculé', () => {
  test('le zénith est plus profond que la couleur résolue, l’horizon plus clair', () => {
    const { zenith, horizon } = couleursDuCielCalcule3D('#8FCEF3');
    const base = [0x8F, 0xCE, 0xF3].map(x => x / 255);
    for (let i = 0; i < 3; i++) {
      assert.ok(zenith[i] < base[i], 'zénith');
      assert.ok(horizon[i] > base[i], 'horizon');
    }
    // Une couleur illisible ne fait pas un ciel noir.
    assert.ok(couleursDuCielCalcule3D('pas une couleur').horizon.every(x => x > 0.5));
  });

  test('⚠️ UN PERSONNALISÉ ASSOMBRI FINIT EN NUIT, AVEC SES ÉTOILES', () => {
    assert.equal(etoilesDuCiel3D(1), 0, 'aucune étoile en plein jour');
    assert.equal(etoilesDuCiel3D(0), 1);
    let avant = 2;
    for (let i = 0; i <= 1.0001; i += 0.05) {
      const e = etoilesDuCiel3D(i);
      assert.ok(e <= avant, `les étoiles réapparaissent à ${i}`);
      avant = e;
    }
    assert.equal(etoilesDuCiel3D(NaN), 0);
  });

  test('la constante de plein jour est celle de l’éclairage, recopiée pour éviter un cycle', () => {
    assert.equal(CIEL_SOLEIL_PLEIN, CLE_ACTUELLE);
  });
});

describe('Ciel : le soleil d’un panorama', () => {
  const L = 512, H = 256;
  const image = (taches, fond = 140) => {
    const lum = new Float32Array(L * H).fill(fond);
    for (const { x, y, r, v } of taches) {
      for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
        if (i * i + j * j > r * r) continue;
        const xx = ((x + i) % L + L) % L, yy = y + j;
        if (yy >= 0 && yy < H) lum[yy * L + xx] = v;
      }
    }
    return lum;
  };

  test('une tache saturée et compacte est un soleil, retrouvé à sa place', () => {
    const s = soleilDuPanorama3D(image([{ x: 256, y: 71, r: 3, v: 255 }]), L, H);
    assert.ok(s, 'soleil non trouvé');
    assert.ok(Math.abs(s.u - 256.5 / L) < 0.002, `u ${s.u}`);
    assert.ok(Math.abs(s.v - (1 - 71.5 / H)) < 0.002, `v ${s.v}`);
    // Relevé sur le panorama de jour du dépôt : v = 0,72 environ, soit 40° de hauteur.
    assert.ok(Math.abs(s.elevation - (s.v - 0.5) * 180) < 1e-9);
  });

  test('⚠️ UN SOLEIL SUR LA COUTURE RESTE SUR LA COUTURE', () => {
    // Une moyenne ordinaire de x le poserait au milieu de l'image, à l'opposé de sa vraie place.
    const s = soleilDuPanorama3D(image([{ x: 1, y: 80, r: 3, v: 255 }]), L, H);
    assert.ok(s);
    assert.ok(Math.min(s.u, 1 - s.u) < 0.01, `u ${s.u}`);
  });

  test('⚠️ UNE NUIT N’A PAS DE SOLEIL, ET ON NE LE DEVINE PAS', () => {
    // Le panorama de nuit du dépôt a un seul pixel au-dessus de 97 % de son maximum, à 127/255.
    assert.equal(soleilDuPanorama3D(image([{ x: 320, y: 30, r: 0, v: 127 }], 40), L, H), null);
    // Une étoile saturée isolée n'est pas un soleil non plus.
    assert.equal(soleilDuPanorama3D(image([{ x: 320, y: 30, r: 0, v: 255 }], 40), L, H), null);
    // Ni une lune : ronde et compacte, mais pas saturée. Un soleil photographié l'est toujours.
    assert.equal(soleilDuPanorama3D(image([{ x: 320, y: 30, r: 4, v: 200 }], 40), L, H), null);
    // Ni deux nuages blancs saturés éloignés : trop étalé pour être un disque.
    assert.equal(soleilDuPanorama3D(image([{ x: 100, y: 60, r: 3, v: 255 }, { x: 300, y: 90, r: 3, v: 255 }]), L, H), null);
  });

  test('le garde-fou : la taille minimale d’une tache est bien celle qui tranche', () => {
    // Sans ce repère, le test de l'étoile passerait avec un seuil absurde.
    const n = (r) => { let c = 0; for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (i * i + j * j <= r * r) c++; return c; };
    assert.ok(n(1) < SOLEIL_PIXELS_MIN && n(2) >= SOLEIL_PIXELS_MIN);
    assert.equal(soleilDuPanorama3D(image([{ x: 200, y: 50, r: 1, v: 255 }]), L, H), null);
    assert.ok(soleilDuPanorama3D(image([{ x: 200, y: 50, r: 2, v: 255 }]), L, H));
  });
});

describe('Ciel : la rotation du panorama, sur la VRAIE géométrie de la sphère', () => {
  /**
   * ⚠️ LA FORMULE NE SE TESTE PAS CONTRE ELLE-MÊME. On construit la sphère de three.js, on la
   * tourne du lacet calculé, et on cherche où tombe le point de l'image qui porte le soleil : il
   * doit regarder dans la direction du soleil de la scène. C'est ce rendu-là que l'œil verra.
   */
  const directionDuTexel = (rotation, uImage, vImage) => {
    const geo = new THREE.SphereGeometry(1, 64, 32);
    const mesh = new THREE.Mesh(geo);
    mesh.rotation.y = rotation;
    mesh.updateMatrixWorld();
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    let meilleur = null, ecart = Infinity;
    for (let i = 0; i < pos.count; i++) {
      // Le shader lit l'image en (1 − u, v) : c'est ce couple qu'on compare.
      const du = Math.abs((1 - uv.getX(i)) - uImage), dv = Math.abs(uv.getY(i) - vImage);
      const e = Math.min(du, 1 - du) + dv;
      if (e < ecart) { ecart = e; meilleur = i; }
    }
    return new THREE.Vector3().fromBufferAttribute(pos, meilleur).applyMatrix4(mesh.matrixWorld).normalize();
  };

  test('⚠️ LE SOLEIL DE L’IMAGE TOMBE DANS LA DIRECTION DU SOLEIL DE LA SCÈNE', () => {
    for (const [az, el, u, v] of [[PRESETS_LUMIERE.jour.azimut, PRESETS_LUMIERE.jour.elevation, 0.499, 0.72],
      [115, 24, 0.37, 0.63], [-170, 10, 0.9, 0.56]]) {
      const d = directionSoleil3D(az, el);
      const r = lacetDuPanorama3D({ u, v }, d);
      const vue = directionDuTexel(r, u, v);
      const attendu = Math.atan2(d.z, d.x), obtenu = Math.atan2(vue.z, vue.x);
      let diff = Math.abs(attendu - obtenu); diff = Math.min(diff, 2 * Math.PI - diff);
      assert.ok(diff < 0.06, `azimut ${az} : écart de ${(diff * 180 / Math.PI).toFixed(1)}°`);
    }
  });

  test('⚠️ LA LECTURE EN 1 − u EST LA CONVENTION ÉQUIRECTANGULAIRE DE three.js, PAS SON MIROIR', () => {
    // Sans retournement, la SphereGeometry tourne à l'envers : le ciel serait vu en miroir, ce qui
    // ne se voit pas sur un nuage et se voit sur tout le reste.
    const geo = new THREE.SphereGeometry(1, 16, 8);
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      if (Math.hypot(x, z) < 1e-6) continue;
      const u = Math.atan2(z, x) / (2 * Math.PI) + 0.5;
      const d = Math.abs((1 - uv.getX(i)) - u);
      assert.ok(Math.min(d, 1 - d) < 1e-6, `u au sommet ${i}`);
      assert.ok(Math.abs(uv.getY(i) - (Math.asin(Math.max(-1, Math.min(1, y))) / Math.PI + 0.5)) < 1e-6, `v au sommet ${i}`);
    }
    assert.ok(GLSL_CIEL_FRAGMENT.includes('vec2( 1.0 - vUv.x, vUv.y )'));
  });

  test('sans soleil, le panorama garde son orientation', () => {
    assert.equal(lacetDuPanorama3D(null, { x: 1, y: 0, z: 0 }), 0);
  });
});

describe('Ciel : posé pour le rendu, retiré après', () => {
  const eclairage = (mode) => resoudreEclairage3D(mode === 'perso'
    ? { mode: 'perso', azimut: 95, elevation: 6, couleur: '#FF9A5A', intensite: 0.8 } : { mode });

  test('⚠️ UN PANORAMA CHARGÉ EST AFFICHÉ, ET TOURNÉ SUR LE SOLEIL DE LA SCÈNE', () => {
    _viderCiel3D();
    const texture = new THREE.Texture();
    _poserPanoramaPourTests3D('jour', texture, { u: 0.4, v: 0.72 });
    const scene = new THREE.Scene();
    const e = eclairage('jour');
    const sphere = poserCiel3D(scene, e);
    assert.equal(sphere.parent, scene);
    assert.equal(sphere.material.uniforms.uPanorama.value, 1);
    assert.equal(sphere.material.uniforms.uCarte.value, texture);
    assert.equal(sphere.rotation.y, lacetDuPanorama3D({ u: 0.4, v: 0.72 }, e.soleil.direction));
    retirerCiel3D(scene);
    assert.equal(sphere.parent, null, 'le ciel est resté dans la scène partagée');
    _viderCiel3D();
  });

  test('⚠️ EN ATTENDANT SON PANORAMA, UNE CASE A LE CIEL CALCULÉ DE SON MODE, PAS UN APLAT', () => {
    _viderCiel3D();
    const scene = new THREE.Scene();
    const e = eclairage('nuit');
    const sphere = poserCiel3D(scene, e);
    const u = sphere.material.uniforms;
    assert.equal(u.uPanorama.value, 0);
    const { zenith } = couleursDuCielCalcule3D(e.ciel);
    assert.ok(Math.abs(u.uZenith.value.r - zenith[0]) < 1e-6 && Math.abs(u.uZenith.value.b - zenith[2]) < 1e-6);
    assert.ok(u.uEtoiles.value > 0.3, 'la nuit provisoire n’a pas d’étoiles');
    retirerCiel3D(scene);
    _viderCiel3D();
  });

  test('en Personnalisé, le ciel calculé suit la direction et la couleur du soleil', () => {
    _viderCiel3D();
    const scene = new THREE.Scene();
    const e = eclairage('perso');
    const u = poserCiel3D(scene, e).material.uniforms;
    assert.equal(u.uPanorama.value, 0);
    assert.ok(Math.abs(u.uSoleilDir.value.x - e.soleil.direction.x) < 1e-9);
    assert.ok(Math.abs(u.uSoleilDir.value.z - e.soleil.direction.z) < 1e-9);
    assert.equal(u.uSoleilCoul.value.getHex(), 0xFF9A5A);
    retirerCiel3D(scene);
    _viderCiel3D();
  });

  test('le ciel ne projette pas d’ombre, ne se découpe pas, et se dessine au plan lointain', () => {
    _viderCiel3D();
    const s = poserCiel3D(new THREE.Scene(), eclairage('perso'));
    assert.equal(s.castShadow, false);
    assert.equal(s.frustumCulled, false);
    assert.equal(s.material.depthWrite, false);
    assert.ok(GLSL_CIEL_SOMMET.includes('gl_Position = p.xyww;'));
    _viderCiel3D();
  });
});

describe('Ciel : le fil jusqu’au rendu d’une Case', () => {
  const scene = readFileSync(join(RACINE, 'src', 'scene3d.js'), 'utf8');

  test('⚠️ LE CIEL SE POSE APRÈS LE MARQUAGE DES OMBRES ET SE RETIRE APRÈS LE RENDU', () => {
    // Posé avant `marquerProjectionDOmbre3D`, il recevrait `castShadow` et ombrerait toute la scène.
    const i = (s) => { const n = scene.indexOf(s); assert.ok(n >= 0, s); return n; };
    const marque = i('if (_ombresDeLaCase) marquerProjectionDOmbre3D();');
    const pose = i('poserCiel3D(personaScene3D, _eclairage');
    const rendu = scene.indexOf('personaRenderer3D.render(personaScene3D, personaCamera3D);', pose);
    const retrait = i('retirerCiel3D(personaScene3D);');
    assert.ok(marque < pose && pose < rendu && rendu < retrait);
  });

  test('⚠️ L’ÉTAT DU PANORAMA ENTRE DANS LA SIGNATURE DE CASE', () => {
    // Sans lui, une Case rendue avant l'arrivée du panorama le resterait pour toujours.
    assert.ok(scene.includes("const cielPart = etatDuPanorama3D(eclairageResolu.panorama);"));
    assert.ok(scene.includes("+ '||c:' + cielPart"));
  });
});

describe('Ciel : l’outil qui dépose les panoramas', () => {
  const entete = (largeur, hauteur, marqueur = 0xC0) => Uint8Array.from([
    0xFF, 0xD8,
    0xFF, 0xE0, 0x00, 0x04, 0x00, 0x00, // un APP0 réduit, à sauter
    0xFF, 0xC4, 0x00, 0x04, 0x00, 0x00, // une table de Huffman : C4 n'est PAS un SOF
    0xFF, marqueur, 0x00, 0x11, 0x08, hauteur >> 8, hauteur & 255, largeur >> 8, largeur & 255, 0x03,
    0, 0, 0, 0, 0, 0, 0, 0, 0,
  ]);

  test('les dimensions se lisent dans le SOF, après les segments qui le précèdent', () => {
    assert.deepEqual(dimensionsJpeg(entete(4096, 2048)), { largeur: 4096, hauteur: 2048 });
    assert.deepEqual(dimensionsJpeg(entete(2048, 1024, 0xC2)), { largeur: 2048, hauteur: 1024 }, 'JPEG progressif');
    assert.equal(dimensionsJpeg(Uint8Array.from([0x89, 0x50, 0x4E, 0x47])), null, 'un PNG n’est pas un JPEG');
  });

  test('⚠️ SEUL UN PANORAMA 2:1 ENTRE 2K ET 4K EST ACCEPTÉ', () => {
    assert.equal(refusDuPanorama({ largeur: 4096, hauteur: 2048 }), null);
    assert.equal(refusDuPanorama({ largeur: 2048, hauteur: 1024 }), null);
    assert.match(refusDuPanorama({ largeur: 8192, hauteur: 4096 }), /4K/);
    assert.match(refusDuPanorama({ largeur: 1024, hauteur: 512 }), /2K/);
    assert.match(refusDuPanorama({ largeur: 4096, hauteur: 4096 }), /2:1/);
    assert.ok(refusDuPanorama(null));
    assert.equal(LARGEUR_MAX, 4096);
  });

  test('un dossier doit contenir UN seul JPEG, et le dit sinon', () => {
    assert.deepEqual(sourceUnique(['a.jpg', 'notes.txt']), { nom: 'a.jpg' });
    assert.match(sourceUnique(['a.exr']).refus, /tonemappé/);
    assert.match(sourceUnique(['a.jpg', 'b.JPEG']).refus, /un seul/);
  });
});
