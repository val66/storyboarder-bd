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
  soleilDuPanorama3D, lacetDuPanorama3D, CIEL_SOLEIL_PLEIN, CIEL_TOILE, brumeDuPanorama3D, CIEL_HORIZON_BLANC, abaissementDeLHorizon3D, elevationDuCiel3D, GLSL_CIEL_SOMMET, GLSL_CIEL_FRAGMENT,
  poserCiel3D, retirerCiel3D, etatDuPanorama3D, _viderCiel3D, _poserPanoramaPourTests3D,
  SOLEIL_PIXELS_MIN,
} from '../src/sky-3d.js';
import { resoudreEclairage3D, CLE_ACTUELLE, directionSoleil3D, PRESETS_LUMIERE } from '../src/lighting-3d.js';
import {
  refusDuPanorama, sourceUnique, decoupeDuPanorama, saturationDeLaBandeBasse, LARGEUR_SOURCE_MAX,
  SATURATION_BANDE_MIN, ouvertureMorphologique, RAYON_OUVERTURE,
} from '../tools/bake-ciel.mjs';

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
  // La MOITIÉ HAUTE réduite à 512 de large, comme la lit l'application : dernière ligne = horizon.
  const L = 512, H = 128;
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
    // Ligne 71,5 sur 128 depuis le zénith : 40° au-dessus de l'horizon.
    const s = soleilDuPanorama3D(image([{ x: 256, y: 71, r: 3, v: 255 }]), L, H);
    assert.ok(s, 'soleil non trouvé');
    assert.ok(Math.abs(s.u - 256.5 / L) < 0.002, `u ${s.u}`);
    assert.ok(Math.abs(s.elevation - (1 - 71.5 / H) * 90) < 0.01, `élévation ${s.elevation}`);
    assert.ok(Math.abs(s.elevation - 39.7) < 0.1);
    // v est rendu dans la convention de la sphère ENTIÈRE, celle du lacet et de three.js.
    assert.ok(Math.abs(s.v - (0.5 + s.elevation / 180)) < 1e-9);
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
    assert.ok(GLSL_CIEL_FRAGMENT.includes('texture2D( uCarte, vec2( 1.0 - vUv.x, vc ) )'));
    // Et l'image ne porte que la moitié haute : l'élévation de 0 à 90° couvre toute sa hauteur.
    assert.ok(GLSL_CIEL_FRAGMENT.includes('float vc = pow( clamp( asin( clamp( dc.y, -1.0, 1.0 ) ) / 1.5707963, 0.0, 1.0 ), ' + CIEL_TOILE.toFixed(4) + ' );'));
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
    assert.equal(sphere.material.uniforms.uEtoiles.value, 0, 'des étoiles sur le ciel de jour');
    assert.equal(sphere.rotation.y, lacetDuPanorama3D({ u: 0.4, v: 0.72 }, e.soleil.direction));
    retirerCiel3D(scene);
    assert.equal(sphere.parent, null, 'le ciel est resté dans la scène partagée');
    _viderCiel3D();
  });

  test('⚠️ LA NUIT PHOTOGRAPHIÉE REÇOIT LES ÉTOILES CALCULÉES, nettes à toute taille', () => {
    // Une étoile photographiée est un point : agrandie, elle devient une tache (#436b). Le panorama
    // de nuit ne garde que sa lueur, et les points viennent du calcul.
    _viderCiel3D();
    _poserPanoramaPourTests3D('nuit', new THREE.Texture(), null);
    const sphere = poserCiel3D(new THREE.Scene(), eclairage('nuit'));
    assert.equal(sphere.material.uniforms.uPanorama.value, 1);
    assert.equal(sphere.material.uniforms.uEtoiles.value, 1);
    assert.equal(sphere.rotation.y, 0, 'sans soleil, pas de rotation');
    assert.ok(/uPanorama > 0\.5[\s\S]*cielEtoiles\( dc, 0\.0 \) \* uEtoiles[\s\S]*return;/.test(GLSL_CIEL_FRAGMENT),
      'la branche du panorama n’ajoute pas les étoiles');
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
  test('⚠️ LE JOUR DEMANDE 8K, LA NUIT 1K, ET L’OUTIL REFUSE PLUS PETIT', () => {
    // 4K agrandissait le jour 2,7 fois dans une Case de 2000 pixels (#436b). La nuit, elle, est
    // VOLONTAIREMENT réduite : ses étoiles se fondent en lueur, les points viennent du calcul.
    assert.equal(CIEL_PANORAMAS.jour.largeur, 8192);
    assert.equal(CIEL_PANORAMAS.nuit.largeur, 1024);
    assert.equal(refusDuPanorama({ largeur: 8192, hauteur: 4096 }, 8192), null);
    assert.equal(refusDuPanorama({ largeur: 16384, hauteur: 8192 }, 8192), null);
    assert.match(refusDuPanorama({ largeur: 4096, hauteur: 2048 }, 8192), /8K/);
    assert.equal(refusDuPanorama({ largeur: 4096, hauteur: 2048 }, 1024), null);
    assert.match(refusDuPanorama({ largeur: 32768, hauteur: 16384 }, 8192), /16K/);
    assert.match(refusDuPanorama({ largeur: 8192, hauteur: 8192 }, 8192), /2:1/);
    assert.ok(refusDuPanorama(null, 8192));
    assert.equal(LARGEUR_SOURCE_MAX, 16384);
  });

  test('⚠️ ON NE GARDE QUE LA MOITIÉ HAUTE, en largeur × largeur / 4', () => {
    const { rectangle, taille } = decoupeDuPanorama({ largeur: 16384, hauteur: 8192 }, 8192);
    assert.deepEqual(rectangle, { x: 0, y: 0, width: 16384, height: 4096 });
    assert.deepEqual(taille, { width: 8192, height: 2048 });
    // Le rapport est celui d'une demi-sphère équirectangulaire : 360° sur 90°.
    assert.equal(taille.width / taille.height, 360 / 90);
  });

  test('la saturation se mesure sur la seule bande qu’une Case montre, de 2 à 15°', () => {
    // Une image grise partout sauf une bande bleue saturée de 30 à 60° : rien dans la bande basse.
    const l = 64, h = 90; // une ligne par degré, la dernière à l'horizon
    const bgra = new Uint8Array(l * h * 4);
    for (let y = 0; y < h; y++) {
      const elev = 90 - (y + 0.5);
      const bleu = elev > 30 && elev < 60;
      for (let x = 0; x < l; x++) {
        const i = 4 * (y * l + x);
        bgra[i] = bleu ? 220 : 150; bgra[i + 1] = bleu ? 140 : 150; bgra[i + 2] = bleu ? 60 : 150; bgra[i + 3] = 255;
      }
    }
    assert.equal(saturationDeLaBandeBasse(bgra, l, h), 0);
    // La même bande bleue posée de 3 à 14° : la mesure la voit, au-dessus du seuil.
    for (let y = 0; y < h; y++) {
      const elev = 90 - (y + 0.5), bleu = elev > 3 && elev < 14;
      for (let x = 0; x < l; x++) { const i = 4 * (y * l + x); if (bleu) { bgra[i] = 220; bgra[i + 1] = 140; bgra[i + 2] = 60; } }
    }
    assert.ok(saturationDeLaBandeBasse(bgra, l, h) > SATURATION_BANDE_MIN);
  });

  test('⚠️ L’OUVERTURE EFFACE LES ÉTOILES ET GARDE LA LUEUR', () => {
    const l = 40, h = 20, fond = 30;
    const bgra = new Uint8Array(l * h * 4);
    const pose = (x, y, v) => { const i = 4 * (y * l + x); bgra[i] = bgra[i + 1] = bgra[i + 2] = v; bgra[i + 3] = 255; };
    for (let y = 0; y < h; y++) for (let x = 0; x < l; x++) pose(x, y, fond);
    pose(5, 5, 255); pose(6, 5, 255);                       // une étoile de deux pixels
    for (let y = 8; y < 18; y++) for (let x = 15; x < 30; x++) pose(x, y, 90); // une lueur large
    pose(0, 12, 255);                                        // une étoile SUR la couture
    for (let x = 2; x < 14; x++) pose(x, 2, 255);            // une traînée fine, horizontale
    const o = ouvertureMorphologique(bgra, l, h);
    const lit = (x, y) => o[4 * (y * l + x)];
    assert.equal(lit(5, 5), fond, 'l’étoile a survécu');
    assert.equal(lit(0, 12), fond, 'l’étoile de la couture a survécu');
    // Assez large pour passer le minimum horizontal : seul le VERTICAL l'efface. Les deux passes
    // comptent, et le haut d'un panorama, près du zénith, est fait de ces traînées étirées.
    assert.equal(lit(8, 2), fond, 'la traînée horizontale a survécu');
    assert.equal(lit(22, 12), 90, 'la lueur a été effacée');
    assert.equal(lit(15, 8), 90, 'la lueur a perdu ses bords');
    assert.equal(o[3], 255, 'l’opacité doit rester pleine');
    assert.equal(RAYON_OUVERTURE, 2);
  });

  test('le garde-fou : l’horizontale boucle, sans quoi la couture rognerait la lueur', () => {
    // Une lueur de cinq pixels, exactement la taille du carré, à cheval sur la couture : bouclée,
    // elle survit entière ; bornée aux bords, ses deux pixels de droite disparaîtraient.
    const l = 16, h = 7;
    const bgra = new Uint8Array(l * h * 4).fill(10);
    const i = (x, y) => 4 * (y * l + x);
    for (let y = 0; y < h; y++) for (const x of [l - 2, l - 1, 0, 1, 2]) bgra[i(x, y)] = 200;
    const o = ouvertureMorphologique(bgra, l, h, 2);
    for (const x of [l - 2, l - 1, 0, 1, 2]) assert.equal(o[i(x, 3)], 200, `x = ${x}`);
    assert.equal(o[i(l - 3, 3)], 10);
  });

  test('un dossier doit contenir UN seul JPEG, et le dit sinon', () => {
    assert.deepEqual(sourceUnique(['a.jpg', 'notes.txt']), { nom: 'a.jpg' });
    assert.match(sourceUnique(['a.exr']).refus, /tonemappé/);
    assert.match(sourceUnique(['a.jpg', 'b.JPEG']).refus, /un seul/);
  });
});

