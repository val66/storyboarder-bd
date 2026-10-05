/**
 * tests/perf-probe.test.mjs, la sonde de performance (#438), tenue aux quatre exigences que
 * docs/en/rendering-performance.md lui a fixées en retirant la première.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import {
  demarrer, arreter, rapport, sondeDebut, sondeFin, sondeCompter, sondeImageDebut, sondeImageFin,
  quantile, IMAGE_LENTE_MS, synthese,
} from '../src/perf-probe.js';

describe('La sonde de performance', () => {
  test('⚠️ ÉTEINTE PAR DÉFAUT, ELLE NE MESURE RIEN, ET SON RAPPORT DIT POURQUOI', () => {
    arreter();
    assert.equal(sondeDebut(), 0);
    sondeFin('x', sondeDebut());
    const r = rapport();
    assert.equal(typeof r, 'string');
    assert.match(r, /jamais démarrée|aucune image/);
  });

  test('allumée, elle agrège ; et un rapport vide dit « active, rien dessiné »', () => {
    demarrer();
    assert.match(rapport(), /active, mais aucune image/);
    const t = sondeDebut();
    assert.ok(t > 0);
    sondeFin('travail', t);
    sondeCompter('événement', 3);
    const r = rapport();
    assert.equal(r.mesures.travail.appels, 1);
    assert.equal(r.mesures['événement'].appels, 3);
    arreter();
  });

  test('⚠️ LES COMPTES ET LES TOTAUX SONT EXACTS AU-DELÀ DE L’ÉCHANTILLON BORNÉ', () => {
    // La première sonde sommait sur l'échantillon plafonné : une part sous-estimée d'un facteur 4.
    demarrer();
    for (let i = 0; i < 9000; i++) sondeFin('beaucoup', performance.now() - 1);
    const m = rapport().mesures.beaucoup;
    assert.equal(m.appels, 9000);
    assert.ok(m['total ms'] >= 9000 * 0.99, `total ${m['total ms']}`);
    arreter();
  });

  test('⚠️ ELLE COMPTE LES PROGRAMMES DE SHADER NEUFS, recompilations comprises', () => {
    // Une recompilation garde le même nombre de programmes mais crée un objet neuf (#437c).
    const ancien = {};
    const renderer = { info: { programs: [ancien] } };
    demarrer(renderer);
    let t = sondeImageDebut();
    sondeImageFin(t, renderer);
    assert.equal(rapport().mesures['programmes compilés'], undefined, 'un programme d’avant la séance a compté');
    renderer.info.programs = [{}];
    t = sondeImageDebut();
    sondeImageFin(t, renderer);
    assert.equal(rapport().mesures['programmes compilés'].appels, 1);
    arreter();
  });

  test('une image lente est gardée avec ce qui s’y est passé', () => {
    demarrer();
    const t = sondeImageDebut();
    sondeFin('signature', performance.now() - 5);
    sondeImageFin(t - IMAGE_LENTE_MS - 1, null);
    const lentes = rapport().images_lentes;
    assert.equal(lentes.length, 1);
    assert.ok(lentes[0].ms >= IMAGE_LENTE_MS);
    assert.ok(lentes[0].signature >= 4);
    arreter();
  });

  test('les quantiles', () => {
    assert.equal(quantile([], 0.5), 0);
    assert.equal(quantile([3, 1, 2], 0.5), 2);
    assert.equal(quantile([1, 2, 3, 4, 100], 0.95), 100);
  });
  test('⚠️ LA SYNTHÈSE TIENT SUR UNE LIGNE, et porte comptes, médiane, p95, max et images lentes', () => {
    demarrer();
    sondeFin('travail', performance.now() - 2);
    sondeCompter('événement', 4);
    const t = sondeImageDebut();
    sondeImageFin(t - IMAGE_LENTE_MS - 1, null);
    const l = synthese();
    assert.ok(!l.includes('\n'), 'la synthèse tient sur plusieurs lignes');
    assert.match(l, /^sonde [\d.]+s \| /);
    assert.match(l, /travail 1× [\d.]+\/[\d.]+\/[\d.]+/);
    assert.match(l, /événement 4×/);
    assert.match(l, /lentes\(ms\) \d/);
    arreter();
    assert.match(synthese('jamais démarrée'), /jamais/);
  });
});

describe('Le rendu ne parcourt plus les rigs masqués des autres Cases (#438)', () => {
  test('⚠️ LES ENFANTS MASQUÉS SORTENT DE L’ARBRE, PUIS REVIENNENT DANS LE MÊME ORDRE', async () => {
    await import('./helpers/dom-stub.mjs');
    const THREE = globalThis.THREE;
    const { sansLesEnfantsMasques3D } = await import('../src/scene3d.js');
    const scene = new THREE.Scene();
    const a = new THREE.Group(), b = new THREE.Group(), c = new THREE.Group();
    b.visible = false;
    b.add(new THREE.Mesh(), new THREE.Mesh());
    scene.add(a, b, c);
    const avant = [...scene.children];
    const restaurer = sansLesEnfantsMasques3D(scene);
    assert.equal(restaurer.ecartes, 1);
    let parcourus = 0;
    scene.traverse(() => { parcourus++; });
    assert.equal(parcourus, 3, 'la scène et ses deux enfants visibles, rien du rig masqué');
    restaurer();
    assert.deepEqual(scene.children, avant, 'l’ordre des enfants a changé');
    assert.equal(b.parent, scene, 'le parent du rig écarté a été touché');
  });

  test('sans enfant masqué, rien n’est échangé', async () => {
    const THREE = globalThis.THREE;
    const { sansLesEnfantsMasques3D } = await import('../src/scene3d.js');
    const scene = new THREE.Scene(); scene.add(new THREE.Group());
    const tableau = scene.children;
    const r = sansLesEnfantsMasques3D(scene);
    assert.equal(r.ecartes, 0);
    assert.equal(scene.children, tableau);
    assert.equal(sansLesEnfantsMasques3D(null).ecartes, 0);
  });

  test('⚠️ LE RENDU D’UNE CASE REMET L’ARBRE MÊME SI LE RENDU LÈVE', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../src/scene3d.js', import.meta.url), 'utf8');
    assert.ok(/const _restaurerArbre = sansLesEnfantsMasques3D\(personaScene3D\);[\s\S]*try \{\s*personaRenderer3D\.render\(personaScene3D, personaCamera3D\);\s*\} finally \{\s*_restaurerArbre\(\);/.test(src));
  });
});
