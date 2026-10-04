/**
 * tests/sky-3d.test.mjs, le ciel d'une Case (#436) : entièrement calculé, pour les trois modes.
 *
 * Le GLSL ne s'exécute pas sous Node ; il a été compilé et rendu dans un vrai WebGL (three r128),
 * et son rendu jugé sur planche avant d'être retenu. Ce qui est tenu ici est tout ce qui DÉCIDE :
 * les couleurs, le degré de nuit, la couverture, l'horizon abaissé, la direction du disque, et le
 * fil qui amène le ciel jusqu'au rendu d'une Case.
 */
import './helpers/dom-stub.mjs';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  couleursDuCielCalcule3D, CIEL_HORIZON_BLANC, nuitDuCiel3D, NUIT_PLEINE, couvertureNuageuse3D,
  NUAGES_JOUR, NUAGES_NUIT, NUAGES, abaissementDeLHorizon3D, elevationDuCiel3D,
  GLSL_CIEL_SOMMET, GLSL_CIEL_FRAGMENT, poserCiel3D, retirerCiel3D, _viderCiel3D,
} from '../src/sky-3d.js';
import { resoudreEclairage3D, CLE_ACTUELLE, PRESETS_LUMIERE } from '../src/lighting-3d.js';

const THREE = globalThis.THREE;
const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const eclairage = (lumiere) => resoudreEclairage3D(lumiere);

describe('Ciel : les couleurs', () => {
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

  test('l’horizon n’est délavé que d’un quart, il était jugé terne à près de moitié (#436d)', () => {
    assert.ok(CIEL_HORIZON_BLANC <= 0.3);
  });

  test('⚠️ LA NUIT EST PLUS SOMBRE QUE SA COULEUR, ET SON HORIZON N’EST PRESQUE PAS DÉLAVÉ (#436f)', () => {
    const jour = couleursDuCielCalcule3D('#131D33', 0), nuit = couleursDuCielCalcule3D('#131D33', 1);
    const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    assert.ok(lum(nuit.horizon) < 0.5 * lum(jour.horizon), 'l’horizon de nuit tournait au gris-bleu');
    assert.ok(lum(nuit.zenith) < lum(jour.zenith));
    // Sans nuit, rien ne change : le Jour garde ses couleurs.
    assert.deepEqual(couleursDuCielCalcule3D('#8FCEF3'), couleursDuCielCalcule3D('#8FCEF3', 0));
  });

  test('le ciel posé reçoit les couleurs de SA nuit', () => {
    _viderCiel3D();
    const e = eclairage({ mode: 'nuit' });
    const u = poserCiel3D(new THREE.Scene(), e).material.uniforms;
    const { horizon } = couleursDuCielCalcule3D(e.ciel, 1);
    assert.ok(Math.abs(u.uHorizon.value.g - horizon[1]) < 1e-6);
    _viderCiel3D();
  });
});

describe('Ciel : le jour, la nuit, et entre les deux', () => {
  test('⚠️ LE MODE NUIT EST UNE PLEINE NUIT, LE MODE JOUR UN PLEIN JOUR', () => {
    const relative = (mode) => eclairage({ mode }).soleil.intensite / CLE_ACTUELLE;
    assert.equal(nuitDuCiel3D(relative('jour')), 0);
    assert.equal(nuitDuCiel3D(relative('nuit')), 1);
    // Ce n'est pas un hasard de réglage : la rampe s'achève juste au-dessus du soleil de Nuit.
    assert.ok(PRESETS_LUMIERE.nuit.intensite <= NUIT_PLEINE);
  });

  test('un Personnalisé assombri glisse vers la même nuit, sans retour en arrière', () => {
    let avant = -1;
    for (let i = 1; i >= -0.0001; i -= 0.05) {
      const n = nuitDuCiel3D(i);
      assert.ok(n >= avant, `la nuit recule à ${i}`);
      avant = n;
    }
    assert.equal(nuitDuCiel3D(NaN), 0);
  });

  test('la nuit raréfie les nuages pour laisser voir les étoiles', () => {
    assert.equal(couvertureNuageuse3D(0), NUAGES_JOUR);
    assert.equal(couvertureNuageuse3D(1), NUAGES_NUIT);
    assert.ok(NUAGES_NUIT < NUAGES_JOUR);
    assert.equal(couvertureNuageuse3D('n’importe'), NUAGES_JOUR);
  });
});

