/**
 * tests/vignettes-modeles.test.mjs, les vignettes des modèles locaux : ce qui DÉCIDE (signature, à
 * refaire, suivi des renommages), et le câblage de main.js qui les écrit, les déplace et les efface.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const v = require('../vignettes-modeles.js');
const sans = (s) => s.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
const MAIN = sans(readFileSync(new URL('../main.js', import.meta.url), 'utf8'));

describe('Ce qui décide', () => {
  test('la signature change avec la taille OU la date du fichier', () => {
    assert.equal(v.signatureFichier({ size: 10, mtimeMs: 1000.4 }), '10-1000');
    assert.notEqual(v.signatureFichier({ size: 10, mtimeMs: 1000 }), v.signatureFichier({ size: 11, mtimeMs: 1000 }));
    assert.notEqual(v.signatureFichier({ size: 10, mtimeMs: 1000 }), v.signatureFichier({ size: 10, mtimeMs: 2000 }));
    assert.equal(v.signatureFichier(null), null);
  });
  test('à refaire : absente, ou faite pour un autre état du fichier', () => {
    const i = v.noter(null, 'a.glb', '10-1');
    assert.equal(v.aRefaire(i, 'a.glb', '10-1'), false);
    assert.equal(v.aRefaire(i, 'a.glb', '12-1'), true, 'un modèle remplacé garderait sa vieille photo');
    assert.equal(v.aRefaire(i, 'b.glb', '10-1'), true);
    assert.deepEqual(v.aGenerer(i, [{ nom: 'a.glb', signature: '10-1' }, { nom: 'b.glb', signature: '5-5' }]).map(f => f.nom), ['b.glb']);
  });
  test('renommer fait suivre, oublier efface, et l\'original n\'est jamais modifié', () => {
    const i = v.noter(null, 'a.glb', 's', 'source');
    const r = v.renommer(i, 'a.glb', 'b.glb');
    assert.deepEqual(r.vignettes, { 'b.glb': { signature: 's', origine: 'source' } });
    assert.deepEqual(v.oublier(r, 'b.glb').vignettes, {});
    assert.ok(i.vignettes['a.glb'], 'l\'index d\'origine a été modifié');
  });
  test('le format se reconnaît aux premiers octets : PNG, JPEG, WebP ; rien d\'autre', () => {
    assert.equal(v.typeImage([0x89, 0x50, 0x4E, 0x47]), 'image/png');
    assert.equal(v.typeImage([0xFF, 0xD8, 0xFF, 0xE0]), 'image/jpeg');
    assert.equal(v.typeImage([...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBP')]), 'image/webp');
    assert.equal(v.typeImage(Buffer.from('<svg')), null);
  });
  test('la vignette vit à côté de Modeles, pas dedans, et son nom ne ressemble pas à un modèle', () => {
    assert.equal(v.DOSSIER, 'Vignettes-modeles');
    assert.doesNotMatch(v.nomVignette('a.glb'), /\.glb$/);
  });
});

describe('Version du rendu et mesures', () => {
  test('une vignette RENDUE par une version précédente est à refaire ; celle d\'une source, jamais', () => {
    const vieux = { vignettes: { 'a.glb': { signature: 's', origine: 'rendu' }, 'b.glb': { signature: 's', origine: 'source' } } };
    assert.equal(v.aRefaire(vieux, 'a.glb', 's'), true, 'les photos décentrées de la version 1 resteraient');
    assert.equal(v.aRefaire(vieux, 'b.glb', 's'), false, 'la vignette de la source serait remplacée par notre rendu');
    assert.equal(v.aRefaire(v.noter(null, 'a.glb', 's'), 'a.glb', 's'), false);
  });
  test('les mesures sont nettoyées : trois nombres positifs, des noms de nœuds bornés', () => {
    const i = v.noter(null, 'a.glb', 's', 'rendu', { dimensions: [1.23456, 2, 3], noms: ['x'.repeat(100), 3], autre: 'non' });
    assert.deepEqual(i.vignettes['a.glb'].dimensions, [1.235, 2, 3]);
    assert.equal(i.vignettes['a.glb'].noms.length, 1);
    assert.equal(i.vignettes['a.glb'].noms[0].length, 60);
    assert.equal(i.vignettes['a.glb'].autre, undefined);
    assert.equal(v.noter(null, 'b.glb', 's', 'rendu', { dimensions: [1, -2, 3] }).vignettes['b.glb'].dimensions, undefined);
  });
  test('une vignette de source sans dimensions est à MESURER, pas à refaire', () => {
    const i = v.noter(null, 'a.glb', 's', 'source');
    assert.deepEqual(v.aMesurer(i, [{ nom: 'a.glb', signature: 's' }]).map(f => f.nom), ['a.glb']);
    const mesuree = v.noterMesures(i, 'a.glb', { dimensions: [1, 1, 1] });
    assert.deepEqual(v.aMesurer(mesuree, [{ nom: 'a.glb', signature: 's' }]), []);
    assert.equal(mesuree.vignettes['a.glb'].origine, 'source');
    assert.deepEqual(v.metas(mesuree), { 'a.glb': { dimensions: [1, 1, 1], noms: [] } });
  });
});

describe('Le câblage de main.js', () => {
  test('supprimer ou renommer un modèle fait suivre sa vignette', () => {
    assert.match(MAIN, /await fs\.promises\.unlink\(path\.join\(getModelsDir\(\), name\)\);\n\s+await suivreVignette\(name, null\);/);
    assert.match(MAIN, /await store\.renommerAttribution\(getProjectsDir\(\), ancien, nouveau\);\n\s+await suivreVignette\(ancien, nouveau\);/);
  });
  test('seule une image reconnue, pour un nom de modèle propre, est écrite', () => {
    const f = MAIN.slice(MAIN.indexOf('async function ecrireVignette('));
    assert.match(f, /if \(!nomDeModeleAcceptable\(nom\) \|\| !data \|\| !data\.length \|\| !vignettes\.typeImage\(data\)\) return \{ ok: false \};/);
  });
  test('l\'index s\'écrit L\'UN APRÈS L\'AUTRE (deux vignettes notées ensemble ne s\'effacent pas)', () => {
    assert.match(MAIN, /_fileIndexVignettes = _fileIndexVignettes\.then\(/);
  });
  test('un modèle téléchargé reçoit la vignette de sa source', () => {
    assert.match(MAIN, /const image = await store\.vignetteSource\(resultat\);\n\s+if \(image\) await ecrireVignette\(fichier, image, 'source'\);/);
    const s = sans(readFileSync(new URL('../store.js', import.meta.url), 'utf8'));
    assert.match(s, /const HOTES_VIGNETTES = \/\^https:/);
  });
});
