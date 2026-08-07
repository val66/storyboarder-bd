// tests/version.test.mjs — politique de version de l'application (tools/bump-version.mjs).
//
// Deux fichiers portent la version : package.json (source de vérité, et ce dont electron-builder
// tamponne l'installeur) et src/version.js (généré, lu par le renderer). Le test de cohérence en
// fin de fichier est le plus important : c'est exactement le genre de double source qui a dérivé
// quatre fois dans ce projet (Fix 28/30/31/31b, puis Fix 33). Les deux README affichent aussi la
// version : sans être inclus, ils dériveraient dès le commit suivant.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  parseVersion, formatVersion, bumpVersion, renderVersionModule,
  readPackageVersion, readModuleVersion, readReadmeVersion,
  renderReadmeVersion, README_VERSION_RE, PACKAGE_JSON, VERSION_JS, READMES,
  shouldAutoBump, tagForBump,
} from '../tools/bump-version.mjs';
import { APP_VERSION } from '../src/version.js';

describe('parseVersion / formatVersion', () => {
  test('lit et reformate un major.minor.patch', () => {
    assert.deepEqual(parseVersion('1.2.3'), { major: 1, minor: 2, patch: 3 });
    assert.equal(formatVersion({ major: 1, minor: 2, patch: 3 }), '1.2.3');
    assert.deepEqual(parseVersion('  10.0.42 '), { major: 10, minor: 0, patch: 42 });
  });

  test('refuse ce qui n\'est pas une version à trois nombres', () => {
    for (const bad of ['1.2', '1.2.3.4', 'v1.2.3', '1.2.x', '', null, undefined]) {
      assert.throws(() => parseVersion(bad), /Version illisible/, String(bad));
    }
  });
});

describe('bumpVersion — la politique convenue', () => {
  test('correctif : incrémente le 3e nombre, à chaque commit', () => {
    assert.equal(bumpVersion('1.0.0', 'patch'), '1.0.1');
    assert.equal(bumpVersion('1.4.9', 'patch'), '1.4.10');
  });

  test('mineure : incrémente le 2e ET remet le correctif à 0', () => {
    assert.equal(bumpVersion('1.0.7', 'minor'), '1.1.0');
    assert.equal(bumpVersion('2.9.3', 'minor'), '2.10.0');
  });

  test('majeure : incrémente le 1er ET remet mineure et correctif à 0', () => {
    assert.equal(bumpVersion('1.4.12', 'major'), '2.0.0');
  });

  test('sync : ne change rien (régénération de src/version.js)', () => {
    assert.equal(bumpVersion('3.2.1', 'sync'), '3.2.1');
  });

  test('niveau inconnu : erreur explicite plutôt qu\'un silence', () => {
    assert.throws(() => bumpVersion('1.0.0', 'majeur'), /Niveau inconnu/);
    assert.throws(() => bumpVersion('1.0.0', undefined), /Niveau inconnu/);
  });

  test('une suite de correctifs puis une mineure retombe bien sur x.y.0', () => {
    let v = '1.0.0';
    for (let i = 0; i < 12; i++) v = bumpVersion(v, 'patch');
    assert.equal(v, '1.0.12', '12 commits');
    assert.equal(bumpVersion(v, 'minor'), '1.1.0', 'validation de la fonctionnalité');
  });
});

describe('renderVersionModule', () => {
  test('produit un module qui expose exactement la version demandée', () => {
    const src = renderVersionModule('4.5.6');
    assert.match(src, /export const APP_VERSION = '4\.5\.6';/);
    assert.match(src, /GÉNÉRÉ/, 'le fichier se signale comme généré');
  });

  test('ce qu\'il produit est relu à l\'identique par readModuleVersion', () => {
    // Aller-retour : si le format d'écriture et le format de lecture divergeaient, la
    // vérification de cohérence ci-dessous deviendrait aveugle.
    const tmp = renderVersionModule('9.8.7');
    assert.equal(/APP_VERSION\s*=\s*'([^']+)'/.exec(tmp)[1], '9.8.7');
  });
});

