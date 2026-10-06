/**
 * tests/store-telechargement.test.mjs, le téléchargement depuis le store (#445) :
 *   - l'empaquetage glTF → GLB (gltf-glb.js), vérifié en relisant ce qu'il écrit ;
 *   - le plan de téléchargement Poly Haven, sur une VRAIE réponse de /files (extrait, 6 octobre 2026) ;
 *   - le fichier des attributions (ajout, remplacement, renommage) ;
 *   - le parcours dans la fenêtre (store-ui.js, exécuté sur le stub DOM) : progression, rangement par
 *     le chemin de l'import, attribution, coche, et ce qui se passe quand ça échoue.
 */
import './helpers/dom-stub.mjs';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { empaqueterGlb, lireGlb } = require('../gltf-glb.js');
const ph = require('../store-polyhaven.js');
const sources = require('../store-sources.js');
const FICHIERS = JSON.parse(readFileSync(new URL('./fixtures/polyhaven-fichiers.json', import.meta.url), 'utf8'));

/** Un glTF minimal mais complet : deux buffers externes, une image externe, des vues décalées. */
function gltfDeTest(){
  return {
    asset: { version: '2.0' },
    buffers: [{ uri: 'geo.bin', byteLength: 6 }, { uri: 'autre%20bin.bin', byteLength: 3 }],
    bufferViews: [{ buffer: 0, byteOffset: 2, byteLength: 4 }, { buffer: 1, byteLength: 3 }],
    images: [{ uri: 'textures/peau.jpg' }],
  };
}
const RESSOURCES = new Map([
  ['geo.bin', Buffer.from([0, 1, 2, 3, 4, 5])],
  ['autre bin.bin', Buffer.from([7, 8, 9])],
  ['textures/peau.jpg', Buffer.from('JPEGDATA')],
]);

describe('glTF → GLB', () => {
  test('un en-tête et deux blocs valides, longueurs alignées sur 4', () => {
    const glb = empaqueterGlb(gltfDeTest(), RESSOURCES);
    assert.equal(glb.length % 4, 0);
    const { json, bin } = lireGlb(glb);
    assert.equal(bin.length % 4, 0);
    assert.deepEqual(json.buffers, [{ byteLength: json.buffers[0].byteLength }], 'un seul buffer, sans uri');
    assert.ok(json.buffers[0].byteLength <= bin.length);
  });
  test('chaque vue pointe toujours sur SES octets, décalage d\'origine compris', () => {
    const { json, bin } = lireGlb(empaqueterGlb(gltfDeTest(), RESSOURCES));
    const vue = (i) => [...bin.subarray(json.bufferViews[i].byteOffset, json.bufferViews[i].byteOffset + json.bufferViews[i].byteLength)];
    assert.deepEqual(vue(0), [2, 3, 4, 5]);
    assert.deepEqual(vue(1), [7, 8, 9], 'le second buffer (uri encodée) n\'est pas au bon endroit');
    assert.ok(json.bufferViews.every(v => v.buffer === 0));
  });
  test('l\'image est intégrée, avec son type MIME, et n\'a plus d\'uri', () => {
    const { json, bin } = lireGlb(empaqueterGlb(gltfDeTest(), RESSOURCES));
    const img = json.images[0];
    assert.equal(img.uri, undefined);
    assert.equal(img.mimeType, 'image/jpeg');
    const v = json.bufferViews[img.bufferView];
    assert.equal(bin.subarray(v.byteOffset, v.byteOffset + v.byteLength).toString(), 'JPEGDATA');
    assert.equal(v.byteOffset % 4, 0, 'une vue d\'image doit commencer sur un multiple de 4');
  });
  test('une ressource manquante est une ERREUR qui la nomme, pas un modèle incomplet', () => {
    const sansTexture = new Map([...RESSOURCES].filter(([k]) => !k.startsWith('textures/')));
    assert.throws(() => empaqueterGlb(gltfDeTest(), sansTexture), /textures\/peau\.jpg/);
  });
  test('le glTF d\'origine n\'est pas modifié', () => {
    const g = gltfDeTest();
    empaqueterGlb(g, RESSOURCES);
    assert.deepEqual(g, gltfDeTest());
  });
});