describe('Ciel : posé pour le rendu, retiré après', () => {
  test('⚠️ LE CIEL REÇOIT LA DIRECTION ET LA COULEUR DE LA LUMIÈRE DE LA SCÈNE', () => {
    _viderCiel3D();
    const e = eclairage({ mode: 'perso', azimut: 95, elevation: 6, couleur: '#FF9A5A', intensite: 0.8 });
    const scene = new THREE.Scene();
    const sphere = poserCiel3D(scene, e);
    const u = sphere.material.uniforms;
    assert.equal(sphere.parent, scene);
    assert.ok(Math.abs(u.uSoleilDir.value.x - e.soleil.direction.x) < 1e-9);
    assert.ok(Math.abs(u.uSoleilDir.value.y - e.soleil.direction.y) < 1e-9);
    assert.ok(Math.abs(u.uSoleilDir.value.z - e.soleil.direction.z) < 1e-9);
    assert.equal(u.uSoleilCoul.value.getHex(), 0xFF9A5A);
    const { zenith } = couleursDuCielCalcule3D(e.ciel);
    assert.ok(Math.abs(u.uZenith.value.r - zenith[0]) < 1e-6 && Math.abs(u.uZenith.value.b - zenith[2]) < 1e-6);
    retirerCiel3D(scene);
    assert.equal(sphere.parent, null, 'le ciel est resté dans la scène partagée');
    _viderCiel3D();
  });

  test('⚠️ EN MODE NUIT, LE CIEL EST UNE NUIT : lune, étoiles, nuages raréfiés', () => {
    _viderCiel3D();
    const u = poserCiel3D(new THREE.Scene(), eclairage({ mode: 'nuit' })).material.uniforms;
    assert.equal(u.uNuit.value, 1);
    assert.equal(u.uNuages.value, NUAGES_NUIT);
    const j = poserCiel3D(new THREE.Scene(), eclairage({ mode: 'jour' })).material.uniforms;
    assert.equal(j.uNuit.value, 0);
    assert.equal(j.uNuages.value, NUAGES_JOUR);
    _viderCiel3D();
  });

  test('le ciel ne se découpe pas, s’affiche au plan lointain, et demande les dérivées', () => {
    _viderCiel3D();
    const s = poserCiel3D(new THREE.Scene(), eclairage({ mode: 'jour' }));
    assert.equal(s.castShadow, false);
    assert.equal(s.frustumCulled, false);
    assert.equal(s.material.depthWrite, false);
    assert.equal(s.material.extensions.derivatives, true, 'sans elles, WebGL 1 ne compile pas le ciel');
    assert.ok(GLSL_CIEL_SOMMET.includes('gl_Position = p.xyww;'));
    _viderCiel3D();
  });
});

