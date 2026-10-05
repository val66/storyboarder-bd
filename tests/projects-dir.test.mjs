/**
 * tests/projects-dir.test.mjs, le dossier des Projets hors de portée des mises à jour (#447).
 *
 * projects-dir.js se charge sous Node nu : exécuté pour de vrai, avec des chemins Windows (ceux de
 * l'utilisateur) et Unix. Le câblage (main.js, l'installeur NSIS, l'annonce dans le renderer) est
 * inspecté comme du texte, en visant l'ORDRE et les liens entre fichiers.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import dossiers from '../projects-dir.js';

const {
  ANCIENS_NOMS, DONNEES_A_RECOPIER, donneesARecuperer, anciensDossiersDocuments, DOSSIER_RECUPERE, dossierParDefaut, ancienDossierParDefaut, dansLeDossier, relocaliser, planMigration,
} = dossiers;
const lire = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

const ANCIEN = 'C:\\Users\\v\\AppData\\Local\\Programs\\storyboard-bd\\Projets';
const NOUVEAU = 'C:\\Users\\v\\Documents\\Storyboarder BD\\Projets';

describe('où vivent les Projets', () => {
  test('installée : dans Documents, au nom de l\'application', () => {
    assert.equal(dossierParDefaut({ packaged: true, documents: 'C:\\Users\\v\\Documents', nomApp: 'Storyboarder BD', appDir: 'x' }), NOUVEAU);
  });
  test('en développement : le dossier du dépôt, comme avant', () => {
    assert.equal(dossierParDefaut({ packaged: false, documents: 'C:\\Users\\v\\Documents', nomApp: 'X', appDir: 'C:\\WebProjects\\Storyboarder' }),
      'C:\\WebProjects\\Storyboarder\\Projets');
  });
  test('l\'ancien défaut : à côté du programme une fois installée, aucun en développement', () => {
    assert.equal(ancienDossierParDefaut({ packaged: true, exeDir: 'C:\\Users\\v\\AppData\\Local\\Programs\\storyboard-bd' }), ANCIEN);
    assert.equal(ancienDossierParDefaut({ packaged: false, exeDir: 'x' }), null);
  });
});

describe('chemins', () => {
  test('dans un dossier : sans casse ni séparateur final, mais pas un simple préfixe de nom', () => {
    assert.ok(dansLeDossier(ANCIEN, ANCIEN));
    assert.ok(dansLeDossier(ANCIEN + '\\a.json', ANCIEN.toLowerCase() + '\\'));
    assert.ok(dansLeDossier(ANCIEN.replace(/\\/g, '/') + '/Modeles/x.glb', ANCIEN));
    assert.ok(!dansLeDossier(ANCIEN + ' 2\\a.json', ANCIEN));
    assert.ok(!dansLeDossier(null, ANCIEN));
    assert.ok(!dansLeDossier(ANCIEN, null));
  });
  test('relocaliser garde la suite du chemin', () => {
    assert.equal(relocaliser(ANCIEN + '\\BD\\Cimetiere.json', ANCIEN, NOUVEAU), NOUVEAU + '\\BD\\Cimetiere.json');
    assert.equal(relocaliser(ANCIEN, ANCIEN, NOUVEAU), NOUVEAU);
    assert.equal(relocaliser('D:\\Ailleurs\\a.json', ANCIEN, NOUVEAU), 'D:\\Ailleurs\\a.json');
    assert.equal(relocaliser('/opt/sb/Projets/a.json', '/opt/sb/Projets', '/home/v/Documents/SB/Projets'), '/home/v/Documents/SB/Projets/a.json');
  });
});

describe('le plan du démarrage', () => {
  test('en développement : rien', () => {
    assert.deepEqual(planMigration({ ancien: null, nouveau: NOUVEAU, ancienContenu: true }),
      { deplacer: false, cible: null, reglages: {}, annonce: null });
  });
  test('ancien dossier vide ou absent : ni déménagement, ni annonce', () => {
    const p = planMigration({ ancien: ANCIEN, nouveau: NOUVEAU, ancienContenu: false, nouveauContenu: false });
    assert.equal(p.deplacer, false);
    assert.equal(p.annonce, null);
  });
  test('ancien dossier rempli, nouveau libre : on déménage vers le nouveau, et on l\'annonce', () => {
    const p = planMigration({ ancien: ANCIEN, nouveau: NOUVEAU, ancienContenu: true, nouveauContenu: false,
      reglages: { lastFilePath: ANCIEN + '\\Cimetiere.json' } });
    assert.deepEqual(p, {
      deplacer: true, cible: NOUVEAU, annonce: { de: ANCIEN, vers: NOUVEAU },
      reglages: { lastFilePath: NOUVEAU + '\\Cimetiere.json' },
    });
  });
  test('nouveau déjà occupé : rien n\'est écrasé, l\'ancien va dans « Projets (anciens) »', () => {
    const p = planMigration({ ancien: ANCIEN, nouveau: NOUVEAU, ancienContenu: true, nouveauContenu: true,
      reglages: { projectsDir: ANCIEN, lastFilePath: ANCIEN + '\\a.json' } });
    const cible = 'C:\\Users\\v\\Documents\\Storyboarder BD\\' + DOSSIER_RECUPERE;
    assert.equal(p.cible, cible);
    assert.deepEqual(p.reglages, { projectsDir: cible, lastFilePath: cible + '\\a.json' });
  });
  test('un dossier choisi qui ÉTAIT l\'ancien défaut redevient le défaut', () => {
    const p = planMigration({ ancien: ANCIEN, nouveau: NOUVEAU, ancienContenu: true, nouveauContenu: false,
      reglages: { projectsDir: ANCIEN + '\\' } });
    assert.deepEqual(p.reglages, { projectsDir: null });
  });
  test('un sous-dossier choisi dans l\'ancien défaut le suit', () => {
    const p = planMigration({ ancien: ANCIEN, nouveau: NOUVEAU, ancienContenu: true, nouveauContenu: false,
      reglages: { projectsDir: ANCIEN + '\\BD' } });
    assert.deepEqual(p.reglages, { projectsDir: NOUVEAU + '\\BD' });
  });
  test('des réglages ailleurs ne bougent pas (le cas de Valentin)', () => {
    const p = planMigration({ ancien: ANCIEN, nouveau: NOUVEAU, ancienContenu: false, nouveauContenu: false,
      reglages: { projectsDir: 'C:\\WebProjects\\Storyboarder\\Projets', lastFilePath: 'C:\\WebProjects\\Storyboarder\\Projets\\a.json' } });
    assert.deepEqual(p.reglages, {});
  });
});

describe('le renommage (#448)', () => {
  const APPDATA = 'C:\\Users\\v\\AppData\\Roaming';
  const ANCIEN_APPDATA = APPDATA + '\\Storyboard BD';
  test('l\'ancien nom est connu, et l\'on ne recopie que ce qui compte', () => {
    assert.deepEqual(ANCIENS_NOMS, ['Storyboard BD']);
    assert.deepEqual(DONNEES_A_RECOPIER, ['settings.json', 'maj', 'Local Storage']);
  });
  test('premier lancement renommé : on récupère les anciennes données', () => {
    assert.equal(donneesARecuperer({ appData: APPDATA, anciensExistants: [ANCIEN_APPDATA], nouveauARéglages: false }), ANCIEN_APPDATA);
  });
  test('jamais par-dessus des réglages déjà vécus sous le nouveau nom', () => {
    assert.equal(donneesARecuperer({ appData: APPDATA, anciensExistants: [ANCIEN_APPDATA], nouveauARéglages: true }), null);
  });
  test('rien à récupérer si l\'ancien dossier n\'existe pas', () => {
    assert.equal(donneesARecuperer({ appData: APPDATA, anciensExistants: [], nouveauARéglages: false }), null);
  });
  test('les anciens Projets sous Documents', () => {
    assert.deepEqual(anciensDossiersDocuments('C:\\Users\\v\\Documents'), ['C:\\Users\\v\\Documents\\Storyboard BD\\Projets']);
  });
  test('main.js : les données sont récupérées AVANT la première lecture des réglages', () => {
    const main = lire('main.js');
    assert.ok(main.indexOf('recupererDonneesAncienNom();') < main.indexOf("const settingsFilePath = path.join(app.getPath('userData')"));
    assert.match(main, /if \(!app\.isPackaged\) return;\n  try \{\n    const appData/);
    assert.match(main, /anciens\.push\(\.\.\.dossiersProjets\.anciensDossiersDocuments\(app\.getPath\('documents'\)\)\)/);
  });
  test('le nom du produit a changé, son identifiant non', () => {
    const pkg = JSON.parse(lire('package.json'));
    assert.equal(pkg.build.productName, 'Storyboarder BD');
    assert.equal(pkg.build.appId, 'com.valentin.storyboardbd');
    assert.equal(pkg.name, 'storyboard-bd', 'le dossier de développement en dépend');
    assert.equal(pkg.productName, undefined, 'un productName à la racine renommerait aussi le dossier de développement');
  });
});

describe('le câblage', () => {
  const sans = (s) => s.split('\n').filter(l => !/^\s*(\/\/|;)/.test(l)).join('\n');
  test('main.js : le défaut vient de projects-dir.js, et le déménagement précède tout le reste', () => {
    const main = sans(lire('main.js'));
    assert.match(main, /const defaultProjectsDir = dossiersProjets\.dossierParDefaut\(\{/);
    assert.match(main, /documents: app\.getPath\('documents'\), nomApp: app\.getName\(\)/);
    const pret = main.slice(main.indexOf('app.whenReady()'));
    assert.ok(pret.indexOf('migrerAncienDossierProjets();') < pret.indexOf('ensureProjectsDir();'));
    assert.ok(pret.indexOf('migrerAncienDossierProjets();') < pret.indexOf('createWindow('));
    const m = main.slice(main.indexOf('function migrerAncienDossierProjets()'));
    // La copie de secours n'efface l'original qu'APRÈS avoir copié.
    assert.ok(m.indexOf('fs.cpSync(') < m.indexOf('fs.rmSync('));
    assert.match(m, /s\.projetsDeplaces = plan\.annonce;/);
  });
  test('l\'installeur déplace l\'ancien dossier AVANT de désinstaller, vers le même endroit que l\'application', () => {
    const nsh = lire('build/installer.nsh');
    assert.match(nsh, /!macro customInit/);
    assert.match(nsh, /\$\{If\} \$\{FileExists\} "\$INSTDIR\\Projets\\\*\.\*"/);
    assert.match(nsh, /StrCpy \$R9 "\$DOCUMENTS\\\$\{PRODUCT_NAME\}\\Projets"/);
    assert.ok(nsh.includes(`"$DOCUMENTS\\\${PRODUCT_NAME}\\${DOSSIER_RECUPERE}"`), 'même nom de repli que projects-dir.js');
    const copie = nsh.slice(nsh.indexOf('CopyFiles'));
    assert.ok(copie.indexOf('${IfNot} ${Errors}') < copie.indexOf('RMDir /r'));
    assert.ok(!/[^\x00-\x7F]/.test(sans(nsh)), 'le code NSIS reste en ASCII');
  });
  test('le renderer annonce le déménagement une fois, puis l\'oublie', () => {
    const ev = lire('src/events.js');
    const a = ev.slice(ev.indexOf('reglagesLus.projetsDeplaces.vers'));
    assert.ok(a.indexOf('alertAction(') < a.indexOf("setSetting('projetsDeplaces', null)"));
  });
  test('le module voyage avec l\'application', () => {
    const pkg = JSON.parse(lire('package.json'));
    assert.ok(pkg.build.files.includes('projects-dir.js'));
  });
});