describe('Poly Haven : le plan de téléchargement', () => {
  test('1k par défaut : le .gltf, sa géométrie et ses textures, avec le poids total', () => {
    const p = ph.planTelechargement(FICHIERS);
    assert.equal(p.resolution, '1k');
    assert.match(p.gltf.url, /ArmChair_01_1k\.gltf$/);
    assert.deepEqual(p.inclus.map(f => f.chemin).sort(),
      ['ArmChair_01.bin', 'textures/Armchair_01_arm_1k.jpg', 'textures/Armchair_01_diff_1k.jpg', 'textures/Armchair_01_nor_gl_1k.jpg']);
    assert.equal(p.total, 2643 + 184246 + 154012 + 289916 + 138327);
  });
  test('une résolution absente : la plus petite disponible', () => {
    const sans1k = { gltf: { '2k': FICHIERS.gltf['2k'], '4k': FICHIERS.gltf['4k'] } };
    assert.equal(ph.planTelechargement(sans1k).resolution, '2k');
  });
  test('⚠️ un fichier hors de dl.polyhaven.org, ou un chemin qui remonte, et RIEN n\'est téléchargé', () => {
    const ailleurs = JSON.parse(JSON.stringify(FICHIERS));
    ailleurs.gltf['1k'].gltf.include['ArmChair_01.bin'].url = 'https://evil.example/x.bin';
    assert.equal(ph.planTelechargement(ailleurs), null);
    const remonte = JSON.parse(JSON.stringify(FICHIERS));
    remonte.gltf['1k'].gltf.include['../../x.bin'] = remonte.gltf['1k'].gltf.include['ArmChair_01.bin'];
    assert.equal(ph.planTelechargement(remonte), null);
    assert.equal(ph.planTelechargement({}), null);
  });
  test('l\'adresse de la liste des fichiers n\'accepte qu\'un identifiant propre', () => {
    assert.equal(ph.urlFichiers('ArmChair_01'), 'https://api.polyhaven.com/files/ArmChair_01');
    assert.equal(ph.urlFichiers('../x'), null);
  });
});