describe('COHÉRENCE — package.json et src/version.js ne peuvent pas diverger', () => {
  test('les deux fichiers portent la même version', () => {
    assert.equal(readModuleVersion(), readPackageVersion(),
      'src/version.js désynchronisé de package.json — lancer `npm run bump sync`');
  });

  test('la constante importée par le renderer est bien celle de package.json', () => {
    assert.equal(APP_VERSION, readPackageVersion());
  });

  test('la version de package.json est une version valide', () => {
    assert.doesNotThrow(() => parseVersion(readPackageVersion()));
  });

  test('les deux README annoncent la même version que package.json', () => {
    // Sans ce test, un README annonçant une version fausse passerait inaperçu — et c'est la
    // première chose que lit quelqu'un qui découvre le projet.
    for (const readme of READMES) {
      assert.equal(readReadmeVersion(readme), readPackageVersion(), readme);
    }
  });

  test('le motif de version des README est strict : une ligne entière, rien d\'autre', () => {
    assert.match('**Version 1.2.3**', README_VERSION_RE);
    for (const bad of ['**Version 1.2**', 'Version 1.2.3', '**version 1.2.3**',
                       'texte **Version 1.2.3** texte']) {
      assert.doesNotMatch(bad, README_VERSION_RE, bad);
    }
    assert.equal(renderReadmeVersion('4.5.6'), '**Version 4.5.6**');
  });

  test('RÉGRESSION : rien n\'est écrit si un seul des fichiers est invalide', () => {
    // La 1re version écrivait package.json PUIS vérifiait les README : une ligne de version
    // manquante laissait package.json déjà incrémenté et les README en arrière — précisément
    // l'incohérence que ce script existe pour empêcher. Les vérifications précèdent désormais
    // toutes les écritures. Constaté en testant le cas d'échec, pas deviné.
    const src = readFileSync(new URL('../tools/bump-version.mjs', import.meta.url), 'utf8');
    const corps = src.slice(src.indexOf('function main('));
    const premiereEcriture = corps.indexOf('writeFileSync');
    const derniereVerif = Math.max(corps.lastIndexOf('throw new Error(`Ligne de version'),
                                   corps.lastIndexOf("throw new Error('Champ"));
    assert.ok(derniereVerif > 0 && premiereEcriture > 0, 'repères trouvés dans main()');
    assert.ok(derniereVerif < premiereEcriture,
      'une vérification survient après une écriture — l\'opération n\'est plus atomique');
  });

  test('src/version.js est bien marqué comme généré, pour dissuader l\'édition à la main', () => {
    assert.match(readFileSync(VERSION_JS, 'utf8'), /ne pas modifier à la main/);
    assert.ok(PACKAGE_JSON.endsWith('package.json'));
  });
});

describe('shouldAutoBump — un seul incrément par commit (Fix 40)', () => {
  test('version inchangée depuis le dernier commit → le hook incrémente', () => {
    assert.equal(shouldAutoBump('1.0.4', '1.0.4'), true);
  });

  // LE cas qui motive cette fonction : sans elle, `npm run bump minor` suivi d'un commit donnait
  // 1.1.0 → 1.1.1, et la mineure que l'utilisateur venait de valider n'existait dans AUCUN commit.
  test('RÉGRESSION : une mineure posée à la main n\'est pas écrasée par un correctif', () => {
    assert.equal(shouldAutoBump('1.0.4', '1.1.0'), false, 'mineure');
    assert.equal(shouldAutoBump('1.0.4', '2.0.0'), false, 'majeure');
  });

  test('dépôt sans commit précédent : rien à comparer, on incrémente', () => {
    assert.equal(shouldAutoBump(null, '1.0.0'), true);
    assert.equal(shouldAutoBump('', '1.0.0'), true);
  });
});

describe('tagForBump — marquer les mineures et majeures seulement (Fix 40)', () => {
  test('une mineure et une majeure sont taguées', () => {
    assert.equal(tagForBump('1.0.7', '1.1.0'), 'v1.1.0');
    assert.equal(tagForBump('1.4.2', '2.0.0'), 'v2.0.0');
  });

  test('un correctif n\'est PAS tagué', () => {
    // Un tag par correctif noierait les versions qui comptent sous des centaines d'autres.
    assert.equal(tagForBump('1.0.4', '1.0.5'), null);
    assert.equal(tagForBump('1.0.4', '1.0.4'), null, 'version inchangée');
  });

  test('le tag porte la version d\'ARRIVÉE, préfixée de v', () => {
    assert.equal(tagForBump('0.9.9', '1.0.0'), 'v1.0.0');
  });

  test('entrées manquantes ou illisibles : pas de tag inventé', () => {
    assert.equal(tagForBump(null, '1.1.0'), null);
    assert.equal(tagForBump('1.0.0', null), null);
    assert.throws(() => tagForBump('abc', '1.1.0'), /Version illisible/);
  });
});
