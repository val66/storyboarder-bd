/**
 * tests/store-apercu-3d.test.mjs, l'aperçu 3D local du store (#445, Poly Haven).
 *
 * Le dessin lui-même demande WebGL, absent sous Node : on tient ici ce qui DÉCIDE (cadrage, orbite,
 * zoom, la mémoire bornée des modèles chargés) et, par lecture du source, les gardes qui empêchent
 * une réponse en retard de s'afficher dans une fiche qu'on a quittée.
 */
import './helpers/dom-stub.mjs';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { memoireBornee } = require('../store-sources.js');
const { cadrage3D, orbite3D, zoom3D, positionCamera3D } = await import('../src/store-apercu-3d.js');
const sans = (s) => s.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
const lire = (f) => sans(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'));

describe('Cadrer et tourner', () => {
  test('le cadrage vise le centre de la boîte, et la fait tenir dans le champ', () => {
    const { centre, rayon, distance } = cadrage3D([-1, 0, -1], [1, 2, 1], 35);
    assert.deepEqual(centre, [0, 1, 0]);
    assert.ok(Math.abs(rayon - Math.sqrt(3)) < 1e-9);
    const v = (35 * Math.PI / 180) / 2;
    assert.ok((distance - 1) * Math.tan(v) >= 1, 'la hauteur déborde du champ');
  });
  test('un personnage haut et fin se cadre sur sa boîte, un peu plus près que sur sa sphère', () => {
    const boite = cadrage3D([-0.2, 0, -0.1], [0.2, 1.8, 0.1], 35).distance;
    const sphere = (Math.hypot(0.4, 1.8, 0.2) / 2) / Math.sin((35 * Math.PI / 180) / 2) * 1.1;
    assert.ok(boite < sphere, `${boite} contre ${sphere}`);
  });
  test('une image large laisse de la place en largeur : une voiture se cadre plus près en 16:9', () => {
    const voiture = [[-2.2, 0, -1], [2.2, 1.5, 1]];
    assert.ok(cadrage3D(...voiture, 35, 16 / 9).distance < cadrage3D(...voiture, 35, 1).distance);
  });
  test('une boîte vide ne donne pas une distance nulle', () => {
    assert.ok(cadrage3D([0, 0, 0], [0, 0, 0]).distance > 0);
  });
  test('l\'orbite ne passe ni dessus ni dessous le modèle', () => {
    assert.ok(orbite3D({ lacet: 0, tangage: 0 }, 0, 100000).tangage <= 1.4);
    assert.ok(orbite3D({ lacet: 0, tangage: 0 }, 0, -100000).tangage >= -1.4);
    assert.notEqual(orbite3D({ lacet: 0, tangage: 0 }, 50, 0).lacet, 0, 'le glisser horizontal ne fait pas tourner');
  });
  test('le zoom reste entre un quart et quatre fois le cadrage', () => {
    assert.equal(zoom3D(10, -1e6, 10), 2.5);
    assert.equal(zoom3D(10, 1e6, 10), 40);
    assert.ok(zoom3D(10, -100, 10) < 10, 'la molette vers l\'avant n\'approche pas');
  });
  test('la caméra est à la bonne distance de la cible, sous tous les angles', () => {
    const p = positionCamera3D([1, 2, 3], 5, { lacet: 0.7, tangage: 0.3 });
    assert.ok(Math.abs(Math.hypot(p[0] - 1, p[1] - 2, p[2] - 3) - 5) < 1e-9);
  });
});

describe('La mémoire des modèles chargés pendant la session', () => {
  test('bornée en nombre : la moins récemment consultée part la première', () => {
    const m = memoireBornee(2, 1000);
    m.set('a', [1]); m.set('b', [1]);
    m.get('a');            // « a » redevient la plus récente
    m.set('c', [1]);
    assert.equal(m.get('b'), null, 'la plus ancienne aurait dû partir');
    assert.ok(m.get('a') && m.get('c'));
  });
  test('bornée en octets, et un modèle trop gros à lui seul n\'est pas gardé', () => {
    const m = memoireBornee(10, 10);
    m.set('a', new Uint8Array(6)); m.set('b', new Uint8Array(6));
    assert.equal(m.get('a'), null);
    assert.equal(m.taille.octets, 6);
    m.set('gros', new Uint8Array(11));
    assert.equal(m.get('gros'), null);
  });
});

describe('Le câblage', () => {
  const STORE = lire('store.js');
  const UI = lire('src/store-ui.js');
  test('l\'aperçu et le téléchargement partagent la mémoire : « Télécharger » juste après ne refait pas le réseau', () => {
    const f = STORE.slice(STORE.indexOf('async function telecharger('));
    assert.ok(f.indexOf('recents.get(') < f.indexOf('lireJson(url)'), 'la mémoire n\'est pas consultée avant le réseau');
    assert.match(f, /recents\.set\(`\$\{sourceId\}:\$\{id\}:\$\{plan\.resolution\}`, glb\);/);
    assert.match(STORE, /function apercu\(sourceId, id, progression, simulation\)\{\n\s+return telecharger\(sourceId, id, polyhaven\.RESOLUTION, progression, simulation\);/);
  });
  test('⚠️ l\'aperçu n\'est JAMAIS rangé dans le dossier Modeles', () => {
    const f = UI.slice(UI.indexOf('function boutonApercuLocal'), UI.indexOf('function progressionApercu'));
    assert.doesNotMatch(f, /rangerModele|remplacerModele|writeModelFile/);
  });
  test('une réponse en retard ne s\'affiche pas dans une fiche quittée, ni après un retour à l\'image', () => {
    const f = UI.slice(UI.indexOf('function boutonApercuLocal'), UI.indexOf('function progressionApercu'));
    assert.match(f, /if \(moi !== apercuGeneration\) return;/);
    assert.match(f, /if \(moi !== apercuGeneration\) \{ v\.fermer\(\); return; \}/);
    assert.match(UI, /function fermerFiche\(\)\{\n\s+ficheCourante = null;\n\s+fermerApercuLocal\(\);/);
  });
  test('⚠️ vignettes et aperçu cadrent sur la boîte qui SUIT LE SQUELETTE (Hulk, worker_j décentrés)', () => {
    for (const f of ['src/model-thumbnails.js', 'src/store-apercu-3d.js']) {
      const s = lire(f);
      assert.match(s, /box3FromObjectSkinAware3D\(modele\)/, f);
      assert.doesNotMatch(s, /setFromObject\(/, `${f} : la géométrie brute d'un modèle articulé décentre le cadrage`);
      assert.match(s, /n\.frustumCulled = false/, f);
    }
  });
  test('la visionneuse libère la carte graphique en se fermant', () => {
    const v = lire('src/store-apercu-3d.js');
    assert.match(v, /rendu\.dispose\(\);/);
    assert.match(v, /m\.dispose\(\);/);
    assert.match(v, /n\.geometry\.dispose\(\)/);
  });
});