describe('Le fichier des attributions', () => {
  const r = {
    source: 'polyhaven', id: 'ArmChair_01', type: 'modele', nom: 'Arm Chair 01', auteur: { nom: 'Kirill Sannikov', url: null },
    url: 'https://polyhaven.com/a/ArmChair_01', licence: sources.licence('cc0'),
  };
  test('une entrée garde de quoi créditer, même si la source disparaît', () => {
    const e = sources.entreeAttribution(r, 'Arm Chair 01.glb', new Date('2026-10-06T10:00:00Z'));
    assert.deepEqual(e, {
      source: 'polyhaven', id: 'ArmChair_01', fichier: 'Arm Chair 01.glb', nom: 'Arm Chair 01',
      auteur: { nom: 'Kirill Sannikov', url: null },
      licence: { code: 'cc0', libelle: 'CC0 Public Domain', url: 'https://creativecommons.org/publicdomain/zero/1.0/', attribution: false },
      url: 'https://polyhaven.com/a/ArmChair_01', date: '2026-10-06T10:00:00.000Z',
    });
  });
  test('retélécharger REMPLACE l\'entrée, sans en empiler une seconde', () => {
    let a = sources.ajouterAttribution(null, sources.entreeAttribution(r, 'a.glb'));
    a = sources.ajouterAttribution(a, sources.entreeAttribution({ ...r, id: 'autre' }, 'b.glb'));
    a = sources.ajouterAttribution(a, sources.entreeAttribution(r, 'a (2).glb'));
    assert.deepEqual(a.ressources.map(e => e.fichier), ['b.glb', 'a (2).glb']);
    assert.equal(a.version, 1);
  });
  test('un renommage fait suivre l\'entrée, à la casse près', () => {
    const a = sources.ajouterAttribution(null, sources.entreeAttribution(r, 'Chaise.glb'));
    const b = sources.renommerDansAttributions(a, 'chaise.glb', 'Fauteuil.glb');
    assert.equal(b.ressources[0].fichier, 'Fauteuil.glb');
    assert.equal(a.ressources[0].fichier, 'Chaise.glb', 'l\'original a été modifié');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Le parcours dans la fenêtre
// ─────────────────────────────────────────────────────────────────────────────

const { telechargerModele, cablerStore, rafraichirPossedes, fichierPossede } = await import('../src/store-ui.js');
const { setModelBridge } = await import('../src/model-store.js');

const RESULTAT = {
  source: 'polyhaven', id: 'ArmChair_01', type: 'modele', nom: 'Arm Chair 01', auteur: { nom: 'K', url: null },
  url: 'https://polyhaven.com/a/ArmChair_01', vignettes: {}, licence: sources.licence('cc0'), poids: null, details: {},
};

function monter({ telecharger, existants = [] } = {}){
  const journal = { ecrits: [], attribues: [], apres: [] };
  let telecharges = [];
  const disque = new Map(existants.map(n => [n, new Uint8Array([9])]));
  const pontModeles = {
    listModelFiles: async () => [...disque.keys()],
    readModelFile: async (n) => (disque.has(n) ? { ok: true, data: disque.get(n) } : { ok: false }),
    writeModelFile: async (n, d) => { disque.set(n, d); journal.ecrits.push(n); return { ok: true, name: n }; },
  };
  setModelBridge(pontModeles);
  window.storyboarderAPI = {
    ...pontModeles,
    storeTelecharger: telecharger || (async () => ({ data: new Uint8Array([1, 2, 3]), nom: 'ArmChair_01' })),
    storeAttribuer: async (r, f) => { journal.attribues.push([r.id, f]); telecharges = [{ source: r.source, id: r.id, fichier: f }]; return { ok: true }; },
    storeTelecharges: async () => telecharges,
  };
  cablerStore({ apresTelechargement: (f) => journal.apres.push(f) });
  return journal;
}
const elt = () => document.createElement('button');

describe('Télécharger depuis la fiche', () => {
  test('rangé sous le nom du modèle, attribué, coché, et la section Modèles prévenue', async () => {
    const j = monter();
    await rafraichirPossedes();
    const bouton = elt(); const note = elt();
    const issue = await telechargerModele(RESULTAT, bouton, note);
    assert.deepEqual(issue, { ok: true, fichier: 'Arm Chair 01.glb' });
    assert.deepEqual(j.ecrits, ['Arm Chair 01.glb']);
    assert.deepEqual(j.attribues, [['ArmChair_01', 'Arm Chair 01.glb']]);
    assert.deepEqual(j.apres, ['Arm Chair 01.glb']);
    assert.equal(fichierPossede(RESULTAT), 'Arm Chair 01.glb', 'la coche ne suit pas');
    assert.match(bouton.textContent, /Déjà téléchargé|Already downloaded/);
    assert.match(note.textContent, /Arm Chair 01\.glb/);
  });
  test('un nom déjà pris par un AUTRE fichier : rangé à côté, rien n\'est écrasé', async () => {
    const j = monter({ existants: ['Arm Chair 01.glb'] });
    const issue = await telechargerModele(RESULTAT, elt(), elt());
    assert.equal(issue.fichier, 'Arm Chair 01 (2).glb');
    assert.deepEqual(j.ecrits, ['Arm Chair 01 (2).glb']);
  });
  test('un échec ne range rien, n\'attribue rien, le dit, et laisse réessayer', async () => {
    const j = monter({ telecharger: async () => ({ erreur: 'corrompu' }) });
    const bouton = elt(); const note = elt();
    const issue = await telechargerModele(RESULTAT, bouton, note);
    assert.equal(issue.ok, false);
    assert.deepEqual(j.ecrits, []);
    assert.deepEqual(j.attribues, []);
    assert.match(note.textContent, /abîmé|damaged/);
    assert.ok(note.classList.contains('erreur'));
    assert.equal(bouton.disabled, false, 'le bouton reste bloqué après un échec');
  });
  test('un seul téléchargement à la fois', async () => {
    const liberations = [];
    monter({ telecharger: () => new Promise(res => { liberations.push(() => res({ data: new Uint8Array([1]) })); }) });
    const premier = telechargerModele(RESULTAT, elt(), elt());
    await new Promise(r => setTimeout(r, 0));
    const second = telechargerModele({ ...RESULTAT, id: 'autre' }, elt(), elt());
    await new Promise(r => setTimeout(r, 0));
    assert.equal(liberations.length, 1, 'un second téléchargement a démarré pendant le premier');
    liberations.forEach(l => l());
    assert.equal((await second).ok, false);
    assert.equal((await premier).ok, true);
  });
});