describe('Ciel : l’horizon descend jusqu’au bord VISIBLE du Sol (#436c)', () => {
  /**
   * Le Sol est coupé par le plan lointain de la caméra bien avant l'horizon vrai. Entre les deux,
   * on voyait le ciel SOUS l'horizon : une bande uniforme, lue comme un ciel flou et terne.
   */
  const bordDuSol = (h, f, phi, beta) => h * Math.cos(beta - phi) / Math.sin(beta) - f;

  test('⚠️ L’ABAISSEMENT EST L’ÉLÉVATION OÙ LE SOL ATTEINT LE PLAN LOINTAIN', () => {
    for (const [h, f, phi] of [[10, 70, 0.1], [1.6, 34, 0], [25, 300, 0.35], [3, 12, -0.2]]) {
      const a = abaissementDeLHorizon3D(h, f, phi);
      assert.ok(a > 0 && a < Math.PI / 2, `${h}/${f}/${phi} : ${a}`);
      assert.ok(Math.abs(bordDuSol(h, f, phi, a)) < 1e-6 * f, `le rayon abaissé n’atteint pas le plan lointain (${h}/${f})`);
    }
    // Le cas de la capture : une caméra à 10 au-dessus du sol, lointain à 70, presque à plat.
    const a = abaissementDeLHorizon3D(10, 70, 0.1) * 180 / Math.PI;
    assert.ok(a > 6 && a < 10, `${a.toFixed(1)}° : la bande observée faisait environ huit degrés`);
  });

  test('plus le lointain recule, plus l’horizon visible rejoint le vrai', () => {
    let avant = Infinity;
    for (const f of [20, 50, 100, 400, 2000]) {
      const a = abaissementDeLHorizon3D(5, f, 0);
      assert.ok(a < avant); avant = a;
    }
  });

  test('sans hauteur ni lointain utilisables, l’horizon reste le vrai', () => {
    for (const [h, f] of [[0, 50], [-3, 50], [5, 0], [NaN, 50], [5, undefined]]) {
      assert.equal(abaissementDeLHorizon3D(h, f, 0), 0, `${h}/${f}`);
    }
    // Une caméra haute et très piquée dont le lointain n'atteint pas le sol : aucun bord à rejoindre.
    assert.equal(abaissementDeLHorizon3D(50, 10, 1.2), 0);
  });

  test('⚠️ LE BORD DU SOL REÇOIT L’HORIZON DU CIEL, LE ZÉNITH RESTE LE ZÉNITH', () => {
    const a = 0.14;
    assert.ok(Math.abs(elevationDuCiel3D(-a, a)) < 1e-12);
    assert.ok(Math.abs(elevationDuCiel3D(Math.PI / 2, a) - Math.PI / 2) < 1e-12);
    assert.equal(elevationDuCiel3D(0.3, 0), 0.3, 'sans abaissement, rien ne bouge');
    // Et le GLSL calcule la même chose.
    assert.ok(GLSL_CIEL_FRAGMENT.includes('float e2 = ( e + uAbaisse ) * 1.5707963 / ( 1.5707963 + uAbaisse );'));
    assert.ok(/vec3 d = cielDirection\( normalize\( vDir \) \);/.test(GLSL_CIEL_FRAGMENT), 'le ciel calculé ignore l’abaissement');
    assert.ok(GLSL_CIEL_FRAGMENT.includes('vec3 dc = cielDirection( normalize( vDir ) );'), 'le panorama ignore l’abaissement');
  });

  test('l’abaissement posé atteint le shader, et une valeur absurde n’y entre pas', () => {
    _viderCiel3D();
    const e = resoudreEclairage3D({ mode: 'perso', azimut: 10, elevation: 30, couleur: '#FFFFFF', intensite: 1 });
    assert.equal(poserCiel3D(new THREE.Scene(), e, null, 0.12).material.uniforms.uAbaisse.value, 0.12);
    assert.equal(poserCiel3D(new THREE.Scene(), e, null, NaN).material.uniforms.uAbaisse.value, 0);
    // Un abaissement négatif RELÈVERAIT l'horizon au-dessus du Sol, et rouvrirait la bande vide.
    assert.equal(poserCiel3D(new THREE.Scene(), e, null, -0.2).material.uniforms.uAbaisse.value, 0);
    assert.equal(poserCiel3D(new THREE.Scene(), e).material.uniforms.uAbaisse.value, 0);
    _viderCiel3D();
  });

  test('⚠️ LE RENDU D’UNE CASE CALCULE L’ABAISSEMENT DEPUIS SA CAMÉRA ET SON SOL', () => {
    const scene = readFileSync(join(RACINE, 'src', 'scene3d.js'), 'utf8');
    assert.ok(scene.includes('abaissementDeLHorizon3D(personaCamera3D.position.y - groundMesh3D.position.y,'));
    assert.ok(scene.includes('personaCamera3D.far, Math.asin('));
    assert.ok(scene.includes('if (groundMesh3D && groundMesh3D.visible) {'), 'sans Sol, l’horizon doit rester le vrai');
    assert.ok(scene.includes('() => { if (_drawCurrentPage) _drawCurrentPage(); }, _abaisseCiel);'));
  });
});