describe('Ciel : le GLSL', () => {
  test('⚠️ LE DISQUE EST DANS LA VRAIE DIRECTION DE LA LUMIÈRE, pas dans la direction déformée', () => {
    // L'horizon abaissé déforme les élévations ; y dessiner le disque l'aurait décalé de l'ombre
    // qu'il porte. On vérifie qu'il se mesure sur `vrai`, la direction non déformée.
    assert.ok(GLSL_CIEL_FRAGMENT.includes('float ang = acos( clamp( dot( vrai, L ), -1.0, 1.0 ) );'));
    assert.ok(GLSL_CIEL_FRAGMENT.includes('vec3 vrai = normalize( vDir );'));
    assert.ok(GLSL_CIEL_FRAGMENT.includes('vec3 d = cielDirection( vrai );'));
  });

  test('⚠️ CHAQUE OCTAVE S’EFFACE SOUS TROIS PIXELS : net, ou absent, jamais agrandi', () => {
    assert.ok(GLSL_CIEL_FRAGMENT.includes('return clamp( ( 1.0 / ( freq * e ) - 3.0 ) / 3.0, 0.0, 1.0 );'));
    assert.ok(GLSL_CIEL_FRAGMENT.includes('float e = max( length( dFdx( p ) ), length( dFdy( p ) ) ) + 1e-5;'));
    // Toutes les familles de bruit passent par ce poids.
    for (const f of ['cielFbm3', 'cielFbm5']) {
      const corps = GLSL_CIEL_FRAGMENT.slice(GLSL_CIEL_FRAGMENT.indexOf('float ' + f + '('));
      assert.ok(corps.slice(0, corps.indexOf('return')).includes('cielPoids( fr, e )'), f);
    }
    // Et les deux semis de bosses fines, qui scintilleraient sinon au loin.
    assert.ok(GLSL_CIEL_FRAGMENT.includes('cielWorley( q2 * 2.3 + vec2( 7.1, 2.9 ) ), cielPoids( 2.3, e ) );'));
    assert.ok(GLSL_CIEL_FRAGMENT.includes('cielWorley( q2 * 5.0 + vec2( 1.3, 5.5 ) ), cielPoids( 5.0, e ) );'));
  });

  test('les réglages des nuages sont ceux du registre, pas des nombres cachés dans le GLSL', () => {
    const f4 = (x) => x.toFixed(4);
    assert.ok(GLSL_CIEL_FRAGMENT.includes(`d.xz / ( d.y + ${f4(NUAGES.plafond)} ) * ${f4(NUAGES.echelle)}`));
    assert.ok(GLSL_CIEL_FRAGMENT.includes(`smoothstep( seuil, seuil + ${f4(NUAGES.bord)}, n )`));
    assert.ok(GLSL_CIEL_FRAGMENT.includes(`exp( -opt * ${f4(NUAGES.absorption)} )`));
    assert.ok(GLSL_CIEL_FRAGMENT.includes(`vs * ${f4(NUAGES.pas)} * float( j )`));
  });

  test('⚠️ LA COULEUR DE LA LUMIÈRE TEINTE LES NUAGES, ombre comprise (#436f)', () => {
    // Ils ne la recevaient qu'au quart, sur un gris fixe : un couchant laissait des nuages blancs.
    assert.ok(GLSL_CIEL_FRAGMENT.includes('vec3 teinte = mix( vec3( 1.0 ), uSoleilCoul, 0.6 );'));
    assert.ok(GLSL_CIEL_FRAGMENT.includes('vec3 ombre = mix( cielMoyen * 0.70 + teinte * 0.25,'));
    assert.ok(GLSL_CIEL_FRAGMENT.includes('vec3 eclaire = mix( teinte * 0.97,'));
  });

  test('le jour est moins chargé et ses bords plus nets qu’à l’intégration (#436f)', () => {
    // Recalé en #436g pour les nuages ronds, dont la forme se répartit autrement.
    assert.ok(NUAGES_JOUR <= 0.38);
    assert.ok(NUAGES.bord <= 0.05);
  });

  test('⚠️ LES NUAGES SONT DES GRAPPES DE BOSSES RONDES, plus un bruit étiré (#436g)', () => {
    assert.ok(GLSL_CIEL_FRAGMENT.includes('float cielWorley( vec2 p ) {'));
    assert.ok(GLSL_CIEL_FRAGMENT.includes('float p1 = 1.0 - cielWorley( q2 * 0.8 );'));
    assert.ok(!GLSL_CIEL_FRAGMENT.includes('cielVolutes'), 'l’ancienne forme étirée est revenue');
  });

  test('les étoiles ne brillent que la nuit, et pas à travers les nuages', () => {
    assert.ok(GLSL_CIEL_FRAGMENT.includes('cielEtoiles( d ) * uNuit * ( 1.0 - a )'));
  });
});

