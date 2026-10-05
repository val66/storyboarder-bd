/**
 * tests/update-chain.test.mjs, la chaîne des mises à jour (#442), de la release à l'écran.
 *
 * Deux parties. Les OUTILS (tools/attestation.mjs, tools/obligatoire.mjs) sont des fonctions
 * pures : on les exécute, et l'attestation qu'ils signent est relue par update-policy.js, la
 * même fonction que l'application. Le CÂBLAGE (main.js, preload-blocage.js, les workflows,
 * package.json) ne se charge pas sous Node : on l'inspecte comme du texte, en visant des LIENS
 * entre deux endroits plutôt que des présences isolées (cf. window-state.test.mjs, qui dit pourquoi).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateKeyPairSync } from 'node:crypto';

import politique from '../update-policy.js';
import {
  VERSIONS_MAX, NOTE_PAR_DEFAUT, versionsPubliees, versionsObligatoires, notesPourUtilisateur,
  construireCharge, signer,
} from '../tools/attestation.mjs';
import { planObligatoire } from '../tools/obligatoire.mjs';

const lire = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const sansCommentaires = (s) => s.split('\n').filter(l => !/^\s*(\/\/|#)/.test(l)).join('\n');

const CHANGELOG = [
  '# Journal', '', '## v1.9.0', '', '**Le résumé.**', '', '### Ce qui change pour vous', '',
  '- un point visible', '', '### Sous le capot', '', '- du rangement', '', '---', '',
  '## v1.8.0', '', 'Ancienne.', '',
].join('\n');

const rel = (tag, o = {}) => JSON.stringify({ tag, draft: false, prerelease: false, assets: ['a.exe', 'latest.yml'], ...o });

describe('les versions publiées', () => {
  test('seulement celles qui ont leur installeur, ni brouillon ni préversion', () => {
    const lignes = [
      rel('v1.9.0'), rel('v1.8.0'), '',
      rel('v2.0.0', { draft: true }), rel('v1.9.1', { prerelease: true }),
      rel('v1.7.0', { assets: ['notes.md'] }), rel('v1.6.0', { assets: undefined }),
      rel('attestation'), rel('1.5.0'),
    ];
    assert.deepEqual(versionsPubliees(lignes), ['1.9.0', '1.8.0']);
  });
  test('les tags obligatoires, et rien d\'autre', () => {
    assert.deepEqual(versionsObligatoires(['obligatoire/v1.9.0', 'v1.9.0', 'obligatoire/v1.9', ' obligatoire/v2.0.0 ', 'xobligatoire/v1.0.0']),
      ['1.9.0', '2.0.0']);
  });
});

describe('les notes', () => {
  test('ce qui change pour l\'utilisateur, sans « sous le capot » ni son titre', () => {
    const n = notesPourUtilisateur('**Le résumé.**\n\n### Ce qui change pour vous\n\n- un point\n\n### Sous le capot\n\n- rangement\n\n---');
    assert.equal(n, '**Le résumé.**\n\n\n\n- un point');
    assert.ok(!/rangement|Sous le capot|Ce qui change/.test(n));
  });
  test('une section sans sous-titres passe entière ; une absente donne null', () => {
    assert.equal(notesPourUtilisateur('Ancienne.'), 'Ancienne.');
    assert.equal(notesPourUtilisateur(null), null);
    assert.equal(notesPourUtilisateur('### Sous le capot\n\n- x'), null);
  });
});

describe('le contenu de l\'attestation', () => {
  const maintenant = Date.parse('2026-10-05T03:17:00Z');
  test('versions triées, notes tirées du CHANGELOG, défaut pour un correctif', () => {
    const c = construireCharge({ publiees: ['1.8.0', '1.9.0', '1.9.1', '1.9.0'], obligatoires: [], changelog: CHANGELOG, maintenant });
    assert.equal(c.emis, '2026-10-05T03:17:00.000Z');
    assert.deepEqual(c.versions.map(v => v.version), ['1.9.1', '1.9.0', '1.8.0']);
    assert.equal(c.versions[0].notes, NOTE_PAR_DEFAUT);
    assert.match(c.versions[1].notes, /un point visible/);
    assert.ok(!/rangement/.test(c.versions[1].notes));
    assert.equal(c.versionMinimale, null);
    assert.ok(politique.chargeValide(c));
  });
  test('la version minimale est la plus haute obligatoire PUBLIÉE', () => {
    const c = construireCharge({ publiees: ['1.8.0', '1.9.0', '1.10.0'], obligatoires: ['1.8.0', '1.9.0', '2.0.0'], changelog: CHANGELOG, maintenant });
    assert.equal(c.versionMinimale, '1.9.0');
    assert.deepEqual(c.versions.map(v => [v.version, v.obligatoire]), [['1.10.0', false], ['1.9.0', true], ['1.8.0', true]]);
  });
  test('au plus VERSIONS_MAX versions, mais une obligatoire plus ancienne compte encore', () => {
    const publiees = Array.from({ length: 20 }, (_, i) => `1.${i}.0`);
    const c = construireCharge({ publiees, obligatoires: ['1.0.0'], changelog: '', maintenant });
    assert.equal(c.versions.length, VERSIONS_MAX);
    assert.equal(c.versions[0].version, '1.19.0');
    assert.equal(c.versionMinimale, '1.0.0');
  });
  test('signée par l\'outil, relue par l\'application', () => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const c = construireCharge({ publiees: ['1.9.0'], obligatoires: ['1.9.0'], changelog: CHANGELOG, maintenant });
    const fichier = signer(c, privateKey.export({ type: 'pkcs8', format: 'pem' }));
    const relue = politique.lireAttestation(JSON.parse(JSON.stringify(fichier)), publicKey.export({ type: 'spki', format: 'pem' }));
    assert.deepEqual(relue, c);
    const d = politique.decider({ version: '1.8.4', enLigne: relue, locale: null, maintenant });
    assert.equal(d.etat, 'obligatoire');
  });
});

describe('npm run obligatoire', () => {
  test('pose les deux tags, ou seulement le marqueur si la version est déjà taguée', () => {
    assert.deepEqual(planObligatoire({ version: '1.9.0', changelog: CHANGELOG, tagsExistants: new Set() }).tags,
      ['v1.9.0', 'obligatoire/v1.9.0']);
    assert.deepEqual(planObligatoire({ version: '1.9.0', changelog: CHANGELOG, tagsExistants: new Set(['v1.9.0']) }).tags,
      ['obligatoire/v1.9.0']);
  });
  test('refuse sans section de CHANGELOG, deux fois, ou sur une version illisible', () => {
    assert.match(planObligatoire({ version: '1.9.5', changelog: CHANGELOG, tagsExistants: new Set() }).erreur, /## v1\.9\.5/);
    assert.match(planObligatoire({ version: '1.9.0', changelog: CHANGELOG, tagsExistants: new Set(['obligatoire/v1.9.0']) }).erreur, /existe déjà/);
    assert.match(planObligatoire({ version: '1.9', changelog: CHANGELOG, tagsExistants: new Set() }).erreur, /illisible/);
  });
});

describe('le câblage du processus principal', () => {
  const MAIN = sansCommentaires(lire('main.js'));
  test('la décision précède la fenêtre : on attend la vérification avant d\'en ouvrir une', () => {
    const pret = MAIN.slice(MAIN.indexOf('app.whenReady()'));
    assert.ok(pret.indexOf('await preparerMaj()') > 0);
    assert.ok(pret.indexOf('await preparerMaj()') < pret.indexOf('createWindow('));
    assert.match(pret, /if \(ecranBloquant\(etatMaj\)\) fenetreBlocage = createWindow\('blocage'\)/);
  });
  test('l\'écran bloquant a son propre pont, sa page, ni navigation ni outils de développement', () => {
    assert.match(MAIN, /preload: path\.join\(__dirname, bloque \? 'preload-blocage\.js' : 'preload\.js'\)/);
    assert.match(MAIN, /if \(bloque\) \{\s*win\.webContents\.on\('will-navigate', \(e\) => e\.preventDefault\(\)\);/);
    assert.match(MAIN, /setWindowOpenHandler\(\(\) => \(\{ action: 'deny' \}\)\)/);
    assert.match(MAIN, /win\.loadFile\(path\.join\(__dirname, 'blocage\.html'\)\)/);
    assert.match(MAIN, /before-input-event[\s\S]{0,80}if \(bloque\) return;/);
  });
  test('sans clé publique, aucune vérification ne bloque', () => {
    assert.match(MAIN, /if \(!CLE_PUBLIQUE\) return \{ decision: \{ etat: 'libre' \}, latest: r\.latest \};/);
    assert.match(lire('attestation-cle.js'), /module\.exports = \{ CLE_PUBLIQUE: /);
  });
  test('en développement, rien n\'est vérifié, sauf simulation demandée', () => {
    const p = MAIN.slice(MAIN.indexOf('async function preparerMaj()'));
    assert.ok(p.indexOf('if (simule) return simule;') < p.indexOf('if (!app.isPackaged)'));
  });
  test('l\'installation marque la fermeture comme voulue AVANT de quitter', () => {
    const i = MAIN.slice(MAIN.indexOf("ipcMain.handle('maj:installer'"));
    assert.ok(i.indexOf('majES.lancerInstalleur(chemin);') < i.indexOf('isQuitting = true;'));
    assert.ok(i.indexOf('isQuitting = true;') < i.indexOf('app.quit();'));
  });
  test('réessayer remplace l\'écran bloquant par l\'application quand tout est réglé', () => {
    const r = MAIN.slice(MAIN.indexOf("ipcMain.handle('maj:reessayer'"));
    assert.match(r, /if \(!ecranBloquant\(etatMaj\) && fenetreBlocage\) \{[\s\S]*createWindow\('app'\);[\s\S]*ancienne\.destroy\(\);/);
  });
  test('le pont bloquant n\'expose QUE les mises à jour', () => {
    const p = sansCommentaires(lire('preload-blocage.js'));
    assert.ok(!/storyboarderAPI/.test(p));
    const canaux = [...p.matchAll(/ipcRenderer\.(?:invoke|on)\('([^']+)'/g)].map(m => m[1]);
    assert.deepEqual(canaux.sort(), ['maj:etat', 'maj:installer', 'maj:progression', 'maj:reessayer']);
  });
  test('l\'installeur téléchargé est vérifié contre l\'empreinte de latest.yml', () => {
    const u = sansCommentaires(lire('updater.js'));
    assert.match(u, /crypto\.createHash\('sha512'\)/);
    assert.match(u, /if \(empreinte\.digest\('base64'\) !== latest\.sha512\)/);
    assert.match(u, /if \(enLigne\) ecrireJson\(cheminAttestation, fichierEnLigne\);/);
  });
});

describe('la modale de l\'application', () => {
  test('⚠️ LE PROJET EST ENREGISTRÉ AVANT L\'INSTALLATION, et un échec l\'annule', () => {
    const b = sansCommentaires(lire('src/update-button.js'));
    const f = b.slice(b.indexOf('async function installer()'));
    assert.ok(f.indexOf('await saveProjectFlow()') > 0);
    assert.ok(f.indexOf('await saveProjectFlow()') < f.indexOf('majInstaller()'));
    assert.match(f, /if \(!ok\) \{[\s\S]*?return;/);
  });
});

describe('la publication', () => {
  const PKG = JSON.parse(lire('package.json'));
  const RELEASE = sansCommentaires(lire('.github/workflows/release.yml'));
  const ATTESTATION = sansCommentaires(lire('.github/workflows/attestation.yml'));
  test('l\'installeur porte un nom sans espace, celui que la release téléverse', () => {
    assert.equal(PKG.build.nsis.artifactName, 'Storyboarder-BD-Setup-${version}.${ext}');
    assert.match(RELEASE, /npx electron-builder --win --publish never/);
    for (const f of ['dist/Storyboarder-BD-Setup-\\*\\.exe', 'dist/Storyboarder-BD-Setup-\\*\\.exe\\.blockmap', 'dist/latest\\.yml']) {
      assert.match(RELEASE, new RegExp(f));
    }
    assert.match(RELEASE, /needs: publier/);
    assert.match(RELEASE, /runs-on: windows-latest/);
  });
  test('⚠️ latest.yml n\'est produit QUE si une cible de publication est déclarée', () => {
    // Avec `publish: null`, electron-builder construit l'installeur mais pas latest.yml : la
    // première release (v1.9.0) a échoué au téléversement pour cette raison. La cible doit être le
    // dépôt même que l'application interroge ; `--publish never` empêche de publier pour autant.
    assert.deepEqual(PKG.build.publish, { provider: 'github', owner: 'val66', repo: 'storyboarder-bd' });
    assert.equal(`${PKG.build.publish.owner}/${PKG.build.publish.repo}`, politique.DEPOT);
  });
  test('la publication de la note est rejouable : une release existante est mise à jour', () => {
    assert.match(RELEASE, /if gh release view "\$\{\{ github\.ref_name \}\}"/);
    assert.match(RELEASE, /gh release edit "\$\{\{ github\.ref_name \}\}" --notes-file NOTE\.md/);
  });
  test('le verrouillage d\'intégrité est posé', () => {
    assert.deepEqual(PKG.build.electronFuses, {
      runAsNode: false, enableNodeOptionsEnvironmentVariable: false, enableNodeCliInspectArguments: false,
      enableEmbeddedAsarIntegrityValidation: true, onlyLoadAppFromAsar: true,
    });
  });
  test('les fichiers du processus principal et l\'écran bloquant partent dans l\'installeur', () => {
    for (const f of ['update-policy.js', 'updater.js', 'attestation-cle.js', 'preload-blocage.js', 'blocage.html']) {
      assert.ok(PKG.build.files.includes(f), f);
    }
    const requis = [...lire('main.js').matchAll(/require\('\.\/([^']+)'\)/g)].map(m => m[1] + '.js');
    for (const f of requis) assert.ok(PKG.build.files.includes(f), f);
  });
  test('l\'attestation : historique complet, chaque nuit, après chaque release, et jamais sans clé', () => {
    assert.match(ATTESTATION, /fetch-depth: 0/);
    assert.match(ATTESTATION, /cron: '/);
    assert.match(ATTESTATION, /workflows: \[Release\]/);
    assert.match(ATTESTATION, /- 'obligatoire\/v\*'/);
    assert.match(ATTESTATION, /\| tojson' > releases\.jsonl/);
    assert.match(ATTESTATION, /node tools\/attestation\.mjs releases\.jsonl obligatoires\.txt > attestation\.json/);
    assert.equal((ATTESTATION.match(/if: env\.ATTESTATION_CLE_PRIVEE != ''/g) || []).length, 2);
    assert.match(ATTESTATION, /git push -f -q .* attestation/);
    assert.match(politique.URL_ATTESTATION, /\/attestation\/attestation\.json$/);
  });
  test('la note de version ne prend jamais un marqueur obligatoire pour le tag précédent', () => {
    assert.match(lire('tools/release-notes.mjs'), /'--match', 'v\*'/);
  });
});