describe('Ciel : l’horizon terne d’une photo (#436d)', () => {
  test('⚠️ LA TOILE EST ABAISSÉE : le bas du champ lit l’image plus haut qu’il n’est', () => {
    // 0,7 fait lire à 10° affichés l'image à 19°, là où le bleu et les nuages commencent.
    assert.equal(CIEL_TOILE, 0.7);
    assert.ok(Math.abs(90 * Math.pow(10 / 90, CIEL_TOILE) - 19.0) < 0.5);
    assert.ok(/pow\( clamp\( asin[\s\S]*\), 0\.7000 \);/.test(GLSL_CIEL_FRAGMENT));
  });

  test('la brume est la moyenne des trois degrés les plus bas, et d’eux seuls', () => {
    const l = 8, h = 90;
    const px = new Uint8Array(l * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < l; x++) {
      const i = 4 * (y * l + x), bas = y >= h - 3;
      px[i] = bas ? 200 : 20; px[i + 1] = bas ? 210 : 60; px[i + 2] = bas ? 220 : 160; px[i + 3] = 255;
    }
    const b = brumeDuPanorama3D(px, l, h);
    assert.deepEqual(b.map(v => Math.round(v * 255)), [200, 210, 220]);
  });

  test('⚠️ LE JOUR SE DÉSEMBRUME, LA NUIT NON, ET JAMAIS SANS BRUME MESURÉE', () => {
    _viderCiel3D();
    _poserPanoramaPourTests3D('jour', new THREE.Texture(), null, [0.62, 0.67, 0.69]);
    let u = poserCiel3D(new THREE.Scene(), resoudreEclairage3D({ mode: 'jour' })).material.uniforms;
    assert.equal(u.uDesembrume.value, CIEL_PANORAMAS.jour.desembrume);
    assert.ok(u.uDesembrume.value > 0);
    assert.ok(Math.abs(u.uBrume.value.g - 0.67) < 1e-6);
    _viderCiel3D();
    _poserPanoramaPourTests3D('jour', new THREE.Texture(), null, null);
    u = poserCiel3D(new THREE.Scene(), resoudreEclairage3D({ mode: 'jour' })).material.uniforms;
    assert.equal(u.uDesembrume.value, 0, 'retirer une brume inconnue, c’est deviner');
    _viderCiel3D();
    _poserPanoramaPourTests3D('nuit', new THREE.Texture(), null, [0.1, 0.1, 0.12]);
    u = poserCiel3D(new THREE.Scene(), resoudreEclairage3D({ mode: 'nuit' })).material.uniforms;
    assert.equal(u.uDesembrume.value, 0, 'la brume de la nuit est le noir : la retirer assombrirait l’horizon');
    _viderCiel3D();
  });

  test('⚠️ LE DÉSEMBRUMAGE ÉPARGNE LES ZONES CLAIRES, sans quoi le ciel face au soleil brûle', () => {
    assert.ok(GLSL_CIEL_FRAGMENT.includes('float garde = 1.0 - pow( clamp( ( l0 - 0.7200 ) / 0.25, 0.0, 1.0 ), 2.0 );'));
    assert.ok(/float w = uDesembrume \* clamp\( 1\.0 - vc \* 90\.0 \/ 35\.0, 0\.0, 1\.0 \) \* garde;/.test(GLSL_CIEL_FRAGMENT));
  });

  test('le ciel calculé est moins délavé à l’horizon qu’avant #436d', () => {
    assert.ok(CIEL_HORIZON_BLANC <= 0.3);
  });
});
