/**
 * tests/store-ui.test.mjs, la fenêtre du store (#444b) : ses textes et mises en forme (exécutés),
 * et son câblage (inspecté, le DOM et Electron étant hors de portée sous Node).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { textesStore, PLAFONDS_FACES, SEUIL_LOURD, nombreCourt, poidsLisible, estLourd, phrasesLicence, lignesDetails } from '../src/store-texts.js';
import sources from '../store-sources.js';
import sketchfab from '../store-sketchfab.js';

const lire = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const sans = (s) => s.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
const PAGE = JSON.parse(lire('tests/fixtures/sketchfab-recherche.json'));
const BANC = sketchfab.modeleNormalise(PAGE.results[0]);

describe('les textes', () => {
  test('mêmes clés dans les deux langues, erreurs et tris compris', () => {
    const fr = textesStore('fr'); const en = textesStore('en');
    assert.deepEqual(Object.keys(fr).sort(), Object.keys(en).sort());
    assert.deepEqual(Object.keys(fr.erreurs).sort(), Object.keys(en.erreurs).sort());
    assert.deepEqual(Object.keys(fr.tris).sort(), [...sources.TRIS].sort());
    assert.equal(textesStore('de'), fr);
  });
  test('chaque erreur que store.js peut rendre a son texte', () => {
    // Tous les codes entre apostrophes des lignes qui posent une erreur, ternaires compris.
    const lignes = lire('store.js').split('\n').filter(l => /erreur: /.test(l) && !/^\s*(\/\/|\*)/.test(l));
    const codes = new Set(lignes.flatMap(l => [...l.slice(l.indexOf('erreur: ')).matchAll(/'(\w+)'/g)].map(m => m[1])));
    assert.deepEqual([...codes].sort(), ['quota', 'reponse', 'reseau', 'source']);
    for (const c of codes) { assert.ok(textesStore('fr').erreurs[c], c); assert.ok(textesStore('en').erreurs[c], c); }
  });
  test('la simulation dit comment en sortir', () => {
    assert.match(textesStore('fr').simulation, /Remove-Item Env:STORYBOARD_SIMULER_STORE/);
    assert.match(textesStore('en').simulation, /Remove-Item Env:STORYBOARD_SIMULER_STORE/);
  });
});

describe('les mises en forme', () => {
  test('nombres courts', () => {
    assert.equal(nombreCourt(49980), '50 k');
    assert.equal(nombreCourt(999), '999');
    assert.equal(nombreCourt(1250000), '1,3 M');
    assert.equal(nombreCourt(1250000, 'en'), '1.3 M');
    assert.equal(nombreCourt(-1), '');
    assert.equal(nombreCourt(undefined), '');
  });
  test('poids lisibles, unités traduites', () => {
    assert.equal(poidsLisible(23795824), '23 Mo');
    assert.equal(poidsLisible(612148), '598 Ko');
    assert.equal(poidsLisible(5 * 1024 * 1024 + 300000), '5,3 Mo');
    assert.equal(poidsLisible(5 * 1024 * 1024 + 300000, 'en'), '5.3 MB');
    assert.equal(poidsLisible(100), '1 Ko');
    assert.equal(poidsLisible(0), '');
  });
  test('un modèle lourd se signale : faces, poids ou textures', () => {
    assert.equal(estLourd(BANC), true, 'textures 8k');
    const leger = { poids: 600000, details: { faces: 10000, textureMax: 128 } };
    assert.equal(estLourd(leger), false);
    assert.equal(estLourd({ ...leger, details: { faces: SEUIL_LOURD.faces + 1 } }), true);
    assert.equal(estLourd({ ...leger, poids: SEUIL_LOURD.octets + 1 }), true);
    assert.equal(estLourd({ poids: null, details: null }), false);
  });
  test('ce que dit la licence, en clair', () => {
    assert.deepEqual(phrasesLicence(sources.licence('by')), ['Créditer l\'auteur est obligatoire.', 'Usage commercial autorisé.']);
    assert.deepEqual(phrasesLicence(sources.licence('cc0'), 'en'), ['No credit required.', 'Commercial use allowed.']);
    assert.equal(phrasesLicence(sources.licence('by-nc-nd')).length, 3);
  });
  test('les lignes de la fiche', () => {
    assert.deepEqual(lignesDetails(BANC), ['50 k faces', '1 texture(s), jusqu\'à 8192 px', 'Téléchargement : 23 Mo']);
    assert.deepEqual(lignesDetails({ ...BANC, details: { anime: true }, poids: null }, 'en'), ['Animated']);
  });
  test('les plafonds de faces commencent par « sans limite »', () => {
    assert.equal(PLAFONDS_FACES[0], null);
    assert.ok(PLAFONDS_FACES.slice(1).every((n, i, a) => n > 0 && (i === 0 || n > a[i - 1])));
  });
});

describe('le câblage', () => {
  const UI = sans(lire('src/store-ui.js'));
  const MAIN = sans(lire('main.js'));
  test('⚠️ rien de ce qui vient du réseau ne passe par innerHTML', () => {
    assert.ok(!/innerHTML/.test(UI));
  });
  test('le téléchargement est désactivé tant que la connexion n\'existe pas, et la fiche dit pourquoi', () => {
    assert.match(UI, /texte: t\.telecharger, classe: 'full-btn', attrs: \{ type: 'button', disabled: '' \}/);
    assert.match(UI, /texte: t\.bientot/);
  });
  test('l\'aperçu 3D ne se charge qu\'à la demande, et seulement depuis l\'adresse validée par la source', () => {
    const f = UI.slice(UI.indexOf('function ouvrirFiche'));
    assert.ok(f.indexOf('voir.onclick') < f.indexOf("el('iframe'"));
    assert.match(f, /const src = r\.apercu3D \+/);
  });
  test('main.js : les liens partent dans le navigateur, https seulement', () => {
    assert.match(MAIN, /win\.webContents\.setWindowOpenHandler\(\(\{ url \}\) => \{\n\s+if \(\/\^https:\\\/\\\/\/\.test\(url\)\) shell\.openExternal\(url\);\n\s+return \{ action: 'deny' \};/);
  });
  test('main.js : la simulation n\'existe qu\'en développement', () => {
    assert.match(MAIN, /const SIMULATION_STORE = !app\.isPackaged && !!process\.env\.STORYBOARD_SIMULER_STORE;/);
    assert.match(MAIN, /store\.chercher\(sourceId, params, SIMULATION_STORE \? __dirname : null\)/);
  });
  test('le pont n\'expose que les deux appels du store', () => {
    const pre = lire('preload.js');
    assert.match(pre, /storeInfos: \(sourceId\) => ipcRenderer\.invoke\('store:infos', sourceId\)/);
    assert.match(pre, /storeChercher: \(sourceId, params\) => ipcRenderer\.invoke\('store:chercher', sourceId, params\)/);
  });
  test('store.js : les paramètres sont nettoyés AVANT de construire l\'adresse', () => {
    const s = sans(lire('store.js'));
    const c = s.slice(s.indexOf('async function chercher'));
    assert.ok(c.indexOf('sources.rechercheNormalisee(params)') < c.indexOf('module.urlRecherche(recherche)'));
    assert.match(c, /return sources\.pageAffichable\(module\.pageNormalisee\(json\), recherche\);/);
  });
  test('retours de Valentin (6 octobre 2026) : une seule zone défile, la fiche remplace la liste, une ligne par licence', () => {
    const css = lire('style.css');
    const html = lire('index.html');
    assert.match(css, /\.store-grille\[hidden\], \.store-fiche\[hidden\], \.store-plus\[hidden\]\{ display:none; \}/);
    assert.match(css, /display:flex; flex-direction:column; overflow:hidden;/);
    assert.match(css, /\.store-box > \.store-defilement\{ flex:1 1 auto; min-height:0; overflow-y:auto;/);
    const zone = html.slice(html.indexOf('id="storeDefilement"'), html.indexOf('id="storeCredit"'));
    for (const id of ['storeGrille', 'storePlusBtn', 'storeFiche']) assert.ok(zone.includes(`id="${id}"`), id);
    assert.match(css, /\.store-badge\{ min-width:0;[^}]*white-space:nowrap;/);
    assert.match(css, /\.modal-box \.store-filtres select\{ flex:1 1 180px; width:auto; margin:0; \}/);
    assert.equal(textesStore('fr').ouvrir, 'Store en ligne');
  });
  test('les modules du store voyagent avec l\'application', () => {
    const pkg = JSON.parse(lire('package.json'));
    for (const f of ['store.js', 'store-sources.js', 'store-sketchfab.js']) assert.ok(pkg.build.files.includes(f), f);
  });
});