describe('Ciel : l’horizon descend jusqu’au bord VISIBLE du Sol (#436c)', () => {
  const bordDuSol = (h, f, phi, beta) => h * Math.cos(beta - phi) / Math.sin(beta) - f;

  test('⚠️ L’ABAISSEMENT EST L’ÉLÉVATION OÙ LE SOL ATTEINT LE PLAN LOINTAIN', () => {
    for (const [h, f, phi] of [[10, 70, 0.1], [1.6, 34, 0], [25, 300, 0.35], [3, 12, -0.2]]) {
      const a = abaissementDeLHorizon3D(h, f, phi);
      assert.ok(a > 0 && a < Math.PI / 2, `${h}/${f}/${phi} : ${a}`);
      assert.ok(Math.abs(bordDuSol(h, f, phi, a)) < 1e-6 * f, `le rayon abaissé n’atteint pas le plan lointain (${h}/${f})`);
    }
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
    assert.equal(abaissementDeLHorizon3D(50, 10, 1.2), 0);
  });

  test('⚠️ LE BORD DU SOL REÇOIT L’HORIZON DU CIEL, LE ZÉNITH RESTE LE ZÉNITH', () => {
    const a = 0.14;
    assert.ok(Math.abs(elevationDuCiel3D(-a, a)) < 1e-12);
    assert.ok(Math.abs(elevationDuCiel3D(Math.PI / 2, a) - Math.PI / 2) < 1e-12);
    assert.equal(elevationDuCiel3D(0.3, 0), 0.3);
    assert.ok(GLSL_CIEL_FRAGMENT.includes('float e2 = ( e + uAbaisse ) * 1.5707963 / ( 1.5707963 + uAbaisse );'));
  });

  test('l’abaissement posé atteint le shader, et une valeur absurde n’y entre pas', () => {
    _viderCiel3D();
    const e = eclairage({ mode: 'jour' });
    assert.equal(poserCiel3D(new THREE.Scene(), e, 0.12).material.uniforms.uAbaisse.value, 0.12);
    assert.equal(poserCiel3D(new THREE.Scene(), e, NaN).material.uniforms.uAbaisse.value, 0);
    // Un abaissement négatif RELÈVERAIT l'horizon au-dessus du Sol, et rouvrirait la bande vide.
    assert.equal(poserCiel3D(new THREE.Scene(), e, -0.2).material.uniforms.uAbaisse.value, 0);
    assert.equal(poserCiel3D(new THREE.Scene(), e).material.uniforms.uAbaisse.value, 0);
    _viderCiel3D();
  });
});

describe('Ciel : le fil jusqu’au rendu d’une Case', () => {
  const scene = readFileSync(join(RACINE, 'src', 'scene3d.js'), 'utf8');

  test('⚠️ LE CIEL SE POSE APRÈS LE MARQUAGE DES OMBRES ET SE RETIRE APRÈS LE RENDU', () => {
    // Posé avant `marquerProjectionDOmbre3D`, il recevrait `castShadow` et ombrerait toute la scène.
    const i = (s) => { const n = scene.indexOf(s); assert.ok(n >= 0, s); return n; };
    const marque = i('if (_ombresDeLaCase) marquerProjectionDOmbre3D();');
    const pose = i('poserCiel3D(personaScene3D, _eclairage, _abaisseCiel);');
    const rendu = scene.indexOf('personaRenderer3D.render(personaScene3D, personaCamera3D);', pose);
    const retrait = i('retirerCiel3D(personaScene3D);');
    assert.ok(marque < pose && pose < rendu && rendu < retrait);
  });

  test('⚠️ LE RENDU D’UNE CASE CALCULE L’ABAISSEMENT DEPUIS SA CAMÉRA ET SON SOL', () => {
    assert.ok(scene.includes('abaissementDeLHorizon3D(personaCamera3D.position.y - groundMesh3D.position.y,'));
    assert.ok(scene.includes('personaCamera3D.far, Math.asin('));
    assert.ok(scene.includes('if (groundMesh3D && groundMesh3D.visible) {'), 'sans Sol, l’horizon doit rester le vrai');
  });

  test('plus aucun panorama n’est livré : le ciel ne dépend d’aucun fichier', () => {
    for (const f of ['ciel-jour.jpg', 'ciel-nuit.jpg']) {
      assert.equal(existsSync(join(RACINE, 'assets', 'textures', f)), false, f);
    }
  });
});
